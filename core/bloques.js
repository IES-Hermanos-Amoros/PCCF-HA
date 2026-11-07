// El modelo de bloques: lo que se guarda en un campo de texto y LA PUERTA que decide
// si vale. LA LÓGICA, en un solo sitio.
//
// Esta es la decisión §2.2 de docs/plan.md, la misma operación que ya se hizo con
// core/permisos.js, core/sa.js y core/validaciones.js: el modelo sube aquí y el
// pintado se queda en docs/mockup-v2/js/bloques.js, que lo consume.
//
// POR QUÉ ESTE FICHERO ES EL RIESGO Nº 1 DEL PROYECTO
//
// (docs/interfaz-web.md §2.3, docs/plan.md §2.6.) El PDF solo sale bien si lo que se
// guarda es EXACTAMENTE la forma que espera `bloques()` de motor/render-generico.js:
//
//   { type: 'p',    text: 'Un párrafo.' }
//   { type: 'p',    text: [{ text: 'La nota ' }, { text: 'mínima', bold: true }] }
//   { type: 'list', items: [{ text: 'Un elemento', level: 0 }] }
//   { ref: 'c001' }                                   ← texto compartido
//
// Y NADA MÁS. El renderer pinta `b.type === 'list' ? ul(b.items) : para(b.text)`, así
// que un bloque de cualquier otro tipo sale como un párrafo con el texto `undefined`,
// y un `{ text: { … } }` manda un objeto a pdfmake, que o revienta o imprime otra
// cosa. Lo peor es que no se nota: el apartado se guarda, la pantalla lo pinta, y el
// fallo aparece en junio, cuando alguien imprime su programación.
//
// Por eso la validación vive aquí, al lado del modelo, y no en la ruta: la usan el
// editor del navegador después de cada operación y la API antes de escribir, y las dos
// tienen que decir lo mismo. Es el mismo motivo por el que los permisos están en
// core/permisos.js.
//
// UNA SOLA PUERTA: `motivo` (y `valido`, que es «¿hay motivo?»)
//
// Hubo dos un rato —la forma por un lado y «esto parece HTML» por otro— y la segunda
// estaba mal planteada. Rechazaba cualquier etiqueta: `<b>`, `<p>`, `<section>`,
// `<html>`, y también `<?xml version="1.0"?>` y `<xsl:template>`. Esto es la
// herramienta del departamento de INFORMÁTICA, y la programación que importamos lleva
// dentro el módulo 0373, «Lenguaje de Marcas y Sistemas de Gestión de Información»,
// más «Desarrollo web en entorno cliente» y «en entorno servidor»: ahí escribir sobre
// etiquetas no es un accidente, es el temario. Quien lleva Lenguaje de Marcas no podía
// guardar su propio apartado de contenidos, y el mensaje le decía que pegara el texto
// sin formato, que no era su problema.
//
// Y la regla tampoco se sostenía. El riesgo nº 1 es de ESTRUCTURA: que entre en el
// modelo algo que el generador no sabe pintar. De eso se encarga la validación de la
// forma. Un `<b>` dentro de una cadena no es eso: es texto, y el PDF lo imprime tal
// cual, que es exactamente lo correcto si la persona lo ha escrito a propósito. Lo
// único que de verdad rompía el documento —que entrara un árbol de nodos— ya lo impide
// el <textarea>. Lo demás es redacción, y la API no es el sitio para corregir la
// redacción de nadie.
//
// Así que queda una sola puerta, con la forma y con una lista muy corta de HUELLAS DE
// WORD: lo que nadie teclea a mano y solo aparece al pegar desde el procesador de
// textos (ver `HUELLAS`). Una etiqueta suelta pasa. `motivoAlGuardar` se conserva como
// nombre de esta misma función, porque es como la llaman la ruta y la interfaz y en el
// sitio de la llamada se lee mejor («¿por qué no se puede guardar esto?»).
//
// QUÉ SE QUEDA EN docs/mockup-v2/js/bloques.js
//
//   todo el pintado: `pintar`, `pintarParrafo`, `pintarLista`, `pintarCompartido`,
//   `pintarTabla`, `pintarPares`, `pintarRaCe`, `aHtml` y `aJSON`, que necesitan `esc`
//   y el DOM; y la operación `desvincular`, que lee los textos compartidos de muestra
//   del prototipo (`global.Contenido.COMPARTIDOS`). Lo demás se reexporta de aquí.
//
// Esto es lógica pura: sin DOM, sin localStorage, sin red, sin node. Vale como
// <script> en el mockup, como `require` en las pruebas y en las rutas, y como `import`
// desde Next. Cuelga de `global.Core.bloques`, igual que los demás.

