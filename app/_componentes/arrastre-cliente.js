// El arrastre entre cursos, por el lado del navegador: las tres direcciones del
// E5 y el diff que pinta la vista *Cambios*.
//
// Referencia: el punto 4 de docs/mockup-v2/CAMBIOS.md (la vista *Cambios*), el
// apartado «Arrastre entre cursos» de docs/mockup-v2/README.md y `vistaCambios`
// de docs/mockup-v2/js/ui.js, que es la especificación aprobada.
//
// ================================================================ EL DIFF NO ES SOBRE UNA CADENA
//
// El contenido de un campo de texto NO es texto: es el array de bloques que
// espera el generador del PDF (`core/bloques.js`), y comparar su `JSON.stringify`
// o su `innerText` sería comparar una serialización cualquiera. Lo que se hace
// aquí son dos niveles, que es como compara un diff de verdad:
//
//   1. LOS BLOQUES SE APLANAN A LÍNEAS (`lineasDeValor`). Un párrafo es una
//      línea; una lista NO es una línea, son sus elementos, cada uno con su
//      sangría; un `{ ref: 'c001' }` es una línea que dice que ahí va un texto
//      compartido, con su texto resuelto si viene en la respuesta. Así, de una
//      lista de diez elementos en la que cambió el tercero, se marca el tercero
//      y no la lista entera, que es lo que pasaría comparando el bloque como un
//      todo.
//
//   2. LAS LÍNEAS SE EMPAREJAN (`emparejar`) y dentro de cada pareja se compara
//      PALABRA POR PALABRA (`diffDePalabras`). El emparejado es el que decide
//      qué párrafo de este curso es «el mismo» que uno del curso pasado: las
//      líneas idénticas hacen de ancla —igual que en un diff de ficheros— y las
//      que quedan entre dos anclas se emparejan por posición. Lo que sobra por
//      un lado es una línea quitada o añadida entera, y se dice así.
//
// EL TEXTO DE UNA LÍNEA SE SACA CON `aMarcas`, Y NO CON `plano`
//
// `plano()` tira la negrita y la cursiva, así que un apartado en el que lo único
// que ha cambiado es que una frase ahora va en negrita saldría como «sin
// cambios», y es un cambio del documento: el PDF sale distinto. `aMarcas()` es
// la ÚNICA serialización del proyecto que garantiza la vuelta
// (`aMarcas(aTramos(x)) === x`, ver bloques-cliente.js), es la que ya se ve en
// el editor —quien escribe en esta herramienta ya teclea `**negrita**`— y marca
// el formato como lo que es para el diff: unas palabras más. Por eso se compara
// y se enseña lo mismo que se edita.
//
// UNA SOLA PASADA PARA LAS DOS COLUMNAS
//
// El prototipo llamaba a su LCS dos veces, una por columna (`marcarDiff(a, b)` y
// `marcarDiff(b, a)`), y nada garantizaba que las dos pasadas alinearan igual:
// la columna izquierda podía decir que una palabra se había quitado y la derecha
// no decir que se había puesto. Aquí el guion se calcula UNA vez y cada columna
// pinta su mitad (`quita` a la izquierda, `pon` a la derecha), así que no pueden
// contradecirse.
//
// SIN LIBRERÍAS
//
// Un diff de palabras es la subsecuencia común más larga y cabe en cien líneas;
// añadir una dependencia al paquete del navegador para esto no se paga. El tope
// de `TOPE_CELDAS` está porque la tabla es O(n·m): por encima de eso la línea se
// enseña como cambiada entera y se dice que no se ha comparado palabra por
// palabra, que es mejor que bloquear la pestaña.

'use client';

import { aMarcas } from './bloques-cliente';

// ================================================================ las direcciones del E5
//
// Las tres rutas del arrastre, en un solo sitio: son las que la otra tarea de
// este evolutivo acaba de construir (app/_lib/rutas/arrastre.js y las dos
// mitades nuevas de app/_lib/rutas/apartado.js). Si alguna cambia de nombre, se
// cambia aquí y en ningún otro fichero.

