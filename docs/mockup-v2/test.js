// Pruebas de los módulos de lógica del mockup, al estilo de las de
// poc-pdfmake/scripts/. Se ejecutan con:
//
//     node docs/mockup-v2/test.js
//
// Los ficheros de js/ cuelgan lo suyo de `globalThis` y no tocan el DOM salvo
// ui.js, que por eso no se carga aquí. La prueba importante es la última: compara
// el motor de permisos del navegador con el de poc-pdfmake/lib/permisos.js nodo a
// nodo, que es lo que impide que vuelvan a separarse como pasó en el v1.

const assert = require('assert');
const path = require('path');

require('./js/util.js');
require('./js/unidades.js');
require('./js/plantilla.js');
require('./js/estructura.js');
require('./js/permisos.js');
require('./js/contenido.js');
require('./js/validaciones.js');
require('./js/bloques.js');

const U = globalThis.Unidades;
const Es = globalThis.Estructura;
const P = globalThis.Permisos;
const C = globalThis.Contenido;
const V = globalThis.Validaciones;
const B = globalThis.Bloques;

const DEP = { departamento: 'informatica' };
const CURSO = '2026-27';

let fallos = 0;
const prueba = (nombre, fn) => {
  try { fn(); console.log(`ok   ${nombre}`); }
  catch (e) { fallos += 1; console.log(`FALLO ${nombre}\n     ${e.message}`); }
};

// ------------------------------------------------------------------ estructura
prueba('todos los documentos construyen su árbol y las claves no se repiten', () => {
  Es.DOCUMENTOS.forEach((d) => {
    const raiz = Es.construirArbol(d.id, CURSO);
    assert.ok(raiz, `${d.id} no construye`);
    const nodos = Es.aplanar(raiz);
    assert.ok(nodos.length > 3, `${d.id} tiene ${nodos.length} nodos`);

    // Si `slug()` recortara dos títulos hermanos al mismo texto, dos apartados
    // distintos compartirían clave y la navegación llevaría siempre al primero.
    const vistas = new Set();
    nodos.forEach(({ nodo }) => {
      if (nodo.tipo === 'raiz') return;
      assert.ok(!vistas.has(nodo.clave), `clave repetida en ${d.id}: ${nodo.clave}`);
      vistas.add(nodo.clave);
    });
  });
});

prueba('los apartados de una unidad no se duplican por unidad: comparten id de sección', () => {
  const raiz = Es.construirArbol('pd-fp-daw', CURSO);
  const ponderaciones = Es.aplanar(raiz)
    .map(({ nodo }) => nodo)
    .filter((n) => n.seccion === Es.ruta('modulos', 'Ponderaciones de los Resultados de aprendizaje y los Criterios de evaluación'));

  assert.equal(ponderaciones.length, 11, 'en DAW hay 11 módulos');
  assert.equal(new Set(ponderaciones.map((n) => n.seccion)).size, 1, 'una sola sección');
  assert.equal(new Set(ponderaciones.map((n) => n.unidadId)).size, 11, 'once unidades distintas');
});

prueba('los módulos de FP y las materias de ESO/Bach salen en los documentos que les toca', () => {
  const unidadesDe = (docId) => Es.aplanar(Es.construirArbol(docId, CURSO))
    .map(({ nodo }) => nodo).filter((n) => n.tipo === 'unidad').map((n) => n.unidadId);

  assert.equal(unidadesDe('pd-fp-daw').length, 11);
  assert.equal(unidadesDe('pd-fp-smr').length, 11);
  // ESO: 4 materias + los 2 bloques propios de PIAR
  assert.equal(unidadesDe('pd-eso').length, 6);
  assert.equal(unidadesDe('pd-bach').length, 3);
  assert.equal(unidadesDe('memoria').length, 0, 'la memoria no se reparte por unidades');
  assert.equal(unidadesDe('pccf-daw').length, 0, 'el PCCF tampoco');
});

// ------------------------------------------------------------------ unidades
prueba('una unidad que cambia de nombre entre cursos conserva su id', () => {
  const sostenibilidad = U.unidad('daw-sost');
  assert.equal(U.tituloDe(sostenibilidad, '2025-26'), 'Sostenibilidad aplicada a los sectores productivos');
  assert.equal(U.tituloDe(sostenibilidad, '2026-27'), 'Sostenibilidad aplicada al sistema productivo');

  // Y el árbol de los dos cursos la sigue encontrando con la misma clave: es lo
  // que en el v1 hacía perder las asignaciones cada septiembre.
  const clave = (curso) => Es.aplanar(Es.construirArbol('pd-fp-daw', curso))
    .map(({ nodo }) => nodo).filter((n) => n.unidadId === 'daw-sost' && n.tipo === 'unidad')[0].clave;
  assert.equal(clave('2025-26'), clave('2026-27'));
});

