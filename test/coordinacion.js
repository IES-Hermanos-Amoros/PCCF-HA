// El panel de coordinación y los comentarios por apartado, con las rutas llamadas directamente.
//
//   node test/coordinacion.js
//
// Sin levantar Next, sin red y sin base de datos: igual que test/api.js, test/asignacion.js y
// test/estructurados.js (docs/api.md, primera regla de forma). El arnés es el de aquellas —cada
// prueba monta su propio almacén en memoria y abre una sesión de verdad por persona—, copiado y no
// importado: una prueba que depende de otra prueba se rompe cuando alguien toca la otra, y lo que de
// verdad se comparte son treinta líneas.
//
// QUÉ SE PRUEBA, Y POR QUÉ ESTAS COSAS
//
// 1. QUE NO HAYA DOS VERDADES. La coordinación no calcula nada nuevo: cruza lo que ya dicen
//    `GET .../arbol` (si el apartado está relleno y de dónde viene) y `GET .../validaciones` (si
//    tiene errores). Así que casi todas las pruebas de la matriz comparan la celda con lo que dicen
//    esas dos rutas, apartado por apartado, en lugar de con números escritos a mano aquí: si un día
//    una de las tres cambia de criterio, lo que falla es la comparación y no una cifra que alguien
//    tendría que recordar por qué era.
//
// 2. QUE LA COORDINACIÓN NO SEA EL DOCUMENTO. Es un resumen: 11 módulos × 8 bloques. Se comprueba
//    que no viaja ni un `valores`, ni una palabra del contenido, y que los bloques salen UNA vez y
//    no una por módulo (docs/api.md, segunda regla de forma).
//
// 3. LOS COMENTARIOS: el hilo, su orden, quién puede escribir en él —que es la decisión de este
//    evolutivo: todo el que VE el documento, no solo quien lo edita— y que al arrastrar el curso
//    NO SE COPIAN (docs/plan.md, «Lo que ha dejado el E5»).
//
// 4. Y lo de siempre: 401 sin identificar, 404 para lo que no se ve o no está, 400 para la petición
//    mal construida, y que nada de eso escriba nada.

'use strict';

const assert = require('assert/strict');

const { crearRepositorio } = require('../repositorio');
const memoria = require('../repositorio/memoria');

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
const Coordinacion = require('../app/_lib/rutas/coordinacion');
const Comentarios = require('../app/_lib/rutas/comentarios');
const Validaciones = require('../app/_lib/rutas/validaciones');
const ArbolRuta = require('../app/_lib/rutas/arbol');
const Apartado = require('../app/_lib/rutas/apartado');
const Arrastre = require('../app/_lib/rutas/arrastre');
const Estructura = require('../app/_lib/rutas/estructura');

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

const coordinacion = (persona, id) => Coordinacion.GET(
  pet(`/api/documentos/${id}/coordinacion`, persona), { id },
);

const panel = (persona, id) => Validaciones.GET(pet(`/api/documentos/${id}/validaciones`, persona), { id });
const arbolDe = (persona, id) => ArbolRuta.GET(pet(`/api/documentos/${id}/arbol`, persona), { id });

const hilo = (persona, id, seccion, unidad) => Comentarios.GET(
  pet(`/api/documentos/${id}/comentarios?${consultaDe(seccion, unidad)}`, persona), { id },
);

const comentar = (persona, id, seccion, unidad, cuerpo) => Comentarios.CREAR(
  pet(`/api/documentos/${id}/comentarios?${consultaDe(seccion, unidad)}`, persona, { metodo: 'POST', cuerpo }),
  { id },
);

// Sin `seccion` en la URL: es el enlace mal construido.
const hiloSinSeccion = (persona, id) => Comentarios.GET(pet(`/api/documentos/${id}/comentarios`, persona), { id });
const comentarSinSeccion = (persona, id, cuerpo) => Comentarios.CREAR(
  pet(`/api/documentos/${id}/comentarios`, persona, { metodo: 'POST', cuerpo }), { id },
);

const revisar = (persona, id, seccion, unidad, esperaUpdatedAt) => Apartado.REVISAR(
  pet(`/api/documentos/${id}/apartado/revisar?${consultaDe(seccion, unidad)}`, persona, {
    metodo: 'POST', cuerpo: { esperaUpdatedAt },
  }),
  { id },
);

const leerApartado = (persona, id, seccion, unidad) => Apartado.GET(
  pet(`/api/documentos/${id}/apartado?${consultaDe(seccion, unidad)}`, persona), { id },
);

const cuerpoDe = async (respuesta, estado = 200) => {
  assert.equal(respuesta.status, estado, `se esperaba un ${estado} y ha sido un ${respuesta.status}`);
  return respuesta.json();
};

// Lo que está guardado de verdad, sin pasar por la ruta.
const comentariosGuardados = (repo, id, filtro) => repo.comentarios.listar(id, filtro || {});

// ================================================================ el documento sintético
//
// Pequeño, pero con las formas que esta pantalla tiene que resolver: tres módulos (uno sin docentes),
// un bloque que agrupa y además tiene campos propios —para que una celda pueda quedar a medias—, un
// bloque sin ningún campo en ningún nivel —que no es «vacío», es que ahí no hay nada que contar— y un
// apartado de ponderaciones con el que disparar errores de verdad de core/validaciones.js.

const campoTexto = { id: 'texto', tipo: 'texto_largo', etiqueta: 'Texto' };

const RA_CE = {
  ra: [
    { num: 1, texto: 'Reconoce las características de los lenguajes de marcas.', ce: [
      { letra: 'a', texto: 'Se han identificado las etiquetas.' },
    ] },
  ],
};

