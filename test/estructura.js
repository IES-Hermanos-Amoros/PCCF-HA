// La estructura editable del documento: renombrar, añadir, mover y retirar apartados, con la
// plantilla versionada.
//
//   node test/estructura.js
//
// Sin levantar Next, sin red y sin base de datos: las rutas se llaman directamente con un `Request`
// normal, igual que en test/api.js, test/edicion.js, test/estructurados.js y test/arrastre.js
// (docs/api.md, primera regla de forma).
//
// QUÉ SE PRUEBA, Y POR QUÉ ESTAS COSAS
//
// Es la mitad de servidor del E6 (docs/plan.md §5), y su criterio de aceptación tiene dos mitades:
//
//   «Añadir un apartado, escribir en él y exportar; y que un documento del curso anterior siga
//    abriéndose con su plantilla antigua.»
//
// Las dos están aquí, y la segunda es la que de verdad vigila el diseño: se hacen los cuatro cambios
// en el documento del curso nuevo y se comprueba que la definición de pdfmake del curso anterior es
// EXACTAMENTE la de antes del cambio. Si algún día la estructura se guardara en un sitio compartido
// por los dos cursos, esta prueba es la que se pondría roja.
//
// Lo demás es la regla que no se puede romper y lo que pasa cuando algo va mal:
//
//   · RENOMBRAR NO CAMBIA EL ID. Se escribe antes y se lee después: si el id fuera el slug del
//     título, el contenido se quedaría huérfano y la lectura devolvería un apartado vacío. Es el
//     fallo que esta prueba existe para que no vuelva.
//   · RETIRAR NO BORRA. El contenido sigue en `apartados` y el apartado se restaura con él.
//   · BORRAR SÍ, Y SOLO LO RETIRADO. Destruye las filas de todas las unidades y del subárbol, o la clave
//     del campo en todas ellas, y un campo nuevo con el mismo id no resucita lo viejo.
//   · UN APARTADO DE MÓDULO ES DE LA PLANTILLA: el cambio sale en los once módulos a la vez, y la
//     respuesta lo dice para que la interfaz lo pueda advertir.
//   · La versión de la plantilla sube con cada cambio, y no sube con un cambio rechazado.
//   · Quien no puede, no puede: el docente no cambia la estructura y la jefatura de estudios tampoco.
//
// El orden del PDF se comprueba sobre la DEFINICIÓN DE pdfmake y no sobre los bytes, que es la misma
// decisión de test/ida-y-vuelta.js, test/edicion.js y test/arrastre.js: `buildDocDefinition` es una
// función pura de { plantilla, datos }, así que si la definición lleva el apartado en su sitio, el
// PDF lo imprime ahí; y cuando algo falla, la definición dice qué nodo cambió.
//
// EL ARNÉS ES EL DE test/arrastre.js
//
// Copiado y no importado, a propósito: una prueba que depende de otra se rompe cuando alguien toca
// la otra. Cada prueba monta su propio almacén, porque todas escriben.

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


// Retirar y borrar un campo, y borrar un apartado. El borrado es un DELETE sin cuerpo, o con el
// `esperaPlantillaVersion` si se quiere.
const urlCampo = (id, seccion, campo, accion) => `/api/documentos/${id}/estructura/apartado/campo${accion ? `/${accion}` : ''}`
  + `?seccion=${encodeURIComponent(seccion)}&campo=${encodeURIComponent(campo)}`;

const anadirCampo = (persona, id, seccion, campo) => Estructura.ANADIR_CAMPO(
  pet(`/api/documentos/${id}/estructura/apartado/campo?seccion=${encodeURIComponent(seccion)}`, persona,
    { metodo: 'POST', cuerpo: { campo } }),
  { id },
);

const retirarCampo = (persona, id, seccion, campo) => Estructura.RETIRAR_CAMPO(
  pet(urlCampo(id, seccion, campo, 'retirar'), persona, { metodo: 'POST', cuerpo: {} }), { id },
);

const borrar = (persona, id, seccion, cuerpo) => Estructura.BORRAR(
  pet(`/api/documentos/${id}/estructura/apartado?seccion=${encodeURIComponent(seccion)}`, persona,
    { metodo: 'DELETE', cuerpo }),
  { id },
);

const borrarCampo = (persona, id, seccion, campo, cuerpo) => Estructura.BORRAR_CAMPO(
  pet(urlCampo(id, seccion, campo), persona, { metodo: 'DELETE', cuerpo }), { id },
);

// Todo lo que un borrado rechazado tiene que dejar igual: las filas, la versión y la plantilla.
async function instantanea(repo, id) {
  const d = await repo.documentos.obtener(id);
  return { filas: await foto(repo, id), version: d.plantillaVersion, plantilla: JSON.stringify(d.plantilla), asignaciones: JSON.stringify(d.asignaciones) };
}

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

// ================================================================ 1. el criterio de aceptación

prueba('añadir un apartado, escribir en él y que salga en el PDF', async () => {
  const { repo, u, doc } = await escenario();

  const hecho = await cambio(await anadir(u.jefa, doc._id, { titulo: 'Materiales en valenciano' }), 201);
  assert.equal(hecho.seccion, 'materiales-en-valenciano', 'el id sale del título con el que nace');
  assert.equal(hecho.titulo, 'Materiales en valenciano');
  assert.equal(hecho.plantillaVersion, 2, 'el cambio deja una versión nueva de la plantilla');
  assert.equal(hecho.afectaUnidades, false, 'es un apartado común: no toca los módulos');
  assert.equal(hecho.cambio.tipo, 'anadido');

  // Está en el árbol, con su título y editable por quien lo ha añadido.
  const nodo = (await nodosDe(u.jefa, doc._id)).find((n) => n.seccion === 'materiales-en-valenciano');
  assert.ok(nodo, 'el apartado nuevo no sale en el árbol');
  assert.equal(nodo.titulo, 'Materiales en valenciano');
  assert.equal(nodo.contenido, true, 'un apartado en el que no se puede escribir no vale de nada');
  assert.equal(nodo.puedeEditar, true, 'la jefatura tiene que poder escribir en el apartado que acaba de crear');
  assert.equal(nodo.relleno, false);

  // Se abre vacío, con sus campos, y se escribe en él.
  const abierto = await (await leer(u.jefa, doc._id, 'materiales-en-valenciano', null)).json();
  assert.equal(abierto.existe, false, 'nadie lo ha escrito todavía');
  assert.deepStrictEqual(abierto.valores, {});
  assert.deepStrictEqual(abierto.campos.map((x) => x.tipo), ['texto_largo']);

  const texto = [{ type: 'p', text: 'Los apuntes del módulo están también en valenciano.' }];
  assert.equal((await escribir(u.jefa, doc._id, 'materiales-en-valenciano', null, { texto })).status, 200);
  assert.deepStrictEqual((await guardados(repo, doc._id, 'materiales-en-valenciano')).valores, { texto });

  // Y sale impreso, con su encabezado y su párrafo.
  const definicion = await definicionDe(u.jefa, doc._id);
  assert.ok(encabezados(definicion, 'h1').includes('5. Materiales en valenciano'),
    `el apartado nuevo no sale en el tomo: ${encabezados(definicion, 'h1').join(' · ')}`);
  assert.ok(impreso(definicion, 'Los apuntes del módulo están también en valenciano.'),
    'lo escrito en el apartado nuevo no llega al PDF');
});

prueba('un documento del curso anterior se sigue abriendo y exportando igual después de cambiar la estructura del nuevo', async () => {
  const { repo, u, doc } = await escenario();
  const nuevoId = await cursoNuevo(u, doc);

  // La foto del curso anterior ANTES de tocar nada en el nuevo.
  const antesPdf = comparable(await definicionDe(u.ana, doc._id));
  const antesArbol = JSON.stringify(await nodosDe(u.jefa, doc._id));
  const antesFilas = await foto(repo, doc._id);
  const antesVersion = (await repo.documentos.obtener(doc._id)).plantillaVersion;

  // Los cuatro cambios, en el documento del curso nuevo.
  await cambio(await anadir(u.jefa, nuevoId, { titulo: 'Plan de refuerzo' }), 201);
  await escribir(u.jefa, nuevoId, 'plan-de-refuerzo', null, { texto: [{ type: 'p', text: 'Refuerzo en septiembre.' }] });
  await cambio(await renombrar(u.jefa, nuevoId, 'introduccion', { titulo: 'Presentación del ciclo' }));
  await cambio(await mover(u.jefa, nuevoId, 'anexos', { delta: -1 }));
  await cambio(await retirar(u.jefa, nuevoId, 'atencion-a-la-diversidad'));
  // Y el borrado definitivo de lo retirado, que es el único cambio que destruye contenido.
  await cambio(await borrar(u.jefa, nuevoId, 'atencion-a-la-diversidad'));

  // El curso anterior, exactamente igual. Cualquier diferencia es estructura que se ha colado de un
  // curso al otro, y el `deepStrictEqual` sobre la definición dice qué nodo.
  assert.deepStrictEqual(comparable(await definicionDe(u.ana, doc._id)), antesPdf,
    'el PDF del curso anterior cambia al cambiar la estructura del curso nuevo');
  assert.equal(JSON.stringify(await nodosDe(u.jefa, doc._id)), antesArbol, 'el árbol del curso anterior cambia');
  assert.deepStrictEqual(diferencias(antesFilas, await foto(repo, doc._id)), [], 'algún apartado del curso anterior cambia');

  const anterior = await repo.documentos.obtener(doc._id);
  assert.equal(anterior.plantillaVersion, antesVersion, 'la versión de la plantilla del curso anterior se mueve');
  assert.equal(anterior.plantilla.cambios, undefined, 'los cambios del curso nuevo se apuntan en el curso anterior');

  // Y se sigue abriendo con su plantilla antigua: el apartado retirado en el curso nuevo sigue ahí,
  // con su título de siempre.
  const viejo = await (await leer(u.jefa, doc._id, 'atencion-a-la-diversidad', null)).json();
  assert.equal(viejo.existe, true);
  assert.equal(viejo.titulo, 'Atención a la diversidad');
  assert.equal((await (await leer(u.jefa, doc._id, 'introduccion', null)).json()).titulo, 'Introducción',
    'el renombrado del curso nuevo le cambia el título al anterior');
  // Y el apartado que el curso nuevo ha añadido no existe en el viejo.
  await esError(await leer(u.jefa, doc._id, 'plan-de-refuerzo', null), 404, 'no_encontrado');
});

