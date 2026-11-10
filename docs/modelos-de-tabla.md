# Modelos de tabla

Por qué la aplicación va a dejar de saber de «fichas de situación de aprendizaje» y va a saber de
**tablas con forma propia**, y qué se decidió exactamente.

Este documento fija el diseño. Lo que se construye y en qué orden está en la sección 6; el estado de
cada pieza se lleva en [`plan.md`](plan.md).

---

## 1. El problema

Hay dos clases de tabla en la aplicación, y las dos están mal para lo que el departamento necesita.

**Una tabla genérica no tiene forma.** En un campo de tipo `tabla` o `tabla_clave_valor`, la forma
**son** las celdas: `valor.filas`. No existe ningún sitio donde escribir «esta tabla tiene estas
columnas». Por eso no se puede pedir «cambia la forma de estas tablas»: no hay nada que cambiar
aparte del contenido de cada una, una por una.

**La ficha de SA sí tiene forma, pero cableada.** `ficha_situacion_aprendizaje` es un tipo de campo
escrito a mano con doce campos con nombre propio —criterios, objetivos, actividades evaluables…—, que
son los del Word de este departamento. Para otro departamento o otro centro no significan nada.

Y el reconocimiento está en el mismo sitio: `clasificarTabla`, en `motor/importar-docx.js`, es una
cascada de ocho `if` escritos contra el Word de este departamento, con dos salidas genéricas debajo.
El estilo de un departamento vive dentro del importador. Eso es lo que impide que la herramienta
sirva a quien escribe sus documentos de otra forma.

El propio repositorio tiene la prueba a mano: de los doce documentos de `docs/entrada_ej/`, la
aplicación se ha ejercitado en serio contra cuatro —las programaciones didácticas—. Los otros ocho
—dos PCCF, dos memorias y cuatro propuestas pedagógicas de ESO y Bachillerato— son el otro estilo, y
las cuatro propuestas no tienen fichas de SA en absoluto.

## 2. Lo que se pide

Que la aplicación encuentre las tablas de cualquier Word, **proponga** qué tablas son la misma,
permita a quien manda definir su forma —y elegir si el cambio va a todo el grupo o solo a una—, y que
el docente rellene lo que esa forma le pida.

## 3. Las decisiones

### 3.1 El cambio va al grupo, y una tabla puede divergir

Lo normal es que el jefe de departamento cambie la forma de un grupo entero de tablas iguales. Pero
una tabla concreta puede empezar a separarse del resto, y entonces sigue su camino.

**Divergir es un estado, y tiene que verse en pantalla.** Si una tabla se desengancha de su modelo y
nada lo dice, el día que alguien cambie el modelo esa tabla no cambiará, y nadie relacionará lo uno
con lo otro. Es la misma clase de defecto que una ficha que se imprime desde la rejilla del Word en
vez de desde su modelo: algo que no sale de donde quien lo mira cree. Así que una tabla divergida lo
dice, con desde cuándo, y se puede volver a enganchar.

### 3.2 Un cambio avisa dos veces

Primero **a quien lo hace**, con números y antes de aceptar: cuántas tablas ya rellenas cambia y a
cuánta gente afecta. Después **a quien le afecta**, en su apartado, cuando entre: qué le han
cambiado, quién y cuándo, y con forma de quitárselo de encima una vez leído.

El aviso es dentro de la aplicación porque **no hay correo**: existen invitaciones, pero ningún SMTP.
Si algún día se quiere por correo, se añade encima de esto; al revés no.

### 3.3 La aplicación propone los grupos y una persona confirma

Al importar, la aplicación agrupa las tablas que se parecen y enseña su propuesta: «he encontrado 37
tablas y creo que son 9 modelos». El jefe de departamento acepta, renombra o separa.

Ni adivinar sin preguntar ni obligar a empezar de cero. Y es la pieza que hace que un centro nuevo le
enseñe a la herramienta sus documentos **sin que nadie toque el código**: cada modelo lleva su propia
regla de reconocimiento, y los ocho `if` del importador pasan de código a dato.

### 3.4 El modelo vive en el documento, y se sube después

Un modelo se guarda en `documento.plantilla`, igual que el resto de la plantilla. Las tablas que
comparten forma dentro de ese documento cambian juntas.

No se empieza por una colección compartida entre documentos, aunque a la larga haga falta para que un
departamento o un centro tenga su estilo. El motivo es concreto: dentro del documento se reaprovechan
el control de versiones y el aviso de conflicto que ya funcionan (`plantillaVersion`, el 409), y
subirlo después a departamento **no obliga a rehacer el editor**, solo a mover dónde se guarda. Al
revés sí: empezar por la colección compartida obliga a resolver versiones entre documentos, permisos
propios y avisos a documentos que otra gente tiene abiertos, antes de que nada funcione.

