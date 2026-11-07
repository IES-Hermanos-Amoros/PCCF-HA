// LA ESTRUCTURA DEL DOCUMENTO, Y LOS CUATRO CAMBIOS QUE SE LE PUEDEN HACER:
// renombrar un apartado, añadir uno, moverlo entre sus hermanos y retirarlo.
//
// Es lo que convierte la herramienta en el sitio donde vive la programación en lugar de
// un visor de lo que diga un Word. Hasta el E6 la estructura solo se podía cambiar
// reimportando un .docx, así que el Word seguía siendo la fuente de verdad: si la
// inspección pedía un apartado nuevo, había que volver allí.
//
// Es el puerto de docs/mockup-v2/js/plantilla.js: allí la capa de cambios se guarda en
// `localStorage` y se aplica al pintar; aquí es una transformación pura de la plantilla
// —entra una plantilla y un cambio, sale otra plantilla— porque el servidor la guarda y el
// navegador la va a necesitar igual para pintar la tarjeta *Estructura* y para decir qué se
// puede mover y qué no. Dos implementaciones de esto es la avería del E0 otra vez.
//
// ---------------------------------------------------------------------------
// EL ID NO ES EL TÍTULO
//
// `id` se genera UNA VEZ, al crear el apartado, y no vuelve a cambiar nunca. `titulo` es
// solo la etiqueta que se pinta. Si el id fuera el slug del título, renombrar «Introducción»
// cambiaría su id y dejaría huérfanos su contenido —los apartados se guardan por el par
// (seccion, unidadId), docs/plan.md §2.3—, sus comentarios, sus asignaciones y los enlaces
// que alguien tuviera guardados. Es el mismo cuidado que se tuvo con las unidades un nivel
// más arriba, y la razón de que exista core/unidades.js.
//
// Por eso aquí `renombrar` toca `titulo` y nada más, y el id de un apartado añadido se
// deriva del título con el que nace y ahí se queda.
// ---------------------------------------------------------------------------
//
// RETIRAR NO BORRA
//
// Un apartado retirado se queda en la plantilla con `retirado: true`: deja de pintarse, de
// imprimirse y de poder escribirse, pero su contenido sigue en `apartados` y el apartado se
// puede restaurar con todo lo que tenía dentro. Borrar la sección del árbol sería la única
// operación irreversible de las cuatro, y quien retira un apartado por error no puede perder
// lo que había escrito. Quien lee la plantilla para pintar o para imprimir usa `vigente()`,
// que la devuelve sin los retirados; quien los va a restaurar la lee tal cual.
//
// UN APARTADO DE MÓDULO ES DE LA PLANTILLA
//
// Las secciones que cuelgan del bloque con `instancias: true` las repiten los once módulos
// (es el par (seccion, unidadId) del motor), así que cambiar una cambia los once a la vez.
// No es un fallo, es lo que es: por eso cada cambio sale de aquí con `deUnidades`, para que
// la respuesta de la API lo diga y la interfaz lo pueda advertir antes.
//
// Lógica pura: sin DOM, sin node, sin red, sin localStorage. Vale como <script> en el
// mockup, como `require` en las pruebas y en las rutas, y como `import` desde Next. Cuelga
// de `global.Core.plantilla`, igual que los demás módulos de core/.