prueba('el curso siguiente nace con la estructura que el anterior tenía en ese momento', async () => {
  const { repo, u, doc } = await escenario();

  // Se cambia la estructura ANTES de arrastrar: el documento nuevo tiene que heredar eso.
  await cambio(await anadir(u.jefa, doc._id, { titulo: 'Plan de refuerzo' }), 201);
  await cambio(await renombrar(u.jefa, doc._id, 'introduccion', { titulo: 'Presentación del ciclo' }));
  await cambio(await retirar(u.jefa, doc._id, 'anexos'));
  const version = (await repo.documentos.obtener(doc._id)).plantillaVersion;

  const nuevoId = await cursoNuevo(u, doc);
  const nuevo = await repo.documentos.obtener(nuevoId);
  assert.equal(nuevo.plantillaVersion, version, 'el curso nuevo nace con la versión de plantilla del viejo');

  const secciones = await raizDelArbol(u.jefa, nuevoId);
  assert.ok(secciones.includes('plan-de-refuerzo'), 'el apartado añadido no se hereda');
  assert.ok(!secciones.includes('anexos'), 'el apartado retirado vuelve en el curso nuevo');

  // Pero SIGUE EN LA PLANTILLA del curso nuevo, retirado, y por tanto se puede restaurar allí.
  // Arrastrar el curso no puede borrar lo que retirar prometió no borrar, y el contenido de un
  // apartado retirado sí se copia: sin el apartado al que pertenece quedaría inalcanzable.
  const retiradosNuevo = (await (await estructuraDe(u.jefa, nuevoId)).json()).retirados;
  assert.deepStrictEqual(retiradosNuevo.map((x) => x.seccion), ['anexos'],
    'el apartado retirado no se puede restaurar en el curso nuevo porque no ha viajado');
  await cambio(await restaurar(u.jefa, nuevoId, 'anexos'));
  assert.ok((await raizDelArbol(u.jefa, nuevoId)).includes('anexos'),
    'restaurado en el curso nuevo, el apartado no vuelve al árbol');
  assert.equal((await (await leer(u.jefa, nuevoId, 'introduccion', null)).json()).titulo, 'Presentación del ciclo',
    'el título nuevo no se hereda');

  // Y desde aquí los dos van por su cuenta: un cambio en el nuevo no toca al viejo.
  await cambio(await renombrar(u.jefa, nuevoId, 'introduccion', { titulo: 'Otra cosa' }));
  assert.equal((await (await leer(u.jefa, doc._id, 'introduccion', null)).json()).titulo, 'Presentación del ciclo');
});

// ================================================================ 2. el id no cambia

prueba('renombrar no cambia el id y el contenido sigue donde estaba', async () => {
  const { repo, u, doc } = await escenario();

  // Se escribe ANTES de renombrar: si el id fuera el slug del título, esto se quedaría huérfano.
  const texto = [{ type: 'p', text: 'Texto que no se puede perder al renombrar.' }];
  assert.equal((await escribir(u.jefa, doc._id, 'introduccion', null, { texto })).status, 200);
  const antesFilas = await foto(repo, doc._id);

  const hecho = await cambio(await renombrar(u.jefa, doc._id, 'introduccion', { titulo: 'Presentación del ciclo' }));
  assert.equal(hecho.seccion, 'introduccion', 'el id es el de siempre');
  assert.equal(hecho.titulo, 'Presentación del ciclo');
  assert.equal(hecho.cambio.antes, 'Introducción', 'el cambio apunta de qué título venía');

  // Se lee DESPUÉS, por el mismo id, y el contenido está donde estaba.
  const despues = await (await leer(u.jefa, doc._id, 'introduccion', null)).json();
  assert.equal(despues.existe, true, 'el contenido se ha quedado huérfano: el id ha cambiado');
  assert.equal(despues.titulo, 'Presentación del ciclo', 'el título es la etiqueta, y es lo único que cambia');
  assert.deepStrictEqual(despues.valores.texto, texto);

  // Ni una fila de contenido tocada: no hay datos que migrar.
  assert.deepStrictEqual(diferencias(antesFilas, await foto(repo, doc._id)), [],
    'renombrar ha tocado alguna fila de contenido');

  // El árbol lo pinta con el mismo id y el título nuevo, y el PDF también.
  const nodo = (await nodosDe(u.jefa, doc._id)).find((n) => n.clave === 'introduccion');
  assert.ok(nodo);
  assert.equal(nodo.titulo, 'Presentación del ciclo');
  const definicion = await definicionDe(u.jefa, doc._id);
  assert.ok(encabezados(definicion, 'h1').includes('1. Presentación del ciclo'));
  assert.ok(!impreso(definicion, '1. Introducción'), 'el PDF sigue imprimiendo el título viejo');
  // Y los subapartados siguen colgando de él, con sus ids.
  assert.ok((await nodosDe(u.jefa, doc._id)).some((n) => n.seccion === 'introduccion/contextualizacion'));
});

prueba('el id de un apartado añadido se genera una vez y no cambia al renombrarlo', async () => {
  const { u, doc } = await escenario();
  const hecho = await cambio(await anadir(u.jefa, doc._id, { titulo: 'Anexo de coordinación' }), 201);
  assert.equal(hecho.seccion, 'anexo-de-coordinacion');

  await escribir(u.jefa, doc._id, hecho.seccion, null, { texto: [{ type: 'p', text: 'Actas de coordinación.' }] });
  await cambio(await renombrar(u.jefa, doc._id, hecho.seccion, { titulo: 'Anexo de seguimiento' }));

  const leido = await (await leer(u.jefa, doc._id, 'anexo-de-coordinacion', null)).json();
  assert.equal(leido.titulo, 'Anexo de seguimiento');
  assert.equal(leido.valores.texto[0].text, 'Actas de coordinación.', 'el id nace del título original y ahí se queda');
});

prueba('la numeración del título no se guarda: la pone el documento por posición', async () => {
  const { u, doc } = await escenario();
  const hecho = await cambio(await anadir(u.jefa, doc._id, { titulo: '7. Anexos de la memoria' }), 201);
  assert.equal(hecho.titulo, 'Anexos de la memoria', 'el número de delante es del documento, no del título');
  assert.equal(hecho.seccion, 'anexos-de-la-memoria');
  assert.ok(encabezados(await definicionDe(u.jefa, doc._id), 'h1').includes('5. Anexos de la memoria'));
});

// ================================================================ 3. retirar no borra

prueba('retirar conserva el contenido, y el apartado se restaura con él', async () => {
  const { repo, u, doc } = await escenario();
  const antesPdf = comparable(await definicionDe(u.jefa, doc._id));
  const antesFilas = await foto(repo, doc._id);

  const hecho = await cambio(await retirar(u.jefa, doc._id, 'atencion-a-la-diversidad'));
  assert.equal(hecho.cambio.tipo, 'retirado');
  assert.equal(hecho.apartadosAfectados, 1);
  assert.equal(hecho.retirados, 1);

  // Ya no es parte del documento: no sale en el árbol, no se abre, no se escribe y no se imprime.
  assert.ok(!(await nodosDe(u.jefa, doc._id)).some((n) => n.seccion === 'atencion-a-la-diversidad'));
  await esError(await leer(u.jefa, doc._id, 'atencion-a-la-diversidad', null), 404, 'no_encontrado');
  await esError(
    await guardar(u.jefa, doc._id, 'atencion-a-la-diversidad', null, { valores: { texto: [] }, esperaUpdatedAt: null }),
    404, 'no_encontrado',
  );
  assert.ok(!impreso(await definicionDe(u.jefa, doc._id), 'Medidas de nivel II y III.'),
    'un apartado retirado sigue imprimiéndose');

  // Pero NO SE HA BORRADO NADA: la fila sigue con su contenido, y ninguna otra se ha tocado.
  assert.deepStrictEqual(diferencias(antesFilas, await foto(repo, doc._id)), [],
    'retirar ha tocado alguna fila de contenido');
  assert.equal((await guardados(repo, doc._id, 'atencion-a-la-diversidad')).valores.texto[0].text, 'Medidas de nivel II y III.');

  // Y se restaura con todo lo que tenía: el documento vuelve a ser el de antes, hasta el PDF.
  const vuelto = await cambio(await restaurar(u.jefa, doc._id, 'atencion-a-la-diversidad'));
  assert.equal(vuelto.cambio.tipo, 'restaurado');
  assert.equal(vuelto.retirados, 0);
  const leido = await (await leer(u.jefa, doc._id, 'atencion-a-la-diversidad', null)).json();
  assert.equal(leido.existe, true);
  assert.equal(leido.valores.texto[0].text, 'Medidas de nivel II y III.');
  assert.deepStrictEqual(comparable(await definicionDe(u.jefa, doc._id)), antesPdf,
    'restaurar no devuelve el documento a como estaba');
});

prueba('retirar un apartado se lleva su subárbol, y restaurarlo lo devuelve entero', async () => {
  const { repo, u, doc } = await escenario();
  // Hay algo escrito en el hijo: es lo que no se puede perder.
  await escribir(u.jefa, doc._id, 'anexos/actas', null, { texto: [{ type: 'p', text: 'Acta de la reunión de marzo.' }] });

  const hecho = await cambio(await retirar(u.jefa, doc._id, 'anexos'));
  assert.equal(hecho.cambio.conHijos, 1, 'la respuesta tiene que decir que no se va solo');
  assert.equal(hecho.apartadosAfectados, 2);

  const secciones = (await nodosDe(u.jefa, doc._id)).map((n) => n.seccion);
  assert.ok(!secciones.includes('anexos'));
  assert.ok(!secciones.includes('anexos/actas'), 'el hijo se queda suelto en el árbol');
  await esError(await leer(u.jefa, doc._id, 'anexos/actas', null), 404, 'no_encontrado');
  assert.equal((await guardados(repo, doc._id, 'anexos/actas')).valores.texto[0].text, 'Acta de la reunión de marzo.');

  // En la lista de retirados sale solo el padre, que es el que se restaura.
  const estructura = await (await estructuraDe(u.jefa, doc._id)).json();
  assert.deepStrictEqual(estructura.retirados.map((x) => x.seccion), ['anexos']);
  assert.equal(estructura.retirados[0].conHijos, 1);

  await cambio(await restaurar(u.jefa, doc._id, 'anexos'));
  const vueltas = (await nodosDe(u.jefa, doc._id)).map((n) => n.seccion);
  assert.ok(vueltas.includes('anexos') && vueltas.includes('anexos/actas'), 'el subárbol no vuelve entero');
  assert.equal((await (await leer(u.jefa, doc._id, 'anexos/actas', null)).json()).valores.texto[0].text,
    'Acta de la reunión de marzo.');
});

