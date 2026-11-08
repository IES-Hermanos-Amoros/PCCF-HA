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

prueba('solo se edita lo creado en la aplicación: una tabla importada y las demás siguen en lectura', () => {
  assert.equal(Edicion.esEditable(campoCreado({ tipo: 'tabla' })), true);
  assert.equal(Edicion.esEditable(campoCreado({ tipo: 'tabla_clave_valor' })), true);
  assert.equal(Edicion.esEditable({ id: 't', tipo: 'tabla', etiqueta: 'Normativa', columnas: ['a', 'b'] }), false);
  assert.equal(Edicion.esEditable({ id: 'k', tipo: 'tabla_clave_valor', etiqueta: 'Ficha' }), false);
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

prueba('las celdas combinadas no se crean, no se pierden, y mientras estén no se cambia la forma', () => {
  const combinada = { filas: [
    [c('Título', { bold: true, colspan: 2 })],
    [c('a'), c('b')],
  ] };
  assert.equal(Est.motivoDeRejilla(combinada, 'la tabla'), null);
  assert.equal(Edicion.tieneCombinadas(combinada), true);
  assert.equal(Edicion.columnasDe(combinada), 2);
  for (const [op, args] of [['anadir-fila', {}], ['quitar-fila', { fila: 1 }], ['anadir-columna', {}], ['quitar-columna', { columna: 0 }]]) {
    assert.ok(/combinadas/.test(Edicion.motivoDeNo(combinada, op, args)), op);
    assert.equal(Edicion.aplicar(combinada, op, args), combinada, op);
  }
  // El texto y la cabecera sí, conservando colspan.
  const escrita = Edicion.aplicar(combinada, 'texto', { fila: 1, columna: 1, valor: 'B' });
  assert.equal(escrita.filas[1][1].text, 'B');
  assert.equal(escrita.filas[0][0].colspan, 2);
  const sin = Edicion.aplicar(combinada, 'cabecera', { puesta: false });
  assert.equal(sin.filas[0][0].colspan, 2);
  assert.equal(Est.motivoDeRejilla(sin, 'la tabla'), null);
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

prueba('la tabla importada del Word no se ofrece al editor, aunque se pueda guardar por la API', async () => {
  const { u, doc } = await escenario();
  const { campo } = await abrir(u.jefa, doc._id, 'introduccion', 'tabla_normativa');
  assert.equal(campo.tipo, 'tabla');
  assert.equal(Edicion.esEditable(campo), false);
  assert.equal((await abrir(u.jefa, doc._id, 'introduccion', 'texto')).campo.tipo, 'texto_largo');
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
