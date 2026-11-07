// Siembra el repositorio en memoria al arrancar, para que la aplicación se pueda
// usar recién clonada y sin base de datos.
//
// EL PROBLEMA QUE RESUELVE
//
// Sin MONGODB_URI el repositorio es un objeto en la memoria del proceso
// (app/_lib/repositorio.js, y es a propósito: así `npm run dev` funciona sin una
// cuenta de Atlas). Pero eso significa que `node scripts/sembrar.js` siembra la
// memoria de OTRO proceso: el servidor de Next no ve nada de lo que haya creado,
// y como sin ninguna persona todas las rutas devuelven 401, la aplicación no
// tiene puerta de entrada. Con Mongo no pasa, porque los dos procesos escriben
// en el mismo sitio.
//
// Así que con el adaptador de memoria la aplicación se siembra ella misma, con
// LA MISMA lista de personas que el guion —se exige de `scripts/sembrar.js`, no
// se copia— para que no haya dos censos que se puedan separar.
//
// Lo que NO hace es sembrar nada cuando hay base de datos: ahí manda el guion, y
// una aplicación que crea usuarios sola en una base de datos de verdad es una
// sorpresa desagradable.
//
// Las vistas la llaman antes de pintar (`await asegurarSemilla()`), y desde el E2
// la aseguran también `usuarioDeLaPeticion` y el canje del enlace de acceso: son
// los dos sitios por los que pasa quien llega sin sesión, que es justo quien
// necesita que los enlaces ya existan.

'use strict';

const { obtenerRepositorio } = require('./repositorio');
const {
  PERSONAS, sembrarPersonas, sembrarInvitaciones, imprimirEnlaces, sembrarDocumento, leerFuente,
} = require('../../scripts/sembrar');

// La promesa se guarda en `globalThis` por lo mismo que el repositorio: Next
// recarga los módulos en caliente y hay varias peticiones en vuelo a la vez. Sin
// esto, dos peticiones simultáneas sembrarían las personas dos veces, y el
// repositorio rechaza correos repetidos.
const CLAVE = '__pccf_semilla__';

async function sembrar() {
  const repo = obtenerRepositorio();
  if (!repo.enMemoria) return { sembrado: false, motivo: 'hay base de datos: siembra scripts/sembrar.js' };
  // Un repositorio que no ha creado app/_lib/repositorio.js viene de fuera (las pruebas
  // inyectan el suyo) y trae ya los datos que su dueño quiere: no se le añade nada.
  if (!repo.autoSemilla) return { sembrado: false, motivo: 'el repositorio lo ha puesto otro' };

  const creadas = await sembrarPersonas(repo);

  // Y la puerta. Desde el E2 no se elige quién eres en un desplegable: se entra
  // canjeando un enlace de acceso. Un censo sin ningún enlace deja la aplicación
  // devolviendo 401 a todo, que es exactamente quedarse fuera de casa con las
  // llaves dentro. Los enlaces salen por la consola porque es donde está mirando
  // quien acaba de ejecutar `npm run dev`, y porque la aplicación todavía no sabe
  // mandar correos (app/_lib/invitaciones.js).
  const enlaces = await sembrarInvitaciones(repo);

  // Un documento con el que navegar, solo si se le dice de dónde sacarlo. No se
  // inventa ninguno: un documento de muestra en la lista se confunde con uno del
  // departamento, y la aplicación tiene que poder arrancar vacía.
  //
  //   PCCF_SEMILLA_DESDE=out/importado   el { plantilla, datos } que deja `npm run importar`
  //   PCCF_SEMILLA_DOCX=entrada/PD.docx  un Word, que se importa al arrancar (tarda unos segundos)
  //   PCCF_SEMILLA_CICLO=daw             obligatorio con los dos anteriores: sin ciclo no se concilia
  //   PCCF_SEMILLA_CURSO=2026-27
  const desde = process.env.PCCF_SEMILLA_DESDE || null;
  const docx = process.env.PCCF_SEMILLA_DOCX || null;
  let documento = null;
  if ((desde || docx) && (await repo.documentos.listar({})).length === 0) {
    const ciclo = process.env.PCCF_SEMILLA_CICLO || null;
    if (!ciclo) {
      console.warn('[semilla] PCCF_SEMILLA_DESDE/DOCX sin PCCF_SEMILLA_CICLO: no se siembra el documento.');
    } else {
      const fuente = await leerFuente({ docx, desde });
      const r = await sembrarDocumento(repo, fuente, {
        ciclo,
        curso: process.env.PCCF_SEMILLA_CURSO || '2026-27',
        departamento: process.env.PCCF_SEMILLA_DEPARTAMENTO || 'informatica',
      });
      documento = r.documento._id;
      console.log(`[semilla] documento ${documento} sembrado desde ${desde || docx}`
        + ` (${r.filas.unidades.length} unidades, ${r.filas.apartados.length} apartados)`);
    }
  }

  if (creadas.length) {
    console.log(`[semilla] ${creadas.length} personas de muestra creadas en el repositorio en memoria.`
      + ' Son inventadas: el profesorado real no está en este repositorio.');
  }
  imprimirEnlaces(enlaces);

  return { sembrado: true, personas: PERSONAS.length, invitaciones: enlaces.length, documento };
}

function asegurarSemilla() {
  if (!globalThis[CLAVE]) {
    // Si la siembra falla, se olvida la promesa: así el siguiente intento vuelve
    // a probar en lugar de dejar la aplicación sin personas para siempre por un
    // fallo pasajero (un fichero de semilla a medio escribir, por ejemplo).
    globalThis[CLAVE] = sembrar().catch((e) => {
      globalThis[CLAVE] = null;
      console.error('[semilla] no se ha podido sembrar:', e && e.message);
      return { sembrado: false, motivo: (e && e.message) || 'error' };
    });
  }
  return globalThis[CLAVE];
}

module.exports = { asegurarSemilla };