prueba('un apartado retirado deja de generar comprobaciones, y al restaurarlo vuelven', async () => {
  const { u, doc } = await escenario();
  const total = async () => (await (await validacionesDe(u.jefa, doc._id)).json()).total;
  const conTodo = await total();
  assert.ok(conTodo > 0, 'el documento de prueba tiene que disparar avisos');

  // Las ponderaciones son un apartado de módulo: al retirarlo desaparecen las de los once.
  await cambio(await retirar(u.jefa, doc._id, 'modulos/ponderaciones'));
  assert.equal(await total(), conTodo - MODULOS.length,
    'retirar un apartado de módulo no quita sus avisos de los once');

  await cambio(await restaurar(u.jefa, doc._id, 'modulos/ponderaciones'));
  assert.equal(await total(), conTodo);
});

// ================================================================ 4. mover

prueba('mover cambia el orden en el árbol y en el PDF', async () => {
  const { u, doc } = await escenario();
  const antes = await raizDelArbol(u.jefa, doc._id);
  assert.deepStrictEqual(antes, ['introduccion', 'atencion-a-la-diversidad', 'anexos', 'modulos']);
  const antesPdf = encabezados(await definicionDe(u.jefa, doc._id), 'h1');

  const hecho = await cambio(await mover(u.jefa, doc._id, 'anexos', { delta: -1 }));
  assert.equal(hecho.cambio.tipo, 'movido');
  assert.equal(hecho.cambio.delta, -1);
  assert.equal(hecho.cambio.posicion, 2, 'el cambio dice en qué sitio ha quedado');
  assert.equal(hecho.cambio.hermanos, 4);

  const despues = await raizDelArbol(u.jefa, doc._id);
  assert.deepStrictEqual(despues, ['introduccion', 'anexos', 'atencion-a-la-diversidad', 'modulos']);
  assert.equal(despues.length, antes.length, 'se ha perdido o duplicado algún apartado');

  // Y en el PDF, con la numeración rehecha: el «3. Anexos» impreso pasa a ser el «2. Anexos».
  const despuesPdf = encabezados(await definicionDe(u.jefa, doc._id), 'h1');
  assert.ok(antesPdf.includes('3. Anexos') && despuesPdf.includes('2. Anexos'),
    `el PDF no refleja el orden nuevo: ${despuesPdf.join(' · ')}`);
  assert.deepStrictEqual(despuesPdf.slice(0, 3), ['1. Introducción', '2. Anexos', '3. Atención a la diversidad']);
});

prueba('mover un apartado de dentro de otro solo le cambia el sitio entre sus hermanos', async () => {
  const { u, doc } = await escenario();
  const hijos = async () => (await nodosDe(u.jefa, doc._id))
    .filter((n) => n.unidadId === PROG && n.seccion.startsWith('modulos/'))
    .map((n) => n.seccion);
  const antes = await hijos();
  assert.deepStrictEqual(antes.slice(0, 2), ['modulos/metodologia', 'modulos/ponderaciones']);

  const hecho = await cambio(await mover(u.jefa, doc._id, 'modulos/ponderaciones', { delta: -1 }));
  assert.equal(hecho.afectaUnidades, true, 'es un apartado de módulo: hay que avisar');
  const despues = await hijos();
  assert.deepStrictEqual(despues.slice(0, 2), ['modulos/ponderaciones', 'modulos/metodologia']);
  assert.deepStrictEqual([...despues].sort(), [...antes].sort(), 'se ha perdido algún apartado del módulo');
  // Y el orden nuevo sale en los once módulos, porque es la plantilla.
  const todos = (await nodosDe(u.jefa, doc._id)).filter((n) => n.seccion === 'modulos/ponderaciones');
  assert.equal(todos.length, MODULOS.length);
});

prueba('mover el primero hacia arriba es un 400 que lo dice, y no cambia nada', async () => {
  const { repo, u, doc } = await escenario();
  const antes = await raizDelArbol(u.jefa, doc._id);

  const cuerpo = await esError(await mover(u.jefa, doc._id, 'introduccion', { delta: -1 }), 400, 'peticion');
  assert.ok(/primero/.test(cuerpo.mensaje), cuerpo.mensaje);
  // Y el último hacia abajo, lo mismo.
  await esError(await mover(u.jefa, doc._id, 'modulos', { delta: 1 }), 400, 'peticion');
  // Un desplazamiento que no mueve nada tampoco vale: un cambio que no cambia no sube la versión.
  await esError(await mover(u.jefa, doc._id, 'anexos', { delta: 0 }), 400, 'peticion');
  await esError(await mover(u.jefa, doc._id, 'anexos', { delta: 'arriba' }), 400, 'peticion');
  // Mover algo que no existe es un 404, como en /apartado.
  await esError(await mover(u.jefa, doc._id, 'seccion-inventada', { delta: 1 }), 404, 'no_encontrado');

  assert.deepStrictEqual(await raizDelArbol(u.jefa, doc._id), antes);
  assert.equal((await repo.documentos.obtener(doc._id)).plantillaVersion, 1,
    'un cambio rechazado ha subido la versión de la plantilla');
});

// ================================================================ 5. un apartado de módulo es de la plantilla

prueba('añadir un apartado de módulo lo añade en los once, y la respuesta lo advierte', async () => {
  const { u, doc } = await escenario();

  const hecho = await cambio(await anadir(u.jefa, doc._id, { padre: 'modulos', titulo: 'Materiales en valenciano' }), 201);
  assert.equal(hecho.seccion, 'modulos/materiales-en-valenciano', 'el id cuelga del de su padre');
  assert.equal(hecho.afectaUnidades, true, 'sin esto la interfaz no puede advertir de que cambia los once');
  assert.equal(hecho.unidades, MODULOS.length);

  const nuevos = (await nodosDe(u.jefa, doc._id)).filter((n) => n.seccion === 'modulos/materiales-en-valenciano');
  assert.equal(nuevos.length, MODULOS.length, 'uno por módulo');
  assert.deepStrictEqual(nuevos.map((n) => n.unidadId).sort(), [...MODULOS].sort());
  nuevos.forEach((n) => assert.equal(n.edita, 'docentes_del_modulo', 'hereda de su bloque quién lo edita'));

  // Y cada docente escribe en el suyo y solo en el suyo: el apartado nuevo nace con los permisos
  // de su bloque, no abierto a todo el mundo.
  const deAna = (await nodosDe(u.ana, doc._id)).filter((n) => n.seccion === 'modulos/materiales-en-valenciano');
  assert.equal(deAna.find((n) => n.unidadId === PROG).puedeEditar, true);
  assert.equal(deAna.find((n) => n.unidadId !== PROG).puedeEditar, false);

  const texto = [{ type: 'p', text: 'Apuntes en valenciano del módulo.' }];
  assert.equal((await escribir(u.ana, doc._id, 'modulos/materiales-en-valenciano', PROG, { texto })).status, 200);
  await esError(await escribir(u.ana, doc._id, 'modulos/materiales-en-valenciano', 'daw-0484', { texto }), 403, 'sin_permiso');
  assert.ok(impreso(await definicionDe(u.ana, doc._id, PROG), 'Apuntes en valenciano del módulo.'));
});

prueba('renombrar un apartado de módulo lo renombra en los once', async () => {
  const { u, doc } = await escenario();
  const hecho = await cambio(await renombrar(u.jefa, doc._id, 'modulos/metodologia', { titulo: 'Metodología y recursos' }));
  assert.equal(hecho.afectaUnidades, true);
  assert.equal(hecho.unidades, MODULOS.length);

  const nodos2 = (await nodosDe(u.jefa, doc._id)).filter((n) => n.seccion === 'modulos/metodologia');
  assert.equal(nodos2.length, MODULOS.length);
  nodos2.forEach((n) => assert.equal(n.titulo, 'Metodología y recursos'));

  // En el tomo sale once veces, una por módulo, y con el contenido de cada uno intacto.
  const definicion = await definicionDe(u.jefa, doc._id);
  const veces = encabezados(definicion, 'h3').filter((t) => t.endsWith('. Metodología y recursos')).length;
  assert.equal(veces, MODULOS.length, `el título nuevo sale ${veces} veces y hay ${MODULOS.length} módulos`);
  assert.ok(impreso(definicion, 'Metodología de Programación.'), 'renombrar ha perdido el contenido de un módulo');
});

prueba('retirar un apartado de módulo lo retira de los once, sin borrar el contenido de ninguno', async () => {
  const { repo, u, doc } = await escenario();
  const antesFilas = await foto(repo, doc._id);

  const hecho = await cambio(await retirar(u.jefa, doc._id, 'modulos/metodologia'));
  assert.equal(hecho.afectaUnidades, true);
  assert.equal((await nodosDe(u.jefa, doc._id)).filter((n) => n.seccion === 'modulos/metodologia').length, 0);
  assert.ok(!impreso(await definicionDe(u.jefa, doc._id), 'Metodología de Programación.'));

  // Las once filas siguen enteras.
  assert.deepStrictEqual(diferencias(antesFilas, await foto(repo, doc._id)), []);
  for (const unidadId of MODULOS) {
    const fila = await guardados(repo, doc._id, 'modulos/metodologia', unidadId);
    assert.ok(fila && fila.valores.texto, `se ha perdido la metodología de ${unidadId}`);
  }

  await cambio(await restaurar(u.jefa, doc._id, 'modulos/metodologia'));
  assert.ok(impreso(await definicionDe(u.jefa, doc._id), 'Metodología de Programación.'));
});

// ================================================================ 6. la versión de la plantilla

