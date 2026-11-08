// La identidad de la aplicación: invitación de la jefatura, enlace de acceso y sesión.
//
//   node test/sesiones.js
//
// Sin levantar Next, sin red y sin base de datos: la lógica de cada ruta vive en un módulo CommonJS
// de app/_lib/rutas/ y el fichero de app/api/ es un envoltorio de tres líneas (docs/api.md, primera
// regla de forma), así que aquí se le pasa un `Request` normal y los parámetros de la ruta ya
// resueltos, que es exactamente lo que le pasa Next.
//
// LO QUE ESTO TIENE QUE DEMOSTRAR
//
// En el E1 la persona salía de una cookie `persona` con su id dentro: cualquiera podía escribirla y
// ser quien quisiera, y eso era toda la autenticación que había. La prueba que más vale de este
// fichero es la que comprueba que esa cookie ya no identifica a nadie, porque si quedara un solo
// camino por el que siguiera valiendo, todo lo demás no serviría de nada.
//
// Y la segunda: que en la base de datos no hay ningún testigo en claro. Quien mire la base de datos
// —o una copia de seguridad de Mongo— no debe poder entrar como otra persona.
//
// CADA PRUEBA TIENE SU PROPIO ALMACÉN
//
// Estas escriben, y una escritura en una prueba no puede cambiarle los recuentos a la siguiente.
// `obtenerRepositorio()` lee `globalThis` en cada llamada, así que basta con poner otro almacén antes
// de cada prueba. Es la misma técnica de test/api.js: la instancia se mete a mano ANTES de cargar
// nada de app/, porque si no, un MONGODB_URI en el entorno mandaría estas pruebas a una base de
// datos de verdad.

'use strict';

const assert = require('assert/strict');
const { createHash, randomUUID } = require('node:crypto');

const { crearRepositorio } = require('../repositorio');
const memoria = require('../repositorio/memoria');

// ---------------------------------------------------------------- el repositorio de las pruebas
const CLAVE_GLOBAL = '__pccf_repositorio__';

function nuevoAlmacen() {
  const repo = crearRepositorio({ adaptador: memoria.crear() });
  // `enMemoria` sin `autoSemilla` es lo que le dice a app/_lib/semilla.js que este repositorio lo ha
  // puesto otro y que no le añada las seis personas de muestra encima de lo que monte la prueba.
  repo.enMemoria = true;
  globalThis[CLAVE_GLOBAL] = repo;
  return repo;
}
nuevoAlmacen();

const { nuevoTestigo, hashDeTestigo } = require('../app/_lib/testigos');
const { COOKIE_SESION, COOKIE_E1, DIAS_SESION, abrirSesion } = require('../app/_lib/sesion');
const { DIAS_INVITACION, PARAMETRO } = require('../app/_lib/invitaciones');

const Invitaciones = require('../app/_lib/rutas/invitaciones');
const Acceso = require('../app/_lib/rutas/acceso');
const Sesion = require('../app/_lib/rutas/sesion');
const Personas = require('../app/_lib/rutas/personas');
const Persona = require('../app/_lib/rutas/persona');
const Reinvitacion = require('../app/_lib/rutas/reinvitacion');
const Documentos = require('../app/_lib/rutas/documentos');

// ---------------------------------------------------------------- el arnés
// El mismo que test/api.js: `prueba(nombre, fn)` con assert, sin frameworks. Se ejecutan en serie,
// así que el orden de los `ok` es el del fichero y el primer FALLO que se lee es el más cercano a la
// causa.
let fallos = 0;
const pendientes = [];
const prueba = (nombre, fn) => pendientes.push({ nombre, fn });

// ---------------------------------------------------------------- ayudas

// Una petición como la que recibe la ruta dentro de Next. La sesión viaja en la cookie `sesion`, que
// lleva el testigo: es de donde la saca app/_lib/sesion.js. Sin testigo, no se manda cookie.
function pet(camino, { testigo, cookies, metodo = 'GET', cuerpo, crudo } = {}) {
  const cabeceras = {};
  const trozos = [];
  if (testigo) trozos.push(`${COOKIE_SESION}=${encodeURIComponent(testigo)}`);
  for (const [nombre, valor] of Object.entries(cookies || {})) {
    trozos.push(`${nombre}=${encodeURIComponent(valor)}`);
  }
  if (trozos.length) cabeceras.cookie = trozos.join('; ');

  let cuerpoCrudo;
  if (crudo !== undefined) {
    cuerpoCrudo = crudo;
    cabeceras['content-type'] = 'application/json';
  } else if (cuerpo !== undefined) {
    cuerpoCrudo = JSON.stringify(cuerpo);
    cabeceras['content-type'] = 'application/json';
  }
  return new Request(`http://pruebas.local${camino}`, { method: metodo, headers: cabeceras, body: cuerpoCrudo });
}

// Comprueba que una respuesta es el error que dice docs/api.md: el estado, el código y un mensaje en
// castellano que se pueda enseñar tal cual.
async function esError(respuesta, estado, codigo) {
  assert.equal(respuesta.status, estado, `se esperaba un ${estado} y ha sido un ${respuesta.status}`);
  const cuerpo = await respuesta.json();
  assert.equal(cuerpo.error, codigo);
  assert.equal(typeof cuerpo.mensaje, 'string');
  assert.ok(cuerpo.mensaje.length > 0, 'el error no lleva mensaje');
  return cuerpo;
}

