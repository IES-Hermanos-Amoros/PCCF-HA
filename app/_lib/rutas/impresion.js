// CÓMO SE IMPRIME ESTE DOCUMENTO: hasta qué nivel llega el índice y qué apartados empiezan en página
// nueva.
//
//   GET   /api/documentos/[id]/impresion   lo que hay puesto, con los niveles que se pueden elegir
//   PATCH /api/documentos/[id]/impresion   lo cambia. Cuerpo: { indice?, saltos?, esperaUpdatedAt? }
//
// ================================================================ DE DÓNDE SALE ESTO
//
// De dos cosas que el departamento se encontró al imprimir, y las dos eran ciertas:
//
//   1. EL WORD SALÍA SIN ÍNDICE. El PDF llevaba uno y el Word ninguno, y el Word es el que se manda
//      por correo y el que se sigue editando.
//   2. EL ÍNDICE DEL PDF NO LLEGABA A LOS APARTADOS. Llegaba al segundo nivel, y dentro de un módulo
//      el primer nivel ya es el TERCERO —un módulo es la instancia de una sección, así que sus
//      apartados salen numerados `5.1.1`—, así que de dentro de los once módulos no entraba NADA en
//      el índice: ni los apartados principales. Un índice de una programación de ciento y pico
//      páginas que no nombra ningún apartado de ningún módulo no sirve para buscar nada.
//
// Y de una tercera que se pidió a la vez: que cada apartado pueda empezar en página nueva, que es
// como se imprime una programación cuando se encuaderna.
//
// ================================================================ DOS NÚMEROS, Y NO UNA LISTA DE CASILLAS
//
// `indice` y `saltos`, los dos un nivel de 0 a 6. No hay una casilla por apartado, y no la hay a
// propósito: una programación tiene 245 apartados y nadie va a marcar 245 casillas, ni a mantenerlas
// cuando la estructura cambie. El nivel es una decisión que se toma una vez y se entiende de un
// vistazo, y además es lo que los dos formatos saben hacer —el índice de Word se construye por nivel
// de esquema, no apartado por apartado—.
//
// EL NIVEL ES EL DE LA NUMERACIÓN IMPRESA. «Hasta el nivel 3» es hasta los apartados numerados con
// tres cifras, `5.1.3`, que es lo que el lector tiene delante. La regla y el porqué están en
// core/impresion.js, que es quien manda; esta ruta se ocupa de quién lo pide y de dónde se escribe.
//
// ================================================================ QUIÉN LA CAMBIA
//
// LA JEFATURA DEL DEPARTAMENTO, LA DE ESTUDIOS Y EL SOPORTE (`puedeConfigurarImpresion` en
// core/permisos.js). La jefatura de estudios es la excepción que hay que justificar, porque de ella
// está escrito que no edita nada: esto no es contenido, es cómo sale en el papel, no mueve el listón
// de lo que se puede aprobar y quien firma el documento impreso tiene que poder decidir cómo se
// imprime. El motivo entero está en core/permisos.js, al lado de la regla.
//
// El resto la ve en modo lectura, igual que las comprobaciones: saber cómo va a salir impreso el
// documento es parte de leerlo. 401 sin identificar, 404 si el documento no es suyo, 403 si lo ve y
// no es quien configura.
//
// ================================================================ SIN REGISTRO DE CAMBIOS, Y POR QUÉ
//
// Las comprobaciones llevan dentro quién las cambió y cuándo (./comprobaciones.js). Esto no, y no es
// un olvido: aquel registro existe porque cambiar una comprobación MUEVE EL LISTÓN de lo que se puede
// aprobar, y una aprobación que haya que justificar necesita saber con qué regla se midió. Cómo se
// imprime no cambia lo que el documento dice ni lo que se puede aprobar: el peor caso de un cambio es
// un índice más corto de lo que alguien esperaba, y se arregla volviéndolo a cambiar. Un historial
// que nadie va a consultar es peso muerto en el documento y en la pantalla.
//
// Es CommonJS y no sabe que está dentro de Next (docs/api.md, primera regla de forma).