prueba('las tres unidades que cambian de título entre 2025-26 y 2026-27 están declaradas', () => {
  const cambian = U.UNIDADES.filter((u) => u.titulos && u.titulos['2025-26']);
  assert.deepEqual(cambian.map((u) => u.id).sort(), ['daw-0612', 'daw-sost', 'smr-sost']);
});

prueba('los módulos sin código confirmado se declaran como pendientes, no se inventan', () => {
  const sinCodigo = U.UNIDADES.filter((u) => u.ambito === 'fp' && !u.codigo);
  assert.ok(sinCodigo.length > 0);
  sinCodigo.forEach((u) => assert.equal(U.etiquetaCodigo(u), 'código pendiente'));
  assert.equal(U.etiquetaCodigo('daw-0614'), '0614');
});

// ------------------------------------------------------------------ textos compartidos
prueba('cada texto compartido apunta a una sección que existe de verdad', () => {
  const secciones = new Set(Es.aplanar(Es.construirArbol('pd-fp-daw', CURSO))
    .map(({ nodo }) => nodo.seccion).filter(Boolean));
  Object.entries(C.COMPARTIDOS).forEach(([id, c]) => {
    assert.ok(secciones.has(c.seccion), `el compartido ${id} apunta a ${c.seccion}, que no existe`);
  });
});

// ------------------------------------------------------------------ contenido y arrastre
prueba('dar por bueno un apartado heredado lo deja como revisado', () => {
  C.reiniciar();
  const nodos = Es.aplanar(Es.construirArbol('pd-fp-daw', CURSO)).map(({ nodo }) => nodo);
  const heredado = nodos.filter((n) => P.esContenido(n) && C.apartado('pd-fp-daw', n).origen === 'heredado')[0];
  assert.ok(heredado, 'debería haber apartados heredados de muestra');

  C.marcarRevisado('pd-fp-daw', heredado);
  assert.equal(C.apartado('pd-fp-daw', heredado).origen, 'revisado');
  C.reiniciar();
});

prueba('guardar texto marca el apartado como modificado', () => {
  C.reiniciar();
  const nodo = Es.aplanar(Es.construirArbol('pd-fp-daw', CURSO))
    .map(({ n }) => n).filter(Boolean)[0] || Es.aplanar(Es.construirArbol('pd-fp-daw', CURSO))
    .map(({ nodo }) => nodo).filter((n) => P.esContenido(n))[0];

  C.guardarBloques('pd-fp-daw', nodo, [{ type: 'p', text: 'Texto escrito en la prueba.' }]);
  const a = C.apartado('pd-fp-daw', nodo);
  assert.equal(a.origen, 'modificado');
  assert.equal(a.bloques[0].text, 'Texto escrito en la prueba.');
  C.reiniciar();
});

// ------------------------------------------------------------------ bloques
prueba('el modelo de bloques sigue siendo válido después de cada operación', () => {
  let bs = [{ type: 'p', text: 'Primera línea\nSegunda línea' }];
  assert.ok(B.valido(bs));

  bs = B.aplicar(bs, 'a-lista', { bloque: 0 });
  assert.equal(bs[0].type, 'list');
  assert.equal(bs[0].items.length, 2);
  assert.ok(B.valido(bs));

  bs = B.aplicar(bs, 'sangrar', { bloque: 0, item: 1 });
  assert.equal(bs[0].items[1].level, 1);

  bs = B.aplicar(bs, 'a-parrafo', { bloque: 0 });
  assert.equal(bs[0].type, 'p');
  assert.ok(B.valido(bs));

  bs = B.aplicar(bs, 'anadir-parrafo', {});
  bs = B.aplicar(bs, 'bajar', { bloque: 0 });
  assert.equal(bs.length, 2);
  assert.ok(B.valido(bs));
});

prueba('negrita y cursiva se guardan como tramos, no como marcas', () => {
  const bs = B.aplicar([{ type: 'p', text: '' }], 'texto',
    { bloque: 0, valor: 'La nota **mínima** es un *5* y ***no se negocia***.' });

  assert.ok(Array.isArray(bs[0].text), 'el párrafo con formato se guarda como lista de tramos');
  assert.deepEqual(bs[0].text, [
    { text: 'La nota ' },
    { text: 'mínima', bold: true },
    { text: ' es un ' },
    { text: '5', italics: true },
    { text: ' y ' },
    { text: 'no se negocia', bold: true, italics: true },
    { text: '.' },
  ]);
  assert.ok(B.valido(bs));

  // el texto plano se mide y se lee igual que antes
  assert.equal(B.plano(bs[0].text), 'La nota mínima es un 5 y no se negocia.');
  // y el campo vuelve a mostrar las marcas
  assert.equal(B.aMarcas(bs[0].text), 'La nota **mínima** es un *5* y ***no se negocia***.');
});

