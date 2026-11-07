// GET /api/documentos/[id]/docx?estado=&unidad= — lo mismo que /pdf, en Word.
//
// El camino es el mismo —leer las cuatro colecciones, volver a la forma del motor y pasárselas al
// exportador tal cual— y por el mismo motivo: lo que esta ruta decida sale en el documento. El
// título de la portada y la selección de instancias se calculan igual que en /pdf, así que el PDF y
// el Word del mismo documento llevan la misma portada y los mismos módulos.
//
// SOBRE `estado`
//
// Se acepta porque está en el contrato (docs/api.md) y porque un enlace tiene que poder llevar los
// mismos parámetros para las dos exportaciones, pero en Word no cambia nada: la marca de agua de
// BORRADOR la pinta pdfmake como propiedad de la página y `motor/exportar-docx.js` no escribe
// ninguna. Se valida de todas formas —un `estado=aprovado` da 400— para que nadie se lleve la
// impresión de que ha exportado un aprobado cuando ha escrito el parámetro mal.
//
// Lo que sale de aquí vuelve a entrar por el importador: ese es el criterio de calidad del
// exportador (ver su cabecera). Es también lo que convierte esta ruta en la salida de emergencia del
// proyecto: si un día la aplicación no se puede usar, el departamento se descarga su documento en
// Word y sigue trabajando.

'use strict';

const { exportarDocx } = require('../../../motor/exportar-docx');
const {
  conErrores, abrirDocumento, leerParaElMotor, tituloDelTomo, nombreDeArchivo,
  estadoPedido, unidadPedida,
} = require('./comun');

const TIPO = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const GET = conErrores(async (peticion, parametros) => {
  const abierto = await abrirDocumento(peticion, parametros);
  if (abierto.fallo) return abierto.fallo;
  const { documento, repo } = abierto;

  const url = new URL(peticion.url);
  const { fallo: falloEstado } = estadoPedido(url, documento);
  if (falloEstado) return falloEstado;

  const { plantilla, datos, unidades } = await leerParaElMotor(repo, documento);
  const { fallo: falloUnidad, unidad, indice } = unidadPedida(url, unidades);
  if (falloUnidad) return falloUnidad;

  const bytes = await exportarDocx({
    plantilla,
    datos,
    titulo: tituloDelTomo(documento, unidad),
    // El índice y no el título, igual que en /pdf: dos módulos pueden llamarse igual.
    instancias: unidad ? [indice] : 'todas',
  });

  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': TIPO,
      // `attachment` y no `inline`: un .docx no se mira en el navegador, se abre con Word.
      'Content-Disposition': `attachment; filename="${nombreDeArchivo(documento, unidad, 'docx')}"`,
      'Cache-Control': 'no-store',
    },
  });
});

module.exports = { GET };