// Un descuadre de verdad y la suma de los RA mal: 45 % en lugar de 100 %. Son dos errores.
const PONDERACIONES_MAL = [
  { ra: 1, texto: 'Reconoce las características de los lenguajes de marcas.', ponderacion: 15, ce: [
    { letra: 'a', texto: 'Se han identificado las etiquetas.', ponderacion: 4.98, fundamental: false },
    { letra: 'b', texto: 'Se ha reconocido la jerarquía.', ponderacion: 4.98, fundamental: false },
  ] },
  { ra: 2, texto: 'Valida documentos contra un esquema.', ponderacion: 30, ce: [
    { letra: 'a', texto: 'Se ha validado con un esquema.', ponderacion: 30, fundamental: false },
  ] },
];

const PONDERACIONES_BIEN = [
  { ra: 1, texto: 'Reconoce las características de los lenguajes de marcas.', ponderacion: 60, ce: [
    { letra: 'a', texto: 'Se han identificado las etiquetas.', ponderacion: 60, fundamental: true },
  ] },
  { ra: 2, texto: 'Valida documentos contra un esquema.', ponderacion: 40, ce: [
    { letra: 'a', texto: 'Se ha validado con un esquema.', ponderacion: 40, fundamental: false },
  ] },
];

const PLANTILLA = {
  tipo: 'programacion_didactica',
  origen: 'PD_sintetica.docx',
  version: null,
  generada: '2026-01-01T00:00:00.000Z',
  secciones: [
    { id: 'introduccion', titulo: 'Introducción', nivel: 1, edita: 'jefe_departamento', presencia: 1,
      campos: [campoTexto],
      hijos: [
        { id: 'introduccion/contexto', titulo: 'Contextualización', nivel: 2, presencia: 1,
          campos: [campoTexto], hijos: [] },
      ] },
    { id: 'modulos', titulo: 'Módulos', nivel: 1, instancias: true, etiqueta_instancia: 'módulo',
      edita: 'docentes_del_modulo', presencia: 3, campos: [],
      hijos: [
        { id: 'modulos/mejoras', titulo: 'Propuestas de mejora del curso anterior', nivel: 3,
          presencia: 3, campos: [campoTexto], hijos: [] },
        // Con campos propios Y con un hijo: dos apartados en la misma celda, que es lo que permite
        // que una celda salga «incompleto» y no solo lleno o vacío.
        { id: 'modulos/desarrollo', titulo: 'Desarrollo curricular', nivel: 3, presencia: 3,
          campos: [campoTexto],
          hijos: [
            { id: 'modulos/desarrollo/contenidos', titulo: 'Contenidos básicos', nivel: 4,
              presencia: 3, campos: [campoTexto], hijos: [] },
          ] },
        { id: 'modulos/ra-ce', titulo: 'Resultados de aprendizaje y criterios de evaluación',
          nivel: 3, presencia: 3,
          campos: [{ id: 'ra_ce', tipo: 'auto.tabla_ra_ce', etiqueta: 'Resultados de aprendizaje' }],
          hijos: [] },
        { id: 'modulos/ponderaciones', titulo: 'Ponderaciones de los Resultados de aprendizaje',
          nivel: 3, presencia: 3,
          campos: [{ id: 'ponderaciones', tipo: 'ponderacion_ra_ce', etiqueta: 'Ponderaciones', multiple: true }],
          hijos: [] },
        // Ni campos propios ni hijos con campos: aquí no hay nada que contar, y eso NO es «vacío».
        { id: 'modulos/sin-campos', titulo: 'Relación con otros módulos', nivel: 3, presencia: 3,
          campos: [], hijos: [] },
      ] },
  ],
};

const BLOQUES = [
  'modulos/mejoras', 'modulos/desarrollo', 'modulos/ra-ce', 'modulos/ponderaciones', 'modulos/sin-campos',
];

const PROG = 'daw-0485';
const BBDD = 'daw-0484';
const DESP = 'daw-0614';

const UNIDADES = [
  { unidadId: PROG, titulo: 'Programación', num: '0485', grupo: 'Módulos del primer curso' },
  { unidadId: BBDD, titulo: 'Bases de datos', num: '0484', grupo: 'Módulos del primer curso' },
  { unidadId: DESP, titulo: 'Despliegue de aplicaciones web', num: '0614', grupo: 'Módulos del segundo curso' },
];

// Una frase reconocible por apartado: así una prueba puede comprobar que el contenido NO sale en la
// coordinación buscándolo en la respuesta entera.
const parrafo = (texto) => [{ type: 'p', text: texto }];
const MARCA = 'ESTO-ES-CONTENIDO-DEL-DOCUMENTO';

const APARTADOS = [
  // --- comunes
  { seccion: 'introduccion', unidadId: null, valores: { texto: parrafo(`${MARCA} de la introducción.`) }, origen: 'revisado' },
  // `introduccion/contexto` sin fila: es un apartado de la plantilla que nadie ha escrito.

  // --- Programación: una celda de cada color
  { seccion: 'modulos/mejoras', unidadId: PROG, valores: { texto: parrafo(`${MARCA} de mejoras.`) }, origen: 'revisado' },
  { seccion: 'modulos/desarrollo', unidadId: PROG, valores: { texto: parrafo(`${MARCA} del desarrollo.`) }, origen: 'heredado' },
  // `modulos/desarrollo/contenidos` sin escribir -> la celda queda «incompleto»
  { seccion: 'modulos/ra-ce', unidadId: PROG, valores: { ra_ce: RA_CE }, origen: 'nuevo' },
  { seccion: 'modulos/ponderaciones', unidadId: PROG, valores: { ponderaciones: PONDERACIONES_MAL }, origen: 'modificado' },

  // --- Bases de datos: sin docentes, con el desarrollo entero y heredado
  { seccion: 'modulos/desarrollo', unidadId: BBDD, valores: { texto: parrafo(`${MARCA} del desarrollo de BBDD.`) }, origen: 'heredado' },
  { seccion: 'modulos/desarrollo/contenidos', unidadId: BBDD, valores: { texto: parrafo(`${MARCA} de los contenidos.`) }, origen: 'heredado' },
  { seccion: 'modulos/ponderaciones', unidadId: BBDD, valores: { ponderaciones: PONDERACIONES_BIEN }, origen: 'heredado' },

  // --- Despliegue: todo vacío
];