prueba('un párrafo sin formato se sigue guardando como una cadena', () => {
  const bs = B.aplicar([{ type: 'p', text: 'x' }], 'texto', { bloque: 0, valor: 'Sin nada que marcar.' });
  assert.equal(typeof bs[0].text, 'string', 'el modelo más simple posible, igual que el del importador');
  assert.ok(B.valido(bs));
});

prueba('el formato sobrevive al pasar de párrafo a lista y volver', () => {
  let bs = [{ type: 'p', text: 'Primera con **negrita**\nSegunda con *cursiva*' }];
  bs = B.aplicar(bs, 'texto', { bloque: 0, valor: 'Primera con **negrita**\nSegunda con *cursiva*' });
  bs = B.aplicar(bs, 'a-lista', { bloque: 0 });

  assert.equal(bs[0].type, 'list');
  assert.equal(bs[0].items.length, 2);
  assert.deepEqual(bs[0].items[0].text, [{ text: 'Primera con ' }, { text: 'negrita', bold: true }]);
  assert.ok(B.valido(bs));

  bs = B.aplicar(bs, 'a-parrafo', { bloque: 0 });
  assert.equal(B.plano(bs[0].text), 'Primera con negrita\nSegunda con cursiva');
  assert.ok(B.valido(bs));
});

prueba('el formato se pinta como strong y em, y el texto sigue escapado', () => {
  const bs = B.aplicar([{ type: 'p', text: '' }], 'texto',
    { bloque: 0, valor: 'Ojo con **<script>** esto' });
  const html = B.pintar(bs, false);
  assert.ok(html.indexOf('<strong>&lt;script&gt;</strong>') !== -1, html);
  assert.ok(html.indexOf('<script>') === -1, 'nunca HTML del usuario');
});

prueba('el editor no puede meter HTML en el modelo', () => {
  const bs = B.aplicar([{ type: 'p', text: '' }], 'texto',
    { bloque: 0, valor: '<b>negrita</b> y <script>alert(1)</script>' });
  // el valor se guarda como texto plano: es una cadena, no un árbol de nodos
  assert.equal(typeof bs[0].text, 'string');
  assert.ok(B.valido(bs));
  // y al pintarlo sale escapado, no interpretado
  assert.ok(B.pintar(bs, false).indexOf('&lt;script&gt;') !== -1);
  assert.ok(B.pintar(bs, false).indexOf('<script>') === -1);
});

prueba('desvincular deja una copia propia con la versión del original', () => {
  const bs = B.aplicar([{ ref: 'c001' }], 'desvincular', { bloque: 0 });
  assert.equal(bs[0].type, 'p');
  assert.equal(bs[0].desvinculado_de, 'c001');
  assert.equal(bs[0].version_origen, C.COMPARTIDOS.c001.version);
  assert.ok(B.valido(bs));
});

// ------------------------------------------------------------------ validaciones
prueba('las ponderaciones descuadradas dan error y bloquean la aprobación', () => {
  const raiz = Es.construirArbol('pd-fp-daw', CURSO);
  const avisos = V.deDocumento('pd-fp-daw', raiz, CURSO);
  const errores = avisos.filter((a) => a.severidad === 'error');
  assert.ok(errores.length > 0, 'los datos de muestra traen descuadres a propósito');
  assert.equal(V.puedeAprobarse(avisos), false);
  assert.equal(V.puedeAprobarse(avisos.filter((a) => a.severidad !== 'error')), true);
});

prueba('todos los avisos llevan destino navegable', () => {
  const raiz = Es.construirArbol('pd-fp-daw', CURSO);
  const indice = new Map();
  Es.aplanar(raiz).forEach(({ nodo }) => { if (nodo.clave) indice.set(nodo.clave, nodo); });

  V.deDocumento('pd-fp-daw', raiz, CURSO).forEach((a) => {
    assert.ok(a.destino, `aviso sin destino: ${a.titulo}`);
    const clave = a.destino.unidadId ? a.destino.unidadId + '::' + a.destino.seccion : a.destino.seccion;
    assert.ok(indice.has(clave), `el destino ${clave} no existe en el árbol (${a.titulo})`);
  });
});

