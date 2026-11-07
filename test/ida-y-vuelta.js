// El ida y vuelta: importar -> guardar por apartados -> leer -> generar, y que el documento salga
// EXACTAMENTE igual.
//
//   node test/ida-y-vuelta.js
//
// Es la prueba del riesgo nº 1 del proyecto (docs/plan.md §2.6, docs/interfaz-web.md §2.3). Hoy
// funciona esto:
//
//   .docx -> importarDocx -> { plantilla, datos } -> buildDocDefinition -> PDF
//
// y la aplicación mete una base de datos en la mitad del camino. Si ese tramo nuevo pierde un campo,
// reordena los módulos o convierte un `null` en un campo ausente, el PDF sale distinto y nadie se
// entera hasta que alguien imprime su programación. Esta prueba lo impide, y existe antes que los
// editores precisamente para poder tocar `motor/render-generico.js` después con red de seguridad.
//
// QUÉ SE COMPARA
//
// La definición de documento de pdfmake, no los bytes del PDF. `buildDocDefinition` es una función
// pura de `{ plantilla, datos }`, así que si la definición es idéntica el PDF lo es; y cuando algo
// falla, un `deepStrictEqual` sobre la definición dice qué nodo cambió, mientras que dos PDF
// distintos solo dicen que son distintos. Por eso hay dos comparaciones y en este orden: primero
// `datos`, que señala el campo culpable, y luego la definición completa, que es el criterio de
// aceptación del E0.
//
// El documento sintético se monta a mano aquí, cubriendo los tipos de campo que de verdad hay en la
// programación del departamento: texto en bloques con listas anidadas y tramos en negrita y cursiva,
// tablas con celdas combinadas, la tabla de RA y CE, las ponderaciones (una con la suma mal, para que
// salga la cajita roja de comprobaciones), fichas de situación de aprendizaje de los dos tipos
// —importada y creada en la aplicación—, tablas de clave y valor, el resumen derivado, tres módulos y
// textos compartidos. Se monta aquí y no se importa de otra prueba para que esta se lea sola: cuando
// falle, lo que haya que mirar está en este fichero.
//
// Todo con el adaptador de memoria: ni base de datos ni red, así que se ejecuta en una máquina recién
// clonada. El documento real (out/ejemplo/) está fuera de git a propósito y, si no está, las dos
// últimas comprobaciones se omiten sin que la suite falle.

'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const { crearRepositorio } = require('../repositorio');
const memoria = require('../repositorio/memoria');
const { aFilas, aMotor, idDeTitulo } = require('../core/documento');
const { buildDocDefinition } = require('../motor/render-generico');

const RAIZ = path.join(__dirname, '..');

// ---------------------------------------------------------------- el arnés de pruebas
// Las pruebas son asíncronas (el repositorio lo es) pero se ejecutan en serie: el orden de los `ok`
// es el orden del fichero, así que el primer FALLO que se lee es el más cercano a la causa.
let fallos = 0;
const pendientes = [];
const prueba = (nombre, fn) => pendientes.push({ nombre, fn });
const nota = (texto) => console.log(`     ${texto}`);

// ---------------------------------------------------------------- ayudas de comparación

// `buildDocDefinition` devuelve `header` y `footer` como funciones, y la cajita roja de
// comprobaciones lleva su propio `layout` con cuatro funciones más. Dos llamadas crean cierres
// distintos, y `deepStrictEqual` compara funciones por referencia, así que compararía A con B y
// diría que no son iguales por algo que ni siquiera depende de los datos. Se sustituyen por su
// código fuente, que sí se puede comparar: si el generador pintara una cabecera distinta, el texto
// de la función cambiaría y la prueba lo vería.
//
// Se reconstruyen objetos y arrays en lugar de pasar por JSON para no perder nada: JSON.stringify se
// come las claves cuyo valor es `undefined`, y en esta definición hay unas cuantas (`colSpan`,
// `rowSpan`, `pageBreak`, `watermark`), que es exactamente el tipo de diferencia que esta prueba
// busca.
function comparable(x) {
  if (typeof x === 'function') return `[función] ${x.toString()}`;
  if (Array.isArray(x)) return x.map(comparable);
  if (x && typeof x === 'object') {
    const out = {};
    for (const k of Object.keys(x)) out[k] = comparable(x[k]);
    return out;
  }
  return x;
}