### 3.5 Una tabla importada se imprime como vino, también en el estilo

Una tabla de dos columnas **creada en la aplicación** saca la columna de los conceptos en negrita
sobre fondo gris: es lo que promete el catálogo de campos para «clave y valor». Una **importada** se
imprime desde la rejilla del Word tal cual, y muchas no llevan ni negrita ni fondo. Son dos aspectos
distintos para el mismo tipo de tabla dentro del mismo documento.

Se queda así: **manda la fidelidad al documento**. Unificarlas cambiaría el aspecto de tablas que ya
están impresas en los documentos del departamento, y este proyecto no cambia lo que alguien ya
escribió para que la herramienta quede más bonita. El estilo solo se unifica cuando quien manda lo
pida: entonces es parte de la forma de la tabla y viaja en el modelo, como el resto de la forma.

### 3.6 Sin peticiones dentro de la aplicación

Que el docente le pida una casilla al jefe de departamento **se habla fuera de la aplicación**. Solo
hay permisos: el docente no cambia la forma, quien manda sí.

Se consideró hacerlo dentro, con petición, respuesta y aviso. Se deja fuera porque es la parte que
menos se sabe cómo tiene que ser hasta haber usado lo demás, y porque añade una cosa que mantener sin
la que el resto funciona igual.

## 4. El modelo de datos

```
plantilla.modelos['modelo-xxx'] = {
  id,        // se acuña UNA VEZ y NO sigue al nombre nunca
  nombre,    // lo que se enseña: «Ficha de actividad»
  tipo,      // 'tabla' | 'tabla_clave_valor'
  sentido,   // 'columnas' (las partes van a lo ancho) | 'filas' (van a lo alto)
  columnas,  // de cuántas columnas es la tabla cuando las partes van a lo alto (por omisión 2)
  partes: [ { id, etiqueta, peso?, ancho?, grupo?, solo_si_hay?, retirado? } ],
  version
}
```

Cada sentido tiene **su medida y su nombre**, porque son magnitudes distintas y no se convierten una
en otra: a lo ancho, `peso` es el peso relativo de la columna (puede ser decimal); a lo alto, `ancho`
son cuántas de las `columnas` ocupa la parte en su fila (un entero, que acaba siendo su `colspan`).
`grupo` es `{ id, etiqueta }` —el id agrupa, la etiqueta se imprime— y `solo_si_hay` omite la fila
cuando no tiene nada escrito. Cómo se colocan las partes que van a lo alto, que es la maquetación de
la ficha y está comprobada celda por celda contra `filasDeFicha`, está en
[`interfaz-web.md` §3.9](interfaz-web.md).

Un campo apunta a su modelo con `campo.modelo`; sin esa clave, no usa modelo. Una tabla que ha
divergido guarda su estructura junto a su contenido, en `valor.estructura`, **con su `sentido`
dentro**: si el sentido lo siguiera diciendo el modelo del que se desengancho, cambiarlo alli
reinterpretaria girada noventa grados una tabla que precisamente habia dejado de seguirlo. Divergir
tiene que proteger de eso o no protege de nada.

### El contenido va por id de parte, no por posicion

Con estructura, lo guardado es **solo el contenido**: los rotulos los pone la estructura al pintar.
Y cada casilla se guarda bajo el id de su parte. Con `sentido: 'filas'` cada parte guarda una
casilla; con `sentido: 'columnas'`, la lista de las suyas hacia abajo.

| | Por posicion | Por id de parte |
|---|---|---|
| Anadir, mover o retirar una parte | Hay que reescribir todas las tablas del grupo | No toca ninguna |
| Una tabla a medio rellenar | Imposible a lo alto: la fila *i* es la parte *i*, asi que o ninguna o todas | Natural |
| Partes retiradas | Tienen que seguir contando para que el emparejamiento cuadre | Dejan de contar |
| La ficha de SA | Se parecerian | Es el mismo mecanismo: ya guarda `ficha[id]` |

La ultima fila es la decisiva. La ficha es el unico precedente que funciona y guarda por id desde
el principio; con contenido posicional, absorberla en la pieza 7 habria sido una reescritura y no
una absorcion.

Tres reglas vienen de lo ya aprendido con la estructura de la ficha y no se vuelven a discutir:

| Regla | Por qué |
|---|---|
| El `id` se acuña una vez y no sigue a la etiqueta | El contenido se guarda por id. Un id que siguiera al nombre dejaría huérfano lo escrito en cuanto alguien corrigiera una tilde |
| Retirar no borra | Una parte retirada deja de imprimirse y su contenido sigue ahí. Borrar es otra cosa, se pide aparte y dice cuánto se pierde |
| Dos partes no pueden llamarse igual | El lector de una tabla importada reconoce las partes por el texto de su etiqueta. Con dos iguales se queda con una, y el texto de la otra se pierde al releerse |