(function (global) {
  'use strict';

  const copia = (x) => JSON.parse(JSON.stringify(x));

  // ---------------------------------------------------------------- formato
  //
  // Como el texto se escribe en un <textarea> —y no en un `contenteditable`, que
  // dejaría entrar HTML pegado desde Word—, la negrita y la cursiva se marcan con
  // asteriscos: **negrita**, *cursiva*, ***las dos***. En el modelo se guardan
  // SIEMPRE los tramos, nunca las marcas.
  //
  // ***las dos*** primero, para que no se lo coman las reglas más cortas.
  const MARCAS = /\*\*\*([^*]+)\*\*\*|\*\*([^*]+)\*\*|\*([^*]+)\*/g;

  // Texto plano de un valor que puede ser cadena o lista de tramos. Es el mismo
  // `plano` de motor/compartidos.js: sirve para medir y para comparar.
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

  // ---------------------------------------------------------------- operaciones
  // Todas devuelven un array nuevo; quien llama decide si lo guarda. Y todas dejan
  // el array en una de las cuatro formas: lo comprueba el prototipo operación a
  // operación, con `valido` después de cada una.
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

    // La sangría de los botones se queda en NIVEL_EDITOR y no en NIVEL_MAX: el
    // editor no necesita ofrecer todo lo que el modelo admite, y lo que admite el
    // modelo lo fija el documento importado, no los botones (ver NIVEL_MAX).
    'sangrar': (bs, { bloque, item }) => {
      const it = bs[bloque].items[item];
      it.level = Math.min(NIVEL_EDITOR, (it.level || 0) + 1);
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
  };

  // Aplica una operación sobre una copia de los bloques. Devuelve el array nuevo,
  // o el mismo si la operación no existe o los índices no cuadran.
  //
  // `ops` deja añadir operaciones sin reescribir esta función: el prototipo le pasa
  // las suyas (`desvincular`, que depende de sus datos de muestra) en lugar de
  // tener su propio `aplicar` con la misma copia, la misma comprobación de índices
  // y el mismo try/catch escritos otra vez.
  function aplicar(bloques, op, args, ops) {
    const fn = (ops || OPS)[op];
    if (!fn) return bloques;
    const bs = copia(bloques);
    const b = args && args.bloque;
    if (b != null && !bs[b]) return bloques;
    try { return fn(bs, args || {}); } catch (e) { return bloques; }
  }

  // ================================================================ la puerta
  //
  // Pensada para lo que llega de un navegador —o de un `curl`—, no para lo que
  // escribiría alguien con buena fe. Cada negativa trae el motivo en castellano y
  // dice QUÉ bloque falla, porque un «no vale» sin más deja a quien lo recibe sin
  // saber qué arreglar.

  // Hasta dónde se admite la sangría de una lista.
  //
  // No es un número elegido: la PD de DAW importada trae elementos con level 0, 1, 2
  // y 3, así que un tope de 2 —lo que ofrecen los botones del editor— rechazaría
  // contenido real y un docente no podría volver a guardar su propio apartado. Se
  // deja margen (5) y se rechaza más allá, que es lo que de verdad hay que parar:
  // `level: 40` son cuarenta <ul> anidados en el PDF y una columna de un carácter.
  const NIVEL_MAX = 5;
  const NIVEL_EDITOR = 2;

  const TIPOS = ['p', 'list'];

  // Un objeto llano: ni null, ni una lista, ni una cadena.
  const esObjeto = (x) => !!x && typeof x === 'object' && !Array.isArray(x);

  // Las claves que puede llevar cada forma, y ninguna más. Una clave de más no es
  // inofensiva: es la vía por la que entra un `{ type: 'p', text: '…', ul: [...] }`
  // que el renderer pasa a pdfmake entero.
  //
  // `desvinculado_de` y `version_origen` están en la lista porque los escribe
  // `desvincular()` de motor/compartidos.js cuando una unidad se queda una copia
  // propia de un texto compartido, y los lee `avisosDesvinculados()` para avisar de
  // que el original ha cambiado. Sin ellos, un apartado desvinculado no se podría
  // volver a guardar.
  const CLAVES = {
    ref: ['ref'],
    p: ['type', 'text', 'desvinculado_de', 'version_origen'],
    list: ['type', 'items', 'desvinculado_de', 'version_origen'],
    item: ['text', 'level'],
    tramo: ['text', 'bold', 'italics'],
  };

  const sobran = (objeto, permitidas) => Object.keys(objeto).filter((k) => permitidas.indexOf(k) < 0);

  const comillas = (claves) => claves.map((k) => '«' + k + '»').join(', ');

  // El id de un texto compartido: los que genera motor/compartidos.js son c001,
  // c002… Se exige la forma, y no solo «una cadena», porque el valor se usa para
  // buscar en un objeto y una referencia como `__proto__` no es una referencia.
  const REF = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

  // ---------------------------------------------------------------- huellas de Word
  //
  // Lo ÚNICO que se rechaza del contenido de un texto, y solo porque nadie lo teclea a
  // mano: aparece al pegar desde Word y no significa nada para el documento.
  //
  // UNA ETIQUETA SUELTA NO ES UNA HUELLA. `<b>`, `<p>`, `<section>`, `<html>`,
  // `<?xml version="1.0"?>`, `<xsl:template>`, `<xs:element>`, «a < b», «x<y», `&nbsp;`
  // y «el espacio duro se escribe &amp;nbsp;» son el temario del módulo 0373 y de los
  // dos de desarrollo web, y se guardan como lo que son: texto. El PDF los imprime tal
  // cual, que es lo que quiere quien los escribió.
  //
  // Nótese `<?xml:namespace`, que sí es huella, frente a `<?xml version=`, que no lo
  // es: el portapapeles de Word mete el primero y el segundo es la primera línea de
  // cualquier documento XML, o sea, el contenido de una de las unidades.
  const HUELLAS = [
    // Las etiquetas del propio Word: <o:p></o:p> cierra cada párrafo pegado, y <st1:…>
    // son las «etiquetas inteligentes» de las versiones viejas.
    /<\/?(?:o|st1|st2):[a-z][a-z0-9]*(?:\s[^<>]*)?\/?>/i,
    // Los comentarios condicionales con los que Word envuelve su propio marcado.
    /<!--\s*\[\s*if\b/i,
    /<!\s*\[\s*endif\b/i,
    // La declaración de espacio de nombres del portapapeles (no la del XML).
    /<\?xml:namespace\b/i,
    // Las clases y las propiedades CSS que solo existen dentro de Word.
    /class\s*=\s*["']?Mso[A-Za-z]/i,
    /\bmso-[a-z-]+\s*:/i,
    /urn:schemas-microsoft-com/i,
  ];

  // El trozo que delata el pegado, para poder decirlo en el motivo. null si no hay.
  function huellaDeWord(texto) {
    const cadena = String(texto == null ? '' : texto);
    for (const huella of HUELLAS) {
      const m = huella.exec(cadena);
      if (m) return m[0];
    }
    return null;
  }

  function motivoDeHuellas(texto, donde) {
    const huella = huellaDeWord(texto);
    if (!huella) return null;
    return `${donde} trae dentro una marca del procesador de textos («${huella}»), que no es texto de la programación: eso llega al pegar desde Word. Pega el texto sin formato y marca la negrita y la cursiva desde la barra.`;
  }

  // Un valor de `text`: una cadena, o una lista de tramos { text, bold, italics }. Y sin
  // huellas de Word dentro (ver `HUELLAS`, justo arriba).
  function motivoDeTexto(t, donde) {
    if (typeof t === 'string') return motivoDeHuellas(t, donde);
    if (!Array.isArray(t)) {
      return `${donde} no es texto: tiene que ser una cadena, o una lista de tramos { text, bold, italics }.`;
    }
    if (!t.length) {
      return `${donde} es una lista de tramos vacía: un texto sin nada se guarda como la cadena '', no como [].`;
    }
    for (let i = 0; i < t.length; i += 1) {
      const r = t[i];
      const suyo = `el tramo ${i + 1} de ${donde}`;
      if (!esObjeto(r)) return `${suyo} no es un objeto { text, bold, italics }.`;
      const extra = sobran(r, CLAVES.tramo);
      if (extra.length) return `${suyo} lleva ${comillas(extra)}, que no existe en el modelo: un tramo solo tiene «text», «bold» e «italics».`;
      if (typeof r.text !== 'string') return `${suyo} no tiene «text», o no es una cadena.`;
      if (r.bold !== undefined && typeof r.bold !== 'boolean') return `${suyo} tiene «bold» y no es true ni false.`;
      if (r.italics !== undefined && typeof r.italics !== 'boolean') return `${suyo} tiene «italics» y no es true ni false.`;
    }
    return motivoDeHuellas(plano(t), donde);
  }

  // Las dos marcas que deja una copia propia de un texto compartido.
  function motivoDeProcedencia(b, donde) {
    if (b.desvinculado_de !== undefined
      && (typeof b.desvinculado_de !== 'string' || !REF.test(b.desvinculado_de))) {
      return `${donde} tiene «desvinculado_de» y no es el id de un texto compartido.`;
    }
    if (b.version_origen !== undefined
      && (!Number.isInteger(b.version_origen) || b.version_origen < 0)) {
      return `${donde} tiene «version_origen» y no es un número entero.`;
    }
    return null;
  }

  function motivoDeBloque(b, donde) {
    if (!esObjeto(b)) {
      return `${donde} no es un objeto: cada bloque es { type: 'p', text }, { type: 'list', items } o { ref }.`;
    }

    // Un texto compartido es una referencia y nada más: si llevara texto, habría dos
    // versiones del mismo párrafo y ganaría la que tocara pintar.
    if (b.ref !== undefined) {
      const extra = sobran(b, CLAVES.ref);
      if (extra.length) return `${donde} es una referencia a un texto compartido y lleva además ${comillas(extra)}: una referencia solo tiene «ref».`;
      if (typeof b.ref !== 'string' || !REF.test(b.ref)) return `${donde} tiene un «ref» que no es el id de un texto compartido.`;
      return null;
    }

    if (b.type === undefined) return `${donde} no dice de qué tipo es: falta «type» («p» o «list»), o «ref» si es un texto compartido.`;
    if (TIPOS.indexOf(b.type) < 0) {
      return `${donde} es de tipo «${String(b.type)}», que el generador del documento no sabe pintar: solo valen «p», «list» y { ref }.`;
    }

    const extra = sobran(b, CLAVES[b.type]);
    if (extra.length) return `${donde} lleva ${comillas(extra)}, que no existe en el modelo de bloques.`;

    const procedencia = motivoDeProcedencia(b, donde);
    if (procedencia) return procedencia;

    if (b.type === 'p') {
      if (b.text === undefined) return `${donde} es un párrafo sin «text».`;
      return motivoDeTexto(b.text, `el texto de ${donde}`);
    }

    if (!Array.isArray(b.items)) return `${donde} es una lista sin «items»: una lista es { type: 'list', items: [{ text, level }] }.`;
    if (!b.items.length) return `${donde} es una lista sin ningún elemento: una lista vacía no se guarda, se quita.`;

    for (let j = 0; j < b.items.length; j += 1) {
      const it = b.items[j];
      const suyo = `el elemento ${j + 1} de ${donde}`;
      if (!esObjeto(it)) return `${suyo} no es un objeto { text, level }.`;
      const sobra = sobran(it, CLAVES.item);
      if (sobra.length) return `${suyo} lleva ${comillas(sobra)}, que no existe en el modelo: un elemento solo tiene «text» y «level».`;
      if (it.text === undefined) return `${suyo} no tiene «text».`;
      const texto = motivoDeTexto(it.text, suyo);
      if (texto) return texto;
      if (it.level !== undefined && (!Number.isInteger(it.level) || it.level < 0 || it.level > NIVEL_MAX)) {
        return `${suyo} tiene «level» ${JSON.stringify(it.level)}: la sangría es un número entero de 0 a ${NIVEL_MAX}.`;
      }
    }
    return null;
  }

  // Por qué no vale la FORMA de una lista de bloques. null si vale.
  function motivo(bloques) {
    if (!Array.isArray(bloques)) {
      return 'el valor de un campo de texto es una lista de bloques, y esto no es una lista.';
    }
    for (let i = 0; i < bloques.length; i += 1) {
      const m = motivoDeBloque(bloques[i], `el bloque ${i + 1}`);
      if (m) return m;
    }
    return null;
  }

  const valido = (bloques) => motivo(bloques) === null;

  // Alias histórico, y el nombre por el que la llaman la ruta y la interfaz: en el
  // sitio de la llamada se lee mejor. Es exactamente la misma función; si algún día
  // vuelven a ser dos puertas, que sea a propósito y no por descuido.
  const motivoAlGuardar = motivo;

  // ---------------------------------------------------------------- exportado

  const api = {
    plano, aTramos, aMarcas, marcar,
    OPS, aplicar,
    valido, motivo, motivoAlGuardar, huellaDeWord,
    NIVEL_MAX, NIVEL_EDITOR, TIPOS,
  };

  // Vale como <script> en el mockup, como `require` en las pruebas y en las rutas, y
  // como `import` desde Next. Igual que core/permisos.js y core/sa.js.
  global.Core = global.Core || {};
  global.Core.bloques = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
