// Quitar un campo de un apartado y devolverlo, y también renombrarlo y subirlo o bajarlo entre
// los de su apartado. Es la otra mitad de AnadirCampo.
//
// Renombrar y mover no destruyen nada —el id del campo no cambia, y con él sigue enganchado lo
// escrito—, así que van sin confirmación: una más estorba. Lo que a un campo no se le puede hacer
// ahora mismo (porque ya es el primero, por ejemplo) se lee donde estaría el botón.
//
// EL FOCO SE QUEDA DONDE ESTABA. Al subir o bajar un campo la lista se reordena y el botón que se
// ha pulsado cambia de sitio; quien va con teclado quiere pulsarlo otra vez, así que cuando la
// lista nueva llega el foco vuelve al mismo botón, o al de al lado si este ya no hace nada.
//
// Quitar NO borra: el campo se queda en la plantilla marcado como retirado, con
// lo que tuviera escrito, y vuelve al restaurarlo. Qué campos se pueden quitar
// lo dice el servidor en cada campo de la lectura de la estructura
// (`puedeRetirar`), y aquí no se decide: el botón refleja ese candado. Los
// campos que no se pueden quitar desde la aplicación (los del Word importado,
// las fichas, las ponderaciones) salen sin botón y con la razón escrita donde
// estaría el botón: lo que a una fila no se le puede hacer se lee igual de bien
// que lo que sí.
//
// LA CONFIRMACIÓN ES EN DOS PASOS Y EL FOCO NO SE DECIDE AQUÍ. Las tres
// confirmaciones de la aplicación usan el mismo gancho (confirmar-cliente.js) y
// la misma decisión (core/confirmar.js, con pruebas): al abrir, el foco va al
// botón de confirmar; al cancelar, vuelve al botón de quitar de ESA fila; al
// terminar, al aviso, porque la fila del campo ya no existe.
//
// EL AVISO VA FUERA DE LA LISTA. Al quitar el último campo la lista se queda
// vacía; si el aviso estuviera dentro de la fila se iría con ella y no se
// anunciaría. Está siempre montado y es `role="status"`.

'use client';

import { useEffect, useRef, useState } from 'react';
import { BorrarCampo } from './BorrarDefinitivo';
import {
  avisoDeContenidoSinDestruir, cambiarEstructura, yaDiceQueNoHaCambiado,
} from './estructura-cliente';
import useConfirmacion from './confirmar-cliente';

const mensajeDeError = (error) => (error ? error.message : null);

// Lo que se añade al aviso cuando el cambio ha salido en todas las unidades.
// Lo dice la respuesta, no esta pantalla.
const yEnTodas = (r, enTodas) => (r && r.afectaUnidades && r.unidades > 1
  ? ` El cambio ha salido en ${enTodas || `las ${r.unidades} unidades`} a la vez.`
  : '');

// ------------------------------------------------- los campos de un apartado

// Por qué un campo no se sube o no se baja: si no tiene hermanos, si ya es el primero o el último, o
// si el apartado no admite cambios (una lista de fichas, uno retirado). Se calcula con la lista que
// se está pintando, que es la de los campos vigentes.
function motivoSinMover(c, vigentes, sentido) {
  if (!c.puedeRenombrar) return 'No se mueve desde aquí';
  if (vigentes.length < 2) return 'Es el único campo';
  return sentido === 'subir' ? 'Ya es el primero' : 'Ya es el último';
}

