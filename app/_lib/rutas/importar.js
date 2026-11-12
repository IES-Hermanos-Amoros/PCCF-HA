// POST /api/documentos/importar — sube un .docx, concilia sus módulos y lo guarda en el repositorio.
//
// Es la única ruta que ESCRIBE un documento entero, y por eso es la que más cuida el orden: nada se
// escribe hasta que todo lo que puede fallar por culpa de quien sube el fichero ya ha fallado. Así
// un 400 deja el repositorio como estaba (docs/api.md, errores).
//
// LA SECUENCIA
//
//   1. quién pregunta (401) y si puede importar (403: solo admin y jefe de departamento);
//   2. el formulario: los campos obligatorios, el `tipo` —que es quien decide si hace falta el
//      `ciclo`— y que el departamento sea el de quien importa (403) salvo para el admin. Un jefe de
//      departamento no crea documentos en el departamento de al lado;
//   3. el .docx: se lee con motor/importar-docx.js. Un fichero que no es un Word da 400. Y si el
//      documento es de un tipo que no lleva unidades pero trae bloques de módulo, 400 (ver abajo,
//      «las unidades son de la PD y de la propuesta»);
//   4. la conciliación de cada módulo con el catálogo (core/conciliar.js), que necesita el ciclo y el
//      curso: por eso el formulario los pide (docs/api.md, «Por qué la importación exige el ciclo»);
//   5. los módulos que no se reconocen: sin `forzar` se responde 400 con la lista y no se escribe
//      nada. Con `forzar=1` se importan con el id derivado del título (core/documento.js), y la
//      respuesta dice cuáles son;
//   6. la escritura. Las unidades van en UNA sola llamada a `crearMuchos`: el repositorio fija su
//      orden por el de creación, y ese orden es el del tomo (docs/plan.md, «Lo que ha dejado el E0»).
//
// Es CommonJS y no sabe que está dentro de Next (docs/api.md, primera regla de forma). El envoltorio
// de app/api/documentos/importar/route.js es el que pone `maxDuration`: la importación de la PD real
// tarda cerca de seis segundos (docs/interfaz-web.md §5, aviso nº 5).

'use strict';

const { importarDocx } = require('../../../motor/importar-docx');
const { conciliar, ETIQUETAS_COMO } = require('../../../core/conciliar');
const { aFilas, idDeTitulo } = require('../../../core/documento');
const { TIPOS_SIN_CICLO, esActiva, versionesDe, siguienteVersion } = require('../../../core/versiones');
const { obtenerRepositorio } = require('../repositorio');
const { usuarioDeLaPeticion, SIN_IDENTIFICAR, SIN_PERMISO } = require('../usuario');
const { conErrores, fallo, malaPeticion, sinPlantilla } = require('./comun');

// Solo la jefatura de departamento y el soporte. El docente edita sus módulos, no crea documentos; y
// la jefatura de estudios no edita nada: es quien aprueba (docs/api.md, «Quién puede importar»).
const PUEDEN_IMPORTAR = ['admin', 'jefe_departamento'];

