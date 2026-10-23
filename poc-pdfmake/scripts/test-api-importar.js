// Prueba de /api/importar como la invocaría Vercel: servidor efímero + POST del .docx
//   node scripts/test-api-importar.js "<fichero.docx>"
const http = require('http');
const fs = require('fs');
const path = require('path');
const handler = require('../api/importar');

const fichero = process.argv[2];
if (!fichero) { console.error('Uso: node scripts/test-api-importar.js <docx>'); process.exit(1); }
const server = http.createServer((req, res) => handler(req, res));
server.listen(0, async () => {
  const { port } = server.address();
  const t0 = Date.now();
  const r = await fetch(`http://localhost:${port}/api/importar?nombre=${encodeURIComponent(path.basename(fichero))}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: fs.readFileSync(fichero) });
  const json = await r.json();
  console.log(`HTTP ${r.status} · ${Date.now() - t0} ms · servidor ${json.ms} ms`);
  console.log(`secciones ${json.informe.secciones} · instancias ${json.informe.instancias.length} · tablas ${json.informe.tablas} · tipos: ${Object.keys(json.informe.camposPorTipo).join(', ')}`);
  console.log('instancias:', json.datos.instancias.join(' · '));
  server.close();
});
