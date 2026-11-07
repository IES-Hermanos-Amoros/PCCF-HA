// Importación de Word: de dónde sale la ESTRUCTURA del documento.
//
// motor/importar-docx.js deduce el árbol de apartados de los estilos de título,
// y el dato que usa es el nivel de esquema (`w:outlineLvl`) y no el nombre del
// estilo, que cambia con el idioma y con el editor.
//
// Pero hay documentos —los dos PCCF del departamento— cuyos apartados numerados
// están escritos con estilos PROPIOS que no declaran nivel de esquema: ni Word
// los considera títulos. Esos documentos sí llevan dentro su propia tabla de
// contenidos, y de ahí sale un respaldo: si la deducción normal se queda sin
// tronco, el índice dice qué estilos llevan los títulos y a qué nivel.
//
// Lo que esta suite vigila es sobre todo lo que el respaldo NO debe hacer: no
// dispararse en un documento que ya se deduce bien, no deducir nada de un índice
// que no casa con el cuerpo, y no tomar por título un estilo que también se usa
// para texto corriente. Un respaldo que se pase de listo es peor que no tenerlo:
// una estructura inventada no se nota al importar, se nota en junio al exportar.
//
// Los .docx se arman aquí a mano con jszip: los documentos reales del
// departamento no se versionan (docs/entrada_ej/README.md), así que una prueba
// que dependiera de ellos no se podría ejecutar en una máquina recién clonada.

'use strict';

const assert = require('assert');
const JSZip = require('jszip');
const { importarDocx } = require('../motor/importar-docx');

let fallos = 0;
const pendientes = [];
const prueba = (nombre, fn) => pendientes.push({ nombre, fn });

// ---------------------------------------------------------------- un .docx mínimo armado a mano
// `estilos`: { id, nombre, nivel (el outlineLvl, 0 = primer nivel), porDefecto }.
// `parrafos`: [idDeEstilo, texto]; un tabulador en el texto se escribe como el
// <w:tab/> que pone Word entre el título y el número de página en el índice.
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

async function docx({ estilos, parrafos }) {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?>'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
    + '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
    + '</Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
    + '</Relationships>');
  zip.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
    + '</Relationships>');
  zip.file('word/styles.xml', '<?xml version="1.0" encoding="UTF-8"?>'
    + '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
    + estilos.map((e) => '<w:style w:type="paragraph"' + (e.porDefecto ? ' w:default="1"' : '') + ' w:styleId="' + esc(e.id) + '">'
      + '<w:name w:val="' + esc(e.nombre === undefined ? e.id : e.nombre) + '"/>'
      + (e.nivel === undefined ? '' : '<w:pPr><w:outlineLvl w:val="' + e.nivel + '"/></w:pPr>')
      + '</w:style>').join('')
    + '</w:styles>');
  const p = ([estilo, texto]) => '<w:p><w:pPr><w:pStyle w:val="' + esc(estilo) + '"/></w:pPr>'
    + String(texto).split('\t').map((trozo) => '<w:r><w:t xml:space="preserve">' + esc(trozo) + '</w:t></w:r>').join('<w:r><w:tab/></w:r>')
    + '</w:p>';
  zip.file('word/document.xml', '<?xml version="1.0" encoding="UTF-8"?>'
    + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
    + parrafos.map(p).join('')
    + '</w:body></w:document>');
  return zip.generateAsync({ type: 'nodebuffer' });
}

// Los estilos de un documento como los PCCF: un índice de LibreOffice en
// valenciano (el styleId localizado, el nombre interno de Word en inglés) y los
// apartados escritos con estilos propios SIN nivel de esquema.
const ESTILOS_PCCF = [
  { id: 'Normal', porDefecto: true },
  { id: 'IDC1', nombre: 'toc 1' },
  { id: 'IDC2', nombre: 'toc 2' },
  { id: 'Estilo1' },
  { id: 'Estilo3' },
];
// Los mismos apartados, pero con los estilos declarando su nivel de esquema.
const ESTILOS_CON_NIVEL = ESTILOS_PCCF.map((e) => (e.id === 'Estilo1' ? { ...e, nivel: 0 } : e.id === 'Estilo3' ? { ...e, nivel: 1 } : e));

