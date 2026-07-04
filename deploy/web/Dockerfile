# Production web image: build the client bundle, serve it with Caddy.
#
# Caddy terminates TLS for the LAN (internal CA — self-signed) and reverse-
# proxies the relay paths to the `server` service, so the app and the API share
# one origin. VITE_RELAY_URL is pinned to "" at build time: the client then
# issues relative fetches ("/v1/…"), which makes the bundle hostname-agnostic —
# it works for any LAN IP or hostname Caddy answers on.
FROM node:22 AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/client/package.json apps/client/
RUN pnpm install --frozen-lockfile
COPY apps/client apps/client
# The whole app lives under /mneme (SPA assets via --base, API calls via
# VITE_RELAY_URL) so the rest of the origin stays free for other services.
ENV VITE_RELAY_URL="/mneme"
RUN pnpm --filter client build --base=/mneme/

FROM caddy:2
COPY deploy/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/client/dist /srv
