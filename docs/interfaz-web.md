# Interfaz web: edición de documentos importados

Propuesta de interfaz como paso intermedio entre la **importación** de un `.docx` y la **exportación** a PDF:

1. el usuario importa el Word;
2. se detecta la estructura (ya lo hace `motor/importar-docx.js`);
3. se carga una web con las secciones de forma intuitiva para editarlas;
4. los cambios se guardan en MongoDB (el JSON que ya produce el importador);
5. un botón de exportación genera el PDF con los cambios (con `motor/render-generico.js`, que ya funciona);
6. la web está protegida por roles (admin, jefe de estudios, jefe de departamento, docente) con menús tipo `Programación didáctica | PCCF | Memoria` y submenús `Partes comunes → Introducción → Contextualización …` / `Módulos → Bases de datos …`.

Despliegue previsto (del README raíz): Next.js en Vercel con MongoDB Atlas.

---

## 1. Lo que ya existe y se reutiliza

El motor (`motor/`) contiene la lógica; la interfaz solo tiene que consumirla. **No reimplementar nada de esto en la web.**

| Activo | Archivo | Uso en la UI |
|---|---|---|
| Árbol de secciones (57 secciones, bloque "Módulos" con 11 instancias, 11 tipos de campo) | `out/importado/plantilla.json` | **Es el menú**: no se hardcodea "PD → Partes comunes → Introducción", se genera del árbol |
| Datos por sección y módulo | `out/importado/datos.json` (2 MB) | Estado editable, tal cual, en Mongo (ya es JSON) |
| Permisos por rol | `motor/permisos.js` | `puedeVer`, `puedeEditar`, `puedeEditarCompartido`, `puedeDesvincular`: única fuente de verdad, en servidor |
| Textos compartidos con versión | `motor/compartidos.js` | Editar una vez para todos los módulos, desvincular, avisar de desactualizados |
| Render genérico del PDF | `motor/render-generico.js` | Botón de exportar, sin cambios |
| Importación serverless | `motor/api/importar.js` | `POST /api/importar` ya funciona |
| Validaciones (suma RA = 100 %, CE que suman su RA) | dentro de `render-generico.js` | **Extraerlas** a `lib/validaciones.js` para mostrarlas en la UI sin generar el PDF |
| Pruebas de fidelidad | `scripts/test-compartidos.js` | Patrón del test de ida y vuelta (ver §3) |

### La idea clave

El **árbol de `plantilla.json` es el menú**. El bloque `instancias: true` dispara el despliegue de los módulos; `edita` (`jefe_departamento` | `docentes_del_modulo`) decide quién puede tocar cada apartado. La navegación, los candados y el recorrido lineal salen todos de ahí.

---

## 2. Arquitectura

### 2.1 Modelo de datos (MongoDB Atlas)

`datos.json` pesa 2 MB: si se guarda entero, cada guardado de un párrafo reescribe todo el documento y hay conflictos entre docentes editando módulos distintos a la vez. Se parte:

```
usuarios      { id, nombre, email, rol, departamento }

documentos    { tipo: "pd" | "pccf" | "memoria", ciclo, curso, estado,
                plantilla,            // inmutable, derivada del Word
                documento,            // apartados comunes (el "documento" del import)
                asignaciones,         // { idApartado: [idUsuario, ...] }
                origen, generado, updatedAt }

instancias    { documentoId, titulo, grupo, num, docentes, valores }  // 1 por módulo (~150 KB)

compartidos   { documentoId, id, bloque, seccion, comun, responsable, modo, version }

historial     { documentoId, ruta, antes, despues, usuario, fecha }   // opcional, fase 4
```

- `plantilla` **inmutable**: solo se regenera con una reimportación versionada.
- `datos` se guarda tal cual (EJSON); `estado` es un campo del documento (`borrador → revisión → aprobado`).
- `usuarios.rol`: `admin`, `jefe_estudios`, `jefe_departamento`, `docente` (mismos valores que espera `motor/permisos.js`).

### 2.2 API (route handlers de Next.js sobre `motor/`)

