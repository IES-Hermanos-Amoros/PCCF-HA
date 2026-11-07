// La portada: qué documentos hay y cómo se sube uno nuevo.
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

'use client';

import { useEffect, useState } from 'react';
import BarraSuperior from './BarraSuperior';
import Subida from './Subida';
import { pedir } from './api';
import { personaDeLaCookie, AVISO } from './SelectorPersona';
import { NOMBRE_ESTADO_DOC, NOMBRE_TIPO } from './etiquetas';

// El orden en que se enseñan los tipos: la programación didáctica primero
// porque es la que se toca cada semana.
const ORDEN_TIPOS = ['programacion_didactica', 'pd', 'pccf', 'memoria'];

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
  const [personas, setPersonas] = useState([]);
  const [documentos, setDocumentos] = useState(null);
  const [error, setError] = useState(null);
  // La cookie se lee en un efecto y no al pintar: en el servidor no hay
  // `document`, así que leerla durante el render daría un HTML distinto del que
  // pinta el navegador y React avisaría de que la hidratación no cuadra.
  const [personaId, setPersonaId] = useState(null);
  useEffect(() => { setPersonaId(personaDeLaCookie()); }, []);

  const cargarDocumentos = () => pedir('/api/documentos')
    .then((r) => { setDocumentos(r.documentos || []); setError(null); })
    .catch((e) => { setDocumentos([]); setError(e); });

  useEffect(() => {
    let vivo = true;
    pedir('/api/personas')
      .then((r) => { if (vivo) setPersonas(r.personas || []); })
      .catch((e) => { if (vivo) setError(e); });
    cargarDocumentos();
    return () => { vivo = false; };
  }, []);

  const persona = personas.find((p) => p._id === personaId) || null;
  const sinIdentificar = error && error.codigo === 'sin_identificar';
  const grupos = documentos ? porTipo(documentos) : [];

  return (
    <>
      <BarraSuperior personas={personas} personaId={personaId} />

      <main className="main">
        <div className="cabecera">
          <div>
            <h1>Documentos del departamento</h1>
            <p className="suave">
              Aquí se redactan la programación didáctica, el proyecto curricular del ciclo y la
              memoria, y desde aquí se exportan a PDF y a Word.
            </p>
          </div>
        </div>

        {/* Mientras no haya autenticación hay que elegir con quién se trabaja, y
            tiene que quedar claro que eso no es identificarse. Sin persona la
            API devuelve 401 en todo menos en la lista de personas, así que esta
            nota es además la explicación del error. */}
        {!personaId || sinIdentificar ? (
          <div className="nota">
            <div>
              <strong>Elige arriba con quién vas a trabajar.</strong>
              <p className="suave" style={{ margin: '4px 0 0' }}>{AVISO}</p>
            </div>
          </div>
        ) : null}

        {error && !sinIdentificar ? (
          <div className="nota nota-lock"><div>{error.message}</div></div>
        ) : null}

        {documentos === null ? <p className="suave">Buscando documentos…</p> : null}

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

        <Subida
          departamentoPorOmision={persona ? persona.departamento : 'informatica'}
          rol={persona ? persona.rol : null}
          habilitado={!!personaId}
          alImportar={cargarDocumentos}
        />
      </main>
    </>
  );
}
