// BORRAR DE VERDAD lo que ya estaba retirado: un apartado o un campo.
//
// Es la única operación irreversible de toda la aplicación y la pantalla lo dice así, sin
// eufemismos. «Retirar» no borra y se deshace desde la misma portada; esto no se deshace. Por eso
// la palabra de aquí es «borrar», y «quitar» —que en la aplicación ya significa retirar— no sale.
//
// LA CONFIRMACIÓN ES PROPORCIONAL A LO QUE SE PIERDE
//
//   · Un APARTADO arrastra su subárbol y lo escrito en todas las unidades, así que se confirma
//     ESCRIBIENDO SU TÍTULO: un clic de más no puede bastar. El foco va al cuadro de texto, que es el
//     paso que hay que dar, y el botón de borrar no se enciende hasta que coincide.
//   · Un CAMPO se confirma en dos pasos, nombrando el campo, su apartado y, si es de módulos, que se
//     borra en todos. El foco va al botón de confirmar, igual que al retirar (QuitarCampo.js).
//
// LO QUE HAY QUE TECLEAR ESTÁ ESCRITO EN LA PANTALLA, LITERALMENTE. De los 466 apartados reales del
// departamento, 143 pasan de 40 caracteres y el más largo tiene 124: teclear 124 caracteres no es
// deliberar, es una barrera que empuja a copiar y pegar, que es justo lo que anula la deliberación.
// De un título largo se piden sus primeras palabras, y la cadena exacta se enseña tal cual, así que
// no hay nada que adivinar. La regla —cuál es esa cadena y qué vale por ella— es
// `Plantilla.loQueHayQueEscribir` y `Plantilla.confirmaTitulo`, de core/plantilla.js, con pruebas.
//
// EL FOCO NO SE DECIDE AQUÍ. Las tres confirmaciones de la aplicación usan el mismo gancho
// (confirmar-cliente.js) y la misma decisión (core/confirmar.js): al abrir va al paso —el cuadro de
// texto en el apartado, el botón de confirmar en el campo—, al cancelar vuelve al botón de abrir, y
// al terminar lo recoge el aviso de la lista, porque esta fila ya no existe.
//
// En los dos casos el aviso dice CUÁNTO HAY ESCRITO antes de pulsar. Lo cuenta el servidor
// (`contenido` de cada retirado en la lectura de la estructura): un «¿seguro?» sin el dato no sirve,
// porque quien lo lee no sabe si va a perder un campo vacío o tres páginas.
//
// QUIÉN PUEDE no se decide aquí. Estas listas solo se pintan si el servidor dijo `puedeCambiar` (ver
// Visor.js), y si ese candado se cierra el botón no sale. El servidor vuelve a comprobarlo al borrar.

'use client';

import { useId, useState } from 'react';
import Plantilla from '../../core/plantilla';
import {
  cambiarEstructura, cuantoHayEscritoEnApartado, cuantoHayEscritoEnCampo, textoDeFalloAlBorrar,
  todasLasUnidades,
} from './estructura-cliente';
import useConfirmacion from './confirmar-cliente';

const cuantos = (n) => (n === 1 ? '1 apartado' : `${n} apartados`);

// El fallo de un borrado. Se distingue el rechazo del servidor (no ha tocado nada) del fallo sin
// respuesta (no se sabe), por el estado de la respuesta y no por lo que diga el mensaje.
function FalloAlBorrar({ error }) {
  if (!error) return null;
  const { texto } = textoDeFalloAlBorrar(error);
  return (
    <div className="nota nota-error" role="alert">
      <div>
        <strong>{texto} </strong>
        {error.message}
      </div>
    </div>
  );
}

// ------------------------------------------------- un apartado retirado