// Un documento sin unidades, que es el otro modo de la pantalla: el PCCF y la memoria no se reparten
// por módulos.
const PLANTILLA_SIN_UNIDADES = {
  tipo: 'pccf', origen: 'PCCF_sintetico.docx', version: null, generada: '2026-01-01T00:00:00.000Z',
  secciones: [
    { id: 'presentacion', titulo: 'Presentación del ciclo', nivel: 1, edita: 'jefe_departamento',
      presencia: 1, campos: [campoTexto], hijos: [] },
    { id: 'organizacion', titulo: 'Organización del ciclo', nivel: 1, edita: 'jefe_departamento',
      presencia: 1, campos: [campoTexto],
      hijos: [
        { id: 'organizacion/horarios', titulo: 'Horarios', nivel: 2, presencia: 1, campos: [campoTexto], hijos: [] },
      ] },
  ],
};

const PLANTILLA_OTRO_DEPARTAMENTO = {
  tipo: 'programacion_didactica', origen: 'PD_matematicas.docx', version: null,
  generada: '2026-01-01T00:00:00.000Z',
  secciones: [
    { id: 'introduccion', titulo: 'Introducción', nivel: 1, edita: 'jefe_departamento', presencia: 1,
      campos: [campoTexto], hijos: [] },
  ],
};

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
    estudios: await persona('Jefatura de estudios', 'estudios@ejemplo.invalid', 'jefe_estudios', 'estudios'),
    pepe: await persona('Pepe', 'pepe@ejemplo.invalid', 'docente', 'matematicas'),
  };

  const doc = await repo.documentos.crear({
    tipo: 'programacion_didactica', ciclo: 'daw', curso: '2026-27', departamento: 'informatica',
    estado: 'borrador', plantilla: PLANTILLA, plantillaVersion: 1, origen: 'PD_sintetica.docx',
  });
  await repo.unidades.crearMuchos(doc._id, [
    { ...UNIDADES[0], docentes: [u.ana._id] },
    // Sin docentes: es el aviso `sin_docente`, que es ERROR y cuelga de la unidad, no de un bloque.
    { ...UNIDADES[1], docentes: [] },
    { ...UNIDADES[2], docentes: [u.ana._id, u.luis._id] },
  ]);
  await repo.apartados.crearMuchos(doc._id, APARTADOS);

  const pccf = await repo.documentos.crear({
    tipo: 'pccf', ciclo: 'daw', curso: '2026-27', departamento: 'informatica', estado: 'borrador',
    plantilla: PLANTILLA_SIN_UNIDADES, plantillaVersion: 1, origen: 'PCCF_sintetico.docx',
  });
  await repo.apartados.crearMuchos(pccf._id, [
    { seccion: 'presentacion', unidadId: null, valores: { texto: parrafo('El ciclo de DAW.') }, origen: 'revisado' },
  ]);

  const otro = await repo.documentos.crear({
    tipo: 'programacion_didactica', ciclo: 'daw', curso: '2026-27', departamento: 'matematicas',
    estado: 'borrador', plantilla: PLANTILLA_OTRO_DEPARTAMENTO, plantillaVersion: 1,
    origen: 'PD_mates.docx',
  });

  return { repo, u, doc, pccf, otro };
}

// ---------------------------------------------------------------- lo que dicen las otras dos rutas
//
// La coordinación no puede decir nada distinto de `/arbol` y `/validaciones`: esto es lo que lo
// comprueba, recalculando las celdas DESDE esas dos respuestas.

const nodosDe = (arbol) => {
  const out = [];
  (function rec(n) { out.push(n); (n.hijos || []).forEach(rec); })(arbol);
  return out;
};

const esRevisado = (origen) => origen === 'revisado' || origen === 'modificado' || origen === 'nuevo';

// Los nodos del subárbol de un bloque dentro de una unidad, buscados en el árbol que sirve la API.
function subarbolDeCelda(arbol, unidadId, seccion) {
  const todos = nodosDe(arbol);
  const raiz = todos.find((n) => n.seccion === seccion && (n.unidadId || null) === unidadId);
  return raiz ? nodosDe(raiz) : [];
}

// Los recuentos de una celda según `/arbol` y `/validaciones`, calculados aquí a mano.
function celdaSegunLasOtras(arbol, avisos, unidadId, seccion) {
  const nodos = subarbolDeCelda(arbol, unidadId, seccion).filter((n) => n.contenido);
  const secciones = new Set(nodos.map((n) => n.seccion));
  const suyos = avisos.filter((a) => a.destino
    && (a.destino.unidadId || null) === unidadId
    && secciones.has(a.destino.seccion));
  return {
    apartados: nodos.length,
    conContenido: nodos.filter((n) => n.relleno).length,
    revisados: nodos.filter((n) => esRevisado(n.origen)).length,
    errores: suyos.filter((a) => a.severidad === 'error').length,
    avisos: suyos.filter((a) => a.severidad !== 'error').length,
  };
}

// ================================================================ pruebas: la matriz

prueba('la coordinación es una matriz de unidades × bloques, en el orden del documento', async () => {
  const { u, doc } = await escenario();
  const c = await cuerpoDe(await coordinacion(u.jefa, doc._id));

  assert.equal(c.documentoId, doc._id);
  assert.equal(c.modo, 'unidades');
  assert.equal(c.etiqueta, 'módulo', 'cómo se llama una unidad lo dice la plantilla, no esta ruta');
  assert.deepEqual(c.bloques.map((b) => b.seccion), BLOQUES, 'las columnas son los apartados de la plantilla de las unidades');
  assert.deepEqual(c.bloques.map((b) => b.indice), [1, 2, 3, 4, 5]);
  assert.equal(c.bloques[0].titulo, 'Propuestas de mejora del curso anterior');
  assert.deepEqual(c.filas.map((f) => f.unidadId), [PROG, BBDD, DESP], 'el orden es el de unidades.listar(): el del documento y el del tomo');
  for (const fila of c.filas) {
    assert.equal(fila.tipo, 'unidad');
    assert.deepEqual(fila.celdas.map((x) => x.seccion), BLOQUES, 'cada fila tiene una celda por bloque, en el mismo orden');
  }
});

