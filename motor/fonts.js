// Fuentes incrustadas para pdfmake en Node (sin ficheros TTF externos: salen del vfs que trae el paquete).
// Roboto tiene licencia Apache 2.0, apta para desplegar.
const vfsModule = require('pdfmake/build/vfs_fonts.js');
const vfs = (vfsModule.pdfMake && vfsModule.pdfMake.vfs) || vfsModule.vfs || vfsModule;
const ttf = (name) => Buffer.from(vfs[name], 'base64');

module.exports = {
  Roboto: {
    normal: ttf('Roboto-Regular.ttf'),
    bold: ttf('Roboto-Medium.ttf'),
    italics: ttf('Roboto-Italic.ttf'),
    bolditalics: ttf('Roboto-MediumItalic.ttf'),
  },
};
