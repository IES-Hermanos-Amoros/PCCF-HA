// Las dos traducciones entre la forma del motor y las filas del repositorio.
//
// Hoy hay un camino que funciona y está probado:
//
//   .docx -> importarDocx -> { plantilla, datos } -> buildDocDefinition -> PDF
//
// y la aplicación mete una base de datos justo en la mitad:
//
//   .docx -> importarDocx -> { plantilla, datos } -> REPOSITORIO -> { plantilla, datos } -> PDF
//
// Ese tramo nuevo es el riesgo nº 1 de todo el proyecto (docs/interfaz-web.md §2.3): el PDF solo sale
// bien si lo que se guarda y se vuelve a leer es EXACTAMENTE lo que el generador espera. Si por el
// camino se pierde un campo, se reordenan los módulos o un `null` se convierte en un campo ausente,
// el documento sale distinto y nadie se entera hasta que alguien imprime su programación en
// septiembre. Por eso las dos conversiones viven aquí, en un solo sitio y sin nada alrededor, y por
// eso test/ida-y-vuelta.js compara la definición del PDF antes y después de pasar por la base de
// datos en lugar de comprobar campo a campo: lo que importa no es que el mapeo parezca correcto, es
// que el documento salga igual.
//
//   aFilas({ plantilla, datos }, opciones)  ->  { documento, unidades, apartados, compartidos }
//   aMotor({ documento, unidades, apartados, compartidos })  ->  { plantilla, datos }
//
// CÓMO SE REPARTE EL DOCUMENTO EN FILAS
//
// La unidad de guardado es el apartado (docs/plan.md §2.3): el par `(seccion, unidadId)`. `datos`
// del importador es exactamente esa matriz vista por filas y columnas:
//
//   datos.documento[seccion]              -> apartado (seccion, unidadId: null)   común
//   datos.instancias[i].valores[seccion]  -> apartado (seccion, unidadId)         de un módulo
//   datos.instancias[i]                   -> unidad   (titulo, num, grupo, docentes)
//   datos.compartidos[cid]                -> compartido
//   datos.departamento, datos.asignaciones, plantilla  -> el documento
//
// `valores` se guarda tal cual lo produce el importador, que no es una lista de bloques: es
// `{ campoId: valor }` y el valor depende del tipo de campo —bloques de texto, `{ ra: [...] }` de las
// ponderaciones, `{ pares: [...] }` de las tablas de clave y valor, la ficha de una situación de
// aprendizaje…—. Es la forma que entiende el renderer, y aquí no se normaliza ni se simplifica nada
// (docs/plan.md §3, segunda nota).
//
// NI SE COPIA NI SE MUTA
//
// Las dos funciones devuelven referencias a los valores que reciben: no clonan. `datos.json` del
// documento real pesa 3 MB y copiarlo en cada conversión se notaría en cada guardado. Quien persiste
// —el repositorio— ya copia por su cuenta (repositorio/memoria.js lo hace con structuredClone
// precisamente para que nadie pueda cambiar lo guardado tocando el objeto que le han dado).
//
// Esto es lógica pura: sin DOM, sin node, sin red, sin localStorage. Vale como <script> en el mockup,
// como `require` en el motor y en las pruebas, y como `import` desde Next.

