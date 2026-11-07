// El árbol de apartados: `role="tree"` de verdad, con teclado y foco gobernado.
//
// Es el punto en el que más fácil es perder trabajo al portar el prototipo, así
// que está escrito como está a propósito:
//
//  · `role="tree"` / `role="group"` / `role="treeitem"`, con `aria-expanded` solo
//    en los nodos que tienen hijos y `aria-selected` en todos.
//  · Flechas arriba y abajo para moverse por lo que está a la vista, derecha
//    para abrir (y, si ya estaba abierto, bajar al primer hijo), izquierda para
//    cerrar (y, si ya estaba cerrado, subir al padre), Inicio y Fin para los
//    extremos, Enter y Espacio para entrar.
//  · **Foco gobernado** (roving tabindex): un solo nodo tabulable en todo el
//    árbol, así que el tabulador no se come 250 paradas para llegar al
//    contenido. El resto son `tabindex="-1"` y se alcanzan con las flechas.
//  · El estado NO se codifica solo por color: manda el color, y la forma va de
//    respaldo (anillo punteado, medio relleno, relleno), y además va escrito en
//    el `aria-label`, que es lo único que oye quien no ve ni el color ni la
//    forma. En el v1 no había nada de esto.
//
// La lista de nodos a la vista se calcula de los datos y no del DOM: con el
// buscador puesto y ramas plegadas, preguntarle al DOM qué se ve es preguntarle
// a React por un estado que él ya tiene.

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { coincide } from './arbol-cliente';
import { GLIFO, NOMBRE_ESTADO, codigoDeUnidad } from './etiquetas';

const Candado = () => (
  <svg viewBox="0 0 24 24" className="ico-mini">
    <rect x="5" y="11" width="14" height="9" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" strokeWidth="1.8" />
  </svg>
);

