// Las comprobaciones del documento, para el panel de la interfaz.
//
// La REGLA de cada comprobación vive en core/validaciones.js, compartida con el motor del PDF
// (decisión §2.2 de docs/plan.md). Este fichero solo BUSCA: recorre el árbol, saca los RA, los
// criterios, las unidades y los textos que cada comprobación necesita, y añade a cada aviso el
// `destino` navegable, que es lo que le faltaba al v1.
//
//   { severidad: 'error' | 'aviso' | 'info', titulo, detalle, destino }
//
// Los errores impiden aprobar el documento; los avisos, no.
//
// Qué hace este lado con el convenio de los criterios: pasa el laxo ('peso_del_ra_o_cien'),
// que es el que usa la interfaz. El motor pasa el estricto. La decisión de cuál vale es del
// departamento; ver el comentario de core/validaciones.js.

(function (global) {
  'use strict';

  const C = global.Contenido;
  const U = global.Unidades;
  const CV = global.Core.validaciones;

  const R = global.Estructura.ruta;
  const SEC_PONDERACIONES = R('modulos', 'Ponderaciones de los Resultados de aprendizaje y los Criterios de evaluacion');
  const SEC_SITUACIONES = R('modulos', 'Situaciones de aprendizaje');

  const destino = (docId, nodo) => ({ docId, seccion: nodo.seccion, unidadId: nodo.unidadId || null });

  // Pone el destino navegable a cada aviso que devuelve core.
  const conDestino = (docId, nodo, avisos) => avisos.map((a) => Object.assign({}, a, { destino: destino(docId, nodo) }));

  // Nombre de la unidad para el texto del aviso, o el documento si es común
  const dondeDice = (nodo, curso) =>
    nodo.unidadId ? U.tituloDe(nodo.unidadId, curso) : 'apartados comunes';

  // Convenio de los criterios que usa la interfaz (ver core/validaciones.js).
  const CONVENIO_INTERFAZ = CV.CONVENIOS_CE.PESO_DEL_RA_O_CIEN;

  // ---------------------------------------------------------------- por apartado
  function deApartado(docId, nodo, curso) {
    const out = [];
    if (!nodo || nodo.tipo === 'raiz') return out;
    const estado = C.apartado(docId, nodo);

    // --- ponderaciones de RA y CE
    if (nodo.unidadId && nodo.seccion === SEC_PONDERACIONES) {
      // Búsqueda: aquí el nodo es el apartado entero, así que la suma de los RA se comprueba siempre.
      // (El motor solo la comprueba si el campo tiene varias tablas; ese alcance es de su lado.)
      const ra = C.ponderaciones(nodo.unidadId);
      const errores = [];
      errores.push(...CV.avisosSumaRa(ra.map((r) => r.peso)));
      // Los RA sin criterios no entran: no hay nada que repartir y la comprobación no aplica.
      ra.filter((r) => r.ce.length).forEach((r) => {
        errores.push(...CV.avisosCriteriosDeRa({ ra: r.num, peso: r.peso, pesosCe: r.ce.map((c) => c.peso) }, CONVENIO_INTERFAZ));
      });
      out.push(...conDestino(docId, nodo, errores));
      if (!errores.length) {
        out.push({ severidad: 'info', titulo: 'Ponderaciones cuadradas', detalle: 'Los RA suman 100 % y cada criterio reparte el peso de su RA.', destino: destino(docId, nodo) });
      }
    }

    // --- situaciones de aprendizaje
    if (nodo.unidadId && nodo.seccion === SEC_SITUACIONES) {
      out.push(...conDestino(docId, nodo, CV.avisosRaSinSituacion(C.raSinSituacion(nodo.unidadId))));

      // Cada ficha, por separado. Son comprobaciones de la interfaz; el motor no las imprime.
      const SA = global.SA;
      (SA ? SA.listar(nodo.unidadId) : []).forEach((f) => {
        const quien = 'SA ' + f.num + (f.titulo ? ' («' + f.titulo + '»)' : '');
        if (!f.ra.length) {
          out.push({
            severidad: 'error',
            titulo: quien + ' no dice qué resultados de aprendizaje trabaja',
            detalle: 'Sin resultados de aprendizaje la situación no cuenta en la tabla resumen ni en las ponderaciones.',
            destino: destino(docId, nodo),
          });
        }
        if (f.sesiones == null || Number(f.sesiones) <= 0) {
          out.push({
            severidad: 'aviso',
            titulo: quien + ' no tiene sesiones',
            detalle: 'Sin sesiones no se puede comprobar que la suma de la unidad cuadre con las horas del módulo.',
            destino: destino(docId, nodo),
          });
        }
        if (!f.ce.length) {
          out.push({
            severidad: 'aviso',
            titulo: quien + ' no tiene criterios de evaluación',
            detalle: 'Los criterios se pueden marcar desde los del módulo en la propia ficha.',
            destino: destino(docId, nodo),
          });
        }
      });
    }

    // --- apartado vacío, heredado y copias desvinculadas
    out.push(...conDestino(docId, nodo, CV.apartadoVacio(estado, dondeDice(nodo, curso))));
    out.push(...conDestino(docId, nodo, CV.heredadoSinRevisar(estado)));
    if (nodo.unidadId) {
      const copias = C.DESVINCULADOS
        .filter((d) => d.unidadId === nodo.unidadId && C.COMPARTIDOS[d.compartido].seccion === nodo.seccion)
        .map((d) => ({ id: d.compartido, versionOrigen: d.versionOrigen, version: C.COMPARTIDOS[d.compartido].version }));
      out.push(...conDestino(docId, nodo, CV.copiasDesactualizadas(copias)));
    }

    return out;
  }

  // ---------------------------------------------------------------- por unidad
  // Comprobaciones que no son de un apartado concreto, sino de la unidad entera.
  function deUnidad(docId, nodo, curso) {
    const out = [];
    if (!nodo.unidadId || nodo.tipo !== 'unidad') return out;

    out.push(...conDestino(docId, nodo, CV.sinDocente(U.tituloDe(nodo.unidadId, curso), C.docentesDe(nodo.unidadId).length)));

    // Aviso de la interfaz, no del documento: el código oficial del título aún no se ha anotado.
    const u = U.unidad(nodo.unidadId);
    if (u && !u.codigo && u.ambito === 'fp') {
      out.push({
        severidad: 'info',
        titulo: 'Código del módulo pendiente de confirmar',
        detalle: 'La unidad funciona con su id interno (' + u.id + '), pero conviene anotar el código oficial del título.',
        destino: destino(docId, nodo),
      });
    }
    return out;
  }

  // ---------------------------------------------------------------- documento completo
  function deDocumento(docId, raiz, curso) {
    const out = [];
    global.Estructura.aplanar(raiz).forEach(({ nodo }) => {
      if (nodo.tipo === 'raiz') return;
      if (nodo.tipo === 'unidad') out.push.apply(out, deUnidad(docId, nodo, curso));
      if (nodo.tipo === 'bloque') return;
      out.push.apply(out, deApartado(docId, nodo, curso).filter((a) => a.severidad !== 'info'));
    });
    return out;
  }

  global.Validaciones = {
    deApartado,
    deUnidad,
    deDocumento,
    cuenta: CV.cuenta,
    puedeAprobarse: CV.puedeAprobarse,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
