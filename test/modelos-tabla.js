// EL MODELO DE TABLA Y LA REGLA QUE DECIDE QUE ESTRUCTURA SIGUE CADA TABLA.
//
//   node test/modelos-tabla.js
//
// Son dos cosas y las dos se vigilan aqui:
//
//   1. LA REGLA. Una tabla sigue su propia estructura mientras la tenga, la del modelo cuando no la
//      tenga, y ninguna si no tiene ninguna de las dos (`estructuraDeTabla` de
//      core/modelos-tabla.js). Con los casos que no son: un modelo que no esta en la plantilla, uno
//      de otro tipo, `partes` vacio, una parte retirada.
//
//   2. LA PUERTA DE ACEPTACION: un campo SIN `modelo` y un valor SIN `estructura` imprimen
//      EXACTAMENTE lo de antes. Todo lo que hay escrito en los documentos del departamento esta
//      asi, asi que no basta con afirmarlo: test/tablas-sin-modelo.json lleva congelados el cuerpo
//      de la definicion de pdfmake y el `document.xml` del .docx de un documento que pasa por todas
//      las ramas de tabla de los dos motores, generados con el motor de antes de que el modelo
//      existiera, y aqui se comparan contra lo que sale hoy. El .docx entero se compara por su
//      sha256, que se puede porque el zip lleva la fecha fija a proposito (motor/exportar-docx.js);
//      del PDF se salta la portada, que lleva la fecha del dia.
//
// Y LOS TRES CONSUMIDORES TIENEN QUE DECIR LO MISMO. La regla la llaman el PDF, el Word y el editor
// con la puerta de guardado, cada uno desde la misma funcion de core/. Si estuviera escrita dos
// veces, la pantalla acabaria pintando una tabla distinta de la que sale impresa, que es la averia
// que esta pieza existe para evitar: por eso hay una prueba que compara las tres salidas celda a
// celda sobre el mismo valor.

'use strict';

const assert = require('assert');
const crypto = require('crypto');
const JSZip = require('jszip');

const MT = require('../core/modelos-tabla');
const Est = require('../core/estructurados');
const Edicion = require('../core/tablas-edicion');
const { buildDocDefinition } = require('../motor/render-generico');
const { exportarDocx } = require('../motor/exportar-docx');
const ORO = require('./tablas-sin-modelo.json');

let fallos = 0;
const pruebas = [];
const prueba = (nombre, fn) => pruebas.push({ nombre, fn });

// ---------------------------------------------------------------- ayudas

const c = (text, extra) => Object.assign({ text }, extra);

const modelo = (extra = {}) => Object.assign({
  id: 'modelo-actividad',
  nombre: 'Ficha de actividad',
  tipo: 'tabla',
  sentido: 'columnas',
  partes: [{ id: 'p-que', etiqueta: 'Actividad' }, { id: 'p-ses', etiqueta: 'Sesiones' }],
  version: 1,
}, extra);

const mapaDe = (m) => ({ [m.id]: m });

const CAMPO = { id: 'actividades', tipo: 'tabla', etiqueta: 'Actividades', modelo: 'modelo-actividad' };
const CAMPO_SIN_MODELO = { id: 'actividades', tipo: 'tabla', etiqueta: 'Actividades' };

// Los textos de una lista de filas de celdas, fila a fila: con esto se comparan las tres salidas.
const textosDeFilas = (filas) => (filas || []).map((f) => f.map((x) => String(x.text == null ? '' : x.text)));

// ---------------------------------------------------------------- 1. la regla

prueba('sin modelo y sin estructura propia, una tabla no sigue ninguna: su forma son sus celdas', () => {
  const valor = { filas: [[c('a'), c('b')]] };
  assert.strictEqual(MT.estructuraDeTabla(CAMPO_SIN_MODELO, valor, mapaDe(modelo())), null);
  assert.strictEqual(MT.estructuraDeTabla(CAMPO_SIN_MODELO, valor, undefined), null);
  // Y es el caso de un campo recien creado, sin valor ninguno.
  assert.strictEqual(MT.estructuraDeTabla(CAMPO_SIN_MODELO, undefined, undefined), null);
});

prueba('con modelo y sin estructura propia, la tabla sigue la del modelo', () => {
  const e = MT.estructuraDeTabla(CAMPO, { filas: [] }, mapaDe(modelo()));
  assert.ok(e, 'no sigue ninguna');
  assert.strictEqual(e.origen, 'modelo');
  assert.strictEqual(e.modelo, 'modelo-actividad');
  assert.strictEqual(e.sentido, 'columnas');
  assert.deepStrictEqual(e.partes.map((p) => p.etiqueta), ['Actividad', 'Sesiones']);
  assert.deepStrictEqual(e.vigentes.map((v) => v.hueco), [0, 1]);
});

prueba('con estructura propia manda la suya, aunque su campo siga apuntando a un modelo', () => {
  const valor = { estructura: { partes: [{ id: 'mia', etiqueta: 'Solo esta' }] }, filas: [[c('x')]] };
  const e = MT.estructuraDeTabla(CAMPO, valor, mapaDe(modelo()));
  assert.strictEqual(e.origen, 'propia');
  assert.deepStrictEqual(e.partes.map((p) => p.etiqueta), ['Solo esta']);
  // De que modelo salio se sigue sabiendo, para poder decirlo.
  assert.strictEqual(e.modelo, 'modelo-actividad');
});

prueba('una tabla divergida cuyo modelo ya no esta sigue siendo suya, y no se queda sin forma', () => {
  const valor = { estructura: { partes: [{ id: 'mia', etiqueta: 'Solo esta' }] }, filas: [[c('x')]] };
  const e = MT.estructuraDeTabla(CAMPO, valor, {});
  assert.strictEqual(e.origen, 'propia');
  assert.strictEqual(e.modelo, null, 'la estructura es suya y no hay a quien volver');
  // El sentido, que `valor.estructura` no guarda, es el de omision del tipo.
  assert.strictEqual(e.sentido, MT.sentidoPorOmision('tabla'));
  assert.strictEqual(e.sentido, 'columnas');
});

