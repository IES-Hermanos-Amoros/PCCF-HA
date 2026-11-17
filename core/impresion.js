// Cómo se imprime un documento: hasta qué nivel llega el índice y qué apartados empiezan en página
// nueva. Es configuración del documento, igual que las comprobaciones (core/validaciones.js), y vive
// aquí porque la preguntan DOS motores que tienen que contestar lo mismo:
//
//   motor/render-generico.js   el PDF  (`tocItem` y `pageBreak` de pdfmake)
//   motor/exportar-docx.js     el Word (el campo TOC y el `w:br` de tipo página)
//
// Si cada uno decidiera por su cuenta, el índice del PDF y el del Word dirían cosas distintas del
// mismo documento, que es el problema que esta configuración viene a arreglar: hasta ahora el Word
// no tenía índice y el del PDF llegaba hasta el segundo nivel y punto.
//
// EL NIVEL ES EL DE LA NUMERACIÓN QUE SE VE
//
// «Nivel 3» es un apartado numerado con tres cifras —`5.1.3 Metodología`—, y se cuenta así porque es
// lo que el lector tiene delante: el número está impreso al lado del título. No es la profundidad en
// el árbol de la plantilla ni el estilo con el que se pinta, que se quedan en tres (`h3`) por mucho
// que el apartado esté más abajo.
//
// Esto importa dentro de un módulo. Un módulo es la instancia de una sección, así que sus apartados
// de primer nivel salen numerados `5.1.1`, `5.1.2`… es decir, NIVEL 3. De ahí venía la queja: con el
// índice hasta el nivel 2 no entraba nada de dentro de ningún módulo, ni los apartados principales.
//
// LO DE SERIE ES LO DE SIEMPRE
//
// `INDICE_DE_SERIE` es 2 y `SALTOS_DE_SERIE` es 0, que es exactamente lo que el PDF hacía antes de
// que esto existiera. Un documento al que nadie le ha tocado la configuración sale byte a byte como
// salía, y eso es lo que mantiene en pie el criterio de aceptación del E1 (el PDF de la base de
// datos idéntico al del importador). El Word sí estrena índice, porque no tenía ninguno.
//
// LOS SALTOS SE CUENTAN APARTE DE LOS MÓDULOS
//
// Cada módulo empieza en página nueva desde siempre, y eso no se configura: un módulo es un documento
// dentro del documento y empezar a media página no es una opción que nadie quiera. Lo que se
// configura es si además los apartados empiezan en página nueva, y hasta qué nivel. Por eso
// `SALTOS_DE_SERIE` es 0 y no 2: cero no significa «ningún salto», significa «solo los que el
// documento ya hacía».

