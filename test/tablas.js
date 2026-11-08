// Las tablas que se crean en la aplicación: crear una, escribir en ella, quitarla y exportar.
//
//   node test/tablas.js
//
// Hasta aquí una tabla solo existía si venía de un Word: la aplicación sabía imprimirla pero no
// guardarla ni crearla. Lo que se vigila:
//
//   · LA PUERTA. Una rejilla torcida se rechaza con el motivo (qué fila sobra o falta), una tabla
//     vacía se guarda, y la forma de la celda y del par son exactamente las que ya pinta el generador.
//   · EL CATÁLOGO que el editor lee para saber qué puede crear y con qué límites (core/campos.js).
//   · LOS CAMBIOS DE LA PLANTILLA: un apartado que nace con una tabla, un campo añadido a uno que ya
//     existe, y quitarlo sin borrar lo escrito. El id de un campo no cambia ni se reutiliza.
//   · EL CRITERIO DE ACEPTACIÓN: una rejilla de 3x4 con cabecera, escribir en ella y exportar a PDF y
//     a Word, y que la tabla sea la misma que saldría de una importada. Se compara la definición de
//     pdfmake, no los bytes, como en test/ida-y-vuelta.js.
//   · LA PD REAL: las tablas de la programación importada pasan la puerta tal cual las lee el
//     importador, y la poda de campos retirados no cambia su definición (se omite sin el .docx).
//
// El arnés es el de test/estructura.js, copiado y no importado: una prueba que depende de otra se
// rompe cuando alguien toca la otra.

'use strict';

const assert = require('assert/strict');

const { crearRepositorio } = require('../repositorio');
const memoria = require('../repositorio/memoria');
const Arbol = require('../core/arbol');
const Plantilla = require('../core/plantilla');
const Unidades = require('../core/unidades');
const { aFilas } = require('../core/documento');

const CLAVE_GLOBAL = '__pccf_repositorio__';

// ---------------------------------------------------------------- el arnés
let fallos = 0;
const pendientes = [];
const prueba = (nombre, fn) => pendientes.push({ nombre, fn });

function nuevoAlmacen() {
  const adaptador = memoria.crear();
  const repo = crearRepositorio({ adaptador });
  repo.enMemoria = true;
  globalThis[CLAVE_GLOBAL] = repo;
  return repo;
}

const { COOKIE_SESION, abrirSesion } = require('../app/_lib/sesion');
const Apartado = require('../app/_lib/rutas/apartado');
const Estructura = require('../app/_lib/rutas/estructura');
const Arrastre = require('../app/_lib/rutas/arrastre');
const RutaArbol = require('../app/_lib/rutas/arbol');
const Validaciones = require('../app/_lib/rutas/validaciones');
const Pdf = require('../app/_lib/rutas/pdf');
const Docx = require('../app/_lib/rutas/docx');
const JSZip = require('jszip');

// ---------------------------------------------------------------- ayudas

const TESTIGOS = new Map();

function pet(camino, persona, { metodo = 'GET', cuerpo } = {}) {
  const cabeceras = persona ? { cookie: `${COOKIE_SESION}=${TESTIGOS.get(persona._id)}` } : {};
  let cuerpoCrudo;
  if (typeof cuerpo === 'string') {
    cuerpoCrudo = cuerpo;
    cabeceras['content-type'] = 'application/json';
  } else if (cuerpo !== undefined) {
    cuerpoCrudo = JSON.stringify(cuerpo);
    cabeceras['content-type'] = 'application/json';
  }
  return new Request(`http://pruebas.local${camino}`, { method: metodo, headers: cabeceras, body: cuerpoCrudo });
}

// Comprueba que una respuesta es el error que dice docs/api.md: el estado, el código y un mensaje en
// castellano que se pueda enseñar tal cual.
async function esError(respuesta, estado, codigo) {
  assert.equal(respuesta.status, estado, `se esperaba un ${estado} y ha sido un ${respuesta.status}`);
  const cuerpo = await respuesta.json();
  assert.equal(cuerpo.error, codigo);
  assert.equal(typeof cuerpo.mensaje, 'string');
  assert.ok(cuerpo.mensaje.length > 0, 'el error no lleva mensaje');
  return cuerpo;
}

const consultaDe = (seccion, unidad) => `seccion=${encodeURIComponent(seccion)}`
  + (unidad ? `&unidad=${encodeURIComponent(unidad)}` : '');

const leer = (persona, id, seccion, unidad) => Apartado.GET(
  pet(`/api/documentos/${id}/apartado?${consultaDe(seccion, unidad)}`, persona), { id },
);

const guardar = (persona, id, seccion, unidad, cuerpo) => Apartado.PATCH(
  pet(`/api/documentos/${id}/apartado?${consultaDe(seccion, unidad)}`, persona, { metodo: 'PATCH', cuerpo }),
  { id },
);

const arbolDe = (persona, id) => RutaArbol.GET(pet(`/api/documentos/${id}/arbol`, persona), { id });

const validacionesDe = (persona, id) => Validaciones.GET(pet(`/api/documentos/${id}/validaciones`, persona), { id });

const crearSiguiente = (persona, id, cuerpo) => Arrastre.CREAR(
  pet(`/api/documentos/${id}/siguiente-curso`, persona, { metodo: 'POST', cuerpo }), { id },
);

// ---------------------------------------------------------------- las rutas de estructura

const estructuraDe = (persona, id) => Estructura.GET(pet(`/api/documentos/${id}/estructura`, persona), { id });

const anadir = (persona, id, cuerpo) => Estructura.ANADIR(
  pet(`/api/documentos/${id}/estructura/apartado`, persona, { metodo: 'POST', cuerpo: cuerpo === undefined ? {} : cuerpo }),
  { id },
);

const renombrar = (persona, id, seccion, cuerpo) => Estructura.RENOMBRAR(
  pet(`/api/documentos/${id}/estructura/apartado?seccion=${encodeURIComponent(seccion)}`, persona,
    { metodo: 'PATCH', cuerpo: cuerpo === undefined ? {} : cuerpo }),
  { id },
);

const mover = (persona, id, seccion, cuerpo) => Estructura.MOVER(
  pet(`/api/documentos/${id}/estructura/apartado/mover?seccion=${encodeURIComponent(seccion)}`, persona,
    { metodo: 'POST', cuerpo: cuerpo === undefined ? {} : cuerpo }),
  { id },
);

const retirar = (persona, id, seccion, cuerpo) => Estructura.RETIRAR(
  pet(`/api/documentos/${id}/estructura/apartado/retirar?seccion=${encodeURIComponent(seccion)}`, persona,
    { metodo: 'POST', cuerpo: cuerpo === undefined ? {} : cuerpo }),
  { id },
);

const restaurar = (persona, id, seccion, cuerpo) => Estructura.RESTAURAR(
  pet(`/api/documentos/${id}/estructura/apartado/restaurar?seccion=${encodeURIComponent(seccion)}`, persona,
    { metodo: 'POST', cuerpo: cuerpo === undefined ? {} : cuerpo }),
  { id },
);

// Un cambio que tiene que salir bien. Devuelve el cuerpo.
async function cambio(respuesta, estado = 200) {
  assert.equal(respuesta.status, estado, `el cambio debería haber salido bien y ha dado ${respuesta.status}`);
  return respuesta.json();
}

// Escribir lo que el cliente ha leído, igual que en test/edicion.js: lee, y manda la versión con la
// que leyó. Así la prueba no depende de cómo se guarda la versión.
async function escribir(persona, id, seccion, unidad, valores) {
  const antes = await (await leer(persona, id, seccion, unidad)).json();
  return guardar(persona, id, seccion, unidad, { valores, esperaUpdatedAt: antes.updatedAt });
}

// Lo que está guardado de verdad, sin pasar por la ruta.
const guardados = async (repo, id, seccion, unidad = null) => repo.apartados.leer(id, seccion, unidad);

// Una foto de todos los apartados del documento: para comprobar que un cambio de estructura no toca
// ni una fila de contenido, que es lo que hace que no haya datos que migrar.
async function foto(repo, id) {
  const filas = await repo.apartados.listar(id);
  const out = {};
  for (const f of filas) {
    out[`${f.seccion}|${f.unidadId || ''}`] = JSON.stringify({
      valores: f.valores, origen: f.origen, revisadoPor: f.revisadoPor, revisadoEn: f.revisadoEn, updatedAt: f.updatedAt,
    });
  }
  return out;
}

const diferencias = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])]
  .filter((k) => a[k] !== b[k]);

// La misma normalización de test/arrastre.js: `buildDocDefinition` devuelve `header` y `footer` como
// cierres nuevos en cada llamada, y `deepStrictEqual` los compararía por referencia. Se sustituyen
// por su código fuente, y se reconstruyen objetos en lugar de pasar por JSON para no perder las
// claves con valor `undefined`.
function comparable(x) {
  if (typeof x === 'function') return `[función] ${x.toString()}`;
  if (Array.isArray(x)) return x.map(comparable);
  if (x && typeof x === 'object') {
    const out = {};
    for (const k of Object.keys(x)) out[k] = comparable(x[k]);
    return out;
  }
  return x;
}

function nodos(x, salida = []) {
  if (Array.isArray(x)) x.forEach((y) => nodos(y, salida));
  else if (x && typeof x === 'object') {
    salida.push(x);
    Object.keys(x).forEach((k) => nodos(x[k], salida));
  }
  return salida;
}

