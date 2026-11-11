// Las rutas de lectura y de exportación de la API, llamadas directamente.
//
//   node test/api.js
//
// Sin levantar Next, sin red y sin base de datos. Eso es posible porque la lógica de cada ruta vive
// en un módulo CommonJS de app/_lib/rutas/ y el fichero de app/api/ es un envoltorio de tres líneas
// (docs/api.md, primera regla de forma): aquí se le pasa un `Request` normal y los parámetros de la
// ruta ya resueltos, que es exactamente lo que le pasa Next.
//
// EL CRITERIO DE ACEPTACIÓN DEL E1 ES LA ÚLTIMA PRUEBA DE ESTE FICHERO
//
//   «El PDF exportado desde la base de datos es idéntico al que genera hoy el importador sobre el
//    mismo Word.»
//
// Se comprueba comparando la definición de pdfmake que produce la ruta con la que produce el motor
// sobre el `{ plantilla, datos }` de partida. La idea —y el `comparable()` que normaliza las
// funciones a su código fuente— sale de test/ida-y-vuelta.js, que explica por qué no se pueden
// comparar los bytes ni pasar por JSON.
//
// LA TRAMPA DEL ALMACÉN COMPARTIDO
//
// app/_lib/repositorio.js guarda la instancia en `globalThis` para que Next no abra una conexión
// nueva por recarga en caliente. Eso significa que todas las pruebas de este fichero comparten el
// mismo almacén. Se siembra UNA vez, antes de ejecutar nada, y ninguna prueba escribe: todas las de
// este evolutivo son de lectura. Cada una pide lo que necesita por su identificador, así que el
// orden no las afecta. Cuando el E3 traiga el PATCH, lo que escriba tendrá que sembrar su propio
// documento.
//
// Y la instancia se mete a mano en `globalThis` antes de pedir nada: si no, un MONGODB_URI en el
// entorno haría que estas pruebas hablaran con una base de datos de verdad.

'use strict';

const assert = require('assert/strict');
const { randomUUID } = require('node:crypto');

const { crearRepositorio } = require('../repositorio');
const memoria = require('../repositorio/memoria');

// ---------------------------------------------------------------- el repositorio de las pruebas
// Antes de cargar nada de app/, porque todo lo de ahí acaba pidiendo esta instancia.
const CLAVE_GLOBAL = '__pccf_repositorio__';
const repo = crearRepositorio({ adaptador: memoria.crear() });
repo.enMemoria = true;
globalThis[CLAVE_GLOBAL] = repo;

const C = require('../core/permisos');
const { COOKIE_SESION, abrirSesion } = require('../app/_lib/sesion');
const Arbol = require('../core/arbol');
const { aFilas } = require('../core/documento');
const { buildDocDefinition } = require('../motor/render-generico');
const { exportarDocx } = require('../motor/exportar-docx');

const Personas = require('../app/_lib/rutas/personas');
const Documentos = require('../app/_lib/rutas/documentos');
const Documento = require('../app/_lib/rutas/documento');
const RutaArbol = require('../app/_lib/rutas/arbol');
const Apartado = require('../app/_lib/rutas/apartado');
const Pdf = require('../app/_lib/rutas/pdf');
const Docx = require('../app/_lib/rutas/docx');

// ---------------------------------------------------------------- el arnés
// Las pruebas son asíncronas pero se ejecutan en serie, así que el orden de los `ok` es el del
// fichero y el primer FALLO que se lee es el más cercano a la causa. Es el estilo del repositorio:
// `prueba(nombre, fn)` con assert, sin frameworks.
let fallos = 0;
const pendientes = [];
const prueba = (nombre, fn) => pendientes.push({ nombre, fn });
const nota = (texto) => console.log(`     ${texto}`);

// ---------------------------------------------------------------- ayudas

// Una petición como la que recibe la ruta dentro de Next.
//
// Desde el E2 la persona NO viaja en una cookie con su id dentro —eso era el provisional del E1, y
// cualquiera podía escribirla— sino en la cookie de sesión, que lleva un testigo aleatorio del que
// solo se guarda el hash (app/_lib/sesion.js). La siembra abre una sesión por persona y guarda su
// testigo en `S.testigos`, así que aquí se traduce la persona a su testigo. Sin persona, no se manda
// cookie. Una cadena se manda tal cual, para probar una cookie con basura dentro.
const cookieDe = (persona) => {
  if (!persona) return null;
  const testigo = typeof persona === 'string' ? persona : S.testigos[persona._id];
  return testigo ? `${COOKIE_SESION}=${encodeURIComponent(testigo)}` : null;
};
const pet = (camino, persona) => {
  const cookie = cookieDe(persona);
  return new Request(`http://pruebas.local${camino}`, { headers: cookie ? { cookie } : {} });
};

// La misma normalización de test/ida-y-vuelta.js: `buildDocDefinition` devuelve `header` y `footer`
// como cierres nuevos en cada llamada, y `deepStrictEqual` compara funciones por referencia. Se
// sustituyen por su código fuente, que sí se puede comparar. Se reconstruyen objetos y arrays en
// lugar de pasar por JSON para no perder las claves cuyo valor es `undefined` (`colSpan`, `rowSpan`,
// `pageBreak`, `watermark`), que son justo el tipo de diferencia que esto busca.
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

// Comprueba que una respuesta es el error que dice docs/api.md: el estado y el código, y que lleva
// un mensaje en castellano para leer.
async function esError(respuesta, estado, codigo) {
  assert.equal(respuesta.status, estado, `se esperaba un ${estado} y ha sido un ${respuesta.status}`);
  const cuerpo = await respuesta.json();
  assert.equal(cuerpo.error, codigo);
  assert.equal(typeof cuerpo.mensaje, 'string');
  assert.ok(cuerpo.mensaje.length > 0, 'el error no lleva mensaje');
  return cuerpo;
}

// ================================================================ documento sintético
// Un documento pequeño pero con las formas que importan: secciones anidadas, una que solo agrupa,
// una que está en la plantilla y no se ha escrito nunca, un bloque de instancias con tres módulos
// —dos con el mismo título—, un repetidor, textos compartidos y ponderaciones que no cuadran.
//
// Se monta aquí y no se importa de otra prueba para que esta se lea sola: cuando falle, lo que haya
// que mirar está en este fichero. Y no depende de out/ejemplo/, que queda fuera de git.

const c = (text, opts) => Object.assign({ text, colspan: 1, rowspan: 1, bold: false }, opts);
const campoTexto = { id: 'texto', tipo: 'texto_largo', etiqueta: 'Texto' };

const TABLA_NORMATIVA = [
  [c('Ámbito', { bold: true, rowspan: 2 }), c('Norma', { bold: true, colspan: 2 })],
  [c('Estatal', { bold: true }), c('Autonómica', { bold: true })],
  [c('Ordenación'), c('RD 1147/2011'), c('Decreto 150/2024')],
];

const RA_CE = { ra: [
  { num: 1, texto: 'Reconoce las características de los lenguajes de marcas.', ce: [
    { letra: 'a', texto: 'Se han identificado las etiquetas.' },
    { letra: 'b', texto: 'Se ha reconocido la jerarquía del documento.' },
  ] },
  { num: 2, texto: 'Valida documentos contra un esquema.', ce: [
    { letra: 'a', texto: 'Se ha validado con un esquema.' },
  ] },
] };

const PONDERACIONES_OK = [
  { ra: 1, texto: 'Reconoce las características de los lenguajes de marcas.', ponderacion: 40, ce: [
    { letra: 'a', texto: 'Se han identificado las etiquetas.', ponderacion: 25, fundamental: true },
    { letra: 'b', texto: 'Se ha reconocido la jerarquía.', ponderacion: 15, fundamental: false },
  ] },
  { ra: 2, texto: 'Valida documentos contra un esquema.', ponderacion: 60, ce: [
    { letra: 'a', texto: 'Se ha validado con un esquema.', ponderacion: 60, fundamental: false },
  ] },
];

// No cuadran a propósito: así un módulo lleva la cajita roja de «Comprobaciones automáticas» y los
// otros no, que es la parte de la definición que depende de `ctx.avisos` y que se podría perder sin
// que nada más cambiase.
const PONDERACIONES_MAL = [
  { ra: 1, texto: 'Reconoce las características de los lenguajes de marcas.', ponderacion: 40, ce: [
    { letra: 'a', texto: 'Se han identificado las etiquetas.', ponderacion: 30, fundamental: false },
  ] },
  { ra: 2, texto: 'Valida documentos contra un esquema.', ponderacion: 50, ce: [
    { letra: 'a', texto: 'Se ha validado con un esquema.', ponderacion: 50, fundamental: true },
  ] },
];

