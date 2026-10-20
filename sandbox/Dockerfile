# Imagen del sandbox: build/test de componentes generados por IA. Se ejecuta con gVisor, sin red y rootfs de solo lectura.
FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.15.1 --activate
COPY sandbox/package.json sandbox/pnpm-workspace.yaml ./
RUN pnpm install --prod
COPY packages/sandbox-kit/src/astcheck.ts /tmp/astcheck.ts
RUN node_modules/.bin/esbuild /tmp/astcheck.ts --bundle --platform=node --format=esm --outfile=astcheck.mjs --external:typescript
COPY sandbox/sdk ./sdk
COPY sandbox/run.mjs ./run.mjs

FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app /app
RUN mkdir -p /work && chown 10002:10002 /work && chmod -R a+rX /app
USER 10002:10002
CMD ["node", "/app/run.mjs"]
