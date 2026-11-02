// Contenido de los apartados. Dos cambios de fondo respecto al v1:
//
//  1. El contenido es un MODELO de bloques, no HTML. El v1 ponía
//     `contenteditable` sobre párrafos ya pintados, que es justo lo que advierte
//     docs/interfaz-web.md §2.3: el renderer de PDF solo acepta
//     { type:'p', text } y { type:'list', items:[{text, level}] }, así que si el
//     editor devuelve HTML libre el ida y vuelta se rompe. Aquí el estado es el
//     array de bloques y la vista se pinta desde él; el editor nunca lee el DOM.
//
//  2. Cada apartado lleva de dónde viene: `heredado` del curso anterior,
//     `revisado` (mirado y dado por bueno), `modificado` (reescrito este curso)
//     o `nuevo`. Eso es lo que falta en el v1 y es el trabajo real de septiembre:
//     no se escribe una programación desde cero, se revisa la del año pasado.
//
// TEXTO DE MUESTRA: los párrafos, tablas y ponderaciones son inventados y se
// generan de forma determinista a partir de un hash del apartado, para que cada
// nodo se vea siempre igual. Lo único que se guarda de verdad son los cambios que
// haga quien pruebe el mockup (localStorage). En la app real todo esto sale del
// importador y de MongoDB/Postgres.

