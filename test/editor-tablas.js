// El editor de tablas: lo que pasa entre el control de la pantalla y el servidor.
//
//   node test/editor-tablas.js
//
// No hay pruebas de DOM, y por eso el editor es una cáscara de React sobre dos módulos puros que
// sí se prueban aquí:
//
//   · core/tablas-edicion.js: qué pasa con el valor de una tabla al escribir en una celda, añadir
//     o quitar filas y columnas y poner o quitar la cabecera. Se vigila que NINGUNA operación
//     saque un valor que la puerta (core/estructurados.js) rechace.
//   · core/campos-forma.js: el formulario de alta de un campo, que lee el catálogo que devuelve la
//     API (`tiposDeCampo`) y no lleva ningún tipo escrito.
//
// Y lo que cruza las dos cosas: crear con lo que manda el formulario, editar con las operaciones,
// guardar por el PATCH de siempre, y que el PDF y el Word digan lo mismo que la pantalla. El arnés
// es el de test/tablas.js, copiado y no importado.

'use strict';

const assert = require('assert/strict');

const { crearRepositorio } = require('../repositorio');
const memoria = require('../repositorio/memoria');
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
const Pdf = require('../app/_lib/rutas/pdf');
const Docx = require('../app/_lib/rutas/docx');
const JSZip = require('jszip');
const { buildDocDefinition } = require('../motor/render-generico');

const Est = require('../core/estructurados');
const Campos = require('../core/campos');
const Edicion = require('../core/tablas-edicion');
const Forma = require('../core/campos-forma');

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

// Escribir lo que el cliente ha leído, igual que en test/edicion.js: lee, y manda la versión con la
// que leyó. Así la prueba no depende de cómo se guarda la versión.
async function escribir(persona, id, seccion, unidad, valores) {
  const antes = await (await leer(persona, id, seccion, unidad)).json();
  return guardar(persona, id, seccion, unidad, { valores, esperaUpdatedAt: antes.updatedAt });
}

// Lo que está guardado de verdad, sin pasar por la ruta.
const guardados = async (repo, id, seccion, unidad = null) => repo.apartados.leer(id, seccion, unidad);

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
      campos: [campoTexto, { id: 'tabla_normativa', tipo: 'tabla', etiqueta: 'Normativa aplicable' },
        { id: 'tabla_torcida', tipo: 'tabla', etiqueta: 'Calendario del Word' }],
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
      // Como las del Word con un defecto: una fila más corta que la primera.
      tabla_torcida: { filas: [[c('Norma', { bold: true }), c('Año', { bold: true })], [c('LOE')], [c('LOMLOE'), c('2020')]] },
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


// ================================================================ ayudas de esta suite

const anadirCampo = (persona, id, seccion, cuerpo) => Estructura.ANADIR_CAMPO(
  pet(`/api/documentos/${id}/estructura/apartado/campo?seccion=${encodeURIComponent(seccion)}`, persona,
    { metodo: 'POST', cuerpo: cuerpo === undefined ? {} : cuerpo }),
  { id },
);

const estructuraDe = (persona, id) => Estructura.GET(pet(`/api/documentos/${id}/estructura`, persona), { id });

const anadir = (persona, id, cuerpo) => Estructura.ANADIR(
  pet(`/api/documentos/${id}/estructura/apartado`, persona, { metodo: 'POST', cuerpo: cuerpo === undefined ? {} : cuerpo }),
  { id },
);

async function cambio(respuesta, estado = 200) {
  assert.equal(respuesta.status, estado, `el cambio debería haber salido bien y ha dado ${respuesta.status}`);
  return respuesta.json();
}

const tablasDe = (definicion) => nodos(definicion).filter((n) => n.table && n.table.body);
const textosDe = (t) => t.table.body.map((f) => f.map((x) => (x && x.text !== undefined ? String(x.text) : '')));

// Lo que hace la pantalla al abrir un apartado: leerlo, y quedarse con el campo y su valor.
async function abrir(persona, id, seccion, idCampo, unidad = null) {
  const a = await (await leer(persona, id, seccion, unidad)).json();
  const campo = a.campos.find((x) => x.id === idCampo);
  return { a, campo, valor: Edicion.valorDe(campo, a.valores[idCampo]) };
}

// Lo que hace la pantalla al guardar: el PATCH con la versión con la que leyó.
async function guardarValor(persona, id, seccion, a, idCampo, valor, unidad = null) {
  return guardar(persona, id, seccion, unidad, { valores: { [idCampo]: valor }, esperaUpdatedAt: a.updatedAt });
}

// El formulario del alta, tal como lo usa la pantalla: del catálogo que devuelve la API.
async function peticionDeForma(persona, id, tipo, cambios = {}) {
  const e = await (await estructuraDe(persona, id)).json();
  const def = Forma.porTipo(e.tiposDeCampo, tipo);
  let forma = Forma.formaInicial(def);
  for (const [k, v] of Object.entries(cambios)) forma = Forma.fijar(def, forma, k, v);
  assert.equal(Forma.motivo(def, forma), null);
  return Forma.peticionDe(def, forma);
}

