// Saca el contenido real del documento importado y lo deja como un fichero JS
// que el mockup puede cargar con un <script>, sin servidor y sin npm.
//
//     node docs/mockup-v2/herramientas/extraer-contenido.js
//
// Lee lo que produce el importador del motor:
//
//     out/importado/{plantilla.json,datos.json}
//
// y escribe docs/mockup-v2/js/importado.js. Ese `out/` está en .gitignore —como
// los .docx— así que esto solo se puede ejecutar en una máquina que tenga el
// documento original; por eso el resultado sí se versiona: es lo único que le
// llega a quien abra el mockup sin tener la PD delante.
//
// Se traen los once módulos completos, con sus resultados de aprendizaje, sus
// ponderaciones y sus situaciones de aprendizaje. Antes se traían solo tres, por
// tamaño, y era peor el remedio: un módulo que en la programación tiene seis
// situaciones de aprendizaje aparecía en el mockup diciendo que no tiene
// ninguna, y quien lo abre no puede saber si eso es el documento o es el
// prototipo. Para una muestra, mentir sobre el contenido cuesta más que los
// kilobytes.
//
// Si alguna vez hace falta recortar, en COMPLETOS se ponen los títulos de los
// módulos que se quieren enteros. Lo que falte lo rellena el mockup con el
// corpus de ejemplo de js/contenido.js. Lo que sale es un fichero generado: no
// se edita a mano.
//
// ANONIMIZA. El documento real trae el nombre del profesorado titular de cada
// módulo, el nombre del centro y su localidad, y eso no entra en el repositorio
// —ya se quitó a mano del mockup v1 (commit «quitar información delicada del
// mockup»)—. Así que:
//
//   - el apartado que describe el centro y la localidad no se trae (FUERA);
//   - los nombres propios se sacan del propio documento, de la fila «Titular»
//     de la ficha de cada módulo, y se cambian por las personas inventadas del
//     mockup: este script no lleva escrito ningún nombre real;
//   - el nombre del centro y la localidad se sustituyen (CAMBIOS);
//   - y antes de escribir se revisa el resultado entero (PROHIBIDO): si algo se
//     ha colado, el fichero NO se escribe y se dice dónde está.
//
// CASA LAS CLAVES. El importador y el mockup recortan los títulos largos a
// longitudes distintas al convertirlos en identificador, así que cinco de las 51
// claves de la PD de DAW no coinciden por unas letras:
//
//   importador  modulos/ponderaciones-de-los-resultados-de-aprendizaje-y-l
//   mockup      modulos/ponderaciones-de-los-resultados-de-aprendizaje-y-los-criteri
//
// Una es prefijo de la otra, así que se casan por prefijo contra el árbol que
// construye js/estructura.js. Si alguna no casa, se dice y no se trae: mejor un
// apartado de muestra que contenido pegado en el apartado equivocado.

'use strict';

const fs = require('fs');
const path = require('path');

const F = require('../../../motor/ficha-sa');

const RAIZ = path.join(__dirname, '..', '..', '..');
const SALIDA = path.join(__dirname, '..', 'js', 'importado.js');

// De dónde se lee, por orden de preferencia:
//
//   out/ejemplo/     el documento de ejemplo saneado (docs/entrada_ej/ejemplo/),
//                    que es el que se publica y el que cualquiera puede regenerar;
//   out/importado/   el documento real del departamento, si alguien lo tiene en
//                    su máquina y quiere ver el mockup con él antes de sanear.
//
// Se prefiere el ejemplo: lo que se versiona en js/importado.js tiene que salir
// de lo que está en el repositorio, no de un fichero que solo existe aquí.
const CANDIDATOS = [
  path.join(RAIZ, 'out', 'ejemplo'),
  path.join(RAIZ, 'out', 'importado'),
];
const ENTRADA = CANDIDATOS.filter((d) => fs.existsSync(path.join(d, 'datos.json')))[0] || CANDIDATOS[0];

// El documento importado es la programación didáctica del ciclo de DAW, y el
// curso con el que se construye el árbol para casar las claves.
const DOC = 'pd-fp-daw';
const CURSO = '2026-27';

