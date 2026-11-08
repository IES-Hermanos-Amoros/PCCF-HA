// POST /api/documentos/[id]/siguiente-curso — crea el documento del curso siguiente a partir de este.
//
// Es el arrastre entre cursos (docs/plan.md §2.1): en septiembre nadie escribe una programación desde
// cero, revisa la del año pasado. Este fichero es el único que CREA un documento a partir de otro; la
// importación crea uno desde un Word, y las dos cosas no se parecen en nada salvo en que terminan en
// el mismo repositorio.
//
// LA SECUENCIA
//
//   1. quién pregunta (401) y si ve el documento (404): docs/api.md, «404 y no 403»;
//   2. si puede crear el curso siguiente (403): admin y jefatura de departamento, en su departamento.
//      Quien ve el documento y no puede crearle el siguiente —un docente, la jefatura de estudios— lo
//      recibe como 403, porque ya sabe que el documento existe;
//   3. el curso nuevo: el que pida el cuerpo, o el siguiente al del documento por omisión. Tiene que
//      tener la forma 2027-28 y ser posterior al del documento de partida;
//   4. que no exista ya ese curso de ese documento: 409, con el id del que hay;
//   5. la copia (ver `filasDelSiguiente`), que se escribe en tres llamadas y que, si una falla, deja el
//      documento a medias borrado, igual que la importación (app/_lib/rutas/importar.js).
//
// QUÉ SE COPIA Y QUÉ NO, Y POR QUÉ
//
// Se copia lo que describe el contenido del departamento, que es lo que el curso nuevo arranca con
// él: la plantilla y su versión —ENTERA, con los apartados y los campos retirados dentro—, las
// unidades con sus docentes, los apartados con sus valores tal cual, los textos compartidos, el
// reparto de apartados comunes (`asignaciones`) y —desde el E7— las COMPROBACIONES del documento,
// con su registro de quién las cambió.
//
// LAS COMPROBACIONES SE COPIAN, Y ES LA DECISIÓN QUE IMPORTA DE ESTE EVOLUTIVO: el criterio del
// centro no se reinicia cada septiembre. Si no viajaran, cada curso nuevo volvería al convenio de
// serie y a las ocho comprobaciones activas, y la jefatura de estudios tendría que volver a decidir
// en septiembre lo que ya decidió —y, peor, sin enterarse: un documento que el curso pasado se podía
// aprobar aparecería de pronto con avisos nuevos sin que nadie hubiera cambiado nada—. Es el mismo
// motivo por el que viaja el reparto de los módulos. El registro de cambios va dentro del campo, así
// que el curso nuevo nace sabiendo con qué criterio se mide y quién lo decidió, igual que hereda el
// registro de cambios de la estructura dentro de `plantilla`.
//
// No se copia lo que pertenece al curso que se cierra:
//
//   · el `estado` (aprobado, en revisión): el curso nuevo nace en borrador, porque nadie lo ha aprobado;
//   · el `_id`, `creado` y `updatedAt`: son del documento viejo;
//   · el `origen` del documento, que es el nombre del Word del que salió: este no sale de ningún Word;
//   · el `anteriorId` del documento de partida: el nuevo apunta AL de partida, y la cadena de cursos
//     se sigue saltando de uno a otro, no se copia hacia atrás;
//   · `origen`, `revisadoPor` y `revisadoEn` de cada apartado: todos nacen `heredado`, sin revisor.
//     Es lo que hace que el progreso empiece en 0 % (docs/plan.md §5, E5);
//   · LOS COMENTARIOS (y el historial, cuando exista). Lo anunciaba docs/plan.md —«lo que no se copia
//     son los comentarios ni el historial»— y desde el E7, que es cuando existen, sigue siendo
//     verdad: aquí no se lee ni se escribe la colección `comentarios`. Y es a propósito, no un
//     olvido: un comentario habla del texto de UN curso («esto de 2026-27 hay que actualizarlo»), así
//     que copiarlo resucitaría en septiembre preguntas ya contestadas, como si estuvieran pendientes
//     y firmadas por quien nunca las hizo en ese documento. El curso nuevo arranca con la
//     conversación en blanco, y la del curso que se cierra se queda donde se escribió: se llega a
//     ella por `anteriorId`, que es la única relación entre los dos documentos. Lo comprueba
//     test/coordinacion.js;
//   · el título de cada módulo: se toma el del catálogo para el curso NUEVO (`tituloDe`), no el del
//     viejo. Los títulos cambian de curso a curso (core/unidades.js), y un título de 2025-26 en un
//     curso 2027-28 sería el error que el catálogo vino a evitar. Si el módulo no está en el catálogo
//     se conserva el suyo, que es lo único que se sabe de él.
//
// Y ojo con lo que SÍ se copia aunque sea del curso viejo: los docentes de cada módulo y las
// asignaciones de los apartados comunes. Se copian porque el reparto de un curso es el punto de
// partida del siguiente y la jefatura lo corrige; no se reparte de cero cada septiembre. Quien lleva
// un módulo en el curso nuevo puede no ser quien lo llevaba: por eso el reparto viaja, y la jefatura
// lo revisa (docs/api.md, `PUT .../docentes`).
//
// `anteriorId` es la única relación entre los dos documentos, y el de partida no se toca.
//
// Es CommonJS y no sabe que está dentro de Next (docs/api.md, primera regla de forma).

