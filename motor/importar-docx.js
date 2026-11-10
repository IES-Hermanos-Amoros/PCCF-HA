// Importador de Word (.docx): deduce la ESTRUCTURA del documento (plantilla) y extrae su CONTENIDO (datos)
// en una sola pasada. Sin IA: estilos de título, numeración, tablas y cabeceras conocidas.
//
//   const { importarDocx } = require('./importar-docx');
//   const { plantilla, datos, informe } = await importarDocx({ path: 'PD.docx' });
//
// Todo JavaScript puro (mammoth + node-html-parser): apto para una función serverless.

const fs = require('fs');
const mammoth = require('mammoth');
const JSZip = require('jszip');
const { parse } = require('node-html-parser');
const { extraerCompartidos } = require('./compartidos');
const { fichaDeFilas } = require('./ficha-sa');
// El lector de la tabla de RA y CE es el MISMO que usa el editor del navegador después de cada
// cambio en la rejilla (core/ra-ce.js). Con una copia aquí, abrir una tabla importada y guardarla
// sin tocar nada le cambiaría los resultados de aprendizaje.
const { raDeFilas } = require('../core/ra-ce');

// ---------------------------------------------------------------- utilidades de texto
const decode = (t) => String(t || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
const limpiar = (t) => decode(t).replace(/[ \t\r\f\v]+/g, ' ').replace(/ ?\n ?/g, '\n').trim();
const sinAcentos = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const RE_NUM = /^\s*(\d+(?:\.\d+)*)[.)]?\s+(.*)$/s;
const norm = (t) => sinAcentos(String(t || '')).toLowerCase().replace(RE_NUM, '$2').replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim();
const slug = (t) => norm(t).replace(/ /g, '-').slice(0, 50) || 'seccion';
const parseNum = (t) => { const m = String(t).trim().match(RE_NUM); return m ? { num: m[1], titulo: m[2].trim() } : { num: null, titulo: String(t).trim() }; };
const tag = (n) => (n && n.nodeType === 1 ? String(n.tagName || n.rawTagName || '').toLowerCase() : '');

// ---------------------------------------------------------------- HTML (mammoth) -> secuencia de nodos
function textoNodo(n) {
  if (n.nodeType === 3) return decode(n.rawText);
  if (n.nodeType !== 1) return '';
  const t = tag(n);
  if (t === 'br') return '\n';
  return n.childNodes.map(textoNodo).join('');
}
function itemsLista(lista, nivel, out) {
  for (const li of lista.childNodes) {
    if (tag(li) !== 'li') continue;
    const propio = li.childNodes.filter((c) => !['ul', 'ol'].includes(tag(c))).map(textoNodo).join('');
    const texto = limpiar(propio);
    if (texto) out.push({ text: texto, level: nivel });
    for (const sub of li.childNodes) if (['ul', 'ol'].includes(tag(sub))) itemsLista(sub, nivel + 1, out);
  }
  return out;
}
function textoCelda(td) {
  const partes = [];
  for (const c of td.childNodes) {
    const t = tag(c);
    if (t === 'ul' || t === 'ol') partes.push(itemsLista(c, 0, []).map((i) => `${'  '.repeat(i.level)}- ${i.text}`).join('\n'));
    else { const s = limpiar(textoNodo(c)); if (s) partes.push(s); }
  }
  return partes.filter(Boolean).join('\n');
}
function esNegrita(td) {
  const total = limpiar(textoNodo(td));
  if (!total) return false;
  const fuerte = td.querySelectorAll('strong').map((s) => limpiar(textoNodo(s))).join(' ');
  return fuerte.length >= total.length * 0.8;
}
function tabla(el) {
  const rows = [];
  const filas = el.childNodes.filter((r) => tag(r) === 'tr').length ? el.childNodes.filter((r) => tag(r) === 'tr') : el.querySelectorAll('tr');
  for (const tr of filas) {
    const celdas = tr.childNodes.filter((c) => ['td', 'th'].includes(tag(c))).map((td) => ({
      text: textoCelda(td), colspan: Number(td.getAttribute('colspan') || 1), rowspan: Number(td.getAttribute('rowspan') || 1), bold: esNegrita(td),
    }));
    if (celdas.length) rows.push(celdas);
  }
  return { type: 'table', rows };
}
function htmlANodos(html) {
  const root = parse(html);
  const nodos = [];
  for (const el of root.childNodes) {
    const t = tag(el);
    if (!t) continue;
    if (/^h[1-6]$/.test(t)) { const texto = limpiar(textoNodo(el)); if (texto) nodos.push({ type: 'h', level: Number(t[1]), text: texto }); }
    else if (t === 'p') { const texto = limpiar(textoNodo(el)); if (texto) nodos.push({ type: 'p', text: texto, bold: esNegrita(el) }); }
    else if (t === 'ul' || t === 'ol') { const items = itemsLista(el, 0, []); if (items.length) nodos.push({ type: 'list', ordered: t === 'ol', items }); }
    else if (t === 'table') { const tb = tabla(el); if (tb.rows.length) nodos.push(tb); }
  }
  return nodos;
}

// ---------------------------------------------------------------- nodos -> árbol de secciones (por títulos)
function construirArbol(nodos) {
  const raiz = { nivel: 0, titulo: '', num: null, bloques: [], hijos: [] };
  const pila = [raiz];
  for (const n of nodos) {
    if (n.type === 'h') {
      while (pila[pila.length - 1].nivel >= n.level) pila.pop();
      const { num, titulo } = parseNum(n.text);
      const sec = { nivel: n.level, titulo, num, bloques: [], hijos: [] };
      pila[pila.length - 1].hijos.push(sec);
      pila.push(sec);
    } else pila[pila.length - 1].bloques.push(n);
  }
  return raiz;
}

// ---------------------------------------------------------------- detección de instancias repetidas (p. ej. un bloque por módulo)
const firma = (sec) => sec.hijos.map((h) => norm(h.titulo));
function similitud(a, b) {
  const A = new Set(a), B = new Set(b);
  if (!A.size && !B.size) return 0;
  const inter = [...A].filter((x) => B.has(x)).length;
  return inter / new Set([...A, ...B]).size;
}
function detectarGrupo(sec, umbral = 0.5) {
  const cand = sec.hijos.filter((h) => h.hijos.length >= 2);
  if (cand.length < 2) return null;
  let base = null, mejor = 0;
  for (const h of cand) {
    const otros = cand.filter((o) => o !== h);
    const media = otros.reduce((a, o) => a + similitud(firma(h), firma(o)), 0) / otros.length;
    if (media > mejor) { mejor = media; base = h; }
  }
  if (mejor < umbral) return null;
  const instancias = cand.filter((h) => similitud(firma(h), firma(base)) >= umbral);
  return instancias.length >= 2 ? { base, instancias } : null;
}

