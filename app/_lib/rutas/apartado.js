// GET y PATCH /api/documentos/[id]/apartado?seccion=&unidad= — una rama del documento.
//
// La otra mitad de la segunda regla de forma de docs/api.md: el árbol es una cosa y el contenido de
// un apartado es otra. Esta es la petición que se hace al pinchar en la barra lateral, y la que
// guarda lo que se escribe.
//
// QUÉ DEVUELVE EL GET ADEMÁS DE LOS VALORES
//
//   puedeEditar  para que el cliente pinte el candado sin tener que deducirlo (y sin que se le
//                mande con qué deducirlo: las asignaciones y los docentes no salen de aquí)
//   campos       los campos de la plantilla para esta sección. Sin ellos el cliente no puede pintar
//                `valores`: un `{ pares: [...] }` se dibuja como una tabla de clave y valor y un
//                `{ ra: [...] }` como la tabla de RA y CE, y quién es quién lo dice la plantilla.
//                Como ninguna ruta manda la plantilla entera, viaja aquí, recortada a esta rama
//   compartidos  los textos compartidos a los que apunta este apartado, y solo esos. Un `{ ref: 'c001' }`
//                sin su bloque es un hueco que el cliente no puede pintar, y en el E1 no hay ninguna
//                otra ruta por la que pedirlos
//
// UN APARTADO SIN ESCRIBIR NO ES UN 404
//
// El importador solo crea filas de los apartados que el Word traía con algo dentro. Una sección que
// está en la plantilla y que nadie ha escrito todavía existe —es parte del documento, sale en el
// árbol y hay que poder abrirla para escribir en ella—, así que se devuelve con `valores: {}` y
// `existe: false`. El 404 se reserva para lo que de verdad no está: una sección que no es de este
// documento, o una unidad que no lo es.
//
// ================================================================ EL PATCH
//
// Cuerpo: `{ valores, esperaUpdatedAt }`. Y es LA ÚLTIMA PUERTA ANTES DE LA BASE DE DATOS: lo que
// pase de aquí ya está escrito, y lo que esté escrito es lo que se imprime.
//
// 1. EL PERMISO SE COMPRUEBA AQUÍ, no en el cliente. `puedeEditar` del GET es para pintar el
//    candado; quien decide es esto. Un docente en un módulo que no lleva, o la jefatura de estudios
//    en cualquiera, reciben 403 aunque tengan el editor delante (docs/plan.md, criterio del E2).
//
// 2. LOS VALORES SE VALIDAN ANTES DE ESCRIBIR, con core/bloques.js los de texto y con
//    core/estructurados.js los demás. Es el riesgo nº 1 del proyecto
//    (docs/interfaz-web.md §2.3): el PDF solo sale bien si lo guardado es exactamente la forma que
//    espera el generador, y por la API puede entrar cualquier cosa —un tipo de bloque que nadie
//    sabe pintar, una clave de más, un nivel de lista que no existe—. Si un solo campo no pasa, 400
//    con el motivo y NO SE ESCRIBE NADA, ni los campos que sí valían: medio apartado guardado es
//    peor que ninguno, porque nadie sabe qué mitad es la suya.
//
//    Lo que se valida es la ESTRUCTURA, no la redacción: `<section>`, `<p>` o
//    `<?xml version="1.0"?>` dentro de un párrafo son texto y se guardan tal cual, porque son el
//    temario del módulo 0373 y de los de desarrollo web, que están en esta misma programación. Del
//    contenido solo se rechaza la huella de haber pegado desde Word (ver `HUELLAS` en
//    core/bloques.js).
//
// 3. EL CONFLICTO LO RESUELVE EL REPOSITORIO. `esperaUpdatedAt` llega del cliente y se pasa tal
//    cual a `repo.apartados.escribir`, que condiciona la escritura a esa versión y lanza
//    `ErrorConflicto` si no cuadra; aquí solo se traduce a un 409 con `esperado` y `actual`. No se
//    lee-compara-escribe en la ruta a propósito: entre la lectura y la escritura cabe otra
//    petición, y el adaptador de Mongo lo resuelve con una sola operación condicionada. Es lo que
//    impide que dos pestañas sobre el mismo apartado se pisen en silencio, que es el peor fallo
//    posible en una herramienta donde la gente escribe su programación (docs/api.md,
//    «Por qué esperaUpdatedAt»).
//
// 4. QUIEN REESCRIBE UN APARTADO LO DEJA EN `origen: 'modificado'`. Es lo que distingue «lo he
//    mirado» de «lo he reescrito», y lo que el E5 usará para saber qué se ha revisado este curso y
//    qué sigue heredado del anterior (docs/plan.md §2.1). En el prototipo lo hace `guardarBloques`
//    de docs/mockup-v2/js/contenido.js.
//
// POR QUÉ LOS CAMPOS QUE NO VIENEN SE QUEDAN COMO ESTABAN
//
// `valores` se FUNDE con lo guardado, campo a campo; no lo sustituye. Una sección de la PD real
// lleva a la vez un `texto_largo` y una tabla importada que todavía no tiene editor, y un cliente
// que mandara solo el campo que acaba de editar borraría la tabla sin que nadie se enterara hasta
// la exportación. Para vaciar un campo se manda `[]`, que es explícito.
//
// La fila se lee para fundir y luego se escribe condicionada a `esperaUpdatedAt`, así que la carrera
// no existe: si alguien ha escrito entre la lectura y la escritura, la escritura no cuaja y la
// respuesta es un 409.
//
// QUÉ TIPOS DE CAMPO SE GUARDAN POR AQUÍ (Y QUÉ CAMBIÓ EN EL E4)
//
// El E3 solo abrió los campos de texto, con la puerta de `core/bloques.js`. El E4 abre dos más, cada
// uno con la suya en `core/estructurados.js`:
//
//   ponderacion_ra_ce            los pesos de cada RA y de sus criterios
//   ficha_situacion_aprendizaje  las fichas de situación de aprendizaje (84 en la PD de DAW)
//   el repetidor que las agrupa  `{ items: [...] }`, la lista entera
//
// Lo demás —las rejillas importadas, la tabla de RA y CE, la ficha del módulo— sigue rechazándose
// con un 400 que lo dice, y las tablas DERIVADAS (el resumen de situaciones) se rechazan para
// siempre: se calculan al imprimir y guardarlas a mano devolvería las dos versiones que la
// aplicación vino a quitar. Quien decide qué tipo pasa es `core/estructurados.js` y no esta ruta,
// para que el editor del navegador y la API no puedan tener ideas distintas.
//
// DOS COSAS QUE LA RUTA HACE AL GUARDAR, Y QUE NO SON VALIDAR
//
//   · RENUMERA LAS FICHAS de un repetidor por su posición, que es la numeración que imprime el
//     documento, y suelta la tabla importada de las que cambian de número. La numeración se arregla
//     al guardar (ver la nota de `core/sa.js`) y hace falta: 15 de las 78 fichas repetidas de la PD
//     real llegan con un número que no es su posición, una con el 0 —que el resumen del PDF descarta
//     sin decir nada— y seis seguidas llamadas «5».
//   · CONSERVA LAS `filas` DE LAS PONDERACIONES, que no se dejan escribir. De la primera celda de
//     esa tabla importada saca el exportador a Word el código del módulo («Resultado de aprendizaje
//     (0614.1)»), que el modelo no guarda. Así el cliente no tiene que devolverla ni puede
//     estropearla, y el Word exportado no pierde el código.
//
// Las dos operaciones están en `core/estructurados.js` —`renumerarItems` y `conservarFilas`— porque
// son reglas del modelo y la interfaz tiene que poder enseñar lo mismo que se va a guardar.

