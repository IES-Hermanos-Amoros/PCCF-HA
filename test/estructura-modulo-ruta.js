// La ruta que guarda la estructura propia de un módulo: GET y PUT de
// /api/documentos/[id]/unidades/[unidad]/estructura (app/_lib/rutas/estructura-modulo.js).
//
//   node test/estructura-modulo-ruta.js
//
// Sin levantar Next, sin red y sin base de datos: las rutas se llaman directamente con un `Request`
// normal, como en test/estructura.js, y el repositorio es el de memoria.
//
// QUÉ SE PRUEBA
//
//   · quien lleva el módulo reforma SU apartado y los otros diez módulos no cambian (el corazón de todo)
//   · quien lleva otro módulo, 403; la jefatura de estudios, 403; la jefatura del departamento, 200
//   · la puerta (`motivoDeEstructura`) se pasa siempre y su motivo se devuelve tal cual
//   · un apartado común: la puerta lo rechaza hoy, y el 400 dice el alcance (todos los módulos)
//   · quien tiene asignado un apartado común pasa el permiso de la regla nueva y llega a la puerta
//   · 409 con un token viejo o con una versión de plantilla vieja, y sin escribir nada
//   · una versión alternativa no se escribe
//   · volver a la común: `estructura: null`

'use strict';

const assert = require('assert/strict');

const { crearRepositorio } = require('../repositorio');
const memoria = require('../repositorio/memoria');
const Unidades = require('../core/unidades');
const { aFilas } = require('../core/documento');
const EstructuraModulo = require('../core/estructura-modulo');
const { COOKIE_SESION, abrirSesion } = require('../app/_lib/sesion');
const Ruta = require('../app/_lib/rutas/estructura-modulo');

const CLAVE_GLOBAL = '__pccf_repositorio__';

let fallos = 0;
const pendientes = [];
const prueba = (nombre, fn) => pendientes.push({ nombre, fn });

const TESTIGOS = new Map();

function pet(camino, persona, { metodo = 'GET', cuerpo } = {}) {
  const cabeceras = persona ? { cookie: `${COOKIE_SESION}=${TESTIGOS.get(persona._id)}` } : {};
  let crudo;
  if (cuerpo !== undefined) {
    crudo = JSON.stringify(cuerpo);
    cabeceras['content-type'] = 'application/json';
  }
  return new Request(`http://pruebas.local${camino}`, { method: metodo, headers: cabeceras, body: crudo });
}

const campoTexto = { id: 'texto', tipo: 'texto_largo', etiqueta: 'Texto' };

const PLANTILLA = {
  tipo: 'programacion_didactica',
  origen: 'PD_sintetica.docx',
  version: null,
  generada: '2026-01-01T00:00:00.000Z',
  secciones: [
    { id: 'introduccion', titulo: 'Introducción', nivel: 1, edita: 'jefe_departamento', presencia: 1,
      campos: [campoTexto], hijos: [] },
    { id: 'atencion-a-la-diversidad', titulo: 'Atención a la diversidad', nivel: 1,
      edita: 'jefe_departamento', presencia: 1, campos: [campoTexto], hijos: [] },
    { id: 'modulos', titulo: 'Módulos', nivel: 1, instancias: true, etiqueta_instancia: 'módulo',
      grupos: ['Módulos del primer curso'], edita: 'docentes_del_modulo', presencia: 2, campos: [],
      hijos: [
        { id: 'modulos/metodologia', titulo: 'Metodología', nivel: 3, presencia: 2, campos: [campoTexto], hijos: [] },
        { id: 'modulos/evaluacion', titulo: 'Evaluación', nivel: 3, presencia: 2, campos: [campoTexto], hijos: [] },
      ] },
  ],
};

const MODULOS = Unidades.UNIDADES.filter((u) => u.ciclo === 'daw').map((u) => u.id);
const PROG = 'daw-0485';
const OTRO = MODULOS.find((id) => id !== PROG);
const METODOLOGIA = 'modulos/metodologia';

const OPCIONES = {
  curso: '2026-27', ciclo: 'daw', departamento: 'informatica', origenApartados: 'nuevo',
  conciliar: (titulo) => MODULOS.find((id) => Unidades.tituloDe(id, '2026-27') === titulo),
};

async function escenario() {
  const adaptador = memoria.crear();
  const repo = crearRepositorio({ adaptador });
  repo.enMemoria = true;
  globalThis[CLAVE_GLOBAL] = repo;

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

  const filas = aFilas({
    plantilla: PLANTILLA,
    datos: {
      departamento: 'informatica',
      documento: { introduccion: { texto: [{ type: 'p', text: 'Hola.' }] } },
      instancias: MODULOS.map((id) => ({
        titulo: Unidades.tituloDe(id, '2026-27'), num: null, grupo: 'Módulos del primer curso',
        docentes: id === PROG ? [u.ana._id] : [],
        valores: { [METODOLOGIA]: { texto: [{ type: 'p', text: 'Metodología.' }] } },
      })),
      // Luis tiene asignado un apartado común.
      asignaciones: { 'atencion-a-la-diversidad': [u.luis._id] },
      compartidos: {},
    },
  }, OPCIONES);
  const doc = await repo.documentos.crear(filas.documento);
  await repo.unidades.crearMuchos(doc._id, filas.unidades);
  await repo.apartados.crearMuchos(doc._id, filas.apartados);
  return { repo, u, doc };
}

const url = (id, unidad, consulta = '') => `/api/documentos/${id}/unidades/${encodeURIComponent(unidad)}/estructura${consulta}`;
const leer = (persona, id, unidad, consulta) => Ruta.GET(pet(url(id, unidad, consulta), persona), { id, unidad });
const poner = (persona, id, unidad, cuerpo) => Ruta.PUT(pet(url(id, unidad), persona, { metodo: 'PUT', cuerpo }), { id, unidad });

const NOTAS = { id: 'm_notas', tipo: 'texto_largo', etiqueta: 'Notas del profesor' };
const reforma = (seccion = METODOLOGIA) => ({ secciones: { [seccion]: { anadidos: [NOTAS] } } });