// Un generador de números repetible: la prueba de azar tiene que fallar siempre igual si falla.
function azar(semilla) {
  let s = semilla >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

const campoCreado = (peticion) => Campos.crearCampo(peticion, []).campo;

// ================================================================ 1. las operaciones sobre el valor

prueba('se editan las tablas creadas y las importadas; las listas de tablas y los demás tipos, no', () => {
  assert.equal(Edicion.esEditable(campoCreado({ tipo: 'tabla' })), true);
  assert.equal(Edicion.esEditable(campoCreado({ tipo: 'tabla_clave_valor' })), true);
  // Un campo importado no trae `inicial`: se edita igual, y se sabe que vino del Word.
  const importada = { id: 't', tipo: 'tabla', etiqueta: 'Normativa', columnas: ['a', 'b'] };
  assert.equal(Edicion.esEditable(importada), true);
  assert.equal(Edicion.esEditable({ id: 'k', tipo: 'tabla_clave_valor', etiqueta: 'Ficha' }), true);
  assert.equal(Edicion.esImportada(importada), true);
  assert.equal(Edicion.esImportada(campoCreado({ tipo: 'tabla' })), false);
  // Una lista de tablas importada sigue en lectura: son varias tablas en un solo valor.
  assert.equal(Edicion.esEditable({ ...importada, multiple: true }), false);
  assert.equal(Edicion.esEditable({ id: 'k', tipo: 'tabla_clave_valor', multiple: true }), false);
  // Con el valor guardado: una clave y valor que solo quedó como `filas` no se abre, ni un valor que no es de su tipo.
  assert.equal(Edicion.esEditable({ id: 'k', tipo: 'tabla_clave_valor' }, { pares: [] }), true);
  assert.equal(Edicion.esEditable({ id: 'k', tipo: 'tabla_clave_valor' }, { filas: [[c('a'), c('b')]] }), false);
  assert.equal(Edicion.esEditable(importada, { filas: [[c('a')]] }), true);
  assert.equal(Edicion.esEditable(importada, [{ filas: [] }]), false);
  assert.equal(Edicion.esEditable(campoCreado({ tipo: 'texto_largo' })), false);
  assert.equal(Edicion.esEditable({ ...campoCreado({ tipo: 'tabla' }), multiple: true }), false);
  assert.equal(Edicion.esEditable({ id: 'p', tipo: 'ponderacion_ra_ce', inicial: {} }), false);
  assert.equal(Edicion.esEditable(null), false);
});

prueba('escribir en una celda cambia solo esa celda y conserva su forma; escribir lo mismo no cambia nada', () => {
  const campo = campoCreado({ tipo: 'tabla', filas: 3, columnas: 3, cabecera: true });
  const v0 = Campos.valorInicial(campo);
  const v1 = Edicion.aplicar(v0, 'texto', { fila: 1, columna: 2, valor: 'Examen' });
  assert.equal(v1.filas[1][2].text, 'Examen');
  assert.deepEqual(v1.filas[1][2], { text: 'Examen', colspan: 1, rowspan: 1, bold: false });
  assert.equal(v0.filas[1][2].text, '', 'no muta el valor de partida');
  assert.equal(v1.filas[0], v0.filas[0], 'las filas que no cambian son las mismas');
  assert.equal(Edicion.aplicar(v1, 'texto', { fila: 1, columna: 2, valor: 'Examen' }), v1);
  assert.equal(Edicion.aplicar(v1, 'texto', { fila: 9, columna: 0, valor: 'x' }), v1, 'una celda que no existe no hace nada');
  assert.equal(Est.motivoDeCampo(campo, v1), null);
});

prueba('añadir una fila: al final o debajo de otra, con el ancho de la tabla y sin negrita', () => {
  const campo = campoCreado({ tipo: 'tabla', filas: 2, columnas: 4, cabecera: true });
  const v0 = Campos.valorInicial(campo);
  const fin = Edicion.aplicar(v0, 'anadir-fila');
  assert.equal(fin.filas.length, 3);
  assert.equal(fin.filas[2].length, 4);
  assert.ok(fin.filas[2].every((x) => x.bold === false && x.text === ''));
  const medio = Edicion.aplicar(Edicion.aplicar(v0, 'texto', { fila: 1, columna: 0, valor: 'última' }), 'anadir-fila', { despuesDe: 0 });
  assert.equal(medio.filas.length, 3);
  assert.equal(medio.filas[2][0].text, 'última', 'la fila nueva entra debajo de la cabecera y empuja a las demás');
  assert.equal(medio.filas[1][0].text, '');
  assert.equal(Edicion.tieneCabecera(medio), true);
  assert.equal(Est.motivoDeCampo(campo, fin), null);
  assert.equal(Est.motivoDeCampo(campo, medio), null);
});

prueba('quitar una fila quita sus celdas y deja el resto; la última deja una tabla vacía que se guarda', () => {
  const campo = campoCreado({ tipo: 'tabla', filas: 3, columnas: 2, cabecera: false });
  let v = Campos.valorInicial(campo);
  v = Edicion.aplicar(v, 'texto', { fila: 0, columna: 0, valor: 'a' });
  v = Edicion.aplicar(v, 'texto', { fila: 1, columna: 0, valor: 'b' });
  v = Edicion.aplicar(v, 'texto', { fila: 2, columna: 0, valor: 'c' });
  const sin = Edicion.aplicar(v, 'quitar-fila', { fila: 1 });
  assert.deepEqual(sin.filas.map((f) => f[0].text), ['a', 'c']);
  let vacia = sin;
  vacia = Edicion.aplicar(vacia, 'quitar-fila', { fila: 0 });
  vacia = Edicion.aplicar(vacia, 'quitar-fila', { fila: 0 });
  assert.deepEqual(vacia, { filas: [] });
  assert.equal(Est.motivoDeCampo(campo, vacia), null, 'una tabla sin filas se guarda');
  assert.equal(Edicion.aplicar(vacia, 'quitar-fila', { fila: 0 }), vacia);
  // Al volver a añadir una fila el ancho se recupera del contexto.
  const otra = Edicion.aplicar(vacia, 'anadir-fila', {}, { columnas: 2 });
  assert.equal(otra.filas.length, 1);
  assert.equal(otra.filas[0].length, 2);
  assert.equal(Edicion.aplicar(vacia, 'anadir-fila', {}).filas[0].length, 1, 'sin contexto, una columna');
  assert.equal(Edicion.aplicar(vacia, 'anadir-fila', {}, { columnas: 99 }).filas[0].length, Est.MAX_COLUMNAS, 'el contexto no se pasa del tope');
});

prueba('añadir una columna entra en todas las filas; en la cabecera lleva un título, y en el resto, nada', () => {
  const campo = campoCreado({ tipo: 'tabla', filas: 3, columnas: 2, cabecera: true });
  const v0 = Campos.valorInicial(campo);
  const fin = Edicion.aplicar(v0, 'anadir-columna');
  assert.deepEqual(fin.filas.map((f) => f.length), [3, 3, 3]);
  assert.deepEqual(fin.filas[0][2], { text: 'Columna 3', colspan: 1, rowspan: 1, bold: true });
  assert.deepEqual(fin.filas[1][2], { text: '', colspan: 1, rowspan: 1, bold: false });
  assert.equal(Edicion.tieneCabecera(fin), true, 'la cabecera sigue entera en negrita');
  const medio = Edicion.aplicar(Edicion.aplicar(v0, 'texto', { fila: 1, columna: 1, valor: 'derecha' }), 'anadir-columna', { despuesDe: 0 });
  assert.equal(medio.filas[1][2].text, 'derecha');
  assert.equal(medio.filas[1][1].text, '');
  assert.equal(Est.motivoDeCampo(campo, fin), null);
  assert.equal(Est.motivoDeCampo(campo, medio), null);
  // Sin cabecera, la columna nueva no lleva negrita en ninguna parte.
  const lisa = Edicion.aplicar(Campos.valorInicial(campoCreado({ tipo: 'tabla', filas: 2, columnas: 2, cabecera: false })), 'anadir-columna');
  assert.ok(lisa.filas.every((f) => f[2].bold === false && f[2].text === ''));
});

prueba('quitar una columna la quita de todas las filas; la última no se puede', () => {
  const campo = campoCreado({ tipo: 'tabla', filas: 2, columnas: 3, cabecera: true });
  let v = Campos.valorInicial(campo);
  v = Edicion.aplicar(v, 'texto', { fila: 1, columna: 1, valor: 'medio' });
  const sin = Edicion.aplicar(v, 'quitar-columna', { columna: 1 });
  assert.deepEqual(sin.filas.map((f) => f.map((x) => x.text)), [['Columna 1', 'Columna 3'], ['', '']]);
  assert.equal(Est.motivoDeCampo(campo, sin), null);
  const una = Edicion.aplicar(sin, 'quitar-columna', { columna: 0 });
  assert.equal(una.filas[0].length, 1);
  assert.equal(Edicion.aplicar(una, 'quitar-columna', { columna: 0 }), una);
  assert.ok(/al menos una columna/.test(Edicion.motivoDeNo(una, 'quitar-columna', { columna: 0 })));
});

prueba('los topes son los de la puerta: ni más de 12 columnas ni más de 200 filas, y el motivo lo dice', () => {
  const ancha = Campos.valorInicial(campoCreado({ tipo: 'tabla', filas: 1, columnas: Est.MAX_COLUMNAS, cabecera: false }));
  assert.equal(Edicion.aplicar(ancha, 'anadir-columna'), ancha);
  assert.ok(new RegExp(String(Est.MAX_COLUMNAS)).test(Edicion.motivoDeNo(ancha, 'anadir-columna')));
  let alta = { filas: [Edicion.aplicar(ancha, 'quitar-columna', { columna: 0 }).filas[0]] };
  while (alta.filas.length < Est.MAX_FILAS) alta = Edicion.aplicar(alta, 'anadir-fila');
  assert.equal(alta.filas.length, Est.MAX_FILAS);
  assert.equal(Edicion.aplicar(alta, 'anadir-fila'), alta);
  assert.ok(new RegExp(String(Est.MAX_FILAS)).test(Edicion.motivoDeNo(alta, 'anadir-fila')));
  assert.equal(Est.motivoDeRejilla(alta, 'la tabla'), null, 'lo que llega al tope todavía se guarda');
});

prueba('la cabecera es la negrita de la primera fila: ponerla y quitarla no toca el texto', () => {
  const campo = campoCreado({ tipo: 'tabla', filas: 3, columnas: 3, cabecera: false });
  let v = Campos.valorInicial(campo);
  v = Edicion.aplicar(v, 'texto', { fila: 0, columna: 1, valor: 'Prueba' });
  assert.equal(Edicion.tieneCabecera(v), false);
  const con = Edicion.aplicar(v, 'cabecera', { puesta: true });
  assert.equal(Edicion.tieneCabecera(con), true);
  assert.ok(con.filas[0].every((x) => x.bold === true));
  assert.equal(con.filas[0][1].text, 'Prueba');
  assert.ok(con.filas.slice(1).every((f) => f.every((x) => x.bold === false)), 'solo la primera fila');
  assert.equal(Edicion.aplicar(con, 'cabecera', { puesta: true }), con);
  const sin = Edicion.aplicar(con, 'cabecera', { puesta: false });
  assert.equal(Edicion.tieneCabecera(sin), false);
  assert.ok(sin.filas[0].every((x) => x.bold === false));
  assert.equal(sin.filas[0][1].text, 'Prueba');
  assert.equal(Edicion.aplicar(sin, 'cabecera', { puesta: false }), sin);
  // Quitar la fila de la cabecera la quita: la que pasa a ser la primera no va en negrita.
  assert.equal(Edicion.tieneCabecera(Edicion.aplicar(con, 'quitar-fila', { fila: 0 })), false);
  // Sin filas no hay cabecera que poner.
  assert.ok(/no tiene filas/.test(Edicion.motivoDeNo({ filas: [] }, 'cabecera')));
  assert.equal(Edicion.tieneCabecera({ filas: [] }), false);
});

// ---------------------------------------------------------------- celdas combinadas

// Lo que la puerta del servidor diría de este valor: null si lo acepta.
const puerta = (v) => Est.motivoDeRejilla(v, 'la tabla');
const sale = (v, texto) => assert.equal(puerta(v), null, `${texto || ''} → ${JSON.stringify(v)}`);

// Una tabla de texto plano: cada fila una lista de cadenas.
const plana = (...filas) => ({ filas: filas.map((f) => f.map((t) => c(t))) });
// Lo que dice cada fila: texto, y @cs / @rs si la celda se combina.
const resumen = (v) => v.filas.map((f) => f.map((x) => x.text
  + ((x.colspan || 1) > 1 ? `@c${x.colspan}` : '') + ((x.rowspan || 1) > 1 ? `@r${x.rowspan}` : '')));
const hacer = (v, op, args, ctx) => {
  const r = Edicion.aplicar(v, op, args, ctx);
  assert.notEqual(r, v, `${op} ${JSON.stringify(args)} no hizo nada: ${Edicion.motivoDeNo(v, op, args)}`);
  sale(r, `${op} ${JSON.stringify(args)}`);
  return r;
};
const niega = (v, op, args, patron) => {
  const motivo = Edicion.motivoDeNo(v, op, args);
  assert.ok(motivo && patron.test(motivo), `${op}: ${motivo}`);
  assert.equal(Edicion.aplicar(v, op, args), v, `${op} debía devolver el mismo valor`);
};

prueba('combinar a la derecha y hacia abajo: la celda crece, absorbe a la vecina y junta los textos con un salto', () => {
  const t = plana(['a', 'b', 'c'], ['d', 'e', 'f'], ['g', 'h', 'i']);
  const der = hacer(t, 'combinar', { fila: 0, columna: 0, hacia: 'derecha' });
  assert.deepEqual(resumen(der), [['a\nb@c2', 'c'], ['d', 'e', 'f'], ['g', 'h', 'i']]);
  assert.equal(Edicion.columnasDe(der), 3);
  const aba = hacer(t, 'combinar', { fila: 0, columna: 0, hacia: 'abajo' });
  assert.deepEqual(resumen(aba), [['a\nd@r2', 'b', 'c'], ['e', 'f'], ['g', 'h', 'i']]);
  // El original no se muta.
  assert.deepEqual(resumen(t), [['a', 'b', 'c'], ['d', 'e', 'f'], ['g', 'h', 'i']]);
  // Una vecina vacía no deja saltos de línea sueltos, y si la celda estaba vacía queda el texto de la vecina.
  const v = hacer(plana(['a', ''], ['', 'x']), 'combinar', { fila: 0, columna: 0, hacia: 'derecha' });
  assert.equal(v.filas[0][0].text, 'a');
  const w = hacer(plana(['', 'b'], ['c', 'x']), 'combinar', { fila: 0, columna: 0, hacia: 'derecha' });
  assert.equal(w.filas[0][0].text, 'b');
  // Lo que se va a juntar se sabe antes de hacerlo.
  assert.equal(Edicion.textoQueSeJunta(t, { fila: 0, columna: 0, hacia: 'derecha' }), 'b');
  assert.equal(Edicion.textoQueSeJunta(plana(['a', ''], ['', 'x']), { fila: 0, columna: 0, hacia: 'derecha' }), '');
  assert.equal(Edicion.textoQueSeJunta(t, { fila: 2, columna: 0, hacia: 'abajo' }), '');
});

prueba('combinar conserva la negrita de la celda que se queda, no la de la absorbida', () => {
  const t = { filas: [[c('A', { bold: true }), c('B')], [c('C'), c('D', { bold: true })]] };
  const v = hacer(t, 'combinar', { fila: 0, columna: 0, hacia: 'derecha' });
  assert.equal(v.filas[0][0].bold, true);
  const w = hacer(t, 'combinar', { fila: 0, columna: 1, hacia: 'abajo' });
  assert.equal(w.filas[0][1].bold, false);
});

prueba('combinaciones encadenadas: la celda grande absorbe a todas las vecinas que encajan', () => {
  let t = plana(['a', 'b', 'c'], ['d', 'e', 'f'], ['g', 'h', 'i']);
  t = hacer(t, 'combinar', { fila: 0, columna: 0, hacia: 'abajo' });
  // Ahora «a\nd» ocupa dos filas: a su derecha hay dos celdas apiladas, b y e, y entran las dos.
  t = hacer(t, 'combinar', { fila: 0, columna: 0, hacia: 'derecha' });
  assert.deepEqual(resumen(t), [['a\nd\nb\ne@c2@r2', 'c'], ['f'], ['g', 'h', 'i']]);
  // Su vecina de la derecha ocupa toda la casilla que le queda a la fila 2, y absorberla la dejaría sin celdas.
  niega(t, 'combinar', { fila: 0, columna: 1, hacia: 'abajo' }, /fila 2 sin ninguna celda propia/);
  // Debajo hay tres celdas y dos caben bajo el ancho de la grande: las dos entran.
  t = hacer(t, 'combinar', { fila: 0, columna: 0, hacia: 'abajo' });
  assert.deepEqual(resumen(t), [['a\nd\nb\ne\ng\nh@c2@r3', 'c'], ['f'], ['i']]);
  assert.equal(Edicion.columnasDe(t), 3);
});

prueba('combinar se niega, con el motivo, cuando no hay vecina, no encaja o dejaría una fila sin celdas', () => {
  const t = plana(['a', 'b'], ['c', 'd']);
  niega(t, 'combinar', { fila: 0, columna: 1, hacia: 'derecha' }, /borde derecho/);
  niega(t, 'combinar', { fila: 1, columna: 0, hacia: 'abajo' }, /borde inferior/);
  niega(t, 'combinar', { fila: 5, columna: 0, hacia: 'derecha' }, /No hay esa celda/);
  niega(t, 'combinar', { fila: 0, columna: 0, hacia: 'arriba' }, /derecha o hacia abajo/);
  // La vecina sigue hacia abajo más que la celda: no se puede absorber una parte.
  const alta = { filas: [[c('a'), c('b', { rowspan: 2 })], [c('c')]] };
  sale(alta);
  niega(alta, 'combinar', { fila: 0, columna: 0, hacia: 'derecha' }, /no encajan con la altura/);
  // Combinar las dos de arriba hacia abajo deja la segunda fila sin celdas propias.
  const abajo = hacer(t, 'combinar', { fila: 0, columna: 0, hacia: 'abajo' });
  niega(abajo, 'combinar', { fila: 0, columna: 1, hacia: 'abajo' }, /fila 2 sin ninguna celda propia.*Quita esa fila/);
});

prueba('combinar en la última fila, en la primera columna, en una tabla de una celda y en una sin filas', () => {
  const t = plana(['a', 'b', 'c'], ['d', 'e', 'f']);
  const ultima = hacer(t, 'combinar', { fila: 1, columna: 1, hacia: 'derecha' });
  assert.deepEqual(resumen(ultima), [['a', 'b', 'c'], ['d', 'e\nf@c2']]);
  const primera = hacer(t, 'combinar', { fila: 0, columna: 0, hacia: 'abajo' });
  assert.deepEqual(resumen(primera)[1], ['e', 'f']);
  const una = plana(['solo']);
  niega(una, 'combinar', { fila: 0, columna: 0, hacia: 'derecha' }, /borde derecho/);
  niega(una, 'combinar', { fila: 0, columna: 0, hacia: 'abajo' }, /borde inferior/);
  niega(una, 'separar', { fila: 0, columna: 0 }, /no está combinada/);
  let dos = hacer(una, 'anadir-columna', {});
  dos = hacer(dos, 'combinar', { fila: 0, columna: 0, hacia: 'derecha' });
  assert.deepEqual(resumen(dos), [['solo@c2']]);
  sale(hacer(dos, 'quitar-columna', { columna: 1 }));
  const vacia = { filas: [] };
  niega(vacia, 'combinar', { fila: 0, columna: 0, hacia: 'derecha' }, /No hay esa celda/);
  niega(vacia, 'separar', { fila: 0, columna: 0 }, /No hay esa celda/);
  niega(vacia, 'negrita', { fila: 0, columna: 0, puesta: true }, /No hay esa celda/);
});

prueba('separar devuelve la celda a 1 × 1, rellena lo libre con celdas vacías y deja el texto en la primera casilla', () => {
  let t = plana(['a', 'b', 'c'], ['d', 'e', 'f']);
  t = hacer(t, 'combinar', { fila: 0, columna: 0, hacia: 'derecha' });
  t = hacer(t, 'combinar', { fila: 0, columna: 0, hacia: 'abajo' });
  assert.deepEqual(resumen(t), [['a\nb\nd\ne@c2@r2', 'c'], ['f']]);
  const s = hacer(t, 'separar', { fila: 0, columna: 0 });
  assert.deepEqual(resumen(s), [['a\nb\nd\ne', '', 'c'], ['', '', 'f']]);
  assert.equal(Edicion.tieneCombinadas(s), false);
  assert.deepEqual(s.filas[0][1], { text: '', colspan: 1, rowspan: 1, bold: false });
  // Una celda en negrita separada rellena con celdas en negrita: la cabecera sigue siéndolo.
  const cab = { filas: [[c('T', { bold: true, colspan: 2 })], [c('x'), c('y')]] };
  sale(cab);
  const sep = hacer(cab, 'separar', { fila: 0, columna: 0 });
  assert.equal(Edicion.tieneCabecera(sep), true);
  assert.equal(sep.filas[0].length, 2);
});

prueba('negrita celda a celda: es el sombreado, y no toca nada más', () => {
  const t = plana(['a', 'b'], ['c', 'd']);
  const v = hacer(t, 'negrita', { fila: 1, columna: 0, puesta: true });
  assert.equal(v.filas[1][0].bold, true);
  assert.equal(v.filas[1][1].bold, false);
  assert.equal(v.filas[0], t.filas[0], 'las otras filas son las mismas');
  // Quitarla y ponerla otra vez no cambia nada.
  assert.equal(Edicion.aplicar(v, 'negrita', { fila: 1, columna: 0, puesta: true }), v);
  assert.equal(Edicion.aplicar(t, 'negrita', { fila: 1, columna: 0, puesta: false }), t);
  assert.equal(hacer(v, 'negrita', { fila: 1, columna: 0, puesta: false }).filas[1][0].bold, false);
  // Toda la primera fila en negrita es la cabecera; una sola celda de la primera fila, no.
  let h = hacer(t, 'negrita', { fila: 0, columna: 0, puesta: true });
  assert.equal(Edicion.tieneCabecera(h), false);
  h = hacer(h, 'negrita', { fila: 0, columna: 1, puesta: true });
  assert.equal(Edicion.tieneCabecera(h), true);
  // Una tabla de clave y valor tiene formato fijo.
  const kv = { pares: [{ etiqueta: 'a', valor: 'b' }] };
  niega(kv, 'negrita', { fila: 0, columna: 0, puesta: true }, /formato fijo/);
  niega(kv, 'combinar', { fila: 0, columna: 0, hacia: 'derecha' }, /formato fijo/);
  niega(kv, 'separar', { fila: 0, columna: 0 }, /formato fijo/);
});

prueba('añadir una fila dentro del recorrido de un rowspan lo alarga; en el límite, no', () => {
  const t = { filas: [[c('a', { rowspan: 2 }), c('b')], [c('c')]] };
  sale(t);
  const dentro = hacer(t, 'anadir-fila', { despuesDe: 0 });
  assert.deepEqual(resumen(dentro), [['a@r3', 'b'], [''], ['c']]);
  const despues = hacer(t, 'anadir-fila', { despuesDe: 1 });
  assert.deepEqual(resumen(despues), [['a@r2', 'b'], ['c'], ['', '']]);
  const alFinal = hacer(t, 'anadir-fila', {});
  assert.deepEqual(resumen(alFinal), resumen(despues));
  // Dos combinaciones que cruzan la misma frontera crecen las dos, y se añade una celda en el hueco.
  const dos = { filas: [[c('a', { rowspan: 2 }), c('b'), c('c', { rowspan: 2 })], [c('d')]] };
  sale(dos);
  assert.deepEqual(resumen(hacer(dos, 'anadir-fila', { despuesDe: 0 })), [['a@r3', 'b', 'c@r3'], [''], ['d']]);
  // Una celda ancha que cruza la frontera no pide celdas nuevas bajo ninguna de sus columnas.
  const ancha = { filas: [[c('a', { rowspan: 2, colspan: 2 }), c('b')], [c('c')]] };
  sale(ancha);
  assert.deepEqual(resumen(hacer(ancha, 'anadir-fila', { despuesDe: 0 })), [['a@c2@r3', 'b'], [''], ['c']]);
});

prueba('quitar la fila donde nace un rowspan: la celda baja con su texto y un rowspan menos; si la atraviesa, se acorta', () => {
  const t = { filas: [[c('a', { rowspan: 3 }), c('b')], [c('c')], [c('d')]] };
  sale(t);
  assert.deepEqual(resumen(hacer(t, 'quitar-fila', { fila: 0 })), [['a@r2', 'c'], ['d']]);
  assert.deepEqual(resumen(hacer(t, 'quitar-fila', { fila: 1 })), [['a@r2', 'b'], ['d']]);
  assert.deepEqual(resumen(hacer(t, 'quitar-fila', { fila: 2 })), [['a@r2', 'b'], ['c']]);
  // Con rowspan 2 la celda queda en 1 y ya no es combinada.
  const dos = { filas: [[c('a', { rowspan: 2 }), c('b')], [c('c')]] };
  const sin = hacer(dos, 'quitar-fila', { fila: 0 });
  assert.deepEqual(resumen(sin), [['a', 'c']]);
  assert.equal(Edicion.tieneCombinadas(sin), false);
  // Quitar la última deja la tabla vacía, como siempre.
  assert.deepEqual(hacer({ filas: [[c('a', { rowspan: 1 })]] }, 'quitar-fila', { fila: 0 }), { filas: [] });
  // La cabecera que nace en la primera fila con un rowspan: al quitarla, lo que baja deja de ser cabecera.
  const cab = { filas: [[c('H', { bold: true, rowspan: 2 }), c('X', { bold: true })], [c('y')]] };
  sale(cab);
  assert.equal(Edicion.tieneCabecera(cab), true);
  const sinCab = hacer(cab, 'quitar-fila', { fila: 0 });
  assert.deepEqual(resumen(sinCab), [['H', 'y']]);
  assert.equal(sinCab.filas[0][0].bold, false);
  assert.equal(Edicion.tieneCabecera(sinCab), false);
});

prueba('añadir y quitar columnas ajustan los colspan que las atraviesan', () => {
  const t = { filas: [[c('T', { bold: true, colspan: 2 })], [c('a'), c('b')]] };
  sale(t);
  assert.deepEqual(resumen(hacer(t, 'anadir-columna', { despuesDe: 0 })), [['T@c3'], ['a', '', 'b']]);
  // Al borde de la celda ancha no la atraviesa: entra una celda nueva, y en la cabecera lleva título.
  const alFinal = hacer(t, 'anadir-columna', {});
  assert.deepEqual(resumen(alFinal), [['T@c2', 'Columna 3'], ['a', 'b', '']]);
  assert.equal(alFinal.filas[0][1].bold, true);
  // Quitar una columna que la celda ancha cubre solo en parte la acorta.
  assert.deepEqual(resumen(hacer(t, 'quitar-columna', { columna: 0 })), [['T'], ['b']]);
  assert.deepEqual(resumen(hacer(t, 'quitar-columna', { columna: 1 })), [['T'], ['a']]);
  // Una celda que solo ocupaba la columna quitada desaparece con su rowspan.
  const alta = { filas: [[c('A', { rowspan: 2 }), c('b')], [c('c')]] };
  sale(alta);
  assert.deepEqual(resumen(hacer(alta, 'quitar-columna', { columna: 0 })), [['b'], ['c']]);
  // Si una fila se queda sin celdas propias, se quita y la celda de arriba se acorta.
  assert.deepEqual(resumen(hacer(alta, 'quitar-columna', { columna: 1 })), [['A']]);
  // Una columna ancha nunca baja a 0 casillas: una tabla de una columna no se queda sin ella.
  niega(plana(['a']), 'quitar-columna', { columna: 0 }, /al menos una columna/);
  // En una tabla con combinadas, las columnas son casillas, no celdas de la fila.
  niega(t, 'quitar-columna', { columna: 2 }, /No hay esa columna/);
  niega(t, 'anadir-columna', { despuesDe: 2 }, /No hay esa columna/);
});

prueba('posiciones y celdaEn dicen dónde cae cada celda de la fila en la cuadrícula', () => {
  const t = { filas: [[c('A', { rowspan: 2 }), c('b', { colspan: 2 })], [c('c'), c('d')]] };
  sale(t);
  assert.deepEqual(Edicion.posiciones(t), [
    [{ columna: 0, ancho: 1, alto: 2 }, { columna: 1, ancho: 2, alto: 1 }],
    [{ columna: 1, ancho: 1, alto: 1 }, { columna: 2, ancho: 1, alto: 1 }],
  ]);
  assert.deepEqual(Edicion.celdaEn(t, 1, 0), { fila: 0, columna: 0 });
  assert.deepEqual(Edicion.celdaEn(t, 0, 2), { fila: 0, columna: 1 });
  assert.deepEqual(Edicion.celdaEn(t, 1, 2), { fila: 1, columna: 1 });
  assert.equal(Edicion.celdaEn(t, 5, 0), null);
  // Una tabla que no cuadra no tiene posiciones, y las operaciones de forma se niegan con el porqué.
  const rota = { filas: [[c('a'), c('b')], [c('c')]] };
  assert.equal(Edicion.posiciones(rota), null);
  niega(rota, 'anadir-fila', {}, /defecto de maquetación.*más corta que la primera/);
});

prueba('las celdas combinadas no se pierden al escribir ni al poner la cabecera', () => {
  const combinada = { filas: [[c('Título', { bold: true, colspan: 2 })], [c('a'), c('b')]] };
  const escrita = hacer(combinada, 'texto', { fila: 1, columna: 1, valor: 'B' });
  assert.equal(escrita.filas[1][1].text, 'B');
  assert.equal(escrita.filas[0][0].colspan, 2);
  const sin = hacer(combinada, 'cabecera', { puesta: false });
  assert.equal(sin.filas[0][0].colspan, 2);
  // Las celdas que no se tocan siguen siendo los mismos objetos.
  assert.equal(hacer(combinada, 'anadir-fila', {}).filas[0][0], combinada.filas[0][0]);
});

prueba('los topes siguen valiendo con celdas combinadas', () => {
  let t = plana(['a', 'b']);
  while (Edicion.columnasDe(t) < Est.MAX_COLUMNAS) t = hacer(t, 'anadir-columna', {});
  t = hacer(t, 'combinar', { fila: 0, columna: 0, hacia: 'derecha' });
  assert.equal(Edicion.columnasDe(t), Est.MAX_COLUMNAS);
  niega(t, 'anadir-columna', {}, /más de 12 columnas/);
});

prueba('al azar con combinar, separar y negrita: toda operación saca un valor que la puerta acepta, o el mismo valor', () => {
  const sorteo = azar(20261108);
  const ops = ['texto', 'anadir-fila', 'quitar-fila', 'anadir-columna', 'quitar-columna', 'cabecera',
    'combinar', 'combinar', 'combinar', 'separar', 'negrita'];
  const lineas = (v) => v.filas.flat().flatMap((x) => x.text.split('\n')).filter((t) => t !== '').sort();
  const sinTitulo = (t) => !/^Columna \d+$/.test(t);
  let combinadas = 0;
  let fusiones = 0;
  for (let ronda = 0; ronda < 60; ronda += 1) {
    const campo = campoCreado({
      tipo: 'tabla', filas: 1 + Math.floor(sorteo() * 5), columnas: 1 + Math.floor(sorteo() * 5), cabecera: sorteo() < 0.5,
    });
    let v = Campos.valorInicial(campo);
    v = { filas: v.filas.map((f, i) => f.map((x, j) => ({ ...x, text: x.text || `${i}${j}` }))) };
    let ancho = Edicion.columnasDe(v);
    for (let paso = 0; paso < 80; paso += 1) {
      const op = ops[Math.floor(sorteo() * ops.length)];
      const nf = Edicion.filasDe(v);
      const nc = Edicion.columnasDe(v);
      const fila = Math.floor(sorteo() * (nf + 1));
      const args = {
        fila,
        columna: Math.floor(sorteo() * ((op === 'anadir-columna' || op === 'quitar-columna' ? nc : (v.filas[fila] || []).length) + 1)),
        despuesDe: sorteo() < 0.3 ? undefined : Math.floor(sorteo() * (op === 'anadir-columna' ? nc : nf)),
        valor: sorteo() < 0.5 ? 'texto ' + paso : '',
        puesta: sorteo() < 0.5,
        hacia: sorteo() < 0.5 ? 'derecha' : 'abajo',
      };
      const antes = v;
      const motivo = Edicion.motivoDeNo(antes, op, args);
      const lineasAntes = lineas(antes);
      v = Edicion.aplicar(antes, op, args, { columnas: ancho });
      if (motivo !== null) assert.equal(v, antes, `${op} ${JSON.stringify(args)} se niega (${motivo}) y debe devolver el mismo valor`);
      if (Edicion.columnasDe(v)) ancho = Edicion.columnasDe(v);
      assert.equal(puerta(v), null, `${op} ${JSON.stringify(args)} → ${JSON.stringify(v)}`);
      assert.equal(Est.motivoDeCampo(campo, v), null);
      assert.ok(Edicion.filasDe(v) <= Est.MAX_FILAS && Edicion.columnasDe(v) <= Est.MAX_COLUMNAS);
      if (['combinar', 'separar', 'negrita', 'anadir-fila', 'anadir-columna'].includes(op)) {
        assert.deepEqual(lineas(v).filter(sinTitulo), lineasAntes.filter(sinTitulo), `${op} no debe perder ni inventar texto`);
      }
      if (op === 'combinar' && v !== antes) fusiones += 1;
      if (Edicion.tieneCombinadas(v)) combinadas += 1;
    }
  }
  assert.ok(fusiones > 100, `pocas combinaciones conseguidas: ${fusiones}`);
  assert.ok(combinadas > 500, `pocas tablas con combinadas: ${combinadas}`);
});

prueba('clave y valor: escribir, añadir y quitar filas; sin columnas ni cabecera', () => {
  const campo = campoCreado({ tipo: 'tabla_clave_valor', pares: 2 });
  const v0 = Campos.valorInicial(campo);
  assert.deepEqual(v0, { pares: [{ etiqueta: '', valor: '' }, { etiqueta: '', valor: '' }] });
  let v = Edicion.aplicar(v0, 'texto', { fila: 0, columna: 0, valor: 'Alumnado' });
  v = Edicion.aplicar(v, 'texto', { fila: 0, columna: 1, valor: '12' });
  assert.deepEqual(v.pares[0], { etiqueta: 'Alumnado', valor: '12' });
  v = Edicion.aplicar(v, 'anadir-fila', { despuesDe: 0 });
  assert.equal(v.pares.length, 3);
  assert.deepEqual(v.pares[1], { etiqueta: '', valor: '' });
  v = Edicion.aplicar(v, 'quitar-fila', { fila: 0 });
  assert.equal(v.pares.length, 2);
  assert.equal(Est.motivoDeCampo(campo, v), null);
  for (const [op, args] of [['anadir-columna', {}], ['quitar-columna', { columna: 0 }], ['cabecera', { puesta: true }]]) {
    assert.ok(Edicion.motivoDeNo(v, op, args), op);
    assert.equal(Edicion.aplicar(v, op, args), v, op);
  }
  let lleno = { pares: Array.from({ length: Est.MAX_PARES }, () => ({ etiqueta: 'a', valor: 'b' })) };
  assert.equal(Edicion.aplicar(lleno, 'anadir-fila'), lleno);
  assert.equal(Est.motivoDeCampo(campo, lleno), null);
  lleno = Edicion.aplicar(lleno, 'quitar-fila', { fila: 0 });
  assert.equal(lleno.pares.length, Est.MAX_PARES - 1);
});

prueba('una clave y valor importada se abre sin su tabla de Word, que es lo que la puerta pide', () => {
  const campo = { ...campoCreado({ tipo: 'tabla_clave_valor' }) };
  const importado = { pares: [{ etiqueta: 'a', valor: 'b' }], filas: [[c('a', { bold: true }), c('b')]] };
  const v = Edicion.valorDe(campo, importado);
  assert.equal('filas' in v, false);
  assert.equal(Est.motivoDeCampo(campo, v), null);
  assert.notEqual(Est.motivoDeCampo(campo, importado), null);
  assert.deepEqual(Edicion.valorDe(campo, null), Campos.valorInicial(campo), 'sin valor se abre con el inicial');
});

prueba('al azar: ninguna sucesión de operaciones saca un valor que la puerta rechace', () => {
  const sorteo = azar(20260417);
  const ops = ['texto', 'anadir-fila', 'quitar-fila', 'anadir-columna', 'quitar-columna', 'cabecera'];
  for (let ronda = 0; ronda < 40; ronda += 1) {
    const campo = campoCreado({
      tipo: 'tabla', filas: 1 + Math.floor(sorteo() * 6), columnas: 1 + Math.floor(sorteo() * 6), cabecera: sorteo() < 0.5,
    });
    let v = Campos.valorInicial(campo);
    let ancho = Edicion.columnasDe(v);
    for (let paso = 0; paso < 60; paso += 1) {
      const op = ops[Math.floor(sorteo() * ops.length)];
      const nf = Edicion.filasDe(v);
      const nc = Edicion.columnasDe(v);
      const args = {
        fila: Math.floor(sorteo() * (nf + 1)),
        columna: Math.floor(sorteo() * (nc + 1)),
        despuesDe: sorteo() < 0.5 ? undefined : Math.floor(sorteo() * (op === 'anadir-columna' ? nc : nf)),
        valor: sorteo() < 0.5 ? 'texto ' + paso : '',
        puesta: sorteo() < 0.5,
      };
      v = Edicion.aplicar(v, op, args, { columnas: ancho });
      if (Edicion.columnasDe(v)) ancho = Edicion.columnasDe(v);
      assert.equal(Est.motivoDeCampo(campo, v), null, `${op} ${JSON.stringify(args)} → ${JSON.stringify(v)}`);
      assert.ok(Edicion.filasDe(v) <= Est.MAX_FILAS && Edicion.columnasDe(v) <= Est.MAX_COLUMNAS);
    }
  }
});

prueba('paraPintar da lo mismo que se imprime: cabecera si hay, y la clave en negrita', () => {
  const rej = Edicion.paraPintar(Edicion.aplicar(Campos.valorInicial(campoCreado({ tipo: 'tabla', filas: 2, columnas: 2, cabecera: false })), 'cabecera', { puesta: true }));
  assert.equal(rej.cabecera, true);
  const kv = Edicion.paraPintar({ pares: [{ etiqueta: 'a', valor: 'b' }] });
  assert.equal(kv.cabecera, false);
  assert.deepEqual(kv.filas, [[{ text: 'a', bold: true }, { text: 'b' }]]);
  assert.equal(Edicion.descripcion({ filas: [] }), 'sin filas');
  assert.equal(Edicion.descripcion(Campos.valorInicial(campoCreado({ tipo: 'tabla', filas: 3, columnas: 4 }))), '3 filas × 4 columnas');
  assert.equal(Edicion.descripcion(Campos.valorInicial(campoCreado({ tipo: 'tabla', filas: 1, columnas: 1 }))), '1 fila × 1 columna');
});

// ================================================================ 2. el formulario del alta

prueba('el formulario sale del catálogo: cada tipo se abre con sus valores por omisión y sin nada escrito a mano', () => {
  const tipos = Campos.catalogo();
  assert.deepEqual(Forma.opciones(tipos).map((o) => o.nombre), ['Texto', 'Tabla', 'Clave y valor']);
  const tabla = Forma.porTipo(tipos, 'tabla');
  assert.deepEqual(Forma.formaInicial(tabla), { etiqueta: 'Tabla', filas: 3, columnas: 3, cabecera: true });
  assert.equal(Forma.porTipo(tipos, 'inventado'), null);

  // Un tipo que mañana añada el servidor, con parámetros que hoy no existen, se abre y se manda
  // sin tocar este módulo.
  const futuro = {
    tipo: 'calendario', nombre: 'Calendario', descripcion: 'x',
    parametros: [
      { id: 'etiqueta', nombre: 'Nombre', tipo: 'texto', maximo: 100, defecto: 'Calendario' },
      { id: 'semanas', nombre: 'Semanas', tipo: 'entero', minimo: 1, maximo: 8, defecto: 4 },
      { id: 'lunes', nombre: 'Empieza en lunes', tipo: 'booleano', defecto: false },
    ],
  };
  let f = Forma.formaInicial(futuro);
  assert.deepEqual(f, { etiqueta: 'Calendario', semanas: 4, lunes: false });
  f = Forma.fijar(futuro, Forma.fijar(futuro, f, 'semanas', '6'), 'lunes', true);
  assert.deepEqual(Forma.peticionDe(futuro, f), { tipo: 'calendario', etiqueta: 'Calendario', semanas: 6, lunes: true });
  assert.ok(/Semanas/.test(Forma.motivo(futuro, Forma.fijar(futuro, f, 'semanas', '9'))));
});

prueba('lo escrito a medias no se corrige: vacío o fuera de rango es un motivo, no el valor por omisión', () => {
  const tabla = Forma.porTipo(Campos.catalogo(), 'tabla');
  const base = Forma.formaInicial(tabla);
  assert.equal(Forma.motivo(tabla, base), null);
  for (const mala of ['', '0', '-1', '2.5', '51', 'abc']) {
    const f = Forma.fijar(tabla, base, 'filas', mala);
    assert.ok(/Filas/.test(Forma.motivo(tabla, f) || ''), `«${mala}» debería dar un motivo`);
    assert.equal(Forma.previsualizar(tabla, f).motivo, Forma.motivo(tabla, f));
  }
  const ancha = Forma.fijar(tabla, base, 'columnas', String(Est.MAX_COLUMNAS + 1));
  assert.ok(/Columnas/.test(Forma.motivo(tabla, ancha)));
  assert.equal(Forma.motivo(tabla, Forma.fijar(tabla, base, 'columnas', String(Est.MAX_COLUMNAS))), null);
  const larga = Forma.fijar(tabla, base, 'etiqueta', 'x'.repeat(Campos.LARGO_ETIQUETA + 1));
  assert.ok(/caracteres/.test(Forma.motivo(tabla, larga)));
  // Un nombre en blanco no es un fallo: el servidor pone el de siempre.
  assert.equal(Forma.motivo(tabla, Forma.fijar(tabla, base, 'etiqueta', '   ')), null);
  assert.equal(Forma.peticionDe(tabla, Forma.fijar(tabla, base, 'etiqueta', '')).etiqueta, undefined);
});

prueba('la vista previa es la tabla con la que nacería el campo: cabecera, tamaño y clave y valor', () => {
  const tipos = Campos.catalogo();
  const tabla = Forma.porTipo(tipos, 'tabla');
  let f = Forma.formaInicial(tabla);
  f = Forma.fijar(tabla, Forma.fijar(tabla, Forma.fijar(tabla, f, 'filas', '4'), 'columnas', '2'), 'cabecera', true);
  const v = Forma.previsualizar(tabla, f);
  assert.equal(v.pintar.cabecera, true);
  assert.deepEqual(v.pintar.filas.map((r) => r.length), [2, 2, 2, 2]);
  assert.deepEqual(v.pintar.filas[0].map((x) => x.text), ['Columna 1', 'Columna 2']);
  assert.deepEqual(v.valor, Campos.valorInicial(v.campo), 'es el valor con el que se abrirá');
  assert.equal(Est.motivoDeCampo(v.campo, v.valor), null);
  assert.equal(Forma.previsualizar(tabla, Forma.fijar(tabla, f, 'cabecera', false)).pintar.cabecera, false);

  const kv = Forma.porTipo(tipos, 'tabla_clave_valor');
  const w = Forma.previsualizar(kv, Forma.fijar(kv, Forma.formaInicial(kv), 'pares', '5'));
  assert.equal(w.pintar.filas.length, 5);
  assert.ok(w.pintar.filas.every((r) => r.length === 2 && r[0].bold === true));

  const texto = Forma.previsualizar(Forma.porTipo(tipos, 'texto_largo'), {});
  assert.equal(texto.valor, null);
  assert.ok(texto.campo);
});

prueba('el resumen de lo elegido, para la lista de campos de un apartado que todavía no existe', () => {
  const tipos = Campos.catalogo();
  const tabla = Forma.porTipo(tipos, 'tabla');
  let f = Forma.fijar(tabla, Forma.formaInicial(tabla), 'etiqueta', 'Calendario');
  assert.equal(Forma.resumen(tabla, f), 'Tabla «Calendario»: 3 filas × 3 columnas, con fila de cabecera');
  f = Forma.fijar(tabla, f, 'cabecera', false);
  assert.equal(Forma.resumen(tabla, f), 'Tabla «Calendario»: 3 filas × 3 columnas');
  assert.equal(Forma.resumen(tabla, Forma.fijar(tabla, f, 'etiqueta', '')), 'Tabla «Tabla»: 3 filas × 3 columnas');
  const kv = Forma.porTipo(tipos, 'tabla_clave_valor');
  assert.equal(Forma.resumen(kv, Forma.formaInicial(kv)), 'Clave y valor «Clave y valor»: 3 filas de clave y valor');
  assert.equal(Forma.caben(10, 3), 7);
  assert.equal(Forma.caben(10, 12), 0);
  assert.equal(Forma.caben(undefined, 0), 0);
});

// ================================================================ 3. de la pantalla al servidor

prueba('crear un apartado con una tabla desde el formulario, rellenarla con las operaciones y verla en el PDF y el Word', async () => {
  const { repo, u, doc } = await escenario();
  const peticion = await peticionDeForma(u.jefa, doc._id, 'tabla', { etiqueta: 'Calendario', filas: '3', columnas: '2', cabecera: true });
  const hecho = await cambio(await anadir(u.jefa, doc._id, { titulo: 'Fechas de examen', campos: [peticion] }), 201);

  const { a, campo, valor: inicial } = await abrir(u.jefa, doc._id, 'fechas-de-examen', 'calendario');
  assert.equal(Edicion.esEditable(campo), true);
  assert.deepEqual(inicial, hecho.campos[0].valorInicial);
  assert.deepEqual(a.valores, {}, 'nada guardado todavía');

  let v = inicial;
  v = Edicion.aplicar(v, 'texto', { fila: 0, columna: 0, valor: 'Prueba' });
  v = Edicion.aplicar(v, 'texto', { fila: 0, columna: 1, valor: 'Fecha' });
  v = Edicion.aplicar(v, 'anadir-columna');
  v = Edicion.aplicar(v, 'texto', { fila: 0, columna: 2, valor: 'Peso' });
  v = Edicion.aplicar(v, 'texto', { fila: 1, columna: 0, valor: 'Examen 1' });
  v = Edicion.aplicar(v, 'texto', { fila: 1, columna: 1, valor: '12/11' });
  v = Edicion.aplicar(v, 'texto', { fila: 1, columna: 2, valor: '30 %' });
  v = Edicion.aplicar(v, 'anadir-fila');
  v = Edicion.aplicar(v, 'texto', { fila: 3, columna: 0, valor: 'Práctica 1' });
  v = Edicion.aplicar(v, 'quitar-fila', { fila: 2 });
  assert.equal((await guardarValor(u.jefa, doc._id, 'fechas-de-examen', a, 'calendario', v)).status, 200);
  assert.deepEqual((await repo.apartados.leer(doc._id, 'fechas-de-examen', null)).valores, { calendario: v });

  const definicion = await definicionDe(u.jefa, doc._id);
  const mia = tablasDe(definicion).find((t) => textosDe(t)[0].join('|') === 'Prueba|Fecha|Peso');
  assert.ok(mia, 'la tabla no sale en el PDF');
  assert.deepEqual(textosDe(mia).slice(1), [['Examen 1', '12/11', '30 %'], ['Práctica 1', '', '']]);
  assert.equal(mia.table.headerRows, 1);
  assert.equal(mia.table.body[0][0].fillColor, '#D9E2F3');

  const zip = await JSZip.loadAsync(Buffer.from(await (await Docx.GET(pet(`/api/documentos/${doc._id}/docx`, u.jefa), { id: doc._id })).arrayBuffer()));
  const xml = await zip.file('word/document.xml').async('string');
  for (const t of ['Prueba', 'Fecha', 'Peso', 'Examen 1', 'Práctica 1']) assert.ok(xml.includes(t), `«${t}» no llega al Word`);
});

prueba('poner y quitar la cabecera de una tabla creada con cabecera se guarda, y el PDF y el Word la siguen', async () => {
  const { u, doc } = await escenario();
  const peticion = await peticionDeForma(u.jefa, doc._id, 'tabla', { etiqueta: 'Notas', filas: '2', columnas: '2', cabecera: true });
  await cambio(await anadir(u.jefa, doc._id, { titulo: 'Notas', campos: [peticion] }), 201);

  let { a, campo, valor } = await abrir(u.jefa, doc._id, 'notas', 'notas');
  assert.ok(campo.columnas, 'la tabla nació con cabecera: lleva sus títulos en la plantilla');
  valor = Edicion.aplicar(valor, 'texto', { fila: 1, columna: 0, valor: 'dato-uno' });

  const cabecerasDelWord = async () => (await (await JSZip.loadAsync(Buffer.from(await (await Docx.GET(pet(`/api/documentos/${doc._id}/docx`, u.jefa), { id: doc._id })).arrayBuffer()))).file('word/document.xml').async('string')).split('<w:tblHeader/>').length - 1;
  assert.equal((await guardarValor(u.jefa, doc._id, 'notas', a, 'notas', valor)).status, 200);
  const conCabecera = await cabecerasDelWord();
  ({ a } = await abrir(u.jefa, doc._id, 'notas', 'notas'));

  // Quitar la cabecera: el servidor lo acepta aunque `columnas` siga en la plantilla.
  const sin = Edicion.aplicar(valor, 'cabecera', { puesta: false });
  assert.equal((await guardarValor(u.jefa, doc._id, 'notas', a, 'notas', sin)).status, 200);
  let tabla = tablasDe(await definicionDe(u.jefa, doc._id)).find((t) => textosDe(t).flat().includes('dato-uno'));
  assert.equal(tabla.table.headerRows, 0, 'sin negrita no hay fila de cabecera en el PDF');
  assert.ok(tabla.table.body[0].every((x) => !x.fillColor), 'ni fondo azul');
  assert.equal(await cabecerasDelWord(), conCabecera - 1, 'el Word tampoco repite la fila');

  // Volver a ponerla.
  ({ a } = await abrir(u.jefa, doc._id, 'notas', 'notas'));
  const con = Edicion.aplicar(sin, 'cabecera', { puesta: true });
  assert.equal((await guardarValor(u.jefa, doc._id, 'notas', a, 'notas', con)).status, 200);
  tabla = tablasDe(await definicionDe(u.jefa, doc._id)).find((t) => textosDe(t).flat().includes('dato-uno'));
  assert.equal(tabla.table.headerRows, 1);
  assert.equal(tabla.table.body[0][0].fillColor, '#D9E2F3');
  assert.equal(await cabecerasDelWord(), conCabecera);
});

prueba('una tabla creada sin cabecera a la que se le pone después se imprime con cabecera', async () => {
  const { u, doc } = await escenario();
  const peticion = await peticionDeForma(u.jefa, doc._id, 'tabla', { etiqueta: 'Lisa', filas: '2', columnas: '2', cabecera: false });
  await cambio(await anadir(u.jefa, doc._id, { titulo: 'Lisa', campos: [peticion] }), 201);
  const { a, valor } = await abrir(u.jefa, doc._id, 'lisa', 'lisa');
  let v = Edicion.aplicar(valor, 'texto', { fila: 0, columna: 0, valor: 'Concepto' });
  v = Edicion.aplicar(v, 'cabecera', { puesta: true });
  assert.equal((await guardarValor(u.jefa, doc._id, 'lisa', a, 'lisa', v)).status, 200);
  const tabla = tablasDe(await definicionDe(u.jefa, doc._id)).find((t) => textosDe(t).flat().includes('Concepto'));
  assert.equal(tabla.table.headerRows, 1);
});

prueba('quitar todas las filas se guarda como tabla vacía, y volver a añadir una recupera el ancho', async () => {
  const { u, doc } = await escenario();
  await cambio(await anadir(u.jefa, doc._id, { titulo: 'Vaciable', campos: [await peticionDeForma(u.jefa, doc._id, 'tabla', { filas: '2', columnas: '3', cabecera: false })] }), 201);
  let { a, valor } = await abrir(u.jefa, doc._id, 'vaciable', 'tabla');
  const ancho = Edicion.columnasDe(valor);
  valor = Edicion.aplicar(Edicion.aplicar(valor, 'quitar-fila', { fila: 1 }), 'quitar-fila', { fila: 0 });
  assert.equal((await guardarValor(u.jefa, doc._id, 'vaciable', a, 'tabla', valor)).status, 200);
  assert.ok(impreso(await definicionDe(u.jefa, doc._id), '(tabla vacía)'));
  ({ a, valor } = await abrir(u.jefa, doc._id, 'vaciable', 'tabla'));
  assert.deepEqual(valor, { filas: [] });
  valor = Edicion.aplicar(valor, 'anadir-fila', {}, { columnas: ancho });
  assert.equal((await guardarValor(u.jefa, doc._id, 'vaciable', a, 'tabla', valor)).status, 200);
  assert.equal(Edicion.columnasDe((await abrir(u.jefa, doc._id, 'vaciable', 'tabla')).valor), 3);
});

prueba('una tabla de clave y valor se crea, se rellena y se imprime con la clave en negrita', async () => {
  const { u, doc } = await escenario();
  await cambio(await anadir(u.jefa, doc._id, { titulo: 'Ficha', campos: [await peticionDeForma(u.jefa, doc._id, 'tabla_clave_valor', { etiqueta: 'Datos', pares: '2' })] }), 201);
  const { a, valor } = await abrir(u.jefa, doc._id, 'ficha', 'datos');
  let v = Edicion.aplicar(valor, 'texto', { fila: 0, columna: 0, valor: 'Alumnado' });
  v = Edicion.aplicar(v, 'texto', { fila: 0, columna: 1, valor: '12 matriculados' });
  v = Edicion.aplicar(v, 'anadir-fila');
  v = Edicion.aplicar(v, 'texto', { fila: 2, columna: 0, valor: 'Turno' });
  assert.equal((await guardarValor(u.jefa, doc._id, 'ficha', a, 'datos', v)).status, 200);
  const tabla = tablasDe(await definicionDe(u.jefa, doc._id)).find((t) => textosDe(t).flat().includes('12 matriculados'));
  assert.ok(tabla);
  assert.equal(tabla.table.body.length, 3);
  assert.equal(tabla.table.body[0][0].bold, true);
});

prueba('la tabla importada del Word se ofrece al editor, se corrige por la API y sale en el PDF', async () => {
  const { u, doc } = await escenario();
  const { a, campo, valor } = await abrir(u.jefa, doc._id, 'introduccion', 'tabla_normativa');
  assert.equal(campo.tipo, 'tabla');
  assert.equal(Edicion.esEditable(campo, a.valores.tabla_normativa), true);
  assert.equal(Edicion.esImportada(campo), true);
  assert.equal((await abrir(u.jefa, doc._id, 'introduccion', 'texto')).campo.tipo, 'texto_largo');
  const v = Edicion.aplicar(valor, 'texto', { fila: 0, columna: 0, valor: 'Texto corregido a mano' });
  assert.notEqual(v, valor);
  assert.equal((await guardarValor(u.jefa, doc._id, 'introduccion', a, 'tabla_normativa', v)).status, 200);
  assert.ok(impreso(await definicionDe(u.jefa, doc._id), 'Texto corregido a mano'));
});

prueba('añadir una tabla a un apartado que ya existe: aparece con su valor inicial y se rellena', async () => {
  const { u, doc } = await escenario();
  const peticion = await peticionDeForma(u.jefa, doc._id, 'tabla', { etiqueta: 'Medidas', filas: '2', columnas: '2' });
  const e0 = await (await estructuraDe(u.jefa, doc._id)).json();
  const hecho = await cambio(await anadirCampo(u.jefa, doc._id, 'atencion-a-la-diversidad', { campo: peticion, esperaPlantillaVersion: e0.plantillaVersion }), 201);
  assert.equal(hecho.afectaUnidades, false);
  assert.equal(hecho.campos[0].id, 'medidas');

  const { a, campo, valor } = await abrir(u.jefa, doc._id, 'atencion-a-la-diversidad', 'medidas');
  assert.equal(Edicion.esEditable(campo), true);
  assert.deepEqual(a.iniciales.medidas, valor);
  const v = Edicion.aplicar(valor, 'texto', { fila: 1, columna: 1, valor: 'Apoyo en el aula' });
  assert.equal((await guardarValor(u.jefa, doc._id, 'atencion-a-la-diversidad', a, 'medidas', v)).status, 200);
  assert.ok(impreso(await definicionDe(u.jefa, doc._id), 'Apoyo en el aula'));
});

prueba('un campo en un apartado de módulo lo repiten los módulos, y la lectura lo dice antes de aceptar', async () => {
  const { u, doc } = await escenario();
  const e = await (await estructuraDe(u.jefa, doc._id)).json();
  const fila = e.apartados.find((x) => x.seccion === 'modulos/metodologia');
  assert.equal(fila.deUnidades, true, 'la pantalla advierte con esto, antes de pulsar');
  assert.equal(e.apartados.find((x) => x.seccion === 'modulos').instancias, true);
  assert.equal(e.apartados.find((x) => x.seccion === 'atencion-a-la-diversidad').deUnidades, false);
  assert.ok(e.unidades > 1);
  const hecho = await cambio(await anadirCampo(u.jefa, doc._id, 'modulos/metodologia', { campo: await peticionDeForma(u.jefa, doc._id, 'tabla') }), 201);
  assert.equal(hecho.afectaUnidades, true);
  assert.equal(hecho.unidades, e.unidades);
  const { campo, a, valor } = await abrir(u.jefa, doc._id, 'modulos/metodologia', 'tabla', PROG);
  assert.equal(Edicion.esEditable(campo), true);
  // Cada módulo guarda su propia tabla.
  assert.equal((await guardarValor(u.jefa, doc._id, 'modulos/metodologia', a, 'tabla', Edicion.aplicar(valor, 'texto', { fila: 1, columna: 0, valor: 'solo de Programación' }), PROG)).status, 200);
  const otro = await abrir(u.jefa, doc._id, 'modulos/metodologia', 'tabla', MODULOS.find((id) => id !== PROG));
  assert.equal(otro.valor.filas[1][0].text, '', 'el otro módulo no lo ve');
});

prueba('los topes de campos de la lectura: el formulario sabe cuántos caben, y el servidor los exige', async () => {
  const { u, doc } = await escenario();
  const e = await (await estructuraDe(u.jefa, doc._id)).json();
  const intro = e.apartados.find((x) => x.seccion === 'introduccion');
  const vivos = intro.campos.filter((x) => !x.retirado).length;
  assert.equal(Forma.caben(e.limites.camposPorApartado, vivos), e.limites.camposPorApartado - vivos);
  assert.equal(Forma.caben(e.limites.camposAlCrearUnApartado, 0), Plantilla.MAX_CAMPOS_AL_CREAR);
  const demasiados = Array.from({ length: Plantilla.MAX_CAMPOS_AL_CREAR + 1 }, () => ({ tipo: 'texto_largo' }));
  const r = await anadir(u.jefa, doc._id, { titulo: 'Muchos', campos: demasiados });
  assert.equal(r.status, 400);
});

prueba('el docente no ve ni usa el alta de campos: es de la jefatura, y el servidor lo cierra con 403', async () => {
  const { u, doc } = await escenario();
  const e = await (await estructuraDe(u.ana, doc._id)).json();
  assert.equal(e.puedeCambiar, false);
  assert.equal((await anadirCampo(u.ana, doc._id, 'atencion-a-la-diversidad', { campo: { tipo: 'tabla' } })).status, 403);
});


// ================================================================ el fondo de la celda

const SALTO = String.fromCharCode(10);
const fondosDe = (v) => v.filas.map((f) => f.map((x) => x.fondo));
// Lo que el editor cree que lleva cada celda, para compararlo con lo que se imprime.
const efectivosDe = (v) => v.filas.map((f, i) => f.map((x, j) => Edicion.fondoEfectivo(v, i, j)));

prueba('el fondo de una celda se pone, se cambia y se quita, y quitarlo BORRA la clave', () => {
  const t = plana(['a', 'b'], ['c', 'd']);
  const azul = hacer(t, 'fondo', { fila: 1, columna: 0, cual: 'cabecera' });
  assert.deepEqual(fondosDe(azul), [[undefined, undefined], ['cabecera', undefined]]);
  const gris = hacer(azul, 'fondo', { fila: 1, columna: 0, cual: 'etiqueta' });
  assert.deepEqual(fondosDe(gris), [[undefined, undefined], ['etiqueta', undefined]]);
  const fuera = hacer(gris, 'fondo', { fila: 1, columna: 0, cual: null });
  assert.ok(!('fondo' in fuera.filas[1][0]), 'la clave se borra, no se guarda como undefined');
  assert.deepEqual(Object.keys(fuera.filas[1][0]).sort(), ['bold', 'colspan', 'rowspan', 'text']);
  // Poner el mismo que ya tiene no cambia nada.
  assert.equal(Edicion.aplicar(azul, 'fondo', { fila: 1, columna: 0, cual: 'cabecera' }), azul);
  assert.equal(Edicion.aplicar(t, 'fondo', { fila: 0, columna: 0, cual: null }), t);
});

prueba('un fondo que no existe se niega y el motivo dice cuáles valen; la clave y valor no tiene fondo', () => {
  const t = plana(['a', 'b'], ['c', 'd']);
  niega(t, 'fondo', { fila: 0, columna: 0, cual: 'rosa' }, /cabecera, etiqueta, ninguno/);
  niega(t, 'fondo', { fila: 0, columna: 0, cual: '#D9E2F3' }, /Los fondos son/);
  niega(t, 'fondo', { fila: 9, columna: 0, cual: 'etiqueta' }, /No hay esa celda/);
  niega({ pares: [{ etiqueta: 'a', valor: 'b' }] }, 'fondo', { fila: 0, columna: 0, cual: 'etiqueta' }, /formato fijo/);
});

prueba('el interruptor de cabecera le quita a la primera fila el fondo elegido a mano, en los dos sentidos', () => {
  const t = plana(['a', 'b'], ['c', 'd']);
  const conCab = hacer(t, 'cabecera', { puesta: true });
  // Un «ninguno» suelto en la cabecera la dejaría sin azul: volver a pulsar el interruptor lo quita.
  const roto = hacer(conCab, 'fondo', { fila: 0, columna: 0, cual: 'ninguno' });
  assert.deepEqual(efectivosDe(roto)[0], [null, 'cabecera'], 'media cabecera sin color');
  const arreglada = hacer(roto, 'cabecera', { puesta: true });
  assert.deepEqual(fondosDe(arreglada)[0], [undefined, undefined]);
  assert.deepEqual(efectivosDe(arreglada)[0], ['cabecera', 'cabecera']);
  // Quitar la cabecera también limpia el fondo de la primera fila.
  const pintada = hacer(arreglada, 'fondo', { fila: 0, columna: 1, cual: 'cabecera' });
  const sinCab = hacer(pintada, 'cabecera', { puesta: false });
  assert.deepEqual(fondosDe(sinCab)[0], [undefined, undefined]);
  assert.deepEqual(efectivosDe(sinCab)[0], [null, null]);
});

prueba('combinar y separar conservan el fondo de la celda, y las casillas que quedan libres lo heredan', () => {
  const t = { filas: [[c('a', { fondo: 'etiqueta' }), c('b'), c('c')], [c('d'), c('e'), c('f')]] };
  const unida = hacer(t, 'combinar', { fila: 0, columna: 0, hacia: 'derecha' });
  assert.equal(unida.filas[0][0].fondo, 'etiqueta', 'la celda que se queda conserva su fondo');
  const suelta = hacer(unida, 'separar', { fila: 0, columna: 0 });
  assert.deepEqual(fondosDe(suelta)[0], ['etiqueta', 'etiqueta', undefined], 'la casilla liberada hereda el fondo');
  // Y el texto sigue estando entero.
  assert.equal(suelta.filas[0][0].text, ['a', 'b'].join(SALTO));
});

prueba('mover filas y columnas no toca el fondo de las celdas que sobreviven', () => {
  const t = { filas: [[c('a', { fondo: 'cabecera' }), c('b')], [c('c'), c('d', { fondo: 'etiqueta' })]] };
  const conFila = hacer(t, 'anadir-fila', { despuesDe: 0 });
  assert.deepEqual(fondosDe(conFila), [['cabecera', undefined], [undefined, undefined], [undefined, 'etiqueta']]);
  const conCol = hacer(conFila, 'anadir-columna', { despuesDe: 0 });
  assert.equal(conCol.filas[0][0].fondo, 'cabecera');
  assert.equal(conCol.filas[2][2].fondo, 'etiqueta');
  const menos = hacer(conCol, 'quitar-fila', { fila: 1 });
  assert.equal(menos.filas[0][0].fondo, 'cabecera');
});

prueba('lo que la pantalla pinta es lo que se imprime: fondoEfectivo coincide con el fillColor del PDF', async () => {
  const { u, doc } = await escenario();
  const peticion = await peticionDeForma(u.jefa, doc._id, 'tabla', { etiqueta: 'Fondos', filas: '3', columnas: '2' });
  const e0 = await (await estructuraDe(u.jefa, doc._id)).json();
  await cambio(await anadirCampo(u.jefa, doc._id, 'atencion-a-la-diversidad', { campo: peticion, esperaPlantillaVersion: e0.plantillaVersion }), 201);
  const { a, campo, valor } = await abrir(u.jefa, doc._id, 'atencion-a-la-diversidad', 'fondos');

  // Una tabla construida con las operaciones del editor, con las tres situaciones nuevas.
  let v = Edicion.aplicar(valor, 'texto', { fila: 0, columna: 0, valor: 'marca-fondos' });
  v = Edicion.aplicar(v, 'fondo', { fila: 1, columna: 0, cual: 'cabecera' });
  v = Edicion.aplicar(v, 'fondo', { fila: 1, columna: 1, cual: 'etiqueta' });
  v = Edicion.aplicar(v, 'negrita', { fila: 2, columna: 0, puesta: true });
  v = Edicion.aplicar(v, 'fondo', { fila: 2, columna: 0, cual: 'ninguno' });
  sale(v, 'la tabla del editor');
  const r = await guardarValor(u.jefa, doc._id, 'atencion-a-la-diversidad', a, campo.id, v);
  assert.equal(r.status, 200, 'guardar: ' + JSON.stringify(await r.json()));

  const tabla = tablasDe(await definicionDe(u.jefa, doc._id)).find((t) => textosDe(t).flat().includes('marca-fondos'));
  const COLOR = { cabecera: '#D9E2F3', etiqueta: '#F2F2F2' };
  const pintado = tabla.table.body.map((f) => f.map((x) => x.fillColor));
  assert.deepEqual(pintado, efectivosDe(v).map((f) => f.map((x) => COLOR[x])),
    'la pantalla y el PDF tienen que decir lo mismo de cada celda');
  // Y las tres situaciones que la negrita sola no sabe dar salen de verdad en el papel.
  assert.deepEqual(pintado[1], ['#D9E2F3', '#F2F2F2'], 'azul fuera de la cabecera, y gris sin negrita');
  assert.equal(pintado[2][0], undefined, 'negrita sin sombrear, salio ' + JSON.stringify(pintado));
  assert.equal(tabla.table.body[2][0].bold, true);
});

// ================================================================ la alineación y el tamaño de letra

// Lo que lleva escrito cada celda, y lo que el editor cree que lleva de verdad. Se comparan las dos
// cosas: la clave guardada y lo que los motores van a traducir.
const clavesDe = (v, clave) => v.filas.map((f) => f.map((x) => x[clave]));
const alineacionesDe = (v) => v.filas.map((f, i) => f.map((_, j) => Edicion.alineacionEfectiva(v, i, j)));
const tamanosDe = (v) => v.filas.map((f, i) => f.map((_, j) => Edicion.tamanoEfectivo(v, i, j)));

prueba('la alineación de una celda se pone y se cambia, y elegir «izquierda» BORRA la clave', () => {
  const t = plana(['a', 'b'], ['c', 'd']);
  const centro = hacer(t, 'alineacion', { fila: 1, columna: 0, cual: 'centro' });
  assert.deepEqual(clavesDe(centro, 'alineacion'), [[undefined, undefined], ['centro', undefined]]);
  const derecha = hacer(centro, 'alineacion', { fila: 1, columna: 0, cual: 'derecha' });
  assert.deepEqual(clavesDe(derecha, 'alineacion'), [[undefined, undefined], ['derecha', undefined]]);
  // El valor por omisión no se guarda: se borra la clave, y la celda queda como nació.
  const fuera = hacer(derecha, 'alineacion', { fila: 1, columna: 0, cual: 'izquierda' });
  assert.ok(!('alineacion' in fuera.filas[1][0]), 'la clave se borra, no se guarda como undefined');
  assert.deepEqual(Object.keys(fuera.filas[1][0]).sort(), ['bold', 'colspan', 'rowspan', 'text']);
  // Y null hace lo mismo que el valor por omisión.
  assert.deepEqual(hacer(derecha, 'alineacion', { fila: 1, columna: 0, cual: null }), fuera);
  // Poner lo que ya tiene no cambia nada; «izquierda» en una celda que no la lleva, tampoco.
  assert.equal(Edicion.aplicar(centro, 'alineacion', { fila: 1, columna: 0, cual: 'centro' }), centro);
  assert.equal(Edicion.aplicar(t, 'alineacion', { fila: 0, columna: 0, cual: 'izquierda' }), t);
  assert.equal(Edicion.aplicar(t, 'alineacion', { fila: 0, columna: 0, cual: null }), t);
});

prueba('el tamaño de letra de una celda se pone y se cambia, y elegir «normal» BORRA la clave', () => {
  const t = plana(['a', 'b'], ['c', 'd']);
  const pequena = hacer(t, 'tamano', { fila: 0, columna: 1, cual: 'pequena' });
  assert.deepEqual(clavesDe(pequena, 'tamano'), [[undefined, 'pequena'], [undefined, undefined]]);
  const grande = hacer(pequena, 'tamano', { fila: 0, columna: 1, cual: 'grande' });
  assert.deepEqual(clavesDe(grande, 'tamano'), [[undefined, 'grande'], [undefined, undefined]]);
  const fuera = hacer(grande, 'tamano', { fila: 0, columna: 1, cual: 'normal' });
  assert.ok(!('tamano' in fuera.filas[0][1]), 'la clave se borra, no se guarda como undefined');
  assert.deepEqual(Object.keys(fuera.filas[0][1]).sort(), ['bold', 'colspan', 'rowspan', 'text']);
  assert.deepEqual(hacer(grande, 'tamano', { fila: 0, columna: 1, cual: null }), fuera);
  assert.equal(Edicion.aplicar(t, 'tamano', { fila: 0, columna: 0, cual: 'normal' }), t);
});

prueba('una alineación o un tamaño que no existen se niegan y el motivo dice cuáles valen', () => {
  const t = plana(['a', 'b'], ['c', 'd']);
  niega(t, 'alineacion', { fila: 0, columna: 0, cual: 'center' }, /izquierda, centro, derecha/);
  niega(t, 'alineacion', { fila: 0, columna: 0, cual: 'justificada' }, /Las alineaciones son/);
  niega(t, 'tamano', { fila: 0, columna: 0, cual: 9.5 }, /pequena, normal, grande/);
  niega(t, 'tamano', { fila: 0, columna: 0, cual: 'pequeña' }, /Los tamaños de letra son/);
  niega(t, 'alineacion', { fila: 9, columna: 0, cual: 'centro' }, /No hay esa celda/);
  niega(t, 'tamano', { fila: 0, columna: 9, cual: 'grande' }, /No hay esa celda/);
  // Una tabla de clave y valor tiene formato fijo: no se alinea ni se le cambia la letra.
  const kv = { pares: [{ etiqueta: 'a', valor: 'b' }] };
  niega(kv, 'alineacion', { fila: 0, columna: 0, cual: 'centro' }, /formato fijo/);
  niega(kv, 'tamano', { fila: 0, columna: 0, cual: 'grande' }, /formato fijo/);
});

prueba('las dos claves conviven con el fondo y con la negrita, y sobreviven a mover filas y columnas', () => {
  let v = plana(['a', 'b'], ['c', 'd']);
  v = hacer(v, 'alineacion', { fila: 0, columna: 0, cual: 'centro' });
  v = hacer(v, 'tamano', { fila: 0, columna: 0, cual: 'pequena' });
  v = hacer(v, 'fondo', { fila: 0, columna: 0, cual: 'etiqueta' });
  v = hacer(v, 'negrita', { fila: 0, columna: 0, puesta: true });
  assert.deepEqual(Object.keys(v.filas[0][0]).sort(),
    ['alineacion', 'bold', 'colspan', 'fondo', 'rowspan', 'tamano', 'text']);
  // Combinar conserva lo de la celda que se queda.
  const unida = hacer(v, 'combinar', { fila: 0, columna: 0, hacia: 'derecha' });
  assert.equal(unida.filas[0][0].alineacion, 'centro');
  assert.equal(unida.filas[0][0].tamano, 'pequena');
  const conFila = hacer(v, 'anadir-fila', { despuesDe: 0 });
  assert.deepEqual(alineacionesDe(conFila), [['centro', null], [null, null], [null, null]]);
  assert.deepEqual(tamanosDe(conFila), [['pequena', null], [null, null], [null, null]]);
  const conCol = hacer(conFila, 'anadir-columna', { despuesDe: 0 });
  assert.equal(conCol.filas[0][0].alineacion, 'centro');
  assert.equal(conCol.filas[0][0].tamano, 'pequena');
  // Y las celdas que nacen no llevan ninguna de las dos claves: salen como las del importador.
  assert.ok(!('alineacion' in conCol.filas[1][1]) && !('tamano' in conCol.filas[1][1]));
});

// ================================================================ el ancho de las columnas

prueba('el ancho de una columna se mueve de una en una, y al primer toque todas quedan iguales', () => {
  const t = plana(['a', 'b', 'c'], ['d', 'e', 'f']);
  assert.equal(Edicion.anchosDe(t), null, 'una tabla recién creada reparte sus columnas sola');
  assert.equal(Edicion.porcentajesDe(t), null, 'y el porcentaje no se puede decir: lo calcula el motor');
  // El primer toque iguala las tres y ensancha la primera.
  const uno = hacer(t, 'ancho', { columna: 0, hacia: 'ensanchar' });
  assert.deepEqual(uno.anchos, [11, 10, 10]);
  assert.deepEqual(Edicion.porcentajesDe(uno), [35, 32, 32]);
  // Y desde ahí se sigue moviendo esa o cualquier otra.
  const dos = hacer(uno, 'ancho', { columna: 2, hacia: 'estrechar' });
  assert.deepEqual(dos.anchos, [11, 10, 9]);
  // El tope por columna: ni se queda sin sitio ni se come la tabla.
  let ancha = t;
  for (let k = 0; k < 20; k += 1) ancha = Edicion.aplicar(ancha, 'ancho', { columna: 0, hacia: 'ensanchar' });
  assert.deepEqual(ancha.anchos, [30, 10, 10]);
  niega(ancha, 'ancho', { columna: 0, hacia: 'ensanchar' }, /lo más ancha que puede ser/);
  let estrecha = t;
  for (let k = 0; k < 20; k += 1) estrecha = Edicion.aplicar(estrecha, 'ancho', { columna: 1, hacia: 'estrechar' });
  assert.deepEqual(estrecha.anchos, [10, 2, 10]);
  niega(estrecha, 'ancho', { columna: 1, hacia: 'estrechar' }, /lo más estrecha que puede ser/);
});

prueba('volver al automático BORRA «anchos» entero, y no se puede volver dos veces', () => {
  const t = plana(['a', 'b'], ['c', 'd']);
  const puesto = hacer(t, 'ancho', { columna: 0, hacia: 'ensanchar' });
  const auto = hacer(puesto, 'anchos-automaticos', {});
  assert.ok(!('anchos' in auto), 'la clave se borra, no se guarda vacía ni con pesos iguales');
  assert.deepEqual(Object.keys(auto).sort(), ['filas']);
  assert.deepEqual(auto, t, 'y la tabla vuelve a ser exactamente la de antes');
  niega(t, 'anchos-automaticos', {}, /ya se reparten solas/);
  // Una tabla de clave y valor tiene las dos columnas fijas.
  niega({ pares: [] }, 'ancho', { columna: 0, hacia: 'ensanchar' }, /dos columnas fijas/);
  niega({ pares: [] }, 'anchos-automaticos', {}, /dos columnas fijas/);
  // Y sin filas no hay columnas que repartir.
  niega({ filas: [] }, 'ancho', { columna: 0, hacia: 'ensanchar' }, /no tiene filas/);
  niega(t, 'ancho', { columna: 9, hacia: 'ensanchar' }, /No hay esa columna/);
  niega(t, 'ancho', { columna: 0, hacia: 'donde sea' }, /se ensancha o se estrecha/);
});

prueba('añadir y quitar columnas mantiene «anchos» con un peso por columna', () => {
  let v = plana(['a', 'b', 'c'], ['d', 'e', 'f']);
  v = hacer(v, 'ancho', { columna: 1, hacia: 'ensanchar' });
  v = hacer(v, 'ancho', { columna: 1, hacia: 'ensanchar' });
  assert.deepEqual(v.anchos, [10, 12, 10]);
  // La columna nueva nace del ancho de la que tiene al lado, que es la que se pulsó.
  const mas = hacer(v, 'anadir-columna', { despuesDe: 1 });
  assert.deepEqual(mas.anchos, [10, 12, 12, 10]);
  assert.equal(mas.anchos.length, Edicion.columnasDe(mas));
  assert.deepEqual(hacer(v, 'anadir-columna', {}).anchos, [10, 12, 10, 10]);
  // Y al quitar una, se va su peso.
  const menos = hacer(mas, 'quitar-columna', { columna: 1 });
  assert.deepEqual(menos.anchos, [10, 12, 10]);
  assert.equal(menos.anchos.length, Edicion.columnasDe(menos));
  // Las filas no tocan los anchos.
  assert.deepEqual(hacer(v, 'anadir-fila', {}).anchos, [10, 12, 10]);
  assert.deepEqual(hacer(v, 'quitar-fila', { fila: 1 }).anchos, [10, 12, 10]);
  // Pero una tabla que se queda SIN FILAS los pierde: sin columnas no hay nada que repartir, y una
  // lista de pesos sin columnas no pasaría la puerta.
  const vacia = hacer(hacer(v, 'quitar-fila', { fila: 1 }), 'quitar-fila', { fila: 0 });
  assert.deepEqual(vacia, { filas: [] });
  // Y la fila que se añade después nace con el reparto automático.
  assert.ok(!('anchos' in hacer(vacia, 'anadir-fila', {}, { columnas: 3 })));
});

prueba('ninguna operación deja una clave guardada con valor undefined', () => {
  let v = plana(['a', 'b'], ['c', 'd']);
  const gestos = [
    ['alineacion', { fila: 0, columna: 0, cual: 'centro' }], ['alineacion', { fila: 0, columna: 0, cual: 'izquierda' }],
    ['tamano', { fila: 0, columna: 1, cual: 'grande' }], ['tamano', { fila: 0, columna: 1, cual: 'normal' }],
    ['fondo', { fila: 1, columna: 0, cual: 'etiqueta' }], ['fondo', { fila: 1, columna: 0, cual: null }],
    ['ancho', { columna: 0, hacia: 'ensanchar' }], ['anchos-automaticos', {}],
    ['negrita', { fila: 0, columna: 0, puesta: true }], ['cabecera', { puesta: true }],
    ['anadir-columna', { despuesDe: 0 }], ['quitar-columna', { columna: 0 }],
    ['anadir-fila', { despuesDe: 0 }], ['quitar-fila', { fila: 0 }],
    ['combinar', { fila: 0, columna: 0, hacia: 'derecha' }], ['separar', { fila: 0, columna: 0 }],
  ];
  for (const [op, args] of gestos) {
    v = hacer(v, op, args);
    // `JSON.stringify` tira las claves que valen `undefined`, así que lo que hay que mirar son las
    // presentes: ninguna puede valer `undefined` ni en la tabla ni en una celda.
    for (const [k, x] of Object.entries(v)) assert.notEqual(x, undefined, `«${k}» de la tabla tras ${op}`);
    v.filas.forEach((f, i) => f.forEach((celda, j) => {
      for (const [k, x] of Object.entries(celda)) {
        assert.notEqual(x, undefined, `«${k}» de la celda ${j + 1} de la fila ${i + 1} tras ${op}`);
      }
    }));
  }
});

prueba('una tabla sin las claves nuevas da exactamente la definición de pdfmake de antes', () => {
  // La garantía de las 1.070 tablas de los documentos reales, en una prueba que se puede ejecutar en
  // una máquina recién clonada: mientras no haya ninguna de las claves nuevas, el motor no escribe
  // `alignment` ni `fontSize` ni cambia los anchos, y la tabla sale como salía.
  const campo = { id: 'tabla-x', tipo: 'tabla', etiqueta: 'Tabla' };
  const definicion = (valor) => buildDocDefinition({
    plantilla: { tipo: 'programacion_didactica', secciones: [{ id: 'x', titulo: 'X', nivel: 1, campos: [campo], hijos: [] }] },
    datos: { departamento: 'informatica', documento: { x: { 'tabla-x': valor } }, instancias: [], asignaciones: {}, compartidos: {} },
    instancias: [], titulo: 'T', subtitulo: 'S',
  });
  const base = { filas: [[c('Ámbito', { bold: true }), c('Norma', { bold: true })], [c('Estatal'), c('RD 1147/2011')]] };
  const tabla = tablasDe(definicion(base))[0];
  for (const f of tabla.table.body) {
    for (const celda of f) {
      assert.ok(!('alignment' in celda), 'una celda sin «alineacion» no puede llevar alignment');
      assert.equal(celda.fontSize, undefined, 'una celda sin «tamano» no puede llevar fontSize');
    }
  }
  // Y una celda que pide el valor por omisión escribiéndolo da la MISMA definición: por eso la
  // operación del editor borra la clave en lugar de guardarla.
  const conOmision = { filas: base.filas.map((f) => f.map((x) => ({ ...x, alineacion: 'izquierda', tamano: 'normal' }))) };
  assert.equal(puerta(conOmision), null, 'escribir el valor por omisión pasa la puerta');
  assert.deepStrictEqual(comparable(tablasDe(definicion(conOmision))[0]), comparable(tabla));
  // Y sin «anchos» cada columna mide lo que diga su texto, no un reparto a partes iguales.
  assert.equal(tabla.table.widths.length, 2);
  assert.notEqual(tabla.table.widths[0], tabla.table.widths[1], 'las dos columnas no miden lo mismo');
});

prueba('lo que la pantalla pinta es lo que se imprime: la alineación y el tamaño de cada celda coinciden con el PDF', async () => {
  const { u, doc } = await escenario();
  const peticion = await peticionDeForma(u.jefa, doc._id, 'tabla', { etiqueta: 'Formatos', filas: '3', columnas: '3' });
  const e0 = await (await estructuraDe(u.jefa, doc._id)).json();
  await cambio(await anadirCampo(u.jefa, doc._id, 'atencion-a-la-diversidad', { campo: peticion, esperaPlantillaVersion: e0.plantillaVersion }), 201);
  const { a, campo, valor } = await abrir(u.jefa, doc._id, 'atencion-a-la-diversidad', 'formatos');

  // Una tabla con las dos claves en todas sus combinaciones, montada con las operaciones del editor.
  // Todas las celdas llevan texto: en el Word el tamaño de letra va en el tramo, y una celda vacía
  // no tiene ninguno.
  let v = valor;
  for (let i = 0; i < 3; i += 1) {
    for (let j = 0; j < 3; j += 1) {
      v = Edicion.aplicar(v, 'texto', { fila: i, columna: j, valor: i === 0 && j === 0 ? 'marca-formatos' : `f${i}c${j}` });
    }
  }
  v = Edicion.aplicar(v, 'alineacion', { fila: 0, columna: 1, cual: 'centro' });
  v = Edicion.aplicar(v, 'alineacion', { fila: 0, columna: 2, cual: 'derecha' });
  v = Edicion.aplicar(v, 'tamano', { fila: 1, columna: 0, cual: 'pequena' });
  v = Edicion.aplicar(v, 'tamano', { fila: 1, columna: 1, cual: 'grande' });
  v = Edicion.aplicar(v, 'alineacion', { fila: 2, columna: 0, cual: 'centro' });
  v = Edicion.aplicar(v, 'tamano', { fila: 2, columna: 0, cual: 'pequena' });
  v = Edicion.aplicar(v, 'ancho', { columna: 0, hacia: 'ensanchar' });
  sale(v, 'la tabla del editor');
  const r = await guardarValor(u.jefa, doc._id, 'atencion-a-la-diversidad', a, campo.id, v);
  assert.equal(r.status, 200, 'guardar: ' + JSON.stringify(await r.json()));

  const definicion = await definicionDe(u.jefa, doc._id);
  const tabla = tablasDe(definicion).find((t) => textosDe(t).flat().includes('marca-formatos'));
  assert.ok(tabla, 'la tabla no sale en el PDF');
  // La pantalla consulta `alineacionEfectiva` y `tamanoEfectivo`; el PDF escribe `alignment` y
  // `fontSize`. Lo que dicen de cada celda tiene que ser lo mismo, traducido.
  const ALINEACION = { centro: 'center', derecha: 'right' };
  const TAMANO = { pequena: 8, grande: 12 };
  assert.deepEqual(tabla.table.body.map((f) => f.map((x) => x.alignment)),
    alineacionesDe(v).map((f) => f.map((x) => ALINEACION[x])),
    'la pantalla y el PDF tienen que decir lo mismo de la alineación de cada celda');
  assert.deepEqual(tabla.table.body.map((f) => f.map((x) => x.fontSize)),
    tamanosDe(v).map((f) => f.map((x) => TAMANO[x])),
    'la pantalla y el PDF tienen que decir lo mismo del tamaño de letra de cada celda');
  // Y el ancho elegido a mano llega: la pulsada es la más ancha y las otras dos quedan iguales.
  const w = tabla.table.widths;
  assert.equal(w.length, 3);
  assert.ok(w[0] > w[1], `la columna ensanchada no es la más ancha: ${JSON.stringify(w)}`);
  assert.equal(w[1], w[2], 'las otras dos se reparten por igual');
  const pct = Edicion.porcentajesDe(v);
  assert.ok(Math.abs((w[0] * 100) / w.reduce((x, y) => x + y, 0) - pct[0]) < 1,
    `el porcentaje de la pantalla (${pct[0]} %) no es el del PDF (${JSON.stringify(w)})`);

  // Y en el Word: la alineación va en `w:jc` y el tamaño en `w:sz`, en medios puntos.
  const zip = await JSZip.loadAsync(Buffer.from(await (await Docx.GET(pet(`/api/documentos/${doc._id}/docx`, u.jefa), { id: doc._id })).arrayBuffer()));
  const xml = await zip.file('word/document.xml').async('string');
  const trozo = xml.slice(xml.indexOf('marca-formatos'));
  const tbl = trozo.slice(0, trozo.indexOf('</w:tbl>'));
  assert.ok(tbl.includes('<w:jc w:val="center"/>'), 'la celda centrada no llega al Word');
  assert.ok(tbl.includes('<w:jc w:val="right"/>'), 'la celda a la derecha no llega al Word');
  assert.ok(tbl.includes('<w:sz w:val="16"/>'), 'la letra pequeña no llega al Word (8 pt = 16 medios puntos)');
  assert.ok(tbl.includes('<w:sz w:val="24"/>'), 'la letra grande no llega al Word (12 pt = 24 medios puntos)');
  // Los anchos: la rejilla de la tabla va antes de sus celdas, así que las tres últimas columnas
  // declaradas hasta la marca son las de esta tabla. La pulsada es la más ancha, en dxa.
  const cols = [...xml.slice(0, xml.indexOf('marca-formatos')).matchAll(/<w:gridCol w:w="(\d+)"\/>/g)].map((m) => Number(m[1]));
  assert.ok(cols.length >= 3, 'no se encuentran las columnas de la tabla en el Word');
  const ultimas = cols.slice(-3);
  assert.ok(ultimas[0] > ultimas[1], `la columna ensanchada no es la más ancha en el Word: ${JSON.stringify(ultimas)}`);
  assert.equal(ultimas[1], ultimas[2], 'las otras dos se reparten por igual en el Word');
});

// ================================================================ las importadas torcidas

// Las cuatro maneras en que el Word deja una tabla que una creada aquí nunca tendría, y que la
// puerta solo perdona mientras la forma no cambie.
const TORCIDAS = {
  'diecisiete columnas': { filas: [ancho17('cab', true), ancho17('a'), ancho17('b')] },
  'una fila más corta que la primera': { filas: [[c('A', { bold: true }), c('B', { bold: true }), c('C', { bold: true })], [c('1'), c('2')], [c('3'), c('4'), c('5')]] },
  'una fila más larga que la primera': { filas: [[c('A', { bold: true }), c('B', { bold: true })], [c('1'), c('2'), c('3')], [c('4'), c('5')]] },
  'un rowspan que se sale por el final': { filas: [[c('A', { bold: true }), c('B', { bold: true })], [c('Saberes', { rowspan: 4 }), c('x')], [c('y')]] },
};
function ancho17(prefijo, negrita) {
  return Array.from({ length: 17 }, (_, j) => c(`${prefijo}${j + 1}`, negrita ? { bold: true } : undefined));
}
const CAMPO_IMPORTADO = { id: 't', tipo: 'tabla', etiqueta: 'Tabla del Word', columnas: ['a'] };

// Lo que dice la puerta del servidor de un cambio, con la tabla guardada delante.
const puertaConGuardada = (nuevo, guardada) => Est.motivoDeCampo(CAMPO_IMPORTADO, nuevo, { guardado: guardada });

prueba('en una importada torcida se puede escribir y dar estilo, y la puerta del servidor lo acepta', () => {
  for (const [nombre, t] of Object.entries(TORCIDAS)) {
    assert.ok(puerta(t), `${nombre}: la tabla de partida no pasa la puerta entera`);
    assert.equal(puertaConGuardada(t, t), null, `${nombre}: tal cual se guarda`);
    const cambios = [
      ['texto', { fila: 0, columna: 0, valor: 'corregido' }],
      ['negrita', { fila: 1, columna: 0, puesta: true }],
      ['fondo', { fila: 1, columna: 0, cual: 'etiqueta' }],
      ['alineacion', { fila: 1, columna: 0, cual: 'centro' }],
      ['tamano', { fila: 1, columna: 0, cual: 'grande' }],
    ];
    for (const [op, args] of cambios) {
      assert.equal(Edicion.motivoDeNo(t, op, args), null, `${nombre}: ${op}`);
      const r = Edicion.aplicar(t, op, args);
      assert.notEqual(r, t, `${nombre}: ${op} no hizo nada`);
      assert.equal(puertaConGuardada(r, t), null, `${nombre}: ${op} no pasa la puerta con lo guardado`);
    }
  }
});

prueba('en una importada torcida las operaciones de forma se niegan con el defecto y lo que sí se puede hacer', () => {
  const formas = [
    ['anadir-fila', {}, /añadirle filas/],
    ['quitar-fila', { fila: 1 }, /quitarle filas/],
    ['anadir-columna', {}, /añadirle columnas/],
    ['quitar-columna', { columna: 0 }, /quitarle columnas/],
    ['combinar', { fila: 1, columna: 0, hacia: 'derecha' }, /combinar sus celdas/],
    ['separar', { fila: 1, columna: 0 }, /separar sus celdas/],
  ];
  const defecto = {
    'diecisiete columnas': /17 columnas: el máximo son 12/,
    'una fila más corta que la primera': /fila 2 de la tabla es más corta que la primera/,
    'una fila más larga que la primera': /fila 2 de la tabla es más ancha que la primera/,
    'un rowspan que se sale por el final': /se combina con 3 filas hacia abajo/,
  };
  for (const [nombre, t] of Object.entries(TORCIDAS)) {
    for (const [op, args, accion] of formas) {
      const m = Edicion.motivoDeNo(t, op, args);
      assert.ok(m, `${nombre}: ${op} debía negarse`);
      assert.ok(/venía del Word/.test(m) && defecto[nombre].test(m), `${nombre}: ${op}: ${m}`);
      assert.ok(/Se puede escribir en ella y darle estilo/.test(m) && accion.test(m), `${nombre}: ${op}: ${m}`);
      assert.ok(!/\.\./.test(m), `punto doble: ${m}`);
      assert.equal(Edicion.aplicar(t, op, args), t);
    }
  }
  // Y la puerta del servidor diría 400 a lo que los botones apagados impiden.
  const t = TORCIDAS['diecisiete columnas'];
  const masFilas = { filas: [...t.filas, ancho17('n')] };
  assert.ok(puertaConGuardada(masFilas, t), 'un cambio de forma en la misma tabla se rechaza');
  const mas = Edicion.motivoDeNo(t, 'anadir-columna', {});
  assert.ok(/17 columnas/.test(mas) && /no añadirle columnas|pero no añadirle columnas/.test(mas));
});

prueba('una importada que cuadra sigue pudiendo cambiar de forma, y una creada aquí no cambia', () => {
  const t = plana(['a', 'b'], ['c', 'd']);
  assert.equal(Edicion.motivoDeNo(t, 'anadir-fila', {}), null);
  assert.equal(Edicion.motivoDeNo(t, 'combinar', { fila: 0, columna: 0, hacia: 'derecha' }), null);
  // Con doce columnas exactas se puede quitar, y añadir se niega por el tope, no por «venía del Word».
  const doce = { filas: [Array.from({ length: 12 }, (_, j) => c('x' + j))] };
  assert.equal(Edicion.motivoDeNo(doce, 'quitar-columna', { columna: 0 }), null);
  assert.ok(/más de 12 columnas/.test(Edicion.motivoDeNo(doce, 'anadir-columna', {})));
});

prueba('los anchos en una importada torcida: sí en 17 columnas, con fila corta y con rowspan; no con una fila más larga', () => {
  const ancha = TORCIDAS['diecisiete columnas'];
  assert.equal(Edicion.motivoDeNo(ancha, 'ancho', { columna: 16, hacia: 'ensanchar' }), null);
  const conAnchos = Edicion.aplicar(ancha, 'ancho', { columna: 16, hacia: 'ensanchar' });
  assert.equal(conAnchos.anchos.length, 17);
  assert.equal(puertaConGuardada(conAnchos, ancha), null, 'los anchos de una tabla de 17 columnas se guardan');
  assert.equal(Est.columnasDeRejilla(ancha.filas), 17);

  for (const nombre of ['una fila más corta que la primera', 'un rowspan que se sale por el final']) {
    const t = TORCIDAS[nombre];
    assert.equal(Est.columnasDeRejilla(t.filas), Edicion.columnasDe(t), nombre);
    const r = Edicion.aplicar(t, 'ancho', { columna: 0, hacia: 'ensanchar' });
    assert.notEqual(r, t, nombre);
    assert.equal(r.anchos.length, Edicion.columnasDe(t));
    assert.equal(puertaConGuardada(r, t), null, nombre);
  }

  // Con una fila más ancha que la primera, el generador dibuja 3 columnas y la primera fila cuenta 2.
  const larga = TORCIDAS['una fila más larga que la primera'];
  assert.equal(Edicion.columnasDe(larga), 2);
  assert.equal(Est.columnasDeRejilla(larga.filas), 3);
  const m = Edicion.motivoDeNo(larga, 'ancho', { columna: 0, hacia: 'ensanchar' });
  assert.ok(/fila más ancha que la primera/.test(m) && /se repartirán solas/.test(m), m);
  assert.equal(Edicion.aplicar(larga, 'ancho', { columna: 0, hacia: 'ensanchar' }), larga);
  // Los dos anchos a mano que no encajan con lo que dibuja el generador los rechaza la puerta.
  assert.ok(/2 proporciones.*3 columnas/.test(puertaConGuardada({ ...larga, anchos: [1, 1] }, larga)));
  assert.equal(puertaConGuardada({ ...larga, anchos: [1, 1, 1] }, larga), null);
  // Sin anchos guardados no hay nada que volver a automático, y lo dice.
  assert.ok(/ya se reparten solas/.test(Edicion.motivoDeNo(larga, 'anchos-automaticos', {})));
});

prueba('una importada que nadie toca da exactamente la misma definición del PDF, aunque se abra y se guarde tal cual', async () => {
  const { u, doc } = await escenario();
  const antes = JSON.stringify(tablasDe(await definicionDe(u.jefa, doc._id)));
  const { a, valor } = await abrir(u.jefa, doc._id, 'introduccion', 'tabla_normativa');
  assert.equal(valor, a.valores.tabla_normativa, 'abrirla no cambia el valor');
  // Los gestos que no cambian nada devuelven el mismo objeto: no hay nada que guardar.
  let v = valor;
  v = Edicion.aplicar(v, 'texto', { fila: 0, columna: 0, valor: v.filas[0][0].text });
  v = Edicion.aplicar(v, 'negrita', { fila: 0, columna: 0, puesta: v.filas[0][0].bold === true });
  v = Edicion.aplicar(v, 'alineacion', { fila: 0, columna: 0, cual: 'izquierda' });
  v = Edicion.aplicar(v, 'tamano', { fila: 0, columna: 0, cual: 'normal' });
  v = Edicion.aplicar(v, 'fondo', { fila: 0, columna: 0, cual: null });
  assert.equal(v, valor);
  assert.equal((await guardarValor(u.jefa, doc._id, 'introduccion', a, 'tabla_normativa', v)).status, 200);
  assert.equal(JSON.stringify(tablasDe(await definicionDe(u.jefa, doc._id))), antes);
});

prueba('una importada torcida se guarda por el PATCH con un cambio de texto o de estilo, y un cambio de forma da 400', async () => {
  const { u, doc } = await escenario();
  const { a, campo, valor } = await abrir(u.jefa, doc._id, 'introduccion', 'tabla_torcida');
  assert.equal(Edicion.esEditable(campo, a.valores.tabla_torcida), true);
  assert.ok(puerta(valor), 'de partida no pasaría la puerta entera');

  const escrita = Edicion.aplicar(valor, 'texto', { fila: 1, columna: 0, valor: 'LOE (derogada)' });
  assert.notEqual(escrita, valor);
  assert.equal((await guardarValor(u.jefa, doc._id, 'introduccion', a, 'tabla_torcida', escrita)).status, 200);
  assert.ok(impreso(await definicionDe(u.jefa, doc._id), 'LOE (derogada)'));

  const leida = await abrir(u.jefa, doc._id, 'introduccion', 'tabla_torcida');
  const estilo = Edicion.aplicar(Edicion.aplicar(leida.valor, 'negrita', { fila: 2, columna: 0, puesta: true }),
    'alineacion', { fila: 2, columna: 0, cual: 'centro' });
  assert.equal((await guardarValor(u.jefa, doc._id, 'introduccion', leida.a, 'tabla_torcida', estilo)).status, 200);

  // El editor no deja llegar a esto (el botón sale apagado), pero el servidor tiene que cerrarlo igual.
  const otra = await abrir(u.jefa, doc._id, 'introduccion', 'tabla_torcida');
  const deForma = { ...otra.valor, filas: [...otra.valor.filas, [c('x'), c('y')]] };
  const r = await guardarValor(u.jefa, doc._id, 'introduccion', otra.a, 'tabla_torcida', deForma);
  assert.equal(r.status, 400);
  assert.ok(/más corta que la primera/.test(JSON.stringify(await r.json())));
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
    : `\n${total} pruebas del editor de tablas correctas`);
  process.exit(fallos ? 1 : 0);
}

ejecutar();
