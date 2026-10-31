// Editor de bloques. El estado es el array que espera el renderer del PDF:
//
//   { type: 'p',    text: '…' }
//   { type: 'p',    text: [{ text: 'La nota ' }, { text: 'mínima', bold: true }] }
//   { type: 'list', items: [{ text: '…', level: 0 }] }
//   { ref: 'c001' }                                   ← texto compartido
//
// y nada más. La vista se pinta DESDE ese array y las ediciones van AL array:
// el editor no lee nunca el DOM. Por eso el texto se escribe en <textarea>, que
// por construcción solo puede devolver texto plano; con `contenteditable` (lo que
// hacía el v1) cualquier pegado desde Word mete HTML en el modelo y el PDF deja
// de salir igual.
//
// NEGRITA Y CURSIVA
//
// Sí están, y llegan al PDF de verdad: `text` puede ser una lista de tramos
// { text, bold, italics }, que es lo que pdfmake acepta en cualquier nodo de
// texto (la tabla de RA/CE del renderer ya lo usaba). Lo comprueba de punta a
// punta poc-pdfmake/scripts/test-texto-rico.js.
//
// Como el texto se escribe en un <textarea>, el formato se marca con dos
// caracteres en lugar de con un selector de fuente:
//
//   **negrita**      *cursiva*      ***las dos***
//
// No hay que escribirlos a mano: los botones N y C de la barra de herramientas
// marcan lo seleccionado (o la palabra donde esté el cursor), igual que en el v1,
// y debajo del campo se ve el párrafo ya formateado. En el modelo se guardan los
// tramos, nunca las marcas: un párrafo sin formato sigue guardándose como una
// cadena, igual que lo deja el importador.
//
// Ojo con los atajos: en Word en español la negrita es Ctrl+N, pero en un
// navegador Ctrl+N abre una ventana nueva y no se puede capturar. Aquí son
// Ctrl+B / Ctrl+I, o Alt+N / Alt+C para quien tenga la costumbre española.
//
// Lo que sigue sin haber son enlaces: el renderer no pinta ninguno todavía.

