# Plan de construcción de la aplicación

Cómo se pasa de lo que hay hoy —un motor que funciona y un prototipo que funciona, pero por
separado— a la aplicación que describe [`interfaz-web.md`](interfaz-web.md) y enseña el
[mockup v2](mockup-v2/).

El departamento ha dado el visto bueno a implementar las funcionalidades del mockup v2, así que este
documento no vuelve a discutirlas: **el mockup es la especificación funcional**. Lo que aquí se fija
es lo otro, lo que el mockup finge y la aplicación no puede fingir: dónde se guardan las cosas, quién
es el usuario, qué pasa en septiembre cuando empieza un curso nuevo, y en qué orden se construye todo
eso para que cada paso deje algo que alguien pueda usar.

---

## 1. De dónde partimos

**Hecho y probado** (95 pruebas en el motor, 51 en el mockup):

| Pieza | Dónde | Estado |
|---|---|---|
| Importador de Word → plantilla + datos | `motor/importar-docx.js` | funciona con la PD real de DAW: 57 secciones, 11 módulos, 243 tablas, 3,7–5,7 s |
| Render de PDF de cualquier plantilla | `motor/render-generico.js` | tomo completo de 266 páginas en 2,2 s |
| Exportación a Word | `motor/exportar-docx.js` | |
| Textos compartidos con versión | `motor/compartidos.js` | 12 detectados en la PD de DAW |
| Permisos por rol | `motor/permisos.js` | cuatro roles, probado nodo a nodo |
| Fichas de situación de aprendizaje | `motor/ficha-sa.js` | una SA creada en la app sale impresa igual que una importada |
| Saneado de documentos reales | `motor/sanear.js` | |
| Toda la interfaz, como prototipo | `docs/mockup-v2/` | 5.770 líneas, sin servidor ni dependencias |

**Lo que falta es la aplicación**: persistencia, identidad, servidor, y las vistas del mockup
convertidas en algo que escriba en una base de datos en lugar de en `localStorage`.

---

## 2. Decisiones de cimientos

Seis cosas que hay que fijar antes de la primera pantalla porque meterlas después obliga a migrar lo
ya escrito o a tocar todos los editores. Todo lo demás —cada editor, coordinación, comentarios,
estados del documento— se decide cuando le toque, porque el mockup ya lo enseña y cambiarlo es local.

### 2.1 El curso es una dimensión del modelo, no una vista

El arrastre entre cursos (`heredado · revisado · modificado · nuevo`) y el progreso que mide revisión
en lugar de relleno no son una pantalla: son el modelo. En septiembre nadie escribe una programación
desde cero, revisa la del año pasado, así que cada apartado tiene que saber **de qué apartado del
curso anterior viene** y si alguien lo ha mirado ya.

Por eso `documentos` lleva `curso` y `anteriorId` desde el primer día, aunque la vista *Cambios* no
llegue hasta el E5. Si el E1 guarda documentos sin curso ni ancestro, el día que toque el arrastre hay
que migrar todo lo que el departamento haya escrito, y eso es justo lo que no se puede hacer a mitad
de septiembre.

### 2.2 Un solo sitio para la lógica: `core/`

Hoy la misma regla está escrita dos veces en tres sitios:

- **permisos**: `motor/permisos.js` y el puerto `docs/mockup-v2/js/permisos.js`;
- **fichas de SA**: `motor/ficha-sa.js` y el puerto `docs/mockup-v2/js/sa.js`;
- **validaciones**: dentro de `motor/render-generico.js` (solo se ven al generar el PDF) y
  en `docs/mockup-v2/js/validaciones.js`.

En el v1 las dos implementaciones de permisos ya se separaron sin que nadie se enterara. El mockup lo
tapó con una prueba que las compara nodo a nodo, que es un parche excelente para un prototipo y una
mala idea para una aplicación: lo que hay que hacer es que haya una.

`core/` es lógica pura: **sin DOM, sin `localStorage`, sin red, sin node**. La consume el servidor, la
consume el navegador y la sigue consumiendo el mockup como `<script>`. Para eso cada módulo mantiene
el patrón que ya usa el mockup —IIFE que cuelga de `globalThis`— y añade una línea de `module.exports`
al final, así que vale como `<script>`, como `require` y como `import` desde Next.

Sacar de ahí tres cosas que hoy están mezcladas:

- **el pintado de HTML**: `bloques.js` mezcla el modelo (`aTramos`, `marcar`, `aplicar`, `valido`) con
  `pintarParrafo`, `pintarTabla`… El modelo va a `core/`, el pintado a la interfaz;
