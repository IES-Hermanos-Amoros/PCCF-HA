// EL MODELO DE UNA TABLA: la FORMA de un grupo de tablas, dicha una vez en la plantilla, y la
// regla que decide cuál sigue cada tabla concreta.
//
// Hasta aquí una tabla genérica (`tabla`, `tabla_clave_valor`) no tenía forma separada de su
// contenido: su forma ERAN sus celdas. Así, cada tabla importada es un documento aparte y el jefe
// de departamento no puede decir «las fichas de actividad de los once módulos llevan estas cuatro
// columnas, con estos nombres»: tendría que entrar en cada una. Este fichero es el sitio donde vive
// esa forma y la regla que la aplica. Las operaciones para cambiarla —añadir una parte, renombrarla,
// moverla, retirarla— no están aquí todavía.
//
// LO QUE GUARDA LA PLANTILLA
//
//   plantilla.modelos['modelo-xxx'] = {
//     id,       con el que apuntan los campos. Se acuña UNA VEZ y NO sigue al nombre nunca
//     nombre,   lo que se enseña: «Ficha de actividad»
//     tipo,     'tabla' | 'tabla_clave_valor': a qué tipo de campo se le puede poner
//     sentido,  'columnas' (las partes van a lo ancho) | 'filas' (van a lo alto)
//     partes: [ { id, etiqueta, ancho?, retirado? } ],
//     version
//   }
//
// Un campo apunta a su modelo con `campo.modelo`; sin esa clave, el campo no usa modelo. Y una
// tabla concreta que ha DIVERGIDO del modelo guarda su forma junto a su contenido, en
// `valor.estructura = { partes: [...] }`.
//
// EL ID DE UN MODELO Y EL DE UNA PARTE NO SON SU NOMBRE, por lo mismo que el de un apartado y el de
// un campo (core/plantilla.js): los campos apuntan al modelo por su id, así que un id que siguiera
// al nombre dejaría huérfanos los campos en cuanto alguien renombrara el modelo. `nombre` y
// `etiqueta` son solo lo que se enseña.
//
// ==================================================================== LA REGLA
//
// UNA TABLA SIGUE SU PROPIA ESTRUCTURA MIENTRAS LA TENGA, Y LA DEL MODELO CUANDO NO LA TENGA. Si no
// tiene ninguna de las dos, su forma se deduce de las celdas guardadas, que es lo que pasa hoy con
// todo lo que hay escrito en los documentos del departamento.
//
// Es la misma regla que ya gobierna la ficha de situación de aprendizaje —«una ficha se imprime
// desde `filas` mientras las tenga y desde el modelo en cuanto deja de tenerlas», en la cabecera de
// `completarDesdeFilas` de core/sa.js— y por el mismo motivo: lo que alguien tiene delante manda
// sobre lo que diga el grupo, porque si no, el primer cambio del departamento al modelo reescribiría
// por la espalda tablas que nadie ha tocado, y nadie relacionaría lo que cambió con lo que hizo.
//
// TENERLA ES TENER PARTES. Una estructura con `partes: []` no es una estructura: es la lista vacía.
// Se cae al escalón siguiente igual que `filas: []` se cae en `queSeImprime` de
// core/estructurados.js, para que un modelo a medio hacer no deje una tabla sin forma ninguna.
//
// Y ESTÁ ESCRITA UNA SOLA VEZ, en `estructuraDeTabla`. La llaman los tres consumidores: el PDF
// (motor/render-generico.js), el Word (motor/exportar-docx.js) y el editor con la puerta de guardado
// (core/tablas-edicion.js y core/estructurados.js). Escrita en cada uno, la pantalla acabaría
// pintando una tabla distinta de la que sale impresa, que es la avería que esta pieza existe para
// evitar.
//
// RETIRAR UNA PARTE NO BORRA SU CONTENIDO, igual que retirar un apartado o un campo
// (core/plantilla.js): la parte se queda en el modelo con `retirado: true`, deja de imprimirse y de
// pintarse, y el hueco que ocupaba SIGUE en el contenido de cada tabla. Por eso el contenido se
// empareja con TODAS las partes y no solo con las vigentes: si se emparejara con las vigentes,
// retirar la segunda de cuatro columnas correría las otras dos un sitio a la izquierda y cada tabla
// del grupo quedaría con su texto bajo otro rótulo sin que nada lo dijera. Restaurar la parte
// devuelve la columna con lo que tenía escrito.
//
// SIN MODELO Y SIN ESTRUCTURA PROPIA, NADA CAMBIA. `tablaVigente` devuelve entonces las MISMAS
// `filas`, los MISMOS `anchos` y la MISMA cabecera que recibe, sin copiar nada, así que los dos
// motores imprimen byte a byte lo de antes. Es la puerta de aceptación de esta pieza, y
// test/modelos-tabla.js la comprueba contra una salida congelada antes de que el modelo existiera.
//
// Lógica pura: sin DOM, sin red, sin node. Vale como <script> en el mockup, como `require` en las
// pruebas y en las rutas, y como `import` desde Next. Cuelga de `global.Core.modelosTabla`, igual
// que los demás módulos de core/.

