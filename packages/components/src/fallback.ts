import type { AccentId, Block, Branding, ComponentRef, Slide, SlideHint, ContentDraft, ThemeId } from "@lamina/contracts";
import { ENGINE_VERSION, type DeckDocument } from "@lamina/contracts";
import { NATIVE_CATALOG } from "./registry";
import { hasBranding, varietyProblem } from "./variety";

const ref = (componentId: string, props: Record<string, unknown>): ComponentRef => {
  const e = NATIVE_CATALOG.find((c) => c.def.id === componentId)!;
  return { componentId, version: e.def.version, props };
};
const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);

/** md → ítems de lista (por viñetas o por oraciones). */
export function mdToItems(md: string, max = 6): { text: string }[] {
  const lines = md.split(/\n+/).map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim()).filter(Boolean);
  let items = lines.length > 1 ? lines : md.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ¿¡$])/).map((s) => s.trim()).filter(Boolean);
  if (!items.length) items = [md.trim()];
  return items.slice(0, max).map((t) => ({ text: clip(t, 190) }));
}

type Mapped = { layout: Slide["layout"]; slots: Record<string, ComponentRef> };

function blockRef(b: Block): ComponentRef | null {
  switch (b.type) {
    case "text": return ref("BulletPoints", { items: mdToItems(b.md) });
    case "formula": return ref("FormulaHighlight", { latex: b.latex, caption: b.caption });
    case "derivation": return ref("Derivation", { steps: b.steps.slice(0, 8), stepwise: false });
    case "example": return ref("WorkedExample", { problem: clip(b.problem, 480), steps: b.steps.slice(0, 8).map((s) => ({ latex: s.latex, text: clip(s.text, 250) })), answer: clip(b.answer, 250) });
    case "graphSpec":
      return ref("FunctionPlot", {
        functions: b.functions, xDomain: [b.domain.xMin, b.domain.xMax], ...(b.yDomain ? { yDomain: [b.yDomain.yMin, b.yDomain.yMax] } : {}),
        points: b.points.map((p) => ({ x: p.x, y: p.y, label: p.label, fnIndex: 0 })), tangents: b.tangents.map((t) => ({ fnIndex: t.fnIndex, at: t.at })), caption: b.caption,
      });
    case "table": return ref("Table", { headers: b.headers, rows: b.rows, caption: b.caption });
    case "definition": return ref("Definition", { kind: "definicion", name: b.term, statement: b.md });
    case "theorem": return ref("Definition", { kind: "teorema", name: b.name, statement: b.statement, note: b.proofSketch ? clip(b.proofSketch, 250) : undefined });
    // Bloques pedagógicos v2: hasta que existan los componentes propios (bloque 6) se representan con los actuales.
    case "motivation": return ref("Callout", { variant: "idea", title: clip(b.hook, 80), text: clip([b.intuition, b.everydayExample].filter(Boolean).join(" "), 420) });
    case "exercise": return ref("Checkpoint", { question: clip(`${b.statement} ${b.guidingQuestion}`, 400), hint: clip(b.hints[0]!, 200), answer: clip(b.answer, 260), stepwise: true });
    case "code": return ref("Callout", { variant: "nota", title: clip(`Código (${b.language})`, 80), text: clip(b.source, 420) });
    case "activity": return ref("Callout", { variant: "exito", title: `Actividad · ${b.minutes} min`, text: clip(b.prompt, 420) });
    case "closing": return ref("Summary", { heading: "Ideas clave", points: [...b.keyIdeas, ...(b.questions ?? []).slice(0, 1)].slice(0, 6).map((t) => clip(t, 200)) });
    case "imageRequest": return null;
    case "diagramSpec": {
      const tryRef = (id: string) => {
        const e = NATIVE_CATALOG.find((c) => c.def.id === id)!;
        const r = e.def.propsSchema.safeParse(b.data ?? {});
        return r.success ? ref(id, b.data as Record<string, unknown>) : null;
      };
      return (b.kind === "vector" ? tryRef("VectorDiagram") : b.kind === "geometry" ? tryRef("GeometryFigure") : null) ?? ref("BulletPoints", { items: mdToItems(b.description, 4) });
    }
  }
}

const VISUAL = new Set(["graphSpec", "table", "diagramSpec"]);