- **la persistencia**: `plantilla.js`, `sa.js` y `contenido.js` llaman a `localStorage` por su cuenta.
  En `core/` reciben un almacén por parámetro y no saben de dónde sale;
- **los datos de muestra**: el generador determinista por hash, `USUARIOS` y los árboles escritos a
  mano de `estructura.js` son andamios del prototipo. Se quedan en el mockup; en la aplicación esos
  árboles salen del importador.

### 2.3 Se guarda por apartado, nunca el documento entero

`datos.json` pesa 2 MB. Si se guarda entero, cada párrafo reescribe el documento y dos docentes
editando módulos distintos se pisan. `interfaz-web.md` §2.1 propone partirlo por instancia (~150 KB),
pero eso sigue siendo demasiado: el E3 quiere autoguardado por rama, el E5 quiere un `origen` por
apartado y el E7 comentarios por apartado.

Así que la unidad de guardado es el **apartado**, que es el par `(seccion, unidadId)` que ya usa el
mockup como clave (`docId|seccion|unidadId`) y que se corresponde con `datos.documento[seccion]` y
`datos.instancias[i].valores[seccion]` del importador. Una colección `apartados`, un documento por
celda de esa matriz.

### 2.4 La persistencia va detrás de un repositorio con dos adaptadores

`core/` no sabe de MongoDB y la aplicación tampoco debería saberlo desde cada ruta. Un `repositorio/`
con la misma interfaz y dos implementaciones: **memoria** (desarrollo y pruebas, sin levantar nada) y
**mongo** (producción, driver oficial, sin Mongoose: los datos ya son JSON plano). Así las pruebas de
cada evolutivo se ejecutan con `npm test` sin base de datos.

### 2.5 La identidad llega en el E2, pero el hueco se deja en el E0

El E1 va sin autenticación, con el desplegable de persona y rol del mockup. Para que el E2 no obligue
a tocar todas las rutas, desde el primer día el usuario sale de **una sola función**
(`usuarioDeLaPeticion`) que en el E1 lee el selector y en el E2 lee la sesión. Y la comprobación de
permisos se hace **en el servidor** desde el primer endpoint, aunque el usuario sea de mentira: el
cliente solo refleja el candado.

Cómo entra el profesorado (invitación de la jefatura, cuenta Google, cuenta de la GVA) se decide al
empezar el E2.

### 2.6 El ida y vuelta se prueba en cada evolutivo

Es el riesgo nº 1 de la especificación: el PDF solo sale bien si el editor escribe exactamente el
formato que espera el renderer. La prueba, que se monta en el E0 y se ejecuta en todos los demás:

> importar un `.docx` → escribir algo puntual por la API → exportar, y comprobar que **los apartados
> que no se han tocado salen idénticos** al PDF de la importación.

Y la plantilla se guarda **versionada** (`plantillaVersion`) desde el E0, aunque la estructura no se
pueda cambiar hasta el E6: sin eso no hay migración posible.

---

## 3. Modelo de datos

```
usuarios    { _id, nombre, email, rol, departamento }
              rol: admin | jefe_estudios | jefe_departamento | docente   (los de core/permisos.js)

documentos  { _id, tipo, ciclo, curso, departamento, estado,
              plantilla, plantillaVersion,     // inmutable; el E6 añade una capa de cambios
              anteriorId,                      // el mismo documento del curso pasado (§2.1)
              asignaciones,                    // { idApartado: [idUsuario] }  apartados comunes
              origen, creado, updatedAt }
              estado: borrador | revision | aprobado

unidades    { _id, documentoId, unidadId, titulo, num, grupo, docentes }
              unidadId: el id estable del catálogo (core/unidades.js), NO el título

apartados   { _id, documentoId, seccion, unidadId,     // unidadId null = apartado común
              valores,                                 // { campoId: valor }, tal cual del importador
              origen,                                  // heredado | revisado | modificado | nuevo
              revisadoPor, revisadoEn, updatedAt }

compartidos { _id, documentoId, cid, bloque, seccion, comun, responsable, modo, version }

comentarios { _id, documentoId, seccion, unidadId, autor, texto, fecha }

historial   { _id, documentoId, seccion, unidadId, antes, despues, usuario, fecha }   // E7
```

Dos cosas que no son evidentes:

- **`unidades.unidadId` frente a `titulo`.** El importador devuelve las instancias identificadas por
  su título, y los títulos cambian de curso a curso (ya pasa tres veces entre 2025-26 y 2026-27). Al
  importar hay que **conciliar** cada instancia con el catálogo de `core/unidades.js` por código o por
  título de ese curso, y guardar el id estable. Si no, cada septiembre se pierden las asignaciones de
  los módulos renombrados, que es exactamente el fallo que el mockup v2 vino a arreglar un nivel más
  arriba.
