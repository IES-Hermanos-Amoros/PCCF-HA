// La ESTRUCTURA del documento: renombrar un apartado, añadir uno, moverlo entre sus hermanos y
// retirarlo (más restaurar lo retirado, que es la otra mitad de retirar), y borrar de verdad lo que
// ya estaba retirado.
//
//   GET    /api/documentos/[id]/estructura                              la estructura y lo retirado
//   POST   /api/documentos/[id]/estructura/apartado                     añadir
//   PATCH  /api/documentos/[id]/estructura/apartado?seccion=            renombrar
//   POST   /api/documentos/[id]/estructura/apartado/mover?seccion=      mover
//   POST   /api/documentos/[id]/estructura/apartado/retirar?seccion=    retirar (no borra)
//   POST   /api/documentos/[id]/estructura/apartado/restaurar?seccion=  restaurar
//   POST   /api/documentos/[id]/estructura/apartado/campo?seccion=      añadir un campo a un apartado
//   POST   /api/documentos/[id]/estructura/apartado/campo/retirar?seccion=&campo=    quitar un campo (no borra)
//   POST   /api/documentos/[id]/estructura/apartado/campo/restaurar?seccion=&campo=  devolverlo
//   DELETE /api/documentos/[id]/estructura/apartado?seccion=                BORRAR un apartado retirado y todo lo escrito en él
//   DELETE /api/documentos/[id]/estructura/apartado/campo?seccion=&campo=   BORRAR un campo retirado y lo escrito en él
//
// Los dos DELETE son los únicos cambios que destruyen contenido. Se explican más abajo, en «BORRAR».
//
// Es la mitad de servidor del E6 (docs/plan.md §5), y su criterio de aceptación tiene dos mitades:
//
//   «Añadir un apartado, escribir en él y exportar; y que un documento del curso anterior siga
//    abriéndose con su plantilla antigua.»
//
// ================================================================ LA PLANTILLA ES DE CADA DOCUMENTO
//
// La segunda mitad es la que decide el diseño. `documentos.plantilla` ya es de cada documento desde
// el E0 y el arrastre entre cursos ya la copia entera (app/_lib/rutas/arrastre.js), así que el
// cambio se guarda donde ya estaba la estructura: se escribe la plantilla del documento, con
// `plantillaVersion` subida en uno.
//
// La alternativa era guardar una CAPA de cambios sobre la plantilla importada, como hace el
// prototipo (docs/mockup-v2/js/plantilla.js, que la deja en `localStorage`). Se ha descartado por
// tres cosas, en este orden:
//
//   1. UNA CAPA HAY QUE APLICARLA EN TODAS PARTES. La plantilla la leen el árbol, el apartado, el
//      PDF, el Word, el panel de comprobaciones y `raDelModulo`. Con una capa, cada una tendría que
//      acordarse de resolverla; la que se olvidara seguiría imprimiendo la estructura vieja y eso no
//      se nota hasta que alguien exporta en junio. Con la plantilla ya resuelta no hay nada que
//      recordar, salvo los apartados retirados, que se podan en un solo sitio (`abrirDocumento`).
//   2. NO HAY DÓNDE GUARDARLA. La lista blanca de `repositorio/index.js` acepta `plantilla` y
//      `plantillaVersion` y nada más, y `repositorio/` no es de este evolutivo. Una capa necesitaría
//      un campo nuevo o una colección nueva.
//   3. LA MIGRACIÓN DE LOS DATOS SALE SOLA. El contenido se guarda por el par (seccion, unidadId) y
//      el id de un apartado no cambia nunca (core/plantilla.js), así que renombrar, mover y añadir
//      no mueven ni una fila, y retirar las conserva todas. No hay datos que migrar: eso era el
//      riesgo de que el id fuera el slug del título, y es justo lo que la regla del id evita.
//
// Y el curso pasado no se entera, porque su documento es otra fila con su propia plantilla: cambiar
// la estructura del curso que se prepara no toca la del que ya está aprobado y entregado. Al
// arrastrar un curso, el documento nuevo nace con la estructura que el viejo tenía EN ESE MOMENTO
// —la copia es de la plantilla entera, incluido su registro de cambios— y desde entonces los dos
// van por su cuenta.
//
// QUÉ SE GUARDA DE CADA CAMBIO
//
// El cambio se apunta dentro de la plantilla (`plantilla.cambios`), con la versión que deja, quién
// lo hizo y cuándo. Dentro y no en una colección aparte por el punto 2 de arriba, y es además lo
// que hace que la historia viaje con la estructura cuando se arrastra el curso.
//
// LA ESCRITURA ES CONDICIONADA, Y ES LA QUE DECIDE
//
// `esperaPlantillaVersion` es el aviso temprano: si no cuadra con la versión leída, 409 antes de
// calcular nada. Pero la decisión de verdad es la escritura, y es atómica: `documentos.actualizar`
// lleva `esperaUpdatedAt` con el `updatedAt` que se leyó (`guardarPlantilla`), y cualquier cambio del
// documento —y todo cambio de la plantilla pasa por ahí— mueve ese token. Así que entre la lectura y
// la escritura no puede colarse otra estructura sin que la escritura falle con 409. Esto va también
// para el cliente que no manda `esperaPlantillaVersion`: no cambia nada salvo en la carrera, donde
// antes se perdía el cambio de otra persona sin avisar.
//
// QUIÉN PUEDE
//
// La jefatura del departamento y el soporte (`core/permisos.js` → `puedeCambiarEstructura`). El
// docente escribe lo suyo pero no decide qué apartados tiene la programación, y la jefatura de
// estudios no toca nada: es quien aprueba. Se comprueba en el servidor, como todo (docs/api.md).
//
// Es CommonJS y no sabe que está dentro de Next (docs/api.md, primera regla de forma).

