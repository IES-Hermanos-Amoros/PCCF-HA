// Genera el documento de ejemplo publicable a partir de la PD real del
// departamento:
//
//     node scripts/generar-ejemplo.js ["ruta/al/documento.docx"]
//
// Encadena las tres piezas del repositorio: importa el .docx real
// (motor/importar-docx.js), lo sanea (motor/sanear.js: personas, empresas, centro,
// material docente de las fichas de SA, apartados con valoraciones internas) y
// escribe un .docx nuevo (motor/exportar-docx.js) en docs/entrada_ej/ejemplo/.
// Después lo vuelve a importar, guarda plantilla y datos en out/ejemplo/ (de ahí
// lo lee el mockup) y comprueba el resultado.
//
// El ejemplo se GENERA y no se edita sobre el original porque un .docx por
// dentro guarda mucho más de lo que se ve: autor y revisores en las propiedades,
// texto borrado que sigue en el XML, comentarios, miniaturas. El exportador
// escribe un fichero desde cero con solo la estructura y el texto del modelo, de
// modo que nada de eso puede viajar.
//
// LAS COMPROBACIONES VAN SOBRE EL FICHERO REIMPORTADO, no sobre los datos
// saneados en memoria. Para algunas tablas el exportador escribe las `filas`
// importadas en lugar de rehacerlas desde el modelo; un saneado que solo tocara
// el modelo pasaría sus propias pruebas y publicaría el dato real en las celdas.
// Lo único que demuestra que el ejemplo está limpio es lo que se lee de vuelta
// del .docx que se va a publicar. Si una comprobación falla se borra el .docx:
// más vale no tener ejemplo que publicar uno sucio.
//
// Lo que no tiene forma reconocible (una empresa citada de pasada en un párrafo)
// se pasa en out/sustituciones.local.json, que git ignora a propósito para que
// los datos reales no acaben escritos en un fichero del repositorio.
//
// Los originales están en .gitignore: este guion solo funciona en la máquina de
// quien los tenga. No forma parte de `npm test`.

'use strict';

const fs = require('fs');
const path = require('path');
const { importarDocx } = require('../motor/importar-docx');
const S = require('../motor/sanear');
const F = require('../motor/ficha-sa');
const { escribirDocx } = require('../motor/exportar-docx');
const { buildDocDefinition } = require('../motor/render-generico');

const RAIZ_REPO = path.resolve(__dirname, '..');
const RAIZ_POC = path.resolve(__dirname, '..');
const ORIGINAL_POR_OMISION = path.join(RAIZ_REPO, 'docs', 'entrada_ej', '2026-27', 'PD_DAW_26-27_161026.docx');
const CARPETA_EJEMPLO = path.join(RAIZ_REPO, 'docs', 'entrada_ej', 'ejemplo');
const CARPETA_SALIDA = path.join(RAIZ_POC, 'out', 'ejemplo');
const FICHERO_SUSTITUCIONES = path.join(RAIZ_POC, 'out', 'sustituciones.local.json');
const LARGO_MINIMO_LINEA = 40;

const kb = (ruta) => (fs.statSync(ruta).size / 1024).toFixed(1) + ' KB';

// ---------------------------------------------------------------- utilidades
// Todas las cadenas de un valor, con su ruta. Se incluye todo (también las
// `filas` y los compartidos): lo que vaya al .docx puede salir de cualquier sitio.
function cadaTexto(x, fn, ruta) {
  if (typeof x === 'string') fn(x, ruta);
  else if (Array.isArray(x)) x.forEach((y, i) => cadaTexto(y, fn, ruta + '[' + i + ']'));
  else if (x && typeof x === 'object') Object.keys(x).forEach((k) => cadaTexto(x[k], fn, ruta + '.' + k));
}

// Normaliza para comparar líneas: sin acentos, minúsculas, sin viñeta y con los
// espacios colapsados, de modo que un cambio de maquetación no deje pasar una
// línea copiada.
const claveLinea = (s) => F.norm(s).replace(/^[\s−–—•*·-]+/, '').replace(/\s+/g, ' ').trim();

