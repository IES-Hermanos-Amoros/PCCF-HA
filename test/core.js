// Pruebas de la lógica compartida de core/, directamente y sin intermediarios.
//
// Hasta ahora la regla de permisos solo se probaba de rebote: `scripts/test-permisos.js`
// la ejerce a través de la búsqueda del motor y `docs/mockup-v2/test.js` a través de
// la del navegador. Las dos pruebas son necesarias —comprueban que cada búsqueda
// resuelve bien lo suyo— pero ninguna fija la regla: si mañana alguien cambia una
// rama de `reglaEdicion`, las dos suites cambian de resultado a la vez y las dos
// siguen "coincidiendo".
//
// Así que aquí está la regla escrita como TABLA DE VERDAD, rol por rol y caso por
// caso. Es el documento de quién puede qué, en forma ejecutable: si alguien discute
// un permiso en una reunión de departamento, esto es lo que hay que leer, y si se
// decide cambiarlo, esto es lo que hay que cambiar primero.

'use strict';

const assert = require('assert');

const P = require('../core/permisos');
const S = require('../core/sa');
const C = require('../core/conciliar');
const CAT = require('../core/unidades');
const Conf = require('../core/confirmar');

let fallos = 0;
const prueba = (nombre, fn) => {
  try { fn(); console.log(`ok   ${nombre}`); }
  catch (e) { fallos += 1; console.log(`FALLO ${nombre}\n     ${e.message}`); }
};

const DEP = 'informatica';
const usuario = (rol, extra) => Object.assign({ id: 'u1', rol, departamento: DEP }, extra || {});
const ROLES = ['admin', 'jefe_estudios', 'jefe_departamento', 'docente'];

// --------------------------------------------------------------- puedeVer

prueba('puedeVer: admin y jefatura de estudios ven cualquier departamento', () => {
  for (const rol of ['admin', 'jefe_estudios']) {
    assert.strictEqual(P.puedeVer(usuario(rol), { departamento: 'otro' }), true, rol);
    assert.strictEqual(P.puedeVer(usuario(rol), { departamento: null }), true, rol + ' sin departamento');
  }
});

prueba('puedeVer: jefatura de departamento y docentes, solo el suyo', () => {
  for (const rol of ['jefe_departamento', 'docente']) {
    assert.strictEqual(P.puedeVer(usuario(rol), { departamento: DEP }), true, rol + ' el suyo');
    assert.strictEqual(P.puedeVer(usuario(rol), { departamento: 'otro' }), false, rol + ' otro');
  }
});

prueba('puedeVer: un documento sin departamento no lo ve nadie que no sea soporte', () => {
  // Es deliberado: un documento al que le falta el departamento está a medio
  // crear, y abrirlo a todo el mundo sería la forma más tonta de filtrar uno.
  assert.strictEqual(P.puedeVer(usuario('jefe_departamento'), { departamento: null }), false);
  assert.strictEqual(P.puedeVer(usuario('docente'), {}), false);
});

prueba('puedeVer: sin usuario, no', () => {
  assert.strictEqual(P.puedeVer(null, { departamento: DEP }), false);
  assert.strictEqual(P.puedeVer(undefined, { departamento: DEP }), false);
});

// ----------------------------------------------------------- reglaEdicion

// La tabla entera. Cada fila es: rol, qué dice la plantilla que edita este
// apartado, si el usuario lleva la unidad, si tiene el apartado asignado, y si
// puede editar. Escrita a mano a propósito: generarla con la propia regla no
// probaría nada.
const TABLA = [
  // rol                  edita                    unidad  asignado  puede
  ['admin',              'jefe_departamento',      false,  false,    true],
  ['admin',              'docentes_del_modulo',    false,  false,    true],
  ['admin',              null,                     false,  false,    true],

  // Quien aprueba el documento no lo escribe. Ni siquiera lo que se le asigne.
  ['jefe_estudios',      'jefe_departamento',      false,  false,    false],
  ['jefe_estudios',      'docentes_del_modulo',    true,   true,     false],

  // La jefatura de departamento edita CUALQUIER módulo, lo lleve o no. Es la
  // regla del departamento y es justo la rama que se bifurcó en el mockup v1.
  ['jefe_departamento',  'docentes_del_modulo',    false,  false,    true],
  ['jefe_departamento',  'docentes_del_modulo',    true,   false,    true],
  ['jefe_departamento',  'jefe_departamento',      false,  false,    true],

  // Un docente edita su módulo, y los apartados comunes que se le deleguen.
  ['docente',            'docentes_del_modulo',    true,   false,    true],
  ['docente',            'docentes_del_modulo',    false,  false,    false],
  ['docente',            'docentes_del_modulo',    false,  true,     false],
  ['docente',            'jefe_departamento',      false,  true,     true],
  ['docente',            'jefe_departamento',      false,  false,    false],
  ['docente',            'jefe_departamento',      true,   false,    false],
];

prueba('reglaEdicion: la tabla de quién edita qué, entera', () => {
  for (const [rol, edita, unidad, asignado, esperado] of TABLA) {
    const r = P.reglaEdicion(usuario(rol), {
      edita,
      esDocenteDeLaUnidad: unidad,
      tieneApartadoAsignado: asignado,
    });
    assert.strictEqual(r, esperado,
      `${rol} · edita=${edita} · unidad=${unidad} · asignado=${asignado} → esperaba ${esperado}`);
  }
});

prueba('reglaEdicion: un `edita` desconocido no lo edita nadie salvo soporte', () => {
  // Si algún día se añade un tercer valor a `edita` y se olvida este fichero, el
  // efecto tiene que ser que no se pueda editar, no que pueda cualquiera.
  for (const rol of ['jefe_estudios', 'jefe_departamento', 'docente']) {
    assert.strictEqual(P.reglaEdicion(usuario(rol), { edita: 'claustro' }), false, rol);
    assert.strictEqual(P.reglaEdicion(usuario(rol), { edita: null }), false, rol + ' con null');
    assert.strictEqual(P.reglaEdicion(usuario(rol), {}), false, rol + ' sin edita');
  }
  assert.strictEqual(P.reglaEdicion(usuario('admin'), { edita: 'claustro' }), true, 'admin sí');
});

prueba('reglaEdicion: sin usuario, no', () => {
  assert.strictEqual(P.reglaEdicion(null, { edita: 'jefe_departamento' }), false);
  assert.strictEqual(P.reglaEdicion(undefined, {}), false);
});

// --------------------------------------------------------- reglaCompartido

prueba('reglaCompartido: editar un texto compartido cambia todos los módulos', () => {
  // Por eso es más que editar un apartado: lo hace la jefatura de departamento,
  // o quien tenga delegado el apartado común del que sale el texto.
  const caso = (rol, extra) => P.reglaCompartido(usuario(rol), Object.assign({
    comun: true, editaApartadoComun: true, tieneApartadoAsignado: false,
  }, extra || {}));

  assert.strictEqual(caso('admin'), true, 'admin');
  assert.strictEqual(caso('jefe_estudios', { tieneApartadoAsignado: true }), false, 'jefatura de estudios nunca');
  assert.strictEqual(caso('jefe_departamento'), true, 'jefatura de departamento siempre');
  assert.strictEqual(caso('docente'), false, 'docente sin delegación');
  assert.strictEqual(caso('docente', { tieneApartadoAsignado: true }), true, 'docente con delegación');
});

prueba('reglaCompartido: un texto que no sale de un apartado común no se delega', () => {
  const r = P.reglaCompartido(usuario('docente'), {
    comun: false, editaApartadoComun: true, tieneApartadoAsignado: true,
  });
  assert.strictEqual(r, false);
});

prueba('reglaCompartido: si el apartado de origen no es delegable, tampoco', () => {
  const r = P.reglaCompartido(usuario('docente'), {
    comun: true, editaApartadoComun: false, tieneApartadoAsignado: true,
  });
  assert.strictEqual(r, false);
});

// -------------------------------------------------------- reglaDesvincular

