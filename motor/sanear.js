// Saneador de contenido: convierte el documento real del departamento en un
// ejemplo que se pueda publicar.
//
//     const { ok, datos, hallazgos, informe } = sanear(datosImportados);
//
// Entra el `datos` que produce motor/importar-docx.js y sale otro con la misma
// estructura y el mismo tamaño: mismas secciones, mismos módulos, mismas tablas
// con las mismas filas y las mismas fichas de SA. Cambia lo que identifica y lo
// que escribió el profesorado:
//
//   - nombres de persona, correos, teléfonos, CIF/NIF, empresas y pueblos de
//     empresa, y el centro con su localidad y su comarca, por datos inventados;
// En las fichas se limpia POR EXCLUSIÓN: se conserva lo que el vocabulario de su
// etiqueta delata como normativo y se reescribe todo lo demás, reconocido o no.
// Al revés —una lista de campos conocidos— falla en silencio en cuanto un módulo
// escribe su ficha con otras etiquetas, y lo que falla en silencio aquí acaba
// publicado en un repositorio público.
//
//   - en las fichas de situación de aprendizaje, las actividades y los
//     materiales (lo que es del profesorado); se conserva el texto normativo
//     (RA, criterios, competencias, objetivos), que sale del real decreto;
//   - tres apartados con valoraciones internas, por texto inventado del mismo
//     tamaño (REESCRIBIR).
//
// NO HAY LISTA DE NOMBRES REALES. Este fichero se publica, así que ni uno solo
// de los datos que quita puede estar escrito aquí. Todo se recoge del propio
// documento por su forma: las personas, de los pares «Titular: Nombre Apellido»
// (en tablas, en propiedades y en medio de un párrafo); el centro, de «IES X de
// Y»; la comarca, de «comarca del Z». Lo que no tenga forma reconocible (una
// empresa citada de pasada en un párrafo, sin forma jurídica) se pasa a mano con
// `opciones.sustituciones`.
//
// EL GUARDIA (`revisar`) es más estricto que los sustituidores a propósito: mira
// el resultado por estructura, no por lista, y `sanear` no devuelve datos si
// encuentra algo. La lista de nombres recogidos puede quedarse corta —ya pasó
// una vez en este repo—, la forma «etiqueta de persona: Nombre Apellido» no.
//
// Es determinista: nada usa Math.random; todo se siembra con un hash del
// módulo y del título, como docs/mockup-v2/js/contenido.js.

'use strict';

const F = require('./ficha-sa');

// ---------------------------------------------------------------- constantes
// El centro inventado. Se sustituye por estos valores donde el documento diga
// «IES X», «de la localidad» o «comarca del Z», y el guardia exige que sean los
// únicos que queden. Se puede cambiar con `opciones.centro`.
const CENTRO = {
  nombre: 'IES Vega Alta',
  corto: 'Vega Alta',
  localidad: 'Villalba del Río',
  comarca: 'Alto Cañizar',
  dominio: 'iesvegaalta.example',
};

// Apartados que se reescriben enteros con texto inventado del mismo tamaño y la
// misma estructura (mismos bloques, mismas viñetas, mismas filas). El valor es
// el tema del que se saca el texto. Son los que traen valoraciones internas, no
// prosa pedagógica general:
//
//   - la contextualización describe el centro y su pueblo con tanto detalle
//     (año de inauguración, aforo, enseñanzas, habitantes) que no hay
//     sustitución de nombres que valga;
//   - la evaluación inicial de los grupos habla de alumnado concreto: perfiles,
//     necesidades educativas y quién es el tutor;
//   - las propuestas de mejora recogen cómo fue el curso anterior.
//
// Los demás apartados (metodología, criterios de calificación, instrumentos,
// recuperación…) son prosa pedagógica general y se dejan como están. Las claves
// casan por prefijo a la misma profundidad, porque el importador recorta los
// identificadores largos.
const REESCRIBIR = {
  'introduccion/contextualizacion-de-la-docencia': 'centro',
  'atencion-a-la-diversidad-y-educacion-inclusiva/evaluacion-inicial-de-los-grupos': 'grupo',
  'modulos/propuestas-de-mejora-del-curso-anterior': 'mejora',

  // Memorias de final de curso. Todo lo que sigue valora a personas o describe
  // grupos concretos: la plantilla del departamento (nombre, iniciales, cuerpo y
  // localidad de cada docente), el reparto de carga horaria, las estadísticas y
  // necesidades específicas de cada grupo, las valoraciones internas de la
  // docencia y las dificultades del curso. Se reescribe el apartado entero, con
  // sus subapartados, y se conservan las etiquetas y la forma de las tablas.
  'profesorado-del-departamento/profesores-del-departamento': 'grupo',
  'profesorado-del-departamento/carga-lectiva-de-los-profesores': 'grupo',
  'profesorado-del-departamento/observaciones-sobre-la-carga-horaria': 'grupo',
  'docencia-en-eso-y-bachillerato/grupos-de-alumnos-y-estadisticas-de-eso-y-bachille': 'grupo',
  'docencia-en-eso-y-bachillerato/evolucion-historica-de-las-estadisticas': 'grupo',
  'docencia-en-eso-y-bachillerato/alumnado-con-necesidades-especificas-de-apoyo-educ': 'grupo',
  'docencia-en-eso-y-bachillerato/valoracion-de-la-docencia': 'grupo',
  'docencia-en-eso-y-bachillerato/dificultades-encontradas': 'grupo',
  'docencia-en-ciclos-formativos/grupos-de-alumnos-y-estadisticas-de-los-grupos': 'grupo',
  'docencia-en-ciclos-formativos/alumnado-con-necesidades-especificas-de-apoyo-educ': 'grupo',
  'docencia-en-ciclos-formativos/valoracion-de-la-docencia': 'grupo',
  'docencia-en-ciclos-formativos/dificultades-encontradas': 'grupo',
  'docencia-en-ciclos-formativos/formacion-en-centros-de-trabajo-general-fe-g': 'grupo',
  'docencia-en-ciclos-formativos/formacion-en-empresa-intensiva-fe-intensiva': 'grupo',
  'docencia-en-ciclos-formativos/cuestionario-sobre-la-valoracion-e-insercion-de-la': 'grupo',
  'mejora-de-la-practica-docente/seguimiento-de-los-objetivos-de-mejora-para-este-c': 'mejora',
  'mejora-de-la-practica-docente/evaluacion-de-la-practica-docente': 'mejora',
  'mejora-de-la-practica-docente/reuniones-de-departamento-realizadas': 'mejora',
};

// Los campos de la ficha de SA que sabe inventar el generador. OJO: esta lista
// NO decide qué se limpia. Lo que se limpia se decide por exclusión, ver
// `sanearFicha`: una lista de campos conocidos deja pasar lo que no reconoce, y
// aquí lo que pasa sin que nadie lo mire se publica.
const CAMPOS_DOCENTES = ['introduccion', 'no_evaluables', 'evaluables', 'refuerzo', 'ampliacion', 'recuperacion', 'recursos'];

// Qué etiquetas de una fila de la ficha anuncian texto normativo. Sale del real
// decreto del título, no es de nadie, y conservarlo es lo que distingue un
// documento de ejemplo de un documento falso: con los criterios inventados, un
// profesor nuevo leería criterios que no existen.
//
// Se reconoce por vocabulario y no por la etiqueta exacta porque los módulos no
// la escriben igual: hay uno que pone «Competencias personales y sociales.
// Aprendizaje a lo largo de la vida» donde los demás ponen «Competencias
// profesionales para la empleabilidad».
const ETIQUETA_NORMATIVA = /\b(resultados?|criterios?|competencias?|objetivos?|saberes|contenidos?)\b/;

// Y a qué campo del generador se parece una etiqueta que no está en
// `CAMPOS_DOCENTES`, para poder inventar su contenido igual. Las hay por los dos
// motivos: etiquetas que `F.CAMPOS` no tiene, y campos de la ficha que sí están
// en `F.CAMPOS` pero para los que el generador no tiene plantillas propias
// («Actividades de proyecto intermodular», «Actividades Complementarias»).
//
// El orden importa: «no evaluables» antes que «evaluables», y «recuperación»
// antes que cualquier regla con «evaluaci». Lo que no se parezca a nada se trata
// como actividad evaluable, que es la forma más común de material docente.
const PARECIDOS = [
  [/material|recurso|bibliograf|equipamiento/, 'recursos'],
  [/introducci|inicial|diagnost|motivaci/, 'introduccion'],
  [/no evaluable/, 'no_evaluables'],
  [/recuperaci/, 'recuperacion'],
  [/refuerzo|apoyo/, 'refuerzo'],
  [/ampliaci|profundiz|enriquec/, 'ampliacion'],
  [/complementaria|extraescolar|intermodular|proyecto|visita|charla/, 'no_evaluables'],
  [/evaluable|evaluaci|calificaci|instrumento/, 'evaluables'],
];
const campoParecido = (etiqueta) => {
  const t = F.norm(etiqueta);
  const p = PARECIDOS.filter(([re]) => re.test(t))[0];
  return p ? p[1] : 'evaluables';
};

// Apartados del módulo que son material del profesorado y se reescriben con el
// generador temático de las fichas, no con el pozo de frases: su contenido es de
// la misma clase (herramientas, materiales y actividades).
//
// «Recursos específicos» está aquí porque en el documento real es una copia de
// los materiales de las fichas: reescribir las fichas y dejar este apartado
// publicaba por la puerta de atrás lo mismo que se acababa de cambiar.
const APARTADOS_DOCENTES = {
  'modulos/metodologia-especifica/recursos-especificos': 'recursos',
};

// Personas inventadas: nombre + dos apellidos, combinados para tener 144 sin
// repetir. Se asignan por orden de aparición, así que la salida es estable.
const NOMBRES = ['Marta', 'Álvaro', 'Noelia', 'Rubén', 'Sonia', 'Dídac', 'Irene', 'Tomás', 'Elena', 'Gaspar', 'Laia', 'Bruno'];
const APELLIDOS = ['Olmos', 'Quintana', 'Roselló', 'Vilches', 'Tormo', 'Alcaide', 'Navarrete', 'Escrivá', 'Peñalver', 'Cantó', 'Lorca', 'Marhuenda'];

// Empresas, pueblos y sectores inventados.
const EMPRESA_PREFIJOS = ['Aldea', 'Brisa', 'Cumbre', 'Delta', 'Estela', 'Faro', 'Gárgola', 'Horizonte', 'Isla', 'Junco', 'Kappa', 'Lince'];
const EMPRESA_RAMOS = ['Digital', 'Soluciones', 'Sistemas', 'Software', 'Redes', 'Servicios Informáticos', 'Telemática', 'Datos'];
const PUEBLOS = ['Valdemira', 'Torrebaja', 'Castelar del Pino', 'Rioseco de Abajo', 'Monteclaro', 'Almendral', 'Fuentenueva', 'Sotoalto', 'Peñarrubia', 'La Ribera Chica', 'Corralejo Verde', 'Alcázar de Vega'];
const SECTORES = ['Desarrollo de software', 'Servicios informáticos', 'Comercio electrónico', 'Consultoría tecnológica', 'Telecomunicaciones', 'Industria 4.0', 'Administración electrónica', 'Marketing digital'];

// Palabras que, tras una etiqueta de persona, indican que el valor es un cargo
// o un órgano y no un nombre («Responsable: Departamento de Informática»).
const NO_ES_NOMBRE = ['departamento', 'jefatura', 'equipo', 'docente', 'profesorado', 'orientacion', 'centro', 'modulo', 'curso', 'alumnado', 'tutoria', 'comision', 'direccion', 'coordinacion', 'claustro', 'ciclo', 'instituto', 'consejeria', 'conselleria', 'pendiente', 'asignar', 'determinar', 'estudios', 'secretaria'];

// ---------------------------------------------------------------- utilidades
const hash = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
};

