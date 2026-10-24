# Lámina v3: plan unificado

> **Estado:** plan aprobado para ejecutar. Nada está implementado salvo lo que §2 marca como «hecho».
>
> **Origen:**
> - Reunión con el profesor el 23-oct-2026 y validación con tres docentes de prueba: matemáticas (UPS), programación y educación general (esta última de otra universidad).
> - Incidente en producción del mismo día (§2).
> - Decisiones de producto tomadas con Esteban (§3).
>
> **Release:** **un solo gran release V3** (v3.0.0). Se integra de forma continua en `main` detrás de *feature flags*; no hay ramas largas.
>
> **Regla de oro:** ya hay docentes usando Lámina en producción, y tres más la irán usando a medida que avance el trabajo. **No se les puede pedir que reenvíen su trabajo.** Todo cambio debe ser aditivo, reversible y compatible con lo que ya existe (§4). El changelog visible (`apps/web/src/lib/changelog.ts`) se actualiza cada vez que algo llega a producción.
>
> **Para el agente que ejecute este plan:**
> - Sigue el orden de §7.
> - Cada bloque tiene tareas, archivos y un criterio de aceptación.
> - Antes de cambiar el esquema, lee §4.
> - Las rutas citadas se verificaron el 23-oct-2026. Si algo no coincide, vuelve a comprobarlo antes de asumir.

---

## Estado de ejecución (actualizado 24-oct-2026)

| Bloque | Estado | Notas |
|---|---|---|
| 0, 1, 2 | Hechos | Detrás de flags `v3_durable_jobs`, `v3_workspace` |
| 3 | Hecho salvo panel admin con datos agregados y aviso no bloqueante en `/cuenta` | PDF detrás de `v3_exports` |
| 4 | Hecho | `v3_areas` (prompts por área, consultas), `v3_pedagogy` (contenido v2, validación, cierre, diseño). Pendiente: `stepwise` por defecto en todos los componentes (hoy solo `Checkpoint` desde el fallback) |
| 5 | Hecho el motor (proveedores, ingesta, `assets`, ruta firmada, `Image`, resolución en el diseño, cuota `image`, API de reemplazo `/api/presentations/[id]/images`) detrás de `v3_images` | Falta la UI del editor (va con el panel contextual del bloque 8) y la elección con visión free |
| 6 | Hecho salvo que `propose_component`/MCP y el visor de avisos de color institucional llegan con sus bloques | Astcheck por ámbito (revisado), SDK con cónicas/implícitas, 28 componentes nuevos por área (flags `v3_areas`/`v3_pedagogy`/`v3_images`), temas por área e institucional-marca (OKLCH), AAA 7:1 en tinta y texto atenuado |
| 7–10 | Pendientes | |

---

## 1. El problema

Lámina hoy:

1. **Funciona bien solo en matemáticas.** Ocurre en todas las capas:
   - Prompts, componentes, área detectada, SDK del sandbox y temas son de matemáticas.
   - Un tema no planificado (cónicas) hizo fallar la generación de un componente delante del profesor.
   - Programación y educación general no tienen ni componentes ni prompts.
2. **Produce presentaciones planas:**
   - Sin imágenes.
   - Con animaciones mínimas.
   - Con ejercicios que dan la respuesta de golpe.
   - Sin contexto ni motivación para temas nuevos.
   - Sin una slide real de cierre de clase.
3. **La IA trabaja «a ciegas y de golpe».**
   - Regenera documentos completos.
   - Si algo falla a mitad (JSON ilegible, timeout, deploy), pierde todo lo hecho.
   - No tiene un espacio de trabajo persistente ni herramientas pequeñas.
4. **El MCP confunde a las IAs externas.** En una prueba, ChatGPT primero intentó «abrir Lámina» y luego mandarle un «prompt de diseño». Las herramientas actuales solo aceptan JSON completos y la guía no deja claro que la IA externa es la autora.
5. **La experiencia del docente es pesada.**
   - El editor está muy cargado y cuesta entenderlo.
   - El formulario no guía a quien no sabe qué escribir.
   - La pantalla de carga es plana.
   - No se puede elegir cuántas slides quiere.
   - No hay exportación.
6. **La marca está mal resuelta.** La portada muestra el texto «UPS» en lugar del logo, y el logo no aparece en el resto de slides.

---

## 2. Evidencia

### 2.1 Incidente técnico del 23-oct-2026 (una sola tarde)

| # | Qué pasó | Causa raíz | Dónde |
|---|---|---|---|
| 1 | Un diseño de ~12 min se perdió y se reinició de cero | Un deploy recreó el contenedor `worker` con el job en curso | `scripts/deploy.sh` |
| 2 | Un `design.repair` quedó «en reintento» más de 8 min sin arrancar | pg-boss abortó el handler a los 900 s, pero el trabajo real siguió en el proceso. La cola admite un job a la vez (`localConcurrency: 1`) | `apps/worker/src/main.ts` |
| 3 | Subir `expire_seconds` en la BD **no** evitó el corte | El timeout real lo aplica el worker con `QUEUE_CONFIG`, no la fila del job | `packages/jobs/src/index.ts` |
| 4 | Un componente 3D «falló» tras un intento y quedó `failed` (con la cuota devuelta) | Un error de `ai.structured` (JSON ilegible) **sale del bucle de 3 intentos** y marca todo como fallido | `apps/worker/src/handlers/component.ts` |
| 5 | Falló la reparación de `h4` y `h12`: «JSON ilegible», «We are giv…» | El modelo gratuito devolvió texto en inglés o JSON roto. No hay reparación de JSON ni reintento por diapositiva | `packages/ai/src/client.ts` |
| 6 | Los componentes generados no se renderizaban (timeout de 30 s) y salían en negro | Carrera con `lamina:ready` (el iframe avisaba antes de la hidratación) y el iframe no recibía las variables `--lm-*` | **Hecho** (commit `fix(engine)…`) |
| 7 | El detector marca error en una fórmula que se ve bien (`h4c`) | Falso positivo del detector de desbordes con KaTeX | `packages/engine` (`detectSlideIssues`) |
| 8 | La presentación no podía recibir un diseño externo mientras estaba en `designing` | La máquina de estados exige `content_approved` o `design_review` | `packages/db/src/workflow.ts` |
| 9 | Un solo diseño ocupa el worker y los demás esperan en cola | `design.generate` con concurrencia 1 y sin priorización | `apps/worker/src/main.ts` |
| 10 | La IA externa (MCP) solo puede enviar el **deck completo** | `submit_deck` reemplaza todo, con un tope de 12 versiones por presentación | `packages/mcp/src/tools.ts`, `limits.ts` |

**Hotfixes ya en producción ese día:**
- `deploy.sh` espera a que se vacíe la cola de jobs y vuelve a encolar los huérfanos.
- `apps/promo` quedó fuera del despliegue.
- El iframe del sandbox recibe el tema y avisa al montar.

Son parches: no resuelven la causa de fondo.

### 2.2 Validación de producto con docentes (23-oct-2026)

