// Permisos vistos desde el motor: la búsqueda en `plantilla` + `datos`.
//
// La REGLA no está aquí, está en core/permisos.js, y es la misma que usa la
// interfaz. Aquí solo se resuelve lo que la regla necesita saber a partir de lo
// que el importador deja en los datos:
//
//   quién edita este apartado   →  el `edita` de la plantilla (los subapartados
//                                  heredan del padre)
//   es docente de la unidad     →  `datos.instancias[i].docentes`
//   tiene el apartado asignado  →  `datos.asignaciones[idApartado]`
//
// La API pública no cambia —`puedeVer`, `puedeEditar`, `puedeEditarCompartido`,
// `puedeDesvincular`, `quienEdita`— porque es la que ya usan scripts/ y la que
// usará la API de la aplicación.
//
// Un usuario es { id | _id, rol, departamento }: el identificador se lee con
// `C.idDeUsuario`, porque el repositorio lo devuelve en `_id` y el resto del
// motor lo escribe `id`, y confundirlos niega permisos en silencio. Los roles y
// qué puede cada uno están explicados en core/permisos.js.

'use strict';

const C = require('../core/permisos');

const buscarInstancia = (datos, instancia) => (typeof instancia === 'number'
  ? (datos.instancias || [])[instancia]
  : (datos.instancias || []).find((x) => x.titulo === instancia));

// Un apartado se puede delegar en un docente concreto por su propio id o por el
// del apartado común que lo contiene: asignar "Evaluación" le da también sus
// subapartados, que es como se reparte el trabajo de verdad.
const asignado = (datos, idSeccion, plantilla, usuario) => {
  const a = (datos && datos.asignaciones) || {};
  return [idSeccion, C.apartadoComun(plantilla, idSeccion)]
    .some((k) => k && (a[k] || []).includes(C.idDeUsuario(usuario)));
};

function puedeVer(usuario, datos) {
  return C.puedeVer(usuario, datos);
}

// donde = { seccion: id del apartado, instancia: índice o título del módulo
//           (solo en apartados de módulo) }
function puedeEditar(usuario, plantilla, datos, { seccion, instancia } = {}) {
  if (!puedeVer(usuario, datos)) return false;

  const ins = instancia === undefined ? null : buscarInstancia(datos, instancia);

  return C.reglaEdicion(usuario, {
    edita: C.quienEdita(plantilla, seccion),
    esDocenteDeLaUnidad: !!ins && (ins.docentes || []).includes(C.idDeUsuario(usuario)),
    tieneApartadoAsignado: asignado(datos, seccion, plantilla, usuario),
  });
}

function puedeEditarCompartido(usuario, plantilla, datos, id) {
  const c = ((datos && datos.compartidos) || {})[id];
  if (!c || !puedeVer(usuario, datos)) return false;

  return C.reglaCompartido(usuario, {
    comun: c.comun,
    editaApartadoComun: C.quienEdita(plantilla, c.seccion) === 'jefe_departamento',
    tieneApartadoAsignado: asignado(datos, c.seccion, plantilla, usuario),
  });
}

function puedeDesvincular(usuario, plantilla, datos, id, donde) {
  const c = ((datos && datos.compartidos) || {})[id];
  if (!c) return false;

  return C.reglaDesvincular(usuario, {
    modo: c.modo,
    puedeEditarElApartado: puedeEditar(usuario, plantilla, datos, donde),
  });
}

module.exports = {
  puedeVer,
  puedeEditar,
  puedeEditarCompartido,
  puedeDesvincular,
  quienEdita: C.quienEdita,
};
