// Saneador de un .docx real, en su sitio.
//
// A diferencia de scripts/generar-ejemplo.js, que escribía un .docx nuevo desde
// la estructura importada, esto abre el .docx original, cambia solo el texto que
// no se puede publicar y vuelve a cerrar el zip con todas las demás partes
// byte a byte iguales. La portada, el índice, los estilos, la numeración, las
// imágenes, los saltos de sección y el texto normativo se conservan.
//
// El trabajo se hace sobre el XML como cadena, nunca reserializando el DOM:
// localizar un párrafo, concatenar sus <w:t>, decidir qué cambiar y volver a
// escribir el texto en el primer run afectado. Así no se pierde ningún atributo
// que Word haya puesto y que un parser genérico no entendería.
//
// Las reglas de qué es material docente, qué es normativo y quién es quién son
// las mismas que usa lib/sanear.js: este módulo solo las aplica al XML.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const JSZip = require('jszip');
const S = require('./sanear');
const F = require('./ficha-sa');
const { importarDocx, norm, slug } = require('./importar-docx');
const { buildDocDefinition } = require('./render-generico');

// La fecha fija del zip: dos ejecuciones tienen que dar los mismos bytes.
const FECHA_FIJA = new Date('2000-01-01T00:00:00Z');
const BOM = '\uFEFF';

const NOMBRE_EQUIPO = 'Equipo docente';
const CENTRO_EJEMPLO = 'Centro de ejemplo';
const DOMINIO_EJEMPLO = S.CENTRO.dominio;

// ---------------------------------------------------------------- XML básico
const esc = (t) => String(t == null ? '' : t)
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const dec = (t) => String(t == null ? '' : t)
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&nbsp;/g, '\u00A0')
  .replace(/&amp;/g, '&');

// Un part del zip puede traer BOM. Se conserva porque, si no, cambia el primer
// byte de un XML que no teníamos por qué tocar.
function leerTexto(buffer) {
  if (!buffer || !buffer.length) return { texto: '', bom: '' };
  if (buffer[0] === 0xFF && buffer[1] === 0xFE) {
    return { texto: buffer.slice(2).toString('utf16le'), bom: 'utf16le' };
  }
  let texto = buffer.toString('utf8');
  let bom = '';
  if (texto.charCodeAt(0) === 0xFEFF) { bom = BOM; texto = texto.slice(1); }
  return { texto, bom };
}

function escribirTexto(texto, bom) {
  if (bom === 'utf16le') {
    return Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from(texto, 'utf16le')]);
  }
  return Buffer.from((bom || '') + texto, 'utf8');
}

const atributo = (etiqueta, nombre) => {
  const m = String(etiqueta).match(new RegExp('\\s' + nombre + '\\s*=\\s*"([^"]*)"', 'i'));
  return m ? dec(m[1]) : null;
};

const cambiarAtributo = (etiqueta, nombre, valor) => {
  const re = new RegExp('(\\s' + nombre + '\\s*=\\s*")[^"]*(")', 'i');
  if (re.test(etiqueta)) return etiqueta.replace(re, (_, a, b) => a + esc(valor) + b);
  return etiqueta.replace(/>$/, ' ' + nombre + '="' + esc(valor) + '">');
};

// Bloques XML con anidamiento (w:p puede contener w:p dentro de un cuadro de
// texto; w:tbl puede contener w:tbl). Devuelve posiciones absolutas.
function buscarBloques(xml, etiqueta) {
  const abrir = new RegExp('<' + etiqueta + '(?:\\s[^>]*)?>', 'gi');
  const cerrar = new RegExp('</' + etiqueta + '>', 'gi');
  const pila = [];
  const out = [];
  const eventos = [];
  let m;
  while ((m = abrir.exec(xml))) {
    const finTag = xml.indexOf('>', m.index);
    if (finTag < 0) continue;
    if (xml.slice(m.index, finTag + 1).endsWith('/>')) continue;
    eventos.push({ tipo: 'abre', pos: m.index, fin: finTag + 1, orden: eventos.length });
  }
  while ((m = cerrar.exec(xml))) {
    eventos.push({ tipo: 'cierra', pos: m.index, fin: m.index + m[0].length, orden: eventos.length });
  }
  eventos.sort((a, b) => a.pos - b.pos || a.orden - b.orden);
  for (const e of eventos) {
    if (e.tipo === 'abre') pila.push(e);
    else {
      const a = pila.pop();
      if (a) out.push({ inicio: a.pos, fin: e.fin, finApertura: a.fin });
    }
  }
  return out.sort((a, b) => a.inicio - b.inicio);
}

// ---------------------------------------------------------------- párrafos
// Un párrafo se parte en segmentos por los saltos de línea (`w:br`, `w:cr`) y
// por los tabuladores: un nombre nunca cruza un salto, y así una sustitución no
// se lleva por delante la maquetación. `w:instrText` no cuenta como texto
// visible: son códigos de campo y no se tocan desde aquí.
const RE_TOKEN = /<(w:t|w:delText|w:instrText)(\s[^>]*)?>([\s\S]*?)<\/\1>|<w:(br|cr|tab)(?:\s[^>]*)?\/>/g;

function parseEstilos(stylesXml) {
  const out = new Map();
  for (const m of String(stylesXml || '').matchAll(/<w:style\s[^>]*w:styleId="([^"]+)"[^>]*>([\s\S]*?)<\/w:style>/g)) {
    const n = m[2].match(/<w:name\s+w:val="([^"]+)"/);
    const o = m[2].match(/<w:outlineLvl\s+w:val="(\d+)"/);
    const nombre = n ? dec(n[1]) : '';
    let nivel = o ? Number(o[1]) + 1 : null;
    if (!nivel) {
      const h = nombre.match(/^heading\s*(\d)/i);
      if (h) nivel = Number(h[1]);
    }
    out.set(m[1], { nombre, nivel });
  }
  return out;
}

function parseParrafos(xml, estilos) {
  const bloques = buscarBloques(xml, 'w:p');
  const out = [];
  for (const b of bloques) {
    const interior = xml.slice(b.finApertura, b.fin - 6);
    // Solo los párrafos hoja: los de dentro de un cuadro de texto se editan por
    // separado, y editar el exterior borraría su contenido. Ojo: `<w:pPr>` no es
    // un párrafo; la comprobación mira el espacio o el cierre de la etiqueta.
    if (/<w:p(?:\s|>)/.test(interior)) continue;
    const segmentos = [];
    let seg = { texto: '', nodos: [], inicioTexto: null, finTexto: null, separador: '' };
    let tieneInstr = false;
    const cerrar = (separador) => {
      seg.separador = separador;
      segmentos.push(seg);
      seg = { texto: '', nodos: [], inicioTexto: null, finTexto: null, separador: '' };
    };
    // Solo cuenta lo que está dentro de un `<w:r>`. Sin esta condición, el
    // `<w:tab/>` de un `<w:pPr><w:tabs>` —que no es un tabulador sino la
    // DEFINICIÓN de una posición de tabulación— entraba como nodo de texto: metía
    // un '\t' fantasma al principio del párrafo y, al reescribirlo, la edición
    // caía dentro de `<w:tabs>`. El XML quedaba bien formado y Word se negaba a
    // abrir el documento. `buscarBloques` no confunde `<w:r>` con `<w:rPr>`, y
    // los run no se anidan, así que basta con avanzar un puntero.
    const runs = buscarBloques(interior, 'w:r');
    let ri = 0;
    for (const m of interior.matchAll(RE_TOKEN)) {
      while (ri < runs.length && runs[ri].fin <= m.index) ri += 1;
      if (!(ri < runs.length && m.index >= runs[ri].finApertura && m.index < runs[ri].fin)) continue;
      if (m[1]) {
        const tipo = m[1];
        if (tipo === 'w:instrText') { tieneInstr = true; continue; }
        const corte = m[0].indexOf('>') + 1;
        const apertura = interior.slice(m.index, m.index + corte);
        const inicioTexto = b.finApertura + m.index + corte;
        const crudo = m[3] || '';
        const limpio = dec(crudo);
        const nodo = {
          tipo, apertura, inicioTexto, finTexto: inicioTexto + crudo.length,
          inicio: seg.texto.length, fin: seg.texto.length + limpio.length, texto: limpio,
        };
        if (seg.inicioTexto == null) seg.inicioTexto = b.finApertura + m.index;
        seg.finTexto = nodo.finTexto;
        seg.nodos.push(nodo);
        seg.texto += limpio;
      } else {
        const tipo = m[4];
        if (tipo === 'tab') {
          const nodo = {
            tipo: 'w:tab', apertura: m[0], inicioTexto: b.finApertura + m.index,
            finTexto: b.finApertura + m.index + m[0].length,
            inicio: seg.texto.length, fin: seg.texto.length + 1, texto: '\t',
          };
          if (seg.inicioTexto == null) seg.inicioTexto = b.finApertura + m.index;
          seg.finTexto = nodo.finTexto;
          seg.nodos.push(nodo);
          seg.texto += '\t';
        } else {
          cerrar('\n');
        }
      }
    }
    cerrar('');
    const ps = interior.match(/<w:pStyle\s+w:val="([^"]+)"/);
    const estilo = ps ? estilos.get(ps[1]) : null;
    const conTOC = /<w:instrText[^>]*>[\s\S]*?\bTOC\b[\s\S]*?<\/w:instrText>/i.test(interior)
      || (estilo && /^(?:TOC|TDC|TtuloTDC)/i.test(estilo.nombre || ''));
    out.push({
      inicio: b.inicio, fin: b.fin, interior,
      pStyle: ps ? ps[1] : null,
      nivel: estilo ? estilo.nivel : null,
      nombreEstilo: estilo ? estilo.nombre : '',
      esTOC: !!conTOC,
      esTitulo: !!(estilo && estilo.nivel && estilo.nivel >= 1 && estilo.nivel <= 6 && !conTOC),
      tieneNumPr: /<w:numPr[\s>]/.test(interior),
      tieneInstr: tieneInstr || /<w:instrText[\s>]/.test(interior),
      segmentos,
      nodos: [].concat(...segmentos.map((s) => s.nodos)),
      texto: segmentos.map((s) => s.texto + s.separador).join(''),
    });
  }
  return out;
}

