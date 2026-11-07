// Envoltorio de la ruta. La lógica está en app/_lib/rutas/persona.js (docs/api.md, primera regla de
// forma).
//
// `contexto.params` es una promesa desde Next 15, así que se resuelve aquí: la lógica recibe un
// objeto normal `{ id }` y test/sesiones.js se la puede pasar a mano.

import { PATCH as cambiarPersona } from '../../../_lib/rutas/persona';

export const dynamic = 'force-dynamic';

export async function PATCH(peticion, contexto) {
  return cambiarPersona(peticion, await (contexto && contexto.params));
}
