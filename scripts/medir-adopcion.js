// Mide si ADOPTAR un modelo (core/tablas-adopcion.js) se puede hacer sin perder un carácter sobre las
// tablas de los Word de verdad, antes de que nadie engancha la adopción a una pantalla.
//
//   node scripts/medir-adopcion.js <fichero.docx | carpeta> [...] [--detalle] [--mensajes] [--sin-anchos]
//
// Con una carpeta toma todos los .docx que haya dentro (y en sus subcarpetas, salvo las llamadas
// `ejemplo`), igual que scripts/medir-tablas.js, de donde salen el recorrido y el lector de anchos.
//
//   --detalle   cuenta tabla a tabla las que se niegan, con su motivo corto
//   --mensajes  imprime además el mensaje entero que le saldría a una persona (uno por motivo)
//   --sin-anchos  no lee los anchos de columna del XML
//
// SOLO LEE. No escribe en ningún sitio, ni toca los .docx, ni usa la base de datos: `adoptar` devuelve
// un valor nuevo y este guion lo tira. Los documentos reales no se versionan: se pasan por ruta.
//
// LAS CUATRO PREGUNTAS QUE CONTESTA, y por qué son cuatro y no una:
//
//   1. QUÉ HAY. Cuántas tablas y de qué tipo las deja el importador, y cuántas están en un campo al
//      que HOY se le puede poner un modelo (`tabla` y `tabla_clave_valor`: los demás tipos son los
//      ocho `if` cableados de `clasificarTabla`).
//   2. CON EL MODELO DE SU GRUPO, que es como va a pasar de verdad: el jefe de departamento define la
//      forma de un grupo entero y las tablas del grupo la adoptan. El grupo lo propone
//      core/tablas-forma.js y el modelo sale de la tabla REPRESENTANTE del grupo, no de cada una.
//   3. CON EL MODELO DE SÍ MISMA, que es el TECHO: si una tabla no se puede adoptar ni con un modelo
//      hecho a su medida, no hay modelo que la salve. Se mide sobre las 1.095, incluidas las de los
//      tipos cableados, porque de eso depende que los ocho `if` puedan pasar de código a dato.
//   3 bis. Y DE LAS QUE SE ADOPTAN, EN CUÁNTAS CAMBIA LO QUE SE IMPRIME. Una tabla importada se
//      imprime como vino, también en el estilo (§3.5 de docs/modelos-de-tabla.md): adoptar es el
//      momento en que el estilo pasa a ser el del modelo, así que una tabla puede cambiar de aspecto
//      sin perder ni un carácter. Son dos cifras y van separadas: perder texto es inaceptable y por
//      eso `adoptar` se niega; cambiar el aspecto es aceptable, pero hay que saber el número.
//   4. LA FICHA DE SITUACIÓN DE APRENDIZAJE contra el modelo de la ficha de verdad, que es el que la
//      pieza 8 tendría que usar: `CAMPOS_POR_OMISION` de core/sa.js traducido a un modelo con las
//      partes a lo alto. Es la medición de si absorber la ficha es viable.
//
// EL MODELO CONTRA EL QUE SE MIDE NO ES UNA REGLA DE LA APLICACIÓN. Aquí lo propone este guion, que
// hace a mano lo que hará una persona en la pantalla de la pieza 6: los rótulos que la tabla ya tiene
// pasan a ser las partes del modelo. Es lo más favorable que se puede hacer sin inventar nombres, así
// que lo que se niegue aquí se negaría también con un modelo escrito por un humano.

'use strict';

const path = require('path');
const { leerNodos, clasificarTabla } = require('../motor/importar-docx');
const { ficheros, leerAnchos } = require('./medir-tablas');
const Forma = require('../core/tablas-forma');
const MT = require('../core/modelos-tabla');
const Sa = require('../core/sa');
const { adoptar } = require('../core/tablas-adopcion');

const limpio = (t) => String(t == null ? '' : t).replace(/\s+/g, ' ').trim();
const corto = (s, n) => (limpio(s).length > n ? `${limpio(s).slice(0, n - 1)}…` : limpio(s));
const ID_MODELO = 'medido';

// ---------------------------------------------------------------- el modelo contra el que se mide

// Las partes de un modelo, de una lista de rótulos. Los ids se acuñan por POSICIÓN y no del rótulo,
// que es lo que hará la pantalla: el id no sigue al nombre nunca.
const partesDe = (rotulos) => rotulos
  .map((etiqueta, i) => ({ id: `p${i + 1}`, etiqueta }))
  .filter((p) => p.etiqueta);