(function (global) {
  'use strict';

  const R = global.Estructura.ruta;
  const CLAVE_GUARDADO = 'pccf-ha-v2';

  // ---------------------------------------------------------------- utilidades
  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  const elige = (arr, s) => arr[hash(s) % arr.length];
  const copia = (x) => JSON.parse(JSON.stringify(x));

  // ---------------------------------------------------------------- corpus de muestra
  const PARRAFOS = [
    'Este apartado se desarrolla de acuerdo con la normativa vigente del título y con los acuerdos recogidos en el proyecto curricular del ciclo, revisados por el departamento al inicio del curso.',
    'La planificación la ha elaborado el profesorado del departamento teniendo en cuenta las características de los grupos, los recursos disponibles y la evolución del alumnado durante el curso anterior.',
    'Se plantea una metodología activa y participativa, basada en la resolución de problemas y en el trabajo cooperativo, orientada a la adquisición de las competencias profesionales del título.',
    'La evaluación será continua y global, y atenderá tanto a los procedimientos como a los resultados de aprendizaje, conforme a los criterios y a las ponderaciones del apartado correspondiente.',
    'Para el alumnado con mayor dificultad se prevén medidas de refuerzo y de ampliación, detalladas en el apartado de atención a la diversidad y educación inclusiva.',
    'Se prestará especial atención a la trazabilidad del alumnado, registrando cada intervención realizada y su incidencia en la mejora de los resultados de aprendizaje.',
    'La coordinación entre el profesorado de los distintos módulos se articula en las reuniones de departamento, donde se revisa la marcha de las situaciones de aprendizaje.',
  ];

  // Variantes del mismo párrafo "del curso anterior": lo justo para que el diff
  // enseñe algo parecido a lo que de verdad cambia de un curso a otro.
  const PARRAFOS_ANTERIORES = [
    'Este apartado se desarrolla de acuerdo con la normativa del título y con los acuerdos del proyecto curricular del ciclo.',
    'La planificación la ha elaborado el profesorado del departamento teniendo en cuenta las características de los grupos y los recursos disponibles.',
    'Se plantea una metodología activa y participativa, basada en la resolución de problemas y en el trabajo en grupo, orientada a la adquisición de las competencias del título.',
    'La evaluación será continua y atenderá a los resultados de aprendizaje conforme a los criterios del apartado correspondiente.',
    'Para el alumnado con mayor dificultad se prevén medidas de refuerzo, detalladas en el apartado de atención a la diversidad.',
    'Se prestará atención a la trazabilidad del alumnado, registrando la intervención realizada.',
    'La coordinación entre el profesorado se articula en las reuniones de departamento.',
  ];

  const LISTAS = [
    ['Trabajo individual y en equipo', 'Prácticas en el aula de informática', 'Exposiciones orales y debate', 'Seguimiento en la plataforma del centro'],
    ['Diagnóstico inicial del grupo', 'Secuenciación de las situaciones de aprendizaje', 'Evaluación formativa y sumativa', 'Recuperación de resultados de aprendizaje'],
    ['Materiales elaborados por el profesorado', 'Repositorio de prácticas del departamento', 'Simuladores y entornos virtuales', 'Recursos de accesibilidad'],
  ];

  // ---------------------------------------------------------------- textos compartidos
  // Mismos ids y mismo criterio que el informe del importador real
  // (poc-pdfmake/out/importado/informe.md): se guardan una vez y las unidades
  // los referencian.
  const COMPARTIDOS = {
    c001: { seccion: R('modulos', 'Propuestas de mejora del curso anterior'), comun: false, modo: 'sugerido', version: 3,
      bloque: { type: 'p', text: 'Se estará muy pendiente del alumnado con más dificultad, preguntándole de forma personal e intentando ayudarle en todo lo posible, sin que afecte al resto de la clase. El profesorado coordinará las medidas de refuerzo con la tutoría del grupo.' } },
    c002: { seccion: R('modulos', 'Desarrollo curricular', 'Resultados de aprendizaje y Criterios de evaluacion'), comun: false, modo: 'obligatorio', version: 1,
      bloque: { type: 'p', text: 'Con el objetivo de realizar la trazabilidad del alumnado en las actividades de enseñanza y aprendizaje, se registrará en cada situación el resultado de aprendizaje trabajado y el criterio de evaluación asociado.' } },
    c006: { seccion: R('modulos', 'Ponderaciones de los Resultados de aprendizaje y los Criterios de evaluacion'), comun: false, modo: 'sugerido', version: 2,
      bloque: { type: 'p', text: 'A continuación se detallan las ponderaciones de los resultados de aprendizaje del módulo y, dentro de cada uno, el peso de sus criterios de evaluación.' } },
    c008: { seccion: R('modulos', 'Metodologia especifica', 'Recursos especificos'), comun: false, modo: 'sugerido', version: 1,
      bloque: { type: 'p', text: 'Además de los recursos generales del departamento, en el módulo se emplearán los recursos específicos que se relacionan a continuación.' } },
    c009: { seccion: R('modulos', 'Relacion con otros modulos'), comun: false, modo: 'sugerido', version: 1,
      bloque: { type: 'p', text: 'El profesorado de los módulos se coordinará para evitar duplicar contenidos y para interrelacionar las situaciones de aprendizaje que comparten resultados.' } },
    c011: { seccion: R('modulos', 'Evaluacion y calificacion', 'Recuperacion de los resultados de aprendizaje'), comun: true, modo: 'sugerido', version: 4,
      bloque: { type: 'p', text: 'Existirán los siguientes casos de necesidad de recuperación de resultados de aprendizaje, con el procedimiento y el calendario que el departamento acuerde para cada convocatoria.' } },
  };

  // Secciones de unidad que llevan texto compartido, para pintar el distintivo
  const SECCIONES_COMPARTIDAS = new Map(Object.entries(COMPARTIDOS).map(([id, c]) => [c.seccion, id]));

  // Copias desvinculadas que se quedaron en una versión antigua del original:
  // es el aviso que produce `avisosDesvinculados()` en el motor.
  const DESVINCULADOS = [
    { unidadId: 'daw-0614', compartido: 'c001', versionOrigen: 2 },
    { unidadId: 'smr-0226', compartido: 'c011', versionOrigen: 1 },
  ];

  // ---------------------------------------------------------------- personas
  // Personas inventadas: no es el profesorado real del departamento. Rol y
  // asignaciones van por separado, y las unidades se citan por id estable.
  const USUARIOS = [
    { id: 'u-admin', nombre: 'Soporte técnico', rol: 'admin', departamento: 'informatica', unidades: [], apartados: [] },
    { id: 'u-estudios', nombre: 'Jefatura de estudios', rol: 'jefe_estudios', departamento: 'estudios', unidades: [], apartados: [] },
    { id: 'u-jefedpto', nombre: 'Jefatura del departamento', rol: 'jefe_departamento', departamento: 'informatica', unidades: [], apartados: [] },
    { id: 'u-lucia', nombre: 'Lucía M.', rol: 'docente', departamento: 'informatica',
      unidades: ['daw-0614', 'smr-0225'], apartados: [] },
    { id: 'u-pau', nombre: 'Pau S.', rol: 'docente', departamento: 'informatica',
      unidades: ['daw-0373', 'smr-0226', 'eso-piar-1', 'eso-piar-2', 'eso-digi', 'bach-prsi2'], apartados: [] },
    { id: 'u-nerea', nombre: 'Nerea T.', rol: 'docente', departamento: 'informatica',
      unidades: ['daw-0485', 'daw-0612'], apartados: ['atencion-a-la-diversidad-y-educacion-inclusiva'] },
    { id: 'u-ivan', nombre: 'Iván G.', rol: 'docente', departamento: 'informatica',
      unidades: ['smr-0221', 'smr-0222', 'eso-trds'], apartados: [] },
  ];

  const usuario = (id) => USUARIOS.find((u) => u.id === id) || null;

  // Quién tiene asignada cada unidad (lo que el motor guarda en instancias[].docentes)
  function docentesDe(unidadId) {
    return USUARIOS.filter((u) => (u.unidades || []).includes(unidadId));
  }

  // ---------------------------------------------------------------- estado guardado
  let guardado = { apartados: {}, comentarios: {}, asignaciones: {} };

  function cargar() {
    try {
      const g = JSON.parse(global.localStorage.getItem(CLAVE_GUARDADO) || 'null');
      if (g && typeof g === 'object') guardado = Object.assign(guardado, g);
    } catch (e) { /* navegador sin localStorage: se trabaja en memoria */ }
    // las asignaciones guardadas pisan las de muestra
    USUARIOS.forEach((u) => {
      if (guardado.asignaciones[u.id]) u.unidades = guardado.asignaciones[u.id].slice();
    });
  }

  function guardar() {
    try { global.localStorage.setItem(CLAVE_GUARDADO, JSON.stringify(guardado)); } catch (e) { /* sin persistencia */ }
  }

  function reiniciar() {
    guardado = { apartados: {}, comentarios: {}, asignaciones: {} };
    try { global.localStorage.removeItem(CLAVE_GUARDADO); } catch (e) { /* nada */ }
  }

  // ---------------------------------------------------------------- contenido real
  // js/importado.js trae el contenido de verdad de la programación de DAW, sacado
  // del documento del departamento con herramientas/extraer-contenido.js. Manda
  // sobre el corpus de muestra: donde haya contenido real se enseña ese, y donde
  // no, el inventado. El mockup funciona igual con el fichero y sin él, así que
  // se puede abrir en una máquina que no tenga el documento.
  //
  // Dos excepciones a propósito:
  //
  //   - solo la PD de FP de DAW está importada; los otros seis documentos siguen
  //     con la muestra;
  //   - los seis apartados con texto compartido se quedan con el de muestra,
  //     porque ahí lo que se enseña es el mecanismo de compartir. En la app real
  //     el motor mira los 11 módulos y comparte los párrafos que coinciden
  //     (lib/compartidos.js), en lugar de que los elija una lista a mano.
  const I = global.Importado || null;
  const DOC_IMPORTADO = 'pd-fp-daw';

  function importado(docId, seccion, unidadId) {
    if (!I || !I.UNIDADES || docId !== DOC_IMPORTADO || !seccion) return null;
    if (SECCIONES_COMPARTIDAS.has(seccion)) return null;
    if (!unidadId) return I.COMUNES[seccion] || null;
    const u = I.UNIDADES[unidadId];
    return u && u.secciones ? (u.secciones[seccion] || null) : null;
  }

  // Lo importado, como bloques que la interfaz sepa pintar. Las tablas van tal
  // cual (celdas con colspan y rowspan, como las trae el Word) y la tabla de RA y
  // CE va con su estructura, que es la que usa el editor de ponderaciones.
  function bloquesImportados(v) {
    const out = (v.bloques || []).slice();
    if (v.pares) out.push({ type: 'pares', pares: v.pares });
    if (v.raCe) out.push({ type: 'ra_ce', ra: v.raCe });
    (v.tablas || []).forEach((filas) => out.push({ type: 'tabla', filas }));
    return out;
  }

  // ---------------------------------------------------------------- generación de muestra
  const claveDe = (docId, nodo) => docId + '|' + (nodo.seccion || '') + '|' + (nodo.unidadId || '');

  // Un apartado de muestra: bloques, versión del curso anterior y procedencia.
  function generar(clave) {
    const partes = clave.split('|');
    const imp = importado(partes[0], partes[1], partes[2]);
    if (imp) {
      const bloques = bloquesImportados(imp);
      // Viene del documento del curso pasado y nadie lo ha mirado todavía: es
      // justo lo que significa «heredado», así que no hay que inventar nada.
      if (bloques.length) return { bloques, anterior: copia(bloques), origen: 'heredado', real: true };
    }

    const h = hash(clave);
    const vacio = h % 17 === 0;                       // algún apartado sin rellenar
    const compartido = SECCIONES_COMPARTIDAS.get(clave.split('|')[1]) || null;
    const i = hash(clave + 'p') % PARRAFOS.length;

    const bloques = [];
    if (compartido) bloques.push({ ref: compartido });
    if (!vacio) {
      bloques.push({ type: 'p', text: PARRAFOS[i] });
      if (h % 3 === 0) bloques.push({ type: 'list', items: elige(LISTAS, clave).map((t) => ({ text: t, level: 0 })) });
      if (h % 5 === 0) bloques.push({ type: 'p', text: PARRAFOS[(i + 3) % PARRAFOS.length] });
    }

    // procedencia: la mayoría viene del curso anterior sin tocar
    const r = h % 100;
    const origen = vacio ? 'vacio' : r < 48 ? 'heredado' : r < 72 ? 'revisado' : r < 92 ? 'modificado' : 'nuevo';

    // versión del curso anterior, para el diff (el apartado nuevo no tiene)
    const anterior = origen === 'nuevo' || vacio ? null
      : [{ type: 'p', text: PARRAFOS_ANTERIORES[i] }].concat(
        origen === 'heredado' || origen === 'revisado'
          ? bloques.filter((b) => b.type === 'list').map(copia)
          : []);

    return { bloques, anterior, origen };
  }

  // Apartado tal y como está ahora: lo generado, con los cambios guardados encima.
  function apartado(docId, nodo) {
    const clave = claveDe(docId, nodo);
    const base = generar(clave);
    const g = guardado.apartados[clave];
    if (!g) return Object.assign({ clave }, base);
    return Object.assign({ clave }, base, g);
  }

  function escribir(docId, nodo, cambios) {
    const clave = claveDe(docId, nodo);
    const actual = guardado.apartados[clave] || {};
    guardado.apartados[clave] = Object.assign({}, actual, cambios, { actualizado: Date.now() });
    guardar();
    return guardado.apartados[clave];
  }

  // Guardar bloques editados marca el apartado como modificado: es lo que
  // distingue "lo he mirado" de "lo he reescrito".
  const guardarBloques = (docId, nodo, bloques) => escribir(docId, nodo, { bloques: copia(bloques), origen: 'modificado' });
  const marcarRevisado = (docId, nodo) => escribir(docId, nodo, { origen: 'revisado' });

  // ---------------------------------------------------------------- ponderaciones de RA y CE
  // Las importadas, pasadas al formato del editor ({ num, texto, peso, ce }).
  // El documento real usa dos convenios para los criterios de un RA —reparten la
  // ponderación del RA, o reparten 100 dentro del RA— y los dos se dejan tal
  // cual: es `js/validaciones.js` quien decide si eso cuadra o no.
  function ponderacionesImportadas(unidadId) {
    const u = I && I.UNIDADES ? I.UNIDADES[unidadId] : null;
    if (!u || !u.secciones) return null;
    const sec = Object.keys(u.secciones).filter((k) => u.secciones[k].ponderaciones)[0];
    if (!sec) return null;
    const guardadas = guardado.ponderaciones && guardado.ponderaciones[unidadId];
    if (guardadas) return copia(guardadas);
    return u.secciones[sec].ponderaciones.map((ra) => ({
      num: ra.ra,
      texto: ra.texto || '',
      peso: ra.ponderacion == null ? 0 : ra.ponderacion,
      ce: (ra.ce || []).map((ce) => ({
        letra: ce.letra,
        texto: ce.texto || '',
        peso: ce.ponderacion == null ? 0 : ce.ponderacion,
        fundamental: !!ce.fundamental,
      })),
    }));
  }

  // Datos de muestra, pero con el reparto descuadrado en algunas unidades a
  // propósito: son los avisos que hoy aparecen en la cajita roja del PDF.
  function ponderaciones(unidadId) {
    // Las de verdad, si el módulo está importado: siete u ocho RA con sus
    // criterios, no cuatro de muestra.
    const reales = ponderacionesImportadas(unidadId);
    if (reales) return reales;

    const h = hash('pond|' + unidadId);
    const cuadra = h % 3 !== 0;
    const base = [
      { num: 1, texto: 'Analiza y planifica la intervención sobre los requisitos del proyecto.' },
      { num: 2, texto: 'Desarrolla los componentes previstos aplicando las técnicas del módulo.' },
      { num: 3, texto: 'Integra servicios y datos verificando su funcionamiento.' },
      { num: 4, texto: 'Documenta y verifica el resultado del trabajo realizado.' },
    ];
    const pesos = cuadra ? [25, 30, 25, 20] : [25, 30, 25, 15];
    return base.map((ra, k) => {
      const peso = pesos[k];
      // en la unidad descuadrada, los CE del último RA suman más que su RA
      const descuadreCE = !cuadra && k === 3;
      const pesosCE = descuadreCE ? [12, 8] : [Math.round(peso * 0.4), peso - Math.round(peso * 0.4)];
      return Object.assign({}, ra, {
        peso,
        ce: [
          { letra: 'a', texto: 'Identifica los elementos necesarios y justifica la solución elegida.', peso: pesosCE[0] },
          { letra: 'b', texto: 'Aplica el procedimiento y comprueba el resultado obtenido.', peso: pesosCE[1] },
        ],
      });
    });
  }

  // Resultados de aprendizaje sin situación de aprendizaje asociada
  function raSinSituacion(unidadId) {
    // Con fichas de situación de aprendizaje de verdad, la cuenta sale de ellas.
    const SA = global.SA;
    if (SA && SA.listar(unidadId).length) return SA.raSinSituacion(unidadId);

    const h = hash('sa|' + unidadId);
    return h % 4 === 0 ? [3] : [];
  }

  // ---------------------------------------------------------------- comentarios
  function comentarios(docId, nodo) {
    const clave = claveDe(docId, nodo);
    return (guardado.comentarios[clave] || []).slice();
  }

  function comentar(docId, nodo, autor, texto) {
    const clave = claveDe(docId, nodo);
    const lista = guardado.comentarios[clave] || [];
    lista.push({ autor, texto, fecha: Date.now() });
    guardado.comentarios[clave] = lista;
    guardar();
    return lista;
  }

  // ---------------------------------------------------------------- asignaciones
  function asignarUnidades(usuarioId, unidades) {
    const u = usuario(usuarioId);
    if (!u) return;
    u.unidades = unidades.slice();
    guardado.asignaciones[usuarioId] = u.unidades.slice();
    guardar();
  }

  global.Contenido = {
    COMPARTIDOS, SECCIONES_COMPARTIDAS, DESVINCULADOS, USUARIOS,
    cargar, guardar, reiniciar, usuario, docentesDe,
    apartado, escribir, guardarBloques, marcarRevisado, claveDe,
    ponderaciones, raSinSituacion,
    comentarios, comentar, asignarUnidades,
    hash, copia,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
