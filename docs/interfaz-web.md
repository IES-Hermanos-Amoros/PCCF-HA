# Interfaz web: edición de documentos importados

Propuesta de interfaz como paso intermedio entre la **importación** de un `.docx` y la **exportación** a PDF:

1. el usuario importa el Word;
2. se detecta la estructura (ya lo hace `lib/importar-docx.js`);
3. se carga una web con las secciones de forma intuitiva para editarlas;
4. los cambios se guardan en MongoDB (el JSON que ya produce el importador);
5. un botón de exportación genera el PDF con los cambios (con `lib/render-generico.js`, que ya funciona);
6. la web está protegida por roles (admin, jefe de estudios, jefe de departamento, docente) con menús tipo `Programación didáctica | PCCF | Memoria` y submenús `Partes comunes → Introducción → Contextualización …` / `Módulos → Bases de datos …`.

Despliegue previsto (del README raíz): Next.js en Vercel con MongoDB Atlas.

---

## 1. Lo que ya existe y se reutiliza

La PoC contiene el motor; la interfaz solo tiene que consumirlo. **No reimplementar nada de esto en la web.**

| Activo | Archivo | Uso en la UI |
|---|---|---|
| Árbol de secciones (57 secciones, bloque "Módulos" con 11 instancias, 11 tipos de campo) | `out/importado/plantilla.json` | **Es el menú**: no se hardcodea "PD → Partes comunes → Introducción", se genera del árbol |
| Datos por sección y módulo | `out/importado/datos.json` (2 MB) | Estado editable, tal cual, en Mongo (ya es JSON) |
| Permisos por rol | `lib/permisos.js` | `puedeVer`, `puedeEditar`, `puedeEditarCompartido`, `puedeDesvincular`: única fuente de verdad, en servidor |
| Textos compartidos con versión | `lib/compartidos.js` | Editar una vez para todos los módulos, desvincular, avisar de desactualizados |
| Render genérico del PDF | `lib/render-generico.js` | Botón de exportar, sin cambios |
| Importación serverless | `api/importar.js` | `POST /api/importar` ya funciona |
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
- `usuarios.rol`: `admin`, `jefe_estudios`, `jefe_departamento`, `docente` (mismos valores que espera `lib/permisos.js`).

### 2.2 API (route handlers de Next.js sobre `lib/`)

| Endpoint | Qué hace | Reutiliza |
|---|---|---|
| `POST /api/documentos/importar` | `.docx` → `importarDocx` → crea documento + instancias | `api/importar.js` |
| `GET /api/documentos/[id]/arbol` | plantilla + resumen de estado por nodo | `plantilla.json` |
| `GET /api/documentos/[id]/ruta/<seccion>?instancia=n` | lee una rama | `datos` |
| `PATCH /api/documentos/[id]/ruta/<seccion>?instancia=n` | guarda **solo esa rama** | `datos` |
| `POST /api/documentos/[id]/compartidos/[cid]` | `editarCompartido` | `lib/compartidos.js` |
| `POST /api/documentos/[id]/compartidos/[cid]/desvincular` | `desvincular` | `lib/compartidos.js` |
| `GET /api/documentos/[id]/validaciones` | avisos de RA/CE/SA | `lib/validaciones.js` (a extraer) |
| `GET /api/documentos/[id]/pdf?estado=&tomo=` | PDF con cambios | `buildDocDefinition` + `resolverCompartidos` |

- **Toda** comprobación de rol se hace en servidor con `lib/permisos.js`; el cliente solo lo refleja (candado, botón deshabilitado).
- Importación: 3,7–5,7 s ⇒ asignar `maxDuration` en `vercel.json` (ya se hace para `api/pd.js`). El `.docx` de 1,3 MB cabe en el límite de 4,5 MB de Vercel.
- Auth: Auth.js (credentials u OAuth) con sesión; el usuario de `permisos.js` sale de la sesión (`{ id, rol, departamento }`).
- Guardar el Word original (Vercel Blob o Mongo) para poder reimportar/comparar; `.gitignore` ya excluye `entrada/`.

### 2.3 Fidelidad del ida y vuelta (riesgo nº 1)

El PDF solo sale bien si el editor escribe **exactamente** el formato que espera el renderer:

- texto: bloques `{ type: 'p', text }` y `{ type: 'list', items: [{ text, level }] }` — no HTML arbitrario;
- tablas: celdas `{ text, colspan, rowspan, bold }` y las celdas cubiertas **omitidas** (las reconstruye `rejilla()`).

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

1. **Camino redundante**: `lib/pd-docdef.js` + `data/pd.json` + `tools/word_a_json.py` es un segundo generador paralelo. Unificar todo en el genérico (`render-generico.js`), o la app tendrá dos formas de pintar la misma PD.
2. **`instancias[].docentes` llega vacío** del importador ⇒ `puedeEditar` (`docentes_del_modulo`) devuelve false para todos: hay que poder asignar docentes a módulos desde la UI (lo hace el jefe de departamento) antes de que cualquiera edite un módulo.
3. **Campos ausentes** (`presencia < nº de módulos`) no se pintan en el PDF: mostrarlos como "vacío" en la UI para que se puedan añadir.
4. **Tamaño**: 2 MB de datos y 243 tablas; en Mongo partir por instancia (§2.1) y no mandar `datos` completo al cliente (cargar por rama bajo demanda).
5. **Importación serverless**: 5,4 s es justo para el límite por defecto; subir `maxDuration` y mostrar progreso en la UI.
