// El borrado para siempre DENTRO DE UN MÓDULO: DELETE …/unidades/[unidad]/estructura/apartado y /campo
// (app/_lib/rutas/estructura-modulo-borrar.js).
//
//   node test/estructura-modulo-borrar.js
//
// Sin levantar Next, sin red y sin base de datos: las rutas se llaman directamente con un `Request`
// normal, como en test/estructura-modulo-ruta.js, y el repositorio es el de memoria.
//
// QUÉ SE PRUEBA
//
//   · borrar un apartado propio retirado destruye SUS filas y SUS comentarios, y se va con su subárbol
//   · EL CORAZÓN: otro módulo con el mismo id de apartado o de casilla y contenido propio no pierde nada
//   · borrar una casilla propia, de un apartado común y de un apartado propio
//   · sin `{ confirmar: true }`, o sin cuerpo, 400 que dice cuánto se pierde y no toca nada
//   · lo que no está retirado, lo común y lo que no existe
//   · el orden 401 / 404 / 403 / 400 / 409
//   · sin desvíos, `estructura: null`

'use strict';

const assert = require('assert/strict');

const { crearRepositorio } = require('../repositorio');
const memoria = require('../repositorio/memoria');
const Unidades = require('../core/unidades');
const { aFilas } = require('../core/documento');
const EstructuraModulo = require('../core/estructura-modulo');
const { COOKIE_SESION, abrirSesion } = require('../app/_lib/sesion');
const Ruta = require('../app/_lib/rutas/estructura-modulo-borrar');

const CLAVE_GLOBAL = '__pccf_repositorio__';

let fallos = 0;
const pendientes = [];
const prueba = (nombre, fn) => pendientes.push({ nombre, fn });

const TESTIGOS = new Map();

function pet(camino, persona, { cuerpo } = {}) {
  const cabeceras = persona ? { cookie: `${COOKIE_SESION}=${TESTIGOS.get(persona._id)}` } : {};
  let crudo;
  if (cuerpo !== undefined) {
    crudo = JSON.stringify(cuerpo);
    cabeceras['content-type'] = 'application/json';
  }
  return new Request(`http://pruebas.local${camino}`, { method: 'DELETE', headers: cabeceras, body: crudo });
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
const EVALUACION = 'modulos/evaluacion';
const TALLER = 'modulos/m_taller';
const HIJO = TALLER + '/m_nota';
const VIVO = 'modulos/m_vivo';

const OPCIONES = {
  curso: '2026-27', ciclo: 'daw', departamento: 'informatica', origenApartados: 'nuevo',
  conciliar: (titulo) => MODULOS.find((id) => Unidades.tituloDe(id, '2026-27') === titulo),
};

const casilla = (id, etiqueta, extra) => Object.assign({ id, tipo: 'texto_largo', etiqueta }, extra);
const escribe = (t) => [{ type: 'p', text: t }];

// Lo que lleva cada módulo con estructura propia. Lo retirado es lo que se puede borrar.
const propia = () => ({
  secciones: {
    [METODOLOGIA]: { anadidos: [casilla('m_notas', 'Notas', { retirado: true })] },
    [EVALUACION]: { anadidos: [casilla('m_obs', 'Observaciones')] },
  },
  apartados: { anadidos: [
    { id: TALLER, titulo: 'Taller de depuración', padre: 'modulos', retirado: true,
      campos: [casilla('m_texto', 'Texto'), casilla('m_pasos', 'Pasos', { retirado: true })] },
    { id: HIJO, titulo: 'Nota', padre: TALLER, campos: [casilla('m_texto', 'Texto')] },
    { id: VIVO, titulo: 'Apartado vivo', padre: 'modulos',
      campos: [casilla('m_x', 'Equis'), casilla('m_y', 'Ye', { retirado: true })] },
  ] },
});

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
      documento: { introduccion: { texto: escribe('Hola.') } },
      instancias: MODULOS.map((id) => ({
        titulo: Unidades.tituloDe(id, '2026-27'), num: null, grupo: 'Módulos del primer curso',
        docentes: id === PROG ? [u.ana._id] : [],
        valores: { [METODOLOGIA]: { texto: escribe('Metodología.') } },
      })),
      asignaciones: {},
      compartidos: {},
    },
  }, OPCIONES);
  const doc = await repo.documentos.crear(filas.documento);
  await repo.unidades.crearMuchos(doc._id, filas.unidades);
  await repo.apartados.crearMuchos(doc._id, filas.apartados);
  return { repo, u, doc };
}