// Las rutas en las que dos estructuras difieren, en forma 'instancias.1.valores.modulos/x.texto.0'.
// Hace falta para la comprobación de §2.6 —«los apartados que no se han tocado salen idénticos»—,
// que no se contesta con un sí o un no: se contesta con la lista de lo que cambió.
function rutasQueCambian(a, b, ruta = '') {
  if (Object.is(a, b)) return [];
  const comparables = a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b);
  if (!comparables) return [ruta || '(raíz)'];
  const claves = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  return claves.flatMap((k) => rutasQueCambian(a[k], b[k], ruta ? `${ruta}.${k}` : k));
}

// ---------------------------------------------------------------- el repositorio
// Escribir y leer un documento entero. Es el tramo nuevo del camino: las cuatro colecciones en las
// que §2.3 parte el documento, con `crearMuchos` en lugar de una escritura por apartado porque una
// importación que se guardara a medias quedaría indistinguible de una completa.

async function guardar(repo, filas) {
  const doc = await repo.documentos.crear(filas.documento);
  if (filas.unidades.length) await repo.unidades.crearMuchos(doc._id, filas.unidades);
  if (filas.apartados.length) await repo.apartados.crearMuchos(doc._id, filas.apartados);
  if (filas.compartidos.length) await repo.compartidos.crearMuchos(doc._id, filas.compartidos);
  return doc._id;
}

// `unidades.listar()` se pasa a `aMotor` sin tocar: ese orden es el del tomo del PDF.
async function cargar(repo, id) {
  return {
    documento: await repo.documentos.obtener(id),
    unidades: await repo.unidades.listar(id),
    apartados: await repo.apartados.listar(id),
    compartidos: await repo.compartidos.listar(id),
  };
}

const nuevoRepo = () => crearRepositorio({ adaptador: memoria.crear() });

// Importar -> guardar -> leer -> volver al motor, que es el camino completo en una línea.
async function vuelta(entrada, opciones) {
  const repo = nuevoRepo();
  const id = await guardar(repo, aFilas(entrada, opciones));
  return { repo, id, salida: aMotor(await cargar(repo, id)) };
}

const generar = (entrada, extra = {}) => buildDocDefinition({
  plantilla: entrada.plantilla,
  datos: entrada.datos,
  instancias: 'todas',
  titulo: 'Programaciones didácticas · prueba de ida y vuelta',
  subtitulo: 'IES Hermanos Amorós',
  estado: 'borrador',
  ...extra,
});

// ================================================================ documento sintético

const c = (text, opts) => Object.assign({ text, colspan: 1, rowspan: 1, bold: false }, opts);
const campoTexto = { id: 'texto', tipo: 'texto_largo', etiqueta: 'Texto' };

// Celdas combinadas con las cubiertas OMITIDAS, que es la convención que espera `rejilla()`: la
// primera columna de la segunda fila no está porque la cubre el rowspan de arriba.
const TABLA_NORMATIVA = [
  [c('Ámbito', { bold: true, rowspan: 2 }), c('Norma', { bold: true, colspan: 2 })],
  [c('Estatal', { bold: true }), c('Autonómica', { bold: true })],
  [c('Ordenación'), c('RD 1147/2011'), c('Decreto 150/2024')],
  [c('Currículo'), c('RD 686/2010'), c('Orden 29/2024')],
];

// Una ficha de SA tal como sale del Word: la tabla de celdas, más la cabecera que el importador sabe
// interpretar. El renderer imprime `filas` tal cual.
const FILAS_FICHA = [
  [c('Situación de aprendizaje 1', { bold: true }), c('Introducción a los lenguajes de marcas', { colspan: 3 })],
  [c('Sesiones', { bold: true }), c('10'), c('Evaluación', { bold: true }), c('1ª')],
  [c('Resultados de aprendizaje', { bold: true }), c('1. Reconoce las características de los lenguajes de marcas.', { colspan: 3 })],
  [c('Criterios de evaluación', { bold: true }), c('a) Se han identificado las etiquetas.\nb) Se ha reconocido la jerarquía.', { colspan: 3 })],
];

const fichaImportada = () => ({
  filas: FILAS_FICHA,
  num: 1, titulo: 'Introducción a los lenguajes de marcas', sesiones: 10, evaluacion: '1ª',
  raTexto: '1. Reconoce las características de los lenguajes de marcas.', ra: [1],
  ce: ['a) Se han identificado las etiquetas.', 'b) Se ha reconocido la jerarquía.'],
  competencias: [], objetivos: [], introduccion: [], no_evaluables: [], evaluables: [],
  refuerzo: [], ampliacion: [], recuperacion: [], recursos: [],
});