'use strict';

const Unidades = require('../../../core/unidades');
const { conErrores, abrirDocumento, leerJson, fallo, malaPeticion, sinPlantilla, CURSO_RE, cursoSiguiente } = require('./comun');
const { SIN_PERMISO } = require('../usuario');

// Quién crea el curso siguiente: la jefatura del departamento y el soporte. El docente no crea
// documentos y la jefatura de estudios no edita ni crea nada: es quien aprueba (docs/api.md).
const PUEDEN_CREAR_CURSO = ['admin', 'jefe_departamento'];

// Lo que es un valor de otro documento, y no se puede compartir por referencia: `structuredClone`
// para que tocar el documento nuevo no toque el de partida, aunque el repositorio ya copie.
const copia = (valor) => structuredClone(valor);

// ---------------------------------------------------------------- la copia, en seco

// Las filas del documento nuevo a partir de las del de partida. Es una función pura: no toca el
// repositorio, así que lo que se copia y lo que no se decide en un solo sitio y se puede leer de
// arriba abajo. `origen` es el documento de partida; `curso` el del nuevo.
function filasDelSiguiente(origen, { curso, unidades, apartados, compartidos, plantillaCompleta }) {
  const documento = {
    tipo: origen.tipo,
    ciclo: origen.ciclo === undefined ? null : origen.ciclo,
    curso,
    departamento: origen.departamento,
    estado: 'borrador',
    // LA PLANTILLA ENTERA, con lo retirado dentro, y no la podada que ve el resto de la aplicación
    // (`abrirDocumento` de ./comun.js sustituye `documento.plantilla` por la vigente). Si se copiara
    // la podada, retirar un apartado o un campo y arrastrar el curso BORRARÍA lo retirado, y eso
    // contradice la garantía de core/plantilla.js: «retirar no borra». Peor aún, el contenido de lo
    // retirado sí se copia —los apartados se copian por su id, no por lo que diga la plantilla—, así
    // que quedaría en el documento nuevo sin ningún campo al que pertenecer: invisible, imposible de
    // restaurar, y volviendo a aparecer el día que alguien creara un campo que se llamara igual.
    plantilla: copia(plantillaCompleta || origen.plantilla),
    plantillaVersion: origen.plantillaVersion === undefined ? null : origen.plantillaVersion,
    anteriorId: origen._id,
    asignaciones: copia(origen.asignaciones || {}),
    // `null` y no `{}` cuando no hay nada configurado: así el documento nuevo queda igual que uno
    // recién importado y `normalizarConfig` le da lo de serie (core/validaciones.js).
    comprobaciones: origen.comprobaciones ? copia(origen.comprobaciones) : null,
    origen: null,
  };

  // El orden de `unidades` es el del documento y el del tomo: se conserva tal cual, porque
  // `crearMuchos` lo fija por el orden de creación.
  const unidadesNuevas = unidades.map((u) => ({
    unidadId: u.unidadId,
    titulo: Unidades.tituloDe(u.unidadId, curso) || u.titulo,
    num: u.num === undefined ? null : u.num,
    grupo: u.grupo === undefined ? null : u.grupo,
    docentes: [...(u.docentes || [])],
  }));

  // Todos los apartados que tenían fila, con su contenido intacto y sin revisor: el curso nuevo no
  // ha mirado nada todavía. Los apartados de la plantilla sin escribir no tienen fila y no se crean:
  // se ven vacíos igual que en el documento de partida.
  const apartadosNuevos = apartados.map((a) => ({
    seccion: a.seccion,
    unidadId: a.unidadId === undefined ? null : a.unidadId,
    valores: copia(a.valores || {}),
    origen: 'heredado',
    revisadoPor: null,
    revisadoEn: null,
  }));

  // Los textos compartidos con todos sus campos salvo la identidad de la fila: el `cid` se conserva,
  // que es el que las referencias `{ ref }` de los apartados copiados usan.
  const compartidosNuevos = compartidos.map((c) => {
    const { _id, documentoId, ...resto } = c;
    return copia(resto);
  });

  return { documento, unidades: unidadesNuevas, apartados: apartadosNuevos, compartidos: compartidosNuevos };
}

