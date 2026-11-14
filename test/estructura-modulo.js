// LA ESTRUCTURA PROPIA DE UN MODULO Y LA REGLA QUE DECIDE QUE ESTRUCTURA SIGUE CADA UNO.
//
//   node test/estructura-modulo.js
//
// Son cuatro cosas y las cuatro se vigilan aqui (la cuarta, los apartados enteros, va antes de la tercera):
//
//   1. LA REGLA: un modulo sigue su propia estructura mientras la tenga, y la comun cuando no la
//      tenga. Con sus tres casos —sin estructura, con ella, y con una que no desvia nada, que es
//      como no tenerla— y los bordes: un apartado que el modulo no toca sigue la comun aunque el
//      modulo tenga estructura en otro, un campo comun nuevo llega a quien ya diverge, y lo que la
//      comun retira no lo resucita un modulo.
//
//   2. LA PUERTA, con cada motivo escrito para una persona: apartado inexistente, comun, retirado o
//      de fichas; ids que no siguen al nombre; dos campos que se llaman igual; retirar no borra; los
//      topes.
//
//   4. LOS APARTADOS ENTEROS: retirar, renombrar, mover y anadir uno en un modulo solo, con sus
//      hijos, y su puerta. Es la hermana de la regla de los campos (`apartadosDeModulo`).
//
//   3. QUIEN PUEDE CAMBIARLA (`reglaEstructuraPropia` de core/permisos.js), con los cuatro roles y
//      los dos tipos de apartado.

'use strict';

const assert = require('assert');

const EM = require('../core/estructura-modulo');
const P = require('../core/permisos');
const Plantilla = require('../core/plantilla');
const Campos = require('../core/campos');

let fallos = 0;
const pruebas = [];
const prueba = (nombre, fn) => pruebas.push({ nombre, fn });

// ---------------------------------------------------------------- ayudas

const OBJ = 'modulos/objetivos';
const EVA = 'modulos/evaluacion';

// Un documento de juguete con lo que importa: un apartado comun que edita la jefatura, el bloque de
// modulos con dos apartados de campos, uno de fichas, y uno retirado.
const plantilla = () => ({
  version: 1,
  secciones: [
    { id: 'identificacion', titulo: 'Identificacion', edita: 'jefe_departamento',
      campos: [{ id: 'centro', tipo: 'texto_largo', etiqueta: 'Centro' }] },
    { id: 'modulos', titulo: 'Modulos', instancias: true, edita: 'docentes_del_modulo', hijos: [
      { id: OBJ, titulo: 'Objetivos', campos: [
        { id: 'texto', tipo: 'texto_largo', etiqueta: 'Objetivos' },
        { id: 'resumen', tipo: 'texto_largo', etiqueta: 'Resumen' },
        { id: 'notas', tipo: 'texto_largo', etiqueta: 'Notas', retirado: true },
      ] },
      { id: EVA, titulo: 'Evaluacion', campos: [{ id: 'texto', tipo: 'texto_largo', etiqueta: 'Evaluacion' }] },
      { id: 'modulos/fichas', titulo: 'Fichas', repetidor: true, campos: [] },
      { id: 'modulos/antiguo', titulo: 'Antiguo', retirado: true, campos: [] },
    ] },
  ],
});

const seccion = (p, id) => Plantilla.buscar(p, id).seccion;
const ids = (lista) => lista.map((c) => c.id);
const unidadCon = (secciones) => ({ id: 'daw-0485', estructura: { secciones } });
const propio = (id, etiqueta, extra) => Object.assign({ id, tipo: 'texto_largo', etiqueta }, extra);

// El motivo de una estructura contra la plantilla.
const motivo = (secciones, p) => EM.motivoDeEstructura({ secciones }, p || plantilla());

const dice = (texto, ...trozos) => {
  assert.ok(texto, 'tenia que dar un motivo');
  for (const t of trozos) assert.ok(texto.includes(t), `el motivo no dice «${t}»: ${texto}`);
};

// ---------------------------------------------------------------- 1. la regla

prueba('un modulo sin estructura sigue la comun: las MISMAS referencias, sin copiar nada', () => {
  const p = plantilla();
  const sec = seccion(p, OBJ);
  for (const unidad of [{ id: 'x' }, null, undefined, { id: 'x', estructura: undefined }]) {
    const r = EM.camposDeSeccion(sec, unidad);
    assert.strictEqual(r.origen, 'comun');
    assert.strictEqual(r.campos, sec.campos, 'la misma lista, no una copia');
    assert.deepStrictEqual(ids(r.vigentes), ['texto', 'resumen'], 'el retirado no se pinta');
  }
  assert.strictEqual(EM.estructuraDeModulo({ id: 'x' }), null);
});

prueba('un apartado sin campos o sin nada que decir sigue dando la comun', () => {
  assert.deepStrictEqual(EM.camposDeSeccion({ id: 'a' }, null), { origen: 'comun', campos: [], vigentes: [] });
  assert.deepStrictEqual(EM.camposDeSeccion(null, null).vigentes, []);
});

prueba('con estructura propia manda la suya: anade, renombra, retira y reordena', () => {
  const sec = seccion(plantilla(), OBJ);
  const unidad = unidadCon({
    [OBJ]: {
      campos: { texto: { etiqueta: 'Objetivos del modulo' }, resumen: { retirado: true } },
      anadidos: [propio('m_proyecto', 'Proyecto')],
      orden: ['m_proyecto', 'texto'],
    },
  });
  const r = EM.camposDeSeccion(sec, unidad);
  assert.strictEqual(r.origen, 'propia');
  assert.deepStrictEqual(ids(r.campos), ['m_proyecto', 'texto', 'resumen', 'notas'], 'lo que orden no nombra va detras, en su orden');
  assert.deepStrictEqual(ids(r.vigentes), ['m_proyecto', 'texto']);
  assert.strictEqual(r.vigentes[1].etiqueta, 'Objetivos del modulo');
  assert.strictEqual(r.vigentes[0].propio, true, 'el campo del modulo se marca como suyo');
  assert.strictEqual(r.campos.find((c) => c.id === 'resumen').retirado, true, 'retirar no borra: sigue en la lista');
  assert.strictEqual(sec.campos[0].etiqueta, 'Objetivos', 'la plantilla comun no se toca');
  assert.ok(!sec.campos[1].retirado, 'ni se retira para los demas');
});

prueba('la estructura de un modulo no cambia lo que ven los otros diez', () => {
  const sec = seccion(plantilla(), OBJ);
  const unidad = unidadCon({ [OBJ]: { anadidos: [propio('m_x', 'X')] } });
  assert.strictEqual(EM.camposDeSeccion(sec, unidad).origen, 'propia');
  const otra = EM.camposDeSeccion(sec, { id: 'daw-0484' });
  assert.strictEqual(otra.origen, 'comun');
  assert.deepStrictEqual(ids(otra.vigentes), ['texto', 'resumen']);
});

prueba('se pregunta apartado a apartado: el que el modulo no toca sigue la comun', () => {
  const p = plantilla();
  const unidad = unidadCon({ [OBJ]: { anadidos: [propio('m_x', 'X')] } });
  assert.strictEqual(EM.camposDeSeccion(seccion(p, OBJ), unidad).origen, 'propia');
  const eva = EM.camposDeSeccion(seccion(p, EVA), unidad);
  assert.strictEqual(eva.origen, 'comun');
  assert.strictEqual(eva.campos, seccion(p, EVA).campos);
});

