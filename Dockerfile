# Imagen de la aplicación.
#
#   docker build -t pccf-ha .
#   docker compose -f docker-compose.produccion.yml up -d
#
# Lo que no entra en la imagen está en .dockerignore. `docker build` no lee
# .gitignore, así que es ahí donde se excluyen los documentos del departamento.

FROM node:24-alpine AS dependencias
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS compilacion
WORKDIR /app
COPY --from=dependencias /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-alpine AS ejecucion
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup -S pccf && adduser -S pccf -G pccf

# `output: 'standalone'` deja en .next/standalone un servidor con solo las
# dependencias que usa.
COPY --from=compilacion --chown=pccf:pccf /app/.next/standalone ./
COPY --from=compilacion --chown=pccf:pccf /app/.next/static ./.next/static

USER pccf
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/salud').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
