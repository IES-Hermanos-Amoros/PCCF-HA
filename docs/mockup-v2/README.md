# Mockup v2 de la interfaz

Segunda versión del prototipo de la aplicación descrita en [`../interfaz-web.md`](../interfaz-web.md).
Parte del [mockup de Miguel Ángel](../mockups/) —que es el que fija la forma de la interfaz: barra
superior, árbol lateral, contenido y panel de comprobaciones— y le añade la funcionalidad que
teníamos prevista y las correcciones de arquitectura que hacían falta para poder construir la app
encima.

El v1 **se conserva tal cual** en [`../mockups/`](../mockups/) para poder comparar.

## Cómo abrirlo

Doble clic en `index.html` (portada de departamentos) o en `app.html` (el editor). Sigue sin
dependencias, sin servidor y sin `npm install`: los módulos se cargan como `<script>` clásicos.

Las pruebas de la lógica sí se ejecutan con node:

```
node docs/mockup-v2/test.js
```

Son 40, y la que más vale es la última de permisos: compara el motor de permisos del navegador con
`poc-pdfmake/lib/permisos.js` **nodo a nodo y usuario a usuario** en los siete documentos, con
apartados añadidos a mano incluidos. En el v1 las dos implementaciones se habían separado sin que
nadie se enterara.

## Qué cambia respecto al v1

Aquí está el *por qué* de cada cambio, con el problema que resolvía. Si lo que quieres es **qué se
nota al abrirlo** —para enseñarlo en el departamento— eso está en [`CAMBIOS.md`](CAMBIOS.md), que
además lleva el inventario de los ficheros tocados fuera de esta carpeta.

| Problema del v1 | Qué hace el v2 |
|---|---|
| La unidad se identificaba **por su título**, y los títulos cambian cada curso (ya pasa tres veces entre 2025-26 y 2026-27). Cada septiembre se perdían las asignaciones de los módulos renombrados | Catálogo de unidades con **id interno estable** + código del título, en [`js/unidades.js`](js/unidades.js). El título es solo la etiqueta, y `titulos` guarda la variante de cada curso |
| Los nodos se identificaban **por posición** (`pd/9/2/0`): insertar un apartado rompía cualquier enlace | Los nodos se identifican por **slug**, igual que los ids que ya produce el importador en `plantilla.json` |
| Los apartados de un módulo se **duplicaban** por módulo | Una sola sección compartida por las 11 unidades, con la unidad aparte: es el par `(seccion, instancia)` del motor |
| El selector mezclaba **rol y asignaciones** ("Docente DAW y RL" era las dos cosas a la vez) | `usuario = { rol, unidades, apartados }`. El rol sale de un desplegable y las unidades se reparten en el panel de **Asignaciones** |
| El jefe de departamento podía editar todos los módulos en el mockup, pero `permisos.js` se lo negaba | Arreglado **en el motor**, que es donde manda: `poc-pdfmake/lib/permisos.js` y su test. El navegador es un puerto comprobado contra él |
| El editor era `contenteditable` sobre HTML, justo lo que advierte §2.3 de la especificación | El estado es el **array de bloques** que espera el renderer, y el texto se escribe en `<textarea>`, que solo puede devolver texto plano. Hay un panel *"ver lo que se guardaría"* para comprobarlo |
| Barra con negrita, cursiva y enlaces que **no hacían nada**: el modelo guardaba una cadena plana | La misma barra, con los botones conectados y llegando al PDF: `text` puede ser una lista de tramos `{ text, bold, italics }`, que es lo que pdfmake acepta. **N** / *C* marcan lo seleccionado o la palabra del cursor, funcionan como interruptor, se combinan, y la barra dice sobre qué párrafo actúa. Atajos `Ctrl+B` / `Ctrl+I` y `Alt+N` / `Alt+C`; `Ctrl+N` no, que es del navegador. Enlaces siguen sin estar: el renderer no los pinta |
| El panel de permisos era una casilla por persona y por módulo, en columna: con 31 unidades, un muro de casillas | **Matriz de unidades × personas**, agrupada por ciclo y ámbito, con filtro por texto, filtro de *solo las que no tiene nadie*, el recuento por persona y la fila marcada en rojo cuando no hay nadie, que es lo único que de verdad hay que mirar ahí |
| Todo el estado en memoria: sin enlaces, sin atrás/adelante, sin recargar | Estado en la URL con el formato de la especificación (ver abajo) |
| El punto del árbol decía de dónde venía el apartado (heredado, modificado…), que no es lo que se quiere saber mirando el árbol | El árbol dice si está **hecho y bien**: vacío · incompleto · completo · validado · con errores. Manda el color, como en el v1; la forma va de respaldo. La procedencia se ha ido a la cabecera y a la vista *Cambios* |
| Los avisos del documento, en una lista plana que no decía a quién había que avisar | Agrupados por módulo o materia, con el recuento y el responsable de cada grupo |
| La estructura del documento solo se podía cambiar reimportando un Word | Tarjeta *Estructura* en cada apartado: renombrar, añadir, mover y retirar, sin tocar la plantilla importada |
| Por debajo de 900 px `.sidebar { display: none }` dejaba la navegación inalcanzable | Cajón lateral con su botón, su velo y Escape para cerrar |
| Árbol sin `role`, sin teclado, y estado codificado **solo por color** | `role="tree"` con flechas, Inicio/Fin, Enter, foco gobernado y `aria-label` que incluye el estado. El color sigue siendo el canal principal, con la forma como respaldo |
| Los avisos de validación eran texto plano: había que buscar a mano el apartado que fallaba | Cada aviso lleva `destino` y se navega con un clic. Los errores **impiden aprobar**; los avisos, no |