'use strict';

const C = require('../../../core/permisos');
const Plantilla = require('../../../core/plantilla');
const Campos = require('../../../core/campos');
const Arbol = require('../../../core/arbol');
const {
  conErrores, abrirDocumento, leerJson, fallo, malaPeticion, noEncontrado, SIN_PERMISO,
} = require('./comun');

// ---------------------------------------------------------------- lo que todas comparten

// La secuencia de los cinco cambios, en una sola función: quién pregunta (401), si ve el documento
// (404), si puede cambiar la estructura (403), el cuerpo (400), la versión que esperaba (409), el
// cambio en seco (400 con el motivo) y la escritura. Está junta para que las cinco rutas no puedan
// separarse: lo que se guarda y en qué orden se comprueba es idéntico en todas, y lo único que
// cambia es qué se le pide a core/plantilla.js.
//
// `pedir(cuerpo, url)` devuelve la petición de cambio para `Plantilla.aplicar`, o { fallo }.
function cambio(tipo, pedir, { estado = 200, cuerpoOpcional = false } = {}) {
  return conErrores(async (peticion, parametros) => {
    const abierto = await abrirDocumento(peticion, parametros);
    if (abierto.fallo) return abierto.fallo;
    const { usuario, documento, repo, plantillaCompleta } = abierto;

    if (!C.puedeCambiarEstructura(usuario, documento)) {
      return SIN_PERMISO('Solo la jefatura de tu departamento cambia la estructura del documento. Quien escribe un apartado no decide qué apartados hay, y la jefatura de estudios no edita nada.');
    }

    const { fallo: falloCuerpo, cuerpo } = await leerCuerpo(peticion, cuerpoOpcional);
    if (falloCuerpo) return falloCuerpo;

    const actual = Number(documento.plantillaVersion) || 1;
    const falloVersion = versionPedida(cuerpo, actual);
    if (falloVersion) return falloVersion;

    const url = new URL(peticion.url);
    const pedida = pedir(cuerpo, url);
    if (pedida.fallo) return pedida.fallo;

    // UN APARTADO QUE NO ESTÁ ES UN 404, no un 400: es lo que devuelve /apartado para una sección
    // que no es de este documento y lo que dice docs/api.md («404 = no lo ves»). El id llega de la
    // URL o del cuerpo, así que puede ser cualquier cosa. core/plantilla.js también lo niega, pero
    // con el código de «no se puede»; aquí lo que ocurre es que no existe.
    for (const id of [pedida.seccion, pedida.padre]) {
      if (id && !Plantilla.buscar(plantillaCompleta, id)) {
        return noEncontrado(`Este documento no tiene ningún apartado «${id}».`);
      }
    }

    // Igual con el campo: el que se quita o se devuelve tiene que ser de ese apartado.
    if (tipo !== 'anadir_campo' && pedida.campo !== undefined) {
      const dentro = Plantilla.buscar(plantillaCompleta, pedida.seccion);
      const campos = dentro && Array.isArray(dentro.seccion.campos) ? dentro.seccion.campos : [];
      if (!campos.some((c) => c && c.id === pedida.campo)) {
        return noEncontrado(`El apartado «${pedida.seccion}» no tiene ningún campo «${pedida.campo}».`);
      }
    }

    // Un documento sin plantilla no tiene estructura que cambiar. No debería existir —la crean la
    // importación y el arrastre, y las dos la ponen—, pero el aviso vale más que el 500 que saldría
    // de intentar recorrerla.
    if (!plantillaCompleta || !Array.isArray(plantillaCompleta.secciones)) {
      return malaPeticion('Este documento no tiene plantilla: no hay estructura que cambiar.');
    }

    // El cambio se calcula en seco sobre la plantilla ENTERA —con los apartados retirados dentro,
    // que son los que se pueden restaurar— y no sobre la podada que ve el resto de la aplicación.
    const hecho = Plantilla.aplicar(plantillaCompleta, { tipo, ...pedida });
    if (hecho.motivo) {
      return fallo(400, 'peticion', `${hecho.motivo} No se ha cambiado nada.`, { motivo: hecho.motivo });
    }

    // Lo que el borrado va a destruir se cuenta ANTES de escribir y se apunta en el cambio: el
    // registro de la plantilla es lo único que queda de ello (ver «BORRAR»).
    const destruye = tipo === 'borrar' || tipo === 'borrar_campo';
    let contenido = null;
    if (destruye) {
      const filas = await repo.apartados.listar(documento._id);
      contenido = tipo === 'borrar'
        ? { apartados: hecho.cambio.apartados, ...contenidoDeApartados(filas, hecho.cambio.secciones) }
        : contenidoDeCampo(filas, hecho.cambio.seccion, hecho.cambio.campo);
      hecho.cambio.filas = contenido.filas;
      hecho.cambio.conContenido = contenido.conContenido;
    }

    const version = Plantilla.siguienteVersion(actual);
    const apuntado = Plantilla.registrar(hecho.plantilla, {
      ...hecho.cambio,
      version,
      usuario: C.idDeUsuario(usuario),
      fecha: new Date().toISOString(),
    });

    // La plantilla y su versión en la misma escritura: una plantilla cambiada con la versión de
    // antes no se distinguiría de la de antes, y la versión es lo único que permitirá migrar.
    const escritura = { plantilla: apuntado, plantillaVersion: version };
    if (tipo === 'borrar') {
      // Un reparto guardado para un apartado que ya no existe se quedaría esperando: si más tarde
      // se crea otro con el mismo título, nacería con la persona asignada del que se borró.
      const asignaciones = sinAsignaciones(documento.asignaciones, hecho.cambio.secciones);
      if (asignaciones) escritura.asignaciones = asignaciones;
    }
    const conflicto = await guardarPlantilla(repo, documento, escritura);
    if (conflicto) return conflicto;

    // El contenido se destruye DESPUÉS de la plantilla y no antes: la escritura de la plantilla es la
    // condicionada, la que decide si el cambio es válido, y destruir antes dejaría un apartado vacío
    // en pie si esa escritura perdiera la carrera. Con el apartado ya fuera de la plantilla nadie
    // puede escribir en él, así que lo que se destruye es lo que se contó.
    let filasBorradas = 0;
    if (tipo === 'borrar') {
      filasBorradas = await repo.apartados.borrar(documento._id, hecho.cambio.secciones);
    } else if (tipo === 'borrar_campo') {
      filasBorradas = await repo.apartados.quitarClave(documento._id, hecho.cambio.seccion, hecho.cambio.campo);
    }

    // Cuántas unidades repiten este apartado. Se cuentan solo si hace falta: un apartado común no
    // tiene nada que ver con las unidades y pedirlas sería una lectura por gusto.
    const esDeCampo = String(hecho.cambio.tipo).startsWith('campo_');
    const unidades = hecho.cambio.deUnidades ? (await repo.unidades.listar(documento._id)).length : 0;
    return Response.json(
      {
        documentoId: documento._id,
        plantillaVersion: version,
        seccion: hecho.cambio.seccion,
        titulo: hecho.cambio.titulo,
        cambio: apuntado.cambios[apuntado.cambios.length - 1],
        // LA ADVERTENCIA DE LOS ONCE MÓDULOS. Un apartado que cuelga del bloque de unidades es de
        // la plantilla, así que el cambio sale en todas las unidades a la vez. No es un fallo, es
        // lo que es: la respuesta lo dice para que la interfaz lo pueda advertir.
        afectaUnidades: !!hecho.cambio.deUnidades,
        unidades,
        // Cuántos apartados toca el cambio: el de la petición y su subárbol. En «retirar» es de lo
        // que hay que avisar antes de pulsar, y el contenido de todos ellos se conserva.
        apartadosAfectados: esDeCampo ? 1
          : (tipo === 'borrar' ? hecho.cambio.apartados : Plantilla.rama(apuntado, hecho.cambio.seccion).length),
        // Solo en los dos borrados: lo que había escrito y se ha destruido, y cuántas filas se han ido.
        ...(destruye ? { contenido, filasBorradas } : {}),
        // Los campos que el cambio ha creado, tal como quedan en la plantilla, cada uno con el valor
        // con el que se abre mientras no tenga ninguno (core/campos.js → `valorInicial`). Un campo
        // recién creado no tiene valor guardado: es lo que el editor pone en pantalla.
        campos: (hecho.campos || []).map((c) => ({ ...c, valorInicial: Campos.valorInicial(c) })),
        campo: hecho.cambio.campo === undefined ? null : hecho.cambio.campo,
        camposRetirados: Plantilla.camposRetirados(apuntado).length,
        retirados: Plantilla.retirados(apuntado).length,
      },
      { status: estado, headers: { 'Cache-Control': 'no-store' } },
    );
  });
}

