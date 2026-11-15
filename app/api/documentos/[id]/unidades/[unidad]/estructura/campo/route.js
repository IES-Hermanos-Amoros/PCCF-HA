import { BORRAR_CAMPO as borrar } from '../../../../../../../_lib/rutas/estructura-modulo-borrar';

export const dynamic = 'force-dynamic';

export async function DELETE(peticion, contexto) {
  return borrar(peticion, await (contexto && contexto.params));
}