prueba('tener estructura es tener algun desvio: lo vacio cae a la comun', () => {
  const sec = seccion(plantilla(), OBJ);
  const vacias = [
    { estructura: {} },
    { estructura: { secciones: {} } },
    { estructura: { secciones: { [OBJ]: {} } } },
    { estructura: { secciones: { [OBJ]: { campos: {}, anadidos: [], orden: [] } } } },
    { estructura: { secciones: { [OBJ]: null } } },
    { estructura: 'texto' },
    { estructura: [] },
  ];
  for (const unidad of vacias) {
    const r = EM.camposDeSeccion(sec, unidad);
    assert.strictEqual(r.origen, 'comun', JSON.stringify(unidad));
    assert.strictEqual(r.campos, sec.campos);
    assert.strictEqual(EM.estructuraDeModulo(unidad), null, JSON.stringify(unidad));
  }
  const parcial = { estructura: { secciones: { [OBJ]: { orden: ['texto'] }, [EVA]: {} } } };
  assert.deepStrictEqual(Object.keys(EM.estructuraDeModulo(parcial).secciones), [OBJ], 'solo los apartados que desvia');
});

prueba('un campo que la comun anade mas tarde le llega al modulo que ya diverge, al final', () => {
  const p = plantilla();
  const unidad = unidadCon({ [OBJ]: { anadidos: [propio('m_x', 'X')], orden: ['m_x'] } });
  seccion(p, OBJ).campos.push({ id: 'nuevo', tipo: 'texto_largo', etiqueta: 'Nuevo' });
  assert.deepStrictEqual(ids(EM.camposDeSeccion(seccion(p, OBJ), unidad).vigentes), ['m_x', 'texto', 'resumen', 'nuevo']);
});

prueba('lo que la comun retira no lo resucita un modulo', () => {
  const p = plantilla();
  seccion(p, OBJ).campos[1].retirado = true;
  const unidad = unidadCon({ [OBJ]: { campos: { resumen: { etiqueta: 'Otro' } }, orden: ['resumen'] } });
  const r = EM.camposDeSeccion(seccion(p, OBJ), unidad);
  assert.ok(!ids(r.vigentes).includes('resumen'));
});

prueba('un campo retirado del modulo conserva su sitio y se puede volver a ver', () => {
  const sec = seccion(plantilla(), OBJ);
  const con = (retirado) => unidadCon({ [OBJ]: { anadidos: [propio('m_x', 'X', { retirado })] } });
  assert.ok(EM.camposDeSeccion(sec, con(true)).campos.some((c) => c.id === 'm_x'));
  assert.ok(!EM.camposDeSeccion(sec, con(true)).vigentes.some((c) => c.id === 'm_x'));
  assert.ok(EM.camposDeSeccion(sec, con(false)).vigentes.some((c) => c.id === 'm_x'));
});

prueba('lo que apunta a un campo que ya no existe se ignora al leer, sin romper nada', () => {
  const sec = seccion(plantilla(), OBJ);
  const unidad = unidadCon({
    [OBJ]: { campos: { borrado: { retirado: true } }, orden: ['borrado', 'resumen'], anadidos: [null, { sin: 'id' }, propio('texto', 'Choca')] },
  });
  const r = EM.camposDeSeccion(sec, unidad);
  assert.deepStrictEqual(ids(r.vigentes), ['resumen', 'texto'], 'un anadido que choca con un id comun no se pinta');
  assert.strictEqual(r.vigentes[1].etiqueta, 'Objetivos');
});

prueba('un desvio no puede llamarse con la clave de otro objeto', () => {
  const sec = { id: 'toString', campos: [{ id: 'a', tipo: 'texto_largo', etiqueta: 'A' }] };
  assert.strictEqual(EM.camposDeSeccion(sec, { estructura: { secciones: {} } }).origen, 'comun');
  assert.strictEqual(EM.desvioDe({ estructura: { secciones: {} } }, 'constructor'), null);
});

prueba('el id de un campo del modulo lleva el prefijo, no sigue al nombre y no se reutiliza', () => {
  assert.strictEqual(EM.idDeCampoPropio('Proyecto final', 'texto_largo', []), 'm_proyecto-final');
  assert.strictEqual(EM.idDeCampoPropio('Proyecto final', 'texto_largo', ['m_proyecto-final']), 'm_proyecto-final-2');
  assert.strictEqual(EM.idDeCampoPropio('Proyecto final', 'texto_largo', ['m_proyecto-final', 'm_proyecto-final-2']), 'm_proyecto-final-3');
  assert.strictEqual(EM.idDeCampoPropio('', 'tabla', []), 'm_tabla');
  const nuevo = EM.idDeCampoPropio('Proyecto', 'texto_largo', []);
  const renombrado = EM.camposDeSeccion(seccion(plantilla(), OBJ), unidadCon({
    [OBJ]: { anadidos: [propio(nuevo, 'Proyecto')], campos: {} , orden: [nuevo] },
  }));
  assert.strictEqual(renombrado.campos[0].id, nuevo);
  // Los ids de la plantilla nunca llevan guion bajo: no pueden chocar con los del modulo.
  assert.ok(!/_/.test(Campos.idDeCampo('Un guion_bajo', 'texto_largo', [])));
});

// ---------------------------------------------------------------- 2. la puerta

prueba('la puerta deja pasar lo bueno, y lo que no es estructura propia no la trae', () => {
  assert.strictEqual(EM.motivoDeEstructura(undefined, plantilla()), null);
  assert.strictEqual(motivo({ [OBJ]: { campos: { texto: { etiqueta: 'Otro nombre' } } } }), null);
  assert.strictEqual(motivo({ [OBJ]: { campos: { resumen: { retirado: true } } } }), null);
  assert.strictEqual(motivo({ [OBJ]: { anadidos: [propio('m_x', 'X')], orden: ['m_x', 'texto', 'resumen'] } }), null);
  assert.strictEqual(motivo({ [OBJ]: { orden: ['notas', 'texto'] } }), null, 'un retirado se puede colocar');
  assert.strictEqual(motivo({ [OBJ]: { anadidos: [propio('m_t', 'Tabla', { tipo: 'tabla', columnas: ['A'], inicial: { filas: 2 } })] } }), null);
});

prueba('la puerta solo mide la forma si no tiene la plantilla delante', () => {
  assert.strictEqual(EM.motivoDeEstructura({ secciones: { 'lo-que-sea': { orden: ['x'] } } }), null);
  dice(EM.motivoDeEstructura({ secciones: { a: { anadidos: [propio('sin-prefijo', 'X')] } } }), 'm_');
});

prueba('la puerta rechaza la forma que no es: no objeto, claves de mas, sin apartados', () => {
  for (const malo of [null, 'x', 3, [], true]) dice(EM.motivoDeEstructura(malo), 'no es un objeto');
  dice(EM.motivoDeEstructura({ secciones: { a: { orden: ['x'] } }, otra: 1 }), '«otra»', 'solo');
  dice(EM.motivoDeEstructura({}), 'secciones');
  dice(EM.motivoDeEstructura({ secciones: [] }), 'secciones');
  dice(EM.motivoDeEstructura({ secciones: {} }), 'no cambia ning', 'se desv');
  const muchas = {};
  for (let i = 0; i <= EM.MAX_SECCIONES; i += 1) muchas['s' + i] = { orden: ['x'] };
  dice(EM.motivoDeEstructura({ secciones: muchas }), String(EM.MAX_SECCIONES + 1), 'm' + String.fromCharCode(225) + 'ximo');
});

prueba('la puerta rechaza un apartado que el documento no tiene', () => {
  dice(motivo({ 'modulos/inventado': { orden: ['texto'] } }), 'ning', '«modulos/inventado»');
});

