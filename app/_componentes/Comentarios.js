// El hilo de comentarios de un apartado, en el panel derecho.
//
// `GET` y `POST /api/documentos/[id]/comentarios?seccion=&unidad=`. Referencia: el
// punto 13 y el punto 21 de docs/mockup-v2/CAMBIOS.md y `pintarPanel` de
// docs/mockup-v2/js/ui.js.
//
// PARA QUÉ SIRVE: PEDIR UNA ACLARACIÓN SIN SALIR DE LA HERRAMIENTA
//
// Hoy esa pregunta se manda por correo o se dice en la reunión de departamento, y
// en los dos casos se pierde: no queda al lado del apartado del que habla, que es
// el único sitio donde la encuentra quien va a arreglarlo. El hilo cuelga del
// apartado —del par (sección, unidad), el mismo que identifica el contenido— y el
// id de un apartado no cambia al renombrarlo, así que la conversación no se queda
// huérfana (core/plantilla.js).
//
// COMENTA TODO EL QUE VE EL DOCUMENTO, NO SOLO QUIEN PUEDE EDITARLO
//
// Es la decisión del evolutivo y está explicada en la ruta
// (`app/_lib/rutas/comentarios.js`): quien pregunta es justamente quien no puede
// escribir ahí —la jefatura de estudios, que aprueba y no edita nada; el docente
// de otro módulo que ve un solapamiento—, así que exigir permiso de edición
// habría dejado fuera a quien más lo necesita. Quien decide es el servidor, y
// `puedeComentar` viene en la respuesta: aquí no se deduce.
//
// Y SE DICE QUE NO ES UN MENSAJE PRIVADO. Un hilo que parece un correo y lo lee el
// departamento entero es una trampa: la caja lo advierte en una línea.
//
// EL TEXTO NO SE PIERDE SI EL ENVÍO FALLA
//
// Si el servidor se niega —la sesión ha caducado, el apartado se ha retirado— el
// campo se queda con lo escrito y el motivo sale al lado. Un formulario que se
// vacía al fallar te hace escribirlo dos veces.

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { pedir } from './api';
import { ROLES } from './etiquetas';

