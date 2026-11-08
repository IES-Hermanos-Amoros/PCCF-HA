// El editor de las tablas que se crean en la aplicación: escribir en las celdas, añadir y
// quitar filas y columnas, y poner o quitar la fila de cabecera.
//
// ES UNA CÁSCARA. Qué pasa al añadir una columna, qué celdas se conservan al quitar una fila,
// si poner la cabecera pone la primera fila en negrita, qué se puede y qué no según los topes:
// todo eso es core/tablas-edicion.js, que no sabe nada de pantallas y tiene sus pruebas
// (test/editor-tablas.js). Este componente pinta el valor que le llega, manda cada gesto como una
// operación, y apaga el botón de lo que no se puede diciendo por qué.
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
// EL FOCO. Tras añadir una fila o una columna el foco va a la primera celda nueva, para seguir
// escribiendo; tras quitar una, al botón de añadir, porque la celda en la que estabas ya no está.
// Lo que ha pasado se anuncia en una región `aria-live`.

'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import Edicion from '../../core/tablas-edicion';
import Estructurados from '../../core/estructurados';

const llave = (i, j) => `${i}:${j}`;

// Cómo se nombra una fila a quien lee la pantalla sin verla: «fila 3», y la primera de una tabla
// con cabecera lo dice, porque quitarla no es lo mismo que quitar la cabecera del interruptor.
const nombreDeFila = (i, cabecera) => (i === 0 && cabecera ? 'fila 1 (la cabecera)' : `fila ${i + 1}`);

// Un botón de la tabla: se apaga solo cuando la operación no se puede y su `title` dice por qué.
// Está FUERA del componente a propósito: definido dentro, cada repintado sería un componente
// distinto, React lo desmontaría y el botón que acaba de recibir el foco lo perdería.
function Boton({
  valor, refBoton, nombre, op, args, children, etiqueta, accion, clase = 'mini',
}) {
  const motivo = Edicion.motivoDeNo(valor, op, args);
  return (
    <button
      type="button"
      className={clase}
      ref={nombre ? (n) => refBoton(nombre, n) : undefined}
      onClick={accion}
      disabled={!!motivo}
      aria-label={etiqueta}
      title={motivo || etiqueta}
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
  const combinadas = Edicion.tieneCombinadas(valor);

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
    const nodo = p.celda ? celdas.current.get(p.celda) : botones.current.get(p.boton);
    const alternativa = botones.current.get(p.boton);
    const destino = nodo || alternativa;
    if (destino && typeof destino.focus === 'function') destino.focus();
  });

  const refCelda = (i, j, nodo) => {
    if (nodo) celdas.current.set(llave(i, j), nodo); else celdas.current.delete(llave(i, j));
  };
  const refBoton = (nombre, nodo) => {
    if (nodo) botones.current.set(nombre, nodo); else botones.current.delete(nombre);
  };

  // Una operación del módulo puro. Si no cambia nada (no se puede), no hace nada: el botón ya
  // estaba apagado y dice por qué.
  const hacer = (op, args, { dice, foco } = {}) => {
    const siguiente = Edicion.aplicar(valor, op, args, { columnas: ancho.current });
    if (siguiente === valor) return;
    onCambio(siguiente);
    if (dice) setAviso(dice);
    if (foco) pendiente.current = foco;
  };

  const motivoDe = (op, args) => Edicion.motivoDeNo(valor, op, args);

  // Lo que la puerta diría de este valor. Lo que sale de las operaciones siempre pasa; esto es por
  // si el valor que llega ya traía un defecto, que se diga delante de quien lo va a guardar.
  const reparo = Estructurados.motivoDeCampo(campo, valor);

  // ---------------------------------------------------------------- las operaciones, con su frase

  const anadirFila = (despuesDe) => {
    const nueva = despuesDe == null ? filas : despuesDe + 1;
    hacer('anadir-fila', { despuesDe }, {
      dice: `Fila ${nueva + 1} añadida. La tabla tiene ${filas + 1} filas.`,
      foco: { celda: llave(nueva, 0), boton: 'anadir-fila' },
    });
  };
  const quitarFila = (i) => hacer('quitar-fila', { fila: i }, {
    dice: `Quitada la ${nombreDeFila(i, cabecera)}. ${filas - 1 === 1 ? 'Queda 1 fila.' : `Quedan ${filas - 1} filas.`}`,
    foco: { boton: 'anadir-fila' },
  });
  const anadirColumna = (despuesDe) => {
    const nueva = despuesDe == null ? columnas : despuesDe + 1;
    hacer('anadir-columna', { despuesDe }, {
      dice: `Columna ${nueva + 1} añadida. La tabla tiene ${columnas + 1} columnas.`,
      foco: { celda: llave(0, nueva), boton: 'anadir-columna' },
    });
  };
  const quitarColumna = (j) => hacer('quitar-columna', { columna: j }, {
    dice: `Columna ${j + 1} quitada. ${columnas - 1 === 1 ? 'Queda 1 columna.' : `Quedan ${columnas - 1} columnas.`}`,
    foco: { boton: 'anadir-columna' },
  });
  const ponerCabecera = (puesta) => hacer('cabecera', { puesta }, {
    dice: puesta ? 'La primera fila es ahora la cabecera.' : 'La tabla ya no tiene fila de cabecera.',
  });
  const escribir = (i, j, texto) => hacer('texto', { fila: i, columna: j, valor: texto });

  // ---------------------------------------------------------------- piezas

  const clasePorFila = (i, celda) => {
    if (!celda.bold) return '';
    return i === 0 && cabecera ? 'celda-cab' : 'celda-neg';
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

  return (
    <div className="bloque bloque-tabla editor-tabla">
      {barra}
      <div className="sr" role="status" aria-live="polite">{aviso}</div>

      {combinadas ? (
        <p className="ayuda">
          Esta tabla tiene celdas combinadas. Se puede escribir en ellas y cambiar su cabecera, pero
          todavía no añadir ni quitar filas o columnas.
        </p>
      ) : null}

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
                      className={clasePorFila(i, celda)}
                      colSpan={celda.colspan > 1 ? celda.colspan : undefined}
                      rowSpan={celda.rowspan > 1 ? celda.rowspan : undefined}
                    >
                      <textarea
                        className="celda-campo"
                        rows={1}
                        value={celda.text}
                        ref={(n) => refCelda(i, j, n)}
                        aria-label={`${i === 0 && cabecera ? 'Cabecera' : `Fila ${i + 1}`}, columna ${j + 1}`}
                        onChange={(ev) => escribir(i, j, ev.target.value)}
                      />
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
            {claveValor || combinadas ? null : (
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