'use strict';

const C = require('../../../core/permisos');
const Estructurados = require('../../../core/estructurados');
const { listasDeTexto } = require('../../../motor/compartidos');
const {
  conErrores, abrirDocumento, puedeEditarApartado, buscarSeccion, leerJson, raDelModulo,
  fallo, malaPeticion, noEncontrado, SIN_PERMISO,
} = require('./comun');

// Los ids de los textos compartidos a los que apunta este apartado. `listasDeTexto` recorre las
// listas de bloques de texto de unos valores, también las que están dentro de ítems repetidos, que
// es donde el importador deja las referencias.
function refsDe(seccion, valores) {
  const ids = new Set();
  listasDeTexto({ [seccion]: valores || {} }, (lista) => {
    for (const bloque of lista) {
      if (bloque && typeof bloque === 'object' && typeof bloque.ref === 'string') ids.add(bloque.ref);
    }
  });
  return ids;
}

// ---------------------------------------------------------------- la rama que se pide
//
// Lo que el GET y el PATCH tienen que resolver igual: quién pregunta, qué documento, qué sección y
// qué unidad. Está en una función para que no se puedan separar —el fallo que eso provoca es que
// una de las dos acepte una rama que la otra no— y porque el orden de los errores es parte del
// contrato: 401 si no sé quién eres, 404 si el documento o la rama no son de este documento, 400 si
// el enlace está mal construido.
//
// Devuelve { fallo } o { usuario, documento, repo, seccion, unidadId, unidad, info }.
async function abrirApartado(peticion, parametros) {
  const abierto = await abrirDocumento(peticion, parametros);
  if (abierto.fallo) return abierto;
  const { usuario, documento, repo } = abierto;

  const url = new URL(peticion.url);
  const seccion = url.searchParams.get('seccion');
  const unidadId = url.searchParams.get('unidad') || null;

  if (!seccion) return { fallo: malaPeticion('Falta el parámetro «seccion».') };

  const info = buscarSeccion(documento.plantilla, seccion);
  if (!info) return { fallo: noEncontrado(`Este documento no tiene ningún apartado «${seccion}».`) };

  // Pedir un apartado de módulo sin decir de qué módulo, o un apartado común diciendo de qué
  // módulo, es un enlace mal construido. Se dice en voz alta en lugar de devolver un apartado vacío,
  // que es lo que pasaría si se dejara pasar: la misma pantalla que un apartado sin escribir, y
  // nadie entendería por qué sale vacío lo que en el PDF tiene tres párrafos.
  if (info.deUnidad && !unidadId) {
    return { fallo: malaPeticion(`El apartado «${seccion}» es de una unidad: falta el parámetro «unidad».`) };
  }
  if (!info.deUnidad && unidadId) {
    return { fallo: malaPeticion(`El apartado «${seccion}» es común al documento y no admite «unidad».`) };
  }

  let unidad = null;
  if (unidadId) {
    unidad = await repo.unidades.obtener(documento._id, unidadId);
    if (!unidad) return { fallo: noEncontrado(`Este documento no tiene ninguna unidad «${unidadId}».`) };
  }

  return { usuario, documento, repo, seccion, unidadId, unidad, info };
}