const base = (documentoId) => `/api/documentos/${encodeURIComponent(documentoId)}`;

const cola = ({ seccion, unidadId }) => new URLSearchParams(
  unidadId ? { seccion, unidad: unidadId } : { seccion },
).toString();

// POST: crea el documento del curso siguiente a partir de este. Cuerpo opcional
// `{ curso }`; sin él, el servidor propone el siguiente al del documento.
export const urlSiguienteCurso = (documentoId) => `${base(documentoId)}/siguiente-curso`;

// GET: el MISMO apartado en el documento del curso anterior, solo lectura.
// Devuelve lo mismo que el apartado normal y además `curso`, `anteriorId` y un
// `motivo` cuando no hay nada que enseñar (`sin_curso_anterior`, `seccion_nueva`,
// `unidad_nueva`, `sin_contenido`).
export const urlAnterior = (documentoId, nodo) => `${base(documentoId)}/anterior/apartado?${cola(nodo)}`;

// POST: deja el apartado en `origen: 'revisado'`, con quién y cuándo. Cuerpo
// `{ esperaUpdatedAt }`, la misma versión que el PATCH: revisar un texto que
// alguien acaba de cambiar sería dar por bueno algo que no has leído.
export const urlRevisar = (documentoId, nodo) => `${base(documentoId)}/apartado/revisar?${cola(nodo)}`;

// ================================================================ el curso y la procedencia

// La forma del curso, la misma que exigen la importación y el arrastre.
export const CURSO_RE = /^\d{4}-\d{2}$/;

// 2026-27 -> 2027-28. Es lo que se propone al crear el documento del curso
// siguiente; el servidor lo vuelve a calcular y es el que manda.
export function cursoSiguiente(curso) {
  if (!CURSO_RE.test(String(curso || ''))) return '';
  const anio = Number(String(curso).slice(0, 4)) + 1;
  return `${anio}-${String((anio + 1) % 100).padStart(2, '0')}`;
}

// QUÉ CUENTA COMO REVISADO
//
// La regla es del servidor —`esRevisado` de app/_lib/rutas/comun.js, que es
// quien calcula el recuento que manda `/arbol`— y aquí está escrita una segunda
// vez por una razón concreta: ese módulo es CommonJS del servidor, exige
// `repositorio/` por su cadena de dependencias y no se puede meter en el paquete
// del navegador (el mismo caso que `core/estructurados.js` explicado en
// ApartadoEditable.js). Lo que el cliente hace con esto es pintar el icono de
// cada nodo del árbol; EL NÚMERO del progreso sale de `revision`, que lo cuenta
// el servidor, para que no haya dos totales que puedan discrepar.
//
// Cuenta como revisado en cuanto alguien lo ha mirado: dado por bueno,
// reescrito, o escrito en este curso. Solo queda pendiente lo heredado sin
// mirar, aunque esté lleno de texto (docs/plan.md §2.1).
export { esRevisado } from '../../core/documento';

// ================================================================ bloques -> líneas

// El texto de un bloque suelto (el de un texto compartido, que es un bloque y no
// una lista de bloques).
function textoDeBloque(bloque) {
  if (!bloque || typeof bloque !== 'object') return '';
  if (bloque.type === 'list') {
    return (bloque.items || []).map((it) => aMarcas(it && it.text)).join('\n');
  }
  return aMarcas(bloque.text);
}

// La clave con la que dos líneas son «la misma»: el tipo, la sangría y el texto.
// La sangría entra a propósito: un elemento que se ha sangrado un nivel más es un
// cambio del documento —el PDF lo imprime en otro sitio— y tiene que verse.
export const claveDeLinea = (l) => (l.clave !== undefined && l.clave !== null
  ? l.clave
  : `${l.tipo}\u0000${l.nivel || 0}\u0000${l.texto}`);