| # | Observación | Causa en el código |
|---|---|---|
| P1 | Cónicas: el componente generado falló con muchos errores | Varias causas, detalladas tras esta tabla |
| P2 | Programación y educación general: «el sistema no está preparado» | El área se adivina por regex y solo distingue tres valores: Física, Álgebra y Matemática general, y Cálculo y Matemática como valor por defecto (`apps/worker/src/handlers/content.ts:11`). Prompts escritos para matemáticas (`packages/ai/src/prompts/index.ts`: «ciencias exactas», KaTeX, mathjs, derivaciones). `presentations.subject` **no llega** al prompt de contenido (`content.ts:47-55`). Consultas de investigación por defecto «definición teorema» (`apps/worker/src/handlers/research.ts:71`) |
| P3 | Se sienten como imágenes planas, sin dinamismo | Solo transiciones CSS `fade/slide/zoom` (`packages/engine/src/base.css:18-26`). `stepwise: false` por defecto (`prompts/index.ts:55`). Los revelados solo los activa el pulido. No hay librería de motion |
| P4 | Sin imágenes de apoyo | No existe componente de imagen. `InternalAsset` solo acepta `/api/branding/...` (`packages/contracts/src/deck.ts:51,61-71`). Los componentes generados tienen prohibidos `img`, `src` y `href` (`packages/sandbox-kit/src/astcheck.ts:15-16`). `packages/research` busca texto, no imágenes |
| P5 | Los ejercicios dan la respuesta de golpe y no explican el paso a paso | Solo existe el bloque `example {problem, steps[], answer}` (`packages/contracts/src/content.ts:30-36`), que se muestra completo. `Checkpoint` y `WorkedExample` solo revelan por pasos si el pulido lo activa (`packages/components/src/defs/text.tsx:215`, `misc.tsx:82`). No hay pistas ni pregunta guía |
| P6 | Falta explicar temas nuevos | El prompt fija la estructura: 3 a 6 secciones, 8 a 16 slides, y la última es «Resumen y práctica» (`prompts/index.ts:16-17`). No hay bloque de motivación ni de intuición |
| P7 | No hay slide de salida o cierre de clase | El layout `closing` existe (`packages/contracts/src/layouts.ts:128`), pero es **opcional** y solo se usa «si resume ideas clave» (`prompts/index.ts:49`, `apps/worker/src/handlers/design.ts:151,163`) |
| P8 | No se puede elegir cuántas slides | Fijo en 8 a 16 en el prompt. El esquema permite hasta 60 (`deck.ts:92`) |
| P9 | Se muestra el texto «UPS» en vez del logo | El pie de portada pinta `institutions.short` (`packages/engine/src/SlideView.tsx:77`, `layouts.css:15`). Los logos solo aparecen en la barra de `cover-branded` (`SlideView.tsx:65-84`). Las slides interiores no llevan logo y su pie está oculto por defecto |
| P10 | El profesor pide un logo «permanente» en una esquina configurable, más grande en la portada | No existe esa opción |
| P11 | Más variedad de temas, accesibilidad «AAAA» | Hay 10 temas (`packages/contracts/src/themes.ts:17-107`, `packages/engine/src/themes/*.css`). Los tests exigen tinta ≥ 7:1 y texto atenuado ≥ 4.5:1 (`packages/engine/test/themes.test.ts`). Nota: **AAAA no existe**; el máximo de WCAG 2.2 es AAA |
| P12 | Los usuarios no técnicos no saben cuánta información poner | El formulario (`apps/web/src/app/presentations/new/form.tsx`) solo ofrece textos de ayuda; no hay checklist ni guía |
| P13 | La pantalla de carga debería ser más dinámica y con la marca Lámina | `apps/web/src/components/JobWatcher.tsx:116-117` muestra un spinner, la etapa y un contador |
| P14 | Recoger datos del docente en el onboarding (para investigación) | `user_profiles` (`packages/db/src/schema.ts:224-239`) guarda nombre, institución y logo; no guarda materias ni carrera. La institución sale de una lista cerrada, sin opción «otra» |
| P15 | El MCP «da pena»: ChatGPT intentó abrir Lámina y luego mandar un prompt de diseño | Ver §2.3 |
| P16 | El editor dentro de Lámina está muy cargado y cuesta entenderlo. Con una IA conectada es fácil, pero hace falta más intuición | `apps/web/src/app/presentations/[id]/preview/{information,design}/*` exponen layouts, props y LaTeX |
| P17 | El docente debe poder descargar la presentación en PDF, quizá también una versión offline | No hay exportación: ni PDF, ni PPTX, ni offline |

**Por qué fallaron las cónicas (P1):**
- **SDK mínimo.** El SDK del sandbox (`apps/sandbox-runner/sandbox/sdk/types.d.ts`) solo tiene `compileFn` para y=f(x); no hay ayudas para curvas implícitas, paramétricas o polares.
- **Prohibiciones demasiado amplias.** `astcheck.ts:9-14` prohíbe identificadores comunes como `origin`, `top`, `replace`, `open` o `constructor`, y también el acceso con corchetes `obj["x"]`.
- **Typecheck estricto** y solo 3 intentos.
- **`duplicateOf` cuenta como fallo** (`component.ts:69`), aunque los componentes nativos tampoco saben dibujar una elipse.
- **Lo nativo no cubre el caso.** `FunctionPlot` solo dibuja y=f(x) y `GeometryFigure` no tiene elipses ni parábolas.

**Restricción del proveedor de IA:** OpenRouter solo se usa con `response_format: json_object` (`packages/ai/src/openrouter.ts:31`). **No hay tool-calling nativo**, y eso condiciona el harness (§5.2).

### 2.3 Estado del MCP

- **Herramientas** (`packages/mcp/src/server.ts`, `tools.ts`, `guide.ts`):
  - `list_presentations`, `get_presentation`, `create_presentation`
  - `submit_content_draft` (completo)
  - `validate_deck`
  - `submit_deck` (completo, máximo 12 versiones, `limits.ts`)
  - `get_render_issues`
- **Instrucciones:** dicen «tú redactas contenido y propones el diseño», pero no dejan claro que **no existe** forma de abrir la app ni de pedirle a la IA de Lámina que haga algo.
- **El modelo de trabajo choca con cómo trabaja la IA externa.** Para diseñar hay que leer cuatro recursos (`schemas`, `catalog`, `layouts`, `themes`) y armar un deck JSON completo. Un LLM conversacional tiende a pedir «haz el diseño» en vez de construirlo.
- **Decisión (§3): la IA externa genera el contenido completo y el diseño ella misma; Lámina es el motor** (valida, dibuja, detecta problemas y guarda).

---

## 3. Decisiones tomadas

Están cerradas. No las vuelvas a discutir; si algo choca con el código, avisa.

| Tema | Decisión |
|---|---|
| Plan previo | **Fusionar** el PLAN-v3 técnico (workspace, jobs, MCP) con lo nuevo en un solo V3 |
| Release | **Un gran release V3** (v3.0.0), integrado de forma continua y detrás de flags. El changelog se mantiene al día |
| Audit-2 (23-oct, 14 hallazgos) | **Fuera de alcance:** ya está resuelto en el commit `3e1cb1e` |
| Modelos de IA | **Solo gratis** (`:free`, ADR-001), también para el harness y los componentes |
| Áreas | Programación/computación, educación/humanidades/sociales, ciencias naturales (química y biología), matemáticas ampliadas (cónicas, implícitas, paramétricas, polares, 3D, estadística) **y un motor general** de respaldo para cualquier otra área |
| Imágenes: fuentes | Bancos libres (Wikimedia Commons, Openverse, Unsplash, Pexels) **y búsqueda web gratuita** (SearXNG imágenes) |
| Imágenes: derechos | **Cualquier fuente; el crédito en la slide es opcional.** Internamente se guarda siempre la metadata de procedencia |
| Imágenes: revisión | La elección es **automática**, y el docente puede **reemplazarla** en el editor: ver alternativas, buscar otra, subir la suya o quitarla |
| Harness de la IA | **Harness propio con herramientas**, sin cabeza, dentro del worker, operando sobre el workspace. No se usan agentes CLI de terceros |
| Ejercicios | **Pistas graduales y solución revelable:** enunciado, pregunta guía, pistas, pasos explicados con el porqué de cada uno y la respuesta al final, con revelado progresivo |
| Explicación | **Slides de contexto y motivación** antes de cada concepto, **material para el alumno** y una **slide de salida o cierre de clase obligatoria** |
| Material del alumno | **Página web compartible y PDF** |
| Exportación del docente | **PDF de la presentación** y **versión offline** |
| Cantidad de slides | **Corta ~8, Media ~15, Extensa ~25.** La IA decide dentro del rango |
| Animaciones | **Sistema de motion propio por código** (no IA): entradas escalonadas, magic-move, gráficas que se dibujan, presets por tema, reduced-motion |
| Logo | **Valor por defecto en el perfil y otro por presentación que lo sobrescribe.** Esquina configurable (o oculto), cuál logo, pequeño en interiores y grande en portada. Se reemplaza el texto «UPS» por el logo |
| Temas | **Temas por área nueva, tema institucional automático y más variaciones de layout y decoración** |
| Accesibilidad | **WCAG AAA en las slides, AA en la app** |
| Onboarding | Materias que dicta, carrera y facultad, institución libre («otra universidad»), perfil docente (experiencia, modalidad, nivel, familiaridad tecnológica) y **consentimiento de investigación** explícito |
| Editor | **Edición directa sobre la slide y chat con Lámina por slide** |
| MCP | La IA externa es **la autora**; Lámina es el motor. Debe poder: **editar por partes**, **buscar e insertar imágenes**, **proponer componentes nuevos (código)** y **recibir una guía de flujo paso a paso** |

