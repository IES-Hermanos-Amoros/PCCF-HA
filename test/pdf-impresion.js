// Pruebas de lo que el PDF hace con la configuración de impresión (core/impresion.js): qué entra en el
// índice y qué apartados empiezan en página nueva.
//
//   node test/pdf-impresion.js
//
// La regla está probada en test/impresion.js. Aquí se prueba que `buildDocDefinition` la obedece en los
// cuatro sitios donde decide, y que sin configuración no cambia nada:
//
//   1. el título de cada apartado (`tocItem`, `tocMargin`, `pageBreak`)
//   2. el título del bloque de módulos (entra en el índice; su salto de página no se configura)
//   3. el título de cada módulo (entra en el índice; su salto de página tampoco se configura)
//   4. el nodo del índice, que desaparece con `indice: 0` sin quitar la separación de la portada
//
// Y el borde que no se ve hasta imprimir: el primer apartado del cuerpo NO lleva salto aunque la
// configuración lo pida, porque el separador vacío anterior ya lo ha hecho y saldría una página en
// blanco.

'use strict';

const assert = require('assert/strict');
const { buildDocDefinition } = require('../motor/render-generico');

let fallos = 0;
const prueba = (nombre, fn) => {
  try { fn(); console.log(`ok   ${nombre}`); }
  catch (e) { fallos += 1; console.log(`FALLO ${nombre}\n     ${e.message}`); }
};

// ---------------------------------------------------------------- documento sintético
//
// Tres secciones de primer nivel, cada una con dos hijos y un nieto por hijo (1, 1.1, 1.1.1, 1.2,
// 1.2.1…), y una cuarta con instancias: dos módulos con dos apartados cada uno. El primer apartado de
// un módulo baja hasta el nivel 6 de numeración (4.1.1.1.1.1) para llegar al tope de la sangría.
//
// Números impresos dentro del módulo 4.1: 4.1.1 (nivel 3), 4.1.1.1 (4), 4.1.1.1.1 (5),
// 4.1.1.1.1.1 (6), 4.1.2 (3) y 4.1.2.1 (4). El módulo 4.2 es igual.

const sec = (id, titulo, hijos = []) => ({ id, titulo, nivel: 1, campos: [], hijos });

const hijoConNieto = (id) => sec(id, `Apartado ${id}`, [sec(`${id}_n`, `Subapartado ${id}`)]);
const normal = (id) => sec(id, `Seccion ${id}`, [hijoConNieto(`${id}_a`), hijoConNieto(`${id}_b`)]);

const apartadosDeModulo = [
  sec('mod_obj', 'Objetivos', [sec('mod_obj_1', 'Detalle', [sec('mod_obj_2', 'Fino', [sec('mod_obj_3', 'Finisimo')])])]),
  sec('mod_met', 'Metodologia', [sec('mod_met_1', 'Detalle')]),
];

const plantilla = {
  tipo: 'programacion_didactica',
  generada: '2026-01-01T00:00:00.000Z',
  origen: 'prueba',
  secciones: [
    normal('s1'), normal('s2'), normal('s3'),
    { id: 'modulos', titulo: 'Modulos', nivel: 1, instancias: true, etiqueta_instancia: 'modulo', campos: [], hijos: apartadosDeModulo },
  ],
};
const datos = {
  documento: {},
  instancias: [{ titulo: 'Modulo uno', valores: {} }, { titulo: 'Modulo dos', valores: {} }],
};

const generar = (extra = {}) => buildDocDefinition({
  plantilla, datos, instancias: 'todas', titulo: 'Prueba', subtitulo: 'IES', estado: 'aprobado', ...extra,
});

// ---------------------------------------------------------------- lectura de la definición

const numeroDe = (n) => {
  const m = typeof n.text === 'string' ? /^(\d+(?:\.\d+)*)\. /.exec(n.text) : null;
  return m ? m[1] : null;
};
// Solo los títulos numerados (apartados, bloque y módulos), en el orden en que salen.
const titulos = (def) => def.content.filter((n) => numeroDe(n));
const porNumero = (def, numero) => titulos(def).find((n) => numeroDe(n) === numero);
const nivelDe = (numero) => numero.split('.').length;
const enIndice = (def) => def.content.filter((n) => n.tocItem === true);
const conSalto = (def) => titulos(def).filter((n) => n.pageBreak === 'before').map(numeroDe);

