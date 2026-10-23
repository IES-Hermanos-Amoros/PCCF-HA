// Construye la definición de documento de pdfmake para una programación didáctica (PD) de un módulo
// a partir de datos estructurados (ver data/pd.json, generado con tools/word_a_json.py). Sin navegador, sin binarios: apto para serverless.

const AZUL = '#1F3864', AZUL_CLARO = '#D9E2F3', GRIS = '#666666', GRIS_BORDE = '#BFBFBF', GRIS_FONDO = '#F2F2F2', ROJO = '#C00000', VERDE = '#2E7D32';

const layout = {
  hLineWidth: () => 0.5, vLineWidth: () => 0.5,
  hLineColor: () => GRIS_BORDE, vLineColor: () => GRIS_BORDE,
  paddingLeft: () => 4, paddingRight: () => 4, paddingTop: () => 3, paddingBottom: () => 3,
};

const th = (text, extra = {}) => ({ text, style: 'th', ...extra });
const label = (text, extra = {}) => ({ text, bold: true, fillColor: GRIS_FONDO, ...extra });

// Encabezados con entrada en el índice
const h1 = (text) => ({ text, style: 'h1', tocItem: true });
const h2 = (text) => ({ text, style: 'h2', tocItem: true, tocMargin: [12, 0, 0, 0] });
const h3 = (text) => ({ text, style: 'h3', tocItem: true, tocMargin: [24, 0, 0, 0], tocStyle: { fontSize: 9, color: GRIS } });

const para = (text, extra = {}) => ({ text, margin: [0, 0, 0, 6], alignment: 'justify', ...extra });

// Lista plana con niveles -> listas anidadas de pdfmake
function nestedList(items) {
  const root = [];
  const stack = [{ level: 0, list: root }];
  for (const it of items) {
    const level = Math.max(0, it.level || 0);
    while (stack.length > 1 && stack[stack.length - 1].level > level) stack.pop();
    while (stack[stack.length - 1].level < level) {
      const sub = [];
      stack[stack.length - 1].list.push({ ul: sub, margin: [0, 1, 0, 1] });
      stack.push({ level: stack[stack.length - 1].level + 1, list: sub });
    }
    stack[stack.length - 1].list.push({ text: it.text });
  }
  return root;
}

// Bloques de texto enriquecido (párrafos y listas) -> contenido pdfmake
function blocks(list, opts = {}) {
  const out = [];
  for (const b of list || []) {
    if (b.type === 'p') out.push(para(b.text));
    else if (b.type === 'list') out.push({ ul: nestedList(b.items), margin: [0, 0, 0, 6] });
  }
  if (!out.length && opts.vacio) out.push(para(opts.vacio, { italics: true, color: GRIS }));
  return out;
}

const pct = (n) => (n === undefined || n === null ? '' : `${Number(n).toLocaleString('es-ES', { maximumFractionDigits: 2 })} %`);

