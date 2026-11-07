// Subir un .docx: el formulario de `POST /api/documentos/importar`.
//
// POR QUÉ PIDE EL CICLO Y EL CURSO SI YA LOS LLEVA EL WORD
//
// No los lleva. Un `.docx` no dice de qué ciclo ni de qué curso es, así que el
// importador no los puede deducir y el formulario los tiene que pedir
// (docs/plan.md, «Lo que ha dejado el E0»). Y el ciclo no es solo un dato de
// catálogo: hace falta para **conciliar** las unidades, porque el Word identifica
// cada módulo solo por su título y hay títulos que se repiten entre ciclos
// —«Sostenibilidad aplicada al sistema productivo» está igual en DAW y en SMR—,
// así que sin ciclo esos dos módulos son ambiguos y `core/conciliar.js` prefiere
// dejarlos sin resolver antes que adivinar (docs/api.md).
//
// El curso hace falta por lo mismo un nivel más arriba: los títulos cambian de un
// curso a otro y el catálogo guarda la variante de cada curso, que es lo que
// permite reconocer un módulo renombrado y no perder sus asignaciones cada
// septiembre.
//
// LOS MÓDULOS QUE NO SE RECONOCEN
//
// La ruta responde 400 con la lista de módulos que `core/conciliar.js` no ha
// sabido casar con el catálogo, y **no escribe nada**: o se importa el documento
// entero o no se importa. Eso no es un fallo del formulario, es una pregunta, y
// aquí se enseña como tal, con el título de cada módulo y el motivo, y un botón
// para volver a enviarlo con `forzar=1`, que los importa con un identificador
// derivado de su título. Perder esa lista y dejar solo «error 400» obligaría a
// adivinar qué módulo del Word está mal escrito entre once.
//
// Y SI LA RUTA NO EXISTIERA
//
// `app/_componentes/api.js` convierte la página de error de Next —que es HTML—
// en un error con código `no_disponible`, y aquí se enseña como lo que es: «esto
// todavía no está construido». Se deja puesto porque la ruta y este formulario
// son dos tareas distintas del mismo evolutivo y el orden en que aterrizan no
// debería romper la portada.

'use client';

import { useState } from 'react';
import { pedir } from './api';
import Unidades from '../../core/unidades';

// Los ciclos y ámbitos salen del catálogo de unidades y no de una lista escrita
// aquí: el día que se añada un ciclo al catálogo aparece solo en el formulario.
// `core/conciliar.js` acepta en `ciclo` tanto un ciclo de FP como un ámbito
// ('eso', 'bach'), que es por lo que van en el mismo desplegable.
const NOMBRES_CICLO = {
  daw: 'DAW · Desarrollo de aplicaciones web',
  smr: 'SMR · Sistemas microinformáticos y redes',
  eso: 'ESO',
  bach: 'Bachillerato',
};

const CICLOS = (() => {
  const vistos = [];
  for (const u of Unidades.UNIDADES) {
    const clave = u.ciclo || u.ambito;
    if (clave && clave !== 'fp' && !vistos.includes(clave)) vistos.push(clave);
  }
  return vistos;
})();

// El PCCF y la memoria se importan por el mismo camino en el E7. Salen en la
// lista pero apagados, con el motivo al lado: esconderlos haría pensar que la
// herramienta no los contempla, y dejarlos activos sería prometer una
// importación que la ruta rechaza con un 400.
const TIPOS = [
  { valor: 'programacion_didactica', etiqueta: 'Programación didáctica' },
  { valor: 'pccf', etiqueta: 'Proyecto curricular del ciclo formativo (todavía no)', apagado: true },
  { valor: 'memoria', etiqueta: 'Memoria del departamento (todavía no)', apagado: true },
];

// Quién puede importar, según app/_lib/rutas/importar.js. El servidor lo
// comprueba igualmente —es él quien manda— pero avisar antes evita subir un
// fichero de 1,3 MB para recibir un 403.
const PUEDEN_IMPORTAR = ['admin', 'jefe_departamento'];

// El curso académico, con el formato con el que se nombra de verdad: 2026-27.
const CURSO_ACTUAL = (() => {
  const hoy = new Date();
  // El curso empieza en septiembre: en enero seguimos en el que empezó el año
  // pasado, y poner el año natural daría un curso que no existe.
  const inicio = hoy.getMonth() >= 7 ? hoy.getFullYear() : hoy.getFullYear() - 1;
  return `${inicio}-${String((inicio + 1) % 100).padStart(2, '0')}`;
})();

