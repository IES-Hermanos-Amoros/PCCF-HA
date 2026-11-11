// El reparto de unidades al profesorado: quién lleva cada módulo de un documento.
//
//   GET /api/documentos/[id]/unidades                       el reparto y el recuento de sin nadie
//   PUT /api/documentos/[id]/unidades/[unidad]/docentes     la lista completa de quién lleva la unidad
//
// Es el aviso nº 2 de docs/interfaz-web.md §5. El importador crea cada módulo con `docentes: []`, y
// core/permisos.js dice que un apartado de módulo lo edita quien lo lleva: con la lista vacía nadie
// puede tocar ningún módulo salvo la jefatura. Esto es lo que lo cierra.
//
// LA PREGUNTA DE LA PANTALLA ES «QUÉ MÓDULO NO TIENE A NADIE»
//
// Una unidad sin docentes no la puede editar nadie, así que el recuento de `sinDocentes` es lo que
// de verdad hay que mirar. Por eso el GET lo sirve ya contado: la interfaz no tiene que recorrer la
// matriz para saberlo, y el número no puede discrepar de la lista.
//
// LA LISTA COMPLETA, NO UNA OPERACIÓN INCREMENTAL
//
// El cambio manda «quién lleva esta unidad ahora», no «añade a este». Dos personas repartiendo a la
// vez con operaciones incrementales acaban con un reparto que no quiso ninguna de las dos; con la
// lista completa, lo último que se guarda es lo que se ve. Si dos jefaturas guardan a la vez, gana la
// última escritura: es aceptable para un reparto que cambia una vez al curso.
//
// QUIÉN REPARTE, Y QUIÉN PUEDE VER EL REPARTO
//
// Repartir: `admin` y la jefatura del departamento del documento. La jefatura de estudios ve todos
// los departamentos pero no edita nada (core/permisos.js), así que tampoco reparte. Un docente no.
//
// Ver el reparto: cualquiera que pueda ver el documento. Un docente necesita saber quién más lleva
// su módulo, y el reparto no es secreto dentro del departamento (la lista de personas ya sale en
// GET /api/personas). Lo que sí se decide por rol es el botón, y eso viaja como `puedeRepartir`
// solo para pintarlo: quien decide es el PUT.
//
// QUIÉN PUEDE LLEVAR UNA UNIDAD
//
// Solo personas que existen, están activas, son del mismo departamento que el documento y dan clase
// (rol `docente` o `jefe_departamento`). Lo demás da 400 y no se guarda nada.
//
// - Un id inventado tiene que dar 400, no guardarse: un docente fantasma en la lista es una unidad
//   que parece repartida y no lo está.
// - La jefatura de estudios no da clase, y el admin es coordinación técnica: aunque existan y sean
//   del departamento, asignarles una unidad no les daría permiso para editarla.
//
// Se comprueba todo antes de escribir. Una lista con una persona válida y otra inventada no guarda
// la válida: o se guarda el reparto entero, o nada.
//
// `unidad` es siempre el id estable del catálogo (docs/api.md), nunca un índice ni un título.

'use strict';

const C = require('../../../core/permisos');
const { esActiva } = require('../../../core/versiones');
const { SIN_PERMISO } = require('../usuario');
const {
  fallo, malaPeticion, noEncontrado, conErrores, abrirDocumento,
} = require('./comun');

// Quién puede dar clase de una unidad. Es un conjunto cerrado a propósito: un rol nuevo no entra en
// los repartos hasta que alguien decida que da clase.
const ROLES_QUE_DAN_CLASE = ['docente', 'jefe_departamento'];

// Quién reparte. La pertenencia al departamento ya la comprueba `puedeVer`, que es lo primero que
// hace `abrirDocumento`, así que aquí basta con mirar el rol.
// La regla vive en core/permisos.js, con las demás.
const puedeRepartir = (usuario, documento) => esActiva(documento) && C.puedeRepartirUnidades(usuario, documento);

// Una persona está activa salvo que se la haya marcado como desactivada. `activo` es un campo del
// repositorio desde el E2, y lo pone la gestión de personas; ausente significa activa.
const estaActiva = (persona) => persona.activo !== false;

// Las personas que pueden llevar una unidad de este documento: del departamento del documento, que
// den clase y estén activas. Es la misma lista para la matriz y para validar la escritura, así que
// lo que se muestra como columna es exactamente lo que se acepta.
//
// Sin departamento no hay a quién listar: `listar({ departamento: undefined })` no filtraría nada y
// devolvería a todo el mundo. Por eso el caso se corta aquí.
async function personasQueDanClase(repo, documento) {
  if (!documento.departamento) return [];
  const delDepartamento = await repo.usuarios.listar({ departamento: documento.departamento });
  return delDepartamento
    .filter((p) => ROLES_QUE_DAN_CLASE.includes(p.rol) && estaActiva(p))
    .sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'));
}

