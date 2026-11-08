// Escribir en un apartado: la puerta del modelo de bloques y el PATCH que guarda la rama.
//
//   node test/edicion.js
//
// Sin levantar Next, sin red y sin base de datos: las rutas se llaman directamente con un `Request`
// normal, igual que en test/api.js y test/asignacion.js (docs/api.md, primera regla de forma).
//
// QUÉ SE PRUEBA, Y POR QUÉ ESTAS COSAS
//
// Es el riesgo nº 1 del proyecto (docs/interfaz-web.md §2.3): el PDF solo sale bien si lo guardado es
// EXACTAMENTE la forma que espera el generador, y la ruta es la última puerta antes de la base de
// datos. Así que hay tres grupos de pruebas:
//
//   1. la puerta en seco (core/bloques.js): qué acepta y qué rechaza, y con qué motivo;
//   2. el camino completo: guardar, volver a leer, y que lo escrito salga en el PDF con su formato,
//      que es el criterio de aceptación del E3;
//   3. lo que NO tiene que pasar: que alguien escriba donde no puede, que dos pestañas se pisen en
//      silencio, y que una petición con basura dentro deje algo escrito.
//
// EL CRITERIO DE ACEPTACIÓN SE COMPRUEBA SOBRE LA DEFINICIÓN DE pdfmake
//
// Y no sobre los bytes del PDF: es la misma decisión de test/ida-y-vuelta.js y de las pruebas de
// /pdf. `buildDocDefinition` es una función pura de { plantilla, datos }, así que si la definición
// lleva los tramos en negrita y cursiva, el PDF los imprime; y cuando algo falla, la definición dice
// qué nodo cambió, mientras que dos PDF distintos solo dicen que son distintos. Comparar bytes sería
// además imposible: la portada lleva la fecha de generación.
//
// CADA PRUEBA TIENE SU PROPIO ALMACÉN
//
// Estas pruebas escriben, y una escritura no puede cambiarle el estado a la siguiente.
// `obtenerRepositorio()` lee `globalThis` en cada llamada, así que basta con poner otro almacén
// antes de cada prueba. Es lo que hace test/asignacion.js.

'use strict';

const assert = require('assert/strict');

const { crearRepositorio } = require('../repositorio');
const memoria = require('../repositorio/memoria');
const B = require('../core/bloques');
const { aFilas } = require('../core/documento');

const CLAVE_GLOBAL = '__pccf_repositorio__';

// ---------------------------------------------------------------- el arnés
// El mismo de test/api.js y test/asignacion.js: `prueba(nombre, fn)` con assert, sin frameworks, en
// serie y en el orden del fichero, así que el primer FALLO que se lee es el más cercano a la causa.
let fallos = 0;
const pendientes = [];
const prueba = (nombre, fn) => pendientes.push({ nombre, fn });

// Un almacén nuevo en memoria, puesto donde lo busca app/_lib/repositorio.js. `enMemoria` evita que
// la semilla siembre personas de muestra encima.
function nuevoAlmacen() {
  const adaptador = memoria.crear();
  const repo = crearRepositorio({ adaptador });
  repo.enMemoria = true;
  globalThis[CLAVE_GLOBAL] = repo;
  return repo;
}

const { COOKIE_SESION, abrirSesion } = require('../app/_lib/sesion');
const Apartado = require('../app/_lib/rutas/apartado');
const Pdf = require('../app/_lib/rutas/pdf');

// ---------------------------------------------------------------- ayudas

// La persona viaja en la cookie de SESIÓN, que es la que lee app/_lib/usuario.js desde el E2:
// `escenario()` abre una sesión de verdad por persona y aquí solo se busca su testigo. Sin persona,
// no se manda cookie.
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

// Leer el apartado y guardarlo de una vez, que es lo que hace el cliente: lee, edita, manda la
// versión con la que leyó.
async function editar(persona, id, seccion, unidad, valores) {
  const antes = await (await leer(persona, id, seccion, unidad)).json();
  return guardar(persona, id, seccion, unidad, { valores, esperaUpdatedAt: antes.updatedAt });
}

// Lo que está guardado de verdad, sin pasar por la ruta.
const guardados = async (repo, id, seccion, unidad = null) => repo.apartados.leer(id, seccion, unidad);
const valoresGuardados = async (repo, id, seccion, unidad = null) => {
  const fila = await guardados(repo, id, seccion, unidad);
  return fila ? fila.valores : null;
};

// Una foto de todos los apartados del documento, para comprobar que una escritura no toca ninguno
// más y que una petición rechazada no toca ninguno.
async function foto(repo, id) {
  const filas = await repo.apartados.listar(id);
  const out = {};
  for (const f of filas) {
    out[`${f.seccion}|${f.unidadId || ''}`] = JSON.stringify({
      valores: f.valores, origen: f.origen, updatedAt: f.updatedAt,
    });
  }
  return out;
}

const diferencias = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])]
  .filter((k) => a[k] !== b[k]);

// La misma normalización de test/ida-y-vuelta.js y de test/api.js: `buildDocDefinition` devuelve
// `header` y `footer` como cierres nuevos en cada llamada, y `deepStrictEqual` compara funciones por
// referencia, así que compararía A con B y diría que no son iguales por algo que no depende de los
// datos. Se sustituyen por su código fuente. Se reconstruyen objetos y arrays en lugar de pasar por
// JSON para no perder las claves cuyo valor es `undefined` (`colSpan`, `rowSpan`, `pageBreak`,
// `watermark`), que son justo el tipo de diferencia que esto busca.
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

// Todos los nodos de una definición de pdfmake, para buscar dentro.
function nodos(x, salida = []) {
  if (Array.isArray(x)) x.forEach((y) => nodos(y, salida));
  else if (x && typeof x === 'object') {
    salida.push(x);
    Object.keys(x).forEach((k) => nodos(x[k], salida));
  }
  return salida;
}

