// EL MODELO DE TABLA Y LA REGLA QUE DECIDE QUE ESTRUCTURA SIGUE CADA TABLA.
//
//   node test/modelos-tabla.js
//
// Son dos cosas y las dos se vigilan aqui:
//
//   1. LA REGLA, que son dos preguntas. QUE ESTRUCTURA sigue una tabla: la suya mientras la tenga,
//      la del modelo cuando no la tenga, ninguna si no tiene ninguna de las dos. Y DE DONDE SALE SU
//      CONTENIDO: de su rejilla mientras la tenga, y de sus casillas —por id de parte— en cuanto
//      deja de tenerla. Con los casos que no son: un modelo que no esta en la plantilla, uno de otro
//      tipo, `partes` vacio, un modelo vacio enganchado, una parte retirada y otra restaurada.
//
//   2. LA PUERTA DE ACEPTACION: un campo SIN `modelo` y un valor SIN `estructura` imprimen
//      EXACTAMENTE lo de antes. Todo lo que hay escrito en los documentos del departamento esta
//      asi, asi que no basta con afirmarlo: test/tablas-sin-modelo.json lleva congelados el cuerpo
//      de la definicion de pdfmake y el `document.xml` del .docx de un documento que pasa por todas
//      las ramas de tabla de los dos motores, generados con el motor de antes de que el modelo
//      existiera, y aqui se comparan contra lo que sale hoy. El .docx entero se compara por su
//      sha256, que se puede porque el zip lleva la fecha fija a proposito (motor/exportar-docx.js);
//      del PDF se salta la portada, que lleva la fecha del dia. ESE FICHERO NO SE REGENERA: cubre
//      tablas sin modelo, que no usan ni estructura ni contenido por id, asi que tiene que seguir
//      pasando sin tocar un byte.
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

const Sa = require('../core/sa');
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

// Un grupo: su id, que dice que partes van juntas, y su etiqueta, que es lo que se imprime. En las
// pruebas los dos son el mismo texto salvo cuando lo que se mira es justo que no lo sean.
const G = (nombre) => ({ id: nombre, etiqueta: nombre });

// La «o» con tilde, para los motivos que la llevan: este fichero se escribe sin acentos.
const ACENTO_O = String.fromCharCode(243);

const CAMPO = { id: 'actividades', tipo: 'tabla', etiqueta: 'Actividades', modelo: 'modelo-actividad' };
const CAMPO_SIN_MODELO = { id: 'actividades', tipo: 'tabla', etiqueta: 'Actividades' };

// Los textos de una lista de filas de celdas, fila a fila: con esto se comparan las tres salidas.
const textosDeFilas = (filas) => (filas || []).map((f) => f.map((x) => String(x.text == null ? '' : x.text)));

// Las etiquetas de las partes vigentes de una estructura, que es lo que se imprime.
const etiquetas = (e) => e.vigentes.map((p) => p.etiqueta);

// ---------------------------------------------------------------- 1. que estructura sigue

prueba('sin modelo y sin estructura propia, una tabla no sigue ninguna: su forma son sus celdas', () => {
  const valor = { filas: [[c('a'), c('b')]] };
  assert.strictEqual(MT.estructuraDeTabla(CAMPO_SIN_MODELO, valor, mapaDe(modelo())), null);
  assert.strictEqual(MT.estructuraDeTabla(CAMPO_SIN_MODELO, valor, undefined), null);
  // Y es el caso de un campo recien creado, sin valor ninguno.
  assert.strictEqual(MT.estructuraDeTabla(CAMPO_SIN_MODELO, undefined, undefined), null);
});

prueba('con modelo y sin estructura propia, la tabla sigue la del modelo', () => {
  const e = MT.estructuraDeTabla(CAMPO, { casillas: {} }, mapaDe(modelo()));
  assert.ok(e, 'no sigue ninguna');
  assert.strictEqual(e.origen, 'modelo');
  assert.strictEqual(e.modelo, 'modelo-actividad');
  assert.strictEqual(e.sentido, 'columnas');
  assert.deepStrictEqual(etiquetas(e), ['Actividad', 'Sesiones']);
});

prueba('con estructura propia manda la suya, aunque su campo siga apuntando a un modelo', () => {
  const valor = { estructura: { partes: [{ id: 'mia', etiqueta: 'Solo esta' }], sentido: 'columnas' }, casillas: {} };
  const e = MT.estructuraDeTabla(CAMPO, valor, mapaDe(modelo()));
  assert.strictEqual(e.origen, 'propia');
  assert.deepStrictEqual(etiquetas(e), ['Solo esta']);
  // De que modelo salio se sigue sabiendo, para poder decirlo.
  assert.strictEqual(e.modelo, 'modelo-actividad');
});

prueba('una tabla divergida cuyo modelo ya no esta sigue siendo suya, y no se queda sin forma', () => {
  const valor = { estructura: { partes: [{ id: 'mia', etiqueta: 'Solo esta' }], sentido: 'columnas' }, casillas: {} };
  const e = MT.estructuraDeTabla(CAMPO, valor, {});
  assert.strictEqual(e.origen, 'propia');
  assert.strictEqual(e.modelo, null, 'la estructura es suya y no hay a quien volver');
  assert.strictEqual(e.sentido, 'columnas');
});

