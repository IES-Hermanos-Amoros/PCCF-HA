// Las versiones de un documento: `/versiones/<documentoId>`.
//
// Reimportar un Word para un curso que ya tiene documento no lo pisa: entra como versión alternativa
// (docs/plan.md §8). Esta pantalla es donde se ven todas, se sube otra, se elige cuál es la activa y se
// borran las que sobran.
//
// LO QUE SE DICE ANTES DE PULSAR
//
//   - activar no borra nada: la que estaba activa queda como alternativa, con sus ediciones intactas, y
//     se puede volver a activar;
//   - borrar no se puede deshacer, y pide una segunda pulsación con lo que se destruye a la vista.
//
// QUIÉN PUEDE no se decide aquí: `puedeActivar`, `puedeBorrar` y `puedeSubir` vienen resueltos de la API
// y el servidor vuelve a comprobarlos (core/permisos.js). La versión activa no ofrece borrar.

'use client';

import { useCallback, useEffect, useState } from 'react';
import Ayuda from './Ayuda';
import BarraSuperior from './BarraSuperior';
import { pedir } from './api';
import { useSesion } from './sesion-cliente';
import useConfirmacion from './confirmar-cliente';
import { NOMBRE_TIPO } from './etiquetas';

const fecha = (iso) => {
  if (!iso) return 'fecha desconocida';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'fecha desconocida' : d.toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' });
};

const tamano = (bytes) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

const base = (id) => `/api/documentos/${encodeURIComponent(id)}`;

