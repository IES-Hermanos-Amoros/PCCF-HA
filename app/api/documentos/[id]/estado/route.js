// Envoltorio de la ruta. La lógica está en app/_lib/rutas/estado.js (docs/api.md, primera regla de
// forma): el circuito `borrador → revisión → aprobado`, quién mueve cada flecha y la puerta que
// impide aprobar un documento con errores.

import { GET as estado, CAMBIAR as cambiarEstado } from '../../../../_lib/rutas/estado';

export const dynamic = 'force-dynamic';

export async function GET(peticion, contexto) {
  return estado(peticion, await (contexto && contexto.params));
}

export async function POST(peticion, contexto) {
  return cambiarEstado(peticion, await (contexto && contexto.params));
}
