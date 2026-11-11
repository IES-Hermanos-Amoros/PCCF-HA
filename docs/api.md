# La API de la aplicación

El contrato entre el navegador y el servidor. Está aquí porque lo consumen varias piezas que se
construyen en evolutivos distintos (`docs/plan.md` §5) y conviene que no lo adivine cada una.

## Dos reglas de forma

**1. La lógica de cada ruta va en un módulo CommonJS; el fichero de la ruta es un envoltorio.**

```
app/_lib/rutas/documentos.js     CommonJS: la lógica, exportada con module.exports
app/api/documentos/route.js      ESM: tres líneas que reexportan GET/POST
```

No es gusto personal: el `package.json` de la raíz no lleva campo `type` (ver `docs/plan.md` §4), así
que node trata los `.js` como CommonJS y un fichero con `export async function GET` **no se puede
exigir desde una prueba**. Si la lógica viviera dentro del fichero de la ruta, la única forma de
probarla sería levantar el servidor, y las pruebas de este repositorio se ejecutan sin red y sin base
de datos. Con el envoltorio, `test/api.js` llama a la función directamente con un `Request` normal.

De paso sale gratis algo que viene bien: la lógica no sabe que está dentro de Next.

**2. Nadie devuelve el documento entero.**

`datos.json` pesa 2 MB. Se lee por ramas: el árbol es una cosa y el contenido de un apartado es otra.
Ninguna ruta manda `plantilla` ni `datos` completos al navegador.

## Quién pregunta

Toda ruta resuelve el usuario con `usuarioDeLaPeticion()` de `app/_lib/usuario.js` y comprueba los
permisos **en el servidor** con `core/permisos.js`. El cliente solo refleja el candado; no es quien
decide.

Sin persona reconocida se devuelve 401. Nunca hay un usuario por omisión con permisos.

**El profesorado no se registra: lo da de alta la jefatura.** Pide el nombre, el correo y el rol, y
recibe un enlace de un solo uso que esa persona canjea por una sesión. No hay contraseñas que
custodiar ni cuentas de terceros de las que depender. Los testigos se guardan **hasheados**, de modo
que ni una copia de seguridad de la base de datos lleva dentro llaves utilizables, y la cookie de
sesión es `HttpOnly`, para que ningún JavaScript de la página pueda leerla.

De momento **no se envía el correo**: el alta devuelve el enlace para que la jefatura lo copie y lo
mande por donde quiera. Es preferible a una pantalla que diga «te hemos enviado un correo» y no lo
envíe.

## Errores

Siempre JSON, con la misma forma: `{ "error": "<codigo>", "mensaje": "<en castellano, para leer>" }`.

| Estado | `error` | Cuándo |
|---|---|---|
| 400 | `peticion` | falta un parámetro, o el `.docx` no se puede leer |
| 401 | `sin_identificar` | no hay persona seleccionada |
| 403 | `sin_permiso` | la hay, pero no puede hacer eso |
| 404 | `no_encontrado` | el documento, el apartado o la unidad no existen, **o son de otro departamento** |
| 409 | `conflicto` | alguien ha escrito ese apartado desde que lo leíste (lleva además `esperado` y `actual`) |
| 409 | `con_errores` | se intenta **aprobar** un documento que tiene errores abiertos (lleva las cifras y dónde están) |
| 410 | `enlace_gastado` | un enlace de acceso ya usado, anulado o caducado (lleva `motivo`) |
| 500 | `error_interno` | lo demás |

**404 y no 403 cuando el documento es de otro departamento.** «No lo ve» es literalmente lo que dice
la regla de `core/permisos.js`, y un 403 confirmaría que ese documento existe. Así el reparto queda
sin zonas grises: **404 = no lo ves** —no existe, o no es tuyo: para ti es lo mismo— y **403 = lo ves
pero no puedes hacer eso**, que es lo que aparece con el PATCH del E3 y con aprobar en el E7. Si fuera
403, la interfaz tendría que distinguir dos casos que para quien mira la pantalla son uno.

**410 y no 409 cuando un enlace de acceso ya no sirve.** El 409 de este contrato significa otra cosa
—una escritura con la versión cambiada— y lleva `esperado` y `actual`. Un enlace gastado es un
`enlace_gastado` con un `motivo` (`usado`, `anulado` o `caducado`), porque las tres cosas se arreglan
de forma distinta y quien las lee necesita saber cuál es. Un testigo que no ha existido nunca es 404,
para no confirmar cuáles existieron.

**Dos códigos para el 409, porque son dos cosas distintas que se arreglan de dos maneras.** El
`conflicto` es de concurrencia: alguien ha escrito antes que tú y hay que recargar. El `con_errores`
es del estado del documento: la petición está bien escrita y llega en el momento bueno, lo que pasa es
que el documento no se puede aprobar todavía. No es un 400 —no falta ni sobra ningún parámetro— ni un
403 —quien lo pide es justo quien aprueba—, y 409 es literalmente lo que significa un 409: la petición
choca con el estado actual del recurso. La interfaz las distingue por el código y no por el texto.

**Un apartado de la plantilla que nadie ha escrito todavía responde 200**, con `existe: false` y
`valores: {}`. Es parte del documento y sale en el árbol, así que hay que poder abrirlo. El 404 queda
para lo que no está en la plantilla de ese documento, o para una unidad que no es suya.

## Rutas

El parámetro `unidad` es el **id estable** del catálogo (`core/unidades.js`), nunca un índice ni un
título. Omitirlo significa «apartado común del documento».

