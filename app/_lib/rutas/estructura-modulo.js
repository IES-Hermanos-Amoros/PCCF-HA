// La ESTRUCTURA PROPIA de un módulo: qué campos lleva cada apartado en ESTE módulo sin cambiárselo a los
// otros diez (core/estructura-modulo.js; el porqué, en docs/estructura-por-modulo.md).
//
//   GET /api/documentos/[id]/unidades/[unidad]/estructura[?seccion=]   la estructura de ese módulo
//   PUT /api/documentos/[id]/unidades/[unidad]/estructura              la guarda entera
//
// POR QUÉ ES UN PUT DE LA ESTRUCTURA ENTERA Y NO UNA RUTA POR OPERACIÓN
//
// Las rutas de la estructura común (estructura.js) son una por cambio porque cada una pide una operación
// a core/plantilla.js. Aquí no hay operaciones en el núcleo: lo que existe es la FORMA (`unidad.estructura`)
// y su puerta (`motivoDeEstructura`), que mira la estructura entera. Un PUT del objeto completo hace que lo
// que se guarda sea exactamente lo que la puerta ha mirado, sin una segunda lógica que construya la
// estructura nueva a partir de un cambio y pueda diverger de ella. Cuando el núcleo tenga operaciones, la
// pantalla las compondrá y mandará el resultado por aquí. `estructura: null` quita la estructura propia y
// el módulo vuelve a la común (la clave no se deja vacía: una estructura sin desvíos no vale).
//
// Cuerpo: `{ estructura, esperaUpdatedAt?, esperaPlantillaVersion? }`.
//
// LOS APARTADOS PROPIOS DEL MÓDULO. Un apartado que el módulo ha añadido no está en la plantilla común, y
// sus casillas viven en su propio `anadido` (`campos`), no en `secciones`. El `GET ?seccion=` lo
// resuelve con la misma regla del núcleo que lo pinta (`apartadosDeModulo`) y lo trata como lo que es, un
// apartado de módulo: lo configura quien lleva el módulo y su alcance es solo este módulo. En el PUT, el
// id del apartado entra en `cambiadas` porque su `anadido` cambia, y se decide por él como por cualquier
// otro apartado de módulo.
//
// EL ORDEN DE LAS RESPUESTAS (docs/api.md)
//
//   401  no sé quién eres
//   404  no ves el documento, o no tiene esa unidad, o el cuerpo nombra un apartado que no tiene
//   403  lo ves y no puedes configurar ALGUNO de los apartados que cambias (`reglaEstructuraPropia`)
//   400  cuerpo mal formado, o la puerta (`motivoDeEstructura`) lo rechaza: el motivo, tal cual
//   409  alguien ha cambiado el documento o su plantilla desde que lo leíste, o es una versión alternativa
//
// QUIÉN PUEDE: LA REGLA DE core/permisos.js, apartado a apartado. Los booleanos que la regla espera
// (`edita`, `esDocenteDeLaUnidad`, `tieneApartadoAsignado`) se resuelven AQUÍ, en el servidor, con la misma
// búsqueda que usa `reglaEdicion` (`booleanosDeApartado`): el cliente no manda ni uno. Se mira cada apartado
// cuyo desvío CAMBIA —los que la petición reenvía tal cual no cuentan—, y basta uno sin permiso para que no
// se escriba nada: una estructura a medias es peor que ninguna.
//
// EL ALCANCE SE DICE, NO SE IMPIDE. Reformar un apartado de módulo cambia solo ese módulo. Reformar uno
// COMÚN cambia el documento entero. La respuesta —también la del 400, y el GET con `?seccion=` para
// preguntarlo antes de guardar— lleva `alcance` por apartado: a cuántos módulos y a quién afecta, más un
// `mensaje` que la pantalla puede enseñar tal cual. Hoy la puerta del núcleo todavía rechaza los apartados
// comunes (el motivo sale en el 400, con su alcance); cuando deje de hacerlo, esta ruta no cambia.
//
// EL 409 ES EL DE SIEMPRE. La escritura de la estructura va precedida de una escritura CONDICIONADA al
// `updatedAt` del documento (`esperaUpdatedAt`, el que mande el cliente o, si no manda ninguno, el que se
// leyó al empezar): la unidad no lleva token propio y el documento sí, así que esa escritura es lo que hace
// atómico el «lee, valida, escribe». Mueve el token del documento. `esperaPlantillaVersion` es el aviso
// temprano, como en estructura.js: la plantilla es contra lo que se ha validado.
//
// UNA VERSIÓN ALTERNATIVA SOLO SE LEE: el corte lo hace `abrirDocumento` (comun.js) para todo lo que no
// sea GET, y esta ruta no pide `permiteAlternativa`.
//
// Es CommonJS y no sabe que está dentro de Next (docs/api.md, primera regla de forma).