// ---------------------------------------------------------------- GET: leer la rama

// Los textos compartidos a los que apunta una rama, y solo esos. Solo si apunta a alguno: la PD real
// tiene 40 textos compartidos y mandarlos todos en cada apartado sería traerse el documento a trozos.
async function compartidosDe(repo, documentoId, seccion, valores) {
  const refs = refsDe(seccion, valores);
  const compartidos = {};
  if (refs.size) {
    for (const c of await repo.compartidos.listar(documentoId)) {
      if (!refs.has(c.cid)) continue;
      compartidos[c.cid] = {
        cid: c.cid, bloque: c.bloque, seccion: c.seccion, comun: c.comun,
        responsable: c.responsable, modo: c.modo, version: c.version,
      };
    }
  }
  return compartidos;
}

// Lo que devuelve el GET de una rama, sea la del documento o la de su curso anterior. Está en una
// función para que las dos respuestas no puedan separarse: el apartado del curso anterior «devuelve
// lo mismo que el apartado normal» (docs/api.md), y el día que una gane un campo la otra también.
function cuerpoRama({ documentoId, seccion, unidadId, info, fila, compartidos, puedeEditar }) {
  return {
    documentoId,
    seccion,
    unidadId,
    titulo: info.seccion.titulo,
    campos: info.campos,
    contenido: info.campos.length > 0,
    repetidor: !!info.seccion.repetidor,
    edita: info.edita,
    puedeEditar,
    existe: !!fila,
    valores: (fila && fila.valores) || {},
    origen: fila ? fila.origen : null,
    // El token de concurrencia: es la versión que el cliente tiene que devolver en el PATCH para
    // que el servidor sepa que no ha escrito nadie por medio (docs/api.md, `esperaUpdatedAt`).
    updatedAt: fila ? fila.updatedAt : null,
    revisadoPor: fila ? fila.revisadoPor : null,
    revisadoEn: fila ? fila.revisadoEn : null,
    compartidos,
  };
}