| Ruta | Qué hace | Evolutivo |
|---|---|---|
| `GET /api/salud` | con qué adaptador está arrancada y si responde | E0 |
| `POST /api/invitaciones` | alta: `{ nombre, email, rol }` → la persona y **el enlace** de acceso. La jefatura, en su departamento | E2 |
| `GET /api/acceso?t=` · `POST /api/acceso` | canjea el enlace y abre la sesión | E2 |
| `GET /api/sesion` · `DELETE /api/sesion` | quién soy · cerrar sesión (revoca, no solo borra la cookie) | E2 |
| `GET /api/personas` | el censo del departamento. Con correo y invitación pendiente solo para quien gestiona personas | E1·E2 |
| `PATCH /api/personas/[id]` | `{ nombre?, email?, rol?, activo? }`. El nombre y el correo se corrigen, también a uno mismo; el rol no. Nadie se sube de rango ni se da de baja a sí mismo | E2 |
| `POST /api/personas/[id]/invitacion` | otro enlace para quien perdió el suyo; anula el anterior | E2 |
| `GET /api/documentos` | lista, sin `plantilla` | E1 |
| `POST /api/documentos/importar` | `multipart`: `archivo`, `tipo`, `curso`, `departamento`, `ciclo` (obligatorio salvo para `memoria`) y `forzar` opcional. Importa, concilia unidades y guarda. `tipo` es `programacion_didactica`, `propuesta_pedagogica`, `memoria` o `pccf` (ver abajo). En la propuesta pedagógica el `ciclo` es el **ámbito**: `eso` o `bach`. La importan `admin` y `jefe_departamento`, y solo en su departamento | E1·E7 |
| `GET /api/documentos/[id]` | el documento sin `plantilla` | E1 |
| `GET /api/documentos/[id]/arbol` | el árbol de apartados y unidades, con el estado de cada nodo, el `origen` de cada apartado y el recuento `revision` (apartados, revisados, heredados y pendientes) | E1·E5 |
| `POST /api/documentos/[id]/siguiente-curso` | crea el documento del curso siguiente a partir de este. Cuerpo opcional `{ curso }`, por omisión el siguiente al suyo. Copia la plantilla, las unidades con sus docentes, los apartados con su contenido y los textos compartidos; todos los apartados nacen `heredado` y el documento, en `borrador`, con `anteriorId`. 201 con el documento nuevo. La jefatura de departamento y el soporte, en su departamento. 409 si ese curso ya existe | E5 |
| `GET /api/documentos/[id]/anterior/apartado?seccion=&unidad=` | el mismo apartado en el curso anterior, con la forma de `/apartado` y solo lectura. Si no hay curso anterior, o el apartado o el módulo no existían allí, responde 200 con `existe: false` y un `motivo`: `sin_curso_anterior`, `seccion_nueva`, `unidad_nueva` o `sin_contenido` | E5 |
| `POST /api/documentos/[id]/apartado/revisar?seccion=&unidad=` | da la rama por revisada: `origen: revisado`, con `revisadoPor` y `revisadoEn`. Cuerpo `{ esperaUpdatedAt }`. Quien puede editar la rama. 409 si cambió desde que se leyó | E5 |
| `GET /api/documentos/[id]/apartado?seccion=&unidad=` | una rama: `valores`, `origen`, `updatedAt`, si quien pregunta puede editarla, y además `campos` y `compartidos` (ver abajo) | E1 |
| `GET /api/documentos/[id]/pdf?estado=&unidad=` | el PDF. Sin `unidad`, el tomo completo | E1 |
| `GET /api/documentos/[id]/docx?estado=&unidad=` | lo mismo en Word | E1 |
| `GET /api/documentos/[id]/unidades` | el reparto: las unidades con sus docentes, las personas que pueden llevarlas y **cuántas unidades no tiene nadie** | E2 |
| `PUT /api/documentos/[id]/unidades/[unidad]/docentes` | cambia quién lleva esa unidad. Cuerpo: `{ docentes: [id] }`, la lista completa | E2 |
| `PATCH /api/documentos/[id]/apartado?seccion=&unidad=` | guarda esa rama. Cuerpo: `{ valores, esperaUpdatedAt }`, con **solo los campos que se han tocado**. Acepta texto, ponderaciones, fichas de situación de aprendizaje, **tablas** y **tablas de clave y valor** (ver «Tablas y campos creados en la aplicación»); los demás tipos todavía no. Devuelve 409 si no cuadra la versión. La lectura del mismo apartado trae además `iniciales`: con qué abrir cada campo de tabla que todavía no tiene valor | E3 |
| `GET /api/documentos/[id]/validaciones` | los avisos agrupados por unidad, con quién lleva cada una, el recuento y si el documento se puede aprobar. Mide con **las comprobaciones que tenga configuradas el documento** (`/comprobaciones`): lleva el `convenioCe` con el que ha contado los criterios y las `desactivadas`, porque un panel sin avisos porque todo está bien y uno sin avisos porque alguien apagó las comprobaciones son la misma pantalla y no son lo mismo | E4·E7 |
| `GET /api/documentos/[id]/coordinacion` | la matriz **unidad × bloque**: una fila por módulo o materia con quién lo lleva, una columna por bloque (que viaja **una vez**, no una por unidad) y en cada cruce cómo va esa rama: `estado` —los cinco del árbol, con `errores`— más los recuentos de los que sale (`apartados`, `conContenido`, `revisados`, `errores`, `avisos`) y el `destino` al que lleva el clic. **No lleva contenido**: ni un `valores`. El estado sale de lo que ya se sirve —`relleno` y `origen` de `/arbol`, y los avisos del MISMO cálculo que `/validaciones`, que viajan también como `cuenta` y `puedeAprobarse`—, así que no puede discrepar de ninguna de las dos. Un documento sin unidades responde `modo: 'comun'`: una fila por apartado de primer nivel y la jefatura del departamento como responsable. La ve quien ve el documento | E7 |
| `GET /api/documentos/[id]/comentarios?seccion=&unidad=` | el hilo de ese apartado, del más antiguo al más reciente, con el nombre y el rol de cada autor (nunca su correo) y `puedeComentar` | E7 |
| `POST /api/documentos/[id]/comentarios?seccion=&unidad=` | comenta ese apartado. Cuerpo `{ texto }`, recortado y de 2000 caracteres como máximo; el autor sale de la sesión y **nunca del cuerpo**. 201 con el comentario. **Comenta todo el que ve el documento**, no solo quien puede editarlo: quien pregunta es justamente quien no puede escribir ahí —la jefatura de estudios aprueba y no edita nada, y un docente necesita avisar en el módulo de otro—. Por eso las dos rutas del hilo **no dan 403**: 401 sin sesión, 404 si el documento, la sección o la unidad no son suyos (un apartado retirado tampoco lo es) y 400 si el enlace o el cuerpo están mal. Los comentarios **no se copian** al arrastrar el curso | E7 |
| `GET /api/documentos/[id]/estructura` | la estructura del documento tal como se puede cambiar: una fila por apartado con su id, su título, si es de la plantilla de las unidades y qué se le puede hacer (`puedeSubir`, `puedeBajar`, `admiteHijos`), más los **retirados** —que ya no salen en el árbol, y cada uno lleva `contenido`: cuántos apartados y cuántas filas (`filas`, `conContenido`, `unidadesConContenido`) se destruirían si se borrara—, la `plantillaVersion` y el registro de cambios. Cada apartado lleva sus `campos` (con `retirado`, `puedeRetirar` y `puedeRestaurar`) y `puedeAnadirCampo`; la respuesta trae además `tiposDeCampo` —**el catálogo de lo que se puede crear**, con nombre en castellano, parámetros con límites y la forma del valor—, `limites` y `camposRetirados`. La ve quien ve el documento; `puedeCambiar` dice si los botones van habilitados, porque **la estructura la cambian la jefatura del departamento y el soporte**: no quien escribe los apartados, y la jefatura de estudios tampoco | E6 |
| `POST /api/documentos/[id]/estructura/apartado` | añade un apartado. Cuerpo: `{ titulo, padre?, esperaPlantillaVersion? }`; sin `padre`, al final del documento. Nace con un campo de texto o con los que pida `campos: [{ tipo, … }]` (una tabla, por ejemplo), y con `edita` de la jefatura del departamento si no lo hereda de su bloque. 201 con el `seccion` que le toca **para siempre**. Los ocho cambios responden igual: la `plantillaVersion` nueva, el `cambio` que queda apuntado y `afectaUnidades` con `unidades`, porque un apartado de la plantilla de las unidades cambia los once módulos a la vez y la interfaz tiene que poder advertirlo | E6 |
| `PATCH /api/documentos/[id]/estructura/apartado?seccion=` | renombra un apartado. Cuerpo: `{ titulo, esperaPlantillaVersion? }`. **El id no cambia**: el título es solo la etiqueta, y el contenido, los comentarios y los enlaces guardados cuelgan del id | E6 |
| `POST /api/documentos/[id]/estructura/apartado/mover?seccion=` | lo mueve entre sus hermanos. Cuerpo: `{ delta, esperaPlantillaVersion? }`, `-1` arriba y `1` abajo, contando solo los hermanos visibles. Mover el primero hacia arriba es 400 y no un 200 que no hace nada | E6 |
| `POST /api/documentos/[id]/estructura/apartado/retirar?seccion=` | **retira sin borrar**: el apartado y su subárbol dejan de salir en el árbol, en el apartado y en el PDF, y su contenido se conserva entero. Por eso no es un `DELETE`. Cuerpo opcional `{ esperaPlantillaVersion }` | E6 |
| `POST /api/documentos/[id]/estructura/apartado/restaurar?seccion=` | devuelve al documento un apartado retirado, con todo lo que tenía escrito. Primero el padre, si también está retirado | E6 |
| `POST /api/documentos/[id]/estructura/apartado/campo?seccion=` | **añade un campo a un apartado que ya existe**, al final de los suyos. Cuerpo: `{ campo: { tipo, etiqueta?, … }, esperaPlantillaVersion? }`, con los datos que cada tipo declara en `tiposDeCampo` (para una tabla, `filas`, `columnas` y `cabecera`). 201 con `campos` —el campo tal como queda, con su `id` **para siempre** y su `valorInicial`— y la respuesta de siempre: `afectaUnidades` avisa de que en un apartado de módulo sale en los once. No hay campos que añadir a una lista de fichas | E6 |
| `POST /api/documentos/[id]/estructura/apartado/campo/retirar?seccion=&campo=` | **quita un campo sin borrarlo**: deja de verse, de imprimirse y de poder escribirse, y lo que había escrito se conserva. Solo los de los tipos que se pueden crear. Cuerpo opcional `{ esperaPlantillaVersion }` | E6 |
| `POST /api/documentos/[id]/estructura/apartado/campo/restaurar?seccion=&campo=` | lo devuelve a su apartado con todo lo que tenía escrito | E6 |
| `PATCH /api/documentos/[id]/estructura/apartado/campo?seccion=&campo=` | **renombra un campo**: cuerpo `{ etiqueta, esperaPlantillaVersion? }`. Cambia solo la etiqueta, nunca el id. 400 si está vacía o pasa de 100 caracteres | E6 |
| `POST /api/documentos/[id]/estructura/apartado/campo/mover?seccion=&campo=` | **sube o baja un campo** entre los vigentes de su apartado: cuerpo `{ delta: -1 \| 1, esperaPlantillaVersion? }`. Cambia el orden en que sale impreso. 400 si ya es el primero o el último | E6 |
| `DELETE /api/documentos/[id]/estructura/apartado?seccion=` | **borra de verdad un apartado que ya estaba retirado**, con todo su subárbol y todo lo escrito en él: destruye las filas de `apartados` de todos los apartados del subárbol y de todas las unidades (once en una sección de módulo) y el reparto guardado para ellos. **Es irreversible.** Solo se borra lo retirado: uno que no lo está es un 400 que dice que primero hay que retirarlo, y no cambia nada. Cuerpo opcional `{ esperaPlantillaVersion }`. Responde como los demás cambios, más `contenido` (`apartados`, `filas`, `conContenido` y `unidadesConContenido` de lo destruido) y `filasBorradas`. El cambio queda en el registro (`plantilla.cambios`, tipo `borrado`, con los ids que se fueron y cuánto se destruyó): es lo único que queda. Mismo permiso que el resto de cambios de estructura | E6 |
| `DELETE /api/documentos/[id]/estructura/apartado/campo?seccion=&campo=` | **borra de verdad un campo que ya estaba retirado** y le quita su clave a `valores` en todas las filas del apartado (las once, si es de módulos), de modo que un campo nuevo con el mismo id no recupera nada. Irreversible, solo lo retirado, y registrado como `campo_borrado`. Mismas reglas y respuesta que el borrado de un apartado | E6 |
| `GET /api/documentos/[id]/estado` | en qué estado está el documento, si su PDF lleva `marcaDeAgua` y las `transiciones` que salen de ahí, cada una con su `accion`, `quien` la mueve y un `puede` resuelto para quien pregunta. La ve quien ve el documento, y la lista es la misma para todos: lo que cambia es el `puede`, porque el cliente refleja el candado y no vuelve a escribir las reglas de rol. **No lleva la cuenta de errores**: está en `/validaciones`, que la pantalla de aprobación pide igualmente | E7 |
| `GET /api/documentos/[id]/comprobaciones` | **qué se le comprueba a este documento y con qué convenio.** Una fila por comprobación con su código, su título, su `clase` (`normativa` o `centro`), si es `fija` y **`porque` lo es**, lo que tiene puesto (`activa`, `severidad`), lo de serie (`severidadPorOmision`) y si el panel la busca de verdad hoy (`enElPanel`, con `motivo` cuando no). Lleva además el `convenioCe` del documento y los dos `convenios` con qué es cada uno, el registro de `cambios` —quién y cuándo— y el `updatedAt` con el que se escribe. La ve quien ve el documento; `puedeConfigurar` dice si los controles van habilitados | E7 |
| `PATCH /api/documentos/[id]/comprobaciones` | la cambia. Cuerpo **parcial**: `{ convenioCe?, reglas?, esperaUpdatedAt? }`, con `reglas` como `{ <codigo>: { activa?, severidad? } }`. **La configura la jefatura de estudios y el soporte** (ver abajo): 403 para quien ve el documento y no es quien aprueba. 400 si se pide desactivar o cambiar una de las dos **normativas** —con el motivo dentro—, si el código o la severidad no existen o si no se manda nada que cambiar; 409 `conflicto` si el documento ha cambiado desde que se leyó. 200 con la tabla entera y `aplicados`, lo que ha cambiado en esta petición; pedir lo que ya estaba es un 200 con `aplicados: []` que **no escribe ni deja fila en el historial** | E7 |
| `POST /api/documentos/[id]/estado` | cambia el estado. Cuerpo: `{ estado, esperaUpdatedAt? }`. 200 con el estado nuevo, el `anterior`, la `accion` y `marcaDeAgua`. **Solo las flechas del circuito**, y las mueve quien responde de cada tramo (ver abajo): 403 si no es quien la mueve, 400 si esa flecha no existe —con los `destinos` que sí— o si el documento ya está en ese estado, 409 `con_errores` al aprobar con errores abiertos y 409 `conflicto` si el documento ha cambiado desde que se leyó | E7 |