| Endpoint | Qué hace | Reutiliza |
|---|---|---|
| `POST /api/documentos/importar` | `.docx` → `importarDocx` → crea documento + instancias | `motor/api/importar.js` |
| `GET /api/documentos/[id]/arbol` | plantilla + resumen de estado por nodo | `plantilla.json` |
| `GET /api/documentos/[id]/ruta/<seccion>?instancia=n` | lee una rama | `datos` |
| `PATCH /api/documentos/[id]/ruta/<seccion>?instancia=n` | guarda **solo esa rama** | `datos` |
| `POST /api/documentos/[id]/compartidos/[cid]` | `editarCompartido` | `motor/compartidos.js` |
| `POST /api/documentos/[id]/compartidos/[cid]/desvincular` | `desvincular` | `motor/compartidos.js` |
| `GET /api/documentos/[id]/validaciones` | avisos de RA/CE/SA | `lib/validaciones.js` (a extraer) |
| `GET /api/documentos/[id]/pdf?estado=&tomo=` | PDF con cambios | `buildDocDefinition` + `resolverCompartidos` |

- **Toda** comprobación de rol se hace en servidor con `motor/permisos.js`; el cliente solo lo refleja (candado, botón deshabilitado).
- Importación: 3,7–5,7 s ⇒ hace falta un `maxDuration` alto en la ruta (hoy estaba en `vercel.json`, que ya no existe; ver *Despliegue en Vercel* en `motor/README.md`). El `.docx` de 1,3 MB cabe en el límite de 4,5 MB de Vercel.
- Auth: Auth.js (credentials u OAuth) con sesión; el usuario de `permisos.js` sale de la sesión (`{ id, rol, departamento }`).
- Guardar el Word original (Vercel Blob o Mongo) para poder reimportar/comparar; `.gitignore` ya excluye `entrada/`.

### 2.3 Fidelidad del ida y vuelta (riesgo nº 1)

El PDF solo sale bien si el editor escribe **exactamente** el formato que espera el renderer:

- texto: bloques `{ type: 'p', text }` y `{ type: 'list', items: [{ text, level }] }` — no HTML arbitrario;
- tablas: `{ filas, anchos? }` con celdas `{ text, colspan, rowspan, bold, fondo?, alineacion?, tamano? }` —las cuatro últimas son opcionales y sin ellas la celda sale como la importa el Word; `anchos` son proporciones por columna y sin ellas las calcula el motor con el texto: el contrato está en `docs/api.md`— y las celdas cubiertas **omitidas** (las reconstruye `rejilla()`).

Por eso: editor de bloques con esquema restringido (párrafo, negrita, listas anidadas) y, en las rejillas, empezar editando el **texto** de la celda sin tocar la geometría de `colspan/rowspan`.

Test de aceptación (patrón de `scripts/test-compartidos.js`): importar → editar algo puntual → exportar y comprobar que **las secciones no tocadas salen idénticas** al PDF actual.

---

## 3. La interfaz

### 3.1 Navegación (sidebar = árbol de la plantilla)

- Arriba: `Programación didáctica | PCCF | Memoria` → en realidad es la lista de la colección `documentos` filtrada por `tipo`, no pestañas fijas.
- Dentro: **Partes comunes** (secciones con `edita: jefe_departamento`) y **Módulos** expandiéndose en los 11 (`instancias: true`). Componente: `Tree` de Ant Design o sidebar colapsable propia.
- Cada nodo con icono de estado:
  - 🔒 sin permiso (`puedeEditar` = false; para `jefe_estudios` todo es de solo lectura);
  - ⚠ con avisos de validación;
  - ✓ relleno (calculado con `presencia` del campo y si el valor existe);
  - 📎 con texto compartido.
- Ruta: `/doc/[id]/[idSeccion]?m=[índice]` + migas de pan + botones **anterior / siguiente** abajo para recorrerlo en orden lineal.

### 3.2 Registro de editores por `campo.tipo`

Un mapa `tipo → componente`, con **fallback genérico** para tipos nuevos:

| Tipo | Editor |
|---|---|
| `texto_largo` | Editor de bloques (TipTap/Plate) con esquema restringido → serializa a `p`/`list` |
| `ponderacion_ra_ce` | Editor estructurado con **suma en vivo** (rojo si ≠ 100 %) — máxima rentabilidad, es donde hay validación real |
| `auto.tabla_ra_ce` | Editor RA ↔ CE (dos columnas, añadir/quitar criterios) |
| `ficha_situacion_aprendizaje` y `repetidor` | Tarjetas: añadir, quitar, ordenar. El `derivado.resumen_situaciones` **nunca se edita**, se recalcula |
| `tabla_clave_valor`, `auto.ficha_modulo` | Formulario etiqueta/valor |
| `tabla`, `auto.*` | Rejilla editable; texto de celda sin alterar `colspan/rowspan` |
| `dual_ra_ce`, `texto` | Fallback genérico / campo simple |

**Tablas creadas en la aplicación.** `tabla` y `tabla_clave_valor` tienen editor solo cuando el campo
nació aquí (`campo.inicial`, ver `core/campos.js`): las del Word son el mismo tipo y siguen en solo
lectura, porque el criterio del importador es que su PDF salga idéntico. El editor
(`app/_componentes/EditorTablas.js`) es una cáscara sobre `core/tablas-edicion.js`, que decide qué
pasa al escribir en una celda, añadir o quitar filas y columnas y poner o quitar la cabecera; el alta
(`NuevoCampo.js`, `AnadirCampo.js`) se pinta del catálogo `tiposDeCampo` que devuelve
`GET .../estructura`, con la lógica en `core/campos-forma.js`. Ambos guardan por el autoguardado de
siempre. Todavía no hay celdas combinadas ni cambiar el nombre de un campo.

Campos con `presencia: 9/11` (no existen en 2 módulos): la UI muestra **"vacío → añadir"**; hoy el PDF los omite en silencio.

### 3.3 Textos compartidos

- Badge "compartido en 10 módulos" junto al campo.
- **Editar global** (cambia todos los vinculados) vs **Desvincular** (el módulo se queda copia propia editable, solo en modo `sugerido`).
- Aviso "el original ha cambiado (v3 > v2)" vía `avisosDesvinculados`.

### 3.4 Panel de comprobaciones

Extraer las comprobaciones que hoy están dentro de `render-generico.js` (`pintarPonderaciones`, `resumenSituaciones`) a **`lib/validaciones.js`**, usado igual por la UI y por el PDF:

- suma de ponderaciones de RA ≠ 100 %;
- CE de un RA que no suman la ponderación de ese RA;
- RA sin situación de aprendizaje;
- avisos de desvinculados.

El usuario ve los errores **antes** de exportar (hoy aparecen en una cajita roja del PDF).

### 3.5 Guardado

- Autoguardado por sección (debounce de 1–2 s) con `PATCH` de **solo esa rama**; nunca el documento completo.
- UI optimista + `updatedAt` para detectar conflictos.

### 3.6 Texto de ayuda: qué se pliega y qué no

Esta herramienta la usa gente que siempre es principiante: el departamento toca su
programación dos o tres veces al año. Por eso hay mucho texto explicativo, y por eso hace
falta una regla: si todo el texto pesa lo mismo, se lee una vez y a partir de ahí se salta
entero, incluido el que importaba.

Cada texto cae en uno de tres grupos, y el grupo decide dónde va:

| Grupo | Qué es | Dónde va |
|---|---|---|
| **Aviso de consecuencia** | Lo que va a pasar si pulsas: «esto sale en los once módulos», «retirar no borra», «se perderá lo escrito» | **Visible, con su peso.** No se pliega nunca: un aviso que llega tarde es peor que el ruido |
| **Explicación de un dato en pantalla** | Por qué el progreso dice 1 %, qué es «enlace sin usar», por qué el botón está apagado | **Visible, en una línea corta.** El dato sorprende cada vez que se ve; lo que sobra es la longitud, no la explicación |
| **Prosa de referencia** | Siempre cierta, no cambia con los datos, y una vez la sabes no la necesitas: el circuito de estados, el modelo de la plantilla, cómo funciona el reparto | **Plegada** detrás del botón de `app/_componentes/Ayuda.js` |