const PLANTILLA = {
  tipo: 'programacion_didactica',
  origen: 'PD_DAW_sintetica.docx',
  version: null,
  generada: '2026-01-01T00:00:00.000Z',
  secciones: [
    { id: 'introduccion', titulo: 'Introducción', nivel: 1, edita: 'jefe_departamento', presencia: 1,
      campos: [campoTexto], hijos: [
        { id: 'introduccion/marco-legal', titulo: 'Marco legal', nivel: 2, presencia: 1,
          campos: [campoTexto, { id: 'tabla_normativa', tipo: 'tabla', etiqueta: 'Normativa aplicable' }], hijos: [
            { id: 'introduccion/marco-legal/el-centro', titulo: 'El centro', nivel: 3, presencia: 1,
              campos: [campoTexto, { id: 'datos_centro', tipo: 'tabla_clave_valor', etiqueta: 'Datos del centro' }], hijos: [] },
          ] },
      ] },
    { id: 'atencion-a-la-diversidad', titulo: 'Atención a la diversidad', nivel: 1,
      edita: 'jefe_departamento', presencia: 1, campos: [campoTexto], hijos: [] },
    // Una sección sin campos propios: en el árbol solo agrupa, y su hija nunca se ha escrito.
    { id: 'anexos', titulo: 'Anexos', nivel: 1, edita: 'jefe_departamento', presencia: 1,
      campos: [], hijos: [
        { id: 'anexos/actas', titulo: 'Actas del departamento', nivel: 2, presencia: 1,
          campos: [campoTexto], hijos: [] },
      ] },
    { id: 'modulos', titulo: 'Módulos', nivel: 1, instancias: true, etiqueta_instancia: 'módulo',
      grupos: ['Módulos del primer curso', 'Módulos del segundo curso'], edita: 'docentes_del_modulo',
      presencia: 3, campos: [], hijos: [
        { id: 'modulos/identificacion', titulo: 'Identificación del módulo', nivel: 3,
          campos: [{ id: 'ficha_modulo', tipo: 'auto.ficha_modulo', etiqueta: 'Identificación' }], hijos: [] },
        { id: 'modulos/resultados-de-aprendizaje', titulo: 'Resultados de aprendizaje y criterios', nivel: 3,
          campos: [{ id: 'ra_ce', tipo: 'auto.tabla_ra_ce', etiqueta: 'RA y CE' }], hijos: [] },
        { id: 'modulos/metodologia', titulo: 'Metodología', nivel: 3, campos: [campoTexto], hijos: [] },
        { id: 'modulos/situaciones-de-aprendizaje', titulo: 'Situaciones de aprendizaje', nivel: 3,
          campos: [], hijos: [
            { id: 'modulos/situaciones-de-aprendizaje/situacion', titulo: 'Situación de aprendizaje',
              nivel: 4, repetidor: true, campos: [
                { id: 'titulo', tipo: 'texto', etiqueta: 'Título' },
                campoTexto,
              ], hijos: [] },
          ] },
        { id: 'modulos/ponderaciones', titulo: 'Ponderaciones', nivel: 3,
          campos: [{ id: 'ponderaciones', tipo: 'ponderacion_ra_ce', etiqueta: 'Ponderaciones', multiple: true }], hijos: [] },
      ] },
  ],
};

// Cada módulo lleva algo distinto para que un cruce de valores entre dos módulos —el fallo que haría
// el reparto por unidadId, y más con dos módulos del mismo título— se vea en la comparación.
const valoresDelModulo = (marca, { ponderaciones, compartido }) => ({
  'modulos/identificacion': { ficha_modulo: { pares: [
    { etiqueta: 'Módulo profesional', valor: marca },
    { etiqueta: 'Horas totales', valor: '160' },
  ] } },
  'modulos/resultados-de-aprendizaje': { ra_ce: RA_CE },
  'modulos/metodologia': { texto: [
    { type: 'p', text: `Metodología de ${marca}, con trabajo por proyectos.` },
    { ref: compartido },
  ] },
  'modulos/situaciones-de-aprendizaje/situacion': { items: [
    { titulo: `Primera SA de ${marca}`, texto: [{ type: 'p', text: 'Prueba inicial y proyecto guiado.' }] },
  ] },
  'modulos/ponderaciones': { ponderaciones },
});

// `docentes` y `asignaciones` llevan ids de usuario, y el repositorio los genera él: los datos se
// montan cuando ya se sabe quién es quién.
const datosDe = (u) => ({
  departamento: 'informatica',
  documento: {
    introduccion: { texto: [
      { type: 'p', text: 'Esta programación la escribe el departamento de Informática.' },
      { type: 'list', items: [
        { text: 'Primer nivel', level: 0 },
        { text: 'Segundo nivel', level: 1 },
      ] },
      { ref: 'c001' },
    ] },
    'introduccion/marco-legal': {
      texto: [{ type: 'p', text: 'La normativa de referencia es la siguiente.' }],
      tabla_normativa: { filas: TABLA_NORMATIVA },
    },
    'introduccion/marco-legal/el-centro': {
      texto: [{ type: 'p', text: 'El IES Hermanos Amorós es un centro de Villena.' }],
      datos_centro: { pares: [
        { etiqueta: 'Localidad', valor: 'Villena' },
        { etiqueta: 'Código de centro', valor: '03012345' },
      ] },
    },
    'atencion-a-la-diversidad': { texto: [{ ref: 'c002' }] },
    // 'anexos/actas' no está: es una sección de la plantilla que nadie ha escrito todavía.
  },
  // El orden de este array es el del documento y el del tomo del PDF. No es el alfabético —«Bases de
  // datos» iría primero— justo para que una reordenación se note.
  instancias: [
    { titulo: 'Proyecto intermodular', num: '4.1', grupo: 'Módulos del primer curso', docentes: [u.ana._id],
      valores: valoresDelModulo('Proyecto intermodular de primero', { ponderaciones: PONDERACIONES_OK, compartido: 'c001' }) },
    { titulo: 'Bases de datos', num: null, grupo: 'Módulos del primer curso', docentes: [],
      valores: valoresDelModulo('Bases de datos', { ponderaciones: PONDERACIONES_MAL, compartido: 'c001' }) },
    // Mismo título que el primero: pasa de verdad («Proyecto intermodular», «Formación en empresa»
    // aparecen en los dos cursos del ciclo). Es la razón por la que las exportaciones seleccionan la
    // unidad por su posición y no por su título.
    { titulo: 'Proyecto intermodular', num: '4.3', grupo: 'Módulos del segundo curso', docentes: [],
      valores: valoresDelModulo('Proyecto intermodular de segundo', { ponderaciones: PONDERACIONES_OK, compartido: 'c002' }) },
  ],
  asignaciones: { introduccion: [u.ana._id] },
  compartidos: {
    c001: {
      bloque: { type: 'p', text: 'Las faltas de asistencia se justifican en los tres días siguientes a la reincorporación.' },
      seccion: 'introduccion', comun: true, responsable: 'jefe_departamento', modo: 'sugerido', version: 1,
    },
    c002: {
      bloque: { type: 'list', items: [
        { text: 'Adaptaciones de acceso al currículo.', level: 0 },
        { text: 'Medidas de nivel III.', level: 1 },
      ] },
      seccion: 'atencion-a-la-diversidad', comun: true, responsable: 'jefe_departamento', modo: 'obligatorio', version: 3,
    },
  },
});

// Un documento mínimo de otro departamento, para las pruebas de «no lo ve».
const PLANTILLA_OTRA = {
  tipo: 'programacion_didactica', origen: 'PD_matematicas.docx', version: null,
  generada: '2026-01-01T00:00:00.000Z',
  secciones: [{ id: 'introduccion', titulo: 'Introducción', nivel: 1, edita: 'jefe_departamento',
    presencia: 1, campos: [campoTexto], hijos: [] }],
};
const DATOS_OTROS = {
  departamento: 'matematicas',
  documento: { introduccion: { texto: [{ type: 'p', text: 'Programación del departamento de Matemáticas.' }] } },
  instancias: [], asignaciones: {}, compartidos: {},
};

const OPCIONES = { curso: '2026-27', ciclo: 'daw', departamento: 'informatica', origenApartados: 'nuevo' };
const TITULO_TOMO = 'Programación didáctica · DAW · 2026-27';
const SUBTITULO = 'IES Hermanos Amorós';

// Lo que deja la siembra. Las pruebas lo leen de aquí porque se ejecutan después.
const S = {};

async function guardar(filas) {
  const doc = await repo.documentos.crear(filas.documento);
  if (filas.unidades.length) await repo.unidades.crearMuchos(doc._id, filas.unidades);
  if (filas.apartados.length) await repo.apartados.crearMuchos(doc._id, filas.apartados);
  if (filas.compartidos.length) await repo.compartidos.crearMuchos(doc._id, filas.compartidos);
  return doc;
}

async function sembrar() {
  const persona = (nombre, email, rol, departamento) => repo.usuarios.crear({ nombre, email, rol, departamento });

  S.u = {
    ana: await persona('Ana Server', 'ana@example.org', 'docente', 'informatica'),
    luis: await persona('Luis Pinto', 'luis@example.org', 'docente', 'informatica'),
    marta: await persona('Marta Jefa', 'marta@example.org', 'jefe_departamento', 'informatica'),
    jefa: await persona('Elena Estudios', 'elena@example.org', 'jefe_estudios', 'direccion'),
    pepe: await persona('Pepe Mates', 'pepe@example.org', 'docente', 'matematicas'),
    root: await persona('Soporte', 'soporte@example.org', 'admin', 'direccion'),
  };

  // Una sesión abierta por persona, que es lo que tendría cada una tras canjear su enlace de acceso.
  // El testigo solo existe aquí: lo que queda guardado es su hash.
  S.testigos = {};
  for (const p of Object.values(S.u)) {
    S.testigos[p._id] = (await abrirSesion(repo, p._id)).testigo;
  }

  S.DATOS = datosDe(S.u);
  S.ENTRADA = { plantilla: PLANTILLA, datos: S.DATOS };
  S.doc = await guardar(aFilas(S.ENTRADA, OPCIONES));

  S.otro = await guardar(aFilas({ plantilla: PLANTILLA_OTRA, datos: DATOS_OTROS },
    { curso: '2026-27', departamento: 'matematicas' }));
}

