// Estructura REAL de los documentos de docs/entrada_ej/ (extraída con mammoth / el importador).
// Datos estáticos para el mockup: sin dependencias, se carga con un <script> normal.

const MODULOS_SUB = [
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

const MODULOS = {
  daw: {
    '2026-27': {
      primer: ['Lenguaje de Marcas y Sistemas de Gestión de Información', 'Sistemas Informáticos', 'Base de datos', 'Programación', 'Entornos de desarrollo'],
      segundo: ['Desarrollo web en entorno cliente', 'Desarrollo web en entorno servidor', 'Despliegue de aplicaciones web', 'Diseño de interfaces web', 'Sostenibilidad aplicada al sistema productivo', 'Digitalización Aplicada a los Sectores Productivos'],
    },
    '2025-26': {
      primer: ['Lenguaje de Marcas y Sistemas de Gestión de Información', 'Sistemas Informáticos', 'Base de datos', 'Programación', 'Entornos de desarrollo'],
      segundo: ['Desarrollo web en entornos cliente', 'Desarrollo web en entorno servidor', 'Despliegue de aplicaciones web', 'Diseño de interfaces web', 'Sostenibilidad aplicada a los sectores productivos', 'Digitalización Aplicada a los Sectores Productivos'],
    },
  },
  smr: {
    '2026-27': {
      primer: ['Montaje y Mantenimiento de equipos', 'Aplicaciones ofimáticas', 'Sistemas operativos monopuesto', 'Redes Locales'],
      segundo: ['Sistemas operativos en red', 'Servicios en red', 'Aplicaciones web', 'Seguridad informática', 'Digitalización aplicada a los sectores productivos I', 'Sostenibilidad aplicada al sistema productivo', 'Introducción a la programación'],
    },
    '2025-26': {
      primer: ['Montaje y Mantenimiento de equipos', 'Aplicaciones ofimáticas', 'Sistemas operativos monopuesto', 'Redes Locales'],
      segundo: ['Sistemas operativos en red', 'Servicios en red', 'Aplicaciones web', 'Seguridad informática', 'Digitalización aplicada a los sectores productivos I', 'Sostenibilidad aplicada a los sectores productivos', 'Introducción a la programación'],
    },
  },
};

// Módulos que el docente Ernesto Montero puede editar en el mockup
const MODULOS_DEL_DOCENTE = ['Despliegue de aplicaciones web', 'Redes Locales'];

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
  { t: 'MÓDULOS DEL PRIMER CURSO', n: '9', tipo: 'modulos', curso: 'primer' },
  { t: 'MÓDULOS DEL SEGUNDO CURSO', n: '10', tipo: 'modulos', curso: 'segundo' },
  { t: 'Resultados de aprendizaje dualizables', n: '11' },
];

const DOCUMENTOS = {
  memoria: { id: 'memoria', nombre: 'Memoria del Departamento', corto: 'Memoria', icono: 'libro', ciclo: false, apartados: MEMORIA, tipo: 'memoria' },
  pccf: { id: 'pccf', nombre: 'Proyecto Curricular del Ciclo Formativo', corto: 'PCCF', icono: 'escudo', ciclo: true, apartados: PCCF, tipo: 'pccf' },
  pd: { id: 'pd', nombre: 'Programación Didáctica', corto: 'PD', icono: 'libro', ciclo: true, apartados: PD, tipo: 'pd' },
};

const ORDEN_DOCS = ['memoria', 'pccf', 'pd'];
const CICLOS = [{ id: 'smr', nombre: 'SMR', largo: 'Sistemas Microinformáticos y Redes' }, { id: 'daw', nombre: 'DAW', largo: 'Desarrollo de Aplicaciones Web' }];

// ------------------------------------------------------------------ constructor del árbol
function nodo(base) {
  return Object.assign({ hijos: [] }, base);
}

function montarHijos(lista, prefijo, edita, moduloId) {
  return (lista || []).map((x, i) => {
    const n = nodo({
      titulo: x.t, num: x.n || null, edita, tipo: 'apartado',
      id: prefijo + '/' + i, moduloId: moduloId || null,
    });
    n.hijos = montarHijos(x.h, n.id, edita, moduloId);
    return n;
  });
}

function montarModulos(ciclo, curso, mitad, prefijo) {
  const porCurso = (MODULOS[ciclo] || {})[curso] || { primer: [], segundo: [] };
  return (porCurso[mitad] || []).map((nombre, i) => {
    const n = nodo({
      titulo: nombre, num: null, tipo: 'modulo', edita: 'modulo',
      id: prefijo + '/' + i, moduloId: nombre,
    });
    n.hijos = montarHijos(MODULOS_SUB, n.id, 'modulo', nombre);
    return n;
  });
}

// Árbol completo de un documento: { id, titulo, tipo, edita, hijos }
function arbolDocumento(docId, ciclo, curso) {
  const doc = DOCUMENTOS[docId];
  const raiz = nodo({ titulo: doc.nombre, tipo: 'raiz', edita: 'comun', id: docId });
  raiz.hijos = doc.apartados.map((a, i) => {
    const n = nodo({ titulo: a.t, num: a.n || null, tipo: 'apartado', edita: 'comun', id: docId + '/' + i });
    if (a.tipo === 'modulos') {
      n.tipo = 'modulos';
      n.hijos = montarModulos(ciclo || 'daw', curso, a.curso, n.id);
    } else {
      n.hijos = montarHijos(a.h, n.id, 'comun', null);
    }
    return n;
  });
  return raiz;
}

// Recorre el árbol en profundidad, devolviendo el camino de nodos
function aplanar(raiz) {
  const out = [];
  (function rec(n, camino) {
    const p = [...camino, n];
    out.push({ nodo: n, camino: p });
    n.hijos.forEach((h) => rec(h, p));
  })(raiz, []);
  return out;
}

window.DATOS = { DOCUMENTOS, ORDEN_DOCS, CICLOS, MODULOS, MODULOS_DEL_DOCENTE, arbolDocumento, aplanar };