function etiquetaTexto(tipo, apertura, texto) {
  let a = apertura;
  if (texto && /^\s|\s$/.test(texto) && !/xml:space=/.test(a)) {
    a = a.replace(/\s*>$/, ' xml:space="preserve">');
  }
  return a;
}

function textoNodoConCambios(nodo, cambios, inserciones) {
  let out = '';
  for (let p = nodo.inicio; p < nodo.fin; p += 1) {
    if (inserciones.has(p)) out += inserciones.get(p);
    let tocado = false;
    for (const c of cambios) {
      if (p < c.ini || p >= c.fin) continue;
      if (p === c.ini) out += c.texto;
      tocado = true;
      break;
    }
    if (!tocado) out += nodo.texto[p - nodo.inicio];
  }
  if (inserciones.has(nodo.fin)) out += inserciones.get(nodo.fin);
  return out;
}

// Las ediciones que hay que hacer en el XML para aplicar unos cambios de texto
// a un segmento. Los cambios vienen con coordenadas relativas al texto del
// segmento y las ediciones salen con las absolutas del XML. El texto nuevo va al
// primer nodo afectado y el resto se vacía; los run y sus propiedades siguen ahí.
function edicionesDeSegmento(seg, cambios) {
  if (!seg || !seg.nodos.length || !cambios || !cambios.length) return [];
  const lista = cambios.filter((c) => c && c.ini <= c.fin).sort((a, b) => a.ini - b.ini || a.fin - b.fin);
  const inserciones = new Map();
  const reemplazos = [];
  for (const c of lista) {
    if (c.ini === c.fin) inserciones.set(c.ini, (inserciones.get(c.ini) || '') + c.texto);
    else reemplazos.push(c);
  }
  const ediciones = [];
  for (const nodo of seg.nodos) {
    const nuevo = textoNodoConCambios(nodo, reemplazos, inserciones);
    if (nuevo === nodo.texto) continue;
    if (nodo.tipo === 'w:tab') {
      // El tabulador se queda donde está y el texto nuevo va detrás, en su
      // propio `<w:t>`. Sustituir el `<w:tab/>` por texto no rompe el XML, pero
      // convierte una tabulación en caracteres y la alineación del párrafo se
      // mueve: el documento ya no es el mismo. Si a este nodo no le toca texto,
      // no se toca nada.
      if (!nuevo) continue;
      ediciones.push({
        inicio: nodo.finTexto, fin: nodo.finTexto,
        texto: '<w:t xml:space="preserve">' + esc(nuevo) + '</w:t>',
      });
      continue;
    }
    const apertura = etiquetaTexto(nodo.tipo, nodo.apertura, nuevo);
    // El rango llega hasta el final de la etiqueta de cierre, no hasta el final
    // del texto: si no, se escribe un cierre nuevo y el de antes se queda
    // detrás. `</w:t></w:t>` lo perdonan los analizadores tolerantes —el
    // reimportado salía bien y las comprobaciones en verde— y Word no: se niega
    // a abrir el documento. RE_TOKEN solo casa elementos con cierre, así que
    // está siempre justo después del texto.
    const cierre = '</' + nodo.tipo + '>';
    ediciones.push({
      inicio: nodo.inicioTexto - nodo.apertura.length, fin: nodo.finTexto + cierre.length,
      texto: apertura + esc(nuevo) + cierre,
    });
  }
  return ediciones;
}

// Aplica todas las ediciones en una sola pasada, y que sea una sola importa: esto
// se hacía con `xml = xml.slice(0, ini) + texto + xml.slice(fin)` por edición, y
// como cada rebanada copia la cadena entera, en la programación de DAW —cuyo
// `document.xml` son 22 MB descomprimidos y lleva unas 1.600 ediciones— eso son
// 35 GB de copia de cadenas: ocho minutos y medio por cada llamada a generar(),
// que además se hace dos veces para comprobar que da los mismos bytes. Con una
// pasada y un `join` el coste es el tamaño del documento y no el tamaño
// multiplicado por el número de cambios.
function aplicarEdicionesXml(xml, ediciones) {
  if (!ediciones || !ediciones.length) return xml;
  const lista = ediciones.slice().sort((a, b) => a.inicio - b.inicio || a.fin - b.fin);
  const trozos = [];
  let cursor = 0;
  for (const e of lista) {
    // Cada edición sale de un nodo distinto, así que no se solapan. Si alguna lo
    // hiciera se descarta, en vez de partir el XML por la mitad.
    if (e.inicio < cursor) continue;
    trozos.push(xml.slice(cursor, e.inicio), e.texto);
    cursor = e.fin;
  }
  trozos.push(xml.slice(cursor));
  return trozos.join('');
}

function aplicarCambiosSegmento(xml, seg, cambios) {
  return aplicarEdicionesXml(xml, edicionesDeSegmento(seg, cambios));
}

// Lo mismo para una lista de segmentos con sus cambios, [{ seg, cambios }], que
// es como la arman las etapas.
function aplicarPorSegmentos(xml, eds) {
  const todas = [];
  for (const e of eds) {
    for (const ed of edicionesDeSegmento(e.seg, e.cambios)) todas.push(ed);
  }
  return aplicarEdicionesXml(xml, todas);
}

// Compatibilidad con las llamadas por párrafo: reparte cada cambio al segmento
// que lo contiene. Los cambios nunca cruzan un salto en las etapas de este
// módulo; si lo hicieran, se quedarían en el primer segmento.
function aplicarCambiosParrafo(xml, parrafo, cambios) {
  const lista = (cambios || []).slice();
  let base = 0;
  const eds = [];
  for (const seg of parrafo.segmentos) {
    const ini = base;
    const fin = base + seg.texto.length;
    const propias = [];
    for (const c of lista) {
      if (c.ini >= ini && c.fin <= fin) propias.push({ ini: c.ini - ini, fin: c.fin - ini, texto: c.texto });
    }
    if (propias.length) eds.push({ seg, cambios: propias });
    base = fin + (seg.separador ? seg.separador.length : 0);
  }
  return aplicarPorSegmentos(xml, eds);
}

// Recorre los segmentos de una lista de párrafos, pide los cambios y los aplica
// de atrás adelante para que las posiciones absolutas sigan siendo válidas.
function editarSegmentos(xml, parrafos, fn) {
  const eds = [];
  parrafos.forEach((p, pi) => {
    p.segmentos.forEach((seg, si) => {
      if (!seg.nodos.length) return;
      const cambios = fn(seg, p, pi, si);
      if (cambios && cambios.length) eds.push({ seg, cambios });
    });
  });
  eds.sort((a, b) => b.seg.inicioTexto - a.seg.inicioTexto);
  xml = aplicarPorSegmentos(xml, eds);
  return { xml, cambios: eds.length };
}

// ---------------------------------------------------------------- diff y limpieza
function aplicarEdiciones(texto, mapa, ediciones) {
  const eds = ediciones.filter((e) => e && e.i <= e.j).sort((a, b) => a.i - b.i || a.j - b.j);
  let out = '';
  const nuevoMapa = [];
  let pos = 0;
  for (const e of eds) {
    if (e.i < pos) continue;
    for (let p = pos; p < e.i; p += 1) { out += texto[p]; nuevoMapa.push(mapa[p]); }
    for (const ch of e.texto) { out += ch; nuevoMapa.push(mapa[e.i]); }
    pos = e.j;
  }
  for (let p = pos; p < texto.length; p += 1) { out += texto[p]; nuevoMapa.push(mapa[p]); }
  nuevoMapa.push(mapa[texto.length]);
  return { texto: out, mapa: nuevoMapa };
}

function reemplazarRegex(texto, re, fn) {
  if (!re) return [];
  const out = [];
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(texto))) {
    if (!m[0]) { re.lastIndex += 1; continue; }
    const por = fn(m[0], ...m.slice(1));
    if (por !== undefined && por !== null && String(por) !== m[0]) {
      out.push({ i: m.index, j: m.index + m[0].length, texto: String(por) });
    }
  }
  return out;
}

