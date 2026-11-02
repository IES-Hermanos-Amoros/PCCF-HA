# PCCF-HA

Herramienta web para que el departamento de Informática del IES Hermanos Amorós (Villena) elabore las **programaciones didácticas (PD)**, el **PCCF** y la **memoria final de curso** a partir de plantillas, y las exporte a PDF y Word.

Idea general:

- el departamento define la estructura de cada documento como una plantilla;
- cada docente rellena su parte en un formulario o **importa su Word de otros cursos**, y la herramienta reconoce secciones, listas y tablas para no volver a teclear nada;
- la herramienta valida lo que se puede calcular (ponderaciones de RA y CE, situaciones de aprendizaje) y genera el documento final.

Despliegue previsto: Next.js en Vercel con MongoDB Atlas, todo gratuito y serverless.

## Estado

Fase de pruebas de concepto.

| Carpeta | Qué contiene |
|---|---|
| [`poc-pdfmake/`](poc-pdfmake/) | Importador de Word que deduce plantilla y datos, y generación de PD en PDF con pdfmake como función serverless |
| [`docs/interfaz-web.md`](docs/interfaz-web.md) | Arquitectura de la aplicación: modelo de datos, API sobre el `lib/` que ya existe, editores por tipo de campo y roadmap |
| [`docs/mockups/`](docs/mockups/) | Primer prototipo de la interfaz: fija la forma de la pantalla y el árbol real de los documentos |
| [`docs/mockup-v2/`](docs/mockup-v2/) | Segunda versión del prototipo: unidades con id estable, estado en la URL, editor de bloques, arrastre entre cursos, situaciones de aprendizaje y panel de coordinación |
| [`docs/entrada_ej/`](docs/entrada_ej/) | Los documentos de entrada. No se versionan, ni los originales ni los ejemplos saneados: aquí solo está documentado cómo se sanean |

## Datos personales

El repositorio es público y **no contiene ningún documento del departamento ni dato de ninguna
persona**: ni los Word originales, ni los ejemplos saneados que se sacan de ellos, ni nada de lo que
produce el importador. Todo eso se queda fuera por `.gitignore` (`*.docx`, `*.doc`, `*.odt`, `*.pdf`,
`poc-pdfmake/out/`).

Lo que **sí** está versionado es el contenido que enseña el prototipo, en
[`docs/mockup-v2/js/importado.js`](docs/mockup-v2/js/importado.js): sale de una programación real del
departamento, con la estructura y el tamaño de verdad, pero con los nombres y el material docente
cambiados. Lo que alguien ha diseñado para su módulo es suyo y no se publica sin su permiso; se
conserva el texto normativo, que sale del real decreto del título y no es de nadie.

Para trabajar con documentos de verdad —probar el importador, por ejemplo— hay un saneador que abre
el Word original, lo copia parte por parte y cambia solo el texto que no puede salir. Se ejecuta en
la máquina de quien tenga los originales y su resultado tampoco se versiona. Se niega a escribir
nada si encuentra un nombre, un correo, un teléfono, un CIF, el centro o un topónimo de procedencia,
si sobrevive una línea de material docente, o si el documento resultante ha cambiado en algo que no
sea su texto. Está contado en [`docs/entrada_ej/README.md`](docs/entrada_ej/README.md).

## Licencia

[GPL-3.0](LICENSE)
