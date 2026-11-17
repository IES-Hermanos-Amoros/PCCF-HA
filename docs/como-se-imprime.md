# Cómo se imprime un documento

Hasta qué nivel llega el índice y qué apartados empiezan en página nueva, en el PDF y en el Word.

Dónde está cada cosa:

| Qué | Dónde |
|---|---|
| La regla: qué nivel entra, qué apartado rompe página | `core/impresion.js` |
| Quién lo configura | `core/permisos.js` → `puedeConfigurarImpresion` |
| La ruta que lo guarda | `app/_lib/rutas/impresion.js` |
| La lectura que comparten las tres rutas | `app/_lib/rutas/comun.js` → `impresionDe` |
| El PDF | `motor/render-generico.js` |
| El Word | `motor/exportar-docx.js` |
| La pantalla | `app/_componentes/Impresion.js` |
| Las pruebas | `test/impresion.js`, `test/pdf-impresion.js`, `test/docx-impresion.js`, `test/impresion-ruta.js`, `e2e/imprimir-y-anadir.spec.js` |

## 1. De dónde sale

De tres cosas que el departamento se encontró al imprimir, y las tres eran ciertas:

1. **El Word salía sin índice.** El PDF llevaba uno y el Word ninguno, y el Word es el que se manda por
   correo y el que se sigue editando.
2. **El índice del PDF no llegaba a los apartados.** Llegaba al segundo nivel y punto.
3. **No se podía pedir que cada apartado empezara en página nueva**, que es como se imprime una
   programación cuando se encuaderna.

La segunda es la que no se ve a primera vista, así que conviene decirla con números. Medido sobre
`PD_DAW_26-27_161026.docx`, 11 módulos:

| Nivel de numeración | Encabezados | Líneas de índice si llega hasta ahí |
|---|---|---|
| 1 | 14 | 14 |
| 2 | 38 | 52 |
| 3 | 89 | 141 |
| 4 | 123 | 264 |

El índice tenía 48 líneas. **Dentro de un módulo no entraba nada**, ni los apartados principales: un
módulo es la instancia de una sección, así que sus apartados de primer nivel salen numerados `5.1.1`,
es decir **nivel 3**, y el índice se cortaba en el 2. Un índice de una programación de ciento y pico
páginas que no nombra ningún apartado de ningún módulo no sirve para buscar nada.

## 2. El nivel es el de la numeración que se ve

«Nivel 3» es un apartado numerado con tres cifras, `5.1.3`, y se cuenta así porque es lo que el lector
tiene delante: el número está impreso al lado del título. **No** es la profundidad en el árbol de la
plantilla ni el estilo con el que se pinta, que se queda en tres (`h3`) por mucho que el apartado esté
más abajo.

Esto es lo que hace que la configuración se pueda explicar en una línea y que las dos salidas digan lo
mismo: el PDF y el Word preguntan a `core/impresion.js` **con el mismo número impreso**.

## 3. Dos números, y no una lista de casillas

`indice` y `saltos`, los dos un nivel de 0 a 6. No hay una casilla por apartado, y no la hay a
propósito: una programación tiene 245 apartados y nadie va a marcar 245 casillas ni a mantenerlas
cuando la estructura cambie. Además es lo que los dos formatos saben hacer: **el índice de Word se
construye por nivel de esquema**, no apartado por apartado.

El `0` es una elección y no un hueco: `indice: 0` es un documento sin índice —una memoria de ocho
páginas no lo necesita— y `saltos: 0` es «ningún salto además de los que el documento ya hacía».

## 4. Lo de serie es lo de siempre

`indice: 2` y `saltos: 0`, que es **exactamente** lo que el PDF hacía antes de que esto existiera. Un
documento al que nadie le ha tocado la configuración sale como salía, y eso es lo que mantiene en pie
el criterio de aceptación del E1 (el PDF de la base de datos idéntico al del importador). Lo vigila
`test/pdf-impresion.js`, que compara la definición con y sin el parámetro.

**El Word sí cambia**, porque no tenía índice ninguno: con lo de serie sale con el índice hasta el
segundo nivel, el mismo que el PDF.

Lo que se guarda es **solo lo que se aparta de lo de serie**, así que un documento que vuelve a lo de
siempre se queda sin el campo, como uno recién importado. Y se arrastra al curso siguiente
(`app/_lib/rutas/arrastre.js`): cómo se imprime la programación del departamento tampoco se vuelve a
decidir cada septiembre.

## 5. No se rompe página debajo de un título que se queda solo

Es la parte de la regla que un nivel a secas no puede dar, porque depende de lo que haya salido antes.
Sin ella salen dos páginas tontas, y ninguna de las dos se ve hasta que alguien imprime:

- **Una página en blanco al principio.** El primer apartado del cuerpo ya empieza en página nueva,
  porque el índice acaba de romper. Si además rompiera por configuración, entre el índice y el primer
  apartado quedaría una página vacía.
- **El nombre del módulo solo en su página.** Cada módulo rompe página de siempre. Si justo debajo su
  primer apartado rompiera también, en esa página quedaría el nombre del módulo y nada más.

La regla es: **un apartado no se separa del primer subapartado que venga pegado a él**, y padre e hijo
se reconocen por el número (`2` es padre de `2.1`; `5.1` no es padre de `5.10`). Lo que **sí** rompe es
un apartado vacío seguido de otro que no es suyo: para eso se ha pedido que cada apartado empiece en
página nueva. Vive en `rompePaginas` de `core/impresion.js` y la usan los dos motores, que le van
contando lo que emiten.

## 6. Quién lo configura, y la excepción que hay que justificar

La jefatura del departamento, **la jefatura de estudios** y el soporte.

De la jefatura de estudios está escrito en `core/permisos.js` que **no edita nada, que es quien
aprueba**. Esta es la única cosa que cambia, y la excepción está decidida por el departamento con una
razón: esto no es contenido del documento, es cómo sale en el papel. No mueve el listón de lo que se
puede aprobar, no cambia ni un apartado y no escribe nada de nadie. Quien firma el documento impreso
tiene que poder decidir cómo se imprime.

Es una función aparte de `puedeConfigurarComprobaciones` aunque las dos sean «configurar»: esas sí
mueven el listón, y por eso las decide solo quien aprueba.

Un docente **la ve y no la cambia**: saber cómo va a salir impreso el documento es parte de leerlo. La
pantalla no le enseña controles apagados, porque la decisión no es suya.

## 7. Sin registro de cambios, a diferencia de las comprobaciones

Las comprobaciones llevan dentro quién las cambió y cuándo. Esto no, y no es un olvido: aquel registro
existe porque cambiar una comprobación mueve el listón de lo que se puede aprobar, y una aprobación que
haya que justificar necesita saber con qué regla se midió. Cómo se imprime no cambia lo que el
documento dice: el peor caso de un cambio es un índice más corto de lo que alguien esperaba, y se
arregla volviéndolo a cambiar.

## 8. El índice del Word es un campo, y va antes del primer título

Un índice de Word no es texto: es un **campo `TOC`** que Word rellena al abrir el documento, con los
números de página que solo él conoce. Por eso el documento lleva además `word/settings.xml` con
`<w:updateFields w:val="true"/>`: sin él se vería el texto de aviso del campo hasta que alguien pulse
F9.

**Va después de la portada y antes del primer título**, porque el importador ignora a propósito todos
los bloques anteriores al primer título («portada o índice; se ignoran»), así que puesto ahí el índice
no entra como contenido al reimportar. Por lo mismo el rótulo «Índice» **no lleva estilo de título**:
con `Heading1` sería el primer título del documento y el importador lo leería como un apartado con el
aviso dentro. Lleva un estilo propio, `TOCHeading`, sin nivel de esquema. Esto se encontró probándolo:
con `Heading1` la prueba del importador falla.

## 9. Dos diferencias entre el PDF y el Word que se quedan

Están medidas y decididas, no son descuidos:

1. **El índice de Word lista los elementos repetidos** («Situación de aprendizaje 1: …») y el del PDF
   no. Word construye el índice por nivel de esquema, y esos títulos no llevan número impreso pero sí
   nivel de esquema. Bajárselo para igualarlos cambiaría cómo el importador deduce la estructura
   (`reglasDeNivelDeEsquema`), y eso es peor que la diferencia.
2. **En el PDF cada módulo empieza en página nueva siempre**; en el Word, cuando la configuración llega
   a su nivel (`saltos` 2 o más). El Word es el documento que se sigue editando, y meterle saltos que
   nadie ha pedido estorba a quien escribe. Igualarlos es un salto fijo en `titularSegun`
   (`motor/exportar-docx.js`), una línea.

## 10. Forzarlo para una exportación suelta

`/pdf` y `/docx` aceptan `?indice=` y `?saltos=`, que mandan en esa exportación **sin guardar nada**.
Es para la vez que alguien necesita el tomo con el índice entero para una reunión y no quiere cambiar
cómo se imprime siempre.

Un valor inventado ahí **no es un 400**, al contrario que en el formulario: se ignora y sale lo
configurado. La diferencia con `?estado=`, que sí da 400, es que un `estado=aprovado` entregaría un PDF
con marca de agua que quien lo pidió creía aprobado —miente sobre el documento— y un `indice=veinte`
solo sale con el índice de siempre.
