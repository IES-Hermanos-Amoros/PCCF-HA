// GET /api/documentos/[id]/copia — el .docx tal como se subió, copia de seguridad de esta versión.
//
// Lo ve quien ve el documento, sea la versión activa o una alternativa: es lectura. El fichero es el
// original, no una exportación: lo que sale de /docx se genera de lo que hay guardado y puede haber
// cambiado desde entonces (docs/plan.md §8).

'use strict';

const { conErrores, abrirDocumento, noEncontrado, nombreDeArchivo } = require('./comun');
const { numeroDeVersion } = require('../../../core/versiones');

const TIPO = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const GET = conErrores(async (peticion, parametros) => {
  const abierto = await abrirDocumento(peticion, parametros);
  if (abierto.fallo) return abierto.fallo;
  const { documento, repo } = abierto;

  const copia = await repo.copias.obtener(documento._id);
  if (!copia) return noEncontrado('Esta versión no tiene copia del Word original.');

  const nombre = `copia_v${numeroDeVersion(documento)}_${nombreDeArchivo(documento, null, 'docx')}`;
  return new Response(copia.contenido, {
    status: 200,
    headers: {
      'Content-Type': TIPO,
      'Content-Disposition': `attachment; filename="${nombre}"`,
      'Content-Length': String(copia.contenido.length),
      'Cache-Control': 'no-store',
    },
  });
});

module.exports = { GET };
