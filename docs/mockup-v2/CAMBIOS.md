# Cambios aplicados respecto al v1

Lo que cambió al pasar del [mockup v1](../mockups/) al v2, en dos mitades: primero **lo que se nota
al abrirlo**, que es lo que interesa para enseñarlo en el departamento, y después el inventario
técnico de los ficheros que se tocaron, incluidos los de fuera de esta carpeta.

El *por qué* de cada decisión de interfaz, con el problema que resolvía, está en el
[README](README.md).

El v1 **no se ha modificado**: sigue entero en [`../mockups/`](../mockups/) para poder comparar.

## Qué se nota al abrirlo

Si alguien abre los dos mockups seguidos, esto es lo que ve distinto, por orden de lo que más
cambia el trabajo del día a día:

1. **El contenido es el de un documento del centro.** Los apartados no llevan texto de relleno:
   llevan la programación didáctica de DAW con su estructura y su tamaño reales —34 apartados
   comunes y los 11 módulos enteros, con sus resultados de aprendizaje, sus ponderaciones (siete u
   ocho RA con todos sus criterios, no cuatro inventados) y sus **84 situaciones de aprendizaje**, de
   cinco a once por módulo—. También se ven las tablas que el Word trae y el modelo de párrafos no sabe
   representar: la ficha del módulo, la de RA y criterios, los contenidos básicos.

   No es el documento real: es un **ejemplo saneado**. Sale de abrir el Word original, copiarlo
   parte por parte y cambiar solo el texto que no puede publicarse, de modo que el documento
   conserva su portada, su índice, sus estilos y sus 243 tablas: hace falta así porque estos
   ejemplos existen para probar el importador contra documentos de verdad, y uno escrito por
   nosotros desde una importación no prueba nada. Se conserva el texto normativo (resultados de
   aprendizaje, criterios, competencias, objetivos), que sale del real decreto del título y no es de
   nadie, y se inventa el material docente: las actividades y los materiales de las 84 fichas. Los
   nombres, sustituidos; los metadatos de autoría, los comentarios y las revisiones, fuera. El
   ejemplo **no se versiona**: se regenera en segundos en la máquina de quien tenga el original. El
   porqué y el cómo están en [`docs/entrada_ej/README.md`](../entrada_ej/README.md).

   Lo que no esté en el ejemplo sigue con el texto de muestra, así que el mockup se abre igual sin
   nada importado. Los otros seis documentos (PCCF, memoria, ESO, Bachillerato) siguen enteros de
   muestra: solo está pasada por el molino la PD de FP de DAW.
2. **Las situaciones de aprendizaje se pueden ver, cambiar y crear.** Es donde está el trabajo de
   verdad —en la PD de DAW hay 79 fichas— y en el v1 solo se veía la tabla del Word. Ahora, en el
   apartado *Situaciones de aprendizaje* de cada módulo:
   - la **tabla resumen SA × RA** sale calculada de las fichas, con las sesiones sumadas. En el Word
     hay que repasarla a mano cada vez que se mueve una situación, y es la que se queda desfasada;
   - la lista de situaciones dice de cada una sus RA, sus sesiones, su evaluación y cuántos
     criterios tiene, y avisa en rojo de la que le falte algo;
   - se abre una y sale **su ficha, con los apartados del documento** (criterios de evaluación,
     competencias para la empleabilidad, objetivos, los seis tipos de actividad y los materiales);
   - los **resultados de aprendizaje se eligen** de los del propio módulo, y sus criterios se marcan
     de una lista, en vez de copiarlos a mano: así la ficha y la tabla de RA y CE del módulo no
     pueden contradecirse;
   - debajo del formulario está **la ficha como va a salir impresa**, que se actualiza al escribir;
   - y se puede **crear una nueva, duplicar, mover y borrar**; las demás se renumeran solas.

   Una SA creada en la aplicación no tiene tabla importada, así que el motor la monta a partir de
   sus campos (`motor/ficha-sa.js`): sale impresa igual que las que vienen del Word.
3. **Se puede cambiar la estructura del documento.** En cada apartado hay una tarjeta *Estructura*
   (la ve la jefatura de departamento) para **renombrar** el título, **añadir** un subapartado,
   **moverlo** arriba o abajo y **retirarlo**. En el v1 no había forma: la estructura solo se podía
   cambiar reimportando un Word, así que el Word seguía siendo la fuente de verdad.
   - Retirar no borra: el contenido se conserva y el apartado se recupera desde la portada del
     documento.
   - En un apartado de módulo se está cambiando **la plantilla**, así que el cambio sale en los 11
     módulos a la vez. La tarjeta lo advierte.
