// El panel de coordinación: la matriz de unidades × bloques.
//
// `GET /api/documentos/[id]/coordinacion`. Referencia: el punto 4 y el punto 16 de
// docs/mockup-v2/CAMBIOS.md y `vistaCoordinacion` de docs/mockup-v2/js/ui.js.
//
// ES LA PANTALLA QUE MIRA LA JEFATURA DE DEPARTAMENTO PARA SABER QUÉ FALTA
//
// Una fila por módulo (o materia) con quién lo lleva, una columna por bloque del
// documento, y en cada cruce cómo va esa parte. Se hace clic en una celda y te
// lleva ahí: eso es lo único que hay que hacer con esta pantalla, y es lo que no
// se puede hacer con el Word.
//
// AQUÍ NO SE CALCULA NINGÚN ESTADO
//
// El estado de cada celda lo manda el servidor, que lo saca de las tres cosas que
// la aplicación ya sabe de cada apartado —si tiene contenido, de dónde viene y si
// tiene errores de validación— con la misma regla que el árbol usa para una rama
// (`app/_lib/rutas/coordinacion.js`). Si se recalculara aquí, esta pantalla y la
// barra lateral acabarían diciendo cosas distintas del mismo módulo, que es
// justamente lo que se vino a arreglar. Los nombres y las formas de los cinco
// estados salen de `etiquetas.js`, que es la misma lista que usa el árbol.
//
// ACCESIBILIDAD DE LA MATRIZ (el camino de Reparto.js, que ya resolvió una)
//
//   - cada celda está asociada DE VERDAD a su fila, a su columna y a su grupo de
//     filas, con `scope` y con `headers`, y su botón lleva su propio nombre
//     accesible completo («Programación · Ponderaciones: con errores que impiden
//     aprobar»). Una rejilla de celdas sin encabezados asociados es ilegible sin
//     ver, y aquí el color dice cosas;
//   - EL COLOR NO ES EL ÚNICO CANAL. El prototipo pinta el fondo de la celda y
//     pone un glifo solo en dos de los cinco estados; aquí van los cinco, con las
//     formas que ya usa el árbol (anillo punteado, medio relleno, relleno, ✓ y !),
//     así que el estado se distingue en escala de grises y con el fondo apagado;
//   - se recorre con el tabulador y también con las flechas, que en un botón no
//     hacen nada propio y aquí mueven por la matriz;
//   - «no la lleva nadie» no se dice solo con el color de la fila: lleva su chip
//     con la palabra «nadie», igual que en el reparto;
//   - la tabla lleva `<caption>` para lectores, y el recuento que se mira —cuántas
//     unidades no tiene nadie, cuántos errores hay— va arriba en texto.

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { pedir } from './api';
import { GLIFO, NOMBRE_ESTADO, codigoDeUnidad } from './etiquetas';

// Los ids del catálogo valen como id de HTML casi siempre, pero no hay ninguna
// garantía: un id de sección lleva barras («modulos/mejoras») y eso rompería el
// `headers` que asocia la celda con sus encabezados, que es justo la parte que no
// se puede perder.
const idSeguro = (valor) => String(valor).replace(/[^A-Za-z0-9_-]/g, '-');

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

// Lo que se lee de una celda, en palabras. Es el nombre accesible del botón y
// también su `title`: el mismo texto, para que quien ve y quien no ve lean lo
// mismo.
function comoSeLee(unidad, bloque, celda) {
  if (!celda.estado) return `${unidad} · ${bloque}: este bloque no tiene apartados en esta unidad`;
  const partes = [`${unidad} · ${bloque}: ${NOMBRE_ESTADO[celda.estado] || celda.estado}`];
  partes.push(`${celda.conContenido} de ${plural(celda.apartados, 'apartado escrito', 'apartados escritos')}`);
  if (celda.revisados) partes.push(`${celda.revisados} revisado(s) para este curso`);
  if (celda.errores) partes.push(plural(celda.errores, 'error', 'errores'));
  if (celda.avisos) partes.push(plural(celda.avisos, 'aviso', 'avisos'));
  return `${partes.join('. ')}. Pulsa para abrirlo.`;
}

const Glifo = ({ estado }) => (
  <i className={'glifo glifo-' + (estado || 'vacio')} aria-hidden="true">{GLIFO[estado] || ''}</i>
);

// La leyenda: los cinco estados con su forma y su nombre, los mismos que el
// árbol. Va debajo de la matriz, como en el prototipo.
const Leyenda = () => (
  <ul className="leyenda">
    {['validado', 'completo', 'incompleto', 'vacio', 'errores'].map((e) => (
      <li key={e}><Glifo estado={e} /> {NOMBRE_ESTADO[e]}</li>
    ))}
    <li><span aria-hidden="true">–</span> sin apartados en esta unidad</li>
  </ul>
);

