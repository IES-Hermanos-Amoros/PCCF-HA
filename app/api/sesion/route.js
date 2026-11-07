// Envoltorio de la ruta. La lógica está en app/_lib/rutas/sesion.js (docs/api.md, primera regla de
// forma).

import { GET as quienSoy, DELETE as cerrar } from '../../_lib/rutas/sesion';

export const dynamic = 'force-dynamic';

export async function GET(peticion) {
  return quienSoy(peticion);
}

export async function DELETE(peticion) {
  return cerrar(peticion);
}
