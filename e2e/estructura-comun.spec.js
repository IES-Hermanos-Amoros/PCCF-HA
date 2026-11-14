// LA ESTRUCTURA DE UN APARTADO COMÚN, CON UN NAVEGADOR Y LA BASE DE DATOS DE VERDAD.
//
// Rutas: las de la plantilla común, /api/documentos/[id]/estructura/... (app/_lib/rutas/estructura.js).
// Un apartado común tiene UNA sola copia: configurarlo es cambiar la definición del documento, y eso lo
// hacen estas rutas. La decisión del departamento es que quien puede editar un apartado puede configurarlo,
// así que quien tiene asignado un apartado común puede añadirle campos. Lo que se comprueba:
//
//   · la jefatura asigna un apartado común a un docente
//   · ese docente añade un campo a ese apartado y lo consigue, y la respuesta dice a quién afecta
//   · el mismo docente recibe 403 en un apartado común que NO tiene asignado
//   · el mismo docente recibe 403 en una sección DE MÓDULO por estas rutas, aunque lleve el módulo:
//     cambiarla por aquí la cambia en los once módulos a la vez. El docente reforma su módulo por
//     PUT .../unidades/[unidad]/estructura (e2e/estructura-propia.spec.js)
//   · el docente sigue sin poder añadir, mover ni retirar apartados: eso decide qué apartados tiene el documento
//   · la jefatura de estudios recibe 403 en todo
//
// Todo lo que se toca se deshace en un `finally`: el campo creado se retira y se borra, y el reparto de
// apartados y de módulos vuelve a como estaba. Lo único que no se deshace es el registro de cambios de la
// plantilla (`plantilla.cambios`) y su versión, que solo suben por diseño.

const { test, expect } = require('@playwright/test');
const { entrarComo, salir, buscarDocumento } = require('./apoyo');

const base = (doc) => `/api/documentos/${doc}/estructura`;
const q = (o) => Object.entries(o).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
const raiz = (seccion) => String(seccion).split('/')[0];

async function json(r) {
  expect(r.status(), await r.text()).toBe(200);
  return r.json();
}

async function arbol(page, id) {
  return (await json(await page.request.get(`/api/documentos/${id}/arbol`))).arbol;
}

function hojasDeModulo(nodo) {
  const out = [];
  const ver = (n) => {
    if (!n || typeof n !== 'object') return;
    if (n.edita === 'docentes_del_modulo' && n.unidadId && n.contenido) out.push(n);
    (n.hijos || []).forEach(ver);
  };
  ver(nodo);
  return out;
}

const anadirCampo = (page, doc, seccion) => page.request.post(`${base(doc)}/apartado/campo?${q({ seccion })}`, {
  data: { campo: { tipo: 'texto_largo', etiqueta: 'Campo de la estructura común' } },
});
const retirarCampo = (page, doc, seccion, campo) => page.request.post(`${base(doc)}/apartado/campo/retirar?${q({ seccion, campo })}`, { data: {} });
const borrarCampo = (page, doc, seccion, campo) => page.request.delete(`${base(doc)}/apartado/campo?${q({ seccion, campo })}`);
const leerAsignaciones = async (page, doc) => json(await page.request.get(`/api/documentos/${doc}/asignaciones`));
const asignar = (page, doc, seccion, personas) => page.request.put(`/api/documentos/${doc}/asignaciones?${q({ seccion })}`, { data: { personas } });
const version = async (page, doc) => (await json(await page.request.get(base(doc)))).plantillaVersion;

// Las cosas que cambian un apartado o el documento entero, con cuerpos válidos: el 403 tiene que venir de
// QUIÉN pregunta y no de un cuerpo malo.
function intentosDeCampo(page, doc, seccion, campo) {
  return {
    'añadir campo': () => anadirCampo(page, doc, seccion),
    'renombrar apartado': () => page.request.patch(`${base(doc)}/apartado?${q({ seccion })}`, { data: { titulo: 'Otro título' } }),
    'renombrar campo': () => page.request.patch(`${base(doc)}/apartado/campo?${q({ seccion, campo })}`, { data: { etiqueta: 'Otra' } }),
    'mover campo': () => page.request.post(`${base(doc)}/apartado/campo/mover?${q({ seccion, campo })}`, { data: { delta: 1 } }),
    'retirar campo': () => retirarCampo(page, doc, seccion, campo),
    'borrar campo': () => borrarCampo(page, doc, seccion, campo),
  };
}
function intentosDeApartado(page, doc, seccion) {
  return {
    'añadir apartado': () => page.request.post(`${base(doc)}/apartado`, { data: { titulo: 'Apartado de la prueba' } }),
    'mover apartado': () => page.request.post(`${base(doc)}/apartado/mover?${q({ seccion })}`, { data: { delta: 1 } }),
    'retirar apartado': () => page.request.post(`${base(doc)}/apartado/retirar?${q({ seccion })}`, { data: {} }),
  };
}

