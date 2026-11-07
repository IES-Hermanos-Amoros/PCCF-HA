// Siembra el repositorio para poder usar la aplicación: las personas del
// desplegable y, si se le da un Word, un documento con el que navegar.
//
//   node scripts/sembrar.js
//   node scripts/sembrar.js --base https://pccf.example.org
//   node scripts/sembrar.js --docx "entrada/PD_DAW.docx" --ciclo daw --curso 2026-27
//   node scripts/sembrar.js --desde out/importado --ciclo daw --curso 2026-27
//
// POR QUÉ HACE FALTA
//
// Sin ninguna persona en el repositorio no hay forma de entrar: todas las rutas
// devuelven 401. Y desde el E2 tampoco basta con que haya personas, porque ya no
// se elige quién eres en un desplegable: se entra canjeando un enlace de acceso
// que genera la jefatura (app/_lib/invitaciones.js). Así que la siembra crea
// ADEMÁS un enlace por persona y los imprime: si no, la aplicación arranca con
// un censo y sin puerta.
//
// Los enlaces son de un solo uso y caducan en siete días, como cualquier otro:
// aquí no hay ninguna excepción al mecanismo de verdad, que es justo lo que hace
// que valgan para probarlo.
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

// ------------------------------------------------------------- los enlaces de acceso

// La dirección con la que se construyen los enlaces. En desarrollo es el servidor
// de Next; con un dominio propio o detrás de un proxy, PCCF_URL_BASE.
//
// Aquí no se puede hacer lo que hace la ruta de alta —sacar el host de la propia
// petición— porque esto se ejecuta al arrancar y no hay ninguna petición. Si Next
// acaba en otro puerto porque el 3000 está ocupado, el enlace impreso llevará el
// puerto equivocado: se cambia a mano, o se pasa `--base` / PCCF_URL_BASE.
const BASE_POR_OMISION = process.env.PCCF_URL_BASE
  || `http://localhost:${process.env.PORT || 3000}`;

// Un enlace de acceso por persona de muestra, para poder entrar como cualquiera
// de los seis y ver la aplicación con sus permisos.
//
// A quien ya tenga uno pendiente no se le crea otro, y no es por ahorrar: el
// testigo solo existe en el momento de crearlo —lo guardado es su hash— así que
// un segundo paso por aquí no podría volver a enseñar el enlace anterior, solo
// anularlo y dar otro. Se dice y se sigue, que es lo que hay que hacer cuando no
// se puede recuperar un secreto.
async function sembrarInvitaciones(repo, { base = BASE_POR_OMISION } = {}) {
  const { crearInvitacion, enlaceDe } = require('../app/_lib/invitaciones');

  const deMuestra = new Set(PERSONAS.map((p) => p.email));
  const pendientes = new Set((await repo.invitaciones.listar({ estado: 'pendiente' })).map((i) => i.usuarioId));
  const enlaces = [];

  for (const persona of await repo.usuarios.listar({})) {
    if (!deMuestra.has(persona.email)) continue;
    if (pendientes.has(persona._id)) {
      enlaces.push({ persona, enlace: null, yaTenia: true });
      continue;
    }
    const { invitacion, testigo } = await crearInvitacion(repo, { usuario: persona });
    enlaces.push({ persona, enlace: enlaceDe(base, testigo), expiraEn: invitacion.expiraEn });
  }
  return enlaces;
}

// Lo que se imprime por consola. Es la puerta de entrada en desarrollo, así que
// tiene que poder copiarse de un tirón.
function imprimirEnlaces(enlaces, log = console.log) {
  if (!enlaces.length) return;
  log('\n[semilla] Enlaces de acceso de las personas de muestra (un solo uso, 7 días).'
    + '\n          Pégalos en el navegador para entrar como cada una:');
  for (const { persona, enlace, yaTenia } of enlaces) {
    log(`\n  ${persona.nombre} · ${persona.rol} · ${persona.departamento}`);
    log(yaTenia
      ? '    (ya tenía un enlace pendiente: solo se guarda su hash, así que no se puede volver a enseñar)'
      : `    ${enlace}`);
  }
  log('');
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

module.exports = {
  PERSONAS, sembrarPersonas, sembrarInvitaciones, imprimirEnlaces, sembrarDocumento, leerFuente,
};

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

    // La puerta: sin un enlace de acceso, un censo no sirve para entrar.
    imprimirEnlaces(await sembrarInvitaciones(repo, { base: valor('base', BASE_POR_OMISION) }));

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
