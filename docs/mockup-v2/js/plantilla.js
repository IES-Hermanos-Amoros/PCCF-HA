// Cambios de estructura del documento: renombrar un apartado, añadir uno nuevo,
// reordenarlos y retirar los que ya no se usan.
//
// Es lo que faltaba y lo que convierte la herramienta en el sitio donde vive la
// programación, en lugar de un visor de lo que diga un Word. Hoy la plantilla
// solo se puede cambiar reimportando un .docx, así que el Word sigue siendo la
// fuente de verdad: si la inspección pide un apartado nuevo, hay que volver allí.
//
// ---------------------------------------------------------------------------
// EL ID NO ES EL TÍTULO
//
// Poder renombrar destapa un fallo del diseño de la primera versión del v2: los
// apartados se identificaban por el slug de su título (`introduccion`), así que
// renombrar "Introducción" habría cambiado su id y habría dejado huérfanos su
// contenido, sus comentarios y los enlaces que alguien tuviera guardados.
//
// Es el mismo error que ya habíamos corregido un nivel más abajo con los módulos
// (donde el título tampoco podía ser la clave), pero cometido con los apartados.
// Aquí el id se genera UNA VEZ, al crear el apartado, y no vuelve a cambiar:
// `titulo` es solo la etiqueta que se pinta. La interfaz enseña el id a la vista
// precisamente para que esto quede claro.
// ---------------------------------------------------------------------------
//
// Lo que guarda este módulo es una CAPA sobre la estructura importada, no una
// copia de ella:
//
//   titulos    { '<docId>|<idSeccion>': 'Título nuevo' }
//   extras     [ { docId, padre, id, titulo } ]        apartados añadidos a mano
//   orden      { '<docId>|<idPadre>': ['id', 'id'…] }  solo si se ha reordenado
//   retirados  [ '<docId>|<idSeccion>' ]               se ocultan, no se borran
//
// En la app real esto sería una versión nueva de `plantilla` con su migración de
// datos; aquí se queda en el navegador (localStorage).

(function (global) {
  'use strict';

  const CLAVE = 'pccf-ha-v2-plantilla';
  const RAIZ = '';                       // clave del nivel superior en `orden`

  let capa = { titulos: {}, extras: [], orden: {}, retirados: [] };

  const k = (docId, id) => docId + '|' + (id || '');

  function cargar() {
    try {
      const g = JSON.parse(global.localStorage.getItem(CLAVE) || 'null');
      if (g && typeof g === 'object') {
        capa = {
          titulos: g.titulos || {},
          extras: g.extras || [],
          orden: g.orden || {},
          retirados: g.retirados || [],
        };
      }
    } catch (e) { /* navegador sin localStorage: se trabaja en memoria */ }
  }

  function guardar() {
    try { global.localStorage.setItem(CLAVE, JSON.stringify(capa)); } catch (e) { /* sin persistencia */ }
  }

  function reiniciar() {
    capa = { titulos: {}, extras: [], orden: {}, retirados: [] };
    try { global.localStorage.removeItem(CLAVE); } catch (e) { /* nada */ }
  }

  // ---------------------------------------------------------------- consultas
  const titulo = (docId, idSeccion) => capa.titulos[k(docId, idSeccion)] || null;

  const extrasDe = (docId, idPadre) =>
    capa.extras.filter((e) => e.docId === docId && (e.padre || '') === (idPadre || ''));

  const ordenDe = (docId, idPadre) => capa.orden[k(docId, idPadre || RAIZ)] || null;

  const estaRetirado = (docId, idSeccion) => capa.retirados.indexOf(k(docId, idSeccion)) !== -1;

  const retiradosDe = (docId) => capa.retirados
    .filter((x) => x.indexOf(docId + '|') === 0)
    .map((x) => x.slice(docId.length + 1));

  const hayCambios = (docId) => !!(
    retiradosDe(docId).length
    || extrasDe(docId, null).length
    || capa.extras.some((e) => e.docId === docId)
    || Object.keys(capa.titulos).some((x) => x.indexOf(docId + '|') === 0)
    || Object.keys(capa.orden).some((x) => x.indexOf(docId + '|') === 0)
  );

  // ---------------------------------------------------------------- cambios
  // Renombrar NO toca el id: es justo la gracia.
  function renombrar(docId, idSeccion, nuevo) {
    const limpio = String(nuevo || '').trim();
    if (!limpio) return false;
    capa.titulos[k(docId, idSeccion)] = limpio;
    guardar();
    return true;
  }

  function restaurarTitulo(docId, idSeccion) {
    delete capa.titulos[k(docId, idSeccion)];
    guardar();
  }

  // El id del apartado nuevo se genera una vez, a partir del título con el que
  // nace, y ya no cambia aunque luego se renombre. `idsOcupados` son los ids
  // locales que ya hay entre sus hermanos, para no repetir.
  function anadir(docId, idPadre, tituloNuevo, idsOcupados, slug) {
    const limpio = String(tituloNuevo || '').trim();
    if (!limpio) return null;
    const base = slug(limpio) || 'apartado';
    let id = base;
    let n = 2;
    const ocupados = idsOcupados || [];
    while (ocupados.indexOf(id) !== -1 || capa.extras.some((e) => e.docId === docId && (e.padre || '') === (idPadre || '') && e.id === id)) {
      id = base + '-' + n;
      n += 1;
    }
    capa.extras.push({ docId, padre: idPadre || '', id, titulo: limpio });
    guardar();
    return id;
  }

  // Mover un apartado entre sus hermanos. `hermanos` son los ids locales en el
  // orden en que se están pintando ahora mismo.
  function mover(docId, idPadre, idLocal, delta, hermanos) {
    const lista = hermanos.slice();
    const i = lista.indexOf(idLocal);
    const j = i + delta;
    if (i === -1 || j < 0 || j >= lista.length) return false;
    lista.splice(j, 0, lista.splice(i, 1)[0]);
    capa.orden[k(docId, idPadre || RAIZ)] = lista;
    guardar();
    return true;
  }

  // Retirar deja el contenido donde está: solo se deja de pintar. Así se puede
  // recuperar si resulta que la normativa sí lo pedía.
  function retirar(docId, idSeccion) {
    const clave = k(docId, idSeccion);
    if (capa.retirados.indexOf(clave) === -1) capa.retirados.push(clave);
    guardar();
  }

  function restaurar(docId, idSeccion) {
    capa.retirados = capa.retirados.filter((x) => x !== k(docId, idSeccion));
    guardar();
  }

  // Ordena una lista de nodos según el orden guardado para su padre. Los que no
  // aparezcan en el orden guardado (por ejemplo los añadidos después) se quedan
  // detrás, en el orden en que venían.
  function aplicarOrden(docId, idPadre, nodos, idLocalDe) {
    const guardado = ordenDe(docId, idPadre);
    if (!guardado) return nodos;
    const pos = new Map(guardado.map((id, i) => [id, i]));
    return nodos.slice().sort((a, b) => {
      const ia = pos.has(idLocalDe(a)) ? pos.get(idLocalDe(a)) : Number.MAX_SAFE_INTEGER;
      const ib = pos.has(idLocalDe(b)) ? pos.get(idLocalDe(b)) : Number.MAX_SAFE_INTEGER;
      return ia - ib;
    });
  }

  global.Plantilla = {
    cargar, guardar, reiniciar,
    titulo, extrasDe, ordenDe, estaRetirado, retiradosDe, hayCambios,
    renombrar, restaurarTitulo, anadir, mover, retirar, restaurar, aplicarOrden,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
