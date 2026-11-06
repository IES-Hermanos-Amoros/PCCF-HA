// Exportación a Word: lo que se escribe tiene que poder leerse de vuelta.
//
// lib/exportar-docx.js es el inverso del importador, así que la prueba que
// importa es la ida y vuelta: se monta a mano una plantilla con datos que usan
// todo (títulos de tres niveles, texto con formato, lista con dos niveles, tabla
// con celdas combinadas, RA/CE, ponderaciones, módulos y fichas de SA), se
// escribe el .docx en el directorio temporal, se vuelve a importar y se compara.
//
// El importador solo guarda como dato la negrita de un párrafo ENTERO; la
// negrita y la cursiva de tramos sueltos se comprueban en el HTML de mammoth.

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const JSZip = require('jszip');
const mammoth = require('mammoth');
const { exportarDocx, escribirDocx } = require('../lib/exportar-docx');
const { importarDocx } = require('../lib/importar-docx');
const F = require('../lib/ficha-sa');

let fallos = 0;
const pendientes = [];
const prueba = (nombre, fn) => pendientes.push({ nombre, fn });

const c = (text, opts) => Object.assign({ text, colspan: 1, rowspan: 1, bold: false }, opts);
const campoTexto = { id: 'texto', tipo: 'texto_largo', etiqueta: 'Texto' };

// ---------------------------------------------------------------- documento de prueba
const FICHA1 = Object.assign(F.fichaVacia(1), {
  titulo: 'Introducción a XML', sesiones: 10, evaluacion: '1º', raTexto: '1. Reconoce la estructura de un documento XML.', ra: [1],
  ce: ['a) Se han identificado las etiquetas.', 'b) Se ha reconocido la jerarquía.'],
  competencias: ['h) Desarrollar interfaces.'], objetivos: ['a) Ajustar la configuración.'],
  introduccion: ['Test inicial.'], no_evaluables: ['Debates.'], evaluables: ['Prácticas guiadas.'],
  refuerzo: ['Videotutoriales.'], ampliacion: ['Documento propio.'], recuperacion: ['Prueba escrita.'],
  recursos: ['Apuntes.', 'Aules.'],
});
const FICHA2 = Object.assign(F.fichaVacia(2), {
  titulo: 'Esquemas y validación', sesiones: 8, evaluacion: '2º', raTexto: '2. Valida documentos.', ra: [2],
  ce: ['a) Se ha validado con un esquema.'], recursos: ['Editor XML.'],
});

const RA_CE = { ra: [
  { num: 1, texto: 'Reconoce lenguajes de marcas.', ce: [{ letra: 'a', texto: 'Se han identificado las características.' }, { letra: 'b', texto: 'Se han clasificado.' }] },
  { num: 2, texto: 'Utiliza lenguajes de marcas.', ce: [{ letra: 'a', texto: 'Se han creado documentos.' }] },
] };
const PONDERACIONES = [
  { ra: 1, texto: 'Reconoce lenguajes de marcas.', ponderacion: 40, ce: [{ letra: 'a', texto: 'Se han identificado.', ponderacion: 25, fundamental: true }, { letra: 'b', texto: 'Se han clasificado.', ponderacion: 15, fundamental: false }] },
  { ra: 2, texto: 'Utiliza lenguajes de marcas.', ponderacion: 60, ce: [{ letra: 'a', texto: 'Se han creado.', ponderacion: 60, fundamental: false }] },
];