// Las cookies que pone una respuesta, por nombre.
function cookiesDe(respuesta) {
  const puestas = {};
  for (const cruda of respuesta.headers.getSetCookie()) {
    const [par, ...atributos] = cruda.split(';').map((s) => s.trim());
    const i = par.indexOf('=');
    puestas[par.slice(0, i)] = { valor: decodeURIComponent(par.slice(i + 1)), atributos, cruda };
  }
  return puestas;
}

// El testigo de sesión que ha puesto una respuesta que abre sesión.
const testigoDe = (respuesta) => cookiesDe(respuesta)[COOKIE_SESION].valor;

// Atajos para pedir cada ruta. Los parámetros de la ruta se pasan a mano, igual que hace Next.
const invitar = (testigo, cuerpo) => Invitaciones.POST(pet('/api/invitaciones', { testigo, metodo: 'POST', cuerpo }));
const canjearEnlace = (enlace) => {
  const url = new URL(enlace);
  return Acceso.GET(pet(url.pathname + url.search));
};
const canjearTestigo = (t) => Acceso.POST(pet('/api/acceso', { metodo: 'POST', cuerpo: { testigo: t } }));
const quienSoy = (opciones) => Sesion.GET(pet('/api/sesion', opciones));
const cerrar = (opciones) => Sesion.DELETE(pet('/api/sesion', { ...opciones, metodo: 'DELETE' }));
const censo = (opciones) => Personas.GET(pet(`/api/personas${(opciones && opciones.consulta) || ''}`, opciones));
const cambiar = (testigo, id, cuerpo) => Persona.PATCH(pet(`/api/personas/${id}`, { testigo, metodo: 'PATCH', cuerpo }), { id });
const reinvitar = (testigo, id) => Reinvitacion.POST(pet(`/api/personas/${id}/invitacion`, { testigo, metodo: 'POST', cuerpo: {} }), { id });

// Una ruta protegida cualquiera, para comprobar quién entra y quién no. `/api/documentos` sirve
// porque es la más simple de las que exigen sesión y devuelve una lista vacía sin documentos.
const rutaProtegida = (opciones) => Documentos.GET(pet('/api/documentos', opciones));

// El censo de partida de casi todas las pruebas. El admin va en informatica, como en la siembra, y
// por un motivo que importa: hace falta alguien de MÁS rango en el mismo departamento para poder
// probar que la jefatura no le puede tocar. Si estuviera en otro departamento, el 403 por rango
// quedaría tapado por el 404 de «esa persona no está».
//
// Las personas son inventadas, con correos en `.invalid`, que es un dominio reservado que nunca va a
// existir: el profesorado real no está en este repositorio.
async function montar() {
  const repo = nuevoAlmacen();
  const persona = (nombre, email, rol, departamento) => repo.usuarios.crear({ nombre, email, rol, departamento, activo: true });

  const u = {
    marta: await persona('Marta Jefa', 'marta@ejemplo.invalid', 'jefe_departamento', 'informatica'),
    ana: await persona('Ana Docente', 'ana@ejemplo.invalid', 'docente', 'informatica'),
    root: await persona('Soporte', 'soporte@ejemplo.invalid', 'admin', 'informatica'),
    elena: await persona('Elena Estudios', 'elena@ejemplo.invalid', 'jefe_estudios', 'estudios'),
    pepe: await persona('Pepe Mates', 'pepe@ejemplo.invalid', 'jefe_departamento', 'matematicas'),
  };

  // Una sesión abierta para cada uno, que es lo que tendrían al haber canjeado su enlace. El testigo
  // solo existe aquí: lo guardado es su hash.
  const t = {};
  for (const [clave, p] of Object.entries(u)) {
    t[clave] = (await abrirSesion(repo, p._id)).testigo;
  }

  return { repo, u, t };
}

// ================================================================ el camino entero

prueba('el camino entero: la jefatura invita, se canjea el enlace, hay sesión y se cierra', async () => {
  const { u, t } = await montar();

  // 1. el alta. La respuesta trae la persona y EL ENLACE, porque la aplicación todavía no manda
  //    correos y es la jefatura quien lo hace llegar.
  const alta = await invitar(t.marta, { nombre: 'Lucía M.', email: 'lucia@ejemplo.invalid', rol: 'docente' });
  assert.equal(alta.status, 201);
  const { persona, enlace, invitacion, aviso } = await alta.json();

  assert.equal(persona.nombre, 'Lucía M.');
  assert.equal(persona.rol, 'docente');
  assert.equal(persona.departamento, 'informatica');
  assert.equal(persona.activo, true);
  assert.ok(enlace.includes(`?${PARAMETRO}=`), `el enlace no lleva el testigo: ${enlace}`);
  assert.equal(invitacion.estado, 'pendiente');
  // Que el correo es trabajo posterior lo dice la respuesta, no solo un comentario del código.
  assert.ok(/no manda correos/.test(aviso), `el aviso no dice que no hay correo: ${aviso}`);

  // los 7 días de caducidad del enlace
  const dias = (new Date(invitacion.expiraEn) - Date.now()) / 86_400_000;
  assert.ok(Math.abs(dias - DIAS_INVITACION) < 0.01, `el enlace caduca en ${dias} días`);

  // 2. el canje. Redirige a la portada, para que el enlace se pueda pinchar desde el correo.
  const canje = await canjearEnlace(enlace);
  assert.equal(canje.status, 303);
  assert.equal(canje.headers.get('location'), '/');
  const testigo = testigoDe(canje);

  // 3. la sesión: quién soy, y una ruta protegida que ahora deja pasar.
  const soy = await quienSoy({ testigo });
  assert.equal(soy.status, 200);
  const cuerpo = await soy.json();
  assert.equal(cuerpo.persona._id, persona._id);
  assert.equal(cuerpo.persona.rol, 'docente');
  const diasSesion = (new Date(cuerpo.sesion.expiraEn) - Date.now()) / 86_400_000;
  assert.ok(Math.abs(diasSesion - DIAS_SESION) < 0.01, `la sesión caduca en ${diasSesion} días`);

  assert.equal((await rutaProtegida({ testigo })).status, 200);

  // 4. cerrar sesión.
  const salida = await cerrar({ testigo });
  assert.equal(salida.status, 200);
  assert.equal((await salida.json()).cerrada, true);

  // Y la persona sigue en el censo del departamento: cerrar sesión no da de baja a nadie.
  const lista = await (await censo({ testigo: t.marta })).json();
  assert.ok(lista.personas.some((p) => p._id === persona._id));
  assert.ok(lista.personas.some((p) => p._id === u.ana._id));
});

