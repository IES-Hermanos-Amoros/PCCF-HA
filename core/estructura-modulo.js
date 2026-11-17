// LA ESTRUCTURA PROPIA DE UN MÓDULO: lo que un módulo cambia de los campos de la plantilla común sin
// cambiárselo a los otros diez, y la regla que decide qué estructura sigue cada módulo.
//
// La plantilla de un documento define sus 21 apartados de módulo UNA sola vez y los comparten los
// once módulos (core/plantilla.js, «UN APARTADO DE MÓDULO ES DE LA PLANTILLA»). Así, si un docente
// añadiera una casilla a «su» módulo, se la añadiría a los once. El departamento ha decidido que
// cada docente edita libre la estructura de SU módulo y no toca la común; para eso un módulo tiene
// que poder llevar estructura propia. Este fichero es el sitio donde vive su forma y la regla que la
// aplica. Las operaciones para cambiarla —añadir un campo, renombrarlo, moverlo, retirarlo— no están
// aquí todavía.
//
// LO QUE GUARDA LA UNIDAD, Y SOLO LO QUE SE DESVÍA
//
//   unidad.estructura = {
//     secciones: {
//       'modulos/.../idDeApartado': {          el id del apartado, entero
//         campos:   { idDeCampo: { etiqueta?, retirado? } },   cambios a campos de la plantilla común
//         anadidos: [ { id, tipo, etiqueta, retirado?, ... } ], campos que solo existen en este módulo
//         orden:    [ idDeCampo, ... ],                         el orden en que se pintan
//       },
//     },
//   }
//
// NO ES UNA COPIA DE LA PLANTILLA, por lo mismo que `valor.estructura` de una tabla no es una copia
// de su modelo: una copia congelaría el módulo en la plantilla de cuando se hizo, y cada campo que
// la jefatura añadiera después a lo común dejaría de llegarle sin que nadie lo notara. Guardando solo
// el desvío, un apartado que el módulo no ha tocado ni aparece, y un campo nuevo de lo común le llega
// aunque el módulo ya tenga estructura propia (al final, porque `orden` no lo conocía).
//
// Cada desvío es un cambio por separado y no una lista entera, para que se pueda decir qué ha
// cambiado el módulo y no solo cómo ha quedado: renombrar es una etiqueta, retirar es un booleano,
// añadir es un campo, mover es una lista de ids.
//
// EL ID NO ES EL NOMBRE, y el contenido va por id. El contenido de un campo se guarda por el id del
// campo en el par (apartado, unidad), así que renombrar no mueve nada. Los campos añadidos por un
// módulo se acuñan UNA VEZ con el prefijo `m_` (`idDeCampoPropio`): los ids de la plantilla común
// se deducen de un nombre y nunca llevan guion bajo, así que un campo del módulo no puede chocar con
// uno común ni hoy ni cuando la jefatura añada uno mañana. Sin el prefijo, un campo común nuevo que
// se llamara igual que uno propio compartiría su contenido con él.
//
// RETIRAR NO BORRA, igual que retirar un apartado o un campo (core/plantilla.js) o la parte de una
// tabla (core/modelos-tabla.js): el campo se queda con `retirado: true`, deja de pintarse y de
// imprimirse, y su contenido sigue guardado bajo su id. Un campo común se retira con
// `campos[id].retirado`; uno añadido por el módulo, en el propio campo.
//
// LO COMÚN MANDA SOBRE LO RETIRADO. Si la plantilla común retira un campo, deja de salir en todos los
// módulos aunque alguno no lo haya retirado: la estructura propia se desvía de lo común para añadir,
// renombrar, mover y retirar, no para resucitar lo que la jefatura ha quitado.
//
// ================================================================ LOS APARTADOS ENTEROS
//
// Lo de arriba cubre los campos DENTRO de un apartado. El departamento ha pedido además poder
// eliminar un apartado entero en un módulo solo, y con él renombrarlo, moverlo y añadir uno propio.
// Se guarda al lado de `secciones`, con las mismas decisiones y por las mismas razones:
//
//   unidad.estructura = {
//     secciones:  { ... },                                   los campos, arriba
//     apartados: {
//       cambios:  { 'modulos/.../id': { titulo?, retirado? } },  cambios a apartados de la plantilla común
//       anadidos: [ { id, titulo, padre, campos, retirado? } ],  apartados que solo existen en este módulo
//       orden:    { idDelPadre: [ idDeApartado, ... ] },         el orden de los hijos de cada padre
//     },
//   }
//
// - SOLO EL DESVÍO. Un apartado nuevo que la jefatura añada a lo común le llega al módulo que ya
//   diverge, al final de sus hermanos (`orden` no lo conocía).
// - EL ID NO SIGUE AL NOMBRE. El contenido de un apartado se guarda por (apartado, unidad): renombrar
//   no mueve ni una fila. Un apartado propio se acuña una vez con el último tramo de su id con el
//   prefijo `m_` (`idDeApartadoPropio`), y los comunes salen de un título y nunca llevan guion bajo,
//   así que el de un módulo no puede chocar con uno común ni hoy ni cuando la jefatura añada otro.
// - LO COMÚN MANDA SOBRE LO RETIRADO: lo que la plantilla común retira, un módulo ni lo resucita ni
//   lo cambia. Retirar en el módulo es `cambios[id].retirado`; restaurar es quitar esa marca.
//
// UN APARTADO CON HIJOS SE RETIRA CON SUS HIJOS. Es el criterio de la plantilla común
// (core/plantilla.js → `retirar`, que cuenta `conHijos`, y `restaurar`, que se niega a devolver un
// hijo mientras su padre siga retirado): si los hijos se quedaran sin su padre, el PDF los
// imprimiría colgando del apartado de más arriba. Por eso:
//   · retirar el padre NO escribe nada en los hijos: se ocultan por estar bajo un retirado
//     (`apartadosDeModulo` no los pinta), y su contenido y su propia marca se conservan;
//   · restaurar el padre vuelve a mostrar a los hijos que no se retiraron por separado;
//   · un hijo retirado por separado sigue retirado cuando se restaura el padre.
// La puerta no se queja de un hijo marcado bajo un padre retirado: es un estado que retirar en el
// orden «el hijo, luego el padre» produce, y retirar no borra.
//
// Un apartado de fichas (`repetidor`) sí se puede retirar, renombrar y mover como apartado; lo que
// la puerta niega, como con los campos, es cambiarle los campos de dentro.
//
// Los campos de un apartado propio van en el propio apartado (`campos`, con ids `m_`), no en
// `secciones`: ya son del módulo entero, no hay nada común de lo que desviarse.
//
// ==================================================================== LA REGLA
//
// Es la misma que la de una tabla que ha divergido de su modelo (`estructuraDeTabla` de
// core/modelos-tabla.js) y la que decide entre `filas` y `pares` en `queSeImprime`
// (core/estructurados.js): lo que alguien tiene delante manda sobre lo que diga el grupo.
//
//     UN MÓDULO SIGUE SU PROPIA ESTRUCTURA MIENTRAS LA TENGA, Y LA COMÚN CUANDO NO LA TENGA.
//
// Y TENERLA ES TENER ALGÚN DESVÍO, igual que tener estructura una tabla es tener partes: una
// `estructura` sin apartados, o con un apartado sin desvíos, no es una estructura, y el módulo cae a
// la común. Se pregunta apartado a apartado: un módulo con estructura propia en uno de sus apartados
// sigue la común en los otros veinte.
//
// Por lo mismo que con la tabla, la jefatura puede seguir cambiando lo común sin reescribir por la
// espalda a quien ya ha divergido, y sin tocar nada de quien no lo ha hecho: un módulo sin
// `estructura` recibe de `camposDeSeccion` LA MISMA lista de campos que la plantilla, sin copiar
// nada, así que el documento sale byte a byte como antes. Es la puerta de aceptación de esta pieza.
//
// Y LA REGLA ESTÁ ESCRITA UNA SOLA VEZ: en `camposDeSeccion` para los campos de un apartado y en su
// hermana `apartadosDeModulo` para los apartados de un módulo, con el mismo patrón y el mismo
// `{ origen: 'propia'|'comun', ... }`. Las tienen que llamar quien pinta el apartado, quien lo
// imprime, quien lo guarda y quien lo exporta; escrita en cada uno, la pantalla acabaría pintando
// unos apartados distintos de los que salen en el papel.
//
// QUIÉN PUEDE CAMBIARLA no se decide aquí sino en core/permisos.js (`reglaEstructuraPropia`). Lo que
// sí decide la puerta es QUÉ se puede cambiar: solo apartados de módulo (`edita:
// 'docentes_del_modulo'`). Un desvío sobre un apartado común es el módulo cambiando lo que es de la
// jefatura, y la puerta lo rechaza aunque quien lo pida tenga permiso para otra cosa.
//
// Lógica pura: sin DOM, sin red, sin node. Vale como <script> en el mockup, como `require` en las
// pruebas y en las rutas, y como `import` desde Next. Cuelga de `global.Core.estructuraModulo`,
// igual que los demás módulos de core/.

