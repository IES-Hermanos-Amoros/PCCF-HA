// El arrastre entre cursos: crear el curso siguiente desde el anterior, dar por revisado, y el
// progreso que mide revisión y no relleno.
//
//   node test/arrastre.js
//
// Sin levantar Next, sin red y sin base de datos: las rutas se llaman directamente con un `Request`
// normal, igual que en test/api.js, test/edicion.js y test/estructurados.js (docs/api.md, primera
// regla de forma).
//
// QUÉ SE PRUEBA, Y POR QUÉ ESTAS COSAS
//
// Es la mitad de servidor del E5 (docs/plan.md §5), y su criterio de aceptación es este:
//
//   «Crear 2027-28 desde 2026-27 deja todos los apartados como heredado y el progreso a 0 %, con el
//    contenido intacto.»
//
// El contenido intacto se comprueba sobre la DEFINICIÓN DE pdfmake de los dos documentos, y no sobre
// los bytes del PDF: es la misma decisión de test/ida-y-vuelta.js y de test/edicion.js. Lo que se
// compara es que la definición del curso nuevo sea la del anterior salvo el curso, y cuando algo
// falla, la definición dice qué nodo cambió.
//
// Lo demás es lo que el arrastre tiene que no hacer: que el documento de partida no se toque, que
// quien no puede crear el curso no lo cree, que dos veces el mismo curso no duplique nada, y que
// un apartado que no existía en el curso anterior lo diga en lugar de dar un 404.
//
// EL ARNÉS ES EL DE test/edicion.js
//
// Copiado y no importado, a propósito: una prueba que depende de otra se rompe cuando alguien toca la
// otra. Cada prueba monta su propio almacén, porque todas escriben.

'use strict';

const assert = require('assert/strict');

const { crearRepositorio } = require('../repositorio');
const memoria = require('../repositorio/memoria');
const Arbol = require('../core/arbol');
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
const Arrastre = require('../app/_lib/rutas/arrastre');
const RutaArbol = require('../app/_lib/rutas/arbol');
const Pdf = require('../app/_lib/rutas/pdf');

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

const anteriorDe = (persona, id, seccion, unidad) => Apartado.ANTERIOR(
  pet(`/api/documentos/${id}/anterior/apartado?${consultaDe(seccion, unidad)}`, persona), { id },
);

const revisarRama = (persona, id, seccion, unidad, cuerpo) => Apartado.REVISAR(
  pet(`/api/documentos/${id}/apartado/revisar?${consultaDe(seccion, unidad)}`, persona, { metodo: 'POST', cuerpo }),
  { id },
);

const crearSiguiente = (persona, id, cuerpo) => Arrastre.CREAR(
  pet(`/api/documentos/${id}/siguiente-curso`, persona, { metodo: 'POST', cuerpo }), { id },
);

const arbolDe = (persona, id) => RutaArbol.GET(pet(`/api/documentos/${id}/arbol`, persona), { id });

// Revisar lo que el cliente ha leído: lee, y manda la versión con la que leyó, que es lo que hace la
// interfaz. Así la prueba no depende de cómo se guarda la versión.
async function revisar(persona, id, seccion, unidad) {
  const antes = await (await leer(persona, id, seccion, unidad)).json();
  return revisarRama(persona, id, seccion, unidad, { esperaUpdatedAt: antes.updatedAt });
}

// Editar lo que el cliente ha leído, igual que en test/edicion.js.
async function editar(persona, id, seccion, unidad, valores) {
  const antes = await (await leer(persona, id, seccion, unidad)).json();
  return guardar(persona, id, seccion, unidad, { valores, esperaUpdatedAt: antes.updatedAt });
}

// Lo que está guardado de verdad, sin pasar por la ruta.
const guardados = async (repo, id, seccion, unidad = null) => repo.apartados.leer(id, seccion, unidad);

// Una foto de todos los apartados del documento: para comprobar que una escritura no toca ninguno
// más, y que una petición rechazada no toca ninguno.
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

// Lo que se pide del documento tal cual, para comparar «antes» y «después» sin que el orden de las
// claves ni el `updatedAt` de otra cosa cuenten.
const cabecera = (d) => JSON.stringify({
  tipo: d.tipo, ciclo: d.ciclo, curso: d.curso, departamento: d.departamento, estado: d.estado,
  anteriorId: d.anteriorId, plantillaVersion: d.plantillaVersion,
});

// La misma normalización de test/edicion.js: `buildDocDefinition` devuelve `header` y `footer` como
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