// La definición que produce el motor sobre el documento de partida: el otro lado del criterio de
// aceptación del E1.
const delMotor = (extra = {}) => buildDocDefinition({
  plantilla: PLANTILLA,
  datos: S.DATOS,
  instancias: 'todas',
  titulo: TITULO_TOMO,
  subtitulo: SUBTITULO,
  estado: 'borrador',
  ...extra,
});

// Atajos para pedir cada ruta.
const arbolDe = (persona, id) => RutaArbol.GET(pet(`/api/documentos/${id}/arbol`, persona), { id });
const apartadoDe = (persona, id, consulta) => Apartado.GET(pet(`/api/documentos/${id}/apartado?${consulta}`, persona), { id });

// Todas las rutas que cuelgan de un documento, para las pruebas que se hacen igual en todas.
const RUTAS_DEL_DOCUMENTO = [
  { nombre: 'documento', pedir: (persona, id) => Documento.GET(pet(`/api/documentos/${id}`, persona), { id }) },
  { nombre: 'arbol', pedir: arbolDe },
  { nombre: 'apartado', pedir: (persona, id) => apartadoDe(persona, id, 'seccion=introduccion') },
  { nombre: 'pdf', pedir: (persona, id) => Pdf.GET(pet(`/api/documentos/${id}/pdf`, persona), { id }) },
  { nombre: 'docx', pedir: (persona, id) => Docx.GET(pet(`/api/documentos/${id}/docx`, persona), { id }) },
];

// ================================================================ pruebas

// ---------------------------------------------------------------- GET /api/personas

// En el E1 esta ruta era el desplegable con el que se elegía quién eras, y la única excepción al
// 401. Con el E2 hay sesión de verdad y la excepción desaparece: ahora es el censo del
// departamento, exige sesión como todas, y quien no gestiona personas no recibe el correo de nadie.
// Lo que prueba este fichero es que sigue sirviendo para lo que la usan las vistas; el resto de su
// comportamiento lo prueba test/sesiones.js.

prueba('GET /api/personas exige sesión y devuelve el censo de quien pregunta', async () => {
  await esError(await Personas.GET(pet('/api/personas')), 401, 'sin_identificar');

  // La jefatura de estudios ve el centro entero, igual que con los documentos.
  const res = await Personas.GET(pet('/api/personas', S.u.jefa));
  assert.equal(res.status, 200);
  const { personas } = await res.json();

  assert.equal(personas.length, 6);
  // Por nombre, que es lo que se pinta.
  assert.deepStrictEqual(personas.map((p) => p.nombre), [
    'Ana Server', 'Elena Estudios', 'Luis Pinto', 'Marta Jefa', 'Pepe Mates', 'Soporte',
  ]);

  // Un docente ve solo su departamento y sin el correo de nadie: no le hace falta.
  const deAna = await (await Personas.GET(pet('/api/personas', S.u.ana))).json();
  assert.deepStrictEqual(deAna.personas.map((p) => p.nombre), ['Ana Server', 'Luis Pinto', 'Marta Jefa']);
  assert.deepStrictEqual(Object.keys(deAna.personas[0]).sort(), ['_id', 'activo', 'departamento', 'nombre', 'rol']);
  assert.equal(deAna.puedeGestionar, false);
});

// ---------------------------------------------------------------- GET /api/documentos

prueba('GET /api/documentos sin cookie de sesión es 401', async () => {
  await esError(await Documentos.GET(pet('/api/documentos')), 401, 'sin_identificar');
});

prueba('GET /api/documentos con una cookie que no es de nadie es 401, no un 500', async () => {
  // La cookie es texto que manda el cliente: con basura dentro no hay sesión que buscar y el
  // repositorio lanza al validar. Tiene que acabar en «no te conozco» y no en un error del servidor.
  await esError(await Documentos.GET(pet('/api/documentos', 'no-soy-un-testigo')), 401, 'sin_identificar');
  // Y la cookie `persona` del E1, que llevaba dentro el id de quien quisieras ser, ya no identifica
  // a nadie: lo prueba a fondo test/sesiones.js.
  const vieja = new Request('http://pruebas.local/api/documentos', {
    headers: { cookie: `persona=${encodeURIComponent(S.u.marta._id)}` },
  });
  await esError(await Documentos.GET(vieja), 401, 'sin_identificar');
});

prueba('GET /api/documentos solo trae el departamento de quien pregunta, y nunca la plantilla', async () => {
  const res = await Documentos.GET(pet('/api/documentos', S.u.ana));
  assert.equal(res.status, 200);
  const { documentos } = await res.json();

  const ids = documentos.map((d) => d._id);
  assert.ok(ids.includes(S.doc._id), 'Ana no ve el documento de su departamento');
  assert.ok(!ids.includes(S.otro._id), 'Ana ve un documento de otro departamento');
  for (const d of documentos) {
    assert.ok(!('plantilla' in d), 'la lista de documentos lleva la plantilla dentro');
    assert.equal(d.departamento, 'informatica');
  }
  const mio = documentos.find((d) => d._id === S.doc._id);
  assert.equal(mio.tipo, 'programacion_didactica');
  assert.equal(mio.curso, '2026-27');
  assert.equal(mio.ciclo, 'daw');
  assert.equal(mio.estado, 'borrador');
  assert.equal(mio.plantillaVersion, 1);
});

prueba('GET /api/documentos: pedir el departamento de otro devuelve una lista vacía', async () => {
  const res = await Documentos.GET(pet('/api/documentos?departamento=matematicas', S.u.ana));
  const { documentos } = await res.json();
  assert.deepStrictEqual(documentos, []);
});

prueba('GET /api/documentos: la jefatura de estudios ve todos los departamentos', async () => {
  const { documentos } = await (await Documentos.GET(pet('/api/documentos', S.u.jefa))).json();
  const ids = documentos.map((d) => d._id);
  assert.ok(ids.includes(S.doc._id) && ids.includes(S.otro._id), 'la jefatura de estudios no lo ve todo');
});

prueba('GET /api/documentos filtra por curso y por estado', async () => {
  const conCurso = await (await Documentos.GET(pet('/api/documentos?curso=2026-27', S.u.marta))).json();
  assert.ok(conCurso.documentos.some((d) => d._id === S.doc._id));
  const otroCurso = await (await Documentos.GET(pet('/api/documentos?curso=1999-00', S.u.marta))).json();
  assert.deepStrictEqual(otroCurso.documentos, []);
  const aprobados = await (await Documentos.GET(pet('/api/documentos?estado=aprobado', S.u.marta))).json();
  assert.deepStrictEqual(aprobados.documentos, []);
});

// ---------------------------------------------------------------- GET /api/documentos/[id]

prueba('GET /api/documentos/[id] devuelve el documento sin plantilla', async () => {
  const res = await Documento.GET(pet(`/api/documentos/${S.doc._id}`, S.u.ana), { id: S.doc._id });
  assert.equal(res.status, 200);
  const { documento } = await res.json();
  assert.equal(documento._id, S.doc._id);
  assert.ok(!('plantilla' in documento), 'el documento sale con la plantilla dentro');
  assert.equal(documento.origen, 'PD_DAW_sintetica.docx');
  assert.deepStrictEqual(documento.asignaciones, { introduccion: [S.u.ana._id] });
});

prueba('un id que no existe es 404 en todas las rutas del documento', async () => {
  const fantasma = randomUUID();
  for (const ruta of RUTAS_DEL_DOCUMENTO) {
    await esError(await ruta.pedir(S.u.marta, fantasma), 404, 'no_encontrado');
  }
  // Y un id que no es ni un id: tiene que ser 404 y no un 500 del repositorio al validarlo.
  for (const ruta of RUTAS_DEL_DOCUMENTO) {
    await esError(await ruta.pedir(S.u.marta, 'esto-no-es-un-id'), 404, 'no_encontrado');
  }
});

prueba('sin cookie de sesión todas las rutas del documento son 401', async () => {
  for (const ruta of RUTAS_DEL_DOCUMENTO) {
    await esError(await ruta.pedir(null, S.doc._id), 401, 'sin_identificar');
  }
});

prueba('un docente de otro departamento recibe 404 en todas las rutas del documento', async () => {
  // Se elige 404 y no 403 a propósito, y se es consistente: un 403 confirmaría que el documento
  // existe, y «no lo ve» es literalmente lo que dice la regla. Ver el comentario de
  // `abrirDocumento` en app/_lib/rutas/comun.js.
  for (const ruta of RUTAS_DEL_DOCUMENTO) {
    await esError(await ruta.pedir(S.u.pepe, S.doc._id), 404, 'no_encontrado');
  }
});

