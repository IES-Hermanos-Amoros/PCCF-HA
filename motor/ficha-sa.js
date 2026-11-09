// La ficha de una situación de aprendizaje, en los dos sentidos, para el motor.
//
// La lógica vive en core/sa.js (decisión §2.2 de docs/plan.md). Este fichero es
// solo la puerta que usa el motor: reexporta con la misma API que tenía antes,
// para que render-generico, exportar-docx, importar-docx y los scripts no cambien.
//
//   fichaDeFilas(filas, cabecera, campos)  tabla importada -> modelo con campos con nombre
//   filasDeFicha(ficha, campos)            modelo          -> tabla, la que imprime el PDF
//
// `campos` es la estructura de la ficha y es siempre opcional: sin ella se usa la de omisión.
//
// Lo que hay que saber de la conversión (las dos maquetaciones del Word, el
// formato de las etiquetas, la cabecera que manda) está en el comentario de
// core/sa.js.

'use strict';

const C = require('../core/sa');

module.exports = {
  CAMPOS: C.CAMPOS,
  CAMPOS_POR_OMISION: C.CAMPOS_POR_OMISION,
  CABECERA_ACTIVIDADES: C.CABECERA_ACTIVIDADES,
  COLUMNAS: C.COLUMNAS,
  fichaDeFilas: C.fichaDeFilas,
  filasDeFicha: C.filasDeFicha,
  fichaVacia: C.fichaVacia,
  esSemantica: C.esSemantica,
  aLineas: C.aLineas,
  deLineas: C.deLineas,
  norm: C.norm,
  raDeTexto: C.raDeTexto,
};
