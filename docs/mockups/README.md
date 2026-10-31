# Mockup de la interfaz de edición

Prototipo visual (HTML + CSS + JS puro, **sin dependencias**) de la aplicación descrita en
[`../interfaz-web.md`](../interfaz-web.md): el paso intermedio entre importar el Word y exportar el PDF.

## Cómo abrirlo

Doble clic en `index.html` (la portada de departamentos) o en `dashboard.html` (el editor); no
necesitan servidor ni `npm install`.

```
mockups/
  index.html    portada: una tarjeta por departamento (solo INFORMATICA enlaza al editor)
  dashboard.html  estructura de la pantalla: barra superior + sidebar + contenido
  css/styles.css  diseño (tema claro y oscuro)
  js/data.js      árbol REAL de los documentos de ../entrada_ej/
  js/app.js       render del menú, permisos, vistas y contenido de muestra
```

## El menú

Se genera del árbol de datos, igual que lo hará la app a partir de `plantilla.json`:

```
Curso (2025-26 | 2026-27)                    ← selector de la barra superior
├── MEMORIA                                  ← 1 documento por curso, sin nivel ni ciclo
│     Profesorado del departamento · Docencia en ESO y Bachillerato · …
├── PCCF                                     ← sin nivel intermedio: va directo a los ciclos
│   ├── SMR / DAW
│   │     0. Introducción · 1. Identificación · 2. Acuerdos generales (2.1…2.13) · …
│   │     (sin desglose por módulos)
└── PD
    ├── FP
    │   └── SMR / DAW
    │         1. Introducción · 2. Competencias · … · 8. Evaluación de la práctica docente
    │         9. MÓDULOS DEL PRIMER CURSO →  [Montaje y Mantenimiento… | Programación | …]
    │         10. MÓDULOS DEL SEGUNDO CURSO → [Sistemas operativos en red | …]
    │         11. Resultados de aprendizaje dualizables
    │         dentro de cada módulo: Propuestas de mejora → Desarrollo curricular →
    │         Metodología específica → Situaciones de aprendizaje → Evaluación → Ponderaciones
    └── ESO-BACH
        ├── ESO
        │     1. Contexto curricular de las materias (Elementos curriculares ·
        │         Metodología · Evaluación del alumnado · Transversales · Inclusión)
        │     2. CCM  ← "Concreción curricular de las materias": sus 4 materias
        │         Taller de Relaciones Digitales Saludables (1º ESO) ·
        │         Programación, Inteligencia Artificial y Robótica (2º y 3º ESO) ·
        │         Digitalización (4º ESO) · Taller de Profundización en Desarrollo de Videojuegos (4º ESO)
        └── Bachillerato
              1. Elementos curriculares · 2. Metodología · 3. Evaluación del alumnado ·
              4. Elementos transversales · 5. Medidas de respuesta para la inclusión
              6. CCM → Organización de los dos cursos (fiel al documento) +
                  Primer curso – Informática I · Segundo curso – Informática II · Segundo curso – PRSI II
              7. Evaluación de la práctica docente
```

- **CCM** es la abreviatura que se muestra en el menú; la cabecera y las migas llevan el título
  completo (*Concreción curricular de las materias*).
- Las **materias** de ESO y Bachillerato ocupan el mismo sitio que los **módulos** de FP: se editan
  con el mismo mecanismo (`edita` por "docentes de la materia"), solo que aquí ningún docente del
  mockup las tiene asignadas.
- Los apartados de FP salen de los `.docx` de FP que había en `../entrada_ej/` (extraídos con
  mammoth y el importador de `poc-pdfmake/`); los de ESO y Bachillerato, de las *Propuestas
  Pedagógicas* añadidas en `../entrada_ej/2026-27/`. De esos dos documentos solo se han copiado
  **títulos de apartados y de materias**: nada de texto de cuerpo ni datos del profesorado
  (información confidencial). Para 2025-26 se replica la misma estructura, porque de ese curso no
  hay documentos.

## Qué se puede probar

