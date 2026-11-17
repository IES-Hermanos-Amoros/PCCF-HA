// Congela lo que cada módulo VE hoy de la estructura de su documento.
//
//   node scripts/congelar-estructura-modulos.js              compara con el fichero congelado y dice qué difiere
//   node scripts/congelar-estructura-modulos.js --congelar   escribe test/estructura-modulos-hoy.json
//   node scripts/congelar-estructura-modulos.js --medir      mide cuánta divergencia hay ya de hecho
//
// Necesita la base local (MONGODB_URI, o la de .env.local): recorre los documentos que haya y SOLO LEE.
//
// POR QUÉ EXISTE
//
// Hoy la plantilla de un documento define las secciones de `modulos` una sola vez y las comparten todos
// los módulos. Cuando un módulo pueda llevar estructura propia, lo que tiene que seguir siendo cierto es
// que los módulos que NO la tengan ven EXACTAMENTE lo de antes. Este fichero lo deja fijado: por cada
// documento y cada módulo, el árbol que ve (claves, títulos, orden, numeración, quién edita), los campos
// de cada apartado, y un sha256 del conjunto, para que se vea una diferencia de un solo byte.
//
// Es el mismo patrón que test/tablas-sin-modelo.json. Se congela UNA vez, antes del cambio, y no se
// regenera para que la prueba pase: si salta, lo que hay que mirar es el cambio de código.
//
// LO QUE NO ENTRA, a propósito: los `_id` (cambian al recargar la base), el contenido escrito en los
// apartados y el `relleno` del árbol (cambian cada vez que alguien escribe) y la versión de la plantilla.
// Solo la forma.

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const FICHERO = path.join(RAIZ, 'test', 'estructura-modulos-hoy.json');

