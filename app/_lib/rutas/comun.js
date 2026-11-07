// Lo que comparten todas las rutas de la API: los errores, el usuario, el documento y los permisos.
//
// Está aparte porque son las cuatro cosas que no se pueden escribir dos veces. Una ruta que redacte
// su propio 404, o que se olvide de comprobar el departamento, no se distingue de las demás leyendo
// el código: se distingue el día que alguien lee un documento que no es suyo. Así que la secuencia
// «resuelve el usuario → carga el documento → comprueba que lo puede ver» es una sola función y
// todas las rutas empiezan por ella.
//
// Es CommonJS y no sabe que está dentro de Next (docs/api.md, primera regla de forma): recibe un
// `Request` normal y los parámetros de la ruta ya resueltos, y devuelve un `Response`. Por eso
// test/api.js la puede llamar directamente, sin levantar el servidor.

'use strict';

const C = require('../../../core/permisos');
const { aMotor } = require('../../../core/documento');
const { obtenerRepositorio } = require('../repositorio');
const { usuarioDeLaPeticion, SIN_IDENTIFICAR } = require('../usuario');

// ---------------------------------------------------------------- errores

// Siempre JSON y siempre con la misma forma (docs/api.md): un código que el cliente compara y un
// mensaje en castellano que se puede enseñar tal cual. Dos campos, nunca uno: con solo el código la
// interfaz tiene que inventarse el texto, y con solo el mensaje no puede reaccionar.
const fallo = (estado, error, mensaje, extra = {}) => Response.json(
  { error, mensaje, ...extra },
  { status: estado, headers: { 'Cache-Control': 'no-store' } },
);

const malaPeticion = (mensaje) => fallo(400, 'peticion', mensaje);
const noEncontrado = (mensaje) => fallo(404, 'no_encontrado', mensaje || 'No existe lo que pides.');
const errorInterno = (e) => fallo(500, 'error_interno', (e && e.message) || 'Error interno.');

// Cualquier excepción que se escape acaba en un 500 con la misma forma que los demás errores. Sin
// esto, un fallo inesperado devuelve la página de error de Next —HTML— a un cliente que está
// esperando JSON, y la interfaz enseña «Unexpected token <» en lugar de lo que ha pasado.
const conErrores = (fn) => async (...args) => {
  try {
    return await fn(...args);
  } catch (e) {
    return errorInterno(e);
  }
};

// ---------------------------------------------------------------- el usuario y el documento

// POR QUÉ UN 404 Y NO UN 403 CUANDO EL DOCUMENTO ES DE OTRO DEPARTAMENTO
//
// Un 403 confirma que ese documento existe. La diferencia importa poco con ids opacos, pero el
// motivo de fondo es otro: «no lo ve» es literalmente lo que dice la regla de core/permisos.js, y
// tratarlo como «no está» deja la API con un reparto sin zonas grises:
//
//   404  no lo ves: el documento no existe, o es de otro departamento (para ti, es lo mismo)
//   403  lo ves pero no puedes hacer eso: editar sin permiso, aprobar sin ser quien aprueba…
//
// Si fuera 403, la interfaz tendría que distinguir dos casos que para quien mira la pantalla son el
// mismo («aquí no hay nada para ti») y el 403 dejaría de significar una sola cosa.
//
// Devuelve { fallo } o { usuario, documento, repo }. Se devuelve el `Response` en lugar de lanzar
// para que cada ruta siga siendo una función que devuelve respuestas y se pueda leer de arriba abajo.
async function abrirDocumento(peticion, parametros) {
  const usuario = await usuarioDeLaPeticion(peticion);
  if (!usuario) return { fallo: SIN_IDENTIFICAR() };

  const id = parametros && parametros.id;
  const repo = obtenerRepositorio();

  // El id viene de la URL: puede ser cualquier cosa. El repositorio exige una cadena no vacía y
  // lanza si no lo es, y una URL con basura dentro tiene que acabar en 404 y no en un 500.
  let documento = null;
  try {
    documento = await repo.documentos.obtener(id);
  } catch (e) {
    documento = null;
  }

  if (!documento || !C.puedeVer(usuario, documento)) {
    return { fallo: noEncontrado('No existe ese documento, o no es de tu departamento.') };
  }
  return { usuario, documento, repo };
}

