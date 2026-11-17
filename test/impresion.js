// Pruebas de core/impresion.js: hasta qué nivel llega el índice y qué apartados empiezan en página
// nueva.
//
//   node test/impresion.js
//
// Lo que se fija aquí, por este orden de importancia:
//
//   1. QUE LO DE SERIE ES LO DE SIEMPRE. El índice hasta el nivel 2 y ningún salto además de los que
//      el documento ya hacía. Un documento sin configurar tiene que salir como salía: es lo que
//      sostiene el criterio de aceptación del E1.
//   2. QUE UN DATO ROTO NO CAMBIA NADA. El valor llega de la base de datos, de un formulario o de la
//      dirección de la exportación, así que llega cualquier cosa. Nada de eso puede dejar un
//      documento sin índice ni llenarlo de páginas en blanco.
//   3. QUE EL NIVEL ES EL DE LA NUMERACIÓN IMPRESA, que es lo que hace que los apartados de dentro de
//      un módulo sean nivel 3 y no nivel 1. Ahí estaba la queja.

'use strict';

const assert = require('assert/strict');
const Imp = require('../core/impresion');

let fallos = 0;
const prueba = (nombre, fn) => {
  try { fn(); console.log(`ok   ${nombre}`); }
  catch (e) { fallos += 1; console.log(`FALLO ${nombre}\n     ${e.message}`); }
};

// ---------------------------------------------------------------- lo de serie

prueba('sin configurar: indice hasta el nivel 2 y ningun salto, que es lo que hacia el PDF', () => {
  assert.deepStrictEqual(Imp.normalizarConfig(undefined), { indice: 2, saltos: 0 });
  assert.deepStrictEqual(Imp.normalizarConfig(null), { indice: 2, saltos: 0 });
  assert.deepStrictEqual(Imp.normalizarConfig({}), { indice: 2, saltos: 0 });
  assert.equal(Imp.INDICE_DE_SERIE, 2);
  assert.equal(Imp.SALTOS_DE_SERIE, 0);
});

prueba('sin configurar entra en el indice lo de nivel 1 y 2, y no lo de dentro de un modulo', () => {
  const c = undefined;
  assert.equal(Imp.entraEnElIndice('1', c), true);
  assert.equal(Imp.entraEnElIndice('5.1', c), true);
  // Un apartado de primer nivel DE UN MODULO sale numerado con tres cifras: es el que faltaba.
  assert.equal(Imp.entraEnElIndice('5.1.3', c), false);
  assert.equal(Imp.entraEnElIndice('5.1.3.2', c), false);
});

prueba('sin configurar no empieza en pagina nueva ningun apartado', () => {
  for (const n of ['1', '2.1', '5.1.3', '5.1.3.2']) {
    assert.equal(Imp.empiezaEnPaginaNueva(n, undefined), false, `nivel de ${n}`);
  }
});

// ---------------------------------------------------------------- el nivel es el del numero impreso

prueba('el nivel se cuenta por las cifras del numero que se imprime', () => {
  assert.equal(Imp.nivelDelNumero('1'), 1);
  assert.equal(Imp.nivelDelNumero('5.1'), 2);
  assert.equal(Imp.nivelDelNumero('5.1.3'), 3);
  assert.equal(Imp.nivelDelNumero('5.1.3.2'), 4);
  assert.equal(Imp.nivelDelNumero('10.11.12'), 3);
});

prueba('el nivel aguanta el numero con el titulo pegado, que es como lo pinta el motor', () => {
  assert.equal(Imp.nivelDelNumero('5.1.3. Metodología'), 3);
  assert.equal(Imp.nivelDelNumero('  5.1. Lenguajes de marcas  '), 2);
});

prueba('un numero que no es un numero es nivel 0, y no entra en el indice ni rompe una pagina', () => {
  for (const malo of ['', null, undefined, 'Situación de aprendizaje 1', {}, []]) {
    assert.equal(Imp.nivelDelNumero(malo), 0, `nivel de ${JSON.stringify(malo)}`);
    assert.equal(Imp.entraEnElIndice(malo, { indice: 6 }), false, `indice de ${JSON.stringify(malo)}`);
    assert.equal(Imp.empiezaEnPaginaNueva(malo, { saltos: 6 }), false, `salto de ${JSON.stringify(malo)}`);
  }
});