---

## 4. Precauciones (docentes ya en producción)

Son obligatorias para **cada** cambio de V3.

- **Sin reenvíos.** Ninguna presentación existente se invalida, se reinicia ni pide volver a subir contenido. Si una migración no puede conservar algo, **no se hace**.
- **Migraciones solo aditivas.**
  - Tablas y columnas nuevas; nunca se renombra ni se borra en la misma versión.
  - Las columnas nuevas nacen con valor por defecto o `null`, y `null` significa «comportamiento v2».
  - El borrado, si llega, va en una versión posterior, tras comprobar que nada lo usa.
- **Respaldo antes de migrar.** Hacer `scripts/backup.sh` y un `pg_dump` verificado antes de cualquier migración en producción. Probar la migración en una **copia** de la BD con datos reales; ver `docs/evidence/` para el precedente.
- **Compatibilidad hacia atrás.**
  - `submit_content_draft` y `submit_deck` siguen funcionando igual.
  - Lo nuevo se añade al lado: herramientas nuevas y campos opcionales.
  - Hoy los esquemas son estrictos: `DECK_SCHEMA_VERSION = 1` es un `z.literal` (`packages/contracts/src/deck.ts:6,90`), y lo mismo ocurre con el contenido (`content.ts:5,129`). Cualquier cambio de esquema **sube `schemaVersion`** y añade un lector `parse*Any` que acepta v1 y v2 y convierte en memoria. **Las versiones guardadas nunca se reescriben.**
- **Lectores antes que escritores.** web, worker y renderer se despliegan por separado. Primero se despliega en **los tres** servicios el código que *lee* v2; solo después se activa el flag que hace que algo *escriba* v2.
- **Feature flags por usuario y por presentación.**
  - Se guardan en `app_settings` (`packages/db/src/schema.ts:480`), con una tabla o columna nueva de overrides si hace falta.
  - Se activan en tres pasos: cuentas de prueba, luego docentes voluntarios, al final todos.
  - Deben poder apagarse sin deploy.
- **Reanudar, no reiniciar.** Una presentación que está en `designing` o `polishing` durante un deploy debe continuar donde iba. Hasta que exista la reanudación (bloque 1), **no se despliega el worker con jobs activos** salvo que el docente afectado esté avisado.
- **Despliegues por servicio.** Se puede desplegar solo `web` sin tocar `worker`. Ese camino se documenta y se automatiza.
- **Ventanas y aviso.** Desplegar fuera de horas de clase. Si hay jobs activos, esperar a que se vacíe la cola (`DRAIN_SECS`) o diferir.
- **Nada de cambios manuales en la BD de producción** sin dejarlos escritos (script y motivo) en `docs/runbook-*.md`.
- **Reversibilidad.** Cada bloque se puede revertir apagando el flag y volviendo a la imagen anterior, sin perder datos nuevos.
- **Cuota y costo.** La IA cuesta 0 USD. El workspace y el harness **no deben aumentar** las llamadas por presentación; se mide antes y después (§9).
- **Pruebas pesadas** con `heavy.sh`, con un máximo de 1 o 2 agentes simultáneos, porque la máquina de desarrollo ha tenido OOM.

---

## 5. Arquitectura

### 5.0 Pieza central: un motor de operaciones compartido

Hay **un solo** motor de cambios sobre las presentaciones, y lo usan **tres clientes**:
- el editor web (edición directa y chat por slide);
- el harness de la IA de Lámina;
- MCP v2 (IA externa).

- **Ubicación:** `packages/db/src/workspace.ts`, con tipos en `packages/contracts/src/ops.ts`.
- **Datos:** tablas nuevas `workspaces` y `workspace_ops`; no se toca `deck_versions`.
  - **`workspaces`:** `id`, `presentationId` (único), `rev` (entero), `content` (jsonb), `deck` (jsonb), `baseDeckVersionId`, `baseContentVersionId`, `updatedAt`.
  - **`workspace_ops`:** `id`, `workspaceId`, `rev`, `opId` (único por workspace, para idempotencia), `author` (`ia|mcp|docente|sistema`), `op` (jsonb), `inverse` (jsonb, para deshacer), `batchId`, `createdAt`.
- **Creación perezosa:** al abrir o editar una presentación existente se crea su workspace a partir de la versión vigente. **No hay migración masiva.**
- **API:** `applyOps(ws, ops[], author, { dryRun, baseRev })` devuelve `{ ok, issues[], newRev, appliedOpIds }`.
  - Es atómica por lote.
  - Si `baseRev` ya no coincide, devuelve el error `stale_rev` con un diff, en vez de rechazar en silencio.
- **Ops de deck:** `add_slide`, `replace_slide`, `remove_slide`, `move_slide`, `set_slot`, `set_slot_props` (parcial), `set_build`, `set_notes`, `set_theme`, `set_logo`, `set_motion`.
- **Ops de contenido:** `add_section`, `edit_section`, `add_block`, `replace_block`, `remove_block`, `move_block`.
- **Validación:** se reutiliza `checkDeck`/`deck-check.ts` y la fidelidad de fórmulas (`packages/mcp/src/deck-check.ts`, `content-check.ts`, `packages/validation`), aplicada **solo a lo que cambió** más las reglas globales baratas.
- **Checkpoints:** `commitCheckpoint(ws, author, label)` crea una fila inmutable en `deck_versions`/`content_versions` como hoy. El historial actual sigue siendo el historial.
- **Deshacer y rehacer** por op y por lote (`batchId`), más un diff por slide para mostrar «qué cambió la IA».
- **Concurrencia:** un lote a la vez por presentación (lock de fila o advisory lock), con detección de conflicto por `rev`.
- **Máquina de estados:** se permite aplicar ops mientras la presentación está en `designing` si no tocan slides `running` (incidente 8). Se ajusta en `packages/db/src/workflow.ts`.

### 5.1 Robustez y jobs durables

Es el bloque técnico del PLAN-v3 original.

- **Un error de parseo cuenta como un intento** y nunca aborta el bucle (incidente 4). Se aplica a componentes, diseño, reparación, contenido y pulido.
- **Reparación de JSON** en `packages/ai/src/client.ts`:
  - recortar la prosa;
  - extraer el primer objeto equilibrado;
  - cerrar llaves;
  - reintentar con el error como contexto;
  - cadena de modelos de respaldo.
