// Repositorio de persistencia: la única puerta por la que la aplicación lee y escribe datos.
//
// Recibe un adaptador (memoria.js para desarrollo y pruebas, mongo.js para producción) y se ocupa de lo que no depende
// de la base de datos: qué campos se aceptan, qué valores tiene un apartado nuevo y cómo se normaliza la condición de
// conflicto. Lo que sí depende de la base de datos (cómo se genera el _id, cómo se detecta un conflicto de forma
// atómica) lo resuelve cada adaptador, y test/repositorio.js comprueba que los dos cumplen exactamente lo mismo.
//
// Este fichero no carga ningún adaptador: mongo.js exige el driver solo cuando se llama a su crear().

const { ErrorConflicto, ErrorDuplicado } = require('./errores');

// Lo que se acepta al escribir. Lo que no está aquí se descarta sin error a propósito: _id, creado y updatedAt los
// pone solo el repositorio. Si un llamador pudiera escribir updatedAt, podría falsear el token de conflicto y el
// control de concurrencia dejaría de proteger nada.
const CAMPOS = {
  documento: ['tipo', 'ciclo', 'curso', 'departamento', 'estado', 'plantilla', 'plantillaVersion', 'anteriorId', 'asignaciones', 'origen'],
  unidad: ['titulo', 'num', 'grupo', 'docentes'],
  apartado: ['valores', 'origen', 'revisadoPor', 'revisadoEn'],
  compartido: ['bloque', 'seccion', 'comun', 'responsable', 'modo', 'version'],
  comentario: ['seccion', 'autor', 'texto'],
  // `activo` se añade en el E2: una persona dada de baja no entra y sus sesiones dejan de valer. No
  // se puede borrar en su lugar porque su identificador está dentro de `documentos.asignaciones` y
  // de `unidades.docentes`, y borrarla dejaría repartos apuntando a nadie.
  //
  // AUSENTE QUIERE DECIR ACTIVA, y es deliberado: las personas que ya estaban en una base de datos
  // del E1 no tienen el campo, y si la ausencia fuera «de baja» el cambio dejaría al departamento
  // entero fuera. Nadie gana permisos por eso: el permiso lo da la sesión, y la sesión exige una
  // invitación. Se lee siempre como `activo !== false`, nunca como `activo === true`.
  usuario: ['nombre', 'email', 'rol', 'departamento', 'activo', 'ultimoAcceso'],
  // Una invitación por alta: la jefatura da de alta a una persona y la aplicación genera un enlace
  // de acceso de un solo uso. `estado`, `usadaEn` y `anuladaEn` NO están aquí, por lo mismo que
  // `updatedAt`: si el llamador pudiera escribir `estado`, podría devolver a «pendiente» una
  // invitación ya canjeada y el uso único dejaría de significar nada.
  invitacion: ['usuarioId', 'email', 'rol', 'departamento', 'tokenHash', 'expiraEn', 'creadaPor'],
  // Una sesión por acceso. `revocadaEn` tampoco se escribe desde fuera: se revoca con
  // `sesiones.revocar`, que es lo que hace cerrar sesión, y si se pudiera poner a null a mano una
  // sesión revocada volvería a valer.
  sesion: ['usuarioId', 'tokenHash', 'expiraEn'],
};

// Solo se filtra por estos campos. El filtro viene de la API, y sin lista blanca un parámetro podría colar un
// operador de Mongo ({ $ne: null }) donde se esperaba un valor.
const FILTROS = {
  documentos: ['tipo', 'curso', 'departamento', 'estado'],
  apartados: ['seccion', 'unidadId'],
  comentarios: ['seccion', 'unidadId'],
  // `activo` no se filtra a propósito: ausente quiere decir activa (ver CAMPOS.usuario), así que un
  // filtro `{ activo: true }` dejaría fuera justo a quien se dio de alta antes de que el campo
  // existiera. Quien necesite solo las activas filtra en memoria con `activo !== false`.
  usuarios: ['departamento', 'rol'],
  invitaciones: ['usuarioId', 'email', 'estado'],
  sesiones: ['usuarioId'],
};

