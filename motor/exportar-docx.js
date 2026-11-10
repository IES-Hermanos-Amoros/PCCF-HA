// Exportador a Word (.docx): el inverso de motor/importar-docx.js. Toma una
// { plantilla, datos } y escribe el documento con la misma numeración y el mismo
// orden que pinta render-generico.js en el PDF, pero en un formato que el
// departamento puede seguir editando.
//
//   const { exportarDocx, escribirDocx } = require('./exportar-docx');
//   const buffer = await exportarDocx({ plantilla, datos, titulo, instancias: 'todas' });
//   await escribirDocx('PD.docx', { plantilla, datos });
//
// Un .docx es un zip con XML: se escribe a mano con jszip (que ya viene con
// mammoth), sin dependencias nuevas. El criterio de calidad es que mammoth y el
// importador vuelvan a leer lo escrito, y de ahí salen las decisiones no obvias:
//
// - mammoth casa los estilos de título por NOMBRE (`heading 1`), no por id, así
//   que styles.xml los declara con ese nombre además de `outlineLvl`.
// - Sin word/numbering.xml con una numeración de viñeta y un `w:numPr` en cada
//   párrafo, las listas se leen como párrafos sueltos y se pierden los niveles.
// - Una tabla va siempre seguida de un párrafo vacío: Word fusiona dos tablas
//   pegadas, y las ponderaciones son varias tablas seguidas. Mammoth descarta
//   los párrafos vacíos, así que no ensucia la lectura.
// - Las celdas combinadas se escriben con `w:gridSpan` y `w:vMerge`; las celdas
//   que una combinación vertical cubre hay que escribirlas (vacías) en su sitio,
//   porque el importador guarda las filas sin ellas.
// - Los grupos de módulos son títulos de primer nivel y cada módulo cuelga de su
//   grupo, como en el original: el importador detecta las instancias justo por
//   esa forma. Con un solo grupo, su título es el de la sección.
// - Las tablas de RA/CE y de ponderaciones se rehacen desde el modelo (como hace
//   el PDF) con la maquetación que `parseRaCe` y `parsePonderacion` esperan; el
//   resto, desde las `filas` importadas, que es lo que conserva su maquetación.

'use strict';

const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const { resolverCompartidos, plano } = require('./compartidos');
const { filasDeFicha, esSemantica } = require('./ficha-sa');
const Est = require('../core/estructurados');
const MT = require('../core/modelos-tabla');

const ANCHO_TABLA = 9638; // A4 (11906 twips) menos márgenes de 2 cm
const MAX_NIVEL_LISTA = 8;
const GRIS_BORDE = 'BFBFBF', AZUL_CLARO = 'D9E2F3', GRIS_FONDO = 'F2F2F2';

// El color de cada fondo (sin «#»), la alineación (`w:jc`) y el tamaño de letra (`w:sz`, en MEDIOS
// puntos). QUÉ lleva una celda lo deciden `Est.fondoDeCelda`, `Est.alineacionDeCelda` y
// `Est.tamanoDeCelda` de core/estructurados.js, que son las mismas funciones que usan el PDF y el
// editor: aquí solo se traduce el nombre a lo que entiende Word. Cuando devuelven null no se
// escribe nada y la celda sale con el formato de siempre.
//
// Los medios puntos de «pequena» y «grande» son los puntos del PDF multiplicados por dos
// (motor/render-generico.js): el tamaño elegido tiene que verse igual en las dos salidas.
const COLOR_FONDO = { cabecera: AZUL_CLARO, etiqueta: GRIS_FONDO };
const ALINEACION = { centro: 'center', derecha: 'right' };
const TAMANO = { pequena: 16, grande: 24 };

// ---------------------------------------------------------------- XML
// Los caracteres de control no son XML válido ni siquiera escapados.
const esc = (t) => String(t == null ? '' : t)
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// `text` puede ser una cadena o una lista de tramos ({ text, bold, italics }),
// igual que en compartidos.js. Un salto de línea dentro del texto es `w:br`.
// `base.sz` es el tamaño en MEDIOS puntos; sin él, el del documento.
// El orden dentro de `w:rPr` es el del esquema de Word: `w:b`, `w:i` y después `w:sz`.
function tramos(texto, base = {}) {
  const lista = Array.isArray(texto) ? texto : [texto];
  return lista.map((t) => (t && typeof t === 'object' ? t : { text: t })).map((t) => {
    const negrita = t.bold !== undefined ? t.bold : base.bold;
    const cursiva = t.italics !== undefined ? t.italics : base.italics;
    const tamano = t.sz !== undefined ? t.sz : base.sz;
    const formato = (negrita ? '<w:b/>' : '') + (cursiva ? '<w:i/>' : '')
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
    return parrafo(it.text, { estilo: 'ListParagraph', extra: `<w:numPr><w:ilvl w:val="${nivel}"/><w:numId w:val="1"/></w:numPr>` });
  }).join('');
}

