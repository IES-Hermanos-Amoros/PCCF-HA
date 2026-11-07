// Conciliar las instancias que trae el importador con el catálogo de unidades. LA REGLA, en un solo sitio.
//
// El importador identifica cada módulo por su título, y los títulos cambian de un curso a otro
// (ver core/unidades.js: entre 2025-26 y 2026-27 ya pasa tres veces). Esta función decide, para
// cada instancia del Word, de qué unidad del catálogo se trata y CÓMO lo ha sabido, para que la
// interfaz pueda distinguir «acierto exacto» de «lo he adivinado».
//
// Es la función de verdad que pide docs/plan.md §3. La red de seguridad de core/documento.js
// (idDeTitulo) solo se usa si nadie concilia, y es justo lo frágil que este módulo evita.
//
//   conciliar(instancias, { curso, ciclo?, catalogo? })  ->  { unidades, sinResolver }
//
//   instancias  [{ titulo, num, grupo }, ...]       lo que devuelve el importador
//   curso       obligatorio: el curso del documento que se importa ('2026-27')
//   ciclo       opcional: 'daw', 'smr'…; distingue módulos con el mismo título en dos
//               ciclos (la sostenibilidad de DAW y de SMR). La ruta de importación lo pasa siempre.
//   catalogo    opcional: un array de unidades con la forma de core/unidades.js.
//               Por defecto, el catálogo real. Sirve para probar con uno de mentira.
//
//   unidades     una entrada por instancia, EN EL MISMO ORDEN:
//                  { titulo, unidadId, como, confianza }
//                  unidadId null y como 'sin_resolver' cuando no se ha podido emparejar
//   sinResolver  las que no se han resuelto: { indice, titulo, motivo }
//
// CÓMO SE DECIDE: POR NIVELES DE CONFIANZA, NO POR ORDEN DE LLEGADA
//
// Hay cuatro pasadas, de la más fiable a la menos. Dentro de cada una se mira todo el documento
// antes de pasar a la siguiente:
//
//   1. titulo_del_curso      el título exacto que toca a ese curso        confianza: alta
//   2. titulo_de_otro_curso  el título exacto de otro curso del catálogo   confianza: alta
//   3. titulo_normalizado    sin tildes, mayúsculas ni puntuación          confianza: media
//   4. codigo_en_el_titulo   el código del módulo, como número completo   confianza: baja
//
// La regla es «gana el mejor acierto; si empatan, el primero del documento». Así un acierto exacto
// nunca pierde la unidad frente a uno flojo, aunque el flojo vaya antes en el documento (un anexo
// que cita un código de pasada no se lleva el módulo que se llama igual).
//
// REGLAS QUE NO SE NEGOCIAN
//
//   - Dentro de una pasada, si una instancia encaja con VARIAS unidades, no se elige: sale sin
//     resolver y no baja al nivel siguiente.
//   - Una instancia que ya tiene unidad no se vuelve a mirar. Una instancia cuyo acierto apunta a una
//     unidad que ya tiene otra (de una pasada anterior o de la misma) sale sin resolver: el motivo
//     dice quién la tiene y con qué acierto. No se busca otra unidad por debajo: sería adivinar.
//   - Dos instancias nunca reciben el mismo unidadId. Sin desempatar y sin inventar sufijos: el
//     repositorio rechaza dos unidades con el mismo id en un documento, y un `-2` dejaría dos módulos
//     compartiendo las asignaciones del curso siguiente.
//   - No se inventa ningún id. Lo que no se resuelve lo decide la ruta de importación (preguntar a
//     quien sube el documento, o caer en idDeTitulo de core/documento.js).
//   - Conciliar es solo leer: el catálogo no se modifica.
//
// LOS VALORES DE `como` SON CÓDIGOS ESTABLES (minúsculas, sin tildes) porque viajan por la API.
// La etiqueta en castellano para la interfaz está aparte, en ETIQUETAS_COMO.
//
// Lógica pura: sin DOM, sin node, sin red. Vale como <script> en el navegador, como `require` en
// las pruebas y como `import` desde Next. Igual que core/permisos.js, cuelga de `global.Core`.