## 5. La regla única

> Una tabla sigue **su propia** estructura mientras la tenga, y la del **modelo** cuando no la tenga.
> Si no hay ninguna de las dos, se deduce de las celdas guardadas.

Vive en `core/`, en un solo sitio, y la llaman los tres consumidores: el PDF
(`motor/render-generico.js`), el Word (`motor/exportar-docx.js`) y el editor con la puerta de guardado
(`core/tablas-edicion.js` y `core/estructurados.js`). Que estuviera escrita dos veces es el defecto
que esta regla existe para evitar: dos caminos de validación divergen, y la divergencia se descubre
con un 400 delante de alguien que está escribiendo.

No es una mecánica nueva. Es la generalización de la que ya gobierna las fichas importadas en
`core/sa.js`: una ficha se imprime desde `filas` mientras las tenga y desde su modelo en cuanto deja
de tenerlas. Misma forma y mismo motivo.

**La puerta de aceptación de la primera pieza es que nada cambie**: un campo sin `modelo` y un valor
sin `estructura` tienen que dar el mismo PDF y el mismo Word, byte a byte. Todo lo que el
departamento tiene escrito está así.

## 6. El orden

1. El modelo en la plantilla y la regla de qué estructura manda, en `core/`, sin pantalla
2. **Adoptar un modelo para una tabla ya escrita**: soltarle la fila de rótulos y emparejarla con
   las partes
3. Las operaciones sobre el modelo, con ruta, permisos, versión y 409
4. Divergir y volver a enganchar, con el estado visible
5. El doble aviso: números antes de aceptar, aviso al docente después
6. La pantalla: los gestos sobre la tabla misma
7. La confirmación de la importación: la aplicación propone los grupos y el jefe confirma
8. Absorber la ficha de SA y remontar las fichas escritas

### Por qué adoptar es una pieza y no un detalle

Porque sin ella el modelo **no sirve para nada de lo que ya hay**. Una tabla escrita hoy lleva su
fila de rótulos *entre* sus celdas; en cuanto su campo gana un modelo, esa fila pasa a ser
contenido y la tabla imprimiría los rótulos dos veces, o no cuadraría con la estructura y dejaría
de guardarse. Sin adopción, el modelo solo vale para tablas nuevas, que son cero.

Es el mismo problema que `completarDesdeFilas` resuelve para una ficha importada —rescatar lo que
solo está en la rejilla antes de que la rejilla se vaya—, y aquí no había equivalente.

### Por qué la ficha de SA va al final

Porque `sentido: 'filas'` con `ancho` **es** la ficha: doce partes a lo alto, cada una ocupando su
fracción de la fila. Encaja sin forzar nada, así que no hay prisa por absorberla, y absorberla toca
los documentos reales del departamento: convierte doce campos de código a dato y reescribe contenido
escrito por personas. Eso se hace una vez, medido aparte y con permiso, cuando la maquinaria
genérica ya funciona contra tablas de ejemplo.

### La medición que puede tumbar el plan

La pieza 7 depende de que agrupar tablas por forma dé grupos sensatos en documentos de verdad. Se
mide antes de construir la pantalla, sobre los doce documentos de `docs/entrada_ej/`, y con atención
a los ocho que no son programaciones didácticas. Si el agrupamiento da disparates, lo que hay que
cambiar es el plan, no la pantalla.

Medido ya: el agrupamiento acierta de pleno en seis de las nueve familias que el importador etiqueta
en una programación, y se queda en el 80 % en las fichas de situación de aprendizaje. Los grupos que
casan por cabecera son fiables; los que agrupan solo por geometría son los que mezclan, así que la
pantalla tendrá que marcarlos como débiles y dar por hecho que alguien unirá y partirá a mano.

Lo que **no** es el techo de las fichas: durante un tiempo se dio por hecho que en los documentos
había dos diseños distintos de ficha. Es falso, y se midió: las **311** fichas que el importador
reconoce en los doce documentos son **todas de cuatro columnas** —248 de 18 filas, y el resto de 24,
17 o 22—, así que `COLUMNAS = 4` sigue siendo la única maquetación. Lo que le cuesta al agrupamiento
es la negrita escrita de forma irregular y los anchos que difieren por redondeo, no dos familias.

### Y la medición de la pieza 2: cuántas tablas se pueden adoptar

La adopción tiene la misma clase de riesgo y se mide igual, con `scripts/medir-adopcion.js` sobre los
mismos doce documentos y sin escribir nada. Son 1.095 tablas, y el modelo contra el que se mide lo
propone el propio guion con los rótulos que cada tabla ya tiene, que es lo más favorable que se puede
hacer sin inventar nombres.

