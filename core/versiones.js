// Versiones de un documento: qué es el mismo documento y cuál de sus versiones es la que vale.
//
// La identidad de un documento es tipo + curso + ciclo + departamento (la memoria, que es del departamento,
// no lleva ciclo en la clave). Todos los documentos con esa
// clave son versiones del mismo, y exactamente una está activa. El porqué, en docs/plan.md
// («Versiones del documento»).

'use strict';

// Ausente es ACTIVA: los documentos guardados antes de que existieran las versiones no llevan el campo.
const esActiva = (documento) => !!documento && documento.activa !== false;

// El número de versión de un documento antiguo, sin el campo, es 1.
const numeroDeVersion = (documento) => (documento && Number.isInteger(documento.version) ? documento.version : 1);

// La memoria es del departamento entero: su clave ignora el ciclo, también en las guardadas con uno.
const TIPOS_SIN_CICLO = ['memoria'];
const cicloDeLaClave = (d) => (TIPOS_SIN_CICLO.includes(d.tipo) ? null : (d.ciclo || null));

const mismoGrupo = (a, b) => !!a && !!b
  && a.tipo === b.tipo
  && a.curso === b.curso
  && a.departamento === b.departamento
  && cicloDeLaClave(a) === cicloDeLaClave(b);

// De una lista de documentos, los que son versiones del mismo que `documento` (él incluido si está en la lista),
// de la más antigua a la más reciente.
function versionesDe(documento, todos) {
  return todos
    .filter((d) => mismoGrupo(d, documento))
    .sort((x, y) => numeroDeVersion(x) - numeroDeVersion(y) || new Date(x.creado) - new Date(y.creado));
}

const siguienteVersion = (versiones) => versiones.reduce((max, d) => Math.max(max, numeroDeVersion(d)), 0) + 1;

module.exports = { TIPOS_SIN_CICLO, esActiva, numeroDeVersion, mismoGrupo, versionesDe, siguienteVersion };