// ================================================================ QUÉ TIPOS SE ADMITEN, Y POR QUÉ
//
// Hasta el E7 solo la PD, a propósito: el importador leía los otros dos, pero su camino hasta el PDF
// no estaba probado y era mejor negarse que guardar un documento que luego se exporta mal.
//
// El E7 lo prueba con los documentos reales del departamento, y ahí entró la memoria y NO entró el
// PCCF: sus apartados numerados están escritos con estilos propios del documento —`Estilo1`,
// `Estilo3`, `Estilo4`— que no declaran nivel de esquema, así que ni Word los considera títulos y el
// importador no encontraba estructura: 9 apartados en el de DAW —nueve `Título 4` y `Título 5`
// colgando de la nada— y 0 en el de SMR.
//
// Eso ya no es verdad. El importador tiene ahora un respaldo: cuando la deducción por estilos se
// queda sin tronco, lee la TABLA DE CONTENIDOS que el propio documento lleva dentro y de ahí saca qué
// estilos llevan los títulos y a qué nivel (motor/importar-docx.js, «respaldo: el índice del
// documento»). En los dos PCCF las 22 entradas del índice casan con un párrafo del cuerpo y los tres
// estilos se usan en exclusiva para esos títulos, así que la estructura sale entera. Los números con
// los que se decide admitirlo:
//
//   Memoria del departamento 2026-27    43 apartados · 0 módulos · el 96 % del texto del cuerpo
//   PCCF de DAW                         31 apartados · 0 módulos · el 99 % del texto del cuerpo
//   PCCF de SMR                         22 apartados · 0 módulos · el 98 % del texto del cuerpo
//
// Y su camino hasta el PDF y hasta el Word, que es lo que faltaba por probar: el PCCF de SMR sale en
// 20 páginas y el de DAW en 35, y el Word exportado vuelve a entrar por el importador con los mismos
// apartados. Ninguno de los dos lleva bloques repetidos, así que entran como un solo tomo de
// apartados comunes (ver abajo, «las unidades son de la PD y de la propuesta»).
//
// Lo que NO se ha hecho es bajar el umbral: la estructura no se adivina por el tamaño de la letra ni
// por la negrita. O la dice el documento —en sus estilos o en su índice— o no se deduce, porque una
// estructura adivinada no se nota al importar, se nota en junio al exportar. Un PCCF cuyo índice no
// casara con el cuerpo volvería a dar 0 apartados, y entonces lo que hay que arreglar sigue estando
// en el Word.
//
// ---------------------------------------------------------------- LA PROPUESTA PEDAGÓGICA DE ESO Y BACHILLERATO
//
// El cuarto tipo, y el que cierra el inventario del departamento: `propuesta_pedagogica`. El E7 ya
// había medido que estos cuatro documentos «se importan sorprendentemente bien» y que lo único que
// les faltaba era un tipo propio (docs/plan.md, «Lo que ha dejado el E7»). Esto es ese tipo.
//
// POR QUÉ SE LLAMA ASÍ. Porque es lo que lleva escrito la portada —«Propuesta Pedagógica ESO ·
// Informática»— y lo que ya llaman así los dos sitios del repositorio que hablan de ellos:
// docs/entrada_ej/README.md («las propuestas pedagógicas de ESO y Bachillerato») y docs/plan.md. El
// prototipo las registra como `tipo: 'pd'` con `rama: 'eso-bach'` (docs/mockup-v2/js/estructura.js),
// pero eso no es un nombre de tipo en competencia: allí `'pd'` cubre también los dos ciclos de FP y
// lo que de verdad separa los documentos es el `ambito` ('eso' | 'bach'). Lo que se toma de ese
// vocabulario es justo eso —el ámbito, que aquí viaja en `ciclo`— y la palabra con la que el
// prototipo llama a sus unidades: MATERIAS, no módulos.
//
// Los números con los que se admite, medidos sobre los cuatro documentos del departamento:
//
//   Propuesta pedagógica de ESO 2025-26            27 apartados · 3 materias · 3 conciliadas
//   Propuesta pedagógica de ESO 2026-27            27 apartados · 3 materias · 3 conciliadas
//   Propuesta pedagógica de Bachillerato 2025-26   21 apartados · 2 materias · 2 (una, forzada)
//   Propuesta pedagógica de Bachillerato 2026-27   24 apartados · 3 materias · 3 conciliadas
//
// Las conciliadas lo están por el TÍTULO EXACTO del curso, con confianza alta. La excepción es
// «Primer curso – PRSI I» de la propuesta de Bachillerato de 2025-26: esa materia NO está en
// core/unidades.js —el catálogo se extrajo de los documentos de 2026-27, donde la materia de primero
// ya se llama «Informática I»— así que no concilia y hace falta `forzar`. No se arregla aquí: el
// arreglo es del catálogo (ver scripts/cargar-reales.js).
const TIPOS = ['programacion_didactica', 'memoria', 'pccf', 'propuesta_pedagogica'];

// Los tipos que se rechazan con un motivo, en lugar de con un «todavía no». Hoy no hay ninguno: aquí
// estuvo el PCCF mientras el importador no sabía leerlo. Se queda el mecanismo —y su 400 explicado—
// porque el siguiente tipo que se intente admitir pasará por el mismo sitio, y porque es la forma de
// distinguir «este tipo no se puede importar POR ESTO» de «ese tipo no existe».
const NO_ADMITIDOS = {};

