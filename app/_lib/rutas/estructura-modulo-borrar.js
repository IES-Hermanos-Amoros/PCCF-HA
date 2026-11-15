// BORRAR PARA SIEMPRE un apartado propio o una casilla propia de UN módulo: lo que ya se retiró y ahora
// se destruye de verdad, con su contenido.
//
//   DELETE /api/documentos/[id]/unidades/[unidad]/estructura/apartado?seccion=
//   DELETE /api/documentos/[id]/unidades/[unidad]/estructura/campo?seccion=&campo=
//
// Es el borrado de la plantilla común (estructura.js, «BORRAR») llevado a un módulo, con una diferencia
// que lo cambia todo: aquí lo que se destruye es de UNA unidad. El id de una casilla propia (`m_…`) lo
// acuña cada módulo con SUS ids ocupados, así que dos módulos pueden tener la misma `m_observaciones` en
// el mismo apartado común, cada una con su contenido. Por eso el borrado va acotado por `unidadId`
// (perdida-de-modulo.js) y por eso esta ruta no se parece a la común más que en las reglas.
//
// LAS REGLAS, las de la plantilla común:
//
//   · SOLO SE BORRA LO QUE YA ESTÁ RETIRADO (`retirado: true` en su entrada de `anadidos`). Retirar y
//     borrar son dos actos deliberados y separados en el tiempo. Uno que no lo está es un 400 que dice
//     que primero hay que retirarlo.
//   · SOLO SE BORRA LO PROPIO del módulo. Un apartado o una casilla de la plantilla común se borran por
//     las rutas de estructura.js, y su alcance es el documento entero. Aquí es un 400 que dice por dónde.
//   · LA CONFIRMACIÓN LA PIDE EL SERVIDOR: el cuerpo trae `{ confirmar: true }`. Sin él, 400, y el
//     mensaje dice cuánto se pierde (`fraseDeLaPerdida`). Un DELETE puede llegar sin cuerpo.
//   · UN APARTADO SE VA CON SU SUBÁRBOL. Se quita de la estructura el apartado y los que cuelgan de él, y
//     `loQueSePierde` cuenta lo que desaparece: es el mismo cálculo que avisa y que destruye.
//   · EL CONTENIDO SE DESTRUYE DESPUÉS de guardar la estructura (`destruirLaPerdida` explica por qué).
//     Si falla, la respuesta sigue siendo 200 con `contenidoSinDestruir`.
//   · SIN DESVÍOS, `estructura: null`: una estructura sin desvíos no vale, y el módulo vuelve a la común.
//
// EL ORDEN DE LAS RESPUESTAS (docs/api.md)
//
//   401  no sé quién eres
//   404  no ves el documento, o no tiene esa unidad, o no tiene ese apartado o casilla en este módulo
//   403  lo ves y no puedes configurar ese apartado (`reglaEstructuraPropia`)
//   400  es común, no está retirado, falta la confirmación, o la puerta rechaza la estructura que queda
//   409  alguien ha cambiado el documento desde que lo leíste, o es una versión alternativa
//
// El 400 de la confirmación va después de saber quién pregunta y si puede, y antes de destruir nada.
// Una versión alternativa solo se lee: el corte lo hace `abrirDocumento` para todo lo que no sea GET.
//
// Es CommonJS y no sabe que está dentro de Next (docs/api.md, primera regla de forma).

'use strict';

const C = require('../../../core/permisos');
const EstructuraModulo = require('../../../core/estructura-modulo');
const { contenidoDeLaPerdida, fraseDeLaPerdida, destruirLaPerdida } = require('./perdida-de-modulo');
const {
  conErrores, abrirDocumento, buscarSeccion, booleanosDeApartado,
  fallo, malaPeticion, noEncontrado, SIN_PERMISO,
} = require('./comun');

const esObjeto = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const lista = (x) => (Array.isArray(x) ? x : []);
const conId = (x, id) => esObjeto(x) && x.id === id;

// ---------------------------------------------------------------- lo que comparten las dos rutas

// El cuerpo de un DELETE: puede no venir, y si viene tiene que ser un objeto JSON.
async function leerCuerpoOpcional(peticion) {
  const crudo = await peticion.text();
  if (!crudo.trim()) return { cuerpo: {} };
  let cuerpo;
  try {
    cuerpo = JSON.parse(crudo);
  } catch (e) {
    return { fallo: malaPeticion('El cuerpo de la petición, si va, tiene que ser JSON.') };
  }
  if (!esObjeto(cuerpo)) return { fallo: malaPeticion('El cuerpo de la petición, si va, tiene que ser un objeto JSON.') };
  return { cuerpo };
}