prueba('el canje también se puede hacer con un POST, que es lo que usará la interfaz', async () => {
  const { t } = await montar();
  const { enlace } = await (await invitar(t.marta, { nombre: 'Pau S.', email: 'pau@ejemplo.invalid', rol: 'docente' })).json();
  const testigo = new URL(enlace).searchParams.get(PARAMETRO);

  const r = await canjearTestigo(testigo);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).persona.nombre, 'Pau S.');
  assert.equal((await quienSoy({ testigo: testigoDe(r) })).status, 200);
});

// ================================================================ la cookie del E1

prueba('LA COOKIE `persona` DEL E1 YA NO IDENTIFICA A NADIE', async () => {
  const { u } = await montar();

  // Esto era toda la autenticación del E1: el id de una persona dentro de una cookie que escribía un
  // desplegable. Si cualquiera de estas rutas la reconociera, lo demás de este fichero no serviría
  // para nada.
  const cookies = { [COOKIE_E1]: u.marta._id };

  await esError(await rutaProtegida({ cookies }), 401, 'sin_identificar');
  await esError(await quienSoy({ cookies }), 401, 'sin_identificar');
  // `GET /api/personas` era la excepción al 401 del E1 —la lista del desplegable, que se servía sin
  // identificar— y deja de serlo: ya hay puerta de entrada de verdad.
  await esError(await censo({ cookies }), 401, 'sin_identificar');
  await esError(await Invitaciones.POST(pet('/api/invitaciones', {
    cookies, metodo: 'POST', cuerpo: { nombre: 'X', email: 'x@ejemplo.invalid', rol: 'docente' },
  })), 401, 'sin_identificar');
  await esError(await Persona.PATCH(pet(`/api/personas/${u.ana._id}`, {
    cookies, metodo: 'PATCH', cuerpo: { rol: 'jefe_departamento' },
  }), { id: u.ana._id }), 401, 'sin_identificar');
  await esError(await Reinvitacion.POST(pet(`/api/personas/${u.ana._id}/invitacion`, {
    cookies, metodo: 'POST', cuerpo: {},
  }), { id: u.ana._id }), 401, 'sin_identificar');

  // Ni siquiera llevando las dos cookies: la de sesión es la que vale, y la del E1 no añade nada.
  const r = await rutaProtegida({ cookies: { ...cookies, [COOKIE_SESION]: 'no-soy-un-testigo' } });
  await esError(r, 401, 'sin_identificar');
});

prueba('las respuestas que abren o cierran sesión borran del navegador la cookie del E1', async () => {
  const { t } = await montar();
  const { enlace } = await (await invitar(t.marta, { nombre: 'Nerea T.', email: 'nerea@ejemplo.invalid', rol: 'docente' })).json();

  for (const respuesta of [await canjearEnlace(enlace), await cerrar({ testigo: t.ana })]) {
    const puestas = cookiesDe(respuesta);
    assert.ok(puestas[COOKIE_E1], 'no se borra la cookie del E1');
    assert.equal(puestas[COOKIE_E1].valor, '');
    assert.ok(puestas[COOKIE_E1].atributos.includes('Max-Age=0'));
  }
});

// ================================================================ la cookie de sesión

prueba('la cookie de sesión es HttpOnly, SameSite=Lax, Path=/ y caduca con la sesión', async () => {
  const { t } = await montar();
  const { enlace } = await (await invitar(t.marta, { nombre: 'Jordi B.', email: 'jordi@ejemplo.invalid', rol: 'docente' })).json();

  const { atributos } = cookiesDe(await canjearEnlace(enlace))[COOKIE_SESION];
  // HttpOnly no es opcional: sin él, cualquier JavaScript de la página puede leer la sesión.
  assert.ok(atributos.includes('HttpOnly'), `falta HttpOnly: ${atributos.join('; ')}`);
  assert.ok(atributos.includes('SameSite=Lax'), `falta SameSite=Lax: ${atributos.join('; ')}`);
  assert.ok(atributos.includes('Path=/'), `falta Path=/: ${atributos.join('; ')}`);
  assert.ok(atributos.includes(`Max-Age=${DIAS_SESION * 24 * 60 * 60}`), `Max-Age raro: ${atributos.join('; ')}`);
  // En desarrollo no lleva Secure, porque el servidor es http://localhost y una cookie Secure no
  // viajaría por http: la sesión no llegaría nunca.
  assert.ok(!atributos.includes('Secure'), 'en desarrollo la cookie no debe ser Secure');
});

