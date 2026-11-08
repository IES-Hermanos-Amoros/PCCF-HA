// ELEGIR LA FORMA DE UN CAMPO NUEVO: lo que hace falta para pintar el alta de un campo sin
// escribir en la pantalla ni un solo tipo de campo.
//
// El catálogo (core/campos.js, `catalogo()`, que la API devuelve como `tiposDeCampo`) dice qué
// se puede crear, con el nombre en castellano y los parámetros que cada tipo pide, con sus
// límites y su valor por omisión. Este fichero convierte eso en lo que necesita un formulario:
// el estado con el que se abre, cómo se cambia un parámetro, si lo elegido vale, qué se manda a
// la API y cómo quedará. El día que el servidor añada un tipo, o un parámetro a uno que ya está,
// la pantalla lo ofrece sin tocarla, porque nada de aquí menciona `filas` ni `cabecera`.
//
// EL CATÁLOGO LLEGA POR PARÁMETRO
//
// Las funciones reciben la definición (`def`, un elemento de `tiposDeCampo`) y no la leen de
// `Core.campos`: lo que ofrece la pantalla es lo que dijo el servidor, y si el navegador tuviera
// otra copia del catálogo podrían separarse. Lo único que se pide a `Core.campos` es la prueba
// final —`crearCampo`—, que es la MISMA función con la que el servidor rechazará o aceptará la
// petición, así que «esto vale» aquí significa «esto vale» allí.
//
// LO ESCRITO A MEDIAS NO SE CORRIGE
//
// Quien teclea «1» camino de «12» pasa por estados que no valen, y un número vacío no es un
// error del usuario sino un estado intermedio. `fijar` guarda lo que se escribe tal cual (un
// entero, o la cadena vacía) y `motivo` dice lo que falta; no se recorta ni se rellena con el
// valor por omisión, que es lo que haría `crearCampo` con una cadena vacía y daría una tabla de
// 3 filas a quien no ha terminado de escribir.
//
// Lógica pura: sin DOM, sin node, sin red. Vale como <script>, como `require` y como `import`.
// Cuelga de `global.Core.camposForma`.

(function (global) {
  'use strict';

  // Las dependencias se resuelven al usarlas y con la ruta LITERAL en cada rama: un
  // `require(variable)` corta el `npm run build` con «Can't resolve <dynamic>».
  function deCore(nombre) {
    if (global.Core && global.Core[nombre]) return global.Core[nombre];
    if (typeof require === 'function') {
      if (nombre === 'campos') return require('./campos.js');
      if (nombre === 'tablasEdicion') return require('./tablas-edicion.js');
    }
    throw new Error('core/campos-forma.js necesita core/' + nombre + '.js');
  }
  const Campos = () => deCore('campos');
  const Edicion = () => deCore('tablasEdicion');

  const porTipo = (tipos, tipo) => (Array.isArray(tipos) ? tipos : []).find((d) => d && d.tipo === tipo) || null;

  // ---------------------------------------------------------------- el estado del formulario

  // Los valores con los que se abre el formulario de un tipo: el que declara cada parámetro.
  function formaInicial(def) {
    const forma = {};
    for (const p of (def && def.parametros) || []) forma[p.id] = p.defecto;
    return forma;
  }

  // El parámetro `id` con lo que se acaba de escribir. Un entero es un número o, si no hay nada
  // escrito, la cadena vacía; un booleano, un booleano; el resto, el texto tal cual.
  function fijar(def, forma, id, crudo) {
    const p = ((def && def.parametros) || []).find((x) => x.id === id);
    if (!p) return forma;
    let v = crudo;
    if (p.tipo === 'entero') v = crudo === '' || crudo === null || crudo === undefined ? '' : Number(crudo);
    else if (p.tipo === 'booleano') v = !!crudo;
    else v = String(crudo == null ? '' : crudo);
    return { ...forma, [id]: v };
  }

  // Los tipos que se pueden elegir, con la forma que traen por omisión, para el desplegable.
  const opciones = (tipos) => (Array.isArray(tipos) ? tipos : []).map((d) => ({
    tipo: d.tipo, nombre: d.nombre, descripcion: d.descripcion,
  }));

  // ---------------------------------------------------------------- lo que se manda y lo que vale

  // La petición para la API: `{ tipo, … }` con los parámetros que el tipo declara y ninguno más.
  // Un texto vacío no se manda (el servidor pone el valor por omisión).
  function peticionDe(def, forma) {
    const peticion = { tipo: def.tipo };
    for (const p of def.parametros || []) {
      const v = forma ? forma[p.id] : undefined;
      if (v === undefined || v === '') continue;
      peticion[p.id] = v;
    }
    return peticion;
  }

  // Por qué lo elegido no vale, o null. Los enteros se comprueban aquí contra los límites del
  // catálogo porque `crearCampo` trata la cadena vacía como «ponle el valor por omisión»; el
  // resto lo decide `crearCampo`, que es quien lo decidirá en el servidor.
  function motivo(def, forma) {
    if (!def) return 'Elige qué tipo de campo quieres.';
    for (const p of def.parametros || []) {
      if (p.tipo !== 'entero') continue;
      const v = forma ? forma[p.id] : undefined;
      if (!Number.isInteger(v) || v < p.minimo || v > p.maximo) {
        return '«' + p.nombre + '» tiene que ser un número entero de ' + p.minimo + ' a ' + p.maximo + '.';
      }
    }
    const hecho = Campos().crearCampo(peticionDe(def, forma), []);
    return hecho.motivo || null;
  }

  // ---------------------------------------------------------------- cómo quedará

  // El campo tal como nacería y el valor con el que se abriría, para la vista previa. Un tipo que
  // no tiene forma de tabla (el texto) da `valor: null` y la pantalla enseña su descripción.
  // Devuelve { motivo } si lo elegido no vale.
  function previsualizar(def, forma) {
    const m = motivo(def, forma);
    if (m) return { motivo: m };
    const campo = Campos().crearCampo(peticionDe(def, forma), []).campo;
    const valor = Campos().valorInicial(campo);
    const esTabla = Edicion().esRejilla(valor) || Edicion().esClaveValor(valor);
    return {
      campo,
      valor: esTabla ? valor : null,
      pintar: esTabla ? Edicion().paraPintar(valor) : null,
    };
  }

  // Una frase que dice lo elegido, para la lista de campos de un apartado que todavía no existe.
  function resumen(def, forma) {
    if (!def) return '';
    const nombre = (forma && typeof forma.etiqueta === 'string' && forma.etiqueta.trim())
      || (def.parametros || []).reduce((a, p) => (p.id === 'etiqueta' ? p.defecto : a), def.nombre);
    const vista = previsualizar(def, forma);
    if (vista.motivo) return def.nombre + ' «' + nombre + '»';
    const tamano = vista.valor ? Edicion().descripcion(vista.valor) : null;
    const cabecera = forma && forma.cabecera === true ? ', con fila de cabecera' : '';
    return def.nombre + ' «' + nombre + '»' + (tamano ? ': ' + tamano + cabecera : '');
  }

  // ---------------------------------------------------------------- los topes

  // Cuántos campos caben todavía: `limite` es lo que dice la API (`limites`), `ya` los que hay.
  const caben = (limite, ya) => Math.max(0, (Number.isInteger(limite) ? limite : 0) - (Number.isInteger(ya) ? ya : 0));

  const api = { porTipo, opciones, formaInicial, fijar, peticionDe, motivo, previsualizar, resumen, caben };

  global.Core = global.Core || {};
  global.Core.camposForma = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