### Los estados del documento: `borrador → revisión → aprobado`

El estado es el circuito por el que pasa el documento del departamento, y cada tramo lo mueve quien
responde de él. `estado` ya era un campo del documento desde el E0 (`docs/plan.md` §3); el E7 pone la
puerta.

| Flecha | `accion` | Quién |
|---|---|---|
| `borrador → revision` | `enviar` | **la jefatura del departamento** y el soporte |
| `revision → borrador` | `devolver` | las dos jefaturas —la de estudios y la del departamento— y el soporte |
| `revision → aprobado` | `aprobar` | **la jefatura de estudios** y el soporte |
| `aprobado → revision` · `aprobado → borrador` | `reabrir` | la jefatura de estudios y el soporte |

**Manda a revisión la jefatura del departamento.** No el docente, por lo mismo que no cambia la
estructura: escribe lo suyo y no responde del documento entero, y «ya he acabado mi módulo» no es «la
programación está lista». Y no la jefatura de estudios, porque mandar a revisión es decir «esto ya se
puede mirar», y eso lo dice quien lo ha escrito, no quien lo va a mirar.

**Aprueba la jefatura de estudios**, que es lo que ya decía `core/permisos.js` desde el E2: ve los
documentos de todos los departamentos y no edita ninguno. Eso es lo que la deja en condiciones de
aprobar, y esta es la primera ruta en la que ese rol hace algo más que mirar.

