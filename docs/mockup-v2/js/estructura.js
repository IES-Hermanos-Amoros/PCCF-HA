// Estructura de los documentos: los mismos árboles de apartados que extrajo el v1
// de los .docx de docs/entrada_ej/ (títulos de apartados y de materias, nada de
// cuerpo ni datos personales), con dos cambios respecto a aquel:
//
//  1. cada nodo se identifica por su SLUG, no por su posición. El v1 usaba
//     `pd/9/2/0`, que se rompe en cuanto se inserta un apartado; aquí el id es
//     `modulos/desarrollo-curricular/competencias-y-objetivos`, igual que los ids
//     que ya produce el importador en plantilla.json. Así los enlaces, los
//     comentarios y el historial sobreviven a una reordenación.
//
//  2. los apartados de una unidad (módulo o materia) NO se duplican por unidad:
//     el id de sección es el mismo para los 11 módulos y la unidad va aparte, en
//     `unidadId`. Es exactamente el par (seccion, instancia) del motor de
//     poc-pdfmake/, y lo que permite que un texto compartido se defina una vez.
//
// `edita` usa el vocabulario del motor ('jefe_departamento' | 'docentes_del_modulo')
// para que js/permisos.js pueda ser un puerto literal de poc-pdfmake/lib/permisos.js.