const GET = conErrores(async (peticion, parametros) => {
  const abierto = await abrirApartado(peticion, parametros);
  if (abierto.fallo) return abierto.fallo;
  const { usuario, documento, repo, seccion, unidadId, unidad, info } = abierto;

  const fila = await repo.apartados.leer(documento._id, seccion, unidadId);
  const cuerpo = cuerpoRama({
    documentoId: documento._id,
    seccion,
    unidadId,
    info,
    fila,
    compartidos: await compartidosDe(repo, documento._id, seccion, (fila && fila.valores) || {}),
    puedeEditar: puedeEditarApartado({
      usuario, documento, unidad, seccion, edita: info.edita, contenido: info.campos.length > 0,
    }),
  });
  return Response.json(cuerpo, { headers: { 'Cache-Control': 'no-store' } });
});

// ---------------------------------------------------------------- GET: el mismo apartado, en el curso anterior
//
// Para que la interfaz pueda enseñar en qué ha cambiado un apartado (docs/plan.md §2.1). Devuelve lo
// mismo que el GET de la rama, del documento al que apunta `anteriorId`, y SOLO LEE: no se puede
// escribir en el curso anterior desde aquí, ni para revisarlo.
//
// NO ES UN 404 CUANDO NO HAY NADA QUE ENSEÑAR. «Este apartado es nuevo» y «no existe» no son lo
// mismo, y quien mira la pantalla tiene que poder distinguirlos: la respuesta sale 200 con
// `existe: false` y un `motivo` que lo dice:
//
//   sin_curso_anterior  el documento no viene de ningún curso (se importó de cero)
//   seccion_nueva       el apartado no está en la plantilla del curso anterior
//   unidad_nueva        el módulo no estaba en el curso anterior
//   sin_contenido       el apartado existía en el curso anterior y estaba vacío
//
// El 404 queda para lo que de verdad no existe: una sección o una unidad que no son de ESTE documento
// (eso lo decide abrirApartado), o un curso anterior que ya no está en la base de datos.
const ANTERIOR = conErrores(async (peticion, parametros) => {
  const abierto = await abrirApartado(peticion, parametros);
  if (abierto.fallo) return abierto.fallo;
  const { usuario, documento, repo, seccion, unidadId, info } = abierto;

  // Un apartado sin nada que enseñar: el de este documento tal cual, con `existe: false` y el motivo.
  const sinDato = (motivo, mensaje, { infoQueMuestra, documentoId, anteriorId, curso }) => Response.json({
    ...cuerpoRama({
      documentoId, seccion, unidadId, info: infoQueMuestra, fila: null, compartidos: {}, puedeEditar: false,
    }),
    anteriorId,
    curso,
    motivo,
    mensaje,
  }, { headers: { 'Cache-Control': 'no-store' } });

  if (!documento.anteriorId) {
    return sinDato(
      'sin_curso_anterior',
      'Este documento no viene de un curso anterior: se creó desde cero, así que no hay nada con que compararlo.',
      { infoQueMuestra: info, documentoId: null, anteriorId: null, curso: null },
    );
  }

  let anterior = null;
  try {
    anterior = await repo.documentos.obtener(documento.anteriorId);
  } catch (e) {
    anterior = null;
  }
  // Se pide a quien puede ver este documento; el anterior es del mismo departamento por construcción
  // (el arrastre no cambia de departamento), así que si no se puede ver es que falta, no que sea
  // ajeno. Se dice así en lugar de un 404 a secas.
  if (!anterior || !C.puedeVer(usuario, anterior)) {
    return fallo(404, 'no_encontrado', 'El curso anterior de este documento ya no está disponible.');
  }
  const cursoAnt = anterior.curso ? `el curso ${anterior.curso}` : 'el curso anterior';
  const datosAnt = { documentoId: anterior._id, anteriorId: anterior._id, curso: anterior.curso || null };

  const infoAnt = buscarSeccion(anterior.plantilla, seccion);
  if (!infoAnt) {
    return sinDato('seccion_nueva', `Este apartado no existía en ${cursoAnt}: es nuevo en este curso.`,
      { infoQueMuestra: info, ...datosAnt });
  }

  if (unidadId) {
    const unidadAnt = await repo.unidades.obtener(anterior._id, unidadId);
    if (!unidadAnt) {
      return sinDato('unidad_nueva', `Este módulo no estaba en ${cursoAnt}: es nuevo en este curso.`,
        { infoQueMuestra: info, ...datosAnt });
    }
  }

  const fila = await repo.apartados.leer(anterior._id, seccion, unidadId);
  if (!fila) {
    return sinDato('sin_contenido', `En ${cursoAnt} este apartado existía, pero estaba vacío.`,
      { infoQueMuestra: infoAnt, ...datosAnt });
  }

  return Response.json({
    ...cuerpoRama({
      documentoId: anterior._id,
      seccion,
      unidadId,
      info: infoAnt,
      fila,
      compartidos: await compartidosDe(repo, anterior._id, seccion, fila.valores || {}),
      puedeEditar: false,
    }),
    anteriorId: anterior._id,
    curso: anterior.curso || null,
    motivo: null,
    mensaje: null,
  }, { headers: { 'Cache-Control': 'no-store' } });
});

