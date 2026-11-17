// La portada: `/`.
//
// Sustituye a la portada provisional del E0, que no tenía estilos y solo
// demostraba que la cadena página → repositorio → adaptador estaba enchufada.
//
// Es un envoltorio de servidor a propósito: lo único que hace antes de pintar es
// asegurarse de que hay personas que elegir (app/_lib/semilla.js explica por qué
// eso no lo puede hacer el guion cuando el repositorio vive en memoria). Todo lo
// demás lo pide el navegador a la API, que es la que comprueba los permisos.
//
// La referencia visual es docs/mockup-v2/index.html.

import { asegurarSemilla } from '../_lib/semilla';
import Portada from '../_componentes/Portada';

// Nunca estática: la lista de documentos depende de quién pregunta, y la cookie
// con la que se decide eso solo existe en tiempo de petición.
export const metadata = { title: 'Documentos' };

export const dynamic = 'force-dynamic';

export default async function PaginaPortada() {
  await asegurarSemilla();
  return <Portada />;
}
