// Las invitaciones: cómo se da de alta a una persona y cómo se construye su enlace de acceso.
//
// LA DECISIÓN
//
// El profesorado NO se registra. La jefatura de departamento da de alta a cada persona con su correo
// y la aplicación genera un enlace que esa persona usa para entrar una vez; al entrar se le abre una
// sesión (app/_lib/sesion.js). No hay contraseñas que recordar ni que recuperar, no hay cuentas de
// Google, y no se depende del directorio de la Conselleria, que no controlamos y que cambia sin
// avisarnos. Lo que sí hay que cuidar es el enlace, porque es la llave.
//
// TODAVÍA NO HAY FORMA DE MANDAR CORREO, Y LA RESPUESTA LO DICE
//
// El alta DEVUELVE el enlace para que la jefatura lo copie y lo haga llegar por donde quiera.
// Mandarlo automáticamente es trabajo posterior: hace falta un servicio de correo, una dirección
// remitente del centro y decidir qué pasa cuando un envío falla. Hasta entonces es mejor esto que
// una pantalla que diga «te hemos enviado un correo» y no lo envíe, que es la forma más rápida de
// que nadie se fíe de la herramienta.
//
// POR QUÉ 7 DÍAS
//
// Un enlace de acceso es una llave que viaja por correo y se queda en la bandeja de entrada. Siete
// días cubren un fin de semana largo o una semana de vacaciones —el caso real: se da de alta al
// departamento en septiembre y alguien lo lee el lunes siguiente— y no mucho más, porque pasado ese
// plazo lo que queda en el correo es una llave olvidada. Si caduca, la jefatura manda otro: eso es
// `POST /api/personas/[id]/invitacion`, y anula el anterior.
//
// NADIE INVITA POR ENCIMA DE SU RANGO
//
// `core/permisos.js` dice quién ve y quién edita CONTENIDO, y no tiene por qué saber de altas: no se
// toca. El orden de rango para dar de alta y para cambiar roles vive aquí, que es el único sitio que
// lo necesita. Un jefe de departamento da de alta docentes y otra jefatura de departamento, pero no
// crea admins ni jefaturas de estudios, porque eso sería ascenderse a sí mismo por la puerta de
// atrás: se daría de alta un admin con su propio correo alternativo y entraría como él.

'use strict';

const { nuevoTestigo } = require('./testigos');

// Quién da de alta. La jefatura de estudios no está: ve todos los departamentos y no edita nada
// (core/permisos.js), y dar de alta al profesorado de un departamento es del departamento. Un
// docente, tampoco.
const PUEDEN_INVITAR = ['admin', 'jefe_departamento'];

// El orden de rango. Mayor número, más rango. Solo se usa para comparar: nunca para decidir qué
// puede hacer alguien con un documento, que es cosa de core/permisos.js.
const RANGO = {
  docente: 1,
  jefe_departamento: 2,
  jefe_estudios: 3,
  admin: 4,
};

const DIAS_INVITACION = 7;
const SEGUNDOS_INVITACION = DIAS_INVITACION * 24 * 60 * 60;

// El camino del enlace. Es una ruta de la API y no una vista porque tiene que funcionar pinchándolo
// desde el correo, sin que haya pantalla ninguna: canjea y redirige a la portada. Cuando el E2
// termine la interfaz, lo natural es que apunte a una página que haga el POST.
const CAMINO_ACCESO = '/acceso';
const PARAMETRO = 't';

const ROLES_CONOCIDOS = Object.keys(RANGO);

// Si `quien` puede dar de alta —o cambiar el rol de— alguien con el rol `rol` en `departamento`.
//
// Las tres condiciones, y las tres hacen falta:
//   1. tiene que ser de los que dan de alta;
//   2. no por encima de su propio rango (`<=`, así que una jefatura de departamento puede nombrar
//      otra jefatura de departamento, que es lo que pasa cuando se releva el cargo);
//   3. y en su propio departamento, salvo el admin, que es la coordinación técnica del centro.
function puedeOtorgar(quien, rol, departamento) {
  if (!quien || !PUEDEN_INVITAR.includes(quien.rol)) return false;
  if (!ROLES_CONOCIDOS.includes(rol)) return false;
  if (RANGO[rol] > RANGO[quien.rol]) return false;
  if (quien.rol !== 'admin' && departamento !== quien.departamento) return false;
  return true;
}

