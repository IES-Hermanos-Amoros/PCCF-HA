// ADOPTAR EL MODELO PARA UNA TABLA YA ESCRITA (core/tablas-adopcion.js).
//
//   node test/tablas-adopcion.js
//
// LO QUE SE VIGILA AQUI, Y POR QUE SON TRES COSAS Y NO UNA:
//
//   1. QUE NO SE PIERDE UN CARACTER. Lo que la tabla tenia escrito tiene que seguir imprimiendose
//      despues de adoptar, y eso se comprueba contra la REGLA DE IMPRESION de verdad —`tablaVigente`
//      y `paresVigentes` de core/modelos-tabla.js—, no contra lo que esta prueba suponga que pintan.
//      Y de ida y vuelta: unas casillas pintadas y vueltas a adoptar dan las mismas casillas.
//
//   2. QUE CUANDO NO PUEDE GARANTIZARLO SE NIEGA, con el MENSAJE QUE LE SALE A UNA PERSONA. Los
//      casos en que se niega son tan importantes como los que funcionan: son la unica cosa que
//      impide que adoptar sea una manera silenciosa de tirar texto. Por eso cada negativa se
//      comprueba por su clave corta y por lo que el mensaje NOMBRA.
//
//   3. QUE LO QUE SALE PASA LA PUERTA DE GUARDADO (`motivoDeCampo` de core/estructurados.js). Una
//      tabla adoptada que no se pudiera guardar seria un 400 delante de alguien que esta escribiendo.
//
// Las tablas son sinteticas y con la forma que deja el importador (`colspan` y `rowspan` siempre
// puestos, `bold` por celda): asi la prueba fija el criterio y no un documento.

'use strict';

const assert = require('assert/strict');
const A = require('../core/tablas-adopcion');
const MT = require('../core/modelos-tabla');
const Est = require('../core/estructurados');
const Sa = require('../core/sa');

let fallos = 0;
const prueba = (nombre, fn) => {
  try { fn(); console.log(`ok   ${nombre}`); }
  catch (e) { fallos += 1; console.log(`FALLO ${nombre}\n     ${e.message}`); }
};

// una celda como la deja el importador
const c = (text, extra) => Object.assign({ text, colspan: 1, rowspan: 1, bold: false }, extra);
const neg = (text, extra) => c(text, Object.assign({ bold: true }, extra));

const modelo = (extra) => Object.assign({
  id: 'm', nombre: 'Actividad', tipo: 'tabla', sentido: 'columnas',
  partes: [{ id: 'p1', etiqueta: 'Nombre' }, { id: 'p2', etiqueta: 'Descripción' }],
}, extra);
const campoDe = (tipo, extra) => Object.assign({ id: 'cmp', tipo, etiqueta: 'Tabla', modelo: 'm' }, extra);
const con = (m) => ({ m });

const adoptar = (campo, valor, m) => A.adoptar(campo, valor, con(m));

// El texto de lo que se imprime, sin los rotulos: es lo que no puede cambiar.
const impreso = (campo, valor, m) => A.contenidoImpreso(campo, valor, con(m))
  .map((t) => String(t).trim()).filter(Boolean).sort();
// El de la rejilla escrita, sin su primera fila, que es la de los rotulos.
const deLaRejilla = (filas) => filas.slice(1).reduce((a, f) => a.concat(f.map((x) => String(x.text).trim())), [])
  .filter(Boolean).sort();

// ---------------------------------------------------------------- se publica

prueba('se publica en Core.tablasAdopcion y en module.exports', () => {
  assert.equal(typeof A.adoptar, 'function');
  assert.equal(global.Core.tablasAdopcion, A);
});

// ---------------------------------------------------------------- a lo ancho

const rejilla = () => ({
  filas: [
    [neg('Nombre'), neg('Descripción')],
    [c('Uno'), c('lo uno')],
    [c('Dos'), c('lo dos')],
  ],
  anchos: [30, 70],
});