// Las mismas fases que `limpiar` de lib/sanear.js, pero devolviendo las
// ediciones y su posición en el texto original. Sirve para cambiar solo los
// trozos afectados y no meter toda la frase en el primer run.
function limpiarConCambios(P, original) {
  let texto = original;
  let mapa = Array.from({ length: original.length + 1 }, (_, i) => i);
  const fases = [];

  const porFase = (nombre, ediciones) => {
    if (!ediciones.length) return;
    fases.push({ nombre, ediciones });
    const r = aplicarEdiciones(texto, mapa, ediciones);
    texto = r.texto;
    mapa = r.mapa;
  };

  for (const [re, por] of P.sustituciones) porFase('sustitucion', reemplazarRegex(texto, re, () => por));
  for (const [re, fn] of P.rCentro) porFase('centro', reemplazarRegex(texto, re, fn));

  const personas = [];
  S.cadaMencion(texto, P.personas, (i, j, p) => personas.push({ i, j, texto: p.inventado }));
  porFase('persona', personas);

  porFase('empresa', reemplazarRegex(texto, P.rEmp, (m) => P.buscar(P.mapas.empresas, m)));
  porFase('pueblo', reemplazarRegex(texto, P.rPue, (m) => P.buscar(P.mapas.pueblos, m)));

  porFase('correo', reemplazarRegex(texto, S.RE_CORREO, (m) => {
    if (m.endsWith('@' + P.C.dominio)) return m;
    return P.k.correo(m);
  }));
  porFase('telefono', reemplazarRegex(texto, S.RE_TELEFONO, (m) => {
    if (S.digitosDeTelefono(m).length !== 9 || S.esTelefonoInventado(m)) return m;
    return P.k.telefono(m);
  }));
  porFase('documento', reemplazarRegex(texto, S.RE_DOCUMENTO, (m) => P.k.documento(m)));

  // De la yema de ediciones se saca el diff mínimo contra el original. La
  // composición de mapas evita que una sustitución posterior se pierda.
  if (texto === original) return { texto, cambios: [], fases };
  return { texto, cambios: edicionesPorMapa(original, texto, mapa), fases };
}

function edicionesPorMapa(original, final, mapa) {
  const out = [];
  let o = 0;
  let f = 0;
  while (f < final.length) {
    if (o < original.length && mapa[f] === o && final[f] === original[o]) { o += 1; f += 1; continue; }
    const ini = o;
    const fIni = f;
    let resync = -1;
    for (let f2 = f + 1; f2 <= final.length; f2 += 1) {
      const o2 = mapa[f2];
      if (o2 < ini) continue;
      if (f2 === final.length) { resync = f2; o = o2; f = f2; break; }
      // Dos caracteres seguidos alineados: un solo carácter podría ser
      // casualidad dentro de una palabra sustituida.
      if (o2 + 1 <= original.length && final[f2] === original[o2]
        && mapa[f2 + 1] === o2 + 1 && final[f2 + 1] === original[o2 + 1]) {
        resync = f2; o = o2; f = f2; break;
      }
    }
    if (resync < 0) {
      out.push({ ini, fin: original.length, texto: final.slice(fIni) });
      o = original.length; f = final.length;
      break;
    }
    out.push({ ini, fin: o, texto: final.slice(fIni, resync) });
  }
  if (o < original.length) out.push({ ini: o, fin: original.length, texto: '' });
  return out;
}


// ---------------------------------------------------------------- tablas
function desplazarParrafo(p, base) {
  const out = Object.assign({}, p, { inicio: p.inicio + base, fin: p.fin + base });
  out.segmentos = p.segmentos.map((s) => Object.assign({}, s, {
    inicioTexto: s.inicioTexto == null ? null : s.inicioTexto + base,
    finTexto: s.finTexto == null ? null : s.finTexto + base,
    nodos: s.nodos.map((n) => Object.assign({}, n, {
      inicioTexto: n.inicioTexto + base, finTexto: n.finTexto + base,
    })),
  }));
  out.nodos = [].concat(...out.segmentos.map((s) => s.nodos));
  return out;
}

const RE_BOLD = /<w:b(?:\s+w:val="(?:1|true|on)")?\s*\/>/;

// Negrita de una celda: lo está si TODOS sus tramos con texto lo están, que es
// el mismo criterio que usa el importador sobre el HTML. Buscar `<w:b/>` en el
// XML de la celda sin más no vale: Word guarda también las propiedades de la
// marca de párrafo en `<w:pPr><w:rPr>`, y ahí aparece un `<w:b/>` que no afecta
// a ninguna letra. Con eso, una celda de contenido pasaba por etiqueta, la regla
// por exclusión la tomaba por una fila de etiquetas y dejaba sin reescribir el
// material docente que colgaba de la etiqueta anterior.
function esNegritaInterior(interior) {
  const conTexto = [...String(interior).matchAll(/<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g)]
    .map((m) => m[0])
    .filter((r) => /<w:t[\s>]/.test(r));
  if (!conTexto.length) return false;
  return conTexto.every((r) => {
    const rpr = /<w:rPr>([\s\S]*?)<\/w:rPr>/.exec(r);
    return !!rpr && RE_BOLD.test(rpr[1]);
  });
}

function celdaDe(xml, c, estilos) {
  const parrafos = parseParrafos(xml.slice(c.inicio, c.fin), estilos).map((p) => desplazarParrafo(p, c.inicio));
  const interior = xml.slice(c.inicio, c.fin);
  const span = interior.match(/<w:gridSpan\s+w:val="(\d+)"/);
  return {
    inicio: c.inicio, fin: c.fin, parrafos,
    text: parrafos.map((p) => p.texto).join('\n'),
    bold: esNegritaInterior(interior),
    colspan: span ? Number(span[1]) : 1,
    rowspan: 1,
  };
}

function tablasDe(xml, estilos) {
  const tbls = buscarBloques(xml, 'w:tbl');
  if (!tbls.length) return [];
  const trs = buscarBloques(xml, 'w:tr');
  const tcs = buscarBloques(xml, 'w:tc');
  const dentro = (r, o) => r.inicio >= o.inicio && r.fin <= o.fin;
  const exteriores = tbls.filter((t) => !tbls.some((o) => o !== t && o.inicio <= t.inicio && o.fin >= t.fin));
  return exteriores.map((t) => {
    const anidadas = tbls.filter((o) => o !== t && dentro(o, t));
    const filas = trs
      .filter((r) => dentro(r, t) && !anidadas.some((o) => dentro(r, o)))
      .map((r) => ({
        inicio: r.inicio, fin: r.fin,
        celdas: tcs
          .filter((c) => dentro(c, r) && !anidadas.some((o) => dentro(c, o)))
          .map((c) => celdaDe(xml, c, estilos)),
      }));
    const repetidas = new Map();
    filas.forEach((f) => f.celdas.forEach((c) => {
      const k = S.claveTexto(c.text);
      repetidas.set(k, (repetidas.get(k) || 0) + 1);
    }));
    const cabPersona = filas.findIndex((f) => f.celdas.some((c, j) => S.esColumnaDePersona(f.celdas, j, '')));
    const colsPersona = new Set();
    if (cabPersona >= 0) {
      filas[cabPersona].celdas.forEach((c, j) => {
        if (S.esColumnaDePersona(filas[cabPersona].celdas, j, '')) colsPersona.add(j);
      });
    }
    const tabla = { inicio: t.inicio, fin: t.fin, filas, repetidas, cabPersona, colsPersona };
    filas.forEach((f, i) => f.celdas.forEach((c, j) => {
      c.fila = i;
      c.columna = j;
      c.tabla = tabla;
      c.cabecera = i === 0 && c.text.length <= 60;
      c.persona = cabPersona >= 0 && i > cabPersona && colsPersona.has(j);
      c.iniciales = cabPersona >= 0 && i === cabPersona && /^iniciales$/.test(S.claveTexto(c.text));
    }));
    return tabla;
  });
}

function mapaCeldas(tablas) {
  const m = new Map();
  tablas.forEach((t) => t.filas.forEach((f) => f.celdas.forEach((c) => c.parrafos.forEach((p) => m.set(p.inicio, c)))));
  return m;
}

// Una celda que es etiqueta: negrita, cabecera, corta, un código, repetida en
// la tabla o una frase de enlace. Es la misma idea que `reescribirTabla` de
// lib/sanear.js. Las celdas de una columna de personas no llegan aquí: las
// cambia la etapa de sustituciones, para que el nombre y las iniciales sigan
// cuadrando.
function esEtiquetaCelda(c) {
  const t = String(c.text || '').trim();
  if (!t) return true;
  if (c.bold || c.cabecera) return true;
  if (t.length <= 20 && !/\p{Lu}{2,}|\d/u.test(t)) return true;
  if (/^\d+\s?[ºªa-z]?\.?$/i.test(t)) return true;
  if (c.tabla.repetidas.get(S.claveTexto(t)) > 1) return true;
  if (S.seConserva(t)) return true;
  return false;
}

function parrafosEnRango(parrafos, ini, fin) {
  return parrafos.filter((p) => p.inicio >= ini && p.fin <= fin);
}

function contextoModulo(parrafos, pos) {
  const hs = parrafos.filter((p) => p.inicio < pos && p.esTitulo);
  const sa = [...hs].reverse().find((p) => /^situacion de aprendizaje\b/i.test(F.norm(p.texto)));
  const nivel = sa && sa.nivel ? sa.nivel : 0;
  const mod = [...hs].reverse().find((p) => (!sa || p.nivel < nivel)
    && !/^situacion de aprendizaje\b/i.test(F.norm(p.texto)));
  return {
    modulo: mod ? mod.texto.trim() : '',
    titulo: sa ? sa.texto.trim() : '',
    num: sa ? (sa.texto.match(/(\d+)/) || [])[1] : '',
  };
}


// ---------------------------------------------------------------- etapas
function objetivosDeReescritura(P) {
  const out = [];
  const ver = new Set();
  const alta = (clave, tema, apartado) => {
    const trozo = clave.split('/').pop();
    const s = slug(trozo);
    if (ver.has(s)) return;
    ver.add(s);
    out.push({ slug: s, tema, clave, apartado: !!apartado });
  };
  Object.keys(P.tablaReescribir).forEach((k) => alta(k, P.tablaReescribir[k], false));
  Object.keys(S.APARTADOS_DOCENTES).forEach((k) => alta(k, S.APARTADOS_DOCENTES[k], true));
  return out;
}

function sumarCambios(informe, fases) {
  for (const f of fases) informe.cambios[f.nombre] = (informe.cambios[f.nombre] || 0) + f.ediciones.length;
}

