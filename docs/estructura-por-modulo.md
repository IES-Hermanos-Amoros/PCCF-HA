# Estructura propia por módulo

Por qué un módulo puede llevar sus propios apartados y campos, quién los cambia y qué sigue siendo
de todos. La decisión es del departamento, de noviembre de 2026, y la trae una frase de la jefatura:
que cada docente pueda modificar su parte de la programación **como hasta ahora hacía en el Word
compartido**, pero solo donde tenga permiso.

## 1. Lo que estorbaba

La plantilla de un documento define **21 secciones bajo `modulos`, una sola vez**, y las comparten
los **11 módulos** del documento. Un apartado de módulo no es una sección por módulo: es una sección
con once instancias, una por unidad.

Y `core/permisos.js` → `puedeCambiarEstructura` responde `admin || jefe_departamento` **para el
documento entero**. Así que abrirle la estructura al docente, sin más, le deja añadir una casilla a
«su» módulo y añadírsela a los once sin querer.

Es el mismo problema que ya apareció con las tablas, en otra escala: el dato sabe decir «todas» y
«solo ésta», y lo que hacía falta era decir **«ésta, y que las demás no se enteren»**.

## 2. La decisión

**Un módulo puede llevar estructura propia.** El docente que lo lleva cambia la forma de sus
apartados —añadir un campo, retirarlo, renombrarlo, moverlo— y también **los apartados enteros**:
puede eliminar un apartado en su módulo y los otros diez siguen como estaban. La frase del
departamento es que el documento es **totalmente configurable por quien tiene permisos en ese
apartado, sea cual sea el apartado**.

Lo que NO cambia:

- **Quien puede escribir en un apartado puede configurarlo**, también en los comunes. Asignar un
  apartado común ya no delega solo el contenido: delega la forma con él. Esto se decidió así
  explícitamente, después de haberlo decidido al revés: ver 4.
- **La jefatura de estudios no toca nada.** Es lo que la deja en condiciones de aprobar.
- **Retirar no borra.** Igual que en el resto de la aplicación.

## 3. La regla

> Un módulo sigue **su propia estructura mientras la tenga**, y **la común cuando no la tenga**.

Es, a propósito, la misma regla que ya gobierna una tabla que ha divergido de su modelo
(`core/modelos-tabla.js` → `estructuraDeTabla`, y `core/estructurados.js` → `queSeImprime`), con el
mismo vocabulario. No es un parecido: es que la pregunta es la misma dos niveles más arriba, y dos
respuestas distintas a la misma pregunta es exactamente la avería que `core/permisos.js` cuenta en
su cabecera.

La forma concreta del dato vive en `core/estructura-modulo.js`, con su puerta de validación y sus
motivos escritos para que los lea una persona.

**UN APARTADO SE RETIRA CON SUS HIJOS**, que es el criterio que ya aplica `core/plantilla.js` a la
plantilla común, y restaurarlo devuelve los hijos que no se hubieran retirado por separado. No se
escribe nada en los hijos al retirar al padre: se ocultan por colgar de un retirado y su contenido se
conserva. Que los dos criterios no se separen es lo que hay que vigilar.

## 4. Quién cambia qué

| dónde | quién cambia la forma | a quién afecta |
| --- | --- | --- |
| apartado de módulo | `admin`, `jefe_departamento`, y **el docente que lleva esa unidad** | **solo a ese módulo** |
| apartado común | `admin`, `jefe_departamento`, y **quien lo tenga asignado** | **al documento entero** |
| cualquiera | `jefe_estudios`, **nunca** | — |

La regla es una sola: **quien puede editar el apartado puede configurarlo.** La primera versión de
esto negaba la forma de lo común a quien solo lo tuviera asignado, con el argumento de que se delega
el contenido y no la forma; el departamento lo corrigió, y manda su versión.

**LA ASIMETRÍA NO ES UN DETALLE Y HAY QUE ENSEÑARLA.** Un apartado de módulo que se retira
desaparece de ese módulo y de ninguno más. Un apartado común no tiene «solo el mío»: retirarlo lo
quita del documento entero, para los once módulos y para todo el que lo estuviera escribiendo. Quien
lo tiene asignado puede hacerlo —es lo decidido— pero la aplicación tiene que **decir el alcance
antes de guardar**, con el número delante: a cuántos módulos afecta y a quién. No se impide: se
avisa.

La regla recibe booleanos ya resueltos, como `reglaEdicion` y `reglaCompartido`: las dos mitades de
la aplicación no tienen delante los mismos datos, y lo que no puede duplicarse es la regla, no la
búsqueda.

### 4.1 Un común no tiene desvío, porque solo tiene una copia

Medido en la PD de DAW 26-27: **37 apartados comunes, cada uno con UNA instancia**, y 19 secciones de
módulo con **11 instancias cada una**.

