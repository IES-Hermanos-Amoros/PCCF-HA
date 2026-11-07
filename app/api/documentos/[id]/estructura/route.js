// Envoltorio de la ruta. La lógica está en app/_lib/rutas/estructura.js (docs/api.md, primera regla
// de forma): la estructura del documento tal como se puede cambiar, con lo retirado y la versión de
// la plantilla.

import { GET as estructura } from '../../../../_lib/rutas/estructura';

export const dynamic = 'force-dynamic';

export async function GET(peticion, contexto) {
  return estructura(peticion, await (contexto && contexto.params));
}
