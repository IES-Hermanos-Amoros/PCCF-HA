// Las personas del departamento: `/personas`.
//
// El censo con su rol y si está activa, y —para quien gestiona altas— dar de
// alta, cambiar el rol, dar de baja y volver a invitar a quien perdió su enlace.
//
// LA PREGUNTA DE ESTA PANTALLA ES «¿A QUIÉN HE DADO DE ALTA QUE NO HA ENTRADO?»
//
// Porque el alta no acaba al crear a la persona: acaba cuando esa persona canjea
// su enlace. Entre las dos cosas hay un correo que alguien tiene que copiar y
// mandar a mano, así que el caso corriente es quedarse a medias y no enterarse.
// De ahí el recuento de arriba y el distintivo de cada fila.
//
// Lo que la API sabe decir es si esa persona tiene un enlace SIN USAR
// (`invitacionPendiente`, con su caducidad). No sabe decir si entró alguna vez:
// `GET /api/personas` no manda ni último acceso ni nada parecido, así que la
// pantalla dice exactamente lo que sabe —«tiene un enlace sin usar»— y no finge
// saber más. Queda apuntado en el informe.
//
// EL ENLACE SE ENSEÑA PARA COPIARLO, Y SE DICE QUE NO SE MANDA
//
// La API devuelve el enlace en el alta y en el «vuelve a invitar» porque todavía
// no hay forma de mandar un correo (app/_lib/invitaciones.js). Así que la
// pantalla lo pone en una caja de la que se pueda copiar —con el teclado
// también— y repite el aviso del servidor. Una pantalla que dijera «le hemos
// enviado un correo» sin enviarlo es la forma más rápida de que nadie se fíe de
// la herramienta.
//
// QUIÉN DECIDE
//
// El servidor. `puedeGestionar` llega en la respuesta y sirve solo para pintar
// el formulario y los botones; cada acción la vuelve a comprobar su ruta, y
// cuando se niega se enseña su mensaje tal cual, que ya viene redactado y dice
// por qué. Lo único que esta pantalla decide por su cuenta son las dos reglas
// que son sobre uno mismo y no sobre el rango —nadie se cambia el rol ni se da
// de baja a sí mismo—, porque para eso basta comparar un identificador con el de
// la sesión.

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import BarraSuperior from './BarraSuperior';
import { pedir } from './api';
import { useSesion } from './sesion-cliente';
import { ROLES } from './etiquetas';

// Los cuatro roles, en el orden en que se entienden: de menos a más alcance. El
// servidor rechaza los que estén por encima del rango de quien pregunta y dice
// por qué, así que aquí no se filtra nada: filtrarlo sería copiar en el
// navegador la tabla de rangos de app/_lib/invitaciones.js y arriesgarse a que
// las dos digan cosas distintas.
const ROLES_EN_ORDEN = ['docente', 'jefe_departamento', 'jefe_estudios', 'admin'];

const fecha = (valor) => {
  if (!valor) return null;
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
};

// ---------------------------------------------------------------- el enlace generado