'use strict';

const C = require('../../../core/permisos');
const { esActiva } = require('../../../core/versiones');
const Imp = require('../../../core/impresion');
const {
  conErrores, abrirDocumento, leerJson, texto, fallo, malaPeticion, impresionDe, SIN_PERMISO,
} = require('./comun');

// Los niveles que se pueden elegir, con lo que significa cada uno dicho para enseñarlo tal cual. La
// pantalla NO redacta esto: si lo redactara, el desplegable del índice y el de los saltos acabarían
// explicando el mismo número de dos maneras distintas.
//
// `ejemplo` es el número impreso de un apartado de ese nivel, que es lo que hace entender el nivel
// sin explicarlo: quien ve `5.1.3` en su documento reconoce de qué se le está hablando.
//
// `efecto` es la frase que la pantalla enseña DESPUÉS de cambiarlo, ya redactada y en su sitio. Está
// aquí y no en la pantalla porque una frase construida a trozos («los apartados de "Solo cada
// módulo"») no se lee: el título sirve para elegir en una lista y la frase para contar lo que acaba de
// pasar, y son dos redacciones distintas de la misma cosa. Las dos se escriben juntas para que no se
// contradigan.
const NIVELES_DEL_INDICE = [
  { nivel: 0, titulo: 'Sin índice', que: 'El documento sale sin índice.', ejemplo: null, efecto: 'El PDF y el Word salen sin índice.' },
  { nivel: 1, titulo: 'Solo los apartados principales', que: 'Los apartados de primer nivel y nada más.', ejemplo: '1', efecto: 'En el índice del PDF y del Word salen solo los apartados principales.' },
  { nivel: 2, titulo: 'Hasta el segundo nivel', que: 'Los apartados principales y los nombres de los módulos. Es lo de siempre.', ejemplo: '1.2', efecto: 'El índice del PDF y del Word llega hasta el segundo nivel: los apartados principales y los nombres de los módulos.' },
  { nivel: 3, titulo: 'Hasta el tercer nivel', que: 'También los apartados de dentro de cada módulo, sin sus subapartados.', ejemplo: '5.1.3', efecto: 'El índice del PDF y del Word llega hasta el tercer nivel: ya entran los apartados de dentro de cada módulo.' },
  { nivel: 4, titulo: 'Hasta el cuarto nivel', que: 'También los subapartados de dentro de cada módulo.', ejemplo: '5.1.3.2', efecto: 'El índice del PDF y del Word llega hasta el cuarto nivel: entran también los subapartados de dentro de cada módulo.' },
  { nivel: 5, titulo: 'Hasta el quinto nivel', que: 'Todo lo que la plantilla numere hasta cinco cifras.', ejemplo: '5.1.3.2.1', efecto: 'El índice del PDF y del Word llega hasta el quinto nivel.' },
  { nivel: 6, titulo: 'Hasta el sexto nivel', que: 'Todo lo que la plantilla numere.', ejemplo: '5.1.3.2.1.1', efecto: 'El índice del PDF y del Word llega hasta el sexto nivel: entra todo lo que la plantilla numere.' },
];

