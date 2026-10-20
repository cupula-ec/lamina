# syntax=docker/dockerfile:1.7
# Imágenes de Lámina: web (Next standalone), worker (pg-boss + IA) y renderer (Playwright/Chromium).
ARG NODE_IMAGE=node:24-bookworm-slim

FROM ${NODE_IMAGE} AS base
RUN corepack enable && corepack prepare pnpm@11.15.1 --activate
WORKDIR /repo

# ───────── Construcción de la web ─────────
FROM base AS web-build
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @lamina/web build

FROM ${NODE_IMAGE} AS web
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3100 HOSTNAME=0.0.0.0
WORKDIR /repo
COPY --from=web-build /repo/apps/web/.next/standalone ./
COPY --from=web-build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=web-build /repo/apps/web/public ./apps/web/public
COPY --from=web-build /repo/content ./content
RUN mkdir -p /data && chown 10001:10001 /data
USER 10001:10001
EXPOSE 3100
CMD ["node", "apps/web/server.js"]

# ───────── Worker (y migraciones) ─────────
FROM base AS worker-deps
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile --prod --filter "@lamina/worker..." --filter "@lamina/db..."

FROM ${NODE_IMAGE} AS worker
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=worker-deps /repo ./
RUN mkdir -p /data && chown 10001:10001 /data
USER 10001:10001
WORKDIR /repo/apps/worker
CMD ["node_modules/.bin/tsx", "src/main.ts"]

# ───────── Renderer (Chromium de Playwright) ─────────
FROM base AS renderer-deps
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile --prod --filter "@lamina/renderer..."

FROM mcr.microsoft.com/playwright:v1.64.1-noble AS renderer
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=renderer-deps /repo ./
RUN mkdir -p /data && chown 10001:10001 /data
USER 10001:10001
WORKDIR /repo/apps/renderer
CMD ["node_modules/.bin/tsx", "src/main.ts"]