prueba('la versión de la plantilla sube con cada cambio, y el cambio queda apuntado', async () => {
  const { repo, u, doc } = await escenario();
  assert.equal((await repo.documentos.obtener(doc._id)).plantillaVersion, 1, 'la plantilla importada es la versión 1');

  const versiones = [];
  versiones.push((await cambio(await anadir(u.jefa, doc._id, { titulo: 'Plan de refuerzo' }), 201)).plantillaVersion);
  versiones.push((await cambio(await renombrar(u.jefa, doc._id, 'anexos', { titulo: 'Anexos y actas' }))).plantillaVersion);
  versiones.push((await cambio(await mover(u.jefa, doc._id, 'anexos', { delta: -1 }))).plantillaVersion);
  versiones.push((await cambio(await retirar(u.jefa, doc._id, 'anexos'))).plantillaVersion);
  versiones.push((await cambio(await restaurar(u.jefa, doc._id, 'anexos'))).plantillaVersion);
  assert.deepStrictEqual(versiones, [2, 3, 4, 5, 6]);

  const guardado = await repo.documentos.obtener(doc._id);
  assert.equal(guardado.plantillaVersion, 6, 'la versión guardada no es la que dice la respuesta');

  // Cada cambio deja su rastro dentro de la plantilla: qué, quién, cuándo y con qué versión.
  const cambios = guardado.plantilla.cambios;
  assert.deepStrictEqual(cambios.map((x) => x.tipo), ['anadido', 'renombrado', 'movido', 'retirado', 'restaurado']);
  assert.deepStrictEqual(cambios.map((x) => x.version), [2, 3, 4, 5, 6]);
  cambios.forEach((x) => {
    assert.equal(x.usuario, u.jefa._id, 'el cambio no dice quién lo hizo');
    assert.ok(!Number.isNaN(new Date(x.fecha).getTime()), 'el cambio no dice cuándo');
  });

  // Y la lectura de la estructura dice la misma versión, que es la que se devuelve al cambiar algo.
  const estructura = await (await estructuraDe(u.jefa, doc._id)).json();
  assert.equal(estructura.plantillaVersion, 6);
  assert.equal(estructura.cambios.length, 5);
});

prueba('un cambio con la versión que el cliente leyó pasa, y con una vieja es un 409', async () => {
  const { repo, u, doc } = await escenario();
  const leida = (await (await estructuraDe(u.jefa, doc._id)).json()).plantillaVersion;

  // Con la versión buena, pasa.
  await cambio(await renombrar(u.jefa, doc._id, 'anexos', { titulo: 'Anexos y actas', esperaPlantillaVersion: leida }));

  // Con la misma otra vez —la que el cliente leyó antes de que alguien cambiara la estructura— no.
  const cuerpo = await esError(
    await renombrar(u.jefa, doc._id, 'anexos', { titulo: 'Otra cosa', esperaPlantillaVersion: leida }), 409, 'conflicto',
  );
  assert.equal(cuerpo.esperado, leida);
  assert.equal(cuerpo.actual, leida + 1, 'el 409 dice qué versión hay ahora');

  const guardado = await repo.documentos.obtener(doc._id);
  assert.equal(guardado.plantillaVersion, leida + 1, 'el conflicto ha escrito algo');
  assert.equal((await (await leer(u.jefa, doc._id, 'anexos', null)).json()).titulo, 'Anexos y actas',
    'el cambio rechazado se ha aplicado');
  // Y una versión que no es un número entero es un 400, no un «guarda de todas formas».
  await esError(await renombrar(u.jefa, doc._id, 'anexos', { titulo: 'X', esperaPlantillaVersion: '2' }), 400, 'peticion');
});

// ================================================================ 7. quién puede

prueba('un docente no cambia la estructura (403), y la jefatura de estudios tampoco', async () => {
  const { repo, u, doc } = await escenario();
  const antes = JSON.stringify(await (await estructuraDe(u.jefa, doc._id)).json());

  for (const persona of [u.ana, u.luis, u.estudios]) {
    await esError(await anadir(persona, doc._id, { titulo: 'Apartado de tapadillo' }), 403, 'sin_permiso');
    await esError(await renombrar(persona, doc._id, 'introduccion', { titulo: 'Otra cosa' }), 403, 'sin_permiso');
    await esError(await mover(persona, doc._id, 'anexos', { delta: -1 }), 403, 'sin_permiso');
    await esError(await retirar(persona, doc._id, 'anexos'), 403, 'sin_permiso');
    await esError(await restaurar(persona, doc._id, 'anexos'), 403, 'sin_permiso');
  }

  assert.equal(JSON.stringify(await (await estructuraDe(u.jefa, doc._id)).json()), antes, 'algo ha cambiado');
  assert.equal((await repo.documentos.obtener(doc._id)).plantillaVersion, 1);
});

prueba('un docente de su propio módulo tampoco cambia la plantilla de los módulos', async () => {
  const { u, doc } = await escenario();
  // Ana lleva Programación y puede escribir en sus apartados, pero no decide qué apartados hay.
  assert.equal((await escribir(u.ana, doc._id, 'modulos/metodologia', PROG, { texto: [{ type: 'p', text: 'Lo mío.' }] })).status, 200);
  await esError(await renombrar(u.ana, doc._id, 'modulos/metodologia', { titulo: 'Mi metodología' }), 403, 'sin_permiso');
  await esError(await anadir(u.ana, doc._id, { padre: 'modulos', titulo: 'Lo que yo diga' }), 403, 'sin_permiso');
});

prueba('la jefatura del departamento cambia la estructura, y el soporte también', async () => {
  const { u, doc } = await escenario();
  await cambio(await anadir(u.jefa, doc._id, { titulo: 'De la jefatura' }), 201);
  await cambio(await anadir(u.admin, doc._id, { titulo: 'Del soporte' }), 201);
  const secciones = await raizDelArbol(u.jefa, doc._id);
  assert.ok(secciones.includes('de-la-jefatura') && secciones.includes('del-soporte'));
});

prueba('sin persona identificada es un 401, y un documento de otro departamento un 404', async () => {
  const { repo, u, doc, otro } = await escenario();
  await esError(await anadir(null, doc._id, { titulo: 'Sin entrar' }), 401, 'sin_identificar');
  await esError(await estructuraDe(null, doc._id), 401, 'sin_identificar');
  await esError(await retirar(null, doc._id, 'anexos'), 401, 'sin_identificar');

  // Pepe es de matemáticas: para él este documento no está (docs/api.md, «404 y no 403»).
  await esError(await anadir(u.pepe, doc._id, { titulo: 'Desde otro departamento' }), 404, 'no_encontrado');
  await esError(await estructuraDe(u.pepe, doc._id), 404, 'no_encontrado');
  // Y la jefatura de informática no cambia la estructura del de matemáticas.
  await esError(await anadir(u.jefa, otro._id, { titulo: 'En el de al lado' }), 404, 'no_encontrado');

  assert.equal((await repo.documentos.obtener(doc._id)).plantillaVersion, 1);
  assert.equal((await repo.documentos.obtener(otro._id)).plantillaVersion, 1);
});

prueba('la estructura la ve quien ve el documento, y dice si quien pregunta puede cambiarla', async () => {
  const { u, doc } = await escenario();
  const deLaJefa = await (await estructuraDe(u.jefa, doc._id)).json();
  assert.equal(deLaJefa.puedeCambiar, true);
  assert.equal(deLaJefa.plantillaVersion, 1);
  assert.equal(deLaJefa.unidades, MODULOS.length);
  assert.deepStrictEqual(deLaJefa.retirados, []);
  assert.deepStrictEqual(deLaJefa.cambios, []);

  // Una fila por apartado de la plantilla, en orden de lectura, con qué se le puede hacer.
  const porId = new Map(deLaJefa.apartados.map((x) => [x.seccion, x]));
  assert.deepStrictEqual(deLaJefa.apartados.slice(0, 3).map((x) => x.seccion),
    ['introduccion', 'introduccion/contextualizacion', 'atencion-a-la-diversidad']);
  assert.equal(porId.get('introduccion').puedeSubir, false, 'el primero no se puede subir');
  assert.equal(porId.get('introduccion').puedeBajar, true);
  assert.equal(porId.get('modulos').puedeBajar, false, 'el último no se puede bajar');
  assert.equal(porId.get('modulos').instancias, true);
  assert.equal(porId.get('modulos/metodologia').deUnidades, true, 'la interfaz tiene que poder advertir');
  assert.equal(porId.get('introduccion').deUnidades, false);
  assert.equal(porId.get('anexos').contenido, false, '«Anexos» solo agrupa');
  assert.equal(porId.get('modulos/situaciones-de-aprendizaje/situacion').repetidor, true);
  assert.equal(porId.get('modulos/situaciones-de-aprendizaje/situacion').admiteHijos, false);

  // El docente la ve y no la cambia: el cliente refleja el candado, no lo decide.
  const deAna = await (await estructuraDe(u.ana, doc._id)).json();
  assert.equal(deAna.puedeCambiar, false);
  assert.deepStrictEqual(deAna.apartados.map((x) => x.seccion), deLaJefa.apartados.map((x) => x.seccion));
});

// ================================================================ 8. lo que puede ir mal

prueba('dos apartados con el mismo título no comparten id ni contenido', async () => {
  const { u, doc } = await escenario();
  const a = await cambio(await anadir(u.jefa, doc._id, { titulo: 'Anexo' }), 201);
  const b = await cambio(await anadir(u.jefa, doc._id, { titulo: 'Anexo' }), 201);
  assert.equal(a.seccion, 'anexo');
  assert.equal(b.seccion, 'anexo-2', 'el segundo no puede quedarse con el id del primero');

  // Y el que choca con uno que ya traía la plantilla tampoco se lo come.
  const c2 = await cambio(await anadir(u.jefa, doc._id, { titulo: 'Anexos' }), 201);
  assert.equal(c2.seccion, 'anexos-2');
  assert.equal((await (await leer(u.jefa, doc._id, 'anexos', null)).json()).titulo, 'Anexos',
    'el apartado de la plantilla ha cambiado de título');

  // Lo escrito en uno no sale en el otro: son dos apartados, no dos nombres del mismo.
  await escribir(u.jefa, doc._id, 'anexo', null, { texto: [{ type: 'p', text: 'El primero.' }] });
  await escribir(u.jefa, doc._id, 'anexo-2', null, { texto: [{ type: 'p', text: 'El segundo.' }] });
  assert.equal((await (await leer(u.jefa, doc._id, 'anexo', null)).json()).valores.texto[0].text, 'El primero.');
  assert.equal((await (await leer(u.jefa, doc._id, 'anexo-2', null)).json()).valores.texto[0].text, 'El segundo.');
  const definicion = await definicionDe(u.jefa, doc._id);
  assert.ok(impreso(definicion, 'El primero.') && impreso(definicion, 'El segundo.'));
});

