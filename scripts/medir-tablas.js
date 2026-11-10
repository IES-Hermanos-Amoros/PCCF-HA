// Mide si agrupar las tablas de un Word por su FORMA da grupos sensatos (core/tablas-forma.js).
//
//   node scripts/medir-tablas.js <fichero.docx | carpeta> [...] [--detalle] [--filas] [--sin-anchos]
//
// Con una carpeta toma todos los .docx que haya dentro (y en sus subcarpetas, salvo las llamadas
// `ejemplo`). Por cada documento imprime cuántas tablas tiene, en qué las clasifica el importador
// (`clasificarTabla`, sin tocarlo) y qué grupos propone la función, con su motivo.
//
//   --detalle     lista las tablas de cada grupo y las sueltas
//   --filas       añade el tramo de filas a la firma de forma (`bandasFilas`)
//   --sin-anchos  no lee los anchos de columna del XML
//
// Los documentos reales no se versionan: se pasan por ruta y solo se leen.

'use strict';

const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const { leerNodos, clasificarTabla } = require('../motor/importar-docx');
const { proponer } = require('../core/tablas-forma');

// Anchos de la rejilla (`w:tblGrid`) de cada tabla de primer nivel, en el orden del documento.
// Las anidadas se saltan: el importador tampoco las cuenta como tablas.
function anchosDelXml(xml) {
  const salida = [];
  const re = /<w:tbl>|<w:tbl\s[^>]*>|<\/w:tbl>/g;
  let profundidad = 0;
  let m;
  let inicio = 0;
  while ((m = re.exec(xml))) {
    if (m[0].startsWith('</')) {
      profundidad -= 1;
      if (profundidad === 0) {
        const trozo = xml.slice(inicio, m.index);
        const grid = trozo.match(/<w:tblGrid>([\s\S]*?)<\/w:tblGrid>/);
        salida.push(grid ? [...grid[1].matchAll(/<w:gridCol[^>]*w:w="(\d+)"/g)].map((x) => Number(x[1])) : null);
      }
    } else {
      if (profundidad === 0) inicio = m.index;
      profundidad += 1;
    }
  }
  return salida;
}

async function leerAnchos(fichero) {
  const zip = await JSZip.loadAsync(fs.readFileSync(fichero));
  const f = zip.file('word/document.xml');
  return f ? anchosDelXml(await f.async('string')) : [];
}

function ficheros(entradas) {
  const out = [];
  const visitar = (p) => {
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      if (path.basename(p) === 'ejemplo') return;
      for (const n of fs.readdirSync(p).sort()) visitar(path.join(p, n));
    } else if (/\.docx$/i.test(p) && !path.basename(p).startsWith('~$')) out.push(p);
  };
  entradas.forEach(visitar);
  return out;
}