const bloques = (lst) => (lst || []).map((b) => {
  if (b && b.type === 'list') return lista(b.items || []);
  if (b && b.type === 'p') return parrafo(b.text);
  return '';
}).join('');

// ---------------------------------------------------------------- tablas
// Coloca cada celda en su columna, insertando las celdas «continuación» que una
// combinación vertical deja en las filas de debajo.
function rejilla(filas) {
  const pendiente = new Map(); // columna -> { resto, span }
  const salida = []; let ncols = 0;
  for (const fila of filas) {
    const celdas = []; let col = 0;
    const cubrir = () => {
      while (pendiente.has(col)) {
        const p = pendiente.get(col);
        celdas.push({ continuacion: true, col, span: p.span });
        if (p.resto <= 1) pendiente.delete(col); else p.resto -= 1;
        col += p.span;
      }
    };
    for (const c of fila) {
      cubrir();
      const span = Math.max(1, Number(c.colspan) || 1), alto = Math.max(1, Number(c.rowspan) || 1);
      celdas.push({ celda: c, col, span, alto });
      if (alto > 1) pendiente.set(col, { resto: alto - 1, span });
      col += span;
    }
    cubrir();
    ncols = Math.max(ncols, col);
    salida.push(celdas);
  }
  return { filas: salida, ncols };
}

// Reparte el ancho de la tabla entre las columnas según sus PESOS relativos, con un mínimo por
// columna. Es el único sitio que convierte pesos en dxa, los pida la tabla (`anchos` de su valor) o
// los haya deducido del texto `anchos()`.
function repartir(pesos) {
  const suma = pesos.reduce((a, b) => a + b, 0);
  const w = pesos.map((p) => Math.max(450, Math.round((ANCHO_TABLA * p) / suma)));
  const total = w.reduce((a, b) => a + b, 0);
  return w.map((x) => Math.round((x * ANCHO_TABLA) / total));
}

// Anchos proporcionales a la raíz del texto medio de cada columna, como en el PDF
// (las columnas de marcas o de cifras quedan estrechas).
function anchos(filas, ncols) {
  const pesos = [];
  for (let j = 0; j < ncols; j += 1) {
    let tot = 0, n = 0;
    for (const f of filas) for (const c of f) if (!c.continuacion && c.col === j && c.span === 1) { tot += Math.min(plano(c.celda.text).length, 200); n += 1; }
    pesos.push(Math.sqrt((n ? tot / n : 10) + 4));
  }
  return repartir(pesos);
}

