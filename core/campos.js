// LOS CAMPOS QUE SE PUEDEN CREAR EN LA APLICACIÓN, Y CÓMO NACE CADA UNO.
//
// Hasta aquí un campo solo existía porque el importador lo había deducido de un Word: la
// aplicación sabía guardar lo que había dentro de un campo (core/estructurados.js) pero no
// crear ninguno. Este fichero es el catálogo de los que sí se pueden crear —texto, tabla y
// tabla de clave y valor—, con tres cosas por cada uno:
//
//   · el nombre en castellano para enseñarlo en un desplegable,
//   · los parámetros con los que se pide (filas, columnas, cabecera…), con sus límites,
//   · y la forma del valor que se guarda, para que quien escriba el editor no tenga que
//     deducirla de la ruta ni del generador.
//
// POR QUÉ VIVE EN core/ Y NO EN LA RUTA
//
// Por lo mismo que core/estructurados.js: lo leen el editor del navegador, para saber qué
// ofrecer y con qué límites, y core/plantilla.js, para crear el campo. Si lo decidiera la
// ruta, el editor y el servidor tendrían ideas distintas de qué es una tabla válida y la
// divergencia se descubriría con un 400 delante de alguien que está escribiendo. Los
// límites son los de la puerta (`MAX_FILAS`…): se leen de allí y no se repiten.
//
// EL ID DE UN CAMPO, COMO EL DE UN APARTADO
//
// El contenido se guarda por campo (`valores[idDeCampo]` dentro de la fila del apartado), así
// que el id se genera UNA VEZ, al crear el campo, y no vuelve a cambiar. Un id que cambiara
// dejaría huérfano lo escrito, que es lo mismo que le pasaría a un apartado si su id fuera
// el slug de su título (core/plantilla.js). `etiqueta` es solo lo que se enseña.
//
// QUÉ GUARDA LA PLANTILLA DE UNA TABLA CREADA
//
//   tabla              { id, tipo, etiqueta, columnas: ['Columna 1', …] | null,
//                        inicial: { filas, columnas, cabecera } }
//   tabla_clave_valor  { id, tipo, etiqueta, inicial: { pares } }
//
// `columnas` es lo que deja el importador (`motor/importar-docx.js`) y lo que lee el
// generador en una tabla importada (`campo.columnas ? true : undefined`): si hay títulos, la
// primera fila es la cabecera. `inicial` es de la aplicación: la forma con la que se abre el
// campo mientras no tenga valor (`valorInicial`), y la señal de que el campo se creó aquí. En un
// campo con `inicial` el generador no mira `columnas`: la cabecera es la primera fila entera en
// negrita, como en el Word, y el editor la pone y la quita con esa negrita. Quien necesite
// distinguir una tabla creada de una importada (el editor de tablas) mira `inicial`.
//
// Lógica pura: sin DOM, sin node, sin red, sin localStorage. Vale como <script> en el
// mockup, como `require` en las pruebas y en las rutas, y como `import` desde Next. Cuelga
// de `global.Core.campos`, igual que los demás módulos de core/.