function buildPdDocDefinition(d, opts = {}) {
  const numPrefix = opts.numPrefix || '9.4';
  const n = (s) => `${numPrefix}.${s}`;
  const m = d.modulo, c = d.ciclo, centro = d.centro;
  const borrador = d.estado !== 'aprobado';
  const fecha = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

  // ---------- Comprobaciones (lo que en la app serían validaciones) ----------
  const sumaRA = d.ra.reduce((a, r) => a + (r.ponderacion || 0), 0);
  const avisos = [];
  if (Math.abs(sumaRA - 100) > 0.01) avisos.push(`La suma de las ponderaciones de los RA es ${pct(sumaRA)} y debería ser 100 %.`);
  for (const r of d.ra) {
    const s = r.ce.reduce((a, ce) => a + (ce.ponderacion || 0), 0);
    if (Math.abs(s - (r.ponderacion || 0)) > 0.01) avisos.push(`RA${r.num}: los criterios suman ${pct(s)} y el RA pondera ${pct(r.ponderacion)}.`);
  }
  const sesiones = d.situaciones.reduce((a, s) => a + (s.sesiones || 0), 0);
  const raSinSA = d.ra.filter((r) => !d.situaciones.some((s) => s.ra.includes(r.num))).map((r) => `RA${r.num}`);
  if (raSinSA.length) avisos.push(`RA sin situación de aprendizaje asociada: ${raSinSA.join(', ')}.`);

  // ---------- Portada ----------
  const portada = [
    { text: centro.nombre, fontSize: 12, color: GRIS, margin: [0, 120, 0, 0] },
    { text: `Departamento de ${centro.departamento} · ${centro.localidad}`, fontSize: 10, color: GRIS },
    { text: 'Programación didáctica', fontSize: 14, color: AZUL, margin: [0, 60, 0, 6] },
    { text: `${m.codigo} · ${m.nombre}`, fontSize: 28, bold: true, color: AZUL },
    { canvas: [{ type: 'line', x1: 0, y1: 8, x2: 495, y2: 8, lineWidth: 1.5, lineColor: AZUL }], margin: [0, 0, 0, 18] },
    { text: `${c.nombre} (${c.codigo}) · ${c.nivel} · ${m.curso} curso`, fontSize: 12 },
    { text: `Curso académico ${c.curso_academico}`, fontSize: 12, margin: [0, 4, 0, 40] },
    {
      table: {
        widths: [150, '*'],
        body: [
          [label('Profesorado'), m.profesorado],
          [label('Horas totales'), `${m.horas} (${m.horas_semanales} semanales)`],
          [label('Créditos ECTS'), String(m.ects)],
          [label('Unidad de competencia'), m.unidad_competencia || 'No aplica'],
          [label('Estado del documento'), { text: borrador ? 'BORRADOR' : 'APROBADO', bold: true, color: borrador ? ROJO : VERDE }],
        ],
      },
      layout,
    },
    { text: `Documento generado automáticamente el ${fecha} a partir de los datos de la programación. Prueba de concepto del generador PCCF-HA.`, fontSize: 8.5, color: GRIS, margin: [0, 140, 0, 0] },
  ];

  // ---------- Identificación ----------
  const identificacion = {
    table: {
      widths: [130, 110, '*', 50, 40],
      body: [
        [th('MÓDULO PROFESIONAL', { colSpan: 5, alignment: 'center' }), {}, {}, {}, {}],
        [label('Identificación', { rowSpan: 3 }), label('Código'), { text: m.codigo, colSpan: 3 }, {}, {}],
        [{}, label('Módulo profesional'), { text: m.nombre, colSpan: 3 }, {}, {}],
        [{}, label('Curso'), { text: m.curso, colSpan: 3 }, {}, {}],
        [label('Profesorado'), label('Titular'), { text: m.profesorado, colSpan: 3 }, {}, {}],
        [label('Distribución horaria', { rowSpan: 2 }), label('Horas'), { text: m.horas, colSpan: 3 }, {}, {}],
        [{}, label('Horas semanales'), m.horas_semanales, label('ECTS'), String(m.ects)],
        [label('Asociado a unidad de competencia'), { text: m.unidad_competencia || 'No aplica', colSpan: 4 }, {}, {}, {}],
        [label('Síntesis del módulo'), { text: m.sintesis || '', colSpan: 4, alignment: 'justify' }, {}, {}, {}],
      ],
    },
    layout, margin: [0, 0, 0, 10],
  };

  // ---------- Competencias y objetivos ----------
  const compObj = {
    table: {
      headerRows: 1, widths: ['*', '*'],
      body: [[th('Competencias'), th('Objetivos')], [{ ul: d.competencias.map((t) => ({ text: t })) }, { ul: d.objetivos.map((t) => ({ text: t })) }]],
    },
    layout, margin: [0, 0, 0, 10],
  };

  // ---------- RA y CE ----------
  const raCe = {
    table: {
      headerRows: 1, widths: ['*', '*'],
      body: [
        [th('Resultados de aprendizaje'), th('Criterios de evaluación')],
        ...d.ra.map((r) => [
          { text: [{ text: `RA${r.num}. `, bold: true }, r.texto] },
          { stack: r.ce.map((ce) => ({ text: `${ce.letra}) ${ce.texto}`, margin: [0, 0, 0, 2] })) },
        ]),
      ],
    },
    layout, margin: [0, 0, 0, 10],
  };

  // ---------- Contenidos ----------
  const contenidos = {
    table: {
      headerRows: 1, widths: ['*'],
      body: [[th('Contenidos del módulo')], [{ stack: d.contenidos.map((b) => ({ stack: [{ text: b.bloque + ':', bold: true, margin: [0, 3, 0, 1] }, { ul: b.items.map((t) => ({ text: t })) }] })) }]],
    },
    layout, margin: [0, 0, 0, 10],
  };

  // ---------- Metodología ----------
  const estrategias = {
    table: { headerRows: 1, widths: [150, '*'], body: [[th('Nombre'), th('Descripción')], ...d.metodologia.estrategias.map((e) => [{ text: e.nombre, bold: true }, { text: e.descripcion, alignment: 'justify' }])] },
    layout, margin: [0, 0, 0, 10],
  };

  // ---------- Situaciones de aprendizaje: tabla resumen DERIVADA de las fichas ----------
  const raNums = d.ra.map((r) => r.num);
  const evaluaciones = [...new Set(d.situaciones.map((s) => s.evaluacion))];
  const resumenBody = [
    [th('Ev.', { rowSpan: 2 }), th('Situaciones de aprendizaje', { rowSpan: 2 }), th('Sesiones', { rowSpan: 2 }), th('Resultados de aprendizaje', { colSpan: raNums.length, alignment: 'center' }), ...raNums.slice(1).map(() => ({}))],
    [{}, {}, {}, ...raNums.map((x) => th(String(x), { alignment: 'center' }))],
  ];
  for (const ev of evaluaciones) {
    const sas = d.situaciones.filter((s) => s.evaluacion === ev);
    sas.forEach((s, i) => {
      resumenBody.push([
        i === 0 ? { text: ev, rowSpan: sas.length, bold: true } : {},
        `SA ${s.num}: ${s.titulo}`,
        { text: String(s.sesiones), alignment: 'center' },
        ...raNums.map((x) => ({ text: s.ra.includes(x) ? 'X' : '', alignment: 'center' })),
      ]);
    });
  }
  resumenBody.push([{ text: 'Total', colSpan: 2, bold: true }, {}, { text: String(sesiones), bold: true, alignment: 'center' }, ...raNums.map(() => '')]);
  const resumenSA = { table: { headerRows: 2, widths: [28, '*', 42, ...raNums.map(() => 16)], body: resumenBody }, layout, margin: [0, 0, 0, 10] };

  const fichaSA = (s) => ({
    table: {
      widths: [95, '*', '*', '*', '*', 55, 30],
      body: [
        [th(`Situación de aprendizaje ${s.num}`), { text: s.titulo, colSpan: 4, bold: true }, {}, {}, {}, label('Sesiones'), { text: String(s.sesiones), alignment: 'center' }],
        [{}, { text: '', colSpan: 4 }, {}, {}, {}, label('Evaluación'), { text: s.evaluacion, alignment: 'center' }],
        [label('Resultado(s) de aprendizaje'), { text: s.ra.map((x) => `RA${x}. ${(d.ra.find((r) => r.num === x) || {}).texto || ''}`).join('\n'), colSpan: 6 }, {}, {}, {}, {}, {}],
        [label('Criterios de evaluación', { colSpan: 7 }), {}, {}, {}, {}, {}, {}],
        [{ text: s.criterios.join('\n'), colSpan: 7, fontSize: 8.5 }, {}, {}, {}, {}, {}, {}],
        [label('Competencias profesionales para la empleabilidad', { colSpan: 7 }), {}, {}, {}, {}, {}, {}],
        [{ text: s.competencias.join('\n'), colSpan: 7, fontSize: 8.5 }, {}, {}, {}, {}, {}, {}],
        [label('Objetivos de aprendizaje', { colSpan: 7 }), {}, {}, {}, {}, {}, {}],
        [{ text: s.objetivos.join('\n'), colSpan: 7, fontSize: 8.5 }, {}, {}, {}, {}, {}, {}],
        [label('Tipificación de actividades formativas', { colSpan: 7, alignment: 'center' }), {}, {}, {}, {}, {}, {}],
        [label('Introducción', { colSpan: 2 }), {}, label('Formativas no evaluables', { colSpan: 2 }), {}, label('Formativas evaluables', { colSpan: 3 }), {}, {}],
        [{ text: s.actividades.introduccion, colSpan: 2, fontSize: 8.5 }, {}, { text: s.actividades.no_evaluables, colSpan: 2, fontSize: 8.5 }, {}, { text: s.actividades.evaluables, colSpan: 3, fontSize: 8.5 }, {}, {}],
        [label('Actividades de refuerzo', { colSpan: 3 }), {}, {}, label('Actividades de ampliación', { colSpan: 4 }), {}, {}, {}],
        [{ text: s.refuerzo, colSpan: 3, fontSize: 8.5 }, {}, {}, { text: s.ampliacion, colSpan: 4, fontSize: 8.5 }, {}, {}, {}],
        [label('Actividades de recuperación', { colSpan: 7 }), {}, {}, {}, {}, {}, {}],
        [{ text: s.recuperacion, colSpan: 7, fontSize: 8.5 }, {}, {}, {}, {}, {}, {}],
        [label('Materiales y recursos didácticos disponibles', { colSpan: 7 }), {}, {}, {}, {}, {}, {}],
        [{ text: s.recursos, colSpan: 7, fontSize: 8.5 }, {}, {}, {}, {}, {}, {}],
      ],
    },
    layout, margin: [0, 0, 0, 12],
  });

  // ---------- Ponderaciones ----------
  const pondTables = d.ra.map((r) => {
    const sumaCE = r.ce.reduce((a, ce) => a + (ce.ponderacion || 0), 0);
    const ok = Math.abs(sumaCE - (r.ponderacion || 0)) < 0.01;
    return {
      table: {
        headerRows: 1, widths: ['*', 70],
        body: [
          [th(`Resultado de aprendizaje (${m.codigo}.${r.num})`), th('Ponderación', { alignment: 'center' })],
          [{ text: r.texto }, { text: pct(r.ponderacion), alignment: 'center', bold: true }],
          [label('Criterio de evaluación'), label('Ponderación', { alignment: 'center' })],
          ...r.ce.map((ce) => [{ text: `${ce.letra}) ${ce.texto}`, bold: !!ce.fundamental }, { text: pct(ce.ponderacion), alignment: 'center' }]),
          [{ text: 'Suma de los criterios', italics: true, color: ok ? GRIS : ROJO, alignment: 'right' }, { text: ok ? pct(sumaCE) : `${pct(sumaCE)} (!)`, alignment: 'center', bold: true, color: ok ? GRIS : ROJO }],
        ],
      },
      layout, margin: [0, 0, 0, 10], unbreakable: r.ce.length <= 12,
    };
  });

  // ---------- Dual ----------
  const dual = d.dual.length ? {
    table: {
      headerRows: 1, widths: [34, '*', 95, 95],
      body: [[th('RA'), th('Resultado de aprendizaje'), th('CE en la empresa'), th('CE en el instituto')], ...d.dual.map((x) => [{ text: x.ra, bold: true }, x.texto, x.ce_empresa, x.ce_instituto])],
    },
    layout, margin: [0, 0, 0, 10],
  } : para('Este módulo no dualiza resultados de aprendizaje.', { italics: true });

  // ---------- Avisos de validación ----------
  const avisosBox = avisos.length ? {
    table: { widths: ['*'], body: [[{ stack: [{ text: 'Comprobaciones automáticas', bold: true, color: ROJO, margin: [0, 0, 0, 3] }, { ul: avisos }], fillColor: '#FDECEA' }]] },
    layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 8, paddingRight: () => 8, paddingTop: () => 6, paddingBottom: () => 6 }, margin: [0, 0, 0, 10],
  } : { text: 'Comprobaciones automáticas: ponderaciones coherentes y todos los RA cubiertos por situaciones de aprendizaje.', color: VERDE, italics: true, margin: [0, 0, 0, 10] };

  // ---------- Contenido ----------
  const content = [
    ...portada,
    { toc: { title: { text: 'Índice', style: 'h1' }, numberStyle: { color: GRIS } }, pageBreak: 'before' },

    { ...h1(`${numPrefix}. ${m.nombre}`), pageBreak: 'before' },
    avisosBox,
    h2(`${n(1)}. Propuestas de mejora del curso anterior`),
    ...blocks(d.propuestas_mejora, { vacio: 'Sin propuestas registradas.' }),
    h2(`${n(2)}. Identificación del módulo / unidad formativa`),
    identificacion,
    h2(`${n(3)}. Desarrollo curricular`),
    h3(`${n('3.1')}. Competencias y objetivos`),
    para('Relación entre las competencias y los objetivos generales del ciclo que contribuye a alcanzar este módulo.'),
    compObj,
    h3(`${n('3.2')}. Resultados de aprendizaje y criterios de evaluación`),
    raCe,
    h3(`${n('3.3')}. Contenidos básicos de referencia del módulo`),
    contenidos,
    h2(`${n(4)}. Metodología específica`),
    h3(`${n('4.1')}. Estrategias metodológicas`),
    estrategias,
    h3(`${n('4.2')}. Programa plurilingüe`),
    para(d.metodologia.plurilingue || 'No aplicable en este módulo.'),
    h3(`${n('4.3')}. Recursos específicos`),
    ...blocks(d.metodologia.recursos),
    h2(`${n(5)}. Situaciones de aprendizaje`),
    para(`El módulo se organiza en ${d.situaciones.length} situaciones de aprendizaje repartidas en ${evaluaciones.length} evaluaciones, con un total de ${sesiones} sesiones. La tabla resumen se calcula a partir de las fichas.`),
    resumenSA,
    ...d.situaciones.flatMap((s) => [h3(`Situación de aprendizaje ${s.num}: ${s.titulo}`), fichaSA(s)]),
    h2(`${n(6)}. Relación con otros módulos`),
    ...blocks(d.relacion_otros_modulos),
    h2(`${n(7)}. Evaluación y calificación`),
    h3(`${n('7.1')}. Instrumentos de evaluación`), ...blocks(d.evaluacion.instrumentos),
    h3(`${n('7.2')}. Criterios de evaluación`), ...blocks(d.evaluacion.criterios),
    h3(`${n('7.3')}. Criterios de calificación`), ...blocks(d.evaluacion.calificacion),
    h3(`${n('7.4')}. Recuperación de los resultados de aprendizaje`), ...blocks(d.evaluacion.recuperacion),
    h3(`${n('7.5')}. Alumnado con el módulo pendiente de cursos anteriores`), ...blocks(d.evaluacion.pendientes),
    h2(`${n(8)}. Ponderaciones de los resultados de aprendizaje y los criterios de evaluación`),
    para(`Suma de las ponderaciones de los RA: ${pct(sumaRA)}. Los criterios de evaluación fundamentales se muestran en negrita.`),
    ...pondTables,
    h2('11. Resultados de aprendizaje dualizables (extracto del PCCF)'),
    para('Tabla derivada de la distribución de resultados de aprendizaje en modalidad dual recogida en el PCCF del ciclo.'),
    dual,
  ];

  return {
    content,
    pageSize: 'A4',
    pageMargins: [50, 60, 50, 60],
    info: { title: `PD ${m.codigo} ${m.nombre} · ${c.codigo} ${c.curso_academico}`, author: centro.nombre, subject: 'Programación didáctica' },
    watermark: borrador ? { text: 'BORRADOR', color: '#9E9E9E', opacity: 0.12, bold: true, fontSize: 90 } : undefined,
    header: (page) => (page === 1 ? null : {
      columns: [
        { text: `Programación didáctica · ${c.codigo} · ${m.codigo} ${m.nombre} · ${c.curso_academico}`, fontSize: 8, color: GRIS },
        { text: centro.nombre, fontSize: 8, color: GRIS, alignment: 'right' },
      ],
      margin: [50, 28, 50, 0],
    }),
    footer: (page, pages) => (page === 1 ? null : { text: `Página ${page} de ${pages}`, alignment: 'center', fontSize: 8, color: GRIS, margin: [0, 25, 0, 0] }),
    defaultStyle: { font: 'Roboto', fontSize: 9.5, lineHeight: 1.15 },
    styles: {
      h1: { fontSize: 16, bold: true, color: AZUL, margin: [0, 0, 0, 10] },
      h2: { fontSize: 12.5, bold: true, color: AZUL, margin: [0, 14, 0, 6] },
      h3: { fontSize: 10.5, bold: true, color: '#2E75B6', margin: [0, 10, 0, 4] },
      th: { bold: true, fillColor: AZUL_CLARO },
    },
  };
}

module.exports = { buildPdDocDefinition };