- **Degradación elegante:** si una slide no se puede generar, se conserva la versión estable anterior y queda marcada para revisión sin detener las demás. Ya existe en parte: `slidesFromHint` en `design.ts:176`.
- **Registro por intento:** modelo, tokens, error y latencia. Métrica de JSON ilegible por modelo.
- **Unidad de trabajo persistente:**
  - tabla `work_units`: `id`, `jobId`, `presentationId`, `kind` (`slide|component|block|image`), `ref`, `state` (`pending|running|done|failed|quota_wait`), `attempts`, `heartbeatAt`, `error`, `result` (jsonb);
  - el resultado se guarda al terminar cada unidad;
  - un reinicio solo repite lo que estaba `running`.
- **Reanudación por heartbeat:** al arrancar, el worker recupera las unidades `running` con el heartbeat vencido.
- **Timeouts por unidad** (90 a 180 s por slide), configurables por entorno. Se alinea `QUEUE_CONFIG` (`packages/jobs/src/index.ts`) con el comportamiento real (incidentes 2 y 3).
- **Cancelación cooperativa** con `AbortSignal` cuando pg-boss expira un handler; así no quedan handlers zombis.
- **Colas por tipo y prioridad:** reparar una slide no espera detrás de un diseño completo (incidente 9).
- **Progreso visible:** «12 de 29 diapositivas listas», con reintento solo de las fallidas.
- **`quota_wait` como estado propio:** reanuda solo y la UI lo dice.
- **Detector:** corregir los falsos positivos de KaTeX (`h4c`, `\quad`, `\text`) en `detectSlideIssues`.
- **Render incremental:** solo se vuelven a renderizar las slides que cambiaron.

### 5.2 Harness propio de la IA (`apps/worker/src/harness/`)

Le da a la IA de Lámina un espacio de trabajo con herramientas pequeñas en vez de regenerar archivos completos.

- **Protocolo** (no hay tool-calling nativo con modelos free sobre OpenRouter):
  - En cada turno el modelo devuelve `{ "thought"?: string, "action": { "tool": "<nombre>", "args": {...} } }`.
  - Se valida con una unión discriminada de zod por herramienta.
  - Un JSON inválido o una herramienta desconocida **consume un paso**, y el error vuelve como observación.
- **Herramientas:**

  | Herramienta | Efecto |
  |---|---|
  | `read_slide(id)` | JSON de la slide, sus issues de render actuales y un resumen de sus vecinas |
  | `read_content_section(id)` | Bloques de contenido aprobado de la sección |
  | `list_components(area?)` | Catálogo filtrado (id, versión, props resumidas) |
  | `edit_slot(slideId, slot, props \| component)` | Op `set_slot` o `set_slot_props` |
  | `replace_slide(slide)` | Op `replace_slide` |
  | `set_build(slideId, steps)` | Op `set_build` |
  | `search_images(query)` / `use_image(resultId, slideId, slot)` | Motor de imágenes (§5.5) |
  | `validate()` | `applyOps` en `dryRun` sobre las ops pendientes |
  | `render_slide(id)` | Job del renderer para una slide: devuelve los issues y una captura opcional para `packages/ai/src/vision.ts` si hay modelo de visión free |
  | `done(summary)` | Cierra la unidad |

- **Contexto mínimo:** la slide, sus vecinas, el resumen del contenido aprobado, el área y los issues actuales. Nunca el deck entero.
- **Presupuesto duro por slide:** unos 8 pasos y un tope de tokens configurable. Si se agota, se conserva la última revisión válida y la slide queda marcada para revisión.
- **Bucle exterior determinista:** una `work_unit` por slide (§5.1). El modelo solo actúa *dentro* de una slide; el recorrido lo decide el código.
- **Orden de adopción** (detrás de flags):
  1. reemplazar `apps/worker/src/handlers/repair.ts` («Corregir automáticamente»): debe volver a renderizar y validar que el issue desapareció; si no, dice «no fue posible corregir automáticamente»;
  2. el chat por slide del editor (§5.8);
  3. `design.slide` en `design.ts`.

  Los handlers viejos se conservan detrás del flag.
- **Métrica obligatoria:** llamadas y tokens por deck, antes y después. Si sube, no se activa para todos.

### 5.3 Motor multi-área

- **Registro de áreas:** `packages/contracts/src/areas.ts`, solo datos.
  ```ts
  export const AREA_IDS = ["math", "programming", "humanities", "natsci", "general"] as const;
  export type AreaPack = {
    id: AreaId; label: string; keywords: RegExp[];
    blockTypes: BlockType[];            // bloques de contenido permitidos/preferidos
    componentIds: string[];             // catálogo preferido
    themeIds: ThemeId[];                // temas sugeridos
    exercisePolicy: "hints-steps-answer" | "activity" | "code-trace";
    researchQueryHints: string[];       // reemplaza "definición teorema"
  };
  ```
  - `humanities` cubre educación, humanidades, sociales y derecho.
  - `general` es el respaldo para cualquier área no reconocida: estructura pedagógica genérica, imágenes, actividades, sin supuestos matemáticos.
- **Prompts por área:** `packages/ai/src/prompts/areas/<id>.ts` contienen el fragmento de sistema (persona, reglas de bloques y ejemplos propios del área).
  - `contentSystem(area)` pasa a ser `contentSystem(pack, { subject, level, length })`.
  - Las reglas comunes (pedagogía §5.4, cantidad, cierre) quedan en un fragmento compartido.
  - `designSlideSystem`, `polishSystem` y `componentSystem` dejan de decir «ciencias exactas» y reciben el área.
- **Detección del área:** columna nueva `presentations.area text null`, donde `null` significa el comportamiento v2 de matemáticas. Se decide en este orden:
  1. lo que elige el docente en el formulario, precargado desde las materias de su perfil (§5.9);
  2. un campo `area` extra en la llamada que ya existe a `researchQueries` (`research.ts`), así que no añade llamadas;
  3. regex de `keywords` (reemplaza `areaOf` en `content.ts:11`);
  4. `general`.
- **`subject` llega por fin al prompt de contenido.**
- **Catálogo por área:**
  - se añade `areas: AreaId[] | "all"` a `CatalogEntry` (`packages/components/src/define.ts`);
  - `catalogForPrompt` (`packages/components/src/registry.ts`) filtra por área, lo que también reduce tokens;
  - los ejemplos de los componentes genéricos dejan de ser todos de cálculo.
- **Componentes nativos nuevos** en `packages/components/src/defs/`:
  - **Versionado:** ids nuevos o versión 2.0.0. **Nunca se modifica una versión publicada**, porque el resolver usa versión exacta.
  - **Accesibilidad:** cada componente lleva fixtures, test de render y cumple AAA (§5.7).

  | Archivo | Componentes |
  |---|---|
  | `math-ext.tsx` | `ConicFigure` (elipse, parábola e hipérbola con focos, directriz, vértices y ejes), `ImplicitPlot` (marching squares sobre una expresión mathjs f(x,y)=0), `ParametricPlot`, `PolarPlot`, `StatChart` (histograma, caja, dispersión) |
  | `programming.tsx` | `CodeBlock` (resaltado en build con una librería ligera sin eval, líneas resaltables por paso), `CodeTrace` (ejecución paso a paso: línea activa, variables y salida, con revelado), `Flowchart`, `ConsoleOutput`, `DataStructure` (array, lista, pila, cola, árbol, grafo) |
  | `humanities.tsx` | `Timeline`, `ConceptMap`, `QuoteSource` (cita con autor y obra), `CaseStudy`, `ClassActivity` (debate, pregunta para la clase, trabajo en pares, con tiempo sugerido) |
  | `natsci.tsx` | `LabeledDiagram` (imagen con marcadores numerados y leyenda), `ProcessCycle` (ciclos y etapas) |
  | `general.tsx` | `Image` (§5.5), `Exercise` (§5.4), `ExitSlide` (§5.4), `KeyIdea`, `Motivation` |