// El aviso nombra LO QUE SE BORRA y, detrás de dos puntos, lo que se va. En una sola frase con el
// sujeto delante («borrar un apartado con sus subapartados y todo lo escrito en él no se puede
// deshacer y se perdería…») el verbo queda tan lejos del sujeto que no se entiende de qué habla, y la
// cuenta no lleva verbo conjugado a propósito (`fraseDeLaPerdida`), porque «se perdería 2 apartados»
// no concuerda.
const sinConfirmar = (que, perdida) => malaPeticion(
  `Borrar ${que} no se puede deshacer. Esto es lo que se va: ${perdida}. Manda { "confirmar": true } para confirmarlo. No se ha cambiado nada.`,
);

// Devuelve { fallo } o { usuario, documento, plantillaCompleta, repo, unidad, unidadId }.
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

// ¿Puede este usuario configurar este apartado en este módulo? Toda la decisión es
// `reglaEstructuraPropia`; aquí solo se le dan los booleanos resueltos en el servidor.
function puedeConfigurar({ usuario, documento, unidad, seccion, info }) {
  if (!C.puedeVer(usuario, documento)) return false;
  return C.reglaEstructuraPropia(usuario, booleanosDeApartado({ usuario, documento, unidad, seccion, edita: info.edita }));
}

// La información de permiso de un apartado PROPIO. Un apartado retirado no lo pinta `apartadosDeModulo`
// y es justo el que se borra, así que no se busca allí: es de este módulo y lo lleva quien lleva el módulo.
const infoDePropio = (titulo) => ({ seccion: { titulo }, edita: 'docentes_del_modulo', deUnidad: true, campos: [] });

const parametroDe = (peticion, nombre) => new URL(peticion.url).searchParams.get(nombre);

const sinIds = (xs, ids) => lista(xs).filter((x) => !(esObjeto(x) && ids.has(x.id)));

// La estructura que queda tras quitar apartados propios (con su subárbol) o una casilla. Es una copia: la
// de la unidad no se toca. Lo que se queda vacío se quita, para que lo guardado sea solo desvío; decidir
// si lo que queda vale como estructura es de `estructuraDeModulo`.
function estructuraSin({ estructura, apartados = new Set(), seccion = null, campo = null, deApartado = false }) {
  const nueva = JSON.parse(JSON.stringify(estructura));
  if (apartados.size) {
    const ap = esObjeto(nueva.apartados) ? nueva.apartados : {};
    ap.anadidos = sinIds(ap.anadidos, apartados);
    if (esObjeto(ap.orden)) {
      for (const padre of Object.keys(ap.orden)) {
        if (apartados.has(padre)) { delete ap.orden[padre]; continue; }
        ap.orden[padre] = lista(ap.orden[padre]).filter((id) => !apartados.has(id));
      }
    }
    nueva.apartados = ap;
  }
  if (campo) {
    const ids = new Set([campo]);
    if (deApartado) {
      const propio = lista(nueva.apartados && nueva.apartados.anadidos).find((a) => conId(a, seccion));
      propio.campos = sinIds(propio.campos, ids);
    } else {
      const desvio = nueva.secciones[seccion];
      desvio.anadidos = sinIds(desvio.anadidos, ids);
      if (Array.isArray(desvio.orden)) desvio.orden = desvio.orden.filter((id) => id !== campo);
    }
  }
  if (esObjeto(nueva.apartados)) {
    const ap = nueva.apartados;
    if (!lista(ap.anadidos).length) delete ap.anadidos;
    if (esObjeto(ap.orden)) {
      for (const k of Object.keys(ap.orden)) if (!lista(ap.orden[k]).length) delete ap.orden[k];
      if (!Object.keys(ap.orden).length) delete ap.orden;
    }
    if (esObjeto(ap.cambios) && !Object.keys(ap.cambios).length) delete ap.cambios;
    if (!Object.keys(ap).length) delete nueva.apartados;
  }
  if (esObjeto(nueva.secciones)) {
    for (const id of Object.keys(nueva.secciones)) {
      const d = nueva.secciones[id];
      if (esObjeto(d) && Array.isArray(d.anadidos) && !d.anadidos.length) delete d.anadidos;
      if (esObjeto(d) && Array.isArray(d.orden) && !d.orden.length) delete d.orden;
      if (esObjeto(d) && esObjeto(d.campos) && !Object.keys(d.campos).length) delete d.campos;
      if (!esObjeto(d) || !Object.keys(d).length) delete nueva.secciones[id];
    }
  }
  return nueva;
}

// El apartado y todos los que cuelgan de él entre los propios del módulo.
function subarbol(propios, id) {
  const ids = new Set([id]);
  for (let cambia = true; cambia;) {
    cambia = false;
    for (const a of propios) {
      if (esObjeto(a) && !ids.has(a.id) && ids.has(a.padre)) { ids.add(a.id); cambia = true; }
    }
  }
  return ids;
}