async function esError(respuesta, estado, codigo) {
  assert.equal(respuesta.status, estado, `se esperaba un ${estado} y ha sido un ${respuesta.status}`);
  const cuerpo = await respuesta.json();
  assert.equal(cuerpo.error, codigo);
  assert.ok(cuerpo.mensaje && cuerpo.mensaje.length > 0, 'el error no lleva mensaje');
  return cuerpo;
}

const estructuraGuardada = async (repo, doc, unidad) => (await repo.unidades.obtener(doc._id, unidad)).estructura;

// ================================================================

prueba('quien lleva el módulo reforma su apartado y los otros diez módulos no cambian', async () => {
  const { repo, u, doc } = await escenario();
  const antes = {};
  for (const m of MODULOS) antes[m] = JSON.stringify(await repo.unidades.obtener(doc._id, m));

  const r = await poner(u.ana, doc._id, PROG, { estructura: reforma() });
  assert.equal(r.status, 200, JSON.stringify(await r.clone().json()));
  const j = await r.json();
  assert.deepStrictEqual(j.cambiadas, [METODOLOGIA]);
  assert.equal(j.afectaAlDocumento, false);
  assert.equal(j.alcance[0].comun, false);
  assert.equal(j.alcance[0].modulos, 1, 'un apartado de módulo cambia un módulo');

  // El módulo lleva la estructura y la regla le da el campo nuevo.
  const guardada = await estructuraGuardada(repo, doc, PROG);
  assert.deepStrictEqual(guardada, reforma());
  const seccion = PLANTILLA.secciones[2].hijos[0];
  const campos = EstructuraModulo.camposDeSeccion(seccion, await repo.unidades.obtener(doc._id, PROG));
  assert.equal(campos.origen, 'propia');
  assert.deepStrictEqual(campos.vigentes.map((c) => c.id), ['texto', 'm_notas']);

  // Los otros diez, byte a byte como estaban; y la plantilla, sin tocar.
  for (const m of MODULOS.filter((x) => x !== PROG)) {
    assert.equal(JSON.stringify(await repo.unidades.obtener(doc._id, m)), antes[m], `el módulo ${m} ha cambiado`);
  }
  assert.equal(Number((await repo.documentos.obtener(doc._id)).plantillaVersion) || 1, j.plantillaVersion);
  assert.equal(JSON.stringify((await repo.documentos.obtener(doc._id)).plantilla), JSON.stringify(doc.plantilla));
});

prueba('el docente de otro módulo, la jefatura de estudios y la de otro departamento no pueden', async () => {
  const { repo, u, doc } = await escenario();
  await esError(await poner(u.luis, doc._id, PROG, { estructura: reforma() }), 403, 'sin_permiso');
  await esError(await poner(u.ana, doc._id, OTRO, { estructura: reforma() }), 403, 'sin_permiso');
  await esError(await poner(u.estudios, doc._id, PROG, { estructura: reforma() }), 403, 'sin_permiso');
  await esError(await poner(u.pepe, doc._id, PROG, { estructura: reforma() }), 404, 'no_encontrado');
  await esError(await poner(null, doc._id, PROG, { estructura: reforma() }), 401, 'sin_identificar');
  assert.equal(await estructuraGuardada(repo, doc, PROG), undefined, 'una petición negada no escribe');
  assert.equal(await estructuraGuardada(repo, doc, OTRO), undefined);
});

prueba('la jefatura del departamento y el soporte reforman cualquier módulo', async () => {
  const { repo, u, doc } = await escenario();
  assert.equal((await poner(u.jefa, doc._id, OTRO, { estructura: reforma() })).status, 200);
  assert.equal((await poner(u.admin, doc._id, PROG, { estructura: reforma() })).status, 200);
  assert.deepStrictEqual(await estructuraGuardada(repo, doc, OTRO), reforma());
});

prueba('la puerta se pasa siempre y su motivo sale tal cual', async () => {
  const { repo, u, doc } = await escenario();
  const mala = { secciones: { [METODOLOGIA]: { anadidos: [{ id: 'notas', tipo: 'texto_largo', etiqueta: 'Sin prefijo' }] } } };
  const motivo = EstructuraModulo.motivoDeEstructura(mala, doc.plantilla);
  assert.ok(motivo);
  const cuerpo = await esError(await poner(u.ana, doc._id, PROG, { estructura: mala }), 400, 'peticion');
  assert.equal(cuerpo.motivo, motivo, 'el motivo es el de la puerta, sin tocar');
  assert.ok(cuerpo.mensaje.includes(motivo.slice(1)));
  assert.equal(await estructuraGuardada(repo, doc, PROG), undefined);

  await esError(await poner(u.ana, doc._id, PROG, {}), 400, 'peticion');
  await esError(await poner(u.ana, doc._id, PROG, { estructura: 'x' }), 400, 'peticion');
  await esError(await poner(u.ana, doc._id, PROG, { estructura: { secciones: { 'no-existe': { anadidos: [NOTAS] } } } }), 404, 'no_encontrado');
});

prueba('un apartado común: lo ve quien lo tiene asignado, el alcance es el documento entero, y la puerta de hoy lo rechaza', async () => {
  const { repo, u, doc } = await escenario();
  const COMUN = 'atencion-a-la-diversidad';

  // Se puede preguntar antes de guardar.
  const g = await (await leer(u.luis, doc._id, PROG, `?seccion=${COMUN}`)).json();
  assert.equal(g.puedeCambiar, true, 'quien tiene el apartado común asignado lo configura');
  assert.equal(g.alcance.comun, true);
  assert.equal(g.alcance.modulos, MODULOS.length);
  assert.ok(g.alcance.personas.some((p) => p.nombre === 'Ana'), 'afecta a quien lleva un módulo');
  assert.ok(g.alcance.personas.some((p) => p.nombre === 'Luis'), 'y a quien tiene el apartado asignado');
  assert.ok(g.alcance.mensaje.includes('documento entero'));
  const sin = await (await leer(u.ana, doc._id, PROG, `?seccion=${COMUN}`)).json();
  assert.equal(sin.puedeCambiar, false, 'sin asignarlo, no');
  assert.equal((await (await leer(u.ana, doc._id, PROG, `?seccion=${METODOLOGIA}`)).json()).puedeCambiar, true);
  assert.equal((await (await leer(u.estudios, doc._id, PROG, `?seccion=${METODOLOGIA}`)).json()).puedeCambiar, false);

  // Guardar: Luis pasa el permiso y se queda en la puerta del núcleo, que dice el alcance.
  const mal = await esError(await poner(u.luis, doc._id, PROG, { estructura: reforma(COMUN) }), 400, 'peticion');
  assert.equal(mal.alcance[0].comun, true);
  assert.equal(mal.alcance[0].modulos, MODULOS.length);
  assert.equal(mal.motivo, EstructuraModulo.motivoDeEstructura(reforma(COMUN), doc.plantilla));
  // Ana, sin el apartado, ni siquiera llega a la puerta.
  await esError(await poner(u.ana, doc._id, PROG, { estructura: reforma(COMUN) }), 403, 'sin_permiso');
  assert.equal(await estructuraGuardada(repo, doc, PROG), undefined);
});

