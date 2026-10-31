// Catálogo de unidades: módulos de FP, materias de ESO/Bachillerato y los bloques
// con permiso propio (PIAR I y II). Es la pieza que arregla el punto débil del v1:
// allí la unidad se identificaba por su título, y los títulos cambian de un curso a
// otro aunque el módulo sea el mismo. Entre 2025-26 y 2026-27 ya pasa tres veces:
//
//   "Desarrollo web en entornos cliente"             -> "Desarrollo web en entorno cliente"
//   "Sostenibilidad aplicada a los sectores prod."   -> "Sostenibilidad aplicada al sistema productivo"   (DAW y SMR)
//
// Con el título como clave, cada septiembre se pierden en silencio las asignaciones
// de los módulos renombrados. Aquí la clave es `id` (interna y estable), el título
// es solo la etiqueta que se pinta, y `titulos` guarda la variante de cada curso.
//
// OJO con `codigo`: son los códigos de los reales decretos del título (DAW, RD 686/2010;
// SMR, RD 1691/2007). Están puestos de memoria y hay que CONFIRMARLOS contra la
// normativa vigente antes de usarlos de verdad. Los módulos nuevos de la LOFP
// (sostenibilidad, digitalización, introducción a la programación) van con `codigo: null`
// a propósito: la interfaz los pinta como "código pendiente" en lugar de inventárselo.