// EL MODELO A LO ANCHO: los rótulos son la primera fila, y solo si esa fila ES una cabecera
// (`pareceCabecera` de core/tablas-forma.js, que es el único criterio medido que hay).
//
// Y SE LE PONE EL `peso` DE CADA COLUMNA con los anchos que la tabla declara en su `w:tblGrid`. Una
// tabla adoptada no guarda `anchos` —el ancho de una columna es parte de la forma y la forma la dice
// el modelo—, así que un modelo sin pesos reparte las columnas por el texto y le cambia la geometría
// a TODAS las tablas del grupo. Medido: sin esto, las 91 tablas que se adoptan cambian de aspecto;
// con esto, cambian las que de verdad tenían otras columnas que su representante.
function modeloEnColumnas(t) {
  if (!Forma.rasgos(t).cab) return null;
  const partes = partesDe(((t.rows || [])[0] || []).map((c) => limpio(c.text)));
  if (!partes.length) return null;
  const anchos = t.anchos;
  if (Array.isArray(anchos) && anchos.length === partes.length && anchos.every((a) => Number(a) > 0)) {
    partes.forEach((p, i) => { p.peso = Number(anchos[i]); });
  }
  return { id: ID_MODELO, nombre: 'Modelo medido', tipo: MT.TIPO_TABLA, sentido: MT.SENTIDO_COLUMNAS, partes };
}

// EL MODELO DE CLAVE Y VALOR: los rótulos son la primera celda de cada fila, y solo tiene sentido
// proponerlo en una tabla de dos columnas, que es lo que una tabla de clave y valor es.
function modeloEnClaveValor(t) {
  const filas = t.rows || [];
  if (!filas.length || !filas.every((f) => f.length <= 2)) return null;
  const partes = partesDe(filas.map((f) => limpio(f[0] && f[0].text)));
  if (!partes.length) return null;
  return { id: ID_MODELO, nombre: 'Modelo medido', tipo: MT.TIPO_CLAVE_VALOR, sentido: MT.SENTIDO_FILAS, partes };
}

// LOS MODELOS QUE SE LE PUEDEN PROPONER A UNA TABLA, en orden de preferencia: el que corresponde al
// tipo que el importador le ha dado primero, y el otro detrás. Se prueban los dos porque medir con
// uno solo mediría la suerte del importador y no si la tabla se puede adoptar.
function propuestas(t, tipo) {
  const enColumnas = modeloEnColumnas(t);
  const enClaveValor = modeloEnClaveValor(t);
  const orden = tipo === MT.TIPO_CLAVE_VALOR ? [enClaveValor, enColumnas] : [enColumnas, enClaveValor];
  return orden.filter(Boolean);
}

// EL MODELO DE LA FICHA DE SITUACIÓN DE APRENDIZAJE, traducido 1:1 de la estructura que ya gobierna
// las 306 fichas reales (`CAMPOS_POR_OMISION` de core/sa.js). Es la traducción que la pieza 8 haría:
// las partes van a lo alto, cada una ocupa su `ancho` de las cuatro columnas, y el grupo pasa de ser
// una cadena a ser `{ id, etiqueta }` porque en un modelo el id agrupa y la etiqueta se imprime.
function modeloDeLaFicha() {
  return {
    id: ID_MODELO,
    nombre: 'Ficha de situación de aprendizaje',
    tipo: MT.TIPO_TABLA,
    sentido: MT.SENTIDO_FILAS,
    columnas: Sa.COLUMNAS,
    partes: Sa.CAMPOS_POR_OMISION.map((c) => {
      const parte = { id: c.id, etiqueta: c.etiqueta, ancho: c.ancho };
      if (c.grupo) parte.grupo = { id: c.grupo, etiqueta: c.grupo === 'actividades' ? Sa.CABECERA_ACTIVIDADES : c.grupo };
      if (c.solo_si_hay) parte.solo_si_hay = true;
      return parte;
    }),
  };
}

// ---------------------------------------------------------------- una tabla contra un modelo

// El valor tal como lo guarda el importador para una tabla: su rejilla y, si se conocen, sus anchos
// (`valorTabla` de motor/importar-docx.js). En una tabla de clave y valor el importador guarda además
// los `pares`, pero manda la rejilla (`queSeImprime` de core/estructurados.js), así que es la rejilla
// la que se adopta y la que se mide.
const valorDe = (t) => (t.anchos ? { filas: t.rows, anchos: t.anchos } : { filas: t.rows });

// Todo el texto escrito en una tabla: es lo que se queda FUERA del modelo si la tabla no se puede
// adoptar. No es lo mismo que el `enJuego` del informe, que es lo que se perdería si se adoptara a la
// fuerza; las dos cifras hacen falta y miden cosas distintas.
const textoDe = (t) => (t.rows || []).reduce((n, f) => n + f.reduce((m, c) => m + limpio(c.text).length, 0), 0);