- **Iconos:** el set fijo de `IconBullets` y `Callout` (`rich.tsx:171`) se amplía con iconos genéricos de lucide.
- **Componentes generados** (para que cónicas y similares no vuelvan a fallar):
  - **SDK** (`apps/sandbox-runner/sandbox/sdk/` y sus tipos): `compileFn2(expr)` para f(x,y), `implicitContours(f, bounds, res)`, `parametric(fx, fy, tRange)`, `polar(fr, θRange)` y helpers de geometría (`ellipsePath`, `parabolaPath`, `hyperbolaPaths`, `arrow`, `label`).
  - **`astcheck.ts`:** dejar de prohibir *identificadores* (`origin`, `top`, `replace`, `open`…) y prohibir solo los *accesos peligrosos* (`window.*`, `globalThis.*`, `document.*`, `fetch`, `eval`, `Function`, `import()`, `constructor`/`prototype` como acceso a miembro, acceso por corchetes con claves no literales).
    - Todos los casos de `packages/sandbox-kit/test` deben seguir bloqueados, y se añaden casos nuevos.
    - Pasar el cambio por el agente `reviewer` antes de activarlo.
  - **`duplicateOf`** (`component.ts:69`): si el componente nativo propuesto **sí** cubre el propósito, se usa. Si no, se reintenta pidiendo explícitamente un componente nuevo; ya no cuenta como fallo.
  - **El prompt `componentSystem`** incluye el SDK nuevo, ejemplos (cónica, árbol binario, línea de tiempo) y la lista de lo prohibido con alternativas.
  - **Tests con casos reales en CI** usando un proveedor falso con TSX grabado: cónicas, árbol binario y línea de tiempo.
- **Investigación por área:** las consultas por defecto salen de `researchQueryHints` del área en vez de «definición teorema».

### 5.4 Pedagogía (contenido v2)

- **Contenido v2** (`packages/contracts/src/content.ts`, `CONTENT_SCHEMA_VERSION = 2`, con `parseContentAny` para leer también v1). Bloques nuevos:
  - **`motivation {hook, intuition, everydayExample?}`:** va antes de cada concepto nuevo (por qué importa, intuición, ejemplo cotidiano) y después viene la formalización.
  - **`exercise {statement, guidingQuestion, hints[1..3], steps[{do, why}], answer, commonMistakes?[]}`.**
  - **`code {language, source, highlightSteps?[]}`.**
  - **`imageRequest {query, purpose, alt}`:** el motor de imágenes lo resuelve (§5.5).
  - **`activity {kind, prompt, minutes}`.**
  - **`closing {keyIdeas[], questions?[], nextClass?, exitTicket?}`.**
  - **`meta.length`:** `"short" | "medium" | "long"`.
  - **`meta.area`.**
- **Reglas comunes de los prompts** (fragmento compartido):
  - Estructura por concepto: motivación, intuición y ejemplo cotidiano, formalización, ejemplo resuelto **explicado**, ejercicio con pistas.
  - Los ejercicios **nunca** muestran la respuesta junto al enunciado.
  - Cada paso explica **por qué** se hace, no solo qué se hace.
  - Lenguaje para alguien que ve el tema por **primera vez**.
  - **Cantidad:** corta unas 8 slides (6 a 10), media unas 15 (12 a 18), extensa unas 25 (22 a 28). La IA decide dentro del rango.
  - **La última slide es siempre el cierre de clase:** ideas clave, preguntas, próxima clase o ticket de salida.
- **Validación en código** (`packages/validation`), no solo en el prompt:
  - el cierre es obligatorio (si falta, se genera uno a partir del resumen);
  - un `exercise` sin pistas o con la respuesta en el primer paso es inválido;
  - la cantidad debe caer dentro del rango (con tolerancia).
- **Revelado progresivo:**
  - `Exercise` en el motor: el enunciado y la pregunta guía se ven primero; luego cada pista, cada paso (qué y por qué) y la respuesta al final. Usa `build.steps`.
  - `build.steps` sube de un máximo de 8 a **16** (`deck.ts:21`) en el deck v2.
  - `stepwise` pasa a estar **activo por defecto** para `Exercise`, `WorkedExample`, `Derivation`, `Checkpoint` y `CodeTrace`; el pulido ya no es el único que lo activa.
- **Diseño:** `designSlideSystem` sabe mapear `motivation`, `exercise`, `code`, `activity`, `closing` e `imageRequest` a sus componentes. El fallback (`packages/components/src/fallback.ts`) cubre los bloques nuevos.

### 5.5 Motor de imágenes

- **Proveedores:** `packages/research/src/images.ts`, con la interfaz `ImageProvider { search(query, opts): ImageResult[] }`, siguiendo el patrón de `SearchProvider` y `searchWithFallback`.
  - **Orden:** Wikimedia Commons, Openverse, Unsplash, Pexels (estos dos con claves gratuitas por variable de entorno; se omiten si faltan) y SearXNG con `categories=images` (búsqueda web gratuita).
  - **SafeSearch** activado.
  - **`ImageResult`:** `{ id, thumbUrl, url, pageUrl, width, height, provider, author?, license?, licenseUrl? }`.
- **Ingesta (nunca se enlaza una imagen externa en un deck):**
  1. `safeFetch` (`packages/research/src/ssrf.ts`): se añaden los tipos MIME de imagen a `DEFAULT_ALLOWED_TYPES` (línea 41), un tope de 8 MB, y **cada redirección se vuelve a validar contra `isBlockedIp`** (verificar si ya lo hace y si fija el DNS).
  2. `sharp` con `limitInputPixels`, sin EXIF, como máximo 2400 px de lado y salida webp. Se reutiliza `apps/web/src/lib/branding-image.ts` (re-codificación, rasterizado de SVG, timeout), moviéndolo a un paquete compartido si el worker lo necesita.
  3. Se guarda en `DATA_DIR/assets/<sha256>.webp`, con deduplicación por hash.
- **Tabla `assets`:** `id`, `ownerId`, `presentationId?`, `sha256`, `mime`, `width`, `height`, `origin` (`upload|search|mcp`), `provider`, `pageUrl`, `author`, `license`, `licenseUrl`, `alt`, `createdAt`.
- **Créditos:** se guarda **siempre** la procedencia. En la slide el crédito es opcional (`Image.showCredit`, apagado por defecto); en el material del alumno y en la exportación, una página de créditos.
- **Ruta `apps/web/src/app/api/assets/[id]/route.ts`:**
  - autoriza al dueño, a un token de compartir o a un **token de render** (el renderer carga la app con un token, `apps/renderer/src/main.ts:26`);
  - devuelve cabeceras de caché inmutables;
  - `InternalAsset` (`deck.ts:51`) amplía su regex para aceptar `/api/assets/<uuid>`;
  - la CSP de la app ya admite `img-src 'self'`, así que no cambia.
- **Componente nativo `Image`:** props `assetId`, `alt` (**obligatorio**), `fit` (`cover|contain`), `focal {x,y}`, `caption?`, `showCredit?`. El sandbox sigue sin admitir `img`; las imágenes solo entran por componentes nativos.
- **Flujo automático:**
  - el contenido emite `imageRequest`;
  - un job `image.resolve` (una `work_unit` por imagen) busca, elige con una heurística (tamaño, proporción, proveedor) y opcionalmente con visión free, ingiere y adjunta el `assetId`;
  - si no hay resultado, la slide se diseña sin imagen y no falla.
- **En el editor** (§5.8): sobre una imagen, «Ver alternativas» (los siguientes resultados ya guardados), «Buscar otra», «Subir la mía», «Quitar» y editar el texto alternativo.
- **Cuota diaria de imágenes** por usuario en `consumeQuota`.

### 5.6 Motion por código (sin IA)

