// El editor de las tablas que se crean en la aplicación: escribir en las celdas, añadir y
// quitar filas y columnas, combinar y separar celdas, poner la negrita celda a celda y poner o
// quitar la fila de cabecera.
//
// ES UNA CÁSCARA. Qué pasa al añadir una columna, qué celdas se conservan al quitar una fila, qué
// se hace con el texto de la celda que se absorbe al combinar, cómo se reparten las combinaciones
// al cambiar la forma, qué se puede y qué no según los topes: todo eso es core/tablas-edicion.js,
// que no sabe nada de pantallas y tiene sus pruebas (test/editor-tablas.js). Este componente pinta
// el valor que le llega, manda cada gesto como una operación, y apaga el botón de lo que no se
// puede con el motivo que da la misma función que usa el servidor (`motivoDeNo`).
//
// SOLO LAS CREADAS AQUÍ. Una tabla que vino del Word es el mismo tipo de campo, pero se queda en
// solo lectura (`Edicion.esEditable`): el PDF de lo importado tiene que salir idéntico, y reescribir
// una tabla celda a celda la deja de ser. Quien decide si este editor sale es ApartadoEditable.
//
// NUNCA `contenteditable`: cada celda es un `<textarea>` controlado, como los párrafos de
// Editor.js. El valor es el que llega por `valor`; el componente no lee el DOM para saber qué dice
// la tabla (docs/interfaz-web.md §2.3).
//
// EL GUARDADO NO ES DE AQUÍ. Cada cambio sale por `onCambio(valorNuevo)` y quien lo recibe es el
// autoguardado del apartado (autoguardado.js): el mismo PATCH con `esperaUpdatedAt` que guarda los
// párrafos y las fichas, con su 409 y su aviso de conflicto.
//
// LA NEGRITA ES EL SOMBREADO. No hay un color aparte: el PDF y el Word pintan una celda en negrita
// de azul claro si es de la primera fila entera en negrita (la cabecera) y de gris si no. La
// pantalla lo dice junto a los controles y en el botón, porque de otro modo nadie sabe de dónde
// sale el color.
//
// EL FOCO. Se mantiene en la tabla tras cada gesto, y no solo en el botón que se pulsó (que puede
// desaparecer o apagarse): tras añadir una fila va a su primera celda; tras quitar una, a la celda
// que ocupa su sitio; tras añadir o quitar una columna, a la celda de la primera fila que cae en
// esa columna; tras combinar o separar, a la celda; tras la negrita se queda en el botón. Lo que
// ha pasado se anuncia en una región `aria-live`.

'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import Edicion from '../../core/tablas-edicion';
import Estructurados from '../../core/estructurados';

const llave = (i, j) => `${i}:${j}`;

// Cómo se nombra una fila a quien lee la pantalla sin verla: «fila 3», y la primera de una tabla
// con cabecera lo dice, porque quitarla no es lo mismo que quitar la cabecera del interruptor.
const nombreDeFila = (i, cabecera) => (i === 0 && cabecera ? 'fila 1 (la cabecera)' : `fila ${i + 1}`);

// Cómo se llama cada fondo en la pantalla. El nombre que se guarda es el de core/estructurados.js;
// aquí solo se dice de qué color es, porque «etiqueta» no significa nada para quien lo lee.
const NOMBRE_FONDO = { cabecera: 'azul claro', etiqueta: 'gris', ninguno: 'ninguno' };

// La columna o columnas que ocupa una celda, para el nombre: «columna 2» o «columnas 2 a 3».
const nombreDeColumnas = (pos) => (pos.ancho > 1
  ? `columnas ${pos.columna + 1} a ${pos.columna + pos.ancho}` : `columna ${pos.columna + 1}`);

// Lo que cuesta de escribir en un título: el texto que se junta, recortado.
const recorte = (texto) => (texto.length > 40 ? `${texto.slice(0, 40)}…` : texto).replace(/\n/g, ' / ');