// UNA MEDICIÓN de una tabla contra los modelos que se le pueden proponer: se queda con el primero que
// la adopta, y si ninguno lo hace, con el motivo del primero que se probó. `clave` es el motivo corto
// (null si se adopta) y `enJuego` los caracteres que se perderían si se adoptara tal cual.
function medirUna(t, tipo, modelos) {
  const lista = Array.isArray(modelos) ? modelos : [modelos].filter(Boolean);
  if (!lista.length) {
    return { clave: 'sin-rotulos', motivo: 'La tabla no tiene rótulos de los que sacar las partes de un modelo: ni una fila de cabecera ni dos columnas.', bloqueados: textoDe(t) };
  }
  let primero = null;
  for (const modelo of lista) {
    const mal = MT.motivoDeModelo(modelo);
    if (mal) {
      primero = primero || { clave: 'modelo-imposible', motivo: `Con los rótulos de esta tabla no se puede escribir un modelo: ${mal}`, bloqueados: textoDe(t) };
      continue;
    }
    const campo = { id: 'campo', tipo: modelo.tipo, etiqueta: 'Tabla', modelo: ID_MODELO };
    const r = adoptar(campo, valorDe(t), { [ID_MODELO]: modelo });
    if (!r.clave) return { clave: null, motivo: null, informe: r.informe, enJuego: 0, bloqueados: 0 };
    primero = primero || { clave: r.clave, motivo: r.motivo, informe: r.informe, enJuego: r.informe ? r.informe.enJuego : 0, bloqueados: textoDe(t) };
  }
  return primero;
}

// ---------------------------------------------------------------- las cuentas

function nuevaCuenta() {
  return {
    total: 0, adoptadas: 0, casillas: 0, caracteres: 0, motivos: new Map(), enJuego: 0, bloqueados: 0,
    ejemplos: new Map(), reescritos: 0, sinContenido: 0,
    // LAS DOS COSAS QUE NO SON LO MISMO: adoptar sin perder texto, y de esas, en cuántas cambia lo
    // que se imprime. Perder texto es inaceptable; cambiar el aspecto es aceptable y hay que avisarlo.
    aspecto: 0, aspectoPor: new Map(),
  };
}

function sumar(cuenta, r, como) {
  cuenta.total += 1;
  if (!r.clave) {
    cuenta.adoptadas += 1;
    cuenta.casillas += r.informe.casillas;
    cuenta.caracteres += r.informe.caracteres;
    cuenta.reescritos += r.informe.rotulos.filter((x) => x.cambia).length;
    cuenta.sinContenido += r.informe.sinContenido.length;
    const asp = r.informe.aspecto || {};
    if (asp.cambia) cuenta.aspecto += 1;
    [['rotulos reescritos', asp.rotulos], ['negrita o fondo', asp.estilo], ['estilo que deja de imprimirse', asp.contenido],
      ['anchos de columna', asp.anchos ? 1 : 0], ['cabecera que empieza a repetirse', asp.cabecera ? 1 : 0],
      ['columnas que ocupa una parte', asp.ancho]].forEach(([k, n]) => {
      if (n) cuenta.aspectoPor.set(k, (cuenta.aspectoPor.get(k) || 0) + 1);
    });
    return;
  }
  cuenta.motivos.set(r.clave, (cuenta.motivos.get(r.clave) || 0) + 1);
  cuenta.enJuego += r.enJuego || 0;
  cuenta.bloqueados += r.bloqueados || 0;
  if (!cuenta.ejemplos.has(r.clave)) cuenta.ejemplos.set(r.clave, { motivo: r.motivo, como });
}

const porMotivo = (cuenta) => [...cuenta.motivos.entries()].sort((a, b) => b[1] - a[1]);