// Apartados que traen valoraciones internas. Se localiza el título por el último
// segmento de la clave y se reescribe todo lo que cuelga de él hasta el
// siguiente título del mismo nivel o superior. Los títulos y las etiquetas de
// las tablas se conservan; las personas las cambia después la etapa global.
function reescribirApartados(xml, estilos, P, informe) {
  const parrafos = parseParrafos(xml, estilos);
  const titulos = parrafos.filter((p) => p.esTitulo && !p.esTOC);
  const objetivos = objetivosDeReescritura(P).filter((o) => !o.apartado);
  const tablas = tablasDe(xml, estilos);
  const celdas = mapaCeldas(tablas);
  const rangos = [];
  for (const h of titulos) {
    const obj = objetivos.find((o) => o.slug === slug(h.texto));
    if (!obj) continue;
    const siguiente = titulos.find((x) => x.inicio > h.inicio && x.nivel <= h.nivel);
    rangos.push({ ini: h.fin, fin: siguiente ? siguiente.inicio : xml.length, tema: obj.tema, clave: obj.clave });
  }
  const merged = [];
  for (const r of rangos.sort((a, b) => a.ini - b.ini)) {
    if (merged.some((m) => r.ini >= m.ini && r.fin <= m.fin)) continue;
    merged.push(r);
  }
  const eds = [];
  const tocados = new Set();
  for (const r of merged) {
    const usadas = new Set();
    const ps = parrafosEnRango(parrafos, r.ini, r.fin);
    ps.forEach((p) => {
      if (p.esTitulo || p.esTOC) return;
      const celda = celdas.get(p.inicio);
      p.segmentos.forEach((seg, si) => {
        const texto = seg.texto;
        if (!texto.trim()) return;
        if (celda && (celda.persona || celda.iniciales)) return;
        if (celda && esEtiquetaCelda(celda)) return;
        if (S.seConserva(texto)) return;
        const comoItem = p.tieneNumPr || /^\s*(?:[-–—•*·]|\d+[.)]|[a-zñ]\))\s+/i.test(texto);
        let nuevo = S.inventarTexto(r.tema, 'doc|' + r.clave + '|' + p.inicio + '|' + si, texto.length, comoItem, P.C, usadas);
        const pre = (S.PREFIJO_VINETA.exec(texto) || ['', ''])[1];
        if (pre && nuevo.indexOf(pre) !== 0) nuevo = pre + nuevo;
        if (nuevo !== texto) {
          eds.push({ seg, cambios: [{ ini: 0, fin: texto.length, texto: nuevo }] });
          tocados.add(p.inicio);
        }
      });
    });
    informe.apartadosReescritos += 1;
  }
  eds.sort((a, b) => b.seg.inicioTexto - a.seg.inicioTexto);
  xml = aplicarPorSegmentos(xml, eds);
  informe.cambios.apartadosReescritos = (informe.cambios.apartadosReescritos || 0) + tocados.size;
  return xml;
}

function slotsDeCelda(celda) {
  const out = [];
  for (const p of celda.parrafos) {
    for (const s of p.segmentos) if (s.nodos.length && s.texto.trim()) out.push(s);
  }
  return out;
}

function edicionesLineasCelda(celda, texto) {
  const slots = slotsDeCelda(celda);
  if (!slots.length) return [];
  const nuevas = String(texto == null ? '' : texto).split('\n').filter((l) => l.trim() !== '');
  const eds = [];
  if (nuevas.length === slots.length) {
    slots.forEach((s, i) => {
      if (nuevas[i] !== s.texto) eds.push({ seg: s, cambios: [{ ini: 0, fin: s.texto.length, texto: nuevas[i] }] });
    });
  } else {
    // No debería ocurrir: sanearTablaFicha conserva el número de líneas de cada
    // celda. Si ocurre, no se pierde texto: lo que sobra se une a la última.
    const asignadas = slots.map((s, i) => (nuevas[i] === undefined ? '' : nuevas[i]));
    if (nuevas.length > slots.length) asignadas[slots.length - 1] += ' ' + nuevas.slice(slots.length).join(' ');
    slots.forEach((s, i) => {
      if (asignadas[i] !== s.texto) eds.push({ seg: s, cambios: [{ ini: 0, fin: s.texto.length, texto: asignadas[i] }] });
    });
  }
  return eds;
}

// Fichas de situación de aprendizaje: se reconoce la tabla por su primera celda
// y se clasifican las celdas con la misma función que usa el saneador del
// modelo. Se escribe línea a línea en los párrafos que ya había: ni se añaden ni
// se quitan párrafos, y los que estaban vacíos siguen vacíos.
function sanearFichasXml(xml, estilos, P, informe) {
  const parrafos = parseParrafos(xml, estilos);
  const tablas = tablasDe(xml, estilos);
  const g = informe.generador;
  const eds = [];
  for (const t of tablas) {
    const primera = t.filas[0] && t.filas[0].celdas[0] ? t.filas[0].celdas[0].text : '';
    if (!/^situacion de aprendizaje\b/i.test(F.norm(primera))) continue;
    const filas = t.filas.map((f) => f.celdas.map((c) => ({
      text: c.text, bold: c.bold, colspan: c.colspan, rowspan: c.rowspan, _celda: c,
    })));
    const ctx = contextoModulo(parrafos, t.inicio);
    const num = (primera.match(/(\d+)/) || [])[1];
    const cabecera = {
      modulo: ctx.modulo,
      titulo: filas[0] && filas[0][1] ? String(filas[0][1].text || '').trim() : ctx.titulo,
      num: num == null ? ctx.num : num,
    };
    const hechos = {};
    const tocada = S.sanearTablaFicha(filas, cabecera, g, hechos);
    informe.fichas += 1;
    if (!tocada) continue;
    filas.forEach((fila) => fila.forEach((c) => {
      const original = c._celda.text;
      const nuevo = String(c.text == null ? '' : c.text);
      if (nuevo === original) return;
      eds.push(...edicionesLineasCelda(c._celda, nuevo));
    }));
  }
  // Todas las ediciones se han calculado sobre el mismo XML: se aplican de
  // atrás adelante para que las posiciones de las fichas anteriores no cambien.
  eds.sort((a, b) => b.seg.inicioTexto - a.seg.inicioTexto);
  xml = aplicarPorSegmentos(xml, eds);
  informe.cambios.materialDocente = (informe.cambios.materialDocente || 0) + eds.length;
  return xml;
}

// «Recursos específicos»: en el documento real es una copia de los materiales de
// las fichas. Se reescribe con el mismo generador, respetando las viñetas y sin
// tocar las líneas que son una etiqueta.
function recursosEspecificos(xml, estilos, P, informe) {
  const parrafos = parseParrafos(xml, estilos);
  const titulos = parrafos.filter((p) => p.esTitulo && !p.esTOC);
  const objetivos = objetivosDeReescritura(P).filter((o) => o.apartado);
  if (!objetivos.length) return xml;
  const eds = [];
  // Cada apartado se repite UNA VEZ POR MÓDULO, así que hay que recorrer todos
  // los títulos que casen y no solo el primero. Buscando solo el primero se
  // reescribían los recursos de un módulo y los de los otros catorce se
  // publicaban literales; y como el material de una ficha solo coincide con el
  // de su apartado en algunos módulos, la comprobación de material docente
  // únicamente delataba esos.
  for (const objetivo of objetivos) {
    for (const h of titulos.filter((p) => objetivo.slug === slug(p.texto))) {
      const siguiente = titulos.find((x) => x.inicio > h.inicio && x.nivel <= h.nivel);
      const fin = siguiente ? siguiente.inicio : xml.length;
      const slots = [];
      parrafosEnRango(parrafos, h.fin, fin).forEach((p) => {
        if (p.esTitulo || p.esTOC) return;
        p.segmentos.forEach((s) => {
          if (!s.nodos.length || !s.texto.trim()) return;
          if (S.seConserva(s.texto)) return;
          slots.push(s);
        });
      });
      if (!slots.length) continue;
      const ctx = contextoModulo(parrafos, h.inicio);
      const nuevas = S.inventarActividades(informe.generador, {
        modulo: ctx.modulo, titulo: 'Recursos específicos', num: '',
      }, 'recursos', slots.length, slots.map((s) => s.texto), '');
      slots.forEach((s, i) => {
        let nuevo = nuevas[i] || '';
        const pre = (S.PREFIJO_VINETA.exec(s.texto) || ['', ''])[1];
        if (pre && nuevo.indexOf(pre) !== 0) nuevo = pre + nuevo;
        if (nuevo !== s.texto) eds.push({ seg: s, cambios: [{ ini: 0, fin: s.texto.length, texto: nuevo }] });
      });
    }
  }
  eds.sort((a, b) => b.seg.inicioTexto - a.seg.inicioTexto);
  xml = aplicarPorSegmentos(xml, eds);
  informe.cambios.recursos = (informe.cambios.recursos || 0) + eds.length;
  return xml;
}

// Sustituciones globales: personas, centro, empresas, pueblos, correos,
// teléfonos y documentos. Se aplican a todos los tramos de texto visibles, no a
// los códigos de campo.
function sustituirGlobal(xml, estilos, P, informe) {
  const parrafos = parseParrafos(xml, estilos);
  const r = editarSegmentos(xml, parrafos, (seg) => {
    if (!seg.texto.trim()) return null;
    const cambio = limpiarConCambios(P, seg.texto);
    if (!cambio.cambios.length) return null;
    sumarCambios(informe, cambio.fases);
    return cambio.cambios;
  });
  return limpiarCampos(r.xml, P);
}

