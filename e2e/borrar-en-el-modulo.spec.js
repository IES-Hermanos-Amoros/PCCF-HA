// DESTRUIR LO PROPIO DE UN MÓDULO, DESDE LA PANTALLA: volver a la estructura común y borrar para
// siempre un apartado o una casilla que el módulo había creado.
//
// Lo que estas pruebas tienen que demostrar, y no otra cosa:
//
//   · QUE EL VECINO SOBREVIVE. Dos módulos pueden tener la MISMA casilla propia `m_obs` en el mismo
//     apartado común, y el mismo apartado propio con el mismo id, cada uno con su contenido: el id lo
//     acuña cada módulo con SUS ids ocupados (`idDeCampoPropio`). Si el borrado no fuera acotado a la
//     unidad, borrar en el módulo A se llevaría lo escrito en el B. Es el agujero que esto cierra, y por
//     eso todas las pruebas montan los dos módulos y comprueban el B al terminar.
//   · QUE NO SE DESTRUYE SIN DECIRLO. El primer paso es una pregunta al servidor, que contesta cuánto se
//     pierde; la pantalla lo enseña y solo entonces aparece el botón que destruye.
//   · QUE LO COMÚN NO SE BORRA DESDE AQUÍ. Una casilla común que el módulo retiró para sí no lleva botón
//     de borrar: borrarla sería borrarla del documento entero.
//   · QUE NO SE PREGUNTA DE MÁS. Un módulo que solo desviaba etiquetas u orden no pierde nada al volver
//     a la común, y entonces no se pide confirmación: pedirla sin que se pierda nada enseña a confirmar
//     sin leer.
//
// Cada prueba deshace lo suyo en un `finally`, y `controlDeFuga` comprueba al terminar el fichero que la
// base ha quedado como estaba: quien ensucia es quien falla.

const { test, expect } = require('@playwright/test');
const Plantilla = require('../core/plantilla');
const { entrarComo, buscarDocumento, controlDeFuga } = require('./apoyo');

const SEC = 'modulos/metodologia-especifica/estrategias-metodologicas';
const TALLER = 'modulos/m_taller-prueba';
const NIETO = 'modulos/m_taller-prueba/m_fase';
const TITULO_TALLER = 'Taller de prueba';
// Dos módulos de la PD de DAW: el que se reforma y el vecino que no se tiene que tocar.
const A = 'daw-0373';
const B = 'daw-0483';

const campo = (id, etiqueta) => ({ id, tipo: 'texto_largo', etiqueta });
const texto = (s) => [{ type: 'p', text: s }];
const escapar = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const enlace = (doc, seccion, unidad) => `/doc/${doc}/${seccion.split('/').map(encodeURIComponent).join('/')}${unidad ? `?u=${encodeURIComponent(unidad)}` : ''}`;

// La estructura propia que montan las pruebas: una casilla propia en un apartado COMÚN, una casilla
// común retirada por el módulo (que no se puede borrar desde aquí) y un apartado propio con un hijo
// propio dentro. `retirado` marca lo que se podrá borrar: retirar y borrar son dos actos.
const propia = (retirado) => ({
  secciones: {
    [SEC]: {
      campos: { 'tabla-nombre': { retirado: true } },
      anadidos: [{ ...campo('m_obs', 'Observaciones mias'), ...(retirado ? { retirado: true } : {}) }],
      orden: [],
    },
  },
  apartados: {
    cambios: {},
    anadidos: [
      { id: TALLER, titulo: TITULO_TALLER, padre: 'modulos', campos: [campo('m_notas', 'Notas')], ...(retirado ? { retirado: true } : {}) },
      { id: NIETO, titulo: 'Fase', padre: TALLER, campos: [campo('m_fase_texto', 'Texto de la fase')] },
    ],
    orden: {},
  },
});