// El documento tal como sale al cliente: sin `plantilla`. La plantilla de la PD real son 57
// secciones con sus campos y no la necesita ninguna vista: el árbol ya viene masticado en
// /arbol y los campos de un apartado, en /apartado (docs/api.md, segunda regla de forma).
const sinPlantilla = (documento) => {
  const copia = { ...documento };
  delete copia.plantilla;
  return copia;
};

// ---------------------------------------------------------------- permisos

// La búsqueda que necesita la regla de core/permisos.js, resuelta sobre las filas del repositorio.
// Es el tercer lado del mismo triángulo: motor/permisos.js la resuelve sobre plantilla + datos y
// docs/mockup-v2/js/permisos.js sobre el nodo del árbol + el usuario. La regla, en los tres casos,
// es la de core/permisos.js y no se copia.
//
// Ojo con el identificador: el usuario del repositorio tiene `_id` y motor/permisos.js trabaja con
// `usuario.id`, porque allí los usuarios venían de los datos del importador. Las listas de docentes
// y de asignaciones guardan el id del usuario, así que aquí se compara contra `_id`.
function puedeEditarApartado({ usuario, documento, unidad, seccion, edita, contenido = true }) {
  if (!usuario || !documento) return false;
  if (!C.puedeVer(usuario, documento)) return false;
  // Un nodo que solo agrupa (la raíz, un bloque de unidades, la unidad misma) no se edita: se
  // resume. Es el `esContenido` del mockup, y sin esta línea el árbol enseñaría un lápiz sobre una
  // carpeta.
  if (!contenido) return false;

  const asignaciones = (documento && documento.asignaciones) || {};
  // Asignar «Evaluación» asigna también sus subapartados, igual que en motor/permisos.js: es como
  // se reparte el trabajo de verdad.
  const asignado = [seccion, C.raizSeccion(seccion)]
    .some((k) => k && (asignaciones[k] || []).includes(usuario._id));

  return C.reglaEdicion(usuario, {
    edita,
    esDocenteDeLaUnidad: !!unidad && ((unidad.docentes || []).includes(usuario._id)),
    tieneApartadoAsignado: asignado,
  });
}

// ---------------------------------------------------------------- la plantilla

// La sección de la plantilla que corresponde a un id, con dos cosas que hacen falta y que no están
// en la sección: si pertenece a una unidad (algún antepasado reparte instancias) y quién la edita.
//
// No se usa `C.quienEdita` porque hay que bajar el árbol de todas formas para saber si la sección
// está dentro de un bloque de instancias, y recorrerlo dos veces sería pedir que las dos pasadas se
// separen. El `edita` que sale de aquí es el mismo: lo comprueba test/api.js.
function buscarSeccion(plantilla, idSeccion) {
  const contiene = (sec, id) => id === sec.id || String(id).startsWith(sec.id + '/');
  let nivel = (plantilla && plantilla.secciones) || [];
  let edita = null;
  let deUnidad = false;
  let encontrada = null;

  for (;;) {
    const sec = (nivel || []).find((x) => contiene(x, idSeccion));
    if (!sec) break;
    if (sec.edita) edita = sec.edita;
    if (sec.instancias) deUnidad = true;
    if (sec.id === idSeccion) { encontrada = sec; break; }
    nivel = sec.hijos;
  }

  if (!encontrada) return null;
  return {
    seccion: encontrada,
    edita,
    // El bloque que reparte las instancias no es «de una unidad»: es el que las agrupa.
    deUnidad: deUnidad && !encontrada.instancias,
    campos: Array.isArray(encontrada.campos) ? encontrada.campos : [],
  };
}

// ---------------------------------------------------------------- lo que pide el motor

// Las cuatro colecciones en las que §2.3 parte el documento, de vuelta a la forma del motor. Es la
// mitad de ida y vuelta que prueba test/ida-y-vuelta.js, y la usan /pdf y /docx.
//
// `unidades.listar()` se pasa a `aMotor` sin tocar y se devuelve también tal cual: ese orden es el
// del tomo, y quien elige una unidad suelta necesita su posición en él.
async function leerParaElMotor(repo, documento) {
  const id = documento._id;
  const [unidades, apartados, compartidos] = await Promise.all([
    repo.unidades.listar(id),
    repo.apartados.listar(id),
    repo.compartidos.listar(id),
  ]);
  const { plantilla, datos } = aMotor({ documento, unidades, apartados, compartidos });
  return { plantilla, datos, unidades };
}

