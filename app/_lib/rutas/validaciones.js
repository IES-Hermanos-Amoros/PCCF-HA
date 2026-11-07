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
// EL CONVENIO DE LOS CRITERIOS ES EL DEL MOTOR, A PROPÓSITO
//
// El motor imprime con el convenio ESTRICTO (`peso_del_ra`: los criterios suman el peso de su RA) y
// el prototipo acepta los dos. Este panel usa el estricto, porque con cualquier otro sus avisos
// dejarían de coincidir con los del PDF y el criterio del evolutivo no se cumpliría.
//
// Lo que eso cuesta, y cómo se paga: en la PD de DAW, de los 34 avisos que imprime hoy el PDF, 22 no
// son erratas sino el otro convenio (los criterios suman 100 % dentro del RA) y 10 son descuadres de
// verdad (14,94 % donde debería haber 15 %). La decisión de qué convenio vale es del departamento y
// está sin tomar. Así que no se esconden: el aviso de los que suman exactamente 100 % lo DICE con
// esas palabras en su `detalle` y lleva `convenio: 'cien_dentro_del_ra'`, y la respuesta trae el
// recuento (`delOtroConvenio`) para que el panel pueda separar «esto habrá que decidirlo» de «aquí
// hay una errata». La severidad no cambia: bajarla sería decidir el convenio por la puerta de atrás.
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
// Y NO SE AÑADE LA TABLA DE CONFIGURACIÓN DE REGLAS: eso es el E7. Lo único configurable hoy es el
// convenio, y entra por una constante de este fichero que se lee en una línea.
//
// QUIÉN LO VE
//
// Quien ve el documento, y nadie más: 401 sin identificar, 404 si es de otro departamento. No hay un
// permiso aparte porque es de lectura y porque quien tiene que verlo antes que nadie es la jefatura
// de estudios, que no edita nada y es la que aprueba (y `puedeAprobarse` es justo lo que va a mirar).

'use strict';

const Arbol = require('../../../core/arbol');
const Sa = require('../../../core/sa');
const Val = require('../../../core/validaciones');
const E = require('../../../core/estructurados');
const {
  conErrores, abrirDocumento, seccionesConCampo, raDeTablas, tituloDelTomo, TIPO_RA_CE,
} = require('./comun');

// El convenio con el que se cuentan los criterios. Es el del PDF (ver la cabecera). Cambiarlo es
// cambiar esta línea, no una decisión escondida en dos ficheros.
const CONVENIO_CE = Val.CONVENIOS_CE.PESO_DEL_RA;

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
function avisosDePonderaciones(valor, destino, impreso) {
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
      Val.avisosCriteriosDeRa({ ra: p.ra, peso: p.ponderacion, pesosCe }, CONVENIO_CE),
      'criterios_de_ra', destino, impreso,
    ));
  }
  if (estructurado && tablas.length > 1) {
    out.push(...marcar(Val.avisosSumaRa(pesos), 'suma_de_ra', destino, impreso));
  }
  return out;
}

const GET = conErrores(async (peticion, parametros) => {
  const { fallo, documento, repo } = await abrirDocumento(peticion, parametros);
  if (fallo) return fallo;

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
  for (const p of await repo.usuarios.listar({ departamento: documento.departamento })) {
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
          grupo.avisos.push(...avisosDePonderaciones(juego[campo.id], destino, impreso));
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
      Val.sinDocente(grupo.titulo, (unidad.docentes || []).length), 'sin_docente', suyo, false,
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

  const salida = [comunes, ...grupos.values()].map((g) => ({
    unidadId: g.unidadId,
    titulo: g.titulo,
    num: g.num,
    responsables: g.responsables,
    cuenta: Val.cuenta(g.avisos),
    avisos: g.avisos,
  }));

  const todos = salida.flatMap((g) => g.avisos);

  return Response.json({
    documentoId: documento._id,
    // Qué convenio se ha usado para contar los criterios. Viaja en la respuesta porque cambia lo que
    // se ve, y quien lea el panel tiene que poder saber con qué regla se ha medido.
    convenioCe: CONVENIO_CE,
    cuenta: Val.cuenta(todos),
    total: todos.length,
    // Los que van a salir en la cajita roja del PDF, y cuántos de ellos son el otro convenio y no
    // una errata (ver la cabecera).
    impresos: todos.filter((a) => a.impreso).length,
    delOtroConvenio: todos.filter((a) => a.convenio === Val.CIEN_DENTRO_DEL_RA).length,
    // Con errores abiertos el documento no se aprueba; los avisos no bloquean. La puerta la abre el
    // E7, pero la cifra se sirve ya: es lo que mira quien aprueba.
    puedeAprobarse: Val.puedeAprobarse(todos),
    grupos: salida,
  }, { headers: { 'Cache-Control': 'no-store' } });
});

module.exports = { GET };
