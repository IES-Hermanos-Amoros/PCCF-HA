// Envoltorio de la ruta. La lógica está en app/_lib/rutas/apartado.js (docs/api.md, primera regla
// de forma). El PATCH que guarda esta misma rama es del E3 y se añade aquí, reexportado igual.

import { GET as apartado } from '../../../../_lib/rutas/apartado';

export const dynamic = 'force-dynamic';

export async function GET(peticion, contexto) {
  return apartado(peticion, await (contexto && contexto.params));
}
