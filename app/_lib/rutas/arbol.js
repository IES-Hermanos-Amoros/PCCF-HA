// GET /api/documentos/[id]/arbol — el árbol de apartados y unidades, con el estado de cada nodo.
//
// Es lo que alimenta la barra lateral, y la única petición que hace la vista del documento al
// abrirse. El árbol lo monta core/arbol.js a partir de la plantilla importada y de las unidades del
// documento; aquí se añade lo único que core/ no puede saber porque no conoce al usuario: si quien
// pregunta puede editar cada nodo.
//
// POR QUÉ EL CANDADO LO DECIDE EL SERVIDOR
//
// Porque el cliente no tiene con qué decidirlo. Para resolver `reglaEdicion` hace falta saber si el
// usuario lleva la unidad y si tiene el apartado asignado, y eso está en las unidades y en las
// asignaciones del documento. Mandárselas al navegador para que las cruce sería mandar la mitad del
// modelo de permisos al sitio donde no se puede confiar en él, y el cliente «solo refleja el
// candado» (docs/plan.md §2.5). Con `puedeEditar` por nodo, la interfaz pinta y no deduce.
//
// Y NO LLEVA EL CONTENIDO
//
// 250 apartados × sus valores es el documento entero. De cada apartado sale solo `relleno` (qué queda
// por escribir) y `origen` (qué queda por revisar, en el curso siguiente): dos palabras, nunca el
// contenido. El contenido se pide apartado por apartado. Ver el comentario de core/arbol.js.

'use strict';

const Arbol = require('../../../core/arbol');
const { conErrores, abrirDocumento, puedeEditarApartado, tituloDelTomo, esRevisado } = require('./comun');

// El progreso por revisión (docs/plan.md §2.1): de los apartados con contenido propio, cuántos ya se
// han mirado y cuántos siguen pendientes. Un heredado sin mirar es pendiente aunque esté lleno de
// texto, y uno vacío también: el progreso mide revisión y no relleno. Los nodos que solo agrupan no
// se revisan, igual que no se editan, así que no entran en el recuento.
function recuentoRevision(nodos) {
  const conContenido = nodos.filter((n) => n.contenido);
  const revisados = conContenido.filter((n) => esRevisado(n.origen)).length;
  return {
    apartados: conContenido.length,
    revisados,
    heredados: conContenido.filter((n) => n.origen === 'heredado').length,
    pendientes: conContenido.length - revisados,
  };
}

const GET = conErrores(async (peticion, parametros) => {
  const { fallo, usuario, documento, repo } = await abrirDocumento(peticion, parametros);
  if (fallo) return fallo;

  // Sin reordenar: el orden de `unidades.listar()` es el del documento y el del tomo del PDF.
  const unidades = await repo.unidades.listar(documento._id);
  // Trae los `valores`, que es lo que hace falta para saber si un apartado está relleno. No salen
  // de aquí: core/arbol.js los reduce a un booleano por nodo.
  const apartados = await repo.apartados.listar(documento._id);

  const arbol = Arbol.construirArbol({
    plantilla: documento.plantilla,
    unidades,
    apartados,
    clave: documento._id,
    // La raíz del árbol es el documento, y se llama igual que la portada del PDF: así la cabecera de
    // la barra lateral y el tomo impreso dicen lo mismo.
    titulo: tituloDelTomo(documento, null),
  });

  const porId = new Map(unidades.map((u) => [u.unidadId, u]));

  // El `origen` de cada apartado con contenido, que es lo que la interfaz pinta como progreso por
  // revisión. Sale de las filas que ya están leídas, sin pedir nada más, y solo se anota en los nodos
  // que tienen contenido propio: el origen de un nodo que solo agrupa no significa nada.
  const porCelda = new Map(apartados.map((a) => [`${a.unidadId || ''}|${a.seccion}`, a]));
  const nodos = Arbol.aplanar(arbol);
  for (const nodo of nodos) {
    nodo.puedeEditar = puedeEditarApartado({
      usuario,
      documento,
      unidad: nodo.unidadId ? porId.get(nodo.unidadId) : null,
      seccion: nodo.seccion,
      edita: nodo.edita,
      contenido: nodo.contenido,
    });
    const fila = nodo.tipo === 'apartado' && nodo.contenido
      ? porCelda.get(`${nodo.unidadId || ''}|${nodo.seccion}`)
      : null;
    nodo.origen = (fila && fila.origen) || null;
  }

  return Response.json(
    {
      documentoId: documento._id,
      arbol,
      resumen: Arbol.resumen(arbol),
      // El progreso por revisión, aparte y no dentro de `resumen`: `resumen` es lo que ya da la
      // ruta y lo comprueba test/api.js con igualdad estricta.
      revision: recuentoRevision(nodos),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
});

module.exports = { GET };
