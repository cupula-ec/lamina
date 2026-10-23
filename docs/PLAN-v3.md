# Lámina v3 — Plan: espacio de trabajo para la IA, jobs durables y MCP pulido

> **Estado:** borrador para discutir con el profesor. Nada de esto está implementado salvo lo marcado como «hecho» en la §2.
> **Origen:** reunión con el profesor (23-oct-2026) + incidente real de ese mismo día en producción (§2).
> **Regla de oro:** ya hay docentes usando Lámina en producción. **No se les puede pedir que reenvíen su trabajo.** Todo cambio debe ser aditivo, reversible y compatible con lo que ya existe (§4).

## 1. El problema, en una frase

La IA trabaja «a ciegas y de golpe»: recibe el pedido, produce el resultado entero y, si algo falla en la mitad (un JSON ilegible, un timeout, un deploy), **se pierde todo lo hecho y se reinicia desde cero**. No tiene un espacio de trabajo persistente donde ir dejando cambios pequeños, que sobrevivan a fallos y se puedan retomar.

Esto no escala: con modelos gratuitos (lentos, con cupo limitado y salida inestable) cada fallo cuesta minutos y cuota, y al docente le toca esperar o volver a pedir.

## 2. Evidencia (incidente del 23-oct-2026, una sola tarde)

| # | Qué pasó | Causa raíz | Dónde |
|---|---|---|---|
| 1 | Un diseño de ~12 min se perdió y se reinició de cero | Un deploy recreó el contenedor `worker` con el job en curso | `scripts/deploy.sh` |
| 2 | Un `design.repair` quedó «en reintento» 8+ min sin arrancar | pg-boss abortó el handler a los 900 s pero el trabajo real siguió en el proceso; la cola admite 1 job a la vez (`localConcurrency: 1`) | `apps/worker/src/main.ts` |
| 3 | Subir `expire_seconds` en la BD **no** evitó el corte | El timeout real lo aplica el worker con `QUEUE_CONFIG`, no la fila del job | `packages/jobs/src/index.ts` |
| 4 | Un componente 3D «falló» tras 1 intento y quedó `failed` (cuota devuelta) | Un error de `ai.structured` (JSON ilegible) **sale del bucle de 3 intentos** y marca todo como fallido | `apps/worker/src/handlers/component.ts` |
| 5 | La reparación de `h4` y `h12` falló: «JSON ilegible», «We are giv…» | El modelo gratuito devolvió texto en inglés o JSON roto; no hay reparación de JSON ni reintento por diapositiva | `packages/ai/src/client.ts` |
| 6 | Componentes generados no se renderizaban (timeout 30 s) y salían en negro | Carrera `lamina:ready` (el iframe avisaba antes de la hidratación) y el iframe no recibía las variables `--lm-*` | **Hecho** (commit `fix(engine)…`) |
| 7 | El detector marca error en una fórmula que se ve bien (`h4c`) | Falso positivo del detector de desbordes con KaTeX | `packages/engine` (`detectSlideIssues`) |
| 8 | La presentación no podía recibir un diseño externo mientras estaba en `designing` | La máquina de estados exige `content_approved`/`design_review` | `packages/db/src/workflow.ts` |
| 9 | Un solo diseño ocupa el worker y los demás esperan en cola | `design.generate` con concurrencia 1 y sin priorización | `apps/worker/src/main.ts` |
| 10 | La IA externa (MCP) solo puede enviar el **deck completo** | `submit_deck` reemplaza todo; tope de 12 versiones por presentación | `packages/mcp/src/tools.ts`, `limits.ts` |

**Hecho hoy (hotfixes ya en producción):** `deploy.sh` espera a que drenen los jobs y reencola los huérfanos; `apps/promo` fuera del despliegue; iframe del sandbox recibe el tema y avisa al montar. Son parches: no resuelven la causa de fondo de §1.

> **Matiz a verificar en la Fase 0:** `design.generate` ya acepta `onlySlideIds` y genera por diapositiva (`design.slide`), pero `regenAll` rehace todo cuando no hay deck previo o no se indican ids; `content.generate`, `polish` y el MCP (`submit_content`, `submit_deck`) siguen trabajando sobre el documento completo. Hay que inventariar **exactamente** dónde se regenera todo antes de diseñar el cambio.

## 3. Objetivos de v3

