// Cambiar la estructura de UN módulo, por el lado del navegador.
//
// Las rutas de la plantilla (estructura-cliente.js) son una por cambio. La del módulo es un PUT de la
// estructura ENTERA (app/_lib/rutas/estructura-modulo.js, y el porqué en su cabecera): el servidor no
// tiene «retira este campo», tiene «esta es la estructura que quiero». Así que la operación que el
// docente pulsa —retirar, restaurar, renombrar, mover, añadir un campo— se COMPONE aquí sobre la
// estructura que el módulo lleva ahora, y lo que se manda es el resultado. Quien la valida sigue siendo
// el servidor (`motivoDeEstructura`), con sus motivos escritos para una persona.
//
// Solo se guarda el DESVÍO (core/estructura-modulo.js): un apartado que el módulo no toca no aparece, y
// una estructura sin desvíos es `null`, que devuelve el módulo a la común.
//
// Esto habla de campos de un apartado. Retirar, renombrar o mover el apartado ENTERO en un solo módulo
// existe en el núcleo (`apartados`), pero la pantalla todavía no lo ofrece: se dice en la tarjeta.

import Campos from '../../core/campos';
import EstructuraModulo from '../../core/estructura-modulo';
import { pedir } from './api';

const esObjeto = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const limpiar = (texto) => String(texto == null ? '' : texto).replace(/\s+/g, ' ').trim();

// Los campos de un apartado TAL COMO LOS VE ESTE MÓDULO, con lo que se puede hacer a cada uno. Es la
// misma regla que pinta el apartado y lo exporta (`camposDeSeccion`), no una copia: lo que se lista
// aquí es lo que sale en el papel.
//
// `fila` es la del apartado en la lectura de la estructura de la plantilla (los campos comunes, con sus
// candados); `estructura` es la del módulo, o null. Cada campo devuelto lleva `propio` si lo añadió el
// módulo. Un campo retirado en lo común no se restaura desde un módulo: lo común manda.
export function camposDelModulo(fila, estructura, seccion) {
  const comunes = fila && Array.isArray(fila.campos) ? fila.campos : [];
  const cerrado = !fila || fila.retirado || fila.repetidor;
  const resueltos = EstructuraModulo.camposDeSeccion(
    { id: seccion, campos: comunes.map((c) => ({ id: c.id, tipo: c.tipo, etiqueta: c.etiqueta, retirado: !!c.retirado })) },
    { estructura },
  );
  const vigentes = resueltos.campos.filter((c) => !c.retirado);
  return resueltos.campos.map((c) => {
    const comun = comunes.find((x) => x.id === c.id) || null;
    const quitado = !!c.retirado;
    const retiradoEnComun = !!(comun && comun.retirado);
    const editable = !cerrado && !quitado;
    const i = vigentes.findIndex((v) => v.id === c.id);
    return {
      id: c.id,
      tipo: c.tipo,
      etiqueta: c.etiqueta || c.id,
      retirado: quitado,
      propio: !!c.propio,
      puedeRetirar: editable && (c.propio ? Campos.esCreable(c.tipo) : !!(comun && comun.puedeRetirar)),
      puedeRestaurar: !cerrado && quitado && !retiradoEnComun,
      puedeRenombrar: editable,
      puedeSubir: editable && i > 0,
      puedeBajar: editable && i >= 0 && i < vigentes.length - 1,
    };
  });
}

// La fila del apartado con los campos del módulo en lugar de los comunes: es lo que reciben
// `QuitarCampos` y `AnadirCampo`, que no saben de dónde salen.
export const filaDelModulo = (fila, estructura, seccion) => (fila
  ? { ...fila, campos: camposDelModulo(fila, estructura, seccion) }
  : fila);

// ---------------------------------------------------------------- componer la estructura nueva

// El desvío de un apartado, copiado para poder tocarlo sin tocar el que hay.
function copiaDelDesvio(estructura, seccion) {
  const d = esObjeto(estructura) && esObjeto(estructura.secciones) && esObjeto(estructura.secciones[seccion])
    ? estructura.secciones[seccion] : {};
  return {
    campos: Object.keys(d.campos || {}).reduce((o, id) => { o[id] = { ...d.campos[id] }; return o; }, {}),
    anadidos: (Array.isArray(d.anadidos) ? d.anadidos : []).map((a) => ({ ...a })),
    orden: Array.isArray(d.orden) ? d.orden.slice() : [],
  };
}

// La estructura entera con el desvío de ESE apartado cambiado. Un desvío que se queda sin nada se quita
// del todo —el servidor lo rechazaría—, y una estructura que se queda sin desvíos es `null`.
function conElDesvio(estructura, seccion, desvio) {
  const secciones = { ...(esObjeto(estructura) && esObjeto(estructura.secciones) ? estructura.secciones : {}) };
  const out = {};
  if (Object.keys(desvio.campos).length) out.campos = desvio.campos;
  if (desvio.anadidos.length) out.anadidos = desvio.anadidos;
  if (desvio.orden.length) out.orden = desvio.orden;
  if (Object.keys(out).length) secciones[seccion] = out; else delete secciones[seccion];
  const resto = esObjeto(estructura) ? { ...estructura } : {};
  delete resto.secciones;
  const nueva = Object.keys(secciones).length ? { ...resto, secciones } : resto;
  return EstructuraModulo.estructuraDeModulo({ estructura: nueva }) ? nueva : null;
}

