# ADR-011 — Branding institucional y datos del docente

**Estado:** propuesta (v1.2, en implementación)

**Decisión.** Tabla `institutions` (seed inicial: UPS) gestionada desde el panel admin. El docente elige institución y puede subir un logo personal; ambos conviven en la carátula (la institución es el respaldo si no hay marca personal). Materia, período y grupo son opcionales por presentación y se omiten si están vacíos. `DeckDocument.meta.branding` lleva solo rutas internas `/api/branding/…`, nunca `data:` ni URLs externas. Los logos se validan por magic bytes, se re-encodean (sharp) y el SVG se rasteriza; se sirven con autorización desde una ruta propia.