// El documento, un docente que da clase, dos apartados comunes asignables sin parentesco entre sí y un
// apartado de módulo con un campo que ya existe.
async function elegir(page) {
  const doc = await buscarDocumento(page, { tipo: 'programacion_didactica', ciclo: 'daw', curso: '2026-27' });
  expect(doc, 'hace falta la PD de DAW 26-27').toBeTruthy();
  const asg = await leerAsignaciones(page, doc._id);
  const lucia = asg.personas.find((p) => p.rol === 'docente');
  expect(lucia, 'hace falta un docente que dé clase').toBeTruthy();
  const libres = asg.apartados.filter((a) => !a.personas.includes(lucia._id));
  const mia = libres[0];
  const ajena = libres.find((a) => raiz(a.seccion) !== raiz(mia.seccion));
  expect(mia && ajena, 'hacen falta dos apartados comunes asignables sin parentesco').toBeTruthy();
  const hojas = hojasDeModulo(await arbol(page, doc._id));
  expect(hojas.length, 'el documento no tiene apartados de módulo').toBeGreaterThan(1);
  const modulo = hojas[0];
  const ap = await json(await page.request.get(`/api/documentos/${doc._id}/apartado?${q({ seccion: modulo.seccion, unidad: modulo.unidadId })}`));
  expect((ap.campos || []).length, 'el apartado de módulo no tiene campos').toBeGreaterThan(0);
  return { doc, lucia, mia, ajena, modulo, campoDeModulo: ap.campos[0].id };
}

