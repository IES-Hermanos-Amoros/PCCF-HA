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
//     id,        con el que apuntan los campos. Se acuña UNA VEZ y NO sigue al nombre nunca
//     nombre,    lo que se enseña: «Ficha de actividad»
//     tipo,      'tabla' | 'tabla_clave_valor': a qué tipo de campo se le puede poner
//     sentido,   'columnas' (las partes van a lo ancho) | 'filas' (van a lo alto)
//     columnas,  de cuántas columnas es la tabla cuando sus partes van a lo alto (por omisión 2)
//     partes: [ { id, etiqueta, peso?, ancho?, grupo?, solo_si_hay?, retirado? } ],
//     version
//   }
//
// CÓMO SE COLOCAN LAS PARTES QUE VAN A LO ALTO. No es «una fila por parte»: es la maquetación de la
// ficha de situación de aprendizaje, que es la única que existe en los documentos del departamento y
// la que lleva 306 fichas funcionando. Las partes se EMPAQUETAN en filas de `columnas`, cada una
// ocupando las que diga su `ancho`; se abre fila cuando la siguiente no cabe o cuando cambia de
// `grupo`; y cada fila de partes imprime DOS filas de tabla, los rótulos encima y los contenidos
// debajo. `grupo` escribe además su nombre una sola vez, en una fila que ocupa la tabla entera.
// `solo_si_hay` omite la fila cuando ninguna de sus partes tiene nada escrito.
//
// CADA SENTIDO TIENE SU MEDIDA Y SU NOMBRE, porque son magnitudes distintas y no se convierten una
// en otra: a lo ancho, `peso` es el peso RELATIVO de la columna —un número positivo, puede ser
// decimal, lo reparte cada motor sobre el ancho de la hoja—; a lo alto, `ancho` es CUÁNTAS de las
// `columnas` ocupa la parte en su fila, un entero que acaba siendo su `colspan`. Con un solo nombre
// para las dos, un número escrito para un sentido se usaba como la medida del otro en cuanto alguien
// le cambiaba el sentido al modelo, y repartir las columnas con unos números que no son de eso no se
// ve: sale una tabla torcida y nadie sabe por qué. Usar la del otro sentido es un error con
// explicación y no un valor que se ignore en silencio.
//
// `grupo` ES `{ id, etiqueta }` Y NO UN TEXTO, por lo mismo que el id de una parte no es su nombre: el
// id decide qué partes van juntas y la etiqueta es lo que se imprime, así que renombrar un grupo no
// cambia su identidad ni deja huérfano nada. En la ficha están separados a propósito —el id es
// `'actividades'` y el rótulo es otro texto, `CABECERA_ACTIVIDADES`— y así eso deja de ser una
// traducción rara y pasa a ser el caso normal.
//
// LA MAQUETACIÓN ESTÁ ESCRITA DOS VECES, AQUÍ Y EN `filasDeFicha` DE core/sa.js, A PROPÓSITO Y
// TEMPORALMENTE. Es la única excepción a «una regla en un solo sitio» de toda esta pieza, y existe
// para no tocar `core/sa.js`, que gobierna 306 fichas reales y hoy no corre ningún riesgo: mover su
// maquetación aquí por limpieza, antes de que nada más la use, sería el peor cambio posible. La
// duplicación la quita la pieza que absorba la ficha, no antes. Mientras exista, lo que la mantiene
// honesta es `test/modelos-tabla.js`, que construye un modelo desde las propias
// `CAMPOS_POR_OMISION` de core/sa.js y compara celda por celda contra `filasDeFicha`: si las dos se
// separan, esa prueba falla.
//
// Un campo apunta a su modelo con `campo.modelo`; sin esa clave, el campo no usa modelo. Y una
// tabla concreta que ha DIVERGIDO del modelo guarda su forma junto a su contenido, en
// `valor.estructura = { partes: [...], sentido }`.
//
// LA ESTRUCTURA PROPIA GUARDA TAMBIÉN EL SENTIDO, y no solo las partes. Si el sentido lo siguiera
// diciendo el modelo del que la tabla se desengachó, el departamento podría girarle la tabla
// noventa grados a algo que ya había divergido —el contenido de las columnas leído como filas—, que
// es exactamente «cambiar el documento por la espalda», lo único que divergir existe para evitar.
//
// EL ID DE UN MODELO Y EL DE UNA PARTE NO SON SU NOMBRE, por lo mismo que el de un apartado y el de
// un campo (core/plantilla.js): los campos apuntan al modelo por su id y el contenido de cada tabla
// se guarda por el id de su parte, así que un id que siguiera al nombre dejaría huérfano lo escrito
// en cuanto alguien renombrara una columna. `nombre` y `etiqueta` son solo lo que se enseña.
//
// ==================================================================== LA REGLA
//
// Son dos preguntas, y las dos tienen la misma forma y la misma respuesta de siempre.
//
// 1. QUÉ ESTRUCTURA SIGUE UNA TABLA. Sigue SU PROPIA estructura mientras la tenga, y la del MODELO
//    cuando no la tenga. Si no tiene ninguna de las dos, su forma se deduce de las celdas
//    guardadas, que es lo que pasa hoy con todo lo que hay escrito en los documentos.
//
// 2. DE DÓNDE SALE SU CONTENIDO. Sale de su REJILLA (`filas`) mientras la tenga, y de sus CASILLAS
//    —el contenido por id de parte— en cuanto deja de tenerla.
//
// La segunda no es una regla nueva: es, literalmente, la de la ficha de situación de aprendizaje,
// «una ficha se imprime desde `filas` mientras las tenga y desde el modelo en cuanto deja de
// tenerlas» (la cabecera de `completarDesdeFilas` en core/sa.js), y es la misma que ya decide entre
// `filas` y `pares` en `queSeImprime` de core/estructurados.js. El motivo es el de siempre: lo que
// alguien tiene delante manda sobre lo que diga el grupo, porque si no, el primer cambio del
// departamento al modelo reescribiría por la espalda tablas que nadie ha tocado, y nadie
// relacionaría lo que cambió con lo que hizo.
//
// Lo que se sigue de las dos juntas es que PONERLE UN MODELO A UNA TABLA YA ESCRITA NO LE HACE NADA:
// conserva su rejilla, y mientras la conserve se imprime y se edita exactamente como hoy. Adoptar el
// modelo —soltarle la fila de rótulos que lleva entre las celdas y emparejarla con las partes— es
// una pieza aparte, y hasta que exista el modelo solo gobierna las tablas que nacen con él.
//
// TENERLA ES TENER PARTES. Una estructura con `partes: []` no es una estructura: es la lista vacía, y
// se cae al escalón siguiente igual que `filas: []`. Pero ENGANCHAR un modelo sin partes NO es un
// no-op que se calla: un modelo recién creado y todavía vacío sería indistinguible de no tener
// modelo, y quien lo enganchó no se enteraría de nada, así que la puerta lo dice (`motivoDeContenido`).
//
// Y LA REGLA ESTÁ ESCRITA UNA SOLA VEZ, en `estructuraDeTabla`. La llaman los tres consumidores: el
// PDF (motor/render-generico.js), el Word (motor/exportar-docx.js) y el editor con la puerta de
// guardado (core/tablas-edicion.js y core/estructurados.js). Escrita en cada uno, la pantalla
// acabaría pintando una tabla distinta de la que sale impresa, que es la avería que esta pieza
// existe para evitar.
//
// ==================================================================== EL CONTENIDO VA POR ID
//
// `valor.casillas` es un mapa del id de la parte a lo que esa parte guarda:
//
//   sentido 'filas'      una CASILLA: la parte es una fila y lo que guarda es su contenido. Es
//                        literalmente `ficha[id]` de core/sa.js
//   sentido 'columnas'   la LISTA de sus casillas hacia abajo: la parte es una columna
//
// POR ID Y NO POR POSICIÓN, que es la decisión de la que cuelga todo lo demás:
//
//   · Añadir, mover o retirar una parte toca CERO tablas guardadas, que es justo lo que el
//     departamento pidió: que el cambio vaya al grupo. Con el contenido posicional, añadir una
//     columna obligaría a reescribir todas las filas de todas las tablas del grupo.
//   · No hay estados intermedios imposibles. Con el contenido posicional, una tabla de rótulos a lo
//     alto solo podía tener cero filas o todas, y no se podía llenar de una en una.
//   · Y la ficha de situación de aprendizaje se absorbe de verdad y no por parecido: ya guarda por
//     id, así que es el mismo modelo de datos y no uno que se le dé la mano.
//
// RETIRAR UNA PARTE NO BORRA SU CONTENIDO, igual que retirar un apartado o un campo
// (core/plantilla.js): la parte se queda en el modelo con `retirado: true` y deja de imprimirse y de
// pintarse, pero su casilla sigue en `valor.casillas` bajo su id. Restaurar la parte devuelve la
// columna con todo lo que tenía escrito. Por id no hay nada que correr: es el id el que empareja, no
// el sitio, así que retirar la segunda de cuatro columnas no mueve a las otras dos.
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
  // Por eso los dos tipos de campo a los que se les puede poner modelo y los topes están escritos
  // aquí en lugar de importados: son `TIPO_TABLA`, `TIPO_CLAVE_VALOR`, `MAX_COLUMNAS` y `MAX_FILAS`
  // de core/estructurados.js. Es lo mismo que hace `slug` de core/plantilla.js con el del importador,
  // y test/modelos-tabla.js comprueba que las copias no se separan.
  const TIPO_TABLA = 'tabla';
  const TIPO_CLAVE_VALOR = 'tabla_clave_valor';
  const TIPOS = [TIPO_TABLA, TIPO_CLAVE_VALOR];
  const MAX_PARTES_ANCHO = 12;
  const MAX_PARTES_ALTO = 200;
  // Cuántas casillas puede guardar una parte que es una columna, que son las filas de contenido de
  // la tabla: el `MAX_FILAS` de la puerta.
  const MAX_CASILLAS_POR_PARTE = 200;

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

  // La clave bajo la que una tabla guarda su contenido por id de parte. Dicha una vez: la leen esta
  // regla y la puerta, que es quien comprueba la forma de cada casilla.
  const CLAVE_CASILLAS = 'casillas';

  const esObjeto = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
  const esCadena = (x) => typeof x === 'string' && !!x.trim();
  const sobran = (objeto, permitidas) => Object.keys(objeto).filter((k) => permitidas.indexOf(k) < 0);
  const comillas = (claves) => claves.map((k) => '«' + k + '»').join(', ');
  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

  const CLAVES_MODELO = ['id', 'nombre', 'tipo', 'sentido', 'columnas', 'partes', 'version'];
  const CLAVES_PARTE = ['id', 'etiqueta', 'peso', 'ancho', 'grupo', 'solo_si_hay', 'retirado'];
  const CLAVES_GRUPO = ['id', 'etiqueta'];
  const CLAVES_ESTRUCTURA = ['partes', 'sentido', 'columnas'];

  // De cuántas columnas es una tabla cuyas partes van a lo alto, si no lo dice. Dos es el rótulo y su
  // contenido, que es el caso simple; la ficha dice cuatro.
  const COLUMNAS_POR_OMISION = 2;

  const esEntero = (x, desde) => Number.isInteger(x) && x >= desde;

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
  // valor, a la izquierda. Es el respaldo de una estructura antigua que no dijera el suyo.
  const sentidoPorOmision = (tipo) => (tipo === TIPO_CLAVE_VALOR ? SENTIDO_FILAS : SENTIDO_COLUMNAS);
  const declarado = (x) => (esObjeto(x) && SENTIDOS.indexOf(x.sentido) >= 0 ? x.sentido : null);

  // EL SENTIDO QUE ESTÁ EN VIGOR para una tabla. Lo dice la estructura que la tabla sigue: la SUYA
  // si ha divergido —por eso la guarda, ver la cabecera— y la del modelo si no. Hace falta aparte de
  // `estructuraDeTabla` porque la puerta mide la forma de una estructura propia antes de saber si
  // llega a estar en vigor, y una parte se mide distinto según el sentido: el `ancho` solo existe a
  // lo ancho y el tope de partes no es el mismo.
  function sentidoVigente(campo, valor, modelos) {
    const tipo = esObjeto(campo) ? campo.tipo : undefined;
    const propia = esObjeto(valor) ? valor.estructura : null;
    if (conPartes(propia)) return declarado(propia) || sentidoPorOmision(tipo);
    return declarado(modeloDeCampo(campo, modelos)) || sentidoPorOmision(tipo);
  }

  // DE CUÁNTAS COLUMNAS ES LA TABLA, cuando sus partes van a lo alto. Lo dice la estructura que la
  // tabla sigue, igual que el sentido y por el mismo motivo: una tabla divergida que no lo diga son
  // dos columnas, y NO las que diga el modelo del que se desengachó, porque entonces el modelo
  // podría reempaquetarle las filas después.
  function columnasDeclaradas(x) {
    return esObjeto(x) && esEntero(x.columnas, 1) ? x.columnas : null;
  }

  // Las partes que se imprimen y se pintan: todas menos las retiradas, en su orden. La retirada se
  // queda en el modelo y su casilla sigue guardada bajo su id (ver «RETIRAR UNA PARTE NO BORRA»).
  //
  // Y SE CAE LO QUE NO ES UNA PARTE. La puerta no deja guardar un modelo con un `null` dentro, así
  // que esto solo pasa con una plantilla escrita a mano; pero el camino de lectura no comprueba el
  // modelo, y una parte que no es un objeto reventaba la maquetación al pedirle su id, que es el
  // tomo entero que deja de salir. Es el mismo cuidado que con las partes todas retiradas.
  const partesVigentes = (partes) => (Array.isArray(partes) ? partes : [])
    .filter((parte) => esObjeto(parte) && !parte.retirado);

  // LA REGLA, Y EL ÚNICO SITIO DONDE ESTÁ ESCRITA. Qué estructura sigue esta tabla:
  //
  //   null                    ninguna: su forma se deduce de las celdas guardadas, que es lo que
  //                           pasa hoy con todo lo que hay escrito en los documentos
  //   { origen: 'propia' }    la que la tabla guarda junto a su contenido, porque ha divergido
  //   { origen: 'modelo' }    la del modelo al que apunta su campo
  //
  // `modelos` es `plantilla.modelos`, que puede no venir. `partes` son todas, con las retiradas
  // dentro —el contenido de una retirada sigue guardado—, y `vigentes` las que se imprimen.
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
      sentido: sentidoVigente(campo, valor, modelos),
      columnas: (propias ? columnasDeclaradas(valor.estructura) : columnasDeclaradas(modelo))
        || COLUMNAS_POR_OMISION,
      partes,
      vigentes: partesVigentes(partes),
    };
  }

  // ---------------------------------------------------------------- aplicarla

  const celda = (text, extra) => Object.assign({ text: String(text == null ? '' : text) }, extra);
  const etiquetaDe = (parte) => (esObjeto(parte) ? String(parte.etiqueta == null ? '' : parte.etiqueta) : '');
  const filasDe = (valor) => (esObjeto(valor) && Array.isArray(valor.filas) ? valor.filas : []);

  // EL GRUPO DE UNA PARTE: su id, con el que se compara, y su etiqueta, que es lo que se imprime. Sin
  // grupo, `null`. Un grupo a medio escribir —sin id— no agrupa: cuenta como no tenerlo, igual que una
  // estructura sin partes no es una estructura.
  const grupoDe = (parte) => {
    const g = esObjeto(parte) ? parte.grupo : undefined;
    return esObjeto(g) && esCadena(g.id) ? g : null;
  };
  const idDeGrupo = (parte) => {
    const g = grupoDe(parte);
    return g ? g.id : null;
  };
  const etiquetaDeGrupo = (parte) => {
    const g = grupoDe(parte);
    return g ? String(g.etiqueta == null ? '' : g.etiqueta) : '';
  };

  // El contenido por id de parte, o `{}`.
  const casillasDe = (valor) => (esObjeto(valor) && esObjeto(valor[CLAVE_CASILLAS]) ? valor[CLAVE_CASILLAS] : {});

  // ¿HA ADOPTADO YA ESTA TABLA SU ESTRUCTURA? La ha adoptado cuando su contenido va por id de parte y
  // ya no tiene el de antes: ni rejilla ni pares. Es la segunda mitad de la regla: una tabla se
  // imprime desde `filas` mientras las tenga, igual que una ficha (`completarDesdeFilas` de
  // core/sa.js), así que ponerle un modelo a una tabla ya escrita no le hace nada hasta que alguien
  // la adopte, que es una pieza aparte.
  //
  // LOS `pares` CUENTAN IGUAL QUE LAS `filas`. Si no contaran, una tabla de clave y valor con las dos
  // cosas se daría por adoptada y sus pares se quedarían guardados sin imprimirse, que es el estado
  // silencioso que la puerta existe para impedir (`motivoDeContenido`, «en dos sitios a la vez»).
  const adoptada = (valor) => esObjeto(valor) && esObjeto(valor[CLAVE_CASILLAS])
    && !filasDe(valor).length && valor.pares === undefined;

  // Lo que guarda una parte: una casilla si es una fila, su lista de casillas si es una columna.
  const casillaDe = (casillas, parte) => (esObjeto(casillas[parte.id]) ? casillas[parte.id] : null);
  const columnaDe = (casillas, parte) => (Array.isArray(casillas[parte.id]) ? casillas[parte.id] : []);

  // Los anchos que pide la estructura: una proporción por parte vigente, y solo si TODAS la dicen. A
  // medias no valen —`motivoDeAnchos` de core/estructurados.js exige una por columna— y una lista
  // incompleta la descartaría cada motor por su cuenta, repartiendo según el texto y sin avisar.
  //
  // SOLO A LO ANCHO, y por eso lee `peso` y no `ancho`: son dos claves distintas justamente para que
  // la medida de un sentido no pueda acabar usada como la del otro.
  function pesosDeEstructura(vigentes) {
    const todos = vigentes.map((parte) => (esObjeto(parte) ? parte.peso : undefined));
    const vale = (a) => typeof a === 'number' && Number.isFinite(a) && a > 0;
    return todos.length && todos.every(vale) ? todos : undefined;
  }

  // ¿TIENE ESTA PARTE ALGO ESCRITO? Es lo que decide `solo_si_hay`. Algo escrito es texto que no son
  // solo espacios, igual que en la ficha (`deLineas(...).trim()` de core/sa.js).
  const conTexto = (x) => esObjeto(x) && String(x.text == null ? '' : x.text).trim() !== '';
  function hayContenido(parte, casillas, sentido) {
    if (sentido === SENTIDO_FILAS) return conTexto(casillaDe(casillas, parte));
    return columnaDe(casillas, parte).some(conTexto);
  }

  // Cuántas de las columnas de la tabla ocupa una parte que va a lo alto: lo que diga su `ancho` y al
  // menos una. La cuenta es LITERALMENTE la de la ficha (`const ancho = (v) => (v > 1 ? v : 1)` de
  // core/sa.js) y no «el ancho si es un entero», que es lo razonable, porque mientras las dos
  // maquetaciones existan a la vez lo que importa es que no puedan discrepar: que un `ancho` raro
  // salga raro en las dos es un defecto, que salga distinto en cada una es un documento que cambia
  // al absorber la ficha. Que no sea un entero lo rechaza la puerta.
  const ocupa = (parte) => {
    const a = esObjeto(parte) ? parte.ancho : undefined;
    return typeof a === 'number' && a > 1 ? a : 1;
  };

  // LAS PARTES, EMPAQUETADAS EN FILAS DE `columnas`. Se abre fila cuando la siguiente no cabe o
  // cuando cambia de grupo, que es lo que hace que un grupo empiece siempre en una fila nueva.
  function empaquetar(vigentes, columnas) {
    const filas = [];
    let actual = [];
    let suma = 0;
    for (const parte of vigentes) {
      const w = ocupa(parte);
      // Se compara el ID del grupo y no su etiqueta: es el id el que dice qué partes van juntas.
      if (actual.length && (suma + w > columnas || idDeGrupo(actual[0]) !== idDeGrupo(parte))) {
        filas.push(actual);
        actual = [];
        suma = 0;
      }
      actual.push(parte);
      suma += w;
    }
    if (actual.length) filas.push(actual);
    return filas;
  }

  const conColspan = (ancho, extra) => (ancho > 1 ? Object.assign({ colspan: ancho }, extra) : extra);

  // LA TABLA DE UNAS PARTES QUE VAN A LO ALTO: la maquetación de la ficha (ver la cabecera). Cada
  // fila de partes imprime dos filas de tabla, los rótulos encima y los contenidos debajo; un grupo
  // escribe su nombre una vez, en una fila que ocupa la tabla entera; y una fila cuyas partes son
  // todas `solo_si_hay` y ninguna tiene nada escrito no se imprime.
  //
  // El rótulo lleva `campo` con el id de su parte, por lo mismo que en la ficha: quien edite la tabla
  // sabe así qué celda es de qué parte sin fiarse del texto del rótulo, que se puede renombrar.
  function aLoAlto(estructura, casillas) {
    const { vigentes, columnas } = estructura;
    const out = [];
    // EL RÓTULO DE UN GRUPO SE ESCRIBE CADA VEZ QUE EL GRUPO CAMBIA respecto de la fila ANTERIOR QUE SE
    // IMPRIMIÓ, y no una vez por tabla: así un grupo que reaparece después de otro se vuelve a rotular
    // en lugar de parecer la continuación del de arriba. Y la fila que no se imprime no cuenta como
    // cambio, porque entonces el rótulo saldría separado de las filas que encabeza.
    //
    // Es la misma regla, paso por paso, que `filasDeFicha` de core/sa.js: ver la nota de la cabecera
    // sobre por qué la maquetación está escrita dos veces a propósito.
    let grupoAnterior = null;
    for (const fila of empaquetar(vigentes, columnas)) {
      const todasOpcionales = fila.every((p) => esObjeto(p) && p.solo_si_hay);
      if (todasOpcionales && !fila.some((p) => hayContenido(p, casillas, SENTIDO_FILAS))) continue;
      const grupo = idDeGrupo(fila[0]);
      if (grupo && grupo !== grupoAnterior) {
        out.push([celda(etiquetaDeGrupo(fila[0]), conColspan(columnas, { bold: true }))]);
      }
      grupoAnterior = grupo;
      out.push(fila.map((p) => celda(etiquetaDe(p), conColspan(ocupa(p), { bold: true, campo: p.id }))));
      out.push(fila.map((p) => {
        const x = casillaDe(casillas, p);
        const base = conColspan(ocupa(p), undefined);
        return base ? Object.assign({}, x || celda(''), base) : (x || celda(''));
      }));
    }
    // Los rótulos van dentro de la tabla, no en una cabecera que se repita al cambiar de página.
    return { filas: out, anchos: undefined, cabecera: false };
  }

  // LA TABLA QUE SE IMPRIME Y SE PINTA, en la forma que los dos motores y el editor ya saben
  // colocar: `{ filas, anchos, cabecera }`.
  //
  // `cabeceraSinEstructura` es lo que decide `cabeceraDeTabla` de core/estructurados.js, que es
  // quien sabe de `campo.columnas` y de la negrita de la primera fila. Se pasa HECHA, y no se
  // calcula aquí, por dos razones: para que esta regla no dependa de la puerta, y para que el camino
  // de la tabla que no sigue estructura —o que no la ha adoptado— sea literalmente el de siempre:
  // las mismas filas, los mismos anchos y la misma cabecera que recibe, sin copiar nada. Esa es la
  // puerta de aceptación de esta pieza.
  //
  // Con la estructura adoptada, el contenido guardado NO lleva los rótulos: los pone la estructura, y
  // es lo que hace que el modelo valga para algo —renombrar una columna en la plantilla la renombra
  // en las once tablas a la vez—. Con `sentido: 'columnas'` se monta la fila de rótulos y debajo
  // tantas filas como casillas tenga la columna más larga; con `sentido: 'filas'` cada parte es una
  // fila de dos columnas, su rótulo y su casilla.
  //
  // Y los anchos los pone la estructura, no el valor: el ancho de una columna es parte de la forma y
  // la forma la dice el modelo.
  function tablaVigente(campo, valor, modelos, cabeceraSinEstructura) {
    const estructura = estructuraDeTabla(campo, valor, modelos);
    if (!estructura || !adoptada(valor)) {
      return {
        estructura: estructura || null,
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
    const casillas = casillasDe(valor);
    if (sentido === SENTIDO_FILAS) return Object.assign({ estructura }, aLoAlto(estructura, casillas));
    // A lo ancho, una parte `solo_si_hay` sin nada escrito es una columna que no se imprime. Aquí se
    // decide por parte y no por fila porque cada parte ES una columna: no hay fila que compartir.
    const aLaVista = vigentes.filter((p) => !(esObjeto(p) && p.solo_si_hay) || hayContenido(p, casillas, SENTIDO_COLUMNAS));
    if (!aLaVista.length) return { estructura, filas: [], anchos: undefined, cabecera: false };
    const anchos = pesosDeEstructura(aLaVista);
    const alto = aLaVista.reduce((n, parte) => Math.max(n, columnaDe(casillas, parte).length), 0);
    return {
      estructura,
      filas: [aLaVista.map((parte) => celda(etiquetaDe(parte), { bold: true, campo: parte.id }))].concat(
        Array.from({ length: alto }, (_, i) => aLaVista.map((parte) => {
          const x = columnaDe(casillas, parte)[i];
          return esObjeto(x) ? x : celda('');
        })),
      ),
      anchos,
      // La fila de los rótulos es la cabecera que se repite al cambiar de página: es lo que es, y no
      // depende de que alguien le haya puesto la negrita.
      cabecera: true,
    };
  }

  // LAS FILAS DE UNA TABLA DE CLAVE Y VALOR, con los rótulos de su estructura. Va aparte de
  // `tablaVigente` porque qué mitad de una tabla de clave y valor se imprime —sus `filas` o sus
  // `pares`— lo decide `queSeImprime` de core/estructurados.js y no esta regla: quien llama ya ha
  // preguntado, y así no hay dos reglas discutiendo sobre la misma tabla.
  //
  // Sus partes son siempre sus filas (`motivoDeModelo` no admite otra cosa), así que cada una guarda
  // UNA casilla: el par es su rótulo y esa casilla. El par sin nada escrito sale con su rótulo y el
  // contenido en blanco, igual que una fila a medio rellenar.
  function paresVigentes(campo, valor, modelos) {
    const estructura = estructuraDeTabla(campo, valor, modelos);
    if (!estructura || !adoptada(valor)) {
      return { estructura: estructura || null, pares: esObjeto(valor) ? valor.pares : undefined };
    }
    const casillas = casillasDe(valor);
    return {
      estructura,
      // Una parte `solo_si_hay` sin nada escrito no imprime su fila, igual que en cualquier otra tabla.
      pares: estructura.vigentes
        .filter((p) => !(esObjeto(p) && p.solo_si_hay) || hayContenido(p, casillas, SENTIDO_FILAS))
        .map((parte) => {
          const x = casillaDe(casillas, parte);
          return { etiqueta: etiquetaDe(parte), valor: x ? String(x.text == null ? '' : x.text) : '' };
        }),
    };
  }

  // ---------------------------------------------------------------- por qué un modelo no vale

  // La forma de UNA parte. `ancho` solo tiene sentido con `sentido: 'columnas'`: con los rótulos a la
  // izquierda la parte es una fila y una fila no tiene ancho de columna, así que se rechaza en lugar
  // de guardarse para no imprimirse nunca.
  // La forma de UNA parte. Cada sentido tiene su medida y su nombre (ver la cabecera), así que lo que
  // se comprueba es que cada una esté donde le toca: `peso` solo a lo ancho, donde es un peso relativo
  // que puede ser decimal; `ancho` solo a lo alto, donde son columnas enteras y no puede pedir más de
  // las que la tabla tiene. Usar la del otro sentido se dice, no se ignora.
  function motivoDeParte(parte, donde, { sentido, tipo, columnas, ids } = {}) {
    if (!esObjeto(parte)) return `${donde} no es un objeto { id, etiqueta }.`;
    const extra = sobran(parte, CLAVES_PARTE);
    if (extra.length) return `${donde} lleva ${comillas(extra)}, que no existe en una parte de un modelo.`;
    if (!esCadena(parte.id)) return `${donde} no tiene «id»: es con el que se empareja su contenido y no cambia nunca.`;
    if (ids && ids.has(parte.id)) return `${donde} repite el id «${parte.id}», y dos partes con el mismo id no se pueden distinguir.`;
    if (typeof parte.etiqueta !== 'string') return `${donde} no tiene «etiqueta», o no es texto: es el rótulo que se imprime.`;
    if (parte.etiqueta.length > LARGO_NOMBRE) return `la etiqueta de ${donde} tiene ${parte.etiqueta.length} caracteres: el máximo son ${LARGO_NOMBRE}.`;
    if (parte.retirado !== undefined && typeof parte.retirado !== 'boolean') return `${donde} tiene «retirado» y no es true ni false.`;
    if (parte.solo_si_hay !== undefined && typeof parte.solo_si_hay !== 'boolean') {
      return `${donde} tiene «solo_si_hay» y no es true ni false.`;
    }
    const aLoAlto_ = sentido === SENTIDO_FILAS && tipo !== TIPO_CLAVE_VALOR;
    if (parte.grupo !== undefined) {
      if (!aLoAlto_) {
        return `${donde} tiene «grupo», y los grupos son de las partes que van a lo alto en una tabla: son los que abren fila y escriben su rótulo encima.`;
      }
      const g = parte.grupo;
      if (!esObjeto(g)) return `el «grupo» de ${donde} no es un objeto { id, etiqueta }: el id dice qué partes van juntas y la etiqueta es lo que se imprime.`;
      const sobra = sobran(g, CLAVES_GRUPO);
      if (sobra.length) return `el grupo de ${donde} lleva ${comillas(sobra)}, que no existe en un grupo: solo ${comillas(CLAVES_GRUPO)}.`;
      if (!esCadena(g.id)) return `el grupo de ${donde} no tiene «id»: es con el que se sabe qué partes van juntas y no cambia al renombrarlo.`;
      if (typeof g.etiqueta !== 'string') return `el grupo de ${donde} no tiene «etiqueta», o no es texto: es el rótulo que se imprime encima.`;
      if (g.etiqueta.length > LARGO_NOMBRE) return `la etiqueta del grupo de ${donde} tiene ${g.etiqueta.length} caracteres: el máximo son ${LARGO_NOMBRE}.`;
    }

    // `peso` es la medida de las partes que van a lo ANCHO: un peso relativo de columna.
    if (parte.peso !== undefined) {
      if (sentido !== SENTIDO_COLUMNAS) {
        return `${donde} tiene «peso», y el peso es de las partes que van a lo ancho, donde cada parte es una columna y el peso es la parte del ancho de la hoja que se lleva. A lo alto, lo que se dice es «ancho»: las columnas que ocupa.`;
      }
      if (typeof parte.peso !== 'number' || !Number.isFinite(parte.peso) || parte.peso <= 0) {
        return `el «peso» de ${donde} no es un número positivo: los pesos son relativos, no medidas.`;
      }
    }

    // `ancho` es la medida de las partes que van a lo ALTO: cuántas columnas ocupa en su fila.
    if (parte.ancho !== undefined) {
      // Una tabla de clave y valor tiene las dos columnas fijas: el concepto a la izquierda y el resto
      // del ancho para su contenido (`pintarClaveValor` de motor/render-generico.js).
      if (tipo === TIPO_CLAVE_VALOR) {
        return `${donde} tiene «ancho», y una tabla de clave y valor tiene las dos columnas fijas: el concepto a la izquierda y el resto para su contenido.`;
      }
      if (sentido !== SENTIDO_FILAS) {
        return `${donde} tiene «ancho», y el ancho son las columnas que ocupa una parte que va a lo alto. A lo ancho, cada parte ES una columna y lo que se dice es «peso»: la parte del ancho de la hoja que se lleva.`;
      }
      if (!esEntero(parte.ancho, 1)) {
        return `el «ancho» de ${donde} no es un número entero de 1 en adelante: a lo alto, el ancho son las columnas de la tabla que ocupa la parte.`;
      }
      if (columnas && parte.ancho > columnas) {
        return `${donde} ocupa ${plural(parte.ancho, 'columna', 'columnas')} y la tabla tiene ${columnas}: una parte no puede ocupar más de lo que hay.`;
      }
    }
    return null;
  }

  // La lista de partes de un modelo o de una estructura propia, medida con el sentido, el tipo y las
  // columnas que les tocan.
  function motivoDeListaDePartes(partes, donde, sentido, tipo, columnas) {
    if (!Array.isArray(partes)) return `las partes de ${donde} no son una lista.`;
    const tope = sentido === SENTIDO_FILAS ? MAX_PARTES_ALTO : MAX_PARTES_ANCHO;
    if (partes.length > tope) {
      return sentido === SENTIDO_FILAS
        ? `${donde} tiene ${plural(partes.length, 'parte', 'partes')}: el máximo son ${tope}.`
        : `${donde} tiene ${plural(partes.length, 'parte', 'partes')}: el máximo son ${tope}, porque con más no caben en el ancho de la hoja.`;
    }
    const ids = new Set();
    // UN GRUPO, UNA ETIQUETA. Dos partes del mismo grupo con rótulos distintos son dos verdades sobre
    // lo mismo, y la que se imprimiría es la de la primera: la otra se guardaría para no verse nunca.
    const etiquetasDeGrupo = new Map();
    for (let i = 0; i < partes.length; i += 1) {
      const m = motivoDeParte(partes[i], `la parte ${i + 1} de ${donde}`, { sentido, tipo, columnas, ids });
      if (m) return m;
      ids.add(partes[i].id);
      const g = grupoDe(partes[i]);
      if (g) {
        if (etiquetasDeGrupo.has(g.id) && etiquetasDeGrupo.get(g.id) !== g.etiqueta) {
          return `la parte ${i + 1} de ${donde} llama al grupo «${g.id}» «${g.etiqueta}» y otra de sus partes lo llama «${etiquetasDeGrupo.get(g.id)}»: un grupo se imprime con un solo rótulo.`;
        }
        etiquetasDeGrupo.set(g.id, g.etiqueta);
      }
    }
    return null;
  }

  // POR QUÉ LAS COLUMNAS DE UNA TABLA DE PARTES A LO ALTO NO VALEN. Solo existen ahí: a lo ancho las
  // columnas SON las partes, y en una tabla de clave y valor son dos y fijas, así que decirlas en
  // cualquiera de los dos casos sería guardar un número que nadie lee.
  function motivoDeColumnas(columnas, donde, sentido, tipo) {
    if (columnas === undefined) return null;
    if (sentido !== SENTIDO_FILAS || tipo === TIPO_CLAVE_VALOR) {
      return `${donde} dice de cuántas «columnas» es, y eso solo lo dicen las tablas cuyas partes van a lo alto: a lo ancho las columnas son las partes.`;
    }
    if (!esEntero(columnas, 1)) return `las «columnas» de ${donde} no son un número entero de 1 en adelante.`;
    if (columnas > MAX_PARTES_ANCHO) {
      return `${donde} dice tener ${columnas} columnas: el máximo son ${MAX_PARTES_ANCHO}, porque con más no caben en el ancho de la hoja.`;
    }
    return null;
  }

  // POR QUÉ UN MODELO NO VALE. Es la forma que la plantilla puede guardar; qué se puede CAMBIAR de
  // un modelo es otra cosa y todavía no existe.
  //
  // UN MODELO SIN PARTES SÍ SE GUARDA: es como nace uno, y las partes se le añaden después. Lo que no
  // se puede es ENGANCHARLO a un campo mientras esté vacío, y eso lo dice `motivoDeContenido`.
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
    const col = motivoDeColumnas(modelo.columnas, donde, modelo.sentido, modelo.tipo);
    if (col) return col;
    const p = motivoDeListaDePartes(modelo.partes, donde, modelo.sentido, modelo.tipo,
      columnasDeclaradas(modelo) || COLUMNAS_POR_OMISION);
    if (p) return p;
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

  // POR QUÉ LA ESTRUCTURA QUE UNA TABLA GUARDA PARA SÍ NO VALE. Son las partes de un modelo y el
  // sentido en el que van; no lleva nombre ni tipo, que son del modelo del que divergió.
  //
  // EL SENTIDO SE EXIGE. Es lo que impide que el modelo del que la tabla se desengachó pueda girarla
  // noventa grados después (ver la cabecera del fichero), y una estructura que no lo dijera dejaría
  // ese agujero abierto. `sentido` de las opciones es solo el respaldo con el que se mide una que no
  // lo traiga, para poder decir algo sensato de un valor a medio escribir.
  //
  // Y LA ESTRUCTURA VACÍA NO VALE: `partes: []` no es una forma que seguir, y guardarla sería dejar
  // la tabla con una estructura propia que no hace nada y que nadie ve.
  function motivoDeEstructura(estructura, donde, { tipo, sentido: respaldo } = {}) {
    if (estructura === undefined) return null;
    if (!esObjeto(estructura)) return `la estructura de ${donde} no es un objeto { partes, sentido }.`;
    const extra = sobran(estructura, CLAVES_ESTRUCTURA);
    if (extra.length) return `la estructura de ${donde} lleva ${comillas(extra)}, que no existe en la estructura de una tabla: solo ${comillas(CLAVES_ESTRUCTURA)}.`;
    if (!Array.isArray(estructura.partes)) return `las partes de la estructura de ${donde} no son una lista.`;
    if (!estructura.partes.length) {
      return `la estructura de ${donde} no tiene ninguna parte: una tabla con estructura propia es una que ha divergido de su modelo, y sin partes no hay forma que seguir.`;
    }
    if (estructura.sentido === undefined) {
      return `la estructura de ${donde} no dice en qué sentido van sus partes: lo guarda ella y no su modelo, para que un cambio del modelo no pueda girarle la tabla después.`;
    }
    if (SENTIDOS.indexOf(estructura.sentido) < 0) {
      return `la estructura de ${donde} va en «${estructura.sentido}», y los sentidos son ${comillas(SENTIDOS)}.`;
    }
    if (tipo === TIPO_CLAVE_VALOR && estructura.sentido !== SENTIDO_FILAS) {
      return `la estructura de ${donde} es de clave y valor y va en «${estructura.sentido}»: en una tabla de clave y valor cada parte es una fila.`;
    }
    const sentido = declarado(estructura) || (SENTIDOS.indexOf(respaldo) >= 0 ? respaldo : sentidoPorOmision(tipo));
    const col = motivoDeColumnas(estructura.columnas, `la estructura de ${donde}`, sentido, tipo);
    if (col) return col;
    return motivoDeListaDePartes(estructura.partes, `la estructura de ${donde}`, sentido, tipo,
      columnasDeclaradas(estructura) || COLUMNAS_POR_OMISION);
  }

  // ---------------------------------------------------------------- la tabla contra su estructura

  // POR QUÉ EL CONTENIDO DE UNA TABLA NO CUADRA CON LA ESTRUCTURA QUE SIGUE, o null si cuadra (y
  // también si no sigue ninguna, que es el caso de todo lo que hay escrito hoy). Lo que se comprueba
  // es el EMPAREJAMIENTO: que las casillas estén bajo el id de una parte que existe y que lo que
  // guarde cada parte tenga la forma que le toca por el sentido. La forma de cada casilla por dentro
  // —el texto, la negrita, el fondo— la comprueba la puerta, que es quien sabe de celdas.
  function motivoDeContenido(campo, valor, modelos, donde = 'la tabla') {
    const estructura = estructuraDeTabla(campo, valor, modelos);

    // ENGANCHAR UN MODELO SIN PARTES NO ES UN NO-OP QUE SE CALLA. Un modelo recién creado y todavía
    // vacío es indistinguible de no tener modelo: la tabla se seguiría guardando y pintando como
    // antes y quien lo enganchó no se enteraría de que no ha pasado nada.
    if (!estructura) {
      const m = modeloDeCampo(campo, modelos);
      if (m && !conPartes(m)) {
        return `este campo sigue el modelo «${m.id}», que todavía no tiene ninguna parte: hasta que el modelo diga qué partes tiene, no hay forma que seguir y ${donde} no se puede guardar con él.`;
      }
      // Y una tabla sin estructura no guarda contenido por id: no habría parte a la que pertenezca.
      if (esObjeto(valor) && valor[CLAVE_CASILLAS] !== undefined) {
        return `${donde} lleva «${CLAVE_CASILLAS}» y no sigue ninguna estructura: el contenido por parte necesita un modelo o una estructura propia que diga qué partes hay.`;
      }
      return null;
    }

    if (esObjeto(valor) && valor[CLAVE_CASILLAS] !== undefined && !esObjeto(valor[CLAVE_CASILLAS])) {
      return `«${CLAVE_CASILLAS}» de ${donde} no es un objeto { idDeParte: contenido }.`;
    }
    if (!adoptada(valor)) {
      // No ha adoptado su estructura: conserva su rejilla o sus pares y se comprueba como siempre. Lo
      // que no vale es tener el contenido en los dos sitios, porque entonces uno de los dos se
      // guardaría sin imprimirse y acabaría leyéndolo alguien.
      if (esObjeto(valor) && esObjeto(valor[CLAVE_CASILLAS])) {
        const otro = filasDe(valor).length ? '«filas»' : '«pares»';
        return `${donde} tiene su contenido en dos sitios a la vez, «${CLAVE_CASILLAS}» y ${otro}: al adoptar la estructura, el contenido pasa de uno al otro y el de antes se va.`;
      }
      return null;
    }

    const casillas = valor[CLAVE_CASILLAS];
    const porId = new Map(estructura.partes.filter((p) => esObjeto(p)).map((p) => [p.id, p]));
    const porColumnas = estructura.sentido === SENTIDO_COLUMNAS;
    let alto = null;

    for (const id of Object.keys(casillas)) {
      // Una casilla bajo un id que no es de ninguna parte es contenido que nadie puede ver. Las
      // RETIRADAS sí valen: la parte sigue en la estructura y su contenido vuelve al restaurarla.
      if (!porId.has(id)) {
        return `${donde} guarda contenido en «${id}», que no es ninguna de sus partes: el contenido de una tabla con estructura va bajo el id de su parte.`;
      }
      const suyo = `el contenido de «${etiquetaDe(porId.get(id)) || id}» en ${donde}`;
      const x = casillas[id];
      if (!porColumnas) {
        if (!esObjeto(x)) return `${suyo} no es una casilla: con los rótulos a la izquierda, cada parte es una fila y guarda una sola casilla.`;
        continue;
      }
      if (!Array.isArray(x)) return `${suyo} no es una lista de casillas: con los rótulos arriba, cada parte es una columna y guarda las casillas de su columna.`;
      if (x.length > MAX_CASILLAS_POR_PARTE) {
        return `${suyo} tiene ${plural(x.length, 'casilla', 'casillas')}: el máximo son ${MAX_CASILLAS_POR_PARTE}, que son las filas que puede tener una tabla.`;
      }
      // TODAS LAS COLUMNAS MIDEN LO MISMO. Una fila de la tabla es la casilla i de cada columna, así
      // que si una columna tuviera una casilla menos, su texto y el de las demás dejarían de estar en
      // la misma fila a partir de ahí, y eso no se ve. Una parte que no aparece es una columna sin
      // nada escrito, que sí vale: es la parte recién añadida al modelo.
      if (alto === null) alto = x.length;
      else if (x.length !== alto) {
        return `${suyo} tiene ${plural(x.length, 'casilla', 'casillas')} y otra de sus columnas tiene ${alto}: una fila de la tabla es una casilla de cada columna, así que todas las que tengan contenido miden lo mismo.`;
      }
    }
    return null;
  }

  const api = {
    TIPOS, TIPO_TABLA, TIPO_CLAVE_VALOR, CLAVE_CASILLAS,
    SENTIDOS, SENTIDO_COLUMNAS, SENTIDO_FILAS, sentidoPorOmision, sentidoVigente,
    MAX_PARTES_ANCHO, MAX_PARTES_ALTO, MAX_CASILLAS_POR_PARTE, MAX_MODELOS, LARGO_NOMBRE,
    COLUMNAS_POR_OMISION, empaquetar,
    modelosDe, buscar, modeloDeCampo, partesVigentes, casillasDe, adoptada, grupoDe,
    estructuraDeTabla, tablaVigente, paresVigentes,
    motivoDeModelo, motivoDeModelos, motivoDeParte, motivoDeEstructura, motivoDeContenido,
  };

  global.Core = global.Core || {};
  global.Core.modelosTabla = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