// Módulos que se traen enteros: uno de cada forma de escribir la ficha de SA y
// de repartir las ponderaciones.
// `null` significa todos. Una lista de títulos recorta a esos.
const COMPLETOS = null;

// Campos que solo se guardan de los módulos completos, por tamaño.
const SOLO_COMPLETOS = ['ponderaciones', 'items'];

// Apartados que no se traen: describen el centro y su localidad con detalle
// suficiente para identificarlos aunque se cambien los nombres.
const FUERA = ['introduccion/contextualizacion-de-la-docencia'];

// Sustituciones fijas. El nombre del centro no es ningún secreto —la
// organización de GitHub se llama igual— pero el mockup se enseña fuera y en el
// v1 se quitó a mano, así que aquí se mantiene quitado.
const CAMBIOS = [
  [/\bI\.?E\.?S\.?\s+Hermanos\s+Amor[oó]s\b/gi, 'IES Ejemplo'],
  [/\bHermanos\s+Amor[oó]s\b/gi, 'Ejemplo'],
  [/\bVillena\b/gi, 'la localidad'],
];

// Las etiquetas de la ficha del módulo que llevan un nombre propio.
const ETIQUETAS_PERSONA = ['titular', 'profesor', 'profesora', 'docente', 'responsable'];

// Las personas inventadas del mockup (las mismas de js/contenido.js).
const INVENTADAS = ['Lucía M.', 'Pau S.', 'Nerea T.', 'Iván G.'];

// Lo que no puede quedar en el fichero generado. Si algo de esto aparece, se
// aborta: más vale quedarse sin contenido real que publicar un nombre.
const PROHIBIDO = [
  [/amor[oó]s/i, 'nombre del centro'],
  [/villena/i, 'localidad'],
  [/alto\s+vinalop[oó]/i, 'comarca'],
  [/[\w.]+@[\w.]+\.[a-z]{2,}/i, 'correo electrónico'],
  [/\b\d{9}\b/, 'nueve cifras seguidas (teléfono o documento)'],
  [/\b[0-9]{8}[A-Za-z]\b/, 'documento de identidad'],
];

// ---------------------------------------------------------------- utilidades
const norm = (s) => String(s == null ? '' : s)
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/\s+/g, ' ').trim();

const kb = (x) => Math.round(JSON.stringify(x).length / 1024);

// Catálogo de unidades y árbol de secciones del mockup, para casar lo importado
// con lo que la interfaz va a buscar. Se cargan los propios módulos del mockup:
// una sola definición, no dos.
function mockup() {
  const g = globalThis;
  require(path.join(__dirname, '..', 'js', 'util.js'));
  require(path.join(__dirname, '..', '..', '..', 'core', 'unidades.js'));
  g.Unidades = g.Core.unidades;
  require(path.join(__dirname, '..', 'js', 'plantilla.js'));
  require(path.join(__dirname, '..', 'js', 'estructura.js'));
  const nodos = g.Estructura.aplanar(g.Estructura.construirArbol(DOC, CURSO)).map((x) => x.nodo);
  return {
    unidades: g.Unidades.UNIDADES,
    comunes: nodos.filter((n) => n.seccion && !n.unidadId).map((n) => n.seccion),
    deUnidad: nodos.filter((n) => n.seccion && n.unidadId).map((n) => n.seccion),
  };
}

// La clave importada contra las del mockup: igual, o una recorte de la otra.
//
// Se exige la MISMA PROFUNDIDAD —el mismo número de tramos— porque si no, una
// clave de un apartado casa con la de su contenedor: `modulos/desarrollo-
// curricular/resultados-...` empieza por `modulos/desarrollo-curricular`, y el
// contenido de cinco apartados acababa pisándose encima del padre. Entre los que
// quedan se elige el más largo, que es el más específico.
const tramos = (x) => x.split('/').length;

function casar(clave, claves) {
  if (claves.indexOf(clave) >= 0) return clave;
  const cand = claves
    .filter((x) => tramos(x) === tramos(clave) && (x.indexOf(clave) === 0 || clave.indexOf(x) === 0))
    .sort((a, b) => b.length - a.length);
  return cand[0] || null;
}

// El título del Word puede ser el de cualquier curso: se prueban todos.
function unidadDe(unidades, titulo) {
  const t = norm(titulo);
  return unidades.filter((u) => norm(u.titulo) === t
    || Object.keys(u.titulos || {}).some((c) => norm(u.titulos[c]) === t))[0] || null;
}