const hijosModulo = () => [
  { id: 'modulos/identificacion', titulo: 'Identificación', nivel: 3, campos: [{ id: 'ficha_modulo', tipo: 'auto.ficha_modulo', etiqueta: 'Identificación del módulo' }], hijos: [] },
  { id: 'modulos/resultados-de-aprendizaje', titulo: 'Resultados de aprendizaje', nivel: 3, campos: [{ id: 'ra_ce', tipo: 'auto.tabla_ra_ce', etiqueta: 'RA y CE' }], hijos: [] },
  { id: 'modulos/situaciones-de-aprendizaje', titulo: 'Situaciones de aprendizaje', nivel: 3, campos: [], hijos: [
    { id: 'modulos/situaciones-de-aprendizaje/situacion-de-aprendizaje', titulo: 'Situación de aprendizaje', nivel: 4, repetidor: true,
      campos: [{ id: 'titulo', tipo: 'texto', etiqueta: 'Título' }, { id: 'ficha', tipo: 'ficha_situacion_aprendizaje', etiqueta: 'Ficha', multiple: true }], hijos: [] },
  ] },
  { id: 'modulos/ponderaciones', titulo: 'Ponderaciones', nivel: 3, campos: [{ id: 'ponderaciones', tipo: 'ponderacion_ra_ce', etiqueta: 'Ponderaciones', multiple: true }], hijos: [] },
];
const valoresModulo = (nombre) => ({
  'modulos/identificacion': { ficha_modulo: { pares: [{ etiqueta: 'Módulo profesional', valor: nombre }, { etiqueta: 'Horas', valor: '160' }, { etiqueta: 'Curso', valor: '1º' }] } },
  'modulos/resultados-de-aprendizaje': { ra_ce: RA_CE },
  'modulos/situaciones-de-aprendizaje/situacion-de-aprendizaje': { items: [{ titulo: FICHA1.titulo, ficha: [FICHA1] }, { titulo: FICHA2.titulo, ficha: [FICHA2] }] },
  'modulos/ponderaciones': { ponderaciones: PONDERACIONES },
});

const TABLA = [
  [c('Cabecera A', { bold: true, rowspan: 2 }), c('Cabecera B', { bold: true, colspan: 2 })],
  [c('B1', { bold: true }), c('B2', { bold: true })],
  [c('uno'), c('dos'), c('tres')],
];

const PLANTILLA = {
  tipo: 'programacion_didactica', origen: 'prueba', generada: '2026-01-01T00:00:00.000Z',
  secciones: [
    { id: 'introduccion', titulo: 'Introducción', nivel: 1, campos: [campoTexto], hijos: [
      { id: 'introduccion/marco-legal', titulo: 'Marco legal', nivel: 2, campos: [campoTexto, { id: 'tabla-demo', tipo: 'tabla', etiqueta: 'Tabla' }], hijos: [
        { id: 'introduccion/marco-legal/normativa-aplicable', titulo: 'Normativa aplicable', nivel: 3, campos: [campoTexto], hijos: [] },
      ] },
    ] },
    { id: 'modulos', titulo: 'Módulos', nivel: 1, instancias: true, etiqueta_instancia: 'módulo', grupos: ['Módulos'], campos: [], hijos: hijosModulo() },
  ],
};
const DATOS = {
  departamento: null,
  documento: {
    introduccion: { texto: [
      { type: 'p', text: 'Primer párrafo con & ampersand, <menor> y "comillas".' },
      { type: 'p', text: [{ text: 'Mezcla de ' }, { text: 'negrita', bold: true }, { text: ' y ' }, { text: 'cursiva', italics: true }, { text: ' en un párrafo.' }] },
      { type: 'p', text: [{ text: 'Todo el párrafo en negrita.', bold: true }] },
      { type: 'list', items: [{ text: 'Uno', level: 0 }, { text: 'Uno punto uno', level: 1 }, { text: 'Uno punto dos', level: 1 }, { text: 'Dos', level: 0 }] },
      { ref: 'c001' },
    ] },
    'introduccion/marco-legal': { texto: [{ type: 'p', text: 'Texto del marco legal.' }], 'tabla-demo': { filas: TABLA } },
    'introduccion/marco-legal/normativa-aplicable': { texto: [{ type: 'p', text: 'Un apartado de tercer nivel.' }] },
  },
  instancias: [
    { titulo: 'Módulo A', num: '2.1', grupo: 'Módulos', docentes: [], valores: valoresModulo('Módulo A') },
    { titulo: 'Módulo B', num: '2.2', grupo: 'Módulos', docentes: [], valores: valoresModulo('Módulo B') },
  ],
  asignaciones: {},
  compartidos: { c001: { bloque: { type: 'p', text: 'Texto compartido, escrito una sola vez.' }, comun: true, modo: 'sugerido', version: 1 } },
};