- **Contratos:**
  - `packages/contracts/src/motion.ts` define los presets `calm | lively | editorial`, y se añade `ThemeSpec.motion` (preset por tema).
  - Deck v2 (`DECK_SCHEMA_VERSION = 2` con `parseDeckAny`) añade campos **opcionales**:
    - `Slide.motion? { enter: "stagger" | "none", emphasis?: ... }`;
    - `key?` por slot, para el magic-move;
    - `meta.logo` (§5.7).
- **Motor** (`packages/engine/src/motion/`):
  - **Entradas escalonadas:** variables CSS por slot (`--lm-i`) y retardo calculado.
  - **Magic-move entre slides:** View Transitions API con `view-transition-name` derivado de `key`. Si el navegador no lo soporta, se hace fade.
  - **Gráficas que se dibujan:** `stroke-dasharray`/`stroke-dashoffset` en los componentes SVG (`FunctionPlot`, `ConicFigure`, `Timeline`, `Flowchart`…).
  - **Contadores** (`StatCard`), resaltado progresivo de fórmulas y código, y los revelados de `Exercise` y `CodeTrace`.
  - **Transiciones de slide** más ricas por preset, en `base.css`.
  - **Reduced motion:** todo dentro de `prefers-reduced-motion: no-preference`; con reduced motion, cortes y fundidos mínimos.
  - **Sin librería pesada** salvo que haga falta (CSS y WAAPI). Si se necesita una, Motion (framer) solo en el motor.
- **Renderer:** Playwright con `reducedMotion: "reduce"` y paso final, para capturas deterministas.
- **El pulido ya no elige transiciones;** solo propone revelados (`build`) cuando aporta.
- **Pantalla de carga con la marca Lámina** (P13): reemplaza el spinner de `JobWatcher.tsx`.
  - Animación de la marca: la «lámina» que se va dibujando.
  - Etapas vivas y progreso real por unidad («12 de 29»), a partir de `work_units`.
  - Consejos pedagógicos rotativos.
  - Aviso «está tardando más de lo esperado» con las opciones de reintentar o cancelar.
  - Respeta reduced motion.

### 5.7 Marca, logo, temas y accesibilidad

- **Logo real en vez del texto «UPS»** (`SlideView.tsx` Chrome):
  - El pie de portada (`:77`) muestra el logo pequeño de la institución. Si no hay logo, muestra el nombre corto, igual que hoy.
  - El cierre (`:81`) también lleva el logo.
- **Logo persistente:** campo `meta.logo { corner: "tl"|"tr"|"bl"|"br"|"none", which: "institution"|"personal"|"both", size?: "s"|"m" }`.
  - **Slides interiores:** logo pequeño fijo en la esquina elegida (zona reservada en `packages/contracts/src/geometry.ts` para que no choque con el contenido; el detector de desbordes la tiene en cuenta).
  - **Portada:** logo grande, mayor que la barra actual de 108 px.
  - **Temas oscuros:** se conserva el fondo blanco detrás del logo (`layouts.css:22`).
- **Dónde se configura:**
  - **Valor por defecto en el perfil:** columnas nuevas en `user_profiles`: `logoCorner`, `logoWhich`.
  - **Por presentación:** se sobrescribe desde el editor de diseño.
  - **Al construir el deck:** Lámina aplica el valor efectivo, como ya hace con `meta.branding`.
- **Temas nuevos** (metadatos en `themes.ts` y CSS en `packages/engine/src/themes/`):
  - **Por área:** `programacion-terminal` (código y terminal, monoespaciado), `humanidades-editorial`, `biologia-natural`, `educacion-calido`; también en variante oscura cuando aplique.
  - **Tema institucional automático:** generado a partir de `institutions.primaryColor`/`secondaryColor`, ajustando la luminosidad en OKLCH hasta pasar los tests de contraste. Si el color resultante se aleja del de marca, se avisa al docente.
  - **Más variaciones de layout y decoración por tema:** nuevas `deco` y layouts para imagen, línea de tiempo, código y actividad, para que dos presentaciones no se vean iguales.
  - **`ThemeSpec.area`** pasa de texto libre a `AreaId[]`; `proposeStyle` (`themes.ts:163`) usa el área.
- **Accesibilidad AAA en las slides:**
  - los tests de `packages/engine/test/themes.test.ts` ya exigen tinta ≥ 7:1;
  - se suben las exigencias a AAA para todo el texto (texto atenuado ≥ 7:1, texto grande ≥ 4.5:1) en **todos** los temas, acentos y el institucional generado;
  - tamaños mínimos de fuente en el canvas;
  - `alt` obligatorio en `Image`;
  - reduced motion;
  - orden de lectura y foco en el visor.
- **Accesibilidad AA en la app web:** contraste, foco visible, etiquetas y navegación por teclado.

### 5.8 Experiencia del docente (web)

- **Formulario de creación** (`apps/web/src/app/presentations/new/form.tsx`):
  - **Selector de área**, precargado desde el perfil; si no se elige, se detecta sola.
  - **Selector de cantidad:** Corta, Media o Extensa, con una descripción y una duración aproximada de clase.
  - **Checklist guiada** para usuarios no técnicos. Es un panel lateral que se va marcando en vivo:
    - objetivo claro;
    - nivel;
    - qué saben ya los alumnos;
    - materiales o apuntes;
    - ejemplos que quiere ver;
    - qué evitar.
  - Cada ítem explica **por qué ayuda** y avisa del **costo**: más material implica más tiempo de investigación y de generación.
  - **Indicador de «calidad del pedido»:** básico, bueno o excelente.
  - **Plantillas por área** como ejemplo de lo que conviene escribir.
- **Pantalla de carga:** ver §5.6.
- **Editor simplificado** (`apps/web/src/app/presentations/[id]/preview/design/*`, `review.tsx`):
  - **Edición directa sobre la slide:** clic en un texto, imagen o fórmula de la slide para editarlo ahí (WYSIWYG sobre el canvas del motor). Cada edición es una op de `applyOps`.
  - **Panel lateral contextual:** solo muestra opciones del elemento seleccionado. Las fórmulas siguen usando el editor visual que ya existe.
  - **Chat con Lámina por slide:** «hazla más visual», «agrega un ejemplo», «simplifica el texto». Lanza el harness (§5.2) sobre esa slide; el resultado se muestra como **diff**, con aceptar o deshacer.
  - **Lo técnico queda fuera de la vista principal:** layouts, props y LaTeX crudo pasan a un «modo avanzado» plegado.
  - **Historial:** «qué cambió la IA», con deshacer por lote.
  - Pasar la UI por las skills de diseño del entorno (p. ej. `impeccable`) para reducir la carga visual.
- **Exportación:**
  - **PDF de la presentación:** el renderer (`apps/renderer/src/main.ts`) gana un modo `pdf` (Playwright `page.pdf` a 1920×1080, paso final de cada slide, con fuentes e imágenes incrustadas). Es un job `export.pdf` con descarga desde la vista de la presentación.
  - **Versión offline:** un ZIP con HTML autocontenido que incluye el player de `packages/engine` empaquetado, el deck JSON, los assets, las fuentes y los bundles de componentes generados. Abre sin red con `index.html`. Es un job `export.offline`.
- **Material del alumno:**
  - **Fuente:** se genera a partir del contenido aprobado, sin IA extra por defecto; opcionalmente un paso de redacción.
  - **Contenido:** resumen por sección, conceptos clave, ejercicios con pistas, **soluciones al final** y créditos de las imágenes.
  - **Página web compartible:** ruta pública con el token de compartir que ya existe (`visibility`, `shareTokenHash`).
  - **PDF:** con el mismo renderer.
- **Notificaciones** (si no las dejó ya el commit `3e1cb1e`): avisar cuando termina cada etapa larga.

### 5.9 Onboarding y datos para investigación

