// El control del estado del documento: `borrador → revisión → aprobado`.
//
//   GET  /api/documentos/[id]/estado   en qué estado está y qué puede hacer quien mira
//   POST /api/documentos/[id]/estado   lo cambia
//
// El E7 construyó las dos rutas y ninguna pantalla las usaba: las vistas de
// *Validaciones* y *Coordinación* decían «se puede aprobar» y ahí se acababa, de
// modo que la jefatura de estudios —cuyo único cometido en esta herramienta es
// aprobar— no tenía nada que pulsar. Esta tarjeta es lo que faltaba.
//
// POR QUÉ ESTÁ EN EL PANEL DE COMPROBACIONES
//
// Porque es donde está mirando quien decide. La pregunta «¿se puede aprobar?» la
// contesta `GET .../validaciones` con su `puedeAprobarse`, y esa respuesta se
// pinta justo debajo de esta tarjeta, agrupada por módulo y con enlace al
// apartado que falla. Poner el botón en otra pantalla obligaría a aprobar sin
// tener delante la lista de lo que falta, o a mirar la lista en un sitio y
// aprobar en otro; y cuando el servidor rechaza la aprobación, el desglose que
// manda habla exactamente de los avisos que hay debajo.
//
// En la barra de arriba no cabe —ya va llena— y además no debe: aprobar un
// documento no es un botón de barra de herramientas al lado del de tema, es una
// decisión que se toma con las cifras delante. A la pantalla se llega desde el
// menú «Ir a» (MenuIr.js) y desde el selector de vista.
//
// SOLO LAS TRANSICIONES QUE ESA PERSONA PUEDE HACER, CON EL `puede` DEL SERVIDOR
//
// `GET .../estado` manda las flechas que salen del estado actual, cada una con
// `accion`, `quien` la mueve y un `puede` **ya resuelto para quien pregunta**.
// Aquí no se vuelve a decidir nada: la lista es la misma para todos y lo que
// cambia es el `puede` (docs/api.md, «Quién pregunta»).
//
// Y una flecha que no se puede mover NO se pinta como botón apagado, que es la
// regla que ya sigue la barra superior: un botón que no hace nada no se
// distingue de uno estropeado. Se dice en una frase, con el `quien` que manda el
// servidor: «Mandarlo a revisión lo hace la jefatura del departamento». Así quien
// lo lee sabe a quién avisar, que es lo único que puede hacer con ese dato.
//
// EL RECHAZO POR ERRORES SE LEE, NO SE ADIVINA
//
// Aprobar con errores abiertos es un 409 `con_errores` (docs/api.md), y no es un
// «no se puede» a secas: trae `errores`, `porArreglar`, `delConvenio`, el
// desglose `porRegla` y `donde` está cada uno. Sobre la programación real del
// departamento son **45 errores**, y no son cuarenta y cinco cosas rotas:
//
//   11  módulos que no lleva nadie          → se arreglan en el reparto de unidades
//   12  ponderaciones descuadradas          → en el apartado de ponderaciones de cada módulo
//   22  el otro convenio de ponderación     → es una decisión del departamento, no una errata
//
// Se arreglan en tres sitios distintos y por personas distintas, así que se
// enseñan separados y con su salida a la vista. Agruparlos en «45 errores» deja a
// quien lo lee sin saber qué hacer, que es justo lo que el servidor se tomó el
// trabajo de evitar mandándolos ya separados.
//
// LA ESCRITURA VA CONDICIONADA, Y EL `updatedAt` SE LEE AQUÍ
//
// El POST acepta `esperaUpdatedAt`: el cliente dice con qué versión del documento
// está mirando la pantalla y, si ya no es esa, se responde 409 `conflicto` antes
// de contar nada. Para que ese dato sea el de ESTA pantalla y no el de cuando se
// abrió el documento —entre medias se habrá guardado algún apartado, y eso mueve
// el `updatedAt`—, la tarjeta pide el documento por su cuenta al montarse (351 B)
// y se queda con el `updatedAt` que devuelve cada cambio de estado.
//
// `/estado` no manda la cuenta de errores a propósito, porque la tiene
// `/validaciones` y la pantalla la pide igualmente. Así que aquí no se cuenta
// nada: la cuenta sale de la tarjeta de debajo y, cuando el rechazo la trae, del
// propio rechazo.

'use client';

import { useCallback, useEffect, useState } from 'react';
import { pedir } from './api';
import { NOMBRE_ESTADO_DOC } from './etiquetas';

