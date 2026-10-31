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

// Unidades (módulos FP, materias ESO/Bach y bloques propios) que cada perfil
// de docente puede editar. El admin puede cambiar estas listas desde el
// panel "Permisos" de la barra superior (se guardan en localStorage).
const PERFILES = {
  docente: ['Despliegue de aplicaciones web', 'Redes Locales'],
  docente_mixto: [
    'Lenguaje de Marcas y Sistemas de Gestión de Información', 'Seguridad informática',
    'Primer curso – PIAR I', 'Segundo curso – PIAR II',
    'Digitalización (4º ESO)', 'Segundo curso – PRSI II',
  ],
};

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

// ------------------------------------------------------------------ ESO y Bachillerato (PP de ESO y Bachiller)
// Estructura REAL de las propuestas pedagógicas de docs/entrada_ej/2026-27/
// (títulos de apartados y materias; sin texto de cuerpo ni datos personales).
// La "Concreción curricular de las materias" (abreviada CCM en el menú) hace
// el mismo papel que los bloques de módulos de FP: su desglose son materias.

const MATERIAS = {
  eso: [
    { t: 'Taller de Relaciones Digitales Saludables (1º ESO)', h: [
      { t: 'Competencias específicas' },
      { t: 'Criterios de evaluación' },
      { t: 'Saberes básicos' },
      { t: 'Situaciones de aprendizaje' },
      { t: 'Evaluación del alumnado' },
    ] },
    { t: 'Programación, Inteligencia Artificial y Robótica (2º y 3º ESO)', h: [
      { t: 'Competencias específicas' },
      { t: 'Criterios de evaluación' },
      { t: 'Saberes básicos' },
      // `propio: true` → el bloque y su subárbol usan su propio título como
      // clave de permiso (independiente de la materia que los contiene).
      { t: 'Primer curso – PIAR I', propio: true, h: [
        { t: 'Situaciones de aprendizaje' },
        { t: 'Desarrollo de los criterios de evaluación' },
      ] },
      { t: 'Segundo curso – PIAR II', propio: true, h: [
        { t: 'Situaciones de aprendizaje' },
        { t: 'Desarrollo de los criterios de evaluación' },
      ] },
    ] },
    { t: 'Digitalización (4º ESO)', h: [
      { t: 'Competencias específicas' },
      { t: 'Criterios de evaluación' },
      { t: 'Saberes básicos' },
      { t: 'Situaciones de aprendizaje' },
      { t: 'Desarrollo de los criterios de evaluación' },
    ] },
    { t: 'Taller de Profundización en Desarrollo de Videojuegos (4º ESO)', h: [
      { t: 'Competencias específicas' },
      { t: 'Criterios de evaluación' },
      { t: 'Saberes básicos' },
      { t: 'Situaciones de aprendizaje' },
      { t: 'Evaluación del alumnado' },
    ] },
  ],
  bach: [
    { t: 'Primer curso – Informática I', h: [
      { t: 'Criterios de evaluación' },
      { t: 'Saberes básicos' },
      { t: 'Situaciones de aprendizaje' },
      { t: 'Desarrollo de los criterios de evaluación' },
    ] },
    { t: 'Segundo curso – Informática II', h: [
      { t: 'Competencias específicas' },
      { t: 'Criterios de evaluación' },
      { t: 'Saberes básicos' },
    ] },
    { t: 'Segundo curso – PRSI II', h: [
      { t: 'Competencias específicas' },
      { t: 'Criterios de evaluación' },
      { t: 'Saberes básicos' },
      { t: 'Situaciones de aprendizaje' },
      { t: 'Desarrollo de los criterios de evaluación' },
    ] },
  ],
};

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
  { t: 'Concreción curricular de las materias', n: '2', corto: 'CCM', tipo: 'modulos', materias: 'eso' },
];

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
  { t: 'Concreción curricular de las materias', n: '6', corto: 'CCM', tipo: 'modulos',
    h: [{ t: 'Organización de los dos cursos', n: '6.1' }], materias: 'bach' },
  { t: 'Evaluación de la práctica docente', n: '7', h: [
    { t: 'Instrumentos de recogida de datos', n: '7.1' },
  ] },
];

