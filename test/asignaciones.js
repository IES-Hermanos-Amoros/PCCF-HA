// La asignación de apartados comunes a personas, con las rutas llamadas directamente.
//
//   node test/asignaciones.js
//
// Sin Next, sin red y sin base de datos, como test/asignacion.js. Cada prueba tiene su propio almacén.

'use strict';

const assert = require('assert/strict');

const { crearRepositorio } = require('../repositorio');
const memoria = require('../repositorio/memoria');
const { COOKIE_SESION, abrirSesion } = require('../app/_lib/sesion');
const Asignaciones = require('../app/_lib/rutas/asignaciones');
const Apartado = require('../app/_lib/rutas/apartado');
const Estructura = require('../app/_lib/rutas/estructura');
const Arrastre = require('../app/_lib/rutas/arrastre');

const CLAVE_GLOBAL = '__pccf_repositorio__';
let fallos = 0;
const pendientes = [];
const prueba = (nombre, fn) => pendientes.push({ nombre, fn });

const TESTIGOS = new Map();

function pet(camino, persona, { metodo = 'GET', cuerpo } = {}) {
  const cabeceras = persona ? { cookie: `${COOKIE_SESION}=${TESTIGOS.get(persona._id)}` } : {};
  let crudo;
  if (typeof cuerpo === 'string') {
    crudo = cuerpo;
    cabeceras['content-type'] = 'application/json';
  } else if (cuerpo !== undefined) {
    crudo = JSON.stringify(cuerpo);
    cabeceras['content-type'] = 'application/json';
  }
  return new Request(`http://pruebas.local${camino}`, { method: metodo, headers: cabeceras, body: crudo });
}

async function esError(respuesta, estado, codigo) {
  assert.equal(respuesta.status, estado, `se esperaba un ${estado} y ha sido un ${respuesta.status}`);
  const cuerpo = await respuesta.json();
  assert.equal(cuerpo.error, codigo);
  assert.ok(typeof cuerpo.mensaje === 'string' && cuerpo.mensaje.length > 0);
  return cuerpo;
}

const ver = (persona, id) => Asignaciones.GET(pet(`/api/documentos/${id}/asignaciones`, persona), { id });
const asignarCrudo = (persona, id, seccion, cuerpo) => Asignaciones.PUT(
  pet(`/api/documentos/${id}/asignaciones?seccion=${encodeURIComponent(seccion)}`, persona, { metodo: 'PUT', cuerpo }),
  { id },
);
const asignar = (persona, id, seccion, personas) => asignarCrudo(persona, id, seccion, { personas });
const apartadoDe = (persona, id, consulta) => Apartado.GET(pet(`/api/documentos/${id}/apartado?${consulta}`, persona), { id });
const estructura = (ruta, accion, persona, id, seccion, metodo) => ruta[accion](
  pet(`/api/documentos/${id}/estructura/apartado?seccion=${encodeURIComponent(seccion)}`, persona, { metodo, cuerpo: {} }),
  { id },
);

const campoTexto = { id: 'texto', tipo: 'texto_largo', etiqueta: 'Texto' };
const PLANTILLA = {
  tipo: 'programacion_didactica',
  origen: 'PD_sintetica.docx',
  version: null,
  generada: '2026-01-01T00:00:00.000Z',
  secciones: [
    { id: 'introduccion', titulo: 'Introducción', nivel: 1, edita: 'jefe_departamento', presencia: 1, campos: [campoTexto], hijos: [] },
    { id: 'organizacion', titulo: 'Organización', nivel: 1, edita: 'jefe_departamento', presencia: 1, campos: [], hijos: [
      { id: 'organizacion/horario', titulo: 'Horario', nivel: 2, presencia: 1, campos: [campoTexto], hijos: [] },
    ] },
    { id: 'propio', titulo: 'Propio de los docentes', nivel: 1, edita: 'docentes_del_modulo', presencia: 1, campos: [campoTexto], hijos: [] },
    { id: 'modulos', titulo: 'Módulos', nivel: 1, instancias: true, etiqueta_instancia: 'módulo', edita: 'docentes_del_modulo', presencia: 3, campos: [], hijos: [
      { id: 'modulos/metodologia', titulo: 'Metodología', nivel: 3, presencia: 3, campos: [campoTexto], hijos: [] },
    ] },
  ],
};

