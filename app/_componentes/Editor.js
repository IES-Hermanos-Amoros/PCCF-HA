// El editor de bloques: la pieza por la que existe todo lo anterior.
//
// Es el del prototipo (docs/mockup-v2/CAMBIOS.md, puntos 15 y 16), portado a
// React sin rediseñarlo: cada párrafo es una caja con sus botones de *subir*,
// *bajar*, *convertir en lista* y *borrar*, las listas llevan sangría, y arriba
// está la barra de **N** / *C* del v1 con los botones conectados.
//
// EL ESTADO ES EL ARRAY DE BLOQUES Y EL TEXTO SE ESCRIBE EN <textarea>
//
// Nunca `contenteditable`. Un `contenteditable` recibe HTML en cuanto alguien
// pega desde Word, ese HTML entra en el modelo y el PDF deja de salir; un
// `<textarea>` por construcción solo puede devolver texto plano. Este componente
// no lee nunca el DOM para saber qué dice el documento: pinta desde `bloques` y
// cada edición vuelve por `onCambio` con un array nuevo
// (docs/interfaz-web.md §2.3, el riesgo nº 1 del proyecto).
//
// Lo único que sí se lee del DOM es la **selección** del campo, que no es
// contenido: es dónde tiene el cursor quien escribe, y sin ella los botones de
// formato no sabrían a qué trozo aplicarse.
//
// Los campos son controlados de React —su `value` sale del modelo— y el cursor
// no salta porque `aMarcas(aTramos(x)) === x` para cualquier x: lo que se pinta
// es exactamente lo que se escribió (ver bloques-cliente.js).
//
// LA BARRA DICE SOBRE QUÉ PÁRRAFO VA A ACTUAR
//
// Es la mitad del asunto, y lo que faltaba en el v1: unos botones que no dicen a
// quién le pegan no se distinguen de unos botones estropeados. El distintivo
// `.tb-donde` lleva un `aria-live`, así que quien use un lector de pantalla
// también se enteran del cambio de objetivo.
//
// POR QUÉ UNA BARRA POR CAMPO Y NO UNA POR APARTADO
//
// Un apartado puede tener varios campos de texto, y el prototipo tenía uno solo.
// Con una barra por apartado habría que decir además en qué campo está el
// cursor, que es más que lo que el distintivo puede contar en una línea. Con una
// barra por campo, «párrafo 3» no es ambiguo: es el tercer párrafo de ese campo.
//
// EL TECLADO NO ES UN EXTRA
//
// Ctrl+B / Ctrl+I, y Alt+N / Alt+C para quien venga de Word en español. Ctrl+N
// no se puede: el navegador se lo queda para abrir una ventana y no llega a la
// página; la barra lo avisa para no perder el rato probándolo. Y después de
// subir, bajar, borrar o añadir, el foco se va a donde tiene sentido seguir
// —el botón que acabas de pulsar, en su posición nueva, o el campo que acabas de
// crear— en lugar de volver al principio de la página, y lo que ha pasado se
// anuncia en una región `aria-live`.

'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { NIVEL_EDITOR, aMarcas, aTramos, aplicar, marcar } from './bloques-cliente';
import { Compartido, Tabla, Tramos } from './Valores';

// La clave de un campo dentro del editor: el par (bloque, elemento). Se guarda
// el par y no el nodo del DOM porque cualquier repintado tira el nodo.
const llave = (bloque, item) => `${bloque}:${item == null ? '' : item}`;

const ALTO_MINIMO = 32;

