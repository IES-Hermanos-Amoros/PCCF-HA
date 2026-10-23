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

## Datos personales

El repositorio no contiene documentos reales del departamento ni datos de personas. Los Word de entrada y todo lo generado se quedan en carpetas excluidas por `.gitignore`.

## Licencia

[GPL-3.0](LICENSE)