const aPersona = (p) => ({ _id: p._id, nombre: p.nombre, rol: p.rol });

// ---------------------------------------------------------------- GET: el reparto

const GET = conErrores(async (peticion, parametros) => {
  const { fallo: noPasa, usuario, documento, repo } = await abrirDocumento(peticion, parametros);
  if (noPasa) return noPasa;

  const unidades = await repo.unidades.listar(documento._id);
  const personas = await personasQueDanClase(repo, documento);
  const columnas = new Set(personas.map((p) => p._id));

  // Solo cuentan los docentes que son columna. Un id guardado de alguien que ya no es válido (dado
  // de baja, o de otro departamento tras un traslado) no lleva la unidad: si contara, la unidad
  // parecería repartida y nadie podría editarla.
  const lista = unidades.map((u) => {
    const docentes = (u.docentes || []).filter((id) => columnas.has(id));
    return {
      unidadId: u.unidadId,
      titulo: u.titulo,
      num: u.num,
      grupo: u.grupo,
      docentes,
      sinDocentes: docentes.length === 0,
    };
  });

  return Response.json({
    documentoId: documento._id,
    unidades: lista,
    personas: personas.map(aPersona),
    resumen: {
      unidades: lista.length,
      sinDocentes: lista.filter((u) => u.sinDocentes).length,
    },
    puedeRepartir: puedeRepartir(usuario, documento),
  }, { headers: { 'Cache-Control': 'no-store' } });
});

// ---------------------------------------------------------------- PUT: quién lleva la unidad

// El orden de las comprobaciones importa, porque cada una dice algo distinto:
//   401  no sé quién eres (lo resuelve abrirDocumento)
//   404  no existe, o es de otro departamento (lo resuelve abrirDocumento), o no existe esa unidad
//   403  lo ves, pero no puedes repartir
//   400  la petición está mal, o alguna persona no puede llevar la unidad
// Así un docente que escribe a un documento ajeno recibe 404, igual que al leerlo.
const PUT = conErrores(async (peticion, parametros) => {
  const { fallo: noPasa, usuario, documento, repo } = await abrirDocumento(peticion, parametros);
  if (noPasa) return noPasa;

  if (!puedeRepartir(usuario, documento)) {
    return SIN_PERMISO('Solo la jefatura del departamento y soporte reparten las unidades.');
  }

  const unidadId = parametros && parametros.unidad;
  let unidad = null;
  try {
    unidad = await repo.unidades.obtener(documento._id, unidadId);
  } catch (e) {
    unidad = null;
  }
  if (!unidad) return noEncontrado(`Este documento no tiene ninguna unidad «${unidadId}».`);

  let cuerpo = null;
  try {
    cuerpo = await peticion.json();
  } catch (e) {
    return malaPeticion('El cuerpo tiene que ser JSON: { "docentes": [ids] }.');
  }

  // La lista completa, aunque esté vacía: que falte no es «ninguno», es un error de quien llama.
  const docentes = cuerpo && cuerpo.docentes;
  if (!Array.isArray(docentes)) {
    return malaPeticion('Falta «docentes»: la lista completa de quién lleva la unidad, aunque esté vacía.');
  }
  if (!docentes.every((id) => typeof id === 'string' && id !== '')) {
    return malaPeticion('Cada docente tiene que ser el identificador de una persona (una cadena).');
  }
  if (new Set(docentes).size !== docentes.length) {
    return malaPeticion('Hay alguna persona repetida en la lista.');
  }

  const validas = new Set((await personasQueDanClase(repo, documento)).map((p) => p._id));
  const invalidos = docentes.filter((id) => !validas.has(id));
  if (invalidos.length) {
    return fallo(
      400,
      'peticion',
      'Hay personas que no pueden llevar esta unidad: no existen, están desactivadas, son de otro departamento o no dan clase. No se ha guardado nada.',
      { invalidos },
    );
  }

  await repo.unidades.actualizar(documento._id, unidad.unidadId, { docentes });

  return Response.json({
    documentoId: documento._id,
    unidadId: unidad.unidadId,
    titulo: unidad.titulo,
    docentes,
    sinDocentes: docentes.length === 0,
  }, { headers: { 'Cache-Control': 'no-store' } });
});

module.exports = { GET, PUT, puedeRepartir, personasQueDanClase };