| Zona | Comportamiento |
|---|---|
| **Selector de curso** | 2025-26 / 2026-27: cambia los módulos y nombres reales de cada curso |
| **Vistas** | *Navegación* (solo lectura) · *Edición* (toolbar + bloques editables + autoguardado simulado) · *Validaciones* (comprobaciones del documento). La vista *Edición* y el botón **Editar** de la cabecera solo se activan donde el rol puede editar; si no, el botón *Edición* queda **deshabilitado** y el botón *Editar* **oculto** |
| **Rol** | Admin / Jefe de estudios / Jefe de departamento / **Docente DAW y RL** / **Docente Mixto**: recalcula los permisos al momento (candados en el árbol, botones ocultos/desactivados) — la lógica imita a `poc-pdfmake/lib/permisos.js`. *Docente DAW y RL* edita **Despliegue de aplicaciones web** (DAW) y **Redes Locales** (SMR). *Docente Mixto* edita **Lenguaje de Marcas y Sistemas de Gestión de Información** (DAW 1º), **Seguridad informática** (SMR 2º), los bloques **PIAR I** y **PIAR II** (solo sus Situaciones de aprendizaje y Desarrollo de criterios; el resto de la materia PIAR queda en solo lectura), **Digitalización (4º ESO)** y **PRSI II (2º Bach)** |
| **Panel de permisos** | Botón **Permisos** de la barra superior, **solo visible para Admin**: tabla con un perfil por fila y, para los perfiles de docente, un **multiselector** (checkboxes agrupados por FP · SMR / FP · DAW / ESO / Bachillerato) de las unidades con permiso de edición. Los cambios se guardan en `localStorage` (`pccf-ha-perfiles`), se reflejan en el árbol al momento y hay botón *Restablecer valores por defecto*. Admin / Jefe de departamento / Jefe de estudios son filas fijas ("Todos" / "Solo lectura") |
| **Árbol** | acordeón con transición, buscador que filtra y abre las ramas, punto de estado por nodo (relleno / avisos / vacío / solo lectura), badge `com.` en los textos compartidos |
| **Contenido** | párrafos editables, tablas RA/CE, **ponderaciones con la suma en vivo** (verde al 100 %, rojo si no cuadra), **fichas de SA reales en ESO y Bachillerato** (tabla con criterios, pesos, temporalización y grupos tipo PROGRAMACIÓN/ROBÓTICA, más fichas numeradas; en FP siguen siendo fichas de muestra), badge de *texto compartido* con *Editar global* / *Desvincular* |
| **Panel derecho** | comprobaciones del apartado o del documento + estado global (los mismos avisos que hoy pone el PDF en una cajita roja) |
| **Barra superior** | tema claro/oscuro (se recuerda), **Permisos** (solo admin), *Exportar PDF* con aviso de lo que haría la app real |
| **Pie** | anterior/siguiente apartado, indicador de posición y progreso del documento |

## Notas

- Los datos de los apartados son **de muestra** (párrafos, tablas y estados inventados de forma
  determinista): el objetivo es validar la navegación y la ergonomía, no el contenido. **Excepción:**
  las **situaciones de aprendizaje de ESO y Bachillerato son reales** (`SA` y `SA_CARACTERISTICAS`
  en `js/data.js`), extraídas de las propuestas pedagógicas: títulos, criterios, pesos y
  temporalización tal como aparecen en los documentos. En FP, los `.docx` originales ya no están,
  así que se conservan las fichas de muestra.
- Los estados (relleno/avisos/vacio) y los avisos se generan con una función de hash estable, para
  que siempre se vea igual en cada nodo.
- `js/data.js` y `js/app.js` se cargan como `<script>` clásicos en el **mismo ámbito global**: no
  deben declararse identificadores con el mismo nombre (p. ej. `const PERFILES` solo puede estar en
  uno de los dos; el otro usa `D.PERFILES`).
- La interfaz real guardará en MongoDB el JSON que ya produce el importador y usará
  `lib/render-generico.js` para el PDF; este mockup solo define cómo se navega y se edita.