async function escenario() {
  const adaptador = memoria.crear();
  const repo = crearRepositorio({ adaptador });
  repo.enMemoria = true;
  globalThis[CLAVE_GLOBAL] = repo;
  const persona = async (nombre, email, rol, departamento, extra) => {
    const p = await repo.usuarios.crear({ nombre, email, rol, departamento, ...(extra || {}) });
    const { testigo } = await abrirSesion(repo, p._id);
    TESTIGOS.set(p._id, testigo);
    return p;
  };
  const u = {
    admin: await persona('Soporte', 'soporte@ejemplo.invalid', 'admin', 'informatica'),
    jefa: await persona('Jefatura', 'jefatura@ejemplo.invalid', 'jefe_departamento', 'informatica'),
    ana: await persona('Ana', 'ana@ejemplo.invalid', 'docente', 'informatica'),
    luis: await persona('Luis', 'luis@ejemplo.invalid', 'docente', 'informatica'),
    estudios: await persona('Estudios', 'estudios@ejemplo.invalid', 'jefe_estudios', 'direccion'),
    pepe: await persona('Pepe', 'pepe@ejemplo.invalid', 'docente', 'matematicas'),
    jefeMates: await persona('Jefe de mates', 'jm@ejemplo.invalid', 'jefe_departamento', 'matematicas'),
  };
  u.baja = await persona('Baja', 'baja@ejemplo.invalid', 'docente', 'informatica', { activo: false });
  const doc = await repo.documentos.crear({
    tipo: 'programacion_didactica', ciclo: 'daw', curso: '2026-27', departamento: 'informatica',
    estado: 'borrador', plantilla: PLANTILLA, plantillaVersion: 1, origen: 'PD_sintetica.docx',
  });
  await repo.unidades.crearMuchos(doc._id, [
    { unidadId: 'daw-0485', titulo: 'Programación', num: '0485', grupo: 'Módulos' },
  ]);
  return { repo, u, doc };
}

const guardadas = async (repo, id) => (await repo.documentos.obtener(id)).asignaciones || {};

// ================================================================ pruebas

prueba('solo son asignables los apartados que edita la jefatura, con el edita heredado y sin los módulos', async () => {
  const { u, doc } = await escenario();
  const r = await ver(u.ana, doc._id);
  assert.equal(r.status, 200);
  const cuerpo = await r.json();
  assert.deepEqual(cuerpo.apartados.map((a) => a.seccion), ['introduccion', 'organizacion', 'organizacion/horario']);
  assert.deepEqual(cuerpo.resumen, { apartados: 3, conPersonas: 0 });
  assert.equal(cuerpo.puedeAsignar, false);
  assert.deepEqual(cuerpo.personas.map((p) => p._id).sort(), [u.ana._id, u.luis._id, u.jefa._id].sort());
});

prueba('la jefatura asigna un apartado, se guarda y quien lo lleva pasa a poder editarlo', async () => {
  const { repo, u, doc } = await escenario();
  const consulta = 'seccion=introduccion';
  assert.equal((await (await apartadoDe(u.ana, doc._id, consulta)).json()).puedeEditar, false);

  const r = await asignar(u.jefa, doc._id, 'introduccion', [u.ana._id]);
  assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).personas, [u.ana._id]);
  assert.deepEqual((await guardadas(repo, doc._id)).introduccion, [u.ana._id]);

  assert.equal((await (await apartadoDe(u.ana, doc._id, consulta)).json()).puedeEditar, true);
  assert.equal((await (await apartadoDe(u.luis, doc._id, consulta)).json()).puedeEditar, false);

  const mia = await (await ver(u.ana, doc._id)).json();
  assert.deepEqual(mia.mios.apartados, [{ seccion: 'introduccion', titulo: 'Introducción' }]);
  assert.equal(mia.mios.editaTodo, false);
});