// Una ficha creada en la aplicación: nunca estuvo en un Word, no tiene tabla importada y el renderer
// la monta desde sus campos con `filasDeFicha`. Es el otro camino del campo, y el que el E4 usa.
const fichaDeLaApp = () => ({
  filas: [],
  num: 2, titulo: 'Validación con esquemas', sesiones: 8, evaluacion: '2ª',
  raTexto: '2. Valida documentos contra un esquema.', ra: [2, 3],
  ce: ['a) Se ha validado con un esquema.', 'b) Se han corregido los errores.'],
  competencias: ['h) Desarrollar interfaces accesibles.'],
  objetivos: ['a) Ajustar la configuración del validador.'],
  introduccion: ['Prueba inicial de conocimientos previos.'],
  no_evaluables: ['Debate sobre estándares abiertos.'],
  evaluables: ['Prácticas guiadas de validación.'],
  refuerzo: ['Videotutoriales de repaso.'],
  ampliacion: ['Lectura de la especificación.'],
  recuperacion: ['Prueba escrita de recuperación.'],
  recursos: ['Apuntes del módulo.', 'Aules.'],
});

const RA_CE = { ra: [
  { num: 1, texto: 'Reconoce las características de los lenguajes de marcas.', ce: [
    { letra: 'a', texto: 'Se han identificado las etiquetas.' },
    { letra: 'b', texto: 'Se ha reconocido la jerarquía del documento.' },
  ] },
  { num: 2, texto: 'Valida documentos contra un esquema.', ce: [
    { letra: 'a', texto: 'Se ha validado con un esquema.' },
  ] },
] };

// Cuadran: los CE suman lo que pondera su RA y los RA suman 100 %.
const PONDERACIONES_OK = [
  { ra: 1, texto: 'Reconoce las características de los lenguajes de marcas.', ponderacion: 40, ce: [
    { letra: 'a', texto: 'Se han identificado las etiquetas.', ponderacion: 25, fundamental: true },
    { letra: 'b', texto: 'Se ha reconocido la jerarquía.', ponderacion: 15, fundamental: false },
  ] },
  { ra: 2, texto: 'Valida documentos contra un esquema.', ponderacion: 60, ce: [
    { letra: 'a', texto: 'Se ha validado con un esquema.', ponderacion: 60, fundamental: false },
  ] },
];

// No cuadran, a propósito: los CE del RA 1 suman 30 y el RA pondera 40, y los dos RA suman 90. Así
// un módulo lleva la cajita roja de «Comprobaciones automáticas» y los otros no, que es la parte de
// la definición que depende de `ctx.avisos` y se podría perder sin que nada más cambiase.
const PONDERACIONES_MAL = [
  { ra: 1, texto: 'Reconoce las características de los lenguajes de marcas.', ponderacion: 40, ce: [
    { letra: 'a', texto: 'Se han identificado las etiquetas.', ponderacion: 30, fundamental: false },
  ] },
  { ra: 2, texto: 'Valida documentos contra un esquema.', ponderacion: 50, ce: [
    { letra: 'a', texto: 'Se ha validado con un esquema.', ponderacion: 50, fundamental: true },
  ] },
];

const hijosDelModulo = () => [
  { id: 'modulos/identificacion', titulo: 'Identificación del módulo', nivel: 3,
    campos: [{ id: 'ficha_modulo', tipo: 'auto.ficha_modulo', etiqueta: 'Identificación' }], hijos: [] },
  { id: 'modulos/resultados-de-aprendizaje', titulo: 'Resultados de aprendizaje y criterios', nivel: 3,
    campos: [{ id: 'ra_ce', tipo: 'auto.tabla_ra_ce', etiqueta: 'RA y CE' }], hijos: [] },
  { id: 'modulos/metodologia', titulo: 'Metodología', nivel: 3, campos: [campoTexto], hijos: [] },
  { id: 'modulos/situaciones-de-aprendizaje', titulo: 'Situaciones de aprendizaje', nivel: 3,
    campos: [{ id: 'resumen_situaciones', tipo: 'derivado.resumen_situaciones', etiqueta: 'Resumen' }], hijos: [
      { id: 'modulos/situaciones-de-aprendizaje/situacion-de-aprendizaje', titulo: 'Situación de aprendizaje',
        nivel: 4, repetidor: true, campos: [
          { id: 'titulo', tipo: 'texto', etiqueta: 'Título' },
          { id: 'ficha', tipo: 'ficha_situacion_aprendizaje', etiqueta: 'Ficha', multiple: true },
        ], hijos: [] },
    ] },
  { id: 'modulos/ponderaciones', titulo: 'Ponderaciones', nivel: 3,
    campos: [{ id: 'ponderaciones', tipo: 'ponderacion_ra_ce', etiqueta: 'Ponderaciones', multiple: true }], hijos: [] },
  { id: 'modulos/recuperacion', titulo: 'Recuperación', nivel: 3, campos: [campoTexto], hijos: [] },
];