prueba('409 con un token viejo o una versión de plantilla vieja, y no se escribe nada', async () => {
  const { repo, u, doc } = await escenario();
  const leida = await (await leer(u.ana, doc._id, PROG)).json();

  const otro = await poner(u.jefa, doc._id, OTRO, { estructura: reforma() });
  assert.equal(otro.status, 200);

  const viejo = await esError(await poner(u.ana, doc._id, PROG, { estructura: reforma(), esperaUpdatedAt: leida.updatedAt }), 409, 'conflicto');
  assert.ok('esperado' in viejo);
  assert.equal(await estructuraGuardada(repo, doc, PROG), undefined);

  await esError(await poner(u.ana, doc._id, PROG, { estructura: reforma(), esperaPlantillaVersion: leida.plantillaVersion + 1 }), 409, 'conflicto');
  assert.equal(await estructuraGuardada(repo, doc, PROG), undefined);

  // Con lo leído de nuevo, sí.
  const nueva = await (await leer(u.ana, doc._id, PROG)).json();
  const bien = await poner(u.ana, doc._id, PROG, {
    estructura: reforma(), esperaUpdatedAt: nueva.updatedAt, esperaPlantillaVersion: nueva.plantillaVersion,
  });
  assert.equal(bien.status, 200);
  // Y el token ha avanzado: repetir con el mismo es un conflicto.
  await esError(await poner(u.ana, doc._id, PROG, {
    estructura: { secciones: { [METODOLOGIA]: { campos: { texto: { etiqueta: 'Otro nombre' } } } } },
    esperaUpdatedAt: nueva.updatedAt,
  }), 409, 'conflicto');
});

prueba('una versión alternativa no se escribe, pero se lee', async () => {
  const { repo, u, doc } = await escenario();
  await repo.documentos.actualizar(doc._id, { activa: false });
  await esError(await poner(u.jefa, doc._id, PROG, { estructura: reforma() }), 409, 'version_alternativa');
  assert.equal((await leer(u.jefa, doc._id, PROG)).status, 200);
  assert.equal(await estructuraGuardada(repo, doc, PROG), undefined);
});

prueba('null devuelve el módulo a la estructura común, y repetirlo no hace nada', async () => {
  const { repo, u, doc } = await escenario();
  await esError(await poner(u.ana, doc._id, PROG, { estructura: null }), 400, 'peticion');
  assert.equal((await poner(u.ana, doc._id, PROG, { estructura: reforma() })).status, 200);
  await esError(await poner(u.ana, doc._id, PROG, { estructura: reforma() }), 400, 'peticion');

  // La reforma tiene una casilla propia: volver a la común la pierde y hay que confirmarlo.
  await esError(await poner(u.ana, doc._id, PROG, { estructura: null }), 400, 'peticion');
  const r = await poner(u.ana, doc._id, PROG, { estructura: null, confirmar: true });
  assert.equal(r.status, 200, JSON.stringify(await r.clone().json()));
  const unidad = await repo.unidades.obtener(doc._id, PROG);
  assert.equal(EstructuraModulo.estructuraDeModulo(unidad), null, 'sin desvíos vuelve a la común');
  const seccion = PLANTILLA.secciones[2].hijos[0];
  assert.equal(EstructuraModulo.camposDeSeccion(seccion, unidad).origen, 'comun');
});

prueba('una unidad que no existe es un 404', async () => {
  const { u, doc } = await escenario();
  await esError(await poner(u.jefa, doc._id, 'no-hay', { estructura: reforma() }), 404, 'no_encontrado');
  await esError(await leer(u.jefa, doc._id, 'no-hay'), 404, 'no_encontrado');
});

// ---------------------------------------------------------------- ejecución
// ---------------------------------------------------------------- los apartados ENTEROS
//
// Estas tres cubren el agujero que tuvo la ruta: `apartadosCambiados` solo miraba `secciones`, así que
// un cambio que solo tocaba `apartados` se daba por «no hay nada que cambiar» —y, lo serio, NO pasaba
// por la comprobación de permiso de su apartado—. Las dos averías salían de la misma línea.

prueba('retirar un apartado ENTERO solo en su módulo: se acepta y los demás no cambian', async () => {
  const { repo, u, doc } = await escenario();
  const antes = {};
  for (const m of MODULOS) antes[m] = JSON.stringify(await repo.unidades.obtener(doc._id, m));

  const soloApartados = { apartados: { cambios: { [METODOLOGIA]: { retirado: true } } } };
  const r = await poner(u.ana, doc._id, PROG, { estructura: soloApartados });
  assert.equal(r.status, 200, JSON.stringify(await r.clone().json()));
  const j = await r.json();
  assert.deepStrictEqual(j.cambiadas, [METODOLOGIA], 'un cambio que solo toca «apartados» tiene que contarse');
  assert.equal(j.afectaAlDocumento, false);
  assert.equal(j.alcance[0].modulos, 1, 'retirar un apartado de módulo cambia un módulo');

  // La regla del núcleo ya no se lo da a ESTE módulo, y a los demás sí.
  const suya = await repo.unidades.obtener(doc._id, PROG);
  const mios = EstructuraModulo.apartadosDeModulo(PLANTILLA, suya);
  assert.ok(!mios.vigentes.some((s) => s.id === METODOLOGIA), 'el apartado sigue vigente en el módulo que lo retiró');
  for (const m of MODULOS) {
    if (m === PROG) continue;
    assert.equal(JSON.stringify(await repo.unidades.obtener(doc._id, m)), antes[m], `el módulo ${m} ha cambiado y no era el suyo`);
    const otros = EstructuraModulo.apartadosDeModulo(PLANTILLA, await repo.unidades.obtener(doc._id, m));
    assert.ok(otros.vigentes.some((s) => s.id === METODOLOGIA), `el módulo ${m} ha perdido el apartado`);
  }
  // Y la plantilla común no se toca.
  const despues = await repo.documentos.obtener(doc._id);
  assert.equal(Number(despues.plantillaVersion) || 1, 1, 'la plantilla común ha cambiado de versión');
});