(function (global) {
  'use strict';

  const esObjeto = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
  const oNulo = (x) => (x === undefined ? null : x);

  // Campos que pone el repositorio y que el motor no conoce. Al volver hacia el motor hay que
  // quitarlos: si `datos.compartidos.c001` llevara un `_id` dentro, el documento reconstruido ya no
  // sería igual al importado, y el ida y vuelta fallaría por un campo que no pinta nada en el PDF.
  //
  // Se quitan estos tres y se deja pasar todo lo demás, en lugar de copiar los seis campos conocidos
  // del compartido: así un campo que se añada al modelo (una fecha de revisión, un responsable
  // distinto) viaja solo, sin que haya que acordarse de este fichero.
  const DEL_REPOSITORIO = ['_id', 'documentoId', 'cid'];

  const sinCamposDelRepositorio = (fila) => {
    const out = {};
    for (const [k, v] of Object.entries(fila || {})) if (!DEL_REPOSITORIO.includes(k)) out[k] = v;
    return out;
  };

  // --------------------------------------------------------------------- el unidadId

  const sinAcentos = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '');

  // Identificador derivado del título, determinista: el mismo título da siempre el mismo id, en el
  // navegador y en el servidor. Es la red de seguridad de `aFilas` cuando nadie le pasa `conciliar`,
  // no la solución: ver el comentario de `aFilas` sobre por qué el título no vale como clave.
  //
  // No se reutiliza el `slug` del importador a propósito: `core/` no puede depender de `motor/`,
  // que arrastra mammoth y JSZip y no se puede cargar en el navegador.
  function idDeTitulo(titulo) {
    const s = sinAcentos(titulo).toLowerCase().replace(/[^a-z0-9ñ]+/g, '-').replace(/^-+|-+$/g, '');
    return s.slice(0, 60) || 'unidad';
  }

  // Dos módulos pueden llamarse igual —en el primer curso y en el segundo hay títulos que se repiten—
  // y el repositorio rechaza dos unidades con el mismo `unidadId` en un documento, así que el choque
  // se resuelve aquí o la importación entera se cae.
  //
  // Con la red de seguridad se añade un sufijo (determinista, por el orden del documento). Con un
  // `conciliar` de verdad NO: que el catálogo mande dos módulos distintos al mismo id estable es un
  // error del catálogo, y taparlo con un `-2` dejaría dos módulos compartiendo las asignaciones del
  // curso siguiente, que es justo el fallo que el unidadId viene a evitar.
  function idDeInstancia(instancia, conciliar, usados) {
    if (typeof conciliar === 'function') {
      const id = conciliar(instancia.titulo, instancia);
      if (typeof id !== 'string' || id === '') {
        throw new TypeError(`conciliar() no devolvió un unidadId para «${instancia.titulo}»`);
      }
      if (usados.has(id)) {
        throw new Error(`conciliar() ha dado el mismo unidadId «${id}» a «${usados.get(id)}» y a «${instancia.titulo}»`);
      }
      usados.set(id, instancia.titulo);
      return id;
    }
    const base = idDeTitulo(instancia.titulo);
    let id = base;
    for (let n = 2; usados.has(id); n += 1) id = `${base}-${n}`;
    usados.set(id, instancia.titulo);
    return id;
  }

  // --------------------------------------------------------------- motor -> repositorio

  // `opciones` son los datos que el importador no sabe y el modelo sí necesita (docs/plan.md §3):
  //
  //   conciliar(titulo, instancia) -> unidadId   cómo se identifica cada módulo (ver abajo)
  //   tipo, ciclo, curso, departamento, estado, anteriorId, origen, plantillaVersion
  //   origenApartados                            el `origen` con el que nacen los apartados
  //                                              (heredado | revisado | modificado | nuevo), que en
  //                                              el E5 distingue lo arrastrado de lo escrito
  //
  // SOBRE `conciliar`
  //
  // El importador identifica cada instancia solo por su `titulo`, y los títulos cambian de curso a
  // curso: entre 2025-26 y 2026-27 cambian tres veces («Desarrollo web en entornos cliente» ->
  // «…en entorno cliente», «Sostenibilidad aplicada a los sectores productivos» -> «…al sistema
  // productivo» en dos ciclos). Guardar el título como clave es el fallo que todo el diseño del
  // mockup v2 vino a arreglar: cada septiembre se perdían en silencio las asignaciones de los
  // módulos renombrados.
  //
  // Conciliar el título con el catálogo estable de unidades es trabajo del E1, no de esta pieza, así
  // que la decisión entra por parámetro: el E1 le pasará una función construida sobre el catálogo de
  // docs/mockup-v2/js/unidades.js (que busca por código o por el título de ese curso, `titulos`).
  // Sin ella se usa un id derivado del título de forma determinista, que sirve para las pruebas y
  // para el día que llegue un documento de un ciclo que no esté en el catálogo.
  function aFilas({ plantilla, datos } = {}, opciones = {}) {
    if (!esObjeto(plantilla)) throw new TypeError('aFilas necesita la `plantilla` del importador');
    if (!esObjeto(datos)) throw new TypeError('aFilas necesita los `datos` del importador');
    const o = opciones || {};

    const documento = {
      tipo: o.tipo !== undefined ? o.tipo : (plantilla.tipo || 'programacion_didactica'),
      ciclo: oNulo(o.ciclo),
      // El curso es una dimensión del modelo desde el primer día, aunque la vista de cambios no
      // llegue hasta el E5: metérselo después obliga a migrar todo lo que el departamento haya
      // escrito, y eso no se puede hacer a mitad de septiembre (docs/plan.md §2.1).
      curso: oNulo(o.curso),
      departamento: o.departamento !== undefined ? o.departamento : oNulo(datos.departamento),
      estado: o.estado !== undefined ? o.estado : 'borrador',
      plantilla,
      // Versionada desde el E0 aunque la estructura no se pueda cambiar hasta el E6: sin esto no hay
      // migración posible el día que la plantilla cambie (docs/plan.md §2.6).
      plantillaVersion: o.plantillaVersion !== undefined ? o.plantillaVersion : oNulo(plantilla.version) || 1,
      anteriorId: oNulo(o.anteriorId),
      asignaciones: datos.asignaciones || {},
      origen: o.origen !== undefined ? o.origen : oNulo(plantilla.origen),
    };

    const origenApartados = o.origenApartados !== undefined ? o.origenApartados : null;
    const apartados = [];
    // Un apartado común se guarda con unidadId null, nunca ausente, que es lo que espera el
    // repositorio para que la clave única y los filtros lo traten igual que a los demás.
    for (const [seccion, valores] of Object.entries(datos.documento || {})) {
      apartados.push({ seccion, unidadId: null, valores, origen: origenApartados });
    }

    const unidades = [];
    const usados = new Map();
    // El orden de este array es el orden del tomo del PDF, y el repositorio lo conserva como orden
    // de creación. Ver `aMotor`.
    for (const instancia of (Array.isArray(datos.instancias) ? datos.instancias : [])) {
      const unidadId = idDeInstancia(instancia, o.conciliar, usados);
      unidades.push({
        unidadId,
        titulo: instancia.titulo,
        num: oNulo(instancia.num),
        grupo: oNulo(instancia.grupo),
        docentes: Array.isArray(instancia.docentes) ? instancia.docentes : [],
      });
      for (const [seccion, valores] of Object.entries(instancia.valores || {})) {
        apartados.push({ seccion, unidadId, valores, origen: origenApartados });
      }
    }

    // En el motor los compartidos son un objeto indexado por cid, porque `resolverCompartidos` busca
    // por ahí; en el repositorio son una colección y el cid es un campo más.
    const compartidos = Object.entries(datos.compartidos || {}).map(([cid, c]) => ({ cid, ...c }));

    return { documento, unidades, apartados, compartidos };
  }

  // --------------------------------------------------------------- repositorio -> motor

  // `unidades` tiene que llegar tal como lo devuelve `repo.unidades.listar()`, sin reordenar: ese
  // orden es el de creación y el repositorio lo conserva a propósito, porque es el orden en el que
  // salen los módulos en el tomo del PDF. Aquí no se vuelve a ordenar por nada —ni por título ni por
  // `num`, que es nulo en seis de los once módulos del documento real— porque cualquier orden que se
  // invente sería distinto del del documento, y un tomo con los módulos desordenados es el tipo de
  // fallo que no salta a la vista: el PDF se genera, tiene las mismas páginas y está mal.
  function aMotor({ documento, unidades, apartados, compartidos } = {}) {
    if (!esObjeto(documento)) throw new TypeError('aMotor necesita la fila del documento');

    const comunes = {};
    const porUnidad = new Map();
    for (const u of (unidades || [])) porUnidad.set(u.unidadId, {});

    for (const fila of (apartados || [])) {
      const valores = fila.valores === undefined ? {} : fila.valores;
      if (fila.unidadId === null || fila.unidadId === undefined) { comunes[fila.seccion] = valores; continue; }
      // Un apartado de una unidad que ya no está en el documento no se cuelga en ningún sitio: se
      // queda fuera en lugar de inventar una instancia que la plantilla no va a pintar.
      const destino = porUnidad.get(fila.unidadId);
      if (destino) destino[fila.seccion] = valores;
    }

    const datos = {
      departamento: oNulo(documento.departamento),
      documento: comunes,
      instancias: (unidades || []).map((u) => ({
        titulo: u.titulo,
        num: oNulo(u.num),
        grupo: oNulo(u.grupo),
        docentes: Array.isArray(u.docentes) ? u.docentes : [],
        valores: porUnidad.get(u.unidadId) || {},
      })),
      asignaciones: documento.asignaciones || {},
      // `compartidos` se devuelve siempre, aunque esté vacío. Para el motor da igual —
      // `resolverCompartidos` trata ausente y vacío exactamente igual— y así `datos` tiene una sola
      // forma en lugar de dos que hay que recordar.
      compartidos: Object.fromEntries((compartidos || []).map((c) => [c.cid, sinCamposDelRepositorio(c)])),
    };

    return { plantilla: documento.plantilla, datos };
  }

  // ---------------------------------------------------------------------- exportado

  const api = { aFilas, aMotor, idDeTitulo };

  global.Core = global.Core || {};
  global.Core.documento = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