// Los tres estados de una invitación. Es un conjunto cerrado: `pendiente` es la única que se puede
// canjear, `usada` la que ya se canjeó —el uso único— y `anulada` la que se sustituyó por otra
// cuando alguien perdió su enlace. Sin `anulada` habría que marcar la vieja como «usada», y entonces
// el registro no distinguiría a quien entró de quien nunca llegó a entrar.
const ESTADOS_INVITACION = ['pendiente', 'usada', 'anulada'];

// Lo que tiene un apartado recién creado. Es una función y no una constante porque cada apartado debe recibir su
// propio objeto: si dos apartados compartieran el mismo objeto `valores`, modificar uno cambiaría el otro.
const porDefectoApartado = () => ({ valores: {}, origen: null, revisadoPor: null, revisadoEn: null });

// Copia solo los campos pedidos y descarta los undefined. Un campo ausente no debe borrar lo que ya hay guardado.
function elegir(origen, campos) {
  const resultado = {};
  for (const campo of campos) {
    if (origen?.[campo] !== undefined) resultado[campo] = origen[campo];
  }
  return resultado;
}

// Como elegir, pero para filtros: rechaza objetos, que en Mongo serían operadores.
function filtrar(origen, campos) {
  const resultado = {};
  for (const campo of campos) {
    const valor = origen?.[campo];
    if (valor === undefined) continue;
    if (valor !== null && typeof valor === 'object') {
      throw new TypeError(`el filtro «${campo}» debe ser un valor, no un objeto`);
    }
    resultado[campo] = valor;
  }
  return resultado;
}

// Los identificadores llegan de la URL o del cuerpo de la petición. Se exige cadena para que nunca lleguen a una
// consulta como objeto, y para que un id vacío no se confunda con uno ausente.
function cadena(valor, nombre) {
  if (typeof valor !== 'string' || valor === '') throw new TypeError(`${nombre} debe ser una cadena no vacía`);
  return valor;
}

// Las caducidades llegan como Date si las pone el código y como cadena ISO si vienen de JSON. Se exige una fecha
// válida porque una caducidad que no se entiende tiene que parar la escritura: `new Date(null)` es el 1 de enero de
// 1970, es decir, una invitación nacida caducada, y `new Date(undefined)` es inválida pero Mongo la guardaría igual.
function fecha(valor, nombre) {
  if (valor === undefined || valor === null) throw new TypeError(`${nombre} debe ser una fecha`);
  const f = valor instanceof Date ? new Date(valor.getTime()) : new Date(valor);
  if (Number.isNaN(f.getTime())) throw new TypeError(`${nombre} no es una fecha válida`);
  return f;
}

// «Ahora» es un parámetro y no `Date.now()` dentro del adaptador para que una prueba pueda fijar el instante sin
// tocar el reloj del proceso. Por omisión, el de verdad.
const ahoraO = (valor) => (valor === undefined || valor === null ? new Date() : fecha(valor, 'ahora'));

// Un apartado común se guarda con unidadId null, nunca ausente: así la clave única y los filtros lo tratan igual.
const unidadOComun = (unidadId) => (unidadId === undefined || unidadId === null ? null : cadena(unidadId, 'unidadId'));

// esperaUpdatedAt llega como Date si lo pone el código, y como cadena ISO si viene de la API (JSON no tiene fechas).
// Se normaliza aquí para que el adaptador compare siempre Date con Date.
function normalizarEsperado(valor) {
  if (valor === undefined || valor === null) return valor;
  const fecha = valor instanceof Date ? new Date(valor.getTime()) : new Date(valor);
  if (Number.isNaN(fecha.getTime())) throw new TypeError('esperaUpdatedAt no es una fecha válida');
  return fecha;
}

// El token nuevo de un apartado tiene que ser distinto del que tenía antes, aunque las dos escrituras caigan en el
// mismo milisegundo. Si no lo fuera, quien leyó la versión anterior podría escribir sobre la nueva sin enterarse.
function siguienteToken(anterior) {
  const ahora = Date.now();
  return new Date(anterior instanceof Date ? Math.max(ahora, anterior.getTime() + 1) : ahora);
}