// ---------------------------------------------------------------- clasificación de tablas por su cabecera
function clasificarTabla(t) {
  const c = t.rows[0].map((x) => norm(x.text));
  const c0 = c[0] || '';
  const alguna = (f) => c.some(f);
  if (c0 === 'modulo profesional') return { tipo: 'auto.ficha_modulo', id: 'ficha_modulo', etiqueta: 'Identificación del módulo' };
  if (alguna((x) => x === 'resultados de aprendizaje') && alguna((x) => x.startsWith('criterios de evaluacion'))) return { tipo: 'auto.tabla_ra_ce', id: 'ra_ce', etiqueta: 'Resultados de aprendizaje y criterios de evaluación' };
  if (c0.startsWith('resultado de aprendizaje') && alguna((x) => x === 'ponderacion')) return { tipo: 'ponderacion_ra_ce', id: 'ponderaciones', etiqueta: 'Ponderaciones de RA y CE', multiple: true };
  if (c0.startsWith('situacion de aprendizaje')) return { tipo: 'ficha_situacion_aprendizaje', id: 'ficha', etiqueta: 'Ficha de situación de aprendizaje' };
  if ((c0 === 'ev' || c0 === 'ev.') && alguna((x) => x.startsWith('situaciones de aprendizaje'))) return { tipo: 'derivado.resumen_situaciones', id: 'resumen_situaciones', etiqueta: 'Resumen de situaciones de aprendizaje', derivado: true };
  if (c0 === 'curso' && alguna((x) => x.startsWith('ce empresa'))) return { tipo: 'dual_ra_ce', id: 'dual', etiqueta: 'RA y CE dualizados' };
  if (c0 === 'contenidos del modulo') return { tipo: 'auto.contenidos', id: 'contenidos', etiqueta: 'Contenidos del módulo' };
  if (c[0] === 'competencias' && c[1] === 'objetivos') return { tipo: 'auto.competencias_objetivos', id: 'competencias_objetivos', etiqueta: 'Competencias y objetivos' };
  const dosCols = t.rows.every((r) => r.length <= 2);
  if (dosCols && t.rows.length >= 3 && t.rows.every((r) => norm(r[0].text).length <= 40)) return { tipo: 'tabla_clave_valor', id: 'tabla-' + slug(c0 || 'datos'), etiqueta: t.rows[0][0].text || 'Datos' };
  const cabecera = t.rows[0].every((x) => x.bold) || t.rows[0].every((x) => x.text.length <= 40);
  return { tipo: 'tabla', id: 'tabla-' + slug(c.join(' ')).slice(0, 40), etiqueta: 'Tabla', columnas: cabecera ? t.rows[0].map((x) => x.text) : null };
}
const claveTabla = (cls) => `${cls.tipo}|${cls.id}`;
// Una tabla está RECONOCIDA cuando el importador sabe QUÉ es y no solo qué forma tiene: los dos
// últimos casos de `clasificarTabla` —`tabla_clave_valor` y `tabla`— son el cajón de sastre al que
// cae cualquier rejilla, y por eso no cuentan como reconocimiento.
const GENERICOS = new Set(['tabla', 'tabla_clave_valor']);
const esReconocida = (cls) => !GENERICOS.has(cls.tipo);

// ---------------------------------------------------------------- extracción estructurada de tablas conocidas
const numPct = (t) => { const m = String(t || '').replace(',', '.').match(/-?\d+(?:\.\d+)?/); return m ? Number(m[0]) : null; };

function parsePonderacion(t) {
  const m = t.rows[0][0].text.match(/\.(\d+)\)/);
  const out = { ra: m ? Number(m[1]) : null, texto: (t.rows[1] && t.rows[1][0].text) || '', ponderacion: t.rows[1] ? numPct(t.rows[1][1] && t.rows[1][1].text) : null, ce: [] };
  for (const r of t.rows.slice(2)) {
    const mm = r[0].text.match(/^([a-zñ])[).]\s*(.*)$/is);
    if (mm && r[1]) out.ce.push({ letra: mm[1].toLowerCase(), texto: mm[2].replace(/\s+/g, ' ').trim(), ponderacion: numPct(r[1].text), fundamental: !!r[0].bold });
  }
  return out;
}
// La ficha se lee entera, no solo su cabecera: lo que sale de aquí es el modelo
// con campos con nombre de motor/ficha-sa.js, que es lo que permite editar una SA
// y crear otras nuevas en lugar de solo volver a imprimir la tabla importada.
function parseFichaSA(t) {
  return fichaDeFilas(t.rows);
}
function parseClaveValor(t) {
  const pares = [];
  for (const r of t.rows) {
    const c = r.map((x) => x.text);
    if (c.length >= 3 && c[1]) { pares.push({ etiqueta: c[1], valor: c[2] }); if (c.length >= 5 && c[3]) pares.push({ etiqueta: c[3], valor: c[4] }); }
    else if (c.length === 2) pares.push({ etiqueta: c[0], valor: c[1] });
  }
  return { pares };
}
function valorTabla(cls, t) {
  const base = { filas: t.rows };
  switch (cls.tipo) {
    case 'auto.tabla_ra_ce': return { ...base, ra: raDeFilas(t.rows) };
    case 'ponderacion_ra_ce': return { ...base, ...parsePonderacion(t) };
    case 'ficha_situacion_aprendizaje': return { ...base, ...parseFichaSA(t) };
    case 'auto.ficha_modulo': case 'tabla_clave_valor': return { ...base, ...parseClaveValor(t) };
    default: return base;
  }
}

