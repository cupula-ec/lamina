# ADR-002 — No usar Google ADK

**Fecha:** 19 oct 2026 · **Estado:** aceptada

El brief pide evaluar ADK frente a una orquestación sencilla. El flujo de Lámina es una **máquina de estados persistente y revisada por el docente** (`draft → researching → content_review → … → published`), con aprobaciones obligatorias, reintentos, `quota_wait` y versionado inmutable. Los «agentes» son **pasos con salida estructurada** (Zod) sobre un cliente de modelos intercambiable; solo hay dos bucles con herramientas y ambos con tope de iteraciones: *Research* (≤ 4 búsquedas, ≤ 12 descargas) y *Especialista de componentes* (≤ 3 intentos de corrección).

**Por qué no ADK:** (1) añadiría un runtime de agentes con su propio estado, mientras el estado fuente de verdad ya es Postgres; (2) los modelos gratuitos tienen soporte irregular de *tool-calling*, y ADK asume herramientas fiables; (3) el guard `:free` exige controlar cada petición HTTP; (4) más superficie para un equipo pequeño y un plazo de una semana.

**Alternativa considerada:** ADK para el especialista. Descartada por lo anterior; si en el futuro hay modelos con herramientas fiables, el paso puede encapsularse sin tocar el workflow.
