# Prueba de concepto: importar Word y generar PD en PDF (serverless)

Comprueba dos cosas antes de construir la aplicación:

1. **Generar una programación didáctica en PDF sin navegador ni binarios** (sin Puppeteer ni LaTeX), con portada, índice con números de página, tablas con cabecera repetida, marca de agua de borrador y comprobaciones automáticas. Todo con `pdfmake` (JavaScript puro), de modo que funciona como función serverless en Vercel.
2. **Importar un Word existente sin volver a teclearlo**: a partir del `.docx` de la PD se deduce la *plantilla* (secciones, bloques que se repiten por módulo, tipo de cada tabla) y se extraen los *datos* que la rellenan, sin IA.

El repositorio no incluye documentos reales: cada uno usa sus propios Word.

## Carpetas

| Carpeta | Contenido | En git |
|---|---|---|
| `entrada/` | Aquí se dejan los Word de partida (PD del ciclo, PCCF) | No (solo la carpeta) |
| `data/` | `pd.json`: datos de un módulo extraídos del Word | No |
| `out/` | PDF, JSON e informes generados | No |
| `lib/` | Importador, textos compartidos, permisos, generadores de PDF y fuentes | Sí |
| `api/` | Funciones serverless para Vercel | Sí |
| `scripts/` | Scripts de línea de órdenes y pruebas | Sí |
| `tools/` | Extractor en Python para la PD de un módulo | Sí |

## Instalación

```bash
npm install
```

## 1. Importador genérico de Word

`lib/importar-docx.js` lee el DOCX (mammoth + node-html-parser) y en una sola pasada deduce:

- la **plantilla**: árbol de secciones a partir de los estilos de título, el bloque que se repite por módulo (fusiona "Módulos del primer curso" y "del segundo curso"), los elementos repetidos (situaciones de aprendizaje) y el tipo de campo de cada tabla según su cabecera;
- los **datos**: el contenido de cada módulo colocado en los campos de esa plantilla, con las tablas conocidas (RA y CE, ponderaciones, fichas de situación de aprendizaje, ficha del módulo) convertidas a valores estructurados.

`lib/render-generico.js` pinta cualquier plantilla deducida con sus datos.

**Entrada:** el Word de la PD del ciclo en `entrada/`, por ejemplo `entrada/PD_DAW.docx`.

```bash
node scripts/importar.js entrada/PD_DAW.docx --instancia "Programación"   # PD de un módulo
node scripts/importar.js entrada/PD_DAW.docx --tomo                       # todos los módulos
node scripts/importar.js entrada/PD_DAW.docx --tomo --aprobado            # sin marca de agua
node scripts/importar.js entrada/PD_DAW.docx --tomo --umbral 2            # comparte textos repetidos en 2 o más módulos
```

**Salida** en `out/importado/`:

- `plantilla.json`: estructura deducida;
- `datos.json`: contenido extraído;
- `informe.md`: secciones, tipos de campo, quién edita cada apartado, módulos detectados, qué secciones faltan en cada módulo y textos compartidos;
- el PDF del módulo o del tomo.

### Textos compartidos

Muchos párrafos se repiten de un módulo a otro (criterios de recuperación, módulo pendiente, relación con otros módulos…). `lib/compartidos.js` los guarda **una sola vez** en `datos.compartidos` y en cada módulo deja una referencia `{ "ref": "c001" }`. Se comparte un párrafo o una lista cuando:

- aparece idéntico en 3 o más módulos (se cambia con `--umbral`), o
- un módulo copia literalmente un texto de la parte común.

Cada texto compartido tiene un responsable (por defecto el jefe de departamento) y un modo:

- **sugerido** (por defecto): el docente puede *desvincularlo* y quedarse una copia propia editable; si el original cambia después, se le avisa;
- **obligatorio**: el docente no puede cambiarlo.

Al editar un texto compartido cambian todos los módulos que siguen vinculados. El generador de PDF resuelve las referencias, así que el documento sale igual que el Word original.

### Permisos

La plantilla deducida marca quién edita cada apartado: los comunes, `jefe_departamento`; el bloque de módulos, `docentes_del_modulo`. Cada módulo lleva su lista de `docentes` y `datos.asignaciones` permite dar un apartado común a un docente concreto. `lib/permisos.js` decide con esa información:

| Rol | Ve | Edita |
|---|---|---|
| `admin` | Todo | Todo |
| `jefe_estudios` | Documentos de todos los departamentos, en cualquier estado | Nada |
| `jefe_departamento` | Documentos de su departamento | Apartados comunes, textos compartidos y los módulos que tenga asignados |
| `docente` | Documentos de su departamento | Sus módulos (incluido desvincular textos sugeridos) y los apartados comunes que se le asignen |

Todavía no hay usuarios ni interfaz: las funciones `puedeVer`, `puedeEditar`, `puedeEditarCompartido` y `puedeDesvincular` son las que usará la aplicación.

### Pruebas

```bash
npm test                                              # textos compartidos, permisos y texto con formato, con datos inventados
node scripts/test-compartidos.js entrada/PD_DAW.docx  # además, con un Word real: el contenido resuelto es idéntico al original
```

### Como función HTTP

Para probarlo igual que en Vercel (`POST /api/importar`):

```bash
node scripts/test-api-importar.js entrada/PD_DAW.docx
```

## 2. PD de un módulo a partir de datos estructurados

`lib/pd-docdef.js` genera la PD de un módulo desde `data/pd.json`. Calcula la tabla resumen de situaciones de aprendizaje y las sumas de ponderaciones, y avisa si no cuadran (suma de RA distinta de 100 %, CE de un RA que no suman su peso, RA sin situación de aprendizaje).

**Entrada:** el Word de la PD del ciclo y el del PCCF en `entrada/`. El extractor de Python crea `data/pd.json` con el módulo indicado (los RA dualizados se leen del PCCF). Está pensado para el formato de PD del departamento.

```bash
python -I tools/word_a_json.py entrada/PD_DAW.docx "entrada/PCCF DAW.docx" "Programación" data/pd.json
npm run pdf              # borrador, con marca de agua
npm run pdf:aprobado     # sin marca de agua
```

**Salida:** `out/PD_<ciclo>_<código>_<módulo>[_borrador].pdf`.

Como función HTTP:

```bash
npm run serve                 # http://localhost:3999/api/pd?estado=borrador
node scripts/test-api.js      # guarda out/api_borrador.pdf y out/api_aprobado.pdf
```

## Despliegue en Vercel

`api/pd.js` y `api/importar.js` son funciones serverless. Basta con ejecutar `vercel` en esta carpeta. No hay dependencias nativas: solo `pdfmake`, `mammoth` y `node-html-parser`. `api/pd.js` necesita que exista `data/pd.json` al desplegar.

## Resultados obtenidos (octubre de 2026)

Con la PD completa de DAW del curso 2026-27 (1,3 MB, 333 títulos, 243 tablas, 11 módulos):

| Aspecto | Resultado |
|---|---|
| Plantilla deducida | 57 secciones, bloque "Módulos" con 11 instancias, 11 tipos de campo |
| Importación | 3,7 a 5,7 s |
| PDF de un módulo | 0,7 s, unas 50 páginas con las secciones comunes del ciclo |
| Tomo completo | 2,2 s, 266 páginas |
| PD de un módulo desde `data/pd.json` | 0,3 a 0,5 s, 27 páginas, 285 KB |
| Textos compartidos | 12 (párrafos o listas repetidos en 3 a 10 módulos), sobre todo en evaluación, recuperación y módulo pendiente |
