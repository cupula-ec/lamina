# ADR-005 — Workflow persistente y aprobaciones

**Estado:** aceptada

- `presentations.stage` ∈ `draft → researching → content_review → content_approved → designing → design_review → design_approved → polishing → final_review → published | private_final`, más `failed_recoverable` y `quota_wait`.
- **Todas** las transiciones están en `packages/db/src/workflow.ts`: una función por transición, validada en servidor, dentro de una transacción con `SELECT … FOR UPDATE` (doble clic o llamadas directas a la API no pueden saltarse etapas; tests de transiciones inválidas y concurrencia en `packages/db/test`).
- Contenido y diseño se guardan en **versiones inmutables** (`content_versions`, `deck_versions`) con hash `sha256` del JSON canónico. La aprobación referencia `versionId + sha256` y solo se acepta si es la versión vigente.
- **Publicar** fija `published_deck_version_id` (snapshot) con versiones de engine/componentes fijadas. `/view` autoriza en servidor (dueño; o publicada + pública; o publicada + token con hash en BD). Un UUID nunca basta.
- El **pulido** solo puede cambiar `build`, `transition` y `props.stepwise`; un validador de diff (`apps/worker/src/handlers/polish.ts`) lo impone.
- Idempotencia: `singletonKey = nombre:presentación:base` con colas `exclusive` de pg-boss + botones deshabilitados.
- Desde ADR-010, `designing` incluye render + reparación puntual antes de `design_review` (`designDrafted` → `designRepaired`* → `designFinish`), y las versiones editadas a mano (`kind: "edit"`) se crean con `saveEditedDeck` sin saltarse la máquina de estados.
