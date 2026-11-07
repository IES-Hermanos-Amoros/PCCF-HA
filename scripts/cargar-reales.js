// Carga en el repositorio los documentos reales del departamento, de este curso y del anterior.
//
//   MONGODB_URI=mongodb://localhost:27017 node scripts/cargar-reales.js
//   MONGODB_URI=... node scripts/cargar-reales.js --repartir
//   MONGODB_URI=... node scripts/cargar-reales.js --forzar --base https://pccf.example.org
//   MONGODB_URI=... node scripts/cargar-reales.js --dir "D:/otra/carpeta/con/los/word"
//
// LOS DOCUMENTOS NO ESTÁN EN EL REPOSITORIO. Se leen de docs/entrada_ej/<curso>/ en la máquina que
// lo ejecuta, y no se copian ni se imprime su contenido.
//
// POR QUÉ EXIGE MONGODB_URI
//
// Sin él el repositorio vive en la memoria de este proceso y se pierde al terminar: cargar aquí daría
// la sensación de haber cargado algo que no sobrevive a nada. Así que el guion se niega en lugar de
// hacerlo en silencio. Para probar la interfaz sin base de datos, `npm run dev` ya siembra solo.
//
// EL ENCADENADO DE CURSOS (docs/plan.md §2.1)
//
// Los de 2026-27 se cargan con `anteriorId` apuntando al de 2025-26 del mismo tipo y ciclo. Por eso
// los de 2025-26 van primero. Sin ese enlace no hay vista de Cambios ni progreso por revisión. La
// memoria, que es del departamento entero, se encadena con la memoria; el PCCF de 2026-27 no tiene
// PCCF de 2025-26 en la carpeta, así que no apunta a nada, y se dice.
//
// REPETIBLE: SE SUSTITUYE, NO SE DUPLICA
//
// Se borran los que haya del mismo tipo, ciclo, curso y departamento, con sus unidades, apartados y
// textos compartidos (documentos.borrar los cascadea), pero DESPUÉS de que el nuevo se haya guardado: si
// la carga de uno falla, lo que hubiera sigue en su sitio. Se sustituye en lugar de negarse porque no hay
// ruta para borrar un documento desde la aplicación: negarse obligaría a vaciar la base a mano cada vez
// que el importador mejora, que es justo cuando se quiere recargar. La consecuencia es que se pierde lo
// que se haya escrito en la aplicación sobre esos documentos (revisiones, comentarios, reparto), y el
// guion lo dice al sustituir.
//
// Lo que se borra y se vuelve a cargar son documentos enteros, así que los de otro curso que apunten a
// uno de estos (un 2027-28 creado desde el 2026-27 de aquí) quedan con un `anteriorId` huérfano hasta
// que se vuelvan a crear. Es el mismo caso que documentos.borrar ya deja, y no se arregla aquí.
//
// LAS PERSONAS SON INVENTADAS
//
// Se siembran con scripts/sembrar.js, las mismas seis de siempre (correos en .invalid). Por eso el
// guion lo imprime en cada corrida: nadie debe confundirlas con el profesorado real.
//
// --repartir reparte los módulos entre las docentes de muestra, en rotación. Sin él, cada módulo sale
// sin nadie, que es lo honesto recién importado; con él, la pantalla de coordinación tiene contenido.

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { sembrarPersonas, sembrarInvitaciones, imprimirEnlaces } = require('./sembrar');
const { obtenerRepositorio } = require('../app/_lib/repositorio');
const { guardarImportacion, TIPOS, NO_ADMITIDOS, EXIGEN_CICLO } = require('../app/_lib/rutas/importar');

const DEPARTAMENTO = 'informatica';

// El orden importa: los de 2025-26 antes que los de 2026-27, para poder encadenarlos.
const CARGA = [
  { fichero: '2025-26/PD_DAW_25-26_final.docx', tipo: 'programacion_didactica', ciclo: 'daw', curso: '2025-26' },
  { fichero: '2025-26/PD_SMR_25-26_final.docx', tipo: 'programacion_didactica', ciclo: 'smr', curso: '2025-26' },
  { fichero: '2025-26/Informática - Memoria Final - Curso 2025-2026.docx', tipo: 'memoria', ciclo: null, curso: '2025-26' },
  { fichero: '2026-27/PD_DAW_26-27_161026.docx', tipo: 'programacion_didactica', ciclo: 'daw', curso: '2026-27' },
  { fichero: '2026-27/PD_SMR_26-27_221026.docx', tipo: 'programacion_didactica', ciclo: 'smr', curso: '2026-27' },
  { fichero: '2026-27/(EN PROGRESO) Informática - Memoria Final - Curso 2026-2027.docx', tipo: 'memoria', ciclo: null, curso: '2026-27' },
  { fichero: '2026-27/PCCF DAW.docx', tipo: 'pccf', ciclo: 'daw', curso: '2026-27' },
  { fichero: '2026-27/PCCF SMR.docx', tipo: 'pccf', ciclo: 'smr', curso: '2026-27' },
];