// PROG y OTRO con la MISMA estructura propia (mismos ids) y contenido distinto en cada uno.
async function conLoPropio(estructura = propia()) {
  const e = await escenario();
  const { repo, doc } = e;
  for (const m of [PROG, OTRO]) {
    await repo.unidades.actualizar(doc._id, m, { estructura });
    await repo.apartados.escribir(doc._id, METODOLOGIA, m, { valores: { texto: escribe('común ' + m), m_notas: escribe('notas ' + m) } });
    await repo.apartados.escribir(doc._id, EVALUACION, m, { valores: { texto: escribe('eval ' + m), m_obs: escribe('obs ' + m) } });
    await repo.apartados.escribir(doc._id, TALLER, m, { valores: { m_texto: escribe('taller ' + m), m_pasos: escribe('pasos ' + m) } });
    await repo.apartados.escribir(doc._id, HIJO, m, { valores: { m_texto: escribe('nieto ' + m) } });
    await repo.apartados.escribir(doc._id, VIVO, m, { valores: { m_x: escribe('vivo ' + m) } });
    for (const s of [TALLER, HIJO, METODOLOGIA]) {
      await repo.comentarios.crear({ documentoId: doc._id, seccion: s, unidadId: m, autor: 'ana', texto: `hilo ${s} ${m}` });
    }
  }
  return e;
}

const base = (id, unidad) => `/api/documentos/${id}/unidades/${encodeURIComponent(unidad)}/estructura`;
const borrarApartado = (persona, id, unidad, seccion, cuerpo) => Ruta.BORRAR_APARTADO(
  pet(`${base(id, unidad)}/apartado?seccion=${encodeURIComponent(seccion)}`, persona, { cuerpo }), { id, unidad },
);
const borrarCampo = (persona, id, unidad, seccion, campo, cuerpo) => Ruta.BORRAR_CAMPO(
  pet(`${base(id, unidad)}/campo?seccion=${encodeURIComponent(seccion)}&campo=${encodeURIComponent(campo)}`, persona, { cuerpo }), { id, unidad },
);
const SI = { confirmar: true };

async function esError(respuesta, estado, codigo) {
  assert.equal(respuesta.status, estado, `se esperaba un ${estado} y ha sido un ${respuesta.status}: ${await respuesta.clone().text()}`);
  const cuerpo = await respuesta.json();
  assert.equal(cuerpo.error, codigo);
  assert.ok(cuerpo.mensaje && cuerpo.mensaje.length > 0, 'el error no lleva mensaje');
  return cuerpo;
}

const fila = async (repo, doc, seccion, m) => (await repo.apartados.listar(doc._id, { unidadId: m })).find((x) => x.seccion === seccion);
const hilos = async (repo, doc, seccion, m) => (await repo.comentarios.listar(doc._id, { seccion, unidadId: m })).length;
const unidadDe = (repo, doc, m) => repo.unidades.obtener(doc._id, m);
const instantanea = async (repo, doc) => JSON.stringify({
  unidades: await repo.unidades.listar(doc._id),
  apartados: await repo.apartados.listar(doc._id),
  comentarios: await repo.comentarios.listar(doc._id),
});

// ================================================================

prueba('un apartado propio retirado: 200, se va de anadidos, y se destruyen SUS filas y SUS comentarios', async () => {
  const { repo, u, doc } = await conLoPropio();
  const r = await borrarApartado(u.ana, doc._id, PROG, TALLER, SI);
  assert.equal(r.status, 200, await r.clone().text());
  const j = await r.json();
  assert.equal(j.seccion, TALLER);
  assert.equal(j.contenidoSinDestruir, null);
  assert.equal(j.filas, 2, 'el taller y su nieto');
  assert.equal(j.comentarios, 2);
  assert.equal(j.casillas, 0);
  assert.ok(j.updatedAt);

  const ids = ((await unidadDe(repo, doc, PROG)).estructura.apartados.anadidos).map((a) => a.id);
  assert.deepStrictEqual(ids, [VIVO]);
  assert.deepStrictEqual(j.estructura, EstructuraModulo.estructuraDeModulo(await unidadDe(repo, doc, PROG)));
  assert.equal(await fila(repo, doc, TALLER, PROG), undefined);
  assert.equal(await fila(repo, doc, HIJO, PROG), undefined);
  assert.equal(await hilos(repo, doc, TALLER, PROG), 0);
  assert.equal(await hilos(repo, doc, HIJO, PROG), 0);
  // Lo que no es del taller se queda.
  assert.ok(await fila(repo, doc, VIVO, PROG));
  assert.ok(await fila(repo, doc, METODOLOGIA, PROG));
  assert.equal(await hilos(repo, doc, METODOLOGIA, PROG), 1);
});

