// Quitar un campo de un apartado y devolverlo. Es la otra mitad de AnadirCampo.
//
// Quitar NO borra: el campo se queda en la plantilla marcado como retirado, con
// lo que tuviera escrito, y vuelve al restaurarlo. Qué campos se pueden quitar
// lo dice el servidor en cada campo de la lectura de la estructura
// (`puedeRetirar`), y aquí no se decide: el botón refleja ese candado. Los
// campos que no se pueden quitar desde la aplicación (los del Word importado,
// las fichas, las ponderaciones) salen sin botón y con la razón escrita.
//
// La confirmación es en dos pasos y el foco va al botón de confirmar, igual que
// al retirar un apartado entero en Estructura.js.

'use client';

import { useEffect, useRef, useState } from 'react';
import { BorrarCampo } from './BorrarDefinitivo';
import { cambiarEstructura } from './estructura-cliente';

const mensajeDeError = (error) => (error ? error.message : null);

// Lo que se añade al aviso cuando el cambio ha salido en todas las unidades.
// Lo dice la respuesta, no esta pantalla.
const yEnTodas = (r, enTodas) => (r && r.afectaUnidades && r.unidades > 1
  ? ` El cambio ha salido en ${enTodas || `las ${r.unidades} unidades`} a la vez.`
  : '');

// ------------------------------------------------- los campos de un apartado

