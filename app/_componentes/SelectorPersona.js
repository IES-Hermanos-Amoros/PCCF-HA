// Con quién se está trabajando, mientras no haya autenticación.
//
// ESTO NO ES UN INICIO DE SESIÓN, Y TIENE QUE NOTARSE
//
// La identidad llega en el E2 (docs/plan.md §2.5). Hasta entonces se elige una
// persona de `GET /api/personas` y la elección se guarda en la cookie `persona`,
// que es lo que lee `app/_lib/usuario.js`. No hay contraseña, no hay sesión y
// cualquiera puede elegir a cualquiera: si esta pantalla se pareciera a un
// inicio de sesión, alguien creería que la herramienta autentica a la gente y
// que lo que escriba cada uno está atribuido de verdad. Así que se dice en voz
// alta, con el texto de `AVISO` y con un distintivo al lado del desplegable, y
// no se usa en ningún momento la palabra «entrar».
//
// Los permisos, en cambio, SÍ son de verdad desde el primer día: los comprueba
// el servidor con core/permisos.js a partir de esta cookie, y el cliente solo
// refleja el candado. Que la persona sea de mentira no hace de mentira la regla.

'use client';

export const AVISO = 'No es un inicio de sesión: mientras no haya autenticación se elige con quién '
  + 'se trabaja y la elección se guarda en una cookie de este navegador. No hay contraseñas y '
  + 'cualquiera puede elegir a cualquiera. Las personas de la lista son inventadas.';

export const COOKIE = 'persona';

export function personaDeLaCookie() {
  if (typeof document === 'undefined') return null;
  for (const trozo of document.cookie.split(';')) {
    const i = trozo.indexOf('=');
    if (i === -1) continue;
    if (trozo.slice(0, i).trim() === COOKIE) return decodeURIComponent(trozo.slice(i + 1).trim()) || null;
  }
  return null;
}

// Medio año: lo que dura un curso escolar largo. No es `session` porque abrir y
// cerrar el navegador no debería hacerte perder con quién estabas trabajando.
export function elegirPersona(id) {
  document.cookie = `${COOKIE}=${encodeURIComponent(id)}; path=/; max-age=${60 * 60 * 24 * 180}; samesite=lax`;
  // Se recarga en lugar de volver a pedir cada cosa: cambiar de persona cambia
  // qué documentos se ven y qué apartados tienen candado, o sea la respuesta de
  // todas las rutas a la vez. Volver a pedirlo todo a mano es la forma de que se
  // quede una pantalla pintada con los permisos del anterior.
  window.location.reload();
}

const Icono = () => (
  <svg viewBox="0 0 24 24" className="ico" aria-hidden="true">
    <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 9a8 8 0 0 1 16 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

export default function SelectorPersona({ personas, personaId, roles }) {
  const actual = (personas || []).find((p) => p._id === personaId) || null;

  return (
    <label className="persona" title={AVISO}>
      <Icono />
      <span className="sr">Con quién se trabaja (provisional: no es un inicio de sesión)</span>
      <select
        value={personaId || ''}
        onChange={(ev) => { if (ev.target.value) elegirPersona(ev.target.value); }}
      >
        <option value="" disabled>Elige con quién trabajas…</option>
        {(personas || []).map((p) => (
          <option key={p._id} value={p._id}>
            {p.nombre} · {roles[p.rol] || p.rol}
          </option>
        ))}
      </select>
      <span className="etiqueta-rol">
        {actual ? (roles[actual.rol] || actual.rol) : 'sin elegir'}
      </span>
      {/* El distintivo es la parte que no se puede quitar: el desplegable solo,
          con una cara al lado, se lee como una sesión abierta. */}
      <span className="distintivo" title={AVISO}>provisional · sin contraseña</span>
    </label>
  );
}
