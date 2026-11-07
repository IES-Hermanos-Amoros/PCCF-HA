// Envoltorio de la ruta. La lógica está en app/_lib/rutas/estructura.js (docs/api.md, primera regla
// de forma): mueve un apartado entre sus hermanos, un sitio arriba o abajo.

import { MOVER as mover } from '../../../../../../_lib/rutas/estructura';

export const dynamic = 'force-dynamic';

export async function POST(peticion, contexto) {
  return mover(peticion, await (contexto && contexto.params));
}
