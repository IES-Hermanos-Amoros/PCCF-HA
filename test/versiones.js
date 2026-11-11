// Versiones de un documento: reimportar no pisa, entra como alternativa; solo la activa se lista, se
// edita, se exporta y se arrastra. Activar, borrar, copia del .docx y rutas de versiones.
//
//   node test/versiones.js
//
// Sin red ni base de datos: las rutas se llaman con un `Request` normal sobre el adaptador de memoria
// (docs/api.md, primera regla de forma). El porqué del diseño, en docs/plan.md («Versiones del documento»).

'use strict';

const assert = require('assert/strict');

const { crearRepositorio } = require('../repositorio');
const memoria = require('../repositorio/memoria');
const { exportarDocx } = require('../motor/exportar-docx');
const { COOKIE_SESION, abrirSesion } = require('../app/_lib/sesion');
const Importar = require('../app/_lib/rutas/importar');
const Documentos = require('../app/_lib/rutas/documentos');
const Apartado = require('../app/_lib/rutas/apartado');
const Arrastre = require('../app/_lib/rutas/arrastre');
const Pdf = require('../app/_lib/rutas/pdf');
const Docx = require('../app/_lib/rutas/docx');
const Copia = require('../app/_lib/rutas/copia');
const RutaVersiones = require('../app/_lib/rutas/versiones');
const Permisos = require('../core/permisos');
const Versiones = require('../core/versiones');

const CLAVE_GLOBAL = '__pccf_repositorio__';
const DOCX_TIPO = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

let fallos = 0;
const pendientes = [];
const prueba = (nombre, fn) => pendientes.push({ nombre, fn });

const TESTIGOS = new Map();

async function escenario() {
  const repo = crearRepositorio({ adaptador: memoria.crear() });
  repo.enMemoria = true;
  globalThis[CLAVE_GLOBAL] = repo;
  const persona = async (nombre, email, rol, departamento) => {
    const p = await repo.usuarios.crear({ nombre, email, rol, departamento });
    TESTIGOS.set(p._id, (await abrirSesion(repo, p._id)).testigo);
    return p;
  };
  const u = {
    admin: await persona('Soporte', 'soporte@ejemplo.invalid', 'admin', 'informatica'),
    jefa: await persona('Jefatura', 'jefatura@ejemplo.invalid', 'jefe_departamento', 'informatica'),
    ana: await persona('Ana', 'ana@ejemplo.invalid', 'docente', 'informatica'),
    estudios: await persona('Estudios', 'estudios@ejemplo.invalid', 'jefe_estudios', 'direccion'),
    pepe: await persona('Pepe', 'pepe@ejemplo.invalid', 'jefe_departamento', 'matematicas'),
  };
  return { repo, u };
}

const cabeceras = (p) => (p ? { cookie: `${COOKIE_SESION}=${TESTIGOS.get(p._id)}` } : {});

function pet(camino, persona, { metodo = 'GET', cuerpo } = {}) {
  const h = cabeceras(persona);
  let crudo;
  if (cuerpo !== undefined) { crudo = JSON.stringify(cuerpo); h['content-type'] = 'application/json'; }
  return new Request(`http://pruebas.local${camino}`, { method: metodo, headers: h, body: crudo });
}

async function esError(res, estado, codigo) {
  assert.equal(res.status, estado, `se esperaba ${estado} y ha sido ${res.status}`);
  const cuerpo = await res.json();
  assert.equal(cuerpo.error, codigo);
  assert.equal(typeof cuerpo.mensaje, 'string');
  return cuerpo;
}

// Una memoria con un solo apartado, que no lleva ciclo ni módulos: lo más pequeño que se puede importar.
const PLANTILLA = {
  tipo: 'memoria', origen: 'memoria.docx', version: null, generada: '2026-01-01T00:00:00.000Z',
  secciones: [{ id: 'introduccion', titulo: 'Introducción', nivel: 1, edita: 'jefe_departamento', presencia: 1,
    campos: [{ id: 'texto', tipo: 'texto_largo', etiqueta: 'Texto' }], hijos: [] }],
};

