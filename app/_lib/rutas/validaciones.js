// GET /api/documentos/[id]/validaciones — los avisos del documento, agrupados por unidad.
//
// Es el panel de comprobaciones del E4: lo que hoy solo se ve DESPUÉS de generar el PDF, en la
// cajita roja del final de cada módulo, puesto donde se puede arreglar. Y es su criterio de
// aceptación: «los avisos del panel coinciden uno a uno con los de la cajita roja del PDF».
//
// ESTE FICHERO BUSCA; LA REGLA ESTÁ EN core/validaciones.js
//
// El reparto es el de siempre (docs/plan.md §2.2, y el comentario de core/validaciones.js): la regla
// —«los criterios de un RA reparten su peso»— vive en core/ y la comparten el motor del PDF, el
// prototipo y esta ruta; la BÚSQUEDA —qué RA hay, qué criterios tienen, en qué apartado están, qué
// fichas tiene cada módulo— es de cada lado, porque cada uno tiene delante datos distintos: el motor
// recorre `plantilla` + `datos` mientras pinta y aquí se recorre el árbol del documento sobre las
// filas del repositorio. Aquí no se escribe ni una regla nueva, y ni un texto de aviso.
//
// POR QUÉ SE RECORRE EL ÁRBOL DE core/arbol.js Y NO LA PLANTILLA A PELO
//
// Porque el árbol ya resuelve dos cosas que si no habría que volver a escribir: el ORDEN de lectura
// del documento —el mismo en el que el motor pinta, que es lo que hace que los dos listados se
// puedan comparar uno a uno— y la NUMERACIÓN de cada nodo («4.2» es el mismo «4.2» del PDF impreso y
// de la barra lateral, que es como la gente se refiere a un apartado en una reunión).
//
// EL CONVENIO DE LOS CRITERIOS ES EL DEL DOCUMENTO, Y EL MOTOR USA EL MISMO
//
// Hasta el E7 este panel llevaba el convenio ESTRICTO en una constante de este fichero, porque es el
// que imprimía el motor y el criterio de aceptación del E4 es que los dos listados coincidan uno a
// uno. Desde el E7 el convenio es del DOCUMENTO (`documento.comprobaciones.convenioCe`), y la
// coincidencia se sigue cumpliendo porque el generador lo recibe del mismo sitio: /pdf se lo pasa a
// `buildDocDefinition` leyéndolo del documento, igual que aquí. Un documento sin configurar usa el
// estricto, así que su panel y su PDF son exactamente los de antes.
//
// Lo que eso cuesta, y cómo se paga: en la PD de DAW, de los 34 avisos que imprime hoy el PDF, 22 no
// son erratas sino el otro convenio (los criterios suman 100 % dentro del RA) y 10 son descuadres de
// verdad (14,94 % donde debería haber 15 %). Mientras el documento siga con el convenio estricto no
// se esconden: el aviso de los que suman exactamente 100 % lo DICE con esas palabras en su `detalle`
// y lleva `convenio: 'cien_dentro_del_ra'`, y la respuesta trae el recuento (`delOtroConvenio`) para
// que el panel pueda separar «esto habrá que decidirlo» de «aquí hay una errata».
//
// Y CAMBIAR EL CONVENIO NO ES BAJARLE LA SEVERIDAD. Con el laxo esos 22 dejan de ser avisos porque
// SON CORRECTOS: es uno de los dos repartos legítimos. Lo decide la jefatura de estudios en
// /comprobaciones, queda apuntado con su nombre y su fecha, y el PDF cambia con el panel. Bajarle la
// severidad a la regla sigue sin poderse: es normativa (core/validaciones.js).
//
// QUÉ COMPRUEBA Y QUÉ NO
//
//   normativas, las que imprime el PDF (`impreso: true`):
//     criterios_de_ra     los criterios de un RA reparten su peso
//     suma_de_ra          la suma de las ponderaciones de los RA es 100 %
//   criterio del centro, solo del panel:
//     ra_sin_situacion    un RA que ninguna situación de aprendizaje trabaja
//     sa_sin_evaluacion   una situación de aprendizaje que no dice en qué evaluación va  ← nueva
//     sin_docente         una unidad que no lleva nadie
//
// Las otras tres de core/validaciones.js se quedan fuera, y no por olvido: `apartadoVacio` lo
// contesta ya la barra lateral con el `relleno` de cada nodo de /arbol —repetirlo aquí serían treinta
// avisos por documento que la pantalla ya pinta, y ahogarían las dos cosas para las que existe el
// panel—; `heredadoSinRevisar` necesita `origen: 'heredado'`, que lo crea el arrastre entre cursos
// del E5; y `copiasDesactualizadas` necesita apartados desvinculados de un texto compartido, y
// desvincular todavía no existe en la API, así que la lista sería siempre vacía.
//
// Esas tres SÍ SE PUEDEN CONFIGURAR desde el E7 —están en el catálogo de core/validaciones.js, con
// las demás de criterio del centro— y la configuración se guarda y se arrastra al curso siguiente
// igual que el resto. Lo que pasa es que este panel no las busca todavía, así que configurarlas no
// cambia nada hoy. Eso no se calla: /comprobaciones lo dice regla por regla con `enElPanel` y
// `motivo` (ver `FUERA_DEL_PANEL`, más abajo), para que la pantalla no ofrezca un interruptor que
// parezca roto.
//
// QUÉ NO APLICA A LA PROPUESTA PEDAGÓGICA DE ESO Y BACHILLERATO, Y POR QUÉ NO HAY QUE APAGAR NADA
//
// Las situaciones de aprendizaje de ESO y Bachillerato no van por resultados de aprendizaje sino por
// COMPETENCIAS ESPECÍFICAS (docs/mockup-v2/README.md, «lo que falta»), así que las cuatro
// comprobaciones que hablan de RA —`criterios_de_ra`, `suma_de_ra`, `ra_sin_situacion` y
// `sa_sin_evaluacion`— no tienen de qué hablar en una propuesta pedagógica. Lo que sí aplica es
// `sin_docente`: una materia sin profesorado asignado es el mismo problema que un módulo sin
// profesorado, y se arregla en el mismo sitio.
//
// LO QUE NO SE HA HECHO ES APAGARLAS POR TIPO DE DOCUMENTO, y es una decisión, no un descuido: no
// hace falta. Las cuatro se disparan solas si encuentran el campo del que viven, y en los cuatro
// documentos reales del departamento ese campo NO EXISTE. Medido al importarlos (`camposPorTipo` del
// informe del importador):
//
//   Propuesta de ESO 2025-26 y 2026-27            27 apartados · 3 materias · 22 texto_largo, 13 tabla
//   Propuesta de Bachillerato 2025-26             21 apartados · 2 materias · 18 texto_largo,  8 tabla
//   Propuesta de Bachillerato 2026-27             24 apartados · 3 materias · 21 texto_largo, 13 tabla
//
// Ni un `ponderacion_ra_ce`, ni un `ficha_situacion_aprendizaje`, ni un `auto.tabla_ra_ce`: las
// tablas de los decretos de ESO y Bachillerato (competencias específicas, criterios, saberes
// básicos) entran como tablas y no como ninguno de los estructurados de FP. Así que el panel de los
// cuatro documentos sale con lo que tiene que salir —una materia sin docente, nada más— y no hay
// ningún aviso que esconder. Las cuentas exactas están en test/estados.js.
//
// Y si algún día una propuesta trajera una tabla de ponderaciones, el aviso que saldría sería el
// correcto: eso no es una propuesta de ESO, o la tabla está donde no debe. Apagar la regla por tipo
// convertiría ese hallazgo en silencio, que es lo contrario de lo que este panel hace.
//
// QUIÉN LO VE
//
// Quien ve el documento, y nadie más: 401 sin identificar, 404 si es de otro departamento. No hay un
// permiso aparte porque es de lectura y porque quien tiene que verlo antes que nadie es la jefatura
// de estudios, que no edita nada y es la que aprueba (y `puedeAprobarse` es justo lo que va a mirar).
//
// POR QUÉ EL CÁLCULO SE EXPORTA APARTE (`informeDe`)
//
// Porque desde el E7 hay un segundo sitio que necesita la MISMA cuenta de errores: la puerta de
// aprobación (app/_lib/rutas/estado.js), que no puede aprobar un documento con errores y tiene que
// decir cuántos hay y dónde. Si esa ruta volviera a recorrer el árbol por su cuenta, el panel y la
// puerta podrían discrepar —y entonces la pantalla diría «se puede aprobar» y el botón respondería
// que no—, que es exactamente la avería que §2.2 de docs/plan.md existe para evitar.
//
// Así que `informeDe({ documento, repo })` hace todo el trabajo y se queda un paso antes de
// responder, igual que `definicionDe` en app/_lib/rutas/pdf.js. El GET solo abre el documento y lo
// serializa.