export default function Arbol({
  arbol, estados, indice, abiertos, activa, busqueda, onIr, onAlternar,
}) {
  const contenedor = useRef(null);
  const [tabulable, setTabulable] = useState(activa);
  // El token hace que pedir el foco en la misma clave dos veces seguidas vuelva
  // a ejecutarse: sin él, abrir una rama y volver a pedir el foco donde ya está
  // no haría nada y el foco se quedaría en el documento.
  const [pedido, setPedido] = useState(null);

  const q = (busqueda || '').trim().toLowerCase();

  // Con el buscador puesto, las ramas que coinciden se despliegan solas: si no,
  // el resultado está dentro de algo plegado y no se ve.
  const estaAbierto = (nodo) => abiertos.has(nodo.clave) || (!!q && (nodo.hijos || []).length > 0);

  // Lo que está a la vista, en orden: es la lista por la que se mueven las
  // flechas y la que usan Inicio y Fin.
  const visibles = useMemo(() => {
    const out = [];
    (function rec(nodos) {
      for (const nodo of nodos) {
        if (!coincide(nodo, q)) continue;
        out.push(nodo.clave);
        if ((nodo.hijos || []).length && estaAbierto(nodo)) rec(nodo.hijos);
      }
    })(arbol.hijos || []);
    return out;
  }, [arbol, abiertos, q]);

  useEffect(() => { setTabulable(activa); }, [activa]);

  // UN NODO TABULABLE SIEMPRE, PASE LO QUE PASE
  //
  // El foco gobernado deja un solo nodo con `tabindex="0"` y pone los demás a
  // -1. Si ese nodo no está pintado, el árbol entero se queda sin ninguna parada
  // del tabulador y no hay forma de llegar a él con el teclado. Pasa en dos
  // casos que no son raros: en la portada del documento, donde el nodo activo es
  // la raíz y la raíz no se pinta, y con el buscador puesto, cuando el apartado
  // en el que estabas no coincide con lo que has escrito. Así que si el nodo
  // activo no está a la vista, el primero de la lista hace de puerta.
  const tabulableReal = visibles.includes(tabulable) ? tabulable : visibles[0];

  useEffect(() => {
    if (!pedido || !contenedor.current) return;
    const el = contenedor.current.querySelector(`[data-clave="${CSS.escape(pedido.clave)}"]`);
    if (el) el.focus();
  }, [pedido]);

  const enfocar = (clave) => {
    if (!clave) return;
    setTabulable(clave);
    setPedido((p) => ({ clave, token: (p ? p.token : 0) + 1 }));
  };

  function teclado(ev) {
    const li = ev.target.closest('[role="treeitem"]');
    if (!li) return;
    const clave = li.dataset.clave;
    const entrada = indice.get(clave);
    const nodo = entrada && entrada.nodo;
    const i = visibles.indexOf(clave);
    const salto = (n) => { if (visibles[n]) enfocar(visibles[n]); };

    switch (ev.key) {
      case 'ArrowDown': ev.preventDefault(); salto(i + 1); break;
      case 'ArrowUp': ev.preventDefault(); salto(i - 1); break;
      case 'Home': ev.preventDefault(); salto(0); break;
      case 'End': ev.preventDefault(); salto(visibles.length - 1); break;
      case 'ArrowRight':
        ev.preventDefault();
        if (!nodo || !(nodo.hijos || []).length) break;
        if (!estaAbierto(nodo)) { onAlternar(clave, true); enfocar(clave); }
        else if (nodo.hijos[0]) enfocar(nodo.hijos[0].clave);
        break;
      case 'ArrowLeft': {
        ev.preventDefault();
        if (nodo && (nodo.hijos || []).length && estaAbierto(nodo)) {
          onAlternar(clave, false);
          enfocar(clave);
          break;
        }
        const padre = entrada && entrada.camino[entrada.camino.length - 2];
        // La raíz no se pinta, así que subir desde un nodo de primer nivel no
        // lleva a ningún sitio: el foco se queda donde está.
        if (padre && padre.tipo !== 'raiz') enfocar(padre.clave);
        break;
      }
      case 'Enter':
      case ' ':
        ev.preventDefault();
        onIr(clave);
        enfocar(clave);
        break;
      default: break;
    }
  }

  function clic(ev) {
    const li = ev.target.closest('[role="treeitem"]');
    if (!li) return;
    const clave = li.dataset.clave;
    // El triángulo pliega y despliega sin cambiar de apartado: es como se mira
    // qué hay dentro de un módulo sin perder lo que estás leyendo.
    if (ev.target.closest('.twisty')) { onAlternar(clave); return; }
    onIr(clave);
  }

  const fila = (nodo, nivel) => {
    if (!coincide(nodo, q)) return null;
    const est = estados.get(nodo.clave) || {};
    const conHijos = (nodo.hijos || []).length > 0;
    const abierto = estaAbierto(nodo);
    const esActiva = nodo.clave === activa;
    const codigo = nodo.tipo === 'unidad' ? codigoDeUnidad(nodo.unidadId) : null;

    // El estado y el candado van en el nombre accesible del nodo: es el único
    // canal que le queda a quien no distingue el color ni ve la forma.
    const etiqueta = [
      nodo.num || '',
      nodo.titulo,
      est.agregado ? '— ' + NOMBRE_ESTADO[est.agregado] : '',
      est.bloqueado ? ', solo lectura' : '',
    ].filter(Boolean).join(' ');

    return (
      <li
        key={nodo.clave}
        role="treeitem"
        className={'nodo' + (esActiva ? ' activa' : '')}
        data-clave={nodo.clave}
        aria-selected={esActiva}
        aria-expanded={conHijos ? abierto : undefined}
        aria-label={etiqueta}
        tabIndex={nodo.clave === tabulableReal ? 0 : -1}
        onFocus={() => setTabulable(nodo.clave)}
      >
        <span className="fila" style={{ '--nivel': nivel }}>
          <span className="twisty" aria-hidden="true">{conHijos ? '▸' : ''}</span>
          {nodo.num ? <span className="num">{nodo.num}</span> : null}
          <span className="etq">{nodo.titulo}</span>
          {codigo ? (
            <span
              className="distintivo distintivo-cod"
              title={codigo.confirmado ? 'Código del módulo en el real decreto del título' : 'Código sin confirmar contra la normativa'}
            >
              {codigo.texto}
            </span>
          ) : null}
          {est.bloqueado ? (
            <span className="candado" aria-hidden="true" title="Solo lectura"><Candado /></span>
          ) : null}
          <span
            className={'glifo glifo-' + (est.agregado || '')}
            aria-hidden="true"
            title={NOMBRE_ESTADO[est.agregado] || ''}
          >
            {GLIFO[est.agregado] || ''}
          </span>
        </span>
        {conHijos ? (
          <ul role="group" className={'grupo' + (abierto ? '' : ' cerrado')}>
            {nodo.hijos.map((h) => fila(h, nivel + 1))}
          </ul>
        ) : null}
      </li>
    );
  };

  return (
    <nav className="arbol-cont" ref={contenedor} onClick={clic} onKeyDown={teclado}>
      <ul role="tree" aria-label="Estructura del documento">
        {(arbol.hijos || []).map((h) => fila(h, 0))}
      </ul>
    </nav>
  );
}