// Cambia un texto por otro en todas las cadenas de una estructura. Sirve para decir «la definición
// del curso nuevo es la del anterior salvo el curso»: la portada lleva el curso en el título.
function cambiaTexto(x, de, a) {
  if (typeof x === 'string') return x.split(de).join(a);
  if (Array.isArray(x)) return x.map((y) => cambiaTexto(y, de, a));
  if (x && typeof x === 'object') {
    const out = {};
    for (const k of Object.keys(x)) out[k] = cambiaTexto(x[k], de, a);
    return out;
  }
  return x;
}

const definicionDe = async (persona, id) => {
  const { definicion, fallo } = await Pdf.definicionDe(pet(`/api/documentos/${id}/pdf`, persona), { id });
  assert.equal(fallo, undefined, 'el PDF no se puede generar');
  return definicion;
};

// ================================================================ el documento de partida
// Es el de test/edicion.js, con lo que el arrastre necesita y allí no hacía falta: la unidad de
// Programación lleva a Ana, la de Base de datos no tiene docentes, y «Atención a la diversidad» está
// delegada a Luis. Los títulos de los módulos son los del catálogo, para que la copia no cambie
// ninguno y la definición del curso nuevo sea la del anterior salvo el curso.

const campoTexto = { id: 'texto', tipo: 'texto_largo', etiqueta: 'Texto' };
const c = (text, opts) => Object.assign({ text, colspan: 1, rowspan: 1, bold: false }, opts);

const TABLA_NORMATIVA = [
  [c('Ámbito', { bold: true }), c('Norma', { bold: true })],
  [c('Estatal'), c('RD 1147/2011')],
];