(function (global) {
  'use strict';

  // ---------------------------------------------------------------- el id de un apartado

  // El mismo criterio que `slug` de motor/importar-docx.js, para que un apartado añadido a
  // mano tenga un id de la misma forma que los que dedujo el importador. Está copiado y no
  // importado porque core/ no puede depender de motor/, que arrastra mammoth y JSZip y no se
  // puede cargar en el navegador (docs/plan.md §2.2); es la misma razón por la que
  // core/documento.js tiene su propio `idDeTitulo`.
  //
  // El número de delante se tira: quien escribe «4. Anexos» quiere el apartado «Anexos», y
  // la numeración la pone el documento por posición (ver core/arbol.js).
  const sinAcentos = (t) => String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '');
  const RE_NUM = /^\s*(\d+(?:\.\d+)*)[.)]?\s+(.*)$/s;
  const norm = (t) => sinAcentos(t).toLowerCase().replace(RE_NUM, '$2')
    .replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const slug = (t) => norm(t).replace(/ /g, '-').slice(0, 50) || 'seccion';

  // El último tramo de un id: 'modulos/metodologia' -> 'metodologia'. Los ids son rutas con
  // '/', igual que los que produce el importador, y lo que tiene que ser único es el tramo
  // entre hermanos: con el prefijo del padre, la ruta entera lo es sola.
  const idLocal = (id) => String(id || '').split('/').pop();

  // El título es la etiqueta que se pinta en el árbol, en el PDF y en el índice. Se recorta y
  // se le quitan los saltos de línea —un título con un `\n` dentro parte el encabezado del
  // PDF— y se limita, porque un título de media página no cabe en ningún sitio y el problema
  // se descubriría al exportar.
  //
  // Y se le quita la numeración de delante, igual que hace el importador con los títulos del
  // Word (`parseNum` en motor/importar-docx.js): quien copia «4. Anexos» del documento quiere
  // el apartado «Anexos», y el número lo pone el documento por posición (ver core/arbol.js).
  // Si se guardara, el PDF imprimiría «5. 4. Anexos» en cuanto el apartado cambiara de sitio.
  const LARGO_TITULO = 200;
  const limpiarTitulo = (t) => String(t == null ? '' : t)
    .replace(/\s+/g, ' ').trim().replace(RE_NUM, '$2').trim();

  // ---------------------------------------------------------------- recorrido

  const esObjeto = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
  const hijosDe = (sec) => (Array.isArray(sec && sec.hijos) ? sec.hijos : []);
  const raizDe = (plantilla) => (plantilla && Array.isArray(plantilla.secciones) ? plantilla.secciones : []);

  // Copia honda. No se usa `structuredClone` para que el fichero valga igual en un navegador
  // viejo, y no se pasa por JSON para no perder las claves con valor `undefined` que el
  // importador deja en algunos campos (`columnas`), que es justo el tipo de diferencia que la
  // prueba de ida y vuelta busca.
  function clonar(x) {
    if (Array.isArray(x)) return x.map(clonar);
    if (esObjeto(x)) {
      const out = {};
      for (const k of Object.keys(x)) out[k] = clonar(x[k]);
      return out;
    }
    return x;
  }

  // El apartado que corresponde a un id, con lo que hace falta para cambiarlo y que no está
  // dentro de la sección: quiénes son sus hermanos y en qué orden, quién es su padre, si está
  // dentro del bloque de unidades y si algún antepasado está retirado.
  //
  // Busca en la plantilla TAL CUAL, con los retirados dentro: quien los va a restaurar tiene
  // que poder encontrarlos. Quien quiera solo lo que se pinta, que busque en `vigente()`.
  //
  // Devuelve null si no existe.
  function buscar(plantilla, idSeccion) {
    if (!idSeccion) return null;
    let hallado = null;
    (function bajar(lista, padre, camino, deUnidades, retiradoArriba) {
      for (let i = 0; i < lista.length && !hallado; i += 1) {
        const sec = lista[i];
        if (!esObjeto(sec)) continue;
        if (sec.id === idSeccion) {
          hallado = {
            seccion: sec,
            padre,
            hermanos: lista,
            indice: i,
            camino: camino.concat([sec]),
            // El bloque que reparte las instancias no es «de una unidad»: es el que las
            // agrupa. Es el mismo convenio que `buscarSeccion` de app/_lib/rutas/comun.js.
            deUnidades,
            retirado: !!sec.retirado,
            retiradoPorEncima: retiradoArriba,
          };
          return;
        }
        bajar(
          hijosDe(sec), sec, camino.concat([sec]),
          deUnidades || !!sec.instancias,
          retiradoArriba || (sec.retirado ? sec : null),
        );
      }
    })(raizDe(plantilla), null, [], false, null);
    return hallado;
  }

  // Cuántos apartados se van con uno: él y todos sus descendientes. Es lo que la respuesta de
  // «retirar» devuelve para que la interfaz pueda advertir de que no se va solo.
  function contar(sec) {
    let n = 1;
    for (const h of hijosDe(sec)) n += contar(h);
    return n;
  }

  // Los ids de un apartado y de todo su subárbol, en orden de lectura. Lo usa la ruta para
  // decir cuántas filas de contenido conserva un apartado retirado: ninguna se borra.
  function rama(plantilla, idSeccion) {
    const h = buscar(plantilla, idSeccion);
    if (!h) return [];
    const out = [];
    (function bajar(sec) {
      out.push(sec.id);
      hijosDe(sec).forEach(bajar);
    })(h.seccion);
    return out;
  }

  // ---------------------------------------------------------------- lo que se pinta

  const hayRetirados = (plantilla) => {
    let hay = false;
    (function bajar(lista) {
      for (const sec of lista) {
        if (hay) return;
        if (sec && sec.retirado) { hay = true; return; }
        bajar(hijosDe(sec));
      }
    })(raizDe(plantilla));
    return hay;
  };

  // La plantilla que ve el resto de la aplicación: la misma, sin los apartados retirados y
  // sin sus subárboles. Es la que se le pasa al árbol, a la que se le busca una sección y la
  // que se imprime, así que un apartado retirado deja de salir en todas partes a la vez.
  //
  // Si no hay ninguno retirado devuelve LA MISMA plantilla, sin copiarla: es el caso normal y
  // pasa por aquí en cada petición. Y cuando copia, reutiliza los subárboles que no cambian.
  function vigente(plantilla) {
    if (!plantilla || !Array.isArray(plantilla.secciones)) return plantilla;
    if (!hayRetirados(plantilla)) return plantilla;
    const podar = (lista) => lista.filter((s) => !(s && s.retirado)).map((s) => {
      const antes = hijosDe(s);
      const despues = podar(antes);
      const igual = despues.length === antes.length && despues.every((x, i) => x === antes[i]);
      return igual ? s : { ...s, hijos: despues };
    });
    return { ...plantilla, secciones: podar(plantilla.secciones) };
  }

  // Los apartados retirados de un documento, para la lista desde la que se restauran.
  //
  // Se devuelven TODOS, también los que están dentro de otro retirado, con `dentroDe` diciendo
  // cuál. Si se devolvieran solo los restaurables, un apartado que se retiró antes que su
  // padre desaparecería de la lista al retirar el padre y, al restaurar el padre, no volvería
  // sin que nada dijera por qué.
  function retirados(plantilla) {
    const out = [];
    (function bajar(lista, deUnidades, dentroDe) {
      for (const sec of lista) {
        if (!esObjeto(sec)) continue;
        if (sec.retirado) {
          out.push({
            seccion: sec.id,
            titulo: sec.titulo || sec.id,
            nivel: sec.nivel === undefined ? null : sec.nivel,
            conHijos: contar(sec) - 1,
            deUnidades,
            dentroDe: dentroDe ? dentroDe.id : null,
          });
        }
        bajar(hijosDe(sec), deUnidades || !!sec.instancias, dentroDe || (sec.retirado ? sec : null));
      }
    })(raizDe(plantilla), false, null);
    return out;
  }

  // La estructura tal como se maneja en la tarjeta *Estructura*: una fila por apartado, en
  // orden de lectura, con lo que la interfaz necesita para pintar los botones sin volver a
  // recorrer nada. `puedeSubir` y `puedeBajar` se calculan entre los hermanos VISIBLES: un
  // botón que no hace nada porque el hermano de arriba está retirado no se distingue de un
  // botón estropeado.
  function estructura(plantilla) {
    const out = [];
    (function bajar(lista, padre, deUnidades) {
      const visibles = lista.filter((s) => esObjeto(s) && !s.retirado);
      for (const sec of lista) {
        if (!esObjeto(sec)) continue;
        const i = visibles.indexOf(sec);
        out.push({
          seccion: sec.id,
          titulo: sec.titulo || sec.id,
          nivel: sec.nivel === undefined ? null : sec.nivel,
          padre: padre ? padre.id : null,
          contenido: (Array.isArray(sec.campos) ? sec.campos.length : 0) > 0,
          repetidor: !!sec.repetidor,
          instancias: !!sec.instancias,
          deUnidades,
          retirado: !!sec.retirado,
          hijos: hijosDe(sec).length,
          // Un apartado retirado no se mueve ni admite hijos: primero se restaura.
          puedeSubir: !sec.retirado && i > 0,
          puedeBajar: !sec.retirado && i >= 0 && i < visibles.length - 1,
          // Dentro de una lista de fichas no hay apartados: hay campos de la ficha.
          admiteHijos: !sec.retirado && !sec.repetidor,
        });
        bajar(hijosDe(sec), sec, deUnidades || !!sec.instancias);
      }
    })(raizDe(plantilla), null, false);
    return out;
  }

  // ---------------------------------------------------------------- los cambios

  const TIPOS = ['anadir', 'renombrar', 'mover', 'retirar', 'restaurar'];

  // El campo con el que nace un apartado añadido. Es el mismo que el importador deduce de una
  // sección con texto suelto (`camposDe` en motor/importar-docx.js), y hace falta: un apartado
  // sin campos no se puede escribir —el PATCH lo rechaza porque «solo agrupa a los de dentro»—
  // y el criterio de aceptación del E6 es añadir un apartado, ESCRIBIR EN ÉL y exportar.
  const CAMPO_NUEVO = { id: 'texto', tipo: 'texto_largo', etiqueta: 'Texto' };

  // Lo que se le niega a quien pide un cambio imposible: un motivo en castellano, para que la
  // ruta lo pueda devolver tal cual y la interfaz lo pueda enseñar. Nunca se devuelve una
  // plantilla a medio cambiar.
  const no = (motivo) => ({ motivo });

  // Si el apartado está retirado, o lo está alguno de sus antepasados, no se le hace nada:
  // primero se restaura. Sin esto se podría renombrar o mover algo que no se ve, y el cambio
  // aparecería el día que alguien lo restaurase sin saber de dónde salía.
  function estorbaRetirado(h, que) {
    if (h.retirado) return no(`«${h.seccion.titulo}» está retirado: restáuralo antes de ${que}.`);
    if (h.retiradoPorEncima) {
      return no(`«${h.seccion.titulo}» está dentro de «${h.retiradoPorEncima.titulo}», que está retirado: restaura ese antes de ${que}.`);
    }
    return null;
  }

  // RENOMBRAR. El id no se toca: es justo la gracia (ver la cabecera).
  function renombrar(plantilla, { seccion, titulo } = {}) {
    const limpio = limpiarTitulo(titulo);
    if (!limpio) return no('Hace falta un título: el título es lo que se pinta del apartado.');
    if (limpio.length > LARGO_TITULO) return no(`El título no puede pasar de ${LARGO_TITULO} caracteres.`);

    const copia = clonar(plantilla);
    const h = buscar(copia, seccion);
    if (!h) return no(`Este documento no tiene ningún apartado «${seccion}».`);
    const estorbo = estorbaRetirado(h, 'renombrarlo');
    if (estorbo) return estorbo;

    const antes = h.seccion.titulo;
    h.seccion.titulo = limpio;
    return {
      plantilla: copia,
      cambio: {
        tipo: 'renombrado', seccion: h.seccion.id, titulo: limpio, antes,
        padre: h.padre ? h.padre.id : null, deUnidades: h.deUnidades,
      },
    };
  }

  // AÑADIR. `padre` vacío significa «al final del documento»; con padre, al final de sus
  // hijos. El id se deriva del título con el que nace y no vuelve a cambiar.
  function anadir(plantilla, { padre, titulo } = {}) {
    const limpio = limpiarTitulo(titulo);
    if (!limpio) return no('Hace falta un título para el apartado nuevo.');
    if (limpio.length > LARGO_TITULO) return no(`El título no puede pasar de ${LARGO_TITULO} caracteres.`);

    const copia = clonar(plantilla);
    const idPadre = padre ? String(padre) : '';
    if (!Array.isArray(copia.secciones)) copia.secciones = [];
    let hermanos = copia.secciones;
    let padreSec = null;
    let camino = [];
    let deUnidades = false;

    if (idPadre) {
      const h = buscar(copia, idPadre);
      if (!h) return no(`Este documento no tiene ningún apartado «${idPadre}».`);
      const estorbo = estorbaRetirado(h, 'añadirle nada dentro');
      if (estorbo) return estorbo;
      // Un repetidor no tiene apartados dentro: tiene los campos de cada ficha, y el motor
      // ni siquiera mira sus hijos (`pintarSeccion` de motor/render-generico.js sale antes).
      // Un apartado añadido ahí no se vería en ninguna parte.
      if (h.seccion.repetidor) {
        return no(`«${h.seccion.titulo}» es una lista de fichas: lo de dentro son los campos de cada ficha, no apartados.`);
      }
      padreSec = h.seccion;
      camino = h.camino;
      if (!Array.isArray(padreSec.hijos)) padreSec.hijos = [];
      hermanos = padreSec.hijos;
      deUnidades = h.deUnidades || !!padreSec.instancias;
    }

    // El id, una vez y para siempre. Se comprueba contra los hermanos —también los retirados,
    // que siguen ocupando su id porque van a volver— y contra el documento entero, para que
    // dos apartados con el mismo título no acaben compartiendo contenido.
    const base = slug(limpio);
    const idDe = (local) => (idPadre ? `${idPadre}/${local}` : local);
    const ocupados = hermanos.map((s) => idLocal(s.id));
    let local = base;
    for (let n = 2; ocupados.indexOf(local) >= 0 || buscar(copia, idDe(local)); n += 1) {
      local = `${base}-${n}`;
    }

    // `nivel` es el nivel de esquema del Word, y lo único que lo usa es el exportador. Se
    // toma el de sus hermanos cuando los hay, porque los apartados de un módulo nacen en el
    // nivel 3 aunque su bloque esté en el 1.
    const deHermano = hermanos.map((s) => s.nivel).find((n) => Number.isInteger(n));
    const nivel = Number.isInteger(deHermano)
      ? deHermano
      : (padreSec && Number.isInteger(padreSec.nivel) ? padreSec.nivel + 1 : 1);

    const nueva = {
      id: idDe(local),
      titulo: limpio,
      nivel,
      campos: [{ ...CAMPO_NUEVO }],
      hijos: [],
    };

    // QUIÉN LO EDITA. `edita` se hereda del antepasado que lo diga (core/permisos.js →
    // `quienEdita`), así que un apartado colgado del bloque de módulos ya nace con
    // `docentes_del_modulo` sin escribir nada. Pero uno de primer nivel no hereda de nadie, y
    // `reglaEdicion` niega la edición cuando `edita` no es uno de los dos valores conocidos:
    // sin esta línea, el apartado nuevo no lo podría escribir nadie salvo el soporte. Es
    // además lo que hace el importador con las secciones de primer nivel.
    if (!camino.some((s) => s.edita)) nueva.edita = 'jefe_departamento';

    hermanos.push(nueva);
    return {
      plantilla: copia,
      cambio: {
        tipo: 'anadido', seccion: nueva.id, titulo: limpio, padre: idPadre || null, deUnidades,
      },
    };
  }

  // MOVER entre sus hermanos. `delta` es cuántos sitios: -1 arriba, +1 abajo.
  //
  // Se cuenta entre los hermanos VISIBLES y no entre todos, para que subir un apartado que
  // tiene encima uno retirado no parezca no hacer nada. Al reinsertarlo se le pone al lado del
  // hermano visible que le toca, así que los retirados conservan su sitio y vuelven donde
  // estaban.
  function mover(plantilla, { seccion, delta } = {}) {
    const d = typeof delta === 'number' ? delta : Number(delta);
    if (!Number.isInteger(d) || d === 0) {
      return no('«delta» es cuántos sitios se mueve el apartado: -1 para subirlo, 1 para bajarlo.');
    }

    const copia = clonar(plantilla);
    const h = buscar(copia, seccion);
    if (!h) return no(`Este documento no tiene ningún apartado «${seccion}».`);
    const estorbo = estorbaRetirado(h, 'moverlo');
    if (estorbo) return estorbo;

    const visibles = h.hermanos.filter((s) => !s.retirado);
    const i = visibles.indexOf(h.seccion);
    const j = i + d;
    if (visibles.length < 2) return no(`«${h.seccion.titulo}» no tiene hermanos: no hay sitio donde moverlo.`);
    if (j < 0) return no(`«${h.seccion.titulo}» ya es el primero de su grupo: no se puede subir más.`);
    if (j >= visibles.length) return no(`«${h.seccion.titulo}» ya es el último de su grupo: no se puede bajar más.`);

    const objetivo = visibles[j];
    h.hermanos.splice(h.hermanos.indexOf(h.seccion), 1);
    const destino = h.hermanos.indexOf(objetivo);
    h.hermanos.splice(d < 0 ? destino : destino + 1, 0, h.seccion);

    return {
      plantilla: copia,
      cambio: {
        tipo: 'movido', seccion: h.seccion.id, titulo: h.seccion.titulo, antes: null,
        padre: h.padre ? h.padre.id : null, deUnidades: h.deUnidades,
        delta: d, posicion: j + 1, hermanos: visibles.length,
      },
    };
  }

  // RETIRAR: no borra. Ver la cabecera.
  function retirar(plantilla, { seccion } = {}) {
    const copia = clonar(plantilla);
    const h = buscar(copia, seccion);
    if (!h) return no(`Este documento no tiene ningún apartado «${seccion}».`);
    if (h.retirado) return no(`«${h.seccion.titulo}» ya está retirado.`);
    if (h.retiradoPorEncima) {
      return no(`«${h.seccion.titulo}» ya está retirado con «${h.retiradoPorEncima.titulo}», que lo contiene.`);
    }

    h.seccion.retirado = true;
    return {
      plantilla: copia,
      cambio: {
        tipo: 'retirado', seccion: h.seccion.id, titulo: h.seccion.titulo,
        padre: h.padre ? h.padre.id : null, deUnidades: h.deUnidades,
        // Un apartado se va con su subárbol, igual que en el prototipo: si se quedaran los
        // hijos sin padre, el PDF los imprimiría sueltos bajo el apartado de más arriba.
        conHijos: contar(h.seccion) - 1,
      },
    };
  }

  // RESTAURAR: lo devuelve a su sitio, con todo lo que tenía dentro.
  function restaurar(plantilla, { seccion } = {}) {
    const copia = clonar(plantilla);
    const h = buscar(copia, seccion);
    if (!h) return no(`Este documento no tiene ningún apartado «${seccion}».`);
    // El antepasado, ANTES de mirar si este está retirado: un hijo de algo retirado no está
    // retirado él, pero tampoco se ve, y restaurarlo no lo devolvería a la vista. Se dice cuál
    // hay que restaurar primero en lugar de dejarlo escondido y que quien lo pidió crea que ya
    // está, o de contestarle «no está retirado» cuando no se ve por ninguna parte.
    if (h.retiradoPorEncima) {
      return no(`«${h.seccion.titulo}» está dentro de «${h.retiradoPorEncima.titulo}», que está retirado: restaura ese primero.`);
    }
    if (!h.retirado) return no(`«${h.seccion.titulo}» no está retirado: no hay nada que restaurar.`);

    delete h.seccion.retirado;
    return {
      plantilla: copia,
      cambio: {
        tipo: 'restaurado', seccion: h.seccion.id, titulo: h.seccion.titulo,
        padre: h.padre ? h.padre.id : null, deUnidades: h.deUnidades,
        conHijos: contar(h.seccion) - 1,
      },
    };
  }

  // Una sola puerta para los cinco cambios, para que la ruta y el navegador no puedan tener
  // ideas distintas sobre lo que se puede hacer. Devuelve { plantilla, cambio } o { motivo }.
  function aplicar(plantilla, peticion) {
    const p = peticion || {};
    switch (p.tipo) {
      case 'renombrar': return renombrar(plantilla, p);
      case 'anadir': return anadir(plantilla, p);
      case 'mover': return mover(plantilla, p);
      case 'retirar': return retirar(plantilla, p);
      case 'restaurar': return restaurar(plantilla, p);
      default: return no(`«${p.tipo}» no es un cambio de estructura: ${TIPOS.join(', ')}.`);
    }
  }

  // ---------------------------------------------------------------- la versión

  // LA PLANTILLA ES DE CADA DOCUMENTO, Y CADA CAMBIO DEJA UNA VERSIÓN NUEVA.
  //
  // `plantillaVersion` existe desde el E0 y hasta aquí estaba sin usar (docs/plan.md §2.6).
  // Sube de uno en uno con cada cambio, y el cambio se apunta dentro de la plantilla con el
  // número de versión que deja: así se puede contar qué le ha pasado a la estructura de este
  // documento sin otra colección, que es lo que la lista blanca de repositorio/ permitía.
  //
  // El registro viaja dentro de `plantilla` a propósito: cuando se arrastra el curso, la
  // plantilla se copia entera (app/_lib/rutas/arrastre.js), así que el documento nuevo nace
  // con la estructura que el viejo tenía EN ESE MOMENTO y con la historia de cómo llegó ahí.
  // Desde entonces los dos son independientes: cambiar el curso que se prepara no toca el del
  // curso pasado, que a lo mejor ya está aprobado y entregado.
  const siguienteVersion = (version) => (Number(version) || 1) + 1;

  function registrar(plantilla, cambio) {
    const previos = Array.isArray(plantilla && plantilla.cambios) ? plantilla.cambios : [];
    return { ...plantilla, cambios: previos.concat([cambio]) };
  }

  // ---------------------------------------------------------------------- exportado

  const api = {
    slug, idLocal, limpiarTitulo, LARGO_TITULO, CAMPO_NUEVO, TIPOS,
    buscar, rama, contar, vigente, retirados, estructura,
    renombrar, anadir, mover, retirar, restaurar, aplicar,
    siguienteVersion, registrar,
  };

  global.Core = global.Core || {};
  global.Core.plantilla = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