prueba('un cambio que solo toca «apartados» pasa por el permiso de su apartado', async () => {
  const { u, doc } = await escenario();
  const soloApartados = { apartados: { cambios: { [METODOLOGIA]: { retirado: true } } } };
  // Luis no lleva este módulo: antes del arreglo esto pasaba de largo y acababa en 400, no en 403.
  await esError(await poner(u.luis, doc._id, PROG, { estructura: soloApartados }), 403, 'sin_permiso');
  await esError(await poner(u.estudios, doc._id, PROG, { estructura: soloApartados }), 403, 'sin_permiso');
  await esError(await poner(u.pepe, doc._id, PROG, { estructura: soloApartados }), 404, 'no_encontrado');
});

prueba('reordenar decide por los hijos que se mueven, no por el bloque de unidades', async () => {
  const { u, doc } = await escenario();
  // El padre de los apartados de primer nivel es «modulos», que es el bloque de unidades y no es un
  // apartado que nadie edite. Si el permiso se decidiera por el padre, esto acabaría en 403.
  const vuelta = { apartados: { orden: { modulos: ['modulos/evaluacion', METODOLOGIA] } } };
  const r = await poner(u.ana, doc._id, PROG, { estructura: vuelta });
  assert.equal(r.status, 200, JSON.stringify(await r.clone().json()));
  const j = await r.json();
  assert.deepStrictEqual(
    [...j.cambiadas].sort(),
    [METODOLOGIA, 'modulos/evaluacion'].sort(),
    'tienen que contarse los dos hijos que se han movido, y no «modulos»',
  );
  assert.ok(!j.cambiadas.includes('modulos'), 'el bloque de unidades no es el apartado que decide');
});

// ---------------------------------------------------------------- las CASILLAS de un apartado propio
//
// Un apartado que el módulo ha añadido («Taller de depuración») lleva sus casillas dentro de su propio
// `anadido`. La pantalla pregunta por él con `GET ?seccion=` antes de ofrecer los controles, y lo tiene que
// poder configurar quien lleva el módulo con el mismo permiso que cualquier otro apartado de módulo.

const TALLER = 'modulos/m_taller';
const casilla = (id, etiqueta, extra) => Object.assign({ id, tipo: 'texto_largo', etiqueta }, extra);
const tallerCon = (campos) => ({
  apartados: { anadidos: [{ id: TALLER, titulo: 'Taller de depuración', padre: 'modulos', campos }] },
});

async function conTaller(inicial = [casilla('m_texto', 'Texto')]) {
  const e = await escenario();
  const r = await poner(e.u.ana, e.doc._id, PROG, { estructura: tallerCon(inicial) });
  assert.equal(r.status, 200, JSON.stringify(await r.clone().json()));
  return e;
}

prueba('GET ?seccion= de un apartado propio: 200, lo puede configurar quien lleva el módulo, y el alcance es un módulo', async () => {
  const { u, doc } = await escenario();
  // Antes de que exista, es un 404 como cualquier apartado inventado.
  await esError(await leer(u.ana, doc._id, PROG, `?seccion=${TALLER}`), 404, 'no_encontrado');

  assert.equal((await poner(u.ana, doc._id, PROG, { estructura: tallerCon([casilla('m_texto', 'Texto')]) })).status, 200);
  const r = await leer(u.ana, doc._id, PROG, `?seccion=${TALLER}`);
  assert.equal(r.status, 200, JSON.stringify(await r.clone().json()));
  const g = await r.json();
  assert.equal(g.seccion, TALLER);
  assert.equal(g.puedeCambiar, true);
  assert.equal(g.alcance.comun, false);
  assert.equal(g.alcance.modulos, 1);
  assert.equal(g.alcance.titulo, 'Taller de depuración');
  assert.ok(g.alcance.personas.some((p) => p.nombre === 'Ana'));
  assert.ok(!g.alcance.personas.some((p) => p.nombre === 'Luis'), 'no afecta a quien tiene un común asignado');

  // La jefatura del departamento y el soporte, sí. El docente de otro módulo y la jefatura de estudios, no.
  for (const quien of [u.jefa, u.admin]) {
    assert.equal((await (await leer(quien, doc._id, PROG, `?seccion=${TALLER}`)).json()).puedeCambiar, true);
  }
  for (const quien of [u.luis, u.estudios]) {
    const o = await (await leer(quien, doc._id, PROG, `?seccion=${TALLER}`)).json();
    assert.equal(o.puedeCambiar, false);
    assert.equal(o.alcance.modulos, 1);
  }
  // Un apartado propio es de ESE módulo: en otro no existe.
  await esError(await leer(u.jefa, doc._id, OTRO, `?seccion=${TALLER}`), 404, 'no_encontrado');
  // Y quien no ve el documento sigue sin verlo.
  await esError(await leer(u.pepe, doc._id, PROG, `?seccion=${TALLER}`), 404, 'no_encontrado');
});

prueba('GET ?seccion= de un apartado propio retirado, o hijo de otro propio, también se resuelve', async () => {
  const { u, doc } = await escenario();
  const hijo = { id: TALLER + '/m_nota', titulo: 'Nota', padre: TALLER, campos: [casilla('m_texto', 'Texto')] };
  const padre = { id: TALLER, titulo: 'Taller de depuración', padre: 'modulos', campos: [casilla('m_texto', 'Texto')], retirado: true };
  assert.equal((await poner(u.ana, doc._id, PROG, { estructura: { apartados: { anadidos: [padre, hijo] } } })).status, 200);
  for (const id of [TALLER, hijo.id]) {
    const g = await (await leer(u.ana, doc._id, PROG, `?seccion=${id}`)).json();
    assert.equal(g.puedeCambiar, true, id);
    assert.equal(g.alcance.modulos, 1, id);
  }
});