const PONDERACIONES = [
  { ra: 1, texto: 'Reconoce las características de los lenguajes de marcas.', ponderacion: 100, ce: [
    { letra: 'a', texto: 'Se han identificado las etiquetas.', ponderacion: 100, fundamental: true },
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
        // En la plantilla y sin escribir nunca: en el curso anterior aparece vacío (docs/api.md).
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

const valoresDelModulo = (marca) => ({
  'modulos/metodologia': { texto: [{ type: 'p', text: `Metodología de ${marca}.` }] },
  'modulos/ponderaciones': { ponderaciones: PONDERACIONES },
  'modulos/situaciones-de-aprendizaje/situacion': { items: [
    { titulo: `Primera SA de ${marca}`, texto: [{ type: 'p', text: 'Prueba inicial.' }] },
  ] },
});

// Los títulos son los del catálogo (core/unidades.js), así que `tituloDe` no los cambia para el curso
// nuevo.
const IDS = { Programación: 'daw-0485', 'Base de datos': 'daw-0484' };

const OPCIONES = {
  curso: '2026-27', ciclo: 'daw', departamento: 'informatica', origenApartados: 'nuevo',
  conciliar: (titulo) => IDS[titulo],
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
  instancias: [
    { titulo: 'Programación', num: '0485', grupo: 'Módulos del primer curso', docentes: [u.ana._id],
      valores: valoresDelModulo('Programación') },
    { titulo: 'Base de datos', num: '0484', grupo: 'Módulos del primer curso', docentes: [],
      valores: valoresDelModulo('Base de datos') },
  ],
  asignaciones: { 'atencion-a-la-diversidad': [u.luis._id] },
  compartidos: {},
});

const TEXTO_COMPARTIDO = {
  cid: 'c001', bloque: [{ type: 'p', text: 'Texto compartido por todos los módulos.' }],
  seccion: 'introduccion', comun: true, responsable: 'jefatura', modo: 'obligatorio', version: 2,
};

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

  const datos = datosDe(u);
  const filas = aFilas({ plantilla: PLANTILLA, datos }, OPCIONES);
  filas.compartidos = [TEXTO_COMPARTIDO];
  const doc = await sembrar(repo, filas);

  const otro = await sembrar(repo, aFilas({
    plantilla: { ...PLANTILLA, origen: 'PD_matematicas.docx' },
    datos: { departamento: 'matematicas', documento: { introduccion: { texto: [] } }, instancias: [], asignaciones: {}, compartidos: {} },
  }, { curso: '2026-27', departamento: 'matematicas' }));

  return { repo, u, doc, otro };
}

// El curso nuevo, creado por la jefatura, que es quien puede. Devuelve su id.
async function cursoNuevo(u, doc, cuerpo) {
  const res = await crearSiguiente(u.jefa, doc._id, cuerpo);
  assert.equal(res.status, 201, 'la jefatura debería poder crear el curso siguiente');
  return (await res.json()).documento._id;
}

// Un documento con los apartados de su plantilla sin mirar, para comprobar las cuentas.
const nodosDe = async (persona, id) => Arbol.aplanar((await (await arbolDe(persona, id)).json()).arbol);

// ================================================================ 1. el criterio de aceptación

prueba('crear 2027-28 desde 2026-27: todos los apartados nacen heredados, el progreso a 0 % y el contenido intacto', async () => {
  const { repo, u, doc } = await escenario();

  const res = await crearSiguiente(u.jefa, doc._id);
  assert.equal(res.status, 201);
  const { documento: nuevo, copiados } = await res.json();

  assert.equal(nuevo.curso, '2027-28', 'el curso sale del documento de partida, sumándole uno');
  assert.equal(nuevo.anteriorId, doc._id);
  assert.equal(copiados.apartados, (await repo.apartados.listar(doc._id)).length);

  // Todos los apartados de la copia nacen heredados, sin revisor ni fecha de revisión.
  const filasNuevas = await repo.apartados.listar(nuevo._id);
  assert.ok(filasNuevas.length > 0);
  for (const fila of filasNuevas) {
    assert.equal(fila.origen, 'heredado', `«${fila.seccion}» no nace heredado`);
    assert.equal(fila.revisadoPor, null, `«${fila.seccion}» lleva revisor sin haber sido revisado`);
    assert.equal(fila.revisadoEn, null, `«${fila.seccion}» lleva fecha de revisión`);
  }

  // El progreso por revisión, en el árbol: cero revisados, y todo lo que tiene contenido pendiente.
  const { revision } = await (await arbolDe(u.jefa, nuevo._id)).json();
  assert.ok(revision.apartados > 0);
  assert.equal(revision.revisados, 0, 'ningún apartado heredado está revisado');
  assert.equal(revision.pendientes, revision.apartados, 'todo lo que tiene contenido está pendiente');
  const conContenido = (await nodosDe(u.jefa, nuevo._id)).filter((n) => n.contenido);
  assert.ok(conContenido.every((n) => n.origen === 'heredado' || n.origen === null),
    'un apartado con contenido no está ni heredado ni sin escribir');
  assert.equal(revision.heredados, conContenido.filter((n) => n.origen === 'heredado').length);

  // El contenido intacto: cada apartado tiene los mismos valores que en el documento de partida.
  for (const fila of filasNuevas) {
    const original = await guardados(repo, doc._id, fila.seccion, fila.unidadId);
    assert.deepStrictEqual(fila.valores, original.valores, `«${fila.seccion}» cambia al copiarlo`);
  }
});

prueba('la definición de pdfmake del curso nuevo es la del de partida, salvo el curso', async () => {
  const { u, doc } = await escenario();
  const nuevoId = await cursoNuevo(u, doc);

  const antes = comparable(await definicionDe(u.ana, doc._id));
  const despues = comparable(await definicionDe(u.ana, nuevoId));

  // Lo que cambia es el curso que pone la portada. Cualquier otra diferencia es contenido que se ha
  // perdido o se ha movido al copiar, y la prueba la nombra.
  assert.deepStrictEqual(cambiaTexto(despues, '2027-28', '2026-27'), antes);
});

prueba('las unidades llegan con sus docentes y en el mismo orden', async () => {
  const { repo, u, doc } = await escenario();
  const nuevoId = await cursoNuevo(u, doc);

  const origen = await repo.unidades.listar(doc._id);
  const copia = await repo.unidades.listar(nuevoId);
  assert.deepStrictEqual(copia.map((x) => x.unidadId), origen.map((x) => x.unidadId), 'el orden de los módulos cambia');
  for (let i = 0; i < origen.length; i += 1) {
    assert.deepStrictEqual(copia[i].docentes, origen[i].docentes, `${origen[i].unidadId} cambia de docentes`);
    assert.equal(copia[i].num, origen[i].num);
    assert.equal(copia[i].grupo, origen[i].grupo);
  }
  assert.deepStrictEqual(copia.find((x) => x.unidadId === 'daw-0485').docentes, [u.ana._id]);
});

prueba('los textos compartidos y el reparto de apartados comunes viajan con el documento', async () => {
  const { repo, u, doc } = await escenario();
  const nuevoId = await cursoNuevo(u, doc);

  const compartidos = await repo.compartidos.listar(nuevoId);
  assert.equal(compartidos.length, 1);
  assert.equal(compartidos[0].cid, 'c001', 'el cid se conserva: las referencias { ref } dependen de él');
  assert.deepStrictEqual(compartidos[0].bloque, TEXTO_COMPARTIDO.bloque);
  assert.equal(compartidos[0].version, 2);
  assert.equal(compartidos[0].modo, 'obligatorio');
  assert.deepStrictEqual((await repo.documentos.obtener(nuevoId)).asignaciones, { 'atencion-a-la-diversidad': [u.luis._id] });
});

prueba('el curso nuevo lleva el título del catálogo para ese curso, no el del curso viejo', async () => {
  const { repo, u, doc } = await escenario();
  // El título que traía el curso de partida, distinto del catálogo: el curso nuevo no lo hereda.
  await repo.unidades.actualizar(doc._id, 'daw-0485', { titulo: 'Programacion (título antiguo)' });
  // Un módulo que el catálogo no conoce conserva su título: no hay de dónde sacar otro.
  await repo.unidades.crearMuchos(doc._id, [{ unidadId: 'forzada-1', titulo: 'Módulo sin catálogo', num: null, grupo: null, docentes: [] }]);

  const nuevoId = await cursoNuevo(u, doc);
  const copia = await repo.unidades.listar(nuevoId);
  assert.equal(copia.find((x) => x.unidadId === 'daw-0485').titulo, 'Programación');
  assert.equal(copia.find((x) => x.unidadId === 'forzada-1').titulo, 'Módulo sin catálogo');
});

prueba('lo que es del curso viejo y no del nuevo no se copia: estado, origen, anteriorId y revisiones', async () => {
  const { repo, u, doc } = await escenario();
  // El documento de partida está aprobado y tiene un apartado revisado: nada de eso pasa al nuevo.
  await repo.documentos.actualizar(doc._id, { estado: 'aprobado', origen: 'PD_DAW_2026.docx' });
  await revisar(u.ana, doc._id, 'modulos/metodologia', 'daw-0485');

  const nuevoId = await cursoNuevo(u, doc);
  const nuevo = await repo.documentos.obtener(nuevoId);
  assert.equal(nuevo.estado, 'borrador', 'el curso nuevo nace en borrador, no aprobado');
  assert.equal(nuevo.origen, null, 'el nombre del Word de partida no se hereda');
  assert.equal(nuevo.anteriorId, doc._id, 'el anterior es el de partida, no el de partida de partida');
  const fila = await guardados(repo, nuevoId, 'modulos/metodologia', 'daw-0485');
  assert.equal(fila.origen, 'heredado', 'la revisión del curso viejo no pasa al nuevo');
  assert.equal(fila.revisadoPor, null);
  assert.equal(fila.revisadoEn, null);
});

// ================================================================ 2. el documento de partida no se toca

prueba('el documento nuevo apunta al anterior, y el anterior no cambia en nada', async () => {
  const { repo, u, doc } = await escenario();
  const antesCabecera = cabecera(await repo.documentos.obtener(doc._id));
  const antesFotos = await foto(repo, doc._id);
  const antesUnidades = JSON.stringify(await repo.unidades.listar(doc._id));
  const antesCompartidos = JSON.stringify(await repo.compartidos.listar(doc._id));

  const nuevoId = await cursoNuevo(u, doc);

  assert.equal(cabecera(await repo.documentos.obtener(doc._id)), antesCabecera, 'la cabecera del anterior cambia');
  assert.deepStrictEqual(diferencias(antesFotos, await foto(repo, doc._id)), [], 'algún apartado del anterior cambia');
  assert.equal(JSON.stringify(await repo.unidades.listar(doc._id)), antesUnidades);
  assert.equal(JSON.stringify(await repo.compartidos.listar(doc._id)), antesCompartidos);
  assert.notEqual(nuevoId, doc._id);
  assert.equal((await repo.documentos.obtener(nuevoId)).anteriorId, doc._id);
});

// ================================================================ 3. revisar

prueba('dar por revisado un apartado: cambia su origen, deja quién y cuándo, y el progreso sube', async () => {
  const { repo, u, doc } = await escenario();
  const nuevoId = await cursoNuevo(u, doc);
  const antes = (await (await arbolDe(u.ana, nuevoId)).json()).revision;

  const res = await revisar(u.ana, nuevoId, 'modulos/metodologia', 'daw-0485');
  assert.equal(res.status, 200);
  const cuerpo = await res.json();
  assert.equal(cuerpo.origen, 'revisado');
  assert.equal(cuerpo.revisadoPor, u.ana._id, 'queda quién lo ha revisado');
  assert.equal(typeof cuerpo.revisadoEn, 'string', 'queda cuándo');
  assert.ok(!Number.isNaN(new Date(cuerpo.revisadoEn).getTime()));
  assert.deepStrictEqual(cuerpo.valores, (await guardados(repo, nuevoId, 'modulos/metodologia', 'daw-0485')).valores,
    'revisar no toca el texto');

  const fila = await guardados(repo, nuevoId, 'modulos/metodologia', 'daw-0485');
  assert.equal(fila.origen, 'revisado');
  assert.equal(fila.revisadoPor, u.ana._id);

  const despues = (await (await arbolDe(u.ana, nuevoId)).json()).revision;
  assert.equal(despues.revisados, antes.revisados + 1, 'el progreso sube en uno');
  assert.equal(despues.pendientes, antes.pendientes - 1);
  assert.equal(despues.heredados, antes.heredados - 1);
});

prueba('editar después de revisar deja el apartado en «modificado», y sigue contando como revisado', async () => {
  const { u, doc, repo } = await escenario();
  const nuevoId = await cursoNuevo(u, doc);
  await revisar(u.ana, nuevoId, 'modulos/metodologia', 'daw-0485');

  const texto = [{ type: 'p', text: 'Metodología reescrita tras revisarla.' }];
  const res = await editar(u.ana, nuevoId, 'modulos/metodologia', 'daw-0485', { texto });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).origen, 'modificado');
  assert.equal((await guardados(repo, nuevoId, 'modulos/metodologia', 'daw-0485')).origen, 'modificado');

  // Modificado es revisado a efectos del progreso: alguien lo ha mirado y lo ha reescrito.
  const { revision } = await (await arbolDe(u.ana, nuevoId)).json();
  assert.equal(revision.revisados, 1);
});

