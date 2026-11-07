// LA PUERTA DE LOS CAMPOS ESTRUCTURADOS: ponderaciones de RA y CE, y fichas de
// situación de aprendizaje. La forma que el generador sabe pintar, en un solo sitio.
//
// Es el hermano de core/bloques.js. Aquel decide si una lista de bloques de texto es
// exactamente lo que espera `bloques()` de motor/render-generico.js; este decide lo
// mismo de los dos tipos de campo que el E4 abre a escritura:
//
//   ponderacion_ra_ce            { ra, texto, ponderacion, ce: [{ letra, texto, ponderacion,
//                                  fundamental }], filas? }   ·  `multiple`: una lista de esas
//   ficha_situacion_aprendizaje  el modelo de core/sa.js        ·  `multiple`: una lista de esas
//   el repetidor que las agrupa  { items: [ { titulo, ficha: [ficha], texto? } ] }
//
// Y NADA MÁS. `pintarPonderaciones` hace `p.ce.map(...)` y `pct(p.ponderacion)`, así que
// un peso que sea la cadena '15 %' imprime «15 %15 %» y un `ce` que no sea una lista
// revienta la generación del tomo entero; `pintarCampo` de una ficha monta la tabla con
// `filasDeFicha(valor)` si no hay tabla importada, y un campo que no sea una lista de
// líneas sale como `[object Object]` dentro de una celda. Lo peor, como en bloques.js, es
// que no se nota: el apartado se guarda, la pantalla lo pinta, y el fallo aparece en junio
// cuando alguien imprime su programación.
//
// POR QUÉ VIVE EN core/ Y NO EN LA RUTA
//
// Por lo mismo que core/bloques.js: la usan el editor del navegador después de cada
// operación y la API antes de escribir, y las dos tienen que decir lo mismo. Si la forma
// la decidiera la ruta, el editor tendría su propia idea de qué es una ficha válida y la
// divergencia se descubriría con un 400 delante de alguien que está escribiendo su
// programación. `core/` es lógica pura: sin DOM, sin localStorage, sin red, sin node
// (docs/plan.md §2.2).
//
// LO QUE NO ESTÁ AQUÍ: EL MODELO DE LA FICHA
//
// Está en core/sa.js, con sus conversiones ficha ↔ filas, sus operaciones sobre la lista
// y el resumen SA × RA. Aquí solo se comprueba. `CAMPOS` y `esSemantica` se leen de allí
// para que la lista de campos de una ficha esté escrita una vez: si mañana la ficha gana
// un campo, esta puerta lo acepta sin tocarla.
//
// QUÉ SE HACE CON `filas`, QUE ES LA DECISIÓN DELICADA DE ESTE FICHERO
//
// Una ficha importada lleva dos cosas: la tabla tal como venía del Word (`filas`) y el
// modelo con campos con nombre. El motor imprime `filas` si está y, si no, la monta desde
// el modelo. Así que:
//
//   · `filas` SE ACEPTA, con su forma comprobada celda a celda. Las fichas que nadie ha
//     tocado conservan su tabla importada, porque el Word usa dos maquetaciones para las
//     actividades y reescribirlas todas por haber editado una sería cambiar el documento
//     por la espalda.
//   · Pero una ficha que cambia tiene que soltarla, o el PDF seguiría imprimiendo lo de
//     antes: la pantalla diría una cosa y el papel otra. Eso lo decide quien edita
//     (app/_componentes/sa-cliente.js en la aplicación), no esta puerta.
//   · Y RENUMERAR CUENTA COMO CAMBIAR: la primera celda de `filas` lleva escrito
//     «Situación de aprendizaje 3», así que la ficha que pasa a ser la 4 pierde su tabla.
//     Eso sí lo hace esta capa, en `renumerarItems`, porque la numeración se arregla al
//     guardar (ver la nota de core/sa.js) y quien guarda no es siempre el navegador: por
//     la API entra también un `curl`. Con una excepción: a la ficha que no tiene más que
//     la rejilla importada no se le quita, porque no habría con qué montar la tabla y
//     desaparecería del PDF; una tabla que dice «3» siendo la 4 se nota y se arregla.
//
// En las ponderaciones `filas` se trata al revés: no se deja escribir, pero no se pierde.
// Ver `motivoDePonderacion` y `conservarFilas`.
//
// Vale como <script> en el mockup, como `require` en las pruebas y en las rutas, y como
// `import` desde Next. Cuelga de `global.Core.estructurados`, igual que los demás.

