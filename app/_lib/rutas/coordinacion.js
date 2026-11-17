// GET /api/documentos/[id]/coordinacion — la matriz unidad × bloque: quién lleva cada unidad y cómo
// va cada parte.
//
// Es la pantalla que mira la jefatura de departamento para saber qué falta (punto 4 y punto 16 de
// docs/mockup-v2/CAMBIOS.md, y `vistaCoordinacion` de docs/mockup-v2/js/ui.js). El panel de
// validaciones contesta «qué está mal»; este contesta «por dónde va cada módulo», que es la pregunta
// de septiembre y la que hoy se contesta abriendo el Word y mirando.
//
// NO HAY UN ESTADO NUEVO: SON LAS TRES COSAS QUE LA APLICACIÓN YA SABE DE CADA APARTADO
//
//   relleno   si hay algo escrito            (lo calcula core/arbol.js, igual que para la barra lateral)
//   origen    de dónde viene                (heredado · revisado · modificado · nuevo, core/documento.js)
//   errores   si tiene avisos de validación  (los calcula app/_lib/rutas/validaciones.js)
//
// Y se agregan a la celda con la misma regla que el árbol usa para una rama (`agregar` de
// app/_componentes/arbol-cliente.js, que es la del prototipo): manda el error; si no hay nada
// escrito, vacío; si falta algo, incompleto; si está todo revisado, validado; y si no, completo.
// Aquí está expresada sobre RECUENTOS en lugar de sobre una lista de estados porque una celda no es
// un nodo, es un subárbol —«Desarrollo curricular» son cinco apartados en los once módulos—, pero es
// la misma regla y el mismo vocabulario de cinco palabras. Si no fuera el mismo, la coordinación
// diría de un módulo lo contrario que su rama del árbol, y entonces una de las dos pantallas sobra.
//
// LOS AVISOS NO SE VUELVEN A CALCULAR: SE PIDEN AL FICHERO QUE LOS CALCULA
//
// `app/_lib/rutas/validaciones.js` ya resuelve qué avisos tiene el documento, con qué convenio y con
// qué destino cada uno, y es un fichero largo precisamente porque esa búsqueda es delicada (los
// repetidores, los dos apartados de ponderaciones por módulo, el convenio de los criterios). Volver a
// escribirla aquí sería la cuarta implementación de lo mismo y, lo que es peor, la que acabaría
// discrepando: la coordinación pintaría una celda en verde mientras el panel de al lado enseña dos
// errores de ese mismo apartado. Dos verdades sobre el mismo documento es exactamente lo que esta
// pantalla viene a quitar.
//
// Así que se llama a su `informeDe({ documento, repo })`, que es el cálculo entero un paso antes de
// responder y la costura que ese fichero deja preparada justo para esto. El precio es que lee las
// unidades y los apartados otra vez y vuelve a montar el árbol: con 245 apartados es una lectura más
// de una pantalla de resumen que se abre de vez en cuando, y es un precio que se paga a gusto por no
// tener dos recuentos de errores en la misma pantalla.
//
// Y NO LLEVA EL CONTENIDO (docs/api.md, segunda regla de forma)
//
// Una PD real son 245 apartados y 11 módulos: 11 filas × 8 bloques = 88 celdas de media docena de
// números. De los apartados no sale ni un `valores`, ni un título de apartado por unidad: los
// bloques (las columnas) viajan UNA vez, no once. La coordinación es un resumen; el contenido se pide
// apartado por apartado.
//
// QUIÉN LA VE
//
// Quien ve el documento, igual que el panel de validaciones: 401 sin identificar, 404 si es de otro
// departamento. No hay un permiso aparte porque no se enseña nada que no esté ya servido —el reparto
// sale en `GET .../unidades` y el estado de cada apartado en `GET .../arbol`—; lo que hace esta ruta
// es cruzarlo. Y porque el docente también necesita ver por dónde va el documento del que su módulo
// es una parte.
//
// DOS MODOS, PORQUE NO TODOS LOS DOCUMENTOS SE REPARTEN POR UNIDADES
//
//   modo: 'unidades'  la matriz: una fila por módulo o materia, una columna por bloque
//   modo: 'comun'     un documento sin unidades (el PCCF, la memoria): una fila por apartado de
//                     primer nivel, sin columnas, y la responsable es la jefatura del departamento
//
// Es lo mismo que hace el prototipo (`coordinacionComun`), y hace falta ya: un documento importado
// sin instancias existe hoy.
//
// Es CommonJS y no sabe que está dentro de Next (docs/api.md, primera regla de forma).