- **`apartados.valores` no es un array de bloques.** El importador produce `{ campoId: valor }` por
  sección, y el valor depende del tipo de campo: bloques de texto, `{ ra: [...] }` para ponderaciones,
  `{ pares: [...] }` para claves y valores, la ficha de SA… El mockup simplifica a `bloques` porque
  solo tiene editor de texto. La aplicación guarda la forma del importador, que es la que entiende el
  renderer.

---

## 4. Estructura del repositorio

```
core/                lógica pura compartida (servidor + navegador + mockup). Sin DOM ni node
motor/               el motor: importar, render PDF, exportar Word, sanear
repositorio/         interfaz de persistencia + adaptador de memoria + adaptador de mongo
app/                 Next.js (App Router): rutas de API y vistas
  api/
  (vistas)/
test/                pruebas de core/, repositorio/ y API, con el adaptador de memoria
scripts/             línea de órdenes: importar, generar, sanear, pruebas del motor
docs/
  plan.md            este documento
  interfaz-web.md    la especificación
  mockup-v2/         el prototipo, que sigue vivo como referencia y consume core/
```

El mockup **no se congela**: pasa a cargar `core/` con `<script src="../../core/…">` y sus pruebas
siguen ejecutándose. Es la referencia visual de cada vista que se porta y la forma más rápida de
probar un cambio de lógica sin levantar nada.

La interfaz se porta a **React, vista por vista**, reutilizando la hoja de estilos tal cual —son los
mismos tokens, así que la paridad visual sale gratis— y `js/ui.js` como implementación de referencia.
La hoja vive en `app/estilos.css` desde el E1 y el prototipo la carga de ahí, igual que carga
`core/`: **una sola copia**, o las dos se separan y la paridad deja de significar nada.
No se envuelve el mockup entero: con `contenteditable` ya hubo esa tentación en el v1 y el E3 (guardado
por rama, permisos de servidor) no cabe dentro de un prototipo sin servidor.

**Sin TypeScript.** Todo el repositorio es JavaScript con comentarios que explican el porqué, el
motor es CommonJS y `core/` tiene que seguir cargándose como `<script>` en el mockup. Meter TS
obligaría a reescribir las 2.000 líneas de lógica ya probadas para ganar poco.

**Cómo se exporta un módulo de `core/`.** IIFE que cuelga su API de `global.Core.<nombre>` y, además,
`module.exports` si existe `module`. Con eso el mismo fichero vale como `<script>` en el mockup (que
se abre con doble clic, sin servidor), como `require` desde el motor y las pruebas, y como `import`
desde Next. Cuelga de un único objeto `Core` en lugar de soltar un global por módulo para no chocar
con los globales del mockup, que son los de la interfaz.

**El `package.json` de la raíz no lleva campo `type`.** Turbopack lo hace cumplir también en `app/`,
así que con `"type": "commonjs"` las páginas y las rutas no compilan, y con `"type": "module"` habría
que reescribir el motor. Omitirlo es lo que funciona: node sigue tratando los `.js` como CommonJS,
que es su valor por omisión, y Next usa ESM en `app/`. No se vuelva a poner.

---

## 5. Los evolutivos

Cada uno deja algo que alguien del departamento puede usar, y ninguno se da por terminado sin sus
pruebas y sin que pase la prueba de ida y vuelta (§2.6).