const definicionDe = async (persona, id, unidad) => {
  const camino = `/api/documentos/${id}/pdf${unidad ? `?unidad=${encodeURIComponent(unidad)}` : ''}`;
  const { definicion, fallo } = await Pdf.definicionDe(pet(camino, persona), { id });
  assert.equal(fallo, undefined, 'el PDF no se puede generar');
  return definicion;
};

// Los encabezados impresos de un estilo, en el orden del tomo. `h1` son los apartados de primer
// nivel, así que la lista dice a la vez el orden y la numeración con la que salen.
//
// Solo los numerados: con el mismo estilo se imprime el título del índice («Índice»), que no es un
// apartado del documento.
const encabezados = (definicion, estilo) => nodos(definicion)
  .filter((n) => n.style === estilo && typeof n.text === 'string' && /^\d/.test(n.text))
  .map((n) => n.text);

// Si un texto sale impreso en el tomo. Se busca sobre la definición entera porque un párrafo puede
// estar dentro de una lista, de una tabla o de un tramo con formato.
const impreso = (definicion, texto) => JSON.stringify(definicion).includes(texto);

// ================================================================ el documento de partida
//
// Es el de test/arrastre.js con los ONCE módulos de DAW del catálogo, porque la mitad del E6 que hay
// que vigilar es justo esa: un apartado de módulo es de la plantilla, así que un cambio sale en los
// once a la vez. Los títulos son los del catálogo (core/unidades.js) para que el arrastre al curso
// siguiente no cambie ninguno y la definición del curso nuevo sea la del anterior salvo el curso.

const campoTexto = { id: 'texto', tipo: 'texto_largo', etiqueta: 'Texto' };
const c = (text, opts) => Object.assign({ text, colspan: 1, rowspan: 1, bold: false }, opts);

const TABLA_NORMATIVA = [
  [c('Ámbito', { bold: true }), c('Norma', { bold: true })],
  [c('Estatal'), c('RD 1147/2011')],
];

// Los criterios suman 90 y el RA pondera 100: un error de verdad, para que el panel de
// comprobaciones tenga algo que decir en cada módulo y se pueda ver qué pasa al retirar el apartado.
const PONDERACIONES = [
  { ra: 1, texto: 'Reconoce las características de los lenguajes de marcas.', ponderacion: 100, ce: [
    { letra: 'a', texto: 'Se han identificado las etiquetas.', ponderacion: 40, fundamental: true },
    { letra: 'b', texto: 'Se ha reconocido la jerarquía.', ponderacion: 50, fundamental: false },
  ] },
];

const PLANTILLA = {
  tipo: 'programacion_didactica',
  origen: 'PD_sintetica.docx',
  version: null,
  generada: '2026-01-01T00:00:00.000Z',
  secciones: [
    { id: 'introduccion', titulo: 'Introducción', nivel: 1, edita: 'jefe_departamento', presencia: 1,
      campos: [campoTexto, { id: 'tabla_normativa', tipo: 'tabla', etiqueta: 'Normativa aplicable' }],
      hijos: [
        { id: 'introduccion/contextualizacion', titulo: 'Contextualización', nivel: 2, presencia: 1,
          campos: [campoTexto], hijos: [] },
      ] },
    { id: 'atencion-a-la-diversidad', titulo: 'Atención a la diversidad', nivel: 1,
      edita: 'jefe_departamento', presencia: 1, campos: [campoTexto], hijos: [] },
    { id: 'anexos', titulo: 'Anexos', nivel: 1, edita: 'jefe_departamento', presencia: 1,
      campos: [], hijos: [
        { id: 'anexos/actas', titulo: 'Actas', nivel: 2, presencia: 1, campos: [campoTexto], hijos: [] },
      ] },
    { id: 'modulos', titulo: 'Módulos', nivel: 1, instancias: true, etiqueta_instancia: 'módulo',
      grupos: ['Módulos del primer curso'], edita: 'docentes_del_modulo', presencia: 2, campos: [],
      hijos: [
        { id: 'modulos/metodologia', titulo: 'Metodología', nivel: 3, presencia: 2,
          campos: [campoTexto], hijos: [] },
        { id: 'modulos/ponderaciones', titulo: 'Ponderaciones', nivel: 3, presencia: 2,
          campos: [{ id: 'ponderaciones', tipo: 'ponderacion_ra_ce', etiqueta: 'Ponderaciones', multiple: true }],
          hijos: [] },
        { id: 'modulos/situaciones-de-aprendizaje', titulo: 'Situaciones de aprendizaje', nivel: 3,
          presencia: 2, campos: [], hijos: [
            { id: 'modulos/situaciones-de-aprendizaje/situacion', titulo: 'Situación de aprendizaje',
              nivel: 4, repetidor: true, presencia: 2,
              campos: [{ id: 'titulo', tipo: 'texto', etiqueta: 'Título' }, campoTexto], hijos: [] },
          ] },
      ] },
  ],
};

// Los once módulos de DAW, en el orden del catálogo. `daw-0485` (Programación) es el de Ana.
// `deCiclo` pide además el curso del ciclo, y aquí hacen falta los dos cursos.
const MODULOS = Unidades.UNIDADES.filter((u) => u.ciclo === 'daw').map((u) => u.id);
const PROG = 'daw-0485';

const valoresDelModulo = (marca) => ({
  'modulos/metodologia': { texto: [{ type: 'p', text: `Metodología de ${marca}.` }] },
  'modulos/ponderaciones': { ponderaciones: PONDERACIONES },
  'modulos/situaciones-de-aprendizaje/situacion': { items: [
    { titulo: `Primera SA de ${marca}`, texto: [{ type: 'p', text: 'Prueba inicial.' }] },
  ] },
});

const OPCIONES = {
  curso: '2026-27', ciclo: 'daw', departamento: 'informatica', origenApartados: 'nuevo',
  // Los títulos del documento son los del catálogo, así que conciliar es buscarlos por título.
  conciliar: (titulo) => MODULOS.find((id) => Unidades.tituloDe(id, '2026-27') === titulo),
};

const datosDe = (u) => ({
  departamento: 'informatica',
  documento: {
    introduccion: {
      texto: [{ type: 'p', text: 'Esta programación la escribe el departamento de Informática.' }],
      tabla_normativa: { filas: TABLA_NORMATIVA },
    },
    'atencion-a-la-diversidad': { texto: [{ type: 'p', text: 'Medidas de nivel II y III.' }] },
    // 'introduccion/contextualizacion' y 'anexos/actas' no están: nadie las ha escrito todavía.
  },
  instancias: MODULOS.map((id) => ({
    titulo: Unidades.tituloDe(id, '2026-27'),
    num: null,
    grupo: 'Módulos del primer curso',
    // Solo Programación tiene docente: es lo que distingue lo que Ana puede escribir de lo que no.
    docentes: id === PROG ? [u.ana._id] : [],
    valores: valoresDelModulo(Unidades.tituloDe(id, '2026-27')),
  })),
  asignaciones: { 'atencion-a-la-diversidad': [u.luis._id] },
  compartidos: {},
});

async function sembrar(repo, filas) {
  const doc = await repo.documentos.crear(filas.documento);
  if (filas.unidades.length) await repo.unidades.crearMuchos(doc._id, filas.unidades);
  if (filas.apartados.length) await repo.apartados.crearMuchos(doc._id, filas.apartados);
  if (filas.compartidos.length) await repo.compartidos.crearMuchos(doc._id, filas.compartidos);
  return doc;
}

// Una persona por cada caso, con sesión abierta de verdad. Los correos son `.invalid`, reservados.
async function escenario() {
  const repo = nuevoAlmacen();
  const persona = async (nombre, email, rol, departamento) => {
    const p = await repo.usuarios.crear({ nombre, email, rol, departamento });
    const { testigo } = await abrirSesion(repo, p._id);
    TESTIGOS.set(p._id, testigo);
    return p;
  };

  const u = {
    admin: await persona('Soporte', 'soporte@ejemplo.invalid', 'admin', 'informatica'),
    jefa: await persona('Jefatura del departamento', 'jefatura@ejemplo.invalid', 'jefe_departamento', 'informatica'),
    ana: await persona('Ana', 'ana@ejemplo.invalid', 'docente', 'informatica'),
    luis: await persona('Luis', 'luis@ejemplo.invalid', 'docente', 'informatica'),
    estudios: await persona('Jefatura de estudios', 'estudios@ejemplo.invalid', 'jefe_estudios', 'direccion'),
    pepe: await persona('Pepe', 'pepe@ejemplo.invalid', 'docente', 'matematicas'),
  };

  const doc = await sembrar(repo, aFilas({ plantilla: PLANTILLA, datos: datosDe(u) }, OPCIONES));

  const otro = await sembrar(repo, aFilas({
    plantilla: { ...PLANTILLA, origen: 'PD_matematicas.docx' },
    datos: { departamento: 'matematicas', documento: { introduccion: { texto: [] } }, instancias: [], asignaciones: {}, compartidos: {} },
  }, { curso: '2026-27', departamento: 'matematicas' }));

  return { repo, u, doc, otro };
}

// Los nodos del árbol tal como los recibe el navegador.
const nodosDe = async (persona, id) => Arbol.aplanar((await (await arbolDe(persona, id)).json()).arbol);

// Los apartados de primer nivel del árbol, en orden: es lo que se mira al mover.
const raizDelArbol = async (persona, id) => (await (await arbolDe(persona, id)).json()).arbol.hijos.map((n) => n.seccion);