function EnlaceGenerado({ dato, alCerrar }) {
  // `null` mientras no se ha intentado copiar; después, true o false.
  const [copiado, setCopiado] = useState(null);
  const caja = useRef(null);
  const enlace = dato.enlace;

  // El enlace se lleva el foco en cuanto aparece, y la caja se selecciona sola.
  // Es lo único que de verdad importa de la pantalla en ese momento —si se
  // pierde no se puede volver a enseñar— y el botón que lo ha generado puede
  // estar muy lejos: el alta está debajo de la tabla y «volver a invitar», en una
  // fila cualquiera de un censo de cuarenta. Sin esto, el enlace sale arriba y no
  // lo ve nadie.
  useEffect(() => {
    if (!caja.current) return;
    setCopiado(null);
    caja.current.focus();
    try {
      caja.current.scrollIntoView({ block: 'center' });
    } catch (e) { /* un navegador sin opciones de scrollIntoView */ }
  }, [dato.enlace]);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(enlace);
      setCopiado(true);
    } catch (e) {
      // Sin permiso para el portapapeles (pasa sin HTTPS, y pasa si el navegador
      // lo tiene cortado): se selecciona el texto y SE DICE que lo copie él. Un
      // botón que no hace nada y no se queja deja a quien lo pulsa creyendo que
      // tiene el enlace, y el enlace no se puede volver a enseñar.
      setCopiado(false);
      if (caja.current) { caja.current.focus(); caja.current.select(); }
    }
  };

  return (
    <div className="nota nota-enlace" role="status">
      <div>
        <strong>
          Enlace de acceso de {dato.persona ? dato.persona.nombre : 'la persona'}
        </strong>
        <div className="fila-enlace">
          <label className="sr" htmlFor="enlace-generado">Enlace de acceso, para copiarlo</label>
          <input
            id="enlace-generado"
            ref={caja}
            className="caja-enlace"
            type="text"
            readOnly
            value={enlace}
            onFocus={(ev) => ev.target.select()}
          />
          <button className="btn-primario" type="button" onClick={copiar}>
            {copiado ? 'Copiado' : 'Copiar'}
          </button>
          <button className="icono-btn" type="button" onClick={alCerrar}>Ocultar</button>
        </div>
        {copiado === false ? (
          <p className="ayuda rojo" style={{ margin: '6px 0 0' }}>
            Este navegador no deja copiar al portapapeles desde la página. El enlace ya está
            seleccionado: cópialo con <kbd>Ctrl</kbd>+<kbd>C</kbd>.
          </p>
        ) : null}
        <p className="suave" style={{ margin: '6px 0 0' }}>{dato.aviso}</p>
        <p className="ayuda">
          No se vuelve a poder enseñar: de la invitación solo se guarda su hash, así que si se
          pierde hay que generar otro con «volver a invitar». Pégalo entero, desde{' '}
          <code>http</code> hasta el final.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- el alta

function Alta({ departamento, alAlta }) {
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [rol, setRol] = useState('docente');
  const [enviando, setEnviando] = useState(false);
  const [fallo, setFallo] = useState(null);

  const enviar = async (ev) => {
    ev.preventDefault();
    setEnviando(true);
    setFallo(null);
    try {
      const r = await pedir('/api/invitaciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, email, rol }),
      });
      setNombre('');
      setEmail('');
      setRol('docente');
      alAlta(r);
    } catch (e) {
      setFallo(e);
    }
    setEnviando(false);
  };

  return (
    <section className="tarjeta estructura">
      <header className="tarjeta-cab">
        <h2>Dar de alta a alguien</h2>
        <span className="suave">se crea la persona y sale su enlace de acceso</span>
      </header>

      <form onSubmit={enviar}>
        <div className="linea-estructura">
          <label htmlFor="alta-nombre">Nombre</label>
          <input id="alta-nombre" value={nombre} onChange={(ev) => setNombre(ev.target.value)} required />
        </div>

        <div className="linea-estructura">
          <label htmlFor="alta-email">Correo</label>
          <input
            id="alta-email"
            type="email"
            value={email}
            onChange={(ev) => setEmail(ev.target.value)}
            required
          />
          <span className="ayuda">
            No se le manda nada: sirve para no dar de alta dos veces a la misma persona y para que
            el día que haya correo el enlace salga solo.
          </span>
        </div>

        <div className="linea-estructura">
          <label htmlFor="alta-rol">Rol</label>
          <select id="alta-rol" value={rol} onChange={(ev) => setRol(ev.target.value)}>
            {ROLES_EN_ORDEN.map((r) => <option key={r} value={r}>{ROLES[r] || r}</option>)}
          </select>
          <span className="ayuda">
            Nadie da de alta por encima de su propio rango: si eliges uno más alto que el tuyo, el
            servidor se niega y lo dice. La persona se crea en tu departamento
            {departamento ? <> (<code>{departamento}</code>)</> : null}.
          </span>
        </div>

        <div className="compartido-acciones">
          <button className="btn-primario" type="submit" disabled={enviando}>
            {enviando ? 'Dando de alta…' : 'Dar de alta y generar el enlace'}
          </button>
        </div>

        {fallo ? (
          <div className="nota nota-lock" style={{ marginTop: 12 }} role="alert">
            <div>{fallo.message}</div>
          </div>
        ) : null}
      </form>
    </section>
  );
}

// ---------------------------------------------------------------- la pantalla

