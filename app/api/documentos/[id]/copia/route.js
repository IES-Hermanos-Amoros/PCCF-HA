// Envoltorio de la ruta. La lógica está en app/_lib/rutas/copia.js (docs/api.md, primera regla de forma).

import { GET as copia } from '../../../../_lib/rutas/copia';

export const dynamic = 'force-dynamic';

export async function GET(peticion, contexto) {
  return copia(peticion, await (contexto && contexto.params));
}
