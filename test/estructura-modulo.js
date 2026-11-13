// LA ESTRUCTURA PROPIA DE UN MODULO Y LA REGLA QUE DECIDE QUE ESTRUCTURA SIGUE CADA UNO.
//
//   node test/estructura-modulo.js
//
// Son tres cosas y las tres se vigilan aqui:
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

prueba('apartado comun: solo admin y jefe de departamento, ni siquiera quien lo tiene asignado', () => {
  assert.strictEqual(puede('admin', 'jefe_departamento', false), true);
  assert.strictEqual(puede('jefe_departamento', 'jefe_departamento', false), true);
  assert.strictEqual(puede('docente', 'jefe_departamento', false), false);
  // Aunque se le diga que lleva la unidad, y aunque tenga el apartado asignado (que ni se pregunta).
  assert.strictEqual(puede('docente', 'jefe_departamento', true), false);
  assert.strictEqual(P.reglaEstructuraPropia(usuario('docente'), { edita: 'jefe_departamento', tieneApartadoAsignado: true, esDocenteDeLaUnidad: true }), false);
  assert.strictEqual(P.reglaEdicion(usuario('docente'), { edita: 'jefe_departamento', tieneApartadoAsignado: true }), true,
    'el contenido si se delega: lo que no se delega es la forma');
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
