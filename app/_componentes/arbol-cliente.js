// Lo que el navegador necesita del árbol además de pintarlo: el índice por
// clave, el recorrido lineal y el estado agregado de cada rama.
//
// El árbol lo monta `core/arbol.js` en el servidor y llega ya masticado por
// `GET /api/documentos/[id]/arbol`: nodos con título, numeración, `relleno` y
// `puedeEditar`. Aquí NO se recalcula nada de eso. Lo que se calcula es lo que
// solo tiene sentido con el árbol entero delante y cambia al plegar y desplegar:
//
//   indexar()  la clave de cada nodo -> el nodo y su camino desde la raíz,
//              que es lo que pintan las migas y lo que usa la flecha izquierda
//              del teclado para subir al padre
//   lineal     el recorrido en orden de lectura, que es el de «anterior» y
//              «siguiente» y el del tomo impreso
//   estados()  el estado de una rama a partir de sus hijas
//
// El recorrido NO se reordena por nada: el orden de las unidades es el de
// creación, que es el del documento y el del PDF (core/arbol.js).

'use client';

import { esRevisado } from './arrastre-cliente';

// ---------------------------------------------------------------- índice y recorrido

// Devuelve { indice, lineal }. `lineal` deja fuera la raíz: la portada del
// documento no es un apartado del recorrido, es de donde se sale.
export function indexar(raiz) {
  const indice = new Map();
  const lineal = [];

  (function rec(nodo, camino) {
    const propio = camino.concat([nodo]);
    indice.set(nodo.clave, { nodo, camino: propio });
    if (nodo.tipo !== 'raiz') lineal.push({ nodo, camino: propio });
    for (const hijo of nodo.hijos || []) rec(hijo, propio);
  })(raiz, []);

  return { indice, lineal };
}

// ---------------------------------------------------------------- estados

// De `relleno` y `origen` a los cuatro estados que se saben (ver etiquetas.js:
// «con errores» necesita que /arbol mande los avisos y no se finge que exista).
//
// EL ÁRBOL DICE SI ESTÁ HECHO Y BIEN, Y «BIEN» INCLUYE QUE ALGUIEN LO HAYA
// MIRADO ESTE CURSO (punto 6 y punto 7 de docs/mockup-v2/CAMBIOS.md). Un
// apartado heredado del curso pasado que nadie ha tocado está PENDIENTE aunque
// esté lleno de texto: sale `completo` y no `validado`, y por eso el progreso da
// un número más bajo que el de antes y es el que dice cuánto trabajo queda.
//
// `cambios` son las correcciones de ESTA SESIÓN: `relleno` y `origen` los
// calculó el servidor al mandar el árbol, y después de escribir en un apartado
// —o de darlo por revisado— el icono seguiría diciendo lo de antes hasta recargar
// la página. Se pasa un mapa de correcciones `clave -> { relleno, origen }` en
// lugar de volver a pedir el árbol entero —250 apartados— en cada autoguardado.
const estadoHoja = (nodo, cambios) => {
  const local = cambios ? cambios.get(nodo.clave) : null;
  const escrito = local && local.relleno !== undefined ? local.relleno : nodo.relleno;
  if (!escrito) return 'vacio';
  const origen = local && local.origen !== undefined ? local.origen : nodo.origen;
  // Sin `origen` —un árbol de antes del arrastre, o un apartado sin fila— no se
  // puede decir que esté revisado, así que se queda en «con contenido»: es lo
  // único honrado que se sabe.
  return esRevisado(origen) ? 'validado' : 'completo';
};