prueba('EL CORAZÓN: el mismo apartado propio en otro módulo, con su contenido, sobrevive', async () => {
  const { repo, u, doc } = await conLoPropio();
  const antes = JSON.stringify(await unidadDe(repo, doc, OTRO));
  const r = await borrarApartado(u.ana, doc._id, PROG, TALLER, SI);
  assert.equal(r.status, 200, await r.clone().text());

  assert.equal(JSON.stringify(await unidadDe(repo, doc, OTRO)), antes, 'la estructura del otro módulo no cambia');
  const taller = await fila(repo, doc, TALLER, OTRO);
  assert.deepStrictEqual(taller.valores.m_texto, escribe('taller ' + OTRO));
  assert.deepStrictEqual(taller.valores.m_pasos, escribe('pasos ' + OTRO));
  assert.deepStrictEqual((await fila(repo, doc, HIJO, OTRO)).valores.m_texto, escribe('nieto ' + OTRO));
  assert.equal(await hilos(repo, doc, TALLER, OTRO), 1);
  assert.equal(await hilos(repo, doc, HIJO, OTRO), 1);
});

prueba('EL CORAZÓN: la misma casilla m_notas en el mismo apartado común de otro módulo sigue con su valor', async () => {
  const { repo, u, doc } = await conLoPropio();
  const r = await borrarCampo(u.ana, doc._id, PROG, METODOLOGIA, 'm_notas', SI);
  assert.equal(r.status, 200, await r.clone().text());
  const otro = await fila(repo, doc, METODOLOGIA, OTRO);
  assert.deepStrictEqual(otro.valores.m_notas, escribe('notas ' + OTRO), 'la casilla del otro módulo intacta');
  assert.deepStrictEqual(otro.valores.texto, escribe('común ' + OTRO));
  assert.equal(JSON.stringify((await unidadDe(repo, doc, OTRO)).estructura), JSON.stringify(propia()));
});

prueba('una casilla propia retirada de un apartado común: 200, sale de anadidos y su clave de la fila de esa unidad', async () => {
  const { repo, u, doc } = await conLoPropio();
  const r = await borrarCampo(u.ana, doc._id, PROG, METODOLOGIA, 'm_notas', SI);
  assert.equal(r.status, 200, await r.clone().text());
  const j = await r.json();
  assert.equal(j.seccion, METODOLOGIA);
  assert.equal(j.campo, 'm_notas');
  assert.equal(j.casillas, 1);
  assert.equal(j.filas, 0);
  assert.equal(j.comentarios, 0, 'quitar una casilla no toca los hilos del apartado');
  assert.equal(j.contenidoSinDestruir, null);

  const e = (await unidadDe(repo, doc, PROG)).estructura;
  assert.equal(e.secciones[METODOLOGIA], undefined, 'sin casillas ni desvío, el apartado sale de secciones');
  assert.deepStrictEqual(e.secciones[EVALUACION].anadidos.map((c) => c.id), ['m_obs']);
  const f = await fila(repo, doc, METODOLOGIA, PROG);
  assert.ok(!('m_notas' in f.valores), 'la clave desaparece');
  assert.deepStrictEqual(f.valores.texto, escribe('común ' + PROG));
  assert.equal(await hilos(repo, doc, METODOLOGIA, PROG), 1);
});

