/** Presets de layout: la IA elige preset y rellena slots; nunca decide coordenadas. */
export type SlotSpec = { name: string; required: boolean; hint: string };
export type LayoutSpec = { id: string; purpose: string; slots: SlotSpec[] };

export const LAYOUTS = {
  title: {
    id: "title",
    purpose: "Portada de la presentación",
    slots: [{ name: "main", required: true, hint: "Title" }],
  },
  section: {
    id: "section",
    purpose: "Separador de sección",
    slots: [{ name: "main", required: true, hint: "SectionHeader" }],
  },
  "title-content": {
    id: "title-content",
    purpose: "Título arriba y un único contenido grande",
    slots: [
      { name: "title", required: true, hint: "SectionHeader" },
      { name: "main", required: true, hint: "cualquier componente de contenido" },
    ],
  },
  "two-column": {
    id: "two-column",
    purpose: "Dos contenidos de igual peso (p. ej. texto + fórmula)",
    slots: [
      { name: "title", required: true, hint: "SectionHeader" },
      { name: "left", required: true, hint: "componente" },
      { name: "right", required: true, hint: "componente" },
    ],
  },
  "split-visual": {
    id: "split-visual",
    purpose: "Explicación a la izquierda (40%) y visual grande a la derecha (60%)",
    slots: [
      { name: "title", required: true, hint: "SectionHeader" },
      { name: "text", required: true, hint: "BulletPoints, Definition, UnitsCallout…" },
      { name: "visual", required: true, hint: "FunctionPlot, VectorDiagram, GeometryFigure, Table" },
    ],
  },
  "formula-focus": {
    id: "formula-focus",
    purpose: "Una fórmula protagonista con nota breve",
    slots: [
      { name: "title", required: true, hint: "SectionHeader" },
      { name: "main", required: true, hint: "FormulaHighlight o Derivation" },
      { name: "note", required: false, hint: "BulletPoints o UnitsCallout" },
    ],
  },
} as const satisfies Record<string, LayoutSpec>;

export type LayoutId = keyof typeof LAYOUTS;
export const LAYOUT_IDS = Object.keys(LAYOUTS) as [LayoutId, ...LayoutId[]];
