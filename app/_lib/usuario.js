// De dónde sale el usuario de una petición. Un solo sitio, a propósito.
//
// El E1 va sin autenticación: la persona se elige en un desplegable, como en el
// mockup, y viaja en una cookie. El E2 traerá sesiones de verdad y entonces lo
// único que cambia es el cuerpo de `usuarioDeLaPeticion`; ninguna ruta de la API
// ni ninguna comprobación de permisos se entera. Si cada ruta leyera la cookie
// por su cuenta, meter la sesión obligaría a tocarlas todas y sería justo el
// momento en que se cuela una que se queda sin comprobar.
//
// Dos reglas que no se negocian ni mientras no haya autenticación:
//
//  1. **Se cierra, no se abre.** Sin persona reconocida el usuario es `null`, y
//     quien recibe `null` deniega. Nunca hay un usuario por omisión con permisos.
//  2. **Los permisos se comprueban en el servidor**, con core/permisos.js, desde
//     el primer endpoint. Que el usuario sea de mentira no quiere decir que la
//     comprobación pueda esperar: si se deja para el E2, para entonces hay
//     media aplicación escrita que confía en que el cliente esconda el botón.
//
// La cookie se lee de la cabecera en lugar de con `cookies()` de next/headers
// para que esto se pueda probar desde node con un `Request` normal, sin levantar
// Next. Las pruebas de la API dependen de ello.

'use strict';

const { obtenerRepositorio } = require('./repositorio');

const COOKIE_PERSONA = 'persona';

function leerCookie(peticion, nombre) {
  const cabecera = peticion && peticion.headers && peticion.headers.get
    ? peticion.headers.get('cookie')
    : null;
  if (!cabecera) return null;
  for (const trozo of cabecera.split(';')) {
    const i = trozo.indexOf('=');
    if (i === -1) continue;
    if (trozo.slice(0, i).trim() === nombre) {
      return decodeURIComponent(trozo.slice(i + 1).trim()) || null;
    }
  }
  return null;
}

// Devuelve { _id, nombre, email, rol, departamento } o null.
// El rol es uno de los cuatro que entiende core/permisos.js; si en la base de
// datos hubiera otro valor, el usuario no vale y se devuelve null, porque un rol
// que el motor de permisos no conoce no cae en ninguna rama y acabaría dando
// acceso por descuido.
async function usuarioDeLaPeticion(peticion) {
  const id = leerCookie(peticion, COOKIE_PERSONA);
  if (!id) return null;

  // El repositorio exige que los identificadores sean cadenas no vacías y lanza
  // si no lo son. Esto viene de una cookie, que es texto que manda el cliente:
  // una cookie con basura dentro tiene que acabar en «no te conozco» (401) y no
  // en un error del servidor (500).
  let u = null;
  try {
    u = await obtenerRepositorio().usuarios.obtener(id);
  } catch (e) {
    return null;
  }
  if (!u) return null;

  const ROLES = ['admin', 'jefe_estudios', 'jefe_departamento', 'docente'];
  if (!ROLES.includes(u.rol)) return null;

  return u;
}

const SIN_IDENTIFICAR = () => Response.json(
  { error: 'sin_identificar', mensaje: 'No hay ninguna persona seleccionada.' },
  { status: 401 },
);

const SIN_PERMISO = (mensaje) => Response.json(
  { error: 'sin_permiso', mensaje: mensaje || 'No tienes permiso para esto.' },
  { status: 403 },
);

module.exports = { usuarioDeLaPeticion, COOKIE_PERSONA, SIN_IDENTIFICAR, SIN_PERMISO };
