// Prueba de la función /api/pd como la invocaría Vercel: servidor efímero + petición HTTP.
const http = require('http');
const fs = require('fs');
const path = require('path');
const handler = require('../api/pd');

const server = http.createServer((req, res) => handler(req, res));
server.listen(0, async () => {
  const { port } = server.address();
  for (const estado of ['borrador', 'aprobado']) {
    const t0 = Date.now();
    const r = await fetch(`http://localhost:${port}/api/pd?estado=${estado}`);
    const buf = Buffer.from(await r.arrayBuffer());
    const ms = Date.now() - t0;
    const out = path.join(__dirname, '..', 'out', `api_${estado}.pdf`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, buf);
    console.log(`${estado}: HTTP ${r.status} · ${r.headers.get('content-type')} · ${(buf.length / 1024).toFixed(0)} KB · ${ms} ms · cabecera %PDF: ${buf.subarray(0, 4).toString() === '%PDF'}`);
  }
  server.close();
});
