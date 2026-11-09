// La tarjeta *Estructura*: renombrar un apartado, añadir uno, moverlo y
// retirarlo, desde el apartado que se está mirando.
//
// Referencia: el punto 3 de docs/mockup-v2/CAMBIOS.md y `barraEstructura` /
// `tarjetaRetirados` de docs/mockup-v2/js/ui.js. Es la especificación aprobada
// por el departamento y no se rediseña. Las direcciones y el porqué del modelo
// están en `estructura-cliente.js`; las reglas, en `app/_lib/rutas/estructura.js`
// y `core/plantilla.js`, que son quienes mandan.
//
// POR QUÉ ESTO ES EL EVOLUTIVO ENTERO
//
// Hasta ahora la estructura del documento solo se podía cambiar reimportando un
// Word, así que **el Word seguía mandando**: si la inspección pedía un apartado
// nuevo, había que volver allí, cambiarlo y volver a importar. Con esta tarjeta
// la programación vive en la herramienta.
//
// LAS CUATRO COSAS QUE ESTA PANTALLA TIENE QUE DECIR EN VOZ ALTA
//
//  1. **Retirar no borra.** El contenido se conserva y el apartado se recupera
//     desde la portada del documento. Si pareciera un borrado nadie lo usaría, y
//     la estructura se quedaría llena de apartados que no van en el documento.
//     Se dice tres veces y en los tres momentos en que hace falta: en la tarjeta
//     antes de pulsar, en la confirmación, y en el aviso de después —que incluye
//     cuántos apartados se han ido, porque un apartado se lleva lo que tenga
//     dentro—.
//  2. **En un apartado de módulo se está cambiando la plantilla**, así que el
//     cambio sale en los once módulos a la vez. Se advierte ANTES, arriba de la
//     tarjeta, porque desde dentro de un módulo no se ve: la pantalla dice
//     «Evaluación y calificación» de «Lenguajes de marcas» y parece que se está
//     tocando solo ese. Quien lo dice es el servidor (`deUnidades` de la lectura
//     y `afectaUnidades` de cada respuesta): aquí no se deduce de ningún id.
//  3. **El id se enseña a la vista**, para que se note que el título es solo la
//     etiqueta y que renombrar no rompe los enlaces que alguien tenga guardados.
//     Es contraintuitivo, y por eso se enseña en lugar de explicarse.
//  4. **El número se pinta si el servidor lo manda, y si no, no.** La numeración
//     la pone el documento por la posición del apartado (core/arbol.js, igual
//     que el PDF), así que un apartado puede llegar sin número; cuando llega sin
//     número se dice así y no se inventa uno, que es lo que haría parecer que
//     algo ha fallado.
//
// QUIÉN LA VE
//
// Quien puede cambiar la estructura, que lo dice el servidor en `puedeCambiar`:
// la jefatura del departamento y el soporte. Quien no, no la ve, igual que en el
// prototipo. No es un botón que se le niegue: es una decisión que no es suya, y
// la pantalla no gana nada enseñándole cuatro controles apagados en cada
// apartado. El servidor lo comprueba en cada cambio, y si aquí nos equivocamos,
// su 403 sale con su mensaje.

'use client';

import { useEffect, useRef, useState } from 'react';
import Ayuda from './Ayuda';
import {
  avisoDeContenidoSinDestruir, cambiarEstructura, hermanosDe, todasLasUnidades, unidadDelCamino,
  yaDiceQueNoHaCambiado,
} from './estructura-cliente';
import AnadirCampo from './AnadirCampo';
import useConfirmacion from './confirmar-cliente';
import { BorrarApartado } from './BorrarDefinitivo';
import { QuitarCampos } from './QuitarCampo';
import { CamposDelApartadoNuevo } from './NuevoCampo';

// El mensaje del servidor se enseña tal cual: ya está redactado y en castellano
// (docs/api.md, «Errores»). Lo único que se le añade delante es que no se ha
// cambiado nada, salvo cuando el propio mensaje ya lo dice: eso lo decide
// `yaDiceQueNoHaCambiado`, que vive en estructura-cliente.js porque esta pantalla
// y la de los campos leen los errores del MISMO envoltorio del servidor.
const mensajeDeError = (error) => (error ? error.message : null);