// La fecha de un comentario, corta y legible, con la completa en el `title`. Se
// pinta con `Intl` del navegador y no con una plantilla propia: el hilo se carga
// después de montar, así que no hay riesgo de que el servidor y el navegador
// escriban fechas distintas.
const CORTA = { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' };

function fechaCorta(valor) {
  const f = new Date(valor);
  if (Number.isNaN(f.getTime())) return '';
  try {
    return f.toLocaleString('es-ES', CORTA);
  } catch (e) {
    return f.toISOString().slice(0, 16).replace('T', ' ');
  }
}

const fechaLarga = (valor) => {
  const f = new Date(valor);
  if (Number.isNaN(f.getTime())) return '';
  try {
    return f.toLocaleString('es-ES', { dateStyle: 'full', timeStyle: 'short' });
  } catch (e) {
    return f.toISOString();
  }
};

export default function Comentarios({ documentoId, seccion, unidadId, persona }) {
  const [cuerpo, setCuerpo] = useState(null);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [falloEnvio, setFalloEnvio] = useState(null);
  const [ultimo, setUltimo] = useState('');
  const campo = useRef(null);

  const consulta = useCallback(() => {
    const q = new URLSearchParams({ seccion });
    if (unidadId) q.set('unidad', unidadId);
    return q.toString();
  }, [seccion, unidadId]);

  const url = `/api/documentos/${encodeURIComponent(documentoId)}/comentarios`;

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    setError(null);
    setFalloEnvio(null);
    setUltimo('');
    // El borrador sin mandar es de SU apartado: al cambiar de apartado se borra,
    // porque una nota escrita para «Metodología» no se manda a «Evaluación».
    setTexto('');
    pedir(`${url}?${consulta()}`)
      .then((r) => { if (vivo) setCuerpo(r); })
      .catch((e) => { if (vivo) { setCuerpo(null); setError(e); } })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [url, consulta]);

  async function enviar(ev) {
    ev.preventDefault();
    const limpio = texto.trim();
    if (!limpio || enviando) return;
    setEnviando(true);
    setFalloEnvio(null);
    try {
      const r = await pedir(`${url}?${consulta()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto: limpio }),
      });
      // Se añade el comentario que devuelve el servidor —con su fecha y su autor
      // tal como se han guardado— en lugar de uno montado aquí: así lo que se lee
      // es lo que hay escrito, no lo que creemos haber mandado.
      setCuerpo((previo) => (previo ? {
        ...previo,
        comentarios: previo.comentarios.concat([r.comentario]),
        total: previo.total + 1,
      } : previo));
      setTexto('');
      setUltimo('Comentario añadido.');
      if (campo.current) campo.current.focus();
    } catch (e) {
      // El texto NO se borra: que falle el envío no puede costar lo escrito.
      setFalloEnvio(e);
      setUltimo('');
    } finally {
      setEnviando(false);
    }
  }

  const comentarios = (cuerpo && cuerpo.comentarios) || [];
  const puedeComentar = !!(cuerpo && cuerpo.puedeComentar);
  const largoMaximo = (cuerpo && cuerpo.largoMaximo) || 2000;

  return (
    <div className="panel-caja">
      <header>
        Comentarios
        {comentarios.length ? <span className="suave"> · {comentarios.length}</span> : null}
      </header>

      {/* LA REGIÓN QUE ANUNCIA EXISTE SIEMPRE, AUNQUE ESTÉ VACÍA. Un `aria-live`
          que aparece a la vez que su texto no se anuncia de forma fiable: el
          lector de pantalla tiene que haber visto la región antes de que cambie
          (es la misma razón que en Reparto.js). */}
      <div className="sr" role="status" aria-live="polite">{ultimo}</div>

      {cargando ? <p className="suave">Cargando el hilo…</p> : null}

      {error ? (
        <div className="nota nota-lock" role="alert">
          <div>
            {error.message}
            {error.codigo === 'no_disponible' ? (
              <p className="suave">
                La ruta <code>/api/documentos/[id]/comentarios</code> es del E7.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {!cargando && !error ? (
        <ul className="hilo">
          {comentarios.length ? comentarios.map((c) => (
            <li key={c._id}>
              <b>{c.autor.nombre || 'Alguien que ya no está en el censo'}</b>
              {c.autor.rol ? (
                <span className="suave">{ROLES[c.autor.rol] || c.autor.rol}{' · '}</span>
              ) : null}
              <span className="suave">
                <time dateTime={c.fecha} title={fechaLarga(c.fecha)}>{fechaCorta(c.fecha)}</time>
              </span>
              <p>{c.texto}</p>
            </li>
          )) : (
            <li className="suave">Todavía nadie ha comentado este apartado.</li>
          )}
        </ul>
      ) : null}

      {!cargando && !error && puedeComentar ? (
        <form id="form-comentario" onSubmit={enviar}>
          <label className="sr" htmlFor="texto-comentario">
            Comentario sobre este apartado
          </label>
          <textarea
            id="texto-comentario"
            ref={campo}
            rows={2}
            value={texto}
            maxLength={largoMaximo}
            disabled={enviando}
            onChange={(ev) => setTexto(ev.target.value)}
            placeholder="Pedir una aclaración, dejar una nota al compañero…"
          />
          {falloEnvio ? (
            <span className="rojo" role="alert">
              No se ha podido comentar: {falloEnvio.message} Lo que has escrito sigue aquí.
            </span>
          ) : null}
          {/* No se desactiva por estar el campo vacío —el tabulador se saltaría
              el botón y quien navega con teclado no llegaría a leerlo, que es la
              misma razón que en Reparto.js—: se pulsa y no pasa nada, porque
              `enviar` no manda un comentario vacío. Solo se desactiva mientras se
              está mandando, para no mandarlo dos veces. */}
          <button className="btn-ghost" type="submit" disabled={enviando}>
            {enviando
              ? 'Comentando…'
              : `Comentar como ${persona ? persona.nombre : 'ti'}`}
          </button>
          {/* Un hilo que parece un correo y lo lee el departamento entero es una
              trampa: se dice. */}
          <span className="ayuda">
            Lo ve todo el que ve este documento, y queda guardado junto al apartado. No es un mensaje
            privado.
          </span>
        </form>
      ) : null}

      {!cargando && !error && !puedeComentar ? (
        <p className="ayuda">Puedes leer el hilo, pero no escribir en él.</p>
      ) : null}
    </div>
  );
}