1. **La IA tiene un espacio de trabajo persistente** por presentación: un documento mutable con cambios incrementales, checkpoints y deshacer. Nunca se «regenera todo» salvo que el docente lo pida.
2. **Un fallo cuesta una diapositiva, no la presentación.** Cada unidad de trabajo (diapositiva, componente, bloque de contenido) se guarda al terminar y se puede reintentar sola.
3. **Los jobs sobreviven a deploys, timeouts y cortes de cuota** (reanudables, idempotentes, con progreso visible).
4. **MCP incremental:** una IA externa puede leer una parte, cambiar una parte y enviar solo ese cambio.
5. **Operar sin miedo:** desplegar mientras hay docentes trabajando no debe costarles nada.

## 4. Precauciones (docentes ya en producción)

Obligatorias para **cada** cambio de v3:

- **Sin reenvíos.** Ninguna presentación existente se invalida, se reinicia ni pide volver a subir contenido. Si una migración no puede conservar algo, **no se hace**.
- **Migraciones solo aditivas:** tablas/columnas nuevas, nunca renombrar ni borrar en la misma versión. Las columnas nuevas nacen con valor por defecto. El borrado, si llega, va en una versión posterior, tras comprobar que nada lo usa.
- **Respaldo antes de migrar:** `scripts/backup.sh` y `pg_dump` verificado antes de cualquier migración en producción; probar la migración en una **copia** de la BD con datos reales.
- **Compatibilidad hacia atrás:** `submit_content`/`submit_deck` y los contratos (`schemaVersion`) siguen funcionando igual. Lo nuevo se añade al lado (tools nuevas, campos opcionales). Cualquier cambio de esquema del deck sube `schemaVersion` y mantiene un lector para la versión anterior.
- **Feature flags por usuario/presentación:** el flujo nuevo se activa primero para cuentas de prueba, luego para docentes voluntarios, al final para todos. Debe poder apagarse sin deploy.
- **Reanudar, no reiniciar:** una presentación en `designing`/`polishing` durante un deploy debe continuar donde iba. Hasta que exista la reanudación (Fase 1), **no desplegar el worker con jobs activos** salvo que el docente afectado esté avisado.
- **Despliegues por servicio:** poder desplegar solo `web` (como se hizo hoy) sin tocar `worker`. Documentar y automatizar ese camino.
- **Ventanas y aviso:** desplegar fuera de horas de clase; si hay jobs activos, esperar el drenaje (`DRAIN_SECS`) o diferir.
- **Nada de cambios manuales en la BD de producción** sin dejarlos escritos (script + motivo) en `docs/runbook-*.md`. Hoy se hicieron varios a mano; v3 los convierte en comandos de administración.
- **Reversibilidad:** cada fase se puede revertir (flag off + imagen anterior) sin perder datos nuevos.
- **Cuota y costo:** IA = 0 USD (solo modelos `:free`, ADR-001). El espacio de trabajo no debe aumentar las llamadas: debe **reducirlas**.

## 5. Flujos de trabajo

### A. Espacio de trabajo de la IA (núcleo de v3)

- **Modelo:** un *workspace* por presentación = documento mutable (contenido + diseño) + registro de operaciones (`ops`) con autor (`ia`/`mcp`/`docente`), marca de tiempo y estado.
- **Operaciones pequeñas y tipadas:** `add_slide`, `replace_slide`, `remove_slide`, `move_slide`, `set_slot` (cambiar un componente o sus props), `set_adjust`, `set_notes`, `set_theme`; equivalentes para el contenido (`edit_block`, `add_block`…). Cada operación se valida con las mismas reglas que hoy (`checkDeck`, fidelidad de fórmulas).
- **Checkpoints:** una versión inmutable (`deck_versions`) se crea al **confirmar** un conjunto de operaciones, no con cada una. Las versiones actuales siguen siendo el historial.
- **Contexto mínimo para la IA:** recibe solo la diapositiva (o el lote) más su vecindad y el resumen del contenido aprobado, no el deck entero. Menos tokens, menos fallos, menos cupo.
- **Deshacer/rehacer** por operación y por lote; el docente ve qué cambió la IA (diff por diapositiva).
- **Bloqueo y concurrencia:** una operación a la vez por presentación, con detección de conflicto (base de versión) en vez de «el diseño cambió, vuelve a leer».
- **Datos:** tablas nuevas (`workspaces`, `workspace_ops`); no se toca `deck_versions`. Al abrir una presentación existente, el workspace se **crea perezosamente** a partir de su versión vigente.