// ---------------------------------------------------------------- PATCH: guardar la rama

// La versión con la que el cliente leyó el apartado. Se exige, y no se deja omitir:
//
//   - una cadena ISO, la que devolvió el GET en `updatedAt`;
//   - `null`, que significa «cuando lo leí este apartado no existía».
//
// Omitirla no es «guarda de todas formas». Sin ella el repositorio escribe sin condición y dos
// pestañas se pisan sin que nadie se entere, que es justo lo que este evolutivo tiene que impedir.
// Un cliente al que se le haya olvidado tiene que enterarse con un 400, no quedarse con un control
// de concurrencia apagado.
function versionPedida(cuerpo) {
  const espera = cuerpo.esperaUpdatedAt;
  if (espera === undefined) {
    return { fallo: malaPeticion('Falta «esperaUpdatedAt»: la versión con la que leíste el apartado, o null si no existía. Sin ella dos pestañas se pisarían en silencio.') };
  }
  if (espera === null) return { espera: null };
  if (typeof espera !== 'string' || Number.isNaN(new Date(espera).getTime())) {
    return { fallo: malaPeticion('«esperaUpdatedAt» tiene que ser la fecha que devolvió el GET (una cadena ISO), o null.') };
  }
  return { espera };
}

// Las fechas salen a JSON como cadenas ISO, igual que en el GET.
const iso = (f) => (f ? new Date(f).toISOString() : null);

