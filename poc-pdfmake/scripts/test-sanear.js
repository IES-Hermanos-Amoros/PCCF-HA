// Saneador de contenido: que de un documento real salga un ejemplo publicable.
//
// lib/sanear.js sustituye nombres, correos, teléfonos, CIF, empresas y centro, y
// reinventa lo que escribió el profesorado en las fichas de SA, sin tocar la
// estructura. Las pruebas van sobre un documento de prueba construido aquí
// mismo, con nombres y empresas inventados que imitan el problema, y no sobre
// out/importado/datos.json: ese fichero no está en el repositorio y las pruebas
// tienen que pasar en cualquier máquina.
//
// Lo que se comprueba es lo que haría daño si fallase en silencio: un nombre que
// se queda en medio de un párrafo, dos grafías de la misma persona que acaban
// siendo dos, un guardia que no se entera, una ficha que cambia de tamaño o un
// generador que escribe lo mismo en todas las fichas.

const assert = require('assert');
const S = require('../lib/sanear');
const F = require('../lib/ficha-sa');

let fallos = 0;
const prueba = (nombre, fn) => {
  try { fn(); console.log(`ok   ${nombre}`); }
  catch (e) { fallos += 1; console.log(`FALLO ${nombre}\n     ${e.message}`); }
};

const c = (text, opts) => Object.assign({ text, colspan: 1, rowspan: 1, bold: false }, opts);
const copia = (x) => JSON.parse(JSON.stringify(x));

// ---------------------------------------------------------------- datos de prueba
// Todo inventado. «Gonzalo» aparece escrito de tres formas (con z, con s y con
// el orden de apellidos primero) y hay otro Gonzalo que es otra persona.
const GONZALO = 'Gonzalo Pérez Ferrandis';
const GONZALO_Z = 'Gonzalo Pérez Ferrandiz';
const GONZALO_INVERTIDO = 'Pérez Ferrandiz, Gonzalo';
const ROSARIO = 'Rosario Tamarit Belda';
const OTRO_GONZALO = 'Gonzalo Vidal Mas';

const CENTRO_REAL = 'IES Torre Alta de Mirabel';

const ficha = (num, titulo, modulo, extra) => {
  const f = F.fichaVacia(num);
  Object.assign(f, {
    titulo, sesiones: 8 + num, evaluacion: '1ª',
    raTexto: 'RA' + num + '. Reconoce los elementos de la materia.', ra: [num],
    ce: ['RA' + num + '.a. Se han identificado los elementos.', 'RA' + num + '.b. Se han descrito sus funciones.'],
    competencias: ['d) Gestionar sistemas y servicios.'],
    objetivos: ['e) Interpretar el diseño lógico.'],
    introduccion: ['Test de iniciación al módulo.'],
    no_evaluables: ['Debates sobre ' + modulo + '.', 'Ejercicios guiados.'],
    evaluables: ['Actividades prácticas del grupo.', 'Entrega de la práctica ' + num + '.', 'Prueba escrita.'],
    refuerzo: ['Videotutoriales.'],
    ampliacion: ['Desarrollo de un documento propio.'],
    recuperacion: ['Prueba escrita de los contenidos mínimos.'],
    recursos: ['Apuntes del profesorado.', 'Aules.'],
  }, extra);
  return { titulo, ficha: [{ filas: F.filasDeFicha(f), num, titulo, sesiones: f.sesiones, evaluacion: '1ª', ra: [num] }] };
};

// La otra maquetación de la ficha: una etiqueta por fila, el valor debajo.
const fichaEstrecha = () => ({
  titulo: 'Redes locales',
  ficha: [{
    num: 9, titulo: 'Redes locales', sesiones: 7, evaluacion: '2ª', ra: [4],
    filas: [
      [c('Situación de aprendizaje 9', { rowspan: 2, bold: true }), c('Redes locales', { rowspan: 2, bold: true }), c('Sesiones', { bold: true }), c('7', { bold: true })],
      [c('Evaluación', { bold: true }), c('2ª', { bold: true })],
      [c('Resultado(s) de aprendizaje', { bold: true }), c('RA4. Configura redes.', { colspan: 3 })],
      [c('Criterios de evaluación', { bold: true })], [c('RA4.a. Se ha configurado la red.')],
      [c('Competencias profesionales para la empleabilidad', { bold: true })], [c('d) Gestionar redes.')],
      [c('Objetivos de aprendizaje', { bold: true })], [c('e) Interpretar el esquema de red.')],
      [c('Tipificación de actividades formativas', { bold: true })],
      [c('Introducción', { bold: true })], [c('− Describir el origen de las redes.')],
      [c('Formativas no evaluables', { bold: true })], [c('− Configurar un equipo.\n− Revisar los cables.')],
      [c('Formativas evaluables', { bold: true })], [c('− Montar una red pequeña.')],
      [c('Actividades de refuerzo', { bold: true })], [c('− Repetir la práctica.')],
      [c('Actividades de ampliación', { bold: true })], [c('− Configurar una VLAN.')],
      [c('Actividades de recuperación', { bold: true })], [c('− Actividades similares a las enumeradas.')],
      [c('Materiales y recursos didácticos disponibles', { bold: true })], [c('− Packet Tracer.')],
    ],
  }],
});

const MODULOS = ['Base de datos', 'Programación', 'Sistemas Informáticos'];
const TITULOS = ['El modelo relacional', 'Diseño de bases de datos', 'Consultas SQL (I)', 'Consultas SQL (II)', 'Programación de bases de datos'];

