// Portada provisional del E0. Su único cometido es demostrar que la cadena
// completa está enchufada —página → repositorio → adaptador— antes de ponerse a
// portar vistas. La portada de verdad (la lista de documentos por tipo y curso,
// con el árbol detrás) es el E1, y su referencia visual es
// docs/mockup-v2/index.html.
//
// Por eso no tiene estilos todavía: la hoja del mockup entra en el E1 junto con
// las vistas que la necesitan, y una portada bonita que no lleva a ninguna parte
// no demuestra nada.

import { obtenerRepositorio } from './_lib/repositorio';

export const dynamic = 'force-dynamic';

export default async function Portada() {
  const repo = obtenerRepositorio();

  let documentos = [];
  let error = null;
  try {
    documentos = await repo.documentos.listar({});
  } catch (e) {
    error = e.message;
  }

  return (
    <main style={{ font: '16px/1.6 system-ui, sans-serif', maxWidth: '48rem', margin: '3rem auto', padding: '0 1rem' }}>
      <h1>Programaciones del departamento</h1>

      <p>
        Almacenamiento: <strong>{repo.enMemoria ? 'en memoria' : 'MongoDB'}</strong>
        {repo.enMemoria && ' — lo que se escriba se pierde al reiniciar. Define MONGODB_URI para guardar de verdad.'}
      </p>

      {error ? (
        <p style={{ color: '#b00' }}>El repositorio no responde: {error}</p>
      ) : documentos.length === 0 ? (
        <p>
          No hay ningún documento todavía. El evolutivo E1 añade la subida del <code>.docx</code>;
          mientras tanto se importa por consola con <code>npm run importar</code>.
        </p>
      ) : (
        <ul>
          {documentos.map((d) => (
            <li key={d._id}>
              {d.tipo} · {d.ciclo} · {d.curso} <small>({d.estado})</small>
            </li>
          ))}
        </ul>
      )}

      <p style={{ marginTop: '2rem', color: '#666' }}>
        El plan de construcción, con lo que entra en cada evolutivo, está en <code>docs/plan.md</code>.
      </p>
    </main>
  );
}