// ---------------------------------------------------------------- inferencia de campos y fusión de estructuras
function camposDe(secs) {
  // Orden: según la primera sección (base); después lo que solo aparece en otras instancias
  const campos = []; const vistos = new Map();
  const asegurar = (campo, clave) => { if (!vistos.has(clave)) { vistos.set(clave, campo); campos.push(campo); } return vistos.get(clave); };
  for (const s of secs) {
    for (const b of s.bloques) {
      if (b.type === 'table') {
        const cls = clasificarTabla(b);
        const c = asegurar({ ...cls, origen: 'tabla' }, claveTabla(cls));
        const n = s.bloques.filter((x) => x.type === 'table' && claveTabla(clasificarTabla(x)) === claveTabla(cls)).length;
        if (n > 1) c.multiple = true;
      } else asegurar({ id: 'texto', tipo: 'texto_largo', etiqueta: 'Texto', origen: 'texto' }, 'texto');
    }
  }
  // en cuántas de las secciones (instancias) aparece cada campo: ayuda a decidir qué conservar en la plantilla
  for (const c of campos) c.presencia = secs.filter((s) => (c.tipo === 'texto_largo' ? s.bloques.some((b) => b.type !== 'table') : s.bloques.some((b) => b.type === 'table' && claveTabla(clasificarTabla(b)) === claveTabla(c)))).length;
  return campos;
}
function reasignarIds(sec, de, a) {
  if (sec.id && (sec.id === de || sec.id.startsWith(de + '/'))) sec.id = a + sec.id.slice(de.length);
  sec.hijos.forEach((h) => reasignarIds(h, de, a));
}
// `vistos` es el registro de bloques que SÍ han llegado a un campo (ver «lo que no llega a ningún
// campo», abajo). Es opcional: sin él los valores salen igual, solo no se puede auditar la pérdida.
function valoresDe(campos, sec, vistos) {
  const v = {};
  for (const c of campos) {
    if (c.tipo === 'texto_largo') {
      const nodos = sec.bloques.filter((b) => b.type !== 'table');
      const bl = nodos.map((b) => (b.type === 'list' ? { type: 'list', items: b.items } : { type: 'p', text: b.text }));
      if (bl.length) { v[c.id] = bl; if (vistos) nodos.forEach((b) => vistos.add(b)); }
    } else {
      // Un campo que no es `multiple` se queda con la PRIMERA tabla de su clase: las demás no
      // llegan a ningún sitio, y por eso solo se apunta la que se usa.
      const nodos = sec.bloques.filter((b) => b.type === 'table' && claveTabla(clasificarTabla(b)) === claveTabla(c));
      if (!nodos.length) continue;
      const usados = c.multiple ? nodos : nodos.slice(0, 1);
      if (vistos) usados.forEach((b) => vistos.add(b));
      const tablas = usados.map((t) => valorTabla(c, t));
      v[c.id] = c.multiple ? tablas : tablas[0];
    }
  }
  return v;
}
const RE_ITEM = /^([a-zñ ]+?)\s*(\d+)\b/;
const prefijoDeItem = (titulo) => (norm(titulo).match(RE_ITEM) || [])[1];

// UN ÍTEM DE UNA SERIE NO CONTIENE OTRO ÍTEM DE LA MISMA SERIE.
//
// «Situación de aprendizaje 1», «... 2», «... 3» son hermanas: una serie de ítems bajo el mismo
// apartado. Si en el Word una de ellas lleva un nivel de título más alto que las siguientes —un
// «Título 4» donde las demás llevan «Título 5»—, Word las mete DENTRO de ella, y entonces la serie
// que se ve en el documento impreso (seis situaciones seguidas) no es la que tiene el árbol (una
// situación con cinco dentro). Eso no es una estructura: es un nivel mal puesto, y nadie escribe una
// situación de aprendizaje dentro de otra.
//
// Así que los ítems de una serie se recogen atravesando los ítems de esa misma serie, en el orden
// del documento. Se atraviesan SOLO los ítems: una sección que no es de la serie no se abre, porque
// entonces esto dejaría de corregir un nivel mal puesto y empezaría a adivinar qué cuelga de qué.
//
// Medido en los documentos del departamento: esto solo cambia algo en la PD de SMR de 2025-26, donde
// el módulo de Seguridad informática escribe la SA 1 con un nivel y las SA 2 a 6 con el siguiente, y
// por eso solo llegaba una de las seis.
function itemsDeSerie(sec, esItem) {
  const out = [];
  const recoger = (padre) => {
    for (const h of padre.hijos) {
      if (!esItem(h)) continue;
      out.push(h);
      recoger(h);
    }
  };
  recoger(sec);
  return out;
}
// LAS SECCIONES QUE SON ÍTEMS DE UN REPETIDOR, dentro de una sección concreta: las que `fusionar`
// apuntó al crearlo (`_items`) y las que llevan su mismo prefijo («Situación de aprendizaje 7» en un
// módulo que no estaba cuando se dedujo la plantilla). Anidadas incluidas, por lo de arriba.
const esItemDe = (repet) => {
  const p = repet._prefijo || norm(repet.titulo);
  return (x) => repet._items.includes(norm(x.titulo)) || prefijoDeItem(x.titulo) === p;
};
const itemsDelRepetidor = (repet, sec) => itemsDeSerie(sec, esItemDe(repet));
function fusionar(secs, idPadre) {
  // secs: la misma sección lógica en varias instancias (la base primero)
  const base = secs[0];
  const id = (idPadre ? idPadre + '/' : '') + slug(base.titulo);
  const orden = []; const porClave = new Map();
  for (const s of secs) for (const h of s.hijos) { const k = norm(h.titulo); if (!porClave.has(k)) { porClave.set(k, []); orden.push(k); } porClave.get(k).push(h); }
  // ítems repetidos (Situación de aprendizaje 1, 2, 3...) -> un repetidor en lugar de N secciones
  const prefijos = new Map();
  for (const k of orden) { const m = k.match(RE_ITEM); if (m) { const p = m[1].trim(); if (!prefijos.has(p)) prefijos.set(p, []); prefijos.get(p).push(k); } }
  const hijos = []; const consumidos = new Set();
  for (const k of orden) {
    if (consumidos.has(k)) continue;
    const m = k.match(RE_ITEM); const p = m && m[1].trim();
    if (p && prefijos.get(p).length >= 2) {
      const claves = prefijos.get(p); claves.forEach((x) => consumidos.add(x));
      const directos = claves.flatMap((x) => porClave.get(x));
      // Los ítems que el Word dejó DENTRO de otro ítem (ver «un ítem de una serie no contiene otro
      // ítem de la misma serie»). Van detrás de los directos y no entre ellos: lo que decide el
      // orden y el nombre de los campos de la plantilla es la serie tal como se lee en el
      // documento, y un nivel mal puesto en un módulo no tiene por qué reordenar la de todos.
      const anidados = directos.flatMap((s) => itemsDeSerie(s, (x) => prefijoDeItem(x.titulo) === p));
      const items = directos.concat(anidados);
      const etiqueta = porClave.get(claves[0])[0].titulo.replace(/\s*\d+.*$/, '').trim();
      hijos.push({ id: id + '/' + slug(etiqueta), titulo: etiqueta, repetidor: true, nivel: directos[0].nivel, campos: [{ id: 'titulo', tipo: 'texto', etiqueta: 'Título', origen: 'titulo' }, ...camposDe(items)], hijos: [], presencia: secs.length, _prefijo: p, _items: [...new Set(items.map((x) => norm(x.titulo)))] });
    } else { consumidos.add(k); hijos.push(fusionar(porClave.get(k), id)); }
  }
  return { id, titulo: base.titulo, num: base.num, nivel: base.nivel, campos: camposDe(secs), hijos, presencia: secs.length, _clave: norm(base.titulo) };
}
function extraer(plantillaSec, sec, vistos) {
  // valores de una sección concreta (instancia) según la sección canónica
  const out = {};
  const v = valoresDe(plantillaSec.campos, sec, vistos);
  if (Object.keys(v).length) out[plantillaSec.id] = v;
  for (const h of plantillaSec.hijos) {
    if (h.repetidor) {
      const items = itemsDelRepetidor(h, sec).map((x) => {
        const m = x.titulo.match(/\d+\s*[:.\-]?\s*(.*)$/s);
        return { titulo: m ? m[1].trim() : x.titulo, ...valoresDe(h.campos.filter((c) => c.origen !== 'titulo'), x, vistos) };
      });
      if (items.length) out[h.id] = { items };
    } else {
      const real = sec.hijos.find((x) => norm(x.titulo) === h._clave);
      if (real) Object.assign(out, extraer(h, real, vistos));
    }
  }
  return out;
}
const limpiarPlantilla = (s) => ({
  id: s.id, titulo: s.titulo, nivel: s.nivel,
  ...(s.repetidor ? { repetidor: true } : {}),
  ...(s.instancias ? { instancias: true, etiqueta_instancia: s.etiqueta_instancia, grupos: s.grupos } : {}),
  ...(s.presencia !== undefined ? { presencia: s.presencia } : {}),
  campos: s.campos.map(({ origen, ...c }) => c), hijos: s.hijos.map(limpiarPlantilla),
});

