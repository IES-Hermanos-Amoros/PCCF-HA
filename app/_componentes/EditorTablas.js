// El editor de las tablas que se crean en la aplicación: escribir en las celdas, añadir y
// quitar filas y columnas, combinar y separar celdas, poner la negrita, el fondo, la alineación y
// el tamaño de letra celda a celda, repartir el ancho de las columnas y poner o quitar la fila de
// cabecera.
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
// LA CELDA ES PARA ESCRIBIR, Y EL FORMATO SE DA EN UN SOLO SITIO
//
// Escribir en la tabla es lo que se hace casi todo el tiempo; dar formato es ocasional. Así que
// dentro de la casilla solo hay dos cosas: el cuadro donde se teclea, que se queda con el ancho, y
// un botón estrecho —«Aa»— que lleva al panel de formato de ESA celda. El fondo, la alineación, el
// tamaño de letra, la negrita, unir, separar y el ancho de la columna están en ese panel, una sola
// vez, arriba de la tabla y hablando de la celda elegida. Las tablas reales de este departamento
// llegan a doce columnas: con los controles repartidos por las casillas, la casilla era lo más
// pequeño de la pantalla.
//
// NO HAY DIÁLOGO MODAL. El panel es una barra más, en el sitio donde estaba la de filas y columnas:
// en esta aplicación no hay ningún modal y este no iba a ser el primero.
//
// CON EL TECLADO SE LLEGA IGUAL. Entrar en una celda con el tabulador la elige —el panel dice en
// voz alta cuál es—, el tabulador siguiente cae en su botón «Aa», y ese botón lleva el foco al
// panel. «Volver a la celda» hace el camino de vuelta. Qué celda está elegida se ve además en la
// propia celda, con un filo de color.
//
// EL SOMBREADO LO DECIDE CORE/. Mientras una celda no lleve `fondo`, su color sale de la negrita:
// azul claro en la fila de cabecera, gris fuera de ella. Con `fondo` manda la clave. Quién gana es
// `fondoDeCelda` de core/estructurados.js, y la pantalla lo consulta por `formatoDeCelda` en lugar
// de deducirlo, para no pintar una celda de un color y que salga impresa de otro.
//
// De dónde sale el color no se puede adivinar mirando la tabla, así que se explica: la regla entera
// está en la ayuda plegada de la barra, y el botón de negrita dice en su `title` qué va a pasar con
// la celda elegida, que es lo que hace falta en el momento de pulsarlo.
//
// LA ALINEACIÓN, EL TAMAÑO DE LETRA Y EL ANCHO DE LAS COLUMNAS, IGUAL. Los nombres que se guardan
// son los de core/estructurados.js y la pantalla los lee de `formatoDeCelda`; el ancho es una lista
// de proporciones de la tabla, y aquí solo se mueve de una en una con el porcentaje a la vista.
// Nadie escribe una proporción a mano.
//
// QUÉ FORMATO LLEVA LA CELDA SE SIGUE VIENDO EN LA CELDA. El panel es desde dónde se cambia, no
// dónde se lee: `claseCelda` pinta en cada casilla el fondo, la alineación, el tamaño y la negrita
// que le salen de verdad, los que dice core/.
//
// EL FOCO. Se mantiene en la tabla tras cada gesto, y no solo en el botón que se pulsó, que puede
// desaparecer o apagarse: tras añadir una fila va a su primera celda; tras quitar una, a la celda
// que ocupa su sitio; tras añadir o quitar una columna, a la celda de la primera fila que cae en
// esa columna; tras la negrita, unir, separar y mover un ancho se queda en el botón del panel que se
// pulsó, y si la operación lo ha dejado apagado, en el de al lado o en la celda elegida. Cada gesto
// dice sus destinos EN ORDEN y se queda con el primero que de verdad pueda recibirlo. Lo que ha
// pasado se anuncia en una región `aria-live`.

'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import Edicion from '../../core/tablas-edicion';
import Estructurados from '../../core/estructurados';
import Ayuda from './Ayuda';

const llave = (i, j) => `${i}:${j}`;

