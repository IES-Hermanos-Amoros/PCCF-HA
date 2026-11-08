// La vista *Cambios*: el apartado comparado con el del curso pasado.
//
// Referencia: el punto 4 de docs/mockup-v2/CAMBIOS.md —«compara el apartado con
// el del curso pasado, en dos columnas, con lo que se quitó tachado en rojo y lo
// nuevo en verde. Y un botón: *Validar este apartado*»— y `vistaCambios` de
// docs/mockup-v2/js/ui.js. Es la especificación aprobada por el departamento y
// no se rediseña.
//
// POR QUÉ ESTA PANTALLA ES EL TRABAJO DE SEPTIEMBRE
//
// Nadie escribe una programación desde cero: revisa la del año pasado
// (docs/plan.md §2.1). Lo que hace falta para eso no es un editor, es poder ver
// en qué se diferencia lo que hay de lo que había, y poder decir «esto ya lo he
// mirado». Las dos cosas están aquí.
//
// EL DIFF ESTÁ EN `arrastre-cliente.js`, Y NO ES SOBRE UNA CADENA
//
// El contenido de un campo es el array de bloques que espera el generador del
// PDF, así que compararlo como texto sería comparar una serialización
// cualquiera. Los bloques se aplanan a líneas —un párrafo es una línea, una
// lista son sus elementos— y dentro de cada pareja de líneas se compara palabra
// por palabra. El por qué de cada decisión está en la cabecera de ese fichero.
//
// LO QUE NO ES PROSA NO SE COMPARA PALABRA POR PALABRA
//
// Las ponderaciones, las fichas de situación de aprendizaje y las tablas que
// vienen del Word no se leen como texto, así que un diff de palabras de una
// tabla no se entendería. De esos campos se dice lo que de verdad se pregunta:
// si han cambiado. Y de las fichas, cuántas: «3 cambiadas de 11» es lo que hay
// que saber antes de abrirlas una por una.
//
// SIN COLOR TAMBIÉN SE DISTINGUE
//
// Un diff que solo se entiende por el color deja fuera a quien no distingue el
// rojo del verde. Aquí hay cuatro canales además del color:
//
//   · lo quitado va TACHADO y lo nuevo SUBRAYADO;
//   · el marcado es `<del>` y `<ins>`, que es lo que esas dos cosas son en HTML,
//     así que un lector de pantalla puede anunciarlas como borrado e inserción;
//   · cada pareja de líneas dice EN TEXTO cuántas palabras se han quitado y
//     cuántas se han puesto, que es lo único que llega a quien no ve la pantalla;
//   · y la cabecera de cada columna dice de qué curso es y qué marca lleva.
//
// LA REGLA LA PONE EL SERVIDOR
//
// `GET .../anterior/apartado` decide si hay curso anterior y qué hay en él, y
// `POST .../apartado/revisar` decide quién puede dar un apartado por bueno. Aquí
// no se deduce ninguna de las dos cosas: el botón se ofrece si el servidor dijo
// `puedeEditar`, y si se equivoca, la respuesta lo corrige en voz alta.

'use client';

import { useEffect, useMemo, useState } from 'react';
import Ayuda from './Ayuda';
import { pedir } from './api';
import {
  columnaAhora, columnaAntes, emparejar, esComparable, lineasDeValor, mismoValor,
  recuento, recuentoDeItems, urlAnterior, urlRevisar,
} from './arrastre-cliente';
import { NOMBRE_ORIGEN } from './etiquetas';

