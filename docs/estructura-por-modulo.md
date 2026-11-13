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
apartados —añadir un campo, retirarlo, renombrarlo, moverlo— y los otros diez módulos siguen como
estaban.

Lo que NO cambia:

- **La estructura común sigue siendo de la jefatura.** Los apartados comunes del documento (los que
  `edita` la jefatura de departamento) no los reforma nadie más, ni siquiera quien los tenga
  asignados para escribir en ellos. Se delega el contenido, no la forma.
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

| dónde | quién cambia la forma |
| --- | --- |
| apartado de módulo | `admin`, `jefe_departamento`, y **el docente que lleva esa unidad** |
| apartado común | `admin` y `jefe_departamento`, y nadie más |
| cualquiera | `jefe_estudios`, **nunca** |

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