// ================================================================ el documento sintético
// Pequeño, pero con las formas que importan aquí: un apartado común con un campo de texto y una
// tabla importada al lado (para ver que guardar el texto no se lleva la tabla), un nodo que solo
// agrupa, dos módulos con su metodología y sus ponderaciones, y un repetidor.

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
        // En la plantilla y sin escribir nunca: se tiene que poder escribir en ella (docs/api.md).
        { id: 'introduccion/contextualizacion', titulo: 'Contextualización', nivel: 2, presencia: 1,
          campos: [campoTexto], hijos: [] },
      ] },
    { id: 'atencion-a-la-diversidad', titulo: 'Atención a la diversidad', nivel: 1,
      edita: 'jefe_departamento', presencia: 1, campos: [campoTexto], hijos: [] },
    // Solo agrupa: no tiene campos propios.
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

// `conciliar` es lo que en la importación de verdad hace core/conciliar.js: el id estable del
// catálogo para cada título. Aquí se pone a mano para que las pruebas puedan nombrar las unidades
// por su id —que es lo que viaja en la URL (docs/api.md)— y no por un derivado del título.
const IDS = { 'Programación': 'daw-0485', 'Bases de datos': 'daw-0484' };

const OPCIONES = {
  curso: '2026-27', ciclo: 'daw', departamento: 'informatica',
  conciliar: (titulo) => IDS[titulo],
};

// Las unidades con sus docentes y las asignaciones llevan ids que el repositorio genera él, así que
// los datos se montan cuando ya se sabe quién es quién.
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
    { titulo: 'Bases de datos', num: '0484', grupo: 'Módulos del primer curso', docentes: [],
      valores: valoresDelModulo('Bases de datos') },
  ],
  // «Atención a la diversidad» se le delega a Luis: un apartado común que un docente sí puede
  // escribir, que es la otra mitad de la regla de core/permisos.js.
  asignaciones: { 'atencion-a-la-diversidad': [u.luis._id] },
  compartidos: {},
});

const PLANTILLA_OTRA = {
  tipo: 'programacion_didactica', origen: 'PD_matematicas.docx', version: null,
  generada: '2026-01-01T00:00:00.000Z',
  secciones: [{ id: 'introduccion', titulo: 'Introducción', nivel: 1, edita: 'jefe_departamento',
    presencia: 1, campos: [campoTexto], hijos: [] }],
};

async function sembrar(repo, filas) {
  const doc = await repo.documentos.crear(filas.documento);
  if (filas.unidades.length) await repo.unidades.crearMuchos(doc._id, filas.unidades);
  if (filas.apartados.length) await repo.apartados.crearMuchos(doc._id, filas.apartados);
  if (filas.compartidos.length) await repo.compartidos.crearMuchos(doc._id, filas.compartidos);
  return doc;
}

// Una persona por cada caso que las pruebas necesitan, con su sesión abierta. Los correos son
// `.invalid`, que es un dominio reservado (como en scripts/sembrar.js).
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
  const doc = await sembrar(repo, aFilas({ plantilla: PLANTILLA, datos }, OPCIONES));
  const otro = await sembrar(repo, aFilas({
    plantilla: PLANTILLA_OTRA,
    datos: { departamento: 'matematicas', documento: { introduccion: { texto: [] } }, instancias: [], asignaciones: {}, compartidos: {} },
  }, { curso: '2026-27', departamento: 'matematicas' }));

  return { repo, u, doc, otro, datos };
}

// ================================================================ 1. la puerta, en seco
// core/bloques.js por sí solo: lo que acepta, lo que rechaza y con qué motivo. Está aquí y no en
// test/core.js porque es la pieza de este evolutivo y cuando falle es esto lo que hay que mirar.

prueba('la puerta acepta las cuatro formas del modelo, y nada más', () => {
  assert.equal(B.motivo([]), null, 'un apartado vacío es válido: es como se vacía un campo');
  assert.equal(B.motivo([{ type: 'p', text: 'Un párrafo.' }]), null);
  assert.equal(B.motivo([{ type: 'p', text: '' }]), null, 'un párrafo recién añadido está vacío');
  assert.equal(B.motivo([{ type: 'p', text: [{ text: 'La nota ' }, { text: 'mínima', bold: true }, { text: ' es un ' }, { text: '5', italics: true }] }]), null);
  assert.equal(B.motivo([{ type: 'list', items: [{ text: 'Uno', level: 0 }, { text: 'Uno punto uno', level: 1 }] }]), null);
  assert.equal(B.motivo([{ type: 'list', items: [{ text: 'Sin level' }] }]), null, 'level ausente es 0');
  assert.equal(B.motivo([{ ref: 'c001' }]), null);
  assert.ok(B.valido([{ type: 'p', text: 'x' }, { type: 'list', items: [{ text: 'y', level: 0 }] }, { ref: 'c012' }]));
});

prueba('la sangría que admite el modelo es la del documento importado, no la de los botones', () => {
  // La PD de DAW trae elementos con level 0, 1, 2 y 3. Si la puerta se quedara en el 2 que ofrecen
  // los botones del editor, un docente no podría volver a guardar su propio apartado importado.
  assert.equal(B.NIVEL_EDITOR, 2);
  for (let n = 0; n <= B.NIVEL_MAX; n += 1) {
    assert.equal(B.motivo([{ type: 'list', items: [{ text: 'x', level: n }] }]), null, `level ${n}`);
  }
  const motivo = B.motivo([{ type: 'list', items: [{ text: 'x', level: 40 }] }]);
  assert.ok(motivo && motivo.includes('level'), motivo);
});

prueba('un bloque desvinculado de un texto compartido sigue siendo válido', () => {
  // Es lo que deja `desvincular()` de motor/compartidos.js, y lo lee `avisosDesvinculados()`. Si la
  // puerta lo rechazara, un apartado desvinculado no se podría volver a guardar.
  assert.equal(B.motivo([{ type: 'p', text: 'Copia propia.', desvinculado_de: 'c003', version_origen: 2 }]), null);
  assert.ok(B.motivo([{ type: 'p', text: 'x', desvinculado_de: 'c003', version_origen: 'dos' }]));
});

