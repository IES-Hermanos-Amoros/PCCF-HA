// Las ponderaciones de los resultados de aprendizaje y de sus criterios, con la
// suma en vivo. Es donde más se equivoca la gente.
//
// POR QUÉ LA SUMA SE VE MIENTRAS SE ESCRIBE
//
// Hasta ahora esta tabla solo se leía (`Valores.js`), y la única forma de saber
// si cuadraba era exportar el PDF y mirar la cajita roja del final. Un apartado
// con siete u ocho RA y setenta criterios no se suma a mano: se escribe, se
// exporta, y el error aparece media hora después. Aquí la suma de cada RA y el
// total están siempre a la vista y cambian con cada tecla.
//
// LA REGLA LA PONE core/validaciones.js, NO ESTA PANTALLA
//
// `Valores.js` decidió a propósito no dar veredicto: el documento real usa DOS
// convenios para repartir el peso de los criterios y, con la regla estricta, los
// módulos que reparten 100 % dentro del RA salían todos en rojo sin estar mal.
//
// Esto no lo arregla pintando a ojo: usa `core/validaciones.cuadraCriterios` con
// el convenio **laxo** (`peso_del_ra_o_cien`), que es el que usa la interfaz —el
// motor usa el estricto para imprimir— y es por tanto la misma regla que el
// panel de validaciones del documento. Así la pantalla y el panel no pueden
// decir cosas distintas sobre la misma tabla.
//
// Y cuando un RA cuadra por el convenio relativo (sus criterios suman 100 % en
// lugar del peso del RA) la fila **no sale en rojo**: sale marcada como reparto
// dentro del RA y con un «sin decidir», porque cuál de los dos convenios vale es
// una decisión del departamento que todavía no se ha tomado. Convertirla en un
// error en la pantalla sería tomarla por nuestra cuenta.
//
// POR QUÉ EL CAMPO ES DE TEXTO Y NO `type="number"`
//
// Porque aquí se escriben comas. El documento real trae valores como 10,02 y
// 16,67, y quien escribe una programación en castellano teclea «0,5». Un
// `<input type="number">` considera «0,5» un valor inválido y devuelve una cadena
// vacía, así que al teclear la coma el peso se habría borrado sin que nada lo
// dijera. Se lee con coma o con punto y se enseña con coma, como el resto de la
// aplicación (`Core.validaciones.porcentaje`).
//
// LO QUE SE GUARDA ES EL MODELO, Y `filas` NO SE MANDA
//
// El valor de este campo lleva la tabla tal como vino del Word (`filas`) y el
// modelo con los RA, sus criterios y sus pesos. El motor, cuando el modelo está
// (`p.ra` no es nulo), **monta la tabla desde el modelo e ignora `filas`**
// (`pintarPonderaciones` en motor/render-generico.js), así que cambiar un peso en
// el modelo sí llega al PDF.
//
// Y `filas` se queda fuera del `PATCH` a propósito, porque es lo que pide la
// puerta (`core/estructurados.js`, `motivoDePonderacion`): la conserva el
// servidor, emparejada por RA, porque de su primera celda sale el código del
// módulo —«Resultado de aprendizaje (0614.1)»— que el modelo no guarda y que el
// exportador a Word necesita. Mandarla sería poder estropearla.
//
// Las tablas que el importador no supo estructurar (`ra: null`) no se pueden
// guardar por esta ruta, así que el campo entero se queda en lectura cuando hay
// alguna: media tabla editable y media no es peor que ninguna, y guardar solo las
// estructuradas perdería las otras, porque el PATCH sustituye el campo entero.
// Con el documento real no pasa: sus 76 tablas están estructuradas.

'use client';

import { Fragment, useState } from 'react';
import Val from '../../core/validaciones';
import { Tabla, Tramos } from './Valores';

// El convenio de la interfaz, el mismo que el panel de validaciones. Ver la
// cabecera y el comentario largo de core/validaciones.js.
const CONVENIO = Val.CONVENIOS_CE.PESO_DEL_RA_O_CIEN;

const TOLERANCIA = 0.01;

