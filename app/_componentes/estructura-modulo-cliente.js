// Cambiar la estructura de UN módulo, por el lado del navegador.
//
// Las rutas de la plantilla (estructura-cliente.js) son una por cambio. La del módulo es un PUT de la
// estructura ENTERA (app/_lib/rutas/estructura-modulo.js, y el porqué en su cabecera): el servidor no
// tiene «retira este campo», tiene «esta es la estructura que quiero». Así que la operación que el
// docente pulsa —retirar, restaurar, renombrar, mover, añadir un campo— se COMPONE aquí sobre la
// estructura que el módulo lleva ahora, y lo que se manda es el resultado. Quien la valida sigue siendo
// el servidor (`motivoDeEstructura`), con sus motivos escritos para una persona.
//
// Solo se guarda el DESVÍO (core/estructura-modulo.js): un apartado que el módulo no toca no aparece, y
// una estructura sin desvíos es `null`, que devuelve el módulo a la común.
//
// Y también el apartado ENTERO en un solo módulo (`apartados` del núcleo): retirarlo, restaurarlo,
// renombrarlo, moverlo entre sus hermanos y añadir uno propio. Es la misma ruta, el mismo PUT y el mismo
// vocabulario que los campos; lo único distinto es de dónde sale el árbol del módulo (ver
// `arbolDelModulo`). NUNCA van por las rutas de la plantilla: un apartado retirado por ahí desaparece
// de los once módulos, y quien lo hizo creyendo que era el suyo no se enteraría.

import Campos from '../../core/campos';
import EstructuraModulo from '../../core/estructura-modulo';
import Plantilla from '../../core/plantilla';
import { pedir } from './api';

const esObjeto = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const limpiar = (texto) => String(texto == null ? '' : texto).replace(/\s+/g, ' ').trim();

// Los campos de un apartado TAL COMO LOS VE ESTE MÓDULO, con lo que se puede hacer a cada uno. Es la
// misma regla que pinta el apartado y lo exporta (`camposDeSeccion`), no una copia: lo que se lista
// aquí es lo que sale en el papel.
//
// `fila` es la del apartado en la lectura de la estructura de la plantilla (los campos comunes, con sus
// candados); `estructura` es la del módulo, o null. Cada campo devuelto lleva `propio` si lo añadió el
// módulo. Un campo retirado en lo común no se restaura desde un módulo: lo común manda.
export function camposDelModulo(fila, estructura, seccion) {
  const comunes = fila && Array.isArray(fila.campos) ? fila.campos : [];
  const cerrado = !fila || fila.retirado || fila.repetidor;
  const resueltos = EstructuraModulo.camposDeSeccion(
    { id: seccion, campos: comunes.map((c) => ({ id: c.id, tipo: c.tipo, etiqueta: c.etiqueta, retirado: !!c.retirado })) },
    { estructura },
  );
  const vigentes = resueltos.campos.filter((c) => !c.retirado);
  return resueltos.campos.map((c) => {
    const comun = comunes.find((x) => x.id === c.id) || null;
    const quitado = !!c.retirado;
    const retiradoEnComun = !!(comun && comun.retirado);
    const editable = !cerrado && !quitado;
    const i = vigentes.findIndex((v) => v.id === c.id);
    return {
      id: c.id,
      tipo: c.tipo,
      etiqueta: c.etiqueta || c.id,
      retirado: quitado,
      propio: !!c.propio,
      puedeRetirar: editable && (c.propio ? Campos.esCreable(c.tipo) : !!(comun && comun.puedeRetirar)),
      puedeRestaurar: !cerrado && quitado && !retiradoEnComun,
      puedeRenombrar: editable,
      puedeSubir: editable && i > 0,
      puedeBajar: editable && i >= 0 && i < vigentes.length - 1,
    };
  });
}

// La fila del apartado con los campos del módulo en lugar de los comunes: es lo que reciben
// `QuitarCampos` y `AnadirCampo`, que no saben de dónde salen.
export const filaDelModulo = (fila, estructura, seccion) => (fila
  ? { ...fila, campos: camposDelModulo(fila, estructura, seccion) }
  : fila);

// ---------------------------------------------------------------- componer la estructura nueva