prueba('cada fila dice quién lleva la unidad, con el nombre y el rol y sin el correo', async () => {
  const { u, doc } = await escenario();
  const c = await cuerpoDe(await coordinacion(u.ana, doc._id));
  const porId = new Map(c.filas.map((f) => [f.unidadId, f]));

  assert.deepEqual(porId.get(PROG).docentes, [{ _id: u.ana._id, nombre: 'Ana', rol: 'docente' }]);
  assert.equal(porId.get(PROG).sinDocentes, false);
  assert.deepEqual(porId.get(DESP).docentes.map((d) => d.nombre), ['Ana', 'Luis']);
  assert.deepEqual(porId.get(BBDD).docentes, []);
  assert.equal(porId.get(BBDD).sinDocentes, true, 'una unidad sin nadie es lo primero que hay que ver aquí');
  assert.equal(c.resumen.sinDocentes, 1);
  assert.ok(!JSON.stringify(c).includes('@ejemplo.invalid'), 'el correo no sale: esta pantalla dice a quién avisar, no cómo escribirle');
});

prueba('una persona de baja no lleva módulos: coordinación, validaciones y reparto coinciden', async () => {
  const { repo, u, doc } = await escenario();
  const antes = await (await panel(u.jefa, doc._id)).json();
  const sinAntes = antes.grupos.find((g) => g.unidadId === PROG);
  assert.deepEqual(sinAntes.responsables.map((r) => r.nombre), ['Ana']);

  await repo.usuarios.actualizar(u.ana._id, { activo: false });

  const v = await (await panel(u.jefa, doc._id)).json();
  const g = v.grupos.find((x) => x.unidadId === PROG);
  assert.deepEqual(g.responsables, [], 'validaciones: la persona de baja no responde del módulo');
  assert.ok(g.avisos.some((a) => a.regla === 'sin_docente'), 'validaciones: avisa de que no hay docente');

  const c = await (await coordinacion(u.jefa, doc._id)).json();
  const fila = c.filas.find((f) => f.unidadId === PROG);
  assert.deepEqual(fila.docentes, [], 'coordinación: la fila queda sin docentes');
  assert.equal(fila.sinDocentes, true);

  const Unidades = require('../app/_lib/rutas/unidades');
  const r = await (await Unidades.GET(pet(`/api/documentos/${doc._id}/unidades`, u.jefa), { id: doc._id })).json();
  assert.deepEqual(r.unidades.find((x) => x.unidadId === PROG).docentes, []);
});

prueba('el estado de una celda son los cinco del árbol, y sale de relleno + origen + errores', async () => {
  const { u, doc } = await escenario();
  const c = await cuerpoDe(await coordinacion(u.jefa, doc._id));
  const celda = (unidadId, seccion) => c.filas.find((f) => f.unidadId === unidadId)
    .celdas.find((x) => x.seccion === seccion);

  // escrito y dado por bueno para este curso
  assert.equal(celda(PROG, 'modulos/mejoras').estado, 'validado');
  // dos apartados y solo uno escrito
  assert.equal(celda(PROG, 'modulos/desarrollo').estado, 'incompleto');
  assert.deepEqual(
    { apartados: celda(PROG, 'modulos/desarrollo').apartados, conContenido: celda(PROG, 'modulos/desarrollo').conContenido },
    { apartados: 2, conContenido: 1 },
  );
  // escrito, heredado del curso anterior: pendiente de que alguien lo mire
  assert.equal(celda(BBDD, 'modulos/desarrollo').estado, 'completo');
  // sin nada escrito
  assert.equal(celda(DESP, 'modulos/mejoras').estado, 'vacio');
  assert.equal(celda(BBDD, 'modulos/ra-ce').estado, 'vacio');
  // con errores de validación: manda el error, aunque esté escrito y reescrito este curso
  assert.equal(celda(PROG, 'modulos/ponderaciones').estado, 'errores');
  assert.ok(celda(PROG, 'modulos/ponderaciones').errores > 0);
  assert.equal(celda(PROG, 'modulos/ponderaciones').revisados, 1, 'estaba revisado y aun así manda el error');
});

prueba('un bloque sin ningún apartado con campos no es «vacío»: no hay nada que contar', async () => {
  const { u, doc } = await escenario();
  const c = await cuerpoDe(await coordinacion(u.jefa, doc._id));
  for (const fila of c.filas) {
    const celda = fila.celdas.find((x) => x.seccion === 'modulos/sin-campos');
    assert.equal(celda.apartados, 0);
    assert.equal(celda.existe, false);
    assert.equal(celda.estado, null, 'la pantalla pinta un guion, no un verde');
  }
});

prueba('cada celda coincide con lo que dicen el árbol y las validaciones, celda a celda', async () => {
  const { u, doc } = await escenario();
  const c = await cuerpoDe(await coordinacion(u.jefa, doc._id));
  const { arbol } = await cuerpoDe(await arbolDe(u.jefa, doc._id));
  const v = await cuerpoDe(await panel(u.jefa, doc._id));
  const todos = v.grupos.flatMap((g) => g.avisos);

  let comparadas = 0;
  for (const fila of c.filas) {
    for (const celda of fila.celdas) {
      const esperado = celdaSegunLasOtras(arbol, todos, fila.unidadId, celda.seccion);
      assert.deepEqual(
        {
          apartados: celda.apartados,
          conContenido: celda.conContenido,
          revisados: celda.revisados,
          errores: celda.errores,
          avisos: celda.avisos,
        },
        esperado,
        `la celda ${fila.unidadId} × ${celda.seccion} no dice lo mismo que el árbol y las validaciones`,
      );
      comparadas += 1;
    }
  }
  assert.equal(comparadas, 15, 'tres unidades por cinco bloques');
});

