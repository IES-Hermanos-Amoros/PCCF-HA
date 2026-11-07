// Fichas de situación de aprendizaje: el modelo y su impresión. LA LÓGICA, en un solo sitio.
//
// Esta es la decisión §2.2 de docs/plan.md. Hasta ahora la misma lógica estaba
// escrita dos veces: en motor/ficha-sa.js (CommonJS, la que usa el PDF) y en
// docs/mockup-v2/js/sa.js (un puerto a mano para el navegador). Aquí vive una sola
// copia, y las dos la consumen.
//
// QUÉ HAY AQUÍ
//
//   La forma de la ficha, con campos con nombre:
//     { num, titulo, sesiones, evaluacion, raTexto, ra: [2], ce: [...],
//       competencias: [...], objetivos: [...], introduccion, no_evaluables,
//       evaluables, refuerzo, ampliacion, recuperacion, recursos }
//
//   Las dos conversiones que hacen falta para que una SA se vea, cambie y cree
//   desde la aplicación:
//     fichaDeFilas(filas, cabecera)  tabla importada -> modelo
//     filasDeFicha(ficha)            modelo          -> tabla, la que imprime el PDF
//   La segunda es la que permite que una SA nueva, que nunca estuvo en un Word,
//   salga impresa igual que las importadas. Lo que se ve en la aplicación es lo
//   que sale en el PDF, porque los dos usan esta misma función.
//
//   Las operaciones sobre una LISTA de fichas que son cálculo puro: renumerar,
//   añadir, reemplazar, borrar, duplicar, mover. Reciben la lista y devuelven una
//   lista nueva; no guardan nada.
//
//   El resumen SA × RA (`matriz`) y los RA que no tienen ninguna situación
//   (`raSinSituacion`). Reciben la lista de fichas y la lista de RA del módulo,
//   así que no necesitan saber de dónde sale ninguna de las dos.
//
// QUÉ SE QUEDA EN CADA LADO, Y POR QUÉ
//
//   docs/mockup-v2/js/sa.js se queda con:
//     - la persistencia (cargar, persistir, reiniciar, guardarLista, `cambiadas`):
//       es el localStorage del prototipo, no es lógica;
//     - la dependencia de global.Importado (listar, ficha, raDe, hayImportado):
//       son los datos de muestra del mockup;
//     - SEC_SA y SEC_RA_CE: rutas del árbol de la plantilla, que el mockup usa
//       para encontrar sus nodos;
//     - el texto de ayuda del formulario (`ayuda` del campo de criterios).
//   motor/ficha-sa.js ya no tiene lógica: reexporta lo de aquí con la misma API.
//
// DIFERENCIA DETECTADA ENTRE LAS DOS IMPLEMENTACIONES (no resuelta aquí)
//
//   Una ficha vacía tenía la evaluación distinta según quién la creara:
//     - motor, fichaVacia(num)            evaluacion = ''
//     - mockup, SA.vacia(num) / nueva     evaluacion = '1ª'
//   Como las dos conductas son observables y no hay criterio para elegir una, esta
//   función no decide: `fichaVacia(num, evaluacion)` recibe la evaluación por
//   parámetro y, si no se pasa, deja ''. El mockup pasa '1ª' para conservar lo que
//   ya hacía. Esto es una decisión pendiente, no un acuerdo.
//
// Esto es lógica pura: sin DOM, sin localStorage, sin red, sin node. Vale como
// <script> en el mockup, como `require` en el motor y en las pruebas, y como
// `import` desde Next. Cuelga de `global.Core.sa`, igual que core/permisos.js.

