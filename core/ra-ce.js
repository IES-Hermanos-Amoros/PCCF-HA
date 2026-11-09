// LA TABLA DE RESULTADOS DE APRENDIZAJE Y CRITERIOS DE EVALUACIÓN: el lector que saca los RA de
// su rejilla, y el informe de lo que ha entendido.
//
// `auto.tabla_ra_ce` guarda dos cosas a la vez: la rejilla tal como venía del Word (`filas`) y los
// resultados de aprendizaje leídos de ella (`ra: [{ num, texto, ce: [{ letra, texto }] }]`). Lo que
// se IMPRIME sale de `ra` (`queSeImprime` de core/estructurados.js), así que quien edite la rejilla
// tiene que volver a leer `ra` de ella o la pantalla diría una cosa y el PDF otra.
//
// Y DE `ra` DEPENDE MÁS GENTE QUE EL PDF. Son los resultados de aprendizaje que DECLARA el módulo:
//
//   · el selector de RA de una situación de aprendizaje sale de aquí (`raDeApartado` de
//     app/_componentes/sa-cliente.js);
//   · la lista contra la que se comprueban las ponderaciones guardadas y los RA que ninguna
//     situación trabaja también (`raDelModulo` y `raDeTablas` de app/_lib/rutas/comun.js, y
//     app/_lib/rutas/validaciones.js).
//
// Un RA que se pierda al editar no es un detalle del papel: desaparece del selector y de las
// comprobaciones. Por eso aquí no está solo el lector: está `informe`, que dice CON NÚMEROS qué se
// ha reconocido y NOMBRA lo que ha dejado de reconocerse. Que falle a gritos y no en silencio.
//
// POR QUÉ HAY UN SOLO LECTOR, Y VIVE AQUÍ
//
// Es el mismo caso que `fichaDeFilas` de core/sa.js: lo necesitan el importador de Word
// (motor/importar-docx.js, al leer el documento) y el editor del navegador (después de cada
// cambio en la rejilla), y los dos tienen que entender la misma tabla de la misma manera. Con dos
// copias, la del importador y la del editor se separarían y abrir una tabla y guardarla sin tocar
// nada le cambiaría los RA. `motor/importar-docx.js` llama a este fichero; `core/` no depende de
// `motor/` (docs/plan.md §2.2).
//
// CÓMO RECONOCE, QUE ES LA PARTE FRÁGIL
//
// Por el TEXTO, porque es lo único que el Word trae: la primera columna de la fila tiene que
// empezar por el número del RA («3.» o «3)») y los criterios de la segunda se parten por su letra
// («a)», «b)»…). Y LA PRIMERA FILA ES LA CABECERA Y NO SE LEE, así que quitarla hace desaparecer
// el primer resultado de aprendizaje. Son reglas de redacción, no de estructura: una reescritura
// puede dejar un RA o un criterio fuera sin que la tabla parezca distinta. De ahí el informe.
//
// Lógica pura: sin DOM, sin node, sin red. Vale como <script> en el mockup, como `require` en el
// motor y en las pruebas, y como `import` desde Next. Cuelga de `global.Core.raCe`.

