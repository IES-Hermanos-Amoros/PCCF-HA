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
permisos **en el servidor** con `core/permisos.js`, aunque el usuario del E1 salga de un desplegable y
no de una sesión. El cliente solo refleja el candado; no es quien decide.

Sin persona reconocida se devuelve 401. Nunca hay un usuario por omisión con permisos.

## Errores

Siempre JSON, con la misma forma: `{ "error": "<codigo>", "mensaje": "<en castellano, para leer>" }`.

| Estado | `error` | Cuándo |
|---|---|---|
| 400 | `peticion` | falta un parámetro, o el `.docx` no se puede leer |
| 401 | `sin_identificar` | no hay persona seleccionada |
| 403 | `sin_permiso` | la hay, pero no puede hacer eso |
| 404 | `no_encontrado` | el documento, el apartado o la unidad no existen, **o son de otro departamento** |
| 409 | `conflicto` | alguien ha escrito ese apartado desde que lo leíste (lleva además `esperado` y `actual`) |
| 500 | `error_interno` | lo demás |

**404 y no 403 cuando el documento es de otro departamento.** «No lo ve» es literalmente lo que dice
la regla de `core/permisos.js`, y un 403 confirmaría que ese documento existe. Así el reparto queda
sin zonas grises: **404 = no lo ves** —no existe, o no es tuyo: para ti es lo mismo— y **403 = lo ves
pero no puedes hacer eso**, que es lo que aparece con el PATCH del E3 y con aprobar en el E7. Si fuera
403, la interfaz tendría que distinguir dos casos que para quien mira la pantalla son uno.

**`GET /api/personas` es la única excepción al 401.** Es la lista del desplegable con el que se elige
quién eres, así que exigirle la cookie que ella misma sirve para poner dejaría la aplicación sin
puerta de entrada. Por eso tampoco devuelve el correo: una lista que se sirve sin identificar es una
lista pública. Desaparece en el E2, cuando haya sesión de verdad.

**Un apartado de la plantilla que nadie ha escrito todavía responde 200**, con `existe: false` y
`valores: {}`. Es parte del documento y sale en el árbol, así que hay que poder abrirlo. El 404 queda
para lo que no está en la plantilla de ese documento, o para una unidad que no es suya.

## Rutas

El parámetro `unidad` es el **id estable** del catálogo (`core/unidades.js`), nunca un índice ni un
título. Omitirlo significa «apartado común del documento».

| Ruta | Qué hace | Evolutivo |
|---|---|---|
| `GET /api/salud` | con qué adaptador está arrancada y si responde | E0 |
| `GET /api/personas` | las personas entre las que se elige, mientras no haya sesión | E1 |
| `GET /api/documentos` | lista, sin `plantilla` | E1 |
| `POST /api/documentos/importar` | `multipart`: `archivo`, `tipo`, `ciclo`, `curso`, `departamento`, y `forzar` opcional. Importa, concilia unidades y guarda. La importan `admin` y `jefe_departamento`, y solo en su departamento | E1 |
| `GET /api/documentos/[id]` | el documento sin `plantilla` | E1 |
| `GET /api/documentos/[id]/arbol` | el árbol de apartados y unidades, con el estado de cada nodo | E1 |
| `GET /api/documentos/[id]/apartado?seccion=&unidad=` | una rama: `valores`, `origen`, `updatedAt`, si quien pregunta puede editarla, y además `campos` y `compartidos` (ver abajo) | E1 |
| `GET /api/documentos/[id]/pdf?estado=&unidad=` | el PDF. Sin `unidad`, el tomo completo | E1 |
| `GET /api/documentos/[id]/docx?estado=&unidad=` | lo mismo en Word | E1 |
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
