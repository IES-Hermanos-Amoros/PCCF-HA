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

  // Deja en .next/standalone un servidor que arranca solo, con las dependencias
  // que usa y nada más. Lo usa el Dockerfile.
  output: 'standalone',

  // Evita que `next dev` deje un AGENTS.md en la raíz al arrancar.
  agentRules: false,
};

module.exports = config;