prueba('revisar con una versión vieja es un 409: no se da por bueno lo que no se ha leído', async () => {
  const { repo, u, doc } = await escenario();
  const nuevoId = await cursoNuevo(u, doc);
  const leido = await (await leer(u.ana, nuevoId, 'modulos/metodologia', 'daw-0485')).json();

  // Otra persona lo guarda antes de que esta revise la versión que leyó.
  await editar(u.ana, nuevoId, 'modulos/metodologia', 'daw-0485', { texto: [{ type: 'p', text: 'Cambio de otra pestaña.' }] });

  const res = await revisarRama(u.ana, nuevoId, 'modulos/metodologia', 'daw-0485', { esperaUpdatedAt: leido.updatedAt });
  const cuerpo = await esError(res, 409, 'conflicto');
  assert.ok(cuerpo.esperado && cuerpo.actual, 'el 409 dice qué versión se esperaba y cuál hay');
  assert.equal((await guardados(repo, nuevoId, 'modulos/metodologia', 'daw-0485')).origen, 'modificado',
    'el conflicto no puede marcar como revisado lo que cambió por medio');
});

prueba('revisar sin «esperaUpdatedAt» es un 400, y un apartado que solo agrupa no se revisa', async () => {
  const { u, doc } = await escenario();
  const nuevoId = await cursoNuevo(u, doc);

  await esError(await revisarRama(u.ana, nuevoId, 'modulos/metodologia', 'daw-0485', {}), 400, 'peticion');
  await esError(await revisarRama(u.ana, nuevoId, 'modulos/metodologia', 'daw-0485', 'no es json'), 400, 'peticion');

  // «Anexos» solo agrupa: no tiene campos propios, y no hay nada que dar por revisado.
  const version = (await (await leer(u.ana, nuevoId, 'anexos', null)).json()).updatedAt;
  await esError(await revisarRama(u.ana, nuevoId, 'anexos', null, { esperaUpdatedAt: version }), 400, 'peticion');
});