(function (global) {
  'use strict';

  // Las dependencias se resuelven al usarlas y con la ruta LITERAL en cada rama: un
  // `require(variable)` corta el `npm run build` con «Can't resolve <dynamic>».
  function deCore(nombre) {
    if (global.Core && global.Core[nombre]) return global.Core[nombre];
    if (typeof require === 'function') {
      if (nombre === 'campos') return require('./campos.js');
      if (nombre === 'permisos') return require('./permisos.js');
      if (nombre === 'plantilla') return require('./plantilla.js');
      if (nombre === 'sa') return require('./sa.js');
    }
    throw new Error('core/estructura-modulo.js necesita core/' + nombre + '.js');
  }
  const Campos = () => deCore('campos');
  const Permisos = () => deCore('permisos');
  const Plantilla = () => deCore('plantilla');
  const Sa = () => deCore('sa');

  // La clave de la unidad bajo la que se guarda. Dicha una vez.
  const CLAVE = 'estructura';

  // Cuántos campos caben en un apartado: el de la plantilla (`MAX_CAMPOS` de core/plantilla.js), que
  // cuenta los vigentes. Está escrito aquí y no importado para poder medirlo sin cargar la plantilla
  // entera, y test/estructura-modulo.js comprueba que las copias no se separan.
  const MAX_CAMPOS = 20;
  // Cuántos apartados puede desviar un módulo. Hoy son 21 los de módulo; el tope no está para
  // recortar nada sino para que el objeto no crezca sin límite, como `MAX_MODELOS`.
  const MAX_SECCIONES = 50;
  // Cuántos apartados propios puede añadir un módulo. Tope para que el objeto no crezca sin límite;
  // los apartados comunes no tienen ninguno.
  const MAX_APARTADOS_PROPIOS = 20;
  // Lo mismo que `LARGO_ETIQUETA` de core/campos.js, y por lo mismo: una etiqueta es una etiqueta.
  const LARGO_ETIQUETA = 100;

  // El prefijo de los ids de campo acuñados por un módulo (ver la cabecera).
  const PREFIJO = 'm_';
  // Lo que un campo no puede llamarse porque el contenido de un apartado repetidor lo usa
  // (RESERVADOS de core/plantilla.js).
  const RESERVADOS = ['items'];

  const CLAVES_ESTRUCTURA = ['secciones', 'apartados'];
  const CLAVES_APARTADOS = ['cambios', 'anadidos', 'orden'];
  const CLAVES_CAMBIO_APARTADO = ['titulo', 'retirado'];
  const CLAVES_APARTADO_PROPIO = ['id', 'titulo', 'padre', 'campos', 'retirado'];
  const CLAVES_DESVIO = ['campos', 'anadidos', 'orden'];
  const CLAVES_CAMBIO = ['etiqueta', 'retirado'];
  const CLAVES_ANADIDO = ['id', 'tipo', 'etiqueta', 'columnas', 'inicial', 'retirado'];

  const esObjeto = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
  const esCadena = (x) => typeof x === 'string' && !!x.trim();
  const sobran = (objeto, permitidas) => Object.keys(objeto).filter((k) => permitidas.indexOf(k) < 0);
  const comillas = (claves) => claves.map((k) => '«' + k + '»').join(', ');
  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
  const retirado = (x) => !!x && !!x.retirado;
  const camposDe = (seccion) => (esObjeto(seccion) && Array.isArray(seccion.campos) ? seccion.campos : []);
  const tiene = (objeto, clave) => Object.prototype.hasOwnProperty.call(objeto, clave);
// «de» + el sitio donde se dice algo, contrayendo: «de el apartado» se lee «del apartado».
const de = (donde) => (String(donde).startsWith('el ') ? 'del ' + String(donde).slice(3) : 'de ' + donde);

  // ---------------------------------------------------------------- leer los desvíos

  // El desvío de un apartado, o null si no desvía nada. Un desvío que no cambia nada —`campos: {}`,
  // `anadidos: []`, `orden: []`— no es un desvío (ver «TENERLA ES TENER ALGÚN DESVÍO»).
  function desvioDe(unidad, idSeccion) {
    const e = esObjeto(unidad) ? unidad[CLAVE] : null;
    const d = esObjeto(e) && esObjeto(e.secciones) && esCadena(idSeccion) && tiene(e.secciones, idSeccion)
      ? e.secciones[idSeccion] : null;
    if (!esObjeto(d)) return null;
    const campos = esObjeto(d.campos) && Object.keys(d.campos).length;
    const anadidos = Array.isArray(d.anadidos) && d.anadidos.length;
    const orden = Array.isArray(d.orden) && d.orden.length;
    return campos || anadidos || orden ? d : null;
  }

  // LA ESTRUCTURA PROPIA DE UN MÓDULO, o null si no tiene ninguna: `{ secciones }` con solo los
  // apartados que de verdad desvía. Es la pregunta de «¿tiene estructura propia?» a secas; la de qué
  // campos lleva un apartado concreto la contesta `camposDeSeccion`.
  function estructuraDeModulo(unidad) {
    const e = esObjeto(unidad) ? unidad[CLAVE] : null;
    if (!esObjeto(e)) return null;
    const secciones = {};
    if (esObjeto(e.secciones)) {
      for (const id of Object.keys(e.secciones)) {
        if (desvioDe(unidad, id)) secciones[id] = e.secciones[id];
      }
    }
    const apartados = desvioDeApartados(unidad);
    if (!Object.keys(secciones).length && !apartados) return null;
    return apartados ? { secciones, apartados } : { secciones };
  }

  // El desvío de los APARTADOS del módulo, o null si no desvía nada. Como `desvioDe`: `cambios: {}`,
  // `anadidos: []` o un `orden` de listas vacías no son un desvío.
  function desvioDeApartados(unidad) {
    const e = esObjeto(unidad) ? unidad[CLAVE] : null;
    const d = esObjeto(e) && esObjeto(e.apartados) ? e.apartados : null;
    if (!d) return null;
    const cambios = esObjeto(d.cambios) && Object.keys(d.cambios).length;
    const anadidos = Array.isArray(d.anadidos) && d.anadidos.length;
    const orden = esObjeto(d.orden) && Object.keys(d.orden).some((k) => Array.isArray(d.orden[k]) && d.orden[k].length);
    return cambios || anadidos || orden ? d : null;
  }

  // ---------------------------------------------------------------- la regla

  // LA REGLA, Y EL ÚNICO SITIO DONDE ESTÁ ESCRITA. Qué campos lleva este apartado en este módulo:
  //
  //   { origen: 'comun' }    los de la plantilla, tal cual: el módulo no desvía este apartado
  //   { origen: 'propia' }   los de la plantilla con los cambios del módulo aplicados
  //
  // `seccion` es el apartado de la plantilla, con sus `campos`; `unidad` es la fila del módulo, que
  // puede no traer estructura (todas las de hoy). `campos` son todos, con los retirados dentro —su
  // contenido sigue guardado— y `vigentes` los que se pintan y se imprimen. Cada campo propio del
  // módulo lleva además `propio: true`, para poder decirle a quien edita cuáles son suyos.
  //
  // Sin estructura propia devuelve las MISMAS referencias que recibe, sin copiar nada.
  function camposDeSeccion(seccion, unidad) {
    const comunes = camposDe(seccion);
    const desvio = desvioDe(unidad, esObjeto(seccion) ? seccion.id : undefined);
    if (!desvio) {
      return { origen: 'comun', campos: comunes, vigentes: comunes.filter((c) => !retirado(c)) };
    }
    const cambios = esObjeto(desvio.campos) ? desvio.campos : {};
    const resueltos = comunes.filter(esObjeto).map((c) => {
      const cambio = esObjeto(cambios[c.id]) ? cambios[c.id] : null;
      if (!cambio) return c;
      const copia = { ...c };
      if (esCadena(cambio.etiqueta)) copia.etiqueta = cambio.etiqueta;
      // Lo retirado en lo común no lo resucita el módulo.
      if (cambio.retirado === true) copia.retirado = true;
      return copia;
    });
    const vistos = new Set(resueltos.map((c) => c.id).concat(RESERVADOS));
    for (const a of Array.isArray(desvio.anadidos) ? desvio.anadidos : []) {
      // Un añadido que choca con un id ya puesto no se pinta: la puerta no deja guardarlo, así que
      // solo pasa con un dato escrito a mano, y dos campos con el mismo id compartirían contenido.
      if (!esObjeto(a) || !esCadena(a.id) || vistos.has(a.id)) continue;
      vistos.add(a.id);
      resueltos.push({ ...a, propio: true });
    }
    const orden = Array.isArray(desvio.orden) ? desvio.orden : [];
    const lugar = (c) => {
      const i = orden.indexOf(c.id);
      return i < 0 ? orden.length : i;
    };
    // Estable: lo que `orden` no nombra conserva su sitio relativo, detrás de lo que sí nombra.
    const campos = resueltos.map((c, i) => ({ c, i }))
      .sort((a, b) => (lugar(a.c) - lugar(b.c)) || (a.i - b.i))
      .map((x) => x.c);
    return { origen: 'propia', campos, vigentes: campos.filter((c) => !retirado(c)) };
  }

  // ------------------------------------------------ la regla, para los apartados enteros

  const hijosDe = (sec) => (esObjeto(sec) && Array.isArray(sec.hijos) ? sec.hijos : []);

  // El bloque que reparte las instancias entre los módulos (`instancias: true`): sus hijos son los
  // apartados de módulo. Es el mismo convenio que `buscar` de core/plantilla.js. Null si el documento
  // no tiene módulos (propuestas pedagógicas, memoria).
  function bloqueDeUnidades(plantilla) {
    let hallado = null;
    (function bajar(lista) {
      for (const s of lista) {
        if (hallado || !esObjeto(s)) continue;
        if (s.instancias === true) { hallado = s; return; }
        bajar(hijosDe(s));
      }
    })(plantilla && Array.isArray(plantilla.secciones) ? plantilla.secciones : []);
    return hallado;
  }

  // La lista sin los apartados retirados ni sus subárboles (el criterio de `vigente` de
  // core/plantilla.js). Si no hay ninguno devuelve LA MISMA lista, sin copiar.
  function sinRetirados(lista) {
    let cambia = false;
    const fuera = [];
    for (const s of lista) {
      if (!esObjeto(s)) { fuera.push(s); continue; }
      if (s.retirado) { cambia = true; continue; }
      const antes = hijosDe(s);
      const despues = sinRetirados(antes);
      if (despues !== antes) { cambia = true; fuera.push({ ...s, hijos: despues }); } else fuera.push(s);
    }
    return cambia ? fuera : lista;
  }

  // LA REGLA PARA LOS APARTADOS, hermana de `camposDeSeccion`: qué apartados lleva este módulo.
  //
  //   { origen: 'comun' }    los de la plantilla, tal cual: el módulo no desvía ninguno
  //   { origen: 'propia' }   los de la plantilla con los cambios del módulo aplicados
  //
  // `plantilla` es la del documento y `unidad` la fila del módulo. `secciones` son los apartados
  // directos del bloque de módulos, con los retirados dentro —su contenido sigue guardado— y
  // `vigentes` los que se pintan y se imprimen: sin los retirados ni lo que cuelga de ellos. Cada nodo
  // resuelto lleva sus `hijos` resueltos; los añadidos por el módulo llevan además `propio: true`.
  // `bloque` es el id del bloque, que es el «padre» de los apartados de primer nivel en `orden`.
  //
  // Sin estructura propia en los apartados devuelve las MISMAS referencias de la plantilla, sin
  // copiar nada. Un documento sin módulos devuelve listas vacías. Los campos de cada apartado
  // resuelto se piden después a `camposDeSeccion`, que es la otra mitad de la misma regla.
  function apartadosDeModulo(plantilla, unidad) {
    const bloque = bloqueDeUnidades(plantilla);
    if (!bloque) return { origen: 'comun', bloque: null, secciones: [], vigentes: [] };
    const comunes = hijosDe(bloque);
    const desvio = desvioDeApartados(unidad);
    if (!desvio) return { origen: 'comun', bloque: bloque.id, secciones: comunes, vigentes: sinRetirados(comunes) };

    const ctx = {
      cambios: esObjeto(desvio.cambios) ? desvio.cambios : {},
      orden: esObjeto(desvio.orden) ? desvio.orden : {},
      anadidos: (Array.isArray(desvio.anadidos) ? desvio.anadidos : []).filter((a) => esObjeto(a) && esCadena(a.id)),
      vistos: new Set(),
    };
    // Los ids de lo común se reservan antes de colocar nada: un añadido que choca no se pinta.
    (function reservar(lista) {
      for (const s of lista) {
        if (!esObjeto(s)) continue;
        ctx.vistos.add(s.id);
        reservar(hijosDe(s));
      }
    })(comunes);
    const secciones = resolverHijos(bloque.id, comunes, ctx, Number.isInteger(bloque.nivel) ? bloque.nivel + 1 : 1);
    return { origen: 'propia', bloque: bloque.id, secciones, vigentes: sinRetirados(secciones) };
  }

  // Los hijos de un padre: los comunes con sus cambios, los añadidos que cuelgan de él, y el orden.
  function resolverHijos(idPadre, hijos, ctx, nivelPorDefecto) {
    const resueltos = hijos.filter(esObjeto).map((h) => resolverComun(h, ctx));
    const deHermano = resueltos.map((s) => s.nivel).find((n) => Number.isInteger(n));
    const nivel = Number.isInteger(deHermano) ? deHermano : nivelPorDefecto;
    for (const a of ctx.anadidos) {
      // Un añadido que choca con un id ya puesto no se pinta: la puerta no deja guardarlo, así que
      // solo pasa con un dato escrito a mano, y dos apartados con el mismo id compartirían contenido.
      if (a.padre !== idPadre || ctx.vistos.has(a.id)) continue;
      ctx.vistos.add(a.id);
      const nodo = {
        id: a.id, titulo: a.titulo, nivel, campos: Array.isArray(a.campos) ? a.campos : [], propio: true,
      };
      if (a.retirado === true) nodo.retirado = true;
      nodo.hijos = resolverHijos(a.id, [], ctx, nivel + 1);
      resueltos.push(nodo);
    }
    const orden = Array.isArray(ctx.orden[idPadre]) ? ctx.orden[idPadre] : [];
    const lugar = (s) => {
      const i = orden.indexOf(s.id);
      return i < 0 ? orden.length : i;
    };
    // Estable, como en los campos: lo que `orden` no nombra va detrás, en su orden.
    const ordenados = resueltos.map((s, i) => ({ s, i }))
      .sort((a, b) => (lugar(a.s) - lugar(b.s)) || (a.i - b.i))
      .map((x) => x.s);
    const iguales = ordenados.length === hijos.length && ordenados.every((s, i) => s === hijos[i]);
    return iguales ? hijos : ordenados;
  }

  function resolverComun(h, ctx) {
    const cambio = tiene(ctx.cambios, h.id) && esObjeto(ctx.cambios[h.id]) ? ctx.cambios[h.id] : null;
    const antes = hijosDe(h);
    const hijos = resolverHijos(h.id, antes, ctx, Number.isInteger(h.nivel) ? h.nivel + 1 : 1);
    if (!cambio && hijos === antes) return h;
    const copia = { ...h, hijos };
    if (cambio && esCadena(cambio.titulo)) copia.titulo = cambio.titulo;
    // Lo retirado en lo común no lo resucita el módulo.
    if (cambio && cambio.retirado === true) copia.retirado = true;
    return copia;
  }

  // El id con el que nace un apartado del módulo: el de su padre, una barra y el título hecho slug
  // con el prefijo `m_` (`slug` de core/plantilla.js, el mismo con el que se deducen los comunes).
  // `ocupados` son los ids que el documento ya tiene en el módulo —comunes y añadidos, TAMBIÉN los
  // retirados—: nunca se reutiliza uno, porque el contenido se guarda por él.
  function idDeApartadoPropio(titulo, padre, ocupados) {
    const lista = Array.isArray(ocupados) ? ocupados : [];
    const base = PREFIJO + Plantilla().slug(titulo);
    const idDe = (local) => (padre ? `${padre}/${local}` : local);
    let local = base;
    for (let n = 2; lista.indexOf(idDe(local)) >= 0; n += 1) local = `${base}-${n}`;
    return idDe(local);
  }

  // El id con el que nace un campo del módulo: el que `Campos.idDeCampo` daría, con el prefijo que
  // lo separa para siempre de los comunes. `ocupados` son los ids que el apartado ya tiene entre sus
  // campos comunes y sus añadidos, TAMBIÉN los retirados: nunca se reutiliza uno.
  function idDeCampoPropio(etiqueta, tipo, ocupados) {
    const lista = Array.isArray(ocupados) ? ocupados : [];
    const base = Campos().idDeCampo(etiqueta, String(tipo || 'campo'), []);
    let id = PREFIJO + base;
    for (let n = 2; lista.indexOf(id) >= 0; n += 1) id = PREFIJO + base + '-' + n;
    return id;
  }

  // ---------------------------------------------------------------- la puerta

  // POR QUÉ UN CAMPO AÑADIDO POR EL MÓDULO NO VALE.
  function motivoDeCampoPropio(campo, donde) {
    if (!esObjeto(campo)) return `${donde} no es un campo { id, tipo, etiqueta }.`;
    const extra = sobran(campo, CLAVES_ANADIDO);
    if (extra.length) return `${donde} lleva ${comillas(extra)}, que no existe en un campo: solo ${comillas(CLAVES_ANADIDO)}.`;
    if (!esCadena(campo.id)) return `${donde} no tiene «id»: es con el que se guarda lo que se escribe en él y no cambia nunca.`;
    if (!campo.id.startsWith(PREFIJO)) {
      return `el id ${de(donde)}, «${campo.id}», no empieza por «${PREFIJO}»: los campos de un módulo se distinguen así de los de la plantilla común, para que uno de lo común añadido mañana no comparta el contenido de este.`;
    }
    if (!Campos().esCreable(campo.tipo)) {
      return `${donde} es de tipo «${campo.tipo}», que no es un tipo de campo que se pueda crear: ${Campos().nombresDeTipos().join(', ')}.`;
    }
    if (!esCadena(campo.etiqueta)) return `${donde} no tiene «etiqueta»: es lo que se pinta del campo.`;
    if (campo.etiqueta.length > LARGO_ETIQUETA) {
      return `la etiqueta ${de(donde)} tiene ${campo.etiqueta.length} caracteres: el máximo son ${LARGO_ETIQUETA}.`;
    }
    if (campo.retirado !== undefined && typeof campo.retirado !== 'boolean') return `«retirado» ${de(donde)} tiene que ser verdadero o falso.`;
    if (campo.inicial !== undefined && !esObjeto(campo.inicial)) return `«inicial» ${de(donde)} no es un objeto.`;
    return null;
  }

  // POR QUÉ LOS CAMBIOS A LOS CAMPOS COMUNES DE UN APARTADO NO VALEN. `comunes` son los campos del
  // apartado en la plantilla, o null si no se tiene delante.
  function motivoDeCambios(cambios, donde, comunes) {
    if (!esObjeto(cambios)) return `los «campos» ${donde} no son un objeto { idDeCampo: { etiqueta, retirado } }.`;
    for (const id of Object.keys(cambios)) {
      const cambio = cambios[id];
      const suyo = `el cambio al campo «${id}» ${donde}`;
      if (!esObjeto(cambio)) return `${suyo} no es un objeto { etiqueta, retirado }.`;
      const extra = sobran(cambio, CLAVES_CAMBIO);
      if (extra.length) return `${suyo} lleva ${comillas(extra)}: un módulo solo puede renombrar o retirar un campo común (${comillas(CLAVES_CAMBIO)}), no cambiarle más.`;
      if (!Object.keys(cambio).length) return `${suyo} no cambia nada: si el módulo no toca el campo, no tiene que aparecer.`;
      if (cambio.etiqueta !== undefined) {
        if (!esCadena(cambio.etiqueta)) return `${suyo} le pone una etiqueta vacía: lo que se pinta del campo tiene que ser un texto.`;
        if (cambio.etiqueta.length > LARGO_ETIQUETA) {
          return `${suyo} le pone una etiqueta de ${cambio.etiqueta.length} caracteres: el máximo son ${LARGO_ETIQUETA}.`;
        }
      }
      if (cambio.retirado !== undefined && typeof cambio.retirado !== 'boolean') return `«retirado» de ${suyo} tiene que ser verdadero o falso.`;
      if (comunes && !comunes.some((c) => esObjeto(c) && c.id === id)) {
        return `${suyo}: el apartado no tiene ningún campo común «${id}». Los campos que el módulo ha añadido se cambian en «anadidos», no aquí.`;
      }
    }
    return null;
  }

  // DOS CAMPOS DE UN APARTADO NO PUEDEN LLAMARSE IGUAL. Se compara con el mismo `norm` con el que se
  // leen los títulos de un Word (core/sa.js), no con una comparación parecida: «Objetivos» y
  // «OBJETIVOS » (sin mayúsculas, sin tildes, con los espacios juntados) son el mismo nombre. Cuentan los vigentes: uno retirado
  // no se ve, y poder reutilizar su nombre es justo lo que permite retirar uno para poner otro.
  function choqueDeEtiquetas(vigentes) {
    const norm = Sa().norm;
    const vistas = new Map();
    for (const c of Array.isArray(vigentes) ? vigentes : []) {
      if (!esObjeto(c)) continue;
      const clave = norm(c.etiqueta == null ? '' : c.etiqueta);
      if (!clave) continue;
      if (vistas.has(clave)) return { etiqueta: String(c.etiqueta), dueno: String(vistas.get(clave).etiqueta) };
      vistas.set(clave, c);
    }
    return null;
  }

  // POR QUÉ EL DESVÍO DE UN APARTADO NO VALE. `seccion` es el apartado de la plantilla si se tiene
  // delante (con él se comprueba contra lo común), o null para medir solo la forma.
  function motivoDeDesvio(desvio, id, seccion) {
    const donde = `de «${id}»`;
    if (!esObjeto(desvio)) return `el desvío ${donde} no es un objeto { campos, anadidos, orden }.`;
    const extra = sobran(desvio, CLAVES_DESVIO);
    if (extra.length) return `el desvío ${donde} lleva ${comillas(extra)}, que no existe: solo ${comillas(CLAVES_DESVIO)}.`;
    // La forma de cada parte se mira ANTES de preguntar si cambia algo: `desvioDe` no ve lo que está
    // mal formado, y un `anadidos: 'x'` se daría por «no cambia nada» en lugar de por lo que es.
    if (desvio.campos !== undefined && !esObjeto(desvio.campos)) {
      return `los «campos» ${donde} no son un objeto { idDeCampo: { etiqueta, retirado } }.`;
    }
    if (desvio.anadidos !== undefined && !Array.isArray(desvio.anadidos)) return `los «anadidos» ${donde} no son una lista.`;
    if (desvio.orden !== undefined && !Array.isArray(desvio.orden)) return `el «orden» ${donde} no es una lista de ids de campo.`;
    const solo = { [CLAVE]: { secciones: { [id]: desvio } } };
    if (!desvioDe(solo, id)) {
      return `el desvío ${donde} no cambia nada: un módulo solo guarda los apartados que cambia, y el resto sigue la plantilla común.`;
    }
    const comunes = seccion ? camposDe(seccion) : null;

    if (desvio.campos !== undefined) {
      const m = motivoDeCambios(desvio.campos, donde, comunes);
      if (m) return m;
    }

    const ids = new Set(comunes ? comunes.filter(esObjeto).map((c) => c.id).concat(RESERVADOS) : RESERVADOS);
    if (desvio.anadidos !== undefined) {
      if (!Array.isArray(desvio.anadidos)) return `los «anadidos» ${donde} no son una lista.`;
      const propios = desvio.anadidos;
      if (propios.length > MAX_CAMPOS) {
        return `el módulo añade ${plural(propios.length, 'campo', 'campos')} ${donde}: el máximo son ${MAX_CAMPOS}.`;
      }
      for (let i = 0; i < propios.length; i += 1) {
        const suyo = `el campo añadido ${i + 1} ${donde}`;
        const m = motivoDeCampoPropio(propios[i], suyo);
        if (m) return m;
        if (ids.has(propios[i].id)) {
          return `${suyo} se llama «${propios[i].id}», igual que otro campo del apartado: el id de un campo no se reutiliza ni siquiera si el otro está retirado, porque el contenido se guarda por él.`;
        }
        ids.add(propios[i].id);
      }
    }

    if (desvio.orden !== undefined) {
      if (!Array.isArray(desvio.orden)) return `el «orden» ${donde} no es una lista de ids de campo.`;
      const vistos = new Set();
      for (const idCampo of desvio.orden) {
        if (!esCadena(idCampo)) return `el «orden» ${donde} lleva algo que no es un id de campo.`;
        if (vistos.has(idCampo)) return `el «orden» ${donde} nombra dos veces el campo «${idCampo}»: un campo solo está en un sitio.`;
        vistos.add(idCampo);
        if (seccion && !ids.has(idCampo)) {
          return `el «orden» ${donde} nombra el campo «${idCampo}», que el apartado no tiene.`;
        }
      }
    }

    // Lo que quedaría en pantalla. Con la plantilla delante son los campos comunes cambiados más los
    // añadidos; sin ella, solo se puede mirar lo que el desvío trae.
    const vigentes = seccion
      ? camposDeSeccion(seccion, solo).vigentes
      : (Array.isArray(desvio.anadidos) ? desvio.anadidos.filter((c) => !retirado(c)) : []);
    if (vigentes.length > MAX_CAMPOS) {
      return `con los cambios del módulo, el apartado ${donde} tendría ${vigentes.length} campos: el máximo son ${MAX_CAMPOS}.`;
    }
    const choque = choqueDeEtiquetas(vigentes);
    if (choque) {
      return `dos campos del apartado ${donde} se llaman «${choque.etiqueta}»${choque.etiqueta === choque.dueno ? '' : ` y «${choque.dueno}»`}: en la pantalla y en el papel no se distinguirían. Cambia el nombre de uno, o retira el que sobre.`;
    }
    return null;
  }

  // ------------------------------------------------ la puerta, para los apartados enteros

  // Los apartados de módulo de la plantilla común, por id: de quién cuelgan y si están retirados en
  // lo común (ellos mismos o alguno de sus antepasados, incluido el bloque).
  function mapaDeComunes(plantilla) {
    const bloque = bloqueDeUnidades(plantilla);
    const mapa = new Map();
    if (!bloque) return { bloque: null, mapa };
    (function bajar(lista, padre, oculto) {
      for (const s of lista) {
        if (!esObjeto(s)) continue;
        mapa.set(s.id, { seccion: s, padre, retirado: !!s.retirado || oculto });
        bajar(hijosDe(s), s.id, oculto || !!s.retirado);
      }
    })(hijosDe(bloque), bloque.id, !!bloque.retirado);
    return { bloque, mapa };
  }

  // POR QUÉ UN TÍTULO DE APARTADO NO VALE. Se guarda como lo dejaría `limpiarTitulo` de la plantilla
  // común, para que un módulo no pueda tener un título que la común no admitiría.
  function motivoDeTitulo(titulo, donde) {
    if (!esCadena(titulo)) return `${donde} no tiene «titulo»: es lo que se pinta del apartado.`;
    const limpio = Plantilla().limpiarTitulo(titulo);
    if (!limpio) return `${donde} no tiene «titulo»: es lo que se pinta del apartado.`;
    if (limpio.length > Plantilla().LARGO_TITULO) {
      return `${donde} tiene un título de ${limpio.length} caracteres: el máximo son ${Plantilla().LARGO_TITULO}.`;
    }
    if (limpio !== titulo) {
      return `el título «${titulo}» (${donde}) tiene que guardarse como «${limpio}»: sin número delante ni espacios de sobra, porque el número lo pone el documento por posición.`;
    }
    return null;
  }

  // POR QUÉ UN APARTADO AÑADIDO POR EL MÓDULO NO VALE. `previos` son los ids de los añadidos
  // anteriores de la lista: un apartado propio solo puede colgar de otro propio que va antes, así no
  // hay ciclos ni apartados sin sitio.
  function motivoDeApartadoPropio(a, donde, previos, comunes) {
    if (!esObjeto(a)) return `${donde} no es un apartado { id, titulo, padre, campos }.`;
    const extra = sobran(a, CLAVES_APARTADO_PROPIO);
    if (extra.length) return `${donde} lleva ${comillas(extra)}, que no existe en un apartado: solo ${comillas(CLAVES_APARTADO_PROPIO)}.`;
    if (!esCadena(a.id)) return `${donde} no tiene «id»: es con el que se guarda lo que se escribe en él y no cambia nunca.`;
    if (!esCadena(a.padre)) return `${donde} no dice de quién cuelga («padre»): el bloque de módulos o uno de sus apartados.`;
    const local = a.id.startsWith(a.padre + '/') ? a.id.slice(a.padre.length + 1) : null;
    if (local === null || !local.length || local.indexOf('/') >= 0) {
      return `el id ${de(donde)}, «${a.id}», no es el de su padre «${a.padre}», una barra y un nombre: así se reconoce de quién cuelga.`;
    }
    if (!local.startsWith(PREFIJO)) {
      return `el id ${de(donde)}, «${a.id}», no acaba en un nombre que empiece por «${PREFIJO}»: los apartados de un módulo se distinguen así de los de la plantilla común, para que uno de lo común añadido mañana no comparta el contenido de este.`;
    }
    if (previos.has(a.id) || (comunes && (comunes.mapa.has(a.id) || a.id === comunes.bloque.id))) {
      return `${donde} se llama «${a.id}», igual que otro apartado: el id de un apartado no se reutiliza ni siquiera si el otro está retirado, porque el contenido se guarda por él.`;
    }
    const m = motivoDeTitulo(a.titulo, donde);
    if (m) return m;
    if (a.retirado !== undefined && typeof a.retirado !== 'boolean') return `«retirado» ${de(donde)} tiene que ser verdadero o falso.`;
    if (comunes) {
      const padre = comunes.mapa.get(a.padre);
      if (padre) {
        if (padre.retirado) {
          return `${donde} cuelga de «${padre.seccion.titulo || a.padre}», que está retirado en la plantilla común: lo que la jefatura retira no se usa desde un módulo.`;
        }
        if (padre.seccion.repetidor) {
          return `${donde} cuelga de «${padre.seccion.titulo || a.padre}», que es una lista de fichas: lo de dentro son los campos de cada ficha, no apartados.`;
        }
      } else if (a.padre === comunes.bloque.id) {
        if (comunes.bloque.retirado) return `${donde} cuelga del bloque de módulos, que está retirado.`;
      } else if (!previos.has(a.padre)) {
        return `${donde} cuelga de «${a.padre}», que no es un apartado de módulo ni uno añadido antes en la lista.`;
      }
    }
    if (!Array.isArray(a.campos) || !a.campos.length) {
      return `${donde} no trae «campos»: sin al menos un campo no se puede escribir en el apartado.`;
    }
    if (a.campos.length > MAX_CAMPOS) {
      return `${donde} trae ${plural(a.campos.length, 'campo', 'campos')}: el máximo son ${MAX_CAMPOS}, contando los retirados, porque su contenido sigue guardado bajo su id.`;
    }
    const idsCampo = new Set(RESERVADOS);
    for (let j = 0; j < a.campos.length; j += 1) {
      const suyo = `el campo ${j + 1} ${de(donde)}`;
      const mc = motivoDeCampoPropio(a.campos[j], suyo);
      if (mc) return mc;
      if (idsCampo.has(a.campos[j].id)) return `${suyo} se llama «${a.campos[j].id}», igual que otro campo del apartado: el id de un campo no se reutiliza ni siquiera si el otro está retirado, porque el contenido se guarda por él.`;
      idsCampo.add(a.campos[j].id);
    }
    const choque = choqueDeEtiquetas(a.campos.filter((c) => !retirado(c)));
    if (choque) {
      return `dos campos ${de(donde)} se llaman «${choque.etiqueta}»${choque.etiqueta === choque.dueno ? '' : ` y «${choque.dueno}»`}: en la pantalla y en el papel no se distinguirían. Cambia el nombre de uno, o retira el que sobre.`;
    }
    return null;
  }

  // POR QUÉ LOS DESVÍOS A LOS APARTADOS ENTEROS NO VALEN. `plantilla` es la del documento si se tiene
  // delante; sin ella solo se mide la forma.
  function motivoDeApartados(d, plantilla) {
    if (!esObjeto(d)) return 'los «apartados» de la estructura del módulo no son un objeto { cambios, anadidos, orden }.';
    const extra = sobran(d, CLAVES_APARTADOS);
    if (extra.length) return `los «apartados» de la estructura del módulo llevan ${comillas(extra)}, que no existe: solo ${comillas(CLAVES_APARTADOS)}.`;
    // La forma de cada parte se mira ANTES de preguntar si cambia algo, como en `motivoDeDesvio`.
    if (d.cambios !== undefined && !esObjeto(d.cambios)) return 'los «cambios» a los apartados no son un objeto { idDeApartado: { titulo, retirado } }.';
    if (d.anadidos !== undefined && !Array.isArray(d.anadidos)) return 'los «anadidos» de los apartados no son una lista.';
    if (d.orden !== undefined && !esObjeto(d.orden)) return 'el «orden» de los apartados no es un objeto { idDelPadre: [ids de apartado] }.';
    for (const idPadre of Object.keys(d.orden || {})) {
      if (!Array.isArray(d.orden[idPadre])) return `el «orden» de los hijos de «${idPadre}» no es una lista de ids de apartado.`;
    }
    if (!desvioDeApartados({ [CLAVE]: { apartados: d } })) {
      return 'los «apartados» de la estructura del módulo no cambian nada: un módulo solo guarda lo que cambia, y el resto sigue la plantilla común.';
    }
    const comunes = plantilla ? mapaDeComunes(plantilla) : null;
    if (comunes && !comunes.bloque) return 'el documento no tiene módulos: no hay apartados de módulo que cambiar.';
    const nombreComun = (id) => (comunes.mapa.get(id) && comunes.mapa.get(id).seccion.titulo) || id;
    const anadidos = d.anadidos || [];
    const propios = new Set(anadidos.filter((a) => esObjeto(a) && esCadena(a.id)).map((a) => a.id));

    const cambios = d.cambios || {};
    for (const id of Object.keys(cambios)) {
      const c = cambios[id];
      const suyo = `el cambio al apartado «${id}»`;
      if (!esObjeto(c)) return `${suyo} no es un objeto { titulo, retirado }.`;
      const sobrante = sobran(c, CLAVES_CAMBIO_APARTADO);
      if (sobrante.length) {
        return `${suyo} lleva ${comillas(sobrante)}: un módulo solo puede renombrar o retirar un apartado común (${comillas(CLAVES_CAMBIO_APARTADO)}); moverlo se dice en «orden» y añadir uno en «anadidos».`;
      }
      if (!Object.keys(c).length) return `${suyo} no cambia nada: si el módulo no toca el apartado, no tiene que aparecer.`;
      if (c.titulo !== undefined) {
        const m = motivoDeTitulo(c.titulo, suyo);
        if (m) return m;
      }
      if (c.retirado !== undefined && typeof c.retirado !== 'boolean') return `«retirado» de ${suyo} tiene que ser verdadero o falso.`;
      if (propios.has(id)) {
        return `${suyo}: ese apartado lo ha añadido el módulo, y su título y su retirada se cambian en el propio apartado de «anadidos», no aquí.`;
      }
      if (comunes) {
        const h = comunes.mapa.get(id);
        if (!h) {
          const fuera = Plantilla().buscar(plantilla, id);
          if (fuera) {
            return `«${fuera.seccion.titulo || id}» no es un apartado de módulo sino común del documento: su forma es de la jefatura del departamento y un módulo no la cambia.`;
          }
          return `el documento no tiene ningún apartado «${id}».`;
        }
        if (h.retirado) {
          return `el apartado «${nombreComun(id)}» está retirado en la plantilla común, o está dentro de uno que lo está: lo que la jefatura retira no lo cambia ni lo recupera un módulo.`;
        }
      }
    }

    if (anadidos.length > MAX_APARTADOS_PROPIOS) {
      return `el módulo añade ${plural(anadidos.length, 'apartado', 'apartados')}: el máximo son ${MAX_APARTADOS_PROPIOS}.`;
    }
    const previos = new Set();
    for (let i = 0; i < anadidos.length; i += 1) {
      const m = motivoDeApartadoPropio(anadidos[i], `el apartado añadido ${i + 1}`, previos, comunes);
      if (m) return m;
      previos.add(anadidos[i].id);
    }

    const orden = d.orden || {};
    for (const idPadre of Object.keys(orden)) {
      const lista = orden[idPadre];
      const donde = `el «orden» de los hijos de «${idPadre}»`;
      let hijos = null;
      if (comunes) {
        const h = comunes.mapa.get(idPadre);
        if (h && h.retirado) {
          return `${donde} no se puede cambiar: «${nombreComun(idPadre)}» está retirado en la plantilla común.`;
        }
        if (!h && idPadre !== comunes.bloque.id && !propios.has(idPadre)) {
          return `${donde}: el documento no tiene ningún apartado de módulo «${idPadre}».`;
        }
        const deLaComun = h ? hijosDe(h.seccion) : (idPadre === comunes.bloque.id ? hijosDe(comunes.bloque) : []);
        hijos = new Set(deLaComun.filter(esObjeto).map((s) => s.id)
          .concat(anadidos.filter((a) => a.padre === idPadre).map((a) => a.id)));
      }
      const vistos = new Set();
      for (const id of lista) {
        if (!esCadena(id)) return `${donde} lleva algo que no es un id de apartado.`;
        if (vistos.has(id)) return `${donde} nombra dos veces el apartado «${id}»: un apartado solo está en un sitio.`;
        vistos.add(id);
        if (hijos && !hijos.has(id)) return `${donde} nombra el apartado «${id}», que no es hijo de «${idPadre}»: un apartado no cambia de padre, solo de sitio entre sus hermanos.`;
      }
    }

    // Dos hermanos visibles no pueden llamarse igual, pero solo se pregunta por los títulos que el
    // módulo pone (los renombrados y los añadidos): un parecido que ya traía la plantilla común no es
    // algo que este módulo haya hecho, y negarle por eso cualquier otro cambio sería injusto.
    if (comunes) {
      const resuelto = apartadosDeModulo(plantilla, { [CLAVE]: { apartados: d } });
      const tocados = new Set(Object.keys(cambios).filter((id) => cambios[id].titulo !== undefined).concat(Array.from(propios)));
      const norm = Sa().norm;
      const clave = (s) => norm(s.titulo == null ? '' : s.titulo);
      let choque = null;
      (function mirar(lista) {
        const visibles = lista.filter((s) => esObjeto(s) && !s.retirado);
        for (const s of visibles) {
          if (choque || !tocados.has(s.id) || !clave(s)) continue;
          const otro = visibles.find((o) => o !== s && clave(o) === clave(s));
          if (otro) {
            choque = `dos apartados hermanos se llaman «${s.titulo}»${s.titulo === otro.titulo ? '' : ` y «${otro.titulo}»`}: en la pantalla y en el papel no se distinguirían. Cambia el título de uno, o retira el que sobre.`;
          }
        }
        for (const s of visibles) mirar(hijosDe(s));
      })(resuelto.secciones);
      if (choque) return choque;
    }
    return null;
  }

  // POR QUÉ LA ESTRUCTURA QUE UN MÓDULO GUARDA PARA SÍ NO VALE. `plantilla` es la del documento si se
  // tiene delante: con ella se comprueba además que cada apartado exista, que sea de módulo y no
  // común, y que cada campo nombrado exista. Sin ella solo se mide la forma, que es lo que se puede
  // decir de un valor suelto.
  //
  // `undefined` es no tener estructura propia y vale. Una `estructura` que existe pero no desvía nada
  // NO VALE, por lo mismo que `partes: []` en la tabla: sería una estructura propia que no hace nada
  // y que nadie ve. Para volver a la común se quita la clave, no se deja vacía.
  function motivoDeEstructura(estructura, plantilla) {
    if (estructura === undefined) return null;
    if (!esObjeto(estructura)) return 'la estructura del módulo no es un objeto { secciones, apartados }.';
    const extra = sobran(estructura, CLAVES_ESTRUCTURA);
    if (extra.length) return `la estructura del módulo lleva ${comillas(extra)}, que no existe: solo ${comillas(CLAVES_ESTRUCTURA)}.`;
    const hayApartados = estructura.apartados !== undefined;
    if (estructura.secciones === undefined && !hayApartados) {
      return 'la estructura del módulo no trae «secciones» (los campos que cambia) ni «apartados» (los apartados que cambia): una estructura propia es la que se desvía de la común, y sin desvíos no hay nada que seguir.';
    }
    if (estructura.secciones !== undefined && !esObjeto(estructura.secciones)) return 'las «secciones» de la estructura del módulo no son un objeto { idDeApartado: desvío }.';
    const ids = estructura.secciones === undefined ? [] : Object.keys(estructura.secciones);
    if (!ids.length && !hayApartados) {
      return 'la estructura del módulo no cambia ningún apartado: una estructura propia es la que se desvía de la común, y sin desvíos no hay nada que seguir.';
    }
    if (ids.length > MAX_SECCIONES) {
      return `la estructura del módulo cambia ${plural(ids.length, 'apartado', 'apartados')}: el máximo son ${MAX_SECCIONES}.`;
    }
    const anadidosPropios = hayApartados && esObjeto(estructura.apartados) && Array.isArray(estructura.apartados.anadidos)
      ? estructura.apartados.anadidos.filter((x) => esObjeto(x) && esCadena(x.id)) : [];
    for (const id of ids) {
      const propio = anadidosPropios.find((x) => x.id === id);
      if (propio) {
        return `«${propio.titulo || id}» es un apartado que ha añadido el propio módulo: sus campos se cambian en el propio apartado de «anadidos», no en «secciones».`;
      }
      let seccion = null;
      if (plantilla) {
        const hallada = Plantilla().buscar(plantilla, id);
        if (!hallada) return `el documento no tiene ningún apartado «${id}».`;
        seccion = hallada.seccion;
        const nombre = seccion.titulo || id;
        if (hallada.retirado || hallada.retiradoPorEncima) {
          return `el apartado «${nombre}» está retirado: no se le puede cambiar la estructura a un módulo.`;
        }
        if (seccion.repetidor) {
          return `«${nombre}» es una lista de fichas: lo de dentro son los campos de cada ficha, y no se cambian por módulo.`;
        }
        // La frontera de la decisión del departamento: lo común no es de los módulos.
        if (Permisos().quienEdita(plantilla, id) !== 'docentes_del_modulo') {
          return `«${nombre}» es un apartado común del documento: su forma es de la jefatura del departamento y un módulo no la cambia, aunque el contenido se delegue.`;
        }
      }
      const m = motivoDeDesvio(estructura.secciones[id], id, seccion);
      if (m) return m;
    }
    if (hayApartados) return motivoDeApartados(estructura.apartados, plantilla);
    return null;
  }

  // LAS CASILLAS NO DESAPARECEN DE LA LISTA. Las casillas que el módulo ha creado (`secciones[id].anadidos`
  // y los `campos` de un apartado propio) guardan lo escrito bajo su id. Si una lista nueva llega sin una
  // de las que ya había, lo escrito se queda huérfano: no se borra y nadie lo vuelve a ver. Para quitarla
  // hay que marcarla `retirado: true`, que la deja en su sitio con su contenido. Esta puerta no mira la
  // forma (eso es `motivoDeEstructura`): compara la estructura que hay con la que se pide y dice la
  // primera casilla que falta, o null. Vive aquí, junto a la forma de `anadidos`, y la llaman la ruta del
  // servidor y quien quiera avisar antes de mandar. `nueva === null` es volver a la común, que es otra
  // decisión (docs/estructura-por-modulo.md §6) y no entra aquí.
  function casillasDe(estructura) {
    const mapa = new Map();
    if (!esObjeto(estructura)) return mapa;
    const lista = (x) => (Array.isArray(x) ? x : []);
    if (esObjeto(estructura.secciones)) {
      for (const id of Object.keys(estructura.secciones)) {
        const d = estructura.secciones[id];
        if (!esObjeto(d)) continue;
        for (const c of lista(d.anadidos)) {
          if (esObjeto(c) && esCadena(c.id)) mapa.set(id + '\u0000' + c.id, { apartado: id, campo: c });
        }
      }
    }
    if (esObjeto(estructura.apartados)) {
      for (const a of lista(estructura.apartados.anadidos)) {
        if (!esObjeto(a) || !esCadena(a.id)) continue;
        for (const c of lista(a.campos)) {
          if (esObjeto(c) && esCadena(c.id)) mapa.set(a.id + '\u0000' + c.id, { apartado: a.titulo || a.id, campo: c });
        }
      }
    }
    return mapa;
  }

  function motivoDeCasillasPerdidas(anterior, nueva) {
    if (nueva === null || nueva === undefined) return null;
    const ahora = casillasDe(nueva);
    for (const [clave, { apartado, campo }] of casillasDe(anterior)) {
      if (ahora.has(clave)) continue;
      const nombre = campo.etiqueta && campo.etiqueta !== campo.id ? `«${campo.etiqueta}» (${campo.id})` : `«${campo.id}»`;
      return `la casilla ${nombre} de «${apartado}» ya existe y no está en la lista: una casilla no desaparece, porque lo escrito en ella se quedaría guardado sin que nadie lo viera. Para quitarla, márcala con «retirado: true».`;
    }
    return null;
  }

  // LO QUE DEJA DE EXISTIR AL CAMBIAR LA ESTRUCTURA PROPIA. Dice qué casillas y qué apartados PROPIOS del
  // módulo desaparecen si su estructura pasa de la de `unidad` a `nueva`. Es la pregunta que hay que
  // hacer antes de borrar, porque debajo de esos ids hay contenido escrito por personas. Solo puede
  // perderse lo propio: un desvío cambia etiquetas, orden y retiradas sobre lo común, y quitarlo
  // devuelve lo común tal cual, así que lo común no entra nunca en el resultado.
  //
  //   { campos:    [ { seccion, id, etiqueta } ],   casillas propias que dejan de existir
  //     apartados: [ { id, titulo } ] }             apartados propios que dejan de existir
  //
  // `nueva === null` es volver a la común: se pierde todo lo propio. Siempre devuelve las dos listas,
  // vacías si no se pierde nada, y no modifica ni `unidad` ni `nueva`.
  //
  // UN APARTADO SE PIERDE CON SU SUBÁRBOL. Un apartado propio puede colgar de otro (`padre`). Si el
  // padre se pierde, también sus descendientes, aunque `nueva` todavía los liste: sin padre no cuelgan
  // de ningún sitio y `apartadosDeModulo` no los pintaría. Por eso se recorre `padre` hacia abajo y no
  // basta con mirar qué ids faltan.
  //
  // DOS TIPOS DE BORRADO, y por eso van en listas distintas. Las casillas de un apartado propio que se
  // pierde NO van en `campos`: van dentro de ese apartado, y quien lo borre borra su fila entera, con
  // todas sus casillas. En `campos` solo van las casillas propias de apartados que SIGUEN existiendo,
  // y quitar una es quitar una clave de una fila que se queda. Si se mezclaran, quien borra
  // intentaría quitar una casilla de una fila que ya no está, o contaría dos veces lo mismo.
  //
  // Las listas salen ordenadas (casillas por `seccion` y `id`, apartados por `id`) para que dos
  // llamadas iguales den lo mismo en el mismo orden. Con datos mal formados es tan tolerante como el
  // resto del fichero: sin estructura devuelve las listas vacías y una entrada que no sea un objeto
  // con `id` de cadena se ignora.
  function loQueSePierde(unidad, nueva) {
    const lista = (x) => (Array.isArray(x) ? x : []);
    const validos = (x) => lista(x).filter((a) => esObjeto(a) && esCadena(a.id));
    const texto = (x, otro) => (typeof x === 'string' && x.trim() ? x : otro);
    const porClave = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
    const hoy = esObjeto(unidad) && esObjeto(unidad[CLAVE]) ? unidad[CLAVE] : null;
    const perdido = { campos: [], apartados: [] };
    if (!hoy) return perdido;
    // `nueva` es un objeto o exactamente `null`. Cualquier otra cosa es un dato roto, y de lo que
    // contesta esta función depende qué se destruye: UN DATO ROTO NO AUTORIZA UNA DESTRUCCIÓN, así que
    // se contesta «no se pierde nada». No deja pasar ninguna escritura —la ruta rechaza ese cuerpo con
    // un 400 antes de llegar aquí—; lo que evita es que un fallo de validación en otro sitio se
    // convierta en un borrado, que es el error en el que esta función no puede caer.
    if (nueva !== null && !esObjeto(nueva)) return perdido;
    const despues = nueva;

    // Los apartados propios de hoy y los ids que la nueva sigue listando.
    const propiosHoy = esObjeto(hoy.apartados) ? validos(hoy.apartados.anadidos) : [];
    const propiosNueva = despues && esObjeto(despues.apartados) ? validos(despues.apartados.anadidos) : [];
    const sigue = new Set(propiosNueva.map((a) => a.id));
    const caidos = new Set(propiosHoy.filter((a) => !sigue.has(a.id)).map((a) => a.id));
    // El subárbol: hasta que no entre ninguno más, se pierde todo el que cuelga de uno perdido.
    for (let cambia = true; cambia;) {
      cambia = false;
      for (const a of propiosHoy) {
        if (!caidos.has(a.id) && caidos.has(a.padre)) { caidos.add(a.id); cambia = true; }
      }
    }
    const vistosApartados = new Set();
    for (const a of propiosHoy) {
      if (!caidos.has(a.id) || vistosApartados.has(a.id)) continue;
      vistosApartados.add(a.id);
      perdido.apartados.push({ id: a.id, titulo: texto(a.titulo, a.id) });
    }

    // Las casillas, de apartados que siguen. Se recorren las dos formas guardadas
    // (`secciones[...].anadidos` y `campos` de un apartado propio), como `casillasDe`, pero aquí hace
    // falta además la etiqueta y el apartado como id.
    const casillas = (e) => {
      const mapa = new Map();
      if (!esObjeto(e)) return mapa;
      if (esObjeto(e.secciones)) {
        for (const id of Object.keys(e.secciones)) {
          if (!esObjeto(e.secciones[id])) continue;
          for (const c of validos(e.secciones[id].anadidos)) mapa.set(id + '\u0000' + c.id, { seccion: id, campo: c });
        }
      }
      if (esObjeto(e.apartados)) {
        for (const a of validos(e.apartados.anadidos)) {
          for (const c of validos(a.campos)) mapa.set(a.id + '\u0000' + c.id, { seccion: a.id, campo: c });
        }
      }
      return mapa;
    };
    const quedan = casillas(despues);
    for (const [clave, { seccion, campo }] of casillas(hoy)) {
      // Las de un apartado perdido se van con su fila: no son una pérdida aparte.
      if (caidos.has(seccion) || quedan.has(clave)) continue;
      perdido.campos.push({ seccion, id: campo.id, etiqueta: texto(campo.etiqueta, campo.id) });
    }
    perdido.campos.sort((a, b) => porClave(a.seccion, b.seccion) || porClave(a.id, b.id));
    perdido.apartados.sort((a, b) => porClave(a.id, b.id));
    return perdido;
  }

  const api = {
    CLAVE, PREFIJO, RESERVADOS, MAX_CAMPOS, MAX_SECCIONES, MAX_APARTADOS_PROPIOS, LARGO_ETIQUETA,
    estructuraDeModulo, camposDeSeccion, desvioDe, idDeCampoPropio,
    apartadosDeModulo, desvioDeApartados, bloqueDeUnidades, idDeApartadoPropio,
    motivoDeEstructura, motivoDeCasillasPerdidas, loQueSePierde, motivoDeDesvio, motivoDeCampoPropio, choqueDeEtiquetas, motivoDeApartados,
  };

  global.Core = global.Core || {};
  global.Core.estructuraModulo = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
