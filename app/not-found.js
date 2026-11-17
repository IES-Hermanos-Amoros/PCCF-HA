// La página que sale cuando la dirección no existe, en castellano y con el mismo marco que el resto.

export const metadata = { title: 'No hay nada aquí' };

export default function NoEncontrada() {
  return (
    <main id="contenido" tabIndex={-1} className="main main-estrecha">
      <div className="cabecera"><div><h1>No hay nada aquí</h1></div></div>
      <p className="suave">Esta dirección no existe o ha cambiado de sitio.</p>
      <p><a className="enlace" href="/">Volver a la lista de documentos</a></p>
    </main>
  );
}
