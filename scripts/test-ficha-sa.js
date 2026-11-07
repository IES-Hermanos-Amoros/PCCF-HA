// Fichas de situación de aprendizaje: leerlas, editarlas y crear otras nuevas.
//
// El importador saca de cada ficha del Word una tabla de celdas más una cabecera
// con número, título, sesiones, evaluación y los RA que trabaja. Con eso se puede
// volver a imprimir la ficha, pero no editarla: no se sabe qué celda es
// «criterios de evaluación» y qué celda es «materiales y recursos».
//
// motor/ficha-sa.js convierte en los dos sentidos —tabla a modelo con campos con
// nombre, y modelo a tabla— y eso es lo que se comprueba aquí, con las dos
// maquetaciones que el documento real del departamento usa para las actividades:
// una etiqueta por fila, o tres y dos por fila.

const assert = require('assert');
const F = require('../motor/ficha-sa');
const { buildDocDefinition } = require('../motor/render-generico');

const c = (text, opts) => Object.assign({ text, colspan: 1, rowspan: 1, bold: false }, opts);

// --- maquetación mayoritaria: tres etiquetas en una fila, dos en la siguiente
const FILAS_ANCHAS = [
  [c('Situación de aprendizaje 1', { rowspan: 2, bold: true }), c('Introducción a los lenguajes de marcas', { rowspan: 2, bold: true }), c('Sesiones', { bold: true }), c('10', { bold: true })],
  [c('Evaluación', { bold: true }), c('1º', { bold: true })],
  [c('Resultado(s) de aprendizaje', { bold: true }), c('RA1 Reconoce las características de lenguajes de marcas.', { colspan: 3 })],
  [c('Criterios de evaluación', { colspan: 4, bold: true })],
  [c('RA1.a. Se han identificado las características generales.\nRA1.b. Se ha reconocido la estructura.', { colspan: 4 })],
  [c('Competencias profesionales para la empleabilidad', { colspan: 4, bold: true })],
  [c('h) Desarrollar interfaces gráficos de usuario.', { colspan: 4 })],
  [c('Objetivos de aprendizaje', { colspan: 4, bold: true })],
  [c('a) Ajustar la configuración lógica del sistema.', { colspan: 4 })],
  [c('Tipificación de actividades formativas', { colspan: 4, bold: true })],
  [c('Introducción', { colspan: 2, bold: true }), c('Formativas no evaluables', { bold: true }), c('Formativas evaluables', { bold: true })],
  [c('Test de iniciación al módulo.', { colspan: 2 }), c('− Debates sobre la importancia de los datos.'), c('− Actividades prácticas guiadas.')],
  [c('Actividades de refuerzo', { colspan: 2, bold: true }), c('Actividades de ampliación', { colspan: 2, bold: true })],
  [c('− Videotutoriales.', { colspan: 2 }), c('− Desarrollo de un documento propio.', { colspan: 2 })],
  [c('Actividades de recuperación', { colspan: 4, bold: true })],
  [c('Prueba escrita de los contenidos mínimos.', { colspan: 4 })],
  [c('Materiales y recursos didácticos disponibles', { colspan: 4, bold: true })],
  [c('− Apuntes del profesorado.\n− Aules.', { colspan: 4 })],
];

// --- la otra maquetación: una etiqueta por fila, el valor debajo
const FILAS_ESTRECHAS = [
  [c('Situación de aprendizaje 2', { rowspan: 2, bold: true }), c('El modelo relacional', { rowspan: 2, bold: true }), c('Sesiones', { bold: true }), c('17', { bold: true })],
  [c('Evaluación', { bold: true }), c('1ª', { bold: true })],
  [c('Resultado(s) de aprendizaje', { bold: true }), c('RA2. Crea bases de datos.', { colspan: 3 })],
  [c('Criterios de evaluación', { bold: true })],
  [c('RA2.a. Se ha analizado el formato de almacenamiento.')],
  [c('Competencias profesionales para la empleabilidad', { bold: true })],
  [c('d) Gestionar bases de datos.')],
  [c('Objetivos de aprendizaje', { bold: true })],
  [c('e) Interpretar el diseño lógico.')],
  [c('Tipificación de actividades formativas', { bold: true })],
  [c('Introducción', { bold: true })],
  [c('− Describir el origen del modelo relacional.')],
  [c('Formativas no evaluables', { bold: true })],
  [c('− Analizar las restricciones de un modelo lógico.')],
  [c('Formativas evaluables', { bold: true })],
  [c('− Crear bases de datos relacionales.')],
  [c('Actividades de refuerzo', { bold: true })],
  [c('− Crear bases de datos mediante herramientas gráficas.')],
  [c('Actividades de ampliación', { bold: true })],
  [c('− Implementar bases de datos complejas.')],
  [c('Actividades de recuperación', { bold: true })],
  [c('− Actividades similares a las enumeradas.')],
  [c('Materiales y recursos didácticos disponibles', { bold: true })],
  [c('− MySQL.')],
];

