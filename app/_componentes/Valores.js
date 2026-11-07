// El contenido de un apartado, en solo lectura. En el E1 se navega y se exporta;
// editar es el E3.
//
// POR QUÉ SE REPARTE POR LA FORMA DEL VALOR Y NO SOLO POR `campo.tipo`
//
// Los tipos de campo de la plantilla son once y van a ser más: el importador los
// deduce del Word, así que el día que un documento traiga una tabla que no
// encaja en ninguno aparece un tipo nuevo. Un reparto cerrado por tipo deja ese
// apartado en blanco —el fallo peor de todos, porque parece que el documento no
// dice nada—, mientras que uno que mira lo que hay dentro del valor lo pinta
// igual: una tabla con `filas` se pinta como tabla se llame como se llame el
// tipo. Es el «fallback genérico» de docs/interfaz-web.md §3.2, pero por
// omisión en lugar de como excepción.
//
// `campo.tipo` se sigue usando para dos cosas en las que la forma no basta: la
// etiqueta que se pone encima y saber que una sección es repetidora.
//
// LAS TABLAS DEL WORD SE VEN Y NO SE EDITAN
//
// La ficha del módulo, la de resultados de aprendizaje y criterios, los
// contenidos básicos y las fichas de situación de aprendizaje vienen del Word
// como tablas con `colspan` y `rowspan`, y se pintan tal como vienen. Es lo
// mismo que hace el prototipo y por el mismo motivo: cada una necesita su propio
// editor, y mientras no exista al menos se leen, en lugar de desaparecer del
// apartado.

'use client';

import { Fragment } from 'react';

// ---------------------------------------------------------------- texto con formato

// `text` puede ser una cadena o una lista de tramos `{ text, bold, italics }`,
// que es lo que acepta pdfmake y lo que el modelo guarda desde el E0. Los saltos
// de línea del Word se respetan: dentro de una celda son parte del contenido.
function Tramos({ valor }) {
  const trozos = Array.isArray(valor) ? valor : [{ text: valor == null ? '' : String(valor) }];
  return trozos.map((t, i) => {
    const texto = t && typeof t === 'object' ? String(t.text == null ? '' : t.text) : String(t);
    const lineas = texto.split('\n');
    const cuerpo = lineas.map((l, j) => (
      <span key={j}>{j > 0 ? <br /> : null}{l}</span>
    ));
    if (t && t.bold && t.italics) return <strong key={i}><em>{cuerpo}</em></strong>;
    if (t && t.bold) return <strong key={i}>{cuerpo}</strong>;
    if (t && t.italics) return <em key={i}>{cuerpo}</em>;
    return <span key={i}>{cuerpo}</span>;
  });
}

// ---------------------------------------------------------------- tablas

