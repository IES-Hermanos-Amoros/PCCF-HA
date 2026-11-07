// Permisos vistos desde la interfaz: la búsqueda en el nodo del árbol.
//
// La REGLA no está aquí, está en core/permisos.js, y es exactamente la misma que
// usa el motor. Antes esto era un *puerto*: una segunda implementación escrita a
// mano para el navegador. Eso es lo que se separó en el v1 sin que nadie se
// enterara —daba al jefe de departamento permiso sobre todos los módulos cuando
// el motor se lo negaba— y no se descubrió hasta leer los dos ficheros a la vez.
// Ahora este fichero solo resuelve lo que la regla necesita saber:
//
//   quién edita este apartado   →  `nodo.edita`, que el árbol ya trae resuelto
//   es docente de la unidad     →  `usuario.unidades`
//   tiene el apartado asignado  →  `usuario.apartados`
//
// La interfaz tiene la relación «quién lleva qué» del lado del usuario, porque
// es la que necesita para pintar el árbol de una persona concreta; el motor la
// tiene del lado del documento. Son la misma relación vista desde los dos lados,
// y que las dos búsquedas coincidan lo sigue comprobando test.js nodo a nodo
// contra motor/permisos.js.
//
// Diferencia con el v1: aquí el usuario lleva rol y asignaciones por separado.
//   usuario = { id, nombre, rol, departamento, unidades: [idUnidad], apartados: [idSeccion] }
// El v1 mezclaba las dos cosas en un único selector ("Docente DAW y RL" era a la
// vez un rol y una lista de módulos), que no es como funciona el motor.

(function (global) {
  'use strict';

  const C = global.Core.permisos;

  const ROLES = C.ROLES;
  const raizSeccion = C.raizSeccion;

  // Asignar "Evaluación" asigna también sus subapartados, igual que en el motor.
  const asignado = (usuario, seccion) => {
    const lista = (usuario && usuario.apartados) || [];
    return lista.includes(seccion) || lista.includes(raizSeccion(seccion));
  };

  // Los nodos de paso no tienen contenido propio: se resumen, no se editan. Son
  // la raíz del documento, los bloques que agrupan unidades ("MÓDULOS DEL PRIMER
  // CURSO") y la unidad misma, que es una carpeta: lo que se escribe está en sus
  // apartados.
  const PASO = ['raiz', 'bloque', 'unidad'];
  const esContenido = (nodo) => !!nodo && PASO.indexOf(nodo.tipo) === -1;

  const puedeVer = (usuario, doc) => C.puedeVer(usuario, doc);

  function puedeEditar(usuario, nodo, doc) {
    if (!usuario || !nodo) return false;
    if (!puedeVer(usuario, doc)) return false;
    if (!esContenido(nodo)) return false;

    return C.reglaEdicion(usuario, {
      edita: nodo.edita,
      esDocenteDeLaUnidad: !!nodo.unidadId && (usuario.unidades || []).includes(nodo.unidadId),
      tieneApartadoAsignado: asignado(usuario, nodo.seccion),
    });
  }

  function puedeEditarCompartido(usuario, compartido, doc) {
    if (!usuario || !compartido || !puedeVer(usuario, doc)) return false;

    return C.reglaCompartido(usuario, {
      comun: compartido.comun,
      // El motor comprueba aquí, consultando la plantilla, que el apartado del
      // que sale el texto sea de los que edita la jefatura de departamento (y
      // que por tanto se pueda delegar). Aquí no hay plantilla que consultar y
      // tampoco hace falta: en el mockup un compartido marcado `comun` sale por
      // construcción de un apartado común, y todos los comunes son suyos. El día
      // que la interfaz trabaje sobre plantillas importadas de verdad, esto pasa
      // a ser una consulta como la del motor.
      editaApartadoComun: true,
      tieneApartadoAsignado: asignado(usuario, compartido.seccion),
    });
  }

  function puedeDesvincular(usuario, compartido, nodo, doc) {
    if (!compartido) return false;

    return C.reglaDesvincular(usuario, {
      modo: compartido.modo,
      puedeEditarElApartado: puedeEditar(usuario, nodo, doc),
    });
  }

  // Un solo sitio donde se redacta el "por qué no puedes editar esto", para que la
  // interfaz no se invente mensajes distintos en cada panel.
  function motivoBloqueo(usuario, nodo, doc) {
    if (!usuario || !nodo) return '';
    if (!puedeVer(usuario, doc)) return 'Este documento es de otro departamento.';
    if (!esContenido(nodo)) {
      if (nodo.tipo === 'raiz') return 'La portada del documento no tiene contenido propio: se edita apartado por apartado.';
      if (nodo.tipo === 'unidad') return 'La unidad agrupa sus apartados; el texto se escribe dentro de cada uno.';
      return 'Este bloque solo agrupa unidades; el contenido está dentro de cada una.';
    }
    if (usuario.rol === 'jefe_estudios') return 'La jefatura de estudios ve todos los departamentos, pero no edita.';
    if (nodo.edita === 'docentes_del_modulo') {
      return 'Este apartado lo editan los docentes de la unidad, y no la tienes asignada.';
    }
    return 'Este apartado lo edita la jefatura de departamento, salvo que te lo asigne.';
  }

  global.Permisos = {
    ROLES, puedeVer, puedeEditar, puedeEditarCompartido, puedeDesvincular,
    motivoBloqueo, esContenido, raizSeccion,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
