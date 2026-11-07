// Envoltorio de la ruta. La lógica está en app/_lib/rutas/invitaciones.js, que es CommonJS y no sabe
// que está dentro de Next: docs/api.md, primera regla de forma. Si viviera aquí, probarla obligaría a
// levantar el servidor.

import { POST as invitar } from '../../_lib/rutas/invitaciones';

export const dynamic = 'force-dynamic';

export async function POST(peticion) {
  return invitar(peticion);
}