// El curso siguiente, creado por la jefatura. Devuelve su id.
async function cursoNuevo(u, doc, cuerpo) {
  const res = await crearSiguiente(u.jefa, doc._id, cuerpo);
  assert.equal(res.status, 201, 'la jefatura debería poder crear el curso siguiente');
  return (await res.json()).documento._id;
}

// ================================================================ ayudas de esta suite

const Est = require('../core/estructurados');
const Campos = require('../core/campos');
const { buildDocDefinition } = require('../motor/render-generico');

const ancho = (n) => Array.from({ length: n }, (_, j) => c(`c${j + 1}`));
const cab = (n) => Array.from({ length: n }, (_, j) => c(`Columna ${j + 1}`, { bold: true }));
const CAMPO_TABLA = { id: 't', tipo: 'tabla', etiqueta: 'Tabla' };
const CAMPO_KV = { id: 'k', tipo: 'tabla_clave_valor', etiqueta: 'Datos' };

const campoDe = async (persona, id, seccion, idCampo) => {
  const a = await (await leer(persona, id, seccion, null)).json();
  return a.campos.find((x) => x.id === idCampo);
};

const anadirCampo = (persona, id, seccion, cuerpo) => Estructura.ANADIR_CAMPO(
  pet(`/api/documentos/${id}/estructura/apartado/campo?seccion=${encodeURIComponent(seccion)}`, persona,
    { metodo: 'POST', cuerpo: cuerpo === undefined ? {} : cuerpo }),
  { id },
);
const retirarCampo = (persona, id, seccion, campo, cuerpo) => Estructura.RETIRAR_CAMPO(
  pet(`/api/documentos/${id}/estructura/apartado/campo/retirar?seccion=${encodeURIComponent(seccion)}&campo=${encodeURIComponent(campo)}`, persona,
    { metodo: 'POST', cuerpo: cuerpo === undefined ? {} : cuerpo }),
  { id },
);
const restaurarCampo = (persona, id, seccion, campo, cuerpo) => Estructura.RESTAURAR_CAMPO(
  pet(`/api/documentos/${id}/estructura/apartado/campo/restaurar?seccion=${encodeURIComponent(seccion)}&campo=${encodeURIComponent(campo)}`, persona,
    { metodo: 'POST', cuerpo: cuerpo === undefined ? {} : cuerpo }),
  { id },
);

// Las tablas pdfmake de una definición, las del tomo entero.
const tablasDe = (definicion) => nodos(definicion).filter((n) => n.table && n.table.body);
// El texto plano de la primera fila de una tabla pdfmake.
const textosDe = (t) => t.table.body.map((f) => f.map((x) => (x && x.text !== undefined ? String(x.text) : '')));

// ================================================================ 1. la puerta de la rejilla

prueba('una rejilla bien formada se guarda, con y sin combinaciones', () => {
  const lisa = { filas: [cab(3), ancho(3), ancho(3)] };
  assert.equal(Est.motivoDeCampo(CAMPO_TABLA, lisa), null);

  // Una combinación horizontal y otra vertical que cuadran: 3 columnas en todas las filas.
  const combinada = { filas: [
    [c('Título', { colspan: 3, bold: true })],
    [c('a', { rowspan: 2 }), c('b'), c('c')],
    [c('d'), c('e')],
  ] };
  assert.equal(Est.motivoDeCampo(CAMPO_TABLA, combinada), null);
});

prueba('una rejilla torcida se rechaza y el motivo dice qué fila sobra o falta', () => {
  const corta = Est.motivoDeCampo(CAMPO_TABLA, { filas: [ancho(4), ancho(3)] });
  assert.ok(/fila 2/.test(corta) && /más corta/.test(corta) && /le falta 1 celda/.test(corta), corta);

  const larga = Est.motivoDeCampo(CAMPO_TABLA, { filas: [ancho(2), ancho(2), ancho(4)] });
  assert.ok(/fila 3/.test(larga) && /más ancha/.test(larga) && /le sobran 2 celdas/.test(larga), larga);

  // Un rowspan que se sale por abajo inventaría filas en el PDF.
  const pasa = Est.motivoDeCampo(CAMPO_TABLA, { filas: [[c('a', { rowspan: 3 }), c('b')], [c('c')]] });
  assert.ok(/celda 1 de la fila 1/.test(pasa) && /hacia abajo/.test(pasa), pasa);

  // Dos combinaciones sobre la misma casilla.
  const pisa = Est.motivoDeCampo(CAMPO_TABLA, { filas: [[c('a', { rowspan: 2 }), c('b')], [c('c', { colspan: 2 })]] });
  assert.ok(/fila 2/.test(pisa), pisa);

  // La fila que parece completa pero cuenta mal por una combinación de arriba.
  const mal = Est.motivoDeCampo(CAMPO_TABLA, { filas: [[c('a', { rowspan: 2 }), c('b')], [c('c'), c('d')]] });
  assert.ok(/fila 2/.test(mal) && /más ancha/.test(mal), mal);
});

prueba('la forma de la celda es la del importador y ninguna clave más', () => {
  assert.ok(/no existe en una celda/.test(Est.motivoDeCampo(CAMPO_TABLA, { filas: [[{ text: 'a', color: 'red' }]] })));
  assert.ok(/«text»/.test(Est.motivoDeCampo(CAMPO_TABLA, { filas: [[{ colspan: 1 }]] })));
  assert.ok(/colspan/.test(Est.motivoDeCampo(CAMPO_TABLA, { filas: [[{ text: 'a', colspan: 0 }]] })));
  assert.ok(/solo «filas»/.test(Est.motivoDeCampo(CAMPO_TABLA, { filas: [], anchos: [1] })));
  assert.ok(/lista de filas/.test(Est.motivoDeCampo(CAMPO_TABLA, { filas: 'no' })));
  assert.ok(/marca del procesador/.test(Est.motivoDeCampo(CAMPO_TABLA, { filas: [[{ text: 'a<o:p></o:p>' }]] })));
  assert.ok(/máximo son 12/.test(Est.motivoDeCampo(CAMPO_TABLA, { filas: [ancho(13)] })));
  assert.ok(/no es una tabla/.test(Est.motivoDeCampo(CAMPO_TABLA, null)));
});

prueba('una tabla importada que ya venía torcida se corrige celda a celda, pero no se cambia de forma', () => {
  // Como las de la propuesta pedagógica de ESO: un rowspan que se pasa del final.
  const guardada = { filas: [[c('Saberes', { rowspan: 4 }), c('a')], [c('b')]] };
  assert.ok(Est.motivoDeCampo(CAMPO_TABLA, guardada), 'sin lo guardado, la tabla torcida no vale');
  const corregida = { filas: [[c('Saberes básicos', { rowspan: 4 }), c('a')], [c('b')]] };
  assert.equal(Est.motivoDeCampo(CAMPO_TABLA, corregida, { guardado: guardada }), null, 'una errata en una celda no puede bloquearse');
  const otraForma = { filas: [[c('Saberes', { rowspan: 4 }), c('a')], [c('b')], [c('c')]] };
  assert.ok(Est.motivoDeCampo(CAMPO_TABLA, otraForma, { guardado: guardada }), 'si cambia la forma se exige entera');
  // Y con una tabla ancha como las del PCCF (17 columnas).
  const ancha = { filas: [ancho(17), ancho(17)] };
  assert.equal(Est.motivoDeCampo(CAMPO_TABLA, ancha, { guardado: ancha }), null);
  assert.ok(/máximo son 12/.test(Est.motivoDeCampo(CAMPO_TABLA, { filas: [ancho(17), ancho(17), ancho(17)] }, { guardado: ancha })));
});

prueba('una tabla vacía se guarda, y un campo multiple pide una lista', () => {
  assert.equal(Est.motivoDeCampo(CAMPO_TABLA, { filas: [] }), null);
  assert.equal(Est.motivoDeCampo(CAMPO_KV, { pares: [] }), null);
  assert.ok(/lista de tablas/.test(Est.motivoDeCampo(CAMPO_TABLA, [{ filas: [] }])));
  const multiple = { ...CAMPO_TABLA, multiple: true };
  assert.equal(Est.motivoDeCampo(multiple, [{ filas: [ancho(2)] }, { filas: [] }]), null);
  assert.ok(/tabla 2/.test(Est.motivoDeCampo(multiple, [{ filas: [ancho(2)] }, { filas: [ancho(2), ancho(1)] }])));
});

prueba('la cabecera de una tabla creada es la negrita de su primera fila, y no se exige nada más', () => {
  const hecho = Campos.crearCampo({ tipo: 'tabla', filas: 3, columnas: 4, cabecera: true }, []);
  // Quitar la cabecera es quitar la negrita: se guarda aunque el campo lleve `columnas`.
  assert.equal(Est.motivoDeCampo(hecho.campo, { filas: [ancho(4), ancho(4), ancho(4)] }), null);
  assert.equal(Est.motivoDeCampo(hecho.campo, Campos.valorInicial(hecho.campo)), null);
  // Y una importada con `columnas` y sin negrita (hay dos en la PD real) tampoco se toca.
  assert.equal(Est.motivoDeCampo({ ...CAMPO_TABLA, columnas: ['a', 'b'] }, { filas: [ancho(2)] }), null);
  // El PDF de una creada y el de una importada con `columnas` ya no coinciden en una cosa: la
  // creada no fuerza la cabecera, la decide la negrita; la importada sigue como estaba.
  const definicion = (campo, filas) => buildDocDefinition({
    plantilla: { tipo: 'programacion_didactica', secciones: [{ id: 'x', titulo: 'X', nivel: 1, campos: [campo], hijos: [] }] },
    datos: { departamento: 'informatica', documento: { x: { [campo.id]: { filas } } }, instancias: [], asignaciones: {}, compartidos: {} },
    instancias: [], titulo: 'T', subtitulo: 'S',
  });
  const cabeceras = (campo, filas) => nodos(definicion(campo, filas)).filter((n) => n.table && n.table.body).map((t) => t.table.headerRows);
  assert.deepEqual(cabeceras(hecho.campo, [ancho(4), ancho(4)]), [0], 'creada, primera fila sin negrita: sin cabecera');
  assert.deepEqual(cabeceras(hecho.campo, [cab(4), ancho(4)]), [1]);
  assert.deepEqual(cabeceras({ ...CAMPO_TABLA, columnas: ['a', 'b', 'c', 'd'] }, [ancho(4), ancho(4)]), [1], 'importada con columnas: cabecera forzada, como siempre');
});