function mapGroup(blocks: Block[], prev: string[] = [], closing = false): Mapped {
  const refs = blocks.map(blockRef).filter(Boolean) as ComponentRef[];
  const visualIdx = blocks.findIndex((b) => VISUAL.has(b.type));
  if (blocks.length === 1) {
    const b = blocks[0]!;
    if (b.type === "closing") return { layout: "closing", slots: { main: refs[0]! } };
    if (closing && b.type === "text") return { layout: "closing", slots: { main: ref("Summary", { heading: "Ideas clave", points: mdToItems(b.md, 5).map((i) => i.text) }) } };
    if (b.type === "formula") {
      // Variedad: una fórmula aislada alterna entre dos layouts para no repetir el mismo tres veces seguidas.
      const hero = varietyProblem(prev, "formula-focus", [b]) !== null;
      return { layout: hero ? "hero-formula" : "formula-focus", slots: { main: refs[0]! } };
    }
    return { layout: "title-content", slots: { main: refs[0]! } };
  }
  if (visualIdx >= 0 && blocks.length === 2) {
    const other = refs[visualIdx === 0 ? 1 : 0]!;
    return { layout: "split-visual", slots: { text: other, visual: refs[visualIdx]! } };
  }
  if (blocks.length === 2) return { layout: "two-column", slots: { left: refs[0]!, right: refs[1]! } };
  return { layout: "title-content", slots: { main: refs[0]! } };
}

/** Agrupa bloques en slides (máx. 2 por slide; una gráfica/tabla acompaña a un único bloque de texto/fórmula). */
function groupBlocks(blocks: Block[]): Block[][] {
  const groups: Block[][] = [];
  const bulky = new Set(["derivation", "example", "exercise", "code", "closing"]);
  let i = 0;
  while (i < blocks.length) {
    const b = blocks[i]!, n = blocks[i + 1];
    if (!n || bulky.has(b.type) || bulky.has(n.type)) { groups.push([b]); i += 1; continue; }
    if ((VISUAL.has(b.type) && VISUAL.has(n.type)) || (b.type === "text" && n.type === "text")) { groups.push([b]); i += 1; continue; }
    groups.push([b, n]); i += 2;
  }
  return groups;
}

/** Slide(s) estable(s) determinista(s) para un hint: garantiza un deck válido si la IA falla. */
export function slidesFromHint(hint: SlideHint, prevLayouts: string[] = [], opts: { closing?: boolean } = {}): Slide[] {
  const groups = groupBlocks(hint.blocks.filter((b) => b.type !== "imageRequest"));
  const used = [...prevLayouts];
  return groups.map((g, gi) => {
    const m = mapGroup(g, used, !!opts.closing);
    used.push(m.layout);
    const title = hint.intent.replace(/\.$/, "");
    const slots: Record<string, ComponentRef> = { ...m.slots };
    if (m.layout !== "title" && m.layout !== "section" && m.layout !== "cover-branded") slots.title = ref("SectionHeader", { title: gi === 0 ? clip(title, 100) : `${clip(title, 46)} (cont.)` });
    return {
      id: gi === 0 ? hint.id : `${hint.id}-${String.fromCharCode(98 + gi - 1)}`,
      layout: m.layout, slots, notes: "", build: { steps: Object.entries(slots).some(([, r]) => r.componentId === "Checkpoint" && (r.props as { stepwise?: boolean }).stepwise) ? [{ reveal: ["main"] }, { reveal: ["main"] }] : [] }, transition: "fade" as const,
      rationale: "Diseño estable automático (sin IA).",
    } as Slide;
  });
}

/** Portada: `cover-branded` cuando hay marcas o datos del docente; si no, la portada simple `title`. */
export function titleSlide(meta: ContentDraft["meta"], author?: string, branding?: Branding): Slide {
  const branded = hasBranding(branding);
  const teacher = branding?.teacher?.trim();
  const props = { title: clip(meta.topic, 105), subtitle: clip(`${meta.level} · ${meta.objective}`, 155), ...(author && !(branded && teacher) ? { author: clip(author, 100) } : {}) };
  return { id: "title", layout: branded ? "cover-branded" : "title", slots: { main: ref("Title", props) }, notes: "", build: { steps: [] }, transition: "fade" };
}
export function sectionSlide(id: string, title: string, index: number): Slide {
  return { id: `sec-${id}`, layout: "section", slots: { main: ref("SectionHeader", { title: clip(title, 105), kicker: `Sección ${index + 1}` }) }, notes: "", build: { steps: [] }, transition: "slide" };
}

/** Deck completo 100 % determinista (respaldo y proveedor fake). */
export function deckFromContent(content: ContentDraft, author?: string, opts: { branding?: Branding; themeId?: ThemeId; accent?: AccentId } = {}): DeckDocument {
  const slides: Slide[] = [titleSlide(content.meta, author, opts.branding)];
  content.sections.forEach((s, i) => {
    if (content.sections.length > 1) slides.push(sectionSlide(s.id, s.title, i));
    const last = i === content.sections.length - 1 && content.sections.length > 1;
    for (const h of s.slidesHint) slides.push(...slidesFromHint(h, slides.map((x) => x.layout), { closing: last }));
  });
  return {
    schemaVersion: 1, engineVersion: ENGINE_VERSION, themeId: opts.themeId ?? "lamina-claro", ...(opts.accent ? { accent: opts.accent } : {}),
    meta: { title: clip(content.meta.topic, 190), topic: content.meta.topic, level: content.meta.level, language: content.meta.language, ...(author ? { author: clip(author, 120) } : {}), ...(opts.branding ? { branding: opts.branding } : {}) },
    slides,
  };
}
