// PATCH /api/personas/[id] — cambiar el rol de alguien, darlo de baja o volverlo a activar.
//
// Cuerpo: `{ rol?, activo? }`. Lo que no se manda no se toca.
//
// NO SE PUEDE ESCALAR EL PROPIO ROL. Tres reglas, y las tres hacen falta:
//
//   1. nadie se cambia el rol a sí mismo, ni hacia arriba ni hacia abajo. Hacia arriba es el fallo
//      obvio; hacia abajo parece inofensivo y deja un departamento sin jefatura por un descuido;
//   2. nadie toca a alguien de más rango que él (lo comprueba `abrirPersona`), o una jefatura de
//      departamento podría degradar al admin y quedarse como el de más rango del centro;
//   3. y nadie otorga un rol por encima del suyo, que es la misma regla que al dar de alta y se
//      pide al mismo sitio (`puedeOtorgar`, app/_lib/invitaciones.js). Si no, bastaría con dar de
//      alta a un cómplice como docente y ascenderlo luego a admin.
//
// POR QUÉ CAMBIAR EL ROL NO CIERRA LA SESIÓN Y DAR DE BAJA SÍ
//
// La sesión guarda el identificador de la persona, no su rol: `usuarioDeLaPeticion` lee la persona
// del censo en cada petición, así que un rol nuevo vale desde la siguiente y no hace falta revocar
// nada. Si se revocara, cambiar un rol dejaría a esa persona fuera hasta que alguien le mandara otro
// enlace, y cambiar un rol no es echar a nadie.
//
// Dar de baja sí revoca todas sus sesiones. El campo `activo` ya basta para no dejarla entrar
// —`usuarioDeLaPeticion` lo comprueba—, pero las dos cosas se solapan a propósito: la revocación es
// lo que hace que la baja sea inmediata y comprobable mirando la base de datos, y la comprobación es
// lo que protege si algún día alguien desactiva a alguien sin revocarle nada.
//
// Volver a activar a alguien no le devuelve sus sesiones, que están revocadas: necesita otro enlace
// (`POST /api/personas/[id]/invitacion`). La respuesta lo dice.

'use strict';

const { RANGO, puedeOtorgar, ROLES_CONOCIDOS } = require('../invitaciones');
const {
  conErrores, leerJson, texto, malaPeticion, abrirPersona, SIN_PERMISO,
} = require('./comun');

const comoSale = (u) => ({
  _id: u._id,
  nombre: u.nombre,
  email: u.email,
  rol: u.rol,
  departamento: u.departamento,
  activo: u.activo !== false,
});

const PATCH = conErrores(async (peticion, parametros) => {
  const abierta = await abrirPersona(peticion, parametros);
  if (abierta.fallo) return abierta.fallo;
  const { usuario, persona, repo } = abierta;

  const { fallo, cuerpo } = await leerJson(peticion);
  if (fallo) return fallo;

  const rol = texto(cuerpo, 'rol');
  const activo = cuerpo.activo;
  const esYoMismo = String(persona._id) === String(usuario._id);

  if (rol === null && cuerpo.rol !== undefined) {
    return malaPeticion('El rol tiene que ser una cadena con uno de los cuatro roles.');
  }
  if (activo !== undefined && typeof activo !== 'boolean') {
    return malaPeticion('El campo «activo» solo puede ser true o false.');
  }
  if (rol === null && activo === undefined) {
    return malaPeticion('No has pedido ningún cambio: manda «rol», «activo», o los dos.');
  }

  const cambios = {};

  if (rol !== null) {
    if (!ROLES_CONOCIDOS.includes(rol)) {
      return malaPeticion(`El rol «${rol}» no existe: usa ${ROLES_CONOCIDOS.join(', ')}.`);
    }
    if (esYoMismo) {
      return SIN_PERMISO('No puedes cambiarte el rol a ti mismo: que te lo cambie otra jefatura o el admin.');
    }
    if ((RANGO[rol] || 0) > (RANGO[usuario.rol] || 0) || !puedeOtorgar(usuario, rol, persona.departamento)) {
      return SIN_PERMISO(`No puedes poner el rol «${rol}»: es más rango que el tuyo.`);
    }
    if (rol !== persona.rol) cambios.rol = rol;
  }

  if (activo !== undefined) {
    // Darse de baja a uno mismo es cerrarse la puerta por dentro: se queda sin sesión y sin forma de
    // volver a entrar salvo que otra jefatura le mande un enlace.
    if (esYoMismo && activo === false) {
      return SIN_PERMISO('No puedes darte de baja a ti mismo: te quedarías fuera de la aplicación.');
    }
    if (activo !== (persona.activo !== false)) cambios.activo = activo;
  }

  if (Object.keys(cambios).length === 0) {
    return Response.json(
      { persona: comoSale(persona), sesionesRevocadas: 0, mensaje: 'No había nada que cambiar.' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const actualizada = await repo.usuarios.actualizar(persona._id, cambios);

  // La baja, inmediata: quien estuviera dentro deja de estarlo en la siguiente petición. Y los
  // enlaces que tuviera sin usar se anulan, porque un enlace pendiente de alguien que ya no está es
  // una llave suelta: el canje comprueba también `activo`, pero dejar la invitación viva sería
  // guardar una puerta cerrada con la llave puesta.
  let sesionesRevocadas = 0;
  if (cambios.activo === false) {
    sesionesRevocadas = await repo.sesiones.revocarDeUsuario(persona._id);
    await repo.invitaciones.anularPendientes(persona._id);
  }

  const mensaje = cambios.activo === false
    ? `${actualizada.nombre} queda de baja y se han cerrado sus sesiones (${sesionesRevocadas}).`
    : cambios.activo === true
      ? `${actualizada.nombre} vuelve a estar activa, pero sus sesiones estaban revocadas: `
        + 'mándale un enlace nuevo para que pueda entrar.'
      : `${actualizada.nombre} pasa a ser ${actualizada.rol}. El cambio vale desde su siguiente petición.`;

  return Response.json(
    { persona: comoSale(actualizada), sesionesRevocadas, mensaje },
    { headers: { 'Cache-Control': 'no-store' } },
  );
});

module.exports = { PATCH };