// ================================================================ 4. el curso anterior

prueba('el apartado del curso anterior se pide y devuelve lo mismo que el apartado normal', async () => {
  const { u, doc } = await escenario();
  const nuevoId = await cursoNuevo(u, doc);
  const original = await (await leer(u.ana, doc._id, 'modulos/metodologia', 'daw-0485')).json();

  const res = await anteriorDe(u.ana, nuevoId, 'modulos/metodologia', 'daw-0485');
  assert.equal(res.status, 200);
  const anterior = await res.json();

  assert.equal(anterior.existe, true);
  assert.equal(anterior.motivo, null);
  assert.equal(anterior.documentoId, doc._id, 'los datos vienen del documento de partida');
  assert.equal(anterior.anteriorId, doc._id);
  assert.equal(anterior.curso, '2026-27');
  assert.deepStrictEqual(anterior.valores, original.valores);
  assert.equal(anterior.puedeEditar, false, 'el curso anterior se lee, no se escribe desde el nuevo');

  // Misma forma que el apartado normal: las mismas claves, salvo las que dicen de dónde viene.
  const claves = (x) => Object.keys(x).filter((k) => !['anteriorId', 'curso', 'motivo', 'mensaje'].includes(k)).sort();
  assert.deepStrictEqual(claves(anterior), claves(original));
});

