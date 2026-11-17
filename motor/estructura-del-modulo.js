// LA PLANTILLA TAL COMO LA VE UN MÓDULO: la común con la estructura propia del módulo aplicada.
//
// La regla de qué estructura sigue un módulo está escrita UNA vez, en core/estructura-modulo.js
// (`apartadosDeModulo` para los apartados, `camposDeSeccion` para los campos de cada uno). Este
// fichero no decide nada: solo aplica esas dos funciones a la plantilla entera y devuelve lo que
// pintan el árbol, el apartado, el PDF, el Word y el panel de comprobaciones. Así los cinco dicen lo
// mismo, y lo que se ve en la aplicación es lo que sale en el papel.
//
// Lo que devuelve son los apartados VIGENTES del módulo (sin los que retira ni lo que cuelga de
// ellos) y, en cada uno, solo los campos vigentes. Un módulo sin estructura propia recibe las
// MISMAS referencias de la plantilla, sin copiar nada: su documento sale como antes.
//
// `unidad` es la fila del módulo (`unidad.estructura`) o una instancia del motor que la lleve en
// `estructura` (la ruta de exportación la copia ahí desde la fila). Sin estructura, es la común.

'use strict';

const EstructuraModulo = require('../core/estructura-modulo');

// Misma lista, elemento a elemento: para devolver el nodo original cuando nada ha cambiado.
const mismos = (a, b) => a === b || (a.length === b.length && a.every((x, i) => x === b[i]));

// Un apartado ya resuelto con sus campos vigentes en este módulo y sus hijos resueltos.
function resolverNodo(nodo, unidad) {
  const campos = EstructuraModulo.camposDeSeccion(nodo, unidad).vigentes;
  const antes = Array.isArray(nodo.hijos) ? nodo.hijos : [];
  const hijos = antes.map((h) => resolverNodo(h, unidad));
  const iguales = mismos(campos, Array.isArray(nodo.campos) ? nodo.campos : []) && mismos(hijos, antes);
  return iguales ? nodo : { ...nodo, campos, hijos };
}

// Los apartados de módulo que lleva esta unidad, resueltos. Un documento sin módulos da [].
function seccionesDelModulo(plantilla, unidad) {
  const lista = EstructuraModulo.apartadosDeModulo(plantilla, unidad).vigentes;
  const resueltos = lista.map((s) => resolverNodo(s, unidad));
  return mismos(resueltos, lista) ? lista : resueltos;
}

// La plantilla con el bloque de módulos sustituido por lo que lleva esta unidad. Sin estructura
// propia devuelve la propia plantilla.
function plantillaDelModulo(plantilla, unidad) {
  const bloque = EstructuraModulo.bloqueDeUnidades(plantilla);
  if (!bloque) return plantilla;
  const hijos = seccionesDelModulo(plantilla, unidad);
  if (mismos(hijos, Array.isArray(bloque.hijos) ? bloque.hijos : [])) return plantilla;
  const sustituir = (lista) => lista.map((s) => {
    if (s === bloque) return { ...s, hijos };
    const dentro = Array.isArray(s.hijos) ? s.hijos : [];
    const nuevos = sustituir(dentro);
    return mismos(nuevos, dentro) ? s : { ...s, hijos: nuevos };
  });
  return { ...plantilla, secciones: sustituir(plantilla.secciones) };
}

module.exports = { seccionesDelModulo, plantillaDelModulo };
