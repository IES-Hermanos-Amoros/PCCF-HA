// Lo que necesitan todas las pruebas de extremo a extremo: entrar con un rol y encontrar documentos.
//
// ENTRAR SE HACE POR LA API, no pulsando en `/entrar`. La pantalla de acceso libre ya tiene su propia
// prueba; las demás no deben fallar porque alguien le cambie un botón. `/api/acceso-libre` es el mismo
// puente que usa la pantalla y abre una sesión normal, de las que el resto de la aplicación entiende.

const { expect } = require('@playwright/test');

// Los cuatro roles, tal como los siembra la aplicación.
const ROLES = ['admin', 'jefe_estudios', 'jefe_departamento', 'docente'];

// Las personas de muestra, pedidas una vez por fichero de pruebas.
async function personas(page) {
  const r = await page.request.get('/api/acceso-libre');
  expect(r.status(), 'el puente de acceso libre tiene que estar abierto: arranca con PCCF_ACCESO_LIBRE=1').toBe(200);
  const { personas: lista } = await r.json();
  expect(lista.length, 'no hay personas de muestra').toBeGreaterThan(0);
  return lista;
}

// Entra con la primera persona que tenga ese rol. Devuelve la persona.
// `nombre` elige una concreta cuando hay varias del mismo rol (tres docentes).
async function entrarComo(page, rol, nombre = null) {
  const lista = await personas(page);
  const quien = lista.find((p) => p.rol === rol && (!nombre || (p.nombre || '').includes(nombre)));
  expect(quien, `no hay ninguna persona con el rol ${rol}${nombre ? ` llamada ${nombre}` : ''}`).toBeTruthy();
  const r = await page.request.post('/api/acceso-libre', { data: { persona: quien._id } });
  expect(r.status(), 'no se ha podido abrir sesión').toBeLessThan(400);
  return quien;
}

// Cierra la sesión del navegador sin depender de ningún botón.
async function salir(page) {
  await page.context().clearCookies();
}

// Los documentos que ve quien esté dentro, por la misma ruta que usa la portada.
async function documentos(page) {
  const r = await page.request.get('/api/documentos');
  expect(r.status()).toBe(200);
  const j = await r.json();
  return j.documentos || j || [];
}

// Un documento por lo que lo distingue, para no escribir ids a mano en las pruebas.
async function buscarDocumento(page, { tipo, ciclo, curso } = {}) {
  const lista = await documentos(page);
  return lista.find((d) => (!tipo || d.tipo === tipo)
    && (!ciclo || d.ciclo === ciclo)
    && (!curso || String(d.curso) === String(curso))) || null;
}

module.exports = { ROLES, personas, entrarComo, salir, documentos, buscarDocumento };