// ---------------------------------------------------------------- GET .../arbol

prueba('GET .../arbol monta el árbol de la plantilla con su numeración y su estado', async () => {
  const res = await arbolDe(S.u.marta, S.doc._id);
  assert.equal(res.status, 200);
  const { documentoId, arbol, resumen } = await res.json();

  assert.equal(documentoId, S.doc._id);
  assert.equal(arbol.tipo, 'raiz');
  assert.equal(arbol.clave, S.doc._id);
  assert.deepStrictEqual(arbol.hijos.map((n) => n.seccion),
    ['introduccion', 'atencion-a-la-diversidad', 'anexos', 'modulos']);
  // La numeración es la del PDF: por posición, igual que motor/render-generico.js.
  assert.deepStrictEqual(arbol.hijos.map((n) => n.num), ['1', '2', '3', '4']);

  const introduccion = arbol.hijos[0];
  assert.equal(introduccion.titulo, 'Introducción');
  assert.equal(introduccion.contenido, true);
  assert.equal(introduccion.relleno, true);
  assert.equal(introduccion.edita, 'jefe_departamento');
  assert.equal(introduccion.unidadId, null);
  assert.equal(introduccion.clave, 'introduccion');
  assert.deepStrictEqual(introduccion.hijos[0].hijos[0].num, '1.1.1');
  assert.equal(introduccion.hijos[0].hijos[0].seccion, 'introduccion/marco-legal/el-centro');

  // Una sección sin campos propios solo agrupa: no se edita y no tiene estado de relleno.
  const anexos = arbol.hijos[2];
  assert.equal(anexos.contenido, false);
  assert.equal(anexos.relleno, null);
  assert.equal(anexos.puedeEditar, false, 'un nodo que solo agrupa no se edita, se resume');
  // Y su hija está en la plantilla pero nadie la ha escrito: existe en el árbol y sale vacía.
  assert.equal(anexos.hijos[0].contenido, true);
  assert.equal(anexos.hijos[0].relleno, false);

  const modulos = arbol.hijos[3];
  assert.equal(modulos.tipo, 'bloque');
  assert.equal(modulos.contenido, false);
  assert.equal(modulos.etiqueta, 'módulo');

  const unidad = modulos.hijos[0];
  assert.equal(unidad.tipo, 'unidad');
  assert.equal(unidad.contenido, false, 'la unidad es una carpeta: lo que se escribe está dentro');
  assert.equal(unidad.num, '4.1');
  assert.equal(unidad.grupo, 'Módulos del primer curso');
  assert.equal(unidad.clave, 'proyecto-intermodular::modulos');
  assert.deepStrictEqual(unidad.hijos.map((n) => n.num), ['4.1.1', '4.1.2', '4.1.3', '4.1.4', '4.1.5']);
  assert.equal(unidad.hijos[2].seccion, 'modulos/metodologia');
  assert.equal(unidad.hijos[2].unidadId, 'proyecto-intermodular');
  assert.equal(unidad.hijos[2].clave, 'proyecto-intermodular::modulos/metodologia');
  assert.equal(unidad.hijos[2].edita, 'docentes_del_modulo', 'el `edita` se hereda del bloque de módulos');

  // El repetidor de las situaciones de aprendizaje: tiene contenido propio y no lleva número,
  // porque el PDF tampoco lo numera (pinta «Situación de aprendizaje 1: …» por ítem).
  const repetidor = unidad.hijos[3].hijos[0];
  assert.equal(repetidor.repetidor, true);
  assert.equal(repetidor.contenido, true);
  assert.equal(repetidor.num, null);

  assert.deepStrictEqual(resumen, {
    // 3 de «Introducción» + 1 + 2 de «Anexos» + el bloque de módulos + 7 por módulo (la unidad y
    // sus seis apartados, contando el repetidor), sin la raíz.
    nodos: 3 + 1 + 2 + 1 + 3 * 7,
    unidades: 3,
    // Con campos propios: 4 comunes + 'anexos/actas' + 5 por módulo ('Situaciones de aprendizaje'
    // solo agrupa; el repetidor de dentro sí tiene campos).
    apartados: 5 + 3 * 5,
    rellenos: 4 + 3 * 5,
    vacios: 1, // 'anexos/actas', que está en la plantilla y nadie ha escrito
  });
  nota(`${resumen.nodos} nodos · ${resumen.apartados} apartados · ${resumen.vacios} vacío(s)`);
});

prueba('GET .../arbol trae las unidades en el orden del documento, no en el alfabético', async () => {
  const { arbol } = await (await arbolDe(S.u.marta, S.doc._id)).json();
  const modulos = arbol.hijos.find((n) => n.tipo === 'bloque');

  assert.deepStrictEqual(modulos.hijos.map((n) => n.titulo), S.DATOS.instancias.map((i) => i.titulo));
  assert.deepStrictEqual(modulos.hijos.map((n) => n.unidadId),
    ['proyecto-intermodular', 'bases-de-datos', 'proyecto-intermodular-2']);
  // Si se ordenara por título, «Bases de datos» iría primero: es el orden del tomo del PDF, y un
  // tomo con los módulos desordenados es un fallo que no salta a la vista.
  const listado = await repo.unidades.listar(S.doc._id);
  assert.deepStrictEqual(modulos.hijos.map((n) => n.unidadId), listado.map((u) => u.unidadId));
});

prueba('GET .../arbol no lleva el contenido dentro', async () => {
  const res = await arbolDe(S.u.marta, S.doc._id);
  const cuerpo = await res.text();

  // Ni los valores de los apartados ni los textos compartidos: el árbol de una PD son 250 apartados
  // y mandarlos con su contenido sería descargar el documento entero al abrir la barra lateral.
  // Trozos que solo están en los `valores` de algún apartado, nunca en la plantilla: si alguno
  // aparece, el contenido se ha colado en el árbol. («ponderacion» no vale: es un id de sección.)
  for (const trozo of ['Metodología de', 'RD 1147/2011', 'Villena', 'Las faltas de asistencia',
    'Reconoce las características', 'fundamental', 'Horas totales', 'Primera SA']) {
    assert.ok(!cuerpo.includes(trozo), `el árbol lleva contenido dentro: «${trozo}»`);
  }
  const { arbol } = JSON.parse(cuerpo);
  for (const nodo of Arbol.aplanar(arbol)) {
    for (const prohibido of ['valores', 'campos', 'bloque', 'items']) {
      assert.ok(!(prohibido in nodo), `un nodo del árbol lleva «${prohibido}»`);
    }
  }
});

prueba('el `edita` de cada nodo es el que resuelve core/permisos.js', async () => {
  // El árbol hereda `edita` de arriba abajo en una pasada; `quienEdita` lo resuelve bajando la
  // plantilla por cada id. Son dos formas de responder lo mismo y no se pueden separar: es el fallo
  // del mockup v1 que core/permisos.js vino a cerrar.
  const { arbol } = await (await arbolDe(S.u.marta, S.doc._id)).json();
  let comprobados = 0;
  for (const nodo of Arbol.aplanar(arbol)) {
    if (!nodo.seccion) continue;
    assert.equal(nodo.edita, C.quienEdita(PLANTILLA, nodo.seccion), `«${nodo.seccion}» no coincide`);
    comprobados += 1;
  }
  assert.ok(comprobados > 10);
  nota(`${comprobados} nodos comprobados contra quienEdita()`);
});

prueba('GET .../arbol: la jefatura de estudios lo ve todo y no puede editar nada', async () => {
  // El criterio del E2 adelantado a la API: `jefe_estudios` es quien aprueba, así que ve los
  // documentos de todos los departamentos en cualquier estado y no edita ni uno.
  for (const id of [S.doc._id, S.otro._id]) {
    const res = await arbolDe(S.u.jefa, id);
    assert.equal(res.status, 200, 'la jefatura de estudios no ve un documento');
    const { arbol } = await res.json();
    const nodos = Arbol.aplanar(arbol);
    assert.ok(nodos.length > 1);
    for (const nodo of nodos) {
      assert.equal(nodo.puedeEditar, false, `la jefatura de estudios puede editar «${nodo.clave}»`);
    }
  }
});

prueba('GET .../arbol: un docente edita sus módulos y los apartados que se le asignan', async () => {
  const { arbol } = await (await arbolDe(S.u.ana, S.doc._id)).json();
  const porClave = new Map(Arbol.aplanar(arbol).map((n) => [n.clave, n]));
  const puede = (clave) => {
    const n = porClave.get(clave);
    assert.ok(n, `no hay ningún nodo «${clave}»`);
    return n.puedeEditar;
  };

  // Le han asignado «Introducción», y asignar un apartado común asigna también sus subapartados.
  assert.equal(puede('introduccion'), true);
  assert.equal(puede('introduccion/marco-legal'), true);
  assert.equal(puede('introduccion/marco-legal/el-centro'), true);
  // Lo que no se le ha asignado, no.
  assert.equal(puede('atencion-a-la-diversidad'), false);
  // Lleva el primer módulo: sus apartados sí.
  assert.equal(puede('proyecto-intermodular::modulos/metodologia'), true);
  // Los de los otros dos, no, aunque uno se llame igual.
  assert.equal(puede('bases-de-datos::modulos/metodologia'), false);
  assert.equal(puede('proyecto-intermodular-2::modulos/metodologia'), false);
});

