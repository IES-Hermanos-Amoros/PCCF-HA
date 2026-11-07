// El panel de comprobaciones del documento, agrupadas.
//
// `GET /api/documentos/[id]/validaciones`. Referencia: el punto 5 de
// docs/mockup-v2/CAMBIOS.md y `vistaValidaciones` de docs/mockup-v2/js/ui.js.
//
// POR QUÉ AGRUPADO Y NO UNA LISTA PLANA
//
// Porque sobre el documento real salen decenas de avisos, y una lista de
// cincuenta líneas no dice a quién hay que avisar, que es lo primero que se
// pregunta la jefatura de departamento. Un grupo por módulo o materia, más uno
// de apartados comunes, cada uno con cuántos errores y avisos tiene y **quién lo
// lleva**, y abierto por defecto si tiene errores: lo que hay que mirar está
// abierto y lo demás no estorba.
//
// Y DENTRO, CADA AVISO ES UN ENLACE AL APARTADO QUE FALLA
//
// Eso es lo que le faltaba al v1: los avisos se leían y luego había que buscar a
// mano el apartado del que hablaban, entre 245. Cada aviso trae su `destino`
// (sección y unidad) y un clic lleva allí.
//
// LA REGLA LA PONE EL SERVIDOR. ESTE PANEL REFLEJA
//
// Las comprobaciones son de `core/validaciones.js`, compartidas con el motor del
// PDF, y la ruta las calcula sobre el documento guardado. Aquí no se vuelve a
// comprobar nada, no se filtra nada y no se recuenta nada por nuestra cuenta: se
// enseña lo que manda el servidor, con sus palabras.
//
// EL CONVENIO DE LAS PONDERACIONES, QUE NO ES UN FALLO NUESTRO
//
// Sobre el documento real salen unos 22 avisos de criterios que suman 100 %
// dentro de su RA. Es **otro convenio de ponderación**, legítimo, y cuál vale es
// una decisión del departamento que todavía no se ha tomado (está explicada en
// el comentario largo de `core/validaciones.js`). El servidor los distingue con
// su propia redacción y su propia severidad.
//
// Lo que hace este panel es respetarlo: la etiqueta de cada aviso sale de una
// tabla de severidades en la que `info` se lee «hay que decidirlo» y no «aviso»,
// y una severidad que no conozcamos se enseña tal como viene en lugar de
// aplastarse a «aviso». El panel **no los esconde, no los filtra y no los cuenta
// aparte**: eso sería tomar la decisión por el departamento, en la pantalla y en
// silencio.
//
// SI LA RUTA TODAVÍA NO ESTÁ
//
// Se dice. `api.js` convierte la página de error de Next en un `no_disponible`
// con su mensaje, y aquí se enseña eso: es mejor que una pantalla vacía que
// parece decir que el documento no tiene nada pendiente.

'use client';

import { useEffect, useMemo, useState } from 'react';
import Val from '../../core/validaciones';
import { pedir } from './api';

// Cómo se lee cada severidad. `info` es donde caen las decisiones pendientes
// —el convenio de las ponderaciones—, y por eso no dice «aviso»: dice que hay
// que decidirlo. Una severidad que no esté aquí se enseña con su propio nombre.
const SEVERIDAD = {
  error: { etiqueta: 'Error', orden: 0 },
  aviso: { etiqueta: 'Aviso', orden: 1 },
  info: { etiqueta: 'Hay que decidirlo', orden: 2 },
};

const ordenDe = (s) => (SEVERIDAD[s] ? SEVERIDAD[s].orden : 3);

// Cómo se lee UN aviso. La severidad la pone el servidor y no se toca; lo que se
// mira además es su marca `convenio`, que es con la que `core/validaciones.js`
// distingue el aviso que casi nunca es una errata —los criterios de un RA suman
// exactamente 100 %, que es el otro convenio— del descuadre de verdad. Con esa
// marca el aviso se lee «por decidir» en lugar de «error», que es lo que es: una
// decisión del departamento, no un fallo de nadie.
function comoSeLee(aviso) {
  if (aviso && aviso.convenio) return 'Por decidir';
  const s = aviso ? aviso.severidad : null;
  return SEVERIDAD[s] ? SEVERIDAD[s].etiqueta : String(s || 'aviso');
}

const plural = (n, uno, varios) => n + ' ' + (n === 1 ? uno : varios);

// Quién lleva el grupo. La ruta lo manda hecho; se admiten las dos formas
// razonables —nombres o personas— para no depender de un detalle del cuerpo.
function responsablesDe(grupo) {
  const lista = grupo.responsables || grupo.docentes || [];
  return lista
    .map((x) => (typeof x === 'string' ? x : (x && (x.nombre || x.id))))
    .filter(Boolean);
}