async function docxDe(texto) {
  return exportarDocx({
    plantilla: PLANTILLA,
    datos: { departamento: 'informatica', documento: { introduccion: { texto: [{ type: 'p', text: texto }] } }, instancias: [], asignaciones: {}, compartidos: {} },
    titulo: 'Memoria del departamento · 2026-27',
  });
}

function subir(persona, buffer, campos = {}) {
  const f = new FormData();
  f.append('archivo', new File([buffer], 'memoria.docx', { type: DOCX_TIPO }));
  const valores = { tipo: 'memoria', curso: '2026-27', departamento: 'informatica', ...campos };
  for (const [k, v] of Object.entries(valores)) if (v !== null) f.append(k, v);
  return new Request('http://pruebas.local/api/documentos/importar', { method: 'POST', body: f, headers: cabeceras(persona) });
}

// Importa y devuelve el cuerpo de la respuesta, comprobando el 201.
async function importar(persona, texto, campos) {
  const res = await Importar.POST(subir(persona, await docxDe(texto), campos));
  assert.equal(res.status, 201, `importar: ${res.status} ${JSON.stringify(await res.clone().json())}`);
  return res.json();
}

const lista = async (persona, consulta = '') => (await (await Documentos.GET(pet(`/api/documentos${consulta}`, persona))).json()).documentos;

// ---------------------------------------------------------------- etapa 1: cimientos

prueba('core/versiones: ausente es activa, la versión antigua es la 1 y el grupo es la clave', () => {
  assert.equal(Versiones.esActiva({}), true);
  assert.equal(Versiones.esActiva({ activa: true }), true);
  assert.equal(Versiones.esActiva({ activa: false }), false);
  assert.equal(Versiones.numeroDeVersion({}), 1);
  const a = { tipo: 'memoria', curso: '2026-27', departamento: 'i', ciclo: null };
  assert.equal(Versiones.mismoGrupo(a, { ...a, ciclo: undefined }), true);
  assert.equal(Versiones.mismoGrupo(a, { ...a, curso: '2027-28' }), false);
  assert.equal(Versiones.siguienteVersion([{}, { version: 3 }]), 4);
});

prueba('el repositorio guarda activa, version y subidoPor en el documento', async () => {
  const { repo } = await escenario();
  const d = await repo.documentos.crear({ tipo: 'memoria', curso: '2026-27', departamento: 'informatica', activa: false, version: 2, subidoPor: 'x' });
  const leido = await repo.documentos.obtener(d._id);
  assert.deepEqual([leido.activa, leido.version, leido.subidoPor], [false, 2, 'x']);
  await repo.documentos.actualizar(d._id, { activa: true });
  assert.equal((await repo.documentos.obtener(d._id)).activa, true);
});

prueba('la primera importación nace activa y la respuesta dice que no es alternativa', async () => {
  const { repo, u } = await escenario();
  const r = await importar(u.jefa, 'Primera');
  assert.equal(r.alternativa, false);
  assert.equal(r.version, 1);
  const d = await repo.documentos.obtener(r.documento._id);
  assert.equal(d.activa, true);
  assert.equal(d.subidoPor, u.jefa._id);
});

prueba('reimportar la misma clave entra como alternativa y no toca lo que había', async () => {
  const { repo, u } = await escenario();
  const primero = await importar(u.jefa, 'Primera');
  const antes = JSON.stringify(await repo.documentos.obtener(primero.documento._id));
  const apartadosAntes = JSON.stringify(await repo.apartados.listar(primero.documento._id));

  const segundo = await importar(u.jefa, 'Segunda');
  assert.equal(segundo.alternativa, true);
  assert.equal(segundo.version, 2);
  assert.notEqual(segundo.documento._id, primero.documento._id);
  assert.equal((await repo.documentos.obtener(segundo.documento._id)).activa, false);
  assert.equal(JSON.stringify(await repo.documentos.obtener(primero.documento._id)), antes);
  assert.equal(JSON.stringify(await repo.apartados.listar(primero.documento._id)), apartadosAntes);

  const tercero = await importar(u.admin, 'Tercera');
  assert.equal(tercero.version, 3);
  assert.equal(tercero.alternativa, true);
});