const corto = (s, n) => { const t = String(s).replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

async function medir(fichero, opts) {
  const { leido } = await leerNodos({ path: fichero });
  const tablas = leido.nodos.filter((n) => n.type === 'table');
  let anchosOk = false;
  if (opts.anchos) {
    const a = await leerAnchos(fichero);
    // Solo se fía de los anchos si el XML y mammoth cuentan las mismas tablas y cada rejilla cuadra.
    if (a.length === tablas.length) {
      anchosOk = true;
      tablas.forEach((t, i) => { t.anchos = a[i] || undefined; });
    }
  }
  const tipos = tablas.map((t) => clasificarTabla(t).tipo);
  const res = proponer(tablas, { bandasFilas: opts.filas });
  return { fichero, tablas, tipos, res, anchosOk, anchosPedidos: opts.anchos };
}

function contar(arr) {
  const m = new Map();
  arr.forEach((x) => m.set(x, (m.get(x) || 0) + 1));
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function imprimir(r, detalle) {
  const { tablas, tipos, res } = r;
  console.log(`\n=== ${path.basename(r.fichero)}`);
  console.log(`tablas: ${tablas.length}   anchos: ${r.anchosPedidos ? (r.anchosOk ? 'leidos' : 'NO cuadran con el XML, no se usan') : 'no se usan'}`);
  console.log('importador: ' + (contar(tipos).map(([k, v]) => `${k} x${v}`).join(', ') || '-'));
  const agrupadas = res.grupos.reduce((a, g) => a + g.indices.length, 0);
  console.log(`propuesta: ${res.grupos.length} grupos (${agrupadas} tablas), ${res.sueltas.length} sueltas; tamanos: [${res.grupos.map((g) => g.indices.length).join(', ')}]`);
  for (const g of res.grupos) {
    const mezcla = contar(g.indices.map((i) => tipos[i]));
    console.log(`  ${g.id} [${g.nivel}] x${g.indices.length}  importador: ${mezcla.map(([k, v]) => `${k} x${v}`).join(', ')}${mezcla.length > 1 ? '   <-- MEZCLA' : ''}`);
    console.log(`      ${g.motivo}`);
    if (detalle) g.indices.forEach((i) => console.log(`        #${i} ${tipos[i]} ${tablas[i].rows.length}f «${corto(tablas[i].rows[0].map((c) => c.text).join(' | '), 70)}»`));
  }
  if (detalle && res.sueltas.length) {
    console.log('  sueltas:');
    res.sueltas.forEach((i) => console.log(`    #${i} ${tipos[i]} ${tablas[i].rows.length}f «${corto(tablas[i].rows[0].map((c) => c.text).join(' | '), 70)}»`));
  }
  // Por cada tipo del importador con varias tablas: cuántas caen en su grupo mayor. Es el acierto
  // contra el único patrón de medida que hay (las familias que el importador reconoce a mano).
  const fam = [];
  for (const t of new Set(tipos)) {
    const total = tipos.filter((x) => x === t).length;
    if (total < 2) continue;
    const cuenta = new Map();
    tipos.forEach((x, i) => { if (x !== t) return; const g = res.grupos.find((y) => y.indices.includes(i)); const k = g ? g.id : "suelta"; cuenta.set(k, (cuenta.get(k) || 0) + 1); });
    const mayor = Math.max(...[...cuenta].filter(([k]) => k !== "suelta").map(([, v]) => v), 0);
    fam.push(t + " " + mayor + "/" + total + (cuenta.size === 1 && !cuenta.has("suelta") ? " (de pleno)" : ""));
  }
  console.log("  familias (mayor grupo/total): " + fam.join(", "));
}

// LOS DOS LECTORES QUE NO SON DE ESTE GUION sino de cualquiera que recorra los .docx del
// departamento -que ficheros hay y que anchos declara cada rejilla- se exportan para que el
// siguiente no los vuelva a escribir: leer `w:tblGrid` saltando las tablas anidadas es una regla,
// y escrita dos veces acabaria midiendo dos cosas distintas. La medicion arranca solo cuando este
// fichero es el que se ejecuta, para que requerirlo no mida nada.
module.exports = { ficheros, leerAnchos, anchosDelXml, medir, imprimir };

async function principal() {
  const args = process.argv.slice(2);
  const opts = { anchos: !args.includes('--sin-anchos'), filas: args.includes('--filas') };
  const detalle = args.includes('--detalle');
  const entradas = args.filter((a) => !a.startsWith('--'));
  if (!entradas.length) { console.error('Uso: node scripts/medir-tablas.js <docx|carpeta> [...] [--detalle] [--filas] [--sin-anchos]'); process.exit(1); }
  const lista = ficheros(entradas);
  const todos = [];
  for (const f of lista) {
    try { const r = await medir(f, opts); todos.push(r); imprimir(r, detalle); }
    catch (e) { console.log(`\n=== ${path.basename(f)}\nERROR: ${e.message}`); }
  }
  const tot = todos.reduce((a, r) => ({
    docs: a.docs + 1, tablas: a.tablas + r.tablas.length, grupos: a.grupos + r.res.grupos.length,
    agrupadas: a.agrupadas + r.res.grupos.reduce((s, g) => s + g.indices.length, 0), sueltas: a.sueltas + r.res.sueltas.length,
    mezclas: a.mezclas + r.res.grupos.filter((g) => new Set(g.indices.map((i) => r.tipos[i])).size > 1).length,
  }), { docs: 0, tablas: 0, grupos: 0, agrupadas: 0, sueltas: 0, mezclas: 0 });
  console.log(`\n=== TOTAL: ${tot.docs} documentos, ${tot.tablas} tablas, ${tot.grupos} grupos con ${tot.agrupadas} tablas, ${tot.sueltas} sueltas, ${tot.mezclas} grupos que mezclan tipos del importador`);
}

if (require.main === module) principal();
