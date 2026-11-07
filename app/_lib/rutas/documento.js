// GET /api/documentos/[id] — un documento, sin `plantilla`.
//
// La cabecera de la vista del documento: tipo, ciclo, curso, departamento, estado y de qué Word
// salió. Lo que no lleva es la plantilla (docs/api.md, segunda regla de forma): la estructura se
// pide en /arbol, ya masticada, y los campos de un apartado en /apartado. La plantilla de la PD real
// son 57 secciones con todos sus campos y no la necesita ninguna vista.
//
// Lleva `plantillaVersion`, que sí es un dato del documento y hace falta para el E6: cuando la
// estructura se pueda cambiar, la interfaz tendrá que saber con qué versión está trabajando.

'use strict';

const { conErrores, abrirDocumento, sinPlantilla } = require('./comun');

const GET = conErrores(async (peticion, parametros) => {
  const { fallo, documento } = await abrirDocumento(peticion, parametros);
  if (fallo) return fallo;

  return Response.json(
    { documento: sinPlantilla(documento) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
});

module.exports = { GET };
