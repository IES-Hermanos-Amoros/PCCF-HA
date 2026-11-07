// Envoltorio de la ruta. La lógica está en app/_lib/rutas/documento.js (docs/api.md, primera regla
// de forma).
//
// `contexto.params` es una promesa desde Next 15, así que se resuelve aquí: la lógica recibe un
// objeto normal `{ id }` y test/api.js se la puede pasar a mano.

import { GET as documento } from '../../../_lib/rutas/documento';

export const dynamic = 'force-dynamic';

export async function GET(peticion, contexto) {
  return documento(peticion, await (contexto && contexto.params));
}
