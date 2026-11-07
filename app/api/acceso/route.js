// Envoltorio de la ruta. La lógica está en app/_lib/rutas/acceso.js (docs/api.md, primera regla de
// forma).
//
// El GET es el enlace que se pincha desde el correo; el POST, el mismo canje para la interfaz.

import { GET as canjearEnlace, POST as canjearJson } from '../../_lib/rutas/acceso';

export const dynamic = 'force-dynamic';

export async function GET(peticion) {
  return canjearEnlace(peticion);
}

export async function POST(peticion) {
  return canjearJson(peticion);
}
