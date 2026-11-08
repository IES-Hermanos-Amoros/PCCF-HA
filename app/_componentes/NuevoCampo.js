// El alta de un campo: elegir la forma, ver cómo va a quedar y aceptar.
//
// Sirve a los dos sitios donde nace un campo: al crear un apartado (la lista de campos con los
// que nace) y al añadir uno a un apartado que ya existe. Los dos usan el mismo `ElegirCampo`.
//
// NINGÚN TIPO DE CAMPO ESTÁ ESCRITO AQUÍ. Los tipos, su nombre en castellano, los datos que cada
// uno pide con sus límites y sus valores por omisión llegan en `tiposDeCampo`, que es lo que
// devuelve `GET .../estructura` (core/campos.js, `catalogo()`). El formulario se pinta de esa lista
// y la lógica —qué vale, qué se manda, cómo queda— es core/campos-forma.js. El día que el servidor
// añada un tipo, o un dato a uno que ya está, aparece aquí sin tocar este fichero.
//
// LA VISTA PREVIA ES LA TABLA CON LA QUE NACERÍA EL CAMPO, la misma que se abre en el editor y la
// que el servidor calcula (`valorInicial`), pintada con los colores del PDF y no los de la
// pantalla: lo que se ve es lo que se imprimirá, también con el tema oscuro puesto.
//
// UN APARTADO DE MÓDULO LO REPITEN TODOS LOS MÓDULOS. Crear un campo ahí lo crea en los once a la
// vez. Quien dice si es el caso es el servidor (`deUnidades` de la lectura de la estructura); esta
// pantalla lo recibe en `enTodas` y lo advierte ANTES del botón de aceptar.
//
// LO QUE NO SE PUEDE CAMBIAR DESPUÉS: el nombre del campo. Se dice aquí, donde se elige, porque
// el identificador nace de él y se queda para siempre (core/campos.js); renombrar un campo es un
// hueco conocido.

'use client';

import { useId, useState } from 'react';
import Forma from '../../core/campos-forma';

// ---------------------------------------------------------------- la vista previa

