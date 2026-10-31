// Interfaz: árbol, rutas, contenido, paneles y la matriz de coordinación.
//
// Lo que cambia respecto al v1, además del contenido de los otros módulos:
//
//  · El estado vive en la URL, con el formato que fija docs/interfaz-web.md §3.1
//    (`/doc/[id]/[idSeccion]`), aquí sobre el hash porque el mockup se abre con
//    doble clic. Única desviación: la unidad va en `?u=<id>` y no en `?m=<índice>`,
//    porque el índice es precisamente el identificador frágil que veníamos a
//    arreglar — si alguien reordena los módulos, `?m=3` apunta a otro sitio.
//    Así hay atrás/adelante, recarga y enlaces para pedir "revísame esto".
//
//  · No hay modo "navegación / edición": si puedes editar, los campos se editan.
//    El v1 obligaba a cambiar de pestaña para escribir una frase.
//
//  · El árbol es un `role="tree"` de verdad, con flechas, Inicio/Fin y foco
//    gobernado, y el estado de cada nodo se distingue por forma además de por
//    color.
//
//  · El progreso mide REVISIÓN, no relleno: lo heredado del curso anterior
//    cuenta como pendiente hasta que alguien lo mira.

(function (global) {
  'use strict';

  const { esc, $, $$, debounce, hace } = global.Util;
  const U = global.Unidades;
  const Es = global.Estructura;
  const P = global.Permisos;
  const C = global.Contenido;
  const V = global.Validaciones;
  const B = global.Bloques;
  const Pl = global.Plantilla;

  const DEPARTAMENTO = { departamento: 'informatica' };
  const CURSOS = ['2025-26', '2026-27'];
  const VISTAS = ['contenido', 'cambios', 'validaciones', 'coordinacion'];

  // Apartados que la matriz de coordinación usa como columnas en FP y ESO/Bach.
  // Las rutas se construyen con Estructura.ruta y no a mano: slug() recorta a 60
  // caracteres, así que una constante escrita con el título entero no casaría.
  const R = Es.ruta;
  const COLUMNAS_MODULO = [
    { seccion: R('modulos', 'Propuestas de mejora del curso anterior'), corto: 'Mejoras' },
    { seccion: R('modulos', 'Desarrollo curricular'), corto: 'Desarrollo' },
    { seccion: R('modulos', 'Metodología específica'), corto: 'Metodología' },
    { seccion: R('modulos', 'Situaciones de aprendizaje'), corto: 'Situaciones' },
    { seccion: R('modulos', 'Evaluación y calificación'), corto: 'Evaluación' },
    { seccion: R('modulos', 'Ponderaciones de los Resultados de aprendizaje y los Criterios de evaluación'), corto: 'Ponderac.' },
  ];
  const COLUMNAS_MATERIA = [
    { seccion: R('materias', 'Competencias específicas'), corto: 'Competencias' },
    { seccion: R('materias', 'Criterios de evaluación'), corto: 'Criterios' },
    { seccion: R('materias', 'Saberes básicos'), corto: 'Saberes' },
    { seccion: R('materias', 'Situaciones de aprendizaje'), corto: 'Situaciones' },
  ];
  const SEC_PONDERACIONES = COLUMNAS_MODULO[5].seccion;

  // ---------------------------------------------------------------- estado
  const E = {
    curso: '2026-27',
    docId: 'pd-fp-daw',
    seccion: null,
    unidadId: null,
    usuarioId: 'u-jefedpto',
    vista: 'contenido',
    busqueda: '',
    abiertos: new Set(),
    arbol: null,
    indice: new Map(),
    lineal: [],
    estados: new Map(),
    cajon: false,
    foco: null,          // campo donde está el cursor: a ese le pega la barra
  };

  const usuario = () => C.usuario(E.usuarioId);
  const doc = () => Es.documento(E.docId);
  const claveActiva = () => (E.unidadId ? E.unidadId + '::' + (E.seccion || '') : (E.seccion || E.docId));
  const entradaActiva = () => E.indice.get(claveActiva()) || E.indice.get(E.docId);
  const nodoActivo = () => (entradaActiva() || {}).nodo || null;

  // ---------------------------------------------------------------- rutas
  // #/doc/<docId>/<seccion>?u=<unidad>&v=<vista>&c=<curso>&p=<usuario>
  function escribirRuta(reemplazar) {
    const partes = ['#/doc/' + E.docId];
    if (E.seccion) partes.push(E.seccion);
    const q = [];
    if (E.unidadId) q.push('u=' + encodeURIComponent(E.unidadId));
    if (E.vista !== 'contenido') q.push('v=' + E.vista);
    if (E.curso !== '2026-27') q.push('c=' + E.curso);
    if (E.usuarioId !== 'u-jefedpto') q.push('p=' + E.usuarioId);
    const hash = partes.join('/') + (q.length ? '?' + q.join('&') : '');
    if (global.location.hash === hash) return;
    if (reemplazar) global.history.replaceState(null, '', hash);
    else global.history.pushState(null, '', hash);
  }

  function leerRuta() {
    const hash = global.location.hash.replace(/^#/, '');
    if (!hash.startsWith('/doc/')) return false;
    const [camino, consulta] = hash.split('?');
    const trozos = camino.split('/').filter(Boolean);   // ['doc', docId, ...seccion]
    const docId = trozos[1];
    if (!Es.documento(docId)) return false;
    E.docId = docId;
    E.seccion = trozos.length > 2 ? trozos.slice(2).join('/') : null;

    const q = new global.URLSearchParams(consulta || '');
    E.unidadId = q.get('u') || null;
    const v = q.get('v');
    E.vista = VISTAS.includes(v) ? v : 'contenido';
    const c = q.get('c');
    if (CURSOS.includes(c)) E.curso = c;
    const p = q.get('p');
    if (p && C.usuario(p)) E.usuarioId = p;
    return true;
  }

  // ---------------------------------------------------------------- árbol y estados
  function construir() {
    E.arbol = Es.construirArbol(E.docId, E.curso);
    E.lineal = Es.aplanar(E.arbol).filter(({ nodo }) => nodo.tipo !== 'raiz');
    E.indice = new Map();
    E.indice.set(E.docId, { nodo: E.arbol, camino: [E.arbol] });
    Es.aplanar(E.arbol).forEach((e) => { if (e.nodo.clave) E.indice.set(e.nodo.clave, e); });

    // si la sección de la URL no existe en este documento, al primer apartado
    if (!E.indice.has(claveActiva())) {
      const primero = E.lineal[0];
      E.seccion = primero ? primero.nodo.seccion : null;
      E.unidadId = primero ? primero.nodo.unidadId : null;
    }
    calcularEstados();
    abrirHasta(claveActiva());
  }

  // Estado de cada nodo, calculado una vez por repintado.
  //   revisado | modificado | heredado | vacio | avisos
  function calcularEstados() {
    E.estados = new Map();
    const u = usuario();
    const hojas = [];

    const estadoHoja = (nodo) => {
      const a = C.apartado(E.docId, nodo);
      if (V.deApartado(E.docId, nodo, E.curso).some((x) => x.severidad === 'error')) return 'errores';
      if (!a.bloques.length || a.origen === 'vacio') return 'vacio';
      // escrito y sin errores; falta que alguien lo dé por bueno para este curso
      return a.origen === 'heredado' ? 'completo' : 'validado';
    };

    // Estado de una rama a partir de sus hijos y del suyo propio. "Incompleto" solo
    // le pasa a las ramas: significa que hay cosas hechas pero falta alguna.
    const agregar = (estados) => {
      if (!estados.length) return 'validado';
      if (estados.indexOf('errores') !== -1) return 'errores';
      if (estados.every((x) => x === 'vacio')) return 'vacio';
      if (estados.some((x) => x === 'vacio' || x === 'incompleto')) return 'incompleto';
      return estados.every((x) => x === 'validado') ? 'validado' : 'completo';
    };

    (function rec(nodo) {
      const hijos = nodo.hijos.map(rec);
      let propio = null;
      if (P.esContenido(nodo)) {
        propio = estadoHoja(nodo);
        hojas.push({ nodo, estado: propio });
      }
      const estados = hijos.map((h) => h.estado).concat(propio ? [propio] : []).filter(Boolean);
      const peor = agregar(estados);

      // El candado de un nodo de paso (una unidad, un bloque) sale de sus hijos:
      // la unidad en sí no se edita, pero si no puedes tocar nada de dentro, en
      // el árbol tiene que verse cerrada.
      const bloqueado = P.esContenido(nodo)
        ? !P.puedeEditar(u, nodo, DEPARTAMENTO)
        : hijos.length > 0 && hijos.every((h) => h.bloqueado);

      E.estados.set(nodo.clave || E.docId, { propio, agregado: peor, bloqueado });
      return { estado: peor, bloqueado };
    })(E.arbol);

    // Progreso = apartados ya validados para este curso. Lo que viene del curso
    // anterior sin que nadie lo haya mirado cuenta como pendiente.
    const hechos = hojas.filter((h) => h.estado === 'validado').length;
    E.progreso = { hechos, total: hojas.length, pct: hojas.length ? Math.round((hechos / hojas.length) * 100) : 0 };
  }

  function abrirHasta(clave) {
    const e = E.indice.get(clave);
    if (!e) return;
    e.camino.forEach((n) => { if (n.hijos.length && n.clave) E.abiertos.add(n.clave); });
  }

  // ---------------------------------------------------------------- distintivos de estado
  // El color es el que lleva la información, como en el v1; la forma va detrás
  // para que se distinga también sin color (vacío anillo punteado, completo
  // relleno, incompleto medio relleno, validado ✓, errores !).
  const GLIFO = { validado: '✓', errores: '!', completo: '', incompleto: '', vacio: '' };
  const NOMBRE_ESTADO = {
    validado: 'validado',
    completo: 'completo, pendiente de validar',
    incompleto: 'incompleto: falta algún apartado',
    vacio: 'vacío',
    errores: 'con errores',
  };

  // De dónde viene el apartado. Esto ya no se pinta en el árbol: sale en la
  // cabecera del apartado y en la vista Cambios.
  const NOMBRE_ORIGEN = {
    heredado: 'viene de un curso anterior, sin revisar',
    revisado: 'validado sin cambios',
    modificado: 'reescrito este curso',
    nuevo: 'nuevo este curso',
    vacio: 'vacío',
  };

  // ---------------------------------------------------------------- barra lateral
  function coincide(nodo, q) {
    if (!q) return true;
    const texto = (nodo.titulo + ' ' + (nodo.num || '')).toLowerCase();
    if (texto.indexOf(q) !== -1) return true;
    return nodo.hijos.some((h) => coincide(h, q));
  }

  function pintarArbol() {
    const q = E.busqueda.trim().toLowerCase();
    const activa = claveActiva();

    function fila(nodo, nivel) {
      if (!coincide(nodo, q)) return '';
      const est = E.estados.get(nodo.clave) || {};
      const abierto = E.abiertos.has(nodo.clave) || (!!q && nodo.hijos.length > 0);
      const esActiva = nodo.clave === activa;
      const glifo = est.agregado ? GLIFO[est.agregado] : '';
      const unidad = nodo.unidadId ? U.unidad(nodo.unidadId) : null;
      const compartido = C.SECCIONES_COMPARTIDAS.has(nodo.seccion);

      const etiqueta = [
        nodo.num ? nodo.num : '',
        nodo.corto || nodo.titulo,
        est.agregado ? '— ' + NOMBRE_ESTADO[est.agregado] : '',
        est.bloqueado ? ', solo lectura' : '',
      ].filter(Boolean).join(' ');

      const hijos = nodo.hijos.length
        ? '<ul role="group" class="grupo' + (abierto ? '' : ' cerrado') + '">'
          + nodo.hijos.map((h) => fila(h, nivel + 1)).join('') + '</ul>'
        : '';

      return '<li role="treeitem" class="nodo' + (esActiva ? ' activa' : '') + '"'
        + ' data-clave="' + esc(nodo.clave) + '"'
        + ' aria-selected="' + (esActiva ? 'true' : 'false') + '"'
        + (nodo.hijos.length ? ' aria-expanded="' + (abierto ? 'true' : 'false') + '"' : '')
        + ' aria-label="' + esc(etiqueta) + '"'
        + ' tabindex="' + (esActiva ? '0' : '-1') + '">'
        + '<span class="fila" style="--nivel:' + nivel + '">'
        + '<span class="twisty" aria-hidden="true">' + (nodo.hijos.length ? '▸' : '') + '</span>'
        + (nodo.num ? '<span class="num">' + esc(nodo.num) + '</span>' : '')
        + '<span class="etq">' + esc(nodo.corto || nodo.titulo) + '</span>'
        + (unidad && unidad.codigo ? '<span class="distintivo distintivo-cod">' + esc(unidad.codigo) + '</span>' : '')
        + (compartido ? '<span class="distintivo distintivo-com" title="Lleva texto compartido">com.</span>' : '')
        + (est.bloqueado ? '<span class="candado" aria-hidden="true" title="Solo lectura">' + svgCandado() + '</span>' : '')
        + '<span class="glifo glifo-' + esc(est.agregado || '') + '" aria-hidden="true"'
        + ' title="' + esc(NOMBRE_ESTADO[est.agregado] || '') + '">' + glifo + '</span>'
        + '</span>' + hijos + '</li>';
    }

    $('#arbol').innerHTML = '<ul role="tree" aria-label="Estructura del documento" id="raiz-arbol">'
      + E.arbol.hijos.map((h) => fila(h, 0)).join('') + '</ul>';

    $('#pct-progreso').textContent = E.progreso.pct + ' %';
    $('#barra-progreso').style.width = E.progreso.pct + '%';
    $('#progreso-detalle').textContent = E.progreso.hechos + ' de ' + E.progreso.total + ' apartados validados';
  }

  const svgCandado = () => '<svg viewBox="0 0 24 24" class="ico-mini"><rect x="5" y="11" width="14" height="9" rx="2"'
    + ' fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 11V8a4 4 0 0 1 8 0v3"'
    + ' fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';

  // ---------------------------------------------------------------- selector de documento
  function pintarSelectorDocumento() {
    const grupos = Es.GRUPOS.map((g) => {
      const docs = g.ramas
        ? g.ramas.map((r) => '<optgroup label="' + esc(g.nombre + ' · ' + r.nombre) + '">'
          + r.docs.map(opcionDoc).join('') + '</optgroup>').join('')
        : '<optgroup label="' + esc(g.nombre) + '">' + g.docs.map(opcionDoc).join('') + '</optgroup>';
      return docs;
    }).join('');
    $('#selector-doc').innerHTML = grupos;
  }

  function opcionDoc(id) {
    const d = Es.documento(id);
    return '<option value="' + esc(id) + '"' + (id === E.docId ? ' selected' : '') + '>' + esc(d.corto) + '</option>';
  }

  // ---------------------------------------------------------------- cabecera
  function pintarCabecera() {
    const e = entradaActiva();
    if (!e) return;
    const { nodo, camino } = e;
    const u = usuario();
    const editable = P.puedeEditar(u, nodo, DEPARTAMENTO);
    const est = E.estados.get(nodo.clave) || {};
    const unidad = nodo.unidadId ? U.unidad(nodo.unidadId) : null;

    $('#migas').innerHTML = [doc().corto].concat(
      camino.filter((n) => n.tipo !== 'raiz').map((n) => n.corto || n.titulo)
    ).map((t, i, arr) => (i === arr.length - 1
      ? '<span aria-current="page">' + esc(t) + '</span>'
      : '<span>' + esc(t) + '</span><span class="sep" aria-hidden="true">›</span>')).join('');

    $('#titulo-seccion').textContent = (nodo.num ? nodo.num + '. ' : '') + nodo.titulo;

    const chips = [];
    if (unidad) {
      chips.push('<span class="chip">' + esc(U.tituloDe(unidad, E.curso)) + '</span>');
      chips.push('<span class="chip chip-cod">' + esc(U.etiquetaCodigo(unidad)) + '</span>');
      const docentes = C.docentesDe(unidad.id);
      chips.push('<span class="chip' + (docentes.length ? '' : ' chip-error') + '">'
        + (docentes.length ? esc(docentes.map((d) => d.nombre).join(', ')) : 'sin docente asignado') + '</span>');
    }
    if (est.propio) {
      chips.push('<span class="chip chip-' + esc(est.propio) + '">' + esc(NOMBRE_ESTADO[est.propio]) + '</span>');
    }
    // La procedencia, aquí y no en el árbol
    if (P.esContenido(nodo)) {
      const origen = C.apartado(E.docId, nodo).origen;
      if (NOMBRE_ORIGEN[origen]) {
        chips.push('<span class="chip chip-origen">' + esc(NOMBRE_ORIGEN[origen]) + '</span>');
      }
    }
    if (!editable && P.esContenido(nodo)) {
      chips.push('<span class="chip chip-lock">solo lectura</span>');
    }
    $('#chips').innerHTML = chips.join('');

    // Validar solo tiene sentido en lo que viene de un curso anterior sin mirar
    const pendiente = P.esContenido(nodo) && C.apartado(E.docId, nodo).origen === 'heredado';
    $('#btn-revisado').hidden = !(editable && pendiente);
  }

  // ---------------------------------------------------------------- contenido
  function pintarContenido() {
    const cont = $('#contenido');
    const e = entradaActiva();
    if (!e) { cont.innerHTML = ''; return; }
    const { nodo } = e;

    if (E.vista === 'coordinacion') { cont.innerHTML = vistaCoordinacion(); return; }
    if (E.vista === 'validaciones') { cont.innerHTML = vistaValidaciones(); return; }
    if (E.vista === 'cambios') { cont.innerHTML = vistaCambios(nodo); return; }

    if (nodo.tipo === 'raiz') {
      cont.innerHTML = vistaResumen(nodo) + tarjetaRetirados();
      return;
    }
    if (nodo.tipo === 'bloque') {
      cont.innerHTML = vistaResumen(nodo) + barraEstructura(nodo, e.camino);
      return;
    }
    if (nodo.tipo === 'unidad') { cont.innerHTML = vistaUnidad(nodo) + listaHijos(nodo); return; }
    E.foco = null;
    cont.innerHTML = vistaApartado(nodo) + barraEstructura(nodo, e.camino);
    $$('#contenido textarea[data-bloque]').forEach(autoalto);
  }

  // --- apartado normal
  function vistaApartado(nodo) {
    const u = usuario();
    const editable = P.puedeEditar(u, nodo, DEPARTAMENTO);
    const a = C.apartado(E.docId, nodo);
    const compartidoId = C.SECCIONES_COMPARTIDAS.get(nodo.seccion);
    const compartido = compartidoId ? C.COMPARTIDOS[compartidoId] : null;

    const permisos = compartido ? {
      editarGlobal: P.puedeEditarCompartido(u, compartido, DEPARTAMENTO),
      desvincular: P.puedeDesvincular(u, compartido, nodo, DEPARTAMENTO),
    } : null;

    let html = '';
    if (!editable) {
      html += '<div class="nota nota-lock">' + svgCandado() + '<div>'
        + esc(P.motivoBloqueo(u, nodo, DEPARTAMENTO)) + '</div></div>';
    }

    if (nodo.unidadId && nodo.seccion === SEC_PONDERACIONES) {
      html += tablaPonderaciones(nodo, editable);
    }

    html += '<section class="tarjeta">'
      + '<header class="tarjeta-cab"><h2>Texto del apartado</h2></header>'
      + (editable ? barraFormato() : '')
      + '<div class="bloques" id="bloques">' + B.pintar(a.bloques, editable, permisos) + '</div>'
      + '</section>';

    html += '<details class="tarjeta fidelidad"><summary>Ver lo que se guardaría en la base de datos</summary>'
      + '<p class="suave">Es el JSON que recibe <code>render-generico.js</code>. Si aquí aparece HTML, el ida y vuelta al PDF está roto.</p>'
      + '<pre>' + esc(B.aJSON(a.bloques)) + '</pre></details>';

    return html;
  }

  // --- la barra de herramientas
  // Es la del v1, con los mismos botones en el mismo sitio, pero conectada. Y
  // dice sobre qué campo va a actuar, que es lo que allí faltaba: unos botones
  // que no dicen a quién le pegan y además no hacen nada no se distinguen de
  // unos botones estropeados.
  function barraFormato() {
    const boton = (marca, etq, titulo, atajos) =>
      '<button type="button" class="tb tb-formato" data-op="marca" data-marca="' + marca + '"'
      + ' title="' + titulo + '" aria-keyshortcuts="' + atajos + '">' + etq + '</button>';
    return '<div class="toolbar">'
      + boton('bold', '<strong>N</strong>', 'Negrita (Ctrl+B o Alt+N)', 'Control+B Alt+N')
      + boton('italics', '<em>C</em>', 'Cursiva (Ctrl+I o Alt+C)', 'Control+I Alt+C')
      + '<span class="sep"></span>'
      + '<button type="button" class="tb" data-op="anadir-parrafo">+ párrafo</button>'
      + '<button type="button" class="tb" data-op="anadir-lista">+ lista</button>'
      + '<span class="sep"></span>'
      + '<span class="tb-donde" id="tb-donde">' + esc(etiquetaFoco()) + '</span>'
      + '<span class="ayuda">Marcan lo seleccionado, o la palabra donde esté el cursor. '
      + 'Atajos <kbd>Ctrl</kbd>+<kbd>B</kbd> y <kbd>Ctrl</kbd>+<kbd>I</kbd>, o <kbd>Alt</kbd>+<kbd>N</kbd> '
      + 'y <kbd>Alt</kbd>+<kbd>C</kbd> (<kbd>Ctrl</kbd>+<kbd>N</kbd> no: es del navegador y abre una '
      + 'ventana nueva). Enlaces todavía no: el PDF no los pinta.</span>'
      + '</div>';
  }

  // --- resumen de la unidad
  function vistaUnidad(nodo) {
    const unidad = U.unidad(nodo.unidadId);
    const docentes = C.docentesDe(nodo.unidadId);
    const avisos = V.deUnidad(E.docId, nodo, E.curso);
    return '<section class="tarjeta">'
      + '<header class="tarjeta-cab"><h2>' + esc(U.tituloDe(unidad, E.curso)) + '</h2></header>'
      + '<dl class="ficha">'
      + '<dt>Id interno</dt><dd><code>' + esc(unidad.id) + '</code></dd>'
      + '<dt>Código del título</dt><dd>' + esc(U.etiquetaCodigo(unidad)) + '</dd>'
      + '<dt>Profesorado</dt><dd>' + (docentes.length
        ? esc(docentes.map((d) => d.nombre).join(', '))
        : '<span class="rojo">sin asignar</span>') + '</dd>'
      + (unidad.titulos ? '<dt>Título en 2025-26</dt><dd>' + esc(unidad.titulos['2025-26'])
        + ' <span class="suave">(cambió de nombre; el id y las asignaciones no)</span></dd>' : '')
      + '</dl>'
      + (avisos.length ? '<ul class="avisos-en-linea">' + avisos.map((a) =>
        '<li class="' + esc(a.severidad) + '">' + esc(a.titulo) + '</li>').join('') + '</ul>' : '')
      + '</section>';
  }

  // --- tabla con los hijos de un nodo de paso
  function listaHijos(nodo) {
    if (!nodo.hijos.length) return '';
    const filas = nodo.hijos.map((h) => {
      const est = E.estados.get(h.clave) || {};
      return '<tr><td><button class="enlace" data-ir="' + esc(h.clave) + '">'
        + (h.num ? esc(h.num) + '. ' : '') + esc(h.corto || h.titulo) + '</button></td>'
        + '<td>' + estadoPastilla(est.agregado) + '</td>'
        + '<td class="suave">' + (h.hijos.length ? h.hijos.length + ' apartados' : 'apartado final') + '</td></tr>';
    }).join('');
    return '<section class="tarjeta">'
      + '<header class="tarjeta-cab"><h2>Apartados</h2></header>'
      + '<table class="tabla"><thead><tr><th>Apartado</th><th>Estado</th><th></th></tr></thead>'
      + '<tbody>' + filas + '</tbody></table></section>';
  }

  // --- resumen de documento o de bloque
  function vistaResumen(nodo) {
    const avisos = V.deDocumento(E.docId, E.arbol, E.curso);
    const c = V.cuenta(avisos);
    return '<section class="tarjeta">'
      + '<header class="tarjeta-cab"><h2>' + esc(nodo.titulo) + '</h2></header>'
      + '<div class="metricas">'
      + metrica(E.progreso.pct + ' %', 'validado')
      + metrica(c.error, 'errores', c.error ? 'rojo' : '')
      + metrica(c.aviso, 'avisos', c.aviso ? 'ambar' : '')
      + metrica(E.lineal.filter((x) => x.nodo.tipo === 'unidad').length, 'unidades')
      + '</div></section>' + listaHijos(nodo);
  }

  const metrica = (valor, etq, clase) => '<div class="metrica"><b class="' + (clase || '') + '">'
    + esc(valor) + '</b><span>' + esc(etq) + '</span></div>';

  const estadoPastilla = (estado) => estado
    ? '<span class="pastilla pastilla-' + esc(estado) + '"><i aria-hidden="true">' + GLIFO[estado]
      + '</i> ' + esc(NOMBRE_ESTADO[estado]) + '</span>'
    : '';

  // --- ponderaciones con suma en vivo
  function tablaPonderaciones(nodo, editable) {
    const ra = C.ponderaciones(nodo.unidadId);
    const total = ra.reduce((s, r) => s + r.peso, 0);
    const filas = ra.map((r) => {
      const suma = r.ce.reduce((s, c) => s + c.peso, 0);
      const malo = suma !== r.peso;
      return '<tr class="fila-ra"><td><b>RA' + r.num + '</b></td><td>' + esc(r.texto) + '</td>'
        + '<td class="centro"><input type="number" value="' + r.peso + '" min="0" max="100" step="0.5"'
        + ' aria-label="Ponderación del RA' + r.num + '"' + (editable ? '' : ' disabled') + '></td></tr>'
        + r.ce.map((c) => '<tr class="fila-ce"><td class="letra">' + esc(c.letra) + ')</td>'
          + '<td>' + esc(c.texto) + '</td>'
          + '<td class="centro"><input type="number" value="' + c.peso + '" min="0" max="100" step="0.5"'
          + ' aria-label="Ponderación del criterio ' + c.letra + ' del RA' + r.num + '"'
          + (editable ? '' : ' disabled') + '></td></tr>').join('')
        + '<tr class="fila-suma' + (malo ? ' mal' : '') + '"><td></td>'
        + '<td class="derecha suave">suma de los criterios del RA' + r.num + '</td>'
        + '<td class="centro"><b>' + suma + ' %</b></td></tr>';
    }).join('');

    return '<section class="tarjeta">'
      + '<header class="tarjeta-cab"><h2>Ponderaciones</h2>'
      + '<span class="total' + (total === 100 ? ' bien' : ' mal') + '">total ' + total + ' %</span></header>'
      + '<table class="tabla tabla-pond"><thead><tr><th></th><th>Resultado de aprendizaje y criterios</th>'
      + '<th class="centro">Peso</th></tr></thead><tbody>' + filas + '</tbody></table>'
      + '<p class="suave">Los pesos de muestra se recalculan solos: la suma de los RA tiene que dar 100 % y los criterios de cada RA, el peso de su RA.</p>'
      + '</section>';
  }

  // ---------------------------------------------------------------- estructura del documento
  // Cambiar el título de un apartado, añadir uno, moverlo o retirarlo. Sin esto,
  // la única forma de tocar la estructura es reimportar un Word, y el Word sigue
  // siendo la fuente de verdad.
  const puedeEstructura = () => {
    const r = usuario().rol;
    return r === 'jefe_departamento' || r === 'admin';
  };

  // El apartado padre en la ruta de secciones, que es la clave con la que
  // js/plantilla.js guarda el orden y los apartados añadidos.
  const padreDe = (seccion) => {
    const corte = String(seccion || '').lastIndexOf('/');
    return corte === -1 ? '' : seccion.slice(0, corte);
  };

  // Hermanos ordenados tal como se están pintando. Se filtran por ruta para que
  // las unidades (que cuelgan de un bloque con otro prefijo) no entren.
  function hermanosDe(camino, nodo) {
    const padre = camino[camino.length - 2];
    const base = padreDe(nodo.seccion);
    const lista = (padre ? padre.hijos : [])
      .filter((h) => h.seccion && padreDe(h.seccion) === base && h.tipo !== 'unidad');
    return { base, ids: lista.map((h) => Es.idLocal(h.seccion)) };
  }

  function barraEstructura(nodo, camino) {
    if (!puedeEstructura() || !nodo.seccion || nodo.tipo === 'unidad') return '';
    const local = Es.idLocal(nodo.seccion);
    const { ids } = hermanosDe(camino, nodo);
    const i = ids.indexOf(local);
    const enUnidad = nodo.seccion === 'modulos' || nodo.seccion.indexOf('modulos/') === 0
      || nodo.seccion === 'materias' || nodo.seccion.indexOf('materias/') === 0;
    const renombrado = !!Pl.titulo(E.docId, nodo.seccion);

    return '<section class="tarjeta estructura">'
      + '<header class="tarjeta-cab"><h2>Estructura</h2>'
      + '<span class="distintivo distintivo-cod" title="Identificador interno: no cambia al renombrar">'
      + esc(nodo.seccion) + '</span></header>'

      + '<form class="linea-estructura" id="form-renombrar">'
      + '<label for="titulo-nuevo">Título del apartado</label>'
      + '<input id="titulo-nuevo" value="' + esc(nodo.titulo) + '" autocomplete="off">'
      + '<button class="btn-ghost" type="submit">Renombrar</button>'
      + (renombrado ? '<button class="mini" type="button" data-estructura="titulo-original">volver al título importado</button>' : '')
      + '</form>'

      + '<form class="linea-estructura" id="form-anadir">'
      + '<label for="titulo-hijo">Añadir un subapartado</label>'
      + '<input id="titulo-hijo" placeholder="Título del apartado nuevo" autocomplete="off">'
      + '<button class="btn-ghost" type="submit">Añadir</button>'
      + '</form>'

      + '<div class="linea-estructura">'
      + '<span class="suave">Orden y retirada</span>'
      + '<button class="mini" data-estructura="subir"' + (i <= 0 ? ' disabled' : '') + '>↑ subir</button>'
      + '<button class="mini" data-estructura="bajar"' + (i === -1 || i >= ids.length - 1 ? ' disabled' : '') + '>↓ bajar</button>'
      + '<button class="mini" data-estructura="retirar">retirar del documento</button>'
      + '</div>'

      + '<p class="suave">Renombrar <strong>no cambia el identificador</strong> (<code>' + esc(nodo.seccion)
      + '</code>): el texto, los comentarios y los enlaces que alguien tenga guardados siguen apuntando aquí. '
      + 'Retirar tampoco borra nada: el apartado deja de salir y se puede recuperar desde la portada del documento.'
      + (enUnidad ? ' Ojo: esto es la <strong>plantilla</strong>, así que el cambio se ve en todas las unidades a la vez.' : '')
      + '</p></section>';
  }

  // Apartados retirados del documento, para poder recuperarlos
  function tarjetaRetirados() {
    const retirados = Pl.retiradosDe(E.docId);
    if (!retirados.length || !puedeEstructura()) return '';
    return '<section class="tarjeta">'
      + '<header class="tarjeta-cab"><h2>Apartados retirados</h2>'
      + '<span class="suave">' + retirados.length + '</span></header>'
      + '<p class="suave">No se han borrado: su contenido sigue guardado y vuelven al documento al restaurarlos.</p>'
      + '<ul class="lista-retirados">' + retirados.map((sec) =>
        '<li><code>' + esc(sec) + '</code>'
        + '<button class="mini" data-estructura="restaurar" data-seccion="' + esc(sec) + '">restaurar</button></li>').join('')
      + '</ul></section>';
  }

  // ---------------------------------------------------------------- vista de cambios (diff)
  function vistaCambios(nodo) {
    if (!P.esContenido(nodo)) {
      return '<div class="nota">Elige un apartado concreto para comparar con el curso anterior.</div>';
    }
    const a = C.apartado(E.docId, nodo);
    const previo = CURSOS[CURSOS.indexOf(E.curso) - 1];
    if (!previo) {
      return '<section class="tarjeta"><header class="tarjeta-cab"><h2>No hay curso anterior</h2></header>'
        + '<p>' + esc(E.curso) + ' es el curso más antiguo cargado: no hay nada con lo que comparar.</p></section>';
    }
    const anterior = a.anterior;

    if (!anterior) {
      return '<section class="tarjeta"><header class="tarjeta-cab"><h2>Sin versión anterior</h2></header>'
        + '<p>Este apartado es nuevo de ' + esc(E.curso) + ': no hay nada de ' + esc(previo) + ' con lo que compararlo.</p></section>';
    }

    const u = usuario();
    const editable = P.puedeEditar(u, nodo, DEPARTAMENTO);
    const textoDe = (bs) => bs.filter((b) => b.type === 'p').map((b) => b.text);
    const viejos = textoDe(anterior);
    const nuevos = textoDe(a.bloques);
    const parejas = Math.max(viejos.length, nuevos.length);

    let cuerpo = '';
    for (let i = 0; i < parejas; i++) {
      cuerpo += '<div class="diff-par">'
        + '<div class="diff-col diff-antes"><span class="diff-etq">' + esc(previo) + '</span><p>'
        + (viejos[i] ? marcarDiff(viejos[i], nuevos[i] || '', 'quita') : '<em class="suave">(no existía)</em>') + '</p></div>'
        + '<div class="diff-col diff-ahora"><span class="diff-etq">' + esc(E.curso) + '</span><p>'
        + (nuevos[i] ? marcarDiff(nuevos[i], viejos[i] || '', 'pon') : '<em class="suave">(se ha quitado)</em>') + '</p></div>'
        + '</div>';
    }

    return '<section class="tarjeta">'
      + '<header class="tarjeta-cab"><h2>Comparación con ' + esc(previo) + '</h2>'
      + '<span class="chip chip-origen">' + esc(NOMBRE_ORIGEN[a.origen] || '') + '</span></header>'
      + '<div class="diff">' + cuerpo + '</div>'
      + (editable && a.origen === 'heredado'
        ? '<div class="diff-pie"><button class="btn-primario" data-op="revisado">Validar este apartado</button>'
          + '<span class="suave">Pasa a contar como validado en el progreso del documento.</span></div>'
        : '')
      + '</section>';
  }

  // Diff de palabras (LCS): marca en `texto` lo que no está en `otro`.
  function marcarDiff(texto, otro, clase) {
    const a = texto.split(/(\s+)/);
    const b = otro.split(/(\s+)/);
    const n = a.length, m = b.length;
    // tabla LCS; los párrafos son cortos, así que cabe de sobra
    const tabla = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        tabla[i][j] = a[i] === b[j] ? tabla[i + 1][j + 1] + 1 : Math.max(tabla[i + 1][j], tabla[i][j + 1]);
      }
    }
    let i = 0, j = 0, out = '';
    while (i < n) {
      if (j < m && a[i] === b[j]) { out += esc(a[i]); i++; j++; }
      else if (j < m && tabla[i + 1][j] >= tabla[i][j + 1]) { out += '<mark class="' + clase + '">' + esc(a[i]) + '</mark>'; i++; }
      else if (j < m) { j++; }
      else { out += '<mark class="' + clase + '">' + esc(a[i]) + '</mark>'; i++; }
    }
    return out;
  }

  // ---------------------------------------------------------------- vista de validaciones
  // Agrupadas por unidad: una lista plana de 60 avisos no dice a quién hay que
  // avisar, y es lo primero que se pregunta la jefatura de departamento.
  function vistaValidaciones() {
    const avisos = V.deDocumento(E.docId, E.arbol, E.curso);
    const c = V.cuenta(avisos);
    const orden = { error: 0, aviso: 1, info: 2 };

    // se guarda la lista aplanada en el mismo orden en que se pinta, porque el
    // clic en un aviso la indexa
    const grupos = new Map();
    avisos.forEach((a) => {
      const clave = a.destino.unidadId || '';
      if (!grupos.has(clave)) grupos.set(clave, []);
      grupos.get(clave).push(a);
    });

    const ordenados = [...grupos.entries()].map(([unidadId, lista]) => ({
      unidadId,
      titulo: unidadId ? U.tituloDe(unidadId, E.curso) : 'Apartados comunes',
      lista: lista.slice().sort((x, y) => orden[x.severidad] - orden[y.severidad]),
      cuenta: V.cuenta(lista),
      responsables: unidadId ? C.docentesDe(unidadId).map((d) => d.nombre) : [],
    })).sort((a, b) => (b.cuenta.error - a.cuenta.error) || (b.cuenta.aviso - a.cuenta.aviso));

    E.avisosVisibles = [];
    const bloques = ordenados.map((g) => {
      const desde = E.avisosVisibles.length;
      E.avisosVisibles = E.avisosVisibles.concat(g.lista);
      const filas = g.lista.map((a, i) => '<li class="' + esc(a.severidad) + '">'
        + '<span class="sev">' + (a.severidad === 'error' ? 'Error' : 'Aviso') + '</span>'
        + '<div><button class="enlace" data-aviso="' + (desde + i) + '">' + esc(a.titulo) + '</button>'
        + '<span class="suave">' + esc(a.detalle) + '</span></div></li>').join('');

      return '<details class="grupo-avisos"' + (g.cuenta.error ? ' open' : '') + '>'
        + '<summary>'
        + '<b>' + esc(g.titulo) + '</b>'
        + (g.cuenta.error ? '<span class="marca-error">' + g.cuenta.error + ' error' + (g.cuenta.error > 1 ? 'es' : '') + '</span>' : '')
        + (g.cuenta.aviso ? '<span class="marca-aviso">' + g.cuenta.aviso + ' aviso' + (g.cuenta.aviso > 1 ? 's' : '') + '</span>' : '')
        + '<span class="suave">' + (g.unidadId
          ? (g.responsables.length ? esc(g.responsables.join(', ')) : 'sin docente asignado')
          : 'jefatura de departamento') + '</span>'
        + '</summary>'
        + '<ul class="lista-avisos grande">' + filas + '</ul>'
        + '</details>';
    }).join('');

    return '<section class="tarjeta">'
      + '<header class="tarjeta-cab"><h2>Comprobaciones del documento</h2>'
      + (V.puedeAprobarse(avisos)
        ? '<span class="total bien">se puede aprobar</span>'
        : '<span class="total mal">' + c.error + ' error(es) sin resolver</span>') + '</header>'
      + '<p class="suave">Las mismas comprobaciones que hoy salen en la cajita roja al final del PDF, pero antes de exportar, agrupadas por quién tiene que arreglarlas y con enlace al apartado que falla. Los errores impiden aprobar el documento; los avisos, no.</p>'
      + '<div class="metricas">' + metrica(c.error, 'errores', c.error ? 'rojo' : '')
      + metrica(c.aviso, 'avisos', c.aviso ? 'ambar' : '')
      + metrica(ordenados.length, 'grupos afectados') + '</div>'
      + (avisos.length ? bloques : '<p class="bien">No hay nada pendiente en este documento.</p>')
      + '</section>';
  }

  // ---------------------------------------------------------------- matriz de coordinación
  function vistaCoordinacion() {
    // solo las unidades de primer nivel: los bloques con permiso propio (PIAR I
    // y II) cuelgan de su materia y se ven al entrar en ella
    const unidades = E.lineal
      .filter((x) => x.nodo.tipo === 'unidad' && (x.nodo.seccion === 'modulos' || x.nodo.seccion === 'materias'))
      .map((x) => x.nodo);
    if (!unidades.length) return coordinacionComun();

    const esMateria = unidades[0].seccion === 'materias';
    const columnas = esMateria ? COLUMNAS_MATERIA : COLUMNAS_MODULO;

    const filas = unidades.map((un) => {
      const docentes = C.docentesDe(un.unidadId);
      const celdas = columnas.map((col) => {
        const clave = un.unidadId + '::' + col.seccion;
        const e = E.indice.get(clave);
        if (!e) return '<td class="celda vacia" title="este apartado no existe en esta unidad">–</td>';
        const est = E.estados.get(clave) || {};
        return '<td class="celda celda-' + esc(est.agregado || '') + '">'
          + '<button data-ir="' + esc(clave) + '" title="' + esc(col.corto + ': ' + (NOMBRE_ESTADO[est.agregado] || '')) + '">'
          + '<span aria-hidden="true">' + (GLIFO[est.agregado] || '') + '</span>'
          + '<span class="sr">' + esc(col.corto + ', ' + (NOMBRE_ESTADO[est.agregado] || '')) + '</span>'
          + '</button></td>';
      }).join('');
      return '<tr><th scope="row"><button class="enlace" data-ir="' + esc(un.clave) + '">'
        + esc(U.tituloDe(un.unidadId, E.curso)) + '</button>'
        + '<span class="suave">' + (docentes.length
          ? esc(docentes.map((d) => d.nombre).join(', '))
          : '<span class="rojo">sin asignar</span>') + '</span></th>' + celdas + '</tr>';
    }).join('');

    return '<section class="tarjeta">'
      + '<header class="tarjeta-cab"><h2>Coordinación</h2>'
      + '<span class="suave">' + unidades.length + ' unidades · ' + E.progreso.pct + ' % validado</span></header>'
      + '<p class="suave">Quién lleva cada unidad y cómo va cada bloque. Es la pantalla que mira la jefatura de departamento para saber qué falta, y la que no tenía el v1.</p>'
      + '<div class="tabla-scroll"><table class="tabla matriz"><thead><tr><th>Unidad</th>'
      + columnas.map((c) => '<th class="centro">' + esc(c.corto) + '</th>').join('')
      + '</tr></thead><tbody>' + filas + '</tbody></table></div>'
      + leyenda()
      + '</section>';
  }

  function coordinacionComun() {
    const filas = E.arbol.hijos.map((h) => {
      const est = E.estados.get(h.clave) || {};
      return '<tr><th scope="row"><button class="enlace" data-ir="' + esc(h.clave) + '">'
        + (h.num ? esc(h.num) + '. ' : '') + esc(h.titulo) + '</button></th>'
        + '<td>' + estadoPastilla(est.agregado) + '</td>'
        + '<td class="suave">jefatura de departamento</td></tr>';
    }).join('');
    return '<section class="tarjeta">'
      + '<header class="tarjeta-cab"><h2>Coordinación</h2></header>'
      + '<p class="suave">Este documento no se reparte por unidades: lo lleva la jefatura de departamento, salvo los apartados que asigne.</p>'
      + '<table class="tabla"><thead><tr><th>Apartado</th><th>Estado</th><th>Responsable</th></tr></thead>'
      + '<tbody>' + filas + '</tbody></table>' + leyenda() + '</section>';
  }

  const leyenda = () => '<ul class="leyenda">'
    + Object.keys(NOMBRE_ESTADO).map((k) => '<li><i class="glifo glifo-' + k + '" aria-hidden="true">'
      + GLIFO[k] + '</i> ' + esc(NOMBRE_ESTADO[k]) + '</li>').join('') + '</ul>';

  // ---------------------------------------------------------------- panel derecho
  function pintarPanel() {
    const e = entradaActiva();
    if (!e) return;
    const { nodo } = e;
    const avisos = P.esContenido(nodo)
      ? V.deApartado(E.docId, nodo, E.curso)
      : V.deDocumento(E.docId, E.arbol, E.curso).slice(0, 12);

    const lista = avisos.length
      ? '<ul class="lista-avisos">' + avisos.map((a) => '<li class="' + esc(a.severidad) + '">'
        + '<b>' + esc(a.titulo) + '</b><span>' + esc(a.detalle) + '</span></li>').join('') + '</ul>'
      : '<p class="bien">Sin incidencias en este apartado.</p>';

    const comentarios = C.comentarios(E.docId, nodo);
    const hilo = comentarios.length
      ? comentarios.map((c) => '<li><b>' + esc(c.autor) + '</b><span class="suave">' + esc(hace(c.fecha))
        + '</span><p>' + esc(c.texto) + '</p></li>').join('')
      : '<li class="suave">Todavía nadie ha comentado este apartado.</li>';

    $('#panel').innerHTML = '<div class="panel-caja"><header>Comprobaciones</header>' + lista + '</div>'
      + '<div class="panel-caja"><header>Comentarios</header>'
      + '<ul class="hilo">' + hilo + '</ul>'
      + (nodo.tipo !== 'raiz' ? '<form id="form-comentario">'
        + '<label class="sr" for="texto-comentario">Comentario</label>'
        + '<textarea id="texto-comentario" rows="2" placeholder="Pedir una aclaración, dejar una nota al compañero…"></textarea>'
        + '<button class="btn-ghost" type="submit">Comentar como ' + esc(usuario().nombre) + '</button>'
        + '</form>' : '')
      + '</div>';
  }

  // ---------------------------------------------------------------- pie
  function pintarPie() {
    const i = E.lineal.findIndex((x) => x.nodo.clave === claveActiva());
    $('#btn-anterior').disabled = i <= 0;
    $('#btn-siguiente').disabled = i >= 0 && i >= E.lineal.length - 1;
    $('#pie-info').textContent = i >= 0 ? (i + 1) + ' de ' + E.lineal.length + ' apartados' : '';
  }

  // ---------------------------------------------------------------- repintado
  function pintarTodo(sinRuta) {
    construir();
    pintarSelectorDocumento();
    pintarArbol();
    pintarCabecera();
    pintarContenido();
    pintarPanel();
    pintarPie();
    $$('#selector-vista button').forEach((b) => {
      const on = b.dataset.vista === E.vista;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    $$('#selector-curso button').forEach((b) => {
      const on = b.dataset.curso === E.curso;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    $('#selector-persona').value = E.usuarioId;
    const u = usuario();
    $('#rol-actual').textContent = P.ROLES[u.rol];
    // Quién reparte las unidades está SIN DECIDIR: de momento solo soporte, como
    // en el v1. Darlo a la jefatura de departamento sería lo natural (es quien
    // reparte la carga), pero es una decisión del departamento, no del mockup.
    $('#btn-asignaciones').hidden = u.rol !== 'admin';
    if (!sinRuta) escribirRuta(true);
  }

  // ---------------------------------------------------------------- navegación
  function ir(clave, empujar) {
    const e = E.indice.get(clave);
    if (!e) return;
    E.seccion = e.nodo.seccion;
    E.unidadId = e.nodo.unidadId;
    abrirHasta(clave);
    if (empujar !== false) escribirRuta(false);
    pintarTodo(true);
    enfocar(clave);
    E.cajon = false;
    $('.workspace').classList.remove('cajon-abierto');
  }

  function mover(paso) {
    const i = E.lineal.findIndex((x) => x.nodo.clave === claveActiva());
    // en la portada del documento no hay posición en el recorrido: avanzar es
    // entrar por el primer apartado
    if (i === -1) {
      if (paso > 0 && E.lineal.length) ir(E.lineal[0].nodo.clave);
      return;
    }
    const siguiente = E.lineal[i + paso];
    if (siguiente) ir(siguiente.nodo.clave);
  }

  // Nodos visibles del árbol, en orden, para las flechas del teclado
  const visibles = () => $$('#raiz-arbol [role="treeitem"]').filter((li) => {
    let p = li.parentElement;
    while (p && p.id !== 'raiz-arbol') {
      if (p.classList.contains('cerrado')) return false;
      p = p.parentElement;
    }
    return true;
  });

  function alternar(clave, abrir) {
    const e = E.indice.get(clave);
    if (!e || !e.nodo.hijos.length) return false;
    const estaba = E.abiertos.has(clave);
    const quiere = abrir === undefined ? !estaba : abrir;
    if (quiere) E.abiertos.add(clave); else E.abiertos.delete(clave);
    if (quiere !== estaba) { pintarArbol(); return true; }
    return false;
  }

  // ---------------------------------------------------------------- avisos flotantes
  let tempToast;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('ver');
    clearTimeout(tempToast);
    tempToast = setTimeout(() => el.classList.remove('ver'), 3600);
  }

  function marcarGuardado() {
    const el = $('#guardado');
    el.hidden = false;
    el.textContent = 'Guardado ' + hace(Date.now() - 1000);
    clearTimeout(marcarGuardado.t);
    marcarGuardado.t = setTimeout(() => { el.hidden = true; }, 2600);
  }

  // ---------------------------------------------------------------- modal de asignaciones
  // Asignar unidades: una matriz de unidades x personas, no una lista de
  // casillas por persona. Con 31 unidades y cinco personas, la lista era un
  // muro de casillas donde no se veía lo único que de verdad hay que mirar:
  // qué unidad no tiene a nadie, porque esa no la puede editar nadie.
  function pintarAsignaciones() {
    const grupos = [
      { etq: 'FP · SMR', unidades: U.UNIDADES.filter((u) => u.ciclo === 'smr') },
      { etq: 'FP · DAW', unidades: U.UNIDADES.filter((u) => u.ciclo === 'daw') },
      { etq: 'ESO', unidades: U.UNIDADES.filter((u) => u.ambito === 'eso') },
      { etq: 'Bachillerato', unidades: U.UNIDADES.filter((u) => u.ambito === 'bach') },
    ];
    // La jefatura de departamento también da clase, así que también es columna:
    // la asignación no decide quién puede editar (eso ya lo resuelve el rol),
    // decide de quién es cada unidad y a quién avisa la vista Validaciones.
    const gente = C.USUARIOS.filter((u) => u.departamento === DEPARTAMENTO.departamento
      && (u.rol === 'docente' || u.rol === 'jefe_departamento'));

    const texto = ($('#filtro-asig') ? $('#filtro-asig').value : '').trim().toLowerCase();
    const soloSin = !!($('#solo-sin-asignar') && $('#solo-sin-asignar').checked);
    const nadie = (u) => !gente.some((d) => d.unidades.includes(u.id));
    const cuela = (u) => {
      if (soloSin && !nadie(u)) return false;
      if (!texto) return true;
      return (U.tituloDe(u, E.curso) + ' ' + (u.codigo || '')).toLowerCase().indexOf(texto) >= 0;
    };

    const celda = (d, u) => '<td class="asig-celda">'
      + '<label class="asig-casilla"><input type="checkbox" data-persona="' + esc(d.id) + '"'
      + ' value="' + esc(u.id) + '"' + (d.unidades.includes(u.id) ? ' checked' : '')
      + ' aria-label="' + esc(U.tituloDe(u, E.curso) + ' · ' + d.nombre) + '">'
      + '<span aria-hidden="true"></span></label></td>';

    const fila = (u) => '<tr' + (nadie(u) ? ' class="asig-sin-nadie"' : '') + '>'
      + '<th scope="row"><span class="asig-titulo">' + esc(U.tituloDe(u, E.curso)) + '</span>'
      + (u.codigo ? '<span class="chip chip-cod">' + esc(u.codigo) + '</span>' : '')
      + (nadie(u) ? '<span class="chip chip-error">nadie</span>' : '')
      + '</th>' + gente.map((d) => celda(d, u)).join('') + '</tr>';

    const cuerpo = grupos.map((g) => {
      const filas = g.unidades.filter(cuela);
      if (!filas.length) return '';
      return '<tr class="asig-seccion"><th colspan="' + (gente.length + 1) + '" scope="colgroup">'
        + esc(g.etq) + ' <span class="suave">· ' + filas.length
        + (filas.length === 1 ? ' unidad' : ' unidades') + '</span></th></tr>'
        + filas.map(fila).join('');
    }).join('');

    const cabecera = '<tr><th class="asig-esquina" scope="col">Unidad</th>'
      + gente.map((d) => '<th scope="col" class="asig-persona">'
        + '<span>' + esc(d.nombre) + '</span>'
        + '<span class="asig-cuenta" title="unidades que lleva">' + d.unidades.length + '</span></th>').join('') + '</tr>';

    $('#cuerpo-asignaciones').innerHTML = (cuerpo
      ? '<table class="asig-tabla"><thead>' + cabecera + '</thead><tbody>' + cuerpo + '</tbody></table>'
      : '<p class="vacio-apartado">Ninguna unidad coincide con el filtro.</p>')
      + '<p class="suave">El número bajo cada nombre es cuántas unidades lleva. Una unidad sin nadie '
      + 'solo la puede editar la jefatura de departamento: es el aviso nº 2 de '
      + '<code>docs/interfaz-web.md</code>, y con el importador tal como está hoy le pasa a las 11.</p>';

    const sinNadie = U.UNIDADES.filter(nadie).length;
    const resumen = $('#resumen-asig');
    if (resumen) {
      resumen.textContent = U.UNIDADES.length + ' unidades · ' + gente.length + ' personas · '
        + (sinNadie ? sinNadie + ' sin nadie' : 'todas asignadas');
      resumen.classList.toggle('mal', sinNadie > 0);
    }
  }

  const abrirModal = (id) => { $(id).hidden = false; $(id).querySelector('button, input, [tabindex]').focus(); };
  const cerrarModal = (id) => { $(id).hidden = true; };

  // ---------------------------------------------------------------- arranque
  function pintarSelectorPersona() {
    $('#selector-persona').innerHTML = C.USUARIOS.map((u) =>
      '<option value="' + esc(u.id) + '">' + esc(u.nombre) + ' · ' + esc(P.ROLES[u.rol]) + '</option>').join('');
  }

  function arrancar() {
    C.cargar();
    Pl.cargar();
    pintarSelectorPersona();
    try {
      const t = global.localStorage.getItem('tema');
      if (t) global.document.documentElement.dataset.tema = t;
    } catch (e) { /* sin localStorage */ }

    if (!leerRuta()) { E.docId = 'pd-fp-daw'; E.seccion = null; }
    pintarTodo();
    conectarEventos();
  }

  function conectarEventos() {
    // ---- árbol: clic
    $('#arbol').addEventListener('click', (ev) => {
      const li = ev.target.closest('[role="treeitem"]');
      if (!li) return;
      const clave = li.dataset.clave;
      if (ev.target.closest('.twisty')) { alternar(clave); return; }
      ir(clave);
    });

    // ---- árbol: teclado
    $('#arbol').addEventListener('keydown', (ev) => {
      const li = ev.target.closest('[role="treeitem"]');
      if (!li) return;
      const clave = li.dataset.clave;
      const lista = visibles();
      const i = lista.indexOf(li);
      const foco = (n) => { if (lista[n]) lista[n].focus(); };

      switch (ev.key) {
        case 'ArrowDown': ev.preventDefault(); foco(i + 1); break;
        case 'ArrowUp': ev.preventDefault(); foco(i - 1); break;
        case 'Home': ev.preventDefault(); foco(0); break;
        case 'End': ev.preventDefault(); foco(lista.length - 1); break;
        case 'ArrowRight': {
          ev.preventDefault();
          const e = E.indice.get(clave);
          if (!e || !e.nodo.hijos.length) break;
          if (!E.abiertos.has(clave)) { alternar(clave, true); enfocar(clave); }
          else { const h = e.nodo.hijos[0]; if (h) enfocar(h.clave); }
          break;
        }
        case 'ArrowLeft': {
          ev.preventDefault();
          const e = E.indice.get(clave);
          if (e && e.nodo.hijos.length && E.abiertos.has(clave)) { alternar(clave, false); enfocar(clave); break; }
          const padre = e && e.camino[e.camino.length - 2];
          if (padre && padre.clave) enfocar(padre.clave);
          break;
        }
        case 'Enter':
        case ' ': ev.preventDefault(); ir(clave); break;
        default: break;
      }
    });

    // ---- buscador
    $('#buscar').addEventListener('input', debounce((ev) => {
      E.busqueda = ev.target.value;
      $('#limpiar').hidden = !E.busqueda;
      pintarArbol();
    }, 160));
    $('#limpiar').addEventListener('click', () => {
      E.busqueda = '';
      $('#buscar').value = '';
      $('#limpiar').hidden = true;
      pintarArbol();
      $('#buscar').focus();
    });

    // ---- selectores
    $('#selector-doc').addEventListener('change', (ev) => {
      E.docId = ev.target.value;
      E.seccion = null; E.unidadId = null;
      escribirRuta(false);
      pintarTodo(true);
    });
    $('#selector-curso').addEventListener('click', (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      E.curso = b.dataset.curso;
      escribirRuta(false);
      pintarTodo(true);
    });
    $('#selector-vista').addEventListener('click', (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      E.vista = b.dataset.vista;
      escribirRuta(false);
      pintarTodo(true);
    });
    $('#selector-persona').addEventListener('change', (ev) => {
      E.usuarioId = ev.target.value;
      escribirRuta(false);
      pintarTodo(true);
    });

    // ---- tema
    $('#btn-tema').addEventListener('click', () => {
      const raiz = global.document.documentElement;
      const oscuro = raiz.dataset.tema === 'oscuro';
      raiz.dataset.tema = oscuro ? 'claro' : 'oscuro';
      try { global.localStorage.setItem('tema', raiz.dataset.tema); } catch (e) { /* nada */ }
    });

    // ---- cajón en pantallas estrechas
    $('#btn-cajon').addEventListener('click', () => {
      E.cajon = !E.cajon;
      $('.workspace').classList.toggle('cajon-abierto', E.cajon);
      if (E.cajon) $('#buscar').focus();
    });
    $('#velo').addEventListener('click', () => {
      E.cajon = false;
      $('.workspace').classList.remove('cajon-abierto');
    });

    // ---- exportar
    $('#btn-pdf').addEventListener('click', () => toast(
      'La app real llamaría a GET /api/documentos/' + E.docId + '/pdf: resuelve los textos compartidos y genera el PDF con render-generico.js.'));
    $('#btn-word').addEventListener('click', () => toast(
      'Exportar a Word todavía no existe en la PoC: el README lo promete y hay que decidir si se genera con una plantilla .docx.'));

    // ---- marcar revisado desde la cabecera
    $('#btn-revisado').addEventListener('click', () => {
      const n = nodoActivo();
      if (!n) return;
      C.marcarRevisado(E.docId, n);
      toast('Apartado dado por bueno para ' + E.curso + '.');
      pintarTodo(true);
    });

    // ---- contenido: botones y edición
    $('#contenido').addEventListener('click', (ev) => {
      const irA = ev.target.closest('[data-ir]');
      if (irA) { ir(irA.dataset.ir); return; }

      const aviso = ev.target.closest('[data-aviso]');
      if (aviso) {
        const a = (E.avisosVisibles || [])[Number(aviso.dataset.aviso)];
        if (!a) return;
        const clave = a.destino.unidadId ? a.destino.unidadId + '::' + a.destino.seccion : a.destino.seccion;
        E.vista = 'contenido';
        ir(clave);
        return;
      }

      const estr = ev.target.closest('[data-estructura]');
      if (estr) { accionEstructura(estr); return; }

      const op = ev.target.closest('[data-op]');
      if (!op) return;
      const nodo = nodoActivo();
      if (!nodo) return;

      if (op.dataset.op === 'revisado') {
        C.marcarRevisado(E.docId, nodo);
        toast('Apartado dado por bueno.');
        pintarTodo(true);
        return;
      }
      if (op.dataset.op === 'marca') { aplicarMarca(op.dataset.marca); return; }
      if (op.dataset.op === 'editar-global') {
        toast('En la app real esto llama a editarCompartido(): cambia el texto en todas las unidades vinculadas y sube su versión.');
        return;
      }

      if (!P.puedeEditar(usuario(), nodo, DEPARTAMENTO)) return;
      const a = C.apartado(E.docId, nodo);
      const args = {
        bloque: op.dataset.bloque != null ? Number(op.dataset.bloque) : null,
        item: op.dataset.item != null ? Number(op.dataset.item) : null,
      };
      const nuevos = B.aplicar(a.bloques, op.dataset.op, args);
      C.guardarBloques(E.docId, nodo, nuevos);
      marcarGuardado();
      pintarTodo(true);
      if (op.dataset.op === 'anadir-parrafo' || op.dataset.op === 'anadir-lista') {
        const campos = $$('#contenido textarea[data-bloque]');
        const ultimo = campos[campos.length - 1];
        if (ultimo) { ultimo.focus(); recordarFoco(ultimo); }
      }
    });

    // ---- autoguardado del texto (sobre el modelo, nunca sobre el DOM)
    $('#contenido').addEventListener('input', (ev) => {
      const campo = ev.target.closest('textarea[data-bloque]');
      if (campo) {
        autoalto(campo);
        escribirEnModelo(campo);
        recordarFoco(campo);
        refrescarPrevia(campo);
        refrescarTrasEscribir();
        return;
      }
      if (ev.target.matches('.tabla-pond input')) recalcularPonderaciones();
    });

    // ---- dónde está el cursor, para la barra de herramientas
    ['focusin', 'keyup', 'mouseup'].forEach((tipo) => {
      $('#contenido').addEventListener(tipo, (ev) => {
        const campo = ev.target.closest && ev.target.closest('textarea[data-bloque]');
        if (campo) recordarFoco(campo);
      });
    });

    // Al pulsar N o C el campo no debe perder el foco: si lo pierde se va la
    // selección y el botón parece estropeado, que es justo lo que pasaba antes.
    $('#contenido').addEventListener('mousedown', (ev) => {
      if (ev.target.closest && ev.target.closest('[data-op="marca"]')) ev.preventDefault();
    });

    $('#contenido').addEventListener('keydown', (ev) => {
      const campo = ev.target.closest && ev.target.closest('textarea[data-bloque]');
      if (!campo) return;
      const tipo = atajoDeFormato(ev);
      if (!tipo) return;
      ev.preventDefault();
      recordarFoco(campo);
      aplicarMarca(tipo);
    });

    // ---- estructura: renombrar y añadir van por formulario
    $('#contenido').addEventListener('submit', (ev) => {
      const f = ev.target;
      if (f.id !== 'form-renombrar' && f.id !== 'form-anadir') return;
      ev.preventDefault();
      if (!puedeEstructura()) return;
      const nodo = nodoActivo();
      if (!nodo || !nodo.seccion) return;

      if (f.id === 'form-renombrar') {
        const valor = $('#titulo-nuevo').value;
        if (!Pl.renombrar(E.docId, nodo.seccion, valor)) return;
        toast('Apartado renombrado. El identificador sigue siendo ' + nodo.seccion + '.');
      } else {
        const valor = $('#titulo-hijo').value;
        const ocupados = nodo.hijos.filter((h) => h.tipo !== 'unidad').map((h) => Es.idLocal(h.seccion));
        const id = Pl.anadir(E.docId, nodo.seccion, valor, ocupados, Es.slug);
        if (!id) return;
        toast('Apartado añadido con el identificador ' + nodo.seccion + '/' + id + '.');
      }
      pintarTodo(true);
    });

    // ---- comentarios
    $('#panel').addEventListener('submit', (ev) => {
      if (ev.target.id !== 'form-comentario') return;
      ev.preventDefault();
      const campo = $('#texto-comentario');
      const texto = campo.value.trim();
      const nodo = nodoActivo();
      if (!texto || !nodo) return;
      C.comentar(E.docId, nodo, usuario().nombre, texto);
      pintarPanel();
      toast('Comentario añadido.');
    });

    // ---- asignaciones
    $('#btn-asignaciones').addEventListener('click', () => { pintarAsignaciones(); abrirModal('#modal-asignaciones'); });
    $('#cerrar-asignaciones').addEventListener('click', () => cerrarModal('#modal-asignaciones'));
    $('#listo-asignaciones').addEventListener('click', () => { cerrarModal('#modal-asignaciones'); pintarTodo(true); });
    $('#filtro-asig').addEventListener('input', debounce(() => pintarAsignaciones(), 150));
    $('#solo-sin-asignar').addEventListener('change', () => pintarAsignaciones());
    $('#cuerpo-asignaciones').addEventListener('change', (ev) => {
      const caja = ev.target.closest('input[data-persona]');
      if (!caja) return;
      const persona = caja.dataset.persona;
      // Se parte de lo que la persona tiene en el modelo y se añade o se quita
      // la unidad tocada. Leer las casillas marcadas de la tabla borraría las
      // unidades que el filtro haya dejado fuera.
      const quien = C.usuario(persona);
      const otras = (quien ? quien.unidades : []).filter((id) => id !== caja.value);
      C.asignarUnidades(persona, caja.checked ? otras.concat(caja.value) : otras);

      // La matriz lleva el recuento por persona y marca las unidades que no
      // tiene nadie, así que hay que repintarla; y devolver el foco a la casilla,
      // o se pierde el sitio a cada clic.
      pintarAsignaciones();
      const vuelta = $('#cuerpo-asignaciones input[data-persona="' + persona + '"][value="' + caja.value + '"]');
      if (vuelta) vuelta.focus();
      else if ($('#filtro-asig')) $('#filtro-asig').focus();

      calcularEstados();
      pintarArbol();
    });

    // ---- pie
    $('#btn-anterior').addEventListener('click', () => mover(-1));
    $('#btn-siguiente').addEventListener('click', () => mover(1));

    // ---- atrás/adelante del navegador. pushState dispara popstate, y un hash
    // escrito a mano o un enlace pegado dispara hashchange: hacen falta los dos.
    const volver = () => { if (leerRuta()) pintarTodo(true); };
    global.addEventListener('popstate', volver);
    global.addEventListener('hashchange', volver);

    // ---- Escape cierra lo que esté abierto
    global.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Escape') return;
      if (!$('#modal-asignaciones').hidden) { cerrarModal('#modal-asignaciones'); return; }
      if (E.cajon) { E.cajon = false; $('.workspace').classList.remove('cajon-abierto'); }
    });
  }

  function accionEstructura(boton) {
    if (!puedeEstructura()) return;
    const accion = boton.dataset.estructura;

    if (accion === 'restaurar') {
      Pl.restaurar(E.docId, boton.dataset.seccion);
      toast('Apartado restaurado con su contenido.');
      pintarTodo(true);
      return;
    }

    const e = entradaActiva();
    if (!e || !e.nodo.seccion) return;
    const nodo = e.nodo;

    if (accion === 'titulo-original') {
      Pl.restaurarTitulo(E.docId, nodo.seccion);
      toast('Título importado restaurado.');
    } else if (accion === 'retirar') {
      Pl.retirar(E.docId, nodo.seccion);
      toast('Apartado retirado. Su contenido se conserva y se puede restaurar desde la portada.');
    } else if (accion === 'subir' || accion === 'bajar') {
      const { base, ids } = hermanosDe(e.camino, nodo);
      if (!Pl.mover(E.docId, base, Es.idLocal(nodo.seccion), accion === 'subir' ? -1 : 1, ids)) return;
    }
    pintarTodo(true);
  }

  function enfocar(clave) {
    const li = $('#arbol [data-clave="' + clave.replace(/"/g, '\\"') + '"]');
    if (li) li.focus();
  }

  // El modelo se actualiza en cada pulsación: si se aplazara, bastaría saltar a
  // otro párrafo antes de que venciera el temporizador para perder lo escrito,
  // porque `debounce` comparte un único temporizador para todos los campos.
  // Lo que se aplaza es solo repintar el árbol y la cabecera.
  const refrescarTrasEscribir = debounce(() => {
    marcarGuardado();
    calcularEstados();
    pintarArbol();
    pintarCabecera();
  }, 700);

  function escribirEnModelo(campo) {
    const nodo = nodoActivo();
    if (!nodo || !P.puedeEditar(usuario(), nodo, DEPARTAMENTO)) return;
    const a = C.apartado(E.docId, nodo);
    const bloque = Number(campo.dataset.bloque);
    const item = campo.dataset.item != null ? Number(campo.dataset.item) : null;
    const op = item != null ? 'texto-item' : 'texto';
    C.guardarBloques(E.docId, nodo, B.aplicar(a.bloques, op, { bloque, item, valor: campo.value }));
  }

  // El párrafo ya formateado, debajo del campo, para no tener que imaginarse qué
  // hacen las marcas. Se actualiza sin repintar el apartado, que perdería el cursor.
  function refrescarPrevia(campo) {
    if (campo.dataset.item != null) return;          // las listas no llevan vista previa
    const previa = $('#contenido [data-previa="' + campo.dataset.bloque + '"]');
    if (!previa) return;
    const tramos = B.aTramos(campo.value);
    previa.hidden = !Array.isArray(tramos);
    previa.innerHTML = '<span class="previa-etq">así saldrá</span>' + B.aHtml(tramos);
  }

  // ---- a qué campo le pega la barra de herramientas
  // Se guarda el par (bloque, elemento) y la selección, no el nodo del DOM:
  // cualquier repintado lo tira. La selección se guarda aparte porque hay
  // navegadores que la pierden al quitar el foco del campo.
  const mismoCampo = (campo, foco) => !!foco && campo.dataset.bloque === foco.bloque
    && (campo.dataset.item == null ? null : String(campo.dataset.item)) === foco.item;

  function etiquetaFoco() {
    if (!E.foco) return 'pon el cursor en un párrafo';
    if (E.foco.item != null) return 'elemento ' + (Number(E.foco.item) + 1) + ' de la lista';
    return 'párrafo ' + (Number(E.foco.bloque) + 1);
  }

  function recordarFoco(campo) {
    E.foco = {
      bloque: campo.dataset.bloque,
      item: campo.dataset.item == null ? null : String(campo.dataset.item),
      desde: campo.selectionStart,
      hasta: campo.selectionEnd,
    };
    const donde = $('#tb-donde');
    if (donde) donde.textContent = etiquetaFoco();
  }

  function campoDelFoco() {
    const campos = $$('#contenido textarea[data-bloque]');
    if (!campos.length) return null;
    return campos.filter((c) => mismoCampo(c, E.foco))[0] || campos[0];
  }

  // Negrita y cursiva: `Bloques.marcar` decide, que es donde se puede probar.
  // Aquí solo se lee la selección, se devuelve el texto y se vuelve a dejar la
  // selección donde estaba, para poder pulsar N y C seguidos.
  function aplicarMarca(tipo) {
    const nodo = nodoActivo();
    if (!nodo || !P.puedeEditar(usuario(), nodo, DEPARTAMENTO)) return;
    const campo = campoDelFoco();
    if (!campo) { toast('Añade primero un párrafo con «+ párrafo».'); return; }

    const cache = mismoCampo(campo, E.foco) ? E.foco : null;
    let desde = typeof campo.selectionStart === 'number' ? campo.selectionStart : 0;
    let hasta = typeof campo.selectionEnd === 'number' ? campo.selectionEnd : desde;
    if (cache && desde === hasta && cache.desde !== cache.hasta) {
      desde = cache.desde;
      hasta = cache.hasta;
    }

    const r = B.marcar(campo.value, desde, hasta, tipo);
    // setRangeText en lugar de `value =` para no romper el Ctrl+Z del navegador.
    if (typeof campo.setRangeText === 'function') campo.setRangeText(r.valor, 0, campo.value.length, 'end');
    else campo.value = r.valor;
    if (typeof campo.focus === 'function') campo.focus();
    if (typeof campo.setSelectionRange === 'function') campo.setSelectionRange(r.desde, r.hasta);

    autoalto(campo);
    escribirEnModelo(campo);
    recordarFoco(campo);
    refrescarPrevia(campo);
    marcarGuardado();
    calcularEstados();
    pintarArbol();
  }

  // Ctrl+B / Ctrl+I, y Alt+N / Alt+C para quien venga de Word en español.
  // Ctrl+N no se puede: el navegador se lo queda antes de que llegue aquí.
  function atajoDeFormato(ev) {
    const k = String(ev.key || '').toLowerCase();
    const ctrl = ev.ctrlKey || ev.metaKey;
    const alt = ev.altKey && !ev.ctrlKey;
    if ((ctrl && k === 'b') || (alt && k === 'n')) return 'bold';
    if ((ctrl && k === 'i') || (alt && k === 'c')) return 'italics';
    return null;
  }

  function autoalto(campo) {
    campo.style.height = 'auto';
    campo.style.height = Math.max(campo.scrollHeight, 32) + 'px';
  }

  // Suma en vivo de las ponderaciones, sin tocar el modelo guardado
  function recalcularPonderaciones() {
    const tabla = $('.tabla-pond');
    if (!tabla) return;
    const filas = $$('tbody tr', tabla);
    let total = 0, pesoRA = 0, sumaCE = 0, filaSuma = null;

    const cerrarRA = () => {
      if (!filaSuma) return;
      const celda = filaSuma.querySelector('b');
      celda.textContent = sumaCE + ' %';
      filaSuma.classList.toggle('mal', sumaCE !== pesoRA);
    };

    filas.forEach((f) => {
      if (f.classList.contains('fila-ra')) {
        cerrarRA();
        pesoRA = Number(f.querySelector('input').value) || 0;
        total += pesoRA;
        sumaCE = 0; filaSuma = null;
      } else if (f.classList.contains('fila-ce')) {
        sumaCE += Number(f.querySelector('input').value) || 0;
      } else if (f.classList.contains('fila-suma')) {
        filaSuma = f;
      }
    });
    cerrarRA();

    const marca = $('.total', tabla.closest('.tarjeta'));
    if (marca) {
      marca.textContent = 'total ' + total + ' %';
      marca.classList.toggle('bien', total === 100);
      marca.classList.toggle('mal', total !== 100);
    }
  }

  if (global.document.readyState === 'loading') {
    global.document.addEventListener('DOMContentLoaded', arrancar);
  } else {
    arrancar();
  }

  global.UI = { E, ir, pintarTodo, toast };
})(typeof globalThis !== 'undefined' ? globalThis : this);
