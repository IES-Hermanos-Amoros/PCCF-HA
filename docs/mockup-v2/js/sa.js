// Situaciones de aprendizaje: verlas, cambiarlas y crear otras. Lado del mockup.
//
// La LÓGICA de la ficha (la forma, la tabla que sale impresa, el resumen SA × RA,
// las operaciones sobre la lista) está en core/sa.js, la misma que usa el motor
// del PDF. Este fichero se queda con lo que es propio del prototipo:
//
//   - la persistencia en localStorage (cargar, persistir, reiniciar, guardarLista):
//     el mockup guarda los cambios del navegador; core/ no sabe de dónde sale nada;
//   - la dependencia de global.Importado: los datos de muestra de las unidades.
//     `listar` lee de ahí lo importado y `raDe` lee de ahí los RA del módulo;
//   - las rutas de la plantilla (SEC_SA, SEC_RA_CE) con las que la interfaz
//     encuentra sus nodos;
//   - el texto de ayuda del formulario.
//
// Las funciones de este fichero que devuelven una ficha o una lista lo hacen
// siempre a través de core/sa.js, para que la regla no se pueda separar de la del
// motor.
//
// La API pública no cambia: ui.js, contenido.js, validaciones.js y test.js la usan
// tal cual.
//
// Diferencia conservada (ver core/sa.js): una ficha nueva en el mockup nace con la
// evaluación '1ª' (`vacia` y `nueva`), mientras que el motor la deja vacía.
// No se resuelve aquí; se pasa a `fichaVacia` como parámetro.

(function (global) {
  'use strict';

  const CLAVE = 'pccf-ha-v2-sa';
  const I = global.Importado || null;
  const C = global.Core.sa;

  const EVALUACIONES = C.EVALUACIONES;
  const EVALUACION_NUEVA = EVALUACIONES[0];
  const SEC_SA = 'modulos/situaciones-de-aprendizaje';
  const SEC_RA_CE = 'modulos/desarrollo-curricular/resultados-de-aprendizaje-y-criterios-de-evaluacion';

  // Los campos del cuerpo, los de core/ más el texto de ayuda del formulario.
  const CAMPOS = C.CAMPOS.map((c) => (c.id === 'ce'
    ? Object.assign({}, c, { ayuda: 'Uno por línea. Se pueden marcar desde los criterios del módulo.' })
    : Object.assign({}, c)));

  // ---------------------------------------------------------------- estado
  // Lo importado es el punto de partida. En cuanto se toca una unidad, se guarda
  // su lista entera: un mockup no necesita fusionar cambios, y así lo que se ve
  // es exactamente lo que hay guardado.
  let cambiadas = {};

  function cargar() {
    try {
      const txt = global.localStorage.getItem(CLAVE);
      cambiadas = txt ? JSON.parse(txt) : {};
    } catch (e) { cambiadas = {}; }
  }
  function persistir() {
    try { global.localStorage.setItem(CLAVE, JSON.stringify(cambiadas)); } catch (e) { /* sin localStorage */ }
  }
  function reiniciar() { cambiadas = {}; persistir(); }

  const importadas = (unidadId) => {
    const u = I && I.UNIDADES ? I.UNIDADES[unidadId] : null;
    return u && Array.isArray(u.sa) ? JSON.parse(JSON.stringify(u.sa)) : [];
  };

  // Una ficha vacía del mockup. Ver la nota de diferencia en la cabecera.
  const vacia = (num) => C.fichaVacia(num, EVALUACION_NUEVA);

  function listar(unidadId) {
    if (!unidadId) return [];
    const propias = cambiadas[unidadId];
    const lista = propias ? JSON.parse(JSON.stringify(propias)) : importadas(unidadId);
    return lista.map((f, i) => Object.assign(vacia(i + 1), f));
  }

  const guardarLista = (unidadId, lista) => {
    cambiadas[unidadId] = C.renumerar(lista);
    persistir();
    return listar(unidadId);
  };

  const ficha = (unidadId, num) => listar(unidadId).filter((f) => f.num === Number(num))[0] || null;

  function guardar(unidadId, f) {
    return guardarLista(unidadId, C.reemplazarEn(listar(unidadId), f));
  }

  function nueva(unidadId) {
    const r = C.anadirVacia(listar(unidadId), EVALUACION_NUEVA);
    guardarLista(unidadId, r.lista);
    return r.num;
  }

  function duplicar(unidadId, num) {
    const r = C.duplicarEn(listar(unidadId), num);
    if (!r) return null;
    guardarLista(unidadId, r.lista);
    return r.num;
  }

  function borrar(unidadId, num) {
    return guardarLista(unidadId, C.borrarDe(listar(unidadId), num));
  }

  function mover(unidadId, num, delta) {
    const r = C.moverEn(listar(unidadId), num, delta);
    if (!r) return null;
    guardarLista(unidadId, r.lista);
    return r.num;
  }

  const tocada = (unidadId) => Object.prototype.hasOwnProperty.call(cambiadas, unidadId);

  // ---------------------------------------------------------------- RA del módulo
  // Los resultados de aprendizaje y sus criterios, del apartado del propio
  // módulo. Sirven para elegir en el editor en lugar de escribirlos a mano. Lee de
  // los datos importados, por eso se queda aquí.
  function raDe(unidadId) {
    const u = I && I.UNIDADES ? I.UNIDADES[unidadId] : null;
    const sec = u && u.secciones ? u.secciones[SEC_RA_CE] : null;
    if (!sec || !Array.isArray(sec.raCe)) return [];
    return sec.raCe.map((ra) => ({
      num: ra.num,
      texto: ra.texto || '',
      ce: (ra.ce || []).map((ce) => ({ letra: ce.letra, texto: ce.texto || '' })),
    }));
  }

  const numerosRa = (unidadId) => raDe(unidadId).map((r) => r.num);

  // ---------------------------------------------------------------- delegados en core/
  // Estas funciones de la API no tienen nada propio: se leen de core/sa.js con la
  // lista de este mockup ya resuelta.
  const raSinSituacion = (unidadId) => C.raSinSituacion(listar(unidadId), numerosRa(unidadId));
  const matriz = (unidadId) => C.matriz(listar(unidadId), numerosRa(unidadId));

  global.SA = {
    CAMPOS, CABECERA_ACTIVIDADES: C.CABECERA_ACTIVIDADES, COLUMNAS: C.COLUMNAS, EVALUACIONES, SEC_SA, SEC_RA_CE,
    vacia, listar, ficha, guardar, nueva, duplicar, borrar, mover, tocada, guardarLista,
    filas: C.filasDeFicha, matriz, raDe, raSinSituacion,
    lineaCe: C.lineaCe, raDeTexto: C.raDeTexto, lineas: C.lineas, texto: C.deLineas,
    cargar, persistir, reiniciar,
    hayImportado: () => !!(I && I.UNIDADES),
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