prueba('una casilla propia retirada que está dentro de un apartado propio', async () => {
  const { repo, u, doc } = await conLoPropio();
  const r = await borrarCampo(u.ana, doc._id, PROG, TALLER, 'm_pasos', SI);
  assert.equal(r.status, 200, await r.clone().text());
  const j = await r.json();
  assert.equal(j.casillas, 1);
  assert.equal(j.filas, 0, 'la fila del apartado se queda');

  const taller = (await unidadDe(repo, doc, PROG)).estructura.apartados.anadidos.find((a) => a.id === TALLER);
  assert.deepStrictEqual(taller.campos.map((c) => c.id), ['m_texto']);
  const f = await fila(repo, doc, TALLER, PROG);
  assert.ok(!('m_pasos' in f.valores));
  assert.deepStrictEqual(f.valores.m_texto, escribe('taller ' + PROG));
  // El otro módulo conserva su casilla y su valor.
  assert.deepStrictEqual((await fila(repo, doc, TALLER, OTRO)).valores.m_pasos, escribe('pasos ' + OTRO));
});

prueba('un apartado propio se va con su subárbol: el nieto también, y su contenido', async () => {
  // El nieto no está retirado por separado: se va porque su padre sí lo está.
  const { repo, u, doc } = await conLoPropio();
  const r = await borrarApartado(u.jefa, doc._id, PROG, TALLER, SI);
  assert.equal(r.status, 200, await r.clone().text());
  const j = await r.json();
  assert.equal(j.perdida.apartados.length, 2);
  assert.deepStrictEqual(j.perdida.apartados.map((a) => a.id).sort(), [HIJO, TALLER].sort());
  assert.equal(await fila(repo, doc, HIJO, PROG), undefined);
  assert.equal(await hilos(repo, doc, HIJO, PROG), 0);
  assert.ok(!(await unidadDe(repo, doc, PROG)).estructura.apartados.anadidos.some((a) => a.id === HIJO));
});

prueba('sin { confirmar: true }: 400 que dice cuánto se pierde, y no se toca nada', async () => {
  const { repo, u, doc } = await conLoPropio();
  const antes = await instantanea(repo, doc);

  const a = await esError(await borrarApartado(u.ana, doc._id, PROG, TALLER, {}), 400, 'peticion');
  // El aviso nombra lo que se borra y, detras de dos puntos, lo que se va.
  assert.ok(a.mensaje.includes('y sus subapartados no se puede deshacer'), a.mensaje);
  assert.ok(a.mensaje.includes('Esto es lo que se va: 2 apartados de este módulo, '), a.mensaje);
  await esError(await borrarApartado(u.ana, doc._id, PROG, TALLER, { confirmar: 'true' }), 400, 'peticion');
  await esError(await borrarApartado(u.ana, doc._id, PROG, TALLER, { confirmar: false }), 400, 'peticion');

  const c = await esError(await borrarCampo(u.ana, doc._id, PROG, METODOLOGIA, 'm_notas', {}), 400, 'peticion');
  assert.ok(c.mensaje.includes('Borrar la casilla «'), c.mensaje);
  assert.ok(c.mensaje.includes('Esto es lo que se va: 1 casilla de este módulo, '), c.mensaje);
  assert.equal(await instantanea(repo, doc), antes, 'sin confirmar no cambia nada');
});

prueba('sin cuerpo ninguno: 400 por lo mismo', async () => {
  const { repo, u, doc } = await conLoPropio();
  const antes = await instantanea(repo, doc);
  const a = await esError(await borrarApartado(u.ana, doc._id, PROG, TALLER), 400, 'peticion');
  assert.ok(a.mensaje.includes('confirmar'), a.mensaje);
  assert.ok(a.mensaje.includes('apartados de este módulo'));
  await esError(await borrarCampo(u.ana, doc._id, PROG, METODOLOGIA, 'm_notas'), 400, 'peticion');
  assert.equal(await instantanea(repo, doc), antes);
});

prueba('lo que no está retirado: 400 que dice que primero hay que retirarlo', async () => {
  const { repo, u, doc } = await conLoPropio();
  const antes = await instantanea(repo, doc);
  const a = await esError(await borrarApartado(u.ana, doc._id, PROG, VIVO, SI), 400, 'peticion');
  assert.ok(a.mensaje.includes('primero hay que retirarlo'), a.mensaje);
  const c = await esError(await borrarCampo(u.ana, doc._id, PROG, EVALUACION, 'm_obs', SI), 400, 'peticion');
  assert.ok(c.mensaje.includes('primero hay que retirarla'), c.mensaje);
  const d = await esError(await borrarCampo(u.ana, doc._id, PROG, VIVO, 'm_x', SI), 400, 'peticion');
  assert.ok(d.mensaje.includes('primero hay que retirarla'), d.mensaje);
  assert.equal(await instantanea(repo, doc), antes);
});

