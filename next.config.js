// El motor (motor/) es CommonJS y usa mammoth, pdfmake y node-html-parser, que
// son paquetes de Node y no pueden acabar en el paquete del navegador: se cargan
// solo desde las rutas de la API. `serverExternalPackages` le dice a Next que no
// los empaquete y los deje como `require` normales en el servidor, que es lo que
// necesita pdfmake para encontrar sus fuentes.
//
// pdfmake además lee ficheros de fuentes del disco (motor/fonts.js), así que
// tiene que quedarse fuera del empaquetado sí o sí.

/** @type {import('next').NextConfig} */
const config = {
  serverExternalPackages: ['pdfmake', 'mammoth', 'node-html-parser', 'mongodb', 'jszip'],

  // Solo al construir la imagen: deja en .next/standalone un servidor que
  // arranca solo, con las dependencias que usa y nada más. Fuera de ahí no se
  // activa, porque `next start` no funciona con esta salida.
  output: process.env.PCCF_STANDALONE ? 'standalone' : undefined,

  // Evita que `next dev` deje un AGENTS.md en la raíz al arrancar.
  agentRules: false,

  // En desarrollo, Next solo sirve el JavaScript de cliente al origen que espera.
  // Abriendo por 127.0.0.1 en lugar de localhost, la página se pinta entera y
  // luego no responde a nada: no hidrata, y lo único que lo delata es un 404 en
  // la consola del navegador. Es un rato perdido buscando donde no es.
  allowedDevOrigins: ['127.0.0.1'],
};

module.exports = config;
