// Pruebas de extremo a extremo con un navegador de verdad.
//
// Se apoyan en un servidor YA LEVANTADO y en la base de datos local: no arrancan uno propio, porque
// `next dev` se cambia de puerto solo cuando el 3000 está ocupado y entonces la dirección que use la
// prueba y la que use el servidor dejan de ser la misma sin que nadie lo note.
//
//   PCCF_E2E_URL   dirección del servidor; por omisión http://localhost:3000
//
// Entrar se hace por `/api/acceso-libre`, que es el puente de pruebas: ver e2e/apoyo.js.

const { defineConfig, devices } = require('@playwright/test');

const baseURL = process.env.PCCF_E2E_URL || 'http://localhost:3000';

module.exports = defineConfig({
  testDir: './e2e',
  // Antes de la primera prueba exige la base limpia y, si no, aborta diciendo qué está sucio (e2e/global-setup.js).
  globalSetup: require.resolve('./e2e/global-setup.js'),
  // Y al terminar, barrer lo que la API no puede deshacer (e2e/global-teardown.js).
  globalTeardown: require.resolve('./e2e/global-teardown.js'),
  // En serie y con un solo trabajador: todas las pruebas comparten la misma base de datos, y dos que
  // escriban a la vez sobre el mismo documento se estorban. La velocidad no compensa el falso fallo.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    locale: 'es-ES',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