prueba('asignar un apartado raíz da también sus subapartados', async () => {
  const { u, doc } = await escenario();
  await asignar(u.admin, doc._id, 'organizacion', [u.luis._id]);
  const horario = await (await apartadoDe(u.luis, doc._id, 'seccion=organizacion/horario')).json();
  assert.equal(horario.puedeEditar, true);
});

prueba('se manda la lista completa y una lista vacía quita la asignación sin dejar la clave', async () => {
  const { repo, u, doc } = await escenario();
  await asignar(u.jefa, doc._id, 'introduccion', [u.ana._id, u.luis._id]);
  await asignar(u.jefa, doc._id, 'introduccion', [u.luis._id]);
  assert.deepEqual((await guardadas(repo, doc._id)).introduccion, [u.luis._id]);
  await asignar(u.jefa, doc._id, 'organizacion', [u.ana._id]);
  const r = await asignar(u.jefa, doc._id, 'introduccion', []);
  assert.equal(r.status, 200);
  assert.deepEqual(await guardadas(repo, doc._id), { organizacion: [u.ana._id] });
});

prueba('docente y jefatura de estudios: 403; jefatura de otro departamento: 404; no se guarda nada', async () => {
  const { repo, u, doc } = await escenario();
  await esError(await asignar(u.ana, doc._id, 'introduccion', [u.ana._id]), 403, 'sin_permiso');
  await esError(await asignar(u.estudios, doc._id, 'introduccion', [u.ana._id]), 403, 'sin_permiso');
  await esError(await asignar(u.jefeMates, doc._id, 'introduccion', [u.ana._id]), 404, 'no_encontrado');
  await esError(await ver(u.pepe, doc._id), 404, 'no_encontrado');
  assert.deepEqual(await guardadas(repo, doc._id), {});
});

prueba('sin sesión es 401', async () => {
  const { doc } = await escenario();
  await esError(await asignar(null, doc._id, 'introduccion', []), 401, 'sin_identificar');
});

prueba('no se asigna un módulo, un apartado de docentes ni uno que no existe: 404', async () => {
  const { repo, u, doc } = await escenario();
  for (const s of ['modulos', 'modulos/metodologia', 'propio', 'inventado', '']) {
    await esError(await asignar(u.jefa, doc._id, s, [u.ana._id]), 404, 'no_encontrado');
  }
  assert.deepEqual(await guardadas(repo, doc._id), {});
});

prueba('ids que no valen: 400 con los invalidos y no se guarda nada, ni los buenos', async () => {
  const { repo, u, doc } = await escenario();
  const malos = [u.pepe._id, u.baja._id, u.estudios._id, u.admin._id, 'inventado'];
  const cuerpo = await esError(await asignar(u.jefa, doc._id, 'introduccion', [u.ana._id, ...malos]), 400, 'peticion');
  assert.deepEqual(cuerpo.invalidos, malos);
  assert.deepEqual(await guardadas(repo, doc._id), {});
});

prueba('cuerpo mal formado: 400 y no se escribe', async () => {
  const { repo, u, doc } = await escenario();
  await esError(await asignarCrudo(u.jefa, doc._id, 'introduccion', 'no es json'), 400, 'peticion');
  await esError(await asignarCrudo(u.jefa, doc._id, 'introduccion', {}), 400, 'peticion');
  await esError(await asignar(u.jefa, doc._id, 'introduccion', [u.ana._id, u.ana._id]), 400, 'peticion');
  await esError(await asignar(u.jefa, doc._id, 'introduccion', [7]), 400, 'peticion');
  assert.deepEqual(await guardadas(repo, doc._id), {});
});

prueba('una persona dada de baja después no cuenta como quien lleva el apartado', async () => {
  const { repo, u, doc } = await escenario();
  await asignar(u.jefa, doc._id, 'introduccion', [u.ana._id, u.luis._id]);
  await repo.usuarios.actualizar(u.luis._id, { activo: false });
  const cuerpo = await (await ver(u.jefa, doc._id)).json();
  assert.deepEqual(cuerpo.apartados[0].personas, [u.ana._id]);
});

