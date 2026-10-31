/* Mockup interactivo: árbol de navegación + contenido de muestra + permisos simulados.
   No depende de nada externo: se abre con doble clic en dashboard.html. */
const D = window.DATOS;

// Permisos de edición por perfil: los valores por defecto vienen de data.js y
// el admin puede cambiarlos desde el panel "Permisos" (persisten en localStorage).
// Ojo: los dos archivos comparten ámbito global → se usa D.PERFILES (sin redeclarar).
const PERFILES_DEFECTO = JSON.parse(JSON.stringify(D.PERFILES));

const E = {
  curso: '2026-27', doc: 'pd', nivel: 'fp', ciclo: 'daw', rol: 'jefe_departamento',
  vista: 'navegacion', activo: null, q: '',
  abiertos: new Set(), indice: new Map(), lineal: [],
};

const ASIGNADOS_COMUNES = []; // apartados comunes que un docente tendría asignados

/* ------------------------------------------------------------------ utilidades */
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
const pick = (arr, s) => arr[hash(s) % arr.length];

const ICONOS = {
  libro: '<svg viewBox="0 0 24 24" class="ico-n"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M6 19h13v3H6a2 2 0 0 1 0-3Z" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>',
  escudo: '<svg viewBox="0 0 24 24" class="ico-n"><path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
  ciclo: '<svg viewBox="0 0 24 24" class="ico-n"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 8v4l3 2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  modulo: '<svg viewBox="0 0 24 24" class="ico-n"><rect x="3.5" y="3.5" width="7" height="7" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.7"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.7"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.7"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>',
  hoja: '<svg viewBox="0 0 24 24" class="ico-n"><path d="M6 3h8l4 4v14H6V3Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M14 3v4h4" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>',
};

const PARRAFOS = [
  'Este apartado recoge el desarrollo de lo indicado en la programación didáctica del ciclo, de acuerdo con lo establecido en el Real Decreto 686/2010 y en la Orden 8/2025, de la Conselleria de Educación, que regula la evaluación del alumnado.',
  'La planificación se ha elaborado de forma conjunta por el profesorado del departamento, teniendo en cuenta las características del grupo, los recursos disponibles y la evolución del alumnado durante el curso anterior.',
  'Se plantea una metodología activa y participativa, basada en la resolución de problemas y en el trabajo cooperativo, para favorecer la adquisición de las competencias profesionales del título.',
  'La evaluación será continua y global, atendiendo tanto a los procedimientos como a los resultados de aprendizaje, conforme a los criterios de evaluación y a las ponderaciones recogidas en el apartado correspondiente.',
  'Para el alumnado con mayor dificultad se prevén medidas de refuerzo y ampliación, que se detallan en el apartado de atención a la diversidad y educación inclusiva.',
  'Entre los recursos empleados figuran el aulo de informática del centro, la plataforma virtual de aprendizaje y los materiales didácticos elaborados por el profesorado del departamento.',
  'Se prestará especial atención a la trazabilidad del alumnado, registrando la intervención realizada y su incidencia en la mejora de los resultados de aprendizaje.',
];

const LISTAS = [
  ['Trabajo individual y en equipo', 'Prácticas en el aula de informática', 'Exposiciones orales y debate', 'Seguimiento a través de la plataforma virtual'],
  ['Diagnóstico inicial del grupo', 'Secuenciación de las situaciones de aprendizaje', 'Evaluación formativa y sumativa', 'Recuperación de resultados de aprendizaje'],
  ['Materiales docentes', 'Repositorio de prácticas', 'Simuladores y entornos virtuales', 'Recursos de accesibilidad'],
];

const TEXTO_COMPARTIDO = 'Se estará muy pendiente del alumnado con más dificultad, preguntándole de forma personal e intentando ayudarle en todo lo posible, sin que afecte al resto de la clase. El profesorado coordinará las medidas de refuerzo con el tutor del grupo.';

const COMPARTIDOS = new Set([
  'Propuestas de mejora del curso anterior', 'Recursos específicos', 'Programa plurilingüe',
  'Estrategias metodológicas', 'Instrumentos de evaluación', 'Criterios de calificación',
  'Recuperación de los resultados de aprendizaje', 'Alumnado con el módulo pendiente de cursos anteriores',
  'Relación con otros módulos', 'Actividades complementarias y extraescolares realizadas',
  'Dificultades encontradas', 'Valoración de la metodología empleada',
]);

const RA = [
  { num: 1, texto: 'Diseñar y maquetar interfaces web accesibles y responsivas.', ce: [
    { l: 'a', t: 'Analiza los requisitos de accesibilidad de una interfaz dada.', p: 10 },
    { l: 'b', t: 'Construye la maquetación con HTML5 y CSS3 siguiendo la guía de estilo.', p: 15 },
  ], p: 25 },
  { num: 2, texto: 'Desarrollar componentes de interfaz reutilizables en el cliente.', ce: [
    { l: 'a', t: 'Implementa componentes con JavaScript moderno.', p: 12 },
    { l: 'b', t: 'Integra componentes en una aplicación existente.', p: 18 },
  ], p: 30 },
  { num: 3, texto: 'Integrar servicios y datos en aplicaciones web.', ce: [
    { l: 'a', t: 'Consume una API REST y gestiona su estado.', p: 15 },
    { l: 'b', t: 'Valida y depura los datos intercambiados.', p: 10 },
  ], p: 25 },
  { num: 4, texto: 'Verificar y documentar las aplicaciones desarrolladas.', ce: [
    { l: 'a', t: 'Elabora pruebas automatizadas sobre los módulos desarrollados.', p: 12 },
    { l: 'b', t: 'Redacta la documentación técnica y de usuario.', p: 8 },
  ], p: 20 },
];

const FICHAS = [
  { num: 1, titulo: 'Maquetación de la portada del sitio', ses: 6, ev: 'Ordinaria', ra: [1, 2] },
  { num: 2, titulo: 'Componente de formulario accesible', ses: 8, ev: 'Ordinaria', ra: [1, 2, 3] },
  { num: 3, titulo: 'Integración con la API del centro', ses: 7, ev: 'Recuperación', ra: [3, 4] },
  { num: 4, titulo: 'Documentación y pruebas de la entrega', ses: 5, ev: 'Recuperación', ra: [4] },
];

/* ------------------------------------------------------------------ permisos y estado */
function estadoDe(n) {
  if (!n) return 'vacio';
  if (n.tipo === 'doc' || n.tipo === 'ciclo' || n.tipo === 'nivel') return 'ok';
  if (!n.hijos.length) {
    const h = hash(n.id + n.titulo) % 10;
    return h <= 5 ? 'ok' : h <= 8 ? 'warn' : 'vacio';
  }
  const hs = n.hijos.map(estadoDe);
  if (hs.includes('warn')) return 'warn';
  if (hs.every((x) => x === 'vacio')) return 'vacio';
  if (hs.includes('vacio')) return 'warn';
  return 'ok';
}

function puedeEditar(n) {
  if (!n) return false;
  if (E.rol === 'admin') return true;
  if (E.rol === 'jefe_estudios') return false;
  if (n.edita === 'modulo') {
    if (E.rol === 'jefe_departamento') return true;
    return (D.PERFILES[E.rol] || []).includes(n.moduloId);
  }
  if (E.rol === 'jefe_departamento') return true;
  return ASIGNADOS_COMUNES.includes(n.id);
}

function prefijar(lista, p) {
  lista.forEach((n) => { n.id = p + n.id; prefijar(n.hijos, p); });
  return lista;
}

/* ------------------------------------------------------------------ construcción del árbol */
function encontrar(raiz, id) {
  if (!raiz) return null;
  if (raiz.id === id) return raiz;
  for (const h of raiz.hijos) { const f = encontrar(h, id); if (f) return f; }
  return null;
}

