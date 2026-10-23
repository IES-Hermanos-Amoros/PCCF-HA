// Generador genérico: pinta cualquier plantilla deducida por el importador con sus datos (pdfmake, sin navegador).
// Los tipos de campo reconocidos (RA/CE, ponderaciones, fichas de situación de aprendizaje, ficha del módulo)
// tienen un pintado propio con comprobaciones; el resto se pinta de forma genérica respetando celdas combinadas.

const AZUL = '#1F3864', AZUL_CLARO = '#D9E2F3', GRIS = '#666666', GRIS_BORDE = '#BFBFBF', GRIS_FONDO = '#F2F2F2', ROJO = '#C00000', VERDE = '#2E7D32';
const layout = {
  hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => GRIS_BORDE, vLineColor: () => GRIS_BORDE,
  paddingLeft: () => 4, paddingRight: () => 4, paddingTop: () => 3, paddingBottom: () => 3,
};
const th = (text, extra = {}) => ({ text, bold: true, fillColor: AZUL_CLARO, ...extra });
const label = (text, extra = {}) => ({ text, bold: true, fillColor: GRIS_FONDO, ...extra });
const pct = (n) => (n === undefined || n === null ? '' : `${Number(n).toLocaleString('es-ES', { maximumFractionDigits: 2 })} %`);
const para = (text, extra = {}) => ({ text, margin: [0, 0, 0, 6], alignment: 'justify', ...extra });

function nestedList(items) {
  const root = []; const stack = [{ level: 0, list: root }];
  for (const it of items) {
    const level = Math.max(0, it.level || 0);
    while (stack.length > 1 && stack[stack.length - 1].level > level) stack.pop();
    while (stack[stack.length - 1].level < level) { const sub = []; stack[stack.length - 1].list.push({ ul: sub, margin: [0, 1, 0, 1] }); stack.push({ level: stack[stack.length - 1].level + 1, list: sub }); }
    stack[stack.length - 1].list.push({ text: it.text });
  }
  return root;
}
const bloques = (list) => (list || []).map((b) => (b.type === 'list' ? { ul: nestedList(b.items), margin: [0, 0, 0, 6] } : para(b.text)));

// Rejilla con celdas combinadas (HTML omite las celdas cubiertas; pdfmake las necesita como {})
function rejilla(rows) {
  const ocupado = []; const grid = []; let ncols = 0;
  rows.forEach((r, i) => {
    grid[i] = grid[i] || []; ocupado[i] = ocupado[i] || [];
    let col = 0;
    for (const c of r) {
      while (ocupado[i][col]) col += 1;
      grid[i][col] = { ...c };
      for (let dr = 0; dr < (c.rowspan || 1); dr++) for (let dc = 0; dc < (c.colspan || 1); dc++) {
        ocupado[i + dr] = ocupado[i + dr] || []; ocupado[i + dr][col + dc] = true;
        if (dr || dc) { grid[i + dr] = grid[i + dr] || []; grid[i + dr][col + dc] = { _ph: true }; }
      }
      col += c.colspan || 1; ncols = Math.max(ncols, col);
    }
  });
  const body = grid.filter((r) => r && r.length).map((r) => { const out = []; for (let j = 0; j < ncols; j++) out.push(r[j] || { _ph: true }); return out; });
  return { ncols, body };
}
// Anchos proporcionales a la cantidad de texto de cada columna (las columnas de marcas o cifras quedan estrechas)
function anchos(body, ncols) {
  // Ancho útil de A4 con márgenes de 50 pt: 495 pt. pdfmake suma a cada columna su relleno (4 + 4) y las líneas (0,5),
  // así que se descuentan para que la tabla nunca sobrepase el margen.
  const disponible = 495 - ncols * (4 + 4 + 0.5) - 0.5;
  const pesos = [];
  for (let j = 0; j < ncols; j++) {
    let tot = 0, n = 0;
    for (const r of body) { const c = r[j]; if (c && !c._ph && (c.colspan || 1) === 1) { tot += Math.min(String(c.text || '').length, 200); n += 1; } }
    pesos.push(Math.sqrt((n ? tot / n : 10) + 4));
  }
  const suma = pesos.reduce((a, b) => a + b, 0);
  const minimo = Math.min(26, disponible / ncols);
  let w = pesos.map((p) => Math.max(minimo, (disponible * p) / suma));
  const total = w.reduce((a, b) => a + b, 0);
  if (total > disponible) w = w.map((x) => (x * disponible) / total);
  return w;
}
function tablaGenerica(rows, opts = {}) {
  if (!rows || !rows.length) return para('(tabla vacía)', { italics: true, color: GRIS });
  const { ncols, body } = rejilla(rows);
  const cabecera = opts.cabecera !== undefined ? opts.cabecera : rows[0].every((c) => c.bold);
  const cuerpo = body.map((r, i) => r.map((c) => {
    if (c._ph) return {};
    const cell = { text: c.text || '', colSpan: c.colspan > 1 ? c.colspan : undefined, rowSpan: c.rowspan > 1 ? c.rowspan : undefined, fontSize: opts.fontSize };
    if (c.bold) { cell.bold = true; cell.fillColor = i === 0 && cabecera ? AZUL_CLARO : GRIS_FONDO; }
    return cell;
  }));
  const widths = opts.widths || anchos(body, ncols);
  return { table: { headerRows: cabecera ? 1 : 0, widths, body: cuerpo, dontBreakRows: false }, layout, margin: [0, 0, 0, 10] };
}