// El cuerpo de un cambio. Los POST y PATCH lo exigen (un JSON que sea un objeto); el DELETE puede ir
// sin cuerpo, porque un DELETE sin nada que decir es lo normal, y si lo trae tiene que ser el mismo
// objeto (`esperaPlantillaVersion`).
async function leerCuerpo(peticion, opcional) {
  if (!opcional) return leerJson(peticion);
  const crudo = await peticion.text();
  if (!crudo.trim()) return { cuerpo: {} };
  let cuerpo;
  try {
    cuerpo = JSON.parse(crudo);
  } catch (e) {
    return { fallo: malaPeticion('El cuerpo de la petición, si va, tiene que ser JSON.') };
  }
  if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) {
    return { fallo: malaPeticion('El cuerpo de la petición, si va, tiene que ser un objeto JSON.') };
  }
  return { cuerpo };
}

// ---------------------------------------------------------------- cuánto hay escrito
//
// Lo que se pierde al borrar, contado sobre las filas de `apartados`. «Con contenido» es lo mismo que
// pinta la barra lateral como relleno (core/arbol.js → `algoEscrito`): una tabla sin filas o un
// repetidor sin fichas tienen clave y no tienen nada, y borrarlos no pierde nada que se pueda leer.

function recuento(filas, valorDe) {
  const llenas = filas.filter((f) => Arbol.algoEscrito(valorDe(f)));
  return {
    filas: filas.length,
    conContenido: llenas.length,
    unidadesConContenido: new Set(llenas.filter((f) => f.unidadId !== null && f.unidadId !== undefined).map((f) => f.unidadId)).size,
  };
}

