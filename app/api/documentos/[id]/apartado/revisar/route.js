// Envoltorio de la ruta. La lógica está en app/_lib/rutas/apartado.js (docs/api.md, primera regla de
// forma): da por revisada una rama, con la misma versión de concurrencia que el PATCH.

import { REVISAR as revisar } from '../../../../../_lib/rutas/apartado';

export const dynamic = 'force-dynamic';

export async function POST(peticion, contexto) {
  return revisar(peticion, await (contexto && contexto.params));
}
