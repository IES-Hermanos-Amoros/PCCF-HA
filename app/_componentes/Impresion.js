// La pantalla donde se configura COMO SE IMPRIME un documento: hasta que nivel llega el indice y que
// apartados empiezan en pagina nueva.
//
//   GET   /api/documentos/[id]/impresion   lo configurado, lo de serie y las opciones con sus textos
//   PATCH /api/documentos/[id]/impresion   cambia uno o los dos, con el testigo `esperaUpdatedAt`
//
// LOS TEXTOS DE LAS OPCIONES LOS MANDA EL SERVIDOR. Cada nivel trae `titulo`, `que` y `ejemplo`, y
// aqui no se redacta, no se reordena y no se inventa ninguno. Si esta pantalla escribiera los suyos,
// el desplegable del indice y el de los saltos acabarian explicando el mismo numero de dos maneras.
//
// EL EJEMPLO ES EL NUMERO IMPRESO DE UN APARTADO DE ESE NIVEL (`5.1.3`). Quien lo ve reconoce de que
// se le habla sin que nadie le explique que es un «nivel». Si es `null` (el nivel 0), no se ensena nada.
//
// UN SELECT Y NO UNA LISTA DE RADIOS. Son siete opciones con titulo largo; la lista ocuparia media
// pantalla. El texto largo (`que` y `ejemplo`) va DEBAJO del desplegable y solo el del nivel elegido,
// que es donde se lee.
//
// SIN PERMISO, SE ENSENA Y NO SE OFRECE. Con `puedeConfigurar` falso se dice lo que hay configurado, sin
// controles: cuatro desplegables apagados no aportan nada a quien no puede tocarlos, y la decision no es
// suya. Quien si puede (el departamento y la jefatura de estudios) ve los dos desplegables.
//
// LOS SALTOS SIEMPRE VAN ACOMPANADOS DE LO QUE NO SE CONFIGURA (`loQueNoSeConfigura`): cada modulo
// empieza en pagina nueva igualmente. Sin esa frase la opcion «solo cada modulo» se lee como «ningun
// salto». Por eso la frase va pegada a los saltos y no al final de la tarjeta.
//
// EL AVISO DICE QUE CAMBIA EN EL DOCUMENTO, no «guardado». Quien configura esto quiere saber que
// efecto tiene, y el efecto es en las DOS salidas: el PDF y el Word. Del nivel, el aviso dice su
// `titulo` (el mismo que el servidor pone en el desplegable) y su numero.
//
// LA ESCRITURA VA CONDICIONADA. `esperaUpdatedAt` es el `updatedAt` de la ultima lectura o escritura de
// ESTA pantalla; si el documento ha cambiado entre medias, el servidor contesta 409 `conflicto` y no se
// toca nada. Se ofrece volver a leer, en lugar de reintentar solo: reintentar con el testigo nuevo
// pisaria, sin que nadie lo haya mirado, lo que ha cambiado otra persona.

'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import Ayuda from './Ayuda';
import { pedir } from './api';

// Un nivel dicho con las palabras del servidor y, si las hay, el numero: «Solo cada modulo» (nivel 1).
const comoSeDice = (lista, nivel) => {
  const op = (lista || []).find((o) => o.nivel === nivel);
  return op && op.titulo ? `«${op.titulo}» (nivel ${nivel})` : `el nivel ${nivel}`;
};

