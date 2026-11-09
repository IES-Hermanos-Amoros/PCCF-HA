// EL FOCO DE UNA CONFIRMACIÓN EN DOS PASOS, escrito una sola vez.
//
// Las tres confirmaciones de la aplicación —quitar un campo, retirar un apartado, borrar para
// siempre— tenían cada una su `useEffect` para llevar el foco, parecidos pero no iguales: tres
// sitios donde podía estar mal. Este gancho es el único, y la decisión de a quién le toca el foco
// no está aquí sino en core/confirmar.js, que es puro y tiene sus pruebas (test/core.js). Aquí
// solo queda lo que no se puede probar sin navegador: el `focus()`.
//
// CÓMO SE USA
//
//   const c = useConfirmacion();
//   …
//   {c.estaAbierta(x.id) ? (
//     <button ref={c.refPaso} onClick={async () => { await borrar(x); c.terminar(); }}>sí</button>
//     <button onClick={c.cancelar}>cancelar</button>
//   ) : (
//     <button ref={c.refAbrir(x.id)} onClick={() => c.abrir(x.id)}>quitar…</button>
//   )}
//   <p ref={c.refAviso} tabIndex={-1} role="status">{aviso}</p>
//
// `refAbrir` LLEVA LA CLAVE DE LA FILA porque una lista tiene un botón de abrir por fila y solo una
// confirmación abierta: al cancelar, el foco tiene que volver al botón de ESA fila y no al de la
// última que se pintó.
//
// EL AVISO VA FUERA DE LA FILA, en el componente que pinta la lista. Al terminar, la fila
// desaparece —ya no hay campo que quitar, ya no hay apartado retirado—, y si el aviso estuviera
// dentro se iría con ella: ni se anunciaría ni habría dónde dejar el foco.

'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import Confirmar from '../../core/confirmar';

// La clave de una confirmación que es la única de su componente (retirar un apartado, borrar este
// apartado): no hace falta distinguir filas, pero el gancho es el mismo.
const SOLA = 'sola';

export default function useConfirmacion() {
  // Qué fila tiene la confirmación abierta, o null. Es lo único que pinta distinto.
  const [abierta, setAbierta] = useState(null);

  // Los botones de abrir, uno por fila; el paso y el aviso, uno solo: no hay dos confirmaciones
  // abiertas a la vez y el aviso es de la lista entera.
  const botonesDeAbrir = useRef(new Map());
  const paso = useRef(null);
  const aviso = useRef(null);
  // El gesto que todavía no ha movido el foco, y la fila a la que pertenece.
  const gesto = useRef(null);
  const fila = useRef(null);

  // Se mueve el foco en `useLayoutEffect` y no en el propio manejador porque el elemento que lo
  // tiene que recibir aparece con el repintado: antes de eso no está en el árbol y `focus()` no
  // hace nada. Sin lista de dependencias a propósito: el gesto se consume en el primer repintado
  // que haya, venga del estado de aquí o del de quien nos pinta.
  useLayoutEffect(() => {
    const g = gesto.current;
    if (!g) return;
    gesto.current = null;
    const elementos = {
      abrir: botonesDeAbrir.current.get(fila.current) || null,
      paso: paso.current,
      aviso: aviso.current,
    };
    const hay = {
      abrir: !!elementos.abrir, paso: !!elementos.paso, aviso: !!elementos.aviso,
    };
    const destino = Confirmar.foco(g, hay);
    const nodo = destino ? elementos[destino] : null;
    if (nodo && typeof nodo.focus === 'function') nodo.focus();
  });

  const refAbrir = (clave = SOLA) => (nodo) => {
    if (nodo) botonesDeAbrir.current.set(clave, nodo);
    else botonesDeAbrir.current.delete(clave);
  };

  return {
    abierta,
    estaAbierta: (clave = SOLA) => abierta !== null && abierta === clave,
    abrir: (clave = SOLA) => { fila.current = clave; gesto.current = 'abrir'; setAbierta(clave); },
    cancelar: () => { gesto.current = 'cancelar'; setAbierta(null); },
    // Cerrar SIN tocar el foco. Es para la confirmación cuya pantalla se va entera con el cambio
    // —retirar el apartado que se está mirando—: ahí no hay a dónde llevarlo, el aviso lo da la
    // pantalla siguiente, y mandarlo a una región vacía que además está fuera de la vista es peor
    // que dejarlo donde está.
    cerrar: () => { gesto.current = null; setAbierta(null); },
    // Se llama cuando el cambio ya ha salido bien, junto con el aviso: así el aviso que recibe el
    // foco ya dice lo que ha pasado. Quien no tiene paso ni botón de abrir —el componente que solo
    // pinta la lista y el aviso— lo usa igual, y el foco se va al aviso.
    terminar: () => { gesto.current = 'terminar'; setAbierta(null); },
    refAbrir,
    refPaso: (nodo) => { paso.current = nodo; },
    refAviso: (nodo) => { aviso.current = nodo; },
  };
}
