// Siembra el repositorio para poder usar la aplicación: las personas del
// desplegable y, si se le da un Word, un documento con el que navegar.
//
//   node scripts/sembrar.js
//   node scripts/sembrar.js --docx "entrada/PD_DAW.docx" --ciclo daw --curso 2026-27
//   node scripts/sembrar.js --desde out/importado --ciclo daw --curso 2026-27
//
// POR QUÉ HACE FALTA
//
// Sin ninguna persona en el repositorio no hay forma de entrar: todas las rutas
// devuelven 401 salvo `GET /api/personas`, que es la lista del desplegable, y si
// está vacía no hay a quién elegir (docs/api.md, «Quién pregunta»). Mientras no
// haya autenticación —llega en el E2— esto es la puerta.
//
// LAS PERSONAS SON INVENTADAS, Y NO POR DESCUIDO
//
// El profesorado real del departamento no está en este repositorio y no se pone:
// el repositorio es público y los nombres, los correos corporativos y el reparto
// de módulos son datos de personas. Son las mismas seis que usa el prototipo
// (docs/mockup-v2/js/contenido.js) para que las dos pantallas enseñen el mismo
// reparto, con correos en `.invalid`, que es un dominio reservado que nunca va a
// existir: así nadie los confunde con los de verdad ni les manda un correo.
//
// CUIDADO CON EL ADAPTADOR DE MEMORIA
//
// Sin MONGODB_URI el repositorio vive en la memoria del proceso (ver
// app/_lib/repositorio.js), así que lo que siembre ESTE proceso no lo ve el
// servidor de Next, que es otro. Por eso la aplicación se siembra ella misma al
// arrancar en ese caso, llamando a `sembrarPersonas` de aquí mismo: una sola
// lista de personas, en un solo sitio (app/_lib/semilla.js). Ejecutar el guion a
// mano sirve para Mongo, y para ver qué se va a sembrar antes de arrancar.

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { conciliar } = require('../core/conciliar');
const { aFilas, idDeTitulo } = require('../core/documento');

// ---------------------------------------------------------------- las personas

// Un rol de cada uno de los cuatro que entiende core/permisos.js, más tres
// docentes, porque el reparto de módulos del E2 no se puede probar con una sola.
// La jefatura de estudios va en su propio departamento a propósito: es quien
// prueba que «ve todos los departamentos y no edita ninguno».
const PERSONAS = [
  { nombre: 'Soporte técnico', email: 'soporte@ejemplo.invalid', rol: 'admin', departamento: 'informatica' },
  { nombre: 'Jefatura de estudios', email: 'estudios@ejemplo.invalid', rol: 'jefe_estudios', departamento: 'estudios' },
  { nombre: 'Jefatura del departamento', email: 'jefatura.informatica@ejemplo.invalid', rol: 'jefe_departamento', departamento: 'informatica' },
  { nombre: 'Lucía M.', email: 'lucia.m@ejemplo.invalid', rol: 'docente', departamento: 'informatica' },
  { nombre: 'Pau S.', email: 'pau.s@ejemplo.invalid', rol: 'docente', departamento: 'informatica' },
  { nombre: 'Nerea T.', email: 'nerea.t@ejemplo.invalid', rol: 'docente', departamento: 'informatica' },
];

// Idempotente: se puede ejecutar dos veces y no duplica nada. El repositorio
// rechaza dos usuarios con el mismo correo (ErrorDuplicado), así que la
// comprobación evita además que un segundo arranque se caiga.
async function sembrarPersonas(repo) {
  const existentes = new Set((await repo.usuarios.listar({})).map((u) => u.email));
  const creadas = [];
  for (const persona of PERSONAS) {
    if (existentes.has(persona.email)) continue;
    creadas.push(await repo.usuarios.crear(persona));
  }
  return creadas;
}

// ---------------------------------------------------------------- un documento

// El `{ plantilla, datos }` del importador, de un Word o de un par de ficheros
// ya importados. Lo segundo tarda milisegundos en lugar de cinco segundos, y es
// lo que deja `npm run importar` en out/importado/.
async function leerFuente({ docx, desde }) {
  if (desde) {
    const dir = path.resolve(desde);
    const plantilla = JSON.parse(fs.readFileSync(path.join(dir, 'plantilla.json'), 'utf8'));
    return {
      plantilla,
      datos: JSON.parse(fs.readFileSync(path.join(dir, 'datos.json'), 'utf8')),
      // El `origen` es el nombre del Word de procedencia, que la plantilla ya
      // trae del importador. El nombre del directorio no es la procedencia de
      // nada: la cabecera del documento diría «importado de out/importado».
      origen: plantilla.origen || path.basename(dir),
    };
  }
  // El importador se exige aquí dentro y no arriba: arrastra mammoth y JSZip, y
  // sembrar solo las personas no tiene por qué cargarlos.
  const { importarDocx } = require('../motor/importar-docx');
  const { plantilla, datos } = await importarDocx({ path: docx }, { origen: path.basename(docx) });
  return { plantilla, datos, origen: path.basename(docx) };
}

