// POST /api/invitaciones — la jefatura da de alta a una persona y recibe su enlace de acceso.
//
// Es la puerta de entrada de la aplicación: nadie se registra, a todo el mundo lo da de alta la
// jefatura de su departamento (app/_lib/invitaciones.js explica por qué y qué caduca cuándo).
//
// LA RESPUESTA LLEVA EL ENLACE, PORQUE TODAVÍA NO HAY CORREO
//
// La aplicación no sabe mandar correos, así que devuelve el enlace para que la jefatura lo copie y
// lo haga llegar por donde quiera, y lo dice en la propia respuesta (`aviso`). Mandarlo solo es
// trabajo posterior. La alternativa —una pantalla que diga «te hemos enviado un correo» sin
// enviarlo— es peor: deja a la persona esperando algo que no va a llegar.
//
// QUIÉN DA DE ALTA A QUIÉN
//
//   - solo `admin` y `jefe_departamento`: la jefatura de estudios ve todos los departamentos y no
//     edita nada (core/permisos.js), y un docente no da de alta a nadie;
//   - la jefatura de departamento, solo en SU departamento;
//   - y nadie por encima de su propio rango: una jefatura de departamento no crea admins ni
//     jefaturas de estudios. Si pudiera, se daría de alta un admin con otro correo suyo y entraría
//     como él, que es escalar el propio rol por la puerta de atrás.
//
// Darse de alta a uno mismo no abre ninguna puerta: el correo ya existe en el censo, así que sale un
// 400 que remite a `POST /api/personas/[id]/invitacion`, que respeta las mismas reglas de rango.

'use strict';

const { obtenerRepositorio } = require('../repositorio');
const { usuarioDeLaPeticion } = require('../usuario');
const {
  PUEDEN_INVITAR, RANGO, ROLES_CONOCIDOS,
  puedeOtorgar, crearInvitacion, baseDeLaPeticion, enlaceDe, avisoDelEnlace,
} = require('../invitaciones');
const {
  conErrores, leerJson, texto, malaPeticion, SIN_IDENTIFICAR, SIN_PERMISO,
} = require('./comun');

// Lo justo para descartar un error de escritura, no para validar que la dirección existe: eso solo
// se sabe mandando un correo, y de momento el correo lo manda una persona a mano.
const PARECE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// La persona, tal como sale al cliente. El correo sí sale aquí —a diferencia del E1, donde la lista
// de personas se servía sin identificar— porque quien pregunta es la jefatura y acaba de escribirlo.
const comoSale = (u) => ({
  _id: u._id,
  nombre: u.nombre,
  email: u.email,
  rol: u.rol,
  departamento: u.departamento,
  activo: u.activo !== false,
});

const POST = conErrores(async (peticion) => {
  const usuario = await usuarioDeLaPeticion(peticion);
  if (!usuario) return SIN_IDENTIFICAR();
  if (!PUEDEN_INVITAR.includes(usuario.rol)) {
    return SIN_PERMISO('Solo la jefatura de tu departamento puede dar de alta a alguien.');
  }

  const { fallo, cuerpo } = await leerJson(peticion);
  if (fallo) return fallo;

  const nombre = texto(cuerpo, 'nombre');
  const email = (texto(cuerpo, 'email') || '').toLowerCase() || null;
  const rol = texto(cuerpo, 'rol');
  // Sin departamento, el de quien da de alta: es lo que quiere decir una jefatura que da de alta a
  // alguien de su departamento, que es el caso normal.
  const departamento = texto(cuerpo, 'departamento') || usuario.departamento;

  if (!nombre) return malaPeticion('Falta el nombre de la persona.');
  if (!email) return malaPeticion('Falta el correo de la persona.');
  if (!PARECE_CORREO.test(email)) return malaPeticion(`«${email}» no parece un correo electrónico.`);
  if (!rol) return malaPeticion('Falta el rol.');
  if (!ROLES_CONOCIDOS.includes(rol)) {
    return malaPeticion(`El rol «${rol}» no existe: usa ${ROLES_CONOCIDOS.join(', ')}.`);
  }

  // Los dos motivos para negarse se separan porque son dos cosas distintas que hay que poder leer en
  // la pantalla: «ese no es tu departamento» y «eso es más rango que el tuyo».
  if (usuario.rol !== 'admin' && departamento !== usuario.departamento) {
    return SIN_PERMISO('Solo puedes dar de alta a personas de tu propio departamento.');
  }
  if ((RANGO[rol] || 0) > (RANGO[usuario.rol] || 0)) {
    return SIN_PERMISO(`No puedes dar de alta a alguien con el rol «${rol}»: es más rango que el tuyo.`);
  }
  // La misma regla, pedida a un solo sitio. Si las tres comprobaciones de arriba se separaran de
  // ella algún día, esta es la que manda.
  if (!puedeOtorgar(usuario, rol, departamento)) {
    return SIN_PERMISO('No puedes dar de alta a alguien así.');
  }

  const repo = obtenerRepositorio();

  // El censo no admite dos correos iguales (ErrorDuplicado), y además no hay que dar de alta dos
  // veces a la misma persona: si ya está, lo que se quiere es otro enlace, y eso tiene su propia
  // ruta porque es otra cosa (no crea a nadie y anula el enlace anterior).
  const ya = await repo.usuarios.porEmail(email);
  if (ya) {
    return malaPeticion(`${ya.nombre} ya está dado de alta con ese correo. `
      + 'Si necesita otro enlace, se le puede volver a invitar desde la lista de personas.');
  }

  const persona = await repo.usuarios.crear({ nombre, email, rol, departamento, activo: true });
  const { invitacion, testigo } = await crearInvitacion(repo, { usuario: persona, creadaPor: usuario._id });

  return Response.json({
    persona: comoSale(persona),
    enlace: enlaceDe(baseDeLaPeticion(peticion), testigo),
    invitacion: { expiraEn: invitacion.expiraEn, estado: invitacion.estado },
    aviso: avisoDelEnlace(invitacion),
  }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
});

module.exports = { POST, comoSale };
