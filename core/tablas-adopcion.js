// ADOPTAR EL MODELO PARA UNA TABLA YA ESCRITA: soltarle la fila de rótulos, emparejar cada celda con
// la parte que le corresponde, escribir el contenido por id de parte y quitar la rejilla.
//
// POR QUÉ ESTO ES UNA PIEZA Y NO UN DETALLE
//
// Una tabla escrita hoy lleva su fila de rótulos DENTRO de sus celdas, en `valor.filas`. En cuanto su
// campo gana un modelo, esa fila pasa a ser contenido: la tabla imprimiría los rótulos dos veces —los
// suyos y los de la estructura— o no cuadraría con ella y dejaría de guardarse. Mientras no exista
// esta función, un modelo solo sirve para tablas nuevas, que son cero. Es el mismo problema que
// `completarDesdeFilas` de core/sa.js resuelve para una ficha importada —rescatar lo que solo está en
// la rejilla antes de que la rejilla se vaya—, y aquí no había equivalente.
//
// ADOPTAR NO PUEDE PERDER UN CARÁCTER, Y CUANDO NO PUEDE GARANTIZARLO SE NIEGA Y DICE POR QUÉ
//
// Perder algo al tocar otra cosa es la peor forma de perderlo: nadie relaciona lo que falta con lo
// que hizo (la nota de `completarDesdeFilas`). Así que esta función no descarta texto en silencio
// NUNCA: o coloca todo lo escrito bajo la parte que le toca, o se niega nombrando lo que no cuadra.
// Los motivos para negarse, y lo que cada uno protege:
//
//   · DOS RÓTULOS CASAN CON LA MISMA PARTE. Uno taparía al otro al guardarse bajo el mismo id.
//   · UN RÓTULO NO CASA CON NINGUNA PARTE. Esa columna (o esa fila) no está en el modelo: su
//     contenido no tendría dónde ir y su rótulo desaparecería del documento.
//   · UNA CELDA CON TEXTO SE QUEDARÍA SIN SITIO. Una columna sin rótulo, o celdas de más a la derecha
//     de la cabecera: texto que no es de ninguna parte.
//   · LA TABLA TIENE CELDAS COMBINADAS donde la correspondencia tiene que ser de una celda a una
//     parte. Una casilla es de una parte y de UNA SOLA (`CLAVES_CASILLA` de core/estructurados.js):
//     con un colspan no se sabe de cuál es su texto, y con un rowspan es de dos filas a la vez.
//   · LO QUE SE GUARDARÍA NO PASARÍA LA PUERTA, o lo que se imprimiría no sería el mismo texto. Son
//     las dos redes de seguridad, y las dos preguntan a quien ya sabe la respuesta en lugar de
//     repetir su criterio: la puerta (`motivoDeCasillas`, `motivoDeContenido`) y la propia regla de
//     impresión (`tablaVigente`, `paresVigentes` de core/modelos-tabla.js).
//
// EL EMPAREJAMIENTO ES EL DEL LECTOR DE LA FICHA, NO UNO PARECIDO
//
// Los rótulos se emparejan con las partes con el MAPA DEL LECTOR (`porEtiqueta` y `norm` de
// core/sa.js), que es el mismo con el que `choqueDeEtiquetaFicha` de core/plantilla.js comprueba que
// dos filas de la ficha no se llamen igual. Así cubre mayúsculas, acentos, los espacios de más y los
// SINÓNIMOS, y sobre todo: es el MISMO criterio que ya gobierna 306 fichas, no una comparación nueva
// que acertaría casi siempre y fallaría sin decir nada justo cuando no.
//
// Un rótulo EN BLANCO no casa con nada, aunque una parte tuviera la etiqueta vacía: un rótulo en
// blanco no nombra a nadie, y dos columnas sin rótulo casarían con la misma parte.
//
// QUÉ SE ADOPTA DE CADA MAQUETACIÓN. Son las tres que los motores saben pintar desde una estructura,
// y adoptar es exactamente su inversa: lo que entra por aquí tiene que volver a salir por allí.
//
//   sentido 'columnas'                    la fila 1 son los rótulos y cada parte es una columna:
//                                         `casillas[parte] = [celda de cada fila de debajo]`
//   sentido 'filas', tipo clave y valor   cada fila es «rótulo | contenido», o cada par es
//                                         «etiqueta | valor»: `casillas[parte] = celda`
//   sentido 'filas', tipo tabla           la maquetación de la ficha: una fila de rótulos y debajo
//                                         la de sus contenidos, con la banda del grupo encima
//                                         (`aLoAlto`): `casillas[parte] = celda`
//
// LO QUE SÍ CAMBIA AL ADOPTAR, Y POR ESO SE DICE CON NÚMEROS ANTES DE ACEPTAR. No se pierde texto,
// pero el documento no sale idéntico, y quien lo acepta tiene que saberlo:
//
//   · LOS RÓTULOS LOS PONE EL MODELO. Si la tabla decía «Temporaliz.» y su parte se llama
//     «Temporalización», se imprimirá «Temporalización». Es para lo que existe el modelo —renombrar
//     una columna en la plantilla la renombra en las once tablas—, y el informe lo NOMBRA.
//   · LOS ANCHOS DE COLUMNA LOS PONE EL MODELO. Una tabla adoptada no guarda `anchos`
//     (`motivoDeAnchosAdoptada` de core/estructurados.js), así que los que traía del Word se van.
//   · LAS PARTES QUE EL MODELO TIENE Y LA TABLA NO se imprimen en blanco; el informe las nombra.
//   · UNA COLUMNA SIN RÓTULO Y SIN NADA ESCRITO DESAPARECE. No se pierde ningún carácter —por eso no
//     se niega—, pero la tabla sale con una columna menos, así que se dice.
//
// Lógica pura: sin DOM, sin red, sin node. Vale como <script> en el mockup, como `require` en las
// pruebas y en las rutas, y como `import` desde Next. Cuelga de `global.Core.tablasAdopcion`, igual
// que los demás módulos de core/.

