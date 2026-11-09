// La estructura de la tabla de la ficha de situación de aprendizaje llega a quien la monta.
//
//   node test/estructura-ficha.js
//
// `plantilla.estructuraFicha` ya se guardaba y core/sa.js ya la aceptaba, pero nadie las había unido:
// el PDF, el Word, la pantalla y la validación seguían usando la lista de siempre. Esta prueba
// vigila las dos mitades de esa unión:
//
//   · SIN ESTRUCTURA, TODO IGUAL. Un documento que nunca la ha cambiado (los cuatro reales) tiene que
//     dar las filas de `filasDeFicha(ficha)` a secas, en el PDF y en el Word.
//   · CON ESTRUCTURA, DISTINTO Y LO MISMO EN LOS DOS. Una fila renombrada, otra movida y otra retirada
//     se ven en el PDF y en el Word, con las mismas celdas en el mismo orden, y lo escrito en la fila
//     retirada no se imprime pero sigue en la ficha.
//
// El PDF se mira sobre la definición de pdfmake (la misma decisión que test/estructura.js) y el Word
// sobre el `document.xml` del zip.

'use strict';

const assert = require('assert');
const JSZip = require('jszip');
const Sa = require('../core/sa');
const Plantilla = require('../core/plantilla');
const Estructurados = require('../core/estructurados');
const { buildDocDefinition } = require('../motor/render-generico');
const { exportarDocx } = require('../motor/exportar-docx');
const { filasDeFicha } = require('../motor/ficha-sa');

let fallos = 0;
const pruebas = [];
const prueba = (nombre, fn) => pruebas.push({ nombre, fn });

const PLANTILLA = {
  secciones: [{
    id: 's1', titulo: 'Fichas', campos: [{ id: 'f', tipo: 'ficha_situacion_aprendizaje', etiqueta: 'Ficha' }], hijos: [],
  }],
};

const FICHA = {
  ...Sa.fichaVacia(1),
  titulo: 'Primera situación',
  sesiones: 5,
  evaluacion: '1ª',
  raTexto: 'RA1. Algo.',
  ra: [1],
  ce: ['RA1.a. Un criterio.'],
  competencias: ['SECRETO-COMPETENCIAS'],
  objetivos: ['UN-OBJETIVO'],
  recursos: ['UN-RECURSO'],
};

const datosCon = (ficha) => ({ documento: { s1: { f: ficha } }, instancias: [] });

// Los textos de las celdas, en orden, de una tabla de filas del modelo.
const textosDe = (filas) => filas.flatMap((fila) => fila.map((celda) => celda.text)).filter((t) => t !== '');

// Todos los textos de la definición de pdfmake, en el orden en que se recorren.
function textosDelPdf(plantilla, ficha) {
  const def = buildDocDefinition({ plantilla, datos: datosCon(ficha), instancias: 'todas', titulo: 'T' });
  const out = [];
  (function recorrer(x) {
    if (Array.isArray(x)) { x.forEach(recorrer); return; }
    if (!x || typeof x !== 'object') return;
    if (typeof x.text === 'string') out.push(x.text); else if (x.text) recorrer(x.text);
    for (const k of Object.keys(x)) if (k !== 'text') recorrer(x[k]);
  })(def.content);
  // Las celdas vacías que pdfmake necesita para los `colspan` no son texto de la ficha.
  return out.filter((t) => t !== '');
}

const ENTIDADES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };
async function textosDelWord(plantilla, ficha) {
  const zip = await JSZip.loadAsync(await exportarDocx({ plantilla, datos: datosCon(ficha) }));
  const xml = await zip.file('word/document.xml').async('string');
  return [...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)]
    .map((m) => m[1].replace(/&(?:amp|lt|gt|quot|apos);/g, (e) => ENTIDADES[e]));
}

// Se quitan los espacios y los saltos: el PDF guarda una celda de varias líneas en una cadena y el
// Word la reparte en párrafos, pero las dos tienen que decir lo mismo con las mismas palabras.
const plano = (lista) => lista.join('').replace(/\s+/g, '');

// La parte del documento que es la ficha: desde la primera celda hasta la última de la tabla.
const desde = (lista, primero) => lista.slice(lista.indexOf(primero));

prueba('sin estructuraFicha, el PDF y el Word dan las filas de siempre', async () => {
  const esperado = textosDe(filasDeFicha(FICHA));
  assert.ok(esperado.includes('Objetivos de aprendizaje'));

  const pdf = textosDelPdf(PLANTILLA, FICHA);
  assert.deepStrictEqual(desde(pdf, esperado[0]).slice(0, esperado.length), esperado);

  const word = await textosDelWord(PLANTILLA, FICHA);
  assert.strictEqual(plano(desde(word, esperado[0]).slice(0, esperado.length)), plano(esperado));
});

