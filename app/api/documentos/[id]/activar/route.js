// Envoltorio de la ruta. La lógica está en app/_lib/rutas/versiones.js (docs/api.md, primera regla de forma).

import { ACTIVAR as activar } from '../../../../_lib/rutas/versiones';

export const dynamic = 'force-dynamic';

export async function POST(peticion, contexto) {
  return activar(peticion, await (contexto && contexto.params));
}
