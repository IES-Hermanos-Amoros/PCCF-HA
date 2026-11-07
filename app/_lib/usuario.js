// De dónde sale el usuario de una petición. Un solo sitio, a propósito.
//
// En el E1 esto leía una cookie `persona` con un id dentro, puesta por un desplegable: cualquiera
// podía escribir esa cookie y ser quien quisiera, y eso era toda la autenticación que había. Estaba
// escrito con una sola función precisamente para que sustituirlo no obligase a tocar ninguna ruta,
// y es lo que ha pasado: el E2 cambia el cuerpo de `usuarioDeLaPeticion` y ni la API ni las
// comprobaciones de permisos se enteran. Si cada ruta leyera la cookie por su cuenta, meter la
// sesión habría obligado a tocarlas todas y habría sido justo el momento en que se cuela una que se
// queda sin comprobar.
//
// LA COOKIE `persona` DEL E1 YA NO IDENTIFICA A NADIE
//
// No se lee en ningún sitio. Ahora la persona sale de la cookie de sesión, que lleva un testigo
// aleatorio del que solo se guarda el hash (app/_lib/sesion.js, app/_lib/testigos.js), y una sesión
// solo se abre canjeando un enlace de acceso que ha generado la jefatura
// (app/_lib/invitaciones.js). Las respuestas que abren o cierran sesión borran además la cookie
// vieja del navegador, para no dejar rodando algo que parece una credencial y no lo es.
// test/sesiones.js lo comprueba con una prueba explícita, porque si quedara un solo camino por el
// que esa cookie siguiera valiendo, todo lo demás no serviría de nada.
//
// Dos reglas que no se negocian:
//
//  1. **Se cierra, no se abre.** Sin persona reconocida el usuario es `null`, y quien recibe `null`
//     deniega. Nunca hay un usuario por omisión con permisos.
//  2. **Los permisos se comprueban en el servidor**, con core/permisos.js, que no cambia: esto es
//     *quién eres*, no *qué puedes*. El cliente solo refleja el candado.

'use strict';

const { sesionDeLaPeticion } = require('./sesion');

// Devuelve { _id, nombre, email, rol, departamento, activo } o null.
async function usuarioDeLaPeticion(peticion) {
  // Con el adaptador de memoria no hay nadie en la base de datos hasta que alguien la siembra, y
  // sembrar al pintar una página deja a las rutas de la API sirviendo vacío si se las llama antes de
  // abrir ninguna. Así que la siembra se asegura aquí, que es por donde pasan todas. Es idempotente,
  // no hace nada cuando hay base de datos de verdad —allí siembra `npm run sembrar`— y no hace nada
  // con el repositorio que inyectan las pruebas.
  //
  // Va antes de mirar la cookie y no después: la semilla crea las invitaciones con las que se entra
  // (app/_lib/semilla.js), y quien llega sin sesión es precisamente quien las necesita.
  try {
    await require('./semilla').asegurarSemilla();
  } catch (e) {
    // Una semilla que falla no puede dejar la aplicación sin reconocer a quien ya tiene sesión.
  }

  const abierta = await sesionDeLaPeticion(peticion);
  return abierta ? abierta.usuario : null;
}

const SIN_IDENTIFICAR = () => Response.json(
  { error: 'sin_identificar', mensaje: 'No has entrado: pide a la jefatura de tu departamento un enlace de acceso.' },
  { status: 401, headers: { 'Cache-Control': 'no-store' } },
);

const SIN_PERMISO = (mensaje) => Response.json(
  { error: 'sin_permiso', mensaje: mensaje || 'No tienes permiso para esto.' },
  { status: 403, headers: { 'Cache-Control': 'no-store' } },
);

module.exports = { usuarioDeLaPeticion, SIN_IDENTIFICAR, SIN_PERMISO };