prueba('un modelo que no esta en la plantilla no se sigue: la tabla cae al escalon siguiente', () => {
  const valor = { filas: [[c('a'), c('b'), c('c')]] };
  assert.strictEqual(MT.estructuraDeTabla(CAMPO, valor, {}), null);
  assert.strictEqual(MT.estructuraDeTabla(CAMPO, valor, { otro: modelo({ id: 'otro' }) }), null);
  assert.strictEqual(MT.modeloDeCampo(CAMPO, {}), null);
  // Y entonces la tabla se guarda con la forma que tengan sus celdas, como siempre.
  assert.strictEqual(Est.motivoDeCampo(CAMPO, valor, { modelos: {} }), null);
});

prueba('un modelo DE OTRO TIPO no describe esta tabla y no se sigue', () => {
  const m = modelo({ tipo: 'tabla_clave_valor', sentido: 'filas' });
  assert.strictEqual(MT.estructuraDeTabla(CAMPO, { filas: [] }, mapaDe(m)), null);
  // Al contrario tambien: un modelo de rejilla no describe una tabla de clave y valor.
  const kv = { id: 'k', tipo: 'tabla_clave_valor', modelo: 'modelo-actividad' };
  assert.strictEqual(MT.estructuraDeTabla(kv, { pares: [] }, mapaDe(modelo())), null);
});

prueba('un modelo con «partes» vacio no es una estructura: tenerla es tener partes', () => {
  assert.strictEqual(MT.estructuraDeTabla(CAMPO, { filas: [] }, mapaDe(modelo({ partes: [] }))), null);
  // Y es la misma mecanica que `filas: []` en `queSeImprime`: la lista vacia se cae al escalon
  // siguiente en lugar de dejar la tabla sin forma ninguna.
  assert.strictEqual(Est.queSeImprime(CAMPO, { filas: [] }), 'ninguno');
});

prueba('una estructura propia con «partes» vacio cae al modelo, no al vacio', () => {
  const valor = { estructura: { partes: [] }, filas: [[c('a'), c('b')]] };
  const e = MT.estructuraDeTabla(CAMPO, valor, mapaDe(modelo()));
  assert.ok(e, 'se ha quedado sin forma');
  assert.strictEqual(e.origen, 'modelo');
  // Y sin modelo al que caer, ninguna.
  assert.strictEqual(MT.estructuraDeTabla(CAMPO_SIN_MODELO, valor, {}), null);
});

prueba('una parte retirada deja de imprimirse y su hueco en el contenido se conserva', () => {
  const m = modelo({
    partes: [
      { id: 'p-que', etiqueta: 'Actividad' },
      { id: 'p-ses', etiqueta: 'Sesiones', retirado: true },
      { id: 'p-ra', etiqueta: 'RA' },
    ],
  });
  const e = MT.estructuraDeTabla(CAMPO, { filas: [] }, mapaDe(m));
  assert.strictEqual(e.partes.length, 3, 'retirar no borra: la parte sigue en el modelo');
  assert.deepStrictEqual(e.vigentes.map((v) => v.parte.etiqueta), ['Actividad', 'RA']);
  // EL HUECO ES LA POSICION ENTRE TODAS LAS PARTES, no entre las vigentes: si fuera entre las
  // vigentes, retirar la de en medio correria el contenido de la tercera a la segunda columna y cada
  // tabla del grupo quedaria con su texto bajo otro rotulo.
  assert.deepStrictEqual(e.vigentes.map((v) => v.hueco), [0, 2]);

  const valor = { filas: [[c('Exposicion'), c('4'), c('RA1')]] };
  const t = MT.tablaVigente(CAMPO, valor, mapaDe(m), false);
  assert.deepStrictEqual(textosDeFilas(t.filas), [['Actividad', 'RA'], ['Exposicion', 'RA1']]);
  // Lo escrito en la parte retirada sigue en el valor y vuelve con ella al restaurarla.
  assert.strictEqual(valor.filas[0][1].text, '4');
  const vuelta = m.partes.map((p) => ({ ...p, retirado: undefined }));
  const t2 = MT.tablaVigente(CAMPO, valor, mapaDe(modelo({ partes: vuelta })), false);
  assert.deepStrictEqual(textosDeFilas(t2.filas)[1], ['Exposicion', '4', 'RA1']);
});

prueba('un campo de un tipo al que no se le puede poner modelo no sigue ninguno', () => {
  for (const tipo of ['auto.contenidos', 'auto.tabla_ra_ce', 'auto.ficha_modulo', 'texto_largo', 'ficha_situacion_aprendizaje']) {
    const campo = { id: 'x', tipo, modelo: 'modelo-actividad' };
    assert.strictEqual(MT.estructuraDeTabla(campo, { filas: [[c('a')]] }, mapaDe(modelo())), null, tipo);
  }
});

prueba('con los rotulos a lo alto, cada parte es una fila y su etiqueta va delante', () => {
  const m = modelo({ sentido: 'filas', partes: [{ id: 'a', etiqueta: 'Codigo' }, { id: 'b', etiqueta: 'Horas' }] });
  const t = MT.tablaVigente(CAMPO, { filas: [[c('0614')], [c('160')]] }, mapaDe(m), true);
  assert.deepStrictEqual(textosDeFilas(t.filas), [['Codigo', '0614'], ['Horas', '160']]);
  assert.strictEqual(t.cabecera, false, 'con los rotulos a la izquierda no hay fila de cabecera');
});

