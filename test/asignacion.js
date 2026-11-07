// El reparto de unidades al profesorado, con las rutas llamadas directamente.
//
//   node test/asignacion.js
//
// Sin levantar Next, sin red y sin base de datos: igual que test/api.js (docs/api.md, primera regla
// de forma). Se monta un documento sintético pequeño con las formas que importan: tres módulos, una
// persona de cada rol del departamento, una persona de otro departamento, una desactivada y una
// jefatura de estudios.
//
// CADA PRUEBA TIENE SU PROPIO ALMACÉN
//
// Las de test/api.js comparten uno y solo leen. Estas escriben, y una escritura en una prueba no
// puede cambiarle los recuentos a la siguiente. obtenerRepositorio() lee `globalThis` en cada
// llamada, así que basta con poner otro almacén antes de cada prueba.
//
// LA DESACTIVACIÓN SE MONTA EN EL ADAPTADOR
//
// El repositorio no admite un campo `activo` en `CAMPOS.usuario` (repositorio/index.js), así que por
// su API no se puede desactivar a nadie. La regla de que una persona dada de baja no lleva unidades
// está en la ruta; para probarla, la persona se crea directamente en el adaptador de memoria, que es
// lo que haría falta de todas formas el día que exista el campo.

'use strict';

const assert = require('assert/strict');

const { crearRepositorio } = require('../repositorio');
const memoria = require('../repositorio/memoria');

const CLAVE_GLOBAL = '__pccf_repositorio__';

// ---------------------------------------------------------------- el arnés
// El mismo que test/api.js: `prueba(nombre, fn)` con assert, sin frameworks.
let fallos = 0;
const pendientes = [];
const prueba = (nombre, fn) => pendientes.push({ nombre, fn });

// Un almacén nuevo en memoria, puesto donde lo busca app/_lib/repositorio.js. Se hace antes de pedir
// nada a las rutas, y `enMemoria` evita que la semilla siembre personas de muestra encima.
function nuevoAlmacen() {
  const adaptador = memoria.crear();
  const repo = crearRepositorio({ adaptador });
  repo.enMemoria = true;
  globalThis[CLAVE_GLOBAL] = repo;
  return { repo, adaptador };
}

const { COOKIE_SESION, abrirSesion } = require('../app/_lib/sesion');
const Unidades = require('../app/_lib/rutas/unidades');
const Apartado = require('../app/_lib/rutas/apartado');

// ---------------------------------------------------------------- ayudas

// Una petición como la que recibe la ruta dentro de Next. La persona viaja en la cookie de SESIÓN,
// que es la que lee app/_lib/usuario.js desde el E2: antes bastaba con poner el id de quien decías
// ser, lo que quiere decir que cualquiera podía ser cualquiera. `escenario()` abre una sesión de
// verdad por persona y aquí solo se busca su testigo. Sin persona, no se manda cookie.
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

// Comprueba que una respuesta es el error que dice docs/api.md: el estado, el código y un mensaje.
async function esError(respuesta, estado, codigo) {
  assert.equal(respuesta.status, estado, `se esperaba un ${estado} y ha sido un ${respuesta.status}`);
  const cuerpo = await respuesta.json();
  assert.equal(cuerpo.error, codigo);
  assert.equal(typeof cuerpo.mensaje, 'string');
  assert.ok(cuerpo.mensaje.length > 0, 'el error no lleva mensaje');
  return cuerpo;
}

const reparto = (persona, id) => Unidades.GET(pet(`/api/documentos/${id}/unidades`, persona), { id });

const repartir = (persona, id, unidad, docentes) => Unidades.PUT(
  pet(`/api/documentos/${id}/unidades/${encodeURIComponent(unidad)}/docentes`, persona, {
    metodo: 'PUT',
    cuerpo: { docentes },
  }),
  { id, unidad },
);

