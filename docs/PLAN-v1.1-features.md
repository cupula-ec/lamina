# Lámina v1.1 — Plan de ejecución: OCR, motor visual, branding institucional, landing y MCP

> **Para el agente ejecutor (principal).** Este documento es autosuficiente. Las decisiones de la §1 ya fueron **confirmadas por Esteban**: no se vuelven a preguntar. Si algo no está cubierto o hay duda real, usa `AskUserQuestion` (opciones claras, tu recomendación primero). Esteban prefiere respuestas concisas y que se le pregunte ante cualquier duda.
> Contexto del producto: `plan.md` (brief), `EXECUTION_PLAN.md` (v1.0), `docs/adr/*`, `docs/known-limitations.md`, `docs/acceptance.md`, `docs/audit 20 OCT.md` (QA del 20 oct, ya corregida en `dd1f26a`).

## 0. Reglas de trabajo (política global de Esteban, obligatoria)

- **Orquestación de subagentes** (`~/.claude/agents/`): `explorer` (Haiku, solo lectura) → `planner` (Opus, solo lectura) → implementación → `reviewer` (Opus, solo lectura) → correcciones. `worker` (Haiku) para tareas mecánicas pequeñas. El agente principal decide e integra; verifica lo que digan `planner`/`reviewer` contra el código real. Cada fase usa un agente nuevo (no reutilizar con SendMessage).
- **Máximo 1–2 agentes simultáneos** (la máquina ha tenido OOM). Por eso el trabajo «en paralelo por áreas» que pidió Esteban se ejecuta en **olas de 2 agentes** con **dueños de archivos disjuntos** (§4). Tests pesados (Postgres, Playwright, build de imágenes) siempre con `heavy.sh`.
- **GPU** (RTX 4050) para trabajo pesado local si aplica (p. ej. si se prueba OCR/visión local); en producción (cloud-2) no hay GPU.
- **IA = 0 USD**: solo modelos `:free` de OpenRouter (ADR-001, guard en `packages/ai/src/guard.ts`). Nada de OCR.space ni APIs de pago.
- `pkexec` (nunca `sudo`) para root local. No apagar la máquina salvo `apagar run` si Esteban lo pide.
- Commits convencionales en español (`feat(...)`, `fix(...)`), terminados con `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Un commit por área/entrega verificable; no hacer push/deploy sin que Esteban lo confirme (el deploy es `scripts/deploy.sh` a cloud-2).
- Estilo de código: igualar el existente (Zod en contratos, Drizzle, Server Actions + route handlers, Tailwind 4 con clases `sheet`, `btn`, `field`, `label`; UI en español; sin comentarios superfluos).
- Documentar cada decisión en ADR nuevo (`docs/adr/011…`) y actualizar `docs/adr/README.md`, `docs/known-limitations.md`, `README.md` y `content/changelog/` (nueva entrada `2026-10-2x-v1.1.0.md`; ya existe `…-v1.1.0.md` del 20 oct → usar **v1.2.0**).

## 1. Decisiones confirmadas (no re-preguntar)

| Tema | Decisión |
|---|---|
| OCR texto | **Tesseract local** (`spa+eng`) en el worker. |
| OCR fórmulas | Páginas con fórmulas / baja confianza → **modelo de visión `:free` de OpenRouter → LaTeX**, luego validado con KaTeX/mathjs (`packages/validation`). **Requiere consentimiento explícito** (la imagen sale a un proveedor free). **OCR.space descartado** (OCR genérico, destroza fracciones/matrices y manda la imagen a un tercero). |
| Branding | Tabla `institutions` en BD + CRUD en panel admin. **Seed inicial: solo UPS** (Universidad Politécnica Salesiana). El docente elige su institución de un listado y puede subir su **logo personal**; ambos conviven en carátula. Institución = **fallback** si no hay marca personal. |
| Datos por presentación | **Materia, Período, Grupo**: opcionales; si no se llenan, se omiten (nada de placeholders visibles). |
| Onboarding | Pedir **nombre completo del docente**, institución y logo personal (opcional) tras el consentimiento. |
| Estilo visual | **La IA propone** tema/paleta/tipografía/layouts según materia y tono; **el docente puede cambiarlo** en una galería antes de generar el diseño. El branding institucional se superpone al tema. Más poderoso y llamativo **sin perder seriedad**. |
| Landing | **Generar 2 propuestas de hero** y que Esteban elija antes de implementar el resto (A: editorial académica con demo viva; B: oscura tech/producto). |
| MCP | Servidor MCP de Lámina para que una **IA potente externa (p. ej. Claude del docente)** cree presentaciones enviando contenido/deck conforme al schema que Lámina **expone**. Auth: **OAuth de MCP**. Alcance: herramientas + schemas + resources; el resultado **entra al flujo** (versión `autor: mcp`) y el docente **aprueba en la UI** (no publica directo). Gasto de IA lo asume el cliente. |
| Ejecución | «Todo en paralelo por áreas» → en olas de 2 agentes (política global). |

**Hallazgo de la revisión de docs:** «MCP» no aparece en `plan.md`, ADRs, README ni auditoría; Esteban recuerda que estaba documentado (el *qué* y el *porqué*). Parte del trabajo es **documentarlo** (ADR-013, §6.D) con el porqué: una IA mucho más capaz que los modelos `:free` redacta mejor contenido y diseño; Lámina aporta lo que ella no tiene —catálogo, layouts, temas, validación matemática, renderer, flujo de aprobación y publicación— sin gastar cupo free ni salirse del control humano.

## 2. Estado actual (resumen técnico verificado)

- Monorepo pnpm: `apps/{web,worker,renderer,sandbox-runner}`, `packages/{contracts,engine,components,ai,research,validation,db,jobs,sandbox-kit}`. Next 16, React 19, Tailwind 4, Better Auth (plugin `admin`, `genericOAuth` Keycloak solo admin, Google), Drizzle + Postgres, pg-boss, Playwright.
- `packages/contracts/src/layouts.ts`: **6 layouts** (`title`, `section`, `title-content`, `two-column`, `split-visual`, `formula-focus`) con slots tipados. Geometría en `packages/engine/src/geometry.ts` (`CANVAS` 1920×1080, `adjustedBox`).
- `packages/contracts/src/deck.ts`: `DeckDocument` (`themeId` default `lamina-claro`, `meta{title,topic,level,language,author?}`, `slides[]`), `Slide`, `Build`, `Transition`, `SlotAdjust`. `DeckSlidesModelOutput` = lo que produce la IA de diseño.
- `packages/engine/src/engine.css` (202 líneas): **2 temas** (`lamina-claro`, `lamina-oscuro`) con variables `--lm-*`; fuentes Literata + Atkinson Hyperlegible (`@fontsource`). `SlideView.tsx` asigna `className=lm-slide lm-layout-<id>` y `data-theme`.
- `packages/components`: 16 componentes nativos (`defs/{text,visual,misc}.tsx`) vía `defineComponent` (id, version, schema Zod, fitsSlots, examples); `catalogForPrompt`, `validateDeckAgainstCatalog`, `deckFromContent`, `titleSlide`, `sectionSlide`, `slidesFromHint`, `fallback.ts`.
- `apps/worker/src/handlers/design.ts`: `designGenerate` usa `designSlideSystem(catalog, layoutsDoc())` (`packages/ai/src/prompts/index.ts`); `wrap()` fija `themeId` (hoy siempre `lamina-claro`) y `meta`; usa `owner.name` como `author`. Otros handlers: `research`, `content`, `polish`, `repair`, `component`.
- Ingesta: `packages/research/src/extract.ts` (`pdfToText` con `unpdf`; `LIMITS`: 20 MB, 150 págs; **línea ~42 lanza error si el PDF no tiene texto**), subida en `apps/web/src/app/api/presentations/route.ts` (≤3 archivos, regex de extensión, consentimiento si hay materiales, fuentes en `sources`/`source_chunks`, archivos en `/data/.../uploads`).
- Modelos por rol: `packages/ai/src/models.ts` (`research, content, design, component, review`; override `LAMINA_MODELS_<ROL>`).
- Perfil: `user_profiles` (mustChangePassword, consentAt, consentVersion, changelogSeenAt, quotaOverrides). `user.name` (Better Auth) ya existe.
- Landing `apps/web/src/app/page.tsx` (95 líneas, `HeroSlide.tsx`, `Brand.tsx`), estilos en `globals.css` (64 líneas, tokens `paper`, `ink`, `mark`).
- Navegación: `AppShell.tsx` (Mis presentaciones, Administración, /cuenta). Panel admin: `app/admin/*`.
- Cuotas: `packages/db/src/quota.ts`; workflow/transiciones: `packages/db/src/workflow.ts` (única vía para cambiar `stage`).

## 3. Paso 0 — Contratos compartidos (agente principal, SECUENCIAL, antes de lanzar olas)

Hacerlo primero y commitearlo para que A y B no choquen en `packages/contracts` ni en la migración:

1. `packages/contracts/src/deck.ts`
   - `DeckMeta` += `branding` opcional:
     ```ts
     Branding = z.object({
       institution: z.object({ name, short, logoUrl?, colors?:{primary, secondary?}, fontId? }).optional(),
       personalLogoUrl: z.string().optional(),   // URL interna firmada/servida por la app, nunca data: arbitrario
       teacher: z.string().max(160).optional(),
       subject: z.string().max(160).optional(), period: z.string().max(80).optional(), group: z.string().max(80).optional(),
     })
     ```
     Todo opcional; el renderizado omite lo vacío.
   - `themeId`: pasar de `string` libre a `z.enum(THEME_IDS)` con default `lamina-claro` **con compatibilidad** (decks viejos válidos; `.catch("lamina-claro")` en la lectura si un tema desaparece).
   - Añadir `accent?: z.enum(["a","b","c"])` (variante de paleta por tema).
2. `packages/contracts/src/themes.ts` (nuevo): `THEMES` con `{id, name, area, mode:"light"|"dark", description, fonts:{display, body}, accents[3]}` y `THEME_IDS`. Es la fuente de verdad que consumen engine (CSS), IA (prompt) y UI (galería). **El agente B rellena el catálogo completo;** el paso 0 solo crea el archivo con los 2 temas actuales + tipos.
3. `packages/contracts/src/layouts.ts`: dejar solo la convención; B añade layouts.
4. `packages/db/src/schema.ts` + migración Drizzle **única** `0001_*` (generar con `drizzle-kit`, **no** editar el snapshot a mano):
   - `institutions`: `id uuid pk`, `slug unique`, `name`, `short`, `logo_path`, `logo_mime`, `primary_color`, `secondary_color`, `font_id`, `active bool default true`, `created_at`, `updated_at`.
   - `user_profiles` += `full_name text`, `institution_id uuid null → institutions`, `personal_logo_path text`, `personal_logo_mime text`, `onboarded_at timestamptz`.
   - `presentations` += `subject text`, `period text`, `group_name text`, `theme_id text` (preferencia elegida), `source_kind`-compatible: nada más.
   - `deck_versions`/`content_versions`: ampliar el enum/valor de autor para aceptar `"mcp"` (revisar cómo está tipado `author`).
   - `ocr_pages` (opcional, para progreso/auditoría): `id`, `upload_id`, `page`, `engine ("tesseract"|"vision")`, `confidence`, `chars`, `status`. Solo metadatos, nunca texto/imagen.
   - MCP (lo añade D en su ola; no en el paso 0): tablas OAuth de Better Auth MCP + `mcp_clients`/`mcp_grants` si el plugin no las trae.
5. `docs/adr/011-branding-institucional.md` y `docs/adr/012-motor-visual-temas-y-layouts.md` (stubs con decisión; B y A los completan).
6. Verificación: `pnpm typecheck` y `heavy.sh pnpm test` en verde; migración aplica en Postgres limpio y sobre la BD de dev.

## 4. Olas y propiedad de archivos

| Ola | Agentes simultáneos | Áreas | Dueño exclusivo de |
|---|---|---|---|
| 1 | 2 | **A** Branding+onboarding · **B** Motor visual | A: `packages/db` (solo lo suyo tras el paso 0), `apps/web/src/{actions,app/{bienvenida,cuenta,admin/instituciones,presentations/new,api/branding}}`, `lib/branding*`, seed. B: `packages/engine`, `packages/components`, `contracts/{layouts,themes}`, `packages/ai/src/prompts` (parte de diseño), `app/dev/gallery`, `app/presentations/[id]/preview/design` (selector de tema). |
| 2 | 2 | **C** OCR · **D** MCP | C: `packages/research`, `apps/worker/src/handlers/research.ts`, `docker/Dockerfile` (worker), `ai/models.ts` (rol `vision`), wizard (solo el checkbox de consentimiento OCR). D: `apps/web/src/app/{api/mcp,.well-known,cuenta/conectar}`, `packages/mcp` (nuevo), `contracts` (export JSON Schema), `ai`: nada. |
| 3 | 1–2 | **E** Landing · **Cierre** | E: `app/page.tsx`, `globals.css`, `Brand.tsx`, `HeroSlide.tsx`, `components/landing/*`. Cierre: docs, e2e, reviewer. |

Entre olas: el principal integra, corre `pnpm typecheck && heavy.sh pnpm test`, hace commit por área y resuelve conflictos. Si un agente necesita tocar un archivo ajeno, lo pide al principal.

Flujo por área: `explorer` (si hace falta mapear) → `planner` (Opus, plan fino del área con este documento como entrada) → implementación (el principal o `worker`s para lo mecánico) → `reviewer` (Opus) sobre el diff del área → correcciones válidas.

---

## 5. Ola 1

### 5.A Branding institucional + onboarding + metadatos de presentación

**Objetivo:** que Gustavo Bravo Quezada (piloto) entre, elija UPS, suba su logo personal y su carátula muestre **su logo + logo UPS**, su nombre completo, y Materia/Período/Grupo cuando existan.

**A1. Datos y seed**
- Seed idempotente de UPS (script `packages/db/src/seed-institutions.ts`, invocado desde `migrate-cli`/arranque del worker o `pnpm --filter @lamina/db seed`): slug `ups`, name «Universidad Politécnica Salesiana», short «UPS», colores oficiales (azul institucional; **verificar en el sitio oficial** `ups.edu.ec`/manual de marca) y logo SVG/PNG. **Pendiente de Esteban:** confirmar el uso de la marca y/o aportar el archivo del logo; si no lo aporta, descargar el logo oficial público, guardarlo en `apps/web/public/institutions/ups.svg` (o `/data/institutions/` con servicio vía route handler) y avisarle para validación.
- Activos de institución: se guardan en el volumen `/data/institutions/<id>.<ext>` y se sirven por `GET /api/branding/institution/[id]` (con `Cache-Control`, `Content-Type` fijo, `X-Content-Type-Options: nosniff`, CSP `default-src 'none'; style-src 'unsafe-inline'` para SVG, `Content-Disposition: inline`).

**A2. Subida y sanitización de logos (seguridad crítica)**
- Aceptar solo **PNG, JPEG, WebP, SVG**; tipo real por *magic bytes* (igual que ADR-006), máx. 1 MB, dimensiones razonables (rechazar > 4000 px; sharp para validar/reescalar a máx. 1024 px de lado y **re-encodear raster** para eliminar metadatos/polyglots).
- **SVG:** sanitizar con allowlist estricta (p. ej. `isomorphic-dompurify` con perfil SVG o parser propio): sin `<script>`, `<foreignObject>`, `on*`, `href` externos, `<style>` con `url()`, `<use>` externo, ni entidades XML. Alternativa más segura: **rasterizar SVG a PNG** con sharp al subirlo y guardar solo el PNG. Recomendado: rasterizar.
- Servir siempre desde ruta propia con autorización: el logo personal solo lo ve su dueño y quien pueda ver una presentación publicada que lo use; el de institución es público. Renderer y `/view` reciben la URL interna (token de servicio de un solo uso en el renderer, como el resto).
- Tests: SVG con `<script>`/`onload`, PNG polyglot, archivo renombrado `.png` que es HTML, archivo enorme, usuario B pidiendo el logo de A.

**A3. Onboarding (`/bienvenida`)**
- Redirección: después de `consentimiento` (y de `cambiar-clave` si aplica), si `onboarded_at` es null → `/bienvenida` (ver `apps/web/src/lib/guard.ts`/`session.ts` para el patrón de redirecciones obligatorias).
- Campos: **Nombre completo** (obligatorio, 3–160; se guarda en `user_profiles.full_name` y se sincroniza a `user.name` para que `design.ts` lo use como `author`), **Institución** (select de `institutions.active`, «Ninguna / otra» permitido), **Logo personal** (opcional, §A2). Texto claro: «Tu logo se mostrará junto al de tu institución en las carátulas».
- Editable luego en `/cuenta` (nueva sección «Tu perfil y marca»). Server Actions con Zod, mismos patrones que `actions/account.ts`.
- El alta desde admin puede pre-cargar nombre/institución (opcional, `actions/admin.ts`).

**A4. Wizard de creación**
- `presentations/new/form.tsx`: añadir (en el paso 1, tras «Nivel») **Materia, Período, Grupo** como campos opcionales (`maxLength` 160/80/80), con ejemplos «Cálculo I», «Abr–Ago 2026», «Grupo 2». Vacío = no se envía/ guarda null. `api/presentations/route.ts` (`Fields` Zod): campos opcionales → `presentations.subject/period/group_name`.
- Editable luego desde la vista de la presentación (mismo endpoint de edición de metadatos; sin regenerar contenido; reconstruye la carátula).

**A5. Carátula y branding en el deck**
- `design.ts` (`wrap`/construcción del deck) rellena `meta.branding` desde perfil + institución + presentación (URLs internas, no rutas de disco). Es solo lectura para la IA (no se envía a modelos más que nombre de docente si ya se hacía).
- La **portada** usa el layout nuevo `cover-branded` (lo implementa B; A define el contrato de datos): fila superior con logo institución (izq) y logo personal (der) o solo uno; título; subtítulo; línea «Docente · Materia · Período · Grupo» omitiendo vacíos; sigla UPS en pie. Sin logos → portada limpia sin huecos.
- Si hay marca personal **y** institucional: ambos visibles (el caso del piloto). Si solo institución: va como marca principal (fallback). Si ninguno: marca «Lámina».
- Pie de diapositivas interiores (opcional, configurable por tema): sigla + número de página pequeño.
- `lib/presentation-view.ts` y las rutas de `render/[deckVersionId]` deben resolver las URLs de logos con el mismo mecanismo de autorización.

**A6. Admin: instituciones**
- `app/admin/instituciones/{page,form}.tsx` + `actions/institutions.ts`: crear/editar/desactivar (no borrar si hay usuarios), subir logo, colores, sigla, vista previa de la portada con la marca. Enlace en el panel admin.

**A7. Criterios de aceptación A**
- Docente nuevo ve onboarding una sola vez; sin nombre no avanza.
- Carátula del piloto: logo personal + logo UPS + «Gustavo Bravo Quezada» (nombre real lo ingresa el docente), y Materia/Período/Grupo solo si se llenaron.
- Presentación sin esos campos no muestra «undefined», guiones ni huecos.
- Tests: unit (sanitizador, validación de campos), integración (autorización de logos entre 2 cuentas), e2e (onboarding → crear → ver carátula con captura). Actualizar `e2e/tests/helpers.ts` para completar el onboarding en los flujos existentes (si no, rompen `flow.spec.ts`, `security.spec.ts`).

### 5.B Motor visual: temas, paletas, fuentes, assets y layouts nuevos

**Objetivo:** presentaciones notoriamente más ricas y variadas, adecuadas al tema, con seriedad académica; que dos presentaciones de materias distintas **no se vean iguales**.

**B1. Sistema de temas** (`packages/contracts/src/themes.ts` + `packages/engine/src/themes/*.css` o un `themes.css` modularizado)
- Pasar de 2 a **8–10 temas** con identidad propia (paleta, par tipográfico, decoración, ritmo de espaciado), cada uno con **3 variantes de acento** y modo claro/oscuro cuando tenga sentido. Propuesta (ajustar con criterio de diseño, contraste AA, legibilidad a proyector):
  1. `lamina-claro` (actual, se conserva), 2. `lamina-oscuro` (actual), 3. `calculo-editorial` (papel cálido, serif de display, filetes finos, notación marginal), 4. `algebra-grafito` (gris grafito + acento ámbar, rejilla técnica), 5. `fisica-aurora` (oscuro profundo azul/teal, líneas de campo), 6. `geometria-compas` (crema + azul marino, trazos de compás/regla), 7. `estadistica-datos` (limpio, paleta categórica daltónica-segura), 8. `quimica-laboratorio` (verdes/teal, hexágonos moleculares sutiles), 9. `institucional-sobrio` (neutro, deja protagonismo a la marca de la institución), 10. `pizarra` (verde pizarra + tiza).
- Cada tema define variables `--lm-*` existentes (bg, ink, muted, accent, accent2, panel, rule, answer, mark, pen, plot1-4) **más nuevas**: `--lm-radius`, `--lm-shadow`, `--lm-deco-*`, `--lm-title-weight`, `--lm-title-tracking`, `--lm-footer-*`. Los componentes existentes (`.lm-*` en `engine.css`) deben leer variables y no colores fijos (revisar los hex sueltos como `#8a5a00`, `#2a2410`).
- **Fuentes:** self-hosted vía `@fontsource` (licencias libres: OFL). Candidatas: Literata (ya), Atkinson (ya), Fraunces, Source Serif 4, Newsreader, Space Grotesk/Manrope/IBM Plex Sans/IBM Plex Mono, STIX Two/Libre Caslon para estilo matemático. Máx. 4–5 familias en total (peso del bundle y CSP del sandbox/renderer: las fuentes deben cargar también en `render/*` y en capturas Playwright; verificar `font-display` y que el renderer espere `document.fonts.ready`).
- `THEMES` expone metadatos para IA y galería: `{id, name, area, mode, mood, fonts, accents}`.

**B2. Assets procedurales (SVG/CSS, sin imágenes pesadas)**
- Módulo `packages/engine/src/decor/*`: componentes React puros que generan SVG deterministas por seed (hash del `deck.id`/slide id) — rejilla de ejes, familias de curvas, líneas de campo, cuadrículas isométricas, hexágonos moleculares, trazos de compás, ondas, puntos de datos, ornamentos de esquina, divisores de sección, números de sección grandes. Cada tema declara qué decoraciones usa y en qué layouts (`cover`, `section`, `closing`, fondo sutil en interiores con opacidad baja que **no** compita con el contenido ni afecte la detección de overflow/contraste).
- Prohibido: imágenes externas, `fetch`, recursos de red (CSP del sandbox y del renderer). Todo inline.
- Test visual: capturas por tema (galería) y comprobación de contraste AA de `--lm-ink` sobre `--lm-bg`/`--lm-panel`.

**B3. Layouts nuevos** (`contracts/layouts.ts` + `engine.css` + `geometry.ts` con las cajas; hoy: title, section, title-content, two-column, split-visual, formula-focus)
Añadir (cada uno con `purpose` claro para la IA, slots tipados, geometría 1920×1080, variantes por tema, fallback en `components/src/fallback.ts`):
- `cover-branded` (portada con zona de marcas + título + metadatos docente/materia/período/grupo; reemplaza el uso de `title` para la primera diapositiva cuando hay branding; `title` queda como portada simple),
- `hero-formula` (fórmula gigante centrada con contexto debajo),
- `full-visual` (visual a sangre con título superpuesto y leyenda),
- `three-column` (tres tarjetas comparables),
- `steps-timeline` (proceso/demostración horizontal con 3–5 pasos),
- `comparison` (A vs B con cabeceras),
- `big-number` (cifra/resultado destacado + explicación),
- `quote-source` (cita/definición histórica con fuente),
- `agenda` (índice/objetivos de la clase),
- `closing` (resumen + referencias/bibliografía + marca),
- `sidebar-notes` (contenido principal + columna lateral de notas/atajos).
- Cada layout nuevo requiere: entrada en `LAYOUTS`, CSS por tema, test en `packages/contracts/test` (slots válidos, geometría dentro del canvas, sin solapamientos salvo los intencionales), actualización de `layoutsDoc()` en `design.ts`, de `issues.ts` (límites de overflow por slot) y del prompt de diseño.
- **Variedad forzada:** el planificador de diapositivas (`design.ts`) recibe la lista de layouts ya usados y el prompt exige alternar; validador post-IA que rechaza >2 diapositivas consecutivas con el mismo layout (excepto contenido que lo exija) y reintenta con el feedback.

**B4. Componentes (enriquecer sin inflar)**
- Variantes visuales de los 16 componentes existentes según tema (tarjetas, bordes, números de paso, insignias «Definición/Teorema/Ejemplo/Atención»), iconografía SVG propia (set pequeño: lupa, lámpara, advertencia, check, flecha, integral, vector, función).
- Nuevos componentes de alto valor (con manifest, schema, fixtures, tests, docs que alimentan el prompt): `Callout` (nota/atención/historia), `StatCard` (cifra grande), `StepsList`, `ComparisonTable`, `IconBullets`, `SectionNumber`, `ProgressBar/AgendaItem`. Mantener la regla: **robustez y legibilidad sobre cantidad**.

**B5. Elección de tema por IA + galería para el docente**
- En `design.generate`: paso previo (rol `design`, salida estructurada Zod) `chooseStyle({area, topic, level, objective, subject})` → `{themeId, accent, rationale}` limitado a `THEME_IDS`; fallback determinista por palabra clave/área si falla el modelo (cálculo→calculo-editorial, física→fisica-aurora, …). Se guarda en `presentations.theme_id` y en `deck.themeId`.
- UI: en `preview/information` (antes de «Aprobar y diseñar») mostrar **«Estilo propuesto: X»** con miniatura (SlideView real con la portada del deck de ejemplo) y botón «Cambiar estilo» → galería (`/dev/gallery` reutilizada como componente `ThemePicker`) con vista previa de portada + 1 diapositiva interior con **fórmula y gráfica**, selector de acento. En `preview/design`: cambiar tema sin regenerar contenido (re-render del mismo deck con otro `themeId`; recrea la versión `kind: "style"` y re-renderiza capturas).
- Acciones de servidor nuevas en `actions/presentations.ts` (no tocar la lógica de aprobación; el cambio de tema se registra como nueva versión de deck con hash, igual que la edición posterior de ADR-010).

**B6. Criterios de aceptación B**
- Galería con ≥8 temas × layouts nuevos sin overflow ni issues del renderer (`issues.ts`), capturas en `docs/evidence/`.
- Un deck de Cálculo y uno de Física generan visualmente distinto (tema + layouts + decoración) con el mismo código.
- `pnpm test` incluye: contratos de layouts/temas, paridad preview/publicado (mismo hash), fallback si el tema no existe, contraste AA por tema.
- ADR-012 documenta el sistema de temas, assets procedurales y la regla de variedad.

---

## 6. Ola 2

### 6.C OCR para PDFs escaneados

**Objetivo:** que un PDF de imágenes (escaneo/fotografías de apuntes) produzca texto utilizable; las fórmulas pasan por visión→LaTeX validado.

**C1. Detección y pipeline** (`packages/research/src/{extract.ts,ocr.ts,vision.ts}`)
1. `pdfToText` conserva su camino rápido; si `total < LIMITS.minTextChars` (hoy lanza error en la línea con «no hace OCR») o hay páginas sin texto → devolver `needsOcr` con la lista de páginas pendientes (no lanzar). PDFs mixtos: OCR solo a las páginas sin texto.
2. **Rasterizar** páginas: `pdftoppm` (poppler-utils, 200–250 dpi, escala de grises) en el contenedor del worker, o `pdfjs-dist` + `@napi-rs/canvas` (sin binarios de sistema). Elegir lo que menos pese en la imagen del worker; preferir poppler si ya se instala `tesseract`.
3. **Tesseract local**: instalar `tesseract-ocr tesseract-ocr-spa tesseract-ocr-eng` en la imagen `worker` (`docker/Dockerfile`, etapa worker, crear usuario sin privilegios intacto) o `tesseract.js` con datos `spa`/`eng` incluidos (más lento, sin dependencias de sistema). Recomendado: binario nativo vía `execFile` con `--psm 1/6`, `-l spa+eng`, TSV para obtener **confianza por palabra/línea**, timeout por página (p. ej. 30 s), concurrencia 1–2.
4. **Detección de fórmulas/baja calidad** por página: heurística (densidad de símbolos `= ∑ ∫ √ ± ^ _ { }`, fracciones, confianza media < ~70, líneas muy cortas con muchos símbolos). Esas páginas (o regiones por bounding boxes TSV, preferible si es sencillo) van al **modelo de visión**.
5. **Visión→LaTeX:** nuevo rol de modelo `vision` en `packages/ai/src/models.ts` (`DEFAULT_CHAINS.vision`, override `LAMINA_MODELS_VISION`) con modelos `:free` que acepten imagen (**verificar con la API de OpenRouter cuáles lo hacen hoy**; documentarlo en ADR-001/014; el guard `:free` aplica igual). Prompt versionado: «transcribe fielmente el texto; fórmulas en LaTeX KaTeX sin delimitadores `$`; no inventes; marca `[ilegible]`». Salida Zod `{ text_md, formulas[] }`. Tratar la salida como **dato no confiable** (`UNTRUSTED_RULE`). **Pasar cada fórmula por `packages/validation`** (KaTeX parse; las que fallen se marcan «revisar» y el docente las corrige en el editor de contenido).
6. Resultado → `Extracted{ pages[] }` con `ocr: { engine, confidence }` por página → chunks normales (`sources`/`source_chunks`) con marca en la fuente («texto reconocido por OCR; puede contener errores»), visible en la UI de fuentes.

**C2. Límites, cola y estado**
- Límites: `LIMITS.maxOcrPages` (p. ej. 40; configurable por env), tiempo total por documento (p. ej. 8 min), imagen máx. por página, DPI fijo. Más allá del límite: OCR parcial con aviso claro (no fallo total) o error amigable.
- El job `research` sigue siendo uno; añadir **progreso** («OCR página 12 de 40») en `jobs_meta`/estado visible (`JobWatcher`), sin bloquear la cola web. Si falta cupo de IA para visión → continuar solo con Tesseract y marcar «fórmulas sin verificar por visión» (no `quota_wait` global por esto).
- Cuotas: la visión cuenta contra `ai_call` global; añadir clave `ocr_vision_page` por usuario/día (p. ej. 30) en `packages/db/src/quota.ts`.

**C3. Privacidad y consentimiento**
- Wizard (`presentations/new/form.tsx`): si hay PDFs, mostrar aviso adicional «Si tu PDF es un escaneo, las páginas con fórmulas se enviarán como imagen a un proveedor de IA gratuito que puede retenerlas», con checkbox **separado** («Permito enviar imágenes de páginas con fórmulas a la IA») → `consent_ocr_vision`; sin él, solo Tesseract. Registrar consentimiento (`events`/campo en `uploads` o `presentations`). Actualizar `app/privacidad/page.tsx`, `consent.ts` (versión de consentimiento → obliga a re-aceptar si cambia el texto; decidir si subir versión) y `docs/adr/006`.
- Las imágenes rasterizadas viven en tmp del worker y se borran al terminar (try/finally); nunca se guardan en BD ni logs; `ai_calls` sin contenido (igual que hoy).

**C4. Seguridad**
- PDFs hostiles: poppler/tesseract invocados con `execFile` (sin shell), timeouts, límites de memoria (`ulimit`/cgroup del contenedor), dimensión máxima de página (PDF-bomb: rechazar páginas > X px²), directorio tmp privado por job.
- Prompt injection: el texto OCR es no confiable en todos los prompts (ya hay `UNTRUSTED_RULE`); añadir test con imagen que contiene «ignora las instrucciones…».

**C5. Pruebas y aceptación**
- Fixtures en `packages/research/test/fixtures/`: PDF escaneado (texto español), PDF mixto, PDF con fórmulas (render de LaTeX a imagen), PDF hostil. Tests: pipeline OCR (Tesseract real si está disponible en CI; marcar `skip` con razón si no, y cubrir lógica con mock del binario), heurística de fórmulas, fallo del modelo de visión → degradación a Tesseract, límites.
- E2E: subir PDF escaneado → contenido generado con la fuente marcada OCR. Actualizar `known-limitations.md` (quitar «Sin OCR», documentar límites reales: precisión con manuscrito/fórmulas, máx. páginas) y ADR-003/006; nuevo ADR-014 `ocr`.

### 6.D MCP de Lámina (servidor para IA externa)

**Objetivo y porqué (documentar en ADR-013 antes de codear):** los modelos `:free` limitan calidad. Con MCP, el docente conecta una IA potente (Claude Desktop/Code, etc.) que **redacta contenido y propone el diseño** usando exactamente el catálogo, layouts, temas y schemas de Lámina; Lámina valida (Zod + KaTeX/mathjs), renderiza, detecta problemas y mantiene la **aprobación humana**. Beneficios: mejor calidad, 0 gasto de IA para Lámina, sin saturar el cupo free, y los docentes con más recursos no están limitados. Riesgo a documentar: nuevo vector de entrada no confiable (todo lo que envía el cliente se valida como el resto; nunca se ejecuta código).

**D1. Superficie MCP** (nuevo `packages/mcp` con la definición de tools/resources; transporte **Streamable HTTP** en `apps/web/src/app/api/mcp/route.ts` con `@modelcontextprotocol/sdk`; verificar versión actual del SDK y de la especificación de auth antes de implementar)
- **Resources** (lectura): `lamina://schemas/content-draft`, `lamina://schemas/deck`, `lamina://catalog` (componentes con schema de props en JSON Schema, usos, restricciones, ejemplos — reutilizar `catalogForPrompt`/`jsonschema.ts`), `lamina://layouts`, `lamina://themes`, `lamina://guides/authoring` (guía: reglas de LaTeX/KaTeX, límites de caracteres, fidelidad matemática, cómo usar branding), `lamina://presentations/{id}` (propia).
- **Tools:**
  - `list_presentations`, `get_presentation(id)` (estado, etapa, issues, fuentes resumidas).
  - `create_presentation({topic, level, objective, subject?, period?, group?, themeId?})` → crea en etapa `draft` sin disparar IA free (consume cuota `presentation_new`; marca `origin: mcp`).
  - `submit_content_draft(id, draft)` → valida `ContentDraft` (Zod + `packages/validation`: LaTeX, mathjs, derivadas) → versión `autor: mcp`, deja la presentación en `content_review` (**mismas transiciones** de `workflow.ts`; añadir la transición necesaria `draft→content_review` por vía MCP, con test de inválidas). Devuelve avisos de verificación por bloque.
  - `validate_deck(deck)` (sin guardar) → errores Zod + `validateDeckAgainstCatalog` + `missingFormulas`/fidelidad respecto al contenido aprobado.
  - `submit_deck(id, deck)` → solo si el contenido está aprobado; crea `deck_versions` `autor: mcp`, encola render del renderer y devuelve `issues` cuando terminan (o `get_render_issues` para consultar), deja en `design_review`.
  - `get_render_issues(id)` (problemas detectados por el renderer por slide; permite que la IA externa itere) y `repair`-friendly: la IA reenvía el deck corregido (limitar iteraciones por presentación).
  - **No existen** tools de aprobar/publicar/borrar/compartir: eso queda en la UI humana.
- Todas las entradas pasan por los mismos contratos de `packages/contracts`; tamaños máximos (deck ≤ 60 slides, props ≤ N KB), rate limit por token/usuario, cuotas propias (`mcp_call`, `mcp_submit` por día) en `quota.ts`.
- Modo `sandboxed`: el cliente **no** puede enviar componentes con código (solo `native`/estable y los provisionales ya existentes de esa presentación); rechazar `componentId` desconocido con mensaje que indique cómo pedir uno (por la UI).

**D2. Autenticación: OAuth de MCP**
- Implementar la especificación de autorización de MCP (OAuth 2.1 + PKCE, **metadatos de recurso protegido** `/.well-known/oauth-protected-resource`, **metadatos del servidor de autorización** `/.well-known/oauth-authorization-server`, registro dinámico de clientes si la spec/cliente lo exige). Verificar si el plugin `mcp`/`oidc-provider`/`oauth-provider` de Better Auth (versión instalada en el repo) lo cubre; si sí, usarlo sobre la sesión existente; si no, acotar a lo mínimo del estándar y documentarlo.
- Pantalla de **consentimiento** («Claude quiere acceder a tus presentaciones de Lámina: crear borradores y enviar diseños; no puede aprobar ni publicar») usando la sesión web del docente; las cuentas siguen siendo solo las dadas de alta (el flujo OAuth no crea usuarios). Admin con Keycloak sigue igual.
- Tokens: access de corta duración + refresh, **scopes** (`presentations:read`, `presentations:write`), revocación inmediata, hash en BD, audience = `APP_URL/api/mcp`; validar `Origin`/`Host` (DNS rebinding) y exigir HTTPS en prod.
- **Gestión en `/cuenta/conectar`** («Conectar con IA»): estado de conexión, aplicaciones autorizadas (nombre del cliente, fecha, último uso), botón **Revocar**, instrucciones copiables para Claude Desktop/Code (URL del servidor MCP), explicación en lenguaje simple del porqué y de la privacidad. Admin: ver/revocar conexiones en el panel y desactivar el MCP globalmente (`appSettings`).
- Nada de API keys de OpenRouter en el MCP; claves del servidor jamás salen.

**D3. Reglas de flujo y seguridad**
- La presentación creada por MCP es **del docente autenticado** (`requireOwner` en cada tool). Aislamiento entre cuentas obligatorio y testeado.
- Contenido enviado = dato no confiable: se sanea Markdown (rehype-sanitize ya usado), LaTeX validado con KaTeX (límite de profundidad/tamaño), sin HTML. Los prompts internos que luego consuman ese contenido (p. ej. `repair`, `polish`) siguen envolviéndolo con `UNTRUSTED_RULE`.
- Idempotencia: `submit_*` con `baseVersionId` + hash (optimistic concurrency como la edición posterior); un `submit_deck` obsoleto devuelve `stale_version`.
- Auditoría: `events` con `kind: mcp.*` (sin contenido), `ai_calls` no aplica (no hay modelo de Lámina).
- La revisión humana sigue siendo obligatoria: la UI muestra insignia «Creado por IA externa (MCP)» en la versión y el docente aprueba como siempre.

**D4. Pruebas y aceptación**
- Unit/integración: tools con entradas válidas e inválidas, transiciones, cuotas, cuentas A/B, token revocado/expirado/scope insuficiente, `Origin` inválido, payload gigante, deck con componente desconocido, LaTeX hostil.
- Test de protocolo con el cliente del SDK (`@modelcontextprotocol/sdk` Client) contra el servidor de test; **prueba manual con Claude Code/Desktop real** (`claude mcp add --transport http lamina <URL>`) creando una presentación de Cálculo y verla aparecer en `/presentations/<id>` para aprobar. Evidencia en `docs/evidence/`.
- Docs: ADR-013 (qué/porqué/seguridad), guía de usuario `docs/mcp.md` (conectar, tools, ejemplos de prompts), README (sección «Conectar con tu IA»), `known-limitations.md`, changelog.

---

## 7. Ola 3

### 7.E Landing (hoy ~95 líneas, «html simple»)

1. **Dos propuestas de hero** (rutas temporales `/dev/landing-a` y `/dev/landing-b`, o dos branches/capturas) y **pedir a Esteban que elija** (`AskUserQuestion` con capturas adjuntas/paths) antes de seguir:
   - **A. Editorial académica con demo viva (recomendada):** titular serif grande, diapositivas reales renderizadas con el motor (portada con logos + una de fórmula/gráfica en un tema), tipografía de display, movimiento sutil, textura de papel/cuadrícula.
   - **B. Oscura tech/producto:** gradientes, mockup flotante de la UI y del deck, ritmo SaaS.
2. Implementación de la elegida (usar skills `impeccable` / `frontend-design` / `high-end-visual-design`; evitar lo genérico «de plantilla»): hero con **demo interactiva** (carrusel de diapositivas reales con `DeckPlayer`/`SlideView`, cambio de tema en vivo), secciones: problema/beneficio, flujo en 4 pasos con ilustraciones procedurales, **galería de temas y layouts**, «Tu universidad, tu marca» (logos de instituciones activas), **Sube un escaneo** (OCR), **Conecta tu IA (MCP)** con explicación simple, verificación matemática, privacidad/abierto (AGPL), CTA final, footer (privacidad, términos, GitHub, Cúpula Systems).
3. Requisitos: Lighthouse accesibilidad ≥ 95, `prefers-reduced-motion`, responsive 360→1920, sin dependencias pesadas (GSAP/Framer solo si aporta; imágenes con `next/image`), no romper `login` ni los e2e (`e2e/tests/*`), copy en español sin promesas falsas (el acceso es por invitación; no afirmar integraciones no entregadas).
4. Capturas desktop/móvil en `docs/evidence/landing-*.png`.

### 7.F Cierre
1. `reviewer` (Opus) sobre todo el diff v1.1 con foco en: subida/sanitización de logos (XSS/SSRF/polyglot), OAuth y tokens MCP, autorización entre cuentas, OCR (PDF-bomb, ejecución de binarios, prompt injection), migración de BD y compatibilidad con decks/presentaciones existentes, regresión del flujo y del renderer.
2. Aplicar hallazgos válidos (verificar contra el código).
3. Docs: README, `known-limitations.md`, `acceptance.md` (nueva sección v1.2 con evidencia; **no** marcar nada sin evidencia), `docs/adr/README.md` (011 branding, 012 motor visual, 013 MCP, 014 OCR), `content/changelog/<fecha>-v1.2.0.md`, `package.json` versión.
4. Verificación final (abajo) y **solicitar confirmación a Esteban antes de `scripts/deploy.sh`/tag**.

## 8. Verificación global

- `pnpm typecheck` y `heavy.sh pnpm test` (incluye los tests nuevos de cada área) en verde; guard `:free` intacto (`ai_calls` sin modelos no-free, incluido el rol `vision`).
- E2E Playwright (con `heavy.sh`): onboarding (UPS + logo personal) → crear con Materia/Período/Grupo vacíos y llenos → carátula con ambos logos → cambio de tema desde la galería → publicar; PDF escaneado → contenido con fuente OCR; cliente MCP real → presentación aparece lista para aprobar. Actualizar `helpers.ts` por el onboarding obligatorio.
- Revisión visual: galería de temas × layouts, portada con/sin marcas, landing; capturas en `docs/evidence/`.
- Migración: aplicar `0001_*` sobre una copia de la BD de prod (restore de backup) y comprobar que presentaciones/decks existentes abren y renderizan igual (`themeId` legado, `meta.branding` ausente).
- Rendimiento: bundle del engine y de la landing no deben crecer de forma desproporcionada; las fuentes cargan en renderer/capturas.

## 9. Pendientes que dependen de Esteban (avisarle, no bloquean el código)

1. Validar el uso de la marca/logo UPS (o entregar el archivo oficial) y su paleta.
2. **Elegir la propuesta de landing (A o B)**.
3. Confirmar que cloud-2 aguanta Tesseract + poppler (CPU/RAM) y, si se desea, host dedicado para el worker; confirmar los modelos `:free` de visión vigentes (se verifican por API al implementar).
4. Aprobar el deploy y la versión (`v1.2.0`).
5. Si la spec de OAuth de MCP exige registro dinámico de clientes y el plugin de Better Auth no lo soporta: decidir alcance mínimo (documentado en ADR-013).

## 10. Orden sugerido de commits

1. `feat(contracts,db): branding, temas y migración 0001 (paso 0)`
2. `feat(branding): onboarding, instituciones, logos y carátula` (A)
3. `feat(engine): temas, decoraciones y layouts nuevos` (B)
4. `feat(ocr): PDFs escaneados con Tesseract y visión free para fórmulas` (C)
5. `feat(mcp): servidor MCP con OAuth y página Conectar con IA` (D)
6. `feat(landing): nueva landing` (E)
7. `docs: ADR 011–014, límites, aceptación v1.2 y changelog` + fixes del reviewer