const NIVELES_DE_SALTO = [
  { nivel: 0, titulo: 'Solo cada módulo', que: 'Cada módulo empieza en página nueva y los apartados van uno detrás de otro. Es lo de siempre.', ejemplo: null, efecto: 'Los apartados van uno detrás de otro. Solo cada módulo empieza en página nueva.' },
  { nivel: 1, titulo: 'Cada apartado principal', que: 'Cada apartado de primer nivel empieza arriba de una página.', ejemplo: '1', efecto: 'En el PDF y en el Word, cada apartado principal empieza arriba de una página.' },
  { nivel: 2, titulo: 'Hasta el segundo nivel', que: 'También cada subapartado principal empieza en página nueva.', ejemplo: '1.2', efecto: 'En el PDF y en el Word, empiezan en página nueva los apartados principales y sus subapartados.' },
  { nivel: 3, titulo: 'Hasta el tercer nivel', que: 'También cada apartado de dentro de un módulo. El documento se alarga bastante.', ejemplo: '5.1.3', efecto: 'En el PDF y en el Word, empieza en página nueva cada apartado hasta el tercer nivel, también los de dentro de cada módulo.' },
  { nivel: 4, titulo: 'Hasta el cuarto nivel', que: 'También cada subapartado de dentro de un módulo.', ejemplo: '5.1.3.2', efecto: 'En el PDF y en el Word, empieza en página nueva cada apartado hasta el cuarto nivel.' },
  { nivel: 5, titulo: 'Hasta el quinto nivel', que: 'Hasta cinco cifras.', ejemplo: '5.1.3.2.1', efecto: 'En el PDF y en el Word, empieza en página nueva cada apartado hasta el quinto nivel.' },
  { nivel: 6, titulo: 'Hasta el sexto nivel', que: 'Todo lo que la plantilla numere.', ejemplo: '5.1.3.2.1.1', efecto: 'En el PDF y en el Word, empieza en página nueva cada apartado que la plantilla numere.' },
];

// Cada módulo empieza en página nueva SIEMPRE y eso no se configura, así que hay que decirlo: si no,
// la opción «Solo cada módulo» parece «ningún salto» y el primero que la elija creerá que ha quitado
// algo que no se puede quitar.
const LO_QUE_NO_SE_CONFIGURA = 'Cada módulo empieza en página nueva siempre, y eso no se cambia desde aquí: un módulo es un documento dentro del documento.';

const cuerpoDeLaRespuesta = (documento, config, puedeConfigurar) => ({
  documentoId: documento._id,
  indice: config.indice,
  saltos: config.saltos,
  // Lo de serie, para poder enseñar «cambiado» al lado de lo que se aparta.
  indicePorOmision: Imp.INDICE_DE_SERIE,
  saltosPorOmision: Imp.SALTOS_DE_SERIE,
  nivelesDelIndice: NIVELES_DEL_INDICE,
  nivelesDeSalto: NIVELES_DE_SALTO,
  loQueNoSeConfigura: LO_QUE_NO_SE_CONFIGURA,
  puedeConfigurar,
  // El token con el que se escribe: el cliente lo devuelve en `esperaUpdatedAt` y así dos personas
  // configurando a la vez no se pisan (ver /estructura, /estado y /comprobaciones).
  updatedAt: documento.updatedAt || null,
});

// ---------------------------------------------------------------- GET

const GET = conErrores(async (peticion, parametros) => {
  const abierto = await abrirDocumento(peticion, parametros);
  if (abierto.fallo) return abierto.fallo;
  const { usuario, documento } = abierto;

  return Response.json(
    cuerpoDeLaRespuesta(
      documento,
      // SIN la dirección: lo que se enseña es lo que está GUARDADO. Con ella, un `?indice=4` en la
      // pantalla de configuración haría creer que el documento está configurado así.
      impresionDe(documento),
      esActiva(documento) && C.puedeConfigurarImpresion(usuario, documento),
    ),
    { headers: { 'Cache-Control': 'no-store' } },
  );
});

// ---------------------------------------------------------------- PATCH

