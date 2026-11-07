// La sesión actual.
//
//   GET    /api/sesion   quién soy
//   DELETE /api/sesion   cerrar sesión
//
// QUIÉN SOY
//
// La interfaz necesita saber quién es para pintar el candado, y no lo puede leer de la cookie: la
// cookie de sesión es `HttpOnly` y ningún JavaScript de la página la ve, que es justamente el punto
// (app/_lib/sesion.js). Así que lo pregunta, y quien contesta es el servidor, que es quien decide.
//
// Devuelve el rol porque es lo que la interfaz refleja, no lo que decide: cada ruta vuelve a
// comprobar los permisos con core/permisos.js. Un cliente que se invente el rol solo se miente a sí
// mismo.
//
// CERRAR SESIÓN REVOCA, NO BORRA LA COOKIE
//
// Borrar la cookie solo le dice al navegador que la olvide. Si alguien la copió antes —una extensión,
// un portátil compartido en el departamento, una captura de la cabecera—, seguiría valiendo hasta
// que caducara, y «he cerrado sesión» habría sido mentira. Así que se revoca la fila de la sesión,
// que es lo que `usuarioDeLaPeticion` comprueba en cada petición, y ADEMÁS se borra la cookie.
//
// Es idempotente: cerrar sesión sin tenerla devuelve 200 y borra las cookies igualmente. Un 401 al
// salir dejaría a la interfaz teniendo que tratar como error lo único que quería conseguir.

'use strict';

const { obtenerRepositorio } = require('../repositorio');
const { sesionDeLaPeticion, cabecerasSinSesion } = require('../sesion');
const { conErrores, SIN_IDENTIFICAR } = require('./comun');

const GET = conErrores(async (peticion) => {
  const abierta = await sesionDeLaPeticion(peticion);
  if (!abierta) return SIN_IDENTIFICAR();

  const { usuario, sesion } = abierta;
  return Response.json({
    persona: {
      _id: usuario._id,
      nombre: usuario.nombre,
      email: usuario.email,
      rol: usuario.rol,
      departamento: usuario.departamento,
    },
    // De la sesión solo sale cuándo empezó y cuándo caduca: el testigo vive en la cookie y de ahí no
    // se saca, ni para la propia interfaz.
    sesion: { creado: sesion.creado, expiraEn: sesion.expiraEn },
  }, { headers: { 'Cache-Control': 'no-store' } });
});

const DELETE = conErrores(async (peticion) => {
  const abierta = await sesionDeLaPeticion(peticion);
  let cerrada = false;

  if (abierta) {
    const repo = obtenerRepositorio();
    cerrada = !!(await repo.sesiones.revocar(abierta.sesion._id));
  }

  return Response.json(
    { cerrada, mensaje: cerrada ? 'Sesión cerrada.' : 'No había ninguna sesión abierta.' },
    { headers: cabecerasSinSesion() },
  );
});

module.exports = { GET, DELETE };