function hojaCiclo(docId, c) {
  const r = D.arbolDocumento(docId, c.id, E.curso);
  return { id: 'ciclo:' + docId + ':' + c.id, titulo: c.nombre, largo: c.largo, tipo: 'ciclo', edita: 'comun', hijos: prefijar(r.hijos, c.id + ':') };
}

function construir() {
  E.indice = new Map(); E.lineal = [];
  const docs = D.ORDEN_DOCS.map((id) => {
    const doc = D.DOCUMENTOS[id];
    const nd = { id: 'doc:' + id, titulo: doc.nombre, corto: doc.corto, tipo: 'doc', icono: doc.icono, edita: 'comun', hijos: [] };
    if (doc.ramas) {
      // PD: nivel intermedio (FP / ESO-BACH) y después las hojas (SMR/DAW/ESO/Bachillerato)
      nd.hijos = (D.RAMAS[id] || []).map((nv) => ({
        id: 'nivel:' + id + ':' + nv.id, titulo: nv.nombre, tipo: 'nivel', edita: 'comun',
        hijos: nv.hojas.map((c) => hojaCiclo(id, c)),
      }));
    } else if (doc.ciclo) {
      nd.hijos = D.CICLOS.map((c) => hojaCiclo(id, c));
    } else {
      const r = D.arbolDocumento(id, null, E.curso);
      nd.hijos = r.hijos;
    }
    return nd;
  });

  const indexar = (n, camino) => {
    const p = [...camino, n];
    E.indice.set(n.id, { nodo: n, camino: p });
    n.hijos.forEach((h) => indexar(h, p));
  };
  docs.forEach((d) => indexar(d, []));

  // lista lineal (anterior/siguiente) dentro del documento y hoja activos
  const docActivo = E.indice.get('doc:' + E.doc);
  if (docActivo) {
    if (D.DOCUMENTOS[E.doc].ciclo) {
      const rama = encontrar(docActivo.nodo, 'ciclo:' + E.doc + ':' + E.ciclo);
      if (rama) E.lineal = [docActivo, ...linealDe(rama)];
    } else {
      E.lineal = linealDe(docActivo.nodo);
    }
  }

  if (!E.activo || !E.indice.has(E.activo)) E.activo = primeroDelDoc(E.doc);
  restaurarAbiertos();
  return docs;
}

function linealDe(rama) {
  const out = [];
  (function rec(n, camino) { out.push({ nodo: n, camino }); n.hijos.forEach((h) => rec(h, [...camino, h])); })(rama, [rama]);
  return out;
}

function primeroDelDoc(docId) {
  const doc = D.DOCUMENTOS[docId];
  if (doc.ciclo) return E.ciclo + ':' + docId + '/0';
  return docId + '/0';
}

function restaurarAbiertos() {
  const e = E.indice.get(E.activo);
  if (!e) return;
  E.abiertos.add('doc:' + E.doc);
  const nivN = e.camino.find((n) => n.tipo === 'nivel');
  const cicN = e.camino.find((n) => n.tipo === 'ciclo');
  if (nivN) { E.nivel = nivN.id.split(':')[2]; E.abiertos.add(nivN.id); }
  if (cicN) E.abiertos.add(cicN.id);
  e.camino.forEach((n) => E.abiertos.add(n.id));
}

/* ------------------------------------------------------------------ barra lateral */
const coincide = (n, q) => n.titulo.toLowerCase().includes(q) || (n.corto || '').toLowerCase().includes(q);
function ramaVisible(n, q) {
  if (!q) return true;
  if (coincide(n, q)) return true;
  return n.hijos.some((h) => ramaVisible(h, q));
}

function pintarArbol(docs) {
  const q = E.q.trim().toLowerCase();
  const nodoHtml = (n, nivel) => {
    if (!ramaVisible(n, q)) return '';
    const abierto = E.abiertos.has(n.id) || (!!q && n.hijos.some((h) => ramaVisible(h, q)));
    const activa = n.id === E.activo;
    const ed = puedeEditar(n);
    const est = ed ? estadoDe(n) : 'lock';
    const conHijos = n.hijos.length > 0;
    const icono = n.tipo === 'doc' ? ICONOS[n.icono || 'libro']
      : n.tipo === 'nivel' ? ICONOS.escudo
      : n.tipo === 'ciclo' ? ICONOS.ciclo
      : n.tipo === 'modulo' ? ICONOS.modulo
      : n.tipo === 'apartado' || n.tipo === 'modulos' ? ICONOS.hoja : ICONOS.hoja;
    const badgeCom = COMPARTIDOS.has(n.titulo) ? '<span class="badge-com" title="Texto compartido">com.</span>' : '';
    const hijos = conHijos
      ? `<div class="caja"><ul>${n.hijos.map((h) => nodoHtml(h, nivel + 1)).join('')}</ul></div>` : '';
    return `<li class="nodo ${abierto ? 'abierto' : ''}" data-id="${esc(n.id)}">
      <button class="fila ${activa ? 'activa' : ''} ${n.tipo === 'doc' ? 'doc' : ''} ${n.tipo === 'nivel' ? 'nivel' : ''} ${n.tipo === 'modulo' ? 'modulo' : ''} ${conHijos ? '' : 'sin-hijos'}"
              style="--nivel:${nivel}" data-id="${esc(n.id)}" data-tipo="${n.tipo}">
        <span class="twisty" data-twisty>▶</span>
        ${icono}
        ${n.num ? `<span class="num">${esc(n.num)}.</span>` : ''}
        <span class="etq" title="${esc(n.titulo)}">${esc(n.corto || n.titulo)}</span>
        ${badgeCom}
        <i class="punto ${est}"></i>
      </button>${hijos}</li>`;
  };
  $('#arbol').innerHTML = `<ul class="arbol">${docs.map((d) => nodoHtml(d, 0)).join('')}</ul>`;
}

/* ------------------------------------------------------------------ cabecera y migas */
function pintarCabecera() {
  const e = E.indice.get(E.activo);
  if (!e) return;
  const { nodo: n, camino } = e;
  const doc = D.DOCUMENTOS[E.doc];
  const nivN = camino.find((x) => x.tipo === 'nivel');
  const cicN = camino.find((x) => x.tipo === 'ciclo');
  const esMateria = n.tipo === 'modulo' && (E.ciclo === 'eso' || E.ciclo === 'bach');

  $('#migas').innerHTML = camino.map((x, i) => {
    const ultimo = i === camino.length - 1;
    const etiqueta = x.tipo === 'doc' ? D.DOCUMENTOS[x.id.replace('doc:', '')].corto
      : x.tipo === 'ciclo' ? x.titulo
      : (x.num ? x.num + '. ' : '') + x.titulo;
    return (i ? '<span class="sep">›</span>' : '')
      + (ultimo ? `<span class="actual">${esc(etiqueta)}</span>` : `<button data-id="${esc(x.id)}">${esc(etiqueta)}</button>`);
  }).join('');

  $('#titulo-seccion').textContent = (n.num ? n.num + '. ' : '') + n.titulo;

  const ed = puedeEditar(n);
  const est = estadoDe(n);
  const chips = [];
  chips.push(`<span class="chip">${esc(doc.corto)}${nivN ? ' · ' + esc(nivN.titulo) : ''}${cicN ? ' · ' + esc(cicN.titulo) : ''}</span>`);
  chips.push(`<span class="chip">Curso ${E.curso}</span>`);
  if (n.tipo === 'modulo') chips.push(`<span class="chip">${esMateria ? 'Materia' : 'Módulo'}</span>`);
  chips.push(ed
    ? `<span class="chip ok"><i class="punto ok"></i>${est === 'ok' ? 'Relleno' : est === 'warn' ? 'Con avisos' : 'Vacío'}</span>`
    : `<span class="chip lock"><i class="punto lock"></i>Solo lectura</span>`);
  chips.push(`<span class="chip rol">${rolLabel()}</span>`);
  $('#chips').innerHTML = chips.join('');

  const guardar = $('#autoguardado');
  guardar.hidden = !(E.vista === 'edicion' && ed);

  // botón Editar de la cabecera: oculto si el rol no puede editar este apartado
  const btnEditar = $('#btn-editar');
  btnEditar.hidden = !ed;
  btnEditar.classList.toggle('on', E.vista === 'edicion');
  btnEditar.textContent = E.vista === 'edicion' ? 'Vista de lectura' : 'Editar';
  btnEditar.title = ed ? (E.vista === 'edicion' ? 'Volver a la vista de lectura' : 'Editar este apartado') : mensajeSinPermiso();
}

