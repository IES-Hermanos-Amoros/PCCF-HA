// Texto con formato: un párrafo puede llevar su texto como una cadena (lo que
// produce el importador) o como una lista de tramos con negrita y cursiva, que es
// lo que pdfmake acepta en cualquier nodo de texto y lo que el editor de la
// interfaz genera cuando alguien marca una palabra.
//
//   { type: 'p', text: 'texto sin formato' }
//   { type: 'p', text: [{ text: 'La nota ' }, { text: 'mínima', bold: true }, { text: ' es un 5.' }] }
//
// Lo que se comprueba aquí es que el formato sobrevive el camino completo:
// extraer compartidos -> resolverlos -> construir el documento de pdfmake.

const assert = require('assert');
const { extraerCompartidos, resolverCompartidos, plano } = require('../lib/compartidos');
const { buildDocDefinition } = require('../lib/render-generico');

const RICO = [
  { text: 'La nota ' },
  { text: 'mínima', bold: true },
  { text: ' para aprobar el módulo es un ' },
  { text: '5', bold: true, italics: true },
  { text: '.' },
];

const plantilla = {
  tipo: 'programacion_didactica',
  origen: 'prueba.docx',
  generada: new Date().toISOString(),
  secciones: [
    { id: 'introduccion', titulo: 'Introducción', nivel: 1, edita: 'jefe_departamento', campos: [{ id: 'texto', tipo: 'texto_largo' }], hijos: [] },
    { id: 'modulos', titulo: 'Módulos', nivel: 1, edita: 'docentes_del_modulo', instancias: true, etiqueta_instancia: 'módulo',
      campos: [], hijos: [{ id: 'modulos/texto', titulo: 'Texto del módulo', nivel: 2, campos: [{ id: 'texto', tipo: 'texto_largo' }], hijos: [] }] },
  ],
};

const unosDatos = () => ({
  departamento: 'informatica',
  documento: { introduccion: { texto: [{ type: 'p', text: RICO.map((r) => ({ ...r })) }] } },
  instancias: [1, 2, 3].map((n) => ({
    titulo: `Módulo ${n}`,
    docentes: [],
    valores: { 'modulos/texto': { texto: [{ type: 'p', text: RICO.map((r) => ({ ...r })) }] } },
  })),
});

let fallos = 0;
const prueba = (nombre, fn) => {
  try { fn(); console.log(`ok   ${nombre}`); }
  catch (e) { fallos += 1; console.log(`FALLO ${nombre}\n     ${e.message}`); }
};

prueba('plano() mide las letras, no los tramos', () => {
  assert.equal(plano(RICO), 'La nota mínima para aprobar el módulo es un 5.');
  assert.equal(plano('ya era texto'), 'ya era texto');
  assert.equal(plano(null), '');
});

prueba('un párrafo con formato se comparte entre módulos y se resuelve igual', () => {
  const datos = unosDatos();
  const resumen = extraerCompartidos(datos, { umbral: 3, minimo: 20 });
  assert.equal(resumen.length, 1, 'el párrafo se repite en los 3 módulos y en la parte común');

  const resuelto = resolverCompartidos(datos);
  const bloque = resuelto.instancias[0].valores['modulos/texto'].texto[0];
  assert.deepEqual(bloque.text, RICO, 'el formato vuelve intacto');
});

prueba('dos párrafos con las mismas palabras y distinto formato no son el mismo texto', () => {
  // tres módulos con el párrafo en negrita y otros tres con el mismo texto plano:
  // son dos textos compartidos distintos, no uno repetido seis veces
  const conFormato = () => ({ type: 'p', text: RICO.map((r) => ({ ...r })) });
  const sinFormato = () => ({ type: 'p', text: plano(RICO) });
  const datos = {
    departamento: 'informatica',
    documento: {},
    instancias: [conFormato, conFormato, conFormato, sinFormato, sinFormato, sinFormato]
      .map((hacer, i) => ({ titulo: `Módulo ${i + 1}`, docentes: [], valores: { 'modulos/texto': { texto: [hacer()] } } })),
  };
  const resumen = extraerCompartidos(datos, { umbral: 3, minimo: 20 });
  assert.equal(resumen.length, 2, 'uno por cada formato');
  assert.deepEqual(resumen.map((r) => r.modulos), [3, 3]);
});

prueba('el formato llega al documento de pdfmake', () => {
  const datos = unosDatos();
  const doc = buildDocDefinition({ plantilla, datos, instancias: 'todas', estado: 'borrador' });
  const json = JSON.stringify(doc);
  assert.ok(json.indexOf('"bold":true') !== -1, 'no hay ningún tramo en negrita en el documento');
  assert.ok(json.indexOf('"italics":true') !== -1, 'no hay ningún tramo en cursiva');
  assert.ok(json.indexOf('para aprobar el módulo') !== -1, 'falta el texto');
});

prueba('el texto sin formato sigue funcionando igual que antes', () => {
  const datos = unosDatos();
  datos.documento.introduccion.texto = [{ type: 'p', text: 'Un párrafo de toda la vida.' }];
  const doc = buildDocDefinition({ plantilla, datos, instancias: 'todas', estado: 'borrador' });
  assert.ok(JSON.stringify(doc).indexOf('Un párrafo de toda la vida.') !== -1);
});

console.log(fallos ? `\n${fallos} prueba(s) fallida(s)` : '\nTodas las pruebas correctas');
process.exit(fallos ? 1 : 0);
