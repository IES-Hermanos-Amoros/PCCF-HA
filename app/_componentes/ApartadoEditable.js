// Un apartado que se puede escribir: reparte sus campos entre los editores que
// hay y enseña lo que pasa al guardar.
//
// El autoguardado, el 409 y el 400 están en `autoguardado.js`, que es de donde
// salieron: los tres editores guardan igual y la lógica es una sola. Aquí queda
// lo que es de este componente: qué editor le toca a cada campo.
//
// QUÉ SE EDITA, DESPUÉS DEL E4
//
// Un apartado es `{ campoId: valor }` y el valor depende del tipo de campo
// (docs/plan.md §3):
//
//   texto_largo                      bloques de texto, con negrita y cursiva    E3
//   ponderacion_ra_ce                la tabla de pesos, con la suma en vivo     E4
//   ficha_situacion_aprendizaje      las fichas: ver, cambiar, crear, mover     E4
//   derivado.resumen_situaciones     la tabla resumen SA × RA, CALCULADA        E4
//   tabla y clave y valor, creadas aquí o importadas (no las listas)            EditorTablas.js
//   la tabla de RA y CE: se edita su rejilla y de ella se releen los RA         EditorTablas.js
//   lo demás (listas de tablas, tablas que el editor no sabe abrir)             sin editor
//
// Lo que no tiene editor se sigue viendo en lectura, con el mismo `Valores.js`
// de siempre y un aviso de que su editor no está. Esto es deliberado: un
// apartado medio editable se entiende, y un campo que desaparece de la pantalla
// porque nadie le ha escrito editor manda a alguien a buscar en el Word un texto
// que está guardado.
//
// POR QUÉ EL PATCH NO MANDA EL APARTADO ENTERO
//
// La ruta funde `valores` con lo guardado campo a campo, así que el PATCH lleva
// **solo los campos que se han tocado** y los demás se quedan en la base de
// datos tal como estaban. Un apartado de la PD real lleva a la vez un texto y
// dos tablas importadas; mandarlo entero sería pedir un 400 por las tablas que
// todavía no se guardan por ahí.
//
// LO QUE NO SE PUEDE GUARDAR LO RECHAZA EL SERVIDOR, Y AQUÍ SE REFLEJA
//
// La puerta es el PATCH (`app/_lib/rutas/apartado.js`), no esta pantalla. Si
// contesta 400 **no se ha escrito nada**, y eso hay que decirlo en voz alta en
// lugar de dejar la pantalla diciendo «guardado»: sale el mensaje del servidor,
// que es quien sabe qué estaba mal, y un botón de reintentar. Tampoco se
// reintenta solo, porque volvería a fallar igual.
//
// De los campos de TEXTO se puede decir antes de mandarlos: `motivoAlGuardar` es
// la misma función de `core/bloques.js` que usa la ruta, así que lo que aquí se
// avisa es exactamente lo que allí se rechazaría. No decide nada: sirve para que
// un 400 no llegue sin explicación y para señalar EN QUÉ CAMPO está el problema,
// que es lo que el mensaje del servidor no puede hacer en la pantalla.
//
// De las TABLAS editables también se puede: `core/estructurados.js` resuelve
// sus dependencias con un `require` LITERAL en cada rama —un `require(variable)`
// sí cortaría el `npm run build` con «Can't resolve <dynamic>»—, así que
// Turbopack la mete en el paquete del navegador, y `core/tablas-edicion.js` la
// consulta desde aquí con `motivoDeNo`: la misma puerta que usa la ruta, así
// que un botón apagado y un 400 no pueden discrepar.
//
// De los demás campos estructurados —las fichas, las ponderaciones, que tienen
// su propia pantalla— no se avisa antes: lo que el servidor rechace se enseña
// cuando lo rechaza, con su mensaje y en voz alta. Lo que NO se hace en ningún
// caso es escribir aquí una segunda copia de la regla, que es la forma conocida
// de que las dos se separen sin que nadie se entere (docs/plan.md §2.2).

'use client';

import { useEffect, useRef } from 'react';
import Edicion from '../../core/tablas-edicion';
import Ayuda from './Ayuda';
import EditorBloques from './Editor';
import EditorTabla from './EditorTablas';
import Ponderaciones from './Ponderaciones';
import Situaciones from './Situaciones';
import { Valor, vacio } from './Valores';
import {
  Conflicto, Descartado, Estado, urlApartado, useAutoguardado,
} from './autoguardado';
import { esListaDeBloques, motivoAlGuardar } from './bloques-cliente';
import { TIPO_FICHA, TIPO_PONDERACION, TIPO_RESUMEN } from './sa-cliente';

