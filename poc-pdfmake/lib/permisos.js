// Quién ve y quién edita cada parte de un documento. Sin usuarios reales todavía: un usuario es { id, rol, departamento }.
// Roles:
//   admin              coordinación técnica: ve y edita todo (soporte)
//   jefe_estudios      ve los documentos de todos los departamentos, en cualquier estado; no edita
//   jefe_departamento  su departamento: apartados comunes y textos compartidos; los módulos, solo si los tiene asignados
//   docente            ve los documentos de su departamento; edita los módulos que tiene asignados y los apartados comunes que se le asignen
// La plantilla marca quién edita cada apartado (edita: 'jefe_departamento' | 'docentes_del_modulo'); los subapartados heredan
// salvo que indiquen otro valor. En los datos, cada instancia lleva sus docentes y datos.asignaciones reparte apartados
// comunes a docentes concretos: { idApartado: [idUsuario, ...] }.

const contiene = (sec, id) => id === sec.id || id.startsWith(sec.id + '/');

// Apartado de la plantilla que corresponde a un id (el más profundo) y a quién corresponde editarlo
function quienEdita(plantilla, idSeccion) {
  let edita = null; let nivel = plantilla.secciones;
  for (;;) {
    const s = (nivel || []).find((x) => contiene(x, idSeccion));
    if (!s) break;
    if (s.edita) edita = s.edita;
    nivel = s.hijos;
  }
  return edita;
}
const apartadoComun = (plantilla, idSeccion) => (plantilla.secciones.find((s) => contiene(s, idSeccion)) || {}).id;
const buscarInstancia = (datos, instancia) => (typeof instancia === 'number' ? datos.instancias[instancia] : datos.instancias.find((x) => x.titulo === instancia));
const asignado = (datos, idSeccion, plantilla, usuario) => {
  const a = (datos.asignaciones || {});
  return [idSeccion, apartadoComun(plantilla, idSeccion)].some((k) => k && (a[k] || []).includes(usuario.id));
};

function puedeVer(usuario, datos) {
  if (!usuario) return false;
  if (usuario.rol === 'admin' || usuario.rol === 'jefe_estudios') return true;
  return !!datos.departamento && usuario.departamento === datos.departamento;
}

// donde = { seccion: id del apartado, instancia: índice o título del módulo (solo en apartados de módulo) }
function puedeEditar(usuario, plantilla, datos, { seccion, instancia } = {}) {
  if (!puedeVer(usuario, datos)) return false;
  if (usuario.rol === 'admin') return true;
  if (usuario.rol === 'jefe_estudios') return false;
  const edita = quienEdita(plantilla, seccion);
  if (edita === 'docentes_del_modulo') {
    const ins = instancia === undefined ? null : buscarInstancia(datos, instancia);
    return !!ins && (ins.docentes || []).includes(usuario.id);
  }
  if (edita === 'jefe_departamento') return usuario.rol === 'jefe_departamento' || asignado(datos, seccion, plantilla, usuario);
  return false;
}

// Editar el texto compartido cambia todos los módulos vinculados: lo hace el jefe de departamento, o quien edite el apartado
// común del que procede el texto.
function puedeEditarCompartido(usuario, plantilla, datos, id) {
  const c = (datos.compartidos || {})[id];
  if (!c || !puedeVer(usuario, datos)) return false;
  if (usuario.rol === 'admin') return true;
  if (usuario.rol === 'jefe_estudios') return false;
  if (usuario.rol === 'jefe_departamento') return true;
  return c.comun && quienEdita(plantilla, c.seccion) === 'jefe_departamento' && asignado(datos, c.seccion, plantilla, usuario);
}

// Desvincular deja en el módulo una copia propia: solo si el texto es "sugerido" y el usuario puede editar ese apartado del módulo
function puedeDesvincular(usuario, plantilla, datos, id, donde) {
  const c = (datos.compartidos || {})[id];
  return !!c && c.modo === 'sugerido' && puedeEditar(usuario, plantilla, datos, donde);
}

module.exports = { puedeVer, puedeEditar, puedeEditarCompartido, puedeDesvincular, quienEdita };