// «3 apartados» / «1 apartado», que es lo que hay que decir al retirar: un
// apartado se lleva por delante lo que tenga dentro.
const cuantos = (n) => (n === 1 ? '1 apartado' : `${n} apartados`);

// ---------------------------------------------------------------- la tarjeta

export default function Estructura({
  documentoId, nodo, camino, fila, plantillaVersion, unidades, onCambiado, onIr,
  tiposDeCampo, limites,
}) {
  const [titulo, setTitulo] = useState(nodo && nodo.titulo ? nodo.titulo : '');
  const [nuevo, setNuevo] = useState('');
  const [enviando, setEnviando] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [error, setError] = useState(null);
  const [anadido, setAnadido] = useState(null);
  // La confirmación de la retirada: el mismo gancho y la misma decisión de foco que las otras dos
  // de la aplicación (confirmar-cliente.js sobre core/confirmar.js, con pruebas).
  const confirma = useConfirmacion();
  // Los campos con los que nacerá el apartado nuevo: [{ peticion, resumen }]. Vacía, nace con un
  // campo de texto.
  const [camposNuevos, setCamposNuevos] = useState([]);

  const refSubir = useRef(null);
  const refBajar = useRef(null);
  // Qué botón de mover se pulsó y en qué posición estaba el apartado: hace falta
  // para devolverle el foco cuando el árbol vuelva ya reordenado.
  const esperaFoco = useRef(null);

  const { i, total } = hermanosDe(camino, nodo);
  const { unidad, etiqueta, cuantas } = unidadDelCamino(camino);

  // EL FOCO NO SE PIERDE AL MOVER UN APARTADO.
  //
  // Mover repinta la tarjeta con el apartado ya en su sitio nuevo, y el botón que
  // se acaba de pulsar puede quedarse desactivado (el apartado ha llegado al
  // primero o al último). Si no se hace nada, el foco se va al principio de la
  // página y quien se maneja con el teclado tiene que volver a bajar hasta aquí
  // para dar el segundo paso. Se espera a que la posición cambie de verdad
  // —hasta entonces el árbol todavía no ha vuelto— y se pone el foco en el botón
  // pulsado, o en el otro si ese ya no se puede pulsar.
  useEffect(() => {
    const espera = esperaFoco.current;
    if (!espera || espera.desde === i) return;
    esperaFoco.current = null;
    const pulsado = espera.boton === 'subir' ? refSubir.current : refBajar.current;
    const otro = espera.boton === 'subir' ? refBajar.current : refSubir.current;
    const destino = pulsado && !pulsado.disabled ? pulsado : otro;
    if (destino) destino.focus();
  });

  if (!nodo || !nodo.seccion) return null;

  // Qué se le puede hacer a este apartado lo dice el servidor, apartado por
  // apartado, en la lectura de la estructura: `puedeSubir` y `puedeBajar` cuentan
  // solo los hermanos VISIBLES —un botón que no hace nada porque el hermano de
  // arriba está retirado no se distingue de uno estropeado— y `admiteHijos` es
  // que no, dentro de una lista de fichas no van apartados. Si la lectura no ha
  // llegado, se usa el puesto que se ve en el árbol, que no lleva retirados.
  const puedeSubir = fila ? fila.puedeSubir : i > 0;
  const puedeBajar = fila ? fila.puedeBajar : (i >= 0 && i < total - 1);
  const admiteHijos = fila ? fila.admiteHijos : true;
  const deUnidades = fila ? !!fila.deUnidades : !!unidad;
  const esBloqueDeUnidades = fila ? !!fila.instancias : nodo.tipo === 'bloque';
  const cuantasUnidades = unidades || cuantas;
  // Cómo se llaman: «módulo» en una PD de FP, «materia» en ESO. Sale del bloque
  // que las agrupa —el del camino si estamos dentro de una unidad, o este mismo
  // nodo si lo que se está mirando es el bloque— y nunca de un id escrito aquí.
  const comoSeLlaman = etiqueta || nodo.etiqueta || null;
  const enTodas = (deUnidades || esBloqueDeUnidades) && cuantasUnidades > 1
    ? todasLasUnidades(cuantasUnidades, comoSeLlaman)
    : null;

  const ocupado = !!enviando;

  // Toda acción pasa por aquí: manda el cambio con la versión de la plantilla que
  // tenía el navegador, y al volver avisa a quien nos pintó para que recargue el
  // árbol y la estructura. Sin eso la barra lateral se quedaría con el título
  // viejo, o con el apartado que acaba de dejar de existir.
  const mandar = async (accion, { seccion, cuerpo }, alSalirBien) => {
    setEnviando(accion);
    setError(null);
    setAviso(null);
    // El enlace al apartado que se acaba de añadir es de ESE cambio: si se queda
    // puesto, después de mover o renombrar la pantalla sigue ofreciendo abrir un
    // apartado que no tiene nada que ver con lo que se acaba de hacer.
    setAnadido(null);
    try {
      const r = await cambiarEstructura(documentoId, accion, {
        seccion,
        // La versión de la plantilla con la que se leyó: si alguien la ha
        // cambiado por medio, el servidor contesta 409 y no escribe nada. Es
        // opcional en el contrato y se manda siempre: lo que se quiere evitar es
        // justo deshacer el cambio de otra jefatura sin enterarse.
        cuerpo: { ...cuerpo, esperaPlantillaVersion: plantillaVersion },
      });
      if (alSalirBien) alSalirBien(r || {});
      if (onCambiado) onCambiado(accion, r || {});
    } catch (e) {
      setError(e);
    } finally {
      setEnviando(null);
    }
  };

  // Lo que se añade a cualquier aviso cuando el cambio ha salido en todas las
  // unidades. Lo dice la respuesta (`afectaUnidades`), no esta pantalla.
  const yEnTodas = (r) => (r && r.afectaUnidades && r.unidades > 1
    ? ` El cambio ha salido en ${todasLasUnidades(r.unidades, comoSeLlaman)}.`
    : '');

  const renombrar = (ev) => {
    ev.preventDefault();
    const limpio = titulo.trim();
    if (!limpio || ocupado) return;
    mandar('renombrar', { seccion: nodo.seccion, cuerpo: { titulo: limpio } }, (r) => {
      setAviso(`Apartado renombrado. El identificador sigue siendo ${nodo.seccion}, así que el`
        + ' contenido y los enlaces que alguien tenga guardados siguen apuntando aquí.' + yEnTodas(r));
    });
  };

  const anadir = (ev) => {
    ev.preventDefault();
    const limpio = nuevo.trim();
    if (!limpio || ocupado) return;
    const campos = camposNuevos.map((c) => c.peticion);
    mandar('anadir', { cuerpo: { titulo: limpio, padre: nodo.seccion, ...(campos.length ? { campos } : {}) } }, (r) => {
      setNuevo('');
      setCamposNuevos([]);
      // El id lo ha generado el servidor: se dice cuál es, que es la mitad de lo
      // que esta tarjeta enseña, y se ofrece abrirlo para escribir en él.
      setAnadido(r.seccion ? { seccion: r.seccion, titulo: r.titulo || limpio } : null);
      setAviso((r.seccion
        ? `Apartado «${r.titulo || limpio}» añadido con el identificador ${r.seccion}.`
        : `Apartado «${limpio}» añadido.`) + yEnTodas(r));
    });
  };

  const mover = (boton) => {
    if (ocupado) return;
    esperaFoco.current = { boton, desde: i };
    mandar('mover', { seccion: nodo.seccion, cuerpo: { delta: boton === 'subir' ? -1 : 1 } }, (r) => {
      setAviso((boton === 'subir'
        ? 'Apartado subido un puesto entre sus hermanos.'
        : 'Apartado bajado un puesto entre sus hermanos.') + yEnTodas(r));
    });
  };

  const retirar = () => {
    if (ocupado) return;
    // El aviso de después lo da el visor, que es quien se mueve al padre: este apartado ya no
    // existe en el árbol y esta tarjeta se va con él. Así que se cierra sin mover el foco: aquí no
    // queda nada a lo que llevarlo, y el aviso de esta tarjeta no dice nada de la retirada.
    confirma.cerrar();
    mandar('retirar', { seccion: nodo.seccion, cuerpo: {} });
  };

  // Cuántos apartados se lleva por delante: él y lo que tenga dentro. Lo dice el
  // servidor en la lectura (`hijos` son los de primer nivel), y si no ha llegado,
  // el árbol.
  const dentro = fila ? fila.hijos : (nodo.hijos || []).length;

  return (
    <section className="tarjeta estructura" aria-busy={ocupado ? 'true' : 'false'}>
      <header className="tarjeta-cab">
        <h2>Estructura</h2>
        {/* EL ID, A LA VISTA. Es lo que hace entender que renombrar no rompe
            nada: el título es la etiqueta, el identificador es lo que apunta. */}
        <span
          className="distintivo distintivo-cod"
          title="Identificador interno del apartado: no cambia al renombrar"
        >
          {nodo.seccion}
        </span>
        {/* El número, si lo hay. Lo pone el documento por la posición del
            apartado, igual que el PDF; un apartado sin numerar no es un fallo. */}
        {nodo.num
          ? <span className="chip chip-cod">{nodo.num}</span>
          : <span className="chip chip-vacio">sin numerar</span>}

        {/* LA PROSA DE REFERENCIA DE ESTA TARJETA, PLEGADA. Es lo que se sabe de
            memoria en cuanto se usa una vez: el modelo de la plantilla, cómo se
            numera y qué pasa con el identificador. Lo que NO está aquí son los
            avisos de consecuencia: esos siguen abajo, a la vista y en el momento
            de pulsar. */}
        <Ayuda sobre="la estructura del documento">
          <p>
            <strong>Renombrar no cambia el identificador</strong> (<code>{nodo.seccion}</code>): el
            título es solo la etiqueta, y el contenido, los comentarios y los enlaces que alguien
            tenga guardados siguen apuntando aquí.
          </p>
          <p>
            <strong>La numeración la pone el documento</strong> por la posición del apartado al
            imprimirse —el «3.2.4» de la barra lateral es el del PDF—, así que mover un apartado le
            cambia el número. Hay apartados que no se numeran, como las fichas de una situación de
            aprendizaje: aquí se enseña el número que mande el servidor, y si no manda ninguno,
            ninguno.
          </p>
          {enTodas ? (
            <p>
              <strong>Los apartados de un módulo son una plantilla.</strong> Este bloque no es solo
              de {unidad ? `«${unidad.titulo}»` : 'esta unidad'}: {enTodas} repiten las mismas
              secciones con su propio contenido, así que el título y el orden son comunes y no hay
              forma de cambiarlos en uno solo. El contenido no se toca:
              cada {comoSeLlaman || 'unidad'} conserva el suyo.
            </p>
          ) : null}
          <p>
            Un apartado nuevo nace vacío, dentro de este y al final, con un campo de texto para
            escribir. El identificador lo pone el servidor a partir del título, una sola vez: si
            luego se renombra, el identificador se queda.
          </p>
        </Ayuda>
      </header>

      {/* El dato de la cabecera dice «sin numerar» y eso sorprende cada vez, así
          que la explicación se queda a la vista; lo que se ha ido a la ayuda es
          el porqué largo. */}
      {!nodo.num ? (
        <p className="ayuda">
          Sale sin número y no es un fallo: la numeración la pone el documento al imprimirse.
        </p>
      ) : null}

      {/* QUE ESTE APARTADO ES DE LOS ONCE MÓDULOS SE DICE ANTES DE TOCAR NADA,
          porque desde dentro de un módulo no se ve: la pantalla dice
          «Evaluación y calificación» de «Lenguajes de marcas» y parece que se
          está tocando solo ese. Por eso el dato se queda a la vista y no se
          pliega (Ayuda.js, regla 1: un aviso de consecuencia que llega tarde es
          peor que el ruido).
          LO QUE SE PLIEGA ES LA CONSECUENCIA DETALLADA, en su propia ayuda y no
          en la de la cabecera: la de arriba explica el modelo entero de la
          tarjeta, y quien se pregunta «esto a qué afecta» lo pregunta aquí, en
          la línea que se lo acaba de decir. El aviso de la retirada sigue
          abajo, en su confirmación. */}
      {enTodas ? (
        <div className="linea-estructura ayuda-plantilla">
          <span>Esto es la plantilla de {enTodas}.</span>
          <Ayuda sobre={`qué cambia en ${enTodas}`}>
            <p>
              {deUnidades
                ? <>Lo que cambies aquí —título, orden, añadir o retirar— sale en {enTodas} a la vez.</>
                : <>Lo que añadas aquí nace en {enTodas} a la vez.</>}{' '}
              <strong>El contenido no se toca</strong>: cada {comoSeLlaman || 'unidad'} conserva el suyo,
              y lo que escriba cada docente en su módulo se queda donde está.
            </p>
          </Ayuda>
        </div>
      ) : null}

      <form className="linea-estructura" onSubmit={renombrar}>
        <label htmlFor="estructura-titulo">Título del apartado</label>
        <input
          id="estructura-titulo"
          value={titulo}
          onChange={(ev) => setTitulo(ev.target.value)}
          autoComplete="off"
          disabled={ocupado}
        />
        <button
          className="btn-ghost"
          type="submit"
          disabled={ocupado || !titulo.trim() || titulo.trim() === nodo.titulo}
        >
          {enviando === 'renombrar' ? 'Renombrando…' : 'Renombrar'}
        </button>
      </form>

      {admiteHijos ? (
        <form className="linea-estructura" onSubmit={anadir}>
          <label htmlFor="estructura-nuevo">Añadir un subapartado</label>
          <input
            id="estructura-nuevo"
            value={nuevo}
            onChange={(ev) => setNuevo(ev.target.value)}
            placeholder="Título del apartado nuevo"
            autoComplete="off"
            disabled={ocupado}
          />
          <button className="btn-ghost" type="submit" disabled={ocupado || !nuevo.trim()}>
            {enviando === 'anadir' ? 'Añadiendo…' : 'Añadir'}
          </button>
          {/* Dónde aparece lo que se añade, que es lo que hay que saber antes
              de pulsar. El identificador y lo demás, en la ayuda de arriba. */}
          <span className="ayuda">Nace dentro de este apartado, vacío y al final.</span>
        </form>
      ) : (
        <p className="ayuda">
          Aquí dentro no van apartados: esto es una lista de fichas, y lo que tiene dentro son los
          campos de cada ficha. Las fichas se crean en el panel de situaciones de aprendizaje.
        </p>
      )}

      {/* Los campos con los que nace el apartado de arriba, y el alta de un campo en ESTE
          apartado. Van fuera del formulario de añadir: llevan sus propios formularios. */}
      {admiteHijos ? (
        <CamposDelApartadoNuevo
          tipos={tiposDeCampo}
          limites={limites}
          campos={camposNuevos}
          onCambio={setCamposNuevos}
          enTodas={enTodas}
          ocupado={ocupado}
        />
      ) : null}
      <AnadirCampo
        documentoId={documentoId}
        seccion={nodo.seccion}
        fila={fila}
        tipos={tiposDeCampo}
        limites={limites}
        plantillaVersion={plantillaVersion}
        enTodas={enTodas}
        onCambiado={onCambiado}
      />
      <QuitarCampos
        documentoId={documentoId}
        seccion={nodo.seccion}
        tituloApartado={nodo.titulo}
        fila={fila}
        plantillaVersion={plantillaVersion}
        enTodas={enTodas}
        onCambiado={onCambiado}
      />

      <div className="linea-estructura">
        <span className="suave">Orden y retirada</span>
        <button
          className="mini"
          type="button"
          ref={refSubir}
          onClick={() => mover('subir')}
          disabled={!puedeSubir}
        >
          ↑ subir
        </button>
        <button
          className="mini"
          type="button"
          ref={refBajar}
          onClick={() => mover('bajar')}
          disabled={!puedeBajar}
        >
          ↓ bajar
        </button>
        {confirma.estaAbierta() ? (
          <>
            <button className="mini" type="button" ref={confirma.refPaso} onClick={retirar}>
              sí, retirarlo{enTodas ? ` de ${enTodas}` : ''}
            </button>
            <button className="mini" type="button" onClick={confirma.cancelar}>
              cancelar
            </button>
          </>
        ) : (
          <button
            className="mini"
            type="button"
            ref={confirma.refAbrir()}
            onClick={() => confirma.abrir()}
            disabled={ocupado}
          >
            {enviando === 'retirar' ? 'Retirando…' : 'retirar del documento'}
          </button>
        )}
        {/* Dónde está el apartado, en texto: es lo único que le llega a quien no
            ve la pantalla, y lo que explica por qué un botón está apagado. */}
        <span className="ayuda">
          {i === -1
            ? 'No se encuentra entre sus hermanos: no se puede mover desde aquí.'
            : `Es el ${i + 1}.º de ${total} ${total === 1 ? 'apartado' : 'apartados'} de este nivel.`}
        </span>
      </div>

      {/* Lo que se va a llevar por delante la retirada, dicho en el momento de
          decidirlo: un apartado se va con lo que tenga dentro. */}
      {confirma.estaAbierta() ? (
        <div className="confirmacion">
          <p>
            Deja de salir en el documento y en el PDF
            {dentro ? `, y con él ${cuantos(dentro)} que tiene dentro` : ''}
            . <strong>No se borra nada</strong>: lo escrito se conserva entero y vuelve al restaurarlo.
          </p>
        </div>
      ) : null}

      {/* QUE RETIRAR NO BORRA SE DICE AQUÍ, NO EN UN AVISO QUE SALGA DESPUÉS, y
          por eso no se pliega: si se escondiera, el aviso llegaría tarde. Lo
          que se ha ido a la ayuda de la cabecera es lo de renombrar, que no se
          lleva nada por delante y se sabe en cuanto se ve el identificador. */}
      <p className="suave">
        <strong>Retirar no borra nada</strong>: el apartado deja de salir en el documento y en el
        PDF, su contenido se queda guardado, y se recupera desde{' '}
        <button className="enlace" type="button" onClick={() => onIr && onIr(null, null)}>
          la portada del documento
        </button>
        , donde salen los apartados retirados.
      </p>

      {/* El resultado, en una región que los lectores de pantalla anuncian: en el
          prototipo esto era un `toast`, que es exactamente lo que no se oye.
          Siempre montada —si apareciera y desapareciera no se anunciaría—, y
          fuera de la vista mientras no haya nada que decir. */}
      <p
        className={aviso || anadido ? 'bien aviso-hecho' : 'sr aviso-hecho'}
        role="status"
        ref={confirma.refAviso}
        tabIndex={-1}
      >
        {aviso || ''}
        {anadido ? (
          <>
            {' '}
            <button
              className="enlace"
              type="button"
              onClick={() => onIr && onIr(anadido.seccion, nodo.unidadId)}
            >
              Abrir «{anadido.titulo}» para escribir en él
            </button>
          </>
        ) : null}
      </p>

      {error ? (
        <div className="nota nota-error" role="alert">
          <div>
            {yaDiceQueNoHaCambiado(error) ? null : <strong>No se ha cambiado nada. </strong>}
            {mensajeDeError(error)}
            {error.estado === 409 ? (
              <p className="suave">
                Vuelve a cargar la página para ver la estructura como está ahora y repite el cambio
                si sigue haciendo falta. La plantilla viaja con su versión por lo mismo que un
                apartado viaja con la suya: dos jefaturas cambiándola a la vez perderían el trabajo
                de una de las dos sin enterarse.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------- los retirados
//
// Van en la portada del documento y no en el apartado, porque un apartado
// retirado ya no se puede abrir: no sale en el árbol. La portada es la única
// pantalla que se está mirando el documento entero, y es donde la tarjeta
// *Estructura* promete que se recuperan.
//
// La lista llega ya leída (`GET .../estructura`), que es la misma lectura que
// alimenta la tarjeta: la portada no pide nada por su cuenta.

export function ApartadosRetirados({
  documentoId, retirados, plantillaVersion, cuantasUnidades, comoSeLlaman, onCambiado,
}) {
  // La confirmación en dos pasos de cada fila está dentro de BorrarApartado; este gancho se usa
  // aquí solo por el aviso, que es de la lista entera y es donde tiene que acabar el foco cuando la
  // fila que se estaba borrando desaparece.
  const confirma = useConfirmacion();
  const [enviando, setEnviando] = useState(null);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);

  const lista = Array.isArray(retirados) ? retirados : [];
  // Con el aviso del último borrado se sigue pintando aunque la lista haya quedado vacía: es lo
  // único que dice que se ha hecho.
  if (!lista.length && !aviso) return null;

  const borrado = async (x, r) => {
    const c = r.contenido || {};
    setError(null);
    setAviso(`«${x.titulo || x.seccion}» se ha borrado para siempre`
      + (r.apartadosAfectados > 1 ? `, junto con los ${cuantos(r.apartadosAfectados - 1)} que tenía dentro` : '')
      + (c.conContenido ? ' y con todo lo que había escrito.' : '. No había nada escrito.')
      // Si la destrucción del contenido falló DESPUÉS del cambio, se dice: el apartado se ha ido,
      // pero lo escrito puede seguir guardado y nadie iría a buscarlo.
      + (avisoDeContenidoSinDestruir(r) || ''));
    confirma.terminar();
    if (onCambiado) await onCambiado('borrar', r);
  };

  const restaurar = async (seccion) => {
    setEnviando(seccion);
    setError(null);
    setAviso(null);
    try {
      const r = await cambiarEstructura(documentoId, 'restaurar', {
        seccion,
        cuerpo: { esperaPlantillaVersion: plantillaVersion },
      });
      if (onCambiado) onCambiado('restaurar', r || {});
    } catch (e) {
      setError(e);
    } finally {
      setEnviando(null);
    }
  };

  return (
    <section className="tarjeta estructura">
      <header className="tarjeta-cab">
        <h2>Apartados retirados</h2>
        <span className="suave">{lista.length}</span>
      </header>
      {/* Qué es estar retirado, que es el dato de esta tarjeta: se queda a la
          vista, en una línea. */}
      <p className="suave">
        <strong>No se han borrado.</strong> No salen en el documento ni en el PDF, su contenido
        sigue guardado, y al restaurarlos vuelven con su texto.
      </p>
      <ul className="lista-retirados" aria-label="Apartados retirados del documento">
        {lista.map((x) => (
          <li key={x.seccion}>
            <span className="retirado-nombre">
              {x.titulo || <span className="suave">sin título</span>}
            </span>
            <code>{x.seccion}</code>
            {/* Lo que se lleva dentro y si es de la plantilla de las unidades:
                restaurar un apartado de módulo lo devuelve a los once. */}
            {x.conHijos ? <span className="suave">con {cuantos(x.conHijos)} dentro</span> : null}
            {x.deUnidades ? <span className="chip chip-vacio">de los módulos</span> : null}
            <button
              className="mini"
              type="button"
              onClick={() => restaurar(x.seccion)}
              disabled={!!enviando}
              aria-label={`Restaurar «${x.titulo || x.seccion}» en el documento`}
              title={`Restaurar «${x.titulo || x.seccion}» en el documento`}
            >
              {enviando === x.seccion ? 'Restaurando…' : 'Restaurar'}
            </button>
            {/* La otra salida, y la única que destruye. Primero hay que haberlo retirado: por eso
                está aquí y en ningún otro sitio. */}
            <BorrarApartado
              documentoId={documentoId}
              retirado={x}
              plantillaVersion={plantillaVersion}
              cuantasUnidades={cuantasUnidades}
              comoSeLlaman={comoSeLlaman}
              ocupado={!!enviando}
              onBorrado={borrado}
            />
          </li>
        ))}
      </ul>
      <p
        className={aviso ? 'bien aviso-hecho' : 'sr aviso-hecho'}
        role="status"
        ref={confirma.refAviso}
        tabIndex={-1}
      >
        {aviso || ''}
      </p>
      {error ? (
        <div className="nota nota-error" role="alert">
          <div>
            {yaDiceQueNoHaCambiado(error) ? null : <strong>No se ha restaurado nada. </strong>}
            {mensajeDeError(error)}
          </div>
        </div>
      ) : null}
    </section>
  );
}
