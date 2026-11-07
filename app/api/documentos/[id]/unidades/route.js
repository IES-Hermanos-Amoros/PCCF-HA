// Envoltorio de la ruta. La lógica está en app/_lib/rutas/unidades.js (docs/api.md, primera regla
// de forma).

import { GET as unidades } from '../../../../_lib/rutas/unidades';

export const dynamic = 'force-dynamic';

export async function GET(peticion, contexto) {
  return unidades(peticion, await (contexto && contexto.params));
}
