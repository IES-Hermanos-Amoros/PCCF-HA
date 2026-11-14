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

  const r = await poner(u.ana, doc._id, PROG, { estructura: null });
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