prueba('GET .../arbol: una unidad sin docentes no la edita nadie salvo la jefatura', async () => {
  const deLuis = await (await arbolDe(S.u.luis, S.doc._id)).json();
  const deMarta = await (await arbolDe(S.u.marta, S.doc._id)).json();
  const deRoot = await (await arbolDe(S.u.root, S.doc._id)).json();

  const editables = (arbol) => Arbol.aplanar(arbol).filter((n) => n.puedeEditar).map((n) => n.clave);

  // Luis es docente del departamento y no lleva ningún módulo ni tiene nada asignado: lo ve todo y
  // no puede escribir en ninguna parte.
  assert.equal(deLuis.arbol.hijos.length, 4, 'Luis no ve el documento de su departamento');
  assert.deepStrictEqual(editables(deLuis.arbol), []);

  // La jefatura de departamento edita los apartados comunes y todos los módulos, los tenga
  // asignados o no. Es LA regla que se separó en el mockup v1.
  const conContenido = Arbol.aplanar(deMarta.arbol).filter((n) => n.contenido);
  assert.ok(conContenido.length > 0);
  for (const nodo of conContenido) {
    assert.equal(nodo.puedeEditar, true, `la jefatura de departamento no puede editar «${nodo.clave}»`);
  }
  // Y el admin, igual: da soporte.
  assert.deepStrictEqual(editables(deRoot.arbol).sort(), editables(deMarta.arbol).sort());
});

// ---------------------------------------------------------------- GET .../apartado

prueba('GET .../apartado devuelve la rama con sus valores, su origen y su updatedAt', async () => {
  const res = await apartadoDe(S.u.marta, S.doc._id, 'seccion=introduccion');
  assert.equal(res.status, 200);
  const cuerpo = await res.json();

  assert.equal(cuerpo.seccion, 'introduccion');
  assert.equal(cuerpo.unidadId, null);
  assert.equal(cuerpo.titulo, 'Introducción');
  assert.equal(cuerpo.existe, true);
  assert.equal(cuerpo.origen, 'nuevo');
  assert.equal(typeof cuerpo.updatedAt, 'string', 'falta el token de concurrencia del E3');
  assert.deepStrictEqual(cuerpo.valores, S.DATOS.documento.introduccion);
  // Los campos de la plantilla para esta rama: sin ellos el cliente no sabe cómo pintar `valores`.
  assert.deepStrictEqual(cuerpo.campos, [campoTexto]);
  assert.equal(cuerpo.contenido, true);
  assert.equal(cuerpo.edita, 'jefe_departamento');
  assert.equal(cuerpo.puedeEditar, true);
  // Y el texto compartido al que apunta, que si no el `{ ref: 'c001' }` es un hueco.
  assert.deepStrictEqual(Object.keys(cuerpo.compartidos), ['c001']);
  assert.equal(cuerpo.compartidos.c001.version, 1);
  assert.equal(cuerpo.compartidos.c001.modo, 'sugerido');
  assert.ok(!('_id' in cuerpo.compartidos.c001), 'el compartido sale con campos del repositorio');
});

prueba('GET .../apartado de un módulo devuelve lo de ese módulo y de ningún otro', async () => {
  const uno = await (await apartadoDe(S.u.marta, S.doc._id, 'seccion=modulos/metodologia&unidad=proyecto-intermodular')).json();
  const dos = await (await apartadoDe(S.u.marta, S.doc._id, 'seccion=modulos/metodologia&unidad=proyecto-intermodular-2')).json();

  assert.deepStrictEqual(uno.valores, S.DATOS.instancias[0].valores['modulos/metodologia']);
  assert.deepStrictEqual(dos.valores, S.DATOS.instancias[2].valores['modulos/metodologia']);
  // Dos módulos con el mismo título y contenido distinto: la clave es el unidadId.
  assert.notDeepStrictEqual(uno.valores, dos.valores);
  assert.equal(uno.unidadId, 'proyecto-intermodular');
  assert.equal(uno.edita, 'docentes_del_modulo');
  assert.deepStrictEqual(Object.keys(uno.compartidos), ['c001']);
  assert.deepStrictEqual(Object.keys(dos.compartidos), ['c002']);
});

prueba('GET .../apartado dice si quien pregunta puede editarlo', async () => {
  const quien = async (persona, consulta) => (await (await apartadoDe(persona, S.doc._id, consulta)).json()).puedeEditar;

  assert.equal(await quien(S.u.ana, 'seccion=introduccion'), true, 'Ana lo tiene asignado');
  assert.equal(await quien(S.u.ana, 'seccion=atencion-a-la-diversidad'), false);
  assert.equal(await quien(S.u.ana, 'seccion=modulos/metodologia&unidad=proyecto-intermodular'), true);
  assert.equal(await quien(S.u.ana, 'seccion=modulos/metodologia&unidad=bases-de-datos'), false);
  assert.equal(await quien(S.u.luis, 'seccion=introduccion'), false);
  assert.equal(await quien(S.u.marta, 'seccion=modulos/metodologia&unidad=bases-de-datos'), true);
  // La jefatura de estudios lo ve y no lo edita, ni por API.
  assert.equal(await quien(S.u.jefa, 'seccion=introduccion'), false);
  assert.equal(await quien(S.u.jefa, 'seccion=modulos/metodologia&unidad=proyecto-intermodular'), false);
});

prueba('GET .../apartado: una sección de la plantilla sin escribir sale vacía, no con un 404', async () => {
  const res = await apartadoDe(S.u.marta, S.doc._id, 'seccion=anexos/actas');
  assert.equal(res.status, 200);
  const cuerpo = await res.json();
  assert.equal(cuerpo.existe, false);
  assert.deepStrictEqual(cuerpo.valores, {});
  assert.equal(cuerpo.origen, null);
  assert.equal(cuerpo.updatedAt, null);
  assert.deepStrictEqual(cuerpo.compartidos, {});
  // Es parte del documento y hay que poder abrirla para escribir en ella.
  assert.equal(cuerpo.puedeEditar, true);
});

prueba('GET .../apartado: los parámetros mal puestos son 400, y lo que no existe 404', async () => {
  const pedir = (consulta) => apartadoDe(S.u.marta, S.doc._id, consulta);

  await esError(await pedir(''), 400, 'peticion');
  await esError(await pedir('seccion='), 400, 'peticion');
  // Un apartado de módulo sin decir de qué módulo, y un apartado común diciendo de qué módulo.
  await esError(await pedir('seccion=modulos/metodologia'), 400, 'peticion');
  await esError(await pedir('seccion=introduccion&unidad=proyecto-intermodular'), 400, 'peticion');
  // Lo que no está en la plantilla de este documento, y una unidad que no es suya.
  await esError(await pedir('seccion=no-existe-esta-seccion'), 404, 'no_encontrado');
  await esError(await pedir('seccion=modulos/metodologia&unidad=modulo-de-otro-ciclo'), 404, 'no_encontrado');
});

// ---------------------------------------------------------------- GET .../pdf

prueba('GET .../pdf devuelve un PDF de verdad, con su cabecera y su nombre de fichero', async () => {
  const t0 = Date.now();
  const res = await Pdf.GET(pet(`/api/documentos/${S.doc._id}/pdf`, S.u.ana), { id: S.doc._id });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/pdf');
  // Sin acentos: el nombre viaja en una cabecera HTTP, que es latin-1.
  assert.equal(res.headers.get('content-disposition'), 'inline; filename="Programacion_DAW_2026-27.pdf"');
  assert.equal(res.headers.get('cache-control'), 'no-store');

  const bytes = Buffer.from(await res.arrayBuffer());
  assert.equal(bytes.slice(0, 5).toString('latin1'), '%PDF-', 'esto no es un PDF');
  assert.ok(bytes.length > 10000, `el PDF son solo ${bytes.length} bytes`);
  nota(`${(bytes.length / 1024).toFixed(0)} KB en ${Date.now() - t0} ms`);
});

prueba('GET .../pdf: el estado por omisión es el del documento y uno inventado es 400', async () => {
  const marca = async (consulta) => {
    const { definicion } = await Pdf.definicionDe(pet(`/api/documentos/${S.doc._id}/pdf${consulta}`, S.u.ana), { id: S.doc._id });
    return definicion.watermark;
  };
  assert.ok(await marca(''), 'el documento está en borrador: le falta la marca de agua');
  assert.ok(await marca('?estado=borrador'));
  assert.equal(await marca('?estado=aprobado'), undefined, 'un aprobado no lleva marca de agua');

  const res = await Pdf.GET(pet(`/api/documentos/${S.doc._id}/pdf?estado=aprovado`, S.u.ana), { id: S.doc._id });
  await esError(res, 400, 'peticion');
  // Y una unidad que no es de este documento.
  await esError(
    await Pdf.GET(pet(`/api/documentos/${S.doc._id}/pdf?unidad=no-existe`, S.u.ana), { id: S.doc._id }),
    404, 'no_encontrado',
  );
});