// «2026-27» → «2025-26»
const cursoAnterior = (curso) => {
  const año = Number(curso.slice(0, 4));
  return `${año - 1}-${String(año).slice(2)}`;
};

const clave = (tipo, ciclo, curso) => `${tipo}|${ciclo || ''}|${curso}`;

// Lo que dice el importador de cada módulo, en una línea por módulo. Es lo que hay que mirar para
// saber si la conciliación de SMR ha salido bien.
function imprimirModulos(conciliacion) {
  for (const m of conciliacion) {
    const id = m.forzada ? `${m.unidadId} (derivado del título)` : m.unidadId;
    console.log(`      · ${m.titulo}\n          → ${id} · ${m.comoEtiqueta} (confianza ${m.confianza})`);
  }
}

function resumenDeComo(conciliacion) {
  const cuenta = new Map();
  for (const m of conciliacion) cuenta.set(m.comoEtiqueta, (cuenta.get(m.comoEtiqueta) || 0) + 1);
  return [...cuenta].map(([etiqueta, n]) => `${etiqueta}: ${n}`).join(' · ') || 'ninguno';
}

async function repartirModulos(repo, documentos) {
  const docentes = (await repo.usuarios.listar({ departamento: DEPARTAMENTO, rol: 'docente' }))
    .filter((u) => u.activo !== false);
  if (!docentes.length) {
    console.log('  (no hay docentes de muestra: no se reparte nada)');
    return;
  }
  const reparto = new Map(docentes.map((d) => [d._id, { nombre: d.nombre, n: 0 }]));
  for (const doc of documentos) {
    const unidades = await repo.unidades.listar(doc._id);
    for (let i = 0; i < unidades.length; i += 1) {
      const docente = docentes[i % docentes.length];
      reparto.get(docente._id).n += 1;
      // eslint-disable-next-line no-await-in-loop
      await repo.unidades.actualizar(doc._id, unidades[i].unidadId, { docentes: [docente._id] });
    }
  }
  console.log('  Reparto de módulos entre las docentes de muestra (inventadas, en rotación):');
  for (const { nombre, n } of reparto.values()) console.log(`    ${nombre}: ${n} módulo(s)`);
}

