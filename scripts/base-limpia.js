// ¿Está la base limpia? Y, con --limpiar, déjala limpia.
//
//   node scripts/base-limpia.js              dice qué hay sucio (sale con 1 si lo hay) y no toca nada
//   node scripts/base-limpia.js --limpiar    lo devuelve al estado limpio y cuenta lo que ha tocado
//
//   PCCF_E2E_URL   dirección del servidor; por omisión http://localhost:3000
//
// «Limpia» es como la deja la carga de los Word: ninguna unidad con docente, ningún apartado común
// asignado, ningún módulo con estructura propia y ninguna fila de apartado huérfana.
//
// Lo que se ve por la API se escribe SOLO por la API, con la sesión del puente de pruebas
// `/api/acceso-libre` (e2e/estado-base.js, el mismo cálculo que usa la batería). Lo que NO se ve por la
// API son las filas de un apartado que un módulo se creó y que ya no existe en ninguna estructura: esas
// se miran y se borran en la base, y solo si no tienen nada escrito (e2e/apartados-huerfanos.js).

const { huellaDeLaBase, estaLimpia, describirHuella, limpiar, clienteHttp } = require('../e2e/estado-base');
const Huerfanos = require('../e2e/apartados-huerfanos');

const URL_BASE = process.env.PCCF_E2E_URL || 'http://localhost:3000';

const contar = (huella, sueltas) => estaLimpia(huella) && !sueltas.length;
const pintar = (huella, sueltas) => [...describirHuella(huella), ...Huerfanos.describir(sueltas)]
  .forEach((l) => console.log(l));

async function main() {
  const limpiarYa = process.argv.includes('--limpiar');
  const cliente = await clienteHttp(URL_BASE);
  console.log(`Servidor ${URL_BASE}, dentro como ${cliente.quien}.`);

  let huella = await huellaDeLaBase(cliente);
  let sueltas = await Huerfanos.huerfanos();
  if (contar(huella, sueltas)) {
    console.log('La base está LIMPIA: ningún módulo con docente, ningún apartado asignado, ninguna estructura propia y ninguna fila huérfana.');
    return 0;
  }
  console.log('La base está SUCIA:');
  pintar(huella, sueltas);
  if (!limpiarYa) {
    console.log('\nNo he tocado nada. Para dejarla limpia: node scripts/base-limpia.js --limpiar');
    return 1;
  }

  console.log('\nLimpiando...');
  const tocado = await limpiar(cliente);
  tocado.forEach((x) => console.log(`  · ${x}`));

  // Las huérfanas SIN NADA ESCRITO se borran en la base: por la API no hay forma de llegar a ellas,
  // porque su apartado ya no existe en ninguna estructura. Las que llevan algo escrito NO se tocan: eso
  // es la pregunta de diseño que docs/estructura-por-modulo.md deja abierta —qué pasa con lo escrito en
  // algo que desaparece— y no la decide una herramienta de pruebas.
  const { borradas, conContenido } = await Huerfanos.borrarVacios();
  borradas.forEach((h) => console.log(`  · fila huérfana borrada: ${h.unidadId} · ${h.seccion}`));
  conContenido.forEach((h) => console.log(`  · NO la borro, tiene contenido escrito: ${h.unidadId} · ${h.seccion}`));

  huella = await huellaDeLaBase(cliente);
  sueltas = await Huerfanos.huerfanos();
  if (!contar(huella, sueltas)) {
    console.log('\nSigue sucio tras limpiar:');
    pintar(huella, sueltas);
    return 1;
  }
  console.log(`\nHecho: ${tocado.length + borradas.length} cambio(s) y la base está LIMPIA.`);
  return 0;
}

main().then((c) => process.exit(c), (e) => { console.error(`Error: ${e.message}`); process.exit(2); });