export default function ApartadoEditable({
  documentoId, apartado, onGuardado, contexto, onIr, revelar, onRevelado,
}) {
  const campos = Array.isArray(apartado.campos) ? apartado.campos : [];
  const url = urlApartado(documentoId, apartado);

  // LLEVAR A LA VISTA EL CAMPO QUE ACABA DE NACER.
  //
  // Los campos se pintan EN EL ORDEN DE LA PLANTILLA, que es el del PDF, no por orden de creación:
  // un apartado con una tabla y luego un texto no puede enseñar el texto primero. La consecuencia
  // es que un campo nuevo no aparece al final, sino en el sitio que le toca —en medio—, y la
  // tarjeta de estructura desde la que se crea está al pie de la página. En un apartado de la PD
  // real eso son más de cuatro mil píxeles de distancia: quien lo crea ve el aviso «Campo añadido»
  // y ni un cambio donde está mirando, y da por hecho que la pantalla no se ha enterado.
  //
  // Así que no basta con repintar: hay que llevar a quien lo creó hasta su campo. Se desplaza la
  // tarjeta a la vista y el foco entra en ella, que es además lo que necesita quien va por teclado
  // para seguir escribiendo sin recorrer el apartado entero con el tabulador.
  const tarjetas = useRef(new Map());
  useEffect(() => {
    if (!revelar) return;
    const n = tarjetas.current.get(revelar);
    if (!n) return;
    n.scrollIntoView({ block: 'center', behavior: 'smooth' });
    // El primer sitio donde se puede ESCRIBIR, y en ESTE orden, que no es el del documento: en un
    // campo de texto los botones de la barra (negrita, cursiva) van delante del área de escritura
    // en el HTML, así que un `querySelector('textarea, button')` devolvería el botón —devuelve el
    // primero que aparece en el documento, no el primero de la lista— y quien acaba de crear el
    // campo tendría el foco en «negrita» en lugar de donde se teclea. Si el campo no tiene ningún
    // sitio donde escribir —una tabla sin editor, un campo en lectura— el foco va a la tarjeta, que
    // para eso lleva `tabIndex`.
    // `[data-entrada]` lo pone el editor del campo para señalar por dónde se empieza cuando está
    // vacío (Editor.js, el botón «+ párrafo»): un campo de texto recién creado no tiene ningún
    // `textarea`, y sin esa marca el foco caería en el primer botón de la barra, que es «negrita» y
    // sin texto seleccionado no hace nada.
    const PREFERENCIA = ['[data-entrada]', 'textarea', 'input:not([type="hidden"])', '[contenteditable="true"]', 'select', 'button'];
    let dentro = null;
    for (let i = 0; i < PREFERENCIA.length && !dentro; i += 1) dentro = n.querySelector(PREFERENCIA[i]);
    (dentro || n).focus({ preventScroll: true });
    if (onRevelado) onRevelado();
  }, [revelar, onRevelado]);

  // `id` para poder enlazarlo y `ref` para poder llevar a él; `tabIndex` -1 para que la tarjeta
  // pueda recibir el foco cuando no hay nada dentro que lo reciba.
  const deTarjeta = (campo) => ({
    id: `campo-${campo.id}`,
    tabIndex: -1,
    ref: (n) => { if (n) tarjetas.current.set(campo.id, n); else tarjetas.current.delete(campo.id); },
  });

  const {
    valores, estado, guardadoEn, error, conflicto, descartado,
    cambiar, conservarLoMio, quedarmeConLoDeAhora, reintentar,
  } = useAutoguardado({
    url,
    valoresIniciales: apartado.valores,
    versionInicial: apartado.updatedAt,
    onGuardado,
  });

  // Lo que va encima de cualquier editor: el estado del guardado, lo que el
  // servidor rechazaría, el panel del 409 y lo descartado. Es igual para los
  // tres, así que se monta una vez.
  const marco = (dentro, reparos) => (
    <>
      <Estado estado={estado} guardadoEn={guardadoEn} error={error} onReintentar={reintentar} />

      {/* El 400 no se puede decir en una pastilla pequeña: quien acaba de crear
          una ficha o de cambiar un peso tiene que enterarse de que el documento
          sigue como estaba. */}
      {estado === 'error' ? (
        <div className="nota nota-error" role="alert">
          <div>
            <strong>No se ha guardado nada.</strong>{' '}
            {error ? error.message : 'El servidor ha rechazado el cambio.'}
            {error && error.estado === 400 ? (
              <p className="suave">
                El documento sigue como estaba. Lo que ves en la pantalla es lo que has escrito, no
                lo que hay guardado: cópialo si hace falta antes de recargar.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {conflicto ? (
        <Conflicto
          campos={campos}
          mios={conflicto.mios}
          servidor={conflicto.servidor}
          onConservar={conservarLoMio}
          onDescartar={quedarmeConLoDeAhora}
        />
      ) : null}

      {/* El reparo, antes de mandarlo y nombrando el campo. Es la misma función
          que la puerta del PATCH, así que no puede decir otra cosa. */}
      {(reparos || []).map((r) => (
        <div className="nota nota-error" role="alert" key={r.campo ? r.campo.id : 'apartado'}>
          <div>
            {r.campo ? <strong>{(r.campo.etiqueta || r.campo.id) + ': '}</strong> : null}
            Esto no se va a poder guardar: {r.motivo}
          </div>
        </div>
      ))}

      {descartado ? (
        <Descartado
          campos={campos}
          valores={descartado}
          repetidor={apartado.repetidor}
          titulo={apartado.titulo}
        />
      ) : null}

      {dentro}
    </>
  );

  // ---------------------------------------------------------------- las fichas de SA

  const deFichas = campos.filter((c) => c.tipo === TIPO_FICHA);
  const deResumen = campos.filter((c) => c.tipo === TIPO_RESUMEN);

  const panelSituaciones = (
    <Situaciones
      documentoId={documentoId}
      apartado={apartado}
      valores={valores}
      editable
      onCambiar={cambiar}
      seccionRaCe={contexto ? contexto.raCe : null}
      hermano={contexto ? contexto.hermanoSa : null}
      onIr={onIr}
    />
  );

  // Una sección repetidora son fichas, no texto: su valor es `{ items: [...] }`
  // y sus campos son los de CADA ficha, no los del apartado. Así que no se le
  // pinta el editor de párrafos: se le pinta el panel de situaciones.
  if (apartado.repetidor) return marco(panelSituaciones, []);

  // ---------------------------------------------------------------- el reparto

  const dePonderacion = campos.filter((c) => c.tipo === TIPO_PONDERACION);
  const editables = campos.filter((c) => c.tipo === 'texto_largo' || esListaDeBloques(valores[c.id]));
  // Las tablas se editan, las haya creado alguien aquí o las haya traído el Word, y también las
  // listas de tablas de un campo; las que el editor no sabe abrir siguen en lectura (EditorTablas.js).
  const deTabla = campos.filter((c) => Edicion.esEditable(c, valores[c.id]));
  const yaPintados = new Set([...editables, ...dePonderacion, ...deFichas, ...deResumen, ...deTabla]);
  const otros = campos.filter((c) => !yaPintados.has(c));

  // Lo que el servidor diría de los campos de texto, dicho antes de mandarlos,
  // con su misma función. Ver la cabecera para los estructurados.
  const reparos = editables
    .map((c) => ({ campo: c, motivo: motivoAlGuardar(valores[c.id] || []) }))
    .filter((x) => x.motivo);

  // Los textos y las tablas creadas van en el orden de la plantilla, que es el del PDF: un apartado
  // con una tabla y luego un texto no puede enseñar el texto primero.
  const delEditor = campos.filter((c) => editables.includes(c) || deTabla.includes(c));

  // UN EDITOR POR TABLA, EN ORDEN, cada uno rotulado «Tabla 2 de 3». Un selector obligaría a esconder
  // todas menos una y a recordar cuál se está viendo; así se ven todas, se llega a cualquiera sin
  // pulsar nada y se reutiliza EditorTabla tal cual, que solo sabe de un valor. Añadir y quitar son
  // del CAMPO y su regla (cuántas caben, que no se quede sin ninguna) está en core/tablas-edicion.js.
  const tablasDelCampo = (campo) => {
    const lista = valores[campo.id];
    const tablas = Edicion.tablasDe(campo, lista);
    const uno = Edicion.unaTabla(campo);
    const cambiarLista = (nueva) => cambiar(campo.id, nueva);
    const motivoAnadir = Edicion.motivoDeNoEnCampo(campo, lista, 'anadir-tabla');
    return (
      <>
        {tablas.map((tabla, i) => {
          const motivoQuitar = Edicion.motivoDeNoEnCampo(campo, lista, 'quitar-tabla', { indice: i });
          return (
            <div key={`${campo.id}-${i}`} className="tabla-de-lista">
              <div className="acciones-persona">
                <strong>Tabla {i + 1} de {tablas.length}</strong>
                {motivoQuitar ? (
                  <span className="motivo-no">{motivoQuitar}</span>
                ) : (
                  <button
                    type="button"
                    className="mini"
                    onClick={() => cambiarLista(Edicion.aplicarEnCampo(campo, lista, 'quitar-tabla', { indice: i }))}
                    aria-label={`Quitar la tabla ${i + 1} de ${tablas.length} de «${campo.etiqueta || campo.id}»`}
                  >
                    Quitar esta tabla
                  </button>
                )}
              </div>
              <EditorTabla
                campo={uno}
                valor={tabla}
                guardada={Array.isArray(lista) ? lista[i] : undefined}
                onCambio={(v) => cambiarLista(Edicion.cambiarTabla(campo, lista, i, v))}
              />
            </div>
          );
        })}
        <div className="acciones-persona">
          {motivoAnadir ? (
            <span className="motivo-no">{motivoAnadir}</span>
          ) : (
            <button
              type="button"
              className="mini"
              onClick={() => cambiarLista(Edicion.aplicarEnCampo(campo, lista, 'anadir-tabla'))}
            >
              Añadir tabla
            </button>
          )}
        </div>
      </>
    );
  };

  const seccionDeTabla = (campo) => (
    <section className="tarjeta" key={campo.id} {...deTarjeta(campo)}>
      <header className="tarjeta-cab">
        <h2>{campo.etiqueta || campo.id}</h2>
        {/* Quien edita una tabla del Word tiene que saber que lo que escriba ya no coincidirá con el
            documento original: es prosa de referencia, plegada (docs/interfaz-web.md §3.6). */}
        {Edicion.esImportada(campo) ? (
          <Ayuda sobre="esta tabla importada del Word">
            <p>
              Esta tabla vino del Word. Puedes corregirla a mano, pero lo que cambies deja de coincidir
              con el documento original.
            </p>
            <p>
              Si el Word la trajo con un defecto de maquetación (más de 12 columnas, una fila más corta
              o más larga que la primera, una celda combinada que se sale por abajo), se puede escribir en
              ella y darle estilo, pero no añadirle ni quitarle filas o columnas ni combinar celdas: esos
              botones salen apagados y dicen el motivo.
            </p>
          </Ayuda>
        ) : null}
        {/* Una tabla recién creada se abre con su forma de nacimiento, que no está guardada hasta
            que se escribe algo: sin valor no sale en el PDF. */}
        {valores[campo.id] === undefined || valores[campo.id] === null
          ? <span className="chip chip-vacio" title="Se guarda al escribir en una celda o cambiar la tabla">sin rellenar</span>
          : null}
      </header>
      {campo.multiple ? tablasDelCampo(campo) : (
        <EditorTabla
          campo={campo}
          valor={Edicion.valorDe(campo, valores[campo.id])}
          guardada={valores[campo.id]}
          onCambio={(v) => cambiar(campo.id, v)}
        />
      )}
    </section>
  );

  return marco(
    <>
      {/* El panel de situaciones va primero: es el trabajo del apartado, y el
          texto de arriba del Word es la introducción. */}
      {deFichas.length || deResumen.length ? panelSituaciones : null}

      {dePonderacion.map((campo) => (
        <Ponderaciones
          key={campo.id}
          valor={valores[campo.id]}
          etiqueta={campo.etiqueta || 'Ponderaciones'}
          editable
          onCambio={(v) => cambiar(campo.id, v)}
        />
      ))}

      {delEditor.map((campo) => (deTabla.includes(campo) ? seccionDeTabla(campo) : (
        <section className="tarjeta" key={campo.id} {...deTarjeta(campo)}>
          <header className="tarjeta-cab">
            <h2>{campo.etiqueta || campo.id}</h2>
            {/* Un campo que la plantilla tiene y este documento no había
                escrito: el PDF lo omite en silencio (aviso nº 3 de
                docs/interfaz-web.md), así que aquí se dice que está vacío. */}
            {vacio(valores[campo.id]) ? <span className="chip chip-vacio">vacío</span> : null}
          </header>
          <EditorBloques
            bloques={valores[campo.id] || []}
            compartidos={apartado.compartidos}
            onCambio={(bs) => cambiar(campo.id, bs)}
          />
        </section>
      )))}

      {otros.map((campo) => (
        <section className="tarjeta" key={campo.id} {...deTarjeta(campo)}>
          <header className="tarjeta-cab">
            <h2>{campo.etiqueta || campo.id}</h2>
            <span className="chip">todavía sin editor</span>
          </header>
          {vacio(valores[campo.id]) ? (
            <p className="vacio-apartado">Vacío. Este tipo de campo todavía no se puede escribir aquí.</p>
          ) : (
            <div className="bloques">
              <Valor
                valor={valores[campo.id]}
                etiqueta={campo.etiqueta}
                compartidos={apartado.compartidos}
              />
            </div>
          )}
        </section>
      ))}

    </>,
    reparos,
  );
}