prueba('reglaDesvincular: solo los textos sugeridos, y solo donde se puede editar', () => {
  const caso = (modo, puede) => P.reglaDesvincular(usuario('docente'), {
    modo, puedeEditarElApartado: puede,
  });
  assert.strictEqual(caso('sugerido', true), true, 'sugerido y puede');
  assert.strictEqual(caso('sugerido', false), false, 'sugerido pero no puede');
  assert.strictEqual(caso('obligatorio', true), false, 'obligatorio no se esquiva');
  assert.strictEqual(caso(undefined, true), false, 'sin modo');
});

prueba('reglaDesvincular: ni la jefatura de departamento puede desvincular un obligatorio', () => {
  // La diferencia entre los dos modos es justo esta: «obligatorio» quiere decir
  // que nadie se queda una copia propia. Si se pudiera, los dos modos serían uno.
  const r = P.reglaDesvincular(usuario('jefe_departamento'), {
    modo: 'obligatorio', puedeEditarElApartado: true,
  });
  assert.strictEqual(r, false);
});

// -------------------------------------------- quienEdita y apartado común

const PLANTILLA = {
  secciones: [
    { id: 'introduccion', edita: 'jefe_departamento', hijos: [
      { id: 'introduccion/contextualizacion' },
      { id: 'introduccion/normativa', edita: 'jefe_departamento' },
    ] },
    { id: 'modulos', edita: 'docentes_del_modulo', hijos: [
      { id: 'modulos/evaluacion', hijos: [
        { id: 'modulos/evaluacion/recuperacion' },
        // Un subapartado de módulo que, excepcionalmente, lleva la jefatura:
        // es el caso que obliga a quedarse con el `edita` MÁS PROFUNDO.
        { id: 'modulos/evaluacion/criterios-del-centro', edita: 'jefe_departamento' },
      ] },
    ] },
  ],
};

prueba('quienEdita: los subapartados heredan del padre', () => {
  assert.strictEqual(P.quienEdita(PLANTILLA, 'introduccion'), 'jefe_departamento');
  assert.strictEqual(P.quienEdita(PLANTILLA, 'introduccion/contextualizacion'), 'jefe_departamento');
  assert.strictEqual(P.quienEdita(PLANTILLA, 'modulos/evaluacion'), 'docentes_del_modulo');
  assert.strictEqual(P.quienEdita(PLANTILLA, 'modulos/evaluacion/recuperacion'), 'docentes_del_modulo');
});

prueba('quienEdita: manda el `edita` más profundo, no el primero que se encuentra', () => {
  assert.strictEqual(
    P.quienEdita(PLANTILLA, 'modulos/evaluacion/criterios-del-centro'),
    'jefe_departamento',
    'un subapartado puede reservarse para la jefatura dentro de un bloque de módulos',
  );
});

prueba('quienEdita: una sección que no está en la plantilla no la edita nadie', () => {
  assert.strictEqual(P.quienEdita(PLANTILLA, 'inventado'), null);
  assert.strictEqual(P.quienEdita(PLANTILLA, 'introduccionzzz'), null, 'no vale que empiece igual');
  assert.strictEqual(P.quienEdita({}, 'introduccion'), null, 'ni con una plantilla vacía');
});

prueba('apartadoComun y raizSeccion dan lo mismo: el apartado de primer nivel', () => {
  // Hay dos formas de averiguarlo —buscando en la plantilla, o cortando el id
  // por el primer '/'— y la interfaz usa la segunda porque ya tiene el árbol
  // construido. Tienen que coincidir, o delegar un apartado haría una cosa en el
  // servidor y otra en el navegador.
  const ids = [
    'introduccion',
    'introduccion/contextualizacion',
    'modulos/evaluacion/recuperacion',
    'modulos/evaluacion/criterios-del-centro',
  ];
  for (const id of ids) {
    assert.strictEqual(P.apartadoComun(PLANTILLA, id), P.raizSeccion(id), id);
  }
});

// ------------------------------------------------------------------ core/sa

prueba('fichaVacia: la evaluación entra por parámetro, y eso no es un descuido', () => {
  // El motor no pasa ninguna y se queda con '' porque reconstruye fichas leídas
  // de un documento: inventar "1ª" sería escribir un dato que no está en el Word.
  // La interfaz pasa '1ª' al crear una SA nueva porque una ficha sin evaluación
  // acaba en un grupo sin nombre en la tabla resumen del PDF (render-generico.js
  // agrupa por `f.evaluacion || ''`) y ninguna validación avisa de ello.
  assert.strictEqual(S.fichaVacia(1).evaluacion, '', 'el motor, sin evaluación');
  assert.strictEqual(S.fichaVacia(1, '1ª').evaluacion, '1ª', 'la interfaz, con la primera');
  assert.strictEqual(S.fichaVacia(3).num, 3, 'y conserva el número');
});

// En el documento, los resultados de aprendizaje de una ficha son UNA LÍNEA DE
// PROSA CADA UNO, tal como los escribe el real decreto del título:
//
//     RA1. Evalúa sistemas informáticos, identificando sus componentes…
//     RA3. Gestiona la información en formatos de intercambio de datos…
//
// o, en algunos módulos, numerados sin el prefijo ("1. Reconoce las…").
const RA_DOS_LINEAS = 'RA1. Evalúa sistemas informáticos, identificando sus componentes.\n'
  + 'RA3. Gestiona la información en formatos de intercambio de datos.';

prueba('core/sa: `ra` es un campo derivado, se recalcula del texto impreso', () => {
  // Lo que viaja en el documento es `raTexto`; el array `ra` es su lectura. Por
  // eso rellenar `ra` a mano sin tocar el texto no llega al papel, y conviene
  // tenerlo escrito porque invita a confundirse en la dirección contraria.
  const f = Object.assign(S.fichaVacia(1, '2ª'), { raTexto: RA_DOS_LINEAS });
  const vuelta = S.fichaDeFilas(S.filasDeFicha(f));
  assert.deepStrictEqual(vuelta.ra, [1, 3], 'los números salen del texto');
  assert.strictEqual(vuelta.raTexto, RA_DOS_LINEAS, 'y el texto se conserva entero');

  const sinTexto = S.fichaDeFilas(S.filasDeFicha(Object.assign(S.fichaVacia(2), { ra: [1, 3] })));
  assert.deepStrictEqual(sinTexto.ra, [], 'sin texto no hay números, por mucho que `ra` venga puesto');
});

prueba('core/sa: un RA por línea, y una coma no es una lista', () => {
  // El reconocimiento ancla en principio de línea a propósito: sin ese ancla,
  // cualquier cifra de la prosa ("en 3 sesiones") se tomaría por un resultado de
  // aprendizaje. El precio es que "RA1, RA3" en una sola línea cuenta como uno,
  // y es el precio correcto: el documento nunca los escribe así.
  assert.deepStrictEqual(S.raDeTexto(RA_DOS_LINEAS), [1, 3], 'dos líneas, dos RA');
  assert.deepStrictEqual(S.raDeTexto('RA1, RA3'), [1], 'una línea con coma, uno solo');
  assert.deepStrictEqual(S.raDeTexto('1. Reconoce…\n2. Utiliza…'), [1, 2], 'numerados sin prefijo');
  assert.deepStrictEqual(S.raDeTexto('Se hace en 3 sesiones'), [], 'una cifra suelta no es un RA');
  assert.deepStrictEqual(S.raDeTexto(null), [], 'ni se queja con nada');
});

prueba('core/sa: el ida y vuelta de una ficha conserva todos los campos', () => {
  const f = S.fichaVacia(1, '2ª');
  f.titulo = 'Montar un servidor web';
  f.sesiones = 12;
  f.raTexto = RA_DOS_LINEAS;
  f.ra = S.raDeTexto(f.raTexto);

  const vuelta = S.fichaDeFilas(S.filasDeFicha(f));
  for (const campo of S.CAMPOS) {
    assert.deepStrictEqual(vuelta[campo.id], f[campo.id], campo.id);
  }
  assert.strictEqual(vuelta.titulo, f.titulo);
  assert.strictEqual(vuelta.sesiones, f.sesiones);
  assert.deepStrictEqual(vuelta.ra, f.ra);
  assert.strictEqual(vuelta.evaluacion, '2ª', 'y la evaluación, que es la que se pierde sola');
});