'use strict';

const C = require('../../../core/permisos');
const EstructuraModulo = require('../../../core/estructura-modulo');
const { alcanceDe } = require('./alcance');
const {
  conErrores, abrirDocumento, leerJson, buscarSeccion, booleanosDeApartado,
  fallo, malaPeticion, noEncontrado, SIN_PERMISO,
} = require('./comun');

const esObjeto = (x) => !!x && typeof x === 'object' && !Array.isArray(x);

// Dos desvíos son el mismo aunque las claves lleguen en otro orden.
function canonico(x) {
  if (Array.isArray(x)) return x.map(canonico);
  if (esObjeto(x)) return Object.keys(x).sort().reduce((o, k) => { o[k] = canonico(x[k]); return o; }, {});
  return x;
}
const igual = (a, b) => JSON.stringify(canonico(a === undefined ? null : a)) === JSON.stringify(canonico(b === undefined ? null : b));

const seccionesDe = (estructura) => (esObjeto(estructura) && esObjeto(estructura.secciones) ? estructura.secciones : {});

const apartadosDe = (estructura) => (esObjeto(estructura) && esObjeto(estructura.apartados) ? estructura.apartados : {});

// Los apartados a los que afecta un cambio en `apartados`, que es el desvío de los apartados ENTEROS
// —retirar uno, renombrarlo, moverlo, añadir uno propio—. Cada clave se traduce al apartado por el que
// se decide el permiso, y el criterio es que ese apartado exista o lo sepa tratar el bucle de abajo:
//
//   `cambios`   la clave es un apartado común de módulo: se decide por él.
//   `anadidos`  el id del apartado propio del módulo. NO se añade su padre, aunque las rutas de la
//               plantilla sí decidan por el padre al añadir: allí el cambio toca la definición común y
//               aquí solo toca ESTE módulo, así que quien decide es quien lleva el módulo. El bucle
//               trata un id que no está en la plantilla como apartado de módulo, que es lo que es.
//   `orden`     los hijos QUE SE HAN MOVIDO, no el padre. Si se decidiera por el padre, reordenar los
//               apartados de primer nivel preguntaría por el bloque de unidades, que no es un apartado
//               que nadie edite, y una reordenación legítima acabaría en 403.
function apartadosDelDesvio(actual, nueva) {
  const a = apartadosDe(actual);
  const b = apartadosDe(nueva);
  const ids = new Set();

  const mapa = (x) => (esObjeto(x) ? x : {});
  const camA = mapa(a.cambios);
  const camB = mapa(b.cambios);
  for (const id of new Set([...Object.keys(camA), ...Object.keys(camB)])) {
    if (!igual(camA[id], camB[id])) ids.add(id);
  }

  const porId = (lista) => new Map((Array.isArray(lista) ? lista : [])
    .filter((x) => esObjeto(x) && typeof x.id === 'string' && x.id)
    .map((x) => [x.id, x]));
  const anaA = porId(a.anadidos);
  const anaB = porId(b.anadidos);
  for (const id of new Set([...anaA.keys(), ...anaB.keys()])) {
    if (!igual(anaA.get(id), anaB.get(id))) ids.add(id);
  }

  const ordA = mapa(a.orden);
  const ordB = mapa(b.orden);
  for (const padre of new Set([...Object.keys(ordA), ...Object.keys(ordB)])) {
    const antes = Array.isArray(ordA[padre]) ? ordA[padre] : [];
    const despues = Array.isArray(ordB[padre]) ? ordB[padre] : [];
    if (igual(antes, despues)) continue;
    for (const id of new Set([...antes, ...despues])) {
      if (typeof id !== 'string' || !id) continue;
      if (antes.indexOf(id) !== despues.indexOf(id)) ids.add(id);
    }
  }

  return [...ids];
}