prueba('una unidad sin profesorado asignado es un error, no un aviso', () => {
  C.reiniciar();
  const raiz = Es.construirArbol('pd-fp-daw', CURSO);
  const unidad = Es.aplanar(raiz).map(({ nodo }) => nodo)
    .filter((n) => n.tipo === 'unidad' && n.unidadId === 'daw-0613')[0];
  assert.ok(unidad);
  assert.equal(C.docentesDe('daw-0613').length, 0, 'de muestra, este módulo está sin asignar');

  const avisos = V.deUnidad('pd-fp-daw', unidad, CURSO);
  assert.ok(avisos.some((a) => a.severidad === 'error' && /Sin docente asignado/.test(a.titulo)));
});

// ------------------------------------------------------------------ permisos
prueba('el jefe de departamento edita cualquier unidad, la tenga asignada o no', () => {
  const raiz = Es.construirArbol('pd-fp-daw', CURSO);
  const jefe = C.usuario('u-jefedpto');
  const apartados = Es.aplanar(raiz).map(({ nodo }) => nodo)
    .filter((n) => P.esContenido(n) && n.unidadId);
  assert.ok(apartados.length > 50);
  apartados.forEach((n) => {
    assert.equal(P.puedeEditar(jefe, n, DEP), true, `no puede editar ${n.unidadId} / ${n.seccion}`);
  });
});

prueba('un docente edita sus unidades y ninguna más', () => {
  const raiz = Es.construirArbol('pd-fp-daw', CURSO);
  const lucia = C.usuario('u-lucia');         // lleva daw-0614 y smr-0225
  const apartados = Es.aplanar(raiz).map(({ nodo }) => nodo).filter((n) => P.esContenido(n) && n.unidadId);

  apartados.forEach((n) => {
    assert.equal(P.puedeEditar(lucia, n, DEP), n.unidadId === 'daw-0614',
      `${n.unidadId} / ${n.seccion}`);
  });
  // y no toca los apartados comunes salvo que se le asignen
  const comunes = Es.aplanar(raiz).map(({ nodo }) => nodo)
    .filter((n) => P.esContenido(n) && !n.unidadId);
  comunes.forEach((n) => assert.equal(P.puedeEditar(lucia, n, DEP), false, n.seccion));
});

prueba('un apartado común asignado a un docente lo edita ese docente', () => {
  const raiz = Es.construirArbol('pd-fp-daw', CURSO);
  const nerea = C.usuario('u-nerea');   // apartados: ['atencion-a-la-diversidad-y-educacion-inclusiva']
  const nodos = Es.aplanar(raiz).map(({ nodo }) => nodo).filter((n) => P.esContenido(n) && !n.unidadId);

  const suyos = nodos.filter((n) => n.seccion.split('/')[0] === 'atencion-a-la-diversidad-y-educacion-inclusiva');
  assert.ok(suyos.length >= 2, 'el apartado y su subapartado');
  suyos.forEach((n) => assert.equal(P.puedeEditar(nerea, n, DEP), true, n.seccion));

  const ajenos = nodos.filter((n) => n.seccion.split('/')[0] !== 'atencion-a-la-diversidad-y-educacion-inclusiva');
  ajenos.forEach((n) => assert.equal(P.puedeEditar(nerea, n, DEP), false, n.seccion));
});

prueba('la jefatura de estudios lo ve todo y no edita nada', () => {
  const raiz = Es.construirArbol('pd-fp-daw', CURSO);
  const estudios = C.usuario('u-estudios');
  assert.equal(P.puedeVer(estudios, DEP), true);
  Es.aplanar(raiz).map(({ nodo }) => nodo).forEach((n) => {
    assert.equal(P.puedeEditar(estudios, n, DEP), false, n.clave);
  });
});

prueba('la unidad es una carpeta: no se edita, se editan sus apartados', () => {
  const raiz = Es.construirArbol('pd-fp-daw', CURSO);
  const jefe = C.usuario('u-jefedpto');
  const unidades = Es.aplanar(raiz).map(({ nodo }) => nodo).filter((n) => n.tipo === 'unidad');
  unidades.forEach((n) => {
    assert.equal(P.esContenido(n), false);
    assert.equal(P.puedeEditar(jefe, n, DEP), false);
    assert.ok(/agrupa sus apartados/.test(P.motivoBloqueo(jefe, n, DEP)));
  });
});

// ------------------------------------------------------------------ estructura editable
const Pl = globalThis.Plantilla;
const arbol = (docId) => Es.aplanar(Es.construirArbol(docId, CURSO)).map(({ nodo }) => nodo);
const porSeccion = (docId, sec) => arbol(docId).filter((n) => n.seccion === sec);