// ---------------------------------------------------------------- lo de serie

prueba('sin impresion, con impresion vacia y con los valores de serie la definicion es la misma', () => {
  const base = generar();
  for (const imp of [undefined, null, {}, { indice: 2, saltos: 0 }, { indice: 'roto', saltos: [] }]) {
    const otra = generar({ impresion: imp });
    assert.deepStrictEqual(otra.content, base.content);
    assert.deepStrictEqual(otra.styles, base.styles);
  }
});

prueba('de serie el indice llega al nivel 2: 3 secciones y sus 6 hijos, el bloque de modulos y los 2 modulos', () => {
  const def = generar();
  // 3 * (1 + 2) + bloque + 2 modulos = 12. Nada de dentro de los modulos.
  assert.equal(enIndice(def).length, 12);
  assert.equal(enIndice(def).some((n) => nivelDe(numeroDe(n)) > 2), false);
});

prueba('de serie los titulos de apartado no llevan la clave pageBreak (no basta con que sea undefined)', () => {
  const def = generar();
  for (const n of titulos(def)) {
    const numero = numeroDe(n);
    if (numero === '4') continue; // el bloque de modulos rompe de siempre
    if (/^4\.\d+$/.test(numero)) continue; // los modulos: el primero trae pageBreak undefined, como siempre
    assert.equal('pageBreak' in n, false, `${numero} lleva la clave pageBreak`);
  }
});

prueba('de serie el bloque de modulos y los modulos rompen pagina como siempre: el primer modulo no, el segundo si', () => {
  const def = generar();
  assert.equal(porNumero(def, '4').pageBreak, 'before');
  assert.equal(porNumero(def, '4.1').pageBreak, undefined);
  assert.equal(porNumero(def, '4.2').pageBreak, 'before');
});

// ---------------------------------------------------------------- el indice

prueba('indice 3: entran los apartados principales de dentro de cada modulo (nivel 3)', () => {
  const def = generar({ impresion: { indice: 3 } });
  // 3 * (1 + 2 + 2) + bloque + 2 modulos + 2 apartados * 2 modulos = 22
  assert.equal(enIndice(def).length, 22);
  assert.equal(porNumero(def, '4.1.1').tocItem, true);
  assert.equal(porNumero(def, '4.2.2').tocItem, true);
  assert.equal(porNumero(def, '4.1.1.1').tocItem, false);
});

prueba('indice 4: entran los subapartados de dentro de los modulos, y el numero exacto de entradas', () => {
  const def = generar({ impresion: { indice: 4 } });
  // 22 + 4.k.1.1 y 4.k.2.1 en cada modulo = 26
  assert.equal(enIndice(def).length, 26);
  for (const n of ['4.1.1.1', '4.1.2.1', '4.2.1.1', '4.2.2.1']) assert.equal(porNumero(def, n).tocItem, true, n);
  assert.equal(porNumero(def, '4.1.1.1.1').tocItem, false);
});

prueba('indice 5 y 6: cada nivel mas suma las entradas que le corresponden', () => {
  // 26 + 4.k.1.1.1 (nivel 5) en cada modulo = 28; + 4.k.1.1.1.1 (nivel 6) = 30
  assert.equal(enIndice(generar({ impresion: { indice: 5 } })).length, 28);
  assert.equal(enIndice(generar({ impresion: { indice: 6 } })).length, 30);
});

prueba('indice 1: solo las cuatro secciones de primer nivel', () => {
  const def = generar({ impresion: { indice: 1 } });
  assert.deepEqual(enIndice(def).map(numeroDe), ['1', '2', '3', '4']);
});

prueba('indice 0: no hay nodo toc y ningun nodo lleva tocItem a true', () => {
  const def = generar({ impresion: { indice: 0 } });
  assert.equal(def.content.some((n) => n.toc), false);
  assert.equal(def.content.some((n) => n.tocItem === true), false);
});