const PLANTILLA = {
  tipo: 'programacion_didactica',
  origen: 'sintetica.docx',
  version: null,
  generada: '2026-01-01T00:00:00.000Z',
  secciones: [
    { id: 'introduccion', titulo: 'Introducción', nivel: 1, edita: 'jefe_departamento', presencia: 1,
      campos: [campoTexto], hijos: [
        { id: 'introduccion/marco-legal', titulo: 'Marco legal', nivel: 2, presencia: 1,
          campos: [campoTexto, { id: 'tabla_normativa', tipo: 'tabla', etiqueta: 'Normativa aplicable' }], hijos: [
            { id: 'introduccion/marco-legal/el-centro', titulo: 'El centro', nivel: 3, presencia: 1,
              campos: [campoTexto, { id: 'datos_centro', tipo: 'tabla_clave_valor', etiqueta: 'Datos del centro' }], hijos: [] },
          ] },
      ] },
    { id: 'atencion-a-la-diversidad', titulo: 'Atención a la diversidad', nivel: 1,
      edita: 'jefe_departamento', presencia: 1, campos: [campoTexto], hijos: [] },
    { id: 'modulos', titulo: 'Módulos', nivel: 1, instancias: true, etiqueta_instancia: 'módulo',
      grupos: ['Módulos del primer curso', 'Módulos del segundo curso'], edita: 'docentes_del_modulo',
      presencia: 3, campos: [], hijos: hijosDelModulo() },
  ],
};

// Cada módulo lleva algo distinto para que un cruce de valores entre dos módulos —el fallo que haría
// el reparto por `unidadId`— se vea en la comparación en lugar de pasar desapercibido.
const valoresDelModulo = (nombre, { ponderaciones, compartido }) => ({
  'modulos/identificacion': { ficha_modulo: { pares: [
    { etiqueta: 'Módulo profesional', valor: nombre },
    { etiqueta: 'Horas totales', valor: '160' },
    { etiqueta: 'Curso', valor: '1º' },
  ] } },
  'modulos/resultados-de-aprendizaje': { ra_ce: RA_CE },
  'modulos/metodologia': { texto: [
    { type: 'p', text: `Metodología de ${nombre}, con trabajo por proyectos.` },
    { ref: compartido },
  ] },
  'modulos/situaciones-de-aprendizaje/situacion-de-aprendizaje': { items: [
    { titulo: 'Introducción a los lenguajes de marcas', ficha: [fichaImportada()] },
    { titulo: 'Validación con esquemas', ficha: [fichaDeLaApp()] },
  ] },
  'modulos/ponderaciones': { ponderaciones },
  'modulos/recuperacion': { texto: [{ type: 'p', text: 'Prueba escrita de recuperación por resultado de aprendizaje.' }] },
});