prueba('renombrar un apartado no cambia su id ni pierde su contenido', () => {
  C.reiniciar(); Pl.reiniciar();
  const antes = porSeccion('pd-fp-daw', 'introduccion')[0];
  assert.equal(antes.titulo, 'Introducción');

  // se escribe algo en el apartado antes de renombrarlo
  C.guardarBloques('pd-fp-daw', antes, [{ type: 'p', text: 'Texto que no se puede perder.' }]);

  Pl.renombrar('pd-fp-daw', 'introduccion', 'Presentación del ciclo');
  const despues = porSeccion('pd-fp-daw', 'introduccion')[0];
  assert.ok(despues, 'el apartado sigue existiendo con el mismo id');
  assert.equal(despues.titulo, 'Presentación del ciclo');
  assert.equal(despues.seccion, 'introduccion', 'el id es inmutable');
  assert.equal(C.apartado('pd-fp-daw', despues).bloques[0].text, 'Texto que no se puede perder.');

  Pl.restaurarTitulo('pd-fp-daw', 'introduccion');
  assert.equal(porSeccion('pd-fp-daw', 'introduccion')[0].titulo, 'Introducción');
  C.reiniciar(); Pl.reiniciar();
});

prueba('añadir un apartado a la plantilla de los módulos lo añade a las 11 unidades', () => {
  Pl.reiniciar();
  const id = Pl.anadir('pd-fp-daw', 'modulos', 'Materiales en valenciano', [], Es.slug);
  assert.equal(id, 'materiales-en-valenciano');

  const nuevos = porSeccion('pd-fp-daw', 'modulos/materiales-en-valenciano');
  assert.equal(nuevos.length, 11, 'uno por módulo');
  assert.equal(new Set(nuevos.map((n) => n.unidadId)).size, 11);
  nuevos.forEach((n) => assert.equal(n.edita, 'docentes_del_modulo'));
  Pl.reiniciar();
});

prueba('el id de un apartado añadido se genera una vez y no cambia al renombrarlo', () => {
  Pl.reiniciar();
  const id = Pl.anadir('pd-fp-daw', '', 'Anexo de coordinación', [], Es.slug);
  Pl.renombrar('pd-fp-daw', id, 'Anexo de seguimiento');
  const n = porSeccion('pd-fp-daw', id)[0];
  assert.ok(n);
  assert.equal(n.titulo, 'Anexo de seguimiento');
  assert.equal(n.seccion, 'anexo-de-coordinacion', 'el id nace del título original y ahí se queda');
  Pl.reiniciar();
});

prueba('no se repiten ids al añadir dos apartados con el mismo título', () => {
  Pl.reiniciar();
  const a = Pl.anadir('pd-fp-daw', '', 'Anexo', [], Es.slug);
  const b = Pl.anadir('pd-fp-daw', '', 'Anexo', [], Es.slug);
  assert.notEqual(a, b);
  assert.equal(b, 'anexo-2');
  // y tampoco con uno que ya traía la plantilla
  const c = Pl.anadir('pd-fp-daw', '', 'Introducción', ['introduccion'], Es.slug);
  assert.equal(c, 'introduccion-2');
  Pl.reiniciar();
});

prueba('mover un apartado cambia el orden del árbol', () => {
  Pl.reiniciar();
  const antes = Es.construirArbol('pd-fp-daw', CURSO).hijos.map((n) => n.seccion);
  assert.equal(antes[0], 'introduccion');

  Pl.mover('pd-fp-daw', '', 'competencias-del-ciclo', -1, antes.map(Es.idLocal));
  const despues = Es.construirArbol('pd-fp-daw', CURSO).hijos.map((n) => n.seccion);
  assert.equal(despues[0], 'competencias-del-ciclo');
  assert.equal(despues[1], 'introduccion');
  assert.equal(despues.length, antes.length, 'no se pierde ni se duplica ninguno');
  Pl.reiniciar();
});

prueba('retirar oculta el apartado y su subárbol, y restaurar lo devuelve con su contenido', () => {
  C.reiniciar(); Pl.reiniciar();
  const nodo = porSeccion('pd-fp-daw', 'elementos-transversales')[0];
  const hijos = nodo.hijos.length;
  assert.ok(hijos > 0);
  C.guardarBloques('pd-fp-daw', nodo, [{ type: 'p', text: 'Contenido retirado pero no borrado.' }]);

  Pl.retirar('pd-fp-daw', 'elementos-transversales');
  assert.equal(porSeccion('pd-fp-daw', 'elementos-transversales').length, 0);
  assert.equal(porSeccion('pd-fp-daw', 'elementos-transversales/uso-eficaz-de-las-tic').length, 0,
    'se va con todo su subárbol');
  assert.deepEqual(Pl.retiradosDe('pd-fp-daw'), ['elementos-transversales']);

  Pl.restaurar('pd-fp-daw', 'elementos-transversales');
  const vuelto = porSeccion('pd-fp-daw', 'elementos-transversales')[0];
  assert.ok(vuelto);
  assert.equal(vuelto.hijos.length, hijos);
  assert.equal(C.apartado('pd-fp-daw', vuelto).bloques[0].text, 'Contenido retirado pero no borrado.');
  C.reiniciar(); Pl.reiniciar();
});