prueba('a lo ancho: suelta la fila de rotulos y guarda el contenido por id de parte', () => {
  const r = adoptar(campoDe('tabla'), rejilla(), modelo());
  assert.equal(r.motivo, null);
  assert.equal(r.clave, null);
  assert.deepEqual(Object.keys(r.valor), ['casillas']);
  assert.deepEqual(r.valor.casillas.p1.map((x) => x.text), ['Uno', 'Dos']);
  assert.deepEqual(r.valor.casillas.p2.map((x) => x.text), ['lo uno', 'lo dos']);
});

prueba('se van la rejilla, los pares y los anchos, y nada mas', () => {
  const valor = Object.assign(rejilla(), { pares: [{ etiqueta: 'x', valor: 'y' }] });
  // Una tabla divergida guarda su estructura junto a su contenido: adoptar no se la toca.
  valor.estructura = { sentido: 'columnas', partes: [{ id: 'p1', etiqueta: 'Nombre' }, { id: 'p2', etiqueta: 'Descripción' }] };
  const r = adoptar(campoDe('tabla'), valor, modelo());
  assert.equal(r.motivo, null);
  assert.equal(r.valor.filas, undefined);
  assert.equal(r.valor.pares, undefined);
  assert.equal(r.valor.anchos, undefined);
  assert.deepEqual(r.valor.estructura, valor.estructura);
});

prueba('no se pierde un caracter: lo que se imprime sigue siendo el mismo texto', () => {
  const valor = rejilla();
  const r = adoptar(campoDe('tabla'), valor, modelo());
  assert.deepEqual(impreso(campoDe('tabla'), r.valor, modelo()), deLaRejilla(valor.filas));
});

prueba('la tabla adoptada la acepta la puerta de guardado', () => {
  const campo = campoDe('tabla');
  const r = adoptar(campo, rejilla(), modelo());
  assert.equal(Est.motivoDeCampo(campo, r.valor, { modelos: con(modelo()) }), null);
});

prueba('una casilla no lleva colspan, rowspan ni campo, y conserva el estilo de su celda', () => {
  const valor = {
    filas: [
      [neg('Nombre'), neg('Descripción')],
      [c('Uno', { bold: true, fondo: 'etiqueta', alineacion: 'centro', tamano: 'pequena' }), c('lo uno')],
    ],
  };
  const r = adoptar(campoDe('tabla'), valor, modelo());
  assert.equal(r.motivo, null);
  assert.deepEqual(r.valor.casillas.p1[0], { text: 'Uno', bold: true, fondo: 'etiqueta', alineacion: 'centro', tamano: 'pequena' });
  // La puerta no admite ni «colspan» ni «rowspan» ni «campo» en una casilla.
  assert.equal(Est.motivoDeCasillas(r.valor, 'la tabla'), null);
});

prueba('las columnas quedan todas del mismo alto, aunque a la tabla le falten celdas', () => {
  const valor = { filas: [[neg('Nombre'), neg('Descripción')], [c('Uno')], [c('Dos'), c('lo dos')]] };
  const r = adoptar(campoDe('tabla'), valor, modelo());
  assert.equal(r.motivo, null);
  assert.equal(r.valor.casillas.p1.length, 2);
  assert.equal(r.valor.casillas.p2.length, 2);
  assert.equal(r.valor.casillas.p2[0].text, '');
});

prueba('una tabla sin nada escrito se adopta con cero casillas', () => {
  const r = adoptar(campoDe('tabla'), { filas: [] }, modelo());
  assert.equal(r.motivo, null);
  assert.deepEqual(r.valor.casillas, {});
  assert.equal(r.informe.casillas, 0);
  assert.deepEqual(r.informe.sinContenido.map((p) => p.id), ['p1', 'p2']);
});

// ---------------------------------------------------------------- el emparejamiento es el del lector

prueba('empareja con la tolerancia del lector: mayusculas, acentos y espacios de mas', () => {
  const valor = { filas: [[neg('  NOMBRE '), neg('descripcion')], [c('Uno'), c('lo uno')]] };
  const r = adoptar(campoDe('tabla'), valor, modelo());
  assert.equal(r.motivo, null);
  assert.deepEqual(Object.keys(r.valor.casillas).sort(), ['p1', 'p2']);
});