## Lo que añade

Esto no estaba en el v1 y es donde está el trabajo real del departamento:

- **Estructura editable** (`js/plantilla.js`). Renombrar un apartado, añadir uno, moverlo o
  retirarlo, como una capa sobre la plantilla importada. Es lo que convierte la herramienta en el
  sitio donde vive la programación en lugar de un visor de lo que diga un Word: si la inspección
  pide un apartado nuevo, ya no hay que volver al Word.

  Que se pueda renombrar obliga a una cosa: el id de un apartado **se genera una vez, al crearlo, y
  no vuelve a cambiar**. No es el slug de su título, porque entonces renombrar cambiaría el id y
  dejaría huérfanos el contenido, los comentarios y los enlaces guardados —el mismo cuidado que con
  los módulos, un nivel más arriba—. La interfaz enseña el id a la vista para que se note que el
  título es solo la etiqueta.
- **Arrastre entre cursos.** Cada apartado lleva de dónde viene: `heredado` del curso anterior,
  `revisado`, `modificado` o `nuevo`. La vista **Cambios** compara con el curso pasado palabra por
  palabra y hay un botón para dar el apartado por bueno. El **progreso mide revisión, no relleno**:
  lo heredado cuenta como pendiente hasta que alguien lo mira. En septiembre nadie escribe una
  programación desde cero; revisa la del año pasado.
- **Panel de coordinación.** Matriz unidad × bloque con quién lleva cada módulo o materia y cómo va
  cada parte. Es la pantalla que mira la jefatura de departamento para saber qué falta.
- **Asignación de unidades al profesorado.** Es el aviso nº 2 de la especificación: con el importador
  tal como está, `instancias[].docentes` llega vacío y *nadie* puede editar un módulo. Por eso esta
  pantalla va antes que los editores en el plan. Es una matriz de unidades × personas, con filtros,
  porque la pregunta que se le hace no es «qué lleva Pau» sino «qué módulo no tiene a nadie».
  **Visible solo para soporte**, como el panel de permisos del v1: quién debe manejarla está sin
  decidir (ver [`CAMBIOS.md`](CAMBIOS.md)).
- **Comentarios por apartado**, para pedir una aclaración sin salir de la herramienta.
- **Exportar a Word** además de PDF (el botón explica qué falta: el README raíz lo promete y la PoC
  solo hace PDF).

## Cómo se navega

El estado vive en la URL, con el formato que fija §3.1 de la especificación
(`/doc/[id]/[idSeccion]`), sobre el hash porque el mockup se abre con doble clic:

```
app.html#/doc/pd-fp-daw/modulos/situaciones-de-aprendizaje?u=daw-0614&v=cambios
                └ documento └ sección                      └ unidad   └ vista
```

Parámetros: `u` unidad, `v` vista (`contenido`, `cambios`, `validaciones`, `coordinacion`),
`c` curso, `p` persona con la que se prueba.