// Las fichas de SA de una instancia.
function fichasDe(inst) {
  const out = [];
  const ver = (x) => {
    if (Array.isArray(x)) { x.forEach(ver); return; }
    if (!x || typeof x !== 'object') return;
    // Solo las fichas de SA, que traen número; la tabla de identificación del
    // módulo también cuelga de una propiedad `ficha`.
    if (x.ficha) (Array.isArray(x.ficha) ? x.ficha : [x.ficha]).forEach((f) => { if (f && typeof f === 'object' && f.num != null) out.push(f); });
    Object.keys(x).forEach((k) => { if (k !== 'ficha') ver(x[k]); });
  };
  ver(inst.valores);
  return out;
}

// La ficha leída de su tabla, que es lo que de verdad se escribe en el .docx.
const leerFicha = (f) => F.fichaDeFilas(f.filas, { num: f.num, titulo: f.titulo, sesiones: f.sesiones, evaluacion: f.evaluacion, ra: f.ra });

// Las celdas de una ficha que son texto normativo (RA, criterios, competencias,
// objetivos): salen del real decreto, se conservan a propósito y no cuentan como
// material docente. Se reconocen por la etiqueta de la celda de encima (o de la
// de al lado, en «Resultado(s) de aprendizaje»).
const ETIQUETAS_NORMATIVAS = ['criterios de evaluacion', 'competencias', 'objetivos de aprendizaje', 'resultado'];
const esNormativa = (etiqueta) => ETIQUETAS_NORMATIVAS.some((e) => F.norm(etiqueta).indexOf(e) === 0);

// Las propias etiquetas de la ficha («Materiales y recursos didácticos
// disponibles» pasa de 40 caracteres) son texto de la plantilla, no del docente.
const ETIQUETAS_DE_FICHA = new Set(F.CAMPOS.map((c) => F.norm(c.etiqueta)));
const esEtiqueta = (texto) => ETIQUETAS_DE_FICHA.has(F.norm(texto))
  || (F.norm(texto).length < 60 && /^(actividades|materiales y recursos|tipificacion)/.test(F.norm(texto)));

// Líneas docentes de un `datos` (más de 40 caracteres, para no fallar por un
// «Prueba escrita.» cualquiera): { modulo, titulo, num, campo, linea, clave }.
//
// Se leen por dos caminos. Los campos con nombre de la ficha (S.CAMPOS_DOCENTES)
// y, además, TODAS las celdas de la tabla que no sean normativas. El segundo
// existe porque el primero solo ve las etiquetas que conoce fichaDeFilas: una
// ficha con otra maquetación («Actividades de profundización»,
// «Actividades Complementarias», «Materiales y recursos disponibles») tiene
// material docente que el lector por campos no ve, y que el saneador, que usa
// las mismas etiquetas, tampoco toca. Que la comprobación sea ciega justo donde
// el saneador lo es no demostraría nada.
function lineasDocentes(datos) {
  const out = [];
  const vistas = new Set();
  const anotar = (inst, f, campo, linea) => {
    const clave = claveLinea(linea);
    if (clave.length <= LARGO_MINIMO_LINEA) return;
    const k = inst.titulo + '|' + clave;
    if (vistas.has(k)) return;
    vistas.add(k);
    out.push({ modulo: inst.titulo, titulo: f.titulo, num: f.num, campo, linea: String(linea).trim(), clave });
  };
  (datos.instancias || []).forEach((inst) => fichasDe(inst).forEach((f) => {
    const ficha = leerFicha(f);
    S.CAMPOS_DOCENTES.forEach((campo) => {
      [].concat(ficha[campo] || [], Array.isArray(f[campo]) ? f[campo] : []).forEach((linea) => anotar(inst, f, campo, linea));
    });
    // La fila 0 es la cabecera (número y título de la SA); el título se conserva.
    const filas = Array.isArray(f.filas) ? f.filas : [];
    filas.forEach((fila, i) => (fila || []).forEach((celda, j) => {
      if (i === 0 || !celda || typeof celda.text !== 'string' || esEtiqueta(celda.text)) return;
      const encima = i > 0 && filas[i - 1] && filas[i - 1][j] ? String(filas[i - 1][j].text || '') : '';
      const alLado = j > 0 && fila[j - 1] ? String(fila[j - 1].text || '') : '';
      if (esNormativa(encima) || esNormativa(alLado) || esNormativa(celda.text)) return;
      const etiqueta = encima.trim().slice(0, 40) || 'tabla';
      celda.text.split('\n').forEach((linea) => anotar(inst, f, etiqueta, linea));
    }));
  }));
  return out;
}