'use strict';

const Arbol = require('../../../core/arbol');
const { personasQueDanClase } = require('./unidades');
const Sa = require('../../../core/sa');
const Val = require('../../../core/validaciones');
const E = require('../../../core/estructurados');
const {
  conErrores, abrirDocumento, seccionesConCampo, raDeTablas, tituloDelTomo, TIPO_RA_CE,
  comprobacionesDe,
} = require('./comun');

// LAS COMPROBACIONES QUE ESTE PANEL BUSCA DE VERDAD, por su código estable. Las otras tres del
// catálogo de core/validaciones.js se quedan fuera (ver la cabecera), y aquí consta POR QUÉ cada
// una, porque /comprobaciones lo sirve tal cual: una casilla que no hace nada tiene que decir que no
// hace nada, o quien la mueva creerá que la aplicación no le hace caso.
const REGLAS_DEL_PANEL = Object.freeze([
  'criterios_de_ra', 'suma_de_ra', 'sin_docente', 'ra_sin_situacion', 'sa_sin_evaluacion',
]);

const FUERA_DEL_PANEL = Object.freeze({
  apartado_vacio: 'Lo contesta ya la barra lateral con el `relleno` de cada nodo de /arbol: repetirlo aquí serían treinta avisos por documento que la pantalla ya pinta, y ahogarían las dos cosas para las que existe el panel.',
  heredado_sin_revisar: 'Necesita el `origen: heredado` de cada apartado, que el panel no lee todavía: lo enseña la vista de revisión del E5, apartado por apartado.',
  copia_desactualizada: 'Necesita apartados desvinculados de un texto compartido, y desvincular todavía no existe en la API: la lista sería siempre vacía.',
});

