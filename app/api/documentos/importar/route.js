// Envoltorio de la ruta. La lógica está en app/_lib/rutas/importar.js (docs/api.md, primera regla de
// forma).
//
// `maxDuration`: importar la PD real tarda cerca de seis segundos (el importador, 3,7–5,7 s, más la
// conciliación y la escritura), y el límite por omisión de Vercel no llega (docs/interfaz-web.md §5,
// aviso nº 5). 60 s es el máximo del plan gratuito. En desarrollo no hace nada.

import { POST as importar } from '../../../_lib/rutas/importar';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(peticion) {
  return importar(peticion);
}
