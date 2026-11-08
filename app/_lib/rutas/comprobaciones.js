// QUÉ SE LE COMPRUEBA A ESTE DOCUMENTO, y con qué convenio.
//
//   GET   /api/documentos/[id]/comprobaciones   la tabla entera, con lo fijo y lo configurable
//   PATCH /api/documentos/[id]/comprobaciones   la cambia. Cuerpo: { convenioCe?, reglas?, esperaUpdatedAt? }
//
// Es la propuesta que docs/plan.md §7 lleva escrita desde el E0 —«una tabla de reglas
// { activa, severidad } por documento que mantenga la jefatura de estudios»— y lo que la hace
// urgente es un hecho medido: LA PROGRAMACIÓN DE DAW NO SE PUEDE APROBAR, con 45 errores de los que
// 11 son módulos sin docente, 12 son ponderaciones descuadradas de verdad y **22 no son errores**
// sino el otro convenio de ponderación de los criterios, que el departamento no ha decidido.
//
// ================================================================ LAS DOS COSAS CONFIGURABLES
//
// Se parecen y no son la misma, y mezclarlas sería el error de diseño de este evolutivo:
//
//   1. EL CONVENIO DE PONDERACIÓN DE LOS CRITERIOS (`convenioCe`). No es activar ni desactivar una
//      regla: es decir CUÁL DE LOS DOS CONVENIOS LEGÍTIMOS usa el centro. Con el laxo, esos 22
//      dejan de ser avisos porque SON CORRECTOS, no porque se hayan silenciado. Es la diferencia
//      entre decidir y tapar, y por eso el convenio viaja aparte de la tabla de reglas y con su
//      propia explicación de qué es cada uno (`Val.CONVENIOS`).
//
//   2. LAS COMPROBACIONES DE CRITERIO DEL CENTRO, con `{ activa, severidad }`: unidad sin docente,
//      RA sin situación de aprendizaje, SA sin evaluación, apartado vacío, heredado sin revisar y
//      copia desvinculada desactualizada. Son del criterio del centro, así que el centro las decide.
//
// LAS DOS NORMATIVAS NO SE TOCAN: que los RA sumen 100 % y que los criterios repartan el peso de su
// RA salen del real decreto del título. Ni se desactivan ni se les baja la severidad, y pedirlo es
// un 400 con el motivo dentro. Lo que sí se decide sobre la segunda es el convenio, que es el punto
// 1 y entra por la otra puerta: cambiar el convenio no es bajarle la severidad a la regla.
//
// ================================================================ CÓMO SE LO DICE A LA PANTALLA
//
// La respuesta del GET trae la tabla RESUELTA, una fila por comprobación, y la pantalla no tiene que
// saberse nada de esto:
//
//   fija       si se puede tocar o no (lo decide la CLASE: `normativa` o `centro`)
//   porque     POR QUÉ es fija, en castellano y para enseñar tal cual. Una casilla deshabilitada sin
//              motivo parece una casilla rota
//   activa     · severidad               lo que tiene puesto hoy
//   severidadPorOmision                  lo de serie, para poder enseñar «cambiado»
//   enElPanel  · motivo                  si el panel de comprobaciones la busca de verdad hoy
//
// `enElPanel` es la honestidad que faltaba. Tres comprobaciones del catálogo existen en
// core/validaciones.js y el panel NO las busca todavía (./validaciones.js lo explica regla por
// regla): se pueden configurar —la configuración se guarda y se arrastra al curso siguiente— pero
// hoy no cambian nada. Una casilla que no hace nada tiene que decir que no hace nada.
//
// Y la pantalla no decide el candado: `puedeConfigurar` viene resuelto, igual que `puedeCambiar` en
// /estructura y `puedeRepartir` en /unidades (docs/api.md, «Quién pregunta»).
//
// ================================================================ QUIÉN LA CAMBIA
//
// LA JEFATURA DE ESTUDIOS, que es quien aprueba, y el soporte. La regla está en core/permisos.js →
// `puedeConfigurarComprobaciones`, con las demás, y el motivo es que cambiar esto MUEVE EL LISTÓN de
// lo que se puede aprobar: quien pone el listón tiene que ser quien decide si se ha superado. Si lo
// configurara el departamento, la puerta de aprobación la abriría quien quiere pasar por ella.
//
// El resto la ve en modo lectura: 401 sin identificar, 404 si el documento no es suyo, 403 si lo ve
// y no es quien configura.
//
// ================================================================ DÓNDE SE GUARDA, Y LA CONSTANCIA
//
// EN EL DOCUMENTO (`documentos.comprobaciones`, en la lista blanca de repositorio/index.js). La
// aprobación es por documento y una memoria no tiene las mismas comprobaciones aplicables que una
// programación, así que una configuración del centro entera no valdría para la mitad de los
// documentos. Y el arrastre al curso siguiente se la lleva (./arrastre.js): el criterio del centro no
// se reinicia cada septiembre.
//
// QUEDA CONSTANCIA DE QUIÉN Y CUÁNDO, dentro del propio campo (`comprobaciones.cambios`), que es el
// precedente de `plantilla.cambios` del E6: el registro viaja dentro de lo que se copia, así que el
// curso nuevo nace sabiendo con qué criterio se mide y quién lo decidió. No puede ser anónimo porque
// cambiar esto mueve el listón de lo que se puede aprobar, y una aprobación que haya que justificar
// necesita saber con qué regla se midió. Cada entrada lleva el instante, el id de quien lo cambió, su
// nombre y su rol EN ESE MOMENTO —el rol de hoy puede ser otro, y lo que importa es con qué autoridad
// se cambió— y qué cambió, de qué a qué.
//
// Se apunta UNA ENTRADA POR COSA CAMBIADA y solo si cambia de verdad: pedir el convenio que ya estaba
// no deja fila, porque un historial con filas que no dicen nada no se lee.
//
// LO QUE SE GUARDA ES LO QUE SE APARTA DE LO DE SERIE (`comprimirConfig`), así que un documento que
// nadie ha configurado no tiene el campo y se comporta EXACTAMENTE como antes del E7.
//
// Es CommonJS y no sabe que está dentro de Next (docs/api.md, primera regla de forma).