**`borrador → aprobado` no existe para nadie**, tampoco para el soporte. Saltarse la revisión
convierte la aprobación en una firma sobre un documento que nadie de fuera del departamento ha
mirado, y entonces los tres estados sobran. Son dos llamadas.

**El estado no es un candado de escritura**: un documento aprobado se sigue pudiendo editar, y quién
puede editarlo lo sigue decidiendo `core/permisos.js`. Congelar lo aprobado sería otra decisión.

**Lo que no queda apuntado es quién aprobó y cuándo.** `CAMPOS.documento` de `repositorio/index.js`
acepta `estado` y no hay todavía la colección `historial` que `docs/plan.md` §3 reserva. Para el
criterio de aceptación basta; para justificar una aprobación en una inspección, no. El arreglo es un
campo más (`aprobadoPor`, `aprobadoEn`) o esa colección, y los dos están en `repositorio/`.

### Por qué un documento con errores no se puede aprobar, y qué dice el rechazo

La cuenta es la de `/validaciones` —el mismo cálculo, no otro— y la puerta es su `puedeAprobarse`:
con errores abiertos no se aprueba; los avisos no bloquean. Si la puerta contara por su cuenta, la
pantalla podría decir «se puede aprobar» y el botón responder que no.

Y el rechazo **no es un «no se puede» a secas**, porque eso no sería ni útil ni del todo cierto. El
409 `con_errores` lleva:

```
errores      45   todos los que bloquean
porArreglar  23   los que hay que arreglar
delConvenio  22   los que son una decisión pendiente, no un documento roto
porRegla          el desglose por regla, que es lo que dice qué hacer con cada uno
donde             por módulo: el título, las dos cifras y el `destino` al que hay que ir
```

Las cifras son las de la programación real del departamento. De sus 45 errores, **22 no son erratas**:
son el otro convenio de ponderación de los criterios —suman 100 % dentro de su RA en lugar de repartir
su peso— y **qué convenio vale es una decisión del departamento que sigue pendiente** (`docs/plan.md`,
«Lo que ha dejado el E0»). Con la regla tal cual ese documento no se puede aprobar hasta que alguien
decida, y eso es incómodo y es correcto: **la salida no es bajarle la severidad**, que sería decidir el
convenio por la puerta de atrás y en silencio. La salida es que el rechazo separe los dos grupos, y es
lo que hace.

El desglose de esos 45, que es lo que de verdad dice qué hay que hacer: `sin_docente` 11 (módulos que
no lleva nadie, se arreglan en el reparto), `criterios_de_ra` 10 y `suma_de_ra` 2 (descuadres de
verdad, en el apartado de ponderaciones) y `cien_dentro_del_ra` 22 (la decisión pendiente). Son tres
cosas distintas, en tres pantallas distintas y de tres personas distintas, y por eso el rechazo no da
un solo número.

### Qué comprobaciones se le aplican a un documento, y quién lo decide

Hasta el E7 las comprobaciones estaban escritas a mano y no se podían tocar desde ninguna parte, y
eso dejó de ser una incomodidad del panel: **la programación de DAW no se puede aprobar**, con 45
errores de los que 11 son módulos sin docente, 12 son ponderaciones descuadradas de verdad y **22 no
son errores** sino el otro convenio de ponderación de los criterios.

Lo que se configura son **dos cosas distintas**, y confundirlas sería el error:

**1. El convenio de ponderación de los criterios** (`convenioCe`). No es activar ni desactivar una
regla: es decir **cuál de los dos convenios legítimos** usa el centro —`peso_del_ra`, los criterios
suman el peso de su RA, o `peso_del_ra_o_cien`, que acepta además que sumen 100 % dentro del RA—. Con
el laxo esos 22 avisos dejan de salir porque **son correctos**, no porque se hayan silenciado. Es la
diferencia entre decidir y tapar, y por eso viaja aparte de la tabla de reglas y con la explicación
de qué es cada uno: elegir entre dos reglas legítimas no es marcar una casilla.

**2. Las comprobaciones de criterio del centro**, con `{ activa, severidad }`: `sin_docente`,
`ra_sin_situacion`, `sa_sin_evaluacion`, `apartado_vacio`, `heredado_sin_revisar` y
`copia_desactualizada`. Son criterio del centro, así que el centro las decide: apagar una la quita
del panel, y bajarle la severidad a `aviso` hace que **deje de impedir la aprobación**.