prueba('empareja por los sinonimos del lector de la ficha, no por parecido', () => {
  // `recursos` acepta «Materiales y recursos disponibles` (SINONIMOS de core/sa.js). Que el
  // emparejamiento sea el MAPA DEL LECTOR y no una comparacion propia es lo que hace que una
  // redaccion que el lector ya entendia siga entendiendose al adoptar.
  const m = modelo({ partes: [{ id: 'recursos', etiqueta: 'Materiales y recursos didácticos disponibles' }] });
  const valor = { filas: [[neg('Materiales y recursos disponibles')], [c('Apuntes')]] };
  const r = adoptar(campoDe('tabla'), valor, m);
  assert.equal(r.motivo, null);
  assert.equal(r.valor.casillas.recursos[0].text, 'Apuntes');
  // Y lo dice: el rotulo que se imprimira no es el que la tabla traia.
  assert.equal(r.informe.rotulos[0].cambia, true);
  assert.match(r.informe.aviso, /«Materiales y recursos disponibles» pasa a «Materiales y recursos didácticos disponibles»/);
  assert.equal(Sa.porEtiqueta(m.partes).get(Sa.norm('Materiales y recursos disponibles')).id, 'recursos');
});

prueba('un rotulo que solo casa con una parte retirada no casa con nada', () => {
  const m = modelo({ partes: [{ id: 'p1', etiqueta: 'Nombre' }, { id: 'p2', etiqueta: 'Descripción', retirado: true }] });
  const r = adoptar(campoDe('tabla'), rejilla(), m);
  assert.equal(r.clave, 'rotulo-sin-parte');
  assert.match(r.motivo, /«Descripción»/);
});

prueba('un rotulo en blanco no casa con una parte de etiqueta vacia', () => {
  const m = modelo({ partes: [{ id: 'p1', etiqueta: 'Nombre' }, { id: 'p2', etiqueta: '' }] });
  const valor = { filas: [[neg('Nombre'), neg('')], [c('Uno'), c('lo uno')]] };
  const r = adoptar(campoDe('tabla'), valor, m);
  assert.equal(r.clave, 'celda-sin-sitio');
});

// ---------------------------------------------------------------- cuando se niega

prueba('se niega si dos rotulos casan con la misma parte, y nombra los dos', () => {
  const valor = { filas: [[neg('Nombre'), neg('nombre')], [c('Uno'), c('Otro')]] };
  const r = adoptar(campoDe('tabla'), valor, modelo());
  assert.equal(r.valor, null);
  assert.equal(r.clave, 'rotulos-repetidos');
  assert.match(r.motivo, /«Nombre» \(la columna 1\) y «nombre» \(la columna 2\)/);
  assert.match(r.motivo, /taparía el del otro/);
  assert.equal(r.informe.repetidos.length, 1);
});

prueba('se niega si un rotulo no casa con ninguna parte, lo nombra y dice cuanto texto hay en juego', () => {
  const valor = { filas: [[neg('Nombre'), neg('Temporalización')], [c('Uno'), c('Mayo')]] };
  const r = adoptar(campoDe('tabla'), valor, modelo());
  assert.equal(r.valor, null);
  assert.equal(r.clave, 'rotulo-sin-parte');
  assert.match(r.motivo, /El rótulo «Temporalización»/);
  assert.match(r.motivo, /19 caracteres/);
  assert.deepEqual(r.informe.sinParte.map((x) => x.texto), ['Temporalización']);
  // «Temporalización» (15) y «Mayo» (4): el rotulo y el texto de su columna.
  assert.equal(r.informe.enJuego, 19);
  assert.deepEqual(r.informe.sueltas.map((x) => x.texto), ['Mayo']);
});

