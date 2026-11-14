// A QUIÉN AFECTA CONFIGURAR UN APARTADO. Lo calcula una sola función y lo dicen las dos familias de rutas
// que reforman la estructura: la de un módulo (estructura-modulo.js) y la de la plantilla común
// (estructura.js). Si cada una lo calculara por su cuenta, el aviso de la pantalla podría decir una cosa
// antes de guardar y la respuesta otra después.
//
//   seccion    el id del apartado
//   titulo     su título
//   comun      el apartado es del documento entero y no de un módulo
//   modulos    cuántos módulos lo ven distinto después del cambio: 1, o todos los del documento
//   personas   quién escribe en lo que se reforma. Solo id y nombre.
//   mensaje    una frase que la pantalla puede enseñar tal cual
//
// `unidad` es el módulo cuyo desvío se guarda (estructura-modulo.js). Sin `unidad` el cambio es el de la
// PLANTILLA COMÚN (estructura.js): lo ven todos los módulos, también si el apartado es de módulo, porque la
// plantilla es una sola y los once módulos la comparten. Por eso `modulos` no sale de `comun` sino de si
// hay unidad.

'use strict';

const C = require('../../../core/permisos');

async function alcanceDe({ repo, documento, unidad, seccion, info }) {
  const comun = !info.deUnidad;
  const todos = comun || !unidad;
  const unidades = todos ? await repo.unidades.listar(documento._id) : [unidad];
  const ids = new Set();
  for (const u of unidades) for (const id of u.docentes || []) ids.add(id);
  if (comun) {
    const asignaciones = documento.asignaciones || {};
    for (const k of [seccion, C.raizSeccion(seccion)]) for (const id of asignaciones[k] || []) ids.add(id);
  }
  const personas = [];
  for (const id of ids) {
    let p = null;
    try { p = await repo.usuarios.obtener(id); } catch (e) { p = null; }
    if (p) personas.push({ id: String(p._id), nombre: p.nombre || '' });
  }
  const titulo = info.seccion.titulo || seccion;
  const nombres = personas.map((p) => p.nombre).filter(Boolean).join(', ');
  const quien = personas.length ? ` Lo escriben ${nombres || `${personas.length} personas`}.` : '';
  let mensaje;
  if (comun) {
    mensaje = `«${titulo}» es un apartado común: reformarlo cambia el documento entero, los ${unidades.length} módulos a la vez.${quien}`;
  } else if (todos) {
    mensaje = `«${titulo}» es un apartado de módulo: cambiarlo en la plantilla lo cambia en los ${unidades.length} módulos a la vez.${quien}`;
  } else {
    mensaje = `«${titulo}» es un apartado de este módulo: reformarlo no cambia los demás.${quien}`;
  }
  return { seccion, titulo, comun, modulos: unidades.length, personas, mensaje };
}

module.exports = { alcanceDe };