// ---- EL TEMARIO DEL DEPARTAMENTO SE TIENE QUE PODER ESCRIBIR
//
// Estas frases no son un ejemplo inventado: son de la programación de verdad. La PD que se importa
// lleva dentro el módulo 0373, «Lenguaje de Marcas y Sistemas de Gestión de Información», y los dos
// de desarrollo web, donde escribir etiquetas ES el contenido del módulo. Una versión anterior de
// esta puerta rechazaba cualquier etiqueta y dejaba sin poder guardar su propio apartado de
// contenidos justo a quien lleva Lenguaje de Marcas. Estas pruebas están aquí para que a nadie se le
// ocurra volver a apretar la detección sin ver a quién deja fuera.
const TEMARIO = [
  'Se valorará el uso correcto de <section>, <article> y <nav>.',
  'La etiqueta <p> define un párrafo.',
  'Estructura básica: <html>, <head> y <body>.',
  'El alumnado distinguirá <strong> de <b> y <em> de <i>.',
  'Todo documento XML empieza por <?xml version="1.0" encoding="UTF-8"?>.',
  'La transformación se escribe con <xsl:template match="/"> y <xsl:value-of>.',
  'El esquema se valida con <xs:element name="titulo" type="xs:string"/>.',
  'El espacio duro se escribe &nbsp; y el ampersand, &amp;.',
  '<!DOCTYPE html> abre el documento y <script src="app.js"></script> va al final del body.',
];

prueba('el temario de Lenguaje de Marcas y de desarrollo web se puede escribir tal cual', () => {
  for (const frase of TEMARIO) {
    assert.equal(B.motivoAlGuardar([{ type: 'p', text: frase }]), null, frase);
    assert.equal(B.motivoAlGuardar([{ type: 'list', items: [{ text: frase, level: 0 }] }]), null, frase);
    assert.equal(B.motivoAlGuardar([{ type: 'p', text: [{ text: frase, bold: true }] }]), null, frase);
  }
});

prueba('un «menor que» suelto tampoco es nada: en informática se escribe «a < b» todo el rato', () => {
  const vale = (t) => assert.equal(B.motivoAlGuardar([{ type: 'p', text: t }]), null, t);
  vale('Se comprueba que a < b y que c > d.');
  vale('El bucle va mientras x<y.');
  vale('Los operadores <= y >= se explican en la UD 2.');
  vale('Se entrega en <presentación> y en memoria.');
  vale('El 5 % < nota < 10 %.');
});

prueba('lo único que se rechaza del contenido es la huella de haber pegado desde Word', () => {
  // Lo que nadie teclea a mano y no significa nada para el documento.
  const huellas = [
    '<p class=MsoNormal><span style="font-size:11.0pt">La nota mínima<o:p></o:p></span></p>',
    'La nota mínima<o:p></o:p>',
    '<!--[if gte mso 9]><xml><w:WordDocument/></xml><![endif]-->',
    '<span style="mso-fareast-font-family:Calibri">pegado</span>',
    '<?xml:namespace prefix = "o" ns = "urn:schemas-microsoft-com:office:office" />',
    '<st1:place w:st="on">Villena</st1:place>',
  ];
  for (const t of huellas) {
    assert.ok(B.huellaDeWord(t), t);
    const motivo = B.motivoAlGuardar([{ type: 'p', text: t }]);
    assert.ok(motivo, t);
    assert.ok(motivo.includes('procesador de textos'), motivo);
    assert.ok(motivo.includes(B.huellaDeWord(t)), 'el motivo dice qué ha visto');
  }

  // `<?xml:namespace` es huella; `<?xml version=` es la primera línea de cualquier documento XML, o
  // sea, el contenido de una unidad. La diferencia es deliberada.
  assert.ok(B.huellaDeWord('<?xml:namespace prefix = "st1" />'));
  assert.equal(B.huellaDeWord('<?xml version="1.0"?>'), null);
});

prueba('la puerta es una sola: `valido`, `motivo` y `motivoAlGuardar` dicen lo mismo', () => {
  // Hubo dos un rato —la forma por un lado y «esto parece HTML» por otro— y la segunda rechazaba el
  // temario del departamento. Si algún día vuelven a ser dos, que sea a propósito.
  assert.equal(B.motivoAlGuardar, B.motivo);
  for (const caso of [
    [{ type: 'p', text: 'La etiqueta <p> define un párrafo.' }],
    [{ type: 'p', text: 'Pegado<o:p></o:p>' }],
    [{ type: 'tabla', filas: [] }],
    'ni siquiera es una lista',
  ]) {
    assert.equal(B.valido(caso), B.motivo(caso) === null, JSON.stringify(caso));
  }
});

// ================================================================ 2. guardar y volver a leer

prueba('guardar un párrafo y volver a leerlo: lo mismo que se mandó, con una versión nueva', async () => {
  const { repo, u, doc } = await escenario();
  const texto = [{ type: 'p', text: 'La metodología es activa y participativa.' }];

  const antes = await (await leer(u.ana, doc._id, 'modulos/metodologia', 'daw-0485')).json();
  const res = await guardar(u.ana, doc._id, 'modulos/metodologia', 'daw-0485',
    { valores: { texto }, esperaUpdatedAt: antes.updatedAt });

  assert.equal(res.status, 200);
  const cuerpo = await res.json();
  assert.deepEqual(cuerpo.valores.texto, texto);
  assert.ok(cuerpo.updatedAt, 'la respuesta trae la versión nueva, que es lo que el cliente necesita');
  assert.notEqual(cuerpo.updatedAt, antes.updatedAt, 'la versión tiene que cambiar en cada escritura');

  const despues = await (await leer(u.ana, doc._id, 'modulos/metodologia', 'daw-0485')).json();
  assert.equal(despues.existe, true);
  assert.deepEqual(despues.valores.texto, texto);
  assert.equal(despues.updatedAt, cuerpo.updatedAt, 'el GET devuelve la misma versión que dio el PATCH');
  assert.deepEqual((await valoresGuardados(repo, doc._id, 'modulos/metodologia', 'daw-0485')).texto, texto);
});

