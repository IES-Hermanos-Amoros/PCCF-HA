// Envoltorio de la ruta. La lógica está en app/_lib/rutas/coordinacion.js (docs/api.md, primera
// regla de forma), los avisos los calcula app/_lib/rutas/validaciones.js y el árbol, core/arbol.js.

import { GET as coordinacion } from '../../../../_lib/rutas/coordinacion';

export const dynamic = 'force-dynamic';

export async function GET(peticion, contexto) {
  return coordinacion(peticion, await (contexto && contexto.params));
}
