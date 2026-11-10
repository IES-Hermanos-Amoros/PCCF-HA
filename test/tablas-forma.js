// Pruebas de core/tablas-forma.js: la propuesta de «qué tablas son la misma» según su forma.
//
//   node test/tablas-forma.js
//
// Las tablas son sintéticas y con la forma que deja el importador. Se fija el criterio, no un
// documento: qué junta, qué no junta, y que cada grupo trae su motivo.

'use strict';

const assert = require('assert/strict');
const TF = require('../core/tablas-forma');

let fallos = 0;
const prueba = (nombre, fn) => {
  try { fn(); console.log(`ok   ${nombre}`); }
  catch (e) { fallos += 1; console.log(`FALLO ${nombre}\n     ${e.message}`); }
};

const c = (text, bold, colspan) => ({ text, bold: !!bold, colspan: colspan || 1, rowspan: 1 });
const letras = (n) => String(n).replace(/[0-9]/g, (d) => "abcdefghij"[d]);
const relleno = (i, j) => `dato ${letras(i)} ${letras(j)} con bastante texto para que la cabecera destaque por corta`;
// una tabla con la cabecera dada (en negrita) y `n` filas de datos de las mismas columnas
const conCabecera = (cab, n, anchos) => ({
  rows: [cab.map((t) => c(t, true)), ...Array.from({ length: n }, (_x, i) => cab.map((_t, j) => c(relleno(i, j))))],
  anchos,
});
// una tabla sin cabecera: la primera fila es un dato como los demás; `primeraBold` pone en negrita la primera columna
let semilla = 100; // cada tabla con sus propios textos: dos primeras filas iguales serían una cabecera repetida
const sinCabecera = (columnas, n, primeraBold, anchos) => ({
  rows: Array.from({ length: n }, (_x, i) => { semilla += 1; return Array.from({ length: columnas }, (_t, j) => c(relleno(semilla, j), primeraBold && j === 0)); }),
  anchos,
});

prueba('se publica en Core.tablasForma y en module.exports', () => {
  assert.equal(typeof TF.proponer, 'function');
  assert.equal(global.Core.tablasForma, TF);
});

prueba('sin tablas, o con una sola, no hay grupos', () => {
  assert.deepEqual(TF.proponer([]), { grupos: [], sueltas: [] });
  assert.deepEqual(TF.proponer(undefined), { grupos: [], sueltas: [] });
  const r = TF.proponer([conCabecera(['A', 'B'], 3)]);
  assert.equal(r.grupos.length, 0);
  assert.deepEqual(r.sueltas, [0]);
});

prueba('misma cabecera: se juntan aunque cambien las filas, los acentos, las mayúsculas y los números', () => {
  const r = TF.proponer([
    conCabecera(['Resultado de aprendizaje 1', 'Ponderación'], 3),
    conCabecera(['RESULTADO DE APRENDIZAJE 2', 'Ponderacion'], 9),
    conCabecera(['Otra cosa', 'Distinta'], 3),
  ]);
  assert.equal(r.grupos.length, 1);
  assert.deepEqual(r.grupos[0].indices, [0, 1]);
  assert.equal(r.grupos[0].nivel, TF.NIVEL_CABECERA);
  assert.deepEqual(r.grupos[0].filas, { min: 4, max: 10 });
  assert.deepEqual(r.sueltas, [2]);
});

prueba('una cabecera larga sigue siendo cabecera: no hay largo máximo (42 caracteres)', () => {
  const larga = 'Criterios de evaluación (Decreto 107/2022)';
  assert.equal(larga.length, 42);
  const mk = (n) => ({ rows: [[c('Competencias específicas', true), c(larga, false)], ...Array.from({ length: n }, (_x, i) => [c('Una competencia con su descripción completa ' + i), c('Un criterio con su descripción más larga todavía, de varias frases cada uno ' + i)])] });
  const r = TF.proponer([mk(3), mk(6), mk(10)]);
  assert.equal(r.grupos.length, 1);
  assert.equal(r.grupos[0].nivel, TF.NIVEL_CABECERA);
  assert.deepEqual(r.grupos[0].indices, [0, 1, 2]);
});

prueba('una primera fila repetida en otra tabla es cabecera aunque no se distinga del cuerpo', () => {
  const plana = (t) => ({ rows: [[c(t), c('Otra')], [c('x'), c('y')], [c('z'), c('w')]] });
  const r = TF.proponer([plana('Instrumento'), plana('Instrumento'), plana('Raro')]);
  assert.equal(r.grupos.length, 1);
  assert.equal(r.grupos[0].nivel, TF.NIVEL_CABECERA);
});

prueba('misma cabecera por parecido: una celda abreviada y columnas de más al final', () => {
  const r = TF.proponer([
    conCabecera(['Situaciones definidas', 'Criterios', 'Temporaliz.'], 4),
    conCabecera(['Situaciones definidas', 'Criterios', 'Temporalización'], 8),
    conCabecera(['Situaciones definidas', 'Criterios', 'Temporalización', 'Peso'], 5),
  ]);
  assert.equal(r.grupos.length, 1);
  assert.deepEqual(r.grupos[0].indices, [0, 1, 2]);
});

prueba('el parecido no es encadenado ni tan flojo: cabeceras distintas, o una de una celda frente a una de dos, no casan', () => {
  const r = TF.proponer([
    conCabecera(['Resultado de aprendizaje', 'Ponderación'], 4),
    conCabecera(['Resultado de aprendizaje'], 4),
    conCabecera(['Competencias', 'Objetivos'], 2),
    conCabecera(['Compras', 'Objetos'], 2),
  ]);
  assert.equal(r.grupos.length, 0);
  assert.equal(r.sueltas.length, 4);
});