(function (global) {
  'use strict';

  const TIPO = 'auto.tabla_ra_ce';

  const esObjeto = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
  const texto = (c) => String(c && c.text != null ? c.text : '');

  // ---------------------------------------------------------------- el lector

  // Las líneas de una celda, sin las vacías: cada criterio viene en su línea.
  const lineas = (t) => String(t || '').split('\n').map((x) => x.trim()).filter(Boolean);

  // LOS RESULTADOS DE APRENDIZAJE DE UNA REJILLA. El único lector del proyecto.
  //
  // La primera fila es la cabecera («Resultados de aprendizaje | Criterios de evaluación») y no se
  // lee. De cada fila siguiente: el número y el texto del RA de la primera columna, y los
  // criterios de la segunda, uno por línea o separados por «x) » dentro de la misma línea —el
  // documento real hace las dos cosas—. Una línea que no empieza por una letra se pega a la del
  // criterio anterior: es la continuación de un criterio largo que el Word partió.
  //
  // Una fila cuya primera columna no empieza por un número se lee igual, con el número que le
  // toque por su posición: así una tabla con un RA mal escrito no pierde los demás.
  function raDeFilas(filas) {
    const ra = [];
    for (const fila of (Array.isArray(filas) ? filas : []).slice(1)) {
      if (!Array.isArray(fila) || fila.length < 2) continue;
      const m = texto(fila[0]).match(/^(\d+)[.)]?\s*(.*)$/s);
      const ce = [];
      for (const l of lineas(texto(fila[1])).flatMap((x) => x.split(/\s+(?=[a-zñ]\)\s)/))) {
        const mm = l.match(/^(?:RA\d+[.\s]*)?([a-zñ])[).]\s*(.*)$/i);
        if (mm) ce.push({ letra: mm[1].toLowerCase(), texto: mm[2].trim() });
        else if (ce.length) ce[ce.length - 1].texto += ' ' + l;
      }
      ra.push({ num: m ? Number(m[1]) : ra.length + 1, texto: (m ? m[2] : texto(fila[0])).trim(), ce });
    }
    return ra;
  }

  // ¿Es este el valor de una tabla de RA y CE? Con el campo delante manda su TIPO, que es el dato
  // bueno: una tabla recién vaciada no tiene de qué leer los RA y seguiría siendo de este tipo.
  // Sin campo se mira la forma del valor, que es lo que distingue este tipo de los demás de tabla
  // (una ponderación guarda en `ra` el número de UN resultado de aprendizaje, no una lista).
  function esTabla(valor, campo) {
    if (esObjeto(campo)) return campo.tipo === TIPO;
    return esObjeto(valor) && Array.isArray(valor.ra);
  }

  // EL VALOR CON SUS `ra` RELEÍDOS DE LA REJILLA. Es lo que hace que editar las filas se vea en el
  // PDF: sin esto, lo que se imprime seguiría siendo la lista de antes del cambio.
  function conRaLeido(valor, campo) {
    if (!esObjeto(valor) || !esTabla(valor, campo)) return valor;
    return { ...valor, ra: raDeFilas(valor.filas) };
  }

  // ---------------------------------------------------------------- el informe de reconocimiento

  const numerosDe = (ra) => (Array.isArray(ra) ? ra : [])
    .map((r) => (r && Number.isInteger(r.num) ? r.num : null))
    .filter((n) => n !== null);

  const cuantosCe = (ra) => (Array.isArray(ra) ? ra : []).reduce((a, r) => a + ((r && r.ce) || []).length, 0);

  // «RA1, RA2 y RA3»: la coma hasta el último, que va con «y».
  function enLista(partes) {
    if (!partes.length) return '';
    if (partes.length === 1) return partes[0];
    return partes.slice(0, -1).join(', ') + ' y ' + partes[partes.length - 1];
  }

  const cuenta = (n, uno, varios) => (n === 1 ? '1 ' + uno : n + ' ' + varios);

  // QUÉ SE HA RECONOCIDO, con números y con los nombres de los RA. Es lo que se enseña después de
  // cada cambio: sin esta frase, quien reescribe una tabla no tiene manera de saber si lo que ha
  // escrito se sigue entendiendo.
  function frase(ra) {
    const nums = numerosDe(ra);
    const ce = cuantosCe(ra);
    if (!nums.length) return 'No se reconoce ningún resultado de aprendizaje en esta tabla.';
    const criterios = ce ? cuenta(ce, 'criterio de evaluación', 'criterios de evaluación') : 'ningún criterio de evaluación';
    return (nums.length === 1 ? 'Se reconoce ' : 'Se reconocen ')
      + cuenta(nums.length, 'resultado de aprendizaje', 'resultados de aprendizaje')
      + ' (' + enLista(nums.map((n) => 'RA' + n)) + ') y ' + criterios + '.';
  }

  // A DÓNDE VA LO QUE SE PIERDE. Se nombra en los dos avisos porque es lo que no se ve: el papel
  // sigue imprimiéndose, lo que desaparece está en otras dos pantallas.
  const DONDE = 'el selector de situaciones de aprendizaje y en las comprobaciones';

  // LOS RA QUE ANTES SE RECONOCÍAN Y AHORA NO. Es el aviso que tiene que gritar: un RA que se cae
  // de la lista deja de existir para el resto de la aplicación.
  function perdidos(antes, ahora) {
    const quedan = new Set(numerosDe(ahora));
    return numerosDe(antes).filter((n) => !quedan.has(n));
  }

  // LOS RA QUE SIGUEN RECONOCIÉNDOSE PERO CON MENOS CRITERIOS. Más fino que perder un RA entero y
  // del mismo tipo: los criterios que ya no se leen dejan de ofrecerse al elegir los de una
  // situación de aprendizaje.
  function conMenosCe(antes, ahora) {
    const ahoraPorNum = new Map();
    (Array.isArray(ahora) ? ahora : []).forEach((r) => { if (r && Number.isInteger(r.num)) ahoraPorNum.set(r.num, r); });
    const out = [];
    for (const r of (Array.isArray(antes) ? antes : [])) {
      if (!r || !Number.isInteger(r.num)) continue;
      const otro = ahoraPorNum.get(r.num);
      if (!otro) continue;
      const de = ((r.ce) || []).length;
      const a = ((otro.ce) || []).length;
      if (a < de) out.push({ num: r.num, de, a });
    }
    return out;
  }

  // EL INFORME ENTERO, para que la pantalla no tenga que componer ninguna frase: `frase` dice lo
  // que se entiende ahora y `aviso` lo que se ha dejado de entender respecto a `antes`, con nombre
  // y apellidos. `aviso` es null cuando no se ha perdido nada, que es el caso normal.
  //
  // `antes` es la lista de RA de la tabla ANTES del cambio (la de cuando se abrió, no la de la
  // pulsación anterior): una pérdida tiene que seguir dicha mientras siga perdida.
  function informe(antes, ahora) {
    const fuera = perdidos(antes, ahora);
    const menos = conMenosCe(antes, ahora);
    const partes = [];
    if (fuera.length === 1) {
      partes.push('El RA' + fuera[0] + ' ya no se reconoce y dejará de salir en ' + DONDE + '.');
    } else if (fuera.length > 1) {
      partes.push('Los ' + enLista(fuera.map((n) => 'RA' + n)) + ' ya no se reconocen y dejarán de salir en '
        + DONDE + '.');
    }
    if (menos.length) {
      const cuerpo = enLista(menos.map((x) => 'el RA' + x.num + ' pasa de '
        + cuenta(x.de, 'criterio', 'criterios') + ' a ' + x.a));
      partes.push(cuerpo.charAt(0).toUpperCase() + cuerpo.slice(1)
        + ': los criterios que ya no se reconocen dejarán de ofrecerse al elegir los de una situación de aprendizaje.');
    }
    return {
      ra: numerosDe(ahora).length,
      ce: cuantosCe(ahora),
      numeros: numerosDe(ahora),
      perdidos: fuera,
      menos,
      frase: frase(ahora),
      aviso: partes.length ? partes.join(' ') : null,
    };
  }

  const api = {
    TIPO,
    raDeFilas, esTabla, conRaLeido,
    frase, perdidos, conMenosCe, informe,
  };

  global.Core = global.Core || {};
  global.Core.raCe = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
