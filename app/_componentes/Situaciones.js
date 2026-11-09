// Las situaciones de aprendizaje: verlas, cambiarlas, crearlas, duplicarlas,
// moverlas y borrarlas. Aquí está el trabajo de verdad del departamento —en la
// PD de DAW hay 83 fichas, de cinco a once por módulo— y hasta ahora solo se
// veían en lectura.
//
// Referencia: el punto 2 de docs/mockup-v2/CAMBIOS.md y `panelSituaciones` /
// `fichaSituacion` de docs/mockup-v2/js/ui.js, que es la especificación
// aprobada por el departamento. El modelo y las operaciones son los de
// `core/sa.js`, los mismos que usa el motor del PDF.
//
// LAS CINCO COSAS QUE HACE ESTA PANTALLA
//
//  1. La TABLA RESUMEN SA × RA sale **calculada de las fichas**, con las
//     sesiones sumadas. En el Word hay que repasarla a mano cada vez que se
//     mueve una situación, y es la que se queda desfasada; aquí no se escribe.
//     La que venía del Word se conserva y se puede abrir al lado, para comparar:
//     es lo que enseña de un vistazo cuánto se había desfasado.
//  2. La LISTA dice de cada situación sus RA, sus sesiones, su evaluación y
//     cuántos criterios tiene, y avisa de la que le falte algo.
//  3. Se abre una y sale su FICHA con los apartados del documento: criterios de
//     evaluación, competencias para la empleabilidad, objetivos, los seis tipos
//     de actividad y los materiales.
//  4. Los RESULTADOS DE APRENDIZAJE SE ELIGEN de los del propio módulo y sus
//     criterios se marcan de una lista, en vez de copiarlos a mano: así la ficha
//     y la tabla de RA y CE del módulo no pueden contradecirse. Los RA salen del
//     apartado «Resultados de aprendizaje y criterios de evaluación» del mismo
//     módulo, que se pide aparte porque ninguna ruta manda el documento entero.
//  5. Debajo del formulario, LA FICHA COMO VA A SALIR IMPRESA, que se actualiza
//     al escribir. Son las mismas filas que recibe el generador de PDF, porque
//     las monta la misma función (`core/sa.js`, `filasDeFicha`).
//  6. Y mientras la ficha conserve la tabla que vino del Word, EL INFORME DE
//     RECONOCIMIENTO: cuántas de sus filas se entienden y cuáles no van a parar
//     a ningún campo, que son las que se perderán al cambiar algo. Lo compone
//     `informeDeFilas` de `core/sa.js`; aquí solo se pinta.
//
// QUÉ GUARDA Y CÓMO
//
// El autoguardado y el 409 son los de siempre (`autoguardado.js`): esta pantalla
// no guarda nada por su cuenta, solo le dice al apartado que su campo de fichas
// ha cambiado. Cada cambio manda la LISTA ENTERA de fichas del apartado, igual
// que el reparto de unidades manda la lista entera de docentes y por el mismo
// motivo: una operación incremental («mueve la 3 detrás de la 4») hecha por dos
// personas a la vez deja un orden que no quiso ninguna de las dos y que nadie ve
// raro al mirarlo.
//
// Dónde vive esa lista —el `items` de la sección repetidora o el campo `ficha`
// del apartado padre— lo resuelve `sa-cliente.js`, que explica por qué hay dos
// sitios.
//
// CUANDO LAS FICHAS ESTÁN EN EL OTRO APARTADO
//
// El apartado padre («Situaciones de aprendizaje») es donde el Word imprime la
// tabla resumen y donde la gente la busca, pero en diez de los once módulos las
// fichas están en el apartado de dentro («Situación de aprendizaje»). Así que el
// padre **enseña igual el resumen calculado y la lista**, leyendo el apartado de
// dentro, y cada fila lleva a su ficha. Lo que no hace es editarlas desde aquí:
// se guardan donde están, con su propia versión, y mover una ficha de apartado
// sin que nadie lo haya pedido es cómo un apartado acaba pareciendo vacío en la
// pantalla y saliendo lleno en el PDF.

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Sa from '../../core/sa';
import Ayuda from './Ayuda';
import { Tabla } from './Valores';
import { pedir } from './api';
import { urlApartado } from './autoguardado';
import {
  TIPO_RESUMEN, anadir, borrar, duplicar, evaluacionesPara, fichasDe, filasDe, mover,
  paraGuardar, raDeApartado, reemplazar, reparosDeFicha,
} from './sa-cliente';

