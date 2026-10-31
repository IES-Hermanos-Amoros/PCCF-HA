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

1. **Se puede cambiar la estructura del documento.** En cada apartado hay una tarjeta *Estructura*
   (la ve la jefatura de departamento) para **renombrar** el título, **añadir** un subapartado,
   **moverlo** arriba o abajo y **retirarlo**. En el v1 no había forma: la estructura solo se podía
   cambiar reimportando un Word, así que el Word seguía siendo la fuente de verdad.
   - Retirar no borra: el contenido se conserva y el apartado se recupera desde la portada del
     documento.
   - En un apartado de módulo se está cambiando **la plantilla**, así que el cambio sale en los 11
     módulos a la vez. La tarjeta lo advierte.
2. **Dos vistas nuevas en la barra de arriba.** Donde el v1 ponía *Navegación · Edición ·
   Validaciones*, el v2 pone *Contenido · Cambios · Validaciones · Coordinación*.
   - **Cambios** compara el apartado con el del curso pasado, en dos columnas, con lo que se quitó
     tachado en rojo y lo nuevo en verde. Y un botón: *Validar este apartado*.
   - **Coordinación** es una tabla de módulos (o materias) × bloques, con quién lleva cada uno y
     cómo va cada parte. Se hace clic en una celda y te lleva ahí.
3. **Las validaciones salen agrupadas**, no en una lista plana. Un grupo por módulo o materia (más
   uno de apartados comunes), cada uno con cuántos errores y avisos tiene y **quién lo lleva**, y
   abierto por defecto si tiene errores. Dentro, cada aviso es un enlace al apartado que falla.
   Arriba dice si el documento *se puede aprobar*.
4. **El árbol dice si el apartado está hecho y bien**, no de dónde viene: *vacío · incompleto ·
   completo · validado · con errores*. Manda el color, como en el v1, y la forma va solo de
   respaldo para quien no lo distinga (anillo punteado, medio relleno, relleno, ✓, !). La
   procedencia —que esto venga del curso pasado— se ha ido del árbol a la cabecera del apartado y
   a la vista *Cambios*, que es donde hace falta.
5. **El progreso cuenta apartados validados**, no apartados con texto. Da un número más bajo que el
   del v1 y es el que dice cuánto trabajo queda de verdad: lo que viene del curso anterior sin que
   nadie lo haya mirado cuenta como pendiente.
6. **Cada módulo lleva su código al lado** (`0614`, `0373`…), en el árbol y en la cabecera. Los que
   no tenemos confirmados dicen *«código pendiente»* en vez de un número inventado.
7. **Se elige una persona, no un rol.** El desplegable dice «Lucía M. · Docente» y el rol va al
   lado. En el v1 el rol y los módulos asignados eran la misma cosa (*«Docente DAW y RL»*).
8. **La dirección del navegador cambia al navegar.** Se puede copiar el enlace de un apartado y
   mandárselo a alguien, usar la flecha de atrás y recargar sin perder el sitio.
9. **En el móvil o la tablet la navegación existe.** Hay un botón ☰ que saca el árbol como un cajón;
   en el v1, por debajo de 900 px, el árbol simplemente desaparecía.
10. **El árbol se maneja con el teclado**: flechas para subir, bajar, abrir y cerrar, Inicio y Fin,
    Enter para entrar.
11. **Panel derecho con comentarios.** Debajo de las comprobaciones hay un hilo por apartado para
    dejar una nota a quien lleva el módulo.
12. **Botón de Word** al lado del de PDF.
13. **La barra de herramientas del v1, con los botones conectados.** En el v1 estaban **N**, *C* y
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
14. **Editar un texto se parece menos a Word y más a un formulario**: cada párrafo es una caja, con
    sus botones de *subir*, *bajar*, *convertir en lista* y *borrar*, y las listas tienen sangría.
    Abajo hay un desplegable, *«ver lo que se guardaría»*, que enseña el JSON que recibiría el
    generador de PDF.
15. **Repartir los módulos es una tabla, no un muro de casillas.** El panel *Asignaciones* es una
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

- **Varios apartados muestran menos contenido que en el v1.** Allí había tablas de RA y criterios,
  fichas de situaciones de aprendizaje y las SA reales de ESO y Bachillerato; aquí, por ahora, solo
  las ponderaciones tienen editor de verdad (con la suma en vivo) y el resto es texto. Es trabajo
  pendiente, no una decisión.

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

### En el motor (`poc-pdfmake/`)

- `lib/permisos.js`: la jefatura de departamento edita **cualquier módulo**, lo tenga asignado o no.
  Antes solo los asignados, que era lo que el v1 ya hacía por su cuenta sin que las dos
  implementaciones coincidieran. Arreglado en el motor, que es donde manda.
- `scripts/test-permisos.js`: la aserción que afirmaba lo contrario, reescrita. Añadido el caso de
  un apartado de módulo sin indicar módulo.
- Efecto colateral: `puedeDesvincular` llama a `puedeEditar`, así que la jefatura de departamento
  puede también desvincular textos compartidos en cualquier módulo.
- `lib/compartidos.js`: admite párrafos con formato. `clave()` y `largo()` daban por hecho que
  `text` era una cadena, así que con tramos todos los párrafos habrían colisionado en la misma
  clave y la longitud habría contado tramos en lugar de letras. Nueva función `plano()`.
- `scripts/test-texto-rico.js` (nuevo, dentro de `npm test`): comprueba que la negrita y la cursiva
  sobreviven el camino completo —extraer compartidos, resolverlos y construir el documento de
  pdfmake— y que el texto sin formato sigue funcionando igual. El motor pasa de 13 pruebas a 18.

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
19. **Comentarios por apartado.**
20. **Exportar a Word** además de PDF (el botón explica qué falta por decidir).
21. **40 pruebas** en `node docs/mockup-v2/test.js`, sin dependencias. Dos comparan el navegador con
    el servidor: una recorre el motor de permisos nodo a nodo y persona a persona en los siete
    documentos —con apartados añadidos a mano incluidos— para que no vuelvan a separarse, y la
    otra pulsa el botón **N** con un DOM de pega de veinte líneas y comprueba que el modelo se
    queda con el tramo en negrita. Esa segunda mira el cable entre el botón y el campo, que es por
    donde se rompe esto: la lógica de marcar puede estar perfecta y el botón no hacer nada. Con el
    mismo DOM de pega se comprueba que asignar una unidad con el filtro puesto no borra las que el
    filtro esconde.

### En el repositorio

- `.gitignore`: añadidos `.DS_Store` y `Thumbs.db`.
- Borrados los 6 `.DS_Store` que estaban versionados y el `package-lock.json` huérfano de la raíz
  (sin `package.json` al lado).
- `docs/interfaz-web.md`: fuera la línea `opencode -s ses_…` pegada por error al principio.
- `README.md` raíz: la tabla de estado ahora lista también `docs/interfaz-web.md`, `docs/mockups/` y
  `docs/mockup-v2/`.

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
formateado, la tarjeta de estructura, los grupos de avisos y la matriz de asignaciones.