(function (global) {
  'use strict';

  const { esc } = global.Util;
  const C = global.Contenido;

  const copia = (x) => JSON.parse(JSON.stringify(x));

  // ---------------------------------------------------------------- formato
  // ***las dos*** primero, para que no se lo coman las reglas más cortas.
  const MARCAS = /\*\*\*([^*]+)\*\*\*|\*\*([^*]+)\*\*|\*([^*]+)\*/g;

  // Texto plano de un valor que puede ser cadena o lista de tramos.
  const plano = (t) => (Array.isArray(t)
    ? t.map((r) => (r && typeof r === 'object' ? (r.text || '') : r)).join('')
    : String(t == null ? '' : t));

  // Lo que se escribe en el campo -> lo que se guarda en el modelo.
  // Si no hay ninguna marca se devuelve la cadena tal cual: el modelo más simple
  // posible, y el que produce el importador.
  function aTramos(texto) {
    const cadena = String(texto == null ? '' : texto);
    const out = [];
    let i = 0;
    let m;
    MARCAS.lastIndex = 0;
    while ((m = MARCAS.exec(cadena))) {
      if (m.index > i) out.push({ text: cadena.slice(i, m.index) });
      if (m[1] != null) out.push({ text: m[1], bold: true, italics: true });
      else if (m[2] != null) out.push({ text: m[2], bold: true });
      else out.push({ text: m[3], italics: true });
      i = m.index + m[0].length;
    }
    if (i < cadena.length) out.push({ text: cadena.slice(i) });
    return out.some((r) => r.bold || r.italics) ? out : cadena;
  }

  // Lo que se guarda en el modelo -> lo que se escribe en el campo.
  function aMarcas(valor) {
    if (!Array.isArray(valor)) return String(valor == null ? '' : valor);
    return valor.map((r) => {
      const t = r && typeof r === 'object' ? String(r.text == null ? '' : r.text) : String(r);
      if (!r || typeof r !== 'object') return t;
      if (r.bold && r.italics) return '***' + t + '***';
      if (r.bold) return '**' + t + '**';
      if (r.italics) return '*' + t + '*';
      return t;
    }).join('');
  }

  // ---- el botón N / C: poner y quitar las marcas alrededor de un trozo
  //
  // Es una función pura —texto y selección entran, texto y selección salen— para
  // poder probarla sin navegador; ui.js solo lee y devuelve la selección del
  // <textarea>. Cuenta los asteriscos pegados a los bordes de la selección, así
  // que el botón funciona como interruptor y las dos marcas se combinan:
  //
  //   hola  + N -> **hola**        **hola**  + N -> hola
  //   *hola* + N -> ***hola***     ***hola*** + C -> **hola**
  const PALABRA = /[0-9A-Za-zÀ-ÖØ-öø-ÿ_]/;

  function marcar(valor, desde, hasta, tipo) {
    const texto = String(valor == null ? '' : valor);
    const tope = texto.length;
    const limita = (n) => Math.max(0, Math.min(tope, Number.isFinite(n) ? n : 0));
    let a = Math.min(limita(desde), limita(hasta));
    let b = Math.max(limita(desde), limita(hasta));

    // Sin selección, la marca va a la palabra donde esté el cursor, que es lo
    // que hace cualquier procesador de textos.
    if (a === b) {
      while (a > 0 && PALABRA.test(texto[a - 1])) a -= 1;
      while (b < tope && PALABRA.test(texto[b])) b += 1;
    }
    // Los espacios y los asteriscos de los bordes se dejan fuera, para no
    // generar marcas sueltas del tipo `** hola**` ni anidarlas por error.
    while (a < b && /\s/.test(texto[a])) a += 1;
    while (b > a && /\s/.test(texto[b - 1])) b -= 1;
    while (a < b && texto[a] === '*') a += 1;
    while (b > a && texto[b - 1] === '*') b -= 1;

    const marca = tipo === 'bold' ? '**' : '*';

    // Cursor en un hueco sin palabra: se abren las marcas y el cursor se queda
    // dentro, para seguir escribiendo ya en negrita.
    if (a === b) {
      return {
        valor: texto.slice(0, a) + marca + marca + texto.slice(a),
        desde: a + marca.length,
        hasta: a + marca.length,
        puesta: true,
      };
    }

    const seguidos = (trozo, porElFinal) => {
      let n = 0;
      while (n < 3 && trozo[porElFinal ? trozo.length - 1 - n : n] === '*') n += 1;
      return n;
    };
    const n = Math.min(seguidos(texto.slice(0, a), true), seguidos(texto.slice(b), false));
    const puesta = tipo === 'bold' ? n < 2 : (n !== 1 && n !== 3);
    const dentro = texto.slice(a, b);

    if (puesta) {
      return {
        valor: texto.slice(0, a) + marca + dentro + marca + texto.slice(b),
        desde: a + marca.length,
        hasta: b + marca.length,
        puesta: true,
      };
    }
    return {
      valor: texto.slice(0, a - marca.length) + dentro + texto.slice(b + marca.length),
      desde: a - marca.length,
      hasta: b - marca.length,
      puesta: false,
    };
  }

  // Tramos -> HTML, para pintarlos en la página (y en la vista previa).
  function aHtml(valor) {
    if (!Array.isArray(valor)) return esc(valor);
    return valor.map((r) => {
      if (!r || typeof r !== 'object') return esc(r);
      let html = esc(r.text == null ? '' : r.text);
      if (r.bold) html = '<strong>' + html + '</strong>';
      if (r.italics) html = '<em>' + html + '</em>';
      return html;
    }).join('');
  }

  // ---------------------------------------------------------------- pintado
  function pintarLista(b, indice, editable) {
    const items = b.items.map((it, j) => {
      const sangria = 'margin-left:' + (it.level || 0) * 18 + 'px';
      if (!editable) return '<li style="' + sangria + '">' + aHtml(it.text) + '</li>';
      return '<li style="' + sangria + '">'
        + '<textarea class="campo campo-item" rows="1" data-bloque="' + indice + '" data-item="' + j + '"'
        + ' aria-label="Elemento ' + (j + 1) + ' de la lista">' + esc(aMarcas(it.text)) + '</textarea>'
        + '<span class="item-acciones">'
        + '<button class="mini" data-op="sangrar" data-bloque="' + indice + '" data-item="' + j + '" title="Más sangría">→</button>'
        + '<button class="mini" data-op="desangrar" data-bloque="' + indice + '" data-item="' + j + '" title="Menos sangría">←</button>'
        + '<button class="mini" data-op="quitar-item" data-bloque="' + indice + '" data-item="' + j + '" title="Quitar este elemento">×</button>'
        + '</span></li>';
    }).join('');
    return '<ul class="bloque bloque-lista">' + items + '</ul>'
      + (editable ? '<button class="mini mini-add" data-op="anadir-item" data-bloque="' + indice + '">+ elemento</button>' : '');
  }

  function pintarCompartido(b, indice, permisos) {
    const c = C.COMPARTIDOS[b.ref];
    if (!c) return '<p class="bloque aviso-roto">[texto compartido ' + esc(b.ref) + ' no encontrado]</p>';
    const botones = [];
    if (permisos && permisos.editarGlobal) botones.push('<button class="mini" data-op="editar-global" data-bloque="' + indice + '">Editar para todas las unidades</button>');
    if (permisos && permisos.desvincular) botones.push('<button class="mini" data-op="desvincular" data-bloque="' + indice + '">Desvincular y quedarme una copia</button>');
    return '<div class="bloque bloque-compartido">'
      + '<div class="compartido-cab">'
      + '<span class="distintivo distintivo-com">texto compartido ' + esc(b.ref) + ' · v' + c.version + '</span>'
      + '<span class="suave">' + (c.modo === 'obligatorio' ? 'obligatorio: no se puede desvincular' : 'sugerido') + '</span>'
      + '</div>'
      + '<p>' + aHtml(c.bloque.text) + '</p>'
      + (botones.length ? '<div class="compartido-acciones">' + botones.join('') + '</div>' : '')
      + '</div>';
  }

  function pintarParrafo(b, indice, editable) {
    if (!editable) return '<p class="bloque">' + aHtml(b.text) + '</p>';
    const conFormato = Array.isArray(b.text);
    return '<div class="bloque bloque-parrafo">'
      + '<textarea class="campo" rows="3" data-bloque="' + indice + '" aria-label="Párrafo ' + (indice + 1) + '">'
      + esc(aMarcas(b.text)) + '</textarea>'
      + '<div class="bloque-acciones">'
      + '<button class="mini" data-op="a-lista" data-bloque="' + indice + '" title="Convertir en lista">• lista</button>'
      + '<button class="mini" data-op="subir" data-bloque="' + indice + '" title="Subir">↑</button>'
      + '<button class="mini" data-op="bajar" data-bloque="' + indice + '" title="Bajar">↓</button>'
      + '<button class="mini" data-op="quitar" data-bloque="' + indice + '" title="Eliminar el bloque">×</button>'
      + '</div>'
      + '<div class="vista-previa" data-previa="' + indice + '"' + (conFormato ? '' : ' hidden') + '>'
      + '<span class="previa-etq">así saldrá</span>' + aHtml(b.text) + '</div>'
      + '</div>';
  }

  // bloques -> HTML. `permisos` solo decide qué botones de texto compartido salen.
  function pintar(bloques, editable, permisos) {
    if (!bloques || !bloques.length) {
      return '<p class="vacio-apartado">Este apartado está vacío.'
        + (editable ? ' Usa <em>Añadir párrafo</em> para empezar.' : '') + '</p>';
    }
    return bloques.map((b, i) => {
      if (b.ref) return pintarCompartido(b, i, permisos);
      if (b.type === 'list') return pintarLista(b, i, editable);
      return pintarParrafo(b, i, editable);
    }).join('');
  }

  // Lo que se guardaría en la base de datos, tal cual. Es la prueba de que el
  // editor no está metiendo HTML en el modelo.
  const aJSON = (bloques) => JSON.stringify(bloques, null, 2);

  // ---------------------------------------------------------------- operaciones
  // Todas devuelven un array nuevo; quien llama decide si lo guarda.
  const OPS = {
    // lo que llega es lo escrito en el campo (con sus marcas); lo que se guarda
    // son los tramos
    'texto': (bs, { bloque, valor }) => { bs[bloque].text = aTramos(valor); return bs; },

    'texto-item': (bs, { bloque, item, valor }) => { bs[bloque].items[item].text = aTramos(valor); return bs; },

    'a-lista': (bs, { bloque }) => {
      // una frase por línea, y si no hay saltos, una sola entrada. Se pasa por
      // las marcas para no perder el formato que ya tuviera.
      const texto = aMarcas(bs[bloque].text);
      const items = texto.split('\n').map((t) => t.trim()).filter(Boolean)
        .map((t) => ({ text: aTramos(t), level: 0 }));
      bs[bloque] = { type: 'list', items: items.length ? items : [{ text: '', level: 0 }] };
      return bs;
    },

    'a-parrafo': (bs, { bloque }) => {
      const items = bs[bloque].items || [];
      bs[bloque] = { type: 'p', text: aTramos(items.map((it) => aMarcas(it.text)).join('\n')) };
      return bs;
    },

    'anadir-parrafo': (bs) => { bs.push({ type: 'p', text: '' }); return bs; },

    'anadir-lista': (bs) => { bs.push({ type: 'list', items: [{ text: '', level: 0 }] }); return bs; },

    'anadir-item': (bs, { bloque }) => { bs[bloque].items.push({ text: '', level: 0 }); return bs; },

    'quitar-item': (bs, { bloque, item }) => {
      bs[bloque].items.splice(item, 1);
      if (!bs[bloque].items.length) bs.splice(bloque, 1);
      return bs;
    },

    'sangrar': (bs, { bloque, item }) => {
      const it = bs[bloque].items[item];
      it.level = Math.min(2, (it.level || 0) + 1);
      return bs;
    },

    'desangrar': (bs, { bloque, item }) => {
      const it = bs[bloque].items[item];
      it.level = Math.max(0, (it.level || 0) - 1);
      return bs;
    },

    'quitar': (bs, { bloque }) => { bs.splice(bloque, 1); return bs; },

    'subir': (bs, { bloque }) => {
      if (bloque <= 0) return bs;
      bs.splice(bloque - 1, 0, bs.splice(bloque, 1)[0]);
      return bs;
    },

    'bajar': (bs, { bloque }) => {
      if (bloque >= bs.length - 1) return bs;
      bs.splice(bloque + 1, 0, bs.splice(bloque, 1)[0]);
      return bs;
    },

    // Desvincular: la referencia se sustituye por una copia propia del texto,
    // igual que hace `desvincular()` en poc-pdfmake/lib/compartidos.js.
    'desvincular': (bs, { bloque }) => {
      const c = C.COMPARTIDOS[bs[bloque].ref];
      if (!c) return bs;
      bs[bloque] = Object.assign(copia(c.bloque), { desvinculado_de: bs[bloque].ref, version_origen: c.version });
      return bs;
    },
  };

  // Aplica una operación sobre una copia de los bloques. Devuelve el array nuevo,
  // o el mismo si la operación no existe o los índices no cuadran.
  function aplicar(bloques, op, args) {
    const fn = OPS[op];
    if (!fn) return bloques;
    const bs = copia(bloques);
    const b = args && args.bloque;
    if (b != null && !bs[b]) return bloques;
    try { return fn(bs, args || {}); } catch (e) { return bloques; }
  }

  // ¿Es un modelo válido para el renderer? Lo usa la prueba de fidelidad.
  // Un valor de texto: cadena, o lista de tramos con su texto plano.
  const textoValido = (t) => typeof t === 'string'
    || (Array.isArray(t) && t.length > 0
      && t.every((r) => r && typeof r === 'object' && typeof r.text === 'string'));

  function valido(bloques) {
    return Array.isArray(bloques) && bloques.every((b) => {
      if (!b || typeof b !== 'object') return false;
      if (typeof b.ref === 'string') return true;
      if (b.type === 'p') return textoValido(b.text);
      if (b.type === 'list') {
        return Array.isArray(b.items)
          && b.items.every((it) => it && textoValido(it.text) && Number.isInteger(it.level || 0));
      }
      return false;
    });
  }

  global.Bloques = {
    pintar, aJSON, aplicar, valido,
    aTramos, aMarcas, aHtml, plano, marcar,
    OPS: Object.keys(OPS),
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