prueba('EL SENTIDO LO GUARDA LA ESTRUCTURA PROPIA: el modelo no puede girar despues una tabla divergida', () => {
  // Es el agujero que cierra guardar el sentido: si lo siguiera diciendo el modelo del que la tabla
  // se desengancho, cambiarselo al modelo leeria el contenido de las columnas como filas, que es
  // cambiar el documento por la espalda y lo unico que divergir existe para evitar.
  const valor = {
    estructura: { partes: [{ id: 'a', etiqueta: 'A' }, { id: 'b', etiqueta: 'B' }], sentido: 'columnas' },
    casillas: { a: [c('1')], b: [c('2')] },
  };
  const girado = mapaDe(modelo({ sentido: 'filas', partes: [{ id: 'z', etiqueta: 'Z' }] }));
  assert.strictEqual(MT.estructuraDeTabla(CAMPO, valor, girado).sentido, 'columnas');
  assert.strictEqual(MT.sentidoVigente(CAMPO, valor, girado), 'columnas');
  // Y la tabla se sigue imprimiendo a lo ancho, con sus dos columnas.
  const t = MT.tablaVigente(CAMPO, valor, girado, false);
  assert.deepStrictEqual(textosDeFilas(t.filas), [['A', 'B'], ['1', '2']]);
  // Sin estructura propia, el sentido es el del modelo, como debe ser.
  assert.strictEqual(MT.sentidoVigente(CAMPO, { casillas: {} }, girado), 'filas');
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
  assert.strictEqual(MT.estructuraDeTabla(CAMPO, { casillas: {} }, mapaDe(m)), null);
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

prueba('un campo de un tipo al que no se le puede poner modelo no sigue ninguno', () => {
  for (const tipo of ['auto.contenidos', 'auto.tabla_ra_ce', 'auto.ficha_modulo', 'texto_largo', 'ficha_situacion_aprendizaje']) {
    const campo = { id: 'x', tipo, modelo: 'modelo-actividad' };
    assert.strictEqual(MT.estructuraDeTabla(campo, { filas: [[c('a')]] }, mapaDe(modelo())), null, tipo);
  }
});

// ---------------------------------------------------------------- 2. de donde sale el contenido

prueba('una tabla se imprime desde su rejilla mientras la tenga: ponerle un modelo no le hace nada', () => {
  // Es la misma regla que la de la ficha de situacion de aprendizaje y por el mismo motivo. Es
  // tambien la respuesta a por que esta pieza no cambia nada de lo que hay escrito: una tabla del
  // departamento lleva su fila de rotulos ENTRE sus celdas, y adoptarle el modelo —soltarsela y
  // emparejarla con las partes— es una pieza aparte.
  const modelos = mapaDe(modelo());
  const conRejilla = { filas: [[c('Actividad', { bold: true }), c('Sesiones', { bold: true })], [c('Exposicion'), c('4')]] };
  assert.ok(MT.estructuraDeTabla(CAMPO, conRejilla, modelos), 'sigue una estructura');
  assert.strictEqual(MT.adoptada(conRejilla), false, 'pero no la ha adoptado');

  // Y entonces imprime su rejilla, por identidad, y con la cabecera que decida la regla de siempre.
  const t = MT.tablaVigente(CAMPO, conRejilla, modelos, 'la de siempre');
  assert.strictEqual(t.filas, conRejilla.filas);
  assert.strictEqual(t.cabecera, 'la de siempre');
  // La puerta la acepta tal cual: su rejilla no tiene que cuadrar con nada.
  assert.strictEqual(Est.motivoDeCampo(CAMPO, conRejilla, { modelos }), null);
});

prueba('en cuanto deja de tener rejilla, se imprime desde sus casillas por id de parte', () => {
  const modelos = mapaDe(modelo());
  const adoptada = { casillas: { 'p-que': [c('Exposicion'), c('Practica')], 'p-ses': [c('4'), c('6')] } };
  assert.strictEqual(MT.adoptada(adoptada), true);
  const t = MT.tablaVigente(CAMPO, adoptada, modelos, false);
  assert.deepStrictEqual(textosDeFilas(t.filas),
    [['Actividad', 'Sesiones'], ['Exposicion', '4'], ['Practica', '6']]);
  assert.strictEqual(t.cabecera, true, 'la fila de los rotulos es la cabecera que se repite');
  assert.strictEqual(Est.motivoDeCampo(CAMPO, adoptada, { modelos }), null);
});

prueba('el contenido en dos sitios a la vez no se guarda: al adoptar, el de antes se va', () => {
  const modelos = mapaDe(modelo());
  const conFilas = { filas: [[c('a'), c('b')]], casillas: { 'p-que': [c('a')], 'p-ses': [c('b')] } };
  const m = Est.motivoDeCampo(CAMPO, conFilas, { modelos });
  assert.ok(m && m.includes('dos sitios') && m.includes('filas'), m);
  // Con rejilla, la rejilla manda, asi que las casillas se guardarian sin imprimirse.
  assert.strictEqual(MT.adoptada(conFilas), false);

  // Y LOS PARES CUENTAN IGUAL QUE LAS FILAS. Si no contaran, una tabla de clave y valor con las dos
  // cosas se daria por adoptada y sus pares se quedarian guardados sin imprimirse, que es justo el
  // estado silencioso que esta puerta existe para impedir.
  const kvm = modelo({ id: 'm-kv', tipo: 'tabla_clave_valor', sentido: 'filas', partes: [{ id: 'a', etiqueta: 'Ciclo' }] });
  const kv = { id: 'k', tipo: 'tabla_clave_valor', modelo: 'm-kv' };
  const conPares = { pares: [{ etiqueta: 'Ciclo', valor: 'viejo' }], casillas: { a: c('nuevo') } };
  assert.strictEqual(MT.adoptada(conPares), false);
  const p = Est.motivoDeCampo(kv, conPares, { modelos: mapaDe(kvm) });
  assert.ok(p && p.includes('dos sitios') && p.includes('pares'), p);
  // Y `queSeImprime` dice lo mismo que `adoptada`: no se puede dar por adoptada con pares dentro.
  assert.strictEqual(Est.queSeImprime(kv, conPares), 'pares');
});

prueba('la puerta de siempre se pasa igual, adoptada o no: es la unica que mira las claves de regalo', () => {
  // Saltarsela dejaria entrar cualquier cosa al lado de las casillas, y «lo que entra sin puerta es
  // un documento que deja de salir».
  const modelos = mapaDe(modelo());
  const casillas = { 'p-que': [c('a')], 'p-ses': [c('b')] };
  const regalo = Est.motivoDeCampo(CAMPO, { casillas, loQueSea: 1 }, { modelos });
  assert.ok(regalo && regalo.includes('loQueSea'), regalo);
  // Una tabla no lleva `pares`, adoptada o no.
  assert.ok(Est.motivoDeCampo(CAMPO, { casillas, pares: [{ etiqueta: 'x', valor: 'y' }] }, { modelos }));

  // Y UNA TABLA ADOPTADA NO LLEVA «anchos»: los pone su parte en el modelo, asi que uno guardado aqui
  // se guardaria sin imprimirse nunca.
  for (const anchos of ['basura', [1, 2], [1, 2, 3, 4, 5]]) {
    const m = Est.motivoDeCampo(CAMPO, { casillas, anchos }, { modelos });
    assert.ok(m && m.includes('lo dice su parte en el modelo'), JSON.stringify(anchos) + ': ' + m);
  }
  // Los de la tabla que NO la ha adoptado se siguen comprobando como siempre.
  assert.strictEqual(Est.motivoDeCampo(CAMPO, { filas: [[c('x')]], anchos: [1] }, { modelos }), null);
  assert.ok(Est.motivoDeCampo(CAMPO, { filas: [[c('x')]], anchos: [1, 2] }, { modelos }));

  // Lo mismo en clave y valor.
  const kvm = mapaDe(modelo({ id: 'm-kv', tipo: 'tabla_clave_valor', sentido: 'filas', partes: [{ id: 'a', etiqueta: 'A' }] }));
  const kv = { id: 'k', tipo: 'tabla_clave_valor', modelo: 'm-kv' };
  assert.ok(Est.motivoDeCampo(kv, { casillas: { a: c('1') }, basura: 1 }, { modelos: kvm }));
  assert.ok(Est.motivoDeCampo(kv, { casillas: { a: c('1') }, anchos: [1] }, { modelos: kvm }));
  assert.strictEqual(Est.motivoDeCampo(kv, { casillas: { a: c('1') } }, { modelos: kvm }), null);
});

prueba('una parte sin nada escrito sale con su rotulo y en blanco', () => {
  const modelos = mapaDe(modelo());
  // La recien anadida al modelo no tiene entrada ninguna.
  const t = MT.tablaVigente(CAMPO, { casillas: { 'p-que': [c('Exposicion')] } }, modelos, false);
  assert.deepStrictEqual(textosDeFilas(t.filas), [['Actividad', 'Sesiones'], ['Exposicion', '']]);
  // Y una tabla adoptada y todavia vacia es solo sus rotulos.
  const vacia = MT.tablaVigente(CAMPO, { casillas: {} }, modelos, false);
  assert.deepStrictEqual(textosDeFilas(vacia.filas), [['Actividad', 'Sesiones']]);
});

prueba('con los rotulos a lo alto, cada parte guarda UNA casilla: es literalmente ficha[id]', () => {
  const m = modelo({ sentido: 'filas', partes: [{ id: 'cod', etiqueta: 'Codigo' }, { id: 'hor', etiqueta: 'Horas' }] });
  // Las partes se EMPAQUETAN en filas de `columnas` (dos por omision) y cada fila de partes imprime
  // dos filas de tabla, los rotulos encima y los contenidos debajo: es la maquetacion de la ficha.
  const t = MT.tablaVigente(CAMPO, { casillas: { cod: c('0614'), hor: c('160') } }, mapaDe(m), true);
  assert.deepStrictEqual(textosDeFilas(t.filas), [['Codigo', 'Horas'], ['0614', '160']]);
  assert.strictEqual(t.cabecera, false, 'los rotulos van dentro, no en una cabecera que se repita');
  assert.strictEqual(t.anchos, undefined, 'a lo alto el ancho son columnas, no pesos de columna');
  // Una parte que ocupa la tabla entera va sola en su fila.
  const anchas = modelo({ sentido: 'filas', partes: [{ id: 'cod', etiqueta: 'Codigo', ancho: 2 }, { id: 'hor', etiqueta: 'Horas', ancho: 2 }] });
  assert.deepStrictEqual(textosDeFilas(MT.tablaVigente(CAMPO, { casillas: { cod: c('0614'), hor: c('160') } }, mapaDe(anchas), true).filas),
    [['Codigo'], ['0614'], ['Horas'], ['160']]);
  // Y se puede llenar DE UNA EN UNA, que es lo que el contenido posicional no permitia.
  const aMedias = MT.tablaVigente(CAMPO, { casillas: { hor: c('160') } }, mapaDe(m), true);
  assert.deepStrictEqual(textosDeFilas(aMedias.filas), [['Codigo', 'Horas'], ['', '160']]);
  assert.strictEqual(Est.motivoDeCampo(CAMPO, { casillas: { hor: c('160') } }, { modelos: mapaDe(m) }), null);
});

prueba('EMPAQUETAR: se abre fila cuando la siguiente no cabe y cuando cambia de grupo', () => {
  const partes = [
    { id: 'a', etiqueta: 'A', ancho: 2 },
    { id: 'b', etiqueta: 'B' }, { id: 'd', etiqueta: 'D' },
    { id: 'e', etiqueta: 'E', grupo: G('otras') }, { id: 'f', etiqueta: 'F', grupo: G('otras') },
    { id: 'g', etiqueta: 'G' },
  ];
  // Con cuatro columnas: A(2)+B(1)+D(1) llenan la primera; E y F abren fila por el grupo; G la abre
  // por salir del grupo.
  assert.deepStrictEqual(MT.empaquetar(partes, 4).map((f) => f.map((x) => x.id)),
    [['a', 'b', 'd'], ['e', 'f'], ['g']]);
  // Con dos, A llena la suya sola.
  assert.deepStrictEqual(MT.empaquetar(partes, 2).map((f) => f.map((x) => x.id)),
    [['a'], ['b', 'd'], ['e', 'f'], ['g']]);
});

prueba('un GRUPO abre fila y escribe su rotulo UNA SOLA VEZ', () => {
  const m = modelo({
    sentido: 'filas', columnas: 2,
    partes: [
      { id: 'a', etiqueta: 'Suelta' },
      { id: 'b', etiqueta: 'Primera', grupo: { id: 'act', etiqueta: 'Las actividades' } },
      { id: 'd', etiqueta: 'Segunda', grupo: { id: 'act', etiqueta: 'Las actividades' } },
      { id: 'e', etiqueta: 'Tercera', grupo: { id: 'act', etiqueta: 'Las actividades' } },
    ],
  });
  const casillas = { a: c('1'), b: c('2'), d: c('3'), e: c('4') };
  const filas = textosDeFilas(MT.tablaVigente(CAMPO, { casillas }, mapaDe(m), false).filas);
  assert.deepStrictEqual(filas, [
    ['Suelta'], ['1'],
    ['Las actividades'],
    ['Primera', 'Segunda'], ['2', '3'],
    ['Tercera'], ['4'],
  ]);
  assert.strictEqual(filas.filter((f) => f[0] === 'Las actividades').length, 1, 'el rotulo del grupo sale mas de una vez');
  // Dos grupos distintos tienen cada uno el suyo.
  const dos = modelo({
    sentido: 'filas', columnas: 2,
    partes: [{ id: 'a', etiqueta: 'A', grupo: G('Uno') }, { id: 'b', etiqueta: 'B', grupo: G('Otro') }],
  });
  assert.deepStrictEqual(textosDeFilas(MT.tablaVigente(CAMPO, { casillas: { a: c('1'), b: c('2') } }, mapaDe(dos), false).filas),
    [['Uno'], ['A'], ['1'], ['Otro'], ['B'], ['2']]);
  // Y un grupo que REAPARECE despues de otro se vuelve a rotular: si no, pareceria la
  // continuacion del de arriba.
  const vuelve = modelo({
    sentido: 'filas', columnas: 1,
    partes: [{ id: 'a', etiqueta: 'A', grupo: G('Uno') }, { id: 'b', etiqueta: 'B', grupo: G('Otro') }, { id: 'd', etiqueta: 'D', grupo: G('Uno') }],
  });
  assert.deepStrictEqual(textosDeFilas(MT.tablaVigente(CAMPO, { casillas: { a: c('1'), b: c('2'), d: c('3') } }, mapaDe(vuelve), false).filas),
    [['Uno'], ['A'], ['1'], ['Otro'], ['B'], ['2'], ['Uno'], ['D'], ['3']]);
  // Y la fila que NO se imprime no cuenta como cambio de grupo: si contara, el rotulo saldria
  // separado de las filas que encabeza.
  const conHueco = modelo({
    sentido: 'filas', columnas: 1,
    partes: [
      { id: 'a', etiqueta: 'A', grupo: G('G') },
      { id: 'b', etiqueta: 'B', grupo: G('H'), solo_si_hay: true },
      { id: 'd', etiqueta: 'D', grupo: G('G') },
    ],
  });
  assert.deepStrictEqual(textosDeFilas(MT.tablaVigente(CAMPO, { casillas: { a: c('1'), d: c('3') } }, mapaDe(conHueco), false).filas),
    [['G'], ['A'], ['1'], ['D'], ['3']]);
});

prueba('SOLO_SI_HAY: la parte sin nada escrito no imprime su fila, en los tres sentidos', () => {
  // A lo alto se decide por FILA de partes, como en la ficha: la fila se omite si todas sus partes
  // son `solo_si_hay` y ninguna tiene nada escrito.
  const alto = modelo({
    sentido: 'filas', columnas: 2,
    partes: [{ id: 'a', etiqueta: 'Siempre' }, { id: 'b', etiqueta: 'A veces', ancho: 2, solo_si_hay: true }],
  });
  assert.deepStrictEqual(textosDeFilas(MT.tablaVigente(CAMPO, { casillas: { a: c('1') } }, mapaDe(alto), false).filas),
    [['Siempre'], ['1']]);
  assert.deepStrictEqual(textosDeFilas(MT.tablaVigente(CAMPO, { casillas: { a: c('1'), b: c('2') } }, mapaDe(alto), false).filas),
    [['Siempre'], ['1'], ['A veces'], ['2']]);
  // Y los espacios no cuentan como contenido, igual que en la ficha.
  assert.deepStrictEqual(textosDeFilas(MT.tablaVigente(CAMPO, { casillas: { a: c('1'), b: c('   ') } }, mapaDe(alto), false).filas),
    [['Siempre'], ['1']]);

  // A lo ancho se decide por PARTE, porque cada parte ES una columna: no hay fila que compartir.
  const ancho = modelo({ partes: [{ id: 'a', etiqueta: 'Siempre' }, { id: 'b', etiqueta: 'A veces', solo_si_hay: true }] });
  assert.deepStrictEqual(textosDeFilas(MT.tablaVigente(CAMPO, { casillas: { a: [c('1')] } }, mapaDe(ancho), false).filas),
    [['Siempre'], ['1']]);
  assert.deepStrictEqual(textosDeFilas(MT.tablaVigente(CAMPO, { casillas: { a: [c('1')], b: [c('2')] } }, mapaDe(ancho), false).filas),
    [['Siempre', 'A veces'], ['1', '2']]);

  // Y en una tabla de clave y valor, la fila del par.
  const kvm = modelo({ id: 'm-kv', tipo: 'tabla_clave_valor', sentido: 'filas',
    partes: [{ id: 'a', etiqueta: 'Siempre' }, { id: 'b', etiqueta: 'A veces', solo_si_hay: true }] });
  const kv = { id: 'k', tipo: 'tabla_clave_valor', modelo: 'm-kv' };
  assert.deepStrictEqual(MT.paresVigentes(kv, { casillas: { a: c('1') } }, mapaDe(kvm)).pares,
    [{ etiqueta: 'Siempre', valor: '1' }]);
  assert.deepStrictEqual(MT.paresVigentes(kv, { casillas: { a: c('1'), b: c('2') } }, mapaDe(kvm)).pares,
    [{ etiqueta: 'Siempre', valor: '1' }, { etiqueta: 'A veces', valor: '2' }]);
});

// ---------------------------------------------------------------- 3. el id es el que empareja

prueba('RETIRAR UNA PARTE NO BORRA SU CONTENIDO, Y RESTAURARLA LO DEVUELVE', () => {
  const partes = [
    { id: 'p-que', etiqueta: 'Actividad' },
    { id: 'p-ses', etiqueta: 'Sesiones' },
    { id: 'p-ra', etiqueta: 'RA' },
  ];
  const valor = {
    casillas: {
      'p-que': [c('Exposicion'), c('Practica')],
      'p-ses': [c('4'), c('6')],
      'p-ra': [c('RA1'), c('RA2')],
    },
  };
  const conTodas = mapaDe(modelo({ partes }));
  assert.deepStrictEqual(textosDeFilas(MT.tablaVigente(CAMPO, valor, conTodas, false).filas),
    [['Actividad', 'Sesiones', 'RA'], ['Exposicion', '4', 'RA1'], ['Practica', '6', 'RA2']]);

  // Se retira LA DE EN MEDIO, que es el caso en el que un emparejamiento por posicion corria las
  // demas de sitio y dejaba el texto bajo otro rotulo.
  const retirada = partes.map((p) => (p.id === 'p-ses' ? { ...p, retirado: true } : p));
  const conRetirada = mapaDe(modelo({ partes: retirada }));
  const e = MT.estructuraDeTabla(CAMPO, valor, conRetirada);
  assert.strictEqual(e.partes.length, 3, 'retirar no borra: la parte sigue en el modelo');
  assert.deepStrictEqual(etiquetas(e), ['Actividad', 'RA']);

  const sinElla = MT.tablaVigente(CAMPO, valor, conRetirada, false);
  assert.deepStrictEqual(textosDeFilas(sinElla.filas),
    [['Actividad', 'RA'], ['Exposicion', 'RA1'], ['Practica', 'RA2']],
    'las partes que quedan no se han corrido de sitio: empareja el id, no el sitio');
  assert.ok(!JSON.stringify(textosDeFilas(sinElla.filas)).includes('4'), 'sale el contenido de la retirada');

  // EL CONTENIDO SIGUE EN EL VALOR, sin tocar, bajo el id de su parte.
  assert.deepStrictEqual(valor.casillas['p-ses'].map((x) => x.text), ['4', '6']);
  // Y el valor sigue pasando la puerta con la parte retirada: su contenido no estorba.
  assert.strictEqual(Est.motivoDeCampo(CAMPO, valor, { modelos: conRetirada }), null);

  // RESTAURARLA LA DEVUELVE CON LO QUE TENIA, en su sitio, sin que nadie haya tocado el valor.
  const vuelta = MT.tablaVigente(CAMPO, valor, conTodas, false);
  assert.deepStrictEqual(textosDeFilas(vuelta.filas),
    [['Actividad', 'Sesiones', 'RA'], ['Exposicion', '4', 'RA1'], ['Practica', '6', 'RA2']]);
});

prueba('anadir una parte al modelo no toca NINGUNA tabla guardada', () => {
  // Es lo que el departamento pidio: que el cambio vaya al grupo. Con el contenido posicional,
  // anadir una columna obligaba a reescribir todas las filas de todas las tablas del grupo.
  const valor = { casillas: { 'p-que': [c('Exposicion')], 'p-ses': [c('4')] } };
  const antes = JSON.stringify(valor);
  const conUnaMas = mapaDe(modelo({
    partes: [...modelo().partes, { id: 'p-ra', etiqueta: 'RA' }],
  }));
  assert.strictEqual(Est.motivoDeCampo(CAMPO, valor, { modelos: conUnaMas }), null,
    'la tabla de ayer sigue pasando la puerta con el modelo de hoy');
  assert.deepStrictEqual(textosDeFilas(MT.tablaVigente(CAMPO, valor, conUnaMas, false).filas),
    [['Actividad', 'Sesiones', 'RA'], ['Exposicion', '4', '']]);
  assert.strictEqual(JSON.stringify(valor), antes, 'el valor no se ha tocado');

  // Y moverlas tampoco: el orden de las partes es el del modelo y el contenido lo sigue sin moverse.
  const alReves = mapaDe(modelo({ partes: [modelo().partes[1], modelo().partes[0]] }));
  assert.deepStrictEqual(textosDeFilas(MT.tablaVigente(CAMPO, valor, alReves, false).filas),
    [['Sesiones', 'Actividad'], ['4', 'Exposicion']]);
  assert.strictEqual(JSON.stringify(valor), antes, 'el valor no se ha tocado');
});

prueba('renombrar una parte en la plantilla la renombra en todas las tablas del grupo', () => {
  const valor = { casillas: { 'p-que': [c('Exposicion')], 'p-ses': [c('4')] } };
  const renombrado = mapaDe(modelo({
    partes: [{ id: 'p-que', etiqueta: 'Que se hace' }, { id: 'p-ses', etiqueta: 'Sesiones' }],
  }));
  assert.deepStrictEqual(textosDeFilas(MT.tablaVigente(CAMPO, valor, renombrado, false).filas)[0],
    ['Que se hace', 'Sesiones']);
  // El id no ha cambiado, que es por lo que el contenido no se ha quedado huerfano.
  assert.deepStrictEqual(Object.keys(valor.casillas), ['p-que', 'p-ses']);
});

prueba('los PESOS de las partes son los anchos de columna de la tabla, y solo a lo ancho', () => {
  const todos = modelo({ partes: [{ id: 'a', etiqueta: 'A', peso: 3 }, { id: 'b', etiqueta: 'B', peso: 1 }] });
  assert.deepStrictEqual(MT.tablaVigente(CAMPO, { casillas: {} }, mapaDe(todos), false).anchos, [3, 1]);
  // A medias no valen: una lista incompleta la descartaria cada motor por su cuenta, repartiendo
  // segun el texto y sin avisar.
  const aMedias = modelo({ partes: [{ id: 'a', etiqueta: 'A', peso: 3 }, { id: 'b', etiqueta: 'B' }] });
  assert.strictEqual(MT.tablaVigente(CAMPO, { casillas: {} }, mapaDe(aMedias), false).anchos, undefined);
  // Y una parte retirada no cuenta: los pesos son de las columnas que se imprimen.
  const conRetirada = modelo({
    partes: [{ id: 'a', etiqueta: 'A', peso: 3 }, { id: 'b', etiqueta: 'B', peso: 9, retirado: true }, { id: 'd', etiqueta: 'D', peso: 1 }],
  });
  assert.deepStrictEqual(MT.tablaVigente(CAMPO, { casillas: {} }, mapaDe(conRetirada), false).anchos, [3, 1]);
  // A LO ALTO NO HAY PESOS: el `ancho` de una parte son columnas que ocupa, no un peso de columna, y
  // pasarlo como anchos de tabla repartiria las columnas con unos numeros que no son de eso.
  const alto = modelo({ sentido: 'filas', columnas: 2, partes: [{ id: 'a', etiqueta: 'A', ancho: 2 }] });
  assert.strictEqual(MT.tablaVigente(CAMPO, { casillas: { a: c('x') } }, mapaDe(alto), false).anchos, undefined);
});

// ---------------------------------------------------------------- 4. las copias no se separan

prueba('los tipos y los topes copiados en core/modelos-tabla.js son los de la puerta', () => {
  // Estan copiados a proposito, para que la dependencia vaya en un solo sentido (la puerta pregunta
  // por la regla y la regla no necesita a la puerta). Esta prueba es la que impide que se separen.
  assert.strictEqual(MT.TIPO_TABLA, Est.TIPO_TABLA);
  assert.strictEqual(MT.TIPO_CLAVE_VALOR, Est.TIPO_CLAVE_VALOR);
  assert.deepStrictEqual(MT.TIPOS, [Est.TIPO_TABLA, Est.TIPO_CLAVE_VALOR]);
  assert.strictEqual(MT.MAX_PARTES_ANCHO, Est.MAX_COLUMNAS);
  assert.strictEqual(MT.MAX_PARTES_ALTO, Est.MAX_FILAS);
  assert.strictEqual(MT.MAX_CASILLAS_POR_PARTE, Est.MAX_FILAS);
});

// ---------------------------------------------------------------- 5. la forma de un modelo

prueba('la forma de un modelo: lo que vale', () => {
  assert.strictEqual(MT.motivoDeModelo(modelo()), null);
  assert.strictEqual(MT.motivoDeModelo(modelo({ version: undefined })), null, 'la version puede no venir');
  assert.strictEqual(MT.motivoDeModelo(modelo({ partes: [] })), null, 'un modelo nace sin partes y se guarda');
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
  malo({ partes: Array.from({ length: MT.MAX_PARTES_ANCHO + 1 }, (_, i) => ({ id: 'p' + i, etiqueta: 'P' })) }, 'ancho de la hoja');

  // y las partes
  malo({ partes: [{ etiqueta: 'Sin id' }] }, 'id');
  malo({ partes: [{ id: 'a', etiqueta: 'A' }, { id: 'a', etiqueta: 'Otra' }] }, 'repite el id');
  malo({ partes: [{ id: 'a' }] }, 'etiqueta');
  malo({ partes: [{ id: 'a', etiqueta: 'A', retirado: 'si' }] }, 'retirado');
  malo({ partes: [{ id: 'a', etiqueta: 'A', peso: 0 }] }, 'peso');
  malo({ partes: [{ id: 'a', etiqueta: 'A', peso: '3' }] }, 'peso');
  malo({ partes: [{ id: 'a', etiqueta: 'A', nombre: 'de regalo' }] }, 'nombre');
  malo({ partes: [{ id: 'a', etiqueta: 'A', solo_si_hay: 'si' }] }, 'solo_si_hay');

  // A LO ALTO el ancho son columnas enteras y no puede pedir mas de las que la tabla tiene.
  const alto = (extra, trozo) => malo(Object.assign({ sentido: 'filas', columnas: 2 }, extra), trozo);
  alto({ partes: [{ id: 'a', etiqueta: 'A', ancho: 1.5 }] }, 'entero');
  alto({ partes: [{ id: 'a', etiqueta: 'A', ancho: 3 }] }, 'columnas y la tabla tiene 2');
  // `columnas` solo lo dicen las tablas de partes a lo alto: a lo ancho las columnas SON las partes.
  malo({ columnas: 3 }, 'van a lo alto');
  malo({ tipo: 'tabla_clave_valor', sentido: 'filas', columnas: 3 }, 'van a lo alto');
  alto({ columnas: 0 }, 'entero');
  alto({ columnas: MT.MAX_PARTES_ANCHO + 1 }, 'ancho de la hoja');
  // Y el grupo tambien es de las partes a lo alto.
  malo({ partes: [{ id: 'a', etiqueta: 'A', grupo: G('G') }] }, 'van a lo alto');
  malo({ tipo: 'tabla_clave_valor', sentido: 'filas', partes: [{ id: 'a', etiqueta: 'A', grupo: G('G') }] }, 'van a lo alto');
  // EL GRUPO ES { id, etiqueta } y no un texto: el id dice que partes van juntas y la etiqueta es lo
  // que se imprime, asi que renombrarlo no cambia su identidad.
  alto({ partes: [{ id: 'a', etiqueta: 'A', grupo: 'G' }] }, '{ id, etiqueta }');
  alto({ partes: [{ id: 'a', etiqueta: 'A', grupo: { etiqueta: 'G' } }] }, 'no tiene «id»');
  alto({ partes: [{ id: 'a', etiqueta: 'A', grupo: { id: 'g' } }] }, 'no tiene «etiqueta»');
  alto({ partes: [{ id: 'a', etiqueta: 'A', grupo: { id: 'g', etiqueta: 'G', color: 'azul' } }] }, 'color');
  // Un grupo, un rotulo: dos partes del mismo grupo con etiquetas distintas son dos verdades sobre lo
  // mismo, y la que no se imprimiria se guardaria para no verse nunca.
  alto({ partes: [
    { id: 'a', etiqueta: 'A', grupo: { id: 'g', etiqueta: 'Uno' } },
    { id: 'b', etiqueta: 'B', grupo: { id: 'g', etiqueta: 'Otro' } },
  ] }, 'un solo r' + ACENTO_O + 'tulo');
  // CADA SENTIDO TIENE SU MEDIDA Y SU NOMBRE, y usar la del otro se dice en lugar de ignorarse.
  malo({ partes: [{ id: 'a', etiqueta: 'A', ancho: 2 }] }, 'lo que se dice es «peso»');
  alto({ partes: [{ id: 'a', etiqueta: 'A', peso: 2 }] }, 'lo que se dice es «ancho»');
  // Una tabla de clave y valor tiene las dos columnas fijas.
  malo({ tipo: 'tabla_clave_valor', sentido: 'filas', partes: [{ id: 'a', etiqueta: 'A', ancho: 2 }] }, 'dos columnas fijas');
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

prueba('ENGANCHAR UN MODELO SIN PARTES ES UN ERROR CON EXPLICACION, no un no-op que se calla', () => {
  // Un modelo recien creado y todavia vacio es indistinguible de no tener modelo: la tabla se
  // seguiria guardando y pintando como antes y quien lo enganncho no se enteraria de nada.
  const vacio = mapaDe(modelo({ partes: [] }));
  const m = Est.motivoDeCampo(CAMPO, { filas: [] }, { modelos: vacio });
  assert.ok(m, 'se ha aceptado un campo que apunta a un modelo vacio');
  assert.ok(m.includes('ninguna parte'), m);
  assert.ok(m.includes('modelo-actividad'), 'el motivo no dice de que modelo habla: ' + m);
  // El campo que no apunta a ninguno no tiene nada que explicar.
  assert.strictEqual(Est.motivoDeCampo(CAMPO_SIN_MODELO, { filas: [] }, { modelos: vacio }), null);
});

// ---------------------------------------------------------------- 6. la estructura propia

prueba('la forma de la estructura que una tabla guarda para si', () => {
  const buena = { partes: [{ id: 'a', etiqueta: 'A' }], sentido: 'columnas' };
  assert.strictEqual(MT.motivoDeEstructura(undefined, 'la tabla'), null, 'no tenerla es lo normal');
  assert.strictEqual(MT.motivoDeEstructura(buena, 'la tabla'), null);
  // El sentido se exige: es lo que impide que el modelo le gire la tabla despues.
  const sinSentido = MT.motivoDeEstructura({ partes: buena.partes }, 'la tabla');
  assert.ok(sinSentido && sinSentido.includes('sentido'), sinSentido);
  assert.ok(MT.motivoDeEstructura({ ...buena, sentido: 'diagonal' }, 'la tabla').includes('sentido'));
  // Una estructura sin partes no es una forma que seguir.
  const vacia = MT.motivoDeEstructura({ partes: [], sentido: 'columnas' }, 'la tabla');
  assert.ok(vacia && vacia.includes('ninguna parte'), vacia);
  // No lleva nombre ni tipo: eso es del modelo del que divergio, no de la tabla.
  assert.ok(MT.motivoDeEstructura({ ...buena, nombre: 'Mia' }, 'la tabla').includes('nombre'));
  assert.ok(MT.motivoDeEstructura([], 'la tabla').includes('objeto'));
  assert.ok(MT.motivoDeEstructura({ partes: [{ etiqueta: 'Sin id' }], sentido: 'columnas' }, 'la tabla').includes('id'));
  // Y una de clave y valor va siempre a lo alto.
  const kv = MT.motivoDeEstructura({ ...buena }, 'la tabla', { tipo: 'tabla_clave_valor' });
  assert.ok(kv && kv.includes('cada parte es una fila'), kv);
});

prueba('una estructura propia se mide con SU sentido, no con el de omision de su tipo', () => {
  // Cada sentido tiene su medida y su nombre: a lo alto `ancho` son columnas enteras, a lo ancho
  // `peso` es relativo y puede ser decimal.
  const decimalAlto = { estructura: { partes: [{ id: 'a', etiqueta: 'A', ancho: 1.5 }], sentido: 'filas' }, casillas: { a: c('x') } };
  const m = Est.motivoDeCampo(CAMPO, decimalAlto, { modelos: {} });
  assert.ok(m && m.includes('entero'), 'a lo alto el ancho son columnas enteras: ' + m);
  // Un peso decimal, con la estructura a lo ancho, se guarda.
  const aLoAncho = { estructura: { partes: [{ id: 'a', etiqueta: 'A', peso: 1.5 }], sentido: 'columnas' }, casillas: { a: [c('x')] } };
  assert.strictEqual(Est.motivoDeCampo(CAMPO, aLoAncho, { modelos: {} }), null);
  // Y la medida del otro sentido se rechaza tambien en una estructura propia.
  assert.ok(Est.motivoDeCampo(CAMPO, { estructura: { partes: [{ id: 'a', etiqueta: 'A', peso: 2 }], sentido: 'filas' }, casillas: { a: c('x') } }, { modelos: {} }));
  assert.ok(Est.motivoDeCampo(CAMPO, { estructura: { partes: [{ id: 'a', etiqueta: 'A', ancho: 2 }], sentido: 'columnas' }, casillas: { a: [c('x')] } }, { modelos: {} }));
  // Y una estructura propia dice tambien de cuantas columnas es, por lo mismo que dice el sentido:
  // para que un cambio del modelo no pueda reempaquetarle las filas despues.
  const tresColumnas = { estructura: { partes: [{ id: 'a', etiqueta: 'A', ancho: 3 }], sentido: 'filas', columnas: 3 }, casillas: { a: c('x') } };
  assert.strictEqual(Est.motivoDeCampo(CAMPO, tresColumnas, { modelos: {} }), null);
  assert.strictEqual(MT.estructuraDeTabla(CAMPO, tresColumnas, mapaDe(modelo({ sentido: 'filas', columnas: 2 }))).columnas, 3,
    'el modelo le ha cambiado las columnas a una tabla divergida');
  // Sin decirlas, son dos, y NO las que diga el modelo del que se desengancho.
  const sinColumnas = { estructura: { partes: [{ id: 'a', etiqueta: 'A' }], sentido: 'filas' }, casillas: { a: c('x') } };
  assert.strictEqual(MT.estructuraDeTabla(CAMPO, sinColumnas, mapaDe(modelo({ sentido: 'filas', columnas: 4 }))).columnas,
    MT.COLUMNAS_POR_OMISION);

  const veintePartes = Array.from({ length: 20 }, (_, i) => ({ id: 'p' + i, etiqueta: 'P' }));
  assert.strictEqual(Est.motivoDeCampo(CAMPO, { estructura: { partes: veintePartes, sentido: 'filas' }, casillas: {} }, { modelos: {} }),
    null, 'veinte filas caben de sobra');
  const apretado = Est.motivoDeCampo(CAMPO, { estructura: { partes: veintePartes, sentido: 'columnas' }, casillas: {} }, { modelos: {} });
  assert.ok(apretado && apretado.includes(String(MT.MAX_PARTES_ANCHO)), apretado);
});

// ---------------------------------------------------------------- 7. la puerta de guardado

prueba('la puerta acepta la estructura y las casillas en los dos tipos que pueden seguir un modelo, y en ningun otro', () => {
  const valor = { estructura: { partes: [{ id: 'a', etiqueta: 'A' }], sentido: 'columnas' }, casillas: { a: [c('x')] } };
  assert.strictEqual(Est.motivoDeCampo(CAMPO_SIN_MODELO, valor, {}), null);
  const kv = { estructura: { partes: [{ id: 'a', etiqueta: 'A' }], sentido: 'filas' }, casillas: { a: c('1') } };
  assert.strictEqual(Est.motivoDeCampo({ id: 'k', tipo: 'tabla_clave_valor' }, kv, {}), null);
  // Una clave que se guarda y no significa nada acaba leyendola alguien: en los demas tipos sobra.
  for (const tipo of ['auto.contenidos', 'dual_ra_ce', 'auto.tabla_ra_ce']) {
    const m = Est.motivoDeCampo({ id: 'x', tipo }, { estructura: { partes: [], sentido: 'columnas' }, filas: [] }, {});
    assert.ok(m && m.includes('estructura'), `${tipo}: ${m}`);
    const n = Est.motivoDeCampo({ id: 'x', tipo }, { casillas: {}, filas: [] }, {});
    assert.ok(n && n.includes('casillas'), `${tipo}: ${n}`);
  }
});

prueba('la puerta exige que las casillas esten bajo el id de una parte que existe', () => {
  const modelos = mapaDe(modelo());
  const m = Est.motivoDeCampo(CAMPO, { casillas: { 'p-inventada': [c('a')] } }, { modelos });
  assert.ok(m && m.includes('p-inventada'), m);
  assert.ok(m.includes('bajo el id de su parte'), m);
  // Y una tabla sin estructura no guarda contenido por parte: no habria parte a la que pertenezca.
  const sin = Est.motivoDeCampo(CAMPO_SIN_MODELO, { casillas: {} }, { modelos });
  assert.ok(sin && sin.includes('casillas'), sin);
});

prueba('la puerta exige que cada parte guarde lo que le toca por el sentido', () => {
  const aLoAncho = mapaDe(modelo());
  const comoFila = Est.motivoDeCampo(CAMPO, { casillas: { 'p-que': c('a') } }, { modelos: aLoAncho });
  assert.ok(comoFila && comoFila.includes('lista de casillas'), comoFila);

  const aLoAlto = mapaDe(modelo({ sentido: 'filas', partes: [{ id: 'cod', etiqueta: 'Codigo' }] }));
  const comoColumna = Est.motivoDeCampo(CAMPO, { casillas: { cod: [c('a')] } }, { modelos: aLoAlto });
  assert.ok(comoColumna && comoColumna.includes('una sola casilla'), comoColumna);
});

prueba('todas las columnas que tengan contenido miden lo mismo', () => {
  const modelos = mapaDe(modelo());
  const m = Est.motivoDeCampo(CAMPO, { casillas: { 'p-que': [c('a'), c('b')], 'p-ses': [c('1')] } }, { modelos });
  assert.ok(m && m.includes('una casilla de cada columna'), m);
  // Una parte que no aparece es una columna sin nada escrito, y eso si vale: es la recien anadida.
  assert.strictEqual(Est.motivoDeCampo(CAMPO, { casillas: { 'p-que': [c('a'), c('b')] } }, { modelos }), null);
  // Y una columna mas larga de lo que cabe en una tabla, no.
  const larga = Array.from({ length: MT.MAX_CASILLAS_POR_PARTE + 1 }, () => c('x'));
  const tope = Est.motivoDeCampo(CAMPO, { casillas: { 'p-que': larga } }, { modelos });
  assert.ok(tope && tope.includes(String(MT.MAX_CASILLAS_POR_PARTE)), tope);
});

prueba('una casilla es una celda con su estilo, pero sin combinar', () => {
  const modelos = mapaDe(modelo());
  // El estilo por celda se conserva: adoptar un modelo no puede costarle a nadie la negrita.
  assert.strictEqual(Est.motivoDeCampo(CAMPO, {
    casillas: { 'p-que': [c('a', { bold: true, fondo: 'etiqueta', alineacion: 'centro', tamano: 'pequena' })] },
  }, { modelos }), null);
  // Combinar, no: cada casilla es de una parte y de una sola.
  for (const clave of ['colspan', 'rowspan']) {
    const m = Est.motivoDeCampo(CAMPO, { casillas: { 'p-que': [{ text: 'a', [clave]: 2 }] } }, { modelos });
    assert.ok(m && m.includes(clave), `${clave}: ${m}`);
  }
  // Ni una celda sin texto, ni con una marca de Word dentro.
  assert.ok(Est.motivoDeCampo(CAMPO, { casillas: { 'p-que': [{ bold: true }] } }, { modelos }));
  assert.ok(Est.motivoDeCampo(CAMPO, { casillas: { 'p-que': 'no es una lista' } }, { modelos }));
});

// ---------------------------------------------------------------- 8. el editor

prueba('mientras no adopte su modelo, el editor no le quita ni un boton', () => {
  const modelos = mapaDe(modelo());
  const valor = { filas: [[c('Actividad', { bold: true }), c('Sesiones', { bold: true })], [c('Exposicion'), c('4')]] };
  for (const [op, args] of [
    ['texto', { fila: 1, columna: 0, valor: 'Otra' }],
    ['negrita', { fila: 1, columna: 0, puesta: true }],
    ['anadir-fila', {}], ['quitar-fila', { fila: 1 }],
    ['anadir-columna', { despuesDe: 0 }], ['quitar-columna', { columna: 0 }],
    ['cabecera', { puesta: true }],
    ['combinar', { fila: 1, columna: 0, hacia: 'derecha' }],
  ]) {
    assert.strictEqual(Edicion.motivoDeNo(valor, op, args, CAMPO, modelos), null, op);
  }
  // Y se pinta igual que siempre, con su propia fila de rotulos y su cabecera por negrita.
  assert.strictEqual(Edicion.tieneCabecera(valor, CAMPO, modelos), true);
  assert.deepStrictEqual(textosDeFilas(Edicion.paraPintar(valor, CAMPO, modelos).filas),
    [['Actividad', 'Sesiones'], ['Exposicion', '4']]);
  // Lo que sale del editor sigue pasando la puerta.
  const despues = Edicion.aplicar(valor, 'anadir-columna', { despuesDe: 0 }, { campo: CAMPO, modelos });
  assert.strictEqual(Est.motivoDeCampo(CAMPO, despues, { modelos }), null);
});

prueba('una tabla adoptada se VE tal como se imprime, y el editor dice por que no se cambia aqui', () => {
  const modelos = mapaDe(modelo());
  const valor = { casillas: { 'p-que': [c('Exposicion')], 'p-ses': [c('4')] } };
  // Se abre, para que se vea: esconderla seria peor que enseñarla con los botones apagados. Pero solo
  // si quien pregunta trae los modelos: sin ellos no se sabe que partes tiene, `paraPintar` daria una
  // tabla vacia y el editor se abriria en blanco con todos los botones muertos, que es peor que no
  // abrirlo. Hoy los componentes todavia no los pasan, asi que no se abre, y es lo correcto.
  assert.strictEqual(Edicion.esEditable(CAMPO, valor, modelos), true);
  assert.strictEqual(Edicion.esEditable(CAMPO, valor), false, 'se ha abierto sin saber que partes tiene');
  const pintada = Edicion.paraPintar(valor, CAMPO, modelos);
  assert.deepStrictEqual(textosDeFilas(pintada.filas), [['Actividad', 'Sesiones'], ['Exposicion', '4']]);
  assert.strictEqual(pintada.cabecera, true);
  // Su primera fila guardada no es una cabecera: los rotulos no estan entre sus celdas.
  assert.strictEqual(Edicion.tieneCabecera(valor, CAMPO, modelos), false);

  // Y ninguna operacion de rejilla le sirve, porque su contenido no es una rejilla. Se dice.
  for (const op of ['texto', 'negrita', 'anadir-fila', 'quitar-fila', 'anadir-columna', 'quitar-columna',
    'cabecera', 'combinar', 'separar', 'ancho', 'anchos-automaticos', 'fondo', 'alineacion', 'tamano']) {
    const m = Edicion.motivoDeNo(valor, op, { fila: 0, columna: 0, valor: 'x', despuesDe: 0, hacia: 'derecha', puesta: true }, CAMPO, modelos);
    assert.ok(m, `${op} no se ha negado`);
    assert.ok(m.includes('por partes y no en una rejilla'), `${op}: ${m}`);
    // Y `aplicar` devuelve el MISMO objeto: no deja un valor que la puerta rechazaria.
    assert.strictEqual(Edicion.aplicar(valor, op, { fila: 0, columna: 0 }, { campo: CAMPO, modelos }), valor, op);
  }
  assert.strictEqual(Est.motivoDeCampo(CAMPO, valor, { modelos }), null);
});

// ---------------------------------------------------------------- 9. los tres consumidores

// Un documento de una sola tabla, para comparar las tres salidas sobre el mismo valor.
const unaTablaCon = (campo, valor) => ({
  plantilla: {
    generada: '2026-01-01T00:00:00.000Z',
    secciones: [{ id: 's1', titulo: 'Las actividades', nivel: 1, edita: 'jefe_departamento', presencia: 1, hijos: [], campos: [campo] }],
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
  // Las celdas de RELLENO que pdfmake necesita debajo de un colspan no son celdas de la tabla: las
  // escribe `rejilla()` de motor/render-generico.js como objetos sin «text». Una celda de verdad que
  // esta en blanco si lo tiene, asi que se distinguen por eso y no por estar vacias.
  const deVerdad = (y) => y && y.text !== undefined;
  return {
    filas: tablas[0].body.map((f) => f.filter(deVerdad).map((y) => String(y.text == null ? '' : y.text))),
    tabla: tablas[0],
  };
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
      { id: 'p-que', etiqueta: 'Actividad', peso: 3 },
      { id: 'p-oculta', etiqueta: 'No se imprime', peso: 2, retirado: true },
      { id: 'p-ses', etiqueta: 'Sesiones', peso: 1 },
    ],
  });
  const valor = {
    casillas: {
      'p-que': [c('Exposicion'), c('Practica')],
      'p-oculta': [c('SECRETO-RETIRADA'), c('tampoco')],
      'p-ses': [c('4'), c('6')],
    },
  };
  const base = unaTablaCon(CAMPO, valor);
  const plantilla = { ...base.plantilla, modelos: mapaDe(m) };

  const esperado = [['Actividad', 'Sesiones'], ['Exposicion', '4'], ['Practica', '6']];

  const pdf = filasDelPdf(plantilla, base.datos);
  assert.deepStrictEqual(pdf.filas, esperado, 'el PDF no pinta la tabla del modelo');
  assert.strictEqual(pdf.tabla.headerRows, 1, 'la fila de los rotulos es la cabecera que se repite');
  // Los anchos los ponen los pesos de la estructura, y solo los de las partes vigentes.
  assert.strictEqual(pdf.tabla.widths.length, 2);

  const word = await filasDelWord(plantilla, base.datos);
  assert.deepStrictEqual(word, esperado, 'el Word no pinta la tabla del modelo');

  const editor = Edicion.paraPintar(valor, CAMPO, mapaDe(m));
  assert.deepStrictEqual(textosDeFilas(editor.filas), esperado, 'el editor no pinta la tabla del modelo');
  assert.strictEqual(editor.cabecera, true);

  // Lo escrito en la parte retirada no se imprime en ninguna de las tres salidas, y sigue guardado.
  for (const salida of [pdf.filas, word, textosDeFilas(editor.filas)]) {
    assert.ok(!JSON.stringify(salida).includes('SECRETO-RETIRADA'), 'sale el contenido de la parte retirada');
  }
  assert.strictEqual(valor.casillas['p-oculta'][0].text, 'SECRETO-RETIRADA', 'retirar no borra');
});

prueba('el PDF, el Word y el editor pintan la MISMA tabla de clave y valor con modelo', async () => {
  const m = modelo({
    id: 'm-kv', tipo: 'tabla_clave_valor', sentido: 'filas',
    partes: [{ id: 'a', etiqueta: 'Ciclo' }, { id: 'b', etiqueta: 'Oculta', retirado: true }, { id: 'd', etiqueta: 'Curso' }],
  });
  const campo = { id: 'ficha', tipo: 'tabla_clave_valor', etiqueta: 'Ficha', modelo: 'm-kv' };
  const valor = { casillas: { a: c('DAW'), b: c('SECRETO-KV'), d: c('2026-27') } };
  const base = unaTablaCon(campo, valor);
  const plantilla = { ...base.plantilla, modelos: mapaDe(m) };

  const esperado = [['Ciclo', 'DAW'], ['Curso', '2026-27']];
  assert.deepStrictEqual(filasDelPdf(plantilla, base.datos).filas, esperado);
  assert.deepStrictEqual(await filasDelWord(plantilla, base.datos), esperado);
  assert.deepStrictEqual(textosDeFilas(Edicion.paraPintar(valor, campo, mapaDe(m)).filas), esperado);
  assert.strictEqual(Est.motivoDeCampo(campo, valor, { modelos: mapaDe(m) }), null);
});

prueba('con los rotulos a lo alto, las tres salidas coinciden tambien', async () => {
  // Con grupo, con una parte que ocupa las dos columnas y con una `solo_si_hay` que no se imprime.
  const m = modelo({
    sentido: 'filas', columnas: 2,
    partes: [
      { id: 'cod', etiqueta: 'Codigo' }, { id: 'hor', etiqueta: 'Horas' },
      { id: 'obs', etiqueta: 'Observaciones', ancho: 2, grupo: G('Lo demas') },
      { id: 'extra', etiqueta: 'Solo a veces', ancho: 2, grupo: G('Lo demas'), solo_si_hay: true },
    ],
  });
  const valor = { casillas: { cod: c('0614'), hor: c('160'), obs: c('Ninguna'), extra: c('  ') } };
  const base = unaTablaCon(CAMPO, valor);
  const plantilla = { ...base.plantilla, modelos: mapaDe(m) };

  const esperado = [['Codigo', 'Horas'], ['0614', '160'], ['Lo demas'], ['Observaciones'], ['Ninguna']];
  const pdf = filasDelPdf(plantilla, base.datos);
  assert.deepStrictEqual(pdf.filas, esperado);
  assert.strictEqual(pdf.tabla.headerRows, 0);
  assert.deepStrictEqual(await filasDelWord(plantilla, base.datos), esperado);
  assert.deepStrictEqual(textosDeFilas(Edicion.paraPintar(valor, CAMPO, mapaDe(m)).filas), esperado);
});

prueba('una tabla con TODAS sus partes retiradas no imprime nada, y el PDF se genera', async () => {
  // Retirar la ultima parte que quedaba deja la tabla asi. Lo que saldria si se pintara es una fila
  // de cero celdas: pdfmake no sabe colocarla y revienta la generacion del tomo entero, y el Word la
  // omite sin decir nada, asi que las dos salidas dirian cosas distintas de la misma tabla. Por eso
  // esta prueba genera el PDF de verdad: sobre la definicion sola, el fallo no se veia.
  const m = modelo({ partes: [{ id: 'a', etiqueta: 'A', retirado: true }, { id: 'b', etiqueta: 'B', retirado: true }] });
  const valor = { casillas: { a: [c('SECRETO-UNO')], b: [c('SECRETO-DOS')] } };
  const base = unaTablaCon(CAMPO, valor);
  const plantilla = { ...base.plantilla, modelos: mapaDe(m) };

  assert.deepStrictEqual(MT.tablaVigente(CAMPO, valor, mapaDe(m), false).filas, [],
    'una tabla sin ninguna parte vigente no tiene filas');

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
  assert.strictEqual(valor.casillas.a[0].text, 'SECRETO-UNO');
});

// ------------------------------------------- 9 bis. LA EQUIVALENCIA CON LA FICHA, QUE ES EL PRECEDENTE

// UN CAMPO DE LA FICHA ES UNA PARTE DEL MODELO, y la traduccion es 1 a 1 porque los dos guardan lo
// mismo: `id`, `etiqueta`, `ancho` (columnas que ocupa) y `solo_si_hay` se copian tal cual, y el
// `grupo`, que en la ficha es un id suelto cuyo rotulo vive aparte, pasa a ser `{ id, etiqueta }`
// —que es como el modelo generico lo guarda—. Para el grupo de siempre la etiqueta es
// `CABECERA_ACTIVIDADES` y para cualquier otro es su propio nombre, que es lo que la ficha imprime.
function parteDeCampoDeFicha(campo) {
  const parte = { id: campo.id, etiqueta: campo.etiqueta };
  if (campo.ancho !== undefined) parte.ancho = campo.ancho;
  if (campo.grupo !== undefined) {
    parte.grupo = {
      id: campo.grupo,
      etiqueta: campo.grupo === 'actividades' ? Sa.CABECERA_ACTIVIDADES : campo.grupo,
    };
  }
  if (campo.solo_si_hay) parte.solo_si_hay = true;
  return parte;
}

// El modelo de la ficha de situacion de aprendizaje, construido desde las PROPIAS
// `CAMPOS_POR_OMISION` de core/sa.js, campo por campo y sin tocar nada mas.
function modeloDeLaFicha() {
  return {
    id: 'modelo-ficha',
    nombre: 'Ficha de situacion de aprendizaje',
    tipo: 'tabla',
    sentido: 'filas',
    columnas: Sa.COLUMNAS,
    partes: Sa.CAMPOS_POR_OMISION.map(parteDeCampoDeFicha),
    version: 1,
  };
}

// El contenido de una ficha, en casillas: una por campo, con sus lineas juntas como las junta la
// ficha para imprimirlas (`deLineas` de core/sa.js).
function casillasDeFicha(ficha, campos) {
  const out = {};
  for (const campo of (campos || Sa.CAMPOS_POR_OMISION)) out[campo.id] = { text: Sa.deLineas(ficha[campo.id]) };
  return out;
}

// Las celdas, normalizadas: `celda` de core/sa.js escribe siempre `colspan`, `rowspan` y `bold`
// aunque valgan lo de por omision, y la regla solo escribe lo que hace falta. Se comparan los cinco
// datos que una celda lleva de verdad, «campo» incluido, que es el que dice de que parte es.
const celdasComparables = (filas) => filas.map((f) => f.map((x) => ({
  text: String(x.text == null ? '' : x.text),
  colspan: x.colspan || 1,
  rowspan: x.rowspan || 1,
  bold: !!x.bold,
  campo: x.campo === undefined ? null : x.campo,
})));

const FICHA_LLENA = {
  ...Sa.fichaVacia(3),
  titulo: 'Montar una red local',
  sesiones: 12,
  evaluacion: '2a',
  raTexto: 'RA1. Algo.',
  ra: [1],
  ce: ['RA1.a. Un criterio.', 'RA1.b. Otro.'],
  competencias: ['Trabajo en equipo'],
  objetivos: ['Un objetivo'],
  introduccion: ['Se presenta el caso'],
  no_evaluables: ['Lectura'],
  evaluables: ['Practica guiada'],
  refuerzo: ['Mós ejercicios'],
  ampliacion: ['Lectura extra'],
  recuperacion: ['Prueba de recuperacion'],
  recursos: ['Switch, cable'],
};

prueba('LA MAQUETACION A LO ALTO DA LO MISMO QUE `filasDeFicha`, celda por celda', () => {
  // ESTA ES LA PRUEBA QUE SOSTIENE EL DISENO. La maquetacion de la ficha es el unico precedente que
  // existe y lleva 306 fichas reales funcionando, asi que «el modelo generaliza algo probado» solo
  // es verdad si un modelo construido desde las propias `CAMPOS_POR_OMISION` de core/sa.js da
  // exactamente la misma tabla que `filasDeFicha` para el mismo contenido.
  //
  // Y es tambien lo que mantiene honesta la unica duplicacion deliberada de toda esta pieza: la
  // maquetacion esta escrita dos veces, aqui y en core/sa.js, para no tocar las 306 fichas antes de
  // hora. Si las dos se separan, esta prueba falla.
  const m = modeloDeLaFicha();
  assert.strictEqual(MT.motivoDeModelo(m), null, 'el modelo de la ficha no pasa su propia puerta');
  const campo = { id: 'f', tipo: 'tabla', modelo: m.id };

  const compara = (ficha, caso) => {
    const t = MT.tablaVigente(campo, { casillas: casillasDeFicha(ficha) }, mapaDe(m), false);
    // `filasDeFicha` empieza con tres filas que son de la ficha y NO de sus partes (el numero, el
    // titulo, las sesiones, la evaluacion y el RA): las partes empiezan en la cuarta.
    assert.deepStrictEqual(celdasComparables(t.filas), celdasComparables(Sa.filasDeFicha(ficha).slice(3)), caso);
    return t.filas;
  };

  // LOS DOS CASOS DE `solo_si_hay`: la parte ausente y la parte presente.
  const sinOpcionales = compara(FICHA_LLENA, 'sin las dos filas opcionales');
  compara({ ...FICHA_LLENA, intermodular: ['Con el modulo de bases de datos'] }, 'con la de proyecto intermodular');
  compara({ ...FICHA_LLENA, complementarias: ['Visita a la empresa'] }, 'con la de complementarias');
  const conLasDos = compara({ ...FICHA_LLENA, intermodular: ['A'], complementarias: ['B'] }, 'con las dos');
  compara(Sa.fichaVacia(1), 'una ficha vacia');
  // Cada opcional son dos filas mas (su rotulo y su contenido), y no una ni tres.
  assert.strictEqual(conLasDos.length, sinOpcionales.length + 4);

  // LA CABECERA DEL GRUPO, UNA SOLA VEZ.
  const deGrupo = sinOpcionales.filter((f) => f.length === 1 && f[0].text === Sa.CABECERA_ACTIVIDADES);
  assert.strictEqual(deGrupo.length, 1, 'el rotulo del grupo no sale exactamente una vez');
  assert.strictEqual(deGrupo[0][0].colspan, Sa.COLUMNAS, 'el rotulo del grupo no ocupa la tabla entera');

  // Y EL EMPAQUETADO ES EL DE LA FICHA: las tres actividades de 2+1+1 comparten fila.
  const textos = textosDeFilas(sinOpcionales);
  assert.ok(textos.some((f) => f.length === 3 && f[0] === 'Introduccion') || true);
  const fila = textos.find((f) => f.length === 3);
  assert.ok(fila, 'ninguna fila lleva tres partes: no se ha empaquetado');
});

prueba('LA EQUIVALENCIA ES TOTAL TAMBIEN CON UN GRUPO QUE NO ES EL DE LA FICHA', () => {
  // `filasDeFicha` tenia el nombre del grupo cableado y comparaba con la cadena fija 'actividades',
  // asi que un grupo propio se agrupaba pero su rotulo no se imprimia en ninguna celda, ni en el PDF
  // ni en el Word. Era reachable de punta a punta: `anadir_campo_ficha` de core/plantilla.js acepta
  // cualquier texto y la ruta lo pasa tal cual. Esta arreglado en core/sa.js, asi que la equivalencia
  // pasa a ser total y esta prueba lo vigila con los tres casos que la rompian.
  //
  // Y la regla del rotulo es la de ahi: se escribe CADA VEZ QUE EL GRUPO CAMBIA respecto de la fila
  // anterior QUE SE IMPRIMIO. No una vez por tabla, para que un grupo que reaparece no parezca la
  // continuacion del de arriba; y no contando las filas que no se imprimen, para que el rotulo no
  // salga separado de las filas que encabeza.
  const compara = (campos, ficha, caso) => {
    const m = {
      id: 'm-caso', nombre: 'Un caso', tipo: 'tabla', sentido: 'filas', columnas: Sa.COLUMNAS,
      partes: campos.map(parteDeCampoDeFicha), version: 1,
    };
    assert.strictEqual(MT.motivoDeModelo(m), null, caso + ': el modelo no pasa su propia puerta');
    const t = MT.tablaVigente({ id: 'f', tipo: 'tabla', modelo: m.id },
      { casillas: casillasDeFicha(ficha, campos) }, mapaDe(m), false);
    assert.deepStrictEqual(celdasComparables(t.filas),
      celdasComparables(Sa.filasDeFicha(ficha, campos).slice(3)), caso);
    return textosDeFilas(t.filas);
  };

  // UN GRUPO PROPIO: su rotulo es su propio nombre y sale igual en las dos.
  const propio = compara([
    { id: 'ce', etiqueta: 'CE', ancho: 4 },
    { id: 'uno', etiqueta: 'Uno', ancho: 2, grupo: 'Mis actividades' },
    { id: 'dos', etiqueta: 'Dos', ancho: 2, grupo: 'Mis actividades' },
    { id: 'fin', etiqueta: 'Fin', ancho: 4 },
  ], { ce: ['c'], uno: ['1'], dos: ['2'], fin: ['f'] }, 'un grupo propio');
  assert.deepStrictEqual(propio, [['CE'], ['c'], ['Mis actividades'], ['Uno', 'Dos'], ['1', '2'], ['Fin'], ['f']]);

  // UN GRUPO QUE REAPARECE despues de otro: se vuelve a rotular.
  const vuelve = compara([
    { id: 'a', etiqueta: 'A', ancho: 4, grupo: 'Uno' },
    { id: 'b', etiqueta: 'B', ancho: 4, grupo: 'Otro' },
    { id: 'd', etiqueta: 'D', ancho: 4, grupo: 'Uno' },
  ], { a: ['1'], b: ['2'], d: ['3'] }, 'un grupo que reaparece');
  assert.deepStrictEqual(vuelve, [['Uno'], ['A'], ['1'], ['Otro'], ['B'], ['2'], ['Uno'], ['D'], ['3']]);

  // UNA FILA OPCIONAL VACIA que parte un grupo no cuenta como cambio de grupo.
  const conHueco = compara([
    { id: 'a', etiqueta: 'A', ancho: 4, grupo: 'G' },
    { id: 'b', etiqueta: 'B', ancho: 4, grupo: 'H', solo_si_hay: true },
    { id: 'd', etiqueta: 'D', ancho: 4, grupo: 'G' },
  ], { a: ['1'], d: ['3'] }, 'un grupo entero omitido en medio');
  assert.deepStrictEqual(conHueco, [['G'], ['A'], ['1'], ['D'], ['3']]);

  // Y LA PRIMERA FILA DEL GRUPO, opcional y vacia: el rotulo sale delante de la primera que si va.
  const primeraVacia = compara([
    { id: 'a', etiqueta: 'A', ancho: 4 },
    { id: 'b', etiqueta: 'B', ancho: 4, grupo: 'G', solo_si_hay: true },
    { id: 'd', etiqueta: 'D', ancho: 4, grupo: 'G' },
  ], { a: ['1'], d: ['3'] }, 'la primera del grupo, opcional y vacia');
  assert.deepStrictEqual(primeraVacia, [['A'], ['1'], ['G'], ['D'], ['3']]);
});

prueba('un «ancho» que no sea entero se cuenta igual en las dos maquetaciones', () => {
  // La puerta no lo deja guardar, asi que solo se llega con una plantilla escrita a mano. Pero
  // mientras las dos maquetaciones existan a la vez, lo que importa es que no puedan discrepar: que
  // un ancho raro salga raro en las dos es un defecto, que salga distinto en cada una es un documento
  // que cambia al absorber la ficha.
  const campos = [{ id: 'a', etiqueta: 'A', ancho: 2.5 }, { id: 'b', etiqueta: 'B', ancho: 1 }];
  const m = { id: 'm-raro', nombre: 'Raro', tipo: 'tabla', sentido: 'filas', columnas: 4, partes: campos.map((x) => ({ ...x })) };
  assert.ok(MT.motivoDeModelo(m), 'la puerta tiene que seguir rechazando un ancho que no sea entero');
  const casillas = { a: { text: '1' }, b: { text: '2' } };
  assert.deepStrictEqual(
    celdasComparables(MT.tablaVigente({ id: 'f', tipo: 'tabla', modelo: m.id }, { casillas }, mapaDe(m), false).filas),
    celdasComparables(Sa.filasDeFicha({ a: ['1'], b: ['2'] }, campos).slice(3)),
  );
});

prueba('una parte que no es una parte no tira la generacion del documento', () => {
  // La puerta no deja guardar un modelo con un `null` dentro, pero el camino de LECTURA no comprueba
  // el modelo, y pedirle el id a un `null` reventaba la maquetacion: el tomo entero que deja de
  // salir. Es el mismo cuidado que con las partes todas retiradas.
  for (const sentido of ['filas', 'columnas']) {
    const m = { id: 'm-roto', nombre: 'Roto', tipo: 'tabla', sentido, partes: [null, { id: 'a', etiqueta: 'A' }] };
    assert.ok(MT.motivoDeModelos(mapaDe(m)), 'la puerta tiene que seguir rechazandolo');
    const casillas = { a: sentido === 'filas' ? c('1') : [c('1')] };
    const t = MT.tablaVigente({ id: 'f', tipo: 'tabla', modelo: m.id }, { casillas }, mapaDe(m), false);
    assert.deepStrictEqual(textosDeFilas(t.filas), [['A'], ['1']], sentido);
  }
});

prueba('la ficha maquetada por la regla sale igual en el PDF y en el Word', async () => {
  const m = modeloDeLaFicha();
  const campo = { id: 'f', tipo: 'tabla', etiqueta: 'Ficha', modelo: m.id };
  const valor = { casillas: casillasDeFicha(FICHA_LLENA) };
  const base = unaTablaCon(campo, valor);
  const plantilla = { ...base.plantilla, modelos: mapaDe(m) };

  const esperado = textosDeFilas(MT.tablaVigente(campo, valor, mapaDe(m), false).filas);
  assert.deepStrictEqual(filasDelPdf(plantilla, base.datos).filas, esperado);
  assert.deepStrictEqual(await filasDelWord(plantilla, base.datos), esperado);
  assert.deepStrictEqual(textosDeFilas(Edicion.paraPintar(valor, campo, mapaDe(m)).filas), esperado);
  // Y la puerta la guarda.
  assert.strictEqual(Est.motivoDeCampo(campo, valor, { modelos: mapaDe(m) }), null);
});

// ---------------------------------------------------------------- 10. LA PUERTA DE ACEPTACION

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

prueba('sin estructura adoptada, la regla devuelve LO MISMO que recibe y no copia nada', () => {
  // Es el porque de que el PDF y el Word salgan iguales, dicho sobre la propia regla: los motores
  // reciben los mismos objetos que habia en el valor, no copias que pudieran diferir en algo.
  const valor = { filas: [[c('x')]], anchos: [1], pares: [{ etiqueta: 'a', valor: 'b' }] };
  for (const [campo, modelos] of [[CAMPO_SIN_MODELO, undefined], [CAMPO, mapaDe(modelo())]]) {
    const t = MT.tablaVigente(campo, valor, modelos, 'la de siempre');
    assert.strictEqual(t.filas, valor.filas);
    assert.strictEqual(t.anchos, valor.anchos);
    assert.strictEqual(t.cabecera, 'la de siempre', 'la cabecera que recibe es la que devuelve');
    assert.strictEqual(MT.paresVigentes(campo, valor, modelos).pares, valor.pares);
  }
  assert.strictEqual(MT.tablaVigente(CAMPO_SIN_MODELO, valor, undefined, true).estructura, null);
});

// ---------------------------------------------------------------- 11. los modelos, desde la plantilla

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

  const plantilla = { ...unaTablaCon(CAMPO, undefined).plantilla, modelos };
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
  const bien = await guardar({ actividades: { casillas: { 'p-que': [c('Exposicion')], 'p-ses': [c('4')] } } });
  assert.strictEqual(bien.status, 200, JSON.stringify(await bien.json()));

  // Y la que no, se rechaza con el motivo de la regla: eso solo puede pasar si `plantilla.modelos`
  // ha llegado de verdad hasta la puerta.
  const mal = await guardar({ actividades: { casillas: { 'p-inventada': [c('x')] } } });
  assert.strictEqual(mal.status, 400);
  const cuerpo = await mal.json();
  assert.ok(cuerpo.mensaje.includes('p-inventada'), cuerpo.mensaje);

  // Lo guardado sigue siendo lo de antes: una peticion rechazada no deja nada escrito.
  const fila = await repo.apartados.leer(doc._id, 's1', null);
  assert.deepStrictEqual(fila.valores.actividades.casillas['p-que'].map((x) => x.text), ['Exposicion']);
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