// El informe de reconocimiento de la rejilla de una ficha. Lo que el lector no entiende de la
// tabla del Word no entra en ningún campo, y en cuanto la ficha suelta la tabla desaparece; estas
// pruebas fijan que eso se diga con el texto de la etiqueta y que el caso normal se diga también.

const celdaDe = (text, opts) => Object.assign({ text, colspan: 1, rowspan: 1, bold: false }, opts);

prueba('core/sa: al tirar la rejilla se rescata lo que solo estaba en ella', () => {
  // El caso real: una ficha importada hace tiempo, cuyo modelo lo escribio un lector que todavia
  // no conocia la redaccion «Materiales y recursos disponibles». El texto esta en la rejilla y el
  // campo, vacio. Al editar cualquier otra cosa de la ficha la rejilla se tira: si no se rescatara
  // aqui, ese texto desapareceria del PDF sin que nadie lo relacionara con lo que acaba de hacer.
  const filas = [
    [celdaDe('Situación de aprendizaje 1', { rowspan: 2, bold: true }), celdaDe('Cloud', { rowspan: 2, bold: true }), celdaDe('Sesiones', { bold: true }), celdaDe('6', { bold: true })],
    [celdaDe('Evaluación', { bold: true }), celdaDe('2ª', { bold: true })],
    [celdaDe('Materiales y recursos disponibles', { colspan: 4, bold: true })],
    [celdaDe('Aula TIC con conexión a Internet.', { colspan: 4 })],
  ];
  const guardada = Object.assign(S.fichaVacia(1, '2ª'), { titulo: 'Cloud', sesiones: 6, filas });
  assert.deepStrictEqual(guardada.recursos, [], 'de partida el campo esta vacio');

  const completa = S.completarDesdeFilas(guardada);
  assert.deepStrictEqual(completa.recursos, ['Aula TIC con conexión a Internet.'],
    'el texto se rescata de la rejilla al campo que le toca');

  // Y lo escrito manda: si el campo ya tiene algo, la rejilla no lo pisa, aunque sea mas corto.
  const tocada = S.completarDesdeFilas(Object.assign({}, guardada, { recursos: ['Nada.'] }));
  assert.deepStrictEqual(tocada.recursos, ['Nada.'], 'lo escrito no se sobrescribe');

  // Sin rejilla no hace nada, que es el caso de una ficha creada en la aplicacion.
  const sinRejilla = Object.assign({}, guardada); delete sinRejilla.filas;
  assert.deepStrictEqual(S.completarDesdeFilas(sinRejilla), sinRejilla);
});

prueba('core/sa: el informe nombra las filas de la rejilla que no van a ningún campo', () => {
  const filas = [
    [celdaDe('Situación de aprendizaje 1', { rowspan: 2, bold: true }), celdaDe('Cloud', { rowspan: 2, bold: true }), celdaDe('Sesiones', { bold: true }), celdaDe('6', { bold: true })],
    [celdaDe('Evaluación', { bold: true }), celdaDe('2ª', { bold: true })],
    [celdaDe('Criterios de evaluación', { colspan: 4, bold: true })],
    [celdaDe('RA1.a. Se ha reconocido la estructura.', { colspan: 4 })],
    [celdaDe('Actividades de consolidación', { colspan: 4, bold: true })],
    [celdaDe('− Repaso de lo aprendido en clase, con ejercicios resueltos y comentados.', { colspan: 4 })],
  ];
  const inf = S.informeDeFilas(filas);
  assert.strictEqual(inf.perdidas, 2, 'la etiqueta que no se reconoce y su contenido');
  assert.deepStrictEqual(inf.sueltas.map((x) => x.fila), [5, 6]);
  assert.ok(inf.aviso.indexOf('la fila 5 («Actividades de consolidación»)') >= 0,
    'el aviso dice la etiqueta, que es con lo que se arregla la redacción: ' + inf.aviso);
  assert.ok(inf.aviso.indexOf('la fila 6 («') >= 0, inf.aviso);
  assert.ok(inf.caracteres > 60, 'y cuenta el texto que se va a perder');
  assert.strictEqual(inf.frase, 'Se reconocen 4 de las 6 filas de la tabla que vino del Word.');
});

prueba('core/sa: una fila huérfana se sitúa por su número cuando el Word la dejó sin etiqueta', () => {
  // Pasa en los documentos reales: una ficha con un segundo bloque de recuperación cuya fila de
  // etiquetas está en blanco. Sin etiqueta que nombrar, lo que ubica el hueco es la fila.
  const filas = [
    [celdaDe('Situación de aprendizaje 2', { rowspan: 2, bold: true }), celdaDe('ODS', { rowspan: 2, bold: true }), celdaDe('Sesiones', { bold: true }), celdaDe('5', { bold: true })],
    [celdaDe('Evaluación', { bold: true }), celdaDe('1ª', { bold: true })],
    [celdaDe('Actividades de recuperación', { colspan: 4, bold: true })],
    [celdaDe('− Prueba práctica de los contenidos mínimos.', { colspan: 4 })],
    [celdaDe('', { colspan: 4, bold: true })],
    [celdaDe('− Prueba escrita de recuperación sobre el comercio justo, con los ejercicios corregidos.', { colspan: 4 })],
  ];
  const inf = S.informeDeFilas(filas);
  assert.strictEqual(inf.perdidas, 1, 'la fila en blanco no pierde nada: la que se pierde es la suya');
  assert.deepStrictEqual(inf.sueltas.map((x) => x.fila), [6]);
  // El texto se cita TAL CUAL está en la celda, con su viñeta: es con lo que se localiza la
  // fila en la tabla, no el valor que habría tomado el campo.
  assert.ok(inf.aviso.indexOf('la fila 6 («− Prueba escrita de recuperación sobre el comercio justo, c…»)') >= 0, inf.aviso);
  assert.ok(inf.aviso.indexOf('se perderá en') >= 0, 'una sola fila, en singular');
});

prueba('core/sa: cuando no se pierde nada el informe lo dice también', () => {
  const inf = S.informeDeFilas(S.filasDeFicha(Object.assign(S.fichaVacia(1, '1ª'), {
    titulo: 'Consultas SQL', raTexto: 'RA2. Crea bases de datos.', ce: ['RA2.a. Se ha analizado el formato.'],
  })));
  assert.strictEqual(inf.perdidas, 0);
  assert.strictEqual(inf.aviso, null, 'sin pérdida no hay aviso que gritar');
  assert.ok(inf.frase.indexOf('no pierde nada') >= 0, inf.frase);
  // La cabecera de las actividades no la lee ningún campo y se vuelve a imprimir igual: no es
  // una fila perdida, y contarla haría que toda ficha pareciera estar perdiendo algo.
  assert.ok(inf.frase.indexOf('Se reconocen ' + inf.filas + ' filas') >= 0, inf.frase);
});

// ---------------------------------------------- core/sa: la estructura como parámetro

// Una estructura a medida: «ce» renombrado, «mapa» y «extra» añadidos, «recursos» movido arriba
// del todo, y «ampliacion» retirado.
const A_MEDIDA = [
  { id: 'recursos', etiqueta: 'Recursos del aula', ancho: 4 },
  { id: 'ce', etiqueta: 'Evidencias de logro', ancho: 4 },
  { id: 'mapa', etiqueta: 'Mapa conceptual', ancho: 2 },
  { id: 'extra', etiqueta: 'Observaciones', ancho: 2 },
  { id: 'ampliacion', etiqueta: 'Actividades de ampliación', ancho: 4, retirado: true },
];

prueba('core/sa: con la estructura por omisión nada cambia y CAMPOS sigue siendo la misma lista', () => {
  assert.strictEqual(S.CAMPOS, S.CAMPOS_POR_OMISION);
  assert.strictEqual(S.CAMPOS.length, 12, 'los campos de hoy');
  const f = Object.assign(S.fichaVacia(1), { ce: ['a'], recursos: ['b'] });
  assert.deepStrictEqual(S.filasDeFicha(f), S.filasDeFicha(f, S.CAMPOS_POR_OMISION));
  assert.deepStrictEqual(S.fichaDeFilas(S.filasDeFicha(f)), S.fichaDeFilas(S.filasDeFicha(f), undefined, S.CAMPOS_POR_OMISION));
});