export default function Impresion({ documentoId }) {
  const idIndice = useId();
  const idSaltos = useId();
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  // Que control esta mandando ('indice' | 'saltos' | null). Apaga los dos: un segundo cambio antes de
  // que conteste el primero iria con un testigo que ya no vale.
  const [mandando, setMandando] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [fallo, setFallo] = useState(null);

  const url = `/api/documentos/${encodeURIComponent(documentoId)}/impresion`;

  const leer = useCallback(() => {
    let vivo = true;
    setCargando(true);
    setError(null);
    pedir(url)
      .then((r) => { if (vivo) setDatos(r); })
      .catch((e) => { if (vivo) { setDatos(null); setError(e); } })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [url]);

  useEffect(() => leer(), [leer]);

  const cambiar = async (cual, valor) => {
    setMandando(cual);
    setAviso(null);
    setFallo(null);
    try {
      const cuerpo = { [cual]: valor };
      if (datos.updatedAt) cuerpo.esperaUpdatedAt = datos.updatedAt;
      const r = await pedir(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
      });
      setDatos(r);
      // LA FRASE LA MANDA EL SERVIDOR (`efecto`), por lo mismo que los títulos: una frase montada
      // aquí a trozos con el título dentro sale mal («los apartados de "Solo cada módulo"»). El
      // título sirve para elegir en una lista y el `efecto` para contar lo que acaba de pasar.
      const elegido = (cual === 'indice' ? r.nivelesDelIndice : r.nivelesDeSalto || [])
        .find((o) => o.nivel === (cual === 'indice' ? r.indice : r.saltos));
      setAviso((elegido && elegido.efecto)
        || `Cambiado a ${comoSeDice(cual === 'indice' ? r.nivelesDelIndice : r.nivelesDeSalto, cual === 'indice' ? r.indice : r.saltos)}.`);
    } catch (e) {
      setFallo(e);
    } finally {
      setMandando(null);
    }
  };

  if (cargando) return <p className="suave">Leyendo cómo se imprime el documento…</p>;

  if (error || !datos) {
    return (
      <section className="tarjeta">
        <header className="tarjeta-cab"><h2>Cómo se imprime</h2></header>
        <div className="nota nota-error" role="alert">
          <div>
            {error ? error.message : 'El servidor no ha mandado la configuración de impresión.'}
          </div>
        </div>
      </section>
    );
  }

  const editable = !!datos.puedeConfigurar;

  // Los dos ajustes se pintan igual: el rótulo, el desplegable, lo de serie si se ha cambiado y,
  // debajo, el `que` y el `ejemplo` del nivel elegido.
  const ajuste = ({ clave, id, rotulo, valor, porOmision, opciones }) => {
    const elegido = opciones.find((o) => o.nivel === valor) || null;
    return (
      <div style={{ margin: '0 0 14px' }}>
        {editable ? (
          <label htmlFor={id}><strong>{rotulo}</strong></label>
        ) : (
          <strong>{rotulo}</strong>
        )}{' '}
        {editable ? (
          <select
            id={id}
            value={valor}
            disabled={!!mandando}
            aria-describedby={`${id}-detalle`}
            onChange={(ev) => cambiar(clave, Number(ev.target.value))}
          >
            {opciones.map((o) => (
              <option key={o.nivel} value={o.nivel}>{o.titulo}</option>
            ))}
          </select>
        ) : (
          <span>{elegido ? elegido.titulo : `nivel ${valor}`}</span>
        )}
        {mandando === clave ? <span className="suave"> Un momento…</span> : null}
        {valor !== porOmision ? (
          <span className="suave"> · lo de siempre es {comoSeDice(opciones, porOmision)}</span>
        ) : null}
        <div id={`${id}-detalle`}>
          {elegido && elegido.que ? <p className="suave" style={{ margin: '4px 0 0' }}>{elegido.que}</p> : null}
          {elegido && elegido.ejemplo ? (
            <p className="suave" style={{ margin: '2px 0 0' }}>
              Un apartado de este nivel se numera, por ejemplo, <code>{elegido.ejemplo}</code>.
            </p>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <section className="tarjeta">
      <header className="tarjeta-cab">
        <h2>Cómo se imprime</h2>
        <Ayuda sobre="la impresión del documento">
          <p>
            Lo que se elige aquí vale para <strong>el PDF y para el Word</strong>. El Word no tenía
            índice hasta ahora: sale con el mismo nivel que el PDF.
          </p>
        </Ayuda>
      </header>

      <p className="suave">
        Esta configuración afecta <strong>a las dos salidas, el PDF y el Word</strong>.
      </p>

      {!editable ? (
        <p className="suave">
          Esto es lo que hay configurado. Cambiarlo corresponde a quien lleva el departamento o a la
          jefatura de estudios.
        </p>
      ) : null}

      {ajuste({
        clave: 'indice',
        id: idIndice,
        rotulo: 'Índice hasta',
        valor: datos.indice,
        porOmision: datos.indicePorOmision,
        opciones: datos.nivelesDelIndice || [],
      })}

      {ajuste({
        clave: 'saltos',
        id: idSaltos,
        rotulo: 'Página nueva en',
        valor: datos.saltos,
        porOmision: datos.saltosPorOmision,
        opciones: datos.nivelesDeSalto || [],
      })}

      {/* Va siempre con los saltos, tenga o no permiso quien mira. */}
      {datos.loQueNoSeConfigura ? <p className="ayuda">{datos.loQueNoSeConfigura}</p> : null}

      <p className={aviso ? 'bien aviso-hecho' : 'sr aviso-hecho'} role="status">{aviso || ''}</p>

      {fallo ? (
        <div className="nota nota-error" role="alert">
          <div>
            {fallo.message}
            {fallo.codigo === 'conflicto' ? (
              <p className="suave" style={{ margin: '4px 0 0' }}>
                No se ha cambiado nada.{' '}
                <button type="button" className="enlace" onClick={() => { setFallo(null); leer(); }}>
                  Volver a mirar cómo está
                </button>
                .
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
