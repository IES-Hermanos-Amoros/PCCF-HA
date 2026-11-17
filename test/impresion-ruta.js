// LA RUTA QUE CONFIGURA CÓMO SE IMPRIME UN DOCUMENTO, y que la exportación le obedece.
//
//   node test/impresion-ruta.js
//
// Sin levantar Next, sin red y sin base de datos: las rutas se llaman directamente con un `Request`
// normal, igual que test/reglas.js y test/estructura-modulo-ruta.js (docs/api.md, primera regla de
// forma). El arnés es el de esas dos, copiado y no importado a propósito: una prueba que depende de
// otra se rompe cuando alguien toca la otra.
//
// QUÉ SE PRUEBA, Y POR QUÉ ESTAS COSAS
//
//   1. QUIÉN LA CAMBIA. La jefatura del departamento, la de estudios y el soporte. La de estudios es
//      la excepción que hay que vigilar, porque de ella está escrito que no edita nada: si algún día
//      alguien la saca de aquí, estas pruebas se ponen rojas y tendrá que ser una decisión
//      explícita. Y al revés: un docente NO la cambia, aunque la vea.
//   2. QUE UN NIVEL INVENTADO ES UN 400. Esto es un formulario que alguien acaba de rellenar, y
//      guardar en silencio algo distinto de lo que ha elegido es lo peor que puede hacer una
//      pantalla de configuración.
//   3. QUE LO QUE SE GUARDA ES SOLO LO QUE SE APARTA DE LO DE SERIE, y que volver a lo de siempre
//      deja el documento sin el campo, como uno recién importado.
//   4. QUE LA EXPORTACIÓN OBEDECE. Es lo único que de verdad le importa a quien lo configura: que el
//      PDF salga con el índice que ha pedido. Se comprueba sobre la definición de pdfmake, que es lo
//      que el PDF es (`Pdf.definicionDe`).
//   5. QUE SE PUEDE FORZAR DESDE LA DIRECCIÓN SIN GUARDAR NADA, para la exportación suelta.
//   6. QUE SE ARRASTRA AL CURSO SIGUIENTE, porque cómo se imprime la programación del departamento
//      no se vuelve a decidir cada septiembre.

'use strict';

const assert = require('assert/strict');

const { crearRepositorio } = require('../repositorio');
const memoria = require('../repositorio/memoria');
const Unidades = require('../core/unidades');
const Imp = require('../core/impresion');
const { aFilas } = require('../core/documento');
const { COOKIE_SESION, abrirSesion } = require('../app/_lib/sesion');
const Ruta = require('../app/_lib/rutas/impresion');
const Pdf = require('../app/_lib/rutas/pdf');
const Arrastre = require('../app/_lib/rutas/arrastre');

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

// Dos secciones comunes con hijos y nietos, y una de módulos con dos apartados: lo justo para que el
// índice tenga niveles 1, 2, 3 y 4 y se pueda ver dónde llega.
const PLANTILLA = {
  tipo: 'programacion_didactica',
  origen: 'PD_sintetica.docx',
  version: null,
  generada: '2026-01-01T00:00:00.000Z',
  secciones: [
    { id: 'introduccion', titulo: 'Introducción', nivel: 1, edita: 'jefe_departamento', presencia: 1,
      campos: [campoTexto],
      hijos: [{ id: 'introduccion/marco', titulo: 'Marco legal', nivel: 2, presencia: 1, campos: [campoTexto], hijos: [] }] },
    { id: 'diversidad', titulo: 'Atención a la diversidad', nivel: 1, edita: 'jefe_departamento',
      presencia: 1, campos: [campoTexto], hijos: [] },
    { id: 'modulos', titulo: 'Módulos', nivel: 1, instancias: true, etiqueta_instancia: 'módulo',
      grupos: ['Módulos del primer curso'], edita: 'docentes_del_modulo', presencia: 2, campos: [],
      hijos: [
        { id: 'modulos/metodologia', titulo: 'Metodología', nivel: 3, presencia: 2, campos: [campoTexto],
          hijos: [{ id: 'modulos/metodologia/agrupamientos', titulo: 'Agrupamientos', nivel: 4, presencia: 2, campos: [campoTexto], hijos: [] }] },
        { id: 'modulos/evaluacion', titulo: 'Evaluación', nivel: 3, presencia: 2, campos: [campoTexto], hijos: [] },
      ] },
  ],
};