prueba('fuera de desarrollo la cookie de sesión lleva Secure', async () => {
  const { t } = await montar();
  const antes = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    const { enlace } = await (await invitar(t.marta, { nombre: 'Rosa P.', email: 'rosa@ejemplo.invalid', rol: 'docente' })).json();
    const { atributos } = cookiesDe(await canjearEnlace(enlace))[COOKIE_SESION];
    assert.ok(atributos.includes('Secure'), `falta Secure: ${atributos.join('; ')}`);
  } finally {
    process.env.NODE_ENV = antes;
  }
});

// ================================================================ testigos que no valen

prueba('un testigo inventado es un 404, y no dice nada más', async () => {
  await montar();
  const { testigo } = nuevoTestigo();

  await esError(await canjearTestigo(testigo), 404, 'no_encontrado');
  await esError(await canjearEnlace(`http://pruebas.local/api/acceso?${PARAMETRO}=${testigo}`), 404, 'no_encontrado');
  // Basura que no es un testigo: 404 también, nunca un 500.
  await esError(await canjearTestigo('../../etc/passwd'), 404, 'no_encontrado');
  // Y sin testigo, un 400: falta un parámetro.
  await esError(await Acceso.GET(pet('/api/acceso')), 400, 'peticion');
  await esError(await Acceso.POST(pet('/api/acceso', { metodo: 'POST', crudo: 'no soy json' })), 400, 'peticion');
});

prueba('un enlace caducado lo dice claramente, no falla en seco', async () => {
  const { repo, u } = await montar();
  const { testigo, tokenHash } = nuevoTestigo();
  // La invitación se crea por el repositorio para poder darle una caducidad en el pasado: por la
  // ruta siempre nacen con siete días.
  await repo.invitaciones.crear({
    usuarioId: u.ana._id, email: u.ana.email, rol: u.ana.rol, departamento: u.ana.departamento,
    tokenHash, expiraEn: new Date(Date.now() - 1000),
  });

  const antes = (await repo.sesiones.listar({ usuarioId: u.ana._id })).length;
  const cuerpo = await esError(await canjearTestigo(testigo), 410, 'enlace_gastado');
  assert.equal(cuerpo.motivo, 'caducado');
  assert.ok(/caducado/i.test(cuerpo.mensaje), cuerpo.mensaje);
  // No ha abierto ninguna sesión nueva.
  assert.equal((await repo.sesiones.listar({ usuarioId: u.ana._id })).length, antes);
});

prueba('un enlace ya usado lo dice claramente, y el segundo canje no abre otra sesión', async () => {
  const { repo, t } = await montar();
  const { enlace, persona } = await (await invitar(t.marta, { nombre: 'Clara V.', email: 'clara@ejemplo.invalid', rol: 'docente' })).json();

  assert.equal((await canjearEnlace(enlace)).status, 303);
  assert.equal((await repo.sesiones.listar({ usuarioId: persona._id })).length, 1);

  const cuerpo = await esError(await canjearEnlace(enlace), 410, 'enlace_gastado');
  assert.equal(cuerpo.motivo, 'usado');
  assert.ok(/ya se ha usado/i.test(cuerpo.mensaje), cuerpo.mensaje);
  assert.equal((await repo.sesiones.listar({ usuarioId: persona._id })).length, 1);
});

prueba('volver a invitar anula el enlace anterior, y el nuevo sí vale', async () => {
  const { t, u } = await montar();
  const primero = await (await reinvitar(t.marta, u.ana._id)).json();
  const segundo = await (await reinvitar(t.marta, u.ana._id)).json();
  assert.notEqual(primero.enlace, segundo.enlace);

  // El enlace que vale es el último: si el viejo siguiera sirviendo, uno mandado por error a la
  // dirección equivocada no se podría retirar de ninguna manera.
  const cuerpo = await esError(await canjearEnlace(primero.enlace), 410, 'enlace_gastado');
  assert.equal(cuerpo.motivo, 'anulado');
  assert.equal((await canjearEnlace(segundo.enlace)).status, 303);
});

// ================================================================ nada de testigos en la base de datos

prueba('EN LA BASE DE DATOS NO HAY NINGÚN TESTIGO EN CLARO, solo su hash', async () => {
  const { repo, t } = await montar();
  const { enlace, persona } = await (await invitar(t.marta, { nombre: 'Iván R.', email: 'ivan@ejemplo.invalid', rol: 'docente' })).json();
  const testigoInvitacion = new URL(enlace).searchParams.get(PARAMETRO);
  const canje = await canjearEnlace(enlace);
  const testigoSesion = testigoDe(canje);

  // Todo lo que hay guardado, tal como lo vería quien abriera la base de datos o leyera una copia de
  // seguridad de Mongo.
  const volcado = JSON.stringify({
    usuarios: await repo.usuarios.listar({}),
    invitaciones: await repo.invitaciones.listar({}),
    sesiones: await repo.sesiones.listar({}),
  });

  for (const testigo of [testigoInvitacion, testigoSesion, ...Object.values(t)]) {
    assert.ok(!volcado.includes(testigo), 'hay un testigo en claro en la base de datos');
  }

  // Lo que sí está es el hash, y es el sha256 del testigo: así se puede buscar por él sin poder
  // deshacerlo.
  const [invitacion] = await repo.invitaciones.listar({});
  assert.equal(invitacion.tokenHash, createHash('sha256').update(testigoInvitacion).digest('hex'));
  assert.notEqual(invitacion.tokenHash, testigoInvitacion);
  const [sesion] = await repo.sesiones.listar({ usuarioId: persona._id });
  assert.equal(sesion.tokenHash, hashDeTestigo(testigoSesion));

  // Y el hash no vale como testigo: quien se lleve la base de datos no entra con lo que hay dentro.
  await esError(await canjearTestigo(invitacion.tokenHash), 404, 'no_encontrado');
  await esError(await rutaProtegida({ testigo: sesion.tokenHash }), 401, 'sin_identificar');
});