prueba('core/sa: estructura a medida, ida y vuelta sin perder nada', () => {
  const f = Object.assign(S.fichaVacia(2, '1ª', A_MEDIDA), {
    recursos: ['Pizarra', 'Proyector'], ce: ['RA1.a. Algo'], mapa: ['Nodo uno'], extra: ['Ojo'],
  });
  assert.ok(!('ampliacion' in f), 'el retirado no existe en la ficha vacía');
  const filas = S.filasDeFicha(f, A_MEDIDA);
  const texto = JSON.stringify(filas);
  ['Recursos del aula', 'Evidencias de logro', 'Mapa conceptual', 'Observaciones'].forEach((e) => assert.ok(texto.includes(e), e));
  assert.ok(!texto.includes('Criterios de evaluación'), 'la etiqueta renombrada sustituye a la vieja');
  const etiquetas = filas.filter((r) => r.some((c) => c.campo)).map((r) => r.map((c) => c.campo));
  assert.deepStrictEqual(etiquetas, [['recursos'], ['ce'], ['mapa', 'extra']], 'campos movidos y apilados por ancho');
  const vuelta = S.fichaDeFilas(filas, undefined, A_MEDIDA);
  ['recursos', 'ce', 'mapa', 'extra'].forEach((id) => assert.deepStrictEqual(vuelta[id], f[id], id));
  assert.deepStrictEqual(S.filasDeFicha(vuelta, A_MEDIDA), filas, 'y rehecha da la misma tabla');
  assert.strictEqual(S.filasSinCampo(filas, A_MEDIDA).length, 0);
});

prueba('core/sa: un campo retirado ni se imprime ni se lee', () => {
  const f = Object.assign(S.fichaVacia(1, '', A_MEDIDA), { ampliacion: ['No debe salir'] });
  assert.ok(!JSON.stringify(S.filasDeFicha(f, A_MEDIDA)).includes('ampliación'));
  const filas = [[{ text: 'Situación de aprendizaje 1' }, { text: 'T' }], [{ text: 'Actividades de ampliación' }], [{ text: 'Algo' }]];
  assert.ok(!('ampliacion' in S.fichaDeFilas(filas, undefined, A_MEDIDA)));
  assert.strictEqual(S.filasSinCampo(filas, A_MEDIDA).length, 2, 'esas filas se cuentan como sin campo');
  assert.strictEqual(S.esSemantica({ ampliacion: ['x'] }, A_MEDIDA), false);
});

prueba('core/sa: el rótulo de un grupo se imprime, se llame como se llame', () => {
  // `anadir_campo_ficha` acepta cualquier texto como grupo, así que comparar con «actividades»
  // dejaba sin rótulo a cualquier otro: las filas se agrupaban y el nombre del grupo no salía
  // impreso en ninguna parte. Un grupo que no se ve es peor que no tenerlo.
  const propio = [
    { id: 'ce', etiqueta: 'Criterios de evaluación', ancho: 4 },
    { id: 'uno', etiqueta: 'Uno', ancho: 2, grupo: 'Mis actividades' },
    { id: 'dos', etiqueta: 'Dos', ancho: 2, grupo: 'Mis actividades' },
  ];
  const f = Object.assign(S.fichaVacia(1, null, propio), { ce: ['x'], uno: ['a'], dos: ['b'] });
  // El rótulo de un grupo es la única celda a todo lo ancho, en negrita, que NO es la etiqueta de
  // ninguna parte: no lleva `campo`. Una parte de ancho 4 también ocupa la fila entera.
  const rotulos = (filas) => filas
    .filter((r) => r.length === 1 && r[0].colspan === S.COLUMNAS && r[0].bold && !r[0].campo)
    .map((r) => r[0].text);
  assert.deepStrictEqual(rotulos(S.filasDeFicha(f, propio)), ['Mis actividades']);

  // El id NO es el nombre: el grupo de la ficha de siempre se llama «actividades» y su rótulo es otro.
  const deSiempre = propio.map((c) => (c.grupo ? { ...c, grupo: 'actividades' } : c));
  const g = Object.assign(S.fichaVacia(1, null, deSiempre), { ce: ['x'], uno: ['a'], dos: ['b'] });
  assert.deepStrictEqual(rotulos(S.filasDeFicha(g, deSiempre)), [S.CABECERA_ACTIVIDADES]);

  // Un grupo que reaparece después de otro se vuelve a rotular: si no, parecería la continuación.
  const vuelve = [
    { id: 'uno', etiqueta: 'Uno', ancho: 4, grupo: 'A' },
    { id: 'dos', etiqueta: 'Dos', ancho: 4, grupo: 'B' },
    { id: 'tres', etiqueta: 'Tres', ancho: 4, grupo: 'A' },
  ];
  const v = Object.assign(S.fichaVacia(1, null, vuelve), { uno: ['1'], dos: ['2'], tres: ['3'] });
  assert.deepStrictEqual(rotulos(S.filasDeFicha(v, vuelve)), ['A', 'B', 'A']);

  // Y la ficha de siempre no cambia: un solo rótulo, el de las actividades.
  assert.deepStrictEqual(rotulos(S.filasDeFicha(S.fichaVacia(1))), [S.CABECERA_ACTIVIDADES]);
});

prueba('core/sa: filasDeFicha marca `campo` en las etiquetas y en nada más', () => {
  const filas = S.filasDeFicha(S.fichaVacia(1));
  const conCampo = [];
  filas.forEach((fila) => fila.forEach((c) => { if ('campo' in c) conCampo.push(c); }));
  assert.deepStrictEqual(conCampo.map((c) => c.campo), S.CAMPOS.filter((c) => !c.solo_si_hay).map((c) => c.id));
  conCampo.forEach((c) => assert.strictEqual(c.bold, true, 'y son celdas de etiqueta'));
  assert.ok(filas.slice(0, 3).every((fila) => fila.every((c) => !('campo' in c))), 'la cabecera, no');
  assert.ok(filas.every((fila) => fila.every((c) => !('campo' in c) || c.bold)), 'las de contenido, tampoco');
});

prueba('core/sa: el mapa de etiquetas se memoriza por lista', () => {
  assert.strictEqual(S.porEtiqueta(A_MEDIDA), S.porEtiqueta(A_MEDIDA));
  assert.strictEqual(S.porEtiqueta(), S.porEtiqueta(S.CAMPOS_POR_OMISION));
  assert.notStrictEqual(S.porEtiqueta(A_MEDIDA), S.porEtiqueta());
  assert.ok(S.porEtiqueta(A_MEDIDA).has('evidencias de logro'));
  assert.ok(!S.porEtiqueta(A_MEDIDA).has('criterios de evaluacion'));
});

prueba('core/estructurados: la validación acepta los ids de la estructura a medida y sigue rechazando basura', () => {
  const Est = require('../core/estructurados');
  const f = Object.assign(S.fichaVacia(1, '1ª', A_MEDIDA), { mapa: ['x'] });
  assert.strictEqual(Est.motivoFicha(f, undefined, A_MEDIDA), null);
  assert.ok(Est.motivoFicha(f), 'con la de omisión «mapa» sobra');
  assert.ok(Est.motivoFicha(Object.assign({}, f, { basura: 1 }), undefined, A_MEDIDA));
  assert.strictEqual(Est.motivoFichas([f], {}, A_MEDIDA), null);
  const conCampo = { ...S.fichaVacia(1), filas: S.filasDeFicha(S.fichaVacia(1)) };
  assert.strictEqual(Est.motivoFicha(conCampo), null, 'la clave `campo` de la celda pasa');
  const mala = { ...conCampo, filas: [[{ text: 'a', campo: '' }]] };
  assert.ok(Est.motivoFicha(mala), 'pero vacía no');
});

// --------------------------------------------------------------- validaciones
// La tabla de verdad de las comprobaciones del documento (core/validaciones.js). El convenio de los
// criterios se pasa siempre explícito: el motor imprime con 'peso_del_ra' y la interfaz usa
// 'peso_del_ra_o_cien'. Lo que cambia entre los dos está en estas pruebas, no escondido.

const V = require('../core/validaciones');
const { CONVENIOS_CE: CE } = V;

