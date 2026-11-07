// GET /api/personas — las personas del departamento.
//
// LO QUE ERA ESTA RUTA EN EL E1, Y POR QUÉ NO SE RETIRA
//
// Era la lista del desplegable con el que se elegía quién eras, y era la única excepción al 401: si
// hubiera exigido la cookie que ella misma servía para poner, la aplicación no habría tenido puerta
// de entrada. Esa excepción desaparece con el E2: ahora se entra canjeando un enlace de acceso
// (`GET /api/acceso`), que es la puerta, y esta ruta ya no tiene por qué dejar entrar a nadie.
//
// Se convierte en lugar de retirarse porque sigue haciendo falta, pero para otra cosa: es el censo
// del departamento. Lo pide el reparto de unidades para saber a quién se le puede asignar un módulo
// (app/_lib/rutas/unidades.js), y lo pide la jefatura para gestionar quién entra. Retirarla habría
// obligado a escribir otra ruta igual con otro nombre.
//
// LO QUE CAMBIA, Y HAY QUE SABERLO
//
//   - **exige sesión**: sin ella, 401 como todas las demás;
//   - **lleva el correo**, pero solo para quien gestiona personas. En el E1 no lo llevaba porque una
//     lista que se sirve sin identificar es una lista pública; dentro de una sesión, el censo del
//     propio departamento no es ningún secreto, pero el correo tampoco le hace falta a un docente
//     para ver quién lleva un módulo, así que no se le manda;
//   - lleva `activo` y, para quien gestiona, si la persona tiene un enlace pendiente de usar. Es la
//     pregunta de verdad de la pantalla de altas: «¿a quién he dado de alta que todavía no ha
//     entrado?».
//
// Nunca sale ningún testigo ni ningún hash: de las invitaciones solo sale su estado y su caducidad.

'use strict';

const C = require('../../../core/permisos');
const { obtenerRepositorio } = require('../repositorio');
const { usuarioDeLaPeticion } = require('../usuario');
const { PUEDEN_INVITAR } = require('../invitaciones');
const { conErrores, SIN_IDENTIFICAR } = require('./comun');

// Los dos roles que ven el centro entero, igual que en app/_lib/rutas/documentos.js.
const TODO_EL_CENTRO = ['admin', 'jefe_estudios'];

// Quién ve el correo de los demás: quien gestiona altas (admin y jefatura de departamento) y la
// jefatura de estudios, que ya ve los documentos de todos los departamentos.
const VEN_EL_CORREO = ['admin', 'jefe_estudios', 'jefe_departamento'];

const GET = conErrores(async (peticion) => {
  const usuario = await usuarioDeLaPeticion(peticion);
  if (!usuario) return SIN_IDENTIFICAR();

  const url = new URL(peticion.url);
  const pedido = url.searchParams.get('departamento');

  // Quien no ve el centro entero ve su departamento, pida lo que pida. Y además se filtra el
  // resultado con `puedeVer`, que es LA regla de core/permisos.js: lo primero es para no leer de
  // más, lo segundo es lo que de verdad protege (el mismo par que en /api/documentos).
  const filtro = {};
  if (TODO_EL_CENTRO.includes(usuario.rol)) {
    if (pedido) filtro.departamento = pedido;
  } else {
    filtro.departamento = usuario.departamento;
  }

  const repo = obtenerRepositorio();
  const gestiona = PUEDEN_INVITAR.includes(usuario.rol);
  const veElCorreo = VEN_EL_CORREO.includes(usuario.rol);

  // Las invitaciones pendientes, en una sola consulta en lugar de una por persona: con Mongo, una
  // consulta por fila es lo que convierte una lista de treinta personas en treinta viajes.
  const pendientes = new Map();
  if (gestiona) {
    for (const i of await repo.invitaciones.listar({ estado: 'pendiente' })) {
      pendientes.set(i.usuarioId, i);
    }
  }

  const personas = (await repo.usuarios.listar(filtro))
    .filter((u) => C.puedeVer(usuario, u))
    .map((u) => {
      const salida = {
        _id: u._id,
        nombre: u.nombre,
        rol: u.rol,
        departamento: u.departamento,
        // Ausente quiere decir activa (repositorio/index.js), así que aquí se normaliza a booleano y
        // la interfaz no tiene que acordarse de la regla.
        activo: u.activo !== false,
      };
      if (veElCorreo) salida.email = u.email;
      if (gestiona) {
        const i = pendientes.get(u._id);
        salida.invitacionPendiente = i ? { expiraEn: i.expiraEn } : null;
        salida.ultimoAcceso = u.ultimoAcceso || null;
        salida.haEntrado = !!u.ultimoAcceso;
      }
      return salida;
    })
    // Por nombre: el repositorio los devuelve en orden de creación, que en una lista de cuarenta
    // personas no es ningún orden. `localeCompare` con 'es' para que la Ñ caiga donde toca.
    .sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'));

  // `puedeGestionar` es solo para pintar el botón de dar de alta. Quien decide es el POST.
  return Response.json({ personas, puedeGestionar: gestiona }, { headers: { 'Cache-Control': 'no-store' } });
});

module.exports = { GET };