// ================================================================ cerrar sesión

prueba('cerrar sesión revoca de verdad: la misma cookie ya no vale', async () => {
  const { repo, u, t } = await montar();

  assert.equal((await rutaProtegida({ testigo: t.ana })).status, 200);
  await cerrar({ testigo: t.ana });

  // La cookie vieja es exactamente la misma que antes valía. Borrarla del navegador no basta: quien
  // la hubiera copiado seguiría dentro.
  await esError(await rutaProtegida({ testigo: t.ana }), 401, 'sin_identificar');
  await esError(await quienSoy({ testigo: t.ana }), 401, 'sin_identificar');

  // Y la fila sigue ahí, revocada: no se borra, para poder decir que esa sesión existió y se cerró.
  const [sesion] = await repo.sesiones.listar({ usuarioId: u.ana._id });
  assert.ok(sesion.revocadaEn, 'la sesión no se ha revocado en la base de datos');

  // Las otras sesiones de otras personas no se tocan.
  assert.equal((await rutaProtegida({ testigo: t.marta })).status, 200);
});

prueba('cerrar sesión sin tenerla no es un error, y borra las cookies igualmente', async () => {
  await montar();
  const r = await cerrar({});
  assert.equal(r.status, 200);
  assert.equal((await r.json()).cerrada, false);
  assert.ok(cookiesDe(r)[COOKIE_SESION]);
});

// ================================================================ quién invita a quién

prueba('NADIE INVITA POR ENCIMA DE SU RANGO, ni se asciende invitándose a sí mismo', async () => {
  const { u, t } = await montar();

  // Una jefatura de departamento no crea admins ni jefaturas de estudios: si pudiera, se daría de
  // alta un admin con otro correo suyo y entraría como él.
  for (const rol of ['admin', 'jefe_estudios']) {
    await esError(await invitar(t.marta, { nombre: 'Yo mismo', email: `yo-${rol}@ejemplo.invalid`, rol }), 403, 'sin_permiso');
  }

  // Lo que sí puede: docentes y otra jefatura de departamento (el relevo del cargo).
  assert.equal((await invitar(t.marta, { nombre: 'Otra Jefa', email: 'otra@ejemplo.invalid', rol: 'jefe_departamento' })).status, 201);
  assert.equal((await invitar(t.marta, { nombre: 'Un Docente', email: 'otro@ejemplo.invalid', rol: 'docente' })).status, 201);

  // Darse de alta a uno mismo no abre ninguna puerta: por arriba lo para el rango, y con un rol que
  // sí podría otorgar lo para el censo, porque ese correo ya está.
  await esError(await invitar(t.marta, { nombre: 'Marta Jefa', email: u.marta.email, rol: 'admin' }), 403, 'sin_permiso');
  await esError(await invitar(t.marta, { nombre: 'Marta Jefa', email: u.marta.email, rol: 'docente' }), 400, 'peticion');

  // El admin sí puede con todo, que es para lo que está.
  assert.equal((await invitar(t.root, {
    nombre: 'Otro Soporte', email: 'soporte2@ejemplo.invalid', rol: 'admin', departamento: 'direccion',
  })).status, 201);
});

prueba('una jefatura de departamento no invita en otro departamento', async () => {
  const { t } = await montar();

  await esError(await invitar(t.marta, {
    nombre: 'Alguien de Mates', email: 'mates@ejemplo.invalid', rol: 'docente', departamento: 'matematicas',
  }), 403, 'sin_permiso');

  // Sin decir departamento, el suyo: es lo que quiere decir una jefatura que da de alta a alguien.
  const r = await invitar(t.marta, { nombre: 'De los míos', email: 'mio@ejemplo.invalid', rol: 'docente' });
  assert.equal((await r.json()).persona.departamento, 'informatica');

  // Y el admin sí, porque es la coordinación técnica del centro.
  assert.equal((await invitar(t.root, {
    nombre: 'De Mates', email: 'mates2@ejemplo.invalid', rol: 'docente', departamento: 'matematicas',
  })).status, 201);
});

prueba('ni un docente ni la jefatura de estudios dan de alta a nadie', async () => {
  const { t } = await montar();
  for (const quien of ['ana', 'elena']) {
    await esError(await invitar(t[quien], {
      nombre: 'Colado', email: `colado-${quien}@ejemplo.invalid`, rol: 'docente', departamento: 'informatica',
    }), 403, 'sin_permiso');
  }
});

