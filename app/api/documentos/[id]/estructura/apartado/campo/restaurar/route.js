// Envoltorio de la ruta. La lógica está en app/_lib/rutas/estructura.js (docs/api.md, primera regla
// de forma): devuelve a su apartado un campo retirado, con todo lo que tenía escrito.

import { RESTAURAR_CAMPO as restaurarCampo } from '../../../../../../../_lib/rutas/estructura';

export const dynamic = 'force-dynamic';

export async function POST(peticion, contexto) {
  return restaurarCampo(peticion, await (contexto && contexto.params));
}