// El `ciclo` lo piden todos menos la memoria: la memoria es del departamento entero —ESO,
// Bachillerato y los dos ciclos de FP en el mismo documento—, así que exigirle un ciclo sería
// obligar a quien la sube a elegir uno de mentira. El modelo ya lo admite nulo (docs/plan.md §3) y
// `aFilas` lo guarda así. Para la PD y para cualquier documento de un ciclo sigue siendo obligatorio,
// porque sin él la conciliación de los módulos es ambigua (docs/api.md, «Por qué la importación
// exige el ciclo»).
//
// LA PROPUESTA PEDAGÓGICA TAMBIÉN LO EXIGE, Y EN ÉL VA UN ÁMBITO Y NO UN CICLO: `eso` o `bach`, que
// son los valores del campo `ambito` de core/unidades.js. ESO y Bachillerato no son ciclos
// formativos, pero este campo no es «de qué ciclo de FP es»: es «entre qué unidades del catálogo hay
// que buscar». `core/conciliar.js` lo usa así desde que existe —filtra por `u.ciclo === ciclo ||
// u.ambito === ciclo`— y el desplegable de app/_componentes/Subida.js ya ofrecía ESO y Bachillerato
// al lado de DAW y SMR por ese mismo motivo. Y hace falta de verdad, no por simetría: la propuesta de
// ESO y la de Bachillerato son DOS documentos del mismo tipo, el Word no dice de qué etapa es
// ninguno, y sin el ámbito las materias de una se buscarían también entre las de la otra.
const OBLIGATORIOS = ['archivo', 'tipo', 'curso', 'departamento'];
const EXIGEN_CICLO = ['programacion_didactica', 'pccf', 'propuesta_pedagogica'];

// Los tipos cuyo documento SÍ repite un bloque por unidad: la PD de FP repite un bloque por módulo y
// la propuesta pedagógica, uno por materia (su apartado «Concreción curricular de las materias»). Los
// demás —memoria y PCCF— no, y por eso un bloque repetido en ellos es casi siempre un tipo sin
// cambiar (ver abajo, «las unidades son de la PD y de la propuesta»).
const CON_UNIDADES = ['programacion_didactica', 'propuesta_pedagogica'];

// Un campo de texto del formulario, sin espacios alrededor. Un `File` no es texto: si `archivo` llega
// como texto plano, no hay fichero y se trata como si faltara.
function texto(formulario, campo) {
  const valor = formulario.get(campo);
  if (typeof valor !== 'string') return null;
  const limpio = valor.trim();
  return limpio === '' ? null : limpio;
}

// `forzar` es un interruptor: ausente o «0», no; «1», sí. Cualquier otra cosa es un error de quien
// escribe el formulario y no se interpreta a ojo.
function leerForzar(formulario) {
  const valor = texto(formulario, 'forzar');
  if (valor === null || valor === '0') return { forzar: false };
  if (valor === '1') return { forzar: true };
  return { fallo: malaPeticion('El campo «forzar» solo puede ser 1 o 0.') };
}

