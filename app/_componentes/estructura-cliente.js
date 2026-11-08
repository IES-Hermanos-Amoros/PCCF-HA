// Cambiar la estructura del documento, por el lado del navegador: las seis
// direcciones del E6 y las cuentas que necesita la tarjeta *Estructura*.
//
// Referencia: el punto 3 de docs/mockup-v2/CAMBIOS.md —«se puede cambiar la
// estructura del documento»—, el apartado «Estructura editable» de
// docs/mockup-v2/README.md, y `barraEstructura` / `tarjetaRetirados` de
// docs/mockup-v2/js/ui.js. Es la especificación aprobada por el departamento y
// no se rediseña. El contrato con el servidor es el de docs/api.md, filas del
// E6, y lo escribe `app/_lib/rutas/estructura.js`.
//
// ================================================================ EL ID NO ES EL TÍTULO
//
// Es la razón de ser de todo esto y lo que la interfaz tiene que dejar claro.
// Poder renombrar un apartado destapa un problema: si el id fuera el slug de su
// título, renombrar «Introducción» cambiaría su id y dejaría huérfanos su
// contenido, sus comentarios y los enlaces que alguien tuviera guardados. Es el
// mismo error que ya se corrigió un nivel más abajo con los módulos, donde el
// título tampoco podía ser la clave (core/unidades.js, docs/plan.md §2.1).
//
// Así que el id se genera UNA VEZ, al crear el apartado, y no vuelve a cambiar:
// el título es solo la etiqueta que se pinta. Por eso la tarjeta **enseña el id a
// la vista**: es contraintuitivo —renombrar algo y que el enlace siga valiendo— y
// la única forma de que se note es ponerlo delante.
//
// Y por eso el id del apartado nuevo **lo genera el servidor** (`core/plantilla.js`),
// no esto: aquí se manda el título y la respuesta dice con qué identificador ha
// nacido. El prototipo lo calculaba en el navegador porque allí no había
// servidor; con servidor, el único sitio donde se puede garantizar que un id no
// se repite entre hermanos es donde está la plantilla.
//
// ================================================================ LO QUE SE LE PIDE AL SERVIDOR
//
// Las direcciones están todas aquí y en ningún otro fichero: si alguna cambia,
// se cambia en este sitio. Son cinco cambios y una lectura:
//
//   GET    .../estructura                              la estructura y lo retirado
//   POST   .../estructura/apartado                     añadir      { titulo, padre? }
//   PATCH  .../estructura/apartado?seccion=            renombrar   { titulo }
//   POST   .../estructura/apartado/mover?seccion=      mover       { delta: -1 | 1 }
//   POST   .../estructura/apartado/retirar?seccion=    retirar     (no borra)
//   POST   .../estructura/apartado/restaurar?seccion=  restaurar
//
// Retirar no es un `DELETE` y la razón está en la ruta: un DELETE que no borra
// es una promesa que el contrato no quiere hacer.
//
// Los cinco cambios aceptan `esperaPlantillaVersion` y los cinco contestan
// igual: la `plantillaVersion` nueva, el `cambio` apuntado, `afectaUnidades` con
// `unidades` —la advertencia de los once módulos, dicha por el servidor— y
// `apartadosAfectados`, que es lo que de verdad se lleva por delante un retirar.

'use client';

import Permisos from '../../core/permisos';
import { pedir } from './api';

// ================================================================ las direcciones

const base = (documentoId) => `/api/documentos/${encodeURIComponent(documentoId)}`;

const conSeccion = (camino, seccion) => `${camino}?${new URLSearchParams({ seccion })}`;

// Cada cambio: con qué método va y a qué dirección. La sección viaja en la URL,
// igual que en `/apartado`, para que la petición diga sobre qué actúa.
const CAMBIOS = {
  anadir: { metodo: 'POST', url: (b) => `${b}/estructura/apartado` },
  renombrar: { metodo: 'PATCH', url: (b, s) => conSeccion(`${b}/estructura/apartado`, s) },
  mover: { metodo: 'POST', url: (b, s) => conSeccion(`${b}/estructura/apartado/mover`, s) },
  retirar: { metodo: 'POST', url: (b, s) => conSeccion(`${b}/estructura/apartado/retirar`, s) },
  restaurar: { metodo: 'POST', url: (b, s) => conSeccion(`${b}/estructura/apartado/restaurar`, s) },
  // Un campo más en un apartado que ya existe: { campo: { tipo, … } }.
  anadir_campo: { metodo: 'POST', url: (b, s) => conSeccion(`${b}/estructura/apartado/campo`, s) },
};

export const urlEstructura = (documentoId) => `${base(documentoId)}/estructura`;