prueba('los anchos los pone la estructura, y solo si TODAS sus partes los dicen', () => {
  const todos = modelo({ partes: [{ id: 'a', etiqueta: 'A', ancho: 3 }, { id: 'b', etiqueta: 'B', ancho: 1 }] });
  assert.deepStrictEqual(MT.tablaVigente(CAMPO, { filas: [] }, mapaDe(todos), false).anchos, [3, 1]);
  const aMedias = modelo({ partes: [{ id: 'a', etiqueta: 'A', ancho: 3 }, { id: 'b', etiqueta: 'B' }] });
  assert.strictEqual(MT.tablaVigente(CAMPO, { filas: [] }, mapaDe(aMedias), false).anchos, undefined,
    'una lista de anchos incompleta la descartaria el motor sin avisar');
  // Y una parte retirada no cuenta: los anchos son de las columnas que se imprimen.
  const conRetirada = modelo({
    partes: [{ id: 'a', etiqueta: 'A', ancho: 3 }, { id: 'b', etiqueta: 'B', ancho: 9, retirado: true }, { id: 'd', etiqueta: 'D', ancho: 1 }],
  });
  assert.deepStrictEqual(MT.tablaVigente(CAMPO, { filas: [] }, mapaDe(conRetirada), false).anchos, [3, 1]);
});

// ---------------------------------------------------------------- 2. las copias no se separan

prueba('los tipos y los topes copiados en core/modelos-tabla.js son los de la puerta', () => {
  // Estan copiados a proposito, para que la dependencia vaya en un solo sentido (la puerta pregunta
  // por la regla y la regla no necesita a la puerta). Esta prueba es la que impide que se separen.
  assert.strictEqual(MT.TIPO_TABLA, Est.TIPO_TABLA);
  assert.strictEqual(MT.TIPO_CLAVE_VALOR, Est.TIPO_CLAVE_VALOR);
  assert.deepStrictEqual(MT.TIPOS, [Est.TIPO_TABLA, Est.TIPO_CLAVE_VALOR]);
  assert.strictEqual(MT.MAX_PARTES_ANCHO, Est.MAX_COLUMNAS);
  assert.strictEqual(MT.MAX_PARTES_ALTO, Est.MAX_FILAS);
});

// ---------------------------------------------------------------- 3. la forma de un modelo

prueba('la forma de un modelo: lo que vale', () => {
  assert.strictEqual(MT.motivoDeModelo(modelo()), null);
  assert.strictEqual(MT.motivoDeModelo(modelo({ version: undefined })), null, 'la version puede no venir');
  assert.strictEqual(MT.motivoDeModelo(modelo({ partes: [] })), null, 'un modelo a medio hacer vale de forma');
  assert.strictEqual(MT.motivoDeModelo(modelo({ sentido: 'filas', partes: [{ id: 'a', etiqueta: '' }] })), null,
    'una etiqueta en blanco es una parte recien anadida');
  assert.strictEqual(MT.motivoDeModelos(undefined), null, 'una plantilla sin modelos es la de hoy');
  assert.strictEqual(MT.motivoDeModelos({}), null);
  assert.strictEqual(MT.motivoDeModelos(mapaDe(modelo())), null);
});

prueba('la forma de un modelo: lo que no vale, y por que', () => {
  const malo = (extra, trozo) => {
    const m = MT.motivoDeModelo(modelo(extra));
    assert.ok(m, 'se ha aceptado ' + JSON.stringify(extra));
    assert.ok(m.includes(trozo), `el motivo no dice «${trozo}»: ${m}`);
  };
  malo({ id: undefined }, 'id');
  malo({ id: '  ' }, 'id');
  malo({ nombre: undefined }, 'nombre');
  malo({ nombre: 'x'.repeat(MT.LARGO_NOMBRE + 1) }, String(MT.LARGO_NOMBRE));
  malo({ tipo: 'auto.contenidos' }, 'tipo');
  malo({ sentido: 'diagonal' }, 'sentido');
  malo({ sentido: undefined }, 'sentido');
  malo({ partes: 'dos' }, 'no son una lista');
  malo({ version: 0 }, 'versi');
  malo({ version: 1.5 }, 'versi');
  malo({ color: 'azul' }, 'color');
  // Una tabla de clave y valor son dos columnas fijas: sus partes son sus filas y no hay otra
  // manera de leerla.
  malo({ tipo: 'tabla_clave_valor', sentido: 'columnas' }, 'cada parte es una fila');
  // Mas partes de las que caben a lo ancho de la hoja.
  malo({ partes: Array.from({ length: MT.MAX_PARTES_ANCHO + 1 }, (_, i) => ({ id: 'p' + i, etiqueta: 'P' })) }, 'ancho de la hoja');

  // y las partes
  malo({ partes: [{ etiqueta: 'Sin id' }] }, 'id');
  malo({ partes: [{ id: 'a', etiqueta: 'A' }, { id: 'a', etiqueta: 'Otra' }] }, 'repite el id');
  malo({ partes: [{ id: 'a' }] }, 'etiqueta');
  malo({ partes: [{ id: 'a', etiqueta: 'A', retirado: 'si' }] }, 'retirado');
  malo({ partes: [{ id: 'a', etiqueta: 'A', ancho: 0 }] }, 'ancho');
  malo({ partes: [{ id: 'a', etiqueta: 'A', ancho: '3' }] }, 'ancho');
  malo({ partes: [{ id: 'a', etiqueta: 'A', nombre: 'de regalo' }] }, 'nombre');
  // El ancho es la proporcion de una columna: con los rotulos a la izquierda la parte es una fila.
  const filas = MT.motivoDeModelo(modelo({ sentido: 'filas', partes: [{ id: 'a', etiqueta: 'A', ancho: 2 }] }));
  assert.ok(filas && filas.includes('ancho'), filas);
});

prueba('un modelo guardado bajo una clave que no es su id no vale: los campos encontrarian otro', () => {
  const m = MT.motivoDeModelos({ 'modelo-otro': modelo() });
  assert.ok(m, 'se ha aceptado un modelo guardado bajo otra clave');
  assert.ok(m.includes('modelo-otro'), m);
  assert.strictEqual(MT.motivoDeModelos('no es un objeto') === null, false);
  const muchos = {};
  for (let i = 0; i <= MT.MAX_MODELOS; i += 1) muchos['m' + i] = modelo({ id: 'm' + i });
  assert.ok(MT.motivoDeModelos(muchos).includes(String(MT.MAX_MODELOS)));
});

// ---------------------------------------------------------------- 4. la estructura propia