// El .env.local lo lee Next, no un guion: se toma de allí solo lo que hace falta y sin pisar el entorno.
function cargarEntorno() {
  if (process.env.MONGODB_URI) return;
  const f = path.join(RAIZ, '.env.local');
  if (!fs.existsSync(f)) return;
  for (const linea of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^\s*(MONGODB_URI|MONGODB_DB)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

// JSON con las claves ordenadas: dos objetos iguales dan los mismos bytes.
function canonico(x) {
  if (Array.isArray(x)) return `[${x.map(canonico).join(',')}]`;
  if (x && typeof x === 'object') {
    return `{${Object.keys(x).filter((k) => x[k] !== undefined).sort()
      .map((k) => `${JSON.stringify(k)}:${canonico(x[k])}`).join(',')}}`;
  }
  return JSON.stringify(x === undefined ? null : x);
}
const sha = (x) => crypto.createHash('sha256').update(typeof x === 'string' ? x : canonico(x)).digest('hex');

// ---------------------------------------------------------------- lo que ve un nodo

// Del nodo del árbol, lo que es forma. Sin `clave` ni `unidadId` (llevan el id de la unidad), sin
// `relleno` (es contenido) y con los hijos aplanados, cada uno con su nivel.
function plano(nodo, nivel, salida) {
  salida.push({
    nivel,
    seccion: nodo.seccion,
    tipo: nodo.tipo,
    titulo: nodo.titulo,
    num: nodo.num,
    edita: nodo.edita,
    contenido: nodo.contenido,
    repetidor: nodo.repetidor,
    etiqueta: nodo.etiqueta,
    grupo: nodo.grupo,
  });
  for (const h of nodo.hijos || []) plano(h, nivel + 1, salida);
  return salida;
}

// Los campos de una sección: lo que el módulo ve en cada apartado. La definición entera va en el sha256;
// aquí queda lo que se puede leer para ver QUÉ cambió cuando salta la prueba.
function camposDe(seccion) {
  return (Array.isArray(seccion.campos) ? seccion.campos : []).map((c) => ({
    id: c.id, tipo: c.tipo, etiqueta: c.etiqueta, modelo: c.modelo || null, sha256: sha(c),
  }));
}

function seccionesPlanas(lista, salida = []) {
  for (const s of lista || []) { salida.push(s); seccionesPlanas(s.hijos, salida); }
  return salida;
}

// ---------------------------------------------------------------- un documento

function congelarDocumento(documento, unidades, { Arbol, Plantilla }) {
  // Lo mismo que hace abrirDocumento: lo retirado no se ve.
  const vigente = Plantilla.vigente(documento.plantilla);
  const arbol = Arbol.construirArbol({ plantilla: vigente, unidades, apartados: [], titulo: 'x' });

  const comun = [];
  const modulos = unidades.map(() => []);
  const recorrer = (n, nivel) => {
    if (n.tipo === 'bloque') {
      // El bloque cuenta como común; sus unidades, una a una.
      plano({ ...n, hijos: [] }, nivel, comun);
      n.hijos.forEach((u, j) => { modulos[j] = plano(u, 0, []); });
      return;
    }
    plano({ ...n, hijos: [] }, nivel, comun);
    (n.hijos || []).forEach((h) => recorrer(h, nivel + 1));
  };
  arbol.hijos.forEach((h) => recorrer(h, 0));

  const bloque = (vigente.secciones || []).find((s) => s.instancias) || null;
  const deModulo = new Set(bloque ? seccionesPlanas(bloque.hijos) : []);
  const camposComunes = seccionesPlanas(vigente.secciones)
    .filter((s) => !deModulo.has(s))
    .map((s) => ({ seccion: s.id, campos: camposDe(s) }));
  const camposModulo = [...deModulo].map((s) => ({ seccion: s.id, campos: camposDe(s) }));

  const salidaModulos = unidades.map((u, i) => {
    const cuerpo = { arbol: modulos[i], campos: camposModulo };
    return { orden: i + 1, titulo: u.titulo, grupo: u.grupo === undefined ? null : u.grupo, ...cuerpo, sha256: sha(cuerpo) };
  });

  const cuerpoComun = { arbol: comun, campos: camposComunes };
  const resultado = { comun: { ...cuerpoComun, sha256: sha(cuerpoComun) }, modulos: salidaModulos };
  resultado.sha256 = sha({ comun: resultado.comun.sha256, modulos: salidaModulos.map((m) => m.sha256) });
  return resultado;
}

// ---------------------------------------------------------------- todos

const claveDe = (d) => [d.tipo, d.ciclo || '-', d.curso].join('/');

async function generar() {
  cargarEntorno();
  if (!process.env.MONGODB_URI) {
    throw new Error('Hace falta la base local: MONGODB_URI (o .env.local). La puerta compara contra los documentos de verdad y en memoria no hay ninguno.');
  }
  const { obtenerRepositorio } = require('../app/_lib/repositorio');
  const Arbol = require('../core/arbol');
  const Plantilla = require('../core/plantilla');
  const repo = obtenerRepositorio();
  const documentos = (await repo.documentos.listar({}))
    .slice().sort((a, b) => claveDe(a).localeCompare(claveDe(b)));
  const salida = {};
  for (const d of documentos) {
    const unidades = await repo.unidades.listar(d._id);
    salida[claveDe(d)] = congelarDocumento(d, unidades, { Arbol, Plantilla });
  }
  const resumen = Object.fromEntries(Object.entries(salida).map(([k, v]) => [k, v.sha256]));
  return {
    descripcion: 'Lo que cada módulo ve hoy de la estructura de su documento. NO SE REGENERA para que una prueba pase: ver scripts/congelar-estructura-modulos.js.',
    documentos: Object.keys(salida).length,
    sha256: sha(resumen),
    porDocumento: resumen,
    detalle: salida,
  };
}

// Las diferencias, dichas con palabras: qué documento, qué módulo y en qué parte.
function diferencias(esperado, actual) {
  const out = [];
  for (const k of new Set([...Object.keys(esperado.detalle), ...Object.keys(actual.detalle)])) {
    const e = esperado.detalle[k];
    const a = actual.detalle[k];
    if (!e || !a) { out.push(`${k}: ${e ? 'ya no está' : 'es nuevo'}`); continue; }
    if (e.comun.sha256 !== a.comun.sha256) out.push(`${k}: cambia la parte común`);
    const n = Math.max(e.modulos.length, a.modulos.length);
    for (let i = 0; i < n; i += 1) {
      const me = e.modulos[i];
      const ma = a.modulos[i];
      if (!me || !ma) { out.push(`${k}: módulo ${i + 1} ${me ? 'ya no está' : 'es nuevo'}`); continue; }
      if (me.sha256 === ma.sha256) continue;
      const que = [];
      if (canonico(me.arbol) !== canonico(ma.arbol)) que.push('el árbol');
      if (canonico(me.campos) !== canonico(ma.campos)) que.push('los campos');
      out.push(`${k}: módulo ${i + 1} (${me.titulo}) cambia ${que.join(' y ') || 'el título o el grupo'}`);
    }
  }
  return out;
}

// ---------------------------------------------------------------- cuánta divergencia hay ya

// Divergencia DE HECHO: lo que el importador no creó o lo que se desvía de la forma común. El importador
// solo crea la fila de un apartado cuando el Word de ese módulo trae algo (no hay ninguna fila vacía en
// la base), así que una sección con campos SIN fila en un módulo es una sección que ese módulo no tiene
// escrita, y una clave escrita que la sección no declara es un campo que se salió de la plantilla.
// `items` no cuenta: es la forma de guardar un repetidor, no un campo.
async function medir() {
  cargarEntorno();
  const { obtenerRepositorio } = require('../app/_lib/repositorio');
  const Plantilla = require('../core/plantilla');
  const repo = obtenerRepositorio();
  const documentos = (await repo.documentos.listar({})).sort((a, b) => claveDe(a).localeCompare(claveDe(b)));
  const filas = [];
  for (const d of documentos) {
    const unidades = await repo.unidades.listar(d._id);
    if (!unidades.length) continue;
    const vigente = Plantilla.vigente(d.plantilla);
    const bloque = (vigente.secciones || []).find((s) => s.instancias);
    if (!bloque) continue;
    const secciones = seccionesPlanas(bloque.hijos);
    const apartados = await repo.apartados.listar(d._id);
    let divergentes = 0;
    const detalle = [];
    for (const u of unidades) {
      const filasU = apartados.filter((a) => a.unidadId === u.unidadId);
      const tiene = new Set(filasU.map((a) => a.seccion));
      const sinFila = secciones.filter((s) => camposDe(s).length && !tiene.has(s.id)).map((s) => s.id);
      const fuera = [];
      let tablasPropias = 0;
      for (const a of filasU) {
        const s = secciones.find((x) => x.id === a.seccion);
        if (!s) { fuera.push(`${a.seccion} (apartado que la plantilla no tiene)`); continue; }
        const ids = new Set((s.campos || []).map((c) => c.id));
        for (const [k, v] of Object.entries(a.valores || {})) {
          if (!ids.has(k) && k !== 'items') fuera.push(`${a.seccion}:${k}`);
          if (v && typeof v === 'object' && v.estructura) tablasPropias += 1;
        }
      }
      if (sinFila.length || fuera.length || tablasPropias) divergentes += 1;
      detalle.push({ modulo: u.titulo, sinFila, fuera, tablasPropias });
    }
    filas.push({ documento: claveDe(d), modulos: unidades.length, divergentes, detalle });
  }
  return filas;
}

// ---------------------------------------------------------------- uso desde la línea de órdenes

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--medir')) {
    for (const f of await medir()) {
      console.log(`${f.documento}: ${f.divergentes} de ${f.modulos} módulos divergen`);
      for (const m of f.detalle.filter((x) => x.sinFila.length || x.fuera.length || x.tablasPropias)) {
        console.log(`    ${m.modulo}: sin fila [${m.sinFila.join(', ')}] fuera [${m.fuera.join(', ')}] tablas propias ${m.tablasPropias}`);
      }
    }
    return;
  }
  const actual = await generar();
  if (args.includes('--congelar')) {
    fs.writeFileSync(FICHERO, `${JSON.stringify(actual, null, 1).replace(/\n/g, '\r\n')}\r\n`);
    console.log(`congelado: ${actual.documentos} documentos, sha256 ${actual.sha256}`);
    return;
  }
  const esperado = JSON.parse(fs.readFileSync(FICHERO, 'utf8'));
  const dif = diferencias(esperado, actual);
  console.log(dif.length ? dif.join('\n') : `igual que lo congelado (${actual.sha256})`);
  process.exitCode = dif.length ? 1 : 0;
}

module.exports = { generar, diferencias, medir, canonico, FICHERO };

if (require.main === module) {
  main().then(() => process.exit(process.exitCode || 0), (e) => { console.error(e.message); process.exit(1); });
}
