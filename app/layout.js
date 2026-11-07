// La hoja de estilos es LA MISMA que carga el prototipo, no una copia.
//
// `app/estilos.css` es el fichero que antes vivía en docs/mockup-v2/css/ y que
// docs/mockup-v2/app.html ahora carga con `<link href="../../app/estilos.css">`,
// igual que ya cargaba `../../core/*.js`. Si se duplicara, las dos copias se
// separarían en una semana y la paridad visual entre el prototipo aprobado por
// el departamento y la aplicación dejaría de significar nada.
import './estilos.css';

export const metadata = {
  title: 'Programaciones · Departamento de Informática',
  description:
    'Programaciones didácticas, PCCF y memoria final de curso: se redactan aquí y se exportan a PDF y Word.',
};

// El nombre del centro no aparece en la interfaz, igual que en los dos mockups.

export default function Layout({ children }) {
  // `data-tema="claro"` va en el servidor para que el primer pintado no sea
  // blanco antes de que el JavaScript lea la preferencia: el botón de tema solo
  // cambia este atributo, y la hoja tiene los dos juegos de tokens.
  return (
    <html lang="es" data-tema="claro">
      <head>
        {/* El tema guardado se aplica ANTES de pintar, igual que en el
            prototipo. Con un efecto de React la página se pintaría primero en
            claro y cambiaría a oscuro delante de quien la abre. Es la única
            etiqueta <script> en línea de la aplicación, y no lee nada que venga
            del servidor: solo `localStorage`. */}
        <script
          dangerouslySetInnerHTML={{
            __html: "try{var t=localStorage.getItem('tema');if(t)document.documentElement.dataset.tema=t}catch(e){}",
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
