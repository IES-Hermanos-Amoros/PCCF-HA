// Las comprobaciones del documento, en un módulo aparte y sin tocar el DOM.
//
// Es lo que pide docs/interfaz-web.md §3.4: hoy viven dentro de
// poc-pdfmake/lib/render-generico.js y solo se ven cuando ya se ha generado el
// PDF, en una cajita roja al final. Sacarlas aquí permite usarlas en la interfaz
// antes de exportar y, en la app real, compartir el mismo `lib/validaciones.js`
// entre el servidor y el navegador.
//
// Cada aviso lleva un `destino`, que es lo que le faltaba al v1: allí los avisos
// eran texto plano y había que buscar a mano el apartado que fallaba. Aquí se
// hace clic y la interfaz navega al RA que no cuadra.
//
//   { severidad: 'error' | 'aviso' | 'info', titulo, detalle, destino }
//
// Los errores impiden aprobar el documento; los avisos, no.

(function (global) {
  'use strict';

  const C = global.Contenido;
  const U = global.Unidades;

  const R = global.Estructura.ruta;
  const SEC_PONDERACIONES = R('modulos', 'Ponderaciones de los Resultados de aprendizaje y los Criterios de evaluacion');
  const SEC_SITUACIONES = R('modulos', 'Situaciones de aprendizaje');

  const destino = (docId, nodo) => ({ docId, seccion: nodo.seccion, unidadId: nodo.unidadId || null });

  // Nombre de la unidad para el texto del aviso, o el documento si es común
  const dondeDice = (nodo, curso) =>
    nodo.unidadId ? U.tituloDe(nodo.unidadId, curso) : 'apartados comunes';

  // ---------------------------------------------------------------- por apartado
  function deApartado(docId, nodo, curso) {
    const out = [];
    if (!nodo || nodo.tipo === 'raiz') return out;
    const estado = C.apartado(docId, nodo);

    // --- ponderaciones de RA y CE
    if (nodo.unidadId && nodo.seccion === SEC_PONDERACIONES) {
      const ra = C.ponderaciones(nodo.unidadId);
      const total = ra.reduce((s, r) => s + r.peso, 0);
      if (total !== 100) {
        out.push({
          severidad: 'error',
          titulo: 'Las ponderaciones de los RA suman ' + total + ' %',
          detalle: 'La suma de los resultados de aprendizaje tiene que ser exactamente 100 %.',
          destino: destino(docId, nodo),
        });
      }
      ra.forEach((r) => {
        const suma = r.ce.reduce((s, c) => s + c.peso, 0);
        if (suma !== r.peso) {
          out.push({
            severidad: 'error',
            titulo: 'RA' + r.num + ': sus criterios suman ' + suma + ' % y el RA pesa ' + r.peso + ' %',
            detalle: 'Los criterios de evaluación de un resultado de aprendizaje tienen que repartir exactamente su ponderación.',
            destino: destino(docId, nodo),
          });
        }
      });
      if (!out.length) {
        out.push({ severidad: 'info', titulo: 'Ponderaciones cuadradas', detalle: 'Los RA suman 100 % y cada criterio reparte el peso de su RA.', destino: destino(docId, nodo) });
      }
    }

    // --- RA sin situación de aprendizaje
    if (nodo.unidadId && nodo.seccion === SEC_SITUACIONES) {
      C.raSinSituacion(nodo.unidadId).forEach((num) => {
        out.push({
          severidad: 'aviso',
          titulo: 'RA' + num + ' no aparece en ninguna situación de aprendizaje',
          detalle: 'Todos los resultados de aprendizaje tienen que trabajarse en al menos una situación.',
          destino: destino(docId, nodo),
        });
      });
    }

    // --- apartado vacío
    if (!estado.bloques.length || estado.origen === 'vacio') {
      out.push({
        severidad: 'aviso',
        titulo: 'Apartado vacío',
        detalle: 'No se ha importado ni escrito nada todavía en ' + dondeDice(nodo, curso) + '.',
        destino: destino(docId, nodo),
      });
    }

    // --- heredado del curso anterior y sin revisar
    if (estado.origen === 'heredado') {
      out.push({
        severidad: 'aviso',
        titulo: 'Heredado del curso anterior, sin revisar',
        detalle: 'El texto viene del curso pasado tal cual. Hay que mirarlo y marcarlo como revisado, o cambiarlo.',
        destino: destino(docId, nodo),
      });
    }

    // --- copia desvinculada que se quedó atrás
    if (nodo.unidadId) {
      C.DESVINCULADOS
        .filter((d) => d.unidadId === nodo.unidadId && C.COMPARTIDOS[d.compartido].seccion === nodo.seccion)
        .forEach((d) => {
          const c = C.COMPARTIDOS[d.compartido];
          if (c.version > d.versionOrigen) {
            out.push({
              severidad: 'aviso',
              titulo: 'Copia propia desactualizada (v' + d.versionOrigen + ' frente a v' + c.version + ')',
              detalle: 'Este apartado se desvinculó del texto compartido ' + d.compartido + ' y el original ha cambiado desde entonces.',
              destino: destino(docId, nodo),
            });
          }
        });
    }

    return out;
  }

  // ---------------------------------------------------------------- por unidad
  // Comprobaciones que no son de un apartado concreto, sino de la unidad entera.
  function deUnidad(docId, nodo, curso) {
    const out = [];
    if (!nodo.unidadId || nodo.tipo !== 'unidad') return out;

    // Sin docente asignado nadie puede editarla: es el aviso nº 2 de
    // docs/interfaz-web.md, y con el importador tal como está hoy le pasa a las 11.
    if (!C.docentesDe(nodo.unidadId).length) {
      out.push({
        severidad: 'error',
        titulo: 'Sin docente asignado: ' + U.tituloDe(nodo.unidadId, curso),
        detalle: 'Mientras no tenga profesorado asignado, nadie salvo la jefatura de departamento puede editarla.',
        destino: destino(docId, nodo),
      });
    }

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

  const cuenta = (avisos) => avisos.reduce((c, a) => { c[a.severidad] = (c[a.severidad] || 0) + 1; return c; },
    { error: 0, aviso: 0, info: 0 });

  // Puerta de aprobación: con errores abiertos el documento no se aprueba.
  const puedeAprobarse = (avisos) => cuenta(avisos).error === 0;

  global.Validaciones = { deApartado, deUnidad, deDocumento, cuenta, puedeAprobarse };
})(typeof globalThis !== 'undefined' ? globalThis : this);