prueba('la puerta rechaza un apartado COMUN: su forma es de la jefatura', () => {
  const m = motivo({ identificacion: { anadidos: [propio('m_x', 'X')] } });
  dice(m, 'Identificacion', 'com', 'jefatura');
});

prueba('la puerta rechaza un apartado retirado, o que cuelga de uno retirado', () => {
  dice(motivo({ 'modulos/antiguo': { orden: ['x'] } }), 'Antiguo', 'retirado');
  const p = plantilla();
  seccion(p, 'modulos').retirado = true;
  dice(motivo({ [OBJ]: { orden: ['texto'] } }, p), 'retirado');
});

prueba('la puerta rechaza un apartado de fichas: lo de dentro son los campos de cada ficha', () => {
  dice(motivo({ 'modulos/fichas': { anadidos: [propio('m_x', 'X')] } }), 'Fichas', 'ficha');
});

prueba('la puerta rechaza un desvio mal formado o que no desvia nada', () => {
  dice(motivo({ [OBJ]: 3 }), 'no es un objeto');
  dice(motivo({ [OBJ]: { orden: ['texto'], extra: 1 } }), '«extra»');
  dice(motivo({ [OBJ]: {} }), 'no cambia nada');
  dice(motivo({ [OBJ]: { campos: {}, anadidos: [], orden: [] } }), 'no cambia nada');
});

prueba('la puerta rechaza los cambios a campos comunes que no son renombrar o retirar', () => {
  dice(motivo({ [OBJ]: { campos: [] } }), 'campos');
  dice(motivo({ [OBJ]: { campos: { texto: 3 } } }), 'texto', 'no es un objeto');
  dice(motivo({ [OBJ]: { campos: { texto: { tipo: 'tabla' } } } }), '«tipo»', 'renombrar o retirar');
  dice(motivo({ [OBJ]: { campos: { texto: {} } } }), 'no cambia nada');
  dice(motivo({ [OBJ]: { campos: { texto: { etiqueta: '   ' } } } }), 'etiqueta vac');
  dice(motivo({ [OBJ]: { campos: { texto: { etiqueta: 'x'.repeat(101) } } } }), '101', '100');
  dice(motivo({ [OBJ]: { campos: { texto: { retirado: 'si' } } } }), 'verdadero o falso');
  dice(motivo({ [OBJ]: { campos: { m_x: { retirado: true } } } }), 'ning', 'com', 'anadidos');
});

prueba('la puerta: el id de un campo del modulo se acuna con prefijo, existe una vez y no sigue al nombre', () => {
  dice(motivo({ [OBJ]: { anadidos: [propio('proyecto', 'Proyecto')] } }), '«proyecto»', 'm_', 'com');
  dice(motivo({ [OBJ]: { anadidos: [{ tipo: 'texto_largo', etiqueta: 'X' }] } }), 'id');
  dice(motivo({ [OBJ]: { anadidos: [propio('m_a', 'A'), propio('m_a', 'B')] } }), 'm_a', 'no se reutiliza');
  dice(motivo({ [OBJ]: { anadidos: [propio('m_a', 'A', { retirado: true }), propio('m_a', 'B')] } }), 'no se reutiliza');
});

prueba('la puerta: un campo anadido tiene tipo que se pueda crear, etiqueta y forma de campo', () => {
  dice(motivo({ [OBJ]: { anadidos: [propio('m_a', 'A', { tipo: 'auto.ficha_modulo' })] } }), 'auto.ficha_modulo', 'crear');
  dice(motivo({ [OBJ]: { anadidos: [propio('m_a', '  ')] } }), 'etiqueta');
  dice(motivo({ [OBJ]: { anadidos: [propio('m_a', 'x'.repeat(101))] } }), '101', '100');
  dice(motivo({ [OBJ]: { anadidos: [propio('m_a', 'A', { raro: 1 })] } }), '«raro»');
  dice(motivo({ [OBJ]: { anadidos: [propio('m_a', 'A', { retirado: 'no' })] } }), 'verdadero o falso');
  dice(motivo({ [OBJ]: { anadidos: [propio('m_a', 'A', { inicial: [] })] } }), 'inicial');
  dice(motivo({ [OBJ]: { anadidos: ['texto'] } }), 'no es un campo');
  dice(motivo({ [OBJ]: { anadidos: 'x' } }), 'no son una lista');
});

prueba('la puerta: dos campos del apartado no pueden llamarse igual', () => {
  dice(motivo({ [OBJ]: { anadidos: [propio('m_a', 'Objetivos')] } }), '«Objetivos»', 'distinguir');
  dice(motivo({ [OBJ]: { anadidos: [propio('m_a', '  OBJETIVOS ')] } }), 'distinguir');
  dice(motivo({ [OBJ]: { anadidos: [propio('m_a', 'A'), propio('m_b', 'a')] } }), 'distinguir');
  dice(motivo({ [OBJ]: { campos: { resumen: { etiqueta: 'Objetivos' } } } }), '«Objetivos»', 'distinguir');
  // Sin la plantilla, los del modulo entre si.
  dice(EM.motivoDeEstructura({ secciones: { a: { anadidos: [propio('m_a', 'A'), propio('m_b', 'A')] } } }), 'distinguir');
});

prueba('la puerta: un campo retirado libera su nombre, y retirar el comun tambien', () => {
  assert.strictEqual(motivo({ [OBJ]: { anadidos: [propio('m_a', 'Objetivos')], campos: { texto: { retirado: true } } } }), null);
  assert.strictEqual(motivo({ [OBJ]: { anadidos: [propio('m_a', 'A', { retirado: true }), propio('m_b', 'A')] } }), null);
  assert.strictEqual(motivo({ [OBJ]: { anadidos: [propio('m_a', 'Notas')] } }), null, 'la comun retirada tampoco cuenta');
});

prueba('la puerta: el orden nombra campos que existen, una vez cada uno', () => {
  dice(motivo({ [OBJ]: { orden: 'texto' } }), 'orden', 'lista');
  dice(motivo({ [OBJ]: { orden: [3] } }), 'id de campo');
  dice(motivo({ [OBJ]: { orden: ['texto', 'texto'] } }), '«texto»', 'dos veces');
  dice(motivo({ [OBJ]: { orden: ['fantasma'] } }), '«fantasma»', 'no tiene');
});

prueba('la puerta: los topes de campos por apartado', () => {
  const muchos = [];
  for (let i = 0; i <= EM.MAX_CAMPOS; i += 1) muchos.push(propio('m_c' + i, 'Campo ' + i));
  dice(motivo({ [OBJ]: { anadidos: muchos } }), String(EM.MAX_CAMPOS + 1), String(EM.MAX_CAMPOS));
  // Cuentan los vigentes de lo comun mas los del modulo: 2 comunes + 19 propios = 21.
  dice(motivo({ [OBJ]: { anadidos: muchos.slice(0, EM.MAX_CAMPOS - 1) } }), '21', String(EM.MAX_CAMPOS));
  assert.strictEqual(motivo({ [OBJ]: { anadidos: muchos.slice(0, EM.MAX_CAMPOS - 2) } }), null);
  // Retirar uno de los comunes deja sitio.
  assert.strictEqual(motivo({ [OBJ]: { anadidos: muchos.slice(0, EM.MAX_CAMPOS - 1), campos: { resumen: { retirado: true } } } }), null);
});

prueba('las copias de los topes no se separan de las de la plantilla y los campos', () => {
  assert.strictEqual(EM.MAX_CAMPOS, Plantilla.MAX_CAMPOS);
  assert.strictEqual(EM.LARGO_ETIQUETA, Campos.LARGO_ETIQUETA);
  assert.deepStrictEqual(EM.RESERVADOS, ['items']);
});