prueba('validaciones: la suma de los RA tiene que dar 100 %, y el aviso lleva el texto del motor', () => {
  assert.deepStrictEqual(V.avisosSumaRa([30, 30, 30]).map((a) => a.titulo),
    ['La suma de las ponderaciones de los RA es 90 % y debería ser 100 %.']);
  assert.strictEqual(V.avisosSumaRa([30, 30, 30])[0].severidad, 'error');
  assert.deepStrictEqual(V.avisosSumaRa([50, 50]), [], 'cien justos no dan aviso');
  assert.deepStrictEqual(V.avisosSumaRa([16.67, 16.67, 16.67, 16.67, 16.67, 16.65]), [],
    'redondeos de la tabla real (16,67 × 5 + 16,65) cuadran');
});

prueba('validaciones: los criterios de un RA reparten su peso, con los dos convenios', () => {
  // Suman 14, pondera 15: no cuadra con ninguno de los dos convenios.
  const descuadre = { ra: 2, peso: 15, pesosCe: [5, 5, 4] };
  for (const convenio of [CE.PESO_DEL_RA, CE.PESO_DEL_RA_O_CIEN]) {
    const avisos = V.avisosCriteriosDeRa(descuadre, convenio);
    assert.strictEqual(avisos.length, 1, convenio);
    assert.strictEqual(avisos[0].severidad, 'error', convenio);
    assert.strictEqual(avisos[0].titulo, 'RA2: los criterios suman 14 % y el RA pondera 15 %.', convenio);
  }

  // Suman 100 dentro de un RA que pondera 30: el convenio decide.
  const repartidos = { ra: 3, peso: 30, pesosCe: [50, 50] };
  assert.strictEqual(V.avisosCriteriosDeRa(repartidos, CE.PESO_DEL_RA).length, 1, 'estricto: error');
  assert.deepStrictEqual(V.avisosCriteriosDeRa(repartidos, CE.PESO_DEL_RA_O_CIEN), [], 'laxo: vale');

  // Un criterio que suma su peso cuadra con los dos.
  assert.deepStrictEqual(V.avisosCriteriosDeRa({ ra: 1, peso: 15, pesosCe: [5, 5, 5] }, CE.PESO_DEL_RA), []);
});

prueba('validaciones: el convenio es obligatorio y se nombra en la firma', () => {
  assert.throws(() => V.cuadraCriterios(15, [15], undefined), /convenioCe desconocido/);
  assert.throws(() => V.cuadraCriterios(15, [15], 'lo_que_sea'), /convenioCe desconocido/);
});

prueba('validaciones: un RA sin situación de aprendizaje da el aviso, no un error', () => {
  const avisos = V.avisosRaSinSituacion([3]);
  assert.strictEqual(avisos.length, 1);
  assert.strictEqual(avisos[0].severidad, 'aviso');
  assert.strictEqual(avisos[0].titulo, 'RA3 no aparece en ninguna situación de aprendizaje');
  assert.deepStrictEqual(V.avisosRaSinSituacion([]), []);
});

prueba('validaciones: las comprobaciones de criterio del centro dan su severidad de siempre', () => {
  assert.deepStrictEqual(V.apartadoVacio({ bloques: [], origen: 'vacio' }, 'X').map((a) => a.severidad), ['aviso']);
  assert.deepStrictEqual(V.apartadoVacio({ bloques: [{}], origen: 'importado' }, 'X'), [], 'con contenido no es vacío');
  assert.deepStrictEqual(V.heredadoSinRevisar({ origen: 'heredado' }).map((a) => a.severidad), ['aviso']);
  assert.deepStrictEqual(V.heredadoSinRevisar({ origen: 'revisado' }), []);
  assert.deepStrictEqual(V.copiasDesactualizadas([{ id: 'c1', versionOrigen: 2, version: 3 }]).map((a) => a.titulo),
    ['Copia propia desactualizada (v2 frente a v3)']);
  assert.deepStrictEqual(V.copiasDesactualizadas([{ id: 'c1', versionOrigen: 3, version: 3 }]), []);
  assert.deepStrictEqual(V.sinDocente('DAW 0613', 0).map((a) => a.severidad), ['error']);
  assert.deepStrictEqual(V.sinDocente('DAW 0613', 2), []);
});

prueba('validaciones: con un error abierto el documento no se aprueba; con avisos, sí', () => {
  const error = V.sinDocente('DAW 0613', 0);
  const aviso = V.avisosRaSinSituacion([3]);
  const todo = [...error, ...aviso];
  assert.strictEqual(V.puedeAprobarse(todo), false);
  assert.strictEqual(V.puedeAprobarse(aviso), true, 'solo avisos: se aprueba');
  assert.strictEqual(V.puedeAprobarse([]), true, 'sin nada: se aprueba');
  assert.deepStrictEqual(V.cuenta(todo), { error: 1, aviso: 1, info: 0 });
});

// ---------------------------------------------------------- conciliar
// Las instancias del importador contra el catálogo de core/unidades.js. Los títulos son los
// reales de la cabecera del catálogo: si alguno cambia, esto es lo que se rompe primero.

const concilia = (titulos, curso, ciclo, catalogo) => C.conciliar(
  titulos.map((titulo) => ({ titulo })),
  Object.assign({ curso, ciclo }, catalogo ? { catalogo } : {}));

prueba('conciliar: los tres módulos renombrados concilian con la misma unidad en 2025-26 y en 2026-27', () => {
  const casos = [
    ['Desarrollo web en entornos cliente', 'Desarrollo web en entorno cliente', 'daw', 'daw-0612'],
    ['Sostenibilidad aplicada a los sectores productivos', 'Sostenibilidad aplicada al sistema productivo', 'daw', 'daw-sost'],
    ['Sostenibilidad aplicada a los sectores productivos', 'Sostenibilidad aplicada al sistema productivo', 'smr', 'smr-sost'],
  ];
  for (const [viejo, nuevo, ciclo, id] of casos) {
    const a = concilia([viejo], '2025-26', ciclo).unidades[0];
    const b = concilia([nuevo], '2026-27', ciclo).unidades[0];
    assert.strictEqual(a.unidadId, id, `2025-26: ${viejo}`);
    assert.strictEqual(b.unidadId, id, `2026-27: ${nuevo}`);
    assert.strictEqual(a.como, C.COMO.tituloDelCurso);
    assert.strictEqual(b.como, C.COMO.tituloDelCurso);
  }
});

prueba('conciliar: un título de otro curso concilia, y el como lo dice', () => {
  // Un documento de 2026-27 que trae todavía el título de 2025-26.
  const r = concilia(['Desarrollo web en entornos cliente'], '2026-27', 'daw').unidades[0];
  assert.strictEqual(r.unidadId, 'daw-0612');
  assert.strictEqual(r.como, C.COMO.tituloDeOtroCurso);
  assert.strictEqual(r.confianza, 'alta');
});

prueba('conciliar: la sostenibilidad sin ciclo es ambigua y sale sin resolver; con ciclo, no', () => {
  const sin = C.conciliar([{ titulo: 'Sostenibilidad aplicada al sistema productivo' }], { curso: '2026-27' });
  assert.strictEqual(sin.unidades[0].unidadId, null, 'no se elige entre DAW y SMR');
  assert.strictEqual(sin.sinResolver.length, 1);
  assert.match(sin.sinResolver[0].motivo, /ciclo/);
  assert.strictEqual(concilia(['Sostenibilidad aplicada al sistema productivo'], '2026-27', 'smr').unidades[0].unidadId, 'smr-sost');
});

prueba('conciliar: un título que no se parece a nada sale en sinResolver', () => {
  const r = concilia(['Taller de cerámica de los jueves'], '2026-27', 'daw');
  assert.deepStrictEqual(r.unidades, [{ titulo: 'Taller de cerámica de los jueves', unidadId: null, como: 'sin_resolver', confianza: null }]);
  assert.strictEqual(r.sinResolver.length, 1);
  assert.strictEqual(r.sinResolver[0].indice, 0);
  assert.strictEqual(r.sinResolver[0].titulo, 'Taller de cerámica de los jueves');
  assert.ok(r.sinResolver[0].motivo.length > 0, 'dice por qué');
});