// El desvío de un apartado, copiado para poder tocarlo sin tocar el que hay.
function copiaDelDesvio(estructura, seccion) {
  const d = esObjeto(estructura) && esObjeto(estructura.secciones) && esObjeto(estructura.secciones[seccion])
    ? estructura.secciones[seccion] : {};
  return {
    campos: Object.keys(d.campos || {}).reduce((o, id) => { o[id] = { ...d.campos[id] }; return o; }, {}),
    anadidos: (Array.isArray(d.anadidos) ? d.anadidos : []).map((a) => ({ ...a })),
    orden: Array.isArray(d.orden) ? d.orden.slice() : [],
  };
}

// La estructura entera con el desvío de ESE apartado cambiado. Un desvío que se queda sin nada se quita
// del todo —el servidor lo rechazaría—, y una estructura que se queda sin desvíos es `null`.
function conElDesvio(estructura, seccion, desvio) {
  const secciones = { ...(esObjeto(estructura) && esObjeto(estructura.secciones) ? estructura.secciones : {}) };
  const out = {};
  if (Object.keys(desvio.campos).length) out.campos = desvio.campos;
  if (desvio.anadidos.length) out.anadidos = desvio.anadidos;
  if (desvio.orden.length) out.orden = desvio.orden;
  if (Object.keys(out).length) secciones[seccion] = out; else delete secciones[seccion];
  const resto = esObjeto(estructura) ? { ...estructura } : {};
  delete resto.secciones;
  const nueva = Object.keys(secciones).length ? { ...resto, secciones } : resto;
  return EstructuraModulo.estructuraDeModulo({ estructura: nueva }) ? nueva : null;
}

// ---------------------------------------------------------------- los apartados enteros

// Las acciones que cambian un apartado entero y no un campo suyo. Llegan como `<accion>_apartado`.
export const ACCIONES_DE_APARTADO = ['retirar', 'restaurar', 'renombrar', 'mover', 'anadir'];

const copiaDeApartados = (estructura) => {
  const d = esObjeto(estructura) && esObjeto(estructura.apartados) ? estructura.apartados : {};
  return {
    cambios: Object.keys(d.cambios || {}).reduce((o, id) => { o[id] = { ...d.cambios[id] }; return o; }, {}),
    anadidos: (Array.isArray(d.anadidos) ? d.anadidos : []).map((a) => ({ ...a })),
    orden: Object.keys(d.orden || {}).reduce((o, id) => { o[id] = (d.orden[id] || []).slice(); return o; }, {}),
  };
};

// La estructura entera con el desvío de los APARTADOS cambiado. Un desvío vacío se quita, y una
// estructura que se queda sin desvíos es `null` (el módulo vuelve a la común).
function conLosApartados(estructura, desvio) {
  const apartados = {};
  if (Object.keys(desvio.cambios).length) apartados.cambios = desvio.cambios;
  if (desvio.anadidos.length) apartados.anadidos = desvio.anadidos;
  const orden = Object.keys(desvio.orden).filter((k) => desvio.orden[k].length)
    .reduce((o, k) => { o[k] = desvio.orden[k]; return o; }, {});
  if (Object.keys(orden).length) apartados.orden = orden;
  const resto = esObjeto(estructura) ? { ...estructura } : {};
  delete resto.apartados;
  const nueva = Object.keys(apartados).length ? { ...resto, apartados } : resto;
  return EstructuraModulo.estructuraDeModulo({ estructura: nueva }) ? nueva : null;
}

// EL ÁRBOL QUE LLEVA ESTE MÓDULO, sacado de la regla del núcleo y no de una copia suya. `filas` son las
// filas de la lectura de la estructura de la plantilla (`apartados` de GET .../estructura): con ellas se
// monta una plantilla mínima y se le pregunta a `apartadosDeModulo`, que es quien decide qué apartados
// lleva el módulo y en qué orden. Lo retirado en lo común no entra: ni se ve ni lo cambia un módulo.
//
// Devuelve { bloque, secciones, todos }: `secciones` son los apartados directos del bloque, resueltos y
// con los retirados del módulo marcados; `todos` es el mismo árbol aplanado ({ nodo, padre }) para buscar.
export function arbolDelModulo(filas, estructura) {
  const vigentes = (Array.isArray(filas) ? filas : []).filter((f) => !f.retirado);
  const nodos = new Map(vigentes.map((f) => [f.seccion, {
    id: f.seccion,
    titulo: f.titulo,
    ...(Number.isInteger(f.nivel) ? { nivel: f.nivel } : {}),
    ...(f.instancias ? { instancias: true } : {}),
    ...(f.repetidor ? { repetidor: true } : {}),
    hijos: [],
  }]));
  const raiz = [];
  for (const f of vigentes) {
    const padre = f.padre ? nodos.get(f.padre) : null;
    if (padre) padre.hijos.push(nodos.get(f.seccion)); else if (!f.padre) raiz.push(nodos.get(f.seccion));
  }
  const resuelto = EstructuraModulo.apartadosDeModulo({ secciones: raiz }, { estructura });
  const todos = new Map();
  (function bajar(lista, padre) {
    for (const s of lista) {
      todos.set(s.id, { nodo: s, padre });
      bajar(s.hijos || [], s.id);
    }
  })(resuelto.secciones, resuelto.bloque);
  return { bloque: resuelto.bloque, secciones: resuelto.secciones, todos };
}

