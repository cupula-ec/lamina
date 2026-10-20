# Lámina v1 — Plan de ejecución (19 → 23 oct 2026)

> **Para el agente ejecutor:** el brief del producto es `plan.md`; este archivo contiene las decisiones ya **confirmadas por Esteban** (no se vuelven a preguntar) y el orden de trabajo.
> - Infra de Cúpula: `../internal/infra/CLAUDE.md` y `../internal/infra/docs/info.md` (DNS PowerDNS, nginx, monitoreo, Keycloak, white-labeling). Todo cambio de infra se documenta ahí.
> - cloud-2 (`ssh cupula-server-cloud-2`) corre NEXUM en `/opt/nexum` con `scripts/deploy.sh`; sirve de referencia para el despliegue.
> - Credenciales de infra en `~/.config/cupula-infra/`. **No** usar la clave OpenRouter de `cupula-memory.env`: la clave dedicada la entrega Esteban.
> - **Gasto IA = 0 USD.** Solo modelos `:free`, aunque la cuenta tenga saldo.

## Contexto

Repo vacío (`lamina/plan.md` = brief). Objetivo: **v1 completa, sin recortes, en producción en `https://lamina.cupula.com.ec` el viernes 23 oct**, trabajo continuo. Sin demo pre-armada: la aceptación es un docente real partiendo de cero.

### Decisiones confirmadas con Esteban
| Tema | Decisión |
|---|---|
| Alcance | v1 completa vie 23 (fases 1-3 del brief), non-stop |
| Hosting | **cloud-2**, docker compose en `/opt/lamina` (patrón NEXUM), nginx + certbot, DNS en PowerDNS, monitoreo Kuma/NOC/Glance/status page |
| IA | **Solo modelos `:free` de OpenRouter. Gasto real = 0 USD** (la cuenta tiene saldo, prohibido usarlo). Clave dedicada la entrega Esteban al necesitarla |
| Búsqueda | SearXNG self-hosted (principal) + Tavily free (respaldo; clave pendiente) |
| Usuarios | Alta solo desde panel admin: correo + **contraseña temporal enviada por correo automático** (SMTP Stalwart Cúpula), cambio obligatorio al 1er ingreso; además pueden entrar con **Google** si el correo está dado de alta |
| Admin | `esteban.morocho@cupula.com.ec` entra por **Keycloak (CUPULA SSO)**, OIDC |
| Repo | `github.com/cupula-ec/lamina` público, **AGPL-3.0 + CLA** (CLA Assistant en PRs) |
| Catálogo | Promoción provisional→estable en **panel admin** (instantánea, versionada en BD) **+ PR automático** al repo |
| Privacidad | Aviso claro + consentimiento al primer ingreso y en subida de materiales: el texto va a proveedores IA gratuitos que pueden retenerlo |
| Marca | Identidad propia Lámina (académica, clara, alto contraste para proyector), "by Cúpula Systems" |
| Autorización | E2E completo autónomo: repo, push, deploy, DNS, nginx/TLS, monitoreo, cliente OAuth GCP, cliente Keycloak, buzón SMTP |

## Diagnóstico técnico breve

- **Riesgo #1: modelos gratuitos.** Calidad variable, rate limits (~20 req/min, cupo diario), soporte irregular de JSON/tool-calling, modelos que desaparecen. Mitigación: cadena de fallback por rol, salida estructurada validada con Zod + reparación acotada, presupuesto global diario en BD, guard duro que rechaza cualquier modelo que no sea `:free`, y la clave con límite de crédito 0 USD.
- **Riesgo #2: componentes generados por IA.** Ejecución solo en contenedor efímero sin red y en navegador dentro de iframe `sandbox` con origen opaco. Nunca en el proceso web/worker.
- **Riesgo #3: plazo.** El orden de trabajo pone primero el despliegue y los contratos, y después todo en vertical.
- **Google ADK: no.** Ver ADR-002. El flujo es una máquina de estados explícita y las "IA" son pasos con salida estructurada; solo Research y Especialista de componentes tienen bucles de herramientas, con tope de iteraciones.

## Stack (recomendado)

