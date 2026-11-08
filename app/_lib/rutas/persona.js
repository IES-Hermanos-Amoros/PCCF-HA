// PATCH /api/personas/[id] — corregir el nombre o el correo de alguien, cambiarle el rol, darlo de
// baja o volverlo a activar.
//
// Cuerpo: `{ nombre?, email?, rol?, activo? }`. Lo que no se manda no se toca.
//
// EL NOMBRE Y EL CORREO SÍ SE PUEDEN CORREGIR A UNO MISMO
//
// A diferencia del rol, corregirse el nombre no es ascenderse: es arreglar una errata. Antes no se
// podía, y una letra mal en el alta obligaba a dar de baja a la persona y crearla otra vez, con lo
// que se perdían sus asignaciones. El rol sigue sin poder cambiárselo uno mismo.
//
// CAMBIAR EL CORREO ANULA LOS ENLACES PENDIENTES
//
// Si el correo estaba mal, el enlace que se generó en el alta pudo mandarse a la dirección
// equivocada, y un enlace de acceso es la llave de esa persona. Corregir la dirección sin retirar la
// llave dejaría la puerta abierta durante siete días a quien tuviera el correo viejo. Así que al
// cambiarlo se anulan los enlaces sin usar y la respuesta avisa de que hay que mandar otro.
//
// Las sesiones abiertas NO se tocan: la sesión guarda el identificador de la persona, no su correo,
// así que quien ya estaba dentro sigue dentro y es quien siempre fue.
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
const { PARECE_CORREO } = require('./invitaciones');
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

  const nombre = texto(cuerpo, 'nombre');
  const email = (texto(cuerpo, 'email') || '').toLowerCase() || null;
  const rol = texto(cuerpo, 'rol');
  const activo = cuerpo.activo;
  const esYoMismo = String(persona._id) === String(usuario._id);

  if (nombre === null && cuerpo.nombre !== undefined) {
    return malaPeticion('El nombre tiene que ser un texto, y no puede quedarse vacío.');
  }
  if (email === null && cuerpo.email !== undefined) {
    return malaPeticion('El correo tiene que ser un texto, y no puede quedarse vacío.');
  }
  if (rol === null && cuerpo.rol !== undefined) {
    return malaPeticion('El rol tiene que ser una cadena con uno de los cuatro roles.');
  }
  if (activo !== undefined && typeof activo !== 'boolean') {
    return malaPeticion('El campo «activo» solo puede ser true o false.');
  }
  if (nombre === null && email === null && rol === null && activo === undefined) {
    return malaPeticion('No has pedido ningún cambio: manda «nombre», «email», «rol» o «activo».');
  }

  const cambios = {};

  if (nombre !== null) {
    if (nombre.length > 120) {
      return malaPeticion('El nombre no puede pasar de 120 caracteres.');
    }
    if (nombre !== persona.nombre) cambios.nombre = nombre;
  }

  if (email !== null) {
    if (!PARECE_CORREO.test(email)) {
      return malaPeticion(`«${email}» no parece un correo electrónico.`);
    }
    if (email !== persona.email) {
      // El correo identifica a una persona: dos iguales harían imposible saber a quién se da de alta.
      const otra = await repo.usuarios.porEmail(email);
      if (otra && String(otra._id) !== String(persona._id)) {
        return malaPeticion(`Ese correo ya es de ${otra.nombre}. Dos personas no pueden compartirlo.`);
      }
      cambios.email = email;
    }
  }

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

  // Si el correo era el equivocado, el enlace del alta pudo irse a esa dirección: se retira.
  let enlacesAnulados = 0;
  if (cambios.email && cambios.activo !== false) {
    enlacesAnulados = await repo.invitaciones.anularPendientes(persona._id);
  }

  let mensaje;
  if (cambios.activo === false) {
    mensaje = `${actualizada.nombre} queda de baja y se han cerrado sus sesiones (${sesionesRevocadas}).`;
  } else if (cambios.activo === true) {
    mensaje = `${actualizada.nombre} vuelve a estar activa, pero sus sesiones estaban revocadas: `
      + 'mándale un enlace nuevo para que pueda entrar.';
  } else {
    const partes = [];
    if (cambios.nombre) partes.push('el nombre');
    if (cambios.email) partes.push('el correo');
    if (cambios.rol) partes.push(`el rol, que pasa a ser ${actualizada.rol}`);
    mensaje = `Corregido ${partes.join(' y ')} de ${actualizada.nombre}.`;
    if (cambios.rol) mensaje += ' El rol vale desde su siguiente petición.';
    if (enlacesAnulados > 0) {
      mensaje += ` Se ha anulado el enlace que tenía sin usar, por si se había mandado a la `
        + 'dirección anterior: mándale otro.';
    }
  }

  return Response.json(
    { persona: comoSale(actualizada), sesionesRevocadas, enlacesAnulados, mensaje },
    { headers: { 'Cache-Control': 'no-store' } },
  );
});

module.exports = { PATCH };
