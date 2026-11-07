# Infraestructura: qué montar, en qué orden y qué cuesta

Lo que hace falta para que esto pase de correr en un portátil a que lo use el departamento, por
orden de cuándo conviene hacerlo. Cada paso dice **por qué** hace falta y **qué pasa si no se hace**,
para poder saltarse los que no compensen todavía.

La aplicación **arranca sin nada de esto**: sin `MONGODB_URI` usa el adaptador de memoria, se siembra
sola con personas inventadas y escribe por consola un enlace de acceso para cada una. Lo que se
escriba se pierde al reiniciar. Para programar una pantalla es justo lo que hace falta.

---

## 1. En local: MongoDB en un contenedor · **hecho**

```bash
docker compose up -d                                    # levanta mongo:8 en 127.0.0.1:27017
MONGODB_URI=mongodb://localhost:27017 npm test          # 359 pruebas, con el adaptador real
npm run dev                                             # con .env.local apuntando a esa base
```

**Por qué.** `repositorio/` tiene dos adaptadores con la misma interfaz, y `test/repositorio.js`
ejecuta la misma batería contra los dos. Sin una base de datos de verdad, **la mitad de
`repositorio/mongo.js` no se prueba nunca**: ni los índices únicos, ni la escritura condicionada por
versión que impide que dos docentes se pisen, ni el uso único de los enlaces de acceso. Son
exactamente las tres cosas que el adaptador de memoria resuelve de otra manera.

El contenedor escucha **solo en `127.0.0.1`** a propósito, para que no quede una base de datos
abierta a la red del instituto por haber escrito `27017:27017` sin pensarlo.

`docker compose down` para y conserva los datos; `down -v` los borra.

## 2. Integración continua en GitHub · **hecho**

[`.github/workflows/pruebas.yml`](../.github/workflows/pruebas.yml) ejecuta la batería **dos veces**
en cada empujón: con el adaptador de memoria y contra un MongoDB de verdad, y comprueba que la
aplicación compila. No necesita ningún secreto ni ningún documento del departamento.

**Qué pasa si no.** Que se rompe algo del camino de Mongo y no se nota hasta el día del despliegue,
que es siempre el peor día para enterarse.

---

## 3. MongoDB Atlas

Cuando haya que guardar algo que no se pueda perder.

1. Cuenta, organización y proyecto.
2. Clúster **M0** (gratuito): 512 MB, sin copias de seguridad, se **pausa a los 30 días sin uso**.
3. **Región europea** (Fráncfort, Irlanda, París…). No es un capricho: los documentos llevan nombres
   del profesorado y de las empresas de FCT.
4. Usuario de base de datos con permiso solo sobre la base de la aplicación, no sobre el clúster.
5. Acceso de red: la IP de casa para trabajar, y para Vercel hace falta abrir `0.0.0.0/0` —las
   funciones no tienen IP fija en los planes básicos—, lo que convierte **la contraseña en la única
   puerta**. Que sea larga y que no salga del gestor de contraseñas.
6. `MONGODB_URI` y `MONGODB_DB` en `.env.local` y en Vercel. **Bases distintas** para pruebas y para
   trabajo: las pruebas borran lo que encuentran.

**Las dos cosas que duelen del plan gratuito.** Que **no hay copias de seguridad**: para un documento
del que depende el departamento en septiembre, eso hay que resolverlo aparte (ver §6). Y que se pausa
sola: si el departamento no lo toca en julio y agosto, en septiembre está pausado y hay que
despertarlo.

512 MB sobran: la PD entera ocupa unos 3 MB.

## 4. Vercel

1. Importar el repositorio de GitHub. Next.js se detecta solo; no hace falta configuración.
2. Variables de entorno: `MONGODB_URI`, `MONGODB_DB`, `PCCF_URL_BASE`.
3. Región de despliegue **europea** (`fra1`), por lo mismo que Atlas, y además porque la función y la
   base de datos en continentes distintos se pagan en milisegundos en cada consulta.
4. Antes de dar la dirección a nadie: entrar, dar de alta a una persona, canjear su enlace, importar
   un documento y exportar el PDF.

**Lo que hay que mirar antes de elegir Vercel** (comprobado en abril de 2026, pero estas cosas
cambian: confírmalo en su página):

