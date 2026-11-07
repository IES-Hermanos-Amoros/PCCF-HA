// El autoguardado de un apartado, el 409 y el 400: una sola vez, para todos los
// editores.
//
// POR QUÉ ESTÁ EN UN FICHERO APARTE
//
// Esto estaba dentro de ApartadoEditable.js, que era el único editor que había
// (el E3, los campos de texto). El E4 trae dos más —las ponderaciones de RA y CE
// y las fichas de situación de aprendizaje—, y los tres guardan EXACTAMENTE
// igual: un `PATCH .../apartado` con `esperaUpdatedAt`, nunca dos en vuelo, el
// estado a la vista y el panel de las dos versiones cuando salta un 409.
//
// Escribirlo otra vez en cada editor es la forma segura de que las ponderaciones
// pierdan lo último escrito al cambiar de apartado, o de que una ficha reintente
// un 409 y pise el trabajo de otra persona, sin que nadie lo note hasta que
// pase. Así que se ha sacado tal cual —misma lógica, mismos temporizadores,
// mismos textos— y los tres editores lo consumen. No es un camino nuevo: es el
// que ya estaba, movido.
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
// EL 409, QUE ES EL CRITERIO DE ACEPTACIÓN DEL E3
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
import Valores, { Valor } from './Valores';
import { esListaDeBloques, plano } from './bloques-cliente';
import { pedir } from './api';

// De uno a dos segundos desde la última tecla (docs/interfaz-web.md §3.5). Un
// segundo y medio: con menos se manda un PATCH por palabra, y con más la
// sensación es que no se está guardando.
const RETARDO = 1500;

// Cuánto tiempo sigue diciendo «guardado hace un momento» antes de pasar a la
// hora. Un «hace un momento» que lleva veinte minutos ahí es una mentira.
const UN_MOMENTO = 60 * 1000;

const hora = (t) => new Date(t).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

// La dirección del apartado, que es la misma para leerlo y para guardarlo.
export const urlApartado = (documentoId, { seccion, unidadId }) => `/api/documentos/${encodeURIComponent(documentoId)}/apartado?`
  + new URLSearchParams(unidadId ? { seccion, unidad: unidadId } : { seccion });

// ---------------------------------------------------------------- el distintivo de estado