4. **Dos vistas nuevas en la barra de arriba.** Donde el v1 ponía *Navegación · Edición ·
   Validaciones*, el v2 pone *Contenido · Cambios · Validaciones · Coordinación*.
   - **Cambios** compara el apartado con el del curso pasado, en dos columnas, con lo que se quitó
     tachado en rojo y lo nuevo en verde. Y un botón: *Validar este apartado*.
   - **Coordinación** es una tabla de módulos (o materias) × bloques, con quién lleva cada uno y
     cómo va cada parte. Se hace clic en una celda y te lleva ahí.
5. **Las validaciones salen agrupadas**, no en una lista plana. Un grupo por módulo o materia (más
   uno de apartados comunes), cada uno con cuántos errores y avisos tiene y **quién lo lleva**, y
   abierto por defecto si tiene errores. Dentro, cada aviso es un enlace al apartado que falla.
   Arriba dice si el documento *se puede aprobar*.
6. **El árbol dice si el apartado está hecho y bien**, no de dónde viene: *vacío · incompleto ·
   completo · validado · con errores*. Manda el color, como en el v1, y la forma va solo de
   respaldo para quien no lo distinga (anillo punteado, medio relleno, relleno, ✓, !). La
   procedencia —que esto venga del curso pasado— se ha ido del árbol a la cabecera del apartado y
   a la vista *Cambios*, que es donde hace falta.
7. **El progreso cuenta apartados validados**, no apartados con texto. Da un número más bajo que el
   del v1 y es el que dice cuánto trabajo queda de verdad: lo que viene del curso anterior sin que
   nadie lo haya mirado cuenta como pendiente.
8. **Cada módulo lleva su código al lado** (`0614`, `0373`…), en el árbol y en la cabecera. Los que
   no tenemos confirmados dicen *«código pendiente»* en vez de un número inventado.
9. **Se elige una persona, no un rol.** El desplegable dice «Lucía M. · Docente» y el rol va al
   lado. En el v1 el rol y los módulos asignados eran la misma cosa (*«Docente DAW y RL»*).
10. **La dirección del navegador cambia al navegar.** Se puede copiar el enlace de un apartado y
    mandárselo a alguien, usar la flecha de atrás y recargar sin perder el sitio.
11. **En el móvil o la tablet la navegación existe.** Hay un botón ☰ que saca el árbol como un cajón;
    en el v1, por debajo de 900 px, el árbol simplemente desaparecía.
12. **El árbol se maneja con el teclado**: flechas para subir, bajar, abrir y cerrar, Inicio y Fin,
    Enter para entrar.
13. **Panel derecho con comentarios.** Debajo de las comprobaciones hay un hilo por apartado para
    dejar una nota a quien lleva el módulo.
14. **Botón de Word** al lado del de PDF.
15. **La barra de herramientas del v1, con los botones conectados.** En el v1 estaban **N**, *C* y
    *Enlace* y no hacían nada, porque el generador solo guardaba texto plano. Ahora la barra está
    en el mismo sitio y los botones marcan: lo seleccionado, o la palabra donde esté el cursor si
    no hay nada seleccionado. Son un interruptor —se vuelve a pulsar y se quita la marca—, se
    combinan (negrita sobre cursiva da las dos), debajo del campo se ve el párrafo ya formateado y
    el formato llega al PDF.

    La barra dice **sobre qué párrafo va a actuar**, que es la mitad del problema: unos botones que
    no dicen a quién le pegan no se distinguen de unos botones estropeados. Y los atajos son
    <kbd>Ctrl</kbd>+<kbd>B</kbd> / <kbd>Ctrl</kbd>+<kbd>I</kbd>, o <kbd>Alt</kbd>+<kbd>N</kbd> /
    <kbd>Alt</kbd>+<kbd>C</kbd> para quien venga de Word en español. <kbd>Ctrl</kbd>+<kbd>N</kbd>
    **no se puede**: el navegador se lo queda para abrir una ventana nueva y no llega a la página.
    La barra lo avisa, para no perder el rato probándolo.

    Enlaces siguen sin haber: el generador no los pinta.