const POST = conErrores(async (peticion) => {
  const inicio = Date.now();

  const usuario = await usuarioDeLaPeticion(peticion);
  if (!usuario) return SIN_IDENTIFICAR();
  if (!PUEDEN_IMPORTAR.includes(usuario.rol)) {
    return SIN_PERMISO('Solo la jefatura de departamento puede importar un documento.');
  }

  let formulario;
  try {
    formulario = await peticion.formData();
  } catch (e) {
    return malaPeticion('La importación se envía como multipart/form-data.');
  }

  const archivo = formulario.get('archivo');
  const ficheroLlega = !!archivo && typeof archivo !== 'string' && typeof archivo.arrayBuffer === 'function';
  // Los que hacen falta siempre. `ciclo` no está en la lista porque depende del tipo, así que se
  // comprueba justo después de saber cuál es (ver EXIGEN_CICLO).
  for (const campo of OBLIGATORIOS) {
    const presente = campo === 'archivo' ? ficheroLlega : texto(formulario, campo) !== null;
    if (!presente) return malaPeticion(`Falta el campo «${campo}».`);
  }

  const tipo = texto(formulario, 'tipo');
  // Con `hasOwnProperty` y no `NO_ADMITIDOS[tipo]`: lo que llega es un campo de un formulario, y
  // `tipo=constructor` encontraría lo que hereda cualquier objeto y respondería con un disparate.
  if (Object.prototype.hasOwnProperty.call(NO_ADMITIDOS, tipo)) {
    return malaPeticion(`El tipo «${tipo}» no se puede importar. ${NO_ADMITIDOS[tipo]}`);
  }
  if (!TIPOS.includes(tipo)) {
    return malaPeticion(`El tipo «${tipo}» no se puede importar: usa ${TIPOS.join(' o ')}.`);
  }

  const cicloCrudo = texto(formulario, 'ciclo');
  if (EXIGEN_CICLO.includes(tipo) && cicloCrudo === null) {
    return malaPeticion('Falta el campo «ciclo».');
  }
  const ciclo = cicloCrudo === null || TIPOS_SIN_CICLO.includes(tipo) ? null : cicloCrudo.toLowerCase();
  const curso = texto(formulario, 'curso');
  const departamento = texto(formulario, 'departamento');

  if (!/^\d{4}-\d{2}$/.test(curso)) {
    return malaPeticion(`El curso «${curso}» no tiene la forma 2026-27.`);
  }

  const { fallo: falloForzar, forzar } = leerForzar(formulario);
  if (falloForzar) return falloForzar;

  // Quien no es admin importa solo en su departamento. Se comprueba aquí y no en el cliente, y se
  // responde 403 y no 404: el departamento lo elige quien sube el fichero, no es un documento que ya
  // exista y que no se deba ver (docs/api.md, «404 y no 403»).
  if (usuario.rol !== 'admin' && departamento !== usuario.departamento) {
    return SIN_PERMISO('Solo puedes importar documentos de tu propio departamento.');
  }

  const buffer = Buffer.from(await archivo.arrayBuffer());
  const resultado = await guardarImportacion({
    buffer, origen: archivo.name || null, tipo, ciclo, curso, departamento, forzar, inicio,
    subidoPor: usuario._id,
  });
  if (resultado.error) {
    return fallo(400, 'peticion', resultado.error.mensaje, resultado.error.extra);
  }
  return Response.json(
    {
      documento: sinPlantilla(resultado.documento),
      resumen: resultado.resumen,
      // Si ya había un documento de este tipo, ciclo, curso y departamento, lo subido entra como versión
      // alternativa y no activa; lo que había no se toca (docs/plan.md, «Versiones del documento»).
      alternativa: !esActiva(resultado.documento),
      version: resultado.documento.version,
    },
    { status: 201, headers: { 'Cache-Control': 'no-store' } },
  );
});