prueba('el recuento de avisos y «se puede aprobar» son los del panel de comprobaciones, no otros', async () => {
  const { u, doc } = await escenario();
  const c = await cuerpoDe(await coordinacion(u.jefa, doc._id));
  const v = await cuerpoDe(await panel(u.jefa, doc._id));

  assert.deepEqual(c.cuenta, v.cuenta, 'dos recuentos distintos en la misma pantalla es el fallo que esto viene a evitar');
  assert.equal(c.totalAvisos, v.total);
  assert.equal(c.puedeAprobarse, v.puedeAprobarse);
  assert.equal(c.convenioCe, v.convenioCe);
  assert.equal(c.puedeAprobarse, false, 'hay errores de ponderación y un módulo sin docentes');

  // Y el recuento por unidad también es el del panel.
  for (const fila of c.filas) {
    const grupo = v.grupos.find((g) => g.unidadId === fila.unidadId);
    assert.deepEqual(fila.cuenta, grupo.cuenta, `la unidad ${fila.unidadId}`);
  }
});

prueba('un error que no es de ningún bloque —la unidad sin docentes— cuenta en la fila y en ninguna celda', async () => {
  const { u, doc } = await escenario();
  const c = await cuerpoDe(await coordinacion(u.jefa, doc._id));
  const fila = c.filas.find((f) => f.unidadId === BBDD);

  assert.ok(fila.cuenta.error > 0, 'sin docentes es un error (core/validaciones.js)');
  assert.equal(fila.celdas.reduce((n, x) => n + x.errores, 0), 0,
    'el aviso cuelga de la unidad, no de un apartado: sumarlo a una celda sería mentir sobre dónde está');
  assert.equal(fila.sinDocentes, true);
});

prueba('el resumen cuenta el documento entero —también los apartados comunes— y las celdas por estado', async () => {
  const { u, doc } = await escenario();
  const c = await cuerpoDe(await coordinacion(u.jefa, doc._id));
  const { arbol, revision } = await cuerpoDe(await arbolDe(u.jefa, doc._id));
  const hojas = nodosDe(arbol).filter((n) => n.contenido);

  assert.equal(c.resumen.apartados, hojas.length, 'los mismos apartados que cuenta la barra lateral');
  assert.equal(c.resumen.conContenido, hojas.filter((n) => n.relleno).length);
  assert.equal(c.resumen.revisados, revision.revisados, 'el mismo progreso por revisión que /arbol');
  assert.equal(c.resumen.unidades, 3);

  const celdas = c.filas.flatMap((f) => f.celdas).filter((x) => x.estado);
  const suma = Object.values(c.resumen.celdas).reduce((a, b) => a + b, 0);
  assert.equal(suma, celdas.length, 'el recuento por estado cuadra con las celdas que tienen estado');
  assert.equal(c.resumen.celdas.errores, celdas.filter((x) => x.estado === 'errores').length);
});

prueba('la coordinación NO lleva el contenido dentro: es un resumen', async () => {
  const { u, doc } = await escenario();
  const respuesta = await coordinacion(u.jefa, doc._id);
  const texto = await respuesta.text();

  assert.ok(!texto.includes(MARCA), 'ni una palabra del contenido del documento');
  assert.ok(!texto.includes('"valores"'), 'ni un `valores`');
  // Ni los valores de las tablas estructuradas: el nombre de la sección sí sale —es la columna—,
  // pero su contenido no.
  assert.ok(!texto.includes('fundamental'), 'ni los criterios de las ponderaciones');
  assert.ok(!texto.includes('Reconoce las características'), 'ni los resultados de aprendizaje');
  const c = JSON.parse(texto);
  // Los bloques viajan UNA vez y no una por unidad: es la diferencia entre 8 títulos y 88.
  assert.equal(c.bloques.length, 5);
  for (const fila of c.filas) {
    for (const celda of fila.celdas) {
      assert.deepEqual(
        Object.keys(celda).sort(),
        ['apartados', 'avisos', 'conContenido', 'destino', 'errores', 'estado', 'existe', 'revisados', 'seccion'],
        'una celda son números, su sección y a dónde lleva; nada más',
      );
    }
  }
});

prueba('la celda dice a dónde lleva el clic: el apartado de esa unidad', async () => {
  const { u, doc } = await escenario();
  const c = await cuerpoDe(await coordinacion(u.jefa, doc._id));
  const fila = c.filas.find((f) => f.unidadId === PROG);

  assert.deepEqual(fila.destino, { seccion: 'modulos', unidadId: PROG }, 'el encabezado de fila lleva a la unidad');
  assert.deepEqual(
    fila.celdas.find((x) => x.seccion === 'modulos/ponderaciones').destino,
    { seccion: 'modulos/ponderaciones', unidadId: PROG },
  );

  // Y ese destino se puede abrir: es el par (seccion, unidad) de la ruta del apartado.
  const a = await cuerpoDe(await leerApartado(u.ana, doc._id, 'modulos/ponderaciones', PROG));
  assert.equal(a.seccion, 'modulos/ponderaciones');
  assert.equal(a.unidadId, PROG);
});

prueba('dar un apartado por revisado mueve su celda de «completo» a «validado»', async () => {
  const { u, doc } = await escenario();
  const antes = await cuerpoDe(await coordinacion(u.jefa, doc._id));
  const celdaDe = (c) => c.filas.find((f) => f.unidadId === BBDD).celdas.find((x) => x.seccion === 'modulos/desarrollo');
  assert.equal(celdaDe(antes).estado, 'completo');
  assert.equal(celdaDe(antes).revisados, 0);

  for (const seccion of ['modulos/desarrollo', 'modulos/desarrollo/contenidos']) {
    const a = await cuerpoDe(await leerApartado(u.jefa, doc._id, seccion, BBDD));
    assert.equal((await revisar(u.jefa, doc._id, seccion, BBDD, a.updatedAt)).status, 200);
  }

  const despues = await cuerpoDe(await coordinacion(u.jefa, doc._id));
  assert.equal(celdaDe(despues).estado, 'validado');
  assert.equal(celdaDe(despues).revisados, 2);
});

