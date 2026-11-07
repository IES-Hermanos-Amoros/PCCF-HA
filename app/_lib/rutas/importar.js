// POST /api/documentos/importar — sube un .docx, concilia sus módulos y lo guarda en el repositorio.
//
// Es la única ruta que ESCRIBE un documento entero, y por eso es la que más cuida el orden: nada se
// escribe hasta que todo lo que puede fallar por culpa de quien sube el fichero ya ha fallado. Así
// un 400 deja el repositorio como estaba (docs/api.md, errores).
//
// LA SECUENCIA
//
//   1. quién pregunta (401) y si puede importar (403: solo admin y jefe de departamento);
//   2. el formulario: los campos obligatorios, y que el departamento sea el de quien importa (403)
//      salvo para el admin. Un jefe de departamento no crea documentos en el departamento de al lado;
//   3. el .docx: se lee con motor/importar-docx.js. Un fichero que no es un Word da 400;
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
const { obtenerRepositorio } = require('../repositorio');
const { usuarioDeLaPeticion, SIN_IDENTIFICAR, SIN_PERMISO } = require('../usuario');
const { conErrores, fallo, malaPeticion, sinPlantilla } = require('./comun');

// Solo la jefatura de departamento y el soporte. El docente edita sus módulos, no crea documentos; y
// la jefatura de estudios no edita nada: es quien aprueba (docs/api.md, «Quién puede importar»).
const PUEDEN_IMPORTAR = ['admin', 'jefe_departamento'];

// De momento solo la PD. El PCCF y la memoria se importan por este mismo camino en el E7, y aceptarlos
// aquí antes de probarlos sería aceptar un Word que luego no sale bien en el PDF.
const TIPOS = ['programacion_didactica'];

const OBLIGATORIOS = ['archivo', 'tipo', 'ciclo', 'curso', 'departamento'];

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
  for (const campo of OBLIGATORIOS) {
    const presente = campo === 'archivo' ? ficheroLlega : texto(formulario, campo) !== null;
    if (!presente) return malaPeticion(`Falta el campo «${campo}».`);
  }

  const tipo = texto(formulario, 'tipo');
  const ciclo = texto(formulario, 'ciclo').toLowerCase();
  const curso = texto(formulario, 'curso');
  const departamento = texto(formulario, 'departamento');

  if (!TIPOS.includes(tipo)) {
    return malaPeticion(`El tipo «${tipo}» todavía no se puede importar: usa ${TIPOS.join(' o ')}.`);
  }
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

  // El Word. Un fichero que el importador no sabe leer es culpa de quien lo sube, no del servidor.
  const buffer = Buffer.from(await archivo.arrayBuffer());
  let importado;
  try {
    importado = await importarDocx({ buffer }, { tipo, departamento, origen: archivo.name || null });
  } catch (e) {
    return malaPeticion('No puedo leer ese fichero como un documento de Word (.docx).');
  }
  const { plantilla, datos, informe } = importado;

  // La conciliación: cada módulo del Word, con su id estable del catálogo.
  const { unidades: conciliadas, sinResolver } = conciliar(datos.instancias, { curso, ciclo });

  if (sinResolver.length && !forzar) {
    return fallo(
      400, 'peticion',
      `No reconozco ${sinResolver.length} de los ${datos.instancias.length} módulos del documento. `
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
    conciliar: (_titulo, instancia) => idPorInstancia.get(instancia),
  });

  const repo = obtenerRepositorio();
  const documento = await repo.documentos.crear(filas.documento);
  try {
    if (filas.unidades.length) await repo.unidades.crearMuchos(documento._id, filas.unidades);
    if (filas.apartados.length) await repo.apartados.crearMuchos(documento._id, filas.apartados);
    if (filas.compartidos.length) await repo.compartidos.crearMuchos(documento._id, filas.compartidos);
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

  return Response.json(
    { documento: sinPlantilla(documento), resumen },
    { status: 201, headers: { 'Cache-Control': 'no-store' } },
  );
});

module.exports = { POST };