// --- ayudas de comparación
const esquema = (secs, prof = 0) => secs.flatMap((s) => [`${'  '.repeat(prof)}${s.id} | ${s.titulo}${s.repetidor ? ' (repetidor)' : ''}`, ...esquema(s.hijos || [], prof + 1)]);
const buscarCampo = (secs, tipo) => {
  for (const s of secs) {
    const hallado = s.campos.find((x) => x.tipo === tipo) || buscarCampo(s.hijos || [], tipo);
    if (hallado) return hallado;
  }
  return null;
};
const sinFormato = (b) => b.map((x) => (x.type === 'list' ? x : { type: x.type, text: Array.isArray(x.text) ? x.text.map((t) => t.text).join('') : x.text }));

let docx = null; // el .docx de la prueba, escrito una sola vez en el directorio temporal
let leido = null;
const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'exportar-docx-'));

prueba('el zip lleva las seis partes mínimas y mammoth lo lee sin errores', async () => {
  const ruta = path.join(carpeta, 'prueba.docx');
  await escribirDocx(ruta, { plantilla: PLANTILLA, datos: DATOS, titulo: 'Documento de prueba' });
  docx = fs.readFileSync(ruta);
  const zip = await JSZip.loadAsync(docx);
  for (const parte of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/_rels/document.xml.rels', 'word/styles.xml', 'word/numbering.xml']) {
    assert.ok(zip.file(parte), `falta ${parte}`);
  }
  const { messages } = await mammoth.convertToHtml({ buffer: docx });
  assert.deepStrictEqual(messages.filter((m) => m.type === 'error'), [], 'mammoth informa de errores');
  leido = await importarDocx({ buffer: docx });
});

prueba('salen las mismas secciones, con sus ids y su anidamiento', () => {
  assert.deepStrictEqual(esquema(leido.plantilla.secciones), esquema(PLANTILLA.secciones));
  assert.deepStrictEqual(leido.plantilla.secciones.map((s) => !!s.instancias), [false, true]);
});

prueba('los módulos vuelven como instancias numeradas y con su contenido', () => {
  const ins = leido.datos.instancias;
  assert.deepStrictEqual(ins.map((i) => [i.titulo, i.num]), [['Módulo A', '2.1'], ['Módulo B', '2.2']]);
  assert.strictEqual(ins[1].valores['modulos/identificacion'].ficha_modulo.pares[0].valor, 'Módulo B');
});

prueba('el texto de los párrafos coincide, con los caracteres especiales intactos', () => {
  const texto = leido.datos.documento.introduccion.texto;
  assert.strictEqual(texto[0].text, 'Primer párrafo con & ampersand, <menor> y "comillas".');
  assert.strictEqual(texto[1].text, 'Mezcla de negrita y cursiva en un párrafo.');
  assert.strictEqual(texto[2].text, 'Todo el párrafo en negrita.');
  assert.strictEqual(leido.datos.documento['introduccion/marco-legal/normativa-aplicable'].texto[0].text, 'Un apartado de tercer nivel.');
});

prueba('la negrita y la cursiva sobreviven', async () => {
  const { value: html } = await mammoth.convertToHtml({ buffer: docx });
  assert.ok(html.includes('Mezcla de <strong>negrita</strong> y <em>cursiva</em> en un párrafo.'), 'se perdió el formato de los tramos');
  assert.ok(html.includes('<strong>Todo el párrafo en negrita.</strong>'));
});