**Las dos normativas no se tocan.** `criterios_de_ra` y `suma_de_ra` salen del real decreto del
título, no del criterio del centro: ni se desactivan ni se les baja la severidad, y pedirlo es un 400
con el motivo. Lo que sí se decide sobre la segunda es el **convenio**, que es el punto 1: cambiar el
convenio no es bajarle la severidad a la regla. La negativa está en dos capas, no solo en la ruta: si
alguien mete a mano en la base de datos una normativa apagada, el cálculo la vuelve a encender.

**La cambia la jefatura de estudios**, que es quien aprueba, y el soporte (`core/permisos.js` →
`puedeConfigurarComprobaciones`). Cambiar esto **mueve el listón** de lo que se puede aprobar, así que
lo decide quien decide si se ha superado; si lo configurara el departamento, la puerta de aprobación
la abriría quien quiere pasar por ella. Es la primera vez que la jefatura de estudios escribe algo, y
no contradice que no edite nada: no toca el contenido, decide con qué se mide. El resto la ve en modo
lectura.

**Se guarda en el documento** (`documentos.comprobaciones`). La aprobación es por documento, y una
memoria no tiene las mismas comprobaciones aplicables que una programación. **El arrastre al curso
siguiente se la lleva**: el criterio del centro no se reinicia cada septiembre, y si no viajara, un
documento que el curso pasado se podía aprobar aparecería en septiembre con avisos nuevos sin que
nadie hubiera cambiado nada.

**Queda constancia de quién y cuándo**, dentro del propio campo, que es el precedente de
`plantilla.cambios` del E6: el registro viaja con lo que se copia, así que el curso nuevo nace
sabiendo con qué criterio se mide y quién lo decidió. Una entrada por cosa cambiada, con el instante,
el id, y el nombre y el rol **de ese momento** —tomados de la sesión y nunca del cuerpo—, y de qué a
qué. Lo que se guarda es solo lo que **se aparta de lo de serie**, así que un documento que nadie ha
configurado no tiene el campo y se comporta exactamente como antes del E7.

**El generador usa el mismo convenio que el panel**, y no es un detalle: el criterio de aceptación
del E4 es que los avisos del panel coincidan uno a uno con los de la cajita roja del PDF, así que
`/pdf` lo lee del documento igual que `/validaciones`. Lo que **no** cambia el PDF es apagar una
comprobación de criterio del centro o bajarle la severidad: la cajita roja solo imprime las dos
normativas. En la PD real, cambiar al convenio laxo baja los errores de **45 a 23** —11 módulos sin
docente, 10 criterios descuadrados y 2 sumas de RA— y los avisos impresos de 34 a 12, los mismos en
el panel y en el papel.

**Tres comprobaciones se pueden configurar y hoy no cambian nada**: `apartado_vacio`,
`heredado_sin_revisar` y `copia_desactualizada` existen en `core/validaciones.js` y el panel no las
busca todavía. No se calla: cada fila lo dice con `enElPanel: false` y un `motivo`, porque una casilla
que no hace nada tiene que decir que no hace nada.

`estado` **en la URL de `/pdf` y `/docx` es otra escala**: es cómo se imprime el tomo, y solo tiene
dos valores, `borrador` (con marca de agua) o `aprobado`. Por omisión, el del documento, y un documento
en revisión se imprime como borrador, que es exacto: no está aprobado. Por eso `?estado=revision` es un
400. En Word el estado se valida pero no cambia nada, porque la marca de agua es una propiedad de
página de pdfmake y `motor/exportar-docx.js` no escribe ninguna.

## Tablas y campos creados en la aplicación

Un campo de tabla puede crearse y guardarse aquí; antes solo existía si venía de un Word. La forma de
cada tipo es la que ya pinta el generador (`motor/render-generico.js`), y la decide
`core/estructurados.js` —la puerta— y `core/campos.js` —el catálogo—, no la ruta, para que el editor y
el servidor no puedan tener ideas distintas de qué es una tabla válida.

| Tipo | Nombre | Valor que se guarda |
|---|---|---|
| `texto_largo` | Texto | la lista de bloques de siempre |
| `tabla` | Tabla | `{ filas: [[celda, …], …] }`, con la celda `{ text, colspan?, rowspan?, bold?, fondo? }` y **ninguna clave más** |
| `tabla_clave_valor` | Clave y valor | `{ pares: [{ etiqueta, valor }] }`: dos columnas, la de la izquierda a 150 pt |

Qué hay que saber para escribir un editor sin adivinar:

- **Fondo de la celda.** `fondo` es un **nombre**, no un color: `'cabecera'` (azul claro, `#D9E2F3`),
  `'etiqueta'` (gris, `#F2F2F2`) o `'ninguno'` (sin fondo); cualquier otro valor se rechaza y el motivo
  dice cuáles valen. Con la clave presente manda ella, esté la celda en negrita o no y en la fila que
  esté. **Sin la clave, el fondo lo decide la negrita**, como siempre: negrita en la primera fila cuando
  es cabecera, azul; negrita en cualquier otro sitio, gris; sin negrita, sin fondo. Esa ausencia es la
  que tienen todas las celdas importadas de un Word (el importador no escribe nunca `fondo`), así que
  el PDF y el Word de lo guardado y de lo importado siguen siendo el mismo. Se eligen nombres y no colores
  para que los documentos sigan pareciendo del centro y para que el PDF y el Word pinten lo mismo con la
  misma paleta. `fondo` no cambia qué es la cabecera ni el `headerRows` de la tabla: eso lo sigue
  decidiendo la negrita de la primera fila. Quién gana lo decide `Core.estructurados.fondoDeCelda`,
  que devuelve el NOMBRE del fondo: la consultan el PDF, el Word y el editor, cada uno con su
  sintaxis de color, para que la pantalla no pueda pintar una tabla distinta de la que se imprime.
- **Cabecera.** La primera fila es la cabecera si todas sus celdas van en `bold: true`. Que además
  salga azul es cosa del fondo, que está arriba: aquí solo se decide QUÉ fila es la cabecera, o sea
  cuál se repite al cambiar de página y cuenta como `headerRows`. En una tabla creada en la
  aplicación (la que lleva `inicial`) es el único criterio, en el PDF y en el Word: poner o quitar la
  cabecera es poner o quitar la negrita de la primera fila, y la puerta no exige nada. Su `columnas`
  se guarda como el que deja el importador pero el generador no lo lee. En una importada, el PDF sigue
  decidiéndolo por `columnas`.