prueba('lo que pasa la puerta se lee con la regla: la puerta y la regla dicen lo mismo', () => {
  const p = plantilla();
  const secciones = { [OBJ]: { campos: { texto: { etiqueta: 'Mi texto' } }, anadidos: [propio('m_a', 'A')], orden: ['m_a'] } };
  assert.strictEqual(EM.motivoDeEstructura({ secciones }, p), null);
  assert.deepStrictEqual(ids(EM.camposDeSeccion(seccion(p, OBJ), unidadCon(secciones)).vigentes), ['m_a', 'texto', 'resumen']);
});

// ---------------------------------------------------------------- 4. los apartados enteros

// La plantilla de juguete con un apartado de modulo que tiene hijos (objetivos > detalle, extra).
const DET = OBJ + '/detalle';
const EXT = OBJ + '/extra';
const plantillaConHijos = () => {
  const p = plantilla();
  seccion(p, OBJ).hijos = [
    { id: DET, titulo: 'Detalle', campos: [{ id: 'texto', tipo: 'texto_largo', etiqueta: 'Detalle' }] },
    { id: EXT, titulo: 'Extra', campos: [{ id: 'texto', tipo: 'texto_largo', etiqueta: 'Extra' }] },
  ];
  return p;
};
const unidadApartados = (apartados) => ({ id: 'daw-0485', estructura: { apartados } });
const apartados = (p, apart) => EM.apartadosDeModulo(p, unidadApartados(apart));
const motivoAp = (apart, p) => EM.motivoDeEstructura({ apartados: apart }, p || plantilla());
const propioAp = (id, titulo, padre, extra) => Object.assign({
  id, titulo, padre: padre || 'modulos', campos: [propio('m_texto', 'Texto')],
}, extra);
const MP = 'modulos/m_proyecto';

prueba('apartados: un modulo sin estructura sigue la comun, con las MISMAS referencias', () => {
  const p = plantilla();
  const bloque = seccion(p, 'modulos');
  const sinDesvio = [{ id: 'x' }, null, undefined, { id: 'x', estructura: {} },
    { id: 'x', estructura: { apartados: { cambios: {}, anadidos: [], orden: { modulos: [] } } } }];
  for (const unidad of sinDesvio) {
    const r = EM.apartadosDeModulo(p, unidad);
    assert.strictEqual(r.origen, 'comun', JSON.stringify(unidad));
    assert.strictEqual(r.bloque, 'modulos');
    assert.strictEqual(r.secciones, bloque.hijos, 'la misma lista, no una copia');
    assert.deepStrictEqual(ids(r.vigentes), [OBJ, EVA, 'modulos/fichas'], 'el retirado no se pinta');
  }
  assert.strictEqual(EM.estructuraDeModulo({ id: 'x', estructura: { apartados: { cambios: {} } } }), null);
});

prueba('apartados: un documento sin modulos no tiene apartados de modulo, y no se rompe', () => {
  const sinModulos = { version: 1, secciones: [{ id: 'a', titulo: 'A', campos: [] }] };
  const r = EM.apartadosDeModulo(sinModulos, unidadApartados({ cambios: { a: { retirado: true } } }));
  assert.deepStrictEqual(r, { origen: 'comun', bloque: null, secciones: [], vigentes: [] });
  assert.deepStrictEqual(EM.apartadosDeModulo(null, null).vigentes, []);
  dice(motivoAp({ cambios: { a: { retirado: true } } }, sinModulos), 'no tiene m', 'dulos');
});

prueba('apartados: retirar un apartado en un modulo no lo retira en los otros diez, y restaurar lo devuelve', () => {
  const p = plantilla();
  const retirado = unidadApartados({ cambios: { [EVA]: { retirado: true } } });
  const r = EM.apartadosDeModulo(p, retirado);
  assert.strictEqual(r.origen, 'propia');
  assert.deepStrictEqual(ids(r.vigentes), [OBJ, 'modulos/fichas']);
  assert.deepStrictEqual(ids(r.secciones), [OBJ, EVA, 'modulos/fichas', 'modulos/antiguo'], 'retirar no borra: sigue en la lista');
  assert.strictEqual(r.secciones.find((s) => s.id === EVA).retirado, true);
  assert.ok(!seccion(p, EVA).retirado, 'la plantilla comun no se toca');
  assert.deepStrictEqual(ids(EM.apartadosDeModulo(p, { id: 'daw-0484' }).vigentes), [OBJ, EVA, 'modulos/fichas'], 'los otros modulos no se enteran');
  // Restaurar es quitar la marca: el apartado vuelve y, si no queda desvio, el modulo cae a la comun.
  const restaurado = unidadApartados({ cambios: { [EVA]: { retirado: false } } });
  assert.deepStrictEqual(ids(EM.apartadosDeModulo(p, restaurado).vigentes), [OBJ, EVA, 'modulos/fichas']);
  const sin = { id: 'x', estructura: { apartados: { cambios: {} } } };
  assert.strictEqual(EM.apartadosDeModulo(p, sin).origen, 'comun');
});

prueba('apartados: renombrar cambia el titulo y no el id, y solo en ese modulo', () => {
  const p = plantilla();
  const r = apartados(p, { cambios: { [EVA]: { titulo: 'Como se evalua aqui' } } });
  const eva = r.vigentes.find((s) => s.id === EVA);
  assert.strictEqual(eva.titulo, 'Como se evalua aqui');
  assert.strictEqual(eva.id, EVA, 'el id no sigue al nombre: el contenido se guarda por el');
  assert.strictEqual(seccion(p, EVA).titulo, 'Evaluacion');
  assert.strictEqual(EM.apartadosDeModulo(p, { id: 'otro' }).vigentes.find((s) => s.id === EVA).titulo, 'Evaluacion');
  assert.strictEqual(eva.campos, seccion(p, EVA).campos, 'lo que no se cambia se comparte, sin copiar');
});

prueba('apartados: mover cambia el orden entre hermanos; lo que orden no nombra va detras', () => {
  const p = plantilla();
  const r = apartados(p, { orden: { modulos: [EVA, OBJ] } });
  assert.deepStrictEqual(ids(r.secciones), [EVA, OBJ, 'modulos/fichas', 'modulos/antiguo']);
  assert.deepStrictEqual(ids(apartados(p, { orden: { modulos: ['modulos/fichas'] } }).vigentes), ['modulos/fichas', OBJ, EVA]);
  assert.deepStrictEqual(ids(EM.apartadosDeModulo(p, { id: 'otro' }).vigentes), [OBJ, EVA, 'modulos/fichas'], 'los otros no se mueven');
  // Un apartado que la jefatura anade despues a lo comun le llega al que ya diverge, al final.
  seccion(p, 'modulos').hijos.push({ id: 'modulos/nuevo', titulo: 'Nuevo', campos: [] });
  assert.deepStrictEqual(ids(apartados(p, { orden: { modulos: [EVA, OBJ] } }).vigentes), [EVA, OBJ, 'modulos/fichas', 'modulos/nuevo']);
});