function idsDeSecciones(plantilla) {
  const ids = [];
  const ver = (s) => { ids.push(s.id); (s.hijos || []).forEach(ver); };
  (plantilla.secciones || []).forEach(ver);
  return ids;
}

// ¿Tiene contenido un apartado? Cualquier cadena no vacía dentro.
function tieneContenido(v) {
  let hay = false;
  cadaTexto(v, (s) => { if (s.trim()) hay = true; }, '');
  return hay;
}

// Resumen estructural de un documento, para compararlo con otro.
function resumenEstructura(plantilla, datos) {
  return {
    ids: idsDeSecciones(plantilla),
    instancias: (datos.instancias || []).map((inst) => ({
      titulo: inst.titulo,
      apartados: Object.keys(inst.valores || {}).filter((k) => tieneContenido(inst.valores[k])).length,
      fichas: fichasDe(inst).map((f) => {
        const l = leerFicha(f);
        return [l.num, l.sesiones, l.evaluacion, (l.ra || []).join(',')].join('|');
      }),
    })),
  };
}

// Lo mismo que sanear recoge del original para el guardia (personas, centro,
// localidad, comarca), para poder pasárselo también al revisar el fichero
// reimportado: ese ya no tiene los nombres reales, pero tiene que seguir libre
// de ellos.
function contextoDeRevision(datosOriginales, sustituciones) {
  const C = S.CENTRO;
  const propio = new Set([C.corto, C.localidad, C.comarca].map((x) => F.norm(x)));
  const nombres = S.nombresDe(datosOriginales).filter((n) => !S.esNombreInventado(n));
  const real = S.centroDe(datosOriginales);
  const sinPropio = (l) => l.filter((x) => !propio.has(F.norm(x)));
  return {
    centro: C,
    personas: S.agruparPersonas(nombres, new Set()),
    reales: { centros: sinPropio(real.centros), localidades: sinPropio(real.localidades), comarcas: sinPropio(real.comarcas) },
    extras: sustituciones.map((s) => s.buscar),
    sitios: sustituciones.map((s) => s.por),
  };
}

// ---------------------------------------------------------------- comprobaciones
// Cada una devuelve una lista de fallos escritos sin datos del documento.
function comprobarGuardia(datosRe, contexto) {
  return S.revisar(datosRe, contexto).map((h) => 'el guardia encuentra un dato de tipo «' + h.tipo + '» en ' + h.ruta);
}

function comprobarMaterial(originales, datosRe) {
  const trozos = [];
  cadaTexto(datosRe, (s) => trozos.push(s), '');
  const lineas = new Set();
  trozos.forEach((t) => t.split('\n').forEach((l) => lineas.add(claveLinea(l))));
  const todo = trozos.map(claveLinea).join('\n');
  const cuenta = {};
  originales.forEach((o) => {
    // Como línea entera y como trozo de texto: una línea copiada puede haber
    // quedado unida a otra dentro de una celda.
    if (lineas.has(o.clave) || todo.indexOf(o.clave) >= 0) {
      const k = o.modulo + '|' + o.campo;
      if (!cuenta[k]) cuenta[k] = { modulo: o.modulo, campo: o.campo, n: 0, inicio: o.linea.trim().slice(0, 30) };
      cuenta[k].n += 1;
    }
  });
  return Object.keys(cuenta).map((k) => {
    const c = cuenta[k];
    return 'sobreviven ' + c.n + ' línea(s) del material docente original en el módulo «' + c.modulo + '», campo «' + c.campo + '» (la primera empieza por «' + c.inicio + '»)';
  });
}

