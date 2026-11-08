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
      <body>
        <AvisoAccesoLibre />
        {children}
      </body>
    </html>
  );
}

// Mientras el acceso sin enlace esté encendido, se dice en todas las pantallas.
// Es un puente sobre la autenticación: lo peor que podría pasar es que quedara
// puesto sin que nadie se diera cuenta. Se apaga solo en cuanto se quita la
// variable, y cómo se retira entero está en app/_lib/rutas/acceso-libre.js.
function AvisoAccesoLibre() {
  const { estado } = require('./_lib/rutas/acceso-libre');
  const e = estado();

  if (e.activo) {
    return (
      <div className="aviso-acceso-libre" role="status">
        Modo de pruebas: se puede entrar como cualquiera desde <a href="/entrar">/entrar</a>,
        sin enlace de acceso. Esto no es cómo se entra de verdad.
      </div>
    );
  }

  // Se pidió y no se ha abierto: decirlo. Un 404 mudo manda a buscar el fallo al
  // sitio equivocado, y el motivo más probable no es el que uno supone.
  if (e.pedido) {
    return (
      <div className="aviso-acceso-libre aviso-acceso-apagado" role="status">
        El acceso de pruebas está pedido pero <strong>no se ha abierto</strong>: {e.motivo}
      </div>
    );
  }

  return null;
}
