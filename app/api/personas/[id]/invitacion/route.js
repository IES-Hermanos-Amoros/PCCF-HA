// Envoltorio de la ruta. La lógica está en app/_lib/rutas/reinvitacion.js (docs/api.md, primera
// regla de forma).

import { POST as volverAInvitar } from '../../../../_lib/rutas/reinvitacion';

export const dynamic = 'force-dynamic';

export async function POST(peticion, contexto) {
  return volverAInvitar(peticion, await (contexto && contexto.params));
}
