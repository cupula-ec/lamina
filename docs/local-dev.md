# Desarrollo local

Requisitos: Node 24+, pnpm 11, Docker.

```bash
pnpm install
docker compose -f docker-compose.dev.yml up -d            # Postgres (55432) y SearXNG (58080)
cp .env.example apps/web/.env.local                        # DATABASE_URL, BETTER_AUTH_SECRET, DATA_DIR…
docker build -f sandbox/Dockerfile -t lamina-sandbox:latest .   # imagen del sandbox de componentes
pnpm --filter @lamina/db migrate
cd apps/web && npx tsx scripts/create-user.ts docente@test.ec "Docente" "ClaveDocente123" && cd ../..
./scripts/dev-up.sh        # web :3100, worker, renderer y sandbox-runner :8600 (IA fake). Logs: /tmp/lamina-dev
```

Pruebas: `pnpm typecheck && pnpm test` (necesita el Postgres de desarrollo) y `pnpm --filter @lamina/e2e test` (E2E con IA fake).
Galería de componentes (solo desarrollo): <http://localhost:3100/dev/gallery>.
Con IA real: `LAMINA_AI_PROVIDER=openrouter OPENROUTER_API_KEY=… ./scripts/dev-up.sh` (solo modelos `:free`).
