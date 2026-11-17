// Exporta un borrador Markdown a .docx con el mismo aspecto que motor/exportar-docx.js
// (mismos estilos de título, viñetas y tablas con borde gris y cabecera azul clara).
//
//   node scripts/md-a-docx.js docs/entrada_ej/2026-27/borradores/PCCF_DAW.md
//   node scripts/md-a-docx.js <entrada.md> [salida.docx]
//
// Además de convertir, prepara el documento para revisión:
// - Elimina la muletilla «[En proceso]» / «[En progreso]» de títulos y subtítulos.
// - Resalta en amarillo las marcas PENDIENTE que hay que revisar a mano
//   (enlaces de formularios, DUA, recálculo de % de 2.1, etc.).

'use strict';

const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

// ---------------------------------------------------------------- XML base
// (mismo esqueleto que motor/exportar-docx.js)

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const CABECERA_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const FECHA_FIJA = new Date('2000-01-01T00:00:00Z');
const ANCHO_TABLA = 9638;
const MAX_NIVEL_LISTA = 8;
const GRIS_BORDE = 'BFBFBF', AZUL_CLARO = 'D9E2F3';

const CONTENT_TYPES = `${CABECERA_XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>`;
const RELS = `${CABECERA_XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="word/document.xml"/></Relationships>`;
const DOC_RELS = `${CABECERA_XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/styles" Target="styles.xml"/><Relationship Id="rId2" Type="${REL}/numbering" Target="numbering.xml"/></Relationships>`;

const esc = (t) => String(t == null ? '' : t)
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const TAMANOS = [32, 28, 24, 22, 22, 22];
function estilos() {
  const encabezados = TAMANOS.map((sz, i) => `<w:style w:type="paragraph" w:styleId="Heading${i + 1}"><w:name w:val="heading ${i + 1}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="${i ? 240 : 360}" w:after="120"/><w:outlineLvl w:val="${i}"/></w:pPr><w:rPr><w:b/><w:color w:val="${i < 2 ? '1F3864' : '2E75B6'}"/><w:sz w:val="${sz}"/></w:rPr></w:style>`).join('');
  return `${CABECERA_XML}<w:styles ${NS}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="20"/><w:lang w:val="es-ES"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="240"/></w:pPr><w:rPr><w:b/><w:color w:val="1F3864"/><w:sz w:val="48"/></w:rPr></w:style>${encabezados}<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="40"/><w:contextualSpacing/></w:pPr></w:style></w:styles>`;
}

