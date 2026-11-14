// Antes de la primera prueba: la base tiene que estar LIMPIA.
//
// Es un `globalSetup` de Playwright: si lanza, la batería entera se aborta con este mensaje y no corre
// ninguna prueba. Es lo que se quiere: una base sucia al empezar hace fallar a una prueba cualquiera por
// un motivo que no es suyo, y el rastro es de otra ejecución. Aquí se dice qué está sucio y cómo limpiarlo.
//
// Un `globalSetup` y no un `beforeAll` por fichero porque corre una vez, antes que nada, y no depende de
// que alguien se acuerde de ponerlo. Lo de cada fichero (`apoyo.js`, `controlDeFuga`) mira lo contrario:
// que el fichero no deje nada al terminar.

const { huellaDeLaBase, estaLimpia, describirHuella, clienteHttp, COMO_LIMPIAR } = require('./estado-base');

module.exports = async function globalSetup(config) {
  const url = config.projects[0].use.baseURL;
  const cliente = await clienteHttp(url);
  const huella = await huellaDeLaBase(cliente);
  if (estaLimpia(huella)) return;
  throw new Error([
    '',
    'LA BASE NO ESTÁ LIMPIA: otra ejecución dejó rastro y las pruebas fallarían por un motivo que no es suyo.',
    'Esto es lo que está sucio:',
    ...describirHuella(huella),
    '',
    COMO_LIMPIAR,
    '',
  ].join('\n'));
};
