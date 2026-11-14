// Las COMPROBACIONES de la aplicación: validaciones, comprobaciones configurables, coordinación y
// estado del documento.
//
// Las tres primeras son lectura y las ve quien ve el documento (`abrirDocumento`). El estado se
// cambia por el circuito de app/_lib/rutas/estado.js; la prueba que lo cambia lo devuelve siempre a
// como estaba en un `finally`.

const { test, expect } = require('@playwright/test');
const { ROLES, entrarComo, salir, documentos, buscarDocumento, controlDeFuga } = require('./apoyo');

const SEVERIDADES = ['error', 'aviso', 'info'];

// Quien ensucia es quien falla: al terminar, la base tiene que estar como al empezar.
controlDeFuga(test);

test.describe('validaciones', () => {
  test.setTimeout(240_000);

  test('cada documento responde con la forma del informe y cada aviso trae su texto', async ({ page }) => {
    await salir(page);
    await entrarComo(page, 'jefe_departamento');
    for (const d of await documentos(page)) {
      const etiqueta = `${d.tipo} ${d.ciclo || '-'} ${d.curso}`;
      const r = await page.request.get(`/api/documentos/${d._id}/validaciones`);
      expect(r.status(), etiqueta).toBe(200);
      const v = await r.json();
      expect(v.documentoId, etiqueta).toBe(d._id);
      expect(typeof v.puedeAprobarse).toBe('boolean');
      expect(Array.isArray(v.desactivadas)).toBe(true);
      expect(Array.isArray(v.grupos)).toBe(true);
      for (const s of SEVERIDADES) expect(typeof v.cuenta[s], `${etiqueta} cuenta.${s}`).toBe('number');

      const avisos = v.grupos.flatMap((g) => g.avisos);
      expect(v.total, `${etiqueta}: total no cuadra`).toBe(avisos.length);
      for (const s of SEVERIDADES) {
        expect(v.cuenta[s], `${etiqueta}: cuenta.${s}`).toBe(avisos.filter((a) => a.severidad === s).length);
      }
      expect(v.puedeAprobarse, `${etiqueta}: puedeAprobarse contra errores`).toBe(v.cuenta.error === 0);
      for (const a of avisos) {
        expect(SEVERIDADES, etiqueta).toContain(a.severidad);
        expect(typeof a.titulo === 'string' && a.titulo.trim().length > 5, `${etiqueta}: aviso sin título legible: ${JSON.stringify(a)}`).toBe(true);
        expect(typeof a.regla === 'string' && a.regla.length > 0, `${etiqueta}: aviso sin regla`).toBe(true);
        expect(a.titulo, 'texto de máquina en vez de para personas').not.toMatch(/undefined|\[object|NaN/);
        if (a.detalle !== undefined) expect(a.detalle, etiqueta).not.toMatch(/undefined|\[object|NaN/);
      }
    }
  });

  for (const rol of ROLES) {
    test(`${rol}: ve las validaciones, las comprobaciones y la coordinación`, async ({ page }) => {
      await salir(page);
      await entrarComo(page, rol);
      const d = await buscarDocumento(page, { tipo: 'programacion_didactica', ciclo: 'daw', curso: '2026-27' });
      expect(d).toBeTruthy();
      for (const ruta of ['validaciones', 'comprobaciones', 'coordinacion']) {
        const r = await page.request.get(`/api/documentos/${d._id}/${ruta}`);
        expect(r.status(), ruta).toBe(200);
        expect((await r.json()).documentoId).toBe(d._id);
      }
    });
  }

  test('sin sesión: 401 en las cuatro', async ({ page, browser }) => {
    await salir(page);
    await entrarComo(page, 'admin');
    const d = (await documentos(page))[0];
    const anonimo = await browser.newContext({ baseURL: test.info().project.use.baseURL });
    try {
      for (const ruta of ['validaciones', 'comprobaciones', 'coordinacion', 'estado']) {
        const r = await anonimo.request.get(`/api/documentos/${d._id}/${ruta}`);
        expect(r.status(), ruta).toBe(401);
      }
    } finally {
      await anonimo.close();
    }
  });
});

test.describe('comprobaciones configurables', () => {
  test('la forma de la respuesta y quién puede configurarlas', async ({ page }) => {
    // Regla de la ruta (comprobaciones.js): estudios y soporte; departamento y docente, no.
    const esperado = { admin: true, jefe_estudios: true, jefe_departamento: false, docente: false };
    for (const rol of ROLES) {
      await salir(page);
      await entrarComo(page, rol);
      const d = await buscarDocumento(page, { tipo: 'programacion_didactica', ciclo: 'smr', curso: '2026-27' });
      const j = await (await page.request.get(`/api/documentos/${d._id}/comprobaciones`)).json();
      expect(['peso_del_ra', 'cien_dentro_del_ra'], rol).toContain(j.convenioCe);
      expect(Array.isArray(j.convenios) && j.convenios.length).toBeGreaterThan(1);
      expect(Array.isArray(j.reglas) && j.reglas.length).toBeGreaterThan(0);
      expect(Array.isArray(j.cambios)).toBe(true);
      expect(typeof j.puedeConfigurar).toBe('boolean');
      expect(j.puedeConfigurar, `puedeConfigurar para ${rol}`).toBe(esperado[rol]);
    }
  });

  test('quien no puede configurarlas recibe 403 al intentarlo sin cambiar nada', async ({ page }) => {
    await salir(page);
    await entrarComo(page, 'docente');
    const d = await buscarDocumento(page, { tipo: 'programacion_didactica', ciclo: 'smr', curso: '2026-27' });
    const antes = await (await page.request.get(`/api/documentos/${d._id}/comprobaciones`)).json();
    const otro = antes.convenioCe === 'peso_del_ra' ? 'cien_dentro_del_ra' : 'peso_del_ra';
    const r = await page.request.patch(`/api/documentos/${d._id}/comprobaciones`, { data: { convenioCe: otro } });
    expect(r.status(), await r.text()).toBe(403);
    expect((await r.json()).error).toBe('sin_permiso');
    const despues = await (await page.request.get(`/api/documentos/${d._id}/comprobaciones`)).json();
    expect(despues.convenioCe).toBe(antes.convenioCe);
    expect(despues.updatedAt).toBe(antes.updatedAt);
  });
});

test.describe('coordinación', () => {
  test.setTimeout(240_000);

  test('la PD trae una fila por módulo con su recuento; el PCCF y la memoria van por apartados', async ({ page }) => {
    await salir(page);
    await entrarComo(page, 'jefe_estudios');
    for (const d of await documentos(page)) {
      const etiqueta = `${d.tipo} ${d.ciclo || '-'} ${d.curso}`;
      const r = await page.request.get(`/api/documentos/${d._id}/coordinacion`);
      expect(r.status(), etiqueta).toBe(200);
      const c = await r.json();
      expect(['unidades', 'comun'], etiqueta).toContain(c.modo);
      expect(Array.isArray(c.filas) && c.filas.length, `${etiqueta} sin filas`).toBeGreaterThan(0);
      expect(typeof c.puedeAprobarse).toBe('boolean');
      for (const k of ['unidades', 'sinDocentes', 'apartados', 'conContenido', 'revisados']) {
        expect(typeof c.resumen[k], `${etiqueta} resumen.${k}`).toBe('number');
      }
      expect(c.resumen.conContenido).toBeLessThanOrEqual(c.resumen.apartados);
      if (d.tipo === 'programacion_didactica') {
        expect(c.modo, etiqueta).toBe('unidades');
        expect(c.resumen.unidades).toBe(c.filas.filter((f) => f.tipo === 'unidad').length);
        for (const f of c.filas) {
          expect(f.celdas.length, `${etiqueta} ${f.titulo}`).toBe(c.bloques.length);
          expect(f.sinDocentes).toBe(f.docentes.length === 0);
        }
      }
      // La coordinación y las validaciones salen del mismo cálculo y no pueden discrepar.
      const v = await (await page.request.get(`/api/documentos/${d._id}/validaciones`)).json();
      expect(c.cuenta, etiqueta).toEqual(v.cuenta);
      expect(c.puedeAprobarse, etiqueta).toBe(v.puedeAprobarse);
    }
  });
});

test.describe('estado del documento', () => {
  test.setTimeout(120_000);

  test('GET: cada rol ve el estado y solo "puede" lo que le toca', async ({ page }) => {
    // borrador → revisión: jefatura del departamento y soporte (estado.js, TRANSICIONES).
    const puede = { admin: true, jefe_departamento: true, jefe_estudios: false, docente: false };
    for (const rol of ROLES) {
      await salir(page);
      await entrarComo(page, rol);
      const d = await buscarDocumento(page, { tipo: 'memoria', curso: '2026-27' });
      const j = await (await page.request.get(`/api/documentos/${d._id}/estado`)).json();
      expect(j.estados).toEqual(['borrador', 'revision', 'aprobado']);
      expect(j.marcaDeAgua).toBe(j.estado !== 'aprobado');
      expect(j.alternativa).toBe(false);
      expect(j.estado, 'las pruebas esperan un documento en borrador').toBe('borrador');
      expect(j.transiciones).toHaveLength(1);
      expect(j.transiciones[0]).toMatchObject({ a: 'revision', accion: 'enviar', puede: puede[rol] });
    }
  });

  test('POST: quien no puede recibe 403; el circuito y devolver el documento a como estaba', async ({ page }) => {
    await salir(page);
    await entrarComo(page, 'jefe_departamento');
    const d = await buscarDocumento(page, { tipo: 'memoria', curso: '2025-26' });
    const url = `/api/documentos/${d._id}/estado`;
    const leer = async () => (await (await page.request.get(url)).json()).estado;
    const inicial = await leer();
    expect(inicial, 'las pruebas esperan un documento en borrador').toBe('borrador');
    const poner = (estado) => page.request.post(url, { data: { estado } });

    try {
      // Peticiones que no deben cambiar nada.
      expect((await poner('aprobado')).status(), 'borrador → aprobado no existe').toBe(400);
      expect((await poner('borrador')).status(), 'el mismo estado').toBe(400);
      expect((await poner('inventado')).status()).toBe(400);
      expect((await page.request.post(url, { data: {} })).status()).toBe(400);
      expect(await leer()).toBe('borrador');

      // Quienes no mandan a revisión: docente y jefatura de estudios.
      for (const rol of ['docente', 'jefe_estudios']) {
        await salir(page);
        await entrarComo(page, rol);
        const r = await poner('revision');
        expect(r.status(), `${rol} no manda a revisión`).toBe(403);
        expect((await r.json()).error).toBe('sin_permiso');
      }
      await salir(page);
      await entrarComo(page, 'jefe_departamento');
      expect(await leer(), 'el 403 no debe cambiar nada').toBe('borrador');

      // La jefatura del departamento sí.
      const enviado = await poner('revision');
      expect(enviado.status(), await enviado.text()).toBe(200);
      expect(await enviado.json()).toMatchObject({ estado: 'revision', anterior: 'borrador', accion: 'enviar', marcaDeAgua: true });

      // En revisión, aprobar no lo hacen ni docente ni jefatura de departamento.
      for (const rol of ['docente', 'jefe_departamento']) {
        await salir(page);
        await entrarComo(page, rol);
        expect((await poner('aprobado')).status(), `${rol} no aprueba`).toBe(403);
      }
      // La jefatura de estudios sí, y la puerta de errores decide.
      await salir(page);
      await entrarComo(page, 'jefe_estudios');
      const validaciones = await (await page.request.get(`/api/documentos/${d._id}/validaciones`)).json();
      const aprobar = await poner('aprobado');
      if (validaciones.puedeAprobarse) {
        expect(aprobar.status(), await aprobar.text()).toBe(200);
        expect((await aprobar.json()).marcaDeAgua).toBe(false);
      } else {
        expect(aprobar.status()).toBe(409);
        const j = await aprobar.json();
        expect(j.error).toBe('con_errores');
        expect(j.errores).toBe(validaciones.cuenta.error);
        expect(j.errores).toBe(j.porArreglar + j.delConvenio);
        expect(j.mensaje).toMatch(/No se puede aprobar/);
        expect(await leer()).toBe('revision');
      }
    } finally {
      // Devolverlo a borrador: cada tramo lo hace quien puede.
      await salir(page);
      await entrarComo(page, 'jefe_estudios');
      let actual = await leer();
      if (actual === 'aprobado') {
        await poner('revision');
        actual = await leer();
      }
      if (actual === 'revision') await poner('borrador');
      expect(await leer(), 'el documento tiene que quedar como estaba').toBe(inicial);
    }
  });
});