function datosDePrueba() {
  const instancia = (titulo, titular, extra) => ({
    titulo, num: '9.1', grupo: 'MÓDULOS DEL PRIMER CURSO', docentes: [],
    valores: Object.assign({
      'modulos/identificacion-del-modulo-unidad-formativa': {
        ficha_modulo: {
          filas: [[c('Código', { bold: true }), c('0484')], [c('Titular', { bold: true }), c(titular)]],
          pares: [{ etiqueta: 'Código', valor: '0484' }, { etiqueta: 'Titular', valor: titular }],
        },
      },
      'modulos/propuestas-de-mejora-del-curso-anterior': {
        texto: [
          { type: 'p', text: 'Las propuestas de mejora del curso anterior son las siguientes:' },
          { type: 'list', items: [{ text: 'Añadir más prácticas con el profesor ' + GONZALO_Z + ' en grupo.', level: 0 }, { text: 'Revisar el reparto de horas del segundo trimestre, que fue muy ajustado.', level: 0 }] },
        ],
      },
      'modulos/relacion-con-otros-modulos': {
        texto: [{ type: 'p', text: 'Este módulo se coordina con el de ' + titulo + '. Para dudas, escribir a ' + GONZALO_INVERTIDO + ' (gperez@iestorrealta.test, 962 38 12 45) o llamar al 600123456.' }],
      },
    }, extra),
  });

  const items = (modulo) => TITULOS.map((t, i) => ficha(i + 1, t, modulo));
  const SA = 'modulos/situaciones-de-aprendizaje/situacion-de-aprendizaje';

  return {
    departamento: 'informatica',
    documento: {
      'introduccion/contextualizacion-de-la-docencia': {
        texto: [
          { type: 'p', text: 'Esta programación se ha diseñado para impartirla en el ' + CENTRO_REAL + '.' },
          { type: 'p', text: 'El ' + CENTRO_REAL.split(' de ')[0] + ' fue inaugurado en 1962 y reformado en 1999, y hoy tiene capacidad para 900 alumnos y alumnas, con un pabellón y cinco aulas de informática.' },
          { type: 'p', text: 'Mirabel es una ciudad situada al norte de la provincia. Tiene casi 22.000 habitantes y es la capital de la comarca del Valle del Cinqueño, que integra a 5 poblaciones menores.' },
          { type: 'list', items: [{ text: 'Educación Secundaria Obligatoria (ESO)', level: 0 }, { text: 'Bachillerato en las modalidades de Ciencias y Humanidades.', level: 0 }] },
        ],
      },
      'metodologia-y-orientaciones-didacticas/programa-plurilingue': {
        texto: [{ type: 'p', text: 'Al ser Mirabel una comarca limítrofe, el ' + CENTRO_REAL + ', en la comarca del Valle del Cinqueño, recibe alumnado de las poblaciones cercanas.' }],
      },
      'atencion-a-la-diversidad-y-educacion-inclusiva/evaluacion-inicial-de-los-grupos': {
        texto: [
          { type: 'list', items: [{ text: 'Tutor del primer curso: ' + ROSARIO + '.', level: 0 }, { text: 'Tutor del segundo curso: ' + OTRO_GONZALO, level: 0 }] },
          { type: 'p', text: 'Tras las primeras semanas de trabajo, se ha detectado en el aula que Lucas y Andrea no siguen el ritmo del grupo y necesitan apoyo en todas las prácticas.' },
        ],
        'tabla-motivacion': {
          filas: [
            [c('1º'), c('Motivación'), c('El alumnado muestra bastante interés, salvo dos alumnos con faltas continuas de asistencia.')],
            [c('Rendimiento'), c('El rendimiento es satisfactorio en la mayoría de los casos del grupo.')],
            [c('2º'), c('Motivación'), c('Buena')],
            [c('Rendimiento'), c('Bueno.')],
          ],
        },
      },
      'objetivos-generales-del-ciclo': {
        texto: [{ type: 'p', text: 'El real decreto establece que los objetivos generales del ciclo formativo son los siguientes.' }],
        'tabla-og-a': { filas: [[c('OG_a)'), c('Ajustar la configuración lógica del sistema.')]], pares: [{ etiqueta: 'OG_a)', valor: 'Ajustar la configuración lógica del sistema.' }] },
      },
      'practicas/empresas-colaboradoras': {
        texto: [{ type: 'p', text: 'Este curso colaboran, entre otras, Tecnodelta Ribera S.L. y Servicios Informáticos del Esparral, S.A., con visitas al aula.' }],
        'tabla-empresas': {
          filas: [
            [c('Empresa', { bold: true }), c('CIF', { bold: true }), c('Localidad', { bold: true }), c('Sector', { bold: true })],
            [c('Tecnodelta Ribera S.L.'), c('B12345678'), c('Alcorbeda'), c('Desarrollo de aplicaciones')],
            [c('Redes del Sur S.L.'), c('B87654321'), c('Pinoso Alto'), c('Redes y comunicaciones')],
            [c('Hosting Mirador S.A.'), c('A11223344'), c('Alcorbeda'), c('Alojamiento web')],
          ],
        },
      },
    },
    instancias: [
      instancia(MODULOS[0], GONZALO, { [SA]: { items: items(MODULOS[0]).concat([fichaEstrecha()]) } }),
      instancia(MODULOS[1], GONZALO_Z, { [SA]: { items: items(MODULOS[1]) } }),
      instancia(MODULOS[2], ROSARIO, { [SA]: { items: items(MODULOS[2]) } }),
    ],
    asignaciones: {},
    compartidos: {
      c001: {
        bloque: { type: 'p', text: 'Se estará muy pendiente del alumnado con más dificultad; en el curso anterior ' + GONZALO + ' dedicó muchas horas a ello.' },
        seccion: 'modulos/propuestas-de-mejora-del-curso-anterior', comun: false, responsable: 'jefe_departamento', modo: 'sugerido', version: 1,
      },
    },
  };
}

const todoElTexto = (x) => JSON.stringify(x);
// El esqueleto de un árbol: cadenas y números reducidos a su tipo y las listas
// con su longitud. Las claves `text` valen igual sea cadena o tramos con formato.
const forma = (x) => {
  if (typeof x === 'string') return 's';
  if (typeof x === 'number') return 'n';
  if (Array.isArray(x)) return x.map(forma);
  if (x && typeof x === 'object') {
    const r = {};
    Object.keys(x).forEach((k) => { r[k] = k === 'text' ? 't' : forma(x[k]); });
    return r;
  }
  return x;
};
const SA_CLAVE = 'modulos/situaciones-de-aprendizaje/situacion-de-aprendizaje';
const fichasDe = (datos) => datos.instancias.flatMap((i) => (i.valores[SA_CLAVE].items || []).flatMap((it) => it.ficha));

const original = datosDePrueba();
const resultado = S.sanear(original);

prueba('el documento de prueba se sanea sin hallazgos', () => {
  assert.ok(resultado.ok, JSON.stringify(resultado.hallazgos, null, 1));
  assert.deepEqual(resultado.hallazgos, []);
  assert.ok(resultado.datos);
});
const salida = resultado.datos;

// ---------------------------------------------------------------- nombres
prueba('un nombre se sustituye también dentro de un párrafo, y no solo en su celda', () => {
  const titular = salida.instancias[0].valores['modulos/identificacion-del-modulo-unidad-formativa'].ficha_modulo.pares[1].valor;
  assert.ok(S.esNombreInventado(titular), 'el titular no es uno de los inventados: ' + titular);
  const parrafo = salida.instancias[0].valores['modulos/relacion-con-otros-modulos'].texto[0].text;
  assert.ok(parrafo.indexOf(titular) >= 0, 'el nombre del párrafo no se ha cambiado por el mismo inventado');
  const viñeta = salida.instancias[0].valores['modulos/propuestas-de-mejora-del-curso-anterior'];
  assert.ok(todoElTexto(viñeta).indexOf('Pérez') < 0);
  const txt = todoElTexto(salida);
  ['Gonzalo', 'Ferrandis', 'Ferrandiz', 'Tamarit', 'Belda', 'Vidal'].forEach((t) => assert.ok(txt.indexOf(t) < 0, 'queda «' + t + '»'));
});

prueba('el nombre dentro de una frase conserva el resto de la frase', () => {
  const t = salida.instancias[1].valores['modulos/relacion-con-otros-modulos'].texto[0].text;
  assert.ok(/^Este módulo se coordina con el de Programación\. Para dudas, escribir a /.test(t), t);
  assert.ok(/ \(contacto1@iesvegaalta\.example, 600 000 001\) o llamar al 600 000 002\.$/.test(t) || /contacto1@iesvegaalta\.example/.test(t), t);
});

prueba('dos variantes del mismo nombre acaban en la misma persona inventada', () => {
  const titular = (i) => salida.instancias[i].valores['modulos/identificacion-del-modulo-unidad-formativa'].ficha_modulo.pares[1].valor;
  assert.equal(titular(0), titular(1), 'Ferrandis / Ferrandiz no se han unido');
  const personas = S.agruparPersonas(S.nombresDe(original));
  assert.equal(personas.length, 3, 'tres personas: Gonzalo (con tres grafías), Rosario y el otro Gonzalo');
  const g = personas.find((p) => p.variantes.indexOf(GONZALO) >= 0);
  assert.ok(g.variantes.indexOf(GONZALO_Z) >= 0);
  assert.notEqual(titular(0), titular(2));
});

prueba('la grafía con los apellidos primero también se une, y otro Gonzalo no', () => {
  const personas = S.agruparPersonas([GONZALO, GONZALO_INVERTIDO, OTRO_GONZALO]);
  assert.equal(personas.length, 2);
  assert.equal(personas[0].variantes.length, 2);
  assert.equal(S.sustituirPersonas('Habló con ' + GONZALO_INVERTIDO + ' y con Gonzalo Pérez.', personas),
    'Habló con ' + personas[0].inventado + ' y con ' + personas[0].inventado + '.');
});

prueba('una palabra con mayúscula delante del nombre no se lleva el nombre por delante', () => {
  const personas = S.agruparPersonas([ROSARIO]);
  assert.equal(S.sustituirPersonas('Tutor ' + ROSARIO + ' del grupo', personas), 'Tutor ' + personas[0].inventado + ' del grupo');
});