- **Alineación y tamaño de letra de la celda.** `alineacion` es `'izquierda'`, `'centro'` o `'derecha'`;
  `tamano` es `'pequena'`, `'normal'` o `'grande'`. Son **nombres** y no valores concretos por lo mismo
  que `fondo`: el PDF los quiere en puntos y en `alignment` y el Word en medios puntos y en `w:jc`, así
  que el nombre es el contrato y cada motor lo traduce (8 pt / 12 pt en el PDF, 16 / 24 medios puntos en
  el Word: el mismo tamaño en las dos salidas). Quién gana lo deciden
  `Core.estructurados.alineacionDeCelda` y `Core.estructurados.tamanoDeCelda`, que los consultan el PDF,
  el Word y el editor. Las dos devuelven `null` tanto **sin la clave como con el valor por omisión**
  (`'izquierda'`, `'normal'`), y entonces el motor no escribe nada: una celda con
  `alineacion: 'izquierda'` y una celda sin la clave dan la misma salida, así que no hay dos maneras de
  decir lo mismo. A diferencia de `fondo`, aquí no hay un valor que anule nada —no se deducen de la
  negrita ni de ninguna otra cosa—, así que no existe un «ninguno». El editor, cuando se elige el valor
  por omisión, **borra la clave** en lugar de guardarla.
- **Anchos de columna.** `anchos` es hermano de `filas` en el valor de la tabla, no de la celda: una
  lista de **proporciones** (pesos relativos, números positivos finitos), una por columna de la
  cuadrícula. Proporciones y no puntos ni centímetros porque pdfmake reparte sobre el ancho útil de la
  hoja y el Word sobre el de la tabla en dxa: un peso relativo le sirve a los dos. Se rechaza lo que no
  sea una lista, lo que no tenga un peso por columna (el motivo dice los dos números) y cualquier peso
  que no sea un número positivo finito. **Sin `anchos`** cada columna sigue midiendo lo que diga su
  cantidad de texto, que es como salen todas las tablas importadas. En el PDF, un `widths` que pase el
  llamador (el resumen de SA, las ponderaciones) manda sobre `anchos` del valor, que a su vez manda
  sobre el cálculo por texto.
- **Las filas tienen que cuadrar.** Todas, del mismo ancho contando las casillas que vienen combinadas
  desde arriba. El generador rellena sin avisar lo que falta y sale una tabla torcida, así que se
  rechaza y el motivo dice qué fila sobra o falta. Una tabla importada que **ya venía** torcida se puede
  corregir celda a celda mientras no cambie de forma. Máximo 12 columnas, 200 filas y 100 pares.
- **Una tabla vacía se guarda** (`{ filas: [] }`, `{ pares: [] }`) y se imprime como «(tabla vacía)»;
  un campo sin valor, que es como nace uno nuevo, no imprime nada. Los campos de tabla sin valor se
  abren con `iniciales` de la lectura del apartado (o `Core.campos.valorInicial(campo)`); un `null`
  importado se trata igual que «sin valor».
- **Clave y valor importada.** El importador deja `pares` **y** `filas`. Se edita mandando solo
  `pares` (`Core.campos.sinFilas`): con las dos, el PDF imprimiría una y el Word la otra, y la
  puerta lo rechaza.
- **El `id` de un campo no cambia ni se reutiliza**, como el de un apartado: el contenido se guarda
  por campo. **Quitar un campo no lo borra**: se queda con `retirado: true`, lo escrito se conserva y
  se puede restaurar. El curso siguiente no arrastra los campos retirados, igual que los apartados.

Errores propios de estas rutas, además de los de arriba:

| Estado | `error` | Cuándo |
|---|---|---|
| 400 | `peticion` | falta `campo` o `campo` no es un objeto; el tipo no se puede crear; un dato fuera de rango (`filas`, `columnas`…) o que ese tipo no admite; el apartado es una lista de fichas; el campo no se puede quitar (tabla de RA y CE, ponderaciones…), ya está retirado o no lo está al restaurar; el apartado ya tiene 20 campos. El `mensaje` dice qué |
| 400 | `peticion` | al guardar una tabla: filas que no cuadran, celdas con claves de más, marcas de Word, más de 12 columnas, `pares` y `filas` a la vez. Lleva `campo` y `motivo`, y no se escribe nada |
| 403 | `sin_permiso` | quien pregunta no es la jefatura del departamento ni el soporte |
| 404 | `no_encontrado` | el apartado o el campo no existen en este documento |
| 409 | `conflicto` | la `esperaPlantillaVersion` ya no es la actual, o alguien ha cambiado el documento a la vez |

## Por qué el apartado viaja con sus `campos` y sus `compartidos`

Porque ninguna ruta manda la plantilla, y sin ella `valores` es un objeto de ids a valores que el
cliente no sabe pintar: no conoce la etiqueta de cada campo, ni su tipo, ni en qué orden van. Así que
cada apartado lleva **los campos de la plantilla para esa rama**, que son cuatro o cinco, en lugar de
obligar al navegador a descargarse las 57 secciones para leer una.

Y lleva los **textos compartidos a los que apunta ese apartado**, porque un bloque `{ ref: 'c001' }`
sin el texto al que apunta es un hueco en la pantalla. Solo los suyos, no los del documento.

## Corregir una errata en el alta

El nombre y el correo de alguien ya dado de alta se pueden cambiar. No es un detalle: antes no se
podía, y una letra mal obligaba a darlo de baja y crearlo otra vez —con otro identificador—, con lo
que se perdían sus asignaciones. Corregirse el **nombre** a uno mismo sí se puede, porque arreglar
una errata no es ascenderse; el **rol**, no.

**Cambiar el correo anula los enlaces de acceso sin usar.** Si la dirección estaba mal, el enlace del
alta pudo mandarse a otro buzón, y un enlace es la llave de esa persona durante siete días. Al
corregir la dirección se retira la llave y la respuesta avisa de que hay que mandar otra. Las
sesiones abiertas no se tocan: guardan el identificador de la persona, no su correo.

## Por qué el reparto se manda entero y no «añade a este»

`PUT .../docentes` recibe **la lista completa** de quién lleva esa unidad, no una operación
incremental. Con «añadir» y «quitar», dos jefaturas repartiendo a la vez acaban con un reparto que no
quiso ninguna de las dos y que nadie ve raro al mirarlo. Mandando la lista entera, la última en
guardar impone un reparto que alguien eligió de principio a fin.

Y se valida antes de escribir: cada persona de la lista tiene que existir, estar activa, ser del
departamento del documento y dar clase. Si una sola no vale, **no se guarda ninguna** —ni las buenas—
y la respuesta dice cuáles fallan. Un docente fantasma en la lista es una unidad que parece repartida
y no lo está, que es peor que una vacía: la vacía se ve en el recuento.

El recuento de **unidades que no tiene nadie** viaja ya hecho, porque es la única pregunta que de
verdad se le hace a esa pantalla. «Qué lleva Pau» se ve mirando; «qué módulo no puede tocar nadie»,
no.

## Qué pasa si la importación no reconoce un módulo