`<Ayuda sobre="…">` pone un botón `?` en la fila del título —sin robar una línea— y el panel cae
debajo, dentro de `.tarjeta-cab`, `.toolbar` o `.linea-estructura`, que son flex con `wrap`.

La preferencia es **una sola para toda la aplicación** (`localStorage`, clave
`ayuda-a-la-vista`): desplegar una despliega todas y así se queda hasta que se cierre. Es un
modo de lectura, no un pliegue por tarjeta — quien quiere la ayuda a la vista no quiere
abrirla pantalla por pantalla.

Esconder de más es el error contrario, y es peor, porque no se nota hasta que alguien se
equivoca. Ante la duda, el texto se queda visible y se acorta.

### 3.7 Confirmar en dos pasos: el foco y el aviso

Hay tres confirmaciones: quitar un campo de un apartado, retirar un apartado y borrar algo
para siempre. Las tres tienen los mismos tres elementos —el botón que abre, el **paso** que
hay que dar (el botón de «sí», o el cuadro donde se escribe el título) y el **aviso** de lo
que ha pasado— y la misma regla de foco:

| Gesto | A dónde va el foco | Por qué |
|---|---|---|
| **abrir** | al paso | el botón que se pulsó ya no está en el árbol; si el foco se queda ahí, vuelve al principio de la página y quien va con el teclado se pierde |
| **cancelar** | al botón de abrir | de ahí salió, y existe otra vez |
| **terminar** | al aviso | la fila entera puede haberse ido, y el aviso es lo único que queda y además dice qué ha pasado |

Tres reglas sobre esto, y las tres se incumplían en alguno de los tres sitios antes:

1. **La decisión vive en `core/confirmar.js`**, que es puro y tiene pruebas (`test/core.js`).
   No hay pruebas de DOM en este repositorio —ni jsdom ni playwright—, así que lo único que se
   puede fijar es la decisión; el `focus()` lo da `app/_componentes/confirmar-cliente.js`, que
   es el único sitio que toca el DOM y está escrito una vez en lugar de tres.
2. **No se manda el foco a un elemento que no existe.** Cada gesto no tiene un destino fijo
   sino una lista de preferencia, y se elige el primero que está de verdad en la pantalla. Si
   no hay ninguno, no se toca el foco: dejarlo donde está es mejor que mandarlo a un sitio
   cualquiera. La retirada de un apartado es el caso límite —la tarjeta entera se va con el
   cambio y el aviso lo da la pantalla siguiente—, y ahí se cierra sin mover nada (`cerrar`).
3. **El aviso va FUERA de la fila**, en el componente que pinta la lista, siempre montado y con
   `role="status"`. Al quitar el último campo o borrar el último apartado retirado la lista se
   queda vacía: si el aviso estuviera dentro de la fila se iría con ella, y ni se anunciaría ni
   habría dónde dejar el foco.

**Lo que hay que teclear para confirmar un borrado está escrito en la pantalla, literalmente.**
De los 466 apartados reales del departamento, 143 pasan de 40 caracteres y el más largo tiene
124: a esa longitud la confirmación se cumple copiando y pegando, que es exactamente lo que
anula la deliberación que busca. De un título largo se piden sus **primeras palabras** —palabras
enteras, hasta 40 caracteres—, la cadena exacta se enseña tal cual para que no haya nada que
adivinar, y el título completo también vale. La regla es `Plantilla.loQueHayQueEscribir` y
`Plantilla.confirmaTitulo` (`core/plantilla.js`, con pruebas en `test/estructura.js`): no está
en el componente, y no hereda el recorte a 50 caracteres de `slug`, que está para generar
identificadores y puede partir una palabra por la mitad.

### 3.8 Dar formato a una celda de tabla

