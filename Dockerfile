# Dockerfile — « Je fais le plein ou non ? »
# Build de production Nuxt/Nitro en deux étapes (build + runtime Node).

# Le stage build a besoin des outils de compilation : better-sqlite3 est un
# module natif (node-gyp) qui compile à l'installation et exige Python + gcc.
# Le module compilé est bundlé par Nitro dans .output — le runtime n'en a pas
# besoin.
FROM node:22-alpine AS build
WORKDIR /app

# python3 + make + g++ : outils node-gyp pour better-sqlite3.
RUN apk add --no-cache python3 make g++

# Copie du dépôt AVANT npm install : le postinstall (`nuxt prepare`) génère
# .nuxt/types en se basant sur la config complète (nuxt.config.ts + modules).
# Sinon, le type-check de nuxt build échoue sur 'pwa' non résolu.
COPY . .

RUN npm install

RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV NITRO_HOST=0.0.0.0
ENV NITRO_PORT=3000

COPY --from=build /app/.output .output
# Migrations SQLite nécessaires au démarrage (server/plugins/migrate.ts) :
# en dehors du bundle Nitro, on les copie explicitement dans l'image.
COPY server/db/migrations server/db/migrations

EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
