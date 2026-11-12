// El reparto de unidades: `/reparto/<documentoId>`.
//
// LA PREGUNTA NO ES «QUÉ LLEVA ANA», ES «QUÉ MÓDULO NO TIENE A NADIE»
//
// Una unidad sin docentes no la puede editar nadie salvo la jefatura
// (core/permisos.js), y el importador crea cada módulo con la lista vacía: recién
// importada una programación, nadie puede tocar ningún módulo. Esta pantalla es
// lo que lo cierra, y es la que desbloquea el E3.
//
// Por eso lo primero que se ve es el recuento de unidades sin nadie, y por eso
// viene ya contado de la API (`resumen.sinDocentes`): así el número no puede
// discrepar de la lista que se está mirando. «Qué lleva Pau» se ve mirando la
// matriz; «qué módulo no puede tocar nadie», no.
//
// POR QUÉ UNA TABLA Y NO UN MURO DE CASILLAS
//
// Es el punto 17 de docs/mockup-v2/CAMBIOS.md: con once módulos y cinco personas,
// una lista de casillas por persona esconde justamente lo que hay que mirar. La
// matriz es unidades × personas, agrupada, con filtro por texto y una casilla de
// «solo las que no tiene nadie».
//
// SE GUARDA LA LISTA COMPLETA, NO «AÑADE A ESTE»
//
// Cada casilla manda `PUT .../docentes` con **toda** la lista de quién lleva esa
// unidad. Con operaciones incrementales, dos jefaturas repartiendo a la vez
// acaban con un reparto que no quiso ninguna de las dos y que nadie ve raro al
// mirarlo (docs/api.md). Y si el servidor contesta 400 porque alguien de la
// lista no vale, **no se ha guardado nada, ni las personas buenas**: eso se dice
// en la pantalla, porque si no se diría que «ha fallado» y se daría por hecho que
// lo demás sí entró.
//
// QUIÉN REPARTE
//
// La jefatura del departamento y el soporte (`core/permisos.js` →
// `puedeRepartirUnidades`). La API manda `puedeRepartir` solo para pintar: quien
// decide es el PUT. Ver el reparto puede cualquiera que vea el documento, porque
// un docente necesita saber quién más lleva su módulo.
//
// ACCESIBILIDAD DE UNA MATRIZ GRANDE
//
//   - cada casilla está asociada DE VERDAD a su fila y a su columna, con
//     `scope` y con `headers`, y además lleva su propio nombre accesible
//     («Bases de datos · Lucía M.»): una rejilla de casillas sin encabezados
//     asociados es ilegible sin ver;
//   - se recorre con el tabulador y también con las flechas, que en una casilla
//     no hacen nada propio y aquí mueven por la matriz;
//   - cuando no se puede repartir, las casillas NO se desactivan: se marcan con
//     `aria-disabled` y se dejan enfocables, con el motivo asociado por
//     `aria-describedby`. Una casilla desactivada se la salta el tabulador, y
//     entonces quien navega con teclado no puede llegar a ella para enterarse de
//     por qué no se puede marcar;
//   - «no la lleva nadie» no se dice solo con el color de la fila: lleva su chip
//     con la palabra «nadie».

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Ayuda from './Ayuda';
import ApartadosComunes from './ApartadosComunes';
import BarraSuperior from './BarraSuperior';
import { pedir } from './api';
import { useSesion } from './sesion-cliente';
import { codigoDeUnidad, NOMBRE_TIPO, ROLES } from './etiquetas';

// Los ids del catálogo y del censo valen como id de HTML casi siempre, pero no
// hay ninguna garantía: un id con un punto o un espacio dentro rompería el
// `headers` que asocia la casilla con sus encabezados, que es justo la parte que
// no se puede perder.
const idSeguro = (valor) => String(valor).replace(/[^A-Za-z0-9_-]/g, '-');

const MOTIVO_NO_REPARTE = 'motivo-no-reparte';

