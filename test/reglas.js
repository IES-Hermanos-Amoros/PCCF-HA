// LAS COMPROBACIONES DE UN DOCUMENTO, CONFIGURABLES: la mitad de servidor de la propuesta que
// docs/plan.md §7 lleva escrita desde el E0.
//
//   node test/reglas.js
//
// Sin levantar Next, sin red y sin base de datos: las rutas se llaman directamente con un `Request`
// normal, igual que en test/estados.js, test/estructura.js y las demás (docs/api.md, primera regla
// de forma).
//
// QUÉ SE PRUEBA, Y POR QUÉ ESTAS COSAS
//
// Lo que se construye son DOS COSAS DISTINTAS que es fácil confundir, y la mitad de estas pruebas
// existen para que no se confundan:
//
//   1. EL CONVENIO DE PONDERACIÓN DE LOS CRITERIOS. No es apagar una regla: es decir cuál de los dos
//      convenios legítimos usa el centro. Con el laxo, los 22 avisos de la PD de DAW que reparten
//      100 % dentro del RA dejan de ser avisos porque SON CORRECTOS.
//   2. LAS COMPROBACIONES DE CRITERIO DEL CENTRO, con `{ activa, severidad }`.
//
// Y LAS DOS NORMATIVAS NO SE TOCAN: pedirlo es un 400 con el motivo. Hay una prueba por cada una, y
// si algún día alguien las hace configurables estas dos pruebas se ponen rojas y tendrá que ser una
// decisión explícita.
//
// LA TRAMPA QUE ESTAS PRUEBAS VIGILAN
//
// El criterio de aceptación del E4 es que los avisos del panel coincidan UNO A UNO con los de la
// cajita roja del PDF. Si el panel pasa a usar el convenio del documento y el generador sigue con el
// suyo clavado, dejan de coincidir. Así que aquí se compara el panel con la cajita roja DE VERDAD,
// con los dos convenios, título por título y en orden.
//
// Y la otra mitad de la trampa: desactivar una comprobación de criterio del centro NO PUEDE CAMBIAR
// EL PDF, porque la cajita roja solo imprime las dos normativas. Se comprueba sobre la definición
// entera de pdfmake, no sobre la cajita: si cambiara cualquier otra cosa del tomo, también saldría.
//
// LAS CUENTAS DEL DOCUMENTO REAL, MEDIDAS Y NO ESTIMADAS
//
// Los documentos del departamento no están en el repositorio —no se versionan,
// docs/entrada_ej/README.md—, así que una prueba que dependiera de ellos no se podría ejecutar en
// otra máquina ni en CI. Es lo mismo que explican test/estados.js y scripts/test-importar-docx.js.
// Lo que sí se puede dejar aquí son las cifras, medidas sobre la PD de DAW 2026-27 con esta misma
// lógica (importar → /comprobaciones → /validaciones → /pdf):
//
//                        errores   sin_docente  criterios_de_ra  suma_de_ra  convenio   impresos
//   convenio estricto       45          11            10             2          22         34
//   convenio laxo           23          11            10             2           0         12
//
// Los 22 del convenio desaparecen y queda lo que de verdad hay que arreglar: once módulos sin
// profesorado y doce ponderaciones descuadradas. Y los avisos impresos siguen coincidiendo uno a uno
// con los del panel en los dos casos, 34 y 34 y 12 y 12, que es el criterio de aceptación del E4.
//
// El documento sintético de abajo reproduce esa forma a escala, y las pruebas afirman sus cifras.
//
// EL ARNÉS ES EL DE test/estados.js, copiado y no importado, a propósito: una prueba que depende de
// otra se rompe cuando alguien toca la otra. Cada prueba monta su propio almacén, porque todas
// escriben.

'use strict';

const assert = require('assert/strict');

const { crearRepositorio } = require('../repositorio');
const memoria = require('../repositorio/memoria');
const Unidades = require('../core/unidades');
const Sa = require('../core/sa');
const Val = require('../core/validaciones');
const C = require('../core/permisos');
const { aFilas } = require('../core/documento');
const { buildDocDefinition } = require('../motor/render-generico');

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
const Comprobaciones = require('../app/_lib/rutas/comprobaciones');
const Validaciones = require('../app/_lib/rutas/validaciones');
const Estado = require('../app/_lib/rutas/estado');
const Arrastre = require('../app/_lib/rutas/arrastre');
const Pdf = require('../app/_lib/rutas/pdf');

// ---------------------------------------------------------------- ayudas

const TESTIGOS = new Map();

function pet(camino, persona, { metodo = 'GET', cuerpo } = {}) {
  const cabeceras = persona ? { cookie: `${COOKIE_SESION}=${TESTIGOS.get(persona._id)}` } : {};
  let cuerpoCrudo;
  if (cuerpo !== undefined) {
    cuerpoCrudo = typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo);
    cabeceras['content-type'] = 'application/json';
  }
  return new Request(`http://pruebas.local${camino}`, { method: metodo, headers: cabeceras, body: cuerpoCrudo });
}

async function esError(respuesta, estado, codigo) {
  assert.equal(respuesta.status, estado, `se esperaba un ${estado} y ha sido un ${respuesta.status}`);
  const cuerpo = await respuesta.json();
  assert.equal(cuerpo.error, codigo, `se esperaba «${codigo}» y ha sido «${cuerpo.error}»`);
  assert.equal(typeof cuerpo.mensaje, 'string');
  assert.ok(cuerpo.mensaje.length > 0, 'el error no lleva mensaje');
  return cuerpo;
}

// ---------------------------------------------------------------- las rutas

const leerConfig = async (persona, id) => Comprobaciones.GET(
  pet(`/api/documentos/${id}/comprobaciones`, persona), { id },
);

const cambiarConfig = (persona, id, cuerpo) => Comprobaciones.CAMBIAR(
  pet(`/api/documentos/${id}/comprobaciones`, persona, { metodo: 'PATCH', cuerpo }), { id },
);

// Un cambio que tiene que salir bien. Devuelve el cuerpo.
async function configurar(persona, id, cuerpo) {
  const res = await cambiarConfig(persona, id, cuerpo);
  assert.equal(res.status, 200, `la configuración debería haber salido bien y ha dado ${res.status}`);
  return res.json();
}

