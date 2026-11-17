// Las filas de apartado que se quedaron HUÉRFANAS: las de un apartado que un módulo se creó y que ya
// no existe en la estructura de ningún módulo.
//
// POR QUÉ ESTO NO VA EN `estado-base.js`. La huella de allí se calcula solo por la API, a propósito, y
// por la API esto NO SE VE: un apartado que ya no está en ninguna estructura no sale en el árbol ni en
// ninguna ruta, así que su fila es invisible. Hace falta mirar la base directamente, y eso solo lo
// pueden hacer la comprobación de entrada y el script de limpiar, que son Node a secas.
//
// POR QUÉ IMPORTA. Costó veinte minutos de depuración: una prueba dejó una de estas filas, y la
// siguiente ejecución falló en OTRA prueba —retirar un apartado de un módulo— por un motivo que no era
// suyo. Es exactamente la avería que la red contra fugas venía a impedir, por el único hueco que le
// quedaba.
//
// LO QUE SE PUEDE BORRAR Y LO QUE NO. Solo las que NO tienen nada escrito. Una fila huérfana CON
// contenido es la pregunta de diseño que `docs/estructura-por-modulo.md` deja abierta —qué pasa con lo
// escrito en algo que desaparece— y una herramienta de pruebas no la decide: se nombra y se deja.

'use strict';

const URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const BD = process.env.MONGODB_DB || 'pccf';

// Un id de apartado propio de un módulo lleva un tramo que empieza por `m_` (core/estructura-modulo.js).
const esDeModulo = (seccion) => String(seccion || '').split('/').some((t) => t.startsWith('m_'));

const sinEscribir = (valores) => Object.values(valores || {})
  .every((v) => (Array.isArray(v) ? v.length === 0 : v === null || v === undefined || v === ''));

// Los ids de apartado propio que una unidad declara hoy, retirados incluidos.
function declarados(unidad) {
  const e = unidad && unidad.estructura;
  const lista = e && e.apartados && Array.isArray(e.apartados.anadidos) ? e.apartados.anadidos : [];
  return new Set(lista.map((a) => a && a.id).filter(Boolean));
}

// `[{ id, documentoId, unidadId, seccion, escrito }]`, de más a menos grave: las que llevan algo escrito
// primero. Devuelve [] si no se puede abrir la base, para no convertir «no hay Mongo» en un fallo.
async function huerfanos() {
  let MongoClient;
  try {
    ({ MongoClient } = require('mongodb'));
  } catch (e) {
    return [];
  }
  let cli = null;
  try {
    cli = await MongoClient.connect(URI, { serverSelectionTimeoutMS: 2000 });
    const bd = cli.db(BD);
    const filas = await bd.collection('apartados').find({}).toArray();
    const candidatas = filas.filter((f) => esDeModulo(f.seccion));
    if (!candidatas.length) return [];
    const unidades = await bd.collection('unidades').find({}).toArray();
    const porClave = new Map(unidades.map((u) => [`${u.documentoId}·${u.unidadId}`, u]));
    const out = [];
    for (const f of candidatas) {
      const unidad = porClave.get(`${f.documentoId}·${f.unidadId}`);
      if (unidad && declarados(unidad).has(f.seccion)) continue;
      out.push({
        id: String(f._id),
        documentoId: String(f.documentoId),
        unidadId: f.unidadId,
        seccion: f.seccion,
        escrito: !sinEscribir(f.valores),
      });
    }
    return out.sort((a, b) => Number(b.escrito) - Number(a.escrito));
  } finally {
    if (cli) await cli.close();
  }
}

const describir = (lista) => lista.map((h) => `fila de apartado huérfana: ${h.unidadId} · ${h.seccion}`
  + (h.escrito ? '  (TIENE CONTENIDO ESCRITO: no se borra sola)' : ''));

// Borra solo las que no tienen nada escrito. Devuelve `{ borradas, conContenido }`.
async function borrarVacios() {
  const lista = await huerfanos();
  const vacias = lista.filter((h) => !h.escrito);
  const conContenido = lista.filter((h) => h.escrito);
  if (!vacias.length) return { borradas: [], conContenido };
  const { MongoClient } = require('mongodb');
  const cli = await MongoClient.connect(URI, { serverSelectionTimeoutMS: 2000 });
  try {
    const bd = cli.db(BD);
    const { ObjectId } = require('mongodb');
    const ids = vacias.map((h) => { try { return new ObjectId(h.id); } catch (e) { return h.id; } });
    await bd.collection('apartados').deleteMany({ _id: { $in: ids } });
  } finally {
    await cli.close();
  }
  return { borradas: vacias, conContenido };
}

module.exports = { huerfanos, describir, borrarVacios };
