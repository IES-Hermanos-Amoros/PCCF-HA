// EDITAR UNA TABLA: lo que pasa con el valor de un campo de tabla cuando alguien escribe en una
// celda, añade o quita una fila o una columna, o pone o quita la cabecera.
//
// Es la lógica del editor de tablas sin nada de pantalla: el componente de React solo pinta el
// valor que sale de aquí y manda cada gesto como una operación. Vive en core/ por lo mismo que
// core/bloques.js: es lo que se puede probar sin navegador, y si la regla estuviera escrita en el
// componente, nadie vería que «quitar una columna» deja una fila corta hasta que alguien exporta.
//
// QUÉ SE EDITA
//
//   tabla              { filas: [[celda, …], …], anchos? }   celda { text, colspan?, rowspan?,
//                      bold?, fondo?, alineacion?, tamano? }
//   tabla_clave_valor  { pares: [{ etiqueta, valor }] }
//
// LAS CREADAS EN LA APLICACIÓN Y LAS IMPORTADAS DEL WORD SE EDITAN IGUAL (`esEditable`). Son el
// mismo tipo de campo y el mismo valor; lo que las distingue es `campo.inicial`, la forma con la
// que nació la creada (core/campos.js), y es lo que usa `esImportada`. Lo que decide si hay editor
// es el TIPO del campo y que no sea una lista de tablas (`multiple`).
//
// UNA IMPORTADA QUE NADIE TOCA SALE IDÉNTICA. Editar no cambia el valor hasta que se hace un gesto:
// `aplicar` devuelve el mismo objeto cuando la operación no cambia nada, el importador no se toca y
// los motores leen el mismo valor, así que el PDF y el Word de lo no editado son byte a byte los de
// antes. Solo cuando alguien la edita pasa a ser suya y deja de coincidir con el Word.
//
// UNA IMPORTADA PUEDE TRAER DEFECTOS DE MAQUETACIÓN que una creada aquí nunca tiene: más de doce
// columnas, una fila más corta o más larga que la primera, un `rowspan` que se sale por el final.
// La puerta (`motivoDeRejilla` de core/estructurados.js) los perdona mientras la FORMA de la tabla
// no cambie, de modo que escribir y dar estilo se puede siempre; y en cuanto la forma cambia exige
// la tabla entera. `motivoDeNo` hace esa misma pregunta antes de dejar pulsar: sobre una tabla de
// partida que no pasaría la puerta, añadir o quitar filas o columnas y combinar o separar celdas se
// niegan, con el defecto por delante y lo que sí se puede hacer.
//
// Quedan fuera las listas de tablas (`multiple`): un campo con varias tablas guarda un array, cada
// tabla con su cuadrícula y su forma guardada por separado, y el editor trabaja con UN valor.
//
// TODA OPERACIÓN DEVUELVE UN VALOR QUE PASA LA PUERTA
//
// `aplicar` no muta: devuelve un valor nuevo cuyas filas cuadran (todas del mismo ancho), dentro
// de los topes de core/estructurados.js, o el MISMO objeto que recibió si la operación no se
// puede hacer. Así el componente no tiene que comprobar nada antes de guardar y el servidor no
// tiene motivo para devolver un 400 a algo que salió de este fichero. `motivoDeNo` dice por qué
// una operación no se puede, para apagar el botón y explicarlo en lugar de dejarlo sin respuesta.
//
// LA CABECERA: LA NEGRITA DE LA PRIMERA FILA, SALVO EN UNA IMPORTADA CON CABECERA DECLARADA
//
// La primera fila es la cabecera si TODAS sus celdas van en negrita, y eso es lo que hace que se
// repita al cambiar de página. Poner la cabecera es poner `bold: true` a la primera fila; quitarla
// es ponérselo a `false`. El texto no se toca. Quitar la fila de la cabecera con «quitar fila»
// también la quita: la fila que pasa a ser la primera no va en negrita.
//
// La excepción es la tabla que venía del Word con una fila de cabecera declarada: su cabecera la
// decide el CAMPO (`campo.columnas`) y no la negrita, así que ni el PDF ni el Word la pierden aunque
// su primera fila no vaya en negrita. Quién decide es `cabeceraDeTabla` de core/estructurados.js,
// la misma función que usan los dos motores; aquí se le pasa el campo siempre que se conoce. En
// esa tabla poner la cabecera sigue valiendo (añade la negrita) y quitarla se niega. Las operaciones
// que reescriben la primera fila (quitar fila, añadir columna) razonan solo con la negrita: lo que
// les importa es cómo van las celdas, no si la fila se repite.
//
// EL FONDO, QUE NO ES LA NEGRITA
//
// Mientras una celda no lleve `fondo`, su sombreado lo decide la negrita: azul claro en la cabecera,
// gris fuera de ella. Con `fondo` manda la clave, y entonces se puede sombrear sin negrita, poner
// negrita sin sombrear y usar el azul en cualquier fila. Quién gana lo decide `fondoDeCelda` de
// core/estructurados.js, la misma función que usan el PDF, el Word y la pantalla, para que los tres
// pinten la misma tabla. `fondoEfectivo` es la consulta que necesita el editor.
//
// El interruptor de cabecera le quita a la primera fila el fondo elegido a mano: es lo que permite
// que ponerla y quitarla se note siempre, en lugar de dejar una cabecera sin azul sin explicación.
//
// LA ALINEACIÓN Y EL TAMAÑO DE LETRA DE UNA CELDA
//
// Por nombre y no por medida («centro», «pequena»), igual que el fondo, porque el PDF los escribe
// en puntos y el Word en medios puntos y en `w:jc`. Quién manda lo deciden `alineacionDeCelda` y
// `tamanoDeCelda` de core/estructurados.js, las mismas que usan los dos motores y la pantalla.
//
// Elegir el valor por omisión («izquierda», «normal») BORRA la clave, no la guarda: así una tabla
// rehecha en la aplicación se parece a la importada hasta en lo que no lleva escrito.
//
// EL ANCHO DE LAS COLUMNAS
//
// Va en la tabla y no en la celda: `anchos` es una lista de pesos relativos, uno por columna. Sin
// ella cada columna mide lo que diga su cantidad de texto, que es el cálculo de cada motor; con
// ella mandan las proporciones. Quien edita no escribe ninguna proporción: ensancha o estrecha una
// columna de una en una, ve el porcentaje que le queda, y «automático» borra la clave entera.
//
// LA CELDA ELEGIDA
//
// El formato (fondo, alineación, tamaño, negrita) y el ancho de la columna se dan desde un panel
// que habla de UNA celda: la elegida. Cuál es eso es estado de la pantalla, pero que siga siendo
// una celda de verdad no lo es: quitar una fila, quitar una columna o combinar dos celdas puede
// dejar la elección apuntando a una casilla que ya no existe. `elegirCelda` devuelve la elección
// que vale para ESTE valor, y `formatoDeCelda` todo lo que el panel enseña de ella en una sola
// lectura, para que la pantalla no deduzca ningún formato por su cuenta.
//
// LAS CELDAS COMBINADAS
//
// Una celda combinada es una que lleva `colspan` o `rowspan` mayor que 1 y que ocupa varias
// casillas de la cuadrícula. La fila del modelo SOLO lleva las celdas que nacen en ella: las
// casillas que cubre una combinación de arriba no tienen celda en su fila. Por eso una fila puede
// tener menos celdas que columnas, y por eso el índice de una celda en su fila (`columna` de
// `texto`, `combinar`, `separar` y `negrita`) no es la columna de la cuadrícula (`columna` de
// `anadir-columna` y `quitar-columna`). `posiciones` da la correspondencia.
//
// Las operaciones de forma se hacen sobre la cuadrícula colocada («colocar»): cada celda con su
// fila, su columna y su tamaño. Se transforma la lista y se vuelve a escribir en filas, y así las
// combinaciones se recolocan en lugar de romperse:
//
//   añadir fila       dentro del recorrido de un `rowspan`, lo alarga; en el resto de casillas
//                     entra una celda vacía.
//   quitar fila       las celdas que nacen en ella y siguen hacia abajo bajan a la fila siguiente
//                     con su texto y un `rowspan` menos; las que la atraviesan acortan su `rowspan`.
//   añadir columna    un `colspan` que la atraviesa se alarga; en el resto de filas entra una
//                     celda vacía.
//   quitar columna    cada `colspan` que la cubre se acorta; una celda que solo ocupaba esa
//                     columna desaparece, y si una fila se queda sin ninguna celda propia se quita
//                     también (sus casillas ya eran de las combinaciones de arriba).
//   fondo             el fondo de una celda: «cabecera», «etiqueta», «ninguno», o sin valor para
//                     que vuelva a decidirlo la negrita (se borra la clave, no se guarda vacía).
//   combinar          la celda absorbe a sus vecinas de la derecha o de abajo. Los textos se
//                     JUNTAN con un salto de línea, en el orden de lectura, y se salta el vacío:
//                     combinar nunca pierde lo escrito. La celda que se queda conserva su negrita.
//   separar           devuelve la celda a 1 × 1 y rellena las casillas libres con celdas vacías
//                     que heredan su negrita; el texto se queda en la primera casilla.
//
// Lo que no tiene salida se niega con su motivo: combinar con vecinas que no encajan en la forma de
// la celda, o combinar si eso dejaría una fila sin ninguna celda propia (el modelo no admite filas
// vacías: se quitaría la fila, no se combinaría).
//
// LA NEGRITA ES EL SOMBREADO. El PDF y el Word pintan de azul claro una celda en negrita de la
// primera fila si toda ella lo está, y de gris cualquier otra celda en negrita. No hay un color
// aparte: `negrita` es el único mando.
//
// UNA TABLA SIN FILAS SE GUARDA
//
// `{ filas: [] }` es una tabla que existe y no tiene nada escrito (core/estructurados.js). Quitar
// la última fila deja eso, y al volver a añadir una se pierde el ancho que tenía: por eso
// `aplicar` acepta `contexto.columnas`, el ancho con el que abrir la fila (el componente recuerda
// el último que vio, y si no, el de `campo.inicial`).
//
// Lógica pura: sin DOM, sin node, sin red. Vale como <script>, como `require` y como `import`.
// Cuelga de `global.Core.tablasEdicion`.