// La estructura del documento tal como se puede cambiar: una fila por apartado
// con qué se le puede hacer, los retirados —que en el árbol ya no están— y la
// versión de la plantilla, que es la que viaja en el cambio siguiente.
export const leerEstructura = (documentoId) => pedir(urlEstructura(documentoId));

// Un cambio de estructura. `seccion` es el apartado sobre el que se actúa (al
// añadir no hay: el padre va en el cuerpo).
export function cambiarEstructura(documentoId, accion, { seccion, cuerpo } = {}) {
  const c = CAMBIOS[accion];
  if (!c) return Promise.reject(new Error(`Acción de estructura desconocida: ${accion}`));
  return pedir(c.url(base(documentoId), seccion), {
    method: c.metodo,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo || {}),
  });
}

// ================================================================ quién puede

// Quién cambia la estructura lo dice el servidor en `puedeCambiar` de la lectura
// (igual que `/unidades` dice `puedeRepartir`): el cliente refleja el candado,
// no lo decide. Mientras la lectura no ha vuelto se resuelve con **la misma
// regla de core/permisos.js** que aplica el servidor, que no es una copia sino
// la función misma: así la tarjeta no parpadea al abrir el documento y, si
// alguna vez las dos dijeran cosas distintas, manda la respuesta.
export function puedeCambiarEstructura(estructura, usuario, documento) {
  if (estructura && estructura.puedeCambiar !== undefined) return !!estructura.puedeCambiar;
  if (!usuario || !documento) return false;
  return Permisos.puedeCambiarEstructura(usuario, documento);
}

// ================================================================ las cuentas del árbol
//
// Lo que el servidor manda por apartado (`puedeSubir`, `puedeBajar`,
// `admiteHijos`, `deUnidades`) no se vuelve a calcular aquí. Lo que sí sale del
// árbol es lo que el servidor no puede saber porque no está mirando esta
// pantalla: en qué puesto va el apartado para poder decirlo en texto, y de qué
// módulo se está hablando para nombrarlo en la advertencia.

export const idLocal = (seccion) => String(seccion || '').split('/').pop();

export const padreDe = (seccion) => {
  const corte = String(seccion || '').lastIndexOf('/');
  return corte === -1 ? '' : String(seccion).slice(0, corte);
};

// En qué puesto va el apartado entre sus hermanos, tal como se están pintando,
// que es el orden del documento y el del PDF. Se filtran por la ruta de su id
// para que las unidades —que cuelgan de un bloque con otro prefijo— no entren:
// una unidad no es un apartado de la plantilla y no se mueve por aquí
// (`unidades` no tiene columna de orden, docs/plan.md «Para el E6»).
export function hermanosDe(camino, nodo) {
  const vacio = { ids: [], i: -1, total: 0 };
  if (!nodo || !nodo.seccion || !Array.isArray(camino) || camino.length < 2) return vacio;
  const padre = camino[camino.length - 2];
  const ruta = padreDe(nodo.seccion);
  const lista = (padre && padre.hijos ? padre.hijos : [])
    .filter((h) => h.seccion && h.tipo !== 'unidad' && padreDe(h.seccion) === ruta);
  const ids = lista.map((h) => idLocal(h.seccion));
  const i = ids.indexOf(idLocal(nodo.seccion));
  return { ids, i, total: ids.length };
}

// De qué unidad se está hablando y cuántas hay. Un apartado de dentro de un
// módulo NO es suyo: es una sección de la plantilla que los once módulos repiten
// con su propio contenido (el par (seccion, instancia) del motor). La tarjeta lo
// advierte ANTES de tocar nada, porque desde dentro de un módulo no se ve: la
// pantalla dice «Evaluación y calificación» de «Lenguajes de marcas» y parece
// que se está cambiando ese.
export function unidadDelCamino(camino) {
  const lista = Array.isArray(camino) ? camino : [];
  const donde = lista.findIndex((n) => n && n.tipo === 'unidad');
  const unidad = donde === -1 ? null : lista[donde];
  // El bloque de unidades es el nodo de justo antes: es quien las agrupa y quien
  // sabe cuántas hay y cómo se llaman («módulo», «materia»).
  const anterior = donde > 0 ? lista[donde - 1] : null;
  const bloque = anterior && anterior.tipo === 'bloque' ? anterior : null;
  return {
    unidad,
    etiqueta: bloque ? bloque.etiqueta : null,
    cuantas: bloque ? (bloque.hijos || []).length : 0,
  };
}

// «los 11 módulos», «las 4 materias», «las 11 unidades» si el documento no dice
// cómo se llaman. Se escribe aquí y no en la tarjeta para que las cuatro frases
// que lo mencionan digan lo mismo.
export function todasLasUnidades(cuantas, etiqueta) {
  const nombre = etiqueta || 'unidad';
  const articulo = /^(materia|unidad)/.test(nombre) ? 'las' : 'los';
  return `${articulo} ${cuantas} ${nombre}s`;
}
