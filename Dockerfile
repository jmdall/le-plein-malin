# Dockerfile — « Je fais le plein ou non ? »
# Build de production Nuxt/Nitro en deux étapes (build + runtime Node).

FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
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