prueba('un apartado retirado deja de generar avisos', () => {
  C.reiniciar(); Pl.reiniciar();
  const avisos = () => V.deDocumento('pd-fp-daw', Es.construirArbol('pd-fp-daw', CURSO), CURSO).length;
  const conTodo = avisos();

  // un apartado de la plantilla de los módulos: al retirarlo desaparece de los 11
  Pl.retirar('pd-fp-daw', 'modulos/relacion-con-otros-modulos');
  assert.ok(avisos() < conTodo, `${avisos()} debería ser menos que ${conTodo}`);

  Pl.restaurar('pd-fp-daw', 'modulos/relacion-con-otros-modulos');
  assert.equal(avisos(), conTodo);
  Pl.reiniciar();
});

prueba('el bloque de módulos se puede retirar entero, con sus unidades', () => {
  Pl.reiniciar();
  const unidades = () => arbol('pd-fp-daw').filter((n) => n.tipo === 'unidad').length;
  assert.equal(unidades(), 11);
  Pl.retirar('pd-fp-daw', 'modulos-del-primer-curso');
  assert.equal(unidades(), 6, 'se van los 5 módulos del primer curso');
  Pl.reiniciar();
});

// ------------------------------------------------------------------ negrita y cursiva
prueba('el botón N pone la marca alrededor de lo seleccionado y la vuelve a quitar', () => {
  const puesto = B.marcar('hola mundo', 0, 4, 'bold');
  assert.equal(puesto.valor, '**hola** mundo');
  assert.deepEqual([puesto.desde, puesto.hasta], [2, 6], 'la selección se queda sobre la palabra');
  // volver a pulsar con esa misma selección lo deja como estaba
  const quitado = B.marcar(puesto.valor, puesto.desde, puesto.hasta, 'bold');
  assert.equal(quitado.valor, 'hola mundo');
  assert.deepEqual([quitado.desde, quitado.hasta], [0, 4]);
});

prueba('sin selección, la marca va a la palabra donde está el cursor', () => {
  assert.equal(B.marcar('hola mundo', 7, 7, 'italics').valor, 'hola *mundo*');
  // en un hueco sin palabra se abren las marcas y el cursor se queda dentro
  const hueco = B.marcar('', 0, 0, 'bold');
  assert.equal(hueco.valor, '****');
  assert.deepEqual([hueco.desde, hueco.hasta], [2, 2]);
});

prueba('negrita y cursiva se combinan y se quitan por separado', () => {
  const ambas = B.marcar('*hola* mundo', 1, 5, 'bold');
  assert.equal(ambas.valor, '***hola*** mundo');
  const soloNegrita = B.marcar(ambas.valor, ambas.desde, ambas.hasta, 'italics');
  assert.equal(soloNegrita.valor, '**hola** mundo');
  // seleccionando las marcas incluidas, el botón las entiende igual
  assert.equal(B.marcar('**hola** mundo', 0, 8, 'bold').valor, 'hola mundo');
});

prueba('lo que marca el botón es lo que el modelo guarda como tramos', () => {
  const r = B.marcar('la evaluación es continua', 3, 13, 'bold');
  assert.deepEqual(B.aTramos(r.valor), [
    { text: 'la ' },
    { text: 'evaluación', bold: true },
    { text: ' es continua' },
  ]);
  // y los espacios de los bordes se quedan fuera de la marca
  assert.equal(B.marcar('uno dos tres', 3, 8, 'bold').valor, 'uno **dos** tres');
});