function imprimirCuenta(nombre, cuenta, opts) {
  if (!cuenta.total) { console.log(`  ${nombre}: no hay ninguna`); return; }
  const pct = Math.round((cuenta.adoptadas / cuenta.total) * 100);
  console.log(`  ${nombre}: ${cuenta.adoptadas}/${cuenta.total} se adoptan sin perder un carácter (${pct} %)`);
  if (cuenta.adoptadas) {
    console.log(`      colocan ${cuenta.casillas} casillas y ${cuenta.caracteres} caracteres`
      + `; ${cuenta.reescritos} rótulos los reescribe el modelo; ${cuenta.sinContenido} partes se quedan en blanco`);
    const como = [...cuenta.aspectoPor].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} x${n}`).join(', ');
    console.log(`      de esas ${cuenta.adoptadas}, en ${cuenta.aspecto} cambia lo que se imprime sin perder texto`
      + (como ? `: ${como}` : ''));
  }
  if (cuenta.total - cuenta.adoptadas) {
    console.log(`      se niegan ${cuenta.total - cuenta.adoptadas}: ${cuenta.bloqueados} caracteres se quedan fuera del modelo`
      + `, de los que ${cuenta.enJuego} se perderían si se adoptaran a la fuerza:`);
    for (const [clave, n] of porMotivo(cuenta)) console.log(`        ${clave} x${n}`);
    if (opts.mensajes) {
      for (const [clave, e] of cuenta.ejemplos) console.log(`        · ${clave} (${e.como}): ${e.motivo}`);
    }
  }
}

// ---------------------------------------------------------------- un documento

async function medirDocumento(fichero, opts) {
  const { leido } = await leerNodos({ path: fichero });
  const tablas = leido.nodos.filter((n) => n.type === 'table');
  let anchosOk = false;
  if (opts.anchos) {
    const a = await leerAnchos(fichero);
    // Solo se fía de los anchos si el XML y mammoth cuentan las mismas tablas, igual que medir-tablas.
    if (a.length === tablas.length) {
      anchosOk = true;
      tablas.forEach((t, i) => { if (a[i]) t.anchos = a[i]; });
    }
  }
  const tipos = tablas.map((t) => clasificarTabla(t).tipo);
  const conModelo = tipos.map((tipo) => MT.TIPOS.indexOf(tipo) >= 0);
  const { grupos, sueltas } = Forma.proponer(tablas, {});
  const grupoDe = new Map();
  grupos.forEach((g) => g.indices.forEach((i) => grupoDe.set(i, g)));

  const cuentas = { grupo: nuevaCuenta(), suelta: nuevaCuenta(), techo: nuevaCuenta(), ficha: nuevaCuenta() };
  const detalle = [];
  // Para el cruce «familia del importador x por qué no»: es lo que dice si los ocho `if` cableados
  // pueden pasar de código a dato, familia por familia, en vez de en un porcentaje que lo mezcla todo.
  const porTipo = [];
  const ficha = modeloDeLaFicha();

  tablas.forEach((t, i) => {
    const tipo = tipos[i];
    // El tipo con el que se mide: el suyo si admite modelo, y `tabla` para el techo de las que hoy
    // caen en uno de los ocho `if` cableados del importador.
    const comoTabla = MT.TIPOS.indexOf(tipo) >= 0 ? tipo : MT.TIPO_TABLA;
    const propias = propuestas(t, comoTabla);
    if (conModelo[i]) {
      // Con el modelo de su GRUPO: el que saldría de la tabla representante, que es la que el jefe de
      // departamento tendría delante al definir la forma del grupo entero.
      const g = grupoDe.get(i);
      const r = medirUna(t, tipo, g ? propuestas(tablas[g.indices[0]], tipo) : propias);
      sumar(cuentas[g ? 'grupo' : 'suelta'], r, g ? `#${i}, ${g.id}` : `#${i}, suelta`);
      if (r.clave) detalle.push({ i, tipo, donde: g ? g.id : 'suelta', clave: r.clave, motivo: r.motivo, enJuego: r.enJuego, filas: t.rows.length });
    }
    const techo = medirUna(t, comoTabla, propias);
    sumar(cuentas.techo, techo, `#${i} ${tipo}`);
    porTipo.push({ tipo, clave: techo.clave });
    if (tipo === 'ficha_situacion_aprendizaje') sumar(cuentas.ficha, medirUna(t, MT.TIPO_TABLA, [ficha]), `#${i} ficha`);
  });

  return { fichero, tablas, tipos, conModelo, grupos, sueltas, cuentas, detalle, porTipo, anchosOk };
}