// Cómo se llama cada flecha del circuito en un botón y qué pasa al pulsarla. La
// clave es `accion:destino` porque `reabrir` sale dos veces —a revisión y a
// borrador— y el verbo solo no las distingue.
//
// Una flecha que el servidor añada y no esté aquí no desaparece: se pinta con sus
// propias palabras (ver `flechaDe`). El efecto de olvidarse de este fichero es
// que el botón se lea peor, no que no esté.
const FLECHAS = {
  'enviar:revision': {
    etiqueta: 'Mandar a revisión',
    que: 'Dice que la programación ya se puede mirar desde fuera del departamento. Se sigue editando igual.',
    primario: true,
  },
  'devolver:borrador': {
    etiqueta: 'Devolver a borrador',
    que: 'Vuelve al departamento porque hay algo que arreglar, o porque no estaba lista.',
  },
  'aprobar:aprobado': {
    etiqueta: 'Aprobar el documento',
    que: 'El PDF deja de salir con la marca de BORRADOR. Los errores lo impiden.',
    primario: true,
  },
  'reabrir:revision': {
    etiqueta: 'Reabrir para revisión',
    que: 'Deshace la aprobación: el PDF vuelve a salir con la marca de BORRADOR.',
  },
  'reabrir:borrador': {
    etiqueta: 'Devolver al departamento',
    que: 'Deshace la aprobación y lo manda del todo al departamento.',
  },
};

const nombre = (estado) => NOMBRE_ESTADO_DOC[estado] || estado;

const flechaDe = (t) => FLECHAS[`${t.accion}:${t.a}`] || {
  etiqueta: `${t.accion}: pasar a «${nombre(t.a)}»`,
  que: null,
};

// El chip del estado, con las clases que ya usa el resto de la aplicación: el
// verde de lo validado para `aprobado`, el ámbar de lo incompleto para la
// revisión y el discontinuo de lo vacío para el borrador.
const CHIP = {
  borrador: 'chip chip-vacio',
  revision: 'chip chip-incompleto',
  aprobado: 'chip chip-validado',
};

// ---------------------------------------------------------------- el desglose del rechazo

// Dónde se arregla cada regla. Son los códigos estables de
// `app/_lib/rutas/validaciones.js`, y esto NO es la regla: es la redacción y el
// sitio al que hay que ir, que es lo que el servidor no puede saber porque no
// sabe qué pantallas hay.
const REGLAS = {
  sin_docente: {
    sitio: 'reparto',
    texto: (n) => `${n} ${n === 1 ? 'unidad que no lleva nadie' : 'unidades que no lleva nadie'}`,
  },
  criterios_de_ra: {
    sitio: 'ponderaciones',
    texto: (n) => `${n} ${n === 1 ? 'resultado de aprendizaje cuyos criterios no suman' : 'resultados de aprendizaje cuyos criterios no suman'} su peso`,
  },
  suma_de_ra: {
    sitio: 'ponderaciones',
    texto: (n) => `${n} ${n === 1 ? 'módulo cuyos RA no suman' : 'módulos cuyos RA no suman'} 100 %`,
  },
  cien_dentro_del_ra: {
    sitio: 'convenio',
    texto: (n) => `${n} ${n === 1 ? 'criterio que suma' : 'criterios que suman'} 100 % dentro de su RA`,
  },
};

// Los tres sitios donde se arregla esto, en el orden en que conviene atacarlos:
// primero lo que no lleva nadie —hasta que alguien no lo lleve, nadie puede
// arreglar lo demás de ese módulo—, luego los descuadres, y al final la decisión
// pendiente, que no la arregla una pantalla.
//
// `otras` recoge cualquier regla que el servidor añada y este fichero no conozca:
// así el desglose nunca suma menos que el total.
const SITIOS = [
  {
    id: 'reparto',
    titulo: 'Módulos y materias que no lleva nadie',
    severidad: 'error',
    comoSeArregla: 'Mientras no tengan profesorado asignado, nadie salvo la jefatura del departamento puede editarlas. Se arreglan repartiendo las unidades.',
  },
  {
    id: 'ponderaciones',
    titulo: 'Ponderaciones descuadradas',
    severidad: 'error',
    comoSeArregla: 'Son descuadres de verdad (14,94 % donde debería haber 15 %). Se arreglan en el apartado de ponderaciones de cada módulo: cada aviso de la lista de abajo lleva su enlace.',
  },
  {
    id: 'convenio',
    titulo: 'La decisión de convenio que sigue pendiente',
    severidad: 'info',
    comoSeArregla: 'No son erratas: son el otro convenio de ponderación —los criterios suman 100 % dentro de su RA en lugar de repartir su peso—, y cuál de los dos vale es una decisión del departamento que está sin tomar. Mientras no se decida, bloquean la aprobación: no se les baja la severidad desde una pantalla, porque eso sería decidir el convenio por la puerta de atrás.',
  },
  {
    id: 'otras',
    titulo: 'Otras comprobaciones',
    severidad: 'error',
    comoSeArregla: 'Están en la lista de abajo, cada una con enlace al apartado que falla.',
  },
];