prueba('casillas de un apartado propio: añadir, renombrar, retirar, restaurar y reordenar, sin tocar otro módulo', async () => {
  const { repo, u, doc } = await conTaller();
  const antes = {};
  for (const m of MODULOS.filter((x) => x !== PROG)) antes[m] = JSON.stringify(await repo.unidades.obtener(doc._id, m));
  const plantillaAntes = JSON.stringify((await repo.documentos.obtener(doc._id)).plantilla);

  const pasos = [
    ['añadir', [casilla('m_texto', 'Texto'), casilla('m_pasos', 'Pasos para reproducirlo')]],
    ['renombrar', [casilla('m_texto', 'Descripción del fallo'), casilla('m_pasos', 'Pasos para reproducirlo')]],
    ['retirar', [casilla('m_texto', 'Descripción del fallo'), casilla('m_pasos', 'Pasos para reproducirlo', { retirado: true })]],
    ['restaurar', [casilla('m_texto', 'Descripción del fallo'), casilla('m_pasos', 'Pasos para reproducirlo')]],
    ['reordenar', [casilla('m_pasos', 'Pasos para reproducirlo'), casilla('m_texto', 'Descripción del fallo')]],
  ];
  for (const [nombre, campos] of pasos) {
    const r = await poner(u.ana, doc._id, PROG, { estructura: tallerCon(campos) });
    assert.equal(r.status, 200, nombre + ': ' + JSON.stringify(await r.clone().json()));
    const j = await r.json();
    assert.deepStrictEqual(j.cambiadas, [TALLER], nombre);
    assert.equal(j.afectaAlDocumento, false, nombre);
    assert.equal(j.alcance.length, 1, nombre + ': el apartado propio dice su alcance');
    assert.equal(j.alcance[0].comun, false, nombre);
    assert.equal(j.alcance[0].modulos, 1, nombre);
    assert.deepStrictEqual((await estructuraGuardada(repo, doc, PROG)).apartados.anadidos[0].campos, campos, nombre);
    const suya = await repo.unidades.obtener(doc._id, PROG);
    const nodo = EstructuraModulo.apartadosDeModulo(doc.plantilla, suya).secciones.find((s) => s.id === TALLER);
    assert.deepStrictEqual(
      EstructuraModulo.camposDeSeccion(nodo, suya).vigentes.map((c) => c.id),
      campos.filter((c) => !c.retirado).map((c) => c.id), nombre,
    );
  }
  for (const m of MODULOS.filter((x) => x !== PROG)) {
    assert.equal(JSON.stringify(await repo.unidades.obtener(doc._id, m)), antes[m], `el módulo ${m} ha cambiado`);
  }
  assert.equal(JSON.stringify((await repo.documentos.obtener(doc._id)).plantilla), plantillaAntes, 'la plantilla común no se toca');
});

prueba('una casilla que ya existe no puede desaparecer de la lista: 400 que dice cuál falta, y sin escribir', async () => {
  const { repo, u, doc } = await conTaller([casilla('m_texto', 'Texto'), casilla('m_pasos', 'Pasos para reproducirlo')]);
  const guardada = JSON.stringify(await estructuraGuardada(repo, doc, PROG));
  const token = (await repo.documentos.obtener(doc._id)).updatedAt;

  // En un apartado propio del módulo: la lista llega sin «m_pasos».
  const sinUna = await esError(await poner(u.ana, doc._id, PROG, { estructura: tallerCon([casilla('m_texto', 'Texto')]) }), 400, 'peticion');
  assert.ok(sinUna.motivo.includes('m_pasos') && sinUna.motivo.includes('Pasos para reproducirlo'), sinUna.motivo);
  assert.ok(sinUna.mensaje.includes('retirado'), 'el mensaje dice cómo se quita: retirándola');
  assert.ok(sinUna.mensaje.includes('No se ha cambiado nada'));
  // Cambiar otra cosa a la vez no la salva: renombrar una y omitir otra.
  await esError(await poner(u.ana, doc._id, PROG, { estructura: tallerCon([casilla('m_texto', 'Otro nombre')]) }), 400, 'peticion');
  // Cambiar el id tampoco: es otra casilla, y la de antes ha desaparecido.
  await esError(await poner(u.ana, doc._id, PROG, { estructura: tallerCon([casilla('m_texto', 'Texto'), casilla('m_otra', 'Otra')]) }), 400, 'peticion');
  // Ni quitar el apartado propio entero, que se lleva sus casillas.
  await esError(await poner(u.ana, doc._id, PROG, { estructura: reforma() }), 400, 'peticion');
  assert.equal(JSON.stringify(await estructuraGuardada(repo, doc, PROG)), guardada, 'lo rechazado no escribe');
  assert.equal(String((await repo.documentos.obtener(doc._id)).updatedAt), String(token), 'lo rechazado no mueve el token del documento');

  // Marcarla retirada sí: se queda en la lista, con su contenido.
  const retirada = [casilla('m_texto', 'Texto'), casilla('m_pasos', 'Pasos para reproducirlo', { retirado: true })];
  assert.equal((await poner(u.ana, doc._id, PROG, { estructura: tallerCon(retirada) })).status, 200);
  assert.deepStrictEqual((await estructuraGuardada(repo, doc, PROG)).apartados.anadidos[0].campos, retirada);
});

