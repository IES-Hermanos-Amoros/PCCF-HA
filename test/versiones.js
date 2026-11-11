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