const ROLES = {
  admin: 'Admin', jefe_estudios: 'Jefe de estudios', jefe_departamento: 'Jefe de departamento',
  docente: 'Docente DAW y RL', docente_mixto: 'Docente Mixto',
};
const rolLabel = () => ROLES[E.rol];
const rolLabelDe = (rol) => ROLES[rol];

const ROLES_DOCENTE = ['docente', 'docente_mixto'];

function mensajeSinPermiso() {
  if (ROLES_DOCENTE.includes(E.rol)) {
    const u = D.PERFILES[E.rol] || [];
    return `${rolLabel()} solo puede editar: ${u.length ? u.join(' · ') : 'ninguna unidad asignada'}.`;
  }
  if (E.rol === 'jefe_estudios') return 'El rol jefe de estudios solo visualiza los documentos.';
  return 'Este apartado no es editable con tu rol actual.';
}

/* ------------------------------------------------------------------ contenido */
function tarjeta(titulo, cuerpo, extra = '') {
  return `<div class="tarjeta">${titulo ? `<h2>${titulo}</h2>` : ''}${cuerpo}${extra}</div>`;
}
function bloqueP(texto, n, i) {
  const editable = E.vista === 'edicion' && puedeEditar(n);
  return `<p class="bloque" ${editable ? 'contenteditable="true"' : ''}>${esc(texto)}</p>`;
}
function bloqueLista(n, k) {
  const editable = E.vista === 'edicion' && puedeEditar(n);
  return `<ul class="bloque" ${editable ? 'contenteditable="true"' : ''}>${LISTAS[k % LISTAS.length].map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
}
function bloqueCompartido(n, k) {
  const ed = puedeEditar(n);
  const nMod = 3 + (hash(n.id) % 8);
  const editable = E.vista === 'edicion' && ed;
  return `<div class="badge-compartido"><svg viewBox="0 0 24 24" style="width:13px;height:13px"><path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
    Texto compartido · ${nMod} módulos</div>
    <div class="bloque" ${editable ? 'contenteditable="true"' : ''}>${esc(TEXTO_COMPARTIDO)}</div>
    <div class="acciones-compartido">
      <button class="btn-ghost" data-acc="editar-compartido">Editar global (cambia los ${nMod})</button>
      <button class="btn-ghost peligro" data-acc="desvincular" ${ed ? '' : 'disabled'}>Desvincular este módulo</button>
    </div>`;
}

function tablaRaCe() {
  return `<div class="tabla-wrap"><table>
    <tr><th style="width:42%">Resultados de aprendizaje</th><th>Criterios de evaluación</th></tr>
    ${RA.map((r) => `<tr>
      <td><strong>RA${r.num}.</strong> ${esc(r.texto)}</td>
      <td>${r.ce.map((c) => `<div style="margin-bottom:3px">${c.l}) ${esc(c.t)}</div>`).join('')}</td>
    </tr>`).join('')}
  </table></div>`;
}

function tablaPonderaciones(n) {
  const ed = E.vista === 'edicion' && puedeEditar(n);
  const desfasado = hash(n.id) % 3 === 0; // un módulo de muestra no cuadra al 100 %
  const ra = RA.map((r, i) => ({ ...r, p: (desfasado && i === 3) ? 15 : r.p }));
  return `<div class="pond" data-pond>
    <div class="tabla-wrap"><table>
      <tr><th style="width:56%">Resultado de aprendizaje</th><th class="centro" style="width:90px">Ponderación</th></tr>
      ${ra.map((r) => `
        <tr><td><strong>RA${r.num}.</strong> ${esc(r.texto)}</td>
            <td class="centro"><input type="number" step="0.5" min="0" max="100" value="${r.p}" data-ra="${r.num}" ${ed ? '' : 'disabled'}></td></tr>
        <tr><td class="etiqueta">Criterio de evaluación</td><th class="centro">Ponderación</th></tr>
        ${r.ce.map((c) => `<tr><td>${c.l}) ${esc(c.t)}</td>
            <td class="centro"><input type="number" step="0.5" min="0" max="100" value="${c.p}" data-ce="${r.num}" ${ed ? '' : 'disabled'}></td></tr>`).join('')}
        <tr class="total"><td>Suma de los criterios de RA${r.num}</td>
            <td class="centro"><span class="suma-chip" data-suma-ra="${r.num}">—</span></td></tr>
      `).join('')}
      <tr class="total"><td>Suma de las ponderaciones de los RA</td>
          <td class="centro"><span class="suma-chip" data-suma-total>—</span></td></tr>
    </table></div>
    <p style="font-size:12px;color:var(--suave);margin:6px 0 0">Edita las casillas y el total se recalcula al momento (como hará el editor real).</p>
  </div>`;
}

function tablaResumenSA() {
  const nums = [1, 2, 3, 4];
  return `<div class="tabla-wrap"><table>
    <tr><th>Ev.</th><th>Situaciones de aprendizaje</th><th class="centro">Sesiones</th>${nums.map((x) => `<th class="centro">RA${x}</th>`).join('')}</tr>
    ${FICHAS.map((f, i) => `<tr>
      ${i === 0 || FICHAS[i - 1].ev !== f.ev ? `<td rowspan="${FICHAS.filter((x) => x.ev === f.ev).length}"><strong>${f.ev}</strong></td>` : ''}
      <td>SA ${f.num}: ${esc(f.titulo)}</td><td class="centro">${f.ses}</td>
      ${nums.map((x) => `<td class="centro">${f.ra.includes(x) ? 'X' : ''}</td>`).join('')}
    </tr>`).join('')}
    <tr class="total"><td colspan="2">Total</td><td class="centro">${FICHAS.reduce((a, f) => a + f.ses, 0)}</td>${nums.map(() => '<td></td>').join('')}</tr>
  </table></div>`;
}

/* ---- SA reales (ESO y Bachillerato): clave = materia + bloque propio ---- */
function saDe(n) {
  if (!n || E.doc !== 'pd') return null;
  const e = E.indice.get(n.id);
  if (!e) return null;
  const camino = e.camino || [];
  let materia = null, bloque = null;
  for (const x of camino) {
    if (x.tipo === 'modulo') materia = x.titulo;
    if (x.propio) bloque = x.titulo;
  }
  if (!materia) return null;
  const clave = bloque ? materia + ' › ' + bloque : materia;
  const sa = (D.SA || {})[clave];
  return sa ? { clave, ...sa } : null;
}

const enEsoBach = () => E.doc === 'pd' && (E.nivel === 'eso' || E.nivel === 'bach');

function tablaSAreal(sa) {
  const filas = sa.filas.filter((f) => !f.total);
  const tot = sa.filas.find((f) => f.total);
  const hayPeso = filas.some((f) => f.peso || f.gp);
  const haySem = filas.some((f) => f.sem);
  const hayEv = filas.some((f) => f.ev);
  const cab = ['Situaciones de aprendizaje definidas', 'Criterios de evaluación'];
  if (hayPeso) cab.push('Peso en el curso');
  if (haySem) cab.push('Temporalización');
  if (hayEv) cab.push('Evaluación');
  let grupoPrev = null;
  const cuerpo = filas.map((f) => {
    let celdaGrupo = '';
    if (f.grupo && f.grupo !== grupoPrev) { grupoPrev = f.grupo; celdaGrupo = `<tr class="fila-grupo"><td colspan="${cab.length}">${esc(f.grupo)}</td></tr>`; }
    const peso = [f.peso, f.gp && `(<strong>${esc(f.gp)}</strong> bloque)`].filter(Boolean).join(' ');
    return celdaGrupo + `<tr>
      <td>${f.n != null ? `<strong>${f.n}.</strong> ` : ''}${esc(f.titulo)}${f.desc ? `<br><span class="suave">${esc(f.desc)}</span>` : ''}</td>
      <td>${esc(f.ce || '—')}</td>
      ${hayPeso ? `<td class="centro">${peso || '—'}</td>` : ''}
      ${haySem ? `<td class="centro">${esc(f.sem || '—')}</td>` : ''}
      ${hayEv ? `<td class="centro">${esc(f.ev || '—')}</td>` : ''}
    </tr>`;
  }).join('');
  const filaTotal = tot ? `<tr class="total"><td colspan="${cab.length}">Total · ${esc(tot.total)}</td></tr>` : '';
  return `<div class="tabla-wrap"><table>
    <tr>${cab.map((c) => `<th>${c}</th>`).join('')}</tr>${cuerpo}${filaTotal}
  </table></div>`;
}

function tablaCaracteristicasSA() {
  return `<div class="tabla-wrap"><table>
    ${D.SA_CARACTERISTICAS.map(([k, v]) => `<tr><td class="etiqueta">${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}
  </table></div>`;
}

function fichaSAreal(f) {
  const meta = [
    f.grupo ? `<span>Bloque: ${esc(f.grupo)}</span>` : '',
    f.ce ? `<span>Criterios: ${esc(f.ce)}</span>` : '',
    f.peso ? `<span>Peso: ${esc(f.peso)}</span>` : '',
    f.gp ? `<span>Peso del bloque: ${esc(f.gp)}</span>` : '',
    f.sem ? `<span>${esc(f.sem)}</span>` : '',
    f.ev ? `<span>Evaluación: ${esc(f.ev)}</span>` : '',
  ].filter(Boolean).join('');
  return `<div class="ficha">
    <h4>${f.n != null ? `Situación de aprendizaje ${f.n}: ` : ''}${esc(f.titulo)}${f.desc ? ` <span class="suave">· ${esc(f.desc)}</span>` : ''}</h4>
    ${meta ? `<div class="meta">${meta}</div>` : ''}
  </div>`;
}

function fichasSA(n) {
  const ed = E.vista === 'edicion' && puedeEditar(n);
  const sa = saDe(n);
  let cuerpo;
  if (sa) {
    cuerpo = sa.filas.filter((f) => !f.total).map(fichaSAreal).join('');
  } else if (enEsoBach()) {
    cuerpo = tablaCaracteristicasSA() + '<p class="suave" style="margin:8px 0 0">Características de las SA definidas por el departamento para ESO y Bachillerato (no hay fichas desglosadas en este apartado del documento).</p>';
  } else {
    cuerpo = FICHAS.map((f) => `<div class="ficha">
      <h4>Situación de aprendizaje ${f.num}: ${esc(f.titulo)}</h4>
      <div class="meta"><span>${f.ses} sesiones</span><span>Evaluación: ${f.ev}</span><span>RA: ${f.ra.join(', ')}</span></div>
    </div>`).join('');
  }
  return cuerpo + (ed ? '<button class="btn-ghost" data-acc="anadir">＋ Añadir situación de aprendizaje</button>' : '');
}

function tablaClaveValor(n) {
  const filas = [['Módulo profesional', n.moduloId || 'Programación'], ['Código', String(1000 + (hash(n.id) % 8999))],
    ['Curso', E.curso], ['Familia profesional', 'Informática y comunicaciones'], ['Duración', '200 horas'],
    ['Modalidad', 'Presencial']];
  const ed = E.vista === 'edicion' && puedeEditar(n);
  return `<div class="tabla-wrap"><table>${filas.map(([k, v]) =>
    `<tr><td class="etiqueta">${esc(k)}</td><td ${ed ? 'contenteditable="true" class="bloque"' : ''}>${esc(v)}</td></tr>`).join('')}</table></div>`;
}

function tablaGenerica(n, cabeceras) {
  const ed = E.vista === 'edicion' && puedeEditar(n);
  const cols = cabeceras || ['Concepto', 'Descripción', 'Observaciones'];
  const filas = [0, 1, 2].map((i) => [
    pick(['Contenido 1', 'Contenido 2', 'Contenido 3', 'Criterio general'], n.id + i),
    pick(PARRAFOS, n.id + 'g' + i).slice(0, 110) + '…',
    pick(['—', 'Pendiente de completar', 'Revisado por el departamento'], n.id + 'o' + i),
  ]);
  return `<div class="tabla-wrap"><table>
    <tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr>
    ${filas.map((f) => `<tr>${f.map((c) => `<td ${ed ? 'contenteditable="true"' : ''}>${esc(c)}</td>`).join('')}</tr>`).join('')}
  </table></div>`;
}

function contenidoSeccion(n) {
  const t = n.titulo;
  const bloque = [];
  const ed = E.vista === 'edicion' && puedeEditar(n);
  const k = hash(n.id);

  if (t.includes('Ponderaciones')) {
    bloque.push(tarjeta('Ponderaciones de los RA y CE', tablaPonderaciones(n)));
    bloque.push(tarjeta('Cómo se calcula', `<p>La suma de las ponderaciones de los criterios de cada resultado de aprendizaje debe coincidir con la ponderación de ese RA, y el total de los RA debe ser siempre el <strong>100 %</strong>.</p>`));
    return bloque.join('');
  }
  if (t.includes('Resultados de aprendizaje y Criterios')) {
    bloque.push(tarjeta('Resultados de aprendizaje y criterios de evaluación', tablaRaCe()));
    return bloque.join('');
  }
  if (t.includes('Situaciones de aprendizaje')) {
    const sa = saDe(n);
    if (sa) bloque.push(tarjeta('Tabla resumen (extraída del documento)', tablaSAreal(sa)));
    else if (enEsoBach()) bloque.push(tarjeta('Características de las SA según el departamento', tablaCaracteristicasSA()));
    else bloque.push(tarjeta('Tabla resumen (calculada de las fichas)', tablaResumenSA()));
    bloque.push(tarjeta('Fichas de situación de aprendizaje', fichasSA(n)));
    return bloque.join('');
  }
  if (t.includes('Identificación del módulo')) {
    bloque.push(tarjeta('Ficha del módulo', tablaClaveValor(n)));
    return bloque.join('');
  }
  if (t.includes('Competencias y Objetivos')) {
    bloque.push(tarjeta('Relación entre competencias y objetivos', tablaGenerica(n, ['Competencias del ciclo', 'Objetivos generales'])));
    return bloque.join('');
  }

  const esCompartido = COMPARTIDOS.has(t);
  const cuerpo = [];
  if (esCompartido) cuerpo.push(bloqueCompartido(n, k));
  else {
    cuerpo.push(bloqueP(pick(PARRAFOS, n.id + '1'), n));
    cuerpo.push(bloqueP(pick(PARRAFOS, n.id + '2'), n));
    if (k % 2 === 0) cuerpo.push(bloqueLista(n, k));
    if (k % 3 === 0) cuerpo.push(bloqueP(pick(PARRAFOS, n.id + '3'), n));
  }
  bloque.push(tarjeta('', cuerpo.join('')));

  if (n.hijos.length && n.tipo !== 'modulo') {
    const items = n.hijos.map((h) => `<li><button class="enlace-hijo" data-id="${esc(h.id)}">${esc((h.num ? h.num + '. ' : '') + h.titulo)}</button> <i class="punto ${estadoDe(h)}"></i></li>`).join('');
    bloque.push(tarjeta('Apartados que contiene', `<ul class="apartados-hijos">${items}</ul>`));
  } else if (k % 4 === 0) {
    bloque.push(tarjeta('Datos de la tabla', tablaGenerica(n)));
  }
  return bloque.join('');
}

function resumenDoc(n, camino) {
  let hijos = n.hijos;
  if (n.tipo === 'doc' && D.DOCUMENTOS[E.doc].ciclo) {
    const rama = encontrar(n, 'ciclo:' + E.doc + ':' + E.ciclo) || n.hijos[0];
    hijos = rama ? rama.hijos : [];
  }
  const todos = (function deep(l) { return l.flatMap((x) => [x, ...deep(x.hijos)]); })(hijos);
  const hojas = todos.filter((x) => !x.hijos.length);
  const ok = hojas.filter((x) => estadoDe(x) === 'ok').length;
  const pct = hojas.length ? Math.round((ok / hojas.length) * 100) : 0;
  const modulos = todos.filter((x) => x.tipo === 'modulo').length;

  const tarjetas = hijos.map((h) => {
    const hs = (function conta(l) { return l.flatMap((x) => x.hijos.length ? conta(x.hijos) : [x]); })([h]);
    const o = hs.filter((x) => estadoDe(x) === 'ok').length;
    const p = hs.length ? Math.round((o / hs.length) * 100) : 0;
    return `<button class="mini" data-id="${esc(h.id)}">
      <strong>${esc((h.num ? h.num + '. ' : '') + h.titulo)}</strong>
      <span class="sub">${hs.length} ${hs.length === 1 ? 'apartado' : 'apartados'} · ${p} % relleno</span>
      <div class="barra"><i style="width:${p}%"></i></div>
    </button>`;
  }).join('');

  const etiquetaMod = E.ciclo === 'eso' || E.ciclo === 'bach' ? 'materias' : 'módulos';
  const stats = `<div class="resumen-grid" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr))">
    <div class="stat"><b>${hijos.length}</b><span>apartados principales</span></div>
    <div class="stat"><b>${modulos}</b><span>${etiquetaMod}</span></div>
    <div class="stat"><b>${hojas.length}</b><span>campos</span></div>
    <div class="stat"><b>${pct} %</b><span>relleno</span></div>
  </div>`;

  return tarjeta('Resumen del documento', stats)
    + tarjeta('Apartados · pulsa para abrir', `<div class="resumen-grid">${tarjetas}</div>`)
    + tarjeta('Notas de la importación', `<ul>
        <li>Estructura deducida del Word sin IA: estilos de título, numeración y tablas.</li>
        <li>${modulos ? `Bloque de módulos/materias detectado con ${modulos} instancias.` : 'Sin desglose por módulos: el documento se edita por apartados.'}</li>
        <li>Textos repetidos en 3 o más apartados guardados una sola vez como <strong>textos compartidos</strong>.</li>
      </ul>`);
}

/* ------------------------------------------------------------------ avisos */
function avisosDe(n) {
  const out = [];
  const ed = puedeEditar(n);
  if (!ed) {
    out.push({ s: 'info', t: 'Solo lectura', d: E.rol === 'jefe_estudios' ? 'El rol jefe de estudios visualiza pero no edita.' : 'Este apartado lo edita el jefe de departamento.' });
  }
  if (n.titulo.includes('Ponderaciones')) {
    const desfasado = hash(n.id) % 3 === 0;
    if (desfasado) {
      out.push({ s: 'error', t: 'RA4: criterios 20 % ≠ RA 15 %', d: 'Los criterios de evaluación suman más que la ponderación del resultado de aprendizaje.' });
      out.push({ s: 'error', t: 'Total de RA: 95 %', d: 'La suma de las ponderaciones de los RA debería ser 100 %.' });
    } else out.push({ s: 'ok', t: 'Ponderaciones correctas', d: 'RA al 100 % y criterios cuadrados.' });
  }
  if (estadoDe(n) === 'warn' && n.hijos.length === 0) out.push({ s: 'warn', t: 'Campo con avisos', d: 'Falta completar algún dato de este apartado antes de aprobar el documento.' });
  if (estadoDe(n) === 'vacio' && n.hijos.length === 0) out.push({ s: 'warn', t: 'Apartado vacío', d: 'Todavía no se ha importado ni escrito contenido aquí.' });
  if (COMPARTIDOS.has(n.titulo)) {
    out.push({ s: 'warn', t: 'Texto compartido desactualizado', d: 'El original cambió (v3) y esta copia es v2. Desvincula o actualiza.' });
    out.push({ s: 'info', t: 'Editado por el jefe de departamento', d: 'Al cambiarlo se actualizan todos los módulos vinculados.' });
  }
  if (n.tipo === 'modulo') out.push({ s: 'info', t: (E.ciclo === 'eso' || E.ciclo === 'bach' ? 'Materia editable por: ' : 'Módulo editable por: ') + (n.docentes || 'profesorado del módulo'), d: 'Permisos resueltos con lib/permisos.js.' });
  if (!out.some((x) => x.s === 'error' || x.s === 'warn')) out.push({ s: 'ok', t: 'Sin incidencias', d: 'Todo correcto en este apartado.' });
  return out;
}

function pintarAvisos() {
  const e = E.indice.get(E.activo);
  if (!e) return;
  const nModulos = E.lineal.filter((x) => x.nodo.tipo === 'modulo').length;
  const esResumen = e.nodo.tipo === 'doc' || e.nodo.tipo === 'ciclo' || e.nodo.tipo === 'nivel';
  const lista = (E.vista === 'validaciones' || esResumen) ? avisosDocumento() : avisosDe(e.nodo);
  const cuenta = { error: 0, warn: 0, info: 0, ok: 0 };
  lista.forEach((a) => cuenta[a.s]++);

  $('#avisos').innerHTML = `
    <div class="panel-avisos">
      <header>Comprobaciones <span class="contador">${E.vista === 'validaciones' || esResumen ? 'del documento' : 'en este apartado'}</span></header>
      <ul class="lista-avisos">
        ${lista.map((a) => `<li class="${a.s}"><i class="marca"></i><div><b>${esc(a.t)}</b><span>${esc(a.d)}</span></div></li>`).join('')}
      </ul>
    </div>
    <div class="panel-avisos">
      <header>Estado del documento</header>
      <div class="estadisticas">
        <div class="stat"><b>${cuenta.error}</b><span>errores</span></div>
        <div class="stat"><b>${cuenta.warn}</b><span>avisos</span></div>
        <div class="stat"><b>${cuenta.ok}</b><span>correctos</span></div>
        <div class="stat"><b>${nModulos || '—'}</b><span>${E.ciclo === 'eso' || E.ciclo === 'bach' ? 'materias' : 'módulos'}</span></div>
      </div>
    </div>`;
}

function avisosDocumento() {
  const out = [
    { s: 'error', t: 'RA4 de "Programación": criterios 20 % ≠ RA 15 %', d: 'PD · DAW · 9.4 Ponderaciones' },
    { s: 'error', t: 'Suma de ponderaciones de RA = 95 %', d: 'PD · DAW · 9.4 Ponderaciones' },
    { s: 'warn', t: 'RA3 sin situación de aprendizaje', d: 'PD · DAW · Programación' },
    { s: 'warn', t: 'Texto compartido c006 desactualizado en 2 módulos', d: 'Copias creadas antes de la versión 3' },
    { s: 'warn', t: 'Apartado vacío en 2 de 11 módulos', d: 'Metodología específica' },
    { s: 'info', t: '3 apartados comunes asignados a docentes', d: 'datos.asignaciones' },
    { s: 'ok', t: 'Textos compartidos resueltos', d: '12 textos, 0 referencias rotas' },
  ];
  if (E.rol === 'jefe_estudios') out.unshift({ s: 'info', t: 'Rol de solo lectura', d: 'Jefe de estudios: ve todos los departamentos, no edita.' });
  return out;
}

function contenidoValidaciones() {
  const nodos = E.lineal.map((x) => x.nodo);
  const hojas = nodos.filter((n) => !n.hijos.length && n.tipo !== 'doc' && n.tipo !== 'ciclo');
  const modulos = nodos.filter((n) => n.tipo === 'modulo');
  const ok = hojas.filter((n) => estadoDe(n) === 'ok').length;
  const warn = hojas.filter((n) => estadoDe(n) === 'warn').length;
  const vac = hojas.filter((n) => estadoDe(n) === 'vacio').length;

  const tablaMod = modulos.length ? `
    <div class="tabla-wrap"><table>
      <tr><th>Módulo</th><th class="centro">Suma RA</th><th class="centro">Situaciones</th><th class="centro">Estado</th></tr>
      ${modulos.map((m) => {
        const p = hash(m.id) % 5 === 0;
        return `<tr><td>${esc(m.titulo)}</td>
          <td class="centro">${p ? '<span class="suma-chip mal">95 %</span>' : '<span class="suma-chip ok">100 %</span>'}</td>
          <td class="centro">${4 + (hash(m.id + 's') % 4)}</td>
          <td class="centro"><i class="punto ${estadoDe(m)}"></i></td></tr>`;
      }).join('')}
    </table></div>` : `<p>Este documento no se desglosa por módulos: las comprobaciones son por apartado.</p>`;

  return tarjeta('Comprobaciones automáticas del documento', `
      <p style="color:var(--suave)">Las mismas comprobaciones que aparecen en una cajita roja del PDF, pero <strong>antes</strong> de exportar.</p>
      <div class="resumen-grid" style="grid-template-columns:repeat(auto-fill,minmax(140px,1fr))">
        <div class="stat"><b style="color:var(--rojo)">2</b><span>errores</span></div>
        <div class="stat"><b style="color:var(--ambar)">${3 + warn % 3}</b><span>avisos</span></div>
        <div class="stat"><b style="color:var(--verde)">${ok}</b><span>campos correctos</span></div>
        <div class="stat"><b>${vac}</b><span>campos vacíos</span></div>
      </div>`)
    + tarjeta('Ponderaciones por módulo', tablaMod)
    + tarjeta('Textos compartidos', `
      <div class="tabla-wrap"><table>
        <tr><th>Id</th><th>Origen</th><th class="centro">Apartados</th><th>Modo</th></tr>
        <tr><td>c001</td><td>Propuestas de mejora</td><td class="centro">3</td><td>sugerido</td></tr>
        <tr><td>c006</td><td>Ponderaciones de los RA</td><td class="centro">9</td><td>sugerido</td></tr>
        <tr><td>c008</td><td>Recursos específicos</td><td class="centro">9</td><td>sugerido</td></tr>
        <tr><td>c011</td><td>Recuperación de RA</td><td class="centro">7</td><td>obligatorio</td></tr>
      </table></div>`);
}

/* ------------------------------------------------------------------ pintado general */
function pintarContenido() {
  const e = E.indice.get(E.activo);
  if (!e) return;
  const { nodo: n, camino } = e;
  const cont = $('#contenido');
  cont.classList.toggle('editable', E.vista === 'edicion');

  if (E.vista === 'validaciones') {
    cont.innerHTML = contenidoValidaciones();
    return;
  }

  let html = '';
  if (E.vista === 'edicion' && puedeEditar(n)) {
    html += `<div class="toolbar">
      <button data-tool="negrita"><strong>N</strong></button>
      <button data-tool="cursiva"><em>C</em></button>
      <button data-tool="lista">• Lista</button>
      <button data-tool="enlace">Enlace</button>
      <span class="sep"></span>
      <button data-tool="tabla">Tabla</button>
      <button data-tool="compartido">Texto compartido</button>
      <span class="sep"></span>
      <button data-tool="deshacer">↶</button>
      <button data-tool="rehacer">↷</button>
      <span class="ayuda">Los cambios se guardan solos · mockup editable</span>
    </div>`;
  } else if (E.vista === 'edicion' && !puedeEditar(n)) {
    html += `<div class="solo-lectura"><i class="punto lock"></i>
      <div><strong>Solo lectura.</strong> Con el rol <em>${rolLabel().toLowerCase()}</em> este apartado no es editable.
      Cambia el rol de arriba para ver cómo lo resuelve <code>lib/permisos.js</code>.</div></div>`;
  }

  if (n.tipo === 'doc' || n.tipo === 'ciclo' || n.tipo === 'nivel') html += resumenDoc(n, camino);
  else html += contenidoSeccion(n);

  cont.innerHTML = html;
  if (cont.querySelector('[data-pond]')) recalcularPonderaciones();
}

function pintarProgreso() {
  const hojas = E.lineal.map((x) => x.nodo).filter((n) => !n.hijos.length && n.tipo !== 'doc' && n.tipo !== 'ciclo' && n.tipo !== 'nivel');
  const ok = hojas.filter((n) => estadoDe(n) === 'ok').length;
  const pct = hojas.length ? Math.round((ok / hojas.length) * 100) : 0;
  $('#pct-progreso').textContent = pct + ' %';
  $('#barra-progreso').style.width = pct + '%';
}

function pintarPager() {
  const i = E.lineal.findIndex((x) => x.nodo.id === E.activo);
  $('#btn-anterior').disabled = i <= 0;
  $('#btn-siguiente').disabled = i < 0 || i >= E.lineal.length - 1;
  $('#pager-info').textContent = i >= 0 ? `${i + 1} / ${E.lineal.length} apartados del documento` : '';
}

function pintarTodo() {
  const docs = construir();
  asegurarVista();
  pintarArbol(docs);
  pintarCabecera();
  pintarContenido();
  pintarAvisos();
  pintarProgreso();
  pintarPager();
  $('#btn-permisos').hidden = E.rol !== 'admin';
}

/* La vista de edición solo es posible donde el rol puede editar:
   si no, se sale de ella y el botón "Edición" queda deshabilitado. */
function asegurarVista() {
  const e = E.indice.get(E.activo);
  const editable = !!(e && puedeEditar(e.nodo));
  if (E.vista === 'edicion' && !editable) {
    E.vista = 'navegacion';
    toast(mensajeSinPermiso());
  }
  document.querySelectorAll('#selector-vista button').forEach((b) => {
    b.classList.toggle('on', b.dataset.vista === E.vista);
    if (b.dataset.vista === 'edicion') {
      b.disabled = !editable;
      b.title = editable ? 'Activar la vista de edición' : mensajeSinPermiso();
    }
  });
}

/* ------------------------------------------------------------------ interacciones */
function seleccionar(id) {
  if (!E.indice.has(id)) return;
  E.activo = id;
  const e = E.indice.get(id);
  e.camino.forEach((n) => E.abiertos.add(n.id));
  const docN = e.camino.find((n) => n.tipo === 'doc');
  const nivN = e.camino.find((n) => n.tipo === 'nivel');
  const cicN = e.camino.find((n) => n.tipo === 'ciclo');
  if (docN) E.doc = docN.id.slice(4);
  if (nivN) E.nivel = nivN.id.split(':')[2];
  if (cicN) E.ciclo = cicN.id.split(':')[2];
  pintarTodo();
}

function recalcularPonderaciones() {
  const raInputs = [...document.querySelectorAll('[data-ra]')];
  if (!raInputs.length) return;
  let total = 0;
  raInputs.forEach((inp) => {
    const num = inp.dataset.ra;
    const p = Number(inp.value) || 0;
    total += p;
    const ces = [...document.querySelectorAll(`[data-ce="${num}"]`)];
    const suma = ces.reduce((a, c) => a + (Number(c.value) || 0), 0);
    const chip = document.querySelector(`[data-suma-ra="${num}"]`);
    const ok = Math.abs(suma - p) < 0.01;
    if (chip) {
      chip.textContent = suma.toFixed(suma % 1 ? 1 : 0) + ' %';
      chip.className = 'suma-chip ' + (ok ? 'ok' : 'mal');
      chip.title = ok ? 'Los criterios cuadran con el RA' : `Los criterios suman ${suma} % y el RA pondera ${p} %`;
    }
  });
  const t = document.querySelector('[data-suma-total]');
  if (t) {
    t.textContent = total.toFixed(total % 1 ? 1 : 0) + ' %';
    t.className = 'suma-chip ' + (Math.abs(total - 100) < 0.01 ? 'ok' : 'mal');
  }
}

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('ver');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('ver'), 2800);
}