- **Columnas nuevas en `user_profiles`** (`packages/db/src/schema.ts:224`), todas nullable:
  - `subjects text[]`, `career`, `faculty`;
  - `yearsTeaching int`;
  - `modality` (`presencial|virtual|hibrida`);
  - `levels text[]` (`grado|posgrado|tecnologico|otro`);
  - `techFamiliarity` (1 a 5);
  - `aiFamiliarity` (1 a 5).
- **«Otra universidad»:**
  - `institutions` gana `createdBy uuid null` y `verified boolean default true`, para que las existentes queden verificadas;
  - el docente puede crear la suya con nombre, nombre corto, logo y colores;
  - queda `verified=false` y **no aparece en la lista de otros docentes** hasta que un admin la verifique en `/admin`.
- **Consentimiento de investigación:**
  - es **separado y opcional**, en una versión nueva del texto: `researchConsentAt`, `researchConsentVersion` y `researchConsentWithdrawnAt`;
  - **no obliga** a los docentes actuales a volver a aceptar el consentimiento general;
  - se puede retirar en `/cuenta`;
  - el texto lo revisa un humano (LOPDP Ecuador) antes de activarlo;
  - las exportaciones para investigación son anonimizadas.
- **Formularios:**
  - `apps/web/src/app/bienvenida/profile-form.tsx` gana los campos nuevos, en un segundo paso corto y opcional salvo materias y carrera;
  - a los docentes ya registrados se les piden en `/cuenta` con un aviso **no bloqueante**;
  - **las materias alimentan la detección de área** (§5.3).
- **Panel de admin:** datos agregados (áreas, materias, instituciones) solo de quienes dieron el consentimiento de investigación.

### 5.10 MCP v2: la IA externa es la autora, Lámina es el motor

- **Las herramientas v1 se conservan intactas.** `submit_content_draft` y `submit_deck` se reimplementan *encima* del workspace.
- **Instrucciones del servidor y guía** (`packages/mcp/src/server.ts` `INSTRUCTIONS`, `guide.ts`), más directivas:
  - «**Tú** escribes todo el contenido y **tú** armas el diseño, slide por slide. Lámina no tiene una IA a la que puedas pedirle cosas, y no puedes "abrir" Lámina: Lámina valida, dibuja, detecta problemas y guarda. Para mostrarle algo al docente, dale los enlaces de `get_links`.»
  - «Empieza siempre por `start_here`.»
- **Herramientas nuevas:**

  | Herramienta | Propósito |
  |---|---|
  | `start_here()` | Rol, flujo completo con ejemplos mínimos y estado de las presentaciones del docente |
  | `next_step(presentationId)` | Qué herramienta toca ahora y un **ejemplo de argumentos** listo para adaptar, según la etapa |
  | `create_presentation` | Gana `area` y `length` |
  | `get_outline(id)` | Secciones y slides con ids e intents (barato) |
  | `get_content_section(id, sectionId)` | Lectura por partes |
  | `apply_content_ops(id, ops[], baseRev, opId)` | Edición incremental del contenido |
  | `list_slides(id)` / `get_slide(id, slideId)` | Lectura por partes del deck, con issues de render por slide |
  | `apply_deck_ops(id, ops[], baseRev, opId, dryRun?)` | Edición incremental del diseño, atómica, con validación en seco |
  | `list_components(area?)` | Catálogo filtrado por área, con props resumidas y un ejemplo |
  | `propose_component(id, name, purpose, tsx, propsSchema, fixtures)` | Pasa por **el mismo** camino que los componentes generados (`component.ts`: precheck, sandbox-runner, astcheck, typecheck, render de fixtures). Queda **provisional y solo para esa presentación** |
  | `get_component_status(id, jobId)` | Estado y errores accionables del componente propuesto |
  | `search_images(query)` / `insert_image(id, resultId \| url, slideId, slot, alt)` | Motor de imágenes. Siempre pasa por la ingesta (§5.5) y nunca guarda URLs externas |
  | `render_slide(id, slideId)` | Dispara el render de una slide y devuelve sus issues y la URL de la captura |
  | `get_render_issues` | Se mantiene |
  | `commit_checkpoint(id, label)` | Confirma el lote como una versión que el docente puede revisar |
  | `get_links(id)` | URLs del editor, de la vista previa y del visor, para dárselas al docente |

- **Errores accionables:** `{ code, message, fix: { tool, argsHint } }`, extendiendo `packages/mcp/src/errors.ts`. Ejemplo: «la slide h4 desborda en el slot `body`: acórtalo o usa `apply_deck_ops` con `set_slot_props`…».
- **Límites:** se quita el tope de 12 versiones (`limits.ts`) en favor de un límite por tasa (`rate-limit.ts` ya existe) y de la cuota `mcp_call`.
- **Idempotencia:** por `opId`.
- **Estado de la sesión:** se aceptan ops durante `designing` si no chocan (§5.0).
- **Documentación:** `docs/mcp.md` y las guías de `/conectar` se actualizan (ChatGPT, Claude, Codex).
- **Pruebas de contrato:**
  - camino `start_here` → `next_step` → … → deck dibujado;
  - el cliente v1 sigue funcionando;
  - **prueba manual con ChatGPT real:** debe crear una presentación completa (contenido y diseño, con al menos una imagen) **sin intentar abrir Lámina ni mandar prompts de diseño**.

---

## 6. Qué NO se hace en V3

- No se cambia el modelo de datos existente de forma destructiva ni se «normaliza» el pasado.
- No se pasa a modelos de pago (ADR-001).
- No se eliminan `submit_deck` ni `submit_content_draft`.
- No se modifican versiones publicadas de componentes nativos: se publican ids o versiones nuevas.
- No se exporta a PPTX (no se pidió).
- No se usan agentes CLI de terceros como harness.

---

## 7. Orden de trabajo (un solo release, integración continua con flags)

