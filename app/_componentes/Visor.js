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
import Valores from './Valores';
import { pedir } from './api';
import { abiertosHasta, estados as calcularEstados, indexar } from './arbol-cliente';
import { useSesion } from './sesion-cliente';
import {
  GLIFO, NOMBRE_ESTADO, NOMBRE_ESTADO_DOC, NOMBRE_TIPO, codigoDeUnidad, deQuienEs, motivoBloqueo,
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

export default function Visor({ documentoId, seccionInicial, unidadInicial }) {
  const [seccion, setSeccion] = useState(seccionInicial || null);
  const [unidadId, setUnidadId] = useState(unidadInicial || null);

  const [documento, setDocumento] = useState(null);
  const [arbol, setArbol] = useState(null);
  const [resumen, setResumen] = useState(null);
  const [documentos, setDocumentos] = useState([]);
  const [errorCarga, setErrorCarga] = useState(null);

  const [apartado, setApartado] = useState(null);
  const [cargandoApartado, setCargandoApartado] = useState(false);
  const [errorApartado, setErrorApartado] = useState(null);

  // Los apartados que se han escrito en esta sesión. `relleno` lo calculó el
  // servidor al mandar el árbol, así que sin esto el icono de un apartado recién
  // escrito seguiría diciendo «vacío» hasta recargar. Se corrige el nodo en
  // lugar de volver a pedir el árbol —250 apartados— en cada autoguardado.
  const [rellenos, setRellenos] = useState(() => new Map());

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
      } catch (e) {
        if (vivo) setErrorCarga(e);
      }
      try {
        const ds = await pedir('/api/documentos');
        if (!vivo) return;
        setDocumentos((ds.documentos || []).map((d) => ({ ...d, corto: corto(d) })));
      } catch (e) { /* el visor se puede usar sin el desplegable de documentos */ }
    })();
    return () => { vivo = false; };
  }, [documentoId]);

  // ---------------------------------------------------------------- índice y estados

  const { indice, lineal } = useMemo(
    () => (arbol ? indexar(arbol) : { indice: new Map(), lineal: [] }),
    [arbol],
  );
  const estados = useMemo(
    () => (arbol ? calcularEstados(arbol, rellenos) : new Map()),
    [arbol, rellenos],
  );

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

  const escribirRuta = useCallback((sec, uni, reemplazar) => {
    const partes = ['/doc', encodeURIComponent(documentoId)];
    if (sec) partes.push(sec.split('/').map(encodeURIComponent).join('/'));
    const url = partes.join('/') + (uni ? '?u=' + encodeURIComponent(uni) : '');
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
      setSeccion(sec);
      setUnidadId(new URLSearchParams(window.location.search).get('u') || null);
    };
    window.addEventListener('popstate', volver);
    return () => window.removeEventListener('popstate', volver);
  }, []);

  const ir = useCallback((k) => {
    const e = indice.get(k);
    if (!e) return;
    setSeccion(e.nodo.seccion);
    setUnidadId(e.nodo.unidadId);
    setAbiertos((previos) => {
      const siguiente = new Set(previos);
      for (const c of abiertosHasta(indice, k)) siguiente.add(c);
      return siguiente;
    });
    escribirRuta(e.nodo.seccion, e.nodo.unidadId, false);
    setCajon(false);
  }, [indice, escribirRuta]);

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
  }, [documentoId, nodo]);

  // ---------------------------------------------------------------- lo que se escribe

  // Lo llama el editor después de cada autoguardado correcto. Tiene que ser
  // estable: ApartadoEditable la mete dentro de su función de guardar, y una
  // función nueva en cada repintado haría que el efecto de limpieza se
  // ejecutara —es decir, que mandara el apartado— en medio de una tecleada.
  const alGuardar = useCallback(({ relleno }) => {
    const k = nodo ? nodo.clave : null;
    if (!k) return;
    setRellenos((previos) => {
      if (previos.get(k) === relleno) return previos;
      const siguiente = new Map(previos);
      siguiente.set(k, relleno);
      return siguiente;
    });
  }, [nodo]);

  // El progreso de la barra lateral, con las correcciones de esta sesión: el
  // resumen lo calculó el servidor con el árbol de entonces.
  const rellenosAhora = useMemo(() => {
    if (!resumen) return 0;
    let n = resumen.rellenos;
    for (const [k, v] of rellenos) {
      const e = indice.get(k);
      if (!e || !e.nodo.contenido) continue;
      if (v && !e.nodo.relleno) n += 1;
      else if (!v && e.nodo.relleno) n -= 1;
    }
    return n;
  }, [resumen, rellenos, indice]);

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
  const unidadDelNodo = nodo && nodo.unidadId ? codigoDeUnidad(nodo.unidadId) : null;
  const base = `/api/documentos/${encodeURIComponent(documentoId)}`;

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
          <Metrica valor={resumen ? rellenosAhora : '—'} etq="con contenido" />
          <Metrica
            valor={resumen ? resumen.apartados - rellenosAhora : '—'}
            etq="vacíos"
            clase={resumen && resumen.apartados - rellenosAhora ? 'ambar' : ''}
          />
          <Metrica valor={resumen ? resumen.unidades : '—'} etq="unidades" />
        </div>
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
        </div>
      </section>
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
    if (cargandoApartado) return <p className="suave">Cargando el apartado…</p>;
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
        />
      );
    }

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
        <Valores
          campos={apartado.campos}
          valores={apartado.valores}
          compartidos={apartado.compartidos}
          repetidor={apartado.repetidor}
          titulo={apartado.titulo}
        />
      </>
    );
  };

  const contenido = () => {
    if (!nodo) return <p className="suave">Ese apartado no está en este documento.</p>;
    if (nodo.tipo === 'raiz' || nodo.tipo === 'bloque') return vistaResumen(nodo);
    if (nodo.tipo === 'unidad') return vistaUnidad(nodo);
    if (!nodo.contenido) return listaHijos(nodo);
    return vistaApartado();
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

          <div className="sidebar-pie">
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
            {/* La leyenda solo lleva los tres estados que el E1 sabe: «validado»
                necesita el arrastre entre cursos (E5) y «con errores», el panel
                de validaciones (E4). Un ✓ que no quiere decir que lo haya
                revisado alguien es peor que no tener ✓. */}
            <ul className="leyenda">
              <li><i className="glifo glifo-completo" aria-hidden="true" /> con contenido</li>
              <li><i className="glifo glifo-incompleto" aria-hidden="true" /> incompleto</li>
              <li><i className="glifo glifo-vacio" aria-hidden="true" /> vacío</li>
            </ul>
            <span className="ayuda">
              Validado y con errores llegan con las validaciones y el arrastre entre cursos.
            </span>
          </div>
        </aside>

        <main className="main">
          {migas()}

          <div className="cabecera">
            <div>
              <h1>{nodo ? ((nodo.num ? nodo.num + '. ' : '') + nodo.titulo) : corto(documento)}</h1>
              <div className="chips">{chips()}</div>
            </div>
          </div>

          {/* Sin `.rejilla`: la rejilla de dos columnas del prototipo reserva
              310 px para el panel de comprobaciones y comentarios, que son el E4
              y el E7. Con una sola columna el apartado ocupa el ancho entero. */}
          <section className="contenido">{contenido()}</section>

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
