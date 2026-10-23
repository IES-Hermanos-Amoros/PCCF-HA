// Función serverless (Vercel): POST /api/importar con el .docx en el cuerpo (application/octet-stream)
// Devuelve la plantilla deducida, los datos extraídos y el informe, en JSON. Sin IA, sin binarios.
const { importarDocx } = require('../lib/importar-docx');

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.statusCode = 405; return res.end('POST un fichero .docx'); }
  const t0 = Date.now();
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const buffer = Buffer.concat(chunks);
  try {
    const url = new URL(req.url, 'http://localhost');
    const { plantilla, datos, informe } = await importarDocx({ buffer }, { origen: url.searchParams.get('nombre') || 'documento.docx' });
    const salida = { ms: Date.now() - t0, informe, plantilla, datos: url.searchParams.get('datos') === '1' ? datos : { instancias: datos.instancias.map((i) => i.titulo), secciones_documento: Object.keys(datos.documento).length } };
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(salida));
  } catch (e) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'No se ha podido importar el documento', detalle: String(e.message || e) }));
  }
};

module.exports.config = { api: { bodyParser: false } };