// Los códigos de campo llevan texto que no se ve y que viaja igual: el
// `HYPERLINK "mailto:..."` de una mención, por ejemplo. Se limpian como el texto
// visible. Hace falta en el documento y también en los comentarios, que no pasan
// por sustituirGlobal: ahí es donde Word deja los correos de las menciones.
function limpiarCampos(xml, P) {
  let x = xml.replace(/<w:instrText([^>]*)>([\s\S]*?)<\/w:instrText>/g, (m, attrs, cuerpo) => {
    const original = dec(cuerpo);
    const limpio = P.limpiar(original);
    return limpio === original ? m : '<w:instrText' + attrs + '>' + esc(limpio) + '</w:instrText>';
  });
  x = x.replace(/(<w:fldSimple\b[^>]*\bw:instr=")([^"]*)(")/g, (m, a, valor, b) => {
    const original = dec(valor);
    const limpio = P.limpiar(original);
    return limpio === original ? m : a + esc(limpio) + b;
  });
  return x;
}

// Iniciales de las tablas de personas: se cambian por las del nombre inventado
// que la etapa anterior ha dejado en la misma fila. Solo dentro de tablas que
// tienen una columna de personas; fuera de ellas una sigla de dos letras puede
// ser cualquier cosa.
function cambiarIniciales(xml, estilos, P, informe) {
  if (!P.mapaIniciales.size) return xml;
  const tablas = tablasDe(xml, estilos);
  const eds = [];
  for (const t of tablas) {
    if (t.cabPersona < 0) continue;
    for (let i = t.cabPersona + 1; i < t.filas.length; i += 1) {
      for (const c of t.filas[i].celdas) {
        for (const p of c.parrafos) {
          for (const s of p.segmentos) {
            if (!s.texto.trim()) continue;
            const nuevo = P.cambiarSiglas(s.texto);
            if (nuevo !== s.texto) eds.push({ seg: s, cambios: [{ ini: 0, fin: s.texto.length, texto: nuevo }] });
          }
        }
      }
    }
  }
  eds.sort((a, b) => b.seg.inicioTexto - a.seg.inicioTexto);
  xml = aplicarPorSegmentos(xml, eds);
  informe.cambios.iniciales = (informe.cambios.iniciales || 0) + eds.length;
  return xml;
}

// Las tablas de empresas, por columnas y no por patrón. En los PCCF la cabecera
// es «CIF | Nombre | Localidad | Sector productivo», los nombres no llevan forma
// jurídica y alguno lleva el pueblo dentro del propio nombre, así que detectar
// empresas por su forma («… S.L.») no las ve todas: lo que manda es la columna en
// la que está la celda. La detección de la tabla y de sus columnas es la misma
// que usa el camino del modelo, `cadaFilaDeEmpresa` de lib/sanear.js.
function tablasDeEmpresas(xml, estilos, P, informe) {
  const tablas = tablasDe(xml, estilos);
  if (!tablas.length) return xml;
  const eds = [];
  for (const t of tablas) {
    const filas = t.filas.map((f) => f.celdas.map((c) => ({ text: c.text })));
    S.cadaFilaDeEmpresa(filas, (fila, col, i) => {
      const celdas = t.filas[i] ? t.filas[i].celdas : [];
      const pon = (j, valor) => {
        const c = celdas[j];
        if (!c || valor == null || valor === c.text) return;
        for (const ed of edicionesLineasCelda(c, valor)) eds.push(ed);
      };
      if (col.empresa !== undefined && S.valida(fila[col.empresa])) {
        const { nombre, forma } = S.partirForma(fila[col.empresa].text);
        if (nombre.trim() && !S.esEmpresaInventada(nombre)) {
          pon(col.empresa, P.k.empresa(nombre) + (forma ? ' ' + forma : ''));
        }
      }
      if (col.pueblo !== undefined && S.valida(fila[col.pueblo])) {
        const sitio = fila[col.pueblo].text.trim();
        if (sitio && !S.esPuebloInventado(sitio, P.C)) pon(col.pueblo, P.k.pueblo(sitio));
      }
      if (col.sector !== undefined && S.valida(fila[col.sector])) {
        const sector = fila[col.sector].text.trim();
        if (sector && S.SECTORES.indexOf(sector) < 0) {
          pon(col.sector, S.SECTORES[S.hash(sector) % S.SECTORES.length]);
        }
      }
    });
  }
  if (!eds.length) return xml;
  informe.cambios.empresas = (informe.cambios.empresas || 0) + eds.length;
  return aplicarPorSegmentos(xml, eds);
}

function transformarDocumento(xml, estilos, P, informe) {
  let x = reescribirApartados(xml, estilos, P, informe);
  x = sanearFichasXml(x, estilos, P, informe);
  x = recursosEspecificos(x, estilos, P, informe);
  // Antes de las sustituciones globales: así la pasada global ya encuentra los
  // nombres inventados en las celdas y no vuelve a tocarlas.
  x = tablasDeEmpresas(x, estilos, P, informe);
  x = sustituirGlobal(x, estilos, P, informe);
  x = cambiarIniciales(x, estilos, P, informe);
  return x;
}


// ---------------------------------------------------------------- metadatos y otras partes
const FECHA_TEXTO = '2000-01-01T00:00:00Z';

const reEscapar = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function reemplazarEtiqueta(xml, etiqueta, valor) {
  const t = reEscapar(etiqueta);
  const re = new RegExp('<' + t + '(\\s[^>]*)?(?:/>|>([\\s\\S]*?)</' + t + '>)');
  const m = re.exec(xml);
  // Si la etiqueta no está, o está vacía o cerrada sobre sí misma, no se toca:
  // no hay nada que ocultar, y escribir ahí un valor añadiría al documento un
  // dato que no traía y una etiqueta que no tenía.
  if (!m || !String(m[2] || '').trim()) return xml;
  return xml.replace(re, (todo, attrs) => '<' + etiqueta + (attrs || '') + '>' + esc(valor) + '</' + etiqueta + '>');
}

function sanearCore(xml) {
  let x = xml;
  x = reemplazarEtiqueta(x, 'dc:title', 'Programación didáctica (ejemplo)');
  x = reemplazarEtiqueta(x, 'dc:subject', '');
  x = reemplazarEtiqueta(x, 'dc:description', '');
  x = reemplazarEtiqueta(x, 'dc:creator', NOMBRE_EQUIPO);
  x = reemplazarEtiqueta(x, 'cp:keywords', '');
  x = reemplazarEtiqueta(x, 'keywords', '');
  x = reemplazarEtiqueta(x, 'cp:lastModifiedBy', NOMBRE_EQUIPO);
  x = reemplazarEtiqueta(x, 'lastModifiedBy', NOMBRE_EQUIPO);
  x = reemplazarEtiqueta(x, 'cp:revision', '1');
  x = reemplazarEtiqueta(x, 'revision', '1');
  x = reemplazarEtiqueta(x, 'cp:lastPrinted', FECHA_TEXTO);
  x = reemplazarEtiqueta(x, 'lastPrinted', FECHA_TEXTO);
  x = reemplazarEtiqueta(x, 'dcterms:created', FECHA_TEXTO);
  x = reemplazarEtiqueta(x, 'dcterms:modified', FECHA_TEXTO);
  return x;
}

function sanearApp(xml) {
  let x = xml;
  x = reemplazarEtiqueta(x, 'Company', CENTRO_EJEMPLO);
  x = reemplazarEtiqueta(x, 'ap:Company', CENTRO_EJEMPLO);
  x = reemplazarEtiqueta(x, 'Manager', NOMBRE_EQUIPO);
  x = reemplazarEtiqueta(x, 'ap:Manager', NOMBRE_EQUIPO);
  x = reemplazarEtiqueta(x, 'Template', 'Normal.dotm');
  x = reemplazarEtiqueta(x, 'ap:Template', 'Normal.dotm');
  x = reemplazarEtiqueta(x, 'TotalTime', '0');
  x = reemplazarEtiqueta(x, 'ap:TotalTime', '0');
  return x;
}

// Relaciones externas: correos, enlaces a unidades de red y a Drive. El destino
// se sustituye, no la relación: el hipervínculo sigue existiendo, pero ya no
// apunta a un recurso real.
function sanearRels(xml, P) {
  return xml.replace(/<Relationship\b[^>]*>/g, (tag) => {
    if (!/\bTargetMode\s*=\s*"External"/i.test(tag)) return tag;
    const target = atributo(tag, 'Target');
    if (!target) return tag;
    let nuevo = 'https://example.org/recurso';
    if (/^mailto:/i.test(target)) nuevo = 'mailto:' + P.limpiar(target.slice(7).split('?')[0]);
    return cambiarAtributo(tag, 'Target', nuevo);
  });
}

function quitarRelacion(xml, fragmento) {
  const re = new RegExp('<Relationship\\b[^>]*\\bTarget="' + reEscapar(fragmento) + '"[^>]*/>', 'g');
  return xml.replace(re, '');
}

function quitarOverride(xml, parte) {
  const re = new RegExp('<Override\\b[^>]*PartName="/' + reEscapar(parte) + '"[^>]*/>', 'g');
  return xml.replace(re, '');
}