// ---------------------------------------------------------------- lo que no llega a ningún campo
//
// La deducción de la plantilla y la extracción de los datos son dos recorridos del MISMO árbol que
// no tienen por qué cuadrar: la plantilla se deduce fusionando las instancias y los datos se sacan
// sección por sección, así que hay sitios del documento por los que la extracción no pasa. Lo que
// hay ahí dentro no se importa y hasta ahora no se decía: una tabla que el importador RECONOCE
// —clasifica y sabe leer— podía quedarse fuera de `datos` sin una sola línea en el informe.
//
// Esto lo cuenta. Es el patrón de `filasSinCampo` e `informeDeFilas` de core/sa.js —contar con
// números y NOMBRAR lo que se pierde— pero al nivel del documento: allí son las filas de una ficha
// que no van a ningún campo de la ficha; aquí, los bloques del Word que no van a ningún campo de la
// plantilla. El motivo es el mismo: la lista de sitios por los que la extracción pasa siempre irá
// por detrás de lo que alguien escriba en su Word, y lo que no puede pasar es que la pérdida sea
// muda. Un aviso no arregla el documento, pero lo pone donde se ve en abril y no en junio.
//
// NO ENTRA EL CONTENIDO ANTERIOR AL PRIMER TÍTULO: se ignora a propósito —es portada e índice— y ya
// tiene su aviso, que dice cuántos bloques son y cuántas tablas reconocidas hay entre ellos.
const RECORTE_TABLA = 60;
const corta = (t) => (t.length > RECORTE_TABLA ? t.slice(0, RECORTE_TABLA - 1).trim() + '…' : t);
const cabeceraDe = (t) => corta(limpiar(t.rows[0].map((c) => c.text).join(' | ')).replace(/\n/g, ' '));

// Las tablas y los bloques de texto del árbol de secciones, cada uno con la ruta de títulos en la
// que está: sin la ruta, nombrar una tabla no sirve para encontrarla en el Word.
function bloquesDelArbol(raiz, incluirInicial) {
  const out = [];
  const visitar = (sec, ruta) => {
    for (const b of sec.bloques) out.push({ nodo: b, ruta });
    for (const h of sec.hijos) visitar(h, ruta.concat(h.titulo));
  };
  if (incluirInicial) for (const b of raiz.bloques) out.push({ nodo: b, ruta: ['Contenido inicial'] });
  for (const h of raiz.hijos) visitar(h, [h.titulo]);
  return out;
}

// CÓMO SE NOMBRA UNA TABLA PERDIDA: con la etiqueta con la que el importador la ha reconocido, su
// tamaño —que es lo que distingue dos tablas seguidas con la misma cabecera—, su cabecera y la ruta
// de títulos donde está. Sin la ruta, nombrarla no sirve para encontrarla en el Word.
function nombraTabla(x) {
  const cls = clasificarTabla(x.nodo);
  const filas = x.nodo.rows.length;
  const columnas = Math.max(...x.nodo.rows.map((r) => r.length));
  const cabecera = cabeceraDe(x.nodo);
  const ruta = x.ruta.join(' › ');
  return {
    tipo: cls.tipo,
    etiqueta: cls.etiqueta,
    reconocida: esReconocida(cls),
    cabecera,
    filas,
    columnas,
    ruta,
    nombre: `«${cls.etiqueta}» (${filas}×${columnas}, «${cabecera}») en «${ruta}»`,
  };
}

// Y UN BLOQUE DE TEXTO, por su sitio y su comienzo: no tiene cabecera con la que nombrarlo.
const nombraTexto = (x) => ({
  tipo: x.nodo.type,
  ruta: x.ruta.join(' › '),
  inicio: corta(limpiar(x.nodo.type === 'list' ? (x.nodo.items[0] || {}).text || '' : x.nodo.text).replace(/\n/g, ' ')),
});

// «la 13, la 14 y la 15»: la coma hasta el último, que va con «y». Igual que en core/sa.js.
function enLista(partes) {
  if (!partes.length) return '';
  if (partes.length === 1) return partes[0];
  return partes.slice(0, -1).join(', ') + ' y ' + partes[partes.length - 1];
}

// Cuántas se nombran en el aviso. Las listas enteras están siempre en `informe.tablasSinCampo` y
// `informe.textosSinCampo`: el tope es para que un documento con cien tablas descolocadas no deje un
// aviso que nadie va a leer.
const TOPE_NOMBRADAS = 12;
const cuantos = (n, uno, varios) => (n === 1 ? '1 ' + uno : n + ' ' + varios);
const topado = (lista, pie) => enLista(lista.slice(0, TOPE_NOMBRADAS))
  + (lista.length > TOPE_NOMBRADAS ? `, y ${lista.length - TOPE_NOMBRADAS} ${pie}` : '');