// Guarda el documento en las cuatro colecciones de docs/plan.md §2.3.
//
// Las unidades se crean EN UNA SOLA TANDA porque `unidades.crearMuchos` fija el
// orden por el de creación y ese orden es el del tomo del PDF: partirlo en dos
// llamadas reinicia el contador y los módulos salen desordenados (docs/plan.md,
// «Lo que ha dejado el E0»).
async function sembrarDocumento(repo, fuente, opciones) {
  const { plantilla, datos, origen } = fuente;
  const { tipo, ciclo, curso, departamento } = opciones;

  // El ciclo hace falta para conciliar: el Word identifica cada módulo solo por
  // su título y hay títulos que se repiten entre ciclos («Sostenibilidad
  // aplicada al sistema productivo» está igual en DAW y en SMR), así que sin
  // ciclo esos dos módulos son ambiguos (docs/api.md).
  const resuelto = conciliar(datos.instancias || [], { curso, ciclo });
  const porTitulo = new Map(resuelto.unidades.map((u) => [u.titulo, u.unidadId]));

  const filas = aFilas({ plantilla, datos }, {
    tipo: tipo || plantilla.tipo,
    ciclo,
    curso,
    departamento,
    origen,
    // Lo que el catálogo no reconoce se queda con un id derivado del título, que
    // es lo que hace `core/documento.js` sin conciliador. No se inventa una
    // unidad del catálogo: `core/conciliar.js` prefiere dejarla sin resolver
    // antes que adivinar, y aquí se respeta.
    conciliar: (titulo) => porTitulo.get(titulo) || idDeTitulo(titulo),
  });

  const documento = await repo.documentos.crear(filas.documento);
  if (filas.unidades.length) await repo.unidades.crearMuchos(documento._id, filas.unidades);
  if (filas.apartados.length) await repo.apartados.crearMuchos(documento._id, filas.apartados);
  if (filas.compartidos.length) await repo.compartidos.crearMuchos(documento._id, filas.compartidos);

  return { documento, filas, sinResolver: resuelto.sinResolver };
}

module.exports = { PERSONAS, sembrarPersonas, sembrarDocumento, leerFuente };

// ---------------------------------------------------------------- línea de órdenes

if (require.main === module) {
  const args = process.argv.slice(2);
  const valor = (nombre, omision) => {
    const i = args.indexOf('--' + nombre);
    return i >= 0 && args[i + 1] ? args[i + 1] : omision;
  };

  // El mismo `obtenerRepositorio` que usa la aplicación, para que la decisión de
  // adaptador —memoria o Mongo, según MONGODB_URI— sea una sola y no dos que se
  // pueden separar.
  const { obtenerRepositorio } = require('../app/_lib/repositorio');

  (async () => {
    const repo = obtenerRepositorio();
    const creadas = await sembrarPersonas(repo);
    console.log(creadas.length
      ? `Personas creadas (${creadas.length}): ${creadas.map((p) => `${p.nombre} · ${p.rol}`).join(', ')}`
      : 'Las personas ya estaban: no se ha creado ninguna.');

    const docx = valor('docx');
    const desde = valor('desde');
    if (docx || desde) {
      const curso = valor('curso', '2026-27');
      const ciclo = valor('ciclo', null);
      if (!ciclo) {
        console.error('Falta --ciclo (daw, smr, eso, bach): sin él no se pueden conciliar las unidades.');
        process.exit(1);
      }
      const fuente = await leerFuente({ docx, desde });
      const { documento, filas, sinResolver } = await sembrarDocumento(repo, fuente, {
        tipo: valor('tipo'),
        ciclo,
        curso,
        departamento: valor('departamento', 'informatica'),
      });
      console.log(`Documento ${documento._id}: ${filas.unidades.length} unidades, `
        + `${filas.apartados.length} apartados, ${filas.compartidos.length} textos compartidos.`);
      for (const s of sinResolver) {
        console.log(`  sin conciliar: «${s.titulo}» — ${s.motivo}`);
      }
      console.log(`  /doc/${documento._id}`);
    }

    if (repo.enMemoria) {
      console.log('\nOJO: sin MONGODB_URI el repositorio es la memoria de ESTE proceso y se pierde al'
        + '\nterminar. El servidor de Next siembra las personas por su cuenta al arrancar'
        + '\n(app/_lib/semilla.js). Para sembrar de verdad, define MONGODB_URI.');
    }
    process.exit(0);
  })().catch((e) => { console.error(e); process.exit(1); });
}
