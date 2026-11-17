// Las personas del departamento: `/personas`.
//
// Envoltorio de servidor, como la portada: asegura la semilla —con el
// repositorio en memoria no hay censo hasta que alguien la pide
// (app/_lib/semilla.js)— y deja que el navegador pregunte a la API, que es la
// que comprueba los permisos.

import { asegurarSemilla } from '../../_lib/semilla';
import Personas from '../../_componentes/Personas';

export const metadata = { title: 'Personas' };

export const dynamic = 'force-dynamic';

export default async function PaginaPersonas() {
  await asegurarSemilla();
  return <Personas />;
}
