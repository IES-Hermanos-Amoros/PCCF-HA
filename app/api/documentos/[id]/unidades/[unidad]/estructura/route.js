// Envoltorio de la ruta. La lógica está en app/_lib/rutas/estructura-modulo.js (docs/api.md, primera
// regla de forma): la estructura propia de un módulo, que se lee y se guarda entera.

import { GET as leer, PUT as guardar } from '../../../../../../_lib/rutas/estructura-modulo';

export const dynamic = 'force-dynamic';

export async function GET(peticion, contexto) {
  return leer(peticion, await (contexto && contexto.params));
}

export async function PUT(peticion, contexto) {
  return guardar(peticion, await (contexto && contexto.params));
}