function comprobarEstructura(a, b) {
  const fallos = [];
  if (a.ids.length !== b.ids.length) fallos.push('el número de secciones cambia: ' + a.ids.length + ' -> ' + b.ids.length);
  a.ids.forEach((id, i) => { if (b.ids[i] !== id) fallos.push('la sección ' + (i + 1) + ' cambia de identificador'); });
  if (a.instancias.length !== b.instancias.length) fallos.push('el número de instancias cambia: ' + a.instancias.length + ' -> ' + b.instancias.length);
  a.instancias.forEach((x, i) => {
    const y = b.instancias[i];
    if (!y) return;
    if (x.titulo !== y.titulo) fallos.push('la instancia ' + (i + 1) + ' cambia de título');
    if (x.apartados !== y.apartados) fallos.push('la instancia ' + (i + 1) + ' tenía ' + x.apartados + ' apartados con contenido y ahora ' + y.apartados);
    if (x.fichas.length !== y.fichas.length) fallos.push('la instancia ' + (i + 1) + ' tenía ' + x.fichas.length + ' fichas de SA y ahora ' + y.fichas.length);
    else x.fichas.forEach((f, j) => { if (f !== y.fichas[j]) fallos.push('la ficha ' + (j + 1) + ' de la instancia ' + (i + 1) + ' cambia de número, sesiones, evaluación o RA'); });
  });
  return fallos;
}

function comprobarPdf(plantilla, datos) {
  try {
    const dd = buildDocDefinition({ plantilla, datos, instancias: 'todas', titulo: 'Ejemplo' });
    return dd && dd.content && dd.content.length ? [] : ['el PDF del ejemplo sale vacío'];
  } catch (e) {
    return ['no se puede construir el PDF del ejemplo: ' + e.message];
  }
}