const DATOS = {
  departamento: 'informatica',
  documento: {
    introduccion: { texto: [
      { type: 'p', text: 'Primer párrafo, con & ampersand, <menor> y "comillas".' },
      { type: 'p', text: [
        { text: 'Mezcla de ' }, { text: 'negrita', bold: true }, { text: ' y ' },
        { text: 'cursiva', italics: true }, { text: ' en el mismo párrafo.' },
      ] },
      { type: 'p', text: [{ text: 'Todo el párrafo en negrita.', bold: true }] },
      { type: 'list', items: [
        { text: 'Primer nivel', level: 0 },
        { text: 'Segundo nivel', level: 1 },
        { text: 'Tercer nivel', level: 2 },
        { text: 'Otra vez el primero', level: 0 },
      ] },
      { ref: 'c001' },
    ] },
    'introduccion/marco-legal': {
      texto: [{ type: 'p', text: 'La normativa de referencia es la siguiente.' }],
      tabla_normativa: { filas: TABLA_NORMATIVA },
    },
    'introduccion/marco-legal/el-centro': {
      texto: [{ type: 'p', text: 'El IES Hermanos Amorós es un centro de Villena.' }],
      datos_centro: { pares: [
        { etiqueta: 'Localidad', valor: 'Villena' },
        { etiqueta: 'Código de centro', valor: '03012345' },
      ] },
    },
    'atencion-a-la-diversidad': { texto: [{ ref: 'c002' }] },
  },
  instancias: [
    { titulo: 'Lenguaje de Marcas y Sistemas de Gestión de Información', num: '3.1',
      grupo: 'Módulos del primer curso', docentes: ['ana'],
      valores: valoresDelModulo('Lenguaje de Marcas', { ponderaciones: PONDERACIONES_OK, compartido: 'c001' }) },
    { titulo: 'Programación', num: null, grupo: 'Módulos del primer curso', docentes: [],
      valores: valoresDelModulo('Programación', { ponderaciones: PONDERACIONES_MAL, compartido: 'c001' }) },
    { titulo: 'Diseño de interfaces web', num: '3.3', grupo: 'Módulos del segundo curso', docentes: ['luis', 'ana'],
      valores: valoresDelModulo('Diseño de interfaces web', { ponderaciones: PONDERACIONES_OK, compartido: 'c002' }) },
  ],
  asignaciones: { 'introduccion/marco-legal': ['ana'] },
  compartidos: {
    c001: {
      bloque: { type: 'p', text: 'Las faltas de asistencia se justifican en los tres días siguientes a la reincorporación.' },
      seccion: 'introduccion', comun: true, responsable: 'jefe_departamento', modo: 'sugerido', version: 1,
    },
    c002: {
      bloque: { type: 'list', items: [
        { text: 'Adaptaciones de acceso al currículo.', level: 0 },
        { text: 'Medidas de nivel III.', level: 1 },
      ] },
      seccion: 'atencion-a-la-diversidad', comun: true, responsable: 'jefe_departamento', modo: 'obligatorio', version: 3,
    },
  },
};

// El documento de partida, intacto. Se congela una copia para que ninguna prueba pueda cambiarlo sin
// querer y dejar verdes a las siguientes por el motivo equivocado.
const ENTRADA = { plantilla: PLANTILLA, datos: DATOS };
const ENTRADA_ORIGINAL = structuredClone(ENTRADA);

const OPCIONES = { curso: '2026-27', ciclo: 'daw', departamento: 'informatica', origenApartados: 'nuevo' };

// ================================================================ pruebas

prueba('el documento sintético usa de verdad todos los tipos de campo', () => {
  const tipos = new Set();
  const recorrer = (secs) => secs.forEach((s) => { s.campos.forEach((x) => tipos.add(x.tipo)); recorrer(s.hijos || []); });
  recorrer(PLANTILLA.secciones);
  for (const t of ['texto_largo', 'tabla', 'tabla_clave_valor', 'auto.ficha_modulo', 'auto.tabla_ra_ce',
    'ponderacion_ra_ce', 'ficha_situacion_aprendizaje', 'derivado.resumen_situaciones', 'texto']) {
    assert.ok(tipos.has(t), `falta un campo de tipo ${t} en la plantilla de la prueba`);
  }
  // Si el documento no llegara a pintar nada, A y B serían iguales por vacíos. Estas marcas
  // comprueban que los caminos que más se pueden perder están en la definición del PDF.
  const texto = JSON.stringify(comparable(generar(ENTRADA)));
  assert.ok(texto.includes('Comprobaciones automáticas'), 'ningún módulo ha disparado los avisos de las ponderaciones');
  // Esa fila solo la escribe `resumenSituaciones`, que es el campo derivado: no está en los datos,
  // se calcula a partir de las fichas cada vez que se pinta.
  assert.ok(texto.includes('SA 1: Introducción a los lenguajes de marcas'), 'no se ha pintado el resumen derivado de las situaciones');
  assert.ok(texto.includes('Las faltas de asistencia'), 'el texto compartido no se ha resuelto');
  assert.ok(texto.includes('Tipificación de actividades'), 'la ficha creada en la aplicación no se ha montado desde sus campos');
});