prueba('negrita y cursiva se guardan como tramos y vuelven como tramos', async () => {
  const { u, doc } = await escenario();
  const texto = [{ type: 'p', text: [
    { text: 'La nota ' }, { text: 'mínima', bold: true }, { text: ' es un ' },
    { text: '5', italics: true }, { text: ' y ' }, { text: 'no se negocia', bold: true, italics: true },
    { text: '.' },
  ] }];

  assert.equal((await editar(u.ana, doc._id, 'modulos/metodologia', 'daw-0485', { texto })).status, 200);

  const despues = await (await leer(u.ana, doc._id, 'modulos/metodologia', 'daw-0485')).json();
  assert.deepEqual(despues.valores.texto, texto, 'ni un tramo de más ni uno de menos');
  assert.equal(B.plano(despues.valores.texto[0].text), 'La nota mínima es un 5 y no se negocia.');
});

prueba('el criterio del E3: lo escrito con negrita y cursiva sale en el PDF con su formato', async () => {
  const { u, doc } = await escenario();
  const tramos = [
    { text: 'La nota ' }, { text: 'mínima', bold: true }, { text: ' es un ' }, { text: '5', italics: true },
  ];
  const texto = [
    { type: 'p', text: tramos },
    { type: 'list', items: [{ text: [{ text: 'Y en una lista también', italics: true }], level: 0 }] },
  ];
  assert.equal((await editar(u.ana, doc._id, 'modulos/metodologia', 'daw-0485', { texto })).status, 200);

  // La definición de pdfmake, no los bytes: la idea de test/ida-y-vuelta.js y de las pruebas de /pdf.
  const { definicion, fallo } = await Pdf.definicionDe(
    pet(`/api/documentos/${doc._id}/pdf`, u.ana), { id: doc._id },
  );
  assert.ok(!fallo, 'el PDF se tiene que poder generar después de escribir');

  const todos = nodos(definicion);
  const parrafo = todos.find((n) => Array.isArray(n.text) && n.text.length === tramos.length
    && n.text[1] && n.text[1].text === 'mínima');
  assert.ok(parrafo, 'el párrafo con tramos no está en la definición del PDF');
  assert.deepEqual(parrafo.text, tramos, 'los tramos llegan al PDF tal como se guardaron');
  assert.equal(parrafo.alignment, 'justify', 'y llegan como párrafo del documento, no como otra cosa');

  const elemento = todos.find((n) => Array.isArray(n.text) && n.text.length === 1
    && n.text[0] && n.text[0].text === 'Y en una lista también');
  assert.ok(elemento, 'el formato dentro de un elemento de lista también tiene que llegar');
  assert.equal(elemento.text[0].italics, true);
});

prueba('quien lleva Lenguaje de Marcas guarda su apartado de contenidos, con sus etiquetas', async () => {
  // El caso real que una versión anterior de la puerta hacía imposible. Se guarda el temario entero,
  // se vuelve a leer igual, y las etiquetas salen en el PDF como lo que son: texto.
  const { repo, u, doc } = await escenario();
  const texto = TEMARIO.map((frase) => ({ type: 'p', text: frase }));

  const res = await editar(u.ana, doc._id, 'modulos/metodologia', 'daw-0485', { texto });
  assert.equal(res.status, 200, 'esto es el contenido del módulo 0373, no un pegado de Word');

  const guardado = await valoresGuardados(repo, doc._id, 'modulos/metodologia', 'daw-0485');
  assert.deepEqual(guardado.texto, texto, 'ni una etiqueta de menos');

  const { definicion } = await Pdf.definicionDe(pet(`/api/documentos/${doc._id}/pdf`, u.ana), { id: doc._id });
  const impreso = nodos(definicion).filter((n) => typeof n.text === 'string').map((n) => n.text);
  for (const frase of TEMARIO) assert.ok(impreso.includes(frase), `el PDF no imprime: ${frase}`);
});

prueba('un apartado de la plantilla que nadie había escrito se crea al guardarlo', async () => {
  const { repo, u, doc } = await escenario();
  const antes = await (await leer(u.jefa, doc._id, 'introduccion/contextualizacion')).json();
  assert.equal(antes.existe, false);
  assert.equal(antes.updatedAt, null);

  const res = await guardar(u.jefa, doc._id, 'introduccion/contextualizacion', null,
    { valores: { texto: [{ type: 'p', text: 'El centro está en Villena.' }] }, esperaUpdatedAt: null });

  assert.equal(res.status, 200);
  const cuerpo = await res.json();
  assert.equal(cuerpo.existe, true);
  assert.ok(cuerpo.updatedAt);
  const fila = await guardados(repo, doc._id, 'introduccion/contextualizacion');
  assert.equal(fila.valores.texto[0].text, 'El centro está en Villena.');
});

prueba('un apartado que alguien reescribe pasa a origen «modificado»', async () => {
  const { repo, u, doc } = await escenario();
  const antes = await guardados(repo, doc._id, 'modulos/metodologia', 'daw-0485');
  assert.equal(antes.origen, null, 'de partida no está marcado');

  const res = await editar(u.ana, doc._id, 'modulos/metodologia', 'daw-0485',
    { texto: [{ type: 'p', text: 'Reescrito este curso.' }] });
  assert.equal((await res.json()).origen, 'modificado');

  const fila = await guardados(repo, doc._id, 'modulos/metodologia', 'daw-0485');
  assert.equal(fila.origen, 'modificado', 'es lo que el E5 usará para saber qué se ha revisado');
  const porLaRuta = await (await leer(u.ana, doc._id, 'modulos/metodologia', 'daw-0485')).json();
  assert.equal(porLaRuta.origen, 'modificado');
});