Escribir en la tabla es lo que se hace casi todo el tiempo; dar formato es ocasional. Cuando
cada celda llevaba cuatro botones y tres desplegables incrustados, y el pie de la tabla tres
controles más por columna, lo ocasional le quitaba el sitio a lo frecuente: con las doce
columnas a las que llegan las tablas reales del departamento, la casilla donde se teclea era lo
más pequeño de la pantalla y el pie de la tabla no se podía leer.

Así que dentro de la casilla hay **dos cosas**: el cuadro de texto, que se queda con el ancho, y
un botón estrecho —`Aa`— que lleva al panel de formato de esa celda. El **panel es uno para toda
la tabla**, va donde la barra de filas y columnas, y habla siempre de **la celda elegida**: fondo,
alineación, tamaño de letra, negrita, unir, separar y el ancho de su columna.

- **No es un diálogo modal.** En esta aplicación no hay ninguno y este no iba a ser el primero:
  es otra barra, no tapa la tabla y no hay que cerrarla.
- **Con el teclado se llega igual.** Entrar en una celda con el tabulador la elige, el tabulador
  siguiente cae en su botón `Aa`, y ese botón lleva el foco al panel; «Volver a la celda» hace el
  camino inverso. No hay ningún atajo que haya que saberse.
- **Qué celda está elegida se ve en la celda** —un filo de color y no un fondo: el fondo de la
  celda es el que se va a imprimir y no se puede tapar—, y **qué formato lleva se sigue viendo en
  la celda**: el panel es desde dónde se cambia, no dónde se lee.
- **Qué celda está elegida es estado, no estilo**, y vive en el componente; que la elección siga
  apuntando a una celda de verdad después de quitar una fila, quitar una columna o combinar dos
  celdas, y qué formato lleva, lo deciden `elegirCelda` y `formatoDeCelda` de
  `core/tablas-edicion.js`, con pruebas en `test/editor-tablas.js`.

### 3.9 El modelo de una tabla: la forma de un grupo de tablas

Una tabla genérica (`tabla`, `tabla_clave_valor`) no tenía forma separada de su contenido: su
forma **eran** sus celdas. Con las más de mil tablas que trajo el importador, eso convierte cada
tabla en un documento aparte y deja al jefe de departamento sin manera de decir «las fichas de
actividad de los once módulos llevan estas cuatro columnas, con estos nombres»: tendría que
entrar en cada una, y al curso siguiente otra vez.

Así que la forma pasa a vivir en la plantilla, como ya vivía la de la ficha de situación de
aprendizaje (`plantilla.estructuraFicha`):

```
plantilla.modelos['modelo-xxx'] = {
  id,        // con el que apuntan los campos; se acuña una vez y no sigue al nombre
  nombre,    // lo que se enseña: «Ficha de actividad»
  tipo,      // 'tabla' | 'tabla_clave_valor'
  sentido,   // 'columnas' (las partes van a lo ancho) | 'filas' (van a lo alto)
  columnas,  // de cuántas columnas es la tabla cuando las partes van a lo alto (por omisión 2)
  partes: [ { id, etiqueta, peso?, ancho?, grupo?, solo_si_hay?, retirado? } ],
  version
}
```

Un campo apunta al suyo con `campo.modelo`. Una tabla concreta que ha **divergido** guarda su
forma junto a su contenido, en `valor.estructura = { partes: [...], sentido }`.

**La regla, en un solo sitio, y son dos preguntas.** *Qué estructura sigue* una tabla: **su propia**
estructura mientras la tenga, y la del **modelo** cuando no la tenga; si no tiene ninguna de las dos,
su forma se deduce de las celdas guardadas, que es lo que le pasa a todo lo que hay escrito hoy. Y
*de dónde sale su contenido*: de su **rejilla** (`filas`) mientras la tenga, y de sus **casillas** en
cuanto deja de tenerla.

La segunda no es nueva: es, literalmente, la de la ficha de situación de aprendizaje —«se imprime
desde `filas` mientras las tenga y desde el modelo en cuanto deja de tenerlas», `completarDesdeFilas`
de `core/sa.js`— y la misma que ya decide entre `filas` y `pares` en `queSeImprime`. El motivo es el
de siempre: lo que alguien tiene delante manda sobre lo que diga el grupo, porque si no, el primer
cambio del departamento al modelo reescribiría por la espalda tablas que nadie ha tocado, y nadie
relacionaría lo que cambió con lo que hizo.