- **El plan Hobby es solo para uso no comercial**, y su definición es amplia: cubre cualquier
  despliegue del que saque provecho económico alguien que haya participado en hacerlo, incluido un
  empleado al que le pagan. Una herramienta hecha por un docente para su departamento está, como
  poco, en zona gris. Merece una consulta antes de montar el curso entero encima. Si no encaja, las
  salidas son el plan Pro (unos 20 $ al mes) o alojarlo en una máquina del centro.
- **4,5 MB** de límite para el cuerpo de una petición. El `.docx` de la PD de DAW pesa 1,3 MB y cabe
  de sobra, pero un PCCF con imágenes podría no entrar. Si pasa, la salida es subir el fichero a un
  almacén (Vercel Blob) y que la función lo lea de allí.
- **Hasta 300 s** de duración de función en Hobby. La importación tarda unos 5 s y las rutas ya
  declaran `maxDuration = 60`: holgado.

## 5. El envío de los enlaces de acceso

Hoy el alta **devuelve el enlace para que la jefatura lo copie** y lo mande por donde quiera. Funciona
y es honesto, pero no escala a un claustro.

Hace falta: un proveedor (Resend, Brevo, Mailgun… todos con plan gratuito suficiente para esto), un
remitente del centro, y decidir qué hacer cuando un envío falla. Con dominio propio hay que configurar
SPF y DKIM, o los correos acaban en la carpeta de no deseados, que para un enlace de acceso es lo
mismo que no enviarlo.

## 6. Copias de seguridad

El plan gratuito de Atlas no las hace, y esto guarda el trabajo de un departamento entero.

Lo barato y suficiente: una tarea programada que haga `mongodump` y se lleve el resultado fuera. Y
hay una red que ya existe y conviene usar: **la aplicación exporta a `.docx` y a PDF**, así que un
volcado de los documentos aprobados al final de cada trimestre deja copias legibles sin depender de
que nadie sepa restaurar un Mongo.

---

## 7. Alojarlo todo en una máquina

La alternativa a Vercel + Atlas: una máquina virtual pequeña en Europa con la aplicación y el MongoDB
dentro. Hay un `Dockerfile` y un `docker-compose.produccion.yml` para eso, probados.

```bash
cp .env.example .env.produccion                                   # y rellenarlo
docker compose -f docker-compose.produccion.yml up -d --build
```

Resuelve de golpe cuatro cosas que por separado cuestan: la IP de salida es fija porque una máquina
la tiene, las copias de seguridad son tuyas, los datos están donde decidas, y desaparece la duda
sobre el uso no comercial del plan de Vercel. A cambio, hay que mantenerla.

**Lo que el `compose` no trae y hace falta poner encima:**