### B. Jobs durables y reanudables

- **Unidad de trabajo persistente:** cada diapositiva/componente/bloque tiene estado propio (`pending → running → done | failed`) guardado al terminar. Un reinicio solo repite lo que estaba `running`.
- **Reanudación tras deploy/crash:** al arrancar, el worker recupera trabajo `running` huérfano por *heartbeat* vencido (no por `expire` fijo).
- **Timeouts por unidad, no por job completo** (p. ej. 90–180 s por diapositiva) y configurables por entorno; alinear `QUEUE_CONFIG` con el comportamiento real (incidentes 2 y 3).
- **Sin handlers zombis:** cancelación cooperativa (`AbortSignal`) cuando pg-boss expira un handler, para liberar el cupo de la cola.
- **Concurrencia y prioridad:** colas por tipo de trabajo; los trabajos cortos (reparar una diapositiva) no esperan detrás de un diseño completo (incidente 9).
- **Progreso visible:** «12 de 29 diapositivas listas», con reintento solo de las fallidas.
- **Espera de cupo** (`quota_wait`) como estado de primera clase: reanuda sola y lo dice la interfaz.

### C. Robustez de la salida de la IA

- **Un error de parseo cuenta como un intento**, nunca aborta el bucle (incidente 4). Aplicar a componentes, diseño, reparación, contenido y pulido.
- **Reparación de JSON** (recortar prosa, cerrar llaves, reintentar con el error como contexto) antes de rendirse; modelos de respaldo en cadena.
- **Degradación elegante:** si una diapositiva no se puede generar o reparar, se conserva la versión estable anterior y se marca para revisión, sin detener las demás.
- **Registro por intento** (modelo, tokens, error) para ver patrones; métricas de tasa de JSON ilegible por modelo.

### D. MCP pulido

- **Herramientas incrementales** sobre el workspace: `get_slide`, `list_slides`, `apply_ops` (lote atómico), `replace_slide`, `add_slide`, `remove_slide`, `request_component`, `get_workspace_status`. Las actuales (`submit_content`, `submit_deck`) se mantienen y se implementan encima.
- **Lectura por partes:** devolver solo lo pedido (una sección, una diapositiva, los problemas de render de un slide) con paginación; reducir el contexto que consume la IA externa.
- **Errores accionables:** mensajes que indiquen qué corregir y con qué herramienta; `validate_ops` en seco.
- **Límites razonables:** el tope de 12 versiones por presentación (`limits.ts`) deja de ser un freno cuando los cambios son operaciones y no versiones completas; límite por tasa, no por número de versiones.
- **Idempotencia y reintentos seguros** con claves de operación (`opId`).
- **Estado en sesión:** permitir enviar cambios mientras la presentación está en `designing` si no chocan con lo que se está generando (hoy se rechaza, incidente 8).
- **Documentación y pruebas de contrato** del MCP; guía de «cómo trabajar con el workspace» para Claude/otros clientes.

### E. Componentes generados

- Solicitud **reintentable** y nunca `failed` por un error de parseo (ver C). Si todo falla, ofrecer reintentar o **inyectar** un componente validado (el camino manual que se usó hoy pasa a ser una herramienta de administración documentada).
- **Tema:** variables `--lm-*` con valores de respaldo; documentarlo en el prompt (`componentSystem`). Ya hecho para el iframe; revisar tipografías (el iframe no carga fuentes del tema).
- Pruebas de render de componentes en CI (carrera `lamina:ready`, tema, timeouts).

### F. Render y control de calidad

- **Falsos positivos del detector** (`h4c`, `\quad`, `\text`): corregir o aislar para que un error visible sea real.
- **Render incremental:** re-renderizar solo las diapositivas cambiadas.
- Revisar el aspecto de las gráficas (`FunctionPlot`): proporción de ejes opcional (`equalAspect`) y expresiones con dominio restringido sin trucos (hoy se usó `max/sign` para evitar el error en el borde izquierdo).

### G. Operación y despliegue

