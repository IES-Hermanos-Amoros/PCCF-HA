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
//   tabla              { filas: [[celda, …], …] }          celda { text, colspan?, rowspan?, bold? }
//   tabla_clave_valor  { pares: [{ etiqueta, valor }] }
//
// Y solo las que se CREARON en la aplicación (`esEditable`): las que trajo el importador del Word
// se ven y no se editan, porque el criterio de aceptación del importador es que el PDF salga
// idéntico y una tabla importada que se reescribe celda a celda deja de ser la del Word. Las dos
// clases son el mismo tipo de campo; lo que las distingue es `campo.inicial`, la forma con la que
// nació la creada (core/campos.js).
//
// TODA OPERACIÓN DEVUELVE UN VALOR QUE PASA LA PUERTA
//
// `aplicar` no muta: devuelve un valor nuevo cuyas filas cuadran (todas del mismo ancho), dentro
// de los topes de core/estructurados.js, o el MISMO objeto que recibió si la operación no se
// puede hacer. Así el componente no tiene que comprobar nada antes de guardar y el servidor no
// tiene motivo para devolver un 400 a algo que salió de este fichero. `motivoDeNo` dice por qué
// una operación no se puede, para apagar el botón y explicarlo en lugar de dejarlo sin respuesta.
//
// LA CABECERA ES LA NEGRITA DE LA PRIMERA FILA
//
// No hay ningún otro dato: el PDF y el Word pintan de azul la primera fila si TODAS sus celdas van
// en negrita (`tablaGenerica` de motor/render-generico.js, `tabla` de motor/exportar-docx.js), y
// fuera de ella una celda en negrita se pinta en gris. Poner la cabecera es poner `bold: true` a
// la primera fila; quitarla es ponérselo a `false`. El texto no se toca. Quitar la fila de la
// cabecera con «quitar fila» también la quita: la fila que pasa a ser la primera no va en negrita.
//
// LAS CELDAS COMBINADAS NO SE CREAN AQUÍ, PERO NO SE PIERDEN
//
// El modelo admite `colspan` y `rowspan` y una tabla que ya los trae se puede escribir celda a
// celda. Cambiar su FORMA (filas, columnas) exigiría recolocar las combinaciones, que es otro
// trabajo: mientras las haya, esas operaciones se niegan con su motivo. El texto y la cabecera
// funcionan igual y conservan las combinaciones de cada celda tal cual.
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

  // ¿Este campo tiene editor? Una tabla o una tabla de clave y valor NACIDA en la aplicación y
  // que no es una lista de tablas. Las importadas siguen en solo lectura.
  function esEditable(campo) {
    const E = Estructurados();
    if (!campo || (campo.tipo !== E.TIPO_TABLA && campo.tipo !== E.TIPO_CLAVE_VALOR)) return false;
    return esObjeto(campo.inicial) && !campo.multiple;
  }

  const esClaveValor = (valor) => esObjeto(valor) && Array.isArray(valor.pares);
  const esRejilla = (valor) => esObjeto(valor) && Array.isArray(valor.filas) && !Array.isArray(valor.pares);

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

  function tieneCombinadas(valor) {
    if (!esRejilla(valor)) return false;
    return valor.filas.some((f) => f.some((c) => (c.colspan || 1) > 1 || (c.rowspan || 1) > 1));
  }

  // La primera fila entera en negrita. Una tabla sin filas no tiene cabecera.
  const tieneCabecera = (valor) => esRejilla(valor) && valor.filas.length > 0
    && valor.filas[0].every((c) => c.bold === true);

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
  // campo. Una clave y valor importada trae además `filas`: se quita, porque se guarda solo
  // `pares` (core/estructurados.js, `motivoDeClaveValor`).
  function valorDe(campo, guardado) {
    const C = Campos();
    const v = esObjeto(guardado) ? guardado : C.valorInicial(campo);
    return C.sinFilas(v);
  }

  // ---------------------------------------------------------------- lo que no se puede

  const MOTIVO_COMBINADAS = 'Esta tabla tiene celdas combinadas y de momento solo se puede cambiar su texto y su cabecera: no sus filas ni sus columnas.';

  // Por qué no se puede una operación, o null si se puede. `args` es el de la operación.
  function motivoDeNo(valor, op, args = {}) {
    const E = Estructurados();
    const claveValor = esClaveValor(valor);
    if (!claveValor && !esRejilla(valor)) return 'Esto no es una tabla.';
    const n = filasDe(valor);

    switch (op) {
      case 'texto': {
        const f = args.fila;
        if (!Number.isInteger(f) || f < 0 || f >= n) return 'No hay esa fila.';
        if (claveValor) return args.columna === 0 || args.columna === 1 ? null : 'No hay esa columna.';
        const fila = valor.filas[f];
        return Number.isInteger(args.columna) && args.columna >= 0 && args.columna < fila.length ? null : 'No hay esa celda.';
      }
      case 'anadir-fila': {
        if (tieneCombinadas(valor)) return MOTIVO_COMBINADAS;
        if (n >= (claveValor ? E.MAX_PARES : E.MAX_FILAS)) {
          return 'Una tabla no puede tener más de ' + (claveValor ? E.MAX_PARES : E.MAX_FILAS) + ' filas.';
        }
        const d = args.despuesDe;
        if (d !== undefined && d !== null && (!Number.isInteger(d) || d < 0 || d >= n)) return 'No hay esa fila.';
        return null;
      }
      case 'quitar-fila': {
        if (tieneCombinadas(valor)) return MOTIVO_COMBINADAS;
        return Number.isInteger(args.fila) && args.fila >= 0 && args.fila < n ? null : 'No hay esa fila.';
      }
      case 'anadir-columna': {
        if (claveValor) return 'Una tabla de clave y valor tiene siempre dos columnas.';
        if (tieneCombinadas(valor)) return MOTIVO_COMBINADAS;
        if (!n) return 'La tabla no tiene filas: añade una fila antes de añadir columnas.';
        if (columnasDe(valor) >= E.MAX_COLUMNAS) {
          return 'Una tabla no puede tener más de ' + E.MAX_COLUMNAS + ' columnas: no caben en el ancho de la hoja.';
        }
        const d = args.despuesDe;
        if (d !== undefined && d !== null && (!Number.isInteger(d) || d < 0 || d >= columnasDe(valor))) return 'No hay esa columna.';
        return null;
      }
      case 'quitar-columna': {
        if (claveValor) return 'Una tabla de clave y valor tiene siempre dos columnas.';
        if (tieneCombinadas(valor)) return MOTIVO_COMBINADAS;
        if (!n) return 'La tabla no tiene filas.';
        if (columnasDe(valor) <= 1) return 'Una tabla tiene al menos una columna: para vaciarla, quita sus filas.';
        return Number.isInteger(args.columna) && args.columna >= 0 && args.columna < columnasDe(valor) ? null : 'No hay esa columna.';
      }
      case 'cabecera':
        if (claveValor) return 'Una tabla de clave y valor no tiene fila de cabecera.';
        if (!n) return 'La tabla no tiene filas: añade una antes de ponerle cabecera.';
        return null;
      default:
        return 'Operación desconocida: ' + op + '.';
    }
  }

  const puede = (valor, op, args) => motivoDeNo(valor, op, args) === null;

  // ---------------------------------------------------------------- las operaciones

  const insertar = (lista, i, x) => lista.slice(0, i).concat([x], lista.slice(i));

  // Aplica una operación. Operaciones y sus argumentos:
  //
  //   texto            { fila, columna, valor }     el texto de una celda (o de la clave / el valor de un par)
  //   anadir-fila      { despuesDe? }               sin `despuesDe`, al final
  //   quitar-fila      { fila }
  //   anadir-columna   { despuesDe? }               sin `despuesDe`, al final
  //   quitar-columna   { columna }
  //   cabecera         { puesta }                   true: primera fila en negrita; false: sin negrita
  //
  // `contexto.columnas` es el ancho con el que abrir una fila en una tabla que se ha quedado sin
  // ninguna. Devuelve el mismo objeto si la operación no se puede hacer o no cambia nada.
  function aplicar(valor, op, args = {}, contexto = {}) {
    if (motivoDeNo(valor, op, args) !== null) return valor;
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

    if (op === 'anadir-fila') {
      const ancho = columnasDe(valor) || Math.min(Math.max(parseInt(contexto.columnas, 10) || 1, 1), E.MAX_COLUMNAS);
      const fila = [];
      for (let j = 0; j < ancho; j += 1) fila.push(celdaNueva('', false));
      const i = args.despuesDe == null ? filas.length : args.despuesDe + 1;
      return { ...valor, filas: insertar(filas, i, fila) };
    }

    if (op === 'quitar-fila') return { ...valor, filas: filas.filter((_, i) => i !== args.fila) };

    if (op === 'anadir-columna') {
      const j = args.despuesDe == null ? columnasDe(valor) : args.despuesDe + 1;
      const titulo = 'Columna ' + (columnasDe(valor) + 1);
      const cabecera = tieneCabecera(valor);
      return {
        ...valor,
        filas: filas.map((f, i) => insertar(f, j, i === 0 && cabecera ? celdaNueva(titulo, true) : celdaNueva('', false))),
      };
    }

    if (op === 'quitar-columna') {
      return { ...valor, filas: filas.map((f) => f.filter((_, j) => j !== args.columna)) };
    }

    if (op === 'cabecera') {
      const puesta = !!args.puesta;
      if (puesta ? tieneCabecera(valor) : filas[0].every((c) => c.bold !== true)) return valor;
      return {
        ...valor,
        filas: filas.map((f, i) => (i !== 0 ? f : f.map((c) => ({ ...c, bold: puesta })))),
      };
    }
    return valor;
  }

  // ---------------------------------------------------------------- para pintar

  // Cualquier valor de los dos tipos como una lista de filas de celdas { text, bold, colspan,
  // rowspan }, y si la primera es cabecera. Sirve a la vista previa de la creación y a la del
  // editor: así las dos pintan el mismo valor de la misma manera.
  function paraPintar(valor) {
    if (esClaveValor(valor)) {
      return {
        cabecera: false,
        filas: valor.pares.map((p) => [{ text: p.etiqueta, bold: true }, { text: p.valor }]),
      };
    }
    if (esRejilla(valor)) return { cabecera: tieneCabecera(valor), filas: valor.filas };
    return { cabecera: false, filas: [] };
  }

  const api = {
    esEditable, esClaveValor, esRejilla,
    columnasDe, filasDe, tieneCombinadas, tieneCabecera, celdaNueva, descripcion, valorDe,
    motivoDeNo, puede, aplicar, paraPintar,
  };

  global.Core = global.Core || {};
  global.Core.tablasEdicion = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
