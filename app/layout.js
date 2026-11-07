export const metadata = {
  title: 'Programaciones · Departamento de Informática',
  description:
    'Programaciones didácticas, PCCF y memoria final de curso: se redactan aquí y se exportan a PDF y Word.',
};

// El nombre del centro no aparece en la interfaz, igual que en los dos mockups.

export default function Layout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