let fallos = 0;
const prueba = (nombre, fn) => {
  try { fn(); console.log(`ok   ${nombre}`); }
  catch (e) { fallos += 1; console.log(`FALLO ${nombre}\n     ${e.message}`); }
};

prueba('la ficha ancha se lee campo a campo', () => {
  const f = F.fichaDeFilas(FILAS_ANCHAS);
  assert.equal(f.num, 1);
  assert.equal(f.titulo, 'Introducción a los lenguajes de marcas');
  assert.equal(f.sesiones, 10);
  assert.equal(f.evaluacion, '1º');
  assert.deepEqual(f.ra, [1], 'el RA se escribe sin punto: "RA1 Reconoce…"');
  assert.deepEqual(f.ce, [
    'RA1.a. Se han identificado las características generales.',
    'RA1.b. Se ha reconocido la estructura.',
  ], 'cada línea de la celda es un criterio');
  assert.deepEqual(f.evaluables, ['Actividades prácticas guiadas.'], 'las viñetas del Word se quitan');
  assert.deepEqual(f.recursos, ['Apuntes del profesorado.', 'Aules.']);
});

prueba('la ficha estrecha se lee igual, con las etiquetas en filas sueltas', () => {
  const f = F.fichaDeFilas(FILAS_ESTRECHAS);
  assert.equal(f.num, 2);
  assert.equal(f.sesiones, 17);
  assert.deepEqual(f.ra, [2]);
  assert.deepEqual(f.introduccion, ['Describir el origen del modelo relacional.']);
  assert.deepEqual(f.ampliacion, ['Implementar bases de datos complejas.']);
  assert.deepEqual(f.recursos, ['MySQL.']);
});

prueba('ida y vuelta: modelo -> tabla -> modelo no pierde nada', () => {
  [FILAS_ANCHAS, FILAS_ESTRECHAS].forEach((filas) => {
    const f = F.fichaDeFilas(filas);
    const vuelta = F.fichaDeFilas(F.filasDeFicha(f));
    F.CAMPOS.forEach((campo) => assert.deepEqual(vuelta[campo.id], f[campo.id], campo.id));
    ['num', 'titulo', 'sesiones', 'evaluacion', 'raTexto'].forEach((k) => assert.deepEqual(vuelta[k], f[k], k));
    assert.deepEqual(vuelta.ra, f.ra);
  });
});

prueba('la cabecera que trae el importador manda sobre lo deducido', () => {
  const f = F.fichaDeFilas(FILAS_ANCHAS, { num: 7, titulo: 'Título del importador', sesiones: 12, evaluacion: '2ª', ra: [3, 4] });
  assert.equal(f.num, 7);
  assert.equal(f.titulo, 'Título del importador');
  assert.equal(f.sesiones, 12);
  assert.deepEqual(f.ra, [3, 4]);
  assert.deepEqual(f.ce.length, 2, 'el cuerpo se sigue leyendo de la tabla');
});

prueba('los RA se leen de las tres maneras que usa el documento', () => {
  assert.deepEqual(F.raDeTexto('RA2. Crea bases de datos.'), [2]);
  assert.deepEqual(F.raDeTexto('1. Reconoce las características.'), [1]);
  assert.deepEqual(F.raDeTexto('RA1 Reconoce los elementos.'), [1]);
  assert.deepEqual(F.raDeTexto('RA2 Evalúa entornos.\nRA4 Optimiza código.'), [2, 4]);
  assert.deepEqual(F.raDeTexto('Trabaja con 3 bases de datos y 2 vistas'), [],
    'sin "RA" delante ni signo detrás, una cifra no es un resultado de aprendizaje');
});

prueba('una SA nueva sale de la aplicación con todos sus apartados', () => {
  const nueva = F.fichaVacia(3);
  assert.equal(nueva.num, 3);
  assert.deepEqual(nueva.ce, []);
  assert.equal(F.esSemantica(nueva), true);
  assert.equal(F.esSemantica({ filas: FILAS_ANCHAS }), false, 'una tabla importada sin cuerpo no es un modelo');

  nueva.titulo = 'Consultas SQL';
  nueva.sesiones = 8;
  nueva.evaluacion = '2ª';
  nueva.raTexto = 'RA3. Consulta la información almacenada.';
  nueva.ra = F.raDeTexto(nueva.raTexto);
  nueva.ce = ['RA3.a. Se han identificado las herramientas.'];
  const filas = F.filasDeFicha(nueva);
  const texto = JSON.stringify(filas);
  assert.ok(texto.indexOf('Situación de aprendizaje 3') >= 0);
  assert.ok(texto.indexOf('Consultas SQL') >= 0);
  F.CAMPOS.forEach((campo) => assert.ok(texto.indexOf(campo.etiqueta) >= 0, 'falta la etiqueta ' + campo.etiqueta));
});

