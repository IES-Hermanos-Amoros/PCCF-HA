// Importador de Word (.docx): deduce la ESTRUCTURA del documento (plantilla) y extrae su CONTENIDO (datos)
// en una sola pasada. Sin IA: estilos de título, numeración, tablas y cabeceras conocidas.
//
//   const { importarDocx } = require('./importar-docx');
//   const { plantilla, datos, informe } = await importarDocx({ path: 'PD.docx' });
//
// Todo JavaScript puro (mammoth + node-html-parser): apto para una función serverless.

const mammoth = require('mammoth');
const { parse } = require('node-html-parser');
const { extraerCompartidos } = require('./compartidos');

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

// ---------------------------------------------------------------- extracción estructurada de tablas conocidas
const lineas = (t) => String(t || '').split('\n').map((x) => x.trim()).filter(Boolean);
const numPct = (t) => { const m = String(t || '').replace(',', '.').match(/-?\d+(?:\.\d+)?/); return m ? Number(m[0]) : null; };

function parseRaCe(t) {
  const ra = [];
  for (const r of t.rows.slice(1)) {
    if (r.length < 2) continue;
    const m = r[0].text.match(/^(\d+)[.)]?\s*(.*)$/s);
    const ce = [];
    // un criterio puede empezar en la misma línea que el anterior: se separa también por "x) "
    for (const l of lineas(r[1].text).flatMap((x) => x.split(/\s+(?=[a-zñ]\)\s)/))) {
      const mm = l.match(/^(?:RA\d+[.\s]*)?([a-zñ])[).]\s*(.*)$/i);
      if (mm) ce.push({ letra: mm[1].toLowerCase(), texto: mm[2].trim() });
      else if (ce.length) ce[ce.length - 1].texto += ' ' + l;
    }
    ra.push({ num: m ? Number(m[1]) : ra.length + 1, texto: (m ? m[2] : r[0].text).trim(), ce });
  }
  return { ra };
}
function parsePonderacion(t) {
  const m = t.rows[0][0].text.match(/\.(\d+)\)/);
  const out = { ra: m ? Number(m[1]) : null, texto: (t.rows[1] && t.rows[1][0].text) || '', ponderacion: t.rows[1] ? numPct(t.rows[1][1] && t.rows[1][1].text) : null, ce: [] };
  for (const r of t.rows.slice(2)) {
    const mm = r[0].text.match(/^([a-zñ])[).]\s*(.*)$/is);
    if (mm && r[1]) out.ce.push({ letra: mm[1].toLowerCase(), texto: mm[2].replace(/\s+/g, ' ').trim(), ponderacion: numPct(r[1].text), fundamental: !!r[0].bold });
  }
  return out;
}
function parseFichaSA(t) {
  const g = (i, j = 0) => (t.rows[i] && t.rows[i][j] ? t.rows[i][j].text : '');
  const num = (g(0).match(/(\d+)/) || [])[1];
  const celdaEtiqueta = (etq) => { for (const r of t.rows) for (let j = 0; j < r.length; j++) if (norm(r[j].text) === etq && r[j + 1]) return r[j + 1].text; return ''; };
  const raTexto = (() => { for (const r of t.rows) if (norm(r[0].text).startsWith('resultado') && r[1]) return r[1].text; return ''; })();
  return {
    num: num ? Number(num) : null, titulo: g(0, 1), sesiones: numPct(celdaEtiqueta('sesiones')), evaluacion: celdaEtiqueta('evaluacion'),
    ra: [...raTexto.matchAll(/(?:^|\n)\s*(?:RA\s*)?(\d+)\s*[.):-]/gi)].map((x) => Number(x[1])),
  };
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
    case 'auto.tabla_ra_ce': return { ...base, ...parseRaCe(t) };
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
function valoresDe(campos, sec) {
  const v = {};
  for (const c of campos) {
    if (c.tipo === 'texto_largo') { const bl = sec.bloques.filter((b) => b.type !== 'table').map((b) => (b.type === 'list' ? { type: 'list', items: b.items } : { type: 'p', text: b.text })); if (bl.length) v[c.id] = bl; }
    else {
      const tablas = sec.bloques.filter((b) => b.type === 'table' && claveTabla(clasificarTabla(b)) === claveTabla(c)).map((t) => valorTabla(c, t));
      if (tablas.length) v[c.id] = c.multiple ? tablas : tablas[0];
    }
  }
  return v;
}
const RE_ITEM = /^([a-zñ ]+?)\s*(\d+)\b/;
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
      const items = claves.flatMap((x) => porClave.get(x));
      const etiqueta = porClave.get(claves[0])[0].titulo.replace(/\s*\d+.*$/, '').trim();
      hijos.push({ id: id + '/' + slug(etiqueta), titulo: etiqueta, repetidor: true, nivel: items[0].nivel, campos: [{ id: 'titulo', tipo: 'texto', etiqueta: 'Título', origen: 'titulo' }, ...camposDe(items)], hijos: [], presencia: secs.length, _items: claves });
    } else { consumidos.add(k); hijos.push(fusionar(porClave.get(k), id)); }
  }
  return { id, titulo: base.titulo, num: base.num, nivel: base.nivel, campos: camposDe(secs), hijos, presencia: secs.length, _clave: norm(base.titulo) };
}
function extraer(plantillaSec, sec) {
  // valores de una sección concreta (instancia) según la sección canónica
  const out = {};
  const v = valoresDe(plantillaSec.campos, sec);
  if (Object.keys(v).length) out[plantillaSec.id] = v;
  for (const h of plantillaSec.hijos) {
    if (h.repetidor) {
      const items = sec.hijos.filter((x) => h._items.includes(norm(x.titulo)) || (norm(x.titulo).match(RE_ITEM) || [])[1] === norm(h.titulo)).map((x) => {
        const m = x.titulo.match(/\d+\s*[:.\-]?\s*(.*)$/s);
        return { titulo: m ? m[1].trim() : x.titulo, ...valoresDe(h.campos.filter((c) => c.origen !== 'titulo'), x) };
      });
      if (items.length) out[h.id] = { items };
    } else {
      const real = sec.hijos.find((x) => norm(x.titulo) === h._clave);
      if (real) Object.assign(out, extraer(h, real));
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

// ---------------------------------------------------------------- importación completa
async function importarDocx(input, opts = {}) {
  const { value: html, messages } = await mammoth.convertToHtml(input);
  const nodos = htmlANodos(html);
  const raiz = construirArbol(nodos);
  const avisos = [];
  if (raiz.bloques.length) avisos.push(`${raiz.bloques.length} bloques antes del primer título (portada o índice); se ignoran.`);

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
  for (const s of raiz.hijos) {
    const fam = familias.find((f) => f.grupos.some((g) => g.seccion === s));
    if (!fam) {
      const can = fusionar([s]);
      secciones.push(can);
      Object.assign(documento, extraer(can, s));
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
    for (const { sec, grupo } of instancias) instanciasOut.push({ titulo: sec.titulo, num: sec.num, grupo, docentes: [], valores: extraer({ ...can, id: repetId, campos: [] }, sec) });
    // secciones del grupo no instanciadas (hijos sin subsecciones) se avisan
    for (const g of fam.grupos) for (const h of g.seccion.hijos) if (!g.instancias.includes(h)) avisos.push(`"${h.titulo}" dentro de "${g.seccion.titulo}" no tiene la estructura de módulo y se ha ignorado.`);
  }

  // informe
  const cuenta = { secciones: 0, campos: {}, repetidores: 0 };
  const recorrer = (s) => { cuenta.secciones += 1; if (s.repetidor) cuenta.repetidores += 1; for (const c of s.campos) cuenta.campos[c.tipo] = (cuenta.campos[c.tipo] || 0) + 1; s.hijos.forEach(recorrer); };
  secciones.forEach(recorrer);
  const plantilla = { tipo: opts.tipo || 'programacion_didactica', origen: opts.origen || null, version: opts.version || null, generada: new Date().toISOString(), secciones: secciones.map(limpiarPlantilla) };
  // permisos por defecto: lo común lo edita el jefe de departamento; cada módulo, sus docentes (ver lib/permisos.js)
  for (const s of plantilla.secciones) s.edita = s.instancias ? 'docentes_del_modulo' : 'jefe_departamento';
  const datos = { departamento: opts.departamento || null, documento, instancias: instanciasOut, asignaciones: {} };
  // 2) textos repetidos en varios módulos o copiados de la parte común -> una sola vez, referenciados (ver lib/compartidos.js)
  const compartidos = opts.compartidos === false ? [] : extraerCompartidos(datos, opts.compartidos || {});
  const informe = {
    nodos: nodos.length, titulos: nodos.filter((n) => n.type === 'h').length, tablas: nodos.filter((n) => n.type === 'table').length,
    secciones: cuenta.secciones, repetidores: cuenta.repetidores, camposPorTipo: cuenta.campos,
    instancias: instanciasOut.map((i) => `${i.grupo} › ${i.titulo}`), compartidos, avisos, mensajesMammoth: messages.length,
  };
  return { plantilla, datos, informe };
}

module.exports = { importarDocx, norm, slug };
