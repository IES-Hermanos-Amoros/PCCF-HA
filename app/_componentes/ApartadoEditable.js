// Un apartado que se puede escribir: los editores de sus campos, el
// autoguardado y qué pasa cuando dos personas escriben lo mismo a la vez.
//
// QUÉ SE EDITA Y QUÉ NO
//
// Un apartado es `{ campoId: valor }` y el valor depende del tipo de campo
// (docs/plan.md §3). El E3 trae el editor de **bloques de texto**, que son 52 de
// los 57 campos de la PD real; lo demás —las ponderaciones de RA, la ficha del
// módulo, la tabla de RA y CE, las fichas de situación de aprendizaje— se sigue
// viendo en lectura, con el mismo `Valores.js` de siempre y un aviso de que su
// editor no está. Esto es deliberado: un apartado medio editable se entiende, y
// un campo que desaparece de la pantalla porque nadie le ha escrito editor
// manda a alguien a buscar en el Word un texto que está guardado.
//
// POR QUÉ EL PATCH NO MANDA EL APARTADO ENTERO
//
// La ruta funde `valores` con lo guardado campo a campo, y de momento solo
// acepta los campos de texto: un `tabla_clave_valor` en el cuerpo se contesta
// con un 400 que dice que ese tipo todavía no se guarda por ahí. Así que el
// PATCH lleva **solo los campos de texto que se han tocado**, y los demás se
// quedan en la base de datos tal como estaban. Mandar el apartado entero sería
// pedir un 400 por la tabla importada que vive al lado del texto.
//
// EL AUTOGUARDADO
//
// Un `PATCH .../apartado` por apartado, de uno a dos segundos después de la
// última tecla, con el `esperaUpdatedAt` que vino en la lectura. Después de
// guardar se guarda el `updatedAt` nuevo para el siguiente (docs/api.md, «Por
// qué `esperaUpdatedAt`»).
//
// Nunca hay dos PATCH del mismo apartado en vuelo. Si mientras se guarda llegan
// más teclas, se encadena otro guardado al terminar; si se lanzaran los dos, el
// segundo saldría con una versión que el primero acaba de dejar obsoleta y se
// provocaría un 409 contra uno mismo.
//
// Y SE VE EL ESTADO
//
// Escribiendo · guardando · guardado · error. Alguien que escribe su
// programación tiene que poder cerrar el portátil sabiendo si se ha guardado,
// así que además:
//
//   · lo que queda sin guardar se manda al salir del apartado (el árbol cambia
//     de apartado sin recargar la página, así que el temporizador se perdería);
//   · y si queda algo pendiente al cerrar la pestaña, el navegador pregunta.
//
// EL 409, QUE ES EL CRITERIO DE ACEPTACIÓN
//
// «Dos pestañas sobre el mismo apartado no se pisan en silencio.» Cuando el
// servidor responde 409 no se ha escrito nada, y lo que no puede pasar es perder
// lo que la persona acaba de escribir. Así que:
//
//   1. el autoguardado se detiene: insistir con la misma versión da otro 409, y
//      reintentar con la nueva sería exactamente pisar en silencio;
//   2. se vuelve a leer el apartado y se enseñan **las dos versiones** —la que
//      hay guardada y la de quien está escribiendo—, con lo suyo intacto en los
//      campos de abajo, que siguen siendo editables;
//   3. y decide esa persona: conservar lo suyo y guardarlo encima de la versión
//      nueva, o quedarse con la de la otra persona. Si se queda con la otra, lo
//      descartado no se borra: queda a mano para copiarlo, porque «vuelve a
//      escribirlo» no es una salida.
//
// El panel no es un diálogo modal a propósito: lo que hay que comparar está
// justo debajo, y un modal que tapa el texto propio obliga a cerrarlo para
// poder copiarlo.
//
// EL 400
//
// Si el servidor rechaza lo que se manda, no se ha guardado nada y hay que
// decirlo: lo que no se puede hacer es dejar la pantalla diciendo «guardado».
// Tampoco se reintenta solo, porque volvería a fallar igual; se ofrece el botón
// y se enseña el mensaje del servidor, que es quien sabe qué estaba mal.

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Arbol from '../../core/arbol';
import EditorBloques from './Editor';
import Valores, { Valor, vacio } from './Valores';
import { aJSON, esListaDeBloques, motivoAlGuardar, plano } from './bloques-cliente';
import { pedir } from './api';

// De uno a dos segundos desde la última tecla (docs/interfaz-web.md §3.5). Un
// segundo y medio: con menos se manda un PATCH por palabra, y con más la
// sensación es que no se está guardando.
const RETARDO = 1500;

