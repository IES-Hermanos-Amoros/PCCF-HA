// Cómo habla el navegador con la API, en un solo sitio.
//
// Toda ruta devuelve los errores con la misma forma —`{ error, mensaje }`, con un
// código que el cliente compara y un mensaje en castellano que se puede enseñar
// tal cual (docs/api.md, «Errores»)—, así que el manejo también es uno.
//
// DOS COSAS QUE NO SON JSON Y HAY QUE TRAGAR CON ELEGANCIA
//
//  1. Una ruta que todavía no existe. `POST /api/documentos/importar` la está
//     escribiendo otra tarea de este mismo evolutivo: hasta que aterrice, Next
//     responde con su página de error, que es HTML. Un `respuesta.json()` a
//     secas revienta con «Unexpected token <» y la pantalla enseña eso en lugar
//     de «esto todavía no está».
//  2. Un corte de red o un servidor caído: `fetch` lanza antes de responder.
//
// Las dos acaban en un ErrorApi con un código propio (`no_disponible`,
// `sin_conexion`) y un mensaje redactado, para que las vistas no tengan que
// distinguir «ha fallado el servidor» de «ha fallado la petición».

'use client';

export class ErrorApi extends Error {
  constructor(estado, codigo, mensaje, extra) {
    super(mensaje);
    this.name = 'ErrorApi';
    this.estado = estado;
    this.codigo = codigo;
    Object.assign(this, extra || {});
  }
}

// `no-store` porque todas las rutas lo devuelven en su cabecera: lo que se pinta
// es el estado del documento ahora, y una respuesta en caché enseñaría el de
// antes de que alguien guardara.
export async function pedir(camino, opciones = {}) {
  let respuesta;
  try {
    respuesta = await fetch(camino, { cache: 'no-store', ...opciones });
  } catch (e) {
    throw new ErrorApi(0, 'sin_conexion', 'No se ha podido contactar con el servidor.');
  }

  const tipo = respuesta.headers.get('content-type') || '';
  if (!tipo.includes('application/json')) {
    if (respuesta.status === 404) {
      throw new ErrorApi(404, 'no_disponible', `La ruta ${camino.split('?')[0]} todavía no existe en el servidor.`);
    }
    throw new ErrorApi(respuesta.status, 'error_interno',
      `El servidor ha respondido ${respuesta.status} sin JSON: puede que la ruta aún no esté construida.`);
  }

  const cuerpo = await respuesta.json();
  if (!respuesta.ok) {
    throw new ErrorApi(respuesta.status, cuerpo.error || 'error_interno',
      cuerpo.mensaje || 'El servidor ha devuelto un error sin mensaje.', cuerpo);
  }
  return cuerpo;
}