/* eventos del árbol */
$('#arbol').addEventListener('click', (ev) => {
  const fila = ev.target.closest('.fila');
  if (!fila) return;
  const id = fila.dataset.id;
  if (ev.target.dataset.twisty !== undefined) {
    E.abiertos.has(id) ? E.abiertos.delete(id) : E.abiertos.add(id);
    const li = fila.parentElement;
    li.classList.toggle('abierto', E.abiertos.has(id));
    return;
  }
  if (E.abiertos.has(id)) E.abiertos.delete(id); else E.abiertos.add(id);
  seleccionar(id);
});

$('#migas').addEventListener('click', (ev) => {
  const b = ev.target.closest('button[data-id]');
  if (b) seleccionar(b.dataset.id);
});

document.addEventListener('click', (ev) => {
  const b = ev.target.closest('.mini[data-id], .enlace-hijo[data-id]');
  if (b) seleccionar(b.dataset.id);
});

$('#contenido').addEventListener('input', (ev) => {
  if (ev.target.matches('[data-pond] input')) {
    recalcularPonderaciones();
    marcarGuardado();
  }
});

$('#contenido').addEventListener('click', (ev) => {
  const acc = ev.target.closest('[data-acc]');
  if (acc) {
    const m = { 'editar-compartido': 'Editar el texto compartido: cambiará en todos los módulos vinculados.', desvincular: 'Módulo desvinculado: ya tiene copia propia editable.', anadir: 'Nueva ficha de situación de aprendizaje (mockup).' }[acc.dataset.acc];
    toast(m); return;
  }
  const tool = ev.target.closest('[data-tool]');
  if (tool) { toast(`Herramienta "${tool.textContent.trim()}" — decorativa en el mockup.`); return; }
  if (ev.target.closest('[contenteditable]')) marcarGuardado();
});