const DOCUMENTOS = {
  memoria: { id: 'memoria', nombre: 'Memoria del Departamento', corto: 'Memoria', icono: 'libro', ciclo: false, apartados: MEMORIA, tipo: 'memoria' },
  pccf: { id: 'pccf', nombre: 'Proyecto Curricular del Ciclo Formativo', corto: 'PCCF', icono: 'escudo', ciclo: true, apartados: PCCF, tipo: 'pccf' },
  pd: { id: 'pd', nombre: 'Programación Didáctica', corto: 'PD', icono: 'libro', ciclo: true, ramas: true, apartados: PD, apartadosPor: { eso: ESO, bach: BACH }, tipo: 'pd' },
};

const ORDEN_DOCS = ['memoria', 'pccf', 'pd'];
const CICLOS = [{ id: 'smr', nombre: 'SMR', largo: 'Sistemas Microinformáticos y Redes' }, { id: 'daw', nombre: 'DAW', largo: 'Desarrollo de Aplicaciones Web' }];
// La PD tiene un nivel intermedio: FP (SMR/DAW) y ESO-BACH (ESO/Bachillerato).
// El PCCF no: sigue yendo directo a SMR/DAW.
const RAMAS = {
  pd: [
    { id: 'fp', nombre: 'FP', hojas: CICLOS },
    { id: 'eso-bach', nombre: 'ESO-BACH', hojas: [
      { id: 'eso', nombre: 'ESO', largo: 'Educación Secundaria Obligatoria' },
      { id: 'bach', nombre: 'Bachillerato', largo: 'Bachillerato' },
    ] },
  ],
};

// ------------------------------------------------------------------ SA reales (ESO y Bachillerato)
// Tablas de situaciones de aprendizaje extraídas de las propuestas pedagógicas
// de docs/entrada_ej/2026-27/ (títulos, criterios, pesos y temporalización;
// sin datos personales). FP conserva las fichas de muestra del mockup.
// Clave: '<materia>' o '<materia> › <bloque propio>' (p. ej. PIAR I).

const SA_CARACTERISTICAS = [
  ['Características Fundamentales',
    'Definir un contexto motivador para el alumnado. Estar relacionadas con la vida real del alumnado. Favorecer el aprendizaje individualizado y la autonomía del alumnado. Permitir la acción, la manipulación, la indagación, la conjetura y el reintento. Contener algún grado de creatividad.'],
  ['Características Recomendadas',
    'Generar algún tipo de producto final que se pueda explicar, presentar o difundir. Permitir diferentes tipos de agrupaciones y el trabajo cooperativo. Emplear herramientas TIC. Trabajar los ODS y los contenidos transversales.'],
];