prueba('un apartado o una casilla COMUNES: 400 que explica por dónde se hace', async () => {
  const { repo, u, doc } = await conLoPropio();
  const antes = await instantanea(repo, doc);
  const a = await esError(await borrarApartado(u.ana, doc._id, PROG, METODOLOGIA, SI), 400, 'peticion');
  assert.ok(a.mensaje.includes('/estructura/apartado?seccion=') && a.mensaje.includes('documento entero'), a.mensaje);
  const c = await esError(await borrarCampo(u.ana, doc._id, PROG, METODOLOGIA, 'texto', SI), 400, 'peticion');
  assert.ok(c.mensaje.includes('/estructura/apartado/campo?seccion=&campo=') && c.mensaje.includes('documento entero'), c.mensaje);
  assert.equal(await instantanea(repo, doc), antes);
});

prueba('un id que no existe en este módulo: 404', async () => {
  const { repo, u, doc } = await conLoPropio();
  const antes = await instantanea(repo, doc);
  await esError(await borrarApartado(u.ana, doc._id, PROG, 'modulos/m_nada', SI), 404, 'no_encontrado');
  await esError(await borrarCampo(u.ana, doc._id, PROG, 'modulos/m_nada', 'm_x', SI), 404, 'no_encontrado');
  await esError(await borrarCampo(u.ana, doc._id, PROG, METODOLOGIA, 'm_nada', SI), 404, 'no_encontrado');
  await esError(await borrarCampo(u.ana, doc._id, PROG, TALLER, 'm_nada', SI), 404, 'no_encontrado');
  await esError(await borrarApartado(u.ana, doc._id, 'no-hay', TALLER, SI), 404, 'no_encontrado');
  // Un módulo sin estructura propia no tiene nada propio que borrar.
  await esError(await borrarApartado(u.jefa, doc._id, MODULOS.find((m) => m !== PROG && m !== OTRO), TALLER, SI), 404, 'no_encontrado');
  assert.equal(await instantanea(repo, doc), antes);
});

prueba('quien no lleva ese módulo: 403; quien no ve el documento: 404; sin sesión: 401', async () => {
  const { repo, u, doc } = await conLoPropio();
  const antes = await instantanea(repo, doc);
  await esError(await borrarApartado(u.luis, doc._id, PROG, TALLER, SI), 403, 'sin_permiso');
  await esError(await borrarCampo(u.luis, doc._id, PROG, METODOLOGIA, 'm_notas', SI), 403, 'sin_permiso');
  await esError(await borrarApartado(u.estudios, doc._id, PROG, TALLER, SI), 403, 'sin_permiso');
  // El 403 va antes que el 400 de la confirmación.
  await esError(await borrarApartado(u.luis, doc._id, PROG, TALLER), 403, 'sin_permiso');
  await esError(await borrarApartado(u.pepe, doc._id, PROG, TALLER, SI), 404, 'no_encontrado');
  await esError(await borrarCampo(u.pepe, doc._id, PROG, METODOLOGIA, 'm_notas', SI), 404, 'no_encontrado');
  await esError(await borrarApartado(null, doc._id, PROG, TALLER, SI), 401, 'sin_identificar');
  await esError(await borrarCampo(null, doc._id, PROG, METODOLOGIA, 'm_notas', SI), 401, 'sin_identificar');
  assert.equal(await instantanea(repo, doc), antes, 'una petición negada no toca nada');
});

prueba('la jefatura del departamento borra en cualquier módulo', async () => {
  const { repo, u, doc } = await conLoPropio();
  assert.equal((await borrarApartado(u.jefa, doc._id, OTRO, TALLER, SI)).status, 200);
  assert.equal(await fila(repo, doc, TALLER, OTRO), undefined);
  assert.ok(await fila(repo, doc, TALLER, PROG));
});

