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
//   · quien tiene asignado un apartado común lo ve, con el alcance del documento entero, Y USA las
//     operaciones del apartado (retirarlo y restaurarlo), porque «el documento es totalmente
//     configurable por quien tiene permisos en ese apartado, sea cual sea el apartado»
//   · quien lleva un módulo retira un APARTADO ENTERO de su módulo pulsando, y el otro módulo no cambia
//     (su árbol, su apartado y la versión de la plantilla): es lo que demuestra que no se fue por la ruta
//     de la plantilla, que lo habría quitado de los once
//
// Cada prueba deshace lo que toca en un `finally`: el módulo vuelve a la estructura común y el reparto de
// docentes y de apartados, a como estaba. Y al terminar cada una se comprueba que la base ha quedado
// igual que al empezar (`huellaDeLaBase`), porque una prueba que falla a medias y deja rastro hace fallar
// a las demás.

const { test, expect } = require('@playwright/test');
const JSZip = require('jszip');
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

      // Las operaciones del apartado las ve, pero EN SU MÓDULO: el botón dice «de este módulo», nunca «del
      // documento», que es lo que cambiaría los once.
      await expect(page.getByLabel('Título del apartado')).toBeVisible();
      await expect(page.getByLabel('Añadir un subapartado')).toBeVisible();
      await expect(page.getByRole('button', { name: 'retirar de este módulo' })).toBeVisible();
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
    // Ni las operaciones del apartado, ni las de su módulo, ni las del documento.
    await expect(page.getByRole('button', { name: 'retirar de este módulo' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'retirar del documento' })).toHaveCount(0);
    await expect(page.getByLabel('Añadir un subapartado')).toHaveCount(0);
    await expect(page.getByLabel('Título del apartado')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^↑ subir/ })).toHaveCount(0);

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
      // Con «solo este módulo», retirar y mover son de ese módulo: el botón lo dice, y el del documento no está.
      await expect(page.getByRole('button', { name: 'retirar de este módulo' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'retirar del documento' })).toHaveCount(0);
      await page.getByRole('radio', { name: /A todos/ }).check();
      await expect(alcanceDicho(page)).toContainText(new RegExp(`Esto cambia los ${unidades.length} módulos`));
      await expect(page.getByRole('button', { name: 'retirar del documento' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'retirar de este módulo' })).toHaveCount(0);
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
      // Ve todo lo que puede hacer con SU apartado: los campos, el título, los subapartados, moverlo y
      // retirarlo. Lo dice el servidor para este apartado, no el permiso del documento entero.
      await expect(page.getByRole('button', { name: /^Añadir un campo/ })).toBeVisible();
      await expect(page.getByLabel('Título del apartado')).toBeVisible();
      await expect(page.getByLabel('Añadir un subapartado')).toBeVisible();
      await expect(page.getByRole('button', { name: 'retirar del documento' })).toBeVisible();

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

  test('quien tiene asignado un apartado común lo retira pulsando, y lo restaura desde la portada', async ({ page }) => {
    test.setTimeout(180_000);
    await salir(page);
    await entrarComo(page, 'jefe_departamento');
    const { doc, unidades } = await elegirApartadoDeModulo(page);
    const lucia = (await personas(page)).find((p) => p.nombre.includes('Lucía'));
    const antesDeTodo = await huellaDeLaBase(page, doc._id);

    // Un apartado común sin subapartados: retirarlo no se lleva a nadie más por delante.
    const estructura = await leerJson(await page.request.get(`/api/documentos/${doc._id}/estructura`));
    const asg = await leerJson(await page.request.get(`/api/documentos/${doc._id}/asignaciones`));
    const fila = estructura.apartados.find((a) => !a.deUnidades && !a.instancias && !a.retirado && !a.repetidor
      && a.hijos === 0 && a.admiteHijos && asg.apartados.some((x) => x.seccion === a.seccion));
    expect(fila, 'hace falta un apartado común sin subapartados que se pueda asignar').toBeTruthy();
    const asignadosAntes = asg.apartados.find((x) => x.seccion === fila.seccion).personas;
    const enLaPlantilla = async () => (await leerJson(await page.request.get(`/api/documentos/${doc._id}/estructura`)))
      .apartados.find((a) => a.seccion === fila.seccion);

    try {
      const puesto = await page.request.put(`/api/documentos/${doc._id}/asignaciones?${q({ seccion: fila.seccion })}`, { data: { personas: [lucia._id] } });
      expect(puesto.status(), await puesto.text()).toBeLessThan(400);

      await salir(page);
      await entrarComo(page, 'docente', lucia.nombre);
      const permiso = esperarPermiso(page);
      await page.goto(enlace(doc._id, fila.seccion, null));
      await permiso;
      await expect(tarjeta(page)).toBeVisible();

      // Retira pulsando. Antes del «sí», la confirmación dice el alcance con el número delante.
      await page.getByRole('button', { name: 'retirar del documento' }).click();
      const confirmacion = page.getByRole('group', { name: 'Retirar el apartado' });
      await expect(confirmacion).toContainText(new RegExp(`Esto cambia los ${unidades.length} módulos y afecta a 1 persona`));
      await expect(confirmacion).toContainText('No se borra nada');
      await page.getByRole('button', { name: /^sí, retirarlo/ }).click();
      await expect(page.getByText(/El apartado se ha retirado del documento/)).toBeVisible();
      expect((await enLaPlantilla()).retirado, 'el apartado tiene que haber quedado retirado').toBe(true);

      // Lo restaura desde la portada, donde la lista le ofrece SOLO lo que el servidor le deja devolver.
      await page.goto(`/doc/${doc._id}`);
      await expect(page.getByRole('heading', { level: 2, name: 'Apartados retirados', exact: true })).toBeVisible();
      await page.getByRole('button', { name: `Restaurar «${fila.titulo}» en el documento` }).click();
      await expect.poll(async () => (await enLaPlantilla()).retirado, { message: 'el apartado tiene que volver' }).toBe(false);
    } finally {
      await salir(page);
      await entrarComo(page, 'jefe_departamento');
      const ahora = await enLaPlantilla();
      if (ahora && ahora.retirado) {
        const v = (await leerJson(await page.request.get(`/api/documentos/${doc._id}/estructura`))).plantillaVersion;
        const vuelve = await page.request.post(`/api/documentos/${doc._id}/estructura/apartado/restaurar?${q({ seccion: fila.seccion })}`, { data: { esperaPlantillaVersion: v } });
        expect(vuelve.status(), `no se ha podido restaurar el apartado: ${await vuelve.text()}`).toBe(200);
      }
      await page.request.put(`/api/documentos/${doc._id}/asignaciones?${q({ seccion: fila.seccion })}`, { data: { personas: asignadosAntes } });
    }
    expect(await huellaDeLaBase(page, doc._id), 'la base tiene que quedar como estaba').toEqual(antesDeTodo);
  });

  test('quien lleva un módulo retira un apartado entero de SU módulo pulsando, y el otro módulo no cambia', async ({ page }) => {
    test.setTimeout(180_000);
    await salir(page);
    await entrarComo(page, 'jefe_departamento');
    const { doc, mio, ajeno, unidades } = await elegirApartadoDeModulo(page);
    const lucia = (await personas(page)).find((p) => p.nombre.includes('Lucía'));
    const antesDeTodo = await huellaDeLaBase(page, doc._id);
    const docentesAntes = await docentesDeUnidad(page, doc._id, mio.unidadId);

    // Un apartado de módulo sin subapartados, que los dos módulos tengan.
    const estructura = await leerJson(await page.request.get(`/api/documentos/${doc._id}/estructura`));
    const fila = estructura.apartados.find((a) => a.deUnidades && !a.instancias && !a.retirado && !a.repetidor
      && a.hijos === 0 && a.puedeSubir && a.puedeBajar);
    expect(fila, 'hace falta un apartado de módulo sin subapartados').toBeTruthy();
    const plantillaAntes = estructura.plantillaVersion;

    // El árbol que ve cada módulo: los apartados que tiene, en su orden. Es el árbol, no el apartado.
    const arbolDe = async (unidad) => {
      const { arbol } = await leerJson(await page.request.get(`/api/documentos/${doc._id}/arbol`));
      const vistos = [];
      (function bajar(n) {
        if (!n || typeof n !== 'object') return;
        if (n.unidadId === unidad && n.seccion) vistos.push(n.seccion);
        (n.hijos || []).forEach(bajar);
      })(arbol);
      return vistos;
    };

    try {
      await fijarDocentes(page, doc._id, mio.unidadId, [lucia._id]);
      const modulosAntes = await fotoDeLosModulos(page, doc._id, unidades);
      const arbolMioAntes = await arbolDe(mio.unidadId);
      const arbolAjenoAntes = await arbolDe(ajeno.unidadId);
      const apartadoAjenoAntes = await camposVistos(page, doc._id, fila.seccion, ajeno.unidadId);
      expect(arbolMioAntes, 'el apartado está en el módulo del docente').toContain(fila.seccion);
      expect(arbolAjenoAntes, 'el apartado está en el otro módulo').toContain(fila.seccion);

      await salir(page);
      await entrarComo(page, 'docente', lucia.nombre);
      const permiso = esperarPermiso(page);
      await page.goto(enlace(doc._id, fila.seccion, mio.unidadId));
      await permiso;
      await expect(tarjeta(page)).toBeVisible();

      // Retira el apartado entero pulsando. El alcance, ANTES del «sí» y con el número delante: es solo este.
      await page.getByRole('button', { name: 'retirar de este módulo' }).click();
      const confirmacion = page.getByRole('group', { name: 'Retirar el apartado' });
      await expect(confirmacion).toContainText(/Esto cambia solo este módulo y afecta a 1 persona/);
      await expect(confirmacion).toContainText('No se borra nada');
      await page.getByRole('button', { name: /^sí, retirarlo de este módulo/ }).click();
      await expect(page.getByText(/se ha retirado de este módulo y de ningún otro/)).toBeVisible();

      // Está retirado en SU módulo…
      const suya = (await leerJson(await page.request.get(rutaDelModulo(doc._id, mio.unidadId)))).estructura;
      expect(suya.apartados.cambios[fila.seccion].retirado).toBe(true);
      expect(await arbolDe(mio.unidadId), 'su módulo ya no lo lleva').not.toContain(fila.seccion);

      // …y EL OTRO MÓDULO NO HA CAMBIADO: ni su árbol, ni su apartado, ni la estructura de ninguno de los
      // demás, ni la versión de la plantilla. Esa es la señal de que no se fue por la ruta equivocada.
      expect(await arbolDe(ajeno.unidadId), 'el árbol del otro módulo').toEqual(arbolAjenoAntes);
      expect(await camposVistos(page, doc._id, fila.seccion, ajeno.unidadId), 'el apartado del otro módulo').toBe(apartadoAjenoAntes);
      const despues = await fotoDeLosModulos(page, doc._id, unidades);
      for (const u of unidades.filter((x) => x !== mio.unidadId)) {
        expect(despues[u], `el módulo ${u} ha cambiado y no era el del docente`).toBe(modulosAntes[u]);
      }
      const ahora = await leerJson(await page.request.get(`/api/documentos/${doc._id}/estructura`));
      expect(ahora.plantillaVersion, 'la versión de la plantilla no se mueve: no se fue por la ruta de la plantilla').toBe(plantillaAntes);
      expect(ahora.apartados.find((a) => a.seccion === fila.seccion).retirado, 'en la plantilla sigue sin retirar').toBe(false);

      // Lo devuelve también pulsando, desde la lista de retirados de su módulo.
      await expect(page.getByRole('heading', { level: 2, name: 'Apartados retirados de este módulo' })).toBeVisible();
      await page.getByRole('button', { name: `Restaurar «${fila.titulo}» en este módulo` }).click();
      await expect.poll(() => arbolDe(mio.unidadId), { message: 'el apartado tiene que volver a su módulo' }).toEqual(arbolMioAntes);
      expect(await arbolDe(ajeno.unidadId)).toEqual(arbolAjenoAntes);
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

  // LAS CASILLAS DE UN APARTADO QUE EL MÓDULO SE HA CREADO. El docente que lleva un módulo crea un
  // apartado solo en el suyo y le pone las casillas que necesite. Se PULSA todo; la API solo se lee para
  // comprobar. Tres cosas hay que demostrar, y las tres están aquí:
  //
  //   1. que la pantalla ofrece añadir, renombrar, retirar y restaurar casillas del apartado propio;
  //   2. que RETIRAR NO BORRA: la casilla sigue en la estructura marcada `retirado`, y lo escrito en ella
  //      vuelve al restaurarla (si la pantalla mandara la lista sin ella, el texto quedaría huérfano);
  //   3. que nada de eso sale del módulo: ni el otro módulo, ni la versión de la plantilla, ni su Word.
  test('quien lleva un módulo pone casillas a un apartado suyo, y lo escrito sale en el Word de ese módulo y no en el de otro', async ({ page }) => {
    test.setTimeout(300_000);
    const TITULO = 'Taller de depuración';
    const CASILLA = 'Pasos para reproducir el fallo';
    const RENOMBRADA = 'Cómo reproducir el fallo';
    const TEXTO = 'Texto escrito en la casilla propia del taller de depuracion';
    const ESPERA = { timeout: 180_000 };
    await salir(page);
    await entrarComo(page, 'jefe_departamento');
    const { doc, mio, ajeno, unidades } = await elegirApartadoDeModulo(page);
    const lucia = (await personas(page)).find((p) => p.nombre.includes('Lucía'));
    const antesDeTodo = await huellaDeLaBase(page, doc._id);
    const docentesAntes = await docentesDeUnidad(page, doc._id, mio.unidadId);
    const plantillaAntes = (await leerJson(await page.request.get(`/api/documentos/${doc._id}/estructura`))).plantillaVersion;
    const propioId = `${mio.seccion}/m_taller-de-depuracion`;
    const propioEn = (e) => ((e && e.apartados && e.apartados.anadidos) || []).find((a) => a.id === propioId);
    const estructuraDelMio = async () => (await leerJson(await page.request.get(rutaDelModulo(doc._id, mio.unidadId)))).estructura;
    const word = async (unidad) => {
      const r = await page.request.get(`/api/documentos/${doc._id}/docx?${q({ unidad })}`, ESPERA);
      expect(r.status(), 'el Word se exporta').toBe(200);
      return (await JSZip.loadAsync(await r.body())).file('word/document.xml').async('string');
    };
    let escrito = false;

    try {
      await fijarDocentes(page, doc._id, mio.unidadId, [lucia._id]);
      const modulosAntes = await fotoDeLosModulos(page, doc._id, unidades);
      const wordAjenoAntes = await word(ajeno.unidadId);
      const wordMioAntes = await word(mio.unidadId);
      expect(wordMioAntes).not.toContain(TITULO);

      await salir(page);
      await entrarComo(page, 'docente', lucia.nombre);
      let permiso = esperarPermiso(page);
      await page.goto(enlace(doc._id, mio.seccion, mio.unidadId));
      await permiso;

      // CREA EL APARTADO, y la pantalla dice el alcance antes de guardar: solo este módulo.
      await expect(alcanceDicho(page)).toContainText(/Esto cambia solo este módulo y afecta a 1 persona/);
      await page.getByLabel('Añadir un subapartado').fill(TITULO);
      await page.getByRole('button', { name: 'Añadir', exact: true }).click();
      // El enlace de abrir lleva a un apartado que el árbol aún tiene que conocer: se espera a verlo en la
      // barra lateral, que es lo que haría quien mira, y no se pulsa a ciegas en el mismo instante.
      await expect(page.getByRole('tree').getByText(TITULO)).toBeVisible();
      permiso = esperarPermiso(page);
      await page.getByRole('button', { name: `Abrir «${TITULO}» para escribir en él` }).click();
      await permiso;
      await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toContainText(TITULO);
      expect(propioEn(await estructuraDelMio()), 'el apartado propio tiene que estar en la estructura del módulo').toBeTruthy();

      // Ve la tarjeta del apartado propio con su alcance, y la lista de sus casillas (la que nace con él).
      await expect(tarjeta(page)).toBeVisible();
      await expect(alcanceDicho(page)).toContainText(/Esto cambia solo este módulo/);
      await expect(page.getByRole('list', { name: `Campos de «${TITULO}»` })).toContainText('Texto');

      // AÑADE UNA CASILLA. El alcance se repite en el propio formulario, antes de guardar.
      await page.getByRole('button', { name: /^Añadir un campo/ }).click();
      await expect(page.getByRole('note', { name: 'Alcance del cambio' }).last()).toContainText(/Esto cambia solo este módulo/);
      await page.getByLabel('Nombre del campo').fill(CASILLA);
      await page.getByRole('button', { name: 'Añadir el campo' }).click();
      await expect(page.getByText('Campo añadido: ')).toBeVisible();
      const lista = page.getByRole('list', { name: `Campos de «${TITULO}»` });
      await expect(lista).toContainText(CASILLA);
      const tras = propioEn(await estructuraDelMio());
      expect(tras.campos.map((c) => c.etiqueta)).toEqual(['Texto', CASILLA]);
      const idCasilla = tras.campos[1].id;
      expect(idCasilla.startsWith('m_')).toBe(true);

      // ESCRIBE dentro de la casilla nueva, en el editor del apartado, y espera a que se guarde.
      const editor = (etiqueta) => page.locator('section.tarjeta')
        .filter({ has: page.getByRole('heading', { level: 2, name: etiqueta, exact: true }) })
        .getByRole('textbox').first();
      // Un campo de texto vacío se empieza con «+ párrafo».
      await page.locator('section.tarjeta')
        .filter({ has: page.getByRole('heading', { level: 2, name: CASILLA, exact: true }) })
        .getByRole('button', { name: '+ párrafo' }).click();
      await expect(editor(CASILLA)).toBeVisible();
      await editor(CASILLA).fill(TEXTO);
      escrito = true;
      await expect(page.getByText(/guardado (hace un momento|a las)/).first()).toBeVisible();

      // EL WORD del módulo lleva el apartado y lo escrito; el del otro módulo, ni lo uno ni lo otro.
      await expect.poll(async () => (await word(mio.unidadId)).includes(TEXTO), { message: 'lo escrito en la casilla no sale en el Word', ...ESPERA }).toBe(true);
      expect(await word(mio.unidadId)).toContain(TITULO);
      const wordAjeno = await word(ajeno.unidadId);
      expect(wordAjeno, 'el Word del otro módulo ha cambiado').toBe(wordAjenoAntes);
      expect(wordAjeno).not.toContain(TEXTO);
      expect(wordAjeno).not.toContain(TITULO);

      // LA RENOMBRA: el id no se mueve y lo escrito sigue en su sitio.
      await page.getByRole('button', { name: `Renombrar el campo «${CASILLA}» de «${TITULO}»` }).click();
      await page.getByLabel(`Nuevo nombre del campo «${CASILLA}»`).fill(RENOMBRADA);
      await page.getByRole('button', { name: 'Guardar nombre' }).click();
      await expect(page.getByText(/renombrado a «/)).toBeVisible();
      const renombrada = propioEn(await estructuraDelMio()).campos.find((c) => c.id === idCasilla);
      expect(renombrada.etiqueta).toBe(RENOMBRADA);
      await expect(editor(RENOMBRADA)).toHaveValue(TEXTO);

      // LA RETIRA, y la confirmación repite el alcance antes del «sí». RETIRAR NO BORRA: la casilla sigue
      // en la lista de la estructura, marcada, y el texto deja de salir en el Word pero no se pierde.
      await page.getByRole('button', { name: `Quitar el campo «${RENOMBRADA}» de «${TITULO}»` }).click();
      const confirmacion = page.getByRole('group', { name: `Quitar el campo «${RENOMBRADA}»` });
      await expect(confirmacion).toContainText(/Esto cambia solo este módulo/);
      await confirmacion.getByRole('button', { name: `Sí, quitar «${RENOMBRADA}»` }).click();
      await expect(page.getByText(/quitado de «/)).toBeVisible();
      const retirada = propioEn(await estructuraDelMio());
      expect(retirada.campos.map((c) => c.id), 'retirar no quita la casilla de la lista').toEqual(tras.campos.map((c) => c.id));
      expect(retirada.campos.find((c) => c.id === idCasilla).retirado).toBe(true);
      await expect.poll(async () => (await word(mio.unidadId)).includes(TEXTO), { message: 'la casilla retirada sigue en el Word', ...ESPERA }).toBe(false);

      // LA RESTAURA pulsando, y vuelve con lo que tenía escrito.
      await page.getByRole('button', { name: `Restaurar el campo «${RENOMBRADA}» de «${TITULO}» en este módulo` }).click();
      await expect(page.getByText(/devuelto a «/)).toBeVisible();
      expect(propioEn(await estructuraDelMio()).campos.find((c) => c.id === idCasilla).retirado).toBeUndefined();
      await expect(editor(RENOMBRADA)).toHaveValue(TEXTO);
      await expect.poll(async () => (await word(mio.unidadId)).includes(TEXTO), { message: 'lo restaurado no vuelve al Word', ...ESPERA }).toBe(true);

      // EL OTRO MÓDULO NO HA CAMBIADO EN NADA, y la versión de la plantilla no se ha movido: es lo que
      // demuestra que nada de esto fue por la ruta de la plantilla, que lo habría puesto en los once.
      const despues = await fotoDeLosModulos(page, doc._id, unidades);
      for (const u of unidades.filter((x) => x !== mio.unidadId)) {
        expect(despues[u], `el módulo ${u} ha cambiado y no era el del docente`).toBe(modulosAntes[u]);
      }
      expect(await word(ajeno.unidadId), 'el Word del otro módulo ha cambiado').toBe(wordAjenoAntes);
      expect((await leerJson(await page.request.get(`/api/documentos/${doc._id}/estructura`))).plantillaVersion, 'la versión de la plantilla no se mueve').toBe(plantillaAntes);
    } finally {
      await salir(page);
      await entrarComo(page, 'docente', lucia.nombre);
      if (escrito) {
        // Lo escrito se deja vacío mientras la casilla existe: una vez vuelto a la común, nadie lo vería.
        const ruta = `/api/documentos/${doc._id}/apartado?${q({ seccion: propioId, unidad: mio.unidadId })}`;
        const ahora = await page.request.get(ruta);
        if (ahora.status() === 200) {
          const a = await ahora.json();
          const vacio = Object.keys(a.valores || {}).reduce((o, id) => { o[id] = []; return o; }, {});
          await page.request.patch(ruta, { data: { valores: vacio, esperaUpdatedAt: a.updatedAt } });
        }
      }
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

  test('un docente que no lleva el módulo no ve los controles de las casillas de un apartado propio', async ({ page }) => {
    test.setTimeout(180_000);
    await salir(page);
    await entrarComo(page, 'jefe_departamento');
    const { doc, mio } = await elegirApartadoDeModulo(page);
    const antesDeTodo = await huellaDeLaBase(page, doc._id);
    const propioId = `${mio.seccion}/m_taller-ajeno`;
    try {
      // El apartado propio se prepara por la API (no es lo que se prueba): lo que se prueba es qué ve quien mira.
      const leida = await leerJson(await page.request.get(rutaDelModulo(doc._id, mio.unidadId, `?${q({ seccion: mio.seccion })}`)));
      const puesto = await page.request.put(rutaDelModulo(doc._id, mio.unidadId), {
        data: {
          estructura: { apartados: { anadidos: [{ id: propioId, titulo: 'Taller ajeno', padre: mio.seccion, campos: [{ id: 'm_texto', tipo: 'texto_largo', etiqueta: 'Texto' }] }] } },
          esperaUpdatedAt: leida.updatedAt,
          esperaPlantillaVersion: leida.plantillaVersion,
        },
      });
      expect(puesto.status(), await puesto.text()).toBe(200);

      await salir(page);
      await entrarComo(page, 'docente', 'Nerea');
      const permiso = esperarPermiso(page);
      await page.goto(enlace(doc._id, propioId, mio.unidadId));
      await permiso;
      await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toContainText('Taller ajeno');
      await expect(tarjeta(page)).toHaveCount(0);
      await expect(page.getByRole('button', { name: /^Añadir un campo/ })).toHaveCount(0);
      await expect(page.getByRole('button', { name: /^Quitar el campo/ })).toHaveCount(0);
      await expect(page.getByRole('button', { name: /^Renombrar el campo/ })).toHaveCount(0);
    } finally {
      await salir(page);
      await entrarComo(page, 'jefe_departamento');
      const quita = await page.request.put(rutaDelModulo(doc._id, mio.unidadId), { data: { estructura: null } });
      expect(quita.status(), `no se ha podido devolver el módulo a la común: ${await quita.text()}`).toBe(200);
    }
    expect(await huellaDeLaBase(page, doc._id), 'la base tiene que quedar como estaba').toEqual(antesDeTodo);
  });
});