function sanearAtributosDeTarea(xml, P) {
  let x = xml.replace(/(\s(?:w:)?(?:userId|userName|title|author|initials|date|time)\s*=\s*")([^"]*)(")/g,
    (m, a, valor, b) => {
      const nombre = a.trim().replace(/^w:/, '').replace(/\s*=.*$/, '');
      if (nombre === 'date' || nombre === 'time') return a + FECHA_TEXTO + b;
      if (nombre === 'initials') return a + 'ED' + b;
      const limpio = P.limpiar(dec(valor));
      return a + esc(limpio) + b;
    });
  x = x.replace(/>([^<]+)</g, (m, texto) => {
    const original = dec(texto);
    const limpio = P.limpiar(original);
    return limpio === original ? m : '>' + esc(limpio) + '<';
  });
  return x;
}

function sanearComentarios(xml, estilos, P) {
  let x = xml.replace(/(\s(?:w:)?(?:author|initials|date)\s*=\s*")([^"]*)(")/g, (m, a, valor, b) => {
    const nombre = a.trim().replace(/^w:/, '').replace(/\s*=.*$/, '');
    if (nombre === 'date') return a + FECHA_TEXTO + b;
    if (nombre === 'initials') return a + 'ED' + b;
    return a + NOMBRE_EQUIPO + b;
  });
  const parrafos = parseParrafos(x, estilos);
  const r = editarSegmentos(x, parrafos, (seg) => {
    if (!seg.texto.trim()) return null;
    return [{ ini: 0, fin: seg.texto.length, texto: 'Comentario de revisión del documento.' }];
  });
  return limpiarCampos(r.xml, P);
}

// Un JPEG puede llevar EXIF (autor, cámara, fecha, coordenadas). Se quita el
// segmento APP1 de EXIF y se copian los demás bytes tal cual.
function quitarExif(buf) {
  if (!buf || buf.length < 4 || buf[0] !== 0xFF || buf[1] !== 0xD8) return { buffer: buf, quitado: false };
  let i = 2;
  const partes = [buf.slice(0, 2)];
  let quitado = false;
  while (i < buf.length) {
    if (buf[i] !== 0xFF) { partes.push(buf.slice(i)); break; }
    const marcador = buf[i + 1];
    if (marcador === 0xD9 || marcador === 0xDA) { partes.push(buf.slice(i)); break; }
    if (i + 4 > buf.length) { partes.push(buf.slice(i)); break; }
    const largo = buf.readUInt16BE(i + 2);
    if (largo < 2) { partes.push(buf.slice(i)); break; }
    const fin = i + 2 + largo;
    const esExif = marcador === 0xE1 && fin <= buf.length
      && buf.slice(i + 4, i + 10).toString('latin1') === 'Exif\u0000\u0000';
    if (esExif) quitado = true;
    else partes.push(buf.slice(i, fin));
    i = fin;
  }
  return { buffer: quitado ? Buffer.concat(partes) : buf, quitado };
}

// ---------------------------------------------------------------- zip
async function generar(buffer, P, informe) {
  const zip = await JSZip.loadAsync(buffer);
  const nombres = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
  const originales = new Map();
  for (const n of nombres) originales.set(n, await zip.file(n).async('nodebuffer'));

  const estilos = parseEstilos(leerTexto(originales.get('word/styles.xml')).texto);
  const eliminados = new Map();
  for (const n of nombres) {
    if (n === 'word/people.xml') eliminados.set(n, 'datos de personas');
    if (/^docProps\/thumbnail\./i.test(n)) eliminados.set(n, 'miniatura de la portada');
    if (/^word\/embeddings\//i.test(n) || /^word\/glossary\//i.test(n)) {
      throw new Error('el documento trae una parte no prevista (' + n + '); no se sanea a ciegas');
    }
  }
  informe.eliminados = eliminados;

  const marcar = (n, motivo) => { if (!informe.editados.has(n)) informe.editados.set(n, motivo); };
  const salida = new JSZip();
  const opciones = { date: FECHA_FIJA, createFolders: false };

  for (const n of nombres) {
    if (eliminados.has(n)) continue;
    const original = originales.get(n);
    let datos = original;
    const comoTexto = (motivo, fn) => {
      marcar(n, motivo);
      const { texto, bom } = leerTexto(original);
      const nuevo = fn(texto);
      if (nuevo !== texto) datos = escribirTexto(nuevo, bom);
    };

    if (n === 'word/document.xml') {
      comoTexto('texto del documento', (texto) => transformarDocumento(texto, estilos, P, informe));
    } else if (/^word\/(?:header|footer)\d*\.xml$/.test(n)
      || n === 'word/footnotes.xml' || n === 'word/endnotes.xml') {
      comoTexto('texto de cabecera o pie', (texto) => sustituirGlobal(texto, estilos, P, informe));
    } else if (n === 'word/comments.xml') {
      comoTexto('comentarios', (texto) => sanearComentarios(texto, estilos, P));
    } else if (n === 'word/tasks.xml' || /^word\/documenttasks\//.test(n)) {
      comoTexto('tareas y atribuciones', (texto) => sanearAtributosDeTarea(texto, P));
    } else if (n === 'docProps/core.xml') {
      comoTexto('propiedades del documento', sanearCore);
    } else if (n === 'docProps/app.xml') {
      comoTexto('propiedades de la aplicación', sanearApp);
    } else if (/\.rels$/i.test(n)) {
      comoTexto('relaciones externas', (texto) => {
        let x = sanearRels(texto, P);
        if (eliminados.has('word/people.xml')) x = quitarRelacion(x, 'people.xml');
        if ([...eliminados.keys()].some((k) => /^docProps\/thumbnail\./i.test(k))) x = quitarRelacion(x, 'docProps/thumbnail.jpeg');
        return x;
      });
    } else if (n === '[Content_Types].xml') {
      comoTexto('tipos de contenido', (texto) => {
        let x = texto;
        if (eliminados.has('word/people.xml')) x = quitarOverride(x, 'word/people.xml');
        if ([...eliminados.keys()].some((k) => /^docProps\/thumbnail\./i.test(k))) x = quitarOverride(x, 'docProps/thumbnail.jpeg');
        return x;
      });
    } else if (/^word\/media\/.*\.jpe?g$/i.test(n)) {
      const r = quitarExif(original);
      if (r.quitado) { marcar(n, 'EXIF de la imagen'); datos = r.buffer; }
    }

    salida.file(n, datos, opciones);
  }
  return salida.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}


// ---------------------------------------------------------------- comprobaciones
function arbolPlantilla(s) {
  return {
    id: s.id,
    tipo: s.tipo || null,
    repetidor: !!s.repetidor,
    instancias: !!s.instancias,
    campos: (s.campos || []).map((c) => ({ id: c.id, tipo: c.tipo })),
    hijos: (s.hijos || []).map(arbolPlantilla),
  };
}

function tablasDeDatos(datos) {
  const out = [];
  const ver = (x, ruta) => {
    if (Array.isArray(x)) { x.forEach((y, i) => ver(y, ruta + '[' + i + ']')); return; }
    if (!x || typeof x !== 'object') return;
    if (Array.isArray(x.filas)) {
      out.push({
        ruta,
        n: x.filas.length,
        rejilla: x.filas.map((f) => (Array.isArray(f) ? f : []).map((c) => [Number(c && c.colspan) || 1, Number(c && c.rowspan) || 1])),
      });
    }
    Object.keys(x).forEach((k) => { if (k !== 'filas') ver(x[k], ruta + '.' + k); });
  };
  ver(datos, '');
  return out;
}

function fichasDeDatos(datos) {
  const out = [];
  const ver = (x) => {
    if (Array.isArray(x)) { x.forEach(ver); return; }
    if (!x || typeof x !== 'object') return;
    if (x.ficha) {
      (Array.isArray(x.ficha) ? x.ficha : [x.ficha]).forEach((f) => {
        if (f && typeof f === 'object' && f.num != null) {
          out.push([f.num, f.titulo, f.sesiones, f.evaluacion, (f.ra || []).join(',')].join('|'));
        }
      });
    }
    Object.keys(x).forEach((k) => { if (k !== 'ficha') ver(x[k]); });
  };
  (datos.instancias || []).forEach((i) => ver(i.valores));
  return out;
}

function compararEstructura(original, re) {
  const fallos = [];
  if (JSON.stringify(arbolPlantilla(original.plantilla)) !== JSON.stringify(arbolPlantilla(re.plantilla))) {
    fallos.push('la plantilla cambia de secciones, anidamiento o tipos de campo');
  }
  const ia = original.datos.instancias || [];
  const ib = re.datos.instancias || [];
  if (ia.length !== ib.length) fallos.push('el número de instancias cambia: ' + ia.length + ' -> ' + ib.length);
  ia.forEach((x, i) => {
    const y = ib[i];
    if (!y) return;
    if (x.titulo !== y.titulo) fallos.push('la instancia ' + (i + 1) + ' cambia de título');
    if (x.num !== y.num) fallos.push('la instancia ' + (i + 1) + ' cambia de número');
    if (x.grupo !== y.grupo) fallos.push('la instancia ' + (i + 1) + ' cambia de grupo');
  });
  const ta = tablasDeDatos(original.datos);
  const tb = tablasDeDatos(re.datos);
  if (ta.length !== tb.length) fallos.push('el número de tablas cambia: ' + ta.length + ' -> ' + tb.length);
  ta.forEach((x, i) => {
    const y = tb[i];
    if (!y) return;
    if (x.n !== y.n) fallos.push('la tabla ' + (i + 1) + ' cambia de número de filas: ' + x.n + ' -> ' + y.n);
    else if (JSON.stringify(x.rejilla) !== JSON.stringify(y.rejilla)) fallos.push('la tabla ' + (i + 1) + ' cambia de combinaciones de celdas');
  });
  const fa = fichasDeDatos(original.datos);
  const fb = fichasDeDatos(re.datos);
  if (fa.length !== fb.length) fallos.push('el número de fichas de SA cambia: ' + fa.length + ' -> ' + fb.length);
  fa.forEach((x, i) => { if (fb[i] !== x) fallos.push('la ficha de SA ' + (i + 1) + ' cambia de número, título, sesiones, evaluación o RA'); });
  return fallos;
}

