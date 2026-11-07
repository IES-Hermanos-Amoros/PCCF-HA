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
  usuario: ['nombre', 'email', 'rol', 'departamento'],
};

// Solo se filtra por estos campos. El filtro viene de la API, y sin lista blanca un parámetro podría colar un
// operador de Mongo ({ $ne: null }) donde se esperaba un valor.
const FILTROS = {
  documentos: ['tipo', 'curso', 'departamento', 'estado'],
  apartados: ['seccion', 'unidadId'],
  comentarios: ['seccion', 'unidadId'],
  usuarios: ['departamento', 'rol'],
};

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
  };
}

module.exports = { crearRepositorio, ErrorConflicto, ErrorDuplicado };
