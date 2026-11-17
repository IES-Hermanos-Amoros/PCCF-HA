// Los estados del documento (`borrador → revisión → aprobado`) y la importación del PCCF y la
// memoria: la mitad de servidor del E7.
//
//   node test/estados.js
//
// Sin levantar Next, sin red y sin base de datos: las rutas se llaman directamente con un `Request`
// normal, igual que en test/api.js, test/edicion.js, test/estructurados.js, test/arrastre.js y
// test/estructura.js (docs/api.md, primera regla de forma).
//
// QUÉ SE PRUEBA, Y POR QUÉ ESTAS COSAS
//
// El criterio de aceptación del evolutivo (docs/plan.md §5) son dos frases:
//
//   «Aprobar quita la marca de agua y los errores lo impiden.
//    El PCCF y la memoria se importan y exportan por el mismo camino que la PD.»
//
// La primera se comprueba entera y de las dos puntas: que el PDF de un documento aprobado NO lleva
// `watermark` y el de un borrador SÍ, y que la puerta de aprobación niega el paso cuando el panel de
// comprobaciones cuenta errores. Y se comprueba además algo que el criterio no dice y que es la parte
// delicada: **que el rechazo distingue los dos grupos de errores con sus números**.
//
// EL CASO DE LOS 22 AVISOS DEL CONVENIO, EN PEQUEÑO
//
// Sobre la programación real del departamento el panel cuenta 45 errores, y 22 de ellos no son
// erratas: son el otro convenio de ponderación de los criterios, que el departamento tiene pendiente
// de decidir (docs/plan.md, «Lo que ha dejado el E0»). Con la regla tal cual, ese documento no se
// puede aprobar hasta que alguien decida, y bajarle la severidad sería decidir el convenio por la
// puerta de atrás.
//
// Así que el documento sintético de estas pruebas reproduce esa situación a escala: un módulo con una
// ponderación descuadrada de verdad, otro con dos del otro convenio y una unidad sin profesorado. Las
// pruebas comprueban que el rechazo las separa, que la del convenio **sigue bloqueando** y que
// arreglar las erratas no la hace desaparecer. Si algún día alguien decide el convenio bajando la
// severidad, estas pruebas se ponen rojas y tendrá que ser una decisión explícita.
//
// EL ARNÉS ES EL DE test/estructura.js Y test/arrastre.js
//
// Copiado y no importado, a propósito: una prueba que depende de otra se rompe cuando alguien toca la
// otra. Cada prueba monta su propio almacén, porque todas escriben.

'use strict';

const assert = require('assert/strict');

const { crearRepositorio } = require('../repositorio');
const memoria = require('../repositorio/memoria');
const Arbol = require('../core/arbol');
const Unidades = require('../core/unidades');
const Sa = require('../core/sa');
const Val = require('../core/validaciones');
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
const Estado = require('../app/_lib/rutas/estado');
const Importar = require('../app/_lib/rutas/importar');
const RutaArbol = require('../app/_lib/rutas/arbol');
const Validaciones = require('../app/_lib/rutas/validaciones');
const Documento = require('../app/_lib/rutas/documento');
const Pdf = require('../app/_lib/rutas/pdf');
const Docx = require('../app/_lib/rutas/docx');
const { exportarDocx } = require('../motor/exportar-docx');
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
  assert.equal(cuerpo.error, codigo, `se esperaba «${codigo}» y ha sido «${cuerpo.error}»`);
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

// Escribir lo que el cliente ha leído, igual que en test/edicion.js y test/estructura.js.
async function escribir(persona, id, seccion, unidad, valores) {
  const antes = await (await leer(persona, id, seccion, unidad)).json();
  const res = await guardar(persona, id, seccion, unidad, { valores, esperaUpdatedAt: antes.updatedAt });
  assert.equal(res.status, 200, `no se ha podido escribir en ${seccion}: ${res.status}`);
  return res;
}

const arbolDe = (persona, id) => RutaArbol.GET(pet(`/api/documentos/${id}/arbol`, persona), { id });

const validacionesDe = async (persona, id) => (await Validaciones.GET(
  pet(`/api/documentos/${id}/validaciones`, persona), { id },
)).json();

// ---------------------------------------------------------------- las rutas del estado

const estadoDe = (persona, id) => Estado.GET(pet(`/api/documentos/${id}/estado`, persona), { id });

const cambiar = (persona, id, cuerpo) => Estado.CAMBIAR(
  pet(`/api/documentos/${id}/estado`, persona, { metodo: 'POST', cuerpo: cuerpo === undefined ? {} : cuerpo }),
  { id },
);

// Un cambio de estado que tiene que salir bien. Devuelve el cuerpo.
async function paso(persona, id, estado) {
  const res = await cambiar(persona, id, { estado });
  assert.equal(res.status, 200, `«${estado}» debería haber salido bien y ha dado ${res.status}`);
  const cuerpo = await res.json();
  assert.equal(cuerpo.estado, estado);
  return cuerpo;
}

// El estado que hay GUARDADO, sin pasar por ninguna ruta.
const guardado = async (repo, id) => (await repo.documentos.obtener(id)).estado;

// ---------------------------------------------------------------- el PDF y el Word

// La misma normalización de test/arrastre.js y test/estructura.js: `buildDocDefinition` devuelve
// `header` y `footer` como cierres nuevos en cada llamada, y `deepStrictEqual` los compararía por
// referencia. Se sustituyen por su código fuente, y se reconstruyen objetos en lugar de pasar por
// JSON para no perder las claves con valor `undefined` —`watermark` es justo una de ellas, y es la
// que esta suite mira.
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

// La definición de pdfmake que da la ruta, que es lo que acaba impreso. `estado` se pasa por la URL
// solo cuando se quiere pedir uno distinto del del documento: sin él, el documento manda, que es
// justo lo que estas pruebas comprueban.
const definicionDe = async (persona, id, estado) => {
  const camino = `/api/documentos/${id}/pdf${estado ? `?estado=${encodeURIComponent(estado)}` : ''}`;
  const { definicion, fallo } = await Pdf.definicionDe(pet(camino, persona), { id });
  assert.equal(fallo, undefined, 'el PDF no se puede generar');
  return definicion;
};

// Si el tomo lleva la marca de agua de BORRADOR. Es literalmente el criterio de aceptación, y se mira
// sobre la definición y no sobre los bytes del PDF por lo mismo que en las demás suites:
// `buildDocDefinition` es una función pura, así que si la definición no la lleva, el PDF no la pinta.
const conMarcaDeAgua = (definicion) => !!definicion.watermark;

// La línea de la portada que dice en qué estado se ha generado el tomo.
const lineaDeEstado = (definicion) => (nodos(definicion)
  .map((n) => n.text)
  .find((t) => typeof t === 'string' && t.startsWith('Estado: ')) || null);

// El Word, tal como sale de la ruta. Se compara `word/document.xml` y no los bytes del zip, igual que
// en test/estructura.js.
async function wordDe(persona, id, estado) {
  const camino = `/api/documentos/${id}/docx${estado ? `?estado=${encodeURIComponent(estado)}` : ''}`;
  const respuesta = await Docx.GET(pet(camino, persona), { id });
  assert.equal(respuesta.status, 200, `el Word no sale: ${respuesta.status}`);
  const zip = await JSZip.loadAsync(Buffer.from(await respuesta.arrayBuffer()));
  return zip.file('word/document.xml').async('string');
}

// ================================================================ el documento de partida
//
// Una PD sintética con TRES módulos del catálogo de DAW y un cuarto sin profesorado, y con las
// ponderaciones puestas a mano para que el panel de comprobaciones cuente exactamente lo que estas
// pruebas afirman:
//
//   daw-0485  Programación                   ponderaciones que cuadran      0 errores
//   daw-0484  Base de datos                  una descuadrada de verdad      1 error  (errata)
//   daw-0614  Despliegue de aplicaciones web dos del OTRO CONVENIO          2 errores (convenio)
//   daw-0487  Entornos de desarrollo         sin profesorado asignado       1 error  (reparto)
//
// Total: 4 errores, de los cuales 2 hay que arreglarlos y 2 son la decisión de convenio pendiente.
// Es la forma del documento real en pequeño (allí: 45 = 11 sin docente + 10 criterios + 2 sumas +
// 22 del convenio).

const campoTexto = { id: 'texto', tipo: 'texto_largo', etiqueta: 'Texto' };

// Los RA que declara cada módulo. Hacen falta de verdad: sin este apartado, una ponderación no se
// puede guardar por la API («un peso para un RA que el módulo no tiene no reparte nada»,
// core/estructurados.js), así que sin él las pruebas que arreglan una ponderación no probarían nada.
const RA_CE = { ra: [
  { num: 1, texto: 'Reconoce las características de los lenguajes de marcas.', ce: [
    { letra: 'a', texto: 'Se han identificado las etiquetas.' },
    { letra: 'b', texto: 'Se ha reconocido la jerarquía del documento.' },
  ] },
  { num: 2, texto: 'Valida documentos contra un esquema.', ce: [
    { letra: 'a', texto: 'Se ha validado con un esquema.' },
  ] },
] };

// Los criterios reparten el peso de su RA: el convenio estricto, que es el que imprime el PDF. Cero
// avisos.
const PONDERACIONES_OK = [
  { ra: 1, texto: 'Reconoce las características de los lenguajes de marcas.', ponderacion: 40, ce: [
    { letra: 'a', texto: 'Se han identificado las etiquetas.', ponderacion: 25, fundamental: true },
    { letra: 'b', texto: 'Se ha reconocido la jerarquía.', ponderacion: 15, fundamental: false },
  ] },
  { ra: 2, texto: 'Valida documentos contra un esquema.', ponderacion: 60, ce: [
    { letra: 'a', texto: 'Se ha validado con un esquema.', ponderacion: 60, fundamental: false },
  ] },
];

// Una errata de verdad: los criterios del RA1 suman 35 y el RA pondera 40. No es el otro convenio
// —no suman 100— así que es un descuadre y no una decisión pendiente.
const PONDERACIONES_ERRATA = [
  { ra: 1, texto: 'Reconoce las características de los lenguajes de marcas.', ponderacion: 40, ce: [
    { letra: 'a', texto: 'Se han identificado las etiquetas.', ponderacion: 20, fundamental: true },
    { letra: 'b', texto: 'Se ha reconocido la jerarquía.', ponderacion: 15, fundamental: false },
  ] },
  { ra: 2, texto: 'Valida documentos contra un esquema.', ponderacion: 60, ce: [
    { letra: 'a', texto: 'Se ha validado con un esquema.', ponderacion: 60, fundamental: false },
  ] },
];

// EL OTRO CONVENIO: los criterios de cada RA suman exactamente 100 % dentro de su RA en lugar de
// repartir su peso. Con el convenio estricto son dos errores; con el otro, ninguno. La suma de los RA
// sí cuadra (40 + 60), para que no se cuele además un aviso de `suma_de_ra`.
const PONDERACIONES_CONVENIO = [
  { ra: 1, texto: 'Reconoce las características de los lenguajes de marcas.', ponderacion: 40, ce: [
    { letra: 'a', texto: 'Se han identificado las etiquetas.', ponderacion: 60, fundamental: true },
    { letra: 'b', texto: 'Se ha reconocido la jerarquía.', ponderacion: 40, fundamental: false },
  ] },
  { ra: 2, texto: 'Valida documentos contra un esquema.', ponderacion: 60, ce: [
    { letra: 'a', texto: 'Se ha validado con un esquema.', ponderacion: 100, fundamental: false },
  ] },
];

