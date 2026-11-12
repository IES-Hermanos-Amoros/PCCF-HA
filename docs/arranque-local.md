# Arrancar la aplicación en local, paso a paso

Para quien se baja la rama y quiere probarla en su máquina. Hay varios caminos, de más fácil a más
completo. Elige uno y no mezcles: el error más común es mezclar el 2 con el 3 (ver más abajo).

## Requisitos

- Node 20 o superior (probado con Node 24) y npm.
- Git, para bajar la rama: `git clone -b integracion <url del repositorio>`.
- Solo para el camino 3: Docker, o una base MongoDB (local o Atlas).

```bash
npm install
```

## Camino 1 · Sin base de datos (el más corto)

Sin `MONGODB_URI` la aplicación guarda todo en memoria, se siembra sola al arrancar y **imprime por
consola un enlace de acceso para cada persona de muestra**.

```bash
npm run dev
```

1. Mira la consola donde has lanzado `npm run dev`: salen varias líneas como
   `http://localhost:3000/acceso?t=<cadena larga de caracteres>`.
2. Pega uno en el navegador. Entras con esa persona.
3. Cada enlace sirve **una sola vez** y caduca a los 7 días. Si lo gastas, reinicia `npm run dev` y
   salen nuevos.

Lo que escribas se pierde al reiniciar. **No ejecutes `npm run sembrar` en este camino**: es otro
proceso y su memoria no la ve el servidor.

## Camino 2 · Entrar sin enlace, para probar

Igual que el 1, pero sin gastar enlaces: en `/entrar` eliges con qué persona ver la aplicación.

```powershell
# PowerShell
$env:PCCF_ACCESO_LIBRE=1; npm run dev
```
```bash
# Git Bash, Mac, Linux
PCCF_ACCESO_LIBRE=1 npm run dev
```

Sale una franja roja de «modo de pruebas». Solo funciona con `npm run dev` (no con `npm run start`),
y no se abre si `MONGODB_URI` apunta a una base que no está en tu máquina (Atlas, por ejemplo).

## Camino 2b · MongoDB local y `/entrar` (el cómodo para el día a día)

Lo escrito sobrevive a los reinicios, no hay enlaces que gastar ni cadenas que copiar. Es lo más
parecido a «solo `npm run dev`».

1. `docker compose up -d` (levanta un MongoDB en `localhost:27017`).
2. En `.env.local` (créalo copiando [`.env.example`](../.env.example)), una sola vez:

   ```
   MONGODB_URI=mongodb://localhost:27017
   PCCF_ACCESO_LIBRE=1
   ```
3. `npm run dev` y abre `http://localhost:3000/entrar`: eliges la persona y entras.

No hace falta sembrar: las pantallas crean las personas de muestra solas la primera vez que cargan.
Si `/entrar` sale sin personas, reinicia `npm run dev` y recarga.

### ¿Y si tu MongoDB es Atlas?

`/entrar` **no se abre nunca** con una base que no esté en tu máquina; es a propósito, para que este
atajo no pueda abrir datos de verdad. Hay dos salidas, de más a menos sencilla:

- **Usar Mongo en Docker** para probar, como arriba. Sigue teniendo Atlas para lo demás: basta con
  cambiar `MONGODB_URI` cuando toque.
- **Quedarte con Atlas y entrar con enlace**: camino 3, sembrando con
  `node --env-file=.env.local scripts/sembrar.js`.

## Camino 3 · Con MongoDB, para que lo escrito sobreviva

1. Elige la base:
   - **Local:** `docker compose up -d`, y `MONGODB_URI=mongodb://localhost:27017`.
   - **Atlas:** `MONGODB_URI=mongodb+srv://USUARIO:CLAVE@...` (ver [`infraestructura.md`](infraestructura.md)).
2. Crea `.env.local` copiando [`.env.example`](../.env.example) y rellena `MONGODB_URI`. Si el puerto
   no es el 3000, pon también `PCCF_URL_BASE=http://localhost:<puerto>`: los enlaces se construyen
   con esa dirección.
3. **Siembra las personas y los enlaces cargando el mismo `.env.local`:**

   ```bash
   node --env-file=.env.local scripts/sembrar.js
   ```

   Imprime un enlace por persona. Cópialos.
4. Arranca: `npm run dev`.
5. Pega un enlace en el navegador.

### Por qué hay que cargar el `.env.local` a mano al sembrar

`npm run dev` lo lee porque lo lee Next.js, pero `npm run sembrar` ejecuta un script de Node suelto
que **no lo lee**. Si `MONGODB_URI` está solo en `.env.local`, el guion siembra la memoria de su
propio proceso, imprime enlaces que parecen buenos y al terminar desaparecen; el servidor, en cambio,
se conecta a la base y la encuentra vacía. El síntoma es que **el enlace «no se encuentra»** y no se
puede entrar. El guion avisa con «OJO: sin MONGODB_URI…», pero es fácil no verlo entre los enlaces.

Lo mismo vale para `importar` y `cargar-reales`: o `node --env-file=.env.local scripts/<guion>.js`, o
la variable en la propia línea (`MONGODB_URI=... npm run cargar-reales`).

### Con una base vacía

Es lo normal la primera vez: no hay personas ni enlaces hasta sembrar (paso 3). Si ya sembraste y
gastaste los enlaces, vuelve a sembrar: es idempotente (no duplica personas) y genera enlaces nuevos.

## Si no entras

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| El enlace dice que no se encuentra o no vale | Se sembró en otro sitio (memoria) o ya se usó | Camino 3, paso 3; o reinicia en los caminos 1 y 2 |
| `/entrar` no ofrece personas, o `/api/acceso-libre` da 404 | Falta `PCCF_ACCESO_LIBRE=1`, o usas `npm run start`, o `MONGODB_URI` apunta a Atlas u otra máquina | Camino 2b (Mongo en Docker), o camino 3 con enlaces |
| Todas las rutas dan 401 | No hay personas en la base | Sembrar |
| Los enlaces salen con otro puerto | `PCCF_URL_BASE` | Ajustarlo en `.env.local` y volver a sembrar |
| No arranca | Dependencias o Node antiguo | `npm install`, y `node -v` |