const contarHijos = (n, soloVisibles) => (n.hijos || [])
  .filter((h) => !soloVisibles || !h.retirado)
  .reduce((t, h) => t + 1 + contarHijos(h, soloVisibles), 0);

// Los apartados que este módulo ha retirado (y no sus hijos, que se van con ellos), con cuántos apartados
// se llevan por dentro. Es lo que se ofrece para restaurar.
export function apartadosRetiradosDelModulo(filas, estructura) {
  const fuera = [];
  (function bajar(lista) {
    for (const s of lista) {
      if (s.retirado) fuera.push({ seccion: s.id, titulo: s.titulo || s.id, conHijos: contarHijos(s, false), propio: !!s.propio });
      else bajar(s.hijos || []);
    }
  })(arbolDelModulo(filas, estructura).secciones);
  return fuera;
}

// Los hermanos de un apartado en este módulo, en su orden, con él dentro; y cuáles de ellos se ven.
function hermanosDe(arbol, seccion) {
  const e = arbol.todos.get(seccion);
  if (!e) return null;
  const padre = e.padre === arbol.bloque ? null : arbol.todos.get(e.padre);
  const todos = padre ? padre.nodo.hijos || [] : arbol.secciones;
  return { padre: e.padre, todos, visibles: todos.filter((h) => !h.retirado) };
}

// Qué se le puede hacer a un apartado EN ESTE MÓDULO, calculado sobre el árbol del módulo y no sobre el
// de la plantilla: subir y bajar cuentan los hermanos que este módulo ve, y un apartado propio admite
// hijos como cualquiera. Null si el apartado no está en el módulo.
export function apartadoDelModulo(filas, estructura, seccion) {
  const arbol = arbolDelModulo(filas, estructura);
  const e = arbol.todos.get(seccion);
  const h = hermanosDe(arbol, seccion);
  if (!e || !h) return null;
  const i = h.visibles.findIndex((x) => x.id === seccion);
  return {
    propio: !!e.nodo.propio,
    puedeSubir: !e.nodo.retirado && i > 0,
    puedeBajar: !e.nodo.retirado && i >= 0 && i < h.visibles.length - 1,
    admiteHijos: !e.nodo.retirado && !e.nodo.repetidor && !e.nodo.instancias,
  };
}

