// Lo que hay que SABER y DECIR al cambiar la estructura de la ficha de situación de aprendizaje.
//
// La estructura (core/sa.js, core/plantilla.js) decide qué filas tiene la ficha; esta lógica
// mide qué hay ESCRITO detrás de cada fila y redacta el informe de reconocimiento de cada cambio:
// qué ha pasado (para `role="status"`) y qué se deja de imprimir, nombrándolo (para `role="alert"`).
// Es el patrón de `informe` en core/ra-ce.js y de `informeDeFilas` en core/sa.js: la pantalla no
// compone ninguna frase, y la pérdida callada es justo lo que este informe existe para evitar.
//
// POR QUÉ SE CUENTA POR ID. El texto de una ficha vive bajo el id de la fila (`ficha[id]`), no bajo
// su etiqueta. Retirar una fila no borra ese texto pero deja de imprimirlo, y eso no se ve: de ahí
// que «retirar» diga en cuántas fichas había algo escrito.
//
// LA TABLA PROPIA. Una ficha importada del Word conserva su tabla (`filas`) y mientras la conserva
// lo que se imprime es esa tabla, no la estructura (core/sa.js, `completarDesdeFilas`). El recuento
// la separa: `conRejilla` son las fichas a las que un cambio de estructura no llega.
//
// Esto es lógica pura: sin DOM, sin red, sin node. Cuelga de `global.Core.fichaEstructura`.