// Los apartados cuyo desvío cambia entre la estructura que hay y la que se pide, por los campos de un
// apartado (`secciones`) o por los apartados enteros (`apartados`). Si esto se queda corto, un cambio
// se da por «no hay nada que cambiar» y además NO pasa por la comprobación de permiso de su apartado:
// las dos averías salen de la misma línea, así que las dos mitades se cuentan aquí.
function apartadosCambiados(actual, nueva) {
  const antes = seccionesDe(actual);
  const despues = seccionesDe(nueva);
  const ids = new Set([...Object.keys(antes), ...Object.keys(despues)]
    .filter((id) => !igual(antes[id], despues[id])));
  for (const id of apartadosDelDesvio(actual, nueva)) ids.add(id);
  return [...ids];
}

// El alcance (a cuántos módulos y a quién afecta) lo calcula app/_lib/rutas/alcance.js, el mismo que dice
// el de las rutas de la plantilla común (estructura.js).

// ---------------------------------------------------------------- lo que comparten GET y PUT

// Devuelve { fallo } o { usuario, documento, repo, unidad, unidadId }.
async function abrir(peticion, parametros) {
  const abierto = await abrirDocumento(peticion, parametros);
  if (abierto.fallo) return abierto;
  const unidadId = parametros && parametros.unidad;
  let unidad = null;
  try {
    unidad = await abierto.repo.unidades.obtener(abierto.documento._id, unidadId);
  } catch (e) {
    unidad = null;
  }
  if (!unidad) return { fallo: noEncontrado(`Este documento no tiene ninguna unidad «${unidadId}».`) };
  return { ...abierto, unidad, unidadId: unidad.unidadId };
}

// ¿Puede este usuario configurar este apartado en esta unidad? Toda la decisión es `reglaEstructuraPropia`;
// aquí solo se le dan los booleanos resueltos.
function puedeConfigurar({ usuario, documento, unidad, seccion, info }) {
  if (!C.puedeVer(usuario, documento)) return false;
  return C.reglaEstructuraPropia(usuario, booleanosDeApartado({ usuario, documento, unidad, seccion, edita: info.edita }));
}

// ---------------------------------------------------------------- un apartado PROPIO del módulo

// Un apartado que el módulo ha añadido no está en la plantilla común, así que `buscarSeccion` no lo
// encuentra. Se busca donde lo resuelve la regla del núcleo (`apartadosDeModulo`, que lo marca `propio`)
// y se le da la forma que `buscarSeccion` da a un apartado de módulo: lo edita quien lleva el módulo, y es
// de una unidad, que es lo que dice que su alcance es este módulo y no el documento. La regla de quién
// puede es la de siempre (`reglaEstructuraPropia`); aquí no se copia.
function apartadoPropio(documento, unidad, idSeccion) {
  let hallado = null;
  (function bajar(lista) {
    for (const s of lista) {
      if (hallado || !esObjeto(s)) continue;
      if (s.propio === true && s.id === idSeccion) { hallado = s; return; }
      bajar(Array.isArray(s.hijos) ? s.hijos : []);
    }
  })(EstructuraModulo.apartadosDeModulo(documento.plantilla, unidad).secciones);
  if (!hallado) return null;
  return {
    seccion: hallado,
    edita: 'docentes_del_modulo',
    deUnidad: true,
    campos: Array.isArray(hallado.campos) ? hallado.campos : [],
  };
}

// El apartado por su id: de la plantilla común, o uno propio de este módulo.
const buscarApartado = (documento, unidad, id) => buscarSeccion(documento.plantilla, id) || apartadoPropio(documento, unidad, id);

// ---------------------------------------------------------------- GET