// El cuerpo sin interpretar, para probar que una petición mal formada no escribe nada.
const repartirCrudo = (persona, id, unidad, texto) => Unidades.PUT(
  pet(`/api/documentos/${id}/unidades/${encodeURIComponent(unidad)}/docentes`, persona, {
    metodo: 'PUT',
    cuerpo: texto,
  }),
  { id, unidad },
);

const apartadoDe = (persona, id, consulta) => Apartado.GET(
  pet(`/api/documentos/${id}/apartado?${consulta}`, persona),
  { id },
);

// Lo que está guardado de verdad en el repositorio, sin pasar por la ruta.
const docentesGuardados = async (repo, documentoId, unidadId) => {
  const u = await repo.unidades.obtener(documentoId, unidadId);
  return u.docentes;
};

// ---------------------------------------------------------------- el documento sintético

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
      edita: 'docentes_del_modulo', presencia: 3, campos: [], hijos: [
        { id: 'modulos/metodologia', titulo: 'Metodología', nivel: 3, presencia: 3,
          campos: [campoTexto], hijos: [] },
      ] },
  ],
};

const UNIDADES = [
  { unidadId: 'daw-0485', titulo: 'Programación', num: '0485', grupo: 'Módulos del primer curso' },
  { unidadId: 'daw-0484', titulo: 'Base de datos', num: '0484', grupo: 'Módulos del primer curso' },
  { unidadId: 'daw-0614', titulo: 'Despliegue de aplicaciones web', num: '0614', grupo: 'Módulos del segundo curso' },
];

// Una persona por cada caso que las pruebas necesitan. Los correos son `.invalid`, que es un dominio
// reservado (como en scripts/sembrar.js).
async function escenario() {
  const { repo, adaptador } = nuevoAlmacen();
  const persona = async (nombre, email, rol, departamento, extra) => {
    const p = await repo.usuarios.crear({ nombre, email, rol, departamento, ...(extra || {}) });
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
  // Desde el E2 `activo` es un campo del repositorio, así que ya no hace falta el rodeo de
  // crearla directamente en el adaptador para esquivar la lista blanca.
  u.baja = await persona('Persona dada de baja', 'baja@ejemplo.invalid', 'docente', 'informatica', { activo: false });

  const doc = await repo.documentos.crear({
    tipo: 'programacion_didactica', ciclo: 'daw', curso: '2026-27', departamento: 'informatica',
    estado: 'borrador', plantilla: PLANTILLA, plantillaVersion: 1, origen: 'PD_sintetica.docx',
  });
  await repo.unidades.crearMuchos(doc._id, UNIDADES);

  const otro = await repo.documentos.crear({
    tipo: 'programacion_didactica', ciclo: 'daw', curso: '2026-27', departamento: 'matematicas',
    estado: 'borrador', plantilla: PLANTILLA, plantillaVersion: 1, origen: 'PD_mates.docx',
  });
  await repo.unidades.crearMuchos(otro._id, [
    { unidadId: 'mat-01', titulo: 'Matemáticas', num: '01', grupo: 'Módulos' },
  ]);

  return { repo, u, doc, otro };
}

// ================================================================ pruebas

prueba('el reparto lista cada unidad por su id estable, con el recuento de las que no tienen a nadie', async () => {
  const { u, doc } = await escenario();
  const r = await reparto(u.ana, doc._id);
  assert.equal(r.status, 200);
  const cuerpo = await r.json();
  assert.deepEqual(cuerpo.unidades.map((x) => x.unidadId), ['daw-0485', 'daw-0484', 'daw-0614']);
  assert.ok(cuerpo.unidades.every((x) => x.sinDocentes === true && x.docentes.length === 0));
  assert.deepEqual(cuerpo.resumen, { unidades: 3, sinDocentes: 3 });
});

prueba('las columnas de la matriz son los docentes y la jefatura del departamento, activos, y nada más', async () => {
  const { u, doc } = await escenario();
  const cuerpo = await (await reparto(u.ana, doc._id)).json();
  assert.deepEqual(
    cuerpo.personas.map((p) => p._id).sort(),
    [u.ana._id, u.luis._id, u.jefa._id].sort(),
    'soporte, la jefatura de estudios, la persona de otro departamento y la dada de baja no son columna',
  );
});

prueba('asignar una unidad se guarda y el reparto la muestra con sus docentes', async () => {
  const { repo, u, doc } = await escenario();
  const r = await repartir(u.jefa, doc._id, 'daw-0485', [u.ana._id, u.luis._id]);
  assert.equal(r.status, 200);
  const cuerpo = await r.json();
  assert.equal(cuerpo.unidadId, 'daw-0485');
  assert.deepEqual(cuerpo.docentes, [u.ana._id, u.luis._id]);
  assert.equal(cuerpo.sinDocentes, false);

  assert.deepEqual(await docentesGuardados(repo, doc._id, 'daw-0485'), [u.ana._id, u.luis._id]);
  const despues = await (await reparto(u.ana, doc._id)).json();
  assert.deepEqual(despues.resumen, { unidades: 3, sinDocentes: 2 });
});

prueba('cambiar el reparto manda la lista completa: quitar a alguien es volver a mandar la lista sin esa persona', async () => {
  const { repo, u, doc } = await escenario();
  await repartir(u.jefa, doc._id, 'daw-0485', [u.ana._id, u.luis._id]);
  const r = await repartir(u.jefa, doc._id, 'daw-0485', [u.luis._id]);
  assert.equal(r.status, 200);
  assert.deepEqual(await docentesGuardados(repo, doc._id, 'daw-0485'), [u.luis._id]);
});

prueba('una lista vacía deja la unidad sin nadie, y el recuento vuelve a subir', async () => {
  const { repo, u, doc } = await escenario();
  await repartir(u.jefa, doc._id, 'daw-0484', [u.ana._id]);
  const r = await repartir(u.jefa, doc._id, 'daw-0484', []);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).sinDocentes, true);
  assert.deepEqual(await docentesGuardados(repo, doc._id, 'daw-0484'), []);
  const cuerpo = await (await reparto(u.ana, doc._id)).json();
  assert.deepEqual(cuerpo.resumen, { unidades: 3, sinDocentes: 3 });
});

