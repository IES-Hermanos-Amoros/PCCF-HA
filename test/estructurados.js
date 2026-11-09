// Los campos estructurados: ponderaciones de RA y CE, fichas de situación de aprendizaje y el panel
// de comprobaciones.
//
//   node test/estructurados.js
//
// Sin levantar Next, sin red y sin base de datos: las rutas se llaman directamente con un `Request`
// normal, igual que en test/api.js y test/edicion.js (docs/api.md, primera regla de forma).
//
// QUÉ SE PRUEBA, Y POR QUÉ ESTAS COSAS
//
// Es la mitad de servidor del E4, y tiene dos criterios de aceptación en docs/plan.md §5:
//
//   «Los avisos del panel coinciden uno a uno con los de la cajita roja del PDF.»
//   «Una SA creada en la app sale impresa igual que una importada.»
//
// Los dos se comprueban aquí, y los dos sobre la DEFINICIÓN DE pdfmake y no sobre los bytes del
// PDF, que es la misma decisión de test/ida-y-vuelta.js y de test/edicion.js: `buildDocDefinition`
// es una función pura de { plantilla, datos }, así que si la definición lleva la tabla, el PDF la
// imprime; y cuando algo falla, la definición dice qué nodo cambió mientras que dos PDF distintos
// solo dicen que son distintos. Comparar bytes sería además imposible: la portada lleva la fecha.
//
// Y luego lo de siempre, que es lo que de verdad protege el documento: que la basura muere en la
// ruta con un 400 y SIN DEJAR NADA ESCRITO, que quien no puede escribir no escribe, y que lo que se
// calcula no se puede guardar a mano.
//
// EL ARNÉS ES EL DE test/edicion.js
//
// Copiado y no importado, a propósito: una prueba que depende de otra prueba se rompe cuando alguien
// toca la otra, y lo que se comparte de verdad —sembrar, identificarse, comparar definiciones— son
// treinta líneas. Cada prueba monta su propio almacén, porque todas escriben.

'use strict';

const assert = require('assert/strict');

const { crearRepositorio } = require('../repositorio');
const memoria = require('../repositorio/memoria');
const Sa = require('../core/sa');
const Val = require('../core/validaciones');
const Est = require('../core/estructurados');
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
const Validaciones = require('../app/_lib/rutas/validaciones');
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

// Leer el apartado y guardarlo de una vez, que es lo que hace el cliente.
async function editar(persona, id, seccion, unidad, valores) {
  const antes = await (await leer(persona, id, seccion, unidad)).json();
  return guardar(persona, id, seccion, unidad, { valores, esperaUpdatedAt: antes.updatedAt });
}

const panelDe = (persona, id) => Validaciones.GET(
  pet(`/api/documentos/${id}/validaciones`, persona), { id },
);

const valoresGuardados = async (repo, id, seccion, unidad = null) => {
  const fila = await repo.apartados.leer(id, seccion, unidad);
  return fila ? fila.valores : null;
};

// Una foto de todos los apartados, para comprobar que una petición rechazada no toca ninguno.
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

// La misma normalización de test/ida-y-vuelta.js y de test/edicion.js: las funciones de cabecera y
// pie son cierres nuevos en cada llamada y `deepStrictEqual` las compara por referencia. Se
// reconstruyen objetos en lugar de pasar por JSON para no perder las claves con valor `undefined`
// (`colSpan`, `rowSpan`), que son justo el tipo de diferencia que esto busca.
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

// La definición del tomo, o la de un módulo suelto: la misma ruta del PDF con `?unidad=`. Las
// pruebas que miran fichas piden el módulo, porque los once módulos de un tomo numeran sus
// situaciones de aprendizaje desde 1 y una búsqueda por todo el documento encontraría varias.
const definicion = async (persona, id, unidad) => {
  const camino = `/api/documentos/${id}/pdf${unidad ? `?unidad=${encodeURIComponent(unidad)}` : ''}`;
  const { definicion: d, fallo } = await Pdf.definicionDe(pet(camino, persona), { id });
  assert.ok(!fallo, 'el PDF se tiene que poder generar');
  return d;
};

// Las cajitas rojas de «Comprobaciones automáticas», en el orden del tomo. Es exactamente el nodo
// que monta `buildDocDefinition` por cada instancia que haya disparado algún aviso.
const cajitas = (d) => nodos(d)
  .filter((n) => n.table && n.table.body && n.table.body[0] && n.table.body[0][0]
    && n.table.body[0][0].stack && n.table.body[0][0].stack[0]
    && n.table.body[0][0].stack[0].text === 'Comprobaciones automáticas')
  .map((n) => n.table.body[0][0].stack[1].ul);

// Las tablas de ficha de SA impresas, en orden: la primera celda la nombra.
const tablasDeFicha = (d) => nodos(d).filter((n) => n.table && n.table.body && n.table.body[0]
  && typeof n.table.body[0][0].text === 'string'
  && n.table.body[0][0].text.indexOf('Situación de aprendizaje') === 0);

// La tabla resumen calculada: la que lleva la cabecera «Ev.».
const resumenImpreso = (d) => nodos(d).find((n) => n.table && n.table.body && n.table.body[0]
  && n.table.body[0][0] && n.table.body[0][0].text === 'Ev.');

const textosDe = (nodo) => JSON.stringify(nodo);

// ================================================================ el documento sintético
//
// Pequeño, pero con todas las formas que importan aquí: la tabla de RA y CE del módulo (de la que
// salen los RA contra los que se comprueba todo), dos apartados de ponderaciones —uno que cuadra
// salvo por el otro convenio y otro con un descuadre de verdad y la suma mal—, un repetidor de
// fichas y un campo de fichas en el apartado padre, que es donde el documento real deja las cinco
// fichas del módulo que no lleva el encabezado dentro.

const campoTexto = { id: 'texto', tipo: 'texto_largo', etiqueta: 'Texto' };
const c = (text, opts) => Object.assign({ text, colspan: 1, rowspan: 1, bold: false }, opts);

const RA_CE = {
  ra: [
    { num: 1, texto: 'Reconoce las características de los lenguajes de marcas.', ce: [
      { letra: 'a', texto: 'Se han identificado las etiquetas.' },
      { letra: 'b', texto: 'Se ha reconocido la jerarquía del documento.' },
    ] },
    { num: 2, texto: 'Valida documentos contra un esquema.', ce: [
      { letra: 'a', texto: 'Se ha validado con un esquema.' },
    ] },
  ],
};

// Cuadra salvo el RA2, cuyos criterios suman 100 % dentro del RA: el OTRO CONVENIO, que es el caso
// que el panel tiene que distinguir de una errata. Los RA suman 100 %.
const PONDERACIONES_CONVENIO = [
  { ra: 1, texto: 'Reconoce las características de los lenguajes de marcas.', ponderacion: 60, ce: [
    { letra: 'a', texto: 'Se han identificado las etiquetas.', ponderacion: 30, fundamental: true },
    { letra: 'b', texto: 'Se ha reconocido la jerarquía.', ponderacion: 30, fundamental: false },
  ] },
  { ra: 2, texto: 'Valida documentos contra un esquema.', ponderacion: 40, ce: [
    { letra: 'a', texto: 'Se ha validado con un esquema.', ponderacion: 100, fundamental: false },
  ] },
];

// Un descuadre de verdad (14,94 % donde debería haber 15 %, como los diez del documento real) y la
// suma de los RA mal: 45 % en lugar de 100 %.
const PONDERACIONES_MAL = [
  { ra: 1, texto: 'Reconoce las características de los lenguajes de marcas.', ponderacion: 15, ce: [
    { letra: 'a', texto: 'Se han identificado las etiquetas.', ponderacion: 4.98, fundamental: false },
    { letra: 'b', texto: 'Se ha reconocido la jerarquía.', ponderacion: 4.98, fundamental: false },
    { letra: 'c', texto: 'Se han usado las entidades.', ponderacion: 4.98, fundamental: false },
  ] },
  { ra: 2, texto: 'Valida documentos contra un esquema.', ponderacion: 30, ce: [
    { letra: 'a', texto: 'Se ha validado con un esquema.', ponderacion: 30, fundamental: false },
  ] },
];

