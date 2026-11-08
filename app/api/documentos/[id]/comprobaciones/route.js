// Envoltorio de la ruta. La lógica está en app/_lib/rutas/comprobaciones.js (docs/api.md, primera
// regla de forma): qué comprobaciones se le aplican a este documento, con qué convenio se cuentan las
// ponderaciones de los criterios, cuáles son fijas por normativa y quién puede cambiarlo.

import { GET as comprobaciones, CAMBIAR as cambiarComprobaciones } from '../../../../_lib/rutas/comprobaciones';

export const dynamic = 'force-dynamic';

export async function GET(peticion, contexto) {
  return comprobaciones(peticion, await (contexto && contexto.params));
}

export async function PATCH(peticion, contexto) {
  return cambiarComprobaciones(peticion, await (contexto && contexto.params));
}
