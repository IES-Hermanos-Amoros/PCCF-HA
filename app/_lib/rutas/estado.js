// El ESTADO del documento: `borrador → revisión → aprobado`.
//
//   GET  /api/documentos/[id]/estado   en qué estado está y qué puede hacer con él quien pregunta
//   POST /api/documentos/[id]/estado   lo cambia. Cuerpo: { estado, esperaUpdatedAt? }
//
// Es la mitad de servidor del E7 (docs/plan.md §5) y su criterio de aceptación es de una línea:
//
//   «Aprobar quita la marca de agua y los errores lo impiden.»
//
// Las dos mitades están repartidas: la marca de agua ya la pinta el generador —`buildDocDefinition`
// de motor/render-generico.js trata como borrador todo lo que no sea `aprobado`, así que basta con
// que el estado guardado sea el que llega al motor, y eso lo hace ya `estadoPedido` de ./comun.js—;
// y los errores los cuenta el panel de comprobaciones, que vive en ./validaciones.js. Aquí no se
// pinta ni se valida nada: aquí está la PUERTA.
//
// ================================================================ QUIÉN MUEVE CADA FLECHA
//
// El estado no es una etiqueta que cada uno se ponga: es el circuito por el que pasa el documento
// del departamento, y cada tramo lo mueve quien responde de él.
//
//   borrador → revisión   LA JEFATURA DEL DEPARTAMENTO lo manda a revisión, y el soporte.
//   revisión → aprobado   LA JEFATURA DE ESTUDIOS lo aprueba, y el soporte.
//   revisión → borrador    lo devuelven las dos: la de estudios porque hay que arreglar algo, la del
//                          departamento porque se ha dado cuenta de que no estaba listo.
//   aprobado → revisión    lo reabre quien lo aprobó: la jefatura de estudios (y el soporte).
//   aprobado → borrador    igual que reabrir, pero devolviéndolo del todo al departamento.
//
// QUIÉN MANDA EL DOCUMENTO A REVISIÓN, QUE ES LA PREGUNTA QUE FALTABA POR DECIDIR
//
// La jefatura del departamento. No el docente que escribe un módulo, por la misma razón por la que
// no cambia la estructura (core/permisos.js → `puedeCambiarEstructura`): escribe lo suyo, no responde
// del documento entero, y «ya he acabado mi módulo» no es «la programación está lista». Y no la
// jefatura de estudios, porque mandar a revisión es decir «esto ya se puede mirar», y eso lo dice
// quien lo ha escrito, no quien lo va a mirar. Si lo mandase ella, el circuito no tendría dos partes:
// sería una sola persona decidiendo que algo que no ha escrito está listo para que ella misma lo
// apruebe.
//
// POR QUÉ APRUEBA LA JEFATURA DE ESTUDIOS
//
// Ya estaba decidido y escrito en tres sitios (core/permisos.js, docs/api.md, docs/plan.md §7): ve
// los documentos de todos los departamentos y **no edita nada**. Eso es lo que la deja en condiciones
// de aprobar: quien aprueba no puede ser quien escribe, o la aprobación no dice nada de lo aprobado.
// Esta ruta es el primer sitio donde ese rol sirve para algo más que para mirar.
//
// POR QUÉ `borrador → aprobado` NO EXISTE
//
// No es que nadie pueda: es que la flecha no está. Saltarse la revisión convierte la aprobación en
// una firma sobre un documento que nadie de fuera del departamento ha mirado, y entonces los tres
// estados sobran y vale un booleano. Quien quiera aprobar deprisa pasa por revisión: son dos
// llamadas. El soporte tampoco se la salta —puede moverlo él todo, pero por el circuito— porque un
// atajo que existe «solo para soporte» acaba siendo el camino normal.
//
// Y pedir el estado en el que ya está es un 400 y no un 200 que no hace nada, igual que mover el
// primer apartado hacia arriba (app/_lib/rutas/estructura.js): una interfaz que cree que ha
// aprobado algo que ya estaba aprobado tiene un fallo que merece verse.
//
// ================================================================ LOS ERRORES IMPIDEN APROBAR
//
// La cuenta la hace ./validaciones.js con `informeDe`, y la puerta es su `puedeAprobarse`, que es
// `core/validaciones.js` → `cuenta(avisos).error === 0`. No se vuelve a calcular aquí nada: si la
// puerta contara por su cuenta, el panel podría decir «se puede aprobar» y la puerta responder que
// no, que es la avería de las dos implementaciones de docs/plan.md §2.2 otra vez.
//
// EL RECHAZO DICE CUÁNTOS Y DÓNDE, Y SEPARA LOS DOS GRUPOS
//
// Un «no se puede aprobar» a secas obliga a quien lo lee a ir a buscar por qué, y encima no es
// verdad del todo. Sobre la programación real del departamento el panel cuenta **45 errores, y 22 de
// ellos no son erratas**: son el otro convenio de ponderación de los criterios —los criterios suman
// 100 % dentro de su RA en lugar de repartir su peso—, y **qué convenio vale es una decisión del
// departamento que sigue pendiente** (docs/plan.md, «Lo que ha dejado el E0»; la cabecera de
// ./validaciones.js lo explica entero).
//
// Con la regla tal cual, ese documento no se puede aprobar hasta que alguien decida. Eso es
// incómodo y es correcto, y la salida NO es bajarle la severidad por nuestra cuenta: bajarla sería
// decidir el convenio por la puerta de atrás, y además en silencio. Lo que se hace es que el rechazo
// **distinga los dos grupos con sus números**:
//
//   errores      45   todo lo que la regla cuenta como error y bloquea
//   porArreglar  23   los que hay que arreglar
//   delConvenio  22   los que son la decisión pendiente, no un documento roto
//   porRegla          el desglose, que es lo que de verdad dice qué hacer:
//                       sin_docente         11   módulos que no lleva nadie  → pantalla de reparto
//                       criterios_de_ra     10   descuadres de verdad (14,94 % donde debe haber 15 %)
//                       suma_de_ra           2   los RA de un módulo no suman 100 %
//                       cien_dentro_del_ra  22   la decisión de convenio pendiente
//   donde             por módulo, con las dos cifras y el apartado al que hay que ir
//
// Así quien lo lee ve de un golpe que tiene **once módulos sin repartir, doce ponderaciones
// descuadradas y una decisión pendiente**, no cuarenta y cinco cosas rotas; y tiene las tres salidas
// a la vista, que además se arreglan en pantallas distintas y por personas distintas.
//
// ================================================================ LA ESCRITURA ES CONDICIONADA
//
// Igual que en app/_lib/rutas/estructura.js: `documentos.actualizar` lleva el `esperaUpdatedAt` con
// el que se leyó el documento en ESTA petición, así que entre la lectura —y la cuenta de errores, que
// es lo que tarda— y la escritura no se puede colar otro cambio sin que la escritura falle con 409.
// Sin eso, dos jefaturas pulsando a la vez podrían dejar aprobado un documento al que la otra
// acababa de añadir un apartado con errores.
//
// `esperaUpdatedAt` en el cuerpo es opcional y es el aviso temprano: el cliente dice con qué versión
// del documento está mirando la pantalla, y si ya no es esa se responde 409 antes de contar nada.
//
// LO QUE NO SE GUARDA, Y POR QUÉ: QUIÉN APROBÓ Y CUÁNDO
//
// No queda apuntado. `CAMPOS.documento` de repositorio/index.js acepta `estado` y nada más que
// sirva para esto, y `repositorio/` no es de esta tarea (ni hay todavía la colección `historial` que
// docs/plan.md §3 reserva para el E7). Así que hoy el documento sabe que está aprobado y no quién lo
// aprobó. Para el criterio de aceptación basta; para una aprobación que haya que justificar en una
// inspección, no. El arreglo es un campo más (`aprobadoPor`, `aprobadoEn`) o la colección
// `historial`, y las dos cosas se tocan en repositorio/.
//
// Es CommonJS y no sabe que está dentro de Next (docs/api.md, primera regla de forma).