prueba('los campos que no se mandan se quedan como estaban: guardar el texto no se lleva la tabla', async () => {
  const { repo, u, doc } = await escenario();
  const tabla = (await valoresGuardados(repo, doc._id, 'introduccion')).tabla_normativa;
  assert.ok(tabla, 'de partida el apartado tiene una tabla importada al lado del texto');

  const res = await editar(u.jefa, doc._id, 'introduccion', null,
    { texto: [{ type: 'p', text: 'Texto nuevo de la introducción.' }] });
  assert.equal(res.status, 200);

  const valores = await valoresGuardados(repo, doc._id, 'introduccion');
  assert.deepEqual(valores.tabla_normativa, tabla, 'la tabla que todavía no tiene editor no se puede perder así');
  assert.equal(valores.texto[0].text, 'Texto nuevo de la introducción.');
});

prueba('un campo se vacía mandando una lista vacía, y eso no borra los demás', async () => {
  const { repo, u, doc } = await escenario();
  const res = await editar(u.jefa, doc._id, 'introduccion', null, { texto: [] });
  assert.equal(res.status, 200);
  const valores = await valoresGuardados(repo, doc._id, 'introduccion');
  assert.deepEqual(valores.texto, []);
  assert.ok(valores.tabla_normativa);
});

prueba('guardar un apartado no toca ningún otro', async () => {
  const { repo, u, doc } = await escenario();
  const antes = await foto(repo, doc._id);

  const res = await editar(u.ana, doc._id, 'modulos/metodologia', 'daw-0485',
    { texto: [{ type: 'p', text: 'Solo este.' }] });
  assert.equal(res.status, 200);

  const despues = await foto(repo, doc._id);
  assert.deepEqual(diferencias(antes, despues), ['modulos/metodologia|daw-0485'],
    'el mismo apartado de la otra unidad, y los comunes, tienen que quedarse igual');
});

prueba('el mismo apartado de dos unidades son dos apartados distintos', async () => {
  const { repo, u, doc } = await escenario();
  await editar(u.jefa, doc._id, 'modulos/metodologia', 'daw-0485', { texto: [{ type: 'p', text: 'La de Programación.' }] });
  await editar(u.jefa, doc._id, 'modulos/metodologia', 'daw-0484', { texto: [{ type: 'p', text: 'La de Bases de datos.' }] });

  assert.equal((await valoresGuardados(repo, doc._id, 'modulos/metodologia', 'daw-0485')).texto[0].text, 'La de Programación.');
  assert.equal((await valoresGuardados(repo, doc._id, 'modulos/metodologia', 'daw-0484')).texto[0].text, 'La de Bases de datos.');
});

// ================================================================ 3. dos pestañas

prueba('dos pestañas sobre el mismo apartado: la segunda recibe 409 y no escribe', async () => {
  const { repo, u, doc } = await escenario();
  const seccion = 'modulos/metodologia';

  // Las dos pestañas leen el apartado, con la misma versión.
  const pestana1 = await (await leer(u.ana, doc._id, seccion, 'daw-0485')).json();
  const pestana2 = await (await leer(u.ana, doc._id, seccion, 'daw-0485')).json();
  assert.equal(pestana1.updatedAt, pestana2.updatedAt);

  const primera = await guardar(u.ana, doc._id, seccion, 'daw-0485',
    { valores: { texto: [{ type: 'p', text: 'Lo que escribió la primera pestaña.' }] }, esperaUpdatedAt: pestana1.updatedAt });
  assert.equal(primera.status, 200);

  const segunda = await guardar(u.ana, doc._id, seccion, 'daw-0485',
    { valores: { texto: [{ type: 'p', text: 'Lo que escribió la segunda, sin saberlo.' }] }, esperaUpdatedAt: pestana2.updatedAt });

  const error = await esError(segunda, 409, 'conflicto');
  assert.equal(error.esperado, pestana2.updatedAt, 'el 409 dice con qué versión venía');
  assert.equal(error.actual, (await primera.json()).updatedAt, 'y cuál hay guardada ahora');

  const valores = await valoresGuardados(repo, doc._id, seccion, 'daw-0485');
  assert.equal(valores.texto[0].text, 'Lo que escribió la primera pestaña.',
    'lo guardado sigue siendo lo de la primera: la segunda no pisa nada');
});

prueba('tras el 409, la pestaña que recarga guarda con la versión nueva', async () => {
  const { repo, u, doc } = await escenario();
  const seccion = 'atencion-a-la-diversidad';
  const vieja = await (await leer(u.jefa, doc._id, seccion)).json();
  await editar(u.jefa, doc._id, seccion, null, { texto: [{ type: 'p', text: 'Primera.' }] });

  await esError(await guardar(u.jefa, doc._id, seccion, null,
    { valores: { texto: [{ type: 'p', text: 'Con la versión vieja.' }] }, esperaUpdatedAt: vieja.updatedAt }), 409, 'conflicto');

  // Recargar y volver a guardar: eso sí entra.
  const res = await editar(u.jefa, doc._id, seccion, null, { texto: [{ type: 'p', text: 'Segunda, tras recargar.' }] });
  assert.equal(res.status, 200);
  assert.equal((await valoresGuardados(repo, doc._id, seccion)).texto[0].text, 'Segunda, tras recargar.');
});

prueba('creer que un apartado no existía cuando ya existe también es un conflicto', async () => {
  const { repo, u, doc } = await escenario();
  const error = await esError(await guardar(u.jefa, doc._id, 'introduccion', null,
    { valores: { texto: [{ type: 'p', text: 'Encima de lo que hay.' }] }, esperaUpdatedAt: null }), 409, 'conflicto');
  assert.equal(error.esperado, null);
  assert.ok(error.actual, 'y dice qué versión hay guardada');
  assert.equal((await valoresGuardados(repo, doc._id, 'introduccion')).texto[0].text,
    'Esta programación la escribe el departamento de Informática.');
});

