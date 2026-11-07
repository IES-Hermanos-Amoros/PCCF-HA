// Envoltorio de la ruta. La lógica está en app/_lib/rutas/arrastre.js (docs/api.md, primera regla de
// forma): crea el documento del curso siguiente a partir de este, copiando lo que es del departamento.

import { CREAR as siguienteCurso } from '../../../../_lib/rutas/arrastre';

export const dynamic = 'force-dynamic';

export async function POST(peticion, contexto) {
  return siguienteCurso(peticion, await (contexto && contexto.params));
}