// ---------------------------------------------------------------- el núcleo, sin HTTP
//
// Lo que hace la ruta una vez validado el formulario: leer el Word, conciliar los módulos y escribir
// el documento. La usan la ruta y scripts/cargar-reales.js, que carga los documentos del departamento
// sin pasar por HTTP: así las dos cargas son la misma lógica y no dos que se separen.
//
// Devuelve { documento, resumen } si lo guarda, o { error: { mensaje, extra, causa } } si lo rechaza.
// Todo rechazo ocurre antes de la primera escritura. `causa` es el mensaje técnico del importador, para
// quien llama por consola; la ruta no lo envía.
//
// `anteriorId` apunta al documento del curso anterior (docs/plan.md §2.1). La ruta no lo pasa: lo que
// sube un usuario empieza su historia, y el curso siguiente se crea con /siguiente-curso.
async function guardarImportacion({
  buffer, origen, tipo, ciclo, curso, departamento, forzar,
  inicio = Date.now(), anteriorId = null, repo = obtenerRepositorio(), subidoPor = null, versionar = true,
}) {
  const rechazo = (mensaje, extra = {}, causa = undefined) => ({ error: { mensaje, extra, causa } });

  let importado;
  try {
    importado = await importarDocx({ buffer }, { tipo, departamento, origen });
  } catch (e) {
    return rechazo('No puedo leer ese fichero como un documento de Word (.docx).', {}, e.message);
  }
  const { plantilla, datos, informe } = importado;

  // ---------------------------------------------------------------- UN DOCUMENTO SIN APARTADOS NO SE GUARDA
  //
  // Si el importador no ha deducido NI UN apartado, lo que se guardaría es un documento vacío: sale
  // en la lista, no se puede navegar y su PDF son dos páginas de portada. Esta es la protección que
  // antes daba el 400 del PCCF, y sigue hecha falta: el respaldo del índice resuelve los dos PCCF
  // del departamento, pero un Word cuyos apartados no son títulos Y cuyo índice no casa con el
  // cuerpo no tiene estructura por ningún lado, y eso se arregla en el Word y no aquí.
  if (!informe.secciones) {
    return rechazo('De este Word no sale ni un apartado: los títulos de sus apartados no están escritos con '
      + 'los estilos de título de Word, así que ni Word ni esta herramienta los reconocen como títulos, y '
      + 'tampoco hay un índice al día del que deducirlos. Aplícales Título 1, Título 2 y Título 3 a los '
      + 'apartados —o actualiza el índice del documento— y vuelve a subirlo. No se ha guardado nada.',
      { tipo, avisos: informe.avisos });
  }

  // ---------------------------------------------------------------- LAS UNIDADES SON DE LA PD Y DE LA PROPUESTA
  //
  // Hay dos tipos que repiten un bloque por unidad (`CON_UNIDADES`): la programación didáctica, uno
  // por módulo, y la propuesta pedagógica, uno por materia. Los otros dos no: el PCCF es el proyecto
  // del ciclo y la memoria es del departamento entero. Se ha comprobado con los documentos reales: la
  // memoria del departamento y los dos PCCF dan **cero instancias**, así que las unidades —y por
  // tanto la conciliación con el catálogo, el reparto al profesorado y el arrastre de asignaciones—
  // simplemente no aplican ahí. No es que no funcionen: es que no hay nada que repartir, y el
  // documento entra como un solo tomo de apartados comunes.
  //
  // Así que si el importador SÍ encuentra un bloque repetido en uno de esos tipos, no se concilia
  // contra el catálogo de módulos: se para. Por dos motivos, y el primero es el que pasa de verdad:
  //
  //   1. ES EL ERROR MÁS PROBABLE DE QUIEN SUBE EL FICHERO: haber dejado el tipo sin cambiar. Una
  //      programación subida como memoria se importaría sin protestar, con sus once módulos
  //      conciliados y sus apartados en su sitio, y nadie lo notaría hasta que el documento saliera
  //      en la lista con el nombre equivocado y la memoria de verdad no estuviera.
  //   2. Y si el documento de verdad lleva un bloque repetido que no son los módulos del catálogo,
  //      conciliarlo sería emparejar lo que no es un módulo con un módulo —o dejarlo sin resolver y
  //      pedir `forzar=1`, que derivaría ids del título y los convertiría en unidades del documento
  //      con su reparto y su arrastre—. Las dos cosas son adivinar, y la regla de esta ruta es que
  //      no se adivina (docs/api.md, «Qué pasa si la importación no reconoce un módulo»).
  //
  // No se escribe nada: el 400 llega antes de la primera escritura, como el de `sinResolver`.
  const instancias = Array.isArray(datos.instancias) ? datos.instancias : [];
  if (!CON_UNIDADES.includes(tipo) && instancias.length) {
    return rechazo(`Este Word tiene ${instancias.length} bloques repetidos que parecen módulos, y un documento `
      + `de tipo «${tipo}» no lleva módulos: el PCCF es del ciclo y la memoria, del departamento entero. `
      + 'Lo más probable es que sea una programación didáctica y se haya quedado el tipo sin cambiar. '
      + 'No se ha guardado nada.',
      { tipo, instancias: instancias.map((i) => i.titulo) },
    );
  }

  // La conciliación: cada módulo del Word, con su id estable del catálogo.
  const { unidades: conciliadas, sinResolver } = conciliar(datos.instancias, { curso, ciclo });

  if (sinResolver.length && !forzar) {
    return rechazo(`No reconozco ${sinResolver.length} de los ${datos.instancias.length} módulos del documento. `
      + 'Revisa su título en el catálogo, o vuelve a subirlo con forzar=1 para importarlos con un '
      + 'identificador derivado de su título.',
      { sinResolver: sinResolver.map(({ titulo, motivo }) => ({ titulo, motivo })) },
    );
  }

  // Un id por instancia, que es lo que pide aFilas. Las instancias se identifican por el objeto
  // mismo: aFilas se lo pasa al callback tal cual sale de `datos.instancias`.
  const idPorInstancia = new Map();
  const ocupados = new Set(conciliadas.filter((u) => u.unidadId).map((u) => u.unidadId));
  const forzadas = [];
  conciliadas.forEach((u, i) => {
    const instancia = datos.instancias[i];
    if (u.unidadId) {
      idPorInstancia.set(instancia, u.unidadId);
      return;
    }
    // Derivado del título, y si ya lo ocupa otro módulo, con sufijo. Aquí el sufijo sí se acepta,
    // a diferencia de core/conciliar.js: es una importación que quien la pide ha decidido hacer
    // sabiendo que el catálogo no lo reconoce, y dos módulos sin id no se pueden guardar.
    const base = idDeTitulo(instancia.titulo);
    let id = base;
    for (let n = 2; ocupados.has(id); n += 1) id = `${base}-${n}`;
    ocupados.add(id);
    idPorInstancia.set(instancia, id);
    forzadas.push({ titulo: instancia.titulo, unidadId: id });
  });

  const filas = aFilas({ plantilla, datos }, {
    tipo,
    ciclo,
    curso,
    departamento,
    estado: 'borrador',
    // Un documento que se importa de cero: todos sus apartados nacen como `nuevo`. Lo `heredado`
    // aparece en el E5, cuando se cree un curso desde el anterior.
    origenApartados: 'nuevo',
    anteriorId,
    conciliar: (_titulo, instancia) => idPorInstancia.get(instancia),
  });

  // Si ya hay un documento con esta clave, lo subido no lo pisa: entra como versión alternativa. Con
  // `versionar: false` (la carga de scripts/cargar-reales.js, que sustituye lo anterior) nace activo.
  const previas = versionar
    ? versionesDe(filas.documento, await repo.documentos.listar({ tipo, curso, departamento }))
    : [];
  const alternativa = previas.length > 0;
  let copiaGuardada = false;
  const documento = await repo.documentos.crear({
    ...filas.documento,
    activa: !alternativa,
    version: siguienteVersion(previas),
    subidoPor,
  });
  try {
    if (filas.unidades.length) await repo.unidades.crearMuchos(documento._id, filas.unidades);
    if (filas.apartados.length) await repo.apartados.crearMuchos(documento._id, filas.apartados);
    if (filas.compartidos.length) await repo.compartidos.crearMuchos(documento._id, filas.compartidos);
    // El Word original queda como copia de seguridad de esta versión (docs/plan.md §8). Si pasa del tope
    // del repositorio la importación sigue valiendo y la respuesta dice que no hay copia.
    try {
      await repo.copias.guardar(documento._id, { nombre: origen, contenido: buffer, subidoPor });
      copiaGuardada = true;
    } catch (e) {
      if (!(e instanceof RangeError)) throw e;
    }
  } catch (e) {
    // Un documento a medias es peor que ninguno: sale en la lista y no se puede abrir bien. Se borra
    // lo que se haya escrito y se devuelve el error.
    await repo.documentos.borrar(documento._id).catch(() => {});
    throw e;
  }

  const resumen = {
    secciones: informe.secciones,
    unidades: filas.unidades.length,
    apartados: filas.apartados.length,
    compartidos: filas.compartidos.length,
    tardaMs: Date.now() - inicio,
    // Si el Word original se ha guardado como copia de seguridad (GET /api/documentos/[id]/copia).
    copia: copiaGuardada,
    // Los avisos del importador tal cual: son lo que quien sube el fichero tiene que revisar en el Word.
    avisos: informe.avisos,
    // Cómo se ha reconocido cada módulo. `como` son códigos estables; la etiqueta es la que se enseña.
    conciliacion: conciliadas.map((u, i) => {
      const instancia = datos.instancias[i];
      return {
        titulo: u.titulo,
        unidadId: idPorInstancia.get(instancia),
        como: u.como,
        comoEtiqueta: ETIQUETAS_COMO[u.como] || u.como,
        confianza: u.confianza,
        forzada: !u.unidadId,
      };
    }),
    forzadas,
  };

  return { documento, resumen };
}

module.exports = { POST, guardarImportacion, TIPOS, NO_ADMITIDOS, EXIGEN_CICLO, CON_UNIDADES };
