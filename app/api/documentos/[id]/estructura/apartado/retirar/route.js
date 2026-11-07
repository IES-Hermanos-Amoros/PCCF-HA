// Envoltorio de la ruta. La lógica está en app/_lib/rutas/estructura.js (docs/api.md, primera regla
// de forma): retira un apartado del documento. No borra nada: el contenido se conserva y el
// apartado se recupera por la ruta de al lado.

import { RETIRAR as retirar } from '../../../../../../_lib/rutas/estructura';

export const dynamic = 'force-dynamic';

export async function POST(peticion, contexto) {
  return retirar(peticion, await (contexto && contexto.params));
}
