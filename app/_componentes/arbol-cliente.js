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

// De `relleno` a los tres estados que el E1 sabe (ver etiquetas.js: los otros dos
// del prototipo necesitan el E4 y el E5 y no se finge que existan).
const estadoHoja = (nodo) => (nodo.relleno ? 'completo' : 'vacio');

// El estado de una rama a partir de sus hijas y del suyo propio, con la misma
// regla que el prototipo: «incompleto» solo le pasa a las ramas, y significa que
// hay cosas hechas pero falta alguna. Una rama entera vacía se dice vacía, no
// incompleta, porque no se ha empezado.
function agregar(estados) {
  if (!estados.length) return null;
  if (estados.every((x) => x === 'vacio')) return 'vacio';
  if (estados.some((x) => x === 'vacio' || x === 'incompleto')) return 'incompleto';
  return 'completo';
}

// Devuelve Map(clave -> { propio, agregado, bloqueado }).
//
// `bloqueado` de un nodo de paso —una unidad, un bloque— sale de sus hijos: la
// unidad en sí no se edita, pero si no puedes tocar nada de dentro, en el árbol
// tiene que verse cerrada. Es la misma regla del prototipo, con el `puedeEditar`
// que manda el servidor en lugar de uno calculado aquí.
export function estados(raiz) {
  const mapa = new Map();

  (function rec(nodo) {
    const hijos = (nodo.hijos || []).map(rec);
    const propio = nodo.contenido ? estadoHoja(nodo) : null;
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