prueba('un apartado del curso nuevo que no existía en el anterior lo dice, y no es un 404', async () => {
  const { repo, u, doc } = await escenario();
  const nuevoId = await cursoNuevo(u, doc);

  // Una sección que el curso nuevo añade a la plantilla: no está en la del curso anterior.
  const nueva = { id: 'evaluacion-continua', titulo: 'Evaluación continua', nivel: 1, edita: 'jefe_departamento',
    presencia: 1, campos: [campoTexto], hijos: [] };
  const plantillaNueva = { ...(await repo.documentos.obtener(nuevoId)).plantilla,
    secciones: [...PLANTILLA.secciones, nueva] };
  await repo.documentos.actualizar(nuevoId, { plantilla: plantillaNueva });

  const res = await anteriorDe(u.ana, nuevoId, 'evaluacion-continua', null);
  assert.equal(res.status, 200, 'no es un 404: el apartado existe en este curso');
  const cuerpo = await res.json();
  assert.equal(cuerpo.existe, false);
  assert.equal(cuerpo.motivo, 'seccion_nueva');
  assert.ok(cuerpo.mensaje.includes('nuevo'), cuerpo.mensaje);
  assert.equal(cuerpo.titulo, 'Evaluación continua', 'se pinta con su título aunque no tenga curso anterior');
});

prueba('un módulo nuevo en el curso también lo dice, y un apartado vacío allí se distingue del nuevo', async () => {
  const { repo, u, doc } = await escenario();
  const nuevoId = await cursoNuevo(u, doc);

  // Un módulo que no estaba el curso pasado.
  await repo.unidades.crearMuchos(nuevoId, [{ unidadId: 'daw-0612', titulo: 'Desarrollo web en entorno cliente', num: null, grupo: null, docentes: [] }]);
  const deNuevo = await (await anteriorDe(u.luis, nuevoId, 'modulos/metodologia', 'daw-0612')).json();
  assert.equal(deNuevo.existe, false);
  assert.equal(deNuevo.motivo, 'unidad_nueva');

  // Un apartado que existía en el curso pasado y nadie escribió: vacío, no nuevo.
  const vacio = await (await anteriorDe(u.ana, nuevoId, 'introduccion/contextualizacion', null)).json();
  assert.equal(vacio.existe, false);
  assert.equal(vacio.motivo, 'sin_contenido');
  assert.notEqual(vacio.motivo, deNuevo.motivo);
});

prueba('un documento sin curso anterior responde con sentido, no con un 404', async () => {
  const { u, doc } = await escenario();

  const res = await anteriorDe(u.ana, doc._id, 'modulos/metodologia', 'daw-0485');
  assert.equal(res.status, 200);
  const cuerpo = await res.json();
  assert.equal(cuerpo.motivo, 'sin_curso_anterior');
  assert.equal(cuerpo.anteriorId, null);
  assert.equal(cuerpo.existe, false);
  assert.ok(cuerpo.mensaje.includes('desde cero'), cuerpo.mensaje);
});

prueba('pedir un apartado que no es de este documento sigue siendo un 404', async () => {
  const { u, doc } = await escenario();
  const nuevoId = await cursoNuevo(u, doc);
  await esError(await anteriorDe(u.ana, nuevoId, 'seccion-inventada', null), 404, 'no_encontrado');
  await esError(await anteriorDe(u.ana, nuevoId, 'modulos/metodologia', 'daw-9999'), 404, 'no_encontrado');
});

// ================================================================ 5. el árbol y el progreso

prueba('el árbol da el origen de cada apartado con contenido y el recuento de revisión, sin contenido dentro', async () => {
  const { u, doc } = await escenario();
  const nuevoId = await cursoNuevo(u, doc);
  await revisar(u.ana, nuevoId, 'modulos/metodologia', 'daw-0485');

  const res = await arbolDe(u.ana, nuevoId);
  const cuerpo = await res.text();
  for (const trozo of ['Metodología de', 'Medidas de nivel', 'Primera SA']) {
    assert.ok(!cuerpo.includes(trozo), `el árbol lleva contenido dentro: «${trozo}»`);
  }
  const { arbol, resumen, revision } = JSON.parse(cuerpo);

  const nodos = Arbol.aplanar(arbol);
  const porClave = new Map(nodos.map((n) => [n.clave, n]));
  assert.equal(porClave.get('daw-0485::modulos/metodologia').origen, 'revisado');
  assert.equal(porClave.get('daw-0485::modulos/ponderaciones').origen, 'heredado');
  assert.equal(porClave.get('atencion-a-la-diversidad').origen, 'heredado');
  // Lo vacío no tiene origen: nadie lo ha escrito, así que no hay de dónde heredarlo.
  assert.equal(porClave.get('anexos/actas').origen, null);
  // Los nodos que solo agrupan no tienen origen.
  assert.equal(porClave.get('anexos').origen, null);
  assert.equal(porClave.get('modulos').origen, null);

  // El recuento sale de los mismos nodos que el origen, y `resumen` sigue siendo el de siempre.
  const conContenido = nodos.filter((n) => n.contenido);
  assert.equal(revision.apartados, conContenido.length);
  assert.equal(revision.apartados, resumen.apartados);
  assert.equal(revision.revisados, conContenido.filter((n) => n.origen === 'revisado').length);
  assert.equal(revision.pendientes, revision.apartados - revision.revisados);
  assert.ok(revision.heredados > 0);
  assert.deepStrictEqual(Object.keys(resumen).sort(), ['apartados', 'nodos', 'rellenos', 'unidades', 'vacios']);
});

