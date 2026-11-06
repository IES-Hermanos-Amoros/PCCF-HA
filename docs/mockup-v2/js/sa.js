// Situaciones de aprendizaje: verlas, cambiarlas y crear otras.
//
// Es la parte del documento donde está el trabajo de verdad —en la PD de DAW hay
// 79 fichas— y en el v1 no se podía hacer nada con ellas: solo se veía la tabla
// del Word. Aquí cada ficha es un modelo con campos con nombre:
//
//   { num, titulo, sesiones, evaluacion, raTexto, ra: [2], ce: [...],
//     competencias: [...], objetivos: [...],
//     introduccion, no_evaluables, evaluables, refuerzo, ampliacion,
//     recuperacion, recursos }
//
// `filas()` monta con eso la tabla de la ficha tal como sale impresa, así que lo
// que se ve en la aplicación es lo que va a salir en el PDF. Es un puerto de
// poc-pdfmake/lib/ficha-sa.js, y test.js compara los dos ficha a ficha para que
// no se separen, igual que con los permisos.
//
// La tabla resumen (SA × RA) no se guarda: se calcula desde las fichas, como la
// calcula el motor en render-generico.js. Así no puede quedar desfasada, que es
// lo que pasa en el Word.

(function (global) {
  'use strict';

  const CLAVE = 'pccf-ha-v2-sa';
  const I = global.Importado || null;

  // Los campos del cuerpo de la ficha, con la etiqueta del documento. El orden
  // es el de la ficha impresa y el del formulario.
  const CAMPOS = [
    { id: 'ce', etiqueta: 'Criterios de evaluación', ancho: 4, ayuda: 'Uno por línea. Se pueden marcar desde los criterios del módulo.' },
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

  const SEC_SA = 'modulos/situaciones-de-aprendizaje';
  const SEC_RA_CE = 'modulos/desarrollo-curricular/resultados-de-aprendizaje-y-criterios-de-evaluacion';

  // ---------------------------------------------------------------- modelo
  const copia = (x) => JSON.parse(JSON.stringify(x));
  const lineas = (v) => (Array.isArray(v) ? v.slice() : String(v == null ? '' : v)
    .split('\n').map((l) => l.replace(/^\s*[−–—•*·-]\s*/, '').trim()).filter(Boolean));
  const texto = (v) => lineas(v).join('\n');

  const raDeTexto = (t) => [...String(t == null ? '' : t)
    .matchAll(/(?:^|\n)\s*(?:RA\s*(\d+)\b|(\d+)\s*[.):-])/gi)]
    .map((m) => Number(m[1] || m[2]));

  function vacia(num) {
    const f = {
      num: num == null ? null : Number(num),
      titulo: '', sesiones: null, evaluacion: EVALUACIONES[0], raTexto: '', ra: [],
    };
    CAMPOS.forEach((c) => { f[c.id] = []; });
    return f;
  }

  // ---------------------------------------------------------------- estado
  // Lo importado es el punto de partida. En cuanto se toca una unidad, se guarda
  // su lista entera: un mockup no necesita fusionar cambios, y así lo que se ve
  // es exactamente lo que hay guardado.
  let cambiadas = {};

  function cargar() {
    try {
      const txt = global.localStorage.getItem(CLAVE);
      cambiadas = txt ? JSON.parse(txt) : {};
    } catch (e) { cambiadas = {}; }
  }
  function persistir() {
    try { global.localStorage.setItem(CLAVE, JSON.stringify(cambiadas)); } catch (e) { /* sin localStorage */ }
  }
  function reiniciar() { cambiadas = {}; persistir(); }

  const importadas = (unidadId) => {
    const u = I && I.UNIDADES ? I.UNIDADES[unidadId] : null;
    return u && Array.isArray(u.sa) ? copia(u.sa) : [];
  };

  function listar(unidadId) {
    if (!unidadId) return [];
    const propias = cambiadas[unidadId];
    const lista = propias ? copia(propias) : importadas(unidadId);
    return lista.map((f, i) => Object.assign(vacia(i + 1), f));
  }

  const guardarLista = (unidadId, lista) => {
    cambiadas[unidadId] = lista.map((f, i) => Object.assign({}, f, { num: i + 1 }));
    persistir();
    return listar(unidadId);
  };

  const ficha = (unidadId, num) => listar(unidadId).filter((f) => f.num === Number(num))[0] || null;

  function guardar(unidadId, f) {
    const lista = listar(unidadId);
    const i = lista.findIndex((x) => x.num === Number(f.num));
    if (i < 0) lista.push(f); else lista[i] = f;
    return guardarLista(unidadId, lista);
  }

  function nueva(unidadId) {
    const lista = listar(unidadId);
    const f = vacia(lista.length + 1);
    f.titulo = 'Situación de aprendizaje ' + f.num;
    lista.push(f);
    guardarLista(unidadId, lista);
    return f.num;
  }

  function duplicar(unidadId, num) {
    const lista = listar(unidadId);
    const i = lista.findIndex((x) => x.num === Number(num));
    if (i < 0) return null;
    const copiada = copia(lista[i]);
    copiada.titulo = copiada.titulo + ' (copia)';
    lista.splice(i + 1, 0, copiada);
    guardarLista(unidadId, lista);
    return i + 2;
  }

  function borrar(unidadId, num) {
    const lista = listar(unidadId).filter((x) => x.num !== Number(num));
    return guardarLista(unidadId, lista);
  }

  function mover(unidadId, num, delta) {
    const lista = listar(unidadId);
    const i = lista.findIndex((x) => x.num === Number(num));
    const j = i + delta;
    if (i < 0 || j < 0 || j >= lista.length) return null;
    const x = lista[i];
    lista[i] = lista[j];
    lista[j] = x;
    guardarLista(unidadId, lista);
    return j + 1;
  }

  const tocada = (unidadId) => Object.prototype.hasOwnProperty.call(cambiadas, unidadId);

  // ---------------------------------------------------------------- la ficha impresa
  const celda = (text, opts) => Object.assign({
    text: String(text == null ? '' : text), colspan: 1, rowspan: 1, bold: false,
  }, opts);

  function filas(f) {
    const s = f || {};
    const out = [];
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
      out.push(campos.map((c) => celda(c.etiqueta, { colspan: c.ancho, bold: true })));
      out.push(campos.map((c) => celda(texto(s[c.id]), { colspan: c.ancho })));
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

  // ---------------------------------------------------------------- RA del módulo
  // Los resultados de aprendizaje y sus criterios, del apartado del propio
  // módulo. Sirven para elegir en el editor en lugar de escribirlos a mano, que
  // es lo que hace que la ficha y la tabla de RA/CE no se contradigan.
  function raDe(unidadId) {
    const u = I && I.UNIDADES ? I.UNIDADES[unidadId] : null;
    const sec = u && u.secciones ? u.secciones[SEC_RA_CE] : null;
    if (!sec || !Array.isArray(sec.raCe)) return [];
    return sec.raCe.map((ra) => ({
      num: ra.num,
      texto: ra.texto || '',
      ce: (ra.ce || []).map((ce) => ({ letra: ce.letra, texto: ce.texto || '' })),
    }));
  }

  // La línea de un criterio tal como la escribe el documento: "RA2.a. El texto."
  const lineaCe = (num, ce) => 'RA' + num + '.' + ce.letra + '. ' + ce.texto;

  // Qué RA quedan sin ninguna situación de aprendizaje. Si no hay tabla de RA/CE
  // importada se usan los RA que las propias fichas mencionan.
  function raSinSituacion(unidadId) {
    const lista = listar(unidadId);
    if (!lista.length) return [];
    const usados = new Set(lista.flatMap((f) => f.ra || []));
    const delModulo = raDe(unidadId).map((r) => r.num);
    const todos = delModulo.length ? delModulo : [...usados].sort((a, b) => a - b);
    return todos.filter((n) => !usados.has(n));
  }

  // ---------------------------------------------------------------- resumen SA × RA
  // Calculado, nunca guardado: es la tabla que en el Word hay que repasar a mano
  // cada vez que se mueve una SA.
  function matriz(unidadId) {
    const lista = listar(unidadId);
    const delModulo = raDe(unidadId).map((r) => r.num);
    const ra = (delModulo.length ? delModulo : [...new Set(lista.flatMap((f) => f.ra || []))])
      .slice().sort((a, b) => a - b);
    const evaluaciones = [...new Set(lista.map((f) => f.evaluacion || ''))];
    const filasSa = lista.map((f) => ({
      num: f.num,
      titulo: f.titulo,
      sesiones: f.sesiones,
      evaluacion: f.evaluacion || '',
      marca: ra.map((n) => (f.ra || []).indexOf(n) >= 0),
    }));
    return {
      ra,
      evaluaciones,
      filas: filasSa,
      sesiones: lista.reduce((s, f) => s + (Number(f.sesiones) || 0), 0),
      sinSituacion: raSinSituacion(unidadId),
    };
  }

  global.SA = {
    CAMPOS, CABECERA_ACTIVIDADES, COLUMNAS, EVALUACIONES, SEC_SA, SEC_RA_CE,
    vacia, listar, ficha, guardar, nueva, duplicar, borrar, mover, tocada, guardarLista,
    filas, matriz, raDe, raSinSituacion, lineaCe, raDeTexto, lineas, texto,
    cargar, persistir, reiniciar,
    hayImportado: () => !!(I && I.UNIDADES),
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