// ---------------------------------------------------------------- anonimizar
// Un par etiqueta/valor de los que llevan un nombre propio: «Titular: Nombre
// Apellido». Dos palabras o más y empezando por mayúscula, para no confundir un
// guion o un «—» con un nombre.
const esDePersona = (par) => par && ETIQUETAS_PERSONA.indexOf(norm(par.etiqueta)) >= 0
  && String(par.valor || '').trim().split(/\s+/).length >= 2
  && /^[A-ZÁÉÍÓÚÑÀ-Ü]/.test(String(par.valor || '').trim());

// Recorre todos los pares etiqueta/valor del documento, estén donde estén. Lo
// usan la recogida de nombres y el guardia, para que los dos miren lo mismo.
function cadaPar(x, fn) {
  if (Array.isArray(x)) { x.forEach((y) => cadaPar(y, fn)); return; }
  if (!x || typeof x !== 'object') return;
  if (Array.isArray(x.pares)) x.pares.forEach((par) => fn(par));
  Object.keys(x).forEach((k) => { if (k !== 'pares') cadaPar(x[k], fn); });
}
// Los nombres propios se recogen del documento y se cambian por los inventados.
// Se devuelve la lista de sustituciones para poder aplicarla a todo el texto,
// porque un nombre puede aparecer también en medio de un párrafo.
function sustitucionesDe(datos) {
  const reales = [];
  cadaPar(datos, (par) => {
    if (!esDePersona(par)) return;
    const nombre = String(par.valor).trim();
    if (reales.indexOf(nombre) < 0) reales.push(nombre);
  });

  const escapar = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return {
    reales,
    cambios: reales.map((nombre, i) => [new RegExp(escapar(nombre), 'g'), INVENTADAS[i % INVENTADAS.length]])
      .concat(CAMBIOS),
  };
}

// Recorre el árbol entero cambiando las cadenas. No se usa un reemplazo sobre el
// JSON serializado porque un nombre podría llevar comillas o barras escapadas.
function anonimizar(x, cambios) {
  if (typeof x === 'string') return cambios.reduce((t, [re, por]) => t.replace(re, por), x);
  if (Array.isArray(x)) return x.map((y) => anonimizar(y, cambios));
  if (x && typeof x === 'object') {
    const out = {};
    Object.keys(x).forEach((k) => { out[k] = anonimizar(x[k], cambios); });
    return out;
  }
  return x;
}

// El guardia: busca lo prohibido en el resultado y devuelve lo que encuentre.
function restos(extraido, reales) {
  const texto = JSON.stringify(extraido);
  const avisos = [];

  // Primero por estructura: si queda un par «Titular: Nombre Apellido», da igual
  // que la lista de nombres se haya quedado corta. Esta comprobación no depende
  // de haber acertado al recogerlos.
  cadaPar(extraido, (par) => {
    if (esDePersona(par) && INVENTADAS.indexOf(String(par.valor).trim()) < 0) {
      avisos.push('nombre propio sin sustituir en «' + par.etiqueta + '»: ' + JSON.stringify(par.valor));
    }
  });
  PROHIBIDO.concat(reales.map((n) => [new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), 'nombre propio']))
    .forEach(([re, que]) => {
      const m = texto.match(re);
      if (m) avisos.push(que + ': ' + JSON.stringify(texto.slice(Math.max(0, texto.indexOf(m[0]) - 60), texto.indexOf(m[0]) + 60)));
    });
  return avisos;
}