prueba('conciliar: dos instancias que apuntarían a la misma unidad, la segunda sale sin resolver', () => {
  // Las dos son el mismo módulo escrito con dos títulos de curso distintos.
  const r = concilia(['Desarrollo web en entorno cliente', 'Desarrollo web en entornos cliente'], '2026-27', 'daw');
  assert.deepStrictEqual(r.unidades.map((u) => u.unidadId), ['daw-0612', null]);
  assert.strictEqual(r.unidades[0].como, C.COMO.tituloDelCurso);
  assert.deepStrictEqual(r.sinResolver.map((s) => s.indice), [1]);
  assert.match(r.sinResolver[0].motivo, /daw-0612/);
});

prueba('conciliar: el orden de salida es el de entrada, también con huecos', () => {
  const entrada = ['Diseño de interfaces web', 'Taller de cerámica', 'Base de datos', 'Entornos de desarrollo'];
  const r = concilia(entrada, '2026-27', 'daw');
  assert.strictEqual(r.unidades.length, entrada.length);
  assert.deepStrictEqual(r.unidades.map((u) => u.titulo), entrada);
  assert.deepStrictEqual(r.unidades.map((u) => u.unidadId), ['daw-0615', null, 'daw-0484', 'daw-0487']);
  assert.deepStrictEqual(r.sinResolver.map((s) => s.indice), [1]);
});

prueba('conciliar: tildes, mayúsculas y puntuación distintas concilian por normalización, y el como lo dice', () => {
  const r = concilia(['  DISEÑO   de interfaces web.  '], '2026-27', 'daw').unidades[0];
  assert.strictEqual(r.unidadId, 'daw-0615');
  assert.strictEqual(r.como, C.COMO.tituloNormalizado);
  assert.strictEqual(r.confianza, 'media');
});

prueba('conciliar: el código aparece en el título como número completo', () => {
  const r = concilia(['Sistemas Informáticos (0483)'], '2026-27', 'daw').unidades[0];
  assert.strictEqual(r.unidadId, 'daw-0483');
  assert.strictEqual(r.como, C.COMO.codigoEnTitulo);
  assert.strictEqual(r.confianza, 'baja');
  // «10483» no es «0483» aunque lo contenga.
  assert.strictEqual(concilia(['Sistemas Informáticos 10483'], '2026-27', 'daw').unidades[0].unidadId, null);
});

prueba('conciliar: una unidad con codigo null no casa por código con nada', () => {
  // Con `String(null)` el texto «null» casaría; no debe.
  const catalogo = [{ id: 'x-null', codigo: null, ambito: 'eso', titulo: 'Taller de robótica' }];
  const r = concilia(['Módulo null 2'], '2026-27', undefined, catalogo);
  assert.strictEqual(r.unidades[0].unidadId, null);
  assert.strictEqual(r.sinResolver.length, 1);
});

prueba('conciliar: un acierto exacto no pierde la unidad frente a un código citado de pasada, vaya antes o después', () => {
  const anexo = 'Anexo con el modulo 0485 citado de pasada';
  const r = concilia([anexo, 'Programación'], '2026-27', 'daw');
  assert.strictEqual(r.unidades[1].unidadId, 'daw-0485', 'Programación se queda con su unidad');
  assert.strictEqual(r.unidades[1].como, C.COMO.tituloDelCurso);
  assert.strictEqual(r.unidades[0].unidadId, null, 'el anexo no se lleva la unidad');
  assert.strictEqual(r.sinResolver[0].indice, 0);
  assert.match(r.sinResolver[0].motivo, /Programación/, 'el motivo dice quién se la ha quedado');
  assert.match(r.sinResolver[0].motivo, /título de ese curso/);
});

prueba('conciliar: con el orden invertido, el resultado es el mismo (ya no decide el orden de llegada)', () => {
  const anexo = 'Anexo con el modulo 0485 citado de pasada';
  const a = concilia([anexo, 'Programación'], '2026-27', 'daw');
  const b = concilia(['Programación', anexo], '2026-27', 'daw');
  const porTitulo = (r) => Object.fromEntries(r.unidades.map((u) => [u.titulo, [u.unidadId, u.como]]));
  assert.deepStrictEqual(porTitulo(b), porTitulo(a));
  assert.deepStrictEqual(b.sinResolver.map((s) => s.titulo), [anexo]);
});

prueba('conciliar: dentro de una misma pasada, empate: gana el primero del documento', () => {
  const r = concilia(['Módulo 0612 primera mención', 'Módulo 0612 segunda mención'], '2026-27', 'daw');
  assert.deepStrictEqual(r.unidades.map((u) => u.unidadId), ['daw-0612', null]);
  assert.deepStrictEqual(r.sinResolver.map((s) => s.indice), [1]);
  assert.match(r.sinResolver[0].motivo, /daw-0612/);
});

prueba('conciliar: los códigos de como son estables y el mapa de etiquetas los cubre todos', () => {
  const codigos = Object.values(C.COMO);
  assert.deepStrictEqual(codigos.slice().sort(), [
    'codigo_en_el_titulo', 'sin_resolver', 'titulo_de_otro_curso', 'titulo_del_curso', 'titulo_normalizado',
  ]);
  for (const c of codigos) {
    assert.match(c, /^[a-z_]+$/, `${c} sin tildes ni espacios`);
    assert.strictEqual(typeof C.ETIQUETAS_COMO[c], 'string', `falta la etiqueta de ${c}`);
    assert.ok(C.ETIQUETAS_COMO[c].length > 0);
  }
  assert.strictEqual(C.ETIQUETAS_COMO[C.COMO.tituloDeOtroCurso], 'título de otro curso');
  assert.strictEqual(Object.keys(C.ETIQUETAS_COMO).length, codigos.length, 'sin etiquetas de más');
});

prueba('conciliar: no modifica el catálogo y pide el curso', () => {
  const antes = JSON.stringify(CAT.UNIDADES);
  concilia(['Desarrollo web en entornos cliente', 'Algo'], '2025-26', 'daw');
  assert.strictEqual(JSON.stringify(CAT.UNIDADES), antes);
  assert.throws(() => C.conciliar([{ titulo: 'Base de datos' }], {}), /curso/);
});

// ------------------------------------------------- dada de baja y reparto

prueba('quien está de baja no ve ni edita nada, sea del rango que sea', () => {
  // Es la segunda cerradura: la primera es que alguien de baja no consigue sesión
  // y no llega ni a preguntar. Esta está aquí para que, si esa falla algún día,
  // el fallo no se convierta además en acceso.
  for (const rol of ROLES) {
    const baja = usuario(rol, { activo: false });
    assert.strictEqual(P.puedeVer(baja, { departamento: DEP }), false, rol + ' ve');
    assert.strictEqual(P.reglaEdicion(baja, { edita: 'jefe_departamento' }), false, rol + ' edita');
    assert.strictEqual(P.reglaCompartido(baja, { comun: true, editaApartadoComun: true, tieneApartadoAsignado: true }), false, rol + ' compartido');
    assert.strictEqual(P.puedeRepartirUnidades(baja, { departamento: DEP }), false, rol + ' reparte');
  }
});

prueba('ausente es activa: nadie se queda fuera por no tener el campo', () => {
  // Si la ausencia significara «de baja», añadir el campo habría dejado fuera a
  // todo el que ya estuviera guardado antes del E2.
  const sinCampo = usuario('docente');
  assert.strictEqual('activo' in sinCampo, false, 'la prueba no vale si el campo está');
  assert.strictEqual(P.estaActivo(sinCampo), true);
  assert.strictEqual(P.puedeVer(sinCampo, { departamento: DEP }), true);
  assert.strictEqual(P.estaActivo(usuario('docente', { activo: true })), true, 'y true también, claro');
});