// Solo etiquetas y orden de lo común: un desvío que no tiene nada propio que perder.
const soloComun = () => ({
  secciones: { [SEC]: { campos: { 'tabla-nombre': { etiqueta: 'Como lo llamo yo' } }, anadidos: [], orden: [] } },
});

function ayudas(page, doc) {
  const ruta = (u) => `/api/documentos/${doc}/unidades/${encodeURIComponent(u)}/estructura`;
  const leer = async (u) => (await (await page.request.get(ruta(u))).json());
  const poner = async (u, estructura, confirmar = true) => {
    const l = await leer(u);
    const r = await page.request.put(ruta(u), { data: { estructura, confirmar, esperaUpdatedAt: l.updatedAt } });
    return r;
  };
  const valores = async (seccion, u) => {
    const r = await page.request.get(`/api/documentos/${doc}/apartado?seccion=${encodeURIComponent(seccion)}&unidad=${encodeURIComponent(u)}`);
    return (await r.json()).valores || {};
  };
  const escribir = async (seccion, u, vals) => {
    const g = await (await page.request.get(`/api/documentos/${doc}/apartado?seccion=${encodeURIComponent(seccion)}&unidad=${encodeURIComponent(u)}`)).json();
    const w = await page.request.patch(`/api/documentos/${doc}/apartado?seccion=${encodeURIComponent(seccion)}&unidad=${encodeURIComponent(u)}`,
      { data: { valores: vals, esperaUpdatedAt: g.updatedAt === undefined ? null : g.updatedAt } });
    expect(w.status(), await w.text()).toBe(200);
  };
  // Los dos módulos con lo mismo y con contenido escrito dentro. `retirado` deja listo lo que se borrará.
  const montarLosDos = async (retirado) => {
    for (const u of [A, B]) {
      const r = await poner(u, propia(false));
      expect(r.status(), `montar ${u}: ${await r.text()}`).toBe(200);
      await escribir(SEC, u, { m_obs: texto(`observacion de ${u}`) });
      await escribir(TALLER, u, { m_notas: texto(`notas de ${u}`) });
      await escribir(NIETO, u, { m_fase_texto: texto(`fase de ${u}`) });
    }
    if (retirado) {
      const r = await poner(A, propia(true));
      expect(r.status(), `retirar en ${A}: ${await r.text()}`).toBe(200);
    }
  };
  // Lo que el vecino tenía: intacto, siempre. Es la comprobación que da sentido a todo lo demás.
  const elVecinoSigueIgual = async () => {
    expect((await valores(SEC, B)).m_obs, 'la casilla propia del otro módulo').toEqual(texto(`observacion de ${B}`));
    expect((await valores(TALLER, B)).m_notas, 'el apartado propio del otro módulo').toEqual(texto(`notas de ${B}`));
    expect((await valores(NIETO, B)).m_fase_texto, 'el hijo del apartado propio del otro módulo').toEqual(texto(`fase de ${B}`));
  };
  const limpiar = async () => {
    for (const u of [A, B]) {
      const l = await leer(u);
      if (l.estructura) {
        const r = await poner(u, null);
        expect([200, 400], `no se ha podido devolver ${u} a la común: ${await r.text()}`).toContain(r.status());
      }
    }
  };
  return { leer, poner, valores, escribir, montarLosDos, elVecinoSigueIgual, limpiar };
}

// La tarjeta de estructura de un apartado de módulo puede arrancar mirando a la plantilla común. Lo que
// esta prueba necesita es el modo módulo, que es donde viven los controles del desvío.
async function enModoModulo(page) {
  // Para quien puede cambiar el documento entero la tarjeta arranca mirando a la PLANTILLA COMÚN
  // (`destinoDeLaEscritura`): el modo módulo es un gesto suyo. El grupo de radios solo aparece cuando el
  // servidor ha contestado el permiso del módulo, así que se espera a que esté una de las dos cosas —el
  // grupo, o ya la lista del módulo para quien no tiene nada que elegir— antes de pulsar nada. Mirar una
  // sola vez al cargar pilla un estado de paso y la prueba falla por el motivo que no es.
  const grupo = page.getByRole('group', { name: '¿A quién se aplica el cambio?' });
  const lista = page.getByRole('list', { name: /^Campos quitados de/ });
  await expect(grupo.or(lista).first()).toBeVisible();
  if (await grupo.count()) {
    const soloEste = grupo.getByRole('radio').nth(1);
    if (!(await soloEste.isChecked())) await soloEste.check();
  }
  await expect(lista).toBeVisible();
}