Lo que se sigue de las dos juntas: **ponerle un modelo a una tabla ya escrita no le hace nada**.
Conserva su rejilla, y mientras la conserve se imprime y se edita exactamente como hoy. Adoptar el
modelo —soltarle la fila de rótulos que lleva entre las celdas y emparejarla con las partes— es una
pieza aparte (ver más abajo).

Todo esto vive en `estructuraDeTabla` de `core/modelos-tabla.js` y lo llaman los **tres**
consumidores: el PDF (`motor/render-generico.js`), el Word (`motor/exportar-docx.js`) y el editor con
la puerta de guardado (`core/tablas-edicion.js` y `core/estructurados.js`). Escrito en cada uno, la
pantalla acabaría pintando una tabla distinta de la que sale impresa, que es la avería del E0 otra vez.

### El contenido va por id de parte

`valor.casillas` es un mapa del id de la parte a lo que esa parte guarda:

| `sentido` | la parte es | y guarda |
|---|---|---|
| `'filas'` | una fila | **una casilla**. Es literalmente `ficha[id]` de `core/sa.js` |
| `'columnas'` | una columna | **la lista de sus casillas** hacia abajo |

### Cómo se colocan las partes que van a lo alto

No es «una fila por parte». Es **la maquetación de la ficha de situación de aprendizaje**, que es la
única que existe en los documentos del departamento y la que lleva 306 fichas funcionando:

- las partes se **empaquetan** en filas de `columnas`, cada una ocupando las que diga su `ancho`;
- se **abre fila** cuando la siguiente no cabe o cuando cambia de `grupo`;
- cada fila de partes imprime **dos filas de tabla**: los rótulos encima y los contenidos debajo;
- un `grupo` escribe además su rótulo **cada vez que el grupo cambia** respecto de la fila anterior
  que se imprimió, en una fila que ocupa la tabla entera: así un grupo que reaparece después de otro
  se vuelve a rotular en lugar de parecer la continuación del de arriba, y una fila que no se imprime
  no cuenta como cambio, para que el rótulo no salga separado de las filas que encabeza;
- y una parte `solo_si_hay` no imprime su fila cuando no tiene nada escrito (a lo alto se decide por
  fila de partes, como en la ficha; a lo ancho, por parte, porque cada parte *es* una columna).

**Cada sentido tiene su medida y su nombre**, porque son magnitudes distintas y no se convierten una
en otra: a lo ancho, `peso` es el peso **relativo** de la columna (un número positivo, puede ser
decimal, lo reparte cada motor sobre el ancho de la hoja); a lo alto, `ancho` es **cuántas** de las
`columnas` ocupa la parte en su fila (un entero, que acaba siendo su `colspan`). Con un solo nombre
para las dos, un número escrito para un sentido se usaba como la medida del otro en cuanto alguien le
cambiaba el sentido al modelo, y repartir las columnas con unos números que no son de eso no se ve:
sale una tabla torcida y nadie sabe por qué. Usar la del otro sentido es un error con explicación, no
un valor que se ignore en silencio.

Y **`grupo` es `{ id, etiqueta }`**, no un texto, por lo mismo que el id de una parte no es su nombre:
el id decide qué partes van juntas y la etiqueta es lo que se imprime, así que renombrar un grupo no
cambia su identidad. En la ficha están separados a propósito —el id es `'actividades'` y el rótulo es
otro texto, `CABECERA_ACTIVIDADES`—, así que eso deja de ser una traducción rara y pasa a ser el caso
normal. Dos partes del mismo grupo con rótulos distintos no se guardan: un grupo se imprime con un
solo rótulo.

Y la estructura propia de una tabla divergida guarda también `columnas`, por lo mismo que guarda
`sentido`: para que un cambio del modelo no pueda reempaquetarle las filas después. Si no lo dice,
son dos, y **no** las que diga el modelo del que se desengachó.

