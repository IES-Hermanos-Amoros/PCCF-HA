// Generación local a fichero: node scripts/generate.js [borrador|aprobado]
const fs = require('fs');
const path = require('path');
const PdfPrinter = require('pdfmake');
const fonts = require('../lib/fonts');
const { buildPdDocDefinition } = require('../lib/pd-docdef');
const data = require('../data/pd.json');

const estado = process.argv[2] || data.estado;
const outDir = path.join(__dirname, '..', 'out');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `PD_${data.ciclo.codigo}_${data.modulo.codigo}_${data.modulo.nombre}${estado === 'aprobado' ? '' : '_borrador'}.pdf`);

const t0 = Date.now();
const printer = new PdfPrinter(fonts);
const pdf = printer.createPdfKitDocument(buildPdDocDefinition({ ...data, estado }));
const chunks = [];
pdf.on('data', (c) => chunks.push(c));
pdf.on('end', () => {
  const buf = Buffer.concat(chunks);
  fs.writeFileSync(outFile, buf);
  const pages = pdf.bufferedPageRange ? pdf.bufferedPageRange().count : '?';
  console.log(`OK ${outFile}\n${pages} páginas · ${(buf.length / 1024).toFixed(0)} KB · ${Date.now() - t0} ms`);
});
pdf.end();
