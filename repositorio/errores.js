// Errores de la capa de persistencia. Viven aquí y no dentro de cada adaptador para que la API reconozca el mismo
// error venga de memoria o de Mongo, y lo traduzca a un 409 sin saber qué base de datos hay debajo.

class ErrorConflicto extends Error {
  // esperado: el updatedAt con el que la persona leyó el apartado (null si esperaba que no existiera).
  // actual: el updatedAt que hay guardado ahora (null si ya no existe). Con los dos, la API puede decir cuándo
  // guardó otra persona en lugar de devolver un error genérico.
  // `que` nombra lo que ha cambiado («el apartado», «el documento»). Lo condicionado por versión
  // ya no es solo un apartado: desde el E6 también lo es el documento, cuando cambia su estructura.
  constructor({ esperado, actual, que = 'el apartado' }) {
    super(que + ' ha cambiado desde que se leyó');
    this.name = 'ErrorConflicto';
    this.codigo = 'conflicto';
    this.esperado = esperado;
    this.actual = actual;
  }
}

// Un identificador de negocio repetido (unidad, texto compartido, email). Se distingue del conflicto porque aquí
// no hay nada que reconciliar: la petición entera se rechaza, como una importación con códigos duplicados.
class ErrorDuplicado extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = 'ErrorDuplicado';
    this.codigo = 'duplicado';
  }
}

module.exports = { ErrorConflicto, ErrorDuplicado };
