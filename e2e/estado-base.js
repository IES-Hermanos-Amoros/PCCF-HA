// El estado de la base visto por la API HTTP: lo único que decide si está «limpia».
//
// Un SOLO cálculo, para quien lo necesite: las pruebas (`apoyo.js`), la comprobación de entrada
// (`global-setup.js`) y la herramienta que limpia (`scripts/base-limpia.js`). Por eso no depende de
// Playwright: trabaja con un «cliente» mínimo, `{ get(ruta), put(ruta, cuerpo) }`, que devuelve
// `{ status, json }`. Las pruebas lo montan sobre `page.request`; el script, sobre `fetch`.
//
// La base LIMPIA es la que deja la carga de los Word: ninguna unidad con docente, ningún apartado común
// asignado a nadie y ningún módulo con estructura propia.

const CLAVES = ['unidadesConDocente', 'apartadosAsignados', 'estructurasPropias'];

async function leer(cliente, ruta) {
  const r = await cliente.get(ruta);
  if (r.status !== 200) throw new Error(`GET ${ruta} ha dado ${r.status}: ${JSON.stringify(r.json).slice(0, 200)}`);
  return r.json;
}

const etiquetaDe = (d) => `${d.tipo} ${d.ciclo || ''} ${d.curso || ''}`.replace(/\s+/g, ' ').trim();

// Los documentos que ve quien esté dentro.
async function listarDocumentos(cliente) {
  const j = await leer(cliente, '/api/documentos');
  return j.documentos || j || [];
}

// Cuántas unidades con docente, apartados comunes asignados y estructuras propias hay. Con `documentoId`,
// solo en ese documento y cada entrada es el id a secas; sin él, en todos y cada entrada lleva delante el
// documento («programacion_didactica daw 2026-27 · daw-0373») para poder decir DÓNDE está lo sucio.
async function huellaDeLaBase(cliente, documentoId = null) {
  const docs = documentoId
    ? [{ _id: documentoId, etiqueta: null }]
    : (await listarDocumentos(cliente)).map((d) => ({ _id: d._id, etiqueta: etiquetaDe(d) }));
  const huella = { unidadesConDocente: [], apartadosAsignados: [], estructurasPropias: [] };
  const marca = (d, id) => (d.etiqueta ? `${d.etiqueta} · ${id}` : id);
  for (const d of docs) {
    const { unidades } = await leer(cliente, `/api/documentos/${d._id}/unidades`);
    const asg = await leer(cliente, `/api/documentos/${d._id}/asignaciones`);
    for (const u of unidades) {
      if ((u.docentes || []).length) huella.unidadesConDocente.push(marca(d, u.unidadId));
      const e = await leer(cliente, `/api/documentos/${d._id}/unidades/${encodeURIComponent(u.unidadId)}/estructura`);
      if (e.estructura) huella.estructurasPropias.push(marca(d, u.unidadId));
    }
    for (const a of asg.apartados || []) {
      if ((a.personas || []).length) huella.apartadosAsignados.push(marca(d, a.seccion));
    }
  }
  return huella;
}

const estaLimpia = (h) => CLAVES.every((k) => h[k].length === 0);

const ROTULO = {
  unidadesConDocente: 'módulo con docente asignado',
  apartadosAsignados: 'apartado común asignado a alguien',
  estructurasPropias: 'módulo con estructura propia',
};

// Lo sucio, en líneas legibles.
function describirHuella(h) {
  const lineas = [];
  for (const k of CLAVES) for (const x of h[k]) lineas.push(`  - ${ROTULO[k]}: ${x}`);
  return lineas;
}

// Qué ha cambiado entre dos huellas: lo que APARECE y lo que DESAPARECE.
function diferencia(antes, despues) {
  const lineas = [];
  for (const k of CLAVES) {
    for (const x of despues[k]) if (!antes[k].includes(x)) lineas.push(`  - se ha quedado: ${ROTULO[k]}: ${x}`);
    for (const x of antes[k]) if (!despues[k].includes(x)) lineas.push(`  - ha desaparecido: ${ROTULO[k]}: ${x}`);
  }
  return lineas;
}