prueba('sin «esperaUpdatedAt» no se guarda: 400, porque omitirlo apagaría el control de versiones', async () => {
  const { repo, u, doc } = await escenario();
  const antes = await foto(repo, doc._id);
  await esError(await guardar(u.ana, doc._id, 'modulos/metodologia', 'daw-0485',
    { valores: { texto: [{ type: 'p', text: 'Sin decir desde qué versión.' }] } }), 400, 'peticion');
  assert.deepEqual(diferencias(antes, await foto(repo, doc._id)), []);
});

prueba('un «esperaUpdatedAt» que no es una fecha es un 400, no un 500', async () => {
  const { repo, u, doc } = await escenario();
  const antes = await foto(repo, doc._id);
  for (const espera of ['ayer', '', 0, 1762500000000, {}, []]) {
    await esError(await guardar(u.ana, doc._id, 'modulos/metodologia', 'daw-0485',
      { valores: { texto: [{ type: 'p', text: 'x' }] }, esperaUpdatedAt: espera }), 400, 'peticion');
  }
  assert.deepEqual(diferencias(antes, await foto(repo, doc._id)), []);
});

// ================================================================ 4. quién puede escribir

prueba('un docente escribe el módulo que lleva', async () => {
  const { u, doc } = await escenario();
  assert.equal((await editar(u.ana, doc._id, 'modulos/metodologia', 'daw-0485', { texto: [{ type: 'p', text: 'Mía.' }] })).status, 200);
});

prueba('un docente en un módulo que no lleva: 403, y no se escribe nada', async () => {
  const { repo, u, doc } = await escenario();
  const antes = await foto(repo, doc._id);

  // Ana lleva «Programación», no «Bases de datos»; Luis no lleva ninguno.
  await esError(await editar(u.ana, doc._id, 'modulos/metodologia', 'daw-0484', { texto: [{ type: 'p', text: 'x' }] }), 403, 'sin_permiso');
  await esError(await editar(u.luis, doc._id, 'modulos/metodologia', 'daw-0485', { texto: [{ type: 'p', text: 'x' }] }), 403, 'sin_permiso');

  assert.deepEqual(diferencias(antes, await foto(repo, doc._id)), []);
});

prueba('la jefatura de estudios no escribe nada, ni común ni de módulo: 403', async () => {
  const { repo, u, doc } = await escenario();
  const antes = await foto(repo, doc._id);

  // Lo ve todo —es quien aprueba— y por eso mismo no edita (core/permisos.js).
  const lectura = await (await leer(u.estudios, doc._id, 'introduccion')).json();
  assert.equal(lectura.puedeEditar, false);

  await esError(await editar(u.estudios, doc._id, 'introduccion', null, { texto: [{ type: 'p', text: 'x' }] }), 403, 'sin_permiso');
  await esError(await editar(u.estudios, doc._id, 'modulos/metodologia', 'daw-0485', { texto: [{ type: 'p', text: 'x' }] }), 403, 'sin_permiso');
  await esError(await editar(u.estudios, doc._id, 'atencion-a-la-diversidad', null, { texto: [{ type: 'p', text: 'x' }] }), 403, 'sin_permiso');

  assert.deepEqual(diferencias(antes, await foto(repo, doc._id)), []);
});

prueba('un docente no escribe un apartado común que no se le ha asignado, y sí el que se le asignó', async () => {
  const { u, doc } = await escenario();
  await esError(await editar(u.ana, doc._id, 'atencion-a-la-diversidad', null, { texto: [{ type: 'p', text: 'x' }] }), 403, 'sin_permiso');
  // A Luis se le ha delegado ese apartado.
  assert.equal((await editar(u.luis, doc._id, 'atencion-a-la-diversidad', null, { texto: [{ type: 'p', text: 'Lo escribo yo.' }] })).status, 200);
});

prueba('la jefatura del departamento escribe los comunes y cualquier módulo, lo lleve o no', async () => {
  const { u, doc } = await escenario();
  assert.equal((await editar(u.jefa, doc._id, 'introduccion', null, { texto: [{ type: 'p', text: 'x' }] })).status, 200);
  assert.equal((await editar(u.jefa, doc._id, 'modulos/metodologia', 'daw-0484', { texto: [{ type: 'p', text: 'x' }] })).status, 200);
  assert.equal((await editar(u.admin, doc._id, 'modulos/metodologia', 'daw-0485', { texto: [{ type: 'p', text: 'x' }] })).status, 200);
});

prueba('sin persona identificada: 401 y no se escribe nada', async () => {
  const { repo, u, doc } = await escenario();
  const antes = await foto(repo, doc._id);
  const version = (await (await leer(u.ana, doc._id, 'modulos/metodologia', 'daw-0485')).json()).updatedAt;
  await esError(await guardar(null, doc._id, 'modulos/metodologia', 'daw-0485',
    { valores: { texto: [{ type: 'p', text: 'x' }] }, esperaUpdatedAt: version }), 401, 'sin_identificar');
  assert.deepEqual(diferencias(antes, await foto(repo, doc._id)), []);
});

prueba('un documento de otro departamento: 404 al escribir, igual que al leer', async () => {
  const { repo, u, doc, otro } = await escenario();
  const antes = await foto(repo, doc._id);
  await esError(await guardar(u.pepe, doc._id, 'introduccion', null,
    { valores: { texto: [] }, esperaUpdatedAt: null }), 404, 'no_encontrado');
  await esError(await guardar(u.jefa, otro._id, 'introduccion', null,
    { valores: { texto: [] }, esperaUpdatedAt: null }), 404, 'no_encontrado');
  assert.deepEqual(diferencias(antes, await foto(repo, doc._id)), []);
  assert.deepEqual((await valoresGuardados(repo, otro._id, 'introduccion')).texto, []);
});