function crearRepositorio({ adaptador }) {
  if (!adaptador) throw new TypeError('crearRepositorio necesita un adaptador');
  const a = adaptador;

  return {
    documentos: {
      crear: async (doc) => a.documentos.crear(elegir(doc, CAMPOS.documento)),
      obtener: async (id) => a.documentos.obtener(cadena(id, 'id')),
      listar: async (filtro = {}) => a.documentos.listar(filtrar(filtro, FILTROS.documentos)),
      actualizar: async (id, cambios) => a.documentos.actualizar(cadena(id, 'id'), elegir(cambios, CAMPOS.documento)),
      borrar: async (id) => a.documentos.borrar(cadena(id, 'id')),
    },

    unidades: {
      crearMuchos: async (documentoId, lista) => a.unidades.crearMuchos(cadena(documentoId, 'documentoId'), lista.map((u) => ({
        docentes: [],
        ...elegir(u, CAMPOS.unidad),
        unidadId: cadena(u?.unidadId, 'unidadId'),
      }))),
      listar: async (documentoId) => a.unidades.listar(cadena(documentoId, 'documentoId')),
      obtener: async (documentoId, unidadId) => a.unidades.obtener(cadena(documentoId, 'documentoId'), cadena(unidadId, 'unidadId')),
      actualizar: async (documentoId, unidadId, cambios) => a.unidades.actualizar(
        cadena(documentoId, 'documentoId'),
        cadena(unidadId, 'unidadId'),
        elegir(cambios, CAMPOS.unidad),
      ),
    },

    apartados: {
      leer: async (documentoId, seccion, unidadId = null) => a.apartados.leer(
        cadena(documentoId, 'documentoId'),
        cadena(seccion, 'seccion'),
        unidadOComun(unidadId),
      ),
      escribir: async (documentoId, seccion, unidadId, cambios = {}, opciones = {}) => a.apartados.escribir({
        documentoId: cadena(documentoId, 'documentoId'),
        seccion: cadena(seccion, 'seccion'),
        unidadId: unidadOComun(unidadId),
        cambios: elegir(cambios, CAMPOS.apartado),
        porDefecto: porDefectoApartado(),
        esperado: normalizarEsperado(opciones?.esperaUpdatedAt),
        siguienteToken,
      }),
      listar: async (documentoId, filtro = {}) => a.apartados.listar(
        cadena(documentoId, 'documentoId'),
        filtrar(filtro, FILTROS.apartados),
      ),
      crearMuchos: async (documentoId, lista) => a.apartados.crearMuchos(cadena(documentoId, 'documentoId'), lista.map((x) => ({
        ...porDefectoApartado(),
        ...elegir(x, CAMPOS.apartado),
        seccion: cadena(x?.seccion, 'seccion'),
        unidadId: unidadOComun(x?.unidadId),
      }))),
    },

    compartidos: {
      crearMuchos: async (documentoId, lista) => a.compartidos.crearMuchos(cadena(documentoId, 'documentoId'), lista.map((c) => ({
        ...elegir(c, CAMPOS.compartido),
        cid: cadena(c?.cid, 'cid'),
      }))),
      listar: async (documentoId) => a.compartidos.listar(cadena(documentoId, 'documentoId')),
      obtener: async (documentoId, cid) => a.compartidos.obtener(cadena(documentoId, 'documentoId'), cadena(cid, 'cid')),
      actualizar: async (documentoId, cid, cambios) => a.compartidos.actualizar(
        cadena(documentoId, 'documentoId'),
        cadena(cid, 'cid'),
        elegir(cambios, CAMPOS.compartido),
      ),
    },

    comentarios: {
      crear: async (c) => a.comentarios.crear({
        documentoId: cadena(c?.documentoId, 'documentoId'),
        ...elegir(c, CAMPOS.comentario),
        seccion: cadena(c?.seccion, 'seccion'),
        unidadId: unidadOComun(c?.unidadId),
      }),
      listar: async (documentoId, filtro = {}) => a.comentarios.listar(
        cadena(documentoId, 'documentoId'),
        filtrar(filtro, FILTROS.comentarios),
      ),
    },

    usuarios: {
      crear: async (u) => a.usuarios.crear({ ...elegir(u, CAMPOS.usuario), email: cadena(u?.email, 'email') }),
      obtener: async (id) => a.usuarios.obtener(cadena(id, 'id')),
      porEmail: async (email) => a.usuarios.porEmail(cadena(email, 'email')),
      listar: async (filtro = {}) => a.usuarios.listar(filtrar(filtro, FILTROS.usuarios)),
      actualizar: async (id, cambios) => a.usuarios.actualizar(cadena(id, 'id'), elegir(cambios, CAMPOS.usuario)),
    },

    // ---------------------------------------------------------------- identidad (E2)
    //
    // NUNCA SE GUARDA EL TESTIGO, SOLO SU HASH. Las dos colecciones reciben `tokenHash` y no el
    // testigo, y no hay ninguna operación que devuelva un testigo: quien mire la base de datos, o
    // una copia de seguridad de Mongo, no se lleva ninguna llave utilizable. Por eso la búsqueda es
    // `porHash` y no `porTestigo`: el hash lo calcula app/_lib/testigos.js, que es quien sabe cómo.

    invitaciones: {
      crear: async (inv) => a.invitaciones.crear({
        ...elegir(inv, CAMPOS.invitacion),
        usuarioId: cadena(inv?.usuarioId, 'usuarioId'),
        tokenHash: cadena(inv?.tokenHash, 'tokenHash'),
        expiraEn: fecha(inv?.expiraEn, 'expiraEn'),
      }),
      porHash: async (tokenHash) => a.invitaciones.porHash(cadena(tokenHash, 'tokenHash')),

      // El uso único vive aquí y no en la ruta: devuelve la invitación si estaba pendiente y la deja
      // usada, y null si ya no lo estaba. Lo tiene que decidir el adaptador en una sola operación
      // porque dos peticiones con el mismo enlace llegan a la vez más a menudo de lo que parece —un
      // doble clic, o un cliente de correo que precarga el enlace—, y si la comprobación y la
      // escritura fueran dos pasos, las dos abrirían sesión.
      usar: async (id, ahora) => a.invitaciones.usar(cadena(id, 'id'), ahoraO(ahora)),

      // Volver a invitar a quien perdió su enlace anula los que tenía pendientes: el enlace que vale
      // es el último que se ha mandado. Si el viejo siguiera sirviendo, un enlace que se mandó a una
      // dirección equivocada no se podría retirar de ninguna manera.
      anularPendientes: async (usuarioId, ahora) => a.invitaciones.anularPendientes(cadena(usuarioId, 'usuarioId'), ahoraO(ahora)),

      listar: async (filtro = {}) => {
        const limpio = filtrar(filtro, FILTROS.invitaciones);
        // Un estado que no existe devolvería la lista vacía sin decir nada, y quien escribiera
        // `estado: 'pendientes'` creería que no hay ninguna invitación pendiente.
        if (limpio.estado !== undefined && !ESTADOS_INVITACION.includes(limpio.estado)) {
          throw new TypeError(`el estado «${limpio.estado}» no existe: ${ESTADOS_INVITACION.join(', ')}`);
        }
        return a.invitaciones.listar(limpio);
      },
    },

    sesiones: {
      crear: async (s) => a.sesiones.crear({
        ...elegir(s, CAMPOS.sesion),
        usuarioId: cadena(s?.usuarioId, 'usuarioId'),
        tokenHash: cadena(s?.tokenHash, 'tokenHash'),
        expiraEn: fecha(s?.expiraEn, 'expiraEn'),
      }),
      porHash: async (tokenHash) => a.sesiones.porHash(cadena(tokenHash, 'tokenHash')),

      // Cerrar sesión revoca, no borra: la fila se queda para poder decir que esa sesión existió y
      // se cerró. Devuelve la sesión revocada, o null si no existía o ya estaba revocada.
      revocar: async (id, ahora) => a.sesiones.revocar(cadena(id, 'id'), ahoraO(ahora)),

      // Todas las de una persona de golpe: es lo que hace falta al desactivarla o al cambiarle el
      // rol. Si solo se cambiara el campo `activo`, quien ya tuviera la pestaña abierta seguiría
      // dentro con el rol de antes hasta que caducara su sesión. Devuelve cuántas ha revocado.
      revocarDeUsuario: async (usuarioId, ahora) => a.sesiones.revocarDeUsuario(cadena(usuarioId, 'usuarioId'), ahoraO(ahora)),

      listar: async (filtro = {}) => a.sesiones.listar(filtrar(filtro, FILTROS.sesiones)),
    },
  };
}

module.exports = { crearRepositorio, ErrorConflicto, ErrorDuplicado, ESTADOS_INVITACION };