prueba('la forma de la estructura que una tabla guarda para si', () => {
  assert.strictEqual(MT.motivoDeEstructura(undefined, 'la tabla'), null, 'no tenerla es lo normal');
  assert.strictEqual(MT.motivoDeEstructura({ partes: [] }, 'la tabla'), null);
  assert.strictEqual(MT.motivoDeEstructura({ partes: [{ id: 'a', etiqueta: 'A' }] }, 'la tabla'), null);
  // No lleva nombre, ni tipo, ni sentido: eso es del modelo del que divergio, no de la tabla.
  assert.ok(MT.motivoDeEstructura({ partes: [], nombre: 'Mia' }, 'la tabla').includes('nombre'));
  assert.ok(MT.motivoDeEstructura({ partes: [], sentido: 'filas' }, 'la tabla').includes('sentido'));
  assert.ok(MT.motivoDeEstructura([], 'la tabla').includes('objeto'));
  assert.ok(MT.motivoDeEstructura({ partes: [{ etiqueta: 'Sin id' }] }, 'la tabla').includes('id'));
});

// ---------------------------------------------------------------- 5. la puerta de guardado

prueba('la puerta acepta la estructura propia en los dos tipos que pueden seguir un modelo, y en ningun otro', () => {
  const valor = { estructura: { partes: [{ id: 'a', etiqueta: 'A' }] }, filas: [[c('x')]] };
  assert.strictEqual(Est.motivoDeCampo(CAMPO_SIN_MODELO, valor, {}), null);
  assert.strictEqual(Est.motivoDeCampo({ id: 'k', tipo: 'tabla_clave_valor' },
    { estructura: { partes: [{ id: 'a', etiqueta: 'A' }] }, pares: [{ etiqueta: 'A', valor: '1' }] }, {}), null);
  // Una clave que se guarda y no significa nada acaba leyendola alguien: en los demas tipos sobra.
  for (const tipo of ['auto.contenidos', 'dual_ra_ce', 'auto.tabla_ra_ce']) {
    const m = Est.motivoDeCampo({ id: 'x', tipo }, { estructura: { partes: [] }, filas: [] }, {});
    assert.ok(m && m.includes('estructura'), `${tipo}: ${m}`);
  }
});

prueba('la puerta exige que el contenido cuadre con la estructura que la tabla sigue', () => {
  const modelos = mapaDe(modelo());
  assert.strictEqual(Est.motivoDeCampo(CAMPO, { filas: [[c('a'), c('b')]] }, { modelos }), null);
  assert.strictEqual(Est.motivoDeCampo(CAMPO, { filas: [] }, { modelos }), null,
    'una tabla sin nada escrito cuadra con cualquier estructura');
  const corta = Est.motivoDeCampo(CAMPO, { filas: [[c('a')]] }, { modelos });
  assert.ok(corta && corta.includes('parte por parte'), corta);
  // Y sin modelo, la misma tabla se guarda: su forma son sus celdas.
  assert.strictEqual(Est.motivoDeCampo(CAMPO_SIN_MODELO, { filas: [[c('a')]] }, { modelos }), null);
});

prueba('una tabla con estructura no lleva celdas combinadas', () => {
  const modelos = mapaDe(modelo());
  const m = Est.motivoDeCampo(CAMPO, {
    filas: [[c('a', { colspan: 2 }), c('b')], [c('c', { colspan: 2 }), c('d')]],
  }, { modelos });
  assert.ok(m && m.includes('combinada'), m);
  // Cada casilla es de una parte y de una sola: con un colspan, el texto quedaria bajo un rotulo
  // que no es el suyo en cuanto alguien retirara o moviera una parte.
  assert.ok(m.includes('una parte'), m);
});

prueba('las partes retiradas cuentan para el contenido: el hueco sigue ahi', () => {
  const m = modelo({
    partes: [{ id: 'a', etiqueta: 'A' }, { id: 'b', etiqueta: 'B', retirado: true }, { id: 'd', etiqueta: 'D' }],
  });
  assert.strictEqual(Est.motivoDeCampo(CAMPO, { filas: [[c('1'), c('2'), c('3')]] }, { modelos: mapaDe(m) }), null);
  const sinHueco = Est.motivoDeCampo(CAMPO, { filas: [[c('1'), c('3')]] }, { modelos: mapaDe(m) });
  assert.ok(sinHueco && sinHueco.includes('retiradas'), sinHueco);
});

prueba('una tabla de clave y valor con estructura empareja un par con cada parte', () => {
  const m = modelo({ id: 'm-kv', tipo: 'tabla_clave_valor', sentido: 'filas', partes: [{ id: 'a', etiqueta: 'Ciclo' }, { id: 'b', etiqueta: 'Curso' }] });
  const campo = { id: 'k', tipo: 'tabla_clave_valor', modelo: 'm-kv' };
  const modelos = mapaDe(m);
  assert.strictEqual(Est.motivoDeCampo(campo, { pares: [{ etiqueta: 'x', valor: 'DAW' }, { etiqueta: 'y', valor: '2026-27' }] }, { modelos }), null);
  assert.strictEqual(Est.motivoDeCampo(campo, { pares: [] }, { modelos }), null, 'sin nada escrito, cuadra');
  const corta = Est.motivoDeCampo(campo, { pares: [{ etiqueta: 'x', valor: 'DAW' }] }, { modelos });
  assert.ok(corta && corta.includes('parte por parte'), corta);
  // Y los rotulos que se imprimen son los de las partes, no los que el par tenga guardados.
  const { pares } = MT.paresVigentes(campo, { pares: [{ etiqueta: 'lo que sea', valor: 'DAW' }, { etiqueta: 'tampoco', valor: '2026-27' }] }, modelos);
  assert.deepStrictEqual(pares, [{ etiqueta: 'Ciclo', valor: 'DAW' }, { etiqueta: 'Curso', valor: '2026-27' }]);
});

// ---------------------------------------------------------------- 6. el editor