// Los avisos llegan agrupados por unidad. Si la ruta los manda en una lista
// plana, se agrupan aquí con el mismo criterio: la unidad del destino, y un
// grupo de apartados comunes para los que no tienen.
function agrupar(cuerpo) {
  if (Array.isArray(cuerpo.grupos)) return cuerpo.grupos;

  const avisos = Array.isArray(cuerpo.avisos) ? cuerpo.avisos : [];
  const porUnidad = new Map();
  for (const a of avisos) {
    const clave = (a.destino && a.destino.unidadId) || a.unidadId || '';
    if (!porUnidad.has(clave)) porUnidad.set(clave, []);
    porUnidad.get(clave).push(a);
  }
  return [...porUnidad.entries()].map(([unidadId, avisosDe]) => ({
    unidadId: unidadId || null,
    titulo: unidadId || 'Apartados comunes',
    avisos: avisosDe,
  }));
}

export default function Validaciones({ documentoId, onIr }) {
  const [cuerpo, setCuerpo] = useState(null);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(true);
  // Qué grupos están abiertos. Arranca con los que tienen errores, que es el
  // criterio del prototipo, y a partir de ahí lo lleva quien mira.
  const [abiertos, setAbiertos] = useState(null);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    setError(null);
    pedir(`/api/documentos/${encodeURIComponent(documentoId)}/validaciones`)
      .then((r) => { if (vivo) { setCuerpo(r); setAbiertos(null); } })
      .catch((e) => { if (vivo) { setCuerpo(null); setError(e); } })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [documentoId]);

  const grupos = useMemo(() => {
    if (!cuerpo) return [];
    return agrupar(cuerpo)
      .map((g, i) => {
        const avisos = (g.avisos || g.lista || []).slice()
          .sort((x, y) => ordenDe(x.severidad) - ordenDe(y.severidad));
        return {
          ...g,
          avisos,
          // El recuento del servidor si lo manda; si no, el de core/, que es la
          // misma función que usa el servidor.
          cuenta: g.cuenta || Val.cuenta(avisos),
          responsables: responsablesDe(g),
          clave: g.unidadId || 'comun-' + i,
        };
      })
      .sort((a, b) => (b.cuenta.error - a.cuenta.error) || (b.cuenta.aviso - a.cuenta.aviso));
  }, [cuerpo]);

  const todos = useMemo(() => grupos.flatMap((g) => g.avisos), [grupos]);
  const conAlgo = useMemo(() => grupos.filter((g) => g.avisos.length), [grupos]);
  const cuenta = (cuerpo && cuerpo.cuenta) || Val.cuenta(todos);
  const aprobable = cuerpo && cuerpo.puedeAprobarse !== undefined
    ? !!cuerpo.puedeAprobarse
    : Val.puedeAprobarse(todos);

  const abierto = (g) => (abiertos ? abiertos.has(g.clave) : g.cuenta.error > 0);
  // `<details>` ya se abre y se cierra solo; esto solo recuerda cuáles, para que
  // un repintado (otro documento, otra lectura) no los vuelva a cerrar.
  const anotar = (g, estaAbierto) => {
    setAbiertos((previos) => {
      const base = previos || new Set(grupos.filter((x) => x.cuenta.error > 0).map((x) => x.clave));
      const siguiente = new Set(base);
      if (estaAbierto) siguiente.add(g.clave); else siguiente.delete(g.clave);
      return siguiente;
    });
  };

  if (cargando) return <p className="suave">Comprobando el documento…</p>;

  if (error) {
    return (
      <section className="tarjeta">
        <header className="tarjeta-cab"><h2>Comprobaciones del documento</h2></header>
        <div className="nota nota-lock" role="alert">
          <div>
            {error.message}
            {error.codigo === 'no_disponible' ? (
              <p className="suave">
                La ruta <code>GET /api/documentos/[id]/validaciones</code> es del E4 y se está
                escribiendo. El panel está listo: en cuanto la ruta responda, los avisos salen aquí
                agrupados por módulo y con enlace al apartado que falla.
              </p>
            ) : null}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="tarjeta">
      <header className="tarjeta-cab">
        {/* El título de la pantalla lo pone la cabecera de la página; aquí va
            lo que de verdad se pregunta desde fuera, para no decir dos veces lo
            mismo una debajo de otra. */}
        <h2>Lo que falta por arreglar</h2>
        {aprobable
          ? <span className="total bien">se puede aprobar</span>
          : <span className="total mal">{plural(cuenta.error || 0, 'error sin resolver', 'errores sin resolver')}</span>}
      </header>

      <p className="suave">
        Las mismas comprobaciones que salen en la cajita roja al final del PDF, pero antes de
        exportar: agrupadas por quién tiene que arreglarlas y con enlace al apartado que falla. Los
        errores impiden aprobar el documento; los avisos, no.
      </p>
      <p className="ayuda">
        Hay avisos que no son fallos sino <strong>decisiones pendientes del departamento</strong>:
        los criterios que reparten 100 % dentro de su resultado de aprendizaje, que es el otro
        convenio de ponderación que usa el documento. Salen con las palabras, la severidad y el
        recuento que les pone el servidor (<code>core/validaciones.js</code>), que los distingue con
        su marca <code>convenio</code>; esta pantalla no los esconde ni los recuenta por su cuenta,
        porque cuál de los dos convenios vale no lo decide una pantalla.
        {cuerpo.convenioCe ? (
          <>
            {' '}Medido con el convenio <code>{cuerpo.convenioCe}</code>, el mismo con el que se
            imprime el PDF: por eso estos avisos coinciden uno a uno con los de su cajita roja.
          </>
        ) : null}
      </p>

      <div className="metricas">
        <div className="metrica">
          <b className={cuenta.error ? 'rojo' : ''}>{cuenta.error || 0}</b>
          <span>{cuenta.error === 1 ? 'error' : 'errores'}</span>
        </div>
        <div className="metrica">
          <b className={cuenta.aviso ? 'ambar' : ''}>{cuenta.aviso || 0}</b>
          <span>{cuenta.aviso === 1 ? 'aviso' : 'avisos'}</span>
        </div>
        {cuenta.info ? (
          <div className="metrica">
            <b>{cuenta.info}</b><span>{cuenta.info === 1 ? 'informativo' : 'informativos'}</span>
          </div>
        ) : null}
        {/* El recuento de los que son decisión de convenio lo manda el servidor
            (`delOtroConvenio`): se enseña porque es la diferencia entre «hay 34
            fallos» y «hay 12 fallos y 22 cosas que hay que decidir», no porque
            esta pantalla haya separado nada. */}
        {cuerpo.delOtroConvenio ? (
          <div className="metrica">
            <b>{cuerpo.delOtroConvenio}</b><span>de ellos, convenio por decidir</span>
          </div>
        ) : null}
        <div className="metrica">
          <b>{conAlgo.length}</b><span>{'de ' + grupos.length + ' grupos, con algo pendiente'}</span>
        </div>
      </div>

      {!todos.length ? (
        <p className="bien">No hay nada pendiente en este documento.</p>
      ) : grupos.map((g) => (
        <details
          className="grupo-avisos"
          key={g.clave}
          open={abierto(g)}
          onToggle={(ev) => anotar(g, ev.target.open)}
        >
          <summary>
            <b>{g.titulo || 'Apartados comunes'}</b>
            {g.cuenta.error ? (
              <span className="marca-error">{plural(g.cuenta.error, 'error', 'errores')}</span>
            ) : null}
            {g.cuenta.aviso ? (
              <span className="marca-aviso">{plural(g.cuenta.aviso, 'aviso', 'avisos')}</span>
            ) : null}
            {g.cuenta.info ? (
              <span className="marca-aviso">{plural(g.cuenta.info, 'informativo', 'informativos')}</span>
            ) : null}
            {/* Un grupo sin nada pendiente también sale: la pregunta que se le
                hace a esta pantalla es «qué módulo tengo que mirar», y un módulo
                que no aparece no se distingue de un módulo que está bien. */}
            {!g.avisos.length ? <span className="chip chip-validado">sin nada pendiente</span> : null}
            {/* Quién lo lleva: es la pregunta que se le hace a esta pantalla. */}
            <span className="suave">
              {g.unidadId
                ? (g.responsables.length ? g.responsables.join(', ') : 'sin docente asignado')
                : 'jefatura de departamento'}
            </span>
          </summary>

          {!g.avisos.length ? (
            <p className="bien" style={{ padding: '2px 12px 12px', margin: 0 }}>
              Nada pendiente en este grupo.
            </p>
          ) : null}

          <ul className="lista-avisos grande">
            {g.avisos.map((a, i) => {
              const destino = a.destino || null;
              return (
                <li className={a.severidad} key={i}>
                  <span className="sev">{comoSeLee(a)}</span>
                  <div>
                    {/* La marca del servidor, a la vista: así se distingue de un
                        descuadre de verdad sin esconder ni recontar nada. */}
                    {a.convenio ? (
                      <span className="marca-aviso">decisión de convenio pendiente</span>
                    ) : null}
                    {destino && destino.seccion && onIr ? (
                      <button
                        type="button"
                        className="enlace"
                        onClick={() => onIr(destino.seccion, destino.unidadId || null)}
                      >
                        {a.titulo}
                      </button>
                    ) : <b>{a.titulo}</b>}
                    {a.detalle ? <span>{a.detalle}</span> : null}
                    {destino && destino.seccion && onIr ? null : (
                      <span className="suave">
                        Este aviso no dice de qué apartado es, así que no lleva enlace.
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </details>
      ))}
    </section>
  );
}