16. **Editar un texto se parece menos a Word y más a un formulario**: cada párrafo es una caja, con
    sus botones de *subir*, *bajar*, *convertir en lista* y *borrar*, y las listas tienen sangría.
    Abajo hay un desplegable, *«ver lo que se guardaría»*, que enseña el JSON que recibiría el
    generador de PDF.
17. **Repartir los módulos es una tabla, no un muro de casillas.** El panel *Asignaciones* es una
    matriz de **unidades × personas**, agrupada por SMR, DAW, ESO y Bachillerato, con filtro por
    texto, casilla de *solo las que no tiene nadie*, cuántas unidades lleva cada persona y la fila
    marcada en rojo con un chip *nadie* cuando no hay nadie. Eso último es lo único que de verdad
    hay que mirar ahí: una unidad sin nadie no la puede editar nadie salvo la jefatura de
    departamento. Con los datos de ejemplo salen 18 de 31.

    La jefatura de departamento también es columna, porque también da clase. La asignación no decide
    quién puede editar —eso ya lo resuelve el rol— sino de quién es cada unidad y a quién avisa la
    vista *Validaciones*.

Y un cambio menor, que es más una consecuencia que una mejora: **ya no hay que pasar a una pestaña
*Edición* para escribir**. Si puedes editar ese apartado, escribes directamente. A cambio se pierde
la red de no poder tocar nada sin querer; si se prefiere, se vuelve a poner un botón de *Editar* por
apartado.

### Y una cosa que se nota a peor

- **Las tablas del Word se ven pero no se editan.** La ficha del módulo, la de RA y criterios y la
  de contenidos básicos salen tal como vienen, con un aviso de *todavía sin editor*. Con editor de
  verdad están las ponderaciones (con la suma en vivo) y las situaciones de aprendizaje. Las demás
  son trabajo pendiente, no una decisión.
- **De ESO y Bachillerato sigue sin haber contenido real.** Las situaciones de aprendizaje de LOMLOE
  no van por resultados de aprendizaje sino por competencias específicas, así que no es lo mismo y
  no vale el mismo editor. Las reales están en el v1 (`SA` y `SA_CARACTERISTICAS` en
  [`../mockups/js/data.js`](../mockups/js/data.js)).

### Sin decidir

- **Quién reparte las unidades.** El botón *Asignaciones* sigue siendo **solo para soporte**, como
  el de *Permisos* del v1. Que lo maneje la jefatura de departamento sería lo natural —es quien
  reparte la carga— pero es una decisión del departamento y no del mockup, así que se queda como
  estaba hasta que se hable.
- **Si hace falta un modo de solo lectura** para no tocar un apartado sin querer (lo del párrafo de
  arriba).
- **Dónde se configuran las validaciones.** Hoy, en ningún sitio: las siete comprobaciones están
  escritas a mano en [`js/validaciones.js`](js/validaciones.js) —y en el motor, peor, dentro de
  `render-generico.js`, así que solo se ven cuando ya has generado el PDF—. Dos son normativa y se
  quedan fijas (los RA suman 100 %, y los criterios reparten el peso de su RA); las otras cinco
  son criterio del centro: *RA sin situación de aprendizaje*, *apartado vacío*, *heredado sin
  revisar*, *copia desvinculada desactualizada* y *unidad sin docente*, cada una con su severidad,
  y los errores son los que impiden aprobar el documento.

  La propuesta, para cuando se retome: una tabla de reglas con `{ activa, severidad }` por documento
  y curso, que mantenga **jefatura de estudios** —que es quien aprueba— y que el resto vea en modo
  lectura. *Apartado vacío* no iría ahí: *obligatorio* es una propiedad del apartado, así que su
  casilla va en la tarjeta *Estructura*, que es donde se decide qué apartados tiene el documento.
  Queda **para más adelante**: es una decisión de quién manda sobre qué, no una pantalla que falte.

### Un cambio discutible

El v1 enseñaba **los tres documentos en el mismo árbol** (Memoria, PCCF y PD con sus ramas). El v2
tiene un **desplegable de documento** arriba y el árbol es solo del documento elegido, porque el
árbol de una sola PD ya ronda los 250 apartados. Se ve menos de golpe y se navega más desahogado.
Si preferís lo del v1, se vuelve atrás sin tocar nada más.

## Inventario técnico

### En el motor (`motor/` y `scripts/`)