prueba('reparte las unidades la jefatura del departamento, y el soporte', () => {
  const donde = { departamento: DEP };
  assert.strictEqual(P.puedeRepartirUnidades(usuario('jefe_departamento'), donde), true, 'jefatura de departamento');
  assert.strictEqual(P.puedeRepartirUnidades(usuario('admin'), donde), true, 'soporte');
  assert.strictEqual(P.puedeRepartirUnidades(usuario('docente'), donde), false, 'docente no');
  // La que ve todos los departamentos y no toca nada: es lo que la deja en
  // condiciones de aprobar el documento.
  assert.strictEqual(P.puedeRepartirUnidades(usuario('jefe_estudios'), donde), false, 'jefatura de estudios no');
  // Y nadie reparte en un departamento que no ve.
  assert.strictEqual(P.puedeRepartirUnidades(usuario('jefe_departamento'), { departamento: 'matematicas' }), false, 'ni en el de al lado');
  assert.strictEqual(P.puedeRepartirUnidades(null, donde), false, 'ni sin usuario');
});

prueba('asigna los apartados comunes quien reparte las unidades: jefatura del departamento y soporte', () => {
  const donde = { departamento: DEP };
  assert.strictEqual(P.puedeAsignarApartados(usuario('jefe_departamento'), donde), true);
  assert.strictEqual(P.puedeAsignarApartados(usuario('admin'), donde), true);
  assert.strictEqual(P.puedeAsignarApartados(usuario('docente'), donde), false);
  assert.strictEqual(P.puedeAsignarApartados(usuario('jefe_estudios'), donde), false);
  assert.strictEqual(P.puedeAsignarApartados(usuario('jefe_departamento'), { departamento: 'matematicas' }), false);
  assert.strictEqual(P.puedeAsignarApartados(null, donde), false);
});

// ----------------------------------------------------------------- el foco de una confirmación
//
// Las tres confirmaciones en dos pasos de la aplicación comparten la decisión de a quién le toca el
// foco (core/confirmar.js). El `focus()` no se puede probar sin navegador; la decisión sí, y es
// donde estaba el fallo: devolver el foco a un botón que el repintado acaba de quitar del árbol.

prueba('el foco de una confirmación: al abrir va al paso, al cancelar al botón, al terminar al aviso', () => {
  const todo = { abrir: true, paso: true, aviso: true };
  assert.strictEqual(Conf.foco('abrir', todo), 'paso', 'el botón que se pulsó ya no está en el árbol');
  assert.strictEqual(Conf.foco('cancelar', todo), 'abrir', 'de ahí salió, y vuelve a estar');
  assert.strictEqual(Conf.foco('terminar', todo), 'aviso', 'la fila puede haberse ido; el aviso no');
  // Los tres gestos están contemplados y ninguno se queda sin destino con la pantalla entera.
  for (const gesto of Conf.GESTOS) {
    assert.ok(Conf.DESTINOS.includes(Conf.foco(gesto, todo)), gesto);
  }
});

prueba('el foco no se manda a un elemento que ya no está en la pantalla', () => {
  // Terminar es el caso que rompía: se confirma, la fila desaparece y el botón de abrir con ella.
  assert.strictEqual(Conf.foco('terminar', { aviso: true }), 'aviso');
  assert.strictEqual(Conf.foco('terminar', { abrir: true }), 'abrir', 'sin aviso, al botón que queda');
  // Cancelar devuelve el foco al botón de abrir, pero si la lista se ha recargado por medio y ese
  // botón ya no está, al aviso antes que al paso, que también se acaba de ir.
  assert.strictEqual(Conf.foco('cancelar', { aviso: true, paso: true }), 'aviso');
  assert.strictEqual(Conf.foco('cancelar', { paso: true }), 'paso');
  // Abrir quiere el paso; sin paso, el aviso.
  assert.strictEqual(Conf.foco('abrir', { abrir: true, aviso: true }), 'aviso');
  // Y si no hay a dónde ir, no se toca el foco: dejarlo donde está es mejor que mandarlo a un
  // sitio cualquiera, que es como se acaba al principio de la página.
  for (const gesto of Conf.GESTOS) {
    assert.strictEqual(Conf.foco(gesto, {}), null, gesto + ' sin pantalla');
    assert.strictEqual(Conf.foco(gesto, null), null, gesto + ' sin nada');
  }
  // Un gesto que no existe no mueve nada.
  assert.strictEqual(Conf.foco('otro', { abrir: true, paso: true, aviso: true }), null);
  assert.strictEqual(Conf.foco(undefined, { abrir: true }), null);
});

// ----------------------------------------------------------------- estructura de la ficha

const FE = require('../core/ficha-estructura');

const CAMPOS_FE = [{ id: 'ce', etiqueta: 'Criterios' }, { id: 'recursos', etiqueta: 'Recursos' }];

prueba('el recuento cuenta las fichas con texto detras de cada campo, por id', () => {
  const lista = [
    { ce: ['a'], recursos: [], filas: [[{ text: 'x' }]] },
    { ce: [' '], recursos: ['libro'] },
    { ce: 'texto suelto' },
    {},
  ];
  const r = FE.recuento(lista, CAMPOS_FE);
  assert.strictEqual(r.total, 4);
  assert.strictEqual(r.conRejilla, 1);
  assert.strictEqual(r.sinRejilla, 3);
  assert.strictEqual(FE.conTextoEn(r, 'ce'), 2, 'un campo solo con espacios no cuenta');
  assert.strictEqual(r.porCampo.ce.conTextoYRejilla, 1);
  assert.strictEqual(FE.conTextoEn(r, 'recursos'), 1);
  assert.strictEqual(FE.conTextoEn(r, 'no_existe'), 0);
});

prueba('las fichas de una fila se sacan del campo de fichas y de los repetidores', () => {
  const v = { f: [{ ce: ['a'] }, { ce: [] }], items: [{ ficha: [{ ce: ['b'] }] }, { ficha: { ce: [] } }, { titulo: 'sin ficha' }], otro: [{ ce: ['no'] }] };
  assert.strictEqual(FE.fichasDeValores(v, ['f']).length, 4);
  assert.strictEqual(FE.fichasDeValores(null, ['f']).length, 0);
});

prueba('retirar dice en cuantas fichas deja de imprimirse el texto: con 0, con 1 y con varias', () => {
  const cambio = { tipo: 'campo_ficha_retirado', campoFicha: 'ce', etiqueta: 'Criterios' };
  const con = (n, total) => FE.recuento(Array.from({ length: total }, (_, i) => (i < n ? { ce: ['x'] } : {})), CAMPOS_FE);
  const cero = FE.informeDeCambio(cambio, con(0, 5));
  assert.strictEqual(cero.alerta, null);
  assert.ok(cero.estado.indexOf('No se ha borrado nada') >= 0);
  const uno = FE.informeDeCambio(cambio, con(1, 5));
  assert.ok(uno.alerta.indexOf('«Criterios» en 1 ficha de 5') >= 0, uno.alerta);
  const varias = FE.informeDeCambio(cambio, con(3, 5));
  assert.ok(varias.alerta.indexOf('«Criterios» en 3 fichas de 5') >= 0, varias.alerta);
  assert.ok(FE.avisoAntesDeRetirar(CAMPOS_FE[0], con(3, 5)).indexOf('3 fichas de 5') >= 0);
  assert.ok(FE.avisoAntesDeRetirar(CAMPOS_FE[0], con(0, 5)).indexOf('ninguna ficha') >= 0);
});

prueba('restaurar, renombrar, mover y anadir tambien informan', () => {
  const r = FE.recuento([{ ce: ['x'] }, { ce: ['y'] }], CAMPOS_FE);
  const rest = FE.informeDeCambio({ tipo: 'campo_ficha_restaurado', campoFicha: 'ce', etiqueta: 'Criterios' }, r);
  assert.ok(rest.alerta.indexOf('Vuelve a imprimirse el texto de «Criterios» en 2 fichas de 2') >= 0);
  const ren = FE.informeDeCambio({ tipo: 'campo_ficha_renombrado', campoFicha: 'ce', etiqueta: 'Nuevo', antes: 'Viejo' }, r);
  assert.ok(ren.estado.indexOf('«Viejo» renombrada a «Nuevo»') >= 0);
  assert.strictEqual(ren.alerta, null);
  const mov = FE.informeDeCambio({ tipo: 'campo_ficha_movido', campoFicha: 'ce', etiqueta: 'Criterios', posicion: 2, filas: 12 }, r);
  assert.ok(mov.estado.indexOf('2.ª de 12') >= 0);
  const ana = FE.informeDeCambio({ tipo: 'campo_ficha_anadido', campoFicha: 'x', etiqueta: 'Nueva', posicion: 3 }, r);
  assert.ok(ana.alerta.indexOf('en blanco en las 2 fichas') >= 0);
});