- **Monorepo pnpm** (sin Turborepo). Node 24, TypeScript estricto.
- `apps/web`: **Next.js 16** (App Router, Server Actions + Route Handlers), React 19, Tailwind 4, shadcn/ui, **Better Auth** (Google, email+password, genericOAuth Keycloak, plugin admin), **Drizzle** + **Postgres 17**.
- `apps/worker`: Node con **pg-boss** (cola en el mismo Postgres: reintentos, backoff, singleton keys para idempotencia, sin Redis).
- `apps/renderer`: worker de **Playwright/Chromium** (cola propia, concurrencia 2, timeout por deck).
- `sandbox/`: imagen Docker para build/test de componentes generados (esbuild + vitest + happy-dom); se lanza por la API de Docker desde el worker con `--network none`, rootfs de solo lectura, tmpfs, `--memory 512m --cpus 1 --pids-limit 128`, timeout 60 s, sin env ni secretos; gVisor `runsc` si está disponible en cloud-2 (verificar).
- **IA**: Vercel AI SDK (`ai`) + `@openrouter/ai-sdk-provider`, `generateObject` con Zod.
- **Matemática**: KaTeX (render + validación de LaTeX), **mathjs** (evaluador seguro sin `eval`, derivadas simbólicas, verificación numérica por muestreo), gráficos SVG propios con d3-scale/d3-shape.
- **Ingesta**: `unpdf` (pdf.js) para PDF, `mammoth` para DOCX, `@mozilla/readability` + `jsdom` + `turndown` para HTML→Markdown.
- **Correo**: nodemailer → SMTP Stalwart (`no-reply@cupula.com.ec` o `lamina@`).
- **Tests**: Vitest (unit/integración con Postgres de compose), Playwright E2E con un proveedor IA *fake* determinista en CI y smoke real en prod. Los tests pesados van con `heavy.sh`.
- **CI**: GitHub Actions (lint, typecheck, tests, build de imágenes). El deploy es por script SSH (`scripts/deploy.sh`, igual que NEXUM).

## Estructura del repo

```
apps/web  apps/worker  apps/renderer
packages/
  contracts/     # Zod: ContentDraft v1, DeckDocument v1, ComponentManifest v1, Job payloads, errores
  engine/        # renderer React del deck (canvas 1920×1080 escalado, layouts, navegación, presentador, transiciones)
  components/    # catálogo estable nativo (+ fixtures, tests, docs por componente)
  ai/            # registro de modelos por rol, guard :free, fallback, rate limit, presupuesto, prompts versionados
  research/      # SearXNG/Tavily, fetcher anti-SSRF, extractores
  validation/    # validadores deterministas (LaTeX, mathjs, layout, referencias)
  db/            # esquema Drizzle + migraciones
sandbox/ docker/ scripts/ docs/adr/ content/changelog/ LICENSE CLA.md
```

## Contratos centrales (se definen y prueban antes de construir encima)

1. **ContentDraft v1**: `{meta: tema, nivel, objetivo, idioma; sections[]: {id, title, slidesHint[]: {id, intent, blocks[]}}}` con bloques tipados: `text(md)`, `formula(latex)`, `derivation(steps[{latex, explanation}])`, `example(problem, steps, answer)`, `graphSpec(fn exprs, dominio, puntos, tangentes)`, `table`, `diagramSpec`, `definition/theorem`. Cada afirmación lleva `origin: teacher|research|generated|edited` y `sourceRefs[]` → chunks de fuente. El docente edita en un editor estructurado (Markdown + KaTeX en vivo por bloque), no en un Markdown libre.
2. **DeckDocument v1**: `{schemaVersion, engineVersion, themeId, meta, slides[]: {id, layout (preset), slots: {name: ComponentRef{componentId, version, props}}, notes, build: pasos de aparición, transition}}`. Es declarativo: la IA no decide coordenadas. No admite HTML ni scripts; el texto es Markdown sanitizado.
3. **ComponentManifest v1**: id, semver, propósito didáctico, casos de uso, schema de props (Zod → JSON Schema para la IA), restricciones, ejemplos/fixtures, estado (`stable|provisional|rejected|deprecated`), `scope` (global | presentationId), runtime (`native|sandboxed`), hash del bundle.
4. **Workflow**: `presentations.stage` ∈ `draft → researching → content_review → content_approved → designing → design_review → design_approved → polishing → final_review → published|private_final`, más `failed_recoverable` y `quota_wait`. Las transiciones viven solo en `packages/db/workflow.ts` (una función por transición, validada en servidor, dentro de una transacción con `SELECT … FOR UPDATE`). La aprobación referencia `versionId + sha256` del contenido o del deck.

## Modelo de datos (Postgres)

users/sessions/accounts (Better Auth) · `user_profiles` (rol, cuotas, must_change_password, consent_at) · `presentations` (owner, stage, visibility, share_token_hash) · `content_versions` / `deck_versions` (inmutables, hash, parent, autor: ia|docente) · `approvals` · `feedback` · `sources` + `source_chunks` (origen, url, título, extracto, estado de extracción) · `uploads` (archivos en volumen `/data`, sha256, mime real) · `jobs_meta` (vista sobre pg-boss + errores amigables) · `render_artifacts` (capturas por deck_version) · `components` + `component_versions` (código, bundle, resultados de tests, capturas, scope, estado, PR url) · `ai_calls` (rol, modelo, latencia, tokens, resultado; sin contenido) · `usage_counters` (por usuario/día/etapa, global/día) · `events` (métricas de embudo).