- `motor/permisos.js`: la jefatura de departamento edita **cualquier módulo**, lo tenga asignado o no.
  Antes solo los asignados, que era lo que el v1 ya hacía por su cuenta sin que las dos
  implementaciones coincidieran. Arreglado en el motor, que es donde manda.
- `scripts/test-permisos.js`: la aserción que afirmaba lo contrario, reescrita. Añadido el caso de
  un apartado de módulo sin indicar módulo.
- Efecto colateral: `puedeDesvincular` llama a `puedeEditar`, así que la jefatura de departamento
  puede también desvincular textos compartidos en cualquier módulo.
- `motor/compartidos.js`: admite párrafos con formato. `clave()` y `largo()` daban por hecho que
  `text` era una cadena, así que con tramos todos los párrafos habrían colisionado en la misma
  clave y la longitud habría contado tramos en lugar de letras. Nueva función `plano()`.
- `scripts/test-texto-rico.js` (nuevo, dentro de `npm test`): comprueba que la negrita y la cursiva
  sobreviven el camino completo —extraer compartidos, resolverlos y construir el documento de
  pdfmake— y que el texto sin formato sigue funcionando igual.
- `motor/ficha-sa.js` (nuevo): la ficha de una situación de aprendizaje en los dos sentidos.
  `fichaDeFilas()` lee la tabla importada y saca los campos con nombre —criterios, competencias,
  objetivos, los seis tipos de actividad, materiales—, y `filasDeFicha()` monta la tabla desde el
  modelo. Lo primero es lo que permite editar una ficha; lo segundo, que una SA nueva se imprima
  igual que una importada. El documento usa dos maquetaciones distintas para las actividades y las
  dos se leen.
- `motor/importar-docx.js`: la ficha de SA se importa entera, no solo su cabecera. Antes salían el
  número, el título, las sesiones, la evaluación y los RA, y el resto quedaba como una tabla de
  celdas sin nombre. Además los RA se reconocen escritos como «RA1 Reconoce…», sin punto, que es
  como están en uno de los módulos: ocho fichas se quedaban sin RA y por tanto fuera de la tabla
  resumen.
- `motor/render-generico.js`: una ficha sin tabla importada —la que se acaba de crear en la
  aplicación— se imprime montándola desde sus campos.
- `scripts/test-ficha-sa.js` (nuevo, dentro de `npm test`): las dos maquetaciones, la ida y vuelta
  modelo → tabla → modelo, una SA creada desde cero que llega al PDF y el resumen SA × RA
  calculado.
- `motor/exportar-docx.js` (nuevo): el inverso del importador. Escribe un `.docx` —el zip y su XML a
  mano, con jszip, sin dependencias nuevas— con los títulos, las listas anidadas y las tablas con
  celdas combinadas que el importador vuelve a leer. Es lo que permite generar el documento de
  ejemplo en lugar de editar el original, y de paso es el primer paso del *exportar a Word* que
  estaba pendiente. Su prueba de fondo reescribe el documento real entero y lo reimporta con las
  mismas secciones, las mismas 11 instancias y el mismo número de tablas por módulo.
- `motor/sanear.js` (nuevo): quita lo que identifica (personas, centro, localidad, correos, teléfonos,
  CIF, empresas) e inventa el material docente con un generador determinista y vocabulario propio de
  cada módulo. En las fichas limpia **por exclusión**: conserva lo que su etiqueta delata como
  normativo y reescribe todo lo demás, porque una lista de campos conocidos deja pasar en silencio la
  ficha de un módulo que use otras etiquetas, y lo que pasa en silencio se publica. Antes de devolver
  nada repasa el resultado y, si encuentra algo, no devuelve datos.
- `scripts/generar-ejemplo.js` (nuevo, `npm run ejemplo`): encadena importar, sanear y exportar, y
  comprueba el resultado **sobre el `.docx` ya escrito y vuelto a importar**, no sobre los datos en
  memoria. Si algo falla, borra el `.docx`.
- El motor pasa de 13 pruebas a **72**, en seis guiones.

### En el mockup

Arquitectura, que es lo que había que arreglar antes de construir la app encima:

1. **Unidades con id interno estable** (`js/unidades.js`) en lugar de identificarlas por su título.
   Los títulos cambian de curso a curso —tres veces entre 2025-26 y 2026-27— y con el título como
   clave se perdían las asignaciones de los módulos renombrados.