(function (global) {
  'use strict';

  const U = global.Unidades;
  const Pl = global.Plantilla;

  // ---------------------------------------------------------------- apartados de cada unidad
  const SUB_MODULO = [
    { t: 'Propuestas de mejora del curso anterior' },
    { t: 'Identificación del módulo / unidad formativa' },
    { t: 'Desarrollo curricular', h: [
      { t: 'Competencias y Objetivos' },
      { t: 'Resultados de aprendizaje y Criterios de evaluación' },
      { t: 'Contenidos básicos de referencia del módulo' },
    ] },
    { t: 'Metodología específica', h: [
      { t: 'Estrategias metodológicas' },
      { t: 'Programa plurilingüe' },
      { t: 'Recursos específicos' },
    ] },
    { t: 'Situaciones de aprendizaje' },
    { t: 'Relación con otros módulos' },
    { t: 'Evaluación y calificación', h: [
      { t: 'Instrumentos de evaluación' },
      { t: 'Criterios de evaluación' },
      { t: 'Criterios de calificación' },
      { t: 'Recuperación de los resultados de aprendizaje' },
      { t: 'Alumnado con el módulo pendiente de cursos anteriores' },
    ] },
    { t: 'Ponderaciones de los Resultados de aprendizaje y los Criterios de evaluación' },
  ];

  // Apartados de cada materia de ESO y Bachillerato, por id de unidad. Un hijo con
  // `unidad` es un bloque con permiso propio (PIAR I y II) y abre su propia unidad.
  const SUB_MATERIA = {
    'eso-trds': [
      { t: 'Competencias específicas' }, { t: 'Criterios de evaluación' }, { t: 'Saberes básicos' },
      { t: 'Situaciones de aprendizaje' }, { t: 'Evaluación del alumnado' },
    ],
    'eso-piar': [
      { t: 'Competencias específicas' }, { t: 'Criterios de evaluación' }, { t: 'Saberes básicos' },
      { unidad: 'eso-piar-1', h: [{ t: 'Situaciones de aprendizaje' }, { t: 'Desarrollo de los criterios de evaluación' }] },
      { unidad: 'eso-piar-2', h: [{ t: 'Situaciones de aprendizaje' }, { t: 'Desarrollo de los criterios de evaluación' }] },
    ],
    'eso-digi': [
      { t: 'Competencias específicas' }, { t: 'Criterios de evaluación' }, { t: 'Saberes básicos' },
      { t: 'Situaciones de aprendizaje' }, { t: 'Desarrollo de los criterios de evaluación' },
    ],
    'eso-videojuegos': [
      { t: 'Competencias específicas' }, { t: 'Criterios de evaluación' }, { t: 'Saberes básicos' },
      { t: 'Situaciones de aprendizaje' }, { t: 'Evaluación del alumnado' },
    ],
    'bach-inf1': [
      { t: 'Criterios de evaluación' }, { t: 'Saberes básicos' },
      { t: 'Situaciones de aprendizaje' }, { t: 'Desarrollo de los criterios de evaluación' },
    ],
    'bach-inf2': [
      { t: 'Competencias específicas' }, { t: 'Criterios de evaluación' }, { t: 'Saberes básicos' },
    ],
    'bach-prsi2': [
      { t: 'Competencias específicas' }, { t: 'Criterios de evaluación' }, { t: 'Saberes básicos' },
      { t: 'Situaciones de aprendizaje' }, { t: 'Desarrollo de los criterios de evaluación' },
    ],
  };

  // ---------------------------------------------------------------- Memoria del departamento
  const MEMORIA = [
    { t: 'Profesorado del departamento', h: [
      { t: 'Profesores del departamento' },
      { t: 'Carga lectiva de los profesores' },
      { t: 'Observaciones sobre la carga horaria' },
    ] },
    { t: 'Docencia en ESO y Bachillerato', h: [
      { t: 'Grupos de alumnos y estadísticas de ESO y bachillerato' },
      { t: 'Evolución histórica de las estadísticas' },
      { t: 'Alumnado con asignaturas pendientes de cursos anteriores' },
      { t: 'Alumnado con necesidades específicas de apoyo educativo (NEAE)' },
      { t: 'Asignaturas en el Plan Lingüístico del Centro' },
      { t: 'Valoración de la docencia', h: [
        { t: 'Grado de consecución de los objetivos marcados' },
        { t: 'Valoración de la metodología empleada' },
        { t: 'Valoración de los métodos de evaluación utilizados' },
        { t: 'Valoración del material utilizado' },
        { t: 'Relaciones con otras asignaturas' },
      ] },
      { t: 'Actividades complementarias y extraescolares realizadas' },
      { t: 'Dificultades encontradas' },
    ] },
    { t: 'Docencia en Ciclos Formativos', h: [
      { t: 'Ciclos formativos de informática' },
      { t: 'Grupos de alumnos y estadísticas de los grupos' },
      { t: 'Alumnado con módulos pendientes de cursos anteriores' },
      { t: 'Alumnado con necesidades específicas de apoyo educativo (NEAE)' },
      { t: 'Módulos en el Plan Lingüístico del Centro', h: [{ t: 'Valenciano' }, { t: 'Inglés' }] },
      { t: 'Valoración de la docencia', h: [
        { t: 'Grado de consecución de los objetivos marcados' },
        { t: 'Valoración de la metodología empleada' },
        { t: 'Valoración de los métodos de evaluación utilizados' },
        { t: 'Valoración del material utilizado' },
        { t: 'Relaciones con otras asignaturas' },
        { t: 'Actividades complementarias y extraescolares realizadas' },
      ] },
      { t: 'Dificultades encontradas' },
      { t: 'Formación en Centros de Trabajo General (FE G)' },
      { t: 'Formación en Empresa Intensiva (FE Intensiva)' },
      { t: 'Cuestionario sobre la valoración e inserción de la formación' },
    ] },
    { t: 'Mejora de la práctica docente', h: [
      { t: 'Seguimiento de los objetivos de mejora para este curso' },
      { t: 'Evaluación de la práctica docente' },
      { t: 'Propuestas de Mejora para el próximo curso' },
      { t: 'Reuniones de Departamento Realizadas' },
    ] },
    { t: 'Solicitudes de instalaciones y equipamiento' },
  ];

  // ---------------------------------------------------------------- PCCF
  const PCCF = [
    { t: 'Introducción', n: '0' },
    { t: 'Identificación del ciclo formativo', n: '1', h: [{ t: 'Denominación oficial del ciclo formativo' }] },
    { t: 'Acuerdos generales', n: '2', h: [
      { t: 'Adecuación de las competencias profesionales al contexto socioeconómico y cultural del centro', n: '2.1' },
      { t: 'Contribución de cada módulo a las competencias profesionales del ciclo', n: '2.2' },
      { t: 'Contribución de cada módulo a las competencias para la empleabilidad', n: '2.3' },
      { t: 'Enfoques didácticos y metodológicos', n: '2.4', h: [{ t: 'Estrategias metodológicas', n: '2.4.1' }] },
      { t: 'Organización y distribución de los módulos profesionales', n: '2.5', h: [{ t: 'Distribución de los resultados de aprendizaje en modalidad dual', n: '2.5.1' }] },
      { t: 'Criterios generales sobre la organización, comunicación y desarrollo del proceso de evaluación del aprendizaje', n: '2.6' },
      { t: 'Base de datos de empresas u organismos equiparados que colaboran con el PCCF', n: '2.7', h: [{ t: 'Criterios de asignación', n: '2.7.1' }] },
      { t: 'Criterios para la realización de los planes formativos individuales', n: '2.8' },
      { t: 'Criterios para adaptar los módulos de sostenibilidad y digitalización', n: '2.9' },
      { t: 'El plan de tutoría y orientación profesional', n: '2.10' },
      { t: 'Concreción de los planes y programas del centro vinculados al currículo', n: '2.11' },
      { t: 'Orientaciones para el uso de espacios, medios y equipamientos disponibles', n: '2.12' },
      { t: 'Criterios y procedimientos para la evaluación y revisión de la práctica docente', n: '2.13' },
    ] },
    { t: 'Atención a la diversidad', n: '3' },
    { t: 'Otros aspectos relevantes', n: '4' },
  ];

  // ---------------------------------------------------------------- PD de FP
  const PD = [
    { t: 'Introducción', n: '1', h: [
      { t: 'Justificación de la programación' },
      { t: 'Contextualización de la docencia' },
      { t: 'Identificación y legislación aplicable' },
    ] },
    { t: 'Competencias del ciclo', n: '2', h: [
      { t: 'Competencia general del título', n: '2.1' },
      { t: 'Competencias profesionales para la empleabilidad', n: '2.2' },
      { t: 'Unidades de competencia', n: '2.3' },
    ] },
    { t: 'Objetivos generales del ciclo', n: '3' },
    { t: 'Elementos transversales', n: '4', h: [
      { t: 'Refuerzo de la comprensión lectora y fomento de la lectura', n: '4.1' },
      { t: 'Fomento de las habilidades de comunicación', n: '4.2' },
      { t: 'Uso eficaz de las TIC', n: '4.3' },
      { t: 'Iniciativa emprendedora', n: '4.4' },
      { t: 'Educación cívica, autoconocimiento y hábitos saludables', n: '4.5' },
      { t: 'Convivencia e igualdad', n: '4.6' },
    ] },
    { t: 'Metodología y orientaciones didácticas', n: '5', h: [
      { t: 'Metodología general', n: '5.1' },
      { t: 'Principios metodológicos', n: '5.2' },
      { t: 'Agrupación del alumnado', n: '5.3' },
      { t: 'Fases de las situaciones de aprendizaje', n: '5.4' },
      { t: 'Programa plurilingüe', n: '5.5' },
      { t: 'Recursos didácticos y organizativos', n: '5.6' },
      { t: 'Actividades de refuerzo y ampliación', n: '5.7' },
      { t: 'Actividades complementarias', n: '5.8' },
      { t: 'Actividades extraescolares', n: '5.9' },
    ] },
    { t: 'Atención a la diversidad y educación inclusiva', n: '6', h: [{ t: 'Evaluación inicial de los grupos', n: '6.1' }] },
    { t: 'Evaluación del alumnado', n: '7', h: [
      { t: 'Criterios de Evaluación', n: '7.1' },
      { t: 'Tipos de evaluación', n: '7.2' },
      { t: 'Instrumentos de evaluación', n: '7.3' },
    ] },
    { t: 'Evaluación de la práctica docente', n: '8', h: [
      { t: 'Instrumentos de recogida de datos', n: '8.1' },
      { t: 'Medidas de mejora', n: '8.2' },
    ] },
    { t: 'MÓDULOS DEL PRIMER CURSO', n: '9', unidades: 'primer', prefijo: 'modulos' },
    { t: 'MÓDULOS DEL SEGUNDO CURSO', n: '10', unidades: 'segundo', prefijo: 'modulos' },
    { t: 'Resultados de aprendizaje dualizables', n: '11' },
  ];

  // ---------------------------------------------------------------- PD de ESO
  const ESO = [
    { t: 'Contexto curricular de las materias', n: '1', h: [
      { t: 'Elementos curriculares de la ESO', n: '1.1', h: [
        { t: 'Objetivos Generales de la ESO', n: '1.1.1' },
        { t: 'Perfil de salida de la ESO', n: '1.1.2' },
        { t: 'Competencias clave y descriptores operativos de la ESO', n: '1.1.3' },
        { t: 'Competencias específicas', n: '1.1.4' },
        { t: 'Situaciones de aprendizaje', n: '1.1.5' },
      ] },
      { t: 'Metodología y orientaciones didácticas', n: '1.2', h: [
        { t: 'Recursos didácticos y organizativos', n: '1.2.1' },
        { t: 'Actividades complementarias y extraescolares', n: '1.2.2' },
      ] },
      { t: 'Evaluación del alumnado', n: '1.3', h: [
        { t: 'Instrumentos de evaluación', n: '1.3.1' },
        { t: 'Actividades evaluables', n: '1.3.2' },
        { t: 'Criterios de calificación', n: '1.3.3' },
        { t: 'Criterios de recuperación', n: '1.3.4' },
        { t: 'Alumnado con materias pendientes', n: '1.3.5' },
      ] },
      { t: 'Elementos transversales', n: '1.4' },
      { t: 'Medidas de respuesta para la inclusión del alumnado', n: '1.5', h: [
        { t: 'Alumnado con necesidades específicas de apoyo educativo', n: '1.5.1' },
        { t: 'Respuesta educativa en el aula', n: '1.5.2' },
      ] },
    ] },
    { t: 'Concreción curricular de las materias', n: '2', corto: 'CCM', unidades: 'eso', prefijo: 'materias' },
  ];

  // ---------------------------------------------------------------- PD de Bachillerato
  const BACH = [
    { t: 'Elementos curriculares del Bachillerato', n: '1', h: [
      { t: 'Objetivos Generales del Bachillerato', n: '1.1' },
      { t: 'Competencias clave y descriptores operativos del Bachillerato', n: '1.2' },
      { t: 'Competencias específicas', n: '1.3' },
      { t: 'Situaciones de aprendizaje', n: '1.4' },
    ] },
    { t: 'Metodología y orientaciones didácticas', n: '2', h: [
      { t: 'Recursos didácticos y organizativos', n: '2.1' },
      { t: 'Actividades complementarias y extraescolares', n: '2.2' },
    ] },
    { t: 'Evaluación del alumnado', n: '3', h: [
      { t: 'Criterios de calificación', n: '3.1' },
      { t: 'Criterios de recuperación', n: '3.2' },
      { t: 'Alumnado con materias pendientes', n: '3.3' },
    ] },
    { t: 'Elementos transversales', n: '4' },
    { t: 'Medidas de respuesta para la inclusión del alumnado', n: '5', h: [
      { t: 'Alumnado con necesidades específicas de apoyo educativo', n: '5.1' },
      { t: 'Respuesta educativa en el aula', n: '5.2' },
    ] },
    // "Organización de los dos cursos" se queda dentro de CCM, como en el documento
    { t: 'Concreción curricular de las materias', n: '6', corto: 'CCM', unidades: 'bach', prefijo: 'materias',
      h: [{ t: 'Organización de los dos cursos', n: '6.1' }] },
    { t: 'Evaluación de la práctica docente', n: '7', h: [
      { t: 'Instrumentos de recogida de datos', n: '7.1' },
    ] },
  ];

  // ---------------------------------------------------------------- registro de documentos
  // Un documento del mockup es (tipo, ámbito): la app real añade el curso y el
  // estado, y son filas de la colección `documentos`.
  const DOCUMENTOS = [
    { id: 'memoria', tipo: 'memoria', nombre: 'Memoria del Departamento', corto: 'Memoria', icono: 'libro', apartados: MEMORIA },
    { id: 'pccf-smr', tipo: 'pccf', nombre: 'PCCF · Sistemas Microinformáticos y Redes', corto: 'PCCF SMR', icono: 'escudo', ciclo: 'smr', apartados: PCCF },
    { id: 'pccf-daw', tipo: 'pccf', nombre: 'PCCF · Desarrollo de Aplicaciones Web', corto: 'PCCF DAW', icono: 'escudo', ciclo: 'daw', apartados: PCCF },
    { id: 'pd-fp-smr', tipo: 'pd', nombre: 'PD · Sistemas Microinformáticos y Redes', corto: 'PD SMR', icono: 'libro', rama: 'fp', ciclo: 'smr', apartados: PD },
    { id: 'pd-fp-daw', tipo: 'pd', nombre: 'PD · Desarrollo de Aplicaciones Web', corto: 'PD DAW', icono: 'libro', rama: 'fp', ciclo: 'daw', apartados: PD },
    { id: 'pd-eso', tipo: 'pd', nombre: 'PD · Educación Secundaria Obligatoria', corto: 'PD ESO', icono: 'libro', rama: 'eso-bach', ambito: 'eso', apartados: ESO },
    { id: 'pd-bach', tipo: 'pd', nombre: 'PD · Bachillerato', corto: 'PD Bachillerato', icono: 'libro', rama: 'eso-bach', ambito: 'bach', apartados: BACH },
  ];

  const documento = (id) => DOCUMENTOS.find((d) => d.id === id) || null;

  // Agrupación del árbol: tipo de documento y, en la PD, rama intermedia.
  const GRUPOS = [
    { id: 'memoria', nombre: 'Memoria', docs: ['memoria'] },
    { id: 'pccf', nombre: 'PCCF', docs: ['pccf-smr', 'pccf-daw'] },
    { id: 'pd', nombre: 'PD', ramas: [
      { id: 'fp', nombre: 'FP', docs: ['pd-fp-smr', 'pd-fp-daw'] },
      { id: 'eso-bach', nombre: 'ESO-BACH', docs: ['pd-eso', 'pd-bach'] },
    ] },
  ];

  // ---------------------------------------------------------------- slugs
  const ACENTOS = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', ñ: 'n', ç: 'c' };

  function slug(texto) {
    return String(texto).toLowerCase()
      .replace(/[áéíóúüñç]/g, (c) => ACENTOS[c])
      .replace(/[·–—]/g, ' ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
  }

  // ---------------------------------------------------------------- constructor del árbol
  function nodo(base) {
    return Object.assign({
      titulo: '', num: null, corto: null, tipo: 'apartado',
      seccion: null, unidadId: null, edita: 'jefe_departamento', hijos: [],
    }, base);
  }

  // Clave única en el DOM y en el índice: la sección sola se repite entre unidades.
  const clave = (n) => (n.unidadId ? n.unidadId + '::' + (n.seccion || '') : (n.seccion || n.id || ''));

  // Último tramo del id de una sección: es su id "local" entre sus hermanos, y
  // lo que js/plantilla.js usa para ordenarlos y para no repetir ids.
  const idLocal = (seccion) => String(seccion || '').split('/').pop();

  // El título que toca pintar: el renombrado por el departamento si lo hay, y si
  // no, el que venía del documento importado. El id nunca cambia.
  const tituloDe = (docId, seccion, original) => Pl.titulo(docId, seccion) || original;

  // Hijos de un apartado: los que trae la plantilla importada, más los que haya
  // añadido el departamento, en el orden que se haya fijado y sin los retirados.
  function componer(docId, padre, base, construirExtra) {
    const extras = Pl.extrasDe(docId, padre).map(construirExtra);
    const todos = Pl.aplicarOrden(docId, padre, base.concat(extras), (n) => idLocal(n.seccion));
    return todos.filter((n) => !Pl.estaRetirado(docId, n.seccion));
  }

  // Apartados de dentro de una unidad: comparten id de sección entre todas las
  // unidades (es el par seccion+instancia del motor). Un apartado añadido aquí
  // aparece en los 11 módulos, porque lo que se cambia es la plantilla.
  function ramaUnidad(docId, lista, prefijo, unidadId) {
    const base = (lista || []).map((x) => {
      if (x.unidad) {
        // bloque con permiso propio: abre su propia unidad y su propio prefijo
        const u = U.unidad(x.unidad);
        const pref = prefijo + '/' + slug(u.titulo);
        const n = nodo({
          titulo: tituloDe(docId, pref, u.titulo), tipo: 'unidad', unidadId: x.unidad,
          seccion: pref, edita: 'docentes_del_modulo',
        });
        n.hijos = ramaUnidad(docId, x.h, pref, x.unidad);
        n.clave = clave(n);
        return n;
      }
      const sec = prefijo + '/' + slug(x.t);
      const n = nodo({
        titulo: tituloDe(docId, sec, x.t), num: x.n || null, seccion: sec, unidadId,
        edita: 'docentes_del_modulo',
      });
      n.hijos = ramaUnidad(docId, x.h, sec, unidadId);
      n.clave = clave(n);
      return n;
    });

    return componer(docId, prefijo, base, (ex) => {
      const sec = prefijo + '/' + ex.id;
      const n = nodo({
        titulo: tituloDe(docId, sec, ex.titulo), seccion: sec, unidadId,
        edita: 'docentes_del_modulo', anadido: true,
      });
      n.hijos = ramaUnidad(docId, [], sec, unidadId);
      n.clave = clave(n);
      return n;
    });
  }

  // Apartados comunes
  function ramaComun(docId, lista, prefijo) {
    const base = (lista || []).map((x) => {
      const sec = prefijo ? prefijo + '/' + slug(x.t) : slug(x.t);
      const n = nodo({
        titulo: tituloDe(docId, sec, x.t), num: x.n || null, seccion: sec,
        edita: 'jefe_departamento',
      });
      n.hijos = ramaComun(docId, x.h, sec);
      n.clave = clave(n);
      return n;
    });

    return componer(docId, prefijo, base, (ex) => {
      const sec = prefijo ? prefijo + '/' + ex.id : ex.id;
      const n = nodo({
        titulo: tituloDe(docId, sec, ex.titulo), seccion: sec,
        edita: 'jefe_departamento', anadido: true,
      });
      n.hijos = ramaComun(docId, [], sec);
      n.clave = clave(n);
      return n;
    });
  }

  // Unidades que pinta un bloque `unidades` de un documento
  function unidadesDelBloque(doc, cual) {
    if (cual === 'primer' || cual === 'segundo') return U.deCiclo(doc.ciclo, cual);
    return U.deAmbito(cual);
  }

  function construirArbol(docId, curso) {
    const doc = documento(docId);
    if (!doc) return null;
    const raiz = nodo({ titulo: doc.nombre, tipo: 'raiz', seccion: null, edita: 'jefe_departamento' });
    raiz.docId = docId;
    raiz.clave = docId;

    const base = doc.apartados.map((a) => {
      const sec = slug(a.t);
      const n = nodo({
        titulo: tituloDe(docId, sec, a.t), num: a.n || null,
        corto: a.corto || null, seccion: sec,
      });

      if (!a.unidades) {
        n.hijos = ramaComun(docId, a.h, sec);
        n.clave = clave(n);
        return n;
      }

      // bloque de unidades: primero los apartados comunes que lleve (p. ej.
      // "Organización de los dos cursos" en Bachillerato) y luego las unidades
      n.tipo = 'bloque';
      n.hijos = ramaComun(docId, a.h, sec);
      unidadesDelBloque(doc, a.unidades).forEach((u) => {
        const pref = a.prefijo;
        const un = nodo({
          titulo: U.tituloDe(u, curso), tipo: 'unidad', unidadId: u.id,
          seccion: pref, edita: 'docentes_del_modulo',
        });
        un.hijos = a.unidades === 'primer' || a.unidades === 'segundo'
          ? ramaUnidad(docId, SUB_MODULO, pref, u.id)
          : ramaUnidad(docId, SUB_MATERIA[u.id] || [], pref, u.id);
        un.clave = clave(un);
        n.hijos.push(un);
      });
      n.clave = clave(n);
      return n;
    });

    raiz.hijos = componer(docId, '', base, (ex) => {
      const n = nodo({ titulo: tituloDe(docId, ex.id, ex.titulo), seccion: ex.id, anadido: true });
      n.hijos = ramaComun(docId, [], ex.id);
      n.clave = clave(n);
      return n;
    });
    return raiz;
  }

  // Recorrido en profundidad: devuelve [{ nodo, camino }] en orden de lectura.
  function aplanar(raiz) {
    const out = [];
    (function rec(n, camino) {
      const p = camino.concat([n]);
      out.push({ nodo: n, camino: p });
      n.hijos.forEach((h) => rec(h, p));
    })(raiz, []);
    return out;
  }

  // La "plantilla" que espera el motor de poc-pdfmake/lib/permisos.js: secciones
  // anidadas con su `edita`, que es lo que en la app real sale de plantilla.json.
  //
  // No es un espejo del árbol de navegación: ahí el bloque "MÓDULOS DEL PRIMER
  // CURSO" es un nodo de paso (`modulos-del-primer-curso`) mientras que los
  // apartados de sus módulos viven bajo `modulos`, compartidos con los del
  // segundo curso. Así que la plantilla se reconstruye agrupando por ruta, para
  // que el `contiene()` del motor (prefijo + '/') case con los ids reales.
  function plantillaDe(raiz) {
    const porRuta = new Map();
    aplanar(raiz).forEach(({ nodo: n }) => {
      if (!n.seccion || n.tipo === 'raiz') return;
      // una misma sección la pintan varias unidades: basta registrarla una vez
      if (!porRuta.has(n.seccion)) porRuta.set(n.seccion, n.edita);
    });

    const raices = [];
    const indice = new Map();
    [...porRuta.keys()].sort().forEach((ruta) => {
      const sec = { id: ruta, edita: porRuta.get(ruta), hijos: [] };
      indice.set(ruta, sec);
      const corte = ruta.lastIndexOf('/');
      const padre = corte === -1 ? null : indice.get(ruta.slice(0, corte));
      (padre ? padre.hijos : raices).push(sec);
    });
    return { secciones: raices };
  }

  // Ruta de una seccion a partir de los titulos, para que nadie tenga que
  // escribir un slug a mano: `slug()` recorta a 60 caracteres y una constante
  // copiada del titulo completo no casaria nunca.
  //   ruta('modulos', 'Situaciones de aprendizaje') -> 'modulos/situaciones-de-aprendizaje'
  const ruta = (prefijo, ...titulos) => [prefijo].concat(titulos.map(slug)).filter(Boolean).join('/');

  global.Estructura = {
    DOCUMENTOS, GRUPOS, SUB_MODULO, SUB_MATERIA,
    documento, slug, ruta, construirArbol, aplanar, plantillaDe, clave, idLocal,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