// ---------------------------------------------------------------- el cuerpo

// El cuerpo es opcional: sin él, el curso es el siguiente al del documento. Un cuerpo que sí se manda
// tiene que ser un objeto JSON; uno vacío cuenta como ausente.
async function cuerpoOpcional(peticion) {
  const texto = await peticion.text();
  if (!texto.trim()) return { cuerpo: {} };
  try {
    const cuerpo = JSON.parse(texto);
    if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) {
      return { fallo: malaPeticion('El cuerpo de la petición tiene que ser un objeto JSON.') };
    }
    return { cuerpo };
  } catch (e) {
    return { fallo: malaPeticion('El cuerpo de la petición tiene que ser JSON.') };
  }
}

// ---------------------------------------------------------------- POST

const CREAR = conErrores(async (peticion, parametros) => {
  const abierto = await abrirDocumento(peticion, parametros);
  if (abierto.fallo) return abierto.fallo;
  const { usuario, documento: origen, repo, plantillaCompleta } = abierto;

  if (!PUEDEN_CREAR_CURSO.includes(usuario.rol)) {
    return SIN_PERMISO('Solo la jefatura del departamento crea el documento del curso siguiente.');
  }

  const { fallo: falloCuerpo, cuerpo } = await cuerpoOpcional(peticion);
  if (falloCuerpo) return falloCuerpo;

  if (cuerpo.curso !== undefined && typeof cuerpo.curso !== 'string') {
    return malaPeticion('El curso tiene que ser un texto con la forma 2027-28.');
  }

  // El curso de partida. Un documento sin curso no tiene de qué deducir el siguiente: en ese caso el
  // curso se pide explícitamente, y no se inventa.
  const cursoDePartida = CURSO_RE.test(origen.curso || '') ? origen.curso : null;
  const pedido = typeof cuerpo.curso === 'string' ? cuerpo.curso.trim() : '';
  let curso = pedido;
  if (!curso) {
    if (!cursoDePartida) {
      return malaPeticion('Este documento no tiene curso del que deducir el siguiente: dime el curso nuevo, con la forma 2027-28.');
    }
    curso = cursoSiguiente(cursoDePartida);
  }
  if (!CURSO_RE.test(curso)) {
    return malaPeticion(`El curso «${curso}» no tiene la forma 2027-28.`);
  }
  if (cursoDePartida && !(curso > cursoDePartida)) {
    return malaPeticion(`El curso nuevo tiene que ser posterior al del documento de partida, «${cursoDePartida}».`);
  }

  // El mismo documento, para el mismo curso: un documento es (tipo, ciclo, departamento), y el curso
  // lo distingue. Esta comprobación es previa, no una garantía: dos peticiones casi simultáneas
  // pueden pasarla las dos. El índice de `documentos` en repositorio/mongo.js no es único, y ese
  // fichero no es de este evolutivo; queda anotado en el informe.
  const iguales = await repo.documentos.listar({ tipo: origen.tipo, departamento: origen.departamento, curso });
  const mismo = iguales.find((d) => (d.ciclo || null) === (origen.ciclo || null));
  if (mismo) {
    return fallo(
      409, 'conflicto',
      `Ya existe el documento de ${curso} para este departamento. No se ha creado nada.`,
      { documentoId: mismo._id },
    );
  }

  const [unidades, apartados, compartidos] = await Promise.all([
    repo.unidades.listar(origen._id),
    repo.apartados.listar(origen._id),
    repo.compartidos.listar(origen._id),
  ]);
  const filas = filasDelSiguiente(origen, { curso, unidades, apartados, compartidos, plantillaCompleta });

  // Un documento a medias es peor que ninguno: sale en la lista y no se puede abrir bien. Si alguna
  // escritura falla, se borra lo escrito y se devuelve el error, igual que la importación.
  const nuevo = await repo.documentos.crear(filas.documento);
  try {
    if (filas.unidades.length) await repo.unidades.crearMuchos(nuevo._id, filas.unidades);
    if (filas.apartados.length) await repo.apartados.crearMuchos(nuevo._id, filas.apartados);
    if (filas.compartidos.length) await repo.compartidos.crearMuchos(nuevo._id, filas.compartidos);
  } catch (e) {
    await repo.documentos.borrar(nuevo._id).catch(() => {});
    throw e;
  }

  return Response.json({
    documento: sinPlantilla(nuevo),
    copiados: {
      unidades: filas.unidades.length,
      apartados: filas.apartados.length,
      compartidos: filas.compartidos.length,
    },
  }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
});

module.exports = { CREAR, filasDelSiguiente, PUEDEN_CREAR_CURSO };