prueba('se niega si una celda con texto se quedaria sin sitio, y dice donde esta', () => {
  const valor = { filas: [[neg('Nombre'), neg('Descripción'), neg('')], [c('Uno'), c('lo uno'), c('huerfano')]] };
  const r = adoptar(campoDe('tabla'), valor, modelo());
  assert.equal(r.clave, 'celda-sin-sitio');
  assert.match(r.motivo, /La celda 3 de la fila 2 tiene texto \(«huerfano»\)/);
  assert.match(r.motivo, /8 caracteres en juego/);
});

prueba('una columna sin rotulo y sin nada escrito no se niega: se adopta y se avisa', () => {
  const valor = { filas: [[neg('Nombre'), neg('Descripción'), c('')], [c('Uno'), c('lo uno'), c('')]] };
  const r = adoptar(campoDe('tabla'), valor, modelo());
  assert.equal(r.motivo, null);
  assert.deepEqual(r.informe.sinRotulo, [{ donde: 'la columna 3' }]);
  assert.match(r.informe.aviso, /La columna 3 no tiene rótulo ni nada escrito, así que desaparece/);
});

prueba('se niega con una celda que ocupa varias columnas o varias filas', () => {
  const conColspan = { filas: [[neg('Nombre'), neg('Descripción')], [c('Uno', { colspan: 2 })]] };
  const r1 = adoptar(campoDe('tabla'), conColspan, modelo());
  assert.equal(r1.clave, 'celda-combinada');
  assert.match(r1.motivo, /La celda 1 de la fila 2 ocupa 2 columnas/);
  assert.match(r1.motivo, /de una parte y de una sola/);
  const conRowspan = { filas: [[neg('Nombre', { rowspan: 2 }), neg('Descripción')], [c('lo uno')]] };
  const r2 = adoptar(campoDe('tabla'), conRowspan, modelo());
  assert.equal(r2.clave, 'celda-combinada');
  assert.match(r2.motivo, /ocupa 2 filas/);
});

prueba('se niega sin modelo, con el modelo vacio, con el modelo de otro tipo y ya adoptada', () => {
  const sin = adoptar({ id: 'x', tipo: 'tabla', etiqueta: 'T' }, rejilla(), modelo());
  assert.equal(sin.clave, 'sin-estructura');
  assert.match(sin.motivo, /no sigue ningún modelo/);
  assert.equal(sin.informe, null);

  const vacio = adoptar(campoDe('tabla'), rejilla(), modelo({ partes: [] }));
  assert.equal(vacio.clave, 'sin-estructura');
  assert.match(vacio.motivo, /todavía no tiene ninguna parte/);

  const otro = adoptar(campoDe('tabla'), rejilla(), modelo({ tipo: 'tabla_clave_valor', sentido: 'filas' }));
  assert.equal(otro.clave, 'sin-estructura');
  assert.match(otro.motivo, /no está en la plantilla del documento o es de otro tipo/);

  const ya = adoptar(campoDe('tabla'), { casillas: { p1: [c('Uno')], p2: [c('lo uno')] } }, modelo());
  assert.equal(ya.clave, 'ya-adoptada');
  assert.match(ya.motivo, /no hay nada que adoptar/);

  const todas = adoptar(campoDe('tabla'), rejilla(),
    modelo({ partes: [{ id: 'p1', etiqueta: 'Nombre', retirado: true }] }));
  assert.equal(todas.clave, 'todas-retiradas');
});

prueba('no se mete donde no se imprime una rejilla: una tabla de RA y CE se niega', () => {
  // `auto.tabla_ra_ce` se imprime desde `ra` (`queSeImprime`), no desde la rejilla, y ademas no es un
  // tipo al que se le pueda poner modelo: la primera regla que lo dice es la que contesta.
  const r = adoptar({ id: 'x', tipo: 'auto.tabla_ra_ce', etiqueta: 'T', modelo: 'm' }, { filas: [[c('a')]], ra: [{ num: 1 }] }, modelo());
  assert.equal(r.clave, 'sin-estructura');
  assert.match(r.motivo, /no es de un tipo al que se le pueda poner un modelo/);
});