// Agrupa `porRegla` por el sitio donde se arregla. Devuelve solo los sitios con
// algo, cada uno con su total y el detalle por regla.
function sitiosDe(porRegla) {
  const cuentas = new Map();
  for (const [regla, n] of Object.entries(porRegla || {})) {
    if (!n) continue;
    const conocida = REGLAS[regla];
    const id = conocida ? conocida.sitio : 'otras';
    if (!cuentas.has(id)) cuentas.set(id, { total: 0, partes: [] });
    const c = cuentas.get(id);
    c.total += n;
    c.partes.push(conocida ? conocida.texto(n) : `${n} de «${regla}»`);
  }
  return SITIOS
    .filter((s) => cuentas.has(s.id))
    .map((s) => ({ ...s, ...cuentas.get(s.id) }));
}

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

// ---------------------------------------------------------------- la tarjeta

export default function EstadoDocumento({ documentoId, onIr }) {
  const [estado, setEstado] = useState(null);
  const [error, setError] = useState(null);
  // El `updatedAt` con el que se está mirando esta pantalla, que es lo que viaja
  // como `esperaUpdatedAt`. Null mientras no llega: entonces no se manda, y la
  // escritura condicionada del servidor sigue siendo la decisión de verdad.
  const [version, setVersion] = useState(null);
  // Qué flecha se está moviendo, para no poder pulsar dos a la vez.
  const [moviendo, setMoviendo] = useState(null);
  // Lo último que ha pasado: el 200 (`hecho`) o el error, que puede ser el 409
  // con el desglose entero.
  const [hecho, setHecho] = useState(null);
  const [rechazo, setRechazo] = useState(null);

  const leer = useCallback(() => {
    let vivo = true;
    pedir(`/api/documentos/${encodeURIComponent(documentoId)}/estado`)
      .then((r) => { if (vivo) { setEstado(r); setError(null); } })
      .catch((e) => { if (vivo) { setEstado(null); setError(e); } });
    // Solo por el `updatedAt`: el documento sin plantilla son 351 B, y es lo que
    // hace que el aviso de conflicto hable de esta pantalla y no de cuando se
    // abrió el documento.
    pedir(`/api/documentos/${encodeURIComponent(documentoId)}`)
      .then((r) => { if (vivo) setVersion((r.documento && r.documento.updatedAt) || null); })
      .catch(() => { if (vivo) setVersion(null); });
    return () => { vivo = false; };
  }, [documentoId]);

  useEffect(() => leer(), [leer]);

  const mover = async (transicion) => {
    setMoviendo(`${transicion.accion}:${transicion.a}`);
    setHecho(null);
    setRechazo(null);
    setError(null);
    try {
      const cuerpo = { estado: transicion.a };
      if (version) cuerpo.esperaUpdatedAt = version;
      const r = await pedir(`/api/documentos/${encodeURIComponent(documentoId)}/estado`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
      });
      setHecho(r);
      if (r.documento && r.documento.updatedAt) setVersion(r.documento.updatedAt);
      // Las flechas que salen del estado nuevo son otras, y el POST no las
      // manda: se vuelve a leer `/estado`, que es una respuesta de medio kB.
      leer();
    } catch (e) {
      // El 409 `con_errores` no es un error de la pantalla: es la respuesta
      // normal de aprobar un documento que todavía tiene errores, y trae el
      // desglose. Se guarda aparte para enseñarlo entero.
      if (e.codigo === 'con_errores') setRechazo(e); else setError(e);
    } finally {
      setMoviendo(null);
    }
  };

  if (error && !estado) {
    return (
      <section className="tarjeta tarjeta-estado">
        <header className="tarjeta-cab"><h2>Estado del documento</h2></header>
        <div className="nota nota-lock" role="alert">
          <div>
            {error.message}
            {error.codigo === 'no_disponible' ? (
              <p className="suave">
                La ruta <code>GET /api/documentos/[id]/estado</code> es del E7. En cuanto responda,
                aquí salen el estado y las transiciones que puedes hacer.
              </p>
            ) : null}
          </div>
        </div>
      </section>
    );
  }

  if (!estado) {
    return (
      <section className="tarjeta tarjeta-estado">
        <header className="tarjeta-cab"><h2>Estado del documento</h2></header>
        <p className="suave">Mirando en qué estado está…</p>
      </section>
    );
  }

  const transiciones = estado.transiciones || [];
  const mias = transiciones.filter((t) => t.puede);
  const deOtros = transiciones.filter((t) => !t.puede);

  return (
    <section className="tarjeta tarjeta-estado">
      <header className="tarjeta-cab">
        <h2>Estado del documento</h2>
        <span className={CHIP[estado.estado] || 'chip'}>{nombre(estado.estado)}</span>
        {/* La marca de agua es el criterio de aceptación del evolutivo y lo que
            de verdad cambia al aprobar, así que se dice aquí y no en una ayuda:
            es la diferencia que se ve al exportar. */}
        <span className={estado.marcaDeAgua ? 'total' : 'total bien'}>
          {estado.marcaDeAgua ? 'el PDF sale con marca de BORRADOR' : 'el PDF sale sin marca de agua'}
        </span>
      </header>

      <p className="suave">
        El circuito del documento es <strong>borrador → revisión → aprobado</strong>, y cada tramo lo
        mueve quien responde de él: el departamento lo manda a revisión y la jefatura de estudios lo
        aprueba. Aprobar no cierra la edición: un documento aprobado se sigue pudiendo cambiar.
      </p>

      {/* Lo que acaba de pasar, donde se pulsó y en voz alta. */}
      {hecho ? (
        <div className="nota nota-enlace" role="status">
          <div>
            <strong>
              {hecho.accion === 'aprobar' ? 'Documento aprobado.' : null}
              {hecho.accion === 'enviar' ? 'Mandado a revisión.' : null}
              {hecho.accion === 'devolver' ? 'Devuelto a borrador.' : null}
              {hecho.accion === 'reabrir' ? `Reabierto: ahora está en «${nombre(hecho.estado)}».` : null}
              {['aprobar', 'enviar', 'devolver', 'reabrir'].includes(hecho.accion)
                ? null
                : `Ahora está en «${nombre(hecho.estado)}».`}
            </strong>
            <p className="suave" style={{ margin: '4px 0 0' }}>
              {hecho.marcaDeAgua
                ? 'El PDF y el Word que exportes ahora llevan la marca de BORRADOR.'
                : 'El PDF y el Word que exportes ahora salen sin la marca de BORRADOR.'}
            </p>
          </div>
        </div>
      ) : null}

      {/* Un error que no sea el rechazo por errores: sin permiso (403), la
          flecha que no existe (400) o el conflicto de versión (409). */}
      {error ? (
        <div className="nota nota-error" role="alert">
          <div>
            {error.message}
            {error.codigo === 'conflicto' ? (
              <p className="suave" style={{ margin: '4px 0 0' }}>
                No se ha cambiado nada.{' '}
                <button type="button" className="enlace" onClick={() => { setError(null); leer(); }}>
                  Volver a mirar cómo está
                </button>
                .
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {mias.length ? (
        <div className="estado-flechas">
          {mias.map((t) => {
            const f = flechaDe(t);
            const clave = `${t.accion}:${t.a}`;
            return (
              <div className="estado-flecha" key={clave}>
                <button
                  type="button"
                  className={f.primario ? 'btn-primario' : 'btn-ghost'}
                  disabled={!!moviendo}
                  onClick={() => mover(t)}
                >
                  {moviendo === clave ? 'Un momento…' : f.etiqueta}
                </button>
                {f.que ? <span className="ayuda">{f.que}</span> : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Las flechas que mueve otra persona NO se pintan como botones apagados:
          se dicen, con el `quien` del servidor, para saber a quién avisar. */}
      {deOtros.length ? (
        <ul className="estado-de-otros">
          {deOtros.map((t) => (
            <li key={`${t.accion}:${t.a}`}>
              {flechaDe(t).etiqueta} lo hace <strong>{t.quien}</strong>.
            </li>
          ))}
        </ul>
      ) : null}

      {!transiciones.length ? (
        <p className="suave">Desde «{nombre(estado.estado)}» no sale ninguna flecha del circuito.</p>
      ) : null}

      {rechazo ? <Rechazo rechazo={rechazo} documentoId={documentoId} onIr={onIr} /> : null}
    </section>
  );
}

// ---------------------------------------------------------------- el rechazo, desglosado

function Rechazo({ rechazo, documentoId, onIr }) {
  const sitios = sitiosDe(rechazo.porRegla);
  const donde = rechazo.donde || [];

  return (
    <div className="nota nota-error estado-rechazo" role="alert">
      <div>
        <strong>No se puede aprobar todavía.</strong>

        {/* El mensaje del servidor, tal cual: está redactado para enseñarse y es
            el mismo que vería quien llamara a la API a mano. */}
        <p style={{ margin: '6px 0 10px' }}>{rechazo.mensaje}</p>

        {/* Las tres cifras que hay que distinguir. «45 errores» a secas se lee
            como cuarenta y cinco cosas rotas, y veintidós de ellos no son una
            cosa rota: son una decisión sin tomar. */}
        <div className="metricas">
          <div className="metrica">
            <b className="rojo">{rechazo.errores || 0}</b>
            <span>{rechazo.errores === 1 ? 'error' : 'errores'}</span>
          </div>
          <div className="metrica">
            <b className="rojo">{rechazo.porArreglar || 0}</b>
            <span>hay que arreglarlos</span>
          </div>
          <div className="metrica">
            <b className="ambar">{rechazo.delConvenio || 0}</b>
            <span>decisión de convenio pendiente</span>
          </div>
          <div className="metrica">
            <b>{donde.length}</b>
            <span>{donde.length === 1 ? 'módulo afectado' : 'módulos afectados'}</span>
          </div>
        </div>

        {sitios.length ? (
          <>
            <p className="suave" style={{ margin: '0 0 6px' }}>
              {sitios.length === 1
                ? 'De dónde salen y dónde se arreglan:'
                : `Se arreglan en ${sitios.length === 2 ? 'dos' : sitios.length === 3 ? 'tres' : sitios.length} sitios distintos y por personas distintas:`}
            </p>
            <ul className="lista-avisos grande">
              {sitios.map((s) => (
                <li className={s.severidad} key={s.id}>
                  <span className="sev">{s.total}</span>
                  <div>
                    <b>{s.titulo}</b>
                    <span>{s.partes.join(' · ')}</span>
                    <span>{s.comoSeArregla}</span>
                    {/* La única salida que es una pantalla concreta: las otras
                        dos son un apartado por módulo —y están en la lista de
                        abajo, cada uno con su enlace— o una decisión que no
                        arregla ninguna pantalla. */}
                    {s.id === 'reparto' ? (
                      <a className="enlace" href={`/reparto/${encodeURIComponent(documentoId)}`}>
                        Repartir las unidades entre el profesorado
                      </a>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        {donde.length ? (
          <div className="tabla-scroll" style={{ marginTop: 12 }}>
            <table className="tabla">
              <caption className="sr">
                Los módulos con errores que impiden aprobar, con cuántos hay que arreglar y cuántos
                son la decisión de convenio pendiente. Se pulsa para abrir el apartado.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Módulo o materia</th>
                  <th scope="col">Errores</th>
                  <th scope="col">Hay que arreglar</th>
                  <th scope="col">Por decidir</th>
                </tr>
              </thead>
              <tbody>
                {donde.map((g) => (
                  <tr key={g.unidadId || g.titulo}>
                    <th scope="row">
                      {g.destino && g.destino.seccion && onIr ? (
                        <button
                          type="button"
                          className="enlace"
                          onClick={() => onIr(g.destino.seccion, g.destino.unidadId || null)}
                        >
                          {g.num ? `${g.num}. ` : ''}{g.titulo}
                        </button>
                      ) : (
                        <>{g.num ? `${g.num}. ` : ''}{g.titulo}</>
                      )}
                    </th>
                    <td>{g.errores}</td>
                    <td className={g.porArreglar ? 'rojo' : 'suave'}>{g.porArreglar || '—'}</td>
                    <td className={g.delConvenio ? 'ambar' : 'suave'}>{g.delConvenio || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {rechazo.avisos ? (
          <p className="ayuda" style={{ marginTop: 8 }}>
            Además hay {plural(rechazo.avisos, 'aviso', 'avisos')} que no impide
            {rechazo.avisos === 1 ? '' : 'n'} aprobar
            {rechazo.convenioCe ? <> · medido con el convenio <code>{rechazo.convenioCe}</code>, el mismo con el que se imprime el PDF</> : null}.
          </p>
        ) : null}
      </div>
    </div>
  );
}