prueba('la jefatura de departamento también da clase y puede llevar un módulo', async () => {
  const { repo, u, doc } = await escenario();
  const r = await repartir(u.jefa, doc._id, 'daw-0614', [u.jefa._id]);
  assert.equal(r.status, 200);
  assert.deepEqual(await docentesGuardados(repo, doc._id, 'daw-0614'), [u.jefa._id]);
});

prueba('repetir la misma asignación no cambia nada', async () => {
  const { repo, u, doc } = await escenario();
  await repartir(u.jefa, doc._id, 'daw-0485', [u.ana._id]);
  const r = await repartir(u.jefa, doc._id, 'daw-0485', [u.ana._id]);
  assert.equal(r.status, 200);
  assert.deepEqual(await docentesGuardados(repo, doc._id, 'daw-0485'), [u.ana._id]);
});

prueba('un id inventado da 400, lo señala en «invalidos» y no guarda nada', async () => {
  const { repo, u, doc } = await escenario();
  const cuerpo = await esError(await repartir(u.jefa, doc._id, 'daw-0485', [u.ana._id, 'inventado-123']), 400, 'peticion');
  assert.deepEqual(cuerpo.invalidos, ['inventado-123']);
  assert.deepEqual(await docentesGuardados(repo, doc._id, 'daw-0485'), [], 'no debe guardarse ni la persona válida');
});

prueba('alguien de otro departamento da 400 y no guarda nada', async () => {
  const { repo, u, doc } = await escenario();
  const cuerpo = await esError(await repartir(u.jefa, doc._id, 'daw-0485', [u.pepe._id]), 400, 'peticion');
  assert.deepEqual(cuerpo.invalidos, [u.pepe._id]);
  assert.deepEqual(await docentesGuardados(repo, doc._id, 'daw-0485'), []);
});