// ---------------------------------------------------------------- configurado

prueba('indice hasta 3: entran los apartados de dentro de un modulo, no sus subapartados', () => {
  const c = { indice: 3 };
  assert.equal(Imp.entraEnElIndice('1', c), true);
  assert.equal(Imp.entraEnElIndice('5.1', c), true);
  assert.equal(Imp.entraEnElIndice('5.1.3', c), true);
  assert.equal(Imp.entraEnElIndice('5.1.3.2', c), false);
});

prueba('indice hasta 4: entra todo lo que la plantilla mas profunda numera', () => {
  const c = { indice: 4 };
  for (const n of ['1', '5.1', '5.1.3', '5.1.3.2']) assert.equal(Imp.entraEnElIndice(n, c), true, n);
  assert.equal(Imp.entraEnElIndice('5.1.3.2.1', c), false);
});

prueba('indice 0: el documento sale sin indice, y se puede preguntar sin recorrer nada', () => {
  assert.equal(Imp.llevaIndice({ indice: 0 }), false);
  assert.equal(Imp.llevaIndice({ indice: 1 }), true);
  assert.equal(Imp.llevaIndice(undefined), true);
  for (const n of ['1', '5.1']) assert.equal(Imp.entraEnElIndice(n, { indice: 0 }), false, n);
});

prueba('saltos hasta 1: solo los apartados de primer nivel empiezan en pagina nueva', () => {
  const c = { saltos: 1 };
  assert.equal(Imp.empiezaEnPaginaNueva('1', c), true);
  assert.equal(Imp.empiezaEnPaginaNueva('2.1', c), false);
  assert.equal(Imp.empiezaEnPaginaNueva('5.1.3', c), false);
});

prueba('saltos hasta 2: tambien el segundo nivel', () => {
  const c = { saltos: 2 };
  assert.equal(Imp.empiezaEnPaginaNueva('1', c), true);
  assert.equal(Imp.empiezaEnPaginaNueva('2.1', c), true);
  assert.equal(Imp.empiezaEnPaginaNueva('5.1.3', c), false);
});

prueba('los dos numeros son independientes: el indice no decide los saltos', () => {
  const c = { indice: 4, saltos: 0 };
  assert.equal(Imp.entraEnElIndice('5.1.3.2', c), true);
  assert.equal(Imp.empiezaEnPaginaNueva('1', c), false);
  const d = { indice: 0, saltos: 2 };
  assert.equal(Imp.entraEnElIndice('1', d), false);
  assert.equal(Imp.empiezaEnPaginaNueva('2.1', d), true);
});

// ---------------------------------------------------------------- un dato roto no cambia nada

prueba('un valor que no es un entero del rango cae en el de serie, no a medias', () => {
  // Lo de fuera de rango NO se recorta: un 9 no es «hasta 6», es un dato que nadie ha elegido.
  for (const malo of ['x', true, {}, [], 2.5, -1, 7, 99, NaN, Infinity]) {
    assert.deepStrictEqual(
      Imp.normalizarConfig({ indice: malo, saltos: malo }),
      { indice: 2, saltos: 0 },
      `indice y saltos con ${JSON.stringify(malo)}`,
    );
  }
});

prueba('una configuracion que no es un objeto se trata como si no hubiera ninguna', () => {
  for (const malo of ['x', 7, true, [], [{ indice: 4 }]]) {
    assert.deepStrictEqual(Imp.normalizarConfig(malo), { indice: 2, saltos: 0 }, JSON.stringify(malo));
  }
});

prueba('el numero en texto vale, que es como llega de un formulario o de la direccion', () => {
  assert.deepStrictEqual(Imp.normalizarConfig({ indice: '4', saltos: '1' }), { indice: 4, saltos: 1 });
  assert.deepStrictEqual(Imp.normalizarConfig({ indice: ' 3 ', saltos: ' 0 ' }), { indice: 3, saltos: 0 });
  // La cadena vacía es «no se ha dicho nada», que es lo que manda un desplegable sin elegir.
  assert.deepStrictEqual(Imp.normalizarConfig({ indice: '', saltos: '' }), { indice: 2, saltos: 0 });
});