// Cuánto tiempo sigue diciendo «guardado hace un momento» antes de pasar a la
// hora. Un «hace un momento» que lleva veinte minutos ahí es una mentira.
const UN_MOMENTO = 60 * 1000;

const hora = (t) => new Date(t).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

// ---------------------------------------------------------------- el distintivo de estado

function Estado({ estado, guardadoEn, error, onReintentar }) {
  const [ahora, setAhora] = useState(() => Date.now());

  // El reloj avanza solo mientras hay un «hace un momento» que caducar: un
  // temporizador eterno en una pantalla de escribir no hace falta.
  useEffect(() => {
    if (estado !== 'guardado' || !guardadoEn) return undefined;
    const t = setInterval(() => setAhora(Date.now()), 15000);
    return () => clearInterval(t);
  }, [estado, guardadoEn]);

  let texto = null;
  let clase = 'chip';
  if (estado === 'escribiendo') { texto = 'sin guardar'; clase = 'chip chip-incompleto'; }
  else if (estado === 'guardando') { texto = 'guardando…'; clase = 'chip chip-guardando'; }
  else if (estado === 'guardado') {
    const reciente = guardadoEn && (ahora - guardadoEn) < UN_MOMENTO;
    texto = reciente ? 'guardado hace un momento' : `guardado a las ${hora(guardadoEn)}`;
    clase = 'chip chip-guardado';
  } else if (estado === 'conflicto') { texto = 'sin guardar: alguien más lo ha cambiado'; clase = 'chip chip-error'; }
  else if (estado === 'error') { texto = 'no se ha guardado'; clase = 'chip chip-error'; }

  return (
    <div className="estado-apartado">
      {/* La región existe siempre y está vacía cuando no hay nada que decir:
          un `aria-live` que aparece ya con su texto dentro no se anuncia. */}
      <span className="sr" role="status" aria-live="polite">
        {texto || ''}
      </span>
      {texto ? <span className={clase} aria-hidden="true">{texto}</span> : null}
      {estado === 'error' ? (
        <>
          <span className="suave">{error ? error.message : ''}</span>
          <button type="button" className="mini" onClick={onReintentar}>Reintentar</button>
        </>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- el panel del 409

function Conflicto({ campos, mios, servidor, onConservar, onDescartar }) {
  const panel = useRef(null);
  // El foco va al panel, no a un botón: lo primero es leer qué ha pasado, y un
  // foco directo en «guardar lo mío encima» invita a pulsar sin haber mirado.
  useEffect(() => { if (panel.current) panel.current.focus(); }, []);

  return (
    <section
      className="tarjeta conflicto"
      role="alert"
      tabIndex={-1}
      ref={panel}
      aria-labelledby="conflicto-titulo"
    >
      <header className="tarjeta-cab">
        <h2 id="conflicto-titulo" className="rojo">Alguien ha cambiado este apartado desde que lo abriste</h2>
      </header>
      <p>
        <strong>No se ha guardado nada</strong> y no se ha perdido nada de lo tuyo: sigue abajo, en
        los campos, tal como lo has escrito. Lo que hay que decidir es con qué versión se queda el
        documento.
      </p>
      <div className="conflicto-dos">
        <div className="conflicto-caja">
          <h3>Lo que hay guardado ahora</h3>
          <Valores
            campos={campos}
            valores={servidor ? servidor.valores : {}}
            compartidos={servidor ? servidor.compartidos : {}}
            repetidor={servidor ? servidor.repetidor : false}
            titulo={servidor ? servidor.titulo : ''}
          />
        </div>
        <div className="conflicto-caja">
          <h3>Lo que has escrito tú</h3>
          <Valores
            campos={campos}
            valores={mios}
            compartidos={servidor ? servidor.compartidos : {}}
            repetidor={servidor ? servidor.repetidor : false}
            titulo={servidor ? servidor.titulo : ''}
          />
        </div>
      </div>
      <div className="compartido-acciones">
        <button type="button" className="btn-primario" onClick={onConservar}>
          Conservar lo mío y guardarlo encima
        </button>
        <button type="button" className="btn-ghost" onClick={onDescartar}>
          Quedarme con lo que hay guardado
        </button>
      </div>
      <p className="ayuda">
        Guardar lo tuyo encima sustituye la versión de la otra persona; quedarte con la suya
        descarta la tuya, pero no la borra: se queda a mano para copiarla.
      </p>
    </section>
  );
}

// Lo descartado, en texto plano y copiable. «Vuelve a escribirlo» no es una
// salida, así que lo que se deja de guardar se puede seguir leyendo hasta que
// se cambie de apartado.
function Descartado({ campos, valores }) {
  const texto = (campos || [])
    .map((c) => {
      const v = valores ? valores[c.id] : null;
      if (!esListaDeBloques(v)) return null;
      const lineas = v.map((b) => {
        if (b.type === 'list') return (b.items || []).map((it) => '- ' + plano(it.text)).join('\n');
        if (typeof b.ref === 'string') return `[texto compartido ${b.ref}]`;
        return plano(b.text);
      });
      return `## ${c.etiqueta || c.id}\n\n${lineas.join('\n\n')}`;
    })
    .filter(Boolean)
    .join('\n\n');

  return (
    <details className="tarjeta fidelidad">
      <summary>Lo que escribiste y no se ha guardado · sigue aquí para copiarlo</summary>
      <p className="suave">
        Se descartó al quedarte con la versión de la otra persona. Está aquí hasta que cambies de
        apartado: cópialo si hace falta.
      </p>
      <pre>{texto || '(no había texto)'}</pre>
    </details>
  );
}

// ---------------------------------------------------------------- el apartado

export default function ApartadoEditable({ documentoId, apartado, onGuardado }) {
  const campos = Array.isArray(apartado.campos) ? apartado.campos : [];

  const [valores, setValores] = useState(() => apartado.valores || {});
  const [estado, setEstado] = useState('limpio');
  const [guardadoEn, setGuardadoEn] = useState(null);
  const [error, setError] = useState(null);
  const [conflicto, setConflicto] = useState(null);
  const [descartado, setDescartado] = useState(null);

  // La versión del apartado que tenía el cliente cuando lo leyó, y que viaja en
  // cada PATCH. Va en un ref y no en el estado porque la lee el guardado, que
  // puede estar en vuelo mientras React repinta.
  const version = useRef(apartado.updatedAt || null);
  // Lo último escrito, para que el guardado mande siempre eso y no lo que había
  // cuando venció el temporizador.
  const ultimo = useRef(apartado.valores || {});
  const sucio = useRef(false);
  // Qué campos se han tocado: es lo que viaja en el PATCH. Se acumulan en lugar
  // de limpiarse tras guardar porque mandarlos otra vez no cuesta nada y así no
  // hay ninguna ventana en la que un campo ya escrito se quede fuera del cuerpo.
  const tocados = useRef(new Set());
  const enVuelo = useRef(false);
  const reloj = useRef(null);
  const pausado = useRef(false);
  const vivo = useRef(true);

  const url = `/api/documentos/${encodeURIComponent(documentoId)}/apartado?`
    + new URLSearchParams(apartado.unidadId
      ? { seccion: apartado.seccion, unidad: apartado.unidadId }
      : { seccion: apartado.seccion });

  // ---------------------------------------------------------------- guardar

  const guardar = useCallback(async () => {
    if (pausado.current || !sucio.current) return;
    if (enVuelo.current) return;            // al terminar se vuelve a programar

    const enviado = {};
    for (const id of tocados.current) enviado[id] = ultimo.current[id] || [];
    // Sin ningún campo el servidor contesta 400 «no hay nada que guardar», con
    // razón: aquí todavía no hay nada que mandar.
    if (!Object.keys(enviado).length) { sucio.current = false; return; }

    const espera = version.current;
    enVuelo.current = true;
    sucio.current = false;
    if (vivo.current) { setEstado('guardando'); setError(null); }

    try {
      const r = await pedir(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ valores: enviado, esperaUpdatedAt: espera }),
      });

      // La versión nueva, para el guardado siguiente. Si la respuesta no la
      // trae, se vuelve a leer el apartado: sin ella el próximo PATCH saldría
      // con una versión caducada y daría un 409 contra uno mismo.
      let nueva = r && (r.updatedAt || (r.apartado && r.apartado.updatedAt)) || null;
      if (!nueva) {
        const fresco = await pedir(url);
        nueva = fresco.updatedAt || null;
      }
      version.current = nueva;
      enVuelo.current = false;

      if (vivo.current) {
        setGuardadoEn(Date.now());
        setEstado(sucio.current ? 'escribiendo' : 'guardado');
      }
      // El árbol se entera de que este apartado ya tiene algo escrito, con la
      // MISMA regla que usó el servidor al montarlo (core/arbol.js). Se mira el
      // apartado entero y no solo lo que viajó: los campos que no se tocan
      // también cuentan para el icono.
      if (onGuardado) onGuardado({ relleno: Arbol.algoEscrito(ultimo.current) });

      // Si han llegado más teclas mientras se guardaba, otro viaje.
      if (sucio.current) guardar();
    } catch (e) {
      enVuelo.current = false;
      if (!vivo.current) return;

      if (e.estado === 409) {
        // No se ha escrito nada. Se para el autoguardado y se enseñan las dos
        // versiones; lo escrito sigue en los campos.
        pausado.current = true;
        clearTimeout(reloj.current);
        setEstado('conflicto');
        setError(e);
        // Lo que se enseña como «lo tuyo» es el apartado entero tal como lo
        // tiene esta pestaña, no solo los campos que iban en el cuerpo: la
        // comparación es entre dos versiones del apartado. Y es una foto: lo que
        // se escriba a partir de ahora no cambia lo que el panel está
        // comparando, porque `ultimo` se sustituye, no se modifica.
        const mios = ultimo.current;
        setConflicto({ mios, servidor: null });
        try {
          const fresco = await pedir(url);
          if (vivo.current) setConflicto({ mios, servidor: fresco });
        } catch (e2) { /* el panel se enseña igual, sin la columna de lo guardado */ }
        return;
      }

      // Lo demás no se ha guardado tampoco, y no se reintenta solo: un 400 se
      // repetiría igual y un 403 ya no se va a arreglar reintentando.
      sucio.current = true;
      setError(e);
      setEstado('error');
    }
  }, [url, onGuardado]);

  const programar = useCallback(() => {
    clearTimeout(reloj.current);
    reloj.current = setTimeout(() => { guardar(); }, RETARDO);
  }, [guardar]);

  // El guardado se alcanza por un ref y no por la lista de dependencias del
  // efecto de abajo: si el efecto dependiera de `guardar`, cualquier repintado
  // que cambiara esa función ejecutaría su limpieza —es decir, mandaría el
  // apartado— en medio de una tecleada.
  const ultimoGuardar = useRef(guardar);
  ultimoGuardar.current = guardar;

  // Al salir del apartado —el árbol cambia de apartado sin recargar la página—
  // lo que quede pendiente se manda ya. Sin esto bastaría pinchar otro apartado
  // antes de que venciera el temporizador para perder lo último escrito.
  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
      clearTimeout(reloj.current);
      if (sucio.current && !pausado.current) ultimoGuardar.current();
    };
  }, []);

  // Y si queda algo pendiente al cerrar la pestaña, el navegador pregunta. Es lo
  // único que se puede hacer: un `fetch` lanzado en `beforeunload` no llega.
  useEffect(() => {
    const salir = (ev) => {
      if (!sucio.current && !conflicto) return;
      ev.preventDefault();
      ev.returnValue = '';
    };
    window.addEventListener('beforeunload', salir);
    return () => window.removeEventListener('beforeunload', salir);
  }, [conflicto]);

  // ---------------------------------------------------------------- escribir

  const cambiarCampo = (idCampo, bloques) => {
    const siguiente = { ...ultimo.current, [idCampo]: bloques };
    ultimo.current = siguiente;
    tocados.current.add(idCampo);
    sucio.current = true;
    setValores(siguiente);
    setDescartado(null);
    if (pausado.current) return;    // con un conflicto abierto no se guarda nada
    setEstado('escribiendo');
    programar();
  };

  // ---------------------------------------------------------------- el conflicto

  const conservarLoMio = async () => {
    // Guardar encima de la versión nueva: ahora es una decisión tomada a la
    // vista de las dos, no un pisotón.
    let nueva = conflicto.servidor && conflicto.servidor.updatedAt;
    // Si la relectura de antes falló, la versión que tenemos sigue siendo la
    // caducada y el PATCH daría otro 409: se pide aquí, que es donde se puede
    // explicar si tampoco se consigue.
    if (!nueva) {
      try {
        nueva = (await pedir(url)).updatedAt;
      } catch (e) {
        setError(e);
        setEstado('error');
        return;
      }
    }
    version.current = nueva || null;
    sucio.current = true;
    pausado.current = false;
    setConflicto(null);
    setError(null);
    setEstado('escribiendo');
    guardar();
  };

  const quedarmeConLoDeAhora = () => {
    const servidor = conflicto.servidor;
    setDescartado(conflicto.mios);
    if (servidor) {
      ultimo.current = servidor.valores || {};
      version.current = servidor.updatedAt || null;
      setValores(servidor.valores || {});
    }
    sucio.current = false;
    tocados.current = new Set();
    pausado.current = false;
    setConflicto(null);
    setError(null);
    setEstado('limpio');
  };

  const reintentar = () => {
    setError(null);
    sucio.current = true;
    guardar();
  };

  // ---------------------------------------------------------------- pintado

  // Una sección repetidora —las fichas de situación de aprendizaje— no es texto
  // sino un formulario con sus apartados, y su editor es el E4. Se ve entera en
  // lectura en lugar de pintarle un editor de párrafos que destrozaría la ficha.
  if (apartado.repetidor) {
    return (
      <>
        <div className="nota nota-lock">
          <div>
            Este apartado son fichas, no texto: su editor —crear, duplicar, mover y borrar
            situaciones de aprendizaje— llega con el evolutivo siguiente. Puedes editarlo, pero
            todavía no desde aquí.
          </div>
        </div>
        <Valores
          campos={campos}
          valores={valores}
          compartidos={apartado.compartidos}
          repetidor
          titulo={apartado.titulo}
        />
      </>
    );
  }

  const editables = campos.filter((c) => c.tipo === 'texto_largo' || esListaDeBloques(valores[c.id]));
  const otros = campos.filter((c) => !editables.includes(c));
  // Lo que el servidor diría si se le mandara esto, dicho antes de mandarlo. No
  // decide nada —la puerta es la del PATCH, y es la misma función de
  // core/bloques.js—: sirve para que un 400 no llegue sin explicación y para
  // saber en qué campo está el problema, que es lo que el mensaje del servidor
  // no puede señalar en la pantalla.
  const reparos = editables
    .map((c) => ({ campo: c, motivo: motivoAlGuardar(valores[c.id] || []) }))
    .filter((x) => x.motivo);

  return (
    <>
      <Estado estado={estado} guardadoEn={guardadoEn} error={error} onReintentar={reintentar} />

      {conflicto ? (
        <Conflicto
          campos={campos}
          mios={conflicto.mios}
          servidor={conflicto.servidor}
          onConservar={conservarLoMio}
          onDescartar={quedarmeConLoDeAhora}
        />
      ) : null}

      {descartado ? <Descartado campos={campos} valores={descartado} /> : null}

      {editables.map((campo) => (
        <section className="tarjeta" key={campo.id}>
          <header className="tarjeta-cab">
            <h2>{campo.etiqueta || campo.id}</h2>
            {/* Un campo que la plantilla tiene y este documento no había
                escrito: el PDF lo omite en silencio (aviso nº 3 de
                docs/interfaz-web.md), así que aquí se dice que está vacío. */}
            {vacio(valores[campo.id]) ? <span className="chip chip-vacio">vacío</span> : null}
          </header>
          {/* El reparo, junto al campo que lo tiene: el mensaje del servidor
              llega bien redactado pero no puede señalar dónde mirar. */}
          {reparos.filter((r) => r.campo.id === campo.id).map((r) => (
            <div className="nota nota-error" role="alert" key={r.campo.id}>
              <div>Esto no se va a poder guardar: {r.motivo}</div>
            </div>
          ))}
          <EditorBloques
            bloques={valores[campo.id] || []}
            compartidos={apartado.compartidos}
            onCambio={(bs) => cambiarCampo(campo.id, bs)}
          />
        </section>
      ))}

      {otros.map((campo) => (
        <section className="tarjeta" key={campo.id}>
          <header className="tarjeta-cab">
            <h2>{campo.etiqueta || campo.id}</h2>
            <span className="chip">todavía sin editor</span>
          </header>
          {vacio(valores[campo.id]) ? (
            <p className="vacio-apartado">Vacío. Este tipo de campo todavía no se puede escribir aquí.</p>
          ) : (
            <div className="bloques">
              <Valor
                valor={valores[campo.id]}
                etiqueta={campo.etiqueta}
                compartidos={apartado.compartidos}
              />
            </div>
          )}
        </section>
      ))}

      {/* «Ver lo que se guardaría»: el JSON que recibiría el generador de PDF.
          Es lo que permite comprobar de un vistazo que el modelo es el que
          espera el renderer; si aquí sale HTML, el ida y vuelta está roto. */}
      <details className="tarjeta fidelidad">
        <summary>Ver lo que se guardaría en la base de datos</summary>
        <p className="suave">
          Es el apartado tal como lo recibe <code>motor/render-generico.js</code> para hacer el PDF:
          bloques <code>{'{ type: \'p\', text }'}</code> y{' '}
          <code>{'{ type: \'list\', items }'}</code>, con el texto como cadena o como lista de
          tramos, y nada de HTML. En el <code>PATCH</code> viajan solo los campos de texto que has
          tocado; los demás se quedan en la base de datos como están.
        </p>
        {reparos.length ? (
          <p className="rojo">
            El servidor va a rechazar esto con un 400 y no se guardará nada:{' '}
            {reparos[0].motivo}
          </p>
        ) : null}
        <pre>{aJSON(valores)}</pre>
      </details>
    </>
  );
}
