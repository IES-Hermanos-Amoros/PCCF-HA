// Editor de bloques: EL PINTADO. El modelo está en core/bloques.js.
//
// El estado es el array que espera el renderer del PDF:
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
// QUÉ SUBIÓ A core/bloques.js Y POR QUÉ
//
// El modelo: `aTramos`, `aMarcas`, `plano`, `marcar`, las operaciones (`aplicar`,
// `OPS`) y la validación (`valido`). Lo consumen dos sitios —este editor y la ruta
// que guarda un apartado por la API—, y era justo la duplicación que se arrastraba
// de los permisos y de las fichas de SA (docs/plan.md §2.2): la validación del
// formato del PDF escrita dos veces es la validación escrita cero veces.
//
// Aquí se queda lo que necesita el navegador: `pintar` y sus ayudas, `aHtml`
// (necesita `esc`), `aJSON`, y la operación `desvincular`, que lee los textos
// compartidos de muestra del prototipo.
//
// NEGRITA Y CURSIVA
//
// Sí están, y llegan al PDF de verdad: `text` puede ser una lista de tramos
// { text, bold, italics }, que es lo que pdfmake acepta en cualquier nodo de
// texto (la tabla de RA/CE del renderer ya lo usaba). Lo comprueba de punta a
// punta scripts/test-texto-rico.js.
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
  const M = global.Core.bloques;

  const copia = (x) => JSON.parse(JSON.stringify(x));

  const { aTramos, aMarcas, plano, marcar, valido } = M;

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

  // ---------------------------------------------------------------- tablas importadas
  // El Word trae tablas que el modelo de párrafos y listas no sabe representar:
  // la ficha del módulo, la de RA y CE, los contenidos básicos… Se pintan tal
  // como vienen (celdas con colspan y rowspan) y de momento NO se editan aquí:
  // cada una necesita su propio editor, como el de ponderaciones. Mientras no
  // existan, al menos se ven, en lugar de desaparecer del apartado.
  //
  // Ojo: estas tablas NO son bloques de un campo de texto. Son otros campos de la
  // plantilla (`tabla`, `auto.tabla_ra_ce`, `tabla_clave_valor`…) y el prototipo las
  // pinta por aquí por comodidad. Por eso `core/bloques.js` no las admite: dentro de
  // un `texto_largo` no las pone el importador ni las sabe pintar el renderer.
  function pintarTabla(filas, etiqueta) {
    if (!Array.isArray(filas) || !filas.length) return '';
    const cuerpo = filas.map((fila) => '<tr>' + (fila || []).map((c) => {
      const cs = (c && c.colspan) > 1 ? ' colspan="' + c.colspan + '"' : '';
      const rs = (c && c.rowspan) > 1 ? ' rowspan="' + c.rowspan + '"' : '';
      const t = esc(c && c.text == null ? '' : c.text).replace(/\n/g, '<br>');
      return c && c.bold ? '<th' + cs + rs + '>' + t + '</th>' : '<td' + cs + rs + '>' + t + '</td>';
    }).join('') + '</tr>').join('');
    return '<div class="bloque bloque-tabla">'
      + '<span class="tabla-etq">' + esc(etiqueta || 'tabla del documento') + ' · todavía sin editor</span>'
      + '<div class="tabla-marco"><table class="tabla-doc">' + cuerpo + '</table></div></div>';
  }

  const pintarPares = (pares) => pintarTabla(
    (pares || []).map((p) => [{ text: p.etiqueta, bold: true }, { text: p.valor }]),
    'identificación del módulo',
  );

  // La tabla de RA y CE: cada resultado de aprendizaje con sus criterios debajo.
  const pintarRaCe = (ra) => pintarTabla(
    (ra || []).reduce((filas, r) => filas
      .concat([[{ text: 'RA' + r.num, bold: true }, { text: r.texto, bold: true, colspan: 2 }]])
      .concat((r.ce || []).map((ce) => [{ text: '' }, { text: ce.letra + ')', bold: true }, { text: ce.texto }])), []),
    'resultados de aprendizaje y criterios de evaluación',
  );

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
      if (b.type === 'tabla') return pintarTabla(b.filas, b.etiqueta);
      if (b.type === 'pares') return pintarPares(b.pares);
      if (b.type === 'ra_ce') return pintarRaCe(b.ra);
      if (b.type === 'list') return pintarLista(b, i, editable);
      return pintarParrafo(b, i, editable);
    }).join('');
  }

  // Lo que se guardaría en la base de datos, tal cual. Es la prueba de que el
  // editor no está metiendo HTML en el modelo.
  const aJSON = (bloques) => JSON.stringify(bloques, null, 2);

  // ---------------------------------------------------------------- operaciones
  // Las del modelo están en core/bloques.js. Aquí solo se añade la que depende de
  // los datos de muestra del prototipo: desvincular sustituye la referencia por una
  // copia propia del texto, igual que hace `desvincular()` en motor/compartidos.js.
  const OPS = Object.assign({}, M.OPS, {
    'desvincular': (bs, { bloque }) => {
      const c = C.COMPARTIDOS[bs[bloque].ref];
      if (!c) return bs;
      bs[bloque] = Object.assign(copia(c.bloque), { desvinculado_de: bs[bloque].ref, version_origen: c.version });
      return bs;
    },
  });

  const aplicar = (bloques, op, args) => M.aplicar(bloques, op, args, OPS);

  global.Bloques = {
    pintar, aJSON, aplicar, valido,
    aTramos, aMarcas, aHtml, plano, marcar,
    OPS: Object.keys(OPS),
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