No importa a medias y no adivina. Si `core/conciliar.js` deja alguna unidad sin resolver, la
respuesta es **400** y lleva, además del `error` y el `mensaje` de siempre, un `sinResolver` con el
título de cada módulo que no ha reconocido y el motivo. **No se escribe nada**: ni documento, ni
unidades, ni apartados.

Con `forzar=1` importa igualmente, derivando el id del título, y la respuesta dice **cuáles** se han
importado así. Es una decisión de quien sube el fichero, tomada a la vista de la lista, y no un
comportamiento por omisión: un id adivinado no se nota al importar, se nota un curso después, cuando
se pierden las asignaciones de ese módulo (`docs/plan.md` §2.1).

Con el documento real no salta: los 11 módulos de la PD de DAW concilian por su título exacto del
curso.

Y si una escritura falla a mitad, el documento ya creado se borra antes de devolver el error, para no
dejar documentos a medio importar en la lista.

## Qué tipos de documento se admiten

Se admiten **`programacion_didactica`, `propuesta_pedagogica`, `memoria` y `pccf`**: los cuatro
documentos del departamento. Lo que da 400 es un Word del que no sale ni un apartado, sea del tipo que
sea.

Hasta el E7 solo entraba la PD, a propósito: el importador leía los otros dos, pero su camino hasta
el PDF no estaba probado y era mejor negarse que guardar un documento que luego se exporta mal. El E7
lo prueba con los documentos reales del departamento, y lo que se mide es esto:

| Documento | Apartados | Unidades | Del texto del cuerpo | ¿Entra? |
|---|---|---|---|---|
| Memoria del departamento 2026-27 | 43 | 0 | 96 % | **sí** |
| Memoria del departamento 2025-26 | 43 | 0 | 96 % | **sí** |
| PCCF de DAW | 31 | 0 | 99 % | **sí** |
| PCCF de SMR | 22 | 0 | 98 % | **sí** |
| Propuesta pedagógica de ESO 2025-26 | 27 | 3 materias | — | **sí** |
| Propuesta pedagógica de ESO 2026-27 | 27 | 3 materias | — | **sí** |
| Propuesta pedagógica de Bachillerato 2025-26 | 21 | 2 materias | — | **sí, con `forzar`** |
| Propuesta pedagógica de Bachillerato 2026-27 | 24 | 3 materias | — | **sí** |
| PD de DAW 2026-27 (referencia) | 57 | 11 módulos | — | sí |

La columna de unidades dice **módulos** en la PD y **materias** en la propuesta pedagógica: son la
misma cosa del modelo (una fila de `unidades`, un id estable del catálogo, un reparto al
profesorado), con el nombre que le da cada etapa.

**La memoria entra entera.** 43 apartados, 34 tablas, ninguna unidad, y pasa el criterio del E1: la
definición de pdfmake que da la base de datos es **idéntica** a la que da el importador sobre el mismo
Word. El Word exportado vuelve a entrar por el importador con los mismos 43 apartados.

**El PCCF entra desde que el importador lee el índice del documento.** Antes no entraba: los dos PCCF
tienen sus apartados numerados escritos con estilos propios del documento (`Estilo1`, `Estilo3`,
`Estilo4`) que no llevan nivel de esquema, así que **Word tampoco los considera títulos** y el
importador se quedaba con 9 apartados en el de DAW —nueve `Título 4` y `Título 5` colgando de la
nada— y 0 en el de SMR. Pero los dos llevan dentro su propia tabla de contenidos, y ahí sí está la
estructura: cuando la deducción por estilos se queda sin primer nivel, el importador busca el índice
y de él saca qué estilos llevan los títulos y a qué nivel (`motor/importar-docx.js`, «respaldo: el
índice del documento»). En los dos documentos las **22 entradas del índice casan con un párrafo del
cuerpo** y los tres estilos se usan en exclusiva para esos títulos, así que la jerarquía sale entera
—6 apartados, 13 subapartados y 3 de tercer nivel— y con ella el 98 % y el 99 % del texto. El PCCF de
SMR se imprime en 20 páginas y el de DAW en 35, y el Word exportado vuelve a entrar por el importador
con los mismos apartados.

**Lo que no se hace es adivinar.** El respaldo solo se dispara si la deducción normal se ha quedado
sin un solo título de primer nivel —así no puede cambiar el resultado de un documento que ya entraba
bien—, si una proporción alta de las entradas del índice casa con el cuerpo, y si los estilos que
descubre se usan en exclusiva para esos títulos. Un índice que quedó de otra versión del documento no
casa y entonces no se deduce nada; un estilo que también se usa para texto corriente no se toma por
título. Y si de un Word no sale ni un apartado, **sigue dando 400 con lo que hay que arreglar y
dónde**: se arregla en Word, aplicando Título 1/2/3 a los apartados o poniendo el índice al día. No se
baja el umbral ni se deduce la estructura del tamaño de la letra: una estructura adivinada no se nota
al importar, se nota en junio al exportar.

**La propuesta pedagógica de ESO y Bachillerato entra, y se llama así porque es lo que lleva escrito
la portada.** Son cuatro documentos —ESO y Bachillerato, de los dos cursos— y se importaban bien
desde antes de tener un tipo propio: lo único que les faltaba era el tipo (`docs/plan.md`, «lo que ha
dejado el E7»). El prototipo los registra como `tipo: 'pd'` con `rama: 'eso-bach'`
(`docs/mockup-v2/js/estructura.js`), pero ahí `'pd'` cubre también los dos ciclos de FP y lo que de
verdad separa un documento de otro es el `ambito` (`eso` | `bach`). De ese vocabulario se toma justo
eso —el ámbito, que aquí viaja en `ciclo`— y la palabra con la que el prototipo llama a sus
unidades: **materias**.

Sus materias concilian por el **título exacto del curso**, con confianza alta, y con una excepción:
la propuesta de Bachillerato de 2025-26 trae «Primer curso – PRSI I», que **no está en
`core/unidades.js`** —el catálogo se extrajo de los documentos de 2026-27, donde la materia de
primero ya se llama «Informática I», y de PRSI solo quedó `bach-prsi2`—. Sin `forzar` esa
importación da 400 con la lista, que es lo que tiene que hacer: el arreglo es del catálogo, no de la
importación.

Y hay una pérdida que el importador **avisa** y conviene conocer: en la propuesta de ESO, la materia
«Programación, Inteligencia Artificial y Robótica (2º y 3º ESO)» no tiene la estructura de las
demás —lleva dentro dos bloques propios, PIAR I y PIAR II, que el catálogo modela como unidades
hijas— y el importador la ignora con un aviso en lugar de adivinar su forma. Lo mismo pasa con el
bloque padre «Programación, redes y sistemas informáticos (PRSI)» de Bachillerato 2025-26, cuyos dos
cursos sí entran, y con «Organización de los dos cursos» de Bachillerato 2026-27. El aviso viaja en
`resumen.avisos` y la pantalla de subida lo enseña: no se guarda nada en silencio.