prueba('clave y valor: pares con etiqueta y valor, y la tabla importada solo si no hay pares', () => {
  const buenos = { pares: [{ etiqueta: 'Módulo', valor: 'Programación' }, { etiqueta: '', valor: '' }] };
  assert.equal(Est.motivoDeCampo(CAMPO_KV, buenos), null);
  assert.ok(/no existe en una fila/.test(Est.motivoDeCampo(CAMPO_KV, { pares: [{ etiqueta: 'a', valor: 'b', x: 1 }] })));
  assert.ok(/«valor»/.test(Est.motivoDeCampo(CAMPO_KV, { pares: [{ etiqueta: 'a' }] })));
  assert.ok(/solo «pares»/.test(Est.motivoDeCampo(CAMPO_KV, { pares: [], otra: 1 })));

  // Lo que deja el importador: pares y filas a la vez. Se rechaza con el motivo, y `sinFilas` lo arregla.
  const importada = { pares: [{ etiqueta: 'a', valor: 'b' }], filas: [[c('a', { bold: true }), c('b')]] };
  assert.ok(/a la vez «pares» y «filas»/.test(Est.motivoDeCampo(CAMPO_KV, importada)));
  assert.equal(Est.motivoDeCampo(CAMPO_KV, Campos.sinFilas(importada)), null);
  // Sin pares, las filas importadas se aceptan: así se importan las que el lector no supo leer.
  assert.equal(Est.motivoDeCampo(CAMPO_KV, { filas: [[c('a'), c('b')]] }), null);
});

// ================================================================ 2. el catálogo

prueba('el catálogo dice qué se puede crear, con nombre en castellano y parámetros con límites', () => {
  const cat = Campos.catalogo();
  assert.deepEqual(cat.map((d) => d.tipo), ['texto_largo', 'tabla', 'tabla_clave_valor']);
  assert.deepEqual(cat.map((d) => d.nombre), ['Texto', 'Tabla', 'Clave y valor']);
  const tabla = cat.find((d) => d.tipo === 'tabla');
  const filas = tabla.parametros.find((p) => p.id === 'filas');
  assert.deepEqual([filas.minimo, filas.maximo, filas.defecto], [1, 50, 3]);
  assert.equal(tabla.parametros.find((p) => p.id === 'columnas').maximo, Est.MAX_COLUMNAS,
    'los límites del catálogo son los de la puerta');
  assert.ok(tabla.valor.forma.includes('filas') && tabla.valor.celda.includes('bold'));
  // Se puede mandar tal cual por JSON.
  assert.deepEqual(JSON.parse(JSON.stringify(cat)), cat);
});

prueba('crear un campo: parámetros fuera de rango, claves de más y tipos que no se crean', () => {
  assert.ok(Campos.crearCampo({ tipo: 'tabla', filas: 0 }, []).motivo.includes('Filas'));
  assert.ok(Campos.crearCampo({ tipo: 'tabla', columnas: 13 }, []).motivo.includes('Columnas'));
  assert.ok(Campos.crearCampo({ tipo: 'tabla', cabecera: 'si' }, []).motivo.includes('verdadero o falso'));
  assert.ok(/no lleva «pares»/.test(Campos.crearCampo({ tipo: 'tabla', pares: 2 }, []).motivo));
  assert.ok(/no es un tipo de campo que se pueda crear/.test(Campos.crearCampo({ tipo: 'ficha_situacion_aprendizaje' }, []).motivo));
  assert.ok(Campos.crearCampo(null, []).motivo);
});

prueba('el id de un campo sale de su etiqueta, no se repite y no usa el reservado', () => {
  assert.equal(Campos.crearCampo({ tipo: 'tabla', etiqueta: 'Tabla de evaluación' }, []).campo.id, 'tabla-de-evaluacion');
  assert.equal(Campos.crearCampo({ tipo: 'tabla' }, ['tabla']).campo.id, 'tabla-2');
  assert.equal(Campos.crearCampo({ tipo: 'tabla', etiqueta: 'Items' }, ['items']).campo.id, 'items-2');
  assert.equal(Campos.crearCampo({ tipo: 'tabla', etiqueta: '¡¡¡' }, []).campo.id, 'tabla');
});

prueba('el valor inicial pasa la puerta y tiene la forma exacta de las celdas del importador', () => {
  const t = Campos.crearCampo({ tipo: 'tabla', filas: 3, columnas: 4, cabecera: true }, []).campo;
  const v = Campos.valorInicial(t);
  assert.equal(v.filas.length, 3);
  assert.deepEqual(v.filas[0][0], { text: 'Columna 1', colspan: 1, rowspan: 1, bold: true });
  assert.deepEqual(v.filas[1][3], { text: '', colspan: 1, rowspan: 1, bold: false });
  assert.equal(Est.motivoDeCampo(t, v), null);

  const sin = Campos.crearCampo({ tipo: 'tabla', filas: 2, columnas: 2, cabecera: false }, []).campo;
  assert.equal(sin.columnas, null, 'sin cabecera, `columnas` es null como en el importador');
  assert.ok(Campos.valorInicial(sin).filas.every((f) => f.every((x) => x.bold === false)));

  const k = Campos.crearCampo({ tipo: 'tabla_clave_valor', pares: 4 }, []).campo;
  assert.equal(Campos.valorInicial(k).pares.length, 4);
  assert.equal(Est.motivoDeCampo(k, Campos.valorInicial(k)), null);
  assert.deepEqual(Campos.valorInicial(CAMPO_TABLA), { filas: [] }, 'un campo importado se abre vacío');
});

// ================================================================ 3. los cambios de la plantilla

prueba('un apartado puede nacer con una tabla, y sin pedir campos nace con el de texto de siempre', () => {
  const base = { secciones: [] };
  const sin = Plantilla.aplicar(base, { tipo: 'anadir', titulo: 'Uno' });
  assert.deepEqual(sin.plantilla.secciones[0].campos, [Plantilla.CAMPO_NUEVO]);

  const con = Plantilla.aplicar(base, { tipo: 'anadir', titulo: 'Dos', campos: [{ tipo: 'tabla', filas: 3, columnas: 4 }, { tipo: 'texto_largo' }] });
  assert.deepEqual(con.plantilla.secciones[0].campos.map((x) => [x.id, x.tipo]), [['tabla', 'tabla'], ['texto', 'texto_largo']]);
  assert.equal(con.cambio.tipo, 'anadido');

  assert.ok(Plantilla.aplicar(base, { tipo: 'anadir', titulo: 'Tres', campos: [] }).motivo);
  assert.ok(/El campo 2/.test(Plantilla.aplicar(base, { tipo: 'anadir', titulo: 'Tres', campos: [{ tipo: 'texto_largo' }, { tipo: 'rara' }] }).motivo));
  assert.ok(Plantilla.aplicar(base, { tipo: 'anadir', titulo: 'Tres', campos: Array(11).fill({ tipo: 'texto_largo' }) }).motivo);
});

prueba('añadir un campo a un apartado: va al final, su id no choca con los retirados y no se toca al renombrar', () => {
  let p = Plantilla.aplicar({ secciones: [] }, { tipo: 'anadir', titulo: 'Anexos' }).plantilla;
  let r = Plantilla.aplicar(p, { tipo: 'anadir_campo', seccion: 'anexos', campo: { tipo: 'tabla' } });
  assert.deepEqual(r.plantilla.secciones[0].campos.map((x) => x.id), ['texto', 'tabla']);
  assert.equal(r.cambio.tipo, 'campo_anadido');
  assert.equal(r.cambio.campo, 'tabla');
  p = r.plantilla;

  p = Plantilla.aplicar(p, { tipo: 'retirar_campo', seccion: 'anexos', campo: 'tabla' }).plantilla;
  r = Plantilla.aplicar(p, { tipo: 'anadir_campo', seccion: 'anexos', campo: { tipo: 'tabla' } });
  assert.equal(r.campos[0].id, 'tabla-2', 'el id de un campo retirado no se reutiliza: va a volver con su contenido');

  const renombrado = Plantilla.aplicar(r.plantilla, { tipo: 'renombrar', seccion: 'anexos', titulo: 'Otro nombre' }).plantilla;
  assert.deepEqual(renombrado.secciones[0].campos.map((x) => x.id), ['texto', 'tabla', 'tabla-2']);
});

