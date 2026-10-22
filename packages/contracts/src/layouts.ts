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
  "cover-branded": {
    id: "cover-branded",
    purpose: "Portada con zona de marcas (logo de la institución y del docente), título y datos de docente/materia/período/grupo; usar solo como primera diapositiva",
    slots: [{ name: "main", required: true, hint: "Title (título y subtítulo; las marcas y los datos del docente los pone el layout)" }],
  },
  "hero-formula": {
    id: "hero-formula",
    purpose: "Fórmula gigante centrada como protagonista, con una línea de contexto debajo",
    slots: [
      { name: "title", required: true, hint: "SectionHeader" },
      { name: "main", required: true, hint: "FormulaHighlight (una sola fórmula)" },
      { name: "context", required: false, hint: "IconBullets, BulletPoints o Callout breve" },
    ],
  },
  "full-visual": {
    id: "full-visual",
    purpose: "Visual a sangre sobre todo el lienzo con el título y la leyenda superpuestos en paneles",
    slots: [
      { name: "visual", required: true, hint: "FunctionPlot, VectorDiagram o GeometryFigure con poca densidad en los bordes" },
      { name: "title", required: true, hint: "SectionHeader corto" },
      { name: "caption", required: false, hint: "Callout o BulletPoints de una línea" },
    ],
  },
  "three-column": {
    id: "three-column",
    purpose: "Tres tarjetas comparables de igual peso (tres tipos, tres pasos, tres propiedades)",
    slots: [
      { name: "title", required: true, hint: "SectionHeader" },
      { name: "col1", required: true, hint: "Callout, StatCard, IconBullets o Definition breve" },
      { name: "col2", required: true, hint: "Callout, StatCard, IconBullets o Definition breve" },
      { name: "col3", required: true, hint: "Callout, StatCard, IconBullets o Definition breve" },
    ],
  },
  "steps-timeline": {
    id: "steps-timeline",
    purpose: "Proceso o demostración en 3 a 5 pasos dispuestos en horizontal",
    slots: [
      { name: "title", required: true, hint: "SectionHeader" },
      { name: "steps", required: true, hint: "StepsList (3–5 pasos)" },
      { name: "note", required: false, hint: "Callout o BulletPoints" },
    ],
  },
  comparison: {
    id: "comparison",
    purpose: "Comparación de dos alternativas (A frente a B) con cabeceras y filas por criterio",
    slots: [
      { name: "title", required: true, hint: "SectionHeader" },
      { name: "main", required: true, hint: "ComparisonTable" },
      { name: "verdict", required: false, hint: "Callout con la conclusión" },
    ],
  },
  "big-number": {
    id: "big-number",
    purpose: "Cifra o resultado destacado en grande con su explicación al lado",
    slots: [
      { name: "title", required: true, hint: "SectionHeader" },
      { name: "main", required: true, hint: "StatCard" },
      { name: "text", required: true, hint: "BulletPoints, Callout o Definition" },
    ],
  },
  "quote-source": {
    id: "quote-source",
    purpose: "Cita, definición histórica o enunciado textual con su fuente, a pantalla casi completa",
    slots: [
      { name: "main", required: true, hint: "Quote" },
      { name: "note", required: false, hint: "Callout o BulletPoints de contexto" },
    ],
  },
  agenda: {
    id: "agenda",
    purpose: "Índice u objetivos de la clase, con el punto actual resaltado",
    slots: [
      { name: "title", required: true, hint: "SectionHeader" },
      { name: "main", required: true, hint: "AgendaItem" },
      { name: "side", required: false, hint: "Callout con el objetivo de la clase" },
    ],
  },
  closing: {
    id: "closing",
    purpose: "Cierre: resumen de ideas clave y referencias o bibliografía; lleva la marca al pie. Usar solo en la última sección de la clase",
    slots: [
      { name: "title", required: true, hint: "SectionHeader" },
      { name: "main", required: true, hint: "Summary" },
      { name: "refs", required: false, hint: "BulletPoints o Quote con las referencias" },
    ],
  },
  "sidebar-notes": {
    id: "sidebar-notes",
    purpose: "Contenido principal (70 %) con una columna lateral de notas, atajos o recordatorios (30 %)",
    slots: [
      { name: "title", required: true, hint: "SectionHeader" },
      { name: "main", required: true, hint: "cualquier componente de contenido" },
      { name: "aside", required: true, hint: "Callout, IconBullets o UnitsCallout (columna angosta)" },
    ],
  },
} as const satisfies Record<string, LayoutSpec>;

export type LayoutId = keyof typeof LAYOUTS;
export const LAYOUT_IDS = Object.keys(LAYOUTS) as [LayoutId, ...LayoutId[]];
