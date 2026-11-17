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

import { useEffect, useId, useRef, useState } from 'react';
import Ayuda from './Ayuda';
import {
  avisoDeContenidoSinDestruir, cambiarEstructura, cuantoHayEscritoEnApartado, destinoDeLaEscritura,
  fraseDeAlcance, hermanosDe, leerPermisoDeApartado, leerPermisosDeRetirados, textoDeFalloAlBorrar,
  todasLasUnidades, unidadDelCamino, yaDiceQueNoHaCambiado,
} from './estructura-cliente';
import {
  apartadoDelModulo, borrarApartadoDelModulo, escribirEnElModulo, filaDelModulo, leerRetiradosDelModulo,
  volverALaComun,
} from './estructura-modulo-cliente';
import Plantilla from '../../core/plantilla';
import { QuitadosDelModulo } from './QuitarCampo';
import AnadirCampo from './AnadirCampo';
import useConfirmacion from './confirmar-cliente';
import { BorrarApartado } from './BorrarDefinitivo';
import { QuitarCampos } from './QuitarCampo';
import { CamposDelApartadoNuevo } from './NuevoCampo';
import EstructuraFicha from './EstructuraFicha';
import FichaEstructura from '../../core/ficha-estructura';

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
  tiposDeCampo, limites, apartado, permiso, puedeDocumento, comoSeLlamanElDocumento, filas,
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

  // Solo cuenta para quien puede cambiar el documento entero Y este apartado es de un módulo: ahí
  // elige si el cambio es para todos o solo para este módulo. Por omisión, para todos, que es lo que
  // hacía siempre; solo se cambia por un gesto suyo. Ver `destinoDeLaEscritura`.
  const [quiereTodos, setQuiereTodos] = useState(true);

  const refSubir = useRef(null);
  const refBajar = useRef(null);
  // Qué botón de mover se pulsó y en qué posición estaba el apartado: hace falta
  // para devolverle el foco cuando el árbol vuelva ya reordenado.
  const esperaFoco = useRef(null);

  const { i, total } = hermanosDe(camino, nodo);
  const { unidad, etiqueta, cuantas } = unidadDelCamino(camino);

  // A DÓNDE VA CADA ESCRITURA DE ESTA TARJETA. Es lo único de aquí que, si falla, falla en silencio:
  // un cambio que alguien cree suyo y sale en los once módulos. Se decide en `destinoDeLaEscritura`
  // (estructura-cliente.js, con las tres reglas escritas) a partir de lo que el SERVIDOR ha dicho de
  // este apartado (`permiso`):
  //
  //   · apartado común                             → las rutas de la plantilla (su única copia);
  //   · apartado de módulo, quien lleva ese módulo → el PUT de la estructura de ESA unidad;
  //   · apartado de módulo, la jefatura            → la plantilla (los N módulos), salvo que elija
  //                                                  «solo este módulo» con el selector de abajo.
  const deModulo = !!(nodo && nodo.unidadId);
  const permisoPlantilla = permiso && permiso.plantilla ? permiso.plantilla : null;
  const permisoModulo = permiso && permiso.modulo ? permiso.modulo : null;
  const destino = destinoDeLaEscritura({
    apartadoDeModulo: deModulo,
    puedeDocumento: !!puedeDocumento,
    puedePlantilla: !!puedeDocumento || !!(permisoPlantilla && permisoPlantilla.puede),
    puedeModulo: !!(permisoModulo && permisoModulo.puede),
    quiereTodos,
  });
  const enElModulo = destino === 'modulo';
  // LAS OPERACIONES DEL APARTADO (añadir un subapartado, moverlo, retirarlo) salen de lo que el
  // SERVIDOR dice de ESTE apartado, no del permiso del documento entero: «el documento es totalmente
  // configurable por quien tiene permisos en ese apartado, sea cual sea el apartado».
  //   · en la plantilla: la jefatura (`puedeDocumento`) o quien, por `puedeCambiarApartado`, puede
  //     configurar este apartado común. Un bloque de módulos se queda siempre con la jefatura: retirarlo
  //     o añadirle algo lo cambiaría en los once (el servidor también lo niega, pero un botón que se
  //     sabe que dará 403 no se ofrece);
  //   · en el módulo: quien lo lleva, que es lo que dice `permisoModulo.puede` (destino 'modulo').
  const esBloque = fila ? !!fila.instancias : (nodo && nodo.tipo === 'bloque');
  const completa = destino === 'modulo'
    || (destino === 'plantilla' && (!!puedeDocumento || (!!(permisoPlantilla && permisoPlantilla.puede) && !esBloque)));
  const alcance = enElModulo ? (permisoModulo && permisoModulo.alcance) : (permisoPlantilla && permisoPlantilla.alcance);
  const nombreDelModulo = comoSeLlamanElDocumento || etiqueta || (nodo && nodo.etiqueta) || null;
  const fraseAlcance = fraseDeAlcance(alcance, nombreDelModulo);
  const enviarAlModulo = enElModulo
    ? (accion, opciones) => escribirEnElModulo(documentoId, nodo.unidadId, fila, { accion, filas, ...opciones })
    : undefined;
  const filaDeCampos = enElModulo ? filaDelModulo(fila, permisoModulo.estructura, nodo ? nodo.seccion : '') : fila;

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
  // Sin nada que pueda cambiar aquí, no hay tarjeta (la pantalla tampoco la monta, pero el servidor
  // manda y esta es la segunda vez que se mira).
  if (!destino) return null;

  // Qué se le puede hacer a este apartado lo dice el servidor, apartado por
  // apartado, en la lectura de la estructura: `puedeSubir` y `puedeBajar` cuentan
  // solo los hermanos VISIBLES —un botón que no hace nada porque el hermano de
  // arriba está retirado no se distingue de uno estropeado— y `admiteHijos` es
  // que no, dentro de una lista de fichas no van apartados. Si la lectura no ha
  // llegado, se usa el puesto que se ve en el árbol, que no lleva retirados.
  //
  // EN UN MÓDULO el árbol que manda es el del módulo: subir y bajar cuentan los hermanos que ESE módulo
  // ve (puede haber retirado alguno), y un apartado propio, que no está en la plantilla, también admite
  // hijos. Se calcula con la misma regla del núcleo que lo pinta y lo exporta.
  const delModulo = enElModulo ? apartadoDelModulo(filas, permisoModulo.estructura, nodo.seccion) : null;
  const puedeSubir = delModulo ? delModulo.puedeSubir : (fila ? fila.puedeSubir : i > 0);
  const puedeBajar = delModulo ? delModulo.puedeBajar : (fila ? fila.puedeBajar : (i >= 0 && i < total - 1));
  const admiteHijos = delModulo ? delModulo.admiteHijos : (fila ? fila.admiteHijos : true);
  const deUnidades = fila ? !!fila.deUnidades : !!unidad;
  const esBloqueDeUnidades = fila ? !!fila.instancias : nodo.tipo === 'bloque';
  const cuantasUnidades = unidades || cuantas;
  // Cómo se llaman: «módulo» en una PD de FP, «materia» en ESO. Sale del bloque
  // que las agrupa —el del camino si estamos dentro de una unidad, o este mismo
  // nodo si lo que se está mirando es el bloque— y nunca de un id escrito aquí.
  const comoSeLlaman = etiqueta || nodo.etiqueta || null;
  const enTodas = !enElModulo && (deUnidades || esBloqueDeUnidades) && cuantasUnidades > 1
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
      // LA LÍNEA QUE NO SE CRUZA. Un cambio de un apartado de MÓDULO hecho desde un módulo va SIEMPRE al
      // PUT de la estructura de esa unidad, nunca a las rutas de la plantilla: por ahí saldría en los
      // once módulos y nadie se enteraría. Solo la jefatura, que ha elegido «a todos», va por la
      // plantilla. La decisión de a dónde va es `destino` (`destinoDeLaEscritura`); esto es el segundo
      // cerrojo, por si alguien añade una acción y se olvida de mirarla.
      if (deModulo && !enElModulo && !puedeDocumento) {
        throw new Error('Este cambio es de un apartado de módulo y saldría en todos los módulos: no se manda.');
      }
      const envio = { ...cuerpo, esperaPlantillaVersion: plantillaVersion };
      const r = enElModulo
        ? await enviarAlModulo(`${accion}_apartado`, { seccion, cuerpo: envio })
        : await cambiarEstructura(documentoId, accion, {
          seccion,
          // La versión de la plantilla con la que se leyó: si alguien la ha
          // cambiado por medio, el servidor contesta 409 y no escribe nada. Es
          // opcional en el contrato y se manda siempre: lo que se quiere evitar es
          // justo deshacer el cambio de otra jefatura sin enterarse.
          cuerpo: envio,
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
  const dentro = fila && !enElModulo ? fila.hijos : (nodo.hijos || []).length;

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
      {/* EL ALCANCE, DICHO ANTES DE TOCAR NADA y con el número delante. Lo manda el servidor
          (`alcance`) y vale para todo lo que hay debajo: es la respuesta a «¿esto a cuántos
          afecta?» antes de pulsar. No impide nada. */}
      {fraseAlcance ? (
        <div className="nota nota-lock" role="note" aria-label="Alcance del cambio">
          <div>
            <strong>{fraseAlcance}</strong>
            {enElModulo ? ' Los demás no se enteran.' : ''}
          </div>
        </div>
      ) : null}

      {/* LA JEFATURA ELIGE: la tarjeta de un apartado de módulo cambia por omisión los N módulos
          (como siempre); `solo este módulo` es un gesto suyo. Quien solo lleva el módulo no ve esto:
          para él no hay otra cosa que elegir. */}
      {deModulo && puedeDocumento && permisoModulo && permisoModulo.puede ? (
        <fieldset className="linea-estructura">
          <legend>¿A quién se aplica el cambio?</legend>
          <label>
            <input type="radio" name="alcance-estructura" checked={quiereTodos} onChange={() => setQuiereTodos(true)} />
            {' '}A todos: cambia la plantilla de {todasLasUnidades(cuantasUnidades || 0, comoSeLlaman)}
          </label>
          <label>
            <input type="radio" name="alcance-estructura" checked={!quiereTodos} onChange={() => setQuiereTodos(false)} />
            {' '}Solo a este módulo
          </label>
        </fieldset>
      ) : null}

      {enElModulo ? (
        <p className="ayuda">
          Aquí cambias este módulo: sus campos y también el apartado entero —renombrarlo, moverlo,
          añadirle subapartados o retirarlo—. Los otros módulos siguen como estaban.
        </p>
      ) : null}

      {enTodas && !fraseAlcance ? (
        <div className="linea-estructura ayuda-plantilla">
          <span>Esto es la plantilla de {enTodas}.</span>
          <Ayuda sobre={`qué cambia en ${enTodas}`}>
            <p>
              Este bloque no es solo de {unidad ? `«${unidad.titulo}»` : 'esta unidad'}: {enTodas}{' '}
              repiten las mismas secciones.{' '}
              {deUnidades
                ? <>Lo que cambies aquí —título, orden, añadir o retirar— sale en {enTodas} a la vez,
                  y no hay forma de cambiarlo en uno solo.</>
                : <>Lo que añadas aquí nace en {enTodas} a la vez.</>}{' '}
              <strong>El contenido no se toca</strong>: cada {comoSeLlaman || 'unidad'} conserva el suyo,
              y lo que haya escrito cada docente en su módulo se queda donde está.
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

      {completa && admiteHijos ? (
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
      ) : completa ? (
        <p className="ayuda">
          Aquí dentro no van apartados: esto es una lista de fichas, y lo que tiene dentro son los
          campos de cada ficha. Las fichas se crean en el panel de situaciones de aprendizaje.
        </p>
      ) : null}

      {/* Los campos con los que nace el apartado de arriba, y el alta de un campo en ESTE
          apartado. Van fuera del formulario de añadir: llevan sus propios formularios. */}
      {completa && admiteHijos ? (
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
        fila={filaDeCampos}
        tipos={tiposDeCampo}
        limites={limites}
        plantillaVersion={plantillaVersion}
        enTodas={enTodas}
        onCambiado={onCambiado}
        enviar={enviarAlModulo}
        alcance={fraseAlcance}
      />
      <QuitarCampos
        documentoId={documentoId}
        seccion={nodo.seccion}
        tituloApartado={nodo.titulo}
        fila={filaDeCampos}
        plantillaVersion={plantillaVersion}
        enTodas={enTodas}
        onCambiado={onCambiado}
        enviar={enviarAlModulo}
        alcance={fraseAlcance}
        dondeSeRecupera={enElModulo ? '«Quitados de este módulo», aquí abajo' : null}
      />
      {/* Lo que este módulo ha quitado, para devolverlo. En la plantilla eso vive en la portada
          del documento; un módulo no tiene portada propia, y es aquí donde se echó de menos. */}
      {enElModulo ? (
        <QuitadosDelModulo
          // Los dos ids son los que necesita el borrado definitivo de una casilla propia: su ruta es
          // la de la unidad, no la de la plantilla, porque lo que destruye es de ESTE módulo.
          documentoId={documentoId}
          unidadId={nodo.unidadId}
          seccion={nodo.seccion}
          tituloApartado={nodo.titulo}
          fila={filaDeCampos}
          plantillaVersion={plantillaVersion}
          enviar={enviarAlModulo}
          onCambiado={onCambiado}
        />
      ) : null}
      {enElModulo ? (
        <ApartadosRetiradosDelModulo
          documentoId={documentoId}
          unidadId={nodo.unidadId}
          filas={filas}
          plantillaVersion={plantillaVersion}
          onCambiado={onCambiado}
          recarga={permisoModulo.updatedAt}
          conVolverALaComun={false}
        />
      ) : null}

      {/* LA TABLA DE LA FICHA, solo en un apartado que tiene fichas. Esta tarjeta ya es de quien puede
          cambiar la estructura, así que la pregunta de si se ofrece se reduce a si el apartado abierto
          —y no el anterior, mientras llega— lleva un campo de fichas. */}
      {completa && apartado && apartado.seccion === nodo.seccion
        && (apartado.unidadId || null) === (nodo.unidadId || null)
        && FichaEstructura.seOfrece(true, apartado.campos) ? (
          <EstructuraFicha
            documentoId={documentoId}
            apartado={apartado}
            plantillaVersion={plantillaVersion}
            enTodas={enTodas}
            comoSeLlaman={comoSeLlaman}
            onCambiado={onCambiado}
          />
        ) : null}

      {completa ? (
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
              sí, retirarlo{enElModulo ? ' de este módulo' : (enTodas ? ` de ${enTodas}` : '')}
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
            {enviando === 'retirar' ? 'Retirando…' : (enElModulo ? 'retirar de este módulo' : 'retirar del documento')}
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
      ) : null}

      {/* Lo que se va a llevar por delante la retirada, dicho en el momento de
          decidirlo: un apartado se va con lo que tenga dentro. */}
      {completa && confirma.estaAbierta() ? (
        <div className="confirmacion" role="group" aria-label="Retirar el apartado">
          <p>
            {/* EL ALCANCE, antes de confirmar y con el número delante. */}
            {fraseAlcance ? <><strong>{fraseAlcance}</strong>{' '}</> : null}
            {enElModulo ? 'Deja de salir en este módulo y en su PDF, y en ningún otro' : 'Deja de salir en el documento y en el PDF'}
            {dentro ? `, y con él ${cuantos(dentro)} que tiene dentro` : ''}
            . <strong>No se borra nada</strong>: lo escrito se conserva entero y vuelve al restaurarlo.
          </p>
        </div>
      ) : null}

      {/* QUE RETIRAR NO BORRA SE DICE AQUÍ, NO EN UN AVISO QUE SALGA DESPUÉS, y
          por eso no se pliega: si se escondiera, el aviso llegaría tarde. Lo
          que se ha ido a la ayuda de la cabecera es lo de renombrar, que no se
          lleva nada por delante y se sabe en cuanto se ve el identificador. */}
      {completa ? (
      <p className="suave">
        {enElModulo ? (
          <>
            <strong>Retirar no borra nada</strong>: el apartado deja de salir en este módulo y en su
            PDF, su contenido se queda guardado, y se recupera desde la lista «Apartados retirados de
            este módulo», que sale aquí y en la página del módulo.
          </>
        ) : (
          <>
            <strong>Retirar no borra nada</strong>: el apartado deja de salir en el documento y en el
            PDF, su contenido se queda guardado, y se recupera desde{' '}
            <button className="enlace" type="button" onClick={() => onIr && onIr(null, null)}>
              la portada del documento
            </button>
            , donde salen los apartados retirados.
          </>
        )}
      </p>
      ) : null}

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

//
// LA LISTA ES DEL DOCUMENTO Y LO QUE SE PUEDE HACER CON CADA FILA, DE CADA APARTADO. Quien puede cambiar
// el documento entero (`puedeDocumento`) ve todas. Quien solo tiene asignado un apartado común ve
// únicamente las filas que el SERVIDOR dice que puede configurar (`puedeCambiarApartado`), así que puede
// devolver o borrar lo que retiró sin que se le ofrezca lo de los demás.
export function ApartadosRetirados({
  documentoId, retirados, plantillaVersion, cuantasUnidades, comoSeLlaman, onCambiado, puedeDocumento = true,
}) {
  // La confirmación en dos pasos de cada fila está dentro de BorrarApartado; este gancho se usa
  // aquí solo por el aviso, que es de la lista entera y es donde tiene que acabar el foco cuando la
  // fila que se estaba borrando desaparece.
  const confirma = useConfirmacion();
  const [enviando, setEnviando] = useState(null);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);

  const todas = Array.isArray(retirados) ? retirados : [];
  const [permitidos, setPermitidos] = useState(null);
  const claveDeLista = todas.map((x) => x.seccion).join('|');
  useEffect(() => {
    if (puedeDocumento || !claveDeLista) return undefined;
    let vivo = true;
    leerPermisosDeRetirados(documentoId, claveDeLista.split('|')).then((p) => { if (vivo) setPermitidos(p); });
    return () => { vivo = false; };
  }, [documentoId, puedeDocumento, claveDeLista]);
  const lista = puedeDocumento ? todas : todas.filter((x) => permitidos && permitidos.has(x.seccion));
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

// ---------------------------------------------------------------- lo que se pierde en un módulo
//
// Lo que se destruye al borrar algo propio de un módulo o al volver a la estructura común lo cuenta el
// SERVIDOR (`perdida`, de la primera llamada sin confirmar), y la pantalla lo dice tal cual: el número
// que se enseña y lo que se destruye salen del mismo cálculo. No se usa la frase `mensaje` del servidor
// porque lleva instrucciones para quien llama a la API («Manda { confirmar: true }»).

const parteDeLoPerdido = (cuantas, escritas, uno, varios, vacio, vacios) => {
  const cabeza = `${cuantas} ${cuantas === 1 ? uno : varios}`;
  if (!escritas) return `${cabeza}, ${cuantas === 1 ? vacio : vacios}`;
  return `${cabeza}, ${escritas} con algo escrito`;
};

function fraseDeLoPerdido(perdida) {
  const p = perdida || {};
  const n = (x) => Number(x) || 0;
  const partes = [];
  if (n(p.apartados)) partes.push(parteDeLoPerdido(n(p.apartados), n(p.conContenido), 'apartado', 'apartados', 'vacío', 'todos vacíos'));
  if (n(p.campos)) partes.push(parteDeLoPerdido(n(p.campos), n(p.casillasEscritas), 'casilla', 'casillas', 'vacía', 'todas vacías'));
  return partes.length ? partes.join(' y ') : 'nada';
}

// ---------------------------------------------------------------- borrar un apartado propio de un módulo
//
// La misma confirmación que BorrarApartado (BorrarDefinitivo.js): se ESCRIBE EL TÍTULO, con la regla de
// core/plantilla.js y el foco de core/confirmar.js. Lo que cambia es lo que la pantalla tiene que decir,
// porque es el sentido de la función: el alcance es ESTE módulo y ninguno más, se va con sus
// subapartados y se dice cuánto hay escrito. Eso último lo trae el servidor: la llamada sin confirmar
// es la pregunta, y se hace al abrir la confirmación, no al pintar la lista (sería una por fila).
// El botón de borrar no se enciende hasta que ha llegado el recuento: confirmar sin haber visto lo que
// se pierde es justo lo que esta confirmación existe para impedir.
//
// Quién puede no se decide aquí: esta fila solo existe si el servidor dijo `puede`, y vuelve a comprobarlo.

function BorrarApartadoPropio({ documentoId, unidadId, retirado, ocupado, onBorrado }) {
  const confirma = useConfirmacion();
  const abierta = confirma.estaAbierta();
  const [escrito, setEscrito] = useState('');
  const [perdida, setPerdida] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);
  const id = useId();

  const titulo = retirado.titulo || retirado.seccion;
  const pedido = Plantilla.loQueHayQueEscribir(titulo);
  const entero = Plantilla.mismoTitulo(pedido, titulo);
  const coincide = Plantilla.confirmaTitulo(escrito, titulo);
  const dentro = perdida ? Math.max((Number(perdida.apartados) || 1) - 1, 0) : 0;

  useEffect(() => {
    if (!abierta) return undefined;
    let vivo = true;
    setPerdida(null);
    borrarApartadoDelModulo(documentoId, unidadId, retirado.seccion)
      .then((r) => {
        if (!vivo) return;
        // No debería pasar (siempre se pierde al menos lo que se borra), pero si el servidor lo
        // hubiera hecho ya, la pantalla se entera en vez de esperar una confirmación sin objeto.
        if (r.hecho) onBorrado(retirado, r.respuesta, null);
        else setPerdida(r.perdida);
      })
      .catch((e) => { if (vivo) setError(e); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierta, documentoId, unidadId, retirado.seccion]);

  const cerrar = () => { setEscrito(''); setError(null); setPerdida(null); confirma.cancelar(); };

  const borrar = async (e) => {
    e.preventDefault();
    if (!coincide || !perdida || enviando) return;
    setEnviando(true);
    setError(null);
    try {
      const r = await borrarApartadoDelModulo(documentoId, unidadId, retirado.seccion, { confirmar: true });
      // El foco de después lo lleva el aviso de la lista: esta fila se va con el borrado.
      await onBorrado(retirado, r.respuesta, perdida);
    } catch (err) {
      setError(err);
      setEnviando(false);
    }
  };

  if (!abierta) {
    return (
      <button
        className="mini mini-rojo"
        type="button"
        ref={confirma.refAbrir()}
        onClick={() => confirma.abrir()}
        disabled={ocupado}
        aria-label={`Borrar para siempre «${titulo}» de este módulo`}
        title={`Borrar «${titulo}» para siempre de este módulo. No se puede deshacer`}
      >
        Borrar para siempre…
      </button>
    );
  }

  return (
    <form className="borrado" onSubmit={borrar} aria-label={`Borrar «${titulo}» para siempre de este módulo`}>
      <p>
        <strong>Esto no se puede deshacer.</strong> Se borra «{titulo}» solo de este módulo; los demás
        no cambian. Se va
        {dentro ? ` con los ${cuantos(dentro)} que tiene dentro` : ''}
        {' '}y con todo lo que hay escrito. {perdida
          ? <>{cuantoHayEscritoEnApartado(perdida)} <span className="suave">({fraseDeLoPerdido(perdida)}.)</span></>
          : 'Contando lo que se pierde…'}
      </p>
      <p className="suave">
        Si no estás seguro, déjalo donde está: en la lista de retirados no estorba y se puede restaurar.
      </p>
      <p className="borrado-escribir">
        <label htmlFor={id}>
          {entero ? 'Para borrarlo, escribe su título:' : 'Para borrarlo, escribe las primeras palabras de su título:'}
        </label>
        {' '}
        <strong className="borrado-pedido">{pedido}</strong>
        {' '}
        <input
          id={id}
          ref={confirma.refPaso}
          type="text"
          value={escrito}
          autoComplete="off"
          onChange={(e) => setEscrito(e.target.value)}
          disabled={enviando}
          aria-describedby={`${id}-como`}
        />
        <span className="ayuda" id={`${id}-como`}>
          No hacen falta las tildes ni las mayúsculas.
          {entero ? '' : ' El título completo también vale.'}
        </span>
      </p>
      <p className="borrado-botones">
        <button className="mini mini-rojo" type="submit" disabled={!coincide || !perdida || enviando}>
          {enviando ? 'Borrando…' : `Borrar «${titulo}» para siempre`}
        </button>
        {' '}
        <button className="mini" type="button" onClick={cerrar} disabled={enviando}>
          Cancelar
        </button>
      </p>
      {error ? (
        <div className="nota nota-error" role="alert">
          <div>
            <strong>{textoDeFalloAlBorrar(error).texto} </strong>
            {error.message}
          </div>
        </div>
      ) : null}
    </form>
  );
}

// ---------------------------------------------------------------- volver a la estructura común
//
// DÓNDE VA. En la página del módulo (ApartadosRetiradosDelModulo con `conVolverALaComun`, que es como la
// monta Visor.js) y NO en la tarjeta de cada apartado: lo que se deshace es el desvío entero del
// módulo, no el de un apartado, y puesto debajo de un apartado concreto parecería que solo afecta a
// ese. Va junto a «Apartados retirados de este módulo» porque es la otra cosa que se hace con lo
// propio del módulo: devolver un apartado o devolverlo todo.
//
// LA PREGUNTA SE HACE AL PULSAR, no al abrir la confirmación, porque a veces no hay pregunta: si el
// módulo no tiene nada propio que perder, la llamada sin confirmar ES la operación y `volverALaComun`
// devuelve `hecho: true`. Entonces se dice «hecho» y no se pide nada. Si hay algo que perder, se abre
// una confirmación EN DOS PASOS (no se escribe nada: no se borra un apartado concreto, se deshace el
// desvío, y la lista de lo que se pierde está delante), con el foco donde manda core/confirmar.js.
//
// SOLO SALE si el servidor dice que el módulo tiene estructura propia (`estructura` de su lectura) y
// que quien mira puede cambiarla (`puedeCambiar`). Se lee con la misma lectura por apartado que usan
// las demás tarjetas, preguntando por un apartado común del módulo, porque la ruta no tiene una
// lectura sin apartado que diga el permiso. El servidor vuelve a comprobar ambas cosas al escribir.

function VolverALaComun({ documentoId, unidadId, filas, onCambiado, recarga }) {
  const confirma = useConfirmacion();
  const [propia, setPropia] = useState(false);
  const [preguntando, setPreguntando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [perdida, setPerdida] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const comun = Array.isArray(filas) ? filas.find((f) => f.deUnidades && !f.instancias && !f.retirado) : null;
    if (!unidadId || !comun) { setPropia(false); return undefined; }
    let vivo = true;
    leerPermisoDeApartado(documentoId, comun.seccion, unidadId)
      .then((p) => { if (vivo) setPropia(!!(p.modulo && p.modulo.puede && p.modulo.estructura)); })
      .catch(() => { if (vivo) setPropia(false); });
    return () => { vivo = false; };
  }, [documentoId, unidadId, filas, recarga]);

  if (!propia && !aviso) return null;

  const terminado = async (respuesta, dicho) => {
    setPropia(false);
    setPerdida(null);
    setError(null);
    setAviso(dicho + (avisoDeContenidoSinDestruir(respuesta) || ''));
    confirma.terminar();
    if (onCambiado) await onCambiado('volver_a_la_comun', respuesta || {});
  };

  const preguntar = async () => {
    setPreguntando(true);
    setError(null);
    setAviso(null);
    try {
      const r = await volverALaComun(documentoId, unidadId);
      if (r.hecho) {
        await terminado(r.respuesta, 'Este módulo vuelve a seguir la estructura común. No había nada propio que perder.');
      } else {
        setPerdida(r.perdida);
        confirma.abrir();
      }
    } catch (e) {
      setError(e);
    } finally {
      setPreguntando(false);
    }
  };

  const confirmar = async () => {
    setEnviando(true);
    setError(null);
    try {
      const r = await volverALaComun(documentoId, unidadId, { confirmar: true });
      await terminado(r.respuesta, `Este módulo vuelve a seguir la estructura común. Se ha borrado: ${fraseDeLoPerdido(perdida)}.`);
    } catch (e) {
      setError(e);
    } finally {
      setEnviando(false);
    }
  };

  const cancelar = () => { setError(null); setPerdida(null); confirma.cancelar(); };

  return (
    <section className="tarjeta estructura">
      <header className="tarjeta-cab"><h2>Estructura de este módulo</h2></header>
      {propia ? (
        confirma.estaAbierta() ? (
          <div className="borrado" role="group" aria-label="Volver este módulo a la estructura común">
            <p>
              <strong>Esto no se puede deshacer.</strong> Este módulo deja su estructura propia y vuelve
              a la común. Los demás módulos no cambian. Se borra: <strong>{fraseDeLoPerdido(perdida)}</strong>,
              con todo lo que hay escrito en ello. Lo que es de la estructura común se queda como está.
            </p>
            <p className="borrado-botones">
              <button className="mini mini-rojo" type="button" ref={confirma.refPaso} onClick={confirmar} disabled={enviando}>
                {enviando ? 'Volviendo…' : 'Sí, volver a la estructura común'}
              </button>
              {' '}
              <button className="mini" type="button" onClick={cancelar} disabled={enviando}>
                Cancelar
              </button>
            </p>
          </div>
        ) : (
          <>
            <p className="suave">
              Este módulo tiene apartados o casillas propios, distintos de la estructura común.
              Puedes devolverlo a la común; antes se te dice cuánto contenido se pierde.
            </p>
            <p>
              <button
                className="mini mini-rojo"
                type="button"
                ref={confirma.refAbrir()}
                onClick={preguntar}
                disabled={preguntando}
                aria-label="Volver este módulo a la estructura común"
                title="Volver este módulo a la estructura común"
              >
                {preguntando ? 'Mirando lo que se pierde…' : 'Volver a la estructura común…'}
              </button>
            </p>
          </>
        )
      ) : null}
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
            <strong>{textoDeFalloAlBorrar(error).texto} </strong>
            {error.message}
          </div>
        </div>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------- añadir un apartado de primer nivel A UN MÓDULO
//
// EL HUECO QUE ESTO TAPA. La tarjeta *Estructura* añade un apartado DENTRO del apartado que se está
// mirando (`padre: nodo.seccion`), y no sale en la página de un módulo: un módulo no es un apartado de
// la plantilla (ver `tarjetaEstructura` en Visor.js). El resultado era que quien lleva un módulo podía
// añadir un subapartado dentro de «Metodología», pero no un apartado de primer nivel al módulo: para
// eso tenía que meterlo dentro de otro, que no es lo mismo ni se imprime igual. El servidor sí lo
// permitía desde el principio —`componerApartado` pone el bloque del módulo como padre por omisión—,
// así que lo que faltaba era por dónde pedirlo.
//
// LO QUE SE AÑADE ES SOLO DE ESTE MÓDULO, y hay que decirlo antes de pulsar. Un apartado que se añade
// aquí entra en la estructura propia del módulo, es decir **desvía el módulo** de la común: los otros
// diez no cambian. Para que un apartado nuevo salga en todos los módulos, el sitio es la tarjeta
// *Estructura* de «Módulos», que escribe en la plantilla. Se dice las dos cosas, porque desde dentro
// de un módulo no se ve la diferencia.
//
// DESVIARSE NO AÍSLA, y eso también se dice: un módulo con estructura propia sigue recibiendo lo que
// la jefatura añada después a la común (docs/estructura-por-modulo.md §3.1). Sin esa frase, «se desvía
// de la común» suena a quedarse fuera, y nadie lo usaría.
//
// QUIÉN LA VE. Quien puede cambiar la estructura de este módulo, que lo dice el servidor: la docente
// que lo lleva, la jefatura del departamento y el soporte (`reglaEstructuraPropia` en core/permisos.js).
// Se pregunta con la misma lectura por apartado que usa `VolverALaComun`, porque la ruta de la unidad
// no tiene una lectura sin apartado que diga el permiso. El servidor lo vuelve a comprobar al escribir.

export function AnadirApartadoAlModulo({
  documentoId, unidadId, filas, plantillaVersion, tiposDeCampo, limites, onCambiado, recarga, onIr,
}) {
  const [puede, setPuede] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [camposNuevos, setCamposNuevos] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const [anadido, setAnadido] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const comun = Array.isArray(filas) ? filas.find((f) => f.deUnidades && !f.instancias && !f.retirado) : null;
    if (!unidadId || !comun) { setPuede(false); return undefined; }
    let vivo = true;
    leerPermisoDeApartado(documentoId, comun.seccion, unidadId)
      .then((p) => { if (vivo) setPuede(!!(p.modulo && p.modulo.puede)); })
      .catch(() => { if (vivo) setPuede(false); });
    return () => { vivo = false; };
  }, [documentoId, unidadId, filas, recarga]);

  if (!puede) return null;

  const ocupado = enviando;

  const anadir = async (ev) => {
    ev.preventDefault();
    const limpio = titulo.trim();
    if (!limpio || ocupado) return;
    setEnviando(true);
    setError(null);
    setAviso(null);
    try {
      // Sin `padre`: `componerApartado` pone el bloque del módulo, que es el primer nivel. Decirlo a
      // mano aquí obligaría a esta pantalla a saber cómo se llama ese bloque, que es cosa del árbol.
      const r = await escribirEnElModulo(documentoId, unidadId, null, {
        accion: 'anadir_apartado',
        filas,
        cuerpo: {
          titulo: limpio,
          ...(camposNuevos.length ? { campos: camposNuevos.map((c) => c.peticion) } : {}),
          esperaPlantillaVersion: plantillaVersion,
        },
      });
      setTitulo('');
      setCamposNuevos([]);
      setAnadido(r.seccion ? { seccion: r.seccion, titulo: r.titulo || limpio } : null);
      setAviso(`Apartado «${r.titulo || limpio}» añadido a este módulo${r.seccion ? ` con el identificador ${r.seccion}` : ''}.`
        + ' Los otros módulos no han cambiado.');
      if (onCambiado) await onCambiado('anadir', r || {});
    } catch (e) {
      setError(e);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <section className="tarjeta estructura">
      <header className="tarjeta-cab"><h2>Añadir un apartado a este módulo</h2></header>
      <p className="suave">
        Nace en el <strong>primer nivel de este módulo</strong>, al final y vacío. Sale{' '}
        <strong>solo en este módulo</strong>: los demás no cambian. Para que un apartado nuevo salga en
        todos, se añade desde la tarjeta <em>Estructura</em> de «Módulos».
      </p>
      <form className="linea-estructura" onSubmit={anadir}>
        <label htmlFor="anadir-al-modulo">Título del apartado nuevo</label>
        <input
          id="anadir-al-modulo"
          value={titulo}
          onChange={(ev) => setTitulo(ev.target.value)}
          placeholder="Título del apartado nuevo"
          autoComplete="off"
          disabled={ocupado}
        />
        <button className="btn-ghost" type="submit" disabled={ocupado || !titulo.trim()}>
          {enviando ? 'Añadiendo…' : 'Añadir'}
        </button>
      </form>

      {/* Los campos con los que nace, igual que en la tarjeta de un apartado. Van fuera del
          formulario de arriba: llevan sus propios formularios. */}
      <CamposDelApartadoNuevo
        tipos={tiposDeCampo}
        limites={limites}
        campos={camposNuevos}
        onCambio={setCamposNuevos}
        // `enTodas` es falso siempre: lo que se añade aquí es de este módulo y de ninguno más, y es
        // justo lo que la tarjeta promete arriba.
        enTodas={false}
        ocupado={ocupado}
      />

      <Ayuda sobre="añadir un apartado a un solo módulo">
        <p>
          Este módulo pasa a tener <strong>estructura propia</strong>, que es como se llama a seguir una
          estructura distinta de la común. No se queda fuera de nada: lo que la jefatura del departamento
          añada después a la estructura común <strong>sigue llegando</strong> a este módulo, y lo que
          retire se va también. Lo propio es solo lo que se añade o se cambia aquí.
        </p>
        <p>
          El identificador lo pone el servidor y empieza por <code>m_</code>, que es lo que distingue lo
          propio de un módulo de lo que es común. Renombrar el apartado no cambia el identificador, así
          que no rompe los enlaces que alguien tenga guardados.
        </p>
      </Ayuda>

      {/* El resultado, en una región que los lectores de pantalla anuncian, y montada siempre: si
          apareciera y desapareciera no se anunciaría (igual que en la tarjeta de un apartado). */}
      <p className={aviso ? 'bien aviso-hecho' : 'sr aviso-hecho'} role="status">
        {aviso || ''}
        {anadido ? (
          <>
            {' '}
            <button className="enlace" type="button" onClick={() => onIr && onIr(anadido.seccion, unidadId)}>
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
          </div>
        </div>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------- los retirados de UN módulo
//
// Un apartado retirado en un módulo desaparece de ese módulo y de ninguno más, y no tiene portada
// propia donde buscarlo: se devuelve desde aquí. Sale en la tarjeta de cualquier apartado del módulo y
// en la página del módulo, que es donde se aterriza al retirar uno de primer nivel. La lista la lee de
// la estructura del módulo, y cada fila solo se ofrece si el servidor dice que se puede cambiar. La
// escritura va por el PUT de esa unidad (`escribirEnElModulo`), igual que retirarlo: nunca por la
// plantilla, que lo devolvería —y lo retiraría— en los once.

export function ApartadosRetiradosDelModulo({
  documentoId, unidadId, filas, plantillaVersion, onCambiado, recarga, conVolverALaComun = true,
}) {
  // El aviso de después del borrado es de la lista entera: la fila que se borra desaparece y el foco
  // tiene que acabar en un sitio que siga ahí (ver confirmar-cliente.js).
  const confirma = useConfirmacion();
  const [lista, setLista] = useState([]);
  const [enviando, setEnviando] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [error, setError] = useState(null);
  const [vuelta, setVuelta] = useState(0);

  useEffect(() => {
    if (!unidadId || !Array.isArray(filas)) { setLista([]); return undefined; }
    let vivo = true;
    leerRetiradosDelModulo(documentoId, unidadId, filas)
      .then((r) => { if (vivo) setLista(r.retirados.filter((x) => x.puede)); })
      .catch(() => { if (vivo) setLista([]); });
    return () => { vivo = false; };
  }, [documentoId, unidadId, filas, recarga, vuelta]);

  const volver = conVolverALaComun ? (
    <VolverALaComun
      documentoId={documentoId}
      unidadId={unidadId}
      filas={filas}
      onCambiado={onCambiado}
      recarga={recarga}
    />
  ) : null;
  if (!lista.length && !aviso) return volver;

  const borrado = async (x, respuesta, perdida) => {
    const dentro = perdida ? Math.max((Number(perdida.apartados) || 1) - 1, 0) : 0;
    setError(null);
    setAviso(`«${x.titulo}» se ha borrado para siempre de este módulo; los otros módulos no han cambiado`
      + (dentro ? `, junto con los ${cuantos(dentro)} que tenía dentro` : '')
      + (perdida && perdida.conContenido ? ' y con todo lo que había escrito.' : '. No había nada escrito.')
      + (avisoDeContenidoSinDestruir(respuesta) || ''));
    confirma.terminar();
    setVuelta((n) => n + 1);
    if (onCambiado) await onCambiado('borrar', respuesta || {});
  };

  const restaurar = async (x) => {
    setEnviando(x.seccion);
    setError(null);
    setAviso(null);
    try {
      const r = await escribirEnElModulo(documentoId, unidadId, null, {
        accion: 'restaurar_apartado',
        seccion: x.seccion,
        filas,
        cuerpo: { esperaPlantillaVersion: plantillaVersion },
      });
      setAviso(`«${x.titulo}» ha vuelto a este módulo, con lo que tuviera escrito. Los otros módulos no han cambiado.`);
      setVuelta((n) => n + 1);
      if (onCambiado) await onCambiado('restaurar', r || {});
    } catch (e) {
      setError(e);
    } finally {
      setEnviando(null);
    }
  };

  return (
    <>
    <section className="tarjeta estructura">
      <header className="tarjeta-cab">
        <h2>Apartados retirados de este módulo</h2>
        <span className="suave">{lista.length}</span>
      </header>
      <p className="suave">
        <strong>No se han borrado.</strong> Solo han dejado de salir en este módulo; los demás siguen
        igual. Al restaurarlos vuelven con su texto.
      </p>
      {lista.length ? (
        <ul className="lista-retirados" aria-label="Apartados retirados de este módulo">
          {lista.map((x) => (
            <li key={x.seccion}>
              <span className="retirado-nombre">{x.titulo}</span>
              <code>{x.seccion}</code>
              {x.conHijos ? <span className="suave">con {cuantos(x.conHijos)} dentro</span> : null}
              <button
                className="mini"
                type="button"
                onClick={() => restaurar(x)}
                disabled={!!enviando}
                aria-label={`Restaurar «${x.titulo}» en este módulo`}
              >
                {enviando === x.seccion ? 'Restaurando…' : 'Restaurar'}
              </button>
              {/* Solo los apartados PROPIOS del módulo se borran desde aquí. Uno común retirado existe
                  en la plantilla de todos los módulos, y se borra por la lista de la plantilla. */}
              {x.propio ? (
                <BorrarApartadoPropio
                  documentoId={documentoId}
                  unidadId={unidadId}
                  retirado={x}
                  ocupado={!!enviando}
                  onBorrado={borrado}
                />
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
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
    {volver}
    </>
  );
}