(async () => {
  const args = process.argv.slice(2);
  const valor = (nombre, omision) => {
    const i = args.indexOf('--' + nombre);
    return i >= 0 && args[i + 1] ? args[i + 1] : omision;
  };
  const repartir = args.includes('--repartir');
  const forzar = args.includes('--forzar');
  const dir = path.resolve(valor('dir', path.join(__dirname, '..', 'docs', 'entrada_ej')));
  const inicioTodo = Date.now();

  if (!process.env.MONGODB_URI) {
    console.error('No se carga nada: falta MONGODB_URI.\n'
      + 'Sin él el repositorio vive en la memoria de este proceso y lo cargado se perdería al terminar.\n'
      + 'Levanta la base con `docker compose up -d` y ejecuta:\n'
      + '  MONGODB_URI=mongodb://localhost:27017 npm run cargar-reales');
    process.exit(1);
  }

  const repo = obtenerRepositorio();
  console.log(`Documentos reales del departamento · base: ${process.env.MONGODB_DB || 'pccf'} · carpeta: ${dir}`);

  // ------------------------------------------------------------ las personas
  console.log('\nPersonas de muestra. SON INVENTADAS: no son el profesorado real (correos en .invalid).');
  const creadas = await sembrarPersonas(repo);
  console.log(creadas.length
    ? `  Creadas (${creadas.length}): ${creadas.map((p) => `${p.nombre} · ${p.rol}`).join(', ')}`
    : '  Ya estaban: no se ha creado ninguna.');
  imprimirEnlaces(await sembrarInvitaciones(repo, { base: valor('base', undefined) }));

  // ------------------------------------------------------------ los documentos
  const cargados = new Map();   // clave → documento ya guardado, para encadenar
  const resultados = [];

  for (const entrada of CARGA) {
    const nombre = `${entrada.tipo}${entrada.ciclo ? ' ' + entrada.ciclo.toUpperCase() : ''} ${entrada.curso}`;
    console.log(`\n■ ${nombre}  (${entrada.fichero})`);

    // Primero lo que puede rechazarse sin tocar nada: el tipo, el ciclo y el fichero.
    if (NO_ADMITIDOS[entrada.tipo]) {
      console.log(`  NO SE CARGA: ${NO_ADMITIDOS[entrada.tipo]}`);
      resultados.push({ nombre, ok: false });
      continue;
    }
    if (!TIPOS.includes(entrada.tipo)) {
      console.log(`  NO SE CARGA: el tipo «${entrada.tipo}» no se admite (usa ${TIPOS.join(' o ')}).`);
      resultados.push({ nombre, ok: false });
      continue;
    }
    if (EXIGEN_CICLO.includes(entrada.tipo) && !entrada.ciclo) {
      console.log('  NO SE CARGA: falta el ciclo, y sin él no se pueden conciliar los módulos.');
      resultados.push({ nombre, ok: false });
      continue;
    }
    const ruta = path.join(dir, entrada.fichero);
    if (!fs.existsSync(ruta)) {
      console.log(`  NO SE CARGA: no existe ${ruta}`);
      resultados.push({ nombre, ok: false });
      continue;
    }

    // Lo que haya ya de este tipo, ciclo y curso: se sustituye cuando el nuevo esté guardado.
    const previos = (await repo.documentos.listar({ tipo: entrada.tipo, curso: entrada.curso, departamento: DEPARTAMENTO }))
      .filter((d) => (d.ciclo || null) === (entrada.ciclo || null));

    // Se encadena con el del curso anterior si se ha cargado en esta corrida.
    const anterior = cargados.get(clave(entrada.tipo, entrada.ciclo, cursoAnterior(entrada.curso)));

    const inicio = Date.now();
    const resultado = await guardarImportacion({
      buffer: fs.readFileSync(ruta),
      origen: path.basename(entrada.fichero),
      tipo: entrada.tipo,
      ciclo: entrada.ciclo,
      curso: entrada.curso,
      departamento: DEPARTAMENTO,
      forzar,
      inicio,
      anteriorId: anterior ? anterior._id : null,
      repo,
    });

    if (resultado.error) {
      console.log(`  NO SE CARGA: ${resultado.error.mensaje}`);
      if (resultado.error.causa) console.log(`  (causa: ${resultado.error.causa})`);
      const sin = resultado.error.extra?.sinResolver;
      if (sin) for (const s of sin) console.log(`    sin reconocer: «${s.titulo}» — ${s.motivo}`);
      resultados.push({ nombre, ok: false });
      continue;
    }

    const { documento, resumen } = resultado;
    for (const previo of previos) await repo.documentos.borrar(previo._id);
    if (previos.length) console.log(`  Sustituye ${previos.length} documento(s) anterior(es) del mismo tipo, ciclo y curso.`);
    cargados.set(clave(entrada.tipo, entrada.ciclo, entrada.curso), documento);
    resultados.push({ nombre, ok: true, documento, resumen });

    const segundos = (resumen.tardaMs / 1000).toFixed(1);
    console.log(`  Cargado: ${documento._id}  →  /doc/${documento._id}  (${segundos} s)`);
    console.log(`  secciones: ${resumen.secciones} · unidades: ${resumen.unidades} · apartados: ${resumen.apartados}`
      + ` · textos compartidos: ${resumen.compartidos}`);
    console.log(`  anterior: ${anterior ? `${anterior.curso} (${anterior._id})` : (entrada.curso === '2025-26' ? 'ninguno (primer curso cargado)' : 'ninguno cargado en esta corrida')}`);
    if (resumen.conciliacion.length) {
      console.log(`  módulos, cómo se han reconocido: ${resumenDeComo(resumen.conciliacion)}`);
      if (resumen.forzadas.length) {
        console.log(`  derivados del título (forzar): ${resumen.forzadas.map((f) => f.titulo).join('; ')}`);
      }
      imprimirModulos(resumen.conciliacion);
    }
    if (resumen.avisos.length) {
      console.log(`  avisos del importador (${resumen.avisos.length}):`);
      for (const a of resumen.avisos.slice(0, 8)) console.log(`    - ${a}`);
      if (resumen.avisos.length > 8) console.log(`    … y ${resumen.avisos.length - 8} más`);
    }
  }

  // ------------------------------------------------------------ el reparto, si se ha pedido
  if (repartir) {
    console.log('');
    await repartirModulos(repo, resultados.filter((r) => r.ok && r.resumen.unidades).map((r) => r.documento));
  } else {
    console.log('\nLos módulos salen sin nadie asignado (así es recién importado). Con --repartir se reparten'
      + '\nentre las docentes de muestra para ver la coordinación con contenido.');
  }

  // ------------------------------------------------------------ el balance
  const ok = resultados.filter((r) => r.ok).length;
  const fallan = resultados.filter((r) => !r.ok);
  console.log(`\nBalance: ${ok} de ${CARGA.length} documentos cargados en ${((Date.now() - inicioTodo) / 1000).toFixed(1)} s.`);
  for (const f of fallan) console.log(`  no cargado: ${f.nombre}`);
  console.log('Las personas de muestra son INVENTADAS. Entra con uno de los enlaces de arriba (un solo uso, 7 días).');
  process.exit(fallan.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