prueba('un apartado sin título no se añade, y uno con un título imposible tampoco', async () => {
  const { repo, u, doc } = await escenario();
  await esError(await anadir(u.jefa, doc._id, {}), 400, 'peticion');
  await esError(await anadir(u.jefa, doc._id, { titulo: '   ' }), 400, 'peticion');
  await esError(await anadir(u.jefa, doc._id, { titulo: 42 }), 400, 'peticion');
  await esError(await anadir(u.jefa, doc._id, { titulo: 'x'.repeat(Plantilla.LARGO_TITULO + 1) }), 400, 'peticion');
  await esError(await anadir(u.jefa, doc._id, 'no es json'), 400, 'peticion');
  // Renombrar a nada tampoco: el título es lo que se pinta.
  await esError(await renombrar(u.jefa, doc._id, 'anexos', { titulo: '' }), 400, 'peticion');
  await esError(await renombrar(u.jefa, doc._id, 'anexos', {}), 400, 'peticion');

  assert.equal((await repo.documentos.obtener(doc._id)).plantillaVersion, 1, 'algo rechazado ha subido la versión');
});

prueba('no se cuelga un apartado de donde no puede ir', async () => {
  const { u, doc } = await escenario();
  // De una lista de fichas: lo de dentro son los campos de cada ficha, no apartados.
  const cuerpo = await esError(
    await anadir(u.jefa, doc._id, { padre: 'modulos/situaciones-de-aprendizaje/situacion', titulo: 'Material' }),
    400, 'peticion',
  );
  assert.ok(/fichas/.test(cuerpo.mensaje), cuerpo.mensaje);
  // De un padre que no existe: 404, igual que en /apartado.
  await esError(await anadir(u.jefa, doc._id, { padre: 'no-existe', titulo: 'Material' }), 404, 'no_encontrado');
  // Y un padre que no es un texto es un enlace mal construido.
  await esError(await anadir(u.jefa, doc._id, { padre: 7, titulo: 'Material' }), 400, 'peticion');
});

prueba('retirar dos veces, restaurar lo que no está retirado y restaurar un hijo sin su padre', async () => {
  const { repo, u, doc } = await escenario();
  await cambio(await retirar(u.jefa, doc._id, 'anexos'));

  // Dos veces no: el apartado ya no es parte del documento, y el segundo intento no cambia nada.
  await esError(await retirar(u.jefa, doc._id, 'anexos'), 400, 'peticion');
  // Lo que no está retirado no se restaura.
  await esError(await restaurar(u.jefa, doc._id, 'introduccion'), 400, 'peticion');
  // Y un hijo de algo retirado no vuelve solo: se dice cuál hay que restaurar primero, en lugar de
  // dejarlo escondido y que quien lo pidió crea que ya está.
  const cuerpo = await esError(await restaurar(u.jefa, doc._id, 'anexos/actas'), 400, 'peticion');
  assert.ok(/Anexos/.test(cuerpo.mensaje), cuerpo.mensaje);
  // Tampoco se renombra ni se mueve lo que está retirado.
  await esError(await renombrar(u.jefa, doc._id, 'anexos', { titulo: 'Anexos y actas' }), 400, 'peticion');
  await esError(await mover(u.jefa, doc._id, 'anexos', { delta: -1 }), 400, 'peticion');
  await esError(await anadir(u.jefa, doc._id, { padre: 'anexos', titulo: 'Más actas' }), 400, 'peticion');

  assert.equal((await repo.documentos.obtener(doc._id)).plantillaVersion, 2, 'solo cuajó el primer cambio');
  assert.deepStrictEqual((await (await estructuraDe(u.jefa, doc._id)).json()).retirados.map((x) => x.seccion), ['anexos']);
});

prueba('mover entre hermanos no se salta a los retirados: lo que se mueve es lo que se ve', async () => {
  const { u, doc } = await escenario();
  // Se retira el segundo de los cuatro: subir el tercero tiene que ponerlo primero de los visibles.
  await cambio(await retirar(u.jefa, doc._id, 'atencion-a-la-diversidad'));
  assert.deepStrictEqual(await raizDelArbol(u.jefa, doc._id), ['introduccion', 'anexos', 'modulos']);

  await cambio(await mover(u.jefa, doc._id, 'anexos', { delta: -1 }));
  assert.deepStrictEqual(await raizDelArbol(u.jefa, doc._id), ['anexos', 'introduccion', 'modulos'],
    'el movimiento se ha gastado en el hermano retirado y parece que no ha hecho nada');

  // Y al restaurar el retirado vuelve donde estaba, sin alterar el orden de los demás.
  await cambio(await restaurar(u.jefa, doc._id, 'atencion-a-la-diversidad'));
  const final = await raizDelArbol(u.jefa, doc._id);
  assert.equal(final.length, 4);
  assert.ok(final.indexOf('anexos') < final.indexOf('introduccion'), 'el orden que se eligió no se ha conservado');
});

prueba('la sección se pide en la URL, y sin ella es un 400', async () => {
  const { u, doc } = await escenario();
  const sinSeccion = (ruta, metodo) => Estructura[ruta](
    pet(`/api/documentos/${doc._id}/estructura/apartado`, u.jefa, { metodo, cuerpo: { titulo: 'X', delta: 1 } }),
    { id: doc._id },
  );
  await esError(await sinSeccion('RENOMBRAR', 'PATCH'), 400, 'peticion');
  await esError(await sinSeccion('MOVER', 'POST'), 400, 'peticion');
  await esError(await sinSeccion('RETIRAR', 'POST'), 400, 'peticion');
  await esError(await sinSeccion('RESTAURAR', 'POST'), 400, 'peticion');
});

// ================================================================ 9. el resto del documento no se entera

prueba('cambiar la estructura no toca ni una fila de contenido, ni el reparto, ni las unidades', async () => {
  const { repo, u, doc } = await escenario();
  const antesFilas = await foto(repo, doc._id);
  const antesUnidades = JSON.stringify(await repo.unidades.listar(doc._id));
  const antes = await repo.documentos.obtener(doc._id);

  await cambio(await anadir(u.jefa, doc._id, { padre: 'modulos', titulo: 'Materiales' }), 201);
  await cambio(await renombrar(u.jefa, doc._id, 'introduccion', { titulo: 'Presentación' }));
  await cambio(await mover(u.jefa, doc._id, 'anexos', { delta: -1 }));
  await cambio(await retirar(u.jefa, doc._id, 'anexos'));

  assert.deepStrictEqual(diferencias(antesFilas, await foto(repo, doc._id)), [],
    'un cambio de estructura ha tocado el contenido: habría que migrar datos');
  assert.equal(JSON.stringify(await repo.unidades.listar(doc._id)), antesUnidades, 'las unidades han cambiado');

  const despues = await repo.documentos.obtener(doc._id);
  for (const campo of ['tipo', 'ciclo', 'curso', 'departamento', 'estado', 'anteriorId', 'origen']) {
    assert.deepStrictEqual(despues[campo], antes[campo], `ha cambiado «${campo}»`);
  }
  assert.deepStrictEqual(despues.asignaciones, antes.asignaciones, 'el reparto de apartados comunes ha cambiado');
});

prueba('el Word exportado dice lo mismo que el PDF y que el árbol', async () => {
  // Las cinco rutas que leen la plantilla —árbol, apartado, PDF, Word y comprobaciones— pasan por
  // la misma poda (`abrirDocumento` en app/_lib/rutas/comun.js). Esta prueba es la que vigila que el
  // Word no se quede fuera: es la exportación que menos se mira y la que nadie revisaría a tiempo.
  const { u, doc } = await escenario();
  await cambio(await anadir(u.jefa, doc._id, { titulo: 'Materiales en valenciano' }), 201);
  await escribir(u.jefa, doc._id, 'materiales-en-valenciano', null, { texto: [{ type: 'p', text: 'Apuntes en valenciano.' }] });
  await cambio(await renombrar(u.jefa, doc._id, 'introduccion', { titulo: 'Presentación del ciclo' }));
  await cambio(await retirar(u.jefa, doc._id, 'atencion-a-la-diversidad'));

  const respuesta = await Docx.GET(pet(`/api/documentos/${doc._id}/docx`, u.jefa), { id: doc._id });
  assert.equal(respuesta.status, 200);
  const zip = await JSZip.loadAsync(Buffer.from(await respuesta.arrayBuffer()));
  const xml = await zip.file('word/document.xml').async('string');

  assert.ok(xml.includes('Materiales en valenciano'), 'el apartado añadido no llega al Word');
  assert.ok(xml.includes('Apuntes en valenciano.'), 'lo escrito en el apartado añadido no llega al Word');
  assert.ok(xml.includes('Presentación del ciclo'), 'el título nuevo no llega al Word');
  assert.ok(!xml.includes('Atención a la diversidad'), 'el apartado retirado se sigue exportando a Word');
  assert.ok(!xml.includes('Medidas de nivel II y III.'), 'el contenido del apartado retirado se exporta');
});

prueba('el apartado añadido se arrastra al curso siguiente con su contenido', async () => {
  const { repo, u, doc } = await escenario();
  await cambio(await anadir(u.jefa, doc._id, { padre: 'modulos', titulo: 'Materiales' }), 201);
  await escribir(u.ana, doc._id, 'modulos/materiales', PROG, { texto: [{ type: 'p', text: 'Materiales de Programación.' }] });

  const nuevoId = await cursoNuevo(u, doc);
  const fila = await guardados(repo, nuevoId, 'modulos/materiales', PROG);
  assert.ok(fila, 'el apartado añadido no llega al curso siguiente');
  assert.equal(fila.origen, 'heredado');
  assert.equal(fila.valores.texto[0].text, 'Materiales de Programación.');
  assert.ok(impreso(await definicionDe(u.ana, nuevoId, PROG), 'Materiales de Programación.'));
});


// ================================================================ 9. borrar de verdad