prueba('el editor se niega a lo que cambiaria la forma de una tabla con estructura, y lo explica', () => {
  const modelos = mapaDe(modelo());
  const valor = { filas: [[c('Exposicion'), c('4')]] };
  for (const [op, args] of [
    ['anadir-columna', { despuesDe: 0 }],
    ['quitar-columna', { columna: 0 }],
    ['combinar', { fila: 0, columna: 0, hacia: 'derecha' }],
    ['cabecera', { puesta: true }],
    ['ancho', { columna: 0, hacia: 'ensanchar' }],
    ['anchos-automaticos', {}],
  ]) {
    const m = Edicion.motivoDeNo(valor, op, args, CAMPO, modelos);
    assert.ok(m, `${op} no se ha negado`);
    assert.ok(m.includes('escribir en ella y darle estilo'), `${op}: ${m}`);
    // Y `aplicar` no cambia nada: devuelve el mismo objeto.
    assert.strictEqual(Edicion.aplicar(valor, op, args, { campo: CAMPO, modelos }), valor, op);
  }
  // Escribir y dar estilo se puede siempre, y las filas de CONTENIDO tambien se anaden y se quitan:
  // con los rotulos arriba, las partes son las columnas.
  for (const [op, args] of [
    ['texto', { fila: 0, columna: 0, valor: 'Otra cosa' }],
    ['negrita', { fila: 0, columna: 0, puesta: true }],
    ['fondo', { fila: 0, columna: 0, cual: 'etiqueta' }],
    ['anadir-fila', {}],
    ['quitar-fila', { fila: 0 }],
  ]) {
    assert.strictEqual(Edicion.motivoDeNo(valor, op, args, CAMPO, modelos), null, op);
  }
  // Sin modelos, todas se pueden: la pantalla de lo que hay escrito no cambia.
  assert.strictEqual(Edicion.motivoDeNo(valor, 'anadir-columna', { despuesDe: 0 }, CAMPO), null);
});

prueba('lo que el editor niega es exactamente lo que la puerta rechazaria', () => {
  // `aplicar` promete devolver un valor que pasa la puerta. Si una operacion de forma se dejara
  // pasar, el valor resultante no cuadraria con la estructura y el boton daria un 400.
  const modelos = mapaDe(modelo());
  const valor = { filas: [[c('a'), c('b')], [c('c'), c('d')]] };
  for (const [op, args] of [
    ['anadir-columna', { despuesDe: 0 }], ['quitar-columna', { columna: 0 }],
    ['anadir-fila', {}], ['quitar-fila', { fila: 0 }],
    ['texto', { fila: 0, columna: 0, valor: 'z' }], ['negrita', { fila: 1, columna: 1, puesta: true }],
  ]) {
    const siguiente = Edicion.aplicar(valor, op, args, { campo: CAMPO, modelos });
    assert.strictEqual(Est.motivoDeCampo(CAMPO, siguiente, { modelos }), null,
      `${op} deja un valor que la puerta rechaza: ${Est.motivoDeCampo(CAMPO, siguiente, { modelos })}`);
  }
});

prueba('una tabla con estructura no tiene cabecera propia: sus rotulos no estan entre sus celdas', () => {
  const modelos = mapaDe(modelo());
  const valor = { filas: [[c('a', { bold: true }), c('b', { bold: true })]] };
  // Sin modelos, la primera fila entera en negrita es la cabecera, como siempre.
  assert.strictEqual(Edicion.tieneCabecera(valor, CAMPO_SIN_MODELO), true);
  // Con estructura, lo guardado es solo contenido: tratarlo como cabecera lo sombrearia en la
  // pantalla y no en el papel.
  assert.strictEqual(Edicion.tieneCabecera(valor, CAMPO, modelos), false);
  assert.strictEqual(Edicion.fondoEfectivo(valor, 0, 0, CAMPO, modelos), 'etiqueta');
  assert.strictEqual(Edicion.fondoEfectivo(valor, 0, 0, CAMPO_SIN_MODELO), 'cabecera');
});

// ---------------------------------------------------------------- 7. los tres consumidores

// Un documento de una sola tabla, para comparar las tres salidas sobre el mismo valor.
const unaTablaCon = (campo, valor) => ({
  plantilla: {
    generada: '2026-01-01T00:00:00.000Z',
    secciones: [{ id: 's1', titulo: 'Las actividades', nivel: 1, hijos: [], campos: [campo] }],
  },
  datos: { documento: { s1: { [campo.id]: valor } }, instancias: [] },
});

// Las filas de la tabla que el PDF imprime: la unica con `table` dentro del cuerpo.
function filasDelPdf(plantilla, datos) {
  const def = buildDocDefinition({ plantilla, datos, instancias: 'todas', titulo: 'T' });
  const tablas = [];
  (function recorrer(x) {
    if (Array.isArray(x)) { x.forEach(recorrer); return; }
    if (!x || typeof x !== 'object') return;
    if (x.table) tablas.push(x.table);
    Object.keys(x).forEach((k) => recorrer(x[k]));
  })(def.content.slice(7));
  assert.strictEqual(tablas.length, 1, 'se esperaba una sola tabla en el cuerpo');
  return { filas: tablas[0].body.map((f) => f.map((y) => String(y.text == null ? '' : y.text))), tabla: tablas[0] };
}

const ENTIDADES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };
const desescapar = (t) => t.replace(/&(?:amp|lt|gt|quot|apos);/g, (e) => ENTIDADES[e]);