> **La maquetación está escrita dos veces, aquí y en `filasDeFicha` de `core/sa.js`, a propósito y
> temporalmente.** Es la única excepción a «una regla en un solo sitio» de toda esta pieza, y existe
> para no tocar `core/sa.js`, que gobierna 306 fichas reales del departamento y hoy no corre ningún
> riesgo: mover su maquetación al modelo genérico por limpieza, antes de que nada más la use, sería
> el peor cambio posible. **La duplicación la quita la pieza que absorba la ficha, no antes.**
> Mientras exista, lo que la mantiene honesta es `test/modelos-tabla.js`: construye un modelo desde
> las propias `CAMPOS_POR_OMISION` de `core/sa.js` y compara **celda por celda** contra
> `filasDeFicha`, con los dos casos de `solo_si_hay` y con la cabecera del grupo escrita una vez. Si
> las dos se separan, esa prueba falla.

**Y la equivalencia es total, también con un grupo que no es el de la ficha.** Lo fue después de
arreglar `core/sa.js`: `filasDeFicha` tenía el nombre del grupo **cableado** y comparaba con la cadena
fija `'actividades'`, así que un grupo propio se agrupaba pero su rótulo **no se imprimía en ninguna
celda**, ni en el PDF ni en el Word. Era alcanzable de punta a punta —`anadir_campo_ficha` de
`core/plantilla.js` acepta cualquier texto y la ruta lo pasa tal cual—, y de ahí sale la regla de
arriba: el rótulo se escribe cada vez que el grupo cambia. `test/modelos-tabla.js` vigila la
equivalencia con los tres casos que la rompían: un grupo propio, un grupo que reaparece y una fila
opcional vacía que parte un grupo.

Por id y no por posición, y los motivos son tres:

1. **Añadir, mover, renombrar o retirar una parte toca cero tablas guardadas**, que es justo lo que
   el departamento pidió: que el cambio vaya al grupo. Con el contenido posicional, añadir una
   columna obligaría a reescribir todas las filas de todas las tablas del grupo.
2. **No hay estados intermedios imposibles.** Con el contenido posicional, una tabla de rótulos a lo
   alto solo podía tener cero filas o todas, y no se podía llenar de una en una.
3. **La ficha de situación de aprendizaje se absorbe de verdad y no por parecido**: ya guarda por id,
   así que es el mismo modelo de datos y no uno que se le dé la mano.

**Retirar una parte no borra su contenido**, igual que con un apartado o un campo: la parte se queda
con `retirado: true`, deja de imprimirse, y su casilla sigue en `valor.casillas` bajo su id.
Restaurarla devuelve la columna con todo lo que tenía. Por id no hay nada que correr —empareja el id
y no el sitio—, así que retirar la segunda de cuatro columnas deja a las otras dos donde estaban.

**Los rótulos no están entre las celdas.** Con el modelo adoptado, lo guardado es solo el contenido y
los rótulos los pone la estructura al pintar. Es lo que hace que el modelo valga para algo: renombrar
una columna en la plantilla la renombra en las once tablas a la vez. La consecuencia es que una tabla
adoptada no tiene cabecera propia, que todas sus columnas con contenido miden lo mismo (una fila es
una casilla de cada columna), y que no lleva celdas combinadas: cada casilla es de una parte y de una
sola.

**El sentido lo guarda también la estructura propia**, no solo las partes. Si lo siguiera diciendo el
modelo del que la tabla se desengachó, el departamento podría girarle la tabla noventa grados a algo
que ya había divergido —el contenido de las columnas leído como filas—, que es exactamente «cambiar
el documento por la espalda», lo único que divergir existe para evitar.

**Enganchar un modelo sin partes es un error con explicación, no un no-op.** Un modelo recién creado
y todavía vacío sería indistinguible de no tener modelo, y quien lo enganchó no se enteraría de nada.
(Un modelo *sin enganchar* sí se guarda vacío: es como nace, y las partes se le añaden después.)

### Lo que esta pieza no trae

