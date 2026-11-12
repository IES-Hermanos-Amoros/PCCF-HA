// El reparto de unidades de un documento: `/reparto/<documentoId>`.
//
// POR QUÉ NO ESTÁ EN `/doc/<id>/reparto`
//
// Porque `/doc/[id]/[[...seccion]]` es un segmento atrapalotodo: los ids de
// sección llevan barras dentro y cualquier camino bajo `/doc/<id>/` es un
// apartado. Un `reparto` ahí dentro le quitaría el sitio a un apartado que se
// llamara así, y sería un 404 que nadie sabría explicar. Con una ruta propia no
// hay ambigüedad posible.

import { asegurarSemilla } from '../../../_lib/semilla';
import Reparto from '../../../_componentes/Reparto';

export const metadata = { title: 'Reparto' };

export const dynamic = 'force-dynamic';

export default async function PaginaReparto({ params }) {
  await asegurarSemilla();
  const { id } = await params;
  return <Reparto documentoId={id} />;
}