prueba('aFilas reparte el documento en las cuatro colecciones', () => {
  const filas = aFilas(ENTRADA, OPCIONES);

  assert.equal(filas.documento.tipo, 'programacion_didactica');
  assert.equal(filas.documento.curso, '2026-27', 'el curso es una dimensión del modelo desde el E0 (§2.1)');
  assert.equal(filas.documento.plantillaVersion, 1, 'la plantilla se guarda versionada desde el E0 (§2.6)');
  assert.equal(filas.documento.estado, 'borrador');
  assert.deepStrictEqual(filas.documento.asignaciones, DATOS.asignaciones);

  assert.equal(filas.unidades.length, 3);
  assert.deepStrictEqual(filas.unidades.map((u) => u.unidadId), [
    'lenguaje-de-marcas-y-sistemas-de-gestion-de-informacion', 'programacion', 'diseno-de-interfaces-web',
  ]);
  assert.deepStrictEqual(filas.unidades[1], { unidadId: 'programacion', titulo: 'Programación', num: null, grupo: 'Módulos del primer curso', docentes: [] });

  // Un apartado por celda de la matriz (sección × unidad): 4 comunes y 6 por cada uno de los 3
  // módulos. Es la unidad de guardado de §2.3.
  const comunes = filas.apartados.filter((a) => a.unidadId === null);
  assert.equal(comunes.length, 4);
  assert.equal(filas.apartados.length, 4 + 3 * 6);
  assert.ok(comunes.every((a) => a.origen === 'nuevo'), 'el origen de los apartados viene de las opciones');
  assert.deepStrictEqual(filas.compartidos.map((x) => x.cid), ['c001', 'c002']);
  assert.equal(filas.compartidos[1].modo, 'obligatorio');

  // Ni aFilas ni aMotor copian, pero tampoco tocan lo que reciben.
  assert.deepStrictEqual(ENTRADA, ENTRADA_ORIGINAL, 'aFilas ha modificado el documento de entrada');
});

prueba('aFilas y aMotor son inversas sin pasar por el repositorio', () => {
  // Esta prueba aísla el mapeo: si falla aquí, el problema está en core/documento.js y no en la
  // persistencia. Si pasa aquí y falla la siguiente, el problema está en el tramo nuevo.
  const vuelto = aMotor(aFilas(ENTRADA, OPCIONES));
  assert.deepStrictEqual(vuelto.datos, DATOS);
  assert.deepStrictEqual(vuelto.plantilla, PLANTILLA);
});

prueba('`datos` vuelve exactamente igual después de pasar por el repositorio', async () => {
  const { salida } = await vuelta(ENTRADA, OPCIONES);
  // Primero los datos y luego el PDF: cuando algo se pierde, este mensaje dice en qué campo.
  assert.deepStrictEqual(salida.datos, DATOS);
  assert.deepStrictEqual(salida.plantilla, PLANTILLA);
});

prueba('el PDF generado desde el repositorio es idéntico al generado desde el importador', async () => {
  const A = generar(ENTRADA);
  const { salida } = await vuelta(ENTRADA, OPCIONES);
  const B = generar(salida);
  // El criterio de aceptación del E0.
  assert.deepStrictEqual(comparable(B), comparable(A));
});

prueba('el PDF también es idéntico con un documento aprobado y un solo módulo', async () => {
  // El estado y la selección de instancias son argumentos del generador, no datos guardados, pero
  // cambian la portada, la marca de agua y los saltos de página: conviene que el ida y vuelta se
  // compruebe en más de una combinación.
  const extra = { estado: 'aprobado', instancias: ['Programación'] };
  const A = generar(ENTRADA, extra);
  const { salida } = await vuelta(ENTRADA, OPCIONES);
  assert.deepStrictEqual(comparable(generar(salida, extra)), comparable(A));
});

prueba('el orden de los módulos es el del documento, no el alfabético ni el del título', async () => {
  const { salida } = await vuelta(ENTRADA, OPCIONES);
  assert.deepStrictEqual(salida.datos.instancias.map((i) => i.titulo), DATOS.instancias.map((i) => i.titulo));

  // Y lo que de verdad importa: que el tomo salga en ese orden. Los títulos de nivel 2 del apartado
  // de módulos tienen que aparecer numerados y en orden.
  const dd = generar(salida);
  const titulos = dd.content.filter((n) => n.style === 'h2' && /^3\.\d+\. /.test(n.text || '')).map((n) => n.text);
  assert.deepStrictEqual(titulos, [
    '3.1. Lenguaje de Marcas y Sistemas de Gestión de Información',
    '3.2. Programación',
    '3.3. Diseño de interfaces web',
  ]);
});

