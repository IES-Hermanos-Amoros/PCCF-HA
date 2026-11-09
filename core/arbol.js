// El árbol de apartados de un documento: lo que pinta la barra lateral.
//
// Es el nodo que faltaba entre la plantilla importada y la interfaz. El mockup monta sus árboles a
// partir de estructuras escritas a mano (docs/mockup-v2/js/estructura.js: SUB_MODULO, PCCF, ESO…),
// porque allí no hay importador. En la aplicación el árbol NO se escribe en ningún sitio: sale de
// `plantilla.secciones` —lo que el importador dedujo del Word— y de las unidades del documento.
// Escribirlo otra vez a mano sería la cuarta duplicación de la lista que el E0 vino a quitar.
//
//   construirArbol({ plantilla, unidades, apartados })  ->  nodo raíz
//
// QUÉ NO LLEVA EL ÁRBOL: EL CONTENIDO
//
// El árbol de una PD ronda los 250 apartados y `datos.json` pesa 2 MB. Si cada nodo viajara con sus
// `valores`, abrir la barra lateral sería descargar el documento entero, que es justo lo que prohíbe
// la segunda regla de docs/api.md. Así que de los apartados solo se mira una cosa —si hay algo
// escrito— y lo que sale al cliente es ese booleano, nunca los valores. El contenido se pide aparte,
// apartado por apartado.
//
// EL ORDEN DE LAS UNIDADES NO SE TOCA
//
// `unidades` tiene que llegar tal como lo devuelve `repo.unidades.listar()`. Ese es el orden de
// creación, que el repositorio conserva a propósito porque es el orden del documento y el del tomo
// del PDF (docs/plan.md §2.3 y el comentario de `aMotor` en core/documento.js). Aquí no se reordena
// por nada: ni por título ni por `num`, que es nulo en seis de los once módulos del documento real.
// Un árbol con los módulos en otro orden que el PDF es un fallo que no salta a la vista.
//
// LA NUMERACIÓN ES LA DEL PDF
//
// `num` se calcula por posición, exactamente como lo hace motor/render-generico.js: la sección i-ésima
// de primer nivel es `i+1`, sus hijas `i+1.k+1`, y un módulo es `i+1.j+1` por su posición en el
// documento. Así el «3.2.4» de la barra lateral es el mismo «3.2.4» del PDF impreso, que es como la
// gente se refiere a los apartados en una reunión de departamento. Las secciones repetidoras (los
// ítems de una situación de aprendizaje) salen con `num: null` porque el PDF tampoco las numera.
//
// Lógica pura: sin DOM, sin node, sin red. Vale como <script> en el navegador, como `require` en las
// pruebas y como `import` desde Next. Igual que core/permisos.js, cuelga de `global.Core`.