prueba('el árbol del curso nuevo tiene las mismas partes rellenas que el de partida', async () => {
  const { u, doc } = await escenario();
  const nuevoId = await cursoNuevo(u, doc);

  // La clave de la raíz es el id del documento, que es distinto en cada curso: se compara la sección y
  // el módulo, que son los que son iguales en los dos.
  const forma = (nodos) => nodos.map((n) => [n.seccion, n.unidadId, n.relleno]);
  const deDoc = await nodosDe(u.jefa, doc._id);
  const deNuevo = await nodosDe(u.jefa, nuevoId);
  assert.deepStrictEqual(forma(deNuevo), forma(deDoc));
});

prueba('revisar en el curso nuevo no cambia el progreso del de partida', async () => {
  // El de partida se siembra como lo importa el E1 (origen «nuevo»), así que su progreso no es cero:
  // lo que se comprueba es que no se mueve.
  const { u, doc } = await escenario();
  const nuevoId = await cursoNuevo(u, doc);
  const antes = (await (await arbolDe(u.jefa, doc._id)).json()).revision;

  await revisar(u.ana, nuevoId, 'modulos/metodologia', 'daw-0485');

  const despues = (await (await arbolDe(u.jefa, doc._id)).json()).revision;
  assert.deepStrictEqual(despues, antes, 'lo revisado en el curso nuevo cuenta en el de partida');
});

// ================================================================ 6. quién puede

prueba('un docente no crea el curso siguiente (403), y la jefatura de estudios tampoco', async () => {
  const { repo, u, doc } = await escenario();
  const antes = await repo.documentos.listar({ curso: '2027-28' });

  await esError(await crearSiguiente(u.ana, doc._id), 403, 'sin_permiso');
  await esError(await crearSiguiente(u.luis, doc._id), 403, 'sin_permiso');
  await esError(await crearSiguiente(u.estudios, doc._id), 403, 'sin_permiso');

  assert.equal((await repo.documentos.listar({ curso: '2027-28' })).length, antes.length, 'no se ha creado nada');
});

prueba('un documento de otro departamento no se ve ni se puede copiar: 404', async () => {
  const { u, doc, otro } = await escenario();
  await esError(await crearSiguiente(u.pepe, doc._id), 404, 'no_encontrado');
  await esError(await crearSiguiente(u.jefa, otro._id), 404, 'no_encontrado');
});

prueba('la jefatura del departamento crea el curso siguiente, y el admin también puede', async () => {
  const { u, doc } = await escenario();
  const res = await crearSiguiente(u.admin, doc._id);
  assert.equal(res.status, 201);
  assert.equal((await res.json()).documento.curso, '2027-28');
});

prueba('un docente da por revisado lo suyo, y no lo que no le toca', async () => {
  const { repo, u, doc } = await escenario();
  const nuevoId = await cursoNuevo(u, doc);

  // Su módulo: sí.
  assert.equal((await revisar(u.ana, nuevoId, 'modulos/metodologia', 'daw-0485')).status, 200);

  // Un módulo que no lleva (Base de datos no tiene docentes, y tampoco es el de Luis): no.
  const antes = await foto(repo, nuevoId);
  await esError(await revisar(u.ana, nuevoId, 'modulos/metodologia', 'daw-0484'), 403, 'sin_permiso');

  // Un apartado común de la jefatura, que no le han delegado: no.
  await esError(await revisar(u.ana, nuevoId, 'introduccion', null), 403, 'sin_permiso');

  // Un apartado común que sí le han delegado a Luis, y no a Ana: tampoco.
  await esError(await revisar(u.ana, nuevoId, 'atencion-a-la-diversidad', null), 403, 'sin_permiso');

  // Y lo que se rechaza no deja nada escrito.
  assert.deepStrictEqual(diferencias(antes, await foto(repo, nuevoId)), [], 'una revisión rechazada ha escrito algo');
});

