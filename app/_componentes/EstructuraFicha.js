// La tabla de la ficha de situación de aprendizaje, editable sobre la tabla misma. Va dentro de la
// tarjeta *Estructura* (Estructura.js), con su mismo permiso, su misma versión de la plantilla y su
// mismo 409, y solo en un apartado que tiene un campo de fichas.
//
// QUÉ SE VE. La ficha vacía: las filas de etiqueta con su texto y las de contenido en blanco, montada
// con la misma función que imprime el PDF (core/sa.js, `filasDeFicha`), así que lo que se ve aquí es la
// forma que tendrá en el papel. Con el aspecto del editor de tablas (EditorTablas.js).
//
// UN GESTO, UNA OPERACIÓN. Pulsar una etiqueta la renombra; ▲ y ▼ la mueven; ✕ la retira; «Añadir
// fila» la crea en el sitio elegido; «Restaurar» devuelve una retirada. Cada gesto manda su operación
// (core/ficha-estructura.js, `peticionDeGesto`) y nada más. NO se infiere la operación comparando la
// tabla de antes con la de después: lo escrito en las fichas se guarda por el id de la fila, y
// adivinarlo por el texto dejaría huérfano lo de cientos de fichas. El id sale de la clave `campo` de
// la celda de etiqueta; una celda que no la trae no ofrece ningún gesto y la pantalla lo dice.
//
// EL INFORME. Después de cada cambio, en `role="status"` lo que ha pasado y en `role="alert"` lo que
// deja de imprimirse, nombrándolo (core/ficha-estructura.js). Retirar no borra, pero deja de imprimirse
// y eso no se ve: por eso dice en cuántas fichas había texto escrito detrás.
//
// LO INCÓMODO, A LA VISTA. Una ficha que conserva la tabla tal como vino del Word imprime esa tabla, no
// la estructura. Mientras sea así, cambiar la estructura no cambia esa ficha. La pantalla lo dice con el
// número de fichas del módulo que se está mirando, y no lo calla ni insinúa lo contrario.
//
// EL FOCO. Tras subir o bajar vuelve al mismo botón, o al hermano que sigue sirviendo; tras retirar,
// al nombre de la fila vecina, porque la que se pulsó ya no está. Es el mismo trayecto que QuitarCampo.js.

'use client';

import { useEffect, useRef, useState } from 'react';
import Ayuda from './Ayuda';
import { cambiarEstructura, yaDiceQueNoHaCambiado } from './estructura-cliente';
import { fichasDe } from './sa-cliente';
import Sa from '../../core/sa';
import FE from '../../core/ficha-estructura';

// Las primeras filas de la tabla son la cabecera de la ficha (número, título, sesiones, evaluación y
// resultados de aprendizaje): no son filas de la estructura y no ofrecen gestos.
const FILAS_DE_CABECERA = 3;

const mensajeDeError = (error) => (error ? error.message : null);

const yEnTodas = (r) => (r && r.afectaUnidades && r.unidades > 1
  ? ` El cambio ha salido en las fichas de ${r.unidades} unidades a la vez.`
  : '');

// «de este módulo» / «de esta materia»: el recuento es de las fichas que se tienen delante.
const ambitoDe = (apartado, comoSeLlaman) => {
  if (!apartado || !apartado.unidadId) return 'de este apartado';
  const nombre = comoSeLlaman || 'unidad';
  return `${/^(materia|unidad)/.test(nombre) ? 'de esta' : 'de este'} ${nombre}`;
};

