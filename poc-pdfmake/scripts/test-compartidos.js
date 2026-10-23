// Pruebas de los textos compartidos con datos inventados. Con un Word como argumento comprueba además que, en un documento
// real, sustituir las copias por referencias y resolverlas devuelve exactamente el mismo contenido.
//   node scripts/test-compartidos.js [entrada/PD.docx]
const assert = require('assert/strict');
const { extraerCompartidos, resolverCompartidos, editarCompartido, desvincular, avisosDesvinculados } = require('../lib/compartidos');

const p = (text) => ({ type: 'p', text });
const RECUP = 'El alumnado que no supere un resultado de aprendizaje realizará una prueba de recuperación en la convocatoria ordinaria.';
const COMUN = 'Se aplicarán las medidas de atención a la diversidad recogidas en el plan del centro, adaptadas a cada grupo y módulo.';
const modulo = (titulo, extra) => ({ titulo, docentes: [], valores: { 'modulos/recuperacion': { texto: [p(RECUP), p(extra)] }, 'modulos/diversidad': { texto: [p(COMUN)] } } });
const ejemplo = () => ({
  departamento: 'informatica',
  documento: { 'atencion-a-la-diversidad': { texto: [p(COMUN)] } },
  instancias: [modulo('Programación', 'Texto propio de Programación.'), modulo('Bases de datos', 'Texto propio de Bases de datos.'), modulo('Entornos de desarrollo', 'Texto propio de Entornos.')],
  asignaciones: {},
});

let fallos = 0;
const prueba = (nombre, fn) => { try { fn(); console.log(`ok   ${nombre}`); } catch (e) { fallos += 1; console.log(`FALLO ${nombre}\n     ${e.message}`); } };

prueba('detecta el párrafo repetido en 3 módulos y la copia de la parte común', () => {
  const datos = ejemplo();
  const resumen = extraerCompartidos(datos, { umbral: 3 });
  assert.equal(resumen.length, 2);
  const recup = resumen.find((c) => !c.comun); const comun = resumen.find((c) => c.comun);
  assert.equal(recup.modulos, 3);
  assert.equal(comun.comun, 'atencion-a-la-diversidad');
  assert.deepEqual(datos.instancias[0].valores['modulos/recuperacion'].texto[0], { ref: recup.id });
  assert.deepEqual(datos.documento['atencion-a-la-diversidad'].texto[0], { ref: comun.id });
  assert.equal(datos.instancias[0].valores['modulos/recuperacion'].texto[1].text, 'Texto propio de Programación.');
});

prueba('no comparte por debajo del umbral ni textos cortos', () => {
  const datos = ejemplo(); datos.instancias.pop();
  datos.documento = {};
  assert.equal(extraerCompartidos(datos, { umbral: 3 }).length, 0);
  const cortos = ejemplo(); cortos.instancias.forEach((i) => i.valores['modulos/recuperacion'].texto.push(p('Ver tabla.')));
  assert.ok(extraerCompartidos(cortos, { umbral: 3 }).every((c) => !c.inicio.startsWith('Ver tabla')));
});

prueba('resolver devuelve el contenido original sin modificar los datos guardados', () => {
  const original = ejemplo(); const datos = ejemplo();
  extraerCompartidos(datos);
  const resuelto = resolverCompartidos(datos);
  assert.deepEqual(resuelto.documento, original.documento);
  assert.deepEqual(resuelto.instancias, original.instancias);
  assert.ok(datos.instancias[0].valores['modulos/recuperacion'].texto[0].ref, 'los datos guardados conservan la referencia');
});

prueba('editar el compartido cambia todos los módulos vinculados', () => {
  const datos = ejemplo();
  const [recup] = extraerCompartidos(datos).filter((c) => !c.comun);
  editarCompartido(datos, recup.id, p('Nuevo criterio de recuperación del departamento.'));
  const r = resolverCompartidos(datos);
  for (const ins of r.instancias) assert.equal(ins.valores['modulos/recuperacion'].texto[0].text, 'Nuevo criterio de recuperación del departamento.');
  assert.equal(datos.compartidos[recup.id].version, 2);
});

prueba('desvincular deja una copia propia y avisa si el original cambia después', () => {
  const datos = ejemplo();
  const [recup] = extraerCompartidos(datos).filter((c) => !c.comun);
  assert.equal(desvincular(datos, 'Programación', recup.id), 1);
  const copia = datos.instancias[0].valores['modulos/recuperacion'].texto[0];
  assert.equal(copia.text, RECUP); assert.equal(copia.desvinculado_de, recup.id);
  assert.equal(avisosDesvinculados(datos).length, 0);
  editarCompartido(datos, recup.id, p('Criterio actualizado.'));
  const avisos = avisosDesvinculados(datos);
  assert.equal(avisos.length, 1); assert.equal(avisos[0].instancia, 'Programación');
  const r = resolverCompartidos(datos);
  assert.equal(r.instancias[0].valores['modulos/recuperacion'].texto[0].text, RECUP, 'la copia propia no cambia');
  assert.equal(r.instancias[1].valores['modulos/recuperacion'].texto[0].text, 'Criterio actualizado.');
});

prueba('un texto obligatorio no se puede desvincular', () => {
  const datos = ejemplo();
  const [recup] = extraerCompartidos(datos).filter((c) => !c.comun);
  datos.compartidos[recup.id].modo = 'obligatorio';
  assert.throws(() => desvincular(datos, 0, recup.id), /obligatorio/);
});

(async () => {
  const fichero = process.argv[2];
  if (fichero) {
    const { importarDocx } = require('../lib/importar-docx');
    const sin = await importarDocx({ path: fichero }, { compartidos: false });
    const con = await importarDocx({ path: fichero });
    prueba(`documento real: ${con.informe.compartidos.length} textos compartidos y el contenido resuelto es idéntico`, () => {
      const r = resolverCompartidos(con.datos);
      assert.ok(con.informe.compartidos.length > 0);
      assert.deepEqual(r.documento, sin.datos.documento);
      assert.deepEqual(r.instancias, sin.datos.instancias);
    });
  }
  console.log(fallos ? `\n${fallos} prueba(s) fallida(s)` : '\nTodas las pruebas correctas');
  process.exit(fallos ? 1 : 0);
})();
