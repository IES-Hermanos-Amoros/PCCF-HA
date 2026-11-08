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
//   lo demás (ficha del módulo, RA y CE, contenidos, rejillas importadas)       sin editor
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
// De los campos ESTRUCTURADOS todavía no, y no por gusto: su puerta es
// `core/estructurados.js`, que resuelve sus dependencias con un `require(ruta)`
// calculado (`deCore`) y por eso Turbopack no la puede meter en el paquete del
// navegador —«Module not found: Can't resolve <dynamic>», y el `npm run build`
// entero se cae—. `core/bloques.js` no tiene ese patrón y por eso sí entra, por
// `bloques-cliente.js`. Hasta que esa capa se pueda importar desde el cliente,
// lo que el servidor rechace se enseña cuando lo rechaza, con su mensaje y en
// voz alta; lo que NO se hace es escribir aquí una segunda copia de la regla,
// que es la forma conocida de que las dos se separen sin que nadie se entere
// (docs/plan.md §2.2).

'use client';

import EditorBloques from './Editor';
import Ponderaciones from './Ponderaciones';
import Situaciones from './Situaciones';
import { Valor, vacio } from './Valores';
import {
  Conflicto, Descartado, Estado, urlApartado, useAutoguardado,
} from './autoguardado';
import { esListaDeBloques, motivoAlGuardar } from './bloques-cliente';
import { TIPO_FICHA, TIPO_PONDERACION, TIPO_RESUMEN } from './sa-cliente';

export default function ApartadoEditable({
  documentoId, apartado, onGuardado, contexto, onIr,
}) {
  const campos = Array.isArray(apartado.campos) ? apartado.campos : [];
  const url = urlApartado(documentoId, apartado);

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
  const yaPintados = new Set([...editables, ...dePonderacion, ...deFichas, ...deResumen]);
  const otros = campos.filter((c) => !yaPintados.has(c));

  // Lo que el servidor diría de los campos de texto, dicho antes de mandarlos,
  // con su misma función. Ver la cabecera para los estructurados.
  const reparos = editables
    .map((c) => ({ campo: c, motivo: motivoAlGuardar(valores[c.id] || []) }))
    .filter((x) => x.motivo);

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

      {editables.map((campo) => (
        <section className="tarjeta" key={campo.id}>
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
      ))}

      {otros.map((campo) => (
        <section className="tarjeta" key={campo.id}>
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