prueba('el alta comprueba lo que le llega antes de crear a nadie', async () => {
  const { repo, t } = await montar();
  const censoAntes = (await repo.usuarios.listar({})).length;

  await esError(await invitar(t.marta, { email: 'x@ejemplo.invalid', rol: 'docente' }), 400, 'peticion');
  await esError(await invitar(t.marta, { nombre: 'X', rol: 'docente' }), 400, 'peticion');
  await esError(await invitar(t.marta, { nombre: 'X', email: 'esto no es un correo', rol: 'docente' }), 400, 'peticion');
  await esError(await invitar(t.marta, { nombre: 'X', email: 'x@ejemplo.invalid' }), 400, 'peticion');
  await esError(await invitar(t.marta, { nombre: 'X', email: 'x@ejemplo.invalid', rol: 'jefazo' }), 400, 'peticion');
  await esError(await Invitaciones.POST(pet('/api/invitaciones', { testigo: t.marta, metodo: 'POST', crudo: '[]' })), 400, 'peticion');

  assert.equal((await repo.usuarios.listar({})).length, censoAntes, 'un alta rechazada ha creado a alguien');
});

prueba('el correo se guarda en minúsculas, para que no haya dos personas con el mismo', async () => {
  const { t } = await montar();
  const r = await invitar(t.marta, { nombre: 'Mayús', email: '  Mayus@Ejemplo.Invalid ', rol: 'docente' });
  assert.equal((await r.json()).persona.email, 'mayus@ejemplo.invalid');
  await esError(await invitar(t.marta, { nombre: 'Otra vez', email: 'MAYUS@ejemplo.invalid', rol: 'docente' }), 400, 'peticion');
});

// ================================================================ gestionar a las personas

prueba('NO SE PUEDE ESCALAR EL PROPIO ROL por la ruta de gestión', async () => {
  const { u, t } = await montar();

  // Ni a uno mismo, hacia arriba...
  await esError(await cambiar(t.marta, u.marta._id, { rol: 'admin' }), 403, 'sin_permiso');
  // ...ni hacia abajo, que parece inofensivo y deja un departamento sin jefatura por un descuido.
  await esError(await cambiar(t.marta, u.marta._id, { rol: 'docente' }), 403, 'sin_permiso');
  // Ni ascendiendo a un cómplice por encima del propio rango.
  await esError(await cambiar(t.marta, u.ana._id, { rol: 'admin' }), 403, 'sin_permiso');
  await esError(await cambiar(t.marta, u.ana._id, { rol: 'jefe_estudios' }), 403, 'sin_permiso');
  // Ni tocando a alguien de más rango: si no, se degrada al admin y se queda como el que más manda.
  await esError(await cambiar(t.marta, u.root._id, { rol: 'docente' }), 403, 'sin_permiso');
  await esError(await cambiar(t.marta, u.root._id, { activo: false }), 403, 'sin_permiso');
  // Ni un docente, claro.
  await esError(await cambiar(t.ana, u.ana._id, { rol: 'jefe_departamento' }), 403, 'sin_permiso');
  await esError(await cambiar(t.elena, u.ana._id, { rol: 'jefe_departamento' }), 403, 'sin_permiso');

  // Nada de eso ha cambiado ningún rol.
  const soy = await (await quienSoy({ testigo: t.marta })).json();
  assert.equal(soy.persona.rol, 'jefe_departamento');
  assert.equal((await (await quienSoy({ testigo: t.ana })).json()).persona.rol, 'docente');
});

prueba('la jefatura cambia el rol dentro de su rango, y vale desde la siguiente petición', async () => {
  const { u, t } = await montar();
  const r = await cambiar(t.marta, u.ana._id, { rol: 'jefe_departamento' });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).persona.rol, 'jefe_departamento');

  // No se le ha cerrado la sesión: la sesión guarda quién eres, no qué eres, y el rol se lee del
  // censo en cada petición. Cambiar un rol no es echar a nadie.
  const soy = await quienSoy({ testigo: t.ana });
  assert.equal(soy.status, 200);
  assert.equal((await soy.json()).persona.rol, 'jefe_departamento');
  // Y con el rol nuevo ya puede dar de alta.
  assert.equal((await invitar(t.ana, { nombre: 'Suyo', email: 'suyo@ejemplo.invalid', rol: 'docente' })).status, 201);
});

prueba('una persona de otro departamento no está: 404, no 403', async () => {
  const { u, t } = await montar();
  // «No lo ves» es un 404 en este contrato, porque un 403 confirmaría que esa persona existe
  // (docs/api.md, «404 y no 403»).
  await esError(await cambiar(t.marta, u.pepe._id, { rol: 'docente' }), 404, 'no_encontrado');
  await esError(await reinvitar(t.marta, u.pepe._id), 404, 'no_encontrado');
  await esError(await cambiar(t.marta, 'no-existe-esta-persona', { rol: 'docente' }), 404, 'no_encontrado');
  await esError(await reinvitar(t.marta, randomUUID()), 404, 'no_encontrado');
});