## Pipeline por etapa

- **A. Creación/Research**: un formulario corto (tema, nivel, objetivo) y extras opcionales (apuntes MD, URLs, PDF/DOCX/TXT con máx. 20 MB y 150 páginas; un PDF escaneado o vacío da error claro, sin OCR en v1). El job `research` genera consultas a partir del tema → SearXNG (Tavily como respaldo) → fetch anti-SSRF (DNS resuelto y bloqueo de rangos privados/loopback/link-local/metadata en cada redirect; máx. 3 redirects, 5 MB, 15 s, allowlist de content-type) → extracción → chunks. Todo el texto externo va delimitado como **datos no confiables** en los prompts, con una instrucción de sistema que prohíbe seguir instrucciones del contenido. Si no hay búsqueda disponible, se avisa y no se simula.
- **B. Contenido** (`/presentations/[id]/preview/information`): job `content.generate` → ContentDraft validado (LaTeX con KaTeX, expresiones con mathjs, derivadas comprobadas simbólica y numéricamente cuando aplica, con avisos visibles si no se puede verificar). La UI permite editar, regenerar con o sin feedback (regeneración por sección conservando las secciones bloqueadas o aprobadas), ver el historial de versiones y las fuentes por afirmación, y aprobar.
- **C. Diseño**: job `design.generate` → (1) plan de slides; (2) por slide, selección de layout y componentes a partir del catálogo (stable global + provisionales de la presentación) con justificación registrada; (3) validación con Zod por componente; (4) si falta un componente → `component.request`.
- **Especialista de componentes**: busca duplicados en el catálogo → genera TSX contra una API restringida (React, KaTeX, mathjs, d3-scale/shape; sin imports fuera de la allowlist, sin `fetch`/`eval`/`Function`/acceso global, verificado con análisis AST) → build y tests en el sandbox (typecheck, render de fixtures, sin errores de consola) → captura en el renderer → `provisional` con scope de la presentación. Tiene máx. 3 intentos de corrección. Si falla, el slide usa un fallback estable y el problema se registra, sin bloquear el deck.
- **Runtime de componentes sandboxed**: iframe `sandbox="allow-scripts"` (sin `allow-same-origin`), `srcdoc` con CSP `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:`, props por `postMessage` y tamaño fijado por el slot. Es el mismo runtime en preview, view y Playwright.
- **D. Revisión de diseño** (`/presentations/[id]/preview/design`): visor del engine (el mismo de `/view`), miniaturas, lista de problemas detectados por el renderer (overflow por slot, texto < mínimo, errores de KaTeX, slot vacío, componente caído) y feedback global o por slide → regeneración selectiva de slides. Las capturas se cachean por `deck_version`. Al final, aprobar.
- **E. Pulido y publicación**: job `polish` que solo puede modificar `build`/`transition` (un validador de diff rechaza cualquier otro cambio) → nueva versión → revisión final → **publicar** fija `published_deck_version_id` (snapshot inmutable con versiones de engine y componentes fijadas). Visibilidad: privada (solo dueño), enlace con token (hash en BD, revocable y regenerable) o pública. `/presentations/[id]/view` autoriza en servidor y no depende del UUID. Incluye modo exposición (pantalla completa, teclado, notas del presentador en otra ventana).

## Límites y anti-bucles (configurables por env y por usuario desde admin)

Por docente al día: 5 presentaciones nuevas, 10 regeneraciones de contenido, 10 de diseño, 3 solicitudes de componente, 2 jobs concurrentes. Global: presupuesto diario de llamadas IA (por defecto 80 % del cupo free verificado). Cada job tiene timeout y máx. 3 reintentos con backoff; ante un 429 o cuota agotada pasa a `quota_wait`, con hora estimada de reanudación visible en la UI. Bucles de herramientas: research máx. 6 búsquedas y 12 fetch; especialista máx. 3 iteraciones. Idempotencia: `singletonKey = presentationId:etapa:versionBase` y botones deshabilitados mientras el job corre. Rate limit HTTP en login y endpoints de mutación.

## Seguridad / privacidad mínima v1

Autorización por dueño en cada query (helper `requireOwner`). CSRF: Server Actions (Origin check) y SameSite=Lax. Cabeceras CSP y HSTS. Los secretos solo en el `.env` del servidor, validados con Zod al arrancar y fuera de logs y artefactos. Las capturas de Playwright usan un token de servicio de un solo uso, nunca cookies de usuario. El texto de usuario se sanitiza (rehype-sanitize). Retención: subidas y fuentes se borran al eliminar la presentación; jobs y ai_calls se purgan a los 90 días; el docente puede eliminar su cuenta. Páginas de privacidad y términos, con consentimiento registrado.

## UI