const ETQ_PREVIA = 'ficha de la situación de aprendizaje';

const numero = (n) => (n === null || n === undefined || n === '' ? '' : String(n));

// ---------------------------------------------------------------- la tabla resumen

// Calculada, nunca guardada. `Sa.matriz` es la de core/, la misma que prueba
// `scripts/test-ficha-sa.js` contra el resumen que imprime el PDF.
function Resumen({ m, onAbrir }) {
  if (!m.filas.length) return null;
  const columnas = m.ra;

  return (
    <>
      <div className="tabla-marco">
        <table className="tabla tabla-matriz">
          <caption className="sr">
            Resumen de situaciones de aprendizaje por resultado de aprendizaje, con las sesiones
            sumadas. Calculado a partir de las fichas.
          </caption>
          <thead>
            <tr>
              <th scope="col" rowSpan={2}>Ev.</th>
              <th scope="col" rowSpan={2}>Situación de aprendizaje</th>
              <th scope="col" rowSpan={2} className="centro">Sesiones</th>
              {columnas.length ? (
                <th scope="colgroup" colSpan={columnas.length} className="centro">
                  Resultados de aprendizaje
                </th>
              ) : null}
            </tr>
            <tr>
              {columnas.map((n) => (
                <th scope="col" key={n} className="centro">{n}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {m.filas.map((f) => (
              <tr key={f.num}>
                <td className="centro">{f.evaluacion}</td>
                <th scope="row">
                  <button type="button" className="enlace" onClick={() => onAbrir(f.num)}>
                    {`SA ${f.num}: ${f.titulo || '(sin título)'}`}
                  </button>
                </th>
                <td className="centro">{numero(f.sesiones)}</td>
                {f.marca.map((x, i) => (
                  <td className="centro" key={columnas[i]}>{x ? 'X' : ''}</td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="fila-suma">
              <td colSpan={2} className="derecha suave">total de sesiones</td>
              <td className="centro"><b>{m.sesiones}</b></td>
              {columnas.map((n) => <td key={n} />)}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="suave">
        Esta tabla no se guarda: sale de las fichas. Si se mueve una situación o se le cambian los
        resultados de aprendizaje, cambia sola.
        {columnas.length ? '' : ' Ninguna ficha dice todavía qué resultados de aprendizaje trabaja, así que no hay columnas que cruzar.'}
      </p>
    </>
  );
}

// ---------------------------------------------------------------- la lista

function Linea({ ficha, primera, ultima, editable, onAbrir, onAccion, irA }) {
  const [confirmar, setConfirmar] = useState(false);
  const reparos = reparosDeFicha(ficha);
  const nce = Sa.lineas(ficha.ce).length;
  const quien = `SA ${ficha.num}`;

  return (
    <li className="sa-item">
      <div className="sa-datos">
        <button type="button" className="enlace sa-titulo" onClick={() => onAbrir(ficha.num)}>
          <b>{quien}</b>
          {' · ' + (ficha.titulo || '(sin título)')}
        </button>
        <span className="suave">
          {(ficha.ra || []).length
            ? 'RA ' + ficha.ra.join(', ')
            : <span className="rojo">sin RA</span>}
          {' · '}
          {ficha.sesiones === null || ficha.sesiones === undefined
            ? <span className="ambar">sin sesiones</span>
            : ficha.sesiones + ' sesiones'}
          {' · ' + (String(ficha.evaluacion || '').trim() || '¿sin evaluación?') + ' evaluación'}
          {' · ' + nce + (nce === 1 ? ' criterio' : ' criterios')}
        </span>
      </div>

      <div className="sa-acciones">
        {/* Los botones llevan su símbolo a la vista y su nombre en el
            `aria-label`: un «⧉» sin nombre no se puede leer en voz alta. */}
        <button type="button" className="mini" onClick={() => onAbrir(ficha.num)}>
          {editable ? 'Abrir' : 'Ver ficha'}
          <span className="sr">{' ' + quien}</span>
        </button>
        {irA ? (
          <button type="button" className="mini" onClick={irA}>
            Abrir donde se edita
            <span className="sr">{' ' + quien}</span>
          </button>
        ) : null}
        {editable && !confirmar ? (
          <>
            <button
              type="button"
              className="mini"
              title={'Duplicar ' + quien}
              aria-label={'Duplicar ' + quien}
              onClick={() => onAccion('duplicar', ficha.num)}
            >⧉</button>
            <button
              type="button"
              className="mini"
              title={'Subir ' + quien}
              aria-label={'Subir ' + quien}
              disabled={primera}
              onClick={() => onAccion('subir', ficha.num)}
            >↑</button>
            <button
              type="button"
              className="mini"
              title={'Bajar ' + quien}
              aria-label={'Bajar ' + quien}
              disabled={ultima}
              onClick={() => onAccion('bajar', ficha.num)}
            >↓</button>
            <button
              type="button"
              className="mini"
              title={'Borrar ' + quien}
              aria-label={'Borrar ' + quien}
              onClick={() => setConfirmar(true)}
            >×</button>
          </>
        ) : null}
        {/* Borrar una ficha es tirar el trabajo de un trimestre y no hay
            deshacer, así que se pregunta aquí mismo. Un diálogo modal taparía la
            ficha que hay que mirar para decidir. */}
        {editable && confirmar ? (
          <>
            <span className="suave">{'¿Borrar ' + quien + '?'}</span>
            <button
              type="button"
              className="mini rojo"
              onClick={() => { setConfirmar(false); onAccion('borrar', ficha.num); }}
            >
              Sí, borrar
              <span className="sr">{' ' + quien}</span>
            </button>
            <button type="button" className="mini" onClick={() => setConfirmar(false)}>No</button>
          </>
        ) : null}
      </div>

      {reparos.length ? (
        <ul className="avisos-en-linea">
          {reparos.map((r) => <li className={r.severidad} key={r.texto}>{r.texto}</li>)}
        </ul>
      ) : null}
    </li>
  );
}

// ---------------------------------------------------------------- campos de la ficha

// Un campo de varias líneas. El modelo guarda una lista —una línea por
// elemento—, y el `<textarea>` guarda texto, así que mientras el campo está
// enfocado lo teclado manda: si se repintara desde el modelo, la línea vacía que
// acabas de abrir con Enter desaparecería debajo del cursor (`Sa.lineas` filtra
// las vacías). Al salir del campo vuelve a mandar el modelo. Es el mismo
// cuidado que con los pesos de las ponderaciones.
function CampoLineas({ campo, valor, editable, onCambio }) {
  const [borrador, setBorrador] = useState(null);
  const texto = Sa.deLineas(valor);
  const lineas = Sa.lineas(valor).length;

  if (!editable) {
    return (
      <div className="sa-campo">
        <span>{campo.etiqueta}</span>
        <p className="bloque">{texto || <span className="vacio-apartado">vacío</span>}</p>
      </div>
    );
  }

  return (
    <label className="sa-campo">
      <span>{campo.etiqueta}</span>
      {campo.ayuda ? <i className="suave">{campo.ayuda}</i> : null}
      <textarea
        className="campo"
        rows={Math.max(2, Math.min(8, lineas + 1))}
        value={borrador === null ? texto : borrador}
        onChange={(ev) => { setBorrador(ev.target.value); onCambio(Sa.lineas(ev.target.value)); }}
        onBlur={() => setBorrador(null)}
      />
    </label>
  );
}

// Los campos del cuerpo con el texto de ayuda de la interfaz, como en el
// prototipo: la lógica no lleva textos de formulario.
const CAMPOS = Sa.CAMPOS.map((c) => (c.id === 'ce'
  ? { ...c, ayuda: 'Uno por línea. Se pueden marcar desde los criterios del módulo.' }
  : c));

// ---------------------------------------------------------------- la ficha

function Ficha({ ficha, raModulo, raEstado, editable, onCambio, onVolver }) {
  const titular = useRef(null);
  // Al abrir una ficha el foco va a su título: con el teclado, si no, habría que
  // recorrer otra vez la lista entera para llegar al formulario.
  useEffect(() => { if (titular.current) titular.current.focus(); }, [ficha.num]);

  const cambiar = (parche) => onCambio({ ...ficha, ...parche });

  const elegidos = raModulo.filter((r) => (ficha.ra || []).indexOf(r.num) >= 0);
  const puestos = Sa.lineas(ficha.ce);
  const evaluaciones = evaluacionesPara(ficha);

  // Marcar o desmarcar un RA del módulo. `raTexto` se rehace a la vez porque es
  // lo que imprime la ficha y lo que `core/sa.js` vuelve a leer para saber qué
  // RA trabaja: si se cambiaran por separado, la tabla resumen y la ficha
  // impresa dirían cosas distintas.
  const alternarRa = (num, marcado) => {
    const ra = marcado
      ? [...(ficha.ra || []), num].sort((a, b) => a - b)
      : (ficha.ra || []).filter((x) => x !== num);
    const raTexto = ra
      .map((n) => {
        const r = raModulo.find((x) => x.num === n);
        return 'RA' + n + '. ' + (r ? r.texto : '');
      })
      .join('\n');
    cambiar({ ra, raTexto });
  };

  // Marcar un criterio del módulo añade su línea tal como la escribe el
  // documento («RA2.a. El texto.»); desmarcarlo la quita.
  const alternarCe = (r, ce, marcado) => {
    const linea = Sa.lineaCe(r.num, ce);
    const lineas = puestos.filter((l) => l !== linea);
    if (marcado) lineas.push(linea);
    cambiar({ ce: lineas });
  };

  const cabecera = (
    <header className="tarjeta-cab">
      <button type="button" className="mini" onClick={onVolver}>← situaciones</button>
      <h2 tabIndex={-1} ref={titular}>
        {`SA ${ficha.num} · ${ficha.titulo || '(sin título)'}`}
      </h2>
    </header>
  );

  // QUÉ SE HA ENTENDIDO DE LA TABLA QUE VINO DEL WORD. Mientras la ficha la conserva
  // es ella la que se imprime; en cuanto algo cambia se suelta y lo impreso pasa a
  // montarse de los campos, así que las filas que no han ido a parar a ningún campo
  // son exactamente las que se van a perder. El lector las reconoce por el TEXTO de
  // su etiqueta (`POR_ETIQUETA` de core/sa.js), de modo que una redacción distinta se
  // pierde sin que la tabla parezca rara; lo que no puede es perderse en silencio.
  // El recuento se queda a la vista también cuando no se pierde nada: es lo que
  // permite comprobar de un vistazo que la ficha se sigue entendiendo.
  const informe = Array.isArray(ficha.filas) && ficha.filas.length
    ? Sa.informeDeFilas(ficha.filas)
    : null;
  const reconocimiento = informe ? (
    <div
      className={informe.aviso ? 'nota nota-error' : 'nota'}
      role={informe.aviso ? 'alert' : 'status'}
    >
      <div>
        {informe.aviso ? <><strong>{informe.aviso}</strong>{' '}</> : null}
        {informe.frase}
      </div>
    </div>
  ) : null;

  if (!editable) {
    return (
      <section className="tarjeta">
        {cabecera}
        {reconocimiento}
        <Tabla filas={filasDe(ficha)} etiqueta={ETQ_PREVIA} nota="en lectura" />
      </section>
    );
  }

  const actividades = CAMPOS.filter((c) => c.grupo === 'actividades');
  const sueltos = CAMPOS.filter((c) => c.grupo !== 'actividades' && c.id !== 'ce');
  const campoCe = CAMPOS.find((c) => c.id === 'ce');

  return (
    <>
      <section className="tarjeta">
        {cabecera}
        {reconocimiento}

        <div className="sa-cabecera">
          <label className="sa-campo">
            <span>Título</span>
            <input
              className="campo"
              type="text"
              value={ficha.titulo || ''}
              onChange={(ev) => cambiar({ titulo: ev.target.value })}
            />
          </label>
          <label className="sa-campo sa-corto">
            <span>Sesiones</span>
            <input
              className="campo"
              type="number"
              min="0"
              step="1"
              value={numero(ficha.sesiones)}
              onChange={(ev) => cambiar({ sesiones: ev.target.value === '' ? null : Number(ev.target.value) })}
            />
          </label>
          <label className="sa-campo sa-corto">
            <span>Evaluación</span>
            <select
              className="campo"
              value={String(ficha.evaluacion || '')}
              onChange={(ev) => cambiar({ evaluacion: ev.target.value })}
            >
              {/* La opción vacía solo está si la ficha no tiene evaluación: así
                  se ve que le falta, en lugar de que el desplegable elija la
                  primera por su cuenta y lo guarde sin que nadie lo haya dicho. */}
              {String(ficha.evaluacion || '').trim() ? null : <option value="">(sin evaluación)</option>}
              {evaluaciones.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
          </label>
        </div>

        {/* Los RA se eligen de los del propio módulo, no se escriben. */}
        {raModulo.length ? (
          <fieldset className="sa-ra">
            <legend>Resultados de aprendizaje que trabaja</legend>
            {raModulo.map((r) => (
              <label key={r.num}>
                <input
                  type="checkbox"
                  checked={(ficha.ra || []).indexOf(r.num) >= 0}
                  onChange={(ev) => alternarRa(r.num, ev.target.checked)}
                />
                <span><b>{'RA' + r.num}</b>{' ' + r.texto}</span>
              </label>
            ))}
          </fieldset>
        ) : (
          <label className="sa-campo">
            <span>Resultado(s) de aprendizaje</span>
            <i className="suave">
              {raEstado === 'cargando'
                ? 'Buscando los resultados de aprendizaje del módulo…'
                : 'Este módulo no tiene legible su tabla de RA y CE, así que se escriben a mano. Se reconocen escritos «RA2. …» o «2. …», uno por línea.'}
            </i>
            <textarea
              className="campo"
              rows={3}
              value={ficha.raTexto || ''}
              onChange={(ev) => cambiar({ raTexto: ev.target.value, ra: Sa.raDeTexto(ev.target.value) })}
            />
          </label>
        )}

        {/* Y sus criterios se marcan de una lista, en vez de copiarlos a mano. */}
        {elegidos.length ? (
          <details className="sa-ce" open={!puestos.length}>
            <summary>
              {'Criterios de evaluación del módulo (' + elegidos.reduce((n, r) => n + r.ce.length, 0) + ')'}
            </summary>
            {elegidos.map((r) => (
              <div className="sa-ce-grupo" key={r.num}>
                <span className="distintivo">{'RA' + r.num}</span>
                {r.ce.map((ce) => {
                  const linea = Sa.lineaCe(r.num, ce);
                  return (
                    <label key={ce.letra}>
                      <input
                        type="checkbox"
                        checked={puestos.indexOf(linea) >= 0}
                        onChange={(ev) => alternarCe(r, ce, ev.target.checked)}
                      />
                      <span><b>{ce.letra + ')'}</b>{' ' + ce.texto}</span>
                    </label>
                  );
                })}
              </div>
            ))}
          </details>
        ) : null}

        <CampoLineas
          key={ficha.num + '|ce'}
          campo={campoCe}
          valor={ficha.ce}
          editable
          onCambio={(v) => cambiar({ ce: v })}
        />

        {sueltos.map((c) => (
          <CampoLineas
            key={ficha.num + '|' + c.id}
            campo={c}
            valor={ficha[c.id]}
            editable
            onCambio={(v) => cambiar({ [c.id]: v })}
          />
        ))}

        <fieldset className="sa-actividades">
          <legend>{Sa.CABECERA_ACTIVIDADES}</legend>
          {actividades.map((c) => (
            <CampoLineas
              key={ficha.num + '|' + c.id}
              campo={c}
              valor={ficha[c.id]}
              editable
              onCambio={(v) => cambiar({ [c.id]: v })}
            />
          ))}
        </fieldset>
      </section>

      {/* La ficha como va a salir impresa, que se actualiza al escribir. Son las
          mismas filas que recibe el generador de PDF. */}
      <details className="tarjeta" id="previa-sa" open>
        <summary>La ficha como va a salir impresa</summary>
        <Tabla filas={filasDe(ficha)} etiqueta={ETQ_PREVIA} nota={null} />
        {/* Que lo de arriba es lo que se imprime es el dato de esta previa, y se
            queda; de dónde sale la maquetación, en la ayuda. Aviso de
            consecuencia aparte: si la tabla viene del Word, el primer cambio la
            remonta, y eso se dice ANTES de tocarla. */}
        <p className="ayuda">
          {ficha.filas
            ? 'Esta es la tabla tal como vino del Word. En cuanto cambies algo se remonta desde los campos de la ficha, y puede cambiar el reparto de columnas.'
            : 'Esto es lo que sale impreso.'}
        </p>
      </details>
    </>
  );
}

// ---------------------------------------------------------------- el panel

export default function Situaciones({
  documentoId, apartado, valores, editable, onCambiar, seccionRaCe, hermano, onIr,
}) {
  const [abierta, setAbierta] = useState(null);
  const [aviso, setAviso] = useState('');
  const [ajeno, setAjeno] = useState(null);       // el otro apartado, cuando este no tiene fichas
  const [raModulo, setRaModulo] = useState([]);
  const [raEstado, setRaEstado] = useState('cargando');
  const tituloLista = useRef(null);

  const propio = useMemo(
    () => fichasDe({ ...apartado, valores }),
    [apartado, valores],
  );

  // Las fichas del otro apartado de situaciones del módulo, para que el resumen
  // esté donde el Word lo imprime aunque las fichas estén dentro. Solo se pide
  // si aquí no hay ninguna: con fichas propias, lo de este apartado es lo suyo.
  useEffect(() => {
    if (propio.lista.length || !hermano || !hermano.seccion) { setAjeno(null); return undefined; }
    let vivo = true;
    pedir(urlApartado(documentoId, { seccion: hermano.seccion, unidadId: apartado.unidadId }))
      .then((r) => { if (vivo) setAjeno(r); })
      .catch(() => { if (vivo) setAjeno(null); });
    return () => { vivo = false; };
  }, [documentoId, hermano, apartado.unidadId, propio.lista.length]);

  // Los RA del módulo, del apartado de RA y CE. Ninguna ruta manda la plantilla,
  // así que se pide esa rama: son los que se eligen en la ficha.
  useEffect(() => {
    if (!seccionRaCe) { setRaEstado('sin'); return undefined; }
    let vivo = true;
    setRaEstado('cargando');
    pedir(urlApartado(documentoId, { seccion: seccionRaCe, unidadId: apartado.unidadId }))
      .then((r) => { if (!vivo) return; setRaModulo(raDeApartado(r)); setRaEstado('listo'); })
      .catch(() => { if (vivo) { setRaModulo([]); setRaEstado('sin'); } });
    return () => { vivo = false; };
  }, [documentoId, seccionRaCe, apartado.unidadId]);

  const deAqui = !!propio.lista.length || !ajeno;
  const fuente = deAqui ? propio : fichasDe(ajeno);
  const lista = fuente.lista;
  const puedoEditar = !!editable && deAqui;

  const numerosRa = useMemo(() => raModulo.map((r) => r.num), [raModulo]);
  const m = useMemo(() => Sa.matriz(lista, numerosRa), [lista, numerosRa]);

  // La tabla resumen que venía del Word, para comparar con la calculada: es lo
  // que enseña cuánto se había quedado desfasada.
  const campoResumen = (apartado.campos || []).find((c) => c.tipo === TIPO_RESUMEN);
  const resumenImportado = campoResumen && valores ? valores[campoResumen.id] : null;

  const guardar = (nueva, mensaje) => {
    onCambiar(propio.donde, paraGuardar(nueva, propio.donde));
    if (mensaje) setAviso(mensaje);
  };

  const accion = (que, num) => {
    if (!puedoEditar) return;
    if (que === 'duplicar') {
      const r = duplicar(lista, num);
      if (!r) return;
      guardar(r.lista, `Situación ${num} duplicada: ahora es la ${r.num}. Las demás se han renumerado.`);
      setAbierta(r.num);
      return;
    }
    if (que === 'borrar') {
      guardar(borrar(lista, num), `Situación ${num} borrada. Las demás se han renumerado.`);
      setAbierta(null);
      return;
    }
    if (que === 'subir' || que === 'bajar') {
      const r = mover(lista, num, que === 'subir' ? -1 : 1);
      if (!r) return;
      guardar(r.lista, `Situación ${num} movida: ahora es la ${r.num}.`);
    }
  };

  const nueva = () => {
    if (!puedoEditar) return;
    const r = anadir(lista);
    guardar(r.lista, `Situación ${r.num} creada. Sale en el resumen y en el PDF en cuanto tenga RA y sesiones.`);
    setAbierta(r.num);
  };

  const cambiarFicha = (f) => guardar(reemplazar(lista, f), '');

  const abierto = abierta === null ? null : lista.find((f) => f.num === abierta);

  // Al volver de una ficha, el foco vuelve a la lista: con el teclado, si no, se
  // queda al principio de la página.
  const volver = () => { setAbierta(null); setAviso(''); };
  useEffect(() => {
    if (abierta === null && tituloLista.current) tituloLista.current.focus();
  }, [abierta]);

  if (abierto) {
    return (
      <>
        <span className="sr" role="status" aria-live="polite">{aviso}</span>
        <Ficha
          ficha={abierto}
          raModulo={raModulo}
          raEstado={raEstado}
          editable={puedoEditar}
          onCambio={cambiarFicha}
          onVolver={volver}
        />
      </>
    );
  }

  return (
    <>
      <section className="tarjeta">
        <header className="tarjeta-cab">
          <h2 tabIndex={-1} ref={tituloLista}>Situaciones de aprendizaje</h2>
          {/* Cómo se monta e imprime una ficha: siempre igual, en todos los
              módulos. */}
          <Ayuda sobre="las situaciones de aprendizaje">
            <p>
              La previa de cada ficha se monta con <code>core/sa.js</code>, la misma función que usa
              el generador de PDF: <strong>lo que se ve en la previa es lo que sale impreso</strong>.
            </p>
            <p>
              Las fichas se numeran por su <strong>posición en la lista</strong>, que es la que usa
              el documento impreso: mover una ficha cambia su número.
            </p>
            <p>
              Las fichas se guardan en el apartado donde el Word las trae, que no siempre es este:
              cuando están en otro, aquí se ven y se cuentan, pero se cambian allí.
            </p>
          </Ayuda>
          <span className="chip">{lista.length + (lista.length === 1 ? ' situación' : ' situaciones')}</span>
          <span className="chip">{m.sesiones + ' sesiones'}</span>
          {m.sinSituacion.length ? (
            <span className="chip chip-error">{'RA sin situación: ' + m.sinSituacion.join(', ')}</span>
          ) : null}
          {puedoEditar ? (
            <button type="button" className="mini mini-add" onClick={nueva}>+ nueva situación</button>
          ) : null}
        </header>

        <span className="sr" role="status" aria-live="polite">{aviso}</span>
        {aviso ? <p className="suave">{aviso}</p> : null}

        {!deAqui && hermano ? (
          <div className="nota nota-lock">
            <div>
              Las {lista.length} fichas de este módulo están en el apartado{' '}
              <strong>{hermano.titulo}</strong>. Aquí se ven y se cuentan; para cambiarlas se abre
              ahí.
              {onIr ? (
                <div className="ayuda">
                  <button
                    type="button"
                    className="enlace"
                    onClick={() => onIr(hermano.seccion, apartado.unidadId)}
                  >
                    Ir a {hermano.titulo}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {lista.length ? (
          <>
            <Resumen m={m} onAbrir={setAbierta} />
            <ul className="lista-sa">
              {lista.map((f, i) => (
                <Linea
                  key={f.num}
                  ficha={f}
                  primera={i === 0}
                  ultima={i === lista.length - 1}
                  editable={puedoEditar}
                  onAbrir={setAbierta}
                  onAccion={accion}
                  irA={!deAqui && hermano && onIr
                    ? () => onIr(hermano.seccion, apartado.unidadId)
                    : null}
                />
              ))}
            </ul>
          </>
        ) : (
          <p className="vacio-apartado">
            Este módulo no tiene ninguna situación de aprendizaje.
            {puedoEditar ? ' Usa «+ nueva situación» para empezar.' : ''}
          </p>
        )}
      </section>

      {/* La del Word, al lado y cerrada: es la que hay que repasar a mano cada
          vez que se mueve una situación, y lo que se ve al abrirla es cuánto se
          había desfasado. */}
      {resumenImportado && resumenImportado.filas ? (
        <details className="tarjeta fidelidad">
          <summary>La tabla resumen que venía del Word · para comparar</summary>
          <p className="suave">
            El documento la traía escrita a mano. La de arriba se calcula de las fichas, así que si
            las dos no dicen lo mismo, la del Word se había quedado atrás. No se edita: cuando se
            exporte, el PDF imprimirá la calculada.
          </p>
          <Tabla filas={resumenImportado.filas} etiqueta="resumen importado" nota="no se edita" />
        </details>
      ) : null}
    </>
  );
}
