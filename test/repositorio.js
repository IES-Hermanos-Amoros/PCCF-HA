// Pruebas de la capa de persistencia. La batería se escribe una sola vez y se ejecuta contra cada adaptador:
//   node test/repositorio.js
// Siempre contra memoria. Contra MongoDB solo si existe MONGODB_URI en el entorno. Cada prueba usa identificadores y
// marcas propias, así que no depende de lo que hubiera ya en la base de datos de pruebas.
const assert = require('assert/strict');
const { randomUUID } = require('node:crypto');
const { crearRepositorio, ErrorConflicto, ErrorDuplicado } = require('../repositorio');
const memoria = require('../repositorio/memoria');
const mongo = require('../repositorio/mongo');

let fallos = 0;

const marca = () => `curso-${randomUUID()}`;
const ids = (lista) => lista.map((x) => x._id).sort();
const esperarMs = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

function documento(repo, extra = {}) {
  return repo.documentos.crear({
    tipo: 'PD', ciclo: 'DAW', curso: marca(), departamento: 'informatica', estado: 'borrador',
    plantilla: 'pd-daw', plantillaVersion: 1, anteriorId: null, asignaciones: {}, origen: 'importacion', ...extra,
  });
}

// Una persona nueva con un correo propio, para que las pruebas no se pisen entre adaptadores ni
// dependan de lo que hubiera ya en la base de datos de pruebas.
function usuario(repo, extra = {}) {
  return repo.usuarios.crear({
    nombre: 'Ana', email: `ana-${randomUUID()}@ejemplo.invalid`, rol: 'docente', departamento: 'informatica', ...extra,
  });
}

// Un hash cualquiera con la forma del de verdad: sha256 en hexadecimal. Las pruebas nunca manejan
// testigos, porque el repositorio no acepta ninguno (app/_lib/testigos.js).
const unHash = () => randomUUID().replace(/-/g, '').repeat(2);

const invitacion = (repo, u, extra = {}) => repo.invitaciones.crear({
  usuarioId: u._id, email: u.email, rol: u.rol, departamento: u.departamento,
  tokenHash: unHash(), expiraEn: new Date(Date.now() + 60_000), creadaPor: null, ...extra,
});

function unidadesDe(...codigos) {
  return codigos.map((unidadId, i) => ({ unidadId, titulo: `Módulo ${unidadId}`, num: i + 1, grupo: 'DAW1', docentes: [] }));
}

// Devuelve el error que lanza la promesa, o falla si no lanza nada.
async function error(promesa) {
  try {
    await promesa;
  } catch (e) {
    return e;
  }
  throw new Error('se esperaba un error y no lo hubo');
}