// Cómo se nombra una fila a quien lee la pantalla sin verla: «fila 3», y la primera de una tabla
// con cabecera lo dice, porque quitarla no es lo mismo que quitar la cabecera del interruptor.
const nombreDeFila = (i, cabecera) => (i === 0 && cabecera ? 'fila 1 (la cabecera)' : `fila ${i + 1}`);

// Cómo se llama cada fondo en la pantalla. El nombre que se guarda es el de core/estructurados.js;
// aquí solo se dice de qué color es, porque «etiqueta» no significa nada para quien lo lee.
const NOMBRE_FONDO = { cabecera: 'azul claro', etiqueta: 'gris', ninguno: 'ninguno' };

// Lo mismo con la alineación y el tamaño de letra: lo que se guarda es el nombre de
// core/estructurados.js, y aquí se dice en castellano corriente («pequena» se escribe sin eñe en el
// modelo y con eñe en la pantalla). Elegir el valor por omisión BORRA la clave de la celda
// (core/tablas-edicion.js), así que el desplegable lo enseña seleccionado cuando no la lleva.
const ALINEACIONES = [['izquierda', 'izquierda'], ['centro', 'centrado'], ['derecha', 'derecha']];
const TAMANOS = [['pequena', 'pequeña'], ['normal', 'normal'], ['grande', 'grande']];
const NOMBRE_ALINEACION = Object.fromEntries(ALINEACIONES);
const NOMBRE_TAMANO = Object.fromEntries(TAMANOS);

// La columna o columnas que ocupa una celda, para el nombre: «columna 2» o «columnas 2 a 3».
const nombreDeColumnas = (pos) => (pos.ancho > 1
  ? `columnas ${pos.columna + 1} a ${pos.columna + pos.ancho}` : `columna ${pos.columna + 1}`);

// Lo que cuesta de escribir en un título: el texto que se junta, recortado.
const recorte = (texto) => (texto.length > 40 ? `${texto.slice(0, 40)}…` : texto).replace(/\n/g, ' / ');