prueba('los nombres se recogen de pares, celdas, propiedades y párrafos', () => {
  const nombres = S.nombresDe({
    a: { pares: [{ etiqueta: 'Profesor/a', valor: 'Elvira Mas Pastor' }] },
    b: { filas: [[c('Coordinador/a'), c('Hilario Gil Soler')]] },
    c: { titular: 'Amparo Gisbert Lillo' },
    d: [{ type: 'p', text: 'Fdo.: Casimiro Ortuño Pla, jefe de estudios.' }],
    e: { pares: [{ etiqueta: 'Responsable', valor: 'Departamento de Informática' }] },
  });
  assert.deepEqual(nombres.sort(), ['Amparo Gisbert Lillo', 'Casimiro Ortuño Pla', 'Elvira Mas Pastor', 'Hilario Gil Soler']);
});

prueba('los nombres se recogen también de una columna bajo «Nombre», pero no de una tabla de empresas', () => {
  // Las memorias ponen a cada docente en una fila, con el nombre debajo de una
  // cabecera «Nombre | Iniciales | …». Esa columna no es una etiqueta de persona
  // al uso y sin esta regla los nombres no se sustituían.
  const nombres = S.nombresDe({
    doc: {
      filas: [
        [c('Nombre', { bold: true }), c('Iniciales', { bold: true })],
        [c('- Elvira Mas Pastor'), c('EMP')],
        [c('Hilario Gil Soler'), c('HGS')],
      ],
    },
    empresas: {
      filas: [
        [c('CIF'), c('Nombre'), c('Localidad'), c('Sector Productivo')],
        [c('B12345678'), c('Talleres del Río'), c('Alcorbeda'), c('Metal')],
      ],
    },
  });
  assert.deepEqual(nombres.sort(), ['Elvira Mas Pastor', 'Hilario Gil Soler']);
});

prueba('una tabla de metodologías con columna «Nombre» no se toma por personas', () => {
  // «Nombre» lo usa cualquier tabla. Si se tomara siempre por una lista de
  // personas, el guardia denunciaría «Aprendizaje basado en proyectos» como un
  // nombre sin sustituir y el documento no se podría publicar.
  const d = {
    documento: {
      'x/metodologia': {
        tabla: {
          filas: [
            [c('Nombre'), c('Descripción')],
            [c('Aprendizaje basado en proyectos'), c('El alumnado trabaja por proyectos.')],
            [c('Clase invertida'), c('El contenido se trabaja antes de la sesión.')],
          ],
        },
      },
    },
    instancias: [],
    compartidos: {},
  };
  assert.deepEqual(S.nombresDe(d), []);
  const r = S.sanear(d);
  assert.ok(r.ok, JSON.stringify(r.hallazgos));
  assert.equal(r.informe.personas, 0);
});

prueba('una columna de personas se reescribe aunque el valor sea corto', () => {
  const seccion = 'profesorado-del-departamento/profesores-del-departamento';
  const texto = 'La plantilla del departamento es la siguiente.';
  const d = {
    documento: {
      [seccion]: {
        texto: [{ type: 'p', text: texto }],
        'tabla-plantilla': {
          filas: [
            [c('Nombre', { bold: true }), c('Iniciales', { bold: true }), c('Cuerpo', { bold: true })],
            [c('Elvira Mas Pastor'), c('M'), c('PS')],
            [c('Hilario Gil Soler'), c('H'), c('PS')],
          ],
        },
      },
    },
    instancias: [],
    compartidos: {},
  };
  const r = S.sanear(d);
  assert.ok(r.ok, JSON.stringify(r.hallazgos));
  const s = r.datos.documento[seccion];
  assert.notEqual(s.texto[0].text, texto, 'el apartado no se reescribió');
  const f = s['tabla-plantilla'].filas;
  assert.equal(f[0][0].text, 'Nombre', 'se ha tocado la cabecera');
  assert.equal(f[0][1].text, 'Iniciales');
  assert.notEqual(f[1][0].text, 'Elvira Mas Pastor', 'el nombre de la columna no se sustituyó');
  assert.notEqual(f[1][1].text, 'M', 'una inicial de una letra se conservó como si fuera una etiqueta');
  assert.equal(f.length, 3, 'cambió el número de filas');
});

prueba('una tabla de personas cambia las iniciales y la localidad de residencia', () => {
  // Aunque el nombre ya esté cambiado, las iniciales y el pueblo entre paréntesis
  // identifican al docente. La tabla puede colgar de la portada, no de un
  // apartado de profesorado, así que la regla va por la forma de la tabla.
  const d = {
    documento: {
      'contenido-inicial': {
        tabla: {
          filas: [
            [c('Nombre', { bold: true }), c('Iniciales', { bold: true }), c('Cuerpo, situación y localidad', { bold: true })],
            [c('- Elvira Mas Pastor'), c('EMP'), c('PS – Definitivo (Mirabel)')],
            [c('- Hilario Gil Soler'), c('HGS'), c('PS – Definitivo (Alcorbeda)')],
          ],
        },
      },
    },
    instancias: [], compartidos: {},
  };
  const r = S.sanear(d);
  assert.ok(r.ok, JSON.stringify(r.hallazgos));
  const f = r.datos.documento['contenido-inicial'].tabla.filas;
  assert.equal(f[0][1].text, 'Iniciales', 'se ha tocado la cabecera');
  const nombre = f[1][0].text.replace(/^-\s*/, '');
  assert.ok(S.esNombreInventado(nombre), 'el nombre no se sustituyó');
  const esperadas = nombre.split(/\s+/).map((p) => p.charAt(0)).join('').toUpperCase().slice(0, 3);
  assert.equal(f[1][1].text, esperadas, 'las iniciales no son las del nombre inventado');
  assert.ok(f[1][2].text.indexOf('Mirabel') < 0, 'queda la localidad de residencia');
  assert.ok(f[2][2].text.indexOf('Alcorbeda') < 0, 'queda la localidad de residencia');
  assert.ok(f[1][2].text.indexOf('PS – Definitivo') === 0, 'la situación administrativa no es un dato personal');
});

prueba('las iniciales sueltas en otra tabla de personas también se cambian', () => {
  // El horario pone solo la sigla del profesor en la columna «Profesor» y la
  // sigla otra vez delante de los cargos. La tabla que sí trae el nombre y las
  // iniciales es la que dice qué sigla inventada le toca a cada persona.
  const d = {
    documento: {
      'contenido-inicial': {
        plantilla: {
          filas: [
            [c('Nombre', { bold: true }), c('Iniciales', { bold: true }), c('Cuerpo', { bold: true })],
            [c('- Elvira Mas Pastor'), c('EMP'), c('PS')],
          ],
        },
        horario: {
          filas: [
            [c('Profesor', { bold: true }), c('Cargos y otros', { bold: true }), c('Grupos horas', { bold: true })],
            [c('EMP'), c('EMP Coord. Departam. (2h)'), c('4 M 18h')],
          ],
        },
      },
    },
    instancias: [], compartidos: {},
  };
  const r = S.sanear(d);
  assert.ok(r.ok, JSON.stringify(r.hallazgos));
  const sec = r.datos.documento['contenido-inicial'];
  const sigla = sec.plantilla.filas[1][1].text;
  assert.notEqual(sigla, 'EMP', 'no se cambiaron las iniciales de la plantilla');
  assert.equal(sec.horario.filas[1][0].text, sigla, 'la sigla del horario no es la inventada');
  assert.ok(sec.horario.filas[1][1].text.indexOf(sigla) === 0, 'la sigla delante de los cargos no se cambió');
  assert.ok(sec.horario.filas[1][1].text.indexOf('MGM') < 0);
  assert.equal(sec.horario.filas[1][2].text, '4 M 18h', 'se ha tocado el recuento de horas');
});

prueba('una lista de profesorado en párrafos sueltos se sustituye', () => {
  // Las propuestas y los PCCF escriben el profesorado como párrafos sueltos, sin
  // tabla ni etiqueta: se ve el encabezado «Profesorado» y debajo los nombres.
  const d = {
    documento: {
      'contenido-inicial': {
        texto: [
          { type: 'p', text: 'Profesorado' },
          { type: 'p', text: 'Elvira Mas Pastor' },
          { type: 'p', text: 'Hilario Gil Soler' },
          { type: 'p', text: 'Curso 2025–2026' },
        ],
      },
    },
    instancias: [], compartidos: {},
  };
  const r = S.sanear(d);
  assert.ok(r.ok, JSON.stringify(r.hallazgos));
  const t = r.datos.documento['contenido-inicial'].texto;
  assert.equal(t[0].text, 'Profesorado', 'se ha tocado el encabezado');
  assert.ok(S.esNombreInventado(t[1].text), 'el primer nombre no se sustituyó');
  assert.ok(S.esNombreInventado(t[2].text), 'el segundo nombre no se sustituyó');
  assert.equal(t[3].text, 'Curso 2025–2026', 'se ha tocado el curso');
});

