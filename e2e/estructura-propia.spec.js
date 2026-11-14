// LA ESTRUCTURA PROPIA DE UN MÓDULO, CON UN NAVEGADOR Y LA BASE DE DATOS DE VERDAD.
//
// Ruta: PUT /api/documentos/[id]/unidades/[unidad]/estructura (app/_lib/rutas/estructura-modulo.js).
// Lo que se comprueba es el corazón de la decisión del departamento:
//
//   · un docente reforma los campos de un apartado de SU módulo y lo consigue
//   · LOS OTROS DIEZ MÓDULOS NO CAMBIAN
//   · el mismo docente recibe 403 en un módulo que no lleva
//   · la jefatura de estudios recibe 403
//   · un conflicto da 409 y no escribe
//
// Todo lo que se toca se deshace en un `finally`: la estructura del módulo vuelve a la común
// (`estructura: null`) y el reparto de docentes, a como estaba. Lo único que no se deshace es el
// `updatedAt` del documento, que solo avanza: es la escritura condicionada que da el 409.
//
// LA PRUEBA DE LA ESCRITURA EXIGE QUE EL SERVIDOR SE HAYA REINICIADO tras añadir `estructura` a los campos
// de la unidad en repositorio/index.js: el repositorio se cachea en `globalThis` y la recarga en caliente
// no lo sustituye. Si no, la ruta contesta un 500 que lo dice (a propósito: antes devolvía un 200 que no
// había guardado nada).

const { test, expect } = require('@playwright/test');
const { entrarComo, salir, buscarDocumento } = require('./apoyo');

const NOTAS = { id: 'm_notas_de_la_prueba', tipo: 'texto_largo', etiqueta: 'Notas de la prueba' };
const reforma = (seccion) => ({ secciones: { [seccion]: { anadidos: [NOTAS] } } });

const q = (o) => Object.entries(o).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
const ruta = (doc, unidad, consulta = '') => `/api/documentos/${doc}/unidades/${encodeURIComponent(unidad)}/estructura${consulta}`;

async function arbol(page, id) {
  const r = await page.request.get(`/api/documentos/${id}/arbol`);
  expect(r.status()).toBe(200);
  return (await r.json()).arbol;
}

function hojasDeModulo(raiz) {
  const out = [];
  const ver = (n) => {
    if (!n || typeof n !== 'object') return;
    if (n.edita === 'docentes_del_modulo' && n.unidadId && n.contenido) out.push(n);
    (n.hijos || []).forEach(ver);
  };
  ver(raiz);
  return out;
}

async function leerEstructura(page, doc, unidad, consulta) {
  const r = await page.request.get(ruta(doc, unidad, consulta));
  expect(r.status(), await r.text()).toBe(200);
  return r.json();
}

// Lo que cada módulo lleva ahora mismo, para comparar antes y después.
async function fotoDeLosModulos(page, doc, unidades) {
  const foto = {};
  for (const u of unidades) foto[u] = JSON.stringify((await leerEstructura(page, doc, u)).estructura);
  return foto;
}

async function elegir(page) {
  const doc = await buscarDocumento(page, { tipo: 'programacion_didactica', ciclo: 'daw', curso: '2026-27' });
  expect(doc, 'hace falta la PD de DAW 26-27').toBeTruthy();
  const hojas = hojasDeModulo(await arbol(page, doc._id));
  const unidades = [...new Set(hojas.map((h) => h.unidadId))];
  expect(unidades.length, 'la PD de DAW tiene once módulos').toBeGreaterThan(2);
  const mio = hojas[0];
  const ajeno = hojas.find((h) => h.unidadId !== mio.unidadId);
  return { doc, mio, ajeno, unidades };
}

