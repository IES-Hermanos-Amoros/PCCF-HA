// EL PDF Y EL WORD EXPORTAN LO QUE SE VE EN LA APLICACIÓN, CON UN NAVEGADOR Y LA BASE DE DATOS DE VERDAD.
//
// Es el requisito del centro y esta es su prueba. Un módulo puede llevar estructura propia —apartados y
// campos distintos de los de los otros diez—, y esa estructura tiene que llegar a las cuatro salidas:
// el árbol, el apartado, el Word y el PDF. Lo que se comprueba:
//
//   · como jefatura, se reparte un módulo a un docente
//   · como ese docente, se retira un apartado de SU módulo y se añade un campo a otro
//   · el árbol y el apartado lo reflejan para ese módulo
//   · el Word de ese módulo lleva el campo nuevo y ya no lleva el apartado retirado
//   · en otro módulo del mismo documento nada ha cambiado: ni el árbol, ni el apartado, ni el Word
//   · el PDF sigue siendo un PDF válido y su tamaño cambia
//
// Todo lo que se toca se deshace en un `finally`: la estructura del módulo vuelve a la común
// (`estructura: null`) y el reparto de docentes, a como estaba.

const { test, expect } = require('@playwright/test');
const JSZip = require('jszip');
const { entrarComo, salir, buscarDocumento } = require('./apoyo');

const ESPERA = { timeout: 180_000 };
const CAMPO = { id: 'm_desvio_exportado', tipo: 'texto_largo', etiqueta: 'Desvio que tiene que salir en el papel' };
// El Word y el PDF imprimen lo que está escrito en un campo, no su etiqueta: es el texto que el docente
// escribe en el campo nuevo, y el que tiene que aparecer en el Word.
const TEXTO = 'Texto escrito en el campo propio del modulo para la prueba de exportar';

const ruta = (doc, unidad, consulta = '') => `/api/documentos/${doc}/unidades/${encodeURIComponent(unidad)}/estructura${consulta}`;
const q = (o) => Object.entries(o).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

function nodos(raiz) {
  const out = [];
  (function ver(n) {
    if (!n || typeof n !== 'object') return;
    out.push(n);
    (n.hijos || []).forEach(ver);
  })(raiz);
  return out;
}

const hojasDeModulo = (raiz) => nodos(raiz).filter((n) => n.edita === 'docentes_del_modulo' && n.unidadId
  && n.contenido && !n.repetidor && !(n.hijos || []).length);

async function arbol(page, doc) {
  const r = await page.request.get(`/api/documentos/${doc}/arbol`);
  expect(r.status()).toBe(200);
  return (await r.json()).arbol;
}

// Lo que ve un módulo en el árbol, en orden: apartado, título y si tiene contenido.
const delArbol = (raiz, unidadId) => nodos(raiz).filter((n) => n.unidadId === unidadId && n.tipo === 'apartado')
  .map((n) => `${n.seccion}|${n.titulo}|${n.contenido}`);

async function apartado(page, doc, seccion, unidadId) {
  return page.request.get(`/api/documentos/${doc}/apartado?${q({ seccion, unidad: unidadId })}`);
}

async function textoDelWord(page, doc, unidadId) {
  const r = await page.request.get(`/api/documentos/${doc}/docx?${q({ unidad: unidadId })}`, ESPERA);
  expect(r.status(), 'el Word se exporta').toBe(200);
  const zip = await JSZip.loadAsync(await r.body());
  return zip.file('word/document.xml').async('string');
}

async function pdf(page, doc, unidadId) {
  const r = await page.request.get(`/api/documentos/${doc}/pdf?${q({ unidad: unidadId })}`, ESPERA);
  expect(r.status(), 'el PDF se exporta').toBe(200);
  const cuerpo = await r.body();
  expect(cuerpo.subarray(0, 4).toString('latin1')).toBe('%PDF');
  expect(cuerpo.subarray(-1024).toString('latin1')).toContain('%%EOF');
  return cuerpo.length;
}