prueba('CRITERIO DE ACEPTACIÓN DEL E1: el PDF de la ruta es idéntico al del motor', async () => {
  // El documento ha pasado por la base de datos —cuatro colecciones, 19 apartados— y el motor lo
  // genera directamente de lo que dejó el importador. Si la definición de pdfmake es la misma, el
  // PDF es el mismo.
  const { definicion, fallo } = await Pdf.definicionDe(
    pet(`/api/documentos/${S.doc._id}/pdf`, S.u.ana), { id: S.doc._id },
  );
  assert.ok(!fallo, 'la ruta del PDF ha fallado');
  assert.deepStrictEqual(comparable(definicion), comparable(delMotor()));

  // Y que de verdad hay documento que comparar: si los dos salieran vacíos, serían iguales por
  // vacíos. Estas marcas están en los caminos que más fácil se pierden al pasar por el repositorio.
  const texto = JSON.stringify(comparable(definicion));
  assert.ok(texto.includes('Comprobaciones automáticas'), 'ningún módulo ha disparado los avisos de las ponderaciones');
  assert.ok(texto.includes('Las faltas de asistencia'), 'el texto compartido no se ha resuelto');
  assert.ok(texto.includes('RD 1147/2011'), 'la tabla con celdas combinadas no está');
  assert.ok(texto.includes('Villena'), 'la tabla de clave y valor no está');
  assert.ok(texto.includes(TITULO_TOMO), 'la portada no lleva el título del documento');
});

prueba('el tomo sale en el orden del documento, también el generado desde la base de datos', async () => {
  const { definicion } = await Pdf.definicionDe(pet(`/api/documentos/${S.doc._id}/pdf`, S.u.ana), { id: S.doc._id });
  const titulos = definicion.content
    .filter((n) => n.style === 'h2' && /^4\.\d+\. /.test(n.text || ''))
    .map((n) => n.text);
  assert.deepStrictEqual(titulos, [
    '4.1. Proyecto intermodular',
    '4.2. Bases de datos',
    '4.3. Proyecto intermodular',
  ]);
});

prueba('GET .../pdf?unidad= saca ese módulo y no el que se llama igual', async () => {
  const unidadId = 'proyecto-intermodular-2';
  const { definicion } = await Pdf.definicionDe(
    pet(`/api/documentos/${S.doc._id}/pdf?unidad=${unidadId}`, S.u.ana), { id: S.doc._id },
  );

  // El motor seleccionando por POSICIÓN: es el tercero del documento.
  const esperado = delMotor({ instancias: [2], titulo: `${TITULO_TOMO} · Proyecto intermodular` });
  assert.deepStrictEqual(comparable(definicion), comparable(esperado));

  // Y la trampa: seleccionar por título saca los dos módulos que se llaman «Proyecto intermodular».
  // Por eso `unidadPedida` resuelve el unidadId a su índice.
  const porTitulo = delMotor({ instancias: ['Proyecto intermodular'], titulo: `${TITULO_TOMO} · Proyecto intermodular` });
  assert.notDeepStrictEqual(comparable(porTitulo), comparable(definicion),
    'seleccionar por título y por posición da lo mismo: la prueba no está comprobando nada');

  const texto = JSON.stringify(comparable(definicion));
  assert.ok(texto.includes('Proyecto intermodular de segundo'), 'no es el módulo que se ha pedido');
  assert.ok(!texto.includes('Proyecto intermodular de primero'), 'se ha colado el otro módulo del mismo título');
  assert.ok(!texto.includes('Bases de datos'), 'se ha colado otro módulo');
});

// ---------------------------------------------------------------- GET .../docx

prueba('GET .../docx devuelve el mismo Word que el motor, byte a byte', async () => {
  const t0 = Date.now();
  const res = await Docx.GET(pet(`/api/documentos/${S.doc._id}/docx`, S.u.ana), { id: S.doc._id });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'),
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  assert.ok(res.headers.get('content-disposition').startsWith('attachment; filename="Programacion_DAW_2026-27.docx"'));

  const bytes = Buffer.from(await res.arrayBuffer());
  // Un .docx es un zip: empieza por PK.
  assert.equal(bytes.slice(0, 2).toString('latin1'), 'PK', 'esto no es un .docx');

  // Aquí sí se pueden comparar los bytes: `exportarDocx` fija la fecha de cada entrada del zip, así
  // que el mismo contenido da el mismo fichero. Es la misma comprobación que el PDF, sin intermediario.
  const delExportador = await exportarDocx({
    plantilla: PLANTILLA, datos: S.DATOS, titulo: TITULO_TOMO, instancias: 'todas',
  });
  assert.equal(bytes.length, delExportador.length, 'el .docx de la ruta no mide lo mismo que el del motor');
  assert.ok(bytes.equals(delExportador), 'el .docx de la ruta no es el del motor');
  nota(`${(bytes.length / 1024).toFixed(0)} KB en ${Date.now() - t0} ms`);
});

prueba('GET .../docx?unidad= saca un solo módulo, el de esa posición', async () => {
  const res = await Docx.GET(
    pet(`/api/documentos/${S.doc._id}/docx?unidad=bases-de-datos`, S.u.ana), { id: S.doc._id },
  );
  assert.equal(res.status, 200);
  const bytes = Buffer.from(await res.arrayBuffer());
  const esperado = await exportarDocx({
    plantilla: PLANTILLA, datos: S.DATOS, titulo: `${TITULO_TOMO} · Bases de datos`, instancias: [1],
  });
  assert.ok(bytes.equals(esperado), 'el .docx de un módulo no es el del motor');
  assert.ok(res.headers.get('content-disposition').includes('Bases_de_datos'));
});

prueba('GET .../docx valida el estado aunque en Word no cambie nada', async () => {
  // Se valida para que nadie se lleve la impresión de haber exportado un aprobado por escribir mal
  // el parámetro; lo que no hace es cambiar el documento, porque Word no lleva marca de agua.
  await esError(
    await Docx.GET(pet(`/api/documentos/${S.doc._id}/docx?estado=revision`, S.u.ana), { id: S.doc._id }),
    400, 'peticion',
  );
  const borrador = Buffer.from(await (await Docx.GET(pet(`/api/documentos/${S.doc._id}/docx?estado=borrador`, S.u.ana), { id: S.doc._id })).arrayBuffer());
  const aprobado = Buffer.from(await (await Docx.GET(pet(`/api/documentos/${S.doc._id}/docx?estado=aprobado`, S.u.ana), { id: S.doc._id })).arrayBuffer());
  assert.ok(borrador.equals(aprobado), 'la exportación a Word no distingue el estado: ha cambiado algo');
});

// ---------------------------------------------------------------- core/arbol.js por su cuenta

prueba('core/arbol.js es lógica pura: sin unidades ni apartados monta el árbol igual', async () => {
  // Es lo que verá la interfaz justo después de importar un documento que todavía no tiene unidades
  // conciliadas, y la razón de que el árbol no pueda depender de que haya datos.
  const arbol = Arbol.construirArbol({ plantilla: PLANTILLA });
  const modulos = arbol.hijos[3];
  assert.equal(modulos.tipo, 'bloque');
  assert.deepStrictEqual(modulos.hijos, []);
  const apartados = Arbol.aplanar(arbol).filter((n) => n.contenido);
  assert.ok(apartados.length > 0);
  for (const n of apartados) assert.equal(n.relleno, false, `«${n.seccion}» sale relleno sin apartados`);

  // Y se queja si no hay plantilla: un árbol sin plantilla sería un árbol inventado.
  assert.throws(() => Arbol.construirArbol({}), /plantilla/);
  assert.throws(() => Arbol.construirArbol({ plantilla: { secciones: null } }), /plantilla/);
});

prueba('core/arbol.js: un apartado con las claves puestas y nada escrito cuenta como vacío', async () => {
  // El caso que `Object.keys(valores).length` daría por relleno: un repetidor sin ítems y una tabla
  // que nunca se importó. Es justo lo que la barra lateral tiene que enseñar como pendiente.
  assert.equal(Arbol.algoEscrito({ items: [] }), false);
  assert.equal(Arbol.algoEscrito({ filas: [] }), false);
  assert.equal(Arbol.algoEscrito({ texto: [] }), false);
  assert.equal(Arbol.algoEscrito({ texto: '   ' }), false);
  assert.equal(Arbol.algoEscrito({}), false);
  assert.equal(Arbol.algoEscrito(null), false);
  assert.equal(Arbol.algoEscrito({ items: [{ titulo: 'SA 1' }] }), true);
  assert.equal(Arbol.algoEscrito({ texto: [{ type: 'p', text: 'Algo.' }] }), true);
});