const GET = conErrores(async (peticion, parametros) => {
  const abierto = await abrir(peticion, parametros);
  if (abierto.fallo) return abierto.fallo;
  const { usuario, documento, repo, unidad, unidadId } = abierto;

  const cuerpo = {
    documentoId: documento._id,
    unidadId,
    estructura: EstructuraModulo.estructuraDeModulo(unidad),
    plantillaVersion: Number(documento.plantillaVersion) || 1,
    updatedAt: documento.updatedAt,
  };

  // Con `?seccion=`: puede o no puede, y el alcance de reformarlo. Es lo que la pantalla pregunta antes
  // de abrir el editor de campos, para avisar si es un apartado común.
  const seccion = new URL(peticion.url).searchParams.get('seccion');
  if (seccion) {
    const info = buscarApartado(documento, unidad, seccion);
    if (!info) return noEncontrado(`Este documento no tiene ningún apartado «${seccion}».`);
    cuerpo.seccion = seccion;
    cuerpo.puedeCambiar = puedeConfigurar({ usuario, documento, unidad, seccion, info });
    cuerpo.alcance = await alcanceDe({ repo, documento, unidad, seccion, info });
  }
  return Response.json(cuerpo, { headers: { 'Cache-Control': 'no-store' } });
});

// ---------------------------------------------------------------- PUT