| | Qué entrega | Criterio de aceptación |
|---|---|---|
| **E0** | `core/` con las tres duplicaciones unificadas, `repositorio/` con los dos adaptadores, Next.js desplegable en Vercel, prueba de ida y vuelta | `npm test` ejecuta las 95 del motor + las 50 del mockup contra `core/` + las nuevas, sin base de datos ni red. La aplicación levanta y despliega vacía |
| **E1** | Subir el `.docx` → conciliar unidades → guardar → navegar el árbol → exportar PDF y Word. Sin autenticación: desplegable de persona | El PDF exportado desde la base de datos es **idéntico** al que genera hoy el importador sobre el mismo Word |
| **E2** | Identidad y sesión, `usuarios`, asignación de unidades al profesorado, permisos comprobados en servidor | `jefe_estudios` no puede editar nada ni por API; una unidad sin docentes la ve cualquiera y no la edita nadie salvo la jefatura; el panel dice cuántas unidades no tiene nadie |
| **E3** | Editor de bloques (párrafos, listas, negrita y cursiva) con autoguardado por apartado y detección de conflictos | Escribir un párrafo, recargar, y que siga ahí y salga en el PDF con su formato. Dos pestañas sobre el mismo apartado no se pisan en silencio |
| **E4** | Situaciones de aprendizaje (crear, duplicar, mover, borrar, la tabla resumen calculada), ponderaciones de RA y CE con suma en vivo, panel de validaciones agrupado | Los avisos del panel coinciden uno a uno con los de la cajita roja del PDF. Una SA creada en la app sale impresa igual que una importada |
| **E5** | Arrastre entre cursos: crear el documento de un curso nuevo desde el anterior, vista *Cambios* con el diff, *validar este apartado*, progreso por revisión | Crear 2027-28 desde 2026-27 deja todos los apartados como `heredado` y el progreso a 0 %, con el contenido intacto |
| **E6** | Estructura editable (renombrar, añadir, mover, retirar) con la plantilla versionada y migración de los datos | Añadir un apartado, escribir en él y exportar; y que un documento del curso anterior siga abriéndose con su plantilla antigua |
| **E7** | Panel de coordinación, comentarios por apartado, estados `borrador → revisión → aprobado` con la marca de agua, y el PCCF y la memoria | Aprobar quita la marca de agua y los errores lo impiden. El PCCF y la memoria se importan y exportan por el mismo camino que la PD |

Los avisos conocidos de `interfaz-web.md` §5 caen donde les toca: el camino redundante de
`pd-docdef.js` (nº 1) se retira en el E1; `instancias[].docentes` vacío (nº 2) es el E2 entero; los
campos ausentes (nº 3) se pintan como *vacío* en el E3; la carga por ramas (nº 4) es el E1; y
`maxDuration` de la importación (nº 5), el E1.

### Lo que ha dejado el E0

Cosas que se han descubierto construyendo los cimientos y que condicionan lo que viene. Están aquí
para que no se queden en la conversación en que aparecieron.

**Para el E1:**

- **`ciclo` y `curso` no salen del importador.** Un `.docx` no dice de qué ciclo ni de qué curso es,
  así que el formulario de subida los tiene que pedir. Sin ellos no hay arrastre entre cursos (§2.1),
  que es lo que sostiene el E5.
- **La importación tiene que hacerse en una sola tanda.** `unidades.crearMuchos` fija el orden de las
  unidades por el de creación, y el orden del tomo del PDF es ese. Si la importación se parte en dos
  llamadas, la segunda reinicia el contador y los módulos salen desordenados.
- ~~**El adaptador de Mongo no se ha ejecutado nunca contra una base de datos real.**~~ **Cerrado.**
  Hay un `docker-compose.yml` que levanta MongoDB en local y la batería entera pasa contra él
  (`MONGODB_URI=mongodb://localhost:27017 npm test` → 359 pruebas). La integración continua lo
  ejecuta en cada empujón, con el adaptador de memoria y contra Mongo. Ver `docs/infraestructura.md`.
- **`documentos.origen`** se rellena por omisión con `plantilla.origen`, el nombre del `.docx` de
  procedencia. Conviene confirmar que es lo que se quiere guardar ahí.
- **`motor/api/`** son las dos funciones serverless de la prueba de concepto. Vercel busca las
  funciones en `api/` de la raíz, así que **tal cual no se despliegan**. El E1 las sustituye por
  *route handlers* de Next, y es ahí donde va el `maxDuration` de 60 s que necesita la importación.

**Para el E4:**

- **Nada avisa de una situación de aprendizaje sin evaluación.** `render-generico.js` agrupa las
  fichas por `evaluacion || ''`, así que una ficha sin evaluación acaba en un grupo sin nombre en la
  tabla resumen del PDF, y lo único que lo insinúa es un «? evaluación» en la lista de la interfaz.
  Falta esa comprobación en el panel. Por eso `core/sa.js` recibe la evaluación por parámetro al
  crear una ficha vacía: el motor la deja vacía porque reconstruye lo que leyó de un Word y no debe
  inventar nada, y la interfaz pone «1ª» porque está creando una ficha nueva y dejarla vacía la
  mandaría a ese grupo sin nombre.

**Para el E6:**

- **`unidades` no tiene columna de orden.** El orden del documento es el de creación, y los
  adaptadores lo guardan en un campo interno que la lista blanca de `repositorio/index.js` no acepta.
  Reordenar los módulos, por tanto, **no se puede hacer hoy por la API del repositorio** sin borrar y
  recrear el documento. Cuando el E6 lo necesite, hay que añadir `orden` a `CAMPOS.unidad` y que los
  dos adaptadores lo respeten.