// El texto del botón N o C se escribe ADEMÁS en el campo con `setRangeText`,
// antes de meterlo en el modelo. No es leer el DOM ni decidir nada ahí: lo que
// se guarda sale de `marcar()`, que es pura. Es para no romper el Ctrl+Z del
// navegador, que es lo que hacía el prototipo y por el mismo motivo.
//
// Al repintar, React compara el `value` que toca con el que el campo ya tiene
// —y son el mismo, porque `aMarcas(aTramos(x)) === x`—, así que no lo vuelve a
// escribir y el deshacer del navegador conserva el paso. Si se dejara solo el
// modelo, React escribiría el `value` por su cuenta y ese paso desaparecería de
// la pila de deshacer.
function escribirEnElCampo(nodo, valor) {
  if (!nodo) return;
  if (typeof nodo.setRangeText === 'function') nodo.setRangeText(valor, 0, nodo.value.length, 'end');
  else nodo.value = valor;
}

function ajustarAlto(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = Math.max(el.scrollHeight, ALTO_MINIMO) + 'px';
}

// Ctrl+B / Ctrl+I, y Alt+N / Alt+C para quien tenga la costumbre española.
function atajoDeFormato(ev) {
  const k = String(ev.key || '').toLowerCase();
  const ctrl = ev.ctrlKey || ev.metaKey;
  const alt = ev.altKey && !ev.ctrlKey;
  if ((ctrl && k === 'b') || (alt && k === 'n')) return 'bold';
  if ((ctrl && k === 'i') || (alt && k === 'c')) return 'italics';
  return null;
}

// ---------------------------------------------------------------- la barra

function BarraFormato({ donde, onMarca, onAnadir, refBoton }) {
  // Al pulsar N o C el campo no debe perder el foco: si lo pierde se va la
  // selección y el botón parece estropeado, que es justo lo que pasaba en el v1.
  const sinRobarFoco = (ev) => ev.preventDefault();
  return (
    <div className="toolbar" role="group" aria-label="Formato y bloques del texto">
      <button
        type="button"
        className="tb tb-formato"
        onMouseDown={sinRobarFoco}
        onClick={() => onMarca('bold')}
        title="Negrita (Ctrl+B o Alt+N)"
        aria-keyshortcuts="Control+B Alt+N"
      >
        <strong>N</strong>
      </button>
      <button
        type="button"
        className="tb tb-formato"
        onMouseDown={sinRobarFoco}
        onClick={() => onMarca('italics')}
        title="Cursiva (Ctrl+I o Alt+C)"
        aria-keyshortcuts="Control+I Alt+C"
      >
        <em>C</em>
      </button>
      <span className="sep" aria-hidden="true" />
      <button
        type="button"
        className="tb"
        ref={(n) => refBoton('anadir-parrafo', n)}
        onClick={() => onAnadir('anadir-parrafo')}
      >
        + párrafo
      </button>
      <button
        type="button"
        className="tb"
        ref={(n) => refBoton('anadir-lista', n)}
        onClick={() => onAnadir('anadir-lista')}
      >
        + lista
      </button>
      <span className="sep" aria-hidden="true" />
      {/* Sobre qué va a actuar la barra. El `aria-live` es lo que hace que la
          respuesta a «¿a quién le pega esto?» llegue también sin mirar. */}
      <span className="tb-donde" aria-live="polite">{donde}</span>
      <span className="ayuda">
        Marcan lo seleccionado, o la palabra donde esté el cursor. Atajos{' '}
        <kbd>Ctrl</kbd>+<kbd>B</kbd> y <kbd>Ctrl</kbd>+<kbd>I</kbd>, o <kbd>Alt</kbd>+<kbd>N</kbd>{' '}
        y <kbd>Alt</kbd>+<kbd>C</kbd> (<kbd>Ctrl</kbd>+<kbd>N</kbd> no: es del navegador y abre una
        ventana nueva). Enlaces todavía no: el PDF no los pinta.
      </span>
    </div>
  );
}

// ---------------------------------------------------------------- un párrafo