// Aplica una operación de campo y devuelve { estructura, campo?, posicion?, total? }, o lanza un Error
// con el motivo. `operacion`: { accion, campo?, etiqueta?, delta?, peticion? }.
export function componerCambio(estructura, fila, seccion, operacion) {
  const campos = camposDelModulo(fila, estructura, seccion);
  const desvio = copiaDelDesvio(estructura, seccion);
  const c = operacion.campo ? campos.find((x) => x.id === operacion.campo) : null;
  if (operacion.accion !== 'anadir_campo' && !c) {
    throw new Error(`Este módulo no tiene ningún campo «${operacion.campo}» en el apartado.`);
  }
  const propio = c ? desvio.anadidos.find((a) => a.id === c.id) : null;
  const comun = c && !propio ? ((fila && fila.campos) || []).find((x) => x.id === c.id) : null;
  const resultado = {};

  if (operacion.accion === 'retirar_campo') {
    if (propio) propio.retirado = true; else desvio.campos[c.id] = { ...desvio.campos[c.id], retirado: true };
  } else if (operacion.accion === 'restaurar_campo') {
    if (propio) {
      delete propio.retirado;
    } else if (desvio.campos[c.id]) {
      const { retirado, ...resto } = desvio.campos[c.id];
      if (Object.keys(resto).length) desvio.campos[c.id] = resto; else delete desvio.campos[c.id];
    }
    resultado.campo = c.id;
  } else if (operacion.accion === 'renombrar_campo') {
    const etiqueta = limpiar(operacion.etiqueta);
    if (propio) {
      propio.etiqueta = etiqueta;
    } else {
      // Volver a llamarlo como en lo común es quitar el desvío, no guardar un nombre igual.
      const { etiqueta: _anterior, ...resto } = desvio.campos[c.id] || {};
      const cambio = etiqueta && comun && etiqueta === comun.etiqueta ? resto : { ...resto, etiqueta };
      if (Object.keys(cambio).length) desvio.campos[c.id] = cambio; else delete desvio.campos[c.id];
    }
  } else if (operacion.accion === 'mover_campo') {
    const vigentes = campos.filter((x) => !x.retirado);
    const i = vigentes.findIndex((x) => x.id === c.id);
    const j = i + operacion.delta;
    if (i < 0 || j < 0 || j >= vigentes.length) throw new Error('Ese campo ya no se puede mover en esa dirección.');
    // El orden guarda TODOS los campos, también los retirados: se intercambian los dos vecinos visibles.
    const orden = campos.map((x) => x.id);
    const a = orden.indexOf(vigentes[i].id);
    const b = orden.indexOf(vigentes[j].id);
    [orden[a], orden[b]] = [orden[b], orden[a]];
    desvio.orden = orden;
    resultado.posicion = j + 1;
    resultado.total = vigentes.length;
  } else if (operacion.accion === 'anadir_campo') {
    const ocupados = campos.map((x) => x.id);
    const hecho = Campos.crearCampo(operacion.peticion, ocupados);
    if (hecho.motivo) throw new Error(hecho.motivo);
    const id = EstructuraModulo.idDeCampoPropio(hecho.campo.etiqueta, hecho.campo.tipo, ocupados);
    const nuevo = { id, tipo: hecho.campo.tipo, etiqueta: hecho.campo.etiqueta };
    if (hecho.campo.columnas !== undefined && hecho.campo.columnas !== null) nuevo.columnas = hecho.campo.columnas;
    if (hecho.campo.inicial !== undefined) nuevo.inicial = hecho.campo.inicial;
    desvio.anadidos.push(nuevo);
    resultado.campo = id;
  } else {
    throw new Error(`Acción de estructura de módulo desconocida: ${operacion.accion}`);
  }

  resultado.estructura = conElDesvio(estructura, seccion, desvio);
  return resultado;
}

// ---------------------------------------------------------------- escribir

// Una escritura en la estructura de ESTE módulo, con la misma forma de llamada y de respuesta que
// `cambiarEstructura` para que `QuitarCampos` y `AnadirCampo` no sepan por dónde va.
//
// Antes de componer se vuelve a leer la estructura del módulo: la que tenía la pantalla puede ser de
// hace un momento, y el PUT lleva la estructura ENTERA —si se compusiera sobre una vieja se desharía
// el cambio anterior—. La lectura trae el `updatedAt` del documento, que viaja como
// `esperaUpdatedAt`: si alguien escribe entre esa lectura y el guardado, el servidor contesta 409 y no
// escribe nada. La versión de la plantilla es la que la pantalla tenía (`cuerpo.esperaPlantillaVersion`),
// no la recién leída: lo que se quiere detectar es que la jefatura la haya cambiado mientras tanto.
export async function escribirEnElModulo(documentoId, unidadId, fila, { accion, seccion, campo, cuerpo = {} }) {
  const ruta = `/api/documentos/${encodeURIComponent(documentoId)}/unidades/${encodeURIComponent(unidadId)}/estructura`;
  const leida = await pedir(ruta);
  const hecho = componerCambio(leida.estructura, fila, seccion, {
    accion,
    campo,
    etiqueta: cuerpo.etiqueta,
    delta: cuerpo.delta,
    peticion: cuerpo.campo,
  });
  const r = await pedir(ruta, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      estructura: hecho.estructura,
      esperaUpdatedAt: leida.updatedAt,
      esperaPlantillaVersion: cuerpo.esperaPlantillaVersion !== undefined ? cuerpo.esperaPlantillaVersion : leida.plantillaVersion,
    }),
  });
  return {
    ...r,
    // Lo que las tarjetas leen de la respuesta de la plantilla: este cambio no sale en los demás módulos.
    afectaUnidades: false,
    unidades: 1,
    campo: hecho.campo,
    campos: accion === 'anadir_campo' ? [{ id: hecho.campo }] : undefined,
    cambio: hecho.posicion ? { posicion: hecho.posicion, campos: hecho.total } : undefined,
  };
}