prueba('cada clave de negativa esta en MOTIVOS', () => {
  const vistas = ['sin-estructura', 'ya-adoptada', 'todas-retiradas', 'celda-combinada',
    'rotulos-repetidos', 'rotulo-sin-parte', 'celda-sin-sitio'];
  vistas.forEach((k) => assert.ok(A.MOTIVOS.includes(k), `falta ${k} en MOTIVOS`));
});

// ---------------------------------------------------------------- clave y valor

const mcv = () => ({
  id: 'm', nombre: 'Datos', tipo: 'tabla_clave_valor', sentido: 'filas',
  partes: [{ id: 'den', etiqueta: 'Denominación del ciclo' }, { id: 'fam', etiqueta: 'Familia profesional' }],
});

prueba('clave y valor: adopta desde la rejilla, que es la que se imprime', () => {
  const valor = {
    filas: [[neg('Denominación del ciclo'), c('DAW')], [neg('Familia profesional'), c('Informática')]],
    pares: [{ etiqueta: 'Denominación del ciclo', valor: 'DAW' }, { etiqueta: 'Familia profesional', valor: 'Informática' }],
  };
  const campo = campoDe('tabla_clave_valor');
  const r = adoptar(campo, valor, mcv());
  assert.equal(r.motivo, null);
  assert.deepEqual(r.valor.casillas.den.text, 'DAW');
  assert.equal(r.valor.filas, undefined);
  assert.equal(r.valor.pares, undefined);
  // Lo que se imprime son los pares, con los rotulos de la estructura y el mismo texto.
  assert.deepEqual(MT.paresVigentes(campo, r.valor, con(mcv())).pares,
    [{ etiqueta: 'Denominación del ciclo', valor: 'DAW' }, { etiqueta: 'Familia profesional', valor: 'Informática' }]);
  assert.equal(Est.motivoDeCampo(campo, r.valor, { modelos: con(mcv()) }), null);
});

prueba('clave y valor: adopta desde los pares cuando no hay rejilla', () => {
  const valor = { pares: [{ etiqueta: 'Familia profesional', valor: 'Informática' }] };
  const r = adoptar(campoDe('tabla_clave_valor'), valor, mcv());
  assert.equal(r.motivo, null);
  assert.deepEqual(r.valor.casillas, { fam: { text: 'Informática' } });
  assert.equal(r.informe.de, 'pares');
});

prueba('clave y valor: dos filas con el mismo rotulo se niegan', () => {
  const valor = { filas: [[neg('Familia profesional'), c('Informática')], [neg('familia  profesional'), c('Otra')]] };
  const r = adoptar(campoDe('tabla_clave_valor'), valor, mcv());
  assert.equal(r.clave, 'rotulos-repetidos');
  // El mensaje nombra los rotulos recortados y con los espacios de mas juntados, como todo lo que
  // se le ensena a una persona (`recorte`).
  assert.match(r.motivo, /\(la fila 1\) y «familia profesional» \(la fila 2\)/);
});

prueba('clave y valor: una tercera celda con texto se queda sin sitio', () => {
  const valor = { filas: [[neg('Familia profesional'), c('Informática'), c('de mas')]] };
  const r = adoptar(campoDe('tabla_clave_valor'), valor, mcv());
  assert.equal(r.clave, 'celda-sin-sitio');
  assert.match(r.motivo, /La celda 3 de la fila 1/);
});

// ---------------------------------------------------------------- a lo alto, la maquetacion de la ficha

const GRUPO = { id: 'act', etiqueta: 'Tipificación de actividades formativas' };
const mAlto = () => ({
  id: 'm', nombre: 'Ficha', tipo: 'tabla', sentido: 'filas', columnas: 4,
  partes: [
    { id: 'ce', etiqueta: 'Criterios de evaluación', ancho: 4 },
    { id: 'intro', etiqueta: 'Introducción', ancho: 2, grupo: GRUPO },
    { id: 'eval', etiqueta: 'Formativas evaluables', ancho: 2, grupo: GRUPO },
  ],
});
const alto = () => ({
  filas: [
    [neg('Criterios de evaluación', { colspan: 4 })],
    [c('a) uno\nb) dos', { colspan: 4 })],
    [neg('Tipificación de actividades formativas', { colspan: 4 })],
    [neg('Introducción', { colspan: 2 }), neg('Formativas evaluables', { colspan: 2 })],
    [c('lo intro', { colspan: 2 }), c('lo eval', { colspan: 2 })],
  ],
});

