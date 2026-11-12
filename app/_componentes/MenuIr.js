// El menú «Ir a» de la barra superior: desde cualquier pantalla, lo que esa
// persona puede hacer.
//
// EL PROBLEMA QUE RESUELVE
//
// La barra llevaba la marca, el selector de documento, el de vista, quién eres y
// los de exportar, y ni un enlace a otra pantalla. A `/personas` y a
// `/reparto/<id>` solo se llegaba desde la portada, así que estando dentro de un
// documento no había forma de ir a ninguna de las dos sin volver atrás con el
// navegador. Y el efecto era al revés de lo que debía: cuanto más puede hacer un
// rol —la jefatura de departamento reparte unidades y gestiona el censo, la de
// estudios aprueba—, peor se movía por la aplicación.
//
// POR QUÉ PLEGADO Y NO UNA FILA DE BOTONES
//
// Porque la barra ya va llena. Una fila de enlaces que crece con el rol la parte
// en dos líneas en cuanto el documento tiene nombre largo —y lo tienen todos:
// «Programación didáctica · DAW · 2026-27»—, y encima la fila más ancha le
// tocaría justo a quien más cosas puede hacer. Un botón plegado ocupa lo mismo
// con dos destinos que con cinco, así que envejece bien: el día que haya una
// pantalla más, entra en la lista y la barra no se mueve.
//
// QUIÉN DECIDE QUÉ DESTINOS SALEN: EL SERVIDOR, COMO SIEMPRE
//
// Aquí no se mira ningún rol. Se preguntan las dos respuestas que ya existen y
// que las propias pantallas usan para pintar sus botones:
//
//   GET /api/personas                  → `puedeGestionar`  (el censo)
//   GET /api/documentos/[id]/unidades  → `puedeRepartir`   (el reparto)
//
// Las dos son baratas —1-2 kB, sin contenido del documento— y son las mismas que
// consultan Portada.js y Reparto.js, así que el menú no puede ofrecer algo que
// esas pantallas vayan a negar. Reescribir aquí la tabla de roles de
// core/permisos.js sería la avería de las dos implementaciones otra vez.
//
// Y EL ESTADO DEL DOCUMENTO NO SE PREGUNTA AQUÍ
//
// Quién puede aprobar lo dice `GET .../estado` con su `puede` por transición, y
// eso lo refleja la tarjeta de EstadoDocumento.js, que es donde está el botón.
// El menú solo lleva hasta esa pantalla: pedir `/estado` también aquí sería una
// petición más en cada pantalla para pintar un rótulo.
//
// LOS DESTINOS QUE NO SE PUEDEN USAR NO SALEN, SALVO UNO QUE SÍ
//
// El censo solo sale si el servidor dice que lo gestionas, igual que en la
// portada. El reparto sale siempre que haya un documento abierto —y lo dice: a
// quien no reparte, que ahí solo se ve—, porque verlo lo puede cualquiera que vea
// el documento: un docente necesita saber quién más lleva su módulo, que es la
// razón por la que la portada ya ofrece ese enlace a todo el mundo.
//
// TECLADO Y LECTORES DE PANTALLA
//
// Es un menú de verdad y no un `<div>` que se despliega al pasar el ratón: el
// botón dice que abre un menú (`aria-haspopup`) y si está abierto
// (`aria-expanded`), la lista es un `role="menu"` con sus `role="menuitem"`, y se
// recorre con las flechas, Inicio y Fin, se activa con Enter o espacio y se
// cierra con Escape devolviendo el foco al botón —y con el tabulador, que sigue
// su camino—. Un menú que solo funcione con el ratón deja fuera justo a quien más
// lo necesita, y aquí es además la única forma de llegar a dos pantallas.
//
// El foco se mueve con un `tabIndex` móvil (el destino elegido a 0 y los demás a
// -1): es lo que hace que el tabulador salga del menú en lugar de recorrerlo
// elemento a elemento, que es lo que se espera de un menú y no de una lista de
// enlaces.

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { pedir } from './api';

const Brujula = () => (
  <svg viewBox="0 0 24 24" className="ico" aria-hidden="true">
    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path d="m15 9-4.2 1.8L9 15l4.2-1.8L15 9Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
  </svg>
);

