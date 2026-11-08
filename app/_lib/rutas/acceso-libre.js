// Entrar eligiendo persona, sin enlace de acceso. SOLO PARA PROBAR, Y TEMPORAL.
//
// ESTO ES UN PUENTE SOBRE LA AUTENTICACIÓN. Abre una sesión de cualquier persona
// a quien se la pida, sin testigo y sin comprobar nada: es lo mismo que hacía la
// cookie `persona` del E1, que el E2 quitó precisamente por esto.
//
// Existe porque probar la aplicación con enlaces de un solo uso es incómodo: se
// gastan al pincharlos, y para ver la misma pantalla con los cuatro roles hacen
// falta cuatro enlaces y reiniciar el servidor cuando se acaban.
//
// TRES CERROJOS, y los tres tienen que ceder para que esto funcione:
//
//   1. `PCCF_ACCESO_LIBRE=1` en el entorno. Sin eso no existe.
//   2. `NODE_ENV` distinto de `production`. Aunque alguien ponga la variable en
//      un despliegue de verdad, no se abre.
//   3. Solo con el adaptador en memoria o con una base de datos local: si
//      `MONGODB_URI` apunta fuera de la máquina, no se abre.
//
// Y cuando no está activo responde **404**, no 403: un 403 diría «esto existe
// pero no puedes», que es justo lo que no conviene anunciar.
//
// CÓMO SE QUITA, cuando ya no haga falta: borrar este fichero, su envoltorio
// (app/api/acceso-libre/), la pantalla (app/(vistas)/entrar/ y
// app/_componentes/AccesoLibre.js) y el aviso de app/layout.js. No hay nada más
// enganchado: ninguna otra ruta lo mira, y la sesión que abre es una sesión
// normal, de las que `sesionDeLaPeticion` entiende sin saber de dónde salieron.

'use strict';

const { obtenerRepositorio } = require('../repositorio');
const { abrirSesion, cabecerasConSesion } = require('../sesion');
const { asegurarSemilla } = require('../semilla');

// Una base de datos es local si no hay ninguna (memoria) o si la dirección
// apunta a esta máquina. Lo que esto impide es lo que de verdad asusta: dejar la
// variable puesta apuntando a los datos de verdad del departamento.
function baseLocal() {
  const uri = process.env.MONGODB_URI;
  if (!uri) return true;
  return /^mongodb:\/\/(localhost|127\.0\.0\.1|\[::1\])([:/]|$)/i.test(uri);
}

// Devuelve por qué está apagado, además de si lo está. Que falle en silencio es
// lo peor que podría hacer: quien pone la variable y no ve nada se vuelve loco
// buscando, y el motivo más probable es el menos evidente —`next start` pone
// NODE_ENV=production, así que con la aplicación compilada no se abre; para
// probar hay que usar `npm run dev`—.
function estado() {
  if (process.env.PCCF_ACCESO_LIBRE !== '1') {
    return { activo: false, pedido: false, motivo: null };
  }
  if (process.env.NODE_ENV === 'production') {
    return {
      activo: false,
      pedido: true,
      motivo: 'la aplicación está compilada para producción (NODE_ENV=production). '
        + '`npm run start` arranca siempre así: para probar con esto, usa `npm run dev`.',
    };
  }
  if (!baseLocal()) {
    return {
      activo: false,
      pedido: true,
      motivo: 'MONGODB_URI apunta a una base de datos que no está en esta máquina. '
        + 'Esto no se abre nunca sobre datos que no sean de prueba.',
    };
  }
  return { activo: true, pedido: true, motivo: null };
}

const activo = () => estado().activo;

const noExiste = () => Response.json(
  { error: 'no_encontrado', mensaje: 'No hay nada aquí.' },
  { status: 404 },
);

const comoSale = (u) => ({ _id: u._id, nombre: u.nombre, rol: u.rol, departamento: u.departamento });

// Las personas entre las que elegir. Sin correo: esto no identifica a nadie, solo
// sirve para ponerse un disfraz.
async function GET() {
  if (!activo()) return noExiste();
  await asegurarSemilla();

  const repo = obtenerRepositorio();
  const personas = (await repo.usuarios.listar({}))
    .filter((u) => u.activo !== false)
    .map(comoSale)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  return Response.json({ activo: true, personas }, { headers: { 'Cache-Control': 'no-store' } });
}

// Abre sesión como quien se pida.
async function POST(peticion) {
  if (!activo()) return noExiste();
  await asegurarSemilla();

  let cuerpo = null;
  try { cuerpo = await peticion.json(); } catch (e) { cuerpo = null; }
  const id = cuerpo && typeof cuerpo.persona === 'string' ? cuerpo.persona : '';
  if (!id) {
    return Response.json({ error: 'peticion', mensaje: 'Falta «persona».' }, { status: 400 });
  }

  const repo = obtenerRepositorio();
  let persona = null;
  try { persona = await repo.usuarios.obtener(id); } catch (e) { persona = null; }
  if (!persona || persona.activo === false) {
    return Response.json({ error: 'no_encontrado', mensaje: 'Esa persona no está.' }, { status: 404 });
  }

  const { testigo } = await abrirSesion(repo, persona._id);
  return Response.json({ persona: comoSale(persona) }, { headers: cabecerasConSesion(testigo) });
}

module.exports = { GET, POST, activo, estado };