// EL AVISO. Dice el número y nombra: las tablas una por una, y el texto por los sitios en los que
// está, que es lo único con lo que se puede buscar un párrafo. Se cuentan las tablas RECONOCIDAS
// aparte porque son las que el importador sabía leer: perder una de esas no es que el documento
// traiga una rejilla rara, es que se ha quedado fuera contenido que la herramienta entiende.
function avisoSinCampo(tablas, textos) {
  if (!tablas.length && !textos.length) return null;
  const sujeto = [];
  if (tablas.length) sujeto.push(cuantos(tablas.length, 'tabla', 'tablas'));
  if (textos.length) sujeto.push(cuantos(textos.length, 'bloque de texto', 'bloques de texto'));
  let aviso = enLista(sujeto) + (tablas.length + textos.length === 1 ? ' no llega' : ' no llegan')
    + ' a ningún campo de la plantilla, así que su contenido NO está en los datos.';
  if (tablas.length) {
    const n = tablas.filter((t) => t.reconocida).length;
    const cuales = n === 0 ? 'ninguna reconocida por su cabecera'
      : n === tablas.length ? (tablas.length === 1 ? 'reconocida por su cabecera' : 'todas reconocidas por su cabecera')
        : `${n} de ellas reconocidas por su cabecera`;
    aviso += ` ${tablas.length === 1 ? 'La tabla' : 'Las tablas'} (${cuales}): `
      + topado(tablas.map((t) => t.nombre), 'más') + '.';
  }
  if (textos.length) {
    const rutas = [...new Set(textos.map((x) => x.ruta))];
    aviso += ` El texto está en ${topado(rutas.map((r) => `«${r}»`), 'sitios más')}.`;
  }
  return aviso;
}

// ------------------------------------------------- títulos por nivel de esquema
// mammoth reconoce los títulos por el NOMBRE del estilo («heading 1»), y eso
// depende del idioma y del editor con el que se escribió el documento: en un
// Word en español se llaman «Título 1», y si viene de LibreOffice, «Título 1
// (user)». Una de las memorias del departamento tiene sus 43 títulos con esos
// estilos y entraba entera como UN SOLO apartado, mientras la del curso
// siguiente, con los mismos apartados pero escrita en otro editor, daba 44.
//
// El dato bueno es el nivel de esquema (`w:outlineLvl` del estilo en
// styles.xml): es lo que Word usa para construir el índice, y no depende del
// nombre ni del idioma. De ahí se arma el mapa de estilos que mammoth necesita.
// Si el documento no declara ninguno, se queda el comportamiento de siempre.
// Las partes del .docx que hacen falta, leídas de una vez. Devuelve null si no se
// puede abrir —un fichero que no es un zip, una ruta que no existe—: el
// importador sigue entonces con el comportamiento por omisión de mammoth.
async function partesDocx(input, nombres) {
  let buffer = input && input.buffer;
  if (!buffer && input && input.path) {
    try { buffer = await fs.promises.readFile(input.path); } catch (e) { return null; }
  }
  if (!buffer) return null;
  try {
    const zip = await JSZip.loadAsync(buffer);
    const out = {};
    for (const n of nombres) { const parte = zip.file(n); out[n] = parte ? await parte.async('string') : null; }
    return out;
  } catch (e) {
    return null;
  }
}

// styles.xml -> los estilos de párrafo que declara, por su styleId. `nivel` es el
// nivel de esquema ya en forma de hN (1..9), o null si el estilo no declara ninguno.
function estilosDeParrafo(styles) {
  const out = new Map();
  for (const m of String(styles || '').matchAll(/<w:style\b([^>]*)>([\s\S]*?)<\/w:style>/g)) {
    if (!/w:type="paragraph"/.test(m[1])) continue;
    const id = (m[1].match(/w:styleId="([^"]+)"/) || [])[1];
    if (!id) continue;
    const nombre = (m[2].match(/<w:name\s+w:val="([^"]+)"/) || [])[1] || null;
    const nivel = (m[2].match(/<w:outlineLvl\s+w:val="(\d+)"/) || [])[1];
    out.set(id, {
      id,
      nombre,
      nivel: nivel === undefined ? null : Number(nivel) + 1,
      // el estilo base del documento (casi siempre «Normal»): el texto corriente
      porDefecto: /w:default="(?:1|true|on)"/.test(m[1]),
    });
  }
  return out;
}

// Una regla del mapa de estilos de mammoth. Por styleId cuando se puede
// (`p.Estilo1`): es lo que lleva escrito cada párrafo y no se repite entre
// estilos. Su gramática solo admite letras, dígitos, guión y subrayado, así que
// un id con acentos se expresa por el nombre visible; y el nombre va entre
// comillas simples, así que uno que las lleve dentro no se puede expresar.
function reglaDeEstilo(estilo, h) {
  if (h < 1 || h > 6) return null;
  if (/^[A-Za-z_-][A-Za-z0-9_-]*$/.test(estilo.id)) return 'p.' + estilo.id + ' => h' + h + ':fresh';
  if (estilo.nombre && estilo.nombre.indexOf("'") < 0) return "p[style-name='" + estilo.nombre + "'] => h" + h + ":fresh";
  return null;
}

// El mapa de siempre: un estilo con nivel de esquema es un título de ese nivel.
// Va por NOMBRE y no por styleId porque es así como lo hace mammoth por omisión y
// porque es el camino por el que pasan todos los documentos que ya entran bien.
function reglasDeNivelDeEsquema(estilos) {
  const reglas = [];
  const vistos = new Set();
  for (const e of estilos.values()) {
    if (!e.nombre || e.nivel === null) continue;
    // El nombre va entre comillas simples en el mapa de mammoth, así que uno que
    // las lleve dentro no se puede expresar; y más de seis niveles no hay.
    if (e.nivel < 1 || e.nivel > 6 || e.nombre.indexOf("'") >= 0 || vistos.has(e.nombre)) continue;
    vistos.add(e.nombre);
    reglas.push("p[style-name='" + e.nombre + "'] => h" + e.nivel + ":fresh");
  }
  return reglas;
}

