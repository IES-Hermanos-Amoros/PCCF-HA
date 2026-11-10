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
// una tabla con la cabecera dada (en negrita) y `n` filas de datos de las mismas columnas
const conCabecera = (cab, n, anchos) => ({
  rows: [cab.map((t) => c(t, true)), ...Array.from({ length: n }, (_x, i) => cab.map((_t, j) => c(`dato ${i}.${j} con bastante texto para no ser corto del todo`)))],
  anchos,
});
// una tabla de clave y valor: sin cabecera, primera columna en negrita
const clave = (pares, anchos) => ({ rows: pares.map(([k, v]) => [c(k, true), c(v + ' ' + 'x'.repeat(60))]), anchos });

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

prueba('misma cabecera: no hace falta que coincidan las columnas de la rejilla (celdas fusionadas)', () => {
  const a = { rows: [[c('Instrumentos', true), c('Criterios', true, 2)], [c('x'), c('y'), c('z')]] };
  const b = { rows: [[c('Instrumentos', true), c('Criterios', true)], [c('x'), c('y')]] };
  const r = TF.proponer([a, b]);
  assert.equal(r.grupos.length, 1);
  assert.equal(r.grupos[0].nivel, TF.NIVEL_CABECERA);
});

prueba('cabeceras distintas con la misma forma se juntan por forma y lo dice el motivo', () => {
  const r = TF.proponer([
    conCabecera(['Alfa', 'Beta', 'Gamma'], 2),
    conCabecera(['Uno', 'Dos', 'Tres'], 5),
  ]);
  assert.equal(r.grupos.length, 1);
  assert.equal(r.grupos[0].nivel, TF.NIVEL_FORMA);
  assert.match(r.grupos[0].motivo, /misma forma/);
  assert.match(r.grupos[0].motivo, /no coincide/);
});

prueba('la forma distingue columnas, negrita de la primera fila y de la primera columna', () => {
  const sinNegrita = { rows: [[c('Siete'), c('Ocho')], [c('x'), c('y')]] };
  const r = TF.proponer([
    conCabecera(['Alfa', 'Beta'], 3),
    conCabecera(['Uno', 'Dos'], 3),
    conCabecera(['Uno', 'Dos', 'Tres'], 3),
    conCabecera(['Cuatro', 'Cinco', 'Seis'], 3),
    clave([['Uno', 'a'], ['Dos', 'b'], ['Tres', 'c']]),
    clave([['Cuatro', 'a'], ['Cinco', 'b'], ['Seis', 'c']]),
    sinNegrita,
  ]);
  const juntas = r.grupos.map((g) => g.indices.join(',')).sort();
  assert.deepEqual(juntas, ['0,1', '2,3', '4,5']);
  assert.deepEqual(r.sueltas, [6]);
});

prueba('una tabla de clave y valor no se agrupa por su primera fila, que es un dato', () => {
  const r = TF.proponer([
    clave([['Módulo', 'DAW'], ['Curso', '1'], ['Horas', '5']]),
    clave([['Módulo', 'SMR'], ['Curso', '2'], ['Horas', '6']]),
  ]);
  assert.equal(r.grupos.length, 1);
  assert.equal(r.grupos[0].nivel, TF.NIVEL_FORMA);
});

prueba('los anchos separan rejillas iguales con proporciones distintas, y toleran el redondeo', () => {
  const r = TF.proponer([
    conCabecera(['Alfa', 'Beta'], 3, [2000, 8000]),
    conCabecera(['Uno', 'Dos'], 3, [2010, 7990]),
    conCabecera(['Tres', 'Cuatro'], 3, [5000, 5000]),
  ]);
  assert.equal(r.grupos.length, 1);
  assert.deepEqual(r.grupos[0].indices, [0, 1]);
  assert.match(r.grupos[0].firma, /anchos 20\/80/);
  assert.deepEqual(r.sueltas, [2]);
});

prueba('las filas no cuentan por defecto y sí con bandasFilas', () => {
  const t = [conCabecera(['Alfa', 'Beta'], 1), conCabecera(['Uno', 'Dos'], 20)];
  assert.equal(TF.proponer(t).grupos.length, 1);
  assert.equal(TF.proponer(t, { bandasFilas: true }).grupos.length, 0);
});

prueba('toda tabla queda en un grupo o suelta, una sola vez, y los grupos vienen de mayor a menor', () => {
  const tablas = [
    conCabecera(['A', 'B'], 2), conCabecera(['A', 'B'], 3), conCabecera(['A', 'B'], 4),
    conCabecera(['X', 'Y', 'Z'], 2), conCabecera(['P', 'Q', 'R'], 2),
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

prueba('una tabla con la primera fila vacía no revienta ni se agrupa por cabecera', () => {
  const r = TF.proponer([{ rows: [[c('', true)]] }, { rows: [[c('', true)]] }, { rows: [] }]);
  assert.ok(r.grupos.every((g) => g.nivel === TF.NIVEL_FORMA));
});

console.log(fallos ? `\n${fallos} prueba(s) con fallos` : '\nTodas las pruebas correctas');
process.exit(fallos ? 1 : 0);
