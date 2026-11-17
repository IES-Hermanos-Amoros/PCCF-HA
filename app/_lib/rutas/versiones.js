// Las versiones de un documento: listarlas, activar una y borrar una alternativa (docs/plan.md §8).
//
//   GET    /api/documentos/[id]/versiones   todas las versiones del grupo de [id], activa o no
//   POST   /api/documentos/[id]/activar     [id] pasa a ser la versión activa
//   DELETE /api/documentos/[id]             borra la alternativa [id]; pide { confirmar: true }
//
// Subir una versión alternativa no tiene ruta propia: es POST /api/documentos/importar, que detecta que
// ya hay documento.
//
// EL REPARTO DE ERRORES, el de siempre (docs/api.md): 404 si no lo ves; 403 si lo ves y no puedes. Después
// de eso, 409 `version_activa` al borrar la activa (o activar la que ya lo es) y 400 si falta la
// confirmación.
//
// ACTIVAR ES UN INTERCAMBIO DE DOS ESCRITURAS Y NO HAY TRANSACCIÓN. Se desactiva primero la que estaba
// activa y se activa después la elegida: si la segunda falla se vuelve a activar la primera, y en el peor
// caso —que también falle eso— el grupo se queda sin activa en lugar de con dos, que es el fallo que
// duplicaría lo que se lista. Con `esperaUpdatedAt` en la elegida, dos jefaturas activando a la vez no se
// pisan. Nada se borra: la anterior conserva sus ediciones.

'use strict';

const C = require('../../../core/permisos');
const { esActiva, numeroDeVersion, versionesDe } = require('../../../core/versiones');
const { ErrorConflicto } = require('../../../repositorio');
const { SIN_PERMISO } = require('../usuario');
const {
  conErrores, abrirDocumento, sinPlantilla, leerJson, fallo, malaPeticion,
} = require('./comun');

const TOKEN = (d) => (d.updatedAt instanceof Date ? d.updatedAt.toISOString() : d.updatedAt);

async function versionesDelGrupo(repo, documento) {
  const { tipo, curso, departamento } = documento;
  return versionesDe(documento, await repo.documentos.listar({ tipo, curso, departamento }));
}

const GET = conErrores(async (peticion, parametros) => {
  const abierto = await abrirDocumento(peticion, parametros);
  if (abierto.fallo) return abierto.fallo;
  const { usuario, documento, repo } = abierto;

  const grupo = await versionesDelGrupo(repo, documento);

  // Quién subió cada una: solo el nombre. El correo no sale de /personas para quien no gestiona personas.
  const personas = new Map();
  for (const id of new Set(grupo.map((d) => d.subidoPor).filter(Boolean))) {
    let p = null;
    try { p = await repo.usuarios.obtener(id); } catch (e) { p = null; }
    if (p) personas.set(id, { _id: p._id, nombre: p.nombre });
  }

  const versiones = [];
  for (const d of grupo) {
    const copia = await repo.copias.info(d._id);
    versiones.push({
      _id: d._id,
      version: numeroDeVersion(d),
      activa: esActiva(d),
      origen: d.origen || null,
      estado: d.estado || null,
      creado: d.creado || null,
      updatedAt: TOKEN(d),
      subidoPor: d.subidoPor ? (personas.get(d.subidoPor) || { _id: d.subidoPor, nombre: null }) : null,
      copia: copia ? { nombre: copia.nombre, tamano: copia.tamano } : null,
      // Resuelto para quien pregunta: la pantalla refleja el candado y no vuelve a escribir las reglas.
      puedeActivar: !esActiva(d) && C.puedeActivarVersion(usuario, d),
      puedeBorrar: !esActiva(d) && C.puedeBorrarVersion(usuario, d),
    });
  }

  return Response.json({
    documentoId: documento._id,
    tipo: documento.tipo,
    ciclo: documento.ciclo || null,
    curso: documento.curso || null,
    departamento: documento.departamento,
    versiones,
    // Quién sube otra versión: los mismos roles que importan (POST /api/documentos/importar).
    puedeSubir: ['admin', 'jefe_departamento'].includes(usuario.rol)
      && (usuario.rol === 'admin' || usuario.departamento === documento.departamento),
  }, { headers: { 'Cache-Control': 'no-store' } });
});

const ACTIVAR = conErrores(async (peticion, parametros) => {
  const abierto = await abrirDocumento(peticion, parametros, { permiteAlternativa: true });
  if (abierto.fallo) return abierto.fallo;
  const { usuario, documento, repo } = abierto;

  if (!C.puedeActivarVersion(usuario, documento)) {
    return SIN_PERMISO('Solo la jefatura de departamento puede cambiar la versión activa.');
  }
  if (esActiva(documento)) {
    return fallo(409, 'version_activa', 'Esa versión ya es la activa. No se ha cambiado nada.', { documentoId: documento._id });
  }

  const grupo = await versionesDelGrupo(repo, documento);
  const anteriores = grupo.filter((d) => esActiva(d) && d._id !== documento._id);

  const escritos = [];
  try {
    for (const previa of anteriores) {
      await repo.documentos.actualizar(previa._id, { activa: false });
      escritos.push(previa);
    }
    await repo.documentos.actualizar(documento._id, { activa: true }, { esperaUpdatedAt: documento.updatedAt });
  } catch (e) {
    for (const previa of escritos) await repo.documentos.actualizar(previa._id, { activa: true }).catch(() => {});
    if (e instanceof ErrorConflicto) {
      return fallo(409, 'conflicto', 'Esa versión ha cambiado desde que la abriste. No se ha cambiado nada: vuelve a cargar la lista.',
        { esperado: e.esperado, actual: e.actual });
    }
    throw e;
  }

  const ahora = await repo.documentos.obtener(documento._id);
  return Response.json({
    documento: sinPlantilla(ahora),
    anteriores: anteriores.map((d) => d._id),
  }, { headers: { 'Cache-Control': 'no-store' } });
});

const BORRAR = conErrores(async (peticion, parametros) => {
  const abierto = await abrirDocumento(peticion, parametros, { permiteAlternativa: true });
  if (abierto.fallo) return abierto.fallo;
  const { usuario, documento, repo } = abierto;

  if (!C.puedeBorrarVersion(usuario, documento)) {
    return SIN_PERMISO('Solo la jefatura de departamento puede borrar una versión.');
  }
  if (esActiva(documento)) {
    return fallo(409, 'version_activa',
      'La versión activa no se borra. Activa otra versión primero.', { documentoId: documento._id });
  }

  const { fallo: falloCuerpo, cuerpo } = await leerJson(peticion);
  if (falloCuerpo) return falloCuerpo;
  if (cuerpo.confirmar !== true) {
    return malaPeticion('Borrar una versión no se puede deshacer: manda { "confirmar": true } para confirmarlo.');
  }

  const contenido = {
    apartados: (await repo.apartados.listar(documento._id)).length,
    copia: !!(await repo.copias.info(documento._id)),
  };
  await repo.documentos.borrar(documento._id);

  return Response.json({ borrada: documento._id, version: numeroDeVersion(documento), contenido },
    { headers: { 'Cache-Control': 'no-store' } });
});

module.exports = { GET, ACTIVAR, BORRAR };
