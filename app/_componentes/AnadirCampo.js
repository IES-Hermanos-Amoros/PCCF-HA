// Añadir un campo a un apartado que ya existe: la mitad «apartado existente» del alta de campos.
// (La otra mitad, los campos con los que nace un apartado nuevo, es `CamposDelApartadoNuevo` de
// NuevoCampo.js; las dos comparten el formulario `ElegirCampo`.)
//
// Es un cambio de la estructura como renombrar o mover, y lleva lo mismo que ellos: la versión de
// la plantilla con la que se leyó (409 si ha cambiado por medio) y la advertencia de los módulos,
// que el servidor dice en `deUnidades` (antes) y `afectaUnidades` (después). El campo nuevo va al
// final del apartado, y se rellena en el editor del apartado, que es donde aparece.
//
// `fila` es la del apartado en la lectura de la estructura; `onCambiado` es el mismo que usa la
// tarjeta, y recarga el árbol y el apartado abierto para que el campo nuevo salga sin recargar la
// página.

'use client';

import { useState } from 'react';
import Forma from '../../core/campos-forma';
import { cambiarEstructura } from './estructura-cliente';
import { ElegirCampo } from './NuevoCampo';

export default function AnadirCampo({
  documentoId, seccion, fila, tipos, limites, plantillaVersion, enTodas, onCambiado,
}) {
  const [abierto, setAbierto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState(null);
  const [error, setError] = useState(null);

  if (!Array.isArray(tipos) || !tipos.length) return null;
  // Un apartado retirado, o una lista de fichas, no admite campos: lo dice la lectura.
  if (fila && fila.puedeAnadirCampo === false) return null;

  const vivos = fila && Array.isArray(fila.campos) ? fila.campos.filter((c) => !c.retirado).length : undefined;
  const maximo = limites && limites.camposPorApartado;
  const quedan = maximo === undefined || vivos === undefined ? undefined : Forma.caben(maximo, vivos);

  const aceptar = async (peticion, resumen) => {
    setEnviando(true);
    setError(null);
    setAviso(null);
    try {
      const r = await cambiarEstructura(documentoId, 'anadir_campo', {
        seccion,
        cuerpo: { campo: peticion, esperaPlantillaVersion: plantillaVersion },
      });
      setAbierto(false);
      setAviso(`Campo añadido: ${resumen}.`
        + (r && r.afectaUnidades && r.unidades > 1 ? ` Ha salido en ${enTodas || `las ${r.unidades} unidades`} a la vez.` : ''));
      if (onCambiado) await onCambiado('anadir_campo', r || {});
    } catch (e) {
      setError(e);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="anadir-campo">
      <div className="linea-estructura">
        <span className="suave">Campos del apartado</span>
        {abierto ? null : (
          <button
            type="button"
            className="mini"
            onClick={() => { setAbierto(true); setAviso(null); }}
            disabled={enviando || (quedan !== undefined && quedan < 1)}
          >
            Añadir un campo (tabla, texto…)
          </button>
        )}
        <span className="ayuda">
          Se añade al final del apartado y se rellena en el editor del apartado.
          {quedan !== undefined && quedan < 1 ? ' Este apartado ya tiene todos los campos que caben.' : ''}
        </span>
      </div>
      {abierto ? (
        <ElegirCampo
          tipos={tipos}
          quedan={quedan}
          enTodas={enTodas}
          ocupado={enviando}
          textoAceptar={enviando ? 'Añadiendo…' : 'Añadir el campo'}
          onAceptar={aceptar}
          onCancelar={() => setAbierto(false)}
        />
      ) : null}
      {/* Siempre montada, para que lo que dice se anuncie: ver Estructura.js. */}
      <p className={aviso ? 'bien' : 'sr'} role="status">{aviso || ''}</p>
      {error ? (
        <div className="nota nota-error" role="alert">
          <div>
            <strong>No se ha cambiado nada. </strong>{error.message}
            {error.estado === 409 ? (
              <p className="suave">
                Vuelve a cargar la página para ver la estructura como está ahora y repite el cambio
                si sigue haciendo falta.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
