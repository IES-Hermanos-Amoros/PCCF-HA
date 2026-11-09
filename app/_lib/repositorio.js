// La única instancia del repositorio que usa la aplicación.
//
// Sin MONGODB_URI arranca con el adaptador de memoria, así que `npm run dev`
// funciona recién clonado el repositorio y sin levantar ninguna base de datos:
// se importa un Word, se trabaja con él y al reiniciar no queda nada. Para
// desarrollar la interfaz es justo lo que hace falta, y evita que haga falta una
// cuenta de Atlas para tocar una pantalla.
//
// Con MONGODB_URI se conecta a Mongo. La decisión es por variable de entorno y
// no por un `if (process.env.NODE_ENV)` porque así se puede apuntar el servidor
// de desarrollo a una base de datos de verdad cuando se quiere probar algo que
// solo pasa allí (los índices, los conflictos de escritura, el tamaño real).
//
// Se guarda en `globalThis` porque en desarrollo Next recarga los módulos en
// caliente a cada cambio: sin esto, con el adaptador de memoria se perdería el
// documento importado en cada guardado de un fichero, y con el de Mongo se
// abriría una conexión nueva por recarga hasta agotar el límite de Atlas.
//
// EL PRECIO: AÑADIR UN MÉTODO AL REPOSITORIO OBLIGA A REINICIAR `npm run dev`.
// El objeto cacheado se construyó con el código de antes, y la recarga en
// caliente no lo sustituye, así que el método nuevo no existe para el servidor
// que está en pie y la pantalla recibe un «repo.algo is not a function» que
// parece un fallo del código recién escrito y no lo es. Pasó al añadir
// `apartados.borrar`.

'use strict';

const { crearRepositorio } = require('../../repositorio');

const CLAVE = '__pccf_repositorio__';

function obtenerRepositorio() {
  if (globalThis[CLAVE]) return globalThis[CLAVE];

  const uri = process.env.MONGODB_URI;
  let adaptador;

  if (uri) {
    adaptador = require('../../repositorio/mongo').crear({
      uri,
      nombreBd: process.env.MONGODB_DB || 'pccf',
    });
  } else {
    adaptador = require('../../repositorio/memoria').crear();
  }

  globalThis[CLAVE] = crearRepositorio({ adaptador });
  globalThis[CLAVE].enMemoria = !uri;

  // Solo se siembra solo el repositorio que crea esta función. Las pruebas
  // meten el suyo en `globalThis[CLAVE]` antes de que nadie llame aquí —para
  // que un MONGODB_URI del entorno no pueda mandarlas a una base de datos de
  // verdad— y ese repositorio ya trae los datos que la prueba quiere, ni uno
  // más: sembrarlo encima le cambiaría los recuentos bajo los pies.
  globalThis[CLAVE].autoSemilla = !uri;

  return globalThis[CLAVE];
}

module.exports = { obtenerRepositorio };
