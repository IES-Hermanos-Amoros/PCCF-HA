// LA PUERTA DE ACEPTACIÓN DE LA ESTRUCTURA POR MÓDULO.
//
//   node test/estructura-modulos-hoy.js
//
// Regenera, de los documentos de la base local, lo que cada módulo ve de la estructura de su documento
// (el árbol, los campos de cada apartado y un sha256 de todo) y lo compara contra
// test/estructura-modulos-hoy.json, que se congeló ANTES de permitir que un módulo lleve estructura propia.
//
// EL CRITERIO: si alguien cambia cómo se resuelve la estructura de un módulo que no tiene estructura
// propia, esta prueba falla. Hoy ninguno la tiene, así que tiene que pasar sin tocar un byte; el día que
// un módulo la tenga, el que se mueva de ese fichero será él y los demás seguirán igual.
//
// ESE FICHERO NO SE REGENERA para que la prueba pase. Si cambia a propósito la estructura de un documento
// ya cargado, o se recarga la base con otro importador, se vuelve a congelar a mano y se explica por qué
// (`node scripts/congelar-estructura-modulos.js --congelar`).
//
// A DIFERENCIA DEL RESTO DE LA BATERÍA, NECESITA LA BASE LOCAL: lo que vigila son los documentos de
// verdad, y en memoria no hay ninguno. Sin Mongo no se salta en silencio: falla diciendo por qué, porque
// una puerta que se abre sola cuando no hay nadie mirando no es una puerta.

'use strict';

const assert = require('assert');
const fs = require('fs');
const { generar, diferencias, canonico, FICHERO } = require('../scripts/congelar-estructura-modulos');

const pruebas = [];
const prueba = (nombre, fn) => pruebas.push({ nombre, fn });

let congelado;
let actual;

prueba('el fichero congelado existe y cubre los 12 documentos', () => {
  congelado = JSON.parse(fs.readFileSync(FICHERO, 'utf8'));
  assert.strictEqual(congelado.documentos, 12);
  assert.strictEqual(Object.keys(congelado.detalle).length, 12);
  const modulos = Object.values(congelado.detalle).reduce((n, d) => n + d.modulos.length, 0);
  assert.ok(modulos >= 44, `solo hay ${modulos} módulos congelados`);
});

prueba('lo que ven hoy los módulos es EXACTAMENTE lo congelado', async () => {
  actual = await generar();
  const dif = diferencias(congelado, actual);
  assert.deepStrictEqual(dif, [], `la estructura que ve algún módulo ha cambiado:\n  ${dif.join('\n  ')}`);
  assert.strictEqual(actual.sha256, congelado.sha256, 'el sha256 del conjunto ha cambiado');
  for (const [k, sha] of Object.entries(congelado.porDocumento)) {
    assert.strictEqual(actual.porDocumento[k], sha, `${k}: cambia el sha256 del documento`);
  }
});

prueba('la regeneración es idéntica byte a byte, no solo equivalente', () => {
  assert.strictEqual(canonico(actual.detalle), canonico(congelado.detalle));
});

prueba('la puerta SE ENTERA: cambiar un título, un campo o el orden en un solo módulo la hace saltar', () => {
  const copia = () => JSON.parse(JSON.stringify(actual));
  const claveDoc = Object.keys(actual.detalle).find((k) => k.startsWith('programacion_didactica/daw/2026-27'));

  const titulo = copia();
  titulo.detalle[claveDoc].modulos[3].arbol[1].titulo += '.';
  titulo.detalle[claveDoc].modulos[3].sha256 = 'otro';
  assert.ok(diferencias(congelado, titulo).some((d) => d.includes('módulo 4')), 'un título distinto en el módulo 4 no se ha visto');

  const campo = copia();
  const conCampos = campo.detalle[claveDoc].modulos[0].campos.find((c) => c.campos.length);
  conCampos.campos[0].etiqueta += ' ';
  campo.detalle[claveDoc].modulos[0].sha256 = 'otro';
  assert.ok(diferencias(congelado, campo).some((d) => d.includes('los campos')), 'una etiqueta distinta no se ha visto');

  const orden = copia();
  orden.detalle[claveDoc].modulos[1].arbol.reverse();
  orden.detalle[claveDoc].modulos[1].sha256 = 'otro';
  assert.ok(diferencias(congelado, orden).some((d) => d.includes('módulo 2')), 'otro orden no se ha visto');

  // Y que lo que no cambia no da falsos avisos.
  assert.deepStrictEqual(diferencias(congelado, copia()), []);
});

(async () => {
  let fallos = 0;
  for (const p of pruebas) {
    try {
      await p.fn();
      console.log(`ok   ${p.nombre}`);
    } catch (e) {
      fallos += 1;
      console.log(`FALLO ${p.nombre}\n     ${String(e.message).replace(/\n/g, '\n     ')}`);
    }
  }
  process.exit(fallos ? 1 : 0);
})();