// Renombra una fila, mueve otra al principio y retira una tercera.
function estructuraCambiada() {
  let p = { ...PLANTILLA };
  for (const [tipo, parametros] of [
    ['renombrar_campo_ficha', { campoFicha: 'objetivos', etiqueta: 'Metas de la situación' }],
    ['mover_campo_ficha', { campoFicha: 'recursos', delta: -10 }],
    ['retirar_campo_ficha', { campoFicha: 'competencias' }],
  ]) {
    const r = Plantilla.aplicar(p, { tipo, ...parametros });
    assert.ok(!r.motivo, `${tipo}: ${r.motivo}`);
    p = r.plantilla;
  }
  return p;
}

prueba('con estructuraFicha, el PDF y el Word reflejan los tres cambios y coinciden', async () => {
  const plantilla = estructuraCambiada();
  assert.ok(Array.isArray(plantilla.estructuraFicha));
  const esperado = textosDe(filasDeFicha(FICHA, plantilla.estructuraFicha));
  assert.notDeepStrictEqual(esperado, textosDe(filasDeFicha(FICHA)), 'la estructura no cambia la tabla');

  const pdf = desde(textosDelPdf(plantilla, FICHA), esperado[0]).slice(0, esperado.length);
  const word = desde(await textosDelWord(plantilla, FICHA), esperado[0]).slice(0, esperado.length);
  assert.deepStrictEqual(pdf, esperado);
  assert.strictEqual(plano(word), plano(esperado));
  assert.strictEqual(plano(pdf), plano(word), 'el PDF y el Word no coinciden');

  for (const salida of [pdf, word]) {
    const texto = salida.join('\n');
    assert.ok(texto.includes('Metas de la situación'), 'falta la fila renombrada');
    assert.ok(!texto.includes('Objetivos de aprendizaje'), 'sigue la etiqueta vieja');
    assert.ok(texto.indexOf('Materiales y recursos didácticos disponibles') < texto.indexOf('Metas de la situación'),
      'la fila movida sigue detrás de la que debía pasar');
    assert.ok(!texto.includes('Competencias profesionales'), 'sale la fila retirada');
    assert.ok(!texto.includes('SECRETO-COMPETENCIAS'), 'sale el contenido de la fila retirada');
  }
  assert.ok(!(await textosDelWord(plantilla, FICHA)).join('').includes('SECRETO-COMPETENCIAS'));
  assert.ok(!textosDelPdf(plantilla, FICHA).join('').includes('SECRETO-COMPETENCIAS'));

  // Retirar no borra: el contenido sigue en la ficha y la fila vuelve con él al restaurarla.
  assert.deepStrictEqual(FICHA.competencias, ['SECRETO-COMPETENCIAS']);
  const vuelta = Plantilla.aplicar(plantilla, { tipo: 'restaurar_campo_ficha', campoFicha: 'competencias' });
  assert.ok(!vuelta.motivo, vuelta.motivo);
  assert.ok(textosDelPdf(vuelta.plantilla, FICHA).join('\n').includes('SECRETO-COMPETENCIAS'));
});

prueba('una fila con id propio se valida con la estructura del documento y no con la de siempre', () => {
  const r = Plantilla.aplicar(PLANTILLA, { tipo: 'anadir_campo_ficha', etiqueta: 'Actividad estrella' });
  assert.ok(!r.motivo, r.motivo);
  const nueva = r.plantilla.estructuraFicha.find((c) => c.etiqueta === 'Actividad estrella');
  const ficha = { ...FICHA, [nueva.id]: ['algo'] };
  assert.ok(Estructurados.motivoFicha(ficha), 'con la estructura de siempre la clave sobra');
  assert.strictEqual(Estructurados.motivoFicha(ficha, 'la ficha', r.plantilla.estructuraFicha), null);
  // y la ficha nueva nace con las filas del documento
  assert.ok(Array.isArray(Sa.fichaVacia(1, undefined, r.plantilla.estructuraFicha)[nueva.id]));
  assert.strictEqual(Sa.fichaVacia(1)[nueva.id], undefined);
});

(async () => {
  for (const { nombre, fn } of pruebas) {
    try {
      await fn();
      console.log(`ok   ${nombre}`);
    } catch (e) {
      fallos += 1;
      console.log(`FALLO ${nombre}\n${e.stack || e}`);
    }
  }
  console.log(`\n${pruebas.length - fallos}/${pruebas.length} pruebas`);
  process.exit(fallos ? 1 : 0);
})();