prueba('indice 0: la portada sigue quedandose sola, separada del cuerpo por el nodo vacio', () => {
  const con = generar();
  const sin = generar({ impresion: { indice: 0 } });
  const i = sin.content.findIndex((n) => n.text === '' && n.pageBreak === 'before');
  assert.ok(i > 0, 'falta el separador vacio');
  // Lo que hay antes del separador es la portada y nada mas: ningun salto de pagina suelto.
  assert.equal(sin.content.slice(0, i).some((n) => n.pageBreak), false);
  // Y sin indice se pierde exactamente un nodo respecto al de serie.
  assert.equal(sin.content.length, con.content.length - 1);
  // El primer apartado sigue estando justo despues del separador.
  assert.equal(numeroDe(sin.content[i + 1]), '1');
});

prueba('con indice hay exactamente un nodo toc, con su salto de pagina', () => {
  const def = generar({ impresion: { indice: 3 } });
  const tocs = def.content.filter((n) => n.toc);
  assert.equal(tocs.length, 1);
  assert.equal(tocs[0].pageBreak, 'before');
});

// ---------------------------------------------------------------- estilo y sangria

prueba('el estilo sigue topado en h3 aunque el indice llegue al nivel 4, 5 o 6', () => {
  const def = generar({ impresion: { indice: 6 } });
  assert.equal(porNumero(def, '4.1.1').style, 'h3');
  assert.equal(porNumero(def, '4.1.1.1').style, 'h3');
  assert.equal(porNumero(def, '4.1.1.1.1').style, 'h3');
  assert.equal(porNumero(def, '4.1.1.1.1.1').style, 'h3');
  assert.equal(porNumero(def, '1').style, 'h1');
  assert.equal(porNumero(def, '1.1').style, 'h2');
  // y el estilo no depende de la configuracion
  assert.deepEqual(titulos(generar()).map((n) => n.style), titulos(def).map((n) => n.style));
});

prueba('la sangria del indice crece 12 pt por nivel y se topa en 48', () => {
  const def = generar({ impresion: { indice: 6 } });
  const margen = (numero) => porNumero(def, numero).tocMargin[0];
  assert.equal(margen('1'), 0);
  assert.equal(margen('1.1'), 12);
  assert.equal(margen('1.1.1'), 24);
  assert.equal(margen('4.1.1.1'), 36);
  assert.equal(margen('4.1.1.1.1'), 48);
  // nivel 6: 12 * 5 = 60 sin tope
  assert.equal(margen('4.1.1.1.1.1'), 48);
});

prueba('un apartado que no entra en el indice conserva la sangria de siempre', () => {
  const serie = generar();
  assert.deepEqual(porNumero(serie, '4.1.1.1').tocMargin, [24, 0, 0, 0]);
  assert.equal(porNumero(serie, '4.1.1.1').tocItem, false);
});

// ---------------------------------------------------------------- saltos de pagina

prueba('saltos 1: los de primer nivel rompen pagina menos el primero del cuerpo; los de segundo no', () => {
  const def = generar({ impresion: { saltos: 1 } });
  assert.equal('pageBreak' in porNumero(def, '1'), false, 'el primero del cuerpo no lleva salto');
  assert.equal(porNumero(def, '2').pageBreak, 'before');
  assert.equal(porNumero(def, '3').pageBreak, 'before');
  for (const n of ['1.1', '1.2', '2.1', '3.2', '1.1.1']) assert.equal('pageBreak' in porNumero(def, n), false, n);
  // Los saltos de los modulos son los de siempre y los apartados de dentro no rompen.
  assert.deepEqual(conSalto(def), ['2', '3', '4', '4.2']);
});

prueba('saltos 2: tambien rompen los de segundo nivel, y el primer apartado del cuerpo sigue sin salto', () => {
  const def = generar({ impresion: { saltos: 2 } });
  assert.equal('pageBreak' in porNumero(def, '1'), false);
  for (const n of ['1.2', '2', '2.2', '3', '3.2']) assert.equal(porNumero(def, n).pageBreak, 'before', n);
  assert.equal('pageBreak' in porNumero(def, '1.1.1'), false);
  assert.deepEqual(conSalto(def), ['1.2', '2', '2.2', '3', '3.2', '4', '4.2']);
});