const PLANTILLA = {
  tipo: 'programacion_didactica',
  origen: 'PD_sintetica.docx',
  version: null,
  generada: '2026-01-01T00:00:00.000Z',
  secciones: [
    { id: 'introduccion', titulo: 'Introducción', nivel: 1, edita: 'jefe_departamento', presencia: 1,
      campos: [campoTexto], hijos: [] },
    { id: 'modulos', titulo: 'Módulos', nivel: 1, instancias: true, etiqueta_instancia: 'módulo',
      grupos: ['Módulos del primer curso'], edita: 'docentes_del_modulo', presencia: 4, campos: [],
      hijos: [
        { id: 'modulos/resultados-de-aprendizaje', titulo: 'Resultados de aprendizaje', nivel: 3,
          presencia: 4, campos: [{ id: 'ra_ce', tipo: 'auto.tabla_ra_ce', etiqueta: 'RA y CE' }], hijos: [] },
        { id: 'modulos/metodologia', titulo: 'Metodología', nivel: 3, presencia: 4,
          campos: [campoTexto], hijos: [] },
        { id: 'modulos/ponderaciones', titulo: 'Ponderaciones', nivel: 3, presencia: 4,
          campos: [{ id: 'ponderaciones', tipo: 'ponderacion_ra_ce', etiqueta: 'Ponderaciones', multiple: true }],
          hijos: [] },
        // Una sola situación de aprendizaje, que trabaja el RA1 y no el RA2. Está aquí para que el
        // documento tenga AVISOS además de errores: así se puede comprobar que los avisos no
        // bloquean la aprobación y los errores sí, que es la regla de core/validaciones.js.
        { id: 'modulos/situaciones-de-aprendizaje', titulo: 'Situaciones de aprendizaje', nivel: 3,
          presencia: 4,
          campos: [{ id: 'ficha', tipo: 'ficha_situacion_aprendizaje', etiqueta: 'Ficha de situación de aprendizaje', multiple: true }],
          hijos: [] },
      ] },
  ],
};

// Con evaluación puesta a propósito: una ficha sin evaluación sería otro aviso (`sa_sin_evaluacion`)
// y aquí interesa que el único sea el del RA2, que no trabaja ninguna situación.
const FICHA_DEL_RA1 = {
  ...Sa.fichaVacia(1, '1ª'),
  titulo: 'Primera situación de aprendizaje',
  sesiones: 12,
  raTexto: 'RA1',
  ra: [1],
};

const PROG = 'daw-0485';
const BBDD = 'daw-0484';
const DESPLIEGUE = 'daw-0614';
const SIN_NADIE = 'daw-0487';
const MODULOS = [PROG, BBDD, DESPLIEGUE, SIN_NADIE];

const PONDERACIONES_DE = {
  [PROG]: PONDERACIONES_OK,
  [BBDD]: PONDERACIONES_ERRATA,
  [DESPLIEGUE]: PONDERACIONES_CONVENIO,
  [SIN_NADIE]: PONDERACIONES_OK,
};

const OPCIONES = {
  tipo: 'programacion_didactica',
  curso: '2026-27',
  ciclo: 'daw',
  departamento: 'informatica',
  estado: 'borrador',
  origenApartados: 'nuevo',
  conciliar: (titulo) => MODULOS.find((id) => Unidades.tituloDe(id, '2026-27') === titulo),
};

const datosDe = (u) => ({
  departamento: 'informatica',
  documento: {
    introduccion: { texto: [{ type: 'p', text: 'Esta programación la escribe el departamento de Informática.' }] },
  },
  instancias: MODULOS.map((id) => ({
    titulo: Unidades.tituloDe(id, '2026-27'),
    num: null,
    grupo: 'Módulos del primer curso',
    // `daw-0487` se queda sin nadie a propósito: es el cuarto error del documento, y el que prueba
    // que la puerta de aprobación no mira solo las ponderaciones.
    docentes: id === SIN_NADIE ? [] : [u.ana._id],
    valores: {
      'modulos/resultados-de-aprendizaje': { ra_ce: RA_CE },
      'modulos/metodologia': { texto: [{ type: 'p', text: `Metodología de ${Unidades.tituloDe(id, '2026-27')}.` }] },
      'modulos/ponderaciones': { ponderaciones: PONDERACIONES_DE[id] },
      'modulos/situaciones-de-aprendizaje': { ficha: [FICHA_DEL_RA1] },
    },
  })),
  asignaciones: {},
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
    estudios: await persona('Jefatura de estudios', 'estudios@ejemplo.invalid', 'jefe_estudios', 'direccion'),
    // De matemáticas: no ve este documento, y por eso recibe 404 y no 403 (docs/api.md).
    otraJefa: await persona('Jefatura de matemáticas', 'mates@ejemplo.invalid', 'jefe_departamento', 'matematicas'),
  };

  const doc = await sembrar(repo, aFilas({ plantilla: PLANTILLA, datos: datosDe(u) }, OPCIONES));
  return { repo, u, doc };
}

// Un documento SIN errores: el mismo, con todas las ponderaciones cuadradas y todos los módulos
// repartidos. Es el que sirve para mirar la marca de agua sin que la puerta se interponga.
async function escenarioLimpio() {
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
    estudios: await persona('Jefatura de estudios', 'estudios@ejemplo.invalid', 'jefe_estudios', 'direccion'),
    otraJefa: await persona('Jefatura de matemáticas', 'mates@ejemplo.invalid', 'jefe_departamento', 'matematicas'),
  };

  const datos = datosDe(u);
  for (const instancia of datos.instancias) {
    instancia.docentes = [u.ana._id];
    instancia.valores['modulos/ponderaciones'] = { ponderaciones: PONDERACIONES_OK };
  }
  const doc = await sembrar(repo, aFilas({ plantilla: PLANTILLA, datos }, OPCIONES));
  return { repo, u, doc };
}

// Lleva un documento limpio hasta `revision`, que es desde donde se aprueba.
async function enRevision() {
  const escena = await escenarioLimpio();
  await paso(escena.u.jefa, escena.doc._id, 'revision');
  return escena;
}

// ================================================================ 1. el criterio de aceptación

prueba('aprobar quita la marca de agua del PDF, y el borrador la lleva', async () => {
  const { repo, u, doc } = await escenarioLimpio();

  // En borrador, con marca de agua y con la línea de estado que le toca.
  const antes = await definicionDe(u.jefa, doc._id);
  assert.equal(conMarcaDeAgua(antes), true, 'un borrador tiene que salir con la marca de agua');
  assert.equal(antes.watermark.text, 'BORRADOR');
  assert.ok(lineaDeEstado(antes).startsWith('Estado: BORRADOR'), lineaDeEstado(antes));

  await paso(u.jefa, doc._id, 'revision');
  const enRevisionPdf = await definicionDe(u.jefa, doc._id);
  assert.equal(conMarcaDeAgua(enRevisionPdf), true, 'en revisión todavía no está aprobado: marca de agua');

  const aprobado = await paso(u.estudios, doc._id, 'aprobado');
  assert.equal(aprobado.marcaDeAgua, false, 'la respuesta tiene que decir que ya no lleva marca de agua');
  assert.equal(await guardado(repo, doc._id), 'aprobado');

  // Y el criterio, sobre el PDF que sale de la ruta sin pedirle ningún estado.
  const despues = await definicionDe(u.jefa, doc._id);
  assert.equal(conMarcaDeAgua(despues), false, 'aprobar no ha quitado la marca de agua del PDF');
  assert.ok(lineaDeEstado(despues).startsWith('Estado: APROBADO'), lineaDeEstado(despues));
});

prueba('el PDF aprobado y el borrador se diferencian SOLO en la marca de agua y en la línea de estado', async () => {
  // Es la otra mitad del criterio: quitar la marca de agua no puede cambiar nada más del tomo. Si
  // aprobar moviera un apartado, un salto de página o una tabla, la programación impresa del
  // departamento no sería la misma que la que se revisó.
  const { u, doc } = await escenarioLimpio();

  const borrador = comparable(await definicionDe(u.jefa, doc._id, 'borrador'));
  const aprobado = comparable(await definicionDe(u.jefa, doc._id, 'aprobado'));

  assert.equal(!!borrador.watermark, true);
  assert.equal(aprobado.watermark, undefined, 'el aprobado no puede llevar watermark, ni vacío');

  // Se quitan las dos diferencias que SÍ tienen que estar, y el resto tiene que ser idéntico.
  const sinLoQueCambia = (definicion) => {
    const copia = JSON.parse(JSON.stringify(definicion, (clave, valor) => (clave === 'watermark' ? undefined : valor)));
    const quitar = (x) => {
      if (Array.isArray(x)) { x.forEach(quitar); return; }
      if (x && typeof x === 'object') {
        if (typeof x.text === 'string' && x.text.startsWith('Estado: ')) { x.text = 'Estado: (normalizado)'; delete x.color; }
        Object.values(x).forEach(quitar);
      }
    };
    quitar(copia);
    return copia;
  };

  assert.deepStrictEqual(sinLoQueCambia(borrador), sinLoQueCambia(aprobado),
    'aprobar cambia algo más del tomo que la marca de agua y la línea de estado');
});

