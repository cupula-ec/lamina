# Handoff v1.2 — qué está hecho y qué falta para desplegar

Estado al 22 oct 2026. Plan de origen: `docs/PLAN-v1.1-features.md` (las decisiones de su §1 están confirmadas por Esteban; no se re-preguntan). Rama `main`, **nada pusheado ni desplegado**.

## Hecho (commiteado)

| Commit | Contenido |
|---|---|
| `4b562a1` | Paso 0: contratos (`Branding`, `themes.ts`, `themeId` enum con `.catch`), tablas `institutions`/`ocr_pages`, migración `0001_branding_ocr`, ADR-011/012 stubs. |
| `a82f468` | Área A (onboarding `/bienvenida`, instituciones + seed UPS, logos con sanitización, Materia/Período/Grupo, carátula `cover-branded`) y B (10 temas × 3 acentos, decoración SVG procedural, 11 layouts y 7 componentes nuevos, `chooseStyle`, `ThemePicker`, cambio de estilo `kind:"style"`). |
| `57f49f5` | Área C: OCR (poppler + Tesseract `spa+eng`, visión `:free` → LaTeX validado, consentimiento aparte, cuota `ocr_vision_page`), migración `0002_ocr_progress`, ADR-014. |
| `8524ef3` | Área D: servidor MCP (`packages/mcp`, `/api/mcp`, OAuth vía `@better-auth/oauth-provider`, `/cuenta/conectar`, panel admin), migración `0003_mcp_oauth`, ADR-013, `docs/mcp.md`; más los arreglos de la revisión de A+B (nombre >120, firma de logos, regeneración de `meta.branding` en servidor, etc.). |
| `f47da81` | Dos propuestas de hero en `/dev/landing-a` y `/dev/landing-b`. **Esteban eligió la A (editorial académica).** |

Al cierre de la sesión: `pnpm typecheck` sin errores; los agentes reportaron tests verdes por área (contracts, db, engine, components, web, worker, research, ai, mcp). **No se corrió un `pnpm test` global final ni ningún e2e de Playwright.**

## Falta (en orden)

1. **Landing completa (elegida A).** Se lanzó el agente y se detuvo antes de escribir nada. Reemplazar `apps/web/src/app/page.tsx` según `PLAN §7.E.2` reutilizando `components/landing/{demo.ts,DemoA.tsx,landing-a.css}`; borrar `/dev/landing-a|b`; capturas en `docs/evidence/landing-*.png`; accesibilidad ≥95; no romper `/login` ni e2e. OCR y MCP se describen sin prometer fechas (aún no desplegados).
2. **Revisión del MCP/OAuth (`reviewer`).** Se lanzó y se detuvo sin resultado: **el MCP no ha sido revisado**. Foco: registro dinámico anónimo y CIMD (SSRF, suplantación de nombre en el consentimiento), audience/scopes/refresh/revocación, `/api/mcp` (Origin, tamaño del body antes de parsear, rate limit en memoria por instancia), IDOR entre cuentas, transiciones `mcpContentSubmitted`/`mcpDeckSubmitted`, contenido no confiable. Aplicar solo hallazgos verificados contra el código.
3. **Cierre de documentación** (no marcar nada sin evidencia): `content/changelog/<fecha>-v1.2.0.md` (el `…-v1.1.0.md` ya existe), `package.json` versión (hoy `1.0.0`), `README.md`, `docs/known-limitations.md`, `docs/acceptance.md` (sección v1.2 con evidencia), revisar `docs/adr/README.md` (011/012 siguen «Propuesta» en la tabla aunque ya se implementaron; 013/014 incluidos).
4. **Verificación global** (todo con `heavy.sh`: `/home/siramong/Proyectos/cupula-systems/internal/nexum/frontend/scripts/heavy.sh`):
   - `pnpm typecheck` y `DATABASE_URL=postgres://lamina:lamina@127.0.0.1:55432/lamina heavy.sh pnpm test` (Postgres: `docker compose -f docker-compose.dev.yml up -d`).
   - e2e: `heavy.sh pnpm --filter @lamina/e2e test` (onboarding → crear → carátula; cambio de tema; PDF escaneado → fuente OCR; MCP). Nunca se ejecutaron.
   - **Migraciones 0001–0003 sobre una copia de la BD de producción** (restore de backup) y comprobar que presentaciones/decks existentes abren y renderizan igual (`themeId` legado, `meta.branding` ausente).
   - Construir la imagen del worker (`docker/Dockerfile`: poppler + tesseract-ocr-spa/eng/osd) — no se ha construido.
   - Prueba manual del MCP con Claude Code real: `claude mcp add --transport http lamina <URL>/api/mcp`, `/mcp` → Authenticate, crear una presentación de Cálculo y verla en `/presentations/<id>`. Ver `docs/evidence/mcp-claude-code.txt`. Solo se probó hasta «Needs authentication».