// El valor de un campo de texto -> las líneas que se comparan. Devuelve [] si el
// valor no es una lista de bloques: eso lo decide quien llama (`esComparable`).
export function lineasDeValor(valor, compartidos) {
  if (!Array.isArray(valor)) return [];
  const salida = [];
  for (const b of valor) {
    if (!b || typeof b !== 'object') continue;

    // Un texto compartido es una referencia: la línea dice que ahí va c001 y
    // lleva su texto si la respuesta lo trae resuelto. Se compara por el `cid` y
    // por el texto, porque las dos cosas pueden cambiar de un curso a otro.
    if (typeof b.ref === 'string') {
      const c = compartidos ? compartidos[b.ref] : null;
      salida.push({
        tipo: 'ref',
        nivel: 0,
        ref: b.ref,
        resuelto: !!c,
        texto: c ? textoDeBloque(c.bloque) : '',
      });
      continue;
    }

    if (b.type === 'list') {
      // La lista NO es una línea: son sus elementos. Es lo que permite marcar
      // solo el elemento que cambió en una lista de diez.
      for (const it of (b.items || [])) {
        salida.push({ tipo: 'item', nivel: (it && it.level) || 0, texto: aMarcas(it && it.text) });
      }
      continue;
    }

    if (b.type === 'p') {
      salida.push({ tipo: 'p', nivel: 0, texto: aMarcas(b.text) });
      continue;
    }

    // Cualquier otro bloque que el importador haya dejado dentro de un campo de
    // texto (una tabla del Word, por ejemplo). No se compara palabra por
    // palabra porque no es prosa: se dice que está, y si su contenido cambia la
    // clave cambia y la línea sale como cambiada.
    salida.push({
      tipo: 'otro',
      nivel: 0,
      texto: `(${String(b.type || 'bloque')}${Array.isArray(b.filas) ? `, ${b.filas.length} filas` : ''})`,
      clave: `otro\u0000${JSON.stringify(b)}`,
    });
  }
  return salida;
}

// ================================================================ el guion (LCS)

// Hasta dónde se compara palabra por palabra. La tabla de la subsecuencia común
// más larga es O(n·m) celdas de dos bytes: con este tope son 3 MB en el peor
// caso, y por encima se enseña la línea como cambiada entera en lugar de dejar
// la pestaña colgada. Un párrafo de la programación real ronda las 80 palabras.
export const TOPE_CELDAS = 1500000;

// El guion para pasar de `a` a `b`, sobre dos listas de CLAVES. Devuelve
// `[{ op, i, j }]` con los índices en los arrays originales —no los valores—
// para que la misma función sirva para palabras y para líneas.
//
//   igual  a[i] === b[j]
//   quita  a[i] no está en b
//   pon    b[j] no está en a
function guion(a, b) {
  const n = a.length;
  const m = b.length;

  // La tabla se recorre de atrás hacia delante, igual que en el prototipo: así
  // el camino de vuelta sale en el orden del texto y no hay que darle la vuelta.
  const tabla = new Array(n + 1);
  for (let i = 0; i <= n; i += 1) tabla[i] = new Uint16Array(m + 1);
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      tabla[i][j] = a[i] === b[j]
        ? tabla[i + 1][j + 1] + 1
        : Math.max(tabla[i + 1][j], tabla[i][j + 1]);
    }
  }

  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { ops.push({ op: 'igual', i, j }); i += 1; j += 1; }
    else if (tabla[i + 1][j] >= tabla[i][j + 1]) { ops.push({ op: 'quita', i, j: -1 }); i += 1; }
    else { ops.push({ op: 'pon', i: -1, j }); j += 1; }
  }
  while (i < n) { ops.push({ op: 'quita', i, j: -1 }); i += 1; }
  while (j < m) { ops.push({ op: 'pon', i: -1, j }); j += 1; }
  return ops;
}

// ================================================================ palabra por palabra

