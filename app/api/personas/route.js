// Envoltorio de la ruta. La lógica está en app/_lib/rutas/personas.js, que es CommonJS y no sabe
// que está dentro de Next: docs/api.md, primera regla de forma. Si viviera aquí, probarla obligaría
// a levantar el servidor.

import { GET as personas } from '../../_lib/rutas/personas';

export const dynamic = 'force-dynamic';

export async function GET(peticion) {
  return personas(peticion);
}
