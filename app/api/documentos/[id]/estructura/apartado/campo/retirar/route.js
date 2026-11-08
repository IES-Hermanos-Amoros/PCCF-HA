// Envoltorio de la ruta. La lógica está en app/_lib/rutas/estructura.js (docs/api.md, primera regla
// de forma): quita un campo de un apartado. No borra nada: lo escrito en él se conserva y el campo se
// recupera por la ruta de al lado.

import { RETIRAR_CAMPO as retirarCampo } from '../../../../../../../_lib/rutas/estructura';

export const dynamic = 'force-dynamic';

export async function POST(peticion, contexto) {
  return retirarCampo(peticion, await (contexto && contexto.params));
}
