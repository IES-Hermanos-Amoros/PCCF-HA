// ¿Está la base limpia? Y, con --limpiar, déjala limpia.
//
//   node scripts/base-limpia.js              dice qué hay sucio (sale con 1 si lo hay) y no toca nada
//   node scripts/base-limpia.js --limpiar    lo devuelve al estado limpio y cuenta lo que ha tocado
//
//   PCCF_E2E_URL   dirección del servidor; por omisión http://localhost:3000
//
// «Limpia» es como la deja la carga de los Word: ninguna unidad con docente, ningún apartado común
// asignado y ningún módulo con estructura propia (e2e/estado-base.js, el mismo cálculo que usa la batería
// de extremo a extremo). Se escribe SOLO por la API HTTP, con la sesión del puente de pruebas
// `/api/acceso-libre`: no toca MongoDB.

const { huellaDeLaBase, estaLimpia, describirHuella, limpiar, clienteHttp } = require('../e2e/estado-base');

const URL_BASE = process.env.PCCF_E2E_URL || 'http://localhost:3000';

async function main() {
  const limpiarYa = process.argv.includes('--limpiar');
  const cliente = await clienteHttp(URL_BASE);
  console.log(`Servidor ${URL_BASE}, dentro como ${cliente.quien}.`);

  let huella = await huellaDeLaBase(cliente);
  if (estaLimpia(huella)) {
    console.log('La base está LIMPIA: ningún módulo con docente, ningún apartado asignado, ninguna estructura propia.');
    return 0;
  }
  console.log('La base está SUCIA:');
  console.log(describirHuella(huella).join('\n'));
  if (!limpiarYa) {
    console.log('\nNo he tocado nada. Para dejarla limpia: node scripts/base-limpia.js --limpiar');
    return 1;
  }

  console.log('\nLimpiando por la API...');
  const tocado = await limpiar(cliente);
  tocado.forEach((t) => console.log(`  · ${t}`));
  huella = await huellaDeLaBase(cliente);
  if (!estaLimpia(huella)) {
    console.log('\nSigue sucio tras limpiar:');
    console.log(describirHuella(huella).join('\n'));
    return 1;
  }
  console.log(`\nHecho: ${tocado.length} cambio(s) y la base está LIMPIA.`);
  return 0;
}

main().then((c) => process.exit(c), (e) => { console.error(`Error: ${e.message}`); process.exit(2); });