// Las filas de unos apartados (el retirado y su subárbol), de todas las unidades.
function contenidoDeApartados(filas, secciones) {
  const ids = new Set(secciones);
  return recuento(filas.filter((f) => ids.has(f.seccion)), (f) => f.valores);
}

// Las filas de un apartado que tienen escrita la clave del campo: es lo que borrar el campo quita.
function contenidoDeCampo(filas, seccion, campo) {
  const tienen = filas.filter((f) => f.seccion === seccion && f.valores
    && Object.prototype.hasOwnProperty.call(f.valores, campo));
  return recuento(tienen, (f) => f.valores[campo]);
}

// Las asignaciones del documento sin las de los apartados que se borran; null si no había ninguna.
function sinAsignaciones(asignaciones, secciones) {
  if (!asignaciones || typeof asignaciones !== 'object') return null;
  const quedan = { ...asignaciones };
  let quitadas = false;
  for (const s of secciones) {
    if (Object.prototype.hasOwnProperty.call(quedan, s)) { delete quedan[s]; quitadas = true; }
  }
  return quitadas ? quedan : null;
}

// La escritura de la plantilla, condicionada al `updatedAt` con que se leyó el documento. Si otra
// escritura ha movido ese token en medio, no se escribe nada y se devuelve el 409; si no, null.
// Es lo que hace atómica la comprobación de la versión: `plantillaVersion` solo cambia con
// `documentos.actualizar`, y cada una de esas escrituras mueve `updatedAt`.
async function guardarPlantilla(repo, documento, cambios) {
  try {
    await repo.documentos.actualizar(documento._id, cambios, { esperaUpdatedAt: documento.updatedAt });
    return null;
  } catch (e) {
    if (!e || e.codigo !== 'conflicto') throw e;
    const ahora = await repo.documentos.obtener(documento._id);
    return fallo(
      409, 'conflicto',
      'Alguien ha cambiado este documento mientras cambiabas su estructura. No se ha cambiado nada: vuelve a cargarla para no deshacer su cambio.',
      { esperado: Number(documento.plantillaVersion) || 1, actual: ahora ? Number(ahora.plantillaVersion) || 1 : null },
    );
  }
}

