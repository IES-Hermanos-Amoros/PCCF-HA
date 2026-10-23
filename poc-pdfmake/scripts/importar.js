// Importa un Word: deduce la plantilla, extrae los datos y genera el PDF.
//   node scripts/importar.js "<fichero.docx>" [--instancia "Programación"] [--tomo] [--aprobado]
const fs = require('fs');
const path = require('path');
const PdfPrinter = require('pdfmake');
const fonts = require('../lib/fonts');
const { importarDocx } = require('../lib/importar-docx');
const { buildDocDefinition } = require('../lib/render-generico');

const args = process.argv.slice(2);
const fichero = args[0];
if (!fichero) { console.error('Uso: node scripts/importar.js <docx> [--instancia nombre] [--tomo] [--aprobado]'); process.exit(1); }
const iInst = args.indexOf('--instancia');
const instancia = iInst >= 0 ? args[iInst + 1] : null;
const tomo = args.includes('--tomo');
const estado = args.includes('--aprobado') ? 'aprobado' : 'borrador';

(async () => {
  const t0 = Date.now();
  const { plantilla, datos, informe } = await importarDocx({ path: fichero }, { origen: path.basename(fichero) });
  const t1 = Date.now();
  const outDir = path.join(__dirname, '..', 'out', 'importado');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'plantilla.json'), JSON.stringify(plantilla, null, 1));
  fs.writeFileSync(path.join(outDir, 'datos.json'), JSON.stringify(datos, null, 1));

  const lineas = [`# Informe de importación · ${path.basename(fichero)}`, '',
    `- Nodos leídos: ${informe.nodos} (${informe.titulos} títulos, ${informe.tablas} tablas)`,
    `- Secciones de la plantilla: ${informe.secciones} · repetidores: ${informe.repetidores}`,
    `- Campos por tipo: ${Object.entries(informe.camposPorTipo).map(([k, v]) => `${k} ×${v}`).join(', ')}`,
    `- Instancias detectadas (${informe.instancias.length}): ${informe.instancias.join(' · ')}`,
    `- Tiempo de importación: ${t1 - t0} ms`, '', '## Avisos', ...(informe.avisos.length ? informe.avisos.map((a) => `- ${a}`) : ['- ninguno']), '', '## Plantilla deducida', ''];
  const arbol = (s, d = 0, total = 1) => {
    const n = s.instancias ? s.presencia : total;
    const campo = (c) => c.tipo + (c.multiple ? '[]' : '') + (n > 1 && c.presencia !== undefined && c.presencia < n ? ` (${c.presencia}/${n})` : '');
    lineas.push(`${'  '.repeat(d)}- ${s.titulo}${s.repetidor ? ' [repetidor]' : ''}${s.instancias ? ` [${s.presencia} instancias: ${s.etiqueta_instancia}]` : ''}${n > 1 && !s.instancias && s.presencia < n ? ` (${s.presencia}/${n})` : ''}${s.campos.length ? ' → ' + s.campos.map(campo).join(', ') : ''}`);
    s.hijos.forEach((h) => arbol(h, d + 1, n));
  };
  plantilla.secciones.forEach((s) => arbol(s));
  fs.writeFileSync(path.join(outDir, 'informe.md'), lineas.join('\n'));
  console.log(lineas.join('\n'));

  const seleccion = tomo ? 'todas' : instancia ? [instancia] : [datos.instancias[0] && datos.instancias[0].titulo].filter(Boolean);
  const titulo = tomo ? `Programaciones didácticas · ${path.basename(fichero, '.docx')}` : `Programación didáctica · ${seleccion[0] || 'documento'}`;
  const dd = buildDocDefinition({ plantilla, datos, instancias: seleccion, titulo, subtitulo: 'IES Hermanos Amorós · importado de Word', estado });
  const printer = new PdfPrinter(fonts);
  const pdf = printer.createPdfKitDocument(dd);
  const chunks = [];
  pdf.on('data', (c) => chunks.push(c));
  pdf.on('end', () => {
    const buf = Buffer.concat(chunks);
    const nombre = tomo ? 'tomo.pdf' : `PD_${(seleccion[0] || 'doc').replace(/[^\wáéíóúñ]+/gi, '_')}.pdf`;
    fs.writeFileSync(path.join(outDir, nombre), buf);
    console.log(`\nPDF: ${path.join(outDir, nombre)} · ${(buf.length / 1024).toFixed(0)} KB · importación ${t1 - t0} ms · PDF ${Date.now() - t1} ms`);
  });
  pdf.end();
})().catch((e) => { console.error(e); process.exit(1); });