// Una ficha tal como la trae el Word, con la MAQUETACIÓN MAYORITARIA del documento real: tres
// etiquetas de actividades en una fila y dos en la siguiente. Es la de scripts/test-ficha-sa.js sin
// las viñetas del procesador de textos, que el importador quita al leer: con ellas dentro la
// comparación del criterio de aceptación mediría eso y no lo que tiene que medir.
const FILAS_FICHA = [
  [c('Situación de aprendizaje 1', { rowspan: 2, bold: true }), c('Introducción a los lenguajes de marcas', { rowspan: 2, bold: true }), c('Sesiones', { bold: true }), c('10', { bold: true })],
  [c('Evaluación', { bold: true }), c('1ª', { bold: true })],
  [c('Resultado(s) de aprendizaje', { bold: true }), c('RA1 Reconoce las características de los lenguajes de marcas.', { colspan: 3 })],
  [c('Criterios de evaluación', { colspan: 4, bold: true })],
  [c('RA1.a. Se han identificado las etiquetas.\nRA1.b. Se ha reconocido la jerarquía.', { colspan: 4 })],
  [c('Competencias profesionales para la empleabilidad', { colspan: 4, bold: true })],
  [c('h) Desarrollar interfaces gráficos de usuario.', { colspan: 4 })],
  [c('Objetivos de aprendizaje', { colspan: 4, bold: true })],
  [c('a) Ajustar la configuración lógica del sistema.', { colspan: 4 })],
  [c('Tipificación de actividades formativas', { colspan: 4, bold: true })],
  [c('Introducción', { colspan: 2, bold: true }), c('Formativas no evaluables', { bold: true }), c('Formativas evaluables', { bold: true })],
  [c('Test de iniciación al módulo.', { colspan: 2 }), c('Debates sobre la importancia de los datos.'), c('Actividades prácticas guiadas.')],
  [c('Actividades de refuerzo', { colspan: 2, bold: true }), c('Actividades de ampliación', { colspan: 2, bold: true })],
  [c('Videotutoriales.', { colspan: 2 }), c('Desarrollo de un documento propio.', { colspan: 2 })],
  [c('Actividades de recuperación', { colspan: 4, bold: true })],
  [c('Prueba escrita de los contenidos mínimos.', { colspan: 4 })],
  [c('Materiales y recursos didácticos disponibles', { colspan: 4, bold: true })],
  [c('Apuntes del profesorado.\nAules.', { colspan: 4 })],
];

// Lo que deja el importador: la tabla tal cual MÁS el modelo con campos con nombre
// (`valorTabla` de motor/importar-docx.js es `{ ...base, ...parseFichaSA(t) }`).
const fichaImportada = () => Object.assign({ filas: FILAS_FICHA }, Sa.fichaDeFilas(FILAS_FICHA));

// Una ficha más, para tener lista que ordenar.
function fichaDeLaApp(num, titulo, { evaluacion = '2ª', ra = [2], sesiones = 8 } = {}) {
  const f = Sa.fichaVacia(num, evaluacion);
  f.titulo = titulo;
  f.sesiones = sesiones;
  f.raTexto = ra.map((n) => `RA${n}. Valida documentos contra un esquema.`).join('\n');
  f.ra = ra.slice();
  f.ce = [`RA${ra[0]}.a. Se ha validado con un esquema.`];
  f.recursos = ['Apuntes del módulo.'];
  return f;
}

const PLANTILLA = {
  tipo: 'programacion_didactica',
  origen: 'PD_sintetica.docx',
  version: null,
  generada: '2026-01-01T00:00:00.000Z',
  secciones: [
    { id: 'introduccion', titulo: 'Introducción', nivel: 1, edita: 'jefe_departamento', presencia: 1,
      campos: [campoTexto], hijos: [] },
    { id: 'modulos', titulo: 'Módulos', nivel: 1, instancias: true, etiqueta_instancia: 'módulo',
      grupos: ['Módulos del primer curso'], edita: 'docentes_del_modulo', presencia: 2, campos: [],
      hijos: [
        { id: 'modulos/ra-ce', titulo: 'Resultados de aprendizaje y criterios de evaluación',
          nivel: 3, presencia: 2,
          campos: [{ id: 'ra_ce', tipo: 'auto.tabla_ra_ce', etiqueta: 'Resultados de aprendizaje y criterios de evaluación' }],
          hijos: [] },
        { id: 'modulos/ponderaciones', titulo: 'Ponderaciones', nivel: 3, presencia: 2,
          campos: [campoTexto, { id: 'ponderaciones', tipo: 'ponderacion_ra_ce', etiqueta: 'Ponderaciones de RA y CE', multiple: true }],
          hijos: [] },
        { id: 'modulos/situaciones-de-aprendizaje', titulo: 'Situaciones de aprendizaje', nivel: 3,
          presencia: 2,
          campos: [
            { id: 'resumen_situaciones', tipo: 'derivado.resumen_situaciones', etiqueta: 'Resumen de situaciones de aprendizaje', derivado: true },
            { id: 'ficha', tipo: 'ficha_situacion_aprendizaje', etiqueta: 'Ficha de situación de aprendizaje', multiple: true },
          ],
          hijos: [
            { id: 'modulos/situaciones-de-aprendizaje/situacion', titulo: 'Situación de aprendizaje',
              nivel: 4, repetidor: true, presencia: 2,
              campos: [
                { id: 'titulo', tipo: 'texto', etiqueta: 'Título' },
                { id: 'ficha', tipo: 'ficha_situacion_aprendizaje', etiqueta: 'Ficha de situación de aprendizaje', multiple: true },
                campoTexto,
              ],
              hijos: [] },
          ] },
      ] },
  ],
};

const SEC_RA_CE = 'modulos/ra-ce';
const SEC_POND = 'modulos/ponderaciones';
const SEC_SA = 'modulos/situaciones-de-aprendizaje';
const SEC_ITEMS = 'modulos/situaciones-de-aprendizaje/situacion';
const PROG = 'daw-0485';
const BBDD = 'daw-0484';

const IDS = { 'Programación': PROG, 'Bases de datos': BBDD };
const OPCIONES = {
  curso: '2026-27', ciclo: 'daw', departamento: 'informatica',
  conciliar: (titulo) => IDS[titulo],
};