// La secuencia común, desde la cuenta de lo que se pierde hasta la respuesta. `objetivo` es lo que se
// borra, ya resuelto y ya permitido: { tipo, seccion, campo?, titulo, que, nueva }.
async function borrar({ abierto, objetivo, cuerpo }) {
  const { documento, repo, unidad, unidadId } = abierto;

  // Lo que se pierde, contado ANTES de escribir: es lo que se le dice a quien confirma. Si el cálculo
  // no incluye lo que se pide borrar, no se destruye nada: lo que se destruye sale de este cálculo.
  const nueva = objetivo.nueva;
  const perdida = EstructuraModulo.loQueSePierde(unidad, nueva);
  const esperado = objetivo.tipo === 'apartado'
    ? perdida.apartados.some((a) => a.id === objetivo.seccion)
    : perdida.campos.some((c) => c.seccion === objetivo.seccion && c.id === objetivo.campo);
  if (!esperado) {
    return fallo(500, 'error_interno', 'No se ha podido calcular qué se pierde al borrar esto. No se ha cambiado nada.');
  }
  const contenido = await contenidoDeLaPerdida({ repo, documentoId: documento._id, unidadId, perdida });

  if (cuerpo.confirmar !== true) return sinConfirmar(objetivo.que, fraseDeLaPerdida(contenido));

  // Una estructura sin desvíos no vale: null, y el módulo vuelve a la común.
  const queda = EstructuraModulo.estructuraDeModulo({ estructura: nueva }) ? nueva : null;
  if (queda !== null) {
    const motivo = EstructuraModulo.motivoDeEstructura(queda, documento.plantilla);
    if (motivo) {
      return fallo(400, 'peticion', `${motivo[0].toUpperCase()}${motivo.slice(1)} No se ha cambiado nada.`, { motivo });
    }
  }

  // La versión de la plantilla con que se leyó, y el token del documento con que se leyó.
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

  // La escritura que decide: condicionada al token del documento (como el PUT de estructura-modulo.js).
  let ahora = null;
  try {
    ahora = await repo.documentos.actualizar(documento._id, {}, { esperaUpdatedAt: ficha });
  } catch (e) {
    if (!e || e.codigo !== 'conflicto') throw e;
    return fallo(
      409, 'conflicto',
      'Alguien ha cambiado este documento mientras borrabas. No se ha cambiado nada: vuelve a cargarlo para no deshacer su cambio.',
      { esperado: ficha, actual: e.actual === undefined ? null : e.actual },
    );
  }

  const guardada = await repo.unidades.actualizar(documento._id, unidadId, { estructura: queda });
  if (queda !== null && !(guardada && esObjeto(guardada.estructura))) {
    return fallo(500, 'error_interno', 'La estructura no se ha guardado: el repositorio no la ha devuelto. Si acabas de actualizar la aplicación, reinicia el servidor.');
  }

  // El contenido, DESPUÉS de la estructura y acotado a esta unidad.
  const hecho = await destruirLaPerdida({ repo, documentoId: documento._id, unidadId, perdida });

  return Response.json({
    documentoId: documento._id,
    unidadId,
    seccion: objetivo.seccion,
    campo: objetivo.campo === undefined ? null : objetivo.campo,
    titulo: objetivo.titulo,
    estructura: EstructuraModulo.estructuraDeModulo(guardada),
    plantillaVersion: actual,
    updatedAt: ahora ? ahora.updatedAt : null,
    perdida,
    contenido,
    filas: hecho.filas,
    comentarios: hecho.comentarios,
    casillas: hecho.casillas,
    contenidoSinDestruir: hecho.sinDestruir,
  }, { headers: { 'Cache-Control': 'no-store' } });
}

// ---------------------------------------------------------------- DELETE …/estructura/apartado

