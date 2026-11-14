// LA ESTRUCTURA, DESDE LA PANTALLA: LO QUE EL SERVIDOR YA SABÍA HACER, AHORA QUIEN PUEDE LO VE Y LO USA.
//
// Es la hermana de e2e/estructura-propia.spec.js (la misma regla, por la API) y de
// e2e/pantallas-recorrido.spec.js (la interfaz): aquí se PULSA. Se abre un apartado en el navegador, se
// ven los controles y se usan. Las pruebas por la API ya fijan quién recibe 403; estas fijan que la
// pantalla le enseña a cada cual lo que le corresponde, y A DÓNDE VA lo que pulsa:
//
//   · quien lleva un módulo ve los controles de SU apartado y retira un campo → solo cambia ese módulo
//   · EL OTRO MÓDULO NO HA CAMBIADO (su estructura, su apartado, la versión de la plantilla): es lo que
//     de verdad hay que demostrar, porque si el cambio fuera por la ruta de la plantilla saldría en todos
//   · un docente sin nada asignado no ve los controles en ese mismo apartado
//   · la jefatura de estudios no los ve
//   · la jefatura del departamento sí, y la pantalla le dice el alcance (los N módulos y a cuántas
//     personas) ANTES de confirmar; puede elegir «solo este módulo»
//   · quien tiene asignado un apartado común lo ve, con el alcance del documento entero
//
// Cada prueba deshace lo que toca en un `finally`: el módulo vuelve a la estructura común y el reparto de
// docentes y de apartados, a como estaba. Y al terminar cada una se comprueba que la base ha quedado
// igual que al empezar (`huellaDeLaBase`), porque una prueba que falla a medias y deja rastro hace fallar
// a las demás.

const { test, expect } = require('@playwright/test');
const {
  entrarComo, salir, personas, q, leerJson, elegirApartadoDeModulo, docentesDeUnidad, fijarDocentes, huellaDeLaBase,
} = require('./apoyo');

const escapar = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const rutaDelModulo = (doc, unidad, consulta = '') => `/api/documentos/${doc}/unidades/${encodeURIComponent(unidad)}/estructura${consulta}`;

// El enlace de un apartado, tal como lo escribe la pantalla: /doc/<id>/<seccion>?u=<unidad>.
function enlace(doc, seccion, unidad) {
  const ruta = seccion.split('/').map(encodeURIComponent).join('/');
  return `/doc/${doc}/${ruta}${unidad ? `?u=${encodeURIComponent(unidad)}` : ''}`;
}

// El título de la tarjeta de estructura: solo está si la pantalla la ofrece.
const tarjeta = (page) => page.getByRole('heading', { level: 2, name: 'Estructura', exact: true });
const alcanceDicho = (page) => page.getByRole('note', { name: 'Alcance del cambio' });
const botonQuitar = (page, etiqueta) => page.getByRole('button', { name: new RegExp(`^Quitar el campo «${escapar(etiqueta)}»`) });

// Lo que ve cada módulo de un apartado: sus campos, con su estado. Es lo que se compara antes y después.
async function camposVistos(page, doc, seccion, unidad) {
  const ap = await leerJson(await page.request.get(`/api/documentos/${doc}/apartado?${q({ seccion, unidad })}`));
  return JSON.stringify((ap.campos || []).map((c) => [c.id, c.etiqueta, !!c.retirado]));
}

async function fotoDeLosModulos(page, doc, unidades) {
  const foto = {};
  for (const u of unidades) foto[u] = JSON.stringify((await leerJson(await page.request.get(rutaDelModulo(doc, u)))).estructura);
  return foto;
}

// La respuesta de «¿puedo cambiar este apartado?» que la pantalla pide al abrirlo. Hay que esperarla: sin
// ella, «no se ve la tarjeta» sería verdad solo porque todavía no ha llegado.
const esperarPermiso = (page) => page.waitForResponse((r) => /\/estructura\?seccion=/.test(r.url()) && r.status() === 200);