Un apartado de módulo es una definición con once copias, así que lo que reforma un docente es **su**
copia, y eso es lo que guarda `unidad.estructura`. Un apartado común tiene una sola copia, así que
**no hay nada que reconciliar: configurar la única copia que existe ES cambiar la definición del
documento**, y eso ya lo hacen las rutas de `app/_lib/rutas/estructura.js`. Lo único que hacía falta
era que por ellas entrara quien tiene el apartado asignado, no solo la jefatura.

Esto estuvo escrito al revés, como si faltara inventar un sitio a nivel de documento donde guardar el
desvío de un común. Queda aquí el error y no solo su corrección, porque la causa es la que se repite:
**se arrastró la maquinaria de los módulos a un caso que no la necesita.**

Y por estas rutas hay un límite que no se puede perder: cambian la definición COMÚN, así que para una
sección **de módulo** afectarían a los once a la vez. Por eso ahí siguen siendo de la jefatura, y el
docente reforma su módulo por la otra ruta. Es una distinción que alguien borrará por limpieza si no
está escrito el porqué.

### 4.2 El botón que puede dar error se queda, y se explica

Retirar, restaurar o borrar un apartado exige poder configurar **cada** apartado de su subárbol
(`puedeConfigurarRama` en `app/_lib/rutas/estructura.js`): si dentro hay uno que no es de quien mira,
no se retira. Pero la lectura `GET …/estructura?seccion=` solo contesta por **ese** apartado, no por
lo que tiene dentro, así que la pantalla puede ofrecer «retirar» y el servidor contestar 403 con su
motivo.

**El departamento ha decidido dejarlo así**, y el argumento es el tamaño: hoy esto solo puede ocurrir
en **un** apartado de la PD de DAW —«Justificación de la programación», el único apartado común de
nivel medio con un hijo dentro—, nadie pierde nada, y el aviso del servidor explica el motivo. La
alternativa, que la lectura devolviera también un `puedeCambiarRama`, está escrita aquí por si el
número crece cuando el departamento empiece a anidar apartados, que ahora ya puede.

## 5. La red antes del cambio

Antes de tocar nada se congela lo que la aplicación hace hoy: por cada documento y cada módulo, el
árbol que ese módulo ve y los campos de cada apartado, con su sha256. Si alguien cambia cómo se
resuelve la estructura de un módulo **que no tiene estructura propia**, esa prueba falla. Es el mismo
mecanismo que protegió la pieza de los modelos de tabla (`test/tablas-sin-modelo.json`).

Y las pruebas de extremo a extremo fijan la frontera de permisos **de hoy**, con un docente
recibiendo 403 en las rutas de estructura. Cuando el cambio entre, esa prueba cambiará de signo: es
la forma de ver, en una línea, qué se ha abierto exactamente.

## 6. Lo que queda sin cerrar

- **Qué pasa con lo ya escrito cuando la jefatura cambia la estructura común** de un apartado que
  algún módulo ya tiene divergido. La decisión del departamento para las tablas fue: se avisa a quien
  lo añade, y si acepta, se avisa a quien le afecta y se añade vacía. Aquí aún no está aplicada.
- **Si una estructura propia debe poder volver a la común**, y qué ocurre entonces con lo escrito en
  los campos que solo existían en la propia. Hoy se puede (`estructura: null`), y lo escrito en un
  campo que desaparece se queda guardado sin que nadie lo lea; no está decidido si eso vale.
- **Las propuestas pedagógicas y la memoria no tienen módulos.** La regla no les afecta hoy, pero
  conviene no escribirla de forma que dé por hecho que todo documento tiene unidades.
- **Lo escrito en una casilla o un apartado que desaparece.** Cuando un módulo vuelve a la estructura
  común, o retira un apartado que él mismo creó, la fila con lo escrito **se queda guardada y deja de
  ser alcanzable**: no se borra, pero nadie la vuelve a ver, y por la API no hay forma de llegar a
  ella. Es la pregunta de arriba vista desde el otro lado, y sigue sin decidir.
- **Cerrado: una casilla no desaparece de la lista.** El PUT de la estructura propia compara con lo
  guardado (`motivoDeCasillasPerdidas` en `core/estructura-modulo.js`) y contesta 400 si falta una
  casilla; para quitarla se marca `retirado: true`. El cerrojo del cliente se queda como segunda
  barrera. Los campos añadidos a un apartado común no tenían el agujero: sus rutas son operaciones
  (retirar, restaurar…), no un PUT de la lista.
- **Cerrado: el borrado exige confirmación en el servidor.** Los dos DELETE de `estructura.js` piden
  `{ confirmar: true }` y contestan 400 sin él, como el de versiones. La pantalla lo manda
  (`BorrarDefinitivo.js`).
- **La huella que vigila las fugas de la batería** cubre el reparto de docentes, las asignaciones, las
  estructuras propias y las filas huérfanas. No cubre el estado del documento ni las versiones
  alternativas, que `salidas-comprobaciones` y `versiones` sí tocan y restauran por su cuenta.