(function (global) {
  'use strict';

  // Los campos del cuerpo de la ficha, con la etiqueta exacta del documento. El
  // orden es el de la ficha impresa, así que vale también para pintar el
  // formulario. `grupo` marca las actividades, que se pintan juntas.
  const CAMPOS = [
    { id: 'ce', etiqueta: 'Criterios de evaluación', ancho: 4 },
    { id: 'competencias', etiqueta: 'Competencias profesionales para la empleabilidad', ancho: 4 },
    { id: 'objetivos', etiqueta: 'Objetivos de aprendizaje', ancho: 4 },
    { id: 'introduccion', etiqueta: 'Introducción', ancho: 2, grupo: 'actividades' },
    { id: 'no_evaluables', etiqueta: 'Formativas no evaluables', ancho: 1, grupo: 'actividades' },
    { id: 'evaluables', etiqueta: 'Formativas evaluables', ancho: 1, grupo: 'actividades' },
    { id: 'refuerzo', etiqueta: 'Actividades de refuerzo', ancho: 2, grupo: 'actividades' },
    { id: 'ampliacion', etiqueta: 'Actividades de ampliación', ancho: 2, grupo: 'actividades' },
    { id: 'recuperacion', etiqueta: 'Actividades de recuperación', ancho: 4, grupo: 'actividades' },
    { id: 'recursos', etiqueta: 'Materiales y recursos didácticos disponibles', ancho: 4 },
  ];

  const CABECERA_ACTIVIDADES = 'Tipificación de actividades formativas';
  const COLUMNAS = 4;
  const EVALUACIONES = ['1ª', '2ª', '3ª'];

  // Minúsculas y sin tildes, para comparar etiquetas con lo que trae el Word.
  function norm(s) {
    return String(s == null ? '' : s)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/\s+/g, ' ').trim();
  }

  const POR_ETIQUETA = new Map(CAMPOS.map((c) => [norm(c.etiqueta), c]));

  // ---------------------------------------------------------------- texto

  // Un valor de celda puede traer varias líneas; cada una es un elemento, con las
  // viñetas del Word quitadas. Se guarda como lista para poder editar por líneas.
  function aLineas(t) {
    return String(t == null ? '' : t)
      .split('\n')
      .map((l) => l.replace(/^\s*[−–—•*·-]\s*/, '').trim())
      .filter(Boolean);
  }

  // Acepta lista o texto y devuelve siempre la lista.
  function lineas(v) {
    return Array.isArray(v) ? v.slice() : aLineas(v);
  }

  // Acepta lista o texto y devuelve siempre el texto, una línea por elemento.
  function deLineas(v) {
    return lineas(v).join('\n');
  }

  // Los RA que trabaja la SA se leen del texto del resultado de aprendizaje. El
  // documento los escribe de tres maneras, y las tres aparecen en la PD de DAW:
  //
  //   "RA2. Crea bases de datos…"      "1. Reconoce las características…"
  //   "RA1 Reconoce los elementos…"    (sin punto: ocho fichas de un módulo)
  //
  // Con el prefijo "RA" basta el número; sin él se exige un signo detrás, o
  // cualquier cifra del texto se tomaría por un resultado de aprendizaje.
  function raDeTexto(t) {
    return [...String(t == null ? '' : t)
      .matchAll(/(?:^|\n)\s*(?:RA\s*(\d+)\b|(\d+)\s*[.):-])/gi)]
      .map((m) => Number(m[1] || m[2]));
  }

  // La línea de un criterio tal como la escribe el documento: "RA2.a. El texto."
  const lineaCe = (num, ce) => 'RA' + num + '.' + ce.letra + '. ' + ce.texto;

  const copia = (x) => JSON.parse(JSON.stringify(x));

  // ---------------------------------------------------------------- tabla -> modelo

  // La cabecera: "Situación de aprendizaje 3 | título | Sesiones | 12"
  // Las etiquetas pueden llevar el valor al lado (en la misma fila) o debajo (la
  // fila es toda de etiquetas en negrita y el valor va en la siguiente).
  // `cabecera`, si viene, manda sobre lo deducido de la tabla.
  function fichaDeFilas(filas, cabecera) {
    const f = Array.isArray(filas) ? filas : [];
    const texto = (fila, j) => (fila && fila[j] ? String(fila[j].text == null ? '' : fila[j].text) : '');
    const out = {
      num: null, titulo: '', sesiones: null, evaluacion: '', raTexto: '', ra: [],
      ce: [], competencias: [], objetivos: [],
      introduccion: [], no_evaluables: [], evaluables: [], refuerzo: [], ampliacion: [], recuperacion: [],
      recursos: [],
    };

    if (f.length) {
      const n = texto(f[0], 0).match(/(\d+)/);
      out.num = n ? Number(n[1]) : null;
      out.titulo = texto(f[0], 1).trim();
    }

    f.forEach((fila, i) => {
      if (!fila || !fila.length) return;

      // etiquetas con el valor al lado, en la misma fila
      for (let j = 0; j < fila.length - 1; j += 1) {
        const etq = norm(texto(fila, j));
        if (etq === 'sesiones') {
          const m = texto(fila, j + 1).match(/-?\d+(?:[.,]\d+)?/);
          out.sesiones = m ? Number(m[0].replace(',', '.')) : null;
        } else if (etq === 'evaluacion') {
          out.evaluacion = texto(fila, j + 1).trim();
        } else if (etq.startsWith('resultado')) {
          out.raTexto = texto(fila, j + 1).trim();
        }
      }

      // etiquetas con el valor debajo: la fila es toda de etiquetas conocidas
      const etiquetas = fila.map((c) => POR_ETIQUETA.get(norm(c && c.text)));
      if (!etiquetas.length || etiquetas.some((c) => !c)) return;
      const siguiente = f[i + 1] || [];
      etiquetas.forEach((campo, j) => { out[campo.id] = aLineas(texto(siguiente, j)); });
    });

    out.ra = raDeTexto(out.raTexto);

    if (cabecera) {
      ['num', 'titulo', 'sesiones', 'evaluacion'].forEach((k) => {
        if (cabecera[k] !== undefined && cabecera[k] !== null && cabecera[k] !== '') out[k] = cabecera[k];
      });
      if (Array.isArray(cabecera.ra) && cabecera.ra.length) out.ra = cabecera.ra.slice();
    }
    return out;
  }

  // ---------------------------------------------------------------- modelo -> tabla

  const celda = (text, opts) => Object.assign({
    text: String(text == null ? '' : text), colspan: 1, rowspan: 1, bold: false,
  }, opts);

  // Se usa la maquetación mayoritaria del documento: las actividades de
  // introducción, no evaluables y evaluables en una fila, refuerzo y ampliación en
  // otra, y recuperación y materiales a todo lo ancho.
  function filasDeFicha(ficha) {
    const s = ficha || {};
    const out = [];
    const ancho = (v) => (v > 1 ? v : 1);

    out.push([
      celda('Situación de aprendizaje ' + (s.num == null ? '' : s.num), { rowspan: 2, bold: true }),
      celda(s.titulo, { rowspan: 2, bold: true }),
      celda('Sesiones', { bold: true }),
      celda(s.sesiones == null ? '' : s.sesiones, { bold: true }),
    ]);
    out.push([celda('Evaluación', { bold: true }), celda(s.evaluacion, { bold: true })]);
    out.push([celda('Resultado(s) de aprendizaje', { bold: true }), celda(s.raTexto, { colspan: 3 })]);

    const bloque = (ids) => {
      const campos = ids.map((id) => CAMPOS.filter((c) => c.id === id)[0]).filter(Boolean);
      out.push(campos.map((c) => celda(c.etiqueta, { colspan: ancho(c.ancho), bold: true })));
      out.push(campos.map((c) => celda(deLineas(s[c.id]), { colspan: ancho(c.ancho) })));
    };

    bloque(['ce']);
    bloque(['competencias']);
    bloque(['objetivos']);
    out.push([celda(CABECERA_ACTIVIDADES, { colspan: COLUMNAS, bold: true })]);
    bloque(['introduccion', 'no_evaluables', 'evaluables']);
    bloque(['refuerzo', 'ampliacion']);
    bloque(['recuperacion']);
    bloque(['recursos']);
    return out;
  }

  // ---------------------------------------------------------------- ficha nueva

  // Una ficha con los campos vacíos pero presentes: el formulario se pinta igual
  // con una SA importada y con una nueva. `evaluacion` solo se fija si se pasa;
  // ver la nota de DIFERENCIA en la cabecera.
  function fichaVacia(num, evaluacion) {
    const f = fichaDeFilas([]);
    f.num = num == null ? null : Number(num);
    if (evaluacion !== undefined) f.evaluacion = evaluacion;
    return f;
  }

  // ¿Tiene cuerpo con nombre, o solo la tabla importada? Lo usa el renderer para
  // decidir si imprime `filas` tal cual o las reconstruye desde el modelo.
  const esSemantica = (v) => !!v && (CAMPOS.some((c) => Array.isArray(v[c.id]) && v[c.id].length)
    || typeof v.raTexto === 'string');

  // ---------------------------------------------------------------- lista de fichas
  // Todas devuelven una lista nueva y no tocan la que reciben. La numeración no
  // se corrige aquí: `renumerar` se llama al guardar.

  const renumerar = (lista) => lista.map((f, i) => Object.assign({}, f, { num: i + 1 }));

  // Añade una ficha vacía al final. Devuelve la lista y el número de la nueva.
  function anadirVacia(lista, evaluacion) {
    const num = lista.length + 1;
    const f = fichaVacia(num, evaluacion);
    f.titulo = 'Situación de aprendizaje ' + num;
    return { lista: lista.concat([f]), num };
  }

  // Sustituye la ficha con el mismo número, o la añade si no existe.
  function reemplazarEn(lista, f) {
    const out = lista.slice();
    const i = out.findIndex((x) => x.num === Number(f.num));
    if (i < 0) out.push(f); else out[i] = f;
    return out;
  }

  const borrarDe = (lista, num) => lista.filter((x) => x.num !== Number(num));

  // Copia la ficha justo detrás de la original. Devuelve null si no existe.
  function duplicarEn(lista, num) {
    const i = lista.findIndex((x) => x.num === Number(num));
    if (i < 0) return null;
    const copiada = copia(lista[i]);
    copiada.titulo = copiada.titulo + ' (copia)';
    const out = lista.slice();
    out.splice(i + 1, 0, copiada);
    return { lista: out, num: i + 2 };
  }

  // Intercambia la ficha con la de `delta` posiciones. Null si no cabe.
  function moverEn(lista, num, delta) {
    const i = lista.findIndex((x) => x.num === Number(num));
    const j = i + delta;
    if (i < 0 || j < 0 || j >= lista.length) return null;
    const out = lista.slice();
    out[i] = lista[j];
    out[j] = lista[i];
    return { lista: out, num: j + 1 };
  }

  // ---------------------------------------------------------------- RA y resumen

  // Qué RA quedan sin ninguna situación. `raModulo` es la lista de números de RA
  // del módulo; si viene vacía se usan los que mencionan las propias fichas.
  function raSinSituacion(lista, raModulo) {
    if (!lista.length) return [];
    const usados = new Set(lista.flatMap((f) => f.ra || []));
    const todos = raModulo && raModulo.length ? raModulo : [...usados].sort((a, b) => a - b);
    return todos.filter((n) => !usados.has(n));
  }

  // Resumen SA × RA. Calculado, nunca guardado: es la tabla que en el Word hay que
  // repasar a mano cada vez que se mueve una SA.
  function matriz(lista, raModulo) {
    const ra = (raModulo && raModulo.length ? raModulo : [...new Set(lista.flatMap((f) => f.ra || []))])
      .slice().sort((a, b) => a - b);
    return {
      ra,
      evaluaciones: [...new Set(lista.map((f) => f.evaluacion || ''))],
      filas: lista.map((f) => ({
        num: f.num,
        titulo: f.titulo,
        sesiones: f.sesiones,
        evaluacion: f.evaluacion || '',
        marca: ra.map((n) => (f.ra || []).indexOf(n) >= 0),
      })),
      sesiones: lista.reduce((s, f) => s + (Number(f.sesiones) || 0), 0),
      sinSituacion: raSinSituacion(lista, raModulo),
    };
  }

  // ---------------------------------------------------------------- exportado

  const api = {
    CAMPOS, CABECERA_ACTIVIDADES, COLUMNAS, EVALUACIONES,
    norm, aLineas, lineas, deLineas, raDeTexto, lineaCe,
    fichaDeFilas, filasDeFicha, fichaVacia, esSemantica,
    renumerar, anadirVacia, reemplazarEn, borrarDe, duplicarEn, moverEn,
    raSinSituacion, matriz,
  };

  // Vale como <script> en el mockup, como `require` en el motor y en las pruebas,
  // y como `import` desde Next. Igual que core/permisos.js.
  global.Core = global.Core || {};
  global.Core.sa = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