// Aplica una operación de APARTADO a la estructura del módulo. Devuelve { estructura, ... } o lanza un
// Error con el motivo. `operacion`: { accion, filas, titulo?, padre?, delta?, campos? }.
function componerApartado(estructura, seccion, operacion) {
  const arbol = arbolDelModulo(operacion.filas, estructura);
  const desvio = copiaDeApartados(estructura);
  const resultado = {};

  if (operacion.accion === 'anadir') {
    const titulo = Plantilla.limpiarTitulo(operacion.titulo);
    if (!titulo) throw new Error('Hace falta un título para el apartado nuevo.');
    const padre = operacion.padre || arbol.bloque;
    if (padre !== arbol.bloque && !arbol.todos.has(padre)) {
      throw new Error('Este módulo no tiene ese apartado: no se puede añadir nada dentro.');
    }
    // Los ids que el documento ya usa en este módulo, TAMBIÉN los retirados: nunca se reutiliza uno.
    const ocupados = (operacion.filas || []).map((f) => f.seccion)
      .concat(Array.from(arbol.todos.keys()), desvio.anadidos.map((a) => a.id));
    const id = EstructuraModulo.idDeApartadoPropio(titulo, padre, ocupados);
    const pedidos = Array.isArray(operacion.campos) && operacion.campos.length
      ? operacion.campos : [{ tipo: Plantilla.CAMPO_NUEVO.tipo, etiqueta: Plantilla.CAMPO_NUEVO.etiqueta }];
    const campos = [];
    for (let i = 0; i < pedidos.length; i += 1) {
      const hecho = Campos.crearCampo(pedidos[i], campos.map((c) => c.id));
      if (hecho.motivo) throw new Error(`El campo ${i + 1} del apartado nuevo no vale: ${hecho.motivo}`);
      const idCampo = EstructuraModulo.idDeCampoPropio(hecho.campo.etiqueta, hecho.campo.tipo, campos.map((c) => c.id));
      const nuevo = { id: idCampo, tipo: hecho.campo.tipo, etiqueta: hecho.campo.etiqueta };
      if (hecho.campo.columnas !== undefined && hecho.campo.columnas !== null) nuevo.columnas = hecho.campo.columnas;
      if (hecho.campo.inicial !== undefined) nuevo.inicial = hecho.campo.inicial;
      campos.push(nuevo);
    }
    desvio.anadidos.push({ id, titulo, padre, campos });
    resultado.seccion = id;
    resultado.titulo = titulo;
    resultado.estructura = conLosApartados(estructura, desvio);
    return resultado;
  }

  const e = arbol.todos.get(seccion);
  if (!e) throw new Error(`Este módulo no tiene ningún apartado «${seccion}».`);
  const propio = desvio.anadidos.find((a) => a.id === seccion) || null;
  const nodo = e.nodo;

  if (operacion.accion === 'retirar') {
    if (propio) propio.retirado = true; else desvio.cambios[seccion] = { ...desvio.cambios[seccion], retirado: true };
    resultado.apartadosAfectados = 1 + contarHijos(nodo, true);
  } else if (operacion.accion === 'restaurar') {
    // Igual que en la plantilla común: un hijo no vuelve mientras su padre siga retirado.
    const padre = e.padre === arbol.bloque ? null : (arbol.todos.get(e.padre) || {}).nodo;
    if (padre && padre.retirado) {
      throw new Error(`«${nodo.titulo}» cuelga de «${padre.titulo}», que está retirado en este módulo: restaura primero ese.`);
    }
    if (propio) {
      delete propio.retirado;
    } else if (desvio.cambios[seccion]) {
      const { retirado, ...resto } = desvio.cambios[seccion];
      if (Object.keys(resto).length) desvio.cambios[seccion] = resto; else delete desvio.cambios[seccion];
    }
  } else if (operacion.accion === 'renombrar') {
    const titulo = Plantilla.limpiarTitulo(operacion.titulo);
    if (!titulo) throw new Error('Hace falta un título para el apartado.');
    if (propio) {
      propio.titulo = titulo;
    } else {
      // Volver a llamarlo como en lo común es quitar el desvío, no guardar un nombre igual.
      const { titulo: _anterior, ...resto } = desvio.cambios[seccion] || {};
      const comun = (operacion.filas || []).find((f) => f.seccion === seccion);
      const cambio = comun && comun.titulo === titulo ? resto : { ...resto, titulo };
      if (Object.keys(cambio).length) desvio.cambios[seccion] = cambio; else delete desvio.cambios[seccion];
    }
  } else if (operacion.accion === 'mover') {
    const h = hermanosDe(arbol, seccion);
    const i = h.visibles.findIndex((x) => x.id === seccion);
    const j = i + operacion.delta;
    if (i < 0 || j < 0 || j >= h.visibles.length) throw new Error('Ese apartado ya no se puede mover en esa dirección.');
    // El orden guarda TODOS los hermanos, también los retirados: se intercambian los dos vecinos visibles.
    const orden = h.todos.map((x) => x.id);
    const a = orden.indexOf(h.visibles[i].id);
    const b = orden.indexOf(h.visibles[j].id);
    [orden[a], orden[b]] = [orden[b], orden[a]];
    desvio.orden[h.padre] = orden;
    resultado.posicion = j + 1;
    resultado.total = h.visibles.length;
  } else {
    throw new Error(`Acción de estructura de módulo desconocida: ${operacion.accion}`);
  }

  resultado.estructura = conLosApartados(estructura, desvio);
  return resultado;
}

