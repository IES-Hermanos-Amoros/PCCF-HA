// La barra de arriba, la misma en la portada y en el visor.
//
// Es la del prototipo con las piezas que el E1 tiene: marca, el documento con el
// que se está trabajando, el selector de persona, el botón de tema y los de
// exportar. Lo que no está todavía —curso, vistas de cambios, validaciones y
// coordinación— no se deja como botón apagado: un botón que no hace nada no se
// distingue de uno estropeado, que es exactamente lo que se corrigió de la barra
// de formato del v1.
//
// El botón ☰ conserva el `id="btn-cajon"` del prototipo porque la hoja de
// estilos lo esconde por ese id y solo lo enseña por debajo de 900 px. Lo mismo
// con `#btn-tema`.

'use client';

import Link from 'next/link';
import SelectorPersona from './SelectorPersona';
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

export default function BarraSuperior({
  subtitulo, personas, personaId, onCajon, documentos, documentoId, exportar,
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

      <div className="topbar-derecha">
        <SelectorPersona personas={personas} personaId={personaId} roles={ROLES} />
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
