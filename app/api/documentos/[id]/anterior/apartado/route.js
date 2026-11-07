// Envoltorio de la ruta. La lógica está en app/_lib/rutas/apartado.js (docs/api.md, primera regla de
// forma): el mismo apartado en el curso anterior, solo lectura, con su motivo cuando no hay nada.

import { ANTERIOR as anterior } from '../../../../../_lib/rutas/apartado';

export const dynamic = 'force-dynamic';

export async function GET(peticion, contexto) {
  return anterior(peticion, await (contexto && contexto.params));
}