| # | Bloque | Contenido | Depende de | Criterio de aceptación |
|---|---|---|---|---|
| 0 | **Red de seguridad** | Bucle de intentos y reparación de JSON (§5.1). Timeouts y `QUEUE_CONFIG`. `deploy.sh` por servicio. Infraestructura de flags. Lectores `parseDeckAny`/`parseContentAny` (sin escritores v2). Falsos positivos del detector. Runbook (`docs/runbook-produccion.md`). Respaldo restaurado en una copia | – | Un JSON ilegible ya no marca nada como fallido. Desplegar `web` no toca jobs. Los fixtures v1 pasan por los lectores nuevos. Hay runbook y respaldo verificado |
| 1 | **Jobs durables** | `work_units`, heartbeat, `AbortSignal`, colas con prioridad, progreso «N de M», `quota_wait` | 0 | Matar el worker a media generación y recuperar sin repetir lo ya hecho. Una reparación no espera detrás de un diseño |
| 2 | **Workspace y `applyOps`** | Tablas, ops, validación incremental, checkpoints, deshacer, diff, lock y `rev`, creación perezosa | 1 | Editar una slide no regenera las demás. Las presentaciones existentes se abren sin migración manual. Test de propiedades: `dryRun` da lo mismo que la ejecución real |
| 3 | **Perfil, formulario y marca** | Onboarding y consentimiento de investigación (§5.9). Institución «otra». Selector de cantidad y checklist (§5.8). Logo real, esquina configurable y valor por defecto en el perfil (§5.7). Export PDF (§5.8) | 0 (en paralelo con 1 y 2) | Un docente nuevo de otra universidad se registra con su logo. El logo sale en la esquina elegida en todas las slides. El PDF se descarga. Los docentes actuales no ven nada bloqueante |
| 4 | **Multi-área y pedagogía** | `areas.ts`, prompts por área, detección, `subject` en el prompt, contenido v2 (motivación, ejercicio, cierre, código, actividad, `imageRequest`, `length`), validación pedagógica, `stepwise` por defecto, `build.steps` hasta 16 | 2 | Una presentación de programación y otra de educación general se generan con estructura propia de su área, ejercicios con pistas, slide de cierre y cantidad dentro del rango |
| 5 | **Motor de imágenes** | Proveedores, ingesta segura, `assets`, ruta, componente `Image`, job `image.resolve`, controles en el editor, cuota | 2 | Una presentación de ciencias naturales incluye imágenes reales, guardadas localmente y reemplazables. Pasan los tests SSRF |
| 6 | **Componentes y temas** | Componentes por área (§5.3). SDK ampliado y astcheck revisado (con `reviewer`). `duplicateOf`. Temas por área e institucional, más variaciones. AAA | 4 | La generación de un componente de cónicas funciona en el caso real. Contraste AAA en todos los temas, incluido el institucional |
| 7 | **Motion, carga y offline** | Motion por código (§5.6). Pantalla de carga con marca. Exportación offline | 0 (en paralelo con 3 a 6) | Las slides tienen entradas, magic-move y gráficas animadas. Con reduced motion no hay animación. El ZIP abre sin red |
| 8 | **Harness y editor** | Harness (§5.2): primero repair, luego el chat por slide, luego design. Editor con edición directa y panel contextual (§5.8) | 2, 5 | «Corregir automáticamente» corrige o dice que no pudo. El chat por slide cambia solo esa slide, con diff y deshacer. Las llamadas por deck no suben |
| 9 | **MCP v2** | Herramientas nuevas (§5.10), errores accionables, guía, límites, docs y pruebas de contrato | 2, 5, 6 | ChatGPT real crea una presentación completa sin intentar abrir Lámina. El cliente v1 sigue funcionando |
| 10 | **Cierre del release** | Material del alumno (web y PDF). Despliegue gradual por flags (pruebas, voluntarios, todos). Comparativa de métricas. Changelog **v3.0.0**. Actualizar `docs/known-limitations.md` | todo | Los tres docentes de prueba completan una presentación de su área de principio a fin |

- **Paralelismo posible:** 3 y 7 pueden avanzar a la vez que 1 y 2. Respeta el límite de 1 o 2 agentes simultáneos.
- **En cada bloque:**
  - migraciones solo aditivas, con respaldo y prueba en una copia de la BD;
  - flag que lo apague;
  - entrada en el changelog cuando llegue a producción;
  - revisión con el agente `reviewer` en las implementaciones sustanciales.

---

## 8. Riesgos principales

1. **Harness de varios pasos frente a la cuota free.** Puede multiplicar las llamadas. Se mitiga con un presupuesto duro por slide, contexto mínimo y la métrica de llamadas por deck. No se activa para todos si sube.
2. **Desfase de versiones entre servicios.** Si el worker escribe v2 mientras el renderer sigue leyendo v1, se rompe el render. Por eso los lectores van primero y los escritores detrás del flag (§4).
3. **SSRF e imágenes bomba.** `safeFetch` con revalidación de redirecciones, `limitInputPixels` y tope de tamaño.
4. **Derechos de las imágenes.** «Cualquier fuente, crédito opcional» conlleva riesgo de copyright para la institución. Se mitiga guardando siempre la procedencia, con los bancos libres primero en el orden, SafeSearch, y créditos en el material y en la exportación.
5. **Consentimiento de investigación (LOPDP).** El texto, la retirada y la anonimización los revisa un humano antes de activarlo.
6. **Colores institucionales que no alcanzan AAA.** Se ajustan y se avisa de que el tema no coincidirá exactamente con la marca.
7. **Relajar `astcheck`.** Riesgo de seguridad en el sandbox. Se mitiga manteniendo todos los tests actuales, añadiendo nuevos, revisión con `reviewer`, y gVisor sin red como segunda barrera.
8. **Alcance enorme en un solo release.** Se mitiga con integración continua en `main` con flags, sin ramas largas, y bloques con criterio de aceptación propio.
9. **Modelos free inestables.** El diseño asume fallos frecuentes: §5.1 los absorbe y §5.2 limita el daño a una slide.

---

## 9. Verificación

- **Compatibilidad:**
  - fixtures de decks y contenido v1 (sacados de una copia de producción) abren y se renderizan igual con los lectores nuevos;
  - ninguna presentación existente pide reenviar nada.
- **Unidad y propiedades:**
  - `applyOps`: aplicar y luego deshacer devuelve el estado inicial, y `dryRun` da lo mismo que la ejecución real;
  - validación pedagógica;
  - detección de área;
  - generación del tema institucional (contraste).
- **Durabilidad:** matar el worker a mitad de un diseño y a mitad del harness; debe reanudar sin repetir unidades `done`.
- **Multi-área end-to-end:**
  - con el proveedor falso en CI;
  - con modelos free, tres casos reales: **cónicas**, **programación (estructuras de datos)** y **educación general**;
  - cada uno debe tener imágenes donde aporten, ejercicios con pistas y revelado, motivación, slide de cierre y cantidad dentro del rango elegido.
- **Render y motion:**
  - contraste AAA en todos los temas y acentos;
  - capturas con reduced motion deterministas;
  - el PDF y el ZIP offline abren sin red.
- **Seguridad:**
  - tests SSRF: IP privada, redirección a IP privada, DNS rebinding, imagen bomba, tipo MIME falso;
  - el `astcheck` revisado sigue bloqueando todos los casos de `packages/sandbox-kit/test` más los nuevos;
  - `propose_component` por MCP no puede salir del sandbox.
- **MCP:**
  - test de contrato del camino `start_here` → `next_step` → deck dibujado;
  - test de que el cliente v1 sigue funcionando;
  - prueba manual con ChatGPT.
- **Métricas antes y después:** llamadas a la IA, tokens, fallos y tiempo por presentación.
- **Ejecución:** las pruebas pesadas van con `heavy.sh`, y el e2e existente debe seguir en verde.

---

## 10. Referencias

- **Producto:** `plan.md`, `EXECUTION_PLAN.md`, `docs/adr/*`, `docs/known-limitations.md`.
- **Auditorías anteriores:** `docs/audit 20 OCT.md` y `docs/audit-2/audit.zip`, resueltas en `3e1cb1e`.
- **Planes anteriores:** `docs/PLAN-v1.1-features.md` (MCP y OCR), `docs/HANDOFF-v1.2.md`. MCP: `docs/mcp.md`.
- **Código clave:**
  - **Workflow:** `packages/db/src/workflow.ts`.
  - **Jobs:** `packages/jobs/src/index.ts` y `apps/worker/src/handlers/*` (research, content, design, repair, polish, component).
  - **IA:** `packages/ai/src/{client,openrouter,vision}.ts` y `packages/ai/src/prompts/index.ts`.
  - **Contratos:** `packages/contracts/src/{content,deck,themes,layouts,geometry}.ts`.
  - **Componentes:** `packages/components/src/{define,registry,fallback}.ts` y `defs/*`.
  - **Motor:** `packages/engine/src/{SlideView,DeckPlayer,build}.tsx`, `base.css`, `layouts.css`, `themes/*`.
  - **Sandbox:** `packages/sandbox-kit/src/astcheck.ts` y `apps/sandbox-runner/sandbox/*`.
  - **Investigación:** `packages/research/src/{search,ssrf,extract}.ts`.
  - **Render:** `apps/renderer/src/main.ts`.
  - **MCP:** `packages/mcp/src/*`.
  - **Web:** `apps/web/src/app/presentations/new/form.tsx`, `apps/web/src/app/presentations/[id]/preview/*`, `apps/web/src/components/JobWatcher.tsx`, `apps/web/src/app/bienvenida/profile-form.tsx` y `apps/web/src/lib/{branding,branding-image,changelog}.ts`.
