// Envoltorio de la ruta. La lógica está en app/_lib/rutas/validaciones.js (docs/api.md, primera
// regla de forma), y las reglas que se comprueban, en core/validaciones.js.

import { GET as validaciones } from '../../../../_lib/rutas/validaciones';

export const dynamic = 'force-dynamic';

export async function GET(peticion, contexto) {
  return validaciones(peticion, await (contexto && contexto.params));
}