// Las palabras y los espacios, por separado y sin perder nada: el texto se puede
// reconstruir juntando los trozos, que es lo que permite pintarlo tal cual.
const trocear = (texto) => String(texto == null ? '' : texto).split(/(\s+)/).filter((t) => t !== '');

const esBlanco = (t) => /^\s+$/.test(t);

// Junta los trozos seguidos que tienen la misma marca: sin esto, un cambio de
// cinco palabras serían cinco recuadros rojos pegados en lugar de uno.
function juntar(trozos) {
  const salida = [];
  for (const t of trozos) {
    const ultimo = salida[salida.length - 1];
    if (ultimo && ultimo.op === t.op) ultimo.texto += t.texto;
    else salida.push({ op: t.op, texto: t.texto });
  }
  // Un hueco en blanco marcado en rojo es un recuadro vacío que no dice nada:
  // los espacios se enseñan sin marca. Lo que se marca son palabras.
  return salida.map((s) => (esBlanco(s.texto) ? { op: 'igual', texto: s.texto } : s));
}

// El diff de dos textos, en un solo guion para las dos columnas.
//
//   { segmentos: [{ op: 'igual' | 'quita' | 'pon', texto }], quitadas, anadidas, recortado }
//
// `quitadas` y `anadidas` cuentan PALABRAS, no trozos: es lo que se puede decir
// en voz alta («doce palabras quitadas»), que es el único resumen que llega a
// quien no ve ni el color ni el tachado.
export function diffDePalabras(antes, ahora) {
  const a = trocear(antes);
  const b = trocear(ahora);

  const nada = { segmentos: [], quitadas: 0, anadidas: 0, recortado: false };
  if (!a.length && !b.length) return nada;

  // Demasiado grande para la tabla: la línea sale cambiada entera y se dice.
  if (a.length * b.length > TOPE_CELDAS) {
    return {
      segmentos: juntar([
        ...a.map((t) => ({ op: 'quita', texto: t })),
        ...b.map((t) => ({ op: 'pon', texto: t })),
      ]),
      quitadas: a.filter((t) => !esBlanco(t)).length,
      anadidas: b.filter((t) => !esBlanco(t)).length,
      recortado: true,
    };
  }

  const ops = guion(a, b);
  const trozos = ops.map((o) => ({
    op: o.op,
    texto: o.op === 'pon' ? b[o.j] : a[o.i],
  }));

  let quitadas = 0;
  let anadidas = 0;
  for (const t of trozos) {
    if (esBlanco(t.texto)) continue;
    if (t.op === 'quita') quitadas += 1;
    if (t.op === 'pon') anadidas += 1;
  }

  return { segmentos: juntar(trozos), quitadas, anadidas, recortado: false };
}

// Lo que pinta cada columna: la izquierda enseña lo que había (igual + quitado) y
// la derecha lo que hay (igual + añadido). Del mismo guion, así que no pueden
// decir cosas distintas.
export const columnaAntes = (segmentos) => (segmentos || []).filter((s) => s.op !== 'pon');
export const columnaAhora = (segmentos) => (segmentos || []).filter((s) => s.op !== 'quita');

// ================================================================ línea por línea