// Un conflicto de escritura, traducido a la respuesta de docs/api.md: 409 con lo que se esperaba y lo
// que hay. Lo usan las dos escrituras de la rama (guardar y dar por revisado), que tienen que decir
// lo mismo. El código lo pone repositorio/errores.js y es el mismo venga de memoria o de Mongo; se
// mira el código y no la clase porque la ruta no tiene por qué saber qué adaptador hay debajo.
// Devuelve null si el error no es un conflicto, para que quien llama lo relance.
function conflictoDeEscritura(e) {
  if (!e || e.codigo !== 'conflicto') return null;
  return fallo(
    409,
    'conflicto',
    'Alguien ha guardado este apartado desde que lo abriste. No se ha escrito nada: vuelve a cargarlo para no perder su trabajo ni el tuyo.',
    { esperado: iso(e.esperado), actual: iso(e.actual) },
  );
}

// Comprueba los valores contra la plantilla de esta rama. Devuelve { fallo } o {}.
//
// Todo se comprueba ANTES de escribir, y el primer campo que no pasa corta la petición entera. La
// respuesta dice cuál y por qué, en castellano, para que la interfaz pueda señalar el campo en lugar
// de enseñar «error al guardar».
//
// `contexto` lleva lo que las puertas no pueden saber solas: los RA que declara el módulo
// (`raDelModulo` de comun.js), para que una ponderación no pueda apuntar a un RA que no existe.
function revisarValores(valores, { seccion, info, contexto }) {
  if (valores === undefined) {
    return { fallo: malaPeticion('Falta «valores»: los campos que se guardan, en forma { idDeCampo: valor }.') };
  }
  if (!valores || typeof valores !== 'object' || Array.isArray(valores)) {
    return { fallo: malaPeticion('«valores» tiene que ser un objeto con los campos que se guardan, { idDeCampo: valor }.') };
  }

  const entradas = Object.entries(valores);
  if (!entradas.length) {
    return { fallo: malaPeticion('«valores» no trae ningún campo: no hay nada que guardar.') };
  }

  // Un repetidor no es `{ campo: valor }` como los demás apartados: su valor es `{ items: [...] }`,
  // la lista entera (es lo que produce el importador y lo que espera el motor). Se manda completa
  // porque añadir, duplicar, mover y borrar son operaciones sobre la lista: con «añade esta» y
  // «quita esa», dos pestañas acabarían con un orden que no eligió ninguna de las dos. Es el mismo
  // argumento que el del reparto de unidades (docs/api.md).
  if (info.seccion.repetidor) {
    const motivo = Estructurados.motivoItems(valores, info.campos);
    if (motivo) {
      return {
        fallo: fallo(400, 'peticion',
          `El apartado «${seccion}» son fichas de situación de aprendizaje: ${motivo} No se ha guardado nada.`,
          { campo: Estructurados.CAMPO_ITEMS, motivo }),
      };
    }
    return {};
  }

  const campos = new Map((info.campos || []).map((c) => [c.id, c]));

  for (const [id, valor] of entradas) {
    const campo = campos.get(id);
    // Un campo que no está en la plantilla de esta rama no se guarda ni se ignora: se rechaza. Si se
    // ignorara, el cliente creería que ha guardado; si se guardara, el documento llevaría datos que
    // nada sabe pintar y que nadie puede quitar desde la interfaz.
    if (!campo) {
      return { fallo: fallo(400, 'peticion', `El apartado «${seccion}» no tiene ningún campo «${id}». No se ha guardado nada.`, { campo: id }) };
    }
    const motivo = Estructurados.motivoDeCampo(campo, valor, contexto);
    if (motivo) {
      return {
        fallo: fallo(400, 'peticion',
          `El campo «${campo.etiqueta || id}» (tipo «${campo.tipo}») no se puede guardar: ${motivo} No se ha guardado nada.`,
          { campo: id, motivo }),
      };
    }
  }

  return {};
}