prueba('core/arbol.js: el formato de una celda no es contenido, y un párrafo sin texto tampoco', async () => {
  // Lo que se ve no es lo que se ha escrito. Una tabla a la que solo le han puesto la cabecera
  // —negrita, sombreada, celdas unidas— no tiene nada dentro, y la barra lateral no la puede
  // pintar como rellena. Importa de verdad al borrar para siempre: el aviso dice cuánto se pierde,
  // y si contara el formato diría que hay contenido escrito en los once módulos de una tabla
  // vacía, que es la clase de aviso que no se vuelve a leer.
  assert.equal(Arbol.algoEscrito({ filas: [[{ text: '', bold: true }]] }), false, 'la negrita no es texto');
  assert.equal(Arbol.algoEscrito({ filas: [[{ text: '', fondo: 'cabecera' }]] }), false, 'el sombreado no es texto');
  assert.equal(Arbol.algoEscrito({ filas: [[{ text: '', colspan: 2, rowspan: 2 }]] }), false, 'unir celdas no es texto');
  assert.equal(Arbol.algoEscrito({ texto: [{ type: 'p', text: '' }] }), false, 'un párrafo vacío no es texto');
  assert.equal(Arbol.algoEscrito({ texto: [{ type: 'ul', items: [''] }] }), false, 'una lista de huecos vacíos no es texto');

  // Y lo que sí se ha escrito sigue contando, aunque lleve formato encima.
  assert.equal(Arbol.algoEscrito({ filas: [[{ text: 'RA1', bold: true }]] }), true);
  assert.equal(Arbol.algoEscrito({ texto: [{ type: 'ul', items: ['uno'] }] }), true);
});

prueba('core/arbol.js: la lista de lo que no es contenido cubre el contrato entero de la celda', async () => {
  // LA PRUEBA QUE IMPIDE QUE SE QUEDE CORTA. `NUNCA_ESCRITO` enumera las claves de formato de una
  // celda, y el contrato de la celda vive en otro fichero: `CLAVES_CELDA` de core/estructurados.js.
  // El día que la celda gane una clave de formato —una alineación, un tamaño de letra— esta prueba
  // se pone roja y dice cuál, en lugar de dejar que el formato nuevo vuelva a contar como texto
  // escrito sin que nadie se entere. `text` es la única clave que lleva texto, y por eso se excluye.
  const Estructurados = require('../core/estructurados.js');
  const formato = Estructurados.CLAVES_CELDA.filter((k) => k !== 'text');
  const sinClasificar = formato.filter((k) => !Arbol.NUNCA_ESCRITO.has(k));
  assert.deepEqual(sinClasificar, [], `core/arbol.js cuenta como texto escrito el formato de una celda: falta ${sinClasificar.join(', ')} en NUNCA_ESCRITO`);

  // Y al revés: una celda con TODAS sus claves de formato puestas, pero sin texto, está vacía.
  const celda = { text: '' };
  for (const k of formato) celda[k] = k === 'bold' ? true : (k === 'colspan' || k === 'rowspan' ? 2 : 'cabecera');
  assert.equal(Arbol.algoEscrito({ filas: [[celda]] }), false, 'una celda solo con formato cuenta como escrita');
});

// ================================================================ importación
// POST /api/documentos/importar. Cada prueba sube su propio .docx y escribe en el repositorio
// compartido: por eso las que dicen «no ha escrito nada» miran el número de documentos antes y
// después, y no cuentan el total.
//
// El .docx se monta aquí con escribirDocx de motor/exportar-docx.js, a partir de una plantilla
// sintética: así la prueba corre en una máquina recién clonada, sin ningún documento del
// departamento, y además el ida y vuelta es completo (escribir → subir → importar → pintar).

const { importarDocx } = require('../motor/importar-docx');
const Importar = require('../app/_lib/rutas/importar');
const JSZip = require('jszip');

const DOCX_TIPO = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const NOMBRE_DOCX = 'PD_prueba.docx';
const TITULO_IMPORTADO = 'Programación didáctica · DAW · 2026-27';
// Los títulos del catálogo para 2026-27 (core/unidades.js: daw-0485, daw-0484 y daw-0614). Fuera del
// orden alfabético a propósito: una importación que reordene los módulos se nota en el tomo.
const TITULOS_BASE = ['Programación', 'Base de datos', 'Despliegue de aplicaciones web'];
const IDS_BASE = ['daw-0485', 'daw-0484', 'daw-0614'];
// Lo que se le pasa al importador en la ruta, y lo mismo en las pruebas que lo llaman a mano.
const OPCIONES_IMPORTADOR = { tipo: 'programacion_didactica', departamento: 'informatica', origen: NOMBRE_DOCX };

const PLANTILLA_IMPORTAR = {
  tipo: 'programacion_didactica', origen: NOMBRE_DOCX, version: null,
  generada: '2026-01-01T00:00:00.000Z',
  secciones: [
    { id: 'introduccion', titulo: 'Introducción', nivel: 1, campos: [campoTexto], hijos: [
      { id: 'introduccion/marco-legal', titulo: 'Marco legal', nivel: 2, campos: [campoTexto], hijos: [] },
    ] },
    { id: 'modulos', titulo: 'Módulos', nivel: 1, instancias: true, etiqueta_instancia: 'módulo', grupos: ['Módulos'], campos: [], hijos: [
      { id: 'modulos/identificacion', titulo: 'Identificación', nivel: 3, campos: [{ id: 'ficha_modulo', tipo: 'auto.ficha_modulo', etiqueta: 'Identificación del módulo' }], hijos: [] },
      { id: 'modulos/resultados-de-aprendizaje', titulo: 'Resultados de aprendizaje', nivel: 3, campos: [{ id: 'ra_ce', tipo: 'auto.tabla_ra_ce', etiqueta: 'RA y CE' }], hijos: [] },
      { id: 'modulos/metodologia', titulo: 'Metodología', nivel: 3, campos: [campoTexto], hijos: [] },
      { id: 'modulos/ponderaciones', titulo: 'Ponderaciones', nivel: 3, campos: [{ id: 'ponderaciones', tipo: 'ponderacion_ra_ce', etiqueta: 'Ponderaciones', multiple: true }], hijos: [] },
    ] },
  ],
};

// Un párrafo igual en los tres módulos: el importador lo saca como texto compartido (motor/compartidos.js
// pide al menos 80 caracteres repetidos en tres módulos), y así la prueba cubre también esa tabla.
const METODOLOGIA_COMUN = { type: 'p', text: 'Metodología común a todos los módulos del departamento: trabajo por proyectos, con prácticas guiadas y evaluación continua del alumnado.' };

// Un documento de Word con un módulo por título, en ese orden. Lo escribe el propio exportador.
async function docxDe(titulos) {
  const datos = {
    departamento: 'informatica',
    documento: {
      introduccion: { texto: [{ type: 'p', text: 'Introducción de prueba.' }] },
      'introduccion/marco-legal': { texto: [{ type: 'p', text: 'Marco legal de prueba.' }] },
    },
    instancias: titulos.map((titulo, i) => ({
      titulo, num: `${i + 1}`, grupo: 'Módulos', docentes: [],
      valores: {
        'modulos/identificacion': { ficha_modulo: { pares: [
          { etiqueta: 'Módulo profesional', valor: titulo },
          { etiqueta: 'Horas', valor: '160' },
        ] } },
        'modulos/resultados-de-aprendizaje': { ra_ce: RA_CE },
        'modulos/metodologia': { texto: [METODOLOGIA_COMUN] },
        'modulos/ponderaciones': { ponderaciones: PONDERACIONES_OK },
      },
    })),
    asignaciones: {},
    compartidos: {},
  };
  return exportarDocx({ plantilla: PLANTILLA_IMPORTAR, datos, titulo: TITULO_IMPORTADO });
}

// Un formulario de importación. Un campo a `null` se omite, para probar que falta; `buffer` a `null`
// es no mandar fichero.
function subir(persona, buffer, campos = {}) {
  const formulario = new FormData();
  if (buffer !== null) formulario.append('archivo', new File([buffer], NOMBRE_DOCX, { type: DOCX_TIPO }));
  const valores = { tipo: 'programacion_didactica', ciclo: 'DAW', curso: '2026-27', departamento: 'informatica', ...campos };
  for (const [clave, valor] of Object.entries(valores)) if (valor !== null) formulario.append(clave, valor);
  return new Request('http://pruebas.local/api/documentos/importar', {
    method: 'POST',
    body: formulario,
    headers: cookieDe(persona) ? { cookie: cookieDe(persona) } : {},
  });
}
const importar = (persona, buffer, campos) => Importar.POST(subir(persona, buffer, campos));

// Reimportar la misma clave (tipo, curso, ciclo, departamento) crea una versión alternativa, que no se
// exporta ni se edita. Las pruebas que miran el documento recién importado parten de un grupo vacío.
async function vaciarGrupoDeImportacion() {
  const previos = await repo.documentos.listar({ tipo: 'programacion_didactica', curso: '2026-27', departamento: 'informatica' });
  for (const d of previos.filter((x) => (x.ciclo || null) === 'daw')) await repo.documentos.borrar(d._id);
}

const documentosAhora = async () => (await repo.documentos.listar({})).length;