(function (global) {
  'use strict';

  // Lo escrito en un campo de la ficha es una lista de líneas o un texto; cuenta si tiene algo más
  // que espacios.
  function hayTexto(v) {
    if (Array.isArray(v)) return v.some((x) => String(x == null ? '' : x).trim() !== '');
    return String(v == null ? '' : v).trim() !== '';
  }

  const tieneRejilla = (ficha) => !!ficha && Array.isArray(ficha.filas) && ficha.filas.length > 0;

  // Las fichas que guarda UNA fila de `apartados`. Hay dos formas: un campo de tipo ficha con la
  // lista (o con una sola), y un repetidor (`items`) cuyas entradas llevan la ficha dentro. `ids`
  // son los ids de los campos de tipo ficha del apartado; quien llama es quien los conoce.
  function fichasDeValores(valores, ids) {
    const v = valores && typeof valores === 'object' ? valores : {};
    const out = [];
    const poner = (x) => {
      (Array.isArray(x) ? x : [x]).forEach((f) => { if (f && typeof f === 'object') out.push(f); });
    };
    (ids || []).forEach((id) => { if (v[id] != null) poner(v[id]); });
    if (Array.isArray(v.items)) v.items.forEach((it) => { if (it && it.ficha != null) poner(it.ficha); });
    return out;
  }

  // EL RECUENTO, de una lista de fichas y de la estructura con los retirados incluidos: lo escrito
  // en una fila retirada sigue ahí y vuelve al restaurarla. Devuelve el total, cuántas conservan su
  // tabla y, por cada id, en cuántas hay texto (y de ellas, cuántas conservan su tabla).
  function recuento(fichas, campos) {
    const lista = Array.isArray(fichas) ? fichas : [];
    const porCampo = {};
    (campos || []).forEach((c) => { porCampo[c.id] = { conTexto: 0, conTextoYRejilla: 0 }; });
    let conRejilla = 0;
    lista.forEach((f) => {
      const rej = tieneRejilla(f);
      if (rej) conRejilla += 1;
      Object.keys(porCampo).forEach((id) => {
        if (!hayTexto(f && f[id])) return;
        porCampo[id].conTexto += 1;
        if (rej) porCampo[id].conTextoYRejilla += 1;
      });
    });
    return { total: lista.length, conRejilla, sinRejilla: lista.length - conRejilla, porCampo };
  }

  const fichas = (n) => (n === 1 ? '1 ficha' : n + ' fichas');
  const nombre = (c) => '«' + ((c && (c.etiqueta || c.id)) || '') + '»';
  const conTextoEn = (r, id) => (r && r.porCampo && r.porCampo[id] ? r.porCampo[id].conTexto : 0);

  // CUÁNTAS FICHAS SIGUEN CON LA TABLA QUE VINO DEL WORD, que es lo que contesta a «¿esto cambia las
  // fichas que ya están?». Sin tecnicismos: quien lo lee es la jefatura, no quien escribió el código.
  function fraseDeTablaPropia(r) {
    const n = r ? r.conRejilla : 0;
    const total = r ? r.total : 0;
    if (!total) return 'Todavía no hay ninguna ficha escrita.';
    if (!n) return (total === 1 ? 'La única ficha sigue' : 'Las ' + total + ' fichas siguen') + ' la estructura: lo que cambies aquí cambia todas.';
    if (n === total) {
      return (total === 1 ? 'La única ficha conserva' : 'Las ' + total + ' fichas conservan')
        + ' la tabla tal como vino del Word y se imprime esa tabla: cambiar la estructura no cambia'
        + ' ninguna ficha de las que hay.';
    }
    const otras = total - n;
    return (n === 1 ? '1 ficha de las ' + total + ' conserva' : n + ' fichas de las ' + total + ' conservan')
      + ' la tabla tal como vino del Word y se imprime esa tabla: cambiar la estructura no las'
      + ' cambia. ' + (otras === 1 ? 'La otra sigue' : 'Las otras ' + otras + ' siguen')
      + ' la estructura.';
  }

  const esEntero = (x) => Number.isInteger(x);

  // «7.ª de 12», o nada si no se sabe el sitio: ver el resguardo de `campo_ficha_movido`.
  const sitio = (posicion, filas) => (esEntero(posicion) && esEntero(filas)
    ? posicion + '.ª de ' + filas
    : '');

  // EL INFORME DE UN CAMBIO YA HECHO. `cambio` es el que apunta el servidor
  // (`{ tipo, campoFicha, etiqueta, antes?, posicion?, filas? }`) y `r` el recuento. Devuelve
  // `{ estado, alerta }`: `estado` dice qué ha pasado y `alerta` lo que deja de imprimirse (o sale en
  // blanco), nombrándolo; null si no hay nada que avisar.
  function informeDeCambio(cambio, r) {
    const c = cambio || {};
    const et = '«' + (c.etiqueta || c.campoFicha || '') + '»';
    const n = conTextoEn(r, c.campoFicha);
    const total = r ? r.total : 0;
    switch (c.tipo) {
      case 'campo_ficha_retirado':
        return {
          estado: 'Fila ' + et + ' retirada de la ficha. No se ha borrado nada.',
          alerta: n
            ? 'Deja de imprimirse el texto de ' + et + ' en ' + fichas(n) + ' de ' + total
              + ': sigue guardado y vuelve al restaurar la fila.'
            : null,
        };
      case 'campo_ficha_restaurado':
        return {
          estado: 'Fila ' + et + ' restaurada en la ficha.',
          alerta: n ? 'Vuelve a imprimirse el texto de ' + et + ' en ' + fichas(n) + ' de ' + total + '.' : null,
        };
      case 'campo_ficha_renombrado':
        return {
          estado: 'Fila «' + (c.antes || '') + '» renombrada a ' + et + '. El texto escrito en las fichas no se toca.',
          alerta: null,
        };
      // EL SITIO SOLO SE DICE SI SE SABE. Sin este resguardo, un cambio que llegara sin
      // `posicion` pondría «ahora es la undefined.ª de undefined» delante de quien lo ha hecho,
      // y un número que no se tiene se calla, no se escribe.
      case 'campo_ficha_movido':
        return {
          estado: 'Fila ' + et + (sitio(c.posicion, c.filas) ? ' movida: ahora es la ' + sitio(c.posicion, c.filas) + '.' : ' movida.'),
          alerta: null,
        };
      case 'campo_ficha_anadido':
        return {
          estado: 'Fila ' + et + (esEntero(c.posicion) ? ' añadida en el puesto ' + c.posicion + '.' : ' añadida a la ficha.'),
          alerta: total ? 'La fila nueva sale en blanco en ' + (total === 1 ? 'la ficha' : 'las ' + total + ' fichas') + ': nadie ha escrito nada en ella.' : null,
        };
      default:
        return { estado: 'Estructura de la ficha cambiada.', alerta: null };
    }
  }

  // LO QUE VA A LLEVARSE POR DELANTE RETIRAR, dicho antes de pulsar.
  function avisoAntesDeRetirar(campo, r) {
    const n = conTextoEn(r, campo && campo.id);
    return n
      ? 'Retirar ' + nombre(campo) + ' deja de imprimir lo escrito en ' + fichas(n) + ' de ' + r.total + '. No se borra.'
      : 'Retirar ' + nombre(campo) + ': ninguna ficha tiene nada escrito en esa fila.';
  }

  const api = {
    hayTexto, tieneRejilla, fichasDeValores, recuento, conTextoEn, fraseDeTablaPropia,
    informeDeCambio, avisoAntesDeRetirar,
  };
  global.Core = global.Core || {};
  global.Core.fichaEstructura = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
