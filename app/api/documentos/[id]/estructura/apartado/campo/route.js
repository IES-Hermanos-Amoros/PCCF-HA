// Envoltorio de la ruta. La lógica está en app/_lib/rutas/estructura.js (docs/api.md, primera regla
// de forma): añade un campo —una tabla, por ejemplo— a un apartado que ya existe.

import {
  ANADIR_CAMPO as anadirCampo, BORRAR_CAMPO as borrarCampo, RENOMBRAR_CAMPO as renombrarCampo,
} from '../../../../../../_lib/rutas/estructura';

export const dynamic = 'force-dynamic';

export async function POST(peticion, contexto) {
  return anadirCampo(peticion, await (contexto && contexto.params));
}

// Cambia la etiqueta de un campo; su id se queda como está.
export async function PATCH(peticion, contexto) {
  return renombrarCampo(peticion, await (contexto && contexto.params));
}

// Borra de verdad un campo que ya estaba retirado, con lo que tenía escrito.
export async function DELETE(peticion, contexto) {
  return borrarCampo(peticion, await (contexto && contexto.params));
}