**Las unidades son de la PD y de la propuesta.** Un PCCF es del ciclo y una memoria, del departamento
entero: ninguno repite un bloque por unidad, y los tres documentos reales dan **cero instancias**. Así
que las unidades —y con ellas la conciliación, el reparto al profesorado y el arrastre de
asignaciones— no aplican ahí: el documento entra como un solo tomo de apartados comunes. Y si el
importador **sí** encuentra un bloque repetido en un documento de uno de esos dos tipos, la respuesta
es 400 con la lista de lo que ha visto, sin escribir nada. Por dos motivos, y el primero es el que
pasa de verdad: es el error más probable de quien sube el fichero —dejarse el tipo sin cambiar—, y
una programación importada como memoria se guardaría sin protestar, con sus once módulos conciliados,
mientras la memoria de verdad se queda sin subir. El segundo es que conciliar contra el catálogo de
módulos algo que no son módulos sería adivinar, y aquí no se adivina.

**Qué comprobaciones no aplican a una memoria.** Todas las que son de un módulo: `criterios_de_ra` y
`suma_de_ra` necesitan un campo de ponderaciones, que una memoria no tiene; `ra_sin_situacion` y
`sa_sin_evaluacion` necesitan fichas de situación de aprendizaje; y `sin_docente` necesita unidades.
Así que `/validaciones` sale con un solo grupo —el de los apartados comunes— y sin un solo aviso. No
es «aprobada a la fuerza»: es que no hay nada que comprobar, y por eso una memoria se puede aprobar
en cuanto el departamento la da por buena.

**Y qué no aplica a una propuesta pedagógica.** Las cuatro que hablan de resultados de aprendizaje,
porque las situaciones de aprendizaje de ESO y Bachillerato **no van por resultados de aprendizaje
sino por competencias específicas** (`docs/mockup-v2/README.md`). Pero no hay nada que apagar por
tipo: las cuatro se disparan solas cuando encuentran el campo del que viven, y en los cuatro
documentos reales ese campo no existe —ni un `ponderacion_ra_ce`, ni un
`ficha_situacion_aprendizaje`, ni un `auto.tabla_ra_ce`: las tablas de los decretos de ESO y
Bachillerato entran como tablas—. Así que el panel de una propuesta sale con lo único que sí aplica,
`sin_docente`, una vez por materia: una materia sin profesorado es el mismo problema que un módulo
sin profesorado. Apagar las reglas por tipo convertiría en silencio el día en que una propuesta
trajera una tabla de ponderaciones, que es justo lo que habría que mirar.

## Por qué la importación exige el ciclo (y por qué a la memoria no)

Ni `ciclo` ni `curso` se pueden deducir de un `.docx`, así que los pide el formulario de subida. Pero
el `ciclo` además hace falta para **conciliar** las unidades: el Word identifica cada módulo solo por
su título, y hay títulos que se repiten entre ciclos —«Sostenibilidad aplicada al sistema
productivo» está igual en DAW y en SMR—, así que sin saber de qué ciclo es el documento esos dos
módulos son ambiguos y `core/conciliar.js` los deja sin resolver antes que adivinar.

Y el `curso` hace falta porque los títulos cambian de un curso a otro: el catálogo guarda la variante
de cada curso para poder reconocer un módulo renombrado y no perder sus asignaciones cada septiembre.
Es el motivo de que exista el id estable (`docs/plan.md` §2.1).

**A la propuesta pedagógica sí, y en `ciclo` va un ámbito: `eso` o `bach`.** ESO y Bachillerato no son
ciclos formativos, pero este campo no es «de qué ciclo de FP es»: es «entre qué unidades del catálogo
hay que buscar». `core/conciliar.js` lo usa así desde que existe —filtra por `u.ciclo === ciclo ||
u.ambito === ciclo`— y el desplegable de la pantalla de subida ya ofrecía ESO y Bachillerato al lado
de DAW y SMR por ese mismo motivo. Y hace falta de verdad: la propuesta de ESO y la de Bachillerato
son **dos documentos del mismo tipo**, el Word no dice de qué etapa es ninguno, y sin el ámbito las
materias de una se buscarían también entre las de la otra.

**A la memoria no se le pide el ciclo.** Es del departamento entero —ESO, Bachillerato y los dos
ciclos de FP en el mismo documento—, así que exigirle uno sería obligar a quien la sube a elegir uno
de mentira, y de paso etiquetar la memoria del departamento como si fuera de DAW. El modelo ya admite
`ciclo` nulo desde el E0 (`docs/plan.md` §3) y no hay nada que conciliar, porque una memoria no tiene
módulos. Si llega con ciclo, se guarda: quien lo mande no se lleva un error por mandarlo. El `curso`
sigue siendo obligatorio para todos, que es lo que distingue la memoria de un curso de la del
siguiente.

## Por qué `esperaUpdatedAt`

Es la versión del apartado que tenía el cliente cuando lo leyó. Si no coincide con la guardada, el
servidor **no escribe nada** y devuelve 409. Sin eso, dos docentes —o dos pestañas de la misma
persona— editando el mismo apartado pierden uno de los dos trabajos sin que nadie se entere, que es
el peor fallo posible en una herramienta donde la gente escribe su programación. Lo resuelve
`repositorio/`, que ya lo trae hecho y probado.

## Versiones del documento

El porqué, en `docs/plan.md` §8. Lo que cambia en la API:

**`POST /api/documentos/importar`** responde además `alternativa` (booleano) y `version` (número). Si
ya existe un documento con el mismo tipo, curso, ciclo y departamento, lo subido se guarda como
versión alternativa (`activa: false` en el documento) y el existente no se toca; si no, nace activo.

**`GET /api/documentos`** lista solo la versión activa de cada documento. El documento lleva `activa`,
`version` y `subidoPor` cuando los tiene (ausentes, es la versión activa y la 1).

**409 `version_alternativa`**: se intenta escribir en una versión alternativa (cualquier petición que
no sea `GET` sobre ella, incluido `siguiente-curso`) o exportarla (`/pdf`, `/docx`). Lleva
`documentoId`. Se arregla activándola primero. Es distinto del `conflicto` de concurrencia, y la
interfaz los separa por el código.

**`POST /api/documentos/importar`** guarda además el `.docx` subido como copia de seguridad de esa
versión y lo dice en `resumen.copia`. **`GET /api/documentos/[id]/copia`** lo devuelve tal como se
subió (`attachment`, con el número de versión en el nombre). Lo descarga quien ve el documento, sea la
versión activa o una alternativa; 404 si esa versión no tiene copia (los documentos anteriores a las
versiones no la tienen) o es de otro departamento.