(function (global) {
  'use strict';

  // Las dependencias se resuelven al usarlas y con la ruta LITERAL en cada rama: un
  // `require(variable)` corta el `npm run build` con «Can't resolve <dynamic>».
  function deCore(nombre) {
    if (global.Core && global.Core[nombre]) return global.Core[nombre];
    if (typeof require === 'function') {
      if (nombre === 'estructurados') return require('./estructurados.js');
    }
    throw new Error('core/campos.js necesita core/' + nombre + '.js');
  }
  const Estructurados = () => deCore('estructurados');

  const LARGO_ETIQUETA = 100;

  // ---------------------------------------------------------------- el catálogo

  // Los parámetros se describen con lo que un formulario necesita para pintarse: id, nombre,
  // tipo de control (`entero` o `booleano`), límites y valor por defecto. Se construyen al
  // pedirlos porque los límites son los de la puerta, que se carga a su vez al usarse.
  function definiciones() {
    const E = Estructurados();
    const etiqueta = { id: 'etiqueta', nombre: 'Nombre del campo', tipo: 'texto', maximo: LARGO_ETIQUETA, obligatorio: false };
    return [
      {
        tipo: E.TIPO_TEXTO_LARGO,
        nombre: 'Texto',
        descripcion: 'Párrafos y listas de texto.',
        parametros: [{ ...etiqueta, defecto: 'Texto' }],
        valor: {
          forma: 'lista de bloques de texto, como los de cualquier otro apartado de texto',
          vacio: [],
        },
      },
      {
        tipo: E.TIPO_TABLA,
        nombre: 'Tabla',
        descripcion: 'Una rejilla de filas y columnas, con o sin fila de cabecera.',
        parametros: [
          { ...etiqueta, defecto: 'Tabla' },
          { id: 'filas', nombre: 'Filas (con la de cabecera, si la hay)', tipo: 'entero', minimo: 1, maximo: 50, defecto: 3 },
          { id: 'columnas', nombre: 'Columnas', tipo: 'entero', minimo: 1, maximo: E.MAX_COLUMNAS, defecto: 3 },
          { id: 'cabecera', nombre: 'Primera fila de cabecera', tipo: 'booleano', defecto: true },
        ],
        valor: {
          forma: '{ filas: [[celda, …], …], anchos?: [peso, …] }',
          celda: '{ text: string, colspan?: entero ≥ 1, rowspan?: entero ≥ 1, bold?: booleano, fondo?: «cabecera» | «etiqueta» | «ninguno», alineacion?: «izquierda» | «centro» | «derecha», tamano?: «pequena» | «normal» | «grande» }, y ninguna clave más',
          reglas: [
            'Todas las filas tienen el mismo ancho, contando las casillas que vienen combinadas desde arriba.',
            'La fila de cabecera es la primera, con todas sus celdas en negrita (bold: true). La negrita no depende del fondo, ni el fondo de la negrita.',
            'El fondo de una celda se elige por nombre con «fondo»: «cabecera» es azul claro, «etiqueta» es gris y «ninguno» es sin fondo. Vale en cualquier celda, esté o no en negrita y esté en la fila que esté.',
            'Si la celda no lleva «fondo», el fondo lo decide la negrita: una celda en negrita de la primera fila, si toda la fila va en negrita, sale azul claro; una celda en negrita en cualquier otro sitio, gris; una celda sin negrita, sin fondo. Es lo que tienen las tablas importadas de un Word.',
            'La alineación y el tamaño de letra son de la celda y se eligen por nombre. Sin la clave —o con «izquierda» y «normal», que es lo mismo— la celda sale alineada a la izquierda y con la letra del documento, como las importadas de un Word.',
            'Una tabla sin filas ({ filas: [] }) se guarda, y se imprime como «(tabla vacía)».',
            'Los anchos de columna se calculan por la cantidad de texto de cada una mientras la tabla no lleve «anchos». Con «anchos» mandan esas proporciones: una por columna, números positivos, y lo que cuenta es la proporción entre ellos y no su valor.',
          ],
          vacio: { filas: [] },
          maximos: { filas: E.MAX_FILAS, columnas: E.MAX_COLUMNAS },
        },
      },
      {
        tipo: E.TIPO_CLAVE_VALOR,
        nombre: 'Clave y valor',
        descripcion: 'Dos columnas: a la izquierda el concepto, en negrita sobre fondo gris; a la derecha su contenido.',
        parametros: [
          { ...etiqueta, defecto: 'Clave y valor' },
          { id: 'pares', nombre: 'Filas', tipo: 'entero', minimo: 1, maximo: E.MAX_PARES, defecto: 3 },
        ],
        valor: {
          forma: '{ pares: [{ etiqueta: string, valor: string }] }',
          reglas: [
            'Se escribe solo «pares». Una tabla importada de Word trae además «filas»: al editarla se manda sin ellas (sinFilas).',
            'Una tabla sin filas ({ pares: [] }) se guarda, y se imprime como «(tabla vacía)».',
          ],
          vacio: { pares: [] },
          maximos: { pares: E.MAX_PARES },
        },
      },
    ];
  }

  // Lo que ve la pantalla: el catálogo entero, sin funciones, para devolverlo tal cual por
  // la API.
  const catalogo = () => definiciones();

  const definicionDe = (tipo) => definiciones().find((d) => d.tipo === tipo) || null;
  const nombresDeTipos = () => definiciones().map((d) => d.nombre);
  const esCreable = (tipo) => !!definicionDe(tipo);

  // ---------------------------------------------------------------- el id de un campo

  // El mismo criterio que `slug` de core/plantilla.js (que es el del importador), para que
  // un campo creado a mano tenga un id de la misma forma que los que dedujo el importador.
  // Está escrito otra vez y no importado porque core/plantilla.js necesita ESTE fichero, y
  // un ciclo entre los dos cargaría uno a medias en el navegador.
  const sinAcentos = (t) => String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '');
  const slug = (t) => sinAcentos(t).toLowerCase().replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ')
    .trim().replace(/ /g, '-').slice(0, 50);

  // El id nace de la etiqueta con la que se crea el campo y se queda ahí. `ocupados` son los
  // ids que ya tiene el apartado —TAMBIÉN los de los campos retirados, que van a volver— más
  // los que el contenido reserva (`items`, el repetidor). Nunca se reutiliza uno.
  function idDeCampo(etiqueta, tipo, ocupados) {
    const base = slug(etiqueta) || slug(tipo.replace(/_/g, ' ')) || 'campo';
    let id = base;
    for (let n = 2; ocupados.indexOf(id) >= 0; n += 1) id = base + '-' + n;
    return id;
  }

  // ---------------------------------------------------------------- crear un campo

  const esEntero = (x) => Number.isInteger(x);

  // Lee los parámetros de la petición contra la definición del tipo, con los valores por
  // defecto. Devuelve { valores } o { motivo }; el motivo se enseña tal cual.
  function leerParametros(def, peticion) {
    const permitidas = ['tipo'].concat(def.parametros.map((p) => p.id));
    const extra = Object.keys(peticion).filter((k) => permitidas.indexOf(k) < 0);
    if (extra.length) {
      return { motivo: 'Un campo «' + def.nombre + '» no lleva ' + extra.map((k) => '«' + k + '»').join(', ')
        + '. Los datos que admite son: ' + def.parametros.map((p) => '«' + p.id + '»').join(', ') + '.' };
    }
    const valores = {};
    for (const p of def.parametros) {
      let v = peticion[p.id];
      if (v === undefined || v === null || v === '') v = p.defecto;
      if (p.tipo === 'entero') {
        if (!esEntero(v) || v < p.minimo || v > p.maximo) {
          return { motivo: '«' + p.nombre + '» tiene que ser un número entero de ' + p.minimo + ' a ' + p.maximo + '.' };
        }
      } else if (p.tipo === 'booleano') {
        if (typeof v !== 'boolean') return { motivo: '«' + p.nombre + '» tiene que ser verdadero o falso.' };
      } else if (typeof v !== 'string') {
        return { motivo: '«' + p.nombre + '» tiene que ser un texto.' };
      } else {
        v = v.replace(/\s+/g, ' ').trim() || p.defecto;
        if (v.length > p.maximo) return { motivo: '«' + p.nombre + '» no puede pasar de ' + p.maximo + ' caracteres.' };
      }
      valores[p.id] = v;
    }
    return { valores };
  }

  // La plantilla de UN campo nuevo a partir de lo que pide el cliente: `{ tipo, etiqueta?,
  // filas?, columnas?, cabecera?, pares? }`. Devuelve { campo } o { motivo }. `ocupados` son
  // los ids que el apartado ya tiene.
  function crearCampo(peticion, ocupados) {
    if (!peticion || typeof peticion !== 'object' || Array.isArray(peticion)) {
      return { motivo: 'Un campo nuevo se pide como { tipo, … }: ' + nombresDeTipos().join(', ') + '.' };
    }
    const def = definicionDe(peticion.tipo);
    if (!def) {
      return { motivo: '«' + peticion.tipo + '» no es un tipo de campo que se pueda crear. Se pueden crear: '
        + definiciones().map((d) => '«' + d.tipo + '» (' + d.nombre + ')').join(', ') + '.' };
    }
    const leidos = leerParametros(def, peticion);
    if (leidos.motivo) return leidos;
    const v = leidos.valores;
    const E = Estructurados();
    const id = idDeCampo(v.etiqueta, def.tipo, ocupados || []);

    if (def.tipo === E.TIPO_TABLA) {
      const titulos = [];
      for (let j = 0; j < v.columnas; j += 1) titulos.push('Columna ' + (j + 1));
      return {
        campo: {
          id, tipo: def.tipo, etiqueta: v.etiqueta,
          columnas: v.cabecera ? titulos : null,
          inicial: { filas: v.filas, columnas: v.columnas, cabecera: v.cabecera },
        },
      };
    }
    if (def.tipo === E.TIPO_CLAVE_VALOR) {
      return { campo: { id, tipo: def.tipo, etiqueta: v.etiqueta, inicial: { pares: v.pares } } };
    }
    return { campo: { id, tipo: def.tipo, etiqueta: v.etiqueta } };
  }

  // ---------------------------------------------------------------- el valor con el que se abre

  const celda = (text, bold) => ({ text, colspan: 1, rowspan: 1, bold });

  // El valor con el que se abre un campo que todavía no tiene ninguno, con las celdas en la
  // forma EXACTA que deja el importador (`text`, `colspan`, `rowspan`, `bold`), para que una
  // tabla creada aquí y una importada sean el mismo objeto y no haya dos clases de tabla.
  // Pasa la puerta tal cual. Un campo sin forma de partida (uno importado) se abre vacío.
  function valorInicial(campo) {
    const E = Estructurados();
    if (!campo) return null;
    const ini = campo.inicial || {};
    // La tabla de RA y CE se abre como cualquier rejilla: lo que se edita son sus filas, y los
    // resultados de aprendizaje se leen de ellas (core/ra-ce.js). Una sin valor abre vacía, como
    // las demás importadas.
    if (campo.tipo === E.TIPO_TABLA || campo.tipo === E.TIPO_TABLA_RA_CE || E.TIPOS_REJILLA.indexOf(campo.tipo) >= 0) {
      const filas = [];
      for (let i = 0; i < (ini.filas || 0); i += 1) {
        const fila = [];
        for (let j = 0; j < (ini.columnas || 0); j += 1) {
          const cabecera = ini.cabecera && i === 0;
          fila.push(celda(cabecera ? 'Columna ' + (j + 1) : '', !!cabecera));
        }
        filas.push(fila);
      }
      return { filas };
    }
    if (campo.tipo === E.TIPO_CLAVE_VALOR) {
      const pares = [];
      for (let i = 0; i < (ini.pares || 0); i += 1) pares.push({ etiqueta: '', valor: '' });
      return { pares };
    }
    if (campo.tipo === E.TIPO_TEXTO_LARGO) return [];
    return null;
  }

  // El valor de una tabla de clave y valor listo para editarlo: sin la tabla importada que
  // el importador deja al lado de los pares. Ver `motivoDeClaveValor`.
  function sinFilas(valor) {
    if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return valor;
    if (!Array.isArray(valor.pares) || !valor.pares.length) return valor;
    const copia = { ...valor };
    delete copia.filas;
    return copia;
  }

  // ---------------------------------------------------------------- exportado

  const api = {
    LARGO_ETIQUETA,
    catalogo, definicionDe, nombresDeTipos, esCreable,
    idDeCampo, crearCampo, valorInicial, sinFilas,
  };

  global.Core = global.Core || {};
  global.Core.campos = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
