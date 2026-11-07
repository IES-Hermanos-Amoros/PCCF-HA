// Adaptador de MongoDB con el driver oficial. Sin Mongoose: los documentos ya son JSON plano y el esquema lo decide
// el repositorio, no un modelo de ORM que habría que mantener a la par.
//
// Mismo contrato que memoria.js. Las diferencias son de almacenamiento:
//   - los _id son ObjectId dentro de Mongo y cadenas fuera. Las referencias entre colecciones (documentoId...) se
//     guardan como cadena desde el principio, para que un filtro no dependa del tipo con que se escribió;
//   - el conflicto de apartados se resuelve con una operación condicionada sobre la base de datos. No se lee el
//     apartado, se compara en la aplicación y luego se escribe: entre esos dos pasos otra petición podría colarse.

const { ErrorConflicto, ErrorDuplicado } = require('./errores');

const CLAVE_GLOBAL = '__pccfHaRepositorioMongo';
const CODIGO_DUPLICADO = 11000;
// Solo se reintenta en la escritura sin condición, donde un insert simultáneo o un cambio entre la lectura y la
// escritura son esperables. Si tras varios intentos no cuaja, se prefiere fallar a bloquear la petición.
const REINTENTOS = 5;
const HIJOS = ['unidades', 'apartados', 'compartidos', 'comentarios'];

// Variable de módulo: la ruta rápida mientras la instancia viva. Apunta al mismo objeto que globalThis (ver bd()).
let estado = null;

const salida = (doc) => (doc ? { ...doc, _id: String(doc._id) } : null);
const salidaMuchos = (docs) => docs.map(salida);
const hayRepetidos = (valores) => new Set(valores).size !== valores.length;
const esDuplicado = (error) => error?.code === CODIGO_DUPLICADO;

// Un insert o una actualización con filtro por updatedAt que no casa no lanza error: devuelve null. Este helper
// convierte ese «no casa» en el conflicto con el valor que hay ahora, para que la API pueda informar de él.
async function conflictoDe(coleccion, clave, esperado) {
  const actual = await coleccion.findOne(clave);
  return new ErrorConflicto({ esperado, actual: actual ? actual.updatedAt : null });
}

// createIndex es idempotente cuando la especificación coincide, así que repetirlo al arrancar no daña nada.
async function crearIndices(bd) {
  await bd.collection('documentos').createIndex({ tipo: 1, curso: 1, departamento: 1 });
  await bd.collection('unidades').createIndex({ documentoId: 1, unidadId: 1 }, { unique: true });
  await bd.collection('apartados').createIndex({ documentoId: 1, seccion: 1, unidadId: 1 }, { unique: true });
  await bd.collection('compartidos').createIndex({ documentoId: 1, cid: 1 }, { unique: true });
  await bd.collection('comentarios').createIndex({ documentoId: 1, seccion: 1, unidadId: 1 });
  await bd.collection('usuarios').createIndex({ email: 1 }, { unique: true });
  // Identidad (E2). El índice por `tokenHash` es único porque es la llave por la que se entra: dos
  // filas con el mismo hash harían que una búsqueda devolviera una cualquiera de las dos.
  await bd.collection('invitaciones').createIndex({ tokenHash: 1 }, { unique: true });
  await bd.collection('invitaciones').createIndex({ usuarioId: 1 });
  await bd.collection('sesiones').createIndex({ tokenHash: 1 }, { unique: true });
  await bd.collection('sesiones').createIndex({ usuarioId: 1 });
  // Las sesiones caducadas se borran solas. No es lo que las invalida —eso lo decide el código, que
  // compara `expiraEn` en cada petición, porque el recolector de TTL de Mongo pasa cada minuto—,
  // sino limpieza: una colección que solo crece acabaría llena de sesiones muertas de hace cursos.
  // Las invitaciones NO llevan TTL a propósito: su fila es el registro de a quién se dio de alta y
  // si llegó a entrar, y eso interesa después de que el enlace caduque.
  await bd.collection('sesiones').createIndex({ expiraEn: 1 }, { expireAfterSeconds: 0 });
  return bd;
}