prueba('un documento con errores no se puede aprobar, y el rechazo dice cuántos y dónde', async () => {
  const { repo, u, doc } = await escenario();
  await paso(u.jefa, doc._id, 'revision');

  const cuerpo = await esError(await cambiar(u.estudios, doc._id, { estado: 'aprobado' }), 409, 'con_errores');

  // Cuántos: los cuatro del documento, separados en los dos grupos.
  assert.equal(cuerpo.errores, 4, 'la cuenta de errores no es la del panel');
  assert.equal(cuerpo.porArreglar, 2);
  assert.equal(cuerpo.delConvenio, 2);
  assert.deepStrictEqual(cuerpo.porRegla, {
    sin_docente: 1, criterios_de_ra: 1, [Val.CIEN_DENTRO_DEL_RA]: 2,
  }, 'el desglose por regla es lo que dice qué hay que hacer con cada uno');

  // Dónde: por módulo, en el orden del documento, con el apartado al que hay que ir.
  const porTitulo = new Map(cuerpo.donde.map((g) => [g.unidadId, g]));
  assert.equal(cuerpo.donde.length, 3, 'tres módulos con errores: el cuarto está bien');
  assert.ok(!porTitulo.has(PROG), 'Programación no tiene errores y no debería salir en la lista');
  assert.deepStrictEqual(
    { errores: porTitulo.get(BBDD).errores, porArreglar: porTitulo.get(BBDD).porArreglar, delConvenio: porTitulo.get(BBDD).delConvenio },
    { errores: 1, porArreglar: 1, delConvenio: 0 },
  );
  assert.deepStrictEqual(
    { errores: porTitulo.get(DESPLIEGUE).errores, porArreglar: porTitulo.get(DESPLIEGUE).porArreglar, delConvenio: porTitulo.get(DESPLIEGUE).delConvenio },
    { errores: 2, porArreglar: 0, delConvenio: 2 },
  );
  assert.equal(porTitulo.get(SIN_NADIE).errores, 1, 'un módulo sin profesorado es un error que bloquea');

  // El destino es el apartado al que se va a arreglarlo, no el documento a secas.
  assert.deepStrictEqual(porTitulo.get(BBDD).destino, { seccion: 'modulos/ponderaciones', unidadId: BBDD });
  assert.equal(porTitulo.get(BBDD).titulo, Unidades.tituloDe(BBDD, '2026-27'));

  // El mensaje se puede enseñar tal cual y lleva las dos cifras dentro.
  assert.ok(cuerpo.mensaje.includes('4 errores'), cuerpo.mensaje);
  assert.ok(cuerpo.mensaje.includes('2 hay que arreglarlos'), cuerpo.mensaje);
  assert.ok(/convenio/.test(cuerpo.mensaje), 'el mensaje no menciona el convenio');
  assert.ok(cuerpo.mensaje.includes(Unidades.tituloDe(DESPLIEGUE, '2026-27')), 'el mensaje no dice dónde');

  // Y no ha cambiado nada: un rechazo no deja el documento a medio aprobar.
  assert.equal(await guardado(repo, doc._id), 'revision');
});

prueba('los errores del otro convenio siguen bloqueando: arreglar las erratas no los hace desaparecer', async () => {
  // ES EL CASO DE LOS 22 AVISOS DEL DOCUMENTO REAL. Se arreglan las erratas de verdad y se reparte el
  // módulo que no llevaba nadie, y el documento SIGUE sin poderse aprobar, porque quedan los del
  // convenio. Eso es lo correcto mientras el departamento no decida, y el rechazo lo dice con esas
  // palabras: si algún día alguien baja la severidad del convenio, esta prueba se pone roja.
  const { repo, u, doc } = await escenario();
  await paso(u.jefa, doc._id, 'revision');

  await escribir(u.ana, doc._id, 'modulos/ponderaciones', BBDD, { ponderaciones: PONDERACIONES_OK });
  await repo.unidades.actualizar(doc._id, SIN_NADIE, { docentes: [u.ana._id] });

  const cuerpo = await esError(await cambiar(u.estudios, doc._id, { estado: 'aprobado' }), 409, 'con_errores');
  assert.equal(cuerpo.errores, 2, 'tenían que quedar solo los dos del convenio');
  assert.equal(cuerpo.porArreglar, 0, 'ya no queda ninguna errata');
  assert.equal(cuerpo.delConvenio, 2);
  assert.deepStrictEqual(cuerpo.porRegla, { [Val.CIEN_DENTRO_DEL_RA]: 2 });
  assert.ok(cuerpo.mensaje.includes('Ninguno es una errata'), cuerpo.mensaje);
  assert.ok(cuerpo.mensaje.includes('pendiente de decidir'), cuerpo.mensaje);
  assert.equal(cuerpo.donde.length, 1, 'solo queda un módulo con errores');
  assert.equal(cuerpo.donde[0].unidadId, DESPLIEGUE);
  assert.equal(await guardado(repo, doc._id), 'revision');
});

prueba('arreglado todo —convenio incluido— se aprueba, y el panel y la puerta dicen lo mismo', async () => {
  const { repo, u, doc } = await escenario();
  await paso(u.jefa, doc._id, 'revision');

  // Antes de arreglar, las dos coinciden en que no.
  assert.equal((await validacionesDe(u.estudios, doc._id)).puedeAprobarse, false);
  await esError(await cambiar(u.estudios, doc._id, { estado: 'aprobado' }), 409, 'con_errores');

  await escribir(u.ana, doc._id, 'modulos/ponderaciones', BBDD, { ponderaciones: PONDERACIONES_OK });
  // El módulo del otro convenio se unifica al estricto, que es una de las dos salidas que el rechazo
  // pone a la vista.
  await escribir(u.ana, doc._id, 'modulos/ponderaciones', DESPLIEGUE, { ponderaciones: PONDERACIONES_OK });
  await repo.unidades.actualizar(doc._id, SIN_NADIE, { docentes: [u.ana._id] });

  const panel = await validacionesDe(u.estudios, doc._id);
  assert.equal(panel.cuenta.error, 0, 'el panel todavía cuenta errores');
  assert.equal(panel.puedeAprobarse, true);
  assert.ok(panel.cuenta.aviso > 0, 'los avisos siguen ahí y no bloquean: son avisos, no errores');

  const hecho = await paso(u.estudios, doc._id, 'aprobado');
  assert.equal(hecho.marcaDeAgua, false);
  assert.equal(conMarcaDeAgua(await definicionDe(u.jefa, doc._id)), false);
});

prueba('los avisos no bloquean la aprobación; solo los errores', async () => {
  // El documento limpio sigue teniendo avisos —los RA que ninguna situación de aprendizaje trabaja—
  // y se aprueba igual. Es la regla de core/validaciones.js (`puedeAprobarse`) y es deliberada: un
  // aviso es algo que mirar, no algo que impida entregar el documento.
  const { u, doc } = await escenarioLimpio();
  const panel = await validacionesDe(u.estudios, doc._id);
  assert.ok(panel.total > 0, 'el documento limpio debería tener algún aviso');
  assert.equal(panel.cuenta.error, 0);
  assert.equal(panel.puedeAprobarse, true);

  await paso(u.jefa, doc._id, 'revision');
  await paso(u.estudios, doc._id, 'aprobado');
});

// ================================================================ 2. quién mueve cada flecha

prueba('manda a revisión la jefatura del departamento, y el soporte', async () => {
  const uno = await escenarioLimpio();
  assert.equal((await paso(uno.u.jefa, uno.doc._id, 'revision')).accion, 'enviar');

  const otro = await escenarioLimpio();
  await paso(otro.u.admin, otro.doc._id, 'revision');
});

prueba('el docente no manda a revisión: escribe lo suyo, no decide que el documento está listo', async () => {
  const { repo, u, doc } = await escenarioLimpio();
  const cuerpo = await esError(await cambiar(u.ana, doc._id, { estado: 'revision' }), 403, 'sin_permiso');
  assert.ok(/jefatura/.test(cuerpo.mensaje), 'el 403 tiene que decir quién sí puede');
  assert.equal(await guardado(repo, doc._id), 'borrador');
});

prueba('la jefatura de estudios no manda a revisión: lo manda quien lo ha escrito', async () => {
  const { repo, u, doc } = await escenarioLimpio();
  await esError(await cambiar(u.estudios, doc._id, { estado: 'revision' }), 403, 'sin_permiso');
  assert.equal(await guardado(repo, doc._id), 'borrador');
});

prueba('aprueba la jefatura de estudios, y el soporte', async () => {
  const uno = await enRevision();
  assert.equal((await paso(uno.u.estudios, uno.doc._id, 'aprobado')).accion, 'aprobar');

  const otro = await enRevision();
  await paso(otro.u.admin, otro.doc._id, 'aprobado');
});

prueba('la jefatura del departamento no aprueba su propio documento', async () => {
  // Es la razón de que el rol exista: quien aprueba no puede ser quien escribe.
  const { repo, u, doc } = await enRevision();
  const cuerpo = await esError(await cambiar(u.jefa, doc._id, { estado: 'aprobado' }), 403, 'sin_permiso');
  assert.ok(/jefatura de estudios/.test(cuerpo.mensaje), cuerpo.mensaje);
  assert.equal(await guardado(repo, doc._id), 'revision');
});

prueba('el docente no aprueba', async () => {
  const { repo, u, doc } = await enRevision();
  await esError(await cambiar(u.ana, doc._id, { estado: 'aprobado' }), 403, 'sin_permiso');
  assert.equal(await guardado(repo, doc._id), 'revision');
});

prueba('devuelven a borrador las dos jefaturas: la de estudios y la del departamento', async () => {
  const uno = await enRevision();
  assert.equal((await paso(uno.u.estudios, uno.doc._id, 'borrador')).accion, 'devolver');

  const otro = await enRevision();
  await paso(otro.u.jefa, otro.doc._id, 'borrador');
});

prueba('el docente no devuelve a borrador un documento en revisión', async () => {
  const { repo, u, doc } = await enRevision();
  await esError(await cambiar(u.ana, doc._id, { estado: 'borrador' }), 403, 'sin_permiso');
  assert.equal(await guardado(repo, doc._id), 'revision');
});

prueba('reabre un documento aprobado quien lo aprobó: la jefatura de estudios, no la del departamento', async () => {
  const uno = await enRevision();
  await paso(uno.u.estudios, uno.doc._id, 'aprobado');
  await esError(await cambiar(uno.u.jefa, uno.doc._id, { estado: 'borrador' }), 403, 'sin_permiso');
  await esError(await cambiar(uno.u.jefa, uno.doc._id, { estado: 'revision' }), 403, 'sin_permiso');
  assert.equal(await guardado(uno.repo, uno.doc._id), 'aprobado', 'un 403 no puede haber cambiado el estado');

  assert.equal((await paso(uno.u.estudios, uno.doc._id, 'revision')).accion, 'reabrir');

  // Y también se puede devolver del todo al departamento.
  const otro = await enRevision();
  await paso(otro.u.estudios, otro.doc._id, 'aprobado');
  assert.equal((await paso(otro.u.estudios, otro.doc._id, 'borrador')).accion, 'reabrir');
  assert.equal(conMarcaDeAgua(await definicionDe(otro.u.jefa, otro.doc._id)), true,
    'reabrir tiene que devolver la marca de agua: el documento ya no está aprobado');
});

prueba('sin identificarse, 401 en las dos rutas del estado', async () => {
  const { doc } = await escenarioLimpio();
  await esError(await estadoDe(null, doc._id), 401, 'sin_identificar');
  await esError(await cambiar(null, doc._id, { estado: 'revision' }), 401, 'sin_identificar');
});

prueba('un documento de otro departamento es 404 y no 403, también para cambiarle el estado', async () => {
  // «No lo ves» es lo que dice la regla, y un 403 confirmaría que ese documento existe (docs/api.md).
  const { repo, u, doc } = await escenarioLimpio();
  await esError(await estadoDe(u.otraJefa, doc._id), 404, 'no_encontrado');
  await esError(await cambiar(u.otraJefa, doc._id, { estado: 'revision' }), 404, 'no_encontrado');
  assert.equal(await guardado(repo, doc._id), 'borrador');

  // Y un id que no es de ningún documento, también 404 y no 500.
  await esError(await cambiar(u.jefa, 'no-existe', { estado: 'revision' }), 404, 'no_encontrado');
});

