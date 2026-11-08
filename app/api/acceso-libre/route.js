// Envoltorio de app/_lib/rutas/acceso-libre.js. SOLO PARA PROBAR: ver allí.
import { GET as leer, POST as entrar } from '../../_lib/rutas/acceso-libre';

export const dynamic = 'force-dynamic';

export async function GET(peticion) { return leer(peticion); }
export async function POST(peticion) { return entrar(peticion); }