'use strict';

const C = require('../../../core/permisos');
const Val = require('../../../core/validaciones');
const { informeDe } = require('./validaciones');
const { esActiva } = require('../../../core/versiones');
const {
  conErrores, abrirDocumento, leerJson, texto, fallo, malaPeticion, sinPlantilla, SIN_PERMISO,
} = require('./comun');

// Los tres estados del documento (docs/plan.md §3). Conjunto cerrado y en este orden: es el del
// circuito, y es el que se enseña cuando algo no cuadra.
const ESTADOS = ['borrador', 'revision', 'aprobado'];

// El estado de un documento al que nadie le ha puesto ninguno. La importación y el arrastre lo
// ponen siempre, pero un documento escrito a mano en la base de datos no tiene por qué.
const POR_OMISION = 'borrador';

const estadoDe = (documento) => (ESTADOS.includes(documento && documento.estado)
  ? documento.estado : POR_OMISION);

// LAS FLECHAS DEL CIRCUITO. Una fila por transición posible, con quién la mueve y con cómo se llama
// en castellano, que es lo que acaba en el botón y en el mensaje de error. Lo que no está en esta
// tabla no se puede hacer, y por eso la tabla es la documentación: se lee de un golpe.
//
// `roles` son los de core/permisos.js. El soporte (`admin`) está en todas porque es coordinación
// técnica y arregla lo que se quede atascado, pero no se salta ninguna flecha (ver la cabecera).
const TRANSICIONES = [
  {
    de: 'borrador', a: 'revision', accion: 'enviar',
    roles: ['admin', 'jefe_departamento'],
    quien: 'la jefatura del departamento',
    negativa: 'Mandar el documento a revisión lo hace la jefatura de tu departamento: es quien responde de la programación entera, no quien escribe un módulo. Y no la jefatura de estudios, que es quien lo va a mirar.',
  },
  {
    de: 'revision', a: 'borrador', accion: 'devolver',
    roles: ['admin', 'jefe_departamento', 'jefe_estudios'],
    quien: 'la jefatura de estudios o la del departamento',
    negativa: 'Devolver a borrador un documento en revisión lo hacen la jefatura de estudios —porque hay algo que arreglar— y la del departamento, que puede retirarlo si ve que no estaba listo.',
  },
  {
    de: 'revision', a: 'aprobado', accion: 'aprobar',
    roles: ['admin', 'jefe_estudios'],
    quien: 'la jefatura de estudios',
    negativa: 'Aprobar lo hace la jefatura de estudios, que ve los documentos de todos los departamentos y no edita ninguno: es eso lo que la deja en condiciones de aprobar.',
  },
  {
    de: 'aprobado', a: 'revision', accion: 'reabrir',
    roles: ['admin', 'jefe_estudios'],
    quien: 'la jefatura de estudios',
    negativa: 'Reabrir un documento aprobado lo hace quien lo aprobó: la jefatura de estudios.',
  },
  {
    de: 'aprobado', a: 'borrador', accion: 'reabrir',
    roles: ['admin', 'jefe_estudios'],
    quien: 'la jefatura de estudios',
    negativa: 'Devolver al departamento un documento aprobado lo hace quien lo aprobó: la jefatura de estudios.',
  },
];