prueba('escribir un apartado cambia ese apartado y nada más', async () => {
  const { repo, id } = await vuelta(ENTRADA, OPCIONES);
  const antes = aMotor(await cargar(repo, id)).datos;

  const SECCION = 'modulos/metodologia';
  const UNIDAD = 'programacion';
  const fila = await repo.apartados.leer(id, SECCION, UNIDAD);
  assert.ok(fila, 'el apartado que se va a editar no existe');

  await repo.apartados.escribir(id, SECCION, UNIDAD, {
    valores: { texto: [{ type: 'p', text: 'Metodología reescrita desde la aplicación.' }] },
    origen: 'modificado',
  }, { esperaUpdatedAt: fila.updatedAt });

  const despues = aMotor(await cargar(repo, id)).datos;
  const rutas = rutasQueCambian(antes, despues);
  assert.ok(rutas.length > 0, 'la escritura no ha cambiado nada: la prueba no está comprobando nada');

  // El criterio de §2.6: los apartados que no se han tocado salen idénticos. Se comprueba sobre los
  // datos y no sobre los bytes del PDF porque el generador es una función pura de los datos, así que
  // si los datos solo cambian ahí, el documento también.
  const esperado = `instancias.1.valores.${SECCION}`;
  for (const r of rutas) {
    assert.ok(r === esperado || r.startsWith(`${esperado}.`), `ha cambiado «${r}», que no se ha tocado`);
  }
  assert.deepStrictEqual(
    despues.instancias[1].valores[SECCION].texto,
    [{ type: 'p', text: 'Metodología reescrita desde la aplicación.' }],
  );
  // Y el texto compartido que había en ese apartado sigue vivo en los otros módulos.
  assert.deepStrictEqual(despues.compartidos, DATOS.compartidos);
  assert.deepStrictEqual(despues.instancias[0].valores[SECCION], antes.instancias[0].valores[SECCION]);
});

prueba('dos módulos con el mismo título no se pisan', async () => {
  // «Proyecto intermodular» o «Formación en centros de trabajo» pueden aparecer en los dos cursos del
  // ciclo con el mismo título, y el repositorio rechaza dos unidades con el mismo unidadId. Si el id
  // derivado del título no desempatase, la importación entera se caería.
  const datos = {
    departamento: 'informatica',
    documento: { introduccion: { texto: [{ type: 'p', text: 'Uno.' }] } },
    instancias: [
      { titulo: 'Proyecto', num: '1', grupo: 'Primero', docentes: [], valores: { 'modulos/metodologia': { texto: [{ type: 'p', text: 'Primero.' }] } } },
      { titulo: 'Proyecto', num: '2', grupo: 'Segundo', docentes: [], valores: { 'modulos/metodologia': { texto: [{ type: 'p', text: 'Segundo.' }] } } },
    ],
    asignaciones: {},
    compartidos: {},
  };
  const filas = aFilas({ plantilla: PLANTILLA, datos });
  assert.deepStrictEqual(filas.unidades.map((u) => u.unidadId), ['proyecto', 'proyecto-2']);

  const { salida } = await vuelta({ plantilla: PLANTILLA, datos });
  assert.deepStrictEqual(salida.datos, datos);
});