// Las filas de la tabla del Word, leidas del document.xml: una fila por `<w:tr>` y el texto de cada
// `<w:tc>` junto.
async function filasDelWord(plantilla, datos) {
  const zip = await JSZip.loadAsync(await exportarDocx({ plantilla, datos }));
  const xml = await zip.file('word/document.xml').async('string');
  return [...xml.matchAll(/<w:tr>([\s\S]*?)<\/w:tr>/g)].map((fila) => [...fila[1].matchAll(/<w:tc>([\s\S]*?)<\/w:tc>/g)]
    .map((celda) => desescapar([...celda[1].matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((t) => t[1]).join('\n'))));
}

prueba('el PDF, el Word y el editor pintan la MISMA tabla de un valor con modelo', async () => {
  const m = modelo({
    partes: [
      { id: 'p-que', etiqueta: 'Actividad', ancho: 3 },
      { id: 'p-oculta', etiqueta: 'No se imprime', ancho: 2, retirado: true },
      { id: 'p-ses', etiqueta: 'Sesiones', ancho: 1 },
    ],
  });
  const plantillaConModelos = (base) => ({ ...base.plantilla, modelos: mapaDe(m) });
  const valor = { filas: [[c('Exposicion'), c('SECRETO-RETIRADA'), c('4')], [c('Practica'), c('tampoco'), c('6')]] };
  const base = unaTablaCon(CAMPO, valor);
  const plantilla = plantillaConModelos(base);

  const esperado = [['Actividad', 'Sesiones'], ['Exposicion', '4'], ['Practica', '6']];

  const pdf = filasDelPdf(plantilla, base.datos);
  assert.deepStrictEqual(pdf.filas, esperado, 'el PDF no pinta la tabla del modelo');
  assert.strictEqual(pdf.tabla.headerRows, 1, 'la fila de los rotulos es la cabecera que se repite');

  const word = await filasDelWord(plantilla, base.datos);
  assert.deepStrictEqual(word, esperado, 'el Word no pinta la tabla del modelo');

  const editor = Edicion.paraPintar(valor, CAMPO, mapaDe(m));
  assert.deepStrictEqual(textosDeFilas(editor.filas), esperado, 'el editor no pinta la tabla del modelo');
  assert.strictEqual(editor.cabecera, true);

  // Lo escrito en la parte retirada no se imprime en ninguna de las tres salidas, y sigue guardado.
  for (const salida of [pdf.filas, word, textosDeFilas(editor.filas)]) {
    assert.ok(!JSON.stringify(salida).includes('SECRETO-RETIRADA'), 'sale el contenido de la parte retirada');
  }
  assert.strictEqual(valor.filas[0][1].text, 'SECRETO-RETIRADA', 'retirar no borra');
});

prueba('el PDF, el Word y el editor pintan la MISMA tabla de clave y valor con modelo', async () => {
  const m = modelo({
    id: 'm-kv', tipo: 'tabla_clave_valor', sentido: 'filas',
    partes: [{ id: 'a', etiqueta: 'Ciclo' }, { id: 'b', etiqueta: 'Oculta', retirado: true }, { id: 'd', etiqueta: 'Curso' }],
  });
  const campo = { id: 'ficha', tipo: 'tabla_clave_valor', etiqueta: 'Ficha', modelo: 'm-kv' };
  const valor = { pares: [{ etiqueta: 'lo que sea', valor: 'DAW' }, { etiqueta: 'x', valor: 'SECRETO-KV' }, { etiqueta: 'y', valor: '2026-27' }] };
  const base = unaTablaCon(campo, valor);
  const plantilla = { ...base.plantilla, modelos: mapaDe(m) };

  const esperado = [['Ciclo', 'DAW'], ['Curso', '2026-27']];
  assert.deepStrictEqual(filasDelPdf(plantilla, base.datos).filas, esperado);
  assert.deepStrictEqual(await filasDelWord(plantilla, base.datos), esperado);
  assert.deepStrictEqual(textosDeFilas(Edicion.paraPintar(valor, campo, mapaDe(m)).filas), esperado);
});

prueba('con los rotulos a lo alto, las tres salidas coinciden tambien', async () => {
  const m = modelo({ sentido: 'filas', partes: [{ id: 'a', etiqueta: 'Codigo' }, { id: 'b', etiqueta: 'Horas' }] });
  const valor = { filas: [[c('0614')], [c('160')]] };
  const base = unaTablaCon(CAMPO, valor);
  const plantilla = { ...base.plantilla, modelos: mapaDe(m) };

  const esperado = [['Codigo', '0614'], ['Horas', '160']];
  const pdf = filasDelPdf(plantilla, base.datos);
  assert.deepStrictEqual(pdf.filas, esperado);
  assert.strictEqual(pdf.tabla.headerRows, 0);
  assert.deepStrictEqual(await filasDelWord(plantilla, base.datos), esperado);
  assert.deepStrictEqual(textosDeFilas(Edicion.paraPintar(valor, CAMPO, mapaDe(m)).filas), esperado);
});

// ---------------------------------------------------------------- 7 bis. lo que no puede pasar

prueba('una tabla con TODAS sus partes retiradas no imprime nada, y el PDF se genera', async () => {
  // Retirar la ultima parte que quedaba deja la tabla asi. Lo que saldria si se pintara es una fila
  // de cero celdas: pdfmake no sabe colocarla y revienta la generacion del tomo entero, y el Word la
  // omite sin decir nada, asi que las dos salidas dirian cosas distintas de la misma tabla. Por eso
  // esta prueba genera el PDF de verdad: sobre la definicion sola, el fallo no se veia.
  const m = modelo({ partes: [{ id: 'a', etiqueta: 'A', retirado: true }, { id: 'b', etiqueta: 'B', retirado: true }] });
  const valor = { filas: [[c('SECRETO-UNO'), c('SECRETO-DOS')]] };
  const base = unaTablaCon(CAMPO, valor);
  const plantilla = { ...base.plantilla, modelos: mapaDe(m) };

  const t = MT.tablaVigente(CAMPO, valor, mapaDe(m), false);
  assert.deepStrictEqual(t.filas, [], 'una tabla sin ninguna parte vigente no tiene filas');

  const def = buildDocDefinition({ plantilla, datos: base.datos, instancias: 'todas', titulo: 'T' });
  const textos = JSON.stringify(def.content.slice(7));
  assert.ok(textos.includes('(tabla vac'), 'el PDF no dice que la tabla esta vacia: ' + textos);
  assert.ok(!textos.includes('SECRETO'), 'sale el contenido de las partes retiradas');

  // El PDF de verdad, con pdfmake, que es donde estaba el fallo.
  const PdfPrinter = require('pdfmake');
  const fuentes = require('../motor/fonts');
  const bytes = await new Promise((res, rej) => {
    try {
      const doc = new PdfPrinter(fuentes).createPdfKitDocument(def);
      let n = 0;
      doc.on('data', (d) => { n += d.length; });
      doc.on('end', () => res(n));
      doc.on('error', rej);
      doc.end();
    } catch (e) { rej(e); }
  });
  assert.ok(bytes > 1000, 'el PDF ha salido vacio');

  // Y el Word tampoco escribe la tabla, pero sin discrepar: las dos salidas la omiten.
  assert.deepStrictEqual(await filasDelWord(plantilla, base.datos), []);
  // Lo escrito sigue guardado y vuelve al restaurar una parte.
  assert.strictEqual(valor.filas[0][0].text, 'SECRETO-UNO');
});

prueba('una fila nueva de una tabla con estructura nace con una celda por parte', () => {
  // `aplicar` promete devolver un valor que pasa la puerta. Si la fila naciera con el ancho de la
  // tabla (0 en una que se ha quedado sin filas) o con el que recuerda el editor, no cuadraria con la
  // estructura y el boton daria un 400.
  const m = modelo({ partes: [{ id: 'a', etiqueta: 'A' }, { id: 'b', etiqueta: 'B', retirado: true }, { id: 'd', etiqueta: 'D' }] });
  const modelos = mapaDe(m);
  const pasa = (v) => assert.strictEqual(Est.motivoDeCampo(CAMPO, v, { modelos }), null,
    'la puerta rechaza lo que ha salido del editor: ' + Est.motivoDeCampo(CAMPO, v, { modelos }));

  // Desde una tabla sin filas, y con un ancho recordado que dice otra cosa.
  let v = Edicion.aplicar({ filas: [] }, 'anadir-fila', {}, { campo: CAMPO, modelos, columnas: 7 });
  assert.strictEqual(v.filas[0].length, 3, 'las partes retiradas tambien cuentan: su hueco sigue ahi');
  pasa(v);

  // Y la cadena entera con operaciones permitidas: quitar la ultima fila y volver a anadir una.
  v = Edicion.aplicar(v, 'quitar-fila', { fila: 0 }, { campo: CAMPO, modelos });
  assert.deepStrictEqual(v.filas, []);
  pasa(v);
  v = Edicion.aplicar(v, 'anadir-fila', {}, { campo: CAMPO, modelos });
  assert.strictEqual(v.filas[0].length, 3);
  pasa(v);

  // Sin estructura, la fila nace como siempre: con el ancho de la tabla o con el recordado.
  const libre = Edicion.aplicar({ filas: [] }, 'anadir-fila', {}, { campo: CAMPO_SIN_MODELO, columnas: 7 });
  assert.strictEqual(libre.filas[0].length, 7);
});

prueba('una estructura propia se mide con el sentido EN VIGOR, no con el de omision de su tipo', () => {
  // `valor.estructura` guarda las partes y no el sentido, asi que el sentido es el del modelo al que
  // apunta el campo. Medirla con el de omision aceptaria unos anchos que luego reparten las columnas
  // que no son, y rechazaria por «el maximo son 12» una estructura de veinte filas que cabe de sobra.
  const aLoAlto = mapaDe(modelo({ sentido: 'filas', partes: [{ id: 'z', etiqueta: 'Z' }] }));
  assert.strictEqual(MT.sentidoVigente(CAMPO, aLoAlto), 'filas');
  assert.strictEqual(MT.sentidoVigente(CAMPO_SIN_MODELO, aLoAlto), 'columnas', 'sin modelo, el de omision del tipo');

  const conAncho = { estructura: { partes: [{ id: 'a', etiqueta: 'A', ancho: 3 }] }, filas: [[c('x')]] };
  const m = Est.motivoDeCampo(CAMPO, conAncho, { modelos: aLoAlto });
  assert.ok(m && m.includes('ancho'), 'se ha aceptado un ancho en una parte que es una fila: ' + m);
  // Y el mismo valor, con el modelo a lo ancho, se guarda.
  assert.strictEqual(Est.motivoDeCampo(CAMPO, conAncho, { modelos: mapaDe(modelo()) }), null);

  const veinte = { estructura: { partes: Array.from({ length: 20 }, (_, i) => ({ id: 'p' + i, etiqueta: 'P' })) }, filas: [] };
  assert.strictEqual(Est.motivoDeCampo(CAMPO, veinte, { modelos: aLoAlto }), null, 'veinte filas caben de sobra');
  const aLoAncho = Est.motivoDeCampo(CAMPO, veinte, { modelos: mapaDe(modelo()) });
  assert.ok(aLoAncho && aLoAncho.includes(String(MT.MAX_PARTES_ANCHO)), aLoAncho);
});

// ---------------------------------------------------------------- 8. LA PUERTA DE ACEPTACION

prueba('sin modelo y sin estructura, el PDF sale byte a byte como antes de que el modelo existiera', () => {
  // `ORO.pdf` es el cuerpo de la definicion de pdfmake congelado con el motor de 59dbb81, sobre un
  // documento que pasa por todas las ramas de tabla: importada con cabecera declarada, importada con
  // cabecera en negrita, creada aqui, con anchos y celdas combinadas y todo el estilo por celda, una
  // lista de tablas, una tabla vacia, un campo sin valor, clave y valor en pares, clave y valor
  // importada con filas y pares, la de RA y CE con y sin RA leidos, la ficha de modulo, las tres
  // rejillas de la plantilla, el resumen importado y las tablas de los dos modulos.
  const def = buildDocDefinition({ plantilla: ORO.plantilla, datos: ORO.datos, instancias: 'todas', titulo: 'Congelado' });
  // Se pasa por JSON porque es como se congelo: la portada, que lleva la fecha del dia, se salta.
  assert.deepStrictEqual(JSON.parse(JSON.stringify(def.content.slice(ORO.saltoPortada))), ORO.pdf);
  assert.ok(ORO.pdf.length > 10, 'el congelado esta vacio: la prueba no probaria nada');
});

prueba('sin modelo y sin estructura, el .docx sale con los MISMOS BYTES que antes', async () => {
  const buffer = await exportarDocx({ plantilla: ORO.plantilla, datos: ORO.datos, titulo: 'Congelado' });
  const zip = await JSZip.loadAsync(buffer);
  // Primero el document.xml, que es lo que esta pieza podria haber cambiado y lo que se puede leer
  // cuando falle; despues el fichero entero, que se puede comparar por su huella porque el zip lleva
  // la fecha fija a proposito (motor/exportar-docx.js).
  assert.strictEqual(await zip.file('word/document.xml').async('string'), ORO.docxXml);
  assert.strictEqual(crypto.createHash('sha256').update(buffer).digest('hex'), ORO.docxSha256);
});

prueba('sin estructura, la regla devuelve LO MISMO que recibe y no copia nada', () => {
  // Es el porque de que el PDF y el Word salgan iguales, dicho sobre la propia regla: los motores
  // reciben los mismos objetos que habia en el valor, no copias que pudieran diferir en algo.
  const valor = { filas: [[c('x')]], anchos: [1], pares: [{ etiqueta: 'a', valor: 'b' }] };
  const t = MT.tablaVigente(CAMPO_SIN_MODELO, valor, undefined, 'la de siempre');
  assert.strictEqual(t.filas, valor.filas);
  assert.strictEqual(t.anchos, valor.anchos);
  assert.strictEqual(t.cabecera, 'la de siempre', 'la cabecera que recibe es la que devuelve');
  assert.strictEqual(t.estructura, null);
  assert.strictEqual(MT.paresVigentes(CAMPO_SIN_MODELO, valor, undefined).pares, valor.pares);
});

// ---------------------------------------------------------------- 9. los modelos llegan desde la plantilla

// Un documento de verdad en el almacen de memoria, con su sesion abierta, para comprobar que
// `plantilla.modelos` llega desde el documento hasta la puerta. Mismo arnes que test/edicion.js: las
// rutas se llaman con un `Request` normal, sin levantar Next, sin red y sin base de datos.
async function enLaRuta(modelos) {
  const { crearRepositorio } = require('../repositorio');
  const memoria = require('../repositorio/memoria');
  const { aFilas } = require('../core/documento');
  const { COOKIE_SESION, abrirSesion } = require('../app/_lib/sesion');
  const Apartado = require('../app/_lib/rutas/apartado');

  const repo = crearRepositorio({ adaptador: memoria.crear() });
  repo.enMemoria = true;
  globalThis.__pccf_repositorio__ = repo;

  const jefa = await repo.usuarios.crear({ nombre: 'Jefatura', email: 'jefa@ejemplo.invalid', rol: 'jefe_departamento', departamento: 'informatica' });
  const { testigo } = await abrirSesion(repo, jefa._id);

  const plantilla = {
    generada: '2026-01-01T00:00:00.000Z',
    modelos,
    secciones: [{ id: 's1', titulo: 'Las actividades', nivel: 1, edita: 'jefe_departamento', presencia: 1, hijos: [], campos: [CAMPO] }],
  };
  const filas = aFilas({ plantilla, datos: { departamento: 'informatica', documento: {}, instancias: [], asignaciones: {}, compartidos: {} } },
    { curso: '2026-27', departamento: 'informatica' });
  const doc = await repo.documentos.crear(filas.documento);
  if (filas.apartados.length) await repo.apartados.crearMuchos(doc._id, filas.apartados);

  const camino = `/api/documentos/${doc._id}/apartado?seccion=s1`;
  const peticion = (metodo, cuerpo) => new Request(`http://pruebas.local${camino}`, {
    method: metodo,
    headers: Object.assign({ cookie: `${COOKIE_SESION}=${testigo}` }, cuerpo ? { 'content-type': 'application/json' } : {}),
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });

  // Lee antes de escribir y manda la version con la que leyo, que es lo que hace el cliente
  // (docs/api.md, `esperaUpdatedAt`).
  const guardar = async (valores) => {
    const antes = await (await Apartado.GET(peticion('GET'), { id: String(doc._id) })).json();
    return Apartado.PATCH(peticion('PATCH', { valores, esperaUpdatedAt: antes.updatedAt }), { id: String(doc._id) });
  };
  return { repo, doc, guardar };
}

prueba('la ruta del apartado le pasa los modelos de la plantilla a la puerta', async () => {
  const { repo, doc, guardar } = await enLaRuta(mapaDe(modelo()));

  // La tabla que cuadra con el modelo se guarda.
  const bien = await guardar({ actividades: { filas: [[c('Exposicion'), c('4')]] } });
  assert.strictEqual(bien.status, 200, JSON.stringify(await bien.json()));

  // Y la que no, se rechaza con el motivo de la regla: eso solo puede pasar si `plantilla.modelos`
  // ha llegado de verdad hasta la puerta.
  const mal = await guardar({ actividades: { filas: [[c('Exposicion')]] } });
  assert.strictEqual(mal.status, 400);
  const cuerpo = await mal.json();
  assert.ok(cuerpo.mensaje.includes('parte por parte'), cuerpo.mensaje);

  // Lo guardado sigue siendo lo de antes: una peticion rechazada no deja nada escrito.
  const fila = await repo.apartados.leer(doc._id, 's1', null);
  assert.deepStrictEqual(fila.valores.actividades.filas[0].map((x) => x.text), ['Exposicion', '4']);
});

prueba('un modelo torcido en la plantilla se dice al guardar, no al generar el tomo', async () => {
  // La parte sin id es lo que deja a medias quien escribe en la base de datos a mano, y un modelo
  // torcido es una tabla que deja de pintarse y de imprimirse: se dice donde hay a quien decirselo.
  const { guardar } = await enLaRuta(mapaDe(modelo({ partes: [{ etiqueta: 'Sin id' }] })));
  const respuesta = await guardar({ actividades: { filas: [] } });
  assert.strictEqual(respuesta.status, 400);
  const cuerpo = await respuesta.json();
  assert.ok(cuerpo.mensaje.includes('modelos de tabla'), cuerpo.mensaje);
});

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