**Sobre la prueba de ida y vuelta, para quien la lea y piense que está mal hecha:**

- Compara **la definición de pdfmake, no los bytes del PDF**, y normaliza las funciones a su código
  fuente antes de comparar. No es un atajo: `buildDocDefinition` devuelve `header` y `footer` como
  cierres nuevos en cada llamada, y `deepStrictEqual` compara funciones por referencia, así que
  comparar sin normalizar fallaría siempre por algo que no depende de los datos. Reconstruye objetos
  en lugar de pasar por JSON para no perder las claves con valor `undefined` (`colSpan`, `rowSpan`,
  `pageBreak`, `watermark`), que son justo el tipo de diferencia que la prueba busca.
- Comprueba **dos cosas que parecen la misma y no lo son**: que el PDF sale idéntico, y que `datos`
  vuelve idéntico. Hace falta separarlas porque hay cambios que el PDF no nota —dejar el `_id` del
  repositorio dentro de un texto compartido, por ejemplo— y que sin embargo ensucian los datos.

### Lo que la herramienta ha encontrado en la programación de verdad

No son fallos del código: son cosas que llevan en el documento del departamento y que no se veían
porque nadie las podía mirar de golpe. Conviene arreglarlas en el documento.

- **Seis situaciones de aprendizaje seguidas numeradas «5»**, y en total **15 de las 78 fichas
  repetidas llegan con un número que no es su posición**. Una llega con el número **0**, y el
  generador la descarta de la tabla resumen **sin decir nada**: está en el documento, ocupa sus
  sesiones y no aparece en el recuento. Al guardar desde la aplicación se renumeran solas.
- **En «Diseño de interfaces web» hay un encabezado con dos fichas debajo** («Interfaces web con
  framework.»). El generador solo cuenta la primera, así que la segunda **se imprime pero no sale en
  la tabla resumen**. Se arregla separando el encabezado en dos; la aplicación lo acepta tal cual
  para que el apartado se pueda seguir guardando.
- **La evaluación está escrita de dos maneras**: «1º» en ocho fichas y «1ª» en las otras sesenta y
  ocho. Un desplegable con solo los tres valores buenos habría cambiado «2º» por «1ª» con solo abrir
  la ficha y guardarla, así que el editor ofrece además lo que la ficha ya trae. Unificarlo es una
  decisión del departamento, no algo que deba hacer una herramienta por su cuenta.
- **De los 34 avisos que imprime hoy el PDF, 22 no son errores**: son el otro convenio de
  ponderación de los criterios. Los otros **10 sí** lo son (14,94 % donde debería haber 15 %). El
  panel de validaciones los distingue, pero **qué convenio vale es una decisión del departamento** y
  sigue pendiente.

### Lo que ha dejado cargar los doce documentos reales

- **Faltaba una materia en el catálogo, y era del curso pasado.** La propuesta de Bachillerato de
  2025-26 trae «Primer curso – PRSI I», que no estaba en `core/unidades.js` porque el catálogo se
  extrajo de los documentos de 2026-27, donde primero ya es «Informática I». Se ha añadido marcada
  como `historica`: no sale en el árbol de un documento de hoy, pero la conciliación la encuentra,
  que es lo que hace falta para importar la propuesta del curso en que sí se daba.

  **Conviene confirmarlo con el departamento**: se ha supuesto que PRSI I es una materia propia del
  currículo viejo y no el nombre antiguo de Informática I, porque en 2026-27 conviven Informática I,
  Informática II y PRSI II —lo que parece una transición escalonada, no un renombrado—. Si fuera un
  renombrado, lo correcto sería quitar `bach-prsi1` y darle a `bach-inf1` un
  `titulos: { '2025-26': 'Primer curso – PRSI I' }`.
- **En la propuesta de ESO se pierde una materia al importar.** «Programación, Inteligencia
  Artificial y Robótica (2º y 3º ESO)» —la que lleva dentro PIAR I y PIAR II— no tiene la estructura
  que el importador espera de un bloque repetido, y se ignora con un aviso. Por eso entran 3 de las 4
  materias y solo un 73 % del texto, frente al 91 % de Bachillerato. El aviso se ve al importar y en
  la pantalla de subida, así que no se pierde en silencio, pero **está sin resolver**. Lo que se
  pierde con ella está medido: 8 tablas y 18 bloques de texto en la de 2025-26, 8 y 16 en la de
  2026-27, y 3 y 10 en la de Bachillerato de 2025-26 —que tiene el mismo problema con PRSI—. Ninguna
  de esas 19 tablas es de las que el importador reconoce por su cabecera: son rejillas de
  competencias, criterios y saberes básicos, que entran como tabla genérica.