export function QuitarCampos({
  documentoId, seccion, tituloApartado, fila, plantillaVersion, enTodas, onCambiado,
}) {
  const confirma = useConfirmacion();
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState(null);
  const [error, setError] = useState(null);
  // El campo que se está renombrando y el texto que lleva escrito.
  const [editando, setEditando] = useState(null);
  const [texto, setTexto] = useState('');
  const botones = useRef(new Map());
  const focoPendiente = useRef(null);

  // Lleva el foco cuando la lista ya está repintada con el cambio. Depende de `fila` porque la
  // lista nueva llega con la estructura que se vuelve a leer, un momento después de la respuesta, y
  // de «enviando» porque mientras dura la petición los botones están apagados y no admiten foco.
  useEffect(() => {
    const quiere = focoPendiente.current;
    if (!quiere) return;
    const nodo = quiere.map((k) => botones.current.get(k)).find((n) => n && !n.disabled);
    if (!nodo) return;
    focoPendiente.current = null;
    nodo.focus();
  }, [fila, editando, enviando]);
  const refBoton = (clave) => (nodo) => {
    if (nodo) botones.current.set(clave, nodo);
    else botones.current.delete(clave);
  };

  const campos = fila && Array.isArray(fila.campos) ? fila.campos.filter((c) => !c.retirado) : [];
  // Sin campos que listar solo queda el aviso del que se acaba de quitar.
  if (!campos.length && !aviso) return null;

  const nombre = (c) => c.etiqueta || c.id;

  // Renombrar y mover: el mismo trayecto que quitar, sin confirmación.
  const cambiar = async (accion, c, cuerpo, mensaje, foco) => {
    setEnviando(true);
    setError(null);
    setAviso(null);
    try {
      const r = await cambiarEstructura(documentoId, accion, {
        seccion,
        campo: c.id,
        cuerpo: { ...cuerpo, esperaPlantillaVersion: plantillaVersion },
      });
      setAviso(mensaje(r || {}) + yEnTodas(r, enTodas));
      focoPendiente.current = foco;
      setEditando(null);
      if (onCambiado) await onCambiado(accion, r || {});
      return true;
    } catch (e) {
      setError(e);
      return false;
    } finally {
      setEnviando(false);
    }
  };

  const mover = (c, delta) => cambiar(
    'mover_campo', c, { delta },
    (r) => {
      const donde = r.cambio ? ` Ahora es el ${r.cambio.posicion}.º de ${r.cambio.campos}.` : '';
      return `Campo «${nombre(c)}» ${delta < 0 ? 'subido' : 'bajado'} en «${tituloApartado}».${donde}`
        + ' Sale impreso en ese orden.';
    },
    delta < 0 ? [`${c.id}:subir`, `${c.id}:bajar`] : [`${c.id}:bajar`, `${c.id}:subir`],
  );

  const abrirRenombrar = (c) => { setEditando(c.id); setTexto(nombre(c)); setAviso(null); setError(null); };
  const cerrarRenombrar = (c) => { focoPendiente.current = [`${c.id}:renombrar`]; setEditando(null); };
  const renombrar = (c) => cambiar(
    'renombrar_campo', c, { etiqueta: texto },
    () => `Campo «${nombre(c)}» renombrado a «${texto.replace(/\s+/g, ' ').trim()}» en «${tituloApartado}».`
      + ' Lo escrito en él se queda donde estaba.',
    [`${c.id}:renombrar`],
  );
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
      setAviso(`Campo «${nombre(c)}» quitado de «${tituloApartado}». No se ha borrado: lo escrito`
        + ' sigue guardado y vuelve al restaurarlo desde la portada del documento.'
        + (campos.length < 2 ? ' El apartado se ha quedado sin campos.' : '')
        + yEnTodas(r, enTodas));
      confirma.terminar();
      if (onCambiado) await onCambiado('retirar_campo', r || {});
    } catch (e) {
      setError(e);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="quitar-campo">
      {/* Qué es esta lista. Sin rótulo eran unas filas sueltas dentro de la tarjeta, y el
          rótulo no repite el de AnadirCampo, que está justo encima y ya dice «Campos del
          apartado»: esta línea dice cuáles tiene AHORA, que es de lo que habla la lista. */}
      <div className="linea-estructura">
        <span className="suave">Los que tiene ahora</span>
        <span className="chip chip-cod">{campos.length}</span>
      </div>
      <ul className="lista-retirados" aria-label={`Campos de «${tituloApartado}»`}>
        {campos.map((c) => (
          <li key={c.id}>
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
                  aria-label={`Nuevo nombre del campo «${nombre(c)}»`}
                />
                <button className="mini" type="button" onClick={() => renombrar(c)} disabled={enviando}>
                  {enviando ? 'Guardando…' : 'Guardar nombre'}
                </button>
                <button className="mini" type="button" onClick={() => cerrarRenombrar(c)} disabled={enviando}>
                  Cancelar
                </button>
              </>
            ) : (
              <span className="retirado-nombre">{nombre(c)}</span>
            )}
            {editando === c.id ? null : c.puedeRenombrar ? (
              <button
                className="mini"
                type="button"
                ref={refBoton(`${c.id}:renombrar`)}
                onClick={() => abrirRenombrar(c)}
                disabled={enviando}
                aria-label={`Renombrar el campo «${nombre(c)}» de «${tituloApartado}»`}
                title={`Renombrar el campo «${nombre(c)}»`}
              >
                Renombrar
              </button>
            ) : (
              <span className="motivo-no">No se renombra desde aquí</span>
            )}
            {editando === c.id ? null : c.puedeSubir ? (
              <button
                className="mini"
                type="button"
                ref={refBoton(`${c.id}:subir`)}
                onClick={() => mover(c, -1)}
                disabled={enviando}
                aria-label={`Subir el campo «${nombre(c)}» de «${tituloApartado}»`}
                title={`Subir el campo «${nombre(c)}»`}
              >
                Subir
              </button>
            ) : (
              <span className="motivo-no">{motivoSinMover(c, campos, 'subir')}</span>
            )}
            {editando === c.id ? null : c.puedeBajar ? (
              <button
                className="mini"
                type="button"
                ref={refBoton(`${c.id}:bajar`)}
                onClick={() => mover(c, 1)}
                disabled={enviando}
                aria-label={`Bajar el campo «${nombre(c)}» de «${tituloApartado}»`}
                title={`Bajar el campo «${nombre(c)}»`}
              >
                Bajar
              </button>
            ) : (c.puedeRenombrar ? <span className="motivo-no">{motivoSinMover(c, campos, 'bajar')}</span> : null)}
            {c.puedeRetirar ? (
              /* El botón de quitar no desaparece al abrir la confirmación: se queda en su sitio,
                 apagado, para que la fila no cambie de forma y para que el foco tenga a dónde
                 volver al cancelar. */
              <button
                className="mini"
                type="button"
                ref={confirma.refAbrir(c.id)}
                onClick={() => { confirma.abrir(c.id); setAviso(null); setError(null); }}
                disabled={enviando || confirma.estaAbierta(c.id)}
                aria-expanded={confirma.estaAbierta(c.id)}
                aria-label={`Quitar el campo «${nombre(c)}» de «${tituloApartado}»`}
                title={`Quitar el campo «${nombre(c)}» de «${tituloApartado}»`}
              >
                Quitar
              </button>
            ) : (
              <span className="motivo-no">No se quita desde aquí</span>
            )}
            {confirma.estaAbierta(c.id) ? (
              <div className="confirmacion" role="group" aria-label={`Quitar el campo «${nombre(c)}»`}>
                {/* EL AVISO DE CONSECUENCIA, en el momento de pulsar, a peso completo y dentro de
                    la fila del campo del que habla: antes salía al final de la lista, lejos del
                    campo que se iba a quitar. */}
                <p>
                  «{nombre(c)}» deja de salir en el documento y en el PDF
                  {enTodas ? `, y en ${enTodas} a la vez` : ''}
                  {campos.length === 1 ? ', y el apartado se queda sin campos' : ''}
                  . <strong>No se borra nada</strong>: lo escrito se conserva entero y vuelve al
                  restaurarlo desde la portada del documento.
                </p>
                <p className="confirmacion-botones">
                  <button className="mini" type="button" ref={confirma.refPaso} onClick={() => quitar(c)} disabled={enviando}>
                    {enviando ? 'Quitando…' : `Sí, quitar «${nombre(c)}»${enTodas ? ` de ${enTodas}` : ''}`}
                  </button>
                  <button className="mini" type="button" onClick={confirma.cancelar} disabled={enviando}>
                    Cancelar
                  </button>
                </p>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <p
        className={aviso ? 'bien aviso-hecho' : 'sr aviso-hecho'}
        role="status"
        ref={confirma.refAviso}
        tabIndex={-1}
      >
        {aviso || ''}
      </p>
      {error ? (
        <div className="nota nota-error" role="alert">
          <div>
            {/* El rechazo del servidor no cambia nada: ni la plantilla ni lo escrito. Eso se dice
                primero, porque es lo que hay que saber antes de leer el motivo… salvo cuando el
                mensaje del servidor ya lo dice, que es lo normal en los rechazos y en los dos
                conflictos de estructura: decirlo dos veces se lee peor que decirlo una. */}
            {yaDiceQueNoHaCambiado(error) ? null : <strong>No se ha cambiado nada. </strong>}
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
  // Aquí la confirmación en dos pasos está dentro de BorrarCampo, una por fila; este gancho se usa
  // solo por el aviso, que es de la lista entera y es donde tiene que acabar el foco cuando la fila
  // que se estaba borrando desaparece.
  const confirma = useConfirmacion();
  const [enviando, setEnviando] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [error, setError] = useState(null);

  const lista = Array.isArray(retirados) ? retirados : [];
  if (!lista.length && !aviso) return null;

  const clave = (x) => `${x.seccion}\u0000${x.campo}`;
  const borrado = async (x, r) => {
    setError(null);
    setAviso(`Campo «${x.etiqueta || x.campo}» de «${x.titulo}» borrado para siempre`
      + ((r.contenido && r.contenido.conContenido) ? ' junto con todo lo que había escrito.' : '. No había nada escrito.')
      // Si la destrucción del contenido falló DESPUÉS del cambio, se dice: el campo se ha ido, pero
      // lo escrito puede seguir guardado y nadie iría a buscarlo.
      + (avisoDeContenidoSinDestruir(r) || ''));
    confirma.terminar();
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
      <ul className="lista-retirados" aria-label="Campos quitados del documento">
        {lista.map((x) => (
          <li key={clave(x)}>
            <span className="retirado-nombre">{x.etiqueta || x.campo}</span>
            <span className="retirado-donde">en «{x.titulo}»</span>
            {x.deUnidades ? <span className="chip chip-vacio">de los módulos</span> : null}
            {x.apartadoRetirado ? (
              <span className="motivo-no">El apartado está retirado: restáuralo primero</span>
            ) : (
              <>
                <button
                  className="mini"
                  type="button"
                  onClick={() => restaurar(x)}
                  disabled={!!enviando}
                  aria-label={`Restaurar el campo «${x.etiqueta || x.campo}» de «${x.titulo}»`}
                  title={`Restaurar el campo «${x.etiqueta || x.campo}» de «${x.titulo}»`}
                >
                  {enviando === clave(x) ? 'Restaurando…' : 'Restaurar'}
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
      <p
        className={aviso ? 'bien aviso-hecho' : 'sr aviso-hecho'}
        role="status"
        ref={confirma.refAviso}
        tabIndex={-1}
      >
        {aviso || ''}
      </p>
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