prueba('la lista de un equipo docente con la carga de cada uno se sustituye', () => {
  // En un PCCF la lista va dentro de un bloque de elementos y cada uno es
  // «Nombre Apellido Apellido: módulos que imparte».
  const d = {
    documento: {
      'contenido-inicial': {
        texto: [{
          type: 'list',
          items: [
            { text: 'Familia profesional: INFORMÁTICA Y COMUNICACIONES' },
            { text: 'Duración: 2.000 horas' },
            { text: 'Equipo docente responsable: lista de integrantes' },
            { text: 'Elvira Mas Pastor: tutora de 1º y profesora de bases de datos' },
            { text: 'Hilario Gil Soler: profesor de programación (1º)' },
          ],
        }],
      },
    },
    instancias: [], compartidos: {},
  };
  const r = S.sanear(d);
  assert.ok(r.ok, JSON.stringify(r.hallazgos));
  const items = r.datos.documento['contenido-inicial'].texto[0].items.map((x) => x.text);
  assert.equal(items[0], 'Familia profesional: INFORMÁTICA Y COMUNICACIONES', 'se ha tocado una etiqueta');
  assert.equal(items[2], 'Equipo docente responsable: lista de integrantes');
  assert.ok(items[3].indexOf('Elvira Mas Pastor') < 0, 'el nombre del tutor no se sustituyó');
  assert.ok(items[4].indexOf('Hilario Gil Soler') < 0, 'el nombre del profesor no se sustituyó');
  assert.equal(items[3].slice(items[3].indexOf(':')), ': tutora de 1º y profesora de bases de datos', 'se ha perdido la carga');
});

prueba('el guardia avisa de un nombre suelto en un párrafo', () => {
  const personas = S.agruparPersonas(['Elvira Mas Pastor'], new Set());
  const h = S.revisar({
    documento: { 'contenido-inicial': { texto: [{ type: 'p', text: 'Elvira Mas Pastor' }] } },
    instancias: [], compartidos: {},
  }, { personas });
  assert.ok(h.some((x) => x.tipo === 'nombre de persona del original'), 'no se ha avisado del nombre');
});

prueba('una tabla de procedencia del alumnado cambia los pueblos y conserva los recuentos', () => {
  const d = {
    documento: {
      'contenido-inicial': {
        tabla: {
          filas: [
            [c('Provincia', { bold: true }), c('Localidad', { bold: true }), c('Alumnos', { bold: true, colspan: 4 })],
            [c('Riosalce', { rowspan: 2 }), c('Mirabel'), c('21'), c('92%')],
            [c('Alcorbeda'), c('1'), c('4%')],
          ],
        },
      },
    },
    instancias: [], compartidos: {},
  };
  const r = S.sanear(d);
  assert.ok(r.ok, JSON.stringify(r.hallazgos));
  const f = r.datos.documento['contenido-inicial'].tabla.filas;
  assert.equal(f[0][0].text, 'Provincia', 'se ha tocado la cabecera');
  assert.ok(f[1][0].text !== 'Riosalce' && f[1][1].text !== 'Mirabel', 'quedan pueblos reales');
  assert.ok(f[2][0].text !== 'Alcorbeda', 'queda un pueblo real');
  assert.equal(f[1][2].text, '21', 'se ha reescrito un recuento');
  assert.equal(f[1][3].text, '92%', 'se ha reescrito un porcentaje');
});

prueba('el guardia avisa de un pueblo real en una tabla de procedencia', () => {
  const h = S.revisar({
    tabla: {
      filas: [
        [c('Provincia', { bold: true }), c('Localidad', { bold: true }), c('Alumnos', { bold: true })],
        [c('Riosalce', { rowspan: 2 }), c('Mirabel'), c('21')],
        [c('Alcorbeda'), c('1')],
      ],
    },
  });
  assert.ok(h.some((x) => x.tipo === 'pueblo sin sustituir'), 'no se ha avisado del pueblo');
});

prueba('una tabla de procedencia dentro de un apartado reescrito no salta en el guardia', () => {
  // Al reescribir el apartado entero, la tabla deja de tener pueblos y pasa a
  // tener frases. El guardia no debe tomar esas frases por pueblos sin cambiar.
  const sec = 'docencia-en-ciclos-formativos/grupos-de-alumnos-y-estadisticas-de-los-grupos';
  const d = {
    documento: {
      [sec]: {
        tabla: {
          filas: [
            [c('Provincia', { bold: true }), c('Localidad', { bold: true }), c('Alumnos', { bold: true })],
            [c('Riosalce', { rowspan: 2 }), c('Mirabel'), c('21'), c('92%')],
            [c('Alcorbeda'), c('1'), c('4%')],
          ],
        },
      },
    },
    instancias: [], compartidos: {},
  };
  const r = S.sanear(d);
  assert.ok(r.ok, JSON.stringify(r.hallazgos));
  const f = r.datos.documento[sec].tabla.filas;
  assert.equal(f[0][1].text, 'Localidad', 'se ha tocado la cabecera');
  assert.ok(f[1][1].text !== 'Mirabel', 'la tabla no se reescribió');
});

prueba('el guardia avisa de unas iniciales que no son las del nombre inventado', () => {
  const h = S.revisar({
    tabla: {
      filas: [
        [c('Nombre', { bold: true }), c('Iniciales', { bold: true }), c('Cuerpo', { bold: true })],
        [c('Marta Olmos Quintana'), c('EMP'), c('PS')],
      ],
    },
  });
  assert.ok(h.some((x) => x.tipo === 'iniciales sin sustituir'), 'no se ha avisado de las iniciales');
});

prueba('un apartado de memoria se reescribe con todos sus subapartados', () => {
  // «valoracion-de-la-docencia» tiene cinco subapartados; enumerarlos uno a uno
  // dejaría fuera el que se añada mañana.
  const base = 'docencia-en-ciclos-formativos/valoracion-de-la-docencia';
  const hija = base + '/grado-de-consecucion-de-los-objetivos-marcados';
  const padre = 'Valoración general del curso con el grupo concreto.';
  const niña = 'Se han alcanzado casi todos los objetivos del grupo.';
  const d = {
    documento: {
      [base]: { texto: [{ type: 'p', text: padre }] },
      [hija]: { texto: [{ type: 'p', text: niña }] },
    },
    instancias: [],
    compartidos: {},
  };
  const r = S.sanear(d);
  assert.ok(r.ok, JSON.stringify(r.hallazgos));
  assert.notEqual(r.datos.documento[base].texto[0].text, padre);
  assert.notEqual(r.datos.documento[hija].texto[0].text, niña, 'el subapartado se quedó como estaba');
  assert.equal(r.informe.apartadosReescritos, 2);
});

// ---------------------------------------------------------------- guardia
prueba('el guardia detecta un nombre sin sustituir, aunque no esté en ninguna lista', () => {
  const h = S.revisar({ pares: [{ etiqueta: 'Titular', valor: 'Anselmo Garrido Pons' }] });
  assert.equal(h.length, 1);
  assert.equal(h[0].tipo, 'nombre de persona sin sustituir');
  assert.ok(h[0].contexto.indexOf('Anselmo') >= 0, 'el hallazgo no dice dónde está');
  const h2 = S.revisar({ texto: [{ type: 'p', text: 'Tutor del grupo: Anselmo Garrido Pons.' }] });
  assert.equal(h2.length, 1, 'tampoco en medio de un párrafo');
  assert.deepEqual(S.revisar({ pares: [{ etiqueta: 'Titular', valor: S.inventada(3) }] }), []);
  assert.deepEqual(S.revisar({ pares: [{ etiqueta: 'Responsable', valor: 'Departamento de Informática' }] }), []);
});