- **Los recuentos de SMR entre cursos no cuadran** y puede que no sea un fallo: 2025-26 trae 57
  secciones y 222 apartados, y 2026-27, 56 y 212. Conviene mirar si el documento de este curso está a
  medias o si de verdad se quitó algo.

### Lo que ha dejado auditar lo que el importador no decía

Partida de un número que no cuadraba: en la PD de SMR de 2025-26, `clasificarTabla` reconoce **76**
fichas de situación de aprendizaje y en `datos` acababan **71**. El único aviso del informe hablaba de
la portada. En la base de datos, el módulo de Seguridad informática tenía **una** situación de
aprendizaje guardada y los demás módulos del mismo documento, entre cuatro y diez.

- **La pérdida era muda, y eso era lo primero que había que arreglar.** La plantilla se deduce
  fusionando las instancias y los datos se sacan sección por sección: son **dos recorridos del mismo
  árbol** y no tienen por qué cuadrar, así que hay sitios del documento por los que la extracción no
  pasa. Lo que quedaba ahí no se importaba y no se decía. El importador apunta ahora qué bloques del
  Word llegan a un campo y nombra los que no: cada tabla con su etiqueta, su tamaño, su cabecera y la
  ruta de títulos donde está, y el texto por los sitios en los que se queda
  (`informe.tablasSinCampo`, `informe.textosSinCampo` y un aviso más en `informe.avisos`).

  Es el patrón de `filasSinCampo` e `informeDeFilas` de `core/sa.js` **al nivel del documento**: allí
  son las filas de una ficha que no van a ningún campo de la ficha; aquí, los bloques del Word que no
  van a ningún campo de la plantilla. Y el motivo es el mismo: la lista de sitios por los que la
  extracción pasa siempre irá por detrás de lo que alguien escriba en su Word, así que lo que no
  puede pasar es que la pérdida sea muda. Un aviso no arregla el documento, pero lo pone donde se ve
  en abril y no en junio.

  Lo primero que encontró la auditoría no fueron las cinco fichas, sino la materia de las propuestas
  pedagógicas: 19 tablas y 56 bloques de texto en tres documentos (ver el punto de arriba). Ese aviso
  ya existía, pero decía qué apartado se ignoraba, no qué había dentro.

- **No era un diseño de ficha distinto: era un nivel de título mal puesto.** Las cinco fichas que
  faltaban son las situaciones 2 a 6 de Seguridad informática, y el módulo las escribe con un nivel
  de título **más bajo** que la situación 1: la 1 es un «Título 4» y las otras cinco, «Título 5». Word
  las mete DENTRO de la 1, el repetidor solo recogía los hijos directos del apartado y los
  subapartados de un ítem no se miraban, así que de las seis llegaba una. Eso explica también por qué
  la primera sí: es la única que estaba al nivel en el que se buscaba.

  Medido, porque la sospecha era otra: las **311** fichas que `clasificarTabla` reconoce en los doce
  documentos tienen **cuatro columnas**, las cinco que faltaban incluidas, y su forma —18×4— es la de
  248 de ellas y la misma que la de la situación 1 del mismo módulo. No hay dos diseños de ficha en
  juego aquí, y `COLUMNAS = 4` de `core/sa.js` sigue siendo la única maquetación.

- **La regla elegida: un ítem de una serie no contiene otro ítem de la misma serie.** Los ítems se
  recogen atravesando los ítems de esa misma serie, en el orden del documento. Se eligió esto, y no
  guardar esas tablas como tabla suelta, porque las cinco **son** fichas de situación de aprendizaje
  —el lector las entiende enteras, igual que la situación 1 de al lado— y guardarlas como otra cosa
  las dejaría fuera del resumen SA × RA, de la validación de sesiones y del editor de situaciones:
  estarían en la base de datos y seguirían sin ser lo que son. Lo que estaba mal no era la ficha, era
  el sitio donde el árbol la había puesto.

  Y se eligió esta regla, y no dar subapartados de verdad a los repetidores, porque esto corrige un
  nivel mal puesto **sin inventar estructura**: solo se atraviesan secciones que son de la serie, una
  sección que no lo es no se abre, y lo que queda fuera ya lo nombra el informe. Dar subapartados al
  repetidor cambiaría la plantilla de los cuatro documentos que tienen repetidores para resolver uno.