const INDICE = [
  ['IDC1', '0. Introducción3'],
  ['IDC1', '1. Acuerdos generales4'],
  ['IDC2', '1.1. Enfoques metodológicos5'],
  ['IDC2', '1.2. Criterios de asignación6'],
];
const CUERPO = [
  ['Estilo1', '0. Introducción '],
  ['Normal', 'El contexto general del proyecto.'],
  ['Estilo1', '1. Acuerdos generales '],
  ['Normal', 'Lo que acordó el departamento.'],
  ['Estilo3', '1.1. Enfoques metodológicos '],
  ['Normal', 'Trabajo por proyectos.'],
  ['Estilo3', '1.2. Criterios de asignación '],
  ['Normal', 'Por antigüedad y especialidad.'],
];

// --- ayudas de comparación
const esquema = (secs, prof = 0) => secs.flatMap((s) => [`${'  '.repeat(prof)}${s.nivel}|${s.id}|${s.titulo}`, ...esquema(s.hijos || [], prof + 1)]);
const textoDe = (datos, id) => (datos.documento[id] || {}).texto || [];

// ---------------------------------------------------------------- las pruebas
prueba('un documento con índice y estilos sin nivel de esquema se deduce del índice', async () => {
  const { plantilla, datos, informe } = await importarDocx({ buffer: await docx({ estilos: ESTILOS_PCCF, parrafos: INDICE.concat(CUERPO) }) });

  assert.deepStrictEqual(esquema(plantilla.secciones), [
    '1|introduccion|Introducción',
    '1|acuerdos-generales|Acuerdos generales',
    '  2|acuerdos-generales/enfoques-metodologicos|Enfoques metodológicos',
    '  2|acuerdos-generales/criterios-de-asignacion|Criterios de asignación',
  ], 'la jerarquía tiene que salir del índice: dos apartados y dos subapartados');

  // y el contenido va donde toca, no todo en el primer apartado
  assert.deepStrictEqual(textoDe(datos, 'acuerdos-generales/enfoques-metodologicos').map((b) => b.text), ['Trabajo por proyectos.']);
  assert.deepStrictEqual(informe.indice.estilos.map((e) => [e.estilo, e.nivel]), [['Estilo1', 1], ['Estilo3', 2]]);
  assert.deepStrictEqual([informe.indice.entradas, informe.indice.casadas], [4, 4]);
  assert.ok(informe.avisos.some((a) => /ÍNDICE/.test(a)), 'tiene que avisar de que la estructura sale del índice');
});

prueba('si los estilos de título declaran su nivel, el respaldo no se dispara', async () => {
  // La condición que más importa: un documento que ya se deduce bien no puede
  // cambiar porque exista este código. El árbol es el mismo de arriba, pero sale
  // del nivel de esquema y el índice no se mira siquiera.
  const { plantilla, informe } = await importarDocx({ buffer: await docx({ estilos: ESTILOS_CON_NIVEL, parrafos: INDICE.concat(CUERPO) }) });

  assert.strictEqual(informe.indice, null, 'el respaldo no debería haberse disparado');
  assert.ok(!informe.avisos.some((a) => /ÍNDICE/.test(a)));
  assert.deepStrictEqual(esquema(plantilla.secciones), [
    '1|introduccion|Introducción',
    '1|acuerdos-generales|Acuerdos generales',
    '  2|acuerdos-generales/enfoques-metodologicos|Enfoques metodológicos',
    '  2|acuerdos-generales/criterios-de-asignacion|Criterios de asignación',
  ]);
});

