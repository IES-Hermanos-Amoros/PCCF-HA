// Empezar el curso siguiente desde este documento.
//
// `POST /api/documentos/[id]/siguiente-curso`. Es la puerta del arrastre entre
// cursos (docs/plan.md §2.1, criterio del E5): hasta que alguien crea el
// documento del curso que viene, no hay nada que comparar ni nada que revisar, y
// la vista *Cambios* no tiene dos versiones delante.
//
// POR QUÉ ESTÁ EN LA PORTADA DEL DOCUMENTO Y NO EN LA BARRA DE ARRIBA
//
// Porque es una decisión sobre UN documento concreto —se arrastra la PD de DAW de
// 2026-27, no «el curso»— y la portada es la única pantalla donde se está
// mirando el documento entero, con su curso y su estado delante. En la barra
// superior sería un botón que no dice sobre qué actúa, que es el fallo que el
// mockup v2 corrigió de la barra de formato del v1.
//
// LO QUE HACE SE DICE ANTES DE PULSARLO
//
// Crea un documento nuevo que se puede borrar mal y copia el trabajo de un
// departamento entero, así que la tarjeta dice exactamente qué va a pasar: el
// contenido se copia intacto, todos los apartados nacen `heredado`, el progreso
// empieza en 0 % y el documento de partida no se toca. Un botón que crea un
// documento de 220 apartados sin decir qué copia es un botón que nadie pulsa.
//
// QUIÉN PUEDE: lo decide el servidor (la jefatura de departamento y el soporte,
// en su departamento). Aquí se refleja para no ofrecer un botón que va a dar un
// 403, con el mismo criterio que el formulario de subida.

'use client';

import { useState } from 'react';
import Ayuda from './Ayuda';
import { pedir } from './api';
import { CURSO_RE, cursoSiguiente, urlSiguienteCurso } from './arrastre-cliente';

// Quién crea el curso siguiente, según app/_lib/rutas/arrastre.js. El servidor lo
// comprueba igualmente —es él quien manda—, pero avisar antes evita ofrecer un
// botón que no va a funcionar.
const PUEDEN_CREAR_CURSO = ['admin', 'jefe_departamento'];

