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
const Plantilla = require('../../../core/plantilla');
const Val = require('../../../core/validaciones');
const { aMotor } = require('../../../core/documento');
const { obtenerRepositorio } = require('../repositorio');
const { usuarioDeLaPeticion, SIN_IDENTIFICAR, SIN_PERMISO } = require('../usuario');
const { RANGO, PUEDEN_INVITAR } = require('../invitaciones');
const { esActiva } = require('../../../core/versiones');

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

// El cuerpo de una petición que manda JSON. Devuelve { cuerpo } o { fallo }: un cuerpo que no es
// JSON, o que es `null` o una lista, es un 400 y no un 500, porque lo manda el cliente. Se exige un
// objeto porque todas las rutas que escriben esperan campos con nombre.
async function leerJson(peticion) {
  let cuerpo;
  try {
    cuerpo = await peticion.json();
  } catch (e) {
    return { fallo: malaPeticion('El cuerpo de la petición tiene que ser JSON.') };
  }
  if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) {
    return { fallo: malaPeticion('El cuerpo de la petición tiene que ser un objeto JSON.') };
  }
  return { cuerpo };
}

// Un campo de texto del cuerpo, recortado. Devuelve null si no es una cadena con contenido: así una
// ruta distingue «no lo has mandado» de «lo has mandado vacío» sin repetir la comprobación.
const texto = (cuerpo, campo) => {
  const valor = cuerpo ? cuerpo[campo] : undefined;
  if (typeof valor !== 'string') return null;
  const limpio = valor.trim();
  return limpio === '' ? null : limpio;
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
//
// UNA VERSIÓN ALTERNATIVA SOLO SE LEE. Toda petición que no sea GET sobre un documento que no es la
// versión activa se corta aquí con un 409, de modo que ninguna ruta de escritura tiene que
// acordarse de comprobarlo. Las rutas de versiones piden `{ permiteAlternativa: true }`: son las
// únicas que escriben sobre ellas (activarlas, borrarlas).
async function abrirDocumento(peticion, parametros, { permiteAlternativa = false } = {}) {
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

  if (!permiteAlternativa && peticion.method !== 'GET' && !esActiva(documento)) {
    return {
      fallo: fallo(
        409, 'version_alternativa',
        'Esta es una versión alternativa y no se edita: actívala primero desde la lista de versiones.',
        { documentoId: String(documento._id) },
      ),
    };
  }

  // LA ESTRUCTURA RETIRADA SE PODA AQUÍ, UNA VEZ.
  //
  // Un apartado retirado se queda dentro de `plantilla` para poder recuperarlo con su
  // contenido (core/plantilla.js), así que entre lo que el documento guarda y lo que el
  // documento ES hay un paso. Se da en el único sitio por el que pasan todas las rutas: así el
  // árbol, el apartado, el PDF, el Word y el panel de comprobaciones dicen lo mismo sin que
  // ninguna tenga que acordarse. Si cada una lo resolviera por su cuenta, la que se olvidara
  // seguiría imprimiendo un apartado que la pantalla ya no enseña, y eso no se nota hasta que
  // alguien exporta.
  //
  // `plantillaCompleta` es la de verdad, con los retirados dentro: la necesitan las rutas de
  // estructura, que son las únicas que tienen algo que hacer con ellos.
  const plantillaCompleta = documento.plantilla;
  const vigente = Plantilla.vigente(plantillaCompleta);
  if (vigente !== plantillaCompleta) documento.plantilla = vigente;

  return { usuario, documento, repo, plantillaCompleta };
}

// ---------------------------------------------------------------- la persona que se gestiona

// Lo mismo que `abrirDocumento`, pero para las rutas que gestionan a una persona: cambiarle el rol,
// darla de baja, mandarle otro enlace. La secuencia «resuelve quién pregunta → carga la persona →
// comprueba que la puede gestionar» es una sola función por el mismo motivo: una ruta que se olvide
// de comprobar el departamento no se distingue leyendo el código, se distingue el día que una
// jefatura cambia el rol de alguien de otro departamento.
//
// EL REPARTO DE ERRORES
//
//   404  no la ves: no existe, o es de otro departamento y tú no eres admin (docs/api.md)
//   403  la ves pero no puedes: tiene más rango que tú, o eres tú mismo, o no gestionas a nadie
//
// Devuelve { fallo } o { usuario, persona, repo }.
async function abrirPersona(peticion, parametros) {
  const usuario = await usuarioDeLaPeticion(peticion);
  if (!usuario) return { fallo: SIN_IDENTIFICAR() };

  if (!PUEDEN_INVITAR.includes(usuario.rol)) {
    return { fallo: SIN_PERMISO('Solo la jefatura de tu departamento gestiona a las personas que entran.') };
  }

  const repo = obtenerRepositorio();
  let persona = null;
  try {
    persona = await repo.usuarios.obtener(parametros && parametros.id);
  } catch (e) {
    persona = null;
  }

  // El admin es coordinación técnica del centro y ve a todo el mundo; la jefatura de departamento,
  // solo a los suyos, y para ella alguien de otro departamento simplemente no está.
  const visible = persona && (usuario.rol === 'admin' || persona.departamento === usuario.departamento);
  if (!visible) return { fallo: noEncontrado('No existe esa persona, o no es de tu departamento.') };

  // Nadie gestiona a alguien de más rango que él: si no, una jefatura de departamento podría dar de
  // baja al admin o cambiarle el rol, que es la misma puerta de atrás que invitar hacia arriba.
  if ((RANGO[persona.rol] || 0) > (RANGO[usuario.rol] || 0)) {
    return { fallo: SIN_PERMISO('Esa persona tiene más rango que tú: no puedes cambiar sus datos.') };
  }

  return { usuario, persona, repo };
}

// La plantilla de un documento que NO ha pasado por `abrirDocumento`, sin los apartados
// retirados. Hoy solo hay uno así: el del curso anterior, que se lee para comparar
// (app/_lib/rutas/apartado.js). Está aquí y no escrito allí para que el día que haya un segundo
// no se resuelva de otra manera.
const plantillaVigente = (documento) => Plantilla.vigente(documento && documento.plantilla);

// El documento tal como sale al cliente: sin `plantilla`. La plantilla de la PD real son 57
// secciones con sus campos y no la necesita ninguna vista: el árbol ya viene masticado en
// /arbol y los campos de un apartado, en /apartado (docs/api.md, segunda regla de forma).
const sinPlantilla = (documento) => {
  const copia = { ...documento };
  delete copia.plantilla;
  return copia;
};

// ---------------------------------------------------------------- las comprobaciones del documento

// QUÉ COMPROBACIONES SE LE APLICAN A ESTE DOCUMENTO, y con qué convenio se cuentan las ponderaciones
// de los criterios. La regla de qué se puede configurar está en core/validaciones.js; esto es la
// lectura, y está aquí porque la piden TRES rutas y tienen que leer lo mismo:
//
//   /validaciones    el panel de comprobaciones, y por tanto la puerta de aprobación de /estado
//   /pdf             el generador, para que la cajita roja use el MISMO convenio que el panel
//   /comprobaciones  la pantalla que lo configura
//
// Si cada una lo leyera a su manera, el panel y el PDF podrían medir con reglas distintas, que es
// justo lo que el criterio de aceptación del E4 prohíbe.
const comprobacionesDe = (documento) => Val.normalizarConfig(documento && documento.comprobaciones);

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
  if (!esActiva(documento)) return false;
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

// Todas las secciones de la plantilla que tienen un campo de un tipo, con el id del campo. Lo
// necesitan las dos rutas del E4 —el PATCH, para comprobar las ponderaciones, y el panel de
// comprobaciones, para buscarlas— y la respuesta no es «la sección que sea»: la PD real tiene DOS
// apartados con ponderaciones por módulo («Ponderaciones de los resultados de aprendizaje…» y
// «Recuperación de los resultados de aprendizaje»), así que quien busque por un id fijo se deja uno.
//
// Se devuelven en el orden de lectura del documento, que es el orden en el que el motor las pinta.
function seccionesConCampo(plantilla, tipo) {
  const out = [];
  const bajar = (sec) => {
    for (const campo of (sec.campos || [])) {
      if (campo.tipo === tipo) out.push({ seccion: sec.id, campo: campo.id, repetidor: !!sec.repetidor });
    }
    (sec.hijos || []).forEach(bajar);
  };
  ((plantilla && plantilla.secciones) || []).forEach(bajar);
  return out;
}

// El tipo de campo que el importador deja donde está la tabla de resultados de aprendizaje y
// criterios de evaluación del módulo: `{ ra: [{ num, texto, ce: [{ letra, texto }] }] }`.
const TIPO_RA_CE = 'auto.tabla_ra_ce';

// Los RESULTADOS DE APRENDIZAJE QUE DECLARA UN MÓDULO, por su número.
//
// Es la lista contra la que se comprueba todo lo que habla de RA: las ponderaciones que se guardan
// (un peso para un RA que el módulo no tiene no reparte nada y nadie lo encuentra para arreglarlo) y
// los RA que ninguna situación de aprendizaje trabaja. Sale del apartado del propio módulo y de
// ningún otro sitio: el catálogo de `core/unidades.js` tiene los módulos, no sus RA, que son del
// currículo de cada título.
//
// Devuelve [] si el módulo no lo tiene escrito, y quien pregunta decide qué hacer con eso.
async function raDelModulo(repo, documento, unidadId) {
  const nums = new Set();
  for (const { seccion, campo } of seccionesConCampo(documento.plantilla, TIPO_RA_CE)) {
    const fila = await repo.apartados.leer(documento._id, seccion, unidadId);
    const valor = fila && fila.valores ? fila.valores[campo] : undefined;
    for (const num of raDeTablas(valor)) nums.add(num);
  }
  return [...nums].sort((a, b) => a - b);
}

// Los números de RA que hay en el valor de un campo `auto.tabla_ra_ce`, sin pasar por el
// repositorio. Está aparte porque el panel de comprobaciones ya tiene todos los apartados en
// memoria y no tiene por qué volver a pedirlos uno a uno; lo que no puede estar escrito dos veces es
// esto: CÓMO se leen los RA del módulo.
function raDeTablas(valor) {
  const nums = [];
  for (const tabla of (Array.isArray(valor) ? valor : [valor])) {
    for (const ra of ((tabla && tabla.ra) || [])) {
      if (ra && Number.isInteger(ra.num) && nums.indexOf(ra.num) < 0) nums.push(ra.num);
    }
  }
  return nums.sort((a, b) => a - b);
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
  propuesta_pedagogica: 'Propuesta pedagógica',
  pccf: 'Proyecto curricular del ciclo formativo',
  memoria: 'Memoria del departamento',
};

// Cómo se escribe el `ciclo` en la portada. Por omisión en mayúsculas, porque DAW y SMR son siglas y
// así es como las llama el departamento. `bach` no es una sigla, es una abreviatura: en la portada de
// un documento que se imprime y se lleva a una reunión, «BACH» se lee como una errata. ESO sí es
// sigla y se queda. Es un único sitio porque la portada del PDF y la del Word tienen que decir lo
// mismo (ver justo debajo).
const NOMBRE_CICLO = { bach: 'Bachillerato' };
const comoSeEscribeElCiclo = (ciclo) => (ciclo
  ? (NOMBRE_CICLO[String(ciclo).toLowerCase()] || String(ciclo).toUpperCase())
  : null);

// El título de la portada. Sale del documento y no de un parámetro a propósito: es el mismo para el
// PDF y para el Word, y dos exportaciones del mismo documento tienen que llevar la misma portada.
function tituloDelTomo(documento, unidad) {
  const partes = [
    NOMBRE_TIPO[documento.tipo] || 'Documento',
    comoSeEscribeElCiclo(documento.ciclo),
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
    comoSeEscribeElCiclo(documento.ciclo),
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

// `estado` en la URL es CÓMO SE IMPRIME, no el estado del documento. Son dos escalas distintas y
// conviene no confundirlas, porque el E7 añade una tercera posición a una de las dos:
//
//   el documento está en   borrador | revisión | aprobado      (docs/plan.md §3, /estado)
//   el tomo se imprime en  borrador | aprobado                 (este parámetro)
//
// Solo hay dos formas de imprimir porque solo hay dos cosas que decir en el papel: lleva la marca de
// agua de BORRADOR o no la lleva. `buildDocDefinition` trata como borrador todo lo que no sea
// `aprobado` (motor/render-generico.js), así que **un documento en revisión se imprime como
// borrador**, que es exacto: no está aprobado. Y por eso `revision` no es un valor de este parámetro.
//
// Por omisión se usa el estado del documento, y la conversión es esa: `revision` entra al generador y
// sale impreso como borrador. Quien construya el enlace a mano con `documento.estado` dentro tiene
// que mandar `borrador` cuando el documento esté en revisión, o no mandar nada y dejar que mande el
// documento, que es lo que hace la interfaz.
//
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

// ---------------------------------------------------------------- el curso

// El curso tiene la forma de la importación, 2026-27. Las dos puertas que lo piden (importar y crear
// el curso siguiente) usan esta misma expresión para no aceptar cosas distintas.
const CURSO_RE = /^\d{4}-\d{2}$/;

// El curso que viene después de uno dado: 2026-27 → 2027-28. Es lo que se propone por omisión al
// crear el documento del curso siguiente; quien lo pide puede dar otro.
function cursoSiguiente(curso) {
  const anio = Number(String(curso).slice(0, 4)) + 1;
  return `${anio}-${String((anio + 1) % 100).padStart(2, '0')}`;
}

// ---------------------------------------------------------------- el origen de un apartado

// Los cuatro valores de `origen` (docs/plan.md §2.1). Lo heredado es lo que viene del curso anterior
// sin que nadie lo haya mirado; lo revisado, lo que alguien ha dado por bueno; lo modificado, lo que
// alguien ha reescrito; lo nuevo, lo que nace en este curso.
// La regla vive en core/documento.js, que es de donde la lee también el navegador.
const { ORIGENES, esRevisado } = require('../../../core/documento');

module.exports = {
  CURSO_RE,
  cursoSiguiente,
  ORIGENES,
  esRevisado,
  fallo,
  malaPeticion,
  noEncontrado,
  errorInterno,
  conErrores,
  leerJson,
  texto,
  abrirDocumento,
  abrirPersona,
  comprobacionesDe,
  sinPlantilla,
  plantillaVigente,
  puedeEditarApartado,
  buscarSeccion,
  seccionesConCampo,
  raDelModulo,
  raDeTablas,
  TIPO_RA_CE,
  leerParaElMotor,
  tituloDelTomo,
  nombreDeArchivo,
  estadoPedido,
  unidadPedida,
  SUBTITULO,
  SIN_IDENTIFICAR,
  // El 403 ya lo usan las rutas de identidad del E2 (dar de alta, cambiar un rol), así que se
  // reexporta desde aquí para que una ruta no tenga que pedir cosas a dos sitios. Sigue viviendo en
  // app/_lib/usuario.js, que es donde está el resto de «quién eres».
  SIN_PERMISO,
};