// Aplica una operación y devuelve { estructura, campo?, posicion?, total?, ... }, o lanza un Error con el
// motivo. `operacion`: { accion, campo?, etiqueta?, delta?, peticion? } para un campo, o
// { accion: 'retirar_apartado' | 'restaurar_apartado' | 'renombrar_apartado' | 'mover_apartado' |
// 'anadir_apartado', filas, titulo?, padre?, delta?, campos? } para un apartado entero.
export function componerCambio(estructura, fila, seccion, operacion) {
  const deApartado = /^(\w+)_apartado$/.exec(operacion.accion || '');
  if (deApartado && ACCIONES_DE_APARTADO.includes(deApartado[1])) {
    return componerApartado(estructura, seccion, { ...operacion, accion: deApartado[1] });
  }
  const campos = camposDelModulo(fila, estructura, seccion);
  const desvio = copiaDelDesvio(estructura, seccion);
  const c = operacion.campo ? campos.find((x) => x.id === operacion.campo) : null;
  if (operacion.accion !== 'anadir_campo' && !c) {
    throw new Error(`Este módulo no tiene ningún campo «${operacion.campo}» en el apartado.`);
  }
  const propio = c ? desvio.anadidos.find((a) => a.id === c.id) : null;
  const comun = c && !propio ? ((fila && fila.campos) || []).find((x) => x.id === c.id) : null;
  const resultado = {};

  if (operacion.accion === 'retirar_campo') {
    if (propio) propio.retirado = true; else desvio.campos[c.id] = { ...desvio.campos[c.id], retirado: true };
  } else if (operacion.accion === 'restaurar_campo') {
    if (propio) {
      delete propio.retirado;
    } else if (desvio.campos[c.id]) {
      const { retirado, ...resto } = desvio.campos[c.id];
      if (Object.keys(resto).length) desvio.campos[c.id] = resto; else delete desvio.campos[c.id];
    }
    resultado.campo = c.id;
  } else if (operacion.accion === 'renombrar_campo') {
    const etiqueta = limpiar(operacion.etiqueta);
    if (propio) {
      propio.etiqueta = etiqueta;
    } else {
      // Volver a llamarlo como en lo común es quitar el desvío, no guardar un nombre igual.
      const { etiqueta: _anterior, ...resto } = desvio.campos[c.id] || {};
      const cambio = etiqueta && comun && etiqueta === comun.etiqueta ? resto : { ...resto, etiqueta };
      if (Object.keys(cambio).length) desvio.campos[c.id] = cambio; else delete desvio.campos[c.id];
    }
  } else if (operacion.accion === 'mover_campo') {
    const vigentes = campos.filter((x) => !x.retirado);
    const i = vigentes.findIndex((x) => x.id === c.id);
    const j = i + operacion.delta;
    if (i < 0 || j < 0 || j >= vigentes.length) throw new Error('Ese campo ya no se puede mover en esa dirección.');
    // El orden guarda TODOS los campos, también los retirados: se intercambian los dos vecinos visibles.
    const orden = campos.map((x) => x.id);
    const a = orden.indexOf(vigentes[i].id);
    const b = orden.indexOf(vigentes[j].id);
    [orden[a], orden[b]] = [orden[b], orden[a]];
    desvio.orden = orden;
    resultado.posicion = j + 1;
    resultado.total = vigentes.length;
  } else if (operacion.accion === 'anadir_campo') {
    const ocupados = campos.map((x) => x.id);
    const hecho = Campos.crearCampo(operacion.peticion, ocupados);
    if (hecho.motivo) throw new Error(hecho.motivo);
    const id = EstructuraModulo.idDeCampoPropio(hecho.campo.etiqueta, hecho.campo.tipo, ocupados);
    const nuevo = { id, tipo: hecho.campo.tipo, etiqueta: hecho.campo.etiqueta };
    if (hecho.campo.columnas !== undefined && hecho.campo.columnas !== null) nuevo.columnas = hecho.campo.columnas;
    if (hecho.campo.inicial !== undefined) nuevo.inicial = hecho.campo.inicial;
    desvio.anadidos.push(nuevo);
    resultado.campo = id;
  } else {
    throw new Error(`Acción de estructura de módulo desconocida: ${operacion.accion}`);
  }

  resultado.estructura = conElDesvio(estructura, seccion, desvio);
  return resultado;
}