prueba('un apartado retirado deja de contar en su celda, igual que deja de salir en el árbol', async () => {
  const { u, doc } = await escenario();
  const antes = await cuerpoDe(await coordinacion(u.jefa, doc._id));
  const celdaDe = (c) => c.filas.find((f) => f.unidadId === PROG).celdas.find((x) => x.seccion === 'modulos/desarrollo');
  assert.equal(celdaDe(antes).apartados, 2);

  const r = await Estructura.RETIRAR(
    pet(`/api/documentos/${doc._id}/estructura/apartado/retirar?seccion=${encodeURIComponent('modulos/desarrollo/contenidos')}`,
      u.jefa, { metodo: 'POST', cuerpo: {} }),
    { id: doc._id },
  );
  assert.equal(r.status, 200, 'la jefatura del departamento retira apartados');

  const despues = await cuerpoDe(await coordinacion(u.jefa, doc._id));
  assert.equal(celdaDe(despues).apartados, 1, 'la estructura retirada se poda en abrirDocumento, una vez y para todas las rutas');
  assert.equal(celdaDe(despues).estado, 'completo', 'lo que quedaba estaba escrito y heredado');
});

prueba('un documento sin unidades sale en modo «comun»: una fila por apartado, y lo lleva la jefatura', async () => {
  const { u, pccf } = await escenario();
  const c = await cuerpoDe(await coordinacion(u.jefa, pccf._id));

  assert.equal(c.modo, 'comun');
  assert.deepEqual(c.bloques, []);
  assert.deepEqual(c.filas.map((f) => f.seccion), ['presentacion', 'organizacion']);
  assert.equal(c.filas[0].tipo, 'apartado');
  assert.equal(c.filas[0].estado, 'validado');
  // «Organización» tiene campos propios y un hijo sin escribir: dos apartados, ninguno escrito.
  assert.equal(c.filas[1].apartados, 2);
  assert.equal(c.filas[1].estado, 'vacio');
  assert.deepEqual(c.filas[0].responsables.map((p) => p.nombre), ['Jefatura del departamento']);
  assert.equal(c.resumen.unidades, 0);
  assert.deepEqual(c.filas[0].destino, { seccion: 'presentacion', unidadId: null });
});

prueba('la coordinación la ve cualquiera que vea el documento, y nadie más', async () => {
  const { u, doc } = await escenario();
  for (const persona of [u.admin, u.jefa, u.ana, u.luis, u.estudios]) {
    const r = await coordinacion(persona, doc._id);
    assert.equal(r.status, 200, `${persona.nombre} tiene que poder verla`);
  }
  await esError(await coordinacion(null, doc._id), 401, 'sin_identificar');
  await esError(await coordinacion(u.pepe, doc._id), 404, 'no_encontrado');
  await esError(await coordinacion(u.ana, 'no-existe'), 404, 'no_encontrado');
});

// ================================================================ pruebas: los comentarios

prueba('el hilo de un apartado empieza vacío y dice de qué apartado es', async () => {
  const { u, doc } = await escenario();
  const h = await cuerpoDe(await hilo(u.ana, doc._id, 'modulos/mejoras', PROG));

  assert.equal(h.documentoId, doc._id);
  assert.equal(h.seccion, 'modulos/mejoras');
  assert.equal(h.unidadId, PROG);
  assert.equal(h.titulo, 'Propuestas de mejora del curso anterior');
  assert.deepEqual(h.comentarios, []);
  assert.equal(h.total, 0);
  assert.equal(h.puedeComentar, true);
});

prueba('comentar guarda el comentario, lo firma quien pregunta y lo devuelve con 201', async () => {
  const { repo, u, doc } = await escenario();
  const r = await comentar(u.jefa, doc._id, 'modulos/mejoras', PROG, { texto: '  ¿Esto sigue valiendo para este curso?  ' });
  assert.equal(r.status, 201);
  const cuerpo = await r.json();

  assert.equal(cuerpo.comentario.texto, '¿Esto sigue valiendo para este curso?', 'recortado');
  assert.deepEqual(cuerpo.comentario.autor, { _id: u.jefa._id, nombre: 'Jefatura del departamento', rol: 'jefe_departamento' });
  assert.ok(cuerpo.comentario.fecha, 'lleva fecha, que la pone el repositorio');
  assert.ok(cuerpo.comentario._id);

  const guardados = await comentariosGuardados(repo, doc._id);
  assert.equal(guardados.length, 1);
  assert.equal(guardados[0].seccion, 'modulos/mejoras');
  assert.equal(guardados[0].unidadId, PROG);
  assert.equal(guardados[0].autor, u.jefa._id);
});

prueba('el hilo sale del más antiguo al más reciente, con el nombre de cada autor y sin su correo', async () => {
  const { u, doc } = await escenario();
  await comentar(u.jefa, doc._id, 'modulos/mejoras', PROG, { texto: 'Primero: ¿esto sigue valiendo?' });
  await comentar(u.ana, doc._id, 'modulos/mejoras', PROG, { texto: 'Segundo: lo actualizo esta semana.' });
  await comentar(u.jefa, doc._id, 'modulos/mejoras', PROG, { texto: 'Tercero: gracias.' });

  const h = await cuerpoDe(await hilo(u.ana, doc._id, 'modulos/mejoras', PROG));
  assert.deepEqual(h.comentarios.map((c) => c.texto.split(':')[0]), ['Primero', 'Segundo', 'Tercero']);
  assert.deepEqual(h.comentarios.map((c) => c.autor.nombre),
    ['Jefatura del departamento', 'Ana', 'Jefatura del departamento']);
  assert.equal(h.total, 3);
  assert.ok(!JSON.stringify(h).includes('@ejemplo.invalid'), 'el hilo dice quién pregunta, no cómo escribirle');
});

