// Fichas de situación de aprendizaje: el modelo y su impresión. LA LÓGICA, en un solo sitio.
//
// Esta es la decisión §2.2 de docs/plan.md. Hasta ahora la misma lógica estaba
// escrita dos veces: en motor/ficha-sa.js (CommonJS, la que usa el PDF) y en
// docs/mockup-v2/js/sa.js (un puerto a mano para el navegador). Aquí vive una sola
// copia, y las dos la consumen.
//
// QUÉ HAY AQUÍ
//
//   La forma de la ficha, con campos con nombre:
//     { num, titulo, sesiones, evaluacion, raTexto, ra: [2], ce: [...],
//       competencias: [...], objetivos: [...], introduccion, no_evaluables,
//       evaluables, intermodular, refuerzo, ampliacion, recuperacion,
//       complementarias, recursos }
//
//   Las dos conversiones que hacen falta para que una SA se vea, cambie y cree
//   desde la aplicación:
//     fichaDeFilas(filas, cabecera, campos)  tabla importada -> modelo
//     filasDeFicha(ficha, campos)            modelo          -> tabla, la que imprime el PDF
//   La segunda es la que permite que una SA nueva, que nunca estuvo en un Word,
//   salga impresa igual que las importadas. Lo que se ve en la aplicación es lo
//   que sale en el PDF, porque los dos usan esta misma función.
//
//   Y el informe de lo que la primera ha entendido de la rejilla
//   (`filasSinCampo`, `informeDeFilas`): qué filas no han ido a parar a ningún
//   campo, que son las que se perderán cuando la ficha suelte su rejilla. Ver el
//   comentario de esa sección.
//
//   Las operaciones sobre una LISTA de fichas que son cálculo puro: renumerar,
//   añadir, reemplazar, borrar, duplicar, mover. Reciben la lista y devuelven una
//   lista nueva; no guardan nada.
//
//   El resumen SA × RA (`matriz`) y los RA que no tienen ninguna situación
//   (`raSinSituacion`). Reciben la lista de fichas y la lista de RA del módulo,
//   así que no necesitan saber de dónde sale ninguna de las dos.
//
// QUÉ SE QUEDA EN CADA LADO, Y POR QUÉ
//
//   docs/mockup-v2/js/sa.js se queda con:
//     - la persistencia (cargar, persistir, reiniciar, guardarLista, `cambiadas`):
//       es el localStorage del prototipo, no es lógica;
//     - la dependencia de global.Importado (listar, ficha, raDe, hayImportado):
//       son los datos de muestra del mockup;
//     - SEC_SA y SEC_RA_CE: rutas del árbol de la plantilla, que el mockup usa
//       para encontrar sus nodos;
//     - el texto de ayuda del formulario (`ayuda` del campo de criterios).
//   motor/ficha-sa.js ya no tiene lógica: reexporta lo de aquí con la misma API.
//
// DIFERENCIA DETECTADA ENTRE LAS DOS IMPLEMENTACIONES (no resuelta aquí)
//
//   Una ficha vacía tenía la evaluación distinta según quién la creara:
//     - motor, fichaVacia(num)            evaluacion = ''
//     - mockup, SA.vacia(num) / nueva     evaluacion = '1ª'
//   Como las dos conductas son observables y no hay criterio para elegir una, esta
//   función no decide: `fichaVacia(num, evaluacion)` recibe la evaluación por
//   parámetro y, si no se pasa, deja ''. El mockup pasa '1ª' para conservar lo que
//   ya hacía. Esto es una decisión pendiente, no un acuerdo.
//
// LA ESTRUCTURA ES UN PARÁMETRO
//
//   La lista de campos de la ficha (`CAMPOS_POR_OMISION`, la de siempre) es la estructura
//   que se usa cuando nadie dice otra. Todas las funciones que dependen de ella reciben la
//   estructura como ÚLTIMO argumento opcional, para que el departamento pueda tener la suya
//   (etiquetas cambiadas, campos añadidos, movidos o retirados) sin que esta lógica cambie.
//   Cada campo es `{ id, etiqueta, ancho, grupo?, solo_si_hay?, retirado? }`; uno `retirado`
//   ni se imprime ni se lee: para esta lógica es como si no estuviera en la lista.
//
// Esto es lógica pura: sin DOM, sin localStorage, sin red, sin node. Vale como
// <script> en el mockup, como `require` en el motor y en las pruebas, y como
// `import` desde Next. Cuelga de `global.Core.sa`, igual que core/permisos.js.