prueba('una casilla añadida a un apartado de la plantilla tampoco desaparece: omitirla es un 400, retirarla se acepta', async () => {
  const { repo, u, doc } = await escenario();
  const otra = { id: 'm_otra', tipo: 'texto_largo', etiqueta: 'Otra' };
  assert.equal((await poner(u.ana, doc._id, PROG, { estructura: { secciones: { [METODOLOGIA]: { anadidos: [NOTAS, otra] } } } })).status, 200);
  const guardada = JSON.stringify(await estructuraGuardada(repo, doc, PROG));

  const sin = await esError(await poner(u.ana, doc._id, PROG, { estructura: { secciones: { [METODOLOGIA]: { anadidos: [NOTAS] } } } }), 400, 'peticion');
  assert.ok(sin.motivo.includes('m_otra'), sin.motivo);
  // Sustituirla por otra distinta, lo mismo.
  const otraDistinta = { id: 'm_nueva', tipo: 'texto_largo', etiqueta: 'Nueva' };
  await esError(await poner(u.ana, doc._id, PROG, { estructura: { secciones: { [METODOLOGIA]: { anadidos: [NOTAS, otraDistinta] } } } }), 400, 'peticion');
  assert.equal(JSON.stringify(await estructuraGuardada(repo, doc, PROG)), guardada, 'lo rechazado no escribe');

  const retirada = { secciones: { [METODOLOGIA]: { anadidos: [NOTAS, { ...otra, retirado: true }] } } };
  assert.equal((await poner(u.ana, doc._id, PROG, { estructura: retirada })).status, 200);
  assert.deepStrictEqual(await estructuraGuardada(repo, doc, PROG), retirada);

  // Volver a la común sigue siendo posible, con confirmación: pierde las casillas propias.
  assert.equal((await poner(u.ana, doc._id, PROG, { estructura: null, confirmar: true })).status, 200);
});

prueba('casillas de un apartado propio: quien no lleva el módulo, y la jefatura de estudios, 403 y sin escribir', async () => {
  const { repo, u, doc } = await conTaller();
  const guardada = JSON.stringify(await estructuraGuardada(repo, doc, PROG));
  const nueva = tallerCon([casilla('m_texto', 'Texto'), casilla('m_pasos', 'Pasos')]);
  for (const quien of [u.luis, u.estudios]) {
    await esError(await poner(quien, doc._id, PROG, { estructura: nueva }), 403, 'sin_permiso');
  }
  await esError(await poner(u.pepe, doc._id, PROG, { estructura: nueva }), 404, 'no_encontrado');
  assert.equal(JSON.stringify(await estructuraGuardada(repo, doc, PROG)), guardada, 'una petición negada no escribe');
  // La jefatura del departamento y el soporte, sí.
  assert.equal((await poner(u.jefa, doc._id, PROG, { estructura: nueva })).status, 200);
});

prueba('casillas de un apartado propio: cada motivo de la puerta sale tal cual, con el alcance de un módulo', async () => {
  const { repo, u, doc } = await conTaller();
  const guardada = JSON.stringify(await estructuraGuardada(repo, doc, PROG));
  const texto = casilla('m_texto', 'Texto');
  const casos = [
    [[casilla('texto', 'Texto')], 'm_'],
    [[texto, casilla('m_texto', 'Otra')], 'no se reutiliza'],
    [[texto, casilla('m_b', 'texto')], 'no se distinguirían'],
    [[casilla('m_b', 'B', { tipo: 'auto.ficha_modulo' })], 'auto.ficha_modulo'],
    [[casilla('m_b', ' ')], 'etiqueta'],
    [[], 'al menos un campo'],
  ];
  for (const [campos, trozo] of casos) {
    const estructura = tallerCon(campos);
    const motivo = EstructuraModulo.motivoDeEstructura(estructura, doc.plantilla);
    assert.ok(motivo && motivo.includes(trozo), `el motivo no dice «${trozo}»: ${motivo}`);
    const cuerpo = await esError(await poner(u.ana, doc._id, PROG, { estructura }), 400, 'peticion');
    assert.equal(cuerpo.motivo, motivo);
    assert.equal(cuerpo.alcance[0].modulos, 1, 'el 400 también dice el alcance de un módulo');
    assert.equal(cuerpo.alcance[0].comun, false);
  }
  // El tope, con las retiradas dentro.
  const muchas = [];
  for (let i = 0; i <= EstructuraModulo.MAX_CAMPOS; i += 1) muchas.push(casilla('m_c' + i, 'Casilla ' + i, i < 3 ? { retirado: true } : undefined));
  const tope = await esError(await poner(u.ana, doc._id, PROG, { estructura: tallerCon(muchas) }), 400, 'peticion');
  assert.ok(tope.motivo.includes('el máximo son 20'), tope.motivo);
  assert.equal(JSON.stringify(await estructuraGuardada(repo, doc, PROG)), guardada, 'lo rechazado no escribe');
});

// ---------------------------------------------------------------- VOLVER A LA COMÚN: lo propio se destruye, y se confirma
//
// Quitar la estructura propia de un módulo hace desaparecer sus casillas y sus apartados. Lo escrito debajo
// se destruye, pero solo con confirmación, solo en ese módulo y sin tocar lo común.

const HIJO = TALLER + '/m_nota';
const escribe = (t) => [{ type: 'p', text: t }];
const propia = () => ({
  secciones: { [METODOLOGIA]: { anadidos: [NOTAS] } },
  apartados: { anadidos: [
    { id: TALLER, titulo: 'Taller de depuración', padre: 'modulos', campos: [casilla('m_texto', 'Texto'), casilla('m_pasos', 'Pasos')] },
    { id: HIJO, titulo: 'Nota', padre: TALLER, campos: [casilla('m_texto', 'Texto')] },
  ] },
});

// PROG con estructura propia y contenido en todo; OTRO con la MISMA casilla m_notas y el MISMO apartado.
async function conLoPropio() {
  const e = await escenario();
  const { repo, u, doc } = e;
  const r = await poner(u.ana, doc._id, PROG, { estructura: propia() });
  assert.equal(r.status, 200, JSON.stringify(await r.clone().json()));
  assert.equal((await poner(u.jefa, doc._id, OTRO, { estructura: propia() })).status, 200);
  for (const m of [PROG, OTRO]) {
    await repo.apartados.escribir(doc._id, METODOLOGIA, m, { valores: { texto: escribe('común ' + m), m_notas: escribe('notas ' + m) } });
    await repo.apartados.escribir(doc._id, TALLER, m, { valores: { m_texto: escribe('taller ' + m), m_pasos: escribe('pasos ' + m) } });
    await repo.apartados.escribir(doc._id, HIJO, m, { valores: { m_texto: escribe('nieto ' + m) } });
    await repo.comentarios.crear({ documentoId: doc._id, seccion: TALLER, unidadId: m, autor: 'ana', texto: 'hilo propio ' + m });
    await repo.comentarios.crear({ documentoId: doc._id, seccion: METODOLOGIA, unidadId: m, autor: 'ana', texto: 'hilo común ' + m });
  }
  return e;
}
const fila = async (repo, doc, seccion, m) => (await repo.apartados.listar(doc._id, { unidadId: m })).find((x) => x.seccion === seccion);
const hilos = async (repo, doc, seccion, m) => (await repo.comentarios.listar(doc._id, { seccion, unidadId: m })).length;