prueba('UNA PERSONA DESACTIVADA NO ENTRA Y SUS SESIONES DEJAN DE VALER', async () => {
  const { repo, u, t } = await montar();
  assert.equal((await rutaProtegida({ testigo: t.ana })).status, 200);

  const baja = await cambiar(t.marta, u.ana._id, { activo: false });
  assert.equal(baja.status, 200);
  const cuerpo = await baja.json();
  assert.equal(cuerpo.persona.activo, false);
  assert.equal(cuerpo.sesionesRevocadas, 1);

  // La sesión que tenía abierta deja de valer en la siguiente petición.
  await esError(await rutaProtegida({ testigo: t.ana }), 401, 'sin_identificar');
  await esError(await quienSoy({ testigo: t.ana }), 401, 'sin_identificar');
  for (const s of await repo.sesiones.listar({ usuarioId: u.ana._id })) {
    assert.ok(s.revocadaEn, 'queda una sesión sin revocar de una persona de baja');
  }

  // Y un enlace que tuviera sin usar se anula al darla de baja: un enlace pendiente de alguien que
  // ya no está es una llave suelta.
  await cambiar(t.marta, u.ana._id, { activo: true });
  const { enlace } = await (await reinvitar(t.marta, u.ana._id)).json();
  await cambiar(t.marta, u.ana._id, { activo: false });
  const gastado = await esError(await canjearEnlace(enlace), 410, 'enlace_gastado');
  assert.equal(gastado.motivo, 'anulado');
  // Y mientras siga de baja no se le puede mandar otro: no abriría nada, y la respuesta lo dice.
  await esError(await reinvitar(t.marta, u.ana._id), 400, 'peticion');
});

prueba('la baja no se puede dar a uno mismo, ni se pueden pedir cambios que no son', async () => {
  const { u, t } = await montar();
  // Darse de baja a uno mismo es cerrarse la puerta por dentro.
  await esError(await cambiar(t.marta, u.marta._id, { activo: false }), 403, 'sin_permiso');
  await esError(await cambiar(t.marta, u.ana._id, {}), 400, 'peticion');
  await esError(await cambiar(t.marta, u.ana._id, { activo: 'no' }), 400, 'peticion');
  await esError(await cambiar(t.marta, u.ana._id, { rol: 42 }), 400, 'peticion');
  assert.equal((await rutaProtegida({ testigo: t.marta })).status, 200);
});

prueba('una errata en el alta se corrige, sin dar de baja a nadie ni perder sus asignaciones', async () => {
  // Antes el nombre y el correo no se podían tocar, así que una letra mal obligaba a dar de baja a
  // la persona y crearla otra vez —con otro identificador—, y con ella se iban sus asignaciones.
  const { repo, u, t } = await montar();

  const r = await cambiar(t.marta, u.ana._id, { nombre: 'Ana Docente Corregida', email: 'ANA.NUEVA@Ejemplo.Invalid' });
  assert.equal(r.status, 200);
  const { persona, mensaje } = await r.json();
  assert.equal(persona.nombre, 'Ana Docente Corregida');
  assert.equal(persona.email, 'ana.nueva@ejemplo.invalid', 'el correo se guarda en minúsculas, como en el alta');
  assert.match(mensaje, /nombre y el correo/);

  // El identificador no cambia: es lo que sostiene las asignaciones y lo que guardan los apartados.
  const guardada = await repo.usuarios.obtener(u.ana._id);
  assert.equal(guardada.nombre, 'Ana Docente Corregida');
  assert.equal(String(guardada._id), String(u.ana._id));

  // Y sigue dentro: la sesión guarda quién eres, no cómo te llamas.
  assert.equal((await rutaProtegida({ testigo: t.ana })).status, 200);
});

prueba('corregirse a uno mismo el nombre sí; el rol, no', async () => {
  const { u, t } = await montar();
  // Arreglar una errata en el propio nombre no es ascenderse.
  const r = await cambiar(t.marta, u.marta._id, { nombre: 'Marta Jefa de Departamento' });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).persona.nombre, 'Marta Jefa de Departamento');
  // El rol sigue sin poder cambiárselo uno mismo, en ninguna dirección.
  await esError(await cambiar(t.marta, u.marta._id, { rol: 'admin' }), 403, 'sin_permiso');
  await esError(await cambiar(t.marta, u.marta._id, { rol: 'docente' }), 403, 'sin_permiso');
});

prueba('cambiar el correo anula el enlace sin usar, porque pudo irse a la dirección equivocada', async () => {
  // Un enlace de acceso es la llave de esa persona. Si el correo del alta estaba mal, esa llave pudo
  // acabar en otro buzón: corregir la dirección sin retirarla dejaría la puerta abierta siete días.
  const { repo, u, t } = await montar();
  await reinvitar(t.marta, u.ana._id);
  const pendientes = async () => (await repo.invitaciones.listar({ usuarioId: u.ana._id, estado: 'pendiente' })).length;
  assert.equal(await pendientes(), 1, 'la prueba no vale si no había enlace que anular');

  const r = await cambiar(t.marta, u.ana._id, { email: 'otra.direccion@ejemplo.invalid' });
  assert.equal(r.status, 200);
  const { enlacesAnulados, mensaje } = await r.json();
  assert.equal(enlacesAnulados, 1);
  assert.equal(await pendientes(), 0, 'el enlace viejo deja de servir');
  assert.match(mensaje, /mándale otro/);

  // Corregir solo el nombre NO retira nada: no hay ninguna llave en el sitio equivocado.
  await reinvitar(t.marta, u.ana._id);
  const soloNombre = await cambiar(t.marta, u.ana._id, { nombre: 'Ana' });
  assert.equal((await soloNombre.json()).enlacesAnulados, 0);
  assert.equal(await pendientes(), 1);
});

prueba('dos personas no pueden compartir correo, ni al corregirlo', async () => {
  const { u, t } = await montar();
  const r = await cambiar(t.marta, u.ana._id, { email: u.marta.email });
  await esError(r, 400, 'peticion');
  // Y ponerse el suyo propio no es un choque: no cambia nada y no se queja.
  const igual = await cambiar(t.marta, u.ana._id, { email: u.ana.email.toUpperCase() });
  assert.equal(igual.status, 200);
  assert.equal((await igual.json()).persona.email, u.ana.email);
});

