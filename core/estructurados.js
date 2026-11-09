// LA PUERTA DE LOS CAMPOS ESTRUCTURADOS: ponderaciones de RA y CE, y fichas de
// situación de aprendizaje. La forma que el generador sabe pintar, en un solo sitio.
//
// Es el hermano de core/bloques.js. Aquel decide si una lista de bloques de texto es
// exactamente lo que espera `bloques()` de motor/render-generico.js; este decide lo
// mismo de los dos tipos de campo que el E4 abre a escritura:
//
//   ponderacion_ra_ce            { ra, texto, ponderacion, ce: [{ letra, texto, ponderacion,
//                                  fundamental }], filas? }   ·  `multiple`: una lista de esas
//   ficha_situacion_aprendizaje  el modelo de core/sa.js        ·  `multiple`: una lista de esas
//   el repetidor que las agrupa  { items: [ { titulo, ficha: [ficha], texto? } ] }
//   tabla                        { filas: [[celda, …], …], anchos? }, celda { text, colspan?,
//                                rowspan?, bold?, fondo?, alineacion?, tamano? }
//   tabla_clave_valor            { pares: [{ etiqueta, valor }] }   ·  son las tablas que se crean en la
//                                aplicación (core/campos.js); también guardan las importadas
//
// Y NADA MÁS. `pintarPonderaciones` hace `p.ce.map(...)` y `pct(p.ponderacion)`, así que
// un peso que sea la cadena '15 %' imprime «15 %15 %» y un `ce` que no sea una lista
// revienta la generación del tomo entero; `pintarCampo` de una ficha monta la tabla con
// `filasDeFicha(valor)` si no hay tabla importada, y un campo que no sea una lista de
// líneas sale como `[object Object]` dentro de una celda. Lo peor, como en bloques.js, es
// que no se nota: el apartado se guarda, la pantalla lo pinta, y el fallo aparece en junio
// cuando alguien imprime su programación.
//
// POR QUÉ VIVE EN core/ Y NO EN LA RUTA
//
// Por lo mismo que core/bloques.js: la usan el editor del navegador después de cada
// operación y la API antes de escribir, y las dos tienen que decir lo mismo. Si la forma
// la decidiera la ruta, el editor tendría su propia idea de qué es una ficha válida y la
// divergencia se descubriría con un 400 delante de alguien que está escribiendo su
// programación. `core/` es lógica pura: sin DOM, sin localStorage, sin red, sin node
// (docs/plan.md §2.2).
//
// LO QUE NO ESTÁ AQUÍ: EL MODELO DE LA FICHA
//
// Está en core/sa.js, con sus conversiones ficha ↔ filas, sus operaciones sobre la lista
// y el resumen SA × RA. Aquí solo se comprueba. `CAMPOS` y `esSemantica` se leen de allí
// para que la lista de campos de una ficha esté escrita una vez: si mañana la ficha gana
// un campo, esta puerta lo acepta sin tocarla.
//
// QUÉ SE HACE CON `filas`, QUE ES LA DECISIÓN DELICADA DE ESTE FICHERO
//
// Una ficha importada lleva dos cosas: la tabla tal como venía del Word (`filas`) y el
// modelo con campos con nombre. El motor imprime `filas` si está y, si no, la monta desde
// el modelo. Así que:
//
//   · `filas` SE ACEPTA, con su forma comprobada celda a celda. Las fichas que nadie ha
//     tocado conservan su tabla importada, porque el Word usa dos maquetaciones para las
//     actividades y reescribirlas todas por haber editado una sería cambiar el documento
//     por la espalda.
//   · Pero una ficha que cambia tiene que soltarla, o el PDF seguiría imprimiendo lo de
//     antes: la pantalla diría una cosa y el papel otra. Eso lo decide quien edita
//     (app/_componentes/sa-cliente.js en la aplicación), no esta puerta.
//   · Y RENUMERAR CUENTA COMO CAMBIAR: la primera celda de `filas` lleva escrito
//     «Situación de aprendizaje 3», así que la ficha que pasa a ser la 4 pierde su tabla.
//     Eso sí lo hace esta capa, en `renumerarItems`, porque la numeración se arregla al
//     guardar (ver la nota de core/sa.js) y quien guarda no es siempre el navegador: por
//     la API entra también un `curl`. Con una excepción: a la ficha que no tiene más que
//     la rejilla importada no se le quita, porque no habría con qué montar la tabla y
//     desaparecería del PDF; una tabla que dice «3» siendo la 4 se nota y se arregla.
//
// En las ponderaciones `filas` se trata al revés: no se deja escribir, pero no se pierde.
// Ver `motivoDePonderacion` y `conservarFilas`.
//
// Vale como <script> en el mockup, como `require` en las pruebas y en las rutas, y como
// `import` desde Next. Cuelga de `global.Core.estructurados`, igual que los demás.

