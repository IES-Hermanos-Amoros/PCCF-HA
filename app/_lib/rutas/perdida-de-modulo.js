// LO QUE SE DESTRUYE AL QUITAR ALGO PROPIO DE UN MÓDULO: contarlo antes y destruirlo después.
//
// `core/estructura-modulo.js` dice QUÉ deja de existir (`loQueSePierde`). Este fichero dice CUÁNTO
// contenido hay debajo y es el que lo destruye. Está aparte porque lo necesitan dos sitios —volver a la
// estructura común (el PUT de estructura-modulo.js) y borrar para siempre un apartado o una casilla
// propios— y la cuenta tiene que ser la misma en los dos: la frase que se le dice a la persona antes de
// confirmar sale de aquí, y el borrado que se ejecuta después también. Si cada ruta lo calculara por su
// cuenta, la aplicación podría avisar de tres cosas y destruir cuatro.
//
// EL BORRADO VA ACOTADO A UNA UNIDAD, SIEMPRE. Es la diferencia con el borrado de la plantilla común, que
// borra las filas de todas las unidades a propósito. Aquí no se puede: el id de una casilla propia lo
// acuña `idDeCampoPropio` con los ids ocupados DE ESE MÓDULO, así que dos módulos pueden tener la misma
// `m_observaciones` en el mismo apartado común, cada una con su contenido. Sin acotar, el módulo 6
// borraría lo del módulo 1. Lo mismo con un apartado propio, cuyo id podría existir en otro módulo.
//
// Es CommonJS y no sabe que está dentro de Next (docs/api.md, primera regla de forma).

'use strict';

const Arbol = require('../../../core/arbol');

const esObjeto = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const lista = (x) => (Array.isArray(x) ? x : []);

// Las filas de este módulo, una por apartado con contenido. Es la única lectura que hace falta para
// contar, y se pide una sola vez: contar apartado a apartado serían tantas lecturas como apartados.
const filasDelModulo = async (repo, documentoId, unidadId) => (await repo.apartados.listar(documentoId, { unidadId }));

const escrito = (valor) => Arbol.algoEscrito(valor);

// CUÁNTO CONTENIDO HAY DEBAJO DE LO QUE SE PIERDE. Se cuenta ANTES de destruir nada, porque es lo que
// hay que decirle a quien confirma y porque después ya no se puede contar.
//
//   apartados          cuántos apartados propios se van
//   campos             cuántas casillas propias se van
//   filas              cuántas filas de `apartados` se destruyen (las de los apartados que se van)
//   conContenido       cuántas de esas filas tienen algo escrito
//   casillasEscritas   cuántas de las casillas que se van tienen algo escrito en este módulo
//
// `perdida` es lo que devuelve `loQueSePierde`.
async function contenidoDeLaPerdida({ repo, documentoId, unidadId, perdida }) {
  const apartados = lista(perdida && perdida.apartados);
  const campos = lista(perdida && perdida.campos);
  const vacio = {
    apartados: apartados.length, campos: campos.length, filas: 0, conContenido: 0, casillasEscritas: 0,
  };
  if (!apartados.length && !campos.length) return vacio;

  const filas = await filasDelModulo(repo, documentoId, unidadId);
  const ids = new Set(apartados.map((a) => a.id));
  const deApartados = filas.filter((f) => ids.has(f.seccion));
  const porSeccion = new Map(filas.map((f) => [f.seccion, f]));
  const casillasEscritas = campos.filter((c) => {
    const fila = porSeccion.get(c.seccion);
    return !!fila && esObjeto(fila.valores) && escrito(fila.valores[c.id]);
  }).length;

  return {
    apartados: apartados.length,
    campos: campos.length,
    filas: deApartados.length,
    conContenido: deApartados.filter((f) => escrito(f.valores)).length,
    casillasEscritas,
  };
}

