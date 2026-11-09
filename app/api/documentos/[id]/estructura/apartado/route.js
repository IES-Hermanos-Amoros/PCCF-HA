// Envoltorio de la ruta. La lógica está en app/_lib/rutas/estructura.js (docs/api.md, primera regla
// de forma): el POST añade un apartado a la plantilla del documento y el PATCH lo renombra, sin
// tocar su id.

import { ANADIR as anadir, RENOMBRAR as renombrar, BORRAR as borrar } from '../../../../../_lib/rutas/estructura';

export const dynamic = 'force-dynamic';

export async function POST(peticion, contexto) {
  return anadir(peticion, await (contexto && contexto.params));
}

export async function PATCH(peticion, contexto) {
  return renombrar(peticion, await (contexto && contexto.params));
}

// Borra de verdad un apartado que ya estaba retirado, con todo lo que tenía escrito.
export async function DELETE(peticion, contexto) {
  return borrar(peticion, await (contexto && contexto.params));
}