// ---------------------------------------------------------------- principal
async function principal() {
  const original = path.resolve(process.argv[2] || ORIGINAL_POR_OMISION);
  if (!fs.existsSync(original)) {
    console.error('No se ha encontrado el documento original:\n  ' + original);
    console.error('Los documentos reales del departamento no se versionan (están en .gitignore),');
    console.error('así que solo existen en el ordenador de quien los tenga. No se ha hecho nada.');
    console.error('Si lo tienes en otra ruta: node scripts/generar-ejemplo.js "ruta/al/documento.docx"');
    process.exit(2);
  }

  console.log('1. Importando el documento original...');
  const origen = await importarDocx({ path: original }, { incluirInicial: true });

  let sustituciones = [];
  if (fs.existsSync(FICHERO_SUSTITUCIONES)) {
    sustituciones = JSON.parse(fs.readFileSync(FICHERO_SUSTITUCIONES, 'utf8'));
    console.log('2. Sustituciones locales cargadas: ' + sustituciones.length + '.');
  } else {
    console.log('2. No hay out/sustituciones.local.json; se sigue sin sustituciones a mano.');
  }

  console.log('3. Saneando...');
  const resultado = S.sanear(origen.datos, { sustituciones });
  if (!resultado.ok) {
    console.error('\nEl saneador ha encontrado datos que no sabe quitar. No se escribe nada.');
    resultado.hallazgos.forEach((h) => console.error('  - ' + h.tipo + ' en ' + h.ruta + ': «' + h.contexto + '»'));
    console.error('\nLo que no tiene forma reconocible (una empresa o un nombre citados de pasada)');
    console.error('se arregla añadiéndolo a out/sustituciones.local.json, con la forma');
    console.error('[{ "buscar": "texto real", "por": "texto inventado" }]. Ese fichero no se versiona.');
    process.exit(1);
  }

  const contexto = contextoDeRevision(origen.datos, sustituciones);
  const materialOriginal = lineasDocentes(origen.datos);
  const estructuraOriginal = resumenEstructura(origen.plantilla, origen.datos);

  const base = path.basename(original, '.docx').replace(/_\d{6}$/, '') + '-ejemplo.docx';
  const destino = path.join(CARPETA_EJEMPLO, base);
  console.log('4. Escribiendo el .docx saneado en docs/entrada_ej/ejemplo/' + base + '...');
  // Si el documento trae contenido propio antes del primer título (los PCCF),
  // ese contenido ya es la portada: añadir además un título artificial dejaría
  // un bloque suelto delante y el ida y vuelta crearía una sección de más.
  const tituloDoc = resultado.datos.documento && resultado.datos.documento['contenido-inicial']
    ? null : 'Programación didáctica (ejemplo)';
  await escribirDocx(destino, { plantilla: origen.plantilla, datos: resultado.datos, titulo: tituloDoc, instancias: 'todas' });

  console.log('5. Volviendo a leer el fichero escrito...');
  const re = await importarDocx({ path: destino }, { incluirInicial: true });
  fs.mkdirSync(CARPETA_SALIDA, { recursive: true });
  const rPlantilla = path.join(CARPETA_SALIDA, 'plantilla.json');
  const rDatos = path.join(CARPETA_SALIDA, 'datos.json');
  fs.writeFileSync(rPlantilla, JSON.stringify(re.plantilla, null, 2));
  fs.writeFileSync(rDatos, JSON.stringify(re.datos, null, 2));

  console.log('6. Comprobando el resultado sobre el fichero reimportado...');
  const pruebas = [
    ['el guardia no encuentra datos reales', comprobarGuardia(re.datos, contexto)],
    ['no sobrevive material docente original', comprobarMaterial(materialOriginal, re.datos)],
    ['la estructura no se ha movido', comprobarEstructura(estructuraOriginal, resumenEstructura(re.plantilla, re.datos))],
    ['el PDF del ejemplo se construye', comprobarPdf(re.plantilla, re.datos)],
  ];
  let fallos = 0;
  pruebas.forEach(([nombre, f]) => {
    console.log('   ' + (f.length ? 'FALLA  ' : 'bien   ') + nombre);
    f.forEach((m) => console.log('        - ' + m));
    fallos += f.length;
  });
  if (fallos) {
    fs.unlinkSync(destino);
    console.error('\nAlguna comprobación ha fallado: se ha borrado el .docx generado. No se publica un ejemplo sucio.');
    console.error('Si es un dato sin forma reconocible, añádelo a out/sustituciones.local.json y repite.');
    process.exit(1);
  }

  const i = resultado.informe;
  console.log('\nInforme');
  console.log('  Apartados (secciones): ' + estructuraOriginal.ids.length);
  console.log('  Instancias (módulos): ' + estructuraOriginal.instancias.length);
  console.log('  Personas sustituidas: ' + i.personas + ' (' + i.variantesDeNombre + ' formas de escribir sus nombres)');
  console.log('  Fichas de SA con contenido inventado: ' + i.fichas);
  console.log('  Apartados reescritos: ' + i.apartadosReescritos);
  console.log('  Empresas: ' + i.empresas + ', pueblos: ' + i.pueblos + ', correos: ' + i.correos + ', teléfonos: ' + i.telefonos + ', CIF/NIF: ' + i.documentos);
  console.log('  Tamaño: .docx ' + kb(destino) + ', plantilla.json ' + kb(rPlantilla) + ', datos.json ' + kb(rDatos));
  const avisos = (re.informe && re.informe.avisos) || [];
  console.log('  Avisos del reimportado: ' + (avisos.length ? '' : 'ninguno'));
  avisos.forEach((a) => console.log('    - ' + a));
  console.log('\nListo: ' + path.relative(RAIZ_REPO, destino));
}

// Se exportan las piezas para el auxiliar local de out/, que propone las
// sustituciones a mano a partir de la misma lectura del material docente.
module.exports = { lineasDocentes, claveLinea, cadaTexto, FICHERO_SUSTITUCIONES };

if (require.main === module) {
  principal().catch((e) => {
    console.error('Error inesperado: ' + e.message);
    process.exit(1);
  });
}
