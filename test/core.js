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

// ----------------------------------------------------------------- resumen

console.log(fallos ? `\n${fallos} prueba(s) con fallos` : '\nTodas las pruebas correctas');
process.exit(fallos ? 1 : 0);