// ---------------------------------------------------------------- el botón
//
// Está aquí y no en Visor.js porque se pinta en dos sitios —la cabecera del
// apartado y el pie de esta vista, igual que en el prototipo— y la lógica de
// mandarlo es una sola: dos copias acabarían pidiendo cosas distintas.
//
// Solo tiene sentido en lo que viene de un curso anterior sin mirar. Un apartado
// ya revisado, reescrito o nuevo no se «valida»: ya cuenta.
export function BotonValidar({
  documentoId, nodo, apartado, onValidado, onRecargar, principal,
}) {
  const [estado, setEstado] = useState('quieto');
  const [error, setError] = useState(null);

  if (!apartado || !nodo || !apartado.puedeEditar || apartado.origen !== 'heredado') return null;

  const validar = async () => {
    setEstado('enviando');
    setError(null);
    try {
      const r = await pedir(urlRevisar(documentoId, nodo), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // La misma versión que el PATCH: dar por bueno un texto que alguien
        // acaba de cambiar sería validar algo que no has leído. Si no cuadra, el
        // servidor contesta 409 y no escribe nada.
        body: JSON.stringify({ esperaUpdatedAt: apartado.updatedAt || null }),
      });
      setEstado('hecho');
      if (onValidado) onValidado(r);
    } catch (e) {
      setEstado('error');
      setError(e);
    }
  };

  return (
    <>
      <button
        type="button"
        className={principal ? 'btn-primario' : 'btn-ghost'}
        disabled={estado === 'enviando'}
        onClick={validar}
      >
        {estado === 'enviando' ? 'Validando…' : 'Validar este apartado'}
      </button>
      {error ? (
        <span className="aviso-validar rojo" role="status">
          {error.estado === 409
            ? 'Alguien lo ha cambiado desde que lo abriste: no se ha validado nada.'
            : error.message}
          {error.estado === 409 && onRecargar ? (
            <>
              {' '}
              <button type="button" className="enlace" onClick={onRecargar}>Volver a cargarlo</button>
            </>
          ) : null}
        </span>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------- una línea pintada

// Los trozos de una columna. Lo quitado es un `<del>` y lo añadido un `<ins>`,
// que es lo que son: el marcado lleva la información, y el color va encima.
const Trozos = ({ segmentos }) => segmentos.map((s, i) => {
  if (s.op === 'quita') return <del key={i}><mark className="quita">{s.texto}</mark></del>;
  if (s.op === 'pon') return <ins key={i}><mark className="pon">{s.texto}</mark></ins>;
  return <span key={i}>{s.texto}</span>;
});

// Una línea en su columna. La sangría de un elemento de lista se pinta, porque
// cambiar la sangría cambia el documento impreso y tiene que verse.
function Linea({ linea, segmentos, falta }) {
  if (!linea) return <p className="diff-linea"><em className="suave">{falta}</em></p>;
  return (
    <p
      className={'diff-linea diff-' + linea.tipo}
      style={linea.nivel ? { marginLeft: linea.nivel * 16 } : undefined}
    >
      {linea.tipo === 'ref' ? (
        <span className="distintivo distintivo-com">texto compartido {linea.ref}</span>
      ) : null}
      {linea.tipo === 'ref' && !linea.resuelto ? (
        <span className="suave"> (su texto no viene en esta respuesta)</span>
      ) : <Trozos segmentos={segmentos} />}
    </p>
  );
}

// ---------------------------------------------------------------- un campo comparado

function CampoComparado({ campo, valorAntes, valorAhora, compartidosAntes, compartidosAhora, cursoAntes, cursoAhora, soloCambios }) {
  const parejas = useMemo(() => emparejar(
    lineasDeValor(valorAntes, compartidosAntes),
    lineasDeValor(valorAhora, compartidosAhora),
  ), [valorAntes, valorAhora, compartidosAntes, compartidosAhora]);

  const cuenta = recuento(parejas);
  const visibles = soloCambios ? parejas.filter((p) => !p.igual) : parejas;

  return (
    <section className="tarjeta">
      <header className="tarjeta-cab">
        <h2>{campo.etiqueta || campo.id}</h2>
        {cuenta.cambiadas ? (
          <span className="chip chip-incompleto">
            {cuenta.cambiadas === 1 ? '1 línea cambiada' : cuenta.cambiadas + ' líneas cambiadas'}
          </span>
        ) : <span className="chip chip-validado">igual que el curso pasado</span>}
        {/* El total de palabras solo cuando hay más de una línea cambiada: con
            una sola, cada pareja ya lo dice justo debajo y se leería dos veces
            seguidas lo mismo. */}
        {cuenta.cambiadas > 1 && (cuenta.quitadas || cuenta.anadidas) ? (
          <span className="suave">
            {cuenta.quitadas} {cuenta.quitadas === 1 ? 'palabra quitada' : 'palabras quitadas'}
            {' · '}
            {cuenta.anadidas} {cuenta.anadidas === 1 ? 'añadida' : 'añadidas'}
          </span>
        ) : null}
      </header>

      {!parejas.length ? (
        <p className="vacio-apartado">Este campo está vacío en los dos cursos.</p>
      ) : null}

      {!visibles.length && parejas.length ? (
        <p className="bien">Nada ha cambiado en este campo.</p>
      ) : null}

      <div className="diff">
        {visibles.map((p, i) => (
          <div className="diff-pareja" key={i}>
            {/* El resumen de la pareja, en texto: es el canal que le queda a
                quien no ve el color ni el tachado. */}
            {p.igual ? null : (
              <p className="ayuda">
                {!p.antes ? 'Línea nueva de este curso.' : null}
                {!p.despues ? 'Línea que estaba el curso pasado y ya no está.' : null}
                {p.antes && p.despues ? (
                  <>
                    {p.diff.quitadas} {p.diff.quitadas === 1 ? 'palabra quitada' : 'palabras quitadas'}
                    {' · '}
                    {p.diff.anadidas} {p.diff.anadidas === 1 ? 'palabra añadida' : 'palabras añadidas'}
                  </>
                ) : null}
                {p.diff.recortado ? ' · demasiado largo para comparar palabra por palabra: sale cambiado entero.' : null}
              </p>
            )}
            <div className="diff-par">
              <div className="diff-col diff-antes">
                <span className="diff-etq">{cursoAntes} · lo quitado va tachado</span>
                <Linea linea={p.antes} segmentos={columnaAntes(p.diff.segmentos)} falta="(no existía)" />
              </div>
              <div className="diff-col diff-ahora">
                <span className="diff-etq">{cursoAhora} · lo nuevo va subrayado</span>
                <Linea linea={p.despues} segmentos={columnaAhora(p.diff.segmentos)} falta="(se ha quitado)" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// Un campo que no es prosa: no se compara palabra por palabra, pero sí se dice
// si ha cambiado, que es lo que se le pregunta a esta pantalla.
function CampoSinDiff({ campo, valorAntes, valorAhora }) {
  const igual = mismoValor(valorAntes, valorAhora);
  return (
    <section className="tarjeta">
      <header className="tarjeta-cab">
        <h2>{campo.etiqueta || campo.id}</h2>
        {igual
          ? <span className="chip chip-validado">igual que el curso pasado</span>
          : <span className="chip chip-incompleto">ha cambiado</span>}
        <span className="suave">tipo «{campo.tipo}»</span>
      </header>
      {/* Por qué esta tarjeta solo dice «ha cambiado» y no enseña el diff: es
          la explicación del dato que hay en pantalla. */}
      <p className="ayuda">
        No es texto, así que no se compara palabra por palabra: solo se dice si cambió.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------- la vista

export default function Cambios({
  documentoId, documento, nodo, apartado, onValidado, onRecargar,
}) {
  const [anterior, setAnterior] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);
  const [soloCambios, setSoloCambios] = useState(false);

  const esApartado = !!(nodo && nodo.contenido);

  useEffect(() => {
    if (!esApartado) { setAnterior(null); return undefined; }
    let vivo = true;
    setCargando(true);
    setError(null);
    pedir(urlAnterior(documentoId, nodo))
      .then((r) => { if (vivo) setAnterior(r); })
      .catch((e) => { if (vivo) { setAnterior(null); setError(e); } })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [documentoId, nodo, esApartado]);

  if (!esApartado) {
    return (
      /* Es una explicación, no un aviso: en cuanto deja de llevar el filo de
         `.nota` deja de parecer que algo ha ido mal. */
      <p className="suave">
        Elige un apartado concreto para compararlo con el curso anterior: un módulo o un bloque
        solo agrupa, y no tiene contenido propio que comparar.
      </p>
    );
  }

  if (cargando || !apartado) return <p className="suave">Comparando con el curso anterior…</p>;

  if (error) {
    return (
      <section className="tarjeta">
        <header className="tarjeta-cab"><h2>No se puede comparar</h2></header>
        <div className="nota nota-lock" role="alert">
          <div>
            {error.message}
            {error.codigo === 'no_disponible' ? (
              <p className="suave">
                La ruta <code>GET /api/documentos/[id]/anterior/apartado</code> es del E5. La vista
                está lista: en cuanto la ruta responda, la comparación sale aquí.
              </p>
            ) : null}
          </div>
        </div>
      </section>
    );
  }

  const cursoAhora = (documento && documento.curso) || 'este curso';
  const cursoAntes = (anterior && anterior.curso) || 'el curso anterior';

  // Nada con que comparar. No es un error y no se enseña como tal: el servidor
  // dice por qué, y los cuatro motivos se arreglan de forma distinta.
  if (anterior && anterior.motivo) {
    return (
      <section className="tarjeta">
        <header className="tarjeta-cab">
          <h2>{anterior.motivo === 'sin_curso_anterior' ? 'Este documento no viene de otro curso' : 'Nada que comparar'}</h2>
          <span className="chip chip-origen">{NOMBRE_ORIGEN[apartado.origen] || 'sin procedencia'}</span>

          {/* Cómo empieza el arrastre entre cursos: prosa de referencia, y en
              esta tarjeta no hay nada más que leer, así que plegarla no deja la
              pantalla muda —el mensaje del servidor sigue arriba—. */}
          {anterior.motivo === 'sin_curso_anterior' ? (
            <Ayuda sobre="el arrastre entre cursos">
              <p>
                El arrastre empieza al <strong>crear el documento del curso siguiente</strong> desde
                la portada de este: entonces cada apartado del nuevo sabe de cuál viene, y esta
                pantalla tiene las dos versiones que comparar.
              </p>
            </Ayuda>
          ) : null}
        </header>
        <p>{anterior.mensaje}</p>
        {anterior.motivo === 'sin_contenido' ? (
          <p className="ayuda">
            Lo que hay escrito en este curso es todo nuevo: no hay nada del curso pasado que haya
            cambiado, porque no había nada.
          </p>
        ) : null}
      </section>
    );
  }

  const campos = Array.isArray(apartado.campos) ? apartado.campos : [];
  const antes = (anterior && anterior.valores) || {};
  const ahora = apartado.valores || {};

  // Un apartado repetidor no son campos con su valor: es `{ items: [...] }`, la
  // lista de fichas, y sus `campos` son los de CADA ficha. Así que no se compara
  // campo a campo: se dice cuántas fichas hay y cuántas han cambiado.
  const fichas = apartado.repetidor ? recuentoDeItems(antes, ahora) : null;

  return (
    <>
      <section className="tarjeta">
        <header className="tarjeta-cab">
          <h2>Comparación con {cursoAntes}</h2>
          <span className="chip chip-origen">{NOMBRE_ORIGEN[apartado.origen] || 'sin procedencia'}</span>
          {apartado.revisadoEn ? (
            <span className="suave">dado por bueno el {new Date(apartado.revisadoEn).toLocaleDateString('es-ES')}</span>
          ) : null}

          {/* Cómo se lee una comparación: siempre igual, en todos los apartados
              y en todos los módulos, y a la vista son cinco líneas encima del diff. Lo
              que se queda a la vista es qué curso es cada columna, que cambia
              con el documento. */}
          <Ayuda sobre="cómo se lee esta comparación">
            <p>
              Lo que se quitó va <del><mark className="quita">tachado y en rojo</mark></del>; lo
              nuevo, <ins><mark className="pon">subrayado y en verde</mark></ins>. Se compara
              palabra por palabra, y cada pareja de líneas dice además en texto cuántas se han
              quitado y cuántas se han puesto, para que no haga falta distinguir los colores.
            </p>
            <p>
              Por omisión sale el apartado entero, que es como se repasa; con el filtro puesto,
              solo las líneas que hay que mirar.
            </p>
          </Ayuda>
        </header>

        {/* Qué curso es cada columna: es el dato, y cambia de documento a
            documento. */}
        <p className="suave">
          A la izquierda, {cursoAntes}; a la derecha, {cursoAhora}.
        </p>

        {/* La misma barra de filtros del reparto: un apartado de la programación
            real tiene varios párrafos y alguna lista, y con esto puesto se ve de
            un golpe lo que hay que revisar. */}
        <div className="filtros">
          <label htmlFor="solo-cambios">
            <input
              id="solo-cambios"
              type="checkbox"
              checked={soloCambios}
              onChange={(ev) => setSoloCambios(ev.target.checked)}
            />
            Ver solo las líneas que han cambiado
          </label>
        </div>

        {/* El botón, al pie de la comparación: es el sitio donde se decide, con
            las dos versiones delante. También está en la cabecera del apartado,
            igual que en el prototipo. */}
        {apartado.origen === 'heredado' ? (
          <div className="diff-pie">
            {/* `key` por apartado, para que el botón no herede el estado ni el
                error del apartado que se estaba mirando antes. */}
            <BotonValidar
              key={nodo.clave}
              documentoId={documentoId}
              nodo={nodo}
              apartado={apartado}
              onValidado={onValidado}
              onRecargar={onRecargar}
              principal
            />
            <span className="suave">
              {apartado.puedeEditar
                ? 'Pasa a contar como revisado en el progreso del documento. No cambia el texto: revisar es mirarlo, no reescribirlo.'
                : 'Este apartado lo revisa quien lo edita, y no lo tienes asignado.'}
            </span>
          </div>
        ) : null}
      </section>

      {fichas ? (
        <section className="tarjeta">
          <header className="tarjeta-cab">
            <h2>Situaciones de aprendizaje</h2>
            {fichas.cambiadas
              ? <span className="chip chip-incompleto">{fichas.cambiadas} {fichas.cambiadas === 1 ? 'ficha cambiada' : 'fichas cambiadas'}</span>
              : <span className="chip chip-validado">iguales que el curso pasado</span>}
            <span className="suave">{fichas.antes} el curso pasado · {fichas.ahora} este curso</span>
            <Ayuda sobre="cómo se comparan las fichas">
              <p>
                Se comparan <strong>por su posición en la lista</strong>, que es la que numera el
                documento impreso: la primera con la primera, la segunda con la segunda. Si se
                intercalara una ficha nueva en medio, las de detrás saldrían como cambiadas.
              </p>
            </Ayuda>
          </header>
          {/* Por qué no hay diff de las fichas: la explicación del dato. */}
          <p className="ayuda">
            Las fichas son formularios y no se comparan párrafo a párrafo: solo se dice cuántas han
            cambiado.
          </p>
        </section>
      ) : null}

      {!fichas && !campos.length ? (
        <section className="tarjeta">
          <p className="vacio-apartado">Este apartado no tiene campos propios.</p>
        </section>
      ) : null}

      {!fichas && campos.map((campo) => (esComparable(campo, antes[campo.id], ahora[campo.id]) ? (
        <CampoComparado
          key={campo.id}
          campo={campo}
          valorAntes={antes[campo.id]}
          valorAhora={ahora[campo.id]}
          compartidosAntes={anterior ? anterior.compartidos : null}
          compartidosAhora={apartado.compartidos}
          cursoAntes={cursoAntes}
          cursoAhora={cursoAhora}
          soloCambios={soloCambios}
        />
      ) : (
        <CampoSinDiff
          key={campo.id}
          campo={campo}
          valorAntes={antes[campo.id]}
          valorAhora={ahora[campo.id]}
        />
      )))}
    </>
  );
}