export default function CursoSiguiente({ documentoId, documento, documentos, rol }) {
  const propuesto = cursoSiguiente(documento && documento.curso);
  const [curso, setCurso] = useState(propuesto);
  const [estado, setEstado] = useState('quieto');
  const [error, setError] = useState(null);

  // ¿Ya existe el curso siguiente de este documento? Se mira en la lista que la
  // barra superior ya tiene cargada, por `anteriorId`, que es la única relación
  // entre los dos documentos. Así no se ofrece crear algo que está hecho: se
  // ofrece ir allí, que es lo que quiere quien lo busca.
  const sucesor = (documentos || []).find((d) => d.anteriorId === documentoId) || null;

  const puedeElRol = !rol || PUEDEN_CREAR_CURSO.includes(rol);

  if (sucesor) {
    return (
      <section className="tarjeta estructura">
        <header className="tarjeta-cab">
          <h2>El curso siguiente ya está empezado</h2>
          <span className="chip chip-validado">{sucesor.curso || 'sin curso'}</span>
        </header>
        <p className="suave">
          Este documento ya se arrastró a {sucesor.curso || 'otro curso'}. Lo que se revisa es ese,
          y la vista <strong>Cambios</strong> de cada apartado lo compara con este.
        </p>
        <div className="compartido-acciones">
          <a className="mini" href={`/doc/${encodeURIComponent(sucesor._id)}`}>
            Abrir el documento de {sucesor.curso || 'ese curso'}
          </a>
        </div>
      </section>
    );
  }

  const crear = async () => {
    setEstado('enviando');
    setError(null);
    try {
      const r = await pedir(urlSiguienteCurso(documentoId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // El curso va explícito aunque el servidor sepa deducirlo: lo que se
        // crea es lo que se ve en el campo, no lo que la pantalla suponga.
        body: JSON.stringify({ curso }),
      });
      const id = (r && r.documento && r.documento._id) || null;
      if (id) { window.location.href = `/doc/${encodeURIComponent(id)}`; return; }
      setEstado('hecho');
    } catch (e) {
      setEstado('error');
      setError(e);
    }
  };

  const enviando = estado === 'enviando';
  const cursoValido = CURSO_RE.test(curso || '');

  return (
    <section className="tarjeta estructura">
      <header className="tarjeta-cab">
        <h2>Empezar el curso siguiente</h2>
        <span className="suave">en septiembre no se escribe de cero: se revisa lo del año pasado</span>

        {/* Qué se copia y qué es estar «heredado»: prosa de referencia, siempre
            igual. Lo que no se pliega es lo que va a pasar al pulsar el botón,
            que se queda justo encima de él. */}
        <Ayuda sobre="empezar el curso siguiente">
          <p>
            Se copia <strong>todo</strong>: la misma estructura, los mismos módulos con su
            profesorado y todos los apartados tal como están.
          </p>
          <p>
            Allí cada apartado nace <strong>heredado</strong> —viene del curso pasado y nadie lo ha
            mirado—, y por eso el progreso del documento nuevo empieza en 0 % aunque esté lleno de
            texto: el progreso cuenta revisión y no relleno. Se revisan en la vista{' '}
            <strong>Cambios</strong> de cada apartado.
          </p>
        </Ayuda>
      </header>

      {/* Lo que va a pasar al pulsar: no se pliega. */}
      <p className="suave">
        Crea el documento de otro curso con <strong>el contenido de este, intacto</strong>.{' '}
        <strong>Este documento no se toca.</strong>
      </p>

      <div className="linea-estructura">
        <label htmlFor="curso-nuevo">Curso nuevo</label>
        <input
          id="curso-nuevo"
          value={curso}
          onChange={(ev) => setCurso(ev.target.value)}
          placeholder="2027-28"
          inputMode="numeric"
          disabled={!puedeElRol || enviando}
        />
        <span className="ayuda">
          {documento && documento.curso
            ? `Este documento es de ${documento.curso}, así que lo que viene es ${propuesto || 'el curso siguiente'}.`
            : 'Este documento no tiene curso, así que hay que decir cuál es el nuevo: no se inventa.'}
        </span>
      </div>

      {!cursoValido && curso ? (
        <p className="rojo">El curso se escribe como <code>2027-28</code>.</p>
      ) : null}

      {/* Por qué el botón está apagado: la explicación de lo que se ve. */}
      {!puedeElRol ? (
        <p className="ayuda">
          Lo hace la jefatura del departamento: con tu rol el servidor lo rechazaría.
        </p>
      ) : null}

      <div className="compartido-acciones">
        <button
          type="button"
          className="btn-primario"
          disabled={!puedeElRol || enviando || !cursoValido}
          onClick={crear}
        >
          {enviando ? 'Creando el documento…' : `Crear el documento de ${cursoValido ? curso : 'otro curso'}`}
        </button>
        {enviando ? (
          <span className="suave">se copian los apartados y los módulos; tarda unos segundos</span>
        ) : null}
      </div>

      {error ? (
        <div className="nota nota-error" role="alert">
          <div>
            {error.message}
            {/* El 409 trae el id del documento que ya existe: se ofrece abrirlo,
                que es lo que se quería hacer. */}
            {error.estado === 409 && error.documentoId ? (
              <div className="compartido-acciones">
                <a className="mini" href={`/doc/${encodeURIComponent(error.documentoId)}`}>
                  Abrir el que ya existe
                </a>
              </div>
            ) : null}
            {error.codigo === 'no_disponible' ? (
              <p className="suave">
                La ruta <code>POST /api/documentos/[id]/siguiente-curso</code> es del E5. La tarjeta
                está lista: en cuanto la ruta responda, el documento se crea desde aquí.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {estado === 'hecho' ? (
        <p className="bien">
          Documento creado. Si no se ha abierto solo, está en la lista de documentos.
        </p>
      ) : null}
    </section>
  );
}