prueba('lo que puede editar cada rol: sus módulos y sus apartados; jefatura todo; estudios nada', async () => {
  const { repo, u, doc } = await escenario();
  await repo.unidades.actualizar(doc._id, 'daw-0485', { docentes: [u.ana._id] });
  await asignar(u.jefa, doc._id, 'organizacion', [u.ana._id]);
  const ana = (await (await ver(u.ana, doc._id)).json()).mios;
  assert.deepEqual(ana.unidades, [{ unidadId: 'daw-0485', titulo: 'Programación' }]);
  assert.deepEqual(ana.apartados.map((a) => a.seccion), ['organizacion']);
  assert.equal((await (await ver(u.jefa, doc._id)).json()).mios.editaTodo, true);
  const estudios = (await (await ver(u.estudios, doc._id)).json()).mios;
  assert.equal(estudios.soloLectura, true);
  assert.equal(estudios.editaTodo, false);
});

prueba('las asignaciones viajan al curso siguiente, como copia', async () => {
  const { repo, u, doc } = await escenario();
  await asignar(u.jefa, doc._id, 'introduccion', [u.ana._id]);
  await asignar(u.jefa, doc._id, 'organizacion/horario', [u.luis._id]);
  const r = await Arrastre.CREAR(
    pet(`/api/documentos/${doc._id}/siguiente-curso`, u.jefa, { metodo: 'POST', cuerpo: {} }),
    { id: doc._id },
  );
  assert.equal(r.status, 201);
  const nuevo = await r.json();
  const nuevoId = (nuevo.documento && nuevo.documento._id) || nuevo.documentoId || nuevo._id;
  assert.ok(nuevoId, 'la respuesta no dice qué documento ha creado');
  assert.deepEqual(await guardadas(repo, nuevoId), { introduccion: [u.ana._id], 'organizacion/horario': [u.luis._id] });
  await asignar(u.jefa, nuevoId, 'introduccion', []);
  assert.deepEqual((await guardadas(repo, doc._id)).introduccion, [u.ana._id]);
});

prueba('borrar un apartado retirado limpia su asignación y la de sus subapartados', async () => {
  const { repo, u, doc } = await escenario();
  await asignar(u.jefa, doc._id, 'organizacion', [u.ana._id]);
  await asignar(u.jefa, doc._id, 'organizacion/horario', [u.luis._id]);
  await asignar(u.jefa, doc._id, 'introduccion', [u.ana._id]);
  const retirada = await Estructura.RETIRAR(
    pet(`/api/documentos/${doc._id}/estructura/apartado/retirar?seccion=organizacion`, u.jefa, { metodo: 'POST', cuerpo: {} }),
    { id: doc._id },
  );
  assert.equal(retirada.status, 200);
  // Retirar no borra: la asignación se conserva por si se restaura.
  assert.deepEqual((await guardadas(repo, doc._id)).organizacion, [u.ana._id]);
  const borrada = await estructura(Estructura, 'BORRAR', u.jefa, doc._id, 'organizacion', 'DELETE');
  assert.equal(borrada.status, 200);
  assert.deepEqual(await guardadas(repo, doc._id), { introduccion: [u.ana._id] });
});

async function ejecutar() {
  for (const { nombre, fn } of pendientes) {
    try {
      await fn();
      console.log(`ok   ${nombre}`);
    } catch (e) {
      fallos += 1;
      console.log(`FALLO ${nombre}`);
      console.log(`     ${String(e && e.stack).split('\n').slice(0, 4).join('\n     ')}`);
    }
  }
  console.log(fallos
    ? `\n${fallos} de ${pendientes.length} pruebas con fallos`
    : `\n${pendientes.length} pruebas de las asignaciones de apartados correctas`);
  process.exit(fallos ? 1 : 0);
}

ejecutar();
