// GET /api/personas — las personas entre las que se elige mientras no haya sesión.
//
// LA ÚNICA RUTA QUE NO EXIGE PERSONA, Y A PROPÓSITO
//
// docs/api.md dice que sin persona reconocida se devuelve 401. Esta es la excepción, y no es un
// descuido: es la lista del desplegable con el que se elige quién eres (docs/plan.md §2.5). Si
// exigiera la cookie que ella misma sirve para poner, la aplicación no arrancaría nunca —no hay
// forma de elegir persona sin la lista de personas— y el E1 no se podría usar.
//
// Es, por tanto, el hueco de la identidad del E2 visto desde la API: cuando haya sesiones de verdad,
// esta ruta deja de hacer falta (o pasa a listar solo quien pueda ver el panel) y ninguna otra se
// entera, porque ninguna otra ruta la usa.
//
// Por eso no devuelve el email: una lista sin identificar es una lista pública, y el email del
// claustro no tiene que estar en una respuesta que cualquiera puede pedir. El nombre, el rol y el
// departamento son lo que pinta el desplegable, y son los tres campos que la vista necesita.

'use strict';

const { obtenerRepositorio } = require('../repositorio');
const { conErrores } = require('./comun');

const GET = conErrores(async () => {
  // Esta ruta no pasa por `usuarioDeLaPeticion`, que es donde se asegura la semilla
  // del adaptador de memoria, así que la asegura ella: es justo la primera que se pide.
  await require('../semilla').asegurarSemilla();
  const repo = obtenerRepositorio();
  const personas = (await repo.usuarios.listar({}))
    .map((u) => ({ _id: u._id, nombre: u.nombre, rol: u.rol, departamento: u.departamento }))
    // Por nombre: el repositorio los devuelve en orden de creación, que en un desplegable de
    // cuarenta personas no es ningún orden. `localeCompare` con 'es' para que la Ñ caiga donde toca.
    .sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'));

  return Response.json({ personas }, { headers: { 'Cache-Control': 'no-store' } });
});

module.exports = { GET };