prueba('otro curso, otro ciclo u otro departamento no son versiones: nacen activos', async () => {
  const { u } = await escenario();
  await importar(u.admin, 'Base');
  assert.equal((await importar(u.admin, 'Otro curso', { curso: '2027-28' })).alternativa, false);
  assert.equal((await importar(u.admin, 'Otro departamento', { departamento: 'matematicas' })).alternativa, false);
  assert.equal((await importar(u.admin, 'Otro tipo', { tipo: 'pccf', ciclo: 'smr' })).alternativa, false);
});

prueba('un documento anterior a las versiones (sin campos) cuenta como activo y la nueva subida es alternativa', async () => {
  const { repo, u } = await escenario();
  const antiguo = await repo.documentos.crear({
    tipo: 'memoria', ciclo: null, curso: '2026-27', departamento: 'informatica', estado: 'borrador', plantilla: PLANTILLA,
  });
  assert.equal(antiguo.activa, undefined);
  assert.deepEqual((await lista(u.jefa)).map((d) => d._id), [antiguo._id]);
  const nuevo = await importar(u.jefa, 'Nueva');
  assert.equal(nuevo.alternativa, true);
  assert.equal(nuevo.version, 2);
  assert.deepEqual((await lista(u.jefa)).map((d) => d._id), [antiguo._id]);
});

prueba('la lista de documentos solo trae la versión activa', async () => {
  const { u } = await escenario();
  const primero = await importar(u.jefa, 'Primera');
  await importar(u.jefa, 'Segunda');
  assert.deepEqual((await lista(u.jefa)).map((d) => d._id), [primero.documento._id]);
  assert.deepEqual((await lista(u.estudios)).map((d) => d._id), [primero.documento._id]);
});

prueba('una alternativa se puede leer pero no se edita, y no se exporta', async () => {
  const { repo, u } = await escenario();
  await importar(u.jefa, 'Primera');
  const alt = (await importar(u.jefa, 'Segunda')).documento._id;
  const consulta = 'seccion=introduccion';

  const lectura = await Apartado.GET(pet(`/api/documentos/${alt}/apartado?${consulta}`, u.jefa), { id: alt });
  assert.equal(lectura.status, 200);
  const cuerpo = await lectura.json();
  assert.equal(cuerpo.puedeEditar, false);

  const antes = JSON.stringify(await repo.apartados.listar(alt));
  const escritura = await Apartado.PATCH(
    pet(`/api/documentos/${alt}/apartado?${consulta}`, u.jefa, { metodo: 'PATCH', cuerpo: { valores: { texto: [] }, esperaUpdatedAt: cuerpo.updatedAt } }),
    { id: alt },
  );
  await esError(escritura, 409, 'version_alternativa');
  assert.equal(JSON.stringify(await repo.apartados.listar(alt)), antes);

  await esError(await Pdf.GET(pet(`/api/documentos/${alt}/pdf`, u.jefa), { id: alt }), 409, 'version_alternativa');
  await esError(await Docx.GET(pet(`/api/documentos/${alt}/docx`, u.jefa), { id: alt }), 409, 'version_alternativa');
});

prueba('no se arrastra una alternativa al curso siguiente, y la activa sí', async () => {
  const { u } = await escenario();
  const activa = (await importar(u.jefa, 'Primera')).documento._id;
  const alt = (await importar(u.jefa, 'Segunda')).documento._id;
  await esError(await Arrastre.CREAR(pet(`/api/documentos/${alt}/siguiente-curso`, u.jefa, { metodo: 'POST', cuerpo: {} }), { id: alt }), 409, 'version_alternativa');
  const ok = await Arrastre.CREAR(pet(`/api/documentos/${activa}/siguiente-curso`, u.jefa, { metodo: 'POST', cuerpo: {} }), { id: activa });
  assert.equal(ok.status, 201);
});