prueba('apartados: anadir uno propio lo pone en su sitio, lleva prefijo y se marca como suyo', () => {
  const p = plantilla();
  const proyecto = propioAp(MP, 'Proyecto', 'modulos', { campos: [propio('m_texto', 'Texto'), propio('m_nota', 'Nota')] });
  const r = apartados(p, { anadidos: [proyecto], orden: { modulos: [MP, OBJ] } });
  assert.deepStrictEqual(ids(r.vigentes), [MP, OBJ, EVA, 'modulos/fichas']);
  const nuevo = r.vigentes[0];
  assert.strictEqual(nuevo.propio, true);
  assert.strictEqual(nuevo.titulo, 'Proyecto');
  assert.deepStrictEqual(ids(EM.camposDeSeccion(nuevo, unidadApartados({})).vigentes), ['m_texto', 'm_nota'], 'sus campos los da la misma regla de los campos');
  assert.deepStrictEqual(ids(EM.apartadosDeModulo(p, { id: 'otro' }).vigentes), [OBJ, EVA, 'modulos/fichas'], 'los otros diez no lo ven');
  // Retirado el propio: no se pinta, pero sigue.
  const quitado = apartados(p, { anadidos: [{ ...proyecto, retirado: true }] });
  assert.ok(quitado.secciones.some((s) => s.id === MP));
  assert.ok(!quitado.vigentes.some((s) => s.id === MP));
  // Un anadido que choca con un id comun no se pinta, y uno cuyo padre no existe, tampoco.
  assert.ok(!apartados(p, { anadidos: [propioAp(EVA, 'Choca')] }).secciones.some((s) => s.propio));
  assert.ok(!apartados(p, { anadidos: [propioAp('nada/m_x', 'Huerfano', 'nada')] }).secciones.some((s) => s.id === 'nada/m_x'));
  assert.ok(!apartados(p, { anadidos: [null, { sin: 'id' }] }).secciones.some((s) => s.propio));
});

prueba('apartados: uno propio puede colgar de otro (propio o comun) y se pinta dentro de su padre', () => {
  const p = plantilla();
  const hijo = propioAp(MP + '/m_fase', 'Fase', MP);
  const r = apartados(p, { anadidos: [propioAp(MP, 'Proyecto'), hijo, propioAp(EVA + '/m_anexo', 'Anexo', EVA)] });
  assert.deepStrictEqual(ids(r.vigentes.find((s) => s.id === MP).hijos), [MP + '/m_fase']);
  assert.deepStrictEqual(ids(r.vigentes.find((s) => s.id === EVA).hijos), [EVA + '/m_anexo']);
});

prueba('apartados: lo que la comun retira no lo resucita un modulo', () => {
  const p = plantilla();
  const r = apartados(p, { cambios: { 'modulos/antiguo': { retirado: false, titulo: 'Vuelve' } } });
  assert.ok(!ids(r.vigentes).includes('modulos/antiguo'));
  seccion(p, EVA).retirado = true;
  assert.ok(!ids(apartados(p, { orden: { modulos: [EVA] } }).vigentes).includes(EVA));
  dice(motivoAp({ cambios: { [EVA]: { titulo: 'Otro' } } }, p), 'Evaluacion', 'retirado', 'jefatura');
  dice(motivoAp({ cambios: { 'modulos/antiguo': { retirado: true } } }), 'Antiguo', 'retirado', 'jefatura');
});

prueba('apartados CON HIJOS: retirar el padre se lleva a los hijos, y restaurarlo los devuelve', () => {
  const p = plantillaConHijos();
  const sinDesvio = EM.apartadosDeModulo(p, { id: 'x' });
  assert.deepStrictEqual(ids(sinDesvio.vigentes.find((s) => s.id === OBJ).hijos), [DET, EXT]);
  // Retirar el padre no escribe nada en los hijos: se ocultan por estar bajo un retirado.
  const retirado = apartados(p, { cambios: { [OBJ]: { retirado: true } } });
  assert.ok(!retirado.vigentes.some((s) => s.id === OBJ));
  const dentro = retirado.secciones.find((s) => s.id === OBJ);
  assert.strictEqual(dentro.retirado, true);
  assert.deepStrictEqual(ids(dentro.hijos), [DET, EXT], 'los hijos siguen ahi, con su contenido: retirar no borra');
  assert.ok(!dentro.hijos.some((h) => h.retirado), 'los hijos no llevan marca propia');
  // Restaurar el padre: vuelven los que no se retiraron por separado.
  const restaurado = apartados(p, { cambios: { [OBJ]: { retirado: false }, [EXT]: { retirado: true } } });
  assert.deepStrictEqual(ids(restaurado.vigentes.find((s) => s.id === OBJ).hijos), [DET], 'el hijo retirado por separado sigue retirado');
  // Un hijo retirado solo, con el padre en pie.
  const hijoFuera = apartados(p, { cambios: { [DET]: { retirado: true } } });
  assert.deepStrictEqual(ids(hijoFuera.vigentes.find((s) => s.id === OBJ).hijos), [EXT]);
  // Y los hijos se renombran y se mueven entre sus hermanos.
  const movido = apartados(p, { cambios: { [DET]: { titulo: 'Mas detalle' } }, orden: { [OBJ]: [EXT, DET] } });
  const hijos = movido.vigentes.find((s) => s.id === OBJ).hijos;
  assert.deepStrictEqual(hijos.map((h) => h.titulo), ['Extra', 'Mas detalle']);
  assert.strictEqual(seccion(p, DET).titulo, 'Detalle');
  // La puerta deja un hijo marcado bajo un padre retirado: es lo que sale de retirar en ese orden.
  assert.strictEqual(motivoAp({ cambios: { [OBJ]: { retirado: true }, [DET]: { retirado: true } } }, p), null);
});

prueba('apartados: apartadosDeModulo y la puerta dicen lo mismo, y los campos de dentro siguen su regla', () => {
  const p = plantilla();
  const apart = {
    cambios: { [EVA]: { titulo: 'Evaluacion del modulo' } },
    anadidos: [propioAp(MP, 'Proyecto')],
    orden: { modulos: [MP, OBJ] },
  };
  const unidad = { id: 'x', estructura: { apartados: apart, secciones: { [OBJ]: { campos: { resumen: { retirado: true } } } } } };
  assert.strictEqual(EM.motivoDeEstructura(unidad.estructura, p), null);
  const r = EM.apartadosDeModulo(p, unidad);
  assert.deepStrictEqual(ids(r.vigentes), [MP, OBJ, EVA, 'modulos/fichas']);
  const obj = r.vigentes.find((s) => s.id === OBJ);
  assert.deepStrictEqual(ids(EM.camposDeSeccion(obj, unidad).vigentes), ['texto'], 'camposDeSeccion y apartadosDeModulo se llevan bien');
  assert.deepStrictEqual(Object.keys(EM.estructuraDeModulo(unidad)).sort(), ['apartados', 'secciones']);
  assert.deepStrictEqual(Object.keys(EM.estructuraDeModulo(unidadApartados(apart))), ['secciones', 'apartados']);
});

prueba('apartados: el id de uno propio lleva prefijo, cuelga de su padre, no sigue al nombre y no se reutiliza', () => {
  assert.strictEqual(EM.idDeApartadoPropio('Proyecto final', 'modulos', []), 'modulos/m_proyecto-final');
  assert.strictEqual(EM.idDeApartadoPropio('Proyecto final', 'modulos', ['modulos/m_proyecto-final']), 'modulos/m_proyecto-final-2');
  assert.strictEqual(EM.idDeApartadoPropio('4. Proyecto final', 'modulos/a', ['modulos/a/m_proyecto-final', 'modulos/a/m_proyecto-final-2']), 'modulos/a/m_proyecto-final-3');
  assert.strictEqual(EM.idDeApartadoPropio('', 'modulos', []), 'modulos/m_seccion');
  // Los ids de la plantilla nunca llevan guion bajo en su ultimo tramo: no pueden chocar.
  assert.ok(!/_/.test(Plantilla.slug('Un guion_bajo')));
});