(function (global) {
  'use strict';

  // El catálogo: en el navegador ya está cargado (core/unidades.js va antes); en node se pide.
  const catalogoPorDefecto = () => {
    if (global.Core && global.Core.unidades) return global.Core.unidades.UNIDADES;
    if (typeof require === 'function') return require('./unidades.js').UNIDADES;
    throw new Error('core/conciliar.js: no encuentro el catálogo; carga core/unidades.js antes');
  };

  // Códigos de `como`. Son lo que se guarda y lo que viaja por la API.
  const COMO = {
    tituloDelCurso: 'titulo_del_curso',
    tituloDeOtroCurso: 'titulo_de_otro_curso',
    tituloNormalizado: 'titulo_normalizado',
    codigoEnTitulo: 'codigo_en_el_titulo',
    sinResolver: 'sin_resolver',
  };

  // Etiquetas en castellano para la interfaz: un único sitio, para que nadie se invente la suya.
  const ETIQUETAS_COMO = {
    titulo_del_curso: 'título de ese curso',
    titulo_de_otro_curso: 'título de otro curso',
    titulo_normalizado: 'título normalizado',
    codigo_en_el_titulo: 'código encontrado en el título',
    sin_resolver: 'sin resolver',
  };

  // Sin tildes, sin mayúsculas, sin puntuación, espacios colapsados.
  const normalizar = (texto) => String(texto == null ? '' : texto)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

  // Las variantes de título de una unidad vistas desde un curso: la que toca ese curso (`propio`)
  // y las demás (`otros`). Sin `titulos[curso]`, el que toca es `titulo`.
  const titulosDe = (unidad, curso) => {
    const propio = (unidad.titulos && unidad.titulos[curso]) || unidad.titulo;
    const todos = [unidad.titulo, ...Object.values(unidad.titulos || {})];
    const otros = todos.filter((t, i) => t !== propio && todos.indexOf(t) === i);
    return { propio, otros };
  };

  // Un código casa solo si aparece como número completo: «0612» sí, «10612» no.
  // Con `codigo: null` no hay nada que buscar.
  const codigoEn = (titulo, unidad) => {
    if (!unidad.codigo) return false;
    return (String(titulo).match(/\d+/g) || []).includes(String(unidad.codigo));
  };

  // Las cuatro pasadas, en orden de fiabilidad. `cumple(titulo, unidad, curso)` dice si el título
  // de la instancia encaja con esa unidad en ese nivel.
  const PASADAS = [
    { como: COMO.tituloDelCurso, confianza: 'alta',
      cumple: (t, u, curso) => t === titulosDe(u, curso).propio },
    { como: COMO.tituloDeOtroCurso, confianza: 'alta',
      cumple: (t, u, curso) => titulosDe(u, curso).otros.includes(t) },
    { como: COMO.tituloNormalizado, confianza: 'media',
      cumple: (t, u, curso) => {
        const n = normalizar(t);
        const { propio, otros } = titulosDe(u, curso);
        return n !== '' && [propio, ...otros].some((x) => normalizar(x) === n);
      } },
    { como: COMO.codigoEnTitulo, confianza: 'baja',
      cumple: (t, u) => codigoEn(t, u) },
  ];

  function conciliar(instancias, opciones) {
    const o = opciones || {};
    if (!o.curso) throw new TypeError('conciliar: hace falta opciones.curso');
    if (!Array.isArray(instancias)) throw new TypeError('conciliar: instancias tiene que ser un array');

    const catalogo = o.catalogo || catalogoPorDefecto();
    // Con ciclo, solo se busca entre los módulos de ese ciclo (o de ese ámbito: 'eso', 'bach').
    const candidatas = catalogo.filter((u) => !o.ciclo || u.ciclo === o.ciclo || u.ambito === o.ciclo);

    const titulos = instancias.map((i) => (i && typeof i.titulo === 'string' && i.titulo.trim() !== '' ? i.titulo : null));
    const resultado = instancias.map(() => null); // { unidadId, como, confianza } | { motivo }
    const ocupadas = new Map(); // unidadId -> { indice, como }

    const etiqueta = (como) => ETIQUETAS_COMO[como];

    // Instancias sin título: fuera de todas las pasadas.
    titulos.forEach((t, i) => { if (t === null) resultado[i] = { motivo: 'la instancia no trae título' }; });

    for (const pasada of PASADAS) {
      instancias.forEach((_, i) => {
        if (resultado[i] !== null) return; // ya decidida en una pasada anterior, o sin título
        const titulo = titulos[i];
        const hallados = candidatas.filter((u) => pasada.cumple(titulo, u, o.curso));
        if (hallados.length === 0) return; // esta instancia sigue pendiente para la pasada siguiente

        if (hallados.length > 1) {
          const pista = o.ciclo ? '' : ': hace falta el ciclo para distinguirlos';
          resultado[i] = { motivo: `encaja con varios módulos del catálogo con el mismo acierto (${hallados.map((u) => u.id).join(', ')})${pista}` };
          return;
        }

        const id = hallados[0].id;
        if (ocupadas.has(id)) {
          const quien = ocupadas.get(id);
          resultado[i] = { motivo: `la unidad «${id}» ya se la ha quedado la instancia «${titulos[quien.indice]}» por ${etiqueta(quien.como)}, que es un acierto mejor` };
          return;
        }
        ocupadas.set(id, { indice: i, como: pasada.como });
        resultado[i] = { unidadId: id, como: pasada.como, confianza: pasada.confianza };
      });
    }

    const unidades = [];
    const sinResolver = [];
    instancias.forEach((_, indice) => {
      const r = resultado[indice];
      const titulo = titulos[indice];
      if (r && r.unidadId) {
        unidades.push({ titulo, unidadId: r.unidadId, como: r.como, confianza: r.confianza });
        return;
      }
      const motivo = (r && r.motivo) || 'ningún módulo del catálogo tiene ese título ni ese código';
      unidades.push({ titulo, unidadId: null, como: COMO.sinResolver, confianza: null });
      sinResolver.push({ indice, titulo, motivo });
    });

    return { unidades, sinResolver };
  }

  const api = { conciliar, normalizar, COMO, ETIQUETAS_COMO };

  global.Core = global.Core || {};
  global.Core.conciliar = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