// ------------------------------------------------------------------ cableado con el HTML
// js/ui.js es el único módulo que toca el DOM, así que no se puede cargar aquí
// sin un navegador. Lo que sí se puede comprobar sin uno es que no haya ids
// descolgados: un `$('#btn-pfd')` mal escrito no da error de sintaxis, falla en
// silencio al abrir la página.
prueba('todos los #id que usa ui.js existen en app.html o los genera ui.js', () => {
  const fs = require('fs');
  const ui = fs.readFileSync(path.join(__dirname, 'js', 'ui.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, 'app.html'), 'utf8');

  const recoger = (texto, re) => {
    const out = new Set();
    let m;
    while ((m = re.exec(texto))) out.add(m[1]);
    return out;
  };

  const enHtml = recoger(html, /id="([^"]+)"/g);
  const generados = recoger(ui, /id="([a-zA-Z0-9-]+)"/g);   // los que pinta ui.js
  const usados = recoger(ui, /'#([a-zA-Z0-9-]+)/g);         // los que consulta

  const huerfanos = [...usados].filter((id) => !enHtml.has(id) && !generados.has(id));
  assert.deepEqual(huerfanos, [], 'ids que ui.js busca y nadie crea: ' + huerfanos.join(', '));
});

// ------------------------------------------------------------------ la prueba que importa
prueba('el motor del navegador y poc-pdfmake/lib/permisos.js coinciden en todos los nodos', () => {
  const motor = require(path.join(__dirname, '..', '..', 'poc-pdfmake', 'lib', 'permisos.js'));

  // Con apartados añadidos a mano por el departamento, que es donde más fácil
  // sería que los permisos de uno y otro dejaran de coincidir.
  C.reiniciar(); Pl.reiniciar();
  Pl.anadir('pd-fp-daw', '', 'Anexo del departamento', [], Es.slug);
  Pl.anadir('pd-fp-daw', 'modulos', 'Materiales en valenciano', [], Es.slug);
  Pl.anadir('pd-fp-daw', 'modulos/desarrollo-curricular', 'Secuenciación', [], Es.slug);
  Pl.anadir('pd-eso', 'materias', 'Coevaluación', [], Es.slug);

  Es.DOCUMENTOS.forEach((d) => {
    const raiz = Es.construirArbol(d.id, CURSO);
    const plantilla = Es.plantillaDe(raiz);

    // Los datos tal como los espera el motor: cada unidad es una "instancia" y
    // `asignaciones` reparte apartados comunes a docentes concretos.
    const asignaciones = {};
    C.USUARIOS.forEach((u) => (u.apartados || []).forEach((sec) => {
      asignaciones[sec] = (asignaciones[sec] || []).concat([u.id]);
    }));
    const datos = {
      departamento: 'informatica',
      documento: {},
      asignaciones,
      compartidos: {},
      instancias: U.UNIDADES.map((u) => ({
        titulo: u.id,
        docentes: C.docentesDe(u.id).map((x) => x.id),
      })),
    };

    const nodos = Es.aplanar(raiz).map(({ nodo }) => nodo).filter(P.esContenido);
    let comparados = 0;

    C.USUARIOS.forEach((usuario) => {
      nodos.forEach((n) => {
        const navegador = P.puedeEditar(usuario, n, DEP);
        const servidor = motor.puedeEditar(usuario, plantilla, datos, {
          seccion: n.seccion,
          instancia: n.unidadId === null ? undefined : n.unidadId,
        });
        assert.equal(navegador, servidor,
          `${d.id} · ${usuario.id} · ${n.unidadId || '—'} / ${n.seccion}: `
          + `navegador=${navegador} servidor=${servidor}`);
        comparados += 1;
      });
    });
    assert.ok(comparados > 0, `${d.id} no comparó ningún nodo`);
  });

  // y que los añadidos estaban de verdad en el árbol que se comparó
  const anadidos = arbol('pd-fp-daw').filter((n) => n.anadido);
  assert.ok(anadidos.length >= 13, `solo había ${anadidos.length} apartados añadidos`);
  Pl.reiniciar();
});

// ------------------------------------------------------------------ el botón, de punta a punta
// Va al final porque cargar ui.js arranca la interfaz. Con un DOM de pega de
// veinte líneas se comprueba lo que estaba roto de verdad: que al pulsar N el
// modelo se queda con el tramo en negrita. Una prueba de `marcar()` sola no lo
// habría visto, porque el fallo estaba en el cable entre el botón y el campo.
prueba('pulsar N en la barra deja el párrafo en negrita en el modelo', () => {
  const campos = [];
  class El {
    constructor() {
      this.dataset = {};
      this.style = {};
      this.hidden = false;
      this.value = '';
      this.scrollHeight = 40;
      this._ev = {};
      this._html = '';
      this._text = '';
      this.classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
    }
    set innerHTML(v) { this._html = String(v); }
    get innerHTML() { return this._html; }
    set textContent(v) { this._text = String(v); }
    get textContent() { return this._text; }
    addEventListener(tipo, fn) { this._ev[tipo] = fn; }
    setAttribute() {}
    removeAttribute() {}
    focus() {}
    closest(sel) { return (this._cerca || {})[sel] || null; }
    querySelector() { return null; }
    querySelectorAll() { return []; }
  }

  const porSelector = new Map();
  globalThis.document = {
    documentElement: new El(),
    readyState: 'complete',
    querySelector(sel) {
      if (!porSelector.has(sel)) porSelector.set(sel, new El());
      return porSelector.get(sel);
    },
    querySelectorAll: (sel) => (sel === '#contenido textarea[data-bloque]' ? campos : []),
    addEventListener() {},
  };
  globalThis.location = { hash: '' };
  globalThis.history = { pushState() {}, replaceState() {} };
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  globalThis.addEventListener = () => {};

  require('./js/ui.js');                       // readyState 'complete': arranca solo
  const UI = globalThis.UI;

  // un apartado de módulo con un párrafo conocido, y la jefatura, que lo edita
  const raiz = Es.construirArbol('pd-fp-daw', CURSO);
  const nodo = Es.aplanar(raiz).map((x) => x.nodo)
    .filter((x) => x.unidadId && !x.hijos.length && !C.SECCIONES_COMPARTIDAS.get(x.seccion))[0];
  UI.E.usuarioId = 'u-jefedpto';
  UI.E.docId = 'pd-fp-daw';
  UI.E.curso = CURSO;
  UI.E.vista = 'contenido';
  C.guardarBloques('pd-fp-daw', nodo, [{ type: 'p', text: 'texto heredado' }]);
  UI.ir(nodo.clave);

  // el <textarea> del párrafo 0, con "texto" seleccionado
  const campo = new El();
  campo.dataset = { bloque: '0' };
  campo.value = 'texto heredado';
  campo.selectionStart = 0;
  campo.selectionEnd = 5;
  campo.setSelectionRange = (a, b) => { campo.selectionStart = a; campo.selectionEnd = b; };
  campo.setRangeText = (txt, a, b) => { campo.value = campo.value.slice(0, a) + txt + campo.value.slice(b); };
  campos.push(campo);

  const boton = new El();
  boton.dataset = { op: 'marca', marca: 'bold' };
  const clicEnN = { target: { closest: (sel) => (sel === '[data-op]' ? boton : null) } };
  const contenido = globalThis.document.querySelector('#contenido');

  contenido._ev.click(clicEnN);
  assert.equal(campo.value, '**texto** heredado', 'el campo no recibió las marcas');
  assert.deepEqual(C.apartado('pd-fp-daw', nodo).bloques[0].text,
    [{ text: 'texto', bold: true }, { text: ' heredado' }], 'el modelo no se quedó la negrita');
  assert.deepEqual([campo.selectionStart, campo.selectionEnd], [2, 7],
    'la selección no se devolvió: no se puede pulsar N y C seguidos');

  // el atajo de teclado hace lo mismo, y Ctrl+N no se usa: es del navegador
  campo._cerca = { 'textarea[data-bloque]': campo };
  let frenado = false;
  contenido._ev.keydown({ target: campo, key: 'b', ctrlKey: true, preventDefault: () => { frenado = true; } });
  assert.equal(frenado, true, 'Ctrl+B tiene que quedarse en el editor');
  assert.equal(campo.value, 'texto heredado', 'Ctrl+B no quitó la negrita de lo seleccionado');
  assert.equal(C.apartado('pd-fp-daw', nodo).bloques[0].text, 'texto heredado');
});

// Sigue usando el DOM de pega de la prueba anterior, que es donde se montó.
prueba('asignar una unidad con el filtro puesto no borra las que el filtro esconde', () => {
  assert.ok(globalThis.UI, 'ui.js no se cargó en la prueba anterior');
  const cuerpo = globalThis.document.querySelector('#cuerpo-asignaciones');
  const antes = C.usuario('u-pau').unidades.slice();
  assert.ok(antes.length > 1, 'la persona de la prueba tiene que llevar varias unidades');

  // La tabla está filtrada: solo se ve una fila. Quitar esa casilla tiene que
  // quitar esa unidad y nada más; leer las casillas visibles borraría el resto.
  const caja = { dataset: { persona: 'u-pau' }, value: antes[0], checked: false, closest: () => caja, focus() {} };
  cuerpo._ev.change({ target: caja });
  assert.deepEqual(C.usuario('u-pau').unidades, antes.slice(1));

  caja.checked = true;
  cuerpo._ev.change({ target: caja });
  assert.deepEqual(C.usuario('u-pau').unidades.slice().sort(), antes.slice().sort());
});

console.log(fallos ? `\n${fallos} prueba(s) fallida(s)` : '\nTodas las pruebas correctas');
process.exit(fallos ? 1 : 0);