// El estado de una rama a partir de sus hijas y del suyo propio, con la misma
// regla que el prototipo (`agregar` de docs/mockup-v2/js/ui.js): «incompleto»
// solo le pasa a las ramas, y significa que hay cosas hechas pero falta alguna.
// Una rama entera vacía se dice vacía, no incompleta, porque no se ha empezado; y
// una rama es `validado` solo si lo está TODO lo que tiene dentro, que es lo que
// convierte el árbol en el mapa de lo que queda por revisar.
function agregar(estados) {
  if (!estados.length) return null;
  if (estados.every((x) => x === 'vacio')) return 'vacio';
  if (estados.some((x) => x === 'vacio' || x === 'incompleto')) return 'incompleto';
  return estados.every((x) => x === 'validado') ? 'validado' : 'completo';
}

// Devuelve Map(clave -> { propio, agregado, bloqueado }).
//
// `bloqueado` de un nodo de paso —una unidad, un bloque— sale de sus hijos: la
// unidad en sí no se edita, pero si no puedes tocar nada de dentro, en el árbol
// tiene que verse cerrada. Es la misma regla del prototipo, con el `puedeEditar`
// que manda el servidor en lugar de uno calculado aquí.
export function estados(raiz, cambios) {
  const mapa = new Map();

  (function rec(nodo) {
    const hijos = (nodo.hijos || []).map(rec);
    const propio = nodo.contenido ? estadoHoja(nodo, cambios) : null;
    const todos = hijos.map((h) => h.agregado).filter(Boolean).concat(propio ? [propio] : []);
    const agregado = agregar(todos);

    const bloqueado = nodo.contenido
      ? !nodo.puedeEditar
      : hijos.length > 0 && hijos.every((h) => h.bloqueado);

    mapa.set(nodo.clave, { propio, agregado, bloqueado });
    return { agregado, bloqueado };
  })(raiz);

  return mapa;
}

// ---------------------------------------------------------------- el progreso

// EL PROGRESO CUENTA REVISIÓN, NO RELLENO (punto 7 de docs/mockup-v2/CAMBIOS.md).
//
// El recuento de verdad lo manda el servidor en `revision` (apartados, revisados,
// heredados y pendientes), y es el que se enseña: la regla de qué cuenta como
// revisado vive allí (`esRevisado` de app/_lib/rutas/comun.js) y un segundo total
// calculado aquí podría discrepar del suyo.
//
// Esto es solo la CORRECCIÓN de esta sesión sobre ese recuento, el mismo apaño que
// ya se hacía con `relleno`: al validar o al escribir en un apartado, el número
// tiene que moverse sin volver a pedir el árbol de 250 nodos. Devuelve cuántos
// apartados han pasado a contar como revisados (o han dejado de contar) desde que
// llegó el árbol.
export function correccionDeRevision(indice, cambios) {
  if (!cambios || !cambios.size) return 0;
  let delta = 0;
  for (const [clave, local] of cambios) {
    const entrada = indice.get(clave);
    if (!entrada || !entrada.nodo.contenido) continue;
    const antes = esRevisado(entrada.nodo.origen);
    const ahora = esRevisado(local.origen !== undefined ? local.origen : entrada.nodo.origen);
    if (ahora && !antes) delta += 1;
    else if (!ahora && antes) delta -= 1;
  }
  return delta;
}

// ---------------------------------------------------------------- buscador

// Un nodo coincide si coincide él o alguna de sus hijas: si no, al buscar
// «ponderaciones» desaparecerían los once módulos que las contienen y no habría
// forma de llegar a ninguna.
export function coincide(nodo, q) {
  if (!q) return true;
  if ((nodo.titulo + ' ' + (nodo.num || '')).toLowerCase().includes(q)) return true;
  return (nodo.hijos || []).some((h) => coincide(h, q));
}

// ---------------------------------------------------------------- el camino abierto

// Las claves que hay que tener desplegadas para que un nodo se vea. Se usa al
// llegar por un enlace pegado: el apartado está a cuatro niveles de profundidad y
// el árbol tiene que abrirse hasta él.
export function abiertosHasta(indice, clave) {
  const e = indice.get(clave);
  if (!e) return [];
  return e.camino.filter((n) => (n.hijos || []).length > 0).map((n) => n.clave);
}