export default function Subida({ departamentoPorOmision, rol, habilitado, alImportar }) {
  const [tipo, setTipo] = useState(TIPOS[0].valor);
  const [ciclo, setCiclo] = useState(CICLOS[0] || '');
  const [curso, setCurso] = useState(CURSO_ACTUAL);
  const [departamento, setDepartamento] = useState(departamentoPorOmision || 'informatica');
  const [archivo, setArchivo] = useState(null);
  const [estado, setEstado] = useState({ fase: 'quieto' });

  async function enviar(forzar) {
    if (!archivo) { setEstado({ fase: 'error', mensaje: 'Elige primero el fichero .docx.' }); return; }

    const cuerpo = new FormData();
    cuerpo.set('archivo', archivo);
    cuerpo.set('tipo', tipo);
    cuerpo.set('ciclo', ciclo);
    cuerpo.set('curso', curso);
    cuerpo.set('departamento', departamento);
    if (forzar) cuerpo.set('forzar', '1');

    setEstado({ fase: 'enviando' });
    try {
      const r = await pedir('/api/documentos/importar', { method: 'POST', body: cuerpo });
      // La ruta responde 201 con `{ documento, resumen }`. Si trae id se abre el
      // documento, que es lo que quiere quien acaba de subirlo; si no, se
      // recarga la lista en lugar de dar por supuesta una forma concreta.
      const id = (r && r.documento && r.documento._id) || (r && r.documentoId) || null;
      if (id) { window.location.href = `/doc/${encodeURIComponent(id)}`; return; }
      setEstado({ fase: 'hecho', resumen: r && r.resumen });
      if (alImportar) alImportar();
    } catch (e) {
      setEstado({ fase: 'error', mensaje: e.message, codigo: e.codigo, sinResolver: e.sinResolver });
    }
  }

  const enviando = estado.fase === 'enviando';
  const puedeElRol = !rol || PUEDEN_IMPORTAR.includes(rol);

  return (
    <section className="tarjeta estructura">
      <header className="tarjeta-cab">
        <h2>Subir una programación en Word</h2>
        <span className="suave">se deduce su estructura y se guarda apartado por apartado</span>
      </header>

      <form onSubmit={(ev) => { ev.preventDefault(); enviar(false); }}>
        <div className="linea-estructura">
          <label htmlFor="archivo">Fichero <code>.docx</code></label>
          <input
            id="archivo"
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(ev) => setArchivo(ev.target.files[0] || null)}
            required
          />
        </div>

        <div className="linea-estructura">
          <label htmlFor="tipo">Tipo de documento</label>
          <select id="tipo" value={tipo} onChange={(ev) => setTipo(ev.target.value)}>
            {TIPOS.map((t) => (
              <option key={t.valor} value={t.valor} disabled={t.apagado}>{t.etiqueta}</option>
            ))}
          </select>
        </div>

        <div className="linea-estructura">
          <label htmlFor="ciclo">Ciclo o etapa</label>
          <select id="ciclo" value={ciclo} onChange={(ev) => setCiclo(ev.target.value)} required>
            {CICLOS.map((c) => <option key={c} value={c}>{NOMBRES_CICLO[c] || c.toUpperCase()}</option>)}
          </select>
          <span className="ayuda">
            No se puede deducir del Word, y hace falta para reconocer los módulos: hay títulos que se
            repiten entre ciclos.
          </span>
        </div>

        <div className="linea-estructura">
          <label htmlFor="curso">Curso académico</label>
          <input
            id="curso"
            value={curso}
            onChange={(ev) => setCurso(ev.target.value)}
            pattern="[0-9]{4}-[0-9]{2}"
            title="Con el formato 2026-27"
            required
          />
          <span className="ayuda">
            Tampoco está en el Word, y es lo que permite reconocer un módulo renombrado el curso
            siguiente sin perder sus asignaciones.
          </span>
        </div>

        <div className="linea-estructura">
          <label htmlFor="departamento">Departamento</label>
          <input
            id="departamento"
            value={departamento}
            onChange={(ev) => setDepartamento(ev.target.value)}
            required
          />
        </div>

        <div className="compartido-acciones">
          <button className="btn-primario" type="submit" disabled={!habilitado || !puedeElRol || enviando}>
            {enviando ? 'Importando…' : 'Importar'}
          </button>
          {!habilitado ? (
            <span className="ayuda">Elige antes arriba con quién trabajas: el servidor no acepta una subida sin saber quién la hace.</span>
          ) : null}
          {habilitado && !puedeElRol ? (
            <span className="ayuda">
              Importar un documento lo hace la jefatura de departamento (o el soporte): un docente
              edita sus módulos, no crea el documento.
            </span>
          ) : null}
          {enviando ? (
            <span className="ayuda">
              Leer el Word, deducir la estructura y conciliar los módulos tarda unos segundos: un
              documento de 1,3 MB son unos cinco.
            </span>
          ) : null}
        </div>

        {estado.fase === 'error' ? (
          <div className="nota nota-lock" style={{ marginTop: 12 }}>
            <div>
              {estado.codigo === 'no_disponible' ? (
                <>
                  <strong>La subida todavía no está construida.</strong>
                  <p className="suave" style={{ margin: '4px 0 0' }}>
                    La ruta <code>POST /api/documentos/importar</code> es parte de este mismo
                    evolutivo y aún no responde. Mientras tanto se importa por consola con
                    <code> npm run importar</code>.
                  </p>
                </>
              ) : (
                <>
                  {estado.mensaje}
                  {Array.isArray(estado.sinResolver) && estado.sinResolver.length ? (
                    <>
                      <ul className="avisos-en-linea">
                        {estado.sinResolver.map((s, i) => (
                          <li className="aviso" key={i}>
                            <strong>{s.titulo || '(sin título)'}</strong>
                            <span className="suave"> — {s.motivo}</span>
                          </li>
                        ))}
                      </ul>
                      <div className="compartido-acciones">
                        <button className="mini" type="button" onClick={() => enviar(true)}>
                          Importar de todas formas, con un id derivado del título
                        </button>
                      </div>
                      <p className="ayuda">
                        Un módulo con id derivado del título pierde sus asignaciones si el título
                        cambia el curso que viene: es mejor corregir el título en el Word o añadir el
                        módulo al catálogo de unidades.
                      </p>
                    </>
                  ) : null}
                </>
              )}
            </div>
          </div>
        ) : null}

        {estado.fase === 'hecho' ? (
          <div className="nota" style={{ marginTop: 12 }}><div>Documento importado.</div></div>
        ) : null}
      </form>
    </section>
  );
}
