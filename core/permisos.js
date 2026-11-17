// Quién ve y quién edita cada parte de un documento. LA REGLA, en un solo sitio.
//
// Esta es la decisión §2.2 de docs/plan.md, y viene de una avería real: en el
// mockup v1 había dos implementaciones de esto —una en el motor y otra en el
// navegador— y se separaron sin que nadie se enterara. El navegador dejaba al
// jefe de departamento editar todos los módulos y el motor se lo negaba, y la
// diferencia solo se descubrió leyendo los dos ficheros a la vez. Un permiso que
// depende de qué mitad de la aplicación pregunte no es un permiso.
//
// POR QUÉ NO HAY UNA SOLA FUNCIÓN `puedeEditar()`
//
// Porque las dos mitades no tienen delante los mismos datos, y forzarlas a
// tenerlos sería peor. La relación «quién lleva este módulo» se guarda en el
// documento (`datos.instancias[].docentes`, `datos.asignaciones`), pero una
// interfaz que ya ha construido el árbol la tiene a mano del otro lado, por
// usuario (`usuario.unidades`, `usuario.apartados`). Son dos vistas de la misma
// relación, y cada una es la cómoda en su sitio.
//
// Lo que se duplicaba —y lo que se separó— no era la búsqueda: era la REGLA. Así
// que aquí vive la regla, y recibe la búsqueda ya resuelta en booleanos. Cada
// lado hace su propia consulta y los dos deciden con este código:
//
//   motor/permisos.js            busca en plantilla + datos
//   docs/mockup-v2/js/permisos.js  busca en el nodo del árbol + el usuario
//
// Que las dos búsquedas coinciden lo sigue comprobando docs/mockup-v2/test.js
// nodo a nodo y usuario a usuario sobre los siete documentos, que es la prueba
// que más vale de todo el mockup.
//
// LOS CUATRO ROLES
//
//   admin              coordinación técnica: ve y edita todo (soporte)
//   jefe_estudios      ve los documentos de todos los departamentos, en
//                      cualquier estado; NO edita nada, que es quien aprueba.
//                      Configura dos cosas que no son contenido: las
//                      comprobaciones (`puedeConfigurarComprobaciones`) y cómo
//                      se imprime (`puedeConfigurarImpresion`)
//   jefe_departamento  su departamento: apartados comunes, textos compartidos y
//                      todos los módulos, los tenga asignados o no
//   docente            ve los de su departamento; edita los módulos que tiene
//                      asignados y los apartados comunes que se le asignen