export function Estado({ estado, guardadoEn, error, onReintentar }) {
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

export function Conflicto({ campos, mios, servidor, onConservar, onDescartar }) {
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
//
// Los campos que no son bloques de texto —una tabla de ponderaciones, las fichas
// de situación de aprendizaje— no se pueden poner en texto plano sin inventar un
// formato, así que se enseñan con la misma vista de lectura de siempre.
export function Descartado({ campos, valores, repetidor, titulo }) {
  const lista = campos || [];
  const deTexto = lista.filter((c) => esListaDeBloques(valores ? valores[c.id] : null));
  const otros = lista.filter((c) => !deTexto.includes(c) && valores && valores[c.id] !== undefined);

  const texto = deTexto
    .map((c) => {
      const v = valores[c.id];
      const lineas = v.map((b) => {
        if (b.type === 'list') return (b.items || []).map((it) => '- ' + plano(it.text)).join('\n');
        if (typeof b.ref === 'string') return `[texto compartido ${b.ref}]`;
        return plano(b.text);
      });
      return `## ${c.etiqueta || c.id}\n\n${lineas.join('\n\n')}`;
    })
    .join('\n\n');

  // Un repetidor guarda sus fichas en `{ items: [...] }`, que no es un campo de
  // la plantilla: se enseña entero con la vista de lectura.
  const hayItems = repetidor && valores && Array.isArray(valores.items) && valores.items.length;

  return (
    <details className="tarjeta fidelidad">
      <summary>Lo que escribiste y no se ha guardado · sigue aquí para copiarlo</summary>
      <p className="suave">
        Se descartó al quedarte con la versión de la otra persona. Está aquí hasta que cambies de
        apartado: cópialo si hace falta.
      </p>
      {texto || (!otros.length && !hayItems) ? <pre>{texto || '(no había texto)'}</pre> : null}
      {hayItems ? (
        <Valores campos={lista} valores={valores} repetidor titulo={titulo} />
      ) : null}
      {otros.map((c) => (
        <div className="bloques" key={c.id}>
          <Valor valor={valores[c.id]} etiqueta={c.etiqueta} />
        </div>
      ))}
    </details>
  );
}

// ---------------------------------------------------------------- el motor

// `url` es la del apartado; `valoresIniciales` y `versionInicial`, lo que vino en
// su lectura. Devuelve lo que el editor necesita para pintar y los tres botones
// de decisión del 409.
//
// Quien lo use tiene que montar el editor con un `key` por apartado: al cambiar
// de apartado el componente se desmonta, y ese desmontaje es lo que manda lo que
// quede pendiente antes de irse.
export function useAutoguardado({ url, valoresIniciales, versionInicial, onGuardado }) {
  const [valores, setValores] = useState(() => valoresIniciales || {});
  const [estado, setEstado] = useState('limpio');
  const [guardadoEn, setGuardadoEn] = useState(null);
  const [error, setError] = useState(null);
  const [conflicto, setConflicto] = useState(null);
  const [descartado, setDescartado] = useState(null);

  // La versión del apartado que tenía el cliente cuando lo leyó, y que viaja en
  // cada PATCH. Va en un ref y no en el estado porque la lee el guardado, que
  // puede estar en vuelo mientras React repinta.
  const version = useRef(versionInicial || null);
  // Lo último escrito, para que el guardado mande siempre eso y no lo que había
  // cuando venció el temporizador.
  const ultimo = useRef(valoresIniciales || {});
  const sucio = useRef(false);
  // Qué campos se han tocado: es lo que viaja en el PATCH. Se acumulan en lugar
  // de limpiarse tras guardar porque mandarlos otra vez no cuesta nada y así no
  // hay ninguna ventana en la que un campo ya escrito se quede fuera del cuerpo.
  const tocados = useRef(new Set());
  const enVuelo = useRef(false);
  const reloj = useRef(null);
  const pausado = useRef(false);
  const vivo = useRef(true);

  // ---------------------------------------------------------------- guardar

  const guardar = useCallback(async () => {
    if (pausado.current || !sucio.current) return;
    if (enVuelo.current) return;            // al terminar se vuelve a programar

    const enviado = {};
    for (const id of tocados.current) {
      const v = ultimo.current[id];
      // Un campo de texto vaciado se manda como `[]`, que es lo explícito
      // (app/_lib/rutas/apartado.js). Un valor que exista se manda tal cual.
      enviado[id] = v === undefined ? [] : v;
    }
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
      let nueva = (r && (r.updatedAt || (r.apartado && r.apartado.updatedAt))) || null;
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

  // `idCampo` es el id del campo de la plantilla; en un repetidor es `items`,
  // que es como se guarda la lista de fichas (docs/api.md y core/arbol.js).
  const cambiar = useCallback((idCampo, valor) => {
    const siguiente = { ...ultimo.current, [idCampo]: valor };
    ultimo.current = siguiente;
    tocados.current.add(idCampo);
    sucio.current = true;
    setValores(siguiente);
    setDescartado(null);
    if (pausado.current) return;    // con un conflicto abierto no se guarda nada
    setEstado('escribiendo');
    programar();
  }, [programar]);

  // ---------------------------------------------------------------- el conflicto

  const conservarLoMio = useCallback(async () => {
    // Guardar encima de la versión nueva: ahora es una decisión tomada a la
    // vista de las dos, no un pisotón.
    let nueva = conflicto && conflicto.servidor && conflicto.servidor.updatedAt;
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
  }, [conflicto, url, guardar]);

  const quedarmeConLoDeAhora = useCallback(() => {
    const servidor = conflicto && conflicto.servidor;
    setDescartado(conflicto ? conflicto.mios : null);
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
  }, [conflicto]);

  const reintentar = useCallback(() => {
    setError(null);
    sucio.current = true;
    guardar();
  }, [guardar]);

  return {
    valores,
    estado,
    guardadoEn,
    error,
    conflicto,
    descartado,
    cambiar,
    conservarLoMio,
    quedarmeConLoDeAhora,
    reintentar,
  };
}
