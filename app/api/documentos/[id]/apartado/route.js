// Envoltorio de la ruta. La lógica está en app/_lib/rutas/apartado.js (docs/api.md, primera regla
// de forma): el GET lee una rama del documento y el PATCH la guarda, con su control de conflictos.

import { GET as apartado, PATCH as guardarApartado } from '../../../../_lib/rutas/apartado';

export const dynamic = 'force-dynamic';

export async function GET(peticion, contexto) {
  return apartado(peticion, await (contexto && contexto.params));
}

export async function PATCH(peticion, contexto) {
  return guardarApartado(peticion, await (contexto && contexto.params));
}