// ---------------------------------------------------------------- etapa 2: la copia del .docx

prueba('importar guarda el .docx original como copia de seguridad, de cada versión', async () => {
  const { repo, u } = await escenario();
  const a = await docxDe('Primera');
  const b = await docxDe('Segunda');
  const r1 = await (await Importar.POST(subir(u.jefa, a))).json();
  const r2 = await (await Importar.POST(subir(u.jefa, b))).json();
  assert.equal(r1.resumen.copia, true);
  assert.equal(r2.alternativa, true);
  const c1 = await repo.copias.obtener(r1.documento._id);
  const c2 = await repo.copias.obtener(r2.documento._id);
  assert.ok(c1.contenido.equals(a));
  assert.ok(c2.contenido.equals(b));
  assert.equal(c1.nombre, 'memoria.docx');
  assert.equal(c1.subidoPor, u.jefa._id);
});

prueba('GET /copia devuelve el Word tal como se subió, también de una alternativa, y respeta el departamento', async () => {
  const { u } = await escenario();
  const a = await docxDe('Primera');
  const b = await docxDe('Segunda');
  const r1 = (await (await Importar.POST(subir(u.jefa, a))).json()).documento._id;
  const r2 = (await (await Importar.POST(subir(u.jefa, b))).json()).documento._id;
  for (const [id, original] of [[r1, a], [r2, b]]) {
    const res = await Copia.GET(pet(`/api/documentos/${id}/copia`, u.ana), { id });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /wordprocessingml/);
    assert.ok(Buffer.from(await res.arrayBuffer()).equals(original));
  }
  await esError(await Copia.GET(pet(`/api/documentos/${r1}/copia`, u.pepe), { id: r1 }), 404, 'no_encontrado');
  await esError(await Copia.GET(pet(`/api/documentos/${r1}/copia`, null), { id: r1 }), 401, 'sin_identificar');
});

prueba('un documento sin copia (anterior a las versiones) da 404 en /copia', async () => {
  const { repo, u } = await escenario();
  const d = await repo.documentos.crear({ tipo: 'memoria', ciclo: null, curso: '2026-27', departamento: 'informatica', plantilla: PLANTILLA });
  await esError(await Copia.GET(pet(`/api/documentos/${d._id}/copia`, u.jefa), { id: d._id }), 404, 'no_encontrado');
});

// ---------------------------------------------------------------- etapa 3: listar, activar y borrar

const versiones = (persona, id) => RutaVersiones.GET(pet(`/api/documentos/${id}/versiones`, persona), { id });
const activar = (persona, id) => RutaVersiones.ACTIVAR(pet(`/api/documentos/${id}/activar`, persona, { metodo: 'POST' }), { id });
const borrar = (persona, id, cuerpo) => RutaVersiones.BORRAR(pet(`/api/documentos/${id}`, persona, { metodo: 'DELETE', cuerpo }), { id });

// Tres versiones de la misma memoria: la 1 activa y la 2 y la 3 alternativas.
async function tresVersiones(u) {
  const v1 = (await importar(u.jefa, 'Primera')).documento._id;
  const v2 = (await importar(u.jefa, 'Segunda')).documento._id;
  const v3 = (await importar(u.admin, 'Tercera')).documento._id;
  return { v1, v2, v3 };
}

prueba('core/permisos: activar y borrar versiones, solo jefatura de su departamento y soporte', () => {
  const doc = { departamento: 'informatica' };
  const q = (rol, departamento) => ({ rol, departamento });
  for (const f of [Permisos.puedeActivarVersion, Permisos.puedeBorrarVersion]) {
    assert.equal(f(q('admin', 'otro'), doc), true);
    assert.equal(f(q('jefe_departamento', 'informatica'), doc), true);
    assert.equal(f(q('jefe_departamento', 'matematicas'), doc), false);
    assert.equal(f(q('docente', 'informatica'), doc), false);
    assert.equal(f(q('jefe_estudios', 'direccion'), doc), false);
    assert.equal(f(null, doc), false);
  }
});