test.describe('la estructura de un apartado común', () => {
  test('quien tiene asignado un apartado común le añade un campo, y solo a ese', async ({ page }) => {
    test.setTimeout(180_000);
    await salir(page);
    await entrarComo(page, 'jefe_departamento');
    const { doc, lucia, mia, ajena, modulo, campoDeModulo } = await elegir(page);

    const previo = (await (await page.request.get(`/api/documentos/${doc._id}/unidades`)).json()).unidades;
    const docentesAntes = ((previo.find((u) => u.unidadId === modulo.unidadId) || {}).docentes || [])
      .map((d) => (typeof d === 'string' ? d : d._id || d.id));
    const mias = [];
    let creado = null;

    try {
      // La jefatura asigna el apartado común al docente, y le da también un módulo (para la prueba del módulo).
      const puesta = await asignar(page, doc._id, mia.seccion, [lucia._id]);
      expect(puesta.status(), await puesta.text()).toBe(200);
      mias.push(mia.seccion);
      const lleva = await page.request.put(`/api/documentos/${doc._id}/unidades/${encodeURIComponent(modulo.unidadId)}/docentes`, {
        data: { docentes: [lucia._id] },
      });
      expect(lleva.status(), await lleva.text()).toBeLessThan(400);
      const v0 = await version(page, doc._id);

      await salir(page);
      await entrarComo(page, 'docente', lucia.nombre);

      // Antes de guardar, la pantalla pregunta: en el suyo puede, y le dice a quién afecta; en el ajeno no.
      const pregunta = await json(await page.request.get(`${base(doc._id)}?${q({ seccion: mia.seccion })}`));
      expect(pregunta.puedeCambiarApartado).toBe(true);
      expect(pregunta.puedeCambiar, 'añadir apartados sigue siendo de la jefatura').toBe(false);
      expect(pregunta.alcance.comun).toBe(true);
      expect(pregunta.alcance.modulos, 'un apartado común afecta a todos los módulos').toBeGreaterThan(1);
      expect(pregunta.alcance.mensaje).toContain('documento entero');
      expect(pregunta.alcance.personas.some((p) => p.id === lucia._id), 'y a quien lo tiene asignado').toBe(true);
      const noPregunta = await json(await page.request.get(`${base(doc._id)}?${q({ seccion: ajena.seccion })}`));
      expect(noPregunta.puedeCambiarApartado).toBe(false);

      // Añade un campo al suyo, y lo consigue. La respuesta dice el alcance.
      const a = await anadirCampo(page, doc._id, mia.seccion);
      expect(a.status(), await a.text()).toBe(201);
      const ja = await a.json();
      creado = ja.campos[0].id;
      expect(ja.alcance.comun).toBe(true);
      expect(ja.alcance.modulos).toBeGreaterThan(1);
      expect(ja.alcance.mensaje).toContain('documento entero');
      expect(await version(page, doc._id)).toBeGreaterThan(v0);

      // Y lo ve en el apartado: el campo existe de verdad.
      const ap = await json(await page.request.get(`/api/documentos/${doc._id}/apartado?${q({ seccion: mia.seccion })}`));
      expect(ap.campos.map((c) => c.id)).toContain(creado);

      // Puede seguir configurándolo.
      const re = await page.request.patch(`${base(doc._id)}/apartado/campo?${q({ seccion: mia.seccion, campo: creado })}`, { data: { etiqueta: 'Renombrado por quien lo lleva' } });
      expect(re.status(), await re.text()).toBe(200);

      // Lo que NO es suyo: un apartado común que no tiene asignado, el módulo que lleva, y decidir qué apartados hay.
      const v1 = await version(page, doc._id);
      const ajenoAp = await json(await page.request.get(`/api/documentos/${doc._id}/apartado?${q({ seccion: ajena.seccion })}`));
      const campoAjeno = (ajenoAp.campos[0] || {}).id || 'texto';
      for (const [que, pedir] of Object.entries(intentosDeCampo(page, doc._id, ajena.seccion, campoAjeno))) {
        expect((await pedir()).status(), `docente: ${que} en un común que no tiene asignado`).toBe(403);
      }
      // En el módulo que lleva: cambiaría los once, así que 403 aunque sea suyo.
      const suyo = await json(await page.request.get(`/api/documentos/${doc._id}/apartado?${q({ seccion: modulo.seccion, unidad: modulo.unidadId })}`));
      expect(suyo.puedeEditar, 'el docente tiene que llevar este módulo para que la prueba valga').toBe(true);
      for (const [que, pedir] of Object.entries(intentosDeCampo(page, doc._id, modulo.seccion, campoDeModulo))) {
        expect((await pedir()).status(), `docente: ${que} en una sección de módulo que lleva (cambia los once)`).toBe(403);
      }
      const pideModulo = await json(await page.request.get(`${base(doc._id)}?${q({ seccion: modulo.seccion })}`));
      expect(pideModulo.puedeCambiarApartado).toBe(false);
      // Ni siquiera con su apartado decide qué apartados tiene el documento.
      for (const [que, pedir] of Object.entries(intentosDeApartado(page, doc._id, mia.seccion))) {
        expect((await pedir()).status(), `docente: ${que}, aunque el apartado sea suyo`).toBe(403);
      }
      expect(await version(page, doc._id), 'ninguna petición negada sube la versión').toBe(v1);
    } finally {
      await salir(page);
      await entrarComo(page, 'jefe_departamento');
      if (creado) {
        await retirarCampo(page, doc._id, mia.seccion, creado);
        const b = await borrarCampo(page, doc._id, mia.seccion, creado);
        expect([200, 404], `no se ha podido borrar el campo de la prueba: ${await b.text()}`).toContain(b.status());
      }
      for (const s of mias) {
        const quita = await asignar(page, doc._id, s, []);
        expect(quita.status(), `no se ha podido deshacer la asignación de ${s}`).toBe(200);
      }
      await page.request.put(`/api/documentos/${doc._id}/unidades/${encodeURIComponent(modulo.unidadId)}/docentes`, {
        data: { docentes: docentesAntes },
      });
    }
  });

  test('la jefatura de estudios recibe 403 en todo, y la lectura dice el alcance antes de guardar', async ({ page }) => {
    test.setTimeout(120_000);
    await salir(page);
    await entrarComo(page, 'jefe_departamento');
    const { doc, mia, modulo, campoDeModulo } = await elegir(page);
    const v0 = await version(page, doc._id);

    // El alcance de un común, antes de guardar.
    const g = await json(await page.request.get(`${base(doc._id)}?${q({ seccion: mia.seccion })}`));
    expect(g.puedeCambiarApartado).toBe(true);
    expect(g.alcance.comun).toBe(true);
    expect(g.alcance.modulos).toBeGreaterThan(1);
    // Y el de una sección de módulo por la plantilla: son todos los módulos, no uno.
    const m = await json(await page.request.get(`${base(doc._id)}?${q({ seccion: modulo.seccion })}`));
    expect(m.alcance.comun).toBe(false);
    expect(m.alcance.modulos, 'cambiar la plantilla cambia todos los módulos').toBeGreaterThan(1);

    await salir(page);
    await entrarComo(page, 'jefe_estudios');
    const sitios = [[mia.seccion, 'una sección común', 'texto'], [modulo.seccion, 'una sección de módulo', campoDeModulo]];
    for (const [seccion, donde, campo] of sitios) {
      const lectura = await json(await page.request.get(`${base(doc._id)}?${q({ seccion })}`));
      expect(lectura.puedeCambiarApartado, `jefatura de estudios en ${donde}`).toBe(false);
      const todo = { ...intentosDeCampo(page, doc._id, seccion, campo), ...intentosDeApartado(page, doc._id, seccion) };
      for (const [que, pedir] of Object.entries(todo)) {
        expect((await pedir()).status(), `jefatura de estudios: ${que} en ${donde}`).toBe(403);
      }
    }

    await salir(page);
    await entrarComo(page, 'jefe_departamento');
    expect(await version(page, doc._id), 'una petición negada no puede subir la versión').toBe(v0);
  });
});