prueba('el guardia detecta un correo, un teléfono y un CIF', () => {
  const tipos = (t) => S.revisar({ texto: [{ type: 'p', text: t }] }).map((x) => x.tipo);
  assert.deepEqual(tipos('Escribir a alguien@dominio.test para más datos.'), ['correo']);
  assert.deepEqual(tipos('Llamar al 962 38 12 45 por la tarde.'), ['teléfono']);
  assert.deepEqual(tipos('La empresa con CIF B12345678 firmó el convenio.'), ['CIF/NIF']);
  assert.deepEqual(tipos('El alumno con DNI 12345678Z faltó.'), ['CIF/NIF']);
  assert.deepEqual(tipos('Contacto: contacto1@iesvegaalta.example, 600 000 001, X00000001.'), [], 'los inventados no son hallazgos');
});

prueba('el guardia detecta el centro, la comarca y las empresas que no sean las inventadas', () => {
  const tipos = (t) => S.revisar({ texto: [{ type: 'p', text: t }] }).map((x) => x.tipo);
  assert.deepEqual(tipos('Se imparte en el IES Cañada Honda de Altozano.'), ['centro']);
  assert.deepEqual(tipos('Se imparte en el IES Vega Alta de Altozano.'), ['localidad']);
  assert.deepEqual(tipos('Es la capital de la comarca del Alto Segre Menor.'), ['comarca']);
  assert.deepEqual(tipos('Colabora Tecnodelta Ribera S.L. con el ciclo.'), ['empresa']);
  assert.deepEqual(tipos('Se imparte en el IES Vega Alta de Villalba del Río, comarca del Alto Cañizar.'), []);
  assert.deepEqual(tipos('Colabora Aldea Digital S.L. con el ciclo.'), []);
  const e = S.revisar({ filas: [[c('Empresa'), c('Localidad')], [c('Luna Roja'), c('Valdemira')]] });
  assert.deepEqual(e.map((x) => x.tipo), ['empresa sin sustituir']);
});

prueba('si el guardia encuentra algo, sanear no devuelve datos', () => {
  const malo = datosDePrueba();
  // un CIF en minúsculas: el sustituidor distingue mayúsculas, el guardia no
  malo.documento['objetivos-generales-del-ciclo'].texto.push({ type: 'p', text: 'Convenio con la entidad b12345678 vigente.' });
  const r = S.sanear(malo);
  assert.equal(r.ok, false);
  assert.equal(r.datos, null, 'se devolvió el resultado con un hallazgo pendiente');
  assert.equal(r.hallazgos.length, 1);
  assert.equal(r.hallazgos[0].tipo, 'CIF/NIF');
  assert.ok(r.hallazgos[0].contexto.indexOf('b12345678') >= 0 && r.hallazgos[0].ruta.indexOf('objetivos-generales') >= 0);
});

prueba('un dato indicado a mano que se cuele se sustituye, y si se olvida el guardia lo ve', () => {
  const d = datosDePrueba();
  d.documento['objetivos-generales-del-ciclo'].texto.push({ type: 'p', text: 'Visita a la planta de Fábricas Unidas de Mirabel.' });
  const r = S.sanear(d, { sustituciones: [{ buscar: 'Fábricas Unidas', por: 'Industrias Ejemplo' }] });
  assert.ok(r.ok, JSON.stringify(r.hallazgos));
  assert.ok(todoElTexto(r.datos).indexOf('Industrias Ejemplo') >= 0);
});

// ---------------------------------------------------------------- centro, correo, empresas
prueba('el centro, la localidad y la comarca se cambian y quedan coherentes', () => {
  const txt = todoElTexto(salida);
  ['Torre Alta', 'Mirabel', 'Cinqueño'].forEach((t) => assert.ok(txt.indexOf(t) < 0, 'queda «' + t + '»'));
  const plur = salida.documento['metodologia-y-orientaciones-didacticas/programa-plurilingue'].texto[0].text;
  assert.equal(plur, 'Al ser ' + S.CENTRO.localidad + ' una comarca limítrofe, el ' + S.CENTRO.nombre + ' de ' + S.CENTRO.localidad
    + ', en la comarca del ' + S.CENTRO.comarca + ', recibe alumnado de las poblaciones cercanas.');
  const ctx = todoElTexto(salida.documento['introduccion/contextualizacion-de-la-docencia']);
  assert.ok(ctx.indexOf('1962') < 0 && ctx.indexOf('22.000') < 0, 'quedan datos propios del centro real');
});

prueba('un artículo detrás de «IES.» no se toma por el nombre del centro', () => {
  // «…ofrecido por el IES. Los centros de trabajo no distarán…»: sin este
  // filtro, «Los» se colaba como nombre del centro y luego se sustituían todos
  // los artículos del documento, incluidos los de las frases normativas.
  const frase = 'La elección la hace el centro ofrecido por el IES. Los centros de trabajo no distarán más de 30 kilómetros.';
  const d = { documento: { 'x/y': { texto: [{ type: 'p', text: frase }] } }, instancias: [], compartidos: {} };
  assert.deepEqual(S.centroDe(d).centros, []);
  const r = S.sanear(d);
  assert.ok(r.ok, JSON.stringify(r.hallazgos));
  assert.equal(r.datos.documento['x/y'].texto[0].text, frase, 'se ha tocado un artículo');
});

prueba('el centro y la localidad de la portada separados por guion se cambian', () => {
  // La portada escribe «IES … – Localidad», no «IES … de Localidad». Si la
  // localidad no se recogiera, el nombre del pueblo viajaría al ejemplo.
  const d = {
    documento: { 'contenido-inicial': { texto: [{ type: 'p', text: 'IES Torre Alta – Mirabel' }] } },
    instancias: [], compartidos: {},
  };
  assert.deepEqual(S.centroDe(d).centros, ['Torre Alta']);
  assert.deepEqual(S.centroDe(d).localidades, ['Mirabel']);
  const r = S.sanear(d);
  assert.ok(r.ok, JSON.stringify(r.hallazgos));
  const t = r.datos.documento['contenido-inicial'].texto[0].text;
  assert.ok(t.indexOf('Torre Alta') < 0 && t.indexOf('Mirabel') < 0, 'queda el centro o la localidad');
});

prueba('correos, teléfonos, CIF y empresas se inventan enteros con el formato de los reales', () => {
  const t = salida.documento['practicas/empresas-colaboradoras']['tabla-empresas'].filas;
  const orig = original.documento['practicas/empresas-colaboradoras']['tabla-empresas'].filas;
  assert.equal(t.length, orig.length, 'cambió el número de filas');
  t.slice(1).forEach((fila, i) => {
    assert.match(fila[1].text, /^X\d{8}$/, 'el CIF inventado no tiene forma de CIF');
    assert.notEqual(fila[0].text, orig[i + 1][0].text);
    assert.match(fila[0].text, /^[A-ZÁ-Ú][\wá-úñ]+ [A-Z][\wá-úñ ]+ (S\.L\.|S\.A\.)$/, 'la empresa perdió el formato: ' + fila[0].text);
    assert.notEqual(fila[2].text, orig[i + 1][2].text);
    assert.notEqual(fila[3].text, orig[i + 1][3].text);
  });
  assert.equal(t[1][2].text, t[3][2].text, 'dos empresas del mismo pueblo deben seguir en el mismo pueblo');
  assert.ok(t[1][0].text.endsWith('S.L.') && t[3][0].text.endsWith('S.A.'), 'se conserva la forma jurídica');
  const parrafo = salida.documento['practicas/empresas-colaboradoras'].texto[0].text;
  assert.ok(parrafo.indexOf(t[1][0].text) >= 0, 'la empresa de la tabla y la del párrafo no coinciden');
  assert.ok(parrafo.indexOf('Esparral') < 0, 'una empresa con coma antes de la forma jurídica se escapó');
  const txt = todoElTexto(salida);
  assert.ok(!/@iestorrealta|962 38|600123456|B12345678|Alcorbeda/.test(txt));
  assert.ok(/contacto\d@iesvegaalta\.example/.test(txt) && /600 000 \d{3}/.test(txt));
  assert.equal(resultado.informe.empresas, 4);
  assert.equal(resultado.informe.correos, 3);
});