- **Qué cambia en los doce documentos.** Congeladas antes las huellas de `plantilla`, `datos` e
  `informe` (sin `plantilla.generada`): cambia **solo la PD de SMR de 2025-26**, y en ella solo se
  añade. Seguridad informática pasa de 1 a 6 situaciones, las 76 fichas del documento llegan a
  `datos`, y en la plantilla cambia un número: la presencia del campo de ficha del repetidor, de 70 a
  75. Los otros once salen byte a byte idénticos en `plantilla` y en `datos`; en los doce cambia
  `informe`, que es donde van los avisos nuevos.

### Lo que ha dejado el E7

- **Los dos PCCF no usan estilos de título, y aun así entran.** Sus apartados numerados están
  escritos con estilos propios que no declaran nivel de esquema, así que el importador no encontraba
  nada: el de SMR daba cero apartados y el de DAW, nueve colgando de la nada. La salida estaba dentro
  del propio documento: su **tabla de contenidos** sí dice cuál es la jerarquía, y las 22 entradas
  casan una a una con párrafos del cuerpo. Desde el E7 el importador recurre al índice cuando no
  encuentra ningún título de primer nivel, y entran con 22 y 31 apartados y el 98 % y el 99 % del
  texto.

  **Pero el documento sigue teniendo el problema**, y eso no lo arregla una herramienta: Word
  tampoco considera títulos esos apartados, así que su panel de navegación no los ve y el índice que
  llevan dentro está cacheado de cuando sí lo eran —hoy no se regeneraría igual—. Vale la pena
  aplicarles `Título 1/2/3` en el Word, por el documento mismo. Y mientras no se haga, lo que se
  importe depende de que ese índice esté al día: la aplicación lo avisa al importar.


- **La memoria sí entra**, y de verdad: 43 apartados, 34 tablas, el PDF y el Word salen, y la
  definición que da la base de datos es idéntica a la que da el importador sobre el mismo Word.
- **Las propuestas pedagógicas de ESO y Bachillerato se importan sorprendentemente bien** (27 y 24
  apartados, y sus materias concilian con el catálogo), pero **no tienen un tipo propio** y no son
  memorias. Darles uno parece poco trabajo para lo que se gana.
- **La programación real no se puede aprobar hoy, y es correcto**: once módulos sin docente asignado,
  doce ponderaciones descuadradas y veintidós avisos del convenio sin decidir. Los tres grupos se
  arreglan en sitios distintos y por personas distintas, así que el rechazo los cuenta por separado
  en vez de decir «45 errores». **Decidir el convenio ya no es solo una incomodidad del panel: es lo
  que impide aprobar el documento.**

### Lo que ha dejado el E5

- **Crear el curso siguiente dos veces a la vez no está protegido del todo.** Se comprueba antes de
  crear, pero no es atómico: dos jefaturas pulsando a la vez podrían crear dos documentos. El arreglo
  sería un índice único sobre `(tipo, ciclo, departamento, curso)` en Mongo, y **no se ha puesto a
  propósito**: `ciclo` y `curso` pueden ser nulos, y un índice único con nulos chocaría consigo
  mismo y bloquearía importaciones legítimas. Es una acción de una vez al año; si alguna vez molesta,
  ese es el arreglo y esa es la pega.
- **Al arrastrar el curso se copian los docentes de cada módulo y las asignaciones.** Lo normal es
  que sigan los mismos, pero un curso nuevo puede tener otro reparto: conviene que la jefatura lo
  revise en septiembre. Lo que no se copia son los comentarios ni el historial, cuando existan (E7).

### Lo que ha dejado el E1

- **El criterio de aceptación se cumple con el documento real**, no solo con uno sintético: se importa
  la PD de DAW por la ruta, se guarda, se vuelve a leer y se exporta, y la definición del PDF es
  idéntica a la que da el importador directamente, en borrador y en aprobado. Tarda 4,5–5,2 s y entran
  57 secciones, 11 unidades, 220 apartados y 12 textos compartidos.
- **El límite de 4,5 MB que Vercel pone al cuerpo de una petición está sin comprobar.** El `.docx` de
  la PD de DAW pesa 1,3 MB y cabe de sobra, pero no se ha verificado en un despliegue de verdad, y un
  documento más gordo —o un PCCF con imágenes— podría no entrar. Si pasa, la salida es subir el
  fichero a Vercel Blob y que la función lo lea de allí.
- **El despliegue tiene sus propios pasos y sus propias trampas**, y están en
  `docs/infraestructura.md`: qué montar, en qué orden, qué cuesta y qué no hace falta. Dos que
  conviene mirar pronto: el plan gratuito de Vercel es **solo para uso no comercial** con una
  definición amplia, y el plan gratuito de Atlas **no hace copias de seguridad**.