Landing pública (beneficio, open source, gratuito, AGPL), login (Google + correo/contraseña; botón "Acceso Cúpula" para el admin), cambio de contraseña obligatorio, dashboard (presentaciones con su etapa y acción siguiente, cuotas del día, **Novedades** desde `content/changelog/*.md` con badge de no leído), wizard de creación, las dos pantallas de revisión con barra de etapas, visor/exposición e historial de versiones. **Panel admin**: usuarios (alta con contraseña temporal y correo, bloqueo, cuotas), propuestas de componentes (código, tests, capturas, aprobar → estable + PR auto con `gh`/API, rechazar), jobs y errores, métricas de embudo. Se usará la skill de diseño (`impeccable`/`frontend-design`) para la identidad Lámina. Accesible (teclado, contraste AA) y responsive.

## Catálogo inicial estable (nativo, con fixtures y tests)

Title, SectionHeader, BulletPoints, TwoColumn, Definition/Theorem, FormulaHighlight, Derivation (pasos con build), WorkedExample (problema → pasos → respuesta), FunctionPlot (múltiples funciones, puntos, asíntotas, sombreado, tangente/secante), Table, VectorDiagram (2D, física), GeometryFigure (puntos/segmentos/ángulos/círculos), UnitsCallout, Quote/Source, Summary/KeyTakeaways, Checkpoint (pregunta para la clase). Son 16 componentes, cada uno con su manifest y docs que alimentan el prompt de diseño.

## Cronograma (continuo; cada bloque cierra con su prueba de aceptación)

| Bloque | Cuándo | Entregable verificable |
|---|---|---|
| 0 | Lun 19 noche | **Fase 0 verificada y documentada en ADRs**: modelos `:free` actuales, límites y data policies de OpenRouter, comprobación de que un modelo de pago queda rechazado, SearXNG y Tavily free, gVisor en cloud-2. Repo `cupula-ec/lamina`, LICENSE AGPL, CLA, CI, compose dev |
| 1 | Lun–Mar madrugada | `contracts` + DB + workflow con tests de transiciones inválidas. Auth completa (Google, correo, Keycloak admin, alta por admin con correo). **Deploy temprano en cloud-2** (DNS, TLS, monitoreo) con landing + login |
| 2 | Mar | `engine` + 16 componentes + visor + renderer Playwright con detección de problemas. Capa `ai` con guard, fallback y presupuesto. Ingesta y research anti-SSRF |
| 3 | Mié | Etapas A y B completas (generar, editar, feedback, versiones, fuentes, aprobar). Etapa C/D (diseño, validación, previews, regeneración selectiva, aprobar) |
| 4 | Jue | Especialista de componentes + sandbox + runtime iframe + revisión admin + PR auto. Pulido, publicación, visibilidad/tokens, exposición. Dashboard, cuotas, Novedades, panel admin completo |
| 5 | Vie | Pruebas de seguridad (2 cuentas, acceso sin auth, prompt injection en PDF/URL, escape del sandbox: red, env, fs). E2E fake en CI. **Recorrido real en prod desde cero** con un tema de Cálculo elegido en ese momento. `reviewer` (Opus) sobre todo, correcciones, docs (README, despliegue local, `.env.example`, ADRs, limitaciones conocidas), changelog v1.0.0, tag |

Flujo de agentes según la política global: `explorer` y `worker` para tareas mecánicas, `reviewer` al cierre de los bloques 2, 4 y 5. Máximo 1-2 agentes simultáneos.

## Verificación final (criterios del brief §14)

- Automática: tests de unidad (contratos, workflow, cuotas, SSRF guard, validadores matemáticos, guard `:free`) · integración (autorización entre 2 cuentas, tokens de compartir, idempotencia) · E2E Playwright con IA fake (flujo completo, desktop y móvil, recarga a mitad de job, fallo de proveedor → `quota_wait` → reanudar) · sandbox (componente malicioso con fetch, lectura de env o fs → bloqueado; componente roto → fallback sin tumbar el deck) · paridad preview/publicado (hash del deck y capturas idénticas).
- Manual en prod, documentada en `docs/acceptance.md` con evidencia: el admin crea un docente → llega el correo → el docente entra y cambia la contraseña → crea una presentación de Cálculo desde cero con un PDF y una URL → edita, da feedback, aprueba → diseño con fórmulas y gráfica → itera y aprueba → se fuerza la petición de un componente ausente → se usa como provisional → publica → abre por enlace en incógnito → revoca el enlace → acceso denegado. Además: Kuma en verde y `ai_calls` sin un solo modelo no-free.
- No se marca ningún criterio como cumplido sin su evidencia.

## Pendiente de Esteban (no bloquea el arranque)

Clave OpenRouter dedicada (con límite de crédito 0 USD) y clave Tavily: las pido en el bloque 2. Si la pantalla de consentimiento OAuth de Google exige la consola web o verificación, te pediré ese paso.