(function (global) {
  'use strict';

  // Los campos del cuerpo de la ficha, con la etiqueta exacta del documento. El
  // orden es el de la ficha impresa, así que vale también para pintar el
  // formulario. `grupo` marca las actividades, que se pintan juntas.
  //
  // `solo_si_hay` son las dos filas que NO están en todas las fichas: solo las
  // traen los módulos que las escriben. Ver `filasDeFicha`.
  const CAMPOS_POR_OMISION = [
    { id: 'ce', etiqueta: 'Criterios de evaluación', ancho: 4 },
    { id: 'competencias', etiqueta: 'Competencias profesionales para la empleabilidad', ancho: 4 },
    { id: 'objetivos', etiqueta: 'Objetivos de aprendizaje', ancho: 4 },
    { id: 'introduccion', etiqueta: 'Introducción', ancho: 2, grupo: 'actividades' },
    { id: 'no_evaluables', etiqueta: 'Formativas no evaluables', ancho: 1, grupo: 'actividades' },
    { id: 'evaluables', etiqueta: 'Formativas evaluables', ancho: 1, grupo: 'actividades' },
    { id: 'intermodular', etiqueta: 'Actividades de proyecto intermodular', ancho: 4, grupo: 'actividades', solo_si_hay: true },
    { id: 'refuerzo', etiqueta: 'Actividades de refuerzo', ancho: 2, grupo: 'actividades' },
    { id: 'ampliacion', etiqueta: 'Actividades de ampliación', ancho: 2, grupo: 'actividades' },
    { id: 'recuperacion', etiqueta: 'Actividades de recuperación', ancho: 4, grupo: 'actividades' },
    { id: 'complementarias', etiqueta: 'Actividades Complementarias', ancho: 4, grupo: 'actividades', solo_si_hay: true },
    { id: 'recursos', etiqueta: 'Materiales y recursos didácticos disponibles', ancho: 4 },
  ];

  // LAS REDACCIONES QUE TAMBIÉN SE ACEPTAN AL LEER, campo por campo. Salen de los
  // Word del departamento: los módulos de Digitalización Aplicada a los Sectores
  // Productivos y de Sostenibilidad escriben estas filas de otra manera, y una
  // etiqueta que no se reconoce no va a ningún campo, así que su texto desaparece
  // en cuanto la ficha se vuelve a montar desde el modelo.
  //
  // LO QUE SE IMPRIME SIGUE SIENDO `etiqueta`: es la que fija el formato del
  // documento, y un campo tiene varias etiquetas aceptadas pero una sola que
  // escribe. Aquí solo se amplía lo que se entiende al leer.
  //
  // LA LISTA ES EXPLÍCITA, no una comparación por parecido, y lo es a propósito:
  // un parecido acertaría casi siempre y fallaría sin decir nada justo cuando no,
  // que es el caso que importa. Lo que no esté escrito aquí lo NOMBRA el informe
  // de `informeDeFilas`, que es por donde se entera quien redacte el Word del año
  // que viene.
  const SINONIMOS = {
    // «Aprendizaje a lo largo de la vida» es la variante que anota
    // motor/sanear.js; «Aprendizajes de carácter transversal», la de los dos
    // módulos nuevos.
    competencias: [
      'Competencias personales y sociales. Aprendizajes de carácter transversal',
      'Competencias personales y sociales. Aprendizaje a lo largo de la vida',
    ],
    ampliacion: ['Actividades de profundización'],
    recursos: ['Materiales y recursos disponibles'],
  };

  const CABECERA_ACTIVIDADES = 'Tipificación de actividades formativas';
  const COLUMNAS = 4;
  const EVALUACIONES = ['1ª', '2ª', '3ª'];

  // Minúsculas y sin tildes, para comparar etiquetas con lo que trae el Word.
  function norm(s) {
    return String(s == null ? '' : s)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/\s+/g, ' ').trim();
  }

  // Los campos que cuentan de una estructura: los retirados no se imprimen ni se leen.
  const vigentes = (campos) => (campos || CAMPOS_POR_OMISION).filter((c) => !c.retirado);

  // El mapa etiqueta -> campo que usa el lector, de la estructura que toque. Se memoriza por
  // lista porque `fichaDeFilas` se llama en bucle sobre cientos de fichas con la misma
  // estructura, y rehacer el mapa en cada una sería trabajo tirado. Una estructura nueva
  // (otro array) es otra entrada: no hay nada que invalidar.
  const MAPAS = new WeakMap();
  function porEtiqueta(campos) {
    const lista = campos || CAMPOS_POR_OMISION;
    let mapa = MAPAS.get(lista);
    if (!mapa) {
      mapa = new Map();
      vigentes(lista).forEach((c) => {
        [c.etiqueta].concat(SINONIMOS[c.id] || []).forEach((e) => mapa.set(norm(e), c));
      });
      MAPAS.set(lista, mapa);
    }
    return mapa;
  }

  // ---------------------------------------------------------------- texto

  // Un valor de celda puede traer varias líneas; cada una es un elemento, con las
  // viñetas del Word quitadas. Se guarda como lista para poder editar por líneas.
  function aLineas(t) {
    return String(t == null ? '' : t)
      .split('\n')
      .map((l) => l.replace(/^\s*[−–—•*·-]\s*/, '').trim())
      .filter(Boolean);
  }

  // Acepta lista o texto y devuelve siempre la lista.
  function lineas(v) {
    return Array.isArray(v) ? v.slice() : aLineas(v);
  }

  // Acepta lista o texto y devuelve siempre el texto, una línea por elemento.
  function deLineas(v) {
    return lineas(v).join('\n');
  }

  // Los RA que trabaja la SA se leen del texto del resultado de aprendizaje. El
  // documento los escribe de tres maneras, y las tres aparecen en la PD de DAW:
  //
  //   "RA2. Crea bases de datos…"      "1. Reconoce las características…"
  //   "RA1 Reconoce los elementos…"    (sin punto: ocho fichas de un módulo)
  //
  // Con el prefijo "RA" basta el número; sin él se exige un signo detrás, o
  // cualquier cifra del texto se tomaría por un resultado de aprendizaje.
  function raDeTexto(t) {
    return [...String(t == null ? '' : t)
      .matchAll(/(?:^|\n)\s*(?:RA\s*(\d+)\b|(\d+)\s*[.):-])/gi)]
      .map((m) => Number(m[1] || m[2]));
  }

  // La línea de un criterio tal como la escribe el documento: "RA2.a. El texto."
  const lineaCe = (num, ce) => 'RA' + num + '.' + ce.letra + '. ' + ce.texto;

  const copia = (x) => JSON.parse(JSON.stringify(x));

  // ---------------------------------------------------------------- tabla -> modelo

  const textoDe = (fila, j) => (fila && fila[j] ? String(fila[j].text == null ? '' : fila[j].text) : '');

  // EL LECTOR DE UNA REJILLA, EN UNA SOLA PASADA: devuelve el modelo y, a la vez, qué filas
  // han aportado algo (`usadas`, por su índice). Las dos cosas salen del mismo recorrido a
  // propósito: el informe de lo que NO se reconoce tiene que medir exactamente lo que este
  // lector entiende, y con dos recorridos podría decir que no se pierde nada mientras se
  // pierde.
  //
  // La cabecera: "Situación de aprendizaje 3 | título | Sesiones | 12"
  // Las etiquetas pueden llevar el valor al lado (en la misma fila) o debajo (la
  // fila es toda de etiquetas en negrita y el valor va en la siguiente).
  function leerFilas(filas, campos) {
    const f = Array.isArray(filas) ? filas : [];
    const mapa = porEtiqueta(campos);
    const usadas = new Set();
    const out = {
      num: null, titulo: '', sesiones: null, evaluacion: '', raTexto: '', ra: [],
    };
    vigentes(campos).forEach((c) => { out[c.id] = []; });

    if (f.length) {
      const n = textoDe(f[0], 0).match(/(\d+)/);
      out.num = n ? Number(n[1]) : null;
      out.titulo = textoDe(f[0], 1).trim();
      usadas.add(0);
    }

    f.forEach((fila, i) => {
      if (!fila || !fila.length) return;

      // etiquetas con el valor al lado, en la misma fila
      for (let j = 0; j < fila.length - 1; j += 1) {
        const etq = norm(textoDe(fila, j));
        if (etq === 'sesiones') {
          const m = textoDe(fila, j + 1).match(/-?\d+(?:[.,]\d+)?/);
          out.sesiones = m ? Number(m[0].replace(',', '.')) : null;
        } else if (etq === 'evaluacion') {
          out.evaluacion = textoDe(fila, j + 1).trim();
        } else if (etq.startsWith('resultado')) {
          out.raTexto = textoDe(fila, j + 1).trim();
        } else {
          continue;
        }
        usadas.add(i);
      }

      // etiquetas con el valor debajo: la fila es toda de etiquetas conocidas
      const etiquetas = fila.map((c) => mapa.get(norm(c && c.text)));
      if (!etiquetas.length || etiquetas.some((c) => !c)) return;
      const siguiente = f[i + 1] || [];
      etiquetas.forEach((campo, j) => { out[campo.id] = aLineas(textoDe(siguiente, j)); });
      usadas.add(i);
      if (f[i + 1]) usadas.add(i + 1);
    });

    out.ra = raDeTexto(out.raTexto);
    return { ficha: out, usadas };
  }

  // El modelo de una rejilla importada. `cabecera`, si viene, manda sobre lo
  // deducido de la tabla.
  function fichaDeFilas(filas, cabecera, campos) {
    const out = leerFilas(filas, campos).ficha;
    if (cabecera) {
      ['num', 'titulo', 'sesiones', 'evaluacion'].forEach((k) => {
        if (cabecera[k] !== undefined && cabecera[k] !== null && cabecera[k] !== '') out[k] = cabecera[k];
      });
      if (Array.isArray(cabecera.ra) && cabecera.ra.length) out.ra = cabecera.ra.slice();
    }
    return out;
  }

  // ---------------------------------------------------------------- modelo -> tabla

  const celda = (text, opts) => Object.assign({
    text: String(text == null ? '' : text), colspan: 1, rowspan: 1, bold: false,
  }, opts);

  // La maquetación sale de la estructura, no de una lista de filas escrita a mano: los
  // campos, en su orden, se van colocando en filas de `COLUMNAS` columnas (cada uno ocupa su
  // `ancho`), y un grupo distinto siempre empieza fila nueva. Con la estructura por omisión
  // da la maquetación mayoritaria del documento: las actividades de introducción, no
  // evaluables y evaluables en una fila, refuerzo y ampliación en otra, y recuperación y
  // materiales a todo lo ancho. La cabecera de las actividades se escribe una vez, delante de
  // la primera fila del grupo `actividades` que llegue a imprimirse.
  function filasDeFicha(ficha, campos) {
    const s = ficha || {};
    const out = [];
    const ancho = (v) => (v > 1 ? v : 1);

    out.push([
      celda('Situación de aprendizaje ' + (s.num == null ? '' : s.num), { rowspan: 2, bold: true }),
      celda(s.titulo, { rowspan: 2, bold: true }),
      celda('Sesiones', { bold: true }),
      celda(s.sesiones == null ? '' : s.sesiones, { bold: true }),
    ]);
    out.push([celda('Evaluación', { bold: true }), celda(s.evaluacion, { bold: true })]);
    out.push([celda('Resultado(s) de aprendizaje', { bold: true }), celda(s.raTexto, { colspan: 3 })]);

    const bloque = (campos) => {
      // UN CAMPO `solo_si_hay` VACÍO NO IMPRIME SU FILA. Los demás sí, en blanco, porque su
      // fila está en TODAS las fichas del documento y ese hueco es parte del formato; estas
      // solo las escriben algunos módulos, así que una ficha que no las trae no puede ganar
      // filas vacías por el hecho de volver a montarse.
      if (campos.every((c) => c.solo_si_hay) && !campos.some((c) => deLineas(s[c.id]).trim())) return;
      // `campo` es el id al que pertenece la etiqueta: quien edite la tabla sabe así qué fila
      // es qué campo sin fiarse del texto de la etiqueta, que se puede renombrar.
      out.push(campos.map((c) => celda(c.etiqueta, { colspan: ancho(c.ancho), bold: true, campo: c.id })));
      out.push(campos.map((c) => celda(deLineas(s[c.id]), { colspan: ancho(c.ancho) })));
    };

    const filasDeCampos = [];
    let actual = [];
    let suma = 0;
    vigentes(campos).forEach((c) => {
      const w = ancho(c.ancho);
      if (actual.length && (suma + w > COLUMNAS || actual[0].grupo !== c.grupo)) {
        filasDeCampos.push(actual);
        actual = [];
        suma = 0;
      }
      actual.push(c);
      suma += w;
    });
    if (actual.length) filasDeCampos.push(actual);

    let grupoPuesto = false;
    filasDeCampos.forEach((fila) => {
      const imprime = !fila.every((c) => c.solo_si_hay) || fila.some((c) => deLineas(s[c.id]).trim());
      if (imprime && fila[0].grupo === 'actividades' && !grupoPuesto) {
        out.push([celda(CABECERA_ACTIVIDADES, { colspan: COLUMNAS, bold: true })]);
        grupoPuesto = true;
      }
      bloque(fila);
    });
    return out;
  }

  // ---------------------------------------------------------------- el informe de reconocimiento
  //
  // Mientras una ficha conserva su rejilla importada, lo que se imprime es la rejilla. En
  // cuanto la ficha cambia, la rejilla se suelta y lo que se imprime pasa a montarse del
  // modelo (`filasDeFicha`), así que LO QUE NO HAYA ENTRADO EN UN CAMPO desaparece.
  //
  // El lector reconoce las filas por el TEXTO de su etiqueta (`porEtiqueta`), que es lo único
  // que el Word trae. La lista de etiquetas aceptadas siempre irá por detrás de lo que alguien
  // escriba, y lo que no puede pasar es que la pérdida sea muda: de ahí este informe, que dice
  // CON NÚMEROS cuántas filas se entienden y NOMBRA la etiqueta de las que no.

  // LAS FILAS DE LA REJILLA QUE NO VAN A NINGÚN CAMPO: son exactamente las que se perderán. De
  // cada una, su número (desde 1, el que se ve en la tabla) y su texto celda a celda.
  //
  // Dos filas no cuentan como perdidas aunque el lector no las mire: la que está en blanco, que
  // no tiene nada que perder, y la cabecera de las actividades, que `filasDeFicha` vuelve a
  // imprimir igual. Sin esa segunda excepción toda ficha del documento parecería perder algo, y
  // un aviso que sale siempre no avisa de nada.
  function filasSinCampo(filas, campos) {
    const f = Array.isArray(filas) ? filas : [];
    const { usadas } = leerFilas(f, campos);
    const out = [];
    f.forEach((fila, i) => {
      if (usadas.has(i)) return;
      const celdas = (fila || []).map((c, j) => textoDe(fila, j).trim()).filter(Boolean);
      if (!celdas.length) return;
      if (norm(celdas.join(' ')) === norm(CABECERA_ACTIVIDADES)) return;
      out.push({ fila: i + 1, celdas, caracteres: celdas.join('\n').length });
    });
    return out;
  }

  // «la 13, la 14 y la 15»: la coma hasta el último, que va con «y».
  function enLista(partes) {
    if (!partes.length) return '';
    if (partes.length === 1) return partes[0];
    return partes.slice(0, -1).join(', ') + ' y ' + partes[partes.length - 1];
  }

  const cuenta = (n, uno, varios) => (n === 1 ? '1 ' + uno : n + ' ' + varios);

  // Cómo se nombra una fila perdida: por su número y por su primera línea, que es donde el
  // documento escribe la etiqueta. Se recorta porque una celda de contenido puede traer un
  // párrafo entero, y lo que hace falta leer es con qué fila de la tabla se corresponde.
  const RECORTE = 60;
  function nombraFila(x) {
    const l = x.celdas[0].split('\n')[0].trim();
    const corta = l.length > RECORTE ? l.slice(0, RECORTE - 1).trim() + '…' : l;
    return 'la fila ' + x.fila + ' («' + corta + '»)';
  }

  // EL INFORME ENTERO, para que la pantalla no tenga que componer ninguna frase: `frase` dice
  // lo que se entiende de la tabla y `aviso` lo que no, con el texto con el que se arregla la
  // redacción del Word. `aviso` es null cuando no se pierde nada, que es el caso normal.
  function informeDeFilas(filas, campos) {
    const f = Array.isArray(filas) ? filas : [];
    const sueltas = filasSinCampo(f, campos);
    const perdidas = sueltas.length;
    const total = f.length;

    const frase = perdidas
      ? 'Se reconocen ' + (total - perdidas) + ' de las ' + total + ' filas de la tabla que vino del Word.'
      : 'Se reconocen ' + cuenta(total, 'fila', 'filas') + ' de la tabla que vino del Word: todo su texto'
        + ' está en los campos de la ficha, así que cambiarla no pierde nada.';

    const aviso = perdidas
      ? cuenta(perdidas, 'fila de la tabla no va', 'filas de la tabla no van')
        + ' a ningún campo de la ficha y se ' + (perdidas === 1 ? 'perderá' : 'perderán')
        + ' en cuanto se cambie algo: ' + enLista(sueltas.map(nombraFila)) + '.'
      : null;

    return {
      filas: total,
      perdidas,
      caracteres: sueltas.reduce((a, x) => a + x.caracteres, 0),
      sueltas,
      frase,
      aviso,
    };
  }

  // ---------------------------------------------------------------- ficha nueva

  // Una ficha con los campos vacíos pero presentes: el formulario se pinta igual
  // con una SA importada y con una nueva. `evaluacion` solo se fija si se pasa;
  // ver la nota de DIFERENCIA en la cabecera.
  function fichaVacia(num, evaluacion, campos) {
    const f = fichaDeFilas([], undefined, campos);
    f.num = num == null ? null : Number(num);
    if (evaluacion !== undefined) f.evaluacion = evaluacion;
    return f;
  }

  // ¿Tiene cuerpo con nombre, o solo la tabla importada? Lo usa el renderer para
  // decidir si imprime `filas` tal cual o las reconstruye desde el modelo.
  const esSemantica = (v, campos) => !!v && (vigentes(campos).some((c) => Array.isArray(v[c.id]) && v[c.id].length)
    || typeof v.raTexto === 'string');

  // ---------------------------------------------------------------- lista de fichas
  // Todas devuelven una lista nueva y no tocan la que reciben. La numeración no
  // se corrige aquí: `renumerar` se llama al guardar.

  const renumerar = (lista) => lista.map((f, i) => Object.assign({}, f, { num: i + 1 }));

  // Añade una ficha vacía al final. Devuelve la lista y el número de la nueva.
  function anadirVacia(lista, evaluacion, campos) {
    const num = lista.length + 1;
    const f = fichaVacia(num, evaluacion, campos);
    f.titulo = 'Situación de aprendizaje ' + num;
    return { lista: lista.concat([f]), num };
  }

  // Sustituye la ficha con el mismo número, o la añade si no existe.
  function reemplazarEn(lista, f) {
    const out = lista.slice();
    const i = out.findIndex((x) => x.num === Number(f.num));
    if (i < 0) out.push(f); else out[i] = f;
    return out;
  }

  const borrarDe = (lista, num) => lista.filter((x) => x.num !== Number(num));

  // Copia la ficha justo detrás de la original. Devuelve null si no existe.
  function duplicarEn(lista, num) {
    const i = lista.findIndex((x) => x.num === Number(num));
    if (i < 0) return null;
    const copiada = copia(lista[i]);
    copiada.titulo = copiada.titulo + ' (copia)';
    const out = lista.slice();
    out.splice(i + 1, 0, copiada);
    return { lista: out, num: i + 2 };
  }

  // Intercambia la ficha con la de `delta` posiciones. Null si no cabe.
  function moverEn(lista, num, delta) {
    const i = lista.findIndex((x) => x.num === Number(num));
    const j = i + delta;
    if (i < 0 || j < 0 || j >= lista.length) return null;
    const out = lista.slice();
    out[i] = lista[j];
    out[j] = lista[i];
    return { lista: out, num: j + 1 };
  }

  // ---------------------------------------------------------------- RA y resumen

  // Qué RA quedan sin ninguna situación. `raModulo` es la lista de números de RA
  // del módulo; si viene vacía se usan los que mencionan las propias fichas.
  function raSinSituacion(lista, raModulo) {
    if (!lista.length) return [];
    const usados = new Set(lista.flatMap((f) => f.ra || []));
    const todos = raModulo && raModulo.length ? raModulo : [...usados].sort((a, b) => a - b);
    return todos.filter((n) => !usados.has(n));
  }

  // Resumen SA × RA. Calculado, nunca guardado: es la tabla que en el Word hay que
  // repasar a mano cada vez que se mueve una SA.
  function matriz(lista, raModulo) {
    const ra = (raModulo && raModulo.length ? raModulo : [...new Set(lista.flatMap((f) => f.ra || []))])
      .slice().sort((a, b) => a - b);
    return {
      ra,
      evaluaciones: [...new Set(lista.map((f) => f.evaluacion || ''))],
      filas: lista.map((f) => ({
        num: f.num,
        titulo: f.titulo,
        sesiones: f.sesiones,
        evaluacion: f.evaluacion || '',
        marca: ra.map((n) => (f.ra || []).indexOf(n) >= 0),
      })),
      sesiones: lista.reduce((s, f) => s + (Number(f.sesiones) || 0), 0),
      sinSituacion: raSinSituacion(lista, raModulo),
    };
  }

  // ---------------------------------------------------------------- exportado

  // LO QUE LA REJILLA TODAVÍA SEPA, ANTES DE QUE SE TIRE.
  //
  // El modelo de una ficha importada lo escribió el lector del día en que se
  // importó, y ese lector no reconocía todas las redacciones que usan los
  // documentos del departamento (ver `SINONIMOS`): hay fichas guardadas cuyo
  // texto de «materiales y recursos» o de «actividades de profundización» está
  // solo en `filas`, porque el campo que le correspondía se quedó vacío.
  //
  // Una ficha se imprime desde `filas` mientras las tenga y desde el modelo en
  // cuanto deja de tenerlas, así que ese texto desaparecería del PDF en el
  // primer cambio que alguien le hiciera a la ficha —y no al escribirlo, sino al
  // tocar cualquier otra cosa—, que es la peor forma de perder algo: nadie
  // relaciona lo que falta con lo que hizo.
  //
  // Se rellenan SOLO los campos vacíos: lo que alguien haya escrito manda sobre
  // lo que diga la tabla de la que vino, aunque lo escrito sea más corto. Y no
  // reescribe nada por su cuenta: solo actúa en el momento en que la rejilla se
  // va, que es el único en que hace falta.
  const vacioEnFicha = (x) => x === null || x === undefined || x === ''
    || (Array.isArray(x) && !x.length);

  function completarDesdeFilas(ficha, campos) {
    const out = { ...(ficha || {}) };
    if (!Array.isArray(out.filas) || !out.filas.length) return out;
    const deLaTabla = fichaDeFilas(out.filas, undefined, campos);
    for (const clave of Object.keys(deLaTabla)) {
      if (clave === 'filas') continue;
      if (vacioEnFicha(out[clave]) && !vacioEnFicha(deLaTabla[clave])) out[clave] = deLaTabla[clave];
    }
    return out;
  }

  const api = {
    CAMPOS: CAMPOS_POR_OMISION, CAMPOS_POR_OMISION, SINONIMOS, porEtiqueta, CABECERA_ACTIVIDADES, COLUMNAS, EVALUACIONES,
    norm, aLineas, lineas, deLineas, raDeTexto, lineaCe,
    fichaDeFilas, filasDeFicha, fichaVacia, esSemantica, completarDesdeFilas,
    filasSinCampo, informeDeFilas,
    renumerar, anadirVacia, reemplazarEn, borrarDe, duplicarEn, moverEn,
    raSinSituacion, matriz,
  };

  // Vale como <script> en el mockup, como `require` en el motor y en las pruebas,
  // y como `import` desde Next. Igual que core/permisos.js.
  global.Core = global.Core || {};
  global.Core.sa = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
