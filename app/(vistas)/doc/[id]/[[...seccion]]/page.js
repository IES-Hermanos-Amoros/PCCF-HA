// El visor del documento: `/doc/<id>` y `/doc/<id>/<idSeccion>?u=<unidadId>`.
//
// POR QUÉ UN SEGMENTO ATRAPALOTODO OPCIONAL
//
// El id de una sección lleva barras dentro —`modulos/evaluacion-y-calificacion/
// criterios-de-calificacion` es un id, no tres— porque el importador los genera
// así, con el camino completo, para que renombrar un apartado no cambie el id de
// sus hijos. Con un `[seccion]` normal, un apartado de tercer nivel no casaría
// con ninguna ruta y daría un 404. Y es opcional porque `/doc/<id>` solo, sin
// sección, es la portada del documento, que es por donde se entra.
//
// El estado se lee aquí una vez y se le pasa al visor como punto de partida; a
// partir de ahí lo lleva el navegador con `history.pushState` (ver Visor.js). Lo
// que importa es que la dirección es la que manda: un enlace pegado abre
// exactamente el apartado que abrió quien lo copió.

import { asegurarSemilla } from '../../../../_lib/semilla';
import Visor from '../../../../_componentes/Visor';

export const metadata = { title: 'Documento' };

export const dynamic = 'force-dynamic';

export default async function PaginaDocumento({ params, searchParams }) {
  await asegurarSemilla();
  const { id, seccion } = await params;
  const consulta = await searchParams;

  return (
    <Visor
      documentoId={id}
      seccionInicial={(seccion || []).join('/') || null}
      // La unidad va por su id estable y nunca por su índice: un índice apunta a
      // otro módulo en cuanto alguien reordena (docs/mockup-v2/README.md).
      unidadInicial={consulta && consulta.u ? String(consulta.u) : null}
      // Y la vista, también en la dirección: el panel de validaciones es una
      // pantalla que se manda por enlace («mira los errores de tu módulo»), así
      // que tiene que poder copiarse y recargarse como cualquier apartado.
      vistaInicial={consulta && consulta.vista ? String(consulta.vista) : null}
    />
  );
}