prueba('GET /versiones lista las del grupo desde cualquiera de ellas: número, activa, quién subió y si hay copia', async () => {
  const { u } = await escenario();
  const { v1, v2, v3 } = await tresVersiones(u);
  for (const desde of [v1, v3]) {
    const res = await versiones(u.ana, desde);
    assert.equal(res.status, 200);
    const cuerpo = await res.json();
    assert.deepEqual(cuerpo.versiones.map((v) => [v._id, v.version, v.activa]), [[v1, 1, true], [v2, 2, false], [v3, 3, false]]);
    assert.equal(cuerpo.versiones[0].subidoPor.nombre, 'Jefatura');
    assert.equal(cuerpo.versiones[2].subidoPor.nombre, 'Soporte');
    assert.equal(cuerpo.versiones[0].subidoPor.email, undefined);
    assert.ok(cuerpo.versiones.every((v) => v.copia && v.copia.tamano > 0));
    // Un docente ve la lista pero no puede activar ni borrar ni subir.
    assert.ok(cuerpo.versiones.every((v) => !v.puedeActivar && !v.puedeBorrar));
    assert.equal(cuerpo.puedeSubir, false);
  }
  const jefa = await (await versiones(u.jefa, v1)).json();
  assert.deepEqual(jefa.versiones.map((v) => [v.puedeActivar, v.puedeBorrar]), [[false, false], [true, true], [true, true]]);
  assert.equal(jefa.puedeSubir, true);
  await esError(await versiones(u.pepe, v1), 404, 'no_encontrado');
  await esError(await versiones(null, v1), 401, 'sin_identificar');
});

prueba('activar: la elegida pasa a activa, la anterior queda como alternativa con sus ediciones y nada se borra', async () => {
  const { repo, u } = await escenario();
  const { v1, v2, v3 } = await tresVersiones(u);

  // La activa se edita antes de cambiar de versión.
  const lectura = await (await Apartado.GET(pet(`/api/documentos/${v1}/apartado?seccion=introduccion`, u.jefa), { id: v1 })).json();
  const edicion = await Apartado.PATCH(
    pet(`/api/documentos/${v1}/apartado?seccion=introduccion`, u.jefa, { metodo: 'PATCH', cuerpo: { valores: { texto: [{ type: 'p', text: 'Editada a mano' }] }, esperaUpdatedAt: lectura.updatedAt } }),
    { id: v1 },
  );
  assert.equal(edicion.status, 200);
  const editado = JSON.stringify((await repo.apartados.leer(v1, 'introduccion')).valores);

  const res = await activar(u.jefa, v2);
  assert.equal(res.status, 200);
  const cuerpo = await res.json();
  assert.equal(cuerpo.documento._id, v2);
  assert.deepEqual(cuerpo.anteriores, [v1]);

  assert.deepEqual((await lista(u.jefa)).map((d) => d._id), [v2]);
  const estados = (await (await versiones(u.jefa, v1)).json()).versiones.map((v) => v.activa);
  assert.deepEqual(estados, [false, true, false]);
  // La anterior conserva sus ediciones, solo en lectura; y ahora la nueva activa sí se edita.
  assert.equal(JSON.stringify((await repo.apartados.leer(v1, 'introduccion')).valores), editado);
  assert.ok(await repo.copias.info(v1));
  const lecturaNueva = await (await Apartado.GET(pet(`/api/documentos/${v2}/apartado?seccion=introduccion`, u.jefa), { id: v2 })).json();
  assert.equal(lecturaNueva.puedeEditar, true);
  const lecturaVieja = await (await Apartado.GET(pet(`/api/documentos/${v1}/apartado?seccion=introduccion`, u.jefa), { id: v1 })).json();
  assert.equal(lecturaVieja.puedeEditar, false);
  assert.equal((await Pdf.GET(pet(`/api/documentos/${v2}/pdf`, u.jefa), { id: v2 })).status, 200);
  // Y la siguiente subida sigue siendo la versión 4, alternativa.
  const cuarta = await importar(u.jefa, 'Cuarta');
  assert.deepEqual([cuarta.version, cuarta.alternativa], [4, true]);
  // Se puede volver atrás.
  assert.equal((await activar(u.admin, v3)).status, 200);
  assert.deepEqual((await lista(u.jefa)).map((d) => d._id), [v3]);
});