// ---------------------------------------------------------------- hasta el PDF
const plantilla = {
  tipo: 'programacion_didactica',
  origen: 'prueba.docx',
  generada: new Date().toISOString(),
  secciones: [
    { id: 'modulos',
      titulo: 'Módulos',
      nivel: 1,
      edita: 'docentes_del_modulo',
      instancias: true,
      etiqueta_instancia: 'módulo',
      campos: [],
      hijos: [
        { id: 'modulos/situaciones-de-aprendizaje',
          titulo: 'Situaciones de aprendizaje',
          nivel: 2,
          campos: [{ tipo: 'derivado.resumen_situaciones', id: 'resumen_situaciones', derivado: true }],
          hijos: [
            { id: 'modulos/situaciones-de-aprendizaje/situacion-de-aprendizaje',
              titulo: 'Situación de aprendizaje',
              nivel: 3,
              repetidor: true,
              campos: [
                { id: 'titulo', tipo: 'texto' },
                { tipo: 'ficha_situacion_aprendizaje', id: 'ficha', multiple: true },
              ],
              hijos: [] },
          ] },
      ] },
  ],
};

const documentoCon = (items) => buildDocDefinition({
  plantilla,
  datos: {
    departamento: 'informatica',
    documento: {},
    instancias: [{ titulo: 'Base de datos', docentes: [], valores: { 'modulos/situaciones-de-aprendizaje/situacion-de-aprendizaje': { items } } }],
    compartidos: {},
  },
  instancias: 'todas',
  titulo: 'Prueba',
  subtitulo: 'fichas de SA',
  estado: 'borrador',
});

prueba('una ficha importada se imprime con su tabla original', () => {
  const doc = documentoCon([{ titulo: 'Introducción a los lenguajes de marcas', ficha: [{ filas: FILAS_ANCHAS }] }]);
  const texto = JSON.stringify(doc);
  assert.ok(texto.indexOf('Test de iniciación al módulo.') >= 0, 'no salió el contenido de la ficha');
});

prueba('una SA creada en la aplicación, sin tabla importada, también se imprime', () => {
  const nueva = F.fichaVacia(1);
  nueva.titulo = 'Consultas SQL';
  nueva.sesiones = 8;
  nueva.evaluacion = '2ª';
  nueva.raTexto = 'RA3. Consulta la información almacenada.';
  nueva.ra = [3];
  nueva.ce = ['RA3.a. Se han identificado las herramientas de consulta.'];
  nueva.recursos = ['MySQL Workbench.'];

  const doc = documentoCon([{ titulo: nueva.titulo, ficha: [nueva] }]);
  const texto = JSON.stringify(doc);
  assert.ok(texto.indexOf('RA3.a. Se han identificado las herramientas de consulta.') >= 0,
    'la ficha sin `filas` no llegó al documento');
  assert.ok(texto.indexOf('MySQL Workbench.') >= 0);
  assert.ok(texto.indexOf('Materiales y recursos didácticos disponibles') >= 0, 'faltan las etiquetas de la ficha');
});

prueba('el resumen de situaciones se calcula a partir de las fichas', () => {
  const sa = (num, titulo, sesiones, ev, ra) => {
    const f = F.fichaVacia(num);
    Object.assign(f, { titulo, sesiones, evaluacion: ev, ra, raTexto: ra.map((n) => 'RA' + n + '. Algo.').join('\n') });
    return { titulo, ficha: [f] };
  };
  const doc = documentoCon([sa(1, 'El modelo relacional', 17, '1ª', [2]), sa(2, 'Consultas SQL', 8, '2ª', [3, 4])]);
  const texto = JSON.stringify(doc);
  assert.ok(texto.indexOf('SA 1: El modelo relacional') >= 0, 'el resumen no se calculó');
  assert.ok(texto.indexOf('SA 2: Consultas SQL') >= 0);
  assert.ok(texto.indexOf('"text":"25"') >= 0, 'el total de sesiones (17 + 8) no aparece');
});

console.log(fallos ? `\n${fallos} prueba(s) fallida(s)` : '\nTodas las pruebas correctas');
process.exit(fallos ? 1 : 0);
