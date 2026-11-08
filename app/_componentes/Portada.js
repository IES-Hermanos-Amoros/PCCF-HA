// La portada: qué documentos hay, cómo se sube uno nuevo y, si no has entrado,
// cómo se entra.
//
// Referencia: docs/mockup-v2/index.html. El prototipo enseña los departamentos
// del centro porque es lo que tenía a mano; aquí se enseñan los documentos del
// departamento de quien mira, que es lo que la API devuelve y lo que hace falta
// para empezar a trabajar. Quién ve qué lo decide el servidor: un docente ve los
// de su departamento, la jefatura de estudios y el soporte los de todos
// (app/_lib/rutas/documentos.js).
//
// Agrupados por tipo —programación didáctica, PCCF, memoria— y dentro por curso
// del más reciente al más antiguo, porque la pregunta que se le hace a esta
// pantalla en septiembre es «dónde está la PD de este curso».
//
// SIN SESIÓN NO SALTA UN 401 EN CRUDO
//
// Desde el E2 todas las rutas exigen sesión, así que quien abre la aplicación sin
// haber entrado recibe un 401 en la lista de documentos. Eso no es un error que
// haya que enseñar: es el estado normal de quien llega por primera vez, y lo que
// necesita es que se le diga cómo se entra (ComoSeEntra.js). En el E1 aquí había
// un aviso que decía «elige arriba con quién vas a trabajar», que es justo lo que
// ya no existe.

'use client';

import { useEffect, useState } from 'react';
import BarraSuperior from './BarraSuperior';
import ComoSeEntra from './ComoSeEntra';
import Subida from './Subida';
import { pedir } from './api';
import { useSesion } from './sesion-cliente';
import { NOMBRE_ESTADO_DOC, NOMBRE_TIPO } from './etiquetas';

// El orden en que se enseñan los tipos: la programación didáctica primero
// porque es la que se toca cada semana, y la propuesta pedagógica de ESO y
// Bachillerato justo detrás, que es lo mismo un nivel más arriba.
const ORDEN_TIPOS = ['programacion_didactica', 'pd', 'propuesta_pedagogica', 'pccf', 'memoria'];

