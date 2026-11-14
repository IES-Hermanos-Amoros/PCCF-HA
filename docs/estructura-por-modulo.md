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
  los campos que solo existían en la propia.
- **Las propuestas pedagógicas y la memoria no tienen módulos.** La regla no les afecta hoy, pero
  conviene no escribirla de forma que dé por hecho que todo documento tiene unidades.
- **Qué pasa al retirar un apartado que tiene hijos**, en un módulo y en lo común. El criterio sale
  del que ya aplica `app/_lib/rutas/estructura.js` a la plantilla común; que los dos no se separen es
  lo que hay que vigilar.
- **El aviso de alcance de un apartado común** está decidido aquí y todavía no construido.