const panelDe = async (persona, id) => (await Validaciones.GET(
  pet(`/api/documentos/${id}/validaciones`, persona), { id },
)).json();

const cambiarEstado = (persona, id, estado) => Estado.CAMBIAR(
  pet(`/api/documentos/${id}/estado`, persona, { metodo: 'POST', cuerpo: { estado } }), { id },
);

async function paso(persona, id, estado) {
  const res = await cambiarEstado(persona, id, estado);
  assert.equal(res.status, 200, `«${estado}» debería haber salido bien y ha dado ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------- el PDF

// La misma normalización de test/ida-y-vuelta.js y test/estados.js: `buildDocDefinition` devuelve
// `header`, `footer` y el `layout` de la cajita roja como cierres nuevos en cada llamada, y
// `deepStrictEqual` los compararía por referencia. Se sustituyen por su código fuente, y se
// reconstruyen objetos en lugar de pasar por JSON para no perder las claves con valor `undefined`.
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

const definicionDe = async (persona, id) => {
  const { definicion, fallo } = await Pdf.definicionDe(pet(`/api/documentos/${id}/pdf`, persona), { id });
  assert.equal(fallo, undefined, 'el PDF se tiene que poder generar');
  return definicion;
};

// Los avisos de las cajitas rojas de «Comprobaciones automáticas», en el orden del tomo y aplanados.
// Es exactamente lo que el departamento lee en el papel (`cajitas` de test/estructurados.js).
const deLaCajitaRoja = (d) => nodos(d)
  .filter((n) => n.table && n.table.body && n.table.body[0] && n.table.body[0][0]
    && n.table.body[0][0].stack && n.table.body[0][0].stack[0]
    && n.table.body[0][0].stack[0].text === 'Comprobaciones automáticas')
  .flatMap((n) => n.table.body[0][0].stack[1].ul);

// Los avisos del panel que dicen que van a salir impresos, en el orden del documento.
const delPanelImpresos = (panel) => panel.grupos.flatMap((g) => g.avisos)
  .filter((a) => a.impreso).map((a) => a.titulo);

// EL CRITERIO DE ACEPTACIÓN DEL E4, en una función: los dos listados, título por título y en orden.
function coincidenUnoAUno(panel, definicion, cuantos) {
  const dePanel = delPanelImpresos(panel);
  const dePapel = deLaCajitaRoja(definicion);
  assert.deepStrictEqual(dePanel, dePapel,
    'los avisos del panel y los de la cajita roja del PDF han dejado de coincidir uno a uno');
  if (cuantos !== undefined) {
    assert.equal(dePapel.length, cuantos, `se esperaban ${cuantos} avisos impresos y han salido ${dePapel.length}`);
  }
  return dePapel;
}

const avisosDe = (panel, regla) => panel.grupos.flatMap((g) => g.avisos).filter((a) => a.regla === regla);

const porRegla = (panel) => {
  const out = {};
  for (const g of panel.grupos) {
    for (const a of g.avisos) {
      if (a.severidad !== 'error') continue;
      const k = a.convenio === Val.CIEN_DENTRO_DEL_RA ? Val.CIEN_DENTRO_DEL_RA : a.regla;
      out[k] = (out[k] || 0) + 1;
    }
  }
  return out;
};

// ================================================================ el documento de partida
//
// El mismo de test/estados.js, que reproduce a escala la forma del documento real: cuatro módulos,
// uno con una ponderación descuadrada de verdad, otro con dos del OTRO CONVENIO, uno sin profesorado
// y uno que está bien. Cada módulo trae una situación de aprendizaje que trabaja el RA1 y no el RA2,
// así que además hay cuatro AVISOS de `ra_sin_situacion`: hacen falta para poder apagar una
// comprobación de criterio y mirar qué pasa con el PDF.
//
//   daw-0485  Programación                   ponderaciones que cuadran      0 errores · 1 aviso
//   daw-0484  Base de datos                  una descuadrada de verdad      1 error   · 1 aviso
//   daw-0614  Despliegue de aplicaciones web dos del OTRO CONVENIO          2 errores · 1 aviso
//   daw-0487  Entornos de desarrollo         sin profesorado asignado       1 error   · 1 aviso

const campoTexto = { id: 'texto', tipo: 'texto_largo', etiqueta: 'Texto' };

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

// Una errata de verdad: los criterios del RA1 suman 35 y el RA pondera 40. No suman 100, así que no
// es el otro convenio y el convenio laxo no la arregla.
const PONDERACIONES_ERRATA = [
  { ra: 1, texto: 'Reconoce las características de los lenguajes de marcas.', ponderacion: 40, ce: [
    { letra: 'a', texto: 'Se han identificado las etiquetas.', ponderacion: 20, fundamental: true },
    { letra: 'b', texto: 'Se ha reconocido la jerarquía.', ponderacion: 15, fundamental: false },
  ] },
  { ra: 2, texto: 'Valida documentos contra un esquema.', ponderacion: 60, ce: [
    { letra: 'a', texto: 'Se ha validado con un esquema.', ponderacion: 60, fundamental: false },
  ] },
];

// EL OTRO CONVENIO: los criterios de cada RA suman exactamente 100 % dentro de su RA. Con el estricto
// son dos errores; con el laxo, ninguno, porque es uno de los dos repartos legítimos.
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

const datosDe = (u, { todasOk = false, todosConDocente = false } = {}) => ({
  departamento: 'informatica',
  documento: {
    introduccion: { texto: [{ type: 'p', text: 'Esta programación la escribe el departamento de Informática.' }] },
  },
  instancias: MODULOS.map((id) => ({
    titulo: Unidades.tituloDe(id, '2026-27'),
    num: null,
    grupo: 'Módulos del primer curso',
    docentes: (!todosConDocente && id === SIN_NADIE) ? [] : [u.ana._id],
    valores: {
      'modulos/resultados-de-aprendizaje': { ra_ce: RA_CE },
      'modulos/metodologia': { texto: [{ type: 'p', text: `Metodología de ${Unidades.tituloDe(id, '2026-27')}.` }] },
      'modulos/ponderaciones': { ponderaciones: todasOk ? PONDERACIONES_OK : PONDERACIONES_DE[id] },
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

async function personas(repo) {
  const una = async (nombre, email, rol, departamento) => {
    const p = await repo.usuarios.crear({ nombre, email, rol, departamento });
    const { testigo } = await abrirSesion(repo, p._id);
    TESTIGOS.set(p._id, testigo);
    return p;
  };
  return {
    admin: await una('Soporte', 'soporte@ejemplo.invalid', 'admin', 'informatica'),
    jefa: await una('Jefatura del departamento', 'jefatura@ejemplo.invalid', 'jefe_departamento', 'informatica'),
    ana: await una('Ana', 'ana@ejemplo.invalid', 'docente', 'informatica'),
    estudios: await una('Jefatura de estudios', 'estudios@ejemplo.invalid', 'jefe_estudios', 'direccion'),
    // De matemáticas: no ve este documento, y por eso recibe 404 y no 403 (docs/api.md).
    otraJefa: await una('Jefatura de matemáticas', 'mates@ejemplo.invalid', 'jefe_departamento', 'matematicas'),
  };
}

// El documento con los cuatro errores y los cuatro avisos.
async function escenario(opciones) {
  const repo = nuevoAlmacen();
  const u = await personas(repo);
  const doc = await sembrar(repo, aFilas({ plantilla: PLANTILLA, datos: datosDe(u, opciones) }, OPCIONES));
  return { repo, u, doc };
}

// Un documento cuyo ÚNICO error es `sin_docente`: todas las ponderaciones cuadran y un módulo no
// lleva nadie. Es el que sirve para mirar qué pasa con la puerta de aprobación al bajarle la
// severidad, sin que los errores de las ponderaciones se interpongan.
const escenarioSoloSinDocente = () => escenario({ todasOk: true });

// ================================================================ 1. un documento sin configurar

prueba('un documento sin configurar no guarda nada y usa el convenio estricto y las severidades de siempre', async () => {
  const { repo, u, doc } = await escenario();

  // No se le ha añadido ningún campo: lo que no se configura no existe.
  assert.equal((await repo.documentos.obtener(doc._id)).comprobaciones, undefined,
    'un documento que nadie ha configurado no puede llevar configuración guardada');

  const config = await (await leerConfig(u.jefa, doc._id)).json();
  assert.equal(config.convenioCe, Val.CONVENIOS_CE.PESO_DEL_RA, 'el convenio de serie es el estricto');
  assert.deepStrictEqual(config.cambios, [], 'sin configurar no hay nada que contar');
  for (const r of config.reglas) {
    assert.equal(r.activa, true, `«${r.regla}» tendría que estar activa de serie`);
    assert.equal(r.severidad, r.severidadPorOmision, `«${r.regla}» no tiene su severidad de serie`);
  }

  // Y el panel cuenta lo que contaba antes del E7: los cuatro errores y los cuatro avisos.
  const panel = await panelDe(u.jefa, doc._id);
  assert.equal(panel.convenioCe, Val.CONVENIOS_CE.PESO_DEL_RA);
  assert.deepStrictEqual(panel.desactivadas, [], 'sin configurar no hay ninguna comprobación apagada');
  assert.deepStrictEqual(porRegla(panel), {
    sin_docente: 1, criterios_de_ra: 1, [Val.CIEN_DENTRO_DEL_RA]: 2,
  });
  assert.equal(panel.cuenta.aviso, 4, 'los cuatro avisos de RA sin situación de aprendizaje');
  assert.equal(panel.puedeAprobarse, false);
});

prueba('el PDF de un documento sin configurar es EXACTAMENTE el de antes del E7', async () => {
  // La condición que no se puede romper: el convenio estricto sigue siendo el de partida. Se compara
  // la definición que da la ruta con la que da el motor SIN pasarle ningún convenio, que es la
  // llamada que hacían —y siguen haciendo— los guiones y las pruebas del motor.
  const { repo, u, doc } = await escenario();

  const porLaRuta = comparable(await definicionDe(u.jefa, doc._id));

  const { leerParaElMotor, tituloDelTomo, SUBTITULO } = require('../app/_lib/rutas/comun');
  const documento = await repo.documentos.obtener(doc._id);
  const { plantilla, datos } = await leerParaElMotor(repo, documento);
  const delMotor = comparable(buildDocDefinition({
    plantilla,
    datos,
    instancias: 'todas',
    titulo: tituloDelTomo(documento, null),
    subtitulo: SUBTITULO,
    estado: 'borrador',
    // Sin `convenioCe`: la omisión es el estricto, y es lo que esta prueba vigila.
  }));

  assert.deepStrictEqual(porLaRuta, delMotor,
    'la ruta del PDF ha dejado de dar la misma definición que el motor por su cuenta');

  // Y los dos listados coinciden uno a uno, que es el criterio del E4: dos de las ponderaciones son
  // del otro convenio, una es una errata y una suma de RA no cuadra en ningún módulo.
  const panel = await panelDe(u.jefa, doc._id);
  coincidenUnoAUno(panel, await definicionDe(u.jefa, doc._id), 3);
});

prueba('pedir la configuración que ya está no escribe nada y no deja fila en el historial', async () => {
  const { repo, u, doc } = await escenario();
  const antes = await panelDe(u.jefa, doc._id);

  const hecho = await configurar(u.estudios, doc._id, {
    convenioCe: Val.CONVENIOS_CE.PESO_DEL_RA,
    reglas: { sin_docente: { activa: true, severidad: 'error' } },
  });
  assert.deepStrictEqual(hecho.aplicados, [], 'pedir lo que ya estaba no cambia nada');
  assert.deepStrictEqual(hecho.cambios, [], 'y no puede dejar una fila en el historial que no dice nada');
  assert.equal((await repo.documentos.obtener(doc._id)).comprobaciones, undefined,
    'un cambio que no cambia nada no puede dejar el campo escrito');
  assert.deepStrictEqual(await panelDe(u.jefa, doc._id), antes, 'el panel ha cambiado sin que nadie cambie nada');
});

prueba('una configuración puesta a mano con los valores de serie da el mismo panel que no tener ninguna', async () => {
  // Es la otra forma de decir lo mismo, y protege de que `normalizarConfig` interprete lo guardado de
  // una manera y la ausencia de otra.
  const { repo, u, doc } = await escenario();
  const sinNada = await panelDe(u.jefa, doc._id);

  const reglas = {};
  for (const r of Val.REGLAS) if (!r.fija) reglas[r.regla] = { activa: true, severidad: r.severidad };
  await repo.documentos.actualizar(doc._id, {
    comprobaciones: { convenioCe: Val.CONVENIOS_CE.PESO_DEL_RA, reglas },
  });

  assert.deepStrictEqual(await panelDe(u.jefa, doc._id), sinNada);
});

// ================================================================ 2. el convenio de ponderación

prueba('cambiar el convenio al laxo quita esos avisos del panel Y de la cajita roja del PDF, y siguen coincidiendo uno a uno', async () => {
  const { u, doc } = await escenario();

  const antesPanel = await panelDe(u.jefa, doc._id);
  const antesPapel = coincidenUnoAUno(antesPanel, await definicionDe(u.jefa, doc._id), 3);
  assert.equal(avisosDe(antesPanel, 'criterios_de_ra').filter((a) => a.convenio === Val.CIEN_DENTRO_DEL_RA).length, 2,
    'con el estricto hay dos avisos que son el otro convenio');

  await configurar(u.estudios, doc._id, { convenioCe: Val.CONVENIOS_CE.PESO_DEL_RA_O_CIEN });

  const panel = await panelDe(u.jefa, doc._id);
  assert.equal(panel.convenioCe, Val.CONVENIOS_CE.PESO_DEL_RA_O_CIEN, 'el panel tiene que decir con qué regla ha medido');
  assert.equal(panel.delOtroConvenio, 0, 'con el laxo esos repartos son correctos: no quedan avisos del convenio');
  assert.deepStrictEqual(porRegla(panel), { sin_docente: 1, criterios_de_ra: 1 },
    'con el laxo quedan la errata de verdad y el módulo sin profesorado');

  // LA TRAMPA: el PDF tiene que haber cambiado con el panel, y seguir coincidiendo uno a uno.
  const papel = coincidenUnoAUno(panel, await definicionDe(u.jefa, doc._id), 1);
  assert.equal(antesPapel.length - papel.length, 2,
    'los dos avisos del convenio tienen que haber desaparecido también del papel');

  // Y no se han desactivado: el documento no tiene ninguna comprobación apagada.
  assert.deepStrictEqual(panel.desactivadas, [],
    'cambiar el convenio no es apagar una regla: es decidir cuál de los dos repartos vale');
});

prueba('volver al convenio estricto devuelve los avisos al panel y al papel', async () => {
  const { u, doc } = await escenario();
  const original = coincidenUnoAUno(await panelDe(u.jefa, doc._id), await definicionDe(u.jefa, doc._id), 3);

  await configurar(u.estudios, doc._id, { convenioCe: Val.CONVENIOS_CE.PESO_DEL_RA_O_CIEN });
  coincidenUnoAUno(await panelDe(u.jefa, doc._id), await definicionDe(u.jefa, doc._id), 1);

  const vuelta = await configurar(u.estudios, doc._id, { convenioCe: Val.CONVENIOS_CE.PESO_DEL_RA });
  assert.equal(vuelta.convenioCe, Val.CONVENIOS_CE.PESO_DEL_RA);
  assert.deepStrictEqual(
    coincidenUnoAUno(await panelDe(u.jefa, doc._id), await definicionDe(u.jefa, doc._id), 3),
    original,
  );
  // Pero el historial se queda: que alguien decidiera y se volviera atrás es un hecho que hay que
  // poder contar, aunque la configuración haya vuelto a lo de serie.
  assert.equal(vuelta.cambios.length, 2, 'los dos cambios del convenio tienen que constar');
});

prueba('un convenio que no existe es un 400 y no cambia nada', async () => {
  const { u, doc } = await escenario();
  const cuerpo = await esError(await cambiarConfig(u.estudios, doc._id, { convenioCe: 'el_que_me_guste' }), 400, 'peticion');
  assert.ok(cuerpo.mensaje.includes('peso_del_ra'), cuerpo.mensaje);
  assert.equal((await panelDe(u.jefa, doc._id)).convenioCe, Val.CONVENIOS_CE.PESO_DEL_RA);
});

// ================================================================ 3. las comprobaciones de criterio

prueba('desactivar una comprobación de criterio la quita del panel y NO cambia el PDF', async () => {
  const { u, doc } = await escenario();

  const antesPanel = await panelDe(u.jefa, doc._id);
  const antesPdf = comparable(await definicionDe(u.jefa, doc._id));
  assert.equal(avisosDe(antesPanel, 'ra_sin_situacion').length, 4);

  await configurar(u.estudios, doc._id, { reglas: { ra_sin_situacion: { activa: false } } });

  const panel = await panelDe(u.jefa, doc._id);
  assert.equal(avisosDe(panel, 'ra_sin_situacion').length, 0, 'una comprobación apagada no deja ni un aviso');
  assert.equal(panel.cuenta.aviso, 0, 'y por tanto el recuento de avisos baja a cero');
  assert.deepStrictEqual(panel.desactivadas, ['ra_sin_situacion'], 'el panel tiene que decir qué está apagado');

  // LO QUE NO PUEDE PASAR: que el papel cambie. La cajita roja solo imprime las dos normativas, así
  // que apagar una comprobación de criterio del centro no puede mover ni un nodo del tomo.
  assert.deepStrictEqual(comparable(await definicionDe(u.jefa, doc._id)), antesPdf,
    'apagar una comprobación de criterio del centro ha cambiado el PDF, y no puede');

  // Y los dos listados siguen coincidiendo: los errores de ponderaciones se quedan como estaban.
  coincidenUnoAUno(panel, await definicionDe(u.jefa, doc._id), 3);
});

prueba('desactivar la comprobación de las unidades sin docente quita su error del panel y tampoco cambia el PDF', async () => {
  // `sin_docente` es la única de criterio del centro que es ERROR, así que es la que de verdad mueve
  // el listón de la aprobación. Y aun así no se imprime: no sale en la cajita roja.
  const { u, doc } = await escenarioSoloSinDocente();

  const antesPdf = comparable(await definicionDe(u.jefa, doc._id));
  const antes = await panelDe(u.jefa, doc._id);
  assert.equal(antes.cuenta.error, 1, 'el único error de este documento es el módulo sin profesorado');
  assert.equal(antes.puedeAprobarse, false);

  await configurar(u.estudios, doc._id, { reglas: { sin_docente: { activa: false } } });

  const panel = await panelDe(u.jefa, doc._id);
  assert.equal(avisosDe(panel, 'sin_docente').length, 0);
  assert.equal(panel.cuenta.error, 0);
  assert.equal(panel.puedeAprobarse, true, 'sin errores abiertos, el documento se puede aprobar');
  assert.deepStrictEqual(comparable(await definicionDe(u.jefa, doc._id)), antesPdf,
    'apagar `sin_docente` ha cambiado el PDF, y no puede: no se imprime en la cajita roja');
});

prueba('bajarle la severidad a aviso deja de impedir la aprobación', async () => {
  const { repo, u, doc } = await escenarioSoloSinDocente();
  await paso(u.jefa, doc._id, 'revision');

  // Con la severidad de serie, el módulo sin profesorado bloquea.
  const rechazo = await esError(await cambiarEstado(u.estudios, doc._id, 'aprobado'), 409, 'con_errores');
  assert.equal(rechazo.errores, 1);
  assert.deepStrictEqual(rechazo.porRegla, { sin_docente: 1 });

  // Bajada a aviso, sigue saliendo en el panel —no se esconde— pero ya no bloquea.
  const hecho = await configurar(u.estudios, doc._id, { reglas: { sin_docente: { severidad: 'aviso' } } });
  assert.equal(hecho.reglas.find((r) => r.regla === 'sin_docente').severidad, 'aviso');

  const panel = await panelDe(u.jefa, doc._id);
  assert.equal(avisosDe(panel, 'sin_docente').length, 1, 'bajar la severidad no es apagar la comprobación');
  assert.equal(avisosDe(panel, 'sin_docente')[0].severidad, 'aviso');
  assert.equal(panel.cuenta.error, 0);
  assert.equal(panel.puedeAprobarse, true);

  const aprobado = await paso(u.estudios, doc._id, 'aprobado');
  assert.equal(aprobado.marcaDeAgua, false);
  assert.equal((await repo.documentos.obtener(doc._id)).estado, 'aprobado');
});

prueba('una severidad que no existe y una comprobación que no existe son 400 con el motivo', async () => {
  const { u, doc } = await escenario();

  const mala = await esError(await cambiarConfig(u.estudios, doc._id, {
    reglas: { sin_docente: { severidad: 'gravísimo' } },
  }), 400, 'peticion');
  assert.ok(mala.mensaje.includes('error'), mala.mensaje);

  const inventada = await esError(await cambiarConfig(u.estudios, doc._id, {
    reglas: { lo_que_sea: { activa: false } },
  }), 400, 'peticion');
  assert.ok(inventada.mensaje.includes('sin_docente'), 'el error tiene que decir cuáles son las comprobaciones que hay');

  const activa = await esError(await cambiarConfig(u.estudios, doc._id, {
    reglas: { sin_docente: { activa: 'no' } },
  }), 400, 'peticion');
  assert.ok(/true o false/.test(activa.mensaje), activa.mensaje);

  await esError(await cambiarConfig(u.estudios, doc._id, {}), 400, 'peticion');

  // Y ninguno de los cuatro ha escrito nada.
  assert.deepStrictEqual((await panelDe(u.jefa, doc._id)).desactivadas, []);
});

// ================================================================ 4. las dos normativas no se tocan

for (const regla of ['criterios_de_ra', 'suma_de_ra']) {
  prueba(`«${regla}» es normativa: no se puede desactivar, y el 400 dice por qué`, async () => {
    const { repo, u, doc } = await escenario();
    const antes = await panelDe(u.jefa, doc._id);

    const cuerpo = await esError(await cambiarConfig(u.estudios, doc._id, {
      reglas: { [regla]: { activa: false } },
    }), 400, 'peticion');
    assert.ok(/normativa/.test(cuerpo.mensaje), `el motivo tiene que decir que es normativa: ${cuerpo.mensaje}`);
    assert.ok(/real decreto/.test(cuerpo.mensaje), `y de dónde sale: ${cuerpo.mensaje}`);

    // Tampoco bajándole la severidad, que es la puerta de atrás de verdad: con «aviso» el documento
    // se aprobaría con las ponderaciones descuadradas.
    const baja = await esError(await cambiarConfig(u.estudios, doc._id, {
      reglas: { [regla]: { severidad: 'aviso' } },
    }), 400, 'peticion');
    assert.ok(/normativa/.test(baja.mensaje), baja.mensaje);

    // Ni una de las dos negativas ha escrito nada, y el panel es exactamente el de antes: una
    // normativa no se puede apagar ni a medias.
    assert.equal((await repo.documentos.obtener(doc._id)).comprobaciones, undefined,
      'una negativa no puede dejar nada escrito');
    assert.deepStrictEqual(await panelDe(u.jefa, doc._id), antes,
      'la negativa ha cambiado algo del panel, y no puede cambiar nada');
    assert.ok(Val.reglaDelCatalogo(regla).fija);
  });
}

prueba('ni una configuración metida a mano en la base de datos apaga una normativa', async () => {
  // La segunda cerradura: el 400 protege la puerta, y `normalizarConfig` protege el cálculo. Si solo
  // lo hiciera la ruta, un documento escrito a mano se aprobaría con las ponderaciones descuadradas.
  const { repo, u, doc } = await escenario();
  await repo.documentos.actualizar(doc._id, {
    comprobaciones: { reglas: { criterios_de_ra: { activa: false, severidad: 'info' } } },
  });

  const panel = await panelDe(u.jefa, doc._id);
  assert.ok(avisosDe(panel, 'criterios_de_ra').length > 0, 'la normativa se sigue comprobando');
  assert.ok(avisosDe(panel, 'criterios_de_ra').every((a) => a.severidad === 'error'));
  assert.deepStrictEqual(panel.desactivadas, []);

  // Y la lectura lo cuenta como lo que es: fija y activa.
  const config = await (await leerConfig(u.jefa, doc._id)).json();
  const fila = config.reglas.find((r) => r.regla === 'criterios_de_ra');
  assert.equal(fila.fija, true);
  assert.equal(fila.activa, true);
  assert.equal(fila.severidad, 'error');
});

// ================================================================ 5. quién la cambia y quién no

prueba('la configuración la cambia la jefatura de estudios y el soporte; el resto la ve en modo lectura', async () => {
  const { u, doc } = await escenario();

  // La ve quien ve el documento, con el candado resuelto.
  for (const [quien, puede] of [
    [u.estudios, true], [u.admin, true], [u.jefa, false], [u.ana, false],
  ]) {
    const res = await leerConfig(quien, doc._id);
    assert.equal(res.status, 200, `${quien.nombre} tendría que poder leerla`);
    const cuerpo = await res.json();
    assert.equal(cuerpo.puedeConfigurar, puede, `«puedeConfigurar» mal para ${quien.nombre}`);
    // Y coincide con la regla de core/, que es la que manda: el cliente solo refleja el candado.
    assert.equal(cuerpo.puedeConfigurar, C.puedeConfigurarComprobaciones(quien, { departamento: 'informatica' }));
  }

  // Y la cambian los dos que dicen que pueden.
  for (const quien of [u.estudios, u.admin]) {
    const res = await cambiarConfig(quien, doc._id, { reglas: { sa_sin_evaluacion: { activa: false } } });
    assert.equal(res.status, 200, `${quien.nombre} tendría que poder cambiarla`);
  }
});

prueba('401 sin identificar, 403 quien ve el documento y no configura, 404 si es de otro departamento', async () => {
  const { u, doc } = await escenario();

  await esError(await leerConfig(undefined, doc._id), 401, 'sin_identificar');
  await esError(await cambiarConfig(undefined, doc._id, { convenioCe: Val.CONVENIOS_CE.PESO_DEL_RA_O_CIEN }), 401, 'sin_identificar');

  // 403 y no 404: la jefatura del departamento y el docente VEN el documento, así que ya saben que
  // existe. Lo que no pueden es mover el listón de lo que se puede aprobar.
  for (const quien of [u.jefa, u.ana]) {
    const cuerpo = await esError(
      await cambiarConfig(quien, doc._id, { convenioCe: Val.CONVENIOS_CE.PESO_DEL_RA_O_CIEN }), 403, 'sin_permiso',
    );
    assert.ok(/jefatura de estudios/.test(cuerpo.mensaje), cuerpo.mensaje);
  }

  // 404 y no 403 para quien no ve el documento, que es el reparto de docs/api.md.
  await esError(await leerConfig(u.otraJefa, doc._id), 404, 'no_encontrado');
  await esError(await cambiarConfig(u.otraJefa, doc._id, { convenioCe: Val.CONVENIOS_CE.PESO_DEL_RA_O_CIEN }), 404, 'no_encontrado');

  // Y nada de lo anterior ha cambiado el documento.
  assert.equal((await panelDe(u.jefa, doc._id)).convenioCe, Val.CONVENIOS_CE.PESO_DEL_RA);
});

// ================================================================ 6. la constancia

prueba('queda constancia de quién cambió cada cosa y cuándo', async () => {
  const { repo, u, doc } = await escenario();
  const antes = Date.now();

  const hecho = await configurar(u.estudios, doc._id, {
    convenioCe: Val.CONVENIOS_CE.PESO_DEL_RA_O_CIEN,
    reglas: { sin_docente: { severidad: 'aviso' } },
  });

  // Una entrada por cosa cambiada, con quién y cuándo. El nombre y el rol se copian de la sesión y
  // nunca del cuerpo: quien mueve el listón es quien ha entrado, no quien dice ser.
  assert.equal(hecho.aplicados.length, 2);
  for (const c of hecho.aplicados) {
    assert.equal(c.por, u.estudios._id);
    assert.equal(c.nombre, 'Jefatura de estudios');
    assert.equal(c.rol, 'jefe_estudios');
    const cuando = new Date(c.en).getTime();
    assert.ok(cuando >= antes && cuando <= Date.now(), `la fecha del cambio no es de ahora: ${c.en}`);
  }

  const convenio = hecho.aplicados.find((c) => c.que === 'convenio');
  assert.deepStrictEqual(
    { antes: convenio.antes, despues: convenio.despues },
    { antes: Val.CONVENIOS_CE.PESO_DEL_RA, despues: Val.CONVENIOS_CE.PESO_DEL_RA_O_CIEN },
    'el cambio tiene que decir de qué a qué',
  );
  const severidad = hecho.aplicados.find((c) => c.que === 'regla');
  assert.equal(severidad.regla, 'sin_docente');
  assert.deepStrictEqual(severidad.antes, { activa: true, severidad: 'error' });
  assert.deepStrictEqual(severidad.despues, { activa: true, severidad: 'aviso' });

  // Está guardado en el documento, no solo en la respuesta, y se lee con el GET.
  const guardado = (await repo.documentos.obtener(doc._id)).comprobaciones;
  assert.equal(guardado.cambios.length, 2);
  assert.deepStrictEqual((await (await leerConfig(u.ana, doc._id)).json()).cambios, guardado.cambios,
    'el historial lo ve quien ve el documento, aunque no pueda cambiarlo');

  // Y un segundo cambio se añade al final, no sustituye.
  const segundo = await configurar(u.admin, doc._id, { reglas: { apartado_vacio: { activa: false } } });
  assert.equal(segundo.cambios.length, 3);
  assert.equal(segundo.cambios[2].por, u.admin._id);
  assert.equal(segundo.cambios[2].rol, 'admin');
});

prueba('lo guardado es solo lo que se aparta de lo de serie', async () => {
  const { repo, u, doc } = await escenario();
  await configurar(u.estudios, doc._id, { reglas: { sa_sin_evaluacion: { activa: false } } });

  const guardado = (await repo.documentos.obtener(doc._id)).comprobaciones;
  assert.equal(guardado.convenioCe, undefined, 'el convenio no se ha cambiado: no se guarda');
  assert.deepStrictEqual(Object.keys(guardado.reglas), ['sa_sin_evaluacion'],
    'solo se guarda la comprobación que se ha cambiado');
  assert.deepStrictEqual(guardado.reglas.sa_sin_evaluacion, { activa: false, severidad: 'aviso' });
});

prueba('el 409 si el documento ha cambiado desde que se leyó la pantalla', async () => {
  const { repo, u, doc } = await escenario();
  const leido = await (await leerConfig(u.estudios, doc._id)).json();

  // Alguien escribe en medio: cualquier escritura del documento mueve el token.
  await repo.documentos.actualizar(doc._id, { estado: 'revision' });

  const cuerpo = await esError(await cambiarConfig(u.estudios, doc._id, {
    convenioCe: Val.CONVENIOS_CE.PESO_DEL_RA_O_CIEN, esperaUpdatedAt: leido.updatedAt,
  }), 409, 'conflicto');
  assert.equal(cuerpo.esperado, leido.updatedAt);
  assert.equal((await panelDe(u.jefa, doc._id)).convenioCe, Val.CONVENIOS_CE.PESO_DEL_RA,
    'un 409 no puede dejar nada escrito');

  // Con el token al día sí entra.
  const alDia = await (await leerConfig(u.estudios, doc._id)).json();
  await configurar(u.estudios, doc._id, {
    convenioCe: Val.CONVENIOS_CE.PESO_DEL_RA_O_CIEN, esperaUpdatedAt: alDia.updatedAt,
  });
});

// ================================================================ 7. lo fijo, lo configurable y lo que no hace nada todavía

prueba('la tabla distingue lo fijo de lo configurable y dice cuáles son fijas y por qué', async () => {
  const { u, doc } = await escenario();
  const config = await (await leerConfig(u.estudios, doc._id)).json();

  // Las ocho del catálogo de core/, en su orden, sin que la pantalla tenga que saberse ninguna.
  assert.deepStrictEqual(config.reglas.map((r) => r.regla), [...Val.CODIGOS]);

  const fijas = config.reglas.filter((r) => r.fija);
  assert.deepStrictEqual(fijas.map((r) => r.regla), ['criterios_de_ra', 'suma_de_ra'],
    'las dos normativas, y solo esas dos, son fijas');
  for (const r of fijas) {
    assert.equal(r.clase, Val.NORMATIVA);
    assert.ok(typeof r.porque === 'string' && r.porque.length > 20,
      `«${r.regla}» es fija y no dice por qué, así que la pantalla enseñaría un control bloqueado sin motivo`);
  }

  const delCentro = config.reglas.filter((r) => !r.fija);
  assert.equal(delCentro.length, 6, 'las seis comprobaciones de criterio del centro');
  assert.deepStrictEqual(delCentro.map((r) => r.regla).sort(), [
    'apartado_vacio', 'copia_desactualizada', 'heredado_sin_revisar',
    'ra_sin_situacion', 'sa_sin_evaluacion', 'sin_docente',
  ]);
  for (const r of delCentro) assert.equal(r.clase, Val.CENTRO);

  // Y los dos convenios viajan con qué es cada uno: elegir entre dos reglas legítimas no es marcar
  // una casilla, y quien elige tiene que leer lo que elige.
  assert.deepStrictEqual(config.convenios.map((c) => c.valor), [
    Val.CONVENIOS_CE.PESO_DEL_RA, Val.CONVENIOS_CE.PESO_DEL_RA_O_CIEN,
  ]);
  for (const c of config.convenios) {
    assert.ok(c.titulo && c.explicacion, 'un convenio sin explicación es una decisión a ciegas');
  }
});

prueba('la tabla dice qué comprobaciones no busca el panel todavía, y por qué', async () => {
  // La honestidad que hace falta para que la pantalla no ofrezca un interruptor que parezca roto:
  // tres comprobaciones del catálogo se pueden configurar y hoy no cambian nada.
  const { u, doc } = await escenario();
  const config = await (await leerConfig(u.estudios, doc._id)).json();

  const fuera = config.reglas.filter((r) => !r.enElPanel);
  assert.deepStrictEqual(fuera.map((r) => r.regla).sort(),
    ['apartado_vacio', 'copia_desactualizada', 'heredado_sin_revisar']);
  for (const r of fuera) {
    assert.ok(typeof r.motivo === 'string' && r.motivo.length > 20,
      `«${r.regla}» no sale en el panel y no dice por qué`);
  }
  for (const r of config.reglas.filter((x) => x.enElPanel)) {
    assert.equal(r.motivo, null, 'una comprobación que sí funciona no tiene nada que explicar');
  }

  // Y se puede configurar igual: se guarda y se arrastra, aunque hoy no cambie el panel.
  const antes = await panelDe(u.jefa, doc._id);
  await configurar(u.estudios, doc._id, { reglas: { heredado_sin_revisar: { activa: false } } });
  const despues = await panelDe(u.jefa, doc._id);
  assert.deepStrictEqual(despues.desactivadas, ['heredado_sin_revisar']);
  assert.equal(despues.cuenta.aviso, antes.cuenta.aviso, 'el panel no la buscaba, así que no cambia nada');
});

// ================================================================ 8. el arrastre al curso siguiente

prueba('el arrastre al curso siguiente se lleva las comprobaciones y su registro', async () => {
  // El criterio del centro no se reinicia cada septiembre. Si no viajara, un documento que el curso
  // pasado se podía aprobar aparecería de pronto con avisos nuevos sin que nadie cambiara nada.
  const { repo, u, doc } = await escenario();

  await configurar(u.estudios, doc._id, {
    convenioCe: Val.CONVENIOS_CE.PESO_DEL_RA_O_CIEN,
    reglas: { ra_sin_situacion: { activa: false }, sin_docente: { severidad: 'aviso' } },
  });
  const antes = await panelDe(u.jefa, doc._id);

  const res = await Arrastre.CREAR(
    pet(`/api/documentos/${doc._id}/siguiente-curso`, u.jefa, { metodo: 'POST', cuerpo: {} }),
    { id: doc._id },
  );
  assert.equal(res.status, 201, `el curso siguiente no se ha creado: ${res.status}`);
  const nuevo = (await res.json()).documento;
  assert.equal(nuevo.curso, '2027-28');

  // El mismo convenio, las mismas comprobaciones y el mismo historial.
  const config = await (await leerConfig(u.estudios, nuevo._id)).json();
  assert.equal(config.convenioCe, Val.CONVENIOS_CE.PESO_DEL_RA_O_CIEN);
  assert.equal(config.reglas.find((r) => r.regla === 'ra_sin_situacion').activa, false);
  assert.equal(config.reglas.find((r) => r.regla === 'sin_docente').severidad, 'aviso');
  assert.equal(config.cambios.length, 3, 'el curso nuevo nace sabiendo quién decidió el criterio con el que se mide');
  assert.ok(config.cambios.every((c) => c.por === u.estudios._id));

  // Y el panel del curso nuevo mide igual que el del viejo.
  const despues = await panelDe(u.jefa, nuevo._id);
  assert.equal(despues.convenioCe, antes.convenioCe);
  assert.deepStrictEqual(despues.desactivadas, antes.desactivadas);
  assert.deepStrictEqual(porRegla(despues), porRegla(antes));
  // Queda la errata de verdad, que es lo correcto: el convenio laxo no arregla un descuadre.
  assert.deepStrictEqual(porRegla(despues), { criterios_de_ra: 1 });
  assert.equal(despues.cuenta.error, 1);

  // Son dos documentos independientes desde ya: cambiar el nuevo no toca el viejo, igual que con la
  // plantilla (core/plantilla.js).
  await configurar(u.estudios, nuevo._id, { convenioCe: Val.CONVENIOS_CE.PESO_DEL_RA });
  assert.equal((await panelDe(u.jefa, doc._id)).convenioCe, Val.CONVENIOS_CE.PESO_DEL_RA_O_CIEN,
    'configurar el curso nuevo ha tocado el del curso pasado');
  assert.equal((await repo.documentos.obtener(doc._id)).comprobaciones.cambios.length, 3);
});

prueba('un documento sin configurar arrastra un documento sin configurar', async () => {
  const { repo, u, doc } = await escenario();
  const res = await Arrastre.CREAR(
    pet(`/api/documentos/${doc._id}/siguiente-curso`, u.jefa, { metodo: 'POST', cuerpo: {} }),
    { id: doc._id },
  );
  assert.equal(res.status, 201);
  const nuevo = (await res.json()).documento;
  const guardado = (await repo.documentos.obtener(nuevo._id)).comprobaciones;
  assert.ok(guardado === null || guardado === undefined,
    'un documento arrastrado de uno sin configurar no puede nacer con configuración');
  assert.equal((await panelDe(u.jefa, nuevo._id)).convenioCe, Val.CONVENIOS_CE.PESO_DEL_RA);
});

// ================================================================ 9. la lógica pura de core/

prueba('la lógica de la configuración es pura y no necesita ni repositorio ni petición', async () => {
  // `core/validaciones.js` es lo que comparten el panel, el motor y la pantalla, así que sus piezas
  // se prueban también solas: así un fallo aquí se lee antes que a través de una ruta.
  const serie = Val.normalizarConfig(undefined);
  assert.equal(serie.convenioCe, Val.CONVENIOS_CE.PESO_DEL_RA);
  assert.equal(Object.keys(serie.reglas).length, Val.CODIGOS.length);
  assert.equal(Val.comprimirConfig(serie), null, 'lo de serie no se guarda');

  // Un valor guardado que no se entiende se trata como el de serie, no lanza: es lo seguro, porque
  // lanzar dejaría el documento sin panel y sin puerta de aprobación.
  const raro = Val.normalizarConfig({ convenioCe: 'ninguno', reglas: { sin_docente: 'sí' } });
  assert.equal(raro.convenioCe, Val.CONVENIOS_CE.PESO_DEL_RA);
  assert.deepStrictEqual(raro.reglas.sin_docente, { activa: true, severidad: 'error' });

  // `aplicarConfig` es el único sitio donde la configuración surte efecto.
  const avisos = [
    { regla: 'criterios_de_ra', severidad: 'error', titulo: 'normativa' },
    { regla: 'sin_docente', severidad: 'error', titulo: 'del centro' },
    { regla: 'ra_sin_situacion', severidad: 'aviso', titulo: 'otra del centro' },
    { regla: 'la_que_viniera_mañana', severidad: 'aviso', titulo: 'sin catalogar' },
  ];
  const config = Val.normalizarConfig({
    reglas: { sin_docente: { severidad: 'aviso' }, ra_sin_situacion: { activa: false } },
  });
  const quedan = Val.aplicarConfig(config, avisos);
  assert.deepStrictEqual(quedan.map((a) => [a.regla, a.severidad]), [
    ['criterios_de_ra', 'error'],
    ['sin_docente', 'aviso'],
    // `ra_sin_situacion` se ha quitado; la que no está en el catálogo pasa tal cual, que es lo seguro:
    // olvidarse de catalogar una comprobación nueva no puede hacerla desaparecer.
    ['la_que_viniera_mañana', 'aviso'],
  ]);
  assert.equal(Val.puedeAprobarse(quedan), false, 'la normativa sigue bloqueando');
  assert.equal(avisos[1].severidad, 'error', '`aplicarConfig` no puede modificar los avisos que recibe');

  // Y la negativa de las normativas vive aquí, no en la ruta.
  assert.ok(Val.fusionarConfig(undefined, { reglas: { suma_de_ra: { activa: false } } }).motivo);
  assert.equal(Val.fusionarConfig(undefined, { convenioCe: Val.CONVENIOS_CE.PESO_DEL_RA }).cambios.length, 0);
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
    : `\n${total} pruebas de las comprobaciones configurables correctas`);
  process.exit(fallos ? 1 : 0);
}

ejecutar();