// ---------------------------------------------------------------- pintado por tipo de campo
function pintarRaCe(v) {
  if (!v || !v.ra || !v.ra.length) return tablaGenerica(v && v.filas);
  return { table: { headerRows: 1, widths: ['*', '*'], body: [[th('Resultados de aprendizaje'), th('Criterios de evaluación')], ...v.ra.map((r) => [{ text: [{ text: `RA${r.num}. `, bold: true }, r.texto] }, { stack: r.ce.map((ce) => ({ text: `${ce.letra}) ${ce.texto}`, margin: [0, 0, 0, 2] })) }])] }, layout, margin: [0, 0, 0, 10] };
}
function pintarPonderaciones(lista, avisos) {
  const tablas = Array.isArray(lista) ? lista : [lista];
  const out = []; let sumaRA = 0; let estructurado = true;
  for (const p of tablas) {
    if (p.ra === null || p.ra === undefined) { estructurado = false; out.push(tablaGenerica(p.filas)); continue; }
    sumaRA += p.ponderacion || 0;
    const sumaCE = p.ce.reduce((a, c) => a + (c.ponderacion || 0), 0);
    const ok = Math.abs(sumaCE - (p.ponderacion || 0)) < 0.01;
    if (!ok) avisos.push(`RA${p.ra}: los criterios suman ${pct(sumaCE)} y el RA pondera ${pct(p.ponderacion)}.`);
    out.push({ table: { headerRows: 1, widths: ['*', 70], body: [
      [th(`Resultado de aprendizaje ${p.ra}`), th('Ponderación', { alignment: 'center' })],
      [{ text: p.texto }, { text: pct(p.ponderacion), alignment: 'center', bold: true }],
      [label('Criterio de evaluación'), label('Ponderación', { alignment: 'center' })],
      ...p.ce.map((c) => [{ text: `${c.letra}) ${c.texto}`, bold: !!c.fundamental }, { text: pct(c.ponderacion), alignment: 'center' }]),
      [{ text: 'Suma de los criterios', italics: true, alignment: 'right', color: ok ? GRIS : ROJO }, { text: ok ? pct(sumaCE) : `${pct(sumaCE)} (!)`, alignment: 'center', bold: true, color: ok ? GRIS : ROJO }],
    ] }, layout, margin: [0, 0, 0, 10], unbreakable: p.ce.length <= 12 });
  }
  if (estructurado && tablas.length > 1 && Math.abs(sumaRA - 100) > 0.01) avisos.push(`La suma de las ponderaciones de los RA es ${pct(sumaRA)} y debería ser 100 %.`);
  if (estructurado && tablas.length > 1) out.unshift(para(`Suma de las ponderaciones de los RA: ${pct(sumaRA)}.`, { color: Math.abs(sumaRA - 100) > 0.01 ? ROJO : VERDE }));
  return out;
}
function pintarClaveValor(v) {
  if (!v || !v.pares || !v.pares.length) return tablaGenerica(v && v.filas);
  return { table: { widths: [150, '*'], body: v.pares.map((p) => [label(p.etiqueta), { text: p.valor || '' }]) }, layout, margin: [0, 0, 0, 10] };
}
function resumenSituaciones(items) {
  const fichas = items.map((it) => (Array.isArray(it.ficha) ? it.ficha[0] : it.ficha)).filter((f) => f && f.num);
  if (!fichas.length) return null;
  const raNums = [...new Set(fichas.flatMap((f) => f.ra))].sort((a, b) => a - b);
  if (!raNums.length) return null; // sin RA reconocibles no se puede calcular: se mantiene la tabla importada
  const evs = [...new Set(fichas.map((f) => f.evaluacion || ''))];
  const body = [
    [th('Ev.', { rowSpan: 2 }), th('Situaciones de aprendizaje', { rowSpan: 2 }), th('Sesiones', { rowSpan: 2 }), th('Resultados de aprendizaje', { colSpan: Math.max(raNums.length, 1), alignment: 'center' }), ...raNums.slice(1).map(() => ({}))],
    [{}, {}, {}, ...raNums.map((x) => th(String(x), { alignment: 'center' }))],
  ];
  let total = 0;
  for (const ev of evs) {
    const sas = fichas.filter((f) => (f.evaluacion || '') === ev);
    sas.forEach((f, i) => { total += f.sesiones || 0; body.push([i === 0 ? { text: ev, rowSpan: sas.length, bold: true } : {}, `SA ${f.num}: ${f.titulo}`, { text: f.sesiones === null ? '' : String(f.sesiones), alignment: 'center' }, ...raNums.map((x) => ({ text: f.ra.includes(x) ? 'X' : '', alignment: 'center' }))]); });
  }
  body.push([{ text: 'Total', colSpan: 2, bold: true }, {}, { text: String(total), bold: true, alignment: 'center' }, ...raNums.map(() => '')]);
  return { table: { headerRows: 2, widths: [28, '*', 42, ...raNums.map(() => 16)], body }, layout, margin: [0, 0, 0, 10] };
}