const porTipo = (documentos) => {
  const grupos = new Map();
  for (const d of documentos) {
    const k = d.tipo || 'otros';
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(d);
  }
  const claves = [...grupos.keys()].sort((a, b) => {
    const ia = ORDEN_TIPOS.indexOf(a);
    const ib = ORDEN_TIPOS.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  return claves.map((k) => ({
    tipo: k,
    // Por curso descendente y, dentro del mismo curso, por ciclo: así los dos
    // ciclos del curso en marcha salen juntos y arriba.
    documentos: grupos.get(k).slice().sort((a, b) => String(b.curso || '').localeCompare(String(a.curso || ''))
      || String(a.ciclo || '').localeCompare(String(b.ciclo || ''), 'es')),
  }));
};

export default function Portada() {
  // Quién soy lo contesta el servidor: la cookie de sesión es `HttpOnly` y el
  // navegador no la puede leer (sesion-cliente.js).
  const { persona, cargando: cargandoSesion, error: errorSesion } = useSesion();

  const [documentos, setDocumentos] = useState(null);
  const [error, setError] = useState(null);
  // `puedeGestionar` lo manda `GET /api/personas` y sirve solo para ofrecer el
  // enlace al censo: quien decide es cada ruta.
  const [puedeGestionar, setPuedeGestionar] = useState(false);

  const cargarDocumentos = () => pedir('/api/documentos')
    .then((r) => { setDocumentos(r.documentos || []); setError(null); })
    .catch((e) => { setDocumentos([]); setError(e); });

  useEffect(() => {
    let vivo = true;
    cargarDocumentos();
    pedir('/api/personas')
      .then((r) => { if (vivo) setPuedeGestionar(!!r.puedeGestionar); })
      // Sin sesión esto es un 401, que ya explica la tarjeta de «cómo se entra».
      .catch(() => { if (vivo) setPuedeGestionar(false); });
    return () => { vivo = false; };
  }, []);

  const sinIdentificar = (error && error.codigo === 'sin_identificar')
    || (!cargandoSesion && !persona);
  const grupos = documentos ? porTipo(documentos) : [];

  return (
    <>
      <BarraSuperior persona={persona} aqui="documentos" />

      <main className="main">
        <div className="cabecera">
          <div>
            <h1>Documentos del departamento</h1>
            <p className="suave">
              Aquí se redactan la programación didáctica, el proyecto curricular del ciclo y la
              memoria, y desde aquí se exportan a PDF y a Word.
            </p>
          </div>
          {puedeGestionar ? (
            <div className="cabecera-derecha">
              <a className="btn-ghost" href="/personas">Personas del departamento</a>
            </div>
          ) : null}
        </div>

        {/* Lo primero que se ve sin sesión, y no un error: no hay registro, da de
            alta la jefatura y se entra con un enlace. */}
        {sinIdentificar ? (
          <ComoSeEntra titulo="Para ver los documentos hay que entrar">
            <p>
              Todavía no has entrado en este navegador, así que no hay nada que enseñarte: los
              documentos son del departamento y el servidor no los manda sin saber quién pregunta.
            </p>
          </ComoSeEntra>
        ) : null}

        {errorSesion ? (
          <div className="nota nota-lock" role="alert"><div>{errorSesion.message}</div></div>
        ) : null}

        {error && !sinIdentificar ? (
          <div className="nota nota-lock" role="alert"><div>{error.message}</div></div>
        ) : null}

        {documentos === null && !sinIdentificar ? <p className="suave">Buscando documentos…</p> : null}

        {documentos && documentos.length === 0 && !sinIdentificar ? (
          <section className="tarjeta">
            <header className="tarjeta-cab"><h2>Todavía no hay ningún documento</h2></header>
            <p className="suave">
              Sube el <code>.docx</code> de una programación con el formulario de abajo y la
              herramienta deduce su estructura, reconoce los módulos y la guarda por apartados.
            </p>
          </section>
        ) : null}

        {grupos.map((g) => (
          <section className="tarjeta" key={g.tipo}>
            <header className="tarjeta-cab">
              <h2>{NOMBRE_TIPO[g.tipo] || g.tipo}</h2>
              <span className="suave">{g.documentos.length === 1 ? '1 documento' : `${g.documentos.length} documentos`}</span>
            </header>
            <table className="tabla">
              <thead>
                <tr>
                  <th>Documento</th>
                  <th>Ciclo</th>
                  <th>Curso</th>
                  <th>Estado</th>
                  <th>Departamento</th>
                </tr>
              </thead>
              <tbody>
                {g.documentos.map((d) => (
                  <tr key={d._id}>
                    <td>
                      <a className="enlace" href={`/doc/${encodeURIComponent(d._id)}`}>
                        {NOMBRE_TIPO[d.tipo] || d.tipo}
                        {d.ciclo ? ' · ' + String(d.ciclo).toUpperCase() : ''}
                        {d.curso ? ' · ' + d.curso : ''}
                      </a>
                      {d.origen ? <div className="ayuda">importado de {d.origen}</div> : null}
                      {/* El reparto lo puede VER cualquiera que vea el documento:
                          un docente necesita saber quién más lleva su módulo.
                          Cambiarlo es otra cosa, y lo dice esa pantalla. */}
                      <div>
                        <a className="enlace ayuda" href={`/reparto/${encodeURIComponent(d._id)}`}>
                          quién lleva cada unidad
                        </a>
                      </div>
                    </td>
                    <td>{d.ciclo ? String(d.ciclo).toUpperCase() : <span className="suave">—</span>}</td>
                    <td>{d.curso || <span className="suave">—</span>}</td>
                    <td>
                      <span className={'chip' + (d.estado === 'aprobado' ? ' chip-validado' : '')}>
                        {NOMBRE_ESTADO_DOC[d.estado] || d.estado}
                      </span>
                    </td>
                    <td className="suave">{d.departamento || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}

        {/* Sin sesión no se ofrece el formulario de subida: no hay a quién
            atribuir la importación y el servidor la rechazaría con un 401. */}
        {persona ? (
          <Subida
            departamentoPorOmision={persona.departamento || 'informatica'}
            rol={persona.rol}
            habilitado
            alImportar={cargarDocumentos}
          />
        ) : null}
      </main>
    </>
  );
}