const datosDe = (u) => ({
  departamento: 'informatica',
  documento: { introduccion: { texto: [{ type: 'p', text: 'La escribe el departamento.' }] } },
  instancias: [
    { titulo: 'Programación', num: '0485', grupo: 'Módulos del primer curso', docentes: [u.ana._id],
      valores: {
        [SEC_RA_CE]: { ra_ce: RA_CE },
        [SEC_POND]: { ponderaciones: PONDERACIONES_CONVENIO },
        // Una sola ficha, importada: la que el criterio de aceptación compara con la montada.
        [SEC_ITEMS]: { items: [{ titulo: 'Introducción a los lenguajes de marcas', ficha: [fichaImportada()] }] },
      } },
    // Sin docentes: es la unidad del aviso `sin_docente` y la del 403 de un docente que no la lleva.
    { titulo: 'Bases de datos', num: '0484', grupo: 'Módulos del primer curso', docentes: [],
      valores: {
        [SEC_RA_CE]: { ra_ce: RA_CE },
        [SEC_POND]: { ponderaciones: PONDERACIONES_MAL },
        [SEC_ITEMS]: { items: [
          { titulo: 'El modelo relacional', ficha: [fichaDeLaApp(1, 'El modelo relacional', { ra: [1], evaluacion: '1ª' })] },
          { titulo: 'Consultas SQL', ficha: [fichaDeLaApp(2, 'Consultas SQL', { ra: [2] })] },
        ] },
      } },
  ],
  asignaciones: {},
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

async function escenario() {
  const repo = nuevoAlmacen();
  const persona = async (nombre, email, rol, departamento) => {
    const p = await repo.usuarios.crear({ nombre, email, rol, departamento });
    const { testigo } = await abrirSesion(repo, p._id);
    TESTIGOS.set(p._id, testigo);
    return p;
  };

  const u = {
    jefa: await persona('Jefatura del departamento', 'jefatura@ejemplo.invalid', 'jefe_departamento', 'informatica'),
    ana: await persona('Ana', 'ana@ejemplo.invalid', 'docente', 'informatica'),
    estudios: await persona('Jefatura de estudios', 'estudios@ejemplo.invalid', 'jefe_estudios', 'direccion'),
    pepe: await persona('Pepe', 'pepe@ejemplo.invalid', 'docente', 'matematicas'),
  };

  const doc = await sembrar(repo, aFilas({ plantilla: PLANTILLA, datos: datosDe(u) }, OPCIONES));
  const otro = await sembrar(repo, aFilas({
    plantilla: PLANTILLA_OTRA,
    datos: { departamento: 'matematicas', documento: { introduccion: { texto: [] } }, instancias: [], asignaciones: {}, compartidos: {} },
  }, { curso: '2026-27', departamento: 'matematicas' }));

  return { repo, u, doc, otro };
}

// Las fichas de un apartado repetidor, en forma de lista, y la vuelta: es lo que hace el cliente
// (app/_componentes/sa-cliente.js) antes y después de cada operación de core/sa.js.
const listaDeItems = (items) => items.map((it) => Object.assign({}, it.ficha[0], { titulo: it.titulo }));
const itemsDeLista = (lista) => lista.map((f) => ({ titulo: f.titulo || '', ficha: [f] }));

async function fichasDelRepetidor(persona, id, unidad) {
  const apartado = await (await leer(persona, id, SEC_ITEMS, unidad)).json();
  return { lista: listaDeItems(apartado.valores.items), updatedAt: apartado.updatedAt };
}

const guardarLista = (persona, id, unidad, lista, updatedAt) => guardar(
  persona, id, SEC_ITEMS, unidad, { valores: { items: itemsDeLista(lista) }, esperaUpdatedAt: updatedAt },
);

// ================================================================ 1. las puertas, en seco
// core/estructurados.js por sí solo: qué acepta y qué rechaza, y con qué motivo. Está aquí y no en
// test/core.js porque es la pieza de este evolutivo y cuando falle es esto lo que hay que mirar.

prueba('la puerta de la rejilla acepta los tres fondos y rechaza el resto con el motivo', () => {
  const rejilla = (celda) => ({ filas: [[celda]] });
  const motivo = (celda) => Est.motivoDeRejilla(rejilla(celda), 'la tabla');
  for (const fondo of ['cabecera', 'etiqueta', 'ninguno']) {
    assert.equal(motivo({ text: 'a', fondo }), null, `«${fondo}» debería valer`);
    assert.equal(motivo({ text: 'a', bold: true, fondo }), null);
  }
  assert.equal(motivo({ text: 'a' }), null, 'sin fondo vale: es lo que tiene todo lo importado');

  const inventado = motivo({ text: 'a', fondo: 'rojo' });
  assert.ok(/fondo/.test(inventado) && /«cabecera»/.test(inventado) && /«etiqueta»/.test(inventado) && /«ninguno»/.test(inventado), inventado);
  for (const mal of [null, 123, true, '', '#D9E2F3', 'Cabecera', ['cabecera']]) {
    assert.ok(/fondo/.test(motivo({ text: 'a', fondo: mal }) || ''), `fondo ${JSON.stringify(mal)} debería rechazarse`);
  }
  // Las demás claves siguen sin existir.
  assert.ok(/no existe en una celda/.test(motivo({ text: 'a', color: 'red' })));
  assert.ok(/no existe en una celda/.test(motivo({ text: 'a', fondo: 'etiqueta', fillColor: '#fff' })));
});

prueba('la puerta de las ponderaciones acepta lo que produce el importador', () => {
  assert.equal(Est.motivoPonderaciones(PONDERACIONES_CONVENIO, { raModulo: [1, 2] }), null);
  assert.equal(Est.motivoPonderaciones(PONDERACIONES_MAL, { raModulo: [1, 2] }), null);
  // Sin lista de RA no se comprueba la pertenencia: es lo que pasa en un apartado común, donde no
  // hay módulo contra el que comprobar.
  assert.equal(Est.motivoPonderaciones(PONDERACIONES_CONVENIO, {}), null);
  // Un descuadre NO es un motivo para no guardar: se guarda y el panel avisa. Lo que no se guarda
  // es lo que el documento no sabría imprimir.
  assert.equal(Est.motivoPonderaciones([{ ra: 1, texto: 'x', ponderacion: 10, ce: [] }], { raModulo: [1] }), null,
    'un RA sin criterios se guarda: el aviso lo da el panel, no la puerta');
});

prueba('la puerta de las ponderaciones dice qué parte falla', () => {
  const malo = (valor, dice) => {
    const motivo = Est.motivoPonderaciones(valor, { raModulo: [1, 2] });
    assert.ok(motivo, `esto tenía que fallar: ${JSON.stringify(valor)}`);
    assert.ok(motivo.includes(dice), `${motivo}\n   (se esperaba que dijera «${dice}»)`);
  };
  const tabla = (extra) => [Object.assign({ ra: 1, texto: 'x', ponderacion: 10, ce: [{ letra: 'a', texto: 'y', ponderacion: 10, fundamental: false }] }, extra)];

  malo({ ra: 1 }, 'no es una lista');
  malo([], 'vacía');
  malo(['x'], 'no es una tabla de ponderaciones');
  malo(tabla({ ra: null }), 'no dice de qué resultado de aprendizaje es');
  malo(tabla({ ra: 9 }), 'RA9');
  malo(tabla({ ponderacion: '10 %' }), 'no es un porcentaje');
  malo(tabla({ ponderacion: 140 }), 'no es un porcentaje');
  malo(tabla({ ponderacion: null }), 'no es un porcentaje');
  malo(tabla({ ce: 'a) 10' }), 'no son una lista');
  malo(tabla({ ce: [{ letra: 'a', texto: 'y', ponderacion: '5' }] }), 'no es un porcentaje');
  malo(tabla({ ce: [{ letra: 'A', texto: 'y', ponderacion: 5 }] }), 'letra');
  malo(tabla({ ce: [{ letra: 'a', texto: 'y', ponderacion: 5 }, { letra: 'a', texto: 'z', ponderacion: 5 }] }), 'dos criterios «a»');
  malo(tabla({ ce: [{ letra: 'a', texto: 'y', ponderacion: 5, estrella: true }] }), '«estrella»');
  malo(tabla({ color: 'rojo' }), '«color»');
  malo(tabla({ filas: [[c('Resultado de aprendizaje (0485.1)')]] }), '«filas»');
  malo([tabla()[0], tabla()[0]], 'dos tablas del RA1');
});

prueba('la puerta de las fichas acepta la importada y la creada en la aplicación', () => {
  assert.equal(Est.motivoFicha(fichaImportada()), null);
  assert.equal(Est.motivoFicha(Sa.fichaDeFilas(FILAS_FICHA)), null, 'la misma, sin tabla importada');
  assert.equal(Est.motivoFicha(Sa.fichaVacia(1, '1ª')), null, 'una ficha nueva, con todo vacío');
  assert.equal(Est.motivoFichas([fichaImportada()]), null);
});

prueba('la puerta de las fichas dice qué parte falla', () => {
  const malo = (ficha, dice) => {
    const motivo = Est.motivoFicha(ficha);
    assert.ok(motivo, `esto tenía que fallar: ${JSON.stringify(ficha)}`);
    assert.ok(motivo.includes(dice), `${motivo}\n   (se esperaba que dijera «${dice}»)`);
  };
  const base = (extra) => Object.assign(Sa.fichaVacia(1, '1ª'), extra);

  malo({}, 'no trae ningún campo');
  malo({ titulo: 'Solo el título' }, 'no trae ningún campo');
  malo('una ficha', 'no es un objeto');
  malo(base({ inventado: [] }), '«inventado»');
  malo(base({ num: 'dos' }), 'número');
  malo(base({ sesiones: '8 sesiones' }), 'sesiones');
  malo(base({ sesiones: -1 }), 'sesiones');
  malo(base({ evaluacion: 1 }), 'evaluación');
  malo(base({ ra: 2 }), 'no son una lista');
  malo(base({ ra: [2, 2] }), 'repite el RA2');
  malo(base({ ra: [0] }), 'no es el número de un RA');
  malo(base({ ce: 'RA1.a. Algo.' }), 'no es una lista de líneas');
  malo(base({ ce: [{ letra: 'a' }] }), 'no es texto');
  malo(base({ ce: ['Una.\nDos.'] }), 'salto de línea');
  malo(base({ recursos: ['Pegado<o:p></o:p>'] }), 'procesador de textos');
  malo(base({ filas: 'una tabla' }), 'no es una lista de filas');
  malo(base({ filas: [[{ text: 'x', estilo: 'raro' }]] }), '«estilo»');
  malo(base({ filas: [[{ colspan: 2 }]] }), 'no tiene «text»');
});

prueba('la puerta del repetidor exige la lista entera y una ficha por sitio', () => {
  const campos = [
    { id: 'titulo', tipo: 'texto' },
    { id: 'ficha', tipo: 'ficha_situacion_aprendizaje', multiple: true },
    campoTexto,
  ];
  const bien = { items: [{ titulo: 'Una', ficha: [Sa.fichaVacia(1, '1ª')] }] };
  assert.equal(Est.motivoItems(bien, campos), null);
  assert.equal(Est.motivoItems({ items: [] }, campos), null, 'la lista vacía es como se borra la última');

  const malo = (valor, dice) => {
    const motivo = Est.motivoItems(valor, campos);
    assert.ok(motivo, `esto tenía que fallar: ${JSON.stringify(valor)}`);
    assert.ok(motivo.includes(dice), `${motivo}\n   (se esperaba que dijera «${dice}»)`);
  };
  malo({ ficha: [Sa.fichaVacia(1)] }, 'la lista entera');
  malo({ items: {} }, 'una lista');
  malo({ items: [{ titulo: 'Una' }] }, 'no trae su ficha');
  malo({ items: [{ ficha: [Sa.fichaVacia(1, '1ª')] }] }, 'no tiene título');
  malo({ items: [{ titulo: 'Una', ficha: Sa.fichaVacia(1, '1ª') }] }, 'dentro de una lista');
  malo({ items: [{ titulo: 'Una', ficha: [Sa.fichaVacia(1, '1ª')], color: 'rojo' }] }, '«color»');
  malo({ items: [{ titulo: 'Una', ficha: [Sa.fichaVacia(1, '1ª')], texto: [{ type: 'tabla' }] }] }, 'tipo «tabla»');
});

prueba('renumerar suelta la tabla importada, salvo si es lo único que tiene la ficha', () => {
  // Con cuerpo: se le cambia el número y la tabla se vuelve a montar desde los campos.
  const con = Object.assign({ filas: FILAS_FICHA }, Sa.fichaVacia(5, '1ª'));
  const salida = Est.renumerarItems([{ titulo: 'a', ficha: [con] }]);
  assert.equal(salida[0].ficha[0].num, 1);
  assert.equal(salida[0].ficha[0].filas, undefined);

  // Sin cuerpo —solo la rejilla, que es lo que queda cuando el importador no sabe leer la ficha—
  // se conserva: una tabla que dice «3» siendo la 4 se nota; una ficha que desaparece del PDF, no.
  const cruda = { filas: [[c('Situación de aprendizaje 3', { bold: true })]] };
  const otra = Est.renumerarItems([{ titulo: 'a', ficha: [cruda] }]);
  assert.equal(otra[0].ficha[0].num, 1);
  assert.deepEqual(otra[0].ficha[0].filas, cruda.filas);

  // Y la que no cambia de número no se toca: reescribir las once fichas de un módulo por haber
  // movido una sería cambiar el documento por la espalda.
  const quieta = Est.renumerarItems([{ titulo: 'a', ficha: [fichaImportada()] }]);
  assert.deepEqual(quieta[0].ficha[0].filas, FILAS_FICHA);
});

prueba('las tablas derivadas y los tipos sin editor no pasan por ninguna puerta', () => {
  const resumen = Est.motivoDeCampo({ id: 'resumen_situaciones', tipo: 'derivado.resumen_situaciones' }, { filas: [] });
  assert.ok(resumen.includes('se calcula'), resumen);
  const rejilla = Est.motivoDeCampo({ id: 'ra_ce', tipo: 'auto.tabla_ra_ce' }, { ra: [] });
  assert.ok(rejilla.includes('todavía no tiene editor'), rejilla);
  assert.equal(Est.seGuarda({ tipo: 'ponderacion_ra_ce' }), true);
  assert.equal(Est.seGuarda({ tipo: 'derivado.resumen_situaciones' }), false);
});

prueba('la suma en vivo es la misma cuenta que imprime el PDF', () => {
  const s = Est.sumas(PONDERACIONES_MAL);
  assert.equal(s.sumaRa, 45);
  assert.equal(s.cuadraRa, false);
  assert.deepEqual(s.ra.map((r) => [r.ra, r.peso, Number(r.sumaCe.toFixed(2))]), [[1, 15, 14.94], [2, 30, 30]]);
  assert.equal(Est.sumas(PONDERACIONES_CONVENIO).cuadraRa, true);
});

// ================================================================ 2. ponderaciones por la API

prueba('guardar unas ponderaciones y volver a leerlas: lo mismo que se mandó', async () => {
  const { repo, u, doc } = await escenario();
  const nuevas = [
    { ra: 1, texto: 'Reconoce las características.', ponderacion: 70, ce: [
      { letra: 'a', texto: 'Se han identificado las etiquetas.', ponderacion: 50, fundamental: true },
      { letra: 'b', texto: 'Se ha reconocido la jerarquía.', ponderacion: 20, fundamental: false },
    ] },
    { ra: 2, texto: 'Valida documentos.', ponderacion: 30, ce: [
      { letra: 'a', texto: 'Se ha validado con un esquema.', ponderacion: 30, fundamental: false },
    ] },
  ];

  const res = await editar(u.ana, doc._id, SEC_POND, PROG, { ponderaciones: nuevas });
  assert.equal(res.status, 200);
  const cuerpo = await res.json();
  assert.deepEqual(cuerpo.valores.ponderaciones, nuevas);
  assert.equal(cuerpo.origen, 'modificado', 'quien reescribe un apartado lo deja en «modificado»');

  const vuelta = await (await leer(u.ana, doc._id, SEC_POND, PROG)).json();
  assert.deepEqual(vuelta.valores.ponderaciones, nuevas);
  assert.deepEqual(await valoresGuardados(repo, doc._id, SEC_POND, PROG), { ponderaciones: nuevas });

  // Y sale en el PDF con sus cifras, que es para lo que se guardaba.
  const impreso = textosDe(await definicion(u.ana, doc._id, PROG));
  assert.ok(impreso.includes('Suma de las ponderaciones de los RA: 100 %'), 'falta la suma en vivo del PDF');
  assert.ok(impreso.includes('50 %') && impreso.includes('20 %'), 'faltan los pesos nuevos');
});

prueba('las ponderaciones guardadas no pierden la tabla importada, que el Word necesita', async () => {
  // De la primera celda de `filas` saca el exportador a Word el código del módulo
  // («Resultado de aprendizaje (0485.1)»), que el modelo no guarda. El cliente no la manda —la
  // puerta la rechaza— y el servidor la conserva, emparejada por RA.
  const { repo, u, doc } = await escenario();
  const conFilas = PONDERACIONES_CONVENIO.map((t) => Object.assign({}, t, {
    filas: [[c(`Resultado de aprendizaje (0485.${t.ra})`, { bold: true })]],
  }));
  await repo.apartados.escribir(doc._id, SEC_POND, PROG, { valores: { ponderaciones: conFilas } }, {});

  const antes = await (await leer(u.ana, doc._id, SEC_POND, PROG)).json();
  const tocadas = PONDERACIONES_CONVENIO.map((t) => Object.assign({}, t, { ponderacion: t.ra === 1 ? 50 : 50 }));
  const res = await guardar(u.ana, doc._id, SEC_POND, PROG, { valores: { ponderaciones: tocadas }, esperaUpdatedAt: antes.updatedAt });
  assert.equal(res.status, 200);

  const guardadas = (await valoresGuardados(repo, doc._id, SEC_POND, PROG)).ponderaciones;
  assert.deepEqual(guardadas.map((t) => t.ponderacion), [50, 50], 'los pesos son los nuevos');
  assert.deepEqual(guardadas.map((t) => t.filas[0][0].text),
    ['Resultado de aprendizaje (0485.1)', 'Resultado de aprendizaje (0485.2)'],
    'y la tabla importada sigue en su sitio, con el código del módulo');
});

// ================================================================ 3. fichas: crear, ordenar, borrar

prueba('crear una ficha: se añade al final, numerada, y sale en el PDF', async () => {
  const { repo, u, doc } = await escenario();
  const { lista, updatedAt } = await fichasDelRepetidor(u.ana, doc._id, PROG);
  assert.equal(lista.length, 1);

  const { lista: conNueva, num } = Sa.anadirVacia(lista, '2ª');
  assert.equal(num, 2);
  const res = await guardarLista(u.ana, doc._id, PROG, conNueva, updatedAt);
  assert.equal(res.status, 200);

  const guardados = await valoresGuardados(repo, doc._id, SEC_ITEMS, PROG);
  assert.deepEqual(guardados.items.map((it) => it.ficha[0].num), [1, 2]);
  assert.deepEqual(guardados.items.map((it) => it.titulo),
    ['Introducción a los lenguajes de marcas', 'Situación de aprendizaje 2']);
  assert.ok(Array.isArray(guardados.items[0].ficha[0].filas) && guardados.items[0].ficha[0].filas.length,
    'la que no se ha tocado conserva su tabla importada');

  const impresas = tablasDeFicha(await definicion(u.ana, doc._id, PROG));
  const titulos = impresas.map((t) => t.table.body[0][0].text);
  assert.ok(titulos.includes('Situación de aprendizaje 2'), `no está la nueva: ${titulos.join(' · ')}`);
});

prueba('duplicar, mover y borrar: la numeración queda bien y el PDF la imprime en orden', async () => {
  const { repo, u, doc } = await escenario();

  // Tres fichas para tener algo que ordenar.
  let { lista, updatedAt } = await fichasDelRepetidor(u.ana, doc._id, PROG);
  lista = lista.concat([fichaDeLaApp(2, 'Validación con esquemas'), fichaDeLaApp(3, 'Transformaciones', { ra: [1] })]);
  assert.equal((await guardarLista(u.ana, doc._id, PROG, lista, updatedAt)).status, 200);

  // Duplicar la 2: la copia se queda detrás y la antigua 3 pasa a ser la 4.
  ({ lista, updatedAt } = await fichasDelRepetidor(u.ana, doc._id, PROG));
  const dup = Sa.duplicarEn(lista, 2);
  assert.equal(dup.num, 3);
  assert.equal((await guardarLista(u.ana, doc._id, PROG, dup.lista, updatedAt)).status, 200);
  let guardados = await valoresGuardados(repo, doc._id, SEC_ITEMS, PROG);
  assert.deepEqual(guardados.items.map((it) => it.ficha[0].num), [1, 2, 3, 4],
    'la numeración se arregla al guardar, aunque el cliente no renumere');
  assert.deepEqual(guardados.items.map((it) => it.titulo), [
    'Introducción a los lenguajes de marcas', 'Validación con esquemas',
    'Validación con esquemas (copia)', 'Transformaciones',
  ]);

  // Mover la 4 una posición arriba.
  ({ lista, updatedAt } = await fichasDelRepetidor(u.ana, doc._id, PROG));
  const mov = Sa.moverEn(lista, 4, -1);
  assert.equal(mov.num, 3);
  assert.equal((await guardarLista(u.ana, doc._id, PROG, mov.lista, updatedAt)).status, 200);
  guardados = await valoresGuardados(repo, doc._id, SEC_ITEMS, PROG);
  assert.deepEqual(guardados.items.map((it) => [it.ficha[0].num, it.titulo]), [
    [1, 'Introducción a los lenguajes de marcas'], [2, 'Validación con esquemas'],
    [3, 'Transformaciones'], [4, 'Validación con esquemas (copia)'],
  ]);

  // Y borrar la primera: la importada se va y las demás se renumeran desde 1.
  ({ lista, updatedAt } = await fichasDelRepetidor(u.ana, doc._id, PROG));
  assert.equal((await guardarLista(u.ana, doc._id, PROG, Sa.borrarDe(lista, 1), updatedAt)).status, 200);
  guardados = await valoresGuardados(repo, doc._id, SEC_ITEMS, PROG);
  assert.deepEqual(guardados.items.map((it) => [it.ficha[0].num, it.titulo]), [
    [1, 'Validación con esquemas'], [2, 'Transformaciones'], [3, 'Validación con esquemas (copia)'],
  ]);

  // El PDF las imprime con esos números y en ese orden, que es lo que de verdad se comprobaba.
  const impresas = tablasDeFicha(await definicion(u.ana, doc._id, PROG))
    .map((t) => t.table.body[0][0].text)
    .filter((t) => /Situación de aprendizaje \d/.test(t));
  assert.deepEqual(impresas,
    ['Situación de aprendizaje 1', 'Situación de aprendizaje 2', 'Situación de aprendizaje 3']);
});

prueba('una ficha que cambia de número suelta la tabla importada: el papel no puede llamarla como antes', async () => {
  // `filas` lleva escrito «Situación de aprendizaje 1» en su primera celda. Si se conservara al
  // moverla, el PDF seguiría imprimiendo el número viejo y la pantalla el nuevo.
  const { repo, u, doc } = await escenario();
  let { lista, updatedAt } = await fichasDelRepetidor(u.ana, doc._id, PROG);
  lista = lista.concat([fichaDeLaApp(2, 'Validación con esquemas')]);
  assert.equal((await guardarLista(u.ana, doc._id, PROG, lista, updatedAt)).status, 200);

  ({ lista, updatedAt } = await fichasDelRepetidor(u.ana, doc._id, PROG));
  assert.ok(lista[0].filas.length, 'de partida, la importada tiene su tabla');
  const mov = Sa.moverEn(lista, 1, 1);
  assert.equal((await guardarLista(u.ana, doc._id, PROG, mov.lista, updatedAt)).status, 200);

  const guardados = await valoresGuardados(repo, doc._id, SEC_ITEMS, PROG);
  const importada = guardados.items.find((it) => it.titulo === 'Introducción a los lenguajes de marcas');
  assert.equal(importada.ficha[0].num, 2);
  assert.equal(importada.ficha[0].filas, undefined, 'ha soltado la tabla importada');

  const impresas = tablasDeFicha(await definicion(u.ana, doc._id, PROG)).map((t) => t.table.body[0][0].text);
  assert.ok(impresas.includes('Situación de aprendizaje 2'));
  assert.equal(impresas.filter((t) => t === 'Situación de aprendizaje 1').length, 1,
    'no puede haber dos fichas llamándose «1»');
});

prueba('las fichas del apartado padre también se guardan: es donde el documento real deja cinco', async () => {
  // Diez de los once módulos de la PD de DAW tienen las fichas en la sección repetidora; el otro
  // («Digitalización Aplicada a los Sectores Productivos») las tiene en el campo `ficha` del
  // apartado padre, porque su Word no lleva el encabezado dentro.
  const { repo, u, doc } = await escenario();
  const fichas = [fichaDeLaApp(1, 'Tecnologías habilitadoras', { ra: [1], evaluacion: '1ª' })];
  const res = await editar(u.ana, doc._id, SEC_SA, PROG, { ficha: fichas });
  assert.equal(res.status, 200);
  assert.deepEqual((await valoresGuardados(repo, doc._id, SEC_SA, PROG)).ficha, fichas);

  const impreso = textosDe(tablasDeFicha(await definicion(u.ana, doc._id, PROG)));
  assert.ok(impreso.includes('Tecnologías habilitadoras'), 'la ficha del apartado padre no llegó al PDF');
});

// ================================================================ 4. EL CRITERIO DE ACEPTACIÓN
//
// «Una SA creada en la app sale impresa igual que una importada.»
//
// La misma ficha, en el mismo sitio del mismo documento, impresa por los dos caminos del motor:
// desde la tabla que venía del Word (`filas`) y montada desde los campos con nombre
// (`filasDeFicha`), que es el único que tiene una SA que nunca estuvo en un Word. Se compara el
// NODO de pdfmake entero, celda a celda, con sus `colSpan` y sus `rowSpan`.

prueba('el criterio del E4: una ficha creada en la aplicación sale impresa igual que una importada', async () => {
  const { u, doc } = await escenario();

  // 1. Como está sembrada: ficha importada, con su tabla del Word.
  const importadas = tablasDeFicha(await definicion(u.ana, doc._id, PROG));
  const deLaTabla = importadas.find((t) => t.table.body[0][0].text === 'Situación de aprendizaje 1');
  assert.ok(deLaTabla, 'no se ha impreso la ficha importada');

  // 2. La misma ficha sin tabla importada: lo que manda el editor en cuanto alguien la toca.
  const { lista, updatedAt } = await fichasDelRepetidor(u.ana, doc._id, PROG);
  const sinFilas = Object.assign({}, lista[0]);
  delete sinFilas.filas;
  const res = await guardarLista(u.ana, doc._id, PROG, [sinFilas], updatedAt);
  assert.equal(res.status, 200, await res.text());
  // Sin esto la comparación de abajo podría volverse una tautología sin que nadie se enterara: hay
  // que estar seguros de que lo guardado NO tiene tabla importada y el motor la monta.
  const comoQueda = (await (await leer(u.ana, doc._id, SEC_ITEMS, PROG)).json()).valores.items[0].ficha[0];
  assert.equal(comoQueda.filas, undefined, 'la ficha guardada no puede conservar la tabla importada');
  assert.equal(Sa.esSemantica(comoQueda), true, 'y tiene que tener cuerpo para que se pueda montar');

  const montadas = tablasDeFicha(await definicion(u.ana, doc._id, PROG));
  const delModelo = montadas.find((t) => t.table.body[0][0].text === 'Situación de aprendizaje 1');
  assert.ok(delModelo, 'la ficha sin tabla importada no se ha impreso');

  assert.deepEqual(comparable(delModelo), comparable(deLaTabla),
    'la tabla montada desde los campos no es la misma que la importada');
});

prueba('y una ficha nueva se imprime con las mismas etiquetas que la importada', async () => {
  const { u, doc } = await escenario();
  const { lista, updatedAt } = await fichasDelRepetidor(u.ana, doc._id, PROG);
  const nueva = fichaDeLaApp(2, 'Validación con esquemas');
  nueva.competencias = ['h) Desarrollar interfaces gráficos de usuario.'];
  nueva.objetivos = ['a) Ajustar la configuración lógica del sistema.'];
  nueva.introduccion = ['Test de iniciación.'];
  assert.equal((await guardarLista(u.ana, doc._id, PROG, lista.concat([nueva]), updatedAt)).status, 200);

  const impresas = tablasDeFicha(await definicion(u.ana, doc._id, PROG));
  const suya = impresas.find((t) => textosDe(t).includes('Validación con esquemas'));
  assert.ok(suya, 'la ficha nueva no está en el PDF');
  const texto = textosDe(suya);
  for (const campo of Sa.CAMPOS) {
    assert.ok(texto.includes(campo.etiqueta), `falta la etiqueta «${campo.etiqueta}»`);
  }
  assert.ok(texto.includes('Apuntes del módulo.'), 'falta el contenido de la ficha');
});

// ================================================================ 5. la tabla resumen

prueba('la tabla resumen se recalcula al añadir una ficha, y no se guarda en ningún sitio', async () => {
  const { repo, u, doc } = await escenario();

  const antes = resumenImpreso(await definicion(u.ana, doc._id, PROG));
  assert.ok(antes, 'el resumen calculado tiene que estar en el PDF');
  assert.ok(textosDe(antes).includes('SA 1: Introducción a los lenguajes de marcas'));

  const { lista, updatedAt } = await fichasDelRepetidor(u.ana, doc._id, PROG);
  const nueva = fichaDeLaApp(2, 'Validación con esquemas', { ra: [2], sesiones: 8 });
  assert.equal((await guardarLista(u.ana, doc._id, PROG, lista.concat([nueva]), updatedAt)).status, 200);

  const despues = resumenImpreso(await definicion(u.ana, doc._id, PROG));
  const texto = textosDe(despues);
  assert.ok(texto.includes('SA 2: Validación con esquemas'), 'el resumen no se ha recalculado');
  assert.ok(texto.includes('"text":"18"'), 'el total de sesiones (10 + 8) no se ha recalculado');

  // Y no está guardado en ninguna parte: se calcula cada vez que se imprime.
  const valores = await valoresGuardados(repo, doc._id, SEC_SA, PROG);
  assert.ok(!valores || valores.resumen_situaciones === undefined,
    'el resumen no se guarda: si se guardara habría dos versiones y ganaría la escrita');
});

prueba('el resumen no se puede guardar a mano: 400 y no se escribe nada', async () => {
  const { repo, u, doc } = await escenario();
  const antes = await foto(repo, doc._id);
  const error = await esError(await editar(u.ana, doc._id, SEC_SA, PROG, {
    resumen_situaciones: { filas: [[c('Ev.'), c('Situaciones de aprendizaje')]] },
  }), 400, 'peticion');
  assert.equal(error.campo, 'resumen_situaciones');
  assert.ok(error.mensaje.includes('se calcula'), error.mensaje);
  assert.deepEqual(diferencias(antes, await foto(repo, doc._id)), []);
});

// ================================================================ 6. la batería de basura
//
// Lo que llega de un navegador o de un `curl`, no lo que escribiría alguien con buena fe. Cada caso
// tiene que morir en la ruta con un 400, con un motivo que diga QUÉ falla, y sin dejar nada escrito.

const BASURA_PONDERACIONES = [
  { nombre: 'pesos que no son números',
    valor: [{ ra: 1, texto: 'x', ponderacion: '60 %', ce: [{ letra: 'a', texto: 'y', ponderacion: '30 %', fundamental: false }] }],
    dice: 'no es un porcentaje' },
  { nombre: 'un peso que viene como texto con coma decimal',
    valor: [{ ra: 1, texto: 'x', ponderacion: '4,98', ce: [] }],
    dice: 'no es un porcentaje' },
  { nombre: 'un RA que no existe en el módulo',
    valor: [{ ra: 7, texto: 'x', ponderacion: 100, ce: [{ letra: 'a', texto: 'y', ponderacion: 100, fundamental: false }] }],
    dice: 'RA7' },
  { nombre: 'una tabla sin decir de qué RA es',
    valor: [{ ra: null, texto: 'x', ponderacion: 100, ce: [] }],
    dice: 'no dice de qué resultado de aprendizaje es' },
  { nombre: 'dos tablas del mismo RA',
    valor: [
      { ra: 1, texto: 'x', ponderacion: 50, ce: [] },
      { ra: 1, texto: 'x', ponderacion: 50, ce: [] },
    ],
    dice: 'dos tablas del RA1' },
  { nombre: 'una estructura anidada donde va una lista de criterios',
    valor: [{ ra: 1, texto: 'x', ponderacion: 100, ce: { a: { ponderacion: 100 } } }],
    dice: 'no son una lista' },
  { nombre: 'un criterio con un objeto por texto',
    valor: [{ ra: 1, texto: 'x', ponderacion: 100, ce: [{ letra: 'a', texto: { es: 'y' }, ponderacion: 100 }] }],
    dice: 'no es texto' },
  { nombre: 'la tabla importada, que la escribe el servidor',
    valor: [{ ra: 1, texto: 'x', ponderacion: 100, ce: [], filas: [[c('Lo que yo quiera')]] }],
    dice: '«filas»' },
  { nombre: 'un objeto donde va la lista de tablas',
    valor: { ra: 1, texto: 'x', ponderacion: 100, ce: [] },
    dice: 'no es una lista' },
  { nombre: 'texto donde va la lista de tablas',
    valor: 'RA1: 100 %',
    dice: 'no es una lista' },
];

prueba('basura en las ponderaciones: 400 con el motivo, y nada escrito', async () => {
  const { repo, u, doc } = await escenario();
  const antes = await foto(repo, doc._id);

  for (const caso of BASURA_PONDERACIONES) {
    const error = await esError(await editar(u.ana, doc._id, SEC_POND, PROG, { ponderaciones: caso.valor }), 400, 'peticion');
    assert.equal(error.campo, 'ponderaciones', caso.nombre);
    assert.ok(error.mensaje.includes(caso.dice), `${caso.nombre}: ${error.mensaje}`);
    assert.ok(error.mensaje.includes('ponderacion_ra_ce'), `${caso.nombre}: el mensaje dice de qué tipo es el campo`);
    assert.ok(error.mensaje.includes('No se ha guardado nada'), caso.nombre);
  }

  assert.deepEqual(diferencias(antes, await foto(repo, doc._id)), [],
    'una petición rechazada no puede dejar nada escrito');
});

const BASURA_FICHAS = [
  { nombre: 'una ficha sin campos', valor: { items: [{ titulo: 'Vacía', ficha: [{}] }] }, dice: 'no trae ningún campo' },
  { nombre: 'una ficha que es una cadena', valor: { items: [{ titulo: 'x', ficha: ['una ficha'] }] }, dice: 'no es un objeto' },
  { nombre: 'un ítem sin ficha', valor: { items: [{ titulo: 'x' }] }, dice: 'no trae su ficha' },
  { nombre: 'una lista de fichas donde va la lista de ítems', valor: { items: [Sa.fichaVacia(1, '1ª')] }, dice: 'no es un campo de este apartado' },
  { nombre: 'los campos sueltos en lugar de la lista', valor: { ficha: [Sa.fichaVacia(1, '1ª')] }, dice: 'la lista entera' },
  { nombre: 'una estructura anidada rara dentro de un campo de la ficha',
    valor: { items: [{ titulo: 'x', ficha: [Object.assign(Sa.fichaVacia(1, '1ª'), { ce: [{ letra: 'a', texto: 'y' }] })] }] },
    dice: 'no es texto' },
  { nombre: 'un campo de la ficha que es un objeto',
    valor: { items: [{ titulo: 'x', ficha: [Object.assign(Sa.fichaVacia(1, '1ª'), { recursos: { uno: 'MySQL' } })] }] },
    dice: 'no es una lista de líneas' },
  { nombre: 'una clave inventada en la ficha',
    valor: { items: [{ titulo: 'x', ficha: [Object.assign(Sa.fichaVacia(1, '1ª'), { nota: 7 })] }] },
    dice: '«nota»' },
  { nombre: 'un pegado desde Word dentro de una ficha',
    valor: { items: [{ titulo: 'x', ficha: [Object.assign(Sa.fichaVacia(1, '1ª'), { evaluables: ['Prácticas<o:p></o:p>'] })] }] },
    dice: 'procesador de textos' },
  { nombre: 'una tabla importada con celdas que el generador no sabe colocar',
    valor: { items: [{ titulo: 'x', ficha: [Object.assign(Sa.fichaVacia(1, '1ª'), { filas: [[{ text: 'x', colspan: 0 }]] })] }] },
    dice: '«colspan»' },
];

prueba('basura en las fichas: 400 con el motivo, y nada escrito', async () => {
  const { repo, u, doc } = await escenario();
  const antes = await foto(repo, doc._id);

  for (const caso of BASURA_FICHAS) {
    const error = await esError(await editar(u.ana, doc._id, SEC_ITEMS, PROG, caso.valor), 400, 'peticion');
    assert.ok(error.mensaje.includes(caso.dice), `${caso.nombre}: ${error.mensaje}`);
    assert.ok(error.mensaje.includes('No se ha guardado nada'), caso.nombre);
  }

  assert.deepEqual(diferencias(antes, await foto(repo, doc._id)), []);
});

prueba('después de toda la basura, el documento sigue generando el mismo PDF', async () => {
  const { u, doc } = await escenario();
  const antes = await definicion(u.ana, doc._id);

  for (const caso of BASURA_PONDERACIONES) {
    await editar(u.ana, doc._id, SEC_POND, PROG, { ponderaciones: caso.valor });
  }
  for (const caso of BASURA_FICHAS) {
    await editar(u.ana, doc._id, SEC_ITEMS, PROG, caso.valor);
  }

  assert.deepEqual(comparable(await definicion(u.ana, doc._id)), comparable(antes));
});

// ================================================================ 7. quién puede escribir
// La misma regla que en el resto: la comprueba el servidor, y un rechazo no deja nada escrito.

prueba('un docente escribe los estructurados del módulo que lleva, y no los de otro', async () => {
  const { repo, u, doc } = await escenario();
  assert.equal((await editar(u.ana, doc._id, SEC_POND, PROG, { ponderaciones: PONDERACIONES_CONVENIO })).status, 200);

  const antes = await foto(repo, doc._id);
  await esError(await editar(u.ana, doc._id, SEC_POND, BBDD, { ponderaciones: PONDERACIONES_CONVENIO }), 403, 'sin_permiso');
  await esError(await editar(u.ana, doc._id, SEC_ITEMS, BBDD, { items: [] }), 403, 'sin_permiso');
  assert.deepEqual(diferencias(antes, await foto(repo, doc._id)), []);
});

prueba('la jefatura de estudios no escribe ni ponderaciones ni fichas: 403', async () => {
  const { repo, u, doc } = await escenario();
  const antes = await foto(repo, doc._id);
  await esError(await editar(u.estudios, doc._id, SEC_POND, PROG, { ponderaciones: PONDERACIONES_CONVENIO }), 403, 'sin_permiso');
  await esError(await editar(u.estudios, doc._id, SEC_ITEMS, PROG, { items: [] }), 403, 'sin_permiso');
  assert.deepEqual(diferencias(antes, await foto(repo, doc._id)), []);
});

prueba('la jefatura del departamento escribe cualquier módulo, lo lleve o no', async () => {
  const { u, doc } = await escenario();
  assert.equal((await editar(u.jefa, doc._id, SEC_POND, BBDD, { ponderaciones: PONDERACIONES_CONVENIO })).status, 200);
  const { lista, updatedAt } = await fichasDelRepetidor(u.jefa, doc._id, BBDD);
  assert.equal((await guardarLista(u.jefa, doc._id, BBDD, Sa.borrarDe(lista, 2), updatedAt)).status, 200);
});

prueba('sin persona identificada: 401; de otro departamento: 404. Y no se escribe nada', async () => {
  const { repo, u, doc, otro } = await escenario();
  const antes = await foto(repo, doc._id);
  await esError(await guardar(null, doc._id, SEC_POND, PROG, { valores: { ponderaciones: PONDERACIONES_CONVENIO }, esperaUpdatedAt: null }), 401, 'sin_identificar');
  await esError(await editar(u.pepe, doc._id, SEC_POND, PROG, { ponderaciones: PONDERACIONES_CONVENIO }), 404, 'no_encontrado');
  await esError(await editar(u.jefa, otro._id, 'introduccion', null, { texto: [] }), 404, 'no_encontrado');
  assert.deepEqual(diferencias(antes, await foto(repo, doc._id)), []);
});

prueba('dos pestañas sobre las mismas fichas: la segunda recibe 409 y no escribe', async () => {
  const { repo, u, doc } = await escenario();
  const primera = await fichasDelRepetidor(u.ana, doc._id, PROG);
  const segunda = await fichasDelRepetidor(u.jefa, doc._id, PROG);

  assert.equal((await guardarLista(u.ana, doc._id, PROG, Sa.anadirVacia(primera.lista, '2ª').lista, primera.updatedAt)).status, 200);
  const antes = await foto(repo, doc._id);
  const choque = await esError(
    await guardarLista(u.jefa, doc._id, PROG, Sa.anadirVacia(segunda.lista, '3ª').lista, segunda.updatedAt),
    409, 'conflicto',
  );
  assert.equal(typeof choque.actual, 'string');
  assert.deepEqual(diferencias(antes, await foto(repo, doc._id)), []);
});

// ================================================================ 8. el panel de comprobaciones

prueba('el panel agrupa por unidad, con el recuento y si el documento se puede aprobar', async () => {
  const { u, doc } = await escenario();
  const res = await panelDe(u.ana, doc._id);
  assert.equal(res.status, 200);
  const panel = await res.json();

  assert.equal(panel.documentoId, doc._id);
  assert.equal(panel.convenioCe, Val.CONVENIOS_CE.PESO_DEL_RA,
    'el panel mide con el convenio del PDF, o sus avisos dejan de coincidir con los suyos');
  assert.deepEqual(panel.grupos.map((g) => g.unidadId), [null, PROG, BBDD],
    'los apartados comunes primero y los módulos en el orden del documento');
  assert.deepEqual(panel.grupos.map((g) => g.num), [null, '2.1', '2.2'],
    'la numeración es la del PDF y la de la barra lateral');
  assert.equal(panel.grupos[2].titulo, 'Bases de datos');

  // Y quién lleva cada grupo, que es la pregunta de fondo del panel: «¿a quién hay que avisar?».
  // Con el mismo recorte que /unidades: el nombre y el rol, nunca el correo.
  assert.deepEqual(panel.grupos[1].responsables, [{ _id: u.ana._id, nombre: 'Ana', rol: 'docente' }]);
  assert.deepEqual(panel.grupos[2].responsables, [], 'Bases de datos no la lleva nadie');
  assert.deepEqual(panel.grupos[0].responsables.map((p) => p.nombre), ['Jefatura del departamento'],
    'los apartados comunes los escribe la jefatura del departamento');

  const todos = panel.grupos.flatMap((g) => g.avisos);
  assert.equal(panel.total, todos.length);
  assert.deepEqual(panel.cuenta, Val.cuenta(todos));
  assert.equal(panel.cuenta.error > 0, true);
  assert.equal(panel.puedeAprobarse, false, 'con errores abiertos no se aprueba');

  for (const aviso of todos) {
    assert.ok(['error', 'aviso', 'info'].includes(aviso.severidad), JSON.stringify(aviso));
    assert.equal(typeof aviso.titulo, 'string');
    assert.equal(typeof aviso.detalle, 'string');
    assert.equal(typeof aviso.regla, 'string');
    assert.equal(typeof aviso.impreso, 'boolean');
    assert.ok(aviso.destino && typeof aviso.destino.seccion === 'string',
      'cada aviso lleva el apartado al que ir a arreglarlo');
  }

  // Y el destino es un apartado que se puede pedir de verdad, que es para lo que sirve.
  const unAviso = todos.find((a) => a.regla === 'criterios_de_ra');
  const ida = await leer(u.ana, doc._id, unAviso.destino.seccion, unAviso.destino.unidadId);
  assert.equal(ida.status, 200);
});

prueba('EL CRITERIO: los avisos del panel coinciden uno a uno con los de la cajita roja del PDF', async () => {
  const { u, doc } = await escenario();
  const panel = await (await panelDe(u.ana, doc._id)).json();

  const delPanel = panel.grupos
    .map((g) => g.avisos.filter((a) => a.impreso).map((a) => a.titulo))
    .filter((titulos) => titulos.length);
  const delPdf = cajitas(await definicion(u.ana, doc._id));

  assert.deepEqual(delPanel, delPdf,
    'el panel y la cajita roja tienen que decir lo mismo, en el mismo orden y con el mismo texto');
  assert.equal(panel.impresos, delPdf.flat().length);
  assert.ok(delPdf.flat().length > 0, 'el documento de prueba tiene que disparar avisos');

  // Y lo que no imprime el PDF no se cuela en esa lista: son las comprobaciones del panel.
  const soloPanel = panel.grupos.flatMap((g) => g.avisos).filter((a) => !a.impreso);
  assert.deepEqual([...new Set(soloPanel.map((a) => a.regla))].sort(),
    ['ra_sin_situacion', 'sin_docente']);
});

prueba('el aviso del otro convenio se distingue del descuadre de verdad, con las mismas palabras', async () => {
  const { u, doc } = await escenario();
  const panel = await (await panelDe(u.ana, doc._id)).json();
  const criterios = panel.grupos.flatMap((g) => g.avisos).filter((a) => a.regla === 'criterios_de_ra');

  // El RA2 de Programación: los criterios suman 100 % dentro del RA. No es una errata, es el otro
  // convenio, y la decisión de cuál vale es del departamento.
  const convenio = criterios.filter((a) => a.convenio === Val.CIEN_DENTRO_DEL_RA);
  assert.equal(convenio.length, 1);
  assert.equal(convenio[0].titulo, 'RA2: los criterios suman 100 % y el RA pondera 40 %.');
  assert.ok(convenio[0].detalle.includes('100 %'), convenio[0].detalle);
  assert.ok(convenio[0].detalle.includes('otro convenio'), convenio[0].detalle);
  assert.equal(convenio[0].severidad, 'error',
    'la severidad no baja: bajarla sería decidir el convenio por la puerta de atrás');
  assert.equal(panel.delOtroConvenio, 1, 'y la respuesta trae el recuento, para poder separarlos');

  // El RA1 de Bases de datos: 14,94 % donde debería haber 15 %. Ese sí hay que arreglarlo.
  const errata = criterios.filter((a) => !a.convenio);
  assert.equal(errata.length, 1);
  assert.equal(errata[0].titulo, 'RA1: los criterios suman 14,94 % y el RA pondera 15 %.');
  assert.ok(!errata[0].detalle.includes('otro convenio'), errata[0].detalle);

  // Los dos títulos son los que imprime el PDF: el aviso se distingue por el detalle, no por el
  // título, porque el título es el contrato con la cajita roja.
  const impresos = cajitas(await definicion(u.ana, doc._id)).flat();
  assert.ok(impresos.includes(convenio[0].titulo));
  assert.ok(impresos.includes(errata[0].titulo));
});

prueba('la suma de los RA se comprueba con el mismo alcance que el motor', async () => {
  const { u, doc } = await escenario();
  const panel = await (await panelDe(u.ana, doc._id)).json();
  const sumas = panel.grupos.flatMap((g) => g.avisos.map((a) => [g.unidadId, a]))
    .filter(([, a]) => a.regla === 'suma_de_ra');
  assert.deepEqual(sumas.map(([unidadId, a]) => [unidadId, a.titulo]), [
    [BBDD, 'La suma de las ponderaciones de los RA es 45 % y debería ser 100 %.'],
  ], 'Programación suma 100 % y no da aviso; Bases de datos suma 45 % y sí');
});

prueba('la comprobación nueva: una situación de aprendizaje sin evaluación', async () => {
  // El hueco que dejó apuntado el E0 (docs/plan.md, «Para el E4»): el motor agrupa el resumen por
  // `evaluacion || ''`, así que una ficha sin evaluación acaba en un grupo SIN NOMBRE de la tabla
  // resumen y hasta ahora no lo advertía nadie.
  const { u, doc } = await escenario();
  assert.deepEqual(Val.avisosSaSinEvaluacion([{ num: 1, titulo: 'x', evaluacion: '1ª' }]), [],
    'con evaluación no hay aviso');

  const antes = await (await panelDe(u.ana, doc._id)).json();
  assert.equal(antes.grupos.flatMap((g) => g.avisos).filter((a) => a.regla === 'sa_sin_evaluacion').length, 0);

  // Una ficha nueva a la que alguien ha borrado la evaluación. Se GUARDA —el campo es opcional y el
  // documento se imprime igual— y el panel lo dice.
  const { lista, updatedAt } = await fichasDelRepetidor(u.ana, doc._id, PROG);
  const sinEvaluacion = fichaDeLaApp(2, 'Validación con esquemas');
  sinEvaluacion.evaluacion = '';
  assert.equal((await guardarLista(u.ana, doc._id, PROG, lista.concat([sinEvaluacion]), updatedAt)).status, 200);

  const panel = await (await panelDe(u.ana, doc._id)).json();
  const avisos = panel.grupos.flatMap((g) => g.avisos).filter((a) => a.regla === 'sa_sin_evaluacion');
  assert.equal(avisos.length, 1);
  assert.equal(avisos[0].severidad, 'aviso',
    'es aviso y no error: el documento se imprime igual y bloquear la aprobación por esto sería desproporcionado');
  assert.equal(avisos[0].titulo, 'SA 2 («Validación con esquemas») no dice en qué evaluación va');
  assert.ok(avisos[0].detalle.includes('grupo sin nombre'), avisos[0].detalle);
  assert.deepEqual(avisos[0].destino, { seccion: SEC_ITEMS, unidadId: PROG });
  assert.equal(avisos[0].impreso, false, 'el PDF no imprime esta comprobación: es del panel');

  // Y el grupo sin nombre existe de verdad en la tabla resumen, que es por lo que hay que avisar.
  const resumen = resumenImpreso(await definicion(u.ana, doc._id, PROG));
  const grupos = resumen.table.body.slice(2).map((fila) => fila[0].text);
  assert.ok(grupos.includes(''), `la fila del resumen se queda sin evaluación: ${JSON.stringify(grupos)}`);
});

prueba('un RA que ninguna situación de aprendizaje trabaja sale en el panel', async () => {
  const { u, doc } = await escenario();
  const panel = await (await panelDe(u.ana, doc._id)).json();
  const avisos = panel.grupos.flatMap((g) => g.avisos.map((a) => [g.unidadId, a]))
    .filter(([, a]) => a.regla === 'ra_sin_situacion');
  // Programación declara los RA 1 y 2 y su única ficha trabaja el RA1.
  assert.deepEqual(avisos.map(([unidadId, a]) => [unidadId, a.titulo, a.severidad]), [
    [PROG, 'RA2 no aparece en ninguna situación de aprendizaje', 'aviso'],
  ]);
});

prueba('una unidad sin docentes es un error del panel, y el primero de su grupo', async () => {
  const { u, doc } = await escenario();
  const panel = await (await panelDe(u.ana, doc._id)).json();
  const bbdd = panel.grupos.find((g) => g.unidadId === BBDD);
  assert.equal(bbdd.avisos[0].regla, 'sin_docente');
  assert.equal(bbdd.avisos[0].severidad, 'error');
  assert.ok(bbdd.avisos[0].titulo.includes('Bases de datos'));
  const prog = panel.grupos.find((g) => g.unidadId === PROG);
  assert.equal(prog.avisos.filter((a) => a.regla === 'sin_docente').length, 0, 'Programación la lleva Ana');
});

prueba('el panel sigue al documento: arreglar las ponderaciones quita el aviso y la cajita roja', async () => {
  const { u, doc } = await escenario();
  const arregladas = [
    { ra: 1, texto: 'Reconoce las características.', ponderacion: 60, ce: [
      { letra: 'a', texto: 'Se han identificado las etiquetas.', ponderacion: 30, fundamental: true },
      { letra: 'b', texto: 'Se ha reconocido la jerarquía.', ponderacion: 30, fundamental: false },
    ] },
    { ra: 2, texto: 'Valida documentos.', ponderacion: 40, ce: [
      { letra: 'a', texto: 'Se ha validado con un esquema.', ponderacion: 40, fundamental: false },
    ] },
  ];
  assert.equal((await editar(u.ana, doc._id, SEC_POND, PROG, { ponderaciones: arregladas })).status, 200);

  const panel = await (await panelDe(u.ana, doc._id)).json();
  const prog = panel.grupos.find((g) => g.unidadId === PROG);
  assert.equal(prog.avisos.filter((a) => a.impreso).length, 0);
  assert.equal(panel.delOtroConvenio, 0);

  // Y se vuelven a comparar las dos listas: el panel y el PDF siguen diciendo lo mismo.
  const delPanel = panel.grupos
    .map((g) => g.avisos.filter((a) => a.impreso).map((a) => a.titulo))
    .filter((t) => t.length);
  assert.deepEqual(delPanel, cajitas(await definicion(u.ana, doc._id)));
});

prueba('el panel lo ve quien ve el documento, y nadie más', async () => {
  const { u, doc, otro } = await escenario();
  // La jefatura de estudios no edita nada y es la que aprueba: es la primera que tiene que verlo.
  assert.equal((await panelDe(u.estudios, doc._id)).status, 200);
  assert.equal((await panelDe(u.ana, doc._id)).status, 200);
  await esError(await panelDe(null, doc._id), 401, 'sin_identificar');
  await esError(await panelDe(u.pepe, doc._id), 404, 'no_encontrado');
  await esError(await panelDe(u.jefa, otro._id), 404, 'no_encontrado');
  await esError(await panelDe(u.jefa, 'no-existe'), 404, 'no_encontrado');
});

// ---------------------------------------------------------------- las reglas de estilo de una celda

prueba('la alineación y el tamaño de letra de una celda: una regla, y null cuando no hay nada que emitir', () => {
  // Es la decisión que protege la fidelidad de las 1.070 tablas importadas: la clave ausente y la
  // clave con el valor por omisión devuelven lo MISMO, así que los motores no escriben nada en
  // ninguno de los dos casos y no hay dos maneras de decir que una celda sale como siempre.
  const celda = (extra) => Object.assign({ text: 'a', colspan: 1, rowspan: 1, bold: false }, extra);
  assert.equal(Est.alineacionDeCelda(celda()), null, 'sin la clave, nada que emitir');
  assert.equal(Est.alineacionDeCelda(celda({ alineacion: Est.ALINEACION_CELDA_OMISION })), null, 'el valor por omisión, lo mismo');
  assert.equal(Est.alineacionDeCelda(celda({ alineacion: 'centro' })), 'centro');
  assert.equal(Est.alineacionDeCelda(celda({ alineacion: 'derecha' })), 'derecha');
  assert.equal(Est.tamanoDeCelda(celda()), null);
  assert.equal(Est.tamanoDeCelda(celda({ tamano: Est.TAMANO_CELDA_OMISION })), null);
  assert.equal(Est.tamanoDeCelda(celda({ tamano: 'pequena' })), 'pequena');
  assert.equal(Est.tamanoDeCelda(celda({ tamano: 'grande' })), 'grande');
  // Lo que no es uno de los nombres tampoco se emite: la puerta ya lo rechaza al guardar, y aquí no
  // puede colarse hacia el PDF ni hacia el Word un valor que nadie ha traducido.
  assert.equal(Est.alineacionDeCelda(celda({ alineacion: 'center' })), null);
  assert.equal(Est.tamanoDeCelda(celda({ tamano: 9.5 })), null);
  // Y lo que no es una celda no revienta: es la misma tolerancia que `fondoDeCelda`.
  for (const x of [null, undefined, 'a', 7, []]) {
    assert.equal(Est.alineacionDeCelda(x), null);
    assert.equal(Est.tamanoDeCelda(x), null);
  }
  // Los nombres son del contrato: ni valores de pdfmake, ni de Word, ni medidas.
  assert.deepEqual(Est.ALINEACIONES_CELDA, ['izquierda', 'centro', 'derecha']);
  assert.deepEqual(Est.TAMANOS_CELDA, ['pequena', 'normal', 'grande']);
  assert.ok(Est.ALINEACIONES_CELDA.includes(Est.ALINEACION_CELDA_OMISION));
  assert.ok(Est.TAMANOS_CELDA.includes(Est.TAMANO_CELDA_OMISION));
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
    : `\n${total} pruebas de campos estructurados y comprobaciones correctas`);
  process.exit(fallos ? 1 : 0);
}

ejecutar();