// ------------------------------------------------- respaldo: el índice del documento
// Hay documentos cuyos apartados numerados están escritos con estilos PROPIOS
// —`Estilo1`, `Estilo3` y `Estilo4` en los dos PCCF del departamento— que no
// declaran nivel de esquema: ni Word los considera títulos, así que arriba no hay
// nada que leer y el documento entero entra como un solo apartado.
//
// Pero esos documentos llevan dentro su propia TABLA DE CONTENIDOS, y ahí sí está
// la estructura: una entrada por apartado, con su nivel. Así que cuando la
// deducción normal se queda sin tronco se busca el índice, se mira con qué estilo
// está escrito en el cuerpo el párrafo de cada entrada, y esos estilos se
// promueven a título del nivel que diga el índice. El documento dice cuál es su
// estructura; solo que en el índice en vez de en los estilos.
//
// Es un RESPALDO y no el camino normal porque adivinar la estructura es peor que
// no deducirla: una estructura inventada no se nota al importar, se nota en junio
// al exportar. De ahí las condiciones de `titulosDelIndice`.

// Los estilos de entrada de índice son los built-in de Word, nueve niveles, y su
// nombre cambia con el idioma del editor: `toc 1` es el nombre interno —lo que
// Word escribe en `w:name` aunque el documento esté en otro idioma—, mientras el
// styleId se localiza: `TDC1` en español, `IDC1` en los documentos en valenciano
// de LibreOffice, `TM1` en francés. El patrón es siempre el mismo —una palabra de
// índice y el número de nivel—, así que se busca eso en el nombre Y en el
// styleId, y no una lista cerrada de estilos conocidos.
const PALABRAS_DE_INDICE = new Set([
  'toc', 'tdc', 'idc', 'tm', 'tdm', 'toi',
  'indice', 'index', 'contents', 'tableofcontents', 'contenido', 'contenidos',
  'contingut', 'continguts', 'taula', 'sumario', 'sumari', 'summary',
  'tabledesmatieres', 'tablesdesmatieres', 'sommaire', 'matieres',
  'inhalt', 'inhaltsverzeichnis', 'verzeichnis', 'innehall', 'indholdsfortegnelse',
]);
const clave = (t) => sinAcentos(String(t || '')).toLowerCase().replace(/[^a-z0-9]+/g, '');
function nivelDeIndice(estilo) {
  for (const etiqueta of [estilo.nombre, estilo.id]) {
    const m = clave(etiqueta).match(/^([a-z]+)([1-9])$/);
    if (m && PALABRAS_DE_INDICE.has(m[1])) return Number(m[2]);
  }
  return null;
}

// La entrada del índice lleva pegado el número de página, y delante de él puntos
// de relleno o el tabulador que los sustituye: «0. Introducción3»,
// «1. Identificación del ciclo formativo3». Se compara por las dos formas —con y
// sin esa cola— para no estropear un título que de verdad acaba en un número
// («Anexo 2» en la página 7 llega como «Anexo 27»).
const COLA_DE_PAGINA = /[\s.·…_\- ]*\d+\s*$/;
const clavesDeEntrada = (t) => {
  const con = norm(t);
  const sin = norm(String(t).replace(COLA_DE_PAGINA, ''));
  return sin && sin !== con ? [con, sin] : [con];
};

// document.xml -> los párrafos del documento, con su estilo y su texto, en orden.
// Se lee a mano y no del HTML de mammoth porque lo que hace falta aquí es justo lo
// que el HTML ya ha perdido: con qué estilo está escrito cada párrafo. Lleva una
// pila porque un párrafo puede contener otro (un cuadro de texto), y los párrafos
// de dentro de una tabla cuentan como cualquier otro: un estilo que se use
// también ahí no es un estilo de título y conviene que se note.
function parrafosDeXml(xml) {
  const out = [];
  const pila = [];
  const re = /<w:p(?=[ />])[^>]*?(\/?)>|<\/w:p>|<w:pStyle\b[^>]*?w:val="([^"]*)"[^>]*?\/?>|<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*?\/?>/g;
  let m;
  while ((m = re.exec(String(xml || '')))) {
    if (m[0].startsWith('</w:p')) { const p = pila.pop(); if (p) out.push(p); continue; }
    if (m[2] === undefined && m[3] === undefined && m[0].startsWith('<w:p')) {
      if (m[1] === '/') out.push({ estilo: '', texto: '' }); else pila.push({ estilo: '', texto: '' });
      continue;
    }
    const act = pila[pila.length - 1];
    if (!act) continue;
    if (m[2] !== undefined) { if (!act.estilo) act.estilo = m[2]; continue; }
    act.texto += m[3] === undefined ? ' ' : m[3];
  }
  return out;
}