export default function Versiones({ documentoId }) {
  const { persona: yo } = useSesion();
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [trabajando, setTrabajando] = useState(null);
  // La versión cuyo borrado espera la segunda pulsación.
  const confirma = useConfirmacion();
  const [archivo, setArchivo] = useState(null);

  const cargar = useCallback(() => pedir(`${base(documentoId)}/versiones`)
    .then((r) => { setDatos(r); setError(null); })
    .catch((e) => { setError(e); setDatos(null); }), [documentoId]);

  useEffect(() => { cargar(); }, [cargar]);

  const hacer = async (clave, accion, mensaje) => {
    setTrabajando(clave);
    setAviso(null);
    try {
      const r = await accion();
      setAviso({ tipo: 'bien', texto: typeof mensaje === 'function' ? mensaje(r) : mensaje });
      await cargar();
      confirma.terminar();
    } catch (e) {
      setAviso({ tipo: 'error', texto: e.message });
      confirma.cancelar();
    } finally {
      setTrabajando(null);
    }
  };

  const activar = (v) => hacer(`a-${v._id}`,
    () => pedir(`${base(v._id)}/activar`, { method: 'POST' }),
    `La versión ${v.version} es ahora la activa. La anterior queda como alternativa, con sus ediciones.`);

  const borrar = (v) => hacer(`b-${v._id}`,
    () => pedir(base(v._id), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmar: true }),
    }),
    `Versión ${v.version} borrada.`);

  const subir = () => {
    if (!archivo) { setAviso({ tipo: 'error', texto: 'Elige primero el fichero .docx.' }); return; }
    const cuerpo = new FormData();
    cuerpo.set('archivo', archivo);
    cuerpo.set('tipo', datos.tipo);
    if (datos.ciclo) cuerpo.set('ciclo', datos.ciclo);
    cuerpo.set('curso', datos.curso);
    cuerpo.set('departamento', datos.departamento);
    return hacer('subir',
      () => pedir('/api/documentos/importar', { method: 'POST', body: cuerpo }),
      (r) => `Subida como versión ${r.version}${r.alternativa ? ', alternativa: no se ha tocado la activa' : ''}.`)
      .then(() => setArchivo(null));
  };

  const titulo = datos ? [
    NOMBRE_TIPO[datos.tipo] || datos.tipo,
    datos.ciclo ? String(datos.ciclo).toUpperCase() : null,
    datos.curso,
  ].filter(Boolean).join(' · ') : null;

  if (error) {
    return (
      <>
        <BarraSuperior subtitulo="Versiones" persona={yo} aqui="versiones" />
        <main id="contenido" tabIndex={-1} className="main main-estrecha">
          <div className="cabecera"><div><h1>No se pueden ver las versiones</h1></div></div>
          <div className="nota nota-lock" role="alert"><div>{error.message}</div></div>
          <p><a className="enlace" href="/">Volver a la lista de documentos</a></p>
        </main>
      </>
    );
  }

  return (
    <>
      <BarraSuperior subtitulo={titulo || 'Versiones'} persona={yo} documentoId={documentoId} aqui="versiones" />
      <main id="contenido" tabIndex={-1} className="main main-estrecha">
        <div className="cabecera">
          <div>
            <h1>Versiones del documento</h1>
            <p className="suave">
              {titulo ? <>{titulo}. </> : null}
              Solo la versión activa se lista, se edita, se exporta y se pasa al curso siguiente.
            </p>
          </div>
          <div className="cabecera-derecha">
            <a className="btn-ghost" href={`/doc/${encodeURIComponent(documentoId)}`}>Abrir el documento</a>
          </div>
        </div>

        {datos === null ? <p className="suave">Cargando las versiones…</p> : null}

        {aviso ? (
          <div
            className={aviso.tipo === 'error' ? 'nota nota-error' : 'nota'}
            role={aviso.tipo === 'error' ? 'alert' : 'status'}
            ref={confirma.refAviso}
            tabIndex={-1}
          >
            <div>{aviso.texto}</div>
          </div>
        ) : null}

        {datos ? (
          <section className="tarjeta">
            <header className="tarjeta-cab">
              <h2>{datos.versiones.length === 1 ? 'Una versión' : `${datos.versiones.length} versiones`}</h2>
              <Ayuda sobre="las versiones del documento">
                <p>
                  Si subes un Word para un documento que ya existe —mismo tipo, ciclo, curso y
                  departamento—, <strong>no sustituye al que hay</strong>: entra como versión
                  alternativa y se puede leer, pero no se edita hasta que la actives.
                </p>
                <p>
                  Activar otra versión <strong>no borra nada</strong>: la anterior queda como
                  alternativa con sus ediciones. Cada versión guarda además el Word tal como se subió.
                </p>
              </Ayuda>
            </header>

            <div className="tabla-scroll">
              <table className="tabla tabla-apilable">
                <caption className="sr">Versiones de este documento</caption>
                <thead>
                  <tr>
                    <th scope="col">Versión</th>
                    <th scope="col">Origen</th>
                    <th scope="col">Subida</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.versiones.map((v) => (
                    <tr key={v._id}>
                      <th scope="row" data-etiqueta="Versión">{v.version}</th>
                      <td data-etiqueta="Origen">{v.origen || <span className="suave">sin nombre de fichero</span>}</td>
                      <td data-etiqueta="Subida">
                        {fecha(v.creado)}
                        <div className="suave">{v.subidoPor && v.subidoPor.nombre ? `por ${v.subidoPor.nombre}` : 'autor desconocido'}</div>
                      </td>
                      <td data-etiqueta="Estado">
                        {v.activa
                          ? <span className="chip chip-validado">activa</span>
                          : <span className="chip">alternativa · solo lectura</span>}
                      </td>
                      <td data-etiqueta="Acciones">
                        <div className="compartido-acciones">
                          <a className="mini" href={`/doc/${encodeURIComponent(v._id)}`}>
                            {v.activa ? 'Abrir' : 'Consultar'}
                          </a>
                          {v.copia ? (
                            <a className="mini" href={`${base(v._id)}/copia`} download>
                              Word original ({tamano(v.copia.tamano)})
                            </a>
                          ) : <span className="suave">sin copia del Word</span>}
                          {v.puedeActivar ? (
                            <button
                              type="button"
                              className="mini"
                              disabled={trabajando !== null}
                              onClick={() => activar(v)}
                            >
                              {trabajando === `a-${v._id}` ? 'Activando…' : 'Activar esta versión'}
                            </button>
                          ) : null}
                          {v.puedeBorrar && !confirma.estaAbierta(v._id) ? (
                            <button
                              type="button"
                              className="mini"
                              ref={confirma.refAbrir(v._id)}
                              disabled={trabajando !== null}
                              onClick={() => confirma.abrir(v._id)}
                            >
                              Borrar
                            </button>
                          ) : null}
                        </div>
                        {v.puedeBorrar && confirma.estaAbierta(v._id) ? (
                          <div className="nota nota-error" role="alert">
                            <div>
                              <strong>Se borra la versión {v.version} con todo lo que tenga escrito, y no se puede deshacer.</strong>
                              <div className="compartido-acciones">
                                <button type="button" className="mini" ref={confirma.refPaso} disabled={trabajando !== null} onClick={() => borrar(v)}>
                                  {trabajando === `b-${v._id}` ? 'Borrando…' : `Sí, borrar la versión ${v.version}`}
                                </button>
                                <button type="button" className="mini" onClick={confirma.cancelar}>Cancelar</button>
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {datos && datos.puedeSubir ? (
          <section className="tarjeta">
            <header className="tarjeta-cab">
              <h2>Subir otra versión</h2>
              <span className="suave">entra como alternativa; no toca la activa</span>
            </header>
            <div className="linea-estructura">
              <label htmlFor="archivo-version">Fichero .docx</label>
              <input
                id="archivo-version"
                type="file"
                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(ev) => setArchivo((ev.target.files && ev.target.files[0]) || null)}
                disabled={trabajando !== null}
              />
            </div>
            <div className="compartido-acciones">
              <button type="button" className="btn-primario" disabled={!archivo || trabajando !== null} onClick={subir}>
                {trabajando === 'subir' ? 'Subiendo…' : 'Subir como versión alternativa'}
              </button>
            </div>
          </section>
        ) : null}
      </main>
    </>
  );
}
