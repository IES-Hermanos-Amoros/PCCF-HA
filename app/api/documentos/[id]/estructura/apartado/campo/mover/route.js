// Envoltorio de la ruta. La lógica está en app/_lib/rutas/estructura.js (docs/api.md, primera regla
// de forma): sube o baja un campo entre los de su apartado, que es cambiar el orden en que sale impreso.

import { MOVER_CAMPO as moverCampo } from '../../../../../../../_lib/rutas/estructura';

export const dynamic = 'force-dynamic';

export async function POST(peticion, contexto) {
  return moverCampo(peticion, await (contexto && contexto.params));
}
