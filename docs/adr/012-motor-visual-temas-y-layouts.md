# ADR-012 — Motor visual: temas, decoración procedural y layouts

**Estado:** aceptada (v1.2)

## Decisión

**Temas.** `packages/contracts/src/themes.ts` es la fuente de verdad (`THEMES`, `THEME_IDS`, `proposeStyle`, `themesForPrompt`). Hay 10 temas (los 2 de Lámina + Cálculo editorial, Álgebra grafito, Física aurora, Geometría compás, Estadística datos, Química laboratorio, Institucional sobrio y Pizarra), cada uno con 3 acentos (`a`/`b`/`c`). El CSS vive en `packages/engine/src/themes/<id>.css` (variables `--lm-*`, más `--lm-radius`, `--lm-shadow`, `--lm-title-*`, `--lm-card-border`, `--lm-deco*`, `--lm-footer-display`, `--lm-cp-*`). Los componentes leen variables; no hay colores fijos. `DeckDocument.themeId` es enum con `.catch("lamina-claro")` (decks antiguos o temas retirados abren igual) y `accent` es opcional.

**Contraste.** `packages/engine/test/themes.test.ts` lee el CSS real y exige, por tema y acento: tinta ≥ 7:1, texto secundario y acentos ≥ 4.5:1 sobre fondo y panel, texto sobre relleno de acento ≥ 4.5:1, gráficas ≥ 3:1, y que la decoración al máximo de opacidad no baje la legibilidad del texto.

**Fuentes.** 5 familias autoalojadas con `@fontsource` (Literata, Fraunces, Space Grotesk, Atkinson Hyperlegible, IBM Plex Sans). Las capturas esperan `waitForThemeFonts(themeId)` (`document.fonts.load` por familia + `fonts.ready`) y el renderer vuelve a esperar `document.fonts.ready` antes de medir y capturar.

**Decoración procedural.** `packages/engine/src/decor`: SVG inline determinista por seed (`hash(meta.title | slide.id | tipo | rol)` con PRNG propio, números a 1 decimal). 10 tipos (rejilla de ejes, familia de curvas, líneas de campo, isométrica, hexágonos moleculares, compás, ondas, puntos de datos, tiza, esquinas). `THEME_DECOR` dice qué usa cada tema en portada, sección, cierre e interiores (fondo sutil con `--lm-deco-bg-opacity`). Va detrás de los slots, fuera de la detección de problemas, sin imágenes, `fetch` ni red.

**Layouts.** A los 6 originales se suman `cover-branded`, `hero-formula`, `full-visual`, `three-column`, `steps-timeline`, `comparison`, `big-number`, `quote-source`, `agenda`, `closing` y `sidebar-notes` (geometría en `contracts/geometry.ts`, probada: dentro del lienzo y sin solapes salvo título/leyenda sobre `full-visual`). `cover-branded` toma las marcas de `meta.branding` (logo institución a la izquierda, personal a la derecha, línea «Docente · Materia · Período · Grupo» sin vacíos, sigla al pie; sin marcas queda limpia con «Lámina»). `title` sigue como portada simple. `title`, `section` y `cover-branded` los coloca el sistema; `closing` solo en la última sección.

**Componentes.** 7 nuevos (Callout, StatCard, StepsList, ComparisonTable, IconBullets, SectionNumber, AgendaItem) con schema, fixtures y tests, más un set propio de 8 iconos SVG. Los 16 originales no cambian de contrato. `AgendaItem` renderiza la agenda completa (lista con progreso).

**Variedad.** Regla: no más de 2 diapositivas seguidas con el mismo layout (excepto derivaciones y ejemplos resueltos). El prompt recibe los layouts previos y el `check` de `design.slide` devuelve feedback para reintentar; si la IA falla, el respaldo determinista alterna `formula-focus`/`hero-formula`.

**Estilo por IA.** `chooseStyle` (rol `design`, salida Zod limitada a `THEME_IDS`) corre al inicio de `design.generate`; ante cualquier fallo usa `proposeStyle` (palabras clave). Si el docente ya eligió estilo, se respeta sin consultar a la IA; en regeneraciones se conserva el del deck vigente. Se guarda en `presentations.theme_id` (formato `tema` o `tema:acento`) y en `deck.themeId/accent`. En la UI: «Estilo propuesto» en `preview/information` (sugerencia determinista; la IA puede ajustarla al diseñar si el docente no eligió) y cambio posterior en `preview/design` sin regenerar contenido: nueva versión `kind: "style"` con hash y re-render de todas las capturas.

## Consecuencias

- Galería `/dev/gallery` (ThemePicker reutilizado) medida con el detector del renderer: 10 temas × 3 acentos × 17 layouts sin issues (`e2e/tests/gallery.spec.ts`; capturas en `docs/evidence/`).
- El acento no tiene columna propia: se codifica en `theme_id`.
- `full-visual` superpone título y leyenda a un visual de lienzo completo: apto para visuales poco densos en los bordes.
- El detector ignora trazos SVG recortados por `clip-path` y mide los sub/superíndices KaTeX con el tamaño base de la fórmula.
- **Propuesta vs elección.** `theme_id` distingue la elección del docente (`tema` / `tema:acento`) de la propuesta de la IA (`tema:acento:ia`, `isStyleProposal`): la propuesta se reutiliza al rediseñar pero la UI sigue mostrándola como «propuesto». El cambio de estilo vive en `workflow.styleChanged` (versión `kind: "style"`).
- **Contraste del color institucional.** `--lm-brand` solo se aplica si contrasta ≥ 3:1 con el fondo del tema (`brandColorFor`, `BRAND_THEMES`, verificado contra el CSS en `engine/test/themes.test.ts`); si no, el CSS cae al acento del tema. El formulario de instituciones avisa al administrador.
- **Zonas de marca acotadas.** `.lm-cover-meta` y `.lm-wordmark` (2 líneas, `line-clamp`) y `.lm-closing-foot` (1 línea, elipsis) no desbordan con los valores máximos (`MAX_BRANDING`; galería `?branding=max`).