prueba('la jefatura de estudios aprueba documentos de cualquier departamento: es para lo que ve todos', async () => {
  const { repo, u, doc } = await escenarioLimpio();
  // Un documento de matemáticas, que la jefatura de informática no ve y la de estudios sí.
  const otro = await sembrar(repo, aFilas({
    plantilla: { ...PLANTILLA, origen: 'PD_matematicas.docx' },
    datos: { departamento: 'matematicas', documento: { introduccion: { texto: [] } }, instancias: [], asignaciones: {}, compartidos: {} },
  }, { ...OPCIONES, departamento: 'matematicas', conciliar: undefined }));

  await esError(await estadoDe(u.jefa, otro._id), 404, 'no_encontrado');
  await paso(u.otraJefa, otro._id, 'revision');
  await paso(u.estudios, otro._id, 'aprobado');
  assert.equal(await guardado(repo, otro._id), 'aprobado');
  // Y el de informática sigue donde estaba: cada documento va por su cuenta.
  assert.equal(await guardado(repo, doc._id), 'borrador');
});

// ================================================================ 3. el circuito

prueba('de borrador a aprobado no se puede ir: la flecha no existe, ni para el soporte', async () => {
  const { repo, u, doc } = await escenarioLimpio();
  for (const persona of [u.estudios, u.admin, u.jefa]) {
    const cuerpo = await esError(await cambiar(persona, doc._id, { estado: 'aprobado' }), 400, 'peticion');
    assert.deepStrictEqual(cuerpo.destinos, ['revision'], 'el error tiene que decir a dónde sí se puede ir');
    assert.ok(/revisión/.test(cuerpo.mensaje), cuerpo.mensaje);
  }
  assert.equal(await guardado(repo, doc._id), 'borrador');
});

prueba('pedir el estado en el que ya está es un 400 y no un 200 que no hace nada', async () => {
  const { u, doc } = await escenarioLimpio();
  const cuerpo = await esError(await cambiar(u.jefa, doc._id, { estado: 'borrador' }), 400, 'peticion');
  assert.ok(/ya está/.test(cuerpo.mensaje), cuerpo.mensaje);
});

prueba('un estado que no existe, o que falta, es un 400 que dice los que hay', async () => {
  const { u, doc } = await escenarioLimpio();
  const malo = await esError(await cambiar(u.jefa, doc._id, { estado: 'validado' }), 400, 'peticion');
  for (const bueno of ['borrador', 'revision', 'aprobado']) {
    assert.ok(malo.mensaje.includes(bueno), `el error no enseña «${bueno}»: ${malo.mensaje}`);
  }
  await esError(await cambiar(u.jefa, doc._id, {}), 400, 'peticion');
  await esError(await cambiar(u.jefa, doc._id, { estado: '   ' }), 400, 'peticion');
  await esError(await cambiar(u.jefa, doc._id, { estado: 7 }), 400, 'peticion');
  await esError(await cambiar(u.jefa, doc._id, 'esto no es json'), 400, 'peticion');
});

prueba('el circuito entero: borrador → revisión → aprobado → revisión → borrador', async () => {
  const { repo, u, doc } = await escenarioLimpio();
  const camino = [
    [u.jefa, 'revision'], [u.estudios, 'aprobado'], [u.estudios, 'revision'],
    [u.jefa, 'borrador'], [u.jefa, 'revision'], [u.estudios, 'borrador'],
  ];
  const visto = [];
  for (const [persona, destino] of camino) {
    const hecho = await paso(persona, doc._id, destino);
    visto.push(`${hecho.anterior}→${hecho.estado}`);
    assert.equal(await guardado(repo, doc._id), destino);
    assert.equal(hecho.documento.estado, destino, 'el documento que se devuelve tiene que llevar el estado nuevo');
    assert.equal(hecho.documento.plantilla, undefined, 'ninguna ruta devuelve la plantilla (docs/api.md)');
  }
  assert.deepStrictEqual(visto, [
    'borrador→revision', 'revision→aprobado', 'aprobado→revision',
    'revision→borrador', 'borrador→revision', 'revision→borrador',
  ]);
});

prueba('GET /estado dice en qué estado está y qué puede hacer cada uno', async () => {
  const { u, doc } = await escenarioLimpio();

  const paraLaJefa = await (await estadoDe(u.jefa, doc._id)).json();
  assert.equal(paraLaJefa.estado, 'borrador');
  assert.equal(paraLaJefa.marcaDeAgua, true);
  assert.deepStrictEqual(paraLaJefa.estados, ['borrador', 'revision', 'aprobado']);
  assert.deepStrictEqual(paraLaJefa.transiciones.map((t) => [t.a, t.accion, t.puede]),
    [['revision', 'enviar', true]], 'desde borrador solo se va a revisión, y la manda la jefatura');

  // La misma lista para todos, con el candado en `puede`: el cliente refleja, no decide.
  for (const [persona, puede] of [[u.estudios, false], [u.ana, false], [u.admin, true]]) {
    const visto = await (await estadoDe(persona, doc._id)).json();
    assert.deepStrictEqual(visto.transiciones.map((t) => t.puede), [puede],
      `${persona.nombre} debería ${puede ? '' : 'no '}poder mandar a revisión`);
  }
});

prueba('GET /estado de un documento en revisión ofrece aprobar solo a quien aprueba', async () => {
  const { u, doc } = await enRevision();

  const salidas = async (persona) => {
    const visto = await (await estadoDe(persona, doc._id)).json();
    return Object.fromEntries(visto.transiciones.map((t) => [t.a, t.puede]));
  };
  assert.deepStrictEqual(await salidas(u.estudios), { borrador: true, aprobado: true });
  assert.deepStrictEqual(await salidas(u.jefa), { borrador: true, aprobado: false });
  assert.deepStrictEqual(await salidas(u.ana), { borrador: false, aprobado: false });

  // Y de un aprobado, reabrir.
  await paso(u.estudios, doc._id, 'aprobado');
  const tras = await (await estadoDe(u.estudios, doc._id)).json();
  assert.equal(tras.marcaDeAgua, false);
  assert.deepStrictEqual(tras.transiciones.map((t) => [t.a, t.accion, t.puede]),
    [['revision', 'reabrir', true], ['borrador', 'reabrir', true]]);
});

prueba('un esperaUpdatedAt que no cuadra da 409 y no cambia el estado', async () => {
  const { repo, u, doc } = await escenarioLimpio();
  const viejo = new Date(0).toISOString();
  const cuerpo = await esError(await cambiar(u.jefa, doc._id, { estado: 'revision', esperaUpdatedAt: viejo }), 409, 'conflicto');
  assert.equal(cuerpo.esperado, viejo);
  assert.ok(cuerpo.actual, 'el 409 tiene que decir cuál es la versión de ahora');
  assert.equal(await guardado(repo, doc._id), 'borrador');

  // Con el que de verdad tiene, pasa.
  const ahora = await repo.documentos.obtener(doc._id);
  await paso(u.jefa, doc._id, 'revision');
  // Y ese mismo, reutilizado, ya no vale: cambiar el estado mueve la versión del documento.
  await esError(
    await cambiar(u.estudios, doc._id, { estado: 'aprobado', esperaUpdatedAt: new Date(ahora.updatedAt).toISOString() }),
    409, 'conflicto',
  );
  assert.equal(await guardado(repo, doc._id), 'revision');
});

// ================================================================ 4. el estado viaja al PDF y al Word

prueba('el estado del documento es el que usa el PDF por omisión; en la URL solo hay dos formas de imprimir', async () => {
  // DOS ESCALAS DISTINTAS, y es la parte que se puede confundir. El documento está en borrador, en
  // revisión o aprobado; el tomo solo se imprime de dos maneras, con la marca de agua o sin ella. Un
  // documento en revisión se imprime como borrador, que es exacto: no está aprobado. Por eso
  // `?estado=revision` no existe y da 400, igual que cualquier otro valor que no sea uno de los dos.
  const { repo, u, doc } = await escenarioLimpio();

  // Por omisión, el del documento, en los tres estados.
  assert.equal(conMarcaDeAgua(await definicionDe(u.jefa, doc._id)), true);
  await paso(u.jefa, doc._id, 'revision');
  assert.equal(conMarcaDeAgua(await definicionDe(u.jefa, doc._id)), true, 'en revisión no está aprobado');
  await paso(u.estudios, doc._id, 'aprobado');
  assert.equal(conMarcaDeAgua(await definicionDe(u.jefa, doc._id)), false);

  // Y pedido a mano manda el de la URL: así se puede ver cómo quedaría antes de aprobar.
  assert.equal(conMarcaDeAgua(await definicionDe(u.jefa, doc._id, 'borrador')), true);
  assert.equal(conMarcaDeAgua(await definicionDe(u.jefa, doc._id, 'aprobado')), false);

  // `revision` NO es una forma de imprimir, así que en la URL es un 400 con los dos valores que sí
  // valen. Y uno escrito mal, igual: no se entrega un PDF con marca de agua a quien creía haber
  // pedido el aprobado.
  for (const malo of ['revision', 'aprovado', 'validado']) {
    const res = await Pdf.definicionDe(pet(`/api/documentos/${doc._id}/pdf?estado=${malo}`, u.jefa), { id: doc._id });
    const cuerpo = await esError(res.fallo, 400, 'peticion');
    assert.ok(cuerpo.mensaje.includes('borrador') && cuerpo.mensaje.includes('aprobado'), cuerpo.mensaje);
  }

  // Y el estado guardado sí puede ser `revision`: entonces el PDF por omisión sale con marca de agua
  // sin que nadie tenga que pedir «borrador». La conversión la hace la ruta, no el cliente.
  await paso(u.estudios, doc._id, 'revision');
  assert.equal(await guardado(repo, doc._id), 'revision');
  assert.equal(conMarcaDeAgua(await definicionDe(u.jefa, doc._id)), true);
});

prueba('el Word sale en los tres estados del documento y es el mismo: no lleva marca de agua, y es a propósito', async () => {
  // El estado llega a la ruta del Word y se valida, pero `motor/exportar-docx.js` no escribe ninguna
  // marca de agua: la de BORRADOR es una propiedad de página de pdfmake (ver la cabecera de
  // app/_lib/rutas/docx.js). Esta prueba lo fija por escrito: el Word del mismo documento es el mismo
  // en los tres estados. **Es el único sitio en el que el estado NO viaja**, y está dicho en el
  // contrato; si algún día se le añade la marca al Word, esta prueba se pone roja y tendrá que ser
  // una decisión tomada a propósito y no un efecto secundario.
  const { u, doc } = await escenarioLimpio();

  const borrador = await wordDe(u.jefa, doc._id);
  assert.ok(borrador.includes('Metodología'), 'el Word no lleva el contenido del documento');
  assert.ok(!/BORRADOR/.test(borrador), 'el Word no pinta marca de agua (ver la cabecera de docx.js)');
  assert.equal(await wordDe(u.jefa, doc._id, 'borrador'), borrador);
  assert.equal(await wordDe(u.jefa, doc._id, 'aprobado'), borrador);

  // Y recorrer el circuito entero tampoco lo cambia: el Word del aprobado es el del borrador.
  await paso(u.jefa, doc._id, 'revision');
  assert.equal(await wordDe(u.jefa, doc._id), borrador, 'en revisión el Word ha cambiado');
  await paso(u.estudios, doc._id, 'aprobado');
  assert.equal(await wordDe(u.jefa, doc._id), borrador, 'al aprobar el Word ha cambiado');

  // Un estado que no es una forma de imprimir sigue siendo un 400, para no dar la impresión de haber
  // exportado un aprobado. `revision` entra aquí: es un estado del documento, no del papel.
  for (const malo of ['revision', 'aprovado']) {
    await esError(await Docx.GET(pet(`/api/documentos/${doc._id}/docx?estado=${malo}`, u.jefa), { id: doc._id }), 400, 'peticion');
  }
});

