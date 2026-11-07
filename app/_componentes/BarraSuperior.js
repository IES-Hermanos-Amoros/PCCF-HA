// La barra de arriba, la misma en todas las pantallas.
//
// Es la del prototipo con las piezas que hay: marca, el documento con el que se
// está trabajando, el selector de vista, quién eres, el botón de tema y los de
// exportar. Lo que no está todavía —el selector de curso, que se navega por el
// enlace al documento del curso anterior— no se deja como botón apagado: un botón
// que no hace nada no se distingue de uno estropeado, que es exactamente lo que
// se corrigió de la barra de formato del v1. Por eso el selector de vista solo
// lleva las vistas que existen, y con el E7 son las cuatro del prototipo:
// Contenido · Cambios · Validaciones · Coordinación (la lista la pone Visor.js).
//
// DONDE ESTABA EL DESPLEGABLE DE PERSONA AHORA ESTÁ QUIÉN ERES
//
// En el E1 había un `<select>` con todo el censo: se elegía con quién trabajar y
// la elección iba en una cookie `persona` que cualquiera podía escribir. Eso se
// ha retirado entero (`SelectorPersona.js` ya no existe) porque ya no identifica
// a nadie: la identidad viene de la sesión, y aquí solo se refleja.
//
// Y el botón de salir CIERRA SESIÓN POR LA API, que revoca la sesión en el
// servidor; no borra una cookie —que además no podría, es `HttpOnly`—. Un
// «salir» que solo le dijera al navegador que se olvide de la llave sería
// mentira para quien la hubiera copiado antes.
//
// El botón ☰ conserva el `id="btn-cajon"` del prototipo porque la hoja de
// estilos lo esconde por ese id y solo lo enseña por debajo de 900 px. Lo mismo
// con `#btn-tema`.

'use client';

import Link from 'next/link';
import { useState } from 'react';
import { cerrarSesion } from './sesion-cliente';
import { ROLES } from './etiquetas';

const Logo = () => (
  <svg viewBox="0 0 32 32" className="logo" aria-hidden="true">
    <rect x="2" y="4" width="20" height="26" rx="3" fill="var(--azul)" />
    <path d="M8 11h8M8 16h8M8 21h5" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    <path d="M18 2h9a3 3 0 0 1 3 3v18" fill="none" stroke="var(--acento)" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

const Descarga = () => (
  <svg viewBox="0 0 24 24" className="ico" aria-hidden="true">
    <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const Cara = () => (
  <svg viewBox="0 0 24 24" className="ico" aria-hidden="true">
    <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 9a8 8 0 0 1 16 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const Salida = () => (
  <svg viewBox="0 0 24 24" className="ico" aria-hidden="true">
    <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 8l-4 4 4 4M6 12h9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function BotonTema() {
  // El tema se guarda en `localStorage` y se aplica al `<html>`, igual que en el
  // prototipo, para que los dos se comporten igual al abrirlos seguidos.
  const alternar = () => {
    const raiz = document.documentElement;
    raiz.dataset.tema = raiz.dataset.tema === 'oscuro' ? 'claro' : 'oscuro';
    try { localStorage.setItem('tema', raiz.dataset.tema); } catch (e) { /* sin localStorage */ }
  };
  return (
    <button className="icono-btn" id="btn-tema" onClick={alternar} title="Cambiar entre tema claro y oscuro" aria-label="Cambiar tema">
      <svg viewBox="0 0 24 24" className="ico">
        <path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

// Quién eres y cómo se sale. Sin sesión no se pinta un hueco: se dice que no
// hay sesión y se ofrece la pantalla que explica cómo se entra, porque un
// usuario sin sesión que ve la barra vacía no sabe si es que no ha cargado.
function Identidad({ persona }) {
  const [saliendo, setSaliendo] = useState(false);

  if (!persona) {
    return (
      <Link className="btn-ghost" href="/acceso">
        <Cara />
        Sin sesión · cómo se entra
      </Link>
    );
  }

  return (
    <div className="persona">
      <Cara />
      <span className="persona-nombre">{persona.nombre}</span>
      {/* El rol va en texto, no en un color: es un dato que hay que poder leer. */}
      <span className="etiqueta-rol">{ROLES[persona.rol] || persona.rol}</span>
      <button
        type="button"
        className="salir"
        disabled={saliendo}
        onClick={() => { setSaliendo(true); cerrarSesion(); }}
        title="Cerrar sesión en el servidor: la sesión se revoca y este navegador deja de valer"
      >
        <Salida />
        {saliendo ? 'Saliendo…' : 'Salir'}
      </button>
    </div>
  );
}

export default function BarraSuperior({
  subtitulo, persona, onCajon, documentos, documentoId, exportar, vistas, vista, onVista,
}) {
  return (
    <header className="topbar">
      {onCajon ? (
        <button className="icono-btn" id="btn-cajon" onClick={onCajon} aria-label="Mostrar la estructura del documento">
          <svg viewBox="0 0 24 24" className="ico">
            <path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      ) : null}

      <Link className="marca" href="/" title="Volver a la lista de documentos">
        <Logo />
        <div className="marca-texto">
          <strong>PCCF·HA</strong>
          <span>{subtitulo || 'Departamento de Informática'}</span>
        </div>
      </Link>

      {documentos && documentos.length ? (
        <>
          <label className="sr" htmlFor="selector-doc">Documento</label>
          <select
            id="selector-doc"
            className="selector-doc"
            value={documentoId || ''}
            onChange={(ev) => { window.location.href = `/doc/${ev.target.value}`; }}
          >
            {documentos.map((d) => (
              <option key={d._id} value={d._id}>{d.corto}</option>
            ))}
          </select>
        </>
      ) : null}

      {/* El selector de vista, donde lo pone el prototipo. `aria-pressed` y no
          `role="tab"`: no hay panel de pestañas debajo, hay dos pantallas
          distintas, y un grupo de botones que dicen si están pulsados se lee
          bien con el teclado y con lector. */}
      {vistas && vistas.length > 1 ? (
        <div className="segmentado" role="group" aria-label="Vista">
          {vistas.map((v) => (
            <button
              type="button"
              key={v.id}
              className={v.id === vista ? 'on' : ''}
              aria-pressed={v.id === vista}
              onClick={() => onVista(v.id)}
            >
              {v.etiqueta}
            </button>
          ))}
        </div>
      ) : null}

      <div className="topbar-derecha">
        <Identidad persona={persona} />
        <BotonTema />
        {exportar ? (
          <>
            {/* Los dos botones exportan el documento entero. La exportación de
                un módulo suelto está en la ficha de la unidad, que es donde se
                sabe de qué módulo se habla.

                El PDF se ABRE y el Word se DESCARGA, que es lo que dicen las dos
                rutas en su `Content-Disposition`: una programación se repasa en
                el visor del navegador, y un .docx no se mira en el navegador, se
                abre con Word. Poner `download` en el PDF obligaría a guardarlo
                para leerlo. */}
            <a className="btn-ghost" href={exportar.docx} download>Word</a>
            <a className="btn-primario" href={exportar.pdf} target="_blank" rel="noopener">
              <Descarga />
              PDF
            </a>
          </>
        ) : null}
      </div>
    </header>
  );
}