'use strict';

const C = require('../../../core/permisos');
const Val = require('../../../core/validaciones');
const { REGLAS_DEL_PANEL, FUERA_DEL_PANEL } = require('./validaciones');
const {
  conErrores, abrirDocumento, leerJson, texto, fallo, malaPeticion, comprobacionesDe, SIN_PERMISO,
} = require('./comun');

// El registro de cambios que lleva el documento. Puede no existir: un documento que nadie ha
// configurado no tiene el campo (ver la cabecera).
const cambiosDe = (documento) => {
  const guardado = documento && documento.comprobaciones;
  return Array.isArray(guardado && guardado.cambios) ? guardado.cambios : [];
};

// La tabla resuelta, una fila por comprobación del catálogo y en su orden. Es lo único que la
// pantalla necesita leer: lo fijo y lo configurable ya distinguidos, con el motivo de cada cosa.
const tablaDe = (config) => Val.REGLAS.map((r) => {
  const puesto = config.reglas[r.regla];
  const enElPanel = REGLAS_DEL_PANEL.includes(r.regla);
  return {
    regla: r.regla,
    titulo: r.titulo,
    clase: r.clase,
    fija: r.fija,
    porque: r.porque,
    activa: puesto.activa,
    severidad: puesto.severidad,
    severidadPorOmision: r.severidad,
    enElPanel,
    // Por qué no sale en el panel todavía, cuando no sale. `null` cuando sí sale: no hay nada que
    // explicar de una comprobación que funciona.
    motivo: enElPanel ? null : (FUERA_DEL_PANEL[r.regla] || null),
  };
});

const cuerpoDeLaRespuesta = (documento, config, puedeConfigurar) => ({
  documentoId: documento._id,
  // El convenio de este documento y los dos que hay, cada uno con qué es y qué cuesta. Viajan porque
  // esto no es una casilla de sí o no: es elegir entre dos reglas legítimas, y quien elige tiene que
  // leer lo que elige (ver la cabecera).
  convenioCe: config.convenioCe,
  convenios: Val.CONVENIOS,
  reglas: tablaDe(config),
  puedeConfigurar,
  // Quién lo ha cambiado y cuándo, del primer cambio al último. Vacío en un documento que nadie ha
  // configurado, que es la mayoría.
  cambios: cambiosDe(documento),
  // El token con el que se escribe: el cliente lo devuelve en `esperaUpdatedAt` y así dos jefaturas
  // de estudios configurando a la vez no se pisan (ver /estructura y /estado).
  updatedAt: documento.updatedAt || null,
});

// ---------------------------------------------------------------- GET

// La ve quien ve el documento, y `puedeConfigurar` dice si los controles van habilitados. No hay un
// permiso aparte para leerla por lo mismo que en /validaciones: saber con qué regla se mide un
// documento es parte de leerlo, y quien escribe un módulo tiene que poder saber por qué su apartado
// sale con un aviso o deja de salir.
const GET = conErrores(async (peticion, parametros) => {
  const abierto = await abrirDocumento(peticion, parametros);
  if (abierto.fallo) return abierto.fallo;
  const { usuario, documento } = abierto;

  return Response.json(
    cuerpoDeLaRespuesta(
      documento,
      comprobacionesDe(documento),
      C.puedeConfigurarComprobaciones(usuario, documento),
    ),
    { headers: { 'Cache-Control': 'no-store' } },
  );
});

// ---------------------------------------------------------------- PATCH