const corto = (d) => (d ? [
  NOMBRE_TIPO[d.tipo] || d.tipo,
  d.ciclo ? String(d.ciclo).toUpperCase() : null,
  d.curso,
].filter(Boolean).join(' · ') : null);

export default function Reparto({ documentoId }) {
  const { persona: yo, cargando: cargandoSesion } = useSesion();

  const [datos, setDatos] = useState(null);
  const [documento, setDocumento] = useState(null);
  const [error, setError] = useState(null);

  const [filtro, setFiltro] = useState('');
  const [soloSin, setSoloSin] = useState(false);
  const [guardando, setGuardando] = useState(null);
  const [resultado, setResultado] = useState(null);
  // Las unidades que se acaban de guardar siguen a la vista aunque dejen de
  // cumplir el filtro «solo las que no tiene nadie». Si desaparecieran al
  // marcarlas, el foco del teclado se iría al limbo justo al terminar de usar la
  // casilla, y además no se vería lo que acaba de hacerse.
  const [recientes, setRecientes] = useState(() => new Set());

  const tabla = useRef(null);

  const cargar = useCallback(() => pedir(`/api/documentos/${encodeURIComponent(documentoId)}/unidades`)
    .then((r) => { setDatos(r); setError(null); })
    .catch((e) => { setError(e); setDatos(null); }), [documentoId]);

  useEffect(() => {
    cargar();
    pedir(`/api/documentos/${encodeURIComponent(documentoId)}`)
      .then((r) => setDocumento(r.documento || null))
      // El título es un adorno: si falla, el reparto se puede repartir igual.
      .catch(() => setDocumento(null));
  }, [cargar, documentoId]);

  const personas = (datos && datos.personas) || [];
  const unidades = (datos && datos.unidades) || [];
  const puedeRepartir = !!(datos && datos.puedeRepartir);
  // El PCCF y la memoria no se reparten por módulos: solo tienen apartados comunes.
  const sinUnidades = !!datos && unidades.length === 0;

  // Cuántas unidades lleva cada persona: sobre TODAS las unidades, no sobre las
  // que deja ver el filtro. El recuento de la columna responde «cuánta carga
  // tiene», y con el filtro puesto daría un número que no es el de nadie.
  const cuentas = useMemo(() => {
    const m = new Map();
    for (const u of unidades) for (const id of u.docentes || []) m.set(id, (m.get(id) || 0) + 1);
    return m;
  }, [unidades]);

  const texto = filtro.trim().toLowerCase();
  const cuela = (u) => {
    if (soloSin && !u.sinDocentes && !recientes.has(u.unidadId)) return false;
    if (!texto) return true;
    const cod = codigoDeUnidad(u.unidadId);
    return `${u.titulo || ''} ${u.unidadId} ${cod ? cod.texto : ''}`.toLowerCase().includes(texto);
  };

  // Agrupadas por el grupo que trajo el importador («Módulos del primer curso»…),
  // en el orden en que vienen: es el del documento.
  const grupos = useMemo(() => {
    const orden = [];
    const porGrupo = new Map();
    for (const u of unidades) {
      if (!cuela(u)) continue;
      const g = u.grupo || 'Unidades';
      if (!porGrupo.has(g)) { porGrupo.set(g, []); orden.push(g); }
      porGrupo.get(g).push(u);
    }
    return orden.map((g) => ({ etq: g, unidades: porGrupo.get(g) }));
  // `cuela` depende de filtro/soloSin/recientes, que son justo lo que se mira.
  }, [unidades, texto, soloSin, recientes]);

  const visibles = grupos.reduce((n, g) => n + g.unidades.length, 0);

  // ---------------------------------------------------------------- guardar

  async function alternar(unidad, personaId, marcar) {
    const actuales = unidad.docentes || [];
    const docentes = marcar
      ? actuales.concat([personaId])
      : actuales.filter((id) => id !== personaId);

    setGuardando(unidad.unidadId);
    setResultado(null);
    const quien = personas.find((p) => p._id === personaId);
    try {
      const r = await pedir(
        `/api/documentos/${encodeURIComponent(documentoId)}/unidades/${encodeURIComponent(unidad.unidadId)}/docentes`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          // La lista completa, aunque quede vacía: la API no acepta «quita a
          // este», y es a propósito (docs/api.md).
          body: JSON.stringify({ docentes }),
        },
      );
      setRecientes((s) => new Set(s).add(unidad.unidadId));
      // Se vuelve a pedir el reparto entero en lugar de parchear la fila: así el
      // recuento de «sin nadie» que se enseña arriba sigue siendo el que ha
      // contado el servidor y no uno que hemos calculado nosotros.
      await cargar();
      setResultado({
        unidadId: unidad.unidadId,
        tipo: 'ok',
        // Sin punto final: hay nombres que ya acaban en punto («Lucía M.») y el
        // aviso salía con dos.
        texto: `${unidad.titulo}: ${marcar ? 'añadida' : 'quitada'} ${quien ? quien.nombre : 'la persona'}`
          + (r && r.sinDocentes ? ' · ahora no la lleva nadie' : ''),
      });
    } catch (e) {
      // 400 con `invalidos`: no se ha guardado NADA, ni las personas válidas de
      // la lista. Decirlo importa: si no, se supone que ha entrado lo bueno.
      const nombres = Array.isArray(e.invalidos)
        ? e.invalidos.map((id) => {
          const p = personas.find((x) => x._id === id);
          return p ? p.nombre : id;
        })
        : [];
      await cargar();
      setResultado({
        unidadId: unidad.unidadId,
        tipo: 'mal',
        texto: e.message,
        nada: nombres.length > 0 || e.estado === 400,
        invalidos: nombres,
      });
    } finally {
      setGuardando(null);
    }
  }

  // ---------------------------------------------------------------- teclado

  // Las flechas mueven por la matriz. En una casilla no hacen nada propio —la
  // marca el espacio—, así que no se le quita ningún atajo a nadie, y el
  // tabulador sigue funcionando igual para quien lo prefiera.
  const flechas = (ev) => {
    const origen = ev.target;
    if (!origen || !origen.dataset || origen.dataset.fila === undefined) return;
    const paso = {
      ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0],
    }[ev.key];
    if (!paso) return;
    const fila = Number(origen.dataset.fila) + paso[0];
    const col = Number(origen.dataset.col) + paso[1];
    const destino = tabla.current
      && tabla.current.querySelector(`input[data-fila="${fila}"][data-col="${col}"]`);
    if (destino) { ev.preventDefault(); destino.focus(); }
  };

  // ---------------------------------------------------------------- pantalla

  const sinSesion = !cargandoSesion && !yo;
  const resumen = (datos && datos.resumen) || null;

  if (error) {
    return (
      <>
        {/* Sin `documentoId`: este documento no se ha podido abrir —no existe, o
            es de otro departamento—, así que el menú no debe ofrecer sus
            pantallas. Lo que queda es volver a la lista. */}
        <BarraSuperior subtitulo="Reparto de unidades" persona={yo} aqui="reparto" />
        <main id="contenido" tabIndex={-1} className="main main-estrecha">
          <div className="cabecera"><div><h1>No se puede ver el reparto</h1></div></div>
          <div className="nota nota-lock" role="alert">
            <div>
              {error.message}
              {error.codigo === 'sin_identificar' ? (
                <p className="suave">
                  Hace falta estar dentro. <a className="enlace" href="/acceso">Cómo se entra</a>.
                </p>
              ) : null}
              {error.codigo === 'no_encontrado' ? (
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

  return (
    <>
      <BarraSuperior subtitulo={corto(documento) || 'Reparto de unidades'} persona={yo} documentoId={documentoId} aqui="reparto" />

      <main id="contenido" tabIndex={-1} className="main">
        <div className="cabecera">
          <div>
            <h1>{sinUnidades ? 'Quién lleva cada apartado' : 'Quién lleva cada unidad'}</h1>
            <p className="suave">
              {corto(documento) ? <>{corto(documento)}. </> : null}
              {sinUnidades
                ? 'Este documento no se reparte por unidades: lo lleva la jefatura del departamento, salvo los apartados que delegue.'
                : 'Una unidad sin docentes no la puede editar nadie salvo la jefatura del departamento: eso es lo que hay que mirar aquí.'}
            </p>
          </div>
          <div className="cabecera-derecha">
            <a className="btn-ghost" href={`/doc/${encodeURIComponent(documentoId)}`}>Abrir el documento</a>
          </div>
        </div>

        {sinSesion ? (
          <div className="nota nota-lock" role="alert">
            <div>
              <strong>No hay sesión en este navegador.</strong>{' '}
              <a className="enlace" href="/acceso">Cómo se entra</a>.
            </div>
          </div>
        ) : null}

        {datos === null && !error ? <p className="suave">Cargando el reparto…</p> : null}

        {resumen && !sinUnidades ? (
          <div className="metricas">
            {/* El número que se mira. Viene contado de la API a propósito. */}
            <div className="metrica">
              <b className={resumen.sinDocentes ? 'rojo' : 'bien'}>{resumen.sinDocentes}</b>
              <span>{resumen.sinDocentes === 1 ? 'unidad sin nadie' : 'unidades sin nadie'}</span>
            </div>
            <div className="metrica"><b>{resumen.unidades}</b><span>unidades</span></div>
            <div className="metrica"><b>{personas.length}</b><span>personas que dan clase</span></div>
          </div>
        ) : null}

        {/* El dato y lo que acarrea, en una línea. Por qué pasa —el Word no
            dice quién da cada módulo— está en la ayuda de la tabla: es siempre
            igual y no hace falta tenerlo delante cada vez. */}
        {resumen && resumen.sinDocentes ? (
          <div className="nota nota-lock">
            <div>
              <strong>
                {resumen.sinDocentes === 1
                  ? 'Hay una unidad que no lleva nadie.'
                  : `Hay ${resumen.sinDocentes} unidades que no lleva nadie.`}
              </strong>{' '}
              Sus apartados solo los puede editar la jefatura del departamento.
            </div>
          </div>
        ) : null}

        {/* Este bloque es el `aria-describedby` de cada casilla apagada, así que
            lo que diga se lee en cada una: cuanto más corto, mejor. Quién
            reparte y por qué está en la ayuda de la tabla. */}
        {datos && !sinUnidades && !puedeRepartir ? (
          <div className="nota" id={MOTIVO_NO_REPARTE}>
            <div>
              <strong>Puedes ver el reparto, pero no cambiarlo.</strong>{' '}
              Reparten las unidades la jefatura del departamento y el soporte.
              {yo ? <> Tu rol es {ROLES[yo.rol] || yo.rol}.</> : null}
            </div>
          </div>
        ) : null}

        {/* Aquí no hay tabla y por tanto no hay ayuda plegada donde meter el
            porqué: este bloque es todo lo que se ve, así que lleva el dato, la
            regla y la salida, en dos líneas. */}
        {datos && !sinUnidades && personas.length === 0 ? (
          <div className="nota nota-lock">
            <div>
              <strong>No hay nadie a quien asignar unidades.</strong>{' '}
              Solo pueden llevar una unidad las personas activas del departamento que dan clase.{' '}
              <a className="enlace" href="/personas">Dar de alta a alguien</a>.
            </div>
          </div>
        ) : null}

        {datos && !sinUnidades && personas.length ? (
          <section className="tarjeta">
            <header className="tarjeta-cab">
              <h2>Unidades × personas</h2>
              <span className="suave">
                {visibles === unidades.length
                  ? `${unidades.length} ${unidades.length === 1 ? 'unidad' : 'unidades'}`
                  : `${visibles} de ${unidades.length} unidades`}
              </span>

              {/* Cómo funciona el reparto —que se manda la lista entera, y por
                  qué la jefatura es columna— no cambia nunca y una vez se sabe
                  no hace falta. Lo que sí se queda abajo, a la vista, es qué es
                  el número de cada columna, que es un dato de la tabla. */}
              <Ayuda sobre="cómo funciona el reparto">
                <p>
                  Al marcar o desmarcar <strong>se manda la lista completa</strong> de quién lleva
                  esa unidad, no «añade a este»: así dos jefaturas repartiendo a la vez no acaban
                  con un reparto que no quiso ninguna de las dos.
                </p>
                <p>
                  Son columna las personas <strong>activas del departamento del documento que dan
                  clase</strong>: docentes y jefatura de departamento. La jefatura de departamento
                  también, porque también da clase.
                </p>
                <p>
                  Repartir lo hacen la jefatura del departamento y el soporte, que es quien reparte
                  la carga. La jefatura de estudios ve todos los departamentos pero no edita nada, y
                  un docente edita sus módulos pero no se los asigna.
                </p>
                <p>
                  Una unidad que no lleva nadie no es un fallo de la herramienta: recién importado
                  un documento le pasa a todas, porque el Word no dice quién da cada módulo.
                </p>
              </Ayuda>
            </header>

            <div className="filtros">
              <label htmlFor="filtro-reparto">
                Filtrar
                <input
                  id="filtro-reparto"
                  type="search"
                  value={filtro}
                  onChange={(ev) => setFiltro(ev.target.value)}
                  placeholder="módulo o código"
                  autoComplete="off"
                />
              </label>
              <label htmlFor="solo-sin">
                <input
                  id="solo-sin"
                  type="checkbox"
                  checked={soloSin}
                  onChange={(ev) => { setSoloSin(ev.target.checked); setRecientes(new Set()); }}
                />
                solo las que no tiene nadie
              </label>
            </div>

            {/* LA REGIÓN QUE ANUNCIA EXISTE SIEMPRE, AUNQUE ESTÉ VACÍA.
                Un `aria-live` que aparece a la vez que su texto no se anuncia de
                forma fiable: el lector de pantalla tiene que haber visto la
                región antes de que cambie. Así que esta se pinta siempre —vacía
                y solo para lectores— y la caja de abajo es únicamente lo que se
                ve. Con una matriz importa: marcar una casilla no cambia nada más
                en la pantalla. */}
            <div className="sr" role="status" aria-live="polite">
              {resultado ? resultado.texto : ''}
            </div>

            {resultado ? (
              <div className={resultado.tipo === 'mal' ? 'nota nota-lock' : 'nota'}>
                <div>
                  {resultado.texto}
                  {resultado.tipo === 'mal' && resultado.nada ? (
                    <p className="suave" style={{ margin: '4px 0 0' }}>
                      <strong>Tampoco se han guardado las personas que sí valían</strong>: el
                      reparto se manda entero y se valida antes de escribir, así que o entra
                      completo o no entra nada. La fila ha vuelto a como estaba.
                      {resultado.invalidos && resultado.invalidos.length ? (
                        <> No valían: {resultado.invalidos.join(', ')}.</>
                      ) : null}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}

            {visibles === 0 ? (
              <p className="vacio-apartado">Ninguna unidad coincide con el filtro.</p>
            ) : (
              <div className="tabla-marco">
                <table className="asig-tabla" ref={tabla} onKeyDown={flechas}>
                  <caption className="sr">
                    Reparto de unidades: cada fila es una unidad y cada columna una persona. Marca
                    la casilla para que esa persona lleve esa unidad. Se puede recorrer con el
                    tabulador o con las flechas.
                  </caption>
                  <thead>
                    <tr>
                      <th className="asig-esquina" scope="col">Unidad</th>
                      {personas.map((p) => (
                        <th className="asig-persona" scope="col" id={`col-${idSeguro(p._id)}`} key={p._id}>
                          <span>{p.nombre}</span>
                          <span className="suave">
                            {p.rol === 'jefe_departamento' ? 'jefatura' : 'docente'}
                          </span>
                          <span className="asig-cuenta">
                            {cuentas.get(p._id) || 0}
                            <span className="sr"> unidades</span>
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>

                  {grupos.map((g, ig) => {
                    // Un `<tbody>` por grupo, con su encabezado de grupo de
                    // filas: `scope="rowgroup"` es lo que lo asocia de verdad a
                    // las filas que vienen debajo.
                    const idGrupo = `grp-${ig}`;
                    return (
                      <tbody key={g.etq}>
                        <tr className="asig-seccion">
                          <th colSpan={personas.length + 1} scope="rowgroup" id={idGrupo}>
                            {g.etq}
                            <span className="suave">
                              {' · '}
                              {g.unidades.length}
                              {g.unidades.length === 1 ? ' unidad' : ' unidades'}
                            </span>
                          </th>
                        </tr>

                        {g.unidades.map((u) => {
                          const cod = codigoDeUnidad(u.unidadId);
                          const idFila = `fil-${idSeguro(u.unidadId)}`;
                          // El índice de fila es continuo entre grupos: las
                          // flechas arriba y abajo tienen que cruzar de un grupo
                          // al siguiente, que es lo que hace un lector al mirar.
                          const fila = grupos.slice(0, ig).reduce((n, x) => n + x.unidades.length, 0)
                            + g.unidades.indexOf(u);
                          return (
                            <tr key={u.unidadId} className={u.sinDocentes ? 'asig-sin-nadie' : ''}>
                              <th scope="row" id={idFila} headers={idGrupo}>
                                <span className="asig-titulo">{u.titulo}</span>
                                {cod ? (
                                  <span className={'chip chip-cod' + (cod.confirmado ? '' : ' chip-vacio')}>
                                    {cod.texto}
                                  </span>
                                ) : null}
                                {/* El estado no se dice solo con el color de la
                                    fila: lleva la palabra. */}
                                {u.sinDocentes ? <span className="chip chip-error">nadie</span> : null}
                                {guardando === u.unidadId ? <span className="chip">guardando…</span> : null}
                              </th>

                              {personas.map((p, ip) => {
                                const marcada = (u.docentes || []).includes(p._id);
                                return (
                                  <td
                                    className="asig-celda"
                                    key={p._id}
                                    headers={`${idGrupo} ${idFila} col-${idSeguro(p._id)}`}
                                  >
                                    <label className="asig-casilla">
                                      <input
                                        type="checkbox"
                                        checked={marcada}
                                        data-fila={fila}
                                        data-col={ip}
                                        aria-label={`${u.titulo} · ${p.nombre}`}
                                        aria-disabled={puedeRepartir ? undefined : 'true'}
                                        aria-describedby={puedeRepartir ? undefined : MOTIVO_NO_REPARTE}
                                        title={puedeRepartir
                                          ? undefined
                                          : 'Solo la jefatura del departamento y el soporte reparten las unidades.'}
                                        onChange={(ev) => {
                                          // Sin permiso no se desactiva la
                                          // casilla —se la saltaría el
                                          // tabulador—: se ignora el cambio y
                                          // React la devuelve a su sitio.
                                          if (!puedeRepartir) { ev.preventDefault(); return; }
                                          alternar(u, p._id, ev.target.checked);
                                        }}
                                      />
                                      <span aria-hidden="true" />
                                    </label>
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    );
                  })}
                </table>
              </div>
            )}

            {/* Qué es el número de la cabecera de cada columna: es el dato que
                se mira al repartir y sorprende cada vez, así que se queda. */}
            <p className="ayuda">
              El número de cada columna es cuántas unidades lleva esa persona en este documento.
            </p>
          </section>
        ) : null}

        {/* Los apartados comunes y lo que puede editar cada cual: otra pregunta, otra ruta. */}
        {datos ? <ApartadosComunes documentoId={documentoId} /> : null}
      </main>
    </>
  );
}
