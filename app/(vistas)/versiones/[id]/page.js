// Las versiones de un documento: `/versiones/<documentoId>`.
//
// Ruta propia y no `/doc/<id>/versiones` por lo mismo que el reparto: `/doc/[id]/[[...seccion]]` es un
// segmento atrapalotodo y cualquier camino bajo `/doc/<id>/` es un apartado.

import { asegurarSemilla } from '../../../_lib/semilla';
import Versiones from '../../../_componentes/Versiones';

export const dynamic = 'force-dynamic';

export default async function PaginaVersiones({ params }) {
  await asegurarSemilla();
  const { id } = await params;
  return <Versiones documentoId={id} />;
}