prueba('el hilo es de SU apartado: no se mezcla con el de otro módulo ni con el del apartado común', async () => {
  const { u, doc } = await escenario();
  await comentar(u.jefa, doc._id, 'modulos/mejoras', PROG, { texto: 'De Programación.' });
  await comentar(u.jefa, doc._id, 'modulos/mejoras', BBDD, { texto: 'De Bases de datos.' });
  await comentar(u.jefa, doc._id, 'introduccion', null, { texto: 'Del apartado común.' });

  const prog = await cuerpoDe(await hilo(u.ana, doc._id, 'modulos/mejoras', PROG));
  const bbdd = await cuerpoDe(await hilo(u.ana, doc._id, 'modulos/mejoras', BBDD));
  const comun = await cuerpoDe(await hilo(u.ana, doc._id, 'introduccion', null));

  assert.deepEqual(prog.comentarios.map((c) => c.texto), ['De Programación.']);
  assert.deepEqual(bbdd.comentarios.map((c) => c.texto), ['De Bases de datos.']);
  assert.deepEqual(comun.comentarios.map((c) => c.texto), ['Del apartado común.']);
});

prueba('COMENTA TODO EL QUE VE EL DOCUMENTO, no solo quien puede editarlo', async () => {
  const { u, doc } = await escenario();

  // La jefatura de estudios no edita NADA (core/permisos.js) y es quien aprueba: si comentar
  // exigiera permiso de edición, la persona que tiene que decir «esto falta» no podría decirlo.
  const a = await cuerpoDe(await leerApartado(u.estudios, doc._id, 'modulos/mejoras', PROG));
  assert.equal(a.puedeEditar, false, 'la jefatura de estudios no puede escribir en el apartado');
  const r = await comentar(u.estudios, doc._id, 'modulos/mejoras', PROG, { texto: 'Falta decir cómo se recupera.' });
  assert.equal(r.status, 201, 'y aun así puede preguntar: no es un 403');

  // Un docente en un módulo que no lleva: la coordinación entre módulos es el trabajo del
  // departamento, y el reparto decide quién ESCRIBE cada apartado, no quién puede hablar de él.
  const b = await cuerpoDe(await leerApartado(u.luis, doc._id, 'modulos/mejoras', PROG));
  assert.equal(b.puedeEditar, false);
  assert.equal((await comentar(u.luis, doc._id, 'modulos/mejoras', PROG, { texto: 'Esto se solapa con mi módulo.' })).status, 201);

  const h = await cuerpoDe(await hilo(u.ana, doc._id, 'modulos/mejoras', PROG));
  assert.deepEqual(h.comentarios.map((c) => c.autor.nombre), ['Jefatura de estudios', 'Luis']);
  assert.equal(h.puedeComentar, true);
});

prueba('un comentario no se puede firmar en nombre de otra persona', async () => {
  const { u, doc } = await escenario();
  const r = await comentar(u.ana, doc._id, 'modulos/mejoras', PROG, {
    texto: 'Lo firmo yo.', autor: u.jefa._id, fecha: '2000-01-01T00:00:00.000Z',
  });
  assert.equal(r.status, 201);
  const cuerpo = await r.json();
  assert.equal(cuerpo.comentario.autor._id, u.ana._id, 'el autor sale de la sesión, nunca del cuerpo');
  assert.ok(new Date(cuerpo.comentario.fecha).getFullYear() > 2020, 'la fecha la pone el repositorio');
});

prueba('sin identificar no se lee ni se escribe en el hilo: 401 y no se guarda nada', async () => {
  const { repo, doc } = await escenario();
  await esError(await hilo(null, doc._id, 'modulos/mejoras', PROG), 401, 'sin_identificar');
  await esError(await comentar(null, doc._id, 'modulos/mejoras', PROG, { texto: 'Hola.' }), 401, 'sin_identificar');
  assert.deepEqual(await comentariosGuardados(repo, doc._id), []);
});

prueba('un documento de otro departamento da 404 al leer y al comentar, y no guarda nada', async () => {
  const { repo, u, doc, otro } = await escenario();
  await esError(await hilo(u.pepe, doc._id, 'modulos/mejoras', PROG), 404, 'no_encontrado');
  await esError(await comentar(u.pepe, doc._id, 'modulos/mejoras', PROG, { texto: 'Hola.' }), 404, 'no_encontrado');
  await esError(await hilo(u.ana, otro._id, 'introduccion', null), 404, 'no_encontrado');
  await esError(await comentar(u.ana, otro._id, 'introduccion', null, { texto: 'Hola.' }), 404, 'no_encontrado');
  assert.deepEqual(await comentariosGuardados(repo, doc._id), []);
  assert.deepEqual(await comentariosGuardados(repo, otro._id), []);
});

prueba('un apartado que no es de este documento da 404, y uno retirado también', async () => {
  const { repo, u, doc } = await escenario();
  await esError(await hilo(u.ana, doc._id, 'no-existe', null), 404, 'no_encontrado');
  await esError(await comentar(u.ana, doc._id, 'no-existe', null, { texto: 'Hola.' }), 404, 'no_encontrado');
  await esError(await comentar(u.ana, doc._id, 'modulos/mejoras', 'daw-9999', { texto: 'Hola.' }), 404, 'no_encontrado');

  const r = await Estructura.RETIRAR(
    pet(`/api/documentos/${doc._id}/estructura/apartado/retirar?seccion=${encodeURIComponent('introduccion/contexto')}`,
      u.jefa, { metodo: 'POST', cuerpo: {} }),
    { id: doc._id },
  );
  assert.equal(r.status, 200);
  await esError(await comentar(u.ana, doc._id, 'introduccion/contexto', null, { texto: 'Hola.' }), 404, 'no_encontrado');
  assert.deepEqual(await comentariosGuardados(repo, doc._id), []);
});

