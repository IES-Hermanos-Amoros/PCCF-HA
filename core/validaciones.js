// Las comprobaciones del documento. LA REGLA, en un solo sitio.
//
// Esta es la decisión §2.2 de docs/plan.md y el punto 3.4 de docs/interfaz-web.md. Hasta ahora
// las mismas comprobaciones estaban escritas dos veces: dentro de motor/render-generico.js, donde
// solo se ven cuando ya se ha generado el PDF (la cajita roja del final), y en
// docs/mockup-v2/js/validaciones.js, con la redacción del panel. Aquí viven las reglas; cada lado
// sigue encargándose de buscar qué comprobar.
//
// POR QUÉ NO HAY UNA SOLA FUNCIÓN `validar(documento)`
//
// Porque las dos mitades no tienen delante los mismos datos. El motor recibe `plantilla` + `datos`
// y recorre el documento mientras pinta; la interfaz tiene el árbol ya construido y navega por él.
// Lo que se unifica es la regla («los criterios de un RA reparten su peso»), y la búsqueda
// («qué RA hay, qué criterios tienen, en qué apartado está») se queda en cada lado. Es el mismo
// reparto que en core/permisos.js.
//
// QUÉ SE COMPRUEBA, Y QUIÉN LA USA
//
//   Normativa (fija):
//     - la suma de las ponderaciones de los RA es 100 %          -> avisosSumaRa
//     - los criterios de un RA reparten el peso de ese RA         -> avisosCriteriosDeRa
//
//   Criterio del centro (la severidad es la que tiene hoy cada una):
//     - RA sin situación de aprendizaje                          -> avisosRaSinSituacion   (aviso)
//     - apartado vacío                                           -> apartadoVacio          (aviso)
//     - heredado del curso anterior sin revisar                  -> heredadoSinRevisar     (aviso)
//     - copia propia desactualizada                              -> copiasDesactualizadas  (aviso)
//     - unidad sin docente asignado                              -> sinDocente             (error)
//
//   El motor (PDF) usa SOLO las dos normativas. Las cinco de criterio están aquí para el panel de
//   comprobaciones del E4 y el motor NO las usa: si las imprimiera, aparecerían avisos nuevos en el
//   PDF, que es justo lo que esta extracción no puede hacer.
//
// EL CONVENIO DE LOS CRITERIOS: DECISIÓN PENDIENTE DEL DEPARTAMENTO, NO DE ESTE CÓDIGO
//
// Hay dos convenios legítimos para repartir los criterios de un RA en una programación de FP:
//
//   'peso_del_ra'         los criterios suman el peso del RA (un RA que pondera 15 %, CE que suman 15)
//   'peso_del_ra_o_cien'  además se acepta que los criterios suman 100 % dentro del RA (el peso
//                         real sale de multiplicar)
//
// El documento real usa los dos. De las 160 ponderaciones de la PD de DAW, 22 reparten 100 % dentro
// del RA. El motor es estricto (`peso_del_ra`): la cajita roja del PDF imprime hoy 32 avisos de
// criterios, y 22 de ellos son esos RA con el reparto dentro del RA. Con el convenio laxo quedan 10,
// que no cuadran con ninguno de los dos (p. ej. 10,02 frente a 10, o 100,02 frente a 16,67: son
// descuadres reales, no de convenio). Dos avisos más de la cajita son de la suma de los RA. La
// interfaz acepta los dos (`peso_del_ra_o_cien`). Ni el motor ni la interfaz
// deciden cuál vale: lo decide el departamento, y el convenio entra por parámetro explícito en la
// firma. Cambiar de criterio es cambiar un argumento, no una línea escondida en dos ficheros.
//
// Lo que cuesta aceptar los dos, y es el argumento de fondo: la comprobación se debilita. Con un
// RA que pondera 30 y unos CE que suman 100, ya no se distingue el convenio relativo de alguien
// que se ha equivocado escribiendo 100 en lugar de 30. Por eso el motor es estricto.
//
// LA SUMA DE LOS RA: EL ALCANCE LO DECIDE CADA LADO
//
// `avisosSumaRa` recibe una lista de pesos y dice si suma 100. Cuál es esa lista no es regla:
// el motor solo la comprueba si el campo tiene más de una tabla de ponderaciones
// (`tablas.length > 1`), porque una tabla suelta suele ser un fragmento, y sumarla daría un error
// falso. La interfaz le pasa siempre el apartado entero. Cada lado hace ese filtro antes de llamar.
//
// LOS TEXTOS: EL DEL MOTOR MANDA
//
// El texto que se imprime es el que ha visto el departamento, así que el texto de cada aviso
// normativo es el del motor (lo que va en `titulo`, y es lo único que la cajita roja imprime).
// `detalle` es explicación para el panel y el motor no lo usa.
//
// Esto es lógica pura: sin DOM, sin localStorage, sin red, sin node. Vale como <script> en el
// mockup, como `require` en el motor y en las pruebas, y como `import` desde Next. Cuelga de
// `global.Core.validaciones`, igual que core/permisos.js y core/sa.js.
//
// Los avisos tienen la forma { severidad: 'error' | 'aviso' | 'info', titulo, detalle }. El campo
// `destino` lo pone quien busca el apartado (el mockup), no esta capa.