// Con coma, que es como se escribe un decimal en castellano.
const conComa = (n) => (n === null || n === undefined || n === '' ? '' : String(n).replace('.', ','));

// Acepta coma y punto. Devuelve null cuando no hay número: un peso en blanco es
// un peso sin poner, que no es lo mismo que un cero.
function aNumero(texto) {
  const t = String(texto === null || texto === undefined ? '' : texto).trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;   // undefined = no se puede leer
}

const suma = (pesos) => Math.round(Val.sumaPesos(pesos) * 100) / 100;

// ---------------------------------------------------------------- un peso

// El borrador es lo que hay teclado, que puede no ser un número todavía («1,»).
// Mientras no se pueda leer no se toca el modelo, pero lo teclado se queda en el
// campo: un campo que se borra solo porque has escrito la coma parece estropeado.
function Peso({ valor, etiqueta, editable, onCambio }) {
  const [borrador, setBorrador] = useState(null);

  if (!editable) return <span>{Val.porcentaje(valor)}</span>;

  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={etiqueta}
      value={borrador === null ? conComa(valor) : borrador}
      onChange={(ev) => {
        const texto = ev.target.value;
        setBorrador(texto);
        const n = aNumero(texto);
        if (n !== undefined) onCambio(n);
      }}
      onBlur={() => setBorrador(null)}
    />
  );
}

// ---------------------------------------------------------------- una tabla de RA
//
// Cada tabla de ponderaciones del campo es un RA con sus criterios. El estado de
// la fila de suma se calcula aquí, en el repintado, y no retocando el DOM: con
// React el valor y la suma salen del mismo modelo, así que no pueden separarse.
function TablaRa({ pond, indice, editable, onCambio }) {
  const pesosCe = (pond.ce || []).map((c) => c.ponderacion);
  const sumaCe = suma(pesosCe);
  const peso = Number(pond.ponderacion) || 0;
  const cuadra = Val.cuadraCriterios(pond.ponderacion, pesosCe, CONVENIO);
  // Cuadra, pero no con el peso del RA: es el convenio relativo (los criterios
  // reparten 100 % dentro del RA). Ni error ni acierto: decisión pendiente.
  const relativo = cuadra && Math.abs(sumaCe - peso) >= TOLERANCIA;

  const cambiarRa = (n) => onCambio(indice, { ...pond, ponderacion: n });
  const cambiarCe = (j, n) => onCambio(indice, {
    ...pond,
    ce: pond.ce.map((c, k) => (k === j ? { ...c, ponderacion: n } : c)),
  });

  return (
    <Fragment>
      <tr className="fila-ra">
        <td><b>RA{pond.ra}</b></td>
        <td><Tramos valor={pond.texto} /></td>
        <td className="centro">
          <Peso
            valor={pond.ponderacion}
            etiqueta={`Ponderación del RA${pond.ra}`}
            editable={editable}
            onCambio={cambiarRa}
          />
        </td>
      </tr>
      {(pond.ce || []).map((c, j) => (
        <tr className="fila-ce" key={j}>
          <td className="letra">{c.letra})</td>
          <td>
            <Tramos valor={c.texto} />
            {c.fundamental ? <span className="distintivo"> fundamental</span> : null}
          </td>
          <td className="centro">
            <Peso
              valor={c.ponderacion}
              etiqueta={`Ponderación del criterio ${c.letra} del RA${pond.ra}`}
              editable={editable}
              onCambio={(n) => cambiarCe(j, n)}
            />
          </td>
        </tr>
      ))}
      <tr className={'fila-suma' + (cuadra ? '' : ' mal')}>
        <td />
        <td className="derecha suave">
          suma de los criterios del RA{pond.ra}
          {relativo ? (
            <span className="suave"> · reparten 100 % dentro del RA · convenio sin decidir</span>
          ) : null}
        </td>
        <td className="centro">
          <b>{Val.porcentaje(sumaCe)}</b>
          {cuadra ? null : <span className="sr"> · no cuadra con el peso del RA</span>}
        </td>
      </tr>
    </Fragment>
  );
}

// ---------------------------------------------------------------- el campo entero

