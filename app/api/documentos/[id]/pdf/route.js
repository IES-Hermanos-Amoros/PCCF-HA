// Envoltorio de la ruta. La lógica está en app/_lib/rutas/pdf.js (docs/api.md, primera regla de
// forma).
//
// `maxDuration`: generar el tomo completo de la PD real son 11 módulos y ~2 MB de PDF, y pasa de
// los 10 s que Vercel da por omisión a una función. 60 s es el máximo del plan gratuito
// (docs/plan.md §5, aviso nº 5). En desarrollo no hace nada.

import { GET as pdf } from '../../../../_lib/rutas/pdf';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(peticion, contexto) {
  return pdf(peticion, await (contexto && contexto.params));
}
