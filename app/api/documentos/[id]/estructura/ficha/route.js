// Envoltorio de la ruta. La lógica está en app/_lib/rutas/estructura.js (docs/api.md, primera regla
// de forma): cambia la estructura de la tabla de la ficha de situación de aprendizaje —renombrar una
// fila, añadirla, moverla, retirarla o restaurarla—, que es la misma para las fichas de todos los
// módulos del documento.
//
// Las cinco operaciones entran por aquí y se reparten por el `tipo` del cuerpo, en vez de tener una
// dirección cada una como los campos de un apartado: son cinco formas del mismo cambio sobre la misma
// lista, y la plantilla viaja con su versión en todas, así que partirlas en cinco direcciones solo
// repetiría cinco veces el mismo envoltorio.

import { CAMBIAR_FICHA as cambiarFicha } from '../../../../../_lib/rutas/estructura';

export const dynamic = 'force-dynamic';

export async function POST(peticion, contexto) {
  return cambiarFicha(peticion, await (contexto && contexto.params));
}