// Empareja las líneas del curso pasado con las de este. Devuelve
// `[{ antes, despues, igual, diff }]`, en el orden en que se leen:
//
//   · las líneas idénticas hacen de ancla y salen emparejadas con `igual: true`;
//   · entre dos anclas, lo quitado y lo puesto se empareja POR POSICIÓN, que es
//     lo que convierte «este párrafo lo han reescrito» en una pareja con su diff
//     de palabras en lugar de en dos líneas sueltas;
//   · lo que sobra por un lado es una línea entera quitada (`despues: null`) o
//     añadida (`antes: null`).
export function emparejar(viejas, nuevas) {
  const a = Array.isArray(viejas) ? viejas : [];
  const b = Array.isArray(nuevas) ? nuevas : [];
  const ops = guion(a.map(claveDeLinea), b.map(claveDeLinea));

  const parejas = [];
  let quitadas = [];
  let puestas = [];

  const volcar = () => {
    const cuantas = Math.max(quitadas.length, puestas.length);
    for (let k = 0; k < cuantas; k += 1) {
      const antes = quitadas[k] || null;
      const despues = puestas[k] || null;
      parejas.push({
        antes,
        despues,
        igual: false,
        diff: diffDePalabras(antes ? antes.texto : '', despues ? despues.texto : ''),
      });
    }
    quitadas = [];
    puestas = [];
  };

  for (const o of ops) {
    if (o.op === 'igual') {
      volcar();
      parejas.push({
        antes: a[o.i],
        despues: b[o.j],
        igual: true,
        diff: { segmentos: [{ op: 'igual', texto: b[o.j].texto }], quitadas: 0, anadidas: 0, recortado: false },
      });
    } else if (o.op === 'quita') quitadas.push(a[o.i]);
    else puestas.push(b[o.j]);
  }
  volcar();

  return parejas;
}

// El recuento de una comparación entera, que es lo que se dice arriba: cuántas
// líneas han cambiado y cuántas palabras se han quitado y puesto.
export function recuento(parejas) {
  const lista = parejas || [];
  return {
    lineas: lista.length,
    cambiadas: lista.filter((p) => !p.igual).length,
    quitadas: lista.reduce((n, p) => n + (p.diff ? p.diff.quitadas : 0), 0),
    anadidas: lista.reduce((n, p) => n + (p.diff ? p.diff.anadidas : 0), 0),
  };
}

// ================================================================ los campos que no son prosa

// Una lista de bloques: la misma comprobación de forma que `esListaDeBloques` de
// bloques-cliente.js, y por el mismo motivo —una lista vacía no cuenta, porque
// `[].every(...)` es true y cualquier campo vacío pasaría por campo de texto.
const esListaDeBloques = (v) => Array.isArray(v) && v.length > 0
  && v.every((x) => !!x && typeof x === 'object' && (typeof x.type === 'string' || typeof x.ref === 'string'));

// ¿Este campo se puede comparar palabra por palabra? Se mira la forma del valor y
// no solo `campo.tipo`, igual que hace Valores.js para repartir los editores: los
// tipos los deduce el importador del Word y van a aparecer más. Se miran los DOS
// lados: un campo que este curso está vacío y el pasado tenía tres párrafos se
// compara igual, y es justo el caso que hay que ver.
export const esComparable = (campo, valorA, valorB) => (!!campo && campo.tipo === 'texto_largo')
  || esListaDeBloques(valorA) || esListaDeBloques(valorB);

// Si dos valores son el mismo, para los campos que no son prosa: las
// ponderaciones, las fichas de situación de aprendizaje, las tablas del Word. No
// se enseña un diff de palabras de una tabla —no se leería—, pero sí hace falta
// decir si ha cambiado, que es la pregunta de la pantalla.
//
// Se compara sobre JSON porque lo que se compara son datos que vienen de la API,
// sin funciones, sin fechas y sin claves `undefined` (las respuestas ya han
// pasado por JSON las dos).
export function mismoValor(a, b) {
  if (a === b) return true;
  try { return JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b); }
  catch (e) { return false; }
}

// Cuántas fichas hay a cada lado y cuántas han cambiado, para un apartado
// repetidor (`{ items: [...] }`): las 84 situaciones de aprendizaje de la PD de
// DAW no se comparan párrafo a párrafo, pero «tres fichas cambiadas de 11» es
// exactamente lo que hay que saber antes de abrirlas.
export function recuentoDeItems(valorA, valorB) {
  const a = (valorA && Array.isArray(valorA.items)) ? valorA.items : [];
  const b = (valorB && Array.isArray(valorB.items)) ? valorB.items : [];
  let cambiadas = 0;
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if (!mismoValor(a[i], b[i])) cambiadas += 1;
  }
  return { antes: a.length, ahora: b.length, cambiadas };
}