prueba('una tabla de empresas con cabecera «Nombre» y sin forma jurídica se sanea', () => {
  // Los PCCF llaman «Nombre» a la columna de la empresa y muchas no llevan
  // S.L./S.A. Si la tabla solo se reconociera por la etiqueta «Empresa», esos
  // nombres viajarían enteros al ejemplo.
  const filas = [
    [c('CIF', { bold: true }), c('Nombre', { bold: true }), c('Localidad', { bold: true }), c('Sector Productivo', { bold: true })],
    [c('B12345678'), c('Talleres del Río'), c('Alcorbeda'), c('Metal')],
    [c('A11223344'), c('Consultora Norte, S.A.'), c('Pinoso Alto'), c('Consultoría')],
  ];
  const d = { documento: { 'practicas/empresas': { texto: [], 'tabla-empresas': { filas } } }, instancias: [], compartidos: {} };
  const r = S.sanear(d);
  assert.ok(r.ok, JSON.stringify(r.hallazgos));
  const s = r.datos.documento['practicas/empresas']['tabla-empresas'].filas;
  s.slice(1).forEach((f, i) => {
    assert.notEqual(f[1].text, filas[i + 1][1].text, 'el nombre de la empresa no se sustituyó');
    assert.match(f[0].text, /^X\d{8}$/, 'el CIF no se sustituyó');
    assert.notEqual(f[2].text, filas[i + 1][2].text, 'la localidad no se sustituyó');
  });
  assert.equal(r.informe.empresas, 2);
});

prueba('sanear algo ya saneado no da hallazgos ni reparte otra vez las personas y las empresas', () => {
  const otra = S.sanear(salida);
  assert.ok(otra.ok, JSON.stringify(otra.hallazgos));
  // los apartados reescritos y las fichas se vuelven a inventar; lo identificativo no cambia
  assert.deepEqual(otra.datos.instancias.map((i) => i.valores['modulos/identificacion-del-modulo-unidad-formativa']),
    salida.instancias.map((i) => i.valores['modulos/identificacion-del-modulo-unidad-formativa']));
  assert.deepEqual(otra.datos.documento['practicas/empresas-colaboradoras'], salida.documento['practicas/empresas-colaboradoras']);
  assert.deepEqual(otra.datos.instancias.map((i) => i.valores['modulos/relacion-con-otros-modulos']),
    salida.instancias.map((i) => i.valores['modulos/relacion-con-otros-modulos']));
});

// ---------------------------------------------------------------- estructura
prueba('la estructura no cambia: secciones, instancias, bloques y filas', () => {
  assert.deepEqual(forma(salida), forma(original));
  assert.deepEqual(Object.keys(salida.documento), Object.keys(original.documento));
  assert.deepEqual(salida.instancias.map((i) => i.titulo), original.instancias.map((i) => i.titulo));
  assert.deepEqual(salida.instancias.map((i) => Object.keys(i.valores)), original.instancias.map((i) => Object.keys(i.valores)));
  assert.deepEqual(Object.keys(salida.compartidos), Object.keys(original.compartidos));
});

prueba('las fichas conservan RA, criterios, competencias, objetivos, sesiones y evaluación', () => {
  const a = fichasDe(original);
  const b = fichasDe(salida);
  assert.equal(a.length, 16);
  a.forEach((fa, i) => {
    const fb = b[i];
    assert.deepEqual(fb.ra, fa.ra);
    ['num', 'titulo', 'sesiones', 'evaluacion'].forEach((k) => assert.equal(fb[k], fa[k], k));
    assert.equal(fb.filas.length, fa.filas.length, 'cambió el número de filas de la ficha');
    const ma = F.fichaDeFilas(fa.filas, fa);
    const mb = F.fichaDeFilas(fb.filas, fb);
    ['raTexto', 'ce', 'competencias', 'objetivos'].forEach((k) => assert.deepEqual(mb[k], ma[k], k));
    assert.deepEqual(mb.ra, ma.ra);
    assert.equal(mb.sesiones, ma.sesiones);
  });
});

prueba('los campos docentes de la ficha tienen los mismos elementos y distintos de los originales', () => {
  const a = fichasDe(original);
  const b = fichasDe(salida);
  a.forEach((fa, i) => {
    const ma = F.fichaDeFilas(fa.filas, fa);
    const mb = F.fichaDeFilas(b[i].filas, b[i]);
    S.CAMPOS_DOCENTES.forEach((campo) => {
      assert.equal(mb[campo].length, ma[campo].length, campo + ' de la ficha ' + i + ' cambió de tamaño');
      if (!ma[campo].length) return;
      assert.notDeepEqual(mb[campo], ma[campo], campo + ' de la ficha ' + i + ' sigue igual');
      mb[campo].forEach((l, k) => assert.notEqual(l, ma[campo][k], campo + ' línea ' + k + ' sigue igual'));
    });
  });
});

prueba('la ficha en la maquetación estrecha conserva sus viñetas y su forma', () => {
  const f = salida.instancias[0].valores[SA_CLAVE].items[5].ficha[0];
  assert.ok(f.filas[13][0].text.split('\n').every((l) => l.startsWith('− ')), 'se perdieron las viñetas');
  assert.equal(f.filas[13][0].text.split('\n').length, 2);
  assert.equal(f.filas[11][0].text.split('\n').length, 1);
  assert.equal(f.filas[3][0].text, 'Criterios de evaluación', 'las etiquetas no se tocan');
  assert.equal(f.filas[4][0].text, 'RA4.a. Se ha configurado la red.');
});

prueba('una ficha en forma de modelo (campos en listas) también se sanea', () => {
  const d = { instancias: [{ titulo: 'Base de datos', valores: { [SA_CLAVE]: { items: [{ titulo: 'Consultas SQL', ficha: [F.fichaDeFilas([], { num: 3, titulo: 'Consultas SQL' })] }] } } }] };
  const m = d.instancias[0].valores[SA_CLAVE].items[0].ficha[0];
  m.evaluables = ['Prueba con datos de Pepe.', 'Entrega de la práctica.'];
  m.ce = ['RA3.a. Se han identificado las herramientas.'];
  const r = S.sanear(d);
  assert.ok(r.ok);
  const n = r.datos.instancias[0].valores[SA_CLAVE].items[0].ficha[0];
  assert.equal(n.evaluables.length, 2);
  assert.notDeepEqual(n.evaluables, m.evaluables);
  assert.deepEqual(n.ce, m.ce);
  assert.deepEqual(n.introduccion, []);
});

prueba('los apartados con valoraciones internas se reescriben con el mismo tamaño y la misma forma', () => {
  const sec = 'atencion-a-la-diversidad-y-educacion-inclusiva/evaluacion-inicial-de-los-grupos';
  const o = original.documento[sec];
  const s = salida.documento[sec];
  assert.deepEqual(forma(s), forma(o));
  assert.ok(S.esNombreInventado(s.texto[0].items[0].text.replace(/^[^:]+:\s*/, '').replace(/\.$/, '')), 'la línea del tutor debe quedar con su nombre inventado');
  assert.ok(s.texto[0].items[0].text.startsWith('Tutor del primer curso: '));
  assert.ok(todoElTexto(s).indexOf('Lucas') < 0 && todoElTexto(s).indexOf('Andrea') < 0, 'quedan alumnos con nombre');
  assert.equal(s['tabla-motivacion'].filas[0][1].text, 'Motivación', 'las etiquetas de la tabla se conservan');
  assert.notEqual(s['tabla-motivacion'].filas[0][2].text, o['tabla-motivacion'].filas[0][2].text);
  assert.equal(s['tabla-motivacion'].filas[2][2].text, 'Buena', 'lo que es una valoración de una palabra se queda');
  const largo = (x) => todoElTexto(x).length;
  assert.ok(largo(s) > largo(o) * 0.5 && largo(s) < largo(o) * 1.6, 'el tamaño se ha ido: ' + largo(o) + ' -> ' + largo(s));
});