prueba('el cero es una eleccion y no un hueco: no cae en el de serie', () => {
  assert.deepStrictEqual(Imp.normalizarConfig({ indice: 0 }), { indice: 0, saltos: 0 });
  assert.deepStrictEqual(Imp.normalizarConfig({ indice: '0' }), { indice: 0, saltos: 0 });
});

// ---------------------------------------------------------------- guardar y fusionar

prueba('solo se guarda lo que se aparta de lo de serie, y si no se aparta en nada no se guarda', () => {
  assert.equal(Imp.comprimirConfig(undefined), null);
  assert.equal(Imp.comprimirConfig({ indice: 2, saltos: 0 }), null);
  assert.deepStrictEqual(Imp.comprimirConfig({ indice: 4 }), { indice: 4 });
  assert.deepStrictEqual(Imp.comprimirConfig({ saltos: 1 }), { saltos: 1 });
  assert.deepStrictEqual(Imp.comprimirConfig({ indice: 0, saltos: 2 }), { indice: 0, saltos: 2 });
});

prueba('un dato roto no se guarda: lo comprimido siempre es una eleccion valida', () => {
  assert.equal(Imp.comprimirConfig({ indice: 'x', saltos: 99 }), null);
  assert.deepStrictEqual(Imp.comprimirConfig({ indice: 'x', saltos: 1 }), { saltos: 1 });
});

prueba('fusionar: lo que no llega no se borra', () => {
  const hay = { indice: 4, saltos: 1 };
  assert.deepStrictEqual(Imp.fusionarConfig(hay, { indice: 3 }), { indice: 3, saltos: 1 });
  assert.deepStrictEqual(Imp.fusionarConfig(hay, { saltos: 0 }), { indice: 4, saltos: 0 });
  assert.deepStrictEqual(Imp.fusionarConfig(hay, {}), { indice: 4, saltos: 1 });
  assert.deepStrictEqual(Imp.fusionarConfig(hay, undefined), { indice: 4, saltos: 1 });
});

prueba('fusionar: un cambio roto deja lo que habia, no lo de serie', () => {
  const hay = { indice: 4, saltos: 1 };
  assert.deepStrictEqual(Imp.fusionarConfig(hay, { indice: 'x' }), { indice: 4, saltos: 1 });
  assert.deepStrictEqual(Imp.fusionarConfig(hay, { indice: 99, saltos: -3 }), { indice: 4, saltos: 1 });
});

prueba('fusionar sobre un documento sin configurar parte de lo de serie', () => {
  assert.deepStrictEqual(Imp.fusionarConfig(null, { indice: 3 }), { indice: 3, saltos: 0 });
  assert.deepStrictEqual(Imp.fusionarConfig(null, {}), { indice: 2, saltos: 0 });
});

prueba('el tope es 6 y esta dicho en la propia regla', () => {
  assert.equal(Imp.NIVEL_MAXIMO, 6);
  assert.deepStrictEqual(Imp.normalizarConfig({ indice: 6, saltos: 6 }), { indice: 6, saltos: 6 });
  assert.deepStrictEqual(Imp.normalizarConfig({ indice: 7 }), { indice: 2, saltos: 0 });
});

// ---------------------------------------------------------------- nunca un titulo solo en su pagina

prueba('el primer apartado del cuerpo no rompe pagina: delante tiene el indice, que ya rompio', () => {
  const s = Imp.rompePaginas({ saltos: 1 });
  assert.equal(s.titulo('1'), false);
});

prueba('un apartado de primer nivel rompe en cuanto hay algo escrito delante', () => {
  const s = Imp.rompePaginas({ saltos: 1 });
  assert.equal(s.titulo('1'), false);
  s.escrito();
  assert.equal(s.titulo('2'), true);
  s.escrito();
  assert.equal(s.titulo('3'), true);
});