(function (global) {
  'use strict';

  // Hasta seis, que es lo que numera la plantilla más profunda que hay (`4` en la PD de DAW) con
  // margen. Un tope hace falta porque el valor llega de fuera: de la base de datos, de un formulario
  // o de la dirección de la exportación.
  const NIVEL_MAXIMO = 6;

  // El índice como estaba: secciones de primer nivel y lo que cuelga directamente de ellas.
  const INDICE_DE_SERIE = 2;
  // Ningún salto además de los que el documento ya hacía (cada módulo).
  const SALTOS_DE_SERIE = 0;

  const esObjeto = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

  // Un nivel que llega de fuera. `undefined`, una cadena vacía, un texto, un decimal o un número
  // fuera de rango valen lo mismo: no se ha dicho nada, y se usa el de serie. NO se recorta al tope
  // (un 9 no se convierte en 6) porque un valor inventado no es una elección a medias: es un dato
  // roto, y lo que toca es ignorarlo.
  function nivelPedido(valor, deSerie) {
    if (valor === null || valor === undefined || valor === '') return deSerie;
    // Solo un número o un texto. Lo demás NO se convierte: `Number(String([]))` es 0, y un 0 aquí
    // significa «documento sin índice». Una lista vacía en la base de datos no puede dejar un
    // documento sin índice, así que lo que no tiene forma de nivel se trata como si no hubiera nada.
    if (typeof valor !== 'number' && typeof valor !== 'string') return deSerie;
    const n = typeof valor === 'number' ? valor : Number(valor.trim());
    if (!Number.isInteger(n) || n < 0 || n > NIVEL_MAXIMO) return deSerie;
    return n;
  }

  // La configuración efectiva de impresión de un documento: `{ indice, saltos }`, los dos números.
  // Lo que haya guardado puede ser cualquier cosa —lo escribe una ruta, pero también pudo entrar a
  // mano en la base de datos—, así que cada campo se valida por separado y lo que no vale cae al de
  // serie en lugar de tumbar la exportación.
  function normalizarConfig(guardado) {
    const g = esObjeto(guardado) ? guardado : {};
    return {
      indice: nivelPedido(g.indice, INDICE_DE_SERIE),
      saltos: nivelPedido(g.saltos, SALTOS_DE_SERIE),
    };
  }

  // Lo que hay que guardar: solo lo que se aparta de lo de serie, y `null` si no se aparta en nada.
  // Así un documento sin configurar no lleva en la base un campo que dice lo mismo que no tenerlo, y
  // el día que cambien los valores de serie los documentos sin configurar los siguen.
  function comprimirConfig(config) {
    const c = normalizarConfig(config);
    const fuera = {};
    if (c.indice !== INDICE_DE_SERIE) fuera.indice = c.indice;
    if (c.saltos !== SALTOS_DE_SERIE) fuera.saltos = c.saltos;
    return Object.keys(fuera).length ? fuera : null;
  }

  // Una configuración de la que solo llegan algunos campos, encima de la que ya hay. Es lo que
  // necesita una ruta que recibe `{ indice: 4 }` y no tiene que borrar los saltos por no venir, y lo
  // que necesita una exportación suelta que fuerza un valor desde la dirección.
  function fusionarConfig(actual, cambios) {
    const a = normalizarConfig(actual);
    const c = esObjeto(cambios) ? cambios : {};
    return normalizarConfig({
      indice: c.indice === undefined ? a.indice : nivelPedido(c.indice, a.indice),
      saltos: c.saltos === undefined ? a.saltos : nivelPedido(c.saltos, a.saltos),
    });
  }

  // ------------------------------------------------- las dos preguntas que hacen los motores

  // El nivel de un apartado a partir del número impreso: `5.1.3` es nivel 3. Se le pasa el número tal
  // como se pinta, que es lo que los dos motores tienen a mano en el momento de decidir.
  function nivelDelNumero(numero) {
    const t = String(numero == null ? '' : numero).trim();
    if (!t) return 0;
    const m = /^\d+(?:\.\d+)*/.exec(t);
    if (!m) return 0;
    return m[0].split('.').length;
  }

  // ¿Entra este apartado en el índice? Con `indice: 0` el documento sale sin índice ninguno, que es
  // una elección legítima: una memoria de ocho páginas no lo necesita.
  function entraEnElIndice(numero, config) {
    const c = normalizarConfig(config);
    if (c.indice <= 0) return false;
    const n = nivelDelNumero(numero);
    return n > 0 && n <= c.indice;
  }

  // ¿Hay índice en este documento? La pregunta de antes no sirve para esto: un documento con
  // `indice: 3` del que no entre ningún apartado seguiría necesitando que no se imprima la página
  // del índice, y un `indice: 0` tiene que poder apagarla sin recorrer nada.
  function llevaIndice(config) {
    return normalizarConfig(config).indice > 0;
  }

  // ¿Empieza este apartado en página nueva? Solo por la configuración: los saltos que el documento
  // hace de siempre —cada módulo— los sigue decidiendo el motor, porque no son de un apartado de la
  // plantilla sino del documento (ver la cabecera).
  function empiezaEnPaginaNueva(numero, config) {
    const c = normalizarConfig(config);
    if (c.saltos <= 0) return false;
    const n = nivelDelNumero(numero);
    return n > 0 && n <= c.saltos;
  }

  // ------------------------------------------------- un título no se separa de su hijo

  // UN APARTADO NO SE SEPARA DEL PRIMER SUBAPARTADO QUE VENGA PEGADO A ÉL. Es la parte de la regla
  // que `empiezaEnPaginaNueva` sola no puede dar, porque depende de lo que haya salido antes, y los
  // dos motores la necesitan igual.
  //
  // Sin esto salen dos páginas tontas, y ninguna de las dos se ve hasta que alguien imprime:
  //
  //   · UNA PÁGINA EN BLANCO AL PRINCIPIO. El primer apartado del cuerpo ya empieza en página nueva,
  //     porque el índice acaba de romper. Si además rompiera por configuración, entre el índice y el
  //     primer apartado quedaría una página vacía.
  //   · EL TÍTULO DE UN MÓDULO SOLO EN SU PÁGINA. Cada módulo rompe página de siempre. Si justo
  //     debajo su primer apartado rompiera también, en esa página quedaría el nombre del módulo y
  //     nada más. Pasa igual con un apartado que no tiene nada escrito y solo subapartados: su
  //     título se quedaría arriba, solo, y el contenido empezaría en la página siguiente.
  //
  // LO QUE SÍ ROMPE ES UN APARTADO VACÍO SEGUIDO DE OTRO QUE NO ES SUYO. Un apartado sin nada escrito
  // se lleva su página igual que los demás: para eso se ha pedido que cada apartado empiece en página
  // nueva. Lo que no puede pasar es que un título se separe de lo que cuelga de él, y eso se reconoce
  // por el número: `2` es padre de `2.1`, y `5.1` de `5.1.1`.
  //
  // Se usa así: un objeto por documento, y el motor le cuenta lo que va emitiendo.
  //
  //   const saltos = Imp.rompePaginas(config);
  //   if (saltos.titulo(numero)) ...rompe aquí...     // pregunta y apunta que ha salido un título
  //   saltos.tituloFijo(numero);                      // un título que el motor rompe por su cuenta
  //   saltos.escrito();                               // se ha emitido contenido (un párrafo, una tabla)
  //
  // Arranca sin romper el primer título que le llegue: delante tiene el índice o la portada, y los
  // dos han roto ya.

  // `2` es padre de `2.1` y de `2.1.1`; `5.1` no es padre de `5.10`. Se compara por cifras y no por
  // texto justo por eso: `'5.1'` sí es prefijo de la cadena `'5.10'`.
  function esAscendiente(dePadre, deHijo) {
    const p = String(dePadre == null ? '' : dePadre).split('.');
    const h = String(deHijo == null ? '' : deHijo).split('.');
    if (!dePadre || !deHijo || p.length >= h.length) return false;
    return p.every((trozo, i) => trozo === h[i]);
  }

  function rompePaginas(config) {
    const c = normalizarConfig(config);
    // El número del último título emitido, mientras no se haya escrito nada desde entonces. `null`
    // es «desde la última rotura hay contenido», y entonces romper no deja ningún título suelto.
    let tituloPegado = null;
    let arranque = true;
    return {
      titulo(numero) {
        const salta = !arranque && !esAscendiente(tituloPegado, numero) && empiezaEnPaginaNueva(numero, c);
        arranque = false;
        tituloPegado = numero;
        return salta;
      },
      tituloFijo(numero) { arranque = false; tituloPegado = numero; },
      // `arranque` también se va aquí: lo que significa es «no ha salido nada todavía», y en cuanto
      // sale algo —un título o contenido— ya hay algo arriba de lo que separarse.
      escrito() { arranque = false; tituloPegado = null; },
    };
  }

  const api = {
    NIVEL_MAXIMO,
    INDICE_DE_SERIE,
    SALTOS_DE_SERIE,
    nivelPedido,
    normalizarConfig,
    comprimirConfig,
    fusionarConfig,
    nivelDelNumero,
    entraEnElIndice,
    llevaIndice,
    empiezaEnPaginaNueva,
    rompePaginas,
    esAscendiente,
  };

  // Vale como <script> en el mockup, como `require` en el motor y en las pruebas, y como `import`
  // desde Next. Cuelga de `global.Core` igual que los otros módulos de core/.
  global.Core = global.Core || {};
  global.Core.impresion = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