prueba('un índice que no casa con el cuerpo no deduce nada y no estropea nada', async () => {
  // Un índice que quedó de otra versión del documento: sus entradas no están en
  // el cuerpo. Entonces no hay nada que promover, y el resultado tiene que ser
  // exactamente el del mismo documento sin índice.
  const viejo = [
    ['IDC1', 'A. Lo que había antes3'],
    ['IDC1', 'B. Un apartado que se borró4'],
    ['IDC2', 'B.1. Y su subapartado5'],
    ['IDC2', 'B.2. Y otro6'],
  ];
  const con = await importarDocx({ buffer: await docx({ estilos: ESTILOS_PCCF, parrafos: viejo.concat(CUERPO) }) }, { incluirInicial: true });
  const sin = await importarDocx({ buffer: await docx({ estilos: ESTILOS_PCCF, parrafos: CUERPO }) }, { incluirInicial: true });

  assert.strictEqual(con.informe.indice, null, 'con un índice que no casa no se puede deducir nada');
  assert.deepStrictEqual(esquema(con.plantilla.secciones), esquema(sin.plantilla.secciones),
    'el documento con el índice viejo tiene que dar lo mismo que sin él');
  assert.deepStrictEqual(con.plantilla.secciones.map((s) => s.id), ['contenido-inicial'],
    'sin estructura legible el cuerpo entra como un solo apartado, que es lo de siempre');
});

prueba('un estilo que también se usa para texto corriente no se toma por título', async () => {
  // `Suelto` sale una vez en el índice, pero tiene otros diez párrafos de texto
  // normal: no es un estilo de título. El de primer nivel sí se promueve, así
  // que el respaldo se dispara —y aun así `Suelto` se queda fuera.
  const estilos = ESTILOS_PCCF.concat([{ id: 'Suelto' }]);
  const indice = [
    ['IDC1', '0. Introducción3'],
    ['IDC1', '1. Acuerdos generales4'],
    ['IDC2', '1.1. Un aparte5'],
  ];
  const cuerpo = [
    ['Estilo1', '0. Introducción '],
    ['Normal', 'El contexto general del proyecto.'],
    ['Estilo1', '1. Acuerdos generales '],
    ['Suelto', '1.1. Un aparte'],
  ].concat(Array.from({ length: 10 }, (_, i) => ['Suelto', `Párrafo corriente número ${i + 1}.`]));

  const { plantilla, datos, informe } = await importarDocx({ buffer: await docx({ estilos, parrafos: indice.concat(cuerpo) }) });

  assert.deepStrictEqual(informe.indice.estilos.map((e) => e.estilo), ['Estilo1'],
    'solo el estilo que se usa en exclusiva para títulos puede promoverse');
  assert.deepStrictEqual(plantilla.secciones.map((s) => s.titulo), ['Introducción', 'Acuerdos generales']);
  assert.deepStrictEqual(plantilla.secciones.map((s) => s.hijos.length), [0, 0], 'el estilo descartado no puede crear subapartados');
  // y lo que no es título sigue siendo texto: no se pierde
  const texto = textoDe(datos, 'acuerdos-generales').map((b) => b.text);
  assert.ok(texto.includes('1.1. Un aparte'), `el párrafo descartado tiene que seguir en el texto: ${JSON.stringify(texto)}`);
  assert.ok(texto.includes('Párrafo corriente número 10.'));
});

prueba('el número de página y los puntos de relleno no impiden casar la entrada', async () => {
  // La entrada del índice llega con el número de página pegado al título, y con
  // los puntos de relleno o el tabulador que los separa. Y hay títulos que de
  // verdad acaban en un número: «Anexo 2» en la página 7 llega como «Anexo 27».
  const indice = [
    ['IDC1', '0. Introducción\t3'],
    ['IDC1', '1. Acuerdos generales...........4'],
    ['IDC1', 'Anexo 2\t7'],
  ];
  const cuerpo = [
    ['Estilo1', '0. Introducción '],
    ['Estilo1', '1. Acuerdos generales '],
    ['Estilo1', 'Anexo 2'],
    ['Normal', 'Lo que va dentro del anexo.'],
  ];
  const { plantilla, informe } = await importarDocx({ buffer: await docx({ estilos: ESTILOS_PCCF, parrafos: indice.concat(cuerpo) }) });

  assert.deepStrictEqual([informe.indice.entradas, informe.indice.casadas], [3, 3]);
  assert.deepStrictEqual(plantilla.secciones.map((s) => s.titulo), ['Introducción', 'Acuerdos generales', 'Anexo 2']);
});

