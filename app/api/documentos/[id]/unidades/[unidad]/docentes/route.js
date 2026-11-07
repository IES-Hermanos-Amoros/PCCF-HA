// Envoltorio de la ruta. La lógica está en app/_lib/rutas/unidades.js (docs/api.md, primera regla
// de forma). Se manda la lista completa de quién lleva la unidad, no una operación sobre una persona.

import { PUT as docentes } from '../../../../../../_lib/rutas/unidades';

export const dynamic = 'force-dynamic';

export async function PUT(peticion, contexto) {
  return docentes(peticion, await (contexto && contexto.params));
}