// Generador pseudoaleatorio con semilla (mulberry32): mismo hash, misma serie.
const generador = (semilla) => {
  let a = hash(String(semilla)) || 1;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const elegir = (arr, rng) => arr[Math.floor(rng() * arr.length)];
const barajar = (arr, rng) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const pad = (n, k) => String(n).padStart(k, '0');
const copia = (x) => JSON.parse(JSON.stringify(x));
const plano = (t) => (Array.isArray(t)
  ? t.map((r) => (r && typeof r === 'object' ? (r.text || '') : r)).join('')
  : String(t == null ? '' : t));

// Clave de comparación de un texto cualquiera: sin acentos, minúsculas y sin
// signos.
const claveTexto = (s) => F.norm(s).replace(/[^\p{L}\d ]/gu, '').replace(/\s+/g, ' ').trim();

// Un patrón que casa con las variantes de acentuación y mayúsculas de una
// cadena, con límites de palabra. Sirve para buscar un dato recogido del
// documento sin escribirlo aquí.
const CLASES = { a: '[aáàäâ]', e: '[eéèëê]', i: '[iíìïî]', o: '[oóòöô]', u: '[uúùüû]', n: '[nñ]', c: '[cç]' };
const patronAcento = (s) => F.norm(s).split('').map((ch) => {
  if (CLASES[ch]) return CLASES[ch];
  if (ch === ' ') return '\\s+';
  return ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}).join('');
const conLimites = (src) => '(?<![\\p{L}\\d])(?:' + src + ')(?![\\p{L}\\d])';

// ---------------------------------------------------------------- personas
// Palabra con mayúscula inicial (también en versalitas) y nombre de 2 a 6
// palabras con partículas entre medias.
const PAL = "\\p{Lu}[\\p{L}'’-]+";
const CON = '(?:de|del|de\\s+la|de\\s+los|de\\s+las|DE|DEL|y|i)';
const NOM = PAL + '(?:\\s+(?:' + CON + '\\s+)?' + PAL + '){1,5}';
const NOM_COMA = NOM + '(?:\\s*,\\s*' + PAL + '(?:\\s+' + PAL + '){0,2})?';
const CANDIDATO = new RegExp(NOM_COMA, 'gu');
const CANDIDATO_AL_INICIO = new RegExp(NOM_COMA, 'uy');

// Etiqueta de un campo que lleva una persona: «Titular», «Profesor/a»,
// «Tutor del primer curso», «Jefe/a de departamento», «Fdo.»…
const ETIQUETA_PERSONA = /^(?:titular|profesor|profesora|profesorado|docente|tutor|tutora|coordinador|coordinadora|jefe|jefa|director|directora|responsable|fdo)\b/;
const esEtiquetaPersona = (e) => {
  const t = F.norm(e).replace(/[:.\s]+$/, '');
  return t.length > 0 && t.length <= 40 && ETIQUETA_PERSONA.test(t);
};

// Cabecera de una COLUMNA de personas («Nombre», «Profesor», «Titular»): las
// memorias ponen los nombres uno debajo de otro, no como «Etiqueta: valor», y
// sin esta regla no se recogían ni se sustituían.
const ETIQUETA_COLUMNA_PERSONA = /^(?:nombre(?:s)?|apellidos?|profesor|profesora|profesorado|docente|titular|tutor|tutora|coordinador|coordinadora|jefe|jefa|director|directora|responsable|iniciales)$/;
const esColumnaPersona = (e) => ETIQUETA_COLUMNA_PERSONA.test(F.norm(e).replace(/[:.\s]+$/, ''));

// «Nombre» a secas lo usa cualquier tabla. Solo anuncia personas si la fila
// trae además una columna propia de personas (iniciales, apellidos, cargo,
// observaciones…) o si la tabla cuelga de un apartado de profesorado. Sin esto,
// una tabla «Nombre | Descripción» de metodologías se tomaba por una plantilla
// de docentes y el guardia denunciaba «Aprendizaje basado en proyectos» como si
// fuera un nombre.
const COLUMNA_QUE_ACOMPANA_A_PERSONA = /^(?:iniciales|apellidos?|cargo|cuerpo|puesto|observaciones|titular|profesor(?:a|ado)?|docente|tutor(?:a)?|coordinador(?:a)?|jefe|jefa|director(?:a)?|responsable|correo(?: electronico)?|telefono|localidad|departamento)$/;
function esColumnaDePersona(fila, j, contexto) {
  if (!Array.isArray(fila) || !fila[j] || !esColumnaPersona(fila[j].text)) return false;
  const n = F.norm(fila[j].text).replace(/[:.\s]+$/, '');
  if (n !== 'nombre' && n !== 'nombres') return true;
  const acompanante = fila.some((c, k) => k !== j && c
    && COLUMNA_QUE_ACOMPANA_A_PERSONA.test(F.norm(c.text).replace(/[:.]+$/, '')));
  return acompanante || /profesor|docente|tutor|personal|plantilla|cargo/.test(F.norm(contexto || ''));
}

// Una tabla de empresas también puede llamar «Nombre» a su columna, y entonces
// «Nombre» no anuncia una persona. Se distingue porque trae CIF y Sector.
function esCabeceraDeEmpresas(fila) {
  if (!Array.isArray(fila)) return false;
  const et = fila.map((c) => F.norm(c && c.text).replace(/[:.]+$/, ''));
  const empresa = et.some((t) => COLUMNAS.empresa.test(t));
  const cif = et.some((t) => COLUMNAS.documento.test(t));
  const sector = et.some((t) => COLUMNAS.sector.test(t));
  return empresa || (et.indexOf('nombre') >= 0 && cif && sector);
}

// Las columnas de una tabla de personas que delatan aunque el nombre ya esté
// cambiado: las iniciales y la localidad de residencia. Las memorias escriben la
// localidad entre paréntesis detrás de la situación administrativa, en una
// columna que se llama «Cuerpo, situación y localidad».
const COLUMNA_LOCALIDAD = /localidad|poblacion|municipio|pueblo/;
const RE_ENTRE_PARENTESIS = /\(([^()]{2,60})\)/g;
function columnasDePersona(fila, contexto) {
  const cols = {};
  if (!Array.isArray(fila)) return cols;
  fila.forEach((c, j) => {
    if (!c) return;
    const n = F.norm(c.text).replace(/[:.\s]+$/, '');
    if (/^iniciales$/.test(n)) { if (cols.iniciales === undefined) cols.iniciales = j; return; }
    if (COLUMNA_LOCALIDAD.test(n) && cols.localidad === undefined) cols.localidad = j;
    if (cols.nombre === undefined && esColumnaDePersona(fila, j, contexto)) cols.nombre = j;
  });
  return cols;
}

// Iniciales de un nombre inventado, con el mismo número de letras que tenían las
// del original.
const inicialesDe = (nombre, largo) => {
  const letras = String(nombre).split(/\s+/).filter(Boolean).map((p) => p.charAt(0)).join('').toUpperCase();
  return letras.slice(0, Math.max(1, Math.min(largo || 3, letras.length)));
};

// Tablas de procedencia del alumnado («Provincia | Localidad | Alumnos»). No son
// de empresas ni llevan nombres, pero dicen de qué pueblos viene cada grupo.
const COLUMNA_PROCEDENCIA = /^(?:provincia|localidad|pueblo|municipio)$/;
const COLUMNA_RECUENTO = /^(?:alumnos?|alumnado|total|numero|nº)$/;
function esTablaDeProcedencia(filas) {
  if (!Array.isArray(filas) || !filas.length || !Array.isArray(filas[0])) return false;
  const cab = filas[0].map((c) => F.norm(c && c.text).replace(/[:.]+$/, ''));
  return cab.some((t) => COLUMNA_PROCEDENCIA.test(t)) && cab.some((t) => COLUMNA_RECUENTO.test(t));
}
const esRecuento = (t) => /^[\d\s.,%]+$/.test(t);
// Un pueblo escrito en una celda: pocas palabras, todas con mayúscula (o una
// partícula) y sin puntuación de frase. Sirve para no tomar por pueblo el texto
// con el que se reescribe una tabla entera.
const pareceLugar = (t) => {
  const s = String(t == null ? '' : t).trim();
  if (!s || s.length > 40 || /[.;:!?]/.test(s)) return false;
  const palabras = s.split(/\s+/);
  return palabras.length <= 4
    && palabras.every((w) => /^\p{Lu}/u.test(w) || /^(?:de|del|la|las|los|y|e)$/i.test(w));
};

// La misma etiqueta dentro de un párrafo: «Tutor del primer curso: Nombre
// Apellido». Se busca la etiqueta con el indicador `i` y el nombre se lee
// aparte, sin él, porque con `i` \p{Lu} aceptaría minúsculas.
const ETIQUETA_EN_TEXTO = /\b(?:titular|profesor(?:a|ado)?|docente|tutor(?:a)?|coordinador(?:a)?|jef[ea]|director(?:a)?|responsable|fdo)\b\.?[^:\n.]{0,50}?:[ \t]*/giu;

const CONECTORES = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'i', 'e']);
// Una palabra de un nombre, normalizada para que «Ferrandis» y «Ferrandiz», o
// «Beltrán» y «Beltràn», se parezcan: sin acentos, z y ç como s, v como b, sin h.
const raizNombre = (t) => F.norm(t).replace(/[zç]/g, 's').replace(/v/g, 'b').replace(/h/g, '').replace(/[^a-zñ]/g, '');
const tokensDe = (nombre) => (String(nombre).match(/[\p{L}'’-]+/gu) || [])
  .map(raizNombre).filter((t) => t && !CONECTORES.has(t));

const distancia1 = (a, b) => {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  return a.length < b.length ? a.slice(i) === b.slice(i + 1) : a.slice(i + 1) === b.slice(i);
};
// Dos palabras son la misma si son iguales o, siendo largas, difieren en una
// letra: «Tamarit» y «Tamarid».
const parecida = (a, b) => a === b || (a.length >= 5 && b.length >= 5 && distancia1(a, b));

// ¿Están todas las palabras de `a` en `b`, una a una?
const contenido = (a, b) => {
  if (a.length < 2) return false;
  const libres = b.slice();
  return a.every((t) => {
    const k = libres.findIndex((u) => parecida(t, u));
    if (k < 0) return false;
    libres.splice(k, 1);
    return true;
  });
};
// Para agrupar variantes de escritura: una es parte de la otra, en cualquier
// orden. «Nombre Apellido» y «Nombre Apellido Segundo» son la misma persona;
// dos con el mismo nombre de pila y apellidos distintos no.
const mismaPersona = (a, b) => contenido(a, b) || contenido(b, a);

const valorDeNombre = (valor) => {
  const t = String(valor == null ? '' : valor).trim();
  CANDIDATO_AL_INICIO.lastIndex = 0;
  const m = CANDIDATO_AL_INICIO.exec(t);
  if (!m) return null;
  const tokens = tokensDe(m[0]);
  if (tokens.length < 2 || tokens.some((x) => NO_ES_NOMBRE.indexOf(x) >= 0)) return null;
  return m[0].trim();
};

// Persona inventada número i.
const inventada = (i) => {
  if (i >= NOMBRES.length * APELLIDOS.length) throw new Error('no hay tantas personas inventadas como en el documento');
  const a = Math.floor(i / NOMBRES.length) % APELLIDOS.length;
  const b = (a + 1 + (i % (APELLIDOS.length - 1))) % APELLIDOS.length;
  return NOMBRES[i % NOMBRES.length] + ' ' + APELLIDOS[a] + ' ' + APELLIDOS[b];
};
const NOMBRES_INVENTADOS = new Set();
for (let i = 0; i < NOMBRES.length * APELLIDOS.length; i += 1) NOMBRES_INVENTADOS.add(claveTexto(inventada(i)));
const esNombreInventado = (n) => NOMBRES_INVENTADOS.has(claveTexto(n));

// ---------------------------------------------------------------- recorridos
// fn(texto, ruta) para cada cadena del árbol. Las claves que son identificadores
// del propio formato no se miran.
const CLAVES_DE_FORMATO = new Set(['type', 'ref', 'seccion', 'responsable', 'modo', 'comun', 'id']);
function cadaCadena(x, fn, ruta, clave) {
  if (typeof x === 'string') { if (!CLAVES_DE_FORMATO.has(clave)) fn(x, ruta); return; }
  if (Array.isArray(x)) { x.forEach((y, i) => cadaCadena(y, fn, ruta + '[' + i + ']', clave)); return; }
  if (x && typeof x === 'object') Object.keys(x).forEach((k) => cadaCadena(x[k], fn, ruta + '.' + k, k));
}

// Igual, pero reasignando: fn devuelve la cadena nueva.
function cambiarCadenas(x, fn, clave) {
  if (typeof x === 'string') return CLAVES_DE_FORMATO.has(clave) ? x : fn(x);
  if (Array.isArray(x)) { for (let i = 0; i < x.length; i += 1) x[i] = cambiarCadenas(x[i], fn, clave); return x; }
  if (x && typeof x === 'object') { Object.keys(x).forEach((k) => { x[k] = cambiarCadenas(x[k], fn, k); }); return x; }
  return x;
}

function cadaObjeto(x, fn, ruta) {
  if (Array.isArray(x)) { x.forEach((y, i) => cadaObjeto(y, fn, ruta + '[' + i + ']')); return; }
  if (x && typeof x === 'object') {
    fn(x, ruta);
    Object.keys(x).forEach((k) => cadaObjeto(x[k], fn, ruta + '.' + k));
  }
}

// Todo valor que cuelga de una etiqueta de persona, esté donde esté: en un par
// etiqueta/valor, en dos celdas contiguas de una fila, en una propiedad que se
// llama como la etiqueta (`titular`, `docentes`) o en medio de un párrafo tras
// «Etiqueta:». fn(valor, ruta). La recogida de nombres y el guardia usan este
// mismo recorrido para mirar exactamente lo mismo.
function cadaEtiquetado(datos, fn) {
  cadaObjeto(datos, (o, ruta) => {
    if (Array.isArray(o.pares)) o.pares.forEach((p) => { if (p && esEtiquetaPersona(p.etiqueta)) fn(p.valor, ruta + '.pares'); });
    if (Array.isArray(o.filas)) {
      o.filas.forEach((fila) => {
        for (let j = 0; Array.isArray(fila) && j < fila.length - 1; j += 1) {
          if (fila[j] && fila[j + 1] && esEtiquetaPersona(fila[j].text)) fn(fila[j + 1].text, ruta + '.filas');
        }
      });
      // Y los nombres que van en una columna bajo «Nombre» o «Profesor».
      const cab = o.filas.findIndex((fila) => Array.isArray(fila) && fila.some((c, j) => esColumnaDePersona(fila, j, ruta)));
      if (cab >= 0) {
        const empresas = esCabeceraDeEmpresas(o.filas[cab]);
        o.filas[cab].forEach((c, j) => {
          if (!c || !esColumnaDePersona(o.filas[cab], j, ruta)) return;
          // En una tabla «CIF | Nombre | Localidad | Sector», «Nombre» es la
          // empresa: su nombre y su localidad ya los cambia la regla de empresas.
          if (empresas && !/(?:profesor|titular|tutor|coordinador|jefe|director|responsable|docente)/.test(F.norm(c.text))) return;
          for (let i = cab + 1; i < o.filas.length; i += 1) {
            const fila = o.filas[i];
            if (!Array.isArray(fila) || !fila[j]) continue;
            // La celda puede empezar por un guion de lista («- Nombre»). Se
            // recoge solo el nombre para poder sustituirlo sin llevarse el guion.
            const limpio = String(fila[j].text == null ? '' : fila[j].text).replace(/^[\s\-–—•*·]+/, '');
            if (limpio) fn(limpio, ruta + '.filas');
          }
        });
      }
    }
    if (Array.isArray(o.docentes)) {
      o.docentes.forEach((d) => fn(d && typeof d === 'object' ? (d.nombre || d.name) : d, ruta + '.docentes'));
    }
    Object.keys(o).forEach((k) => { if (typeof o[k] === 'string' && esEtiquetaPersona(k)) fn(o[k], ruta + '.' + k); });
  }, '');
  cadaCadena(datos, (s, ruta) => {
    if (s.length < 6 || s.indexOf(':') < 0) return;
    for (const m of s.matchAll(ETIQUETA_EN_TEXTO)) {
      CANDIDATO_AL_INICIO.lastIndex = m.index + m[0].length;
      const n = CANDIDATO_AL_INICIO.exec(s);
      if (n) fn(n[0], ruta);
    }
  }, '');
}

// Los nombres de persona del documento, sin repetir, por orden de aparición.
function nombresDe(datos) {
  const vistos = new Set();
  const out = [];
  const alta = (n) => { if (n && !vistos.has(n)) { vistos.add(n); out.push(n); } };
  cadaEtiquetado(datos, (valor) => alta(valorDeNombre(valor)));
  // La lista de profesorado de un PCCF o de una propuesta va a veces en párrafos
  // sueltos, no en una tabla ni detrás de una etiqueta. Ahí también hay nombres.
  cadaObjeto(datos, (o) => {
    if (Array.isArray(o.texto)) nombresEnBloques(o.texto).forEach(alta);
  }, '');
  return out;
}

// Bajo un encabezado de personas, un párrafo que empieza por «Nombre Apellido
// Apellido» —solo, seguido de «:» con la carga docente, o de un paréntesis con
// el curso— es una persona. La lista de profesorado de un PCCF se escribe así y
// sin esto viajaba entera al ejemplo, porque no hay ninguna tabla que la delate.
const ENCABEZADO_DE_PERSONAS = /\b(?:profesor(?:ado|a|as|es)?|docentes?|tutor(?:a|as|es)?|personal|equipo|plantilla|claustro)\b/;
const PALABRA_DE_NOMBRE = /^[\p{Lu}][\p{L}'’-]+$/u;
const PARTICULA_DE_NOMBRE = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e', 'i']);
const QUITA_VINETA = /^\s*(?:[−–—•*·-]|\d+[.)])\s*/;

// La cabecera se mira antes de los dos puntos: «Elvira Mas Pastor: tutora de…»
// no es una cabecera por llevar «tutora» en la descripción.
function esEncabezadoDePersonas(texto) {
  const s = String(texto == null ? '' : texto).trim();
  if (!s || s.length > 80) return false;
  return ENCABEZADO_DE_PERSONAS.test(F.norm(s.split(/[:()]/)[0]));
}

function nombreEnProsa(texto) {
  const s = String(texto == null ? '' : texto).trim().replace(QUITA_VINETA, '');
  if (!s) return null;
  const corte = s.search(/[:()]/);
  const seg = (corte >= 0 ? s.slice(0, corte) : s).trim();
  if (seg.length > 60) return null;
  const palabras = seg.split(/\s+/).filter(Boolean);
  if (palabras.length < 3 || palabras.length > 4) return null;
  if (palabras.filter((p) => PALABRA_DE_NOMBRE.test(p)).length < 2) return null;
  if (!palabras.every((p) => PALABRA_DE_NOMBRE.test(p) || PARTICULA_DE_NOMBRE.has(F.norm(p)))) return null;
  const n = F.norm(seg);
  if (NO_ES_NOMBRE.some((x) => n.indexOf(x) >= 0)) return null;
  return seg;
}

// Recorre los bloques y sus elementos en orden. Un encabezado de personas
// («Profesorado», «Equipo docente responsable») abre el contexto, que sigue
// mientras lo que venga después siga teniendo forma de nombre.
function nombresEnBloques(bloques) {
  const out = [];
  let bajoPersonas = false;
  bloques.forEach((b) => {
    if (!b || typeof b !== 'object') return;
    const textos = [];
    if (typeof b.text === 'string') textos.push(b.text);
    if (Array.isArray(b.items)) b.items.forEach((x) => textos.push(typeof x === 'string' ? x : x && x.text));
    textos.forEach((t) => {
      if (typeof t !== 'string' || !t.trim()) return;      // un hueco no cierra la lista
      if (esEncabezadoDePersonas(t)) { bajoPersonas = true; return; }
      if (!bajoPersonas) return;
      const n = nombreEnProsa(t);
      if (n) out.push(n);
      else bajoPersonas = false;
    });
  });
  return out;
}

// Las variantes de escritura de una misma persona se agrupan (unión de
// conjuntos): a cada grupo le toca una persona inventada.
//
// `ocupadas` son los nombres inventados que ya estaban en el documento (si se
// sanea algo ya saneado): no se vuelven a repartir.
function agruparPersonas(nombres, ocupadas) {
  const usadas = ocupadas || new Set();
  let siguiente = 0;
  const libre = () => {
    while (usadas.has(claveTexto(inventada(siguiente)))) siguiente += 1;
    return inventada(siguiente++);
  };
  const tokens = nombres.map(tokensDe);
  const padre = nombres.map((_, i) => i);
  const raiz = (i) => { while (padre[i] !== i) { padre[i] = padre[padre[i]]; i = padre[i]; } return i; };
  for (let i = 0; i < nombres.length; i += 1) {
    for (let j = i + 1; j < nombres.length; j += 1) {
      if (mismaPersona(tokens[i], tokens[j])) padre[raiz(j)] = raiz(i);
    }
  }
  const grupos = new Map();
  nombres.forEach((n, i) => {
    const r = raiz(i);
    if (!grupos.has(r)) grupos.set(r, { variantes: [], tokens: [] });
    grupos.get(r).variantes.push(n);
    grupos.get(r).tokens.push(tokens[i]);
  });
  return [...grupos.values()].map((g) => Object.assign(g, { inventado: libre() }));
}

// Busca en un texto cualquier trozo que sea una variante de alguna persona y
// llama a fn(inicio, fin, persona). Recorre cada secuencia de palabras con
// mayúscula y prueba ventanas de la más larga a la más corta, para que «Tutor
// Nombre Apellido» sustituya solo el nombre. Una ventana vale si todas sus
// palabras están en alguna variante: nombre a medias, apellidos solos, orden
// cambiado.
function cadaMencion(texto, personas, fn) {
  if (!personas.length) return;
  for (const cand of texto.matchAll(CANDIDATO)) {
    const palabras = [...cand[0].matchAll(/[^\s,]+/g)];
    let i = 0;
    while (i < palabras.length) {
      let hecho = false;
      for (let n = Math.min(palabras.length - i, 7); n >= 2 && !hecho; n -= 1) {
        const tk = tokensDe(palabras.slice(i, i + n).map((m) => m[0]).join(' '));
        const p = personas.find((q) => q.tokens.some((t) => contenido(tk, t)));
        if (p) {
          const ini = cand.index + palabras[i].index;
          const fin = cand.index + palabras[i + n - 1].index + palabras[i + n - 1][0].length;
          fn(ini, fin, p);
          i += n;
          hecho = true;
        }
      }
      if (!hecho) i += 1;
    }
  }
}

function sustituirPersonas(texto, personas) {
  const cortes = [];
  cadaMencion(texto, personas, (ini, fin, p) => cortes.push([ini, fin, p.inventado]));
  if (!cortes.length) return texto;
  let out = '';
  let pos = 0;
  cortes.forEach(([ini, fin, por]) => { out += texto.slice(pos, ini) + por; pos = fin; });
  return out + texto.slice(pos);
}

// El grupo (persona inventada) de un nombre escrito en una celda.
function grupoDePersona(nombre, personas) {
  const tk = tokensDe(nombre);
  if (tk.length < 2) return null;
  return personas.find((p) => p.tokens.some((t) => mismaPersona(tk, t))) || null;
}

// ---------------------------------------------------------------- centro
const PAL_LUGAR = "\\p{Lu}[\\p{L}'’-]+";
const LUGAR = PAL_LUGAR + '(?:\\s+(?:(?:de|del|la)\\s+)?' + PAL_LUGAR + ')*';
const RE_IES = new RegExp('\\bI\\.?E\\.?S\\.?\\s+(' + PAL_LUGAR + '(?:\\s+' + PAL_LUGAR + ')*)(?:\\s+(?:de\\s+|[-–—]\\s*)(' + LUGAR + '))?', 'gu');
const RE_COMARCA = new RegExp('\\b[Cc]omarca\\s+(?:del|de\\s+la|de\\s+los|de\\s+las|de)\\s+(' + LUGAR + ')', 'gu');
const RE_CIUDAD = new RegExp('(' + LUGAR + ')\\s+es\\s+(?:una|un)\\s+(?:ciudad|localidad|villa|municipio|pueblo|población)', 'gu');

// Palabras que no pueden ser el nombre de un centro por sí solas. «el IES. Los
// centros de trabajo…» hacía que el patrón «IES X» leyera «Los» como centro y
// luego sustituyera todos los artículos del documento.
const NO_ES_LUGAR = new Set(['el', 'la', 'los', 'las', 'un', 'una', 'de', 'del', 'y', 'e', 'o', 'u', 'este', 'esta', 'estos', 'estas', 'dicho', 'dicha', 'mismo', 'misma', 'centro', 'centros', 'instituto', 'ies']);
const valeLugar = (x) => {
  const tk = F.norm(x).split(/\s+/).filter(Boolean);
  return tk.length > 0 && tk.some((t) => !NO_ES_LUGAR.has(t)) && F.norm(x).length >= 3;
};

// Del propio documento: cómo se llama el centro, en qué localidad está y a qué
// comarca pertenece. Cada lista puede traer varias formas.
function centroDe(datos) {
  const r = { centros: new Set(), localidades: new Set(), comarcas: new Set() };
  cadaCadena(datos, (s) => {
    for (const m of s.matchAll(RE_IES)) {
      if (!valeLugar(m[1])) continue;
      r.centros.add(m[1]);
      if (m[2] && valeLugar(m[2])) r.localidades.add(m[2]);
    }
    for (const m of s.matchAll(RE_COMARCA)) if (valeLugar(m[1])) r.comarcas.add(m[1]);
    for (const m of s.matchAll(RE_CIUDAD)) if (valeLugar(m[1])) r.localidades.add(m[1]);
  }, '');
  return { centros: [...r.centros], localidades: [...r.localidades], comarcas: [...r.comarcas] };
}

// Los patrones con los que se cambia todo lo que sea del centro, de lo largo a
// lo corto: «IES X de Y», «comarca del Z», y las palabras sueltas.
function patronesDeCentro(reales, C) {
  const p = [];
  const locs = reales.localidades.map(patronAcento);
  reales.centros.forEach((c) => {
    const resto = locs.length ? '(?:\\s+de\\s+(' + locs.join('|') + '))?' : '()';
    p.push([new RegExp('\\bI\\.?E\\.?S\\.?\\s+' + patronAcento(c) + resto + '(?![\\p{L}\\d])', 'giu'),
      (m, loc) => (loc ? C.nombre + ' de ' + C.localidad : C.nombre)]);
  });
  reales.comarcas.forEach((c) => {
    p.push([new RegExp('\\bcomarca\\s+(?:del|de\\s+la|de\\s+los|de\\s+las|de)\\s+' + patronAcento(c) + '(?![\\p{L}\\d])', 'giu'),
      () => 'comarca del ' + C.comarca]);
  });
  reales.centros.forEach((c) => p.push([new RegExp(conLimites(patronAcento(c)), 'giu'), () => C.corto]));
  reales.comarcas.forEach((c) => p.push([new RegExp(conLimites(patronAcento(c)), 'giu'), () => C.comarca]));
  reales.localidades.forEach((c) => p.push([new RegExp(conLimites(patronAcento(c)), 'giu'), () => C.localidad]));
  return p;
}

// ---------------------------------------------------------------- empresas
const FORMA = '(?:S\\.\\s?L\\.\\s?U?\\.?|S\\.\\s?A\\.\\s?U?\\.?|S\\.\\s?Coop\\.?|SLU|SAU|SL|C\\.B\\.)';
const RE_EMPRESA = new RegExp('(' + PAL + '(?:\\s+(?:(?:de|del|la|y|&)\\s+)?' + PAL + '){0,4}),?\\s+(' + FORMA + ')(?![\\p{L}\\d])', 'gu');

const partirForma = (texto) => {
  const t = String(texto).trim();
  const m = t.match(new RegExp('^(.*?),?\\s+(' + FORMA + ')$', 'u'));
  return m ? { nombre: m[1].trim(), forma: m[2] } : { nombre: t, forma: '' };
};

const empresaInventada = (i) => EMPRESA_PREFIJOS[i % EMPRESA_PREFIJOS.length] + ' '
  + EMPRESA_RAMOS[Math.floor(i / EMPRESA_PREFIJOS.length) % EMPRESA_RAMOS.length]
  + (i >= EMPRESA_PREFIJOS.length * EMPRESA_RAMOS.length ? ' ' + (Math.floor(i / (EMPRESA_PREFIJOS.length * EMPRESA_RAMOS.length)) + 1) : '');
const EMPRESAS_INVENTADAS = new Set();
for (let i = 0; i < EMPRESA_PREFIJOS.length * EMPRESA_RAMOS.length * 3; i += 1) EMPRESAS_INVENTADAS.add(claveTexto(empresaInventada(i)));
// Una empresa inventada puede venir precedida de otra palabra con mayúscula
// (el inicio de la frase), así que basta con que acabe en una inventada.
const esEmpresaInventada = (nombre) => {
  const k = claveTexto(nombre);
  for (const e of EMPRESAS_INVENTADAS) if (k === e || k.endsWith(' ' + e)) return true;
  return false;
};
const puebloInventado = (i) => PUEBLOS[i % PUEBLOS.length] + (i >= PUEBLOS.length ? ' ' + (Math.floor(i / PUEBLOS.length) + 1) : '');
const esPuebloInventado = (p, C) => {
  const k = claveTexto(p);
  return k === claveTexto(C.localidad) || PUEBLOS.some((x) => k === claveTexto(x) || new RegExp('^' + claveTexto(x) + ' \\d+$').test(k));
};

// En una tabla de empresas, qué columna es cada cosa: se mira la fila que
// contiene la cabecera «Empresa» (o equivalente).
const COLUMNAS = {
  empresa: /^(?:empresas?|razon social|nombre de la empresa|entidad|empresa colaboradora|nombre comercial)$/,
  documento: /^(?:cif|nif|cif\/nif|nif\/cif)$/,
  pueblo: /^(?:localidad|poblacion|municipio|pueblo|ciudad|domicilio|ubicacion)$/,
  sector: /^(?:sector|actividad|sector de actividad|ramo|sector productivo|actividad principal)$/,
};
function cadaFilaDeEmpresa(filas, fn) {
  if (!Array.isArray(filas)) return;
  const etiqueta = (c) => F.norm(c && c.text).replace(/[:.]+$/, '');
  // Una tabla de empresas no siempre llama «Empresa» a la columna del nombre: en
  // los PCCF la cabecera es «CIF | Nombre | Localidad | Sector Productivo…», y
  // los nombres no llevan forma jurídica. Se reconoce por la combinación de CIF,
  // Nombre y Sector, que no tiene una tabla de personas.
  const cab = filas.findIndex((fila) => {
    if (!Array.isArray(fila)) return false;
    const et = fila.map(etiqueta);
    const empresa = et.some((t) => COLUMNAS.empresa.test(t));
    const cif = et.some((t) => COLUMNAS.documento.test(t));
    const sector = et.some((t) => COLUMNAS.sector.test(t));
    return empresa || (et.indexOf('nombre') >= 0 && cif && sector);
  });
  if (cab < 0) return;
  const col = {};
  filas[cab].forEach((c, j) => {
    const t = etiqueta(c);
    Object.keys(COLUMNAS).forEach((k) => { if (col[k] === undefined && COLUMNAS[k].test(t)) col[k] = j; });
    if (col.empresa === undefined && t === 'nombre') col.empresa = j;
  });
  for (let i = cab + 1; i < filas.length; i += 1) fn(filas[i], col, i);
}
const valida = (c) => !!c && String(c.text).trim().length >= 3 && !/^[-–—.\s]+$/.test(c.text);

// ---------------------------------------------------------------- contexto de sustitución
// Los mapas real -> inventado de una pasada. Los datos reales solo viven en
// memoria mientras dura la llamada.
function crearContexto(C) {
  const mapas = { empresas: new Map(), pueblos: new Map(), documentos: new Map(), correos: new Map(), telefonos: new Map() };
  const alta = (mapa, real, clave, crear) => {
    if (!mapa.has(clave)) mapa.set(clave, { real, nuevo: crear(mapa.size) });
    return mapa.get(clave).nuevo;
  };
  return {
    mapas,
    empresa: (n) => alta(mapas.empresas, n, claveTexto(n), empresaInventada),
    pueblo: (n) => (claveTexto(n) === claveTexto(C.localidad) ? C.localidad : alta(mapas.pueblos, n, claveTexto(n), puebloInventado)),
    documento: (d) => alta(mapas.documentos, d, d.toUpperCase(), (i) => 'X' + pad(i + 1, 8)),
    correo: (c) => alta(mapas.correos, c, c.toLowerCase(), (i) => 'contacto' + (i + 1) + '@' + C.dominio),
    telefono: (t) => alta(mapas.telefonos, t, t.replace(/\D/g, ''), (i) => '600 000 ' + pad(i + 1, 3)),
  };
}

const RE_CORREO = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const RE_TELEFONO = /(?<![\d.,])(?:\+34[\s.-]?)?[6-9]\d{2}(?:[\s.-]?\d{2,3}){2,3}(?!\d)/g;
const digitosDeTelefono = (t) => t.replace(/\D/g, '').replace(/^34(?=\d{9}$)/, '');
// Los sustituidores distinguen mayúsculas; el guardia no, a propósito.
const RE_DOCUMENTO = /(?<![\p{L}\d])(?:[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]|\d{8}[A-Z]|[XYZ]\d{7}[A-Z])(?![\p{L}\d])/gu;
const RE_DOCUMENTO_GUARDIA = /(?<![\p{L}\d])(?:[A-Za-z]\d{7}[0-9A-Za-z]|\d{8}[A-Za-z]|[XYZxyz]\d{7}[A-Za-z])(?![\p{L}\d])/gu;
const esDocumentoInventado = (d) => /^X0000\d{4}$/.test(d);
const esTelefonoInventado = (t) => /^600 000 \d{3}$/.test(t.trim());

// ---------------------------------------------------------------- texto inventado
// Reserva de frases para los apartados que se reescriben. Llevan {centro},
// {localidad} y {comarca} para que concuerden con el centro inventado.
const POZOS = {
  centro: {
    frases: [
      'Esta programación se ha diseñado para impartirla en el ciclo formativo de grado superior del {centro} de {localidad}.',
      'El {centro} es un centro que fue inaugurado en 1985 y reformado en 2008 para adaptarlo a los nuevos planes de estudio.',
      'Actualmente dispone de una capacidad cercana a los 600 alumnos y alumnas e imparte docencia por la mañana y por la tarde.',
      'El centro cuenta con instalaciones adecuadas: salón de actos, gimnasio, biblioteca, laboratorios, tres aulas de informática y un taller de tecnología.',
      '{localidad} es una población situada en el interior de la provincia, con unos 18.000 habitantes y cabecera de la comarca del {comarca}.',
      'La economía de la zona se basa principalmente en los servicios, la industria agroalimentaria y un pequeño sector tecnológico.',
      'El alumnado procede en su mayoría de la propia localidad y de los municipios cercanos, y el nivel socioeconómico de las familias es medio.',
      'Para tomar decisiones adecuadas es necesario conocer el contexto físico, social y educativo en el que se desarrolla la programación.',
      'El centro mantiene convenios con empresas del entorno para la formación en centros de trabajo y la formación dual.',
      'Las aulas del ciclo disponen de un ordenador por alumno conectado a la red local y a internet.',
      'El equipo directivo fomenta la participación en proyectos de innovación y programas europeos.',
      'La comunicación con las familias se realiza a través de la plataforma educativa y de las tutorías.',
    ],
    items: [
      'Educación Secundaria Obligatoria (ESO).',
      'Bachillerato en las modalidades de Ciencias y Humanidades.',
      'Formación Profesional Básica en Informática de Oficina.',
      'Ciclo formativo de grado medio de Sistemas Microinformáticos y Redes.',
      'Ciclo formativo de grado superior de Administración y Finanzas.',
      'Ciclo formativo de grado superior de Desarrollo de Aplicaciones Web.',
      'Ciclo formativo de grado superior de Animaciones 3D, Juegos y Entornos Interactivos.',
      'Enseñanzas de idiomas en la sección de la escuela oficial.',
      'Ciclo formativo de grado medio de Gestión Administrativa.',
      'Ciclo formativo de grado superior de Educación Infantil.',
      'Ciclo formativo de grado superior de Administración de Sistemas Informáticos en Red.',
      'Programa de refuerzo para el alumnado de primer curso.',
    ],
  },
  grupo: {
    frases: [
      'En términos generales el alumnado muestra interés por el módulo y una actitud participativa.',
      'El nivel previo es heterogéneo: una parte del grupo parte de conocimientos básicos y otra necesita más apoyo.',
      'No se detectan dificultades importantes en la comprensión de textos técnicos.',
      'El ritmo de trabajo es adecuado, con algunos alumnos que necesitan más tiempo en las prácticas.',
      'El grupo está cohesionado y el alumnado colabora en la resolución de las tareas.',
      'El rendimiento académico inicial es satisfactorio.',
      'Se observa una buena disposición hacia el trabajo en equipo.',
      'Hay un pequeño grupo de alumnos con dificultades de organización que requiere seguimiento.',
      'Un alumno necesita ampliación del tiempo en las pruebas escritas.',
      'Se aplicarán medidas de refuerzo individualizadas coordinadas con el departamento de orientación.',
      'Ampliación del tiempo en las pruebas y ubicación cerca del profesorado.',
      'Seguimiento mensual con la persona que tutoriza al grupo.',
    ],
  },
  mejora: {
    frases: [
      'Añadir más prácticas guiadas en grupo.',
      'Incorporar actividades para trabajar la comunicación oral.',
      'Revisar la temporalización de la segunda evaluación, que resultó demasiado ajustada.',
      'Reforzar los ejercicios de repaso antes de cada prueba escrita.',
      'Aumentar el uso de herramientas en la nube en las prácticas.',
      'Recoger la opinión del alumnado al final de cada situación de aprendizaje.',
      'Coordinar con otros módulos las fechas de entrega de proyectos.',
      'Ampliar los materiales de apoyo del aula virtual con vídeos breves.',
      'Preparar más ejemplos resueltos para las unidades de mayor dificultad.',
      'Introducir una práctica integradora al final de cada trimestre.',
    ],
  },
};

// Texto del tema con aproximadamente `largo` caracteres: si es corto, la frase
// que más se le acerque; si es largo, varias hasta llegar. Siembra con `semilla`.
//
// `usadas` es la memoria de un apartado: lo ya escrito no se repite hasta que se
// agota la reserva, para que dos viñetas seguidas no digan lo mismo.
function inventarTexto(tema, semilla, largo, comoItem, centro, usadas) {
  const pozo = POZOS[tema] || POZOS.mejora;
  const C = Object.assign({}, CENTRO, centro);
  const rellenar = (s) => s.replace(/\{centro\}/g, C.nombre).replace(/\{localidad\}/g, C.localidad).replace(/\{comarca\}/g, C.comarca);
  const todas = (comoItem && pozo.items ? pozo.items : pozo.frases).map(rellenar);
  let fuente = usadas ? todas.filter((x) => !usadas.has(x)) : todas;
  if (fuente.length < 2) {
    if (usadas) todas.forEach((x) => usadas.delete(x));
    fuente = todas;
  }
  const rng = generador(tema + '|' + semilla);
  const orden = barajar(fuente, rng);
  const objetivo = Math.max(largo, 12);
  const primera = objetivo <= 140
    ? orden.slice().sort((a, b) => Math.abs(a.length - objetivo) - Math.abs(b.length - objetivo))[0]
    : orden[0];
  const partes = [primera];
  let total = primera.length;
  for (const s of orden) {
    if (total >= objetivo * 0.8) break;
    if (partes.indexOf(s) >= 0 || total + s.length + 1 > objetivo * 1.25) continue;
    partes.push(s);
    total += s.length + 1;
  }
  if (usadas) partes.forEach((x) => usadas.add(x));
  return partes.join(' ');
}

// ---------------------------------------------------------------- reescritura de apartados
const temaDe = (clave, tabla) => {
  // Una clave vale para su apartado exacto y para todo lo que cuelga de él. Las
  // memorias meten la valoración de la docencia en varios subapartados (objetivos,
  // metodología, evaluación…) y no tiene sentido enumerarlos uno a uno.
  const k = Object.keys(tabla)
    .filter((c) => clave === c || clave.indexOf(c + '/') === 0 || c.indexOf(clave + '/') === 0)
    .sort((a, b) => b.length - a.length)[0];
  return k ? tabla[k] : null;
};

// Se conserva lo que es una frase de enlace («Turno de la mañana:») o una línea
// de persona, que ya se habrá sustituido por su nombre inventado.
const seConserva = (t) => (/:\s*$/.test(t) && t.length <= 90) || ETIQUETA_PERSONA.test(F.norm(t));

// En una tabla se respetan las etiquetas y se reescribe el valor: lo que está
// en negrita, la fila de cabecera, lo corto y lo que se repite en la tabla
// (los nombres de las filas «Motivación», «Ritmo de trabajo»…) son etiquetas.
function reescribirTabla(t, tema, semilla, centro, usadas) {
  const filas = t.filas;
  const cuentas = new Map();
  filas.forEach((f) => f.forEach((c) => { const k = F.norm(c.text); cuentas.set(k, (cuentas.get(k) || 0) + 1); }));
  // Una columna de personas se reescribe siempre, aunque el valor sea corto: si
  // se dejara a la regla general, un nombre de dos palabras cabría en «corta» y
  // se conservaría como si fuera una etiqueta.
  const cabPersona = filas.findIndex((fila) => Array.isArray(fila) && !esCabeceraDeEmpresas(fila)
    && fila.some((c, j) => esColumnaDePersona(fila, j, '')));
  const colsPersona = new Set();
  if (cabPersona >= 0) filas[cabPersona].forEach((c, j) => { if (esColumnaDePersona(filas[cabPersona], j, '')) colsPersona.add(j); });
  const cambios = new Map();
  filas.forEach((fila, i) => {
    const cabecera = i === 0 && fila.every((c) => String(c.text).length <= 60);
    fila.forEach((c, j) => {
      const texto = String(c.text == null ? '' : c.text);
      const forzar = i > cabPersona && colsPersona.has(j);
      const corta = texto.length <= 20 && !/\p{Lu}{2,}|\d/u.test(texto);
      const codigo = /^\d+\s?[ºªa-z]?\.?$/i.test(texto.trim());
      const esEtiqueta = !forzar && (c.bold || cabecera || corta || codigo || cuentas.get(F.norm(texto)) > 1 || seConserva(texto));
      if (esEtiqueta) return;
      c.text = inventarTexto(tema, semilla + '|t' + i + '.' + j, texto.length, false, centro, usadas);
      cambios.set(texto, c.text);
    });
  });
  if (Array.isArray(t.pares)) {
    t.pares.forEach((p) => { if (cambios.has(p.valor)) p.valor = cambios.get(p.valor); });
  }
}

function reescribirValor(x, tema, semilla, centro, usadas) {
  if (Array.isArray(x)) { x.forEach((y, i) => reescribirValor(y, tema, semilla + '|' + i, centro, usadas)); return; }
  if (!x || typeof x !== 'object') return;
  if (x.ref) return;
  if (x.type === 'p') {
    const t = plano(x.text);
    if (!seConserva(t)) x.text = inventarTexto(tema, semilla, t.length, false, centro, usadas);
    return;
  }
  if (x.type === 'list' && Array.isArray(x.items)) {
    x.items.forEach((it, i) => {
      const t = plano(it.text);
      if (!seConserva(t)) it.text = inventarTexto(tema, semilla + '|i' + i, t.length, true, centro, usadas);
    });
    return;
  }
  if (Array.isArray(x.filas)) { reescribirTabla(x, tema, semilla, centro, usadas); return; }
  Object.keys(x).forEach((k) => reescribirValor(x[k], tema, semilla + '|' + k, centro, usadas));
}

// ---------------------------------------------------------------- fichas de SA
const CASOS = ['una tienda en línea', 'una biblioteca municipal', 'un gimnasio', 'una agencia de viajes', 'un club deportivo',
  'una clínica veterinaria', 'una escuela de idiomas', 'un taller mecánico', 'una cooperativa agrícola', 'una librería',
  'una asociación de vecinos', 'un servicio de reparto', 'una academia de música'];

// Vocabulario por tema: conceptos con su artículo, para que cuadren en
// «sobre {c}», y herramientas como «Nombre: descripción», que es la forma en que
// el documento las escribe en los materiales.
const TEMAS = {
  bd: {
    conceptos: ['el modelo relacional', 'las claves primarias y foráneas', 'el diseño entidad-relación', 'la normalización de tablas', 'las consultas de selección', 'las consultas sobre varias tablas', 'las vistas y los índices', 'los procedimientos almacenados', 'las transacciones y la integridad', 'la copia de seguridad y la restauración', 'los permisos de usuarios', 'las bases de datos documentales'],
    herramientas: ['MySQL Workbench: entorno gráfico para diseñar y consultar bases de datos.', 'PostgreSQL: sistema gestor de bases de datos relacional de código abierto.', 'MariaDB: servidor de bases de datos compatible con MySQL.', 'DBeaver: cliente universal para conectarse a distintos gestores.', 'MongoDB: base de datos documental para las prácticas de NoSQL.', 'draw.io: herramienta para dibujar diagramas entidad-relación.'],
  },
  marcas: {
    conceptos: ['las etiquetas y los atributos de un documento', 'la estructura de un documento XML bien formado', 'la validación con DTD y esquemas', 'el lenguaje HTML y su semántica', 'las hojas de estilo en cascada', 'las consultas XPath', 'la transformación con XSLT', 'el formato JSON', 'los canales de sindicación', 'los sistemas de gestión empresarial', 'el almacenamiento de datos en documentos', 'los espacios de nombres'],
    herramientas: ['Visual Studio Code: editor de código con extensiones para XML y HTML.', 'Navegador web: herramientas para desarrolladores.', 'Validador del W3C: comprobación de documentos HTML y CSS.', 'XMLCopyEditor: editor y validador de documentos XML.', 'Odoo: sistema de gestión empresarial para las prácticas de ERP.', 'JSONLint: validador en línea de documentos JSON.'],
  },
  programacion: {
    conceptos: ['las variables y los tipos de datos', 'las estructuras de control condicionales', 'los bucles y su depuración', 'las funciones y el paso de parámetros', 'las colecciones y los arreglos', 'las clases y los objetos', 'la herencia y el polimorfismo', 'el tratamiento de excepciones', 'la lectura y escritura de ficheros', 'las interfaces gráficas de usuario', 'el acceso a bases de datos desde el código', 'las pruebas unitarias'],
    herramientas: ['IntelliJ IDEA: entorno de desarrollo para Java.', 'Visual Studio Code: editor ligero para escribir y depurar código.', 'JUnit: biblioteca de pruebas unitarias.', 'Git y GitHub: control de versiones y entrega de las prácticas.', 'Maven: gestión de dependencias y construcción de proyectos.', 'Documentación del lenguaje: referencia oficial.'],
  },
  sistemas: {
    conceptos: ['los componentes de un ordenador', 'la arquitectura del procesador y la memoria', 'la instalación de un sistema operativo', 'la virtualización de equipos', 'la gestión de usuarios y permisos', 'el sistema de ficheros', 'los procesos y los servicios del sistema', 'la configuración de la red del equipo', 'los scripts de administración', 'las copias de seguridad', 'la monitorización del rendimiento', 'la resolución de averías'],
    herramientas: ['VirtualBox: virtualizador para crear las máquinas de prácticas.', 'Ubuntu Server: distribución Linux para los servicios.', 'Windows: sistema operativo cliente para las prácticas de administración.', 'PowerShell y Bash: intérpretes de órdenes para los scripts.', 'Wireshark: analizador de tráfico de red.', 'Manuales del fabricante: guías de instalación y configuración.'],
  },
  redes: {
    conceptos: ['el modelo de capas', 'las direcciones IP y las máscaras de subred', 'el cableado estructurado', 'los protocolos de la capa de transporte', 'los servicios DHCP y DNS', 'la configuración de un encaminador', 'las redes locales virtuales', 'la seguridad en redes', 'las redes inalámbricas', 'el diagnóstico de problemas de conectividad'],
    herramientas: ['Cisco Packet Tracer: simulador de redes para las prácticas.', 'Wireshark: analizador de tráfico de red.', 'Órdenes ping y traceroute: diagnóstico de la conectividad.', 'VirtualBox: máquinas virtuales conectadas en red.', 'Calculadora de subredes: herramienta en línea.', 'Estándares de red: documentación de referencia.'],
  },
  entornos: {
    conceptos: ['los algoritmos y su representación', 'los ciclos de vida del software', 'las metodologías ágiles', 'el entorno de desarrollo integrado', 'la depuración paso a paso', 'las pruebas de software', 'la refactorización del código', 'el control de versiones con ramas', 'los diagramas de clases', 'los diagramas de casos de uso y de secuencia', 'la documentación del código', 'la optimización del código'],
    herramientas: ['Git: sistema de control de versiones distribuido.', 'GitHub: plataforma para alojar y revisar repositorios.', 'Eclipse: entorno de desarrollo integrado.', 'PlantUML: generación de diagramas UML a partir de texto.', 'Visual Studio Code: editor con depurador integrado.', 'JUnit: biblioteca de pruebas unitarias.'],
  },
  cliente: {
    conceptos: ['la sintaxis de JavaScript', 'las funciones y los objetos en JavaScript', 'los objetos predefinidos del lenguaje', 'el árbol DOM y su manipulación', 'los eventos y los formularios', 'las expresiones regulares', 'la comunicación asíncrona con promesas', 'las peticiones a una API', 'los componentes y su estado', 'el almacenamiento en el navegador', 'la depuración en el navegador', 'la modularización del código'],
    herramientas: ['Herramientas para desarrolladores del navegador: inspección y depuración.', 'Node.js y npm: ejecución de scripts y gestión de paquetes.', 'Visual Studio Code: editor de código con extensiones.', 'Vite: entorno de desarrollo para aplicaciones web.', 'React: biblioteca de componentes de interfaz.', 'MDN Web Docs: documentación de referencia.'],
  },
  servidor: {
    conceptos: ['la arquitectura cliente-servidor', 'el desarrollo de rutas y controladores', 'el patrón MVC', 'la arquitectura REST', 'el acceso a bases de datos desde el servidor', 'la autenticación y la autorización', 'la validación de los datos de entrada', 'la documentación de una API', 'las pruebas de una API', 'la gestión de errores y registros', 'la seguridad frente a ataques habituales', 'el despliegue de una aplicación de servidor'],
    herramientas: ['Node.js: entorno de ejecución para el servidor.', 'Express: framework para crear servicios web.', 'Postman: cliente para probar peticiones.', 'OpenAPI: especificación para documentar la API.', 'MongoDB: base de datos documental para las prácticas.', 'Git y GitHub: control de versiones y entrega de las prácticas.'],
  },
  despliegue: {
    conceptos: ['la instalación de un servidor web', 'los hosts virtuales', 'el servidor de aplicaciones', 'la configuración de un servidor de nombres', 'el servidor de ficheros', 'la zona desmilitarizada', 'el servidor de directorio', 'los certificados y el protocolo HTTPS', 'la documentación de la instalación', 'el control de versiones en el servidor', 'los contenedores', 'los servicios en la nube'],
    herramientas: ['Apache HTTP Server: servidor web para las prácticas.', 'Nginx: servidor web y proxy inverso.', 'Docker: ejecución de aplicaciones en contenedores.', 'Apache Tomcat: servidor de aplicaciones Java.', 'Samba: servidor de ficheros para redes mixtas.', 'VirtualBox: máquinas virtuales para montar los servicios.'],
  },
  interfaces: {
    conceptos: ['la planificación de una interfaz', 'los prototipos y las maquetas', 'la semántica de HTML', 'las propiedades de CSS', 'el diseño con Flexbox', 'el diseño con CSS Grid', 'el diseño adaptable a distintos dispositivos', 'la accesibilidad web', 'la usabilidad y la experiencia de usuario', 'las guías de estilo', 'los frameworks de interfaz', 'las pruebas de usabilidad'],
    herramientas: ['Figma: diseño de prototipos de interfaz.', 'Visual Studio Code: editor de código con extensiones.', 'Bootstrap: framework de componentes de interfaz.', 'Lighthouse y WAVE: evaluación de accesibilidad y rendimiento.', 'Herramientas del navegador: inspección de la interfaz.', 'Can I use: consulta de compatibilidad entre navegadores.'],
  },
  sostenibilidad: {
    conceptos: ['los objetivos de desarrollo sostenible', 'la economía circular', 'la huella ambiental de una organización', 'la responsabilidad social corporativa', 'las energías renovables', 'la gestión de residuos', 'el consumo responsable', 'la igualdad en el entorno profesional', 'los indicadores de sostenibilidad', 'el plan de sostenibilidad de una empresa', 'el comercio justo', 'la informática verde'],
    herramientas: ['Agenda 2030: documentos oficiales de los objetivos de desarrollo sostenible.', 'Calculadora de huella de carbono: herramienta en línea.', 'Informes de sostenibilidad: casos de organizaciones.', 'Presentaciones en línea: soporte para exponer los trabajos.', 'Noticias de actualidad: artículos para el debate.', 'Plantilla de plan de sostenibilidad: modelo para el trabajo final.'],
  },
  digital: {
    conceptos: ['la transformación digital de las empresas', 'la inteligencia artificial en los sectores productivos', 'el internet de las cosas', 'la analítica de datos', 'la computación en la nube', 'la ciberseguridad en la empresa', 'la automatización de procesos', 'la industria conectada', 'los gemelos digitales', 'la realidad aumentada', 'el análisis de casos reales de digitalización', 'las tecnologías habilitadoras'],
    herramientas: ['Hojas de cálculo: análisis y paneles de datos.', 'Plataformas en la nube: cuentas educativas.', 'Asistentes de inteligencia artificial: apoyo en las prácticas guiadas.', 'Informes sectoriales: estudios de digitalización.', 'Simuladores: procesos industriales conectados.', 'Presentaciones en línea: soporte para exponer los trabajos.'],
  },
  general: {
    conceptos: ['los contenidos de la situación de aprendizaje', 'los conceptos básicos del tema', 'las herramientas del módulo', 'la documentación de la práctica', 'la resolución de problemas', 'el trabajo en equipo', 'la búsqueda de información fiable', 'la presentación de resultados'],
    herramientas: ['Aula virtual del módulo: materiales y tareas.', 'Apuntes del profesorado: resúmenes del módulo.', 'Visual Studio Code: editor de código.', 'Hojas de cálculo: tablas y gráficos.', 'Presentaciones en línea: exposición de resultados.', 'Documentación oficial: manuales de las herramientas.'],
  },
};

const TEMA_POR_TITULO = [[/\bredes?\b/, 'redes']];
const TEMA_POR_MODULO = [
  [/marcas/, 'marcas'], [/bases? de datos/, 'bd'], [/entornos de desarrollo/, 'entornos'], [/cliente/, 'cliente'],
  [/servidor/, 'servidor'], [/despliegue/, 'despliegue'], [/interfaces/, 'interfaces'], [/programacion/, 'programacion'],
  [/sistemas informaticos/, 'sistemas'], [/sostenibilidad/, 'sostenibilidad'], [/digitalizacion/, 'digital'],
];
function temaDeFicha(modulo, titulo) {
  const m = F.norm(modulo);
  const t = F.norm(titulo);
  const deModulo = (TEMA_POR_MODULO.find(([re]) => re.test(m)) || [null, 'general'])[1];
  const deTitulo = TEMA_POR_TITULO.find(([re]) => re.test(t));
  return deTitulo && (deModulo === 'sistemas' || deModulo === 'general') ? deTitulo[1] : deModulo;
}

// Plantillas por tipo de actividad. {c} y {c2} son conceptos del tema, {h} una
// herramienta, {k} un caso práctico y {T} el título de la SA entre comillas.
const PLANTILLAS = {
  introduccion: [
    'Lluvia de ideas inicial sobre {c}.',
    'Cuestionario de conocimientos previos de la situación «{T}».',
    'Presentación del caso práctico de {k} que se desarrollará a lo largo de la situación.',
    'Demostración guiada de {h} y de sus usos en {c}.',
    'Debate en clase: ¿para qué sirve {c} en un proyecto real?',
    'Visionado de un vídeo breve sobre {c} y puesta en común.',
    'Exposición del profesorado sobre {c} con ejemplos sencillos.',
    'Diagnóstico inicial con preguntas abiertas sobre {c} y {c2}.',
    'Presentación de los objetivos de «{T}» y de la forma de trabajo con {h}.',
    'Repaso sobre {c} con un test breve en el aula virtual.',
  ],
  no_evaluables: [
    'Ejercicios guiados en clase sobre {c}.',
    'Resolución en parejas de problemas sencillos con {h}.',
    'Práctica paso a paso sobre {c} siguiendo un tutorial.',
    'Corrección colectiva de los ejercicios sobre {c}.',
    'Cuestionarios de autoevaluación en el aula virtual sobre {c}.',
    'Minirretos cooperativos con {h} para el caso de {k}.',
    'Análisis de ejemplos resueltos sobre {c}.',
    'Debate sobre los errores más habituales al trabajar {c}.',
    'Taller de dudas sobre {c} y su aplicación a {k}.',
    'Puesta en común de las soluciones propuestas por los grupos sobre {c2}.',
  ],
  evaluables: [
    'Entrega de una práctica individual sobre {c} con {h}.',
    'Proyecto en equipo para el caso de {k} aplicando {c}.',
    'Prueba escrita sobre {c} y {c2}.',
    'Prueba práctica con {h}: resolución de un supuesto sobre {k}.',
    'Informe técnico con la documentación sobre {c}.',
    'Exposición oral del trabajo realizado sobre {c}.',
    'Cuaderno de prácticas con la resolución de los ejercicios sobre {c}.',
    'Entrega de la tarea del aula virtual sobre {c}, valorada con rúbrica.',
    'Caso práctico evaluable de {k}, resuelto con {h}.',
    'Defensa ante el grupo del trabajo final de «{T}».',
  ],
  refuerzo: [
    'Ejercicios adicionales graduados sobre {c}.',
    'Tutoría individual para repasar {c} con apoyo de {h}.',
    'Fichas de repaso con ejemplos resueltos sobre {c}.',
    'Vídeos de apoyo sobre {c} para ver a su ritmo.',
    'Práctica guiada sobre {c} con el caso de {k} dividido en pasos pequeños.',
    'Cuestionario de refuerzo con retroalimentación inmediata sobre {c}.',
    'Trabajo con un compañero o compañera de apoyo para repasar {c}.',
    'Resumen esquemático sobre {c} elaborado por el alumno o la alumna.',
  ],
  ampliacion: [
    'Reto avanzado: ampliar el caso de {k} incorporando lo aprendido sobre {c}.',
    'Investigación sobre {c} y presentación breve al grupo.',
    'Práctica opcional con {h} que profundiza en {c2}.',
    'Comparar dos alternativas para resolver el caso de {k} y justificar la elección.',
    'Elaboración de un tutorial propio sobre {c}.',
    'Participación en un minicertamen de resolución de problemas sobre {c}.',
    'Lectura y comentario de la documentación de {h}.',
    'Proyecto personal que combine {c} y {c2}.',
  ],
  recuperacion: [
    'Prueba escrita de recuperación sobre {c}.',
    'Entrega de las prácticas pendientes de «{T}» con revisión individual.',
    'Prueba práctica con {h} de los contenidos mínimos.',
    'Plan de trabajo personalizado sobre {c} con seguimiento semanal.',
    'Repetición de la práctica no superada sobre {c} incorporando las correcciones.',
    'Cuestionario de recuperación en el aula virtual sobre {c} y {c2}.',
  ],
  recursos: [
    'Apuntes y presentaciones del profesorado sobre {c}.',
    'Colección de ejercicios resueltos sobre {c}.',
    'Guía de prácticas: {c} en el caso de {k}.',
    'Vídeos breves de apoyo sobre {c}.',
    'Documentación oficial de {h}.',
    'Aula virtual del módulo con las tareas y los cuestionarios de «{T}».',
  ],
};

const nombreDe = (herramienta) => herramienta.split(':')[0];
const sinPuntoFinal = (t) => String(t == null ? '' : t).trim().replace(/[.:;\s]+$/, '');

// Estado de una pasada de generación: lo ya escrito, para no repetir.
const crearGenerador = () => ({ usados: new Set(), listas: new Set() });

// Inventa `n` líneas del campo `campo` de una ficha. Distintas de las
// originales, distintas de todo lo ya generado con este generador y siempre
// iguales para el mismo módulo, título y número de SA.
// `sufijo` distingue dos etiquetas distintas que caen en el mismo campo del
// generador (p. ej. «Actividades Complementarias» y «Formativas no evaluables»):
// sin él saldría el mismo texto en las dos filas de la misma ficha. Cuando no se
// pasa, la semilla es la de antes, así que lo ya generado no cambia.
function inventarActividades(g, ficha, campo, n, originales, sufijo) {
  if (CAMPOS_DOCENTES.indexOf(campo) < 0) throw new Error('campo no docente: ' + campo);
  if (!n) return [];
  const ant = new Set((originales || []).map((l) => claveTexto(l)));
  const modulo = ficha.modulo || '';
  const titulo = sinPuntoFinal(ficha.titulo);
  const V = TEMAS[temaDeFicha(modulo, titulo)];
  const rng = generador([modulo, titulo, ficha.num, campo].concat(sufijo ? [sufijo] : []).join('|'));
  const plantillas = PLANTILLAS[campo];

  const componer = (plantilla) => {
    const c = elegir(V.conceptos, rng);
    let c2 = elegir(V.conceptos, rng);
    if (c2 === c) c2 = V.conceptos[(V.conceptos.indexOf(c) + 1) % V.conceptos.length];
    const h = nombreDe(elegir(V.herramientas, rng));
    const k = elegir(CASOS, rng);
    return plantilla.replace(/\{(c2|c|h|k|T)\}/g, (_, x) => ({ c, c2, h, k, T: titulo })[x]);
  };

  for (let intento = 0; intento < 200; intento += 1) {
    const orden = barajar(plantillas, rng);
    const lineas = [];
    const propias = new Set();
    for (let i = 0; i < n; i += 1) {
      // En los materiales, la primera es una herramienta del tema tal cual (así
      // las escribe el documento); el resto, plantillas con su concepto.
      if (campo === 'recursos' && i === 0) {
        const h = elegir(V.herramientas, rng);
        if (!ant.has(claveTexto(h))) { lineas.push(h); propias.add(claveTexto(h)); continue; }
      }
      let t = '';
      for (let k = 0; k < 40; k += 1) {
        t = componer(orden[(i + k) % orden.length]);
        const c = claveTexto(t);
        if (!ant.has(c) && !propias.has(c) && !g.usados.has(c)) break;
      }
      lineas.push(t);
      propias.add(claveTexto(t));
    }
    // Una herramienta puede repetirse de una ficha a otra (es normal que dos SA
    // usen el mismo programa), pero la lista entera no.
    const lista = lineas.map(claveTexto).join('|');
    if (g.listas.has(lista)) continue;
    g.listas.add(lista);
    lineas.forEach((l) => { if (campo !== 'recursos' || l.indexOf(':') < 0) g.usados.add(claveTexto(l)); });
    return lineas;
  }
  throw new Error('no se pudo inventar una lista distinta para ' + campo);
}

// Cambia en una ficha lo que escribió el profesorado. La ficha importada es una
// tabla (`filas`) y, si ya se editó en la aplicación, además un modelo con los
// campos en listas; se tocan las dos formas, con las mismas líneas. La tabla se
// edita celda a celda, no se rehace con filasDeFicha, para no cambiarle las
// filas ni la maquetación.
const PREFIJO_VINETA = /^\s*([−–—•*·-]\s*)/;

// Una celda que es etiqueta de fila: corta, de una sola línea y, además, en
// negrita o con el vocabulario de una etiqueta conocida. Con eso se distinguen
// las filas de etiquetas de las de contenido en las dos maquetaciones del
// documento (una etiqueta por fila, o tres y dos por fila).
//
// Lo de la negrita no basta: hay módulos que escriben la ficha entera sin
// negritas. Si solo se mirara el formato, todas sus filas parecerían contenido,
// no se reconocería ninguna etiqueta y el material docente pasaría intacto.
const pareceEtiqueta = (c, conocida) => {
  const t = String((c && c.text) == null ? '' : c.text).trim();
  if (!t || t.length > 70 || t.indexOf('\n') >= 0) return false;
  return !!(c && c.bold) || !!(conocida && conocida(t));
};
const filaDeEtiquetas = (fila, conocida) => Array.isArray(fila) && fila.length > 0
  && fila.every((c) => pareceEtiqueta(c, conocida));

// El cuerpo de la tabla de una ficha, separado del modelo semántico porque el
// saneador del .docx trabaja sobre las celdas del XML y el de `datos` sobre las
// filas importadas: la decisión de qué se conserva tiene que ser la misma en los
// dos sitios.
function sanearTablaFicha(filas, cabecera, g, hechos) {
  const porEtiqueta = new Map(F.CAMPOS_POR_OMISION.map((c) => [F.norm(c.etiqueta), c]));
  const etiquetaConocida = (texto) => {
    const n = F.norm(texto);
    const normativa = ETIQUETA_NORMATIVA.exec(n);
    return porEtiqueta.has(n) || (!!normativa && normativa.index === 0) || n === F.norm(F.CABECERA_ACTIVIDADES);
  };
  const cache = hechos || {};
  // La caché hace que una celda de la tabla y el campo del modelo que le
  // corresponde reciban el mismo texto; la clave lleva la etiqueta para que dos
  // etiquetas distintas del mismo campo no salgan iguales.
  const nuevas = (campo, clave, originales, sufijo) => {
    const k = clave + '|' + originales.length;
    if (!cache[k]) cache[k] = inventarActividades(g, cabecera, campo, originales.length, originales, sufijo);
    return cache[k];
  };
  let tocada = false;

  if (Array.isArray(filas)) {
    filas.forEach((fila, i) => {
      // Las dos primeras filas son la cabecera (número, título, sesiones y
      // evaluación) y no son material de nadie.
      if (i < 2 || !filaDeEtiquetas(fila, etiquetaConocida)) return;
      // El valor de un bloque de etiquetas no siempre está en la fila de
      // debajo: una misma etiqueta puede repartir su contenido en varias
      // filas, y entre ellas puede quedar una fila vacía (la última ficha de
      // una tabla a veces deja el material de recursos sin su etiqueta). El
      // bloque llega hasta la siguiente fila de etiquetas, que abre otro.
      let fin = i + 1;
      while (fin < filas.length && !filaDeEtiquetas(filas[fin], etiquetaConocida)) fin += 1;

      fila.forEach((c, j) => {
        const etiqueta = String(c.text == null ? '' : c.text);
        if (ETIQUETA_NORMATIVA.test(F.norm(etiqueta))) return;      // sale del decreto: se conserva

        // Un campo de la ficha para el que el generador no tiene plantillas propias se
        // reescribe como una etiqueta desconocida: con las del campo al que se parece y con
        // su etiqueta por sufijo, para que no salga el mismo texto que en la fila de la que
        // las toma.
        const conocido = porEtiqueta.get(F.norm(etiqueta));
        const propio = conocido && CAMPOS_DOCENTES.indexOf(conocido.id) >= 0 ? conocido : null;
        const campo = propio ? propio.id : campoParecido(etiqueta);
        if (CAMPOS_DOCENTES.indexOf(campo) < 0) return;
        const celdas = [];
        for (let k = i + 1; k < fin; k += 1) {
          const celda = filas[k] && filas[k][j];
          if (celda && String(celda.text == null ? '' : celda.text).trim()) celdas.push(celda);
        }
        // Una fila de etiquetas seguida de otra fila de etiquetas es un
        // encabezado sin valor debajo, como «Tipificación de actividades
        // formativas»: no hay nada que reescribir.
        if (!celdas.length) return;
        const originales = [].concat(...celdas.map((celda) => F.aLineas(celda.text)));
        const lineas = nuevas(campo, propio ? campo : F.norm(etiqueta), originales, propio ? '' : F.norm(etiqueta));
        // Se reparte el texto inventado entre las celdas del bloque en el mismo
        // orden y con las mismas líneas que tenía cada una.
        let n = 0;
        celdas.forEach((celda) => {
          const crudas = String(celda.text).split('\n').filter((l) => l.trim());
          const propias = F.aLineas(celda.text).length;
          celda.text = lineas.slice(n, n + propias)
            .map((l, k) => ((crudas[k] || '').match(PREFIJO_VINETA) || ['', ''])[1] + l).join('\n');
          n += propias;
        });
        tocada = true;
      });
    });
  }
  return tocada;
}

function sanearFicha(ficha, modulo, g) {
  const cabecera = { modulo, titulo: ficha.titulo, num: ficha.num };
  const hechos = {};
  let tocada = sanearTablaFicha(ficha.filas, cabecera, g, hechos);
  const nuevas = (campo, clave, originales, sufijo) => {
    const k = clave + '|' + originales.length;
    if (!hechos[k]) hechos[k] = inventarActividades(g, cabecera, campo, originales.length, originales, sufijo);
    return hechos[k];
  };
  // Se recorren TODOS los campos del modelo y no solo `CAMPOS_DOCENTES`: lo que
  // no se limpia aquí se publica. Los normativos salen del real decreto y se
  // conservan; los demás son material del profesorado, y el que no tiene
  // plantillas propias se reescribe con las del campo al que se parece, igual
  // que en la tabla, para que las dos formas de la ficha digan lo mismo.
  F.CAMPOS_POR_OMISION.forEach((c) => {
    if (!Array.isArray(ficha[c.id]) || !ficha[c.id].length) return;
    const propio = CAMPOS_DOCENTES.indexOf(c.id) >= 0;
    if (!propio && ETIQUETA_NORMATIVA.test(F.norm(c.etiqueta))) return;
    const campo = propio ? c.id : campoParecido(c.etiqueta);
    const clave = propio ? campo : F.norm(c.etiqueta);
    ficha[c.id] = nuevas(campo, clave, ficha[c.id], propio ? '' : F.norm(c.etiqueta)).slice();
    tocada = true;
  });
  return tocada;
}

// Los apartados del módulo que son material docente (ver APARTADOS_DOCENTES). Se
// cambia línea a línea —un párrafo o un elemento de lista cada una— para no
// tocar el número de bloques ni la forma de las listas.
const textoPlano = (t) => (Array.isArray(t)
  ? t.map((r) => (r && typeof r === 'object' ? (r.text || '') : r)).join('')
  : String(t == null ? '' : t));

function sanearApartadosDocentes(datos, g) {
  let n = 0;
  (datos.instancias || []).forEach((inst) => {
    Object.keys(inst.valores || {}).forEach((sec) => {
      const campo = temaDe(sec, APARTADOS_DOCENTES);
      if (!campo) return;
      const sitios = [];
      ((inst.valores[sec] || {}).texto || []).forEach((b) => {
        if (!b || typeof b !== 'object') return;
        if (b.type === 'list') (b.items || []).forEach((it) => { if (textoPlano(it && it.text).trim()) sitios.push(it); });
        else if (textoPlano(b.text).trim()) sitios.push(b);
      });
      if (!sitios.length) return;
      const originales = sitios.map((x) => textoPlano(x.text));
      const lineas = inventarActividades(g, { modulo: inst.titulo, titulo: 'apartado', num: 0 },
        campo, sitios.length, originales, sec);
      sitios.forEach((x, i) => { if (lineas[i]) x.text = lineas[i]; });
      n += 1;
    });
  });
  return n;
}

// Las fichas de un `datos`: objetos `ficha` (uno o una lista) dentro de los
// valores de una instancia.
function sanearFichas(datos, g) {
  let n = 0;
  (datos.instancias || []).forEach((inst) => {
    cadaObjeto(inst.valores, (o) => {
      if (!o.ficha) return;
      (Array.isArray(o.ficha) ? o.ficha : [o.ficha]).forEach((f) => {
        if (f && typeof f === 'object' && sanearFicha(f, inst.titulo, g)) n += 1;
      });
    }, '');
  });
  return n;
}

// Un topónimo detrás de una pista de procedencia: «las poblaciones cercanas de
// X», «limítrofe con X», «procedente de X». Es la única forma de cazar un nombre
// de sitio: por su forma no se distingue de cualquier otra palabra en mayúscula.
//
// No se sustituye solo, se AVISA. Sustituirlo pediría un diccionario de
// topónimos, y un diccionario parcial delata justo lo que oculta: si la lista
// lleva las provincias de alrededor del centro, la lista misma dice dónde está
// el centro. Así que el guardia salta y quien genere el documento lo arregla con
// `opciones.sustituciones`, en lugar de publicarlo sin enterarse.
//
// Las referencias al marco legal —la Generalitat, la Comunitat Valenciana, los
// diarios oficiales— no llevan estas pistas delante y no saltan. Y es lo
// correcto: el decreto del título es valenciano y un documento sin eso no se
// entiende; lo que no puede quedar es de qué pueblos concretos viene el
// alumnado, que es lo que sitúa al centro aunque se le cambie el nombre.
const RE_PROCEDENCIA = /\b(?:poblaciones?\s+(?:cercanas?|pr[oó]ximas?|vecinas?|lim[ií]trofes?)\s+(?:de|a)|lim[ií]trofes?\s+con|procedentes?\s+de)\s+([A-ZÁÉÍÓÚÑ][\wáéíóúñü]{2,}(?:\s*(?:,|y|e)\s*[A-ZÁÉÍÓÚÑ][\wáéíóúñü]{2,})*)/gu;

// `sitios` son los topónimos que quien genera el documento ha declarado como
// inventados en `opciones.sustituciones`. Sin eso la regla no se podría cumplir
// nunca: cualquier sustituto que no fuera el pueblo del centro volvería a saltar.
const esSitioInventado = (x, C, sitios) => {
  const k = claveTexto(x);
  return [C.localidad, C.comarca, C.corto, C.nombre].concat(sitios || [])
    .filter(Boolean)
    .some((y) => { const ky = claveTexto(y); return ky === k || ky.indexOf(k) >= 0 || k.indexOf(ky) >= 0; });
};

// ---------------------------------------------------------------- guardia
function hallazgo(tipo, ruta, texto, ini, largo) {
  return { tipo, ruta, contexto: texto.slice(Math.max(0, ini - 40), ini + largo + 40).replace(/\s+/g, ' ') };
}

// Revisa un `datos` ya saneado y devuelve lo que no debería estar. `contexto`
// puede traer lo recogido del original (personas, centro, localidad, comarca),
// pero casi todas las comprobaciones son por forma y no lo necesitan.
function revisar(datos, contexto) {
  const ctx = contexto || {};
  const C = Object.assign({}, CENTRO, ctx.centro);
  const out = [];
  const vistos = new Set();
  const anotar = (h) => {
    const k = h.tipo + '|' + h.ruta + '|' + h.contexto;
    if (!vistos.has(k)) { vistos.add(k); out.push(h); }
  };
  const reales = ctx.reales || { centros: [], localidades: [], comarcas: [] };
  // El centro, su localidad y su comarca pueden conservarse a propósito (el
  // repositorio es del propio centro). En ese caso no cuentan como resto.
  const permitidos = new Set((ctx.permitirCentro || []).map(claveTexto));
  const esPermitido = (x) => permitidos.has(claveTexto(x));
  const patronesReales = []
    .concat(reales.centros.map((x) => ['centro', x]))
    .concat(reales.localidades.map((x) => ['localidad', x]))
    .concat(reales.comarcas.map((x) => ['comarca', x]))
    .concat((ctx.extras || []).map((x) => ['dato indicado a mano', x]))
    .filter(([, x]) => !esPermitido(x))
    .map(([tipo, x]) => [tipo, new RegExp(conLimites(patronAcento(x)), 'giu')]);
  const bigramas = [];
  (ctx.personas || []).forEach((p) => p.variantes.forEach((v) => {
    const pals = v.split(/[\s,]+/).filter((w) => !CONECTORES.has(F.norm(w)));
    for (let i = 0; i + 1 < pals.length; i += 1) {
      if (pals[i].length >= 3 && pals[i + 1].length >= 3) bigramas.push(new RegExp(conLimites(patronAcento(pals[i]) + '\\s+' + patronAcento(pals[i + 1])), 'giu'));
    }
  }));

  cadaCadena(datos, (s, ruta) => {
    for (const m of s.matchAll(RE_CORREO)) {
      if (!m[0].endsWith('@' + C.dominio)) anotar(hallazgo('correo', ruta, s, m.index, m[0].length));
    }
    for (const m of s.matchAll(RE_TELEFONO)) {
      if (digitosDeTelefono(m[0]).length === 9 && !esTelefonoInventado(m[0])) anotar(hallazgo('teléfono', ruta, s, m.index, m[0].length));
    }
    for (const m of s.matchAll(RE_DOCUMENTO_GUARDIA)) {
      if (!esDocumentoInventado(m[0])) anotar(hallazgo('CIF/NIF', ruta, s, m.index, m[0].length));
    }
    for (const m of s.matchAll(RE_EMPRESA)) {
      if (!esEmpresaInventada(m[1])) anotar(hallazgo('empresa', ruta, s, m.index, m[0].length));
    }
    for (const m of s.matchAll(RE_IES)) {
      if (!valeLugar(m[1]) || esPermitido(m[1])) continue;
      if (claveTexto(m[1]) !== claveTexto(C.corto)) anotar(hallazgo('centro', ruta, s, m.index, m[0].length));
      else if (m[2] && claveTexto(m[2]) !== claveTexto(C.localidad) && !esPermitido(m[2])) anotar(hallazgo('localidad', ruta, s, m.index, m[0].length));
    }
    for (const m of s.matchAll(RE_PROCEDENCIA)) {
      const sitios = String(m[1]).split(/\s*(?:,|\by\b|\be\b)\s*/).filter(Boolean);
      const permitir = (ctx.permitirCentro || []).concat(ctx.sitios || []);
      if (sitios.some((x) => !esSitioInventado(x, C, permitir))) anotar(hallazgo('topónimo', ruta, s, m.index, m[0].length));
    }
    for (const m of s.matchAll(RE_COMARCA)) {
      if (valeLugar(m[1]) && claveTexto(m[1]) !== claveTexto(C.comarca) && !esPermitido(m[1])) anotar(hallazgo('comarca', ruta, s, m.index, m[0].length));
    }
    patronesReales.forEach(([tipo, re]) => { for (const m of s.matchAll(re)) anotar(hallazgo(tipo, ruta, s, m.index, m[0].length)); });
    bigramas.forEach((re) => { for (const m of s.matchAll(re)) anotar(hallazgo('nombre de persona del original', ruta, s, m.index, m[0].length)); });
    if (ctx.personas) {
      cadaMencion(s, ctx.personas, (ini, fin) => anotar(hallazgo('nombre de persona del original', ruta, s, ini, fin - ini)));
    }
  }, '');

  // Por estructura: cualquier valor de una etiqueta de persona que parezca un
  // nombre y no sea de los inventados. No depende de haberlo recogido.
  cadaEtiquetado(datos, (valor, ruta) => {
    const n = valorDeNombre(valor);
    if (n && !esNombreInventado(n)) anotar({ tipo: 'nombre de persona sin sustituir', ruta, contexto: String(valor).slice(0, 100) });
  });

  // Tablas de personas: las iniciales tienen que ser las del nombre inventado de
  // su misma fila. Si no lo son, siguen siendo las del docente real.
  cadaObjeto(datos, (o, ruta) => {
    if (!Array.isArray(o.filas) || !o.filas.length || esCabeceraDeEmpresas(o.filas[0])) return;
    const cab = o.filas.findIndex((f) => Array.isArray(f) && f.some((c, j) => esColumnaDePersona(f, j, ruta)));
    if (cab < 0) return;
    const cols = columnasDePersona(o.filas[cab], ruta);
    if (cols.nombre === undefined || cols.iniciales === undefined) return;
    for (let i = cab + 1; i < o.filas.length; i += 1) {
      const fila = o.filas[i];
      if (!Array.isArray(fila)) continue;
      const cn = fila[cols.nombre];
      const ci = fila[cols.iniciales];
      if (!cn || !ci) continue;
      const nombre = String(cn.text == null ? '' : cn.text).replace(/^[\s\-–—•*·]+/, '').trim();
      const ini = String(ci.text == null ? '' : ci.text).trim();
      if (!nombre || !ini || !esNombreInventado(nombre)) continue;
      if (ini !== inicialesDe(nombre, ini.replace(/\s+/g, '').length)) {
        anotar({ tipo: 'iniciales sin sustituir', ruta: ruta + '.filas', contexto: ini });
      }
    }
  }, '');

  // Tablas de procedencia del alumnado: cada pueblo tiene que ser inventado.
  cadaObjeto(datos, (o, ruta) => {
    if (!esTablaDeProcedencia(o.filas)) return;
    const hayRecuentos = o.filas.slice(1).some((fila) => (fila || []).some((c) => esRecuento(String((c && c.text) || '').trim())));
    if (!hayRecuentos) return; // la tabla se reescribió entera con otro contenido
    o.filas.slice(1).forEach((fila) => (fila || []).forEach((c) => {
      const t = String((c && c.text) || '').trim();
      if (!pareceLugar(t) || esRecuento(t) || NO_ES_LUGAR.has(F.norm(t))) return;
      if (!esPuebloInventado(t, C) && !esSitioInventado(t, C, ctx.sitios)) anotar({ tipo: 'pueblo sin sustituir', ruta: ruta + '.filas', contexto: t });
    }));
  }, '');

  // Tablas de empresas: lo que no sea un nombre o un pueblo inventados.
  cadaObjeto(datos, (o, ruta) => {
    cadaFilaDeEmpresa(o.filas, (fila, col) => {
      const celda = (k) => (col[k] !== undefined && valida(fila[col[k]]) ? String(fila[col[k]].text).trim() : null);
      const e = celda('empresa');
      if (e && !esEmpresaInventada(partirForma(e).nombre)) anotar({ tipo: 'empresa sin sustituir', ruta: ruta + '.filas', contexto: e });
      const p = celda('pueblo');
      if (p && !esPuebloInventado(p, C)) anotar({ tipo: 'pueblo de empresa sin sustituir', ruta: ruta + '.filas', contexto: p });
    });
  }, '');
  return out;
}

// ---------------------------------------------------------------- saneador reutilizable
// Prepara todo lo que decide una sustitución: personas, centro, empresas,
// pueblos, correos, teléfonos y documentos. Lo usan `sanear` (modelo) y
// motor/sanear-docx.js (XML), para que las dos vías tomen las mismas decisiones.
function prepararSaneador(datos, opciones) {
  const O = opciones || {};
  const C = Object.assign({}, CENTRO, O.centro);
  const tablaReescribir = O.reescribir || REESCRIBIR;
  const sustituciones = (O.sustituciones || []).map((s) => [new RegExp(conLimites(patronAcento(s.buscar)), 'giu'), s.por]);

  // Los nombres que ya son de los inventados no se tocan: sanear algo ya saneado
  // no debe repartir otra vez las mismas personas.
  const todos = nombresDe(datos);
  const nombres = todos.filter((n) => !esNombreInventado(n));
  const personas = agruparPersonas(nombres, new Set(todos.filter(esNombreInventado).map(claveTexto)));

  // Lo que ya es del centro inventado no cuenta como real (sanear algo ya
  // saneado), o el guardia lo daría por un resto.
  const real = centroDe(datos);
  const propio = new Set([C.corto, C.localidad, C.comarca].map(claveTexto));
  const realesOriginales = {
    centros: real.centros.filter((x) => !propio.has(claveTexto(x))),
    localidades: real.localidades.filter((x) => !propio.has(claveTexto(x))),
    comarcas: real.comarcas.filter((x) => !propio.has(claveTexto(x))),
  };
  // Con `conservarCentro` el centro, su localidad y su comarca no se sustituyen:
  // el repositorio es del propio centro y lo nombra en su README. La opción
  // contraria sigue disponible para quien quiera un ejemplo anónimo.
  const conservarCentro = !!O.conservarCentro;
  const reales = conservarCentro ? { centros: [], localidades: [], comarcas: [] } : realesOriginales;
  const k = crearContexto(C);

  // Empresas y pueblos: de las tablas con columna «Empresa» y de todo texto que
  // lleve una forma jurídica (S.L., S.A.…). Las que ya son inventadas se dejan.
  const alta = (nombre) => { if (!esEmpresaInventada(nombre)) k.empresa(nombre); };
  cadaObjeto(datos, (o) => {
    cadaFilaDeEmpresa(o.filas, (fila, col) => {
      if (col.empresa !== undefined && valida(fila[col.empresa])) alta(partirForma(fila[col.empresa].text).nombre);
      if (col.pueblo !== undefined && valida(fila[col.pueblo]) && !esPuebloInventado(fila[col.pueblo].text, C)) k.pueblo(fila[col.pueblo].text.trim());
    });
    if (Array.isArray(o.pares)) {
      o.pares.forEach((p) => {
        const e = F.norm(p.etiqueta).replace(/[:.]+$/, '');
        if (COLUMNAS.empresa.test(e) && String(p.valor).trim().length >= 3) alta(partirForma(p.valor).nombre);
      });
    }
  }, '');
  cadaCadena(datos, (s) => { for (const m of s.matchAll(RE_EMPRESA)) alta(m[1]); }, '');

  // Pueblos que no son de empresa: los de las tablas de procedencia del alumnado
  // («Provincia | Localidad | Alumnos») y los de la columna de localidad de las
  // tablas de personas, que las memorias escriben entre paréntesis detrás de la
  // situación administrativa. Sin esto, los recuentos por pueblo y el lugar de
  // residencia del profesorado viajan al ejemplo.
  cadaObjeto(datos, (o, ruta) => {
    if (!Array.isArray(o.filas) || !o.filas.length) return;
    if (esTablaDeProcedencia(o.filas)) {
      o.filas.slice(1).forEach((fila) => (fila || []).forEach((c) => {
        const t = String((c && c.text) || '').trim();
        if (!pareceLugar(t) || esRecuento(t) || NO_ES_LUGAR.has(F.norm(t))) return;
        if (!esPuebloInventado(t, C)) k.pueblo(t);
      }));
      return;
    }
    if (esCabeceraDeEmpresas(o.filas[0])) return;
    const cab = o.filas.findIndex((f) => Array.isArray(f) && f.some((c, j) => esColumnaDePersona(f, j, ruta)));
    if (cab < 0) return;
    const cols = columnasDePersona(o.filas[cab], ruta);
    if (cols.nombre === undefined || cols.localidad === undefined) return;
    for (let i = cab + 1; i < o.filas.length; i += 1) {
      const celda = o.filas[i] && o.filas[i][cols.localidad];
      if (!celda) continue;
      for (const m of String(celda.text || '').matchAll(RE_ENTRE_PARENTESIS)) {
        const sitio = m[1].trim();
        if (sitio.length < 3 || esRecuento(sitio) || NO_ES_LUGAR.has(F.norm(sitio))) continue;
        if (!esPuebloInventado(sitio, C)) k.pueblo(sitio);
      }
    }
  }, '');

  // Los mapas se convierten en un solo patrón por tipo, de lo largo a lo corto.
  const alternar = (mapa) => {
    const lista = [...mapa.values()].map((v) => v.real).filter((r) => r.length >= 3).sort((a, b) => b.length - a.length);
    return lista.length ? new RegExp(conLimites(lista.map(patronAcento).join('|')), 'giu') : null;
  };
  const buscar = (mapa, texto) => { const v = mapa.get(claveTexto(texto)); return v ? v.nuevo : texto; };
  const rEmp = alternar(k.mapas.empresas);
  const rPue = alternar(k.mapas.pueblos);
  const rCentro = patronesDeCentro(reales, C);
  const cuentas = { correos: 0, telefonos: 0, documentos: 0 };

  const limpiar = (s) => {
    let t = s;
    sustituciones.forEach(([re, por]) => { t = t.replace(re, por); });
    rCentro.forEach(([re, f]) => { t = t.replace(re, f); });
    t = sustituirPersonas(t, personas);
    if (rEmp) t = t.replace(rEmp, (m) => buscar(k.mapas.empresas, m));
    if (rPue) t = t.replace(rPue, (m) => buscar(k.mapas.pueblos, m));
    t = t.replace(RE_CORREO, (m) => { if (m.endsWith('@' + C.dominio)) return m; cuentas.correos += 1; return k.correo(m); });
    t = t.replace(RE_TELEFONO, (m) => {
      if (digitosDeTelefono(m).length !== 9 || esTelefonoInventado(m)) return m;
      cuentas.telefonos += 1;
      return k.telefono(m);
    });
    t = t.replace(RE_DOCUMENTO, (m) => { cuentas.documentos += 1; return k.documento(m); });
    return t;
  };

  // Las iniciales de las tablas de personas, calculadas sobre los nombres
  // inventados. Se preparan aquí para que la versión XML pueda cambiar también
  // las siglas sueltas de horarios y cargos.
  const mapaIniciales = new Map();
  const copiaDatos = copia(datos);
  let iniciales = 0;
  cadaObjeto(copiaDatos, (o, ruta) => {
    if (!Array.isArray(o.filas) || !o.filas.length || esCabeceraDeEmpresas(o.filas[0])) return;
    const cab = o.filas.findIndex((f) => Array.isArray(f) && f.some((c, j) => esColumnaDePersona(f, j, ruta)));
    if (cab < 0) return;
    const cols = columnasDePersona(o.filas[cab], ruta);
    if (cols.nombre === undefined || cols.iniciales === undefined) return;
    for (let i = cab + 1; i < o.filas.length; i += 1) {
      const fila = o.filas[i];
      if (!Array.isArray(fila)) continue;
      const cn = fila[cols.nombre];
      const ci = fila[cols.iniciales];
      if (!cn || !ci) continue;
      const real = String(cn.text == null ? '' : cn.text).replace(/^[\s\-–—•*·]+/, '').trim();
      const antes = String(ci.text == null ? '' : ci.text).trim();
      if (!real || !antes) continue;
      const grupo = grupoDePersona(real, personas);
      if (!grupo) continue;
      ci.text = inicialesDe(grupo.inventado, antes.replace(/\s+/g, '').length);
      if (/^\p{Lu}{2,6}$/u.test(antes)) mapaIniciales.set(claveTexto(antes), ci.text);
      iniciales += 1;
    }
  }, '');
  const RE_SIGLA = /(?<![\p{L}\d])\p{Lu}{2,6}(?![\p{L}\d])/gu;
  const cambiarSiglas = (texto) => String(texto == null ? '' : texto)
    .replace(RE_SIGLA, (m) => mapaIniciales.get(claveTexto(m)) || m);

  return {
    C, tablaReescribir, sustituciones, personas, nombres, reales, realesOriginales, conservarCentro,
    mapas: k.mapas, k, limpiar, cuentas, mapaIniciales, cambiarSiglas, iniciales,
    rEmp, rPue, rCentro, buscar,
  };
}

// ---------------------------------------------------------------- sanear
function sanear(datos, opciones) {
  const P = prepararSaneador(datos, opciones);
  const { C, personas, nombres, reales, realesOriginales, k, limpiar, cuentas, mapaIniciales, cambiarSiglas } = P;
  const tablaReescribir = P.tablaReescribir;

  const salida = copia(datos);

  // Tablas de empresas: celda a celda, y el sector se inventa entero.
  let filasDeEmpresa = 0;
  cadaObjeto(salida, (o) => {
    cadaFilaDeEmpresa(o.filas, (fila, col) => {
      filasDeEmpresa += 1;
      if (col.empresa !== undefined && valida(fila[col.empresa])) {
        const { nombre, forma } = partirForma(fila[col.empresa].text);
        if (!esEmpresaInventada(nombre)) fila[col.empresa].text = k.empresa(nombre) + (forma ? ' ' + forma : '');
      }
      if (col.pueblo !== undefined && valida(fila[col.pueblo]) && !esPuebloInventado(fila[col.pueblo].text, C)) fila[col.pueblo].text = k.pueblo(fila[col.pueblo].text.trim());
      if (col.sector !== undefined && valida(fila[col.sector]) && SECTORES.indexOf(fila[col.sector].text) < 0) {
        fila[col.sector].text = SECTORES[hash(fila[col.sector].text) % SECTORES.length];
      }
    });
  }, '');

  // Iniciales de las tablas de personas: se recalculan sobre el nombre inventado
  // que va a quedar en la misma fila. Las iniciales del docente lo identifican
  // aunque su nombre ya esté cambiado. El mapa se prepara una sola vez en
  // `prepararSaneador`; aquí solo se aplica a las celdas del modelo.
  let iniciales = 0;
  cadaObjeto(salida, (o, ruta) => {
    if (!Array.isArray(o.filas) || !o.filas.length || esCabeceraDeEmpresas(o.filas[0])) return;
    const cab = o.filas.findIndex((f) => Array.isArray(f) && f.some((c, j) => esColumnaDePersona(f, j, ruta)));
    if (cab < 0) return;
    const cols = columnasDePersona(o.filas[cab], ruta);
    if (cols.nombre === undefined || cols.iniciales === undefined) return;
    for (let i = cab + 1; i < o.filas.length; i += 1) {
      const fila = o.filas[i];
      if (!Array.isArray(fila)) continue;
      const cn = fila[cols.nombre];
      const ci = fila[cols.iniciales];
      if (!cn || !ci) continue;
      const real = String(cn.text == null ? '' : cn.text).replace(/^[\s\-–—•*·]+/, '').trim();
      const antes = String(ci.text == null ? '' : ci.text).trim();
      if (!real || !antes) continue;
      const grupo = grupoDePersona(real, personas);
      if (!grupo) continue;
      ci.text = inicialesDe(grupo.inventado, antes.replace(/\s+/g, '').length);
      iniciales += 1;
    }
  }, '');

  // Las iniciales también aparecen sueltas en otras tablas de personas (la
  // columna «Profesor» de un horario es solo la sigla, y los cargos van detrás
  // de ella). Se cambian por las de la persona inventada que les toca.
  if (mapaIniciales.size) {
    cadaObjeto(salida, (o, ruta) => {
      if (!Array.isArray(o.filas) || !o.filas.length || esCabeceraDeEmpresas(o.filas[0])) return;
      const cab = o.filas.findIndex((f) => Array.isArray(f) && f.some((c, j) => esColumnaDePersona(f, j, ruta)));
      if (cab < 0) return;
      for (let i = cab + 1; i < o.filas.length; i += 1) {
        const fila = o.filas[i];
        if (!Array.isArray(fila)) continue;
        fila.forEach((c) => { if (c && typeof c.text === 'string') c.text = cambiarSiglas(c.text); });
      }
    }, '');
  }

  const g = crearGenerador();
  const fichas = sanearFichas(salida, g);
  const apartadosDocentes = sanearApartadosDocentes(salida, g);

  // Apartados con valoraciones internas, también sus copias compartidas.
  let reescritos = 0;
  const reescribir = (valores, semilla) => Object.keys(valores || {}).forEach((sec) => {
    const tema = temaDe(sec, tablaReescribir);
    if (!tema) return;
    reescribirValor(valores[sec], tema, semilla + '|' + sec, C, new Set());
    reescritos += 1;
  });
  reescribir(salida.documento, 'doc');
  (salida.instancias || []).forEach((inst) => reescribir(inst.valores, 'mod|' + inst.titulo));
  Object.keys(salida.compartidos || {}).forEach((id) => {
    const c = salida.compartidos[id];
    const tema = c && c.seccion ? temaDe(c.seccion, tablaReescribir) : null;
    if (tema) { reescribirValor(c.bloque, tema, 'comp|' + id, C, new Set()); reescritos += 1; }
  });

  cambiarCadenas(salida, limpiar, '');

  const informe = {
    personas: personas.length,
    variantesDeNombre: nombres.length,
    empresas: k.mapas.empresas.size,
    pueblos: k.mapas.pueblos.size,
    filasDeEmpresa,
    correos: cuentas.correos,
    telefonos: cuentas.telefonos,
    documentos: cuentas.documentos,
    centros: realesOriginales.centros.length,
    fichas,
    apartadosDocentes,
    apartadosReescritos: reescritos,
    iniciales,
  };

  const sustitucionesLocales = (opciones || {}).sustituciones || [];
  const permitirCentro = P.conservarCentro
    ? [].concat(realesOriginales.centros, realesOriginales.localidades, realesOriginales.comarcas)
    : [];
  const hallazgos = revisar(salida, {
    centro: C,
    reales,
    personas,
    extras: sustitucionesLocales.map((s) => s.buscar),
    sitios: sustitucionesLocales.map((s) => s.por),
    permitirCentro,
  });
  return hallazgos.length
    ? { ok: false, datos: null, hallazgos, informe }
    : { ok: true, datos: salida, hallazgos: [], informe };
}

module.exports = {
  sanear, revisar, prepararSaneador,
  nombresDe, agruparPersonas, sustituirPersonas, cadaMencion, centroDe,
  inventarActividades, crearGenerador, inventarTexto, temaDeFicha,
  CENTRO, REESCRIBIR, CAMPOS_DOCENTES, APARTADOS_DOCENTES, campoParecido,
  ETIQUETA_NORMATIVA, inventada, esNombreInventado,
  nombreEnProsa, nombresEnBloques,
  // Para el saneador del .docx: las mismas piezas sobre las celdas del XML.
  sanearFicha, sanearTablaFicha, seConserva, reescribirTabla, temaDe,
  esColumnaDePersona, columnasDePersona, inicialesDe, esCabeceraDeEmpresas,
  // Las usa motor/sanear-docx.js para limpiar la tabla de empresas por columnas,
  // con la misma detección que el camino del modelo.
  cadaFilaDeEmpresa, partirForma, esPuebloInventado, valida,
  grupoDePersona, PREFIJO_VINETA,
  RE_CORREO, RE_TELEFONO, RE_DOCUMENTO, RE_DOCUMENTO_GUARDIA, RE_EMPRESA,
  digitosDeTelefono, esTelefonoInventado, esDocumentoInventado, esEmpresaInventada,
  SECTORES, hash, claveTexto,
};