prueba('retirar un campo no lo borra: sale de lo vigente y vuelve al restaurarlo', () => {
  let p = Plantilla.aplicar({ secciones: [] }, { tipo: 'anadir', titulo: 'Anexos', campos: [{ tipo: 'texto_largo' }, { tipo: 'tabla' }] }).plantilla;
  const r = Plantilla.aplicar(p, { tipo: 'retirar_campo', seccion: 'anexos', campo: 'tabla' });
  assert.equal(r.cambio.tipo, 'campo_retirado');
  assert.equal(r.plantilla.secciones[0].campos.length, 2, 'se queda en la plantilla');
  assert.deepEqual(Plantilla.vigente(r.plantilla).secciones[0].campos.map((x) => x.id), ['texto']);
  assert.deepEqual(Plantilla.camposRetirados(r.plantilla).map((x) => x.campo), ['tabla']);
  assert.ok(/ya está retirado/.test(Plantilla.aplicar(r.plantilla, { tipo: 'retirar_campo', seccion: 'anexos', campo: 'tabla' }).motivo));

  const v = Plantilla.aplicar(r.plantilla, { tipo: 'restaurar_campo', seccion: 'anexos', campo: 'tabla' });
  assert.equal(v.cambio.tipo, 'campo_restaurado');
  assert.deepEqual(Plantilla.vigente(v.plantilla).secciones[0].campos.map((x) => x.id), ['texto', 'tabla']);
  assert.ok(/no está retirado/.test(Plantilla.aplicar(v.plantilla, { tipo: 'restaurar_campo', seccion: 'anexos', campo: 'tabla' }).motivo));
});

prueba('no se cambian los campos de una lista de fichas, ni se quitan los que no se pueden crear', () => {
  const p = { secciones: [
    { id: 'sa', titulo: 'SA', repetidor: true, campos: [{ id: 'titulo', tipo: 'texto' }], hijos: [] },
    { id: 'ra', titulo: 'RA', campos: [{ id: 'pond', tipo: 'ponderacion_ra_ce' }, { id: 't', tipo: 'tabla' }], hijos: [] },
  ] };
  assert.ok(/lista de fichas/.test(Plantilla.aplicar(p, { tipo: 'anadir_campo', seccion: 'sa', campo: { tipo: 'tabla' } }).motivo));
  assert.ok(/lista de fichas/.test(Plantilla.aplicar(p, { tipo: 'retirar_campo', seccion: 'sa', campo: 'titulo' }).motivo));
  assert.ok(/no se puede quitar desde aquí/.test(Plantilla.aplicar(p, { tipo: 'retirar_campo', seccion: 'ra', campo: 'pond' }).motivo));
  assert.ok(/ningún campo «nada»/.test(Plantilla.aplicar(p, { tipo: 'retirar_campo', seccion: 'ra', campo: 'nada' }).motivo));
  const fila = Plantilla.estructura(p).find((x) => x.seccion === 'ra');
  assert.deepEqual(fila.campos.map((x) => [x.id, x.puedeRetirar]), [['pond', false], ['t', true]]);
  assert.equal(fila.puedeAnadirCampo, true);
  assert.equal(Plantilla.estructura(p).find((x) => x.seccion === 'sa').puedeAnadirCampo, false);
});

// ================================================================ 4. las rutas

prueba('el GET de la estructura da al editor los tipos de campo, sus límites y los campos de cada apartado', async () => {
  const { u, doc } = await escenario();
  const e = await (await estructuraDe(u.jefa, doc._id)).json();
  assert.deepEqual(e.tiposDeCampo.map((d) => d.nombre), ['Texto', 'Tabla', 'Clave y valor']);
  assert.equal(e.limites.camposPorApartado, Plantilla.MAX_CAMPOS);
  assert.deepEqual(e.camposRetirados, []);
  const intro = e.apartados.find((x) => x.seccion === 'introduccion');
  assert.deepEqual(intro.campos.map((x) => [x.id, x.tipo, x.puedeRetirar]), [['texto', 'texto_largo', true], ['tabla_normativa', 'tabla', true]]);
  assert.equal(intro.puedeAnadirCampo, true);
  assert.equal(e.apartados.find((x) => x.seccion === 'modulos/situaciones-de-aprendizaje/situacion').puedeAnadirCampo, false);
});

prueba('crear un apartado con una rejilla 3x4 con cabecera, escribir y exportar: PDF y Word', async () => {
  const { repo, u, doc } = await escenario();
  const hecho = await cambio(await anadir(u.jefa, doc._id, {
    titulo: 'Calendario de pruebas',
    campos: [{ tipo: 'tabla', etiqueta: 'Calendario', filas: 3, columnas: 4, cabecera: true }],
  }), 201);
  assert.equal(hecho.plantillaVersion, 2);
  assert.equal(hecho.campos.length, 1);
  assert.equal(hecho.campos[0].id, 'calendario');
  assert.equal(hecho.campos[0].valorInicial.filas.length, 3);

  // El apartado se abre con el valor inicial a mano, sin que esté guardado.
  const abierto = await (await leer(u.jefa, doc._id, 'calendario-de-pruebas', null)).json();
  assert.deepEqual(abierto.valores, {});
  assert.deepEqual(abierto.iniciales.calendario, hecho.campos[0].valorInicial);

  // Se escribe en las celdas y se guarda.
  const valor = Campos.valorInicial(abierto.campos[0]);
  valor.filas[0] = ['Prueba', 'Fecha', 'Peso', 'Tipo'].map((t) => c(t, { bold: true }));
  valor.filas[1] = ['Examen 1', '12/11', '30 %', 'Escrito'].map((t) => c(t));
  valor.filas[2] = ['Práctica 1', '3/12', '20 %', 'En el aula'].map((t) => c(t));
  assert.equal((await escribir(u.jefa, doc._id, 'calendario-de-pruebas', null, { calendario: valor })).status, 200);
  assert.deepStrictEqual((await guardados(repo, doc._id, 'calendario-de-pruebas')).valores, { calendario: valor });

  // PDF: la tabla del apartado nuevo es la misma que haría `tablaGenerica` con una importada con cabecera.
  const definicion = await definicionDe(u.jefa, doc._id);
  const mia = tablasDe(definicion).find((t) => textosDe(t)[0].join('|') === 'Prueba|Fecha|Peso|Tipo');
  assert.ok(mia, 'la tabla creada no sale en el PDF');
  assert.equal(mia.table.headerRows, 1);
  assert.equal(mia.table.body.length, 3);
  assert.equal(mia.table.body[0][0].fillColor, tablasDe(definicion).find((t) => t.table.headerRows === 1 && t.table.body[0][0].bold).table.body[0][0].fillColor,
    'la cabecera tiene el mismo fondo que la de las tablas importadas');
  assert.equal(mia.table.body[0][0].bold, true);
  assert.deepEqual(textosDe(mia)[2], ['Práctica 1', '3/12', '20 %', 'En el aula']);
  assert.equal(mia.table.widths.length, 4);

  // Indistinguible de una importada: la misma definición para la misma tabla con la plantilla del importador.
  const importada = (columnas) => buildDocDefinition({
    plantilla: { tipo: 'programacion_didactica', secciones: [{ id: 'x', titulo: 'X', nivel: 1, campos: [{ tipo: 'tabla', id: 'tabla-x', etiqueta: 'Tabla', columnas }], hijos: [] }] },
    datos: { departamento: 'informatica', documento: { x: { 'tabla-x': valor } }, instancias: [], asignaciones: {}, compartidos: {} },
    instancias: [], titulo: 'T', subtitulo: 'S',
  });
  const deImportador = tablasDe(importada(['Prueba', 'Fecha', 'Peso', 'Tipo'])).find((t) => t.table.body.length === 3);
  assert.deepEqual(comparable(mia), comparable(deImportador), 'la tabla creada y la importada se pintan igual');

  // Word.
  const zip = await JSZip.loadAsync(Buffer.from(await (await Docx.GET(pet(`/api/documentos/${doc._id}/docx`, u.jefa), { id: doc._id })).arrayBuffer()));
  const xml = await zip.file('word/document.xml').async('string');
  for (const t of ['Calendario de pruebas', 'Prueba', 'Fecha', 'Examen 1', '30 %', 'En el aula']) {
    assert.ok(xml.includes(t), `«${t}» no llega al Word`);
  }
  const tblEn = xml.slice(xml.indexOf('Examen 1') - 3000, xml.indexOf('En el aula') + 500);
  assert.ok(tblEn.includes('<w:tbl>'), 'no hay una tabla de Word alrededor de las celdas');
});

prueba('lo mismo con una tabla de clave y valor', async () => {
  const { u, doc } = await escenario();
  await cambio(await anadir(u.jefa, doc._id, { titulo: 'Datos del centro', campos: [{ tipo: 'tabla_clave_valor', etiqueta: 'Datos', pares: 2 }] }), 201);
  const abierto = await (await leer(u.jefa, doc._id, 'datos-del-centro', null)).json();
  const valor = abierto.iniciales.datos;
  assert.equal(valor.pares.length, 2);
  valor.pares = [{ etiqueta: 'Centro', valor: 'IES Hermanos Amorós' }, { etiqueta: 'Localidad', valor: 'Villena' }];
  assert.equal((await escribir(u.jefa, doc._id, 'datos-del-centro', null, { datos: valor })).status, 200);

  const definicion = await definicionDe(u.jefa, doc._id);
  const t = tablasDe(definicion).find((x) => textosDe(x)[0][1] === 'IES Hermanos Amorós');
  assert.ok(t, 'la tabla de clave y valor no sale en el PDF');
  assert.deepEqual(t.table.widths, [150, '*'], 'la columna de la izquierda va a 150 pt');
  assert.deepEqual(textosDe(t).map((f) => f[1]), ['IES Hermanos Amorós', 'Villena']);

  const zip = await JSZip.loadAsync(Buffer.from(await (await Docx.GET(pet(`/api/documentos/${doc._id}/docx`, u.jefa), { id: doc._id })).arrayBuffer()));
  const xml = await zip.file('word/document.xml').async('string');
  assert.ok(xml.includes('Centro') && xml.includes('Villena') && xml.includes('IES Hermanos Amorós'));
});