// ---------------------------------------------------------------- títulos y nombres de fichero

const SUBTITULO = 'IES Hermanos Amorós';

const NOMBRE_TIPO = {
  programacion_didactica: 'Programación didáctica',
  pd: 'Programación didáctica',
  pccf: 'Proyecto curricular del ciclo formativo',
  memoria: 'Memoria del departamento',
};

// El título de la portada. Sale del documento y no de un parámetro a propósito: es el mismo para el
// PDF y para el Word, y dos exportaciones del mismo documento tienen que llevar la misma portada.
function tituloDelTomo(documento, unidad) {
  const partes = [
    NOMBRE_TIPO[documento.tipo] || 'Documento',
    documento.ciclo ? String(documento.ciclo).toUpperCase() : null,
    documento.curso || null,
  ].filter(Boolean);
  if (unidad) partes.push(unidad.titulo);
  return partes.join(' · ');
}

// Sin acentos ni espacios: el nombre viaja en una cabecera HTTP, que es latin-1, y con acentos hay
// navegadores que lo descartan y guardan el fichero como «download».
const SIN_ACENTOS = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', ñ: 'n', ç: 'c', Á: 'A', É: 'E', Í: 'I', Ó: 'O', Ú: 'U', Ñ: 'N' };
function nombreDeArchivo(documento, unidad, extension) {
  const crudo = [
    (NOMBRE_TIPO[documento.tipo] || 'documento').split(' ')[0],
    documento.ciclo ? String(documento.ciclo).toUpperCase() : null,
    documento.curso || null,
    unidad ? unidad.titulo : null,
  ].filter(Boolean).join('_');
  const limpio = crudo.replace(/[áéíóúüñçÁÉÍÓÚÑ]/g, (c) => SIN_ACENTOS[c])
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120);
  return `${limpio || 'documento'}.${extension}`;
}

// ---------------------------------------------------------------- parámetros

// `estado` es borrador (con marca de agua) o aprobado; por omisión, el del documento (docs/api.md).
// Un valor que no sea uno de los dos es un 400 y no «lo trato como borrador»: un enlace con
// `estado=aprovado` escrito a mano tiene que decir que está mal, no entregar un PDF con marca de
// agua que el usuario creía aprobado.
const ESTADOS = ['borrador', 'aprobado'];

function estadoPedido(url, documento) {
  const pedido = url.searchParams.get('estado');
  if (pedido === null || pedido === '') return { estado: documento.estado || 'borrador' };
  if (!ESTADOS.includes(pedido)) {
    return { fallo: malaPeticion(`El estado «${pedido}» no existe: usa ${ESTADOS.join(' o ')}.`) };
  }
  return { estado: pedido };
}

// La unidad pedida, resuelta a su posición en el documento.
//
// Se le pasa al motor el ÍNDICE y no el título: `buildDocDefinition` y `exportarDocx` aceptan los
// dos, pero dos módulos pueden llamarse igual —«Proyecto intermodular» aparece en los dos cursos del
// ciclo— y seleccionar por título sacaría los dos en el tomo de uno solo. El índice es exacto.
function unidadPedida(url, unidades) {
  const pedida = url.searchParams.get('unidad');
  if (pedida === null || pedida === '') return { unidad: null, indice: -1 };
  const indice = unidades.findIndex((u) => u.unidadId === pedida);
  if (indice === -1) {
    return { fallo: noEncontrado(`Este documento no tiene ninguna unidad «${pedida}».`) };
  }
  return { unidad: unidades[indice], indice };
}

module.exports = {
  fallo,
  malaPeticion,
  noEncontrado,
  errorInterno,
  conErrores,
  abrirDocumento,
  sinPlantilla,
  puedeEditarApartado,
  buscarSeccion,
  leerParaElMotor,
  tituloDelTomo,
  nombreDeArchivo,
  estadoPedido,
  unidadPedida,
  SUBTITULO,
  SIN_IDENTIFICAR,
  // `SIN_PERMISO` (el 403) no se reexporta porque ninguna ruta de este evolutivo lo usa: todas son
  // de lectura, y «no puedes verlo» es un 404. El primer 403 lo escribirá el PATCH del E3, y lo
  // pedirá a app/_lib/usuario.js, que es donde está.
};
