// LA AYUDA PLEGADA: un botón pequeño junto al título que despliega el texto ahí
// mismo.
//
// POR QUÉ EXISTE
//
// Cuando todo el texto explicativo tiene el mismo peso —la misma cajita con
// filo, el mismo cuerpo pequeño, estés tocando algo o no—, deja de parecer
// ayuda y pasa a ser ruido: se lee una vez y a partir de ahí se salta entero,
// incluido el que sí importaba. El caso claro es la tarjeta de estructura: que
// un apartado de módulo sea la plantilla de los once es cierto y hay que
// decirlo, pero no con un bloque grande, siempre igual y aunque no se esté
// tocando nada.
//
// LA REGLA QUE SE APLICA, Y QUE NO ES «ESCONDERLO TODO»
//
//  1. **Aviso de consecuencia** —«esto sale en los once módulos», «retirar no
//     borra», «se perderá lo escrito»—: no se pliega. Sigue visible y con su
//     peso. Un aviso que llega tarde es peor que el ruido.
//  2. **Explicación de un dato que está en pantalla** —por qué el progreso dice
//     1 %, qué es «enlace sin usar»—: se queda visible, en una línea corta. El
//     dato sorprende cada vez que se ve; lo que sobra es la longitud, no la
//     explicación.
//  3. **Prosa de referencia** —siempre cierta, no cambia con los datos, y una
//     vez la sabes no la necesitas—: esta es la que se pliega aquí.
//
// Esto lo usa gente que siempre es principiante: el departamento toca su
// programación dos o tres veces al año. Esconder de más es el error contrario y
// es peor, porque no se nota hasta que alguien se equivoca.
//
// CÓMO SE USA
//
//   <header className="tarjeta-cab">
//     <h2>Estructura</h2>
//     <Ayuda sobre="la estructura del documento">
//       <p>…prosa de referencia…</p>
//     </Ayuda>
//   </header>
//
// El botón se queda en la fila del título —no roba una línea— y el panel cae
// debajo, dentro de la misma cabecera, porque `.tarjeta-cab` ya es un flex con
// `wrap` y el panel pide el ancho entero. Lo mismo vale en `.toolbar` y en
// `.linea-estructura`, que también lo son.

'use client';

import { useEffect, useId, useState } from 'react';

// LA PREFERENCIA ES UNA SOLA PARA TODA LA APLICACIÓN, no una por tarjeta.
//
// Quien quiere la ayuda a la vista la quiere a la vista, no quiere abrirla en
// cada pantalla: en cuanto despliega una, se despliegan todas y así se queda
// hasta que la cierre. Es la diferencia entre un pliegue y un modo de lectura, y
// aquí lo que hace falta es el modo.
const CLAVE = 'ayuda-a-la-vista';

// El valor que vale ahora en esta pestaña, y los componentes montados que hay
// que avisar cuando cambie: sin esto, desplegar una tarjeta dejaría a las demás
// de la misma pantalla como estaban, que es justo lo contrario de un modo.
let aLaVista = false;
let leida = false;
const oyentes = new Set();

// `localStorage` puede no estar —ventana privada, permisos del navegador—, así
// que se lee en un `try` y si falla la pantalla funciona igual: la ayuda
// arranca plegada, que es el estado por omisión. Mismo trato que el tema en
// BarraSuperior.js y en layout.js.
function leer() {
  if (leida) return aLaVista;
  leida = true;
  try {
    aLaVista = localStorage.getItem(CLAVE) === 'si';
  } catch (e) { /* sin localStorage: se queda plegada */ }
  return aLaVista;
}

function guardar(valor) {
  aLaVista = valor;
  leida = true;
  try {
    localStorage.setItem(CLAVE, valor ? 'si' : 'no');
  } catch (e) { /* sin localStorage: vale para esta pestaña y nada más */ }
  oyentes.forEach((avisar) => avisar(valor));
}

export default function Ayuda({ sobre, children }) {
  // Arranca plegada también en el servidor: el primer pintado tiene que ser el
  // mismo en los dos lados, y la preferencia solo se puede leer en el navegador.
  const [abierta, setAbierta] = useState(false);
  const base = useId();
  const idBoton = `ayuda-btn-${base}`;
  const idPanel = `ayuda-panel-${base}`;

  useEffect(() => {
    setAbierta(leer());
    const avisar = (valor) => setAbierta(valor);
    oyentes.add(avisar);
    return () => { oyentes.delete(avisar); };
  }, []);

  return (
    <>
      {/* El nombre accesible dice QUÉ ayuda es y sobre qué: un «?» que el lector
          de pantalla anuncia como «botón» no sirve de nada. No cambia al
          abrirse —eso ya lo dice `aria-expanded`—, para no anunciarlo dos
          veces. Es un <button>, así que funciona con el teclado sin más. */}
      <button
        type="button"
        className="btn-ayuda"
        id={idBoton}
        aria-expanded={abierta}
        aria-controls={idPanel}
        onClick={() => guardar(!abierta)}
      >
        <span aria-hidden="true">?</span>
        <span className="sr">{`Ayuda sobre ${sobre}`}</span>
      </button>

      {/* `hidden` y no una clase: plegado no ocupa sitio Y no está en el árbol
          de accesibilidad, que es lo que hace que no se lea dos veces. El texto
          queda asociado a lo que explica por el `aria-labelledby`, que apunta al
          botón —«Ayuda sobre la estructura del documento»—, y por estar dentro
          de la cabecera del apartado al que pertenece. */}
      <div
        className="ayuda-panel"
        id={idPanel}
        role="group"
        aria-labelledby={idBoton}
        hidden={!abierta}
      >
        {children}
      </div>
    </>
  );
}