// Las celdas cubiertas por un `colspan` o un `rowspan` vienen OMITIDAS del
// modelo (las reconstruye `rejilla()` en el motor), así que aquí se pintan tal
// cual: el navegador hace lo mismo que el PDF con los mismos atributos.
function Tabla({ filas, etiqueta }) {
  if (!Array.isArray(filas) || !filas.length) return null;
  return (
    <div className="bloque bloque-tabla">
      <span className="tabla-etq">{(etiqueta || 'tabla del documento') + ' · todavía sin editor'}</span>
      <div className="tabla-marco">
        <table className="tabla-doc">
          <tbody>
            {filas.map((fila, i) => (
              <tr key={i}>
                {(fila || []).map((c, j) => {
                  const props = {
                    colSpan: c && c.colspan > 1 ? c.colspan : undefined,
                    rowSpan: c && c.rowspan > 1 ? c.rowspan : undefined,
                  };
                  const contenido = <Tramos valor={c ? c.text : ''} />;
                  return c && c.bold
                    ? <th key={j} {...props}>{contenido}</th>
                    : <td key={j} {...props}>{contenido}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const Pares = ({ pares, etiqueta }) => (
  <Tabla
    etiqueta={etiqueta}
    filas={(pares || []).map((p) => [{ text: p.etiqueta, bold: true }, { text: p.valor }])}
  />
);

// Cada resultado de aprendizaje con sus criterios debajo, como en el prototipo.
const RaCe = ({ ra, etiqueta }) => (
  <Tabla
    etiqueta={etiqueta}
    filas={(ra || []).reduce((filas, r) => filas
      .concat([[{ text: 'RA' + r.num, bold: true }, { text: r.texto, bold: true, colspan: 2 }]])
      .concat((r.ce || []).map((ce) => [
        { text: '' }, { text: ce.letra + ')', bold: true }, { text: ce.texto },
      ])), [])}
  />
);

// ---------------------------------------------------------------- ponderaciones
//
// Las sumas se calculan y se enseñan; lo que NO se hace es dar un veredicto.
//
// Es tentador pintar en rojo el RA cuyos criterios no suman su peso, que es lo
// que hace el prototipo. Pero el documento real usa DOS convenios a la vez, y
// `core/validaciones.js` los distingue: unos módulos reparten el peso del RA
// entre sus criterios (un RA que pondera 15, criterios que suman 15) y otros
// reparten 100 % dentro del RA (un RA que pondera 5, criterios que suman 100).
// Con la regla estricta, los segundos salen todos en rojo sin estar mal; con la
// tolerante, un 100 escrito donde iba un 30 pasa desapercibido.
//
// Cuál de los dos convenios se aplica lo decide el motor campo a campo, y el
// criterio de aceptación del E4 es que los avisos de la interfaz coincidan **uno
// a uno** con los de la cajita roja del PDF. Un veredicto escrito aquí a ojo los
// haría discrepar, que es peor que no tener veredicto: a quien revisa le
// enseñaría siete errores donde el PDF no enseña ninguno.
function Ponderaciones({ lista }) {
  const total = lista.reduce((s, r) => s + (Number(r.ponderacion) || 0), 0);
  const redondo = Math.round(total * 100) / 100;
  return (
    <section className="tarjeta">
      <header className="tarjeta-cab">
        <h2>Ponderaciones</h2>
        <span className="total">los resultados de aprendizaje suman {redondo} %</span>
      </header>
      <table className="tabla tabla-pond">
        <thead>
          <tr><th /><th>Resultado de aprendizaje y criterios</th><th className="centro">Peso</th></tr>
        </thead>
        <tbody>
          {lista.map((r, i) => {
            const suma = (r.ce || []).reduce((s, c) => s + (Number(c.ponderacion) || 0), 0);
            const sumaRedonda = Math.round(suma * 100) / 100;
            const peso = Number(r.ponderacion) || 0;
            return (
              <Fragment key={i}>
                <tr className="fila-ra">
                  <td><b>RA{r.ra}</b></td>
                  <td><Tramos valor={r.texto} /></td>
                  <td className="centro">{peso} %</td>
                </tr>
                {(r.ce || []).map((c, j) => (
                  <tr className="fila-ce" key={j}>
                    <td className="letra">{c.letra})</td>
                    <td><Tramos valor={c.texto} />{c.fundamental ? <span className="distintivo"> fundamental</span> : null}</td>
                    <td className="centro">{Number(c.ponderacion) || 0} %</td>
                  </tr>
                ))}
                <tr className="fila-suma">
                  <td />
                  <td className="derecha suave">suma de los criterios del RA{r.ra}</td>
                  <td className="centro"><b>{sumaRedonda} %</b></td>
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
      <p className="ayuda">
        Las sumas salen de la tabla; comprobar que cuadran es trabajo del panel de validaciones, que
        usa la misma regla que la cajita roja del PDF.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------- bloques de texto

// Un bloque `{ ref: 'c001' }` es un texto compartido: se guarda una vez y los
// módulos lo referencian. Llega resuelto en la misma respuesta del apartado
// (docs/api.md, «Por qué el apartado viaja con sus campos y sus compartidos»),
// porque sin el texto al que apunta es un hueco en la pantalla.
function Compartido({ cid, compartidos }) {
  const c = compartidos && compartidos[cid];
  if (!c) return <p className="bloque aviso-roto">[texto compartido {cid} no encontrado]</p>;
  return (
    <div className="bloque bloque-compartido">
      <div className="compartido-cab">
        <span className="distintivo distintivo-com">texto compartido {cid} · v{c.version}</span>
        <span className="suave">
          {c.modo === 'obligatorio' ? 'obligatorio: no se puede desvincular' : 'sugerido'}
          {c.comun ? ' · copiado de un apartado común' : ''}
        </span>
      </div>
      <p className="bloque"><Tramos valor={c.bloque && c.bloque.text} /></p>
    </div>
  );
}

function Bloques({ bloques, compartidos }) {
  return bloques.map((b, i) => {
    if (b && typeof b.ref === 'string') return <Compartido key={i} cid={b.ref} compartidos={compartidos} />;
    if (b && b.type === 'list') {
      return (
        <ul className="bloque" key={i}>
          {(b.items || []).map((it, j) => (
            <li key={j} style={{ marginLeft: (it.level || 0) * 18 }}><Tramos valor={it.text} /></li>
          ))}
        </ul>
      );
    }
    if (b && b.type === 'tabla') return <Tabla key={i} filas={b.filas} etiqueta={b.etiqueta} />;
    return <p className="bloque" key={i}><Tramos valor={b && b.text} /></p>;
  });
}

// ---------------------------------------------------------------- el reparto

const vacio = (v) => v === null || v === undefined
  || (typeof v === 'string' && v.trim() === '')
  || (Array.isArray(v) && v.length === 0);

const esBloque = (x) => !!x && typeof x === 'object' && (typeof x.type === 'string' || typeof x.ref === 'string');

// Un valor suelto, con la etiqueta de su campo si hace falta.
function Valor({ valor, etiqueta, compartidos }) {
  if (vacio(valor)) return null;

  if (typeof valor === 'string') return <p className="bloque">{valor}</p>;

  if (Array.isArray(valor)) {
    if (valor.every(esBloque)) return <Bloques bloques={valor} compartidos={compartidos} />;
    // Las ponderaciones son la única lista de objetos con `ponderacion`: la
    // tabla importada viene además en `filas`, pero la estructurada se lee
    // mejor y es la que lleva las sumas.
    if (valor.some((x) => x && typeof x === 'object' && x.ponderacion !== undefined)) {
      return <Ponderaciones lista={valor} />;
    }
    if (valor.every((x) => x && typeof x === 'object' && Array.isArray(x.filas))) {
      return valor.map((x, i) => <Tabla key={i} filas={x.filas} etiqueta={etiqueta} />);
    }
    return <SinVista valor={valor} etiqueta={etiqueta} />;
  }

  if (typeof valor === 'object') {
    if (Array.isArray(valor.ra)) return <RaCe ra={valor.ra} etiqueta={etiqueta} />;
    if (Array.isArray(valor.pares)) return <Pares pares={valor.pares} etiqueta={etiqueta} />;
    if (Array.isArray(valor.filas)) return <Tabla filas={valor.filas} etiqueta={etiqueta} />;
    return <SinVista valor={valor} etiqueta={etiqueta} />;
  }

  return <p className="bloque">{String(valor)}</p>;
}

// Lo que no se sabe pintar se enseña tal cual en lugar de no enseñarse: un
// apartado en blanco se confunde con un apartado vacío, y eso manda a alguien a
// buscar en el Word por qué «se ha perdido» un texto que está guardado.
const SinVista = ({ valor, etiqueta }) => (
  <details className="tarjeta fidelidad">
    <summary>{etiqueta || 'Campo'} · esta vista todavía no sabe pintarlo</summary>
    <p className="suave">
      El contenido está guardado y sale en el PDF; lo que falta es la vista. Mientras tanto, tal como
      está en la base de datos:
    </p>
    <pre>{JSON.stringify(valor, null, 1)}</pre>
  </details>
);

// ---------------------------------------------------------------- el apartado entero

export default function Valores({ campos, valores, compartidos, repetidor, titulo }) {
  const lista = Array.isArray(campos) ? campos : [];

  // Una sección repetidora guarda sus ítems en `{ items: [...] }` y cada ítem
  // lleva los campos de la sección: es la situación de aprendizaje, que no es un
  // texto sino una ficha con sus apartados. El PDF tampoco la numera con el
  // número de la sección: pinta «Situación de aprendizaje 1: …», y aquí igual.
  if (repetidor && valores && Array.isArray(valores.items)) {
    if (!valores.items.length) {
      return <p className="vacio-apartado">Este apartado no tiene ninguna ficha todavía.</p>;
    }
    return valores.items.map((item, i) => (
      <section className="tarjeta" key={i}>
        <header className="tarjeta-cab">
          <h2>{(titulo || 'Ficha') + ' ' + (i + 1)}{item && item.titulo ? ': ' + item.titulo : ''}</h2>
        </header>
        {lista.map((campo) => (
          <Valor
            key={campo.id}
            valor={item ? item[campo.id] : null}
            etiqueta={campo.etiqueta}
            compartidos={compartidos}
          />
        ))}
      </section>
    ));
  }

  const conAlgo = lista.filter((campo) => !vacio(valores && valores[campo.id]));
  if (!conAlgo.length) {
    return (
      <p className="vacio-apartado">
        Este apartado está vacío. Escribir en él llega con el editor del E3.
      </p>
    );
  }

  return conAlgo.map((campo) => (
    <section className="tarjeta" key={campo.id}>
      <header className="tarjeta-cab"><h2>{campo.etiqueta || campo.id}</h2></header>
      <div className="bloques">
        <Valor valor={valores[campo.id]} etiqueta={campo.etiqueta} compartidos={compartidos} />
      </div>
    </section>
  ));
}
