// Cómo se entra, dicho una sola vez.
//
// Lo enseñan dos pantallas —la portada de quien no tiene sesión y `/acceso` sin
// enlace— y tiene que decir lo mismo en las dos: un texto redactado dos veces se
// redacta distinto y la herramienta acaba explicándose de dos maneras según por
// dónde hayas llegado.
//
// LO QUE NO ES: UN FORMULARIO DE INICIO DE SESIÓN
//
// No hay nada que rellenar y no hay nada que recordar. No hay registro, no hay
// contraseña y no hay que crearse una cuenta: da de alta la jefatura del
// departamento y se entra una vez con un enlace, que abre la sesión
// (app/_lib/invitaciones.js explica por qué se eligió así). Si esta pantalla
// tuviera dos casillas y un botón, la gente intentaría adivinar con qué correo y
// con qué contraseña entra, y no hay ninguna.

'use client';

export default function ComoSeEntra({ titulo, children }) {
  return (
    <section className="tarjeta">
      <header className="tarjeta-cab">
        <h2>{titulo || 'Cómo se entra'}</h2>
        <span className="distintivo">sin contraseñas</span>
      </header>

      {children}

      <ol className="pasos-acceso">
        <li>
          <strong>No hay registro.</strong> No te puedes crear una cuenta, y no hay ninguna
          contraseña que recuperar: esta pantalla no es un inicio de sesión y no hay nada que
          rellenar en ella.
        </li>
        <li>
          <strong>Te da de alta la jefatura de tu departamento</strong> con tu nombre y tu correo.
        </li>
        <li>
          <strong>Se entra con un enlace</strong> de un solo uso, que caduca a los siete días. Al
          abrirlo se te abre la sesión y ya estás dentro.
        </li>
        <li>
          Si lo has perdido, ha caducado o ya lo habías usado,{' '}
          <strong>pide otro a la jefatura de tu departamento</strong>: el que vale es siempre el
          último que te hayan mandado.
        </li>
      </ol>

      <p className="ayuda">
        La aplicación todavía no manda correos, así que el enlace lo hace llegar a mano quien te da
        de alta.
      </p>
    </section>
  );
}