// Lo que el servidor contesta sobre quien mira. Un fallo —sin sesión es un 401, y
// un documento de otro departamento un 404— se trata como «no», que es lo que
// significa: el destino no sale y nadie ve un enlace que va a rebotar.
function useAlcance(documentoId) {
  const [alcance, setAlcance] = useState({ personas: false, reparto: false });

  useEffect(() => {
    let vivo = true;
    const parchear = (parche) => { if (vivo) setAlcance((a) => ({ ...a, ...parche })); };

    pedir('/api/personas')
      .then((r) => parchear({ personas: !!r.puedeGestionar }))
      .catch(() => parchear({ personas: false }));

    if (documentoId) {
      pedir(`/api/documentos/${encodeURIComponent(documentoId)}/unidades`)
        .then((r) => parchear({ reparto: !!r.puedeRepartir, sinUnidades: !!(r.resumen && r.resumen.unidades === 0) }))
        .catch(() => parchear({ reparto: false }));
    } else {
      parchear({ reparto: false });
    }

    return () => { vivo = false; };
  }, [documentoId]);

  return alcance;
}

// La lista de destinos, en el orden en que se buscan: primero lo del centro —los
// documentos y las personas—, luego lo del documento que se tiene abierto.
function destinosDe({ documentoId, alcance, aqui, onVista }) {
  const lista = [{
    id: 'documentos',
    href: '/',
    etiqueta: 'Documentos',
    ayuda: 'La lista de los que puedes abrir, por tipo y por curso.',
  }];

  if (alcance.personas) {
    lista.push({
      id: 'personas',
      href: '/personas',
      etiqueta: 'Personas del departamento',
      ayuda: 'Quién puede entrar, con qué rol y a quién le falta usar su enlace.',
    });
  }

  if (documentoId) {
    const d = encodeURIComponent(documentoId);
    lista.push({
      id: 'visor',
      href: `/doc/${d}`,
      etiqueta: 'Contenido del documento',
      ayuda: 'El árbol de apartados, que es por donde se escribe.',
    });
    lista.push({
      id: 'comprobaciones',
      href: `/doc/${d}?vista=validaciones`,
      // Dentro del visor la vista se cambia sin recargar: la barra ya tiene el
      // `onVista` del selector, y volver a pedir el documento y sus 250 nodos
      // para enseñar una vista que ya está cargada sería tirarlos a la basura.
      accion: onVista ? () => onVista('validaciones') : null,
      etiqueta: 'Comprobaciones y estado',
      ayuda: 'Qué falta por arreglar y en qué estado está el documento. Es donde se manda a revisión y se aprueba.',
    });
    lista.push({
      id: 'reparto',
      href: `/reparto/${d}`,
      etiqueta: alcance.sinUnidades ? 'Quién lleva cada apartado' : 'Quién lleva cada unidad',
      ayuda: alcance.sinUnidades
        ? 'Quién lleva cada apartado común del documento, que reparte la jefatura del departamento.'
        : alcance.reparto
        ? 'El reparto de los módulos y las materias entre el profesorado.'
        : 'Quién da clase de cada módulo. Repartirlos lo hace la jefatura del departamento: aquí solo se ven.',
    });
  }

  return lista.map((x) => ({ ...x, actual: x.id === aqui }));
}