// PATCH y no PUT porque el cuerpo es PARCIAL: lleva solo lo que se cambia. No es lo mismo que el
// reparto de unidades, que se manda entero a propósito (docs/api.md): allí lo que se escribe es una
// lista y «añadir» y «quitar» dejarían un reparto que nadie quiso; aquí son ajustes independientes
// entre sí, y obligar a reenviar la tabla completa haría que una pantalla con una versión vieja
// devolviera a su sitio un ajuste que otra persona acababa de cambiar. Lo que protege del todo es el
// `esperaUpdatedAt` de abajo.
const CAMBIAR = conErrores(async (peticion, parametros) => {
  const abierto = await abrirDocumento(peticion, parametros);
  if (abierto.fallo) return abierto.fallo;
  const { usuario, documento, repo } = abierto;

  if (!C.puedeConfigurarComprobaciones(usuario, documento)) {
    return SIN_PERMISO('Las comprobaciones que se le aplican a un documento las configura la jefatura de estudios, que es quien aprueba: cambiarlas mueve el listón de lo que se puede aprobar, así que lo decide quien decide si se ha superado.');
  }

  const { fallo: falloCuerpo, cuerpo } = await leerJson(peticion);
  if (falloCuerpo) return falloCuerpo;

  if (cuerpo.convenioCe === undefined && cuerpo.reglas === undefined) {
    return malaPeticion('No hay nada que cambiar: manda «convenioCe», «reglas» o las dos cosas.');
  }

  // El aviso temprano, igual que en /estado: el cliente dice con qué versión está mirando la
  // pantalla, y si ya no es esa no se escribe nada. La decisión de verdad es la escritura
  // condicionada de más abajo.
  const espera = texto(cuerpo, 'esperaUpdatedAt');
  const guardado = documento.updatedAt ? new Date(documento.updatedAt).toISOString() : null;
  if (espera !== null && espera !== guardado) {
    return fallo(
      409, 'conflicto',
      'Alguien ha cambiado este documento desde que cargaste la pantalla. No se ha cambiado ninguna comprobación: vuelve a cargarla para no deshacer su cambio.',
      { esperado: espera, actual: guardado },
    );
  }

  // LA REGLA DE QUÉ SE PUEDE CAMBIAR ESTÁ EN core/validaciones.js, no aquí: la negativa de las dos
  // normativas, las severidades que existen y qué cuenta como cambio de verdad. Esta ruta se ocupa de
  // quién lo pide y de dónde se escribe.
  const hecho = Val.fusionarConfig(documento.comprobaciones, {
    convenioCe: cuerpo.convenioCe,
    reglas: cuerpo.reglas,
  });
  if (hecho.motivo) return malaPeticion(hecho.motivo);

  // Un cambio que no cambia nada es un 200 que no escribe, y no un 400: la pantalla puede mandar el
  // valor que ya estaba sin que eso sea un error de nadie, y lo que no puede es dejar una fila en el
  // historial. Se distingue por `cambios: []`.
  if (!hecho.cambios.length) {
    return Response.json(
      { ...cuerpoDeLaRespuesta(documento, hecho.config, true), cambios: cambiosDe(documento), aplicados: [] },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  // LA CONSTANCIA. El nombre y el rol se copian del usuario de la sesión y NUNCA del cuerpo, igual
  // que el autor de un comentario: quien cambia el listón de aprobación es quien ha entrado, no quien
  // dice ser. Se guardan además del id porque una persona dada de baja sigue teniendo que aparecer en
  // el historial con su nombre, y porque el rol de hoy puede no ser el de entonces.
  const ahora = new Date().toISOString();
  const apuntados = hecho.cambios.map((c) => ({
    en: ahora,
    por: usuario._id,
    nombre: usuario.nombre || null,
    rol: usuario.rol || null,
    ...c,
  }));

  // `guardar` es solo lo que se aparta de lo de serie, y puede ser `null` —volver a dejarlo todo como
  // venía—. El registro se conserva de todas formas: que alguien haya devuelto el convenio al
  // estricto es un hecho que hay que poder contar, y si se fuera con el campo, el documento diría que
  // nunca se decidió nada.
  const siguiente = { ...(hecho.guardar || {}), cambios: cambiosDe(documento).concat(apuntados) };

  let escrito;
  try {
    escrito = await repo.documentos.actualizar(
      documento._id, { comprobaciones: siguiente }, { esperaUpdatedAt: documento.updatedAt },
    );
  } catch (e) {
    if (!e || e.codigo !== 'conflicto') throw e;
    const actual = await repo.documentos.obtener(documento._id);
    return fallo(
      409, 'conflicto',
      'Alguien ha cambiado este documento mientras cambiabas sus comprobaciones. No se ha cambiado nada: vuelve a cargarlo.',
      { esperado: guardado, actual: actual && actual.updatedAt ? new Date(actual.updatedAt).toISOString() : null },
    );
  }

  const despues = escrito || { ...documento, comprobaciones: siguiente };
  return Response.json(
    {
      ...cuerpoDeLaRespuesta(despues, comprobacionesDe(despues), true),
      // Lo que ha cambiado EN ESTA petición, aparte del historial entero. Es lo que la pantalla
      // enseña al confirmar («se ha cambiado el convenio de ponderación»), y lo que deja claro que
      // pedir lo que ya estaba no ha cambiado nada.
      aplicados: apuntados,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
});

module.exports = { GET, CAMBIAR, tablaDe };