const SA = {
 "Taller de Relaciones Digitales Saludables (1º ESO)": {
  "filas": [
   {
    "n": 1,
    "titulo": "Crear de forma supervisada una guía que les permita poder comparar las características físicas y lógicas de varios ordenadores a la hora de tener que comprar uno nuevo",
    "ce": "1.1 1.2 1.3 1.4 1.5 2.1 2.5 2.6 4.6",
    "ev": "Eva 1"
   },
   {
    "n": 2,
    "titulo": "Realizar un diagrama que represente la red informática que tienen en su casa",
    "desc": "Identificando dispositivos conectados y elementos de interconexión, junto con sus características",
    "ce": "1.1 1.2 1.3 1.4 1.5 2.1 2.5 2.6 4.6",
    "ev": "Eva 2"
   },
   {
    "n": 3,
    "titulo": "Elaborar una guía de evaluación que les permita cuantificar si hacen un uso seguro y saludable de Internet y los dispositivos digitales",
    "ce": "2.1 2.2 2.3 2.4 2.5 2.6 3.1 3.2 3.3 4.1 4.2 4.3 4.4 4.4 4.5 4.6",
    "ev": "Eva 3"
   }
  ]
 },
 "Programación, Inteligencia Artificial y Robótica (2º y 3º ESO) › Primer curso – PIAR I": {
  "filas": [
   {
    "n": 1,
    "titulo": "Anima tu nombre",
    "desc": "Introducción a la programación",
    "ce": "2.1, 2.2, 2.3, 2.4",
    "grupo": "PROGRAMACIÓN",
    "peso": "13 %",
    "gp": "45 %",
    "sem": "4 semanas",
    "ev": "Eva 1"
   },
   {
    "n": 2,
    "titulo": "Crea un asistente virtual",
    "desc": "Programación básica",
    "ce": "2.1, 2.2, 2.3, 2.4",
    "peso": "14 %",
    "sem": "4 semanas",
    "ev": "Eva 1"
   },
   {
    "n": 3,
    "titulo": "Programa un videojuego",
    "desc": "Programación avanzada",
    "ce": "2.1, 2.2, 2.3, 2.4 4.1, 4.4",
    "peso": "18 %",
    "sem": "3 semanas",
    "ev": "Eva 1"
   },
   {
    "n": 4,
    "titulo": "Diferencia un robot de un autómata",
    "desc": "Introducción a la robótica",
    "ce": "3.1",
    "grupo": "ROBÓTICA",
    "peso": "5 %",
    "gp": "34 %",
    "sem": "2 semanas",
    "ev": "Eva 2"
   },
   {
    "n": 5,
    "titulo": "Controla la controladora",
    "desc": "Programación de tarjetas controladoras",
    "ce": "3.2, 3.3, 3.4, 3.5",
    "peso": "16 %",
    "sem": "4 semanas",
    "ev": "Eva 2"
   },
   {
    "n": 6,
    "titulo": "Programa un robot sensible",
    "desc": "Programación de un robot",
    "ce": "3.3, 3.4, 3.5 4.1, 4.4",
    "peso": "13 %",
    "sem": "3 semanas",
    "ev": "Eva 3"
   },
   {
    "n": 7,
    "titulo": "Usa bien la inteligencia artificial",
    "desc": "Introducción a la inteligencia artificial",
    "ce": "1.1, 1.2, 1.3, 1.4 4.4",
    "grupo": "IA",
    "peso": "15 %",
    "gp": "15 %",
    "sem": "4 semanas",
    "ev": "Eva 3"
   },
   {
    "n": 8,
    "titulo": "La tecnología impacta",
    "desc": "Impacto de la informática en la sociedad",
    "ce": "2.5 4.2, 4.3",
    "grupo": "TIC",
    "peso": "6 %",
    "gp": "6 %",
    "sem": "3 semanas",
    "ev": "Eva 3"
   }
  ]
 },
 "Programación, Inteligencia Artificial y Robótica (2º y 3º ESO) › Segundo curso – PIAR II": {
  "filas": [
   {
    "n": 1,
    "titulo": "Introducción a la robótica Repaso de teoría y programación de robots",
    "ce": "3.1, 3.2, 3.3, 3.4, 3.5, 3.6",
    "grupo": "ROBÓTICA",
    "peso": "10%",
    "gp": "25 %",
    "sem": "4 sem",
    "ev": "Eva 1"
   },
   {
    "n": 2,
    "titulo": "Diseña un sistema robótico Diseño y construcción de sistemas robóticos",
    "ce": "3.1, 3.2, 3.3, 3.4, 3.5, 3.6",
    "peso": "15%",
    "sem": "4 sem",
    "ev": "Eva 1"
   },
   {
    "n": 3,
    "titulo": "Mira el interior de la IA Programación de sistemas de IA",
    "ce": "1.1, 1.2, 1.3, 1.4",
    "grupo": "IA",
    "peso": "15 %",
    "gp": "15 %",
    "sem": "3 sem",
    "ev": "Eva 1"
   },
   {
    "n": 4,
    "titulo": "Crea una aplicación para el móvil Programación de apps para dispositivos móviles",
    "ce": "2.1, 2.2, 2.3, 2.4, 2.5",
    "grupo": "PROGRAMACIÓN",
    "peso": "20 %",
    "gp": "35 %",
    "sem": "6 sem",
    "ev": "Eva 2"
   },
   {
    "n": 5,
    "titulo": "Programa un videojuego Programación de entornos gráficos",
    "ce": "2.1, 2.2, 2.3, 2.4, 2.5",
    "peso": "15 %",
    "sem": "5 sem",
    "ev": "Eva 2"
   },
   {
    "n": 6,
    "titulo": "Digitaliza y evoluciona la realidad Introducción a la realidad aumentada y virtual",
    "ce": "1,5",
    "grupo": "TIC",
    "peso": "15 %",
    "gp": "25 %",
    "sem": "6 sem",
    "ev": "Eva 3"
   },
   {
    "n": 7,
    "titulo": "La sociedad cambia con la tecnología Impacto de la tecnología en la sociedad",
    "ce": "4.2, 4.3, 4.5",
    "peso": "10 %",
    "sem": "4 sem",
    "ev": "Eva 3"
   },
   {
    "total": "100 % · 32 semanas"
   }
  ]
 },
 "Digitalización (4º ESO)": {
  "filas": [
   {
    "n": 1,
    "titulo": "Diseña tu ordenador",
    "desc": "Arquitectura del ordenador",
    "ce": "1.1, 1.3, 2.1, 5.4",
    "peso": "19 %",
    "gp": "41 %",
    "sem": "6 semanas",
    "ev": "Eva 1"
   },
   {
    "n": 2,
    "titulo": "Adminístrate bien",
    "desc": "Sistemas operativos y máquinas virtuales",
    "ce": "1.4, 1.5, 2.2",
    "peso": "10 %",
    "sem": "3 semanas",
    "ev": "Eva 1"
   },
   {
    "n": 3,
    "titulo": "Trabaja sin ratón",
    "desc": "Línea de comandos de Linux",
    "ce": "1.4, 2.2",
    "peso": "12 %",
    "sem": "4 semanas",
    "ev": "Eva 1"
   },
   {
    "n": 4,
    "titulo": "Enrédate en casa",
    "desc": "Redes de ordenadores y domótica",
    "ce": "1.2, 1.3, 1.5, 5.1, 5.2",
    "peso": "19 %",
    "gp": "31 %",
    "sem": "6 semanas",
    "ev": "Eva 2"
   },
   {
    "n": 5,
    "titulo": "Crea un sitio web",
    "desc": "Desarrollo web con HTML y CSS",
    "ce": "2.3, 2.4, 2.5 5.1, 5.2",
    "peso": "12 %",
    "sem": "4 semanas",
    "ev": "Eva 2"
   },
   {
    "n": 6,
    "titulo": "Sé un buen ciudadano",
    "desc": "Ciudadanía y seguridad digital",
    "ce": "Trabajo en equipo: 1.6, 2.6, 3.6, 5.3 Creación contenidos digitales: 2.1, 2.3, 2.5, Seguridad y bienestar digital: 3.1, 3.2, 3.3, 3.4, 3.5, Ciudadanía digital: 4.1, 4.2, 4.3, 4.4, 4.5",
    "peso": "6 % 6 % 8 % 8 %",
    "gp": "28 %",
    "sem": "8 semanas",
    "ev": "Eva 3"
   },
   {
    "total": "100 % · 31 semanas"
   }
  ]
 },
 "Taller de Profundización en Desarrollo de Videojuegos (4º ESO)": {
  "filas": [
   {
    "n": 1,
    "titulo": "Programación básica",
    "ce": "Todos",
    "ev": "Eva 1",
    "sem": "3 sem"
   },
   {
    "n": 2,
    "titulo": "Entornos de desarrollo",
    "ce": "Todos",
    "ev": "Eva 1",
    "sem": "9 sem"
   },
   {
    "n": 3,
    "titulo": "Introducción y definición de un juego",
    "ce": "Todos",
    "ev": "Eva 1 / Eva 2",
    "sem": "2 sem + 6 sem"
   },
   {
    "n": 4,
    "titulo": "Diseño de personajes y escenarios",
    "ce": "Todos",
    "ev": "Eva 2",
    "sem": "2 sem"
   },
   {
    "n": 5,
    "titulo": "Programación de la física y el movimiento",
    "ce": "Todos",
    "ev": "Eva 2",
    "sem": "2 sem"
   },
   {
    "n": 6,
    "titulo": "Programación de la interfaz y el comportamiento",
    "ce": "Todos",
    "ev": "Eva 2 / Eva 3",
    "sem": "4 sem + 4 sem"
   },
   {
    "n": 7,
    "titulo": "Animaciones en el juego",
    "ce": "Todos",
    "ev": "Eva 3",
    "sem": "3 sem"
   },
   {
    "n": 8,
    "titulo": "Sonido, analíticas y publicación",
    "ce": "Todos",
    "ev": "Eva 3",
    "sem": "3 sem"
   }
  ]
 },
 "Primer curso – Informática I": {
  "filas": [
   {
    "n": 1,
    "titulo": "Digitaliza tu organización Código binario y unidades de medida Diseño de imágenes vectoriales",
    "ce": "1.1 2.1",
    "grupo": "1",
    "peso": "3 % 7 %",
    "gp": "10 %",
    "sem": "2 sem 3 sem",
    "ev": "Eva 1"
   },
   {
    "n": 2,
    "titulo": "Diseña el hardware de tu organización HW, ergonomía y seguridad Hoja de cálculo avanzada",
    "ce": "1.1, 1.2, 4.1 2.1, 2.4, 3.3",
    "grupo": "2",
    "peso": "10 % 8 %",
    "gp": "18 %",
    "sem": "2 sem 4 sem",
    "ev": "Eva 1"
   },
   {
    "n": 3,
    "titulo": "Diseña el software de tu organización Sistemas operativos y virtualización Propiedad intelectual del software Inteligencia artificial",
    "ce": "1.2 2.1, 2.2, 2.4, 4.2 2.1, 2.4, 4.2",
    "grupo": "3",
    "peso": "4 % 8 % 9 %",
    "gp": "21 %",
    "sem": "1 sem 2 sem 4 sem",
    "ev": "Eva 2"
   },
   {
    "n": 4,
    "titulo": "Diseña la red de tu organización Diseño de redes locales Particionamiento de redes locales",
    "ce": "1.1, 1.2 1.2",
    "grupo": "4",
    "peso": "10 % 4 %",
    "gp": "14 %",
    "sem": "2 sem 2 sem",
    "ev": "Eva 2"
   },
   {
    "n": 5,
    "titulo": "Domotiza tu habitación Internet de las cosas",
    "ce": "1.2",
    "grupo": "5",
    "peso": "5 %",
    "gp": "5 %",
    "sem": "2 sem",
    "ev": "Eva 3"
   },
   {
    "n": 6,
    "titulo": "Pon los datos en su sitio Diseño de bases de datos",
    "ce": "3.1, 3.2, 3.3",
    "grupo": "6",
    "peso": "13 %",
    "gp": "13 %",
    "sem": "5 sem",
    "ev": "Eva 3"
   },
   {
    "n": 7,
    "titulo": "Más allá de la realidad RA y RV Fotogrametría",
    "ce": "2.1 2.1",
    "grupo": "7",
    "peso": "2 % 4 %",
    "gp": "6 %",
    "sem": "1 sem 2 sem",
    "ev": "Eva 3"
   },
   {
    "n": null,
    "titulo": "Proyecto transversal a las SA 1─4",
    "ce": "1.3, 2.2, 2.3",
    "peso": "7 %",
    "gp": "7 %",
    "sem": "- - -",
    "ev": "Eva 3"
   },
   {
    "n": null,
    "titulo": "Todas las Situaciones de Aprendizaje",
    "ce": "4.1, 4.2, 4.3",
    "peso": "6 %",
    "gp": "6 %",
    "sem": "- - -",
    "ev": "Eva 3"
   },
   {
    "total": "100 % · 32 semanas"
   }
  ]
 },
 "Segundo curso – PRSI II": {
  "filas": [
   {
    "n": 1,
    "titulo": "Informática y sociedad Historia de la informática. Tecnologías emergentes. Informática y sostenibilidad",
    "ce": "5.4 5.4, 5.2",
    "grupo": "1",
    "peso": "3 % 3 %",
    "gp": "6 %",
    "sem": "1 sem 1 sem",
    "ev": "Eva 1"
   },
   {
    "n": 2,
    "titulo": "Introducción a la programación Diseño de algoritmos Lenguajes de programación",
    "ce": "1.1, 1.2 1.3",
    "grupo": "2",
    "peso": "4 % 2 %",
    "gp": "6 %",
    "sem": "1 sem 1 sem",
    "ev": "Eva 1"
   },
   {
    "n": 3,
    "titulo": "Primeros pasos en Python Gestión de datos Entrada y salida",
    "ce": "1.3 1.3",
    "grupo": "3",
    "peso": "4 % 7 %",
    "gp": "11 %",
    "sem": "1 sem 1 sem",
    "ev": "Eva 1"
   },
   {
    "n": 4,
    "titulo": "Gestión de texto y funciones del sistema Gestión de cadenas de caracteres. Funciones integradas y externas",
    "ce": "1.3 1.3",
    "grupo": "4",
    "peso": "8 % 4 %",
    "gp": "12 %",
    "sem": "2 sem 1 sem",
    "ev": "Eva 1"
   },
   {
    "n": 5,
    "titulo": "Programación estructurada I – Control de flujo Condicionales y bucles",
    "ce": "1.3",
    "grupo": "5",
    "peso": "12 %",
    "gp": "12 %",
    "sem": "3 sem",
    "ev": "Eva 2"
   },
   {
    "n": 6,
    "titulo": "Programación estructurada II – Modularización Funciones Resolución de problemas complejos",
    "ce": "1.3 1.3",
    "grupo": "6",
    "peso": "8 % 7 %",
    "gp": "15 %",
    "sem": "2 sem 1 sem",
    "ev": "Eva 2"
   },
   {
    "n": 7,
    "titulo": "Programación estructurada III – Listas Vectores y listas Estructuras de datos",
    "ce": "1.3 1.3",
    "grupo": "7",
    "peso": "10 % 2 %",
    "gp": "12 %",
    "sem": "2 sem 1 sem",
    "ev": "Eva 2"
   },
   {
    "n": 8,
    "titulo": "Proyecto de programación Proyecto simple Proyecto complejo",
    "ce": "1.1, 1.2 1.3, 5.2",
    "grupo": "8",
    "peso": "4 % 7 %",
    "gp": "11 %",
    "sem": "1 sem 2 sem",
    "ev": "Eva 3"
   },
   {
    "n": 9,
    "titulo": "Administración electrónica Certificados electrónicos y firma digital",
    "ce": "4.3",
    "grupo": "9",
    "peso": "4 %",
    "gp": "4 %",
    "sem": "1 sem",
    "ev": "Eva 3"
   },
   {
    "n": 10,
    "titulo": "Creación de páginas web Gestores de contenidos",
    "ce": "4.4",
    "grupo": "10",
    "peso": "11 %",
    "gp": "11 %",
    "sem": "3 sem",
    "ev": "Eva 3"
   },
   {
    "total": "100 % · 25 semanas"
   }
  ]
 }
};