- **Adoptar el modelo de una tabla ya escrita**, que es la pieza que hace falta para que esto sirva
  para lo que hay: soltarle la fila de rótulos que lleva entre las celdas, emparejarla con las partes
  y pasar su contenido de `filas` a `casillas`. Es el equivalente de `completarDesdeFilas` para las
  tablas. El sitio natural donde engancha es `queSeImprime` de `core/estructurados.js`, que es el que
  ya decide entre `filas` y `casillas`: hoy devuelve `'filas'` mientras la rejilla exista, y la
  adopción es la transformación que la quita.
- **Escribir en el contenido por parte desde el editor.** Una tabla adoptada se **ve** tal como se va
  a imprimir (`paraPintar` se lo pregunta a la misma regla que los dos motores), pero todavía no se
  cambia desde ahí: todas las operaciones de `core/tablas-edicion.js` están escritas sobre una
  rejilla y con índices de fila y columna que vienen de la pantalla, y los de una tabla adoptada no
  son los de su contenido. Media correspondencia es cómo se le da formato a la celda equivocada, así
  que `motivoDeNo` se niega y lo dice. Va con la pieza de adopción, que es la que crea esas tablas.
- **Operaciones para crear o cambiar un modelo** (añadir una parte, renombrarla, moverla, retirarla)
  ni pantalla desde la que hacerlo. `version` existe en el modelo pero todavía no lo lee nadie:
  empezará a significar algo con las operaciones.
- La ficha de situación de aprendizaje sigue con su mecánica aparte (`core/sa.js`,
  `core/ficha-estructura.js`): se absorbe al final, a propósito y medida aparte. Ahora el modelo
  genérico **sí la puede expresar** —mismo modelo de datos y misma maquetación, comprobada celda por
  celda contra `filasDeFicha`—, así que absorberla es quitar código y no traducirlo. Lo que le queda
  de propio son las tres filas de su encabezado (el número, el título, las sesiones, la evaluación y
  el RA), que no son partes sino datos de la ficha, y sus sinónimos de lectura.

---

## 4. Roadmap

| Fase | Contenido | Criterio de aceptación |
|---|---|---|
| **1 · Lectura** | Next.js + sidebar-árbol desde `plantilla.json` + vista de solo lectura + botón exportar | El PDF exportado es **idéntico** al actual `out/importado/*.pdf` |
| **2 · Edición básica** | Mongo + Auth.js/roles + editores `texto_largo` y `tabla_clave_valor` + autoguardado | Editar un párrafo y que aparezca en el PDF; `jefe_estudios` no puede editar |
| **3 · Estructurados** | RA/CE, ponderaciones, fichas de SA + panel de validaciones | Los avisos del panel coinciden con los de la cajita roja del PDF |
| **4 · Compartidos y flujo** | UI de compartidos, `asignaciones` y `docentes` por módulo, estados borrador/aprobado, historial, PCCF y Memoria | Editar un compartido cambia todos los módulos; aprobar quita la marca de agua |

Cada fase deja algo usable; la fase 1 es la que valida el ida y vuelta antes de invertir en editores.

---

## 5. Avisos conocidos

1. **Camino redundante**: `motor/pd-docdef.js` + `data/pd.json` + `tools/word_a_json.py` es un segundo generador paralelo. Unificar todo en el genérico (`render-generico.js`), o la app tendrá dos formas de pintar la misma PD.
2. **`instancias[].docentes` llega vacío** del importador ⇒ `puedeEditar` (`docentes_del_modulo`) devuelve false para todos: hay que poder asignar docentes a módulos desde la UI (lo hace el jefe de departamento) antes de que cualquiera edite un módulo.
3. **Campos ausentes** (`presencia < nº de módulos`) no se pintan en el PDF: mostrarlos como "vacío" en la UI para que se puedan añadir.
4. **Tamaño**: 2 MB de datos y 243 tablas; en Mongo partir por instancia (§2.1) y no mandar `datos` completo al cliente (cargar por rama bajo demanda).
5. **Importación serverless**: 5,4 s es justo para el límite por defecto; subir `maxDuration` y mostrar progreso en la UI.
