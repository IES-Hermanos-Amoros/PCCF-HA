// Envoltorio de la ruta. La lógica está en app/_lib/rutas/arbol.js (docs/api.md, primera regla de
// forma), y el árbol lo monta core/arbol.js.

import { GET as arbol } from '../../../../_lib/rutas/arbol';

export const dynamic = 'force-dynamic';

export async function GET(peticion, contexto) {
  return arbol(peticion, await (contexto && contexto.params));
}