prueba('la puerta de apartados: lo bueno pasa', () => {
  assert.strictEqual(motivoAp({ cambios: { [EVA]: { titulo: 'Otro nombre' } } }), null);
  assert.strictEqual(motivoAp({ cambios: { [EVA]: { retirado: true } } }), null);
  assert.strictEqual(motivoAp({ cambios: { 'modulos/fichas': { titulo: 'Mis fichas', retirado: true } } }), null, 'un apartado de fichas se retira y se renombra');
  assert.strictEqual(motivoAp({ orden: { modulos: [EVA, 'modulos/antiguo', OBJ] } }), null, 'un retirado se puede colocar');
  assert.strictEqual(motivoAp({ anadidos: [propioAp(MP, 'Proyecto')], orden: { modulos: [MP] } }), null);
  assert.strictEqual(motivoAp({ orden: { modulos: [], [OBJ]: [] }, cambios: { [EVA]: { retirado: true } } }), null, 'una lista vacia en orden no estorba');
  assert.strictEqual(EM.motivoDeEstructura({ apartados: { orden: { cualquiera: ['x'] } } }), null, 'sin plantilla solo se mide la forma');
});

prueba('la puerta de apartados: la forma', () => {
  dice(motivoAp(3), 'no son un objeto');
  dice(motivoAp({ cambios: {}, extra: 1 }), '«extra»', 'solo');
  dice(motivoAp({}), 'no cambian nada');
  dice(motivoAp({ cambios: {}, anadidos: [], orden: { modulos: [] } }), 'no cambian nada');
  dice(motivoAp({ cambios: [] }), 'cambios');
  dice(motivoAp({ anadidos: 'x' }), 'no son una lista');
  dice(motivoAp({ orden: [] }), 'orden');
  dice(EM.motivoDeEstructura({}), 'secciones', 'apartados');
  dice(EM.motivoDeEstructura({ secciones: {} }), 'no cambia ning');
  dice(EM.motivoDeEstructura({ secciones: {}, apartados: { cambios: {} } }), 'no cambian nada');
  assert.strictEqual(EM.motivoDeEstructura({ secciones: {}, apartados: { cambios: { [EVA]: { retirado: true } } } }, plantilla()), null);
});

prueba('la puerta de apartados: los cambios a apartados comunes son renombrar o retirar, nada mas', () => {
  dice(motivoAp({ cambios: { [EVA]: 3 } }), EVA, 'no es un objeto');
  dice(motivoAp({ cambios: { [EVA]: { campos: [] } } }), '«campos»', 'renombrar o retirar');
  dice(motivoAp({ cambios: { [EVA]: {} } }), 'no cambia nada');
  dice(motivoAp({ cambios: { [EVA]: { titulo: '   ' } } }), 'titulo');
  dice(motivoAp({ cambios: { [EVA]: { titulo: 'x'.repeat(201) } } }), '201', '200');
  dice(motivoAp({ cambios: { [EVA]: { titulo: '4. Evaluacion' } } }), 'sin n', 'posici');
  dice(motivoAp({ cambios: { [EVA]: { retirado: 'si' } } }), 'verdadero o falso');
  dice(motivoAp({ cambios: { 'modulos/inventado': { retirado: true } } }), 'ning', '«modulos/inventado»');
  dice(motivoAp({ cambios: { [MP]: { retirado: true } }, anadidos: [propioAp(MP, 'Proyecto')] }), 'anadidos');
});

prueba('la puerta de apartados: lo comun del documento y el propio bloque no son de un modulo', () => {
  dice(motivoAp({ cambios: { identificacion: { retirado: true } } }), 'Identificacion', 'com', 'jefatura');
  dice(motivoAp({ cambios: { modulos: { titulo: 'Otros' } } }), 'Modulos', 'com', 'jefatura');
  dice(motivoAp({ orden: { identificacion: ['x'] } }), 'identificacion');
  dice(motivoAp({ anadidos: [propioAp('identificacion/m_x', 'X', 'identificacion')] }), 'identificacion');
});

prueba('la puerta de apartados: uno propio se acuna con prefijo, cuelga de un padre valido y existe una vez', () => {
  dice(motivoAp({ anadidos: [propioAp('modulos/proyecto', 'Proyecto')] }), '«modulos/proyecto»', 'm_', 'com');
  dice(motivoAp({ anadidos: [propioAp('proyecto', 'Proyecto')] }), 'padre');
  dice(motivoAp({ anadidos: [propioAp('modulos/m_a/b', 'A')] }), 'padre');
  dice(motivoAp({ anadidos: [{ titulo: 'X', padre: 'modulos', campos: [] }] }), 'id');
  dice(motivoAp({ anadidos: [{ id: 'modulos/m_a', titulo: 'X', campos: [] }] }), 'padre');
  dice(motivoAp({ anadidos: [propioAp('modulos/m_a', 'A'), propioAp('modulos/m_a', 'B')] }), 'no se reutiliza');
  dice(motivoAp({ anadidos: [propioAp('modulos/m_a', 'A', 'modulos', { retirado: true }), propioAp('modulos/m_a', 'B')] }), 'no se reutiliza');
  dice(motivoAp({ anadidos: [propioAp('modulos/m_a', 'A', 'modulos', { raro: 1 })] }), '«raro»');
  dice(motivoAp({ anadidos: [propioAp('modulos/m_a', 'A', 'modulos', { retirado: 'no' })] }), 'verdadero o falso');
  dice(motivoAp({ anadidos: ['x'] }), 'no es un apartado');
  dice(motivoAp({ anadidos: [propioAp('modulos/m_a', '')] }), 'titulo');
  dice(motivoAp({ anadidos: [propioAp('modulos/m_a', '3. Algo')] }), 'sin n');
});

prueba('la puerta de apartados: el padre de uno propio existe, no esta retirado y no es de fichas', () => {
  dice(motivoAp({ anadidos: [propioAp('nada/m_x', 'X', 'nada')] }), '«nada»');
  dice(motivoAp({ anadidos: [propioAp('modulos/fichas/m_x', 'X', 'modulos/fichas')] }), 'Fichas', 'ficha');
  dice(motivoAp({ anadidos: [propioAp('modulos/antiguo/m_x', 'X', 'modulos/antiguo')] }), 'Antiguo', 'retirado');
  // Cuelga de otro propio solo si va antes: sin ciclos ni apartados sin sitio.
  assert.strictEqual(motivoAp({ anadidos: [propioAp(MP, 'P'), propioAp(MP + '/m_h', 'H', MP)] }), null);
  dice(motivoAp({ anadidos: [propioAp(MP + '/m_h', 'H', MP), propioAp(MP, 'P')] }), 'antes');
  dice(motivoAp({ anadidos: [propioAp(MP, 'P', MP)] }), 'padre');
  const p = plantilla();
  seccion(p, 'modulos').retirado = true;
  dice(motivoAp({ anadidos: [propioAp(MP, 'P')] }, p), 'retirado');
});

prueba('la puerta de apartados: un propio lleva campos, validos y sin repetir', () => {
  dice(motivoAp({ anadidos: [propioAp('modulos/m_a', 'A', 'modulos', { campos: undefined })] }), 'campos');
  dice(motivoAp({ anadidos: [propioAp('modulos/m_a', 'A', 'modulos', { campos: [] })] }), 'al menos un campo');
  dice(motivoAp({ anadidos: [propioAp('modulos/m_a', 'A', 'modulos', { campos: [propio('texto', 'T')] })] }), 'm_');
  dice(motivoAp({ anadidos: [propioAp('modulos/m_a', 'A', 'modulos', { campos: [propio('m_t', 'T'), propio('m_t', 'U')] })] }), 'm_t', 'no se reutiliza');
  dice(motivoAp({ anadidos: [propioAp('modulos/m_a', 'A', 'modulos', { campos: [propio('m_t', 'T'), propio('m_u', 't')] })] }), 'distinguir');
  dice(motivoAp({ anadidos: [propioAp('modulos/m_a', 'A', 'modulos', { campos: [propio('m_t', 'T', { tipo: 'auto.ficha_modulo' })] })] }), 'crear');
  const muchos = [];
  for (let i = 0; i <= EM.MAX_CAMPOS; i += 1) muchos.push(propio('m_c' + i, 'Campo ' + i));
  dice(motivoAp({ anadidos: [propioAp('modulos/m_a', 'A', 'modulos', { campos: muchos })] }), String(EM.MAX_CAMPOS + 1));
});