function pintarCampo(campo, valor, ctx) {
  if (valor === undefined || valor === null) return [];
  if (Array.isArray(valor) && campo.tipo !== 'texto_largo' && campo.tipo !== 'ponderacion_ra_ce') return valor.flatMap((v) => pintarCampo(campo, v, ctx));
  switch (campo.tipo) {
    case 'texto_largo': return bloques(valor);
    case 'auto.tabla_ra_ce': return [pintarRaCe(valor)];
    case 'ponderacion_ra_ce': return pintarPonderaciones(valor, ctx.avisos);
    case 'auto.ficha_modulo': case 'tabla_clave_valor': return [pintarClaveValor(valor)];
    case 'derivado.resumen_situaciones': return ctx.resumenCalculado ? [para('Tabla resumen calculada a partir de las fichas de situación de aprendizaje.', { italics: true, color: GRIS, fontSize: 8.5 }), ctx.resumenCalculado] : [tablaGenerica(valor.filas)];
    case 'ficha_situacion_aprendizaje': return [tablaGenerica(valor.filas, { cabecera: false, fontSize: 8.5 })];
    default: return [tablaGenerica(valor.filas, { cabecera: campo.columnas ? true : undefined })];
  }
}

// ---------------------------------------------------------------- recorrido de la plantilla
function pintarSeccion(sec, valores, numero, ctx) {
  const out = [];
  const nivel = Math.min(numero.split('.').length, 3);
  const estilo = nivel === 1 ? 'h1' : nivel === 2 ? 'h2' : 'h3';
  if (sec.repetidor) {
    // los ítems repetidos (Situación de aprendizaje 1, 2, 3...) cuelgan directamente de la sección padre, sin numeración propia
    const v = valores[sec.id];
    if (!v || !v.items || !v.items.length) { out.push(para(`(sin elementos de tipo "${sec.titulo}")`, { italics: true, color: GRIS })); return out; }
    ctx.resumenCalculado = resumenSituaciones(v.items);
    if (ctx.resumenPendiente && ctx.resumenCalculado) { out.push(ctx.resumenCalculado); ctx.resumenPendiente = false; }
    v.items.forEach((it, i) => {
      out.push({ text: `${sec.titulo} ${i + 1}: ${it.titulo}`, style: 'h3' });
      for (const c of sec.campos) if (c.id !== 'titulo') out.push(...pintarCampo(c, it[c.id], ctx));
    });
    return out;
  }
  out.push({ text: `${numero}. ${sec.titulo}`, style: estilo, tocItem: nivel <= 2, tocMargin: [12 * (nivel - 1), 0, 0, 0] });
  const v = valores[sec.id] || {};
  // el resumen derivado se pinta después de los ítems de los que depende: si aparece antes, lo aplazamos
  for (const c of sec.campos) {
    if (c.tipo === 'derivado.resumen_situaciones') { ctx.resumenPendiente = true; continue; }
    out.push(...pintarCampo(c, v[c.id], ctx));
  }
  sec.hijos.forEach((h, i) => out.push(...pintarSeccion(h, valores, `${numero}.${i + 1}`, ctx)));
  return out;
}

