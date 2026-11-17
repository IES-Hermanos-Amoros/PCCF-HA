// Pruebas del índice y de los saltos de página del Word (motor/exportar-docx.js).
//
//   node test/docx-impresion.js
//
// Se genera el .docx de verdad, se abre con jszip y se mira el XML. Lo que se fija:
//
//   1. EL ÍNDICE ES UN CAMPO TOC, con el nivel configurado, y va ANTES del primer título. Con
//      `updateFields` en word/settings.xml para que Word lo rellene al abrir.
//   2. SIN ÍNDICE (`indice: 0`) NO QUEDA RASTRO: ni campo, ni rótulo, ni settings.
//   3. LOS SALTOS SIGUEN AL NÚMERO IMPRESO, y el primer título del cuerpo nunca salta.
//   4. EL IMPORTADOR NO LEE EL ÍNDICE COMO CONTENIDO, y mammoth relee el documento sin quejarse.

'use strict';

const assert = require('assert/strict');
const JSZip = require('jszip');
const mammoth = require('mammoth');

const { exportarDocx } = require('../motor/exportar-docx');
const { importarDocx } = require('../motor/importar-docx');

let fallos = 0;
const pendientes = [];
const prueba = (nombre, fn) => pendientes.push({ nombre, fn });

// ---------------------------------------------------------------- el documento sintético
const texto = { id: 'texto', tipo: 'texto_largo', etiqueta: 'Texto' };
const p = (t) => [{ type: 'p', text: t }];

const PLANTILLA = {
  tipo: 'programacion_didactica',
  origen: 'sintetica.docx',
  version: null,
  generada: '2026-01-01T00:00:00.000Z',
  secciones: [
    { id: 'introduccion', titulo: 'Introducción', nivel: 1, presencia: 1, campos: [texto], hijos: [
      { id: 'introduccion/marco-legal', titulo: 'Marco legal', nivel: 2, presencia: 1, campos: [texto], hijos: [] },
    ] },
    { id: 'diversidad', titulo: 'Atención a la diversidad', nivel: 1, presencia: 1, campos: [texto], hijos: [] },
    { id: 'modulos', titulo: 'Módulos', nivel: 1, instancias: true, etiqueta_instancia: 'módulo',
      grupos: ['Módulos del primer curso', 'Módulos del segundo curso'], presencia: 2, campos: [], hijos: [
        { id: 'modulos/metodologia', titulo: 'Metodología', nivel: 2, presencia: 2, campos: [texto], hijos: [] },
        { id: 'modulos/situaciones', titulo: 'Situación de aprendizaje', nivel: 2, repetidor: true, presencia: 2,
          campos: [{ id: 'titulo', tipo: 'texto', etiqueta: 'Título' }, texto], hijos: [] },
      ] },
  ],
};

const DATOS = {
  departamento: 'informatica',
  documento: {
    introduccion: { texto: p('Texto de la introducción.') },
    'introduccion/marco-legal': { texto: p('Texto del marco legal.') },
    diversidad: { texto: p('Texto de diversidad.') },
  },
  instancias: ['Lenguaje de marcas', 'Programación'].map((titulo, i) => ({
    titulo, num: null, grupo: i ? 'Módulos del segundo curso' : 'Módulos del primer curso', docentes: [],
    valores: {
      'modulos/metodologia': { texto: p(`Metodología de ${titulo}.`) },
      'modulos/situaciones': { items: [{ titulo: 'Primera', texto: p('Contenido de la situación.') }] },
    },
  })),
};

const generar = async (impresion) => {
  const buffer = await exportarDocx({ plantilla: PLANTILLA, datos: DATOS, titulo: 'Programación de prueba', impresion });
  const zip = await JSZip.loadAsync(buffer);
  return { buffer, zip, xml: await zip.file('word/document.xml').async('string') };
};

