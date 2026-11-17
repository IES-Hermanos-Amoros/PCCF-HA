// La pantalla de acceso: `/acceso?t=<testigo>`.
//
// Se llega pinchando el enlace que ha mandado la jefatura. Esta pantalla canjea
// el testigo con `POST /api/acceso`, que abre la sesión, y entra.
//
// POR QUÉ HACE FALTA UNA PANTALLA SI YA HAY UNA RUTA QUE CANJEA
//
// `GET /api/acceso?t=` también canjea y redirige, y los enlaces viejos siguen
// funcionando con ella. Pero cuando el enlace ya no sirve devuelve el JSON del
// error en bruto, y eso no es una pantalla: lo que ve quien llega es
// `{"error":"enlace_gastado",...}` en la ventana del navegador.
//
// Y son cuatro situaciones distintas que se arreglan de cuatro maneras, así que
// cada una necesita su explicación:
//
//   410 · usado      ya se canjeó. Si fuiste tú, ya tienes sesión en el
//                    navegador donde lo abriste y no hace falta nada más.
//   410 · anulado    se anuló al mandarte otro: el que vale es el último.
//   410 · caducado   han pasado los siete días: hay que pedir otro.
//   404              no ha existido nunca: lo normal es que se haya cortado al
//                    copiarlo, porque es largo.
//
// Decir «enlace no válido» a las cuatro dejaría a la gente pidiendo otro enlace
// cuando ya tenía sesión, o buscando en el correo uno que ya no vale.
//
// EL TESTIGO SE SACA DE LA BARRA DE DIRECCIONES EN CUANTO SE LEE
//
// Con `history.replaceState`, antes de pedir nada. Es la llave: si se queda en
// la dirección, se queda en el historial del navegador, en la cabecera `Referer`
// de la navegación siguiente y en la pantalla cuando alguien comparte una
// captura. Ya es de un solo uso, pero no hay motivo para dejarla a la vista.

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import BarraSuperior from './BarraSuperior';
import ComoSeEntra from './ComoSeEntra';
import { pedir } from './api';
import { ROLES } from './etiquetas';

// Qué hacer en cada caso. El `mensaje` del servidor ya viene redactado y en
// castellano (docs/api.md, «Errores»), así que se enseña tal cual y esto es lo
// que se añade: el título, que es lo que se lee primero, y el arreglo.
const SITUACIONES = {
  usado: {
    titulo: 'Ese enlace ya se había usado',
    arreglo: (
      <>
        <p>
          <strong>Si lo abriste tú</strong>, ya tienes la sesión abierta en el navegador donde lo
          hiciste: no hace falta ningún enlace más, entra por ahí.
        </p>
        <p>
          <strong>Si no fuiste tú</strong> —o fue en otro ordenador y ya no lo tienes a mano—, pide
          otro a la jefatura de tu departamento. Cada enlace sirve una sola vez a propósito.
        </p>
      </>
    ),
  },
  anulado: {
    titulo: 'Ese enlace se anuló al mandarte uno nuevo',
    arreglo: (
      <p>
        Busca en tu correo <strong>el último enlace que te hayan mandado</strong>: solo vale ese. En
        cuanto se manda uno nuevo el anterior deja de servir, que es lo que permite retirar un
        enlace mandado por error a una dirección equivocada.
      </p>
    ),
  },
  caducado: {
    titulo: 'Ese enlace ha caducado',
    arreglo: (
      <p>
        Los enlaces duran <strong>siete días</strong>, para que una llave olvidada en una bandeja de
        entrada no siga abriendo meses después. Pide otro a la jefatura de tu departamento y entra
        con él.
      </p>
    ),
  },
  no_encontrado: {
    titulo: 'Ese enlace no existe',
    arreglo: (
      <>
        <p>
          Lo más corriente es que <strong>se haya cortado al copiarlo</strong>: el enlace es largo y
          algunos programas de correo lo parten en dos líneas. Vuelve a copiarlo entero, desde{' '}
          <code>http</code> hasta el final, y pégalo en la barra de direcciones.
        </p>
        <p>Si ya lo has copiado entero, pide otro a la jefatura de tu departamento.</p>
      </>
    ),
  },
};