2. **Código del título como dato aparte**, no como identificador. Sin confirmar: los de DAW y SMR
   están puestos de memoria y los módulos nuevos de la LOFP van con `codigo: null`, que la interfaz
   pinta como «código pendiente».
3. **Nodos identificados por slug** (`modulos/situaciones-de-aprendizaje`) y no por posición
   (`pd/9/2/0`), igual que los ids que ya produce el importador en `plantilla.json`.
4. **Un solo id de sección para las 11 unidades**, con la unidad aparte: es el par
   `(seccion, instancia)` del motor, y lo que permite que un texto compartido se defina una vez.
5. **Rol y asignaciones separados**: `usuario = { rol, unidades, apartados }`. El v1 los mezclaba en
   un único selector.
6. **El contenido es un modelo de bloques**, no HTML. El texto se escribe en `<textarea>`, que solo
   puede devolver texto plano; el v1 usaba `contenteditable`, que es lo que advierte §2.3 de la
   especificación.
7. **Negrita y cursiva, de punta a punta.** El párrafo puede llevar su texto como una lista de
   tramos `{ text, bold, italics }`, que es lo que pdfmake acepta en cualquier nodo de texto; un
   párrafo sin formato se sigue guardando como una cadena. Como el campo es un `<textarea>` y no un
   editor enriquecido, la marca se escribe con `**negrita**` y `*cursiva*`, y de poner y quitar esas
   marcas se encarga `Bloques.marcar(texto, desde, hasta, tipo)`, que es una función pura —entran
   texto y selección, salen texto y selección— y por eso se puede probar sin navegador.

   Dos detalles que decidían si el botón funcionaba o no: el `mousedown` del botón se frena, porque
   si el campo pierde el foco se va la selección y el botón parece estropeado; y al acabar se
   devuelve la selección a su sitio, para poder pulsar **N** y *C* seguidos. Enlaces no, todavía:
   el renderer no los pinta.
8. **Estado en la URL** con el formato de §3.1 (`/doc/[id]/[idSeccion]`), sobre el hash. Hay enlaces
   profundos, atrás/adelante y recarga. Desviación: la unidad va en `?u=<id>` y no en `?m=<índice>`,
   porque el índice es el identificador frágil que veníamos a arreglar.
9. **Cajón lateral en pantallas estrechas**. El v1 hacía `.sidebar { display: none }` por debajo de
   900 px y dejaba la navegación inalcanzable.
10. **Árbol accesible**: `role="tree"`, flechas, Inicio/Fin, Enter, foco gobernado y `aria-label` con
    el estado. El estado se distingue por **forma** además de por color.
11. **Validaciones navegables** (`js/validaciones.js`, módulo aparte y sin DOM): cada aviso lleva
    `destino` y se va al apartado con un clic. Los errores impiden aprobar; los avisos, no.
12. **Sin modo «navegación / edición»**: si puedes editar, los campos se editan.

Funcionalidad nueva:

13. **Estructura editable** (`js/plantilla.js`): renombrar, añadir, reordenar y retirar apartados,
    como una capa sobre la plantilla importada y sin tocarla. El id de un apartado **se genera una
    vez, al crearlo, y no vuelve a cambiar**: no es el slug de su título. Si lo fuera, renombrar
    cambiaría el id y dejaría huérfanos el contenido, los comentarios y los enlaces guardados —el
    mismo cuidado que con los módulos, un nivel más arriba—. La interfaz enseña el id a la vista,
    para que se note que el título es solo la etiqueta.
14. **Arrastre entre cursos**: cada apartado lleva de dónde viene (`heredado`, `revisado`,
    `modificado`, `nuevo`), vista de diff palabra por palabra contra el curso anterior y botón para
    validarlo. El **progreso mide validación, no relleno**.
15. **Estado del árbol por completitud** (vacío · incompleto · completo · validado · con
    errores) en lugar de por procedencia, con el color como canal principal.
16. **Panel de coordinación**: matriz unidad × bloque con quién lleva cada módulo o materia.
17. **Validaciones agrupadas** por módulo o materia, con el recuento y el responsable de cada grupo.
18. **Asignación de unidades al profesorado**: es el aviso nº 2 de la especificación — sin ella
    `instancias[].docentes` llega vacío y nadie puede editar un módulo. Es una matriz de
    unidades × personas con filtros, porque la pregunta que se le hace no es «qué lleva Pau» sino
    «qué unidad no tiene a nadie». El cambio de una casilla se calcula **sobre el modelo**, no
    sobre las casillas marcadas de la tabla, que con un filtro puesto borraría lo que el filtro
    esconde. Visible solo para soporte, mientras no se decida quién debe manejarla.
