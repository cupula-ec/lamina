# Contribuir a Lámina

Gracias por ayudar. Lámina es software libre (AGPL-3.0) y los pull requests requieren aceptar el [CLA](CLA.md) (lo pide el bot en el primer PR).

## Entorno local

Ver [docs/local-dev.md](docs/local-dev.md). Resumen: Node 24, pnpm 11, Docker (Postgres y SearXNG), `LAMINA_AI_PROVIDER=fake` para trabajar sin claves.

## Antes de abrir un PR

```bash
pnpm typecheck && pnpm test      # unidad e integración (Postgres de docker-compose.dev.yml)
pnpm --filter @lamina/e2e test   # E2E con IA fake (requiere ./scripts/dev-up.sh)
```

- Los contratos (`packages/contracts`) son versionados: un cambio incompatible exige subir `schemaVersion` y escribir un ADR.
- Las transiciones del workflow viven **solo** en `packages/db/src/workflow.ts`.
- Nada de modelos que no terminen en `:free`: el guard (`packages/ai/src/guard.ts`) y sus tests no se relajan.
- Los componentes nuevos del catálogo estable llevan manifest, fixtures, tests de render y documentación (ver `packages/components/src/defs/*`).

## Proponer un componente

Los componentes generados por la IA llegan como PR automático desde el panel de administración (carpeta `community/components/<Id>/`). Revisa el código (se ejecuta en un iframe aislado), las pruebas y la captura antes de fusionar.