prueba('a lo alto: lee la fila de rotulos y la de debajo, y guarda una casilla por parte', () => {
  const r = adoptar(campoDe('tabla'), alto(), mAlto());
  assert.equal(r.motivo, null);
  assert.deepEqual(r.valor.casillas.ce.text, 'a) uno\nb) dos');
  assert.deepEqual(r.valor.casillas.intro.text, 'lo intro');
  assert.deepEqual(r.valor.casillas.eval.text, 'lo eval');
});

prueba('a lo alto: la banda del grupo se descarta porque la estructura la vuelve a imprimir', () => {
  const campo = campoDe('tabla');
  const r = adoptar(campo, alto(), mAlto());
  assert.equal(r.informe.bandas, 1);
  const filas = MT.tablaVigente(campo, r.valor, con(mAlto()), false).filas;
  assert.deepEqual(filas[2], [{ text: 'Tipificación de actividades formativas', colspan: 4, bold: true }]);
  // Y el texto impreso sigue siendo el mismo, banda incluida.
  const antes = alto().filas.reduce((a, f) => a.concat(f.map((x) => x.text.trim())), []).filter(Boolean).sort();
  const despues = filas.reduce((a, f) => a.concat(f.map((x) => String(x.text).trim())), []).filter(Boolean).sort();
  assert.deepEqual(despues, antes);
});

prueba('a lo alto: una fila con texto que no es de rotulos ni de contenido se niega', () => {
  const valor = alto();
  valor.filas.splice(2, 0, [c('Nota al pie que nadie reconoce', { colspan: 4 })]);
  const r = adoptar(campoDe('tabla'), valor, mAlto());
  assert.equal(r.clave, 'celda-sin-sitio');
  assert.match(r.motivo, /Nota al pie que nadie reconoce/);
});

prueba('a lo alto: una fila tapada por un rowspan de arriba se niega, y dice por que', () => {
  const valor = alto();
  valor.filas[3][0].rowspan = 2;
  const r = adoptar(campoDe('tabla'), valor, mAlto());
  assert.equal(r.clave, 'celda-combinada');
  assert.match(r.motivo, /La fila 5 está debajo de una celda que ocupa varias filas/);
  assert.match(r.motivo, /no están en la columna en la que parecen estar/);
});

prueba('a lo alto: un rowspan en una fila que no se lee no estorba, y su texto se dice', () => {
  // Es la cabecera de la ficha de situacion de aprendizaje: lleva rowspan y no es ninguna parte, asi
  // que lo que se dice es que su texto se queda sin sitio, no que la tabla tenga celdas combinadas.
  const valor = alto();
  valor.filas.unshift([neg('Situación de aprendizaje 1', { rowspan: 2 }), neg('El título')], [neg('Sesiones'), c('10')]);
  const r = adoptar(campoDe('tabla'), valor, mAlto());
  assert.equal(r.clave, 'celda-sin-sitio');
  assert.match(r.motivo, /Situación de aprendizaje 1/);
});

prueba('a lo alto: una parte solo_si_hay sin nada escrito no pierde nada', () => {
  const m = mAlto();
  m.partes.push({ id: 'extra', etiqueta: 'Actividades Complementarias', ancho: 4, grupo: GRUPO, solo_si_hay: true });
  const campo = campoDe('tabla');
  const r = adoptar(campo, alto(), m);
  assert.equal(r.motivo, null);
  assert.deepEqual(r.informe.sinContenido.map((p) => p.id), ['extra']);
  assert.match(r.informe.aviso, /se queda sin nada escrito/);
  assert.equal(Est.motivoDeCampo(campo, r.valor, { modelos: con(m) }), null);
});