// `onComprobaciones` lleva al panel de comprobaciones, que es donde está el
// control del estado (EstadoDocumento.js): esta pantalla dice si el documento se
// puede aprobar, y hasta ahora ahí se acababa. El botón de aprobar no se duplica
// aquí —aprobar se decide con la lista de lo que falta delante, no con la
// matriz—, pero la frase deja de ser un callejón sin salida.
export default function Coordinacion({ documentoId, onIr, onComprobaciones }) {
  const [cuerpo, setCuerpo] = useState(null);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(true);
  const tabla = useRef(null);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    setError(null);
    pedir(`/api/documentos/${encodeURIComponent(documentoId)}/coordinacion`)
      .then((r) => { if (vivo) setCuerpo(r); })
      .catch((e) => { if (vivo) { setCuerpo(null); setError(e); } })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [documentoId]);

  // Las filas agrupadas por el grupo que trajo el importador («Módulos del primer
  // curso»…), en el orden en que vienen: es el del documento y el del tomo.
  const grupos = useMemo(() => {
    const orden = [];
    const porGrupo = new Map();
    for (const fila of ((cuerpo && cuerpo.filas) || [])) {
      const g = fila.grupo || 'Unidades';
      if (!porGrupo.has(g)) { porGrupo.set(g, []); orden.push(g); }
      porGrupo.get(g).push(fila);
    }
    return orden.map((g) => ({ etq: g, filas: porGrupo.get(g) }));
  }, [cuerpo]);

  // Las flechas mueven por la matriz. En un botón no hacen nada propio —se pulsa
  // con Enter o con espacio—, así que no se le quita ningún atajo a nadie, y el
  // tabulador sigue funcionando igual para quien lo prefiera.
  const flechas = useCallback((ev) => {
    const origen = ev.target;
    if (!origen || !origen.dataset || origen.dataset.fila === undefined) return;
    const paso = {
      ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0],
    }[ev.key];
    if (!paso) return;
    const fila = Number(origen.dataset.fila) + paso[0];
    const col = Number(origen.dataset.col) + paso[1];
    const destino = tabla.current
      && tabla.current.querySelector(`button[data-fila="${fila}"][data-col="${col}"]`);
    if (destino) { ev.preventDefault(); destino.focus(); }
  }, []);

  if (cargando) return <p className="suave">Mirando por dónde va el documento…</p>;

  if (error) {
    return (
      <section className="tarjeta">
        <header className="tarjeta-cab"><h2>Coordinación</h2></header>
        <div className="nota nota-lock" role="alert">
          <div>
            {error.message}
            {error.codigo === 'no_disponible' ? (
              <p className="suave">
                La ruta <code>GET /api/documentos/[id]/coordinacion</code> es del E7. El panel está
                listo: en cuanto la ruta responda, aquí sale la matriz.
              </p>
            ) : null}
            {error.codigo === 'no_encontrado' ? (
              <p className="suave">
                Un documento de otro departamento se responde igual que uno que no existe: para quien
                mira la pantalla es lo mismo (docs/api.md).
              </p>
            ) : null}
          </div>
        </div>
      </section>
    );
  }

  if (!cuerpo) return null;

  const { resumen, cuenta } = cuerpo;
  const etiqueta = cuerpo.etiqueta || 'unidad';
  const pendientes = resumen.apartados - resumen.revisados;

  const metricas = (
    <div className="metricas">
      {cuerpo.modo === 'unidades' ? (
        <div className="metrica">
          <b className={resumen.sinDocentes ? 'rojo' : 'bien'}>{resumen.sinDocentes}</b>
          <span>{resumen.sinDocentes === 1 ? 'unidad sin nadie' : 'unidades sin nadie'}</span>
        </div>
      ) : null}
      <div className="metrica">
        <b className={(cuenta.error || 0) ? 'rojo' : 'bien'}>{cuenta.error || 0}</b>
        <span>{cuenta.error === 1 ? 'error' : 'errores'}</span>
      </div>
      <div className="metrica">
        <b>{resumen.revisados}</b><span>revisados para este curso</span>
      </div>
      <div className="metrica">
        <b className={pendientes ? 'ambar' : ''}>{pendientes}</b><span>pendientes de revisar</span>
      </div>
      <div className="metrica"><b>{resumen.apartados}</b><span>apartados</span></div>
    </div>
  );

  // ------------------------------------------------------------ sin unidades
  //
  // Un documento que no se reparte por módulos —el PCCF, la memoria— no tiene
  // matriz: lo lleva la jefatura del departamento salvo los apartados que
  // delegue, igual que en el prototipo.
  if (cuerpo.modo !== 'unidades') {
    return (
      <section className="tarjeta">
        <header className="tarjeta-cab">
          <h2>Coordinación</h2>
          <span className="suave">{plural(cuerpo.filas.length, 'apartado', 'apartados')}</span>
        </header>
        <p className="suave">
          Este documento no se reparte por unidades: lo lleva la jefatura del departamento, salvo los
          apartados que asigne. Cada fila dice cómo va esa rama entera.
        </p>
        {metricas}
        <table className="tabla">
          <thead>
            <tr><th scope="col">Apartado</th><th scope="col">Cómo va</th><th scope="col">Responsable</th></tr>
          </thead>
          <tbody>
            {cuerpo.filas.map((fila) => (
              <tr key={fila.seccion}>
                <th scope="row">
                  <button className="enlace" onClick={() => onIr(fila.destino.seccion, null)}>
                    {(fila.num ? fila.num + '. ' : '') + fila.titulo}
                  </button>
                </th>
                <td>
                  <span className={'pastilla pastilla-' + (fila.estado || 'vacio')}>
                    <Glifo estado={fila.estado} />
                    {' '}
                    {fila.estado ? NOMBRE_ESTADO[fila.estado] : 'sin apartados'}
                  </span>
                  <span className="suave">
                    {' · '}
                    {fila.conContenido} de {plural(fila.apartados, 'apartado escrito', 'apartados escritos')}
                  </span>
                </td>
                <td className="suave">
                  {fila.responsables.length
                    ? fila.responsables.map((p) => p.nombre).join(', ')
                    : 'jefatura de departamento'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Leyenda />
      </section>
    );
  }

  // ------------------------------------------------------------ la matriz
  const bloques = cuerpo.bloques;

  return (
    <section className="tarjeta">
      <header className="tarjeta-cab">
        <h2>Por dónde va cada {etiqueta}</h2>
        <span className="suave">
          {plural(resumen.unidades, etiqueta, etiqueta + 's')}
          {' · '}
          {resumen.apartados
            ? Math.round((resumen.revisados / resumen.apartados) * 100)
            : 0}
          {' % revisado'}
        </span>
        {cuerpo.puedeAprobarse
          ? <span className="total bien">se puede aprobar</span>
          : <span className="total mal">{plural(cuenta.error || 0, 'error sin resolver', 'errores sin resolver')}</span>}
        {/* Neutral a propósito: quién puede aprobar lo dice `/estado` con su
            `puede`, y eso se resuelve en la pantalla a la que lleva este enlace.
            Prometer aquí «apruébalo» sería adelantarse a esa respuesta. */}
        {onComprobaciones ? (
          <button type="button" className="enlace" onClick={onComprobaciones}>
            Ver el estado y lo que falta
          </button>
        ) : null}
      </header>

      <p className="suave">
        Quién lleva cada {etiqueta} y cómo va cada bloque. Se hace clic en una celda y te lleva al
        apartado. Lo que dice cada color y cada forma está en la leyenda de abajo; es lo mismo que
        dice el punto de la barra lateral, y los errores son los del panel de comprobaciones.
      </p>

      {metricas}

      {resumen.sinDocentes ? (
        <div className="nota nota-lock">
          <div>
            <strong>
              {resumen.sinDocentes === 1
                ? `Hay 1 ${etiqueta} que no lleva nadie.`
                : `Hay ${resumen.sinDocentes} ${etiqueta}s que no lleva nadie.`}
            </strong>
            <p className="suave" style={{ margin: '4px 0 0' }}>
              Sus apartados no los puede editar ningún docente: solo la jefatura del departamento.{' '}
              <a className="enlace" href={`/reparto/${encodeURIComponent(documentoId)}`}>
                Repartir las unidades
              </a>
              .
            </p>
          </div>
        </div>
      ) : null}

      <div className="tabla-scroll">
        <table className="tabla matriz" ref={tabla} onKeyDown={flechas}>
          <caption className="sr">
            Coordinación: cada fila es una {etiqueta} del documento y cada columna un bloque. En cada
            cruce, cómo va ese bloque en esa {etiqueta}; se pulsa para abrir el apartado. Se puede
            recorrer con el tabulador o con las flechas.
          </caption>
          <thead>
            <tr>
              {/* La esquina se queda pegada igual que los nombres de las filas:
                  si no, al desplazar la matriz a lo ancho los títulos de columna
                  se salen por debajo del nombre del módulo y las cabeceras dejan
                  de cuadrar con las celdas que hay debajo. Se vio así. */}
              <th scope="col" className="esquina">{etiqueta.charAt(0).toUpperCase() + etiqueta.slice(1)}</th>
              {bloques.map((b) => (
                <th className="centro col-bloque" scope="col" id={`col-${idSeguro(b.seccion)}`} key={b.seccion}>
                  {b.titulo}
                </th>
              ))}
            </tr>
          </thead>

          {grupos.map((g, ig) => {
            // Un `<tbody>` por grupo, con su encabezado de grupo de filas:
            // `scope="rowgroup"` es lo que lo asocia de verdad a las filas que
            // vienen debajo, como en Reparto.js.
            const idGrupo = `grp-${ig}`;
            return (
              <tbody key={g.etq}>
                <tr className="asig-seccion">
                  <th colSpan={bloques.length + 1} scope="rowgroup" id={idGrupo}>
                    {/* La fila del grupo ocupa el ancho entero, así que al
                        desplazar la matriz su título se iría por la izquierda y
                        quedaría «· 5 módulos» a secas. El texto se queda pegado
                        al borde dentro de su propia celda. */}
                    <span className="pegada">
                      {g.etq}
                      <span className="suave">
                        {' · '}
                        {plural(g.filas.length, etiqueta, etiqueta + 's')}
                      </span>
                    </span>
                  </th>
                </tr>

                {g.filas.map((fila) => {
                  const cod = codigoDeUnidad(fila.unidadId);
                  const idFila = `fil-${idSeguro(fila.unidadId)}`;
                  // El índice de fila es continuo entre grupos: las flechas
                  // arriba y abajo tienen que cruzar de un grupo al siguiente,
                  // que es lo que hace un lector al mirar.
                  const indice = grupos.slice(0, ig).reduce((n, x) => n + x.filas.length, 0)
                    + g.filas.indexOf(fila);
                  return (
                    <tr key={fila.unidadId} className={fila.sinDocentes ? 'asig-sin-nadie' : ''}>
                      <th scope="row" id={idFila} headers={idGrupo}>
                        <button className="enlace" onClick={() => onIr(fila.destino.seccion, fila.unidadId)}>
                          {fila.titulo}
                        </button>
                        {cod ? (
                          <span className={'chip chip-cod' + (cod.confirmado ? '' : ' chip-vacio')}>
                            {cod.texto}
                          </span>
                        ) : null}
                        {/* Quién lo lleva: es la otra mitad de la pregunta de
                            esta pantalla. Y «nadie» va con la palabra, no solo
                            con el color de la fila. */}
                        <span className="suave">
                          {fila.docentes.length
                            ? fila.docentes.map((d) => d.nombre).join(', ')
                            : null}
                        </span>
                        {fila.sinDocentes ? <span className="chip chip-error">nadie</span> : null}
                        {fila.cuenta.error ? (
                          <span className="marca-error">{plural(fila.cuenta.error, 'error', 'errores')}</span>
                        ) : null}
                      </th>

                      {bloques.map((b, ib) => {
                        const celda = fila.celdas[ib] || {};
                        if (!celda.estado) {
                          return (
                            <td
                              className="celda vacia"
                              key={b.seccion}
                              headers={`${idGrupo} ${idFila} col-${idSeguro(b.seccion)}`}
                              title="Este bloque no tiene apartados en esta unidad"
                            >
                              <span aria-hidden="true">–</span>
                              <span className="sr">sin apartados en esta unidad</span>
                            </td>
                          );
                        }
                        const leido = comoSeLee(fila.titulo, b.titulo, celda);
                        return (
                          <td
                            className={'celda celda-' + celda.estado}
                            key={b.seccion}
                            headers={`${idGrupo} ${idFila} col-${idSeguro(b.seccion)}`}
                          >
                            <button
                              type="button"
                              data-fila={indice}
                              data-col={ib}
                              aria-label={leido}
                              title={leido}
                              onClick={() => onIr(celda.destino.seccion, celda.destino.unidadId)}
                            >
                              <Glifo estado={celda.estado} />
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            );
          })}
        </table>
      </div>

      <Leyenda />

      <p className="ayuda">
        El estado de cada celda resume la rama entera: «incompleto» quiere decir que dentro queda
        algún apartado sin escribir, y un bloque solo cuenta como revisado cuando lo está todo lo que
        tiene dentro. Un apartado heredado del curso pasado está pendiente aunque esté lleno de texto
        (vista <strong>Cambios</strong> de cada apartado). Los errores son los del panel de{' '}
        <strong>Validaciones</strong>, contados por el mismo cálculo: un error de la unidad —que no la
        lleve nadie— sale al lado de su nombre y no en una celda, porque no es de ningún apartado.
      </p>
    </section>
  );
}
