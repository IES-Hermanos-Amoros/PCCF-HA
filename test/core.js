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

// ----------------------------------------------------------------- resumen

console.log(fallos ? `\n${fallos} prueba(s) con fallos` : '\nTodas las pruebas correctas');
process.exit(fallos ? 1 : 0);