prueba('misma cabecera: no hace falta que coincidan las columnas de la rejilla (celdas fusionadas)', () => {
  const a = { rows: [[c('Instrumentos', true), c('Criterios', true, 2)], [c('un instrumento largo'), c('un criterio largo'), c('z')]] };
  const b = { rows: [[c('Instrumentos', true), c('Criterios', true)], [c('un instrumento largo'), c('un criterio largo')]] };
  const r = TF.proponer([a, b]);
  assert.equal(r.grupos.length, 1);
  assert.equal(r.grupos[0].nivel, TF.NIVEL_CABECERA);
});

prueba('matriz partida: misma primera celda, mismas filas y cabeceras de una letra', () => {
  const m = (letras) => ({ rows: [[c('Código del módulo'), ...letras.map((l) => c(l))], ...Array.from({ length: 5 }, (_x, i) => [c('MOD' + i), ...letras.map(() => c('X'))])] });
  const r = TF.proponer([m(['a', 'b', 'c', 'd']), m(['p', 'q', 'r', 's']), m(['a', 'b'])]);
  assert.equal(r.grupos.length, 1);
  assert.equal(r.grupos[0].nivel, TF.NIVEL_MATRIZ);
  assert.deepEqual(r.grupos[0].indices, [0, 1, 2]);
});

prueba('la forma junta tablas sin cabecera con la misma rejilla y no mira la negrita de la primera fila', () => {
  const a = sinCabecera(4, 5, false);
  const b = sinCabecera(4, 9, false);
  b.rows[0] = b.rows[0].map((x) => ({ ...x, bold: true })); // la negrita de la primera fila va y viene
  const r = TF.proponer([a, b]);
  assert.equal(r.grupos.length, 1);
  assert.equal(r.grupos[0].nivel, TF.NIVEL_FORMA);
  assert.match(r.grupos[0].motivo, /misma forma/);
});

prueba('la forma distingue columnas y negrita de la primera columna', () => {
  const r = TF.proponer([
    sinCabecera(3, 4, false), sinCabecera(3, 6, false),
    sinCabecera(4, 4, false), sinCabecera(4, 6, false),
    sinCabecera(3, 4, true), sinCabecera(3, 6, true),
    sinCabecera(5, 4, false),
  ]);
  assert.deepEqual(r.grupos.map((g) => g.indices.join(',')).sort(), ['0,1', '2,3', '4,5']);
  assert.deepEqual(r.sueltas, [6]);
});

prueba('dos tablas con cabecera propia y distinta no se juntan por tener la misma geometría', () => {
  const r = TF.proponer([conCabecera(['Alfa', 'Beta'], 3), conCabecera(['Uno', 'Dos'], 3)]);
  assert.equal(r.grupos.length, 0);
  assert.equal(r.sueltas.length, 2);
});

prueba('los anchos separan rejillas iguales con proporciones distintas y toleran una décima que baila', () => {
  const r = TF.proponer([
    sinCabecera(2, 4, false, [2000, 8000]),
    sinCabecera(2, 4, false, [2150, 7850]),
    sinCabecera(2, 4, false, [5000, 5000]),
    sinCabecera(2, 4, false, [3000, 7000]),
  ]);
  assert.equal(r.grupos.length, 1);
  assert.deepEqual(r.grupos[0].indices, [0, 1]);
  assert.match(r.grupos[0].firma, /anchos 20\/80/);
  assert.deepEqual(r.sueltas, [2, 3]);
});

prueba('las filas no cuentan por defecto y sí con bandasFilas', () => {
  const t = [sinCabecera(3, 1, false), sinCabecera(3, 20, false)];
  assert.equal(TF.proponer(t).grupos.length, 1);
  assert.equal(TF.proponer(t, { bandasFilas: true }).grupos.length, 0);
});

prueba('toda tabla queda en un grupo o suelta, una sola vez, y los grupos vienen de mayor a menor', () => {
  const tablas = [
    conCabecera(['A', 'B'], 2), conCabecera(['A', 'B'], 3), conCabecera(['A', 'B'], 4),
    conCabecera(['X', 'Y', 'Z'], 2), conCabecera(['X', 'Y', 'Z'], 3),
    conCabecera(['solo', 'una', 'mas', 'de', 'cinco'], 2),
  ];
  const r = TF.proponer(tablas);
  const vistas = [...r.grupos.flatMap((g) => g.indices), ...r.sueltas].sort();
  assert.deepEqual(vistas, [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(r.grupos.map((g) => g.indices.length), [3, 2]);
  assert.deepEqual(r.grupos.map((g) => g.id), ['grupo-1', 'grupo-2']);
});

prueba('cada grupo trae motivo, firma y un ejemplo legibles para una persona', () => {
  const r = TF.proponer([conCabecera(['Alfa', 'Beta'], 2), conCabecera(['Alfa', 'Beta'], 2)]);
  const g = r.grupos[0];
  assert.match(g.motivo, /2 tablas/);
  assert.match(g.motivo, /Alfa \| Beta/);
  assert.ok(g.firma && g.ejemplo === 'Alfa | Beta');
});

prueba('tablas vacías o con la primera fila vacía no revientan', () => {
  const r = TF.proponer([{ rows: [[c('', true)]] }, { rows: [[c('', true)]] }, { rows: [] }, {}]);
  assert.ok(r.grupos.every((g) => g.nivel === TF.NIVEL_FORMA));
});

console.log(fallos ? `\n${fallos} prueba(s) con fallos` : '\nTodas las pruebas correctas');
process.exit(fallos ? 1 : 0);
