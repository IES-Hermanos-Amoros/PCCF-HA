// Los comentarios de un apartado: un hilo por apartado para pedir una aclaración sin salir de la
// herramienta.
//
//   GET  /api/documentos/[id]/comentarios?seccion=&unidad=    el hilo, del más antiguo al más reciente
//   POST /api/documentos/[id]/comentarios?seccion=&unidad=    `{ texto }` → 201 con el comentario
//
// Es el punto 13 y el punto 21 de docs/mockup-v2/CAMBIOS.md: el panel derecho del prototipo lleva,
// debajo de las comprobaciones, un hilo por apartado «para dejar una nota a quien lleva el módulo».
// Hoy esa nota se manda por correo o se dice en la reunión de departamento, y en los dos casos se
// pierde: no queda al lado del apartado del que habla, que es el único sitio donde la encuentra quien
// va a arreglarlo.
//
// LA COLECCIÓN YA ESTABA. Esto no la cambia: `repositorio/index.js` tiene `comentarios` con `crear`
// y `listar` desde el E0, con los campos que fija docs/plan.md §3
// (`{ documentoId, seccion, unidadId, autor, texto, fecha }`). Se usa tal cual.
//
// ================================================================ QUIÉN PUEDE COMENTAR
//
// TODO EL QUE VE EL DOCUMENTO, no solo quien puede editarlo. Es una decisión, y esta es la razón:
//
//   · un comentario es una PREGUNTA, y quien pregunta es justamente quien no puede escribir ahí. La
//     jefatura de estudios es quien aprueba el documento y no edita nada (core/permisos.js): si
//     comentar exigiera permiso de edición, la persona que tiene que decir «esto falta» sería la
//     única que no podría decirlo, y volvería al correo;
//   · un docente que lleva el módulo de bases de datos necesita poder avisar en el de programación de
//     que dos módulos están dando lo mismo. La coordinación entre módulos es el trabajo del
//     departamento, y el reparto de unidades decide quién ESCRIBE cada apartado, no quién puede
//     hablar de él (docs/mockup-v2/CAMBIOS.md, punto 17);
//   · y el riesgo es pequeño y reversible: dentro del departamento el documento no es secreto —el
//     reparto y el censo ya se sirven a todo el que lo ve— y un comentario no cambia el documento ni
//     sale en el PDF. Si algún día estorba, se restringe; lo que no se arregla es la pregunta que no
//     se pudo hacer.
//
// Así que el permiso de comentar es el de VER, y eso significa que estas dos rutas **no devuelven
// 403**: quien ve el documento puede leer y escribir en el hilo, y quien no lo ve recibe 404, que es
// lo que dice el contrato para un documento de otro departamento (docs/api.md, «404 y no 403»). El
// 403 del contrato sigue siendo el de escribir EL DOCUMENTO: el PATCH de un apartado, revisar,
// repartir, cambiar la estructura. Un comentario no es el documento.
//
// Aun así la respuesta lleva `puedeComentar`, porque el cliente no debe deducir el permiso de ningún
// sitio (docs/plan.md §2.5): hoy es `true` para todo el que llega hasta aquí, y el día que la regla
// cambie la pantalla la seguirá sin tocarse.
//
// ================================================================ EL HILO CUELGA DEL APARTADO
//
// `seccion` + `unidad`, el mismo par que identifica el contenido, y resuelto con la MISMA función que
// lo resuelve para leer y escribir (`abrirApartado` de app/_lib/rutas/apartado.js). De ahí salen los
// errores, que son los de siempre:
//
//   400  falta `seccion`, o el enlace no dice de qué módulo habla (o lo dice sobrando)
//   404  esa sección no es de este documento —un apartado retirado tampoco lo es— o esa unidad no
//        está en él
//
// Y de ahí sale lo que hace que un comentario no se quede huérfano: el id de un apartado se genera
// una vez y no cambia al renombrarlo (docs/mockup-v2/README.md y core/plantilla.js). El hilo sigue
// pegado a su apartado aunque le cambien el título.
//
// Un apartado RETIRADO no admite hilo nuevo, y es correcto: `abrirDocumento` poda la estructura
// retirada, así que su sección no está en el documento y responde 404. Sus comentarios no se borran
// —nada se borra al retirar— y vuelven con él si se restaura.
//
// ================================================================ EL ORDEN ES PARTE DE LA RESPUESTA
//
// Del más antiguo al más reciente, que es como se lee una conversación. Los dos adaptadores lo
// ordenan así (`repositorio/memoria.js` y `repositorio/mongo.js`), y aquí se vuelve a ordenar de
// todas formas: el orden lo promete ESTA respuesta, y una promesa que depende de qué adaptador esté
// montado no es una promesa. `sort` es estable en node, así que dos comentarios del mismo
// milisegundo conservan el orden en que se escribieron.
//
// ================================================================ QUÉ VIAJA DE CADA AUTOR
//
// El nombre y el rol, nunca el correo, igual que en `/unidades` y en `/validaciones`: el hilo dice
// quién pregunta, no cómo escribirle. Se resuelven solo los autores del hilo, uno a uno y sin
// repetir, y no el censo entero: un autor puede no ser del departamento del documento —la jefatura de
// estudios lo es de «estudios»— así que listar por departamento lo dejaría sin nombre.
//
// Un autor que ya no está en el censo sale con `nombre: null`, no se esconde: el comentario se
// escribió y la conversación tiene que poder leerse igual.
//
// Es CommonJS y no sabe que está dentro de Next (docs/api.md, primera regla de forma).

