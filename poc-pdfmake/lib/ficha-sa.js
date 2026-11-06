// La ficha de una situación de aprendizaje, en los dos sentidos.
//
// El importador saca de cada ficha del Word su cabecera (número, título,
// sesiones, evaluación y los RA que trabaja) y deja el resto como una tabla de
// celdas, que es suficiente para volver a imprimirla pero no para editarla: no
// se sabe qué celda es «criterios de evaluación» y qué celda es «materiales».
//
// Aquí están las dos conversiones que hacen falta para que una SA se pueda ver,
// cambiar y crear desde la aplicación:
//
//   fichaDeFilas(filas)  tabla importada -> modelo con campos con nombre
//   filasDeFicha(ficha)  modelo          -> tabla, la que imprime el PDF
//
// La segunda es la que permite que una SA nueva, que nunca estuvo en un Word,
// salga impresa igual que las importadas.
//
// Las etiquetas son las del documento real del departamento, y la ficha aparece
// en el Word con dos maquetaciones distintas (las etiquetas de actividades en
// una fila cada una, o tres y dos por fila). `fichaDeFilas` admite las dos:
// recorre las filas y, cuando una fila es toda de etiquetas en negrita, toma los
// valores de la fila siguiente columna por columna.

'use strict';

const norm = (s) => String(s == null ? '' : s)
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/\s+/g, ' ').trim();

// Los campos del cuerpo, con la etiqueta exacta del documento. El orden es el
// de la ficha impresa, así que vale también para pintar el formulario.
const CAMPOS = [
  { id: 'ce', etiqueta: 'Criterios de evaluación', ancho: 4 },
  { id: 'competencias', etiqueta: 'Competencias profesionales para la empleabilidad', ancho: 4 },
  { id: 'objetivos', etiqueta: 'Objetivos de aprendizaje', ancho: 4 },
  { id: 'introduccion', etiqueta: 'Introducción', ancho: 2, grupo: 'actividades' },
  { id: 'no_evaluables', etiqueta: 'Formativas no evaluables', ancho: 1, grupo: 'actividades' },
  { id: 'evaluables', etiqueta: 'Formativas evaluables', ancho: 1, grupo: 'actividades' },
  { id: 'refuerzo', etiqueta: 'Actividades de refuerzo', ancho: 2, grupo: 'actividades' },
  { id: 'ampliacion', etiqueta: 'Actividades de ampliación', ancho: 2, grupo: 'actividades' },
  { id: 'recuperacion', etiqueta: 'Actividades de recuperación', ancho: 4, grupo: 'actividades' },
  { id: 'recursos', etiqueta: 'Materiales y recursos didácticos disponibles', ancho: 4 },
];

const CABECERA_ACTIVIDADES = 'Tipificación de actividades formativas';
const POR_ETIQUETA = new Map(CAMPOS.map((c) => [norm(c.etiqueta), c]));
const COLUMNAS = 4;

// Un valor de celda puede traer varias líneas; cada una es un elemento, con las
// viñetas del Word quitadas. Se guarda como lista para poder editar por líneas.
const aLineas = (texto) => String(texto == null ? '' : texto)
  .split('\n')
  .map((l) => l.replace(/^\s*[−–—•*·-]\s*/, '').trim())
  .filter(Boolean);

const deLineas = (v) => (Array.isArray(v) ? v : aLineas(v)).join('\n');

const celda = (text, opts) => Object.assign({
  text: String(text == null ? '' : text), colspan: 1, rowspan: 1, bold: false,
}, opts);

// Los RA que trabaja la SA se leen del texto del resultado de aprendizaje. El
// documento los escribe de tres maneras, y las tres aparecen en la PD de DAW:
//
//   "RA2. Crea bases de datos…"      "1. Reconoce las características…"
//   "RA1 Reconoce los elementos…"    (sin punto: ocho fichas de un módulo)
//
// Con el prefijo "RA" basta el número; sin él se exige un signo detrás, o
// cualquier cifra del texto se tomaría por un resultado de aprendizaje.
const raDeTexto = (texto) => [...String(texto == null ? '' : texto)
  .matchAll(/(?:^|\n)\s*(?:RA\s*(\d+)\b|(\d+)\s*[.):-])/gi)]
  .map((m) => Number(m[1] || m[2]));