prueba('una rama que no es de este documento: 404; un enlace mal construido: 400', async () => {
  const { u, doc } = await escenario();
  const cuerpo = { valores: { texto: [] }, esperaUpdatedAt: null };
  await esError(await guardar(u.jefa, doc._id, 'no-existe', null, cuerpo), 404, 'no_encontrado');
  await esError(await guardar(u.jefa, doc._id, 'modulos/metodologia', 'no-existe', cuerpo), 404, 'no_encontrado');
  // Un apartado de módulo sin decir de qué módulo, y un común diciéndolo.
  await esError(await guardar(u.jefa, doc._id, 'modulos/metodologia', null, cuerpo), 400, 'peticion');
  await esError(await guardar(u.jefa, doc._id, 'introduccion', 'daw-0485', cuerpo), 400, 'peticion');
  await esError(await Apartado.PATCH(pet(`/api/documentos/${doc._id}/apartado`, u.jefa, { metodo: 'PATCH', cuerpo }), { id: doc._id }), 400, 'peticion');
});

prueba('un nodo que solo agrupa y un repetidor no se escriben por aquí: 400 y lo dicen', async () => {
  const { repo, u, doc } = await escenario();
  const antes = await foto(repo, doc._id);
  const cuerpo = { valores: { texto: [{ type: 'p', text: 'x' }] }, esperaUpdatedAt: null };

  const agrupa = await esError(await guardar(u.jefa, doc._id, 'anexos', null, cuerpo), 400, 'peticion');
  assert.ok(agrupa.mensaje.includes('agrupa'), agrupa.mensaje);

  const fichas = await esError(await guardar(u.jefa, doc._id, 'modulos/situaciones-de-aprendizaje/situacion', 'daw-0485', cuerpo), 400, 'peticion');
  assert.ok(fichas.mensaje.includes('fichas'), fichas.mensaje);

  assert.deepEqual(diferencias(antes, await foto(repo, doc._id)), []);
});

prueba('un campo que la plantilla no tiene, o que todavía no tiene editor: 400 y no se escribe nada', async () => {
  const { repo, u, doc } = await escenario();
  const antes = await foto(repo, doc._id);
  const version = await (await leer(u.ana, doc._id, 'modulos/metodologia', 'daw-0485')).json();

  const inventado = await esError(await guardar(u.ana, doc._id, 'modulos/metodologia', 'daw-0485',
    { valores: { inventado: [] }, esperaUpdatedAt: version.updatedAt }), 400, 'peticion');
  assert.equal(inventado.campo, 'inventado');

  // Las ponderaciones tienen su propia forma y su propio editor: es el E4.
  const pond = await (await leer(u.ana, doc._id, 'modulos/ponderaciones', 'daw-0485')).json();
  const noTexto = await esError(await guardar(u.ana, doc._id, 'modulos/ponderaciones', 'daw-0485',
    { valores: { ponderaciones: PONDERACIONES }, esperaUpdatedAt: pond.updatedAt }), 400, 'peticion');
  assert.equal(noTexto.campo, 'ponderaciones');
  assert.ok(noTexto.mensaje.includes('ponderacion_ra_ce'), noTexto.mensaje);

  assert.deepEqual(diferencias(antes, await foto(repo, doc._id)), []);
});

prueba('un cuerpo que no es un objeto JSON, o sin «valores»: 400 y no se escribe nada', async () => {
  const { repo, u, doc } = await escenario();
  const antes = await foto(repo, doc._id);
  const pedir = (cuerpo) => guardar(u.ana, doc._id, 'modulos/metodologia', 'daw-0485', cuerpo);

  await esError(await pedir('esto no es json'), 400, 'peticion');
  await esError(await pedir('[]'), 400, 'peticion');
  await esError(await pedir('null'), 400, 'peticion');
  await esError(await pedir({ esperaUpdatedAt: null }), 400, 'peticion');
  await esError(await pedir({ valores: 'texto', esperaUpdatedAt: null }), 400, 'peticion');
  await esError(await pedir({ valores: [], esperaUpdatedAt: null }), 400, 'peticion');
  await esError(await pedir({ valores: {}, esperaUpdatedAt: null }), 400, 'peticion');

  assert.deepEqual(diferencias(antes, await foto(repo, doc._id)), []);
});

// ================================================================ 5. la batería de basura
//
// Lo que llega de un navegador, no lo que escribiría alguien con buena fe. Cada caso tiene que
// morir en la ruta con un 400, con un motivo que diga QUÉ bloque falla y POR QUÉ, y sin dejar nada
// escrito: ni el campo malo ni ninguno de los buenos.

