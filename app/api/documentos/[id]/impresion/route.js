// Envoltorio de la ruta. La lógica está en app/_lib/rutas/impresion.js (docs/api.md, primera regla
// de forma): hasta qué nivel llega el índice del documento, qué apartados empiezan en página nueva y
// quién puede cambiarlo.

import { GET as impresion, CAMBIAR as cambiarImpresion } from '../../../../_lib/rutas/impresion';

export const dynamic = 'force-dynamic';

export async function GET(peticion, contexto) {
  return impresion(peticion, await (contexto && contexto.params));
}

export async function PATCH(peticion, contexto) {
  return cambiarImpresion(peticion, await (contexto && contexto.params));
}
