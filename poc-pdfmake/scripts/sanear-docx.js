// Sanea los documentos originales del departamento EDITÁNDOLOS EN SU SITIO:
//
//     node scripts/sanear-docx.js                        los doce, a out/saneado/
//     node scripts/sanear-docx.js "ruta/al/documento.docx"    solo ese
//     node scripts/sanear-docx.js --publicar             ...y copia a docs/entrada_ej/ejemplo/
//     node scripts/sanear-docx.js --anonimizar-centro    cambia también el centro
//     node scripts/sanear-docx.js --partes               imprime la tabla de partes completa
//     node scripts/sanear-docx.js "ruta" --modelo    escribe el modelo en out/ejemplo/
//
// Es el envoltorio de lib/sanear-docx.js, que abre el .docx original, copia
// todas sus partes tal cual y cambia solo el texto que no puede publicarse:
// personas, contactos, datos de terceros, el material docente de las fichas de
// SA y los apartados con valoraciones internas. A diferencia de
// scripts/generar-ejemplo.js, que escribe un .docx nuevo desde el modelo
// importado, aquí se conserva la portada, el índice, los estilos, las imágenes,
// las cabeceras y los pies: el ejemplo existe para probar el importador contra
// documentos reales, y uno escrito por nosotros a partir de una importación no
// prueba nada.
//
// Editar el original reintroduce el riesgo que generar de cero eliminaba, así
// que el módulo quita las partes que guardan lo que no se ve (propiedades,
// comentarios, personas, miniatura de la portada, EXIF de las imágenes) y
// acepta los cambios con control. Por eso las seis comprobaciones van sobre el
// .docx resultante REIMPORTADO y sobre todas las partes de su zip, no sobre el
// modelo saneado en memoria: lo único que demuestra que el fichero está limpio
// es lo que se lee de vuelta de él.
//
// Un documento que falle cualquiera de las seis NO se escribe. Más vale no
// tener ejemplo que publicar uno sucio.
//
// Por omisión los resultados van a out/saneado/, que git ignora, para poder
// mirarlos (y abrir uno en Word, que es lo que ninguna comprobación puede
// hacer) antes de que sustituyan a los de docs/entrada_ej/ejemplo/. Con
// --publicar se copian también allí.
//
// Lo que no tiene forma reconocible (un pueblo citado de pasada) se pasa en
// out/sustituciones.local.json, que git ignora a propósito para que los datos
// reales no acaben escritos en un fichero del repositorio.
//
// Los originales están en .gitignore: este guion solo funciona en la máquina de
// quien los tenga. No forma parte de `npm test`.

'use strict';

const fs = require('fs');
const path = require('path');
const D = require('../lib/sanear-docx');

const RAIZ_REPO = path.resolve(__dirname, '..', '..');
const RAIZ_POC = path.resolve(__dirname, '..');
const ENTRADA = path.join(RAIZ_REPO, 'docs', 'entrada_ej');
const CURSOS = ['2025-26', '2026-27'];
const CARPETA_SALIDA = path.join(RAIZ_POC, 'out', 'saneado');
const CARPETA_EJEMPLO = path.join(ENTRADA, 'ejemplo');
// De aquí lee docs/mockup-v2/herramientas/extraer-contenido.js el contenido que
// enseña el mockup.
const CARPETA_MODELO = path.join(RAIZ_POC, 'out', 'ejemplo');
const FICHERO_SUSTITUCIONES = path.join(RAIZ_POC, 'out', 'sustituciones.local.json');
const FICHERO_RESULTADOS = path.join(RAIZ_POC, 'out', 'resultados.local.json');

const tam = (bytes) => (bytes >= 1048576
  ? (bytes / 1048576).toFixed(1) + ' MB'
  : (bytes / 1024).toFixed(0) + ' KB');

const reloj = (ms) => (ms >= 60000
  ? Math.floor(ms / 60000) + ' min ' + String(Math.round((ms % 60000) / 1000)).padStart(2, '0') + ' s'
  : (ms / 1000).toFixed(1) + ' s');

// El nombre del ejemplo: el del original sin el sufijo de fecha `_DDMMAA`, que
// es la convención que ya siguen los que hay en docs/entrada_ej/ejemplo/.
const nombreEjemplo = (ruta) => path.basename(ruta, '.docx').replace(/_\d{6}$/, '') + '-ejemplo.docx';

function listar() {
  const docs = [];
  for (const curso of CURSOS) {
    const dir = path.join(ENTRADA, curso);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((x) => x.toLowerCase().endsWith('.docx'))) {
      const ruta = path.join(dir, f);
      docs.push({ curso, nombre: f, ruta, bytes: fs.statSync(ruta).size });
    }
  }
  // De menor a mayor. Cada documento cuesta unos dos minutos y medio porque el
  // módulo lo genera dos veces para comprobar que da los mismos bytes, así que
  // empezar por los pequeños da la mayoría de los veredictos en los primeros
  // minutos en vez de después de las programaciones grandes.
  return docs.sort((a, b) => a.bytes - b.bytes);
}