const MODULOS = Unidades.UNIDADES.filter((u) => u.ciclo === 'daw').map((u) => u.id).slice(0, 2);
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
    estudios: await persona('Jefatura de estudios', 'estudios@ejemplo.invalid', 'jefe_estudios', 'direccion'),
    ana: await persona('Ana', 'ana@ejemplo.invalid', 'docente', 'informatica'),
    pepe: await persona('Pepe', 'pepe@ejemplo.invalid', 'docente', 'matematicas'),
  };

  const filas = aFilas({
    plantilla: PLANTILLA,
    datos: {
      departamento: 'informatica',
      documento: {
        introduccion: { texto: [{ type: 'p', text: 'Hola.' }] },
        'introduccion/marco': { texto: [{ type: 'p', text: 'El real decreto.' }] },
        diversidad: { texto: [{ type: 'p', text: 'Medidas.' }] },
      },
      instancias: MODULOS.map((id) => ({
        titulo: Unidades.tituloDe(id, '2026-27'), num: null, grupo: 'Módulos del primer curso',
        docentes: id === MODULOS[0] ? [u.ana._id] : [],
        valores: {
          [METODOLOGIA]: { texto: [{ type: 'p', text: 'Metodología.' }] },
          'modulos/metodologia/agrupamientos': { texto: [{ type: 'p', text: 'Parejas.' }] },
          'modulos/evaluacion': { texto: [{ type: 'p', text: 'Evaluación.' }] },
        },
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

const url = (id, consulta = '') => `/api/documentos/${id}/impresion${consulta}`;
const leer = (persona, id) => Ruta.GET(pet(url(id), persona), { id });
const cambiar = (persona, id, cuerpo) => Ruta.CAMBIAR(pet(url(id), persona, { metodo: 'PATCH', cuerpo }), { id });

async function configurar(persona, id, cuerpo) {
  const res = await cambiar(persona, id, cuerpo);
  assert.equal(res.status, 200, `la configuración debería haber salido bien y ha dado ${res.status}`);
  return res.json();
}

async function esError(respuesta, estado, codigo) {
  assert.equal(respuesta.status, estado, `se esperaba un ${estado} y ha sido un ${respuesta.status}`);
  const cuerpo = await respuesta.json();
  assert.equal(cuerpo.error, codigo);
  assert.ok(cuerpo.mensaje && cuerpo.mensaje.length > 0, 'el error no lleva mensaje');
  return cuerpo;
}

// La definición de pdfmake, que es lo que el PDF es. `consulta` fuerza valores desde la dirección.
const definicionDe = async (persona, id, consulta = '') => {
  const { definicion, fallo } = await Pdf.definicionDe(pet(`/api/documentos/${id}/pdf${consulta}`, persona), { id });
  assert.equal(fallo, undefined, 'el PDF se tiene que poder generar');
  return definicion;
};

const numeroDe = (n) => {
  const m = typeof n.text === 'string' ? /^(\d+(?:\.\d+)*)\. /.exec(n.text) : null;
  return m ? m[1] : null;
};
const enIndice = (def) => def.content.filter((n) => n.tocItem === true).map(numeroDe);
const conSalto = (def) => def.content.filter((n) => numeroDe(n) && n.pageBreak === 'before').map(numeroDe);
const hayIndice = (def) => def.content.some((n) => n.toc);

// «Sin configurar» son DOS cosas en la base: un documento recien importado no tiene el campo, y
// uno que volvio a lo de serie lo tiene en `null`. Las dos significan lo mismo y aqui se
// preguntan igual.
const guardada = async (repo, id) => {
  const d = await repo.documentos.obtener(id);
  return d.impresion === undefined ? null : d.impresion;
};

// ================================================================ quién la ve y quién la cambia

prueba('la ve quien ve el documento, y dice si los controles son suyos', async () => {
  const { u, doc } = await escenario();
  for (const [quien, puede] of [[u.admin, true], [u.jefa, true], [u.estudios, true], [u.ana, false]]) {
    const cuerpo = await (await leer(quien, doc._id)).json();
    assert.equal(cuerpo.puedeConfigurar, puede, `puedeConfigurar de ${quien.nombre}`);
    assert.equal(cuerpo.indice, Imp.INDICE_DE_SERIE);
    assert.equal(cuerpo.saltos, Imp.SALTOS_DE_SERIE);
  }
});

prueba('la lectura trae los niveles que se pueden elegir, con lo que significa cada uno', async () => {
  const { u, doc } = await escenario();
  const cuerpo = await (await leer(u.jefa, doc._id)).json();
  assert.equal(cuerpo.nivelesDelIndice.length, Imp.NIVEL_MAXIMO + 1);
  assert.equal(cuerpo.nivelesDeSalto.length, Imp.NIVEL_MAXIMO + 1);
  for (const lista of [cuerpo.nivelesDelIndice, cuerpo.nivelesDeSalto]) {
    for (const n of lista) {
      assert.equal(typeof n.titulo, 'string');
      assert.ok(n.titulo.length > 0, 'un nivel sin título no se puede enseñar');
      assert.ok(n.que.length > 0, 'un nivel sin explicación no se puede elegir');
      assert.ok(n.efecto.length > 0, 'un nivel sin frase de efecto deja a la pantalla redactándola a trozos');
    }
  }
  // Que cada módulo empieza en página nueva siempre tiene que estar dicho: si no, «Solo cada módulo»
  // parece «ningún salto».
  assert.ok(cuerpo.loQueNoSeConfigura.includes('módulo'), cuerpo.loQueNoSeConfigura);
});

prueba('la cambian la jefatura del departamento, la de estudios y el soporte', async () => {
  for (const quien of ['admin', 'jefa', 'estudios']) {
    const { u, doc } = await escenario();
    const cuerpo = await configurar(u[quien], doc._id, { indice: 4 });
    assert.equal(cuerpo.indice, 4, `${quien} tendría que poder cambiarla`);
  }
});

prueba('un docente la ve pero no la cambia, y el de otro departamento no la ve', async () => {
  const { u, doc } = await escenario();
  assert.equal((await leer(u.ana, doc._id)).status, 200);
  await esError(await cambiar(u.ana, doc._id, { indice: 4 }), 403, 'sin_permiso');
  // De otro departamento es 404 y no 403: no se le dice que el documento existe.
  await esError(await leer(u.pepe, doc._id), 404, 'no_encontrado');
  await esError(await cambiar(u.pepe, doc._id, { indice: 4 }), 404, 'no_encontrado');
});

prueba('sin identificarse es un 401', async () => {
  const { doc } = await escenario();
  await esError(await leer(null, doc._id), 401, 'sin_identificar');
  await esError(await cambiar(null, doc._id, { indice: 4 }), 401, 'sin_identificar');
});

// ================================================================ qué se acepta

prueba('un nivel que no existe es un 400 y no se guarda nada', async () => {
  const { repo, u, doc } = await escenario();
  for (const malo of [7, -1, 2.5, 'x', true, [], {}]) {
    const c = await esError(await cambiar(u.jefa, doc._id, { indice: malo }), 400, 'peticion');
    assert.ok(c.mensaje.includes('indice'), c.mensaje);
    assert.ok(c.mensaje.includes(String(Imp.NIVEL_MAXIMO)), c.mensaje);
  }
  await esError(await cambiar(u.jefa, doc._id, { saltos: 9 }), 400, 'peticion');
  assert.equal(await guardada(repo, doc._id), null);
});

prueba('un cuerpo sin nada que cambiar es un 400', async () => {
  const { u, doc } = await escenario();
  await esError(await cambiar(u.jefa, doc._id, {}), 400, 'peticion');
  await esError(await cambiar(u.jefa, doc._id, { otraCosa: 3 }), 400, 'peticion');
});

prueba('el cero vale: es «sin índice» y «solo cada módulo», no un hueco', async () => {
  const { u, doc } = await escenario();
  const cuerpo = await configurar(u.jefa, doc._id, { indice: 0, saltos: 0 });
  assert.equal(cuerpo.indice, 0);
  assert.equal(cuerpo.saltos, 0);
});

prueba('cambiar uno no borra el otro', async () => {
  const { u, doc } = await escenario();
  await configurar(u.jefa, doc._id, { indice: 4, saltos: 1 });
  const cuerpo = await configurar(u.jefa, doc._id, { saltos: 2 });
  assert.equal(cuerpo.indice, 4, 'el índice no se ha tocado');
  assert.equal(cuerpo.saltos, 2);
});

prueba('solo se guarda lo que se aparta de lo de serie, y volver a lo de siempre deja el campo en null', async () => {
  const { repo, u, doc } = await escenario();
  await configurar(u.jefa, doc._id, { indice: 4, saltos: 1 });
  assert.deepStrictEqual(await guardada(repo, doc._id), { indice: 4, saltos: 1 });
  await configurar(u.jefa, doc._id, { saltos: 0 });
  assert.deepStrictEqual(await guardada(repo, doc._id), { indice: 4 });
  await configurar(u.jefa, doc._id, { indice: 2 });
  assert.equal(await guardada(repo, doc._id), null, 'sin nada que apartarse, sin campo');
});

prueba('dos personas configurando a la vez: la segunda recibe un 409 y no escribe', async () => {
  const { repo, u, doc } = await escenario();
  const antes = (await (await leer(u.jefa, doc._id)).json()).updatedAt;
  await configurar(u.estudios, doc._id, { indice: 5 });
  const c = await esError(
    await cambiar(u.jefa, doc._id, { indice: 1, esperaUpdatedAt: antes }), 409, 'conflicto',
  );
  assert.ok(c.mensaje.includes('No se ha cambiado'), c.mensaje);
  assert.equal((await repo.documentos.obtener(doc._id)).impresion.indice, 5, 'manda el primero');
});

// ================================================================ que la exportación obedece

prueba('sin configurar, el PDF sale con el indice de siempre: niveles 1 y 2 y nada de dentro de un modulo', async () => {
  const { u, doc } = await escenario();
  const def = await definicionDe(u.jefa, doc._id);
  assert.ok(hayIndice(def));
  const niveles = new Set(enIndice(def).map((n) => n.split('.').length));
  assert.deepStrictEqual([...niveles].sort(), [1, 2]);
  assert.equal(conSalto(def).some((n) => n.split('.').length === 1 && n !== '3'), false,
    'sin configurar no rompe página ningún apartado común');
});

prueba('con el indice al 4, entran los apartados de dentro de cada modulo y sus subapartados', async () => {
  const { u, doc } = await escenario();
  await configurar(u.jefa, doc._id, { indice: 4 });
  const niveles = new Set(enIndice(await definicionDe(u.jefa, doc._id)).map((n) => n.split('.').length));
  assert.deepStrictEqual([...niveles].sort(), [1, 2, 3, 4]);
});

prueba('con el indice a 0 el PDF sale sin indice', async () => {
  const { u, doc } = await escenario();
  await configurar(u.estudios, doc._id, { indice: 0 });
  const def = await definicionDe(u.jefa, doc._id);
  assert.equal(hayIndice(def), false);
  assert.deepStrictEqual(enIndice(def), []);
});

prueba('con saltos a 1, cada apartado comun empieza en pagina nueva menos el primero', async () => {
  const { u, doc } = await escenario();
  await configurar(u.jefa, doc._id, { saltos: 1 });
  const con = conSalto(await definicionDe(u.jefa, doc._id));
  assert.equal(con.includes('1'), false, 'el primero no, o sale una página en blanco');
  assert.ok(con.includes('2'), '«2» sí');
});

prueba('quien no la configura tambien se lleva el PDF configurado: es del documento', async () => {
  const { u, doc } = await escenario();
  await configurar(u.jefa, doc._id, { indice: 4 });
  const niveles = new Set(enIndice(await definicionDe(u.ana, doc._id)).map((n) => n.split('.').length));
  assert.ok(niveles.has(4), 'el docente exporta con la configuración del documento');
});

// ================================================================ forzarla para una exportación suelta

prueba('se puede forzar desde la direccion sin guardar nada', async () => {
  const { repo, u, doc } = await escenario();
  const def = await definicionDe(u.jefa, doc._id, '?indice=4');
  const niveles = new Set(enIndice(def).map((n) => n.split('.').length));
  assert.ok(niveles.has(4), 'la dirección manda en esta exportación');
  assert.equal(await guardada(repo, doc._id), null, 'y no ha guardado nada');
  // Y la pantalla de configuración sigue diciendo lo que está GUARDADO, no lo que se forzó.
  assert.equal((await (await leer(u.jefa, doc._id)).json()).indice, Imp.INDICE_DE_SERIE);
});

prueba('un valor inventado en la direccion no tumba la exportacion: sale lo configurado', async () => {
  const { u, doc } = await escenario();
  await configurar(u.jefa, doc._id, { indice: 3 });
  const niveles = new Set(enIndice(await definicionDe(u.jefa, doc._id, '?indice=veinte')).map((n) => n.split('.').length));
  assert.equal(niveles.has(4), false);
  assert.ok(niveles.has(3), 'se queda con lo que está configurado');
});

prueba('la direccion fuerza los saltos sin tocar el indice guardado', async () => {
  const { u, doc } = await escenario();
  await configurar(u.jefa, doc._id, { indice: 4 });
  const def = await definicionDe(u.jefa, doc._id, '?saltos=1');
  assert.ok(conSalto(def).includes('2'));
  const niveles = new Set(enIndice(def).map((n) => n.split('.').length));
  assert.ok(niveles.has(4), 'el índice guardado sigue en pie');
});

// ================================================================ el curso siguiente

prueba('la configuracion se arrastra al curso siguiente', async () => {
  const { u, doc } = await escenario();
  await configurar(u.jefa, doc._id, { indice: 4, saltos: 1 });
  const res = await Arrastre.CREAR(
    pet(`/api/documentos/${doc._id}/siguiente`, u.jefa, { metodo: 'POST', cuerpo: { curso: '2027-28' } }),
    { id: doc._id },
  );
  // 201 y no 200: el arrastre CREA un documento (docs/api.md).
  assert.equal(res.status, 201, `el arrastre debería haber salido bien y ha dado ${res.status}`);
  const nuevo = (await res.json()).documento;
  const cuerpo = await (await leer(u.jefa, nuevo._id)).json();
  assert.equal(cuerpo.indice, 4, 'el curso nuevo nace sabiendo cómo se imprime');
  assert.equal(cuerpo.saltos, 1);
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