(function (global) {
  'use strict';

  const CONVENIOS_CE = Object.freeze({
    PESO_DEL_RA: 'peso_del_ra',
    PESO_DEL_RA_O_CIEN: 'peso_del_ra_o_cien',
  });

  // Tolerancia de los cálculos en coma flotante. Es la del motor, y se usa tal cual en los dos lados.
  const TOLERANCIA = 0.01;

  // Mismo formato que la cajita roja: coma decimal, dos cifras como máximo y espacio antes del %.
  const porcentaje = (n) => (n === undefined || n === null ? '' : `${Number(n).toLocaleString('es-ES', { maximumFractionDigits: 2 })} %`);

  // Suma en el mismo orden en que llegan los pesos: con coma flotante el orden importa, y el texto
  // impreso depende del resultado.
  const sumaPesos = (pesos) => (pesos || []).reduce((a, p) => a + (p || 0), 0);

  function comprobarConvenio(convenioCe) {
    if (convenioCe !== CONVENIOS_CE.PESO_DEL_RA && convenioCe !== CONVENIOS_CE.PESO_DEL_RA_O_CIEN) {
      throw new Error('convenioCe desconocido: ' + convenioCe + ' (valores: peso_del_ra | peso_del_ra_o_cien)');
    }
  }

  // ---------------------------------------------------------------- normativa: ponderaciones

  // Sí los criterios de un RA reparten su peso según el convenio indicado.
  function cuadraCriterios(peso, pesosCe, convenioCe) {
    comprobarConvenio(convenioCe);
    const suma = sumaPesos(pesosCe);
    if (Math.abs(suma - (peso || 0)) < TOLERANCIA) return true;
    return convenioCe === CONVENIOS_CE.PESO_DEL_RA_O_CIEN && Math.abs(suma - 100) < TOLERANCIA;
  }

  // Aviso de un RA cuyos criterios no reparten su peso. Lista vacía si cuadran.
  //   { ra, peso, pesosCe }
  function avisosCriteriosDeRa({ ra, peso, pesosCe }, convenioCe) {
    if (cuadraCriterios(peso, pesosCe, convenioCe)) return [];
    const suma = sumaPesos(pesosCe);
    const reglaCorta = convenioCe === CONVENIOS_CE.PESO_DEL_RA_O_CIEN
      ? 'el peso del RA (' + porcentaje(peso) + ') o 100 % si se reparten dentro del RA'
      : 'el peso del RA (' + porcentaje(peso) + ')';
    return [{
      severidad: 'error',
      titulo: `RA${ra}: los criterios suman ${porcentaje(suma)} y el RA pondera ${porcentaje(peso)}.`,
      detalle: 'Los criterios de un resultado de aprendizaje tienen que sumar ' + reglaCorta + '.',
    }];
  }

  // Sí la suma de los RA es 100 %.
  const sumaRaCuadra = (suma) => Math.abs(suma - 100) <= TOLERANCIA;

  // Aviso de la suma de los RA. `pesos` es la lista que decide el llamante (ver cabecera).
  function avisosSumaRa(pesos) {
    const suma = sumaPesos(pesos);
    if (sumaRaCuadra(suma)) return [];
    return [{
      severidad: 'error',
      titulo: `La suma de las ponderaciones de los RA es ${porcentaje(suma)} y debería ser 100 %.`,
      detalle: 'La suma de los resultados de aprendizaje tiene que ser exactamente 100 %.',
    }];
  }

  // ---------------------------------------------------------------- criterio del centro

  function avisosRaSinSituacion(numeros) {
    return (numeros || []).map((num) => ({
      severidad: 'aviso',
      titulo: 'RA' + num + ' no aparece en ninguna situación de aprendizaje',
      detalle: 'Todos los resultados de aprendizaje tienen que trabajarse en al menos una situación.',
    }));
  }

  // `estado` lleva `bloques` (lista) y `origen`; `lugar` es cómo se nombra el apartado en el texto.
  function apartadoVacio(estado, lugar) {
    if (!estado || !((estado.bloques && estado.bloques.length) && estado.origen !== 'vacio')) {
      return [{
        severidad: 'aviso',
        titulo: 'Apartado vacío',
        detalle: 'No se ha importado ni escrito nada todavía en ' + lugar + '.',
      }];
    }
    return [];
  }

  function heredadoSinRevisar(estado) {
    if (!estado || estado.origen !== 'heredado') return [];
    return [{
      severidad: 'aviso',
      titulo: 'Heredado del curso anterior, sin revisar',
      detalle: 'El texto viene del curso pasado tal cual. Hay que mirarlo y marcarlo como revisado, o cambiarlo.',
    }];
  }

  // `copias`: [{ id, versionOrigen, version }], con la versión del texto compartido de origen y la actual.
  function copiasDesactualizadas(copias) {
    return (copias || []).filter((c) => c.version > c.versionOrigen).map((c) => ({
      severidad: 'aviso',
      titulo: 'Copia propia desactualizada (v' + c.versionOrigen + ' frente a v' + c.version + ')',
      detalle: 'Este apartado se desvinculó del texto compartido ' + c.id + ' y el original ha cambiado desde entonces.',
    }));
  }

  function sinDocente(tituloUnidad, numDocentes) {
    if (numDocentes) return [];
    return [{
      severidad: 'error',
      titulo: 'Sin docente asignado: ' + tituloUnidad,
      detalle: 'Mientras no tenga profesorado asignado, nadie salvo la jefatura de departamento puede editarla.',
    }];
  }

  // ---------------------------------------------------------------- sobre una lista de avisos

  const cuenta = (avisos) => (avisos || []).reduce((c, a) => { c[a.severidad] = (c[a.severidad] || 0) + 1; return c; },
    { error: 0, aviso: 0, info: 0 });

  // Puerta de aprobación: con errores abiertos el documento no se aprueba; los avisos no bloquean.
  const puedeAprobarse = (avisos) => cuenta(avisos).error === 0;

  const api = {
    CONVENIOS_CE,
    porcentaje,
    sumaPesos,
    cuadraCriterios,
    avisosCriteriosDeRa,
    sumaRaCuadra,
    avisosSumaRa,
    avisosRaSinSituacion,
    apartadoVacio,
    heredadoSinRevisar,
    copiasDesactualizadas,
    sinDocente,
    cuenta,
    puedeAprobarse,
  };

  // Vale como <script> en el mockup, como `require` en el motor y en las pruebas, y como `import`
  // desde Next. Cuelga de `global.Core` igual que los otros módulos de core/.
  global.Core = global.Core || {};
  global.Core.validaciones = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