prueba('también se reescribe la copia compartida del apartado', () => {
  const c1 = salida.compartidos.c001;
  assert.equal(c1.bloque.type, 'p');
  assert.notEqual(c1.bloque.text, original.compartidos.c001.bloque.text);
  assert.ok(c1.bloque.text.indexOf('Gonzalo') < 0);
  assert.equal(c1.seccion, original.compartidos.c001.seccion);
});

prueba('la prosa normativa y pedagógica general se deja como estaba', () => {
  assert.deepEqual(salida.documento['objetivos-generales-del-ciclo'], original.documento['objetivos-generales-del-ciclo']);
});

// ---------------------------------------------------------------- generador
prueba('el generador es determinista: dos ejecuciones dan lo mismo', () => {
  const a = S.sanear(datosDePrueba());
  const b = S.sanear(datosDePrueba());
  assert.equal(JSON.stringify(a.datos), JSON.stringify(b.datos));
  const g1 = S.crearGenerador();
  const g2 = S.crearGenerador();
  const cab = { modulo: 'Base de datos', titulo: 'El modelo relacional', num: 1 };
  assert.deepEqual(S.inventarActividades(g1, cab, 'evaluables', 3, []), S.inventarActividades(g2, cab, 'evaluables', 3, []));
});

prueba('el generador no repite el mismo texto en fichas distintas ni dentro de una', () => {
  const fichas = fichasDe(salida).map((f) => F.fichaDeFilas(f.filas, f));
  ['introduccion', 'no_evaluables', 'evaluables', 'refuerzo', 'ampliacion', 'recuperacion'].forEach((campo) => {
    const lineas = fichas.flatMap((f) => f[campo]);
    assert.equal(new Set(lineas).size, lineas.length, campo + ' repite líneas entre fichas');
  });
  const listas = fichas.map((f) => f.recursos.join('|'));
  assert.equal(new Set(listas).size, listas.length, 'dos fichas tienen exactamente los mismos materiales');
  const seguidas = fichas.map((f) => f.evaluables.join('|'));
  seguidas.forEach((t, i) => assert.ok(i < 2 || !(t === seguidas[i - 1] && t === seguidas[i - 2]), 'tres fichas seguidas iguales'));
});

prueba('el vocabulario sigue al tema del módulo', () => {
  const g = S.crearGenerador();
  const bd = S.inventarActividades(g, { modulo: 'Base de datos', titulo: 'El modelo relacional', num: 1 }, 'recursos', 3, []).join(' ');
  const web = S.inventarActividades(g, { modulo: 'Desarrollo web en entorno cliente', titulo: 'DOM y BOM', num: 5 }, 'recursos', 3, []).join(' ');
  assert.ok(/relacional|tablas|consultas|datos|SQL|clave|entidad|vistas|transacci/i.test(bd), bd);
  assert.ok(/JavaScript|DOM|navegador|eventos|componentes|API|Node|React|Vite|MDN/i.test(web), web);
  assert.equal(S.temaDeFicha('Sistemas Informáticos', 'Redes.'), 'redes');
  assert.equal(S.temaDeFicha('Módulo desconocido', 'Algo'), 'general');
  assert.throws(() => S.inventarActividades(g, { modulo: 'x', titulo: 'y', num: 1 }, 'ce', 2, []), /campo no docente/);
});

// ------------------------------------------------------------------ limpieza por exclusión
// Lo que se limpia de una ficha no se decide por una lista de campos conocidos,
// sino por exclusión: se conserva lo que su etiqueta delata como normativo y se
// reescribe todo lo demás. Estas pruebas fijan ese criterio, porque el de antes
// —por lista— dejaba pasar en silencio la ficha de un módulo que usa otras
// etiquetas, y lo que pasa sin que nadie lo mire acaba publicado.
const unDocumentoCon = (filas) => ({
  departamento: 'informatica',
  documento: {},
  instancias: [{
    titulo: 'Base de datos',
    num: '9.1',
    grupo: 'MÓDULOS DEL PRIMER CURSO',
    docentes: [],
    valores: {
      'modulos/situaciones-de-aprendizaje': {
        items: [{ titulo: 'El modelo relacional', ficha: [{ num: 1, titulo: 'El modelo relacional', sesiones: 9, evaluacion: '1ª', ra: [2], filas }] }],
      },
    },
  }],
  compartidos: {},
});

const CABECERA = [
  [c('Situación de aprendizaje 1', { rowspan: 2, bold: true }), c('El modelo relacional', { rowspan: 2, bold: true }), c('Sesiones', { bold: true }), c('9', { bold: true })],
  [c('Evaluación', { bold: true }), c('1ª', { bold: true })],
  [c('Resultado(s) de aprendizaje', { bold: true }), c('RA2. Crea bases de datos.', { colspan: 3 })],
];

const fichaSaneada = (datos) => {
  const r = S.sanear(datos);
  assert.ok(r.ok, 'el guardia encontró algo: ' + JSON.stringify((r.hallazgos || []).map((h) => h.tipo)));
  return r.datos.instancias[0].valores['modulos/situaciones-de-aprendizaje'].items[0].ficha[0].filas;
};

prueba('una etiqueta de ficha que no está en la lista también se limpia', () => {
  // «Actividades Complementarias» y «Materiales y recursos disponibles» no son
  // las etiquetas canónicas, pero lo que llevan debajo lo escribió un docente.
  const original = 'Charla técnica con una empresa del polígono y visita a sus instalaciones.';
  const filas = fichaSaneada(unDocumentoCon(CABECERA.concat([
    [c('Actividades Complementarias', { bold: true })],
    [c('− ' + original)],
    [c('Materiales y recursos disponibles', { bold: true })],
    [c('− Aula con ordenadores y proyector del centro.')],
  ])));

  assert.equal(filas[3][0].text, 'Actividades Complementarias', 'la etiqueta es la estructura y no se toca');
  assert.ok(filas[4][0].text.indexOf(original) < 0, 'el material docente de una etiqueta desconocida sobrevivió');
  assert.ok(/^−\s/.test(filas[4][0].text), 'se pierde la viñeta del documento');
  assert.equal(filas[5][0].text, 'Materiales y recursos disponibles');
  assert.ok(filas[6][0].text.indexOf('Aula con ordenadores') < 0);
});

prueba('una etiqueta normativa que no se reconoce se conserva', () => {
  // Un módulo escribe «Competencias personales y sociales» donde los demás
  // ponen «Competencias profesionales para la empleabilidad». Es texto del real
  // decreto: reescribirlo dejaría un documento falso.
  const normativo = 'Competencias personales y sociales: colaborar en equipo y resolver conflictos.';
  const filas = fichaSaneada(unDocumentoCon(CABECERA.concat([
    [c('Competencias personales y sociales. Aprendizaje a lo largo de la vida', { bold: true })],
    [c(normativo)],
    [c('Saberes básicos del módulo', { bold: true })],
    [c('Bases de datos relacionales y lenguaje SQL.')],
  ])));

  assert.equal(filas[4][0].text, normativo, 'se ha reescrito texto normativo');
  assert.equal(filas[6][0].text, 'Bases de datos relacionales y lenguaje SQL.', 'los saberes también son normativos');
});

prueba('una etiqueta sin valor debajo no confunde a la de abajo', () => {
  // «Tipificación de actividades formativas» es un encabezado: lo que lleva
  // debajo es otra fila de etiquetas, no contenido.
  const filas = fichaSaneada(unDocumentoCon(CABECERA.concat([
    [c('Tipificación de actividades formativas', { colspan: 4, bold: true })],
    [c('Introducción', { colspan: 2, bold: true }), c('Formativas no evaluables', { bold: true }), c('Formativas evaluables', { bold: true })],
    [c('Test de iniciación.', { colspan: 2 }), c('Debate en clase.'), c('Práctica entregable.')],
  ])));

  assert.equal(filas[4][0].text, 'Introducción', 'se ha reescrito una fila de etiquetas');
  assert.equal(filas[4][1].text, 'Formativas no evaluables');
  assert.ok(filas[5][0].text.indexOf('Test de iniciación.') < 0, 'el contenido no se reescribió');
  assert.ok(filas[5][2].text.indexOf('Práctica entregable.') < 0);
});

