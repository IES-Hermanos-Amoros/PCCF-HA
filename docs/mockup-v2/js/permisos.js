// Puerto al navegador de poc-pdfmake/lib/permisos.js. Cada rama de `puedeEditar`
// se corresponde con una del motor, y docs/mockup-v2/test.js compara las dos
// implementaciones nodo a nodo para que no se separen: el v1 se separó justo aquí
// (daba al jefe de departamento permiso sobre todos los módulos cuando el motor
// se lo negaba) y nadie se enteró hasta leer los dos ficheros a la vez.
//
// La regla que manda es la del departamento, y ya está aplicada en el motor:
// el jefe de departamento edita cualquier módulo, lo tenga asignado o no.
//
// Diferencia con el v1: aquí el usuario lleva rol y asignaciones por separado.
//   usuario = { id, nombre, rol, departamento, unidades: [idUnidad], apartados: [idSeccion] }
// El v1 mezclaba las dos cosas en un único selector ("Docente DAW y RL" era a la
// vez un rol y una lista de módulos), que no es como funciona el motor.

(function (global) {
  'use strict';

  const ROLES = {
    admin: 'Admin',
    jefe_estudios: 'Jefatura de estudios',
    jefe_departamento: 'Jefatura de departamento',
    docente: 'Docente',
  };

  // Apartado común de primer nivel al que pertenece una sección: es lo que hace
  // `apartadoComun()` en el motor, aprovechando que los ids son rutas con '/'.
  const raizSeccion = (seccion) => String(seccion || '').split('/')[0];

  const asignado = (usuario, seccion) => {
    const lista = usuario.apartados || [];
    return lista.includes(seccion) || lista.includes(raizSeccion(seccion));
  };

  function puedeVer(usuario, doc) {
    if (!usuario) return false;
    if (usuario.rol === 'admin' || usuario.rol === 'jefe_estudios') return true;
    return !!doc && !!doc.departamento && usuario.departamento === doc.departamento;
  }

  // Los nodos de paso no tienen contenido propio: se resumen, no se editan. Son
  // la raíz del documento, los bloques que agrupan unidades ("MÓDULOS DEL PRIMER
  // CURSO") y la unidad misma, que es una carpeta: lo que se escribe está en sus
  // apartados.
  const PASO = ['raiz', 'bloque', 'unidad'];
  const esContenido = (nodo) => !!nodo && PASO.indexOf(nodo.tipo) === -1;

  function puedeEditar(usuario, nodo, doc) {
    if (!usuario || !nodo) return false;
    if (!puedeVer(usuario, doc)) return false;
    if (!esContenido(nodo)) return false;
    if (usuario.rol === 'admin') return true;
    if (usuario.rol === 'jefe_estudios') return false;

    if (nodo.edita === 'docentes_del_modulo') {
      if (usuario.rol === 'jefe_departamento') return true;
      return !!nodo.unidadId && (usuario.unidades || []).includes(nodo.unidadId);
    }
    if (nodo.edita === 'jefe_departamento') {
      return usuario.rol === 'jefe_departamento' || asignado(usuario, nodo.seccion);
    }
    return false;
  }

  // Texto compartido: lo edita el jefe de departamento, o quien edite el apartado
  // común del que procede.
  function puedeEditarCompartido(usuario, compartido, doc) {
    if (!usuario || !compartido || !puedeVer(usuario, doc)) return false;
    if (usuario.rol === 'admin') return true;
    if (usuario.rol === 'jefe_estudios') return false;
    if (usuario.rol === 'jefe_departamento') return true;
    return !!compartido.comun && asignado(usuario, compartido.seccion);
  }

  // Desvincular deja una copia propia en la unidad: solo textos "sugeridos" y
  // solo si el usuario puede editar ese apartado de esa unidad.
  function puedeDesvincular(usuario, compartido, nodo, doc) {
    if (!compartido || compartido.modo !== 'sugerido') return false;
    return puedeEditar(usuario, nodo, doc);
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
