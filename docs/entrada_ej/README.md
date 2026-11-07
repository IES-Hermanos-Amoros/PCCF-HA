# Documentos de entrada

Aquí van los documentos del departamento que alimentan la herramienta: las programaciones didácticas
de los dos ciclos, los PCCF, las memorias y las propuestas pedagógicas de ESO y Bachillerato, por
curso. **En el repositorio no hay ninguno**: esta página explica cómo se trabaja con ellos.

## Nada de esto se versiona

Este repositorio es **público**, y los documentos reales llevan dentro:

- nombres del profesorado, con sus variantes de escritura, repartidos por el texto y en las fichas de
  identificación de cada módulo;
- correos corporativos y algún teléfono;
- el nombre, el CIF y la localidad de las empresas de prácticas;
- las actividades y los materiales que cada uno ha diseñado para su módulo, en las fichas de
  situación de aprendizaje;
- y, fuera del texto visible, **los metadatos del propio `.docx`**: autor, última persona que guardó,
  comentarios, revisiones con control de cambios, EXIF de las imágenes.

Esa última línea es la importante: **cambiar el texto no limpia un `.docx`**. Esas cosas viven en
otras partes del zip (`docProps/core.xml`, `word/comments.xml`, `word/people.xml`, `word/media/`) y
sobreviven a cualquier buscar y reemplazar.

Los **ejemplos saneados tampoco se versionan**. Se regeneran en un minuto y medio con un comando, así
que no hay motivo para meter cinco megas de binarios en el historial ni para publicar documentos del
departamento, aunque estén saneados. Lo único que sube al repositorio es el contenido que enseña el
prototipo, [`docs/mockup-v2/js/importado.js`](../mockup-v2/js/importado.js).

## Cómo se sanea: editando el original, no reescribiéndolo

[`scripts/sanear-docx.js`](../../scripts/sanear-docx.js) abre el `.docx`
original, **copia todas sus partes tal cual** y cambia solo el texto que no puede salir. El documento
conserva la portada, el índice, los estilos, la numeración, las imágenes, las cabeceras y los pies.

Hubo antes otro camino —escribir un `.docx` nuevo desde la estructura que deduce el importador, que
es lo que sigue haciendo [`generar-ejemplo.js`](../../scripts/generar-ejemplo.js)— y se
cambió por un motivo concreto: **estos ejemplos existen para probar el importador contra documentos
de verdad**, y un documento escrito por nosotros a partir de una importación no prueba nada. Es
circular, y además perdía todo lo que el importador no modela.

Editar el original reintroduce el riesgo que generar de cero eliminaba, así que el saneador se ocupa
de cada parte del zip por separado: quita `word/people.xml` y la miniatura de la portada (arreglando
las relaciones y el `[Content_Types].xml`), reescribe el texto y los nombres de los autores de los
comentarios, limpia los códigos de campo —ahí es donde Word deja el `mailto:` de una mención—,
neutraliza las propiedades del documento, acepta los cambios con control y quita el EXIF de las
imágenes. Si aparece una parte que no sabe tratar (un objeto incrustado, un glosario), **se para**.

| | |
|---|---|
| Se conserva | la estructura entera, el formato, y el texto normativo: resultados de aprendizaje, criterios, competencias, objetivos, saberes básicos. Sale del real decreto del título y no es de nadie |
| Se cambia | personas, correos, teléfonos, DNI; el nombre, CIF y localidad de las empresas; el material docente de las fichas y de los recursos específicos; los apartados con valoraciones internas |

El nombre del centro **se conserva**: el repositorio es del propio centro y la organización de GitHub
se llama igual, así que esconderlo dentro del documento era una ficción que estropeaba la fidelidad.
Con `--anonimizar-centro` se cambia.

### Se limpia por exclusión

Se conserva lo que el vocabulario de la etiqueta delata como normativo y **se reescribe todo lo
demás, reconocido o no**. Al revés ya falló: un módulo escribe su ficha con otras etiquetas y pasaba
entera sin que nadie la tocara, decenas de líneas de material docente camino del repositorio, sin que
ninguna comprobación lo viera. Lo que falla en silencio aquí se publica.

Por lo mismo, las guardias son **estructurales y no listas de nombres**: una lista se queda vieja y
deja pasar lo nuevo sin decir nada.

## Las comprobaciones

El guion las hace todas sobre el `.docx` resultante **reimportado**, no sobre el modelo saneado en
memoria: lo único que demuestra que el fichero está limpio es lo que se lee de vuelta de él. Si
alguna falla, **el documento no se escribe**.

1. el XML de todas las partes está bien formado, y ningún nodo de texto queda donde no puede estar;
2. en las partes editadas solo cambia el texto, no las etiquetas;
3. las partes no tocadas siguen byte a byte;
4. la estructura del documento no se mueve (mismos apartados, campos, instancias y tablas al
   importarlo);
5. no sobrevive ninguna línea del material docente original;
6. el guardia no encuentra datos reales, ni en el modelo ni en ninguna parte del zip;
7. dos ejecuciones dan los mismos bytes;
8. el PDF se construye.

Y una más que ninguna de esas puede dar: **que Word lo abra**. Las ocho pueden estar en verde sobre un
fichero que Word rechaza, porque los analizadores tolerantes perdonan lo que él no. Por eso está
[`abrir-con-word.ps1`](../../scripts/abrir-con-word.ps1), que abre cada documento con Word
de verdad y compara su número de párrafos, tablas e índices con el del original.

## Cómo se usa

```bash
# desde la raíz del repositorio
node scripts/sanear-docx.js                 # los doce, a out/saneado/
node scripts/sanear-docx.js "ruta/doc.docx" # uno
node scripts/sanear-docx.js --partes        # con la tabla de partes del zip completa
pwsh scripts/abrir-con-word.ps1             # ¿los abre Word?
```

Y para llevar el contenido al prototipo:

```bash
node scripts/sanear-docx.js "docs/entrada_ej/2026-27/PD_DAW_26-27_161026.docx" --modelo
node docs/mockup-v2/herramientas/extraer-contenido.js
```

Los originales van en `2025-26/` y `2026-27/`, con el nombre que tengan. Nada de eso se versiona, así
que el guion solo funciona en la máquina de quien los tenga.

### Lo que no tiene forma reconocible

Un topónimo o una dirección no se distinguen por su forma de cualquier otra palabra con mayúscula.
Eso va en `out/sustituciones.local.json` —que git ignora, para que los datos reales no
acaben escritos en un fichero del repositorio— con el formato `[{ "buscar": "…", "por": "…" }]`. El
guardia avisa cuando ve un topónimo detrás de una pista de procedencia («poblaciones cercanas de…»,
«limítrofe con…»).

Ese fichero **no es para personas ni para material docente**: eso tiene forma y le toca al saneador.
Si hacen falta más de un puñado de entradas por documento, es que falta una regla.

## Lo que falta

- Las cuatro propuestas pedagógicas de **ESO y Bachillerato** no tienen fichas de situación de
  aprendizaje al estilo de FP, así que la comprobación 5 compara contra una lista vacía y pasa sin
  mirar nada: su contenido propio (el apartado «Situaciones de aprendizaje», metodología, recursos)
  sale literal. Hay que decidir apartado por apartado qué es del decreto y qué del departamento.
- El **PCCF de SMR** no cambia nada: no tiene ni un CIF, ni una empresa con forma jurídica, ni un
  correo. Es coherente, pero son 92 KB y ocho tablas que nadie vigila.
- `motor/sanear-docx.js` **no tiene pruebas propias**: no entra en `npm test`.