export function QuitarCampos({
  documentoId, seccion, tituloApartado, fila, plantillaVersion, enTodas, onCambiado,
}) {
  const [confirma, setConfirma] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState(null);
  const [error, setError] = useState(null);
  const refConfirmar = useRef(null);

  useEffect(() => {
    if (confirma && refConfirmar.current) refConfirmar.current.focus();
  }, [confirma]);

  const campos = fila && Array.isArray(fila.campos) ? fila.campos.filter((c) => !c.retirado) : [];
  // Sin campos que listar solo queda el aviso del que se acaba de quitar.
  if (!campos.length && !aviso) return null;

  const nombre = (c) => c.etiqueta || c.id;
  const quitar = async (c) => {
    setEnviando(true);
    setError(null);
    setAviso(null);
    try {
      const r = await cambiarEstructura(documentoId, 'retirar_campo', {
        seccion,
        campo: c.id,
        cuerpo: { esperaPlantillaVersion: plantillaVersion },
      });
      setConfirma(null);
      setAviso(`Campo «${nombre(c)}» quitado de «${tituloApartado}». No se ha borrado: lo escrito`
        + ' sigue guardado y vuelve al restaurarlo desde la portada del documento.'
        + (campos.length < 2 ? ' El apartado se ha quedado sin campos.' : '')
        + yEnTodas(r, enTodas));
      if (onCambiado) await onCambiado('retirar_campo', r || {});
    } catch (e) {
      setError(e);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="quitar-campo">
      <ul className="lista-retirados">
        {campos.map((c) => (
          <li key={c.id}>
            <span>{nombre(c)}</span>
            {confirma === c.id ? (
              <>
                <button className="mini" type="button" ref={refConfirmar} onClick={() => quitar(c)} disabled={enviando}>
                  {enviando ? 'Quitando…' : `Sí, quitar el campo «${nombre(c)}»${enTodas ? ` de ${enTodas}` : ''}`}
                </button>
                <button className="mini" type="button" onClick={() => setConfirma(null)} disabled={enviando}>
                  Cancelar
                </button>
              </>
            ) : c.puedeRetirar ? (
              <button
                className="mini"
                type="button"
                onClick={() => { setConfirma(c.id); setAviso(null); setError(null); }}
                disabled={enviando}
              >
                Quitar el campo «{nombre(c)}» de «{tituloApartado}»
              </button>
            ) : (
              <span className="ayuda">Este campo no se quita desde aquí.</span>
            )}
          </li>
        ))}
      </ul>
      {confirma ? (
        <p className="suave">
          El campo deja de salir en el documento y en el PDF
          {enTodas ? `, y en ${enTodas} a la vez` : ''}
          {campos.length === 1 ? ', y el apartado se queda sin campos' : ''}
          . <strong>No se borra nada</strong>: lo escrito se conserva entero y vuelve al restaurarlo.
        </p>
      ) : null}
      <p className={aviso ? 'bien' : 'sr'} role="status">{aviso || ''}</p>
      {error ? (
        <div className="nota nota-error" role="alert">
          <div>
            {/* El rechazo del servidor no cambia nada: ni la plantilla ni lo escrito. Eso se dice
                primero, porque es lo que hay que saber antes de leer el motivo. */}
            <strong>No se ha cambiado nada. </strong>
            {mensajeDeError(error)}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ------------------------------------------------- los campos quitados

export function CamposRetirados({
  documentoId, retirados, plantillaVersion, cuantasUnidades, comoSeLlaman, onCambiado,
}) {
  const [enviando, setEnviando] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [error, setError] = useState(null);

  const lista = Array.isArray(retirados) ? retirados : [];
  if (!lista.length && !aviso) return null;

  const clave = (x) => `${x.seccion}\u0000${x.campo}`;
  const borrado = async (x, r) => {
    setError(null);
    setAviso(`Campo «${x.etiqueta || x.campo}» de «${x.titulo}» borrado para siempre`
      + ((r.contenido && r.contenido.conContenido) ? ' junto con todo lo que había escrito.' : '. No había nada escrito.'));
    if (onCambiado) await onCambiado('borrar_campo', r);
  };
  const restaurar = async (x) => {
    setEnviando(clave(x));
    setError(null);
    setAviso(null);
    try {
      const r = await cambiarEstructura(documentoId, 'restaurar_campo', {
        seccion: x.seccion,
        campo: x.campo,
        cuerpo: { esperaPlantillaVersion: plantillaVersion },
      });
      setAviso(`Campo «${x.etiqueta || x.campo}» restaurado en «${x.titulo}», con lo que tuviera escrito.`
        + yEnTodas(r));
      if (onCambiado) await onCambiado('restaurar_campo', r || {});
    } catch (e) {
      setError(e);
    } finally {
      setEnviando(null);
    }
  };

  return (
    <section className="tarjeta estructura">
      <header className="tarjeta-cab">
        <h2>Campos quitados</h2>
        <span className="suave">{lista.length}</span>
      </header>
      {lista.length ? (
        <p className="suave">
          <strong>No se han borrado.</strong> No salen en el documento ni en el PDF, lo escrito
          sigue guardado, y al restaurarlos vuelven con su texto.
        </p>
      ) : null}
      <ul className="lista-retirados">
        {lista.map((x) => (
          <li key={clave(x)}>
            <span>{x.etiqueta || x.campo}</span>
            <span className="suave">en «{x.titulo}»</span>
            {x.deUnidades ? <span className="chip chip-vacio">de los módulos</span> : null}
            {x.apartadoRetirado ? (
              <span className="ayuda">El apartado está retirado: restáuralo primero.</span>
            ) : (
              <>
                <button
                  className="mini"
                  type="button"
                  onClick={() => restaurar(x)}
                  disabled={!!enviando}
                >
                  {enviando === clave(x)
                    ? 'Restaurando…'
                    : `Restaurar el campo «${x.etiqueta || x.campo}» de «${x.titulo}»`}
                </button>
                <BorrarCampo
                  documentoId={documentoId}
                  retirado={x}
                  plantillaVersion={plantillaVersion}
                  cuantasUnidades={cuantasUnidades}
                  comoSeLlaman={comoSeLlaman}
                  ocupado={!!enviando}
                  onBorrado={borrado}
                />
              </>
            )}
          </li>
        ))}
      </ul>
      <p className={aviso ? 'bien' : 'sr'} role="status">{aviso || ''}</p>
      {error ? (
        <div className="nota nota-error" role="alert">
          <div>
            <strong>No se ha restaurado nada. </strong>
            {mensajeDeError(error)}
          </div>
        </div>
      ) : null}
    </section>
  );
}