const BASURA = [
  { nombre: 'un párrafo pegado desde Word, con sus marcas dentro',
    valor: [{ type: 'p', text: '<p class=MsoNormal><span style=\'font-size:11.0pt\'>La nota mínima<o:p></o:p></span></p>' }],
    dice: '<o:p>' },
  { nombre: 'una marca de Word en un elemento de una lista',
    valor: [{ type: 'list', items: [{ text: 'Normal', level: 0 }, { text: 'Pegado<o:p></o:p>', level: 0 }] }],
    dice: '<o:p>' },
  { nombre: 'una propiedad CSS de Word dentro de un tramo con formato',
    valor: [{ type: 'p', text: [{ text: 'La nota ', bold: true }, { text: '<span style="mso-spacerun:yes">mínima</span>' }] }],
    dice: 'mso-spacerun:' },
  { nombre: 'un tipo de bloque que el generador no sabe pintar',
    valor: [{ type: 'tabla', filas: [[{ text: 'x' }]] }],
    dice: 'tipo «tabla»' },
  { nombre: 'un bloque sin tipo',
    valor: [{ text: 'Me he dejado el type.' }],
    dice: 'no dice de qué tipo es' },
  { nombre: 'una lista sin «items»',
    valor: [{ type: 'list' }],
    dice: 'sin «items»' },
  { nombre: 'una lista con «items» que no es una lista',
    valor: [{ type: 'list', items: { 0: { text: 'x' } } }],
    dice: 'sin «items»' },
  { nombre: 'una lista sin ningún elemento',
    valor: [{ type: 'list', items: [] }],
    dice: 'sin ningún elemento' },
  { nombre: 'un «level» que no es un número',
    valor: [{ type: 'list', items: [{ text: 'x', level: '1' }] }],
    dice: 'level' },
  { nombre: 'un «level» que no existe',
    valor: [{ type: 'list', items: [{ text: 'x', level: 99 }] }],
    dice: 'level' },
  { nombre: 'una clave de más en un bloque',
    valor: [{ type: 'p', text: 'Un párrafo.', ul: ['y además una lista de pdfmake'] }],
    dice: '«ul»' },
  { nombre: 'una clave de más en un tramo',
    valor: [{ type: 'p', text: [{ text: 'rojo', color: 'red' }] }],
    dice: '«color»' },
  { nombre: 'una clave de más en un elemento de lista',
    valor: [{ type: 'list', items: [{ text: 'x', level: 0, bullet: '•' }] }],
    dice: '«bullet»' },
  { nombre: 'un bloque que no es un objeto',
    valor: ['Un párrafo suelto, sin envolver'],
    dice: 'no es un objeto' },
  { nombre: 'un bloque nulo',
    valor: [{ type: 'p', text: 'Bien' }, null],
    dice: 'no es un objeto' },
  { nombre: 'un bloque que es una lista',
    valor: [[{ type: 'p', text: 'x' }]],
    dice: 'no es un objeto' },
  { nombre: 'el valor del campo no es una lista de bloques',
    valor: { type: 'p', text: 'Un bloque suelto, sin lista' },
    dice: 'no es una lista' },
  { nombre: 'un párrafo sin «text»',
    valor: [{ type: 'p' }],
    dice: 'sin «text»' },
  { nombre: 'un «text» que es un objeto',
    valor: [{ type: 'p', text: { es: 'Hola', va: 'Hola' } }],
    dice: 'no es texto' },
  { nombre: 'un tramo cuyo «text» no es una cadena',
    valor: [{ type: 'p', text: [{ text: 42 }] }],
    dice: 'no tiene «text»' },
  { nombre: 'una lista de tramos vacía',
    valor: [{ type: 'p', text: [] }],
    dice: 'vacía' },
  { nombre: 'algo profundamente anidado',
    valor: [{ type: 'p', text: [{ text: [{ text: [{ text: [{ text: 'al fondo' }] }] }] }] }],
    dice: 'no tiene «text»' },
  { nombre: 'una lista anidada doscientas veces',
    valor: [{ type: 'p', text: Array.from({ length: 200 }).reduce((x) => [x], 'al fondo') }],
    dice: 'no es un objeto' },
  { nombre: 'una referencia a un texto compartido con texto encima',
    valor: [{ ref: 'c001', type: 'p', text: 'Y además mi propia versión' }],
    dice: 'solo tiene «ref»' },
  { nombre: 'una referencia que no es un id',
    valor: [{ ref: '__proto__' }],
    dice: 'no es el id' },
  { nombre: 'una referencia que es un objeto',
    valor: [{ ref: { cid: 'c001' } }],
    dice: 'no es el id' },
];

for (const caso of BASURA) {
  prueba(`basura rechazada con 400 y sin escribir: ${caso.nombre}`, async () => {
    const { repo, u, doc } = await escenario();
    const antes = await foto(repo, doc._id);
    const version = (await (await leer(u.ana, doc._id, 'modulos/metodologia', 'daw-0485')).json()).updatedAt;

    // Con un campo bueno al lado, para comprobar que tampoco entra el que valía.
    const res = await guardar(u.ana, doc._id, 'modulos/metodologia', 'daw-0485', {
      valores: { texto: caso.valor },
      esperaUpdatedAt: version,
    });

    const error = await esError(res, 400, 'peticion');
    assert.equal(error.campo, 'texto', 'el 400 tiene que decir qué campo falla');
    assert.ok(typeof error.motivo === 'string' && error.motivo.length > 0, 'y por qué');
    assert.ok(error.motivo.includes(caso.dice),
      `el motivo tendría que mencionar «${caso.dice}» y dice: ${error.motivo}`);
    assert.ok(error.mensaje.includes('No se ha guardado nada'), error.mensaje);

    assert.deepEqual(diferencias(antes, await foto(repo, doc._id)), [],
      'una petición rechazada no puede dejar nada escrito');
  });
}

prueba('si un campo de la petición no vale, tampoco entra el que valía', async () => {
  // Dos campos en la misma petición: uno bueno y uno malo. O se guarda todo, o nada.
  const { repo, u, doc } = await escenario();
  const antes = await valoresGuardados(repo, doc._id, 'introduccion');
  const version = (await (await leer(u.jefa, doc._id, 'introduccion')).json()).updatedAt;

  await esError(await guardar(u.jefa, doc._id, 'introduccion', null, {
    valores: {
      texto: [{ type: 'p', text: 'Esto vale.' }],
      tabla_normativa: { filas: 'esto no son filas' },
    },
    esperaUpdatedAt: version,
  }), 400, 'peticion');

  assert.deepEqual(await valoresGuardados(repo, doc._id, 'introduccion'), antes,
    'medio apartado guardado es peor que ninguno: nadie sabría qué mitad es la suya');
});

prueba('después de toda la basura, el documento sigue generando el mismo PDF', async () => {
  // La prueba de que nada de lo anterior se ha colado: el documento sin tocar tiene que seguir
  // dando una definición de pdfmake idéntica a la de antes de intentar escribirle basura.
  const { u, doc } = await escenario();
  const { definicion: antes } = await Pdf.definicionDe(pet(`/api/documentos/${doc._id}/pdf`, u.ana), { id: doc._id });

  for (const caso of BASURA) {
    await editar(u.jefa, doc._id, 'introduccion', null, { texto: caso.valor });
  }

  const { definicion: despues } = await Pdf.definicionDe(pet(`/api/documentos/${doc._id}/pdf`, u.ana), { id: doc._id });
  // La definición entera, normalizada: lo único que varía entre dos llamadas son las funciones de
  // cabecera y pie, y la fecha de generación de la portada, que es la del día en las dos.
  assert.deepEqual(comparable(despues), comparable(antes));
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
    : `\n${total} pruebas de edición de apartados correctas`);
  process.exit(fallos ? 1 : 0);
}

ejecutar();