function numeracion() {
  const marcas = ['•', '–', '▪'];
  const niveles = Array.from({ length: MAX_NIVEL_LISTA + 1 }, (_, i) => `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="${marcas[i % marcas.length]}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${(i + 1) * 360}" w:hanging="360"/></w:pPr></w:lvl>`).join('');
  return `${CABECERA_XML}<w:numbering ${NS}><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>${niveles}</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;
}

// ---------------------------------------------------------------- runs / párrafos
// Un tramo = { text, bold, italics, highlight, sz }
function tramos(texto, base = {}) {
  const lista = Array.isArray(texto) ? texto : [texto];
  return lista.map((t) => (t && typeof t === 'object' ? t : { text: t })).map((t) => {
    const negrita = t.bold !== undefined ? t.bold : base.bold;
    const cursiva = t.italics !== undefined ? t.italics : base.italics;
    const tamano = t.sz !== undefined ? t.sz : base.sz;
    const resalte0 = t.highlight !== undefined ? t.highlight : base.highlight;
    // `highlight` puede ser `true` (marca de revisión) o el nombre Word («yellow»).
    const resalte = resalte0 === true ? 'yellow' : resalte0;
    const formato = (negrita ? '<w:b/>' : '') + (cursiva ? '<w:i/>' : '')
      + (resalte ? `<w:highlight w:val="${esc(resalte)}"/>` : '')
      + (tamano ? `<w:sz w:val="${tamano}"/>` : '');
    const partes = String(t.text == null ? '' : t.text).split('\n');
    const contenido = partes.map((p, i) => (i ? '<w:br/>' : '') + (p ? `<w:t xml:space="preserve">${esc(p)}</w:t>` : '')).join('');
    return contenido ? `<w:r>${formato ? `<w:rPr>${formato}</w:rPr>` : ''}${contenido}</w:r>` : '';
  }).join('');
}

const parrafo = (texto, { estilo, base, extra = '' } = {}) => {
  const ppr = (estilo ? `<w:pStyle w:val="${estilo}"/>` : '') + extra;
  return `<w:p>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ''}${tramos(texto, base)}</w:p>`;
};
const separador = '<w:p><w:pPr><w:spacing w:after="0"/></w:pPr></w:p>';
const titulo = (texto, nivel) => parrafo(texto, { estilo: `Heading${Math.min(Math.max(nivel, 1), 6)}` });

function lista(items) {
  return items.map((it) => {
    const nivel = Math.min(Math.max(Number(it.level) || 0, 0), MAX_NIVEL_LISTA);
    return parrafo(parseInline(it.text), { estilo: 'ListParagraph', extra: `<w:numPr><w:ilvl w:val="${nivel}"/><w:numId w:val="1"/></w:numPr>` });
  }).join('');
}

// ---------------------------------------------------------------- tablas
function anchoColumnas(filas) {
  const ncols = Math.max(...filas.map((f) => f.length), 1);
  const pesos = [];
  for (let j = 0; j < ncols; j += 1) {
    let tot = 0, n = 0;
    for (const f of filas) {
      const c = f[j];
      if (c === undefined) continue;
      tot += Math.min(String(c).replace(/\s+/g, ' ').length, 200); n += 1;
    }
    pesos.push(Math.sqrt((n ? tot / n : 10) + 4));
  }
  const suma = pesos.reduce((a, b) => a + b, 0);
  const w = pesos.map((p) => Math.max(450, Math.round((ANCHO_TABLA * p) / suma)));
  const total = w.reduce((a, b) => a + b, 0);
  return w.map((x) => Math.round((x * ANCHO_TABLA) / total));
}

function tabla(filas, { cabecera = true } = {}) {
  if (!filas || !filas.length) return '';
  const ncols = Math.max(...filas.map((f) => f.length));
  const rell = filas.map((f) => Array.from({ length: ncols }, (_, i) => (f[i] == null ? '' : f[i])));
  const w = anchoColumnas(rell);
  const borde = (l) => `<w:${l} w:val="single" w:sz="4" w:space="0" w:color="${GRIS_BORDE}"/>`;
  const xmlFilas = rell.map((celdas, i) => {
    const tcs = celdas.map((texto, j) => {
      const props = `<w:tcW w:w="${w[j]}" w:type="dxa"/>`;
      const sombra = (cabecera && i === 0) ? `<w:shd w:val="clear" w:color="auto" w:fill="${AZUL_CLARO}"/>` : '';
      const bold = cabecera && i === 0;
      const lineas = parseInline(String(texto).replace(/<br\s*\/?>/gi, '\n'));
      const ps = lineas.length
        ? parrafo(lineas, { base: { bold }, extra: '<w:spacing w:after="40"/>' })
        : '<w:p/>';
      return `<w:tc><w:tcPr>${props}${sombra}</w:tcPr>${ps}</w:tc>`;
    }).join('');
    const trPr = (cabecera && i === 0) ? '<w:trPr><w:tblHeader/></w:trPr>' : '';
    return `<w:tr>${trPr}${tcs}</w:tr>`;
  }).join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="${ANCHO_TABLA}" w:type="dxa"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(borde).join('')}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${w.map((x) => `<w:gridCol w:w="${x}"/>`).join('')}</w:tblGrid>${xmlFilas}</w:tbl>${separador}`;
}

// ---------------------------------------------------------------- inline markdown
// Quita la muletilla de estado de títulos.
function limpiarEstado(t) {
  return String(t)
    .replace(/\s*\[[Ee]n\s+[Pp]ro(?:ceso|greso)\]/g, '')
    .replace(/\s*\[(En )?(PROGRESO|PROCESO)\]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ¿Este fragmento es una marca que el usuario debe revisar?
function esMarcaRevision(t) {
  const s = String(t);
  return /\bPENDIENTE\b/.test(s) || /recalcularse estos valores/.test(s);
}

// Segmenta resaltando en amarillo las marcas de revisión.
// Reglas: (a) mayúsculas PENDIENTE… hasta el cierre de línea o de paréntesis;
// (b) la nota de recálculo de 2.1; (c) paréntesis en cursiva que empiecen por PENDIENTE.
function segmentarRevision(texto) {
  const salida = [];
  const re = /(\*\(PENDIENTE:[^)]*\)\*|\(PENDIENTE:[^)]*\)|\bPENDIENTE\b[^\n*]*|al completarla deberán recalcularse estos valores)/g;
  let ultimo = 0, m;
  while ((m = re.exec(texto))) {
    if (m.index > ultimo) salida.push({ text: texto.slice(ultimo, m.index), highlight: false });
    salida.push({ text: m[0], highlight: true });
    ultimo = m.index + m[0].length;
  }
  if (ultimo < texto.length) salida.push({ text: texto.slice(ultimo), highlight: false });
  return salida.length ? salida : [{ text: texto, highlight: false }];
}