export default function Acceso({ testigo }) {
  const [fase, setFase] = useState(testigo ? 'canjeando' : 'sin-testigo');
  const [persona, setPersona] = useState(null);
  const [error, setError] = useState(null);
  const [intento, setIntento] = useState(0);
  // Qué enlace se ha canjeado ya. Ver el efecto de abajo: esto es lo que impide
  // gastar el enlace dos veces.
  const canjeado = useRef(null);

  const limpiarDireccion = useCallback(() => {
    try {
      window.history.replaceState(null, '', '/acceso');
    } catch (e) { /* un navegador sin history: el testigo se queda a la vista y ya está */ }
  }, []);

  // EL CANJE SE HACE UNA SOLA VEZ, Y HAY QUE FORZARLO
  //
  // Canjear GASTA el enlace. React, en desarrollo, monta cada componente, lo
  // limpia y lo vuelve a montar (StrictMode), así que un efecto normal lo
  // canjearía dos veces: la primera abriría la sesión y la segunda recibiría un
  // 410 `usado`, de modo que a quien acaba de entrar bien se le diría que su
  // enlace ya estaba gastado. Comprobado: pasaba. De ahí la marca en un `ref`,
  // que sobrevive al doble montaje.
  //
  // Y por eso tampoco se descarta el resultado con el `vivo = false` de la
  // limpieza que llevan los demás efectos de esta aplicación: la respuesta que
  // llega es la única que va a llegar, y tirarla dejaría la pantalla
  // comprobando para siempre.
  useEffect(() => {
    if (!testigo) return;
    const llave = `${testigo}|${intento}`;
    if (canjeado.current === llave) return;
    canjeado.current = llave;

    limpiarDireccion();
    setFase('canjeando');

    pedir('/api/acceso', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ testigo }),
    })
      .then((r) => {
        setPersona(r.persona || null);
        setFase('dentro');
      })
      .catch(async (e) => {
        // Un enlace «usado» con sesión abierta en ESTE navegador significa que
        // se canjeó aquí: un doble clic, un antivirus que precarga el enlace, o
        // volver atrás. Decir «ya se ha usado» a quien de hecho está dentro le
        // haría pedir otro enlace para nada, así que se comprueba y se le dice
        // lo que de verdad le pasa.
        if (e.estado === 410 && e.motivo === 'usado') {
          try {
            const s = await pedir('/api/sesion');
            if (s && s.persona) {
              setPersona(s.persona);
              setFase('dentro');
              return;
            }
          } catch (otro) { /* sin sesión: es el 410 de siempre */ }
        }
        setError(e);
        setFase('fallo');
      });
  }, [testigo, intento, limpiarDireccion]);

  // Ya dentro: se va a la portada sola, pero el enlace está ahí por si el salto
  // no ocurre (un navegador con el JavaScript a medias, o alguien que lee más
  // despacio que el temporizador). `replace` y no `assign` para no dejar esta
  // pantalla en el historial: volver atrás llevaría a un enlace ya gastado.
  useEffect(() => {
    if (fase !== 'dentro') return undefined;
    const t = setTimeout(() => { window.location.replace('/'); }, 1400);
    return () => clearTimeout(t);
  }, [fase]);

  const situacion = error
    ? (error.estado === 410 ? SITUACIONES[error.motivo] : SITUACIONES[error.codigo]) || null
    : null;

  // Un fallo que no es del enlace —el servidor caído, un 500, un corte de red—
  // sí se puede volver a intentar: el enlace no se ha gastado.
  const reintentable = !!error && !situacion && error.codigo !== 'peticion';

  return (
    <>
      <BarraSuperior subtitulo="Acceso" persona={fase === 'dentro' ? persona : null} />

      <main id="contenido" tabIndex={-1} className="main main-estrecha">
        <div className="cabecera">
          <div>
            <h1>Acceso a las programaciones</h1>
            <p className="suave">
              Se entra con el enlace que manda la jefatura del departamento. No hay contraseñas.
            </p>
          </div>
        </div>

        {fase === 'canjeando' ? (
          <section className="tarjeta">
            <p className="suave" role="status">Comprobando el enlace…</p>
          </section>
        ) : null}

        {fase === 'dentro' ? (
          <section className="tarjeta">
            <header className="tarjeta-cab">
              <h2>Ya estás dentro</h2>
              {persona ? <span className="chip chip-validado">sesión abierta</span> : null}
            </header>
            <p role="status">
              {persona ? (
                <>
                  Hola, <strong>{persona.nombre}</strong>. Entras como{' '}
                  {ROLES[persona.rol] || persona.rol}
                  {persona.departamento ? ` · ${persona.departamento}` : ''}.
                </>
              ) : 'Sesión abierta.'}
            </p>
            <p className="suave">
              Este enlace ya no sirve para nada: era de un solo uso y acabas de gastarlo. La sesión
              se queda en este navegador hasta que cierres sesión desde la barra de arriba.
            </p>
            <p><a className="btn-primario" href="/">Ir a los documentos</a></p>
          </section>
        ) : null}

        {fase === 'fallo' && situacion ? (
          <section className="tarjeta">
            <header className="tarjeta-cab">
              <h2>{situacion.titulo}</h2>
              {/* El estado no va solo en el color: lleva su palabra. */}
              <span className="chip chip-error">no has entrado</span>
            </header>
            {/* El mensaje del servidor, tal cual: es el que dice qué ha pasado. */}
            <p>{error.message}</p>
            {situacion.arreglo}
            <p className="ayuda">
              Mientras la aplicación no mande correos, el enlace lo hace llegar a mano quien te da de
              alta: pídeselo por donde habléis normalmente.
            </p>
          </section>
        ) : null}

        {fase === 'fallo' && !situacion ? (
          <section className="tarjeta">
            <header className="tarjeta-cab">
              <h2>No se ha podido comprobar el enlace</h2>
              <span className="chip chip-error">no has entrado</span>
            </header>
            <p>{error.message}</p>
            <p className="suave">
              {reintentable
                ? 'El enlace no se ha gastado: ha fallado la comprobación, no el enlace. Vuelve a intentarlo.'
                : 'Comprueba que has pegado el enlace completo, con la parte final «?t=…» incluida.'}
            </p>
            {reintentable ? (
              <p>
                <button className="btn-primario" type="button" onClick={() => setIntento((n) => n + 1)}>
                  Volver a intentarlo
                </button>
              </p>
            ) : null}
          </section>
        ) : null}

        {fase === 'sin-testigo' ? (
          <ComoSeEntra titulo="Has llegado aquí sin enlace">
            <p>
              Esta dirección solo sirve con el enlace que te hayan mandado: lleva dentro una llave de
              un solo uso. Sin ella no hay nada que comprobar y <strong>no hay nada que rellenar</strong>.
            </p>
          </ComoSeEntra>
        ) : null}

        {fase !== 'dentro' && fase !== 'canjeando' ? (
          <p className="ayuda">
            Si crees que ya tienes sesión en este navegador, <a className="enlace" href="/">mira los
            documentos</a>: si te deja, estás dentro.
          </p>
        ) : null}
      </main>
    </>
  );
}