prueba('un texto compartido se escribe resuelto, no como referencia', () => {
  const texto = leido.datos.documento.introduccion.texto;
  const ultimo = texto[texto.length - 1];
  assert.strictEqual(ultimo.text, 'Texto compartido, escrito una sola vez.');
});

prueba('la lista vuelve con sus dos niveles', () => {
  const lista = leido.datos.documento.introduccion.texto.find((b) => b.type === 'list');
  assert.deepStrictEqual(lista, { type: 'list', items: [
    { text: 'Uno', level: 0 }, { text: 'Uno punto uno', level: 1 }, { text: 'Uno punto dos', level: 1 }, { text: 'Dos', level: 0 },
  ] });
});

prueba('la tabla con celdas combinadas conserva colspan y rowspan', () => {
  const campos = leido.datos.documento['introduccion/marco-legal'];
  const v = campos[Object.keys(campos).find((k) => k.startsWith('tabla'))];
  const resumen = v.filas.map((f) => f.map((x) => [x.text, x.colspan, x.rowspan, x.bold]));
  assert.deepStrictEqual(resumen, TABLA.map((f) => f.map((x) => [x.text, x.colspan, x.rowspan, x.bold])));
});

prueba('la tabla de RA/CE se vuelve a clasificar y recupera sus criterios', () => {
  assert.ok(buscarCampo(leido.plantilla.secciones, 'auto.tabla_ra_ce'), 'no se reconoce como auto.tabla_ra_ce');
  const v = leido.datos.instancias[0].valores['modulos/resultados-de-aprendizaje'].ra_ce;
  assert.deepStrictEqual(v.ra, RA_CE.ra);
});

prueba('las ponderaciones se vuelven a clasificar y recuperan RA, CE y porcentajes', () => {
  assert.ok(buscarCampo(leido.plantilla.secciones, 'ponderacion_ra_ce'), 'no se reconoce como ponderacion_ra_ce');
  const v = leido.datos.instancias[1].valores['modulos/ponderaciones'].ponderaciones;
  assert.strictEqual(v.length, 2);
  v.forEach((p, i) => {
    const e = PONDERACIONES[i];
    assert.deepStrictEqual([p.ra, p.texto, p.ponderacion], [e.ra, e.texto, e.ponderacion]);
    assert.deepStrictEqual(p.ce, e.ce);
  });
});

prueba('las fichas de SA se vuelven a clasificar y fichaDeFilas() recupera sus campos', () => {
  assert.ok(buscarCampo(leido.plantilla.secciones, 'ficha_situacion_aprendizaje'), 'no se reconoce como ficha_situacion_aprendizaje');
  for (const ins of leido.datos.instancias) {
    const items = ins.valores['modulos/situaciones-de-aprendizaje/situacion-de-aprendizaje'].items;
    assert.deepStrictEqual(items.map((i) => i.titulo), [FICHA1.titulo, FICHA2.titulo]);
    // con una sola ficha por SA el importador la guarda suelta, no en lista
    const fichas = items.map((i) => F.fichaDeFilas([].concat(i.ficha)[0].filas));
    assert.deepStrictEqual(fichas[0], F.fichaDeFilas(F.filasDeFicha(FICHA1)));
    assert.deepStrictEqual(fichas[1], F.fichaDeFilas(F.filasDeFicha(FICHA2)));
    assert.strictEqual(fichas[0].sesiones, 10);
    assert.deepStrictEqual(fichas[0].recursos, ['Apuntes.', 'Aules.']);
  }
});

prueba('se puede elegir qué módulos se exportan y conservan su número', async () => {
  const buffer = await exportarDocx({ plantilla: PLANTILLA, datos: DATOS, instancias: ['Módulo B'] });
  const { value: html } = await mammoth.convertToHtml({ buffer });
  assert.ok(html.includes('2.2. Módulo B'), 'falta el módulo elegido con su número');
  assert.ok(!html.includes('Módulo A'), 'se ha colado el módulo no elegido');
  const porIndice = await exportarDocx({ plantilla: PLANTILLA, datos: DATOS, instancias: [0] });
  assert.ok((await mammoth.convertToHtml({ buffer: porIndice })).value.includes('2.1. Módulo A'));
});