async function partesDe(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const out = new Map();
  for (const n of Object.keys(zip.files)) {
    if (zip.files[n].dir) continue;
    out.set(n, await zip.file(n).async('nodebuffer'));
  }
  return out;
}

// Etiquetas bien emparejadas. No hace falta un analizador completo: lo que se
// nos escapó fue una etiqueta de cierre de más, y eso lo delata la pila de
// etiquetas abiertas. Los analizadores tolerantes (el del importador entre
// ellos) lo perdonan, así que ninguna de las otras comprobaciones lo veía: el
// documento se reimportaba bien, el PDF se construía, el guardia no encontraba
// nada... y Word se negaba a abrirlo.
function erroresDeXml(texto) {
  const s = String(texto == null ? '' : texto);
  const pila = [];
  const errores = [];
  let i = 0;
  while (i < s.length && errores.length < 5) {
    const lt = s.indexOf('<', i);
    if (lt < 0) break;
    if (s.startsWith('<!--', lt)) {
      const f = s.indexOf('-->', lt);
      if (f < 0) { errores.push('comentario sin cerrar'); break; }
      i = f + 3;
    } else if (s.startsWith('<![CDATA[', lt)) {
      const f = s.indexOf(']]>', lt);
      if (f < 0) { errores.push('CDATA sin cerrar'); break; }
      i = f + 3;
    } else if (s.startsWith('<?', lt) || s.startsWith('<!', lt)) {
      const f = s.indexOf('>', lt);
      if (f < 0) { errores.push('declaración sin cerrar'); break; }
      i = f + 1;
    } else {
      const f = s.indexOf('>', lt);
      if (f < 0) { errores.push('etiqueta sin cerrar en la posición ' + lt); break; }
      const cuerpo = s.slice(lt + 1, f);
      if (cuerpo[0] === '/') {
        const nombre = cuerpo.slice(1).trim();
        const abierta = pila.pop();
        if (abierta !== nombre) {
          errores.push('cierra <' + nombre + '> en la posición ' + lt + ' y lo que estaba abierto era '
            + (abierta ? '<' + abierta + '>' : 'nada'));
        }
      } else if (cuerpo.slice(-1) !== '/') {
        pila.push((cuerpo.match(/^[^\s/>]+/) || [''])[0]);
      }
      i = f + 1;
    }
  }
  if (pila.length) errores.push('quedan ' + pila.length + ' etiqueta(s) sin cerrar: <' + pila.slice(-3).join('> <') + '>');
  return errores;
}

// Un nodo de texto solo puede ser hijo de un `<w:r>`. Es una invariante del
// formato, no una preferencia: un `<w:t>` colgado de un `<w:tabs>` deja el XML
// bien formado, pasa el esquema de etiquetas por alto y Word se niega a abrir el
// documento sin decir dónde está el problema.
function textosFueraDeRun(texto) {
  const s = String(texto == null ? '' : texto);
  const pila = [];
  const malos = new Map();
  let i = 0;
  while (i < s.length) {
    const lt = s.indexOf('<', i);
    if (lt < 0) break;
    if (s.startsWith('<!--', lt)) { const f = s.indexOf('-->', lt); i = f < 0 ? s.length : f + 3; continue; }
    if (s.startsWith('<?', lt) || s.startsWith('<!', lt)) { const f = s.indexOf('>', lt); i = f < 0 ? s.length : f + 1; continue; }
    const f = s.indexOf('>', lt);
    if (f < 0) break;
    const cuerpo = s.slice(lt + 1, f);
    if (cuerpo[0] === '/') pila.pop();
    else {
      const nombre = (cuerpo.match(/^[^\s/>]+/) || [''])[0];
      if (/^w:(?:t|instrText|delText)$/.test(nombre)) {
        const padre = pila[pila.length - 1] || '(raíz)';
        if (padre !== 'w:r') malos.set('<' + nombre + '> dentro de <' + padre + '>', (malos.get('<' + nombre + '> dentro de <' + padre + '>') || 0) + 1);
      }
      if (cuerpo.slice(-1) !== '/') pila.push(nombre);
    }
    i = f + 1;
  }
  return [...malos.entries()].map(([k, v]) => v + ' vez/veces ' + k);
}

// La secuencia de etiquetas de un XML, sin atributos ni texto. Si lo único que
// cambia de una parte es el texto, esta secuencia tiene que ser idéntica a la
// del original: es la forma directa de comprobar que el documento es el mismo y
// solo cambia lo que dice, que es justo lo que promete este saneador.
// Los nodos de texto quedan fuera de la comparación: son justo lo que el
// saneador reescribe, y a veces añade uno (el texto que acompaña a un
// tabulador). Lo que tiene que cuadrar es todo lo demás: párrafos, tablas,
// filas, celdas, propiedades, campos, marcadores, imágenes.
const NODOS_DE_TEXTO = new Set(['w:t', '/w:t', 'w:t/', 'w:instrText', '/w:instrText', 'w:instrText/',
  'w:delText', '/w:delText', 'w:delText/']);

