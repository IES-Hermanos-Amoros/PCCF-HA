// GET /api/documentos/[id]/apartado?seccion=&unidad= — una rama del documento.
//
// La otra mitad de la segunda regla de forma de docs/api.md: el árbol es una cosa y el contenido de
// un apartado es otra. Esta es la petición que se hace al pinchar en la barra lateral, y la que el
// E3 convertirá en PATCH para guardar.
//
// QUÉ DEVUELVE ADEMÁS DE LOS VALORES
//
//   puedeEditar  para que el cliente pinte el candado sin tener que deducirlo (y sin que se le
//                mande con qué deducirlo: las asignaciones y los docentes no salen de aquí)
//   campos       los campos de la plantilla para esta sección. Sin ellos el cliente no puede pintar
//                `valores`: un `{ pares: [...] }` se dibuja como una tabla de clave y valor y un
//                `{ ra: [...] }` como la tabla de RA y CE, y quién es quién lo dice la plantilla.
//                Como ninguna ruta manda la plantilla entera, viaja aquí, recortada a esta rama
//   compartidos  los textos compartidos a los que apunta este apartado, y solo esos. Un `{ ref: 'c001' }`
//                sin su bloque es un hueco que el cliente no puede pintar, y en el E1 no hay ninguna
//                otra ruta por la que pedirlos
//
// UN APARTADO SIN ESCRIBIR NO ES UN 404
//
// El importador solo crea filas de los apartados que el Word traía con algo dentro. Una sección que
// está en la plantilla y que nadie ha escrito todavía existe —es parte del documento, sale en el
// árbol y hay que poder abrirla para escribir en ella—, así que se devuelve con `valores: {}` y
// `existe: false`. El 404 se reserva para lo que de verdad no está: una sección que no es de este
// documento, o una unidad que no lo es.

'use strict';

const { listasDeTexto } = require('../../../motor/compartidos');
const {
  conErrores, abrirDocumento, puedeEditarApartado, buscarSeccion, malaPeticion, noEncontrado,
} = require('./comun');

// Los ids de los textos compartidos a los que apunta este apartado. `listasDeTexto` recorre las
// listas de bloques de texto de unos valores, también las que están dentro de ítems repetidos, que
// es donde el importador deja las referencias.
function refsDe(seccion, valores) {
  const ids = new Set();
  listasDeTexto({ [seccion]: valores || {} }, (lista) => {
    for (const bloque of lista) {
      if (bloque && typeof bloque === 'object' && typeof bloque.ref === 'string') ids.add(bloque.ref);
    }
  });
  return ids;
}

const GET = conErrores(async (peticion, parametros) => {
  const { fallo, usuario, documento, repo } = await abrirDocumento(peticion, parametros);
  if (fallo) return fallo;

  const url = new URL(peticion.url);
  const seccion = url.searchParams.get('seccion');
  const unidadId = url.searchParams.get('unidad') || null;

  if (!seccion) return malaPeticion('Falta el parámetro «seccion».');

  const info = buscarSeccion(documento.plantilla, seccion);
  if (!info) return noEncontrado(`Este documento no tiene ningún apartado «${seccion}».`);

  // Pedir un apartado de módulo sin decir de qué módulo, o un apartado común diciendo de qué
  // módulo, es un enlace mal construido. Se dice en voz alta en lugar de devolver un apartado vacío,
  // que es lo que pasaría si se dejara pasar: la misma pantalla que un apartado sin escribir, y
  // nadie entendería por qué sale vacío lo que en el PDF tiene tres párrafos.
  if (info.deUnidad && !unidadId) {
    return malaPeticion(`El apartado «${seccion}» es de una unidad: falta el parámetro «unidad».`);
  }
  if (!info.deUnidad && unidadId) {
    return malaPeticion(`El apartado «${seccion}» es común al documento y no admite «unidad».`);
  }

  let unidad = null;
  if (unidadId) {
    unidad = await repo.unidades.obtener(documento._id, unidadId);
    if (!unidad) return noEncontrado(`Este documento no tiene ninguna unidad «${unidadId}».`);
  }

  const fila = await repo.apartados.leer(documento._id, seccion, unidadId);
  const valores = (fila && fila.valores) || {};

  // Solo los compartidos a los que apunta este apartado, y solo si apunta a alguno: la PD real tiene
  // 40 textos compartidos y mandarlos todos en cada apartado sería traerse el documento a trozos.
  const refs = refsDe(seccion, valores);
  const compartidos = {};
  if (refs.size) {
    for (const c of await repo.compartidos.listar(documento._id)) {
      if (!refs.has(c.cid)) continue;
      compartidos[c.cid] = {
        cid: c.cid, bloque: c.bloque, seccion: c.seccion, comun: c.comun,
        responsable: c.responsable, modo: c.modo, version: c.version,
      };
    }
  }

  return Response.json({
    documentoId: documento._id,
    seccion,
    unidadId,
    titulo: info.seccion.titulo,
    campos: info.campos,
    contenido: info.campos.length > 0,
    repetidor: !!info.seccion.repetidor,
    edita: info.edita,
    puedeEditar: puedeEditarApartado({
      usuario, documento, unidad, seccion, edita: info.edita, contenido: info.campos.length > 0,
    }),
    existe: !!fila,
    valores,
    origen: fila ? fila.origen : null,
    // El token de concurrencia del E3: es la versión que el cliente tendrá que devolver en el PATCH
    // para que el servidor sepa que no ha escrito nadie por medio (docs/api.md, `esperaUpdatedAt`).
    updatedAt: fila ? fila.updatedAt : null,
    revisadoPor: fila ? fila.revisadoPor : null,
    revisadoEn: fila ? fila.revisadoEn : null,
    compartidos,
  }, { headers: { 'Cache-Control': 'no-store' } });
});

module.exports = { GET };
