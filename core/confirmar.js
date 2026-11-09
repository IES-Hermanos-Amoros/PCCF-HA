// CONFIRMAR EN DOS PASOS: a qué elemento le toca el foco.
//
// Hay tres confirmaciones en la aplicación —quitar un campo de un apartado (QuitarCampo.js),
// retirar un apartado (Estructura.js) y borrar algo para siempre (BorrarDefinitivo.js)— y cada una
// decidía su foco por su cuenta, con un `useEffect` parecido pero no igual. Tres sitios donde
// podía estar mal, y ninguno probado: en este repositorio no hay pruebas de DOM —ni jsdom ni
// playwright—, así que lo único que se puede fijar es la DECISIÓN, y es lo que está aquí. El
// `focus()` lo da app/_componentes/confirmar-cliente.js, que es el único sitio que toca el DOM.
//
// LOS TRES ELEMENTOS DE UNA CONFIRMACIÓN
//
//   abrir   el botón que la empieza («Quitar», «retirar del documento», «Borrar… para siempre»)
//   paso    lo que hay que hacer para confirmar: el botón de «sí», o el cuadro donde se escribe el
//           título cuando lo que se borra no se deshace
//   aviso   la región `role="status"` donde se dice lo que ha pasado. Está SIEMPRE montada, también
//           cuando la lista se queda vacía, porque un aviso que aparece y desaparece no se anuncia
//
// Y LOS TRES GESTOS
//
//   abrir      aparece el paso donde estaba el botón de abrir. El foco va AL PASO: si se queda
//              donde estaba, se queda en un botón que ya no está en el árbol, y entonces vuelve al
//              principio de la página. Quien va con el teclado pulsa, no le pasa nada que pueda
//              notar, y se pierde.
//   cancelar   vuelve el botón de abrir. El foco va A ÉL: de ahí salió, y existe otra vez.
//   terminar   se ha confirmado. La fila entera puede haberse ido —el campo ya no está en la
//              lista, el apartado se ha borrado—, así que el foco va AL AVISO, que es lo único que
//              queda y además dice qué ha pasado.
//
// LO QUE ESTO EVITA es el fallo clásico: devolver el foco a un elemento que el repintado acaba de
// quitar del árbol. Por eso la decisión no es un destino fijo sino una lista de preferencia, y se
// elige el primero que EXISTE de verdad en la pantalla. Si no existe ninguno no se toca el foco:
// dejarlo donde está es mejor que mandarlo a un sitio cualquiera.
//
// Lógica pura: sin DOM, sin node, sin red. Vale como <script>, como `require` y como `import`.
// Cuelga de `global.Core.confirmar`.

(function (global) {
  'use strict';

  const GESTOS = ['abrir', 'cancelar', 'terminar'];
  const DESTINOS = ['abrir', 'paso', 'aviso'];

  // A dónde quiere ir el foco con cada gesto, por orden de preferencia. El primero es la razón del
  // gesto; los de detrás son por si ese elemento no está, que es justo el caso que rompía.
  const PREFERENCIA = {
    abrir: ['paso', 'aviso'],
    cancelar: ['abrir', 'aviso', 'paso'],
    terminar: ['aviso', 'abrir'],
  };

  // `hay` dice qué elementos existen en la pantalla ahora mismo: { abrir, paso, aviso }. Devuelve
  // el nombre del que recibe el foco, o null si no hay ninguno al que llevarlo.
  function foco(gesto, hay) {
    const orden = PREFERENCIA[gesto];
    if (!orden) return null;
    const existe = (nombre) => !!(hay && hay[nombre]);
    for (let i = 0; i < orden.length; i += 1) {
      if (existe(orden[i])) return orden[i];
    }
    return null;
  }

  const api = { GESTOS, DESTINOS, foco };

  global.Core = global.Core || {};
  global.Core.confirmar = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