// ---------------------------------------------------------------- un campo
// Cada sección importada trae uno o varios campos. Se normalizan a lo que el
// mockup sabe pintar: bloques de texto, tablas de celdas, pares etiqueta/valor,
// la tabla de RA y CE, las ponderaciones y las fichas de SA.
function valorDeSeccion(valor, completo) {
  const out = {};
  Object.keys(valor || {}).forEach((campo) => {
    const v = valor[campo];
    if (v === null || v === undefined) return;
    if (!completo && SOLO_COMPLETOS.indexOf(campo) >= 0) return;

    if (campo === 'texto') { out.bloques = v; return; }

    if (campo === 'items') return;      // las fichas de SA van aparte, como modelo
    // El resumen SA × RA no se trae: el mockup lo calcula desde las fichas, como
    // hace el motor. Guardarlo sería guardar algo que puede quedar desfasado.
    if (campo === 'resumen_situaciones') return;

    const lista = Array.isArray(v) ? v : [v];

    if (campo === 'ponderaciones') {
      // [{ ra, texto, ponderacion, ce: [{ letra, texto, ponderacion }] }]
      const ra = lista.filter((x) => x && x.ra !== null && x.ra !== undefined);
      if (ra.length) out.ponderaciones = ra;
      else out.tabla = lista.filter((x) => x && x.filas).map((x) => x.filas)[0] || null;
      return;
    }
    if (campo === 'ra_ce') {
      const conRa = lista.filter((x) => x && Array.isArray(x.ra) && x.ra.length);
      if (conRa.length) out.raCe = conRa[0].ra;
      return;
    }
    if (campo === 'ficha_modulo' || campo === 'pares') {
      const pares = lista.filter((x) => x && x.pares).flatMap((x) => x.pares);
      if (pares.length) out.pares = pares;
      return;
    }
    // Cualquier otra tabla (competencias, contenidos, resumen de situaciones…).
    // Solo de los módulos completos: la tabla resumen de situaciones de un
    // módulo pasa de los 50 KB ella sola.
    if (!completo) return;
    const tablas = lista.filter((x) => x && Array.isArray(x.filas) && x.filas.length).map((x) => x.filas);
    if (tablas.length) out.tablas = (out.tablas || []).concat(tablas);
  });
  return Object.keys(out).length ? out : null;
}

// Las fichas de SA de una unidad, ya como modelo editable.
function situacionesDe(valores) {
  const claves = Object.keys(valores || {});
  const out = [];
  const añadir = (ficha, titulo, i) => {
    const fichas = Array.isArray(ficha) ? ficha : [ficha];
    fichas.filter(Boolean).forEach((f) => {
      const modelo = F.esSemantica(f) ? f : F.fichaDeFilas(f.filas, f);
      if (!modelo.titulo) modelo.titulo = titulo || '';
      if (modelo.num == null) modelo.num = i + 1;
      // `filas` no se guarda: la tabla se vuelve a montar desde el modelo, que
      // es lo que hace que una SA nueva se imprima igual que una importada.
      delete modelo.filas;
      out.push(modelo);
    });
  };

  // Lo normal: el Word pone un título por situación, el importador hace un
  // repetidor y cada item lleva su ficha.
  const kRep = claves.filter((k) => /situacion-de-aprendizaje$/.test(k))[0];
  const rep = kRep ? valores[kRep] : null;
  if (rep && Array.isArray(rep.items)) rep.items.forEach((item, i) => añadir(item.ficha, item.titulo, i));

  // Y el caso que se nos escapaba: hay módulos cuyas situaciones no llevan
  // título propio en el documento, así que no hay repetidor y las fichas quedan
  // colgando del apartado. Sin esto, un módulo con cinco situaciones aparecía en
  // el mockup diciendo que no tiene ninguna.
  const kSec = claves.filter((k) => /situaciones-de-aprendizaje$/.test(k))[0];
  const sec = kSec ? valores[kSec] : null;
  if (sec && sec.ficha) añadir(sec.ficha, '', out.length);

  return out.sort((a, b) => (a.num || 0) - (b.num || 0));
}