// La versión de la plantilla con la que el cliente leyó la estructura. Opcional (ver la cabecera);
// si viene, tiene que cuadrar. Devuelve el `Response` del 409, o null si todo está en orden.
function versionPedida(cuerpo, actual) {
  const espera = cuerpo.esperaPlantillaVersion;
  if (espera === undefined || espera === null) return null;
  if (typeof espera !== 'number' || !Number.isInteger(espera)) {
    return malaPeticion('«esperaPlantillaVersion» tiene que ser la versión de la plantilla que devolvió la lectura, un número entero.');
  }
  if (espera !== actual) {
    return fallo(
      409, 'conflicto',
      'Alguien ha cambiado la estructura de este documento desde que la leíste. No se ha cambiado nada: vuelve a cargarla para no deshacer su cambio.',
      { esperado: espera, actual },
    );
  }
  return null;
}

// La sección sobre la que se actúa viene en la URL, igual que en /apartado: es el apartado al que
// apunta la tarjeta *Estructura*, y así el enlace de la petición dice sobre qué va.
function seccionDeLaUrl(url) {
  const seccion = url.searchParams.get('seccion');
  if (!seccion) return { fallo: malaPeticion('Falta el parámetro «seccion»: el apartado que se cambia.') };
  return { seccion };
}

// ---------------------------------------------------------------- GET: la estructura