prueba('borrar algo que no está retirado es un 400 que dice que primero hay que retirarlo, y no cambia nada', async () => {
  const { repo, u, doc } = await escenario();
  const antes = await instantanea(repo, doc._id);

  const e = await esError(await borrar(u.jefa, doc._id, 'atencion-a-la-diversidad'), 400, 'peticion');
  assert.match(e.mensaje, /retir/);
  assert.match(e.mensaje, /No se ha cambiado nada/);
  const c = await esError(await borrarCampo(u.jefa, doc._id, 'introduccion', 'texto'), 400, 'peticion');
  assert.match(c.mensaje, /retir/);

  assert.deepStrictEqual(await instantanea(repo, doc._id), antes, 'un borrado rechazado ha cambiado algo');
  assert.equal((await (await leer(u.jefa, doc._id, 'atencion-a-la-diversidad', null)).json()).valores.texto[0].text,
    'Medidas de nivel II y III.');

  // Un apartado escondido porque su padre está retirado tampoco: se borra el padre.
  await cambio(await retirar(u.jefa, doc._id, 'introduccion'));
  const hijo = await esError(await borrar(u.jefa, doc._id, 'introduccion/contextualizacion'), 400, 'peticion');
  assert.match(hijo.mensaje, /Introducción/);

  // Y lo que no existe es un 404, como en el resto de cambios.
  await esError(await borrar(u.jefa, doc._id, 'no-existe'), 404, 'no_encontrado');
  await esError(await borrarCampo(u.jefa, doc._id, 'atencion-a-la-diversidad', 'fantasma'), 404, 'no_encontrado');
  await esError(await Estructura.BORRAR(pet(`/api/documentos/${doc._id}/estructura/apartado`, u.jefa, { metodo: 'DELETE' }), { id: doc._id }),
    400, 'peticion');
});

prueba('borrar un apartado retirado destruye su contenido, y restaurarlo ya no lo encuentra', async () => {
  const { repo, u, doc } = await escenario();
  assert.ok(await guardados(repo, doc._id, 'atencion-a-la-diversidad'));
  await cambio(await retirar(u.jefa, doc._id, 'atencion-a-la-diversidad'));

  const hecho = await cambio(await borrar(u.jefa, doc._id, 'atencion-a-la-diversidad'));
  assert.equal(hecho.cambio.tipo, 'borrado');
  assert.equal(hecho.filasBorradas, 1);
  assert.equal(hecho.apartadosAfectados, 1);
  assert.equal(hecho.retirados, 0);

  assert.equal(await guardados(repo, doc._id, 'atencion-a-la-diversidad'), null, 'la fila sigue guardada');
  assert.deepStrictEqual((await repo.apartados.listar(doc._id)).filter((f) => f.seccion === 'atencion-a-la-diversidad'), []);
  await esError(await leer(u.jefa, doc._id, 'atencion-a-la-diversidad', null), 404, 'no_encontrado');
  await esError(await restaurar(u.jefa, doc._id, 'atencion-a-la-diversidad'), 404, 'no_encontrado');
  const e = await (await estructuraDe(u.jefa, doc._id)).json();
  assert.deepStrictEqual(e.retirados, []);
  assert.ok(!e.apartados.some((x) => x.seccion === 'atencion-a-la-diversidad'));
  assert.ok(!impreso(await definicionDe(u.jefa, doc._id), 'Medidas de nivel II y III.'));

  // El reparto de ese apartado se va con él, y un apartado nuevo con el mismo título nace vacío y
  // sin nadie asignado: ni el texto ni el permiso resucitan.
  assert.equal(Object.prototype.hasOwnProperty.call((await repo.documentos.obtener(doc._id)).asignaciones, 'atencion-a-la-diversidad'), false);
  const nuevo = await cambio(await anadir(u.jefa, doc._id, { titulo: 'Atención a la diversidad' }), 201);
  assert.equal(nuevo.seccion, 'atencion-a-la-diversidad', 'el id se vuelve a generar igual');
  const abierto = await (await leer(u.luis, doc._id, 'atencion-a-la-diversidad', null)).json();
  assert.equal(abierto.existe, false);
  assert.deepStrictEqual(abierto.valores, {});
  assert.equal(abierto.puedeEditar, false, 'la persona asignada al apartado borrado conserva el permiso');
});

prueba('la confirmación de un borrado acepta el título sin tildes, y no se cumple sola', async () => {
  // La confirmación del borrado definitivo es teclear el título (BorrarDefinitivo.js). Lo que tiene
  // que costar es el ACTO de escribirlo, no acertar con las tildes: hay títulos reales de 124
  // caracteres y la mayoría llevan acentos, así que exigirlos exactos empujaría a copiar y pegar,
  // que es lo que anula la deliberación.
  const T = 'Atención a la diversidad';
  assert.equal(Plantilla.mismoTitulo('Atención a la diversidad', T), true);
  assert.equal(Plantilla.mismoTitulo('atencion a la diversidad', T), true, 'exige las tildes');
  assert.equal(Plantilla.mismoTitulo('  ATENCION   a la Diversidad ', T), true, 'exige mayúsculas o espacios exactos');

  // Pero sigue siendo el título, no cualquier cosa.
  assert.equal(Plantilla.mismoTitulo('otra cosa', T), false);
  assert.equal(Plantilla.mismoTitulo('Atención', T), false, 'media palabra vale por el título');
  assert.equal(Plantilla.mismoTitulo('', T), false, 'el cuadro vacío confirma el borrado');
  assert.equal(Plantilla.mismoTitulo('   ', T), false);

  // Y NO hereda el recorte de `slug`: un título largo hay que escribirlo entero, no sus 50
  // primeros caracteres. Ese recorte está para generar identificadores, no para confirmar nada.
  const largo = 'Criterios generales sobre la organización, comunicación y desarrollo del proceso de evaluación del aprendizaje';
  assert.equal(Plantilla.slug(largo).length, 50, 'slug ha dejado de recortar: revisa mismoTitulo');
  assert.equal(Plantilla.mismoTitulo(largo.slice(0, 60), largo), false, 'media confirmación vale por entera');
  assert.equal(Plantilla.mismoTitulo(largo, largo), true);
});

prueba('si el contenido no se puede destruir, el cambio ya esta hecho y la respuesta lo dice', async () => {
  // Pasó de verdad: el servidor de desarrollo guarda el repositorio en `globalThis` y sobrevive a la
  // recarga en caliente, así que después de añadir `apartados.borrar` el que estaba en pie seguía sin
  // tenerlo. El cambio de estructura se escribía y la destrucción del contenido estallaba.
  //
  // Lo que NO se puede contestar entonces es un error: un error dice «no se sabe si se ha llegado a
  // borrar», y aquí sí se sabe. El apartado se ha ido y no vuelve. Lo que no se sabe es si lo que
  // tenía escrito sigue guardado, y eso es lo que hay que decir, porque nadie iría a buscarlo solo.
  const { repo, u, doc } = await escenario();
  assert.ok(await guardados(repo, doc._id, 'atencion-a-la-diversidad'), 'el apartado tiene que empezar con algo escrito');
  await cambio(await retirar(u.jefa, doc._id, 'atencion-a-la-diversidad'));

  const bueno = repo.apartados.borrar;
  repo.apartados.borrar = () => { throw new Error('repo.apartados.borrar is not a function'); };
  let hecho;
  try {
    hecho = await cambio(await borrar(u.jefa, doc._id, 'atencion-a-la-diversidad'));
  } finally {
    repo.apartados.borrar = bueno;
  }

  // El cambio de estructura SÍ se hizo: eso es lo que se contesta.
  assert.equal(hecho.cambio.tipo, 'borrado');
  assert.equal(hecho.retirados, 0);
  const e = await (await estructuraDe(u.jefa, doc._id)).json();
  assert.ok(!e.apartados.some((x) => x.seccion === 'atencion-a-la-diversidad'), 'el apartado sigue en la estructura');
  await esError(await restaurar(u.jefa, doc._id, 'atencion-a-la-diversidad'), 404, 'no_encontrado');

  // Y la otra mitad se dice en voz alta, con el motivo, en lugar de tragarse el fallo.
  assert.ok(hecho.contenidoSinDestruir, 'la respuesta no avisa de que el contenido sigue guardado');
  assert.match(hecho.contenidoSinDestruir, /borrar is not a function/);
  assert.ok(await guardados(repo, doc._id, 'atencion-a-la-diversidad'), 'esta prueba no ha simulado el fallo');

  // Cuando no falla nada, no se avisa de nada.
  await cambio(await retirarCampo(u.jefa, doc._id, 'introduccion', 'tabla_normativa'));
  const limpio = await cambio(await borrarCampo(u.jefa, doc._id, 'introduccion', 'tabla_normativa'));
  assert.equal(limpio.contenidoSinDestruir, undefined, 'avisa de un fallo que no ha habido');
});