- **Hay dos formas de escribir el identificador de un usuario** y confundirlas niega permisos en
  silencio: el repositorio devuelve `_id`, y el motor y el mockup usan `id`. Se lee siempre con
  `core/permisos.js` → `idDeUsuario`, nunca con `usuario.id` a pelo. El fallo no daba ningún error:
  un docente simplemente no podía editar su propio módulo.
- **Las unidades sin docentes siguen sin poder editarse por nadie** salvo la jefatura, que es el aviso
  nº 2 de `interfaz-web.md` y lo que resuelve el E2. La importación las crea con `docentes: []`.

---

## 6. Cómo se trabaja

- **Un evolutivo a la vez**, y dentro de cada uno como mucho **dos tareas en paralelo**, siempre sobre
  piezas que no se tocan entre sí.
- **Cada tarea trae sus pruebas.** Las de lógica, con el adaptador de memoria y sin red. Una tarea sin
  pruebas no está terminada.
- **Revisión de todo lo que entregue un agente** antes de darlo por bueno, mirando el código y
  ejecutando las pruebas, no solo el resumen.
- **El castellano del repositorio se mantiene**: comentarios que explican el *por qué* y el problema
  que resolvía cada decisión, no lo que ya dice el código.

---

## 7. Lo que sigue sin decidir

Está recogido en [`mockup-v2/CAMBIOS.md`](mockup-v2/CAMBIOS.md) y no bloquea nada hasta su evolutivo:

- ~~**quién reparte las unidades**~~ **decidido en el E2**: la jefatura del departamento, que es quien
  reparte la carga, y el soporte. La jefatura de estudios no, por lo mismo que no edita nada: es
  quien aprueba. La regla está en `core/permisos.js` → `puedeRepartirUnidades`, con las demás;
- ~~**cómo entra el profesorado**~~ **decidido en el E2**: no se registra nadie. La jefatura da de
  alta con nombre, correo y rol, y la aplicación genera un enlace de un solo uso que se canjea por una
  sesión. Sin contraseñas que custodiar y sin depender de Google ni del directorio de la Conselleria.
  **Queda pendiente enviar el enlace por correo**: hoy el alta lo devuelve para que la jefatura lo
  copie, lo que hace falta es servicio de correo, remitente del centro y qué hacer cuando un envío
  falla;
- **si hace falta un modo de solo lectura** por apartado, para no tocar nada sin querer;
- **dónde se configuran las validaciones**: la propuesta es una tabla de reglas `{ activa, severidad }`
  por documento y curso que mantenga la jefatura de estudios. Es el E7, y es una decisión de quién
  manda sobre qué más que una pantalla que falte;
- **qué pasa con los documentos de cursos ya aprobados** cuando cambia la plantilla: E6;
- **los códigos de módulo** de DAW y SMR están puestos de memoria y hay que confirmarlos contra los
  reales decretos. No bloquea: el id interno no depende del código.

---

## Reparto de apartados comunes (R1)

Cada profesor edita su parte de la programación. Los **módulos** se reparten por unidad desde el E2. Los
**apartados comunes** (fuera de los módulos, `edita: 'jefe_departamento'`) tenían la regla
(`tieneApartadoAsignado`, `documento.asignaciones`) pero ninguna forma de darlos; R1 añade la ruta
`/api/documentos/[id]/asignaciones` (`docs/api.md`), la regla `puedeAsignarApartados` en
`core/permisos.js` —hoy igual que repartir unidades, y aparte por ser otra pregunta— y una sección en la
pantalla de Reparto.

- Se delega solo lo que edita la jefatura: lo demás ya se reparte por unidad o no es delegable.
- Las asignaciones **viajan al curso siguiente** (`arrastre.js`) y **se limpian al borrar** un apartado
  retirado con sus subapartados (`estructura.js`); retirar sin borrar las conserva por si se restaura.
  Las dos cosas están ahora cubiertas en `test/asignaciones.js`.
- Una persona dada de baja o trasladada sigue en la lista guardada pero no cuenta como quien lleva el
  apartado: se filtra al leer, como en las unidades.

La pantalla de Reparto lleva debajo de la matriz de módulos `app/_componentes/ApartadosComunes.js`: «Lo
que puedes editar» (módulos y apartados asignados a quien mira, o «todo» para la jefatura y el soporte, o
solo lectura para la jefatura de estudios; sale de `mios` en el GET, la pantalla no recalcula la regla) y
la matriz apartados × personas, con la misma forma de guardar que la de módulos (lista completa, casillas
con `aria-disabled` cuando no se puede asignar, 400 dicho como «no se ha guardado nada»).