const veces = (texto, aguja) => texto.split(aguja).length - 1;

test.describe('exportar lo que se ve', () => {
  test('el desvío de un módulo está en el árbol, el apartado, el Word y el PDF, y los otros módulos no cambian', async ({ page }) => {
    test.setTimeout(600_000);
    await salir(page);
    await entrarComo(page, 'jefe_departamento');
    const doc = await buscarDocumento(page, { tipo: 'programacion_didactica', ciclo: 'daw', curso: '2026-27' });
    expect(doc, 'hace falta la PD de DAW 26-27').toBeTruthy();

    const arbolAntes = await arbol(page, doc._id);
    const hojas = hojasDeModulo(arbolAntes);
    const unidades = [...new Set(hojas.map((h) => h.unidadId))];
    expect(unidades.length).toBeGreaterThan(2);
    const mio = unidades[0];
    const ajeno = unidades[1];
    const deMio = hojas.filter((h) => h.unidadId === mio);
    expect(deMio.length, 'hacen falta dos apartados sencillos en el módulo').toBeGreaterThan(1);
    const retirar = deMio[0];
    const anadir = deMio[1];
    const mismoEnAjeno = (n) => hojas.find((h) => h.unidadId === ajeno && h.seccion === n.seccion);
    expect(mismoEnAjeno(retirar)).toBeTruthy();

    const lista = (await (await page.request.get('/api/acceso-libre')).json()).personas;
    const lucia = lista.find((p) => p.rol === 'docente');
    expect(lucia).toBeTruthy();
    const previo = (await (await page.request.get(`/api/documentos/${doc._id}/unidades`)).json()).unidades;
    const docentesAntes = (previo.find((u) => u.unidadId === mio) || {}).docentes || [];
    const idsAntes = docentesAntes.map((d) => (typeof d === 'string' ? d : d._id || d.id));
    const rutaDocentes = `/api/documentos/${doc._id}/unidades/${encodeURIComponent(mio)}/docentes`;

    let tocado = false;
    let valoresAntes = null;
    const rutaApartado = `/api/documentos/${doc._id}/apartado?${q({ seccion: anadir.seccion, unidad: mio })}`;
    try {
      // Antes del desvío: lo que sale hoy, de los dos módulos.
      const wordMioAntes = await textoDelWord(page, doc._id, mio);
      const wordAjenoAntes = await textoDelWord(page, doc._id, ajeno);
      const pdfMioAntes = await pdf(page, doc._id, mio);
      const pdfAjenoAntes = await pdf(page, doc._id, ajeno);
      const arbolAjenoAntes = delArbol(arbolAntes, ajeno);
      expect(wordMioAntes).toContain(retirar.titulo);
      expect(wordMioAntes).not.toContain(TEXTO);

      // La jefatura reparte el módulo, y el docente le da su estructura propia.
      const puesto = await page.request.put(rutaDocentes, { data: { docentes: [lucia._id] } });
      expect(puesto.status(), await puesto.text()).toBeLessThan(400);
      await salir(page);
      await entrarComo(page, 'docente', lucia.nombre);

      const pregunta = await (await page.request.get(ruta(doc._id, mio, `?${q({ seccion: retirar.seccion })}`))).json();
      tocado = true;
      const r = await page.request.put(ruta(doc._id, mio), {
        data: {
          estructura: {
            secciones: { [anadir.seccion]: { anadidos: [CAMPO] } },
            apartados: { cambios: { [retirar.seccion]: { retirado: true } } },
          },
          esperaUpdatedAt: pregunta.updatedAt,
          esperaPlantillaVersion: pregunta.plantillaVersion,
        },
      });
      expect(r.status(), await r.text()).toBe(200);

      // EL ÁRBOL: el apartado retirado ya no está en este módulo y el otro módulo queda igual.
      const arbolDespues = await arbol(page, doc._id);
      const claves = delArbol(arbolDespues, mio);
      expect(claves.some((c) => c.startsWith(`${retirar.seccion}|`)), 'el apartado retirado sigue en el árbol').toBe(false);
      expect(claves.some((c) => c.startsWith(`${anadir.seccion}|`)), 'el apartado al que se añade el campo sigue en el árbol').toBe(true);
      expect(claves.length).toBe(delArbol(arbolAntes, mio).length - 1);
      expect(delArbol(arbolDespues, ajeno), 'el árbol del otro módulo ha cambiado').toEqual(arbolAjenoAntes);

      // EL APARTADO: el retirado no existe en este módulo y al otro se le ha añadido el campo.
      expect((await apartado(page, doc._id, retirar.seccion, mio)).status()).toBe(404);
      const conCampo = await (await apartado(page, doc._id, anadir.seccion, mio)).json();
      expect(conCampo.campos.map((c) => c.id)).toContain(CAMPO.id);
      expect(conCampo.campos.find((c) => c.id === CAMPO.id).etiqueta).toBe(CAMPO.etiqueta);

      // El docente escribe en el campo nuevo: el PATCH acepta un campo que solo existe en su módulo.
      valoresAntes = { existe: conCampo.existe, valores: conCampo.valores };
      const escribe = await page.request.patch(rutaApartado, {
        data: { valores: { ...conCampo.valores, [CAMPO.id]: [{ type: 'p', text: TEXTO }] }, esperaUpdatedAt: conCampo.updatedAt },
      });
      expect(escribe.status(), await escribe.text()).toBeLessThan(400);

      // EL WORD: el campo está dentro y el apartado retirado ya no.
      const wordMioDespues = await textoDelWord(page, doc._id, mio);
      expect(wordMioDespues, 'lo escrito en el campo añadido no está en el Word').toContain(TEXTO);
      expect(veces(wordMioDespues, retirar.titulo), 'el apartado retirado sigue en el Word')
        .toBeLessThan(veces(wordMioAntes, retirar.titulo));
      expect(wordMioDespues).not.toBe(wordMioAntes);

      // EL OTRO MÓDULO: ni el apartado ni el Word han cambiado.
      expect((await apartado(page, doc._id, retirar.seccion, ajeno)).status()).toBe(200);
      const ajenoAnadir = await (await apartado(page, doc._id, anadir.seccion, ajeno)).json();
      expect(ajenoAnadir.campos.map((c) => c.id)).not.toContain(CAMPO.id);
      const wordAjenoDespues = await textoDelWord(page, doc._id, ajeno);
      expect(wordAjenoDespues, 'el Word del otro módulo ha cambiado').toBe(wordAjenoAntes);
      expect(wordAjenoDespues).not.toContain(TEXTO);

      // EL PDF: sigue siendo un PDF, el del módulo cambia de tamaño y el del otro no.
      expect(await pdf(page, doc._id, mio), 'el PDF del módulo no cambia con el desvío').not.toBe(pdfMioAntes);
      expect(await pdf(page, doc._id, ajeno), 'el PDF del otro módulo ha cambiado').toBe(pdfAjenoAntes);
    } finally {
      await salir(page);
      await entrarComo(page, 'jefe_departamento');
      if (tocado) {
        // Primero el contenido, mientras el campo existe: se devuelve el apartado a los valores de antes.
        if (valoresAntes) {
          await salir(page);
          await entrarComo(page, 'docente', lucia.nombre);
          const ahora = await (await page.request.get(rutaApartado)).json();
          const deja = await page.request.patch(rutaApartado, { data: { valores: valoresAntes.valores, esperaUpdatedAt: ahora.updatedAt } });
          expect(deja.status(), `no se ha podido devolver el apartado a como estaba: ${await deja.text()}`).toBeLessThan(400);
          await salir(page);
          await entrarComo(page, 'jefe_departamento');
        }
        const quita = await page.request.put(ruta(doc._id, mio), { data: { estructura: null } });
        expect(quita.status(), `no se ha podido devolver el módulo a la común: ${await quita.text()}`).toBe(200);
      }
      await page.request.put(rutaDocentes, { data: { docentes: idsAntes } });
    }
  });
});
