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
├── MEMORIA                                  ← 1 documento por curso, sin ciclo
│     Profesorado del departamento · Docencia en ESO y Bachillerato · …
├── PCCF
│   ├── SMR / DAW                            ← solo en PCCF y PD
│   │     0. Introducción · 1. Identificación · 2. Acuerdos generales (2.1…2.13) · …
│   │     (sin desglose por módulos)
└── PD
    ├── SMR / DAW
    │     1. Introducción · 2. Competencias · … · 8. Evaluación de la práctica docente
    │     9. MÓDULOS DEL PRIMER CURSO →  [Montaje y Mantenimiento… | Programación | …]
    │     10. MÓDULOS DEL SEGUNDO CURSO → [Sistemas operativos en red | …]
    │     11. Resultados de aprendizaje dualizables
    └── dentro de cada módulo: Propuestas de mejora → Desarrollo curricular →
        Metodología específica → Situaciones de aprendizaje → Evaluación → Ponderaciones
```

Los apartados y los 11+11 módulos salen de los `.docx` reales de `../entrada_ej/` (extraídos con
mammoth y el importador de `poc-pdfmake/`), no de datos inventados.

## Qué se puede probar

| Zona | Comportamiento |
|---|---|
| **Selector de curso** | 2025-26 / 2026-27: cambia los módulos y nombres reales de cada curso |
| **Vistas** | *Navegación* (solo lectura) · *Edición* (toolbar + bloques editables + autoguardado simulado) · *Validaciones* (comprobaciones del documento). La vista *Edición* y el botón **Editar** de la cabecera solo se activan donde el rol puede editar; si no, el botón *Edición* queda **deshabilitado** y el botón *Editar* **oculto** |
| **Rol** | Admin / Jefe de estudios / Jefe de departamento / **Docente DAW y RL**: recalcula los permisos al momento (candados en el árbol, botones ocultos/desactivados) — la lógica imita a `poc-pdfmake/lib/permisos.js`. Docente DAW y RL solo puede editar los módulos **Despliegue de aplicaciones web** (PD · DAW) y **Redes Locales** (PD · SMR); en todo lo demás no hay edición |
| **Árbol** | acordeón con transición, buscador que filtra y abre las ramas, punto de estado por nodo (relleno / avisos / vacío / solo lectura), badge `com.` en los textos compartidos |
| **Contenido** | párrafos editables, tablas RA/CE, **ponderaciones con la suma en vivo** (verde al 100 %, rojo si no cuadra), fichas de situación de aprendizaje, badge de *texto compartido* con *Editar global* / *Desvincular* |
| **Panel derecho** | comprobaciones del apartado o del documento + estado global (los mismos avisos que hoy pone el PDF en una cajita roja) |
| **Barra superior** | tema claro/oscuro (se recuerda), *Exportar PDF* con aviso de lo que haría la app real |
| **Pie** | anterior/siguiente apartado, indicador de posición y progreso del documento |

## Notas

- Los datos de los apartados son **de muestra** (párrafos, tablas y estados inventados de forma
  determinista): el objetivo es validar la navegación y la ergonomía, no el contenido.
- Los estados (relleno/avisos/vacio) y los avisos se generan con una función de hash estable, para
  que siempre se vea igual en cada nodo.
- La interfaz real guardará en MongoDB el JSON que ya produce el importador y usará
  `lib/render-generico.js` para el PDF; este mockup solo define cómo se navega y se edita.
