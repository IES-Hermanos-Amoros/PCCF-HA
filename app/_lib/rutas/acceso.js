// El canje del enlace de acceso: aquí es por donde se entra.
//
//   GET  /api/acceso?t=<testigo>   el enlace que se pincha desde el correo; abre sesión y redirige
//   POST /api/acceso               lo mismo con { testigo } en JSON, para la interfaz
//
// POR QUÉ EL ENLACE ES UN GET QUE REDIRIGE
//
// Porque tiene que funcionar pinchándolo, sin pantalla ninguna: la jefatura copia el enlace, lo
// manda por donde pueda, y la persona lo abre en su navegador. Un GET que cambia algo (gasta la
// invitación) no es bonito, y tiene un coste conocido: un cliente de correo o un antivirus que
// precargue el enlace puede gastarlo antes de que su dueño lo pinche, y entonces hay que mandar
// otro. Se acepta porque la alternativa —una página intermedia con un botón— es interfaz, y la
// interfaz del E2 es otra tarea; cuando exista, el enlace apuntará a ella y ella hará el POST, que
// ya está escrito aquí.
//
// LO QUE SE LE DICE A QUIEN LLEGA
//
// Un enlace que ya se usó, que se anuló porque se mandó otro, o que ha caducado, no puede fallar en
// seco: son los tres casos corrientes y hay que poder leer cuál es. Por eso son un 410 con un
// `motivo` (`usado`, `anulado`, `caducado`) y un mensaje en castellano que dice qué hacer. Un testigo
// inventado, en cambio, es un 404: no existe, y no hay nada más que contar.
//
//   | 410 | `enlace_gastado` | el enlace ya se usó, se anuló o caducó (lleva `motivo`) |
//
// Es la única fila que el E2 añade a la tabla de errores de docs/api.md. No se mete en el 400 porque
// la petición está bien escrita, ni en el 409, que en este contrato significa «alguien escribió ese
// apartado desde que lo leíste» y lleva `esperado` y `actual`.

'use strict';

const { obtenerRepositorio } = require('../repositorio');
const { hashDeTestigo, coincide } = require('../testigos');
const { abrirSesion, cabecerasConSesion, caducada } = require('../sesion');
const { PARAMETRO } = require('../invitaciones');
const {
  fallo, conErrores, leerJson, texto, malaPeticion, noEncontrado,
} = require('./comun');

const gastado = (motivo, mensaje) => fallo(410, 'enlace_gastado', mensaje, { motivo });

const MENSAJES = {
  usado: 'Ese enlace ya se ha usado. Si eras tú, ya tienes sesión en el navegador donde lo abriste; '
    + 'si no, pide otro a la jefatura de tu departamento.',
  anulado: 'Ese enlace se anuló al mandarte uno nuevo. Busca el último que te hayan enviado.',
  caducado: 'Ese enlace ha caducado. Pide otro a la jefatura de tu departamento.',
};

// La persona que acaba de entrar. Nunca sale nada de la sesión más que cuándo caduca: el testigo va
// en la cookie y de ahí no se saca (app/_lib/sesion.js).
const comoSale = (u) => ({
  _id: u._id, nombre: u.nombre, email: u.email, rol: u.rol, departamento: u.departamento,
});

// Canjea el testigo. Devuelve { fallo } o { persona, testigo: <el de la sesión>, sesion }.
async function canjear(testigo) {
  if (!testigo) return { fallo: malaPeticion('Falta el testigo del enlace de acceso.') };

  // Con el adaptador de memoria, quien llega aquí es justo quien todavía no ha pasado por ninguna
  // ruta que siembre, y sin semilla no hay invitaciones con las que entrar.
  try {
    await require('../semilla').asegurarSemilla();
  } catch (e) {
    // Una semilla que falla no debe impedir canjear un enlace de una base de datos de verdad.
  }

  const repo = obtenerRepositorio();

  let invitacion = null;
  try {
    invitacion = await repo.invitaciones.porHash(hashDeTestigo(testigo));
  } catch (e) {
    invitacion = null;
  }
  // Un testigo inventado no existe, y punto: no se dice si «existía pero caducó», porque eso ya es
  // información sobre un enlace que no es suyo.
  if (!invitacion) return { fallo: noEncontrado('Ese enlace de acceso no existe.') };

  // Segunda vuelta de llave, en tiempo constante: ver app/_lib/testigos.js.
  if (!coincide(testigo, invitacion.tokenHash)) {
    return { fallo: noEncontrado('Ese enlace de acceso no existe.') };
  }

  if (invitacion.estado === 'usada') return { fallo: gastado('usado', MENSAJES.usado) };
  if (invitacion.estado === 'anulada') return { fallo: gastado('anulado', MENSAJES.anulado) };

  // La misma comparación que para una sesión, pedida al mismo sitio.
  const ahora = new Date();
  if (caducada(invitacion, ahora)) return { fallo: gastado('caducado', MENSAJES.caducado) };

  const persona = await repo.usuarios.obtener(invitacion.usuarioId);
  if (!persona) {
    // La invitación apunta a alguien que ya no está en el censo. No se gasta la invitación: no hay
    // nada que abrir y el fallo no es de quien llega.
    return { fallo: noEncontrado('Ese enlace era de una persona que ya no está en el censo.') };
  }
  if (persona.activo === false) {
    return { fallo: gastado('anulado', 'Esa persona está dada de baja: su enlace no abre nada. '
      + 'Si es un error, la jefatura de tu departamento puede volver a activarla.') };
  }

  // EL USO ÚNICO SE DECIDE AQUÍ, Y EN UNA SOLA OPERACIÓN. Si `usar` devuelve null es que otra
  // petición con el mismo enlace llegó primero —un doble clic, o un cliente de correo que lo
  // precarga—, y entonces esta no abre nada.
  const marcada = await repo.invitaciones.usar(invitacion._id, ahora);
  if (!marcada) return { fallo: gastado('usado', MENSAJES.usado) };

  const { sesion, testigo: testigoSesion } = await abrirSesion(repo, persona._id, ahora);
  return { persona, sesion, testigo: testigoSesion };
}

// El enlace del correo. Al terminar redirige a la portada con un 303, que es el que convierte
// cualquier método en un GET y deja la barra de direcciones sin el testigo dentro: así no se queda
// en el historial del navegador ni se manda en la cabecera `Referer` de la siguiente navegación.
const GET = conErrores(async (peticion) => {
  const url = new URL(peticion.url);
  const r = await canjear(url.searchParams.get(PARAMETRO));
  if (r.fallo) return r.fallo;

  const cabeceras = cabecerasConSesion(r.testigo);
  cabeceras.set('Location', '/');
  return new Response(null, { status: 303, headers: cabeceras });
});

// El mismo canje para la interfaz, que prefiere saber quién ha entrado a ser redirigida.
const POST = conErrores(async (peticion) => {
  const { fallo: malJson, cuerpo } = await leerJson(peticion);
  if (malJson) return malJson;

  const r = await canjear(texto(cuerpo, 'testigo'));
  if (r.fallo) return r.fallo;

  return Response.json(
    { persona: comoSale(r.persona), sesion: { expiraEn: r.sesion.expiraEn } },
    { headers: cabecerasConSesion(r.testigo) },
  );
});

module.exports = { GET, POST };