// `anchosPedidos` son los pesos relativos que trae el valor de la tabla, uno por columna. Si no
// vienen —o no cuadran con las columnas que de verdad tiene— cada columna mide lo que diga su
// cantidad de texto, que es como salen todas las tablas importadas del Word.
//
// `cabecera` dice si la primera fila es la cabecera que se repite al cambiar de página: la decide
// `Est.cabeceraDeTabla` con el campo, y quien no tiene campo deja que la decida la negrita.
function tabla(filas, anchosPedidos, cabecera) {
  if (!filas || !filas.length) return '';
  const { filas: rej, ncols } = rejilla(filas);
  if (!ncols) return '';
  const w = Array.isArray(anchosPedidos) && anchosPedidos.length === ncols
    ? repartir(anchosPedidos) : anchos(rej, ncols);
  const ancho = (c) => w.slice(c.col, c.col + c.span).reduce((a, b) => a + b, 0);
  if (cabecera === undefined) cabecera = Est.cabeceraDeTabla(null, { filas });
  const borde = (l) => `<w:${l} w:val="single" w:sz="4" w:space="0" w:color="${GRIS_BORDE}"/>`;
  const xmlFilas = rej.map((r, i) => {
    const tcs = r.map((c) => {
      const props = `<w:tcW w:w="${ancho(c)}" w:type="dxa"/>${c.span > 1 ? `<w:gridSpan w:val="${c.span}"/>` : ''}`;
      if (c.continuacion) return `<w:tc><w:tcPr>${props}<w:vMerge/></w:tcPr><w:p/></w:tc>`;
      const vmerge = c.alto > 1 ? '<w:vMerge w:val="restart"/>' : '';
      const relleno = COLOR_FONDO[Est.fondoDeCelda(c.celda, i === 0 && cabecera)];
      const sombra = relleno ? `<w:shd w:val="clear" w:color="auto" w:fill="${relleno}"/>` : '';
      // cada línea de la celda es un párrafo: así las vuelve a juntar el importador
      const lineas = plano(c.celda.text).split('\n');
      const alineacion = ALINEACION[Est.alineacionDeCelda(c.celda)];
      const tam = TAMANO[Est.tamanoDeCelda(c.celda)];
      // El orden dentro de `w:pPr` es el del esquema de Word: `w:spacing` antes de `w:jc`.
      const forma = '<w:spacing w:after="40"/>' + (alineacion ? `<w:jc w:val="${alineacion}"/>` : '');
      const ps = lineas.map((l) => parrafo(l, { base: { bold: !!c.celda.bold, sz: tam }, extra: forma })).join('');
      return `<w:tc><w:tcPr>${props}${vmerge}${sombra}</w:tcPr>${ps}</w:tc>`;
    }).join('');
    return `<w:tr>${i === 0 && cabecera ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${tcs}</w:tr>`;
  }).join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="${ANCHO_TABLA}" w:type="dxa"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(borde).join('')}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${w.map((x) => `<w:gridCol w:w="${x}"/>`).join('')}</w:tblGrid>${xmlFilas}</w:tbl>${separador}`;
}

const celda = (text, opts) => Object.assign({ text: String(text == null ? '' : text), colspan: 1, rowspan: 1, bold: false }, opts);
const pct = (n) => (n === undefined || n === null ? '' : `${n}%`);

// Mismo formato que parseRaCe: "1. texto" y un criterio "a) texto" por línea.
function filasRaCe(v) {
  return [
    [celda('Resultados de aprendizaje', { bold: true }), celda('Criterios de evaluación', { bold: true })],
    ...v.ra.map((r) => [
      celda(`${r.num}. ${r.texto}`),
      celda(r.ce.map((c) => `${c.letra}) ${c.texto}`).join('\n')),
    ]),
  ];
}
// Mismo formato que parsePonderacion. La primera celda lleva el código del módulo
// ("Resultado de aprendizaje (0614.1)"), que el modelo no guarda: se toma de las
// `filas` importadas si están; si no, el RA va tras un punto para que se pueda releer.
function filasPonderacion(p) {
  const previa = p.filas && p.filas[0] && p.filas[0][0] ? String(p.filas[0][0].text) : '';
  const m = previa.match(/^(.*\()([^()]*)\.\d+\)\s*$/s);
  const cabecera = m ? `${m[1]}${m[2]}.${p.ra})` : `Resultado de aprendizaje (RA.${p.ra})`;
  return [
    [celda(cabecera, { bold: true }), celda('Ponderación', { bold: true })],
    [celda(p.texto), celda(pct(p.ponderacion), { bold: true })],
    [celda('Criterio de Evaluación', { bold: true }), celda('Ponderación', { bold: true })],
    ...p.ce.map((c) => [celda(`${c.letra}) ${c.texto}`, { bold: !!c.fundamental }), celda(pct(c.ponderacion))]),
  ];
}
const filasParejas = (v) => v.pares.map((p) => [celda(p.etiqueta, { bold: true }), celda(p.valor)]);

// ---------------------------------------------------------------- campos
// `ctx` es lo que la plantilla dice y el valor no: la estructura de la ficha de situacion de
// aprendizaje y los modelos de tabla. Viaja junto por lo mismo que en el PDF, donde ya era un
// contexto: son datos del documento entero y `campo` esta a varias llamadas de la plantilla.
function campo(c, valor, ctx = {}) {
  if (valor === undefined || valor === null) return '';
  if (Array.isArray(valor) && c.tipo !== 'texto_largo') return valor.map((v) => campo(c, v, ctx)).join('');
  switch (c.tipo) {
    case 'texto_largo': return bloques(valor);
    case 'auto.tabla_ra_ce': return tabla(Est.queSeImprime(c, valor) === 'ra' ? filasRaCe(valor) : valor.filas);
    case 'ponderacion_ra_ce': return tabla(valor.ra !== null && valor.ra !== undefined && valor.ce ? filasPonderacion(valor) : valor.filas);
    case 'ficha_situacion_aprendizaje': return tabla(valor.filas && valor.filas.length ? valor.filas : (esSemantica(valor, ctx.estructuraFicha) ? filasDeFicha(valor, ctx.estructuraFicha) : null));
    case 'auto.ficha_modulo': case 'tabla_clave_valor': {
      // Cual de las dos mitades se imprime lo dice `queSeImprime`; que forma sigue la que se imprima,
      // la regla de core/modelos-tabla.js, la misma que el PDF y el editor.
      const que = Est.queSeImprime(c, valor);
      if (que === 'filas') {
        const t = MT.tablaVigente(c, valor, ctx.modelos, Est.cabeceraDeTabla(c, valor));
        return tabla(t.filas, t.anchos, t.cabecera);
      }
      if (que !== 'pares') return tabla(null);
      return tabla(filasParejas(MT.paresVigentes(c, valor, ctx.modelos)));
    }
    // Incluye derivado.resumen_situaciones: se escribe tal como se importó. Y es el caso de la
    // tabla genérica editable, la única que puede traer sus propios anchos de columna y la unica
    // que puede seguir el modelo de un grupo de tablas.
    default: {
      const t = MT.tablaVigente(c, valor, ctx.modelos, Est.cabeceraDeTabla(c, valor));
      return tabla(t.filas, t.anchos, t.cabecera);
    }
  }
}

// ---------------------------------------------------------------- recorrido de la plantilla
// `nivel` es la profundidad de título en el Word que se escribe (no el nivel del
// original: ese puede saltarse niveles).
function seccion(sec, valores, numero, nivel, ctx) {
  if (sec.repetidor) {
    // los ítems repetidos cuelgan del padre, sin número propio: "Situación de aprendizaje 2: título"
    const v = (valores[sec.id] || {}).items || [];
    return v.map((it, i) => titulo(`${sec.titulo} ${i + 1}: ${it.titulo}`, nivel)
      + sec.campos.filter((c) => c.id !== 'titulo').map((c) => campo(c, it[c.id], ctx)).join('')).join('');
  }
  const v = valores[sec.id] || {};
  return titulo(`${numero}. ${sec.titulo}`, nivel)
    + sec.campos.map((c) => campo(c, v[c.id], ctx)).join('')
    + (sec.hijos || []).map((h, i) => seccion(h, valores, `${numero}.${i + 1}`, nivel + 1, ctx)).join('');
}

// Lo que la plantilla dice y el valor no, de una vez por documento: la estructura de la ficha de
// situacion de aprendizaje y los modelos de tabla. Es el `ctx` del PDF, con lo mismo dentro.
const contexto = (plantilla) => ({ estructuraFicha: plantilla.estructuraFicha, modelos: plantilla.modelos });

function cuerpo({ plantilla, datos, instancias }) {
  const ctx = contexto(plantilla);
  const todas = datos.instancias || [];
  const sel = instancias === undefined || instancias === 'todas' ? todas
    : todas.filter((x, i) => (instancias || []).includes(i) || (instancias || []).includes(x.titulo));
  return plantilla.secciones.map((sec, i) => {
    const numero = String(i + 1);
    if (!sec.instancias) return seccion(sec, datos.documento || {}, numero, 1, ctx);
    // un título de primer nivel por grupo ("Módulos del primer curso"); solo el
    // primero lleva el número de la sección, que es único en la plantilla
    const grupos = [];
    for (const inst of sel) {
      const g = inst.grupo || sec.titulo;
      if (!grupos.includes(g)) grupos.push(g);
    }
    return grupos.map((g, k) => titulo(k ? g : `${numero}. ${g}`, 1)
      + sel.filter((inst) => (inst.grupo || sec.titulo) === g).map((inst) => {
        const n = `${numero}.${todas.indexOf(inst) + 1}`;
        return titulo(`${n}. ${inst.titulo}`, 2)
          + (sec.hijos || []).map((h, j) => seccion(h, inst.valores || {}, `${n}.${j + 1}`, 3, ctx)).join('');
      }).join('')).join('');
  }).join('');
}

// ---------------------------------------------------------------- partes fijas del zip
const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const CABECERA_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

// El formato zip guarda la fecha en formato DOS, que empieza en 1980.
const FECHA_FIJA = new Date('2000-01-01T00:00:00Z');

const CONTENT_TYPES = `${CABECERA_XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>`;
const RELS = `${CABECERA_XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="word/document.xml"/></Relationships>`;
const DOC_RELS = `${CABECERA_XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/styles" Target="styles.xml"/><Relationship Id="rId2" Type="${REL}/numbering" Target="numbering.xml"/></Relationships>`;

const TAMANOS = [32, 28, 24, 22, 22, 22]; // medios puntos
function estilos() {
  const encabezados = TAMANOS.map((sz, i) => `<w:style w:type="paragraph" w:styleId="Heading${i + 1}"><w:name w:val="heading ${i + 1}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="${i ? 240 : 360}" w:after="120"/><w:outlineLvl w:val="${i}"/></w:pPr><w:rPr><w:b/><w:color w:val="${i < 2 ? '1F3864' : '2E75B6'}"/><w:sz w:val="${sz}"/></w:rPr></w:style>`).join('');
  return `${CABECERA_XML}<w:styles ${NS}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="20"/><w:lang w:val="es-ES"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="240"/></w:pPr><w:rPr><w:b/><w:color w:val="1F3864"/><w:sz w:val="48"/></w:rPr></w:style>${encabezados}<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="40"/><w:contextualSpacing/></w:pPr></w:style></w:styles>`;
}

// Una sola numeración de viñetas con nueve niveles: el nivel de cada elemento va en `w:ilvl`.
function numeracion() {
  const marcas = ['•', '–', '▪'];
  const niveles = Array.from({ length: MAX_NIVEL_LISTA + 1 }, (_, i) => `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="${marcas[i % marcas.length]}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${(i + 1) * 360}" w:hanging="360"/></w:pPr></w:lvl>`).join('');
  return `${CABECERA_XML}<w:numbering ${NS}><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>${niveles}</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;
}

// ---------------------------------------------------------------- API
// Devuelve un Buffer con el .docx. `instancias` como en render-generico.js, pero
// por defecto 'todas': un exportador que no escribe nada por omisión sorprende.
// `titulo` va como primer párrafo (estilo Title); el importador lo ignora, igual
// que la portada de cualquier Word.
async function exportarDocx({ plantilla, datos, titulo: tituloDoc, instancias = 'todas' }) {
  if (!plantilla || !Array.isArray(plantilla.secciones)) throw new Error('exportarDocx: falta la plantilla');
  if (!datos) throw new Error('exportarDocx: faltan los datos');
  const resueltos = resolverCompartidos(datos);
  const portada = tituloDoc ? parrafo(tituloDoc, { estilo: 'Title' }) : '';
  const pagina = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr>';
  const documento = `${CABECERA_XML}<w:document ${NS}><w:body>${portada}${cuerpo({ plantilla, datos: resueltos, instancias })}${pagina}</w:body></w:document>`;

  const zip = new JSZip();
  // Fecha fija en cada entrada del zip. Por omisión jszip pone la del momento, y
  // entonces dos ejecuciones con el mismo contenido dan ficheros distintos: el
  // documento de ejemplo está versionado, así que cada regeneración metería un
  // binario nuevo en el historial aunque no hubiera cambiado una sola letra. Con
  // la fecha fija, mismo contenido, mismos bytes.
  // `createFolders: false` porque jszip, si no, crea solo las entradas de carpeta
  // (`word/`, `_rels/`) con la fecha del momento, y esas no pasan por `date`.
  // Word no las necesita: en el zip son opcionales.
  const opciones = { date: FECHA_FIJA, createFolders: false };
  zip.file('[Content_Types].xml', CONTENT_TYPES, opciones);
  zip.file('_rels/.rels', RELS, opciones);
  zip.file('word/document.xml', documento, opciones);
  zip.file('word/_rels/document.xml.rels', DOC_RELS, opciones);
  zip.file('word/styles.xml', estilos(), opciones);
  zip.file('word/numbering.xml', numeracion(), opciones);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

async function escribirDocx(ruta, opciones) {
  const buffer = await exportarDocx(opciones);
  await fs.promises.mkdir(path.dirname(path.resolve(ruta)), { recursive: true });
  await fs.promises.writeFile(ruta, buffer);
  return ruta;
}

module.exports = { exportarDocx, escribirDocx };