'use strict';

const Arbol = require('../../../core/arbol');
const { personasQueDanClase } = require('./unidades');
const Val = require('../../../core/validaciones');
const { conErrores, abrirDocumento, tituloDelTomo, esRevisado } = require('./comun');
const { informeDe } = require('./validaciones');

// Los cinco estados del prototipo, en el orden en el que se leen de peor a mejor. No se añade
// ninguno: son los mismos que pinta el árbol (app/_componentes/etiquetas.js), con «con errores», que
// aquí SÍ se sabe porque esta ruta cruza los avisos y `/arbol` no los manda.
const ESTADOS = ['errores', 'vacio', 'incompleto', 'completo', 'validado'];

// La misma clave plana que usa core/arbol.js para la matriz (sección × unidad): el \u0000 impide que
// dos claves distintas se confundan, porque ningún id lleva un carácter nulo.
const clave = (unidadId, seccion) => `${unidadId || ''}\u0000${seccion}`;

// El estado de un subárbol a partir de sus recuentos. Es `agregar` de arbol-cliente.js —la regla del
// prototipo— contada en lugar de listada:
//
//   · el error manda sobre todo lo demás: un apartado que no cuadra hay que mirarlo aunque esté
//     escrito y revisado, y es lo que impide aprobar el documento;
//   · sin nada escrito es «vacío» y no «incompleto»: no se ha empezado, que no es lo mismo que
//     haberse dejado algo a medias;
//   · «validado» solo si está revisado TODO lo que hay dentro, que es lo que convierte esta matriz
//     en el mapa de lo que queda por revisar (punto 7 de docs/mockup-v2/CAMBIOS.md).
//
// Devuelve null cuando la celda no tiene ningún apartado con contenido: ahí no hay nada que decir y
// la pantalla pinta un guion, no un verde.
function estadoDe({ apartados, conContenido, revisados, errores }) {
  if (!apartados) return null;
  if (errores) return 'errores';
  if (!conContenido) return 'vacio';
  if (conContenido < apartados) return 'incompleto';
  return revisados === apartados ? 'validado' : 'completo';
}

// Los recuentos de una lista de nodos del árbol, con el `origen` ya anotado. Es lo único que se mira
// de cada apartado: tres números, nunca sus valores.
function contar(nodos, erroresDe) {
  const r = { apartados: 0, conContenido: 0, revisados: 0, errores: 0, avisos: 0 };
  for (const nodo of nodos) {
    if (!nodo.contenido) continue;
    r.apartados += 1;
    if (nodo.relleno) r.conContenido += 1;
    if (esRevisado(nodo.origen)) r.revisados += 1;
    const c = erroresDe(nodo) || {};
    r.errores += c.error || 0;
    r.avisos += (c.aviso || 0) + (c.info || 0);
  }
  return r;
}

// Los nodos de un subárbol, en orden de lectura. `Arbol.aplanar` ya lo hace desde cualquier nodo.
const subarbol = (nodo) => Arbol.aplanar(nodo);

// Las personas que llevan una unidad, recortadas igual que en `/unidades` y en `/validaciones`: el
// nombre y el rol, nunca el correo. Esta pantalla contesta «a quién aviso», no «cómo le escribo».
const aPersona = (p) => ({ _id: p._id, nombre: p.nombre, rol: p.rol });

// ---------------------------------------------------------------- los avisos, por celda

// Los recuentos de avisos por celda (unidad × sección) y por unidad, a partir del informe que calcula
// `validaciones.js`. Cada aviso trae el `destino` —el apartado al que hay que ir a arreglarlo— y es
// ese destino el que decide en qué celda cae.
//
// Un aviso sin `destino.seccion` —hoy no hay ninguno— se cuenta en el total y en su unidad, pero no
// en ninguna celda: sumar un error en una celda que no es la suya sería mentir sobre dónde está el
// problema, que es justo lo que esta pantalla viene a arreglar.
function avisosPorCelda(informe) {
  const porCelda = new Map();
  const porUnidad = new Map();
  for (const grupo of informe.grupos || []) {
    // El recuento del grupo es el que ya trae el informe —el mismo que enseña el panel al lado del
    // nombre del módulo—, no uno contado aquí. `Val.cuenta` solo entra si un informe viejo no lo
    // trajera, y es la misma función con la que se cuenta allí.
    porUnidad.set(grupo.unidadId || null, grupo.cuenta || Val.cuenta(grupo.avisos || []));
    for (const aviso of grupo.avisos || []) {
      const destino = aviso.destino || {};
      if (!destino.seccion) continue;
      const k = clave(destino.unidadId || null, destino.seccion);
      const c = porCelda.get(k) || { error: 0, aviso: 0, info: 0 };
      c[aviso.severidad] = (c[aviso.severidad] || 0) + 1;
      porCelda.set(k, c);
    }
  }

  return {
    porCelda,
    porUnidad,
    cuenta: informe.cuenta || { error: 0, aviso: 0, info: 0 },
    total: informe.total || 0,
    puedeAprobarse: !!informe.puedeAprobarse,
    convenioCe: informe.convenioCe || null,
  };
}