$('#contenido').addEventListener('keyup', (ev) => { if (ev.target.isContentEditable) marcarGuardado(); });

let guardadoTimer;
function marcarGuardado() {
  const el = $('#autoguardado');
  if (el.hidden) return;
  el.innerHTML = '<span class="chip chip-warn">Guardando…</span>';
  clearTimeout(guardadoTimer);
  guardadoTimer = setTimeout(() => { el.innerHTML = '<span class="chip chip-guardado">Guardado ahora ✓</span>'; }, 900);
}

/* ------------------------------------------------------------------ panel de permisos (solo admin) */
const CLAVE_PERFILES = 'pccf-ha-perfiles';
let multiAbierto = null; // rol con el multiselector desplegado

function cargarPerfiles() {
  try {
    const g = JSON.parse(localStorage.getItem(CLAVE_PERFILES) || 'null');
    if (!g) return;
    Object.keys(PERFILES_DEFECTO).forEach((k) => {
      if (Array.isArray(g[k])) D.PERFILES[k] = g[k].filter((x) => typeof x === 'string');
    });
  } catch (e) {}
}
function guardarPerfiles() {
  try { localStorage.setItem(CLAVE_PERFILES, JSON.stringify(D.PERFILES)); } catch (e) {}
}
function recorrerNodos(n, fn) { fn(n); n.hijos.forEach((h) => recorrerNodos(h, fn)); }

