// Quién lleva cada apartado común del documento, y qué puede editar quien mira.
// Se pinta dentro de la pantalla de Reparto (`/reparto/<documentoId>`), debajo de la matriz de módulos.
//
// Los módulos se reparten por unidad; esto es lo otro: los apartados comunes que edita la jefatura
// y que pueden requerir colaboración (`/api/documentos/[id]/asignaciones`, docs/api.md).
//
// Como en la matriz de módulos:
//   - cada casilla guarda la LISTA COMPLETA de quién lleva el apartado, no «añade a este»;
//   - sin permiso las casillas no se desactivan (se las saltaría el tabulador): se marcan con
//     `aria-disabled` y llevan el motivo por `aria-describedby`;
//   - un 400 con `invalidos` significa que no se ha guardado nada, y se dice.
//
// «Lo que puedes editar» sale del servidor (`mios`): la pantalla no vuelve a escribir la regla de
// permisos, solo la cuenta.

'use client';

import { useCallback, useEffect, useState } from 'react';
import { pedir } from './api';

const idSeguro = (valor) => String(valor).replace(/[^A-Za-z0-9_-]/g, '-');
const MOTIVO = 'motivo-no-asigna';

export default function ApartadosComunes({ documentoId }) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(null);
  const [resultado, setResultado] = useState(null);

  const url = `/api/documentos/${encodeURIComponent(documentoId)}/asignaciones`;
  const cargar = useCallback(() => pedir(url)
    .then((r) => { setDatos(r); setError(null); })
    .catch((e) => { setError(e); setDatos(null); }), [url]);

  useEffect(() => { cargar(); }, [cargar]);

  if (error) {
    return (
      <div className="nota nota-lock" role="alert"><div>{error.message}</div></div>
    );
  }
  if (!datos) return <p className="suave">Cargando los apartados comunes…</p>;

  const { apartados, personas, mios, puedeAsignar, resumen } = datos;
  const enlace = (seccion) => `/doc/${encodeURIComponent(documentoId)}/${seccion.split("/").map(encodeURIComponent).join("/")}`;

  async function alternar(a, personaId, marcar) {
    const lista = marcar ? a.personas.concat([personaId]) : a.personas.filter((id) => id !== personaId);
    const quien = personas.find((p) => p._id === personaId);
    setGuardando(a.seccion);
    setResultado(null);
    try {
      await pedir(`${url}?seccion=${encodeURIComponent(a.seccion)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personas: lista }),
      });
      await cargar();
      setResultado({ tipo: 'ok', texto: `${a.titulo}: ${marcar ? 'añadida' : 'quitada'} ${quien ? quien.nombre : 'la persona'}` });
    } catch (e) {
      await cargar();
      setResultado({ tipo: 'mal', texto: e.message, nada: e.estado === 400 });
    } finally {
      setGuardando(null);
    }
  }

  return (
    <>
      <section className="tarjeta" aria-labelledby="titulo-mios">
        <header className="tarjeta-cab"><h2 id="titulo-mios">Lo que puedes editar</h2></header>
        {mios.editaTodo ? (
          <p>Puedes editar todo el documento.</p>
        ) : (
          <>
            {mios.soloLectura ? <p>Tu rol no edita ningún apartado: ves el documento en solo lectura.</p> : null}
            {!mios.soloLectura ? (
              <>
                <p><strong>Módulos:</strong>{' '}
                  {mios.unidades.length ? mios.unidades.map((u) => u.titulo).join(', ') : 'ninguno'}</p>
                <p><strong>Apartados comunes:</strong>{' '}
                  {mios.apartados.length ? (
                    mios.apartados.map((a, i) => (
                      <span key={a.seccion}>
                        {i ? ', ' : ''}<a className="enlace" href={enlace(a.seccion)}>{a.titulo}</a>
                      </span>
                    ))
                  ) : 'ninguno'}
                </p>
                <p className="suave">Todo lo demás lo ves en solo lectura.</p>
              </>
            ) : null}
          </>
        )}
      </section>

      {!puedeAsignar ? (
        <div className="nota" id={MOTIVO}>
          <div>
            <strong>Puedes ver quién lleva cada apartado común, pero no cambiarlo.</strong>{' '}
            Lo asignan la jefatura del departamento y el soporte.
          </div>
        </div>
      ) : null}

      <section className="tarjeta" aria-labelledby="titulo-comunes">
        <header className="tarjeta-cab">
          <h2 id="titulo-comunes">Apartados comunes × personas</h2>
          <span className="suave">{resumen.conPersonas} de {resumen.apartados} con alguien asignado</span>
        </header>
        <p className="suave">
          Los apartados comunes los edita la jefatura del departamento. Asignarlos a alguien es
          opcional y sirve para colaborar; asignar un apartado de primer nivel incluye sus subapartados.
        </p>

        <div className="sr" role="status" aria-live="polite">{resultado ? resultado.texto : ''}</div>
        {resultado ? (
          <div className={resultado.tipo === 'mal' ? 'nota nota-lock' : 'nota'}>
            <div>
              {resultado.texto}
              {resultado.nada ? (
                <p className="suave" style={{ margin: '4px 0 0' }}>
                  <strong>No se ha guardado nada, tampoco las personas que sí valían.</strong>
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {apartados.length === 0 ? (
          <p className="vacio-apartado">Este documento no tiene apartados comunes que se puedan asignar.</p>
        ) : personas.length === 0 ? (
          <p className="vacio-apartado">No hay nadie a quien asignar: faltan personas activas del departamento que den clase.</p>
        ) : (
          <div className="tabla-marco">
            <table className="asig-tabla">
              <caption className="sr">
                Apartados comunes: cada fila es un apartado y cada columna una persona. Marca la casilla
                para que esa persona pueda editar ese apartado.
              </caption>
              <thead>
                <tr>
                  <th className="asig-esquina" scope="col">Apartado</th>
                  {personas.map((p) => (
                    <th className="asig-persona" scope="col" id={`ac-col-${idSeguro(p._id)}`} key={p._id}>
                      <span>{p.nombre}</span>
                      <span className="suave">{p.rol === 'jefe_departamento' ? 'jefatura' : 'docente'}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {apartados.map((a) => {
                  const idFila = `ac-fil-${idSeguro(a.seccion)}`;
                  return (
                    <tr key={a.seccion}>
                      <th scope="row" id={idFila} style={{ paddingLeft: `${(a.nivel - 1) * 16 + 8}px` }}>
                        <span className="asig-titulo">{a.titulo}</span>
                        {guardando === a.seccion ? <span className="chip">guardando…</span> : null}
                      </th>
                      {personas.map((p) => (
                        <td className="asig-celda" key={p._id} headers={`${idFila} ac-col-${idSeguro(p._id)}`}>
                          <label className="asig-casilla">
                            <input
                              type="checkbox"
                              checked={a.personas.includes(p._id)}
                              aria-label={`${a.titulo} · ${p.nombre}`}
                              aria-disabled={puedeAsignar ? undefined : 'true'}
                              aria-describedby={puedeAsignar ? undefined : MOTIVO}
                              onChange={(ev) => {
                                if (!puedeAsignar) { ev.preventDefault(); return; }
                                alternar(a, p._id, ev.target.checked);
                              }}
                            />
                            <span aria-hidden="true" />
                          </label>
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