// ---------------------------------------------------------------- de ida y vuelta

prueba('de ida y vuelta: lo pintado desde unas casillas, vuelto a adoptar, da las mismas casillas', () => {
  // Es la comprobacion de que adoptar es la inversa de la regla de impresion, en las tres
  // maquetaciones: si no lo fuera, una tabla cambiaria sola al pasar por aqui.
  const casos = [
    { campo: campoDe('tabla'), m: modelo(), casillas: { p1: [c('Uno'), c('Dos')], p2: [c('lo uno'), c('lo dos')] } },
    { campo: campoDe('tabla'), m: mAlto(), casillas: { ce: c('a) uno'), intro: c('lo intro'), eval: c('lo eval') } },
  ];
  for (const { campo, m, casillas } of casos) {
    const pintada = MT.tablaVigente(campo, { casillas }, con(m), false);
    // La rejilla pintada, tal como la guardaria el importador si viniera de un Word.
    const filas = pintada.filas.map((f) => f.map((x) => Object.assign({ colspan: 1, rowspan: 1, bold: false }, x)));
    const r = adoptar(campo, { filas }, m);
    assert.equal(r.motivo, null);
    for (const id of Object.keys(casillas)) {
      const ida = Array.isArray(casillas[id]) ? casillas[id] : [casillas[id]];
      const vuelta = Array.isArray(r.valor.casillas[id]) ? r.valor.casillas[id] : [r.valor.casillas[id]];
      assert.deepEqual(vuelta.map((x) => x.text), ida.map((x) => x.text), `las casillas de ${id}`);
    }
  }
});

// ---------------------------------------------------------------- el informe

prueba('el informe dice las cifras con nombres propios', () => {
  const m = modelo({ partes: modelo().partes.concat([{ id: 'p3', etiqueta: 'Temporalización' }]) });
  const r = adoptar(campoDe('tabla'), rejilla(), m);
  assert.equal(r.informe.partes, 3);
  assert.equal(r.informe.casillas, 4);
  assert.equal(r.informe.conTexto, 4);
  assert.equal(r.informe.caracteres, 'Uno'.length + 'Dos'.length + 'lo uno'.length + 'lo dos'.length);
  assert.equal(r.informe.enJuego, 0);
  assert.deepEqual(r.informe.sinContenido, [{ id: 'p3', etiqueta: 'Temporalización' }]);
  assert.equal(r.informe.sentido, 'columnas');
  assert.equal(r.informe.origen, 'modelo');
  assert.equal(r.informe.modelo, 'm');
  assert.equal(r.informe.de, 'filas');
  assert.match(r.informe.frase, /Se colocan 4 casillas en 2 partes de las 3 del modelo/);
  assert.match(r.informe.aviso, /«Temporalización»/);
});

prueba('el informe de una negativa tambien trae las cifras', () => {
  const valor = { filas: [[neg('Nombre'), neg('Temporalización')], [c('Uno'), c('Mayo')]] };
  const r = adoptar(campoDe('tabla'), valor, modelo());
  assert.equal(r.valor, null);
  assert.equal(r.informe.partes, 2);
  assert.equal(r.informe.enJuego, 19);
  assert.equal(r.informe.frase, null);
  assert.deepEqual(r.informe.rotulos.map((x) => x.parte), ['p1']);
});

// ---------------------------------------------------------------- el aspecto impreso

