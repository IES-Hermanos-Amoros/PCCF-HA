// La pantalla de acceso: `/acceso?t=<testigo>`.
//
// Es un envoltorio de servidor que solo lee el testigo de la dirección y se lo
// pasa al componente. El canje lo hace el navegador con `POST /api/acceso`,
// porque es la respuesta de esa ruta la que trae la cookie de sesión: desde un
// componente de servidor no se puede poner.
//
// Se asegura la semilla por lo mismo que la portada: con el repositorio en
// memoria, quien llega con un enlace es justo quien todavía no ha pasado por
// ninguna ruta que siembre (app/_lib/semilla.js).

import { asegurarSemilla } from '../../_lib/semilla';
import Acceso from '../../_componentes/Acceso';

export const dynamic = 'force-dynamic';

export default async function PaginaAcceso({ searchParams }) {
  await asegurarSemilla();
  const consulta = await searchParams;
  const testigo = consulta && consulta.t ? String(consulta.t) : null;

  return <Acceso testigo={testigo} />;
}
