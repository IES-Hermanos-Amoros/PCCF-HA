// Los textos que ve el usuario, juntos, y el estado de un nodo del árbol.
//
// Están aquí y no repartidos por los componentes por lo mismo que
// `motivoBloqueo` está en un solo sitio en el prototipo: un mensaje redactado
// dos veces se redacta distinto, y la interfaz acaba llamando a la misma cosa de
// dos maneras según la pantalla en la que estés.

'use client';

import Permisos from '../../core/permisos';
import Unidades from '../../core/unidades';

export const ROLES = Permisos.ROLES;

// Los mismos nombres que pone la portada del PDF (app/_lib/rutas/comun.js), para
// que el documento se llame igual en la pantalla y en el papel.
export const NOMBRE_TIPO = {
  programacion_didactica: 'Programación didáctica',
  pd: 'Programación didáctica',
  pccf: 'Proyecto curricular del ciclo formativo',
  memoria: 'Memoria del departamento',
};

export const NOMBRE_ESTADO_DOC = {
  borrador: 'borrador',
  revision: 'en revisión',
  aprobado: 'aprobado',
};

// ---------------------------------------------------------------- el estado de un apartado
//
// DESDE EL E5 SE SABEN CUATRO DE LOS CINCO ESTADOS
//
// El prototipo distingue cinco: vacío · incompleto · completo · validado · con
// errores. «Validado» llega con este evolutivo: sale del `origen` de cada
// apartado, que `GET .../arbol` manda nodo a nodo desde que existe el arrastre
// entre cursos, así que el ✓ ya quiere decir lo que dice —que alguien lo ha
// mirado para ESTE curso— y por eso se pinta y entra en la leyenda. «Completo»
// pasa a significar lo que significaba en el prototipo: escrito, pero pendiente
// de que alguien lo dé por bueno.
//
// El que sigue sin estar es «con errores»: sale de cruzar los avisos del panel de
// validaciones con cada nodo del árbol, y `/arbol` no los manda. Mientras no los
// mande NO se finge que exista, porque un ! que no sale cuando hay un error es
// peor que no tener !.
//
// El ÁRBOL DICE SI ESTÁ HECHO Y BIEN, NO DE DÓNDE VIENE (punto 6 de
// docs/mockup-v2/CAMBIOS.md). La procedencia —que esto venga del curso pasado—
// va en la cabecera del apartado y en la vista *Cambios*, que es otra pregunta y
// otro sitio: ver `NOMBRE_ORIGEN`, justo debajo.
export const NOMBRE_ESTADO = {
  vacio: 'vacío',
  incompleto: 'incompleto: falta algún apartado',
  completo: 'con contenido, pendiente de revisar',
  validado: 'revisado para este curso',
};

// El color es el que lleva la información, igual que en el prototipo y en el v1;
// la forma va detrás para que también se distinga sin color (anillo punteado,
// medio relleno, relleno, ✓). Las clases son las de la hoja: .glifo-vacio,
// .glifo-incompleto, .glifo-completo, .glifo-validado.
export const GLIFO = { vacio: '', incompleto: '', completo: '', validado: '✓' };

// ---------------------------------------------------------------- la procedencia
//
// De dónde viene el apartado, con las palabras del prototipo
// (`NOMBRE_ORIGEN` de docs/mockup-v2/js/ui.js). Esto NO se pinta en el árbol: va
// en la cabecera del apartado y en la vista *Cambios*, que es donde hace falta
// —delante de las dos versiones— y no mezclado con «está hecho y bien».
//
// `null` es un apartado sin fila o importado antes de que el modelo guardara la
// procedencia: no se le inventa ninguna.
export const NOMBRE_ORIGEN = {
  heredado: 'viene del curso anterior, sin revisar',
  revisado: 'revisado sin cambios',
  modificado: 'reescrito este curso',
  nuevo: 'nuevo este curso',
  vacio: 'vacío',
};

// ---------------------------------------------------------------- el candado
//
// POR QUÉ NO SE DECIDE AQUÍ, SOLO SE EXPLICA
//
// Quién puede editar lo resuelve el servidor con core/permisos.js y llega en
// `puedeEditar`, nodo a nodo (app/_lib/rutas/arbol.js). Esto es solo la
// redacción del «por qué no», con el mismo texto que `Permisos.motivoBloqueo`
// del prototipo, que es de donde está copiado palabra por palabra. Reescribirlo
// en cada panel es lo que lleva a que el árbol diga una cosa y la cabecera otra.
//
// En el E1 no se edita nada, así que el candado no bloquea ningún botón: dice de
// quién es cada apartado, que es lo que hace falta para saber a quién preguntar.
export function motivoBloqueo({ tipo, contenido, edita }, rol) {
  if (!contenido) {
    if (tipo === 'raiz') return 'La portada del documento no tiene contenido propio: se edita apartado por apartado.';
    if (tipo === 'unidad') return 'La unidad agrupa sus apartados; el texto se escribe dentro de cada uno.';
    return 'Este bloque solo agrupa unidades; el contenido está dentro de cada una.';
  }
  if (rol === 'jefe_estudios') return 'La jefatura de estudios ve todos los departamentos, pero no edita.';
  if (edita === 'docentes_del_modulo') {
    return 'Este apartado lo editan los docentes de la unidad, y no la tienes asignada.';
  }
  return 'Este apartado lo edita la jefatura de departamento, salvo que te lo asigne.';
}

// Quién edita este apartado, dicho en positivo, para la cabecera: el candado
// explica por qué TÚ no puedes, y esto dice de quién es, que no es lo mismo.
export function deQuienEs(edita) {
  if (edita === 'docentes_del_modulo') return 'lo editan los docentes de la unidad';
  if (edita === 'jefe_departamento') return 'lo edita la jefatura de departamento';
  return null;
}

// ---------------------------------------------------------------- el código del módulo
//
// Cada módulo lleva su código al lado (0614, 0373…) y los que no están
// confirmados dicen «código pendiente» en vez de un número inventado: los de DAW
// y SMR están puestos de memoria y los de la LOFP no existen todavía, así que el
// catálogo los guarda como `null` a propósito (core/unidades.js).
//
// Devuelve null cuando la unidad no está en el catálogo —un documento de un ciclo
// que no conocemos, o un módulo que `core/conciliar.js` ha preferido dejar sin
// resolver antes que adivinar—: ahí no se pinta distintivo ninguno, porque no
// hay nada que decir.
export function codigoDeUnidad(unidadId) {
  if (!unidadId) return null;
  const u = Unidades.unidad(unidadId);
  if (!u) return null;
  return { texto: Unidades.etiquetaCodigo(u), confirmado: !!u.codigo };
}