export function BorrarApartado({
  documentoId, retirado, plantillaVersion, cuantasUnidades, comoSeLlaman, ocupado, onBorrado,
}) {
  const confirma = useConfirmacion();
  const [escrito, setEscrito] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);
  const id = useId();

  const titulo = retirado.titulo || retirado.seccion;
  const contenido = retirado.contenido || { apartados: 1 };
  const dentro = (contenido.apartados || 1) - 1;
  const enTodas = retirado.deUnidades && cuantasUnidades > 1
    ? todasLasUnidades(cuantasUnidades, comoSeLlaman)
    : null;
  // La cadena que se pide y si es el título entero o solo sus primeras palabras. Las dos cosas
  // salen de core/plantilla.js: `mismoTitulo(pedido, titulo)` es verdad exactamente cuando lo que
  // se pide ES el título, así que la pantalla no tiene que repetir el recorte por su cuenta.
  const pedido = Plantilla.loQueHayQueEscribir(titulo);
  const entero = Plantilla.mismoTitulo(pedido, titulo);
  // Lo que cuesta es el acto de escribirlo, no acertar con las tildes: `confirmaTitulo` perdona
  // acentos, mayúsculas, puntuación y espacios de sobra, y acepta también el título completo.
  const coincide = Plantilla.confirmaTitulo(escrito, titulo);

  const cerrar = () => { setEscrito(''); setError(null); confirma.cancelar(); };

  const borrar = async (e) => {
    e.preventDefault();
    if (!coincide || enviando) return;
    setEnviando(true);
    setError(null);
    try {
      const r = await cambiarEstructura(documentoId, 'borrar', {
        seccion: retirado.seccion,
        cuerpo: { esperaPlantillaVersion: plantillaVersion },
      });
      // El foco de después lo lleva el aviso de la lista: esta fila se va con el borrado.
      if (onBorrado) await onBorrado(retirado, r || {});
    } catch (err) {
      setError(err);
      setEnviando(false);
    }
  };

  if (!confirma.estaAbierta()) {
    return (
      <button
        className="mini mini-rojo"
        type="button"
        ref={confirma.refAbrir()}
        onClick={() => confirma.abrir()}
        disabled={ocupado}
        aria-label={`Borrar para siempre «${titulo}»`}
        title={`Borrar «${titulo}» para siempre. No se puede deshacer`}
      >
        Borrar para siempre…
      </button>
    );
  }

  return (
    <form className="borrado" onSubmit={borrar} aria-label={`Borrar «${titulo}» para siempre`}>
      {/* El aviso de consecuencia: visible, a peso completo y delante del cuadro donde se escribe. */}
      <p>
        <strong>Esto no se puede deshacer.</strong> Se borra «{titulo}»
        {dentro ? ` y los ${cuantos(dentro)} que tiene dentro` : ''}
        {enTodas ? `, en ${enTodas} a la vez` : ''}
        , y todo lo que hay escrito. {cuantoHayEscritoEnApartado(contenido)}
      </p>
      <p className="suave">
        Si no estás seguro, déjalo donde está: en la lista de retirados no estorba y se puede restaurar.
      </p>
      <p className="borrado-escribir">
        <label htmlFor={id}>
          {entero ? 'Para borrarlo, escribe su título:' : 'Para borrarlo, escribe las primeras palabras de su título:'}
        </label>
        {' '}
        {/* LA CADENA EXACTA QUE SE PIDE, TAL CUAL. Si se pidiera «las primeras palabras» sin
            decir cuáles, habría que adivinarlas. */}
        <strong className="borrado-pedido">{pedido}</strong>
        {' '}
        <input
          id={id}
          ref={confirma.refPaso}
          type="text"
          value={escrito}
          autoComplete="off"
          onChange={(e) => setEscrito(e.target.value)}
          disabled={enviando}
          aria-describedby={`${id}-como`}
        />
        <span className="ayuda" id={`${id}-como`}>
          No hacen falta las tildes ni las mayúsculas.
          {entero ? '' : ' El título completo también vale.'}
        </span>
      </p>
      <p className="borrado-botones">
        <button className="mini mini-rojo" type="submit" disabled={!coincide || enviando}>
          {enviando ? 'Borrando…' : `Borrar «${titulo}» para siempre`}
        </button>
        {' '}
        <button className="mini" type="button" onClick={cerrar} disabled={enviando}>
          Cancelar
        </button>
      </p>
      <FalloAlBorrar error={error} />
    </form>
  );
}

// ------------------------------------------------- un campo retirado

export function BorrarCampo({
  documentoId, retirado, plantillaVersion, cuantasUnidades, comoSeLlaman, ocupado, onBorrado,
}) {
  const confirma = useConfirmacion();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  const nombre = retirado.etiqueta || retirado.campo;
  const enTodas = retirado.deUnidades && cuantasUnidades > 1
    ? todasLasUnidades(cuantasUnidades, comoSeLlaman)
    : null;

  const cerrar = () => { setError(null); confirma.cancelar(); };

  const borrar = async () => {
    setEnviando(true);
    setError(null);
    try {
      const r = await cambiarEstructura(documentoId, 'borrar_campo', {
        seccion: retirado.seccion,
        campo: retirado.campo,
        cuerpo: { esperaPlantillaVersion: plantillaVersion },
      });
      if (onBorrado) await onBorrado(retirado, r || {});
    } catch (err) {
      setError(err);
      setEnviando(false);
    }
  };

  if (!confirma.estaAbierta()) {
    return (
      <button
        className="mini mini-rojo"
        type="button"
        ref={confirma.refAbrir()}
        onClick={() => confirma.abrir()}
        disabled={ocupado}
        aria-label={`Borrar para siempre el campo «${nombre}»`}
        title={`Borrar el campo «${nombre}» para siempre. No se puede deshacer`}
      >
        Borrar para siempre…
      </button>
    );
  }

  return (
    <div className="borrado" role="group" aria-label={`Borrar el campo «${nombre}» para siempre`}>
      <p>
        <strong>Esto no se puede deshacer.</strong> Se borra el campo «{nombre}» del apartado «{retirado.titulo}»
        {enTodas ? `, en ${enTodas} a la vez` : ''}
        , y todo lo que hay escrito en él. {cuantoHayEscritoEnCampo(retirado.contenido)}
      </p>
      <p className="borrado-botones">
        <button className="mini mini-rojo" type="button" ref={confirma.refPaso} onClick={borrar} disabled={enviando}>
          {enviando ? 'Borrando…' : `Sí, borrar el campo «${nombre}» para siempre`}
        </button>
        {' '}
        <button className="mini" type="button" onClick={cerrar} disabled={enviando}>
          Cancelar
        </button>
      </p>
      <FalloAlBorrar error={error} />
    </div>
  );
}
