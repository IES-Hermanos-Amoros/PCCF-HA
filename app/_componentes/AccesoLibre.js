'use client';

// Elegir con quién entrar, sin enlace de acceso. SOLO PARA PROBAR.
//
// Es lo que hacía el desplegable de persona del mockup y del E1: te pones el
// disfraz que quieras y ves la aplicación con ese rol. El porqué, los tres
// cerrojos que lo apagan y cómo se quita, en app/_lib/rutas/acceso-libre.js.
//
// La pantalla dice en grande lo que es. No por estética: alguien que abra esto
// en una demo tiene que saber en un vistazo que no está viendo cómo se entra de
// verdad, porque de verdad se entra con un enlace de un solo uso.

import { useEffect, useState } from 'react';
import { pedir } from './api';
import { ROLES } from './etiquetas';

export default function AccesoLibre() {
  const [personas, setPersonas] = useState(null);
  const [fallo, setFallo] = useState(null);
  const [entrando, setEntrando] = useState(null);

  useEffect(() => {
    let vivo = true;
    pedir('/api/acceso-libre')
      .then((r) => { if (vivo) setPersonas(r.personas || []); })
      .catch((e) => { if (vivo) setFallo(e); });
    return () => { vivo = false; };
  }, []);

  async function entrar(persona) {
    setEntrando(persona._id);
    setFallo(null);
    try {
      await pedir('/api/acceso-libre', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ persona: persona._id }),
      });
      // Recarga entera, no navegación del cliente: así todo lo que ya estuviera
      // pintado se vuelve a pedir con la sesión nueva y no queda nada de la vieja.
      window.location.href = '/';
    } catch (e) {
      setEntrando(null);
      setFallo(e);
    }
  }

  // Apagado: la ruta responde 404 y no hay nada que enseñar.
  if (fallo && fallo.estado === 404 && personas === null) {
    return (
      <main id="contenido" tabIndex={-1} className="main main-estrecha">
        <h1>No hay nada aquí</h1>
        <p className="ayuda">
          Esta pantalla solo existe mientras se está probando la aplicación, y está apagada.
          Para entrar hace falta el enlace que manda la jefatura del departamento.
        </p>
      </main>
    );
  }

  return (
    <main id="contenido" tabIndex={-1} className="main main-estrecha">
      <div className="tarjeta">
        <div className="tarjeta-cab">
          <h1>Entrar como…</h1>
          <span className="chip chip-error">solo para probar</span>
        </div>

        <p>
          Elige con quién quieres ver la aplicación. <strong>Esto no es cómo se entra de
          verdad</strong>: de verdad la jefatura da de alta a cada persona y manda un enlace de un
          solo uso. Esta pantalla se quita cuando terminen las pruebas.
        </p>
        {/* Lo que pasa al pulsar «Entrar» no se pliega: llegaría tarde. */}
        <p className="ayuda">
          Las personas son inventadas. Cambiar de persona aquí cierra la sesión anterior del
          navegador.
        </p>

        {fallo && fallo.estado !== 404 && (
          <p className="chip chip-error">{fallo.mensaje || 'No se ha podido entrar.'}</p>
        )}

        {personas === null && !fallo && <p className="suave">Cargando…</p>}

        {personas && personas.length === 0 && (
          <p className="suave">
            No hay ninguna persona todavía. Arranca con <code>npm run sembrar</code> o con{' '}
            <code>npm run cargar-reales</code>.
          </p>
        )}

        {personas && personas.length > 0 && (
          <ul className="lista-personas" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {personas.map((p) => (
              <li key={p._id} className="linea-estructura">
                <div>
                  <strong>{p.nombre}</strong>
                  <span className="chip" style={{ marginInlineStart: '.5rem' }}>
                    {ROLES[p.rol] || p.rol}
                  </span>
                  {p.departamento && <span className="ayuda" style={{ marginInlineStart: '.5rem' }}>{p.departamento}</span>}
                </div>
                <button
                  type="button"
                  className="btn-primario"
                  onClick={() => entrar(p)}
                  disabled={!!entrando}
                  aria-label={`Entrar como ${p.nombre}, ${ROLES[p.rol] || p.rol}`}
                >
                  {entrando === p._id ? 'Entrando…' : 'Entrar'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
