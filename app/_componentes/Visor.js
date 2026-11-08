// El visor del documento: la pantalla de trabajo.
//
// Referencia: docs/mockup-v2/app.html y docs/mockup-v2/js/ui.js, que es la
// especificación funcional aprobada por el departamento.
//
// DÓNDE SE PUEDE ESCRIBIR LO DICE EL SERVIDOR
//
// `GET .../apartado` devuelve `puedeEditar`, y es eso y nada más lo que decide
// si el apartado se pinta con el editor del E3 (ApartadoEditable.js) o en
// lectura con el motivo (`Valores.js` y `motivoBloqueo`). El cliente no lo
// deduce: para resolverlo haría falta el reparto de unidades y las asignaciones,
// y el PATCH lo vuelve a comprobar de todas formas (docs/plan.md §2.5).
//
// EL ESTADO VIVE EN LA URL
//
//   /doc/<documentoId>/<idSeccion>?u=<unidadId>
//
// Con el formato de docs/interfaz-web.md §3.1 y del prototipo. La unidad va por
// su **id estable** y no por su índice: un índice apunta a otro módulo en cuanto
// alguien reordena, y es justo el identificador frágil que todo el diseño del
// mockup v2 vino a arreglar. Así copiar el enlace de un apartado y mandárselo a
// alguien funciona, y funciona también el curso que viene.
//
// Se usa `history.pushState` y `popstate` en lugar de `router.push` porque la
// navegación por el árbol no necesita ir al servidor: el árbol ya está en
// memoria y el contenido se pide a la API apartado por apartado. Con
// `router.push` cada clic en el árbol volvería a pintar la página en el servidor
// para acabar pidiendo lo mismo.
//
// LAS CUATRO VISTAS, Y LA VISTA TAMBIÉN VA EN LA URL
//
// Las cuatro del prototipo, ya completas: Contenido · Cambios · Validaciones ·
// Coordinación. El contenido, la comparación con el curso anterior (E5), el panel
// de comprobaciones (E4) y, con el E7, la matriz de unidades × bloques, que es la
// pantalla que mira la jefatura de departamento para saber qué falta
// (Coordinacion.js). Ninguna se deja como botón apagado: un botón que no hace
// nada no se distingue de uno estropeado.
//
// Dos de ellas son del DOCUMENTO entero —validaciones y coordinación— así que
// sustituyen al contenido en lugar de meterse al lado, y no llevan panel derecho
// ni botón de validar: lo que se está haciendo ahí es repasar lo que falta.
//
// Y EN *VALIDACIONES* VA ADEMÁS EL ESTADO DEL DOCUMENTO
//
// `borrador → revisión → aprobado`, con las transiciones que puede hacer quien
// mira (EstadoDocumento.js). Va ahí y no en la barra porque es donde está
// mirando quien decide: el `puedeAprobarse` del panel es la misma puerta que el
// servidor comprueba al aprobar, y cuando el rechazo llega con los errores
// separados en tres grupos, los avisos de los que habla están justo debajo.
//
// Y EL PANEL DERECHO, QUE AHORA SÍ EXISTE
//
// El prototipo reserva 310 px a la derecha para las comprobaciones y los
// comentarios. Los comentarios por apartado son el E7, así que la rejilla de dos
// columnas se enciende con ellos (Comentarios.js) en las vistas que miran UN
// apartado. Las comprobaciones de ese apartado siguen sin estar ahí: el panel del
// E4 las calcula del documento entero, y recortarlas por apartado es otra
// petición que todavía no existe.
//
// La vista va en `?vista=cambios`, `?vista=validaciones` o `?vista=coordinacion`
// por lo mismo que la sección va en la dirección: el panel de comprobaciones es la
// pantalla que la jefatura manda por enlace («mira los errores de tu módulo»), la
// comparación es la que se manda para preguntar «¿esto lo cambiaste tú?» y la
// coordinación es la que se enseña en la reunión de departamento; las tres tienen
// que poder copiarse, recargarse y volver con la flecha de atrás. Desde un aviso o
// desde una celda de la matriz se salta al apartado, y ese salto cambia de vista y
// de apartado a la vez: es un `pushState` normal, así que la flecha de atrás
// devuelve al panel.
//
// EL PROGRESO CUENTA REVISIÓN, NO RELLENO
//
// Desde el E5 la barra de la izquierda mide cuántos apartados ha mirado alguien
// para ESTE curso, no cuántos tienen texto (punto 7 de
// docs/mockup-v2/CAMBIOS.md). El número sale más bajo que el de antes, y es el
// que dice cuánto trabajo queda de verdad: lo que viene del curso anterior sin
// que nadie lo haya revisado cuenta como pendiente aunque esté lleno. El recuento
// lo manda el servidor en `revision`; aquí solo se le aplican las correcciones de
// lo que se ha hecho en esta sesión.
//
// UN CAMBIO DE ESTRUCTURA CAMBIA EL ÁRBOL
//
// La tarjeta *Estructura* del E6 renombra un apartado, añade uno, lo mueve y lo
// retira, y cualquiera de las cuatro cosas mueve el árbol: los títulos de la
// barra lateral, la numeración —que se calcula por posición, igual que la del
// PDF— y, en un apartado de módulo, los once módulos a la vez, porque lo que se
// está cambiando es la plantilla. Así que al volver de un cambio se vuelven a
// pedir `/arbol` y `/estructura` en lugar de retocar lo que hay en memoria:
// ninguna de las dos lleva contenido, y una copia de ese cálculo aquí se
// separaría del documento impreso el día que cambie. Si lo retirado era el
// apartado abierto, además se sube al padre: ese nodo ya no existe.
//
// `/estructura` se pide al abrir, con el documento y el árbol, porque es quien
// dice tres cosas que no están en el árbol: si quien mira puede cambiar la
// estructura (`puedeCambiar`, que es lo que decide si la tarjeta se pinta), qué
// se le puede hacer a cada apartado, y cuáles están retirados —que por
// definición ya no salen en el árbol y solo se pueden recuperar desde la
// portada—.
//
// DOS PETICIONES, NUNCA EL DOCUMENTO ENTERO
//
// Al abrirse: el documento y su árbol. Al pinchar un apartado: ese apartado. Una
// PD ronda los 250 apartados y `datos.json` pesa 2 MB (docs/api.md, segunda
// regla de forma), así que el árbol no lleva contenido y el contenido no lleva
// árbol.

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ApartadoEditable from './ApartadoEditable';
import Arbol from './Arbol';
import BarraSuperior from './BarraSuperior';
import Cambios, { BotonValidar } from './Cambios';
import Comentarios from './Comentarios';
import Coordinacion from './Coordinacion';
import CursoSiguiente from './CursoSiguiente';
import EstadoDocumento from './EstadoDocumento';
import Estructura, { ApartadosRetirados } from './Estructura';
import Ponderaciones from './Ponderaciones';
import Situaciones from './Situaciones';
import Validaciones from './Validaciones';
import Valores from './Valores';
import { pedir } from './api';
import {
  abiertosHasta, correccionDeRevision, estados as calcularEstados, indexar,
} from './arbol-cliente';
import { leerEstructura, puedeCambiarEstructura } from './estructura-cliente';
import { TIPO_FICHA, TIPO_PONDERACION, TIPO_RESUMEN } from './sa-cliente';
import { useSesion } from './sesion-cliente';
import {
  GLIFO, NOMBRE_ESTADO, NOMBRE_ESTADO_DOC, NOMBRE_ORIGEN, NOMBRE_TIPO,
  codigoDeUnidad, deQuienEs, motivoBloqueo,
} from './etiquetas';