prueba('de un título largo se pide teclear sus primeras palabras, y la cadena es exacta', async () => {
  // Teclear el título entero es la confirmación, pero hay títulos reales de 124 caracteres y 143 de
  // los 466 apartados del departamento pasan de 40: a esa longitud la confirmación se cumple
  // copiando y pegando, que es lo que anula la deliberación que busca. Así que de un título largo
  // se piden sus primeras palabras, y la cadena exacta va escrita en la pantalla.
  const largo = 'Criterios generales sobre la organización, comunicación y desarrollo del proceso de evaluación del aprendizaje';
  assert.ok(largo.length > Plantilla.LARGO_CONFIRMACION, 'la prueba no vale si el título es corto');
  const pedido = Plantilla.loQueHayQueEscribir(largo);
  assert.equal(pedido, 'Criterios generales sobre la');
  assert.ok(pedido.length <= Plantilla.LARGO_CONFIRMACION, `se piden ${pedido.length} caracteres`);
  // Palabras enteras: media palabra no se sabe escribir sin mirarla letra por letra.
  assert.ok(largo.startsWith(pedido), 'lo que se pide no es el principio del título');
  assert.ok(!/\s$/.test(pedido) && !/^\s/.test(pedido));
  assert.equal(largo[pedido.length], ' ', 'se ha cortado una palabra por la mitad');

  // Lo que se pide confirma, con las tildes y sin ellas.
  assert.equal(Plantilla.confirmaTitulo(pedido, largo), true);
  assert.equal(Plantilla.confirmaTitulo('criterios generales sobre la', largo), true, 'exige las tildes');
  assert.equal(Plantilla.confirmaTitulo('  CRITERIOS   Generales sobre la ', largo), true);
  // Y el título completo también: está escrito en el aviso de lo que se va a perder, y quien lo
  // escriba todo ha hecho más de lo que se le pedía.
  assert.equal(Plantilla.confirmaTitulo(largo, largo), true);

  // Pero sigue costando el acto: menos de lo que se pide no vale, ni el cuadro vacío.
  assert.equal(Plantilla.confirmaTitulo('Criterios generales', largo), false);
  assert.equal(Plantilla.confirmaTitulo('Criterios', largo), false);
  assert.equal(Plantilla.confirmaTitulo('', largo), false);
  assert.equal(Plantilla.confirmaTitulo('otra cosa', largo), false);

  // Un título corto se sigue pidiendo ENTERO, y entonces lo que se pide es el título: así lo sabe
  // la pantalla, que dice «escribe su título» o «escribe las primeras palabras de su título» según
  // lo que diga `mismoTitulo` de la cadena pedida, sin repetir el recorte por su cuenta.
  const corto = 'Atención a la diversidad';
  assert.equal(Plantilla.loQueHayQueEscribir(corto), corto);
  assert.equal(Plantilla.mismoTitulo(Plantilla.loQueHayQueEscribir(corto), corto), true, 'es el título entero');
  assert.equal(Plantilla.mismoTitulo(pedido, largo), false, 'son solo las primeras palabras');
  assert.equal(Plantilla.confirmaTitulo('Atención', corto), false, 'media palabra vale por un título corto');

  // Un título de una sola palabra más larga que el tope se pide entero: es lo único que hay.
  const palabrota = 'Contextualizacionsocioeconomicaycultural del centro';
  assert.equal(Plantilla.loQueHayQueEscribir(palabrota), 'Contextualizacionsocioeconomicaycultural');

  // Y el recorte NO es el de `slug`, que recorta a 50 y puede partir una palabra por la mitad.
  assert.equal(Plantilla.slug(largo).length, 50, 'slug ha dejado de recortar: revisa esta prueba');
  assert.equal(Plantilla.confirmaTitulo(largo.slice(0, 50), largo), false, 'el recorte de slug confirma el borrado');

  // Sin título no hay nada que escribir y la confirmación no se puede dar por cumplida sola.
  assert.equal(Plantilla.loQueHayQueEscribir(''), '');
  assert.equal(Plantilla.loQueHayQueEscribir(null), '');
  assert.equal(Plantilla.confirmaTitulo('', ''), false);
  assert.equal(Plantilla.confirmaTitulo('cualquier cosa', ''), false);
});

prueba('borrar un apartado se lleva sus comentarios, y borrar un campo no toca ninguno', async () => {
  // Un hilo de comentarios habla de un apartado y se lista por `seccion` + `unidadId`. Si el
  // apartado se destruye y el hilo se queda, nadie puede volver a leerlo ni a borrarlo: la sección
  // ya no está en la plantilla, así que la ruta no la resuelve. Serían palabras de otras personas
  // guardadas para siempre y fuera de alcance, y «definitivamente» dejaría de significarlo.
  const { repo, u, doc } = await escenario();
  await repo.comentarios.crear({
    documentoId: doc._id, seccion: 'atencion-a-la-diversidad', unidadId: null, autor: 'ana', texto: 'Revisar las medidas.',
  });
  await repo.comentarios.crear({
    documentoId: doc._id, seccion: 'atencion-a-la-diversidad', unidadId: null, autor: 'luis', texto: 'De acuerdo.',
  });
  // Uno de otro apartado, que NO se puede llevar por delante.
  await repo.comentarios.crear({
    documentoId: doc._id, seccion: 'introduccion', unidadId: null, autor: 'ana', texto: 'La introducción está bien.',
  });
  assert.equal((await repo.comentarios.listar(doc._id)).length, 3);

  await cambio(await retirar(u.jefa, doc._id, 'atencion-a-la-diversidad'));
  const hecho = await cambio(await borrar(u.jefa, doc._id, 'atencion-a-la-diversidad'));
  assert.equal(hecho.comentariosBorrados, 2, 'los comentarios del apartado destruido siguen guardados');

  const quedan = await repo.comentarios.listar(doc._id);
  assert.equal(quedan.length, 1);
  assert.equal(quedan[0].seccion, 'introduccion', 'se ha llevado el comentario de otro apartado');

  // Borrar un CAMPO no toca ningún comentario: el hilo es del apartado, que sigue en pie.
  await cambio(await retirarCampo(u.jefa, doc._id, 'introduccion', 'tabla_normativa'));
  const deCampo = await cambio(await borrarCampo(u.jefa, doc._id, 'introduccion', 'tabla_normativa'));
  assert.equal(deCampo.comentariosBorrados, 0);
  assert.equal((await repo.comentarios.listar(doc._id)).length, 1, 'borrar un campo se ha llevado un comentario');
});

prueba('borrar un apartado se lleva el subárbol entero y las filas de todas las unidades', async () => {
  const { repo, u, doc } = await escenario();
  const raiz = 'modulos/situaciones-de-aprendizaje';
  const hijo = `${raiz}/situacion`;
  const filasDe = async () => (await repo.apartados.listar(doc._id)).filter((f) => f.seccion === raiz || f.seccion === hijo);
  const metodologia = (await repo.apartados.listar(doc._id)).filter((f) => f.seccion === 'modulos/metodologia').length;
  assert.equal((await filasDe()).length, MODULOS.length, 'la ficha de situación debería tener una fila por módulo');
  assert.equal(metodologia, MODULOS.length);

  await cambio(await retirar(u.jefa, doc._id, raiz));
  const hecho = await cambio(await borrar(u.jefa, doc._id, raiz));
  assert.equal(hecho.afectaUnidades, true);
  assert.equal(hecho.apartadosAfectados, 2, 'el apartado y su hijo');
  assert.equal(hecho.filasBorradas, MODULOS.length);
  assert.equal(hecho.contenido.conContenido, MODULOS.length);
  assert.equal(hecho.contenido.unidadesConContenido, MODULOS.length);

  assert.deepStrictEqual(await filasDe(), [], 'quedan filas del apartado o de su hijo');
  for (const unidadId of MODULOS) {
    assert.equal(await guardados(repo, doc._id, hijo, unidadId), null, `queda la ficha de ${unidadId}`);
  }
  assert.equal(Plantilla.buscar((await repo.documentos.obtener(doc._id)).plantilla, hijo), null, 'el hijo sigue en la plantilla');
  // Las demás, intactas.
  assert.equal((await repo.apartados.listar(doc._id)).filter((f) => f.seccion === 'modulos/metodologia').length, MODULOS.length);
  assert.equal((await guardados(repo, doc._id, 'modulos/metodologia', PROG)).valores.texto[0].text, 'Metodología de Programación.');
  // Y el otro documento no se entera.
  assert.ok((await repo.apartados.listar(doc._id)).length > 0);
});

prueba('borrar un apartado con un hijo que ya estaba retirado también lo destruye', async () => {
  const { repo, u, doc } = await escenario();
  await escribir(u.jefa, doc._id, 'introduccion/contextualizacion', null, { texto: [{ type: 'p', text: 'Contexto del centro.' }] });
  await cambio(await retirar(u.jefa, doc._id, 'introduccion/contextualizacion'));
  await cambio(await retirar(u.jefa, doc._id, 'introduccion'));

  const hecho = await cambio(await borrar(u.jefa, doc._id, 'introduccion'));
  assert.equal(hecho.filasBorradas, 2);
  assert.deepStrictEqual((await repo.apartados.listar(doc._id)).filter((f) => f.seccion.startsWith('introduccion')), []);
  assert.deepStrictEqual((await (await estructuraDe(u.jefa, doc._id)).json()).retirados, []);
});

prueba('borrar un campo retirado le quita la clave a todas las unidades, y un campo nuevo con el mismo id no resucita lo viejo', async () => {
  const { repo, u, doc } = await escenario();
  const seccion = 'modulos/metodologia';
  await cambio(await retirarCampo(u.jefa, doc._id, seccion, 'texto'));
  // Retirar conserva la clave en las once.
  for (const unidadId of MODULOS) {
    assert.ok((await guardados(repo, doc._id, seccion, unidadId)).valores.texto, `retirar ha quitado el texto de ${unidadId}`);
  }
  const antesOtros = await foto(repo, doc._id);

  const hecho = await cambio(await borrarCampo(u.jefa, doc._id, seccion, 'texto'));
  assert.equal(hecho.cambio.tipo, 'campo_borrado');
  assert.equal(hecho.filasBorradas, MODULOS.length);
  assert.equal(hecho.contenido.unidadesConContenido, MODULOS.length);
  assert.equal(hecho.camposRetirados, 0);

  for (const unidadId of MODULOS) {
    const fila = await guardados(repo, doc._id, seccion, unidadId);
    assert.ok(fila, `se ha borrado la fila entera de ${unidadId}`);
    assert.equal(Object.prototype.hasOwnProperty.call(fila.valores, 'texto'), false, `queda la clave en ${unidadId}`);
  }
  // Lo único que ha cambiado son esas once filas.
  const ahora = await foto(repo, doc._id);
  assert.deepStrictEqual(diferencias(antesOtros, ahora).sort(), MODULOS.map((m) => `${seccion}|${m}`).sort());
  assert.deepStrictEqual((await (await estructuraDe(u.jefa, doc._id)).json()).camposRetirados, []);

  // Un campo nuevo con el mismo id sale vacío en las once.
  const nuevo = await cambio(await anadirCampo(u.jefa, doc._id, seccion, { tipo: 'texto_largo', etiqueta: 'Texto' }), 201);
  assert.equal(nuevo.campos[0].id, 'texto', 'la prueba necesita que el campo nuevo reciba el mismo id');
  for (const unidadId of MODULOS) {
    const abierto = await (await leer(u.jefa, doc._id, seccion, unidadId)).json();
    assert.equal(abierto.valores.texto, undefined, `el texto viejo reaparece en ${unidadId}`);
  }
  assert.ok(!impreso(await definicionDe(u.ana, doc._id, PROG), 'Metodología de Programación.'));
});