prueba('una ficha con las etiquetas sin negrita también se limpia', () => {
  // Hay módulos que escriben la ficha entera sin negritas. Si la etiqueta solo
  // se reconociera por el formato, el material docente pasaría intacto.
  const filas = fichaSaneada(unDocumentoCon(CABECERA.concat([
    [c('Tipificación de actividades formativas')],
    [c('Introducción'), c('Formativas no evaluables'), c('Formativas evaluables')],
    [c('− Actividad inicial del docente.'), c('− Debate guiado en clase.'), c('− Práctica entregable con datos.')],
    [c('Actividades de refuerzo'), c('Actividades de ampliación')],
    [c('− Repaso individual.'), c('− Reto adicional.')],
    [c('Actividades de recuperación')],
    [c('− Prueba de recuperación.')],
    [c('Materiales y recursos didácticos disponibles')],
    [c('− Aula con ordenadores.')],
  ])));

  assert.equal(filas[4][0].text, 'Introducción', 'se ha reescrito una fila de etiquetas');
  assert.equal(filas[4][1].text, 'Formativas no evaluables');
  assert.ok(filas[5][0].text.indexOf('Actividad inicial del docente') < 0, 'el contenido no se reescribió');
  assert.ok(filas[5][1].text.indexOf('Debate guiado en clase') < 0, 'el contenido no se reescribió');
  assert.ok(filas[7][0].text.indexOf('Repaso individual') < 0, 'el refuerzo no se reescribió');
  assert.ok(filas[9][0].text.indexOf('Prueba de recuperación') < 0, 'la recuperación no se reescribió');
  assert.ok(filas[11][0].text.indexOf('Aula con ordenadores') < 0, 'los materiales no se reescribieron');
  assert.equal(filas[8][0].text, 'Actividades de recuperación', 'las etiquetas se conservan');
});

prueba('el valor de una etiqueta se limpia aunque caiga dos filas más abajo', () => {
  // La última ficha de una tabla puede dejar una fila vacía en medio y el
  // material de recursos sin su etiqueta. Si solo se mira la fila de debajo, ese
  // contenido sobrevive y el documento no se puede publicar.
  const filas = fichaSaneada(unDocumentoCon(CABECERA.concat([
    [c('Actividades de recuperación', { bold: true })],
    [c('− Prueba objetiva.')],
    [c('')],
    [c('− Presentaciones digitales del docente con el temario completo.')],
  ])));

  assert.equal(filas[3][0].text, 'Actividades de recuperación', 'la etiqueta se conserva');
  assert.ok(filas[4][0].text.indexOf('Prueba objetiva') < 0, 'el valor de debajo no se reescribió');
  assert.equal(filas[5][0].text, '', 'la fila vacía se queda vacía');
  assert.ok(filas[6][0].text.indexOf('Presentaciones digitales') < 0, 'el valor huérfano no se reescribió');
});

prueba('el valor de una etiqueta se limpia aunque ocupe varias filas seguidas', () => {
  const filas = fichaSaneada(unDocumentoCon(CABECERA.concat([
    [c('Materiales y recursos didácticos disponibles', { bold: true })],
    [c('− Aula con ordenadores.')],
    [c('− Proyector y pizarra digital.')],
    [c('Actividades de refuerzo', { bold: true })],
    [c('− Repaso individual.')],
  ])));

  assert.ok(filas[4][0].text.indexOf('Aula con ordenadores') < 0, 'la primera línea del bloque no se reescribió');
  assert.ok(filas[5][0].text.indexOf('Proyector y pizarra') < 0, 'la segunda línea del bloque no se reescribió');
  assert.ok(/^−\s/.test(filas[5][0].text), 'se pierde la viñeta');
  assert.equal(filas[6][0].text, 'Actividades de refuerzo', 'la etiqueta siguiente se conserva');
  assert.ok(filas[7][0].text.indexOf('Repaso individual') < 0);
});

prueba('el apartado de recursos específicos del módulo se reescribe', () => {
  // En el documento real es una copia de los materiales de las fichas:
  // reescribir las fichas y dejar este apartado publicaba lo mismo por detrás.
  const datos = {
    departamento: 'informatica',
    documento: {},
    instancias: [{
      titulo: 'Base de datos',
      docentes: [],
      valores: {
        'modulos/metodologia-especifica/recursos-especificos': {
          texto: [
            { type: 'p', text: 'Para este módulo se dispone del material siguiente:' },
            { type: 'list', items: [
              { text: 'Apuntes propios del profesorado del departamento.', level: 0 },
              { text: 'Servidor de bases de datos del aula.', level: 0 },
            ] },
          ],
        },
      },
    }],
    compartidos: {},
  };
  const r = S.sanear(datos);
  assert.ok(r.ok);
  const v = r.datos.instancias[0].valores['modulos/metodologia-especifica/recursos-especificos'].texto;
  assert.equal(v.length, 2, 'no cambia el número de bloques');
  assert.equal(v[1].items.length, 2, 'ni el número de elementos de la lista');
  assert.equal(v[1].type, 'list', 'ni la forma de los bloques');
  assert.notEqual(v[0].text, 'Para este módulo se dispone del material siguiente:');
  assert.notEqual(v[1].items[0].text, 'Apuntes propios del profesorado del departamento.');
  assert.notEqual(v[1].items[1].text, 'Servidor de bases de datos del aula.');
  assert.equal(r.informe.apartadosDocentes, 1);
});

prueba('el guardia avisa de un topónimo de procedencia, y lo acepta si se declara', () => {
  // Un nombre de sitio no se distingue por su forma de cualquier otra palabra
  // con mayúscula, así que no se sustituye solo: se avisa. Y se acepta el
  // sustituto que haya declarado quien genera el documento.
  const frase = 'El centro recibe alumnado de las poblaciones cercanas de Valcavero y Peñaluenga, donde se desconoce el valenciano.';
  const datos = {
    departamento: 'informatica',
    documento: { 'metodologia-y-orientaciones-didacticas/programa-plurilingue': { texto: [{ type: 'p', text: frase }] } },
    instancias: [],
    compartidos: {},
  };

  const sinDeclarar = S.sanear(datos);
  assert.equal(sinDeclarar.ok, false, 'el topónimo pasó sin que nadie avisara');
  assert.ok(sinDeclarar.hallazgos.some((h) => h.tipo === 'topónimo'), JSON.stringify(sinDeclarar.hallazgos.map((h) => h.tipo)));

  const declarado = S.sanear(datos, {
    sustituciones: [{ buscar: 'Valcavero', por: 'Altamar' }, { buscar: 'Peñaluenga', por: 'Valdeluna' }],
  });
  assert.ok(declarado.ok, 'con el sustituto declarado el guardia tiene que dar por bueno');
  const t = declarado.datos.documento['metodologia-y-orientaciones-didacticas/programa-plurilingue'].texto[0].text;
  assert.ok(t.indexOf('Valcavero') < 0 && t.indexOf('Peñaluenga') < 0, 'no se sustituyó');
  assert.ok(t.indexOf('Altamar') >= 0 && t.indexOf('Valdeluna') >= 0);

  // y la referencia al marco legal no salta: el decreto del título es valenciano
  const legal = {
    departamento: 'informatica',
    documento: { introduccion: { texto: [{ type: 'p', text: 'Según el decreto de la Generalitat, en la Comunitat Valenciana el título consta de 2000 horas.' }] } },
    instancias: [],
    compartidos: {},
  };
  assert.ok(S.sanear(legal).ok, 'la normativa valenciana no es un dato del centro');
});

console.log(fallos ? `\n${fallos} prueba(s) fallida(s)` : '\nTodas las pruebas correctas');
process.exit(fallos ? 1 : 0);