// LAS CASILLAS DE UN APARTADO PROPIO. Viven dentro de su propio `anadido` (`campos`), no en `secciones`:
// añadir, renombrar, retirar, restaurar y reordenar es devolver la lista de `campos` cambiada, y la puerta
// la mira entera cada vez.
const taller = (campos, extra) => ({
  anadidos: [propioAp('modulos/m_taller', 'Taller de depuración', 'modulos', Object.assign({ campos }, extra))],
});
const casillasDeTaller = (campos) => {
  const unidad = unidadApartados(taller(campos));
  const nodo = EM.apartadosDeModulo(plantilla(), unidad).secciones.find((s) => s.id === 'modulos/m_taller');
  return EM.camposDeSeccion(nodo, unidad);
};

prueba('casillas de un apartado propio: anadir, renombrar, retirar, restaurar y reordenar se aceptan', () => {
  const base = [propio('m_texto', 'Texto')];
  assert.strictEqual(motivoAp(taller(base)), null);
  // Anadir.
  const dos = base.concat([propio('m_pasos', 'Pasos para reproducirlo')]);
  assert.strictEqual(motivoAp(taller(dos)), null);
  assert.deepStrictEqual(casillasDeTaller(dos).vigentes.map((c) => c.id), ['m_texto', 'm_pasos']);
  // Renombrar: cambia la etiqueta y el id se queda.
  const renombrada = [propio('m_texto', 'Descripción del fallo'), dos[1]];
  assert.strictEqual(motivoAp(taller(renombrada)), null);
  assert.deepStrictEqual(casillasDeTaller(renombrada).vigentes.map((c) => c.etiqueta), ['Descripción del fallo', 'Pasos para reproducirlo']);
  // Retirar no borra: la casilla sigue en la lista, deja de pintarse.
  const retirada = [dos[0], propio('m_pasos', 'Pasos para reproducirlo', { retirado: true })];
  assert.strictEqual(motivoAp(taller(retirada)), null);
  const r = casillasDeTaller(retirada);
  assert.deepStrictEqual(r.campos.map((c) => c.id), ['m_texto', 'm_pasos']);
  assert.deepStrictEqual(r.vigentes.map((c) => c.id), ['m_texto']);
  // Restaurar es quitar la marca.
  assert.strictEqual(motivoAp(taller(dos)), null);
  // Reordenar es el orden de la lista.
  const alReves = [dos[1], dos[0]];
  assert.strictEqual(motivoAp(taller(alReves)), null);
  assert.deepStrictEqual(casillasDeTaller(alReves).vigentes.map((c) => c.id), ['m_pasos', 'm_texto']);
  // Un apartado con todas las casillas retiradas es valido: retirar no borra.
  assert.strictEqual(motivoAp(taller([propio('m_texto', 'Texto', { retirado: true })])), null);
});

prueba('casillas de un apartado propio: cada motivo se dice con palabras de una persona', () => {
  const t = (campos) => motivoAp(taller(campos));
  // El id no sigue al nombre: lo acuna el modulo con prefijo, una vez, y no se reutiliza ni retirado.
  dice(t([propio('texto', 'Texto')]), 'del campo 1 del apartado añadido 1', '«texto»', 'm_');
  dice(t([propio('m_a', 'A'), propio('m_a', 'B', { retirado: true })]), 'm_a', 'ni siquiera si el otro está retirado', 'contenido se guarda por él');
  // Dos casillas no se llaman igual, y «igual» es sin mayusculas ni tildes.
  dice(t([propio('m_a', 'Descripción'), propio('m_b', 'DESCRIPCION ')]), 'distinguir', 'Cambia el nombre de uno, o retira el que sobre');
  // Un nombre retirado se puede reutilizar, y restaurar la casilla vieja con el nombre ya cogido, no.
  assert.strictEqual(t([propio('m_a', 'Texto', { retirado: true }), propio('m_b', 'Texto')]), null);
  dice(t([propio('m_a', 'Texto'), propio('m_b', 'Texto')]), 'distinguir');
  // Sin casillas no se puede escribir.
  dice(t([]), 'al menos un campo');
  // Forma de cada casilla.
  dice(t([propio('m_a', '  ')]), 'etiqueta');
  dice(t([propio('m_a', 'x'.repeat(101))]), '101', '100', 'del campo 1 del apartado');
  dice(t([propio('m_a', 'A', { retirado: 'no' })]), 'verdadero o falso');
  dice(t([propio('m_a', 'A', { tipo: 'auto.ficha_modulo' })]), 'auto.ficha_modulo', 'crear');
  dice(t([propio('m_a', 'A', { raro: 1 })]), '«raro»');
  // «de el» no existe: se contrae.
  for (const campos of [[propio('texto', 'T')], [propio('m_a', 'x'.repeat(101))], [propio('m_a', 'A'), propio('m_b', 'a')]]) {
    assert.ok(!/ de el /.test(t(campos)), 'el motivo dice «de el»: ' + t(campos));
  }
});

prueba('casillas de un apartado propio: el tope cuenta tambien las retiradas, y el motivo lo dice', () => {
  const lista = (n, retiradas) => {
    const l = [];
    for (let i = 0; i < n; i += 1) l.push(propio('m_c' + i, 'Casilla ' + i, i < retiradas ? { retirado: true } : undefined));
    return l;
  };
  assert.strictEqual(motivoAp(taller(lista(EM.MAX_CAMPOS, 5))), null);
  dice(motivoAp(taller(lista(EM.MAX_CAMPOS + 1, 5))), String(EM.MAX_CAMPOS + 1), String(EM.MAX_CAMPOS), 'contando los retirados');
});

prueba('la puerta de apartados: el orden nombra hijos de ese padre, una vez cada uno', () => {
  dice(motivoAp({ orden: { modulos: 'x' } }), 'lista');
  dice(motivoAp({ orden: { modulos: [3] } }), 'id de apartado');
  dice(motivoAp({ orden: { modulos: [EVA, EVA] } }), EVA, 'dos veces');
  dice(motivoAp({ orden: { modulos: ['fantasma'] } }), '«fantasma»', 'no es hijo');
  dice(motivoAp({ orden: { nada: [EVA] } }), '«nada»');
  const p = plantillaConHijos();
  dice(motivoAp({ orden: { modulos: [DET] } }, p), '«' + DET + '»', 'no es hijo', 'sitio');
  assert.strictEqual(motivoAp({ orden: { [OBJ]: [EXT, DET] } }, p), null);
  assert.strictEqual(motivoAp({ anadidos: [propioAp(MP, 'P')], orden: { [MP]: [], modulos: [MP] } }, p), null);
  dice(motivoAp({ anadidos: [propioAp(MP, 'P')], orden: { [MP]: [OBJ] } }), 'no es hijo');
  seccion(p, OBJ).retirado = true;
  dice(motivoAp({ orden: { [OBJ]: [EXT, DET] } }, p), 'retirado');
});