prueba('avisa de lo que cambia de aspecto aunque no se pierda texto', () => {
  // La tabla del Word no lleva la primera fila en negrita, asi que no tiene cabecera
  // (`cabeceraDeTabla`): al adoptar, los rotulos los pone el modelo en negrita y la fila pasa a ser
  // la cabecera que se repite. No se pierde un caracter y el documento no sale igual.
  const valor = { filas: [[c('Nombre'), c('Descripción')], [c('Uno'), c('lo uno')]], anchos: [30, 70] };
  const r = adoptar(campoDe('tabla'), valor, modelo());
  assert.equal(r.motivo, null);
  assert.equal(r.informe.aspecto.cambia, true);
  assert.equal(r.informe.aspecto.estilo, 2);
  assert.equal(r.informe.aspecto.cabecera, true);
  assert.equal(r.informe.aspecto.anchos, true);
  assert.match(r.informe.aviso, /2 rótulos cambian de negrita o de fondo/);
  assert.match(r.informe.aviso, /la cabecera que se repite/);
  assert.match(r.informe.aviso, /deja de llevar sus anchos de columna/);
});

prueba('un modelo con los pesos de la tabla no le cambia las columnas', () => {
  // Los anchos de la tabla y los pesos del modelo son medidas RELATIVAS, asi que lo que cuenta es la
  // proporcion: un modelo que reparte igual no cambia la geometria, y decir que si la cambia seria un
  // aviso falso que ensena a no leer los avisos.
  const m = modelo({ partes: [{ id: 'p1', etiqueta: 'Nombre', peso: 3 }, { id: 'p2', etiqueta: 'Descripción', peso: 7 }] });
  const valor = { filas: [[neg('Nombre'), neg('Descripción')], [c('Uno'), c('lo uno')]], anchos: [30, 70] };
  const r = adoptar(campoDe('tabla'), valor, m);
  assert.equal(r.motivo, null);
  assert.equal(r.informe.aspecto.anchos, false);
  assert.equal(r.informe.aspecto.cambia, false);
  assert.equal(r.informe.aviso, null);
  // Y con otros pesos si cambia.
  const otro = adoptar(campoDe('tabla'), valor, modelo({ partes: [{ id: 'p1', etiqueta: 'Nombre', peso: 7 }, { id: 'p2', etiqueta: 'Descripción', peso: 3 }] }));
  assert.equal(otro.informe.aspecto.anchos, true);
});

prueba('cuando no cambia nada visible, no hay aviso', () => {
  // Rotulos en negrita (asi la tabla ya tenia cabecera), sin anchos y con los nombres del modelo.
  const valor = { filas: [[neg('Nombre'), neg('Descripción')], [c('Uno'), c('lo uno')]] };
  const r = adoptar(campoDe('tabla'), valor, modelo());
  assert.equal(r.motivo, null);
  assert.equal(r.informe.aspecto.cambia, false);
  assert.equal(r.informe.aviso, null);
});

prueba('clave y valor: el estilo por celda deja de imprimirse, y se dice', () => {
  // Una tabla de clave y valor se imprime por sus pares, que son texto pelado: la negrita y el fondo
  // que la celda traia del Word no salen. La casilla los sigue guardando.
  const valor = { filas: [[neg('Familia profesional'), c('Informática', { bold: true })]] };
  const r = adoptar(campoDe('tabla_clave_valor'), valor, mcv());
  assert.equal(r.motivo, null);
  assert.equal(r.valor.casillas.fam.bold, true);
  assert.equal(r.informe.aspecto.contenido, 1);
  assert.match(r.informe.aviso, /pierde la negrita o el fondo que traía del Word/);
});

prueba('a lo alto: avisa si una parte ocupa en el modelo mas columnas que en la tabla', () => {
  const m = mAlto();
  m.partes[0].ancho = 2;
  const r = adoptar(campoDe('tabla'), alto(), m);
  assert.equal(r.motivo, null);
  assert.equal(r.informe.aspecto.ancho, 1);
  assert.match(r.informe.aviso, /un número de columnas distinto/);
});

// ---------------------------------------------------------------- no toca lo que recibe

prueba('no toca el valor que recibe', () => {
  const valor = rejilla();
  const copia = JSON.parse(JSON.stringify(valor));
  adoptar(campoDe('tabla'), valor, modelo());
  assert.deepEqual(valor, copia);
});

console.log(fallos ? `\n${fallos} FALLOS` : '\nsin fallos');
process.exit(fallos ? 1 : 0);