(function (global) {
  'use strict';

  const ROLES = {
    admin: 'Admin',
    jefe_estudios: 'Jefatura de estudios',
    jefe_departamento: 'Jefatura de departamento',
    docente: 'Docente',
  };

  // ---------------------------------------------------------------- la regla

  // `donde` solo necesita llevar `departamento`: vale tanto el documento del
  // repositorio como los `datos` del importador.
  // Ausente es ACTIVA. Si la ausencia significara «de baja», al añadir el campo se
  // quedaría fuera todo el que ya estuviera guardado de antes, y nadie gana nada
  // por esa interpretación: quien está de baja no consigue sesión y no llega a
  // preguntar. Esto es la segunda cerradura, no la primera.
  const estaActivo = (usuario) => !!usuario && usuario.activo !== false;

  function puedeVer(usuario, donde) {
    if (!usuario || !estaActivo(usuario)) return false;
    if (usuario.rol === 'admin' || usuario.rol === 'jefe_estudios') return true;
    return !!donde && !!donde.departamento && usuario.departamento === donde.departamento;
  }

  // Quién puede editar un apartado. El llamante tiene que haber comprobado ya
  // `puedeVer`, y que el apartado tenga contenido propio (un bloque que solo
  // agrupa unidades no se edita, se resume).
  //
  //   edita                  'jefe_departamento' | 'docentes_del_modulo' | null
  //   esDocenteDeLaUnidad    el usuario lleva la unidad de este apartado
  //   tieneApartadoAsignado  se le ha asignado este apartado común (o su raíz)
  //
  // El `return false` final es deliberado: un apartado cuyo `edita` no sea uno
  // de los dos valores conocidos no lo edita nadie. Si algún día se añade un
  // tercer valor, el efecto de olvidarse de este fichero es que no se pueda
  // editar, no que pueda cualquiera.
  function reglaEdicion(usuario, { edita, esDocenteDeLaUnidad, tieneApartadoAsignado } = {}) {
    if (!usuario || !estaActivo(usuario)) return false;
    if (usuario.rol === 'admin') return true;
    if (usuario.rol === 'jefe_estudios') return false;

    if (edita === 'docentes_del_modulo') {
      // Aquí es donde se separaron las dos implementaciones en el v1: la
      // jefatura de departamento edita cualquier módulo, lo tenga asignado o no.
      // Es la regla del departamento y manda esta.
      if (usuario.rol === 'jefe_departamento') return true;
      return !!esDocenteDeLaUnidad;
    }

    if (edita === 'jefe_departamento') {
      return usuario.rol === 'jefe_departamento' || !!tieneApartadoAsignado;
    }

    return false;
  }

  // Editar un texto compartido cambia todos los módulos que sigan vinculados,
  // así que es más que editar un apartado: lo hace la jefatura de departamento,
  // o quien tenga asignado el apartado común del que procede el texto.
  //
  //   comun                  el texto sale de un apartado común del documento
  //   editaApartadoComun     ese apartado es de los que edita la jefatura de
  //                          departamento (y por tanto se puede delegar)
  //   tieneApartadoAsignado  se le ha delegado a este usuario
  function reglaCompartido(usuario, { comun, editaApartadoComun, tieneApartadoAsignado } = {}) {
    if (!usuario || !estaActivo(usuario)) return false;
    if (usuario.rol === 'admin') return true;
    if (usuario.rol === 'jefe_estudios') return false;
    if (usuario.rol === 'jefe_departamento') return true;
    return !!comun && !!editaApartadoComun && !!tieneApartadoAsignado;
  }

  // Desvincular deja en la unidad una copia propia y editable. Solo con los
  // textos «sugeridos»: los «obligatorios» no se pueden esquivar, que es la
  // diferencia entre los dos modos.
  function reglaDesvincular(_usuario, { modo, puedeEditarElApartado } = {}) {
    return modo === 'sugerido' && !!puedeEditarElApartado;
  }

  // Quién reparte las unidades entre el profesorado. Es la jefatura del
  // departamento —es quien reparte la carga— y el soporte. La jefatura de
  // estudios no: ve todos los departamentos y no toca nada, que es lo que la
  // deja en condiciones de aprobar el documento.
  //
  // Vivía en la ruta que lo usa. Está aquí por lo mismo que lo demás: el día que
  // haya una segunda pantalla que pregunte lo mismo, que no se conteste distinto.
  function puedeRepartirUnidades(usuario, donde) {
    if (!puedeVer(usuario, donde)) return false;
    return usuario.rol === 'admin' || usuario.rol === 'jefe_departamento';
  }

  // Quién decide qué personas llevan cada apartado COMÚN del documento (los que edita la jefatura y
  // están fuera de los módulos), cuando requieren colaboración. El criterio es el del reparto de
  // unidades, pero es otra pregunta: si un día cambia una, la otra no tiene por qué enterarse.
  function puedeAsignarApartados(usuario, donde) {
    if (!puedeVer(usuario, donde)) return false;
    return usuario.rol === 'admin' || usuario.rol === 'jefe_departamento';
  }

  // Quién cambia la ESTRUCTURA del documento: renombrar un apartado, añadir
  // uno, moverlo o retirarlo (core/plantilla.js). La jefatura del departamento
  // —que es quien responde de qué apartados tiene la programación— y el
  // soporte. El docente escribe lo suyo pero no decide qué apartados hay, y la
  // jefatura de estudios no toca nada, que es lo que la deja en condiciones de
  // aprobar el documento.
  //
  // Hoy contesta lo mismo que `puedeRepartirUnidades`, y aun así es otra
  // función: son dos preguntas distintas —quién reparte la carga y quién decide
  // la estructura— y el día que una de las dos cambie, la otra no tiene por qué
  // enterarse. Lo que no se puede duplicar es la REGLA, y la regla es esta
  // línea, no el parecido.
  function puedeCambiarEstructura(usuario, donde) {
    if (!puedeVer(usuario, donde)) return false;
    return usuario.rol === 'admin' || usuario.rol === 'jefe_departamento';
  }

  // Quién cambia la estructura de UN APARTADO concreto: los campos que lleva, su nombre y su orden.
  // Es la regla de la estructura propia de un módulo (core/estructura-modulo.js), y es otra pregunta
  // que `puedeCambiarEstructura`, que gobierna los apartados del documento entero (añadir, mover y
  // retirar apartados).
  //
  //   edita                  'jefe_departamento' | 'docentes_del_modulo' | null, del apartado
  //   esDocenteDeLaUnidad    el usuario lleva la unidad de este apartado
  //   tieneApartadoAsignado  se le ha asignado este apartado común (o su raíz)
  //
  // LA DECISIÓN DEL DEPARTAMENTO: el documento es totalmente configurable por parte de quien tiene
  // permisos en ese apartado, sea cual sea el apartado. Quien puede ESCRIBIR un apartado puede
  // CONFIGURAR sus campos, sea de módulo o común:
  //
  //   · un apartado de módulo lo configuran el soporte, la jefatura del departamento —en cualquier
  //     módulo, lo lleve o no— y el docente que lleva esa unidad;
  //   · un apartado común, el soporte, la jefatura del departamento y quien lo tenga asignado;
  //   · la jefatura de estudios, nunca, en ninguno: aprueba, no cambia el documento.
  //
  // (Antes un apartado común lo configuraba solo la jefatura, aunque otra persona lo tuviera
  // asignado: asignarlo delegaba el contenido y no la forma. El departamento lo ha cambiado.)
  //
  // HOY CONTESTA EXACTAMENTE LO MISMO QUE `reglaEdicion`, y por eso no repite su cuerpo: la delega.
  // Quedan dos nombres y una sola regla. Hay dos preguntas —quién escribe y quién configura— y es
  // útil que el sitio que llama diga cuál está haciendo; pero la decisión es que la respuesta sea la
  // misma, y dos cuerpos iguales son justo lo que se separa sin que nadie se entere (el mockup v1,
  // arriba). Si el día de mañana el departamento quiere que configurar sea más (o menos) que
  // escribir, este es el único sitio que se toca, y la diferencia queda escrita aquí y no en un
  // `if` perdido en una ruta.
  //
  // Lo que NO cubre esta regla, porque no es de permisos: que el apartado exista, que no esté
  // retirado y que la versión sea la activa. Eso lo comprueba la ruta.
  function reglaEstructuraPropia(usuario, datos) {
    return reglaEdicion(usuario, datos);
  }

  // Quién configura las COMPROBACIONES de un documento: qué comprobaciones de criterio del centro
  // se le aplican, con qué severidad, y con qué convenio se cuentan las ponderaciones de los
  // criterios (core/validaciones.js).
  //
  // LA JEFATURA DE ESTUDIOS, que es quien aprueba, y el soporte. Es la propuesta de docs/plan.md §7
  // y tiene su lógica: cambiar esto MUEVE EL LISTÓN de lo que se puede aprobar —desactivar una
  // comprobación o bajarle la severidad hace aprobable un documento que antes no lo era—, así que
  // quien pone el listón tiene que ser quien decide si se ha superado. Si lo configurara el
  // departamento, la puerta de aprobación la abriría quien quiere pasar por ella.
  //
  // Y es la primera regla de este fichero en la que la jefatura de estudios PUEDE ESCRIBIR algo. No
  // contradice que no edite nada: no toca el contenido del documento, decide con qué se mide. El
  // resto lo ve en modo lectura, que es lo que la ruta sirve con `puedeConfigurar`.
  function puedeConfigurarComprobaciones(usuario, donde) {
    if (!puedeVer(usuario, donde)) return false;
    return usuario.rol === 'admin' || usuario.rol === 'jefe_estudios';
  }

  // Cómo se imprime un documento: hasta qué nivel llega el índice y qué apartados empiezan en página
  // nueva (core/impresion.js). La jefatura de departamento, la de estudios y el soporte.
  //
  // ES LA ÚNICA COSA QUE LA JEFATURA DE ESTUDIOS CAMBIA, y hay que decirlo porque arriba está escrito
  // que no edita nada, que es quien aprueba. La excepción está decidida por el departamento y tiene
  // una razón: esto no es contenido del documento, es cómo sale en el papel. No mueve el listón de lo
  // que se puede aprobar, no cambia ni un apartado y no escribe nada de nadie. Quien firma el
  // documento impreso tiene que poder decidir cómo se imprime.
  //
  // Es una función aparte de `puedeConfigurarComprobaciones` aunque las dos sean «configurar»: esas
  // SÍ mueven el listón y por eso las decide solo quien aprueba. El día que una de las dos cambie, la
  // otra no tiene por qué enterarse.
  function puedeConfigurarImpresion(usuario, donde) {
    if (!puedeVer(usuario, donde)) return false;
    return usuario.rol === 'admin' || usuario.rol === 'jefe_estudios' || usuario.rol === 'jefe_departamento';
  }

  // Quién cambia cuál es la versión activa de un documento, y quién borra una versión alternativa
  // (docs/plan.md §8). La jefatura del departamento, en su departamento, y el soporte. Subir una versión
  // alternativa no es esto: es importar, y lo pueden los mismos roles que ya importan.
  //
  // Son dos preguntas y dos funciones aunque hoy contesten lo mismo: activar es reversible, porque la
  // anterior queda como alternativa con sus ediciones, y borrar no. El día que una de las dos cambie, la
  // otra no tiene por qué enterarse.
  function puedeActivarVersion(usuario, donde) {
    if (!puedeVer(usuario, donde)) return false;
    return usuario.rol === 'admin' || usuario.rol === 'jefe_departamento';
  }

  function puedeBorrarVersion(usuario, donde) {
    if (!puedeVer(usuario, donde)) return false;
    return usuario.rol === 'admin' || usuario.rol === 'jefe_departamento';
  }

  // ------------------------------------------------- búsqueda en la plantilla

  // Los ids de sección son rutas con '/', igual que los que produce el
  // importador: 'modulos/desarrollo-curricular/competencias-y-objetivos'.
  const contiene = (sec, id) => id === sec.id || String(id).startsWith(sec.id + '/');

  // El apartado de la plantilla que corresponde a un id (el más profundo que lo
  // contenga) y a quién le corresponde editarlo. Los subapartados heredan de su
  // padre salvo que digan otra cosa, así que se baja el árbol quedándose con el
  // último `edita` que se haya visto.
  function quienEdita(plantilla, idSeccion) {
    let edita = null;
    let nivel = plantilla && plantilla.secciones;
    for (;;) {
      const s = (nivel || []).find((x) => contiene(x, idSeccion));
      if (!s) break;
      if (s.edita) edita = s.edita;
      nivel = s.hijos;
    }
    return edita;
  }

  // El apartado común de primer nivel al que pertenece una sección. Hay dos
  // formas de averiguarlo y las dos valen: con la plantilla delante, buscando;
  // y sin ella, cortando el id por el primer '/'. La interfaz usa la segunda
  // porque el árbol ya está construido y no necesita volver a recorrerlo.
  const apartadoComun = (plantilla, idSeccion) =>
    ((plantilla && plantilla.secciones || []).find((s) => contiene(s, idSeccion)) || {}).id;

  const raizSeccion = (seccion) => String(seccion || '').split('/')[0];

  // -------------------------------------------------------- el id del usuario

  // Un usuario llega con el identificador en un campo o en otro según de dónde
  // venga: el repositorio devuelve `_id`, que es lo que guarda Mongo, y el motor
  // y el mockup usan `id`. Las dos formas se cruzan en cuanto la API coge un
  // usuario del repositorio y le pregunta al motor si puede editar algo.
  //
  // Y el fallo que provoca es el peor de los posibles: no es un error, es un
  // `false`. `datos.instancias[i].docentes.includes(undefined)` es false y
  // `asignaciones[k].includes(undefined)` también, así que un docente
  // simplemente no puede editar su propio módulo y en ningún sitio consta por
  // qué. Un permiso que se niega en silencio no se distingue de un permiso que
  // no se tiene.
  //
  // Por eso el id se lee siempre por aquí y nunca con `usuario.id` a pelo.
  const idDeUsuario = (usuario) => {
    if (!usuario) return null;
    const id = usuario.id != null ? usuario.id : usuario._id;
    return id == null ? null : String(id);
  };

  // ---------------------------------------------------------------- exportado

  const api = {
    ROLES,
    puedeVer,
    reglaEdicion,
    reglaCompartido,
    reglaDesvincular,
    quienEdita,
    apartadoComun,
    raizSeccion,
    idDeUsuario,
    estaActivo,
    puedeRepartirUnidades,
    puedeAsignarApartados,
    puedeCambiarEstructura,
    reglaEstructuraPropia,
    puedeConfigurarComprobaciones,
    puedeConfigurarImpresion,
    puedeActivarVersion,
    puedeBorrarVersion,
  };

  // Vale como <script> en el mockup, como `require` en el motor y en las
  // pruebas, y como `import` desde Next. Por eso cuelga de un único objeto
  // `Core` en lugar de soltar un global por módulo.
  global.Core = global.Core || {};
  global.Core.permisos = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