(function (global) {
  'use strict';

  const UNIDADES = [
    // ---------------------------------------------------------------- DAW · primer curso
    { id: 'daw-0373', codigo: '0373', ambito: 'fp', ciclo: 'daw', cursoCiclo: 'primer', titulo: 'Lenguaje de Marcas y Sistemas de Gestión de Información' },
    { id: 'daw-0483', codigo: '0483', ambito: 'fp', ciclo: 'daw', cursoCiclo: 'primer', titulo: 'Sistemas Informáticos' },
    { id: 'daw-0484', codigo: '0484', ambito: 'fp', ciclo: 'daw', cursoCiclo: 'primer', titulo: 'Base de datos' },
    { id: 'daw-0485', codigo: '0485', ambito: 'fp', ciclo: 'daw', cursoCiclo: 'primer', titulo: 'Programación' },
    { id: 'daw-0487', codigo: '0487', ambito: 'fp', ciclo: 'daw', cursoCiclo: 'primer', titulo: 'Entornos de desarrollo' },

    // ---------------------------------------------------------------- DAW · segundo curso
    { id: 'daw-0612', codigo: '0612', ambito: 'fp', ciclo: 'daw', cursoCiclo: 'segundo', titulo: 'Desarrollo web en entorno cliente',
      titulos: { '2025-26': 'Desarrollo web en entornos cliente' } },
    { id: 'daw-0613', codigo: '0613', ambito: 'fp', ciclo: 'daw', cursoCiclo: 'segundo', titulo: 'Desarrollo web en entorno servidor' },
    { id: 'daw-0614', codigo: '0614', ambito: 'fp', ciclo: 'daw', cursoCiclo: 'segundo', titulo: 'Despliegue de aplicaciones web' },
    { id: 'daw-0615', codigo: '0615', ambito: 'fp', ciclo: 'daw', cursoCiclo: 'segundo', titulo: 'Diseño de interfaces web' },
    { id: 'daw-sost', codigo: null, ambito: 'fp', ciclo: 'daw', cursoCiclo: 'segundo', titulo: 'Sostenibilidad aplicada al sistema productivo',
      titulos: { '2025-26': 'Sostenibilidad aplicada a los sectores productivos' } },
    { id: 'daw-digi', codigo: null, ambito: 'fp', ciclo: 'daw', cursoCiclo: 'segundo', titulo: 'Digitalización Aplicada a los Sectores Productivos' },

    // ---------------------------------------------------------------- SMR · primer curso
    { id: 'smr-0221', codigo: '0221', ambito: 'fp', ciclo: 'smr', cursoCiclo: 'primer', titulo: 'Montaje y Mantenimiento de equipos' },
    { id: 'smr-0223', codigo: '0223', ambito: 'fp', ciclo: 'smr', cursoCiclo: 'primer', titulo: 'Aplicaciones ofimáticas' },
    { id: 'smr-0222', codigo: '0222', ambito: 'fp', ciclo: 'smr', cursoCiclo: 'primer', titulo: 'Sistemas operativos monopuesto' },
    { id: 'smr-0225', codigo: '0225', ambito: 'fp', ciclo: 'smr', cursoCiclo: 'primer', titulo: 'Redes Locales' },

    // ---------------------------------------------------------------- SMR · segundo curso
    { id: 'smr-0224', codigo: '0224', ambito: 'fp', ciclo: 'smr', cursoCiclo: 'segundo', titulo: 'Sistemas operativos en red' },
    { id: 'smr-0227', codigo: '0227', ambito: 'fp', ciclo: 'smr', cursoCiclo: 'segundo', titulo: 'Servicios en red' },
    { id: 'smr-0228', codigo: '0228', ambito: 'fp', ciclo: 'smr', cursoCiclo: 'segundo', titulo: 'Aplicaciones web' },
    { id: 'smr-0226', codigo: '0226', ambito: 'fp', ciclo: 'smr', cursoCiclo: 'segundo', titulo: 'Seguridad informática' },
    { id: 'smr-digi1', codigo: null, ambito: 'fp', ciclo: 'smr', cursoCiclo: 'segundo', titulo: 'Digitalización aplicada a los sectores productivos I' },
    { id: 'smr-sost', codigo: null, ambito: 'fp', ciclo: 'smr', cursoCiclo: 'segundo', titulo: 'Sostenibilidad aplicada al sistema productivo',
      titulos: { '2025-26': 'Sostenibilidad aplicada a los sectores productivos' } },
    { id: 'smr-prog', codigo: null, ambito: 'fp', ciclo: 'smr', cursoCiclo: 'segundo', titulo: 'Introducción a la programación' },

    // ---------------------------------------------------------------- ESO
    // Las materias ocupan el mismo sitio que los módulos de FP y se editan igual.
    { id: 'eso-trds', codigo: null, ambito: 'eso', titulo: 'Taller de Relaciones Digitales Saludables (1º ESO)' },
    { id: 'eso-piar', codigo: null, ambito: 'eso', titulo: 'Programación, Inteligencia Artificial y Robótica (2º y 3º ESO)' },
    // PIAR I y II son bloques dentro de la materia PIAR con permiso independiente:
    // un docente puede tener PIAR I sin tener el resto de la materia.
    { id: 'eso-piar-1', codigo: null, ambito: 'eso', padre: 'eso-piar', titulo: 'Primer curso – PIAR I' },
    { id: 'eso-piar-2', codigo: null, ambito: 'eso', padre: 'eso-piar', titulo: 'Segundo curso – PIAR II' },
    { id: 'eso-digi', codigo: null, ambito: 'eso', titulo: 'Digitalización (4º ESO)' },
    { id: 'eso-videojuegos', codigo: null, ambito: 'eso', titulo: 'Taller de Profundización en Desarrollo de Videojuegos (4º ESO)' },

    // ---------------------------------------------------------------- Bachillerato
    { id: 'bach-inf1', codigo: null, ambito: 'bach', titulo: 'Primer curso – Informática I' },
    { id: 'bach-inf2', codigo: null, ambito: 'bach', titulo: 'Segundo curso – Informática II' },
    { id: 'bach-prsi2', codigo: null, ambito: 'bach', titulo: 'Segundo curso – PRSI II' },
  ];

  const porId = new Map(UNIDADES.map((u) => [u.id, u]));

  // El título que toca pintar en un curso dado; `titulos` solo lleva las variantes.
  const tituloDe = (unidad, curso) => {
    const u = typeof unidad === 'string' ? porId.get(unidad) : unidad;
    if (!u) return '';
    return (u.titulos && u.titulos[curso]) || u.titulo;
  };

  // Etiqueta corta para los chips: el código si lo sabemos, si no un aviso honesto.
  const etiquetaCodigo = (unidad) => {
    const u = typeof unidad === 'string' ? porId.get(unidad) : unidad;
    if (!u) return '';
    return u.codigo ? u.codigo : 'código pendiente';
  };

  const deCiclo = (ciclo, cursoCiclo) =>
    UNIDADES.filter((u) => u.ciclo === ciclo && u.cursoCiclo === cursoCiclo);

  // Las materias de ESO/Bach que se pintan en el árbol: los bloques con `padre`
  // cuelgan de su materia, no del nivel.
  const deAmbito = (ambito) => UNIDADES.filter((u) => u.ambito === ambito && !u.padre);
  const hijasDe = (id) => UNIDADES.filter((u) => u.padre === id);

  const unidad = (id) => porId.get(id) || null;

  global.Unidades = { UNIDADES, unidad, tituloDe, etiquetaCodigo, deCiclo, deAmbito, hijasDe };
})(typeof globalThis !== 'undefined' ? globalThis : this);
