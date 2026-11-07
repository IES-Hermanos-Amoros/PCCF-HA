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
// 250 apartados × sus valores es el documento entero. De cada apartado sale solo `relleno`, que es
// lo que la barra lateral necesita para enseñar qué queda por escribir; el contenido se pide
// apartado por apartado. Ver el comentario de core/arbol.js.

'use strict';

const Arbol = require('../../../core/arbol');
const { conErrores, abrirDocumento, puedeEditarApartado, tituloDelTomo } = require('./comun');

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
  for (const nodo of Arbol.aplanar(arbol)) {
    nodo.puedeEditar = puedeEditarApartado({
      usuario,
      documento,
      unidad: nodo.unidadId ? porId.get(nodo.unidadId) : null,
      seccion: nodo.seccion,
      edita: nodo.edita,
      contenido: nodo.contenido,
    });
  }

  return Response.json(
    { documentoId: documento._id, arbol, resumen: Arbol.resumen(arbol) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
});

module.exports = { GET };