const salidasDe = (estado) => TRANSICIONES.filter((t) => t.de === estado);

const puedeMoverla = (usuario, transicion) => !!usuario && C.estaActivo(usuario)
  && transicion.roles.includes(usuario.rol);

// La marca de agua de BORRADOR la pinta el generador para todo lo que no sea `aprobado`
// (motor/render-generico.js). Viaja en la respuesta porque es el criterio de aceptación del
// evolutivo y porque es lo que la pantalla tiene que poder decir sin generar un PDF para mirarlo.
const conMarcaDeAgua = (estado) => estado !== 'aprobado';

// ---------------------------------------------------------------- el rechazo por errores

const esDelConvenio = (aviso) => aviso && aviso.convenio === Val.CIEN_DENTRO_DEL_RA;
const esError = (aviso) => aviso && aviso.severidad === 'error';

// Cuántos errores hay y dónde están, separando los que son la decisión de convenio pendiente (ver
// la cabecera). Se construye sobre los grupos del panel, que ya vienen en el orden del documento,
// así que la lista se lee en el mismo orden en el que se imprime el tomo.
//
// `porRegla` sale de medir el documento real y descubrir que «23 por arreglar» no es una sola cosa:
// once de esos veintitrés son módulos que no lleva nadie (`sin_docente`) y doce son ponderaciones
// descuadradas. Se arreglan en sitios distintos —el reparto de unidades y el apartado de
// ponderaciones— y por personas distintas, así que el rechazo los cuenta por separado en lugar de
// dar un número que no dice qué hay que hacer. Son los códigos estables de ./validaciones.js.
function cuentaDeErrores(informe) {
  const donde = [];
  const porRegla = {};
  let errores = 0;
  let delConvenio = 0;

  for (const grupo of (informe.grupos || [])) {
    const suyos = (grupo.avisos || []).filter(esError);
    if (!suyos.length) continue;
    const convenio = suyos.filter(esDelConvenio).length;
    errores += suyos.length;
    delConvenio += convenio;
    for (const aviso of suyos) {
      const clave = esDelConvenio(aviso) ? Val.CIEN_DENTRO_DEL_RA : (aviso.regla || 'otra');
      porRegla[clave] = (porRegla[clave] || 0) + 1;
    }
    donde.push({
      unidadId: grupo.unidadId,
      titulo: grupo.titulo,
      num: grupo.num,
      errores: suyos.length,
      porArreglar: suyos.length - convenio,
      delConvenio: convenio,
      // El apartado al que hay que ir a arreglar el primero: es lo que le faltaba al panel del v1 y
      // lo que convierte el rechazo en algo que se puede seguir.
      destino: (suyos.find((a) => !esDelConvenio(a)) || suyos[0]).destino || null,
    });
  }

  return { errores, delConvenio, porArreglar: errores - delConvenio, porRegla, donde };
}