// Crea la invitación y devuelve el testigo UNA sola vez: lo guardado es su hash. Anula de paso las
// invitaciones que esa persona tuviera pendientes, porque el enlace que vale es el último que se ha
// mandado; si el viejo siguiera sirviendo, un enlace mandado a una dirección equivocada no se podría
// retirar de ninguna forma.
async function crearInvitacion(repo, { usuario, creadaPor = null, ahora = new Date() }) {
  const { testigo, tokenHash } = nuevoTestigo();
  const expiraEn = new Date(ahora.getTime() + SEGUNDOS_INVITACION * 1000);

  await repo.invitaciones.anularPendientes(String(usuario._id), ahora);
  const invitacion = await repo.invitaciones.crear({
    usuarioId: String(usuario._id),
    // El correo, el rol y el departamento se copian en la invitación además de estar en la persona:
    // así el registro dice a quién se invitó y como qué, aunque después se le cambie el rol.
    email: usuario.email,
    rol: usuario.rol,
    departamento: usuario.departamento,
    tokenHash,
    expiraEn,
    creadaPor: creadaPor ? String(creadaPor) : null,
  });

  return { invitacion, testigo };
}

// La dirección pública de la aplicación. Se resuelve en este orden:
//
//   1. PCCF_URL_BASE, que es lo único fiable detrás de un proxy o de un dominio propio;
//   2. las cabeceras que pone el proxy (`x-forwarded-host`), porque `peticion.url` dentro de una
//      función serverless puede ser una dirección interna;
//   3. el origen de la petición, que es lo que vale en desarrollo.
//
// Importa que salga bien porque este enlace se copia y se manda por correo: uno que apunte a
// `http://localhost:3000` desde producción no lo puede abrir nadie.
function baseDeLaPeticion(peticion) {
  const configurada = process.env.PCCF_URL_BASE;
  if (configurada) return String(configurada).replace(/\/+$/, '');

  const cabecera = (nombre) => {
    const valor = peticion && peticion.headers && peticion.headers.get ? peticion.headers.get(nombre) : null;
    return valor ? String(valor).split(',')[0].trim() : null;
  };
  const host = cabecera('x-forwarded-host') || cabecera('host');
  if (host) return `${cabecera('x-forwarded-proto') || 'https'}://${host}`;
  return new URL(peticion.url).origin;
}

// El testigo va en la cadena de consulta, que es lo que permite que el enlace sea un enlace. Tiene
// un coste conocido: las cadenas de consulta acaban en los registros del servidor y en la cabecera
// `Referer` de la primera navegación. Se acepta porque el testigo es de un solo uso y de siete días,
// y porque en cuanto se canjea deja de valer; a cambio, el enlace se pincha y ya está.
const enlaceDe = (base, testigo) => `${base}${CAMINO_ACCESO}?${PARAMETRO}=${encodeURIComponent(testigo)}`;

// El aviso que acompaña al enlace. Está aquí y no en la ruta para que lo digan igual el alta, el
// «vuelve a invitar» y la siembra de desarrollo.
const avisoDelEnlace = (invitacion) => 'La aplicación todavía no manda correos: copia este enlace y '
  + 'hazlo llegar a esa persona por donde quieras. Es de un solo uso y caduca el '
  + `${new Date(invitacion.expiraEn).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}.`;

module.exports = {
  PUEDEN_INVITAR,
  RANGO,
  ROLES_CONOCIDOS,
  DIAS_INVITACION,
  SEGUNDOS_INVITACION,
  CAMINO_ACCESO,
  PARAMETRO,
  puedeOtorgar,
  crearInvitacion,
  baseDeLaPeticion,
  enlaceDe,
  avisoDelEnlace,
};