prueba('la frase de la tabla propia dice el numero de fichas que conservan la del Word', () => {
  const ficha = (rej) => (rej ? { filas: [[{ text: 'x' }]] } : {});
  const frase = (lista) => FE.fraseDeTablaPropia(FE.recuento(lista, CAMPOS_FE));
  assert.ok(frase([]).indexOf('Todavía no hay') === 0);
  assert.ok(frase([ficha(0), ficha(0)]).indexOf('Las 2 fichas siguen la estructura') === 0);
  assert.ok(frase([ficha(1), ficha(1), ficha(1)]).indexOf('Las 3 fichas conservan la tabla tal como vino del Word') === 0);
  const mixta = frase([ficha(1), ficha(0), ficha(0)]);
  assert.ok(mixta.indexOf('1 ficha de las 3 conserva') === 0 && mixta.indexOf('Las otras 2 siguen la estructura') > 0, mixta);
  assert.ok(!/rejilla|modelo/i.test(mixta), 'sin tecnicismos');
  // Cuando solo queda UNA sin tabla propia la frase va en singular: «Las otras 1» esta mal
  // escrito y lo lee la jefatura, no el programa.
  const una = frase([ficha(1), ficha(1), ficha(0)]);
  assert.ok(una.indexOf('La otra sigue la estructura') > 0, una);
  assert.ok(!/otras 1/.test(una), una);
});

prueba('el informe no escribe «undefined» cuando el cambio no dice el sitio', () => {
  const r = FE.recuento([{}], CAMPOS_FE);
  const mover = FE.informeDeCambio({ tipo: 'campo_ficha_movido', etiqueta: 'Refuerzo' }, r);
  const anadir = FE.informeDeCambio({ tipo: 'campo_ficha_anadido', etiqueta: 'Fila nueva' }, r);
  assert.ok(!/undefined|NaN/.test(mover.estado), mover.estado);
  assert.ok(!/undefined|NaN/.test(anadir.estado), anadir.estado);
  // Y cuando si lo dice, lo dice.
  const conSitio = FE.informeDeCambio({ tipo: 'campo_ficha_movido', etiqueta: 'Refuerzo', posicion: 7, filas: 12 }, r);
  assert.ok(conSitio.estado.indexOf('7.ª de 12') > 0, conSitio.estado);
});

prueba('el recuento dice de que modulo es: el ambito entra en todas las frases', () => {
  const donde = 'de este módulo';
  const ficha = (rej) => (rej ? { filas: [[{ text: 'x' }]], ce: ['a'] } : { ce: ['a'] });
  const todas = FE.recuento([ficha(1), ficha(1), ficha(1)], CAMPOS_FE);
  assert.strictEqual(FE.fraseDeTablaPropia(todas, donde).indexOf('Las 3 fichas de este módulo conservan la tabla tal como vino del Word'), 0);
  assert.ok(FE.fraseDeTablaPropia(FE.recuento([ficha(1)], CAMPOS_FE), donde).indexOf('La única ficha de este módulo conserva') === 0);
  assert.ok(FE.fraseDeTablaPropia(FE.recuento([], CAMPOS_FE), donde).indexOf('ninguna ficha escrita de este módulo') > 0);
  const ret = FE.informeDeCambio({ tipo: 'campo_ficha_retirado', campoFicha: 'ce', etiqueta: 'Criterios' }, todas, donde);
  assert.ok(ret.alerta.indexOf('«Criterios» en 3 de las 3 fichas de este módulo') >= 0, ret.alerta);
  const uno = FE.recuento([ficha(0)], CAMPOS_FE);
  assert.ok(FE.avisoAntesDeRetirar(CAMPOS_FE[0], uno, donde).indexOf('en la única ficha de este módulo') >= 0);
});

prueba('el bloque de la ficha solo se ofrece a quien puede cambiar la estructura y en un apartado con fichas', () => {
  const conFichas = [{ id: 'f', tipo: 'ficha_situacion_aprendizaje' }];
  assert.strictEqual(FE.seOfrece(true, conFichas), true);
  assert.strictEqual(FE.seOfrece(false, conFichas), false, 'un docente no lo ve');
  assert.strictEqual(FE.seOfrece(true, [{ id: 't', tipo: 'texto_largo' }]), false);
  assert.strictEqual(FE.seOfrece(true, undefined), false);
  assert.strictEqual(P.puedeCambiarEstructura({ rol: 'docente', departamento: 'x' }, { departamento: 'x' }), false);
});

prueba('cada gesto manda su operacion con el id de la fila, y nada mas', () => {
  assert.deepStrictEqual(FE.peticionDeGesto('renombrar', { campoFicha: 'ce', etiqueta: 'Nuevo' }),
    { tipo: 'renombrar_campo_ficha', campoFicha: 'ce', etiqueta: 'Nuevo' });
  assert.deepStrictEqual(FE.peticionDeGesto('subir', { campoFicha: 'ce' }), { tipo: 'mover_campo_ficha', campoFicha: 'ce', delta: -1 });
  assert.deepStrictEqual(FE.peticionDeGesto('bajar', { campoFicha: 'ce' }), { tipo: 'mover_campo_ficha', campoFicha: 'ce', delta: 1 });
  assert.deepStrictEqual(FE.peticionDeGesto('retirar', { campoFicha: 'ce' }), { tipo: 'retirar_campo_ficha', campoFicha: 'ce' });
  assert.deepStrictEqual(FE.peticionDeGesto('restaurar', { campoFicha: 'ce' }), { tipo: 'restaurar_campo_ficha', campoFicha: 'ce' });
  assert.deepStrictEqual(FE.peticionDeGesto('anadir', { etiqueta: 'Nueva', posicion: 3 }),
    { tipo: 'anadir_campo_ficha', etiqueta: 'Nueva', posicion: 3 });
  assert.deepStrictEqual(FE.peticionDeGesto('anadir', { etiqueta: 'Nueva' }), { tipo: 'anadir_campo_ficha', etiqueta: 'Nueva' }, 'sin posicion va al final');
  assert.strictEqual(FE.peticionDeGesto('borrar', { campoFicha: 'ce' }), null, 'no hay gesto de borrar');
});

prueba('el id de una celda sale de su clave campo y no de su texto', () => {
  const est = S.CAMPOS_POR_OMISION.map((c) => ({ ...c }));
  est[0].retirado = true;
  assert.strictEqual(FE.campoDeCelda({ text: 'Objetivos de aprendizaje', campo: 'objetivos' }, est), 'objetivos');
  assert.strictEqual(FE.campoDeCelda({ text: 'Objetivos de aprendizaje' }, est), null, 'sin campo no hay gesto, aunque el texto coincida');
  assert.strictEqual(FE.campoDeCelda({ text: 'x', campo: 'inventado' }, est), null);
  assert.strictEqual(FE.campoDeCelda({ text: 'x', campo: est[0].id }, est), null, 'una fila retirada no se ofrece');
  assert.strictEqual(FE.campoDeCelda(null, est), null);
});

prueba('el esqueleto de la pantalla trae todas las filas, tambien las que solo salen si alguien las escribe', () => {
  const est = S.CAMPOS_POR_OMISION.map((c) => ({ ...c }));
  const sin = S.filasDeFicha(S.fichaVacia(1), est);
  const con = S.filasDeFicha(S.fichaVacia(1), FE.camposDelEsqueleto(est));
  const ids = (filas) => filas.flatMap((f) => f.map((c) => c.campo)).filter(Boolean);
  assert.ok(!ids(sin).includes('intermodular'));
  assert.deepStrictEqual(ids(con).sort(), est.map((c) => c.id).sort());
  assert.ok(est.some((c) => c.solo_si_hay), 'la estructura original no se toca');
});

// ----------------------------------------------------------------- resumen

console.log(fallos ? `\n${fallos} prueba(s) con fallos` : '\nTodas las pruebas correctas');
process.exit(fallos ? 1 : 0);