// El mensaje en castellano, que es lo que se enseña tal cual. Nombra los módulos con más errores
// —no todos: con once módulos la frase sería ilegible— y la lista completa va en `donde`.
function mensajeDelRechazo({ errores, porArreglar, delConvenio, donde }) {
  const partes = [`No se puede aprobar: el documento tiene ${errores === 1 ? 'un error' : `${errores} errores`}.`];

  // Ojo con la palabra: los que hay que arreglar NO son todos erratas —en el documento real once de
  // los veintitrés son módulos sin profesorado asignado—, así que el mensaje dice «hay que
  // arreglarlos» y el desglose por regla va en `porRegla`.
  const ELOTRO = 'el otro convenio de ponderación de los criterios —suman 100 % dentro de su RA en'
    + ' lugar de repartir su peso—, que el departamento tiene pendiente de decidir';

  if (delConvenio && porArreglar) {
    partes.push(`${porArreglar === 1 ? 'Uno hay que arreglarlo' : `${porArreglar} hay que arreglarlos`}`
      + ` y ${delConvenio === 1 ? 'el otro no es una errata' : `los otros ${delConvenio} no son erratas`}:`
      + ` son ${ELOTRO}. Mientras no se decida, bloquean la aprobación.`);
  } else if (delConvenio) {
    partes.push(`Ninguno es una errata: ${delConvenio === 1 ? 'es' : 'todos son'} ${ELOTRO}.`
      + ' Decidirlo, o unificar esos módulos al convenio estricto, es lo que falta para poder aprobar.');
  }

  const peores = [...donde].sort((a, b) => b.errores - a.errores).slice(0, 3);
  if (peores.length) {
    partes.push(`Dónde: ${peores.map((g) => `${g.titulo} (${g.errores})`).join(', ')}`
      + `${donde.length > peores.length ? ` y ${donde.length - peores.length} más` : ''}.`);
  }

  return partes.join(' ');
}

// ---------------------------------------------------------------- GET

// En qué estado está y qué puede hacer con él quien pregunta. Lo ve quien ve el documento.
//
// Las transiciones viajan ya resueltas, con `puede` por cada una, por lo mismo que `puedeCambiar` en
// /estructura: el cliente solo refleja el candado y no vuelve a escribir las reglas de rol
// (docs/api.md, «Quién pregunta»). Lo que NO lleva es la cuenta de errores: la tiene /validaciones,
// que la pantalla de aprobación pide de todas formas, y calcularla aquí sería recorrer los 250
// apartados del documento real dos veces para enseñar la misma cifra.
const GET = conErrores(async (peticion, parametros) => {
  const { fallo: falloAbrir, usuario, documento } = await abrirDocumento(peticion, parametros);
  if (falloAbrir) return falloAbrir;

  const estado = estadoDe(documento);
  return Response.json({
    documentoId: documento._id,
    estado,
    marcaDeAgua: conMarcaDeAgua(estado),
    estados: ESTADOS,
    // Una versión alternativa no cambia de estado: la pantalla lo dice en lugar de ofrecer flechas.
    alternativa: !esActiva(documento),
    transiciones: salidasDe(estado).map((t) => ({
      a: t.a, accion: t.accion, quien: t.quien, puede: puedeMoverla(usuario, t),
    })),
  }, { headers: { 'Cache-Control': 'no-store' } });
});

// ---------------------------------------------------------------- POST