prueba('null con algo propio y SIN confirmar: 400 que dice cuánto se pierde, y no cambia ni borra nada', async () => {
  const { repo, u, doc } = await conLoPropio();
  const antes = JSON.stringify(await repo.apartados.listar(doc._id, {}));
  const guardada = JSON.stringify(await estructuraGuardada(repo, doc, PROG));
  const token = String((await repo.documentos.obtener(doc._id)).updatedAt);

  for (const cuerpo of [{ estructura: null }, { estructura: null, confirmar: false }, { estructura: null, confirmar: 'true' }]) {
    const c = await esError(await poner(u.ana, doc._id, PROG, cuerpo), 400, 'peticion');
    assert.deepStrictEqual(c.perdida, { apartados: 2, campos: 1, filas: 2, conContenido: 2, casillasEscritas: 1 });
    assert.ok(c.mensaje.includes('2 apartados de este módulo, todos con algo escrito'), c.mensaje);
    assert.ok(c.mensaje.includes('1 casilla de este módulo, con algo escrito'), c.mensaje);
    assert.ok(c.mensaje.includes('confirmar'), c.mensaje);
    assert.ok(c.mensaje.includes('No se ha cambiado nada'));
  }
  assert.equal(JSON.stringify(await estructuraGuardada(repo, doc, PROG)), guardada);
  assert.equal(JSON.stringify(await repo.apartados.listar(doc._id, {})), antes, 'no se ha borrado nada');
  assert.equal(String((await repo.documentos.obtener(doc._id)).updatedAt), token, 'no se ha movido el token');
  assert.equal(await hilos(repo, doc, TALLER, PROG), 1);
});

prueba('null CON confirmar: estructura en null, lo propio destruido, y lo común y el otro módulo intactos', async () => {
  const { repo, u, doc } = await conLoPropio();
  const r = await poner(u.ana, doc._id, PROG, { estructura: null, confirmar: true });
  assert.equal(r.status, 200, JSON.stringify(await r.clone().json()));
  const j = await r.json();
  assert.equal(j.estructura, null);
  assert.deepStrictEqual(j.destruido, { filas: 2, comentarios: 1, casillas: 1 });
  assert.equal(j.contenidoSinDestruir, null);
  assert.equal(await estructuraGuardada(repo, doc, PROG), null);

  // Lo propio de PROG ya no está: la casilla del apartado común, el apartado y su nieto, y los hilos del propio.
  assert.equal(await fila(repo, doc, TALLER, PROG), undefined);
  assert.equal(await fila(repo, doc, HIJO, PROG), undefined, 'el contenido del nieto también');
  const comun = await fila(repo, doc, METODOLOGIA, PROG);
  assert.ok(comun && !('m_notas' in comun.valores), 'la casilla propia ya no está');
  assert.deepStrictEqual(comun.valores.texto, escribe('común ' + PROG), 'lo COMÚN del módulo que vuelve sobrevive');
  assert.equal(await hilos(repo, doc, TALLER, PROG), 0, 'los comentarios del apartado propio se van');
  assert.equal(await hilos(repo, doc, METODOLOGIA, PROG), 1, 'los de un apartado común no');

  // El otro módulo, con los MISMOS ids, conserva todo.
  const o = await fila(repo, doc, METODOLOGIA, OTRO);
  assert.deepStrictEqual(o.valores.m_notas, escribe('notas ' + OTRO));
  assert.deepStrictEqual(o.valores.texto, escribe('común ' + OTRO));
  assert.deepStrictEqual((await fila(repo, doc, TALLER, OTRO)).valores.m_texto, escribe('taller ' + OTRO));
  assert.deepStrictEqual((await fila(repo, doc, HIJO, OTRO)).valores.m_texto, escribe('nieto ' + OTRO));
  assert.equal(await hilos(repo, doc, TALLER, OTRO), 1);
  assert.deepStrictEqual(await estructuraGuardada(repo, doc, OTRO), propia());
});

prueba('null en un módulo que solo desviaba etiquetas u orden: 200 sin confirmar, porque no hay nada que perder', async () => {
  const { repo, u, doc } = await escenario();
  const soloEtiqueta = { secciones: { [METODOLOGIA]: { campos: { texto: { etiqueta: 'Otro nombre' } } } } };
  assert.equal((await poner(u.ana, doc._id, PROG, { estructura: soloEtiqueta })).status, 200);
  const r = await poner(u.ana, doc._id, PROG, { estructura: null });
  assert.equal(r.status, 200, JSON.stringify(await r.clone().json()));
  const j = await r.json();
  assert.deepStrictEqual(j.destruido, { filas: 0, comentarios: 0, casillas: 0 });
  assert.equal(j.contenidoSinDestruir, null);
  assert.equal(await estructuraGuardada(repo, doc, PROG), null);
  assert.deepStrictEqual((await fila(repo, doc, METODOLOGIA, PROG)).valores.texto, [{ type: 'p', text: 'Metodología.' }]);

  const orden = { apartados: { orden: { modulos: ['modulos/evaluacion', METODOLOGIA] } } };
  assert.equal((await poner(u.jefa, doc._id, OTRO, { estructura: orden })).status, 200);
  assert.equal((await poner(u.jefa, doc._id, OTRO, { estructura: null })).status, 200);
});