prueba('quien leyó el campo antes de borrarlo no puede volver a escribirlo', async () => {
  const { repo, u, doc } = await escenario();
  const antes = await (await leer(u.ana, doc._id, 'modulos/metodologia', PROG)).json();
  await cambio(await retirarCampo(u.jefa, doc._id, 'modulos/metodologia', 'texto'));
  await cambio(await borrarCampo(u.jefa, doc._id, 'modulos/metodologia', 'texto'));
  const r = await guardar(u.ana, doc._id, 'modulos/metodologia', PROG,
    { valores: { texto: [{ type: 'p', text: 'Lo viejo.' }] }, esperaUpdatedAt: antes.updatedAt });
  // El campo ya no existe en el apartado, así que no hay dónde escribirlo.
  assert.equal(r.status, 400);
  assert.equal(Object.prototype.hasOwnProperty.call((await guardados(repo, doc._id, 'modulos/metodologia', PROG)).valores, 'texto'), false);
});

prueba('borrar deja la versión de la plantilla subida y el historial dice qué se destruyó', async () => {
  const { repo, u, doc } = await escenario();
  await cambio(await retirar(u.jefa, doc._id, 'modulos/metodologia'));
  assert.equal((await repo.documentos.obtener(doc._id)).plantillaVersion, 2);
  const hecho = await cambio(await borrar(u.jefa, doc._id, 'modulos/metodologia'));
  assert.equal(hecho.plantillaVersion, 3);
  assert.equal((await repo.documentos.obtener(doc._id)).plantillaVersion, 3);

  await cambio(await retirarCampo(u.jefa, doc._id, 'introduccion', 'tabla_normativa'));
  const campo = await cambio(await borrarCampo(u.jefa, doc._id, 'introduccion', 'tabla_normativa'));
  assert.equal(campo.plantillaVersion, 5);

  const { cambios } = await (await estructuraDe(u.jefa, doc._id)).json();
  const borrado = cambios.find((x) => x.tipo === 'borrado');
  assert.equal(borrado.seccion, 'modulos/metodologia');
  assert.equal(borrado.titulo, 'Metodología');
  assert.deepStrictEqual(borrado.secciones, ['modulos/metodologia']);
  assert.equal(borrado.apartados, 1);
  assert.equal(borrado.filas, MODULOS.length);
  assert.equal(borrado.conContenido, MODULOS.length);
  assert.equal(borrado.version, 3);
  assert.equal(borrado.usuario, u.jefa._id);
  assert.ok(borrado.fecha);
  const quitado = cambios.find((x) => x.tipo === 'campo_borrado');
  assert.equal(quitado.campo, 'tabla_normativa');
  assert.equal(quitado.filas, 1);
  assert.equal(quitado.conContenido, 1);
  assert.equal(quitado.version, 5);

  // Un borrado rechazado no sube la versión.
  await esError(await borrar(u.jefa, doc._id, 'anexos'), 400, 'peticion');
  assert.equal((await repo.documentos.obtener(doc._id)).plantillaVersion, 5);
});

prueba('borrar con la versión que el cliente leyó pasa, y con una vieja es un 409 que no destruye nada', async () => {
  const { repo, u, doc } = await escenario();
  await cambio(await retirar(u.jefa, doc._id, 'atencion-a-la-diversidad'));
  const antes = await instantanea(repo, doc._id);
  const e = await esError(await borrar(u.jefa, doc._id, 'atencion-a-la-diversidad', { esperaPlantillaVersion: 1 }), 409, 'conflicto');
  assert.equal(e.actual, 2);
  assert.deepStrictEqual(await instantanea(repo, doc._id), antes);
  await cambio(await borrar(u.jefa, doc._id, 'atencion-a-la-diversidad', { esperaPlantillaVersion: 2 }));
  assert.equal(await guardados(repo, doc._id, 'atencion-a-la-diversidad'), null);
});

prueba('borrar exige el mismo permiso que los demás cambios de estructura', async () => {
  const { repo, u, doc, otro } = await escenario();
  await cambio(await retirar(u.jefa, doc._id, 'atencion-a-la-diversidad'));
  await cambio(await retirarCampo(u.jefa, doc._id, 'introduccion', 'tabla_normativa'));
  const antes = await instantanea(repo, doc._id);

  for (const quien of [u.ana, u.luis, u.estudios]) {
    await esError(await borrar(quien, doc._id, 'atencion-a-la-diversidad'), 403, 'sin_permiso');
    await esError(await borrarCampo(quien, doc._id, 'introduccion', 'tabla_normativa'), 403, 'sin_permiso');
  }
  await esError(await borrar(null, doc._id, 'atencion-a-la-diversidad'), 401, 'sin_identificar');
  await esError(await borrar(u.pepe, doc._id, 'atencion-a-la-diversidad'), 404, 'no_encontrado');
  assert.deepStrictEqual(await instantanea(repo, doc._id), antes, 'un borrado sin permiso ha cambiado algo');

  // Quien SÍ puede borrar en su documento tampoco llega al del departamento de al lado: es un 404 y
  // no un 403, porque un documento que no se puede ver no se puede ni nombrar.
  await esError(await borrar(u.jefa, otro._id, 'atencion-a-la-diversidad'), 404, 'no_encontrado');
  assert.equal((await repo.documentos.obtener(otro._id)).plantillaVersion, 1, 'el documento de al lado ha cambiado de versión');

  // El soporte sí.
  await cambio(await borrar(u.admin, doc._id, 'atencion-a-la-diversidad'));
  await cambio(await borrarCampo(u.admin, doc._id, 'introduccion', 'tabla_normativa'));
});

prueba('el GET cuenta lo que hay escrito en cada cosa retirada, y coincide con lo guardado', async () => {
  const { repo, u, doc } = await escenario();
  // Un apartado de módulo con texto en solo tres de los once, y un campo con texto en uno.
  await anadir(u.jefa, doc._id, { padre: 'modulos', titulo: 'Materiales' });
  for (const m of MODULOS.slice(0, 3)) {
    await repo.apartados.escribir(doc._id, 'modulos/materiales', m, { valores: { texto: [{ type: 'p', text: m }] } });
  }
  // Una fila con la clave pero sin nada dentro no cuenta como contenido.
  await repo.apartados.escribir(doc._id, 'modulos/materiales', MODULOS[3], { valores: { texto: [] } });
  await cambio(await retirar(u.jefa, doc._id, 'modulos/materiales'));
  await cambio(await retirar(u.jefa, doc._id, 'anexos'));
  await cambio(await retirarCampo(u.jefa, doc._id, 'modulos/metodologia', 'texto'));
  await cambio(await retirarCampo(u.jefa, doc._id, 'atencion-a-la-diversidad', 'texto'));

  const e = await (await estructuraDe(u.jefa, doc._id)).json();
  const retirado = (s) => e.retirados.find((x) => x.seccion === s);
  assert.deepStrictEqual(retirado('modulos/materiales').contenido,
    { apartados: 1, filas: 4, conContenido: 3, unidadesConContenido: 3 });
  // Un apartado sin nada escrito y con un hijo.
  assert.deepStrictEqual(retirado('anexos').contenido,
    { apartados: 2, filas: 0, conContenido: 0, unidadesConContenido: 0 });

  const campo = (s, c) => e.camposRetirados.find((x) => x.seccion === s && x.campo === c);
  assert.deepStrictEqual(campo('modulos/metodologia', 'texto').contenido,
    { filas: MODULOS.length, conContenido: MODULOS.length, unidadesConContenido: MODULOS.length });
  assert.deepStrictEqual(campo('atencion-a-la-diversidad', 'texto').contenido,
    { filas: 1, conContenido: 1, unidadesConContenido: 0 });

  // Lo que el borrado destruye es lo que el GET había dicho.
  const hecho = await cambio(await borrar(u.jefa, doc._id, 'modulos/materiales'));
  assert.deepStrictEqual(hecho.contenido, retirado('modulos/materiales').contenido);
  assert.equal(hecho.filasBorradas, 4);
});

prueba('un documento del curso anterior no se entera de lo que se borra en el nuevo', async () => {
  const { repo, u, doc } = await escenario();
  const nuevoId = await cursoNuevo(u, doc);
  const antesPdf = comparable(await definicionDe(u.ana, doc._id));
  const antesPdfModulo = comparable(await definicionDe(u.ana, doc._id, PROG));
  const antesArbol = JSON.stringify(await nodosDe(u.jefa, doc._id));
  const antesFilas = await foto(repo, doc._id);
  const antes = await instantanea(repo, doc._id);

  // En el nuevo: un apartado común, uno de módulo con su subárbol y un campo de módulo.
  await cambio(await retirar(u.jefa, nuevoId, 'atencion-a-la-diversidad'));
  await cambio(await borrar(u.jefa, nuevoId, 'atencion-a-la-diversidad'));
  await cambio(await retirar(u.jefa, nuevoId, 'modulos/situaciones-de-aprendizaje'));
  const grande = await cambio(await borrar(u.jefa, nuevoId, 'modulos/situaciones-de-aprendizaje'));
  assert.equal(grande.filasBorradas, MODULOS.length, 'el curso nuevo debería tener sus propias filas');
  await cambio(await retirarCampo(u.jefa, nuevoId, 'modulos/metodologia', 'texto'));
  await cambio(await borrarCampo(u.jefa, nuevoId, 'modulos/metodologia', 'texto'));
  assert.equal(await guardados(repo, nuevoId, 'atencion-a-la-diversidad'), null);

  assert.deepStrictEqual(comparable(await definicionDe(u.ana, doc._id)), antesPdf,
    'el PDF del curso anterior cambia al borrar en el nuevo');
  assert.deepStrictEqual(comparable(await definicionDe(u.ana, doc._id, PROG)), antesPdfModulo,
    'el PDF del módulo del curso anterior cambia al borrar en el nuevo');
  assert.equal(JSON.stringify(await nodosDe(u.jefa, doc._id)), antesArbol);
  assert.deepStrictEqual(diferencias(antesFilas, await foto(repo, doc._id)), [], 'el borrado ha destruido filas del curso anterior');
  assert.deepStrictEqual(await instantanea(repo, doc._id), antes);
  const viejo = await (await leer(u.jefa, doc._id, 'atencion-a-la-diversidad', null)).json();
  assert.equal(viejo.valores.texto[0].text, 'Medidas de nivel II y III.');
  assert.ok(impreso(await definicionDe(u.ana, doc._id, PROG), 'Metodología de Programación.'));
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
    : `\n${total} pruebas de la estructura editable correctas`);
  process.exit(fallos ? 1 : 0);
}

ejecutar();
