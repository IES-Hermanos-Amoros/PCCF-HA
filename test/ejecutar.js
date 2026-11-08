// Una sola puerta para todas las pruebas del repositorio: `npm test`.
//
// Antes había dos mundos que se ejecutaban por separado —las del motor con
// `npm test` en la carpeta del motor, y las del mockup con `node docs/mockup-v2/test.js`—
// así que era perfectamente posible romper uno sin enterarse de que el otro
// seguía verde. Ahora las ejecuta todas lo mismo y cada evolutivo añade su suite
// a la lista de abajo.
//
// Las suites que todavía no existen salen como `pendiente` en lugar de fallar:
// esto está pensado para crecer evolutivo a evolutivo, y una lista que no se
// puede escribir hasta que todo esté hecho no sirve de guía.
//
// Ninguna suite necesita red ni base de datos: las que hablan con la
// persistencia usan el adaptador de memoria de repositorio/.

'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');

// Orden deliberado: primero lo que no depende de nada (lógica pura), luego el
// motor, luego lo que cruza las dos cosas. Así el primer FALLO que se lee es el
// más cercano a la causa.
const SUITES = [
  // --- E0: lógica compartida y persistencia -------------------------------
  { archivo: 'test/core.js', nombre: 'core (lógica compartida)' },
  { archivo: 'test/repositorio.js', nombre: 'repositorio (adaptador de memoria)' },

  // --- motor: las que ya existían antes de unificar el paquete -------------
  { archivo: 'scripts/test-permisos.js', nombre: 'motor · permisos' },
  { archivo: 'scripts/test-compartidos.js', nombre: 'motor · textos compartidos' },
  { archivo: 'scripts/test-texto-rico.js', nombre: 'motor · texto con formato' },
  { archivo: 'scripts/test-ficha-sa.js', nombre: 'motor · fichas de situación de aprendizaje' },
  { archivo: 'scripts/test-importar-docx.js', nombre: 'motor · importar de Word (estructura)' },
  { archivo: 'scripts/test-exportar-docx.js', nombre: 'motor · exportar a Word' },
  { archivo: 'scripts/test-sanear.js', nombre: 'motor · saneado de documentos' },

  // --- el mockup, que sigue vivo como referencia y consume core/ ----------
  { archivo: 'docs/mockup-v2/test.js', nombre: 'mockup v2 (contra core/)' },

  // --- E0: el ida y vuelta, que es el riesgo nº 1 -------------------------
  { archivo: 'test/ida-y-vuelta.js', nombre: 'ida y vuelta: importar → editar → exportar' },

  // --- de aquí para abajo, lo que añada cada evolutivo --------------------
  { archivo: 'test/api.js', nombre: 'API (rutas de Next sobre el repositorio)' },

  // --- E2: quién eres y qué llevas ----------------------------------------
  { archivo: 'test/sesiones.js', nombre: 'identidad: invitación, acceso y sesión' },
  { archivo: 'test/asignacion.js', nombre: 'reparto de unidades al profesorado' },

  // --- E3: escribir ------------------------------------------------------
  { archivo: 'test/edicion.js', nombre: 'edición de apartados y conflictos' },

  // --- E4: lo estructurado -----------------------------------------------
  { archivo: 'test/estructurados.js', nombre: 'situaciones de aprendizaje, ponderaciones y avisos' },

  // --- E5: el curso siguiente ---------------------------------------------
  { archivo: 'test/arrastre.js', nombre: 'arrastre entre cursos y revisión' },

  // --- E6: cambiar la estructura del documento ----------------------------
  { archivo: 'test/estructura.js', nombre: 'estructura editable y versiones de la plantilla' },
  { archivo: 'test/tablas.js', nombre: 'tablas y campos creados en la aplicación' },
  { archivo: 'test/editor-tablas.js', nombre: 'editor de tablas y alta de campos' },

  // --- E7: aprobar, coordinar y los otros documentos ----------------------
  { archivo: 'test/estados.js', nombre: 'estados del documento, PCCF y memoria' },
  { archivo: 'test/coordinacion.js', nombre: 'coordinación y comentarios' },
  { archivo: 'test/reglas.js', nombre: 'comprobaciones configurables del documento' },
];

const AZUL = '\x1b[34m'; const ROJO = '\x1b[31m'; const VERDE = '\x1b[32m';
const GRIS = '\x1b[90m'; const FIN = '\x1b[0m';
const color = process.stdout.isTTY ? (c, s) => c + s + FIN : (_c, s) => s;

// Las suites del repositorio imprimen una línea `ok   <nombre>` por prueba
// (el estilo de scripts/). Contarlas da el total real sin que cada
// suite tenga que informar de nada.
const cuentaOk = (salida) => (salida.match(/^ok\b/gm) || []).length;

const soloArgs = process.argv.slice(2);
const pedida = (s) => !soloArgs.length || soloArgs.some((a) => s.archivo.includes(a) || s.nombre.includes(a));

let ok = 0; let fallidas = 0; let pendientes = 0; let pruebas = 0;
const resumen = [];

for (const suite of SUITES) {
  if (!pedida(suite)) continue;

  const abs = path.join(RAIZ, suite.archivo);
  if (!fs.existsSync(abs)) {
    pendientes += 1;
    resumen.push({ estado: 'pendiente', ...suite });
    continue;
  }

  console.log(color(AZUL, `\n──── ${suite.nombre} ────`));
  const r = spawnSync(process.execPath, [abs], { cwd: RAIZ, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const salida = (r.stdout || '') + (r.stderr || '');
  process.stdout.write(salida);

  const n = cuentaOk(salida);
  pruebas += n;
  if (r.status === 0) { ok += 1; resumen.push({ estado: 'ok', n, ...suite }); }
  else { fallidas += 1; resumen.push({ estado: 'FALLO', n, ...suite }); }
}

console.log(color(AZUL, '\n──── resumen ────'));
for (const r of resumen) {
  if (r.estado === 'pendiente') {
    console.log(color(GRIS, `  pendiente  ${r.nombre}  (${r.archivo} todavía no existe)`));
  } else if (r.estado === 'ok') {
    console.log(`  ${color(VERDE, 'ok       ')}  ${r.nombre}  ${color(GRIS, `(${r.n} pruebas)`)}`);
  } else {
    console.log(`  ${color(ROJO, 'FALLO    ')}  ${r.nombre}`);
  }
}

const linea = `${ok} suites correctas, ${fallidas} con fallos, ${pendientes} pendientes · ${pruebas} pruebas`;
console.log('\n' + (fallidas ? color(ROJO, linea) : color(VERDE, linea)) + '\n');
process.exit(fallidas ? 1 : 0);