// LA FRASE. Lo que se le dice a quien todavía no ha confirmado, para que decida sabiendo qué pierde.
// Está aquí y no en cada ruta por lo mismo que la cuenta: el aviso de antes y la respuesta de después
// tienen que decir lo mismo. No lleva mayúscula inicial, ni punto final, ni verbo conjugado: «se
// perdería 2 apartados» no concuerda, así que quien la usa la encaja detrás de dos puntos.
function fraseDeLaPerdida(contenido) {
  const c = esObjeto(contenido) ? contenido : {};
  const n = (x) => Number(x) || 0;
  // `g` son las palabras del genero que toque: un apartado vacio y una casilla vacia no se dicen igual.
  const trozo = (cuantos, escritos, g) => {
    const cabeza = `${cuantos} ${cuantos === 1 ? g.uno : g.muchos} de este módulo`;
    if (!escritos) return `${cabeza}, ${cuantos === 1 ? g.vacio : g.vacios}`;
    if (escritos === cuantos) return `${cabeza}, ${cuantos === 1 ? 'con algo escrito' : g.todos}`;
    return `${cabeza}, ${escritos} con algo escrito`;
  };
  const partes = [];
  if (n(c.apartados)) {
    partes.push(trozo(n(c.apartados), n(c.conContenido), {
      uno: 'apartado', muchos: 'apartados', vacio: 'vacío', vacios: 'todos vacíos', todos: 'todos con algo escrito',
    }));
  }
  if (n(c.campos)) {
    partes.push(trozo(n(c.campos), n(c.casillasEscritas), {
      uno: 'casilla', muchos: 'casillas', vacio: 'vacía', vacios: 'todas vacías', todos: 'todas con algo escrito',
    }));
  }
  if (!partes.length) return 'nada: no hay ningún apartado ni ninguna casilla propios que perder';
  return partes.join(' y ');
}

// DESTRUIR EL CONTENIDO de lo que ya ha dejado de existir en la estructura. Se llama DESPUÉS de haber
// guardado la estructura y no antes, por lo mismo que en la plantilla común (estructura.js, «el
// contenido se destruye DESPUÉS de la plantilla»): la escritura de la estructura es la condicionada, la
// que decide si el cambio vale, y destruir antes dejaría contenido borrado y la estructura intacta si
// esa escritura perdiera la carrera. Con el apartado ya fuera de la estructura nadie puede escribir en
// él, así que lo que se destruye es lo que se contó.
//
// Y SI FALLA, el cambio de estructura YA ESTÁ HECHO. No se puede contestar un error: un error dice «no
// se sabe si se ha llegado a borrar» y aquí sí se sabe —la estructura se ha cambiado y no vuelve—. Se
// devuelve `sinDestruir` con el motivo, para que la ruta lo pase en su 200 y la pantalla pueda decir la
// otra mitad: que lo que había escrito puede seguir guardado, invisible, y que eso hay que mirarlo.
// Tragárselo en silencio sería peor, porque nadie iría a buscar esas filas.
//
// Un apartado se va con sus comentarios. Un hilo habla de un apartado concreto y se lista por `seccion`
// + `unidadId`: con el apartado fuera de la estructura no se podría volver a leer ni a borrar, así que
// dejarlo sería guardar para siempre lo que escribieron otras personas sin que nadie pueda llegar a
// ello. Quitar una casilla no toca ningún comentario: el hilo es del apartado, y el apartado sigue ahí.
async function destruirLaPerdida({ repo, documentoId, unidadId, perdida }) {
  const apartados = lista(perdida && perdida.apartados);
  const campos = lista(perdida && perdida.campos);
  const hecho = { filas: 0, comentarios: 0, casillas: 0, sinDestruir: null };
  if (!apartados.length && !campos.length) return hecho;

  try {
    if (apartados.length) {
      const ids = apartados.map((a) => a.id);
      hecho.filas = await repo.apartados.borrar(documentoId, ids, unidadId);
      hecho.comentarios = await repo.comentarios.borrar(documentoId, ids, unidadId);
    }
    // Las casillas, una a una: cada una es una clave de `valores` en la fila de SU apartado, y el
    // repositorio no sabe quitar varias claves de varias secciones de golpe. Si una falla se para
    // aquí y lo que ya se quitó queda quitado; el `sinDestruir` dice que la cuenta no está completa.
    for (const c of campos) {
      hecho.casillas += await repo.apartados.quitarClave(documentoId, c.seccion, c.id, unidadId);
    }
  } catch (e) {
    hecho.sinDestruir = e && e.message ? e.message : 'La base de datos no ha contestado.';
  }
  return hecho;
}

module.exports = { contenidoDeLaPerdida, fraseDeLaPerdida, destruirLaPerdida };