// ---------------------------------------------------------------- extracción
function extraer() {
  const datos = JSON.parse(fs.readFileSync(path.join(ENTRADA, 'datos.json'), 'utf8'));
  const plantilla = JSON.parse(fs.readFileSync(path.join(ENTRADA, 'plantilla.json'), 'utf8'));
  const M = mockup();
  const sinCasar = [];

  const { cambios, reales } = sustitucionesDe(datos);

  const comunes = {};
  Object.keys(datos.documento || {}).forEach((sec) => {
    if (FUERA.indexOf(sec) >= 0) return;
    const clave = casar(sec, M.comunes);
    if (!clave) { sinCasar.push('apartado común: ' + sec); return; }
    const v = valorDeSeccion(datos.documento[sec], true);
    if (v) comunes[clave] = v;
  });

  const porUnidad = {};
  const informe = [];
  (datos.instancias || []).forEach((inst) => {
    const u = unidadDe(M.unidades, inst.titulo);
    if (!u) { informe.push(['?', inst.titulo, 'SIN CASAR con el catálogo']); return; }
    const completo = !COMPLETOS || COMPLETOS.some((t) => norm(t) === norm(inst.titulo));

    const secciones = {};
    Object.keys(inst.valores || {}).forEach((sec) => {
      if (FUERA.indexOf(sec) >= 0) return;
      if (/situacion-de-aprendizaje$/.test(sec)) return;      // van aparte, como modelo
      const clave = casar(sec, M.deUnidad);
      if (!clave) { sinCasar.push(inst.titulo + ': ' + sec); return; }
      const v = valorDeSeccion(inst.valores[sec], completo);
      if (v) secciones[clave] = v;
    });

    const sa = completo ? situacionesDe(inst.valores) : [];
    porUnidad[u.id] = { titulo: inst.titulo, grupo: inst.grupo || null, completo, secciones, sa };
    informe.push([u.id, inst.titulo, (completo ? 'completo' : 'ligero') + ', ' + Object.keys(secciones).length
      + ' apartados' + (sa.length ? ', ' + sa.length + ' SA' : '') + ', ' + kb(porUnidad[u.id]) + ' KB']);
  });

  const extraido = anonimizar({
    origen: {
      documento: plantilla.origen || null,
      generada: plantilla.generada || null,
      modulos: (datos.instancias || []).length,
      completos: COMPLETOS ? COMPLETOS.slice() : 'todos',
      anonimizado: true,
      fuera: FUERA.slice(),
    },
    COMUNES: comunes,
    UNIDADES: porUnidad,
  }, cambios);
  extraido._informe = informe;
  extraido._reales = reales;
  extraido._sinCasar = sinCasar;
  return extraido;
}

