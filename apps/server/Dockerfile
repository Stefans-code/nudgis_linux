# Immagine server (API Express + bot Telegram + Prisma/SQLite).
# node:20-bookworm-slim invece di alpine: il query engine di Prisma è più affidabile
# su glibc (Debian) che su musl (Alpine) senza dover configurare binaryTargets extra.
FROM node:20-bookworm-slim AS build
WORKDIR /app

# Copiamo prima solo i manifest per sfruttare la cache Docker sugli step di install.
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/package.json
RUN npm install --workspace=apps/server --include-workspace-root

COPY apps/server apps/server
RUN npm run prisma:generate --workspace=apps/server
RUN npm run build --workspace=apps/server

# --- Runtime: solo l'essenziale, non i devDependencies/sorgenti TS ---
FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/package.json
# NB: includiamo anche "prisma" (devDependency) perché il comando di avvio esegue
# "prisma migrate deploy" — serve la CLI, non solo il client generato.
RUN npm install --workspace=apps/server --include-workspace-root

COPY --from=build /app/apps/server/dist apps/server/dist
COPY --from=build /app/apps/server/prisma apps/server/prisma
COPY --from=build /app/node_modules/.prisma node_modules/.prisma
COPY --from=build /app/node_modules/@prisma node_modules/@prisma

WORKDIR /app/apps/server

# Il DB SQLite vive in un volume esterno (vedi docker-compose.yml), non nell'immagine:
# altrimenti ogni rebuild perderebbe i dati.
VOLUME ["/data"]

EXPOSE 4000

# Applica le migrazioni e poi avvia: così un container nuovo/aggiornato non parte mai
# con uno schema disallineato dal codice.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