function CajaParrafo({
  indice, total, bloque, refCampo, refBoton, onTexto, onOp, onFoco, onAtajo,
}) {
  const texto = aMarcas(bloque.text);
  const tramos = aTramos(texto);
  const etq = `párrafo ${indice + 1}`;

  return (
    <div className="bloque bloque-parrafo">
      <textarea
        className="campo"
        rows={3}
        value={texto}
        ref={(n) => refCampo(indice, null, n)}
        aria-label={`Párrafo ${indice + 1} de ${total}`}
        onChange={(ev) => onTexto(indice, null, ev.target.value)}
        onFocus={(ev) => onFoco(indice, null, ev.target)}
        onKeyUp={(ev) => onFoco(indice, null, ev.target)}
        onMouseUp={(ev) => onFoco(indice, null, ev.target)}
        onSelect={(ev) => onFoco(indice, null, ev.target)}
        onKeyDown={(ev) => onAtajo(ev, indice, null)}
      />
      <div className="bloque-acciones">
        <button
          type="button"
          className="mini"
          ref={(n) => refBoton('a-lista', indice, null, n)}
          onClick={() => onOp('a-lista', { bloque: indice })}
          aria-label={`Convertir el ${etq} en lista`}
          title="Convertir en lista"
        >
          • lista
        </button>
        <button
          type="button"
          className="mini"
          ref={(n) => refBoton('subir', indice, null, n)}
          onClick={() => onOp('subir', { bloque: indice })}
          disabled={indice === 0}
          aria-label={`Subir el ${etq}`}
          title="Subir"
        >
          ↑
        </button>
        <button
          type="button"
          className="mini"
          ref={(n) => refBoton('bajar', indice, null, n)}
          onClick={() => onOp('bajar', { bloque: indice })}
          disabled={indice >= total - 1}
          aria-label={`Bajar el ${etq}`}
          title="Bajar"
        >
          ↓
        </button>
        <button
          type="button"
          className="mini"
          onClick={() => onOp('quitar', { bloque: indice })}
          aria-label={`Borrar el ${etq}`}
          title="Eliminar el bloque"
        >
          ×
        </button>
      </div>
      {/* El párrafo ya formateado, debajo del campo, para no tener que
          imaginarse qué hacen las marcas. Solo sale cuando hay formato: una
          vista previa idéntica al campo es ruido. */}
      <div className="vista-previa" hidden={!Array.isArray(tramos)}>
        <span className="previa-etq">así saldrá</span>
        <Tramos valor={tramos} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- una lista

function CajaLista({
  indice, total, bloque, refCampo, refBoton, onTexto, onOp, onFoco, onAtajo,
}) {
  const items = bloque.items || [];
  const etq = `lista del bloque ${indice + 1}`;
  return (
    <>
      <ul className="bloque bloque-lista">
        {items.map((it, j) => (
          <li key={j} style={{ marginLeft: (it.level || 0) * 18 }}>
            <textarea
              className="campo campo-item"
              rows={1}
              value={aMarcas(it.text)}
              ref={(n) => refCampo(indice, j, n)}
              aria-label={`Elemento ${j + 1} de ${items.length} de la ${etq}`}
              onChange={(ev) => onTexto(indice, j, ev.target.value)}
              onFocus={(ev) => onFoco(indice, j, ev.target)}
              onKeyUp={(ev) => onFoco(indice, j, ev.target)}
              onMouseUp={(ev) => onFoco(indice, j, ev.target)}
              onSelect={(ev) => onFoco(indice, j, ev.target)}
              onKeyDown={(ev) => onAtajo(ev, indice, j)}
            />
            <span className="item-acciones">
              <button
                type="button"
                className="mini"
                ref={(n) => refBoton('sangrar', indice, j, n)}
                onClick={() => onOp('sangrar', { bloque: indice, item: j })}
                disabled={(it.level || 0) >= NIVEL_EDITOR}
                aria-label={`Más sangría en el elemento ${j + 1}`}
                title="Más sangría"
              >
                →
              </button>
              <button
                type="button"
                className="mini"
                ref={(n) => refBoton('desangrar', indice, j, n)}
                onClick={() => onOp('desangrar', { bloque: indice, item: j })}
                disabled={(it.level || 0) <= 0}
                aria-label={`Menos sangría en el elemento ${j + 1}`}
                title="Menos sangría"
              >
                ←
              </button>
              <button
                type="button"
                className="mini"
                onClick={() => onOp('quitar-item', { bloque: indice, item: j })}
                aria-label={`Quitar el elemento ${j + 1} de la ${etq}`}
                title="Quitar este elemento"
              >
                ×
              </button>
            </span>
          </li>
        ))}
      </ul>
      <div className="bloque-acciones">
        <button
          type="button"
          className="mini mini-add"
          ref={(n) => refBoton('anadir-item', indice, null, n)}
          onClick={() => onOp('anadir-item', { bloque: indice })}
        >
          + elemento
        </button>
        {/* Volver a párrafo, subir y bajar existen en el modelo desde el
            prototipo pero allí no tenían botón, así que una lista no se podía
            mover ni deshacer. Se añaden con las mismas operaciones: un botón que
            falta se lee como una limitación del formato, no como un hueco. */}
        <button
          type="button"
          className="mini"
          ref={(n) => refBoton('a-parrafo', indice, null, n)}
          onClick={() => onOp('a-parrafo', { bloque: indice })}
          aria-label={`Convertir la ${etq} en un párrafo`}
          title="Convertir en párrafo"
        >
          ¶ párrafo
        </button>
        <button
          type="button"
          className="mini"
          ref={(n) => refBoton('subir', indice, null, n)}
          onClick={() => onOp('subir', { bloque: indice })}
          disabled={indice === 0}
          aria-label={`Subir la ${etq}`}
          title="Subir"
        >
          ↑
        </button>
        <button
          type="button"
          className="mini"
          ref={(n) => refBoton('bajar', indice, null, n)}
          onClick={() => onOp('bajar', { bloque: indice })}
          disabled={indice >= total - 1}
          aria-label={`Bajar la ${etq}`}
          title="Bajar"
        >
          ↓
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- el editor

export default function EditorBloques({ bloques, compartidos, onCambio }) {
  const lista = Array.isArray(bloques) ? bloques : [];

  // A qué campo le pega la barra. Se guarda el par (bloque, elemento) y la
  // selección, no el nodo: cualquier repintado tira el nodo, y hay navegadores
  // que pierden la selección al quitarle el foco al campo.
  const [foco, setFoco] = useState(null);
  const [aviso, setAviso] = useState('');
  const seleccion = useRef(null);

  const campos = useRef(new Map());
  const botones = useRef(new Map());
  // Lo que hay que enfocar DESPUÉS de repintar: después de subir un párrafo el
  // nodo del DOM que había desaparece, así que el foco se pide por clave y se
  // resuelve cuando ya está pintado.
  const pendiente = useRef(null);

  const refCampo = (bloque, item, nodo) => {
    const k = llave(bloque, item);
    if (nodo) campos.current.set(k, nodo); else campos.current.delete(k);
  };
  const refBoton = (op, bloque, item, nodo) => {
    const k = op + '@' + llave(bloque, item);
    if (nodo) botones.current.set(k, nodo); else botones.current.delete(k);
  };
  // Los dos botones de la barra no cuelgan de ningún bloque.
  const refBotonBarra = (op, nodo) => refBoton(op, null, null, nodo);

  // Alto automático y foco pendiente, los dos después de pintar: el alto
  // necesita el `scrollHeight` del nodo ya con su texto dentro, y el foco
  // necesita que el nodo nuevo exista.
  useLayoutEffect(() => {
    for (const el of campos.current.values()) ajustarAlto(el);

    const p = pendiente.current;
    if (!p) return;
    pendiente.current = null;

    // Se prefiere el botón que se acaba de pulsar, en su posición nueva, para
    // poder volver a pulsarlo. Pero el botón puede haberse quedado
    // deshabilitado justo por lo que ha hecho —subir el párrafo que ahora es el
    // primero, sangrar hasta el tope—, y enfocar un botón deshabilitado no
    // enfoca nada: el teclado se quedaría sin sitio. En ese caso, al campo.
    let nodo = p.boton ? botones.current.get(p.boton) : null;
    let enCampo = !p.boton;
    if (p.boton && (!nodo || nodo.disabled)) {
      nodo = p.campo ? campos.current.get(p.campo) : null;
      enCampo = true;
    }
    if (!nodo && !p.boton) nodo = campos.current.get(p.campo);
    if (!nodo) return;

    if (typeof nodo.focus === 'function') nodo.focus();
    if (enCampo && typeof nodo.setSelectionRange === 'function') {
      const desde = p.desde == null ? nodo.value.length : p.desde;
      const hasta = p.hasta == null ? desde : p.hasta;
      nodo.setSelectionRange(desde, hasta);
    }
  });

  // --------------------------------------------------- escribir

  const cambiar = (op, args) => {
    const siguiente = aplicar(lista, op, args);
    if (siguiente !== lista) onCambio(siguiente);
    return siguiente;
  };

  const onTexto = (bloque, item, valor) => {
    cambiar(item == null ? 'texto' : 'texto-item', { bloque, item, valor });
  };

  // Dónde está el cursor. Se recuerda en cada foco, pulsación y clic porque la
  // barra lo necesita cuando el campo ya no lo tiene.
  const onFoco = (bloque, item, nodo) => {
    const k = llave(bloque, item);
    seleccion.current = {
      clave: k,
      desde: nodo && typeof nodo.selectionStart === 'number' ? nodo.selectionStart : 0,
      hasta: nodo && typeof nodo.selectionEnd === 'number' ? nodo.selectionEnd : 0,
    };
    setFoco((previo) => (previo && previo.bloque === bloque && previo.item === item
      ? previo
      : { bloque, item }));
  };

  // --------------------------------------------------- negrita y cursiva

  const textoDe = (bloque, item) => {
    const b = lista[bloque];
    if (!b) return null;
    if (item == null) return b.type === 'p' ? aMarcas(b.text) : null;
    const it = (b.items || [])[item];
    return it ? aMarcas(it.text) : null;
  };

  // El primer campo editable, para cuando se pulsa N sin haber puesto el cursor
  // en ninguno: hacer nada sería indistinguible de un botón roto.
  const primerCampo = () => {
    for (let i = 0; i < lista.length; i += 1) {
      const b = lista[i];
      if (b && b.type === 'p') return { bloque: i, item: null };
      if (b && b.type === 'list' && (b.items || []).length) return { bloque: i, item: 0 };
    }
    return null;
  };

  const aplicarMarca = (tipo) => {
    const destino = (foco && textoDe(foco.bloque, foco.item) != null) ? foco : primerCampo();
    if (!destino) {
      setAviso('No hay ningún párrafo todavía: añade uno con «+ párrafo».');
      return;
    }
    const k = llave(destino.bloque, destino.item);
    const texto = textoDe(destino.bloque, destino.item);
    const nodo = campos.current.get(k);

    let desde = nodo && typeof nodo.selectionStart === 'number' ? nodo.selectionStart : 0;
    let hasta = nodo && typeof nodo.selectionEnd === 'number' ? nodo.selectionEnd : desde;
    // Si el campo ha perdido la selección al quitarle el foco, vale la que se
    // guardó: sin esto el botón marcaría la palabra donde quedó el cursor en
    // lugar de lo que se había seleccionado.
    const c = seleccion.current;
    if (c && c.clave === k && desde === hasta && c.desde !== c.hasta) {
      desde = c.desde;
      hasta = c.hasta;
    }

    const r = marcar(texto, desde, hasta, tipo);
    escribirEnElCampo(nodo, r.valor);
    onTexto(destino.bloque, destino.item, r.valor);
    // Se devuelve la selección a donde estaba para poder pulsar N y C seguidos.
    pendiente.current = { campo: k, desde: r.desde, hasta: r.hasta };
    seleccion.current = { clave: k, desde: r.desde, hasta: r.hasta };
    setFoco(destino);
    const nombre = tipo === 'bold' ? 'Negrita' : 'Cursiva';
    setAviso(`${nombre} ${r.puesta ? 'puesta' : 'quitada'}.`);
  };

  const onAtajo = (ev, bloque, item) => {
    const tipo = atajoDeFormato(ev);
    if (!tipo) return;
    ev.preventDefault();
    onFoco(bloque, item, ev.target);
    // El foco de React es asíncrono; la marca se aplica con el destino que ya
    // se conoce aquí, sin esperar a que el estado se actualice.
    const k = llave(bloque, item);
    const texto = textoDe(bloque, item);
    if (texto == null) return;
    const nodo = ev.target;
    const desde = typeof nodo.selectionStart === 'number' ? nodo.selectionStart : 0;
    const hasta = typeof nodo.selectionEnd === 'number' ? nodo.selectionEnd : desde;
    const r = marcar(texto, desde, hasta, tipo);
    escribirEnElCampo(nodo, r.valor);
    onTexto(bloque, item, r.valor);
    pendiente.current = { campo: k, desde: r.desde, hasta: r.hasta };
    seleccion.current = { clave: k, desde: r.desde, hasta: r.hasta };
    const nombre = tipo === 'bold' ? 'Negrita' : 'Cursiva';
    setAviso(`${nombre} ${r.puesta ? 'puesta' : 'quitada'}.`);
  };

  // --------------------------------------------------- mover, borrar, añadir
  //
  // Después de cada una, el foco se va a donde tiene sentido seguir y lo que ha
  // pasado se anuncia: con el ratón se ve, con el teclado no, y un botón que
  // mueve el párrafo y pierde el foco obliga a tabular desde arriba otra vez
  // para volver a pulsarlo.
  const onOp = (op, args) => {
    const siguiente = cambiar(op, args);
    if (siguiente === lista) return;
    const b = args && args.bloque;

    if (op === 'subir' || op === 'bajar') {
      const nuevo = op === 'subir' ? b - 1 : b + 1;
      pendiente.current = {
        boton: op + '@' + llave(nuevo, null),
        campo: llave(nuevo, siguiente[nuevo].type === 'list' ? 0 : null),
      };
      setAviso(`Bloque ${b + 1} ${op === 'subir' ? 'subido' : 'bajado'} a la posición ${nuevo + 1}.`);
      setFoco(null);
    } else if (op === 'quitar') {
      const quedan = siguiente.length;
      const destino = Math.min(b, quedan - 1);
      pendiente.current = quedan
        ? { campo: llave(destino, siguiente[destino].type === 'list' ? 0 : null) }
        : { boton: 'anadir-parrafo@' + llave(null, null) };
      setAviso(`Bloque ${b + 1} borrado. Quedan ${quedan}.`);
      setFoco(null);
    } else if (op === 'quitar-item') {
      const bloqueSigue = !!siguiente[b] && siguiente[b].type === 'list';
      pendiente.current = bloqueSigue
        ? { campo: llave(b, Math.max(0, Math.min(args.item, siguiente[b].items.length - 1))) }
        : { boton: 'anadir-parrafo@' + llave(null, null) };
      setAviso('Elemento quitado de la lista.');
    } else if (op === 'a-lista') {
      pendiente.current = { campo: llave(b, 0) };
      setAviso(`El párrafo ${b + 1} es ahora una lista de ${siguiente[b].items.length} elementos.`);
      setFoco({ bloque: b, item: 0 });
    } else if (op === 'a-parrafo') {
      pendiente.current = { campo: llave(b, null) };
      setAviso(`La lista del bloque ${b + 1} es ahora un párrafo.`);
      setFoco({ bloque: b, item: null });
    } else if (op === 'anadir-parrafo') {
      pendiente.current = { campo: llave(siguiente.length - 1, null) };
      setAviso(`Párrafo ${siguiente.length} añadido al final.`);
      setFoco({ bloque: siguiente.length - 1, item: null });
    } else if (op === 'anadir-lista') {
      pendiente.current = { campo: llave(siguiente.length - 1, 0) };
      setAviso(`Lista añadida al final, en el bloque ${siguiente.length}.`);
      setFoco({ bloque: siguiente.length - 1, item: 0 });
    } else if (op === 'anadir-item') {
      const n = siguiente[b].items.length;
      pendiente.current = { campo: llave(b, n - 1) };
      setAviso(`Elemento ${n} añadido a la lista.`);
      setFoco({ bloque: b, item: n - 1 });
    } else if (op === 'sangrar' || op === 'desangrar') {
      pendiente.current = {
        boton: op + '@' + llave(b, args.item),
        campo: llave(b, args.item),
      };
      const nivel = siguiente[b].items[args.item].level || 0;
      setAviso(`Elemento ${args.item + 1} en el nivel ${nivel + 1}.`);
    }
  };

  // --------------------------------------------------- qué dice el distintivo

  const etiquetaFoco = () => {
    if (!foco || textoDe(foco.bloque, foco.item) == null) return 'pon el cursor en un párrafo';
    if (foco.item != null) return `elemento ${foco.item + 1} de la lista del bloque ${foco.bloque + 1}`;
    return `párrafo ${foco.bloque + 1}`;
  };

  // --------------------------------------------------- pintado

  return (
    <>
      <BarraFormato
        donde={etiquetaFoco()}
        onMarca={aplicarMarca}
        onAnadir={(op) => onOp(op, {})}
        refBoton={refBotonBarra}
      />

      {/* La región que cuenta lo que ha pasado existe siempre, aunque esté
          vacía: un `aria-live` que aparece con su texto dentro no se anuncia de
          forma fiable. Lo mismo que hace Personas.js. */}
      <div className="sr" role="status" aria-live="polite">{aviso}</div>

      {!lista.length ? (
        <p className="vacio-apartado">
          Este campo está vacío. Empieza con <em>+ párrafo</em> ahí arriba.
        </p>
      ) : (
        <div className="bloques">
          {lista.map((b, i) => {
            if (b && typeof b.ref === 'string') {
              // Un texto compartido se escribe una vez para todas las unidades,
              // así que no se edita desde aquí: hace falta
              // `POST .../compartidos/[cid]`, que es de otro evolutivo.
              return (
                <div key={i}>
                  <Compartido cid={b.ref} compartidos={compartidos} />
                  <p className="ayuda">
                    Se escribe una vez para todas las unidades: editarlo y desvincularlo llegan con
                    la pantalla de textos compartidos.
                  </p>
                </div>
              );
            }
            if (b && b.type === 'list') {
              return (
                <CajaLista
                  key={i}
                  indice={i}
                  total={lista.length}
                  bloque={b}
                  refCampo={refCampo}
                  refBoton={refBoton}
                  onTexto={onTexto}
                  onOp={onOp}
                  onFoco={onFoco}
                  onAtajo={onAtajo}
                />
              );
            }
            if (b && b.type === 'p') {
              return (
                <CajaParrafo
                  key={i}
                  indice={i}
                  total={lista.length}
                  bloque={b}
                  refCampo={refCampo}
                  refBoton={refBoton}
                  onTexto={onTexto}
                  onOp={onOp}
                  onFoco={onFoco}
                  onAtajo={onAtajo}
                />
              );
            }
            if (b && b.type === 'tabla') return <Tabla key={i} filas={b.filas} etiqueta={b.etiqueta} />;
            // Un bloque de un tipo que este editor no conoce se enseña y no se
            // toca: convertirlo en párrafo le cambiaría el `type` y lo que sale
            // en el PDF. Si aparece alguno, es que hace falta su editor.
            return (
              <details className="tarjeta fidelidad" key={i}>
                <summary>Bloque «{(b && b.type) || 'sin tipo'}» · este editor no lo sabe editar</summary>
                <pre>{JSON.stringify(b, null, 1)}</pre>
              </details>
            );
          })}
        </div>
      )}
    </>
  );
}