// ---------------------------------------------------------------- tabla -> modelo
function fichaDeFilas(filas, cabecera) {
  const f = Array.isArray(filas) ? filas : [];
  const texto = (fila, j) => (fila && fila[j] ? String(fila[j].text == null ? '' : fila[j].text) : '');
  const out = {
    num: null, titulo: '', sesiones: null, evaluacion: '', raTexto: '', ra: [],
    ce: [], competencias: [], objetivos: [],
    introduccion: [], no_evaluables: [], evaluables: [], refuerzo: [], ampliacion: [], recuperacion: [],
    recursos: [],
  };

  // la cabecera: "Situación de aprendizaje 3 | título | Sesiones | 12"
  if (f.length) {
    const n = texto(f[0], 0).match(/(\d+)/);
    out.num = n ? Number(n[1]) : null;
    out.titulo = texto(f[0], 1).trim();
  }

  f.forEach((fila, i) => {
    if (!fila || !fila.length) return;

    // etiquetas con el valor al lado, en la misma fila
    for (let j = 0; j < fila.length - 1; j += 1) {
      const etq = norm(texto(fila, j));
      if (etq === 'sesiones') {
        const m = texto(fila, j + 1).match(/-?\d+(?:[.,]\d+)?/);
        out.sesiones = m ? Number(m[0].replace(',', '.')) : null;
      } else if (etq === 'evaluacion') {
        out.evaluacion = texto(fila, j + 1).trim();
      } else if (etq.startsWith('resultado')) {
        out.raTexto = texto(fila, j + 1).trim();
      }
    }

    // etiquetas con el valor debajo: la fila es toda de etiquetas conocidas
    const etiquetas = fila.map((c) => POR_ETIQUETA.get(norm(c && c.text)));
    if (!etiquetas.length || etiquetas.some((c) => !c)) return;
    const siguiente = f[i + 1] || [];
    etiquetas.forEach((campo, j) => { out[campo.id] = aLineas(texto(siguiente, j)); });
  });

  out.ra = raDeTexto(out.raTexto);

  // la cabecera que el importador ya había deducido manda sobre lo deducido aquí
  if (cabecera) {
    ['num', 'titulo', 'sesiones', 'evaluacion'].forEach((k) => {
      if (cabecera[k] !== undefined && cabecera[k] !== null && cabecera[k] !== '') out[k] = cabecera[k];
    });
    if (Array.isArray(cabecera.ra) && cabecera.ra.length) out.ra = cabecera.ra.slice();
  }
  return out;
}

// ---------------------------------------------------------------- modelo -> tabla
// Se usa la maquetación mayoritaria del documento: las actividades de
// introducción, no evaluables y evaluables en una fila, refuerzo y ampliación en
// otra, y recuperación y materiales a todo lo ancho.
function filasDeFicha(ficha) {
  const s = ficha || {};
  const filas = [];
  const ancho = (v) => (v > 1 ? v : 1);

  filas.push([
    celda('Situación de aprendizaje ' + (s.num == null ? '' : s.num), { rowspan: 2, bold: true }),
    celda(s.titulo, { rowspan: 2, bold: true }),
    celda('Sesiones', { bold: true }),
    celda(s.sesiones == null ? '' : s.sesiones, { bold: true }),
  ]);
  filas.push([celda('Evaluación', { bold: true }), celda(s.evaluacion, { bold: true })]);
  filas.push([
    celda('Resultado(s) de aprendizaje', { bold: true }),
    celda(s.raTexto, { colspan: 3 }),
  ]);

  const bloque = (ids) => {
    const campos = ids.map((id) => CAMPOS.filter((c) => c.id === id)[0]).filter(Boolean);
    filas.push(campos.map((c) => celda(c.etiqueta, { colspan: ancho(c.ancho), bold: true })));
    filas.push(campos.map((c) => celda(deLineas(s[c.id]), { colspan: ancho(c.ancho) })));
  };

  bloque(['ce']);
  bloque(['competencias']);
  bloque(['objetivos']);
  filas.push([celda(CABECERA_ACTIVIDADES, { colspan: COLUMNAS, bold: true })]);
  bloque(['introduccion', 'no_evaluables', 'evaluables']);
  bloque(['refuerzo', 'ampliacion']);
  bloque(['recuperacion']);
  bloque(['recursos']);
  return filas;
}

// Una ficha recién creada, con los campos vacíos pero presentes: el formulario
// se pinta igual con una SA importada y con una nueva.
function fichaVacia(num) {
  const f = fichaDeFilas([]);
  f.num = num == null ? null : Number(num);
  return f;
}

// ¿Tiene cuerpo con nombre, o solo la tabla importada? Lo usa el renderer para
// decidir si imprime `filas` tal cual o las reconstruye desde el modelo.
const esSemantica = (v) => !!v && (CAMPOS.some((c) => Array.isArray(v[c.id]) && v[c.id].length)
  || typeof v.raTexto === 'string');

module.exports = {
  CAMPOS, CABECERA_ACTIVIDADES, COLUMNAS,
  fichaDeFilas, filasDeFicha, fichaVacia, esSemantica,
  aLineas, deLineas, norm, raDeTexto,
};