prueba('el docente al que se le ha delegado un apartado común sí lo da por revisado', async () => {
  const { u, doc } = await escenario();
  const nuevoId = await cursoNuevo(u, doc);
  const res = await revisar(u.luis, nuevoId, 'atencion-a-la-diversidad', null);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).revisadoPor, u.luis._id);
});

prueba('la jefatura de estudios no revisa nada, ni un apartado común ni uno de módulo', async () => {
  const { u, doc } = await escenario();
  const nuevoId = await cursoNuevo(u, doc);
  await esError(await revisar(u.estudios, nuevoId, 'modulos/metodologia', 'daw-0485'), 403, 'sin_permiso');
  await esError(await revisar(u.estudios, nuevoId, 'introduccion', null), 403, 'sin_permiso');
});

prueba('sin persona identificada: 401 en todo lo nuevo, y nada escrito', async () => {
  const { repo, doc } = await escenario();
  await esError(await crearSiguiente(null, doc._id), 401, 'sin_identificar');
  await esError(await anteriorDe(null, doc._id, 'modulos/metodologia', 'daw-0485'), 401, 'sin_identificar');
  assert.equal((await repo.documentos.listar({ curso: '2027-28' })).length, 0);
});

// ================================================================ 7. no duplicar, y el cuerpo

prueba('crear dos veces el mismo curso: 409 con el id del que ya existe, y no se duplica nada', async () => {
  const { repo, u, doc } = await escenario();
  const primero = await cursoNuevo(u, doc);
  const antesApartados = (await repo.apartados.listar(primero)).length;
  const antesUnidades = (await repo.unidades.listar(primero)).length;

  const segundo = await crearSiguiente(u.jefa, doc._id);
  const cuerpo = await esError(segundo, 409, 'conflicto');
  assert.equal(cuerpo.documentoId, primero, 'el 409 dice cuál es el que ya existe');

  // Pedido con el curso escrito, también.
  await esError(await crearSiguiente(u.jefa, doc._id, { curso: '2027-28' }), 409, 'conflicto');

  assert.equal((await repo.documentos.listar({ curso: '2027-28' })).length, 1, 'hay dos documentos del mismo curso');
  assert.equal((await repo.apartados.listar(primero)).length, antesApartados);
  assert.equal((await repo.unidades.listar(primero)).length, antesUnidades);
});

prueba('el curso pedido tiene que tener la forma y ser posterior al de partida', async () => {
  const { u, doc } = await escenario();
  await esError(await crearSiguiente(u.jefa, doc._id, { curso: '2027/28' }), 400, 'peticion');
  await esError(await crearSiguiente(u.jefa, doc._id, { curso: '2026-27' }), 400, 'peticion');
  await esError(await crearSiguiente(u.jefa, doc._id, { curso: '2025-26' }), 400, 'peticion');
  await esError(await crearSiguiente(u.jefa, doc._id, { curso: 2027 }), 400, 'peticion');
  await esError(await crearSiguiente(u.jefa, doc._id, '{no es json'), 400, 'peticion');
});

prueba('pedir otro curso posterior, no el siguiente, también vale', async () => {
  const { u, doc } = await escenario();
  const res = await crearSiguiente(u.jefa, doc._id, { curso: '2028-29' });
  assert.equal(res.status, 201);
  assert.equal((await res.json()).documento.curso, '2028-29');
});

prueba('un documento sin curso no deduce el siguiente: lo pide, y con él crea el documento', async () => {
  const repo = nuevoAlmacen();
  const jefa = await repo.usuarios.crear({ nombre: 'Jefatura', email: 'jefa-sin-curso@ejemplo.invalid', rol: 'jefe_departamento', departamento: 'informatica' });
  const { testigo } = await abrirSesion(repo, jefa._id);
  TESTIGOS.set(jefa._id, testigo);

  const { curso, ...sinCurso } = OPCIONES;
  const sembrado = await sembrar(repo, aFilas({ plantilla: PLANTILLA, datos: datosDe({ ana: { _id: 'x' }, luis: { _id: 'y' } }) }, sinCurso));
  assert.equal((await repo.documentos.obtener(sembrado._id)).curso, null);

  await esError(await crearSiguiente(jefa, sembrado._id), 400, 'peticion');
  const res = await crearSiguiente(jefa, sembrado._id, { curso: '2027-28' });
  assert.equal(res.status, 201);
  assert.equal((await res.json()).documento.anteriorId, sembrado._id);
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
    : `\n${total} pruebas del arrastre entre cursos correctas`);
  process.exit(fallos ? 1 : 0);
}

ejecutar();