- **Un proxy delante con HTTPS** (Caddy o Traefik lo hacen solos con Let's Encrypt). No es opcional:
  la cookie de sesión se marca `Secure` en producción, así que **sin HTTPS no se puede entrar**.
- **Copias de seguridad fuera de la máquina**: un `mongodump` programado que se lleve el resultado a
  otro sitio. Una copia en el mismo disco que el original no es una copia.
- **Cortafuegos** que deje entrar solo al proxy. La base de datos no se asoma a ninguna red: solo la
  alcanza la aplicación, por la red interna del `compose`.

### Sobre el crédito de Azure for Students

Da **100 $ y 12 meses**, lo que llegue antes; lo no gastado no se acumula; y renovar exige seguir
siendo estudiante. Si no, hay que pasar a pago por uso con tarjeta. Son unos **8 $ al mes
sostenibles**.

Con eso, la cuenta sale así:

| Forma | Coste aproximado | Dura el crédito |
|---|---|---|
| App Service + red virtual + NAT Gateway (la única que da IP fija en App Service) | la pasarela sola, por hora y por GB, es la pieza cara | un par de meses |
| Máquina virtual pequeña + IPv4 fija | del orden de 11 $/mes | unos nueve meses |
| Container Apps en consumo | barato, pero **sin IP fija** | — |

O sea: si se usa el crédito, la forma sensata es **una máquina**, no App Service con pasarela.

Y conviene tener presente el riesgo que no es técnico: una suscripción que caduca a los doce meses y
está atada a una cuenta personal no es sitio para el documento del que depende el departamento en
septiembre. Si la cuenta es de otra persona, la herramienta se va con ella el día que cambie de
centro.

Por eso lo que de verdad protege no es elegir bien el proveedor, sino que **mudarse no duela**: con la
imagen, cambiar de Azure a un servidor de cinco euros o a un equipo del centro es una tarde.

## Sobre la IP fija y Atlas: por qué no se arregla cambiando de nube

Abrir `0.0.0.0/0` en Atlas incomoda, y la reacción natural es buscar un alojamiento con IP de salida
fija para poder cerrar la lista. No sale a cuenta, por tres razones que conviene tener juntas:

1. **En M0 no hay red privada con nadie.** Los *endpoints privados* y el emparejamiento de redes de
   Atlas exigen **M10 o superior**, es decir, clúster dedicado de pago. Así que la conexión va a
   cruzar la red pública con TLS y contraseña **se aloje donde se aloje** la aplicación. La lista de
   IP es una segunda cerradura, no la cerradura.
2. **Azure no la da barata.** App Service fuera de un entorno dedicado es multiinquilino y la
   plataforma **no garantiza un conjunto estable** de direcciones de salida; Container Apps en
   consumo dice directamente que pueden cambiar. Para fijarla hace falta integración con red virtual
   **y un NAT Gateway**, lo que sube el plan a Basic o Dedicated y añade la factura de la pasarela.
   Sale más caro que el problema que resuelve. Y si se recurre al conjunto de IP «conocidas» de un
   plan compartido, se está autorizando a las aplicaciones de otros inquilinos que comparten ese
   conjunto, que es casi tan abierto como no filtrar.
3. **Lo que de verdad protege ya está puesto**: TLS obligatorio, usuario con permiso solo sobre su
   base de datos, y una contraseña larga que no sale del gestor. El vector realista no es alguien
   barriendo la red, es que la cadena de conexión se escape; y contra eso la lista de IP ayuda, pero
   lo que arregla el problema es rotar la contraseña.

**Si aun así se quiere IP fija**, la forma barata no es Azure: es una máquina virtual pequeña en
Europa (del orden de 5 € al mes). Una máquina tiene IP fija por definición, y encima puede llevar el
MongoDB dentro —el mismo `docker-compose.yml` de §1—, lo que de paso resuelve las copias de seguridad
(§6), la pregunta de dónde residen los datos, y la duda sobre el uso no comercial de Vercel. A cambio,
alguien tiene que mantenerla.

**Qué hacer hoy:** seguir con Atlas y `0.0.0.0/0`, con usuario de permisos mínimos y contraseña
larga, y dejar la máquina propia como salida para cuando se resuelva lo del plan de Vercel, que es la
decisión que de verdad puede obligar a mover la aplicación.

## Lo que NO hace falta

- **Azure.** Tenía sentido si el acceso fuera con las cuentas corporativas de la GVA (Entra ID), y se
  decidió lo contrario: alta por la jefatura con enlace de un solo uso, justamente para no depender
  de un directorio que no controlamos. Y como salida para la IP fija tampoco compensa, por lo que
  dice la sección anterior. Mientras eso no cambie, Azure no pinta nada aquí.
- **Docker para la aplicación.** Es Next.js sobre Node: se despliega tal cual. El contenedor es solo
  para la base de datos en local.
- **Redis, colas, CDN de imágenes.** No hay nada que lo pida: siete documentos, un departamento.

## Lo que hay que hablar con el centro

El repositorio es público y no lleva dentro ningún dato personal, y eso está cuidado. Pero **la
aplicación desplegada sí los va a llevar**: nombres del profesorado, correos, y dentro de los
documentos las empresas de FCT. Eso cambia las preguntas:

- dónde se alojan (de ahí la insistencia en regiones europeas);
- quién es responsable de esos datos, que no es quien programa la herramienta;
- qué pasa cuando alguien deja el centro;
- y si la dirección quiere enterarse antes de que esto esté en uso, que es mejor que después.

No bloquea nada de lo técnico, pero conviene plantearlo antes de que el departamento entero dependa
de la herramienta y sea incómodo cambiarla de sitio.
