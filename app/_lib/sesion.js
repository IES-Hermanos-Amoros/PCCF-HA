// La sesión: abrirla, reconocerla, cerrarla, y la cookie que la lleva.
//
// Esto es la mitad «quién eres» del E2. La otra mitad, «qué puedes», sigue siendo core/permisos.js y
// no cambia: una sesión no da permisos, solo dice de quién son los que ya había.
//
// CÓMO SE ENTRA
//
// El profesorado no se registra. La jefatura de departamento da de alta a cada persona con su correo
// y la aplicación genera un enlace de acceso (app/_lib/invitaciones.js); al abrirlo se canjea por una
// sesión. Sin contraseñas que mantener, sin cuentas de Google y sin depender del directorio de la
// Conselleria, que no controlamos.
//
// LA COOKIE
//
//   HttpOnly    NO ES OPCIONAL. Sin él, cualquier JavaScript de la página —el nuestro, una
//               dependencia, una extensión— puede leer la cookie y llevarse la sesión. Y no hace
//               falta que sea legible: nada del cliente necesita el testigo, porque el navegador la
//               manda sola en cada petición. Quién eres se pregunta a `GET /api/sesion`.
//   SameSite=Lax  la cookie no viaja en peticiones que vengan de otro sitio salvo al navegar, que es
//               justo lo que necesita el enlace de acceso: pinchado desde el correo tiene que
//               llegar con la cookie recién puesta. `Strict` rompería ese caso y `None` dejaría que
//               cualquier página hiciera peticiones en nombre de quien esté dentro.
//   Path=/      vale para toda la aplicación, que es donde se usa.
//   Secure      salvo en desarrollo: con él, el navegador no manda la cookie por http, y el servidor
//               de desarrollo es http://localhost. En producción (Vercel) todo es https.
//   Max-Age     la misma caducidad que lleva la sesión en la base de datos, para que el navegador no
//               siga mandando una cookie que el servidor ya no va a aceptar. La que manda es la de
//               la base de datos: la del navegador la puede falsear cualquiera.
//
// POR QUÉ 90 DÍAS Y SIN RENOVACIÓN AUTOMÁTICA
//
// Un trimestre: lo que dura un periodo de evaluación, así que quien usa la herramienta a su ritmo no
// se encuentra la puerta cerrada en mitad de la programación. Y no se renueva sola, aunque sería más
// cómodo, porque renovar exige escribir en la base de datos en CADA petición —o llevar la cuenta de
// cuándo toca— y además volver a poner la cookie, y `usuarioDeLaPeticion` no puede poner cookies: lo
// llaman rutas que devuelven PDF, Word y JSON. Cuando caduca, la jefatura manda otro enlace. Que la
// persona se lo pueda pedir sola necesita correo, y el correo todavía no existe (ver
// app/_lib/invitaciones.js).
//
// La cookie se lee de la cabecera en lugar de con `cookies()` de next/headers para que esto se pueda
// probar desde node con un `Request` normal, sin levantar Next. test/sesiones.js depende de ello.

'use strict';

const { ROLES } = require('../../core/permisos');
const { obtenerRepositorio } = require('./repositorio');
const { nuevoTestigo, hashDeTestigo, coincide } = require('./testigos');

const COOKIE_SESION = 'sesion';

// La cookie del E1, que llevaba dentro el id de la persona elegida en un desplegable: cualquiera
// podía ponérsela y ser quien quisiera. Ya no identifica a nadie —no se lee en ningún sitio— y
// aparece aquí solo para BORRARLA del navegador en cuanto alguien entra o sale, para no dejar
// rodando una cookie que parece una credencial y no lo es.
const COOKIE_E1 = 'persona';

const DIAS_SESION = 90;
const SEGUNDOS_SESION = DIAS_SESION * 24 * 60 * 60;

// En desarrollo el servidor es http://localhost, y una cookie `Secure` no se manda por http: la
// sesión no llegaría nunca y la aplicación parecería estropeada.
const enProduccion = () => process.env.NODE_ENV === 'production';

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

const cookie = (nombre, valor, segundos) => [
  `${nombre}=${encodeURIComponent(valor)}`,
  'Path=/',
  'HttpOnly',
  'SameSite=Lax',
  `Max-Age=${segundos}`,
  enProduccion() ? 'Secure' : null,
].filter(Boolean).join('; ');

// Las cabeceras de una respuesta que abre sesión. Dos `Set-Cookie`: la nueva y la del E1 a cero.
// Se usa `Headers` y `append` porque un objeto plano no puede llevar dos cabeceras con el mismo
// nombre, y `Cache-Control: no-store` porque una respuesta que lleva una credencial no se guarda en
// ninguna caché intermedia.
function cabecerasConSesion(testigo) {
  const cabeceras = new Headers({ 'Cache-Control': 'no-store' });
  cabeceras.append('Set-Cookie', cookie(COOKIE_SESION, testigo, SEGUNDOS_SESION));
  cabeceras.append('Set-Cookie', cookie(COOKIE_E1, '', 0));
  return cabeceras;
}

