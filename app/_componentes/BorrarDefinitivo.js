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
// En los dos casos el aviso dice CUÁNTO HAY ESCRITO antes de pulsar. Lo cuenta el servidor
// (`contenido` de cada retirado en la lectura de la estructura): un «¿seguro?» sin el dato no sirve,
// porque quien lo lee no sabe si va a perder un campo vacío o tres páginas.
//
// QUIÉN PUEDE no se decide aquí. Estas listas solo se pintan si el servidor dijo `puedeCambiar` (ver
// Visor.js), y si ese candado se cierra el botón no sale. El servidor vuelve a comprobarlo al borrar.

'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Plantilla from '../../core/plantilla';
import {
  cambiarEstructura, cuantoHayEscritoEnApartado, cuantoHayEscritoEnCampo, textoDeFalloAlBorrar,
  todasLasUnidades,
} from './estructura-cliente';

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
  const [abierto, setAbierto] = useState(false);
  const [escrito, setEscrito] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);
  const refTexto = useRef(null);
  const id = useId();

  useEffect(() => {
    if (abierto && refTexto.current) refTexto.current.focus();
  }, [abierto]);

  const titulo = retirado.titulo || retirado.seccion;
  const contenido = retirado.contenido || { apartados: 1 };
  const dentro = (contenido.apartados || 1) - 1;
  const enTodas = retirado.deUnidades && cuantasUnidades > 1
    ? todasLasUnidades(cuantasUnidades, comoSeLlaman)
    : null;
  // Lo que cuesta es el acto de escribirlo, no acertar con las tildes: `mismoTitulo` es de
  // core/plantilla.js y perdona acentos, mayúsculas, puntuación y espacios de sobra. Hay títulos
  // reales de 124 caracteres; exigirlos exactos empujaría a copiar y pegar.
  const coincide = Plantilla.mismoTitulo(escrito, titulo);

  const cerrar = () => { setAbierto(false); setEscrito(''); setError(null); };

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
      if (onBorrado) await onBorrado(retirado, r || {});
    } catch (err) {
      setError(err);
      setEnviando(false);
    }
  };

  if (!abierto) {
    return (
      <button className="mini" type="button" onClick={() => setAbierto(true)} disabled={ocupado}>
        Borrar «{titulo}» para siempre…
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
      <p>
        <label htmlFor={id}>
          Para borrarlo, escribe su título: <strong>{titulo}</strong>{' '}
          <span className="suave">(no hacen falta las tildes ni las mayúsculas)</span>
        </label>
        {' '}
        <input
          id={id}
          ref={refTexto}
          type="text"
          value={escrito}
          autoComplete="off"
          onChange={(e) => setEscrito(e.target.value)}
          disabled={enviando}
        />
      </p>
      <p>
        <button className="mini" type="submit" disabled={!coincide || enviando}>
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
  const [abierto, setAbierto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);
  const refConfirmar = useRef(null);

  useEffect(() => {
    if (abierto && refConfirmar.current) refConfirmar.current.focus();
  }, [abierto]);

  const nombre = retirado.etiqueta || retirado.campo;
  const enTodas = retirado.deUnidades && cuantasUnidades > 1
    ? todasLasUnidades(cuantasUnidades, comoSeLlaman)
    : null;

  const cerrar = () => { setAbierto(false); setError(null); };

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

  if (!abierto) {
    return (
      <button className="mini" type="button" onClick={() => setAbierto(true)} disabled={ocupado}>
        Borrar el campo «{nombre}» para siempre…
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
      <p>
        <button className="mini" type="button" ref={refConfirmar} onClick={borrar} disabled={enviando}>
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