// Limpia artefactos de la exportación Word→MD (palabras individually en negrita pegadas, etc.).
function normalizarArtefactos(t) {
  let s = String(t);
  for (let k = 0; k < 6; k += 1) {
    const antes = s;
    s = s.replace(/\*\*([^*]+)\*\*(?=\*\*)/g, '**$1'); // **a****b** → **a**b (acumula)
    s = s.replace(/\*\*([^*]+)\*\*\s+\*\*([^*]+)\*\*/g, '**$1 $2**'); // **a** **b** → **a b**
    s = s.replace(/\*{4,}/g, '**');
    s = s.replace(/\*\*\s+\*\*/g, ' ');
    if (s === antes) break;
  }
  s = s.replace(/\*\*\*([^*\n]+)\*\*\*/g, '**$1**'); // ***x*** → **x**
  s = s.replace(/\*{3,}/g, '**');
  s = s.replace(/\*\*\s*\*\*/g, ' ');
  s = s.replace(/ {2,}/g, ' ');
  return s;
}

// Convierte Markdown inline en tramos de Word (negrita, cursiva, enlaces, resaltado).
function parseInline(texto) {
  const crudo = String(texto == null ? '' : texto);
  const t = normalizarArtefactos(crudo);
  const tramosSalida = [];
  const push = (tramo) => {
    if (!tramo || tramo.text === undefined || tramo.text === '') return;
    const previo = tramosSalida[tramosSalida.length - 1];
    if (previo
      && previo.bold === tramo.bold && previo.italics === tramo.italics
      && previo.highlight === tramo.highlight) {
      previo.text += tramo.text;
    } else tramosSalida.push(tramo);
  };

  // Tokens: **negrita**, *cursiva*, `código`, [texto](url)
  const re = /(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let ultimo = 0, m;
  while ((m = re.exec(t))) {
    if (m.index > ultimo) {
      for (const s of segmentarRevision(t.slice(ultimo, m.index))) {
        push({ text: s.text, highlight: s.highlight || undefined });
      }
    }
    const tok = m[0];
    if (tok.startsWith('**')) {
      const inner = tok.slice(2, -2);
      for (const s of segmentarRevision(inner)) {
        push({ text: s.text, bold: true, highlight: s.highlight || undefined });
      }
    } else if (tok.startsWith('*')) {
      const inner = tok.slice(1, -1);
      for (const s of segmentarRevision(inner)) {
        push({ text: s.text, italics: true, highlight: s.highlight || undefined });
      }
    } else if (tok.startsWith('`')) {
      push({ text: tok.slice(1, -1) });
    } else {
      const lm = tok.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (lm) {
        const [, label, url] = lm;
        // Enlace como texto + URL entre paréntesis (Word no lleva hiperrelación sencilla aquí).
        push({ text: `${label} (${url})`, italics: true });
      }
    }
    ultimo = m.index + tok.length;
  }
  if (ultimo < t.length) {
    for (const s of segmentarRevision(t.slice(ultimo))) {
      push({ text: s.text, highlight: s.highlight || undefined });
    }
  }
  // Residuos de marcador que el tokenizador no pudo emparejar: se retiran del texto
  // (la negrita/cursiva ya están en las propiedades de los tramos).
  for (const tr of tramosSalida) {
    tr.text = String(tr.text).replace(/\*+/g, '');
  }
  return tramosSalida.filter((tr) => tr.text !== '');
}

// ---------------------------------------------------------------- parser de líneas MD
function esSeparadorTabla(linea) {
  return /^\s*\|?[\s:|-]+\|?\s*$/.test(linea) && linea.includes('-');
}

function partirCeldas(linea) {
  let s = linea.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  // Corta por | no escapadas
  return s.split(/(?<!\\)\|/).map((c) => c.replace(/\\\|/g, '|').trim());
}

function mdAxml(md, tituloDoc) {
  const lineas = String(md).replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const cuerpo = [];
  let i = 0;

  // Portada: primer título del documento si no se pasa uno explícito.
  if (tituloDoc) cuerpo.push(parrafo(limpiarEstado(tituloDoc), { estilo: 'Title' }));

  while (i < lineas.length) {
    const linea = lineas[i];

    // Línea en blanco
    if (!linea.trim()) { i += 1; continue; }

    // Separador horizontal
    if (/^-{3,}$|^\*{3,}$/.test(linea.trim())) { cuerpo.push(separador); i += 1; continue; }

    // Título
    const h = linea.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const nivel = h[1].length;
      const texto = limpiarEstado(h[2]);
      if (texto) cuerpo.push(titulo(parseInline(texto), nivel));
      i += 1; continue;
    }

    // Tabla
    if (linea.trim().startsWith('|') && i + 1 < lineas.length && esSeparadorTabla(lineas[i + 1])) {
      const filas = [partirCeldas(linea)];
      i += 2;
      while (i < lineas.length && lineas[i].trim().startsWith('|')) {
        filas.push(partirCeldas(lineas[i]));
        i += 1;
      }
      cuerpo.push(tabla(filas));
      continue;
    }

    // Lista con viñetas (-, *, +) — con sangría por espacios
    const li = linea.match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
    if (li) {
      const indent = li[1].replace(/\t/g, '  ').length;
      const nivel = Math.min(Math.floor(indent / 2), MAX_NIVEL_LISTA);
      const items = [];
      while (i < lineas.length) {
        const l = lineas[i];
        const m = l.match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
        if (!m) {
          // Continuación de un ítem: línea con más sangría y sin viñeta
          if (l.trim() && items.length && /^(\s{2,})\S/.test(l) && !l.trim().startsWith('|') && !/^#{1,6}\s/.test(l)) {
            items[items.length - 1].text += ' ' + l.trim();
            i += 1; continue;
          }
          break;
        }
        const ind = m[1].replace(/\t/g, '  ').length;
        const niv = Math.min(Math.floor(ind / 2), MAX_NIVEL_LISTA);
        items.push({ text: limpiarEstado(m[3]), level: niv });
        i += 1;
      }
      cuerpo.push(lista(items));
      continue;
    }

    // Párrafo: acumula hasta línea en blanco o inicio de bloque
    const trozos = [limpiarEstado(linea)];
    i += 1;
    while (i < lineas.length && lineas[i].trim()
      && !/^(#{1,6})\s/.test(lineas[i])
      && !lineas[i].trim().startsWith('|')
      && !/^(\s*)([-*+]|\d+\.)\s+/.test(lineas[i])
      && !/^-{3,}$/.test(lineas[i].trim())) {
      trozos.push(limpiarEstado(lineas[i]));
      i += 1;
    }
    const texto = trozos.join(' ');
    if (texto.trim()) cuerpo.push(parrafo(parseInline(texto)));
  }

  return cuerpo.join('');
}

// ---------------------------------------------------------------- API
async function exportarMdA_docx(md, tituloDoc) {
  const portada = '';
  const pagina = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr>';
  const documento = `${CABECERA_XML}<w:document ${NS}><w:body>${portada}${mdAxml(md, tituloDoc)}${pagina}</w:body></w:document>`;

  const zip = new JSZip();
  const opciones = { date: FECHA_FIJA, createFolders: false };
  zip.file('[Content_Types].xml', CONTENT_TYPES, opciones);
  zip.file('_rels/.rels', RELS, opciones);
  zip.file('word/document.xml', documento, opciones);
  zip.file('word/_rels/document.xml.rels', DOC_RELS, opciones);
  zip.file('word/styles.xml', estilos(), opciones);
  zip.file('word/numbering.xml', numeracion(), opciones);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

async function exportarArchivo(entrada, salida) {
  const md = await fs.promises.readFile(entrada, 'utf8');
  // Portada con el nombre del fichero (evita duplicar el primer encabezado del MD).
  const base = path.basename(entrada, '.md').replace(/_/g, ' ').trim();
  const buffer = await exportarMdA_docx(md, base);
  await fs.promises.mkdir(path.dirname(path.resolve(salida)), { recursive: true });
  await fs.promises.writeFile(salida, buffer);
  return salida;
}

module.exports = { exportarMdA_docx, exportarArchivo, limpiarEstado, parseInline };

if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);
    if (!args.length) {
      console.error('Uso: node scripts/md-a-docx.js <entrada.md> [salida.docx]');
      process.exit(1);
    }
    const entrada = args[0];
    const salida = args[1] || entrada.replace(/\.md$/i, '.docx');
    const ruta = await exportarArchivo(entrada, salida);
    console.log(`OK → ${ruta}`);
  })().catch((e) => { console.error(e); process.exit(1); });
}