prueba('el estado del documento sale en /api/documentos/[id], que es de donde lo lee la pantalla', async () => {
  const { u, doc } = await escenarioLimpio();
  const leerDoc = async (persona) => (await (await Documento.GET(pet(`/api/documentos/${doc._id}`, persona), { id: doc._id })).json()).documento;

  assert.equal((await leerDoc(u.jefa)).estado, 'borrador');
  await paso(u.jefa, doc._id, 'revision');
  assert.equal((await leerDoc(u.jefa)).estado, 'revision');
  await paso(u.estudios, doc._id, 'aprobado');
  assert.equal((await leerDoc(u.estudios)).estado, 'aprobado');
});

prueba('aprobar no toca ni una fila del contenido', async () => {
  // Aprobar es una etiqueta del documento, no una escritura sobre lo escrito. Si tocara los
  // apartados, el `updatedAt` de cada rama cambiaría y todas las pestañas abiertas empezarían a dar
  // 409 al guardar.
  const { repo, u, doc } = await escenarioLimpio();
  const foto = JSON.stringify(await repo.apartados.listar(doc._id));
  const unidades = JSON.stringify(await repo.unidades.listar(doc._id));

  await paso(u.jefa, doc._id, 'revision');
  await paso(u.estudios, doc._id, 'aprobado');

  assert.equal(JSON.stringify(await repo.apartados.listar(doc._id)), foto, 'aprobar ha tocado los apartados');
  assert.equal(JSON.stringify(await repo.unidades.listar(doc._id)), unidades, 'aprobar ha tocado las unidades');

  // Y tampoco la plantilla ni su versión: la estructura es otra cosa.
  const despues = await repo.documentos.obtener(doc._id);
  assert.equal(despues.plantillaVersion, 1);
  assert.deepStrictEqual(despues.plantilla, PLANTILLA);
});

prueba('un documento aprobado se sigue pudiendo editar, y el PDF no vuelve a tener marca de agua por eso', async () => {
  // Lo que un estado NO es: un candado de escritura. Quién puede editar lo sigue decidiendo
  // core/permisos.js, y el E7 no cambia esa regla. Si algún día se decide que un aprobado se
  // congela, será una decisión explícita y esta prueba es la que se pondrá roja.
  const { u, doc } = await escenarioLimpio();
  await paso(u.jefa, doc._id, 'revision');
  await paso(u.estudios, doc._id, 'aprobado');

  await escribir(u.ana, doc._id, 'modulos/metodologia', PROG, { texto: [{ type: 'p', text: 'Metodología retocada en junio.' }] });
  const definicion = await definicionDe(u.jefa, doc._id);
  assert.equal(conMarcaDeAgua(definicion), false, 'el documento sigue aprobado');
  assert.ok(JSON.stringify(definicion).includes('Metodología retocada en junio.'), 'lo escrito no sale en el tomo');
});

// ================================================================ 5. el PCCF y la memoria
//
// La importación de los tipos que se admiten, con un documento SINTÉTICO: los `.docx` reales del
// departamento no están en el repositorio —no se versionan, docs/entrada_ej/README.md— así que una
// prueba que dependiera de ellos no se podría ejecutar en una máquina recién clonada.
//
// El Word de prueba lo escribe el propio exportador a partir de una plantilla de memoria, así que el
// ida y vuelta es completo: escribir → subir → importar → navegar → exportar.

const DOCX_TIPO = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// Una memoria: apartados comunes y NINGÚN bloque de módulo, que es la forma que tiene la memoria
// real del departamento (43 apartados, 0 módulos).
const PLANTILLA_MEMORIA = {
  tipo: 'memoria', origen: 'Memoria_prueba.docx', version: null, generada: '2026-01-01T00:00:00.000Z',
  secciones: [
    { id: 'profesorado-del-departamento', titulo: 'Profesorado del departamento', nivel: 1, campos: [campoTexto], hijos: [
      { id: 'profesorado-del-departamento/reparto', titulo: 'Reparto de la carga docente', nivel: 2, campos: [campoTexto], hijos: [] },
    ] },
    { id: 'docencia-en-ciclos-formativos', titulo: 'Docencia en ciclos formativos', nivel: 1, campos: [campoTexto], hijos: [
      { id: 'docencia-en-ciclos-formativos/resultados', titulo: 'Resultados de la evaluación', nivel: 2, campos: [campoTexto], hijos: [] },
    ] },
    { id: 'mejora-de-la-practica-docente', titulo: 'Mejora de la práctica docente', nivel: 1, campos: [campoTexto], hijos: [] },
  ],
};

const DATOS_MEMORIA = {
  departamento: 'informatica',
  documento: {
    'profesorado-del-departamento': { texto: [{ type: 'p', text: 'El departamento lo forman seis personas este curso.' }] },
    'profesorado-del-departamento/reparto': { texto: [{ type: 'p', text: 'El reparto se acordó en la reunión de septiembre.' }] },
    'docencia-en-ciclos-formativos': { texto: [{ type: 'p', text: 'Se han impartido los dos ciclos completos.' }] },
    'docencia-en-ciclos-formativos/resultados': { texto: [{ type: 'p', text: 'La promoción ha sido del ochenta por ciento.' }] },
    'mejora-de-la-practica-docente': { texto: [{ type: 'p', text: 'Se propone unificar el convenio de ponderación.' }] },
  },
  instancias: [],
  asignaciones: {},
  compartidos: {},
};

// Una PD con módulos, para comprobar que subirla con el tipo equivocado se rechaza.
const PLANTILLA_PD_DOCX = {
  tipo: 'programacion_didactica', origen: 'PD_prueba.docx', version: null, generada: '2026-01-01T00:00:00.000Z',
  secciones: [
    { id: 'introduccion', titulo: 'Introducción', nivel: 1, campos: [campoTexto], hijos: [] },
    { id: 'modulos', titulo: 'Módulos', nivel: 1, instancias: true, etiqueta_instancia: 'módulo', grupos: ['Módulos'], campos: [], hijos: [
      { id: 'modulos/metodologia', titulo: 'Metodología', nivel: 3, campos: [campoTexto], hijos: [] },
      { id: 'modulos/evaluacion', titulo: 'Evaluación', nivel: 3, campos: [campoTexto], hijos: [] },
    ] },
  ],
};

const DATOS_PD_DOCX = {
  departamento: 'informatica',
  documento: { introduccion: { texto: [{ type: 'p', text: 'Introducción de prueba.' }] } },
  instancias: [PROG, BBDD, DESPLIEGUE].map((id, i) => ({
    titulo: Unidades.tituloDe(id, '2026-27'), num: `${i + 1}`, grupo: 'Módulos', docentes: [],
    valores: {
      'modulos/metodologia': { texto: [{ type: 'p', text: `Metodología de ${Unidades.tituloDe(id, '2026-27')}.` }] },
      'modulos/evaluacion': { texto: [{ type: 'p', text: 'Evaluación continua.' }] },
    },
  })),
  asignaciones: {},
  compartidos: {},
};

const docxMemoria = () => exportarDocx({ plantilla: PLANTILLA_MEMORIA, datos: DATOS_MEMORIA, titulo: 'Memoria del departamento · 2026-27' });
const docxPd = () => exportarDocx({ plantilla: PLANTILLA_PD_DOCX, datos: DATOS_PD_DOCX, titulo: 'Programación didáctica · DAW · 2026-27' });

// Una propuesta pedagógica de ESO: apartados comunes y UN BLOQUE POR MATERIA, que es la forma que
// tienen los cuatro documentos reales (27 apartados y 3 materias en los dos cursos de ESO; 21 y 2 en
// Bachillerato 2025-26, 24 y 3 en 2026-27). La diferencia con la PD de FP no está en la forma —las
// dos repiten un bloque por unidad— sino en lo que hay dentro: aquí NO hay ponderaciones de RA ni
// fichas de situación de aprendizaje, porque las situaciones de ESO y Bachillerato van por
// competencias específicas y no por resultados de aprendizaje (docs/mockup-v2/README.md). Eso es
// exactamente lo que se mide al importar los reales: ni un `ponderacion_ra_ce`, ni un
// `ficha_situacion_aprendizaje`, ni un `auto.tabla_ra_ce`; solo `texto_largo` y tablas.
const MATERIAS_ESO = ['eso-trds', 'eso-digi', 'eso-videojuegos'];
const MATERIAS_BACH = ['bach-inf1', 'bach-inf2', 'bach-prsi2'];

const PLANTILLA_PROPUESTA = {
  tipo: 'propuesta_pedagogica', origen: 'Propuesta_prueba.docx', version: null, generada: '2026-01-01T00:00:00.000Z',
  secciones: [
    { id: 'elementos-curriculares', titulo: 'Elementos curriculares de la etapa', nivel: 1, campos: [campoTexto], hijos: [
      { id: 'elementos-curriculares/competencias-clave', titulo: 'Competencias clave y descriptores operativos', nivel: 2, campos: [campoTexto], hijos: [] },
    ] },
    { id: 'materias', titulo: 'Concreción curricular de las materias', nivel: 1, instancias: true,
      etiqueta_instancia: 'materia', grupos: ['Concreción curricular de las materias'], campos: [], hijos: [
        { id: 'materias/competencias-especificas', titulo: 'Competencias específicas', nivel: 3, campos: [campoTexto], hijos: [] },
        { id: 'materias/situaciones-de-aprendizaje', titulo: 'Situaciones de aprendizaje', nivel: 3, campos: [campoTexto], hijos: [] },
      ] },
  ],
};

const datosPropuesta = (materias, curso) => ({
  departamento: 'informatica',
  documento: {
    'elementos-curriculares': { texto: [{ type: 'p', text: 'Los elementos curriculares salen del decreto de la etapa.' }] },
    'elementos-curriculares/competencias-clave': { texto: [{ type: 'p', text: 'Las ocho competencias clave con sus descriptores.' }] },
  },
  instancias: materias.map((id, i) => ({
    titulo: Unidades.tituloDe(id, curso), num: `${i + 1}`, grupo: 'Concreción curricular de las materias', docentes: [],
    valores: {
      'materias/competencias-especificas': { texto: [{ type: 'p', text: `Competencias específicas de ${Unidades.tituloDe(id, curso)}.` }] },
      'materias/situaciones-de-aprendizaje': { texto: [{ type: 'p', text: 'Las situaciones van por competencias específicas, no por RA.' }] },
    },
  })),
  asignaciones: {},
  compartidos: {},
});

