// Quién lleva cada apartado COMÚN del documento: los que no son de un módulo y que edita la
// jefatura del departamento, cuando requieren colaboración.
//
//   GET /api/documentos/[id]/asignaciones                 los apartados que se pueden asignar, quién lleva
//                                                         cada uno, las personas que pueden llevarlos y lo
//                                                         que puede editar quien pregunta
//   PUT /api/documentos/[id]/asignaciones?seccion=        la lista completa de quién lleva ese apartado
//
// El permiso ya existía como regla (`reglaEdicion` con `tieneApartadoAsignado` sobre
// `documento.asignaciones`) y faltaba el modo de darlo. El porqué de la forma —lista completa, 404 por
// otro departamento, solo los apartados de la jefatura— está en docs/api.md.
//
// `seccion` va en la consulta y no en la ruta porque los ids de apartado llevan barras
// («evaluacion/criterios»), igual que en /apartado y en /estructura.
//
// EL ID DE USUARIO SE LEE CON `idDeUsuario`, que es la única forma (core/permisos.js): lo que se
// guarda en `asignaciones` es lo mismo que compara `puedeEditarApartado` en comun.js.

'use strict';

const C = require('../../../core/permisos');
const { SIN_PERMISO } = require('../usuario');
const {
  fallo, malaPeticion, noEncontrado, conErrores, abrirDocumento,
} = require('./comun');
const { personasQueDanClase } = require('./unidades');

const puedeAsignar = (usuario, documento) => C.puedeAsignarApartados(usuario, documento);

// Los apartados de la plantilla (ya sin los retirados: `abrirDocumento` la poda) que se pueden
// asignar: los que edita la jefatura —el `edita` se hereda del bloque— y que no son un módulo ni el
// bloque que los reparte. Es lo único delegable: los módulos se reparten por unidad y no hay otro
// valor de `edita` que la regla deje en manos de alguien que no sea la jefatura.
function apartadosAsignables(plantilla) {
  const out = [];
  const bajar = (lista, edita, nivel) => {
    for (const s of lista || []) {
      if (s.instancias) continue;
      const hereda = s.edita || edita;
      if (hereda === 'jefe_departamento') out.push({ seccion: s.id, titulo: s.titulo, nivel });
      bajar(s.hijos, hereda, nivel + 1);
    }
  };
  bajar((plantilla && plantilla.secciones) || [], null, 1);
  return out;
}

const idsGuardados = (documento, seccion) => {
  const lista = (documento.asignaciones || {})[seccion];
  return Array.isArray(lista) ? lista.map(String) : [];
};

// ---------------------------------------------------------------- GET

const GET = conErrores(async (peticion, parametros) => {
  const { fallo: noPasa, usuario, documento, repo } = await abrirDocumento(peticion, parametros);
  if (noPasa) return noPasa;

  const personas = await personasQueDanClase(repo, documento);
  const columnas = new Set(personas.map((p) => C.idDeUsuario(p)));
  const asignables = apartadosAsignables(documento.plantilla);

  // Solo cuentan las personas que siguen siendo válidas: una dada de baja o trasladada no lleva el
  // apartado, y si contara parecería repartido y no lo estaría.
  const apartados = asignables.map((a) => ({
    ...a,
    personas: idsGuardados(documento, a.seccion).filter((id) => columnas.has(id)),
  }));

  const yo = C.idDeUsuario(usuario);
  const unidades = await repo.unidades.listar(documento._id);
  const mios = {
    // La jefatura del departamento y el soporte editan todo; la jefatura de estudios nada.
    editaTodo: usuario.rol === 'admin' || usuario.rol === 'jefe_departamento',
    soloLectura: usuario.rol === 'jefe_estudios',
    unidades: unidades
      .filter((u) => (u.docentes || []).map(String).includes(yo))
      .map((u) => ({ unidadId: u.unidadId, titulo: u.titulo })),
    apartados: apartados
      .filter((a) => a.personas.includes(yo))
      .map((a) => ({ seccion: a.seccion, titulo: a.titulo })),
  };

  return Response.json({
    documentoId: documento._id,
    apartados,
    personas: personas.map((p) => ({ _id: C.idDeUsuario(p), nombre: p.nombre, rol: p.rol })),
    resumen: {
      apartados: apartados.length,
      conPersonas: apartados.filter((a) => a.personas.length > 0).length,
    },
    puedeAsignar: puedeAsignar(usuario, documento),
    mios,
  }, { headers: { 'Cache-Control': 'no-store' } });
});

// ---------------------------------------------------------------- PUT

// Orden de las comprobaciones, igual que en el reparto de unidades:
//   401 sin sesión · 404 documento ajeno, o apartado que no existe o no se puede asignar ·
//   403 lo ves pero no asignas · 400 cuerpo o personas mal.
const PUT = conErrores(async (peticion, parametros) => {
  const { fallo: noPasa, usuario, documento, repo } = await abrirDocumento(peticion, parametros);
  if (noPasa) return noPasa;

  if (!puedeAsignar(usuario, documento)) {
    return SIN_PERMISO('Solo la jefatura del departamento y soporte asignan los apartados comunes.');
  }

  const seccion = new URL(peticion.url).searchParams.get('seccion');
  const apartado = seccion && apartadosAsignables(documento.plantilla).find((a) => a.seccion === seccion);
  if (!apartado) {
    return noEncontrado(`Este documento no tiene ningún apartado común asignable «${seccion || ''}».`);
  }

  let cuerpo = null;
  try {
    cuerpo = await peticion.json();
  } catch (e) {
    return malaPeticion('El cuerpo tiene que ser JSON: { "personas": [ids] }.');
  }
  const personas = cuerpo && cuerpo.personas;
  if (!Array.isArray(personas)) {
    return malaPeticion('Falta «personas»: la lista completa de quién lleva el apartado, aunque esté vacía.');
  }
  if (!personas.every((id) => typeof id === 'string' && id !== '')) {
    return malaPeticion('Cada persona tiene que ser el identificador de una persona (una cadena).');
  }
  if (new Set(personas).size !== personas.length) {
    return malaPeticion('Hay alguna persona repetida en la lista.');
  }

  const validas = new Set((await personasQueDanClase(repo, documento)).map((p) => C.idDeUsuario(p)));
  const invalidos = personas.filter((id) => !validas.has(id));
  if (invalidos.length) {
    return fallo(
      400,
      'peticion',
      'Hay personas que no pueden llevar este apartado: no existen, están desactivadas, son de otro departamento o no dan clase. No se ha guardado nada.',
      { invalidos },
    );
  }

  // Se reescribe el mapa entero del documento: si otra escritura lo mueve en medio, se relee y se
  // reaplica este apartado sobre lo nuevo, para no deshacer la asignación de otro apartado.
  let actual = documento;
  for (let intento = 0; intento < 3; intento += 1) {
    const asignaciones = { ...(actual.asignaciones || {}) };
    if (personas.length) asignaciones[seccion] = personas;
    else delete asignaciones[seccion];
    try {
      await repo.documentos.actualizar(documento._id, { asignaciones }, { esperaUpdatedAt: actual.updatedAt });
      return Response.json({
        documentoId: documento._id,
        seccion,
        titulo: apartado.titulo,
        personas,
      }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (e) {
      if (!e || e.codigo !== 'conflicto') throw e;
      actual = await repo.documentos.obtener(documento._id);
      if (!actual) return noEncontrado('El documento ya no existe.');
    }
  }
  return fallo(409, 'conflicto', 'El documento no deja de cambiar: vuelve a intentarlo.');
});

module.exports = { GET, PUT, apartadosAsignables };