(function (global) {
  'use strict';

  // Las dependencias se resuelven al usarlas y no al cargar, igual que en
  // core/conciliar.js: como <script> el orden de las etiquetas manda, y así basta con que
  // core/sa.js esté cargado cuando alguien llame, no cuando se cargue este fichero.
  // Las rutas van LITERALES en cada rama, no en una variable. Un `require(ruta)`
  // calculado no lo puede seguir un empaquetador, y Turbopack no avisa: corta el
  // `npm run build` entero con «Can't resolve <dynamic>» en cuanto un componente
  // de cliente importa este fichero. Con la ruta escrita, el navegador recibe lo
  // que necesita y el <script> del prototipo sigue usando el global.
  function deCore(nombre) {
    if (global.Core && global.Core[nombre]) return global.Core[nombre];
    if (typeof require === 'function') {
      if (nombre === 'sa') return require('./sa.js');
      if (nombre === 'bloques') return require('./bloques.js');
    }
    throw new Error('core/estructurados.js necesita core/' + nombre + '.js');
  }
  const Sa = () => deCore('sa');
  const Bloques = () => deCore('bloques');

  // ---------------------------------------------------------------- los tipos de campo

  const TIPO_PONDERACION = 'ponderacion_ra_ce';
  const TIPO_FICHA = 'ficha_situacion_aprendizaje';
  const TIPO_TEXTO_LARGO = 'texto_largo';
  const TIPO_TEXTO = 'texto';
  const TIPO_TABLA = 'tabla';
  const TIPO_CLAVE_VALOR = 'tabla_clave_valor';

  // El id del valor de una sección repetidora. No es un campo de la plantilla: el
  // importador guarda los ítems repetidos como `{ items: [...] }` (ver `extraer` en
  // motor/importar-docx.js), así que el apartado de un repetidor no es `{ campo: valor }`.
  const CAMPO_ITEMS = 'items';

  // Los tipos que ESTA PUERTA sabe comprobar y que por tanto se pueden guardar. Los demás
  // —la tabla de RA y CE, la ficha del módulo— tienen cada uno su forma y su editor y
  // llegarán cuando les toque: hasta entonces se rechazan, porque un campo que entra sin
  // puerta es un documento que deja de salir.
  const TIPOS = [TIPO_TEXTO_LARGO, TIPO_TEXTO, TIPO_PONDERACION, TIPO_FICHA, TIPO_TABLA, TIPO_CLAVE_VALOR];

  // Lo más grande que cabe en una tabla de la programación. La mayor de la PD real tiene 48
  // filas y 7 columnas; los topes no están para recortar el documento sino porque `anchos()`
  // de motor/render-generico.js da a cada columna 26 pt como mínimo, así que con más de una
  // docena la tabla se sale del margen del A4 y eso se descubre al exportar.
  const MAX_FILAS = 200;
  const MAX_COLUMNAS = 12;
  const MAX_PARES = 100;

  const seGuarda = (campo) => !!campo && TIPOS.indexOf(campo.tipo) >= 0;

  // ---------------------------------------------------------------- utilidades de forma

  const esObjeto = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
  const sobran = (objeto, permitidas) => Object.keys(objeto).filter((k) => permitidas.indexOf(k) < 0);
  const comillas = (claves) => claves.map((k) => '«' + k + '»').join(', ');

  const esEntero = (x, desde) => Number.isInteger(x) && x >= desde;
  const esNumero = (x) => typeof x === 'number' && Number.isFinite(x);

  // Un porcentaje del documento. Se admiten decimales —la PD real tiene criterios que
  // ponderan 0,3 %— y se rechaza lo que no cabe en una tabla de reparto.
  const esPeso = (x) => esNumero(x) && x >= 0 && x <= 100;

  // Una línea de una celda de la ficha: texto, sin saltos. El modelo guarda una LISTA
  // porque cada línea es un elemento editable (`aLineas` de core/sa.js); un elemento con
  // un salto dentro se imprimiría igual, pero al releerlo se partiría en dos y la ficha
  // dejaría de ser la que se guardó.
  function motivoDeLineas(valor, donde) {
    if (!Array.isArray(valor)) {
      return `${donde} no es una lista de líneas: cada línea de la celda es un elemento.`;
    }
    for (let i = 0; i < valor.length; i += 1) {
      const l = valor[i];
      if (typeof l !== 'string') return `la línea ${i + 1} de ${donde} no es texto.`;
      if (l.indexOf('\n') >= 0) {
        return `la línea ${i + 1} de ${donde} lleva un salto de línea dentro: cada línea es un elemento de la lista.`;
      }
      const huella = Bloques().huellaDeWord(l);
      if (huella) {
        return `la línea ${i + 1} de ${donde} trae dentro una marca del procesador de textos («${huella}»), que no es texto de la programación: eso llega al pegar desde Word.`;
      }
    }
    return null;
  }

  // Un texto suelto de la ficha o de una ponderación (el título, el texto del RA…). Misma
  // regla que en core/bloques.js: la estructura se comprueba, la redacción no, y de lo
  // pegado solo se rechaza la huella de Word.
  function motivoDeTexto(valor, donde, { obligatorio = true } = {}) {
    if (valor === undefined || valor === null) {
      return obligatorio ? `falta ${donde}.` : null;
    }
    if (typeof valor !== 'string') return `${donde} no es texto.`;
    const huella = Bloques().huellaDeWord(valor);
    if (huella) {
      return `${donde} trae dentro una marca del procesador de textos («${huella}»), que no es texto de la programación: eso llega al pegar desde Word.`;
    }
    return null;
  }

  // ---------------------------------------------------------------- la tabla importada

  // Las celdas que `rejilla()` del motor sabe colocar. Son estas claves y ninguna más: una de
  // regalo viaja hasta pdfmake dentro del objeto de la celda y cambia la tabla sin que nadie lo
  // haya pedido. El importador escribe las cuatro primeras; «fondo», «alineacion» y «tamano» solo
  // las escribe el editor.
  const CLAVES_CELDA = ['text', 'colspan', 'rowspan', 'bold', 'fondo', 'alineacion', 'tamano'];

  // Los fondos que una celda puede pedir, por NOMBRE y no por color: así el PDF, el Word y la
  // pantalla pintan lo mismo con la misma paleta del centro, cada uno en su sintaxis.
  const FONDOS_CELDA = ['cabecera', 'etiqueta', 'ninguno'];

  // La alineación y el tamaño de letra de una celda, también por NOMBRE y por el mismo motivo que
  // el fondo: el PDF los quiere en puntos y en `alignment`, y el Word en medios puntos y en `w:jc`.
  // El nombre es el contrato compartido y cada motor lo traduce al escribir.
  //
  // Cada lista va en su orden natural (de izquierda a derecha, de pequeño a grande), así que el
  // valor por omisión se dice aparte y no se deduce de la posición: el de la alineación es el
  // primero y el del tamaño es el de en medio. Es lo que lleva una tabla del Word, que no trae
  // ninguna de las dos claves: alineada a la izquierda y con el tamaño de letra del documento.
  const ALINEACIONES_CELDA = ['izquierda', 'centro', 'derecha'];
  const TAMANOS_CELDA = ['pequena', 'normal', 'grande'];
  const ALINEACION_CELDA_OMISION = 'izquierda';
  const TAMANO_CELDA_OMISION = 'normal';

  // QUÉ FONDO LLEVA UNA CELDA: «cabecera», «etiqueta» o ninguno (null). La decisión es una sola y
  // está aquí porque la toman tres sitios: el PDF (`#D9E2F3` / `#F2F2F2`), el Word (los mismos sin
  // «#») y el editor (una clase de CSS). Si cada uno la escribiera, la pantalla acabaría pintando
  // una tabla que no es la que sale impresa.
  //
  // Con «fondo» manda la clave, esté la celda en negrita o no y en la fila que esté. Sin ella lo
  // decide la negrita, que es lo que tienen todas las celdas que vienen de un Word: en la cabecera,
  // «cabecera»; en negrita fuera de ella, «etiqueta»; sin negrita, ninguno. `enCabecera` es si la
  // celda está en la primera fila de una tabla cuya primera fila es la cabecera.
  function fondoDeCelda(celda, enCabecera) {
    const c = esObjeto(celda) ? celda : {};
    if (c.fondo === 'cabecera' || c.fondo === 'etiqueta') return c.fondo;
    if (c.fondo === 'ninguno') return null;
    return c.bold ? (enCabecera ? 'cabecera' : 'etiqueta') : null;
  }

  // QUÉ ALINEACIÓN Y QUÉ TAMAÑO DE LETRA LLEVA UNA CELDA, con el nombre que los motores traducen.
  // Están aquí por lo mismo que `fondoDeCelda`: las leen el PDF, el Word y la pantalla, y una regla
  // escrita en dos motores acaba pintando en la pantalla una tabla que no es la que sale impresa.
  //
  // DEVUELVEN null CUANDO NO HAY NADA QUE EMITIR, y eso incluye el valor por omisión: una celda con
  // `alineacion: 'izquierda'` y una celda sin la clave dan la misma salida, así que no hay dos
  // maneras de decir lo mismo. Con null el motor no escribe nada —ni `alignment`, ni `fontSize`— y
  // la tabla sale exactamente como salía antes de que estas claves existieran.
  //
  // A diferencia del fondo, aquí no hace falta un valor que ANULE nada: el fondo se deduce de la
  // negrita si no se dice otra cosa (y por eso «ninguno» significa algo), pero la alineación y el
  // tamaño no se deducen de nada.
  function alineacionDeCelda(celda) {
    const c = esObjeto(celda) ? celda : {};
    return c.alineacion === 'centro' || c.alineacion === 'derecha' ? c.alineacion : null;
  }

  function tamanoDeCelda(celda) {
    const c = esObjeto(celda) ? celda : {};
    return c.tamano === 'pequena' || c.tamano === 'grande' ? c.tamano : null;
  }

  function motivoDeFilas(filas, donde) {
    if (!Array.isArray(filas)) return `${donde} no es una lista de filas.`;
    for (let i = 0; i < filas.length; i += 1) {
      const fila = filas[i];
      if (!Array.isArray(fila)) return `la fila ${i + 1} de ${donde} no es una lista de celdas.`;
      if (!fila.length) return `la fila ${i + 1} de ${donde} no tiene ninguna celda.`;
      for (let j = 0; j < fila.length; j += 1) {
        const celda = fila[j];
        const suyo = `la celda ${j + 1} de la fila ${i + 1} de ${donde}`;
        if (!esObjeto(celda)) return `${suyo} no es un objeto { text, colspan, rowspan, bold, fondo }.`;
        const extra = sobran(celda, CLAVES_CELDA);
        if (extra.length) return `${suyo} lleva ${comillas(extra)}, que no existe en una celda.`;
        if (typeof celda.text !== 'string') return `${suyo} no tiene «text», o no es una cadena.`;
        if (celda.colspan !== undefined && !esEntero(celda.colspan, 1)) return `${suyo} tiene un «colspan» que no es un número entero de 1 en adelante.`;
        if (celda.rowspan !== undefined && !esEntero(celda.rowspan, 1)) return `${suyo} tiene un «rowspan» que no es un número entero de 1 en adelante.`;
        if (celda.bold !== undefined && typeof celda.bold !== 'boolean') return `${suyo} tiene «bold» y no es true ni false.`;
        if (celda.fondo !== undefined && !FONDOS_CELDA.includes(celda.fondo)) return `${suyo} tiene un «fondo» que no vale: los fondos son ${comillas(FONDOS_CELDA)}.`;
        if (celda.alineacion !== undefined && !ALINEACIONES_CELDA.includes(celda.alineacion)) return `${suyo} tiene una «alineacion» que no vale: las alineaciones son ${comillas(ALINEACIONES_CELDA)}.`;
        if (celda.tamano !== undefined && !TAMANOS_CELDA.includes(celda.tamano)) return `${suyo} tiene un «tamano» que no vale: los tamaños son ${comillas(TAMANOS_CELDA)}.`;
      }
    }
    return null;
  }

  // ---------------------------------------------------------------- tablas escritas en la aplicación

  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

  // Por qué las filas de una rejilla no CUADRAN con sus combinaciones.
  //
  // `rejilla()` de motor/render-generico.js (y su gemela de motor/exportar-docx.js) coloca las
  // celdas como lo hace HTML: salta las casillas que una combinación de arriba ya ocupa, y a
  // lo que falta le pone una celda vacía sin avisar. Una fila corta se rellena, una larga
  // ensancha la tabla entera, un `rowspan` que se pasa del final inventa filas, y dos
  // combinaciones que se pisan dejan una sin sitio. Nada de eso falla: la tabla se guarda,
  // sale torcida en el papel y nadie sabe por qué. Aquí se RECHAZA, porque en una tabla
  // escrita en la aplicación no hay nada que admitir —el editor siempre puede dar una rejilla
  // entera— y el aviso hay que darlo ahora, delante de quien la escribe, y no en junio.
  //
  // La referencia es la PRIMERA fila: no tiene nada combinado por encima, así que su anchura
  // es la de la tabla. Se coloca como lo hace el generador, y el mensaje dice qué fila sobra o
  // falta contando como celda las casillas que vienen combinadas desde arriba, que es lo que
  // ve quien mira la tabla.
  // La forma de una rejilla: qué combina cada celda, sin el texto ni el estilo.
  const formaDe = (filas) => JSON.stringify(filas.map((f) => f.map((x) => [x.colspan || 1, x.rowspan || 1])));

  function motivoDeCuadricula(filas, donde) {
    if (!filas.length) return null;
    const ocupado = filas.map(() => []);
    let ncols = 0;
    for (let i = 0; i < filas.length; i += 1) {
      let col = 0;
      const fila = filas[i];
      for (let j = 0; j < fila.length; j += 1) {
        while (ocupado[i][col]) col += 1;
        const celda = fila[j];
        const cs = celda.colspan || 1;
        const rs = celda.rowspan || 1;
        const suya = `la celda ${j + 1} de la fila ${i + 1} de ${donde}`;
        if (i + rs > filas.length) {
          return `${suya} se combina con ${plural(rs - 1, 'fila', 'filas')} hacia abajo y la tabla solo tiene ${plural(filas.length - i - 1, 'fila', 'filas')} más.`;
        }
        if (i > 0 && col + cs > ncols) {
          // Lo que sobra es todo lo que queda de la fila a partir de la primera celda que se sale.
          const resto = fila.slice(j + 1).reduce((t, x) => t + (x.colspan || 1), 0);
          const sobran = col + cs + resto - ncols;
          return `la fila ${i + 1} de ${donde} es más ancha que la primera (${plural(ncols, 'columna', 'columnas')}): le ${sobran === 1 ? 'sobra' : 'sobran'} ${plural(sobran, 'celda', 'celdas')}.`;
        }
        for (let dr = 0; dr < rs; dr += 1) {
          for (let dc = 0; dc < cs; dc += 1) {
            if (ocupado[i + dr][col + dc]) {
              return `${suya} se solapa con otra celda combinada: dos combinaciones no pueden tapar la misma casilla.`;
            }
            ocupado[i + dr][col + dc] = true;
          }
        }
        col += cs;
      }
      if (i === 0) { ncols = col; continue; }
      // Lo que no está ocupado ni lo ha puesto esta fila es lo que falta.
      let huecos = 0;
      for (let k = 0; k < ncols; k += 1) if (!ocupado[i][k]) huecos += 1;
      if (huecos) {
        return `la fila ${i + 1} de ${donde} es más corta que la primera (${plural(ncols, 'columna', 'columnas')}): le ${huecos === 1 ? 'falta' : 'faltan'} ${plural(huecos, 'celda', 'celdas')}.`;
      }
    }
    return null;
  }

  // El texto de una celda o de un par. Es texto de la programación, no de Word: lo único que
  // se rechaza es la huella del procesador de textos, como en el resto de la puerta.
  function motivoDeTextoDeCelda(texto, suyo) {
    const huella = Bloques().huellaDeWord(texto);
    return huella
      ? `${suyo} trae dentro una marca del procesador de textos («${huella}»), que no es texto de la programación: eso llega al pegar desde Word.`
      : null;
  }

  // LOS ANCHOS DE COLUMNA DE UNA TABLA son PROPORCIONES —pesos relativos, uno por columna— y van
  // en la tabla, no en la celda. Proporciones y no puntos ni centímetros porque pdfmake reparte
  // sobre el ancho útil de la hoja y el Word sobre el de la tabla en dxa: un peso relativo le sirve
  // a los dos sin que ninguno tenga que saber del otro.
  //
  // Sin «anchos» cada columna sigue midiendo lo que diga su cantidad de texto (`anchos()` de
  // motor/render-generico.js y su gemela del Word), que es como salen las 1.070 tablas importadas.
  // Es la razón más probable de que una tabla rehecha a mano «no quede igual» que la del Word, y
  // por eso se puede decir a mano.
  function motivoDeAnchos(anchos, columnas, donde) {
    if (anchos === undefined) return null;
    if (!Array.isArray(anchos)) return `«anchos» de ${donde} no es una lista de proporciones, una por columna.`;
    if (!anchos.length) {
      return `«anchos» de ${donde} está vacío: una tabla cuyas columnas se reparten solas no lleva «anchos».`;
    }
    if (anchos.length !== columnas) {
      return `«anchos» de ${donde} trae ${plural(anchos.length, 'proporción', 'proporciones')} y la tabla tiene ${plural(columnas, 'columna', 'columnas')}: hace falta una proporción por columna.`;
    }
    for (let j = 0; j < anchos.length; j += 1) {
      if (!esNumero(anchos[j]) || anchos[j] <= 0) {
        return `la proporción ${j + 1} de «anchos» de ${donde} no es un número positivo: los anchos son pesos relativos, no medidas.`;
      }
    }
    return null;
  }

  // LAS COLUMNAS QUE TIENE DE VERDAD UNA REJILLA: las que coloca el generador (`rejilla()` de
  // motor/render-generico.js y su gemela del Word), que es hasta donde llega la fila más ancha, no
  // lo que mide la primera. En una tabla que cuadra son lo mismo; en una con una fila más ancha que
  // la primera, los motores dibujan más columnas de las que la primera fila deja contar, y unos
  // «anchos» con una proporción por cada columna de la primera fila no encajarían: el motor los
  // descartaría y repartiría las columnas según el texto sin avisar.
  function columnasDeRejilla(filas) {
    const ocupado = filas.map(() => []);
    let ncols = 0;
    for (let i = 0; i < filas.length; i += 1) {
      let col = 0;
      for (let j = 0; j < filas[i].length; j += 1) {
        while (ocupado[i][col]) col += 1;
        const cs = filas[i][j].colspan || 1;
        const rs = filas[i][j].rowspan || 1;
        for (let dr = 0; dr < rs && i + dr < filas.length; dr += 1) {
          for (let dc = 0; dc < cs; dc += 1) ocupado[i + dr][col + dc] = true;
        }
        col += cs;
        ncols = Math.max(ncols, col);
      }
    }
    return ncols;
  }

  // Por qué la FORMA de una rejilla no es la de una tabla escrita en la aplicación: demasiadas
  // filas, filas que no cuadran con sus combinaciones o demasiadas columnas. Es la parte de la
  // puerta que se perdona cuando la forma no cambia, y la pregunta que se hace el editor ANTES de
  // dejar añadir una fila, una columna o una combinación: si la tabla de partida no la pasaría, un
  // cambio de forma sería un 400 y el botón tiene que estar apagado y decir por qué.
  function motivoDeForma(filas, donde) {
    if (filas.length > MAX_FILAS) return `${donde} tiene ${filas.length} filas: el máximo son ${MAX_FILAS}.`;
    const c = motivoDeCuadricula(filas, donde);
    if (c) return c;
    const ancho = filas.length ? filas[0].reduce((a, x) => a + (x.colspan || 1), 0) : 0;
    if (ancho > MAX_COLUMNAS) {
      return `${donde} tiene ${ancho} columnas: el máximo son ${MAX_COLUMNAS}, porque con más no caben en el ancho de la hoja.`;
    }
    return null;
  }

  // UNA REJILLA ESCRITA EN LA APLICACIÓN: `{ filas: [[celda, …], …], anchos? }`. La forma de la
  // celda y la comprobación celda a celda son las de `motivoDeFilas`; aquí se añade lo que solo
  // importa cuando alguien la escribe: que las filas cuadren, los topes, los anchos y la cabecera.
  //
  // UNA TABLA SIN FILAS SÍ SE GUARDA. `{ filas: [] }` es una tabla que existe y a la que no se
  // le ha escrito nada, y la necesita el editor: quien quita la última fila tiene que poder
  // guardar ese estado sin inventarse una fila vacía. El generador imprime «(tabla vacía)» en
  // cursiva, que es verdad y se nota al revisar; una fila de celdas en blanco imprimiría un
  // rectángulo que parece una tabla rellena. (Y un campo SIN valor, que es como nace uno
  // recién creado, no imprime nada: ver `pintarCampo`.)
  //
  // LA CABECERA. En una tabla importada la decide el campo (`columnas`) para el PDF, mientras que
  // el exportador a Word mira solo la negrita: allí la cabecera es la primera fila si todas sus
  // celdas van en negrita (`tabla` de motor/exportar-docx.js). Dos de la PD real tienen `columnas`
  // y su primera fila sin negrita, y editarles una celda no puede exigir que cambien de aspecto.
  // En una tabla creada en la aplicación (`campo.inicial`) no hay dos criterios: el generador
  // tampoco mira `columnas` (`pintarCampo` de motor/render-generico.js), así que la cabecera es la
  // primera fila entera en negrita en el PDF y en el Word, y poner o quitar la cabecera es poner o
  // quitar esa negrita. Por eso esta puerta no exige nada de la primera fila.
  //
  // LO QUE YA ESTABA TORCIDO NO SE RECHAZA. Las tablas importadas de los documentos reales traen
  // defectos de maquetación del Word —un `rowspan` que se pasa del final, tablas de 13 a 17
  // columnas— y quien corrige una errata en una celda no puede toparse con que su tabla «no vale».
  // Si la forma de la rejilla (las combinaciones de cada celda) es la que ya estaba guardada, solo
  // ha cambiado texto, y los defectos de cuadrícula y de tamaño no se vuelven a exigir. En cuanto la
  // forma cambia —una fila nueva, una celda combinada— se exige entera.
  function motivoDeRejilla(valor, donde, { guardada } = {}) {
    if (!esObjeto(valor)) return `${donde} no es una tabla { filas: [[celda, …], …] }.`;
    const extra = sobran(valor, ['filas', 'anchos']);
    if (extra.length) return `${donde} lleva ${comillas(extra)}, que no existe en una tabla: solo «filas» y «anchos».`;
    if (valor.filas === undefined) return `falta «filas» en ${donde}: una tabla sin filas es { filas: [] }.`;
    const m = motivoDeFilas(valor.filas, donde);
    if (m) return m;
    const igual = esObjeto(guardada) && Array.isArray(guardada.filas) && formaDe(guardada.filas) === formaDe(valor.filas);
    if (!igual) {
      const f = motivoDeForma(valor.filas, donde);
      if (f) return f;
    }
    // Los anchos se exigen SIEMPRE, también cuando la forma no ha cambiado: ninguna tabla guardada
    // los trae (el importador no los escribe), así que no hay nada heredado que perdonar, y una
    // lista con más proporciones que columnas no sabría qué columna estira. Se cuentan las columnas
    // que dibuja el generador (`columnasDeRejilla`) y no las de la primera fila: en una importada
    // con una fila más ancha que la primera no coinciden, y los anchos que cuadraran con la primera
    // fila los descartaría el motor sin avisar.
    const a = motivoDeAnchos(valor.anchos, columnasDeRejilla(valor.filas), donde);
    if (a) return a;
    for (let i = 0; i < valor.filas.length; i += 1) {
      for (let j = 0; j < valor.filas[i].length; j += 1) {
        const t = motivoDeTextoDeCelda(valor.filas[i][j].text, `la celda ${j + 1} de la fila ${i + 1} de ${donde}`);
        if (t) return t;
      }
    }
    return null;
  }

  // UNA TABLA DE CLAVE Y VALOR: `{ pares: [{ etiqueta, valor }] }`, dos columnas con la de la
  // izquierda a 150 pt (`pintarClaveValor`). Un par sin nada escrito se guarda: una fila a
  // medio rellenar es el estado normal mientras se escribe.
  //
  // El importador deja además `filas`, la tabla tal como venía del Word, y el generador solo
  // la usa si no hay pares (`pintarClaveValor` cae a ella: así se importan las que el lector
  // no supo interpretar). Con las dos a la vez el PDF imprime los pares y el exportador a
  // Word las `filas` (`tabla_clave_valor` de motor/exportar-docx.js las prefiere), y lo
  // escrito en la aplicación no saldría igual en las dos salidas. Por eso quien edita manda
  // SOLO `pares`, y una escritura que trae las dos se rechaza en lugar de elegir una por él.
  function motivoDeClaveValor(valor, donde) {
    if (!esObjeto(valor)) return `${donde} no es una tabla de clave y valor { pares: [{ etiqueta, valor }] }.`;
    const extra = sobran(valor, ['pares', 'filas']);
    if (extra.length) return `${donde} lleva ${comillas(extra)}, que no existe en una tabla de clave y valor: solo «pares».`;
    if (valor.pares === undefined && valor.filas === undefined) {
      return `falta «pares» en ${donde}: una tabla sin filas es { pares: [] }.`;
    }
    if (valor.pares !== undefined) {
      if (!Array.isArray(valor.pares)) return `«pares» de ${donde} no es una lista.`;
      if (valor.pares.length > MAX_PARES) return `${donde} tiene ${valor.pares.length} filas: el máximo son ${MAX_PARES}.`;
      for (let i = 0; i < valor.pares.length; i += 1) {
        const p = valor.pares[i];
        const suyo = `la fila ${i + 1} de ${donde}`;
        if (!esObjeto(p)) return `${suyo} no es un objeto { etiqueta, valor }.`;
        const sobra = sobran(p, ['etiqueta', 'valor']);
        if (sobra.length) return `${suyo} lleva ${comillas(sobra)}, que no existe en una fila de clave y valor.`;
        for (const clave of ['etiqueta', 'valor']) {
          if (typeof p[clave] !== 'string') return `${suyo} no tiene «${clave}», o no es texto.`;
          const t = motivoDeTextoDeCelda(p[clave], `${clave === 'etiqueta' ? 'la etiqueta' : 'el valor'} de ${suyo}`);
          if (t) return t;
        }
      }
    }
    if (valor.filas !== undefined) {
      const m = motivoDeFilas(valor.filas, `la tabla importada de ${donde}`);
      if (m) return m;
      if (valor.filas.length && Array.isArray(valor.pares) && valor.pares.length) {
        return `${donde} trae a la vez «pares» y «filas», que son la misma tabla escrita de dos maneras: el PDF imprimiría una y el Word la otra. Al editarla se manda solo «pares».`;
      }
    }
    return null;
  }

  // Los dos tipos son `multiple` o no según el campo: el importador guarda una lista cuando
  // la sección trae varias tablas y la tabla suelta cuando trae una, y en la PD real hay
  // campos de clave y valor de las dos clases. `pintarCampo` imprime una lista tabla a tabla,
  // así que una lista vacía es un campo sin tablas.
  function motivoDeTablas(valor, campo, guardado, motivoDeUna) {
    if (!campo.multiple) {
      if (Array.isArray(valor)) return 'este campo es una sola tabla y esto es una lista de tablas.';
      return motivoDeUna(valor, 'la tabla', guardado);
    }
    if (!Array.isArray(valor)) return 'este campo es una lista de tablas, y esto no es una lista.';
    for (let i = 0; i < valor.length; i += 1) {
      const m = motivoDeUna(valor[i], `la tabla ${i + 1}`, Array.isArray(guardado) ? guardado[i] : undefined);
      if (m) return m;
    }
    return null;
  }

  // ---------------------------------------------------------------- ponderaciones de RA y CE

  const CLAVES_PONDERACION = ['ra', 'texto', 'ponderacion', 'ce', 'filas'];
  const CLAVES_CRITERIO = ['letra', 'texto', 'ponderacion', 'fundamental'];

  // La letra con la que el documento nombra un criterio: «a)», «b)»… El importador la
  // guarda en minúscula y la 'ñ' aparece en los módulos con más de veintiséis criterios.
  const LETRA = /^[a-zñ]$/;

  // Por qué no vale UNA tabla de ponderaciones. `raModulo`, si viene, es la lista de los RA
  // que el módulo declara en su apartado de resultados de aprendizaje y criterios de
  // evaluación: ponderar un RA que el módulo no tiene es un peso que no reparte nada y que
  // nadie encuentra para arreglarlo, así que se rechaza.
  function motivoDePonderacion(tabla, donde, { raModulo } = {}) {
    if (!esObjeto(tabla)) {
      return `${donde} no es una tabla de ponderaciones { ra, texto, ponderacion, ce }.`;
    }
    const extra = sobran(tabla, CLAVES_PONDERACION);
    if (extra.length) return `${donde} lleva ${comillas(extra)}, que no existe en una tabla de ponderaciones.`;

    // `ra: null` es lo que deja el importador cuando no sabe leer la cabecera de la tabla, y
    // entonces el motor imprime la rejilla en crudo en lugar de la tabla de ponderaciones.
    // Por la API no entra: lo que se guarda desde el editor es el reparto de un RA concreto.
    if (!esEntero(tabla.ra, 1)) {
      return `${donde} no dice de qué resultado de aprendizaje es: «ra» tiene que ser su número.`;
    }
    if (raModulo && raModulo.indexOf(tabla.ra) < 0) {
      return raModulo.length
        ? `${donde} pondera el RA${tabla.ra}, y este módulo solo tiene los RA ${raModulo.join(', ')}: los resultados de aprendizaje de un módulo son los de su apartado de resultados de aprendizaje y criterios de evaluación.`
        : `${donde} pondera el RA${tabla.ra}, y este módulo no declara ningún resultado de aprendizaje: los RA salen del apartado de resultados de aprendizaje y criterios de evaluación, y sin esa lista un peso no reparte nada.`;
    }

    const texto = motivoDeTexto(tabla.texto, `el texto del RA${tabla.ra} de ${donde}`);
    if (texto) return texto;

    if (!esPeso(tabla.ponderacion)) {
      return `la ponderación del RA${tabla.ra} de ${donde} no es un porcentaje: tiene que ser un número de 0 a 100, sin el «%».`;
    }

    if (!Array.isArray(tabla.ce)) {
      return `los criterios del RA${tabla.ra} de ${donde} no son una lista.`;
    }
    const letras = new Set();
    for (let i = 0; i < tabla.ce.length; i += 1) {
      const ce = tabla.ce[i];
      const suyo = `el criterio ${i + 1} del RA${tabla.ra} de ${donde}`;
      if (!esObjeto(ce)) return `${suyo} no es un objeto { letra, texto, ponderacion, fundamental }.`;
      const sobra = sobran(ce, CLAVES_CRITERIO);
      if (sobra.length) return `${suyo} lleva ${comillas(sobra)}, que no existe en un criterio de evaluación.`;
      if (typeof ce.letra !== 'string' || !LETRA.test(ce.letra)) {
        return `${suyo} no tiene una letra con la que nombrarlo: «a», «b», «c»… en minúscula.`;
      }
      if (letras.has(ce.letra)) {
        return `el RA${tabla.ra} de ${donde} tiene dos criterios «${ce.letra}»: la letra es la que lo nombra en el documento y no se puede repetir.`;
      }
      letras.add(ce.letra);
      const suTexto = motivoDeTexto(ce.texto, `el texto de ${suyo}`);
      if (suTexto) return suTexto;
      if (!esPeso(ce.ponderacion)) {
        return `la ponderación de ${suyo} no es un porcentaje: tiene que ser un número de 0 a 100, sin el «%».`;
      }
      if (ce.fundamental !== undefined && typeof ce.fundamental !== 'boolean') {
        return `${suyo} tiene «fundamental» y no es true ni false.`;
      }
    }

    // La tabla tal como venía del Word no se escribe por aquí, y tampoco se pierde: el
    // exportador a Word saca de su primera celda el código del módulo («Resultado de
    // aprendizaje (0614.1)»), que el modelo no guarda (ver `filasPonderacion` en
    // motor/exportar-docx.js). Así que la conserva el servidor, emparejada por RA, y el
    // cliente no tiene que devolverla ni puede estropearla.
    if (tabla.filas !== undefined && !(Array.isArray(tabla.filas) && !tabla.filas.length)) {
      return `${donde} trae «filas», que es la tabla tal como venía del Word: no se manda. La conserva el servidor, porque de ella sale el código del módulo que el modelo no guarda.`;
    }
    return null;
  }

  // Por qué no vale el VALOR del campo. `multiple` es el de la plantilla: el importador
  // guarda una lista cuando la sección trae varias tablas y la tabla suelta cuando trae
  // una, y el campo de la PD real es `multiple`.
  function motivoPonderaciones(valor, { multiple = true, raModulo } = {}) {
    if (multiple) {
      if (!Array.isArray(valor)) {
        return 'las ponderaciones de este campo son una lista de tablas, una por resultado de aprendizaje, y esto no es una lista.';
      }
      if (!valor.length) {
        return 'la lista de ponderaciones está vacía: un módulo sin ponderaciones se queda sin el apartado, no con una lista vacía.';
      }
      const vistos = new Set();
      for (let i = 0; i < valor.length; i += 1) {
        const m = motivoDePonderacion(valor[i], `la tabla ${i + 1}`, { raModulo });
        if (m) return m;
        if (vistos.has(valor[i].ra)) {
          return `hay dos tablas del RA${valor[i].ra}: el peso de un resultado de aprendizaje se reparte en una sola tabla, y con dos la suma del apartado lo contaría dos veces.`;
        }
        vistos.add(valor[i].ra);
      }
      return null;
    }
    return motivoDePonderacion(valor, 'la tabla de ponderaciones', { raModulo });
  }

  // Las `filas` guardadas de cada RA, para que una escritura no las tire. Devuelve el valor
  // que se guarda: el que llega, con la tabla importada del mismo RA pegada otra vez.
  function conservarFilas(nuevo, guardado) {
    const antes = new Map();
    for (const t of (Array.isArray(guardado) ? guardado : [guardado])) {
      if (esObjeto(t) && Array.isArray(t.filas) && t.filas.length) antes.set(t.ra, t.filas);
    }
    if (!antes.size) return nuevo;
    const con = (t) => (antes.has(t.ra) ? { ...t, filas: antes.get(t.ra) } : t);
    return Array.isArray(nuevo) ? nuevo.map(con) : con(nuevo);
  }

  // La suma en vivo que pide el editor: lo que cada RA reparte y lo que suman los RA. No es
  // una comprobación —la regla está en core/validaciones.js— sino la cuenta, para que la
  // pantalla no la vuelva a escribir y la enseñe igual que la enseñará el PDF.
  function sumas(valor) {
    const Val = deCore('validaciones', './validaciones.js');
    const tablas = (Array.isArray(valor) ? valor : [valor]).filter(esObjeto);
    const ra = tablas.map((t) => ({
      ra: t.ra,
      peso: t.ponderacion,
      sumaCe: Val.sumaPesos((t.ce || []).map((c) => c.ponderacion)),
    }));
    const sumaRa = Val.sumaPesos(tablas.map((t) => t.ponderacion));
    return { ra, sumaRa, cuadraRa: Val.sumaRaCuadra(sumaRa) };
  }

  // ---------------------------------------------------------------- fichas de situación de aprendizaje

  // La cabecera de la ficha. El cuerpo son los `CAMPOS` de core/sa.js, que no se repiten
  // aquí: están escritos allí y allí se añaden.
  const CLAVES_CABECERA = ['num', 'titulo', 'sesiones', 'evaluacion', 'raTexto', 'ra', 'filas'];

  const clavesDeFicha = () => CLAVES_CABECERA.concat(Sa().CAMPOS.map((c) => c.id));

  function motivoFicha(ficha, donde = 'la ficha') {
    if (!esObjeto(ficha)) return `${donde} no es un objeto con los campos de la situación de aprendizaje.`;
    const extra = sobran(ficha, clavesDeFicha());
    if (extra.length) return `${donde} lleva ${comillas(extra)}, que no existe en una ficha de situación de aprendizaje.`;

    // El número puede ser 0: ocho fichas de la PD real lo traen, y el documento es el que
    // es. Se arregla al guardar un repetidor (`renumerarItems`), no rechazando el apartado.
    if (ficha.num !== undefined && ficha.num !== null && !esEntero(ficha.num, 0)) {
      return `el número de ${donde} no es un entero.`;
    }
    const titulo = motivoDeTexto(ficha.titulo, `el título de ${donde}`, { obligatorio: false });
    if (titulo) return titulo;
    if (ficha.sesiones !== undefined && ficha.sesiones !== null
      && !(esNumero(ficha.sesiones) && ficha.sesiones >= 0)) {
      return `las sesiones de ${donde} no son un número de 0 en adelante.`;
    }
    const evaluacion = motivoDeTexto(ficha.evaluacion, `la evaluación de ${donde}`, { obligatorio: false });
    if (evaluacion) return evaluacion;
    const raTexto = motivoDeTexto(ficha.raTexto, `el texto de los resultados de aprendizaje de ${donde}`, { obligatorio: false });
    if (raTexto) return raTexto;

    if (ficha.ra !== undefined) {
      if (!Array.isArray(ficha.ra)) return `los resultados de aprendizaje de ${donde} no son una lista de números.`;
      const vistos = new Set();
      for (const n of ficha.ra) {
        if (!esEntero(n, 1)) return `los resultados de aprendizaje de ${donde} llevan ${JSON.stringify(n)}, que no es el número de un RA.`;
        if (vistos.has(n)) return `${donde} repite el RA${n}: en el resumen cada RA es una columna y se marca una vez.`;
        vistos.add(n);
      }
    }

    for (const campo of Sa().CAMPOS) {
      if (ficha[campo.id] === undefined) continue;
      const m = motivoDeLineas(ficha[campo.id], `«${campo.etiqueta}» de ${donde}`);
      if (m) return m;
    }

    if (ficha.filas !== undefined) {
      const m = motivoDeFilas(ficha.filas, `la tabla importada de ${donde}`);
      if (m) return m;
    }

    // Lo que de verdad hace falta para imprimirla: `pintarCampo` monta la tabla desde el
    // modelo solo si la ficha tiene cuerpo (`esSemantica`), y si no imprime «(tabla
    // vacía)». Una ficha a medio construir —un `{}` o un `{ titulo }` suelto— no es una
    // ficha nueva: una ficha nueva nace con todos sus campos presentes y vacíos
    // (`fichaVacia` de core/sa.js).
    const tieneTabla = Array.isArray(ficha.filas) && ficha.filas.length;
    if (!tieneTabla && !Sa().esSemantica(ficha)) {
      return `${donde} no trae ningún campo de la situación de aprendizaje ni «raTexto», así que el documento no sabría qué imprimir: una ficha nueva se crea con todos sus campos presentes y vacíos.`;
    }
    return null;
  }

  function motivoFichas(valor, { multiple = true } = {}) {
    if (!multiple) return motivoFicha(valor);
    if (!Array.isArray(valor)) {
      return 'este campo guarda una lista de fichas de situación de aprendizaje, y esto no es una lista.';
    }
    if (!valor.length) {
      return 'la lista de fichas está vacía: un apartado sin fichas se queda sin el campo, no con una lista vacía.';
    }
    for (let i = 0; i < valor.length; i += 1) {
      const m = motivoFicha(valor[i], `la ficha ${i + 1}`);
      if (m) return m;
    }
    return null;
  }

  // ---------------------------------------------------------------- el repetidor

  // El valor de una sección repetidora: `{ items: [...] }`, y cada ítem son los campos de
  // la plantilla para ese repetidor. No es `{ campo: valor }` como los demás apartados, así
  // que se comprueba aparte.
  //
  // CUÁNTAS FICHAS CABEN EN UN ÍTEM. Una, normalmente, y el campo es `multiple` porque el
  // Word no siempre lo cumple: en la PD real hay un encabezado («Interfaces web con
  // framework.», de Diseño de interfaces web) con dos tablas de ficha debajo. Así que se
  // admiten las que vengan y al menos una, para que ese apartado se pueda volver a
  // guardar; lo que no se admite es ninguna.
  //
  // Lo que sí cuesta de verdad es que `resumenSituaciones` del motor lee `ficha[0]`: la
  // segunda ficha de un ítem se imprime pero no aparece en la tabla resumen. Es un defecto
  // del documento importado, no de esta puerta, y se arregla separando el encabezado en dos.
  function motivoItems(valor, campos) {
    if (!esObjeto(valor)) {
      return 'un apartado de fichas se guarda como { items: [...] }, la lista entera.';
    }
    const extra = sobran(valor, [CAMPO_ITEMS]);
    if (extra.length) {
      return `este apartado son fichas que se añaden y se ordenan: se guarda como { items: [...] }, la lista entera, y no con campos sueltos (${comillas(extra)}).`;
    }
    if (!Array.isArray(valor.items)) return 'las fichas de este apartado son una lista: «items» no lo es.';

    const porId = new Map((campos || []).map((c) => [c.id, c]));
    const ids = [...porId.keys()];

    for (let i = 0; i < valor.items.length; i += 1) {
      const item = valor.items[i];
      const donde = `la ficha ${i + 1}`;
      if (!esObjeto(item)) return `${donde} no es un objeto con los campos de la plantilla.`;
      const sobra = sobran(item, ids);
      if (sobra.length) {
        return `${donde} lleva ${comillas(sobra)}, que no es un campo de este apartado: solo ${comillas(ids)}.`;
      }
      // El título es el del encabezado que imprime el PDF («Situación de aprendizaje 3:
      // …»), así que se exige: sin él el documento imprime «undefined».
      if (typeof item.titulo !== 'string') {
        return `${donde} no tiene título, y es el que el documento imprime en su encabezado.`;
      }
      for (const [id, campo] of porId) {
        if (id === 'titulo') continue;
        // La ficha sí se exige: un ítem con título y sin ficha es un encabezado con nada
        // debajo en el PDF, y en el resumen no aparece siquiera. Los demás campos del
        // repetidor son opcionales, como en cualquier otro apartado.
        if (item[id] === undefined && campo.tipo !== TIPO_FICHA) continue;
        if (campo.tipo === TIPO_FICHA) {
          if (item[id] === undefined) {
            return `${donde} no trae su ficha en «${id}»: sin ella el documento imprime el encabezado y nada debajo, y en el resumen no aparece.`;
          }
          if (!Array.isArray(item[id]) || !item[id].length) {
            return `${donde} tiene que llevar su ficha en «${id}», dentro de una lista.`;
          }
          for (let k = 0; k < item[id].length; k += 1) {
            const m = motivoFicha(item[id][k],
              item[id].length > 1 ? `${donde}, tabla ${k + 1}` : donde);
            if (m) return m;
          }
          continue;
        }
        const m = motivoDeCampo(campo, item[id], {});
        if (m) return `en ${donde}, ${m}`;
      }
    }
    return null;
  }

  // Renumera las fichas de un repetidor por su posición, que es la numeración que imprime
  // el documento, y suelta la tabla importada de las que cambian de número: `filas` lleva
  // escrito «Situación de aprendizaje 3» en su primera celda, así que la ficha que pasa a
  // ser la 4 tiene que montar su tabla desde los campos o el papel seguiría llamándola 3.
  //
  // Se hace AL GUARDAR y no al editar (la nota de core/sa.js: «la numeración no se corrige
  // aquí, `renumerar` se llama al guardar»), porque es lo único que garantiza que la
  // numeración cuadre venga la escritura del editor o de un `curl`. Y hace falta de verdad:
  // 15 de las 78 fichas repetidas de la PD real llegan con un número que no es su posición,
  // y una de ellas con el 0, que el resumen del PDF descarta sin decir nada; en otro módulo
  // seis fichas seguidas se llaman todas «5».
  //
  // La cuenta va por FICHAS y no por ítems, porque un ítem puede traer dos tablas (ver
  // `motivoItems`) y la numeración del documento es la de las fichas impresas.
  function renumerarItems(items, idFicha = 'ficha') {
    const lista = [];
    const sitio = [];
    (items || []).forEach((item, i) => {
      const fichas = Array.isArray(item[idFicha]) ? item[idFicha] : [];
      fichas.forEach((f, j) => { lista.push(f || {}); sitio.push([i, j]); });
    });
    const despues = Sa().renumerar(lista);
    const salida = (items || []).map((item) => (Array.isArray(item[idFicha])
      ? { ...item, [idFicha]: item[idFicha].slice() }
      : item));
    const sa = Sa();
    despues.forEach((f, k) => {
      // La que no cambia de número se queda tal cual, con su tabla importada: reescribir
      // las once fichas de un módulo por haber movido una sería cambiar el documento por
      // la espalda.
      if (f.num === lista[k].num) return;
      const ficha = { ...f };
      delete ficha.filas;
      const [i, j] = sitio[k];
      // Y si la ficha no tiene cuerpo del que montar la tabla —solo la rejilla importada, que es
      // lo que queda cuando el importador no sabe leerla— se le cambia el número pero se le deja
      // la tabla. Una tabla que dice «3» siendo la 4 se nota y se arregla; una ficha que
      // desaparece del PDF con un «(tabla vacía)», no.
      salida[i][idFicha][j] = sa.esSemantica(ficha) ? ficha : { ...f };
    });
    return salida;
  }

  // ---------------------------------------------------------------- la puerta, por campo

  // Por qué no se puede guardar el valor de un campo, mirando su tipo. Es el único sitio
  // que decide qué tipos se guardan: la ruta compone el mensaje y la interfaz lo enseña,
  // pero ninguna de las dos elige.
  function motivoDeCampo(campo, valor, contexto = {}) {
    if (!campo) return 'este campo no está en la plantilla de este apartado.';
    if (valor === undefined) return 'no se ha mandado ningún valor.';

    switch (campo.tipo) {
      case TIPO_TEXTO_LARGO:
        return Bloques().motivoAlGuardar(valor);
      case TIPO_TEXTO:
        return motivoDeTexto(valor, 'el valor');
      case TIPO_PONDERACION:
        return motivoPonderaciones(valor, { multiple: !!campo.multiple, raModulo: contexto.raModulo });
      case TIPO_FICHA:
        return motivoFichas(valor, { multiple: !!campo.multiple });
      case TIPO_TABLA:
        return motivoDeTablas(valor, campo, contexto.guardado, (v, donde, guardada) => motivoDeRejilla(v, donde, { guardada }));
      case TIPO_CLAVE_VALOR:
        return motivoDeTablas(valor, campo, contexto.guardado, (v, donde) => motivoDeClaveValor(v, donde));
      default:
        break;
    }
    // Las tablas derivadas no se guardan nunca: se calculan. El resumen de situaciones es
    // la tabla que en el Word hay que repasar a mano cada vez que se mueve una SA, y la
    // gracia de la aplicación es que no haya que repasarla; si se pudiera guardar a mano,
    // volvería a haber dos versiones y ganaría la escrita.
    if (String(campo.tipo).startsWith('derivado.')) {
      return 'este campo se calcula a partir de las fichas cada vez que se imprime el documento, así que no se guarda.';
    }
    return 'este tipo de campo todavía no tiene editor y no se guarda por aquí: lo que entra sin puerta es un documento que deja de salir.';
  }

  // ---------------------------------------------------------------- exportado

  const api = {
    TIPOS, TIPO_PONDERACION, TIPO_FICHA, TIPO_TEXTO_LARGO, TIPO_TEXTO, TIPO_TABLA, TIPO_CLAVE_VALOR,
    CAMPO_ITEMS, MAX_FILAS, MAX_COLUMNAS, MAX_PARES, CLAVES_CELDA,
    FONDOS_CELDA, ALINEACIONES_CELDA, TAMANOS_CELDA,
    ALINEACION_CELDA_OMISION, TAMANO_CELDA_OMISION,
    seGuarda, fondoDeCelda, alineacionDeCelda, tamanoDeCelda,
    motivoDeFilas, motivoDeRejilla, motivoDeForma, columnasDeRejilla, motivoDeClaveValor,
    motivoDePonderacion, motivoPonderaciones, conservarFilas, sumas,
    motivoFicha, motivoFichas,
    motivoItems, renumerarItems,
    motivoDeCampo,
  };

  global.Core = global.Core || {};
  global.Core.estructurados = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