// ------------------------------------------------------------------ constructor del árbol
function nodo(base) {
  return Object.assign({ hijos: [] }, base);
}

function montarHijos(lista, prefijo, edita, moduloId) {
  return (lista || []).map((x, i) => {
    // Un hijo con `propio` (p. ej. los bloques PIAR I/II) se aparta de la clave
    // de permiso del padre y usa la suya propia.
    const clave = x.propio ? x.t : moduloId;
    const n = nodo({
      titulo: x.t, num: x.n || null, edita, tipo: 'apartado',
      id: prefijo + '/' + i, moduloId: clave || null,
    });
    if (x.propio) n.propio = true;
    n.hijos = montarHijos(x.h, n.id, edita, clave);
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
function arbolDocumento(docId, ramaId, curso) {
  const doc = DOCUMENTOS[docId];
  const apartados = (doc.apartadosPor && doc.apartadosPor[ramaId]) || doc.apartados;
  const raiz = nodo({ titulo: doc.nombre, tipo: 'raiz', edita: 'comun', id: docId });
  raiz.hijos = apartados.map((a, i) => {
    const n = nodo({ titulo: a.t, num: a.n || null, tipo: 'apartado', edita: 'comun', id: docId + '/' + i });
    if (a.corto) n.corto = a.corto;
    if (a.tipo === 'modulos') {
      n.tipo = 'modulos';
      if (a.materias) {
        // ESO/BACH: entradas de contexto (comun) + materias (tipo modulo)
        const entradas = [...(a.h || []).map((x) => ({ x, mod: false })),
          ...(MATERIAS[a.materias] || []).map((x) => ({ x, mod: true }))];
        n.hijos = entradas.map((it, j) => {
          const id = n.id + '/' + j;
          if (it.mod) {
            const m = nodo({ titulo: it.x.t, num: it.x.n || null, tipo: 'modulo', edita: 'modulo', id, moduloId: it.x.t });
            m.hijos = montarHijos(it.x.h, id, 'modulo', it.x.t);
            return m;
          }
          const c = nodo({ titulo: it.x.t, num: it.x.n || null, tipo: 'apartado', edita: 'comun', id });
          c.hijos = montarHijos(it.x.h, id, 'comun', null);
          return c;
        });
      } else {
        n.hijos = montarModulos(ramaId || 'daw', curso, a.curso, n.id);
      }
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

window.DATOS = { DOCUMENTOS, ORDEN_DOCS, CICLOS, RAMAS, MODULOS, MATERIAS, PERFILES, SA, SA_CARACTERISTICAS, arbolDocumento, aplanar };