const docxPropuesta = ({ materias = MATERIAS_ESO, curso = '2026-27' } = {}) => exportarDocx({
  plantilla: PLANTILLA_PROPUESTA, datos: datosPropuesta(materias, curso),
  titulo: `Propuesta pedagógica · ESO · ${curso}`,
});

// Un PCCF con la forma de los dos del departamento, y por eso NO lo escribe el exportador: sus
// apartados numerados están escritos con estilos propios (`Estilo1`, `Estilo3`) que no declaran nivel
// de esquema —ni Word los considera títulos—, y la estructura solo está en la tabla de contenidos que
// el documento lleva dentro. Es el camino que abre el respaldo del índice de motor/importar-docx.js,
// y lo que esta prueba comprueba es que ese documento llega hasta el PDF y hasta el Word.
//
// `conIndice = false` da el mismo documento sin índice: entonces no hay estructura por ningún lado,
// que es el caso que esta ruta tiene que seguir rechazando.
const APARTADOS_PCCF = [
  ['Estilo1', '0. Introducción', 'El proyecto curricular del ciclo formativo de DAW.'],
  ['Estilo1', '1. Acuerdos generales', 'Lo que acordó el equipo docente del ciclo.'],
  ['Estilo3', '1.1. Enfoques didácticos y metodológicos', 'Trabajo por proyectos y aula taller.'],
  ['Estilo3', '1.2. Base de datos de empresas', 'Las empresas que colaboran con el ciclo.'],
  ['Estilo1', '2. Atención a la diversidad', 'Medidas de refuerzo y de ampliación.'],
];
async function docxPccf({ conIndice = true } = {}) {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const estilo = (id, nombre) => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${esc(nombre)}"/></w:style>`;
  const p = (e, t) => `<w:p><w:pPr><w:pStyle w:val="${e}"/></w:pPr><w:r><w:t xml:space="preserve">${esc(t)}</w:t></w:r></w:p>`;
  // el índice, con el número de página pegado al título como lo escribe Word
  const indice = APARTADOS_PCCF.map(([e, t], i) => p(e === 'Estilo1' ? 'IDC1' : 'IDC2', `${t}${i + 3}`));
  const cuerpo = APARTADOS_PCCF.flatMap(([e, t, texto]) => [p(e, `${t} `), p('Normal', texto)]);

  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?>'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
    + '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
    + '</Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
    + '</Relationships>');
  zip.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
    + '</Relationships>');
  zip.file('word/styles.xml', '<?xml version="1.0" encoding="UTF-8"?>'
    + '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
    + '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>'
    // el styleId localizado y el nombre interno de Word, como en los documentos del departamento
    + estilo('IDC1', 'toc 1') + estilo('IDC2', 'toc 2') + estilo('Estilo1', 'Estilo1') + estilo('Estilo3', 'Estilo3')
    + '</w:styles>');
  zip.file('word/document.xml', '<?xml version="1.0" encoding="UTF-8"?>'
    + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
    + (conIndice ? indice.join('') : '') + cuerpo.join('')
    + '</w:body></w:document>');
  return zip.generateAsync({ type: 'nodebuffer' });
}

// Un formulario de importación. Un campo a `null` se omite (para probar que falta).
function subir(persona, buffer, campos = {}) {
  const formulario = new FormData();
  if (buffer !== null) formulario.append('archivo', new File([buffer], 'documento.docx', { type: DOCX_TIPO }));
  const valores = { tipo: 'memoria', curso: '2026-27', departamento: 'informatica', ...campos };
  for (const [clave, valor] of Object.entries(valores)) if (valor !== null) formulario.append(clave, valor);
  return Importar.POST(new Request('http://pruebas.local/api/documentos/importar', {
    method: 'POST',
    body: formulario,
    headers: persona ? { cookie: `${COOKIE_SESION}=${TESTIGOS.get(persona._id)}` } : {},
  }));
}

prueba('la memoria se importa, se navega y se exporta por el mismo camino que la PD', async () => {
  const { repo, u } = await escenarioLimpio();
  const res = await subir(u.jefa, await docxMemoria());
  assert.equal(res.status, 201, `la memoria tendría que importarse: ${res.status}`);
  const { documento, resumen } = await res.json();

  assert.equal(documento.tipo, 'memoria');
  assert.equal(documento.estado, 'borrador', 'todo lo que se importa nace en borrador');
  assert.equal(resumen.unidades, 0, 'una memoria no tiene módulos');
  assert.equal(resumen.secciones, 5, 'los cinco apartados de la memoria de prueba');
  assert.equal(resumen.apartados, 5);
  assert.deepStrictEqual(resumen.conciliacion, [], 'sin instancias no hay nada que conciliar');
  assert.deepStrictEqual(resumen.forzadas, []);
  assert.equal(documento.plantilla, undefined, 'la respuesta no lleva la plantilla');

  const id = documento._id;

  // El árbol: los cinco apartados, ninguna unidad.
  const arbol = Arbol.aplanar((await (await arbolDe(u.jefa, id)).json()).arbol);
  assert.equal(arbol.filter((n) => n.tipo === 'unidad').length, 0);
  const titulos = arbol.filter((n) => n.tipo === 'apartado').map((n) => n.titulo);
  assert.ok(titulos.includes('Profesorado del departamento'), titulos.join(' · '));
  assert.ok(titulos.includes('Resultados de la evaluación'), titulos.join(' · '));

  // El PDF, con el título del tomo que le toca a una memoria y con su contenido dentro.
  const definicion = await definicionDe(u.jefa, id);
  const impreso = JSON.stringify(definicion);
  assert.ok(impreso.includes('Memoria del departamento'), 'la portada no dice que es una memoria');
  assert.ok(impreso.includes('La promoción ha sido del ochenta por ciento.'), 'el contenido no llega al PDF');
  assert.equal(conMarcaDeAgua(definicion), true, 'recién importada está en borrador');

  // Y el Word.
  const xml = await wordDe(u.jefa, id);
  assert.ok(xml.includes('Mejora de la práctica docente'), 'el apartado no llega al Word');
  assert.ok(xml.includes('Se propone unificar el convenio de ponderación.'), 'el contenido no llega al Word');

  // Está guardada de verdad y se lista como un documento más.
  assert.equal((await repo.documentos.obtener(id)).tipo, 'memoria');
});

prueba('una memoria no tiene módulos, así que las comprobaciones de módulo no aplican y se aprueba', async () => {
  // Qué validaciones NO aplican a una memoria: todas las que son de un módulo. `criterios_de_ra` y
  // `suma_de_ra` necesitan un campo de ponderaciones, que una memoria no tiene; `ra_sin_situacion` y
  // `sa_sin_evaluacion` necesitan fichas de situación de aprendizaje; y `sin_docente` necesita
  // unidades. Así que el panel sale vacío —no «aprobado a la fuerza»: vacío porque no hay nada que
  // comprobar— y la puerta de aprobación deja pasar.
  const { u } = await escenarioLimpio();
  const { documento } = await (await subir(u.jefa, await docxMemoria())).json();
  const id = documento._id;

  const panel = await validacionesDe(u.estudios, id);
  assert.equal(panel.total, 0, 'una memoria no debería tener ningún aviso de módulo');
  assert.deepStrictEqual(panel.cuenta, { error: 0, aviso: 0, info: 0 });
  assert.equal(panel.grupos.length, 1, 'solo el grupo de los apartados comunes');
  assert.equal(panel.grupos[0].unidadId, null);
  assert.equal(panel.puedeAprobarse, true);

  // Y el criterio de aceptación, sobre la memoria: aprobar le quita la marca de agua.
  await paso(u.jefa, id, 'revision');
  assert.equal((await paso(u.estudios, id, 'aprobado')).marcaDeAgua, false);
  assert.equal(conMarcaDeAgua(await definicionDe(u.jefa, id)), false);
});

prueba('la memoria no exige ciclo —es del departamento entero— y la PD sí', async () => {
  const { u } = await escenarioLimpio();

  const sinCiclo = await subir(u.jefa, await docxMemoria());
  assert.equal(sinCiclo.status, 201);
  assert.equal((await sinCiclo.json()).documento.ciclo, null, 'una memoria sin ciclo se guarda con ciclo nulo');

  // Con ciclo también entra, pero el ciclo se ignora: la memoria es del departamento.
  const conCiclo = await subir(u.jefa, await docxMemoria(), { ciclo: 'DAW' });
  assert.equal(conCiclo.status, 201);
  assert.equal((await conCiclo.json()).documento.ciclo, null);

  // La PD sin ciclo, 400: sin él la conciliación de los módulos es ambigua (docs/api.md).
  const pd = await subir(u.jefa, await docxPd(), { tipo: 'programacion_didactica', ciclo: null });
  const cuerpo = await esError(pd, 400, 'peticion');
  assert.ok(cuerpo.mensaje.includes('ciclo'), cuerpo.mensaje);
});

prueba('el PCCF se importa aunque sus apartados no sean títulos: la estructura sale de su índice', async () => {
  // HASTA EL E7 ESTE DOCUMENTO SE NEGABA, y no por olvido: en los dos PCCF del departamento los
  // títulos de los apartados están escritos con estilos propios (`Estilo1`, `Estilo3`, `Estilo4`) que
  // no llevan nivel de esquema, así que ni Word los considera títulos y el importador no encontraba
  // estructura —9 apartados en el de DAW, 0 en el de SMR—. Ahora el importador lee la tabla de
  // contenidos que el documento lleva dentro y de ahí saca qué estilos son títulos y a qué nivel, así
  // que el documento entra entero y llega hasta el PDF y hasta el Word.
  const { repo, u } = await escenarioLimpio();
  const res = await subir(u.jefa, await docxPccf(), { tipo: 'pccf', ciclo: 'DAW' });
  assert.equal(res.status, 201, `el PCCF tendría que importarse: ${res.status}`);
  const { documento, resumen } = await res.json();

  assert.equal(documento.tipo, 'pccf');
  assert.equal(documento.ciclo, 'daw', 'el PCCF es de un ciclo, y el ciclo lo pide el formulario');
  assert.equal(documento.estado, 'borrador');
  assert.equal(resumen.unidades, 0, 'un PCCF no lleva módulos: es el proyecto del ciclo');
  assert.equal(resumen.secciones, 5, 'los tres apartados y los dos subapartados del PCCF de prueba');
  assert.equal(resumen.apartados, 5);
  // y el aviso dice de dónde ha salido la estructura, que es lo que hay que revisar en el Word
  assert.ok(resumen.avisos.some((a) => /ÍNDICE/.test(a)), `tiene que avisar de que la estructura sale del índice: ${resumen.avisos.join(' · ')}`);

  const id = documento._id;

  // El árbol: los cinco apartados con su anidamiento, ninguna unidad.
  const arbol = Arbol.aplanar((await (await arbolDe(u.jefa, id)).json()).arbol);
  assert.equal(arbol.filter((n) => n.tipo === 'unidad').length, 0);
  const titulos = arbol.filter((n) => n.tipo === 'apartado').map((n) => n.titulo);
  assert.deepStrictEqual(titulos, ['Introducción', 'Acuerdos generales', 'Enfoques didácticos y metodológicos', 'Base de datos de empresas', 'Atención a la diversidad'], titulos.join(' · '));

  // El PDF, con el título del tomo que le toca a un PCCF y con su contenido dentro.
  const impreso = JSON.stringify(await definicionDe(u.jefa, id));
  assert.ok(impreso.includes('Proyecto curricular'), 'la portada no dice que es un PCCF');
  assert.ok(impreso.includes('Trabajo por proyectos y aula taller.'), 'el contenido no llega al PDF');

  // Y el Word.
  const xml = await wordDe(u.jefa, id);
  assert.ok(xml.includes('Base de datos de empresas'), 'el subapartado no llega al Word');
  assert.ok(xml.includes('Las empresas que colaboran con el ciclo.'), 'el contenido no llega al Word');

  assert.equal((await repo.documentos.obtener(id)).tipo, 'pccf');
});