// PATCH y no PUT por lo mismo que en /comprobaciones: el cuerpo es PARCIAL y los dos ajustes son
// independientes entre sí. Quien cambia el índice no tiene que reenviar los saltos, y obligarle a
// hacerlo haría que una pantalla con una versión vieja devolviera a su sitio el ajuste que otra
// persona acababa de cambiar. Lo que protege del todo es el `esperaUpdatedAt`.
const CAMBIAR = conErrores(async (peticion, parametros) => {
  const abierto = await abrirDocumento(peticion, parametros);
  if (abierto.fallo) return abierto.fallo;
  const { usuario, documento, repo } = abierto;

  if (!C.puedeConfigurarImpresion(usuario, documento)) {
    return SIN_PERMISO('Cómo se imprime un documento lo configuran la jefatura del departamento, la jefatura de estudios y el soporte.');
  }

  const { fallo: falloCuerpo, cuerpo } = await leerJson(peticion);
  if (falloCuerpo) return falloCuerpo;

  if (cuerpo.indice === undefined && cuerpo.saltos === undefined) {
    return malaPeticion('No hay nada que cambiar: manda «indice», «saltos» o las dos cosas.');
  }

  // UN NIVEL QUE NO EXISTE ES UN 400, y no «lo dejo como estaba». Aquí sí, al contrario que en la
  // dirección de una exportación: esto es un formulario que alguien acaba de rellenar, y guardar en
  // silencio algo distinto de lo que ha elegido es lo peor que puede hacer una pantalla de
  // configuración. La regla de qué vale está en core/impresion.js y no se repite: se le pregunta.
  for (const [clave, valor] of [['indice', cuerpo.indice], ['saltos', cuerpo.saltos]]) {
    if (valor === undefined) continue;
    // `nivelPedido` con dos valores de serie distintos: si devuelve los dos, el valor no es un nivel
    // y no se ha quedado con ninguno. Es la forma de preguntarle «¿esto vale?» sin duplicar el rango.
    if (Imp.nivelPedido(valor, -1) === -1 && Imp.nivelPedido(valor, -2) === -2) {
      return malaPeticion(`«${clave}» tiene que ser un nivel de 0 a ${Imp.NIVEL_MAXIMO}, y ha llegado ${JSON.stringify(valor)}.`);
    }
  }

  // El aviso temprano, igual que en /comprobaciones: el cliente dice con qué versión está mirando la
  // pantalla, y si ya no es esa no se escribe nada. La decisión de verdad es la escritura
  // condicionada de más abajo.
  const espera = texto(cuerpo, 'esperaUpdatedAt');
  const guardado = documento.updatedAt ? new Date(documento.updatedAt).toISOString() : null;
  if (espera !== null && espera !== guardado) {
    return fallo(
      409, 'conflicto',
      'Alguien ha cambiado este documento desde que cargaste la pantalla. No se ha cambiado cómo se imprime: vuelve a cargarla para no deshacer su cambio.',
      { esperado: espera, actual: guardado },
    );
  }

  const efectiva = Imp.fusionarConfig(documento.impresion, { indice: cuerpo.indice, saltos: cuerpo.saltos });
  // Lo que se guarda es SOLO lo que se aparta de lo de serie, y es `null` cuando no se aparta en
  // nada: un documento que vuelve a lo de siempre se queda sin el campo, como uno recién importado.
  const siguiente = Imp.comprimirConfig(efectiva);

  let escrito;
  try {
    escrito = await repo.documentos.actualizar(
      documento._id, { impresion: siguiente }, { esperaUpdatedAt: documento.updatedAt },
    );
  } catch (e) {
    if (!e || e.codigo !== 'conflicto') throw e;
    const actual = await repo.documentos.obtener(documento._id);
    return fallo(
      409, 'conflicto',
      'Alguien ha cambiado este documento mientras cambiabas cómo se imprime. No se ha cambiado nada: vuelve a cargarlo.',
      { esperado: guardado, actual: actual && actual.updatedAt ? new Date(actual.updatedAt).toISOString() : null },
    );
  }

  const despues = escrito || { ...documento, impresion: siguiente };
  return Response.json(
    cuerpoDeLaRespuesta(despues, impresionDe(despues), true),
    { headers: { 'Cache-Control': 'no-store' } },
  );
});

module.exports = { GET, CAMBIAR, NIVELES_DEL_INDICE, NIVELES_DE_SALTO };