function contar(arr) {
  const m = new Map();
  arr.forEach((x) => m.set(x, (m.get(x) || 0) + 1));
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function imprimirDocumento(r, opts) {
  const conModelo = r.conModelo.filter(Boolean).length;
  console.log(`\n=== ${path.basename(r.fichero)}`);
  console.log(`tablas: ${r.tablas.length}   en un campo que admite modelo hoy: ${conModelo}`
    + `   anchos: ${r.anchosOk ? 'leidos' : 'no se usan'}`);
  console.log('  tipos: ' + contar(r.tipos).map(([k, v]) => `${k} x${v}`).join(', '));
  imprimirCuenta('con el modelo de su grupo ', r.cuentas.grupo, opts);
  imprimirCuenta('sueltas, con el suyo propio', r.cuentas.suelta, opts);
  imprimirCuenta('TECHO: todas, con el suyo ', r.cuentas.techo, opts);
  imprimirCuenta('la ficha de SA, con el modelo de la ficha', r.cuentas.ficha, opts);
  if (opts.detalle && r.detalle.length) {
    console.log('  las que se niegan, una a una:');
    r.detalle.forEach((d) => console.log(`    #${d.i} ${d.tipo} ${d.filas}f [${d.donde}] ${d.clave}`
      + (d.enJuego ? ` · ${d.enJuego} caracteres en juego` : '') + `\n        ${corto(d.motivo, 220)}`));
  }
}

// EL TECHO, FAMILIA POR FAMILIA. Un porcentaje sobre las 1.095 mezcla diez familias que no se
// parecen en nada; lo que hace falta saber es cuál de los ocho `if` del importador puede pasar a ser
// un modelo y cuál no, y por qué no.
function imprimirPorTipo(filas) {
  const tipos = new Map();
  filas.forEach(({ tipo, clave }) => {
    if (!tipos.has(tipo)) tipos.set(tipo, { total: 0, ok: 0, motivos: new Map() });
    const t = tipos.get(tipo);
    t.total += 1;
    if (!clave) t.ok += 1;
    else t.motivos.set(clave, (t.motivos.get(clave) || 0) + 1);
  });
  console.log('  el techo, familia por familia del importador:');
  [...tipos].sort((a, b) => b[1].total - a[1].total).forEach(([tipo, t]) => {
    const motivos = [...t.motivos].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} x${n}`).join(', ');
    console.log(`    ${tipo}: ${t.ok}/${t.total}${motivos ? `   ${motivos}` : ''}`);
  });
}

function juntar(cuentas) {
  const out = nuevaCuenta();
  for (const c of cuentas) {
    out.total += c.total; out.adoptadas += c.adoptadas; out.casillas += c.casillas;
    out.caracteres += c.caracteres; out.enJuego += c.enJuego; out.bloqueados += c.bloqueados;
    out.reescritos += c.reescritos; out.sinContenido += c.sinContenido; out.aspecto += c.aspecto;
    c.aspectoPor.forEach((n, k) => out.aspectoPor.set(k, (out.aspectoPor.get(k) || 0) + n));
    c.motivos.forEach((n, k) => out.motivos.set(k, (out.motivos.get(k) || 0) + n));
    c.ejemplos.forEach((e, k) => { if (!out.ejemplos.has(k)) out.ejemplos.set(k, e); });
  }
  return out;
}

async function principal() {
  const args = process.argv.slice(2);
  const opts = {
    anchos: !args.includes('--sin-anchos'),
    detalle: args.includes('--detalle'),
    mensajes: args.includes('--mensajes'),
  };
  const entradas = args.filter((a) => !a.startsWith('--'));
  if (!entradas.length) {
    console.error('Uso: node scripts/medir-adopcion.js <docx|carpeta> [...] [--detalle] [--mensajes] [--sin-anchos]');
    process.exit(1);
  }
  const todos = [];
  for (const f of ficheros(entradas)) {
    try {
      const r = await medirDocumento(f, opts);
      todos.push(r);
      imprimirDocumento(r, opts);
    } catch (e) {
      console.log(`\n=== ${path.basename(f)}\nERROR: ${e.message}`);
    }
  }
  if (!todos.length) return;
  const tablas = todos.reduce((n, r) => n + r.tablas.length, 0);
  const conModelo = todos.reduce((n, r) => n + r.conModelo.filter(Boolean).length, 0);
  console.log(`\n=== TOTAL: ${todos.length} documentos, ${tablas} tablas, ${conModelo} en un campo que admite modelo hoy`);
  console.log('  tipos: ' + contar(todos.flatMap((r) => r.tipos)).map(([k, v]) => `${k} x${v}`).join(', '));
  imprimirCuenta('con el modelo de su grupo ', juntar(todos.map((r) => r.cuentas.grupo)), opts);
  imprimirCuenta('sueltas, con el suyo propio', juntar(todos.map((r) => r.cuentas.suelta)), opts);
  imprimirCuenta('TECHO: todas, con el suyo ', juntar(todos.map((r) => r.cuentas.techo)), opts);
  imprimirCuenta('la ficha de SA, con el modelo de la ficha', juntar(todos.map((r) => r.cuentas.ficha)), opts);
  imprimirPorTipo(todos.flatMap((r) => r.porTipo));
}

module.exports = { medirDocumento, propuestas, modeloDeLaFicha, medirUna };

if (require.main === module) principal();