prueba('un Word del que no sale ni un apartado se niega, y el 400 dice qué arreglar', async () => {
  // La otra cara del respaldo del índice: el mismo PCCF SIN índice no tiene estructura por ningún
  // lado. Guardarlo dejaría un documento que sale en la lista, no se puede navegar y cuyo PDF son dos
  // páginas de portada, así que se niega antes de escribir nada. Esto es lo que hay que arreglar en
  // el Word —aplicar Título 1/2/3 o poner el índice al día—, y el mensaje lo dice.
  const { repo, u } = await escenarioLimpio();
  const antes = (await repo.documentos.listar({})).length;

  const cuerpo = await esError(await subir(u.jefa, await docxPccf({ conIndice: false }), { tipo: 'pccf', ciclo: 'DAW' }), 400, 'peticion');
  assert.ok(/estilos de t/i.test(cuerpo.mensaje), `el 400 tiene que decir qué arreglar: ${cuerpo.mensaje}`);
  assert.ok(/T[íi]tulo 1/.test(cuerpo.mensaje), `el 400 tiene que decir cómo arreglarlo: ${cuerpo.mensaje}`);
  assert.equal((await repo.documentos.listar({})).length, antes, 'un 400 no puede dejar nada escrito');

  // Y un tipo que no existe sigue dando 400 con la lista de los que sí.
  const otro = await esError(await subir(u.jefa, await docxMemoria(), { tipo: 'acta' }), 400, 'peticion');
  assert.ok(otro.mensaje.includes('programacion_didactica'), otro.mensaje);
  assert.ok(otro.mensaje.includes('memoria'), otro.mensaje);
  assert.ok(otro.mensaje.includes('pccf'), otro.mensaje);
  assert.ok(otro.mensaje.includes('propuesta_pedagogica'), otro.mensaje);
});

prueba('una programación subida como memoria da 400 con la lista de módulos y no escribe nada', async () => {
  // El error más probable de quien sube el fichero: dejarse el tipo sin cambiar. Importarla sin
  // protestar dejaría una «memoria» con once módulos conciliados, y la memoria de verdad sin subir.
  const { repo, u } = await escenarioLimpio();
  const antes = (await repo.documentos.listar({})).length;

  const cuerpo = await esError(await subir(u.jefa, await docxPd(), { tipo: 'memoria' }), 400, 'peticion');
  assert.equal(cuerpo.instancias.length, 3, 'el error tiene que decir cuáles son los bloques que ha visto');
  assert.ok(cuerpo.instancias.includes(Unidades.tituloDe(PROG, '2026-27')), cuerpo.instancias.join(' · '));
  assert.ok(/no lleva m[óo]dulos/.test(cuerpo.mensaje), cuerpo.mensaje);
  assert.equal((await repo.documentos.listar({})).length, antes, 'un 400 no puede dejar nada escrito');

  // La misma programación, con su tipo, entra.
  const bien = await subir(u.jefa, await docxPd(), { tipo: 'programacion_didactica', ciclo: 'DAW' });
  assert.equal(bien.status, 201);
  assert.equal((await bien.json()).resumen.unidades, 3);
});

prueba('un PCCF o una memoria subidos como programación didáctica dan 400 y no escriben nada', async () => {
  const { repo, u } = await escenarioLimpio();
  const antes = (await repo.documentos.listar({})).length;
  for (const buffer of [await docxPccf(), await docxMemoria()]) {
    const cuerpo = await esError(await subir(u.jefa, buffer, { tipo: 'programacion_didactica', ciclo: 'daw' }), 400, 'peticion');
    assert.ok(/ning[úu]n bloque de m[óo]dulo/.test(cuerpo.mensaje), cuerpo.mensaje);
  }
  assert.equal((await repo.documentos.listar({})).length, antes);
});

prueba('importar: el curso es AAAA-AA con el segundo año el primero más uno, y el ciclo tiene que existir', async () => {
  const { repo, u } = await escenarioLimpio();
  const antes = (await repo.documentos.listar({})).length;
  for (const curso of ['2026-29', '2026-26', '2026-28', '2026/27']) {
    const cuerpo = await esError(await subir(u.jefa, await docxPd(), { tipo: 'programacion_didactica', ciclo: 'daw', curso }), 400, 'peticion');
    assert.ok(cuerpo.mensaje.includes(curso), cuerpo.mensaje);
  }
  assert.equal((await subir(u.jefa, await docxMemoria(), { curso: '2099-00' })).status, 201);
  const cuerpo = await esError(await subir(u.jefa, await docxPd(), { tipo: 'programacion_didactica', ciclo: 'xyz' }), 400, 'peticion');
  assert.ok(/ciclo «xyz» no existe/.test(cuerpo.mensaje), cuerpo.mensaje);
  assert.ok(!/No reconozco/.test(cuerpo.mensaje));
  assert.equal((await repo.documentos.listar({})).length, antes + 1);
});

prueba('la memoria la importa quien importa: no el docente ni la jefatura de estudios', async () => {
  const { u } = await escenarioLimpio();
  const buffer = await docxMemoria();
  await esError(await subir(null, buffer), 401, 'sin_identificar');
  await esError(await subir(u.ana, buffer), 403, 'sin_permiso');
  await esError(await subir(u.estudios, buffer), 403, 'sin_permiso');
  assert.equal((await subir(u.admin, buffer)).status, 201);
});

prueba('la memoria importada pasa el circuito entero y el PDF la sigue', async () => {
  // El criterio de aceptación completo sobre el tipo nuevo: se importa por la ruta, se le cambia el
  // estado por la ruta y el PDF que sale de la ruta lo refleja.
  const { u } = await escenarioLimpio();
  const { documento } = await (await subir(u.jefa, await docxMemoria())).json();
  const id = documento._id;

  const vistas = [];
  vistas.push(conMarcaDeAgua(await definicionDe(u.jefa, id)));
  await paso(u.jefa, id, 'revision');
  vistas.push(conMarcaDeAgua(await definicionDe(u.jefa, id)));
  await paso(u.estudios, id, 'aprobado');
  vistas.push(conMarcaDeAgua(await definicionDe(u.jefa, id)));
  await paso(u.estudios, id, 'borrador');
  vistas.push(conMarcaDeAgua(await definicionDe(u.jefa, id)));

  assert.deepStrictEqual(vistas, [true, true, false, true],
    'la marca de agua tiene que seguir al estado del documento en los dos sentidos');
});

// ================================================================ 6. la propuesta pedagógica de ESO y Bachillerato
//
// El cuarto tipo, y el que cierra el inventario del departamento. Se prueba con un documento
// SINTÉTICO, por lo mismo que la memoria y el PCCF: los cuatro `.docx` reales no se versionan
// (docs/entrada_ej/README.md), así que una prueba que dependiera de ellos no se podría ejecutar en
// una máquina recién clonada. Lo que el sintético reproduce es la forma que se ha medido en los
// reales: un bloque por materia, y dentro ni ponderaciones ni fichas de SA.

prueba('la propuesta pedagógica se importa y sus materias se conocen por el catálogo', async () => {
  const { repo, u } = await escenarioLimpio();
  const res = await subir(u.jefa, await docxPropuesta(), { tipo: 'propuesta_pedagogica', ciclo: 'eso' });
  assert.equal(res.status, 201, `la propuesta tendría que importarse: ${res.status}`);
  const { documento, resumen } = await res.json();

  assert.equal(documento.tipo, 'propuesta_pedagogica');
  assert.equal(documento.estado, 'borrador', 'todo lo que se importa nace en borrador');
  assert.equal(resumen.unidades, 3, 'las tres materias de ESO del documento');
  assert.deepStrictEqual(resumen.forzadas, [], 'las tres están en el catálogo: no hay que forzar ninguna');

  // Y se conocen por su TÍTULO EXACTO del curso, con confianza alta: es lo que se mide sobre los
  // cuatro documentos reales, y lo que hace que el reparto sobreviva al curso siguiente.
  assert.deepStrictEqual(resumen.conciliacion.map((c) => c.unidadId), MATERIAS_ESO);
  for (const c of resumen.conciliacion) {
    assert.equal(c.como, 'titulo_del_curso', `${c.titulo} se ha reconocido por ${c.como}`);
    assert.equal(c.confianza, 'alta');
    assert.equal(c.forzada, false);
  }

  const id = documento._id;

  // El árbol: los apartados comunes y una unidad por materia, en el orden del documento.
  const arbol = Arbol.aplanar((await (await arbolDe(u.jefa, id)).json()).arbol);
  const unidades = arbol.filter((n) => n.tipo === 'unidad');
  assert.deepStrictEqual(unidades.map((n) => n.unidadId), MATERIAS_ESO);
  assert.deepStrictEqual(unidades.map((n) => n.titulo), MATERIAS_ESO.map((m) => Unidades.tituloDe(m, '2026-27')));
  const titulos = arbol.filter((n) => n.tipo === 'apartado').map((n) => n.titulo);
  assert.ok(titulos.includes('Elementos curriculares de la etapa'), titulos.join(' · '));
  assert.ok(titulos.includes('Competencias específicas'), titulos.join(' · '));

  // El PDF, con el nombre que le toca en la portada y con el contenido de las materias dentro.
  const impreso = JSON.stringify(await definicionDe(u.jefa, id));
  assert.ok(impreso.includes('Propuesta pedagógica'), 'la portada no dice que es una propuesta pedagógica');
  assert.ok(impreso.includes('Las situaciones van por competencias específicas, no por RA.'), 'el contenido no llega al PDF');
  assert.equal(conMarcaDeAgua(await definicionDe(u.jefa, id)), true, 'recién importada está en borrador');

  // Y el Word.
  const xml = await wordDe(u.jefa, id);
  assert.ok(xml.includes('Concreción curricular de las materias'), 'el bloque de las materias no llega al Word');
  assert.ok(xml.includes('Las ocho competencias clave con sus descriptores.'), 'el contenido no llega al Word');

  assert.equal((await repo.documentos.obtener(id)).tipo, 'propuesta_pedagogica');
});

