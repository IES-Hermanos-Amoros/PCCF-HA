// Envoltorio de la ruta. La lógica está en app/_lib/rutas/documentos.js (docs/api.md, primera regla
// de forma). La importación —POST, multipart— es otra ruta y otro fichero.

import { GET as documentos } from '../../_lib/rutas/documentos';

export const dynamic = 'force-dynamic';

export async function GET(peticion) {
  return documentos(peticion);
}
