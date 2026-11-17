// Envoltorio de la ruta. La lógica está en app/_lib/rutas/asignaciones.js (docs/api.md, primera regla
// de forma). Se manda la lista completa de quién lleva el apartado, no una operación sobre una persona.

import { GET as leer, PUT as escribir } from '../../../../_lib/rutas/asignaciones';

export const dynamic = 'force-dynamic';

export async function GET(peticion, contexto) {
  return leer(peticion, await (contexto && contexto.params));
}

export async function PUT(peticion, contexto) {
  return escribir(peticion, await (contexto && contexto.params));
}