// Lo que se escribe a partir de lo que se ha mandado, cuando ya ha pasado la puerta: la numeración
// de las fichas al día y las tablas importadas de las ponderaciones de vuelta en su sitio. Ver la
// cabecera, «dos cosas que la ruta hace al guardar».
function alGuardar(valores, { info, guardados }) {
  if (info.seccion.repetidor) {
    const ficha = (info.campos || []).find((c) => c.tipo === Estructurados.TIPO_FICHA);
    return { items: Estructurados.renumerarItems(valores.items, ficha && ficha.id) };
  }
  const salida = { ...valores };
  for (const campo of (info.campos || [])) {
    if (campo.tipo !== Estructurados.TIPO_PONDERACION) continue;
    if (salida[campo.id] === undefined) continue;
    salida[campo.id] = Estructurados.conservarFilas(salida[campo.id], guardados[campo.id]);
  }
  return salida;
}

// El orden de las comprobaciones importa, porque cada una dice algo distinto (docs/api.md):
//   401  no sé quién eres
//   404  no existe el documento, o es de otro departamento, o la rama no es de este documento
//   400  el enlace está mal construido, o este apartado no se escribe por aquí
//   403  lo ves, pero no puedes editar este apartado
//   400  el cuerpo está mal, o algún valor no pasa la puerta
//   409  alguien lo ha guardado desde que lo leíste
//
// El 403 va antes de leer el cuerpo: a quien no puede editar no se le contesta sobre su contenido.
// Y la negativa de estructura —un nodo que solo agrupa— va antes del 403 porque no depende de quién
// pregunte: ahí no puede escribir nadie, ni el soporte.
const PATCH = conErrores(async (peticion, parametros) => {
  const abierto = await abrirApartado(peticion, parametros);
  if (abierto.fallo) return abierto.fallo;
  const { usuario, documento, repo, seccion, unidadId, unidad, info } = abierto;

  if (!info.campos.length) {
    return malaPeticion(`El apartado «${seccion}» no tiene campos propios: solo agrupa a los de dentro.`);
  }

  if (!puedeEditarApartado({ usuario, documento, unidad, seccion, edita: info.edita, contenido: true })) {
    return SIN_PERMISO('No puedes editar este apartado. Los módulos los escriben sus docentes y la jefatura del departamento; la jefatura de estudios no edita nada.');
  }

  const { fallo: falloCuerpo, cuerpo } = await leerJson(peticion);
  if (falloCuerpo) return falloCuerpo;

  const { fallo: falloVersion, espera } = versionPedida(cuerpo);
  if (falloVersion) return falloVersion;

  // Lo que las puertas no pueden saber solas. En un apartado común no se pasa la lista: «existe en
  // el módulo» no significa nada cuando no hay módulo, y una lista vacía rechazaría cualquier RA.
  const contexto = { raModulo: unidadId ? await raDelModulo(repo, documento, unidadId) : undefined };

  const { fallo: falloValores } = revisarValores(cuerpo.valores, { seccion, info, contexto });
  if (falloValores) return falloValores;

  const fila = await repo.apartados.leer(documento._id, seccion, unidadId);
  const guardados = (fila && fila.valores) || {};
  const valores = { ...guardados, ...alGuardar(cuerpo.valores, { info, guardados }) };

  let guardado;
  try {
    guardado = await repo.apartados.escribir(
      documento._id,
      seccion,
      unidadId,
      // `origen: 'modificado'` va en la misma escritura que los valores: si fuera otra, un apartado
      // podría quedarse reescrito y sin marcar, y el E5 no sabría que alguien lo tocó.
      { valores, origen: 'modificado' },
      { esperaUpdatedAt: espera },
    );
  } catch (e) {
    const conflicto = conflictoDeEscritura(e);
    if (conflicto) return conflicto;
    throw e;
  }

  return Response.json({
    documentoId: documento._id,
    seccion,
    unidadId,
    titulo: info.seccion.titulo,
    existe: true,
    valores: guardado.valores,
    origen: guardado.origen,
    // La versión nueva: es lo que el cliente tiene que devolver en el guardado siguiente.
    updatedAt: guardado.updatedAt,
    revisadoPor: guardado.revisadoPor,
    revisadoEn: guardado.revisadoEn,
    puedeEditar: true,
  }, { headers: { 'Cache-Control': 'no-store' } });
});