(function (global) {
  'use strict';

  // ESTE FICHERO NO DEPENDE DE NADIE, a propósito: la puerta (core/estructurados.js) y el editor
  // (core/tablas-edicion.js) le preguntan por la regla, y la regla no necesita a ninguno de los dos.
  // Por eso los dos tipos de campo a los que se les puede poner modelo y los dos topes están
  // escritos aquí en lugar de importados: son `TIPO_TABLA`, `TIPO_CLAVE_VALOR`, `MAX_COLUMNAS` y
  // `MAX_FILAS` de core/estructurados.js. Es lo mismo que hace `slug` de core/plantilla.js con el
  // del importador, y test/modelos-tabla.js comprueba que las copias no se separan.
  const TIPO_TABLA = 'tabla';
  const TIPO_CLAVE_VALOR = 'tabla_clave_valor';
  const TIPOS = [TIPO_TABLA, TIPO_CLAVE_VALOR];
  const MAX_PARTES_ANCHO = 12;
  const MAX_PARTES_ALTO = 200;

  // A LO ANCHO O A LO ALTO. Es lo único que distingue una tabla de columnas con los rótulos arriba
  // de una de filas con los rótulos a la izquierda, y las dos maquetaciones están en los documentos
  // del departamento.
  const SENTIDO_COLUMNAS = 'columnas';
  const SENTIDO_FILAS = 'filas';
  const SENTIDOS = [SENTIDO_COLUMNAS, SENTIDO_FILAS];

  // Cuántos modelos caben en una plantilla. El tope no está para recortar nada: está para que la
  // lista no crezca sin límite, como el `MAX_TABLAS` de un campo.
  const MAX_MODELOS = 50;

  // Lo mismo que `LARGO_ETIQUETA` de core/campos.js, y por lo mismo: un rótulo es un rótulo.
  const LARGO_NOMBRE = 100;

  const esObjeto = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
  const esCadena = (x) => typeof x === 'string' && !!x.trim();
  const sobran = (objeto, permitidas) => Object.keys(objeto).filter((k) => permitidas.indexOf(k) < 0);
  const comillas = (claves) => claves.map((k) => '«' + k + '»').join(', ');
  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

  const CLAVES_MODELO = ['id', 'nombre', 'tipo', 'sentido', 'partes', 'version'];
  const CLAVES_PARTE = ['id', 'etiqueta', 'ancho', 'retirado'];

  // ---------------------------------------------------------------- leer la plantilla

  // El mapa de modelos de una plantilla, o `{}`. No lo tiene ningún documento de hoy.
  const modelosDe = (plantilla) => (esObjeto(plantilla) && esObjeto(plantilla.modelos) ? plantilla.modelos : {});

  // El modelo con ese id, o null. `modelos` es el mapa (`plantilla.modelos`), que puede no venir.
  function buscar(modelos, id) {
    if (!esObjeto(modelos) || !esCadena(id)) return null;
    const m = modelos[id];
    return esObjeto(m) ? m : null;
  }

  // EL MODELO QUE SIGUE UN CAMPO, o null. Son tres los casos en que un campo con `modelo` no sigue
  // ninguno, y en los tres la tabla cae al escalón siguiente de la regla en lugar de quedarse sin
  // forma: el campo no es de un tipo al que se le pueda poner modelo, el modelo no está en la
  // plantilla, o el modelo es DE OTRO TIPO —uno de clave y valor no describe una rejilla—.
  function modeloDeCampo(campo, modelos) {
    if (!esObjeto(campo) || TIPOS.indexOf(campo.tipo) < 0) return null;
    const m = buscar(modelos, campo.modelo);
    return m && m.tipo === campo.tipo ? m : null;
  }

  // ---------------------------------------------------------------- la regla

  // Las partes de una estructura, o null si no tiene ninguna (ver «TENERLA ES TENER PARTES»).
  const conPartes = (x) => (esObjeto(x) && Array.isArray(x.partes) && x.partes.length ? x.partes : null);

  // El sentido por omisión de cada tipo: una rejilla lleva sus rótulos arriba y una tabla de clave y
  // valor, a la izquierda. Es lo que vale cuando una tabla divergida ya no encuentra el modelo del
  // que salió, porque `valor.estructura` guarda las partes y no el sentido.
  const sentidoPorOmision = (tipo) => (tipo === TIPO_CLAVE_VALOR ? SENTIDO_FILAS : SENTIDO_COLUMNAS);
  const sentidoDe = (modelo, tipo) => (esObjeto(modelo) && SENTIDOS.indexOf(modelo.sentido) >= 0
    ? modelo.sentido : sentidoPorOmision(tipo));

  // EL SENTIDO QUE ESTÁ EN VIGOR para las tablas de un campo. Es siempre el del MODELO al que el
  // campo apunta, también cuando la tabla ha divergido: `valor.estructura` guarda las partes y no el
  // sentido. Hace falta aparte de `estructuraDeTabla` porque la puerta comprueba la forma de una
  // estructura propia antes de saber si llega a estar en vigor, y una parte se mide distinto según el
  // sentido —el `ancho` solo existe a lo ancho, y el tope de partes no es el mismo—.
  const sentidoVigente = (campo, modelos) => sentidoDe(modeloDeCampo(campo, modelos),
    esObjeto(campo) ? campo.tipo : undefined);

  // Las partes que se imprimen, cada una con el HUECO que ocupa en el contenido, que es su posición
  // entre TODAS las partes y no entre las vigentes (ver «RETIRAR UNA PARTE NO BORRA SU CONTENIDO»).
  const partesVigentes = (partes) => (Array.isArray(partes) ? partes : [])
    .map((parte, hueco) => ({ parte, hueco }))
    .filter(({ parte }) => !(esObjeto(parte) && parte.retirado));

  // LA REGLA, Y EL ÚNICO SITIO DONDE ESTÁ ESCRITA. Qué estructura sigue esta tabla:
  //
  //   null                    ninguna: su forma se deduce de las celdas guardadas, que es lo que
  //                           pasa hoy con todo lo que hay escrito en los documentos
  //   { origen: 'propia' }    la que la tabla guarda junto a su contenido, porque ha divergido
  //   { origen: 'modelo' }    la del modelo al que apunta su campo
  //
  // `modelos` es `plantilla.modelos`, que puede no venir. `partes` son todas, con las retiradas
  // dentro, y `vigentes` las que se imprimen con su hueco en el contenido.
  function estructuraDeTabla(campo, valor, modelos) {
    if (!esObjeto(campo) || TIPOS.indexOf(campo.tipo) < 0) return null;
    const modelo = modeloDeCampo(campo, modelos);
    const propias = esObjeto(valor) ? conPartes(valor.estructura) : null;
    const partes = propias || (modelo ? conPartes(modelo) : null);
    if (!partes) return null;
    return {
      origen: propias ? 'propia' : 'modelo',
      // De qué modelo salió, para poder decirlo. Una tabla divergida cuyo modelo ya no está lo deja
      // en null: la estructura es suya y no hay a quién volver.
      modelo: modelo ? modelo.id || campo.modelo : null,
      tipo: campo.tipo,
      sentido: sentidoVigente(campo, modelos),
      partes,
      vigentes: partesVigentes(partes),
    };
  }

  // ---------------------------------------------------------------- aplicarla

  const celda = (text, extra) => Object.assign({ text: String(text == null ? '' : text) }, extra);
  const etiquetaDe = (parte) => (esObjeto(parte) ? String(parte.etiqueta == null ? '' : parte.etiqueta) : '');
  const filasDe = (valor) => (esObjeto(valor) && Array.isArray(valor.filas) ? valor.filas : []);

  // Los anchos que pide la estructura: una proporción por parte vigente, y solo si TODAS la dicen. A
  // medias no valen —`motivoDeAnchos` de core/estructurados.js exige una por columna— y una lista
  // incompleta la descartaría cada motor por su cuenta, repartiendo según el texto y sin avisar.
  function anchosDeEstructura(vigentes) {
    const todos = vigentes.map(({ parte }) => (esObjeto(parte) ? parte.ancho : undefined));
    const vale = (a) => typeof a === 'number' && Number.isFinite(a) && a > 0;
    return todos.length && todos.every(vale) ? todos : undefined;
  }

  // LA TABLA QUE SE IMPRIME Y SE PINTA, en la forma que los dos motores y el editor ya saben
  // colocar: `{ filas, anchos, cabecera }`.
  //
  // `cabeceraSinEstructura` es lo que decide `cabeceraDeTabla` de core/estructurados.js, que es
  // quien sabe de `campo.columnas` y de la negrita de la primera fila. Se pasa HECHA, y no se
  // calcula aquí, por dos razones: para que esta regla no dependa de la puerta, y para que el camino
  // sin estructura sea literalmente el de siempre —las mismas filas, los mismos anchos y la misma
  // cabecera que recibe, sin copiar nada—. Esa es la puerta de aceptación de esta pieza.
  //
  // Con estructura, el contenido guardado son las CELDAS, sin los rótulos: los rótulos los pone la
  // estructura. Con `sentido: 'columnas'` cada fila guardada es una fila de contenido y la cabecera
  // se monta con las etiquetas; con `sentido: 'filas'` cada fila guardada es el contenido de UNA
  // parte y su etiqueta se le pone delante.
  //
  // Y los anchos los pone la estructura, no el valor: el ancho de una columna es parte de la forma, y
  // la forma la dice el modelo. Un `valor.anchos` guardado se queda donde está sin imprimirse, igual
  // que los `pares` que acompañan a unas `filas` (core/estructurados.js).
  function tablaVigente(campo, valor, modelos, cabeceraSinEstructura) {
    const estructura = estructuraDeTabla(campo, valor, modelos);
    if (!estructura) {
      return {
        estructura: null,
        filas: esObjeto(valor) ? valor.filas : undefined,
        anchos: esObjeto(valor) ? valor.anchos : undefined,
        cabecera: cabeceraSinEstructura,
      };
    }
    const { sentido, vigentes } = estructura;
    // UNA TABLA CUYAS PARTES ESTÁN TODAS RETIRADAS NO IMPRIME NADA. No es un caso de laboratorio:
    // retirar la última parte que quedaba lo deja así, y lo que saldría si no es una fila de cero
    // celdas, que pdfmake no sabe colocar —revienta la generación del tomo entero— y que el Word
    // omite sin decir nada. Es «(tabla vacía)» en los dos, igual que `{ filas: [] }`, y es verdad:
    // no queda ninguna parte que enseñar. Lo escrito sigue guardado y vuelve al restaurar una parte.
    if (!vigentes.length) return { estructura, filas: [], anchos: undefined, cabecera: false };
    const contenido = filasDe(valor);
    const anchos = anchosDeEstructura(vigentes);
    if (sentido === SENTIDO_FILAS) {
      return {
        estructura,
        // Una parte sin su fila de contenido sale con el rótulo y nada detrás, que es la tabla recién
        // estrenada: el rótulo ya dice qué va ahí.
        filas: vigentes.map(({ parte, hueco }) => [celda(etiquetaDe(parte), { bold: true })]
          .concat(Array.isArray(contenido[hueco]) ? contenido[hueco] : [])),
        anchos,
        cabecera: false,
      };
    }
    return {
      estructura,
      filas: [vigentes.map(({ parte }) => celda(etiquetaDe(parte), { bold: true }))].concat(
        contenido.map((fila) => vigentes.map(({ hueco }) => (
          esObjeto(Array.isArray(fila) ? fila[hueco] : undefined) ? fila[hueco] : celda('')))),
      ),
      anchos,
      // La fila de las etiquetas es la cabecera que se repite al cambiar de página: es lo que es, y
      // no depende de que alguien le haya puesto la negrita.
      cabecera: true,
    };
  }

  // LAS FILAS DE UNA TABLA DE CLAVE Y VALOR, con los rótulos de su estructura. Va aparte de
  // `tablaVigente` porque qué mitad de una tabla de clave y valor se imprime —sus `filas` o sus
  // `pares`— lo decide `queSeImprime` de core/estructurados.js y no esta regla: quien llama ya ha
  // preguntado, y así no hay dos reglas discutiendo sobre la misma tabla.
  //
  // El par que no tiene nada escrito sale con su rótulo y el contenido en blanco, igual que una fila
  // a medio rellenar, que es el estado normal mientras se escribe.
  function paresVigentes(campo, valor, modelos) {
    const estructura = estructuraDeTabla(campo, valor, modelos);
    const guardados = esObjeto(valor) && Array.isArray(valor.pares) ? valor.pares : [];
    if (!estructura) return { estructura: null, pares: esObjeto(valor) ? valor.pares : undefined };
    return {
      estructura,
      pares: estructura.vigentes.map(({ parte, hueco }) => ({
        etiqueta: etiquetaDe(parte),
        valor: esObjeto(guardados[hueco]) ? String(guardados[hueco].valor == null ? '' : guardados[hueco].valor) : '',
      })),
    };
  }

  // ---------------------------------------------------------------- por qué un modelo no vale

  // La forma de UNA parte. `ancho` solo tiene sentido con `sentido: 'columnas'`: con los rótulos a la
  // izquierda la parte es una fila y una fila no tiene ancho de columna, así que se rechaza en lugar
  // de guardarse para no imprimirse nunca.
  function motivoDeParte(parte, donde, { sentido, ids } = {}) {
    if (!esObjeto(parte)) return `${donde} no es un objeto { id, etiqueta }.`;
    const extra = sobran(parte, CLAVES_PARTE);
    if (extra.length) return `${donde} lleva ${comillas(extra)}, que no existe en una parte de un modelo.`;
    if (!esCadena(parte.id)) return `${donde} no tiene «id»: es con el que se empareja su contenido y no cambia nunca.`;
    if (ids && ids.has(parte.id)) return `${donde} repite el id «${parte.id}», y dos partes con el mismo id no se pueden distinguir.`;
    if (typeof parte.etiqueta !== 'string') return `${donde} no tiene «etiqueta», o no es texto: es el rótulo que se imprime.`;
    if (parte.etiqueta.length > LARGO_NOMBRE) return `la etiqueta de ${donde} tiene ${parte.etiqueta.length} caracteres: el máximo son ${LARGO_NOMBRE}.`;
    if (parte.retirado !== undefined && typeof parte.retirado !== 'boolean') return `${donde} tiene «retirado» y no es true ni false.`;
    if (parte.ancho === undefined) return null;
    if (sentido === SENTIDO_FILAS) {
      return `${donde} tiene «ancho», y las partes de este modelo son filas: el ancho es la proporción de una columna.`;
    }
    if (typeof parte.ancho !== 'number' || !Number.isFinite(parte.ancho) || parte.ancho <= 0) {
      return `el «ancho» de ${donde} no es un número positivo: los anchos son pesos relativos, no medidas.`;
    }
    return null;
  }

  // POR QUÉ UN MODELO NO VALE. Es la forma que la plantilla puede guardar; qué se puede CAMBIAR de
  // un modelo es otra cosa y todavía no existe.
  function motivoDeModelo(modelo, donde = 'el modelo', { id } = {}) {
    if (!esObjeto(modelo)) return `${donde} no es un modelo { id, nombre, tipo, sentido, partes }.`;
    const extra = sobran(modelo, CLAVES_MODELO);
    if (extra.length) return `${donde} lleva ${comillas(extra)}, que no existe en un modelo de tabla.`;
    if (!esCadena(modelo.id)) return `${donde} no tiene «id»: es con el que los campos apuntan al modelo y no cambia nunca.`;
    // El id del modelo es la clave con la que está guardado. Si no coincidieran, un campo que apunta
    // a uno encontraría el otro, y el modelo que se enseña no sería el que se imprime.
    if (id !== undefined && modelo.id !== id) {
      return `${donde} está guardado como «${id}» y dice llamarse «${modelo.id}»: el id de un modelo es la clave con la que está en la plantilla.`;
    }
    if (!esCadena(modelo.nombre)) return `${donde} no tiene «nombre», y es con el que se elige en una lista.`;
    if (modelo.nombre.length > LARGO_NOMBRE) return `el nombre de ${donde} tiene ${modelo.nombre.length} caracteres: el máximo son ${LARGO_NOMBRE}.`;
    if (TIPOS.indexOf(modelo.tipo) < 0) return `${donde} es de tipo «${modelo.tipo}», y los modelos son de ${comillas(TIPOS)}.`;
    if (SENTIDOS.indexOf(modelo.sentido) < 0) return `${donde} no dice en qué sentido van sus partes: los sentidos son ${comillas(SENTIDOS)}.`;
    // Una tabla de clave y valor son dos columnas fijas, el concepto a la izquierda y su contenido a
    // la derecha: sus partes son sus filas y no hay otra manera de leerla.
    if (modelo.tipo === TIPO_CLAVE_VALOR && modelo.sentido !== SENTIDO_FILAS) {
      return `${donde} es de clave y valor y dice que sus partes van en «${modelo.sentido}»: en una tabla de clave y valor cada parte es una fila.`;
    }
    if (!Array.isArray(modelo.partes)) return `las partes de ${donde} no son una lista.`;
    const tope = modelo.sentido === SENTIDO_FILAS ? MAX_PARTES_ALTO : MAX_PARTES_ANCHO;
    if (modelo.partes.length > tope) {
      return modelo.sentido === SENTIDO_FILAS
        ? `${donde} tiene ${plural(modelo.partes.length, 'parte', 'partes')}: el máximo son ${tope}.`
        : `${donde} tiene ${plural(modelo.partes.length, 'parte', 'partes')}: el máximo son ${tope}, porque con más no caben en el ancho de la hoja.`;
    }
    const ids = new Set();
    for (let i = 0; i < modelo.partes.length; i += 1) {
      const m = motivoDeParte(modelo.partes[i], `la parte ${i + 1} de ${donde}`, { sentido: modelo.sentido, ids });
      if (m) return m;
      ids.add(modelo.partes[i].id);
    }
    if (modelo.version !== undefined && !(Number.isInteger(modelo.version) && modelo.version >= 1)) {
      return `la versión de ${donde} no es un número entero de 1 en adelante.`;
    }
    return null;
  }

  // POR QUÉ LA LISTA DE MODELOS DE UNA PLANTILLA NO VALE. Una plantilla sin modelos —todas las de
  // hoy— no tiene nada que comprobar.
  function motivoDeModelos(modelos) {
    if (modelos === undefined || modelos === null) return null;
    if (!esObjeto(modelos)) return 'los modelos de tabla de la plantilla no son un objeto { id: modelo }.';
    const ids = Object.keys(modelos);
    if (ids.length > MAX_MODELOS) return `la plantilla tiene ${plural(ids.length, 'modelo de tabla', 'modelos de tabla')}: el máximo son ${MAX_MODELOS}.`;
    for (const id of ids) {
      const m = motivoDeModelo(modelos[id], `el modelo «${id}»`, { id });
      if (m) return m;
    }
    return null;
  }

  // POR QUÉ LA ESTRUCTURA QUE UNA TABLA GUARDA PARA SÍ NO VALE. Son las mismas partes de un modelo,
  // sin nombre ni tipo ni sentido: eso es del modelo del que divergió, no de la tabla.
  // `sentido` es el que está EN VIGOR para este campo (`sentidoVigente`), no el de omisión del tipo:
  // una parte se mide distinto a lo ancho que a lo alto —el `ancho` solo existe a lo ancho y el tope
  // de partes no es el mismo—, así que medirla con el sentido equivocado aceptaría unos anchos que
  // luego reparten las columnas que no son, y rechazaría por «el máximo son 12» una estructura de
  // veinte filas que cabe de sobra.
  function motivoDeEstructura(estructura, donde, { tipo, sentido: pedido } = {}) {
    if (estructura === undefined) return null;
    if (!esObjeto(estructura)) return `la estructura de ${donde} no es un objeto { partes: [...] }.`;
    const extra = sobran(estructura, ['partes']);
    if (extra.length) return `la estructura de ${donde} lleva ${comillas(extra)}, que no existe en la estructura de una tabla: solo «partes».`;
    if (!Array.isArray(estructura.partes)) return `las partes de la estructura de ${donde} no son una lista.`;
    const sentido = SENTIDOS.indexOf(pedido) >= 0 ? pedido : sentidoPorOmision(tipo);
    const tope = sentido === SENTIDO_FILAS ? MAX_PARTES_ALTO : MAX_PARTES_ANCHO;
    if (estructura.partes.length > tope) {
      return `la estructura de ${donde} tiene ${plural(estructura.partes.length, 'parte', 'partes')}: el máximo son ${tope}.`;
    }
    const ids = new Set();
    for (let i = 0; i < estructura.partes.length; i += 1) {
      const m = motivoDeParte(estructura.partes[i], `la parte ${i + 1} de la estructura de ${donde}`, { sentido, ids });
      if (m) return m;
      ids.add(estructura.partes[i].id);
    }
    return null;
  }

  // ---------------------------------------------------------------- la tabla contra su estructura

  // Una celda combinada no cabe en una tabla con estructura: la casilla de la fila i y la parte j es
  // UNA, y un `colspan` la haría ser de dos partes a la vez, con lo que el texto quedaría bajo un
  // rótulo que no es el suyo en cuanto alguien retirara o moviera una parte.
  const combinada = (c) => esObjeto(c) && ((c.colspan || 1) > 1 || (c.rowspan || 1) > 1);

  // POR QUÉ EL CONTENIDO DE UNA TABLA NO CUADRA CON LA ESTRUCTURA QUE SIGUE, o null si cuadra (y
  // también si no sigue ninguna, que es el caso de todo lo que hay escrito hoy).
  //
  // El contenido se empareja con TODAS las partes, retiradas incluidas, porque retirar no borra: el
  // hueco de la parte retirada sigue ahí y vuelve con ella. Y una tabla SIN CONTENIDO cuadra con
  // cualquier estructura: es la tabla que existe y a la que no se le ha escrito nada, igual que
  // `{ filas: [] }` en core/estructurados.js.
  function motivoDeContenido(campo, valor, modelos, donde = 'la tabla') {
    const e = estructuraDeTabla(campo, valor, modelos);
    if (!e) return null;
    const cuantas = e.partes.length;
    const comoSe = e.sentido === SENTIDO_FILAS ? 'filas' : 'columnas';
    const filas = filasDe(valor);

    // La tabla de clave y valor que se imprime por sus `pares` —la que no tiene rejilla, porque cuál
    // de las dos se imprime lo dice `queSeImprime` de core/estructurados.js— empareja un par con cada
    // parte. La que sí la tiene se comprueba como cualquier rejilla, más abajo.
    if (e.tipo === TIPO_CLAVE_VALOR && !filas.length) {
      const pares = esObjeto(valor) && Array.isArray(valor.pares) ? valor.pares : [];
      if (pares.length && pares.length !== cuantas) {
        return `${donde} tiene ${plural(pares.length, 'fila', 'filas')} y su estructura dice que tiene ${cuantas}: el contenido de una tabla con estructura va parte por parte, y las retiradas también cuentan.`;
      }
      return null;
    }

    if (!filas.length) return null;

    if (e.sentido === SENTIDO_FILAS) {
      if (filas.length !== cuantas) {
        return `${donde} tiene ${plural(filas.length, 'fila', 'filas')} y su estructura dice que tiene ${cuantas}: el contenido de una tabla con estructura va parte por parte, y las ${comoSe} retiradas también cuentan.`;
      }
    } else {
      for (let i = 0; i < filas.length; i += 1) {
        const fila = Array.isArray(filas[i]) ? filas[i] : [];
        if (fila.length !== cuantas) {
          return `la fila ${i + 1} de ${donde} tiene ${plural(fila.length, 'celda', 'celdas')} y su estructura dice que tiene ${cuantas} ${comoSe}: el contenido de una tabla con estructura va parte por parte, y las retiradas también cuentan.`;
        }
      }
    }

    for (let i = 0; i < filas.length; i += 1) {
      const fila = Array.isArray(filas[i]) ? filas[i] : [];
      for (let j = 0; j < fila.length; j += 1) {
        if (combinada(fila[j])) {
          return `la celda ${j + 1} de la fila ${i + 1} de ${donde} está combinada, y ${donde} sigue una estructura: cada casilla es de una parte y de una sola.`;
        }
      }
    }
    return null;
  }

  const api = {
    TIPOS, TIPO_TABLA, TIPO_CLAVE_VALOR,
    SENTIDOS, SENTIDO_COLUMNAS, SENTIDO_FILAS, sentidoPorOmision, sentidoVigente,
    MAX_PARTES_ANCHO, MAX_PARTES_ALTO, MAX_MODELOS, LARGO_NOMBRE,
    modelosDe, buscar, modeloDeCampo, partesVigentes,
    estructuraDeTabla, tablaVigente, paresVigentes,
    motivoDeModelo, motivoDeModelos, motivoDeParte, motivoDeEstructura, motivoDeContenido,
  };

  global.Core = global.Core || {};
  global.Core.modelosTabla = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
