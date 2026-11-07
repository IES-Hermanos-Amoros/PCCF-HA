// Quién soy, en el navegador, y cómo se sale.
//
// POR QUÉ SE PREGUNTA Y NO SE LEE
//
// En el E1 la persona se elegía en un desplegable y viajaba en la cookie
// `persona`, que el cliente leía con `document.cookie`: cualquiera podía
// ponérsela y ser quien quisiera. Desde el E2 la identidad va en la cookie de
// sesión, que es `HttpOnly` —ningún JavaScript de la página la ve, que es
// justamente el punto (app/_lib/sesion.js)—, así que la interfaz no puede
// deducir quién es: lo PREGUNTA a `GET /api/sesion` y contesta el servidor, que
// es quien decide.
//
// Lo que llega es `{ persona: { _id, nombre, email, rol, departamento }, sesion }`.
// El rol se usa solo para pintar —el nombre, la etiqueta, qué enlaces se
// ofrecen—: cada ruta vuelve a comprobar los permisos con core/permisos.js, y un
// cliente que se invente el rol solo se miente a sí mismo.
//
// SIN SESIÓN NO ES UN ERROR
//
// El 401 `sin_identificar` es la respuesta normal de quien todavía no ha
// entrado, así que no se devuelve como error: se devuelve `persona: null` y la
// pantalla explica cómo se entra (ComoSeEntra.js). `error` queda para lo que de
// verdad ha fallado —el servidor caído, un 500—, que es otra pantalla distinta.

'use client';

import { useEffect, useState } from 'react';
import { pedir } from './api';

export function useSesion() {
  const [estado, setEstado] = useState({ cargando: true, persona: null, sesion: null, error: null });

  useEffect(() => {
    let vivo = true;
    pedir('/api/sesion')
      .then((r) => {
        if (vivo) setEstado({ cargando: false, persona: r.persona || null, sesion: r.sesion || null, error: null });
      })
      .catch((e) => {
        if (!vivo) return;
        const sinSesion = e.codigo === 'sin_identificar';
        setEstado({ cargando: false, persona: null, sesion: null, error: sinSesion ? null : e });
      });
    return () => { vivo = false; };
  }, []);

  return estado;
}

// Cerrar sesión es una llamada a la API, no borrar una cookie: `DELETE
// /api/sesion` REVOCA la fila de la sesión, y eso es lo que hace que «he
// cerrado sesión» sea verdad aunque alguien hubiera copiado la cookie antes.
// Borrarla por nuestra cuenta tampoco se puede: es `HttpOnly`.
//
// Después se navega a la portada con una carga completa, no con el enrutador:
// salir cambia la respuesta de TODAS las rutas a la vez, y volver a pedir cada
// cosa a mano es la forma de quedarse con media pantalla pintada con los
// permisos del anterior.
export async function cerrarSesion() {
  try {
    await pedir('/api/sesion', { method: 'DELETE' });
  } catch (e) {
    // Salir es idempotente en el servidor (devuelve 200 aunque no hubiera
    // sesión), así que si esto falla es que no hay red: se va a la portada
    // igualmente, que es lo único que se quería conseguir.
  }
  window.location.assign('/');
}

// ---------------------------------------------------------------- el enlace que se copia

// El alta y el «vuelve a invitar» devuelven un enlace a `GET /api/acceso?t=…`,
// que canjea y redirige sin pantalla ninguna. Funciona, pero cuando el enlace ya
// no sirve responde el JSON del error en bruto, y eso no es una pantalla: las
// cuatro situaciones (usado, anulado, caducado, nunca existió) se arreglan de
// forma distinta y quien las lee necesita saber cuál es.
//
// Así que lo que se copia apunta a `/acceso?t=…`, que es la pantalla de este
// evolutivo y la que hace el POST. Es el remate que el propio módulo de la API
// anticipa: «cuando exista [la interfaz], el enlace apuntará a ella y ella hará
// el POST» (app/_lib/rutas/acceso.js, app/_lib/invitaciones.js → CAMINO_ACCESO).
//

