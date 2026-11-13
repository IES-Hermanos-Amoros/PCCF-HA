// Cada docente edita SU parte del documento, y solo la suya.
//
// Es lo que el departamento quiere: trabajar como en el Word compartido, pero que cada cual toque
// únicamente donde tiene permiso. La regla vive en core/permisos.js; esto comprueba que la regla que
// aplica el servidor es esa, con un navegador y la base de datos de verdad:
//
//   · la jefatura de departamento edita cualquier módulo, lo lleve o no
//   · un docente edita el módulo que lleva, y NO el que lleva otro
//   · la jefatura de estudios lo ve todo y no edita nada
//
// La prueba reparte un módulo y lo deja como estaba al terminar.

const { test, expect } = require('@playwright/test');
const { entrarComo, salir, buscarDocumento } = require('./apoyo');

async function arbol(page, id) {
  const r = await page.request.get(`/api/documentos/${id}/arbol`);
  expect(r.status()).toBe(200);
  return (await r.json()).arbol;
}

// Los nodos hoja de módulo: los que edita quien lleva la unidad.
function hojasDeModulo(arbolDoc) {
  const out = [];
  const ver = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(ver);
    if (n.edita === 'docentes_del_modulo' && n.unidadId && n.contenido) out.push(n);
    (n.hijos || []).forEach(ver);
  };
  ver(arbolDoc);
  return out;
}

const apartadoUrl = (doc, nodo) => `/api/documentos/${doc}/apartado?seccion=${encodeURIComponent(nodo.seccion)}&unidad=${encodeURIComponent(nodo.unidadId)}`;

test.describe('cada cual en su parte', () => {
  test('un docente edita su módulo y no el de otro', async ({ page }) => {
    test.setTimeout(120_000);
    await salir(page);
    await entrarComo(page, 'jefe_departamento');

    const doc = await buscarDocumento(page, { tipo: 'programacion_didactica', ciclo: 'daw', curso: '2026-27' });
    expect(doc, 'hace falta la PD de DAW 26-27').toBeTruthy();

    const hojas = hojasDeModulo(await arbol(page, doc._id));
    expect(hojas.length, 'el documento no tiene apartados de módulo').toBeGreaterThan(1);
    const mio = hojas[0];
    const ajeno = hojas.find((h) => h.unidadId !== mio.unidadId);
    expect(ajeno, 'hacen falta dos módulos distintos').toBeTruthy();

    // Quién es quién.
    const r = await page.request.get('/api/acceso-libre');
    const lista = (await r.json()).personas;
    const lucia = lista.find((p) => p.rol === 'docente');
    expect(lucia).toBeTruthy();

    // Lo que había repartido, para devolverlo.
    const previo = await page.request.get(`/api/documentos/${doc._id}/unidades`);
    const antes = (await previo.json()).unidades.find((u) => u.unidadId === mio.unidadId);
    const docentesAntes = (antes && antes.docentes) || [];

    try {
      // La jefatura reparte: este módulo lo lleva ese docente.
      const puesto = await page.request.put(`/api/documentos/${doc._id}/unidades/${encodeURIComponent(mio.unidadId)}/docentes`, {
        data: { docentes: [lucia._id] },
      });
      expect(puesto.status(), await puesto.text()).toBeLessThan(400);

      // La jefatura de departamento edita los dos módulos, lleve o no lleve.
      for (const nodo of [mio, ajeno]) {
        const g = await page.request.get(apartadoUrl(doc._id, nodo));
        expect(g.status()).toBe(200);
        expect((await g.json()).puedeEditar, 'la jefatura de departamento edita cualquier módulo').toBe(true);
      }

      // Ahora el docente.
      await salir(page);
      await entrarComo(page, 'docente');

      const suyo = await page.request.get(apartadoUrl(doc._id, mio));
      expect(suyo.status()).toBe(200);
      const suyoJson = await suyo.json();
      expect(suyoJson.puedeEditar, 'el docente tiene que poder editar el módulo que lleva').toBe(true);

      // Y lo escribe de verdad: se devuelven los mismos valores, que recorre todo el camino de
      // escritura sin cambiar el contenido.
      const escrito = await page.request.patch(apartadoUrl(doc._id, mio), {
        data: { valores: suyoJson.valores || {}, esperaUpdatedAt: suyoJson.updatedAt },
      });
      expect(escrito.status(), await escrito.text()).toBeLessThan(400);

      const deOtro = await page.request.get(apartadoUrl(doc._id, ajeno));
      expect(deOtro.status(), 'el módulo de otro se VE').toBe(200);
      expect((await deOtro.json()).puedeEditar, 'el docente no edita el módulo de otro').toBe(false);

      const negado = await page.request.patch(apartadoUrl(doc._id, ajeno), {
        data: { valores: {}, esperaUpdatedAt: null },
      });
      expect(negado.status(), 'escribir en el módulo de otro tiene que negarse').toBe(403);

      // La jefatura de estudios: lo ve y no lo toca.
      await salir(page);
      await entrarComo(page, 'jefe_estudios');
      const visto = await page.request.get(apartadoUrl(doc._id, mio));
      expect(visto.status(), 'la jefatura de estudios ve cualquier documento').toBe(200);
      expect((await visto.json()).puedeEditar, 'la jefatura de estudios no edita').toBe(false);
      const negado2 = await page.request.patch(apartadoUrl(doc._id, mio), {
        data: { valores: {}, esperaUpdatedAt: null },
      });
      expect(negado2.status(), 'la jefatura de estudios no escribe').toBe(403);
    } finally {
      await salir(page);
      await entrarComo(page, 'jefe_departamento');
      await page.request.put(`/api/documentos/${doc._id}/unidades/${encodeURIComponent(mio.unidadId)}/docentes`, {
        data: { docentes: docentesAntes },
      });
    }
  });

  test('quien no ha entrado no ve nada', async ({ page }) => {
    await salir(page);
    const r = await page.request.get('/api/documentos');
    expect(r.status(), 'sin sesión no se listan documentos').toBeGreaterThanOrEqual(400);
  });
});