**Única desviación de la especificación:** la unidad va en `?u=<id>` y no en `?m=<índice>`. El índice
es precisamente el identificador frágil que veníamos a arreglar: si alguien reordena los módulos,
`?m=3` apunta a otro sitio. Con el id, el enlace vale para siempre y para los dos cursos.

## Qué es real y qué es de muestra

**Real** (extraído de los `.docx` de `../entrada_ej/` por Miguel Ángel en el v1, y reutilizado aquí):
la estructura de los siete documentos, los títulos de apartados, módulos y materias, y el reparto de
qué edita quién.

**De muestra** (inventado, generado de forma determinista con un hash para que cada apartado se vea
siempre igual): los párrafos, las listas, las ponderaciones de RA y CE, los estados de arrastre y las
personas. **Las personas del desplegable no son el profesorado real del departamento.**

Lo que el v2 **no se ha traído** del v1: las situaciones de aprendizaje reales de ESO y Bachillerato
(`SA` y `SA_CARACTERISTICAS` en [`../mockups/js/data.js`](../mockups/js/data.js)). Son contenido, y en
la app real salen del importador; mientras tanto se quedan donde están.

## Avisos

- **Los códigos de módulo hay que confirmarlos.** Los de DAW (RD 686/2010) y SMR (RD 1691/2007) están
  puestos de memoria en [`js/unidades.js`](js/unidades.js) y no se han verificado contra la normativa.
  Los módulos nuevos de la LOFP (sostenibilidad, digitalización, introducción a la programación) van
  con `codigo: null` a propósito: la interfaz los pinta como *"código pendiente"* en lugar de
  inventárselo. El id interno no depende del código, así que confirmarlos luego no rompe nada.
- El nombre del centro no aparece, como en el v1.

## Lo que falta

- Editores estructurados de la tabla RA ↔ CE y de las fichas de situaciones de aprendizaje: por ahora
  solo las ponderaciones tienen editor de verdad, con la suma en vivo.
- **Enlaces** en el texto: harían falta en `render-generico.js` (pdfmake los soporta con `link`), en
  el editor y en el importador. Negrita y cursiva ya están.
- El **importador aplana el formato**: un .docx con negritas se importa como texto plano, así que
  reimportar pierde lo que se haya marcado desde la web. El modelo y el generador ya lo admiten;
  falta que `lib/importar-docx.js` lo conserve.
- *Editar para todas las unidades* en un texto compartido solo avisa de lo que haría; no abre editor.
- Estados del documento (`borrador → revisión → aprobado`) y marca de agua. Está la puerta de
  validación, que es la mitad del asunto.
- **Versionado de la plantilla y migración de datos.** Los cambios de estructura se guardan como una
  capa en el navegador; en la app real cada cambio sería una versión nueva de `plantilla` con su
  migración, y habría que decidir qué pasa con los documentos de cursos ya aprobados.
- **Numeración automática** de los apartados añadidos: ahora salen sin número, y los importados
  conservan el que traían del Word.
- Carga por ramas: con siete documentos el árbol entero cabe de sobra, pero la app no puede mandar
  los 2 MB de `datos.json` al navegador.

## Ficheros

```
mockup-v2/
  CAMBIOS.md          qué se nota al abrirlo, e inventario de lo tocado
  index.html          portada de departamentos
  app.html            el editor
  css/estilos.css     mismos tokens que el v1, más diff, matriz, cajón y modal
  js/util.js          cuatro ayudas compartidas
  js/unidades.js      catálogo de unidades: id estable + código + títulos por curso
  js/plantilla.js     cambios de estructura: renombrar, añadir, reordenar, retirar
  js/estructura.js    árboles de los documentos, slugs y constructor del árbol
  js/permisos.js      puerto comprobado de poc-pdfmake/lib/permisos.js
  js/contenido.js     bloques, arrastre entre cursos, compartidos, personas, comentarios
  js/validaciones.js  comprobaciones con destino navegable (lo que pide §3.4)
  js/bloques.js       modelo de bloques y sus operaciones
  js/ui.js            árbol accesible, rutas, vistas y paneles
  test.js             40 pruebas, sin dependencias
```

Solo `js/ui.js` toca el DOM. El resto se puede exigir desde node, que es lo que hace `test.js` y lo
que permitirá reutilizar `permisos.js` y `validaciones.js` en el servidor de la app real.
