// Envoltorio de la ruta. La lógica está en app/_lib/rutas/docx.js (docs/api.md, primera regla de
// forma). `maxDuration` por lo mismo que en /pdf: el tomo completo no cabe en los 10 s por omisión.

import { GET as docx } from '../../../../_lib/rutas/docx';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(peticion, contexto) {
  return docx(peticion, await (contexto && contexto.params));
}