// La misma clave plana que usa core/arbol.js para la matriz (sección × unidad): el \u0000 impide que
// dos claves distintas se confundan, porque ningún id lleva un carácter nulo.
const clave = (unidadId, seccion) => `${unidadId || ''}\u0000${seccion}`;

// Cada aviso sale de core/validaciones.js con su severidad, su título y su detalle, y aquí se le
// añade lo que solo sabe quien ha buscado:
//
//   regla    cuál es, para que la interfaz pueda agrupar y filtrar sin leer el texto
//   impreso  si sale en la cajita roja del PDF. Lo decide este lado y no la regla, porque quien
//            elige qué imprime es el motor: de las siete comprobaciones usa solo las dos normativas
//   destino  el apartado al que hay que ir a arreglarlo, que es lo que le faltaba al panel del v1
const marcar = (avisos, regla, destino, impreso) => avisos.map((a) => Object.assign({}, a, {
  regla, impreso: !!impreso, destino,
}));

// Las fichas que guarda el valor de un campo `ficha_situacion_aprendizaje` (`multiple` o no).
const fichasDe = (valor) => (Array.isArray(valor) ? valor : (valor ? [valor] : [])).filter(Boolean);

// Los avisos de un campo de ponderaciones, con EL MISMO ALCANCE QUE EL MOTOR, que es lo que hace que
// los dos listados coincidan uno a uno (`pintarPonderaciones` de motor/render-generico.js):
//
//   · una tabla sin `ra` legible no se comprueba y además apaga la suma de los RA, porque entonces
//     el motor imprime la rejilla en crudo y el campo ya no es un reparto completo;
//   · la suma de los RA solo se comprueba si el campo tiene VARIAS tablas: una tabla suelta suele
//     ser un fragmento y sumarla daría un error falso. Ese filtro es de aquí; la regla, de core/.
function avisosDePonderaciones(valor, destino, impreso, convenioCe) {
  if (valor === undefined || valor === null) return [];
  const tablas = Array.isArray(valor) ? valor : [valor];
  const out = [];
  const pesos = [];
  let estructurado = true;
  for (const p of tablas) {
    if (!p || p.ra === null || p.ra === undefined) { estructurado = false; continue; }
    pesos.push(p.ponderacion);
    const pesosCe = (p.ce || []).map((c) => c.ponderacion);
    out.push(...marcar(
      Val.avisosCriteriosDeRa({ ra: p.ra, peso: p.ponderacion, pesosCe }, convenioCe),
      'criterios_de_ra', destino, impreso,
    ));
  }
  if (estructurado && tablas.length > 1) {
    out.push(...marcar(Val.avisosSumaRa(pesos), 'suma_de_ra', destino, impreso));
  }
  return out;
}