prueba('volver a la común con lo propio pero nada escrito: pide confirmar y lo dice', async () => {
  const { u, doc } = await escenario();
  assert.equal((await poner(u.ana, doc._id, PROG, { estructura: propia() })).status, 200);
  const c = await esError(await poner(u.ana, doc._id, PROG, { estructura: null }), 400, 'peticion');
  assert.ok(c.mensaje.includes('todos vacios') || c.mensaje.includes('todos vacíos') || c.mensaje.includes('vacío'), c.mensaje);
  assert.ok(c.mensaje.includes('todas vacías') || c.mensaje.includes('vacía'), c.mensaje);
  assert.equal(c.perdida.conContenido, 0);
  assert.equal((await poner(u.ana, doc._id, PROG, { estructura: null, confirmar: true })).status, 200);
});

prueba('null con confirmar: la jefatura puede, quien no lleva el módulo recibe 403 y no se destruye nada', async () => {
  const { repo, u, doc } = await conLoPropio();
  const antes = JSON.stringify(await repo.apartados.listar(doc._id, {}));
  const guardada = JSON.stringify(await estructuraGuardada(repo, doc, PROG));
  await esError(await poner(u.luis, doc._id, PROG, { estructura: null, confirmar: true }), 403, 'sin_permiso');
  await esError(await poner(u.estudios, doc._id, PROG, { estructura: null, confirmar: true }), 403, 'sin_permiso');
  await esError(await poner(u.pepe, doc._id, PROG, { estructura: null, confirmar: true }), 404, 'no_encontrado');
  await esError(await poner(null, doc._id, PROG, { estructura: null, confirmar: true }), 401, 'sin_identificar');
  assert.equal(JSON.stringify(await repo.apartados.listar(doc._id, {})), antes);
  assert.equal(JSON.stringify(await estructuraGuardada(repo, doc, PROG)), guardada);
  const r = await poner(u.jefa, doc._id, PROG, { estructura: null, confirmar: true });
  assert.equal(r.status, 200);
  assert.equal(await fila(repo, doc, TALLER, PROG), undefined);
});

prueba('null con confirmar y un token viejo: 409 y no se destruye nada', async () => {
  const { repo, u, doc } = await conLoPropio();
  const leida = await (await leer(u.ana, doc._id, PROG)).json();
  assert.equal((await poner(u.jefa, doc._id, OTRO, { estructura: null, confirmar: true })).status, 200);
  const antes = JSON.stringify(await repo.apartados.listar(doc._id, { unidadId: PROG }));
  const guardada = JSON.stringify(await estructuraGuardada(repo, doc, PROG));
  await esError(await poner(u.ana, doc._id, PROG, { estructura: null, confirmar: true, esperaUpdatedAt: leida.updatedAt }), 409, 'conflicto');
  await esError(await poner(u.ana, doc._id, PROG, { estructura: null, confirmar: true, esperaPlantillaVersion: leida.plantillaVersion + 1 }), 409, 'conflicto');
  assert.equal(JSON.stringify(await repo.apartados.listar(doc._id, { unidadId: PROG })), antes);
  assert.equal(JSON.stringify(await estructuraGuardada(repo, doc, PROG)), guardada);
});

prueba('null con confirmar en una versión alternativa: 409 y no se destruye nada', async () => {
  const { repo, u, doc } = await conLoPropio();
  const antes = JSON.stringify(await repo.apartados.listar(doc._id, {}));
  await repo.documentos.actualizar(doc._id, { activa: false });
  await esError(await poner(u.jefa, doc._id, PROG, { estructura: null, confirmar: true }), 409, 'version_alternativa');
  assert.equal(JSON.stringify(await repo.apartados.listar(doc._id, {})), antes);
  assert.notEqual(await estructuraGuardada(repo, doc, PROG), null);
});

prueba('un PUT que no es null y quita un apartado propio es un 400 (como una casilla), aunque lleve confirmar, y no destruye', async () => {
  const { repo, u, doc } = await conLoPropio();
  const antes = JSON.stringify(await repo.apartados.listar(doc._id, {}));
  const guardada = JSON.stringify(await estructuraGuardada(repo, doc, PROG));
  const sinNieto = propia();
  sinNieto.apartados.anadidos = sinNieto.apartados.anadidos.slice(0, 1);
  const sinApartados = propia();
  delete sinApartados.apartados;
  for (const estructura of [sinNieto, sinApartados]) {
    const c = await esError(await poner(u.ana, doc._id, PROG, { estructura, confirmar: true }), 400, 'peticion');
    assert.ok(c.mensaje.includes('retirado'), c.mensaje);
    assert.ok(c.mensaje.includes('No se ha cambiado nada'));
  }
  assert.equal(JSON.stringify(await repo.apartados.listar(doc._id, {})), antes);
  assert.equal(JSON.stringify(await estructuraGuardada(repo, doc, PROG)), guardada);
});

prueba('un apartado propio guardado sin casillas (dato antiguo) tampoco sale con un PUT que no es null: lo para la red de loQueSePierde', async () => {
  const { repo, u, doc } = await escenario();
  const vacio = { apartados: { anadidos: [{ id: TALLER, titulo: 'Taller de depuración', padre: 'modulos', campos: [] }] } };
  await repo.unidades.actualizar(doc._id, PROG, { estructura: vacio });
  await repo.apartados.escribir(doc._id, TALLER, PROG, { valores: { m_texto: escribe('escrito') } });
  const c = await esError(await poner(u.ana, doc._id, PROG, { estructura: reforma(), confirmar: true }), 400, 'peticion');
  assert.equal(c.perdida.apartados, 1);
  assert.ok(c.mensaje.includes('1 apartado de este módulo, con algo escrito'), c.mensaje);
  assert.deepStrictEqual(await estructuraGuardada(repo, doc, PROG), vacio);
  assert.ok(await fila(repo, doc, TALLER, PROG), 'su contenido sigue ahí');
});

(async () => {
  for (const { nombre, fn } of pendientes) {
    try {
      await fn();
      console.log(`ok   ${nombre}`);
    } catch (e) {
      fallos += 1;
      console.log(`FALLA ${nombre}\n     ${e && e.stack ? e.stack : e}`);
    }
  }
  console.log(fallos ? `\n${fallos} prueba(s) con fallos` : '\nTodas las pruebas correctas');
  process.exit(fallos ? 1 : 0);
})();
