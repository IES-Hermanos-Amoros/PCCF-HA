// Función serverless (Vercel, carpeta /api): GET /api/pd?estado=borrador|aprobado
// Genera la PD de un módulo en PDF con pdfmake, sin navegador ni binarios externos.
const PdfPrinter = require('pdfmake');
const fonts = require('../lib/fonts');
const { buildPdDocDefinition } = require('../lib/pd-docdef');
const data = require('../data/pd.json');

module.exports = (req, res) => {
  const t0 = Date.now();
  const url = new URL(req.url, 'http://localhost');
  const estado = url.searchParams.get('estado') || data.estado;
  const printer = new PdfPrinter(fonts);
  const pdf = printer.createPdfKitDocument(buildPdDocDefinition({ ...data, estado }));
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="PD_${data.ciclo.codigo}_${data.modulo.codigo}_${data.modulo.nombre}.pdf"`);
  res.setHeader('Cache-Control', 'no-store');
  pdf.on('end', () => console.log(`PDF generado en ${Date.now() - t0} ms`));
  pdf.pipe(res);
  pdf.end();
};
