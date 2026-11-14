// Al terminar la batería: barrer las filas huérfanas que la API no sabe borrar.
//
// POR QUÉ ESTO SÍ LIMPIA, CUANDO EL RESTO DE LA RED NO LO HACE. La regla de `apoyo.js` es que una fuga
// se NOMBRA y no se limpia, para que no se esconda la prueba culpable. Aquí hay una excepción con
// motivo: cuando una prueba crea un apartado propio en un módulo y escribe en él, su fila queda
// inalcanzable desde la API en cuanto el módulo vuelve a la estructura común, así que el `finally` de la
// prueba NO PUEDE deshacerla. No es una prueba mal escrita: es que no hay ruta.
//
// Sin esto, cada pasada dejaría una fila y la siguiente abortaría en la comprobación de entrada
// pidiendo un `--limpiar` a mano. Con esto, se barre y SE DICE lo que se ha barrido, que es lo que
// mantiene la cuenta honesta: si un día aparecen diez, se ve en el registro.
//
// Lo que lleva algo escrito NO se toca, ni aquí ni en el script: eso es la pregunta de diseño abierta
// de docs/estructura-por-modulo.md.

const Huerfanos = require('./apartados-huerfanos');

module.exports = async function globalTeardown() {
  let resultado;
  try {
    resultado = await Huerfanos.borrarVacios();
  } catch (e) {
    console.log(`\n[fin] No he podido barrer las filas huérfanas: ${e.message}`);
    return;
  }
  const { borradas, conContenido } = resultado;
  for (const h of borradas) {
    console.log(`[fin] Fila huérfana barrida: ${h.unidadId} · ${h.seccion} (la API no puede llegar a ella)`);
  }
  for (const h of conContenido) {
    console.log(`[fin] Fila huérfana CON CONTENIDO, no la toco: ${h.unidadId} · ${h.seccion}`);
  }
};