export default function EstructuraFicha({
  documentoId, apartado, plantillaVersion, enTodas, comoSeLlaman, onCambiado,
}) {
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState(null);
  const [alerta, setAlerta] = useState(null);
  const [error, setError] = useState(null);
  const [editando, setEditando] = useState(null);
  const [texto, setTexto] = useState('');
  const [nueva, setNueva] = useState('');
  const [posicion, setPosicion] = useState('');
  const botones = useRef(new Map());
  const focoPendiente = useRef(null);

  const estructura = (apartado && Array.isArray(apartado.estructuraFicha)
    ? apartado.estructuraFicha : Sa.CAMPOS_POR_OMISION);

  // El foco, cuando la tabla ya está repintada con el cambio. Depende de la estructura porque la
  // nueva llega con la relectura del apartado, un momento después de la respuesta, y de `enviando`
  // porque mientras dura la petición los botones están apagados y no admiten foco.
  useEffect(() => {
    const quiere = focoPendiente.current;
    if (!quiere) return;
    const nodo = quiere.map((k) => botones.current.get(k)).find((n) => n && !n.disabled);
    if (!nodo) return;
    focoPendiente.current = null;
    nodo.focus();
  }, [estructura, editando, enviando]);
  const refBoton = (clave) => (nodo) => {
    if (nodo) botones.current.set(clave, nodo);
    else botones.current.delete(clave);
  };

  const vigentes = estructura.filter((c) => !c.retirado);
  const retiradas = estructura.filter((c) => c.retirado);
  const donde = ambitoDe(apartado, comoSeLlaman);
  const aTodas = enTodas || 'todas las fichas del documento';

  const lista = fichasDe(apartado).lista;
  const recuento = FE.recuento(lista, estructura);

  const filas = Sa.filasDeFicha(Sa.fichaVacia(null), FE.camposDelEsqueleto(estructura));
  const nombre = (c) => c.etiqueta || c.id;
  const campoPorId = (id) => estructura.find((c) => c.id === id);

  // Una operación: manda lo que dice el gesto, cuenta el informe con las fichas que se tienen
  // delante y deja dicho a qué botón vuelve el foco.
  const mandar = async (gesto, datos, foco) => {
    setEnviando(true);
    setError(null);
    setAviso(null);
    setAlerta(null);
    focoPendiente.current = null;
    try {
      const r = await cambiarEstructura(documentoId, 'ficha', {
        cuerpo: { ...FE.peticionDeGesto(gesto, datos), esperaPlantillaVersion: plantillaVersion },
      });
      const informe = FE.informeDeCambio((r || {}).cambio, recuento, donde);
      setAviso(informe.estado + yEnTodas(r));
      setAlerta(informe.alerta);
      focoPendiente.current = foco ? foco(r || {}) : null;
      setEditando(null);
      if (onCambiado) await onCambiado('ficha', r || {});
      return true;
    } catch (e) {
      setError(e);
      return false;
    } finally {
      setEnviando(false);
    }
  };

  const abrirRenombrar = (c) => {
    setEditando(c.id); setTexto(nombre(c)); setAviso(null); setAlerta(null); setError(null);
  };
  const cerrarRenombrar = (c) => { focoPendiente.current = [`${c.id}:renombrar`]; setEditando(null); };
  const renombrar = (c) => mandar('renombrar', { campoFicha: c.id, etiqueta: texto }, () => [`${c.id}:renombrar`]);

  const mover = (c, sentido) => mandar(sentido, { campoFicha: c.id }, () => (sentido === 'subir'
    ? [`${c.id}:subir`, `${c.id}:bajar`] : [`${c.id}:bajar`, `${c.id}:subir`]));

  // Tras retirar, la fila ya no está: el foco va al nombre de la vecina que queda.
  const retirar = (c) => {
    const i = vigentes.indexOf(c);
    const vecinas = [vigentes[i + 1], vigentes[i - 1]].filter(Boolean).map((x) => `${x.id}:renombrar`);
    return mandar('retirar', { campoFicha: c.id }, () => vecinas);
  };

  const restaurar = (c) => mandar('restaurar', { campoFicha: c.id }, () => [`${c.id}:renombrar`]);

  const anadir = async (ev) => {
    ev.preventDefault();
    const limpio = nueva.trim();
    if (!limpio || enviando) return;
    const sitio = posicion === '' ? undefined : Number(posicion);
    const bien = await mandar('anadir', { etiqueta: limpio, posicion: sitio }, (r) => (r.campoFicha ? [`${r.campoFicha}:renombrar`] : null));
    if (bien) { setNueva(''); setPosicion(''); }
  };

  // Las celdas de etiqueta que NO traen `campo` (o traen uno que no es de la estructura): sobre ellas
  // no se ofrece nada, y se dice cuántas son en lugar de callarlo.
  let sinIdentificador = 0;
  const celdaDe = (celda, i, j) => {
    const id = FE.campoDeCelda(celda, estructura);
    const c = id ? campoPorId(id) : null;
    const esEtiqueta = i >= FILAS_DE_CABECERA && celda.bold && celda.text !== Sa.CABECERA_ACTIVIDADES;
    if (!c) {
      if (esEtiqueta) sinIdentificador += 1;
      return (
        <td key={j} colSpan={celda.colspan} rowSpan={celda.rowspan} className={celda.bold ? 'celda-neg' : undefined}>
          {celda.text}
          {esEtiqueta ? <span className="chip chip-vacio"> sin identificador</span> : null}
        </td>
      );
    }
    const k = vigentes.indexOf(c);
    const antesDeRetirar = FE.avisoAntesDeRetirar(c, recuento, donde);
    return (
      <td key={j} colSpan={celda.colspan} rowSpan={celda.rowspan} className="celda-neg">
        {editando === c.id ? (
          <>
            <input
              type="text"
              autoFocus
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); if (!enviando) renombrar(c); }
                if (e.key === 'Escape') { e.preventDefault(); cerrarRenombrar(c); }
              }}
              disabled={enviando}
              aria-label={`Nuevo nombre de la fila «${nombre(c)}»`}
            />
            <button className="mini" type="button" onClick={() => renombrar(c)} disabled={enviando}>
              {enviando ? 'Guardando…' : 'Guardar nombre'}
            </button>
            <button className="mini" type="button" onClick={() => cerrarRenombrar(c)} disabled={enviando}>
              Cancelar
            </button>
          </>
        ) : (
          <>
            <button
              className="celda-campo"
              type="button"
              ref={refBoton(`${c.id}:renombrar`)}
              onClick={() => abrirRenombrar(c)}
              disabled={enviando}
              title={`Pulsa para renombrar la fila «${nombre(c)}»`}
              aria-label={`Renombrar la fila «${nombre(c)}»`}
            >
              {nombre(c)}
            </button>
            <span className="celda-acciones">
              <button
                className="mini"
                type="button"
                ref={refBoton(`${c.id}:subir`)}
                onClick={() => mover(c, 'subir')}
                disabled={enviando || k <= 0}
                aria-label={`Subir la fila «${nombre(c)}»`}
                title={k <= 0 ? 'Ya es la primera fila' : `Subir la fila «${nombre(c)}»`}
              >
                ▲
              </button>
              <button
                className="mini"
                type="button"
                ref={refBoton(`${c.id}:bajar`)}
                onClick={() => mover(c, 'bajar')}
                disabled={enviando || k >= vigentes.length - 1}
                aria-label={`Bajar la fila «${nombre(c)}»`}
                title={k >= vigentes.length - 1 ? 'Ya es la última fila' : `Bajar la fila «${nombre(c)}»`}
              >
                ▼
              </button>
              <button
                className="mini"
                type="button"
                onClick={() => retirar(c)}
                disabled={enviando || vigentes.length < 2}
                aria-label={`Retirar la fila «${nombre(c)}» de la ficha`}
                title={antesDeRetirar}
              >
                ✕
              </button>
            </span>
          </>
        )}
      </td>
    );
  };

  const cuerpoTabla = filas.map((fila, i) => (
    // eslint-disable-next-line react/no-array-index-key
    <tr key={i}>{fila.map((celda, j) => celdaDe(celda, i, j))}</tr>
  ));

  return (
    <div className="bloque bloque-tabla editor-tabla estructura-ficha" aria-busy={enviando ? 'true' : 'false'}>
      <div className="linea-estructura">
        <strong>Filas de la ficha de situación de aprendizaje</strong>
        <span className="chip chip-cod">{vigentes.length}</span>
      </div>

      {/* EL AVISO DE QUE ESTO ES DE TODAS LAS FICHAS, en una línea, con su propia ayuda: el mismo
          patrón que el de los once módulos de la tarjeta. */}
      <div className="linea-estructura ayuda-plantilla">
        <span>Esto es la plantilla de las fichas de {aTodas}.</span>
        <Ayuda sobre={`qué cambia en las fichas de ${aTodas}`}>
          <p>
            La ficha es la misma en {aTodas}: lo que cambies aquí —el nombre de una fila, su orden,
            añadirla o retirarla— sale en las fichas de {aTodas} a la vez, y no hay forma de cambiarlo
            en una sola. <strong>El contenido no se toca</strong>: cada ficha conserva lo que tenga
            escrito, también en una fila que se retire.
          </p>
        </Ayuda>
      </div>

      {/* LO INCÓMODO, DICHO CON EL NÚMERO: una ficha que conserva la tabla del Word imprime esa tabla. */}
      <p className="nota" data-que="tabla-propia">
        <strong>Antes de cambiar nada:</strong> {FE.fraseDeTablaPropia(recuento, donde)}
        {recuento.total
          ? ' Los cambios de aquí se ven en las fichas que se montan desde sus campos y en las nuevas.'
          : ''}
      </p>

      <div className="tabla-marco">
        <table className="tabla-doc tabla-editable" aria-label="Filas de la ficha de situación de aprendizaje, en blanco">
          <tbody>{cuerpoTabla}</tbody>
        </table>
      </div>
      <p className="ayuda">
        Pulsa el nombre de una fila para renombrarla (Enter guarda, Escape cancela). Las filas que en la
        ficha impresa solo salen cuando alguien las escribe se enseñan aquí aunque estén vacías.
      </p>
      {sinIdentificador ? (
        <p className="ayuda">
          {sinIdentificador === 1 ? 'Una fila de la tabla no trae su identificador' : `${sinIdentificador} filas de la tabla no traen su identificador`}
          : no se puede cambiar desde aquí, porque lo escrito en las fichas se guarda por él.
        </p>
      ) : null}

      <form className="linea-estructura" onSubmit={anadir}>
        <label htmlFor="ficha-nueva-fila">Añadir fila</label>
        <input
          id="ficha-nueva-fila"
          value={nueva}
          onChange={(ev) => setNueva(ev.target.value)}
          placeholder="Nombre de la fila nueva"
          autoComplete="off"
          disabled={enviando}
        />
        <label className="sr" htmlFor="ficha-nueva-posicion">Sitio de la fila nueva</label>
        <select
          id="ficha-nueva-posicion"
          value={posicion}
          onChange={(ev) => setPosicion(ev.target.value)}
          disabled={enviando}
        >
          <option value="">Al final</option>
          {vigentes.map((c, i) => (
            <option key={c.id} value={String(i + 1)}>{`Antes de «${nombre(c)}»`}</option>
          ))}
        </select>
        <button className="btn-ghost" type="submit" disabled={enviando || !nueva.trim()}>
          {enviando ? 'Guardando…' : 'Añadir fila'}
        </button>
        <span className="ayuda">Nace con todo el ancho de la tabla y en blanco en todas las fichas.</span>
      </form>

      {retiradas.length ? (
        <>
          <p className="suave">
            <strong>Filas retiradas</strong> ({retiradas.length}): no se imprimen, pero lo escrito en
            ellas sigue guardado y vuelve al restaurarlas.
          </p>
          <ul className="lista-retirados" aria-label="Filas retiradas de la ficha">
            {retiradas.map((c) => {
              const n = FE.conTextoEn(recuento, c.id);
              return (
                <li key={c.id}>
                  <span className="retirado-nombre">{nombre(c)}</span>
                  <code>{c.id}</code>
                  <span className="suave">
                    {n ? `texto escrito en ${n} ${n === 1 ? 'ficha' : 'fichas'} ${donde}` : 'sin nada escrito'}
                  </span>
                  <button
                    className="mini"
                    type="button"
                    onClick={() => restaurar(c)}
                    disabled={enviando}
                    aria-label={`Restaurar la fila «${nombre(c)}» en la ficha`}
                    title={`Restaurar la fila «${nombre(c)}» en la ficha`}
                  >
                    Restaurar
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}

      {/* Lo que ha pasado, siempre montado para que se anuncie; y lo que deja de imprimirse, aparte y
          como alerta, que es lo que no se puede dejar pasar. */}
      <p className={aviso ? 'bien aviso-hecho' : 'sr aviso-hecho'} role="status">{aviso || ''}</p>
      {alerta ? (
        <div className="nota nota-error" role="alert">
          <div>{alerta}</div>
        </div>
      ) : null}
      {error ? (
        <div className="nota nota-error" role="alert">
          <div>
            {yaDiceQueNoHaCambiado(error) ? null : <strong>No se ha cambiado nada. </strong>}
            {mensajeDeError(error)}
            {error.estado === 409 ? (
              <p className="suave">
                Vuelve a cargar la página para ver la estructura como está ahora y repite el cambio si
                sigue haciendo falta: dos jefaturas cambiándola a la vez perderían el trabajo de una de
                las dos sin enterarse.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