- **Despliegue por servicio** (`web`, `worker`, `renderer`) con comprobación de jobs activos y comandos de administración para reencolar/extender un job (en vez de SQL a mano).
- **Runbook** (`docs/runbook-produccion.md`): drenar, reencolar, inyectar componente, restaurar BD, qué hacer en `quota_wait`.
- **Observabilidad:** panel de jobs por presentación (estado, intento, error, edad), alertas de jobs huérfanos y de tasa de fallos.
- **Respaldos automáticos** diarios + antes de cada migración, con prueba de restauración.

## 6. Fases propuestas

| Fase | Contenido | Riesgo | Criterio de aceptación |
|---|---|---|---|
| **0. Auditoría y red de seguridad** (sin cambios de esquema) | Inventario de dónde se regenera todo; arreglar el bucle de intentos (C); alinear timeouts/`QUEUE_CONFIG`; `deploy.sh` por servicio; runbook; respaldo verificado; pruebas de render de componentes | Bajo | Un JSON ilegible ya no marca nada como fallido; un deploy de `web` no toca jobs; hay runbook y respaldo restaurado en una copia |
| **1. Jobs durables** | Estado por unidad, reanudación por heartbeat, cancelación cooperativa, progreso en la UI | Medio | Matar el worker a media generación y recuperar sin repetir lo ya hecho |
| **2. Workspace + operaciones** | Tablas nuevas, validación de ops, checkpoints, diff y deshacer; contexto mínimo para la IA; flag por usuario | Medio-alto | Editar una diapositiva no regenera las demás; presentaciones existentes se abren sin migración manual |
| **3. MCP v2** | Tools incrementales sobre el workspace, lecturas por partes, idempotencia; v1 intacto | Medio | Un cliente MCP edita una diapositiva en una sola llamada; el cliente antiguo sigue funcionando |
| **4. Experiencia del docente** | Progreso por diapositiva, reintentar solo lo fallido, historial de cambios de la IA | Bajo | El docente nunca necesita reenviar nada tras un fallo |
| **5. Despliegue gradual** | Flags: cuentas de prueba → voluntarios → todos; métricas de tasa de fallo y costo de cuota | Medio | Comparativa antes/después: menos llamadas a la IA y menos fallos por presentación |

Orden recomendado: **0 → 1 → 2 → 3**, con la 4 a medida que cada una aterriza y la 5 como cierre. La Fase 0 se puede empezar ya: no cambia el esquema y reduce el dolor de inmediato.

## 7. Qué NO se hace en v3

- No se cambia el modelo de datos existente de forma destructiva ni se «normaliza» el pasado.
- No se pasa a modelos de pago (ADR-001).
- No se elimina `submit_deck`/`submit_content`.
- No se reescribe el motor visual ni los componentes nativos salvo los fixes de F.

## 8. Preguntas abiertas para el profesor

1. ¿Qué operaciones espera poder pedirle a la IA en medio de una presentación (cambiar una diapositiva, añadir una gráfica, reordenar, ajustar el tono…)? Eso define el catálogo de `ops`.
2. ¿Cuántos docentes y presentaciones activas hay ahora y cuántos más se esperan? Define cuánto cuidado y qué ventana de despliegue.
3. ¿Hace falta colaboración (docente y IA editando a la vez) o basta con turnos?
4. ¿Prefiere ver y aprobar cada cambio de la IA o confiar y poder deshacer?
5. ¿El MCP externo es un objetivo del producto (clientes de terceros) o solo una vía interna? Cambia cuánto invertir en la v2.

## 9. Riesgos principales

- **Migración con docentes activos:** mitigado por §4 (aditivo, flags, copia de BD, respaldo).
- **Complejidad del workspace:** empezar con 3–4 operaciones (`replace_slide`, `add_slide`, `remove_slide`, `set_slot`) y ampliar.
- **Modelos gratuitos inestables:** C reduce el impacto pero no lo elimina; el diseño debe asumir fallos frecuentes.
- **Detección de errores de render poco fiable:** F; hasta entonces, el docente decide con la captura delante.

## 10. Referencias

- Contexto del producto: `plan.md`, `EXECUTION_PLAN.md`, `docs/adr/*`, `docs/known-limitations.md`.
- Plan anterior (MCP y OCR): `docs/PLAN-v1.1-features.md`; MCP: `docs/mcp.md`.
- Máquina de estados: `packages/db/src/workflow.ts`; jobs: `packages/jobs/src/index.ts`, `apps/worker/src/handlers/*`; MCP: `packages/mcp/src/*`.