test.describe('la estructura desde la pantalla', () => {
  test('quien lleva un módulo retira un campo pulsando, y el otro módulo no cambia', async ({ page }) => {
    test.setTimeout(180_000);
    await salir(page);
    await entrarComo(page, 'jefe_departamento');
    const { doc, mio, ajeno, campo, unidades } = await elegirApartadoDeModulo(page);
    const lucia = (await personas(page)).find((p) => p.nombre.includes('Lucía'));
    const antesDeTodo = await huellaDeLaBase(page, doc._id);
    const docentesAntes = await docentesDeUnidad(page, doc._id, mio.unidadId);
    const plantillaAntes = (await leerJson(await page.request.get(`/api/documentos/${doc._id}/estructura`))).plantillaVersion;

    try {
      await fijarDocentes(page, doc._id, mio.unidadId, [lucia._id]);
      const modulosAntes = await fotoDeLosModulos(page, doc._id, unidades);
      const ajenoAntes = await camposVistos(page, doc._id, ajeno.seccion, ajeno.unidadId);
      const mioAntes = await camposVistos(page, doc._id, mio.seccion, mio.unidadId);
      expect(mioAntes, 'el campo que se va a quitar está en los dos módulos').toContain(campo.id);
      expect(ajenoAntes).toContain(campo.id);

      await salir(page);
      await entrarComo(page, 'docente', lucia.nombre);
      const permiso = esperarPermiso(page);
      await page.goto(enlace(doc._id, mio.seccion, mio.unidadId));
      await permiso;

      // Ve la tarjeta, y la pantalla dice el alcance ANTES de tocar nada: solo este módulo.
      await expect(tarjeta(page)).toBeVisible();
      await expect(alcanceDicho(page)).toContainText(/Esto cambia solo este módulo y afecta a 1 persona/);
      await expect(alcanceDicho(page)).toContainText('Lucía');

      // Lo que es del documento entero no se le ofrece: ni título, ni subapartados, ni orden, ni retirar.
      await expect(page.getByLabel('Título del apartado')).toHaveCount(0);
      await expect(page.getByLabel('Añadir un subapartado')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'retirar del documento' })).toHaveCount(0);

      // Retira un campo pulsando. La confirmación repite el alcance antes del «sí».
      await botonQuitar(page, campo.etiqueta).click();
      const confirmacion = page.getByRole('group', { name: new RegExp(`^Quitar el campo «${escapar(campo.etiqueta)}»`) });
      await expect(confirmacion).toContainText(/Esto cambia solo este módulo/);
      await confirmacion.getByRole('button', { name: new RegExp(`^Sí, quitar «${escapar(campo.etiqueta)}»`) }).click();
      await expect(page.getByText(/quitado de «/)).toBeVisible();
      await expect(botonQuitar(page, campo.etiqueta)).toHaveCount(0);

      // El cambio está en SU módulo…
      expect(await camposVistos(page, doc._id, mio.seccion, mio.unidadId)).not.toBe(mioAntes);
      const suya = (await leerJson(await page.request.get(rutaDelModulo(doc._id, mio.unidadId)))).estructura;
      expect(suya.secciones[mio.seccion].campos[campo.id].retirado).toBe(true);

      // …y EL OTRO MÓDULO NO HA CAMBIADO: ni su apartado, ni su estructura, ni la de ninguno de los demás.
      expect(await camposVistos(page, doc._id, ajeno.seccion, ajeno.unidadId), 'el apartado del otro módulo').toBe(ajenoAntes);
      const despues = await fotoDeLosModulos(page, doc._id, unidades);
      for (const u of unidades.filter((x) => x !== mio.unidadId)) {
        expect(despues[u], `el módulo ${u} ha cambiado y no era el del docente`).toBe(modulosAntes[u]);
      }
      expect((await leerJson(await page.request.get(`/api/documentos/${doc._id}/estructura`))).plantillaVersion, 'la plantilla común no se toca').toBe(plantillaAntes);

      // Lo devuelve también pulsando: «Restaurar» está en el mismo módulo y lo deja como la común.
      await page.getByRole('button', { name: new RegExp(`^Restaurar el campo «${escapar(campo.etiqueta)}»`) }).click();
      await expect(page.getByText(/devuelto a «/)).toBeVisible();
      expect(await camposVistos(page, doc._id, mio.seccion, mio.unidadId)).toBe(mioAntes);
    } finally {
      await salir(page);
      await entrarComo(page, 'jefe_departamento');
      const v = await leerJson(await page.request.get(rutaDelModulo(doc._id, mio.unidadId)));
      if (v.estructura) {
        const quita = await page.request.put(rutaDelModulo(doc._id, mio.unidadId), { data: { estructura: null } });
        expect(quita.status(), `no se ha podido devolver el módulo a la común: ${await quita.text()}`).toBe(200);
      }
      await fijarDocentes(page, doc._id, mio.unidadId, docentesAntes);
    }
    expect(await huellaDeLaBase(page, doc._id), 'la base tiene que quedar como estaba').toEqual(antesDeTodo);
  });

  test('un docente sin nada asignado no ve los controles en ese mismo apartado', async ({ page }) => {
    test.setTimeout(120_000);
    await salir(page);
    await entrarComo(page, 'jefe_departamento');
    const { doc, mio } = await elegirApartadoDeModulo(page);
    const antesDeTodo = await huellaDeLaBase(page, doc._id);
    expect(antesDeTodo.unidadesConDocente, 'esta prueba parte de un reparto vacío').toEqual([]);

    await salir(page);
    await entrarComo(page, 'docente', 'Nerea');
    const permiso = esperarPermiso(page);
    await page.goto(enlace(doc._id, mio.seccion, mio.unidadId));
    await permiso;
    // El apartado se ha abierto (se ve en solo lectura) y la tarjeta no está.
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('tree')).toBeVisible();
    await expect(tarjeta(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Quitar el campo/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Añadir un campo/ })).toHaveCount(0);

    await salir(page);
    await entrarComo(page, 'jefe_departamento');
    expect(await huellaDeLaBase(page, doc._id)).toEqual(antesDeTodo);
  });

  test('la jefatura de estudios no ve los controles', async ({ page }) => {
    test.setTimeout(120_000);
    await salir(page);
    await entrarComo(page, 'jefe_departamento');
    const { doc, mio } = await elegirApartadoDeModulo(page);
    const antesDeTodo = await huellaDeLaBase(page, doc._id);

    await salir(page);
    await entrarComo(page, 'jefe_estudios');
    const permiso = esperarPermiso(page);
    await page.goto(enlace(doc._id, mio.seccion, mio.unidadId));
    await permiso;
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible();
    await expect(tarjeta(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Quitar el campo/ })).toHaveCount(0);

    await salir(page);
    await entrarComo(page, 'jefe_departamento');
    expect(await huellaDeLaBase(page, doc._id)).toEqual(antesDeTodo);
  });

  test('la jefatura del departamento ve el alcance de los N módulos antes de confirmar, y puede acotarlo a uno', async ({ page }) => {
    test.setTimeout(180_000);
    await salir(page);
    await entrarComo(page, 'jefe_departamento');
    const { doc, mio, campo, unidades } = await elegirApartadoDeModulo(page);
    const lucia = (await personas(page)).find((p) => p.nombre.includes('Lucía'));
    const antesDeTodo = await huellaDeLaBase(page, doc._id);
    const docentesAntes = await docentesDeUnidad(page, doc._id, mio.unidadId);
    const modulosAntes = await fotoDeLosModulos(page, doc._id, unidades);
    const plantillaAntes = (await leerJson(await page.request.get(`/api/documentos/${doc._id}/estructura`))).plantillaVersion;

    try {
      // Para que haya a quién afecte: una persona lleva este módulo.
      await fijarDocentes(page, doc._id, mio.unidadId, [lucia._id]);
      const permiso = esperarPermiso(page);
      await page.goto(enlace(doc._id, mio.seccion, mio.unidadId));
      await permiso;
      await expect(tarjeta(page)).toBeVisible();

      // Por omisión es lo que hacía siempre: cambia la plantilla, los N módulos. Y lo dice, con números.
      await expect(alcanceDicho(page)).toContainText(new RegExp(`Esto cambia los ${unidades.length} módulos y afecta a 1 persona`));
      await expect(alcanceDicho(page)).toContainText('Lucía');

      // La confirmación del cambio lo repite ANTES del «sí», y se cancela: no se escribe nada.
      await botonQuitar(page, campo.etiqueta).click();
      const confirmacion = page.getByRole('group', { name: new RegExp(`^Quitar el campo «${escapar(campo.etiqueta)}»`) });
      await expect(confirmacion).toContainText(new RegExp(`Esto cambia los ${unidades.length} módulos y afecta a 1 persona`));
      await expect(confirmacion.getByRole('button', { name: new RegExp(`^Sí, quitar «${escapar(campo.etiqueta)}»`) })).toBeVisible();
      await confirmacion.getByRole('button', { name: 'Cancelar' }).click();
      await expect(confirmacion).toHaveCount(0);

      // Elegir «solo este módulo» cambia el alcance que se dice, y con él a dónde irá la escritura.
      await page.getByRole('radio', { name: 'Solo a este módulo' }).check();
      await expect(alcanceDicho(page)).toContainText(/Esto cambia solo este módulo/);
      await expect(page.getByLabel('Título del apartado')).toHaveCount(0);
      await page.getByRole('radio', { name: /A todos/ }).check();
      await expect(alcanceDicho(page)).toContainText(new RegExp(`Esto cambia los ${unidades.length} módulos`));
      await expect(page.getByLabel('Título del apartado')).toBeVisible();

      // Nada de esto ha escrito: ni estructura propia, ni versión nueva de la plantilla.
      expect(await fotoDeLosModulos(page, doc._id, unidades)).toEqual(modulosAntes);
      expect((await leerJson(await page.request.get(`/api/documentos/${doc._id}/estructura`))).plantillaVersion).toBe(plantillaAntes);
    } finally {
      await fijarDocentes(page, doc._id, mio.unidadId, docentesAntes);
    }
    expect(await huellaDeLaBase(page, doc._id), 'la base tiene que quedar como estaba').toEqual(antesDeTodo);
  });

  test('quien tiene asignado un apartado común lo configura y la pantalla le dice que es del documento entero', async ({ page }) => {
    test.setTimeout(180_000);
    await salir(page);
    await entrarComo(page, 'jefe_departamento');
    const { doc, unidades } = await elegirApartadoDeModulo(page);
    const lucia = (await personas(page)).find((p) => p.nombre.includes('Lucía'));
    const antesDeTodo = await huellaDeLaBase(page, doc._id);

    // Un apartado común con un campo que se pueda quitar.
    const estructura = await leerJson(await page.request.get(`/api/documentos/${doc._id}/estructura`));
    const asg = await leerJson(await page.request.get(`/api/documentos/${doc._id}/asignaciones`));
    const fila = estructura.apartados.find((a) => !a.deUnidades && !a.instancias && !a.retirado && !a.repetidor
      && asg.apartados.some((x) => x.seccion === a.seccion)
      && a.campos.some((c) => c.puedeRetirar && !c.retirado));
    expect(fila, 'hace falta un apartado común con un campo que se pueda quitar').toBeTruthy();
    const campo = fila.campos.find((c) => c.puedeRetirar && !c.retirado);
    const asignadosAntes = asg.apartados.find((x) => x.seccion === fila.seccion).personas;
    const plantillaAntes = estructura.plantillaVersion;

    try {
      const puesto = await page.request.put(`/api/documentos/${doc._id}/asignaciones?${q({ seccion: fila.seccion })}`, { data: { personas: [lucia._id] } });
      expect(puesto.status(), await puesto.text()).toBeLessThan(400);

      await salir(page);
      await entrarComo(page, 'docente', lucia.nombre);
      const permiso = esperarPermiso(page);
      await page.goto(enlace(doc._id, fila.seccion, null));
      await permiso;

      await expect(tarjeta(page)).toBeVisible();
      // Un apartado común es del documento entero: lo dice con el número delante, sin esconderlo.
      await expect(alcanceDicho(page)).toContainText(new RegExp(`Esto cambia los ${unidades.length} módulos y afecta a 1 persona`));
      // Ve lo que puede configurar (los campos y el título) y no lo que decide qué apartados hay.
      await expect(page.getByRole('button', { name: /^Añadir un campo/ })).toBeVisible();
      await expect(page.getByLabel('Título del apartado')).toBeVisible();
      await expect(page.getByLabel('Añadir un subapartado')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'retirar del documento' })).toHaveCount(0);

      // Antes de quitar un campo, la confirmación repite el alcance. Se cancela: no se escribe nada.
      await botonQuitar(page, campo.etiqueta).click();
      const confirmacion = page.getByRole('group', { name: new RegExp(`^Quitar el campo «${escapar(campo.etiqueta)}»`) });
      await expect(confirmacion).toContainText(new RegExp(`Esto cambia los ${unidades.length} módulos y afecta a 1 persona`));
      await confirmacion.getByRole('button', { name: 'Cancelar' }).click();
      expect((await leerJson(await page.request.get(`/api/documentos/${doc._id}/estructura`))).plantillaVersion).toBe(plantillaAntes);
    } finally {
      await salir(page);
      await entrarComo(page, 'jefe_departamento');
      await page.request.put(`/api/documentos/${doc._id}/asignaciones?${q({ seccion: fila.seccion })}`, { data: { personas: asignadosAntes } });
    }
    expect(await huellaDeLaBase(page, doc._id), 'la base tiene que quedar como estaba').toEqual(antesDeTodo);
  });
});
