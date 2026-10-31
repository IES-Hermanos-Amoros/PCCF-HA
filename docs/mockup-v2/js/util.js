// Cuatro ayudas compartidas por el resto de los módulos. Se cargan como
// <script> clásicos y cada fichero cuelga lo suyo de un único objeto global,
// así que el mockup sigue abriéndose con doble clic (sin servidor, sin npm)
// y los módulos de lógica se pueden exigir desde node para las pruebas.

(function (global) {
  'use strict';

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const $ = (sel, raiz) => (raiz || global.document).querySelector(sel);
  const $$ = (sel, raiz) => Array.prototype.slice.call((raiz || global.document).querySelectorAll(sel));

  function debounce(fn, ms) {
    let t;
    return function () {
      const args = arguments;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(null, args), ms);
    };
  }

  // "hace 2 s", "hace 5 min"… para la marca de autoguardado y los comentarios
  function hace(ts) {
    if (!ts) return '';
    const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (s < 60) return 'hace ' + s + ' s';
    if (s < 3600) return 'hace ' + Math.round(s / 60) + ' min';
    if (s < 86400) return 'hace ' + Math.round(s / 3600) + ' h';
    return 'hace ' + Math.round(s / 86400) + ' días';
  }

  global.Util = { esc, $, $$, debounce, hace };
})(typeof globalThis !== 'undefined' ? globalThis : this);
