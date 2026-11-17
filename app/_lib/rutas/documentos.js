// GET /api/documentos — la lista de documentos, sin `plantilla`.
//
// Acepta los mismos filtros que el repositorio (tipo, curso, departamento, estado), que son los que
// la portada necesita para agrupar por tipo y por curso.
//
// EL DEPARTAMENTO NO SE FILTRA EN EL CLIENTE
//
// Quien no es admin ni jefatura de estudios solo ve los documentos de su departamento, y eso se
// resuelve aquí de dos formas que se solapan a propósito:
//
//  1. si no se ha pedido un departamento, se fuerza el del usuario, para no traerse de la base de
//     datos documentos que luego hay que tirar;
//  2. y en cualquier caso se filtra el resultado con `puedeVer`, que es LA regla de core/permisos.js.
//
// La segunda es la que de verdad protege: la primera es solo para no leer de más. Si un día alguien
// añade un filtro nuevo y se olvida del primer paso, el segundo sigue ahí.
//
// Un docente que pida `?departamento=matematicas` recibe una lista vacía en lugar de la de su
// departamento. Devolver otra cosa de la que ha pedido sería más confuso que decirle que ahí no hay
// nada, que es además la verdad para él.

'use strict';

const C = require('../../../core/permisos');
const { esActiva } = require('../../../core/versiones');
const { obtenerRepositorio } = require('../repositorio');
const { usuarioDeLaPeticion } = require('../usuario');
const { conErrores, sinPlantilla, SIN_IDENTIFICAR } = require('./comun');

const FILTROS = ['tipo', 'curso', 'departamento', 'estado'];

// Los dos roles que ven el centro entero. La jefatura de estudios ve todos los departamentos en
// cualquier estado porque es quien aprueba; el admin, porque da soporte.
const TODO_EL_CENTRO = ['admin', 'jefe_estudios'];

const GET = conErrores(async (peticion) => {
  const usuario = await usuarioDeLaPeticion(peticion);
  if (!usuario) return SIN_IDENTIFICAR();

  const url = new URL(peticion.url);
  const filtro = {};
  for (const campo of FILTROS) {
    const valor = url.searchParams.get(campo);
    if (valor !== null && valor !== '') filtro[campo] = valor;
  }
  if (!TODO_EL_CENTRO.includes(usuario.rol) && filtro.departamento === undefined) {
    filtro.departamento = usuario.departamento;
  }

  const repo = obtenerRepositorio();
  const documentos = (await repo.documentos.listar(filtro))
    // Solo la versión activa: las alternativas se piden desde /versiones.
    .filter((d) => esActiva(d) && C.puedeVer(usuario, d))
    .map(sinPlantilla);

  return Response.json({ documentos }, { headers: { 'Cache-Control': 'no-store' } });
});

module.exports = { GET };
