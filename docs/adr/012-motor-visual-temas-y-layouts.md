# ADR-012 — Motor visual: temas, decoración procedural y layouts

**Estado:** propuesta (v1.2, en implementación)

**Decisión.** `packages/contracts/src/themes.ts` es la fuente de verdad de los temas (`THEMES`, `THEME_IDS`), consumida por el engine (variables `--lm-*`), el prompt de diseño y la galería. `DeckDocument.themeId` es un enum con `.catch("lamina-claro")` para que decks antiguos o con temas retirados sigan abriendo. `accent` (a/b/c) elige la variante de paleta. La IA propone estilo y el docente puede cambiarlo antes y después de diseñar (versión `kind: "style"`).
