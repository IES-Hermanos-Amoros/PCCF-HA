// Adaptador en memoria. Cumple el mismo contrato que mongo.js y no necesita base de datos: sirve para el desarrollo
// y para las pruebas. Lo que lo distingue es que guarda copias y devuelve copias.
//
// Si devolviera referencias, quien recibiera un apartado podría cambiar lo guardado tocando solo el objeto que le han
// dado, sin pasar por escribir. Las pruebas pasarían por casualidad y el comportamiento cambiaría al pasar a Mongo,
// donde eso no llega a la base de datos. structuredClone conserva las fechas, que importan porque updatedAt es un Date.

const { randomUUID } = require('node:crypto');
const { ErrorConflicto, ErrorDuplicado } = require('./errores');

const copia = (valor) => structuredClone(valor);
const HIJOS = ['unidades', 'apartados', 'compartidos', 'comentarios'];

// Una lista con repetidos se rechaza antes de tocar nada: si se guardara la mitad, una importación a medias
// quedaría indistinguible de una completa.
const hayRepetidos = (valores) => new Set(valores).size !== valores.length;

function crear() {
  const tablas = {
    documentos: [], unidades: [], apartados: [], compartidos: [], comentarios: [], usuarios: [],
    invitaciones: [], sesiones: [],
  };

  // Igualdad estricta: null solo casa con null. Un apartado común tiene unidadId null, y eso no es lo mismo que
  // no filtrar por unidad, que es un campo ausente del filtro y lo decide quien llama.
  const coincide = (filtro) => (registro) => Object.entries(filtro).every(([campo, valor]) => registro[campo] === valor);
  const de = (tabla, filtro) => tablas[tabla].filter(coincide(filtro)).map(copia);
  const uno = (tabla, filtro) => {
    const registro = tablas[tabla].find(coincide(filtro));
    return registro ? copia(registro) : null;
  };
  const actualizarEn = (tabla, filtro, cambios) => {
    const registro = tablas[tabla].find(coincide(filtro));
    if (!registro) return null;
    Object.assign(registro, copia(cambios));
    return copia(registro);
  };

  const documentos = {
    crear(doc) {
      const ahora = new Date();
      const nuevo = { ...copia(doc), _id: randomUUID(), creado: ahora, updatedAt: new Date(ahora) };
      tablas.documentos.push(nuevo);
      return copia(nuevo);
    },
    obtener: (id) => uno('documentos', { _id: id }),
    listar: (filtro) => de('documentos', filtro),
    // Misma regla que apartados.escribir, y sin ningún await entre la comprobación y la escritura. Con `esperado`,
    // una versión que no cuadra no escribe nada. El token nuevo sale de `siguienteToken`, que avanza siempre.
    actualizar(id, cambios, { esperado, siguienteToken } = {}) {
      const registro = tablas.documentos.find((d) => d._id === id);
      const actual = registro ? registro.updatedAt : null;
      if (esperado === null && registro) throw new ErrorConflicto({ esperado, actual: copia(actual), que: 'el documento' });
      if (esperado instanceof Date && (!registro || actual.getTime() !== esperado.getTime())) {
        throw new ErrorConflicto({ esperado: copia(esperado), actual: copia(actual), que: 'el documento' });
      }
      if (!registro) return null;
      Object.assign(registro, copia(cambios), { updatedAt: siguienteToken(actual) });
      return copia(registro);
    },
    borrar(id) {
      const i = tablas.documentos.findIndex((d) => d._id === id);
      if (i < 0) return false;
      tablas.documentos.splice(i, 1);
      // Sin esto quedarían unidades y apartados huérfanos, invisibles para cualquier listado y ocupando sitio.
      for (const tabla of HIJOS) tablas[tabla] = tablas[tabla].filter((r) => r.documentoId !== id);
      return true;
    },
  };

  const unidades = {
    crearMuchos(documentoId, lista) {
      const existentes = tablas.unidades.filter((u) => u.documentoId === documentoId).map((u) => u.unidadId);
      const ids = lista.map((u) => u.unidadId);
      if (hayRepetidos(ids) || ids.some((id) => existentes.includes(id))) {
        throw new ErrorDuplicado('ya hay una unidad con ese identificador en este documento');
      }
      const ahora = new Date();
      // El orden del array es el orden de creación; listar lo respeta porque no reordena nada.
      const nuevas = lista.map((u, orden) => ({ ...copia(u), _id: randomUUID(), documentoId, creado: new Date(ahora), orden }));
      tablas.unidades.push(...nuevas);
      return nuevas.map(copia);
    },
    listar: (documentoId) => de('unidades', { documentoId }),
    obtener: (documentoId, unidadId) => uno('unidades', { documentoId, unidadId }),
    actualizar: (documentoId, unidadId, cambios) => actualizarEn('unidades', { documentoId, unidadId }, cambios),
  };

  const apartados = {
    leer: (documentoId, seccion, unidadId) => uno('apartados', { documentoId, seccion, unidadId }),

    escribir({ documentoId, seccion, unidadId, cambios, porDefecto, esperado, siguienteToken }) {
      const clave = { documentoId, seccion, unidadId };
      const registro = tablas.apartados.find(coincide(clave));
      const actual = registro ? registro.updatedAt : null;

      // Aquí la comprobación y la escritura no tienen ningún await entre medias, así que no hay carrera posible.
      // Es la misma regla que mongo.js resuelve con un filtro por updatedAt: si el token no es el que espera
      // quien escribe, alguien guardó antes y no se toca nada.
      if (esperado === null && registro) throw new ErrorConflicto({ esperado, actual: copia(actual) });
      if (esperado instanceof Date && (!registro || actual.getTime() !== esperado.getTime())) {
        throw new ErrorConflicto({ esperado: copia(esperado), actual: copia(actual) });
      }

      const updatedAt = siguienteToken(actual);
      if (registro) {
        Object.assign(registro, copia(cambios), { updatedAt });
        return copia(registro);
      }
      const nuevo = { _id: randomUUID(), ...clave, ...copia(porDefecto), ...copia(cambios), updatedAt };
      tablas.apartados.push(nuevo);
      return copia(nuevo);
    },

    listar: (documentoId, filtro) => de('apartados', { documentoId, ...filtro }),

    crearMuchos(documentoId, lista) {
      const claves = (xs) => xs.map((a) => JSON.stringify([a.seccion, a.unidadId]));
      const existentes = claves(tablas.apartados.filter((a) => a.documentoId === documentoId));
      const nuevas = claves(lista);
      if (hayRepetidos(nuevas) || nuevas.some((c) => existentes.includes(c))) {
        throw new ErrorDuplicado('ya existe un apartado con esa sección y esa unidad');
      }
      const ahora = new Date();
      const creados = lista.map((a) => ({ _id: randomUUID(), ...copia(a), documentoId, updatedAt: new Date(ahora) }));
      tablas.apartados.push(...creados);
      return creados.map(copia);
    },

    borrar(documentoId, secciones) {
      const antes = tablas.apartados.length;
      tablas.apartados = tablas.apartados.filter((a) => !(a.documentoId === documentoId && secciones.includes(a.seccion)));
      return antes - tablas.apartados.length;
    },

    // Sin ningún await entre la lectura y la escritura, así que es atómico por construcción.
    quitarClave({ documentoId, seccion, clave, siguienteToken }) {
      let quitadas = 0;
      for (const fila of tablas.apartados) {
        if (fila.documentoId !== documentoId || fila.seccion !== seccion) continue;
        if (!fila.valores || !Object.prototype.hasOwnProperty.call(fila.valores, clave)) continue;
        delete fila.valores[clave];
        fila.updatedAt = siguienteToken(fila.updatedAt);
        quitadas += 1;
      }
      return quitadas;
    },
  };

  const compartidos = {
    crearMuchos(documentoId, lista) {
      const existentes = tablas.compartidos.filter((c) => c.documentoId === documentoId).map((c) => c.cid);
      const cids = lista.map((c) => c.cid);
      if (hayRepetidos(cids) || cids.some((c) => existentes.includes(c))) {
        throw new ErrorDuplicado('ya existe un texto compartido con ese identificador');
      }
      const nuevos = lista.map((c) => ({ ...copia(c), _id: randomUUID(), documentoId }));
      tablas.compartidos.push(...nuevos);
      return nuevos.map(copia);
    },
    listar: (documentoId) => de('compartidos', { documentoId }),
    obtener: (documentoId, cid) => uno('compartidos', { documentoId, cid }),
    actualizar: (documentoId, cid, cambios) => actualizarEn('compartidos', { documentoId, cid }, cambios),
  };

  const comentarios = {
    crear(comentario) {
      const nuevo = { ...copia(comentario), _id: randomUUID(), fecha: new Date() };
      tablas.comentarios.push(nuevo);
      return copia(nuevo);
    },
    // sort es estable: los comentarios con la misma fecha en milisegundos conservan el orden en que se escribieron.
    listar: (documentoId, filtro) => de('comentarios', { documentoId, ...filtro }).sort((x, y) => x.fecha - y.fecha),
  };

  const usuarios = {
    crear(usuario) {
      if (tablas.usuarios.some((u) => u.email === usuario.email)) throw new ErrorDuplicado('ya hay un usuario con ese email');
      const nuevo = { ...copia(usuario), _id: randomUUID() };
      tablas.usuarios.push(nuevo);
      return copia(nuevo);
    },
    obtener: (id) => uno('usuarios', { _id: id }),
    porEmail: (email) => uno('usuarios', { email }),
    listar: (filtro) => de('usuarios', filtro),
    actualizar(id, cambios) {
      if (cambios.email !== undefined && tablas.usuarios.some((u) => u.email === cambios.email && u._id !== id)) {
        throw new ErrorDuplicado('ya hay un usuario con ese email');
      }
      return actualizarEn('usuarios', { _id: id }, cambios);
    },
  };

  // ---------------------------------------------------------------- identidad (E2)
  //
  // Lo que llega es `tokenHash`, nunca el testigo: ver repositorio/index.js. Aquí se guarda tal cual
  // y se busca por él, igual que haría Mongo con su índice único.

  const invitaciones = {
    crear(invitacion) {
      // El hash repetido es imposible en la práctica —32 bytes de randomBytes—, pero si pasara, dos
      // invitaciones con el mismo hash harían que `porHash` devolviera una cualquiera de las dos.
      // Mongo lo para con un índice único y aquí también, para que el contrato sea el mismo.
      if (tablas.invitaciones.some((i) => i.tokenHash === invitacion.tokenHash)) {
        throw new ErrorDuplicado('ya hay una invitación con ese testigo');
      }
      const nueva = {
        ...copia(invitacion),
        _id: randomUUID(),
        creado: new Date(),
        estado: 'pendiente',
        usadaEn: null,
        anuladaEn: null,
      };
      tablas.invitaciones.push(nueva);
      return copia(nueva);
    },
    porHash: (tokenHash) => uno('invitaciones', { tokenHash }),

    // Entre encontrarla y marcarla no hay ningún await, así que no hay carrera posible: es la misma
    // garantía que mongo.js consigue con un findOneAndUpdate condicionado a `estado: 'pendiente'`.
    usar(id, ahora) {
      const registro = tablas.invitaciones.find((i) => i._id === id);
      if (!registro || registro.estado !== 'pendiente') return null;
      Object.assign(registro, { estado: 'usada', usadaEn: new Date(ahora) });
      return copia(registro);
    },

    anularPendientes(usuarioId, ahora) {
      let anuladas = 0;
      for (const registro of tablas.invitaciones) {
        if (registro.usuarioId !== usuarioId || registro.estado !== 'pendiente') continue;
        Object.assign(registro, { estado: 'anulada', anuladaEn: new Date(ahora) });
        anuladas += 1;
      }
      return anuladas;
    },

    listar: (filtro) => de('invitaciones', filtro).sort((x, y) => x.creado - y.creado),
  };

  const sesiones = {
    crear(sesion) {
      if (tablas.sesiones.some((s) => s.tokenHash === sesion.tokenHash)) {
        throw new ErrorDuplicado('ya hay una sesión con ese testigo');
      }
      const nueva = { ...copia(sesion), _id: randomUUID(), creado: new Date(), revocadaEn: null };
      tablas.sesiones.push(nueva);
      return copia(nueva);
    },
    porHash: (tokenHash) => uno('sesiones', { tokenHash }),

    revocar(id, ahora) {
      const registro = tablas.sesiones.find((s) => s._id === id);
      if (!registro || registro.revocadaEn) return null;
      registro.revocadaEn = new Date(ahora);
      return copia(registro);
    },

    revocarDeUsuario(usuarioId, ahora) {
      let revocadas = 0;
      for (const registro of tablas.sesiones) {
        if (registro.usuarioId !== usuarioId || registro.revocadaEn) continue;
        registro.revocadaEn = new Date(ahora);
        revocadas += 1;
      }
      return revocadas;
    },

    listar: (filtro) => de('sesiones', filtro).sort((x, y) => x.creado - y.creado),
  };

  return { documentos, unidades, apartados, compartidos, comentarios, usuarios, invitaciones, sesiones };
}

module.exports = { crear };
