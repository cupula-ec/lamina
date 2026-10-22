# ADR-003 — Stack

**Fecha:** 19 oct 2026 · **Estado:** aceptada

| Pieza | Elección | Alternativas | Motivo |
|---|---|---|---|
| Repo | monorepo pnpm (sin Turborepo) | polirepo, Nx | contratos compartidos y 1 CI; pnpm basta |
| Web | Next.js 16 (App Router, Server Actions), React 19, Tailwind 4 | Remix, SvelteKit | ecosistema, SSR + acciones de servidor con Origin check |
| Auth | Better Auth (correo+contraseña, Google, genericOAuth Keycloak, plugin admin) | Auth.js | plugin admin (alta/bloqueo), control de hooks para «alta solo por admin» |
| BD | Postgres 17 + Drizzle | Prisma | tipos, migraciones SQL simples |
| Cola | pg-boss (en el mismo Postgres) | BullMQ+Redis | sin Redis, reintentos/backoff, `singletonKey` (idempotencia) |
| Render | Playwright/Chromium en worker propio (concurrencia 2, 1 deck = 1 sesión de contexto) | Puppeteer | capturas + detección de problemas con el **mismo** engine |
| IA | cliente HTTP propio sobre la API OpenAI-compatible de OpenRouter + Zod | Vercel AI SDK | el plan recomendaba el SDK; se usó `fetch` directo para controlar el guard `:free` en cada petición y no depender de cambios de API del SDK (la lógica de fallback y reparación es propia) |
| Matemática | KaTeX, mathjs (con lista blanca de AST), SVG propio | MathJax, D3 completo | salida estable y sin `eval` |
| Ingesta | unpdf, mammoth, Readability+jsdom+turndown | — | texto; OCR de escaneos con poppler + Tesseract en el worker desde v1.2 (ADR-014) |

**Hosting:** cloud-2 (compose en `/opt/lamina`), nginx + certbot, DNS en PowerDNS, monitoreo Kuma/NOC/Glance/status page (ver `docs/info.md` §52–53 del repo de infra).