test.describe('la estructura propia de un módulo', () => {
  test('un docente reforma su módulo, los otros diez no cambian, y fuera de su módulo recibe 403', async ({ page }) => {
    test.setTimeout(180_000);
    await salir(page);
    await entrarComo(page, 'jefe_departamento');
    const { doc, mio, ajeno, unidades } = await elegir(page);

    const lista = (await (await page.request.get('/api/acceso-libre')).json()).personas;
    const lucia = lista.find((p) => p.rol === 'docente');
    expect(lucia).toBeTruthy();
    const previo = (await (await page.request.get(`/api/documentos/${doc._id}/unidades`)).json()).unidades;
    const docentesAntes = (previo.find((u) => u.unidadId === mio.unidadId) || {}).docentes || [];
    const idsAntes = docentesAntes.map((d) => (typeof d === 'string' ? d : d._id || d.id));

    let tocado = false;
    try {
      const puesto = await page.request.put(`/api/documentos/${doc._id}/unidades/${encodeURIComponent(mio.unidadId)}/docentes`, {
        data: { docentes: [lucia._id] },
      });
      expect(puesto.status(), await puesto.text()).toBeLessThan(400);
      const antes = await fotoDeLosModulos(page, doc._id, unidades);
      const plantillaAntes = (await leerEstructura(page, doc._id, mio.unidadId)).plantillaVersion;

      await salir(page);
      await entrarComo(page, 'docente', lucia.nombre);

      // Antes de guardar, la pantalla pregunta: puede, y el alcance es solo este módulo.
      const pregunta = await leerEstructura(page, doc._id, mio.unidadId, `?${q({ seccion: mio.seccion })}`);
      expect(pregunta.puedeCambiar).toBe(true);
      expect(pregunta.alcance.comun).toBe(false);
      expect(pregunta.alcance.modulos).toBe(1);

      // Reforma el apartado de SU módulo.
      tocado = true;
      const r = await page.request.put(ruta(doc._id, mio.unidadId), {
        data: {
          estructura: reforma(mio.seccion),
          esperaUpdatedAt: pregunta.updatedAt,
          esperaPlantillaVersion: pregunta.plantillaVersion,
        },
      });
      expect(r.status(), await r.text()).toBe(200);
      const j = await r.json();
      expect(j.cambiadas).toEqual([mio.seccion]);
      expect(j.afectaAlDocumento).toBe(false);
      expect(j.estructura.secciones[mio.seccion].anadidos[0].id).toBe(NOTAS.id);

      // Se ha guardado: se lee igual por la otra ruta.
      const leida = await leerEstructura(page, doc._id, mio.unidadId);
      expect(leida.estructura.secciones[mio.seccion].anadidos.map((c) => c.id)).toEqual([NOTAS.id]);

      // LO QUE IMPORTA: los otros diez módulos, exactamente como estaban; y la plantilla, sin tocar.
      const despues = await fotoDeLosModulos(page, doc._id, unidades);
      for (const u of unidades.filter((x) => x !== mio.unidadId)) {
        expect(despues[u], `el módulo ${u} ha cambiado y no era el del docente`).toBe(antes[u]);
      }
      expect(despues[mio.unidadId]).not.toBe(antes[mio.unidadId]);
      expect((await leerEstructura(page, doc._id, ajeno.unidadId)).plantillaVersion, 'la plantilla común no se toca').toBe(plantillaAntes);

      // En un módulo que no lleva: 403, y no escribe.
      const noPregunta = await leerEstructura(page, doc._id, ajeno.unidadId, `?${q({ seccion: ajeno.seccion })}`);
      expect(noPregunta.puedeCambiar).toBe(false);
      const fuera = await page.request.put(ruta(doc._id, ajeno.unidadId), { data: { estructura: reforma(ajeno.seccion) } });
      expect(fuera.status(), 'docente en el módulo de otro').toBe(403);
      expect((await leerEstructura(page, doc._id, ajeno.unidadId)).estructura).toBeNull();
    } finally {
      await salir(page);
      await entrarComo(page, 'jefe_departamento');
      if (tocado) {
        const v = await leerEstructura(page, doc._id, mio.unidadId);
        if (v.estructura) {
          const quita = await page.request.put(ruta(doc._id, mio.unidadId), { data: { estructura: null } });
          expect(quita.status(), `no se ha podido devolver el módulo a la común: ${await quita.text()}`).toBe(200);
        }
      }
      await page.request.put(`/api/documentos/${doc._id}/unidades/${encodeURIComponent(mio.unidadId)}/docentes`, {
        data: { docentes: idsAntes },
      });
    }
  });

  test('la jefatura de estudios recibe 403 y no escribe nada', async ({ page }) => {
    test.setTimeout(120_000);
    await salir(page);
    await entrarComo(page, 'jefe_departamento');
    const { doc, mio, unidades } = await elegir(page);
    const antes = await fotoDeLosModulos(page, doc._id, unidades);

    await salir(page);
    await entrarComo(page, 'jefe_estudios');
    try {
      const pregunta = await leerEstructura(page, doc._id, mio.unidadId, `?${q({ seccion: mio.seccion })}`);
      expect(pregunta.puedeCambiar).toBe(false);
      const r = await page.request.put(ruta(doc._id, mio.unidadId), { data: { estructura: reforma(mio.seccion) } });
      expect(r.status(), 'jefatura de estudios').toBe(403);
    } finally {
      await salir(page);
      await entrarComo(page, 'jefe_departamento');
      const si = await page.request.get(ruta(doc._id, mio.unidadId));
      if ((await si.json()).estructura !== null && antes[mio.unidadId] === 'null') {
        await page.request.put(ruta(doc._id, mio.unidadId), { data: { estructura: null } });
      }
    }
    expect(await fotoDeLosModulos(page, doc._id, unidades)).toEqual(antes);
  });

  test('un conflicto da 409 y no escribe', async ({ page }) => {
    test.setTimeout(120_000);
    await salir(page);
    await entrarComo(page, 'jefe_departamento');
    const { doc, mio, unidades } = await elegir(page);
    const antes = await fotoDeLosModulos(page, doc._id, unidades);
    let escrito = false;
    try {
      const leida = await leerEstructura(page, doc._id, mio.unidadId);

      // Una versión de la plantilla que no es la actual.
      const vieja = await page.request.put(ruta(doc._id, mio.unidadId), {
        data: { estructura: reforma(mio.seccion), esperaPlantillaVersion: leida.plantillaVersion + 1 },
      });
      expect(vieja.status(), 'versión de plantilla vieja').toBe(409);

      // Un token del documento que no es el actual: alguien ha escrito entre la lectura y el guardado.
      const token = new Date(new Date(leida.updatedAt).getTime() - 5000).toISOString();
      const otroToken = await page.request.put(ruta(doc._id, mio.unidadId), {
        data: { estructura: reforma(mio.seccion), esperaUpdatedAt: token },
      });
      expect(otroToken.status(), 'token del documento viejo').toBe(409);
      expect((await otroToken.json()).error).toBe('conflicto');

      expect(await fotoDeLosModulos(page, doc._id, unidades), 'un conflicto no escribe').toEqual(antes);

      // Y el mismo cuerpo con lo leído de verdad, sí.
      const bien = await page.request.put(ruta(doc._id, mio.unidadId), {
        data: { estructura: reforma(mio.seccion), esperaUpdatedAt: leida.updatedAt, esperaPlantillaVersion: leida.plantillaVersion },
      });
      expect(bien.status(), await bien.text()).toBe(200);
      escrito = true;

      // Repetirlo con el token de antes ya es un conflicto: el documento ha avanzado.
      const repetido = await page.request.put(ruta(doc._id, mio.unidadId), {
        data: { estructura: null, esperaUpdatedAt: leida.updatedAt },
      });
      expect(repetido.status(), 'el token se ha movido con la escritura').toBe(409);
    } finally {
      if (escrito) {
        const quita = await page.request.put(ruta(doc._id, mio.unidadId), { data: { estructura: null } });
        expect(quita.status(), `no se ha podido devolver el módulo a la común: ${await quita.text()}`).toBe(200);
      }
    }
  });

  test('un apartado común dice su alcance y sin sesión se pide entrar (401)', async ({ page }) => {
    await salir(page);
    await entrarComo(page, 'jefe_departamento');
    const { doc, mio } = await elegir(page);
    const comun = (await arbol(page, doc._id)).hijos.find((n) => n.edita === 'jefe_departamento' && n.contenido);
    if (comun) {
      const j = await leerEstructura(page, doc._id, mio.unidadId, `?${q({ seccion: comun.seccion })}`);
      expect(j.alcance.comun).toBe(true);
      expect(j.alcance.modulos, 'un apartado común afecta a todos los módulos').toBeGreaterThan(1);
      expect(j.alcance.mensaje).toContain('documento entero');
    }
    await salir(page);
    const r = await page.request.put(ruta(doc._id, mio.unidadId), { data: { estructura: null } });
    expect(r.status()).toBe(401);
  });
});