function sustitucionesLocales() {
  if (!fs.existsSync(FICHERO_SUSTITUCIONES)) return [];
  try {
    const x = JSON.parse(fs.readFileSync(FICHERO_SUSTITUCIONES, 'utf8'));
    return Array.isArray(x) ? x : [];
  } catch (e) {
    console.error('out/sustituciones.local.json no se puede leer: ' + e.message);
    process.exit(2);
  }
}

function imprimirPartes(tabla, completa) {
  const cuenta = { igual: 0, editado: 0, eliminado: 0 };
  tabla.forEach((p) => { cuenta[p.estado] = (cuenta[p.estado] || 0) + 1; });
  console.log('   partes: ' + cuenta.igual + ' iguales byte a byte, '
    + cuenta.editado + ' editadas, ' + cuenta.eliminado + ' eliminadas');
  tabla.filter((p) => p.estado !== 'igual')
    .forEach((p) => console.log('     ' + p.estado.padEnd(9) + ' ' + p.nombre + (p.motivo ? '  (' + p.motivo + ')' : '')));
  if (completa) {
    tabla.filter((p) => p.estado === 'igual')
      .forEach((p) => console.log('     igual     ' + p.nombre));
  }
}

async function principal() {
  const args = process.argv.slice(2);
  const opts = {
    publicar: args.includes('--publicar'),
    partes: args.includes('--partes'),
    anonimizarCentro: args.includes('--anonimizar-centro'),
    modelo: args.includes('--modelo'),
  };
  const sueltos = args.filter((a) => !a.startsWith('--'));
  // `--modelo` escribe en out/ejemplo/, que es de donde lee el contenido del
  // mockup, así que tiene que ser un documento concreto y no la pasada entera:
  // si no, el modelo que queda es el del último que se procese.
  if (opts.modelo && sueltos.length !== 1) {
    console.error('--modelo necesita exactamente un documento: es el que se lleva al mockup.');
    console.error('  node scripts/sanear-docx.js "../docs/entrada_ej/2026-27/PD_DAW_26-27_161026.docx" --modelo');
    process.exit(2);
  }

  let docs;
  if (sueltos.length) {
    docs = sueltos.map((a) => {
      const ruta = path.resolve(process.cwd(), a);
      if (!fs.existsSync(ruta)) {
        console.error('No encuentro ' + a);
        process.exit(2);
      }
      return { curso: path.basename(path.dirname(ruta)), nombre: path.basename(ruta), ruta, bytes: fs.statSync(ruta).size };
    });
  } else {
    docs = listar();
    if (!docs.length) {
      console.error('No hay ningún .docx en ' + path.relative(RAIZ_REPO, ENTRADA) + '/{' + CURSOS.join(',') + '}');
      console.error('Los originales no se versionan: este guion solo funciona donde estén.');
      process.exit(2);
    }
  }

  const sustituciones = sustitucionesLocales();
  fs.mkdirSync(CARPETA_SALIDA, { recursive: true });

  const bytesTotales = docs.reduce((a, d) => a + d.bytes, 0);
  console.log(docs.length + ' documento(s), ' + tam(bytesTotales) + ' en total.');
  console.log('Sustituciones locales: ' + (sustituciones.length || 'ninguna'));
  console.log('Centro: ' + (opts.anonimizarCentro ? 'se cambia' : 'se conserva (es el del propio repositorio)'));
  console.log('Salida: ' + path.relative(RAIZ_REPO, CARPETA_SALIDA)
    + (opts.publicar ? ' y ' + path.relative(RAIZ_REPO, CARPETA_EJEMPLO) : ' (sin --publicar no se toca docs/entrada_ej/ejemplo/)'));

  const resumen = [];
  let bytesHechos = 0;
  const t0 = Date.now();

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    const queda = bytesHechos
      ? '  (quedan ~' + reloj((Date.now() - t0) / bytesHechos * (bytesTotales - bytesHechos)) + ')'
      : '';
    console.log('\n[' + (i + 1) + '/' + docs.length + '] ' + doc.curso + '/' + doc.nombre + '  ' + tam(doc.bytes) + queda);

    const t = Date.now();
    let r;
    try {
      r = await D.sanearDocxBuffer(fs.readFileSync(doc.ruta), { sustituciones, anonimizarCentro: opts.anonimizarCentro });
    } catch (e) {
      console.log('   ERROR inesperado: ' + e.message);
      if (process.env.PCCF_TRAZA) console.log(e.stack);
      resumen.push({ doc: doc.curso + '/' + doc.nombre, ok: false, error: e.message, ms: Date.now() - t });
      bytesHechos += doc.bytes;
      escribirResultados(resumen);
      continue;
    }
    const ms = Date.now() - t;
    bytesHechos += doc.bytes;
    const inf = r.informe;

    console.log('   personas: ' + inf.personas + ' (' + inf.variantesDeNombre + ' formas de escribir sus nombres)'
      + ', fichas de SA: ' + inf.fichas + ', apartados reescritos: ' + inf.apartadosReescritos
      + ', recursos: ' + inf.recursos);
    console.log('   tramos de texto cambiados: ' + JSON.stringify(inf.cambios));
    imprimirPartes(inf.partes || [], opts.partes);
    inf.pruebas.forEach(([nombre, fallos]) => {
      console.log('   ' + (fallos.length ? 'FALLA  ' : 'bien   ') + nombre);
      fallos.forEach((m) => console.log('        - ' + m));
    });
    console.log('   ' + reloj(ms) + ', resultado ' + (r.buffer ? tam(r.buffer.length) : '—'));

    let escrito = null;
    if (r.ok) {
      escrito = path.join(CARPETA_SALIDA, nombreEjemplo(doc.ruta));
      fs.writeFileSync(escrito, r.buffer);
      if (opts.publicar) {
        fs.mkdirSync(CARPETA_EJEMPLO, { recursive: true });
        fs.writeFileSync(path.join(CARPETA_EJEMPLO, nombreEjemplo(doc.ruta)), r.buffer);
      }
      console.log('   escrito: ' + path.relative(RAIZ_REPO, escrito) + (opts.publicar ? ' (y publicado)' : ''));
      if (opts.modelo) {
        // El modelo se saca del .docx REIMPORTADO, no del saneado en memoria:
        // lo que el mockup tiene que mostrar es lo que de verdad se lee del
        // fichero que se publica.
        fs.mkdirSync(CARPETA_MODELO, { recursive: true });
        const rp = path.join(CARPETA_MODELO, 'plantilla.json');
        const rd = path.join(CARPETA_MODELO, 'datos.json');
        // La procedencia que enseña el mockup es el nombre del EJEMPLO, no el
        // del original: el original no se publica y su nombre tampoco.
        const plantilla = { ...r.reimportado.plantilla, origen: nombreEjemplo(doc.ruta), generada: new Date().toISOString() };
        fs.writeFileSync(rp, JSON.stringify(plantilla, null, 2));
        fs.writeFileSync(rd, JSON.stringify(r.reimportado.datos, null, 2));
        console.log('   modelo: ' + path.relative(RAIZ_REPO, rp) + ' (' + tam(fs.statSync(rp).size) + ')'
          + ' y datos.json (' + tam(fs.statSync(rd).size) + ')');
        console.log('   para llevarlo al mockup: node docs/mockup-v2/herramientas/extraer-contenido.js');
      }
    } else {
      console.log('   NO se escribe: alguna comprobación ha fallado.');
    }

    resumen.push({
      doc: doc.curso + '/' + doc.nombre,
      ok: r.ok,
      ms,
      bytesOriginal: doc.bytes,
      bytesResultado: r.buffer ? r.buffer.length : null,
      escrito: escrito ? path.relative(RAIZ_REPO, escrito) : null,
      personas: inf.personas,
      variantes: inf.variantesDeNombre,
      fichas: inf.fichas,
      apartadosReescritos: inf.apartadosReescritos,
      recursos: inf.recursos,
      cambios: inf.cambios,
      editados: [...inf.editados.entries()].map(([n, m]) => n + (m ? ': ' + m : '')),
      eliminados: [...inf.eliminados.entries()].map(([n, m]) => n + (m ? ': ' + m : '')),
      pruebas: inf.pruebas.map(([n, f]) => [n, f.length]),
      fallos: inf.fallos,
      partes: inf.partes,
    });
    // Después de cada documento, no al final: una pasada de los doce son más de
    // media hora y si se corta a mitad lo ya hecho tiene que quedar escrito.
    escribirResultados(resumen);
  }

  const bien = resumen.filter((x) => x.ok);
  const mal = resumen.filter((x) => !x.ok);
  console.log('\n' + '-'.repeat(60));
  console.log('Pasan todas: ' + bien.length + ' de ' + resumen.length + '   (' + reloj(Date.now() - t0) + ')');
  mal.forEach((x) => {
    console.log('  FALLA ' + x.doc);
    (x.fallos || [x.error]).forEach((f) => console.log('        - ' + f));
  });
  console.log('Detalle completo: ' + path.relative(RAIZ_REPO, FICHERO_RESULTADOS));

  if (!opts.publicar && bien.length) {
    console.log('\nLos de docs/entrada_ej/ejemplo/ siguen siendo los del método anterior (generados desde');
    console.log('el modelo, sin portada ni estilos). Para sustituirlos, cuando pasen los doce:');
    console.log('  node scripts/sanear-docx.js --publicar');
    console.log('Antes, abre uno de out/saneado/ en Word: que no se publique un dato lo garantizan las');
    console.log('comprobaciones, que el fichero no esté corrupto no lo puede garantizar ninguna.');
  }

  process.exit(mal.length ? 1 : 0);
}

function escribirResultados(resumen) {
  fs.writeFileSync(FICHERO_RESULTADOS, JSON.stringify(resumen, null, 2));
}

if (require.main === module) {
  principal().catch((e) => {
    console.error('Error inesperado: ' + e.message);
    console.error(e.stack);
    process.exit(2);
  });
}