// Un botón de la tabla: se apaga solo cuando la operación no se puede, y el motivo va en el `title`
// y en el nombre accesible (un botón apagado no recibe el foco, pero un lector lo encuentra al
// recorrer la tabla). Está FUERA del componente a propósito: definido dentro, cada repintado sería
// un componente distinto, React lo desmontaría y el botón que acaba de recibir el foco lo perdería.
function Boton({
  valor, refBoton, nombre, op, args, children, etiqueta, ayuda, accion, pulsado, clase = 'mini',
}) {
  const motivo = Edicion.motivoDeNo(valor, op, args);
  const completa = ayuda ? `${etiqueta}. ${ayuda}` : etiqueta;
  return (
    <button
      type="button"
      className={clase}
      ref={nombre ? (n) => refBoton(nombre, n) : undefined}
      onClick={accion}
      disabled={!!motivo}
      aria-pressed={pulsado === undefined ? undefined : pulsado}
      aria-label={motivo ? `${etiqueta}. No disponible: ${motivo}` : completa}
      title={motivo || completa}
    >
      {children}
    </button>
  );
}

export default function EditorTabla({ campo, valor, onCambio }) {
  const claveValor = Edicion.esClaveValor(valor);
  const filas = Edicion.filasDe(valor);
  const columnas = Edicion.columnasDe(valor);
  const cabecera = Edicion.tieneCabecera(valor);
  const posiciones = claveValor ? null : Edicion.posiciones(valor);
  const enRejilla = (i, j) => (posiciones && posiciones[i] && posiciones[i][j]) || { columna: j, ancho: 1, alto: 1 };

  const [aviso, setAviso] = useState('');
  const celdas = useRef(new Map());
  const botones = useRef(new Map());
  const pendiente = useRef(null);
  // El ancho de la última tabla con filas que se vio: lo que hace falta para abrir una fila en
  // una tabla que se ha quedado sin ninguna. Si nunca se vio, el de nacimiento del campo.
  const ancho = useRef((campo.inicial && campo.inicial.columnas) || 1);
  if (columnas) ancho.current = columnas;

  useLayoutEffect(() => {
    const p = pendiente.current;
    if (!p) return;
    pendiente.current = null;
    const destino = (p.celda && celdas.current.get(p.celda)) || (p.boton && botones.current.get(p.boton));
    if (destino && typeof destino.focus === 'function') destino.focus();
  });

  const refCelda = (i, j, nodo) => {
    if (nodo) celdas.current.set(llave(i, j), nodo); else celdas.current.delete(llave(i, j));
  };
  const refBoton = (nombre, nodo) => {
    if (nodo) botones.current.set(nombre, nodo); else botones.current.delete(nombre);
  };

  // Una operación del módulo puro. Si no cambia nada (no se puede), no hace nada: el botón ya
  // estaba apagado y dice por qué. `foco` recibe el valor nuevo y dice dónde ponerlo.
  const hacer = (op, args, { dice, foco } = {}) => {
    const siguiente = Edicion.aplicar(valor, op, args, { columnas: ancho.current });
    if (siguiente === valor) return;
    onCambio(siguiente);
    if (dice) setAviso(typeof dice === 'function' ? dice(siguiente) : dice);
    if (foco) pendiente.current = foco(siguiente);
  };

  const motivoDe = (op, args) => Edicion.motivoDeNo(valor, op, args);

  // Lo que la puerta diría de este valor. Lo que sale de las operaciones siempre pasa; esto es por
  // si el valor que llega ya traía un defecto, que se diga delante de quien lo va a guardar.
  const reparo = Estructurados.motivoDeCampo(campo, valor);

  const textoNumero = (n, uno, varios) => (n === 1 ? `1 ${uno}` : `${n} ${varios}`);

  // ---------------------------------------------------------------- las operaciones, con su frase

  const anadirFila = (despuesDe) => {
    const nueva = despuesDe == null ? filas : despuesDe + 1;
    hacer('anadir-fila', { despuesDe }, {
      dice: `Fila ${nueva + 1} añadida. La tabla tiene ${filas + 1} filas.`,
      foco: () => ({ celda: llave(nueva, 0), boton: 'anadir-fila' }),
    });
  };
  const quitarFila = (i) => hacer('quitar-fila', { fila: i }, {
    dice: (s) => `Quitada la ${nombreDeFila(i, cabecera)}. Quedan ${textoNumero(Edicion.filasDe(s), 'fila', 'filas')}.`,
    foco: (s) => (Edicion.filasDe(s)
      ? { celda: llave(Math.min(i, Edicion.filasDe(s) - 1), 0), boton: 'anadir-fila' }
      : { boton: 'anadir-fila' }),
  });
  const anadirColumna = (despuesDe) => {
    const nueva = despuesDe == null ? columnas : despuesDe + 1;
    hacer('anadir-columna', { despuesDe }, {
      dice: `Columna ${nueva + 1} añadida. La tabla tiene ${columnas + 1} columnas.`,
      foco: (s) => {
        const e = Edicion.celdaEn(s, 0, nueva);
        return { celda: e ? llave(e.fila, e.columna) : null, boton: 'anadir-columna' };
      },
    });
  };
  const quitarColumna = (j) => hacer('quitar-columna', { columna: j }, {
    dice: (s) => `Columna ${j + 1} quitada. Quedan ${textoNumero(Edicion.columnasDe(s), 'columna', 'columnas')}`
      + (Edicion.filasDe(s) < filas ? ` y ${textoNumero(Edicion.filasDe(s), 'fila', 'filas')}: una fila se quedaba sin celdas propias y se ha quitado.` : '.'),
    foco: (s) => {
      const e = Edicion.celdaEn(s, 0, Math.min(j, Edicion.columnasDe(s) - 1));
      return { celda: e ? llave(e.fila, e.columna) : null, boton: 'anadir-columna' };
    },
  });
  const ponerCabecera = (puesta) => hacer('cabecera', { puesta }, {
    dice: puesta ? 'La primera fila es ahora la cabecera.' : 'La tabla ya no tiene fila de cabecera.',
  });
  const escribir = (i, j, texto) => hacer('texto', { fila: i, columna: j, valor: texto });

  const combinar = (i, j, hacia) => {
    const juntado = Edicion.textoQueSeJunta(valor, { fila: i, columna: j, hacia });
    hacer('combinar', { fila: i, columna: j, hacia }, {
      dice: `La celda de la fila ${i + 1}, ${nombreDeColumnas(enRejilla(i, j))} se ha combinado con la de ${hacia === 'derecha' ? 'su derecha' : 'debajo'}.`
        + (juntado ? ' Su texto se ha añadido al de esta celda, en otra línea.' : ''),
      foco: () => ({ celda: llave(i, j) }),
    });
  };
  const separar = (i, j) => hacer('separar', { fila: i, columna: j }, {
    dice: `La celda de la fila ${i + 1}, ${nombreDeColumnas(enRejilla(i, j))} se ha separado: cada casilla vuelve a ser una celda. El texto se queda en la primera.`,
    foco: () => ({ celda: llave(i, j) }),
  });
  // El fondo elegido a mano manda sobre la negrita, así que el botón de negrita no puede prometer
  // un sombreado que no va a salir.
  const ayudaNegrita = (celda, enNegrita, sombreado) => {
    if (celda.fondo !== undefined) {
      return enNegrita
        ? 'Puesta. El fondo de esta celda está elegido a mano, así que quitarla no le cambia el color.'
        : 'Pulsa para ponerla. El fondo de esta celda está elegido a mano, así que no le cambia el color.';
    }
    return enNegrita
      ? 'Puesta: sale sombreada. Pulsa para quitarla.'
      : `Pulsa para ponerla: la celda saldrá en negrita y sombreada de ${sombreado}.`;
  };

  const ponerFondo = (i, j, cual) => hacer('fondo', { fila: i, columna: j, cual }, {
    dice: cual === null
      ? `El fondo de la celda de la fila ${i + 1}, ${nombreDeColumnas(enRejilla(i, j))} vuelve a decidirlo la negrita.`
      : `La celda de la fila ${i + 1}, ${nombreDeColumnas(enRejilla(i, j))} tiene fondo ${NOMBRE_FONDO[cual]}.`,
    foco: () => ({ celda: llave(i, j) }),
  });

  const negrita = (i, j, puesta) => hacer('negrita', { fila: i, columna: j, puesta }, {
    dice: puesta
      ? `La celda de la fila ${i + 1}, ${nombreDeColumnas(enRejilla(i, j))} va en negrita: saldrá sombreada.`
      : `La celda de la fila ${i + 1}, ${nombreDeColumnas(enRejilla(i, j))} ya no va en negrita ni sombreada.`,
    foco: () => ({ boton: `neg:${llave(i, j)}` }),
  });

  // ---------------------------------------------------------------- piezas

  // La pantalla pinta el fondo que lleva la celda de verdad, el que decide core/, y no el que se
  // deduzca aquí: si no, una celda con el fondo elegido a mano se vería de un color en la pantalla
  // y saldría de otro en el PDF. La negrita es una clase aparte porque ya no implica fondo.
  const claseCelda = (i, j, celda) => {
    const fondo = Edicion.fondoEfectivo(valor, i, j);
    return [fondo === 'cabecera' ? 'celda-cab' : '', fondo === 'etiqueta' ? 'celda-neg' : '',
      celda.bold === true ? 'celda-negrita' : ''].filter(Boolean).join(' ');
  };

  const barra = (
    <div className="toolbar" role="group" aria-label="Filas, columnas y cabecera de la tabla">
      <Boton valor={valor} refBoton={refBoton}
        nombre="anadir-fila" op="anadir-fila" args={{}} clase="tb"
        etiqueta="Añadir una fila al final" accion={() => anadirFila(null)}
      >
        + fila
      </Boton>
      {claveValor ? null : (
        <Boton valor={valor} refBoton={refBoton}
          nombre="anadir-columna" op="anadir-columna" args={{}} clase="tb"
          etiqueta="Añadir una columna al final" accion={() => anadirColumna(null)}
        >
          + columna
        </Boton>
      )}
      {claveValor ? null : (
        <label className="tb-cabecera" title={motivoDe('cabecera', {}) || undefined}>
          <input
            type="checkbox"
            checked={cabecera}
            disabled={!!motivoDe('cabecera', {})}
            onChange={(ev) => ponerCabecera(ev.target.checked)}
          />
          {' '}Primera fila de cabecera
        </label>
      )}
      <span className="tb-donde">{Edicion.descripcion(valor)}</span>
      <span className="ayuda">
        {claveValor
          ? 'A la izquierda el concepto, en negrita sobre fondo gris; a la derecha su contenido.'
          : 'La cabecera sale en negrita con fondo azul claro, en el PDF y en el Word.'}
      </span>
    </div>
  );

  // Los controles de una celda. Cada botón dice de qué celda es y qué hace; si no se puede, está
  // apagado y el motivo va con él.
  const herramientas = (i, j, celda) => {
    const pos = enRejilla(i, j);
    const donde = `la celda de la fila ${i + 1}, ${nombreDeColumnas(pos)}`;
    const combinada = pos.ancho > 1 || pos.alto > 1;
    const juntaDerecha = Edicion.textoQueSeJunta(valor, { fila: i, columna: j, hacia: 'derecha' });
    const juntaAbajo = Edicion.textoQueSeJunta(valor, { fila: i, columna: j, hacia: 'abajo' });
    const avisoDe = (t) => (t ? `Su texto («${recorte(t)}») se añadirá al de esta celda, en otra línea.` : undefined);
    const enNegrita = celda.bold === true;
    const sombreado = i === 0 && cabecera ? 'azul claro' : 'gris';
    return (
      <div className="celda-herr" role="group" aria-label={`Combinar, separar y negrita de ${donde}`}>
        <Boton valor={valor} refBoton={refBoton}
          op="combinar" args={{ fila: i, columna: j, hacia: 'derecha' }}
          etiqueta={`Combinar ${donde} con la de su derecha`} ayuda={avisoDe(juntaDerecha)}
          accion={() => combinar(i, j, 'derecha')}
        >
          Unir →
        </Boton>
        <Boton valor={valor} refBoton={refBoton}
          op="combinar" args={{ fila: i, columna: j, hacia: 'abajo' }}
          etiqueta={`Combinar ${donde} con la de debajo`} ayuda={avisoDe(juntaAbajo)}
          accion={() => combinar(i, j, 'abajo')}
        >
          Unir ↓
        </Boton>
        {combinada ? (
          <Boton valor={valor} refBoton={refBoton}
            op="separar" args={{ fila: i, columna: j }}
            etiqueta={`Separar ${donde}: vuelve a ser una celda por casilla`}
            accion={() => separar(i, j)}
          >
            Separar
          </Boton>
        ) : null}
        <Boton valor={valor} refBoton={refBoton}
          nombre={`neg:${llave(i, j)}`} op="negrita" args={{ fila: i, columna: j, puesta: !enNegrita }}
          etiqueta={`Negrita de ${donde}`}
          ayuda={ayudaNegrita(celda, enNegrita, sombreado)}
          pulsado={enNegrita}
          accion={() => negrita(i, j, !enNegrita)}
        >
          Negrita
        </Boton>
        {/* El fondo, por nombre y no por color: son los dos de los documentos del centro. «Según la
            negrita» no guarda nada y deja que lo decida ella, que es como vienen las tablas del Word. */}
        <label className="celda-fondo">
          <span className="sr">{`Fondo de ${donde}`}</span>
          <select
            value={celda.fondo === undefined ? '' : celda.fondo}
            disabled={!!motivoDe('fondo', { fila: i, columna: j, cual: null })}
            onChange={(e) => ponerFondo(i, j, e.target.value === '' ? null : e.target.value)}
            title={`Fondo de ${donde}`}
          >
            <option value="">{`Fondo: según la negrita (${enNegrita ? sombreado : 'ninguno'})`}</option>
            <option value="cabecera">Fondo: azul claro</option>
            <option value="etiqueta">Fondo: gris</option>
            <option value="ninguno">Fondo: ninguno</option>
          </select>
        </label>
      </div>
    );
  };

  return (
    <div className="bloque bloque-tabla editor-tabla">
      {barra}
      <div className="sr" role="status" aria-live="polite">{aviso}</div>

      {claveValor ? null : (
        <p className="ayuda">
          <strong>Unir</strong> junta una celda con la de su derecha o la de debajo; si la que se
          absorbe tenía texto, se añade al de esta en otra línea, así que no se pierde nada.
          {' '}<strong>El sombreado sale de la negrita</strong> mientras no se elija: una celda en
          negrita sale azul claro si está en la cabecera y gris en cualquier otro sitio, en el PDF y en
          el Word. Con <strong>Fondo</strong> se elige el de una celda suelta, y entonces manda ese.
        </p>
      )}

      {reparo ? (
        <div className="nota nota-error" role="alert">
          <div>Esto no se va a poder guardar: {reparo}</div>
        </div>
      ) : null}

      {filas === 0 ? (
        <p className="vacio-apartado">
          La tabla no tiene filas y se imprime como «(tabla vacía)». Añade una con <em>+ fila</em>.
        </p>
      ) : (
        <div className="tabla-marco">
          <table className="tabla-doc tabla-editable">
            <tbody>
              {claveValor ? valor.pares.map((par, i) => (
                <tr key={i}>
                  <td className="celda-neg">
                    <textarea
                      className="celda-campo"
                      rows={1}
                      value={par.etiqueta}
                      ref={(n) => refCelda(i, 0, n)}
                      aria-label={`Concepto de la fila ${i + 1}`}
                      onChange={(ev) => escribir(i, 0, ev.target.value)}
                    />
                  </td>
                  <td>
                    <textarea
                      className="celda-campo"
                      rows={1}
                      value={par.valor}
                      ref={(n) => refCelda(i, 1, n)}
                      aria-label={`Contenido de la fila ${i + 1}`}
                      onChange={(ev) => escribir(i, 1, ev.target.value)}
                    />
                  </td>
                  <td className="celda-acciones">
                    <Boton valor={valor} refBoton={refBoton}
                      op="anadir-fila" args={{ despuesDe: i }} etiqueta={`Añadir una fila debajo de la fila ${i + 1}`}
                      accion={() => anadirFila(i)}
                    >
                      + debajo
                    </Boton>
                    <Boton valor={valor} refBoton={refBoton}
                      op="quitar-fila" args={{ fila: i }} etiqueta={`Quitar la fila ${i + 1}`}
                      accion={() => quitarFila(i)}
                    >
                      ×
                    </Boton>
                  </td>
                </tr>
              )) : valor.filas.map((fila, i) => (
                <tr key={i}>
                  {fila.map((celda, j) => (
                    <td
                      key={j}
                      className={claseCelda(i, j, celda)}
                      colSpan={celda.colspan > 1 ? celda.colspan : undefined}
                      rowSpan={celda.rowspan > 1 ? celda.rowspan : undefined}
                    >
                      <textarea
                        className="celda-campo"
                        rows={1}
                        value={celda.text}
                        ref={(n) => refCelda(i, j, n)}
                        aria-label={`${i === 0 && cabecera ? 'Cabecera' : `Fila ${i + 1}`}, ${nombreDeColumnas(enRejilla(i, j))}`}
                        onChange={(ev) => escribir(i, j, ev.target.value)}
                      />
                      {herramientas(i, j, celda)}
                    </td>
                  ))}
                  <td className="celda-acciones">
                    <Boton valor={valor} refBoton={refBoton}
                      op="anadir-fila" args={{ despuesDe: i }} etiqueta={`Añadir una fila debajo de la ${nombreDeFila(i, cabecera)}`}
                      accion={() => anadirFila(i)}
                    >
                      + debajo
                    </Boton>
                    <Boton valor={valor} refBoton={refBoton}
                      op="quitar-fila" args={{ fila: i }} etiqueta={`Quitar la ${nombreDeFila(i, cabecera)}`}
                      accion={() => quitarFila(i)}
                    >
                      ×
                    </Boton>
                  </td>
                </tr>
              ))}
            </tbody>
            {claveValor ? null : (
              <tfoot>
                <tr>
                  {Array.from({ length: columnas }, (_, j) => (
                    <td key={j} className="celda-acciones">
                      <Boton valor={valor} refBoton={refBoton}
                        op="anadir-columna" args={{ despuesDe: j }} etiqueta={`Añadir una columna a la derecha de la columna ${j + 1}`}
                        accion={() => anadirColumna(j)}
                      >
                        + a la derecha
                      </Boton>
                      <Boton valor={valor} refBoton={refBoton}
                        op="quitar-columna" args={{ columna: j }} etiqueta={`Quitar la columna ${j + 1}`}
                        accion={() => quitarColumna(j)}
                      >
                        ×
                      </Boton>
                    </td>
                  ))}
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
