import { z } from "zod";
import { ComponentManifest, DeckDocument, type AreaId, type ComponentRef } from "@lamina/contracts";
import type { Resolved, Resolver } from "@lamina/engine";
import type { CatalogEntry } from "./define";
import * as text from "./defs/text";
import * as visual from "./defs/visual";
import * as misc from "./defs/misc";
import * as rich from "./defs/rich";
import * as general from "./defs/general";
import * as mathExt from "./defs/math-ext";

export const NATIVE_CATALOG: CatalogEntry[] = [
  text.Title, text.SectionHeader, text.BulletPoints, text.TwoColumn, text.Definition, text.FormulaHighlight, text.Derivation, text.WorkedExample,
  visual.FunctionPlot, visual.Table, visual.VectorDiagram, visual.GeometryFigure,
  misc.UnitsCallout, misc.Quote, misc.Summary, misc.Checkpoint,
  rich.Callout, rich.StatCard, rich.StepsList, rich.ComparisonTable, rich.IconBullets, rich.SectionNumber, rich.AgendaItem,
  general.Image,
  mathExt.ConicFigure, mathExt.ImplicitPlot, mathExt.ParametricPlot, mathExt.PolarPlot, mathExt.StatChart,
];

const byId = new Map(NATIVE_CATALOG.map((c) => [c.def.id, c]));
export const nativeEntry = (id: string) => byId.get(id);

export function manifestOf(e: CatalogEntry): ComponentManifest {
  const js = z.toJSONSchema(e.def.propsSchema, { unrepresentable: "any", io: "input" }) as Record<string, unknown>;
  delete js.$schema;
  return ComponentManifest.parse({
    id: e.def.id, version: e.def.version, title: e.title, purpose: e.purpose, useCases: e.useCases, propsJsonSchema: js,
    constraints: e.constraints, examples: e.examples, status: "stable", scope: "global", runtime: "native", fitsSlots: e.fitsSlots,
  });
}
export const NATIVE_MANIFESTS = NATIVE_CATALOG.map(manifestOf);
/** Componentes de V3 que solo se ofrecen a la IA con su flag encendido (siguen siendo válidos y renderizables si ya están en un deck). */
export const FLAG_GATED_COMPONENTS: Record<string, string> = { Image: "v3_images" };
export const manifestsWithout = (gated: string[]) => NATIVE_MANIFESTS.filter((m) => !gated.includes(m.id));

/** Resolver nativo: solo catálogo estable (versión exacta). */
export const nativeResolver: Resolver = (ref: ComponentRef): Resolved | undefined => {
  const e = byId.get(ref.componentId);
  if (!e || e.def.version !== ref.version) return undefined;
  return { kind: "native", def: e.def };
};

export type CatalogLookup = (ref: ComponentRef) => { propsSchema?: z.ZodType; status: string } | undefined;

/** Valida un deck completo contra el catálogo: esquema, referencias y props de cada componente. Devuelve errores legibles. */
export function validateDeckAgainstCatalog(deck: unknown, extra?: CatalogLookup): { ok: true; deck: DeckDocument } | { ok: false; errors: string[] } {
  const d = DeckDocument.safeParse(deck);
  if (!d.success) return { ok: false, errors: d.error.issues.slice(0, 12).map((i) => `${i.path.join(".")}: ${i.message}`) };
  const errors: string[] = [];
  for (const s of d.data.slides) {
    for (const [slot, ref] of Object.entries(s.slots)) {
      const where = `slide ${s.id}/${slot} (${ref.componentId})`;
      const nat = byId.get(ref.componentId);
      let schema: z.ZodType | undefined;
      if (nat && nat.def.version === ref.version) schema = nat.def.propsSchema;
      else {
        const x = extra?.(ref);
        if (!x) { errors.push(`${where}: el componente ${ref.componentId}@${ref.version} no existe en el catálogo`); continue; }
        schema = x.propsSchema;
      }
      if (schema) {
        const r = schema.safeParse(ref.props);
        if (!r.success) errors.push(`${where}: props inválidas → ${r.error.issues.slice(0, 3).map((i) => `${i.path.join(".") || "(raíz)"}: ${i.message}`).join("; ")}`);
      }
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true, deck: d.data };
}

/**
 * Validador para `workspace.applyOps`: solo exige que lo que CAMBIÓ cumpla el catálogo (los problemas previos de otras
 * diapositivas no bloquean). Devuelve issues con `slideId`.
 */
export function deckValidatorFor(extra?: CatalogLookup) {
  return (deck: DeckDocument, touched: string[]): { code: string; message: string; slideId?: string }[] => {
    const v = validateDeckAgainstCatalog(deck, extra);
    if (v.ok) return [];
    const out: { code: string; message: string; slideId?: string }[] = [];
    for (const e of v.errors) {
      const m = e.match(/^slide ([^/]+)\//);
      if (m && touched.includes(m[1]!)) out.push({ code: "catalog", message: e, slideId: m[1] });
    }
    return out;
  };
}

/** Documentación compacta del catálogo para el prompt de diseño. */
export function catalogForPrompt(manifests: ComponentManifest[] = NATIVE_MANIFESTS, opts: { area?: AreaId } = {}): string {
  // V3: con un área conocida, los nativos propios de otra área no se ofrecen (menos tokens y menos confusión). Los provisionales siempre.
  const offered = opts.area ? manifests.filter((m) => { const a = byId.get(m.id)?.areas; return !a || a === "all" || a.includes(opts.area!); }) : manifests;
  return offered
    .map((m) => {
      const props = JSON.stringify(m.propsJsonSchema);
      return `### ${m.id}@${m.version}${m.status === "provisional" ? " (provisional)" : ""}\nPropósito: ${m.purpose}\nUsos: ${m.useCases.join("; ")}\nRestricciones: ${m.constraints.join("; ") || "—"}\nSlots donde encaja: ${m.fitsSlots.join(", ")}\nSchema de props: ${props}\nEjemplo de props: ${JSON.stringify(m.examples[0]!.props)}`;
    })
    .join("\n\n");
}
