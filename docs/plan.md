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
| **E7** | Panel de coordinación, comentarios por apartado, estados `borrador → revisión → aprobado` con la marca de agua, y PCCF y memoria | Aprobar quita la marca de agua y los errores lo impiden. El PCCF y la memoria se importan y exportan por el mismo camino que la PD |

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
- **El adaptador de Mongo no se ha ejecutado nunca contra una base de datos real.** Está escrito con
  cuidado y la batería de pruebas está lista para ejecutarse contra él (`MONGODB_URI=… node
  test/repositorio.js`), pero hasta que eso pase no cuenta como probado. Es el primer riesgo del E1.
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

### Lo que ha dejado el E1

- **El criterio de aceptación se cumple con el documento real**, no solo con uno sintético: se importa
  la PD de DAW por la ruta, se guarda, se vuelve a leer y se exporta, y la definición del PDF es
  idéntica a la que da el importador directamente, en borrador y en aprobado. Tarda 4,5–5,2 s y entran
  57 secciones, 11 unidades, 220 apartados y 12 textos compartidos.
- **El límite de 4,5 MB que Vercel pone al cuerpo de una petición está sin comprobar.** El `.docx` de
  la PD de DAW pesa 1,3 MB y cabe de sobra, pero no se ha verificado en un despliegue de verdad, y un
  documento más gordo —o un PCCF con imágenes— podría no entrar. Si pasa, la salida es subir el
  fichero a Vercel Blob y que la función lo lea de allí.
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

- **quién reparte las unidades** (hoy el panel es solo para soporte): se decide al empezar el E2;
- **si hace falta un modo de solo lectura** por apartado, para no tocar nada sin querer;
- **dónde se configuran las validaciones**: la propuesta es una tabla de reglas `{ activa, severidad }`
  por documento y curso que mantenga la jefatura de estudios. Es el E7, y es una decisión de quién
  manda sobre qué más que una pantalla que falte;
- **qué pasa con los documentos de cursos ya aprobados** cuando cambia la plantilla: E6;
- **los códigos de módulo** de DAW y SMR están puestos de memoria y hay que confirmarlos contra los
  reales decretos. No bloquea: el id interno no depende del código.