// Todo el panel menos la respuesta. Recibe el documento ya abierto —con los apartados retirados ya
// podados por `abrirDocumento`— y devuelve el objeto que sirve el GET.
async function informeDe({ documento, repo }) {
  // LA CONFIGURACIÓN DE ESTE DOCUMENTO, resuelta una vez. Un documento sin configurar devuelve lo de
  // serie —convenio estricto y las ocho comprobaciones activas con su severidad de siempre—, así que
  // el camino de abajo es el de antes del E7 letra por letra.
  const config = comprobacionesDe(documento);

  // Sin reordenar: el orden de `unidades.listar()` es el del documento y el del tomo del PDF.
  const unidades = await repo.unidades.listar(documento._id);
  const apartados = await repo.apartados.listar(documento._id);

  const arbol = Arbol.construirArbol({
    plantilla: documento.plantilla,
    unidades,
    apartados,
    clave: documento._id,
    titulo: tituloDelTomo(documento, null),
  });

  // Los campos de cada sección, una sola vez: con 250 apartados, bajar la plantilla por cada nodo
  // sería recorrerla doscientas cincuenta veces.
  const deLaSeccion = new Map();
  (function bajar(secs) {
    for (const sec of (secs || [])) {
      deLaSeccion.set(sec.id, { campos: sec.campos || [], repetidor: !!sec.repetidor });
      bajar(sec.hijos);
    }
  })(documento.plantilla && documento.plantilla.secciones);

  const valoresDe = new Map();
  for (const fila of apartados) valoresDe.set(clave(fila.unidadId, fila.seccion), fila.valores || {});

  // QUIÉN LLEVA CADA GRUPO. El panel existe para saber a quién hay que avisar: sin esto diría «este
  // módulo tiene tres errores» sin decir de quién son. Se recorta igual que en /unidades —el nombre
  // y el rol, nunca el correo— y se resuelve aquí porque los grupos solo guardan ids.
  //
  // En los apartados comunes la responsable es la jefatura del departamento, que es la regla de
  // core/permisos.js: los comunes los escribe ella, salvo los que haya delegado, y a quién se le ha
  // delegado qué se ve en el reparto.
  const personas = new Map();
  for (const p of await personasQueDanClase(repo, documento)) {
    personas.set(p._id, { _id: p._id, nombre: p.nombre, rol: p.rol });
  }
  const jefatura = [...personas.values()].filter((p) => p.rol === 'jefe_departamento');

  // Los RA que declara cada módulo, de su propio apartado de resultados de aprendizaje y criterios
  // de evaluación. Es contra esta lista contra la que se dice qué RA no trabaja ninguna situación.
  const raDelModulo = new Map();
  for (const u of unidades) {
    const nums = new Set();
    for (const { seccion, campo } of seccionesConCampo(documento.plantilla, TIPO_RA_CE)) {
      const valores = valoresDe.get(clave(u.unidadId, seccion));
      for (const num of raDeTablas(valores ? valores[campo] : undefined)) nums.add(num);
    }
    raDelModulo.set(u.unidadId, [...nums].sort((a, b) => a - b));
  }

  // Un grupo por unidad, en el orden del documento, más el de los apartados comunes. Se devuelven
  // todos, incluso los que no tienen ningún aviso: la pregunta que se le hace a esta pantalla es
  // «qué módulo tengo que mirar», y un módulo que no sale no se distingue de un módulo que está bien.
  const comunes = {
    unidadId: null, titulo: 'Apartados comunes', num: null, seccion: null,
    responsables: jefatura, avisos: [], fichas: [],
  };
  const grupos = new Map();
  const porId = new Map(unidades.map((u) => [u.unidadId, u]));
  const nodos = Arbol.aplanar(arbol);
  for (const nodo of nodos) {
    if (nodo.tipo !== 'unidad') continue;
    const unidad = porId.get(nodo.unidadId) || {};
    grupos.set(nodo.unidadId, {
      unidadId: nodo.unidadId, titulo: nodo.titulo, num: nodo.num, seccion: nodo.seccion,
      responsables: (unidad.docentes || []).map((id) => personas.get(id)).filter(Boolean),
      avisos: [], fichas: [],
    });
  }
  const grupoDe = (unidadId) => (unidadId ? grupos.get(unidadId) : comunes) || comunes;

  // ---- las normativas, apartado por apartado y en el orden del documento
  for (const nodo of nodos) {
    if (nodo.tipo !== 'apartado') continue;
    const info = deLaSeccion.get(nodo.seccion);
    if (!info || !info.campos.length) continue;

    const valores = valoresDe.get(clave(nodo.unidadId, nodo.seccion)) || {};
    const grupo = grupoDe(nodo.unidadId);
    const destino = { seccion: nodo.seccion, unidadId: nodo.unidadId || null };
    // La cajita roja solo existe dentro de un módulo: el motor imprime los avisos que ha reunido
    // mientras pintaba esa instancia, y los de los apartados comunes se quedan sin imprimir.
    const impreso = !!nodo.unidadId;

    // Un repetidor no guarda `{ campo: valor }`: guarda `{ items: [...] }`, y el motor pinta los
    // campos DE CADA ÍTEM. Así que aquí se mira dentro igual que allí.
    const juegos = info.repetidor
      ? (Array.isArray(valores.items) ? valores.items : [])
      : [valores];

    for (const juego of juegos) {
      for (const campo of info.campos) {
        if (campo.tipo === E.TIPO_PONDERACION) {
          grupo.avisos.push(...avisosDePonderaciones(juego[campo.id], destino, impreso, config.convenioCe));
        } else if (campo.tipo === E.TIPO_FICHA) {
          for (const ficha of fichasDe(juego[campo.id])) grupo.fichas.push({ ficha, destino });
        }
      }
    }
  }

  // ---- las del criterio del centro, por unidad
  for (const grupo of grupos.values()) {
    const unidad = porId.get(grupo.unidadId) || {};
    const suyo = { seccion: grupo.seccion, unidadId: grupo.unidadId };

    // Primero el que impide trabajar: mientras la unidad no tenga profesorado, nadie salvo la
    // jefatura puede escribir en ella, así que lo demás es secundario.
    grupo.avisos.unshift(...marcar(
      Val.sinDocente(grupo.titulo, grupo.responsables.length), 'sin_docente', suyo, false,
    ));

    const fichas = grupo.fichas.map((x) => x.ficha);
    const donde = grupo.fichas.length ? grupo.fichas[0].destino : suyo;
    grupo.avisos.push(...marcar(
      Val.avisosRaSinSituacion(Sa.raSinSituacion(fichas, raDelModulo.get(grupo.unidadId) || [])),
      'ra_sin_situacion', donde, false,
    ));
    // Ficha a ficha, para que cada aviso lleve el apartado donde está esa ficha: en diez de los once
    // módulos de la PD real están en la sección repetidora y en el otro, en el apartado padre.
    for (const { ficha, destino } of grupo.fichas) {
      grupo.avisos.push(...marcar(Val.avisosSaSinEvaluacion([ficha]), 'sa_sin_evaluacion', destino, false));
    }
  }

  // LA CONFIGURACIÓN SE APLICA AQUÍ Y EN UN SOLO SITIO: se quitan los avisos de las comprobaciones
  // apagadas y se reescribe la severidad de las que la tengan cambiada (`aplicarConfig` de
  // core/validaciones.js). Tiene que ser ANTES de `cuenta` y de `puedeAprobarse`, porque la gracia de
  // bajarle la severidad a una comprobación es justamente que deje de impedir la aprobación.
  //
  // Las dos normativas pasan de largo, así que esto NO PUEDE CAMBIAR EL PDF: la cajita roja solo
  // imprime esas dos. Lo comprueba test/reglas.js.
  const salida = [comunes, ...grupos.values()].map((g) => {
    const avisos = Val.aplicarConfig(config, g.avisos);
    return {
      unidadId: g.unidadId,
      titulo: g.titulo,
      num: g.num,
      responsables: g.responsables,
      cuenta: Val.cuenta(avisos),
      avisos,
    };
  });

  const todos = salida.flatMap((g) => g.avisos);

  return {
    documentoId: documento._id,
    // Qué convenio se ha usado para contar los criterios. Viaja en la respuesta porque cambia lo que
    // se ve, y quien lea el panel tiene que poder saber con qué regla se ha medido.
    convenioCe: config.convenioCe,
    // Y qué comprobaciones están apagadas en este documento, por su código. Viaja por el mismo
    // motivo: un panel con cero avisos porque todo está bien y uno con cero avisos porque alguien
    // apagó las comprobaciones son la misma pantalla, y no son lo mismo. La tabla entera, con quién
    // la cambió, está en /comprobaciones.
    desactivadas: Val.CODIGOS.filter((c) => !config.reglas[c].activa),
    cuenta: Val.cuenta(todos),
    total: todos.length,
    // Los que van a salir en la cajita roja del PDF, y cuántos de ellos son el otro convenio y no
    // una errata (ver la cabecera).
    impresos: todos.filter((a) => a.impreso).length,
    delOtroConvenio: todos.filter((a) => a.convenio === Val.CIEN_DENTRO_DEL_RA).length,
    // Con errores abiertos el documento no se aprueba; los avisos no bloquean. Desde el E7 esto no
    // es solo una cifra para la pantalla: es LA MISMA que mira la puerta de aprobación
    // (app/_lib/rutas/estado.js), que lee este informe en lugar de volver a contar.
    puedeAprobarse: Val.puedeAprobarse(todos),
    grupos: salida,
  };
}

const GET = conErrores(async (peticion, parametros) => {
  const { fallo, documento, repo } = await abrirDocumento(peticion, parametros);
  if (fallo) return fallo;

  return Response.json(
    await informeDe({ documento, repo }),
    { headers: { 'Cache-Control': 'no-store' } },
  );
});

module.exports = { GET, informeDe, REGLAS_DEL_PANEL, FUERA_DEL_PANEL };