const CAMBIAR = conErrores(async (peticion, parametros) => {
  const abierto = await abrirDocumento(peticion, parametros);
  if (abierto.fallo) return abierto.fallo;
  const { usuario, documento, repo } = abierto;

  const { fallo: falloCuerpo, cuerpo } = await leerJson(peticion);
  if (falloCuerpo) return falloCuerpo;

  const pedido = texto(cuerpo, 'estado');
  if (!pedido) return malaPeticion('Falta el campo «estado».');
  if (!ESTADOS.includes(pedido)) {
    return malaPeticion(`El estado «${pedido}» no existe: usa ${ESTADOS.join(', ')}.`);
  }

  const actual = estadoDe(documento);
  if (pedido === actual) {
    return malaPeticion(`El documento ya está en «${actual}»: no hay nada que cambiar.`);
  }

  // La flecha. Si no existe, el error dice a dónde SÍ se puede ir desde aquí: un 400 que solo diga
  // «no se puede» deja a quien lo lee adivinando el circuito.
  const salidas = salidasDe(actual);
  const transicion = salidas.find((t) => t.a === pedido);
  if (!transicion) {
    return fallo(
      400, 'peticion',
      `Desde «${actual}» no se puede pasar a «${pedido}»: ${salidas.length
        ? `desde aquí solo se va a ${salidas.map((t) => `«${t.a}»`).join(' o ')}`
        : 'desde aquí no se va a ningún sitio'}.`
      + (actual === 'borrador' && pedido === 'aprobado'
        ? ' Un documento se aprueba después de pasar por revisión, no antes: si no, nadie de fuera del departamento lo ha mirado.'
        : ''),
      { estado: actual, destinos: salidas.map((t) => t.a) },
    );
  }

  if (!puedeMoverla(usuario, transicion)) return SIN_PERMISO(transicion.negativa);

  // El aviso temprano, si el cliente dice con qué versión está mirando la pantalla. La decisión de
  // verdad es la escritura condicionada de abajo.
  const espera = texto(cuerpo, 'esperaUpdatedAt');
  const guardado = documento.updatedAt ? new Date(documento.updatedAt).toISOString() : null;
  if (espera !== null && espera !== guardado) {
    return fallo(
      409, 'conflicto',
      'Alguien ha cambiado este documento desde que cargaste la pantalla. No se ha cambiado el estado: vuelve a cargarlo para ver cómo está ahora.',
      { esperado: espera, actual: guardado },
    );
  }

  // LA PUERTA. Solo al entrar en `aprobado`: salir de ahí, o mandar a revisión algo con errores, es
  // justo lo que hay que poder hacer para arreglarlos.
  if (pedido === 'aprobado') {
    const informe = await informeDe({ documento, repo });
    if (!informe.puedeAprobarse) {
      const cuenta = cuentaDeErrores(informe);
      return fallo(409, 'con_errores', mensajeDelRechazo(cuenta), {
        estado: actual,
        // La cuenta entera del panel, para que la pantalla no tenga que pedirla otra vez.
        errores: cuenta.errores,
        porArreglar: cuenta.porArreglar,
        delConvenio: cuenta.delConvenio,
        porRegla: cuenta.porRegla,
        avisos: (informe.cuenta && informe.cuenta.aviso) || 0,
        donde: cuenta.donde,
        convenioCe: informe.convenioCe,
      });
    }
  }

  let escrito;
  try {
    escrito = await repo.documentos.actualizar(
      documento._id, { estado: pedido }, { esperaUpdatedAt: documento.updatedAt },
    );
  } catch (e) {
    if (!e || e.codigo !== 'conflicto') throw e;
    const ahora = await repo.documentos.obtener(documento._id);
    return fallo(
      409, 'conflicto',
      'Alguien ha cambiado este documento mientras cambiabas su estado. No se ha cambiado nada: vuelve a cargarlo.',
      { esperado: guardado, actual: ahora && ahora.updatedAt ? new Date(ahora.updatedAt).toISOString() : null },
    );
  }

  return Response.json({
    documentoId: documento._id,
    estado: pedido,
    anterior: actual,
    accion: transicion.accion,
    // Lo que el criterio de aceptación pregunta: si el PDF que se exporte ahora lleva marca de agua.
    marcaDeAgua: conMarcaDeAgua(pedido),
    documento: sinPlantilla(escrito || { ...documento, estado: pedido }),
  }, { headers: { 'Cache-Control': 'no-store' } });
});

module.exports = { GET, CAMBIAR };