export default function Ponderaciones({ valor, etiqueta, editable, onCambio }) {
  const lista = Array.isArray(valor) ? valor : (valor ? [valor] : []);
  // Las que el importador supo estructurar; las demás no tienen modelo que editar.
  const estructuradas = lista.filter((p) => p && p.ra !== null && p.ra !== undefined);
  const sueltas = lista.filter((p) => !estructuradas.includes(p));
  // Con una sola tabla sin estructurar, el campo entero deja de poder guardarse:
  // ver la cabecera.
  const seEdita = !!editable && !sueltas.length;

  const total = suma(estructuradas.map((p) => p.ponderacion));
  // El alcance es de este lado, como en el motor: la suma de los RA solo
  // significa algo cuando el campo trae varias tablas. Una sola suele ser un
  // fragmento, y sumarla daría un error falso (core/validaciones.js).
  const sumaVale = estructuradas.length > 1;
  const cuadraTotal = Val.sumaRaCuadra(total);

  const cambiar = (indice, pond) => {
    if (!onCambio) return;
    // La lista entera, en su orden, y sin `filas`: la tabla importada la conserva
    // el servidor (ver la cabecera).
    onCambio(lista.map((p) => {
      const nuevo = p === estructuradas[indice] ? pond : p;
      const { filas, ...resto } = nuevo;
      return resto;
    }));
  };

  return (
    <section className="tarjeta">
      <header className="tarjeta-cab">
        <h2>{etiqueta || 'Ponderaciones'}</h2>
        {sumaVale ? (
          <span className={'total' + (cuadraTotal ? ' bien' : ' mal')}>
            {'total de los RA ' + Val.porcentaje(total)}
            {cuadraTotal ? '' : ' · debería ser 100 %'}
          </span>
        ) : null}
      </header>

      {/* La suma total, otra vez y en texto, para quien no vea el color de la
          pastilla ni esté mirando la cabecera cuando cambia. */}
      <span className="sr" role="status" aria-live="polite">
        {sumaVale
          ? `Los resultados de aprendizaje suman ${Val.porcentaje(total)}${cuadraTotal ? '' : ', y deberían sumar 100 %'}.`
          : ''}
      </span>

      {estructuradas.length ? (
        <div className="tabla-scroll">
          <table className="tabla tabla-pond">
            <caption className="sr">
              Ponderaciones de los resultados de aprendizaje y de sus criterios de evaluación, con la
              suma de cada resultado de aprendizaje y el total.
            </caption>
            <thead>
              <tr>
                <th scope="col"><span className="sr">Resultado de aprendizaje o criterio</span></th>
                <th scope="col">Resultado de aprendizaje y criterios</th>
                <th scope="col" className="centro">Peso</th>
              </tr>
            </thead>
            <tbody>
              {estructuradas.map((p, i) => (
                <TablaRa key={i} pond={p} indice={i} editable={seEdita} onCambio={cambiar} />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <p className="ayuda">
        La suma de cada resultado de aprendizaje y el total se calculan mientras escribes, con la
        misma regla que el panel de validaciones (<code>core/validaciones.js</code>). Los
        resultados de aprendizaje suman 100 %, y los criterios de cada uno reparten el peso de su RA
        —o 100 % dentro del RA, que es el otro convenio que usa el documento y que el departamento
        todavía no ha decidido cuál vale—.
        {editable ? '' : ' Este apartado no lo puedes editar: los pesos se ven, pero no se cambian.'}
        {editable && !seEdita
          ? ' Aquí no se cambian: este campo trae una tabla que el importador no supo leer por resultados de aprendizaje, y el servidor no acepta el campo mientras esté. Se arregla reimportando el módulo.'
          : ''}
      </p>

      {sueltas.map((p, i) => (
        <div key={i}>
          <p className="suave">
            Esta tabla de ponderaciones no se ha podido leer por resultados de aprendizaje, así que
            se enseña tal como vino del Word y no se edita.
          </p>
          <Tabla filas={p.filas} etiqueta={etiqueta} />
        </div>
      ))}
    </section>
  );
}