function buildDocDefinition({ plantilla, datos, instancias, titulo, subtitulo, estado = 'borrador' }) {
  const borrador = estado !== 'aprobado';
  const seleccion = instancias === 'todas' ? datos.instancias : datos.instancias.filter((x, i) => (instancias || []).includes(i) || (instancias || []).includes(x.titulo));
  const ctx = { avisos: [] };
  const cuerpo = [];
  plantilla.secciones.forEach((sec, i) => {
    const numero = String(i + 1);
    if (sec.instancias) {
      cuerpo.push({ text: `${numero}. ${sec.titulo}`, style: 'h1', tocItem: true, pageBreak: 'before' });
      cuerpo.push(para(`${seleccion.length} ${sec.etiqueta_instancia}${seleccion.length === 1 ? '' : 's'} de ${datos.instancias.length} del documento original.`, { italics: true, color: GRIS }));
      seleccion.forEach((inst, j) => {
        const n = `${numero}.${datos.instancias.indexOf(inst) + 1}`;
        const sub = { ...sec, id: sec.id, repetidor: false, campos: [], instancias: false };
        cuerpo.push({ text: `${n}. ${inst.titulo}`, style: 'h2', tocItem: true, tocMargin: [12, 0, 0, 0], pageBreak: j ? 'before' : undefined });
        const antes = ctx.avisos.length;
        const bloque = [];
        sub.hijos.forEach((h, k) => bloque.push(...pintarSeccion(h, inst.valores, `${n}.${k + 1}`, ctx)));
        const nuevos = ctx.avisos.splice(antes);
        if (nuevos.length) cuerpo.push({ table: { widths: ['*'], body: [[{ stack: [{ text: 'Comprobaciones automáticas', bold: true, color: ROJO, margin: [0, 0, 0, 3] }, { ul: nuevos }], fillColor: '#FDECEA' }]] }, layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 8, paddingRight: () => 8, paddingTop: () => 6, paddingBottom: () => 6 }, margin: [0, 0, 0, 10] });
        cuerpo.push(...bloque);
      });
    } else cuerpo.push(...pintarSeccion(sec, datos.documento, numero, ctx), ...(i === 0 ? [] : []));
  });
  const fecha = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  const portada = [
    { text: subtitulo || plantilla.origen || '', fontSize: 11, color: GRIS, margin: [0, 140, 0, 0] },
    { text: titulo || 'Documento generado', fontSize: 26, bold: true, color: AZUL, margin: [0, 20, 0, 0] },
    { canvas: [{ type: 'line', x1: 0, y1: 8, x2: 495, y2: 8, lineWidth: 1.5, lineColor: AZUL }], margin: [0, 0, 0, 18] },
    { text: `Plantilla deducida del documento original el ${new Date(plantilla.generada).toLocaleDateString('es-ES')} · ${plantilla.secciones.length} secciones de primer nivel · ${datos.instancias.length} ${datos.instancias.length === 1 ? 'instancia' : 'instancias'}`, fontSize: 10, color: GRIS },
    { text: `Estado: ${borrador ? 'BORRADOR' : 'APROBADO'} · generado el ${fecha}`, fontSize: 10, color: borrador ? ROJO : VERDE, margin: [0, 6, 0, 0] },
  ];
  return {
    content: [...portada, { toc: { title: { text: 'Índice', style: 'h1' }, numberStyle: { color: GRIS } }, pageBreak: 'before' }, { text: '', pageBreak: 'before' }, ...cuerpo],
    pageSize: 'A4', pageMargins: [50, 60, 50, 60],
    info: { title: titulo || 'Documento', subject: plantilla.tipo },
    watermark: borrador ? { text: 'BORRADOR', color: '#9E9E9E', opacity: 0.12, bold: true, fontSize: 90 } : undefined,
    header: (page) => (page === 1 ? null : { columns: [{ text: titulo || '', fontSize: 8, color: GRIS }, { text: subtitulo || '', fontSize: 8, color: GRIS, alignment: 'right' }], margin: [50, 28, 50, 0] }),
    footer: (page, pages) => (page === 1 ? null : { text: `Página ${page} de ${pages}`, alignment: 'center', fontSize: 8, color: GRIS, margin: [0, 25, 0, 0] }),
    defaultStyle: { font: 'Roboto', fontSize: 9.5, lineHeight: 1.15 },
    styles: {
      h1: { fontSize: 16, bold: true, color: AZUL, margin: [0, 0, 0, 10] },
      h2: { fontSize: 12.5, bold: true, color: AZUL, margin: [0, 14, 0, 6] },
      h3: { fontSize: 10.5, bold: true, color: '#2E75B6', margin: [0, 10, 0, 4] },
    },
  };
}

module.exports = { buildDocDefinition };
