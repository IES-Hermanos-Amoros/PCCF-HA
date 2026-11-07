// Comprobación de que la aplicación está viva y el repositorio responde.
//
// Existe para que el despliegue se pueda verificar sin abrir un navegador y sin
// datos: `curl /api/salud`. Dice con qué adaptador está arrancada, que es la
// pregunta que más veces se contesta mal al desplegar (la aplicación «funciona»
// pero está guardando en memoria porque falta MONGODB_URI, y nadie se entera
// hasta que se reinicia la función y desaparece lo escrito).

import { obtenerRepositorio } from '../../_lib/repositorio';

export const dynamic = 'force-dynamic';

export async function GET() {
  const repo = obtenerRepositorio();

  try {
    const documentos = await repo.documentos.listar({});
    return Response.json({
      ok: true,
      almacen: repo.enMemoria ? 'memoria' : 'mongo',
      persistente: !repo.enMemoria,
      documentos: documentos.length,
    });
  } catch (e) {
    return Response.json(
      { ok: false, almacen: repo.enMemoria ? 'memoria' : 'mongo', error: e.message },
      { status: 500 },
    );
  }
}