5. **Deploy** (`scripts/deploy.sh` → cloud-2): **pedir confirmación explícita a Esteban antes** y antes de taggear `v1.2.0`. El script hace rsync + build + migraciones + up. Variables nuevas a revisar en el `.env` de prod (ver `.env.example` y `docker-compose.prod.yml`): `LAMINA_OCR_CONCURRENCY`, `LAMINA_MODELS_VISION` (opcional), `APP_URL`/HTTPS correcto para el audience del MCP, y `BETTER_AUTH_SECRET` estable (rotarlo invalida las URLs firmadas de logos). El worker de prod sube a 1536 m de memoria.

## Pendientes que dependen de Esteban

- Validar el uso de la marca/logo UPS (`apps/web/public/institutions/ups.{svg,png}`, azul `#003976`, dorado `#FCC000`; se descargaron del sitio oficial).
- Confirmar que cloud-2 aguanta Tesseract + poppler (solo se midió ~0,5 s/página limpia en local).
- Aprobar deploy y versión `v1.2.0`.
- Probar el MCP con Claude real (arriba).

## Decisiones y riesgos a conocer

- **Usuarios existentes:** todos pasan por `/bienvenida` en su próximo ingreso (opción conservadora; se puede hacer backfill de `onboarded_at`).
- **Consentimiento:** `CONSENT_VERSION` no se subió (`2026-10`); el texto OCR lleva `OCR_CONSENT_VERSION = "2026-10-ocr1"` y su checkbox es aparte, por presentación.
- **Esquema extra no pedido por el plan:** `presentations.progress` (migración 0002), `mcp_connections`, `presentations.origin` y tablas OAuth (0003).
- **`theme_id`** guarda `tema`, `tema:acento` o `tema:acento:ia` (propuesta de la IA vs elección del docente).
- **OAuth:** `@better-auth/*` fijado a 1.7.11 (existe 1.7.12; subir todos juntos). El registro dinámico anónimo está activo como respaldo (limitado, 10/min) y no hay limpieza automática de clientes registrados.
- **Rate limits** de logos y MCP viven en memoria por proceso.
- **Logos:** se conservan las 3 versiones previas por dueño; reemplazar el logo de una institución cambia las portadas ya publicadas que lo usan.
- Visión OCR: modelos `:free` verificados el 22 oct (gemma-4-31b/26b, nemotron-3.5-super-vl); pueden cambiar.
- La BD de desarrollo tiene un usuario de prueba `mcp.docente@test.ec` y presentaciones de pruebas.
- `docs/audit 20 OCT.md` sigue sin trackear (no es de esta entrega).
- El commit `a82f468` no compila aislado (depende de `57f49f5`); no usar `git bisect` entre ambos.

## Reglas de trabajo (política de Esteban)

Subagentes `explorer → planner → implementación → reviewer`, máx. 1–2 simultáneos; tests pesados con `heavy.sh`; IA solo `:free`; `pkexec` en vez de `sudo`; commits convencionales en español con `Co-Authored-By`; no push/deploy sin su confirmación; no apagar el equipo salvo `apagar run`.
