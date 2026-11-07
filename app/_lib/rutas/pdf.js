// GET /api/documentos/[id]/pdf?estado=&unidad= — el PDF. Sin `unidad`, el tomo completo.
//
// ES EL CRITERIO DE ACEPTACIÓN DEL E1
//
//   «El PDF exportado desde la base de datos es idéntico al que genera hoy el importador sobre el
//    mismo Word.»
//
// Así que esta ruta no puede tener lógica de pintado: su trabajo es leer las cuatro colecciones,
// devolverlas a la forma del motor con `aMotor` y pasárselas a `buildDocDefinition` tal cual. Todo
// lo que decida aquí —un título distinto, una selección de instancias distinta, un `estado` por
// omisión distinto— sale en el documento y rompe el criterio.
//
// `definicionDe()` se exporta aparte justo por eso: hace todo el trabajo de la ruta —resolver el
// usuario, leer las cuatro colecciones, interpretar los parámetros— y se queda un paso antes de
// imprimir. Es lo que compara test/api.js contra el motor sin generar un PDF.
//
// `buildDocDefinition` es una función pura de `{ plantilla, datos }`, así que si la definición es
// idéntica el PDF lo es; y cuando algo falla, un `deepStrictEqual` sobre la definición dice qué nodo
// cambió, mientras que dos PDF distintos solo dicen que son distintos. Comparar los bytes además
// sería imposible: la portada lleva la fecha de generación y el PDF, la hora de creación en sus
// metadatos, así que dos ejecuciones del mismo documento nunca dan los mismos bytes. Es la misma
// decisión que explica test/ida-y-vuelta.js.

'use strict';

const { buildDocDefinition } = require('../../../motor/render-generico');
const {
  conErrores, abrirDocumento, leerParaElMotor, tituloDelTomo, nombreDeArchivo,
  estadoPedido, unidadPedida, SUBTITULO,
} = require('./comun');

// Toda la ruta menos la impresión. Devuelve { fallo } o { definicion, documento, unidad }.
async function definicionDe(peticion, parametros) {
  const abierto = await abrirDocumento(peticion, parametros);
  if (abierto.fallo) return { fallo: abierto.fallo };
  const { documento, repo } = abierto;

  const url = new URL(peticion.url);
  const { fallo: falloEstado, estado } = estadoPedido(url, documento);
  if (falloEstado) return { fallo: falloEstado };

  const { plantilla, datos, unidades } = await leerParaElMotor(repo, documento);
  const { fallo: falloUnidad, unidad, indice } = unidadPedida(url, unidades);
  if (falloUnidad) return { fallo: falloUnidad };

  const definicion = buildDocDefinition({
    plantilla,
    datos,
    // El índice y no el título: dos módulos pueden llamarse igual (ver `unidadPedida` en comun.js).
    instancias: unidad ? [indice] : 'todas',
    titulo: tituloDelTomo(documento, unidad),
    subtitulo: SUBTITULO,
    estado,
  });
  return { definicion, documento, unidad };
}

// pdfmake escribe por eventos (es un stream de PDFKit) y una ruta de Next tiene que devolver un
// cuerpo entero, así que se junta en un Buffer. El tomo real son ~2 MB: cabe de sobra en memoria y
// mandarlo en trozos obligaría a mantener el stream vivo a través del adaptador de Vercel.
//
// `pdfmake` y sus fuentes se piden dentro de la función y no arriba: así importar este módulo —que
// es lo que hace el envoltorio de la ruta en cada arranque— no carga el vfs de Roboto, que son 1,5 MB
// de fuentes en base64, hasta que alguien pide un PDF de verdad.
function aBytes(docDefinition) {
  const PdfPrinter = require('pdfmake');
  const fuentes = require('../../../motor/fonts');
  return new Promise((resolver, rechazar) => {
    const impresora = new PdfPrinter(fuentes);
    const pdf = impresora.createPdfKitDocument(docDefinition);
    const trozos = [];
    pdf.on('data', (t) => trozos.push(t));
    pdf.on('end', () => resolver(Buffer.concat(trozos)));
    pdf.on('error', rechazar);
    pdf.end();
  });
}

const GET = conErrores(async (peticion, parametros) => {
  const { fallo, definicion, documento, unidad } = await definicionDe(peticion, parametros);
  if (fallo) return fallo;

  const bytes = await aBytes(definicion);

  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      // `inline`: se abre en el visor del navegador, que es lo que se quiere para repasar una
      // programación. Guardarlo sigue siendo un clic.
      'Content-Disposition': `inline; filename="${nombreDeArchivo(documento, unidad, 'pdf')}"`,
      // Nunca cacheado: el documento cambia cada vez que alguien escribe un párrafo, y un PDF viejo
      // servido desde la caché es indistinguible de un guardado que no funcionó.
      'Cache-Control': 'no-store',
    },
  });
});

module.exports = { GET, definicionDe, aBytes };