prueba('el índice se reconoce por el nombre del estilo o por su styleId, en cualquier idioma', async () => {
  // El nombre que escribe Word es el interno en inglés («toc 1»), pero el de
  // LibreOffice está en el idioma del documento y el styleId también se localiza.
  // Vale cualquiera de los dos: «Índice 1» por el nombre, «TDC1» por el id.
  const porNombre = [{ id: 'Pepe1', nombre: 'Índice 1' }, { id: 'Pepe2', nombre: 'Índice 2' }];
  const porId = [{ id: 'TDC1', nombre: 'Un estilo cualquiera 1' }, { id: 'TDC2', nombre: 'Un estilo cualquiera 2' }];
  const base = ESTILOS_PCCF.filter((e) => !/^IDC/.test(e.id));

  for (const [comoSeLlama, idc] of [['por el nombre', porNombre], ['por el styleId', porId]]) {
    const indice = INDICE.map(([e, t]) => [e === 'IDC1' ? idc[0].id : idc[1].id, t]);
    const { plantilla, informe } = await importarDocx({ buffer: await docx({ estilos: base.concat(idc), parrafos: indice.concat(CUERPO) }) });
    assert.ok(informe.indice, `no se ha reconocido el índice ${comoSeLlama}`);
    assert.deepStrictEqual(plantilla.secciones.map((s) => s.titulo), ['Introducción', 'Acuerdos generales'], comoSeLlama);
  }
});

prueba('con dos entradas de índice no se deduce estructura', async () => {
  // Que dos textos coincidan no dice nada. El respaldo pide al menos tres
  // entradas antes de reorganizar un documento entero.
  const { plantilla, informe } = await importarDocx({
    buffer: await docx({ estilos: ESTILOS_PCCF, parrafos: INDICE.slice(0, 2).concat(CUERPO.slice(0, 4)) }),
  });
  assert.strictEqual(informe.indice, null);
  assert.deepStrictEqual(plantilla.secciones, []);
});

prueba('el texto normal no se promueve aunque el índice case con él', async () => {
  // El caso límite: un documento cuyos apartados son párrafos del estilo base.
  // Las entradas casan —el texto está ahí—, pero «Normal» tiene cien párrafos
  // más, así que promoverlo convertiría el documento entero en títulos. Antes
  // que eso, ninguna estructura.
  const estilos = [{ id: 'Normal', porDefecto: true }, { id: 'IDC1', nombre: 'toc 1' }];
  const indice = [['IDC1', '0. Introducción3'], ['IDC1', '1. Acuerdos generales4'], ['IDC1', '2. Atención a la diversidad5']];
  const cuerpo = [['Normal', '0. Introducción'], ['Normal', '1. Acuerdos generales'], ['Normal', '2. Atención a la diversidad']]
    .concat(Array.from({ length: 20 }, (_, i) => ['Normal', `Párrafo corriente número ${i + 1}.`]));

  const { plantilla, informe } = await importarDocx({ buffer: await docx({ estilos, parrafos: indice.concat(cuerpo) }) });
  assert.strictEqual(informe.indice, null, 'el estilo base del documento no se puede promover a título');
  assert.deepStrictEqual(plantilla.secciones, []);
});

(async () => {
  for (const { nombre, fn } of pendientes) {
    try { await fn(); console.log(`ok   ${nombre}`); } catch (e) { fallos += 1; console.log(`FALLO ${nombre}\n     ${e.message}`); }
  }
  console.log(fallos ? `\n${fallos} prueba(s) fallida(s)` : '\nTodas las pruebas correctas');
  process.exit(fallos ? 1 : 0);
})();