export default function MenuIr({ documentoId, aqui, onVista }) {
  const alcance = useAlcance(documentoId);
  const destinos = useMemo(
    () => destinosDe({ documentoId, alcance, aqui, onVista }),
    [documentoId, alcance, aqui, onVista],
  );

  const [abierto, setAbierto] = useState(false);
  // Cuál de los destinos tiene el foco: es el `tabIndex` móvil del menú.
  const [foco, setFoco] = useState(0);
  const envoltorio = useRef(null);
  const boton = useRef(null);
  const lista = useRef(null);
  const items = useRef([]);

  const abrir = (indice) => { setFoco(indice); setAbierto(true); };
  const cerrar = (alBoton) => {
    setAbierto(false);
    if (alBoton && boton.current) boton.current.focus();
  };

  // Al abrirse, y al moverse con las flechas, el foco va al destino elegido: sin
  // esto las flechas pintarían un resaltado que el lector de pantalla no
  // anuncia, que es lo mismo que no moverse.
  useEffect(() => {
    if (!abierto) return;
    const el = items.current[foco];
    if (el) el.focus();
  }, [abierto, foco]);

  // DÓNDE CABE EL PANEL, MEDIDO AL ABRIRLO
  //
  // El panel cuelga del botón, y el botón no está siempre en el mismo sitio: la
  // barra se recoloca con la anchura de la ventana, así que en una ventana
  // estrecha acaba empujado hacia la derecha. Con un lado fijo en la hoja de
  // estilos el panel se sale de la pantalla justo donde la pantalla es más
  // pequeña, y lo que queda fuera es la mitad de los destinos.
  //
  // Se mide y se corre lo justo, con los dos márgenes: primero se trae hacia
  // dentro por la derecha y después se comprueba que no se haya salido por la
  // izquierda, que es lo que pasaría con un panel más ancho que la ventana. El
  // `transform` se limpia antes de medir para que la medida sea la de la
  // posición natural y no la de la corrección anterior.
  useEffect(() => {
    const el = lista.current;
    if (!el) return undefined;
    if (!abierto) { el.style.transform = ''; return undefined; }

    const colocar = () => {
      el.style.transform = '';
      const caja = el.getBoundingClientRect();
      const margen = 8;
      let dx = 0;
      if (caja.right > window.innerWidth - margen) dx = (window.innerWidth - margen) - caja.right;
      if (caja.left + dx < margen) dx = margen - caja.left;
      if (dx) el.style.transform = `translateX(${Math.round(dx)}px)`;
    };

    colocar();
    window.addEventListener('resize', colocar);
    return () => window.removeEventListener('resize', colocar);
  }, [abierto, destinos.length]);

  // Un clic fuera cierra, y no devuelve el foco al botón: quien ha pinchado en
  // otro sitio quiere estar en ese otro sitio.
  useEffect(() => {
    if (!abierto) return;
    const fuera = (ev) => {
      if (envoltorio.current && !envoltorio.current.contains(ev.target)) setAbierto(false);
    };
    document.addEventListener('pointerdown', fuera);
    return () => document.removeEventListener('pointerdown', fuera);
  }, [abierto]);

  const teclasDelMenu = (ev) => {
    const n = destinos.length;
    if (!n) return;
    if (ev.key === 'Escape') { ev.preventDefault(); cerrar(true); return; }
    // El tabulador sale del menú, que es lo que se espera de un menú: no se le
    // quita al teclado la forma de seguir por la página.
    if (ev.key === 'Tab') { setAbierto(false); return; }
    if (ev.key === 'ArrowDown') { ev.preventDefault(); setFoco((i) => (i + 1) % n); return; }
    if (ev.key === 'ArrowUp') { ev.preventDefault(); setFoco((i) => (i - 1 + n) % n); return; }
    if (ev.key === 'Home') { ev.preventDefault(); setFoco(0); return; }
    if (ev.key === 'End') { ev.preventDefault(); setFoco(n - 1); }
  };

  // Enter y espacio se atienden aquí y se cancelan: si se dejara su efecto por
  // omisión, el navegador lanzaría además el `click` y el menú se abriría y se
  // cerraría en el mismo golpe de tecla.
  const teclasDelBoton = (ev) => {
    if (ev.key === 'Escape' && abierto) { ev.preventDefault(); cerrar(false); return; }
    if (ev.key === 'ArrowDown' || ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      if (abierto) cerrar(false); else abrir(0);
      return;
    }
    if (ev.key === 'ArrowUp') { ev.preventDefault(); abrir(Math.max(0, destinos.length - 1)); }
  };

  const comun = (d, i) => ({
    role: 'menuitem',
    tabIndex: i === foco ? 0 : -1,
    ref: (el) => { items.current[i] = el; },
    // Dónde estás ahora, dicho también para el lector: un menú que no dice cuál
    // es la pantalla actual obliga a pulsar para averiguarlo.
    'aria-current': d.actual ? 'page' : undefined,
    // La explicación va como descripción y no dentro del nombre: así el nombre
    // del elemento es «Quién lleva cada unidad» y no un párrafo de dos líneas, y
    // el detalle se lee detrás.
    'aria-describedby': `ir-ayuda-${d.id}`,
  });

  return (
    <div className="menu-ir" ref={envoltorio}>
      <button
        type="button"
        id="btn-ir-a"
        className="icono-btn"
        ref={boton}
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-controls="menu-ir-lista"
        onClick={() => (abierto ? cerrar(false) : abrir(0))}
        onKeyDown={teclasDelBoton}
        title="Ir a otra pantalla de la aplicación"
      >
        <Brujula />
        Ir a
        <span className="menu-ir-flecha" aria-hidden="true">▾</span>
      </button>

      <ul
        className="menu-ir-lista"
        id="menu-ir-lista"
        ref={lista}
        role="menu"
        aria-labelledby="btn-ir-a"
        hidden={!abierto}
        onKeyDown={teclasDelMenu}
      >
        {destinos.map((d, i) => (
          <li key={d.id} role="none">
            {d.accion ? (
              <button
                type="button"
                {...comun(d, i)}
                onClick={() => { setAbierto(false); d.accion(); }}
              >
                <span className="menu-ir-etq">{d.etiqueta}</span>
                <span className="ayuda" id={`ir-ayuda-${d.id}`}>{d.ayuda}</span>
              </button>
            ) : (
              <a href={d.href} {...comun(d, i)}>
                <span className="menu-ir-etq">{d.etiqueta}</span>
                <span className="ayuda" id={`ir-ayuda-${d.id}`}>{d.ayuda}</span>
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