// Catálogo de unidades editables (deduplicado por nombre, agrupado):
// módulos de FP (ambos documentos y cursos) y materias/bloques de ESO y Bach.
function catalogoUnidades() {
  const grupos = []; const visto = new Set();
  const meter = (grupo, nombre) => {
    if (visto.has(nombre)) return;
    visto.add(nombre);
    let g = grupos.find((x) => x.grupo === grupo);
    if (!g) { g = { grupo, unidades: [] }; grupos.push(g); }
    g.unidades.push(nombre);
  };
  for (const curso of ['2025-26', '2026-27']) {
    for (const c of D.CICLOS) {
      for (const docId of ['pccf', 'pd']) {
        recorrerNodos(D.arbolDocumento(docId, c.id, curso), (n) => {
          if (n.edita === 'modulo' && (n.tipo === 'modulo' || n.propio)) meter('FP · ' + c.nombre, n.titulo);
        });
      }
    }
    const ram = D.RAMAS.pd.find((r) => r.id === 'eso-bach');
    for (const h of ram.hojas) {
      recorrerNodos(D.arbolDocumento('pd', h.id, curso), (n) => {
        if (n.edita === 'modulo' && (n.tipo === 'modulo' || n.propio)) meter(h.nombre, n.titulo);
      });
    }
  }
  return grupos;
}