async function bateria(etiqueta, fabrica) {
  const prueba = async (nombre, fn) => {
    try {
      await fn(crearRepositorio({ adaptador: fabrica() }));
      console.log(`ok   [${etiqueta}] ${nombre}`);
    } catch (e) {
      fallos += 1;
      console.log(`FALLO [${etiqueta}] ${nombre}\n     ${e.message}`);
    }
  };

  // ---- documentos ----

  await prueba('documentos.crear devuelve _id en cadena, creado y updatedAt', async (repo) => {
    const d = await documento(repo);
    assert.equal(typeof d._id, 'string');
    assert.ok(d.creado instanceof Date);
    assert.ok(d.updatedAt instanceof Date);
    assert.equal(d.tipo, 'PD');
    assert.deepEqual(d.asignaciones, {});
  });

  await prueba('documentos.obtener devuelve null si no existe y no lanza con un id que no es válido', async (repo) => {
    assert.equal(await repo.documentos.obtener(randomUUID()), null);
    assert.equal(await repo.documentos.obtener('no-es-un-id'), null);
  });

  await prueba('documentos.listar filtra por tipo, curso, departamento y estado', async (repo) => {
    const curso = marca();
    const a = await documento(repo, { curso, estado: 'borrador' });
    const b = await documento(repo, { curso, estado: 'revision' });
    const c = await documento(repo, { curso, estado: 'borrador', departamento: 'matematicas' });
    const d = await documento(repo, { curso, estado: 'borrador', tipo: 'PCCF' });
    assert.deepEqual(ids(await repo.documentos.listar({ curso })), ids([a, b, c, d]));
    assert.deepEqual(ids(await repo.documentos.listar({ curso, estado: 'borrador' })), ids([a, c, d]));
    assert.deepEqual(ids(await repo.documentos.listar({ curso, departamento: 'informatica', tipo: 'PD' })), ids([a, b]));
    assert.deepEqual(ids(await repo.documentos.listar({ curso, estado: 'aprobado' })), []);
  });

  await prueba('documentos.listar sin filtro o con filtro vacío devuelve todos los documentos', async (repo) => {
    const a = await documento(repo);
    const b = await documento(repo);
    const todos = ids(await repo.documentos.listar());
    assert.ok(todos.includes(a._id) && todos.includes(b._id));
    assert.deepEqual(ids(await repo.documentos.listar({})), todos);
  });

  await prueba('documentos.actualizar cambia lo pedido, conserva _id y creado y pone updatedAt nuevo', async (repo) => {
    const d = await documento(repo);
    await esperarMs(5);
    const u = await repo.documentos.actualizar(d._id, { estado: 'revision', _id: 'otro', creado: new Date(0) });
    assert.equal(u.estado, 'revision');
    assert.equal(u._id, d._id);
    assert.equal(u.creado.getTime(), d.creado.getTime());
    assert.ok(u.updatedAt.getTime() > d.updatedAt.getTime());
    assert.equal(await repo.documentos.actualizar(randomUUID(), { estado: 'aprobado' }), null);
  });

  await prueba('documentos.borrar devuelve true si borra, false si no existe, y arrastra sus apartados', async (repo) => {
    const d = await documento(repo);
    await repo.apartados.escribir(d._id, 'introduccion', null, { valores: { texto: 'x' } });
    assert.equal(await repo.documentos.borrar(d._id), true);
    assert.equal(await repo.documentos.obtener(d._id), null);
    assert.deepEqual(await repo.apartados.listar(d._id), []);
    assert.equal(await repo.documentos.borrar(d._id), false);
  });

  // ---- unidades ----

  await prueba('unidades.listar devuelve las unidades en el orden en que se crearon', async (repo) => {
    const d = await documento(repo);
    const codigos = ['m10', 'm02', 'm07', 'm01', 'm05', 'm12', 'm03', 'm09', 'm04', 'm11'];
    const creadas = await repo.unidades.crearMuchos(d._id, unidadesDe(...codigos));
    assert.equal(creadas.length, codigos.length);
    assert.ok(creadas.every((u) => typeof u._id === 'string'));
    assert.deepEqual((await repo.unidades.listar(d._id)).map((u) => u.unidadId), codigos);
  });

  await prueba('unidades.obtener y actualizar, y las de otro documento no aparecen', async (repo) => {
    const d1 = await documento(repo);
    const d2 = await documento(repo);
    await repo.unidades.crearMuchos(d1._id, unidadesDe('m1', 'm2'));
    await repo.unidades.crearMuchos(d2._id, unidadesDe('m1'));
    const u = await repo.unidades.actualizar(d1._id, 'm1', { docentes: ['ana'], titulo: 'Programación' });
    assert.deepEqual(u.docentes, ['ana']);
    assert.equal((await repo.unidades.obtener(d1._id, 'm1')).titulo, 'Programación');
    assert.equal(await repo.unidades.obtener(d1._id, 'zz'), null);
    assert.deepEqual((await repo.unidades.listar(d1._id)).map((x) => x.unidadId), ['m1', 'm2']);
    assert.equal((await repo.unidades.listar(d2._id)).length, 1);
  });

  await prueba('unidades.crearMuchos rechaza un unidadId repetido y no escribe nada', async (repo) => {
    const d = await documento(repo);
    await repo.unidades.crearMuchos(d._id, unidadesDe('m1'));
    assert.ok((await error(repo.unidades.crearMuchos(d._id, unidadesDe('m2', 'm1')))) instanceof ErrorDuplicado);
    assert.ok((await error(repo.unidades.crearMuchos(d._id, unidadesDe('m3', 'm3')))) instanceof ErrorDuplicado);
    assert.deepEqual((await repo.unidades.listar(d._id)).map((u) => u.unidadId), ['m1']);
  });

  // ---- apartados ----

  await prueba('apartados.leer devuelve null si no existe', async (repo) => {
    const d = await documento(repo);
    assert.equal(await repo.apartados.leer(d._id, 'introduccion'), null);
    assert.equal(await repo.apartados.leer(d._id, 'modulos/x', 'm1'), null);
  });

  await prueba('apartados.borrar destruye las filas de las secciones pedidas, de todas las unidades, y solo de ese documento', async (repo) => {
    const d = await documento(repo);
    const otro = await documento(repo);
    for (const u of ['m1', 'm2']) {
      await repo.apartados.escribir(d._id, 'modulos/a', u, { valores: { texto: u } });
      await repo.apartados.escribir(d._id, 'modulos/a/b', u, { valores: { texto: u } });
    }
    await repo.apartados.escribir(d._id, 'otro', null, { valores: { texto: 'se queda' } });
    await repo.apartados.escribir(otro._id, 'modulos/a', 'm1', { valores: { texto: 'de otro documento' } });

    assert.equal(await repo.apartados.borrar(d._id, ['modulos/a', 'modulos/a/b', 'no-existe']), 4);
    assert.deepEqual((await repo.apartados.listar(d._id)).map((a) => a.seccion), ['otro']);
    assert.equal((await repo.apartados.listar(otro._id)).length, 1, 'ha borrado filas de otro documento');
    assert.equal(await repo.apartados.borrar(d._id, []), 0);
    assert.ok((await error(repo.apartados.borrar(d._id, 'modulos/a'))) instanceof TypeError);
  });

  await prueba('apartados.quitarClave quita la clave de todas las filas de la sección, avanza su token y no toca lo demás', async (repo) => {
    const d = await documento(repo);
    const m1 = await repo.apartados.escribir(d._id, 'modulos/a', 'm1', { valores: { texto: 'uno', tabla: { filas: [] } } });
    await repo.apartados.escribir(d._id, 'modulos/a', 'm2', { valores: { texto: 'dos' } });
    await repo.apartados.escribir(d._id, 'modulos/a', 'm3', { valores: { tabla: { filas: [] } } });
    await repo.apartados.escribir(d._id, 'modulos/b', 'm1', { valores: { texto: 'otro apartado' } });

    assert.equal(await repo.apartados.quitarClave(d._id, 'modulos/a', 'texto'), 2);
    assert.deepEqual((await repo.apartados.leer(d._id, 'modulos/a', 'm1')).valores, { tabla: { filas: [] } });
    assert.deepEqual((await repo.apartados.leer(d._id, 'modulos/a', 'm2')).valores, {});
    assert.deepEqual((await repo.apartados.leer(d._id, 'modulos/b', 'm1')).valores, { texto: 'otro apartado' });
    assert.ok((await repo.apartados.leer(d._id, 'modulos/a', 'm1')).updatedAt.getTime() > m1.updatedAt.getTime());
    // Quien leyó antes de quitarla no puede volver a escribirla.
    assert.ok((await error(repo.apartados.escribir(d._id, 'modulos/a', 'm1', { valores: { texto: 'viejo' } }, { esperaUpdatedAt: m1.updatedAt }))) instanceof ErrorConflicto);
    assert.equal(await repo.apartados.quitarClave(d._id, 'modulos/a', 'texto'), 0);
  });

  await prueba('apartados.escribir crea el apartado y luego solo cambia lo que se le pasa', async (repo) => {
    const d = await documento(repo);
    const a = await repo.apartados.escribir(d._id, 'introduccion', null, { valores: { texto: 'uno' }, origen: 'nuevo' });
    assert.equal(typeof a._id, 'string');
    assert.ok(a.updatedAt instanceof Date);
    const b = await repo.apartados.escribir(d._id, 'introduccion', null, { valores: { texto: 'dos' } });
    assert.equal(b._id, a._id);
    assert.equal(b.origen, 'nuevo');
    assert.deepEqual(b.valores, { texto: 'dos' });
    assert.ok(b.updatedAt.getTime() > a.updatedAt.getTime());
    assert.deepEqual((await repo.apartados.leer(d._id, 'introduccion')).valores, { texto: 'dos' });
  });

  await prueba('un apartado común y uno de módulo con la misma sección son distintos', async (repo) => {
    const d = await documento(repo);
    await repo.apartados.escribir(d._id, 'modulos/recuperacion', null, { valores: { a: 1 } });
    await repo.apartados.escribir(d._id, 'modulos/recuperacion', 'm1', { valores: { a: 2 } });
    assert.deepEqual((await repo.apartados.leer(d._id, 'modulos/recuperacion')).valores, { a: 1 });
    assert.deepEqual((await repo.apartados.leer(d._id, 'modulos/recuperacion', 'm1')).valores, { a: 2 });
    assert.equal((await repo.apartados.listar(d._id)).length, 2);
  });

  await prueba('apartados.listar: unidadId null trae solo los comunes; ausente o undefined trae todos', async (repo) => {
    const d = await documento(repo);
    await repo.apartados.escribir(d._id, 'introduccion', null, { valores: {} });
    await repo.apartados.escribir(d._id, 'modulos/x', null, { valores: {} });
    await repo.apartados.escribir(d._id, 'modulos/x', 'm1', { valores: {} });
    await repo.apartados.escribir(d._id, 'modulos/x', 'm2', { valores: {} });
    assert.equal((await repo.apartados.listar(d._id)).length, 4);
    assert.equal((await repo.apartados.listar(d._id, { unidadId: undefined })).length, 4);
    const comunes = await repo.apartados.listar(d._id, { unidadId: null });
    assert.deepEqual(comunes.map((a) => a.seccion).sort(), ['introduccion', 'modulos/x']);
    assert.equal((await repo.apartados.listar(d._id, { unidadId: 'm1' })).length, 1);
    assert.equal((await repo.apartados.listar(d._id, { seccion: 'modulos/x' })).length, 3);
    assert.equal((await repo.apartados.listar(d._id, { seccion: 'modulos/x', unidadId: null })).length, 1);
  });

  await prueba('apartados.crearMuchos escribe varios de golpe y rechaza los repetidos sin escribir nada', async (repo) => {
    const d = await documento(repo);
    const lista = [
      { seccion: 'introduccion', unidadId: null, valores: { texto: 'a' } },
      { seccion: 'modulos/x', unidadId: 'm1', valores: { texto: 'b' } },
      { seccion: 'modulos/x', unidadId: 'm2', valores: { texto: 'c' } },
    ];
    const creados = await repo.apartados.crearMuchos(d._id, lista);
    assert.equal(creados.length, 3);
    assert.equal((await repo.apartados.listar(d._id)).length, 3);
    assert.ok((await error(repo.apartados.crearMuchos(d._id, [lista[0]]))) instanceof ErrorDuplicado);
    assert.equal((await repo.apartados.listar(d._id)).length, 3);
  });

  await prueba('esperaUpdatedAt que coincide escribe y devuelve un updatedAt nuevo (también como cadena ISO)', async (repo) => {
    const d = await documento(repo);
    const a = await repo.apartados.escribir(d._id, 'introduccion', null, { valores: { t: '1' } });
    const b = await repo.apartados.escribir(d._id, 'introduccion', null, { valores: { t: '2' } }, {
      esperaUpdatedAt: a.updatedAt.toISOString(),
    });
    assert.deepEqual(b.valores, { t: '2' });
    assert.ok(b.updatedAt.getTime() > a.updatedAt.getTime());
  });

  await prueba('esperaUpdatedAt que no coincide: conflicto, y no se escribe nada', async (repo) => {
    const d = await documento(repo);
    const a = await repo.apartados.escribir(d._id, 'introduccion', null, { valores: { t: 'A' } });
    const b = await repo.apartados.escribir(d._id, 'introduccion', null, { valores: { t: 'B' } }, { esperaUpdatedAt: a.updatedAt });
    const e = await error(repo.apartados.escribir(d._id, 'introduccion', null, { valores: { t: 'C' } }, { esperaUpdatedAt: a.updatedAt }));
    assert.ok(e instanceof ErrorConflicto);
    assert.equal(e.codigo, 'conflicto');
    assert.equal(e.esperado.getTime(), a.updatedAt.getTime());
    assert.equal(e.actual.getTime(), b.updatedAt.getTime());
    const leido = await repo.apartados.leer(d._id, 'introduccion');
    assert.deepEqual(leido.valores, { t: 'B' });
    assert.equal(leido.updatedAt.getTime(), b.updatedAt.getTime());
  });

  await prueba('esperaUpdatedAt con valor en un apartado que no existe: conflicto, y no lo crea', async (repo) => {
    const d = await documento(repo);
    const e = await error(repo.apartados.escribir(d._id, 'introduccion', null, { valores: { t: 'x' } }, { esperaUpdatedAt: new Date() }));
    assert.ok(e instanceof ErrorConflicto);
    assert.equal(e.actual, null);
    assert.equal(await repo.apartados.leer(d._id, 'introduccion'), null);
  });

  await prueba('esperaUpdatedAt null: crea si no existe y da conflicto si ya existe', async (repo) => {
    const d = await documento(repo);
    const a = await repo.apartados.escribir(d._id, 'introduccion', null, { valores: { t: 'x' } }, { esperaUpdatedAt: null });
    const e = await error(repo.apartados.escribir(d._id, 'introduccion', null, { valores: { t: 'y' } }, { esperaUpdatedAt: null }));
    assert.ok(e instanceof ErrorConflicto);
    assert.equal(e.actual.getTime(), a.updatedAt.getTime());
    assert.deepEqual((await repo.apartados.leer(d._id, 'introduccion')).valores, { t: 'x' });
  });

  await prueba('dos escrituras con la misma versión de partida: gana una y la otra recibe conflicto', async (repo) => {
    const d = await documento(repo);
    const base = await repo.apartados.escribir(d._id, 'introduccion', null, { valores: { t: 'base' } });
    const resultados = await Promise.allSettled([
      repo.apartados.escribir(d._id, 'introduccion', null, { valores: { t: 'pestaña 1' } }, { esperaUpdatedAt: base.updatedAt }),
      repo.apartados.escribir(d._id, 'introduccion', null, { valores: { t: 'pestaña 2' } }, { esperaUpdatedAt: base.updatedAt }),
    ]);
    const ganadoras = resultados.filter((r) => r.status === 'fulfilled');
    const perdedoras = resultados.filter((r) => r.status === 'rejected');
    assert.equal(ganadoras.length, 1);
    assert.equal(perdedoras.length, 1);
    assert.ok(perdedoras[0].reason instanceof ErrorConflicto);
    assert.deepEqual((await repo.apartados.leer(d._id, 'introduccion')).valores, ganadoras[0].value.valores);
  });

  await prueba('lo que devuelven escribir y leer no comparte memoria con lo guardado', async (repo) => {
    const d = await documento(repo);
    const entrada = { texto: 'hola', lista: ['uno'] };
    const escrito = await repo.apartados.escribir(d._id, 'introduccion', null, { valores: entrada });
    entrada.texto = 'cambiado desde fuera';
    escrito.valores.lista.push('dos');
    const primera = await repo.apartados.leer(d._id, 'introduccion');
    assert.deepEqual(primera.valores, { texto: 'hola', lista: ['uno'] });
    primera.valores.texto = 'modificado al leer';
    primera.valores.lista.push('tres');
    const segunda = await repo.apartados.leer(d._id, 'introduccion');
    assert.deepEqual(segunda.valores, { texto: 'hola', lista: ['uno'] });
    assert.equal(segunda.updatedAt.getTime(), escrito.updatedAt.getTime());
  });

  // ---- documentos.actualizar con esperaUpdatedAt: los mismos casos que apartados.escribir ----

  await prueba('documentos.actualizar sin esperaUpdatedAt escribe como antes, y el token avanza aunque sea el mismo milisegundo', async (repo) => {
    const d = await documento(repo);
    let previo = d;
    for (let i = 0; i < 5; i += 1) {
      const u = await repo.documentos.actualizar(d._id, { estado: i % 2 ? 'revision' : 'borrador' });
      assert.equal(u.estado, i % 2 ? 'revision' : 'borrador');
      assert.ok(u.updatedAt.getTime() > previo.updatedAt.getTime(), `el token no avanza en la vuelta ${i}`);
      previo = u;
    }
  });

  await prueba('documentos.actualizar con esperaUpdatedAt que coincide escribe y devuelve un updatedAt nuevo (también como cadena ISO)', async (repo) => {
    const d = await documento(repo);
    const a = await repo.documentos.actualizar(d._id, { estado: 'revision' }, { esperaUpdatedAt: d.updatedAt });
    const b = await repo.documentos.actualizar(d._id, { estado: 'aprobado' }, { esperaUpdatedAt: a.updatedAt.toISOString() });
    assert.equal(b.estado, 'aprobado');
    assert.ok(b.updatedAt.getTime() > a.updatedAt.getTime());
    assert.equal((await repo.documentos.obtener(d._id)).estado, 'aprobado');
  });

  await prueba('documentos.actualizar con esperaUpdatedAt que no coincide: conflicto, y no se escribe nada', async (repo) => {
    const d = await documento(repo);
    const a = await repo.documentos.actualizar(d._id, { estado: 'revision' });
    const b = await repo.documentos.actualizar(d._id, { estado: 'aprobado' }, { esperaUpdatedAt: a.updatedAt });
    const e = await error(repo.documentos.actualizar(d._id, { estado: 'borrador', plantillaVersion: 9 }, { esperaUpdatedAt: a.updatedAt }));
    assert.ok(e instanceof ErrorConflicto);
    assert.equal(e.codigo, 'conflicto');
    assert.equal(e.esperado.getTime(), a.updatedAt.getTime());
    assert.equal(e.actual.getTime(), b.updatedAt.getTime());
    const leido = await repo.documentos.obtener(d._id);
    assert.equal(leido.estado, 'aprobado');
    assert.equal(leido.plantillaVersion, 1);
    assert.equal(leido.updatedAt.getTime(), b.updatedAt.getTime());
  });

  await prueba('documentos.actualizar con esperaUpdatedAt en un documento que no existe: conflicto, y no hace nada', async (repo) => {
    const e = await error(repo.documentos.actualizar(randomUUID(), { estado: 'aprobado' }, { esperaUpdatedAt: new Date() }));
    assert.ok(e instanceof ErrorConflicto);
    assert.equal(e.actual, null);
  });

  await prueba('documentos.actualizar con esperaUpdatedAt null: si el documento existe es conflicto; si no existe, devuelve null', async (repo) => {
    const d = await documento(repo);
    const e = await error(repo.documentos.actualizar(d._id, { estado: 'aprobado' }, { esperaUpdatedAt: null }));
    assert.ok(e instanceof ErrorConflicto);
    assert.equal(e.actual.getTime(), d.updatedAt.getTime());
    assert.equal((await repo.documentos.obtener(d._id)).estado, 'borrador');
    assert.equal(await repo.documentos.actualizar(randomUUID(), { estado: 'aprobado' }, { esperaUpdatedAt: null }), null);
  });

  await prueba('documentos.actualizar: dos escrituras con la misma versión de partida: gana una y la otra recibe conflicto', async (repo) => {
    const d = await documento(repo);
    const resultados = await Promise.allSettled([
      repo.documentos.actualizar(d._id, { estado: 'revision' }, { esperaUpdatedAt: d.updatedAt }),
      repo.documentos.actualizar(d._id, { estado: 'aprobado' }, { esperaUpdatedAt: d.updatedAt }),
    ]);
    const ganadoras = resultados.filter((r) => r.status === 'fulfilled');
    const perdedoras = resultados.filter((r) => r.status === 'rejected');
    assert.equal(ganadoras.length, 1);
    assert.equal(perdedoras.length, 1);
    assert.ok(perdedoras[0].reason instanceof ErrorConflicto);
    assert.equal((await repo.documentos.obtener(d._id)).estado, ganadoras[0].value.estado);
  });

  await prueba('documentos.actualizar con esperaUpdatedAt que no es una fecha: TypeError, y no se escribe nada', async (repo) => {
    const d = await documento(repo);
    const e = await error(repo.documentos.actualizar(d._id, { estado: 'aprobado' }, { esperaUpdatedAt: 'no es una fecha' }));
    assert.ok(e instanceof TypeError);
    assert.equal((await repo.documentos.obtener(d._id)).estado, 'borrador');
  });

  await prueba('lo que devuelve documentos.actualizar no comparte memoria con lo guardado', async (repo) => {
    const d = await documento(repo);
    const plantilla = { secciones: [{ id: 'a', titulo: 'A' }] };
    const escrito = await repo.documentos.actualizar(d._id, { plantilla }, { esperaUpdatedAt: d.updatedAt });
    plantilla.secciones.push({ id: 'b' });
    escrito.plantilla.secciones.push({ id: 'c' });
    const leido = await repo.documentos.obtener(d._id);
    assert.deepEqual(leido.plantilla, { secciones: [{ id: 'a', titulo: 'A' }] });
  });

  // ---- compartidos ----

  await prueba('compartidos: crearMuchos, listar, obtener y actualizar; un cid repetido se rechaza', async (repo) => {
    const d = await documento(repo);
    await repo.compartidos.crearMuchos(d._id, [
      { cid: 'c001', bloque: 'b1', seccion: 'introduccion', comun: true, responsable: 'jefe', modo: 'sugerido', version: 1 },
      { cid: 'c002', bloque: 'b2', seccion: 'modulos/x', comun: false, responsable: 'ana', modo: 'obligatorio', version: 3 },
    ]);
    assert.equal((await repo.compartidos.listar(d._id)).length, 2);
    assert.equal((await repo.compartidos.obtener(d._id, 'c001')).modo, 'sugerido');
    const u = await repo.compartidos.actualizar(d._id, 'c001', { modo: 'obligatorio', version: 2 });
    assert.equal(u.modo, 'obligatorio');
    assert.equal(u.version, 2);
    assert.equal(await repo.compartidos.obtener(d._id, 'zz'), null);
    const repetido = { cid: 'c001', bloque: 'b3', seccion: 'x', comun: false, responsable: 'x', modo: 'sugerido', version: 1 };
    assert.ok((await error(repo.compartidos.crearMuchos(d._id, [repetido]))) instanceof ErrorDuplicado);
  });

  // ---- comentarios ----

  await prueba('comentarios: crear pone la fecha, y listar filtra por apartado y ordena de más antiguo a más nuevo', async (repo) => {
    const d = await documento(repo);
    const c1 = await repo.comentarios.crear({ documentoId: d._id, seccion: 'introduccion', autor: 'ana', texto: 'uno' });
    await repo.comentarios.crear({ documentoId: d._id, seccion: 'modulos/x', unidadId: 'm1', autor: 'luis', texto: 'modulo' });
    await repo.comentarios.crear({ documentoId: d._id, seccion: 'introduccion', unidadId: null, autor: 'jefe', texto: 'dos' });
    assert.ok(c1.fecha instanceof Date);
    assert.deepEqual((await repo.comentarios.listar(d._id)).map((c) => c.texto), ['uno', 'modulo', 'dos']);
    assert.deepEqual(
      (await repo.comentarios.listar(d._id, { seccion: 'introduccion', unidadId: null })).map((c) => c.texto),
      ['uno', 'dos'],
    );
    assert.deepEqual((await repo.comentarios.listar(d._id, { unidadId: 'm1' })).map((c) => c.texto), ['modulo']);
  });

  // ---- usuarios ----

  await prueba('usuarios: crear, obtener, porEmail, listar con filtro y actualizar', async (repo) => {
    const departamento = marca();
    const email = `ana-${randomUUID()}@ejemplo.org`;
    const u = await repo.usuarios.crear({ nombre: 'Ana', email, rol: 'docente', departamento });
    assert.equal(typeof u._id, 'string');
    assert.equal((await repo.usuarios.obtener(u._id)).email, email);
    assert.equal((await repo.usuarios.porEmail(email))._id, u._id);
    assert.equal(await repo.usuarios.porEmail(`nadie-${randomUUID()}@ejemplo.org`), null);
    assert.deepEqual((await repo.usuarios.listar({ departamento, rol: 'docente' })).map((x) => x._id), [u._id]);
    assert.deepEqual(await repo.usuarios.listar({ departamento, rol: 'jefe_departamento' }), []);
    const cambiado = await repo.usuarios.actualizar(u._id, { rol: 'jefe_departamento' });
    assert.equal(cambiado.rol, 'jefe_departamento');
    assert.equal((await repo.usuarios.listar({ departamento, rol: 'jefe_departamento' })).length, 1);
  });

  await prueba('usuarios: un email repetido lanza ErrorDuplicado', async (repo) => {
    const email = `dup-${randomUUID()}@ejemplo.org`;
    await repo.usuarios.crear({ nombre: 'A', email, rol: 'docente', departamento: 'informatica' });
    const e = await error(repo.usuarios.crear({ nombre: 'B', email, rol: 'docente', departamento: 'informatica' }));
    assert.ok(e instanceof ErrorDuplicado);
  });

  await prueba('usuarios: `activo` se puede guardar y leer, y ausente quiere decir activa', async (repo) => {
    const u = await usuario(repo);
    // Las personas del E1 no tienen el campo: la ausencia tiene que ser indistinguible de activa, o
    // añadirlo dejaría fuera a todo el que ya estuviera en la base de datos.
    assert.equal(u.activo, undefined);
    assert.equal((await repo.usuarios.actualizar(u._id, { activo: false })).activo, false);
    assert.equal((await repo.usuarios.obtener(u._id)).activo, false);
    assert.equal((await repo.usuarios.actualizar(u._id, { activo: true })).activo, true);
  });

  // ---- invitaciones y sesiones (la identidad del E2) ----
  //
  // Lo que se guarda es el hash del testigo, nunca el testigo: estas pruebas trabajan siempre con
  // hashes, igual que la aplicación, porque no hay ninguna operación que acepte un testigo.

  await prueba('invitaciones: se crean pendientes, se buscan por hash y guardan lo que se les da', async (repo) => {
    const u = await usuario(repo);
    const hash = unHash();
    const expiraEn = new Date(Date.now() + 60_000);
    const i = await repo.invitaciones.crear({
      usuarioId: u._id, email: u.email, rol: u.rol, departamento: u.departamento,
      tokenHash: hash, expiraEn, creadaPor: u._id,
    });
    assert.equal(typeof i._id, 'string');
    assert.equal(i.estado, 'pendiente');
    assert.equal(i.usadaEn, null);
    assert.equal(i.anuladaEn, null);
    assert.ok(i.creado instanceof Date);
    assert.equal(new Date(i.expiraEn).getTime(), expiraEn.getTime());
    assert.equal((await repo.invitaciones.porHash(hash))._id, i._id);
    assert.equal(await repo.invitaciones.porHash(unHash()), null);
  });

  await prueba('invitaciones: `usar` es de un solo uso, y el segundo intento devuelve null', async (repo) => {
    const u = await usuario(repo);
    const i = await invitacion(repo, u);
    const usada = await repo.invitaciones.usar(i._id);
    assert.equal(usada.estado, 'usada');
    assert.ok(usada.usadaEn instanceof Date);
    // Lo que hace que el enlace sea de un solo uso: el segundo canje no abre nada. Tiene que
    // decidirlo el adaptador en una sola operación, porque dos peticiones con el mismo enlace
    // llegan a la vez más a menudo de lo que parece.
    assert.equal(await repo.invitaciones.usar(i._id), null);
    assert.equal(await repo.invitaciones.usar(`${randomUUID()}`), null);
  });

  await prueba('invitaciones: `anularPendientes` deja solo la última, y no toca las ya usadas', async (repo) => {
    const u = await usuario(repo);
    const vieja = await invitacion(repo, u);
    const usada = await invitacion(repo, u);
    await repo.invitaciones.usar(usada._id);

    assert.equal(await repo.invitaciones.anularPendientes(u._id), 1);
    assert.equal((await repo.invitaciones.porHash(vieja.tokenHash)).estado, 'anulada');
    // Una usada no se vuelve «anulada»: el registro tiene que seguir distinguiendo a quien entró de
    // quien nunca llegó a entrar.
    assert.equal((await repo.invitaciones.porHash(usada.tokenHash)).estado, 'usada');
    assert.equal(await repo.invitaciones.anularPendientes(u._id), 0);
  });

  await prueba('invitaciones: se listan por persona y por estado, en orden de creación', async (repo) => {
    const u = await usuario(repo);
    const primera = await invitacion(repo, u);
    await esperarMs(2);
    const segunda = await invitacion(repo, u);
    await repo.invitaciones.usar(primera._id);

    const suyas = await repo.invitaciones.listar({ usuarioId: u._id });
    assert.deepEqual(suyas.map((i) => i._id), [primera._id, segunda._id]);
    const pendientes = await repo.invitaciones.listar({ usuarioId: u._id, estado: 'pendiente' });
    assert.deepEqual(pendientes.map((i) => i._id), [segunda._id]);
  });

  await prueba('invitaciones: sin caducidad válida no se escribe nada', async (repo) => {
    const u = await usuario(repo);
    const base = { usuarioId: u._id, email: u.email, rol: u.rol, departamento: u.departamento, tokenHash: unHash() };
    // `new Date(null)` es el 1 de enero de 1970, o sea una invitación nacida caducada, y
    // `new Date(undefined)` es inválida pero Mongo la guardaría igual. Las dos tienen que parar.
    assert.ok((await error(repo.invitaciones.crear({ ...base, expiraEn: null }))) instanceof TypeError);
    assert.ok((await error(repo.invitaciones.crear({ ...base }))) instanceof TypeError);
    assert.ok((await error(repo.invitaciones.crear({ ...base, expiraEn: 'el martes' }))) instanceof TypeError);
  });

  await prueba('sesiones: se crean sin revocar, se buscan por hash y se revocan una vez', async (repo) => {
    const u = await usuario(repo);
    const hash = unHash();
    const s = await repo.sesiones.crear({ usuarioId: u._id, tokenHash: hash, expiraEn: new Date(Date.now() + 60_000) });
    assert.equal(s.revocadaEn, null);
    assert.equal((await repo.sesiones.porHash(hash))._id, s._id);

    const revocada = await repo.sesiones.revocar(s._id);
    assert.ok(revocada.revocadaEn instanceof Date);
    // Cerrar sesión revoca, no borra: la fila se queda, y revocar dos veces no cambia la fecha.
    assert.equal((await repo.sesiones.porHash(hash)).revocadaEn.getTime(), revocada.revocadaEn.getTime());
    assert.equal(await repo.sesiones.revocar(s._id), null);
  });

  await prueba('sesiones: `revocarDeUsuario` revoca todas las de una persona y ninguna de otra', async (repo) => {
    const u = await usuario(repo);
    const otra = await usuario(repo);
    const expiraEn = new Date(Date.now() + 60_000);
    const suyas = [unHash(), unHash()];
    for (const tokenHash of suyas) await repo.sesiones.crear({ usuarioId: u._id, tokenHash, expiraEn });
    const ajena = unHash();
    await repo.sesiones.crear({ usuarioId: otra._id, tokenHash: ajena, expiraEn });

    assert.equal(await repo.sesiones.revocarDeUsuario(u._id), 2);
    for (const h of suyas) assert.ok((await repo.sesiones.porHash(h)).revocadaEn instanceof Date);
    assert.equal((await repo.sesiones.porHash(ajena)).revocadaEn, null);
    assert.equal(await repo.sesiones.revocarDeUsuario(u._id), 0);
    assert.equal((await repo.sesiones.listar({ usuarioId: u._id })).length, 2);
  });

  await prueba('identidad: el mismo hash dos veces lanza ErrorDuplicado en las dos colecciones', async (repo) => {
    const u = await usuario(repo);
    const expiraEn = new Date(Date.now() + 60_000);
    const hash = unHash();
    await repo.sesiones.crear({ usuarioId: u._id, tokenHash: hash, expiraEn });
    // Imposible en la práctica con 32 bytes de randomBytes, pero si pasara, dos filas con el mismo
    // hash harían que la búsqueda devolviera una cualquiera de las dos.
    assert.ok((await error(repo.sesiones.crear({ usuarioId: u._id, tokenHash: hash, expiraEn }))) instanceof ErrorDuplicado);

    const hashI = unHash();
    const base = { usuarioId: u._id, email: u.email, rol: u.rol, departamento: u.departamento, expiraEn };
    await repo.invitaciones.crear({ ...base, tokenHash: hashI });
    assert.ok((await error(repo.invitaciones.crear({ ...base, tokenHash: hashI }))) instanceof ErrorDuplicado);
  });
}

(async () => {
  await bateria('memoria', () => memoria.crear());

  if (process.env.MONGODB_URI) {
    // MONGODB_DB, igual que la aplicación y que el flujo de integración continua: con dos
    // nombres distintos, el comando que uno documenta apunta a una base y las pruebas a otra.
    const nombreBd = process.env.MONGODB_DB || 'pccf-ha-pruebas';
    await bateria('mongo', () => mongo.crear({ uri: process.env.MONGODB_URI, nombreBd }));
  } else {
    console.log('omitida la batería contra MongoDB: no hay MONGODB_URI en el entorno, así que no hay base de datos que probar');
  }

  console.log(fallos ? `\n${fallos} prueba(s) fallida(s)` : '\nTodas las pruebas correctas');
  process.exit(fallos ? 1 : 0);
})();