// Lo que necesita la tarjeta *Estructura* y la lista de restauración de la portada, sin tener que
// deducirlo del árbol: una fila por apartado con qué se le puede hacer, los retirados —que en el
// árbol ya no están, porque no son parte del documento hasta que alguien los restaure— y la versión
// de la plantilla, que es la que se devuelve en `esperaPlantillaVersion` al cambiar algo.
//
// La ve quien ve el documento, y `puedeCambiar` dice si los botones van habilitados. Es lo mismo que
// hace /unidades con `puedeRepartir`: el cliente refleja el candado, no lo decide.
const GET = conErrores(async (peticion, parametros) => {
  const abierto = await abrirDocumento(peticion, parametros);
  if (abierto.fallo) return abierto.fallo;
  const { usuario, documento, repo, plantillaCompleta } = abierto;

  const unidades = await repo.unidades.listar(documento._id);
  const cambios = Array.isArray(plantillaCompleta && plantillaCompleta.cambios) ? plantillaCompleta.cambios : [];

  // Cuánto hay escrito en cada cosa retirada, para que quien va a borrarla lo sepa antes de pulsar.
  // Solo se leen las filas si hay algo retirado: es lo único que lo necesita.
  const retirados = Plantilla.retirados(plantillaCompleta);
  const camposRetirados = Plantilla.camposRetirados(plantillaCompleta);
  const filas = retirados.length || camposRetirados.length ? await repo.apartados.listar(documento._id) : [];

  return Response.json(
    {
      documentoId: documento._id,
      plantillaVersion: Number(documento.plantillaVersion) || 1,
      puedeCambiar: C.puedeCambiarEstructura(usuario, documento),
      unidades: unidades.length,
      apartados: Plantilla.estructura(plantillaCompleta),
      // Cada retirado lleva `contenido`: lo que se destruiría si se borrara (`apartados` con su
      // subárbol, `filas`, `conContenido` y `unidadesConContenido`).
      retirados: retirados.map((x) => ({
        ...x,
        contenido: { apartados: x.conHijos + 1, ...contenidoDeApartados(filas, Plantilla.rama(plantillaCompleta, x.seccion)) },
      })),
      // Los campos retirados de los apartados, para la lista desde la que se restauran o se borran.
      camposRetirados: camposRetirados.map((x) => ({
        ...x,
        contenido: contenidoDeCampo(filas, x.seccion, x.campo),
      })),
      // LO QUE EL EDITOR NECESITA PARA PINTAR EL ALTA DE UN CAMPO sin adivinar nada: qué tipos se
      // pueden crear, con su nombre en castellano, sus parámetros (con límites y valor por defecto)
      // y la forma del valor que se guarda. Lo decide core/campos.js y no esta ruta, para que el
      // editor y el servidor no tengan ideas distintas de qué es una tabla válida.
      tiposDeCampo: Campos.catalogo(),
      limites: {
        camposPorApartado: Plantilla.MAX_CAMPOS,
        camposAlCrearUnApartado: Plantilla.MAX_CAMPOS_AL_CREAR,
      },
      // La historia de la estructura de ESTE documento, del primer cambio al último. Es lo que se
      // enseña («la estructura se cambió por última vez el…») y lo que hace falta para saber de qué
      // versión viene un documento arrastrado.
      cambios,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
});

// ---------------------------------------------------------------- los cuatro cambios, y el quinto

// AÑADIR. `padre` vacío o ausente es «al final del documento»; con padre, al final de sus hijos.
// 201, porque crea un apartado que antes no existía.
//
// El apartado nace con un campo de texto, o con los de `campos` (una tabla, por ejemplo), y, si no hereda de nadie quién lo edita, con la jefatura
// del departamento: sin eso no lo podría escribir nadie y el criterio de aceptación («añadir un
// apartado, ESCRIBIR EN ÉL y exportar») no se cumpliría. Lo decide core/plantilla.js.
const ANADIR = cambio('anadir', (cuerpo) => {
  if (cuerpo.titulo !== undefined && typeof cuerpo.titulo !== 'string') {
    return { fallo: malaPeticion('El título del apartado nuevo tiene que ser un texto.') };
  }
  if (cuerpo.padre !== undefined && cuerpo.padre !== null && typeof cuerpo.padre !== 'string') {
    return { fallo: malaPeticion('«padre» es el id del apartado que lo contiene, o nada para que vaya al final del documento.') };
  }
  if (cuerpo.campos !== undefined && cuerpo.campos !== null && !Array.isArray(cuerpo.campos)) {
    return { fallo: malaPeticion('«campos» es la lista de campos con los que nace el apartado, cada uno como { tipo, … }; sin ella nace con un campo de texto.') };
  }
  return { titulo: cuerpo.titulo, padre: cuerpo.padre || '', campos: cuerpo.campos || undefined };
}, { estado: 201 });

// RENOMBRAR. Es un PATCH porque cambia un campo del apartado y deja el resto como estaba, y
// EL ID NO SE TOCA: si el id fuera el slug del título, renombrar dejaría huérfanos el contenido, los
// comentarios y los enlaces guardados (core/plantilla.js, la cabecera).
const RENOMBRAR = cambio('renombrar', (cuerpo, url) => {
  const { fallo: falloSeccion, seccion } = seccionDeLaUrl(url);
  if (falloSeccion) return { fallo: falloSeccion };
  if (cuerpo.titulo !== undefined && typeof cuerpo.titulo !== 'string') {
    return { fallo: malaPeticion('El título tiene que ser un texto.') };
  }
  return { seccion, titulo: cuerpo.titulo };
});

// MOVER entre sus hermanos: `{ delta: -1 }` lo sube un sitio, `{ delta: 1 }` lo baja.
//
// Se manda el desplazamiento y no la posición final porque es lo que hace la interfaz —dos botones,
// arriba y abajo— y porque una posición absoluta calculada sobre una lista que ha cambiado por medio
// mueve el apartado a otro sitio sin que nadie lo note. Mover el primero hacia arriba es un 400 que
// lo dice, no un 200 que no hace nada: un botón que calla no se distingue de uno estropeado.
const MOVER = cambio('mover', (cuerpo, url) => {
  const { fallo: falloSeccion, seccion } = seccionDeLaUrl(url);
  if (falloSeccion) return { fallo: falloSeccion };
  if (cuerpo.delta !== undefined && typeof cuerpo.delta !== 'number') {
    return { fallo: malaPeticion('«delta» es cuántos sitios se mueve: -1 para subirlo, 1 para bajarlo.') };
  }
  return { seccion, delta: cuerpo.delta };
});

// RETIRAR. NO BORRA: el apartado se queda en la plantilla marcado como retirado, deja de pintarse y
// de imprimirse, y su contenido sigue en `apartados` tal cual. Por eso no es un DELETE: un DELETE
// que no borra es una promesa que el contrato no quiere hacer, y lo que de verdad pasa aquí es que
// el apartado sale del documento y se puede volver a meter.
//
// Se va con su subárbol, igual que en el prototipo: si se quedaran los hijos sin su padre, el PDF
// los imprimiría colgando del apartado de más arriba. La respuesta dice cuántos apartados se han
// ido, para que la interfaz lo advierta.
const RETIRAR = cambio('retirar', (cuerpo, url) => {
  const { fallo: falloSeccion, seccion } = seccionDeLaUrl(url);
  if (falloSeccion) return { fallo: falloSeccion };
  return { seccion };
});

// RESTAURAR: lo devuelve a su sitio con todo lo que tenía escrito. Es la otra mitad de retirar, y
// está porque sin ella «retirar no borra» no significaría nada: quien se equivoca tiene que poder
// deshacerlo.
const RESTAURAR = cambio('restaurar', (cuerpo, url) => {
  const { fallo: falloSeccion, seccion } = seccionDeLaUrl(url);
  if (falloSeccion) return { fallo: falloSeccion };
  return { seccion };
});

// ---------------------------------------------------------------- los campos de un apartado

// Un apartado puede tener más de un campo, y se le pueden añadir y quitar. El campo se pide como
// `{ tipo, etiqueta?, … }` con los parámetros del catálogo que devuelve el GET (core/campos.js).
// Los campos retirados se quedan, con su contenido, igual que un apartado retirado.

// AÑADIR UN CAMPO. 201, con el campo tal como queda en la plantilla —su id es para siempre— y el
// valor con el que se abre. En un apartado de módulo el campo sale en los once (`afectaUnidades`).
const ANADIR_CAMPO = cambio('anadir_campo', (cuerpo, url) => {
  const { fallo: falloSeccion, seccion } = seccionDeLaUrl(url);
  if (falloSeccion) return { fallo: falloSeccion };
  if (!cuerpo.campo || typeof cuerpo.campo !== 'object' || Array.isArray(cuerpo.campo)) {
    return { fallo: malaPeticion('Falta «campo»: el campo que se añade, como { tipo, … }. Los tipos y sus datos los da la lectura de la estructura (`tiposDeCampo`).') };
  }
  return { seccion, campo: cuerpo.campo };
}, { estado: 201 });

// El campo sobre el que se actúa viene en la URL, junto al apartado.
function campoDeLaUrl(url) {
  const { fallo: falloSeccion, seccion } = seccionDeLaUrl(url);
  if (falloSeccion) return { fallo: falloSeccion };
  const campo = url.searchParams.get('campo');
  if (!campo) return { fallo: malaPeticion('Falta el parámetro «campo»: el campo del apartado que se cambia.') };
  return { seccion, campo };
}

// QUITAR UN CAMPO. NO BORRA: se queda en el apartado marcado como retirado, deja de pintarse, de
// imprimirse y de poder escribirse, y lo escrito en él se conserva.
const RETIRAR_CAMPO = cambio('retirar_campo', (cuerpo, url) => campoDeLaUrl(url));

// DEVOLVERLO, con todo lo que tenía escrito.
const RESTAURAR_CAMPO = cambio('restaurar_campo', (cuerpo, url) => campoDeLaUrl(url));

// ---------------------------------------------------------------- BORRAR
//
// La otra salida de lo retirado, y la única irreversible de la aplicación. Retirar no es un DELETE
// porque no borra; esto sí lo es, y es el DELETE que faltaba.
//
// SOLO SE BORRA LO QUE YA ESTÁ RETIRADO. Para destruir algo hay que haberlo retirado antes: dos actos
// deliberados y separados en el tiempo, y la lista de retirados de la portada es el único sitio donde
// se ve. Borrar algo que no lo está es un 400 que dice que primero hay que retirarlo, y no cambia nada.
//
// BORRAR DE VERDAD ES DESTRUIR EL CONTENIDO, no solo sacarlo de la plantilla:
//
//   · un APARTADO se va con su subárbol, y su contenido son filas de `apartados`, una por unidad
//     (once en una sección de módulo). Se destruyen las de todos los apartados del subárbol
//     (`repo.apartados.borrar`), y también el reparto guardado para ellos (`asignaciones`).
//   · un CAMPO no tiene fila propia: es una clave de `valores` en cada fila de su apartado. Se quita
//     de todas (`repo.apartados.quitarClave`). Un `escribir` normal no puede: la ruta de /apartado
//     funde lo que llega con lo guardado, y un campo ausente se conserva. Si el contenido viejo
//     sobreviviera, un campo creado más tarde con el mismo id lo resucitaría.
//
// QUEDA CONSTANCIA: el cambio se apunta en `plantilla.cambios` con los ids que se fueron (`secciones`),
// y `filas` y `conContenido`, lo que se destruyó. Es lo único que queda: el historial es la única
// prueba de que algo existió. La respuesta trae además `contenido` y `filasBorradas`.
//
// El permiso es el de siempre (`puedeCambiarEstructura`). El cuerpo es opcional, y si va solo
// `esperaPlantillaVersion`.

const BORRAR = cambio('borrar', (cuerpo, url) => seccionDeLaUrl(url), { cuerpoOpcional: true });

const BORRAR_CAMPO = cambio('borrar_campo', (cuerpo, url) => campoDeLaUrl(url), { cuerpoOpcional: true });

module.exports = {
  GET, ANADIR, RENOMBRAR, MOVER, RETIRAR, RESTAURAR, BORRAR, ANADIR_CAMPO, RETIRAR_CAMPO, RESTAURAR_CAMPO, BORRAR_CAMPO,
};