// Un botón de la tabla: se apaga solo cuando la operación no se puede, y el motivo va en el `title`
// y en el nombre accesible (un botón apagado no recibe el foco, pero un lector lo encuentra al
// recorrer la tabla). `impedido` es el motivo que no depende del valor sino de la pantalla —no hay
// ninguna celda elegida todavía—, y manda sobre el del módulo: sin celda no hay argumentos que
// preguntarle. Está FUERA del componente a propósito: definido dentro, cada repintado sería un
// componente distinto, React lo desmontaría y el botón que acaba de recibir el foco lo perdería.
function Boton({
  valor, refBoton, nombre, op, args, children, etiqueta, ayuda, accion, pulsado, impedido,
  clase = 'mini',
}) {
  const motivo = impedido || Edicion.motivoDeNo(valor, op, args);
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
  // QUÉ CELDA ESTÁ ELEGIDA: el panel de formato habla de ella. Es estado de la pantalla y vive
  // aquí; que la elección siga apuntando a una celda de verdad después de quitar una fila, quitar
  // una columna o combinar dos celdas lo decide `elegirCelda` de core/, que tiene sus pruebas.
  const [eleccion, setEleccion] = useState(null);
  const celdas = useRef(new Map());
  const botones = useRef(new Map());
  const pendiente = useRef(null);
  // El ancho de la última tabla con filas que se vio: lo que hace falta para abrir una fila en
  // una tabla que se ha quedado sin ninguna. Si nunca se vio, el de nacimiento del campo.
  const ancho = useRef((campo.inicial && campo.inicial.columnas) || 1);
  if (columnas) ancho.current = columnas;

  // ¿Puede este elemento quedarse el foco? Existir no basta: un botón que la operación acaba de
  // apagar —la columna ha llegado a su tope, la celda ya no se puede unir— no lo recibe, y
  // pedírselo lo manda al principio de la página.
  const utilizable = (n) => !!n && typeof n.focus === 'function' && !n.disabled;

  // `foco` devuelve los destinos EN ORDEN y se queda con el primero que pueda: detrás de cada botón
  // va una celda, que siempre puede. Si ninguno puede, se intenta el primero que exista, y si no
  // existe ninguno no se toca el foco.
  useLayoutEffect(() => {
    const p = pendiente.current;
    if (!p) return;
    pendiente.current = null;
    const nodos = p
      .filter((d) => d && (d.celda || d.boton))
      .map((d) => (d.celda ? celdas.current.get(d.celda) : botones.current.get(d.boton)));
    const destino = nodos.find(utilizable)
      || nodos.find((n) => !!n && typeof n.focus === 'function');
    if (destino) destino.focus();
  });

  const refCelda = (i, j, nodo) => {
    if (nodo) celdas.current.set(llave(i, j), nodo); else celdas.current.delete(llave(i, j));
  };
  const refBoton = (nombre, nodo) => {
    if (nodo) botones.current.set(nombre, nodo); else botones.current.delete(nombre);
  };

  // El formato de la celda elegida, tal y como lo lee el panel. null cuando no hay ninguna elegida
  // o cuando la tabla se ha quedado sin filas: entonces el panel sale apagado y lo dice.
  const elegida = claveValor ? null : Edicion.elegirCelda(valor, eleccion);
  const formato = claveValor ? null : Edicion.formatoDeCelda(valor, eleccion);

  // Entrar en una celda la elige. Si ya lo estaba se devuelve el MISMO objeto para que React no
  // repinte la tabla entera en cada tabulación.
  const elegir = (i, j) => setEleccion((e) => (e && e.fila === i && e.columna === j ? e : { fila: i, columna: j }));

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
      foco: () => [{ celda: llave(nueva, 0) }, { boton: 'anadir-fila' }],
    });
  };
  const quitarFila = (i) => hacer('quitar-fila', { fila: i }, {
    dice: (s) => `Quitada la ${nombreDeFila(i, cabecera)}. Quedan ${textoNumero(Edicion.filasDe(s), 'fila', 'filas')}.`,
    foco: (s) => (Edicion.filasDe(s)
      ? [{ celda: llave(Math.min(i, Edicion.filasDe(s) - 1), 0) }, { boton: 'anadir-fila' }]
      : [{ boton: 'anadir-fila' }]),
  });
  const anadirColumna = (despuesDe) => {
    const nueva = despuesDe == null ? columnas : despuesDe + 1;
    hacer('anadir-columna', { despuesDe }, {
      dice: `Columna ${nueva + 1} añadida. La tabla tiene ${columnas + 1} columnas.`,
      foco: (s) => {
        const e = Edicion.celdaEn(s, 0, nueva);
        return [e ? { celda: llave(e.fila, e.columna) } : null, { boton: 'anadir-columna' }];
      },
    });
  };
  const quitarColumna = (j) => hacer('quitar-columna', { columna: j }, {
    dice: (s) => `Columna ${j + 1} quitada. Quedan ${textoNumero(Edicion.columnasDe(s), 'columna', 'columnas')}`
      + (Edicion.filasDe(s) < filas ? ` y ${textoNumero(Edicion.filasDe(s), 'fila', 'filas')}: una fila se quedaba sin celdas propias y se ha quitado.` : '.'),
    foco: (s) => {
      const e = Edicion.celdaEn(s, 0, Math.min(j, Edicion.columnasDe(s) - 1));
      return [e ? { celda: llave(e.fila, e.columna) } : null, { boton: 'anadir-columna' }];
    },
  });
  const ponerCabecera = (puesta) => hacer('cabecera', { puesta }, {
    dice: puesta ? 'La primera fila es ahora la cabecera.' : 'La tabla ya no tiene fila de cabecera.',
  });
  const escribir = (i, j, texto) => hacer('texto', { fila: i, columna: j, valor: texto });

  // ---------------------------------------------------------------- lo que hace el panel

  // Dónde está la celda elegida, dicho igual en el panel, en los `title` y en los avisos.
  const donde = formato ? `la celda de la fila ${formato.fila + 1}, ${nombreDeColumnas(formato)}` : null;
  // El motivo que no depende del valor: sin celda elegida no hay nada que formatear. Se dice una
  // vez y lo llevan todos los controles del panel, para que ninguno quede apagado sin explicación.
  const sinCelda = formato ? null : 'Primero hay que elegir una celda: pulsa en ella, o entra con el tabulador y pulsa «Aa».';
  // Los argumentos del panel. Sin celda elegida da igual lo que valgan: `impedido` manda.
  const enFila = formato ? formato.fila : 0;
  const enCol = formato ? formato.columna : 0;
  const enColRejilla = formato ? formato.columnaRejilla : 0;

  const combinar = (hacia) => {
    const juntado = Edicion.textoQueSeJunta(valor, { fila: enFila, columna: enCol, hacia });
    hacer('combinar', { fila: enFila, columna: enCol, hacia }, {
      dice: `${donde} se ha combinado con la de ${hacia === 'derecha' ? 'su derecha' : 'debajo'}.`
        + (juntado ? ' Su texto se ha añadido al de esta celda, en otra línea.' : ''),
      // Unir puede dejar la celda contra el borde, y entonces este botón se apaga: detrás va la
      // celda, para no perder el foco a mitad de camino.
      foco: () => [{ boton: `fmt:unir:${hacia}` }, { celda: llave(enFila, enCol) }],
    });
  };
  const separar = () => hacer('separar', { fila: enFila, columna: enCol }, {
    dice: `${donde} se ha separado: cada casilla vuelve a ser una celda. El texto se queda en la primera.`,
    foco: () => [{ boton: 'fmt:separar' }, { celda: llave(enFila, enCol) }],
  });

  // El fondo elegido a mano manda sobre la negrita, así que el botón de negrita no puede prometer
  // un sombreado que no va a salir.
  const ayudaNegrita = (f) => {
    const sombreado = f.enCabecera ? 'azul claro' : 'gris';
    if (f.fondo !== null) {
      return f.negrita
        ? 'Puesta. El fondo de esta celda está elegido a mano, así que quitarla no le cambia el color.'
        : 'Pulsa para ponerla. El fondo de esta celda está elegido a mano, así que no le cambia el color.';
    }
    return f.negrita
      ? 'Puesta: sale sombreada. Pulsa para quitarla.'
      : `Pulsa para ponerla: la celda saldrá en negrita y sombreada de ${sombreado}.`;
  };

  const negrita = (puesta) => hacer('negrita', { fila: enFila, columna: enCol, puesta }, {
    dice: puesta
      ? `${donde} va en negrita: saldrá sombreada.`
      : `${donde} ya no va en negrita ni sombreada.`,
    foco: () => [{ boton: 'fmt:negrita' }, { celda: llave(enFila, enCol) }],
  });

  // El foco de los desplegables no se mueve: se queda donde se eligió, que es el propio
  // desplegable, para poder cambiar de opinión sin volver a buscarlo.
  const ponerFondo = (cual) => hacer('fondo', { fila: enFila, columna: enCol, cual }, {
    dice: cual === null
      ? `El fondo de ${donde} vuelve a decidirlo la negrita.`
      : `${donde} tiene fondo ${NOMBRE_FONDO[cual]}.`,
  });
  const alinear = (cual) => hacer('alineacion', { fila: enFila, columna: enCol, cual }, {
    dice: `El texto de ${donde} va a la ${NOMBRE_ALINEACION[cual]}.`,
  });
  const ponerTamano = (cual) => hacer('tamano', { fila: enFila, columna: enCol, cual }, {
    dice: `La letra de ${donde} es ${NOMBRE_TAMANO[cual]}.`,
  });

  // El ancho de la columna donde empieza la celda elegida. El porcentaje que queda se dice en el
  // aviso además de verse, porque mover una columna cambia el de todas las demás y eso no se
  // adivina mirando un número.
  const moverAncho = (hacia) => hacer('ancho', { columna: enColRejilla, hacia }, {
    dice: (s) => {
      const p = Edicion.porcentajesDe(s);
      return `La columna ${enColRejilla + 1} ocupa el ${p[enColRejilla]} % del ancho de la tabla.`
        + ` Reparto: ${p.map((x) => `${x} %`).join(' · ')}.`;
    },
    // El foco se queda en el botón pulsado, y si esa columna acaba de llegar a su tope —con lo que
    // el botón se apaga— pasa al de la dirección contraria, y si tampoco, a la celda.
    foco: () => [
      { boton: `ancho:${hacia}` },
      { boton: `ancho:${hacia === 'ensanchar' ? 'estrechar' : 'ensanchar'}` },
      { celda: llave(enFila, enCol) },
    ],
  });
  const anchoAutomatico = () => hacer('anchos-automaticos', {}, {
    dice: 'Las columnas vuelven a repartirse solas según la cantidad de texto de cada una.',
    // Este botón se apaga al pulsarlo —ya no hay anchos a mano que quitar—, así que el foco se va
    // a la celda elegida, y si no hay ninguna, a la barra de arriba.
    foco: () => [
      elegida ? { celda: llave(elegida.fila, elegida.columna) } : null,
      { boton: 'ancho:ensanchar' },
      { boton: 'anadir-columna' },
    ],
  });

  // El camino de vuelta del panel a la celda. Es un `focus()` directo y no un `pendiente`: aquí no
  // cambia el valor, así que no hay repintado que esperar.
  const volverALaCelda = () => {
    if (!elegida) return;
    const n = celdas.current.get(llave(elegida.fila, elegida.columna));
    if (n && typeof n.focus === 'function') n.focus();
  };

  // El camino de ida: la celda elige y el foco se va al primer control del panel.
  //
  // Si la celda ya estaba elegida, el panel ya está encendido, elegirla otra vez no repinta nada y
  // el foco se lleva AHORA. Si no lo estaba, el control sigue apagado hasta el repintado —un
  // elemento apagado no recibe el foco—, así que se pide para después y lo da `useLayoutEffect`.
  const irAlFormato = (i, j) => {
    const yaEstaba = !!elegida && elegida.fila === i && elegida.columna === j;
    elegir(i, j);
    const n = yaEstaba && botones.current.get('fmt:fondo');
    if (n && typeof n.focus === 'function') n.focus();
    else pendiente.current = [{ boton: 'fmt:fondo' }];
  };

  // ---------------------------------------------------------------- piezas

  // La pantalla pinta el fondo que lleva la celda de verdad, el que decide core/, y no el que se
  // deduzca aquí: si no, una celda con el fondo elegido a mano se vería de un color en la pantalla
  // y saldría de otro en el PDF. La negrita es una clase aparte porque ya no implica fondo. Y la
  // celda elegida lleva la suya: desde dónde se cambia el formato es el panel, pero qué celda se
  // está tocando y qué formato tiene se ven aquí.
  const claseCelda = (i, j, celda) => {
    const fondo = Edicion.fondoEfectivo(valor, i, j);
    const alineacion = Edicion.alineacionEfectiva(valor, i, j);
    const tamano = Edicion.tamanoEfectivo(valor, i, j);
    return [fondo === 'cabecera' ? 'celda-cab' : '', fondo === 'etiqueta' ? 'celda-neg' : '',
      celda.bold === true ? 'celda-negrita' : '',
      alineacion ? `celda-${alineacion}` : '', tamano ? `celda-${tamano}` : '',
      elegida && elegida.fila === i && elegida.columna === j ? 'celda-elegida' : ''].filter(Boolean).join(' ');
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
      {claveValor ? null : (
        <Ayuda sobre="las celdas de la tabla">
          <p>
            <strong>El formato se da en la barra de abajo</strong>, que habla siempre de una celda:
            la elegida. Se elige pulsando en ella o entrando con el tabulador, y entonces la casilla
            se marca con un filo de color y la barra dice qué fila y qué columna es. Con el teclado:
            el tabulador después del texto cae en el botón <strong>Aa</strong> de la casilla, que
            lleva el foco a la barra, y <strong>Volver a la celda</strong> hace el camino inverso.
          </p>
          <p>
            <strong>Unir</strong> junta la celda elegida con la de su derecha o la de debajo. Si la
            que se absorbe tenía texto, se añade al de esta en otra línea: unir no pierde nada de lo
            escrito. <strong>Separar</strong> lo deshace, y el texto se queda en la primera casilla.
          </p>
          <p>
            <strong>El sombreado sale de la negrita</strong> mientras no se elija otra cosa: una celda
            en negrita sale azul claro si está en la fila de cabecera y gris en cualquier otro sitio,
            igual en el PDF y en el Word. Con <strong>Fondo</strong> se le pone a una celda suelta el
            color que se quiera, y entonces manda ese: así se puede sombrear sin negrita, poner negrita
            sin sombrear y usar el azul fuera de la cabecera.
          </p>
          <p>
            La <strong>fila de cabecera</strong> es la primera cuando va entera en negrita, y es la que
            se repite arriba al cambiar de página en el PDF.
          </p>
          <p>
            <strong>Texto</strong> y <strong>Letra</strong> alinean la celda elegida y le cambian el
            tamaño de la letra. Son de la celda, no de la columna: una fila de cifras centradas conviven
            con una de texto a la izquierda, y sale igual en el PDF y en el Word.
          </p>
          <p>
            <strong>El ancho de cada columna</strong> se calcula solo, a partir de la cantidad de texto
            que tiene: las columnas de marcas o de cifras salen estrechas y las de texto largo, anchas.
            Con <strong>+</strong> y <strong>−</strong> de la barra se reparte a mano la columna de la
            celda elegida, y entonces se ve el porcentaje que ocupa cada una. Al tocar la primera,
            todas se igualan y desde ahí se mueve la que haga falta. <strong>Anchos automáticos</strong>
            {' '}vuelve al cálculo por texto y pierde el reparto hecho a mano.
          </p>
        </Ayuda>
      )}
      <span className="ayuda">
        {claveValor
          ? 'A la izquierda el concepto, en negrita sobre fondo gris; a la derecha su contenido.'
          : 'La cabecera sale en negrita con fondo azul claro, en el PDF y en el Word.'}
      </span>
    </div>
  );

  // EL PANEL DE FORMATO: uno para toda la tabla, y habla de la celda elegida. Cada control dice de
  // qué celda es; si no se puede, está apagado y el motivo va con él. Sin celda elegida el panel
  // sale entero apagado con un solo motivo, en lugar de desaparecer: si apareciera y desapareciera,
  // la tabla saltaría de sitio cada vez que se entra en una casilla.
  const panelFormato = () => {
    const juntaDerecha = formato && Edicion.textoQueSeJunta(valor, { fila: enFila, columna: enCol, hacia: 'derecha' });
    const juntaAbajo = formato && Edicion.textoQueSeJunta(valor, { fila: enFila, columna: enCol, hacia: 'abajo' });
    const avisoDe = (t) => (t ? `Su texto («${recorte(t)}») se añadirá al de esta celda, en otra línea.` : undefined);
    const deLaCelda = donde || 'la celda elegida';
    const sombreado = formato && formato.enCabecera ? 'azul claro' : 'gris';
    return (
      <div
        className={`panel-celda${formato ? '' : ' panel-celda-sin'}`}
        role="group"
        aria-label="Formato de la celda elegida"
      >
        <span className="panel-celda-donde">
          {formato
            ? `Fila ${formato.fila + 1}, ${nombreDeColumnas(formato)}`
            : 'Ninguna celda elegida'}
        </span>

        <label className="panel-celda-campo">
          <span className="sr">{`Fondo de ${deLaCelda}`}</span>
          {/* El fondo, por nombre y no por color: son los dos de los documentos del centro. «Según
              la negrita» no guarda nada y deja que lo decida ella, que es como vienen las tablas
              del Word. Es el primer control del panel, y el que recibe el foco al llegar desde la
              casilla. */}
          <select
            ref={(n) => refBoton('fmt:fondo', n)}
            value={formato && formato.fondo !== null ? formato.fondo : ''}
            disabled={!formato || !!motivoDe('fondo', { fila: enFila, columna: enCol, cual: null })}
            onChange={(e) => ponerFondo(e.target.value === '' ? null : e.target.value)}
            title={sinCelda || `Fondo de ${deLaCelda}`}
          >
            <option value="">
              {`Fondo: según la negrita (${formato && formato.negrita ? sombreado : 'ninguno'})`}
            </option>
            <option value="cabecera">Fondo: azul claro</option>
            <option value="etiqueta">Fondo: gris</option>
            <option value="ninguno">Fondo: ninguno</option>
          </select>
        </label>

        {/* La alineación y el tamaño de letra, también por nombre: el PDF los escribe en puntos y
            el Word en medios puntos, y lo que se guarda es el nombre. Elegir el primero de la
            lista (izquierda, normal) borra la clave de la celda, así que no hay dos maneras de
            decir que una celda sale como siempre. */}
        <label className="panel-celda-campo">
          <span className="sr">{`Alineación de ${deLaCelda}`}</span>
          <select
            value={formato && formato.alineacion !== null
              ? formato.alineacion : Estructurados.ALINEACION_CELDA_OMISION}
            disabled={!formato || !!motivoDe('alineacion', { fila: enFila, columna: enCol, cual: null })}
            onChange={(e) => alinear(e.target.value)}
            title={sinCelda || `Alineación de ${deLaCelda}`}
          >
            {ALINEACIONES.map(([nombre, como]) => (
              <option key={nombre} value={nombre}>{`Texto: ${como}`}</option>
            ))}
          </select>
        </label>
        <label className="panel-celda-campo">
          <span className="sr">{`Tamaño de la letra de ${deLaCelda}`}</span>
          <select
            value={formato && formato.tamano !== null
              ? formato.tamano : Estructurados.TAMANO_CELDA_OMISION}
            disabled={!formato || !!motivoDe('tamano', { fila: enFila, columna: enCol, cual: null })}
            onChange={(e) => ponerTamano(e.target.value)}
            title={sinCelda || `Tamaño de la letra de ${deLaCelda}`}
          >
            {TAMANOS.map(([nombre, como]) => (
              <option key={nombre} value={nombre}>{`Letra: ${como}`}</option>
            ))}
          </select>
        </label>

        <Boton valor={valor} refBoton={refBoton} impedido={sinCelda}
          nombre="fmt:negrita" op="negrita" args={{ fila: enFila, columna: enCol, puesta: !(formato && formato.negrita) }}
          etiqueta={`Negrita de ${deLaCelda}`}
          ayuda={formato ? ayudaNegrita(formato) : undefined}
          pulsado={!!(formato && formato.negrita)}
          accion={() => negrita(!formato.negrita)}
        >
          Negrita
        </Boton>

        <span className="sep" aria-hidden="true" />

        <Boton valor={valor} refBoton={refBoton} impedido={sinCelda}
          nombre="fmt:unir:derecha" op="combinar" args={{ fila: enFila, columna: enCol, hacia: 'derecha' }}
          etiqueta={`Combinar ${deLaCelda} con la de su derecha`} ayuda={avisoDe(juntaDerecha)}
          accion={() => combinar('derecha')}
        >
          Unir →
        </Boton>
        <Boton valor={valor} refBoton={refBoton} impedido={sinCelda}
          nombre="fmt:unir:abajo" op="combinar" args={{ fila: enFila, columna: enCol, hacia: 'abajo' }}
          etiqueta={`Combinar ${deLaCelda} con la de debajo`} ayuda={avisoDe(juntaAbajo)}
          accion={() => combinar('abajo')}
        >
          Unir ↓
        </Boton>
        <Boton valor={valor} refBoton={refBoton} impedido={sinCelda}
          nombre="fmt:separar" op="separar" args={{ fila: enFila, columna: enCol }}
          etiqueta={`Separar ${deLaCelda}: vuelve a ser una celda por casilla`}
          accion={() => separar()}
        >
          Separar
        </Boton>

        <span className="sep" aria-hidden="true" />

        {/* EL ANCHO SALE DEL PIE DE LA TABLA. Con doce columnas, tres controles por columna en una
            sola fila no se podían leer. Aquí se mueve la columna de la celda elegida, de una en
            una, con su porcentaje al lado: nadie escribe una proporción a mano. Mientras no se
            toque, el porcentaje no se puede decir —lo calcula cada motor con la cantidad de texto—,
            así que se dice «automático». */}
        <span className="panel-celda-grupo" role="group" aria-label="Ancho de las columnas de la tabla">
          <span className="ayuda">
            {formato ? `Ancho de la columna ${formato.columnaRejilla + 1}:` : 'Ancho de la columna:'}
          </span>
          <Boton valor={valor} refBoton={refBoton} impedido={sinCelda}
            nombre="ancho:estrechar" op="ancho" args={{ columna: enColRejilla, hacia: 'estrechar' }}
            etiqueta={formato ? `Estrechar la columna ${formato.columnaRejilla + 1}` : 'Estrechar la columna'}
            accion={() => moverAncho('estrechar')}
          >
            −
          </Boton>
          <span className="celda-ancho-pct">
            {formato && formato.porcentaje !== null ? `${formato.porcentaje} %` : 'auto'}
          </span>
          <Boton valor={valor} refBoton={refBoton} impedido={sinCelda}
            nombre="ancho:ensanchar" op="ancho" args={{ columna: enColRejilla, hacia: 'ensanchar' }}
            etiqueta={formato ? `Ensanchar la columna ${formato.columnaRejilla + 1}` : 'Ensanchar la columna'}
            accion={() => moverAncho('ensanchar')}
          >
            +
          </Boton>
          <Boton valor={valor} refBoton={refBoton}
            op="anchos-automaticos" args={{}}
            etiqueta="Que las columnas vuelvan a repartirse solas"
            ayuda="Se pierden los anchos elegidos a mano y cada columna mide lo que diga su cantidad de texto."
            accion={() => anchoAutomatico()}
          >
            Anchos automáticos
          </Boton>
        </span>

        <button
          type="button"
          className="mini"
          onClick={volverALaCelda}
          disabled={!elegida}
          title={sinCelda || `Volver al texto de ${deLaCelda}`}
          aria-label={sinCelda ? `Volver a la celda. No disponible: ${sinCelda}` : `Volver al texto de ${deLaCelda}`}
        >
          Volver a la celda
        </button>

        {/* Qué hace esta barra, en una línea: es un dato de la pantalla y se queda a la vista. */}
        <span className="ayuda">
          {formato
            ? 'Lo que se elija aquí es de esta celda, no de su fila ni de su columna, y se ve en la celda.'
            : sinCelda}
        </span>
      </div>
    );
  };

  return (
    <div className="bloque bloque-tabla editor-tabla">
      {barra}
      {claveValor || filas === 0 ? null : panelFormato()}
      <div className="sr" role="status" aria-live="polite">{aviso}</div>

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
                      {/* DENTRO DE LA CASILLA, DOS COSAS: el cuadro donde se escribe, que se queda
                          con el ancho, y el botón que lleva al panel de formato de esta celda. */}
                      <div className="celda-caja">
                        <textarea
                          className="celda-campo"
                          rows={1}
                          value={celda.text}
                          ref={(n) => refCelda(i, j, n)}
                          aria-label={`${i === 0 && cabecera ? 'Cabecera' : `Fila ${i + 1}`}, ${nombreDeColumnas(enRejilla(i, j))}`}
                          onChange={(ev) => escribir(i, j, ev.target.value)}
                          onFocus={() => elegir(i, j)}
                        />
                        <button
                          type="button"
                          className="celda-formato"
                          onClick={() => irAlFormato(i, j)}
                          aria-label={`Formato de la celda de la fila ${i + 1}, ${nombreDeColumnas(enRejilla(i, j))}`}
                          title={`Formato, unir y ancho de la celda de la fila ${i + 1}, ${nombreDeColumnas(enRejilla(i, j))}`}
                        >
                          <span aria-hidden="true">Aa</span>
                        </button>
                      </div>
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
                  <td className="celda-acciones" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
