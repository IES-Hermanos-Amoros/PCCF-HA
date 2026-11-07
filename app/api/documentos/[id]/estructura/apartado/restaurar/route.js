// Envoltorio de la ruta. La lógica está en app/_lib/rutas/estructura.js (docs/api.md, primera regla
// de forma): devuelve al documento un apartado retirado, con todo lo que tenía escrito.

import { RESTAURAR as restaurar } from '../../../../../../_lib/rutas/estructura';

export const dynamic = 'force-dynamic';

export async function POST(peticion, contexto) {
  return restaurar(peticion, await (contexto && contexto.params));
}