// ---------------------------------------------------------------- POST: dar la rama por revisada
//
// Pasa su `origen` a `revisado` y deja quién y cuándo (docs/plan.md §2.1). No toca `valores`: revisar
// es mirar, no escribir, y un apartado revisado con su texto cambiado sería justo lo que `modificado`
// existe para decir.
//
// QUIÉN PUEDE: quien puede EDITAR la rama, con la misma regla del PATCH (`puedeEditarApartado`). Dar
// por bueno lo que no puedes escribir no tiene sentido: el docente da por revisado su módulo y no el
// común de la jefatura, y la jefatura de estudios no revisa nada, igual que no edita nada.
//
// POR QUÉ PIDE `esperaUpdatedAt`: revisar un texto que alguien acaba de cambiar sería dar por bueno
// algo que quien revisa no ha leído. Por eso lleva la misma versión que el PATCH, y si no cuadra, 409:
// que vuelva a leer y revise lo que hay ahora.
//
// Y SI SE EDITA DESPUÉS, lo decide el PATCH: pone `origen: 'modificado'`. Revisar y luego editar deja
// `modificado`, nunca `revisado` con texto que nadie ha mirado.
const REVISAR = conErrores(async (peticion, parametros) => {
  const abierto = await abrirApartado(peticion, parametros);
  if (abierto.fallo) return abierto.fallo;
  const { usuario, documento, repo, seccion, unidadId, unidad, info } = abierto;

  if (!info.campos.length) {
    return malaPeticion(`El apartado «${seccion}» no tiene campos propios: solo agrupa a los de dentro, y no hay nada que dar por revisado.`);
  }

  if (!puedeEditarApartado({ usuario, documento, unidad, seccion, edita: info.edita, contenido: true })) {
    return SIN_PERMISO('Solo quien puede editar este apartado puede darlo por revisado. Los módulos los revisan sus docentes y la jefatura del departamento; la jefatura de estudios no revisa nada.');
  }

  const { fallo: falloCuerpo, cuerpo } = await leerJson(peticion);
  if (falloCuerpo) return falloCuerpo;

  const { fallo: falloVersion, espera } = versionPedida(cuerpo);
  if (falloVersion) return falloVersion;

  let guardado;
  try {
    guardado = await repo.apartados.escribir(
      documento._id,
      seccion,
      unidadId,
      { origen: 'revisado', revisadoPor: C.idDeUsuario(usuario), revisadoEn: new Date() },
      { esperaUpdatedAt: espera },
    );
  } catch (e) {
    const conflicto = conflictoDeEscritura(e);
    if (conflicto) return conflicto;
    throw e;
  }

  return Response.json({
    documentoId: documento._id,
    seccion,
    unidadId,
    titulo: info.seccion.titulo,
    existe: true,
    valores: guardado.valores,
    origen: guardado.origen,
    updatedAt: guardado.updatedAt,
    revisadoPor: guardado.revisadoPor,
    revisadoEn: guardado.revisadoEn,
    puedeEditar: true,
  }, { headers: { 'Cache-Control': 'no-store' } });
});

module.exports = { GET, PATCH, ANTERIOR, REVISAR };