prueba('un enlace mal construido da 400: sin sección, o sin decir de qué módulo habla', async () => {
  const { repo, u, doc } = await escenario();
  await esError(await hiloSinSeccion(u.ana, doc._id), 400, 'peticion');
  await esError(await comentarSinSeccion(u.ana, doc._id, { texto: 'Hola.' }), 400, 'peticion');
  // Un apartado de módulo sin módulo, y un apartado común con módulo.
  await esError(await comentar(u.ana, doc._id, 'modulos/mejoras', null, { texto: 'Hola.' }), 400, 'peticion');
  await esError(await comentar(u.ana, doc._id, 'introduccion', PROG, { texto: 'Hola.' }), 400, 'peticion');
  assert.deepEqual(await comentariosGuardados(repo, doc._id), []);
});

prueba('un comentario vacío, demasiado largo o mal formado da 400 y no se guarda', async () => {
  const { repo, u, doc } = await escenario();
  const mal = (cuerpo) => comentar(u.ana, doc._id, 'modulos/mejoras', PROG, cuerpo);

  await esError(await mal({ texto: '' }), 400, 'peticion');
  await esError(await mal({ texto: '   \n  ' }), 400, 'peticion');
  await esError(await mal({}), 400, 'peticion');
  await esError(await mal({ texto: 42 }), 400, 'peticion');
  await esError(await mal({ texto: 'x'.repeat(Comentarios.LARGO_MAXIMO + 1) }), 400, 'peticion');
  await esError(await mal('esto no es json'), 400, 'peticion');
  await esError(await mal('[]'), 400, 'peticion');
  assert.deepEqual(await comentariosGuardados(repo, doc._id), []);

  // Y justo en el límite sí entra: el error es pasarse, no llegar.
  assert.equal((await mal({ texto: 'x'.repeat(Comentarios.LARGO_MAXIMO) })).status, 201);
});

prueba('un autor que ya no está en el censo no esconde su comentario: sale sin nombre', async () => {
  const { repo, u, doc } = await escenario();
  await comentar(u.ana, doc._id, 'modulos/mejoras', PROG, { texto: 'Lo dejo escrito antes de irme.' });
  // No hay forma de borrar a una persona por la API —su id está dentro de los repartos— así que se
  // simula el caso que sí puede pasar: un id guardado que ya no resuelve a nadie.
  const fila = (await repo.comentarios.listar(doc._id))[0];
  await repo.comentarios.crear({
    documentoId: doc._id, seccion: 'modulos/mejoras', unidadId: PROG,
    autor: 'alguien-que-ya-no-esta', texto: 'Y esto lo escribió alguien que ya no está.',
  });

  const h = await cuerpoDe(await hilo(u.ana, doc._id, 'modulos/mejoras', PROG));
  assert.equal(h.comentarios.length, 2);
  assert.equal(h.comentarios[0].autor.nombre, 'Ana');
  assert.deepEqual(h.comentarios[1].autor, { _id: 'alguien-que-ya-no-esta', nombre: null, rol: null });
  assert.ok(fila, 'el primero sigue ahí');
});

prueba('AL ARRASTRAR EL CURSO LOS COMENTARIOS NO SE COPIAN', async () => {
  const { repo, u, doc } = await escenario();
  await comentar(u.jefa, doc._id, 'modulos/mejoras', PROG, { texto: '¿Esto sigue valiendo en 2026-27?' });
  await comentar(u.ana, doc._id, 'introduccion', null, { texto: 'Revisado en la reunión de octubre.' });

  const r = await Arrastre.CREAR(
    pet(`/api/documentos/${doc._id}/siguiente-curso`, u.jefa, { metodo: 'POST', cuerpo: {} }),
    { id: doc._id },
  );
  assert.equal(r.status, 201);
  const nuevo = (await r.json()).documento;

  // El curso nuevo arranca con la conversación en blanco: un comentario habla del texto de UN curso
  // («esto de 2026-27 hay que actualizarlo»), y copiarlo resucitaría preguntas ya contestadas como si
  // estuvieran pendientes, firmadas por quien nunca las hizo en ese documento.
  assert.deepEqual(await comentariosGuardados(repo, nuevo._id), [], 'el documento nuevo no hereda ningún comentario');
  assert.deepEqual(
    (await cuerpoDe(await hilo(u.ana, nuevo._id, 'modulos/mejoras', PROG))).comentarios, [],
    'y su hilo se lee vacío',
  );

  // Y el del curso que se cierra los conserva: están donde se escribieron, y se llega por `anteriorId`.
  assert.equal((await comentariosGuardados(repo, doc._id)).length, 2);
  assert.equal((await cuerpoDe(await hilo(u.ana, doc._id, 'modulos/mejoras', PROG))).comentarios.length, 1);
  assert.equal(nuevo.anteriorId, doc._id);
});

prueba('el curso nuevo sí hereda el reparto y los apartados, así que su coordinación se puede mirar', async () => {
  const { u, doc } = await escenario();
  const r = await Arrastre.CREAR(
    pet(`/api/documentos/${doc._id}/siguiente-curso`, u.jefa, { metodo: 'POST', cuerpo: {} }),
    { id: doc._id },
  );
  const nuevo = (await r.json()).documento;

  const c = await cuerpoDe(await coordinacion(u.jefa, nuevo._id));
  assert.deepEqual(c.filas.map((f) => f.unidadId), [PROG, BBDD, DESP]);
  assert.deepEqual(c.filas.find((f) => f.unidadId === PROG).docentes.map((d) => d.nombre), ['Ana']);
  // Todos los apartados nacen `heredado`: ni uno revisado, que es lo que pone el progreso a cero.
  const celdas = c.filas.flatMap((f) => f.celdas).filter((x) => x.estado);
  assert.equal(celdas.filter((x) => x.estado === 'validado').length, 0,
    'en el curso nuevo nadie ha mirado nada todavía');
  assert.equal(c.resumen.revisados, 0);
});

// Las pruebas van en serie, en el orden del fichero: el primer FALLO que se lee es el más cercano a
// la causa, como en test/api.js.
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
    : `\n${total} pruebas de coordinación y comentarios correctas`);
  process.exit(fallos ? 1 : 0);
}

ejecutar();
