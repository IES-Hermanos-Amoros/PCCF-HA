// El modelo de bloques, tal como lo usa la interfaz: una reexportación de
// `core/bloques.js` y tres ayudas que solo tienen sentido en la pantalla.
//
// NO HAY NINGUNA REGLA ESCRITA AQUÍ, Y ESO ES EL PUNTO
//
// `aTramos`, `aMarcas`, `marcar`, `aplicar` y `valido` viven en `core/bloques.js`
// porque es el riesgo nº 1 del proyecto (docs/interfaz-web.md §2.3): el PDF solo
// sale bien si lo que el editor escribe es exactamente la forma que espera el
// generador. Si el navegador tuviera su propia copia de esas funciones, las dos
// se separarían sin que nadie se enterara —es literalmente lo que pasó con los
// permisos en el v1 (docs/plan.md §2.2)—, y el síntoma aparecería en junio,
// cuando alguien imprima su programación.
//
// Así que este fichero existe por dos cosas pequeñas:
//
//   · marcar el `'use client'`, para que el módulo de `core/` entre en el
//     paquete del navegador por una sola puerta;
//   · y las dos preguntas que se hace la interfaz y no el modelo: si un valor de
//     la plantilla es una lista de bloques —o sea, si este editor sabe editarlo—
//     y cómo se enseña el JSON que se guardaría.
//
// EL ESTADO ES EL ARRAY DE BLOQUES Y EL TEXTO SE ESCRIBE EN <textarea>
//
// Nunca `contenteditable`: recibe HTML en cuanto alguien pega desde Word, ese
// HTML entra en el modelo y el PDF deja de salir. Un `<textarea>` por
// construcción solo puede devolver texto plano. El editor no lee el DOM para
// saber qué dice el documento: pinta desde el array y las ediciones van al
// array. Lo único que lee del DOM es la selección, que no es contenido.
//
// Y una propiedad del modelo que es la que permite que los campos sean
// controlados de React sin que el cursor salte: `aMarcas(aTramos(x)) === x` para
// cualquier x. Cada tramo se vuelve a emitir con las mismas marcas que lo
// generaron, y lo que no llevaba marca sale literal.

'use client';

import Bloques from '../../core/bloques';

export const {
  plano, aTramos, aMarcas, marcar, aplicar, valido, NIVEL_EDITOR,
  // La puerta de la API: exactamente la misma función que comprueba el `PATCH`
  // antes de escribir. El editor la usa para poder decir lo que va a decir el
  // servidor, y en qué campo, en lugar de dejar que llegue un 400 pelado. Quien
  // decide sigue siendo el servidor.
  motivoAlGuardar,
} = Bloques;

// Lo que se guardaría en la base de datos, tal cual. Se quedó en la interfaz
// —el prototipo lo tiene en su `bloques.js`— porque es pintado, no modelo.
export const aJSON = (valores) => JSON.stringify(valores, null, 2);

// ¿Esto es un bloque? Se mira la forma y no `campo.tipo` por lo mismo que
// Valores.js reparte por la forma: los tipos de campo los deduce el importador
// del Word y van a aparecer más (docs/interfaz-web.md §3.2).
export const esBloque = (x) => !!x && typeof x === 'object'
  && (typeof x.type === 'string' || typeof x.ref === 'string');

// Un array vacío NO cuenta: `[].every(...)` es true, y con eso cualquier campo
// que llegue vacío pasaría por campo de texto y se le pintaría un editor de
// párrafos encima de lo que en realidad es una tabla. Que un campo de texto sin
// escribir sea editable lo decide `campo.tipo`, que para eso está.
export const esListaDeBloques = (v) => Array.isArray(v) && v.length > 0 && v.every(esBloque);
