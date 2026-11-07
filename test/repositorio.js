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
}

(async () => {
  await bateria('memoria', () => memoria.crear());

  if (process.env.MONGODB_URI) {
    const nombreBd = process.env.MONGODB_BD || 'pccf-ha-pruebas';
    await bateria('mongo', () => mongo.crear({ uri: process.env.MONGODB_URI, nombreBd }));
  } else {
    console.log('omitida la batería contra MongoDB: no hay MONGODB_URI en el entorno, así que no hay base de datos que probar');
  }

  console.log(fallos ? `\n${fallos} prueba(s) fallida(s)` : '\nTodas las pruebas correctas');
  process.exit(fallos ? 1 : 0);
})();
