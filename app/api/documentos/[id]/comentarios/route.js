// Envoltorio de la ruta. La lógica está en app/_lib/rutas/comentarios.js (docs/api.md, primera
// regla de forma), y la colección `comentarios` la trae repositorio/ desde el E0.

import { GET as comentarios, CREAR } from '../../../../_lib/rutas/comentarios';

export const dynamic = 'force-dynamic';

export async function GET(peticion, contexto) {
  return comentarios(peticion, await (contexto && contexto.params));
}

export async function POST(peticion, contexto) {
  return CREAR(peticion, await (contexto && contexto.params));
}