function chipsUnidades(rol) {
  const u = D.PERFILES[rol] || [];
  if (!u.length) return '<span class="suave">Ninguna unidad</span>';
  return u.map((x) => `<span class="chip">${esc(x)}<button class="quitar" data-quitar="${esc(x)}" data-rol="${rol}" title="Quitar permiso">×</button></span>`).join('');
}

const FILAS_PERMISOS = () => ([
  { rol: 'admin', etiqueta: 'Admin', fija: 'Todos los apartados, módulos y materias' },
  { rol: 'jefe_estudios', etiqueta: 'Jefe de estudios', fija: 'Solo lectura' },
  { rol: 'jefe_departamento', etiqueta: 'Jefe de departamento', fija: 'Todos los módulos y materias (apartados comunes incluidos)' },
  ...ROLES_DOCENTE.map((r) => ({ rol: r, etiqueta: rolLabelDe(r) })),
]);

function pintarPermisos() {
  const filas = FILAS_PERMISOS().map((f) => (f.fija
    ? `<tr><td><strong>${esc(f.etiqueta)}</strong></td><td><span class="chip fija">${esc(f.fija)}</span></td><td class="centro suave">fijo</td></tr>`
    : `<tr><td><strong>${esc(f.etiqueta)}</strong></td>
       <td data-chips="${f.rol}">${chipsUnidades(f.rol)}</td>
       <td class="centro"><button class="btn-ghost" data-sel="${f.rol}">Elegir unidades</button></td></tr>`)).join('');
  $('#permisos-cuerpo').innerHTML = `<div class="tabla-wrap"><table class="tabla-permisos">
    <tr><th>Perfil</th><th>Unidades con permiso de edición</th><th class="centro">Selector</th></tr>${filas}
  </table></div>
  <div class="multi" id="multi" hidden></div>`;
  if (multiAbierto) pintarMulti(multiAbierto);
}