(function (global) {
  'use strict';

  // Las dependencias se resuelven al usarlas y con la ruta LITERAL en cada rama: un
  // `require(variable)` corta el `npm run build` con «Can't resolve <dynamic>».
  function deCore(nombre) {
    if (global.Core && global.Core[nombre]) return global.Core[nombre];
    if (typeof require === 'function') {
      if (nombre === 'estructurados') return require('./estructurados.js');
      if (nombre === 'campos') return require('./campos.js');
    }
    throw new Error('core/tablas-edicion.js necesita core/' + nombre + '.js');
  }
  const Estructurados = () => deCore('estructurados');
  const Campos = () => deCore('campos');

  const esObjeto = (x) => !!x && typeof x === 'object' && !Array.isArray(x);

  // ---------------------------------------------------------------- qué es y qué forma tiene

  // ¿Este campo tiene editor? Los de `Estructurados.TIPOS_EDITABLES` que no son una lista de
  // tablas, los haya creado alguien aquí o los haya traído el Word.
  //
  // `guardado`, si se pasa, es el valor que tiene el campo, y sirve para descartar lo que el editor
  // no sabe abrir: cualquier valor que no tenga la forma de su tipo (una rejilla sin `filas`, o una
  // clave y valor sin `filas` ni `pares`). Sin valor guardado se abre con el de nacimiento del campo
  // y no hay nada que descartar.
  function esEditable(campo, guardado) {
    const E = Estructurados();
    if (!campo || E.TIPOS_EDITABLES.indexOf(campo.tipo) < 0 || campo.multiple) return false;
    if (guardado === undefined || guardado === null) return true;
    if (!esObjeto(guardado)) return false;
    if (Array.isArray(guardado.filas)) return true;
    return E.TIPOS_CON_PARES.indexOf(campo.tipo) >= 0 && Array.isArray(guardado.pares);
  }

  // ¿Vino del Word? Lo que deja el importador es un campo sin `inicial`, que es la señal de que se
  // creó aquí (core/campos.js). Para avisar a quien edita de que lo que escriba ya no coincide con el
  // documento original.
  const esImportada = (campo) => !!campo && !esObjeto(campo.inicial);

  // Cuál de las dos se edita lo decide `queSeImprime`, para que se edite lo que se imprime: un valor
  // con `filas` no vacío es una rejilla aunque traiga `pares`. Una rejilla vacía sin `pares` sigue
  // siéndolo: es la tabla que existe y a la que no se le ha escrito nada.
  const esClaveValor = (valor) => esObjeto(valor) && Estructurados().queSeImprime(null, valor) === 'pares';
  const esRejilla = (valor) => esObjeto(valor) && Array.isArray(valor.filas) && !esClaveValor(valor);

  const sumaDeAnchos = (fila) => fila.reduce((a, c) => a + ((c && c.colspan) || 1), 0);

  // Cuántas columnas tiene: lo que mide la primera fila contando lo que se combina. Un par de
  // clave y valor son siempre dos.
  function columnasDe(valor) {
    if (esClaveValor(valor)) return 2;
    if (!esRejilla(valor) || !valor.filas.length) return 0;
    return sumaDeAnchos(valor.filas[0]);
  }

  const filasDe = (valor) => {
    if (esClaveValor(valor)) return valor.pares.length;
    return esRejilla(valor) ? valor.filas.length : 0;
  };

  // ---------------------------------------------------------------- los anchos de las columnas

  // Los pesos con los que se trabaja al poner los anchos a mano. Son números pequeños a propósito:
  // lo que importa es la PROPORCIÓN entre ellos, y quien edita no escribe ninguno —mueve una
  // columna de una en una y ve el porcentaje que le queda.
  //
  // El tope por columna está para que ninguna se quede sin sitio: con 2 contra 30 ya hay quince
  // veces de diferencia, y para apretar más una columna se estrechan las de al lado.
  const PESO_BASE = 10;
  const PESO_PASO = 1;
  const PESO_MIN = 2;
  const PESO_MAX = 30;

  // Los pesos que trae la tabla, o null si sus columnas se reparten solas. Una lista que no cuadra
  // con las columnas que de verdad tiene no se puede usar (ni se puede guardar: la puerta la
  // rechaza), así que cuenta como si no estuviera.
  function anchosDe(valor) {
    if (!esRejilla(valor) || !Array.isArray(valor.anchos)) return null;
    return valor.anchos.length === columnasDe(valor) ? valor.anchos : null;
  }

  // De qué pesos parte una pulsación: los de la tabla si los tiene, y si no, uno igual para todas.
  // PASAR A ANCHOS A MANO DEJA DE MIRAR EL TEXTO: el reparto automático lo calcula cada motor a
  // partir de la cantidad de texto de cada columna, y core/ no sabe de puntos ni de dxa. Así que al
  // primer toque las columnas quedan iguales y desde ahí se mueve la que haga falta, que es
  // previsible y se ve en el porcentaje. Volver al automático es una operación aparte.
  const pesosDe = (valor) => anchosDe(valor) || Array.from({ length: columnasDe(valor) }, () => PESO_BASE);

  // Qué porcentaje del ancho de la tabla ocupa cada columna, o null si se reparten solas (eso lo
  // calcula cada motor con el texto, y aquí no se puede saber). Es lo que enseña el editor.
  function porcentajesDe(valor) {
    const pesos = anchosDe(valor);
    if (!pesos) return null;
    const suma = pesos.reduce((a, b) => a + b, 0);
    return pesos.map((p) => Math.round((p * 100) / suma));
  }

  // El valor con los anchos puestos o quitados. Sin lista BORRA la clave, igual que `conClave` con
  // las de la celda: «las columnas se reparten solas» se dice de una sola manera, sin la clave.
  function conAnchos(valor, pesos) {
    const fuera = { ...valor };
    delete fuera.anchos;
    return pesos === undefined ? fuera : { ...fuera, anchos: pesos };
  }

  function tieneCombinadas(valor) {
    if (!esRejilla(valor)) return false;
    return valor.filas.some((f) => f.some((c) => (c.colspan || 1) > 1 || (c.rowspan || 1) > 1));
  }

  // Si la primera fila es la cabecera que se imprime. Con `campo` manda la regla entera de
  // `cabeceraDeTabla`; sin él, la negrita de la primera fila. Una tabla sin filas no tiene cabecera.
  const tieneCabecera = (valor, campo) => Estructurados().cabeceraDeTabla(campo, valor);

  // Una celda como las del importador: las cuatro claves y ninguna más.
  const celdaNueva = (text, bold) => ({ text: text || '', colspan: 1, rowspan: 1, bold: !!bold });

  // «3 filas × 4 columnas», para decir de qué tamaño es sin contar celdas.
  function descripcion(valor) {
    const f = filasDe(valor);
    const c = columnasDe(valor);
    const filas = f === 1 ? '1 fila' : f + ' filas';
    if (esClaveValor(valor)) return filas + ' de clave y valor';
    if (!f) return 'sin filas';
    return filas + ' × ' + (c === 1 ? '1 columna' : c + ' columnas');
  }

  // El valor con el que se abre el editor: el guardado si lo hay, y si no, el de nacimiento del
  // campo. Una clave y valor que se edita en pares no necesita unas `filas` vacías al lado; las que
  // tienen contenido mandan y se editan como rejilla (`queSeImprime`), así que no se tocan.
  function valorDe(campo, guardado) {
    const C = Campos();
    const v = esObjeto(guardado) ? guardado : C.valorInicial(campo);
    if (Estructurados().queSeImprime(null, v) !== 'filas') return C.sinFilas(v);
    // Y SI MANDAN LAS FILAS, LOS PARES SE VAN. Un valor importado del Word trae las dos cosas; en
    // cuanto se imprime la rejilla, los pares son el texto de antes y no se pintan en ninguna
    // parte. Dejarlos puestos tiene una consecuencia fea: al vaciar la tabla, `queSeImprime`
    // volveria a elegirlos y en el PDF reaparecería lo que alguien acaba de borrar.
    if (!Array.isArray(v.pares)) return v;
    const sinPares = { ...v };
    delete sinPares.pares;
    return sinPares;
  }

  // ---------------------------------------------------------------- lo que no se puede

  // ---------------------------------------------------------------- la cuadrícula

  // Coloca las celdas como lo hace el generador: cada una en la primera casilla libre de su fila,
  // saltando las que una combinación de arriba ya ocupa. Devuelve null si las filas no cuadran
  // (fila corta o larga, combinación que se sale o que se pisa con otra): sobre eso no se puede
  // razonar, y la puerta (core/estructurados.js) no deja guardarlo en una tabla creada aquí.
  //
  //   n        número de filas          ncols   ancho (lo que mide la primera fila)
  //   mapa     mapa[fila][columna] → la celda que ocupa esa casilla
  //   celdas   { r, c, cs, rs, j, celda }: fila, columna, anchura y altura en casillas, su
  //            índice dentro de su fila (`j`) y la celda del modelo
  function colocar(filas) {
    const n = filas.length;
    const mapa = filas.map(() => []);
    const celdas = [];
    let ncols = 0;
    for (let i = 0; i < n; i += 1) {
      let col = 0;
      const fila = filas[i];
      for (let j = 0; j < fila.length; j += 1) {
        while (mapa[i][col]) col += 1;
        const celda = fila[j];
        const cs = celda.colspan || 1;
        const rs = celda.rowspan || 1;
        if (i + rs > n || (i > 0 && col + cs > ncols)) return null;
        const x = { r: i, c: col, cs, rs, j, celda };
        for (let dr = 0; dr < rs; dr += 1) {
          for (let dc = 0; dc < cs; dc += 1) {
            if (mapa[i + dr][col + dc]) return null;
            mapa[i + dr][col + dc] = x;
          }
        }
        celdas.push(x);
        col += cs;
      }
      if (i === 0) ncols = col;
      else for (let k = 0; k < ncols; k += 1) if (!mapa[i][k]) return null;
    }
    return { n, ncols, mapa, celdas };
  }

  // La celda del modelo con el tamaño que lleva ahora. Si no cambió se devuelve la misma, para que
  // lo que no se toca siga siendo el mismo objeto.
  const celdaFinal = (x) => (((x.celda.colspan || 1) === x.cs && (x.celda.rowspan || 1) === x.rs)
    ? x.celda : { ...x.celda, colspan: x.cs, rowspan: x.rs });

  // Las celdas colocadas otra vez como filas del modelo, en orden de lectura.
  function aFilas(celdas, n) {
    const filas = Array.from({ length: n }, () => []);
    celdas.slice().sort((a, b) => a.r - b.r || a.c - b.c).forEach((x) => filas[x.r].push(celdaFinal(x)));
    return filas;
  }

  const huecoVacio = (r, c, bold, fondo) => ({ r, c, cs: 1, rs: 1, celda: conFondo(celdaNueva('', bold), fondo) });

  // Una celda con una de las claves de estilo (`fondo`, `alineacion`, `tamano`) puesta o quitada.
  // `cual` sin valor BORRA la clave en lugar de guardarla como `undefined`: una celda con
  // `fondo: undefined` no pasa la puerta igual que una sin la clave, y lo que se guarda tiene que
  // ser lo que el importador escribiría. Es una sola función para las tres por lo mismo que
  // `fondoDeCelda` es una sola: la regla escrita tres veces se rompe en una de ellas.
  function conClave(celda, clave, cual) {
    const fuera = { ...celda };
    delete fuera[clave];
    return cual === undefined ? fuera : { ...fuera, [clave]: cual };
  }
  const conFondo = (celda, cual) => conClave(celda, 'fondo', cual);

  // ELEGIR EL VALOR POR OMISIÓN ES BORRAR LA CLAVE. Una celda con `alineacion: 'izquierda'` y una
  // celda sin la clave imprimen exactamente lo mismo (`alineacionDeCelda` de core/estructurados.js
  // devuelve null en los dos casos), así que guardar el nombre dejaría dos maneras de decir lo
  // mismo y una tabla rehecha dejaría de parecerse a la importada.
  //
  // En el fondo no pasa esto: allí «ninguno» ANULA la regla que saca el color de la negrita, así
  // que significa algo y se guarda.
  const sinOmision = (cual, omision) => (cual === null || cual === undefined || cual === omision ? undefined : cual);

  const copia = (g) => g.celdas.map((x) => ({ ...x }));

  // La primera fila que se quedaría sin ninguna celda propia, o -1.
  function filaSinCeldas(celdas, n) {
    for (let r = 0; r < n; r += 1) if (!celdas.some((x) => x.r === r)) return r;
    return -1;
  }

  // Posición de cada celda en la cuadrícula: posiciones(valor)[fila][celda] = { columna, ancho,
  // alto }, con `columna` contada en casillas. null si la tabla no cuadra o no es una rejilla.
  function posiciones(valor) {
    if (!esRejilla(valor)) return null;
    const g = colocar(valor.filas);
    if (!g) return null;
    const res = valor.filas.map(() => []);
    g.celdas.forEach((x) => { res[x.r][x.j] = { columna: x.c, ancho: x.cs, alto: x.rs }; });
    return res;
  }

  // La celda (índice de fila y de celda en ella) que cubre la casilla de la cuadrícula (r, c).
  function celdaEn(valor, r, c) {
    if (!esRejilla(valor)) return null;
    const g = colocar(valor.filas);
    const x = g && g.mapa[r] && g.mapa[r][c];
    return x ? { fila: x.r, columna: x.j } : null;
  }

  // Combinar la celda (fila, columna) con sus vecinas de la derecha o de abajo. Devuelve
  // { motivo } si no se puede, o { celdas, texto, absorbido }: las celdas ya colocadas, el texto
  // que queda en la celda y el que venía de las vecinas (vacío si ninguna llevaba).
  //
  // La vecina tiene que encajar: las casillas contiguas, en todo el alto (a la derecha) o el ancho
  // (hacia abajo) de la celda, han de ser celdas enteras de la misma anchura (altura) que empiezan
  // pegadas a la celda y no se salen de su alto (ancho). Entonces se las absorbe a todas y la celda
  // crece lo que mide cada una. Los textos no vacíos se juntan con un salto de línea.
  function combinarPlan(g, fila, columna, hacia) {
    const x = g.celdas.find((y) => y.r === fila && y.j === columna);
    if (!x) return { motivo: 'No hay esa celda.' };
    const derecha = hacia === 'derecha';
    if (!derecha && hacia !== 'abajo') return { motivo: 'Combinar es hacia la derecha o hacia abajo.' };
    const vecinas = [];
    let encaja;
    if (derecha) {
      const col = x.c + x.cs;
      if (col >= g.ncols) return { motivo: 'Esta celda ya llega al borde derecho de la tabla: no tiene nada a su derecha que combinar.' };
      for (let r = x.r; r < x.r + x.rs; r += 1) if (!vecinas.includes(g.mapa[r][col])) vecinas.push(g.mapa[r][col]);
      encaja = vecinas.every((v) => v.c === col && v.r >= x.r && v.r + v.rs <= x.r + x.rs && v.cs === vecinas[0].cs);
      if (!encaja) {
        return { motivo: 'Las casillas de la derecha no encajan con la altura de esta celda (alguna empieza antes, acaba después o es más ancha que las demás): sepáralas primero.' };
      }
    } else {
      const fil = x.r + x.rs;
      if (fil >= g.n) return { motivo: 'Esta celda ya llega al borde inferior de la tabla: no tiene nada debajo que combinar.' };
      for (let c = x.c; c < x.c + x.cs; c += 1) if (!vecinas.includes(g.mapa[fil][c])) vecinas.push(g.mapa[fil][c]);
      encaja = vecinas.every((v) => v.r === fil && v.c >= x.c && v.c + v.cs <= x.c + x.cs && v.rs === vecinas[0].rs);
      if (!encaja) {
        return { motivo: 'Las casillas de debajo no encajan con el ancho de esta celda (alguna empieza antes, acaba después o es más alta que las demás): sepáralas primero.' };
      }
    }
    const fuera = new Set(vecinas);
    const absorbido = vecinas.map((v) => v.celda.text).filter((t) => String(t).trim() !== '').join('\n');
    const propio = String(x.celda.text).trim() !== '';
    const texto = propio && absorbido ? x.celda.text + '\n' + absorbido : (propio ? x.celda.text : absorbido || x.celda.text);
    const celdas = g.celdas.filter((y) => !fuera.has(y)).map((y) => {
      if (y !== x) return { ...y };
      return derecha
        ? { ...y, cs: y.cs + vecinas[0].cs, celda: { ...y.celda, text: texto } }
        : { ...y, rs: y.rs + vecinas[0].rs, celda: { ...y.celda, text: texto } };
    });
    const vacia = filaSinCeldas(celdas, g.n);
    if (vacia >= 0) {
      return { motivo: `Combinar dejaría la fila ${vacia + 1} sin ninguna celda propia, porque todas sus casillas quedarían dentro de celdas combinadas de arriba. Quita esa fila en lugar de combinar.` };
    }
    return { celdas, texto, absorbido };
  }

  // El texto que se junta a la celda al combinarla en esa dirección, o '' si no hay ninguno o no se
  // puede combinar. El editor lo muestra ANTES de que el gesto se haga.
  function textoQueSeJunta(valor, args = {}) {
    if (!esRejilla(valor)) return '';
    const g = colocar(valor.filas);
    if (!g) return '';
    return combinarPlan(g, args.fila, args.columna, args.hacia).absorbido || '';
  }

  // ---------------------------------------------------------------- lo que no se puede

  // Un motivo de la puerta sin su punto final, para meterlo dentro de otra frase.
  const sinPunto = (texto) => String(texto).replace(/\.$/, '');

  // Las operaciones que cambian la forma de la tabla, con lo que NO se podrá hacer en una tabla
  // torcida, dicho para completar la frase «pero no …».
  const OPERACIONES_DE_FORMA = {
    'anadir-fila': 'añadirle filas',
    'quitar-fila': 'quitarle filas',
    'anadir-columna': 'añadirle columnas',
    'quitar-columna': 'quitarle columnas',
    combinar: 'combinar sus celdas',
    separar: 'separar sus celdas',
  };

  const MOTIVO_CLAVE_VALOR_CELDAS = 'Una tabla de clave y valor tiene un formato fijo (concepto en negrita, contenido normal): no se combinan celdas ni se cambia su negrita.';
  const MOTIVO_CABECERA_DECLARADA = 'Esta tabla venía del Word con una fila de cabecera declarada, así que su primera fila se repite al cambiar de página y eso no se cambia desde aquí. Sí puedes cambiar su texto y su estilo.';
  const MOTIVO_CLAVE_VALOR_ANCHOS = 'Una tabla de clave y valor tiene las dos columnas fijas: el concepto a la izquierda y el resto del ancho para su contenido.';

  // Por qué no se puede una operación, o null si se puede. `args` es el de la operación. Es la
  // misma función para apagar el botón y para que `aplicar` se niegue: no pueden discrepar.
  function motivoDeNo(valor, op, args = {}, campo) {
    const E = Estructurados();
    const claveValor = esClaveValor(valor);
    if (!claveValor && !esRejilla(valor)) return 'Esto no es una tabla.';
    const n = filasDe(valor);

    // Las operaciones de forma razonan sobre la cuadrícula, y la tabla de partida tiene que pasar la
    // puerta entera: una importada con un defecto de maquetación solo se guarda mientras su forma no
    // cambie (ver el principio del fichero), y cada una de estas operaciones la cambia.
    if (!claveValor && OPERACIONES_DE_FORMA[op] && n) {
      const porque = E.motivoDeForma(valor.filas, 'la tabla');
      if (porque || !colocar(valor.filas)) {
        return 'Esta tabla venía del Word con un defecto de maquetación (' + sinPunto(porque || 'sus celdas combinadas no cuadran')
          + '). Se puede escribir en ella y darle estilo (negrita, fondo, alineación, tamaño de letra), pero no '
          + OPERACIONES_DE_FORMA[op] + '.';
      }
    }

    switch (op) {
      case 'texto': {
        const f = args.fila;
        if (!Number.isInteger(f) || f < 0 || f >= n) return 'No hay esa fila.';
        if (claveValor) return args.columna === 0 || args.columna === 1 ? null : 'No hay esa columna.';
        const fila = valor.filas[f];
        return Number.isInteger(args.columna) && args.columna >= 0 && args.columna < fila.length ? null : 'No hay esa celda.';
      }
      case 'anadir-fila': {
        if (n >= (claveValor ? E.MAX_PARES : E.MAX_FILAS)) {
          return 'Una tabla no puede tener más de ' + (claveValor ? E.MAX_PARES : E.MAX_FILAS) + ' filas.';
        }
        const d = args.despuesDe;
        if (d !== undefined && d !== null && (!Number.isInteger(d) || d < 0 || d >= n)) return 'No hay esa fila.';
        return null;
      }
      case 'quitar-fila':
        return Number.isInteger(args.fila) && args.fila >= 0 && args.fila < n ? null : 'No hay esa fila.';
      case 'anadir-columna': {
        if (claveValor) return 'Una tabla de clave y valor tiene siempre dos columnas.';
        if (!n) return 'La tabla no tiene filas: añade una fila antes de añadir columnas.';
        if (columnasDe(valor) >= E.MAX_COLUMNAS) {
          return 'Una tabla no puede tener más de ' + E.MAX_COLUMNAS + ' columnas: no caben en el ancho de la hoja.';
        }
        const d = args.despuesDe;
        if (d !== undefined && d !== null && (!Number.isInteger(d) || d < 0 || d >= columnasDe(valor))) return 'No hay esa columna.';
        return null;
      }
      case 'quitar-columna':
        if (claveValor) return 'Una tabla de clave y valor tiene siempre dos columnas.';
        if (!n) return 'La tabla no tiene filas.';
        if (columnasDe(valor) <= 1) return 'Una tabla tiene al menos una columna: para vaciarla, quita sus filas.';
        return Number.isInteger(args.columna) && args.columna >= 0 && args.columna < columnasDe(valor) ? null : 'No hay esa columna.';
      case 'cabecera':
        if (claveValor) return 'Una tabla de clave y valor no tiene fila de cabecera.';
        if (!n) return 'La tabla no tiene filas: añade una antes de ponerle cabecera.';
        // Ponerla vale siempre (añade la negrita). Quitarla, no: en esta tabla la decide el campo.
        if (args.puesta === false && Estructurados().cabeceraFijaDelCampo(campo)) return MOTIVO_CABECERA_DECLARADA;
        return null;
      case 'ancho': {
        if (claveValor) return MOTIVO_CLAVE_VALOR_ANCHOS;
        if (!n) return 'La tabla no tiene filas: añade una fila antes de repartir las columnas.';
        const cols = columnasDe(valor);
        // Los anchos son un peso por columna, y las columnas que dibuja el generador son hasta donde
        // llega la fila más ancha. Si la primera fila no llega, los pesos que cuadraran con ella los
        // descartaría el motor y la tabla seguiría repartiéndose sola: mejor no dejar poner unos que
        // no se van a ver, y decirlo. Una tabla de más de doce columnas o con una fila corta sí
        // cuadra, y se reparte.
        const dibujadas = E.columnasDeRejilla(valor.filas);
        if (dibujadas !== cols) {
          const porque = E.motivoDeForma(valor.filas, 'la tabla');
          return 'Esta tabla venía del Word con una fila más ancha que la primera (' + cols + ' columnas la primera, '
            + dibujadas + ' la más ancha): no está claro cuántas columnas tiene y no se pueden repartir sus anchos a mano'
            + (porque ? ' (' + sinPunto(porque) + ')' : '') + '. Se puede escribir en ella y darle estilo; las columnas se repartirán solas según el texto.';
        }
        if (!Number.isInteger(args.columna) || args.columna < 0 || args.columna >= cols) return 'No hay esa columna.';
        const peso = pesosDe(valor)[args.columna];
        if (args.hacia === 'ensanchar') {
          return peso + PESO_PASO <= PESO_MAX ? null
            : 'Esta columna ya es lo más ancha que puede ser: estrecha las de al lado para darle más sitio.';
        }
        if (args.hacia === 'estrechar') {
          return peso - PESO_PASO >= PESO_MIN ? null
            : 'Esta columna ya es lo más estrecha que puede ser: ensancha las de al lado para quitarle sitio.';
        }
        return 'Una columna se ensancha o se estrecha.';
      }
      case 'anchos-automaticos':
        if (claveValor) return MOTIVO_CLAVE_VALOR_ANCHOS;
        return anchosDe(valor) ? null : 'Las columnas de esta tabla ya se reparten solas según su texto.';
      case 'combinar':
      case 'separar':
      case 'fondo':
      case 'alineacion':
      case 'tamano':
      case 'negrita': {
        if (claveValor) return MOTIVO_CLAVE_VALOR_CELDAS;
        const f = args.fila;
        if (!Number.isInteger(f) || f < 0 || f >= n
          || !Number.isInteger(args.columna) || args.columna < 0 || args.columna >= valor.filas[f].length) {
          return 'No hay esa celda.';
        }
        if (op === 'negrita') return null;
        if (op === 'fondo') {
          return args.cual === null || args.cual === undefined || E.FONDOS_CELDA.indexOf(args.cual) >= 0
            ? null
            : 'Los fondos son ' + E.FONDOS_CELDA.join(', ') + ', o ninguno de ellos para que lo decida la negrita.';
        }
        if (op === 'alineacion') {
          return args.cual === null || args.cual === undefined || E.ALINEACIONES_CELDA.indexOf(args.cual) >= 0
            ? null
            : 'Las alineaciones son ' + E.ALINEACIONES_CELDA.join(', ') + '.';
        }
        if (op === 'tamano') {
          return args.cual === null || args.cual === undefined || E.TAMANOS_CELDA.indexOf(args.cual) >= 0
            ? null
            : 'Los tamaños de letra son ' + E.TAMANOS_CELDA.join(', ') + '.';
        }
        if (op === 'separar') {
          const celda = valor.filas[f][args.columna];
          return (celda.colspan || 1) > 1 || (celda.rowspan || 1) > 1 ? null : 'Esta celda no está combinada: no hay nada que separar.';
        }
        return combinarPlan(colocar(valor.filas), f, args.columna, args.hacia).motivo || null;
      }
      default:
        return 'Operación desconocida: ' + op + '.';
    }
  }

  const puede = (valor, op, args, campo) => motivoDeNo(valor, op, args, campo) === null;

  // ---------------------------------------------------------------- las operaciones

  const insertar = (lista, i, x) => lista.slice(0, i).concat([x], lista.slice(i));

  // Aplica una operación. Operaciones y sus argumentos:
  //
  //   texto                { fila, columna, valor }     el texto de una celda (o de la clave / el valor de un par)
  //   anadir-fila          { despuesDe? }               sin `despuesDe`, al final
  //   quitar-fila          { fila }
  //   anadir-columna       { despuesDe? }               sin `despuesDe`, al final
  //   quitar-columna       { columna }
  //   cabecera             { puesta }                   true: primera fila en negrita; false: sin negrita
  //   combinar             { fila, columna, hacia }     hacia 'derecha' o 'abajo'; `columna` es el índice de la celda en su fila
  //   separar              { fila, columna }            la celda vuelve a 1 × 1
  //   negrita              { fila, columna, puesta }    la negrita de una celda
  //   fondo                { fila, columna, cual }      'cabecera', 'etiqueta', 'ninguno' o null
  //   alineacion           { fila, columna, cual }      'izquierda' (borra), 'centro', 'derecha' o null
  //   tamano               { fila, columna, cual }      'normal' (borra), 'pequena', 'grande' o null
  //   ancho                { columna, hacia }           hacia 'ensanchar' o 'estrechar'
  //   anchos-automaticos   { }                          las columnas vuelven a repartirse solas
  //
  // En `anadir-columna`, `quitar-columna` y `ancho`, `columna` y `despuesDe` cuentan casillas de la
  // cuadrícula; en el resto, `columna` es el índice de la celda en su fila.
  //
  // `contexto.columnas` es el ancho con el que abrir una fila en una tabla que se ha quedado sin
  // ninguna. `contexto.campo` es el campo de la tabla, que hace falta para saber si su cabecera se
  // puede quitar. Devuelve el mismo objeto si la operación no se puede hacer o no cambia nada.
  function aplicar(valor, op, args = {}, contexto = {}) {
    if (motivoDeNo(valor, op, args, contexto.campo) !== null) return valor;
    const E = Estructurados();

    if (esClaveValor(valor)) {
      const pares = valor.pares;
      if (op === 'texto') {
        const clave = args.columna === 0 ? 'etiqueta' : 'valor';
        const texto = String(args.valor == null ? '' : args.valor);
        if (pares[args.fila][clave] === texto) return valor;
        return { ...valor, pares: pares.map((p, i) => (i === args.fila ? { ...p, [clave]: texto } : p)) };
      }
      if (op === 'anadir-fila') {
        const i = args.despuesDe == null ? pares.length : args.despuesDe + 1;
        return { ...valor, pares: insertar(pares, i, { etiqueta: '', valor: '' }) };
      }
      if (op === 'quitar-fila') return { ...valor, pares: pares.filter((_, i) => i !== args.fila) };
      return valor;
    }

    const filas = valor.filas;
    if (op === 'texto') {
      const texto = String(args.valor == null ? '' : args.valor);
      if (filas[args.fila][args.columna].text === texto) return valor;
      return {
        ...valor,
        filas: filas.map((f, i) => (i !== args.fila ? f
          : f.map((c, j) => (j === args.columna ? { ...c, text: texto } : c)))),
      };
    }

    // El interruptor de cabecera manda sobre la primera fila: le pone o le quita la negrita y le
    // QUITA el fondo elegido a mano, porque un «ninguno» suelto dejaría la cabecera sin azul y el
    // interruptor parecería no hacer nada. Quien quiera otro color lo elige después, celda a celda.
    if (op === 'cabecera') {
      const puesta = !!args.puesta;
      const yaEsta = puesta ? tieneCabecera(valor) : filas[0].every((c) => c.bold !== true);
      if (yaEsta && filas[0].every((c) => c.fondo === undefined)) return valor;
      return {
        ...valor,
        filas: filas.map((f, i) => (i !== 0 ? f : f.map((c) => conFondo({ ...c, bold: puesta }, undefined)))),
      };
    }

    if (op === 'negrita') {
      const puesta = !!args.puesta;
      if ((filas[args.fila][args.columna].bold === true) === puesta) return valor;
      return {
        ...valor,
        filas: filas.map((f, i) => (i !== args.fila ? f
          : f.map((c, j) => (j === args.columna ? { ...c, bold: puesta } : c)))),
      };
    }

    // «cual» null o sin pasar quita la clave: el fondo vuelve a decidirlo la negrita.
    if (op === 'fondo') {
      const cual = args.cual == null ? undefined : args.cual;
      if (filas[args.fila][args.columna].fondo === cual) return valor;
      return {
        ...valor,
        filas: filas.map((f, i) => (i !== args.fila ? f
          : f.map((c, j) => (j === args.columna ? conFondo(c, cual) : c)))),
      };
    }

    // La alineación y el tamaño de letra de una celda. El nombre de la operación es el de la clave
    // de la celda, y elegir el valor por omisión («izquierda», «normal») la BORRA: ver `sinOmision`.
    if (op === 'alineacion' || op === 'tamano') {
      const omision = op === 'alineacion' ? E.ALINEACION_CELDA_OMISION : E.TAMANO_CELDA_OMISION;
      const cual = sinOmision(args.cual, omision);
      if (filas[args.fila][args.columna][op] === cual) return valor;
      return {
        ...valor,
        filas: filas.map((f, i) => (i !== args.fila ? f
          : f.map((c, j) => (j === args.columna ? conClave(c, op, cual) : c)))),
      };
    }

    // Mover el ancho de una columna. La primera pulsación sobre una tabla cuyas columnas se
    // reparten solas las iguala y mueve esa: ver `pesosDe`.
    if (op === 'ancho') {
      const pesos = pesosDe(valor);
      const paso = args.hacia === 'ensanchar' ? PESO_PASO : -PESO_PASO;
      return conAnchos(valor, pesos.map((p, j) => (j === args.columna ? p + paso : p)));
    }

    // Volver al reparto automático: se borra la clave entera, no se guarda una lista «neutra».
    if (op === 'anchos-automaticos') return conAnchos(valor, undefined);

    // Lo que queda cambia la forma: se hace sobre la cuadrícula colocada.
    const g = colocar(filas);
    let celdas;
    let n = g.n;
    // LOS ANCHOS VIAJAN CON LAS COLUMNAS: una lista con un peso de más o de menos no se podría
    // guardar, así que las dos operaciones que cambian el número de columnas la mueven con ellas.
    // Las demás no la tocan, y una tabla que se queda sin filas la pierde (sin columnas no hay
    // nada que repartir).
    let pesos = anchosDe(valor) || undefined;

    if (op === 'anadir-fila') {
      const ancho = g.ncols || Math.min(Math.max(parseInt(contexto.columnas, 10) || 1, 1), E.MAX_COLUMNAS);
      const k = args.despuesDe == null ? n : args.despuesDe + 1;
      const atravesadas = new Set();
      celdas = copia(g);
      celdas.forEach((x) => {
        if (x.r < k && x.r + x.rs > k) {
          x.rs += 1;
          for (let c = x.c; c < x.c + x.cs; c += 1) atravesadas.add(c);
        } else if (x.r >= k) x.r += 1;
      });
      for (let c = 0; c < ancho; c += 1) if (!atravesadas.has(c)) celdas.push(huecoVacio(k, c, false));
      n += 1;
    } else if (op === 'quitar-fila') {
      const f = args.fila;
      const eraCabecera = f === 0 && tieneCabecera(valor);
      celdas = [];
      copia(g).forEach((x) => {
        if (x.r === f) {
          if (x.rs === 1) return;
          // Nace aquí y sigue hacia abajo: baja a la fila siguiente (que pasa a ser esta) con su
          // texto. Si era la cabecera, deja de serlo: la fila que queda primera no va en negrita.
          x.rs -= 1;
          if (eraCabecera) x.celda = { ...x.celda, bold: false };
        } else if (x.r < f && x.r + x.rs > f) x.rs -= 1;
        else if (x.r > f) x.r -= 1;
        celdas.push(x);
      });
      n -= 1;
    } else if (op === 'anadir-columna') {
      const k = args.despuesDe == null ? g.ncols : args.despuesDe + 1;
      const titulo = 'Columna ' + (g.ncols + 1);
      const cabecera = tieneCabecera(valor);
      const atravesadas = new Set();
      celdas = copia(g);
      celdas.forEach((x) => {
        if (x.c < k && x.c + x.cs > k) {
          x.cs += 1;
          for (let r = x.r; r < x.r + x.rs; r += 1) atravesadas.add(r);
        } else if (x.c >= k) x.c += 1;
      });
      for (let r = 0; r < n; r += 1) {
        if (atravesadas.has(r)) continue;
        celdas.push(r === 0 && cabecera
          ? { r, c: k, cs: 1, rs: 1, celda: celdaNueva(titulo, true) }
          : huecoVacio(r, k, false));
      }
      // La columna nueva nace del ancho de la que tiene al lado: es lo que se espera al pulsar
      // «añadir a la derecha de esta».
      if (pesos) pesos = insertar(pesos, k, pesos[k - 1]);
    } else if (op === 'quitar-columna') {
      const col = args.columna;
      if (pesos) pesos = pesos.filter((_, j) => j !== col);
      celdas = [];
      copia(g).forEach((x) => {
        if (x.c <= col && col < x.c + x.cs) {
          x.cs -= 1;
          if (!x.cs) return;
        } else if (x.c > col) x.c -= 1;
        celdas.push(x);
      });
      // Una fila cuyas celdas eran solo de esa columna queda sin celdas propias: sus casillas ya
      // eran de combinaciones de arriba, así que se quita y esas combinaciones se acortan.
      for (let r = n - 1; r >= 0; r -= 1) {
        if (celdas.some((x) => x.r === r)) continue;
        celdas.forEach((x) => {
          if (x.r < r && x.r + x.rs > r) x.rs -= 1;
          else if (x.r > r) x.r -= 1;
        });
        n -= 1;
      }
    } else if (op === 'combinar') {
      celdas = combinarPlan(g, args.fila, args.columna, args.hacia).celdas;
    } else if (op === 'separar') {
      const x = g.celdas.find((y) => y.r === args.fila && y.j === args.columna);
      celdas = copia(g);
      const propia = celdas.find((y) => y.r === x.r && y.c === x.c);
      propia.cs = 1;
      propia.rs = 1;
      for (let dr = 0; dr < x.rs; dr += 1) {
        for (let dc = 0; dc < x.cs; dc += 1) {
          if (dr || dc) celdas.push(huecoVacio(x.r + dr, x.c + dc, x.celda.bold === true, x.celda.fondo));
        }
      }
    } else {
      return valor;
    }
    return conAnchos({ ...valor, filas: aFilas(celdas, n) }, n ? pesos : undefined);
  }

  // ---------------------------------------------------------------- para pintar

  // Cualquier valor de los dos tipos como una lista de filas de celdas { text, bold, colspan,
  // rowspan }, y si la primera es cabecera. Sirve a la vista previa de la creación y a la del
  // editor: así las dos pintan el mismo valor de la misma manera.
  function paraPintar(valor, campo) {
    if (esClaveValor(valor)) {
      return {
        cabecera: false,
        filas: valor.pares.map((p) => [{ text: p.etiqueta, bold: true }, { text: p.valor }]),
      };
    }
    if (esRejilla(valor)) return { cabecera: tieneCabecera(valor, campo), filas: valor.filas };
    return { cabecera: false, filas: [] };
  }

  // El fondo que una celda lleva DE VERDAD, con el nombre que entienden los dos motores: lo decide
  // `fondoDeCelda` de core/estructurados.js, así que la pantalla no puede pintar una tabla distinta
  // de la que se imprime.
  function fondoEfectivo(valor, fila, columna, campo) {
    if (!esRejilla(valor) || !valor.filas[fila] || !valor.filas[fila][columna]) return null;
    return Estructurados().fondoDeCelda(valor.filas[fila][columna], fila === 0 && tieneCabecera(valor, campo));
  }

  // Lo mismo con la alineación y el tamaño de letra: null cuando la celda sale como siempre. Los
  // deciden `alineacionDeCelda` y `tamanoDeCelda` de core/estructurados.js, las mismas funciones
  // que traducen el PDF y el Word.
  const celdaEnFila = (valor, fila, columna) => (esRejilla(valor) && valor.filas[fila] && valor.filas[fila][columna]) || null;
  const alineacionEfectiva = (valor, fila, columna) => Estructurados().alineacionDeCelda(celdaEnFila(valor, fila, columna));
  const tamanoEfectivo = (valor, fila, columna) => Estructurados().tamanoDeCelda(celdaEnFila(valor, fila, columna));

  // ---------------------------------------------------------------- la celda elegida

  // QUÉ CELDA ESTÁ ELEGIDA, SEGÚN ESTE VALOR. El panel de formato del editor actúa sobre una celda
  // y la elección se guarda como { fila, columna } —el índice de la celda DENTRO de su fila, el
  // mismo que usan `texto`, `negrita`, `fondo`, `combinar` y `separar`—, así que no sobrevive sola a
  // un cambio de forma: quitar la última fila, quitar una columna o combinar dos celdas deja la
  // elección fuera de la tabla.
  //
  // La regla es la misma que ya usa el foco al quitar una fila: la celda que ocupa su sitio. Se
  // acerca la fila a la última que haya y, dentro de ella, la celda a la última que tenga —una fila
  // puede tener menos celdas que columnas si una combinación de arriba le ocupa casillas—. Sin
  // filas no hay celda elegida y el panel lo dice en lugar de inventarse una.
  function elegirCelda(valor, eleccion) {
    if (!esRejilla(valor) || !valor.filas.length) return null;
    if (!eleccion) return null;
    const { fila, columna } = eleccion;
    if (!Number.isInteger(fila) || !Number.isInteger(columna) || fila < 0 || columna < 0) return null;
    const f = Math.min(fila, valor.filas.length - 1);
    const ancho = valor.filas[f].length;
    if (!ancho) return null;
    return { fila: f, columna: Math.min(columna, ancho - 1) };
  }

  // TODO LO QUE EL PANEL DE FORMATO ENSEÑA DE LA CELDA ELEGIDA, de una vez. Se distingue lo que la
  // celda lleva ESCRITO (`fondo`, `alineacion`, `tamano`: la clave, o null cuando no la lleva, que es
  // lo que el desplegable tiene que enseñar seleccionado) de lo que le sale DE VERDAD
  // (`fondoEfectivo`, `alineacionEfectiva`, `tamanoEfectivo`: lo que deciden core/estructurados.js y
  // la negrita, y lo que se imprime). Son dos cosas distintas y la pantalla no puede deducir una de
  // la otra: una celda sin `fondo` sale sombreada si va en negrita.
  //
  // `columnaRejilla` es la columna de la CUADRÍCULA donde empieza la celda, que es la que se
  // ensancha o se estrecha; `columna` es su índice dentro de la fila, que es lo que piden las
  // operaciones. Confundirlas en una tabla con combinaciones da formato a otra celda.
  function formatoDeCelda(valor, eleccion, campo) {
    const d = elegirCelda(valor, eleccion);
    if (!d) return null;
    const celda = valor.filas[d.fila][d.columna];
    const pos = posiciones(valor);
    const p = (pos && pos[d.fila] && pos[d.fila][d.columna]) || { columna: d.columna, ancho: 1, alto: 1 };
    const pct = porcentajesDe(valor);
    const clave = (x) => (x === undefined ? null : x);
    return {
      fila: d.fila,
      columna: d.columna,
      columnaRejilla: p.columna,
      ancho: p.ancho,
      alto: p.alto,
      combinada: p.ancho > 1 || p.alto > 1,
      enCabecera: d.fila === 0 && tieneCabecera(valor, campo),
      negrita: celda.bold === true,
      fondo: clave(celda.fondo),
      fondoEfectivo: fondoEfectivo(valor, d.fila, d.columna, campo),
      alineacion: clave(celda.alineacion),
      alineacionEfectiva: alineacionEfectiva(valor, d.fila, d.columna),
      tamano: clave(celda.tamano),
      tamanoEfectivo: tamanoEfectivo(valor, d.fila, d.columna),
      porcentaje: pct ? pct[p.columna] : null,
    };
  }

  const api = {
    esEditable, esClaveValor, esRejilla,
    columnasDe, filasDe, tieneCombinadas, tieneCabecera, celdaNueva, descripcion, valorDe,
    esImportada, motivoDeNo, puede, aplicar, paraPintar, posiciones, celdaEn, textoQueSeJunta,
    fondoEfectivo, alineacionEfectiva, tamanoEfectivo,
    anchosDe, porcentajesDe,
    elegirCelda, formatoDeCelda,
  };

  global.Core = global.Core || {};
  global.Core.tablasEdicion = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