prueba('activar: 401, 403 para el docente y la jefatura de estudios, 404 de otro departamento, 409 si ya es la activa', async () => {
  const { repo, u } = await escenario();
  const { v1, v2 } = await tresVersiones(u);
  await esError(await activar(null, v2), 401, 'sin_identificar');
  await esError(await activar(u.ana, v2), 403, 'sin_permiso');
  await esError(await activar(u.estudios, v2), 403, 'sin_permiso');
  await esError(await activar(u.pepe, v2), 404, 'no_encontrado');
  await esError(await activar(u.jefa, v1), 409, 'version_activa');
  assert.equal((await repo.documentos.obtener(v1)).activa, true);
  assert.equal((await repo.documentos.obtener(v2)).activa, false);
  await esError(await activar(u.jefa, 'no-existe'), 404, 'no_encontrado');
});

prueba('borrar una alternativa: pide confirmación, nunca la activa, solo jefatura o soporte', async () => {
  const { repo, u } = await escenario();
  const { v1, v2, v3 } = await tresVersiones(u);

  await esError(await borrar(u.jefa, v2), 400, 'peticion');
  await esError(await borrar(u.jefa, v2, { confirmar: 'si' }), 400, 'peticion');
  assert.ok(await repo.documentos.obtener(v2));

  await esError(await borrar(u.ana, v2, { confirmar: true }), 403, 'sin_permiso');
  await esError(await borrar(u.pepe, v2, { confirmar: true }), 404, 'no_encontrado');
  await esError(await borrar(null, v2, { confirmar: true }), 401, 'sin_identificar');
  await esError(await borrar(u.jefa, v1, { confirmar: true }), 409, 'version_activa');
  assert.ok(await repo.documentos.obtener(v1));

  const res = await borrar(u.jefa, v2, { confirmar: true });
  assert.equal(res.status, 200);
  const cuerpo = await res.json();
  assert.equal(cuerpo.borrada, v2);
  assert.equal(cuerpo.contenido.copia, true);
  assert.equal(await repo.documentos.obtener(v2), null);
  assert.equal(await repo.copias.info(v2), null);
  assert.deepEqual(await repo.apartados.listar(v2), []);
  // Las demás no se tocan, y el número no se reutiliza.
  assert.ok(await repo.documentos.obtener(v1));
  assert.ok(await repo.documentos.obtener(v3));
  assert.equal((await importar(u.jefa, 'Otra')).version, 4);
  assert.equal((await borrar(u.admin, v3, { confirmar: true })).status, 200);
});

prueba('borradas las alternativas, el documento activo sigue solo', async () => {
  const { u } = await escenario();
  const { v1, v2, v3 } = await tresVersiones(u);
  assert.equal((await borrar(u.jefa, v2, { confirmar: true })).status, 200);
  assert.equal((await borrar(u.jefa, v3, { confirmar: true })).status, 200);
  const cuerpo = await (await versiones(u.jefa, v1)).json();
  assert.deepEqual(cuerpo.versiones.map((v) => [v._id, v.activa]), [[v1, true]]);
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
      console.log(`     ${String(e && e.stack).split('\n').slice(0, 4).join('\n     ')}`);
    }
  }
  console.log(fallos
    ? `\n${fallos} de ${pendientes.length} pruebas con fallos`
    : `\n${pendientes.length} pruebas de las versiones del documento correctas`);
  process.exit(fallos ? 1 : 0);
}

ejecutar();