19. **Contenido real del documento** (`js/importado.js`, generado por
    `herramientas/extraer-contenido.js`), anonimizado y recortado a una muestra. El extractor casa
    las claves del importador con las del mockup, que se recortan a longitudes distintas: cinco de
    las 51 claves de la PD de DAW no coincidían por unas letras, y el contenido se habría quedado
    fuera en silencio. Hay una prueba que lo vigila.
20. **Situaciones de aprendizaje** (`js/sa.js`): modelo editable de cada ficha, creación, duplicado,
    reordenación y borrado, resumen SA × RA calculado y comprobaciones por ficha (sin RA es error;
    sin sesiones o sin criterios, aviso). `filas()` es un puerto de `motor/ficha-sa.js` y
    test.js compara los dos **celda a celda en las 25 fichas importadas**, en los dos sentidos.
21. **Comentarios por apartado.**
22. **Exportar a Word** además de PDF (el botón explica qué falta por decidir).
23. **50 pruebas** en `node docs/mockup-v2/test.js`, sin dependencias. Dos comparan el navegador con
    el servidor: una recorre el motor de permisos nodo a nodo y persona a persona en los siete
    documentos —con apartados añadidos a mano incluidos— para que no vuelvan a separarse, y la
    otra pulsa el botón **N** con un DOM de pega de veinte líneas y comprueba que el modelo se
    queda con el tramo en negrita. Esa segunda mira el cable entre el botón y el campo, que es por
    donde se rompe esto: la lógica de marcar puede estar perfecta y el botón no hacer nada. Con el
    mismo DOM de pega se comprueba que asignar una unidad con el filtro puesto no borra las que el
    filtro esconde. Y otras dos comparan el navegador con el motor en las fichas de situación de
    aprendizaje y vigilan que el contenido importado caiga en el apartado que le toca.

### En el repositorio

- `.gitignore`: añadidos `.DS_Store` y `Thumbs.db`.
- Borrados los 6 `.DS_Store` que estaban versionados y el `package-lock.json` huérfano de la raíz
  (sin `package.json` al lado).
- `docs/interfaz-web.md`: fuera la línea `opencode -s ses_…` pegada por error al principio.
- `README.md` raíz: la tabla de estado ahora lista también `docs/interfaz-web.md`, `docs/mockups/` y
  `docs/mockup-v2/`.

### Contenido del documento en el repositorio

En el repositorio **no hay ningún Word**: ni los originales, ni los ejemplos saneados que salen de
ellos, ni nada de lo que produce el importador (`.gitignore`: `*.docx`, `*.doc`, `*.odt`, `*.pdf`,
`out/`). Los ejemplos se regeneran con un comando en la máquina de quien tenga los
originales, así que no hay motivo para meter cinco megas de binarios en el historial ni para
publicar los documentos del departamento, aunque estén saneados.

Lo único versionado es `docs/mockup-v2/js/importado.js` (algo más de 1 MB): el contenido del ejemplo en
el formato que carga el mockup, que es lo que ve quien abre la página sin tener nada más. Para traer
más o menos contenido se cambian las dos constantes del principio del extractor y se vuelve a
ejecutar.

## Lo que no se cambió a propósito

- El **v1 entero**, que es la referencia de la forma de la interfaz.
- El **nombre del centro**, que no aparece en ninguno de los dos mockups.
- Las **situaciones de aprendizaje reales** de ESO y Bachillerato (`SA` y `SA_CARACTERISTICAS` en
  [`../mockups/js/data.js`](../mockups/js/data.js)): son contenido, y en la app real salen del
  importador.

## Sin verificar

El **aspecto**. Las pruebas cubren la lógica y un humo con un DOM de pega cubre 171 repintados
(documento × curso × vista × persona, más el editor de estructura y el panel de asignaciones) sin
que nada lance, pero la maquetación, los colores y el teclado del árbol no se han mirado en un
navegador de verdad. Sin mirar en concreto: la barra de herramientas, la vista previa del párrafo
formateado, la tarjeta de estructura, los grupos de avisos, la matriz de asignaciones, las tablas
del documento y el panel de situaciones de aprendizaje con su ficha.