function pintarMulti(rol) {
  const m = $('#multi');
  if (!m) return;
  const sel = new Set(D.PERFILES[rol] || []);
  m.innerHTML = `<div class="multi-titulo">Unidades editables de <strong>${esc(rolLabelDe(rol) || rol)}</strong> · <span class="suave">${sel.size} seleccionadas</span></div>`
    + catalogoUnidades().map((g) => `<fieldset class="multi-grupo"><legend>${esc(g.grupo)}</legend>
        ${g.unidades.map((u) => `<label><input type="checkbox" data-u="${esc(u)}" ${sel.has(u) ? 'checked' : ''}><span>${esc(u)}</span></label>`).join('')}
      </fieldset>`).join('');
  m.hidden = false;
  const ancla = $(`#permisos-cuerpo button[data-sel="${rol}"]`);
  const cont = $('#permisos-cuerpo');
  if (ancla && cont) {
    const r = ancla.getBoundingClientRect(); const cr = cont.getBoundingClientRect();
    m.style.top = Math.max(0, r.bottom - cr.top + 6) + 'px';
    m.style.left = Math.max(0, Math.min(r.left - cr.left, cr.width - Math.min(m.offsetWidth, cr.width - 16) - 8)) + 'px';
  }
}

function actualizarChips(rol) {
  const celda = $(`#permisos-cuerpo [data-chips="${rol}"]`);
  if (celda) celda.innerHTML = chipsUnidades(rol);
}

function aplicarUnidad(rol, unidad, concedida) {
  const lista = D.PERFILES[rol] || (D.PERFILES[rol] = []);
  const i = lista.indexOf(unidad);
  if (concedida && i < 0) lista.push(unidad);
  if (!concedida && i >= 0) lista.splice(i, 1);
  guardarPerfiles();
  actualizarChips(rol);
  pintarTodo(); // el árbol refleja los candados al momento
  toast(`${concedida ? 'Permiso concedido' : 'Permiso retirado'}: «${unidad}» → ${rolLabelDe(rol)}.`);
}

function abrirPermisos() {
  if (E.rol !== 'admin') { toast(mensajeSinPermiso()); return; }
  pintarPermisos();
  $('#modal-permisos').hidden = false;
}
function cerrarPermisos() {
  multiAbierto = null;
  $('#modal-permisos').hidden = true;
  pintarTodo();
  toast('Permisos aplicados: el árbol muestra qué puede editar cada perfil.');
}
function restablecerPerfiles() {
  Object.keys(D.PERFILES).forEach((k) => delete D.PERFILES[k]);
  Object.assign(D.PERFILES, JSON.parse(JSON.stringify(PERFILES_DEFECTO)));
  guardarPerfiles();
  multiAbierto = null;
  pintarPermisos();
  pintarTodo();
  toast('Permisos de los perfiles restablecidos a los valores por defecto.');
}

/* selectores de la barra superior */
$('#selector-curso').addEventListener('click', (ev) => {
  const b = ev.target.closest('button[data-curso]');
  if (!b || b.dataset.curso === E.curso) return;
  E.curso = b.dataset.curso;
  [...ev.currentTarget.children].forEach((x) => x.classList.toggle('on', x === b));
  pintarTodo();
  toast('Curso ' + E.curso + ': estructura y módulos recargados.');
});

$('#selector-vista').addEventListener('click', (ev) => {
  const b = ev.target.closest('button[data-vista]');
  if (!b || b.disabled || b.dataset.vista === E.vista) return;
  E.vista = b.dataset.vista;
  pintarTodo();
});

$('#btn-editar').addEventListener('click', () => {
  const e = E.indice.get(E.activo);
  if (!e || !puedeEditar(e.nodo)) { toast(mensajeSinPermiso()); return; }
  E.vista = E.vista === 'edicion' ? 'navegacion' : 'edicion';
  pintarTodo();
});

$('#selector-rol').addEventListener('change', (ev) => {
  E.rol = ev.target.value;
  if (E.rol !== 'admin') { multiAbierto = null; $('#modal-permisos').hidden = true; }
  toast('Rol: ' + rolLabel() + ' — permisos recalculados.');
  pintarTodo();
});

$('#btn-tema').addEventListener('click', () => {
  const oscuro = document.documentElement.dataset.tema === 'oscuro';
  document.documentElement.dataset.tema = oscuro ? 'claro' : 'oscuro';
  try { localStorage.setItem('tema', oscuro ? 'claro' : 'oscuro'); } catch (e) {}
});

$('#btn-exportar').addEventListener('click', () => {
  toast('Mockup: en la app real, GET /api/documentos/[id]/pdf genera este documento con lib/render-generico.js.');
});

/* panel de permisos */
$('#btn-permisos').addEventListener('click', abrirPermisos);
$('#cerrar-permisos').addEventListener('click', cerrarPermisos);
$('#listo-permisos').addEventListener('click', cerrarPermisos);
$('#restablecer-permisos').addEventListener('click', restablecerPerfiles);
$('#modal-permisos').addEventListener('click', (ev) => { if (ev.target === ev.currentTarget) cerrarPermisos(); });
$('#permisos-cuerpo').addEventListener('click', (ev) => {
  const sel = ev.target.closest('button[data-sel]');
  if (sel) {
    const rol = sel.dataset.sel;
    multiAbierto = multiAbierto === rol ? null : rol;
    if (multiAbierto) pintarMulti(multiAbierto);
    else { const m = $('#multi'); if (m) m.hidden = true; }
    return;
  }
  const q = ev.target.closest('button[data-quitar]');
  if (q) aplicarUnidad(q.dataset.rol, q.dataset.quitar, false);
});
$('#permisos-cuerpo').addEventListener('change', (ev) => {
  const cb = ev.target.closest('#multi input[type="checkbox"]');
  if (!cb || !multiAbierto) return;
  aplicarUnidad(multiAbierto, cb.dataset.u, cb.checked);
});
document.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Escape') return;
  if (!$('#multi')?.hidden) { multiAbierto = null; $('#multi').hidden = true; return; }
  if (!$('#modal-permisos').hidden) cerrarPermisos();
});

$('#buscar').addEventListener('input', (ev) => {
  E.q = ev.target.value;
  $('#limpiar').hidden = !E.q;
  if (E.q) {
    // abrir todas las ramas que coinciden
    E.indice.forEach((e, id) => { if (ramaVisible(e.nodo, E.q)) E.abiertos.add(id); });
  }
  pintarArbol(construir());
});
$('#limpiar').addEventListener('click', () => {
  E.q = ''; $('#buscar').value = ''; $('#limpiar').hidden = true; pintarTodo();
});

$('#btn-anterior').addEventListener('click', () => mover(-1));
$('#btn-siguiente').addEventListener('click', () => mover(1));
function mover(d) {
  const i = E.lineal.findIndex((x) => x.nodo.id === E.activo);
  const j = i + d;
  if (j >= 0 && j < E.lineal.length) seleccionar(E.lineal[j].nodo.id);
}

/* arranque */
try { const t = localStorage.getItem('tema'); if (t) document.documentElement.dataset.tema = t; } catch (e) {}
cargarPerfiles();
pintarTodo();