const secuenciaDeTags = (texto) => [...String(texto == null ? '' : texto)
  .matchAll(/<(\/?)([A-Za-z_][\w:.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g)]
  .map((m) => (m[1] ? '/' : '') + m[2] + (m[4] ? '/' : ''))
  .filter((t) => !NODOS_DE_TEXTO.has(t));

// Las relaciones y los tipos de contenido se quedan fuera: ahí sí se quitan
// elementos a propósito (la relación y el Override de las partes eliminadas).
async function comprobarTagsIguales(originalBuffer, resultBuffer, editados) {
  const a = await partesDe(originalBuffer);
  const b = await partesDe(resultBuffer);
  const fallos = [];
  for (const n of editados.keys()) {
    if (!/\.xml$/i.test(n) || n === '[Content_Types].xml' || /\.rels$/i.test(n)) continue;
    if (!a.has(n) || !b.has(n)) continue;
    const x = secuenciaDeTags(leerTexto(a.get(n)).texto);
    const y = secuenciaDeTags(leerTexto(b.get(n)).texto);
    if (x.length !== y.length) {
      fallos.push('en ' + n + ' el número de etiquetas cambia: ' + x.length + ' en el original y ' + y.length + ' en el resultado');
      continue;
    }
    const i = x.findIndex((t, j) => t !== y[j]);
    if (i >= 0) {
      fallos.push('en ' + n + ' la etiqueta ' + i + ' pasa de <' + x[i] + '> a <' + y[i] + '>'
        + ' (alrededor: ' + x.slice(Math.max(0, i - 3), i + 3).join(' ') + ')');
    }
  }
  return fallos;
}

// Se compara con el original: si una parte ya venía con algo que este recuento
// no entiende, no se le echa la culpa al saneado.
async function comprobarXml(originalBuffer, resultBuffer) {
  const a = await partesDe(originalBuffer);
  const b = await partesDe(resultBuffer);
  const fallos = [];
  for (const [n, datos] of b) {
    if (!/\.(?:xml|rels)$/i.test(n)) continue;
    const texto = leerTexto(datos).texto;
    const errores = erroresDeXml(texto);
    if (errores.length) {
      const antes = a.has(n) ? erroresDeXml(leerTexto(a.get(n)).texto) : [];
      if (antes.length < errores.length) fallos.push('el XML de ' + n + ' no está bien formado: ' + errores[0]);
    }
    if (!/^word\/.*\.xml$/i.test(n)) continue;
    const fuera = textosFueraDeRun(texto);
    if (!fuera.length) continue;
    const antes = a.has(n) ? textosFueraDeRun(leerTexto(a.get(n)).texto) : [];
    if (antes.length < fuera.length) fallos.push('en ' + n + ' hay texto donde no puede estar: ' + fuera[0]);
  }
  return fallos;
}

async function comprobarPartes(originalBuffer, resultBuffer, editados, eliminados) {
  const a = await partesDe(originalBuffer);
  const b = await partesDe(resultBuffer);
  const fallos = [];
  const tabla = [];
  for (const [n, datos] of a) {
    if (!b.has(n)) {
      if (eliminados.has(n)) tabla.push({ nombre: n, estado: 'eliminado', motivo: eliminados.get(n) });
      else fallos.push('falta la parte ' + n + ' y no estaba previsto quitarla');
      continue;
    }
    const igual = datos.equals(b.get(n));
    if (!igual && !editados.has(n)) fallos.push('la parte ' + n + ' cambia sin motivo');
    tabla.push({ nombre: n, estado: igual ? 'igual' : 'editado', motivo: igual ? '' : (editados.get(n) || '') });
  }
  for (const n of b.keys()) if (!a.has(n)) fallos.push('aparece una parte nueva: ' + n);
  return { fallos, tabla };
}

function textoVisibleDeXml(xml, estilos) {
  return parseParrafos(xml, estilos).map((p) => p.texto).join('\n');
}

async function comprobarMaterial(originalDatos, reDatos, resultBuffer, estilos) {
  const { lineasDocentes, claveLinea, cadaTexto } = require('../scripts/generar-ejemplo');
  const originales = lineasDocentes(originalDatos);
  if (!originales.length) return [];
  const textos = [];
  cadaTexto(reDatos, (s) => textos.push(s), '');
  const zip = await JSZip.loadAsync(resultBuffer);
  const doc = zip.file('word/document.xml');
  if (doc) textos.push(textoVisibleDeXml(await doc.async('string'), estilos));
  const lineas = new Set();
  textos.forEach((t) => t.split('\n').forEach((l) => lineas.add(claveLinea(l))));
  const todo = textos.map(claveLinea).join('\n');
  const cuenta = {};
  originales.forEach((o) => {
    if (!(lineas.has(o.clave) || todo.indexOf(o.clave) >= 0)) return;
    const k = o.modulo + '|' + o.campo;
    if (!cuenta[k]) cuenta[k] = { modulo: o.modulo, campo: o.campo, n: 0 };
    cuenta[k].n += 1;
  });
  return Object.keys(cuenta).map((k) => {
    const c = cuenta[k];
    return 'sobreviven ' + c.n + ' línea(s) del material docente original en el módulo «' + c.modulo + '», campo «' + c.campo + '»';
  });
}

function contextoDef(P, real, sustituciones) {
  const permitir = P.conservarCentro
    ? [].concat(real.centros, real.localidades, real.comarcas, [P.C.nombre, P.C.corto, P.C.localidad, P.C.comarca])
    : [];
  return {
    centro: P.C,
    personas: P.personas,
    reales: P.conservarCentro ? { centros: [], localidades: [], comarcas: [] } : P.realesOriginales,
    extras: sustituciones.map((s) => s.buscar),
    sitios: sustituciones.map((s) => s.por),
    permitirCentro: permitir,
  };
}

// Atributos que pueden llevar un dato de persona o de contacto. Los
// identificadores internos de Word (`w:anchor`, `w:val` de un marcador, `r:id`)
// se quedan fuera a propósito: el índice guarda anclas como
// `__RefHeading___Toc2598_615076198`, y esos dígitos no son un teléfono.
const ATRIBUTOS_CON_DATOS = new Set([
  'author', 'initials', 'username', 'userid', 'target', 'instr', 'descr',
  'tooltip', 'title', 'subject', 'keywords', 'creator', 'lastmodifiedby',
  'company', 'manager',
]);

function textoParaGuardia(xml) {
  const s = String(xml || '');
  const trozos = [];
  // Texto visible. Los límites de párrafo, celda y fila se convierten en salto
  // antes de quitar las etiquetas: si no, el final de una celda y el principio
  // de la siguiente se pegan y forman palabras que no existen en el documento
  // (una abreviatura de «situación de aprendizaje» detrás de un código puede
  // parecer una forma jurídica de empresa).
  const conCortes = s
    .replace(/<w:(?:tab)\b[^>]*\/>/g, ' ')
    .replace(/<w:(?:br|cr)\b[^>]*\/>/g, '\n')
    .replace(/<\/(?:w:p|w:tc|w:tr|w:tbl|w:txbxContent)>/g, '\n')
    .replace(/<w:(?:p|tc|tr|tbl)\b[^>]*>/g, '\n');
  // Cada párrafo se revisa por separado: el separador no es un espacio, así
  // que una expresión que admite espacios entre palabras no puede unir el
  // final de un párrafo con el principio del siguiente.
  const lineas = dec(conCortes.replace(/<[^>]*>/g, ' '))
    .split('\n')
    .map((l) => l.replace(/[ \t\r\f\v]+/g, ' ').trim())
    .filter(Boolean);
  trozos.push(lineas.join('\n\u0001\n'));
  // Y los atributos que sí pueden llevar datos.
  for (const m of s.matchAll(/<[^>]*>/g)) {
    for (const a of m[0].matchAll(/([:\w.-]+)\s*=\s*"([^"]*)"/g)) {
      const nombre = a[1].toLowerCase().replace(/^.*:/, '');
      if (ATRIBUTOS_CON_DATOS.has(nombre)) trozos.push(dec(a[2]));
    }
  }
  return trozos.join('\n\u0001\n');
}

async function comprobarGuardia(reDatos, resultBuffer, contexto) {
  const hallazgos = S.revisar(reDatos, contexto).map((h) => h.tipo + ' en ' + h.ruta);
  const zip = await JSZip.loadAsync(resultBuffer);
  for (const n of Object.keys(zip.files)) {
    if (zip.files[n].dir || !/\.(?:xml|rels)$/i.test(n)) continue;
    const { texto } = leerTexto(await zip.file(n).async('nodebuffer'));
    S.revisar({ [n]: textoParaGuardia(texto) }, contexto).forEach((h) => hallazgos.push(h.tipo + ' en ' + n));
  }
  return [...new Set(hallazgos)].map((h) => 'el guardia encuentra un dato de tipo «' + h.split(' en ')[0] + '» en ' + h.split(' en ').slice(1).join(' en '));
}

function comprobarPdf(plantilla, datos) {
  try {
    const dd = buildDocDefinition({ plantilla, datos, instancias: 'todas', titulo: 'Ejemplo' });
    return dd && dd.content && dd.content.length ? [] : ['el PDF del ejemplo sale vacío'];
  } catch (e) {
    return ['no se puede construir el PDF del ejemplo: ' + e.message];
  }
}

async function comprobarTodo(originalBuffer, resultBuffer, segunda, original, re, P, real, sustituciones) {
  const contexto = contextoDef(P, real, sustituciones);
  const partes = await comprobarPartes(originalBuffer, resultBuffer, original.editados, original.eliminados);
  const pruebas = [
    ['el XML de todas las partes está bien formado', await comprobarXml(originalBuffer, resultBuffer)],
    ['en las partes editadas solo cambia el texto, no las etiquetas', await comprobarTagsIguales(originalBuffer, resultBuffer, original.editados)],
    ['las partes no tocadas siguen byte a byte', partes.fallos],
    ['la estructura del documento no se mueve', compararEstructura(original.reimportado, re)],
    ['no sobrevive material docente original', await comprobarMaterial(original.reimportado.datos, re.datos, resultBuffer, original.estilos)],
    ['el guardia no encuentra datos reales', await comprobarGuardia(re.datos, resultBuffer, contexto)],
    ['dos ejecuciones dan los mismos bytes', resultBuffer.equals(segunda) ? [] : ['la segunda ejecución produce otros bytes']],
    ['el PDF del ejemplo se construye', comprobarPdf(re.plantilla, re.datos)],
  ];
  const fallos = [];
  pruebas.forEach(([nombre, f]) => f.forEach((m) => fallos.push(nombre + ': ' + m)));
  return { ok: !fallos.length, fallos, pruebas, tablaPartes: partes.tabla, re, contexto };
}


// ---------------------------------------------------------------- API
function centroReal(real) {
  const corto = real.centros[0] || S.CENTRO.corto;
  return {
    nombre: /^ies\b/i.test(corto) ? corto : 'IES ' + corto,
    corto,
    localidad: real.localidades[0] || S.CENTRO.localidad,
    comarca: real.comarcas[0] || S.CENTRO.comarca,
    dominio: S.CENTRO.dominio,
  };
}

function nuevoInforme() {
  return {
    cambios: {}, fichas: 0, recursos: 0, apartadosReescritos: 0,
    editados: new Map(), eliminados: new Map(),
    generador: S.crearGenerador(),
  };
}

async function sanearDocxBuffer(buffer, opciones) {
  const O = opciones || {};
  const sustituciones = O.sustituciones || [];
  const conservarCentro = O.conservarCentro !== undefined ? !!O.conservarCentro : !O.anonimizarCentro;
  const original = await importarDocx({ buffer }, { incluirInicial: true });
  const real = S.centroDe(original.datos);
  const centro = conservarCentro ? centroReal(real) : undefined;
  const P = S.prepararSaneador(original.datos, { conservarCentro, centro, sustituciones });
  const estilos = parseEstilos(leerTexto((await (await JSZip.loadAsync(buffer)).file('word/styles.xml').async('nodebuffer'))).texto);

  const informe = nuevoInforme();
  const primera = await generar(buffer, P, informe);
  const segunda = await generar(buffer, P, nuevoInforme());
  const re = await importarDocx({ buffer: primera }, { incluirInicial: true });

  const resultado = await comprobarTodo(buffer, primera, segunda, {
    reimportado: original, estilos, editados: informe.editados, eliminados: informe.eliminados,
  }, re, P, real, sustituciones);

  informe.personas = P.personas.length;
  informe.variantesDeNombre = P.nombres.length;
  informe.inicialesDisponibles = P.mapaIniciales.size;
  informe.centroConservado = conservarCentro;
  informe.tamano = primera.length;
  informe.partes = resultado.tablaPartes;
  informe.pruebas = resultado.pruebas;
  informe.fallos = resultado.fallos;
  informe.reimportado = re;
  return {
    ok: resultado.ok,
    buffer: resultado.ok ? primera : null,
    informe,
    hallazgos: resultado.fallos,
    reimportado: re,
  };
}

async function sanearDocxRuta(entrada, salida, opciones) {
  const buffer = await fs.promises.readFile(entrada);
  const r = await sanearDocxBuffer(buffer, opciones);
  if (!r.ok) return r;
  await fs.promises.mkdir(path.dirname(path.resolve(salida)), { recursive: true });
  await fs.promises.writeFile(salida, r.buffer);
  return r;
}

module.exports = {
  sanearDocxBuffer, sanearDocxRuta, transformarDocumento, generar,
  parseParrafos, parseEstilos, tablasDe, mapaCeldas, sustituirGlobal,
  quitarExif, sanearCore, sanearApp, sanearRels, sanearComentarios, sanearAtributosDeTarea,
  limpiarConCambios, comprobarPartes, compararEstructura, textoParaGuardia,
  FECHA_FIJA, FECHA_TEXTO, NOMBRE_EQUIPO, CENTRO_EJEMPLO,
};