prueba('un nombre vacío o un correo que no lo parece se rechazan', async () => {
  const { u, t } = await montar();
  await esError(await cambiar(t.marta, u.ana._id, { nombre: '   ' }), 400, 'peticion');
  await esError(await cambiar(t.marta, u.ana._id, { nombre: 42 }), 400, 'peticion');
  await esError(await cambiar(t.marta, u.ana._id, { email: 'esto no es un correo' }), 400, 'peticion');
  await esError(await cambiar(t.marta, u.ana._id, { email: '' }), 400, 'peticion');
});

prueba('volver a activar a alguien no le devuelve sus sesiones: necesita otro enlace', async () => {
  const { u, t } = await montar();
  await cambiar(t.marta, u.ana._id, { activo: false });

  const alta = await cambiar(t.marta, u.ana._id, { activo: true });
  assert.equal((await alta.json()).persona.activo, true);
  // La sesión de antes estaba revocada y lo sigue estando: reactivar no resucita una sesión cerrada.
  await esError(await rutaProtegida({ testigo: t.ana }), 401, 'sin_identificar');

  const { enlace } = await (await reinvitar(t.marta, u.ana._id)).json();
  const canje = await canjearEnlace(enlace);
  assert.equal(canje.status, 303);
  assert.equal((await rutaProtegida({ testigo: testigoDe(canje) })).status, 200);
});

// ================================================================ el censo

prueba('GET /api/personas exige sesión y sirve el censo del departamento', async () => {
  const { u, t } = await montar();
  await esError(await censo({}), 401, 'sin_identificar');

  // La jefatura ve a los suyos, con el correo y con quién tiene un enlace sin usar.
  await reinvitar(t.marta, u.ana._id);
  const suyo = await (await censo({ testigo: t.marta })).json();
  assert.deepEqual(suyo.personas.map((p) => p.nombre), ['Ana Docente', 'Marta Jefa', 'Soporte']);
  assert.equal(suyo.puedeGestionar, true);
  const ana = suyo.personas.find((p) => p.nombre === 'Ana Docente');
  assert.equal(ana.email, 'ana@ejemplo.invalid');
  assert.ok(ana.invitacionPendiente && ana.invitacionPendiente.expiraEn);
  // De la invitación solo sale su caducidad: nunca el testigo ni su hash.
  assert.deepEqual(Object.keys(ana.invitacionPendiente), ['expiraEn']);

  // Un docente ve a los suyos sin el correo: no le hace falta para saber quién lleva un módulo.
  const deAna = await (await censo({ testigo: t.ana })).json();
  assert.equal(deAna.puedeGestionar, false);
  assert.deepEqual(Object.keys(deAna.personas[0]).sort(), ['_id', 'activo', 'departamento', 'nombre', 'rol']);

  // Y la jefatura de estudios ve el centro entero, que es lo que hace con los documentos.
  const deElena = await (await censo({ testigo: t.elena })).json();
  assert.equal(deElena.personas.length, 5);
  assert.equal(deElena.puedeGestionar, false);
  // Pidiendo un departamento que no es el suyo, una jefatura de departamento sigue viendo el suyo.
  const forzado = await (await censo({ testigo: t.marta, consulta: '?departamento=matematicas' })).json();
  assert.deepEqual(forzado.personas.map((p) => p.departamento), ['informatica', 'informatica', 'informatica']);
});

prueba('el censo distingue a quien nunca ha entrado de quien entró alguna vez', async () => {
  // Con solo `invitacionPendiente` no se puede: a quien ya entró y se le manda
  // otro enlace también le saldría pendiente. Lo que lo decide es `ultimoAcceso`,
  // que se escribe al canjear.
  const { repo, t } = await montar();

  const de = async (nombre) => {
    const r = await (await censo({ testigo: t.marta })).json();
    return r.personas.find((p) => p.nombre === nombre);
  };

  // `montar()` abre sesión para poder hacer peticiones, así que quien tiene
  // testigo ya ha entrado; se comprueba contra alguien recién dado de alta.
  const nueva = await repo.usuarios.crear({
    nombre: 'Pau Nuevo', email: 'pau@ejemplo.invalid', rol: 'docente', departamento: 'informatica',
  });
  const reciente = await de('Pau Nuevo');
  assert.equal(reciente.haEntrado, false, 'recién dada de alta no ha entrado');
  assert.equal(reciente.ultimoAcceso, null);

  await abrirSesion(repo, nueva._id);
  const despues = await de('Pau Nuevo');
  assert.equal(despues.haEntrado, true, 'después de canjear, sí');
  assert.ok(despues.ultimoAcceso, 'y queda la fecha');

  // A un docente no se le cuenta quién ha entrado: no gestiona personas.
  const deAna = await (await censo({ testigo: t.ana })).json();
  assert.equal('haEntrado' in deAna.personas[0], false);
});

// ================================================================ ejecución

(async () => {
  for (const { nombre, fn } of pendientes) {
    try {
      await fn();
      console.log(`ok   ${nombre}`);
    } catch (e) {
      fallos += 1;
      const mensaje = String((e && e.stack) || e);
      console.log(`FALLO ${nombre}\n     ${mensaje.slice(0, 2000).replace(/\n/g, '\n     ')}`);
    }
  }

  console.log(fallos ? `\n${fallos} prueba(s) fallida(s)` : '\nTodas las pruebas correctas');
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