// Las de una respuesta que cierra sesión. Max-Age=0 borra la cookie del navegador; lo que de verdad
// invalida la sesión es `sesiones.revocar`, porque una cookie borrada se puede haber copiado antes.
function cabecerasSinSesion() {
  const cabeceras = new Headers({ 'Cache-Control': 'no-store' });
  cabeceras.append('Set-Cookie', cookie(COOKIE_SESION, '', 0));
  cabeceras.append('Set-Cookie', cookie(COOKIE_E1, '', 0));
  return cabeceras;
}

// Abre una sesión para una persona y devuelve el testigo UNA sola vez: lo que queda guardado es su
// hash (app/_lib/testigos.js), así que esta es la única oportunidad de ponerlo en la cookie.
async function abrirSesion(repo, usuarioId, ahora = new Date()) {
  const { testigo, tokenHash } = nuevoTestigo();
  const expiraEn = new Date(ahora.getTime() + SEGUNDOS_SESION * 1000);
  const sesion = await repo.sesiones.crear({ usuarioId: String(usuarioId), tokenHash, expiraEn });

  // La fecha de la última entrada es lo que permite al censo distinguir a quien
  // nunca ha llegado a entrar de quien entró y se le ha caducado la sesión. Si
  // falla, la sesión ya está abierta y no se va a cerrar por esto.
  try {
    await repo.usuarios.actualizar(String(usuarioId), { ultimoAcceso: ahora });
  } catch (e) { /* no es motivo para no dejar entrar */ }

  return { sesion, testigo };
}

const caducada = (fila, ahora) => !fila.expiraEn || new Date(fila.expiraEn).getTime() <= ahora.getTime();

// La sesión de una petición, con su persona, o null. Devuelve las dos cosas porque cerrar sesión
// necesita el `_id` de la sesión para revocarla, y todo lo demás solo necesita la persona.
//
// Cualquier motivo para no reconocerla acaba en el mismo `null`: no hay cookie, la cookie no
// corresponde a ninguna sesión, la sesión está revocada o caducada, la persona ya no existe, tiene
// un rol que core/permisos.js no conoce, o está dada de baja. Quien recibe `null` deniega (401). No
// se distingue el motivo a propósito: decirle a quien prueba cookies si existe esa sesión le dice
// algo que no tiene por qué saber.
async function sesionDeLaPeticion(peticion) {
  const testigo = leerCookie(peticion, COOKIE_SESION);
  if (!testigo) return null;

  const repo = obtenerRepositorio();

  // El testigo es texto que manda el cliente: el repositorio exige cadenas no vacías y lanza si no
  // lo son, y una cookie con basura dentro tiene que acabar en «no te conozco» (401) y no en un
  // error del servidor (500).
  let sesion = null;
  try {
    sesion = await repo.sesiones.porHash(hashDeTestigo(testigo));
  } catch (e) {
    return null;
  }
  if (!sesion) return null;

  // La búsqueda ya ha sido por hash, así que esto es una segunda vuelta de llave: comprueba en
  // tiempo constante que el testigo que ha llegado es el de ESTA fila. Ver app/_lib/testigos.js.
  if (!coincide(testigo, sesion.tokenHash)) return null;

  const ahora = new Date();
  if (sesion.revocadaEn) return null;
  if (caducada(sesion, ahora)) return null;

  let usuario = null;
  try {
    usuario = await repo.usuarios.obtener(sesion.usuarioId);
  } catch (e) {
    return null;
  }
  if (!usuario) return null;

  // Un rol que el motor de permisos no conoce no cae en ninguna de sus ramas y acabaría dando
  // acceso por descuido, así que la persona no vale. Los cuatro los define core/permisos.js: se
  // leen de allí y no se copian, para que añadir un rol no obligue a acordarse de este fichero.
  if (!Object.prototype.hasOwnProperty.call(ROLES, usuario.rol)) return null;

  // Dada de baja: no entra, aunque su sesión siguiera viva. Al desactivarla se le revocan las
  // sesiones (app/_lib/rutas/persona.js), y esto es la segunda vuelta que protege de que algún día
  // alguien desactive a alguien sin revocarle nada.
  if (usuario.activo === false) return null;

  return { usuario, sesion };
}

module.exports = {
  COOKIE_SESION,
  COOKIE_E1,
  DIAS_SESION,
  SEGUNDOS_SESION,
  leerCookie,
  cabecerasConSesion,
  cabecerasSinSesion,
  abrirSesion,
  sesionDeLaPeticion,
  caducada,
};