(function (global) {
  'use strict';

  // Las dependencias se resuelven al usarlas y con la ruta LITERAL en cada rama: un
  // `require(variable)` corta el `npm run build` con «Can't resolve <dynamic>».
  function deCore(nombre) {
    if (global.Core && global.Core[nombre]) return global.Core[nombre];
    if (typeof require === 'function') {
      if (nombre === 'modelosTabla') return require('./modelos-tabla.js');
      if (nombre === 'estructurados') return require('./estructurados.js');
      if (nombre === 'sa') return require('./sa.js');
    }
    throw new Error('core/tablas-adopcion.js necesita core/' + nombre + '.js');
  }
  const MT = () => deCore('modelosTabla');
  const Est = () => deCore('estructurados');
  const Sa = () => deCore('sa');

  const esObjeto = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
  const texto = (c) => (esObjeto(c) ? String(c.text == null ? '' : c.text) : '');
  const limpio = (c) => texto(c).trim();
  const span = (c, clave) => Math.max(1, Number(esObjeto(c) ? c[clave] : 1) || 1);
  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
  const mayuscula = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const lista = (x) => (Array.isArray(x) ? x : []);
  const fila = (filas, i) => lista(filas[i]);

  // Cómo se nombra un texto dentro de un aviso: recortado, porque una celda de contenido puede traer
  // un párrafo entero y lo que hace falta leer es con qué celda de la tabla se corresponde. Es el
  // `RECORTE` de `nombraFila` de core/sa.js, y por lo mismo.
  const RECORTE = 60;
  const recorte = (s) => {
    const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    return t.length > RECORTE ? `${t.slice(0, RECORTE - 1)}…` : t;
  };

  // «la a, la b y la c»: la coma hasta el último, que va con «y». Igual que `enLista` de core/sa.js.
  function enLista(partes) {
    if (!partes.length) return '';
    if (partes.length === 1) return partes[0];
    return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`;
  }
  const comillas = (xs) => enLista(xs.map((x) => `«${recorte(x)}»`));

  // ---------------------------------------------------------------- emparejar un rótulo con su parte

  // EL MAPA DEL LECTOR, para que el criterio sea exactamente el suyo (ver la cabecera). Las partes de
  // un modelo son `{ id, etiqueta, retirado? }`, que es la forma que `porEtiqueta` lee, y las
  // retiradas las deja fuera él mismo: un rótulo que solo casara con una parte retirada no casa con
  // nada, y así su texto no acaba guardado donde no se imprimiría.
  function emparejador(partes) {
    // `porEtiqueta` memoriza por lista, así que se le pasa la del modelo tal cual mientras se pueda:
    // una copia nueva en cada llamada rehace el mapa en cada tabla del grupo.
    const todas = lista(partes);
    const mapa = Sa().porEtiqueta(todas.every(esObjeto) ? todas : todas.filter(esObjeto));
    return (t) => {
      const clave = Sa().norm(t);
      return clave ? mapa.get(clave) || null : null;
    };
  }

  // ---------------------------------------------------------------- leer la tabla escrita

  // UNA LECTURA de la tabla tal como está escrita, antes de decidir nada:
  //
  //   rotulos    [{ texto, donde, parte }]  qué rótulo hay en cada sitio y con qué parte casa
  //   contenido  [{ parte, celdas }]        las celdas que le toca a cada parte, en su orden
  //   sueltas    [{ donde, texto }]         celdas con texto que no son de ninguna parte
  //   sinRotulo  [{ donde }]                columnas o celdas sin rótulo y sin nada escrito
  //   combinada  { donde, cuantas, que }    la primera celda combinada donde no puede haberla
  //   bandas     cuántas filas de rótulo de grupo se descartan (la estructura las vuelve a imprimir)
  const nuevaLectura = () => ({ rotulos: [], contenido: [], sueltas: [], sinRotulo: [], combinada: null, combinadas: 0, bandas: 0 });

  // La celda de una parte, tal como se guarda: la misma celda SIN las claves que una casilla no
  // admite (`CLAVES_CASILLA` de core/estructurados.js). `colspan` y `rowspan` se van porque una
  // casilla es de una parte y de una sola, y `campo` porque es de la ficha; el estilo —la negrita, el
  // fondo, la alineación, el tamaño— se queda, que adoptar no puede costarle a nadie lo que eligió.
  //
  // EN UNA TABLA DE CLAVE Y VALOR SOLO SE QUEDA EL TEXTO, porque es lo único que se imprime: un par
  // es su rótulo y su texto (`CLAVES_CASILLA_PAR`). Guardar ahí la negrita sería guardarla para que no
  // se viera nunca, y eso acaba leyéndolo alguien. Se dice en el informe, con el número de partes a
  // las que les pasa, antes de que nadie acepte nada.
  function casillaDeCelda(celda, claves) {
    const out = { text: texto(celda) };
    if (!esObjeto(celda)) return out;
    for (const clave of claves) {
      if (clave !== 'text' && celda[clave] !== undefined) out[clave] = celda[clave];
    }
    return out;
  }

  // LA REJILLA DE VERDAD QUE HAY DETRÁS DE LAS CELDAS COMBINADAS.
  //
  // Una celda con `rowspan` o `colspan` aparece UNA VEZ, en su esquina, así que las filas de debajo
  // traen menos celdas y la celda j de una de ellas NO está en la columna j. Trabajar sobre eso le
  // daría a una parte el texto de otra, que es la media correspondencia que esta pieza existe para no
  // hacer. Así que lo primero es desplegar la rejilla como la pinta un navegador: cada celda en su
  // esquina y las posiciones que cubre marcadas como cubiertas, sin texto propio.
  //
  // Y ES LO QUE HACE ADOPTABLE LA FORMA MAYORITARIA DE LOS DOCUMENTOS QUE NO SON PROGRAMACIONES: una
  // primera columna fusionada que agrupa tres, cuatro o cinco filas. Desplegada, su texto queda en la
  // primera de esas filas y las demás quedan en blanco, así que no se pierde un carácter —el texto
  // está entero y bajo la parte que le toca—, pero la tabla deja de salir con la celda alta y sale
  // con una celda escrita y las demás vacías. Eso es un cambio de aspecto y se cuenta como tal, que
  // es lo que hay que avisar antes de aceptar.
  //
  // Devuelve `{ matriz, combinadas, columnas }`; cada posición es `{ celda, w, h, cubierta }`, y la
  // cubierta no lleva celda porque no es de nadie: la pinta la de su esquina.
  function expandir(filas) {
    const matriz = [];
    const sitio = (i) => {
      while (matriz.length <= i) matriz.push([]);
      return matriz[i];
    };
    let combinadas = 0;
    let columnas = 0;
    filas.forEach((f, i) => {
      const celdas = lista(f);
      sitio(i);
      let j = 0;
      for (const celda of celdas) {
        while (matriz[i][j] !== undefined) j += 1;
        const w = span(celda, 'colspan');
        const h = span(celda, 'rowspan');
        if (w > 1 || h > 1) combinadas += 1;
        for (let di = 0; di < h && i + di < filas.length; di += 1) {
          sitio(i + di);
          for (let dj = 0; dj < w; dj += 1) {
            matriz[i + di][j + dj] = di === 0 && dj === 0
              ? { celda, w, h }
              : { celda: null, w: 1, h: 1, cubierta: true };
          }
        }
        j += w;
        columnas = Math.max(columnas, j);
      }
    });
    // Los huecos que deja una fila más corta que las demás: una posición sin celda y sin cubrir.
    for (let i = 0; i < matriz.length; i += 1) {
      for (let j = 0; j < columnas; j += 1) if (matriz[i][j] === undefined) matriz[i][j] = null;
    }
    return { matriz, combinadas, columnas };
  }

  const VACIA = { text: '' };
  // La celda que hay en una posición de la rejilla desplegada: la suya, o una vacía si está cubierta
  // por otra o si la fila no llegaba hasta ahí.
  const enPos = (matriz, i, j) => {
    const x = matriz[i] ? matriz[i][j] : undefined;
    return x && x.celda ? x.celda : VACIA;
  };
  const combinadaEnPos = (matriz, i, j) => {
    const x = matriz[i] ? matriz[i][j] : undefined;
    return !!(x && x.celda && (x.w > 1 || x.h > 1));
  };

  // A LO ANCHO: la fila 1 son los rótulos y cada parte es una columna. La celda i de la columna j es
  // la casilla i de la parte del rótulo j, así que todas las columnas acaban con tantas casillas como
  // filas de contenido tiene la tabla, que es lo que la puerta exige (`motivoDeContenido`: «una fila
  // de la tabla es una casilla de cada columna»).
  //
  // LA CABECERA NO ADMITE CELDAS COMBINADAS, y es la única parte de la tabla donde no se admiten: un
  // rótulo que cubre dos columnas del modelo no dice de qué parte es, y uno que cubre dos filas es
  // rótulo y contenido a la vez. En el cuerpo sí, porque ahí la rejilla desplegada dice sin ninguna
  // duda a qué columna pertenece cada texto.
  function porColumnas(filas, casa, casilla) {
    const r = nuevaLectura();
    const { matriz, columnas } = expandir(filas);
    for (let j = 0; j < columnas; j += 1) {
      if (!combinadaEnPos(matriz, 0, j)) continue;
      const x = matriz[0][j];
      r.combinada = {
        donde: `la celda ${j + 1} de la fila 1`,
        cuantas: x.w > 1 ? x.w : x.h,
        que: x.w > 1 ? 'columnas' : 'filas',
        rotulo: true,
      };
      return r;
    }
    const alto = matriz.length;
    for (let j = 0; j < columnas; j += 1) {
      const columna = [];
      for (let i = 1; i < alto; i += 1) {
        columna.push(enPos(matriz, i, j));
        if (combinadaEnPos(matriz, i, j)) r.combinadas += 1;
      }
      const celda = enPos(matriz, 0, j);
      const rotulo = texto(celda);
      const parte = casa(rotulo);
      if (parte) {
        r.rotulos.push({ texto: rotulo, donde: `la columna ${j + 1}`, parte, celda, fila: 0, colspan: 1 });
        r.contenido.push({ parte, celdas: columna.map(casilla) });
        continue;
      }
      // Sin parte: el rótulo que no casa lo dice `rotulos`, y lo que se queda sin sitio es su columna.
      if (rotulo.trim()) r.rotulos.push({ texto: rotulo, donde: `la columna ${j + 1}`, parte: null });
      const conTexto = columna.filter((c) => limpio(c));
      if (!rotulo.trim() && !conTexto.length) r.sinRotulo.push({ donde: `la columna ${j + 1}` });
      columna.forEach((c, i) => {
        if (limpio(c)) r.sueltas.push({ donde: `la celda ${j + 1} de la fila ${i + 2}`, texto: limpio(c) });
      });
    }
    return r;
  }

  // A LO ALTO EN DOS COLUMNAS: cada fila es «rótulo | contenido», que es como está escrita una tabla
  // de clave y valor que vino del Word. Es la rejilla de la que `parseClaveValor` del importador monta
  // los pares, con la diferencia de que al adoptar los rótulos pasan a ser los de la estructura.
  function porFilasDeDos(filas, casa, casilla) {
    const r = nuevaLectura();
    const { matriz, columnas } = expandir(filas);
    for (let i = 0; i < matriz.length; i += 1) {
      const celda = enPos(matriz, i, 0);
      const valor = enPos(matriz, i, 1);
      const rotulo = texto(celda);
      const parte = casa(rotulo);
      if (combinadaEnPos(matriz, i, 0) || combinadaEnPos(matriz, i, 1)) r.combinadas += 1;
      if (parte) {
        r.rotulos.push({ texto: rotulo, donde: `la fila ${i + 1}`, parte, celda, fila: i, colspan: 1 });
        // `original` es la celda tal como está escrita: la casilla de una tabla de clave y valor no
        // guarda su estilo, así que es ahí donde se ve lo que se pierde al adoptar.
        r.contenido.push({ parte, celdas: [casilla(valor)], original: valor });
      } else {
        if (rotulo.trim()) r.rotulos.push({ texto: rotulo, donde: `la fila ${i + 1}`, parte: null });
        else if (!limpio(valor)) r.sinRotulo.push({ donde: `la fila ${i + 1}` });
        if (limpio(valor)) r.sueltas.push({ donde: `la celda 2 de la fila ${i + 1}`, texto: limpio(valor) });
      }
      // Una tabla de clave y valor son dos columnas: de la tercera en adelante no hay dónde ponerlo,
      // porque la parte de un rótulo guarda UNA casilla.
      for (let j = 2; j < columnas; j += 1) {
        const x = enPos(matriz, i, j);
        if (limpio(x)) r.sueltas.push({ donde: `la celda ${j + 1} de la fila ${i + 1}`, texto: limpio(x) });
      }
    }
    return r;
  }

  // LOS PARES, cuando la tabla no tiene rejilla: cada par es «etiqueta | valor», y el valor es texto
  // pelado, sin estilo que conservar.
  function dePares(pares, casa) {
    const r = nuevaLectura();
    lista(pares).forEach((par, i) => {
      const p = esObjeto(par) ? par : {};
      const etiqueta = String(p.etiqueta == null ? '' : p.etiqueta);
      const valor = String(p.valor == null ? '' : p.valor);
      const parte = casa(etiqueta);
      if (parte) {
        r.rotulos.push({ texto: etiqueta, donde: `el par ${i + 1}`, parte, celda: null, fila: i, colspan: 1 });
        r.contenido.push({ parte, celdas: [{ text: valor }] });
        return;
      }
      if (etiqueta.trim()) r.rotulos.push({ texto: etiqueta, donde: `el par ${i + 1}`, parte: null });
      else if (!valor.trim()) r.sinRotulo.push({ donde: `el par ${i + 1}` });
      if (valor.trim()) r.sueltas.push({ donde: `el par ${i + 1}`, texto: valor.trim() });
    });
    return r;
  }

  // A LO ALTO: LA MAQUETACIÓN DE LA FICHA. Es la inversa de `aLoAlto` de core/modelos-tabla.js, y la
  // misma lectura que la del lector de la ficha (`leerFilas` de core/sa.js). Cada fila de la rejilla
  // desplegada es una de estas tres cosas, y se reconoce por LO QUE EL MODELO DICE DE SUS PARTES:
  //
  //   · UNA FILA DE PARES, si lleva el rótulo de una parte `al_lado`: entonces su casilla es la
  //     posición siguiente, en la misma fila. Es la cabecera de una ficha («Sesiones | 10 |
  //     Evaluación | 1ª») y la identificación de un módulo, que lleva dos pares por fila.
  //   · UNA FILA DE RÓTULOS, si todas sus celdas con texto son rótulos de partes que NO van al lado:
  //     entonces la fila de DEBAJO son sus contenidos, columna por columna.
  //   · LA BANDA DE UN GRUPO, si es una sola celda con el rótulo de un grupo de la estructura: se
  //     descarta porque la estructura la vuelve a imprimir igual, que es la misma excepción que
  //     `filasSinCampo` hace con la cabecera de las actividades. Sin ella, toda ficha del documento
  //     parecería perder algo, y un aviso que sale siempre no avisa de nada.
  //
  // Cualquier otra fila con texto es texto que se quedaría sin sitio, y entonces se niega: es lo que
  // pasa con las dos celdas de arriba de una ficha —«Situación de aprendizaje 3» y su título—, que no
  // llevan rótulo propio y por eso ninguna parte las reclama.
  function apiladas(filas, casa, estructura, casilla) {
    const r = nuevaLectura();
    const mt = MT();
    const { matriz, combinadas, columnas } = expandir(filas);
    r.combinadas = combinadas;
    const grupos = new Set(estructura.vigentes
      .map((p) => mt.grupoDe(p))
      .filter(Boolean)
      .map((g) => Sa().norm(g.etiqueta)));
    const parteEn = (i, j) => {
      const t = texto(enPos(matriz, i, j));
      return t.trim() ? casa(t) : null;
    };
    const esRotulos = (i) => {
      let hay = false;
      for (let j = 0; j < columnas; j += 1) {
        const x = enPos(matriz, i, j);
        if (!limpio(x)) continue;
        const parte = parteEn(i, j);
        if (!parte || mt.alLado(parte)) return false;
        hay = true;
      }
      return hay;
    };
    const hayPares = (i) => {
      for (let j = 0; j < columnas; j += 1) {
        const parte = parteEn(i, j);
        if (parte && mt.alLado(parte)) return true;
      }
      return false;
    };
    const sueltaEn = (i, j) => {
      const x = enPos(matriz, i, j);
      if (limpio(x)) r.sueltas.push({ donde: `la celda ${j + 1} de la fila ${i + 1}`, texto: limpio(x) });
    };

    for (let i = 0; i < matriz.length; i += 1) {
      if (hayPares(i)) {
        for (let j = 0; j < columnas; j += 1) {
          const parte = parteEn(i, j);
          if (parte && mt.alLado(parte)) {
            const celda = enPos(matriz, i, j);
            r.rotulos.push({
              texto: texto(celda), donde: `la celda ${j + 1} de la fila ${i + 1}`, parte, celda, fila: i,
              // El par ocupa `ancho` columnas: una el rótulo y el resto la casilla.
              colspan: 1,
            });
            r.contenido.push({ parte, celdas: [casilla(enPos(matriz, i, j + 1))], original: enPos(matriz, i, j + 1) });
            j += 1;
            continue;
          }
          sueltaEn(i, j);
        }
        continue;
      }
      if (esRotulos(i)) {
        // La fila siguiente es la de los contenidos, y solo si NO es a su vez una fila de rótulos ni
        // de pares: dos filas de rótulos seguidas son dos filas sin contenido, no una con el de la
        // otra.
        const hayDebajo = i + 1 < matriz.length && !esRotulos(i + 1) && !hayPares(i + 1);
        for (let j = 0; j < columnas; j += 1) {
          const parte = parteEn(i, j);
          const abajo = hayDebajo ? enPos(matriz, i + 1, j) : VACIA;
          if (parte) {
            const celda = enPos(matriz, i, j);
            r.rotulos.push({
              texto: texto(celda), donde: `la celda ${j + 1} de la fila ${i + 1}`, parte, celda, fila: i,
              colspan: matriz[i][j] ? matriz[i][j].w : 1,
            });
            r.contenido.push({ parte, celdas: [casilla(abajo)], original: abajo });
            continue;
          }
          if (limpio(enPos(matriz, i, j))) { sueltaEn(i, j); continue; }
          if (hayDebajo && limpio(abajo)) sueltaEn(i + 1, j);
          else if (!matriz[i][j] || !matriz[i][j].cubierta) r.sinRotulo.push({ donde: `la celda ${j + 1} de la fila ${i + 1}` });
        }
        if (hayDebajo) i += 1;
        continue;
      }
      const textos = [];
      for (let j = 0; j < columnas; j += 1) if (limpio(enPos(matriz, i, j))) textos.push({ j, texto: limpio(enPos(matriz, i, j)) });
      if (!textos.length) continue;
      if (textos.length === 1 && grupos.has(Sa().norm(textos[0].texto))) { r.bandas += 1; continue; }
      textos.forEach((x) => sueltaEn(i, x.j));
    }
    return r;
  }

  // ---------------------------------------------------------------- lo que se imprimiría

  // EL TEXTO DE CONTENIDO QUE SE IMPRIME de una tabla que ya ha adoptado, preguntándoselo a la regla
  // de impresión y no deduciéndolo otra vez. Los rótulos se dejan fuera porque los pone la estructura
  // y pueden decir otra cosa que la tabla —es para lo que existe el modelo—; lo que no puede cambiar
  // es el CONTENIDO, y eso es lo que se compara.
  //
  // LA MARCA CON LA QUE SE SABE QUÉ CELDA ES UN RÓTULO ES `campo`, el id de su parte, que es lo que
  // `aLoAlto` y `tablaVigente` les ponen. De ahí salen las tres clases de fila impresa:
  //
  //   todas con `campo`    una fila de rótulos: su contenido es la fila de DEBAJO
  //   algunas con `campo`  una fila de pares: el contenido son las celdas que NO lo llevan
  //   ninguna con `campo`  contenido, o la banda de un grupo, que no lleva `campo` y tampoco es
  //                        contenido: se reconoce por ser el rótulo de un grupo de la estructura,
  //                        igual que al leerla (`apiladas`)
  function contenidoImpreso(campo, valor, modelos) {
    const mt = MT();
    // Qué mitad de una tabla de clave y valor se imprime no lo decide esta pieza: una tabla de clave
    // y valor se imprime por sus pares (`pintarClaveValor` de motor/render-generico.js), así que es
    // `paresVigentes` quien dice lo que sale.
    if (esObjeto(campo) && campo.tipo === mt.TIPO_CLAVE_VALOR) {
      return lista(mt.paresVigentes(campo, valor, modelos).pares).map((p) => String(p && p.valor == null ? '' : p.valor));
    }
    const estructura = mt.estructuraDeTabla(campo, valor, modelos);
    const grupos = new Set((estructura ? estructura.vigentes : [])
      .map((p) => mt.grupoDe(p)).filter(Boolean).map((g) => Sa().norm(g.etiqueta)));
    const filas = lista(mt.tablaVigente(campo, valor, modelos, false).filas);
    const out = [];
    const esRotulo = (c) => esObjeto(c) && typeof c.campo === 'string';
    const mete = (celdas) => celdas.forEach((c) => out.push(texto(c)));
    for (let i = 0; i < filas.length; i += 1) {
      const celdas = fila(filas, i);
      const rotulos = celdas.filter(esRotulo).length;
      if (rotulos && rotulos === celdas.length) {
        if (Array.isArray(filas[i + 1])) { mete(fila(filas, i + 1)); i += 1; }
        continue;
      }
      if (rotulos) { mete(celdas.filter((c) => !esRotulo(c))); continue; }
      if (celdas.length === 1 && grupos.has(Sa().norm(texto(celdas[0])))) continue;
      mete(celdas);
    }
    return out;
  }

  // ---------------------------------------------------------------- lo que cambia de aspecto

  // CÓMO SE VE UNA CELDA IMPRESA, preguntándoselo a las reglas que lo deciden (`fondoDeCelda`,
  // `alineacionDeCelda` y `tamanoDeCelda` de core/estructurados.js) en lugar de mirar sus claves: el
  // fondo de una celda del Word no está escrito en ninguna clave, lo deduce la negrita y el estar o no
  // en la cabecera, así que compararlas por sus claves diría que no cambia nada cuando sí cambia.
  function comoSeVe(celda, enCabecera) {
    const e = Est();
    return [
      esObjeto(celda) && !!celda.bold ? 'N' : 'n',
      e.fondoDeCelda(celda, enCabecera) || '-',
      e.alineacionDeCelda(celda) || '-',
      e.tamanoDeCelda(celda) || '-',
    ].join('|');
  }

  // ¿REPARTEN EL ANCHO IGUAL? Los anchos de una tabla y los pesos de un modelo son los dos medidas
  // RELATIVAS —el motor los normaliza al pintar (`anchos()` de motor/render-generico.js)—, así que
  // lo que se compara es la proporción y no los números: 30/70 y 3/7 son el mismo reparto.
  function mismaProporcion(a, b) {
    const reparto = (xs) => {
      if (!Array.isArray(xs) || !xs.length) return null;
      const total = xs.reduce((n, x) => n + (Number(x) || 0), 0);
      return total > 0 ? xs.map((x) => Math.round(((Number(x) || 0) / total) * 1e6)).join(',') : null;
    };
    return reparto(a) === reparto(b);
  }

  // Las celdas de rótulo que el modelo pinta, por el id de su parte: son las que llevan `campo`.
  function rotulosPintados(filas) {
    const out = new Map();
    lista(filas).forEach((f) => lista(f).forEach((c) => {
      if (esObjeto(c) && typeof c.campo === 'string') out.set(c.campo, c);
    }));
    return out;
  }

  // QUÉ CAMBIA DE LO QUE SE IMPRIME, aunque no se pierda ni un carácter. Una tabla importada se
  // imprime como vino, también en el estilo (§3.5 de docs/modelos-de-tabla.md), y ADOPTAR es justo el
  // momento en que eso deja de aplicarse: los rótulos salen de la estructura, así que el estilo pasa a
  // ser el del modelo. Perder texto es inaceptable y por eso se niega; cambiar el aspecto es
  // aceptable, pero quien lo pide tiene derecho a saber el número antes de aceptar.
  //
  // Se compara contra lo que los motores van a pintar DE VERDAD —`tablaVigente` y `paresVigentes`—,
  // no contra lo que esta pieza supone que harán.
  function aspectoDe(campo, valor, nuevo, modelos, lectura) {
    const mt = MT();
    const cabeceraAntes = Est().cabeceraDeTabla(campo, valor);
    const porPares = esObjeto(campo) && campo.tipo === mt.TIPO_CLAVE_VALOR;
    const pintada = porPares ? { cabecera: false, filas: [] } : mt.tablaVigente(campo, nuevo, modelos, cabeceraAntes);
    const pintados = rotulosPintados(pintada.filas);
    const casados = lectura.rotulos.filter((x) => x.parte);
    let estilo = 0;
    let ancho = 0;
    for (const x of casados) {
      // UNA TABLA DE CLAVE Y VALOR SE IMPRIME POR SUS PARES, y un par es texto pelado: su rótulo lo
      // pinta `pintarClaveValor` con el estilo que esa tabla tiene en la aplicación, y el contenido
      // pierde la negrita, el fondo, la alineación y el tamaño que trajera del Word.
      if (porPares) {
        if (comoSeVe(x.celda, false) !== 'n|-|-|-') estilo += 1;
        continue;
      }
      const despues = pintados.get(x.parte.id);
      if (comoSeVe(x.celda, cabeceraAntes && x.fila === 0) !== comoSeVe(despues, pintada.cabecera)) estilo += 1;
      if (x.colspan !== span(despues, 'colspan')) ancho += 1;
    }
    let contenido = 0;
    if (porPares) {
      // La casilla de una tabla de clave y valor guarda solo su texto, así que el estilo que se
      // pierde se cuenta sobre la celda ORIGINAL y no sobre lo que se ha guardado.
      for (const x of lectura.contenido) {
        if (x.original && comoSeVe(x.original, false) !== 'n|-|-|-') contenido += 1;
      }
    }
    // LOS ANCHOS DE COLUMNA CAMBIAN SI LA PROPORCIÓN CAMBIA, y no por el hecho de que los diga el
    // modelo en lugar de la tabla: un modelo cuyos `peso` reproducen los anchos que la tabla traía
    // del Word imprime la tabla con las mismas columnas, y decir que ha cambiado sería un aviso
    // falso. Sin anchos a un lado y con ellos al otro, sí cambia: se pasa de repartir por el texto a
    // repartir por la proporción, o al revés.
    const anchos = !mismaProporcion(esObjeto(valor) ? valor.anchos : undefined, porPares ? undefined : pintada.anchos);
    const cabecera = !porPares && cabeceraAntes !== !!pintada.cabecera;
    const rotulos = casados.filter((x) => x.texto.trim() !== etiquetaDe(x.parte).trim()).length;
    // Las celdas que dejan de estar combinadas: su texto está entero y bajo la parte que le toca,
    // pero la tabla ya no sale con la celda alta o ancha, sino con una escrita y las demás vacías.
    const combinadas = lectura.combinadas;
    return {
      cambia: !!(rotulos || estilo || ancho || contenido || anchos || cabecera || combinadas),
      rotulos, estilo, ancho, contenido, anchos, cabecera, combinadas,
    };
  }

  // Los mismos textos, descontado lo que está en blanco y sin su orden: una celda vacía no es texto
  // que se pueda perder, y el orden en que se recorren las columnas no es el de las filas impresas.
  const soloTextos = (xs) => xs.map((t) => String(t == null ? '' : t).trim()).filter(Boolean).sort();
  const cuadran = (a, b) => a.length === b.length && a.every((t, i) => t === b[i]);

  // ---------------------------------------------------------------- el informe

  const cuantos = (xs) => xs.reduce((n, x) => n + String(x.texto == null ? '' : x.texto).length, 0);
  const etiquetaDe = (p) => String(p && p.etiqueta == null ? '' : p.etiqueta);

  // LOS NÚMEROS Y LOS NOMBRES PROPIOS de lo que la adopción hace o dejaría de hacer. Se compone
  // SIEMPRE, también cuando se niega: es lo que la pantalla enseña antes de aceptar y lo que el aviso
  // al docente necesita. Un «hecho» sin cifras no vale para ninguna de las dos cosas.
  function informeDe(estructura, lectura, de) {
    const puestas = lectura.contenido.filter((x) => x.parte);
    const colocadas = puestas.reduce((n, x) => n + x.celdas.length, 0);
    const ids = new Set(puestas.map((x) => x.parte.id));
    const sinParte = lectura.rotulos.filter((x) => !x.parte && x.texto.trim());
    const repetidos = [];
    const vistas = new Map();
    lectura.rotulos.filter((x) => x.parte).forEach((x) => {
      if (vistas.has(x.parte.id)) repetidos.push({ x, otro: vistas.get(x.parte.id) });
      else vistas.set(x.parte.id, x);
    });
    return {
      de,
      sentido: estructura.sentido,
      origen: estructura.origen,
      modelo: estructura.modelo,
      partes: estructura.vigentes.length,
      casillas: colocadas,
      conTexto: puestas.reduce((n, x) => n + x.celdas.filter((c) => limpio(c)).length, 0),
      caracteres: puestas.reduce((n, x) => n + x.celdas.reduce((m, c) => m + limpio(c).length, 0), 0),
      // Los rótulos que casan, con la parte que les toca. `cambia` es que el texto impreso no va a
      // ser el que la tabla traía, porque el rótulo lo pone el modelo.
      rotulos: lectura.rotulos.filter((x) => x.parte).map((x) => ({
        texto: x.texto.trim(),
        donde: x.donde,
        parte: x.parte.id,
        etiqueta: etiquetaDe(x.parte),
        cambia: x.texto.trim() !== etiquetaDe(x.parte).trim(),
      })),
      sinParte: sinParte.map((x) => ({ texto: x.texto.trim(), donde: x.donde, caracteres: x.texto.trim().length })),
      repetidos: repetidos.map(({ x, otro }) => ({
        texto: x.texto.trim(), donde: x.donde, otro: otro.texto.trim(), otroDonde: otro.donde,
        parte: x.parte.id, etiqueta: etiquetaDe(x.parte),
      })),
      // Las partes del modelo que esta tabla no trae: se imprimirán en blanco. No es un defecto —es
      // la parte recién añadida al modelo—, pero se dice, porque es una fila o una columna más.
      sinContenido: estructura.vigentes.filter((p) => !ids.has(p.id))
        .map((p) => ({ id: p.id, etiqueta: etiquetaDe(p) })),
      sueltas: lectura.sueltas.map((x) => ({ donde: x.donde, texto: recorte(x.texto), caracteres: x.texto.length })),
      sinRotulo: lectura.sinRotulo.slice(),
      bandas: lectura.bandas,
      // EL TEXTO EN JUEGO: lo que se perdería si esto se adoptara tal cual. Es la cifra que decide.
      enJuego: cuantos(lectura.sueltas) + cuantos(sinParte),
      // Qué cambia de lo que se imprime aunque no se pierda texto. Se rellena solo cuando la
      // adopción se puede hacer: es lo que hay que avisar antes de aceptarla.
      aspecto: null,
      frase: null,
      aviso: null,
    };
  }

  // La frase con la que la pantalla cuenta una adopción que sí se puede hacer, y el aviso de lo que
  // cambia aunque no se pierda nada. `aviso` es null cuando no cambia nada visible.
  function redactar(informe) {
    const aspecto = informe.aspecto || {};
    const reescritos = informe.rotulos.filter((x) => x.cambia);
    informe.frase = `Se colocan ${plural(informe.casillas, 'casilla', 'casillas')} en `
      + `${plural(informe.rotulos.length, 'parte', 'partes')} de las ${informe.partes} del modelo, con `
      + `${plural(informe.caracteres, 'carácter', 'caracteres')} de texto. Los rótulos los pondrá el modelo.`;
    const partes = [];
    if (reescritos.length) {
      partes.push(`${reescritos.length === 1 ? 'Un rótulo se imprimirá' : `${reescritos.length} rótulos se imprimirán`}`
        + ` con el nombre que les da el modelo: ${enLista(reescritos.map((x) => `«${recorte(x.texto)}» pasa a «${recorte(x.etiqueta)}»`))}.`);
    }
    if (informe.sinContenido.length) {
      partes.push(`${plural(informe.sinContenido.length, 'parte del modelo', 'partes del modelo')} `
        + `${informe.sinContenido.length === 1 ? 'se queda' : 'se quedan'} sin nada escrito y `
        + `${informe.sinContenido.length === 1 ? 'se imprimirá' : 'se imprimirán'} en blanco: `
        + `${comillas(informe.sinContenido.map((p) => p.etiqueta || p.id))}.`);
    }
    if (informe.sinRotulo.length) {
      partes.push(`${mayuscula(enLista(informe.sinRotulo.map((x) => x.donde)))} `
        + `${informe.sinRotulo.length === 1 ? 'no tiene rótulo ni nada escrito, así que desaparece' : 'no tienen rótulo ni nada escrito, así que desaparecen'} de la tabla.`);
    }
    // EL ASPECTO IMPRESO, que no es lo mismo que el texto. Una tabla importada se imprime como vino,
    // también en el estilo; adoptar es el momento en que el estilo pasa a ser el del modelo.
    if (aspecto.estilo || aspecto.contenido || aspecto.cabecera) {
      const comos = [];
      if (aspecto.estilo) comos.push(`${plural(aspecto.estilo, 'rótulo cambia', 'rótulos cambian')} de negrita o de fondo`);
      if (aspecto.contenido) comos.push(`${plural(aspecto.contenido, 'parte pierde', 'partes pierden')} la negrita o el fondo que traía del Word`);
      if (aspecto.cabecera) comos.push('la fila de los rótulos pasa a ser la cabecera que se repite al cambiar de página');
      partes.push(`${mayuscula(enLista(comos))}: la tabla seguirá diciendo lo mismo, pero no se imprimirá igual.`);
    }
    if (aspecto.combinadas) {
      partes.push(`${plural(aspecto.combinadas, 'celda', 'celdas')} `
        + `${aspecto.combinadas === 1 ? 'deja de estar combinada' : 'dejan de estar combinadas'}: su texto queda en la `
        + `${aspecto.combinadas === 1 ? 'primera fila que ocupaba' : 'primera fila que ocupaban'} y el resto en blanco.`);
    }
    if (aspecto.ancho) {
      partes.push(`${plural(aspecto.ancho, 'parte ocupa', 'partes ocupan')} en el modelo un número de columnas distinto del que ocupaba en la tabla.`);
    }
    if (aspecto.anchos) partes.push('La tabla deja de llevar sus anchos de columna: los pondrá el modelo.');
    informe.aviso = partes.length ? partes.join(' ') : null;
    return informe;
  }

  // ---------------------------------------------------------------- adoptar

  // LO QUE SE VA DEL VALOR AL ADOPTAR. La rejilla y los pares, porque su contenido pasa a estar por id
  // de parte y tenerlo en los dos sitios es justo lo que la puerta impide («en dos sitios a la vez»);
  // y los anchos, porque el ancho de una columna es parte de la forma y la forma la dice el modelo
  // (`motivoDeAnchosAdoptada`). Todo lo demás se queda tal cual: `estructura` sobre todo, que es de la
  // tabla y no del contenido.
  const CLAVES_QUE_SE_VAN = ['filas', 'anchos', 'pares'];

  // POR QUÉ NO SE PUEDE ADOPTAR, con un nombre corto además del texto. El nombre es para contar y
  // agrupar —«de 248 tablas, 134 se niegan por celda combinada»— y el texto es para la persona. Los
  // dos salen del mismo sitio a propósito: una pantalla que agrupara por su cuenta acabaría contando
  // una cosa distinta de la que el aviso dice.
  const MOTIVOS = [
    'sin-estructura', 'ya-adoptada', 'todas-retiradas', 'otra-fuente', 'celda-combinada',
    'rotulos-repetidos', 'rotulo-sin-parte', 'celda-sin-sitio', 'no-pasa-la-puerta', 'cambia-lo-impreso',
  ];

  const negar = (clave, motivo, informe) => ({ valor: null, clave, motivo, informe: informe || null });

  // POR QUÉ ESTA TABLA NO TIENE NINGUNA ESTRUCTURA QUE ADOPTAR. Son los casos en que la regla
  // (`estructuraDeTabla`) no devuelve ninguna, dichos con el motivo que le toca a cada uno.
  function motivoSinEstructura(campo, modelos) {
    const mt = MT();
    if (!esObjeto(campo) || mt.TIPOS.indexOf(campo.tipo) < 0) {
      return 'Esta tabla no es de un tipo al que se le pueda poner un modelo: los modelos son de las tablas y de las tablas de clave y valor.';
    }
    const modelo = mt.modeloDeCampo(campo, modelos);
    if (modelo) {
      return `El modelo «${modelo.nombre || modelo.id}» todavía no tiene ninguna parte: mientras no diga qué partes tiene, no hay forma que adoptar.`;
    }
    if (campo.modelo) {
      return `Este campo apunta al modelo «${campo.modelo}», que no está en la plantilla del documento o es de otro tipo de tabla.`;
    }
    return 'Este campo no sigue ningún modelo: ponle uno y entonces sus tablas se podrán adoptar.';
  }

  // ADOPTAR EL MODELO PARA UNA TABLA YA ESCRITA. Devuelve SIEMPRE las cuatro cosas:
  //
  //   valor    el valor nuevo, con el contenido por id de parte y sin rejilla, o null si se niega
  //   motivo   por qué se niega, redactado para quien lo lee, o null si se puede adoptar
  //   clave    el nombre corto de ese motivo (`MOTIVOS`), para contar y agrupar, o null
  //   informe  los números y los nombres; null solo cuando no hay ninguna estructura de la que hablar
  //
  // No toca el valor que recibe ni guarda nada: quien llama decide si escribe el que sale. `valor` es
  // UNA tabla; un campo `multiple` es una lista de tablas y se adoptan de una en una.
  function adoptar(campo, valor, modelos) {
    const mt = MT();
    const estructura = mt.estructuraDeTabla(campo, valor, modelos);
    if (!estructura) return negar('sin-estructura', motivoSinEstructura(campo, modelos), null);
    const vacio = () => informeDe(estructura, nuevaLectura(), 'nada');
    if (mt.adoptada(valor)) {
      return negar('ya-adoptada', 'Esta tabla ya guarda su contenido por partes: no hay nada que adoptar.', vacio());
    }
    if (!estructura.vigentes.length) {
      return negar('todas-retiradas', 'Todas las partes de este modelo están retiradas: no hay ninguna con la que emparejar lo que la tabla tiene escrito.', vacio());
    }

    // DE DÓNDE SALE EL CONTENIDO lo dice `queSeImprime`, y no esta pieza: se adopta lo que se imprime,
    // porque lo que se imprime es lo que la gente ve y lo que cree que está guardado.
    const que = Est().queSeImprime(campo, valor);
    if (que !== 'filas' && que !== 'pares' && que !== 'ninguno') {
      return negar('otra-fuente', `Esta tabla se imprime desde «${que}», que no es una rejilla ni unos pares: no hay rótulos que soltar.`, vacio());
    }

    const casa = emparejador(estructura.partes);
    const porFilas = estructura.sentido === mt.SENTIDO_FILAS;
    const esPar = campo.tipo === mt.TIPO_CLAVE_VALOR;
    const claves = esPar ? Est().CLAVES_CASILLA_PAR : Est().CLAVES_CASILLA;
    const casilla = (celda) => casillaDeCelda(celda, claves);
    let lectura;
    if (que === 'ninguno') lectura = nuevaLectura();
    else if (que === 'pares') lectura = dePares(valor.pares, casa);
    else if (!porFilas) lectura = porColumnas(lista(valor.filas), casa, casilla);
    else if (esPar) lectura = porFilasDeDos(lista(valor.filas), casa, casilla);
    else lectura = apiladas(lista(valor.filas), casa, estructura, casilla);

    const informe = informeDe(estructura, lectura, que);

    // --- los motivos para negarse, del más cercano a la causa al más lejano

    if (lectura.combinada) {
      const c = lectura.combinada;
      return negar('celda-combinada', c.que === 'tapada'
        ? `${mayuscula(c.donde)} está debajo de una celda que ocupa varias filas, así que sus celdas no están en la columna `
          + 'en la que parecen estar y el rótulo de cada una no es el que tiene encima. Hay que descombinar esa celda antes '
          + 'de adoptar el modelo.'
        : `${mayuscula(c.donde)} ocupa ${plural(c.cuantas, c.que === 'filas' ? 'fila' : 'columna', c.que)}, y en una tabla que `
          + 'sigue un modelo cada casilla es de una parte y de una sola: con una celda combinada no se sabe de qué parte es su '
          + 'texto. Hay que descombinarla antes de adoptar el modelo.', informe);
    }
    if (informe.repetidos.length) {
      const r = informe.repetidos[0];
      return negar('rotulos-repetidos', `Los rótulos «${recorte(r.otro)}» (${r.otroDonde}) y «${recorte(r.texto)}» (${r.donde}) casan los dos con la `
        + `parte «${recorte(r.etiqueta || r.parte)}» del modelo: no se puede saber cuál es cuál, y al guardarse los dos bajo el `
        + 'mismo id el texto de uno taparía el del otro.', informe);
    }
    if (informe.sinParte.length) {
      const uno = informe.sinParte.length === 1;
      const sitio = uno ? 'esa fila o esa columna se quedaría' : 'esas filas o esas columnas se quedarían';
      return negar('rotulo-sin-parte', `${uno ? 'El rótulo' : 'Los rótulos'} ${comillas(informe.sinParte.map((x) => x.texto))} de esta tabla no `
        + `${uno ? 'es' : 'son'} ninguna de las ${plural(estructura.vigentes.length, 'parte', 'partes')} del modelo. Añade al `
        + `modelo la parte que falta, o cámbiale el nombre al rótulo: si se adoptara tal cual, ${sitio} sin sitio y `
        + `${plural(informe.enJuego, 'carácter', 'caracteres')} de los que hay escritos `
        + `${informe.enJuego === 1 ? 'desaparecería' : 'desaparecerían'} del documento.`, informe);
    }
    if (informe.sueltas.length) {
      const s = informe.sueltas[0];
      return negar('celda-sin-sitio', `${mayuscula(s.donde)} tiene texto («${s.texto}») y se quedaría sin sitio: no hay ningún rótulo que la empareje `
        + `con una parte del modelo. ${informe.sueltas.length === 1 ? 'Es la única celda así' : `Hay ${informe.sueltas.length} celdas así`}, `
        + `con ${plural(informe.enJuego, 'carácter', 'caracteres')} en juego.`, informe);
    }

    // --- el valor nuevo

    const casillas = {};
    for (const { parte, celdas } of lectura.contenido) casillas[parte.id] = porFilas ? celdas[0] : celdas;
    const nuevo = {};
    for (const clave of Object.keys(esObjeto(valor) ? valor : {})) {
      if (CLAVES_QUE_SE_VAN.indexOf(clave) < 0) nuevo[clave] = valor[clave];
    }
    nuevo[mt.CLAVE_CASILLAS] = casillas;

    // --- las dos redes de seguridad: la puerta, y que lo impreso siga diciendo lo mismo

    const puerta = Est().motivoDeCasillas(nuevo, 'la tabla', campo.tipo)
      || mt.motivoDeContenido(campo, nuevo, modelos, 'la tabla');
    if (puerta) {
      return negar('no-pasa-la-puerta', `Lo que saldría de adoptar el modelo no se podría guardar: ${puerta} Hay que arreglar eso antes de adoptarlo.`, informe);
    }
    // Se compara lo que se ha tomado de la tabla contra lo que la regla de impresión saca del valor
    // nuevo. Es la comprobación de que ni una casilla se queda guardada sin imprimirse, y mide lo
    // mismo que `informeDeFilas` mide para la ficha: el texto, no la forma.
    const antes = soloTextos(lectura.contenido.reduce((todas, x) => todas.concat(x.celdas.map(texto)), []));
    const despues = soloTextos(contenidoImpreso(campo, nuevo, modelos));
    if (!cuadran(antes, despues)) {
      const faltan = antes.filter((t) => despues.indexOf(t) < 0);
      const sobran = despues.filter((t) => antes.indexOf(t) < 0);
      const cual = faltan.length ? `: ${comillas(faltan.slice(0, 3))} no ${faltan.length === 1 ? 'saldría' : 'saldrían'} en el documento`
        : (sobran.length ? `: en el documento saldría ${comillas(sobran.slice(0, 3))}, que la tabla no tiene escrito` : '');
      return negar('cambia-lo-impreso', `Al adoptar el modelo, el texto que se imprime dejaría de ser el mismo${cual}. `
        + 'Adoptar no puede cambiar lo que sale impreso, así que no se ha tocado nada.', informe);
    }

    informe.aspecto = aspectoDe(campo, valor, nuevo, modelos, lectura);
    return { valor: nuevo, clave: null, motivo: null, informe: redactar(informe) };
  }

  const api = { adoptar, emparejador, contenidoImpreso, aspectoDe, MOTIVOS };

  global.Core = global.Core || {};
  global.Core.tablasAdopcion = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