// EN ESTE DOCUMENTO NINGUN APARTADO TIENE CASILLAS, asi que debajo de cada titulo no hay nada escrito.
// Eso es lo que hace que «1.1» no rompa aunque la configuracion llegue a su nivel: va pegado a «1» y
// romper dejaria a «1» solo en su pagina. Su hermano «1.2» si rompe. La regla entera, con el porque,
// esta en core/impresion.js; aqui se fija que el PDF la obedece.
prueba('un apartado no se separa de su primer subapartado, y si de su hermano', () => {
  const def = generar({ impresion: { saltos: 3 } });
  assert.equal('pageBreak' in porNumero(def, '1.1'), false, '1.1 va pegado a 1');
  assert.equal('pageBreak' in porNumero(def, '1.1.1'), false, '1.1.1 va pegado a 1.1');
  assert.equal(porNumero(def, '1.2').pageBreak, 'before', '1.2 es hermano de 1.1');
  // Lo mismo dentro de un modulo: el primer apartado va pegado al nombre del modulo.
  assert.equal('pageBreak' in porNumero(def, '4.1.1'), false, '4.1.1 va pegado a 4.1');
  assert.equal(porNumero(def, '4.1.2').pageBreak, 'before', '4.1.2 es hermano de 4.1.1');
});

prueba('con algo escrito debajo del titulo, el primer subapartado si rompe', () => {
  // Una seccion con una casilla escrita: debajo de su titulo hay un parrafo, asi que su primer
  // subapartado ya no se lleva por delante un titulo suelto.
  const conTexto = {
    ...plantilla,
    secciones: [
      { id: 'c1', titulo: 'Con texto', nivel: 1, campos: [{ id: 'cuerpo', tipo: 'texto_largo', etiqueta: 'Cuerpo' }], hijos: [sec('c1_a', 'Hijo')] },
      normal('s2'),
    ],
  };
  const def = buildDocDefinition({
    plantilla: conTexto,
    datos: { documento: { c1: { cuerpo: [{ type: 'p', text: 'algo escrito' }] } }, instancias: [] },
    instancias: 'todas', titulo: 'Prueba', estado: 'aprobado', impresion: { saltos: 2 },
  });
  assert.equal(porNumero(def, '1.1').pageBreak, 'before');
});

prueba('el primer nodo del cuerpo nunca lleva salto, con cualquier valor de saltos: si no sale una pagina en blanco', () => {
  for (let saltos = 0; saltos <= 6; saltos += 1) {
    const def = generar({ impresion: { saltos } });
    const i = def.content.findIndex((n) => n.text === '' && n.pageBreak === 'before');
    const primero = def.content[i + 1];
    assert.equal(numeroDe(primero), '1', `saltos ${saltos}`);
    assert.equal('pageBreak' in primero, false, `saltos ${saltos}`);
  }
});

prueba('los saltos de los modulos no se configuran: el primer modulo no rompe aunque saltos sea alto (seria una pagina en blanco)', () => {
  for (const saltos of [0, 1, 2, 3]) {
    const def = generar({ impresion: { saltos } });
    assert.equal(porNumero(def, '4').pageBreak, 'before', `bloque, saltos ${saltos}`);
    assert.equal(porNumero(def, '4.1').pageBreak, undefined, `modulo 1, saltos ${saltos}`);
    assert.equal(porNumero(def, '4.2').pageBreak, 'before', `modulo 2, saltos ${saltos}`);
  }
});

prueba('saltos 3: los apartados principales de cada modulo empiezan en pagina nueva', () => {
  const def = generar({ impresion: { saltos: 3 } });
  // El PRIMERO de cada modulo no rompe: va pegado al nombre del modulo, que ya ha roto pagina. Si
  // rompiera, en esa pagina quedaria el nombre del modulo y nada mas.
  for (const n of ['4.1.1', '4.2.1']) assert.equal('pageBreak' in porNumero(def, n), false, n);
  for (const n of ['4.1.2', '4.2.2']) assert.equal(porNumero(def, n).pageBreak, 'before', n);
  assert.equal('pageBreak' in porNumero(def, '4.1.1.1'), false);
});

prueba('el indice y los saltos son independientes', () => {
  const def = generar({ impresion: { indice: 0, saltos: 2 } });
  assert.equal(def.content.some((n) => n.toc || n.tocItem === true), false);
  // «2.2» y no «2.1»: «2.1» va pegado a «2», que no tiene nada escrito debajo.
  assert.equal(porNumero(def, '2.2').pageBreak, 'before');
});

console.log(fallos ? `\n${fallos} prueba(s) con fallo` : '\nTodo bien');
process.exit(fallos ? 1 : 0);
