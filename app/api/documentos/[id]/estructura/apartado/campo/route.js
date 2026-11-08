// Envoltorio de la ruta. La lógica está en app/_lib/rutas/estructura.js (docs/api.md, primera regla
// de forma): añade un campo —una tabla, por ejemplo— a un apartado que ya existe.

import { ANADIR_CAMPO as anadirCampo } from '../../../../../../_lib/rutas/estructura';

export const dynamic = 'force-dynamic';

export async function POST(peticion, contexto) {
  return anadirCampo(peticion, await (contexto && contexto.params));
}