| Medición | Se adoptan sin perder un carácter |
|---|---|
| Con el modelo de su **grupo**, de las que hoy pueden tener modelo y están en un grupo | **91 de 224** (41 %) |
| Con un modelo hecho a su medida: el **techo** de las 1.095 | **512** (47 %) |
| La **ficha de SA** contra el modelo de la ficha de verdad | **0 de 311** |

**El techo, familia por familia, es lo que de verdad decide**: las ponderaciones (290/290), la tabla
de RA y CE (44/44), competencias y objetivos (37/37) y los contenidos (18/18) se adoptan **todas**,
así que esos cuatro `if` del importador pueden pasar a ser modelos. Las tablas genéricas se quedan en
76 de 248 y las de clave y valor en 47 de 59. Y hay tres familias que hoy no pueden: la ficha de SA,
la identificación del módulo y el resumen de situaciones, que es derivado y no se guarda nunca.

**Por qué se niega, agrupado por motivo** (el techo, 583 tablas): 452 porque la tabla no tiene
rótulos de los que sacar un modelo, 113 por una celda combinada donde el emparejamiento tiene que ser
de una celda a una parte, 12 porque el rótulo mide más de 100 caracteres —no es un rótulo, es un
párrafo que la heurística de cabecera confundió—, 4 por dos rótulos que casan con la misma parte y 2
por una celda con texto que se quedaría sin sitio. En esas 583 hay 1,55 millones de caracteres que se
quedan fuera del modelo, y 74 que se perderían si se adoptaran a la fuerza.

**La ficha de SA no la bloquea su cuerpo, sino su cabecera.** Sus doce filas se emparejan sin
problema; lo que no tiene sitio son las cinco cosas de arriba —número, título, sesiones, evaluación y
resultados de aprendizaje—, que no son partes a lo alto: son rótulo y valor en la MISMA fila, con un
`rowspan` para el título. Son 90.467 caracteres de las 311 fichas, y ningún `sentido` de los dos
actuales sabe colocarlos: `columnas` pone los rótulos arriba y `filas` los pone encima de su
contenido. La identificación del módulo (44 tablas) falla por lo mismo, y de forma más clara: es
`rótulo | valor | rótulo | valor` en cada fila. **Es el agujero del modelo de datos**, y la pieza 8 no
puede salir adelante sin taparlo: hace falta decir que una parte lleva su contenido AL LADO y no
debajo, que es una tercera forma de colocar, o sacar esos cinco campos del modelo.

**Adoptar puede cambiar el aspecto sin perder un carácter**, y es aceptable pero se avisa (§3.5). De
las 91 que se adoptan con el modelo de su grupo, 39 cambian lo que se imprime: 32 cambian el reparto
de las columnas, 9 un rótulo que el modelo reescribe, 7 la negrita o el fondo, 6 pierden el estilo por
celda que traían del Word y 1 gana la cabecera que se repite al cambiar de página. Y una advertencia
que salió de medir: si el modelo no lleva el `peso` de cada columna, cambian las **91**, porque una
tabla adoptada no guarda `anchos` y el reparto pasa a hacerlo el texto. Quien proponga el modelo de un
grupo tiene que sembrarlo con los anchos del `w:tblGrid` de la tabla representante.

---

## 7. Lo que queda sin cerrar

Tres cosas que la pieza 1 deja abiertas a propósito. Están aquí para que no se descubran dentro de
tres meses como si fueran defectos nuevos.

**La regla de maquetación está escrita dos veces**, en `core/sa.js` para la ficha y en
`core/modelos-tabla.js` para un modelo a lo alto. Es la única excepción a «una regla en un solo
sitio» de todo esto, y es deliberada: unificarla obliga a tocar el código que gobierna las 306
fichas reales, y eso le toca a la pieza que absorba la ficha y no a ninguna anterior. Lo que
mantiene la excepción honesta es una prueba que compara las dos maquetaciones celda por celda sobre
los campos de la propia ficha; mientras pase, las dos dicen lo mismo.

**El lado de escritura del editor, para una tabla que ha adoptado su modelo, está cerrado con
llave.** Las mil líneas de `core/tablas-edicion.js` indexan por `(fila, columna)` sobre lo pintado,
y en una tabla adoptada lo pintado lleva la fila de rótulos y lo guardado no. Media correspondencia
es exactamente cómo se le da formato a la celda equivocada, así que el editor enseña esas tablas y
se niega a las catorce operaciones con su motivo. Le toca a la pieza de adopción, que es la que crea
esas tablas.

**El tope de partes a lo alto cuenta partes y el tope de la hoja cuenta filas.** Un modelo con 200
partes lo acepta la puerta y produciría más de 400 filas impresas, cuando el máximo de una rejilla
guardada son 200. No revienta, porque la tabla generada no vuelve a pasar por la puerta, y 200 partes
en una tabla es absurdo —la ficha tiene doce—. Cerrarlo de verdad es comprobar las filas que la
maquetación va a producir, no inventar un medio tope.