// ---------------------------------------------------------------- GET

const GET = conErrores(async (peticion, parametros) => {
  const { fallo, documento, repo } = await abrirDocumento(peticion, parametros);
  if (fallo) return fallo;

  // Sin reordenar: el orden de `unidades.listar()` es el del documento y el del tomo del PDF
  // (core/arbol.js). La matriz se lee en el mismo orden en el que se imprime.
  const unidades = await repo.unidades.listar(documento._id);
  // Trae los `valores`, que es lo que hace falta para saber si un apartado está relleno; no salen de
  // aquí: core/arbol.js los reduce a un booleano por nodo.
  const apartados = await repo.apartados.listar(documento._id);

  const arbol = Arbol.construirArbol({
    plantilla: documento.plantilla,
    unidades,
    apartados,
    clave: documento._id,
    titulo: tituloDelTomo(documento, null),
  });

  // Los avisos, del mismo cálculo que el panel de comprobaciones y ni uno más (ver la cabecera).
  const avisos = avisosPorCelda(await informeDe({ documento, repo }));

  // El `origen` de cada apartado, anotado en su nodo como hace `/arbol`: sale de las filas que ya
  // están leídas y solo tiene sentido en los nodos con contenido propio.
  const filaDe = new Map(apartados.map((a) => [clave(a.unidadId, a.seccion), a]));
  const nodos = Arbol.aplanar(arbol);
  for (const nodo of nodos) {
    const fila = nodo.contenido ? filaDe.get(clave(nodo.unidadId, nodo.seccion)) : null;
    nodo.origen = (fila && fila.origen) || null;
  }

  const erroresDe = (nodo) => avisos.porCelda.get(clave(nodo.unidadId, nodo.seccion));

  // Las personas del departamento, para poner nombre a los ids del reparto. Igual que en
  // `/validaciones`: los grupos solo guardan ids.
  const personas = new Map();
  for (const p of await personasQueDanClase(repo, documento)) {
    personas.set(p._id, aPersona(p));
  }
  const jefatura = [...personas.values()].filter((p) => p.rol === 'jefe_departamento');

  const nodosUnidad = nodos.filter((n) => n.tipo === 'unidad');
  // El bloque que reparte las instancias es el que sabe cómo se llama una unidad en este documento
  // («módulo», «materia»): `etiqueta_instancia` lo trae la plantilla del importador y core/arbol.js
  // lo deja en el nodo de paso, no en cada unidad.
  const bloqueDeUnidades = nodos.find((n) => n.tipo === 'bloque'
    && (n.hijos || []).some((h) => h.tipo === 'unidad'));

  // ------------------------------------------------------------ modo «comun»: sin unidades
  //
  // El PCCF y la memoria no se reparten por módulos: los lleva la jefatura del departamento salvo los
  // apartados que delegue, que es la regla de core/permisos.js. Así que no hay matriz: hay una fila
  // por apartado de primer nivel con cómo va su rama.
  if (!nodosUnidad.length) {
    const filas = arbol.hijos.map((h) => {
      const recuentos = contar(subarbol(h), erroresDe);
      return {
        tipo: 'apartado',
        seccion: h.seccion,
        titulo: h.titulo,
        num: h.num,
        destino: { seccion: h.seccion, unidadId: null },
        estado: estadoDe(recuentos),
        ...recuentos,
        // Quién responde del apartado: la jefatura del departamento, salvo lo que haya delegado, y a
        // quién se le ha delegado qué se ve en el reparto de apartados comunes.
        responsables: jefatura,
      };
    });
    return Response.json(respuestaDe({ documento, arbol, avisos, modo: 'comun', etiqueta: null, bloques: [], filas }),
      { headers: { 'Cache-Control': 'no-store' } });
  }

  // ------------------------------------------------------------ modo «unidades»: la matriz
  //
  // Las columnas son los apartados de primer nivel de la plantilla de las unidades, y salen UNA vez
  // para las once: es el par (seccion, unidad) del motor, y la sección es la misma en todas. El
  // prototipo las tenía escritas a mano porque allí no había importador; aquí salen del documento,
  // que es la única forma de que un apartado añadido en el E6 aparezca en la coordinación sin tocar
  // este fichero.
  const bloques = (nodosUnidad[0].hijos || []).map((h, i) => ({
    seccion: h.seccion,
    titulo: h.titulo,
    indice: i + 1,
  }));

  const filas = nodosUnidad.map((nodo) => {
    const unidad = unidades.find((u) => u.unidadId === nodo.unidadId) || {};
    const docentes = (unidad.docentes || []).map((id) => personas.get(id)).filter(Boolean);
    const celdas = (nodo.hijos || []).map((hijo) => {
      const recuentos = contar(subarbol(hijo), erroresDe);
      return {
        seccion: hijo.seccion,
        destino: { seccion: hijo.seccion, unidadId: nodo.unidadId },
        existe: recuentos.apartados > 0,
        estado: estadoDe(recuentos),
        ...recuentos,
      };
    });
    return {
      tipo: 'unidad',
      unidadId: nodo.unidadId,
      titulo: nodo.titulo,
      num: nodo.num,
      grupo: nodo.grupo,
      seccion: nodo.seccion,
      destino: { seccion: nodo.seccion, unidadId: nodo.unidadId },
      // Una unidad sin docentes no la puede editar nadie salvo la jefatura, así que es lo primero
      // que hay que ver en esta pantalla igual que en el reparto (app/_lib/rutas/unidades.js).
      docentes,
      sinDocentes: docentes.length === 0,
      cuenta: avisos.porUnidad.get(nodo.unidadId) || { error: 0, aviso: 0, info: 0 },
      estado: estadoDe(contar(subarbol(nodo), erroresDe)),
      celdas,
    };
  });

  return Response.json(
    respuestaDe({
      documento,
      arbol,
      avisos,
      modo: 'unidades',
      etiqueta: bloqueDeUnidades ? bloqueDeUnidades.etiqueta : null,
      bloques,
      filas,
    }),
    { headers: { 'Cache-Control': 'no-store' } },
  );
});

