// Las SALIDAS de la aplicación: exportar a PDF y a Word, y la copia del Word original.
//
// Solo lectura. La regla de quién exporta sale de `abrirDocumento` (app/_lib/rutas/comun.js): ni /pdf
// ni /docx piden nada más que VER el documento, y `puedeVer` (core/permisos.js) deja ver todo al
// soporte y a la jefatura de estudios, y a los demás solo lo de su departamento. Los cuatro roles de
// muestra, salvo estudios, son de informática y los doce documentos también, así que los cuatro
// exportan; sin sesión es 401.

const { test, expect } = require('@playwright/test');
const { ROLES, entrarComo, salir, documentos } = require('./apoyo');

const TIPO_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const ESPERA = { timeout: 180_000 };

test.describe('exportar', () => {
  test.setTimeout(600_000);

  test('cada documento cargado se exporta a PDF', async ({ page }) => {
    await salir(page);
    await entrarComo(page, 'jefe_departamento');
    const lista = await documentos(page);
    expect(lista.length).toBeGreaterThan(0);
    const tipos = new Set(lista.map((d) => d.tipo));
    for (const t of ['programacion_didactica', 'memoria', 'propuesta_pedagogica', 'pccf']) expect(tipos.has(t), `falta un ${t}`).toBe(true);

    for (const d of lista) {
      const etiqueta = `${d.tipo} ${d.ciclo || '-'} ${d.curso}`;
      const r = await page.request.get(`/api/documentos/${d._id}/pdf`, ESPERA);
      expect(r.status(), `PDF de ${etiqueta}`).toBe(200);
      expect(r.headers()['content-type'], etiqueta).toContain('application/pdf');
      const cuerpo = await r.body();
      expect(cuerpo.length, `PDF de ${etiqueta} vacío`).toBeGreaterThan(5_000);
      expect(cuerpo.subarray(0, 4).toString('latin1'), etiqueta).toBe('%PDF');
      expect(cuerpo.subarray(-1024).toString('latin1'), `${etiqueta} sin final de PDF`).toContain('%%EOF');
    }
  });

  test('cada documento cargado se exporta a Word', async ({ page }) => {
    await salir(page);
    await entrarComo(page, 'jefe_departamento');
    for (const d of await documentos(page)) {
      const etiqueta = `${d.tipo} ${d.ciclo || '-'} ${d.curso}`;
      const r = await page.request.get(`/api/documentos/${d._id}/docx`, ESPERA);
      expect(r.status(), `Word de ${etiqueta}`).toBe(200);
      expect(r.headers()['content-type'], etiqueta).toBe(TIPO_DOCX);
      expect(r.headers()['content-disposition'], etiqueta).toMatch(/attachment; filename=".+\.docx"/);
      const cuerpo = await r.body();
      expect(cuerpo.length, `Word de ${etiqueta} vacío`).toBeGreaterThan(5_000);
      expect(cuerpo.subarray(0, 2).toString('latin1'), etiqueta).toBe('PK');
    }
  });

  test('un solo módulo se exporta con el parámetro unidad y pesa menos que el tomo', async ({ page }) => {
    await salir(page);
    await entrarComo(page, 'jefe_departamento');
    const lista = await documentos(page);
    const pd = lista.find((d) => d.tipo === 'programacion_didactica' && d.ciclo === 'daw' && d.curso === '2026-27');
    expect(pd).toBeTruthy();
    const coord = await (await page.request.get(`/api/documentos/${pd._id}/coordinacion`)).json();
    const unidad = coord.filas.find((f) => f.tipo === 'unidad');
    const tomo = await (await page.request.get(`/api/documentos/${pd._id}/pdf`, ESPERA)).body();
    const r = await page.request.get(`/api/documentos/${pd._id}/pdf?unidad=${encodeURIComponent(unidad.unidadId)}`, ESPERA);
    expect(r.status(), await r.text().catch(() => '')).toBe(200);
    const uno = await r.body();
    expect(uno.subarray(0, 4).toString('latin1')).toBe('%PDF');
    expect(uno.length).toBeLessThan(tomo.length);
  });

  test('un parámetro de estado inventado da 400 con mensaje, en PDF y en Word', async ({ page }) => {
    await salir(page);
    await entrarComo(page, 'jefe_departamento');
    const d = (await documentos(page))[0];
    for (const formato of ['pdf', 'docx']) {
      const r = await page.request.get(`/api/documentos/${d._id}/${formato}?estado=aprovado`, ESPERA);
      expect(r.status(), formato).toBe(400);
      const j = await r.json();
      expect(j.error).toBe('peticion');
      expect(j.mensaje.length).toBeGreaterThan(10);
    }
  });

  for (const rol of ROLES) {
    test(`${rol}: exporta un documento de informática a PDF y a Word`, async ({ page }) => {
      await salir(page);
      await entrarComo(page, rol);
      const d = (await documentos(page)).find((x) => x.tipo === 'memoria');
      expect(d, 'este rol tiene que ver la memoria').toBeTruthy();
      const pdf = await page.request.get(`/api/documentos/${d._id}/pdf`, ESPERA);
      expect(pdf.status()).toBe(200);
      expect((await pdf.body()).subarray(0, 4).toString('latin1')).toBe('%PDF');
      const docx = await page.request.get(`/api/documentos/${d._id}/docx`, ESPERA);
      expect(docx.status()).toBe(200);
      expect((await docx.body()).subarray(0, 2).toString('latin1')).toBe('PK');
    });
  }

  test('sin sesión no se exporta nada: 401 en PDF, Word y copia', async ({ page, browser }) => {
    await salir(page);
    await entrarComo(page, 'admin');
    const d = (await documentos(page))[0];
    const anonimo = await browser.newContext({ baseURL: test.info().project.use.baseURL });
    try {
      for (const formato of ['pdf', 'docx', 'copia']) {
        const r = await anonimo.request.get(`/api/documentos/${d._id}/${formato}`);
        expect(r.status(), formato).toBe(401);
        expect((await r.json()).error).toBe('sin_identificar');
      }
    } finally {
      await anonimo.close();
    }
  });

  test('un id que no existe da 404 y no un 500, en PDF, Word y copia', async ({ page }) => {
    await salir(page);
    await entrarComo(page, 'admin');
    for (const formato of ['pdf', 'docx', 'copia']) {
      for (const id of ['000000000000000000000000', 'basura']) {
        const r = await page.request.get(`/api/documentos/${id}/${formato}`);
        expect(r.status(), `${formato} ${id}`).toBe(404);
      }
    }
  });
});

test.describe('copia del Word original', () => {
  test('responde lo que dice la lista de versiones: el .docx guardado o un 404 claro', async ({ page }) => {
    await salir(page);
    await entrarComo(page, 'jefe_departamento');
    let conCopia = 0;
    for (const d of await documentos(page)) {
      const etiqueta = `${d.tipo} ${d.ciclo || '-'} ${d.curso}`;
      const vs = await (await page.request.get(`/api/documentos/${d._id}/versiones`)).json();
      const mia = vs.versiones.find((v) => v._id === d._id);
      const r = await page.request.get(`/api/documentos/${d._id}/copia`);
      if (mia.copia) {
        conCopia += 1;
        expect(r.status(), etiqueta).toBe(200);
        expect(r.headers()['content-type'], etiqueta).toBe(TIPO_DOCX);
        expect((await r.body()).subarray(0, 2).toString('latin1'), etiqueta).toBe('PK');
      } else {
        expect(r.status(), `${etiqueta}: sin copia debe ser 404`).toBe(404);
        const j = await r.json();
        expect(j.error).toBe('no_encontrado');
        expect(j.mensaje).toMatch(/copia/i);
      }
    }
    test.info().annotations.push({ type: 'copias', description: `${conCopia} documentos con copia` });
  });
});