(function (global) {
  'use strict';

  // ---------------------------------------------------------------- ¿hay algo escrito aquí?

  // `valores` es `{ campoId: valor }` y el valor depende del tipo de campo: una lista de bloques de
  // texto, `{ ra: [...] }`, `{ pares: [...] }`, `{ items: [...] }`, `{ filas: [...] }`… No hay una
  // forma común que mirar, así que se baja recursivamente hasta encontrar algo que no esté vacío.
  //
  // Mirar solo `Object.keys(valores).length` no sirve: un repetidor sin ítems es `{ items: [] }` y
  // una tabla sin importar es `{ filas: [] }`, que tienen clave y no tienen nada dentro. Es el
  // apartado que la interfaz tiene que pintar como vacío para que se vea qué queda por escribir.
  // QUÉ CUENTA COMO ESCRITO: lo que alguien ha ESCRITO, no cómo se ve.
  //
  // El FORMATO no es contenido. Una celda en negrita, sombreada o combinada sigue estando vacía:
  // el formato lo pone quien monta la tabla, no quien la rellena. Contarlo hace que la barra
  // lateral pinte como relleno un apartado donde no hay nada, y que el aviso de «vas a perder lo
  // escrito» al borrar para siempre mienta en el caso más común de todos: una tabla con la
  // cabecera puesta y ni una palabra dentro. Lo mismo con el `type` de un bloque: 'p' dice qué
  // clase de bloque es, no lo que pone en él.
  //
  // La lista son las claves de FORMATO de una celda —las de `CLAVES_CELDA` de
  // core/estructurados.js menos `text`, que es la única que lleva texto— más el discriminante de
  // un bloque. No se deriva de allí en caliente porque este fichero no depende de ningún otro y
  // así sigue valiendo como <script> suelto; de que no se quede corta cuando el contrato de la
  // celda crezca responde una prueba de test/api.js, que compara las dos listas y dice qué clave
  // falta.
  const NUNCA_ESCRITO = new Set(['type', 'colspan', 'rowspan', 'bold', 'fondo']);

  function algoEscrito(valor) {
    if (valor === null || valor === undefined) return false;
    if (typeof valor === 'string') return valor.trim() !== '';
    if (typeof valor === 'number' || typeof valor === 'boolean') return true;
    if (Array.isArray(valor)) return valor.some(algoEscrito);
    if (typeof valor === 'object') {
      return Object.keys(valor).some((k) => !NUNCA_ESCRITO.has(k) && algoEscrito(valor[k]));
    }
    return true;
  }

  // Un apartado común tiene unidadId null, nunca ausente, igual que en el repositorio. El \u0000 es
  // para que no se puedan confundir dos claves distintas: ningún id lleva un carácter nulo.
  const clavePlana = (unidadId, seccion) => `${unidadId === undefined || unidadId === null ? '' : unidadId}\u0000${seccion}`;

  // La clave que identifica un nodo en el DOM y en la URL. La sección sola no vale: la misma sección
  // la pintan los once módulos. Es el mismo formato que usa el mockup (`unidadId::seccion`).
  const clave = (unidadId, seccion) => (unidadId ? `${unidadId}::${seccion || ''}` : (seccion || ''));

  // ---------------------------------------------------------------- el árbol

  const nodo = (base) => Object.assign({
    clave: '',
    tipo: 'apartado',      // raiz | bloque | unidad | apartado
    titulo: '',
    num: null,
    seccion: null,
    unidadId: null,
    contenido: false,      // tiene campos propios: se edita. Si no, solo agrupa y se resume
    edita: null,           // 'jefe_departamento' | 'docentes_del_modulo' | null, heredado del padre
    relleno: null,         // true | false en los nodos con contenido; null en los que solo agrupan
    repetidor: false,
    etiqueta: null,        // 'módulo' | 'materia'… solo en los bloques de unidades
    grupo: null,           // el grupo del documento al que pertenece la unidad
    hijos: [],
  }, base);

  function construirArbol({ plantilla, unidades, apartados, titulo, clave: claveRaiz } = {}) {
    if (!plantilla || !Array.isArray(plantilla.secciones)) {
      throw new TypeError('construirArbol necesita la `plantilla` del documento');
    }
    const lista = Array.isArray(unidades) ? unidades : [];

    // El estado de cada celda de la matriz (sección × unidad), que es lo único que se mira de los
    // apartados. Se indexa una vez: con 250 apartados, buscar en el array por cada nodo serían
    // 60.000 comparaciones por árbol.
    const escrito = new Map();
    for (const fila of (Array.isArray(apartados) ? apartados : [])) {
      escrito.set(clavePlana(fila.unidadId, fila.seccion), algoEscrito(fila.valores));
    }

    // `edita` se hereda del padre salvo que la sección diga otra cosa, que es la regla de
    // `quienEdita` de core/permisos.js resuelta de arriba abajo en una sola pasada. test/api.js
    // comprueba nodo a nodo que las dos formas de resolverlo coinciden.
    function rama(sec, numero, unidadId, editaDelPadre) {
      const edita = sec.edita || editaDelPadre || null;
      const campos = Array.isArray(sec.campos) ? sec.campos : [];

      // Una sección con `instancias` no se pinta: agrupa las unidades del documento y cada una
      // repite las secciones hijas con su propio unidadId. Es el par (seccion, unidadId) del motor.
      if (sec.instancias) {
        const n = nodo({
          clave: clave(null, sec.id),
          tipo: 'bloque',
          titulo: sec.titulo,
          num: numero,
          seccion: sec.id,
          contenido: false,
          edita,
          etiqueta: sec.etiqueta_instancia || null,
        });
        n.hijos = lista.map((u, j) => unidad(sec, u, `${numero}.${j + 1}`, edita));
        return n;
      }

      const n = nodo({
        clave: clave(unidadId, sec.id),
        tipo: 'apartado',
        titulo: sec.titulo,
        // El PDF no numera los repetidores: pinta «Situación de aprendizaje 1: …» por ítem. Si aquí
        // saliera un número, la barra lateral enseñaría una numeración que el documento no tiene.
        num: sec.repetidor ? null : numero,
        seccion: sec.id,
        unidadId: unidadId === undefined ? null : unidadId,
        contenido: campos.length > 0,
        edita,
        relleno: campos.length > 0 ? !!escrito.get(clavePlana(unidadId, sec.id)) : null,
        repetidor: !!sec.repetidor,
      });
      n.hijos = (sec.hijos || []).map((h, k) => rama(h, `${numero}.${k + 1}`, unidadId, edita));
      return n;
    }

    // La unidad es una carpeta: no se escribe en ella, se escribe en sus apartados. Por eso
    // `contenido: false`, igual que el `esContenido` del mockup, que trata 'unidad' como nodo de paso.
    function unidad(sec, u, numero, edita) {
      const n = nodo({
        clave: clave(u.unidadId, sec.id),
        tipo: 'unidad',
        titulo: u.titulo,
        num: numero,
        seccion: sec.id,
        unidadId: u.unidadId,
        contenido: false,
        edita,
        grupo: u.grupo === undefined ? null : u.grupo,
      });
      n.hijos = (sec.hijos || []).map((h, k) => rama(h, `${numero}.${k + 1}`, u.unidadId, edita));
      return n;
    }

    const raiz = nodo({
      clave: claveRaiz || '',
      tipo: 'raiz',
      titulo: titulo || plantilla.origen || 'Documento',
      contenido: false,
    });
    raiz.hijos = plantilla.secciones.map((sec, i) => rama(sec, String(i + 1), null, null));
    return raiz;
  }

  // Recorrido en profundidad, en orden de lectura. Devuelve los nodos, no pares { nodo, camino }
  // como el `aplanar` del mockup: aquí quien lo llama es la ruta de la API, que lo único que hace es
  // anotar permisos nodo a nodo.
  function aplanar(raiz) {
    const out = [];
    (function rec(n) {
      if (!n) return;
      out.push(n);
      (n.hijos || []).forEach(rec);
    })(raiz);
    return out;
  }

  // Las cuatro cifras que la interfaz enseña en la cabecera del documento sin tener que recorrer el
  // árbol otra vez. El progreso de verdad (cuántos apartados están validados para este curso) es del
  // E5, que necesita el `origen` de cada apartado; esto es solo lleno o vacío.
  function resumen(raiz) {
    const nodos = aplanar(raiz);
    const conContenido = nodos.filter((n) => n.contenido);
    return {
      nodos: nodos.length - 1, // sin la raíz, que es el documento
      unidades: nodos.filter((n) => n.tipo === 'unidad').length,
      apartados: conContenido.length,
      rellenos: conContenido.filter((n) => n.relleno).length,
      vacios: conContenido.filter((n) => !n.relleno).length,
    };
  }

  // ---------------------------------------------------------------------- exportado

  const api = { construirArbol, aplanar, resumen, algoEscrito, NUNCA_ESCRITO };

  global.Core = global.Core || {};
  global.Core.arbol = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