prueba('alguien dado de baja da 400 y no guarda nada', async () => {
  const { repo, u, doc } = await escenario();
  const cuerpo = await esError(await repartir(u.jefa, doc._id, 'daw-0485', [u.baja._id]), 400, 'peticion');
  assert.deepEqual(cuerpo.invalidos, [u.baja._id]);
  assert.deepEqual(await docentesGuardados(repo, doc._id, 'daw-0485'), []);
});

prueba('la jefatura de estudios o soporte no dan clase: asignarlos da 400 aunque sean del departamento', async () => {
  const { repo, u, doc } = await escenario();
  const estudios = await esError(await repartir(u.jefa, doc._id, 'daw-0485', [u.estudios._id]), 400, 'peticion');
  assert.deepEqual(estudios.invalidos, [u.estudios._id]);
  const soporte = await esError(await repartir(u.jefa, doc._id, 'daw-0485', [u.admin._id]), 400, 'peticion');
  assert.deepEqual(soporte.invalidos, [u.admin._id]);
  assert.deepEqual(await docentesGuardados(repo, doc._id, 'daw-0485'), []);
});

prueba('una lista con la misma persona dos veces da 400 y no guarda nada', async () => {
  const { repo, u, doc } = await escenario();
  await esError(await repartir(u.jefa, doc._id, 'daw-0485', [u.ana._id, u.ana._id]), 400, 'peticion');
  assert.deepEqual(await docentesGuardados(repo, doc._id, 'daw-0485'), []);
});

prueba('un cuerpo mal formado da 400 y no guarda nada', async () => {
  const { repo, u, doc } = await escenario();
  await esError(await repartirCrudo(u.jefa, doc._id, 'daw-0485', 'esto no es json'), 400, 'peticion');
  await esError(await repartirCrudo(u.jefa, doc._id, 'daw-0485', JSON.stringify({ docentes: 'ana' })), 400, 'peticion');
  await esError(await repartirCrudo(u.jefa, doc._id, 'daw-0485', JSON.stringify({ docentes: [3] })), 400, 'peticion');
  await esError(await repartirCrudo(u.jefa, doc._id, 'daw-0485', JSON.stringify({})), 400, 'peticion');
  assert.deepEqual(await docentesGuardados(repo, doc._id, 'daw-0485'), []);
});

prueba('la unidad se identifica por su id estable: un índice o un título dan 404', async () => {
  const { repo, u, doc } = await escenario();
  await esError(await repartir(u.jefa, doc._id, '0', [u.ana._id]), 404, 'no_encontrado');
  await esError(await repartir(u.jefa, doc._id, 'Programación', [u.ana._id]), 404, 'no_encontrado');
  assert.deepEqual(await docentesGuardados(repo, doc._id, 'daw-0485'), []);
});

prueba('un docente no puede repartir: 403 y no guarda nada', async () => {
  const { repo, u, doc } = await escenario();
  await esError(await repartir(u.ana, doc._id, 'daw-0485', [u.luis._id]), 403, 'sin_permiso');
  await esError(await repartir(u.luis, doc._id, 'daw-0485', [u.luis._id]), 403, 'sin_permiso');
  assert.deepEqual(await docentesGuardados(repo, doc._id, 'daw-0485'), []);
});

prueba('la jefatura de estudios ve el reparto pero no lo cambia: 403 al escribir', async () => {
  const { repo, u, doc } = await escenario();
  const lectura = await reparto(u.estudios, doc._id);
  assert.equal(lectura.status, 200);
  assert.equal((await lectura.json()).puedeRepartir, false);
  await esError(await repartir(u.estudios, doc._id, 'daw-0485', [u.ana._id]), 403, 'sin_permiso');
  assert.deepEqual(await docentesGuardados(repo, doc._id, 'daw-0485'), []);
});

