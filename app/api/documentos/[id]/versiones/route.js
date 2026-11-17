// Envoltorio de la ruta. La lógica está en app/_lib/rutas/versiones.js (docs/api.md, primera regla de forma).

import { GET as versiones } from '../../../../_lib/rutas/versiones';

export const dynamic = 'force-dynamic';

export async function GET(peticion, contexto) {
  return versiones(peticion, await (contexto && contexto.params));
}