const BORRAR_APARTADO = conErrores(async (peticion, parametros) => {
  const abierto = await abrir(peticion, parametros);
  if (abierto.fallo) return abierto.fallo;
  const { usuario, documento, plantillaCompleta, unidad } = abierto;

  const seccion = parametroDe(peticion, 'seccion');
  if (!seccion) return malaPeticion('Falta el parámetro «seccion»: el apartado propio del módulo que se borra.');

  const propios = lista(esObjeto(unidad.estructura) && esObjeto(unidad.estructura.apartados) ? unidad.estructura.apartados.anadidos : []);
  const propio = propios.find((a) => conId(a, seccion)) || null;
  const comun = propio ? null : buscarSeccion(plantillaCompleta, seccion);
  if (!propio && !comun) return noEncontrado(`Este módulo no tiene ningún apartado propio «${seccion}».`);

  const info = propio ? infoDePropio(propio.titulo || seccion) : comun;
  if (!puedeConfigurar({ usuario, documento, unidad, seccion, info })) {
    return SIN_PERMISO('No puedes cambiar la estructura de este módulo: solo quien lo lleva y la jefatura del departamento.');
  }

  if (!propio) {
    return malaPeticion(`«${comun.seccion.titulo || seccion}» es un apartado común del documento, no uno propio de este módulo: se borra por DELETE /api/documentos/[id]/estructura/apartado?seccion=, y borrarlo lo borra en el documento entero, no solo en este módulo. Aquí solo se borran los apartados que ha añadido el propio módulo.`);
  }
  if (propio.retirado !== true) {
    return malaPeticion(`El apartado «${propio.titulo || seccion}» no está retirado: primero hay que retirarlo y, después, borrarlo. No se ha cambiado nada.`);
  }

  const { fallo: falloCuerpo, cuerpo } = await leerCuerpoOpcional(peticion);
  if (falloCuerpo) return falloCuerpo;

  const nueva = estructuraSin({ estructura: unidad.estructura, apartados: subarbol(propios, seccion) });
  return borrar({
    abierto,
    cuerpo,
    objetivo: {
      tipo: 'apartado', seccion, titulo: propio.titulo || seccion, nueva,
      que: `«${propio.titulo || seccion}» y sus subapartados`,
    },
  });
});

// ---------------------------------------------------------------- DELETE …/estructura/campo

const BORRAR_CAMPO = conErrores(async (peticion, parametros) => {
  const abierto = await abrir(peticion, parametros);
  if (abierto.fallo) return abierto.fallo;
  const { usuario, documento, plantillaCompleta, unidad } = abierto;

  const seccion = parametroDe(peticion, 'seccion');
  if (!seccion) return malaPeticion('Falta el parámetro «seccion»: el apartado del que se borra la casilla.');
  const campo = parametroDe(peticion, 'campo');
  if (!campo) return malaPeticion('Falta el parámetro «campo»: la casilla propia del módulo que se borra.');

  const estructura = esObjeto(unidad.estructura) ? unidad.estructura : {};
  const propios = lista(esObjeto(estructura.apartados) ? estructura.apartados.anadidos : []);
  const apartadoPropio = propios.find((a) => conId(a, seccion)) || null;
  const enComun = apartadoPropio ? null : buscarSeccion(plantillaCompleta, seccion);
  if (!apartadoPropio && !enComun) return noEncontrado(`Este módulo no tiene ningún apartado «${seccion}».`);

  const casillas = apartadoPropio
    ? lista(apartadoPropio.campos)
    : lista(esObjeto(estructura.secciones) && esObjeto(estructura.secciones[seccion]) ? estructura.secciones[seccion].anadidos : []);
  const casilla = casillas.find((c) => conId(c, campo)) || null;
  const esComun = !casilla && !!enComun && enComun.campos.some((c) => conId(c, campo));
  if (!casilla && !esComun) return noEncontrado(`El apartado «${seccion}» no tiene ninguna casilla «${campo}» en este módulo.`);

  const info = apartadoPropio ? infoDePropio(apartadoPropio.titulo || seccion) : enComun;
  if (!puedeConfigurar({ usuario, documento, unidad, seccion, info })) {
    return SIN_PERMISO('No puedes cambiar la estructura de este módulo: solo quien lo lleva y la jefatura del departamento.');
  }

  if (esComun) {
    return malaPeticion(`«${campo}» es una casilla común del apartado «${seccion}», no una propia de este módulo: se borra por DELETE /api/documentos/[id]/estructura/apartado/campo?seccion=&campo=, y borrarla la borra en el documento entero, no solo en este módulo. Aquí solo se borran las casillas que ha añadido el propio módulo.`);
  }
  const nombre = casilla.etiqueta || campo;
  if (casilla.retirado !== true) {
    return malaPeticion(`La casilla «${nombre}» no está retirada: primero hay que retirarla y, después, borrarla. No se ha cambiado nada.`);
  }

  const { fallo: falloCuerpo, cuerpo } = await leerCuerpoOpcional(peticion);
  if (falloCuerpo) return falloCuerpo;

  const nueva = estructuraSin({ estructura, seccion, campo, deApartado: !!apartadoPropio });
  return borrar({
    abierto,
    cuerpo,
    objetivo: {
      tipo: 'campo', seccion, campo, titulo: nombre, nueva,
      que: `la casilla «${nombre}»`,
    },
  });
});

module.exports = { BORRAR_APARTADO, BORRAR_CAMPO };