export default function Personas() {
  const { persona: yo, cargando: cargandoSesion } = useSesion();

  const [personas, setPersonas] = useState(null);
  const [puedeGestionar, setPuedeGestionar] = useState(false);
  const [error, setError] = useState(null);
  const [enlace, setEnlace] = useState(null);
  // El resultado de la última acción, pegado a la fila en la que se hizo: un
  // aviso al principio de la pantalla no se ve cuando la tabla tiene cuarenta
  // filas y acabas de pulsar en la treinta.
  const [resultado, setResultado] = useState(null);
  const [ocupada, setOcupada] = useState(null);
  const [corrigiendo, setCorrigiendo] = useState(null);
  const [borrador, setBorrador] = useState({ nombre: '', email: '' });

  const cargar = useCallback(() => pedir('/api/personas')
    .then((r) => {
      setPersonas(r.personas || []);
      setPuedeGestionar(!!r.puedeGestionar);
      setError(null);
    })
    .catch((e) => { setPersonas([]); setError(e); }), []);

  useEffect(() => { cargar(); }, [cargar]);

  // Toda acción acaba igual: se enseña el mensaje del servidor y se vuelve a
  // pedir la lista. Volver a pedirla no es por gusto: si el cambio se rechaza,
  // el desplegable de rol tiene que volver a lo que de verdad hay guardado, y
  // no quedarse enseñando lo que alguien eligió y no se guardó.
  const accion = async (id, peticion, { exito } = {}) => {
    setOcupada(id);
    setResultado(null);
    try {
      const r = await peticion();
      await cargar();
      setResultado({ id, tipo: 'ok', texto: (r && r.mensaje) || exito || 'Hecho.' });
      return r;
    } catch (e) {
      await cargar();
      setResultado({ id, tipo: 'mal', texto: e.message });
      return null;
    } finally {
      setOcupada(null);
    }
  };

  const cambiarRol = (p, rol) => accion(p._id, () => pedir(`/api/personas/${encodeURIComponent(p._id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rol }),
  }));

  const cambiarActivo = (p, activo) => accion(p._id, () => pedir(`/api/personas/${encodeURIComponent(p._id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ activo }),
  }));

  // Editar el nombre o el correo de alguien ya dado de alta. Antes, por una letra mal, había que
  // darlo de baja y crearlo otra vez, y con el alta nueva se perdían sus asignaciones.
  const empezarCorreccion = (p) => {
    setResultado(null);
    setCorrigiendo(p._id);
    setBorrador({ nombre: p.nombre || '', email: p.email || '' });
  };

  const guardarCorreccion = async (p) => {
    const cambios = {};
    if (borrador.nombre.trim() !== (p.nombre || '')) cambios.nombre = borrador.nombre.trim();
    if (borrador.email.trim().toLowerCase() !== (p.email || '')) cambios.email = borrador.email.trim();
    if (Object.keys(cambios).length === 0) { setCorrigiendo(null); return; }

    const r = await accion(p._id, () => pedir(`/api/personas/${encodeURIComponent(p._id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cambios),
    }));
    // Si el servidor lo rechaza —un correo que ya es de otra persona— se deja abierto con lo
    // escrito: cerrarlo obligaría a teclearlo entero otra vez para arreglar una letra.
    if (r) setCorrigiendo(null);
  };

  const volverAInvitar = async (p) => {
    const r = await accion(
      p._id,
      () => pedir(`/api/personas/${encodeURIComponent(p._id)}/invitacion`, { method: 'POST' }),
      { exito: `Enlace nuevo para ${p.nombre}. El anterior ya no sirve.` },
    );
    if (r && r.enlace) setEnlace(r);
  };

  const sinSesion = !cargandoSesion && !yo;
  const lista = personas || [];
  const hayCorreos = lista.some((p) => p.email);
  const pendientes = lista.filter((p) => p.invitacionPendiente).length;
  const deBaja = lista.filter((p) => !p.activo).length;

  return (
    <>
      <BarraSuperior subtitulo="Personas del departamento" persona={yo} aqui="personas" />

      <main className="main">
        <div className="cabecera">
          <div>
            <h1>Personas del departamento</h1>
            <p className="suave">
              Quién puede entrar, con qué rol, y a quién le falta usar su enlace. El alta la hace la
              jefatura del departamento: aquí no se registra nadie por su cuenta.
            </p>
          </div>
          <div className="cabecera-derecha">
            <a className="btn-ghost" href="/">Documentos</a>
          </div>
        </div>

        {/* La región que anuncia el resultado de cada acción existe siempre,
            aunque esté vacía: un `aria-live` que aparece junto con su texto no
            se anuncia de forma fiable, porque el lector de pantalla tiene que
            haber visto la región antes de que cambie. Lo que se pinta en la fila
            es lo mismo, para quien lo lee mirando. */}
        <div className="sr" role="status" aria-live="polite">
          {resultado ? resultado.texto : ''}
        </div>

        {sinSesion ? (
          <div className="nota nota-lock" role="alert">
            <div>
              <strong>No hay sesión en este navegador.</strong>
              <p className="suave" style={{ margin: '4px 0 0' }}>
                Esta pantalla es el censo del departamento y hace falta estar dentro para verla.{' '}
                <a className="enlace" href="/acceso">Cómo se entra</a>.
              </p>
            </div>
          </div>
        ) : null}

        {error && !sinSesion ? (
          <div className="nota nota-lock" role="alert"><div>{error.message}</div></div>
        ) : null}

        {personas === null ? <p className="suave">Cargando el censo…</p> : null}

        {personas && personas.length ? (
          <div className="metricas">
            <div className="metrica"><b>{lista.length}</b><span>personas</span></div>
            <div className="metrica">
              <b className={pendientes ? 'ambar' : ''}>{pendientes}</b>
              <span>sin usar su enlace</span>
            </div>
            <div className="metrica">
              <b className={deBaja ? 'rojo' : ''}>{deBaja}</b>
              <span>de baja</span>
            </div>
          </div>
        ) : null}

        {personas && personas.length && !puedeGestionar ? (
          <div className="nota">
            <div>
              <strong>Estás viendo el censo, no gestionándolo.</strong>
              <p className="suave" style={{ margin: '4px 0 0' }}>
                Dar de alta, cambiar un rol o dar de baja lo hacen la jefatura del departamento y el
                soporte. Lo decide el servidor en cada petición, no esta pantalla.
              </p>
            </div>
          </div>
        ) : null}

        {enlace ? <EnlaceGenerado dato={enlace} alCerrar={() => setEnlace(null)} /> : null}

        {personas && personas.length ? (
          <section className="tarjeta">
            <header className="tarjeta-cab">
              <h2>Censo</h2>
              <span className="suave">
                {pendientes
                  ? `${pendientes} ${pendientes === 1 ? 'persona tiene' : 'personas tienen'} un enlace sin usar`
                  : 'nadie tiene enlaces pendientes'}
              </span>
            </header>

            <div className="tabla-scroll">
              <table className="tabla">
                <caption className="sr">
                  Personas del departamento, con su rol, si están activas y si les queda un enlace
                  de acceso sin usar
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Persona</th>
                    {hayCorreos ? <th scope="col">Correo</th> : null}
                    <th scope="col">Rol</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Acceso</th>
                    {puedeGestionar ? <th scope="col">Acciones</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {lista.map((p) => {
                    const soyYo = yo && String(yo._id) === String(p._id);
                    const trabajando = ocupada === p._id;
                    const suyo = resultado && resultado.id === p._id ? resultado : null;
                    return (
                      <tr key={p._id} className={p.activo ? '' : 'fila-baja'}>
                        <th scope="row">
                          {corrigiendo === p._id ? (
                            <>
                              <label className="sr" htmlFor={`nombre-${p._id}`}>Nombre de {p.nombre}</label>
                              <input
                                id={`nombre-${p._id}`}
                                type="text"
                                value={borrador.nombre}
                                maxLength={120}
                                disabled={trabajando}
                                onChange={(ev) => setBorrador((b) => ({ ...b, nombre: ev.target.value }))}
                              />
                            </>
                          ) : (
                            <>
                              {p.nombre}
                              {soyYo ? <span className="chip" style={{ marginLeft: 6 }}>tú</span> : null}
                            </>
                          )}
                        </th>
                        {hayCorreos ? (
                          <td className="suave">
                            {corrigiendo === p._id ? (
                              <>
                                <label className="sr" htmlFor={`email-${p._id}`}>Correo de {p.nombre}</label>
                                <input
                                  id={`email-${p._id}`}
                                  type="email"
                                  value={borrador.email}
                                  disabled={trabajando}
                                  onChange={(ev) => setBorrador((b) => ({ ...b, email: ev.target.value }))}
                                />
                              </>
                            ) : (p.email || <span aria-hidden="true">—</span>)}
                          </td>
                        ) : null}
                        <td>
                          {puedeGestionar ? (
                            <>
                              <label className="sr" htmlFor={`rol-${p._id}`}>Rol de {p.nombre}</label>
                              <select
                                id={`rol-${p._id}`}
                                value={p.rol}
                                disabled={trabajando || soyYo}
                                title={soyYo
                                  ? 'Nadie se cambia el rol a sí mismo: que te lo cambie otra jefatura o el soporte.'
                                  : undefined}
                                onChange={(ev) => cambiarRol(p, ev.target.value)}
                              >
                                {ROLES_EN_ORDEN.map((r) => (
                                  <option key={r} value={r}>{ROLES[r] || r}</option>
                                ))}
                              </select>
                              {soyYo ? (
                                <div className="ayuda">no te puedes cambiar el rol a ti mismo</div>
                              ) : null}
                            </>
                          ) : (ROLES[p.rol] || p.rol)}
                        </td>
                        <td>
                          {p.activo
                            ? <span className="chip chip-validado">activa</span>
                            : <span className="chip chip-error">de baja</span>}
                        </td>
                        <td>
                          {p.invitacionPendiente ? (
                            <>
                              <span className="chip chip-incompleto">enlace sin usar</span>
                              <div className="ayuda">
                                caduca el {fecha(p.invitacionPendiente.expiraEn) || '—'}
                              </div>
                            </>
                          ) : puedeGestionar ? (
                            <span className="suave">sin enlaces pendientes</span>
                          ) : (
                            <span className="suave" aria-hidden="true">—</span>
                          )}
                        </td>
                        {puedeGestionar ? (
                          <td>
                            <div className="acciones-persona">
                              {corrigiendo === p._id ? (
                                <>
                                  <button
                                    className="mini"
                                    type="button"
                                    disabled={trabajando}
                                    onClick={() => guardarCorreccion(p)}
                                    aria-label={`Guardar el nombre y el correo de ${p.nombre}`}
                                  >
                                    {trabajando ? 'Guardando…' : 'Guardar'}
                                  </button>
                                  <button
                                    className="mini"
                                    type="button"
                                    disabled={trabajando}
                                    onClick={() => setCorrigiendo(null)}
                                  >
                                    Cancelar
                                  </button>
                                </>
                              ) : (
                                <button
                                  className="mini"
                                  type="button"
                                  disabled={trabajando}
                                  onClick={() => empezarCorreccion(p)}
                                  aria-label={`Editar el nombre o el correo de ${p.nombre}`}
                                  title="Cambiar el nombre o el correo, sin dar de baja a nadie"
                                >
                                  Editar
                                </button>
                              )}
                              {p.activo ? (
                                <>
                                  <button
                                    className="mini"
                                    type="button"
                                    disabled={trabajando}
                                    onClick={() => volverAInvitar(p)}
                                    aria-label={`Generar otro enlace de acceso para ${p.nombre}`}
                                  >
                                    Volver a invitar
                                  </button>
                                  <button
                                    className="mini"
                                    type="button"
                                    disabled={trabajando || soyYo}
                                    onClick={() => cambiarActivo(p, false)}
                                    aria-label={`Dar de baja a ${p.nombre}`}
                                    title={soyYo
                                      ? 'No puedes darte de baja a ti mismo: te quedarías fuera de la aplicación.'
                                      : 'Deja de poder entrar y se cierran sus sesiones'}
                                  >
                                    Dar de baja
                                  </button>
                                </>
                              ) : (
                                <button
                                  className="mini"
                                  type="button"
                                  disabled={trabajando}
                                  onClick={() => cambiarActivo(p, true)}
                                  aria-label={`Volver a activar a ${p.nombre}`}
                                  title="Vuelve a estar activa, pero necesitará un enlace nuevo"
                                >
                                  Activar
                                </button>
                              )}
                            </div>
                            {soyYo ? (
                              <div className="ayuda">no puedes darte de baja a ti mismo</div>
                            ) : null}
                            {!p.activo ? (
                              <div className="ayuda">
                                a quien está de baja no se le manda un enlace: no abriría nada.
                                Actívala primero.
                              </div>
                            ) : null}
                            {suyo ? (
                              <div className={suyo.tipo === 'mal' ? 'ayuda rojo' : 'ayuda bien'}>
                                {suyo.texto}
                              </div>
                            ) : null}
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="ayuda">
              «Enlace sin usar» quiere decir que esa persona tiene una invitación pendiente y
              todavía no la ha canjeado: mientras siga así, no ha entrado. Cambiar un rol no cierra
              su sesión; dar de baja sí, y además anula sus enlaces.
            </p>
          </section>
        ) : null}

        {puedeGestionar ? (
          <Alta departamento={yo ? yo.departamento : null} alAlta={(r) => { setEnlace(r); cargar(); }} />
        ) : null}
      </main>
    </>
  );
}
