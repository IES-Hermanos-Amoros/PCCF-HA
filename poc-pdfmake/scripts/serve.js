// Servidor local mínimo que expone la función de /api igual que lo haría Vercel: node scripts/serve.js
const http = require('http');
const handler = require('../api/pd');
const port = Number(process.env.PORT) || 3999;
http.createServer((req, res) => {
  if (req.url.startsWith('/api/pd')) return handler(req, res);
  res.statusCode = 404; res.end('Solo /api/pd');
}).listen(port, () => console.log(`http://localhost:${port}/api/pd?estado=borrador`));