(function (global) {
  'use strict';

  // Las dependencias se resuelven al usarlas y no al cargar, igual que en
  // core/conciliar.js: como <script> el orden de las etiquetas manda, y así basta con que
  // core/sa.js esté cargado cuando alguien llame, no cuando se cargue este fichero.
  // Las rutas van LITERALES en cada rama, no en una variable. Un `require(ruta)`
  // calculado no lo puede seguir un empaquetador, y Turbopack no avisa: corta el
  // `npm run build` entero con «Can't resolve <dynamic>» en cuanto un componente
  // de cliente importa este fichero. Con la ruta escrita, el navegador recibe lo
  // que necesita y el <script> del prototipo sigue usando el global.
  function deCore(nombre) {
    if (global.Core && global.Core[nombre]) return global.Core[nombre];
    if (typeof require === 'function') {
      if (nombre === 'sa') return require('./sa.js');
      if (nombre === 'bloques') return require('./bloques.js');
    }
    throw new Error('core/estructurados.js necesita core/' + nombre + '.js');
  }
  const Sa = () => deCore('sa');
  const Bloques = () => deCore('bloques');

  // ---------------------------------------------------------------- los tipos de campo

  const TIPO_PONDERACION = 'ponderacion_ra_ce';
  const TIPO_FICHA = 'ficha_situacion_aprendizaje';
  const TIPO_TEXTO_LARGO = 'texto_largo';
  const TIPO_TEXTO = 'texto';

  // El id del valor de una sección repetidora. No es un campo de la plantilla: el
  // importador guarda los ítems repetidos como `{ items: [...] }` (ver `extraer` en
  // motor/importar-docx.js), así que el apartado de un repetidor no es `{ campo: valor }`.
  const CAMPO_ITEMS = 'items';

  // Los tipos que ESTA PUERTA sabe comprobar y que por tanto se pueden guardar. Los demás
  // —las rejillas importadas, la tabla de RA y CE, la ficha del módulo— tienen cada uno su
  // forma y su editor y llegarán cuando les toque: hasta entonces se rechazan, porque un
  // campo que entra sin puerta es un documento que deja de salir.
  const TIPOS = [TIPO_TEXTO_LARGO, TIPO_TEXTO, TIPO_PONDERACION, TIPO_FICHA];

  const seGuarda = (campo) => !!campo && TIPOS.indexOf(campo.tipo) >= 0;

  // ---------------------------------------------------------------- utilidades de forma

  const esObjeto = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
  const sobran = (objeto, permitidas) => Object.keys(objeto).filter((k) => permitidas.indexOf(k) < 0);
  const comillas = (claves) => claves.map((k) => '«' + k + '»').join(', ');

  const esEntero = (x, desde) => Number.isInteger(x) && x >= desde;
  const esNumero = (x) => typeof x === 'number' && Number.isFinite(x);

  // Un porcentaje del documento. Se admiten decimales —la PD real tiene criterios que
  // ponderan 0,3 %— y se rechaza lo que no cabe en una tabla de reparto.
  const esPeso = (x) => esNumero(x) && x >= 0 && x <= 100;

  // Una línea de una celda de la ficha: texto, sin saltos. El modelo guarda una LISTA
  // porque cada línea es un elemento editable (`aLineas` de core/sa.js); un elemento con
  // un salto dentro se imprimiría igual, pero al releerlo se partiría en dos y la ficha
  // dejaría de ser la que se guardó.
  function motivoDeLineas(valor, donde) {
    if (!Array.isArray(valor)) {
      return `${donde} no es una lista de líneas: cada línea de la celda es un elemento.`;
    }
    for (let i = 0; i < valor.length; i += 1) {
      const l = valor[i];
      if (typeof l !== 'string') return `la línea ${i + 1} de ${donde} no es texto.`;
      if (l.indexOf('\n') >= 0) {
        return `la línea ${i + 1} de ${donde} lleva un salto de línea dentro: cada línea es un elemento de la lista.`;
      }
      const huella = Bloques().huellaDeWord(l);
      if (huella) {
        return `la línea ${i + 1} de ${donde} trae dentro una marca del procesador de textos («${huella}»), que no es texto de la programación: eso llega al pegar desde Word.`;
      }
    }
    return null;
  }

  // Un texto suelto de la ficha o de una ponderación (el título, el texto del RA…). Misma
  // regla que en core/bloques.js: la estructura se comprueba, la redacción no, y de lo
  // pegado solo se rechaza la huella de Word.
  function motivoDeTexto(valor, donde, { obligatorio = true } = {}) {
    if (valor === undefined || valor === null) {
      return obligatorio ? `falta ${donde}.` : null;
    }
    if (typeof valor !== 'string') return `${donde} no es texto.`;
    const huella = Bloques().huellaDeWord(valor);
    if (huella) {
      return `${donde} trae dentro una marca del procesador de textos («${huella}»), que no es texto de la programación: eso llega al pegar desde Word.`;
    }
    return null;
  }

  // ---------------------------------------------------------------- la tabla importada

  // Las celdas que produce el importador y que `rejilla()` del motor sabe colocar. Son
  // cuatro claves y ninguna más: una de regalo viaja hasta pdfmake dentro del objeto de la
  // celda y cambia la tabla sin que nadie lo haya pedido.
  const CLAVES_CELDA = ['text', 'colspan', 'rowspan', 'bold'];

  function motivoDeFilas(filas, donde) {
    if (!Array.isArray(filas)) return `${donde} no es una lista de filas.`;
    for (let i = 0; i < filas.length; i += 1) {
      const fila = filas[i];
      if (!Array.isArray(fila)) return `la fila ${i + 1} de ${donde} no es una lista de celdas.`;
      if (!fila.length) return `la fila ${i + 1} de ${donde} no tiene ninguna celda.`;
      for (let j = 0; j < fila.length; j += 1) {
        const celda = fila[j];
        const suyo = `la celda ${j + 1} de la fila ${i + 1} de ${donde}`;
        if (!esObjeto(celda)) return `${suyo} no es un objeto { text, colspan, rowspan, bold }.`;
        const extra = sobran(celda, CLAVES_CELDA);
        if (extra.length) return `${suyo} lleva ${comillas(extra)}, que no existe en una celda.`;
        if (typeof celda.text !== 'string') return `${suyo} no tiene «text», o no es una cadena.`;
        if (celda.colspan !== undefined && !esEntero(celda.colspan, 1)) return `${suyo} tiene un «colspan» que no es un número entero de 1 en adelante.`;
        if (celda.rowspan !== undefined && !esEntero(celda.rowspan, 1)) return `${suyo} tiene un «rowspan» que no es un número entero de 1 en adelante.`;
        if (celda.bold !== undefined && typeof celda.bold !== 'boolean') return `${suyo} tiene «bold» y no es true ni false.`;
      }
    }
    return null;
  }

  // ---------------------------------------------------------------- ponderaciones de RA y CE

  const CLAVES_PONDERACION = ['ra', 'texto', 'ponderacion', 'ce', 'filas'];
  const CLAVES_CRITERIO = ['letra', 'texto', 'ponderacion', 'fundamental'];

  // La letra con la que el documento nombra un criterio: «a)», «b)»… El importador la
  // guarda en minúscula y la 'ñ' aparece en los módulos con más de veintiséis criterios.
  const LETRA = /^[a-zñ]$/;

  // Por qué no vale UNA tabla de ponderaciones. `raModulo`, si viene, es la lista de los RA
  // que el módulo declara en su apartado de resultados de aprendizaje y criterios de
  // evaluación: ponderar un RA que el módulo no tiene es un peso que no reparte nada y que
  // nadie encuentra para arreglarlo, así que se rechaza.
  function motivoDePonderacion(tabla, donde, { raModulo } = {}) {
    if (!esObjeto(tabla)) {
      return `${donde} no es una tabla de ponderaciones { ra, texto, ponderacion, ce }.`;
    }
    const extra = sobran(tabla, CLAVES_PONDERACION);
    if (extra.length) return `${donde} lleva ${comillas(extra)}, que no existe en una tabla de ponderaciones.`;

    // `ra: null` es lo que deja el importador cuando no sabe leer la cabecera de la tabla, y
    // entonces el motor imprime la rejilla en crudo en lugar de la tabla de ponderaciones.
    // Por la API no entra: lo que se guarda desde el editor es el reparto de un RA concreto.
    if (!esEntero(tabla.ra, 1)) {
      return `${donde} no dice de qué resultado de aprendizaje es: «ra» tiene que ser su número.`;
    }
    if (raModulo && raModulo.indexOf(tabla.ra) < 0) {
      return raModulo.length
        ? `${donde} pondera el RA${tabla.ra}, y este módulo solo tiene los RA ${raModulo.join(', ')}: los resultados de aprendizaje de un módulo son los de su apartado de resultados de aprendizaje y criterios de evaluación.`
        : `${donde} pondera el RA${tabla.ra}, y este módulo no declara ningún resultado de aprendizaje: los RA salen del apartado de resultados de aprendizaje y criterios de evaluación, y sin esa lista un peso no reparte nada.`;
    }

    const texto = motivoDeTexto(tabla.texto, `el texto del RA${tabla.ra} de ${donde}`);
    if (texto) return texto;

    if (!esPeso(tabla.ponderacion)) {
      return `la ponderación del RA${tabla.ra} de ${donde} no es un porcentaje: tiene que ser un número de 0 a 100, sin el «%».`;
    }

    if (!Array.isArray(tabla.ce)) {
      return `los criterios del RA${tabla.ra} de ${donde} no son una lista.`;
    }
    const letras = new Set();
    for (let i = 0; i < tabla.ce.length; i += 1) {
      const ce = tabla.ce[i];
      const suyo = `el criterio ${i + 1} del RA${tabla.ra} de ${donde}`;
      if (!esObjeto(ce)) return `${suyo} no es un objeto { letra, texto, ponderacion, fundamental }.`;
      const sobra = sobran(ce, CLAVES_CRITERIO);
      if (sobra.length) return `${suyo} lleva ${comillas(sobra)}, que no existe en un criterio de evaluación.`;
      if (typeof ce.letra !== 'string' || !LETRA.test(ce.letra)) {
        return `${suyo} no tiene una letra con la que nombrarlo: «a», «b», «c»… en minúscula.`;
      }
      if (letras.has(ce.letra)) {
        return `el RA${tabla.ra} de ${donde} tiene dos criterios «${ce.letra}»: la letra es la que lo nombra en el documento y no se puede repetir.`;
      }
      letras.add(ce.letra);
      const suTexto = motivoDeTexto(ce.texto, `el texto de ${suyo}`);
      if (suTexto) return suTexto;
      if (!esPeso(ce.ponderacion)) {
        return `la ponderación de ${suyo} no es un porcentaje: tiene que ser un número de 0 a 100, sin el «%».`;
      }
      if (ce.fundamental !== undefined && typeof ce.fundamental !== 'boolean') {
        return `${suyo} tiene «fundamental» y no es true ni false.`;
      }
    }

    // La tabla tal como venía del Word no se escribe por aquí, y tampoco se pierde: el
    // exportador a Word saca de su primera celda el código del módulo («Resultado de
    // aprendizaje (0614.1)»), que el modelo no guarda (ver `filasPonderacion` en
    // motor/exportar-docx.js). Así que la conserva el servidor, emparejada por RA, y el
    // cliente no tiene que devolverla ni puede estropearla.
    if (tabla.filas !== undefined && !(Array.isArray(tabla.filas) && !tabla.filas.length)) {
      return `${donde} trae «filas», que es la tabla tal como venía del Word: no se manda. La conserva el servidor, porque de ella sale el código del módulo que el modelo no guarda.`;
    }
    return null;
  }

  // Por qué no vale el VALOR del campo. `multiple` es el de la plantilla: el importador
  // guarda una lista cuando la sección trae varias tablas y la tabla suelta cuando trae
  // una, y el campo de la PD real es `multiple`.
  function motivoPonderaciones(valor, { multiple = true, raModulo } = {}) {
    if (multiple) {
      if (!Array.isArray(valor)) {
        return 'las ponderaciones de este campo son una lista de tablas, una por resultado de aprendizaje, y esto no es una lista.';
      }
      if (!valor.length) {
        return 'la lista de ponderaciones está vacía: un módulo sin ponderaciones se queda sin el apartado, no con una lista vacía.';
      }
      const vistos = new Set();
      for (let i = 0; i < valor.length; i += 1) {
        const m = motivoDePonderacion(valor[i], `la tabla ${i + 1}`, { raModulo });
        if (m) return m;
        if (vistos.has(valor[i].ra)) {
          return `hay dos tablas del RA${valor[i].ra}: el peso de un resultado de aprendizaje se reparte en una sola tabla, y con dos la suma del apartado lo contaría dos veces.`;
        }
        vistos.add(valor[i].ra);
      }
      return null;
    }
    return motivoDePonderacion(valor, 'la tabla de ponderaciones', { raModulo });
  }

  // Las `filas` guardadas de cada RA, para que una escritura no las tire. Devuelve el valor
  // que se guarda: el que llega, con la tabla importada del mismo RA pegada otra vez.
  function conservarFilas(nuevo, guardado) {
    const antes = new Map();
    for (const t of (Array.isArray(guardado) ? guardado : [guardado])) {
      if (esObjeto(t) && Array.isArray(t.filas) && t.filas.length) antes.set(t.ra, t.filas);
    }
    if (!antes.size) return nuevo;
    const con = (t) => (antes.has(t.ra) ? { ...t, filas: antes.get(t.ra) } : t);
    return Array.isArray(nuevo) ? nuevo.map(con) : con(nuevo);
  }

  // La suma en vivo que pide el editor: lo que cada RA reparte y lo que suman los RA. No es
  // una comprobación —la regla está en core/validaciones.js— sino la cuenta, para que la
  // pantalla no la vuelva a escribir y la enseñe igual que la enseñará el PDF.
  function sumas(valor) {
    const Val = deCore('validaciones', './validaciones.js');
    const tablas = (Array.isArray(valor) ? valor : [valor]).filter(esObjeto);
    const ra = tablas.map((t) => ({
      ra: t.ra,
      peso: t.ponderacion,
      sumaCe: Val.sumaPesos((t.ce || []).map((c) => c.ponderacion)),
    }));
    const sumaRa = Val.sumaPesos(tablas.map((t) => t.ponderacion));
    return { ra, sumaRa, cuadraRa: Val.sumaRaCuadra(sumaRa) };
  }

  // ---------------------------------------------------------------- fichas de situación de aprendizaje

  // La cabecera de la ficha. El cuerpo son los `CAMPOS` de core/sa.js, que no se repiten
  // aquí: están escritos allí y allí se añaden.
  const CLAVES_CABECERA = ['num', 'titulo', 'sesiones', 'evaluacion', 'raTexto', 'ra', 'filas'];

  const clavesDeFicha = () => CLAVES_CABECERA.concat(Sa().CAMPOS.map((c) => c.id));

  function motivoFicha(ficha, donde = 'la ficha') {
    if (!esObjeto(ficha)) return `${donde} no es un objeto con los campos de la situación de aprendizaje.`;
    const extra = sobran(ficha, clavesDeFicha());
    if (extra.length) return `${donde} lleva ${comillas(extra)}, que no existe en una ficha de situación de aprendizaje.`;

    // El número puede ser 0: ocho fichas de la PD real lo traen, y el documento es el que
    // es. Se arregla al guardar un repetidor (`renumerarItems`), no rechazando el apartado.
    if (ficha.num !== undefined && ficha.num !== null && !esEntero(ficha.num, 0)) {
      return `el número de ${donde} no es un entero.`;
    }
    const titulo = motivoDeTexto(ficha.titulo, `el título de ${donde}`, { obligatorio: false });
    if (titulo) return titulo;
    if (ficha.sesiones !== undefined && ficha.sesiones !== null
      && !(esNumero(ficha.sesiones) && ficha.sesiones >= 0)) {
      return `las sesiones de ${donde} no son un número de 0 en adelante.`;
    }
    const evaluacion = motivoDeTexto(ficha.evaluacion, `la evaluación de ${donde}`, { obligatorio: false });
    if (evaluacion) return evaluacion;
    const raTexto = motivoDeTexto(ficha.raTexto, `el texto de los resultados de aprendizaje de ${donde}`, { obligatorio: false });
    if (raTexto) return raTexto;

    if (ficha.ra !== undefined) {
      if (!Array.isArray(ficha.ra)) return `los resultados de aprendizaje de ${donde} no son una lista de números.`;
      const vistos = new Set();
      for (const n of ficha.ra) {
        if (!esEntero(n, 1)) return `los resultados de aprendizaje de ${donde} llevan ${JSON.stringify(n)}, que no es el número de un RA.`;
        if (vistos.has(n)) return `${donde} repite el RA${n}: en el resumen cada RA es una columna y se marca una vez.`;
        vistos.add(n);
      }
    }

    for (const campo of Sa().CAMPOS) {
      if (ficha[campo.id] === undefined) continue;
      const m = motivoDeLineas(ficha[campo.id], `«${campo.etiqueta}» de ${donde}`);
      if (m) return m;
    }

    if (ficha.filas !== undefined) {
      const m = motivoDeFilas(ficha.filas, `la tabla importada de ${donde}`);
      if (m) return m;
    }

    // Lo que de verdad hace falta para imprimirla: `pintarCampo` monta la tabla desde el
    // modelo solo si la ficha tiene cuerpo (`esSemantica`), y si no imprime «(tabla
    // vacía)». Una ficha a medio construir —un `{}` o un `{ titulo }` suelto— no es una
    // ficha nueva: una ficha nueva nace con todos sus campos presentes y vacíos
    // (`fichaVacia` de core/sa.js).
    const tieneTabla = Array.isArray(ficha.filas) && ficha.filas.length;
    if (!tieneTabla && !Sa().esSemantica(ficha)) {
      return `${donde} no trae ningún campo de la situación de aprendizaje ni «raTexto», así que el documento no sabría qué imprimir: una ficha nueva se crea con todos sus campos presentes y vacíos.`;
    }
    return null;
  }

  function motivoFichas(valor, { multiple = true } = {}) {
    if (!multiple) return motivoFicha(valor);
    if (!Array.isArray(valor)) {
      return 'este campo guarda una lista de fichas de situación de aprendizaje, y esto no es una lista.';
    }
    if (!valor.length) {
      return 'la lista de fichas está vacía: un apartado sin fichas se queda sin el campo, no con una lista vacía.';
    }
    for (let i = 0; i < valor.length; i += 1) {
      const m = motivoFicha(valor[i], `la ficha ${i + 1}`);
      if (m) return m;
    }
    return null;
  }

  // ---------------------------------------------------------------- el repetidor

  // El valor de una sección repetidora: `{ items: [...] }`, y cada ítem son los campos de
  // la plantilla para ese repetidor. No es `{ campo: valor }` como los demás apartados, así
  // que se comprueba aparte.
  //
  // CUÁNTAS FICHAS CABEN EN UN ÍTEM. Una, normalmente, y el campo es `multiple` porque el
  // Word no siempre lo cumple: en la PD real hay un encabezado («Interfaces web con
  // framework.», de Diseño de interfaces web) con dos tablas de ficha debajo. Así que se
  // admiten las que vengan y al menos una, para que ese apartado se pueda volver a
  // guardar; lo que no se admite es ninguna.
  //
  // Lo que sí cuesta de verdad es que `resumenSituaciones` del motor lee `ficha[0]`: la
  // segunda ficha de un ítem se imprime pero no aparece en la tabla resumen. Es un defecto
  // del documento importado, no de esta puerta, y se arregla separando el encabezado en dos.
  function motivoItems(valor, campos) {
    if (!esObjeto(valor)) {
      return 'un apartado de fichas se guarda como { items: [...] }, la lista entera.';
    }
    const extra = sobran(valor, [CAMPO_ITEMS]);
    if (extra.length) {
      return `este apartado son fichas que se añaden y se ordenan: se guarda como { items: [...] }, la lista entera, y no con campos sueltos (${comillas(extra)}).`;
    }
    if (!Array.isArray(valor.items)) return 'las fichas de este apartado son una lista: «items» no lo es.';

    const porId = new Map((campos || []).map((c) => [c.id, c]));
    const ids = [...porId.keys()];

    for (let i = 0; i < valor.items.length; i += 1) {
      const item = valor.items[i];
      const donde = `la ficha ${i + 1}`;
      if (!esObjeto(item)) return `${donde} no es un objeto con los campos de la plantilla.`;
      const sobra = sobran(item, ids);
      if (sobra.length) {
        return `${donde} lleva ${comillas(sobra)}, que no es un campo de este apartado: solo ${comillas(ids)}.`;
      }
      // El título es el del encabezado que imprime el PDF («Situación de aprendizaje 3:
      // …»), así que se exige: sin él el documento imprime «undefined».
      if (typeof item.titulo !== 'string') {
        return `${donde} no tiene título, y es el que el documento imprime en su encabezado.`;
      }
      for (const [id, campo] of porId) {
        if (id === 'titulo') continue;
        // La ficha sí se exige: un ítem con título y sin ficha es un encabezado con nada
        // debajo en el PDF, y en el resumen no aparece siquiera. Los demás campos del
        // repetidor son opcionales, como en cualquier otro apartado.
        if (item[id] === undefined && campo.tipo !== TIPO_FICHA) continue;
        if (campo.tipo === TIPO_FICHA) {
          if (item[id] === undefined) {
            return `${donde} no trae su ficha en «${id}»: sin ella el documento imprime el encabezado y nada debajo, y en el resumen no aparece.`;
          }
          if (!Array.isArray(item[id]) || !item[id].length) {
            return `${donde} tiene que llevar su ficha en «${id}», dentro de una lista.`;
          }
          for (let k = 0; k < item[id].length; k += 1) {
            const m = motivoFicha(item[id][k],
              item[id].length > 1 ? `${donde}, tabla ${k + 1}` : donde);
            if (m) return m;
          }
          continue;
        }
        const m = motivoDeCampo(campo, item[id], {});
        if (m) return `en ${donde}, ${m}`;
      }
    }
    return null;
  }

  // Renumera las fichas de un repetidor por su posición, que es la numeración que imprime
  // el documento, y suelta la tabla importada de las que cambian de número: `filas` lleva
  // escrito «Situación de aprendizaje 3» en su primera celda, así que la ficha que pasa a
  // ser la 4 tiene que montar su tabla desde los campos o el papel seguiría llamándola 3.
  //
  // Se hace AL GUARDAR y no al editar (la nota de core/sa.js: «la numeración no se corrige
  // aquí, `renumerar` se llama al guardar»), porque es lo único que garantiza que la
  // numeración cuadre venga la escritura del editor o de un `curl`. Y hace falta de verdad:
  // 15 de las 78 fichas repetidas de la PD real llegan con un número que no es su posición,
  // y una de ellas con el 0, que el resumen del PDF descarta sin decir nada; en otro módulo
  // seis fichas seguidas se llaman todas «5».
  //
  // La cuenta va por FICHAS y no por ítems, porque un ítem puede traer dos tablas (ver
  // `motivoItems`) y la numeración del documento es la de las fichas impresas.
  function renumerarItems(items, idFicha = 'ficha') {
    const lista = [];
    const sitio = [];
    (items || []).forEach((item, i) => {
      const fichas = Array.isArray(item[idFicha]) ? item[idFicha] : [];
      fichas.forEach((f, j) => { lista.push(f || {}); sitio.push([i, j]); });
    });
    const despues = Sa().renumerar(lista);
    const salida = (items || []).map((item) => (Array.isArray(item[idFicha])
      ? { ...item, [idFicha]: item[idFicha].slice() }
      : item));
    const sa = Sa();
    despues.forEach((f, k) => {
      // La que no cambia de número se queda tal cual, con su tabla importada: reescribir
      // las once fichas de un módulo por haber movido una sería cambiar el documento por
      // la espalda.
      if (f.num === lista[k].num) return;
      const ficha = { ...f };
      delete ficha.filas;
      const [i, j] = sitio[k];
      // Y si la ficha no tiene cuerpo del que montar la tabla —solo la rejilla importada, que es
      // lo que queda cuando el importador no sabe leerla— se le cambia el número pero se le deja
      // la tabla. Una tabla que dice «3» siendo la 4 se nota y se arregla; una ficha que
      // desaparece del PDF con un «(tabla vacía)», no.
      salida[i][idFicha][j] = sa.esSemantica(ficha) ? ficha : { ...f };
    });
    return salida;
  }

  // ---------------------------------------------------------------- la puerta, por campo

  // Por qué no se puede guardar el valor de un campo, mirando su tipo. Es el único sitio
  // que decide qué tipos se guardan: la ruta compone el mensaje y la interfaz lo enseña,
  // pero ninguna de las dos elige.
  function motivoDeCampo(campo, valor, contexto = {}) {
    if (!campo) return 'este campo no está en la plantilla de este apartado.';
    if (valor === undefined) return 'no se ha mandado ningún valor.';

    switch (campo.tipo) {
      case TIPO_TEXTO_LARGO:
        return Bloques().motivoAlGuardar(valor);
      case TIPO_TEXTO:
        return motivoDeTexto(valor, 'el valor');
      case TIPO_PONDERACION:
        return motivoPonderaciones(valor, { multiple: !!campo.multiple, raModulo: contexto.raModulo });
      case TIPO_FICHA:
        return motivoFichas(valor, { multiple: !!campo.multiple });
      default:
        break;
    }
    // Las tablas derivadas no se guardan nunca: se calculan. El resumen de situaciones es
    // la tabla que en el Word hay que repasar a mano cada vez que se mueve una SA, y la
    // gracia de la aplicación es que no haya que repasarla; si se pudiera guardar a mano,
    // volvería a haber dos versiones y ganaría la escrita.
    if (String(campo.tipo).startsWith('derivado.')) {
      return 'este campo se calcula a partir de las fichas cada vez que se imprime el documento, así que no se guarda.';
    }
    return 'este tipo de campo todavía no tiene editor y no se guarda por aquí: lo que entra sin puerta es un documento que deja de salir.';
  }

  // ---------------------------------------------------------------- exportado

  const api = {
    TIPOS, TIPO_PONDERACION, TIPO_FICHA, TIPO_TEXTO_LARGO, TIPO_TEXTO, CAMPO_ITEMS,
    seGuarda,
    motivoDeFilas,
    motivoDePonderacion, motivoPonderaciones, conservarFilas, sumas,
    motivoFicha, motivoFichas,
    motivoItems, renumerarItems,
    motivoDeCampo,
  };

  global.Core = global.Core || {};
  global.Core.estructurados = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