prueba('el unidadId sale de conciliar() cuando se le pasa, no del título', async () => {
  // Lo que hará el E1 con el catálogo de docs/mockup-v2/js/unidades.js: el título cambia de curso a
  // curso y el id estable no, así que el documento se tiene que poder leer igual con los dos.
  const catalogo = {
    'Lenguaje de Marcas y Sistemas de Gestión de Información': 'daw-0373',
    Programación: 'daw-0485',
    'Diseño de interfaces web': 'daw-0615',
  };
  const conciliar = (titulo) => catalogo[titulo] || idDeTitulo(titulo);
  const filas = aFilas(ENTRADA, { ...OPCIONES, conciliar });
  assert.deepStrictEqual(filas.unidades.map((u) => u.unidadId), ['daw-0373', 'daw-0485', 'daw-0615']);
  assert.ok(filas.apartados.some((a) => a.unidadId === 'daw-0485'), 'los apartados no se han colgado del id conciliado');

  const { salida } = await vuelta(ENTRADA, { ...OPCIONES, conciliar });
  assert.deepStrictEqual(salida.datos, DATOS);
  assert.deepStrictEqual(comparable(generar(salida)), comparable(generar(ENTRADA)));

  // Un catálogo que mandara dos módulos al mismo id estable se queja en voz alta en lugar de
  // desempatar: dos módulos compartiendo id es justo el fallo que el unidadId viene a evitar.
  assert.throws(() => aFilas(ENTRADA, { conciliar: () => 'daw-0373' }), /mismo unidadId/);
  assert.throws(() => aFilas(ENTRADA, { conciliar: () => null }), /no devolvió un unidadId/);
});

// ---------------------------------------------------------------- el documento real
// out/ejemplo/ es la programación del departamento ya saneada (npm run ejemplo): 3 MB, 11 módulos,
// 221 apartados, 57 secciones. Está fuera de git a propósito, así que si no está se omite y la suite
// sigue verde: tiene que poder ejecutarse en una máquina recién clonada. Un documento sintético de
// 20 apartados no prueba lo mismo que el real —ahí están los campos ausentes en unos módulos y
// presentes en otros, los `num` nulos y las fichas con dos maquetaciones distintas—, pero dejar la
// suite colgando de un fichero que no se puede clonar sería peor.

const DIR_EJEMPLO = path.join(RAIZ, 'out', 'ejemplo');
const hayEjemplo = ['plantilla.json', 'datos.json'].every((f) => fs.existsSync(path.join(DIR_EJEMPLO, f)));

if (!hayEjemplo) {
  prueba('el documento real se omite porque no está en el repositorio', () => {
    nota('no están out/ejemplo/plantilla.json y out/ejemplo/datos.json, que quedan fuera de git a');
    nota('propósito (3 MB sacados del documento real). Se generan con:');
    nota('  npm run ejemplo -- "ruta/a/la/programación.docx"');
    nota('Las comprobaciones del documento sintético ya han cubierto el ida y vuelta.');
  });
} else {
  const leer = (f) => JSON.parse(fs.readFileSync(path.join(DIR_EJEMPLO, f), 'utf8'));
  const real = { plantilla: leer('plantilla.json'), datos: leer('datos.json') };

  prueba('documento real: `datos` vuelve exactamente igual', async () => {
    const t0 = Date.now();
    const { salida } = await vuelta(real, { curso: '2025-26', ciclo: 'daw' });
    assert.deepStrictEqual(salida.datos, real.datos);
    assert.deepStrictEqual(salida.plantilla, real.plantilla);
    nota(`${real.datos.instancias.length} módulos · ${Object.keys(real.datos.documento).length} apartados comunes · ida y vuelta en ${Date.now() - t0} ms`);
  });

  prueba('documento real: el tomo generado desde el repositorio es idéntico', async () => {
    const t0 = Date.now();
    const A = generar(real);
    const t1 = Date.now();
    const { salida } = await vuelta(real, { curso: '2025-26', ciclo: 'daw' });
    const t2 = Date.now();
    assert.deepStrictEqual(comparable(generar(salida)), comparable(A));
    nota(`generar ${t1 - t0} ms · ida y vuelta ${t2 - t1} ms · comparar ${Date.now() - t2} ms`);
  });
}

// ================================================================ ejecución

(async () => {
  for (const { nombre, fn } of pendientes) {
    try {
      await fn();
      console.log(`ok   ${nombre}`);
    } catch (e) {
      fallos += 1;
      // Un deepStrictEqual sobre el tomo entero suelta un diff de megabytes: se recorta para que el
      // fallo se pueda leer, que es de lo que sirve una prueba.
      const mensaje = String(e && e.message || e);
      console.log(`FALLO ${nombre}\n     ${mensaje.slice(0, 2000).replace(/\n/g, '\n     ')}`);
      if (mensaje.length > 2000) console.log(`     … (${mensaje.length - 2000} caracteres más de diferencias)`);
    }
  }
  console.log(fallos ? `\n${fallos} prueba(s) fallida(s)` : '\nTodas las pruebas correctas');
  process.exit(fallos ? 1 : 0);
})();