prueba('un documento sin datos de un campo no falla y lo demás se escribe', async () => {
  const buffer = await exportarDocx({ plantilla: PLANTILLA, datos: { documento: {}, instancias: [] } });
  const { value: html } = await mammoth.convertToHtml({ buffer });
  assert.ok(html.includes('<h1>1. Introducción</h1>'));
});

// documento real ya importado (ficheros locales, ignorados por git): si no están, se omite
prueba('el documento real importado se reescribe con las mismas secciones e instancias', async () => {
  const dir = path.join(__dirname, '..', 'out', 'importado');
  if (!fs.existsSync(path.join(dir, 'plantilla.json')) || !fs.existsSync(path.join(dir, 'datos.json'))) { console.log('     (omitida: no hay documento importado en out/importado)'); return; }
  const plantilla = JSON.parse(fs.readFileSync(path.join(dir, 'plantilla.json'), 'utf8'));
  const datos = JSON.parse(fs.readFileSync(path.join(dir, 'datos.json'), 'utf8'));
  const otra = await importarDocx({ buffer: await exportarDocx({ plantilla, datos }) });
  assert.deepStrictEqual(esquema(otra.plantilla.secciones), esquema(plantilla.secciones));
  assert.strictEqual(otra.datos.instancias.length, datos.instancias.length);
  const cuenta = (d) => d.instancias.reduce((n, i) => n + JSON.stringify(i.valores).split('"filas"').length - 1, 0);
  assert.strictEqual(cuenta(otra.datos), cuenta(datos), 'cambia el número de tablas por módulo');
});

prueba('con `incluirInicial` no se pierde el contenido anterior al primer título', async () => {
  // Los PCCF llevan el cuerpo entero antes del primer título, porque sus
  // apartados son párrafos numerados y no estilos de título. Sin esta opción el
  // importador lo descarta con un aviso, y entonces ese contenido —donde están
  // las tablas de empresas— nunca pasa por el saneador: o se publica tal cual o
  // no se publica nada. La opción es opcional a propósito: el camino del PDF y
  // el del importador de siempre no cambian.
  const ruta = path.join(carpeta, 'con-portada.docx');
  await escribirDocx(ruta, { plantilla: PLANTILLA, datos: DATOS, titulo: 'Título de portada' });

  const sin = await importarDocx({ path: ruta });
  assert.ok(sin.informe.avisos.some((a) => /antes del primer título/.test(a)), 'tiene que avisar de lo que descarta');
  assert.ok(!sin.plantilla.secciones.some((x) => x.id === 'contenido-inicial'), 'sin la opción no debe haber sección');

  const con = await importarDocx({ path: ruta }, { incluirInicial: true });
  assert.ok(!con.informe.avisos.some((a) => /antes del primer título/.test(a)), 'con la opción no se descarta nada');
  assert.ok(con.plantilla.secciones.some((x) => x.id === 'contenido-inicial'), 'falta la sección del contenido inicial');
  assert.ok(JSON.stringify(con.datos.documento['contenido-inicial'] || {}).indexOf('Título de portada') >= 0,
    'la sección está pero sin el contenido que se iba a perder');
});