prueba('POST /api/documentos/importar: un .docx sintético deja el documento, las unidades, los apartados y los compartidos', async () => {
  const t0 = Date.now();
  const res = await importar(S.u.marta, await docxDe(TITULOS_BASE));
  assert.equal(res.status, 201);
  const { documento, resumen } = await res.json();
  const tardaMs = Date.now() - t0;

  assert.equal(documento.tipo, 'programacion_didactica');
  assert.equal(documento.ciclo, 'daw', 'el ciclo debe guardarse en minúsculas');
  assert.equal(documento.curso, '2026-27');
  assert.equal(documento.departamento, 'informatica');
  assert.equal(documento.estado, 'borrador');
  assert.equal(documento.origen, NOMBRE_DOCX);
  assert.equal(documento.plantilla, undefined, 'la respuesta no debe llevar la plantilla');

  const guardado = await repo.documentos.obtener(documento._id);
  assert.ok(guardado && guardado.plantilla, 'no se ha guardado la plantilla');

  const unidades = await repo.unidades.listar(documento._id);
  assert.deepStrictEqual(unidades.map((u) => u.unidadId), IDS_BASE);
  const apartados = await repo.apartados.listar(documento._id);
  assert.ok(apartados.length > TITULOS_BASE.length, 'no hay apartados comunes ni de módulo');
  assert.equal(apartados.length, resumen.apartados);
  const compartidos = await repo.compartidos.listar(documento._id);
  assert.ok(compartidos.length > 0, 'el párrafo repetido en los módulos no se ha guardado como compartido');
  assert.equal(compartidos.length, resumen.compartidos);

  assert.equal(resumen.unidades, 3);
  assert.ok(resumen.secciones > 0);
  assert.ok(Array.isArray(resumen.avisos));
  assert.deepStrictEqual(resumen.conciliacion.map((c) => c.como), ['titulo_del_curso', 'titulo_del_curso', 'titulo_del_curso']);
  assert.deepStrictEqual(resumen.conciliacion.map((c) => c.comoEtiqueta), ['título de ese curso', 'título de ese curso', 'título de ese curso']);
  assert.deepStrictEqual(resumen.forzadas, []);
  assert.ok(resumen.tardaMs >= 0 && resumen.tardaMs <= tardaMs + 1000);
  nota(`${resumen.secciones} secciones, ${resumen.unidades} unidades, ${resumen.apartados} apartados, ${resumen.compartidos} compartidos en ${resumen.tardaMs} ms`);
});

prueba('CRITERIO DE ACEPTACIÓN DEL E1 PARA LA IMPORTACIÓN: el PDF del documento guardado es el del motor', async () => {
  await vaciarGrupoDeImportacion();
  const buffer = await docxDe(TITULOS_BASE);
  const res = await importar(S.u.marta, buffer);
  assert.equal(res.status, 201);
  const { documento } = await res.json();

  // El {plantilla, datos} que devuelve el importador sobre el mismo Word. Se importa aparte, así que
  // la fecha de generación de la plantilla no coincide: esa se toma de lo guardado, y el resto de la
  // plantilla tiene que ser igual.
  const imp = await importarDocx({ buffer }, OPCIONES_IMPORTADOR);
  const guardado = await repo.documentos.obtener(documento._id);
  assert.deepStrictEqual(
    { ...guardado.plantilla, generada: null },
    { ...imp.plantilla, generada: null },
    'la plantilla guardada no es la que devolvió el importador',
  );

  const { definicion, fallo } = await Pdf.definicionDe(
    pet(`/api/documentos/${documento._id}/pdf`, S.u.marta), { id: documento._id },
  );
  assert.ok(!fallo, 'la ruta del PDF ha fallado');
  const esperado = buildDocDefinition({
    plantilla: { ...imp.plantilla, generada: guardado.plantilla.generada },
    datos: imp.datos,
    instancias: 'todas',
    titulo: TITULO_IMPORTADO,
    subtitulo: SUBTITULO,
    estado: 'borrador',
  });
  assert.deepStrictEqual(comparable(definicion), comparable(esperado));

  // Y que de verdad hay algo que comparar: el texto compartido, el módulo y la portada.
  const texto = JSON.stringify(comparable(definicion));
  assert.ok(texto.includes('Metodología común a todos los módulos'), 'el texto compartido no se ha resuelto');
  assert.ok(texto.includes('Despliegue de aplicaciones web'), 'falta un módulo');
  assert.ok(texto.includes(TITULO_IMPORTADO), 'la portada no lleva el título del documento');
});

prueba('la importación deja las unidades en el orden del documento, también en el tomo', async () => {
  await vaciarGrupoDeImportacion();
  const res = await importar(S.u.marta, await docxDe(TITULOS_BASE));
  const { documento } = await res.json();

  const unidades = await repo.unidades.listar(documento._id);
  assert.deepStrictEqual(unidades.map((u) => u.titulo), TITULOS_BASE);

  const { definicion } = await Pdf.definicionDe(
    pet(`/api/documentos/${documento._id}/pdf`, S.u.marta), { id: documento._id },
  );
  const cabeceras = definicion.content.filter((n) => n.style === 'h2').map((n) => n.text);
  const posiciones = TITULOS_BASE.map((t) => cabeceras.findIndex((x) => x.includes(t)));
  assert.ok(posiciones.every((p) => p >= 0), `no salen los tres módulos en el tomo: ${cabeceras.join(' | ')}`);
  assert.deepStrictEqual(posiciones, [...posiciones].sort((a, b) => a - b), 'los módulos salen desordenados en el tomo');
});

prueba('importar: un título que el catálogo no reconoce da 400 con la lista y no escribe nada', async () => {
  const antes = await documentosAhora();
  const res = await importar(S.u.marta, await docxDe(['Programación', 'Módulo inventado']));
  const cuerpo = await esError(res, 400, 'peticion');
  assert.deepStrictEqual(cuerpo.sinResolver.map((s) => s.titulo), ['Módulo inventado']);
  assert.ok(cuerpo.sinResolver[0].motivo.length > 0, 'falta el motivo');
  assert.equal(await documentosAhora(), antes, 'el 400 ha dejado un documento escrito');
});

prueba('importar con forzar=1: entra igual, con el id derivado del título, y la respuesta lo dice', async () => {
  const res = await importar(S.u.marta, await docxDe(['Programación', 'Módulo inventado', 'Base de datos']), { forzar: '1' });
  assert.equal(res.status, 201);
  const { documento, resumen } = await res.json();

  assert.deepStrictEqual(resumen.forzadas, [{ titulo: 'Módulo inventado', unidadId: 'modulo-inventado' }]);
  assert.deepStrictEqual(resumen.conciliacion.filter((c) => c.forzada).map((c) => c.titulo), ['Módulo inventado']);
  const unidades = await repo.unidades.listar(documento._id);
  assert.deepStrictEqual(unidades.map((u) => u.unidadId), ['daw-0485', 'modulo-inventado', 'daw-0484']);
});

prueba('importar: 401 sin persona, y 403 para el docente y para la jefatura de estudios', async () => {
  const buffer = await docxDe(TITULOS_BASE);
  await esError(await importar(null, buffer), 401, 'sin_identificar');
  await esError(await importar(S.u.ana, buffer), 403, 'sin_permiso');
  await esError(await importar(S.u.jefa, buffer), 403, 'sin_permiso');
});

prueba('importar: el jefe de departamento no importa en otro departamento; el admin sí', async () => {
  const buffer = await docxDe(TITULOS_BASE);
  await esError(await importar(S.u.marta, buffer, { departamento: 'matematicas' }), 403, 'sin_permiso');
  const res = await importar(S.u.root, buffer, { departamento: 'matematicas' });
  assert.equal(res.status, 201);
  assert.equal((await res.json()).documento.departamento, 'matematicas');
});

prueba('importar: 400 si falta cualquiera de los campos del formulario', async () => {
  const buffer = await docxDe(TITULOS_BASE);
  await esError(await importar(S.u.marta, null), 400, 'peticion');
  for (const campo of ['tipo', 'ciclo', 'curso', 'departamento']) {
    await esError(await importar(S.u.marta, buffer, { [campo]: null }), 400, 'peticion');
  }
});

prueba('importar: 400 si el fichero no es un .docx que se pueda leer', async () => {
  await esError(await importar(S.u.marta, Buffer.from('Esto no es un Word.')), 400, 'peticion');
  // Un zip de verdad, pero sin nada de Word dentro.
  const zip = await new JSZip().generateAsync({ type: 'nodebuffer' });
  await esError(await importar(S.u.marta, zip), 400, 'peticion');
});

prueba('importar: 400 con un curso mal escrito, un tipo que no se importa o un forzar que no es 0 ni 1', async () => {
  const buffer = await docxDe(TITULOS_BASE);
  await esError(await importar(S.u.marta, buffer, { curso: '2026/27' }), 400, 'peticion');
  await esError(await importar(S.u.marta, buffer, { tipo: 'memoria' }), 400, 'peticion');
  await esError(await importar(S.u.marta, buffer, { forzar: 'sí' }), 400, 'peticion');
});

// ================================================================ ejecución

(async () => {
  await sembrar();

  for (const { nombre, fn } of pendientes) {
    try {
      await fn();
      console.log(`ok   ${nombre}`);
    } catch (e) {
      fallos += 1;
      // Un deepStrictEqual sobre la definición del tomo suelta un diff de megabytes: se recorta para
      // que el fallo se pueda leer, que es de lo que sirve una prueba.
      const mensaje = String((e && e.message) || e);
      console.log(`FALLO ${nombre}\n     ${mensaje.slice(0, 2000).replace(/\n/g, '\n     ')}`);
      if (mensaje.length > 2000) console.log(`     … (${mensaje.length - 2000} caracteres más de diferencias)`);
    }
  }

  console.log(fallos ? `\n${fallos} prueba(s) fallida(s)` : '\nTodas las pruebas correctas');
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