function crear({ uri, nombreBd }) {
  // Dentro de la función y no arriba del fichero: index.js carga este módulo solo si alguien lo pide, y cargarlo
  // no debe exigir el driver ni tener red. El driver se resuelve cuando realmente se va a conectar.
  const { MongoClient, ObjectId } = require('mongodb');
  const clave = `${uri}\n${nombreBd}`;

  // Conexión perezosa y reutilizada. En Vercel cada invocación fría es un proceso nuevo: si cada una abriera su
  // propio cliente, el plan gratuito de MongoDB Atlas agota su límite de conexiones en cuanto hay tráfico. Por eso
  // el cliente y los índices se guardan también en globalThis: sobreviven al recargado en caliente del desarrollo,
  // donde el módulo se reevalúa y la variable de módulo se pierde. maxPoolSize pequeño porque cada instancia
  // serverless tiene su propio pool.
  function bd() {
    if (!estado) estado = (globalThis[CLAVE_GLOBAL] ??= {});
    if (estado.clave !== clave || !estado.bd) {
      const cliente = new MongoClient(uri, { maxPoolSize: 5 });
      const preparada = cliente.connect().then(() => crearIndices(cliente.db(nombreBd)));
      // Si la conexión o los índices fallan, no se cachea el fallo: la siguiente consulta reintenta. Se cierra el
      // cliente para no dejar sockets abiertos colgando de un intento fallido.
      preparada.catch(() => {
        cliente.close().catch(() => {});
        if (estado.bd === preparada) estado.bd = null;
      });
      estado.clave = clave;
      estado.bd = preparada;
    }
    return estado.bd;
  }

  const coleccion = async (nombre) => (await bd()).collection(nombre);

  // Un id que no es un ObjectId válido no puede existir en la base de datos: se devuelve null en lugar de lanzar,
  // igual que hace memoria con cualquier cadena.
  const aId = (id) => (typeof id === 'string' && ObjectId.isValid(id) ? new ObjectId(id) : null);

  // findOneAndUpdate devuelve el documento directamente (driver 6 en adelante), o null si el filtro no casó.
  // Con un $set vacío Mongo se queja, así que sin cambios se lee tal cual.
  async function actualizarUno(nombre, filtro, cambios) {
    const c = await coleccion(nombre);
    if (Object.keys(cambios).length === 0) return salida(await c.findOne(filtro));
    return salida(await c.findOneAndUpdate(filtro, { $set: cambios }, { returnDocument: 'after' }));
  }

  const documentos = {
    async crear(doc) {
      const ahora = new Date();
      const nuevo = { ...doc, _id: new ObjectId(), creado: ahora, updatedAt: new Date(ahora) };
      await (await coleccion('documentos')).insertOne(nuevo);
      return salida(nuevo);
    },
    async obtener(id) {
      const oid = aId(id);
      return oid ? salida(await (await coleccion('documentos')).findOne({ _id: oid })) : null;
    },
    async listar(filtro) {
      return salidaMuchos(await (await coleccion('documentos')).find(filtro).toArray());
    },
    async actualizar(id, cambios) {
      const oid = aId(id);
      return oid ? actualizarUno('documentos', { _id: oid }, { ...cambios, updatedAt: new Date() }) : null;
    },
    async borrar(id) {
      const oid = aId(id);
      if (!oid) return false;
      const r = await (await coleccion('documentos')).deleteOne({ _id: oid });
      if (r.deletedCount === 0) return false;
      // No hay transacción: si el proceso muere entre estas dos líneas quedan hijos huérfanos. Aceptable mientras
      // borrar un documento sea una acción de coordinación rara; si no, habría que envolverlo en una transacción.
      for (const hijos of HIJOS) await (await coleccion(hijos)).deleteMany({ documentoId: id });
      return true;
    },
  };

  const unidades = {
    async crearMuchos(documentoId, lista) {
      if (lista.length === 0) return [];
      const ids = lista.map((u) => u.unidadId);
      if (hayRepetidos(ids)) throw new ErrorDuplicado('ya hay una unidad con ese identificador en este documento');
      const c = await coleccion('unidades');
      const ya = await c.find({ documentoId, unidadId: { $in: ids } }).project({ unidadId: 1 }).toArray();
      if (ya.length > 0) throw new ErrorDuplicado('ya hay una unidad con ese identificador en este documento');
      const ahora = new Date();
      const nuevas = lista.map((u, orden) => ({ ...u, _id: new ObjectId(), documentoId, creado: new Date(ahora), orden }));
      try {
        await c.insertMany(nuevas);
      } catch (e) {
        // Si otra petición creó la misma unidad entre la comprobación y el insert, el índice único lo para. Lo que
        // ya se insertó de esa lista no se deshace: es el mismo caso que el borrado en cascada, y la importación
        // crea siempre un documento nuevo, así que aquí solo pasa con un bug.
        if (esDuplicado(e)) throw new ErrorDuplicado('ya hay una unidad con ese identificador en este documento');
        throw e;
      }
      return salidaMuchos(nuevas);
    },
    async listar(documentoId) {
      const docs = await (await coleccion('unidades')).find({ documentoId }).sort({ creado: 1, orden: 1 }).toArray();
      return salidaMuchos(docs);
    },
    async obtener(documentoId, unidadId) {
      return salida(await (await coleccion('unidades')).findOne({ documentoId, unidadId }));
    },
    async actualizar(documentoId, unidadId, cambios) {
      return actualizarUno('unidades', { documentoId, unidadId }, cambios);
    },
  };

  const apartados = {
    async leer(documentoId, seccion, unidadId) {
      return salida(await (await coleccion('apartados')).findOne({ documentoId, seccion, unidadId }));
    },

    async escribir({ documentoId, seccion, unidadId, cambios, porDefecto, esperado, siguienteToken }) {
      const c = await coleccion('apartados');
      const clave = { documentoId, seccion, unidadId };

      if (esperado === null) {
        // «Esperaba que no existiera»: el índice único decide. Si otra petición lo creó a la vez, el insert falla
        // con 11000, y eso es exactamente el conflicto que hay que avisar.
        const doc = { _id: new ObjectId(), ...clave, ...porDefecto, ...cambios, updatedAt: siguienteToken(null) };
        try {
          await c.insertOne(doc);
        } catch (e) {
          if (esDuplicado(e)) throw await conflictoDe(c, clave, esperado);
          throw e;
        }
        return salida(doc);
      }

      if (esperado instanceof Date) {
        // Una sola operación atómica: la condición va en el filtro. Si otra escritura se ha colado, el filtro no
        // casa, no se toca nada, y se informa del token que hay ahora.
        const doc = await c.findOneAndUpdate(
          { ...clave, updatedAt: esperado },
          { $set: { ...cambios, updatedAt: siguienteToken(esperado) } },
          { returnDocument: 'after' },
        );
        if (doc) return salida(doc);
        throw await conflictoDe(c, clave, esperado);
      }

      // Sin condición (importación y scripts): no hay versión que proteger, pero sí hay que garantizar que el token
      // siempre avanza. Si se hiciera un $set a ciegas con updatedAt = ahora, dos escrituras en el mismo milisegundo
      // darían el mismo token, y una edición posterior condicionada al primero sería aceptada sin detectar nada.
      // Por eso se lee el token actual y se condiciona el $set a él; si entre medias cambió, se reintenta.
      for (let intento = 0; intento < REINTENTOS; intento += 1) {
        const actual = await c.findOne(clave);
        if (!actual) {
          const doc = { _id: new ObjectId(), ...clave, ...porDefecto, ...cambios, updatedAt: siguienteToken(null) };
          try {
            await c.insertOne(doc);
            return salida(doc);
          } catch (e) {
            if (!esDuplicado(e)) throw e;
          }
        } else {
          const doc = await c.findOneAndUpdate(
            { _id: actual._id, updatedAt: actual.updatedAt },
            { $set: { ...cambios, updatedAt: siguienteToken(actual.updatedAt) } },
            { returnDocument: 'after' },
          );
          if (doc) return salida(doc);
        }
      }
      throw new Error(`escribir: el apartado «${seccion}» cambió demasiadas veces seguidas`);
    },

    async listar(documentoId, filtro) {
      return salidaMuchos(await (await coleccion('apartados')).find({ documentoId, ...filtro }).toArray());
    },

    async crearMuchos(documentoId, lista) {
      if (lista.length === 0) return [];
      const claves = (xs) => xs.map((a) => JSON.stringify([a.seccion, a.unidadId]));
      if (hayRepetidos(claves(lista))) throw new ErrorDuplicado('ya existe un apartado con esa sección y esa unidad');
      const c = await coleccion('apartados');
      const ya = await c.find({ documentoId, $or: lista.map((a) => ({ seccion: a.seccion, unidadId: a.unidadId })) })
        .project({ _id: 1 }).toArray();
      if (ya.length > 0) throw new ErrorDuplicado('ya existe un apartado con esa sección y esa unidad');
      const ahora = new Date();
      const creados = lista.map((a) => ({ ...a, _id: new ObjectId(), documentoId, updatedAt: new Date(ahora) }));
      try {
        await c.insertMany(creados);
      } catch (e) {
        if (esDuplicado(e)) throw new ErrorDuplicado('ya existe un apartado con esa sección y esa unidad');
        throw e;
      }
      return salidaMuchos(creados);
    },
  };

  const compartidos = {
    async crearMuchos(documentoId, lista) {
      if (lista.length === 0) return [];
      const cids = lista.map((c) => c.cid);
      if (hayRepetidos(cids)) throw new ErrorDuplicado('ya existe un texto compartido con ese identificador');
      const c = await coleccion('compartidos');
      const ya = await c.find({ documentoId, cid: { $in: cids } }).project({ cid: 1 }).toArray();
      if (ya.length > 0) throw new ErrorDuplicado('ya existe un texto compartido con ese identificador');
      const nuevos = lista.map((x) => ({ ...x, _id: new ObjectId(), documentoId }));
      try {
        await c.insertMany(nuevos);
      } catch (e) {
        if (esDuplicado(e)) throw new ErrorDuplicado('ya existe un texto compartido con ese identificador');
        throw e;
      }
      return salidaMuchos(nuevos);
    },
    async listar(documentoId) {
      return salidaMuchos(await (await coleccion('compartidos')).find({ documentoId }).toArray());
    },
    async obtener(documentoId, cid) {
      return salida(await (await coleccion('compartidos')).findOne({ documentoId, cid }));
    },
    async actualizar(documentoId, cid, cambios) {
      return actualizarUno('compartidos', { documentoId, cid }, cambios);
    },
  };

  const comentarios = {
    async crear(comentario) {
      const doc = { ...comentario, _id: new ObjectId(), fecha: new Date() };
      await (await coleccion('comentarios')).insertOne(doc);
      return salida(doc);
    },
    async listar(documentoId, filtro) {
      const docs = await (await coleccion('comentarios')).find({ documentoId, ...filtro })
        .sort({ fecha: 1, _id: 1 })
        .toArray();
      return salidaMuchos(docs);
    },
  };

  const usuarios = {
    async crear(usuario) {
      const doc = { ...usuario, _id: new ObjectId() };
      try {
        await (await coleccion('usuarios')).insertOne(doc);
      } catch (e) {
        if (esDuplicado(e)) throw new ErrorDuplicado('ya hay un usuario con ese email');
        throw e;
      }
      return salida(doc);
    },
    async obtener(id) {
      const oid = aId(id);
      return oid ? salida(await (await coleccion('usuarios')).findOne({ _id: oid })) : null;
    },
    async porEmail(email) {
      return salida(await (await coleccion('usuarios')).findOne({ email }));
    },
    async listar(filtro) {
      return salidaMuchos(await (await coleccion('usuarios')).find(filtro).toArray());
    },
    async actualizar(id, cambios) {
      const oid = aId(id);
      if (!oid) return null;
      try {
        return await actualizarUno('usuarios', { _id: oid }, cambios);
      } catch (e) {
        if (esDuplicado(e)) throw new ErrorDuplicado('ya hay un usuario con ese email');
        throw e;
      }
    },
  };

  // ---------------------------------------------------------------- identidad (E2)
  //
  // Lo que se guarda es `tokenHash`, nunca el testigo: ver repositorio/index.js. El índice único por
  // tokenHash hace que la búsqueda sea una sola lectura indexada.

  const invitaciones = {
    async crear(invitacion) {
      const doc = {
        ...invitacion,
        _id: new ObjectId(),
        creado: new Date(),
        estado: 'pendiente',
        usadaEn: null,
        anuladaEn: null,
      };
      try {
        await (await coleccion('invitaciones')).insertOne(doc);
      } catch (e) {
        if (esDuplicado(e)) throw new ErrorDuplicado('ya hay una invitación con ese testigo');
        throw e;
      }
      return salida(doc);
    },
    async porHash(tokenHash) {
      return salida(await (await coleccion('invitaciones')).findOne({ tokenHash }));
    },

    // Una sola operación atómica con el estado en el filtro: si dos peticiones llegan con el mismo
    // enlace, solo una encuentra la invitación pendiente y la otra recibe null. Es lo que hace que
    // el uso único lo sea de verdad y no «casi siempre».
    async usar(id, ahora) {
      const oid = aId(id);
      if (!oid) return null;
      const doc = await (await coleccion('invitaciones')).findOneAndUpdate(
        { _id: oid, estado: 'pendiente' },
        { $set: { estado: 'usada', usadaEn: ahora } },
        { returnDocument: 'after' },
      );
      return salida(doc);
    },

    async anularPendientes(usuarioId, ahora) {
      const r = await (await coleccion('invitaciones')).updateMany(
        { usuarioId, estado: 'pendiente' },
        { $set: { estado: 'anulada', anuladaEn: ahora } },
      );
      return r.modifiedCount;
    },

    async listar(filtro) {
      const docs = await (await coleccion('invitaciones')).find(filtro).sort({ creado: 1, _id: 1 }).toArray();
      return salidaMuchos(docs);
    },
  };

  const sesiones = {
    async crear(sesion) {
      const doc = { ...sesion, _id: new ObjectId(), creado: new Date(), revocadaEn: null };
      try {
        await (await coleccion('sesiones')).insertOne(doc);
      } catch (e) {
        if (esDuplicado(e)) throw new ErrorDuplicado('ya hay una sesión con ese testigo');
        throw e;
      }
      return salida(doc);
    },
    async porHash(tokenHash) {
      return salida(await (await coleccion('sesiones')).findOne({ tokenHash }));
    },

    // Condicionado a que no estuviera ya revocada, para que la fecha sea la de la primera revocación
    // y para que el llamador sepa si ha revocado algo o si no había nada que revocar.
    async revocar(id, ahora) {
      const oid = aId(id);
      if (!oid) return null;
      const doc = await (await coleccion('sesiones')).findOneAndUpdate(
        { _id: oid, revocadaEn: null },
        { $set: { revocadaEn: ahora } },
        { returnDocument: 'after' },
      );
      return salida(doc);
    },

    async revocarDeUsuario(usuarioId, ahora) {
      const r = await (await coleccion('sesiones')).updateMany(
        { usuarioId, revocadaEn: null },
        { $set: { revocadaEn: ahora } },
      );
      return r.modifiedCount;
    },

    async listar(filtro) {
      const docs = await (await coleccion('sesiones')).find(filtro).sort({ creado: 1, _id: 1 }).toArray();
      return salidaMuchos(docs);
    },
  };

  return { documentos, unidades, apartados, compartidos, comentarios, usuarios, invitaciones, sesiones };
}

module.exports = { crear };