// El cuerpo, con el resumen que la pantalla enseña arriba. Los totales se cuentan sobre TODO el
// documento y no sobre las celdas: los apartados comunes no salen en la matriz —el prototipo tampoco
// los pone— pero cuentan para «cuánto queda por revisar», que es del documento entero y tiene que
// decir lo mismo que la barra lateral.
function respuestaDe({ documento, arbol, avisos, modo, etiqueta, bloques, filas }) {
  const nodos = Arbol.aplanar(arbol);
  const conContenido = nodos.filter((n) => n.contenido);
  const porEstado = {};
  for (const e of ESTADOS) porEstado[e] = 0;
  for (const fila of filas) {
    for (const celda of (fila.celdas || [fila])) {
      if (celda.estado) porEstado[celda.estado] += 1;
    }
  }

  return {
    documentoId: documento._id,
    modo,
    // Cómo se llama una unidad en este documento («módulo», «materia»): lo trae la plantilla del
    // importador (`etiqueta_instancia`) y no se inventa aquí.
    etiqueta: etiqueta || null,
    bloques,
    filas,
    resumen: {
      unidades: filas.filter((f) => f.tipo === 'unidad').length,
      sinDocentes: filas.filter((f) => f.sinDocentes).length,
      apartados: conContenido.length,
      conContenido: conContenido.filter((n) => n.relleno).length,
      revisados: conContenido.filter((n) => esRevisado(n.origen)).length,
      celdas: porEstado,
    },
    // Lo que ya dice el panel de validaciones, para no tener que pedirlo dos veces al pintar esta
    // pantalla: el recuento del documento entero y si se puede aprobar. Sale del MISMO cálculo, así
    // que no puede discrepar de él.
    cuenta: avisos.cuenta,
    totalAvisos: avisos.total,
    puedeAprobarse: avisos.puedeAprobarse,
    convenioCe: avisos.convenioCe,
  };
}

module.exports = { GET, estadoDe, ESTADOS };