prueba('la puerta de apartados: el tope de apartados propios', () => {
  const muchos = [];
  for (let i = 0; i <= EM.MAX_APARTADOS_PROPIOS; i += 1) muchos.push(propioAp('modulos/m_a' + i, 'Apartado ' + i));
  dice(motivoAp({ anadidos: muchos }), String(EM.MAX_APARTADOS_PROPIOS + 1), String(EM.MAX_APARTADOS_PROPIOS));
  assert.strictEqual(motivoAp({ anadidos: muchos.slice(0, EM.MAX_APARTADOS_PROPIOS) }), null);
});

prueba('la puerta de apartados: dos hermanos visibles no se llaman igual, pero solo si lo ha hecho el modulo', () => {
  dice(motivoAp({ cambios: { [EVA]: { titulo: 'objetivos' } } }), '«objetivos»', 'distinguir');
  dice(motivoAp({ anadidos: [propioAp(MP, 'EVALUACION')] }), 'distinguir');
  dice(motivoAp({ anadidos: [propioAp(MP, 'A'), propioAp('modulos/m_b', 'a')] }), 'distinguir');
  // Un retirado libera su nombre.
  assert.strictEqual(motivoAp({ cambios: { [EVA]: { titulo: 'Objetivos' }, [OBJ]: { retirado: true } } }), null);
  assert.strictEqual(motivoAp({ anadidos: [propioAp(MP, 'Antiguo')] }), null, 'el retirado de la comun no cuenta');
  // Un parecido que ya traia la comun no se le achaca a quien cambia otra cosa.
  const p = plantilla();
  seccion(p, EVA).titulo = 'Objetivos';
  assert.strictEqual(motivoAp({ cambios: { 'modulos/fichas': { titulo: 'Mis fichas' } } }, p), null);
});

prueba('la puerta: un propio no se toca desde «secciones», y lo de campos sigue valiendo junto a apartados', () => {
  const anadido = propioAp(MP, 'Proyecto');
  dice(EM.motivoDeEstructura({ secciones: { [MP]: { orden: ['m_texto'] } }, apartados: { anadidos: [anadido] } }, plantilla()), 'Proyecto', 'anadidos');
  dice(EM.motivoDeEstructura({ secciones: { [MP]: { orden: ['m_texto'] } }, apartados: { anadidos: [anadido] } }), 'anadidos');
  assert.strictEqual(EM.motivoDeEstructura({ secciones: { [OBJ]: { orden: ['resumen'] } }, apartados: { anadidos: [anadido] } }, plantilla()), null);
  // Un desvio de campos mal hecho se sigue diciendo, aunque los apartados esten bien.
  dice(EM.motivoDeEstructura({ secciones: { [OBJ]: { orden: ['fantasma'] } }, apartados: { anadidos: [anadido] } }, plantilla()), '«fantasma»');
  // Retirar un apartado en el modulo no impide dejar guardados los cambios a sus campos: retirar no borra.
  assert.strictEqual(EM.motivoDeEstructura({ secciones: { [OBJ]: { orden: ['resumen'] } }, apartados: { cambios: { [OBJ]: { retirado: true } } } }, plantilla()), null);
});

// ---------------------------------------------------------------- 3. quien puede

const ROLES = ['admin', 'jefe_estudios', 'jefe_departamento', 'docente'];
const usuario = (rol, extra) => Object.assign({ id: 'u1', rol, departamento: 'informatica' }, extra || {});
const puede = (rol, edita, esDocenteDeLaUnidad) =>
  P.reglaEstructuraPropia(usuario(rol), { edita, esDocenteDeLaUnidad });

prueba('apartado de modulo: lo cambian admin, jefe de departamento y el docente que lleva la unidad', () => {
  assert.strictEqual(puede('admin', 'docentes_del_modulo', false), true);
  assert.strictEqual(puede('jefe_departamento', 'docentes_del_modulo', false), true, 'en cualquier modulo, lo lleve o no');
  assert.strictEqual(puede('docente', 'docentes_del_modulo', true), true);
  assert.strictEqual(puede('docente', 'docentes_del_modulo', false), false, 'el de otro modulo, no');
  assert.strictEqual(puede('docente', 'docentes_del_modulo', undefined), false);
});

prueba('apartado comun: lo cambian admin, jefe de departamento y quien lo tiene asignado (decision del departamento)', () => {
  assert.strictEqual(puede('admin', 'jefe_departamento', false), true);
  assert.strictEqual(puede('jefe_departamento', 'jefe_departamento', false), true);
  assert.strictEqual(puede('docente', 'jefe_departamento', false), false, 'sin tenerlo asignado, no');
  // Llevar una unidad no da un apartado comun.
  assert.strictEqual(puede('docente', 'jefe_departamento', true), false);
  // Con el apartado asignado si: quien puede editar el apartado puede configurarlo. Antes era false.
  const asignado = { edita: 'jefe_departamento', tieneApartadoAsignado: true };
  assert.strictEqual(P.reglaEstructuraPropia(usuario('docente'), asignado), true);
  assert.strictEqual(P.reglaEstructuraPropia(usuario('docente'), asignado), P.reglaEdicion(usuario('docente'), asignado),
    'configurar y escribir contestan lo mismo');
});

prueba('la jefatura de estudios nunca, en ninguno', () => {
  for (const edita of ['docentes_del_modulo', 'jefe_departamento', null, undefined, 'otro']) {
    for (const lleva of [true, false]) assert.strictEqual(puede('jefe_estudios', edita, lleva), false, `${edita}/${lleva}`);
  }
});

prueba('la matriz entera de los cuatro roles', () => {
  const esperado = {
    'docentes_del_modulo/lleva': { admin: true, jefe_estudios: false, jefe_departamento: true, docente: true },
    'docentes_del_modulo/no': { admin: true, jefe_estudios: false, jefe_departamento: true, docente: false },
    'jefe_departamento/lleva': { admin: true, jefe_estudios: false, jefe_departamento: true, docente: false },
    'jefe_departamento/no': { admin: true, jefe_estudios: false, jefe_departamento: true, docente: false },
  };
  for (const clave of Object.keys(esperado)) {
    const [edita, lleva] = clave.split('/');
    for (const rol of ROLES) {
      assert.strictEqual(puede(rol, edita, lleva === 'lleva'), esperado[clave][rol], `${rol} · ${clave}`);
    }
  }
});

prueba('un apartado de quien no se sabe nada no lo cambia nadie, ni el docente que lleva la unidad', () => {
  for (const edita of [null, undefined, '', 'cualquiera', 'docente']) {
    assert.strictEqual(puede('docente', edita, true), false, String(edita));
    assert.strictEqual(puede('jefe_departamento', edita, true), false, String(edita));
  }
});

prueba('quien esta de baja, o no es nadie, no cambia nada', () => {
  for (const rol of ROLES) {
    assert.strictEqual(P.reglaEstructuraPropia(usuario(rol, { activo: false }), { edita: 'docentes_del_modulo', esDocenteDeLaUnidad: true }), false, rol);
  }
  assert.strictEqual(P.reglaEstructuraPropia(null, { edita: 'docentes_del_modulo', esDocenteDeLaUnidad: true }), false);
  assert.strictEqual(P.reglaEstructuraPropia(usuario('docente')), false, 'sin datos del apartado no hay nada que decidir');
});

prueba('puedeCambiarEstructura, la de lo comun del documento entero, no ha cambiado', () => {
  const donde = { departamento: 'informatica' };
  assert.strictEqual(P.puedeCambiarEstructura(usuario('docente'), donde), false);
  assert.strictEqual(P.puedeCambiarEstructura(usuario('jefe_departamento'), donde), true);
  assert.strictEqual(P.puedeCambiarEstructura(usuario('jefe_estudios'), donde), false);
});

// ---------------------------------------------------------------- ejecutar

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