const PUT = conErrores(async (peticion, parametros) => {
  const abierto = await abrir(peticion, parametros);
  if (abierto.fallo) return abierto.fallo;
  const { usuario, documento, repo, unidad, unidadId } = abierto;

  const { fallo: falloCuerpo, cuerpo } = await leerJson(peticion);
  if (falloCuerpo) return falloCuerpo;

  if (!('estructura' in cuerpo)) {
    return malaPeticion('Falta «estructura»: la estructura entera del módulo, o null para volver a la común.');
  }
  const nueva = cuerpo.estructura;
  if (nueva !== null && !esObjeto(nueva)) {
    return malaPeticion('«estructura» tiene que ser un objeto { secciones } o null.');
  }

  // Los apartados que cambian tienen que existir (404, como en estructura.js) y se pueden configurar (403).
  // Uno que ya no está en la plantilla y solo se está QUITANDO de la estructura es un resto: lo limpia quien
  // lleva el módulo, que es de quien es la estructura.
  const cambiados = apartadosCambiados(unidad.estructura, nueva);
  const alcances = [];
  const enNueva = seccionesDe(nueva);
  for (const seccion of cambiados) {
    const info = buscarSeccion(documento.plantilla, seccion);
    if (!info) {
      if (Object.prototype.hasOwnProperty.call(enNueva, seccion)) {
        return noEncontrado(`Este documento no tiene ningún apartado «${seccion}».`);
      }
      // O un apartado propio del módulo (sus casillas y su retirada viven en su `anadido`, no en la
      // plantilla) o un resto que se está quitando. Los dos los decide quien lleva el módulo.
      const propio = Array.isArray(apartadosDe(nueva).anadidos)
        ? apartadosDe(nueva).anadidos.find((x) => esObjeto(x) && x.id === seccion) : null;
      const resto = { seccion: { titulo: (propio && propio.titulo) || seccion }, edita: 'docentes_del_modulo', deUnidad: true, campos: [] };
      if (!puedeConfigurar({ usuario, documento, unidad, seccion, info: resto })) {
        return SIN_PERMISO('No puedes cambiar la estructura de este módulo.');
      }
      // Un apartado propio también dice su alcance: este módulo y ninguno más.
      if (propio) alcances.push(await alcanceDe({ repo, documento, unidad, seccion, info: resto }));
      continue;
    }
    const alcance = await alcanceDe({ repo, documento, unidad, seccion, info });
    alcances.push(alcance);
    if (!puedeConfigurar({ usuario, documento, unidad, seccion, info })) {
      return SIN_PERMISO(info.deUnidad
        ? `No puedes configurar «${alcance.titulo}» en este módulo: solo quien lo lleva y la jefatura del departamento.`
        : `No puedes configurar «${alcance.titulo}»: es un apartado común y solo lo configura quien lo tiene asignado y la jefatura del departamento.`);
    }
  }

  if (nueva !== null && !cambiados.length) {
    return malaPeticion('Esa estructura es la que ya tiene el módulo: no hay nada que cambiar.');
  }
  if (nueva === null && unidad.estructura == null) {
    return malaPeticion('Este módulo ya sigue la estructura común: no hay nada que quitar.');
  }

  // La versión de la plantilla con que se leyó: es contra ella contra lo que se valida.
  const actual = Number(documento.plantillaVersion) || 1;
  const espera = cuerpo.esperaPlantillaVersion;
  if (espera !== undefined && espera !== null) {
    if (typeof espera !== 'number' || !Number.isInteger(espera)) {
      return malaPeticion('«esperaPlantillaVersion» tiene que ser la versión de la plantilla que devolvió la lectura, un número entero.');
    }
    if (espera !== actual) {
      return fallo(
        409, 'conflicto',
        'Alguien ha cambiado la estructura de este documento desde que la leíste. No se ha cambiado nada: vuelve a cargarla para no deshacer su cambio.',
        { esperado: espera, actual },
      );
    }
  }
  let ficha = documento.updatedAt;
  if (cuerpo.esperaUpdatedAt !== undefined && cuerpo.esperaUpdatedAt !== null) {
    const fecha = new Date(cuerpo.esperaUpdatedAt);
    if (typeof cuerpo.esperaUpdatedAt !== 'string' || Number.isNaN(fecha.getTime())) {
      return malaPeticion('«esperaUpdatedAt» tiene que ser el `updatedAt` que devolvió la lectura.');
    }
    ficha = cuerpo.esperaUpdatedAt;
  }

  // LA PUERTA. El motivo se devuelve tal cual: está escrito para que lo lea una persona.
  if (nueva !== null) {
    const motivo = EstructuraModulo.motivoDeEstructura(nueva, documento.plantilla);
    if (motivo) {
      return fallo(400, 'peticion', `${motivo[0].toUpperCase()}${motivo.slice(1)} No se ha cambiado nada.`, { motivo, alcance: alcances });
    }
  }

  // LAS CASILLAS NO DESAPARECEN. Contra lo que ya hay guardado, que la puerta de arriba no ve: una lista a la
  // que le falta una casilla dejaría huérfano lo escrito bajo su id. Se quita retirándola, no omitiéndola.
  // Solo se compara si el token es el vigente: con uno viejo, `unidad.estructura` ya no es lo que el cliente
  // tenía delante y el que contesta es el 409 de la escritura, que es el que le dice que recargue.
  const tokenVigente = new Date(ficha).getTime() === new Date(documento.updatedAt).getTime();
  if (nueva !== null && tokenVigente) {
    const perdida = EstructuraModulo.motivoDeCasillasPerdidas(unidad.estructura, nueva);
    if (perdida) {
      const motivo = perdida;
      return fallo(400, 'peticion', `${motivo[0].toUpperCase()}${motivo.slice(1)} No se ha cambiado nada.`, { motivo, alcance: alcances });
    }
  }

  // La escritura que decide: condicionada al token del documento. Si alguien lo ha movido, 409.
  let ahora = null;
  try {
    ahora = await repo.documentos.actualizar(documento._id, {}, { esperaUpdatedAt: ficha });
  } catch (e) {
    if (!e || e.codigo !== 'conflicto') throw e;
    return fallo(
      409, 'conflicto',
      'Alguien ha cambiado este documento mientras cambiabas la estructura del módulo. No se ha cambiado nada: vuelve a cargarla para no deshacer su cambio.',
      { esperado: ficha, actual: e.actual === undefined ? null : e.actual },
    );
  }

  const guardada = await repo.unidades.actualizar(documento._id, unidadId, { estructura: nueva });
  // Un repositorio que no conoce el campo lo descarta sin avisar (pasa con el servidor de desarrollo si
  // no se reinició tras añadir `estructura` a repositorio/index.js). Un 200 que no ha guardado nada es
  // lo peor que puede contestar esta ruta.
  if (nueva !== null && !(guardada && esObjeto(guardada.estructura))) {
    return fallo(500, 'error_interno', 'La estructura no se ha guardado: el repositorio no la ha devuelto. Si acabas de actualizar la aplicación, reinicia el servidor.');
  }

  return Response.json({
    documentoId: documento._id,
    unidadId,
    estructura: EstructuraModulo.estructuraDeModulo(guardada),
    plantillaVersion: actual,
    updatedAt: ahora ? ahora.updatedAt : null,
    cambiadas: cambiados,
    // Si algún apartado cambiado es común, `afectaAlDocumento` lo dice sin tener que recorrer `alcance`.
    afectaAlDocumento: alcances.some((a) => a.comun),
    alcance: alcances,
  }, { headers: { 'Cache-Control': 'no-store' } });
});

module.exports = { GET, PUT };