prueba('una tabla torcida se rechaza al guardar con 400 que dice qué fila, y no se escribe nada', async () => {
  const { repo, u, doc } = await escenario();
  await cambio(await anadir(u.jefa, doc._id, { titulo: 'Torcida', campos: [{ tipo: 'tabla', filas: 2, columnas: 3, cabecera: false }] }), 201);
  const antes = await foto(repo, doc._id);
  const abierto = await (await leer(u.jefa, doc._id, 'torcida', null)).json();
  const valor = abierto.iniciales.tabla;
  valor.filas[1].pop();
  const error = await esError(await guardar(u.jefa, doc._id, 'torcida', null, { valores: { tabla: valor }, esperaUpdatedAt: abierto.updatedAt }), 400, 'peticion');
  assert.equal(error.campo, 'tabla');
  assert.ok(/fila 2/.test(error.motivo) && /falta/.test(error.motivo), error.motivo);
  assert.deepEqual(diferencias(antes, await foto(repo, doc._id)), []);
});

prueba('añadir un campo a un apartado existente por la API, con 409 si la versión es vieja', async () => {
  const { u, doc } = await escenario();
  const hecho = await cambio(await anadirCampo(u.jefa, doc._id, 'atencion-a-la-diversidad', {
    campo: { tipo: 'tabla_clave_valor', etiqueta: 'Resumen' }, esperaPlantillaVersion: 1,
  }), 201);
  assert.equal(hecho.plantillaVersion, 2);
  assert.equal(hecho.cambio.tipo, 'campo_anadido');
  assert.equal(hecho.campo, 'resumen');
  assert.equal(hecho.campos[0].id, 'resumen');
  assert.equal(hecho.afectaUnidades, false);
  assert.equal(hecho.apartadosAfectados, 1);

  const abierto = await (await leer(u.jefa, doc._id, 'atencion-a-la-diversidad', null)).json();
  assert.deepEqual(abierto.campos.map((x) => x.id), ['texto', 'resumen']);

  await esError(await anadirCampo(u.jefa, doc._id, 'atencion-a-la-diversidad', { campo: { tipo: 'tabla' }, esperaPlantillaVersion: 1 }), 409, 'conflicto');
  const e = await (await estructuraDe(u.jefa, doc._id)).json();
  assert.equal(e.plantillaVersion, 2, 'un cambio rechazado no sube la versión');
});

prueba('un campo en un apartado de módulo sale en los once, y la respuesta lo advierte', async () => {
  const { repo, u, doc } = await escenario();
  const hecho = await cambio(await anadirCampo(u.jefa, doc._id, 'modulos/metodologia', { campo: { tipo: 'tabla' } }), 201);
  assert.equal(hecho.afectaUnidades, true);
  assert.equal(hecho.unidades, 11);
  assert.equal(hecho.cambio.deUnidades, true);
  for (const id of [PROG, MODULOS[3]]) {
    const a = await (await leer(u.jefa, doc._id, 'modulos/metodologia', id)).json();
    assert.deepEqual(a.campos.map((x) => x.id), ['texto', 'tabla']);
  }
  assert.ok(await repo.documentos.obtener(doc._id));
});

prueba('quitar un campo no borra lo escrito: deja de salir en el PDF, no se puede escribir, y vuelve al restaurarlo', async () => {
  const { repo, u, doc } = await escenario();
  await cambio(await anadirCampo(u.jefa, doc._id, 'atencion-a-la-diversidad', { campo: { tipo: 'tabla', etiqueta: 'Medidas', filas: 2, columnas: 2, cabecera: true } }), 201);
  const abierto = await (await leer(u.jefa, doc._id, 'atencion-a-la-diversidad', null)).json();
  const valor = abierto.iniciales.medidas;
  valor.filas[0][0].text = 'Medida';
  valor.filas[1][0].text = 'Refuerzo en tutoría';
  assert.equal((await escribir(u.jefa, doc._id, 'atencion-a-la-diversidad', null, { medidas: valor })).status, 200);
  assert.ok(impreso(await definicionDe(u.jefa, doc._id), 'Refuerzo en tutoría'));

  const retiro = await cambio(await retirarCampo(u.jefa, doc._id, 'atencion-a-la-diversidad', 'medidas', { esperaPlantillaVersion: 2 }));
  assert.equal(retiro.plantillaVersion, 3);
  assert.equal(retiro.cambio.tipo, 'campo_retirado');
  assert.equal(retiro.camposRetirados, 1);

  // Lo escrito sigue en la base de datos, tal cual.
  assert.deepStrictEqual((await guardados(repo, doc._id, 'atencion-a-la-diversidad')).valores.medidas, valor);
  // Pero ya no sale en el PDF ni en el Word, ni en los campos del apartado, ni se puede escribir.
  assert.ok(!impreso(await definicionDe(u.jefa, doc._id), 'Refuerzo en tutoría'), 'el campo retirado se sigue imprimiendo');
  const zip = await JSZip.loadAsync(Buffer.from(await (await Docx.GET(pet(`/api/documentos/${doc._id}/docx`, u.jefa), { id: doc._id })).arrayBuffer()));
  assert.ok(!(await zip.file('word/document.xml').async('string')).includes('Refuerzo en tutoría'), 'el campo retirado se exporta a Word');
  const tras = await (await leer(u.jefa, doc._id, 'atencion-a-la-diversidad', null)).json();
  assert.deepEqual(tras.campos.map((x) => x.id), ['texto']);
  await esError(await guardar(u.jefa, doc._id, 'atencion-a-la-diversidad', null, { valores: { medidas: valor }, esperaUpdatedAt: tras.updatedAt }), 400, 'peticion');
  // Escribir en el campo que queda no toca el retirado.
  assert.equal((await escribir(u.jefa, doc._id, 'atencion-a-la-diversidad', null, { texto: [{ type: 'p', text: 'Otra cosa.' }] })).status, 200);
  assert.deepStrictEqual((await guardados(repo, doc._id, 'atencion-a-la-diversidad')).valores.medidas, valor);

  const e = await (await estructuraDe(u.jefa, doc._id)).json();
  assert.deepEqual(e.camposRetirados.map((x) => x.campo), ['medidas']);
  assert.equal(e.apartados.find((x) => x.seccion === 'atencion-a-la-diversidad').campos.find((x) => x.id === 'medidas').puedeRestaurar, true);

  const vuelta = await cambio(await restaurarCampo(u.jefa, doc._id, 'atencion-a-la-diversidad', 'medidas'));
  assert.equal(vuelta.plantillaVersion, 4);
  assert.equal(vuelta.cambio.tipo, 'campo_restaurado');
  assert.ok(impreso(await definicionDe(u.jefa, doc._id), 'Refuerzo en tutoría'), 'al restaurar vuelve lo que estaba escrito');
  const reg = (await (await estructuraDe(u.jefa, doc._id)).json()).cambios.map((x) => [x.version, x.tipo]);
  assert.deepEqual(reg, [[2, 'campo_anadido'], [3, 'campo_retirado'], [4, 'campo_restaurado']]);
});

prueba('el camino de la pantalla: lo que la estructura ofrece para quitar, lo quitado y lo restaurado, con su contenido', async () => {
  const { repo, u, doc } = await escenario();
  const sec = 'atencion-a-la-diversidad';
  const filaDe = async () => (await (await estructuraDe(u.jefa, doc._id)).json());
  await cambio(await anadirCampo(u.jefa, doc._id, sec, { campo: { tipo: 'tabla', etiqueta: 'Tabla', filas: 1, columnas: 2 } }), 201);

  // 1. La estructura ofrece el botón de quitar: el campo está activo y puedeRetirar lo dice.
  const antes = await filaDe();
  assert.equal(antes.puedeCambiar, true);
  const campoAntes = antes.apartados.find((x) => x.seccion === sec).campos.find((x) => x.id === 'tabla');
  assert.deepEqual([campoAntes.retirado, campoAntes.puedeRetirar, campoAntes.puedeRestaurar], [false, true, false]);
  assert.deepEqual(antes.camposRetirados, []);

  const abierto = await (await leer(u.jefa, doc._id, sec, null)).json();
  const valor = abierto.iniciales.tabla;
  valor.filas[0][0].text = 'Texto de la tabla';
  assert.equal((await escribir(u.jefa, doc._id, sec, null, { tabla: valor })).status, 200);

  // 2. Se quita con la versión que leyó la pantalla: ya no es activo y sí retirado.
  const quitado = await cambio(await retirarCampo(u.jefa, doc._id, sec, 'tabla', { esperaPlantillaVersion: antes.plantillaVersion }));
  assert.equal(quitado.plantillaVersion, antes.plantillaVersion + 1);
  const entre = await filaDe();
  const campoEntre = entre.apartados.find((x) => x.seccion === sec).campos.find((x) => x.id === 'tabla');
  assert.deepEqual([campoEntre.retirado, campoEntre.puedeRetirar, campoEntre.puedeRestaurar], [true, false, true]);
  assert.deepEqual(entre.camposRetirados.map((x) => [x.seccion, x.campo, x.etiqueta, x.apartadoRetirado]), [[sec, 'tabla', 'Tabla', false]]);
  assert.ok(!(await (await leer(u.jefa, doc._id, sec, null)).json()).campos.some((x) => x.id === 'tabla'));

  // 3. Quitarlo otra vez, o con una versión vieja, no cambia nada.
  await esError(await retirarCampo(u.jefa, doc._id, sec, 'tabla'), 400, 'peticion');
  await esError(await restaurarCampo(u.jefa, doc._id, sec, 'tabla', { esperaPlantillaVersion: antes.plantillaVersion }), 409, 'conflicto');
  assert.equal((await filaDe()).plantillaVersion, entre.plantillaVersion);

  // 4. Se restaura desde la lista global y vuelve con lo escrito.
  await cambio(await restaurarCampo(u.jefa, doc._id, sec, 'tabla', { esperaPlantillaVersion: entre.plantillaVersion }));
  const despues = await filaDe();
  assert.deepEqual(despues.camposRetirados, []);
  const campoDespues = despues.apartados.find((x) => x.seccion === sec).campos.find((x) => x.id === 'tabla');
  assert.deepEqual([campoDespues.retirado, campoDespues.puedeRetirar], [false, true]);
  assert.deepStrictEqual((await guardados(repo, doc._id, sec)).valores.tabla, valor);
});