// ---------------------------------------------------------------- escritura
function escribir(extraido) {
  const informe = extraido._informe;
  const reales = extraido._reales || [];
  const sinCasar = extraido._sinCasar || [];
  const nombres = reales.length;
  delete extraido._informe;
  delete extraido._reales;
  delete extraido._sinCasar;

  // `out/ejemplo/` lo sobreescribe cada ejecución de generar-ejemplo.js, así que
  // puede tener cualquiera de los trece documentos del departamento. Este
  // extractor solo sabe leer la PD de FP de DAW —su catálogo de unidades y su
  // árbol de apartados—, y con otro documento escribiría un fichero casi vacío
  // sin que nadie se enterase. Antes de escribir se comprueba que es el que es.
  const casadas = Object.keys(extraido.UNIDADES).length;
  if (casadas < 5) {
    console.error('Lo que hay en ' + ENTRADA + ' no es la programación de FP de DAW:');
    console.error('  ' + extraido.origen.modulos + ' instancias en el documento, de las que han casado '
      + casadas + ' con el catálogo de unidades del mockup.');
    console.error('Vuelve a generar el ejemplo de DAW antes de extraer:');
    console.error('  npm run ejemplo');
    process.exit(3);
  }

  if (sinCasar.length) {
    console.error('Apartados importados que no casan con ningún apartado del mockup:');
    sinCasar.forEach((x) => console.error('  - ' + x));
    console.error('Se quedan fuera. Repasa js/estructura.js si alguno debería estar.\n');
  }

  const avisos = restos(extraido, reales);
  if (avisos.length) {
    console.error('NO SE ESCRIBE NADA: queda información que no debe salir del documento.\n');
    avisos.forEach((a) => console.error('  - ' + a));
    console.error('\nAñade la sustitución que falte a CAMBIOS, o el apartado a FUERA, y repite.');
    process.exit(2);
  }

  const cab = [
    '// FICHERO GENERADO: no se edita a mano.',
    '//',
    '//     node docs/mockup-v2/herramientas/extraer-contenido.js',
    '//',
    '// Contenido real de la programación didáctica del departamento, sacado de lo',
    '// que produce el importador del motor (motor/importar-docx.js) y',
    '// recortado a una muestra: los apartados comunes enteros, ' + extraido.origen.completos.length + ' módulos completos',
    '// con sus RA, sus ponderaciones y sus situaciones de aprendizaje, y del resto',
    '// lo ligero. Lo que no esté aquí lo rellena el corpus de ejemplo de',
    '// js/contenido.js, así que el mockup funciona igual con esto y sin esto.',
    '//',
    '// ANONIMIZADO: ' + nombres + ' nombres propios cambiados por las personas inventadas del',
    '// mockup, nombre del centro y localidad sustituidos, y ' + extraido.origen.fuera.length
      + ' apartado(s) dejados fuera por',
    '// describir el centro. Lo revisa el propio extractor antes de escribir.',
    '//',
    '// Qué hay dentro:',
    '//',
    '//   COMUNES[seccion]          apartados del documento: { bloques | tablas | pares }',
    '//   UNIDADES[idUnidad]        { titulo, grupo, completo, secciones, sa }',
    '//   UNIDADES[id].secciones[s] { bloques | tablas | pares | raCe | ponderaciones }',
    '//   UNIDADES[id].sa[]         fichas de situación de aprendizaje, ya como modelo',
    '//                             editable (motor/ficha-sa.js), sin la tabla importada',
    '//',
  ].concat(informe.map((f) => '//   ' + String(f[0]).padEnd(11) + ' ' + String(f[1]).slice(0, 44).padEnd(45) + f[2]))
    .concat(['//']);

  // Se escribe a mano, con una línea por apartado y una por ficha de SA, en vez
  // de un JSON.stringify con sangría: así el fichero no dobla de tamaño por los
  // espacios y un cambio en un apartado sale en el diff como una línea.
  const j = (x) => JSON.stringify(x);
  const l = [];
  l.push('(function (global) {');
  l.push('  \'use strict\';');
  l.push('');
  l.push('  const COMUNES = {};');
  Object.keys(extraido.COMUNES).forEach((k) => l.push('  COMUNES[' + j(k) + '] = ' + j(extraido.COMUNES[k]) + ';'));
  l.push('');
  l.push('  const UNIDADES = {};');
  Object.keys(extraido.UNIDADES).forEach((id) => {
    const u = extraido.UNIDADES[id];
    l.push('');
    l.push('  // ' + u.titulo + (u.completo ? ' (completo)' : ' (ligero)'));
    l.push('  UNIDADES[' + j(id) + '] = ' + j({ titulo: u.titulo, grupo: u.grupo, completo: u.completo })
      + ';');
    l.push('  UNIDADES[' + j(id) + '].secciones = {};');
    Object.keys(u.secciones).forEach((sec) => l.push('  UNIDADES[' + j(id) + '].secciones[' + j(sec) + '] = '
      + j(u.secciones[sec]) + ';'));
    l.push('  UNIDADES[' + j(id) + '].sa = [' + (u.sa.length ? '' : '];'));
    u.sa.forEach((sa, i) => l.push('    ' + j(sa) + (i === u.sa.length - 1 ? ',' : ',')));
    if (u.sa.length) l.push('  ];');
  });
  l.push('');
  l.push('  global.Importado = { origen: ' + j(extraido.origen) + ', COMUNES, UNIDADES };');
  l.push('})(typeof globalThis !== \'undefined\' ? globalThis : this);');
  l.push('');

  fs.writeFileSync(SALIDA, cab.join('\n') + '\n\n' + l.join('\n'), 'utf8');
  return informe;
}

if (require.main === module) {
  if (!fs.existsSync(path.join(ENTRADA, 'datos.json'))) {
    console.error('No hay nada importado en ' + ENTRADA + '.\n'
      + 'Hace falta el documento original: importa primero con el motor (api/importar.js).');
    process.exit(1);
  }
  const extraido = extraer();
  const informe = escribir(extraido);
  informe.forEach((f) => console.log(String(f[0]).padEnd(12), String(f[1]).slice(0, 46).padEnd(47), f[2]));
  console.log('\ncomunes: ' + Object.keys(extraido.COMUNES).length + ' apartados, ' + kb(extraido.COMUNES) + ' KB');
  console.log('total:   ' + kb(extraido) + ' KB en ' + path.relative(RAIZ, SALIDA));
}

module.exports = { extraer, unidadDe, valorDeSeccion, situacionesDe };