'use strict';

const C = require('../../../core/permisos');
const { conErrores, leerJson, texto: textoDe, malaPeticion } = require('./comun');
const { abrirApartado } = require('./apartado');

// Lo que cabe en un comentario. Es una pregunta o una nota —«esto habría que actualizarlo»—, no un
// capítulo: el apartado es el sitio donde se escribe la programación. El límite está además porque un
// campo de texto sin tope por el que entra cualquiera es una colección que solo crece.
const LARGO_MAXIMO = 2000;

// El autor, recortado. `nombre: null` cuando ya no está en el censo (ver la cabecera).
const aAutor = (id, persona) => ({
  _id: id,
  nombre: persona ? persona.nombre : null,
  rol: persona ? persona.rol : null,
});

// Los autores del hilo, una consulta por persona distinta y ninguna de más.
async function autoresDe(repo, filas) {
  const ids = [...new Set(filas.map((f) => f.autor).filter(Boolean))];
  const porId = new Map();
  for (const id of ids) {
    let persona = null;
    try {
      persona = await repo.usuarios.obtener(id);
    } catch (e) {
      // Un id guardado que ya no es una persona: el comentario se lee igual, sin nombre.
      persona = null;
    }
    porId.set(id, persona);
  }
  return porId;
}

// Un comentario tal como sale al cliente. El `_id` viaja porque es la clave de la lista en la
// pantalla; `fecha` en ISO, como todas las fechas de esta API.
const aComentario = (fila, autores) => ({
  _id: String(fila._id),
  autor: aAutor(fila.autor, autores.get(fila.autor)),
  texto: fila.texto,
  fecha: fila.fecha,
});

// Del más antiguo al más reciente. Ver la cabecera: el orden lo promete esta respuesta.
const porFecha = (a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime();

// ---------------------------------------------------------------- GET: el hilo

const GET = conErrores(async (peticion, parametros) => {
  const abierto = await abrirApartado(peticion, parametros, { permiteAlternativa: true });
  if (abierto.fallo) return abierto.fallo;
  const { documento, repo, seccion, unidadId, info } = abierto;

  const filas = (await repo.comentarios.listar(documento._id, { seccion, unidadId })).slice().sort(porFecha);
  const autores = await autoresDe(repo, filas);

  return Response.json({
    documentoId: documento._id,
    seccion,
    unidadId,
    titulo: info.seccion.titulo,
    comentarios: filas.map((f) => aComentario(f, autores)),
    total: filas.length,
    // Hoy, todo el que llega hasta aquí. Viaja para que la pantalla no tenga que saber la regla.
    puedeComentar: true,
    largoMaximo: LARGO_MAXIMO,
  }, { headers: { 'Cache-Control': 'no-store' } });
});

// ---------------------------------------------------------------- POST: comentar

// El orden de las comprobaciones es el del contrato, y lo resuelve `abrirApartado`:
//   401  no sé quién eres
//   404  no existe el documento, o es de otro departamento, o esa sección o esa unidad no son suyas
//   400  el cuerpo está mal, o el comentario está vacío o es demasiado largo
const CREAR = conErrores(async (peticion, parametros) => {
  // También en una versión alternativa: es donde se discute cuál de las versiones se activa.
  const abierto = await abrirApartado(peticion, parametros, { permiteAlternativa: true });
  if (abierto.fallo) return abierto.fallo;
  const { usuario, documento, repo, seccion, unidadId, info } = abierto;

  const { fallo, cuerpo } = await leerJson(peticion);
  if (fallo) return fallo;

  // Recortado: un comentario de espacios en blanco es un comentario vacío, y vacío es un error de
  // quien llama y no una fila que haya que guardar.
  const texto = textoDe(cuerpo, 'texto');
  if (!texto) return malaPeticion('Falta «texto»: un comentario vacío no se guarda.');
  if (texto.length > LARGO_MAXIMO) {
    return malaPeticion(`El comentario no puede pasar de ${LARGO_MAXIMO} caracteres: tiene ${texto.length}.`
      + ' Para algo más largo, el sitio es el apartado.');
  }

  // El autor es quien pregunta, resuelto por la sesión y nunca por el cuerpo de la petición: un
  // `autor` que llegara de fuera sería firmar un comentario en nombre de otra persona. Y se lee con
  // `idDeUsuario`, que es la única forma de leer un id de usuario (core/permisos.js).
  const fila = await repo.comentarios.crear({
    documentoId: documento._id,
    seccion,
    unidadId,
    autor: C.idDeUsuario(usuario),
    texto,
  });

  const autores = await autoresDe(repo, [fila]);

  return Response.json({
    documentoId: documento._id,
    seccion,
    unidadId,
    titulo: info.seccion.titulo,
    comentario: aComentario(fila, autores),
  }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
});

module.exports = { GET, CREAR, LARGO_MAXIMO };
