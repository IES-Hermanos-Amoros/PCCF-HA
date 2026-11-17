// Importar un Word de un curso que YA EXISTE no puede pisar lo que había.
//
// Es la pregunta que trajo el departamento: si ya hay una programación de DAW 26-27 y alguien sube
// otra desde un Word para el mismo curso, ¿qué pasa con la que estaba? La respuesta que esta prueba
// fija: la subida entra como VERSIÓN ALTERNATIVA, no activa, y la que estaba sigue activa y con su
// contenido intacto. Nada se pisa y nada se pierde.
//
// La prueba escribe en la base local: crea una versión alternativa y la borra al terminar.

const path = require('path');
const { test, expect } = require('@playwright/test');
const { entrarComo, salir, buscarDocumento, controlDeFuga } = require('./apoyo');

// Los Word de partida no están en git: viven solo en esta máquina y se leen sin tocarlos.
const WORD = path.join(__dirname, '..', 'docs', 'entrada_ej', '2026-27', 'PD_DAW_26-27_161026.docx');

async function apartadosDe(page, id) {
  const r = await page.request.get(`/api/documentos/${id}/arbol`);
  expect(r.status()).toBe(200);
  return r.json();
}

// Quien ensucia es quien falla: al terminar, la base tiene que estar como al empezar.
controlDeFuga(test);

test.describe('subir otro Word del mismo curso', () => {
  test('entra como versión alternativa y no toca la que estaba', async ({ page }) => {
    await salir(page);
    await entrarComo(page, 'jefe_departamento');

    // 1. Lo que hay antes de tocar nada.
    const antes = await buscarDocumento(page, { tipo: 'programacion_didactica', ciclo: 'daw', curso: '2026-27' });
    expect(antes, 'hace falta la PD de DAW 26-27 cargada: npm run cargar-reales').toBeTruthy();
    expect(antes.activa !== false, 'la que ya estaba tiene que estar activa').toBe(true);
    const arbolAntes = JSON.stringify(await apartadosDe(page, antes._id));

    // 2. Se sube otra vez el MISMO curso.
    const subida = await page.request.post('/api/documentos/importar', {
      multipart: {
        archivo: { name: 'PD_DAW_26-27_161026.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: require('fs').readFileSync(WORD) },
        tipo: 'programacion_didactica',
        ciclo: 'daw',
        curso: '2026-27',
        departamento: 'informatica',
      },
      timeout: 120_000,
    });
    expect(subida.status(), await subida.text()).toBe(201);
    const cuerpo = await subida.json();

    let nuevaId = null;
    try {
      nuevaId = cuerpo.documento._id;

      // 3. Lo subido es alternativa, no activa, y lleva la versión siguiente.
      expect(cuerpo.alternativa, 'subir sobre un curso que ya existe tiene que dar una alternativa').toBe(true);
      expect(cuerpo.version).toBeGreaterThan(1);
      expect(cuerpo.documento.activa).toBe(false);
      expect(nuevaId).not.toBe(antes._id);

      // 4. LA QUE ESTABA SIGUE SIENDO LA ACTIVA.
      const despues = await buscarDocumento(page, { tipo: 'programacion_didactica', ciclo: 'daw', curso: '2026-27' });
      expect(despues._id, 'la activa tiene que seguir siendo la misma de antes').toBe(antes._id);
      expect(despues.activa !== false).toBe(true);

      // 5. Y SU CONTENIDO ESTÁ INTACTO, no solo su ficha.
      expect(JSON.stringify(await apartadosDe(page, antes._id))).toBe(arbolAntes);

      // 6. Las dos se listan como versiones del mismo documento.
      const vs = await page.request.get(`/api/documentos/${antes._id}/versiones`);
      expect(vs.status()).toBe(200);
      const { versiones } = await vs.json();
      const ids = versiones.map((v) => v._id);
      expect(ids).toContain(antes._id);
      expect(ids).toContain(nuevaId);
      expect(versiones.filter((v) => v.activa !== false).length, 'solo puede haber una activa').toBe(1);
    } finally {
      // Se deja la base como estaba.
      if (nuevaId) {
        const borrado = await page.request.delete(`/api/documentos/${nuevaId}`, { data: { confirmar: true } });
        expect(borrado.status(), 'no se ha podido limpiar la versión de prueba').toBeLessThan(400);
      }
    }
  });

  test('un docente no puede subir una versión', async ({ page }) => {
    await salir(page);
    await entrarComo(page, 'docente');
    const subida = await page.request.post('/api/documentos/importar', {
      multipart: {
        archivo: { name: 'PD_DAW_26-27_161026.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: require('fs').readFileSync(WORD) },
        tipo: 'programacion_didactica',
        ciclo: 'daw',
        curso: '2026-27',
        departamento: 'informatica',
      },
      timeout: 120_000,
    });
    expect(subida.status(), 'un docente no importa documentos').toBeGreaterThanOrEqual(400);
  });
});
