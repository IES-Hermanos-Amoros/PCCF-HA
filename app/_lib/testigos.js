// Los testigos: las llaves con las que se entra. Generarlos, guardarlos y compararlos.
//
// Un «testigo» es la cadena secreta que viaja en el enlace de acceso y, luego, en la cookie de
// sesión. Hay dos clases y las dos se tratan igual aquí, porque el riesgo es el mismo.
//
// LO QUE SE GUARDA ES EL HASH, NUNCA EL TESTIGO
//
// Quien mire la base de datos no debe poder entrar como otra persona, y una copia de seguridad de
// Mongo no debe llevar dentro llaves utilizables. Así que el testigo se le da una sola vez a quien
// lo va a usar y lo que queda guardado es `sha256(testigo)`, que no se puede deshacer. Si mañana
// alguien se lleva la base de datos, se lleva una lista de hashes con la que no se entra a ningún
// sitio.
//
// POR QUÉ SHA-256 Y NO BCRYPT, SCRYPT O ARGON2
//
// Porque esto no es una contraseña. Una contraseña la elige una persona, tiene poquísima entropía y
// se puede adivinar con un diccionario: por eso hace falta un hash lento, para que cada intento
// cueste. Un testigo son 32 bytes de `crypto.randomBytes`, es decir 256 bits de un generador
// criptográfico: no hay diccionario que lo contenga y probar a ciegas es imposible por cualquier
// medida. Un KDF lento aquí no añadiría seguridad y sí añadiría latencia a CADA petición, porque la
// cookie de sesión se valida en todas.
//
// Lo que sí hace falta es que el hash sea de una sola pasada y sin sal: hay que poder BUSCAR por él
// (`sesiones.porHash`) y una sal distinta por fila obligaría a recorrer la tabla entera comparando
// una a una. La sal protege contra tablas precomputadas de contraseñas frecuentes, y de un valor
// aleatorio de 256 bits no existe tabla posible.
//
// POR QUÉ LA COMPARACIÓN ES EN TIEMPO CONSTANTE
//
// `a === b` sobre dos cadenas sale en cuanto encuentra el primer carácter distinto, así que cuánto
// tarda dice cuántos caracteres iniciales ha acertado quien prueba. Con suficientes intentos eso
// permite construir el valor correcto carácter a carácter. `timingSafeEqual` compara los bytes
// enteros siempre. Aquí lo que se compara son dos hashes, y de un hash no se puede volver al
// testigo, así que el ataque sería muy rebuscado; se hace de todas formas porque la alternativa es
// escribir `===` y confiar en que nadie copie ese `===` a un sitio donde sí importe.

'use strict';

const { randomBytes, createHash, timingSafeEqual } = require('node:crypto');

// 32 bytes = 256 bits. En base64url son 43 caracteres sin nada que haya que escapar en una URL ni en
// una cookie, que es por donde viajan los dos.
const BYTES = 32;

const hashDeTestigo = (testigo) => createHash('sha256').update(String(testigo), 'utf8').digest('hex');

// Devuelve el par: el testigo, que se le da una sola vez a su dueño y no se vuelve a ver, y el hash,
// que es lo único que se guarda. Los dos juntos solo existen aquí y en quien llama.
function nuevoTestigo() {
  const testigo = randomBytes(BYTES).toString('base64url');
  return { testigo, tokenHash: hashDeTestigo(testigo) };
}

// Si el testigo que llega corresponde al hash guardado. Lo que se compara son los bytes del hash, no
// las cadenas en hexadecimal, porque `timingSafeEqual` exige dos búferes del mismo tamaño.
function coincide(testigo, tokenHash) {
  if (typeof testigo !== 'string' || typeof tokenHash !== 'string') return false;
  let esperado;
  try {
    esperado = Buffer.from(tokenHash, 'hex');
  } catch (e) {
    return false;
  }
  const calculado = Buffer.from(hashDeTestigo(testigo), 'hex');
  // Un hash guardado de longitud distinta no es de este esquema: se rechaza antes de comparar,
  // porque timingSafeEqual lanza si los tamaños no coinciden. La longitud no es secreta.
  if (esperado.length !== calculado.length) return false;
  return timingSafeEqual(calculado, esperado);
}

module.exports = { nuevoTestigo, hashDeTestigo, coincide, BYTES };