prueba('un apartado sin nada escrito no deja a SU subapartado romper: no se queda solo arriba', () => {
  const s = Imp.rompePaginas({ saltos: 2 });
  s.escrito();
  assert.equal(s.titulo('2'), true);
  // «2» no tiene campos: su primer subapartado va justo debajo y NO rompe, o «2» se queda solo.
  assert.equal(s.titulo('2.1'), false);
  s.escrito();
  // El segundo subapartado si: ya hay algo escrito en la pagina.
  assert.equal(s.titulo('2.2'), true);
});

prueba('un apartado vacio seguido de otro que NO es suyo si rompe: se lleva su pagina', () => {
  const s = Imp.rompePaginas({ saltos: 1 });
  s.escrito();
  assert.equal(s.titulo('2'), true);
  // «2» se queda sin nada escrito, pero «3» no cuelga de «2»: cada uno con su pagina, que es lo
  // que se ha pedido al configurar que cada apartado empiece en pagina nueva.
  assert.equal(s.titulo('3'), true);
});

prueba('un subapartado vacio seguido de su hermano rompe, y seguido de su hijo no', () => {
  const s = Imp.rompePaginas({ saltos: 3 });
  s.escrito();
  assert.equal(s.titulo('2.1'), true);
  assert.equal(s.titulo('2.1.1'), false, 'el hijo va pegado a su padre');
  assert.equal(s.titulo('2.1.2'), true, 'el hermano del hijo si rompe');
});

prueba('el titulo de un modulo no deja a su primer apartado romper', () => {
  const s = Imp.rompePaginas({ saltos: 3 });
  // El bloque de modulos y el modulo rompen por su cuenta: el motor lo cuenta, no lo pregunta.
  s.tituloFijo('5');
  s.escrito();
  s.tituloFijo('5.1');
  assert.equal(s.titulo('5.1.1'), false, 'el primer apartado del modulo no rompe');
  s.escrito();
  assert.equal(s.titulo('5.1.2'), true, 'el segundo si');
});

prueba('una cadena de titulos encadenados no se reparte en paginas casi vacias', () => {
  const s = Imp.rompePaginas({ saltos: 6 });
  s.escrito();
  assert.equal(s.titulo('2'), true);
  assert.equal(s.titulo('2.1'), false);
  assert.equal(s.titulo('2.1.1'), false);
  assert.equal(s.titulo('2.1.1.1'), false);
  s.escrito();
  assert.equal(s.titulo('2.1.1.2'), true);
});

prueba('padre e hijo se reconocen por cifras y no por texto: 5.1 no es padre de 5.10', () => {
  assert.equal(Imp.esAscendiente('2', '2.1'), true);
  assert.equal(Imp.esAscendiente('5.1', '5.1.1'), true);
  assert.equal(Imp.esAscendiente('5', '5.1.1'), true);
  assert.equal(Imp.esAscendiente('5.1', '5.10'), false);
  assert.equal(Imp.esAscendiente('5.1', '5.2'), false);
  assert.equal(Imp.esAscendiente('5.1', '5.1'), false, 'uno no es ascendiente de si mismo');
  assert.equal(Imp.esAscendiente('5.1.1', '5.1'), false, 'al reves no');
  assert.equal(Imp.esAscendiente(null, '1'), false);
  assert.equal(Imp.esAscendiente('1', null), false);
});

prueba('sin saltos configurados no rompe nunca, por mucho que se le cuente', () => {
  const s = Imp.rompePaginas(undefined);
  for (const n of ['1', '2', '2.1', '5.1.3']) { s.escrito(); assert.equal(s.titulo(n), false, n); }
});

prueba('cada documento lleva su propio contador: dos no se pisan', () => {
  const a = Imp.rompePaginas({ saltos: 1 });
  const b = Imp.rompePaginas({ saltos: 1 });
  a.escrito();
  assert.equal(a.titulo('2'), true);
  // `b` sigue recien empezado: su primer titulo no rompe.
  assert.equal(b.titulo('2'), false);
});

prueba('la regla cuelga de global.Core como las demas de core/', () => {
  assert.equal(typeof globalThis.Core.impresion.entraEnElIndice, 'function');
  assert.equal(globalThis.Core.impresion, Imp);
});

console.log(fallos ? `\n${fallos} FALLOS` : '\nTodo bien');
process.exit(fallos ? 1 : 0);
