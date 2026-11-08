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
//     - situación de aprendizaje sin evaluación                  -> avisosSaSinEvaluacion  (aviso)
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
// Y POR ESO EL AVISO SE DISTINGUE (E4)
//
// El panel de comprobaciones tiene que usar el MISMO convenio que el motor, o sus avisos dejan de
// coincidir uno a uno con los de la cajita roja del PDF, que es el criterio de aceptación del E4.
// Con el estricto, de los 34 avisos del documento real 22 no son erratas: son los RA del otro
// convenio. Esconderlos cambiando de convenio rompería la coincidencia; dejarlos como 22 errores
// indistinguibles de los 10 descuadres de verdad (14,94 % donde debería haber 15 %) deja el panel
// inútil.
//
// Así que el aviso lleva el mismo `titulo` —el que imprime el PDF, que no se toca— y, cuando los
// criterios suman EXACTAMENTE 100 %, un `detalle` que lo dice con esas palabras y la marca
// `convenio: 'cien_dentro_del_ra'`, para que la interfaz pueda separar «esto habrá que decidirlo»
// de «aquí hay una errata». La severidad no cambia: bajarla a aviso sería decidir el convenio por
// la puerta de atrás, y esa decisión es del departamento.
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
//
// ================================================================ LO QUE SE PUEDE CONFIGURAR (E7)
//
// Hasta aquí las siete comprobaciones estaban escritas a mano y no se podían tocar desde ninguna
// parte. La propuesta de docs/plan.md §7 —«una tabla de reglas { activa, severidad } por documento
// que mantenga la jefatura de estudios»— está implementada desde abajo, y lo primero que hace falta
// para no equivocarla es separar DOS COSAS QUE NO SON LA MISMA:
//
//   1. EL CONVENIO DE PONDERACIÓN DE LOS CRITERIOS (`convenioCe`). No es activar ni desactivar una
//      regla: es decir cuál de los DOS CONVENIOS LEGÍTIMOS usa el centro (ver más arriba). Con el
//      laxo, los 22 avisos de la PD de DAW que reparten 100 % dentro del RA dejan de ser avisos
//      porque SON CORRECTOS, no porque se hayan silenciado. Es la diferencia entre decidir y tapar.
//
//   2. LAS COMPROBACIONES DE CRITERIO DEL CENTRO, que sí llevan `{ activa, severidad }`: las seis
//      de la lista de arriba. Son del criterio del centro, así que el centro las decide.
//
// LAS DOS NORMATIVAS NO SE TOCAN. Que los RA sumen 100 % y que los criterios repartan el peso de su
// RA salen del real decreto del título, no del criterio del centro: ni se desactivan ni se les baja
// la severidad, y pedirlo es un 400 con el motivo. Lo que sí se decide sobre la segunda es el
// CONVENIO, que es el punto 1 y entra por otra puerta.
//
// POR QUÉ EL CATÁLOGO ESTÁ AQUÍ Y NO EN LA RUTA
//
// Por lo mismo que las reglas: si la ruta tuviera su propia lista de qué se puede configurar, el día
// que se añada una comprobación habría que acordarse de dos sitios, y el que se olvidara sería el
// que decide si se puede aprobar un documento. Aquí vive QUÉ HAY y QUÉ SE PUEDE HACER CON CADA UNA;
// la ruta se ocupa de quién lo cambia y de dónde se guarda.
//
// `aplicarConfig` es el único sitio donde la configuración surte efecto: recibe los avisos ya
// marcados con su `regla` —eso lo hace quien busca— y quita los de las comprobaciones apagadas y
// reescribe la severidad de las que la tengan cambiada. Las normativas pasan de largo siempre, lo
// que tiene una consecuencia que importa y que se comprueba en las pruebas: desactivar una
// comprobación de criterio NO PUEDE CAMBIAR EL PDF, porque la cajita roja solo imprime las dos
// normativas.
//
// LO QUE SE GUARDA ES LO QUE SE APARTA DE LO DE SERIE
//
// `comprimirConfig` deja fuera todo lo que coincide con el valor por omisión, así que un documento
// que nadie ha configurado no guarda nada y se comporta EXACTAMENTE como antes de este evolutivo.
// Quien quiera saber qué se decidió y cuándo lo lee en el registro de cambios, que es lo que da
// constancia; la configuración guardada dice en qué se aparta este documento de lo de serie.

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

  // La marca del aviso que casi siempre es el otro convenio y no una errata: los criterios suman
  // exactamente 100 % dentro de su RA. Solo puede aparecer con el convenio estricto, porque con el
  // laxo ese reparto cuadra y no hay aviso.
  const CIEN_DENTRO_DEL_RA = 'cien_dentro_del_ra';

  // Aviso de un RA cuyos criterios no reparten su peso. Lista vacía si cuadran.
  //   { ra, peso, pesosCe }
  function avisosCriteriosDeRa({ ra, peso, pesosCe }, convenioCe) {
    if (cuadraCriterios(peso, pesosCe, convenioCe)) return [];
    const suma = sumaPesos(pesosCe);
    const reglaCorta = convenioCe === CONVENIOS_CE.PESO_DEL_RA_O_CIEN
      ? 'el peso del RA (' + porcentaje(peso) + ') o 100 % si se reparten dentro del RA'
      : 'el peso del RA (' + porcentaje(peso) + ')';
    // Mismo `titulo` en los dos casos: es el que imprime la cajita roja del PDF y es lo que hace
    // que el panel y el papel digan lo mismo. Lo que cambia es la explicación (ver la cabecera).
    const cienDentroDelRa = Math.abs(suma - 100) < TOLERANCIA;
    const aviso = {
      severidad: 'error',
      titulo: `RA${ra}: los criterios suman ${porcentaje(suma)} y el RA pondera ${porcentaje(peso)}.`,
      detalle: cienDentroDelRa
        ? `Este RA reparte 100 % dentro de sí en lugar de repartir su peso (${porcentaje(peso)}), y el peso real de cada criterio sale de multiplicar los dos: es el otro convenio de ponderación, no una errata. Sale marcado porque este documento se mide con el estricto.`
        : 'Los criterios de un resultado de aprendizaje tienen que sumar ' + reglaCorta + '.',
    };
    if (cienDentroDelRa) aviso.convenio = CIEN_DENTRO_DEL_RA;
    return [aviso];
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

  // Una situación de aprendizaje que no dice en qué evaluación va. Era el hueco que el E0 dejó
  // apuntado (docs/plan.md, «Para el E4»): `render-generico.js` agrupa las fichas por
  // `evaluacion || ''`, así que una ficha sin evaluación acaba en un grupo SIN NOMBRE de la tabla
  // resumen y hasta ahora no lo advertía nadie.
  //
  // ES AVISO Y NO ERROR, a diferencia de `sinDocente`. Tres razones: el documento sigue
  // imprimiéndose y la ficha sale entera, con sus sesiones contadas en el total —lo único raro es la
  // fila del resumen—; es un campo de una ficha, y bloquear la aprobación del tomo entero por un
  // desplegable sin elegir es desproporcionado; y el hueco lo abre el propio importador, que deja la
  // evaluación vacía cuando el Word no la decía porque no debe inventar nada (ver la nota de
  // DIFERENCIA en core/sa.js), así que un error castigaría la importación y no al departamento. En
  // la PD de DAW las 84 fichas traen evaluación: esto protege a las que se crean en la aplicación.
  //
  // `fichas` es la lista de fichas del apartado, en la forma de core/sa.js.
  function avisosSaSinEvaluacion(fichas) {
    return (fichas || [])
      .filter((f) => f && !String(f.evaluacion == null ? '' : f.evaluacion).trim())
      .map((f) => ({
        severidad: 'aviso',
        titulo: 'SA ' + (f.num === null || f.num === undefined ? '?' : f.num)
          + (f.titulo ? ' («' + f.titulo + '»)' : '') + ' no dice en qué evaluación va',
        detalle: 'La tabla resumen agrupa las situaciones por evaluación, así que una situación sin evaluación acaba en un grupo sin nombre y no se sabe cuándo se trabaja.',
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

  // ---------------------------------------------------------------- el catálogo de comprobaciones

  // Las tres severidades posibles. `info` no bloquea la aprobación igual que `aviso`, y está para
  // una comprobación que se quiere seguir viendo sin que pese en el recuento de lo que falta.
  const SEVERIDADES = Object.freeze(['error', 'aviso', 'info']);

  // Las dos clases de comprobación, que es lo que decide si se puede configurar o no.
  const NORMATIVA = 'normativa';
  const CENTRO = 'centro';

  // EL CATÁLOGO. Una fila por comprobación, en el orden en el que se enseñan, con el código estable
  // que ya usan los avisos (`regla` en app/_lib/rutas/validaciones.js y en el 409 de /estado), su
  // clase, su severidad de serie y —cuando es fija— POR QUÉ lo es, en castellano y para enseñar tal
  // cual: la pantalla no tiene que saberse la normativa, y el 400 que niega el cambio tampoco.
  const REGLAS = Object.freeze([
    {
      regla: 'criterios_de_ra',
      titulo: 'Los criterios de un RA reparten el peso de su RA',
      clase: NORMATIVA,
      fija: true,
      severidad: 'error',
      porque: 'Es normativa: el reparto de las ponderaciones sale del real decreto del título y no del criterio del centro. Lo que sí decide el centro es el convenio con el que se reparte.',
    },
    {
      regla: 'suma_de_ra',
      titulo: 'La suma de las ponderaciones de los RA es 100 %',
      clase: NORMATIVA,
      fija: true,
      severidad: 'error',
      porque: 'Es normativa: sale del real decreto del título y no del criterio del centro.',
    },
    {
      regla: 'sin_docente',
      titulo: 'Unidad sin docente asignado',
      clase: CENTRO,
      fija: false,
      severidad: 'error',
      porque: null,
    },
    {
      regla: 'ra_sin_situacion',
      titulo: 'RA que no trabaja ninguna situación de aprendizaje',
      clase: CENTRO,
      fija: false,
      severidad: 'aviso',
      porque: null,
    },
    {
      regla: 'sa_sin_evaluacion',
      titulo: 'Situación de aprendizaje que no dice en qué evaluación va',
      clase: CENTRO,
      fija: false,
      severidad: 'aviso',
      porque: null,
    },
    {
      regla: 'apartado_vacio',
      titulo: 'Apartado vacío',
      clase: CENTRO,
      fija: false,
      severidad: 'aviso',
      porque: null,
    },
    {
      regla: 'heredado_sin_revisar',
      titulo: 'Heredado del curso anterior, sin revisar',
      clase: CENTRO,
      fija: false,
      severidad: 'aviso',
      porque: null,
    },
    {
      regla: 'copia_desactualizada',
      titulo: 'Copia desvinculada de un texto compartido que ha cambiado',
      clase: CENTRO,
      fija: false,
      severidad: 'aviso',
      porque: null,
    },
  ]);

  const CODIGOS = Object.freeze(REGLAS.map((r) => r.regla));
  const DEL_CATALOGO = new Map(REGLAS.map((r) => [r.regla, r]));
  const reglaDelCatalogo = (codigo) => DEL_CATALOGO.get(codigo) || null;

  // Los dos convenios, con el texto que explica cuál es cuál. Está aquí y no en la pantalla por lo
  // mismo que `porque`: quien elige tiene que leer lo que elige, y esa frase no puede depender de
  // qué pantalla la escriba.
  const CONVENIOS = Object.freeze([
    {
      valor: CONVENIOS_CE.PESO_DEL_RA,
      titulo: 'Los criterios reparten el peso de su RA',
      explicacion: 'Un RA que pondera 15 % tiene criterios que suman 15. Es el convenio estricto y el de serie: distingue un reparto relativo de una errata, porque unos criterios que suman 100 donde el RA pondera 30 no se pueden confundir con nada.',
    },
    {
      valor: CONVENIOS_CE.PESO_DEL_RA_O_CIEN,
      titulo: 'Se acepta además que los criterios sumen 100 % dentro del RA',
      explicacion: 'Se admiten los dos repartos: el peso del RA, o 100 % dentro del RA con el peso real saliendo de multiplicar. Es el convenio laxo. Lo que cuesta: con un RA que pondera 30 y unos criterios que suman 100, ya no se distingue el reparto relativo de quien escribió 100 por equivocación.',
    },
  ]);

  // ---------------------------------------------------------------- la configuración de un documento

  // La configuración EFECTIVA, con las ocho comprobaciones resueltas y el convenio decidido. Lo que
  // llega es lo guardado en el documento, que puede ser `undefined` —nadie lo ha tocado— o llevar
  // solo lo que se apartó de lo de serie.
  //
  // Un valor guardado que no se entiende se trata como el de serie en lugar de lanzar: en la
  // escritura se valida y se rechaza con un 400, así que aquí solo puede llegar algo raro de una
  // base de datos editada a mano, y lo seguro entonces es comportarse como un documento sin
  // configurar y no dejar el documento sin panel ni sin puerta de aprobación.
  function normalizarConfig(guardado) {
    const g = guardado && typeof guardado === 'object' && !Array.isArray(guardado) ? guardado : {};
    const convenioCe = g.convenioCe === CONVENIOS_CE.PESO_DEL_RA_O_CIEN
      ? CONVENIOS_CE.PESO_DEL_RA_O_CIEN
      : CONVENIOS_CE.PESO_DEL_RA;

    const puestas = g.reglas && typeof g.reglas === 'object' && !Array.isArray(g.reglas) ? g.reglas : {};
    const reglas = {};
    for (const r of REGLAS) {
      const puesto = puestas[r.regla];
      // Una normativa no se configura ni aunque alguien haya metido algo a mano en la base de datos.
      if (r.fija || !puesto || typeof puesto !== 'object' || Array.isArray(puesto)) {
        reglas[r.regla] = { activa: true, severidad: r.severidad };
        continue;
      }
      reglas[r.regla] = {
        activa: typeof puesto.activa === 'boolean' ? puesto.activa : true,
        severidad: SEVERIDADES.includes(puesto.severidad) ? puesto.severidad : r.severidad,
      };
    }
    return { convenioCe, reglas };
  }

  // Lo que hay que guardar de una configuración efectiva: solo lo que se aparta de lo de serie (ver
  // la cabecera). Devuelve `null` si no se aparta en nada, para no dejar en el documento un campo
  // que dice lo mismo que no tenerlo.
  function comprimirConfig(config) {
    const c = normalizarConfig(config);
    const fuera = {};
    if (c.convenioCe !== CONVENIOS_CE.PESO_DEL_RA) fuera.convenioCe = c.convenioCe;
    const reglas = {};
    for (const r of REGLAS) {
      if (r.fija) continue;
      const puesto = c.reglas[r.regla];
      if (puesto.activa && puesto.severidad === r.severidad) continue;
      reglas[r.regla] = { activa: puesto.activa, severidad: puesto.severidad };
    }
    if (Object.keys(reglas).length) fuera.reglas = reglas;
    return Object.keys(fuera).length ? fuera : null;
  }

  // EL ÚNICO SITIO DONDE LA CONFIGURACIÓN SURTE EFECTO. Recibe los avisos ya marcados con su
  // `regla` y devuelve los que quedan, con la severidad que toca:
  //
  //   · una comprobación de criterio apagada no deja ni un aviso;
  //   · una con la severidad cambiada deja los suyos con la nueva, así que bajarla a `aviso` deja de
  //     impedir la aprobación (`puedeAprobarse` cuenta errores);
  //   · las dos normativas pasan de largo, hagan lo que hagan: ni se apagan ni cambian de severidad.
  //
  // Un aviso de una regla que no está en el catálogo pasa tal cual: si algún día alguien busca algo
  // nuevo y se olvida de añadirlo aquí, el efecto es que su aviso se sigue viendo, no que desaparezca.
  function aplicarConfig(config, avisos) {
    const c = config && config.reglas ? config : normalizarConfig(config);
    const out = [];
    for (const aviso of (avisos || [])) {
      const r = reglaDelCatalogo(aviso && aviso.regla);
      if (!r || r.fija) { out.push(aviso); continue; }
      const puesto = c.reglas[r.regla];
      if (!puesto.activa) continue;
      out.push(puesto.severidad === aviso.severidad ? aviso : { ...aviso, severidad: puesto.severidad });
    }
    return out;
  }

  // ---------------------------------------------------------------- cambiar la configuración

  // Lo que resulta de pedir un cambio sobre la configuración que hay. Devuelve `{ motivo }` —en
  // castellano, para el 400— o `{ config, guardar, cambios }`:
  //
  //   config    la configuración efectiva que queda
  //   guardar   lo que hay que escribir en el documento (`null` si vuelve a lo de serie)
  //   cambios   lo que ha cambiado DE VERDAD, una entrada por cosa. Es lo que se apunta en el
  //             registro, y por eso se calcula aquí: pedir el convenio que ya estaba no es un cambio
  //             y no puede dejar una fila en el historial que no dice nada.
  //
  // La petición es PARCIAL a propósito: lleva solo lo que se quiere cambiar. Mandar la tabla entera
  // obligaría a la pantalla a reenviar valores que no ha tocado, y dos jefaturas configurando a la
  // vez se pisarían ajustes que ninguna de las dos quiso cambiar. El 409 de `esperaUpdatedAt`
  // protege lo demás (lo hace la ruta).
  function fusionarConfig(guardado, peticion) {
    const base = normalizarConfig(guardado);
    const p = peticion && typeof peticion === 'object' && !Array.isArray(peticion) ? peticion : {};
    const siguiente = { convenioCe: base.convenioCe, reglas: {} };
    for (const codigo of CODIGOS) siguiente.reglas[codigo] = { ...base.reglas[codigo] };
    const cambios = [];

    if (p.convenioCe !== undefined && p.convenioCe !== null) {
      if (!CONVENIOS.some((c) => c.valor === p.convenioCe)) {
        return { motivo: `«${p.convenioCe}» no es un convenio de ponderación de los criterios: usa ${CONVENIOS.map((c) => c.valor).join(' o ')}.` };
      }
      if (p.convenioCe !== base.convenioCe) {
        siguiente.convenioCe = p.convenioCe;
        cambios.push({ que: 'convenio', antes: base.convenioCe, despues: p.convenioCe });
      }
    }

    const pedidas = p.reglas;
    if (pedidas !== undefined && pedidas !== null) {
      if (typeof pedidas !== 'object' || Array.isArray(pedidas)) {
        return { motivo: '«reglas» tiene que ser un objeto con una entrada por comprobación: { sin_docente: { activa, severidad } }.' };
      }
      for (const codigo of Object.keys(pedidas)) {
        const r = reglaDelCatalogo(codigo);
        if (!r) {
          return { motivo: `«${codigo}» no es una comprobación de este documento. Las que hay: ${CODIGOS.join(', ')}.` };
        }
        const puesto = pedidas[codigo];
        if (!puesto || typeof puesto !== 'object' || Array.isArray(puesto)) {
          return { motivo: `La comprobación «${codigo}» se configura con un objeto { activa, severidad }.` };
        }
        // LA NEGATIVA DE LAS DOS NORMATIVAS, con el motivo dentro: un 400 que solo diga «no se
        // puede» deja a quien lo lee creyendo que es un fallo de la aplicación.
        if (r.fija) {
          return { motivo: `«${r.titulo}» no se puede desactivar ni cambiar de severidad. ${r.porque}` };
        }
        if (puesto.activa !== undefined && typeof puesto.activa !== 'boolean') {
          return { motivo: `«activa» de «${codigo}» tiene que ser true o false.` };
        }
        if (puesto.severidad !== undefined && !SEVERIDADES.includes(puesto.severidad)) {
          return { motivo: `«${puesto.severidad}» no es una severidad: usa ${SEVERIDADES.join(', ')}.` };
        }
        const antes = base.reglas[codigo];
        const despues = {
          activa: puesto.activa === undefined ? antes.activa : puesto.activa,
          severidad: puesto.severidad === undefined ? antes.severidad : puesto.severidad,
        };
        siguiente.reglas[codigo] = despues;
        if (despues.activa !== antes.activa || despues.severidad !== antes.severidad) {
          cambios.push({ que: 'regla', regla: codigo, antes, despues });
        }
      }
    }

    return { config: siguiente, guardar: comprimirConfig(siguiente), cambios };
  }

  // ---------------------------------------------------------------- sobre una lista de avisos

  const cuenta = (avisos) => (avisos || []).reduce((c, a) => { c[a.severidad] = (c[a.severidad] || 0) + 1; return c; },
    { error: 0, aviso: 0, info: 0 });

  // Puerta de aprobación: con errores abiertos el documento no se aprueba; los avisos no bloquean.
  const puedeAprobarse = (avisos) => cuenta(avisos).error === 0;

  const api = {
    CONVENIOS_CE,
    CONVENIOS,
    comprobarConvenio,
    CIEN_DENTRO_DEL_RA,
    SEVERIDADES,
    NORMATIVA,
    CENTRO,
    REGLAS,
    CODIGOS,
    reglaDelCatalogo,
    normalizarConfig,
    comprimirConfig,
    aplicarConfig,
    fusionarConfig,
    porcentaje,
    sumaPesos,
    cuadraCriterios,
    avisosCriteriosDeRa,
    sumaRaCuadra,
    avisosSumaRa,
    avisosRaSinSituacion,
    avisosSaSinEvaluacion,
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
