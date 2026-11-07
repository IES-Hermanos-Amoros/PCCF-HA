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
// 2. LOS VALORES SE VALIDAN ANTES DE ESCRIBIR, con core/bloques.js. Es el riesgo nº 1 del proyecto
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
// POR QUÉ EN EL E3 SOLO SE GUARDAN LOS CAMPOS DE TEXTO
//
// `core/bloques.js` sabe decir si una lista de bloques es exactamente lo que el generador espera.
// Las ponderaciones de RA y CE, las fichas de situación de aprendizaje y las rejillas importadas
// tienen cada una su forma y su editor, y llegan en el E4 con su propia validación. Hasta entonces
// esta ruta los rechaza con un 400 que lo dice, en lugar de aceptarlos sin comprobar nada: un campo
// que entra sin puerta es un documento que deja de salir.

'use strict';

const Bloques = require('../../../core/bloques');
const { listasDeTexto } = require('../../../motor/compartidos');
const {
  conErrores, abrirDocumento, puedeEditarApartado, buscarSeccion, leerJson,
  fallo, malaPeticion, noEncontrado, SIN_PERMISO,
} = require('./comun');

// El tipo de campo que guarda bloques de texto: el que edita el editor del E3.
const TEXTO = 'texto_largo';

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

const GET = conErrores(async (peticion, parametros) => {
  const abierto = await abrirApartado(peticion, parametros);
  if (abierto.fallo) return abierto.fallo;
  const { usuario, documento, repo, seccion, unidadId, unidad, info } = abierto;

  const fila = await repo.apartados.leer(documento._id, seccion, unidadId);
  const valores = (fila && fila.valores) || {};

  // Solo los compartidos a los que apunta este apartado, y solo si apunta a alguno: la PD real tiene
  // 40 textos compartidos y mandarlos todos en cada apartado sería traerse el documento a trozos.
  const refs = refsDe(seccion, valores);
  const compartidos = {};
  if (refs.size) {
    for (const c of await repo.compartidos.listar(documento._id)) {
      if (!refs.has(c.cid)) continue;
      compartidos[c.cid] = {
        cid: c.cid, bloque: c.bloque, seccion: c.seccion, comun: c.comun,
        responsable: c.responsable, modo: c.modo, version: c.version,
      };
    }
  }

  return Response.json({
    documentoId: documento._id,
    seccion,
    unidadId,
    titulo: info.seccion.titulo,
    campos: info.campos,
    contenido: info.campos.length > 0,
    repetidor: !!info.seccion.repetidor,
    edita: info.edita,
    puedeEditar: puedeEditarApartado({
      usuario, documento, unidad, seccion, edita: info.edita, contenido: info.campos.length > 0,
    }),
    existe: !!fila,
    valores,
    origen: fila ? fila.origen : null,
    // El token de concurrencia: es la versión que el cliente tiene que devolver en el PATCH para
    // que el servidor sepa que no ha escrito nadie por medio (docs/api.md, `esperaUpdatedAt`).
    updatedAt: fila ? fila.updatedAt : null,
    revisadoPor: fila ? fila.revisadoPor : null,
    revisadoEn: fila ? fila.revisadoEn : null,
    compartidos,
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

// Comprueba los valores contra la plantilla de esta rama. Devuelve { fallo } o {}.
//
// Todo se comprueba ANTES de escribir, y el primer campo que no pasa corta la petición entera. La
// respuesta dice cuál y por qué, en castellano, para que la interfaz pueda señalar el campo en lugar
// de enseñar «error al guardar».
function revisarValores(valores, { seccion, info }) {
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

  const campos = new Map((info.campos || []).map((c) => [c.id, c]));

  for (const [id, valor] of entradas) {
    const campo = campos.get(id);
    // Un campo que no está en la plantilla de esta rama no se guarda ni se ignora: se rechaza. Si se
    // ignorara, el cliente creería que ha guardado; si se guardara, el documento llevaría datos que
    // nada sabe pintar y que nadie puede quitar desde la interfaz.
    if (!campo) {
      return { fallo: fallo(400, 'peticion', `El apartado «${seccion}» no tiene ningún campo «${id}». No se ha guardado nada.`, { campo: id }) };
    }
    if (campo.tipo !== TEXTO) {
      return { fallo: fallo(400, 'peticion', `El campo «${campo.etiqueta || id}» es de tipo «${campo.tipo}» y todavía no se guarda por aquí: esta ruta guarda los campos de texto. No se ha guardado nada.`, { campo: id }) };
    }
    const motivo = Bloques.motivoAlGuardar(valor);
    if (motivo) {
      return {
        fallo: fallo(400, 'peticion',
          `El campo «${campo.etiqueta || id}» no se puede guardar: ${motivo} No se ha guardado nada.`,
          { campo: id, motivo }),
      };
    }
  }

  return {};
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
// Y las dos negativas de estructura —un nodo que solo agrupa, un repetidor— van antes del 403
// porque no dependen de quién pregunte: ahí no puede escribir nadie, ni el soporte.
const PATCH = conErrores(async (peticion, parametros) => {
  const abierto = await abrirApartado(peticion, parametros);
  if (abierto.fallo) return abierto.fallo;
  const { usuario, documento, repo, seccion, unidadId, unidad, info } = abierto;

  if (!info.campos.length) {
    return malaPeticion(`El apartado «${seccion}» no tiene campos propios: solo agrupa a los de dentro.`);
  }
  // Los ítems repetidos (las situaciones de aprendizaje) no son `{ campo: valor }`, son
  // `{ items: [...] }`, y se crean, duplican, mueven y borran: eso es el E4, con core/sa.js.
  if (info.seccion.repetidor) {
    return malaPeticion(`El apartado «${seccion}» son fichas que se añaden y se ordenan, y todavía no se guardan por aquí.`);
  }

  if (!puedeEditarApartado({ usuario, documento, unidad, seccion, edita: info.edita, contenido: true })) {
    return SIN_PERMISO('No puedes editar este apartado. Los módulos los escriben sus docentes y la jefatura del departamento; la jefatura de estudios no edita nada.');
  }

  const { fallo: falloCuerpo, cuerpo } = await leerJson(peticion);
  if (falloCuerpo) return falloCuerpo;

  const { fallo: falloVersion, espera } = versionPedida(cuerpo);
  if (falloVersion) return falloVersion;

  const { fallo: falloValores } = revisarValores(cuerpo.valores, { seccion, info });
  if (falloValores) return falloValores;

  const fila = await repo.apartados.leer(documento._id, seccion, unidadId);
  const valores = { ...((fila && fila.valores) || {}), ...cuerpo.valores };

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
    // El código lo pone repositorio/errores.js y es el mismo venga de memoria o de Mongo. Se mira el
    // código y no la clase porque la ruta no tiene por qué saber qué adaptador hay debajo.
    if (e && e.codigo === 'conflicto') {
      return fallo(
        409,
        'conflicto',
        'Alguien ha guardado este apartado desde que lo abriste. No se ha escrito nada: vuelve a cargarlo para no perder su trabajo ni el tuyo.',
        { esperado: iso(e.esperado), actual: iso(e.actual) },
      );
    }
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

module.exports = { GET, PATCH };