prueba('en una propuesta el ciclo es el ÁMBITO —eso o bach— y es ahí donde se buscan las materias', async () => {
  // LA DECISIÓN QUE ESTA PRUEBA FIJA. ESO y Bachillerato no son ciclos formativos, pero `ciclo` no
  // significa «de qué ciclo de FP es»: significa «entre qué unidades del catálogo hay que buscar».
  // `core/conciliar.js` lo usa así desde que existe (filtra por `u.ciclo === ciclo || u.ambito ===
  // ciclo`), así que en una propuesta va el `ambito` de core/unidades.js: `eso` o `bach`. Si alguien
  // decide algún día que ahí va otra cosa, esta prueba se pone roja y tendrá que ser explícito.
  const { u } = await escenarioLimpio();

  // Sin ciclo, 400: la propuesta de ESO y la de Bachillerato son dos documentos del mismo tipo y el
  // Word no dice de qué etapa es ninguno.
  const sinCiclo = await esError(
    await subir(u.jefa, await docxPropuesta(), { tipo: 'propuesta_pedagogica', ciclo: null }), 400, 'peticion');
  assert.ok(sinCiclo.mensaje.includes('ciclo'), sinCiclo.mensaje);

  // Con el ámbito de la etapa equivocada, 400 con la lista: las materias de ESO no se buscan entre
  // las de Bachillerato. Es la prueba de que el ámbito manda de verdad y no es un adorno del
  // formulario.
  const etapaMala = await esError(
    await subir(u.jefa, await docxPropuesta(), { tipo: 'propuesta_pedagogica', ciclo: 'bach' }), 400, 'peticion');
  assert.equal(etapaMala.sinResolver.length, 3, 'ninguna materia de ESO debería encontrarse entre las de Bachillerato');

  // Y da igual cómo se escriba: el ámbito se guarda en minúsculas, como el ciclo de la PD.
  const bien = await subir(u.jefa, await docxPropuesta(), { tipo: 'propuesta_pedagogica', ciclo: 'ESO' });
  assert.equal(bien.status, 201);
  const cuerpoEso = await bien.json();
  assert.equal(cuerpoEso.documento.ciclo, 'eso');

  // La de Bachillerato, con el suyo: las tres materias del catálogo de `bach`.
  const bach = await subir(u.jefa, await docxPropuesta({ materias: MATERIAS_BACH }), { tipo: 'propuesta_pedagogica', ciclo: 'bach' });
  assert.equal(bach.status, 201);
  const cuerpoBach = await bach.json();
  assert.deepStrictEqual(cuerpoBach.resumen.conciliacion.map((c) => c.unidadId), MATERIAS_BACH);
  assert.deepStrictEqual(cuerpoBach.resumen.forzadas, []);

  // Y en la portada el ámbito se escribe como se lee: ESO es una sigla y se queda en mayúsculas,
  // `bach` es una abreviatura y se escribe entero (app/_lib/rutas/comun.js, `NOMBRE_CICLO`). Es la
  // portada de un documento que se imprime, y «BACH» ahí se lee como una errata.
  const portadaBach = JSON.stringify(await definicionDe(u.jefa, cuerpoBach.documento._id));
  assert.ok(portadaBach.includes('Propuesta pedagógica · Bachillerato · 2026-27'),
    'la portada de la propuesta de Bachillerato no la nombra entera');
  const portadaEso = JSON.stringify(await definicionDe(u.jefa, cuerpoEso.documento._id));
  assert.ok(portadaEso.includes('Propuesta pedagógica · ESO · 2026-27'), 'ESO es una sigla y se queda así');
});

prueba('una materia que no está en el catálogo se niega con su nombre, y con forzar entra con el id del título', async () => {
  // La regla es la misma que para un módulo de FP que no se reconoce: 400 con el nombre y el motivo,
  // sin escribir nada, y `forzar` solo si quien sube el fichero lo decide a la vista de la lista.
  //
  // Esta prueba nació usando «Primer curso – PRSI I», que entonces no estaba en el catálogo. Ya
  // está —marcada como histórica, porque se impartía en 2025-26 y hoy no—, así que hace falta una
  // materia que de verdad no exista; si no, la prueba pasaría a comprobar lo contrario de lo que
  // dice su nombre sin que nadie se enterase.
  const { repo, u } = await escenarioLimpio();
  const antes = (await repo.documentos.listar({})).length;

  // Una materia que no está en el catálogo, al lado de dos que sí: el rechazo tiene que señalar solo
  // a esa.
  const datos = datosPropuesta(['bach-inf2', 'bach-prsi2'], '2026-27');
  datos.instancias.unshift({
    titulo: 'Primer curso – Materia que no existe', num: '1', grupo: 'Concreción curricular de las materias', docentes: [],
    valores: {
      'materias/competencias-especificas': { texto: [{ type: 'p', text: 'Competencias específicas de PRSI I.' }] },
      'materias/situaciones-de-aprendizaje': { texto: [{ type: 'p', text: 'Las situaciones van por competencias específicas.' }] },
    },
  });
  const buffer = await exportarDocx({
    plantilla: PLANTILLA_PROPUESTA, datos, titulo: 'Propuesta pedagógica · Bachillerato · 2025-26',
  });

  const cuerpo = await esError(
    await subir(u.jefa, buffer, { tipo: 'propuesta_pedagogica', ciclo: 'bach', curso: '2025-26' }), 400, 'peticion');
  assert.equal(cuerpo.sinResolver.length, 1, 'solo una materia está fuera del catálogo');
  assert.equal(cuerpo.sinResolver[0].titulo, 'Primer curso – Materia que no existe');
  assert.equal((await repo.documentos.listar({})).length, antes, 'un 400 no puede dejar nada escrito');

  // Con `forzar=1` entra, con el id derivado del título, y la respuesta dice CUÁL se ha importado así.
  const forzada = await subir(u.jefa, buffer, { tipo: 'propuesta_pedagogica', ciclo: 'bach', curso: '2025-26', forzar: '1' });
  assert.equal(forzada.status, 201);
  const { resumen } = await forzada.json();
  assert.equal(resumen.unidades, 3);
  assert.deepStrictEqual(resumen.forzadas.map((f) => f.titulo), ['Primer curso – Materia que no existe']);
  assert.deepStrictEqual(resumen.conciliacion.map((c) => c.unidadId), ['primer-curso-materia-que-no-existe', 'bach-inf2', 'bach-prsi2']);
});

prueba('las comprobaciones de RA y de fichas de SA no aplican a una propuesta; la del docente sí', async () => {
  // QUÉ VALIDACIONES NO APLICAN, Y POR QUÉ NO HAY NADA QUE APAGAR. Las situaciones de aprendizaje de
  // ESO y Bachillerato van por COMPETENCIAS ESPECÍFICAS y no por resultados de aprendizaje
  // (docs/mockup-v2/README.md), así que `criterios_de_ra`, `suma_de_ra`, `ra_sin_situacion` y
  // `sa_sin_evaluacion` no tienen de qué hablar. Y no hace falta desactivarlas por tipo: las cuatro
  // se disparan solas cuando encuentran el campo del que viven, y en los cuatro documentos reales
  // ese campo no existe (ni un `ponderacion_ra_ce`, ni un `ficha_situacion_aprendizaje`, ni un
  // `auto.tabla_ra_ce`: solo `texto_largo` y tablas). Lo que SÍ aplica es `sin_docente`: una materia
  // sin profesorado es el mismo problema que un módulo sin profesorado, y se arregla igual.
  const { repo, u } = await escenarioLimpio();
  const { documento } = await (await subir(u.jefa, await docxPropuesta(), { tipo: 'propuesta_pedagogica', ciclo: 'eso' })).json();
  const id = documento._id;

  const panel = await validacionesDe(u.estudios, id);
  const reglas = [...new Set(panel.grupos.flatMap((g) => g.avisos).map((a) => a.regla))];
  assert.deepStrictEqual(reglas, ['sin_docente'],
    `la única comprobación que aplica a una propuesta es la del docente: ${reglas.join(' · ')}`);
  assert.equal(panel.total, 3, 'una por materia, y ninguna de RA');
  assert.deepStrictEqual(panel.cuenta, { error: 3, aviso: 0, info: 0 });
  assert.equal(panel.impresos, 0, 'la cajita roja del PDF solo imprime las normativas, y aquí no hay ninguna');
  assert.equal(panel.delOtroConvenio, 0, 'sin ponderaciones no hay convenio que decidir');
  assert.equal(panel.grupos.length, 4, 'el grupo de los apartados comunes y uno por materia');
  assert.equal(panel.puedeAprobarse, false, 'tres materias sin profesorado impiden aprobar');

  // Repartidas las tres materias, el panel se queda vacío —no «aprobado a la fuerza»: vacío porque no
  // hay nada más que comprobar— y la puerta de aprobación deja pasar.
  for (const materia of MATERIAS_ESO) await repo.unidades.actualizar(id, materia, { docentes: [u.ana._id] });
  const repartida = await validacionesDe(u.estudios, id);
  assert.equal(repartida.total, 0, `una propuesta repartida no debería tener ningún aviso: ${JSON.stringify(repartida.cuenta)}`);
  assert.equal(repartida.puedeAprobarse, true);

  // Y el criterio de aceptación del E7, sobre el tipo nuevo: aprobar le quita la marca de agua.
  await paso(u.jefa, id, 'revision');
  assert.equal((await paso(u.estudios, id, 'aprobado')).marcaDeAgua, false);
  assert.equal(conMarcaDeAgua(await definicionDe(u.jefa, id)), false);
});

prueba('una propuesta subida como memoria o como PCCF se sigue rechazando por sus bloques de materia', async () => {
  // LA REGLA QUE NO SE TOCA. El tipo nuevo amplía la lista de los que SÍ llevan unidades
  // (`CON_UNIDADES`: la PD por módulo y la propuesta por materia), y no la desarma: la memoria y el
  // PCCF siguen sin llevarlas, y un bloque repetido en uno de ellos sigue dando 400 sin escribir
  // nada. Es el error más probable de quien sube el fichero: dejarse el tipo sin cambiar.
  const { repo, u } = await escenarioLimpio();
  const antes = (await repo.documentos.listar({})).length;
  const buffer = await docxPropuesta();

  for (const tipo of ['memoria', 'pccf']) {
    const cuerpo = await esError(await subir(u.jefa, buffer, { tipo, ciclo: 'eso' }), 400, 'peticion');
    assert.equal(cuerpo.instancias.length, 3, 'el error tiene que decir cuáles son los bloques que ha visto');
    assert.ok(cuerpo.instancias.includes(Unidades.tituloDe('eso-trds', '2026-27')), cuerpo.instancias.join(' · '));
    assert.ok(/no lleva m[óo]dulos/.test(cuerpo.mensaje), cuerpo.mensaje);
  }
  assert.equal((await repo.documentos.listar({})).length, antes, 'un 400 no puede dejar nada escrito');

  // Y el tipo nuevo sale en la lista de los que sí se admiten cuando se manda uno que no existe.
  const otro = await esError(await subir(u.jefa, buffer, { tipo: 'propuesta' }), 400, 'peticion');
  assert.ok(otro.mensaje.includes('propuesta_pedagogica'), otro.mensaje);
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
    : `\n${total} pruebas de los estados del documento correctas`);
  process.exit(fallos ? 1 : 0);
}

ejecutar();
