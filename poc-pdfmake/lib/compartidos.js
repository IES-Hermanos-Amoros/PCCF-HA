// Textos compartidos: un párrafo (o lista) que se repite en varios módulos, o que copia literalmente la parte común,
// se guarda una sola vez en datos.compartidos y donde aparecía queda una referencia { ref: id }. Se edita en un sitio.
//   extraerCompartidos(datos, { umbral, minimo }) -> resumen; sustituye las copias por referencias (modifica datos)
//   resolverCompartidos(datos)                    -> copia de datos con el texto en lugar de las referencias (para pintar)
//   editarCompartido(datos, id, bloque)           -> cambia el texto y sube su versión
//   desvincular(datos, instancia, id)             -> el módulo se queda con una copia propia editable (solo modo "sugerido")
//   avisosDesvinculados(datos)                    -> copias propias cuyo original ha cambiado después de desvincularse

const esTexto = (b) => b && typeof b === 'object' && (b.type === 'p' || b.type === 'list');
const esRef = (b) => b && typeof b === 'object' && typeof b.ref === 'string';
const clave = (b) => (b.type === 'p' ? 'p|' + b.text : 'l|' + JSON.stringify(b.items));
const largo = (b) => (b.type === 'p' ? b.text.length : b.items.reduce((s, it) => s + it.text.length, 0));
const copiar = (b) => JSON.parse(JSON.stringify(b));

// Recorre las listas de bloques de texto (campos texto_largo, también dentro de ítems repetidos) de unos valores
// { idSeccion: { campo: valor } }, llamando a fn(lista, idSeccion).
function listasDeTexto(valores, fn) {
  const visitar = (v, sec) => {
    if (Array.isArray(v)) {
      if (v.some((b) => esTexto(b) || esRef(b))) fn(v, sec);
      else v.forEach((x) => visitar(x, sec));
    } else if (v && typeof v === 'object') Object.values(v).forEach((x) => visitar(x, sec));
  };
  for (const [sec, campos] of Object.entries(valores || {})) visitar(campos, sec);
}
const buscarInstancia = (datos, instancia) => (typeof instancia === 'number' ? datos.instancias[instancia] : datos.instancias.find((x) => x.titulo === instancia));

function extraerCompartidos(datos, { umbral = 3, minimo = 80 } = {}) {
  const vistos = new Map();
  const anotar = (b, sec, modulo) => {
    if (!esTexto(b) || largo(b) < minimo) return;
    const k = clave(b);
    if (!vistos.has(k)) vistos.set(k, { bloque: b, comun: null, seccion: sec, modulos: new Set() });
    const o = vistos.get(k);
    if (modulo === null) o.comun = o.comun || sec; else o.modulos.add(modulo);
  };
  listasDeTexto(datos.documento, (lista, sec) => lista.forEach((b) => anotar(b, sec, null)));
  datos.instancias.forEach((ins, i) => listasDeTexto(ins.valores, (lista, sec) => lista.forEach((b) => anotar(b, sec, i))));

  // compartido si se repite en `umbral` módulos o más, o si algún módulo copia un texto de la parte común
  const elegidos = [...vistos.values()].filter((o) => o.modulos.size >= umbral || (o.comun && o.modulos.size >= 1));
  const compartidos = datos.compartidos || {};
  let n = Object.keys(compartidos).length;
  const idPorClave = new Map();
  for (const o of elegidos) {
    const id = 'c' + String(++n).padStart(3, '0');
    idPorClave.set(clave(o.bloque), id);
    compartidos[id] = { bloque: copiar(o.bloque), seccion: o.comun || o.seccion, comun: !!o.comun, responsable: 'jefe_departamento', modo: 'sugerido', version: 1 };
  }
  const sustituir = (lista) => lista.forEach((b, k) => { if (esTexto(b) && idPorClave.has(clave(b))) lista[k] = { ref: idPorClave.get(clave(b)) }; });
  listasDeTexto(datos.documento, sustituir);
  datos.instancias.forEach((ins) => listasDeTexto(ins.valores, sustituir));
  datos.compartidos = compartidos;

  return elegidos.map((o) => ({
    id: idPorClave.get(clave(o.bloque)), modulos: o.modulos.size, comun: o.comun, seccion: o.seccion,
    inicio: (o.bloque.type === 'p' ? o.bloque.text : o.bloque.items.map((it) => it.text).join(' · ')).replace(/\s+/g, ' ').slice(0, 90),
  }));
}

function resolverCompartidos(datos) {
  if (!datos.compartidos) return datos;
  const out = copiar(datos);
  const resolver = (lista) => lista.forEach((b, k) => {
    if (!esRef(b)) return;
    const c = out.compartidos[b.ref];
    lista[k] = c ? copiar(c.bloque) : { type: 'p', text: `[texto compartido ${b.ref} no encontrado]` };
  });
  listasDeTexto(out.documento, resolver);
  out.instancias.forEach((ins) => listasDeTexto(ins.valores, resolver));
  return out;
}

function editarCompartido(datos, id, bloque) {
  const c = datos.compartidos && datos.compartidos[id];
  if (!c) throw new Error(`No existe el texto compartido ${id}`);
  c.bloque = copiar(bloque);
  c.version += 1;
  return c;
}

function desvincular(datos, instancia, id) {
  const c = datos.compartidos && datos.compartidos[id];
  if (!c) throw new Error(`No existe el texto compartido ${id}`);
  if (c.modo !== 'sugerido') throw new Error(`El texto compartido ${id} es obligatorio y no se puede desvincular`);
  const ins = buscarInstancia(datos, instancia);
  if (!ins) throw new Error(`No existe la instancia ${instancia}`);
  let n = 0;
  listasDeTexto(ins.valores, (lista) => lista.forEach((b, k) => {
    if (esRef(b) && b.ref === id) { lista[k] = { ...copiar(c.bloque), desvinculado_de: id, version_origen: c.version }; n += 1; }
  }));
  return n;
}

function avisosDesvinculados(datos) {
  const avisos = [];
  datos.instancias.forEach((ins) => listasDeTexto(ins.valores, (lista, sec) => lista.forEach((b) => {
    const c = b && b.desvinculado_de && datos.compartidos[b.desvinculado_de];
    if (c && c.version > b.version_origen) avisos.push({ instancia: ins.titulo, seccion: sec, id: b.desvinculado_de, version_origen: b.version_origen, version_actual: c.version });
  })));
  return avisos;
}

module.exports = { extraerCompartidos, resolverCompartidos, editarCompartido, desvincular, avisosDesvinculados, listasDeTexto };