// Un .docx mínimo, armado a mano, cuyos títulos usan un estilo con el nombre que
// le pone Word en español (o LibreOffice) en lugar de «heading N». No se puede
// construir con el exportador, que escribe los suyos en inglés, y es justo el
// caso que hacía entrar un documento entero como un solo apartado.
const docxConEstiloPropio = async (nombreEstilo, conNivel) => {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
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
    + '<w:style w:type="paragraph" w:styleId="MiTitulo"><w:name w:val="' + esc(nombreEstilo) + '"/>'
    + (conNivel ? '<w:pPr><w:outlineLvl w:val="0"/></w:pPr>' : '')
    + '</w:style></w:styles>');
  const p = (estilo, texto) => '<w:p><w:pPr><w:pStyle w:val="' + estilo + '"/></w:pPr>'
    + '<w:r><w:t>' + esc(texto) + '</w:t></w:r></w:p>';
  zip.file('word/document.xml', '<?xml version="1.0" encoding="UTF-8"?>'
    + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
    + p('MiTitulo', 'Primer apartado') + p('Normal', 'Texto del primero.')
    + p('MiTitulo', 'Segundo apartado') + p('Normal', 'Texto del segundo.')
    + '</w:body></w:document>');
  return zip.generateAsync({ type: 'nodebuffer' });
};

prueba('los títulos se reconocen por el nivel de esquema, no por el nombre del estilo', async () => {
  const buffer = await docxConEstiloPropio('Título 1 (user)', true);
  const { plantilla } = await importarDocx({ buffer });
  const titulos = plantilla.secciones.map((s) => s.titulo);
  assert.deepEqual(titulos, ['Primer apartado', 'Segundo apartado'],
    'con el nivel de esquema puesto, los dos títulos tienen que ser apartados: ' + JSON.stringify(titulos));
});

prueba('un estilo sin nivel de esquema no se toma por título', async () => {
  // El otro lado de la moneda: hay documentos cuyos apartados son un estilo
  // propio sin nivel de esquema, y ahí no hay estructura que leer. Mejor un
  // apartado único que inventarse una jerarquía a partir de la negrita.
  const buffer = await docxConEstiloPropio('Estilo de la casa', false);
  const { plantilla } = await importarDocx({ buffer }, { incluirInicial: true });
  const titulos = plantilla.secciones.map((s) => s.titulo);
  assert.ok(titulos.indexOf('Primer apartado') < 0,
    'sin nivel de esquema no debería haber apartados: ' + JSON.stringify(titulos));
});

prueba('el mismo contenido da los mismos bytes', async () => {
  // El documento de ejemplo está versionado, así que no basta con que el
  // contenido sea igual: si los bytes cambian, cada regeneración mete un binario
  // nuevo de 240 KB en el historial aunque no haya cambiado una letra. jszip pone
  // la fecha del momento en cada entrada del zip, y además crea solas las
  // entradas de carpeta, que no pasan por la opción `date`: de ahí salían seis
  // bytes distintos entre dos ejecuciones.
  const a = await exportarDocx({ plantilla: PLANTILLA, datos: DATOS, titulo: 'Documento de prueba' });
  const b = await exportarDocx({ plantilla: PLANTILLA, datos: DATOS, titulo: 'Documento de prueba' });
  assert.equal(Buffer.compare(a, b), 0, 'dos exportaciones del mismo contenido dan ficheros distintos');

  const zip = await JSZip.loadAsync(a);
  const carpetas = Object.keys(zip.files).filter((k) => zip.files[k].dir);
  assert.deepEqual(carpetas, [], 'el zip no debe llevar entradas de carpeta: las fecha jszip por su cuenta');
  Object.keys(zip.files).forEach((k) => {
    assert.equal(zip.files[k].date.getUTCFullYear(), 2000, 'la entrada ' + k + ' no lleva la fecha fija');
  });
});

(async () => {
  for (const { nombre, fn } of pendientes) {
    try { await fn(); console.log(`ok   ${nombre}`); } catch (e) { fallos += 1; console.log(`FALLO ${nombre}\n     ${e.message}`); }
  }
  fs.rmSync(carpeta, { recursive: true, force: true });
  console.log(fallos ? `\n${fallos} prueba(s) fallida(s)` : '\nTodas las pruebas correctas');
  process.exit(fallos ? 1 : 0);
})();
