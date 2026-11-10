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
  const nuevaLectura = () => ({ rotulos: [], contenido: [], sueltas: [], sinRotulo: [], combinada: null, bandas: 0 });

  // La celda de una parte, tal como se guarda: la misma celda SIN las claves que una casilla no
  // admite (`CLAVES_CASILLA` de core/estructurados.js). `colspan` y `rowspan` se van porque una
  // casilla es de una parte y de una sola, y `campo` porque es de la ficha; el estilo —la negrita, el
  // fondo, la alineación, el tamaño— se queda, que adoptar no puede costarle a nadie lo que eligió.
  function casillaDeCelda(celda) {
    const out = { text: texto(celda) };
    if (!esObjeto(celda)) return out;
    for (const clave of Est().CLAVES_CASILLA) {
      if (clave !== 'text' && celda[clave] !== undefined) out[clave] = celda[clave];
    }
    return out;
  }

  // La primera celda combinada de la rejilla, o null. `colspan` se admite solo donde ES la forma —el
  // `ancho` de una parte que va a lo alto—, y `rowspan` en ningún sitio: una celda de dos filas
  // pertenecería a dos partes.
  function combinadaEn(filas, { colspan }) {
    for (let i = 0; i < filas.length; i += 1) {
      const celdas = fila(filas, i);
      for (let j = 0; j < celdas.length; j += 1) {
        const donde = `la celda ${j + 1} de la fila ${i + 1}`;
        if (span(celdas[j], 'rowspan') > 1) return { donde, cuantas: span(celdas[j], 'rowspan'), que: 'filas' };
        if (colspan && span(celdas[j], 'colspan') > 1) return { donde, cuantas: span(celdas[j], 'colspan'), que: 'columnas' };
      }
    }
    return null;
  }

  // CUÁNTAS CELDAS DE LAS FILAS DE ARRIBA SIGUEN TAPANDO CADA FILA. Una celda con `rowspan` aparece
  // UNA VEZ, en su primera fila, así que las de debajo traen una celda menos y la celda j de una de
  // ellas no está en la columna j. Donde el emparejamiento es por posición —el rótulo j con el
  // contenido j—, trabajar sobre una fila tapada le daría a una parte el texto de otra, que es
  // exactamente la media correspondencia que esto existe para no hacer.
  function tapadas(filas) {
    const cuenta = filas.map(() => 0);
    filas.forEach((f, i) => lista(f).forEach((celda) => {
      const alto = span(celda, 'rowspan');
      for (let k = i + 1; k < i + alto && k < filas.length; k += 1) cuenta[k] += 1;
    }));
    return cuenta;
  }

  // A LO ANCHO: la fila 1 son los rótulos y cada parte es una columna. La celda i de la columna j es
  // la casilla i de la parte del rótulo j, así que todas las columnas acaban con tantas casillas como
  // filas de contenido tiene la tabla, que es lo que la puerta exige (`motivoDeContenido`: «una fila
  // de la tabla es una casilla de cada columna»).
  function porColumnas(filas, casa) {
    const r = nuevaLectura();
    r.combinada = combinadaEn(filas, { colspan: true });
    if (r.combinada) return r;
    const cabecera = fila(filas, 0);
    const cuerpo = filas.slice(1).map(lista);
    cabecera.forEach((celda, j) => {
      const columna = cuerpo.map((f) => f[j]);
      const rotulo = texto(celda);
      const parte = casa(rotulo);
      if (parte) {
        r.rotulos.push({ texto: rotulo, donde: `la columna ${j + 1}`, parte });
        r.contenido.push({ parte, celdas: columna.map(casillaDeCelda) });
        return;
      }
      // Sin parte: el rótulo que no casa lo dice `rotulos`, y lo que se queda sin sitio es su columna.
      if (rotulo.trim()) r.rotulos.push({ texto: rotulo, donde: `la columna ${j + 1}`, parte: null });
      const conTexto = columna.filter((c) => limpio(c));
      if (!rotulo.trim() && !conTexto.length) r.sinRotulo.push({ donde: `la columna ${j + 1}` });
      columna.forEach((c, i) => {
        if (limpio(c)) r.sueltas.push({ donde: `la celda ${j + 1} de la fila ${i + 2}`, texto: limpio(c) });
      });
    });
    // Las celdas de más a la derecha de la cabecera: no hay rótulo que las nombre.
    cuerpo.forEach((f, i) => f.forEach((celda, j) => {
      if (j < cabecera.length || !limpio(celda)) return;
      r.sueltas.push({ donde: `la celda ${j + 1} de la fila ${i + 2}`, texto: limpio(celda) });
    }));
    return r;
  }

  // A LO ALTO EN DOS COLUMNAS: cada fila es «rótulo | contenido», que es como está escrita una tabla
  // de clave y valor que vino del Word. Es la rejilla de la que `parseClaveValor` del importador monta
  // los pares, con la diferencia de que al adoptar los rótulos pasan a ser los de la estructura.
  function porFilasDeDos(filas, casa) {
    const r = nuevaLectura();
    r.combinada = combinadaEn(filas, { colspan: true });
    if (r.combinada) return r;
    filas.forEach((f, i) => {
      const celdas = lista(f);
      const rotulo = texto(celdas[0]);
      const parte = casa(rotulo);
      if (parte) {
        r.rotulos.push({ texto: rotulo, donde: `la fila ${i + 1}`, parte });
        r.contenido.push({ parte, celdas: [casillaDeCelda(celdas[1])] });
      } else {
        if (rotulo.trim()) r.rotulos.push({ texto: rotulo, donde: `la fila ${i + 1}`, parte: null });
        else if (!limpio(celdas[1])) r.sinRotulo.push({ donde: `la fila ${i + 1}` });
        if (limpio(celdas[1])) r.sueltas.push({ donde: `la celda 2 de la fila ${i + 1}`, texto: limpio(celdas[1]) });
      }
      // Una tabla de clave y valor son dos columnas: de la tercera en adelante no hay dónde ponerlo,
      // porque la parte de un rótulo guarda UNA casilla.
      celdas.forEach((celda, j) => {
        if (j < 2 || !limpio(celda)) return;
        r.sueltas.push({ donde: `la celda ${j + 1} de la fila ${i + 1}`, texto: limpio(celda) });
      });
    });
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
        r.rotulos.push({ texto: etiqueta, donde: `el par ${i + 1}`, parte });
        r.contenido.push({ parte, celdas: [{ text: valor }] });
        return;
      }
      if (etiqueta.trim()) r.rotulos.push({ texto: etiqueta, donde: `el par ${i + 1}`, parte: null });
      else if (!valor.trim()) r.sinRotulo.push({ donde: `el par ${i + 1}` });
      if (valor.trim()) r.sueltas.push({ donde: `el par ${i + 1}`, texto: valor.trim() });
    });
    return r;
  }

  // A LO ALTO CON LA MAQUETACIÓN DE LA FICHA: una fila de rótulos y debajo la de sus contenidos, con
  // la banda del grupo encima. Es la inversa de `aLoAlto` de core/modelos-tabla.js y la misma lectura
  // que la del lector de la ficha (`leerFilas` de core/sa.js, «etiquetas con el valor debajo»): una
  // fila es de rótulos cuando TODAS sus celdas con texto casan con una parte.
  //
  // LA BANDA DE UN GRUPO SE DESCARTA porque la estructura la vuelve a imprimir igual, que es la misma
  // excepción que `filasSinCampo` hace con la cabecera de las actividades: sin ella, toda ficha del
  // documento parecería perder algo, y un aviso que sale siempre no avisa de nada. Se descarta SOLO
  // si su texto es el rótulo de un grupo de la estructura; cualquier otra fila que no sea de rótulos
  // ni de contenido es texto que se quedaría sin sitio.
  // EL `rowspan` SOLO ESTORBA EN LAS FILAS QUE SE LEEN. Aquí el `colspan` es la forma —el `ancho` de
  // cada parte—, y la cabecera de la ficha, que es la que trae el `rowspan` en los documentos del
  // departamento, no es ninguna parte: su texto se queda sin sitio y eso se dice como lo que es, en
  // lugar de esconderlo detrás de un «tiene celdas combinadas». Lo que no se puede leer es una fila
  // TAPADA por una celda de arriba, porque entonces sus celdas no están donde parecen.
  function apiladas(filas, casa, estructura) {
    const r = nuevaLectura();
    const tapa = tapadas(filas);
    const grupos = new Set(estructura.vigentes
      .map((p) => MT().grupoDe(p))
      .filter(Boolean)
      .map((g) => Sa().norm(g.etiqueta)));
    const esRotulos = (celdas) => {
      const conTexto = celdas.filter((c) => limpio(c));
      return conTexto.length > 0 && conTexto.every((c) => casa(texto(c)));
    };
    for (let i = 0; i < filas.length; i += 1) {
      const celdas = fila(filas, i);
      if (esRotulos(celdas)) {
        if (tapa[i] || tapa[i + 1]) {
          const cual = tapa[i] ? i : i + 1;
          r.combinada = { donde: `la fila ${cual + 1}`, cuantas: 2, que: 'tapada' };
          return r;
        }
        // La fila siguiente es la de los contenidos, y solo si NO es a su vez una fila de rótulos:
        // dos filas de rótulos seguidas son dos filas sin contenido, no una con el de la otra.
        const siguiente = fila(filas, i + 1);
        const contenido = esRotulos(siguiente) ? [] : siguiente;
        celdas.forEach((celda, j) => {
          const rotulo = texto(celda);
          const parte = rotulo.trim() ? casa(rotulo) : null;
          if (parte) {
            r.rotulos.push({ texto: rotulo, donde: `la celda ${j + 1} de la fila ${i + 1}`, parte });
            r.contenido.push({ parte, celdas: [casillaDeCelda(contenido[j])] });
          } else if (limpio(contenido[j])) {
            r.sueltas.push({ donde: `la celda ${j + 1} de la fila ${i + 2}`, texto: limpio(contenido[j]) });
          } else {
            r.sinRotulo.push({ donde: `la celda ${j + 1} de la fila ${i + 1}` });
          }
        });
        // Las celdas de la fila de contenido que no tienen ningún rótulo encima.
        contenido.forEach((celda, j) => {
          if (j < celdas.length || !limpio(celda)) return;
          r.sueltas.push({ donde: `la celda ${j + 1} de la fila ${i + 2}`, texto: limpio(celda) });
        });
        if (contenido.length) i += 1;
        continue;
      }
      const textos = celdas.filter((c) => limpio(c)).map((c) => limpio(c));
      if (!textos.length) continue;
      if (textos.length === 1 && grupos.has(Sa().norm(textos[0]))) { r.bandas += 1; continue; }
      textos.forEach((t, j) => r.sueltas.push({ donde: `la celda ${j + 1} de la fila ${i + 1}`, texto: t }));
    }
    return r;
  }

  // ---------------------------------------------------------------- lo que se imprimiría

  // EL TEXTO DE CONTENIDO QUE SE IMPRIME de una tabla que ya ha adoptado, preguntándoselo a la regla
  // de impresión y no deduciéndolo otra vez. Los rótulos se dejan fuera porque los pone la estructura
  // y pueden decir otra cosa que la tabla —es para lo que existe el modelo—; lo que no puede cambiar
  // es el CONTENIDO, y eso es lo que se compara.
  //
  // Una fila de rótulos es la que lleva `campo` en todas sus celdas, que es la marca que `aLoAlto` y
  // `tablaVigente` les ponen, y la de debajo es la de sus contenidos. La banda de un grupo no lleva
  // `campo` —es una celda sola a todo lo ancho— y tampoco es contenido, así que se reconoce por ser
  // el rótulo de un grupo de la estructura, igual que al leerla (`apiladas`).
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
    const mete = (celdas) => celdas.forEach((c) => out.push(texto(c)));
    for (let i = 0; i < filas.length; i += 1) {
      const celdas = fila(filas, i);
      const rotulos = celdas.length > 0 && celdas.every((c) => esObjeto(c) && typeof c.campo === 'string');
      if (rotulos) {
        if (Array.isArray(filas[i + 1])) { mete(fila(filas, i + 1)); i += 1; }
        continue;
      }
      if (celdas.length === 1 && grupos.has(Sa().norm(texto(celdas[0])))) continue;
      mete(celdas);
    }
    return out;
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
      frase: null,
      aviso: null,
    };
  }

  // La frase con la que la pantalla cuenta una adopción que sí se puede hacer, y el aviso de lo que
  // cambia aunque no se pierda nada. `aviso` es null cuando no cambia nada visible.
  function redactar(informe, anchos) {
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
    if (anchos) partes.push('La tabla deja de llevar sus anchos de columna: los pondrá el modelo.');
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
    let lectura;
    if (que === 'ninguno') lectura = nuevaLectura();
    else if (que === 'pares') lectura = dePares(valor.pares, casa);
    else if (!porFilas) lectura = porColumnas(lista(valor.filas), casa);
    else if (campo.tipo === mt.TIPO_CLAVE_VALOR) lectura = porFilasDeDos(lista(valor.filas), casa);
    else lectura = apiladas(lista(valor.filas), casa, estructura);

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

    const puerta = Est().motivoDeCasillas(nuevo, 'la tabla') || mt.motivoDeContenido(campo, nuevo, modelos, 'la tabla');
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

    return { valor: nuevo, clave: null, motivo: null, informe: redactar(informe, esObjeto(valor) && valor.anchos !== undefined) };
  }

  const api = { adoptar, emparejador, contenidoImpreso, MOTIVOS };

  global.Core = global.Core || {};
  global.Core.tablasAdopcion = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