// Los párrafos de título con su nivel y si llevan salto, en orden de aparición.
const titulos = (xml) => [...xml.matchAll(/<w:p><w:pPr><w:pStyle w:val="Heading(\d)"\/>(<w:pageBreakBefore\/>)?<\/w:pPr>(.*?)<\/w:p>/g)]
  .map((m) => ({
    nivel: Number(m[1]),
    salto: !!m[2],
    texto: [...m[3].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((t) => t[1]).join(''),
  }));
const conSalto = (xml) => titulos(xml).filter((t) => t.salto).map((t) => t.texto);

// ---------------------------------------------------------------- el índice

prueba('sin configurar: indice de nivel 2, con updateFields, antes del primer Heading1', async () => {
  const { zip, xml } = await generar(undefined);
  assert.match(xml, /TOC \\o &quot;1-2&quot; \\h \\z \\u /);
  const ajustes = await zip.file('word/settings.xml').async('string');
  assert.match(ajustes, /<w:updateFields w:val="true"\/>/);
  assert.match(await zip.file('[Content_Types].xml').async('string'),
    /PartName="\/word\/settings.xml" ContentType="application\/vnd.openxmlformats-officedocument.wordprocessingml.settings\+xml"/);
  assert.match(await zip.file('word/_rels/document.xml.rels').async('string'),
    /Type="http:\/\/schemas.openxmlformats.org\/officeDocument\/2006\/relationships\/settings" Target="settings.xml"/);
  assert.ok(xml.indexOf('TOC \\o') < xml.indexOf('w:val="Heading1"'), 'el índice tiene que ir antes del primer título');
  assert.ok(xml.indexOf('Programación de prueba') < xml.indexOf('TOC \\o'), 'y detrás de la portada');
});

prueba('indice: 4 escribe 1-4', async () => {
  const { xml } = await generar({ indice: 4 });
  assert.match(xml, /TOC \\o &quot;1-4&quot;/);
});

prueba('indice: 0 no deja campo, ni rotulo, ni updateFields, ni settings', async () => {
  const { zip, xml } = await generar({ indice: 0 });
  assert.doesNotMatch(xml, /TOC /);
  assert.doesNotMatch(xml, /fldSimple/);
  assert.doesNotMatch(xml, /Índice/);
  assert.equal(zip.file('word/settings.xml'), null);
  assert.doesNotMatch(await zip.file('[Content_Types].xml').async('string'), /settings/);
  assert.doesNotMatch(await zip.file('word/_rels/document.xml.rels').async('string'), /settings/);
});

// ---------------------------------------------------------------- los saltos

prueba('sin configurar el unico salto es el que deja al indice con su pagina', async () => {
  const { xml } = await generar(undefined);
  // Sin este salto el indice y el primer apartado comparten pagina y el indice parece el principio
  // de ese apartado. No es un salto de la configuracion: es del indice.
  assert.deepEqual(conSalto(xml), ['1. Introducción']);
});

prueba('sin indice y con saltos, el primer apartado NO salta: seria una pagina en blanco', async () => {
  for (const saltos of [1, 2, 3, 6]) {
    const { xml } = await generar({ indice: 0, saltos });
    assert.equal(titulos(xml)[0].texto, '1. Introducción', `saltos ${saltos}`);
    assert.equal(titulos(xml)[0].salto, false, `saltos ${saltos}`);
  }
});

prueba('saltos: 1 -> los de primer nivel saltan; los de segundo no', async () => {
  const { xml } = await generar({ saltos: 1 });
  const ts = titulos(xml);
  assert.equal(ts[0].texto, '1. Introducción');
  assert.deepEqual(conSalto(xml), [
    '1. Introducción', '2. Atención a la diversidad', '3. Módulos del primer curso',
    'Módulos del segundo curso',
  ]);
  assert.equal(ts.filter((t) => t.nivel === 2 && t.salto).length, 0);
});

prueba('saltos: 2 -> tambien los de segundo nivel (el marco legal y cada modulo)', async () => {
  const { xml } = await generar({ saltos: 2 });
  // «3.1 Lenguaje de marcas» NO salta: va pegado al titulo de su grupo, que acaba de saltar, y si
  // saltara el nombre del grupo se quedaria solo en su pagina (core/impresion.js).
  assert.deepEqual(conSalto(xml), [
    '1. Introducción', '1.1. Marco legal', '2. Atención a la diversidad',
    '3. Módulos del primer curso', 'Módulos del segundo curso',
  ]);
  // la situación de aprendizaje es un título sin número impreso: no salta aunque tenga nivel de esquema
  assert.equal(titulos(xml).find((t) => /^Situación de aprendizaje 1/.test(t.texto)).salto, false);
});

prueba('el segundo grupo de modulos salta igual que el primero, aunque no lleve numero impreso', async () => {
  const { xml } = await generar({ saltos: 1 });
  const grupo = titulos(xml).find((t) => t.texto === 'Módulos del segundo curso');
  assert.equal(grupo.salto, true);
});

prueba('el salto es una propiedad del parrafo y no un w:br dentro del titulo', async () => {
  const { xml } = await generar({ saltos: 6 });
  assert.match(xml, /<w:pPr><w:pStyle w:val="Heading1"\/><w:pageBreakBefore\/><\/w:pPr>/);
  assert.doesNotMatch(xml, /w:br w:type="page"/);
});

// ---------------------------------------------------------------- la lectura de vuelta

prueba('mammoth relee el documento con indice y saltos sin errores', async () => {
  const { buffer } = await generar({ indice: 3, saltos: 2 });
  const r = await mammoth.convertToHtml({ buffer });
  assert.deepEqual(r.messages.filter((m) => m.type === 'error'), []);
  assert.match(r.value, /Introducción/);
});

prueba('el importador no mete el indice como contenido', async () => {
  const sin = await importarDocx({ buffer: (await generar({ indice: 0 })).buffer });
  const con = await importarDocx({ buffer: (await generar({ indice: 3, saltos: 2 })).buffer });
  const volcado = JSON.stringify({ plantilla: con.plantilla, datos: con.datos });
  assert.doesNotMatch(volcado, /Para ver el índice/);
  assert.doesNotMatch(volcado, /Índice/);
  // con índice y saltos sale la misma estructura y los mismos datos que sin ellos
  assert.deepEqual(con.plantilla.secciones.map((s) => s.titulo), sin.plantilla.secciones.map((s) => s.titulo));
  assert.deepEqual(con.datos, sin.datos);
});

(async () => {
  for (const { nombre, fn } of pendientes) {
    try { await fn(); console.log(`ok   ${nombre}`); } catch (e) { fallos += 1; console.log(`FALLO ${nombre}\n     ${e.message}`); }
  }
  console.log(fallos ? `\n${fallos} fallos` : '\ntodo bien');
  process.exit(fallos ? 1 : 0);
})();
