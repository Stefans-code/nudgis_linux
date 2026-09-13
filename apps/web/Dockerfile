# Pannello admin: build statico servito da nginx, che fa anche da reverse proxy verso
# il container server per /auth e /admin (il browser parla con una sola origine).
FROM node:20-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
RUN npm install --workspace=apps/web --include-workspace-root

COPY apps/web apps/web
# Origin vuota = chiamate relative alla stessa origine (nginx le inoltra al server via
# proxy_pass, vedi nginx.conf) — niente configurazione CORS da fare lato cliente.
ENV VITE_API_URL=""
RUN npm run build --workspace=apps/web

FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
