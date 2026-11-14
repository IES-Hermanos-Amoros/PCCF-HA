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

// ---------------------------------------------------------------- lo que comparten las pruebas de estructura

const q = (o) => Object.entries(o).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

async function leerJson(r) {
  expect(r.status(), await r.text()).toBe(200);
  return r.json();
}

// Los apartados de módulo que tienen contenido, con su módulo: una hoja por (apartado, módulo).
async function hojasDeModulo(page, documentoId) {
  const { arbol } = await leerJson(await page.request.get(`/api/documentos/${documentoId}/arbol`));
  const out = [];
  const ver = (n) => {
    if (!n || typeof n !== 'object') return;
    if (n.edita === 'docentes_del_modulo' && n.unidadId && n.contenido) out.push(n);
    (n.hijos || []).forEach(ver);
  };
  ver(arbol);
  return out;
}

// La PD de DAW 26-27, un apartado de módulo con un campo que se pueda quitar y DOS módulos que lo tienen:
// el del docente (`mio`) y otro cualquiera (`ajeno`), que es el que no tiene que cambiar.
async function elegirApartadoDeModulo(page) {
  const doc = await buscarDocumento(page, { tipo: 'programacion_didactica', ciclo: 'daw', curso: '2026-27' });
  expect(doc, 'hace falta la PD de DAW 26-27').toBeTruthy();
  const estructura = await leerJson(await page.request.get(`/api/documentos/${doc._id}/estructura`));
  const hojas = await hojasDeModulo(page, doc._id);
  for (const mio of hojas) {
    const fila = estructura.apartados.find((a) => a.seccion === mio.seccion);
    const campo = fila && fila.campos.find((c) => c.puedeRetirar && !c.retirado);
    const ajeno = hojas.find((h) => h.seccion === mio.seccion && h.unidadId !== mio.unidadId);
    if (campo && ajeno) {
      const unidades = [...new Set(hojas.map((h) => h.unidadId))];
      return { doc, mio, ajeno, campo, unidades };
    }
  }
  throw new Error('no hay un apartado de módulo con un campo que se pueda quitar');
}

// Quién lleva un módulo ahora, para devolverlo como estaba; y fijarlo.
async function docentesDeUnidad(page, documentoId, unidadId) {
  const { unidades } = await leerJson(await page.request.get(`/api/documentos/${documentoId}/unidades`));
  const u = unidades.find((x) => x.unidadId === unidadId) || {};
  return (u.docentes || []).map((d) => (typeof d === 'string' ? d : d._id || d.id));
}

async function fijarDocentes(page, documentoId, unidadId, ids) {
  const r = await page.request.put(`/api/documentos/${documentoId}/unidades/${encodeURIComponent(unidadId)}/docentes`, { data: { docentes: ids } });
  expect(r.status(), await r.text()).toBeLessThan(400);
}

// Cuántos módulos, cuántas unidades con docente, asignaciones de apartados comunes y estructuras propias
// hay: es la forma de comprobar al terminar que la base ha quedado como estaba.
async function huellaDeLaBase(page, documentoId) {
  const { unidades } = await leerJson(await page.request.get(`/api/documentos/${documentoId}/unidades`));
  const asg = await leerJson(await page.request.get(`/api/documentos/${documentoId}/asignaciones`));
  const propias = [];
  for (const u of unidades) {
    const e = await leerJson(await page.request.get(`/api/documentos/${documentoId}/unidades/${encodeURIComponent(u.unidadId)}/estructura`));
    if (e.estructura) propias.push(u.unidadId);
  }
  return {
    unidadesConDocente: unidades.filter((u) => (u.docentes || []).length).map((u) => u.unidadId),
    apartadosAsignados: (asg.apartados || []).filter((a) => (a.personas || []).length).map((a) => a.seccion),
    estructurasPropias: propias,
  };
}

module.exports = {
  ROLES, personas, entrarComo, salir, documentos, buscarDocumento,
  q, leerJson, hojasDeModulo, elegirApartadoDeModulo, docentesDeUnidad, fijarDocentes, huellaDeLaBase,
};
