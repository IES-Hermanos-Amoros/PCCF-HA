// POST /api/personas/[id]/invitacion — otro enlace para quien perdió el suyo.
//
// Es el caso corriente, no la excepción: el enlace se queda en un correo que se borra, caduca
// después de siete días, o la sesión se acaba al cabo de noventa (app/_lib/sesion.js). Mientras la
// aplicación no sepa mandar correos, esto es también la única forma de que alguien vuelva a entrar,
// porque no puede pedirse el enlace a sí mismo: no hay a dónde mandárselo.
//
// ANULA EL ANTERIOR. Lo hace `crearInvitacion` (app/_lib/invitaciones.js) y es la parte que importa:
// si el enlace viejo siguiera sirviendo, uno mandado por error a la dirección equivocada no se
// podría retirar de ninguna manera. El enlace que vale es siempre el último.
//
// Las reglas de quién puede hacerlo son las de `abrirPersona`: solo `admin` y `jefe_departamento`,
// solo en su departamento, y nunca a alguien de más rango. No crea a nadie, así que no hay nada que
// escalar; lo que no puede pasar es que una jefatura se mande a sí misma el enlace de un admin y
// entre como él.

'use strict';

const { crearInvitacion, baseDeLaPeticion, enlaceDe, avisoDelEnlace } = require('../invitaciones');
const { conErrores, malaPeticion, abrirPersona } = require('./comun');

const POST = conErrores(async (peticion, parametros) => {
  const abierta = await abrirPersona(peticion, parametros);
  if (abierta.fallo) return abierta.fallo;
  const { usuario, persona, repo } = abierta;

  // A quien está de baja no se le manda un enlace que no va a abrir nada: se dice qué hacer antes.
  if (persona.activo === false) {
    return malaPeticion(`${persona.nombre} está de baja: su enlace no abriría nada. `
      + 'Actívala primero y vuelve a invitarla.');
  }

  const { invitacion, testigo } = await crearInvitacion(repo, { usuario: persona, creadaPor: usuario._id });

  return Response.json({
    persona: { _id: persona._id, nombre: persona.nombre, email: persona.email, rol: persona.rol },
    enlace: enlaceDe(baseDeLaPeticion(peticion), testigo),
    invitacion: { expiraEn: invitacion.expiraEn, estado: invitacion.estado },
    aviso: avisoDelEnlace(invitacion),
  }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
});

module.exports = { POST };