// CON QUÉ CONDICIONES. Son cuatro, y las cuatro miden lo mismo: que el índice
// describa de verdad el documento y que no se esté adivinando nada.
//
//   1. hay un índice reconocible y sus entradas llegan a MIN_ENTRADAS: con dos
//      entradas, que casen no dice nada;
//   2. una proporción alta de las entradas (PROPORCION) casa con un párrafo del
//      cuerpo. Un índice viejo que ya no describe el documento no casa, y
//      entonces no se toca nada;
//   3. cada estilo candidato se usa EN EXCLUSIVA para esos títulos
//      (EXCLUSIVIDAD): si un estilo tiene veinte párrafos con texto y solo cuatro
//      son entradas del índice, es un estilo de texto corriente y no de título.
//      Esta es la condición que impide que «Normal» —que casa con las entradas
//      del índice que no son títulos— se lleve por delante el documento entero;
//   4. y de todo eso sale al menos un título de primer nivel. Un árbol al que le
//      falta el tronco es lo que ya había, no una mejora.
//
// Los párrafos vacíos no cuentan como uso de un estilo: no producen nada en el
// HTML, así que no pueden convertirse en un título. En los PCCF `Estilo3` tiene
// 21 párrafos, de los que 8 están vacíos; los 13 con texto son los 13 títulos de
// segundo nivel del índice.
const MIN_ENTRADAS = 3;
const PROPORCION = 0.8;
const EXCLUSIVIDAD = 0.8;
function titulosDelIndice(styles, documentXml) {
  const estilos = estilosDeParrafo(styles);
  const nivelPorEstilo = new Map();
  for (const e of estilos.values()) { const n = nivelDeIndice(e); if (n) nivelPorEstilo.set(e.id, n); }
  if (!nivelPorEstilo.size) return null;

  const entradas = [];
  const usos = new Map();     // styleId -> párrafos con texto que lo usan
  const porClave = new Map(); // texto normalizado del cuerpo -> estilos con los que aparece
  for (const p of parrafosDeXml(documentXml)) {
    const texto = limpiar(p.texto);
    if (!texto) continue;
    const nivel = nivelPorEstilo.get(p.estilo);
    // de los nueve niveles del índice solo seis se pueden expresar como título;
    // los más profundos no cuentan ni a favor ni en contra.
    if (nivel) { if (nivel <= 6) entradas.push({ nivel, texto }); continue; }
    usos.set(p.estilo, (usos.get(p.estilo) || 0) + 1);
    const k = norm(texto);
    if (!k) continue;
    if (!porClave.has(k)) porClave.set(k, new Set());
    porClave.get(k).add(p.estilo);
  }
  if (entradas.length < MIN_ENTRADAS) return null;

  const votos = new Map(); // styleId -> Map(nivel -> nº de entradas del índice)
  let casadas = 0;
  for (const e of entradas) {
    const ids = new Set();
    for (const k of clavesDeEntrada(e.texto)) for (const id of porClave.get(k) || []) ids.add(id);
    if (!ids.size) continue;
    casadas += 1;
    for (const id of ids) {
      if (!votos.has(id)) votos.set(id, new Map());
      const m = votos.get(id);
      m.set(e.nivel, (m.get(e.nivel) || 0) + 1);
    }
  }
  if (casadas / entradas.length < PROPORCION) return null;

  const candidatos = [];
  for (const [id, niveles] of votos) {
    const estilo = estilos.get(id);
    // un estilo que ya declara nivel de esquema ya es un título, y el estilo base
    // del documento es el texto corriente: ni uno ni otro se promueven.
    if (!estilo || estilo.nivel !== null || estilo.porDefecto) continue;
    const titulos = [...niveles.values()].reduce((a, b) => a + b, 0);
    if (titulos / (usos.get(id) || titulos) < EXCLUSIVIDAD) continue;
    // si el índice le da dos niveles distintos manda el más repetido y, en
    // empate, el más alto.
    const nivel = [...niveles.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
    const regla = reglaDeEstilo(estilo, nivel);
    if (regla) candidatos.push({ estilo: id, nombre: estilo.nombre, nivel, titulos, usos: usos.get(id) || titulos, regla });
  }
  if (!candidatos.some((c) => c.nivel === 1)) return null;

  candidatos.sort((a, b) => a.nivel - b.nivel || b.titulos - a.titulos);
  return { entradas: entradas.length, casadas, estilos: candidatos, reglas: candidatos.map((c) => c.regla) };
}

// ---------------------------------------------------------------- importación completa
const convertir = async (input, styleMap) => {
  const { value: html, messages } = await mammoth.convertToHtml(input, styleMap.length ? { styleMap } : undefined);
  return { messages, nodos: htmlANodos(html) };
};
const cuantosTitulos = (nodos, nivel) => nodos.filter((n) => n.type === 'h' && (!nivel || n.level === nivel)).length;

// La lectura del Word hasta tener los nodos, con el respaldo del índice si hace falta. Aparte para que
// quien solo necesite las tablas (scripts/medir-tablas.js) lea el documento exactamente como lo lee
// el importador.
async function leerNodos(input) {
  const partes = await partesDocx(input, ['word/styles.xml']);
  const styles = partes && partes['word/styles.xml'];
  const styleMap = reglasDeNivelDeEsquema(estilosDeParrafo(styles));
  let leido = await convertir(input, styleMap);

  // EL RESPALDO DEL ÍNDICE se dispara solo cuando la deducción normal no ha
  // encontrado NI UN título de primer nivel, que es la forma que tiene un
  // documento sin estructura legible: o no hay títulos —el PCCF de SMR, cero— o
  // los que hay cuelgan de la nada —el de DAW, nueve de cuarto y quinto nivel—.
  // Un documento que ya trae su primer nivel no pasa por aquí, y eso es lo que
  // garantiza que esto no pueda cambiar el resultado de nada que ya se importara
  // bien: la PD y las memorias traen entre cinco y diez títulos de primer nivel.
  let indice = null;
  if (!cuantosTitulos(leido.nodos, 1)) {
    // document.xml se lee AQUÍ y no arriba: en la PD son dos megas de XML que no
    // hacen falta para nada por el camino normal.
    const cuerpo = await partesDocx(input, ['word/document.xml']);
    const hallado = cuerpo && cuerpo['word/document.xml']
      ? titulosDelIndice(styles, cuerpo['word/document.xml'])
      : null;
    if (hallado) {
      // las reglas nuevas van delante: en mammoth gana la primera que encaja.
      const segundo = await convertir(input, hallado.reglas.concat(styleMap));
      // y aun así solo se acepta si de verdad mejora: con su primer nivel y con
      // más títulos que antes.
      if (cuantosTitulos(segundo.nodos, 1) && cuantosTitulos(segundo.nodos) > cuantosTitulos(leido.nodos)) {
        leido = segundo;
        indice = hallado;
      }
    }
  }

  return { leido, indice };
}

async function importarDocx(input, opts = {}) {
  const { leido, indice } = await leerNodos(input);
  const { messages, nodos } = leido;
  const raiz = construirArbol(nodos);
  const avisos = [];
  if (raiz.bloques.length && !opts.incluirInicial) {
    // Cuántas de esas tablas RECONOCE el importador, y no solo cuántos bloques son: una tabla
    // reconocida antes del primer título es contenido real escrito fuera de todo apartado, y que se
    // ignore a propósito no quita que haya que decirlo.
    const reconocidas = raiz.bloques.filter((b) => b.type === 'table' && esReconocida(clasificarTabla(b)));
    avisos.push(`${raiz.bloques.length} bloques antes del primer título (portada o índice); se ignoran.`
      + (reconocidas.length
        ? ` Entre ellos ${reconocidas.length === 1 ? 'hay 1 tabla reconocida' : 'hay ' + reconocidas.length + ' tablas reconocidas'}`
          + `, que tampoco se importan: ${enLista(reconocidas.slice(0, TOPE_NOMBRADAS).map((b) => `«${clasificarTabla(b).etiqueta}» («${cabeceraDe(b)}»)`))}`
          + `${reconocidas.length > TOPE_NOMBRADAS ? ', y ' + (reconocidas.length - TOPE_NOMBRADAS) + ' más' : ''}.`
        : ''));
  }
  // Que la estructura venga del índice y no de los estilos no es un error, pero
  // sí algo que quien sube el fichero tiene que saber: lo que se ha importado
  // depende de que el índice del Word esté al día.
  if (indice) {
    avisos.push(`La estructura se ha deducido del ÍNDICE del documento: sus apartados están escritos con estilos `
      + `propios que no declaran nivel de esquema (${indice.estilos.map((e) => `${e.nombre || e.estilo} → nivel ${e.nivel}`).join(', ')}). `
      + `${indice.casadas} de ${indice.entradas} entradas del índice casan con un párrafo del cuerpo. `
      + `Si el índice no estuviera al día, lo importado tampoco lo estará.`);
  }

  // 1) grupos de instancias en el primer nivel (p. ej. "Módulos del primer curso" + "... segundo curso")
  const grupos = [];
  for (const s of raiz.hijos) { const g = detectarGrupo(s); if (g) grupos.push({ seccion: s, ...g }); }
  // fusionar grupos compatibles entre sí
  const familias = [];
  for (const g of grupos) {
    const fam = familias.find((f) => similitud(firma(f.grupos[0].base), firma(g.base)) >= 0.5);
    if (fam) fam.grupos.push(g); else familias.push({ grupos: [g] });
  }

  const secciones = []; const documento = {}; const instanciasOut = [];
  // Los bloques del Word que han llegado a un campo, para saber al final cuáles no (ver «lo que no
  // llega a ningún campo»).
  const vistos = new Set();
  // Contenido anterior al primer título. En la PD es portada e índice y se
  // ignora, pero hay documentos (los PCCF) en los que el cuerpo entero va antes
  // del primer título porque los apartados están escritos como párrafos
  // numerados, no con estilos de título. Con `incluirInicial` se conserva como
  // una sección más en lugar de perderlo; sus tablas (empresas, competencias)
  // pasan así por el saneador.
  if (opts.incluirInicial && raiz.bloques.length) {
    const inicial = { nivel: 1, titulo: 'Contenido inicial', num: null, bloques: raiz.bloques, hijos: [] };
    const can = fusionar([inicial], '');
    can.id = 'contenido-inicial';
    can.titulo = 'Contenido inicial';
    secciones.push(can);
    Object.assign(documento, extraer(can, inicial, vistos));
  }
  for (const s of raiz.hijos) {
    const fam = familias.find((f) => f.grupos.some((g) => g.seccion === s));
    if (!fam) {
      const can = fusionar([s]);
      secciones.push(can);
      Object.assign(documento, extraer(can, s, vistos));
      continue;
    }
    if (fam.emitida) continue;
    fam.emitida = true;
    const instancias = fam.grupos.flatMap((g) => g.instancias.map((i) => ({ sec: i, grupo: g.seccion.titulo })));
    const base = fam.grupos[0].base;
    const ordenadas = [base, ...instancias.map((i) => i.sec).filter((x) => x !== base)];
    const can = fusionar(ordenadas, '');
    const etiqueta = fam.grupos.length > 1 ? 'Módulos' : s.titulo;
    const repetId = slug(etiqueta);
    reasignarIds(can, can.id, repetId);
    const repet = { id: repetId, titulo: etiqueta, nivel: s.nivel, instancias: true, etiqueta_instancia: 'módulo', grupos: fam.grupos.map((g) => g.seccion.titulo), campos: [], hijos: can.hijos, presencia: instancias.length };
    secciones.push(repet);
    for (const { sec, grupo } of instancias) instanciasOut.push({ titulo: sec.titulo, num: sec.num, grupo, docentes: [], valores: extraer({ ...can, id: repetId, campos: [] }, sec, vistos) });
    // secciones del grupo no instanciadas (hijos sin subsecciones) se avisan
    for (const g of fam.grupos) for (const h of g.seccion.hijos) if (!g.instancias.includes(h)) avisos.push(`"${h.titulo}" dentro de "${g.seccion.titulo}" no tiene la estructura de módulo y se ha ignorado.`);
  }

  // LO QUE SE HA QUEDADO FUERA. Se mide aquí, cuando ya está extraído todo, comparando los bloques
  // del árbol con los que han llegado a un campo. El aviso va con los demás: quien sube el fichero
  // lee una sola lista.
  const fuera = bloquesDelArbol(raiz, opts.incluirInicial).filter((x) => !vistos.has(x.nodo));
  const tablasSinCampo = fuera.filter((x) => x.nodo.type === 'table').map(nombraTabla);
  const textosSinCampo = fuera.filter((x) => x.nodo.type !== 'table').map(nombraTexto);
  const aviso = avisoSinCampo(tablasSinCampo, textosSinCampo);
  if (aviso) avisos.push(aviso);

  // informe
  const cuenta = { secciones: 0, campos: {}, repetidores: 0 };
  const recorrer = (s) => { cuenta.secciones += 1; if (s.repetidor) cuenta.repetidores += 1; for (const c of s.campos) cuenta.campos[c.tipo] = (cuenta.campos[c.tipo] || 0) + 1; s.hijos.forEach(recorrer); };
  secciones.forEach(recorrer);
  const plantilla = { tipo: opts.tipo || 'programacion_didactica', origen: opts.origen || null, version: opts.version || null, generada: new Date().toISOString(), secciones: secciones.map(limpiarPlantilla) };
  // permisos por defecto: lo común lo edita el jefe de departamento; cada módulo, sus docentes (ver motor/permisos.js)
  for (const s of plantilla.secciones) s.edita = s.instancias ? 'docentes_del_modulo' : 'jefe_departamento';
  const datos = { departamento: opts.departamento || null, documento, instancias: instanciasOut, asignaciones: {} };
  // 2) textos repetidos en varios módulos o copiados de la parte común -> una sola vez, referenciados (ver motor/compartidos.js)
  const compartidos = opts.compartidos === false ? [] : extraerCompartidos(datos, opts.compartidos || {});
  const informe = {
    nodos: nodos.length, titulos: nodos.filter((n) => n.type === 'h').length, tablas: nodos.filter((n) => n.type === 'table').length,
    secciones: cuenta.secciones, repetidores: cuenta.repetidores, camposPorTipo: cuenta.campos,
    instancias: instanciasOut.map((i) => `${i.grupo} › ${i.titulo}`), compartidos, avisos, mensajesMammoth: messages.length,
    // Las tablas del documento que no han llegado a ningún campo, con nombre y sitio, y cuántos
    // bloques de texto se han quedado fuera con ellas. La lista va entera aunque el aviso tope.
    tablasSinCampo, textosSinCampo,
    // null salvo cuando ha hecho falta el respaldo del índice; entonces, de dónde
    // ha salido la estructura y con cuánto apoyo.
    indice: indice ? { entradas: indice.entradas, casadas: indice.casadas, estilos: indice.estilos.map(({ regla, ...e }) => e) } : null,
  };
  return { plantilla, datos, informe };
}

module.exports = { importarDocx, leerNodos, clasificarTabla, norm, slug };
