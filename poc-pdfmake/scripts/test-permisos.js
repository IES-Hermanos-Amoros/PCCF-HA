// Pruebas de permisos con una plantilla y unos datos inventados.
//   node scripts/test-permisos.js
const assert = require('assert/strict');
const { puedeVer, puedeEditar, puedeEditarCompartido, puedeDesvincular } = require('../lib/permisos');

const plantilla = { secciones: [
  { id: 'introduccion', edita: 'jefe_departamento', hijos: [{ id: 'introduccion/contexto', hijos: [] }] },
  { id: 'atencion-a-la-diversidad', edita: 'jefe_departamento', hijos: [] },
  { id: 'modulos', instancias: true, edita: 'docentes_del_modulo', hijos: [{ id: 'modulos/recuperacion', hijos: [] }] },
] };
const datos = {
  departamento: 'informatica',
  asignaciones: { 'atencion-a-la-diversidad': ['ana'] },
  instancias: [{ titulo: 'Programación', docentes: ['ana'] }, { titulo: 'Bases de datos', docentes: ['luis', 'jefe'] }],
  compartidos: {
    c001: { seccion: 'modulos/recuperacion', comun: false, modo: 'sugerido' },
    c002: { seccion: 'atencion-a-la-diversidad', comun: true, modo: 'sugerido' },
    c003: { seccion: 'modulos/recuperacion', comun: false, modo: 'obligatorio' },
  },
};
const u = {
  admin: { id: 'admin', rol: 'admin' },
  estudios: { id: 'je', rol: 'jefe_estudios' },
  jefe: { id: 'jefe', rol: 'jefe_departamento', departamento: 'informatica' },
  ana: { id: 'ana', rol: 'docente', departamento: 'informatica' },
  luis: { id: 'luis', rol: 'docente', departamento: 'informatica' },
  otro: { id: 'eva', rol: 'jefe_departamento', departamento: 'matematicas' },
};
const comun = { seccion: 'introduccion/contexto' };
const prog = { seccion: 'modulos/recuperacion', instancia: 'Programación' };
const bd = { seccion: 'modulos/recuperacion', instancia: 'Bases de datos' };

let fallos = 0;
const prueba = (nombre, fn) => { try { fn(); console.log(`ok   ${nombre}`); } catch (e) { fallos += 1; console.log(`FALLO ${nombre}\n     ${e.message}`); } };

prueba('jefatura de estudios ve todos los departamentos pero no edita', () => {
  assert.equal(puedeVer(u.estudios, datos), true);
  assert.equal(puedeVer(u.estudios, { ...datos, departamento: 'matematicas' }), true);
  assert.equal(puedeEditar(u.estudios, plantilla, datos, comun), false);
  assert.equal(puedeEditar(u.estudios, plantilla, datos, prog), false);
  assert.equal(puedeEditarCompartido(u.estudios, plantilla, datos, 'c001'), false);
});

prueba('otro departamento no ve ni edita', () => {
  assert.equal(puedeVer(u.otro, datos), false);
  assert.equal(puedeEditar(u.otro, plantilla, datos, comun), false);
});

prueba('el jefe de departamento edita lo común y los compartidos; los módulos, solo si los tiene asignados', () => {
  assert.equal(puedeEditar(u.jefe, plantilla, datos, comun), true);
  assert.equal(puedeEditar(u.jefe, plantilla, datos, prog), false);
  assert.equal(puedeEditar(u.jefe, plantilla, datos, bd), true);
  assert.equal(puedeEditarCompartido(u.jefe, plantilla, datos, 'c001'), true);
});

prueba('el docente edita sus módulos y no los de otros; ve todo su departamento', () => {
  assert.equal(puedeVer(u.luis, datos), true);
  assert.equal(puedeEditar(u.luis, plantilla, datos, bd), true);
  assert.equal(puedeEditar(u.luis, plantilla, datos, prog), false);
  assert.equal(puedeEditar(u.luis, plantilla, datos, comun), false);
  assert.equal(puedeEditar(u.luis, plantilla, datos, { seccion: 'modulos/recuperacion' }), false, 'sin indicar módulo');
});

prueba('un apartado común asignado a un docente: lo edita él y el texto compartido que sale de ese apartado', () => {
  assert.equal(puedeEditar(u.ana, plantilla, datos, { seccion: 'atencion-a-la-diversidad' }), true);
  assert.equal(puedeEditar(u.luis, plantilla, datos, { seccion: 'atencion-a-la-diversidad' }), false);
  assert.equal(puedeEditarCompartido(u.ana, plantilla, datos, 'c002'), true);
  assert.equal(puedeEditarCompartido(u.ana, plantilla, datos, 'c001'), false);
});

prueba('desvincular: solo textos sugeridos y en un módulo propio', () => {
  assert.equal(puedeDesvincular(u.ana, plantilla, datos, 'c001', prog), true);
  assert.equal(puedeDesvincular(u.ana, plantilla, datos, 'c001', bd), false);
  assert.equal(puedeDesvincular(u.ana, plantilla, datos, 'c003', prog), false);
});

prueba('admin ve y edita todo', () => {
  assert.equal(puedeEditar(u.admin, plantilla, datos, prog), true);
  assert.equal(puedeEditarCompartido(u.admin, plantilla, datos, 'c003'), true);
});

console.log(fallos ? `\n${fallos} prueba(s) fallida(s)` : '\nTodas las pruebas correctas');
process.exit(fallos ? 1 : 0);