function VistaPrevia({ def, vista }) {
  if (vista.motivo) {
    return (
      <p className="previa-campo-motivo" role="status">
        <span aria-hidden="true">⚠ </span>{vista.motivo}
      </p>
    );
  }
  if (!vista.pintar) {
    return <p className="suave">{def.descripcion}</p>;
  }
  const { cabecera, filas } = vista.pintar;
  return (
    <div className="tabla-marco previa-campo-marco">
      <table className="tabla-previa">
        <tbody>
          {filas.map((fila, i) => (
            <tr key={i}>
              {fila.map((c, j) => (
                <td
                  key={j}
                  className={c.bold ? (i === 0 && cabecera ? 'previa-cab' : 'previa-neg') : undefined}
                >
                  {c.text || ' '}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------- el formulario

// `tipos` es `tiposDeCampo`. `onAceptar(peticion, resumen)` recibe lo que se manda a la API
// (`{ tipo, … }`) y una frase que lo dice. `quedan` es cuántos campos caben todavía.
export function ElegirCampo({
  tipos, quedan, enTodas, ocupado, textoAceptar, onAceptar, onCancelar,
}) {
  const opciones = Forma.opciones(tipos);
  const idBase = useId();
  const [tipo, setTipo] = useState(opciones.length ? opciones[0].tipo : null);
  const [formas, setFormas] = useState({});

  const def = Forma.porTipo(tipos, tipo);
  // Cada tipo conserva lo que se escribió en él mientras se mira otro.
  const forma = def ? (formas[def.tipo] || Forma.formaInicial(def)) : {};
  const vista = def ? Forma.previsualizar(def, forma) : { motivo: 'Elige qué tipo de campo quieres.' };
  const sinSitio = quedan !== undefined && quedan < 1;

  const cambiar = (id, crudo) => setFormas((previas) => ({ ...previas, [def.tipo]: Forma.fijar(def, forma, id, crudo) }));

  const aceptar = (ev) => {
    ev.preventDefault();
    if (!def || vista.motivo || sinSitio || ocupado) return;
    onAceptar(Forma.peticionDe(def, forma), Forma.resumen(def, forma));
  };

  if (!opciones.length) {
    return <p className="ayuda">No se ha podido leer qué campos se pueden crear. Recarga la página.</p>;
  }

  return (
    <form className="nuevo-campo" onSubmit={aceptar}>
      <fieldset className="nuevo-campo-tipos">
        <legend>Qué campo quieres</legend>
        {opciones.map((o) => (
          <label key={o.tipo} className={tipo === o.tipo ? 'opcion-campo on' : 'opcion-campo'}>
            <input
              type="radio"
              name={`${idBase}-tipo`}
              checked={tipo === o.tipo}
              onChange={() => setTipo(o.tipo)}
            />
            <span>
              <strong>{o.nombre}</strong>
              <span className="ayuda">{o.descripcion}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {def ? (
        <div className="nuevo-campo-datos">
          {(def.parametros || []).map((p) => {
            const id = `${idBase}-${def.tipo}-${p.id}`;
            const valor = forma[p.id];
            if (p.tipo === 'booleano') {
              return (
                <label key={p.id} className="dato-campo dato-casilla" htmlFor={id}>
                  <input id={id} type="checkbox" checked={!!valor} onChange={(ev) => cambiar(p.id, ev.target.checked)} />
                  {' '}{p.nombre}
                </label>
              );
            }
            if (p.tipo === 'entero') {
              return (
                <label key={p.id} className="dato-campo" htmlFor={id}>
                  <span>{p.nombre}</span>
                  <input
                    id={id}
                    type="number"
                    inputMode="numeric"
                    min={p.minimo}
                    max={p.maximo}
                    step={1}
                    value={valor === '' || valor === undefined ? '' : valor}
                    onChange={(ev) => cambiar(p.id, ev.target.value)}
                  />
                  <span className="ayuda">de {p.minimo} a {p.maximo}</span>
                </label>
              );
            }
            return (
              <label key={p.id} className="dato-campo" htmlFor={id}>
                <span>{p.nombre}</span>
                <input
                  id={id}
                  type="text"
                  maxLength={p.maximo}
                  value={valor === undefined ? '' : valor}
                  placeholder={p.defecto}
                  autoComplete="off"
                  onChange={(ev) => cambiar(p.id, ev.target.value)}
                />
              </label>
            );
          })}
          <p className="ayuda">
            El nombre se queda con el campo para siempre: no se puede cambiar después.
          </p>
        </div>
      ) : null}

      <div className="nuevo-campo-previa">
        <span className="tabla-etq">así quedará</span>
        {def ? <VistaPrevia def={def} vista={vista} /> : null}
      </div>

      {enTodas ? (
        <div className="nota nota-lock" role="note">
          <div>
            <strong>Este campo saldrá en {enTodas} a la vez.</strong>{' '}
            Está en la plantilla que {enTodas} repiten, así que crearlo aquí lo crea en todos, cada
            uno con su propio contenido. No hay forma de crearlo solo en uno.
          </div>
        </div>
      ) : null}

      {sinSitio ? (
        <p className="ayuda rojo">No caben más campos aquí: hay que quitar alguno antes.</p>
      ) : null}

      <div className="nuevo-campo-botones">
        <button
          type="submit"
          className="btn-primario"
          disabled={!def || !!vista.motivo || sinSitio || !!ocupado}
        >
          {textoAceptar || 'Añadir el campo'}
        </button>
        <button type="button" className="btn-ghost" onClick={onCancelar} disabled={!!ocupado}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- los campos de un apartado que todavía no existe

// La lista de campos con los que nacerá el apartado. `campos` es `[{ peticion, resumen }]` y
// vive en quien crea el apartado, que es quien los manda. Vacía, el apartado nace con un campo
// de texto, como siempre.
export function CamposDelApartadoNuevo({
  tipos, limites, campos, onCambio, enTodas, ocupado,
}) {
  const [abierto, setAbierto] = useState(false);
  if (!Array.isArray(tipos) || !tipos.length) return null;
  const maximo = limites && limites.camposAlCrearUnApartado;
  const quedan = maximo === undefined ? undefined : Forma.caben(maximo, campos.length);

  return (
    <div className="campos-del-apartado-nuevo">
      <div className="linea-estructura">
        <span className="suave">Campos del apartado nuevo</span>
        {campos.length ? (
          <ul className="lista-campos-nuevos">
            {campos.map((c, i) => (
              <li key={i}>
                <span>{c.resumen}</span>
                <button
                  type="button"
                  className="mini"
                  onClick={() => onCambio(campos.filter((_, k) => k !== i))}
                  aria-label={`Quitar de la lista: ${c.resumen}`}
                  disabled={!!ocupado}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <span className="ayuda">Ninguno elegido: nace con un campo de texto.</span>
        )}
        {abierto ? null : (
          <button
            type="button"
            className="mini"
            onClick={() => setAbierto(true)}
            disabled={!!ocupado || (quedan !== undefined && quedan < 1)}
          >
            {campos.length ? '+ otro campo' : 'Elegir los campos…'}
          </button>
        )}
      </div>
      {abierto ? (
        <ElegirCampo
          tipos={tipos}
          quedan={quedan}
          enTodas={enTodas}
          ocupado={ocupado}
          textoAceptar="Añadir a la lista"
          onAceptar={(peticion, resumen) => {
            onCambio(campos.concat([{ peticion, resumen }]));
            setAbierto(false);
          }}
          onCancelar={() => setAbierto(false)}
        />
      ) : null}
    </div>
  );
}
