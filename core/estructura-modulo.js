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
// Y LA REGLA ESTÁ ESCRITA UNA SOLA VEZ, en `camposDeSeccion`. La tienen que llamar quien pinta el
// apartado, quien lo imprime, quien lo guarda y quien lo exporta; escrita en cada uno, la pantalla
// acabaría pintando unos campos distintos de los que salen en el papel.
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
  // Lo mismo que `LARGO_ETIQUETA` de core/campos.js, y por lo mismo: una etiqueta es una etiqueta.
  const LARGO_ETIQUETA = 100;

  // El prefijo de los ids de campo acuñados por un módulo (ver la cabecera).
  const PREFIJO = 'm_';
  // Lo que un campo no puede llamarse porque el contenido de un apartado repetidor lo usa
  // (RESERVADOS de core/plantilla.js).
  const RESERVADOS = ['items'];

  const CLAVES_ESTRUCTURA = ['secciones'];
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
    if (!esObjeto(e) || !esObjeto(e.secciones)) return null;
    const secciones = {};
    for (const id of Object.keys(e.secciones)) {
      if (desvioDe(unidad, id)) secciones[id] = e.secciones[id];
    }
    return Object.keys(secciones).length ? { secciones } : null;
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
      return `el id de ${donde}, «${campo.id}», no empieza por «${PREFIJO}»: los campos de un módulo se distinguen así de los de la plantilla común, para que uno de lo común añadido mañana no comparta el contenido de este.`;
    }
    if (!Campos().esCreable(campo.tipo)) {
      return `${donde} es de tipo «${campo.tipo}», que no es un tipo de campo que se pueda crear: ${Campos().nombresDeTipos().join(', ')}.`;
    }
    if (!esCadena(campo.etiqueta)) return `${donde} no tiene «etiqueta»: es lo que se pinta del campo.`;
    if (campo.etiqueta.length > LARGO_ETIQUETA) {
      return `la etiqueta de ${donde} tiene ${campo.etiqueta.length} caracteres: el máximo son ${LARGO_ETIQUETA}.`;
    }
    if (campo.retirado !== undefined && typeof campo.retirado !== 'boolean') return `«retirado» de ${donde} tiene que ser verdadero o falso.`;
    if (campo.inicial !== undefined && !esObjeto(campo.inicial)) return `«inicial» de ${donde} no es un objeto.`;
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
    if (!esObjeto(estructura)) return 'la estructura del módulo no es un objeto { secciones }.';
    const extra = sobran(estructura, CLAVES_ESTRUCTURA);
    if (extra.length) return `la estructura del módulo lleva ${comillas(extra)}, que no existe: solo ${comillas(CLAVES_ESTRUCTURA)}.`;
    if (!esObjeto(estructura.secciones)) return 'las «secciones» de la estructura del módulo no son un objeto { idDeApartado: desvío }.';
    const ids = Object.keys(estructura.secciones);
    if (!ids.length) {
      return 'la estructura del módulo no cambia ningún apartado: una estructura propia es la que se desvía de la común, y sin desvíos no hay nada que seguir.';
    }
    if (ids.length > MAX_SECCIONES) {
      return `la estructura del módulo cambia ${plural(ids.length, 'apartado', 'apartados')}: el máximo son ${MAX_SECCIONES}.`;
    }
    for (const id of ids) {
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
    return null;
  }

  const api = {
    CLAVE, PREFIJO, RESERVADOS, MAX_CAMPOS, MAX_SECCIONES, LARGO_ETIQUETA,
    estructuraDeModulo, camposDeSeccion, desvioDe, idDeCampoPropio,
    motivoDeEstructura, motivoDeDesvio, motivoDeCampoPropio, choqueDeEtiquetas,
  };

  global.Core = global.Core || {};
  global.Core.estructuraModulo = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