prueba('un campo que la aplicación no puede crear sale con puedeRetirar apagado y el servidor lo rechaza', async () => {
  const { u, doc } = await escenario();
  const e = await (await estructuraDe(u.jefa, doc._id)).json();
  const apagados = e.apartados.flatMap((a) => a.campos.filter((c) => !c.puedeRetirar && !c.retirado && !a.retirado && !a.repetidor).map((c) => [a.seccion, c.id]));
  assert.ok(apagados.length > 0, 'el escenario debería tener algún campo que no se puede quitar');
  const [seccion, campo] = apagados[0];
  await esError(await retirarCampo(u.jefa, doc._id, seccion, campo), 400, 'peticion');
  assert.equal((await (await estructuraDe(u.jefa, doc._id)).json()).plantillaVersion, e.plantillaVersion);
});

prueba('un docente no ve el candado abierto y su quitar y restaurar campos dan 403, sin tocar la plantilla', async () => {
  const { u, doc } = await escenario();
  const sec = 'atencion-a-la-diversidad';
  await cambio(await anadirCampo(u.jefa, doc._id, sec, { campo: { tipo: 'tabla', etiqueta: 'Tabla' } }), 201);
  assert.equal((await (await estructuraDe(u.ana, doc._id)).json()).puedeCambiar, false);
  await esError(await retirarCampo(u.ana, doc._id, sec, 'tabla'), 403, 'sin_permiso');
  const v = (await (await estructuraDe(u.jefa, doc._id)).json()).plantillaVersion;
  await cambio(await retirarCampo(u.jefa, doc._id, sec, 'tabla'));
  await esError(await restaurarCampo(u.ana, doc._id, sec, 'tabla'), 403, 'sin_permiso');
  const e = await (await estructuraDe(u.jefa, doc._id)).json();
  assert.equal(e.plantillaVersion, v + 1);
  assert.equal(e.camposRetirados.length, 1);
});

prueba('los permisos de siempre: el docente 403, estudios 403, sin sesión 401, otro departamento 404', async () => {
  const { u, doc } = await escenario();
  const cuerpo = { campo: { tipo: 'tabla' } };
  await esError(await anadirCampo(u.ana, doc._id, 'atencion-a-la-diversidad', cuerpo), 403, 'sin_permiso');
  await esError(await anadirCampo(u.estudios, doc._id, 'atencion-a-la-diversidad', cuerpo), 403, 'sin_permiso');
  await esError(await anadirCampo(null, doc._id, 'atencion-a-la-diversidad', cuerpo), 401, 'sin_identificar');
  await esError(await anadirCampo(u.pepe, doc._id, 'atencion-a-la-diversidad', cuerpo), 404, 'no_encontrado');
  await esError(await retirarCampo(u.ana, doc._id, 'introduccion', 'texto'), 403, 'sin_permiso');
  assert.equal((await anadirCampo(u.admin, doc._id, 'atencion-a-la-diversidad', cuerpo)).status, 201);
});

prueba('los errores de los campos: 400 con el motivo, 404 si no existe, y nada cambia', async () => {
  const { u, doc } = await escenario();
  const sec = 'atencion-a-la-diversidad';
  await esError(await anadirCampo(u.jefa, doc._id, sec, {}), 400, 'peticion');
  await esError(await anadirCampo(u.jefa, doc._id, sec, { campo: { tipo: 'rara' } }), 400, 'peticion');
  const gordo = await esError(await anadirCampo(u.jefa, doc._id, sec, { campo: { tipo: 'tabla', filas: 99 } }), 400, 'peticion');
  assert.ok(gordo.mensaje.includes('Filas'), gordo.mensaje);
  await esError(await anadirCampo(u.jefa, doc._id, 'no-existe', { campo: { tipo: 'tabla' } }), 404, 'no_encontrado');
  await esError(await anadirCampo(u.jefa, doc._id, 'modulos/situaciones-de-aprendizaje/situacion', { campo: { tipo: 'tabla' } }), 400, 'peticion');
  await esError(await retirarCampo(u.jefa, doc._id, sec, 'fantasma'), 404, 'no_encontrado');
  await esError(await restaurarCampo(u.jefa, doc._id, sec, 'texto'), 400, 'peticion');
  await esError(await anadir(u.jefa, doc._id, { titulo: 'X', campos: 'tabla' }), 400, 'peticion');
  assert.equal((await (await estructuraDe(u.jefa, doc._id)).json()).plantillaVersion, 1);
  const sinCampo = await Estructura.RETIRAR_CAMPO(
    pet(`/api/documentos/${doc._id}/estructura/apartado/campo/retirar?seccion=${sec}`, u.jefa, { metodo: 'POST', cuerpo: {} }), { id: doc._id });
  await esError(sinCampo, 400, 'peticion');
});

prueba('el curso siguiente se lleva los campos creados y también los retirados, para poder restaurarlos', async () => {
  const { repo, u, doc } = await escenario();
  await cambio(await anadirCampo(u.jefa, doc._id, 'atencion-a-la-diversidad', { campo: { tipo: 'tabla_clave_valor', etiqueta: 'Resumen', pares: 1 } }), 201);
  await escribir(u.jefa, doc._id, 'atencion-a-la-diversidad', null, { resumen: { pares: [{ etiqueta: 'Alumnado', valor: '12' }] } });
  await cambio(await anadirCampo(u.jefa, doc._id, 'atencion-a-la-diversidad', { campo: { tipo: 'tabla', etiqueta: 'Vieja' } }), 201);
  await cambio(await retirarCampo(u.jefa, doc._id, 'atencion-a-la-diversidad', 'vieja'));
  const nuevoId = await cursoNuevo(u, doc);
  const e = await (await estructuraDe(u.jefa, nuevoId)).json();
  // El campo retirado VIAJA, y sigue retirado: retirar no borra, y arrastrar el curso tampoco puede
  // borrar. Si no viajara, su contenido se quedaría en el documento nuevo sin campo al que
  // pertenecer —los apartados se copian por su id— y reaparecería el día que alguien creara un
  // campo con la misma etiqueta.
  assert.deepEqual(e.apartados.find((x) => x.seccion === 'atencion-a-la-diversidad').campos.map((x) => [x.id, x.retirado]),
    [['texto', false], ['resumen', false], ['vieja', true]]);
  assert.ok(impreso(await definicionDe(u.jefa, nuevoId), 'Alumnado'));
  assert.ok(await guardados(repo, nuevoId, 'atencion-a-la-diversidad'));

  // Y como sigue ahí, en el curso nuevo se puede restaurar. Mientras está retirado no se imprime.
  assert.ok(!impreso(await definicionDe(u.jefa, nuevoId), 'Vieja'));
  await cambio(await restaurarCampo(u.jefa, nuevoId, 'atencion-a-la-diversidad', 'vieja'));
  const despues = await (await estructuraDe(u.jefa, nuevoId)).json();
  assert.deepEqual(despues.apartados.find((x) => x.seccion === 'atencion-a-la-diversidad').campos.map((x) => [x.id, x.retirado]),
    [['texto', false], ['resumen', false], ['vieja', false]]);
});