prueba('borrar el ultimo desvío deja estructura en null, no en un objeto vacío', async () => {
  const sola = { secciones: { [METODOLOGIA]: { anadidos: [casilla('m_notas', 'Notas', { retirado: true })] } } };
  const { repo, u, doc } = await conLoPropio(sola);
  const r = await borrarCampo(u.ana, doc._id, PROG, METODOLOGIA, 'm_notas', SI);
  assert.equal(r.status, 200, await r.clone().text());
  const j = await r.json();
  assert.equal(j.estructura, null);
  const unidad = await unidadDe(repo, doc, PROG);
  assert.ok(unidad.estructura === null || unidad.estructura === undefined, JSON.stringify(unidad.estructura));
  assert.equal(EstructuraModulo.estructuraDeModulo(unidad), null);
  assert.ok(!('m_notas' in (await fila(repo, doc, METODOLOGIA, PROG)).valores));

  // Igual con un apartado: el único desvío que tenía el módulo.
  const solo = { apartados: { anadidos: [
    { id: TALLER, titulo: 'Taller', padre: 'modulos', retirado: true, campos: [casilla('m_texto', 'Texto')] },
  ] } };
  const otro = await conLoPropio(solo);
  const r2 = await borrarApartado(otro.u.ana, otro.doc._id, PROG, TALLER, SI);
  assert.equal(r2.status, 200, await r2.clone().text());
  assert.equal((await r2.json()).estructura, null);
  const u2 = await unidadDe(otro.repo, otro.doc, PROG);
  assert.ok(u2.estructura === null || u2.estructura === undefined, JSON.stringify(u2.estructura));
});

prueba('409 con un esperaUpdatedAt viejo, y no se ha destruido nada', async () => {
  const { repo, u, doc } = await conLoPropio();
  const leido = (await repo.documentos.obtener(doc._id)).updatedAt;
  // Alguien mueve el documento después de que se leyera.
  await repo.documentos.actualizar(doc._id, {}, { esperaUpdatedAt: leido });
  const antes = await instantanea(repo, doc);

  const c = await esError(await borrarApartado(u.ana, doc._id, PROG, TALLER, { confirmar: true, esperaUpdatedAt: new Date(leido).toISOString() }), 409, 'conflicto');
  assert.ok('esperado' in c);
  await esError(await borrarCampo(u.ana, doc._id, PROG, METODOLOGIA, 'm_notas', { confirmar: true, esperaUpdatedAt: new Date(leido).toISOString() }), 409, 'conflicto');
  assert.equal(await instantanea(repo, doc), antes, 'el 409 no destruye nada');

  await esError(await borrarApartado(u.ana, doc._id, PROG, TALLER, { confirmar: true, esperaPlantillaVersion: 99 }), 409, 'conflicto');
  await esError(await borrarApartado(u.ana, doc._id, PROG, TALLER, { confirmar: true, esperaUpdatedAt: 'ayer' }), 400, 'peticion');
  assert.equal(await instantanea(repo, doc), antes);

  // Con lo vigente, sí.
  const vigente = (await repo.documentos.obtener(doc._id)).updatedAt;
  const bien = await borrarApartado(u.ana, doc._id, PROG, TALLER, { confirmar: true, esperaUpdatedAt: new Date(vigente).toISOString() });
  assert.equal(bien.status, 200, await bien.clone().text());
});

prueba('una versión alternativa solo se lee: 409 y no se borra nada', async () => {
  const { repo, u, doc } = await conLoPropio();
  await repo.documentos.actualizar(doc._id, { activa: false });
  const antes = await instantanea(repo, doc);
  await esError(await borrarApartado(u.jefa, doc._id, PROG, TALLER, SI), 409, 'version_alternativa');
  await esError(await borrarCampo(u.jefa, doc._id, PROG, METODOLOGIA, 'm_notas', SI), 409, 'version_alternativa');
  assert.equal(await instantanea(repo, doc), antes);
});

prueba('si la destrucción falla, el 200 sigue y lleva contenidoSinDestruir; la estructura ya está guardada', async () => {
  const { repo, u, doc } = await conLoPropio();
  repo.apartados.borrar = async () => { throw new Error('la base no contesta'); };
  const r = await borrarApartado(u.ana, doc._id, PROG, TALLER, SI);
  assert.equal(r.status, 200, await r.clone().text());
  const j = await r.json();
  assert.equal(j.contenidoSinDestruir, 'la base no contesta');
  assert.ok(!(await unidadDe(repo, doc, PROG)).estructura.apartados.anadidos.some((a) => a.id === TALLER));
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