// La clave de un nodo, con el mismo formato que `core/arbol.js`: la sección sola
// no identifica nada, porque la misma sección la pintan los once módulos.
const clave = (unidadId, seccion, documentoId) => (unidadId
  ? `${unidadId}::${seccion || ''}`
  : (seccion || documentoId));

const Candado = () => (
  <svg viewBox="0 0 24 24" className="ico-mini">
    <rect x="5" y="11" width="14" height="9" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" strokeWidth="1.8" />
  </svg>
);

const Metrica = ({ valor, etq, clase }) => (
  <div className="metrica"><b className={clase || ''}>{valor}</b><span>{etq}</span></div>
);

const Pastilla = ({ estado }) => (estado ? (
  <span className={'pastilla pastilla-' + estado}>
    <i className={'glifo glifo-' + estado} aria-hidden="true">{GLIFO[estado]}</i>
    {' ' + NOMBRE_ESTADO[estado]}
  </span>
) : null);

// El nombre corto de un documento, el que cabe en el desplegable de la barra.
const corto = (d) => [
  NOMBRE_TIPO[d.tipo] || d.tipo,
  d.ciclo ? String(d.ciclo).toUpperCase() : null,
  d.curso,
].filter(Boolean).join(' · ');

// El orden es el del prototipo: Contenido · Cambios · Validaciones · Coordinación.
const VISTAS = [
  { id: 'contenido', etiqueta: 'Contenido' },
  { id: 'cambios', etiqueta: 'Cambios' },
  { id: 'validaciones', etiqueta: 'Validaciones' },
  { id: 'coordinacion', etiqueta: 'Coordinación' },
];

const esVista = (v) => VISTAS.some((x) => x.id === v);

// Las vistas que miran el DOCUMENTO entero y no un apartado: sustituyen al
// contenido, y ni la cabecera del apartado ni el panel derecho tienen sentido en
// ellas.
const DEL_DOCUMENTO = ['validaciones', 'coordinacion'];
const esDelDocumento = (v) => DEL_DOCUMENTO.includes(v);

// El título que lleva la cabecera en esas dos vistas.
const TITULO_VISTA = {
  validaciones: 'Comprobaciones del documento',
  coordinacion: 'Coordinación',
};