prueba('soporte reparte en cualquier departamento', async () => {
  const { repo, u, otro } = await escenario();
  const r = await repartir(u.admin, otro._id, 'mat-01', [u.pepe._id]);
  assert.equal(r.status, 200);
  assert.deepEqual(await docentesGuardados(repo, otro._id, 'mat-01'), [u.pepe._id]);
});

prueba('sin persona identificada: 401 al leer y al escribir', async () => {
  const { repo, doc } = await escenario();
  await esError(await reparto(null, doc._id), 401, 'sin_identificar');
  await esError(await repartir(null, doc._id, 'daw-0485', []), 401, 'sin_identificar');
  assert.deepEqual(await docentesGuardados(repo, doc._id, 'daw-0485'), []);
});

prueba('un documento de otro departamento da 404, al leer y al escribir', async () => {
  const { repo, u, doc } = await escenario();
  await esError(await reparto(u.pepe, doc._id), 404, 'no_encontrado');
  await esError(await repartir(u.pepe, doc._id, 'daw-0485', [u.pepe._id]), 404, 'no_encontrado');
  assert.deepEqual(await docentesGuardados(repo, doc._id, 'daw-0485'), []);
});

prueba('un documento de otro departamento da 404 también a la jefatura de este, que solo reparte en el suyo', async () => {
  const { u, otro } = await escenario();
  await esError(await reparto(u.ana, otro._id), 404, 'no_encontrado');
  await esError(await repartir(u.jefa, otro._id, 'mat-01', [u.ana._id]), 404, 'no_encontrado');
});

prueba('un documento que no existe da 404', async () => {
  const { u } = await escenario();
  await esError(await reparto(u.ana, 'no-existe'), 404, 'no_encontrado');
});

prueba('tras asignar, core/permisos.js deja editar los apartados de esa unidad a esa persona, y solo a ella', async () => {
  const { u, doc } = await escenario();
  const consulta = 'seccion=modulos/metodologia&unidad=daw-0485';

  const antes = await (await apartadoDe(u.ana, doc._id, consulta)).json();
  assert.equal(antes.puedeEditar, false, 'sin asignar, nadie de los docentes edita el módulo');

  await repartir(u.jefa, doc._id, 'daw-0485', [u.ana._id]);

  const ana = await (await apartadoDe(u.ana, doc._id, consulta)).json();
  assert.equal(ana.puedeEditar, true, 'la docente asignada tiene que poder editar su módulo');
  const luis = await (await apartadoDe(u.luis, doc._id, consulta)).json();
  assert.equal(luis.puedeEditar, false, 'otra docente del departamento no lleva este módulo');
  const otraUnidad = await (await apartadoDe(u.ana, doc._id, 'seccion=modulos/metodologia&unidad=daw-0484')).json();
  assert.equal(otraUnidad.puedeEditar, false, 'llevar un módulo no da permiso sobre los demás');
});

prueba('quitar a alguien le quita también la edición del módulo', async () => {
  const { u, doc } = await escenario();
  const consulta = 'seccion=modulos/metodologia&unidad=daw-0485';
  await repartir(u.jefa, doc._id, 'daw-0485', [u.ana._id]);
  await repartir(u.jefa, doc._id, 'daw-0485', []);
  const ana = await (await apartadoDe(u.ana, doc._id, consulta)).json();
  assert.equal(ana.puedeEditar, false);
});

prueba('la jefatura de departamento edita un módulo aunque nadie lo lleve; quien no lo lleva, no', async () => {
  const { u, doc } = await escenario();
  const consulta = 'seccion=modulos/metodologia&unidad=daw-0614';
  const jefa = await (await apartadoDe(u.jefa, doc._id, consulta)).json();
  assert.equal(jefa.puedeEditar, true);
  const luis = await (await apartadoDe(u.luis, doc._id, consulta)).json();
  assert.equal(luis.puedeEditar, false, 'una unidad sin docentes no la toca ningún docente');
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
    : `\n${total} pruebas del reparto de unidades correctas`);
  process.exit(fallos ? 1 : 0);
}

ejecutar();