prueba('las tablas de la programación real se guardan tal cual las lee el importador (si está el .docx)', async () => {
  const fs = require('fs');
  const path = require('path');
  const { importarDocx } = require('../motor/importar-docx');
  const carpeta = path.join(__dirname, '..', 'docs', 'entrada_ej', '2026-27');
  const ficheros = ['PD_DAW_26-27_161026.docx', 'PD_SMR_26-27_221026.docx'].map((f) => path.join(carpeta, f)).filter((f) => fs.existsSync(f));
  if (!ficheros.length) return;
  let vistas = 0;
  for (const fichero of ficheros) {
    const { plantilla, datos } = await importarDocx({ path: fichero }, { origen: path.basename(fichero), incluirInicial: true });
    const campos = new Map();
    (function bajar(lista) {
      for (const s of lista) {
        for (const x of s.campos || []) if (x.tipo === 'tabla' || x.tipo === 'tabla_clave_valor') campos.set(`${s.id}#${x.id}`, x);
        bajar(s.hijos || []);
      }
    })(plantilla.secciones);
    const visitar = (valores) => {
      for (const [k, campo] of campos) {
        const [sid, cid] = k.split('#');
        const v = valores && valores[sid] && valores[sid][cid];
        if (!v) continue;
        // Lo que el editor mandaría al guardar: el valor, sin la tabla importada junto a los pares.
        const listo = Array.isArray(v) ? v.map(Campos.sinFilas) : Campos.sinFilas(v);
        assert.equal(Est.motivoDeCampo(campo, listo), null, `${k}: ${Est.motivoDeCampo(campo, listo)}`);
        vistas += Array.isArray(v) ? v.length : 1;
      }
    };
    visitar(datos.departamento);
    for (const i of datos.instancias || []) visitar(i.valores);
    // La poda de campos retirados no cambia nada en un documento que no tiene ninguno.
    assert.equal(Plantilla.vigente(plantilla), plantilla);
    assert.deepEqual(comparable(buildDocDefinition({ plantilla: Plantilla.vigente(plantilla), datos, instancias: 'todas', titulo: 'T', subtitulo: 'S' })),
      comparable(buildDocDefinition({ plantilla, datos, instancias: 'todas', titulo: 'T', subtitulo: 'S' })));
  }
  assert.ok(vistas >= 20, `se esperaban las tablas de la PD real y solo hay ${vistas}`);
});

// ================================================================ 5. el fondo de la celda

// Una tabla con cabecera y celdas en negrita dentro y fuera de la primera fila, sin ninguna `fondo`:
// es la forma de TODAS las tablas guardadas y de todo lo que produce el importador.
const AZUL = '#D9E2F3', GRIS_F = '#F2F2F2';
const sinFondo = () => ({ filas: [
  [c('A', { bold: true }), c('B', { bold: true }), c('C', { bold: true })],
  [c('e1', { bold: true }), c('x'), c('y')],
  [c('z'), c('e2', { bold: true }), c('w')],
] });

const plantillaFondo = () => ({ tipo: 'programacion_didactica', secciones: [{ id: 'x', titulo: 'X', nivel: 1, campos: [{ tipo: 'tabla', id: 't', etiqueta: 'T' }], hijos: [] }] });
const datosFondo = (t) => ({ departamento: 'informatica', documento: { x: { t } }, instancias: [], asignaciones: {}, compartidos: {} });
const tablaPdf = (t) => tablasDe(buildDocDefinition({ plantilla: plantillaFondo(), datos: datosFondo(t), instancias: [], titulo: 'T', subtitulo: 'S' })).find((x) => x.table.body.length === t.filas.length);
const fondosPdf = (t) => tablaPdf(t).table.body.map((f) => f.map((x) => x.fillColor));
const xmlDeWord = async (t) => {
  const { exportarDocx } = require('../motor/exportar-docx');
  const zip = await JSZip.loadAsync(await exportarDocx({ plantilla: plantillaFondo(), datos: datosFondo(t), titulo: 'T' }));
  return zip.file('word/document.xml').async('string');
};
// El relleno de cada celda del Word, fila a fila (null si la celda no tiene <w:shd>).
const fondosWord = (xml) => xml.split('<w:tr>').slice(1).map((fila) => fila.split('</w:tc>').filter((tc) => tc.includes('<w:tc>'))
  .map((tc) => { const m = tc.match(/<w:shd [^>]*w:fill="([^"]*)"/); return m ? m[1] : null; }));

prueba('sin «fondo» el fondo lo decide la negrita: azul en la cabecera, gris fuera, nada sin negrita', async () => {
  const t = sinFondo();
  assert.deepEqual(fondosPdf(t), [
    [AZUL, AZUL, AZUL],
    [GRIS_F, undefined, undefined],
    [undefined, GRIS_F, undefined],
  ]);
  assert.deepEqual(fondosWord(await xmlDeWord(t)), [
    ['D9E2F3', 'D9E2F3', 'D9E2F3'],
    ['F2F2F2', null, null],
    [null, 'F2F2F2', null],
  ], 'el Word usa los códigos sin «#»');
  // Sin cabecera (la primera fila no está entera en negrita), la negrita de la fila 0 es gris.
  const sinCab = { filas: [[c('A', { bold: true }), c('B')], [c('x'), c('y', { bold: true })]] };
  assert.deepEqual(fondosPdf(sinCab), [[GRIS_F, undefined], [undefined, GRIS_F]]);
  assert.deepEqual(fondosWord(await xmlDeWord(sinCab)), [['F2F2F2', null], [null, 'F2F2F2']]);
});

prueba('una tabla sin «fondo» sale idéntica a la que se generaba cuando la clave no existía', async () => {
  // La regla anterior, escrita aquí aparte y aplicada celda a celda.
  const t = sinFondo();
  const regla = (fila, celda) => (celda.bold ? (fila === 0 ? AZUL : GRIS_F) : undefined);
  assert.deepEqual(fondosPdf(t), t.filas.map((f, i) => f.map((x) => regla(i, x))));
  // Una celda sin negrita ni fondo no lleva ni `fillColor` ni `bold` en la definición.
  const sin = tablaPdf(t).table.body[1][1];
  assert.ok(!('fillColor' in sin) && !('bold' in sin));
  // «fondo» explícito igual al derivado no cambia nada: ni la definición ni el Word.
  const explicita = { filas: t.filas.map((f, i) => f.map((x) => ({ ...x, fondo: x.bold ? (i === 0 ? 'cabecera' : 'etiqueta') : 'ninguno' }))) };
  assert.deepEqual(comparable(tablaPdf(explicita)), comparable(tablaPdf(t)));
  assert.equal(await xmlDeWord(explicita), await xmlDeWord(t));
});

prueba('con «fondo» manda el nombre: sombrear sin negrita, negrita sin sombrear y azul fuera de la primera fila', async () => {
  const t = { filas: [
    [c('A', { bold: true }), c('B', { bold: true }), c('C', { bold: true })],
    [c('sombra gris', { fondo: 'etiqueta' }), c('azul abajo', { fondo: 'cabecera' }), c('negrita sin fondo', { bold: true, fondo: 'ninguno' })],
    [c('azul y negrita', { bold: true, fondo: 'cabecera' }), c('gris y negrita', { bold: true, fondo: 'etiqueta' }), c('nada')],
  ] };
  assert.deepEqual(fondosPdf(t), [
    [AZUL, AZUL, AZUL],
    [GRIS_F, AZUL, undefined],
    [AZUL, GRIS_F, undefined],
  ]);
  const cuerpo = tablaPdf(t).table.body;
  assert.ok(!cuerpo[1][0].bold, 'sombrear no pone negrita');
  assert.equal(cuerpo[1][2].bold, true, 'quitar el fondo no quita la negrita');
  assert.ok(!('fillColor' in cuerpo[1][2]));
  const xml = await xmlDeWord(t);
  assert.deepEqual(fondosWord(xml), [
    ['D9E2F3', 'D9E2F3', 'D9E2F3'],
    ['F2F2F2', 'D9E2F3', null],
    ['D9E2F3', 'F2F2F2', null],
  ]);
  // En el Word la negrita sigue siendo la de la celda: la celda sombreada sin negrita no la lleva.
  const run = (texto) => xml.slice(xml.lastIndexOf('<w:r>', xml.indexOf(`>${texto}<`)), xml.indexOf(`>${texto}<`));
  assert.ok(!run('sombra gris').includes('<w:b/>'));
  assert.ok(run('negrita sin fondo').includes('<w:b/>'));
});

prueba('la cabecera de la tabla no depende de «fondo»', async () => {
  const base = sinFondo();
  const cabeceras = async (t) => (await xmlDeWord(t)).split('<w:tblHeader/>').length - 1;
  assert.equal(tablaPdf(base).table.headerRows, 1);
  // Fila 0 en negrita pero con fondo «ninguno»: sigue siendo cabecera.
  const ninguno = { filas: base.filas.map((f, i) => (i === 0 ? f.map((x) => ({ ...x, fondo: 'ninguno' })) : f)) };
  assert.equal(tablaPdf(ninguno).table.headerRows, 1);
  assert.equal(await cabeceras(ninguno), 1);
  // Fila 0 sin negrita pero con fondo «cabecera»: no es cabecera.
  const falsa = { filas: [[c('A', { fondo: 'cabecera' }), c('B', { fondo: 'cabecera' })], [c('x', { bold: true }), c('y')]] };
  assert.equal(tablaPdf(falsa).table.headerRows, 0);
  assert.equal(await cabeceras(falsa), 0);
  // Otra fila con fondo «cabecera» no hace cabecera a nadie más.
  const abajo = { filas: base.filas.map((f, i) => (i === 2 ? f.map((x) => ({ ...x, fondo: 'cabecera' })) : f)) };
  assert.equal(tablaPdf(abajo).table.headerRows, 1);
  assert.equal(await cabeceras(abajo), 1);
});

// ---------------------------------------------------------------- ejecución
async function ejecutar() {
  for (const { nombre, fn } of pendientes) {
    try {
      await fn();
      console.log(`ok   ${nombre}`);
    } catch (e) {
      fallos += 1;
      console.log(`FALLO ${nombre}`);
      console.log(`     ${String(e && e.message).split('\n')[0]}`);
    }
  }
  const total = pendientes.length;
  console.log(fallos
    ? `\n${fallos} de ${total} pruebas con fallos`
    : `\n${total} pruebas de las tablas creadas en la aplicación correctas`);
  process.exit(fallos ? 1 : 0);
}

ejecutar();
