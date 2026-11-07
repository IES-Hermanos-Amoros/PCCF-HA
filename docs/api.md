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
| `PATCH /api/personas/[id]` | `{ rol?, activo? }`. Nadie se sube de rango ni se da de baja a sí mismo | E2 |
| `POST /api/personas/[id]/invitacion` | otro enlace para quien perdió el suyo; anula el anterior | E2 |
| `GET /api/documentos` | lista, sin `plantilla` | E1 |
| `POST /api/documentos/importar` | `multipart`: `archivo`, `tipo`, `ciclo`, `curso`, `departamento`, y `forzar` opcional. Importa, concilia unidades y guarda. La importan `admin` y `jefe_departamento`, y solo en su departamento | E1 |
| `GET /api/documentos/[id]` | el documento sin `plantilla` | E1 |
| `GET /api/documentos/[id]/arbol` | el árbol de apartados y unidades, con el estado de cada nodo | E1 |
| `GET /api/documentos/[id]/apartado?seccion=&unidad=` | una rama: `valores`, `origen`, `updatedAt`, si quien pregunta puede editarla, y además `campos` y `compartidos` (ver abajo) | E1 |
| `GET /api/documentos/[id]/pdf?estado=&unidad=` | el PDF. Sin `unidad`, el tomo completo | E1 |
| `GET /api/documentos/[id]/docx?estado=&unidad=` | lo mismo en Word | E1 |
| `GET /api/documentos/[id]/unidades` | el reparto: las unidades con sus docentes, las personas que pueden llevarlas y **cuántas unidades no tiene nadie** | E2 |
| `PUT /api/documentos/[id]/unidades/[unidad]/docentes` | cambia quién lleva esa unidad. Cuerpo: `{ docentes: [id] }`, la lista completa | E2 |
| `PATCH /api/documentos/[id]/apartado?seccion=&unidad=` | guarda esa rama. Cuerpo: `{ valores, esperaUpdatedAt }`. Devuelve 409 si no cuadra la versión | E3 |
| `GET /api/documentos/[id]/validaciones` | los avisos, agrupados por unidad | E4 |

`estado` es `borrador` (con marca de agua) o `aprobado`. Por omisión, el del documento.

## Por qué el apartado viaja con sus `campos` y sus `compartidos`

Porque ninguna ruta manda la plantilla, y sin ella `valores` es un objeto de ids a valores que el
cliente no sabe pintar: no conoce la etiqueta de cada campo, ni su tipo, ni en qué orden van. Así que
cada apartado lleva **los campos de la plantilla para esa rama**, que son cuatro o cinco, en lugar de
obligar al navegador a descargarse las 57 secciones para leer una.

Y lleva los **textos compartidos a los que apunta ese apartado**, porque un bloque `{ ref: 'c001' }`
sin el texto al que apunta es un hueco en la pantalla. Solo los suyos, no los del documento.

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

**De momento solo se admite `tipo=programacion_didactica`.** El PCCF y la memoria dan 400 hasta el
E7: el importador los lee, pero su camino hasta el PDF no está probado, y es mejor negarse que
guardar un documento que luego se exporta mal.

## Por qué la importación exige el ciclo

Ni `ciclo` ni `curso` se pueden deducir de un `.docx`, así que los pide el formulario de subida. Pero
el `ciclo` además hace falta para **conciliar** las unidades: el Word identifica cada módulo solo por
su título, y hay títulos que se repiten entre ciclos —«Sostenibilidad aplicada al sistema
productivo» está igual en DAW y en SMR—, así que sin saber de qué ciclo es el documento esos dos
módulos son ambiguos y `core/conciliar.js` los deja sin resolver antes que adivinar.

Y el `curso` hace falta porque los títulos cambian de un curso a otro: el catálogo guarda la variante
de cada curso para poder reconocer un módulo renombrado y no perder sus asignaciones cada septiembre.
Es el motivo de que exista el id estable (`docs/plan.md` §2.1).

## Por qué `esperaUpdatedAt`

Es la versión del apartado que tenía el cliente cuando lo leyó. Si no coincide con la guardada, el
servidor **no escribe nada** y devuelve 409. Sin eso, dos docentes —o dos pestañas de la misma
persona— editando el mismo apartado pierden uno de los dos trabajos sin que nadie se entere, que es
el peor fallo posible en una herramienta donde la gente escribe su programación. Lo resuelve
`repositorio/`, que ya lo trae hecho y probado.