// ---------------------------------------------------------------- escribir

// Una escritura en la estructura de ESTE módulo, con la misma forma de llamada y de respuesta que
// `cambiarEstructura` para que `QuitarCampos` y `AnadirCampo` no sepan por dónde va.
//
// Antes de componer se vuelve a leer la estructura del módulo: la que tenía la pantalla puede ser de
// hace un momento, y el PUT lleva la estructura ENTERA —si se compusiera sobre una vieja se desharía
// el cambio anterior—. La lectura trae el `updatedAt` del documento, que viaja como
// `esperaUpdatedAt`: si alguien escribe entre esa lectura y el guardado, el servidor contesta 409 y no
// escribe nada. La versión de la plantilla es la que la pantalla tenía (`cuerpo.esperaPlantillaVersion`),
// no la recién leída: lo que se quiere detectar es que la jefatura la haya cambiado mientras tanto.
export async function escribirEnElModulo(documentoId, unidadId, fila, {
  accion, seccion, campo, cuerpo = {}, filas,
}) {
  const ruta = `/api/documentos/${encodeURIComponent(documentoId)}/unidades/${encodeURIComponent(unidadId)}/estructura`;
  const leida = await pedir(ruta);
  const hecho = componerCambio(leida.estructura, fila, seccion, {
    accion,
    campo,
    etiqueta: cuerpo.etiqueta,
    delta: cuerpo.delta,
    peticion: cuerpo.campo,
    // Para las operaciones de apartado entero (retirar_apartado, mover_apartado…).
    filas,
    titulo: cuerpo.titulo,
    padre: cuerpo.padre,
    campos: cuerpo.campos,
  });
  const r = await pedir(ruta, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      estructura: hecho.estructura,
      esperaUpdatedAt: leida.updatedAt,
      esperaPlantillaVersion: cuerpo.esperaPlantillaVersion !== undefined ? cuerpo.esperaPlantillaVersion : leida.plantillaVersion,
    }),
  });
  return {
    ...r,
    // Lo que las tarjetas leen de la respuesta de la plantilla: este cambio no sale en los demás módulos.
    afectaUnidades: false,
    unidades: 1,
    soloEnElModulo: true,
    campo: hecho.campo,
    seccion: hecho.seccion,
    titulo: hecho.titulo,
    apartadosAfectados: hecho.apartadosAfectados,
    campos: accion === 'anadir_campo' ? [{ id: hecho.campo }] : undefined,
    cambio: hecho.posicion ? { posicion: hecho.posicion, campos: hecho.total } : undefined,
  };
}

// ---------------------------------------------------------------- lo retirado en un módulo

// Los apartados que este módulo ha retirado, cada uno con `puede`: si el servidor deja a quien pregunta
// devolverlo. Se lee la estructura del módulo (la que tiene ahora, no la que tenía la pantalla) y, por
// cada retirado, se pregunta `?seccion=` a la ruta de la unidad. Un apartado propio del módulo no existe
// en la plantilla, así que el servidor no sabe contestar por él: se pregunta por uno común del mismo
// módulo, porque quien lleva el módulo lo lleva entero.
export async function leerRetiradosDelModulo(documentoId, unidadId, filas) {
  const ruta = `/api/documentos/${encodeURIComponent(documentoId)}/unidades/${encodeURIComponent(unidadId)}/estructura`;
  const leida = await pedir(ruta);
  const retirados = apartadosRetiradosDelModulo(filas, leida.estructura);
  const lista = Array.isArray(filas) ? filas : [];
  const deModulo = lista.filter((f) => f.deUnidades && !f.instancias && !f.retirado);
  const ids = new Set(deModulo.map((f) => f.seccion));
  const representante = (x) => {
    if (!x.propio) return x.seccion;
    let id = x.seccion;
    while (id.includes('/')) {
      id = id.slice(0, id.lastIndexOf('/'));
      if (ids.has(id)) return id;
    }
    return deModulo.length ? deModulo[0].seccion : x.seccion;
  };
  const puede = await Promise.all(retirados.map((x) => pedir(`${ruta}?${new URLSearchParams({ seccion: representante(x) })}`)
    .then((r) => !!(r && r.puedeCambiar)).catch(() => false)));
  return { estructura: leida.estructura, retirados: retirados.map((x, i) => ({ ...x, puede: puede[i] })) };
}