export default function Visor({
  documentoId, seccionInicial, unidadInicial, vistaInicial,
}) {
  const [seccion, setSeccion] = useState(seccionInicial || null);
  const [unidadId, setUnidadId] = useState(unidadInicial || null);
  const [vista, setVista] = useState(() => (esVista(vistaInicial) ? vistaInicial : 'contenido'));

  const [documento, setDocumento] = useState(null);
  const [arbol, setArbol] = useState(null);
  const [resumen, setResumen] = useState(null);
  // El progreso por revisión, que lo cuenta el servidor con el árbol delante
  // (`revision` de GET .../arbol). Null mientras no llegue, o si el árbol es de
  // antes del arrastre: entonces no se enseña un porcentaje inventado.
  const [revision, setRevision] = useState(null);
  const [documentos, setDocumentos] = useState([]);
  const [errorCarga, setErrorCarga] = useState(null);
  // La estructura del documento tal como se puede cambiar (E6): `puedeCambiar`,
  // una fila por apartado con qué se le puede hacer, y los retirados. Null
  // mientras no llega o si la lectura falla: entonces la tarjeta se resuelve con
  // la regla de core/permisos.js y con lo que se ve en el árbol.
  const [estructura, setEstructura] = useState(null);

  const [apartado, setApartado] = useState(null);
  const [cargandoApartado, setCargandoApartado] = useState(false);
  const [errorApartado, setErrorApartado] = useState(null);
  // Se pide otra vez el apartado abierto, sin cambiar de apartado: es lo que hace
  // falta tras un 409 al validar («vuelve a cargarlo»).
  const [recargas, setRecargas] = useState(0);
  // Lo que acaba de pasar con la estructura, para decirlo donde se aterriza. Al
  // retirar un apartado la pantalla se va a su padre, y sin esto el apartado
  // desaparecería del árbol sin que nadie dijera que su contenido sigue ahí, que
  // es justo lo que haría parecer que retirar es borrar.
  const [avisoEstructura, setAvisoEstructura] = useState(null);

  // Lo que ha cambiado en esta sesión, por apartado: `clave -> { relleno, origen }`.
  // Los dos los calculó el servidor al mandar el árbol, así que sin esto el icono
  // de un apartado recién escrito seguiría diciendo «vacío» y el de uno recién
  // validado seguiría diciendo «pendiente» hasta recargar la página. Se corrige
  // el nodo en lugar de volver a pedir el árbol —250 apartados— en cada
  // autoguardado.
  const [locales, setLocales] = useState(() => new Map());

  const [abiertos, setAbiertos] = useState(() => new Set());
  const [busqueda, setBusqueda] = useState('');
  const [cajon, setCajon] = useState(false);
  const buscador = useRef(null);
  // Quién soy lo contesta el servidor: la cookie de sesión es `HttpOnly` y el
  // navegador no la ve (sesion-cliente.js). En el E1 aquí se leía la cookie
  // `persona`, que ya no identifica a nadie.
  const { persona: yo } = useSesion();

  // ---------------------------------------------------------------- carga inicial

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        // En paralelo: son dos ramas distintas y ninguna depende de la otra. La
        // lista de documentos va después y aparte porque es para el desplegable
        // de la barra, y es la única que puede fallar sin impedir trabajar.
        const [doc, ar] = await Promise.all([
          pedir(`/api/documentos/${encodeURIComponent(documentoId)}`),
          pedir(`/api/documentos/${encodeURIComponent(documentoId)}/arbol`),
        ]);
        if (!vivo) return;
        setDocumento(doc.documento);
        setArbol(ar.arbol);
        setResumen(ar.resumen);
        setRevision(ar.revision || null);
      } catch (e) {
        if (vivo) setErrorCarga(e);
      }
      try {
        const ds = await pedir('/api/documentos');
        if (!vivo) return;
        setDocumentos((ds.documentos || []).map((d) => ({ ...d, corto: corto(d) })));
      } catch (e) { /* el visor se puede usar sin el desplegable de documentos */ }
      try {
        // La estructura va aparte y después, como la lista de documentos: el
        // documento se lee y se escribe igual aunque esto falle, y lo único que
        // se pierde es la tarjeta de estructura.
        const es = await leerEstructura(documentoId);
        if (vivo) setEstructura(es);
      } catch (e) { /* sin esto no hay tarjeta de estructura, pero sí documento */ }
    })();
    return () => { vivo = false; };
  }, [documentoId]);

  // ---------------------------------------------------------------- índice y estados

  const { indice, lineal } = useMemo(
    () => (arbol ? indexar(arbol) : { indice: new Map(), lineal: [] }),
    [arbol],
  );
  const estados = useMemo(
    () => (arbol ? calcularEstados(arbol, locales) : new Map()),
    [arbol, locales],
  );
  // Las filas de la estructura, por id de apartado: la tarjeta necesita la del
  // apartado abierto y buscarla en una lista de 245 en cada repintado no.
  const filasEstructura = useMemo(() => new Map(
    ((estructura && estructura.apartados) || []).map((f) => [f.seccion, f]),
  ), [estructura]);

  const activa = clave(unidadId, seccion, documentoId);
  const entrada = indice.get(activa) || indice.get(documentoId) || null;
  const nodo = entrada ? entrada.nodo : null;

  // Al abrir el árbol, desplegado hasta el apartado que pide la URL: si llegas
  // por un enlace pegado, el apartado está a cuatro niveles y tiene que verse.
  useEffect(() => {
    if (!indice.size) return;
    setAbiertos((previos) => {
      const siguiente = new Set(previos);
      for (const k of abiertosHasta(indice, activa)) siguiente.add(k);
      return siguiente;
    });
  }, [indice, activa]);

  // ---------------------------------------------------------------- la URL

  const escribirRuta = useCallback((sec, uni, reemplazar, vis) => {
    const partes = ['/doc', encodeURIComponent(documentoId)];
    if (sec) partes.push(sec.split('/').map(encodeURIComponent).join('/'));
    const q = new URLSearchParams();
    if (uni) q.set('u', uni);
    // `contenido` es la vista por omisión y no se escribe: así el enlace de un
    // apartado sigue siendo el mismo que antes del E4 y los que ya se hayan
    // mandado por correo siguen abriendo lo mismo.
    if (vis && vis !== 'contenido') q.set('vista', vis);
    const cola = q.toString();
    const url = partes.join('/') + (cola ? '?' + cola : '');
    if (window.location.pathname + window.location.search === url) return;
    if (reemplazar) window.history.replaceState(null, '', url);
    else window.history.pushState(null, '', url);
  }, [documentoId]);

  // Atrás y adelante del navegador: se vuelve a leer la dirección, que es la que
  // manda. Sin esto la flecha de atrás cambia la URL y deja la pantalla igual.
  useEffect(() => {
    const volver = () => {
      const camino = window.location.pathname.split('/').filter(Boolean); // doc, id, ...seccion
      const sec = camino.length > 2 ? camino.slice(2).map(decodeURIComponent).join('/') : null;
      const consulta = new URLSearchParams(window.location.search);
      setSeccion(sec);
      setUnidadId(consulta.get('u') || null);
      const v = consulta.get('vista');
      setVista(esVista(v) ? v : 'contenido');
    };
    window.addEventListener('popstate', volver);
    return () => window.removeEventListener('popstate', volver);
  }, []);

  // Ir a un nodo del árbol. Siempre vuelve a la vista de contenido: desde el
  // panel de comprobaciones, pinchar un aviso es «llévame al apartado que
  // falla», no «quédate en el panel».
  const ir = useCallback((k) => {
    const e = indice.get(k);
    if (!e) return;
    setSeccion(e.nodo.seccion);
    setUnidadId(e.nodo.unidadId);
    setVista('contenido');
    // Lo que se dijo de un cambio de estructura vale para el apartado donde se
    // dijo: al cambiar de apartado se borra. Quien retira uno y luego navega no
    // tiene que ir arrastrando el aviso por el documento.
    setAvisoEstructura(null);
    setAbiertos((previos) => {
      const siguiente = new Set(previos);
      for (const c of abiertosHasta(indice, k)) siguiente.add(c);
      return siguiente;
    });
    escribirRuta(e.nodo.seccion, e.nodo.unidadId, false, 'contenido');
    setCajon(false);
  }, [indice, escribirRuta]);

  // Ir a un apartado por su sección y su unidad, que es cómo lo nombran los
  // avisos del panel de comprobaciones y el panel de situaciones: ellos no
  // conocen la clave del árbol.
  const irAApartado = useCallback((sec, uni) => {
    ir(clave(uni || null, sec, documentoId));
  }, [ir, documentoId]);

  const cambiarVista = useCallback((v) => {
    setVista(v);
    escribirRuta(seccion, unidadId, false, v);
  }, [escribirRuta, seccion, unidadId]);

  const alternar = useCallback((k, abrir) => {
    setAbiertos((previos) => {
      const siguiente = new Set(previos);
      const quiere = abrir === undefined ? !siguiente.has(k) : abrir;
      if (quiere) siguiente.add(k); else siguiente.delete(k);
      return siguiente;
    });
  }, []);

  // ---------------------------------------------------------------- el apartado abierto

  useEffect(() => {
    if (!nodo) { setApartado(null); return undefined; }
    // Los nodos que solo agrupan —la raíz, un bloque de unidades, una unidad, una
    // sección sin campos propios— no tienen contenido que pedir: se resumen con
    // lo que ya está en el árbol, sin una petición de más.
    if (!nodo.contenido) { setApartado(null); setErrorApartado(null); return undefined; }

    let vivo = true;
    setCargandoApartado(true);
    setErrorApartado(null);
    const q = new URLSearchParams({ seccion: nodo.seccion });
    if (nodo.unidadId) q.set('unidad', nodo.unidadId);
    pedir(`/api/documentos/${encodeURIComponent(documentoId)}/apartado?${q}`)
      .then((r) => { if (vivo) setApartado(r); })
      .catch((e) => { if (vivo) { setApartado(null); setErrorApartado(e); } })
      .finally(() => { if (vivo) setCargandoApartado(false); });
    return () => { vivo = false; };
  }, [documentoId, nodo, recargas]);

  // ---------------------------------------------------------------- lo que se escribe

  // Anota lo que ha cambiado de un apartado en esta sesión. Tiene que ser
  // estable: ApartadoEditable la mete dentro de su función de guardar, y una
  // función nueva en cada repintado haría que el efecto de limpieza se
  // ejecutara —es decir, que mandara el apartado— en medio de una tecleada.
  const anotar = useCallback((k, parche) => {
    if (!k) return;
    setLocales((previos) => {
      const antes = previos.get(k) || {};
      const despues = { ...antes, ...parche };
      if (antes.relleno === despues.relleno && antes.origen === despues.origen) return previos;
      const siguiente = new Map(previos);
      siguiente.set(k, despues);
      return siguiente;
    });
  }, []);

  // Lo llama el editor después de cada autoguardado correcto. El `origen` lo pone
  // el servidor en la respuesta del PATCH (`modificado`), y es lo que hace que el
  // progreso por revisión se mueva al reescribir un apartado heredado.
  const alGuardar = useCallback(({ relleno, origen }) => {
    anotar(nodo ? nodo.clave : null, origen === undefined ? { relleno } : { relleno, origen });
  }, [anotar, nodo]);

  // Lo llama el botón de validar con la respuesta del servidor. Se corrige el
  // apartado abierto —para que el distintivo de la cabecera y el pie de la
  // comparación digan ya «revisado»— y el nodo del árbol, para que el icono y el
  // progreso se muevan sin recargar.
  const alValidado = useCallback((r) => {
    setApartado((previo) => (previo ? {
      ...previo,
      origen: r && r.origen ? r.origen : 'revisado',
      updatedAt: r && r.updatedAt ? r.updatedAt : previo.updatedAt,
      revisadoPor: r ? r.revisadoPor : previo.revisadoPor,
      revisadoEn: r ? r.revisadoEn : previo.revisadoEn,
    } : previo));
    anotar(nodo ? nodo.clave : null, { origen: (r && r.origen) || 'revisado' });
  }, [anotar, nodo]);

  const recargarApartado = useCallback(() => setRecargas((n) => n + 1), []);

  // ---------------------------------------------------------------- la estructura (E6)

  // Volver a pedir el árbol. Es la petición que NO lleva contenido —títulos,
  // numeración y estados de 250 apartados— así que pedirlo otra vez tras un
  // cambio de estructura es barato, y es la única forma de que la barra lateral y
  // la numeración digan lo que dice el documento: las calcula el servidor con la
  // plantilla delante (core/arbol.js), igual que el PDF.
  const recargarArbol = useCallback(async () => {
    const [ar, es] = await Promise.all([
      pedir(`/api/documentos/${encodeURIComponent(documentoId)}/arbol`),
      leerEstructura(documentoId),
    ]);
    setArbol(ar.arbol);
    setResumen(ar.resumen);
    setRevision(ar.revision || null);
    setEstructura(es);
  }, [documentoId]);

  // Lo llama la tarjeta *Estructura* cuando el servidor ha aceptado un cambio.
  const alCambiarEstructura = useCallback(async (accion, r) => {
    // El apartado retirado deja de estar en el árbol, así que la pantalla no
    // puede quedarse en él: se sube al padre. El `ir` limpia el aviso, y por eso
    // el aviso se pone DESPUÉS: es el mensaje de este cambio, no del anterior.
    const padre = accion === 'retirar' && entrada && entrada.camino.length > 1
      ? entrada.camino[entrada.camino.length - 2]
      : null;
    if (padre) {
      ir(padre.clave);
      // Cuántos apartados se ha llevado y si ha salido en todas las unidades lo
      // dice la respuesta: un apartado se va con lo que tenga dentro, y uno de
      // módulo se va de los once a la vez.
      const cuantos = r && r.apartadosAfectados > 1
        ? ` Se han retirado ${r.apartadosAfectados} apartados: ese y los que tenía dentro.`
        : '';
      const todas = r && r.afectaUnidades && r.unidades > 1
        ? ` Ha salido de ${r.unidades} módulos a la vez, porque era de su plantilla.`
        : '';
      setAvisoEstructura('El apartado se ha retirado del documento.' + cuantos + todas
        + ' No se ha borrado: su contenido sigue guardado y vuelve con su texto al restaurarlo'
        + ' desde la portada del documento.');
    }

    // Un campo nuevo cambia lo que trae el apartado abierto (`campos`): se vuelve a pedir.
    if (accion === 'anadir_campo') recargarApartado();

    try {
      await recargarArbol();
    } catch (e) {
      // El cambio se hizo: lo que ha fallado es volver a leer el árbol. Se dice,
      // porque la barra lateral se queda enseñando la estructura de antes.
      setAvisoEstructura('El cambio se ha guardado, pero no se ha podido volver a leer el árbol:'
        + ` ${e.message} Recarga la página para verlo como está ahora.`);
    }
  }, [entrada, ir, recargarArbol, recargarApartado]);

  // Los dos recuentos de la barra lateral, con las correcciones de esta sesión:
  // el servidor los calculó con el árbol de entonces.
  const rellenosAhora = useMemo(() => {
    if (!resumen) return 0;
    let n = resumen.rellenos;
    for (const [k, v] of locales) {
      if (v.relleno === undefined) continue;
      const e = indice.get(k);
      if (!e || !e.nodo.contenido) continue;
      if (v.relleno && !e.nodo.relleno) n += 1;
      else if (!v.relleno && e.nodo.relleno) n -= 1;
    }
    return n;
  }, [resumen, locales, indice]);

  // El progreso de verdad: cuántos apartados ha mirado alguien para este curso.
  const revisadosAhora = useMemo(
    () => (revision ? revision.revisados + correccionDeRevision(indice, locales) : null),
    [revision, locales, indice],
  );

  // ---------------------------------------------------------------- los hermanos del apartado
  //
  // Dos cosas que el apartado abierto necesita y que no vienen en su respuesta,
  // porque ninguna ruta manda la plantilla: en qué apartado del MISMO módulo
  // están los resultados de aprendizaje con sus criterios —los que se eligen en
  // la ficha de una situación— y cuál es el otro apartado de situaciones de
  // aprendizaje, el padre o el repetidor.
  //
  // Salen del árbol, que ya está en memoria, y se buscan por el título y no por
  // un id escrito a mano: el id de una sección lo genera el importador a partir
  // del título del Word y se recorta («…criterios-de-evaluacio», sin la n
  // final), así que un id a mano se rompe el día que alguien renombra el
  // apartado o importa otro documento.
  const contexto = useMemo(() => {
    if (!nodo || !nodo.unidadId || !entrada) return null;
    const unidad = entrada.camino.find((n) => n.tipo === 'unidad');
    if (!unidad) return null;

    const dentro = [];
    (function recorre(n) {
      for (const h of n.hijos || []) { dentro.push(h); recorre(h); }
    })(unidad);

    const raCe = dentro.find((n) => /resultados de aprendizaje y criterios/i.test(n.titulo || ''));

    // El otro apartado de situaciones: si estamos en el repetidor, su padre; si
    // estamos en el padre, el repetidor que tiene dentro.
    const padre = entrada.camino.length > 1 ? entrada.camino[entrada.camino.length - 2] : null;
    const hijoRepetidor = (nodo.hijos || []).find((h) => h.repetidor);
    const hermano = nodo.repetidor ? padre : hijoRepetidor;

    return {
      raCe: raCe ? raCe.seccion : null,
      hermanoSa: hermano && hermano.seccion
        ? { seccion: hermano.seccion, titulo: hermano.titulo }
        : null,
    };
  }, [nodo, entrada]);

  // ---------------------------------------------------------------- recorrido lineal

  const posicion = lineal.findIndex((x) => x.nodo.clave === activa);
  const mover = (paso) => {
    if (posicion === -1) {
      // En la portada del documento no hay posición en el recorrido: avanzar es
      // entrar por el primer apartado.
      if (paso > 0 && lineal.length) ir(lineal[0].nodo.clave);
      return;
    }
    const siguiente = lineal[posicion + paso];
    if (siguiente) ir(siguiente.nodo.clave);
  };

  // ---------------------------------------------------------------- cajón y Escape

  useEffect(() => {
    const tecla = (ev) => { if (ev.key === 'Escape' && cajon) setCajon(false); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [cajon]);

  useEffect(() => { if (cajon && buscador.current) buscador.current.focus(); }, [cajon]);

  // Mientras se carga, el tema y la barra ya están: así no parpadea en blanco.
  if (errorCarga) {
    return (
      <>
        <BarraSuperior persona={yo} />
        <main className="main">
          <div className="cabecera"><div><h1>No se puede abrir este documento</h1></div></div>
          <div className="nota nota-lock">
            <Candado />
            <div>
              {errorCarga.message}
              {errorCarga.codigo === 'sin_identificar' ? (
                <p className="suave">
                  No has entrado en este navegador. No hay registro ni contraseñas: te da de alta la
                  jefatura de tu departamento y se entra con un enlace de un solo uso.{' '}
                  <a className="enlace" href="/acceso">Cómo se entra</a>.
                </p>
              ) : null}
              {errorCarga.codigo === 'no_encontrado' ? (
                <p className="suave">
                  Un documento de otro departamento se responde igual que uno que no existe: para
                  quien mira la pantalla es lo mismo (docs/api.md).
                </p>
              ) : null}
            </div>
          </div>
          <p><a className="enlace" href="/">Volver a la lista de documentos</a></p>
        </main>
      </>
    );
  }

  if (!arbol || !documento) {
    return (
      <>
        <BarraSuperior persona={yo} />
        <main className="main"><p className="suave">Abriendo el documento…</p></main>
      </>
    );
  }

  const est = nodo ? (estados.get(nodo.clave) || {}) : {};
  const rol = yo ? yo.rol : null;
  // Quién cambia la estructura lo dice el servidor en `puedeCambiar`; mientras
  // esa lectura no vuelve, la misma regla de core/permisos.js (ver
  // estructura-cliente.js). Quien no puede no ve la tarjeta, igual que en el
  // prototipo: no es un botón que se le niegue, es una decisión que no es suya.
  const puedeEstructura = puedeCambiarEstructura(estructura, yo, documento);
  const unidadDelNodo = nodo && nodo.unidadId ? codigoDeUnidad(nodo.unidadId) : null;
  const base = `/api/documentos/${encodeURIComponent(documentoId)}`;

  // DÓNDE HAY PANEL DERECHO: donde hay un apartado del que hablar.
  //
  // El hilo de comentarios cuelga del par (sección, unidad), el mismo que
  // identifica el contenido, así que se pinta en las vistas que miran UN apartado
  // —el contenido y la comparación con el curso anterior, que es justo donde se
  // pregunta «¿esto lo cambiaste tú?»— y no en las del documento entero.
  //
  // Tampoco en una unidad: un módulo no es un apartado de la plantilla, y pedir
  // su hilo sería pedir el de la sección que reparte las instancias diciendo de
  // qué módulo, que es un enlace mal construido y la API contesta 400 (ver
  // `abrirApartado` en app/_lib/rutas/apartado.js). El hilo del módulo se abre en
  // cualquiera de sus apartados.
  const hayPanel = !esDelDocumento(vista) && !!nodo && !!nodo.seccion && nodo.tipo !== 'unidad';

  // EL CONTENIDO QUE HAY TIENE QUE SER EL DEL APARTADO ABIERTO
  //
  // `nodo` cambia en cuanto se pincha en el árbol, y `apartado` llega una
  // petición después: entre medias, lo que hay en `apartado` es el del apartado
  // ANTERIOR. Pintarlo sería enseñar el texto de otro apartado bajo este título,
  // y es peor que feo: el editor se monta con él y **escribiría en el otro**,
  // porque la dirección del PATCH sale del apartado que le dan (`urlApartado` de
  // autoguardado.js) y su estado se fija al montarse.
  //
  // `cargandoApartado` ya tapa el caso normal; esto es el cinturón: se comprueba
  // que el contenido es el de este nodo —sección y unidad— y, mientras no lo sea,
  // se trata como si siguiera cargando. Se añadió al encontrar que escribir en un
  // apartado recién abierto guardaba en el anterior; aquella era otra causa (dos
  // hermanos con la misma `key`, ver `tarjetaEstructura`), pero la comprobación
  // se queda: el editor no debe poder recibir nunca el apartado de al lado.
  const esDelNodo = (a) => !!a && !!nodo && a.seccion === nodo.seccion
    && (a.unidadId || null) === (nodo.unidadId || null);
  const apartadoDelNodo = esDelNodo(apartado) ? apartado : null;

  // La procedencia del apartado abierto. Se mira primero lo que haya pasado en
  // esta sesión, luego la respuesta del apartado y por último el nodo del árbol:
  // el nodo la trae desde el principio, así que el distintivo de la cabecera no
  // espera a que llegue el contenido.
  const localDelNodo = nodo ? locales.get(nodo.clave) : null;
  const origenDelNodo = (localDelNodo && localDelNodo.origen !== undefined ? localDelNodo.origen : null)
    || (apartadoDelNodo ? apartadoDelNodo.origen : null)
    || (nodo ? nodo.origen : null);

  // El apartado tal como lo ve el botón de validar: con la procedencia corregida,
  // para que no se pueda ofrecer dos veces lo mismo.
  const apartadoAhora = apartadoDelNodo ? { ...apartadoDelNodo, origen: origenDelNodo } : null;

  // ---------------------------------------------------------------- las piezas de la pantalla

  const migas = () => {
    const camino = entrada ? entrada.camino.filter((n) => n.tipo !== 'raiz') : [];
    const todas = [{ titulo: corto(documento), clave: documentoId }].concat(
      camino.map((n) => ({ titulo: n.titulo, clave: n.clave })),
    );
    return (
      <nav className="migas" aria-label="Dónde estás">
        {todas.map((m, i) => (i === todas.length - 1 ? (
          <span key={m.clave} aria-current="page">{m.titulo}</span>
        ) : (
          <span key={m.clave}>
            <button className="enlace" onClick={() => ir(m.clave)}>{m.titulo}</button>
            <span className="sep" aria-hidden="true"> › </span>
          </span>
        )))}
      </nav>
    );
  };

  // La tarjeta *Estructura*, debajo de lo que se esté mirando: cambiar la
  // estructura es una decisión sobre ESTE apartado, igual que en el prototipo.
  // No sale en una unidad —un módulo no es un apartado de la plantilla, y su
  // orden es el del documento, que hoy no se puede reordenar por la API del
  // repositorio (docs/plan.md, «Para el E6»)— ni en la portada, que no es una
  // sección. El `key` es el nodo: al cambiar de apartado se monta otra tarjeta,
  // y así el campo del título no se queda con el del apartado anterior.
  //
  // CON SU PREFIJO, Y NO SOLO LA CLAVE DEL NODO. Esta tarjeta se pinta al lado
  // del apartado, que también lleva `key={nodo.clave}`: dos hermanos con la
  // MISMA clave dejan a React sin saber cuál es cuál, y lo que se ve es que al
  // cambiar de apartado el editor del anterior se queda en la pantalla —con su
  // contenido y con su dirección—, así que lo que se escribe acaba guardado en
  // el apartado de antes. Se encontró recorriéndolo a mano: añadir un apartado,
  // abrirlo y escribir dentro escribía en su padre.
  const tarjetaEstructura = () => (puedeEstructura && nodo && nodo.seccion && nodo.tipo !== 'unidad' ? (
    <Estructura
      key={`estructura-${nodo.clave}`}
      documentoId={documentoId}
      nodo={nodo}
      camino={entrada ? entrada.camino : []}
      fila={filasEstructura.get(nodo.seccion) || null}
      plantillaVersion={estructura ? estructura.plantillaVersion : documento.plantillaVersion}
      unidades={estructura ? estructura.unidades : 0}
      tiposDeCampo={estructura ? estructura.tiposDeCampo : null}
      limites={estructura ? estructura.limites : null}
      onCambiado={alCambiarEstructura}
      onIr={irAApartado}
    />
  ) : null);

  // La tabla de hijos de un nodo de paso: es como se entra en un módulo o en un
  // bloque sin tener que desplegar el árbol.
  const listaHijos = (n) => (!(n.hijos || []).length ? null : (
    <section className="tarjeta">
      <header className="tarjeta-cab"><h2>Apartados</h2></header>
      <table className="tabla">
        <thead><tr><th>Apartado</th><th>Estado</th><th /></tr></thead>
        <tbody>
          {n.hijos.map((h) => {
            const e = estados.get(h.clave) || {};
            return (
              <tr key={h.clave}>
                <td>
                  <button className="enlace" onClick={() => ir(h.clave)}>
                    {(h.num ? h.num + '. ' : '') + h.titulo}
                  </button>
                </td>
                <td><Pastilla estado={e.agregado} /></td>
                <td className="suave">
                  {(h.hijos || []).length
                    ? h.hijos.length + (h.hijos.length === 1 ? ' apartado' : ' apartados')
                    : 'apartado final'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  ));

  const vistaResumen = (n) => (
    <>
      <section className="tarjeta">
        <header className="tarjeta-cab"><h2>{n.titulo}</h2></header>
        <div className="metricas">
          <Metrica valor={resumen ? resumen.apartados : '—'} etq="apartados" />
          {/* Lo primero que se pregunta en septiembre es cuánto queda por
              mirar, no cuánto tiene texto: lo heredado sin revisar está lleno y
              sigue pendiente (punto 7 de docs/mockup-v2/CAMBIOS.md). */}
          {revisadosAhora !== null ? (
            <>
              <Metrica valor={revisadosAhora} etq="revisados para este curso" />
              <Metrica
                valor={revision.apartados - revisadosAhora}
                etq="pendientes de revisar"
                clase={revision.apartados - revisadosAhora ? 'ambar' : ''}
              />
            </>
          ) : null}
          <Metrica valor={resumen ? rellenosAhora : '—'} etq="con contenido" />
          <Metrica
            valor={resumen ? resumen.apartados - rellenosAhora : '—'}
            etq="vacíos"
            clase={resumen && resumen.apartados - rellenosAhora ? 'ambar' : ''}
          />
          <Metrica valor={resumen ? resumen.unidades : '—'} etq="unidades" />
        </div>
        {revision && revision.heredados ? (
          <p className="ayuda">
            {revision.heredados === 1
              ? '1 apartado viene del curso anterior sin que nadie lo haya mirado.'
              : `${revision.heredados} apartados vienen del curso anterior sin que nadie los haya mirado.`}
            {' '}Se repasan en la vista <strong>Cambios</strong> de cada uno, que los compara con el
            curso pasado.
          </p>
        ) : null}
        <dl className="ficha">
          <dt>Tipo</dt><dd>{NOMBRE_TIPO[documento.tipo] || documento.tipo}</dd>
          {documento.ciclo ? <><dt>Ciclo</dt><dd>{String(documento.ciclo).toUpperCase()}</dd></> : null}
          <dt>Curso</dt><dd>{documento.curso || '—'}</dd>
          <dt>Estado</dt><dd>{NOMBRE_ESTADO_DOC[documento.estado] || documento.estado}</dd>
          {documento.origen ? <><dt>Importado de</dt><dd><code>{documento.origen}</code></dd></> : null}
        </dl>
        {/* El reparto de unidades lo puede VER cualquiera que vea el documento:
            un docente necesita saber quién más lleva su módulo. Cambiarlo es
            otra cosa, y lo dice esa pantalla. */}
        <div className="compartido-acciones">
          <a className="mini" href={`/reparto/${encodeURIComponent(documentoId)}`}>
            Quién lleva cada unidad
          </a>
          {documento.anteriorId ? (
            <a className="mini" href={`/doc/${encodeURIComponent(documento.anteriorId)}`}>
              El documento del curso anterior
            </a>
          ) : null}
        </div>
      </section>

      {/* El arrastre entre cursos se ofrece aquí: es una decisión sobre ESTE
          documento, y esta es la única pantalla donde se está mirando el
          documento entero con su curso delante. */}
      {n.tipo === 'raiz' ? (
        <CursoSiguiente
          documentoId={documentoId}
          documento={documento}
          documentos={documentos}
          rol={rol}
        />
      ) : null}

      {/* Los apartados retirados se recuperan desde aquí, y es lo que promete la
          tarjeta *Estructura* al retirar uno: es la única pantalla desde la que
          se puede, porque un apartado retirado ya no sale en el árbol y no se
          puede abrir. Si no hay ninguno, no se pinta nada. */}
      {n.tipo === 'raiz' && puedeEstructura && estructura ? (
        <ApartadosRetirados
          documentoId={documentoId}
          retirados={estructura.retirados}
          plantillaVersion={estructura.plantillaVersion}
          onCambiado={alCambiarEstructura}
        />
      ) : null}

      {listaHijos(n)}
    </>
  );

  const vistaUnidad = (n) => {
    const codigo = codigoDeUnidad(n.unidadId);
    const q = '?unidad=' + encodeURIComponent(n.unidadId);
    return (
      <>
        <section className="tarjeta">
          <header className="tarjeta-cab"><h2>{n.titulo}</h2></header>
          <dl className="ficha">
            <dt>Id interno</dt><dd><code>{n.unidadId}</code></dd>
            <dt>Código del título</dt>
            <dd>
              {codigo ? codigo.texto : <span className="suave">no está en el catálogo de unidades</span>}
              {codigo && !codigo.confirmado ? (
                <span className="suave"> · sin confirmar contra la normativa</span>
              ) : null}
            </dd>
            {n.grupo ? <><dt>Grupo del documento</dt><dd>{n.grupo}</dd></> : null}
            {deQuienEs(n.edita) ? <><dt>Quién lo edita</dt><dd>{deQuienEs(n.edita)}</dd></> : null}
          </dl>
          {/* Exportar un módulo suelto se ofrece aquí y no en la barra: es donde
              se sabe de qué módulo se está hablando. El tomo completo, arriba. */}
          <div className="compartido-acciones">
            <a className="mini" href={`${base}/pdf${q}`} target="_blank" rel="noopener">PDF de este módulo</a>
            <a className="mini" href={`${base}/docx${q}`} download>Word de este módulo</a>
            <a className="mini" href={`/reparto/${encodeURIComponent(documentoId)}`}>Quién lleva este módulo</a>
          </div>
        </section>
        {listaHijos(n)}
      </>
    );
  };

  const vistaApartado = () => {
    // Mientras el contenido que hay no sea el de ESTE apartado, está cargando: lo
    // que hay es el del apartado anterior y pintarlo sería dárselo al editor, que
    // escribiría allí (ver `esDelNodo`). A partir de aquí, `apartado` es el suyo.
    if (cargandoApartado || (apartado && !esDelNodo(apartado))) {
      return <p className="suave">Cargando el apartado…</p>;
    }
    if (errorApartado) {
      return (
        <div className="nota nota-lock">
          <Candado />
          <div>{errorApartado.message}</div>
        </div>
      );
    }
    if (!apartado) return null;

    // Donde se puede escribir, el editor; donde no, lo mismo que antes: se ve en
    // lectura y con el motivo. La decisión es del servidor, y el `key` hace que
    // cambiar de apartado desmonte el editor, que es lo que manda lo que quede
    // pendiente antes de irse.
    if (apartado.puedeEditar) {
      return (
        <ApartadoEditable
          key={nodo.clave}
          documentoId={documentoId}
          apartado={apartado}
          onGuardado={alGuardar}
          contexto={contexto}
          onIr={irAApartado}
        />
      );
    }

    const campos = apartado.campos || [];
    const esSa = apartado.repetidor
      || campos.some((c) => c.tipo === TIPO_FICHA || c.tipo === TIPO_RESUMEN);
    const dePonderacion = campos.filter((c) => c.tipo === TIPO_PONDERACION);
    const restoDeCampos = campos.filter((c) => c.tipo !== TIPO_FICHA
      && c.tipo !== TIPO_RESUMEN && c.tipo !== TIPO_PONDERACION);

    return (
      <>
        <div className="nota nota-lock">
          <Candado />
          <div>
            {motivoBloqueo(nodo, rol)}
            {' '}
            <span className="suave">Se puede leer y exportar, pero no escribir.</span>
            {/* Si el candado es porque no se lleva el módulo, el arreglo está
                en el reparto: se dice dónde, en vez de dejar solo el «no». */}
            {nodo.edita === 'docentes_del_modulo' ? (
              <div className="ayuda">
                <a className="enlace" href={`/reparto/${encodeURIComponent(documentoId)}`}>
                  Ver quién lleva esta unidad
                </a>
                {' · '}lo reparte la jefatura del departamento
              </div>
            ) : null}
          </div>
        </div>
        {/* Sin permiso para escribir se sigue viendo lo mismo que antes, pero
            con los paneles del E4 en lectura: quien no lleva el módulo también
            necesita la tabla resumen calculada y la lista de situaciones, que es
            justo lo que el documento no trae al día. Lo que no hay son botones. */}
        {esSa ? (
          <Situaciones
            documentoId={documentoId}
            apartado={apartado}
            valores={apartado.valores}
            editable={false}
            onCambiar={() => {}}
            seccionRaCe={contexto ? contexto.raCe : null}
            hermano={contexto ? contexto.hermanoSa : null}
            onIr={irAApartado}
          />
        ) : null}
        {dePonderacion.map((campo) => (
          <Ponderaciones
            key={campo.id}
            valor={apartado.valores[campo.id]}
            etiqueta={campo.etiqueta || 'Ponderaciones'}
            editable={false}
          />
        ))}
        {apartado.repetidor ? null : (
          <Valores
            campos={restoDeCampos}
            valores={apartado.valores}
            compartidos={apartado.compartidos}
            titulo={apartado.titulo}
          />
        )}
      </>
    );
  };

  const contenido = () => {
    // El panel de comprobaciones y la coordinación son del DOCUMENTO entero, no
    // del apartado abierto, así que sustituyen al contenido y no se meten al
    // lado: lo que se está haciendo ahí es repasar lo que falta, no escribir. Y
    // desde las dos se salta al apartado que hay que mirar, con el mismo `onIr`.
    //
    // Y EL ESTADO DEL DOCUMENTO VA ENCIMA DE LAS COMPROBACIONES, no en otra
    // pantalla: quien decide aprobar está mirando justo esta lista —el
    // `puedeAprobarse` que la encabeza es la misma puerta que el servidor
    // comprueba al aprobar—, y cuando el rechazo llega con sus 45 errores
    // separados en tres grupos, los avisos de los que habla están debajo.
    if (vista === 'validaciones') {
      return (
        <>
          <EstadoDocumento documentoId={documentoId} onIr={irAApartado} />
          <Validaciones documentoId={documentoId} onIr={irAApartado} />
        </>
      );
    }
    if (vista === 'coordinacion') {
      return (
        <Coordinacion
          documentoId={documentoId}
          onIr={irAApartado}
          onComprobaciones={() => cambiarVista('validaciones')}
        />
      );
    }
    if (!nodo) return <p className="suave">Ese apartado no está en este documento.</p>;
    // La comparación con el curso anterior es de UN apartado, así que necesita el
    // nodo; en un nodo de paso lo dice y no pide nada al servidor.
    if (vista === 'cambios') {
      return (
        <Cambios
          documentoId={documentoId}
          documento={documento}
          nodo={nodo}
          apartado={apartadoAhora}
          onValidado={alValidado}
          onRecargar={recargarApartado}
        />
      );
    }
    // La tarjeta *Estructura* va debajo de todo lo que sea una sección de la
    // plantilla: un bloque, un apartado con contenido y uno que solo agrupa.
    // Como en el prototipo, no sale en la portada (no es una sección) ni en una
    // unidad (que no es un apartado).
    if (nodo.tipo === 'raiz') return vistaResumen(nodo);
    if (nodo.tipo === 'bloque') return <>{vistaResumen(nodo)}{tarjetaEstructura()}</>;
    if (nodo.tipo === 'unidad') return vistaUnidad(nodo);
    if (!nodo.contenido) return <>{listaHijos(nodo)}{tarjetaEstructura()}</>;
    return <>{vistaApartado()}{tarjetaEstructura()}</>;
  };

  const chips = () => {
    const lista = [];
    if (nodo && nodo.unidadId) {
      // De qué módulo es el apartado, con su código al lado. Un apartado de
      // módulo sin decir de qué módulo es se lee mal: los once comparten la
      // misma sección y el título del apartado es idéntico en todos. La unidad
      // se busca por su nodo en el árbol, que es el que lleva el título del
      // documento (y no el del catálogo, que puede ser el de otro curso).
      const unidad = entrada
        ? entrada.camino.find((n) => n.tipo === 'unidad')
        : null;
      if (unidad) lista.push(<span className="chip" key="u">{unidad.titulo}</span>);
      if (unidadDelNodo) {
        lista.push(
          <span className={'chip chip-cod' + (unidadDelNodo.confirmado ? '' : ' chip-vacio')} key="c">
            {unidadDelNodo.texto}
          </span>,
        );
      }
    }
    if (est.propio) {
      lista.push(<span className={'chip chip-' + est.propio} key="e">{NOMBRE_ESTADO[est.propio]}</span>);
    }
    // LA PROCEDENCIA VA AQUÍ, EN LA CABECERA DEL APARTADO, Y NO EN EL ÁRBOL
    //
    // El árbol dice si está hecho y bien, que es otra pregunta (punto 6 de
    // docs/mockup-v2/CAMBIOS.md). De dónde viene el apartado se necesita cuando
    // se está mirando ese apartado —para saber si hay que revisarlo— así que sale
    // aquí y en la vista *Cambios*, que es donde están las dos versiones.
    if (nodo && nodo.contenido && NOMBRE_ORIGEN[origenDelNodo]) {
      lista.push(
        <span className="chip chip-origen" key="o">{NOMBRE_ORIGEN[origenDelNodo]}</span>,
      );
    }
    if (nodo && deQuienEs(nodo.edita)) {
      lista.push(<span className="chip" key="q">{deQuienEs(nodo.edita)}</span>);
    }
    if (nodo && nodo.contenido && !nodo.puedeEditar) {
      lista.push(<span className="chip chip-lock" key="l">solo lectura</span>);
    }
    return lista;
  };

  return (
    <>
      <BarraSuperior
        subtitulo={corto(documento)}
        persona={yo}
        documentos={documentos}
        documentoId={documentoId}
        onCajon={() => setCajon((x) => !x)}
        exportar={{ pdf: `${base}/pdf`, docx: `${base}/docx` }}
        vistas={VISTAS}
        vista={vista}
        onVista={cambiarVista}
        // Dónde estás, para que el menú «Ir a» lo marque. El panel de
        // comprobaciones es una VISTA de esta misma pantalla, pero para quien
        // navega es un destino propio —es donde se aprueba—, así que cuenta como
        // tal.
        aqui={vista === 'validaciones' ? 'comprobaciones' : 'visor'}
      />

      <div className={'workspace' + (cajon ? ' cajon-abierto' : '')}>
        {/* El velo: por debajo de 900 px la barra lateral es un cajón, y se
            cierra tocando fuera o con Escape. En el v1 el árbol desaparecía por
            debajo de esa anchura y la navegación quedaba inalcanzable. */}
        <div className="velo" onClick={() => setCajon(false)} />

        <aside className="sidebar">
          <div className="buscador">
            <svg viewBox="0 0 24 24" className="ico" aria-hidden="true">
              <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <path d="m16.5 16.5 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <label className="sr" htmlFor="buscar">Buscar apartado</label>
            <input
              type="search"
              id="buscar"
              ref={buscador}
              value={busqueda}
              onChange={(ev) => setBusqueda(ev.target.value)}
              placeholder="Buscar apartado, módulo, materia…"
              autoComplete="off"
            />
            {busqueda ? (
              <button className="limpiar" onClick={() => setBusqueda('')} aria-label="Limpiar la búsqueda">×</button>
            ) : null}
          </div>

          <Arbol
            arbol={arbol}
            estados={estados}
            indice={indice}
            abiertos={abiertos}
            activa={nodo ? nodo.clave : documentoId}
            busqueda={busqueda}
            onIr={ir}
            onAlternar={alternar}
          />

          {/* EL PROGRESO CUENTA REVISIÓN, NO RELLENO (punto 7 de
              docs/mockup-v2/CAMBIOS.md). Mientras el árbol no mande `revision`
              —un servidor de antes del arrastre— se enseña el de relleno, que es
              lo que de verdad se sabe, y se dice que es ese. */}
          <div className="sidebar-pie">
            {revisadosAhora !== null ? (
              <>
                <div className="progreso-texto">
                  <span>Apartados revisados</span>
                  <strong>{revision.apartados ? Math.round((revisadosAhora / revision.apartados) * 100) : 0} %</strong>
                </div>
                <div className="barra">
                  <i style={{ width: (revision.apartados ? (revisadosAhora / revision.apartados) * 100 : 0) + '%' }} />
                </div>
                <span id="progreso-detalle">
                  {`${revisadosAhora} de ${revision.apartados} apartados revisados para este curso`}
                  {resumen ? ` · ${rellenosAhora} con contenido` : ''}
                </span>
                <span className="ayuda">
                  Cuenta lo que alguien ha mirado para este curso, no lo que tiene texto: un apartado
                  heredado del curso pasado está pendiente aunque esté lleno.
                </span>
              </>
            ) : (
              <>
                <div className="progreso-texto">
                  <span>Apartados con contenido</span>
                  <strong>{resumen && resumen.apartados ? Math.round((rellenosAhora / resumen.apartados) * 100) : 0} %</strong>
                </div>
                <div className="barra">
                  <i style={{ width: (resumen && resumen.apartados ? (rellenosAhora / resumen.apartados) * 100 : 0) + '%' }} />
                </div>
                <span id="progreso-detalle">
                  {resumen ? `${rellenosAhora} de ${resumen.apartados} apartados escritos` : ''}
                </span>
              </>
            )}
            {/* La leyenda lleva los cuatro estados que se saben. «Con errores»
                sigue fuera: sale de cruzar los avisos del panel de validaciones
                con cada nodo, y /arbol no los manda. Un ! que no aparece cuando
                hay un error es peor que no tener !. */}
            <ul className="leyenda">
              <li><i className="glifo glifo-validado" aria-hidden="true">✓</i> revisado</li>
              <li><i className="glifo glifo-completo" aria-hidden="true" /> con contenido</li>
              <li><i className="glifo glifo-incompleto" aria-hidden="true" /> incompleto</li>
              <li><i className="glifo glifo-vacio" aria-hidden="true" /> vacío</li>
            </ul>
            <span className="ayuda">
              El punto dice si el apartado está hecho y bien. De dónde viene —si es del curso
              pasado— lo dice la cabecera del apartado y la vista Cambios.
            </span>
          </div>
        </aside>

        <main className="main">
          {migas()}

          <div className="cabecera">
            <div>
              <h1>
                {esDelDocumento(vista)
                  ? TITULO_VISTA[vista]
                  : (nodo ? ((nodo.num ? nodo.num + '. ' : '') + nodo.titulo) : corto(documento))}
              </h1>
              <div className="chips">{esDelDocumento(vista) ? null : chips()}</div>
            </div>
            {/* «Validar este apartado» también en la cabecera, como en el
                prototipo: se da por bueno desde donde se está leyendo, sin tener
                que pasar por la comparación. Solo aparece en lo heredado sin
                mirar, y solo si el servidor dijo que se puede editar. */}
            {esDelDocumento(vista) ? null : (
              <div className="cabecera-derecha">
                {/* `key` por apartado: si no, al cambiar de apartado el botón se
                    queda con el estado del anterior y podría enseñar el error de
                    otro apartado. */}
                <BotonValidar
                  key={nodo ? nodo.clave : 'sin-nodo'}
                  documentoId={documentoId}
                  nodo={nodo}
                  apartado={apartadoAhora}
                  onValidado={alValidado}
                  onRecargar={recargarApartado}
                />
              </div>
            )}
          </div>

          {/* LA REJILLA DE DOS COLUMNAS SE ENCIENDE CON EL PANEL DERECHO.
              El prototipo reserva 310 px a la derecha, y con el E7 hay algo que
              ponerlos: el hilo de comentarios del apartado. Donde no hay panel
              —la portada, una unidad, las dos vistas del documento entero— el
              apartado sigue ocupando el ancho entero, porque una columna vacía a
              la derecha es peor que no tenerla. Por debajo de 1150 px la hoja ya
              pasa la rejilla a una sola columna y el panel cae debajo. */}
          <div className={hayPanel ? 'rejilla' : undefined}>
            <section className="contenido">
              {/* Lo que acaba de pasar con la estructura, dicho donde se aterriza:
                  al retirar un apartado la pantalla se va a su padre, y el aviso
                  tiene que viajar con ella. `role="status"` para que también se
                  oiga. */}
              {avisoEstructura ? (
                <div className="nota" role="status">
                  <div>{avisoEstructura}</div>
                </div>
              ) : null}
              {contenido()}
            </section>

            {hayPanel ? (
              <aside className="panel" aria-label="Comentarios del apartado">
                {/* `key` por apartado: al cambiar de apartado se monta otro hilo,
                    y así el campo no se queda con el borrador del anterior ni se
                    ve un instante la conversación de al lado. */}
                <Comentarios
                  key={`comentarios-${nodo.clave}`}
                  documentoId={documentoId}
                  seccion={nodo.seccion}
                  unidadId={nodo.unidadId || null}
                  persona={yo}
                />
              </aside>
            ) : null}
          </div>

          {/* Anterior y siguiente recorren el documento en el orden en que se
              imprime, que es como se revisa: apartado por apartado y módulo por
              módulo, sin ir buscando en el árbol dónde te habías quedado. */}
          <footer className="pie">
            <button onClick={() => mover(-1)} disabled={posicion <= 0}>← Anterior</button>
            <span id="pie-info">
              {posicion >= 0 ? `${posicion + 1} de ${lineal.length} en el recorrido` : 'portada del documento'}
            </span>
            <button onClick={() => mover(1)} disabled={posicion >= 0 && posicion >= lineal.length - 1}>
              Siguiente →
            </button>
          </footer>
        </main>
      </div>
    </>
  );
}