test.describe('destruir lo propio de un módulo, desde la pantalla', () => {
  controlDeFuga(test);
  test.describe.configure({ mode: 'serial' });

  test('una casilla propia se borra para siempre, y la del otro módulo con el mismo id sobrevive', async ({ page }) => {
    test.setTimeout(180000);
    await entrarComo(page, 'admin');
    const doc = await buscarDocumento(page, { tipo: 'programacion_didactica', ciclo: 'daw', curso: '2026-27' });
    const h = ayudas(page, doc._id);
    try {
      await h.montarLosDos(true);

      await page.goto(enlace(doc._id, SEC, A));
      await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible();
      await enModoModulo(page);

      const quitados = page.getByRole('list', { name: /^Campos quitados de/ });

      // LA CASILLA COMÚN que el módulo retiró no se borra desde aquí, y la pantalla dice por qué.
      const filaComun = quitados.getByRole('listitem').filter({ hasText: 'Nombre' });
      await expect(filaComun.getByText('Es común a todos los módulos')).toBeVisible();
      await expect(filaComun.getByRole('button', { name: /^Borrar para siempre/ })).toHaveCount(0);

      // LA CASILLA PROPIA sí, y el aviso dice que tiene algo escrito ANTES de que aparezca el botón.
      const filaPropia = quitados.getByRole('listitem').filter({ hasText: 'Observaciones mias' });
      await filaPropia.getByRole('button', { name: /^Borrar para siempre la casilla «Observaciones mias»/ }).click();
      const aviso = page.getByRole('group', { name: /^Borrar para siempre la casilla «Observaciones mias»/ });
      await expect(aviso).toBeVisible();
      await expect(aviso).toContainText('Solo en este módulo, en ningún otro');
      await expect(aviso).toContainText('Tiene algo escrito dentro');
      await aviso.getByRole('button', { name: /^Sí, borrar la casilla «Observaciones mias»/ }).click();

      await expect.poll(async () => 'm_obs' in (await h.valores(SEC, A)),
        { message: 'la casilla propia tiene que haberse borrado' }).toBe(false);
      // Lo común de ese mismo apartado en ese mismo módulo no se toca.
      expect(Object.keys(await h.valores(SEC, A)).some((k) => !k.startsWith('m_')), 'lo común del módulo sigue').toBe(true);
      await h.elVecinoSigueIgual();
    } finally {
      await h.limpiar();
    }
  });

  test('un apartado propio se borra escribiendo su título, con su subapartado y su contenido', async ({ page }) => {
    test.setTimeout(180000);
    await entrarComo(page, 'admin');
    const doc = await buscarDocumento(page, { tipo: 'programacion_didactica', ciclo: 'daw', curso: '2026-27' });
    const h = ayudas(page, doc._id);
    try {
      await h.montarLosDos(true);

      await page.goto(enlace(doc._id, 'modulos', A));
      await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible();
      const lista = page.getByRole('list', { name: 'Apartados retirados de este módulo' });
      await expect(lista).toBeVisible();

      const fila = lista.getByRole('listitem').filter({ hasText: TITULO_TALLER });
      await expect(fila).toHaveCount(1);
      await fila.getByRole('button', { name: new RegExp(`^Borrar para siempre «${escapar(TITULO_TALLER)}» de este módulo`) }).click();

      const forma = page.getByRole('form', { name: new RegExp(`^Borrar «${escapar(TITULO_TALLER)}» para siempre de este módulo`) });
      await expect(forma).toBeVisible();
      await expect(forma).toContainText('solo de este módulo');
      // El recuento llega del servidor, y hasta que llega el botón no se enciende.
      const confirmar = forma.getByRole('button', { name: `Borrar «${TITULO_TALLER}» para siempre` });
      await forma.getByLabel(/^Para borrarlo, escribe/).fill(Plantilla.loQueHayQueEscribir(TITULO_TALLER));
      await expect(confirmar).toBeEnabled();
      await confirmar.click();

      await expect.poll(async () => {
        const e = (await h.leer(A)).estructura;
        const ids = e && e.apartados ? (e.apartados.anadidos || []).map((x) => x.id) : [];
        return ids.includes(TALLER) || ids.includes(NIETO);
      }, { message: 'el apartado propio y su hijo tienen que haberse ido de la estructura' }).toBe(false);
      expect((await h.valores(TALLER, A)).m_notas, 'lo escrito en el apartado propio').toBeUndefined();
      expect((await h.valores(NIETO, A)).m_fase_texto, 'lo escrito en su hijo').toBeUndefined();
      await h.elVecinoSigueIgual();
    } finally {
      await h.limpiar();
    }
  });

  test('volver a la estructura común dice cuánto se pierde, y al confirmar lo destruye', async ({ page }) => {
    test.setTimeout(180000);
    await entrarComo(page, 'admin');
    const doc = await buscarDocumento(page, { tipo: 'programacion_didactica', ciclo: 'daw', curso: '2026-27' });
    const h = ayudas(page, doc._id);
    try {
      await h.montarLosDos(false);

      await page.goto(enlace(doc._id, 'modulos', A));
      await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.getByRole('heading', { level: 2, name: 'Estructura de este módulo' })).toBeVisible();
      await page.getByRole('button', { name: 'Volver este módulo a la estructura común' }).click();

      const aviso = page.getByRole('group', { name: 'Volver este módulo a la estructura común' });
      await expect(aviso).toBeVisible();
      // Lo que se pierde se dice con números, no con un «¿seguro?».
      await expect(aviso).toContainText(/apartado|casilla/);
      await aviso.getByRole('button', { name: 'Sí, volver a la estructura común' }).click();

      await expect.poll(async () => (await h.leer(A)).estructura,
        { message: 'el módulo tiene que haber vuelto a la estructura común' }).toBeNull();
      expect((await h.valores(SEC, A)).m_obs, 'la casilla propia').toBeUndefined();
      expect((await h.valores(TALLER, A)).m_notas, 'el apartado propio').toBeUndefined();
      await h.elVecinoSigueIgual();
    } finally {
      await h.limpiar();
    }
  });

  test('un módulo que solo desviaba lo común vuelve sin pedir confirmación: no hay nada que perder', async ({ page }) => {
    test.setTimeout(180000);
    await entrarComo(page, 'admin');
    const doc = await buscarDocumento(page, { tipo: 'programacion_didactica', ciclo: 'daw', curso: '2026-27' });
    const h = ayudas(page, doc._id);
    try {
      const r = await h.poner(A, soloComun());
      expect(r.status(), await r.text()).toBe(200);

      await page.goto(enlace(doc._id, 'modulos', A));
      await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.getByRole('heading', { level: 2, name: 'Estructura de este módulo' })).toBeVisible();
      await page.getByRole('button', { name: 'Volver este módulo a la estructura común' }).click();

      // Ni confirmación ni pregunta: ya está hecho.
      await expect.poll(async () => (await h.leer(A)).estructura,
        { message: 'sin nada propio que perder, volver a la común se hace sin confirmar' }).toBeNull();
      await expect(page.getByRole('group', { name: 'Volver este módulo a la estructura común' })).toHaveCount(0);
    } finally {
      await h.limpiar();
    }
  });
});