// Devuelve la base a la huella limpia, por la API, y cuenta lo que ha tocado.
async function limpiar(cliente) {
  const tocado = [];
  for (const d of await listarDocumentos(cliente)) {
    const et = etiquetaDe(d);
    const { unidades } = await leer(cliente, `/api/documentos/${d._id}/unidades`);
    const asg = await leer(cliente, `/api/documentos/${d._id}/asignaciones`);
    const poner = async (ruta, cuerpo, que) => {
      const r = await cliente.put(ruta, cuerpo);
      if (r.status >= 400) throw new Error(`PUT ${ruta} ha dado ${r.status}: ${JSON.stringify(r.json).slice(0, 200)}`);
      tocado.push(`${que} (${et})`);
    };
    for (const u of unidades) {
      const id = encodeURIComponent(u.unidadId);
      if ((u.docentes || []).length) {
        await poner(`/api/documentos/${d._id}/unidades/${id}/docentes`, { docentes: [] }, `docentes vaciados en ${u.unidadId}`);
      }
      const e = await leer(cliente, `/api/documentos/${d._id}/unidades/${id}/estructura`);
      if (e.estructura) {
        await poner(`/api/documentos/${d._id}/unidades/${id}/estructura`, { estructura: null }, `estructura propia quitada a ${u.unidadId}`);
      }
    }
    for (const a of asg.apartados || []) {
      if ((a.personas || []).length) {
        await poner(`/api/documentos/${d._id}/asignaciones?seccion=${encodeURIComponent(a.seccion)}`, { personas: [] }, `asignación vaciada en ${a.seccion}`);
      }
    }
  }
  return tocado;
}

// Un cliente sobre `fetch` con cookie de sesión, para quien no tiene Playwright a mano (el script y la
// comprobación de entrada). Abre la sesión con el puente de pruebas, como soporte y, si no hay, como
// jefatura de departamento.
async function clienteHttp(urlBase) {
  const base = urlBase.replace(/\/$/, '');
  let cookie = '';
  const pedir = async (metodo, ruta, cuerpo) => {
    const r = await fetch(base + ruta, {
      method: metodo,
      headers: { ...(cookie ? { cookie } : {}), ...(cuerpo ? { 'content-type': 'application/json' } : {}) },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    const nuevas = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
    if (nuevas.length) cookie = nuevas.map((c) => c.split(';')[0]).join('; ');
    let json = null;
    try { json = await r.json(); } catch { /* sin cuerpo */ }
    return { status: r.status, json };
  };
  let lista;
  try {
    lista = await pedir('GET', '/api/acceso-libre');
  } catch (e) {
    throw new Error(`no llego al servidor ${base} (${e.cause ? e.cause.code || e.cause.message : e.message}): ¿está levantado?`);
  }
  if (lista.status !== 200 || !lista.json || !lista.json.personas) {
    throw new Error(`el puente de acceso libre no está abierto en ${base}: arranca el servidor con PCCF_ACCESO_LIBRE=1`);
  }
  const quien = lista.json.personas.find((p) => p.rol === 'admin') || lista.json.personas.find((p) => p.rol === 'jefe_departamento');
  if (!quien) throw new Error('no hay ninguna persona de soporte ni de jefatura de departamento');
  const dentro = await pedir('POST', '/api/acceso-libre', { persona: quien._id });
  if (dentro.status >= 400) throw new Error(`no se ha podido abrir sesión (${dentro.status})`);
  return { get: (ruta) => pedir('GET', ruta), put: (ruta, cuerpo) => pedir('PUT', ruta, cuerpo), quien: `${quien.nombre} (${quien.rol})` };
}

// El mensaje que explica qué hacer cuando la base no está limpia.
const COMO_LIMPIAR = 'Para dejarla limpia:  node scripts/base-limpia.js --limpiar   (usa PCCF_E2E_URL si el servidor no está en el 3000)';

module.exports = {
  CLAVES, huellaDeLaBase, estaLimpia, describirHuella, diferencia, limpiar, listarDocumentos, clienteHttp, COMO_LIMPIAR,
};
