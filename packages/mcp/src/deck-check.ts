import { DeckDocument, ENGINE_VERSION, THEME_IDS, ACCENT_IDS, parseStylePref, type DeckDocument as Deck } from "@lamina/contracts";
import { nativeEntry, validateDeckAgainstCatalog } from "@lamina/components";
import { checkLatex } from "@lamina/validation";
import type { Db } from "@lamina/db";
import { buildBranding } from "@lamina/db";
import { ContentDraft } from "@lamina/contracts";
import { assertKeys, assertNoHostileLatex, assertSize, scanJson, jsonBytes } from "./safety";
import { LIMITS } from "./limits";
import { McpToolError } from "./errors";
import { loadProvisional, lookupFor } from "./catalog";

type Pres = { id: string; ownerId: string; title: string; topic: string; level: string; themeId: string | null; subject?: string | null; period?: string | null; groupName?: string | null };

const DECK_KEYS = ["schemaVersion", "engineVersion", "themeId", "accent", "meta", "slides"];
const META_KEYS = ["title", "topic", "level", "language", "author", "branding"];
const SLIDE_KEYS = ["id", "layout", "slots", "notes", "build", "transition", "rationale", "adjust"];
const REF_KEYS = ["componentId", "version", "props"];

export type DeckCheck = { ok: true; deck: Deck; pins: Record<string, { version: string; bundleHash?: string }>; warnings: string[] } | { ok: false; errors: string[] };

const norm = (s: string) => s.replace(/\s+/g, "");
function propStrings(v: unknown, out: string[] = []): string[] {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => propStrings(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => propStrings(x, out));
  return out;
}

/** Fórmulas y expresiones del contenido aprobado que deben aparecer íntegras en el deck. */
export function mustKeepFormulas(content: ContentDraft): string[] {
  const out: string[] = [];
  for (const s of content.sections) for (const h of s.slidesHint) for (const b of h.blocks) {
    if (b.type === "formula") out.push(b.latex);
    if (b.type === "derivation") out.push(...b.steps.map((x) => x.latex));
    if (b.type === "example") out.push(...b.steps.flatMap((x) => (x.latex ? [x.latex] : [])));
    if (b.type === "graphSpec") out.push(...b.functions.map((f) => f.expr));
  }
  return out;
}

export function missingFormulas(content: ContentDraft, deck: Deck): string[] {
  const strs = deck.slides.flatMap((s) => propStrings(s.slots)).map(norm);
  const seen = new Set<string>();
  return mustKeepFormulas(content).filter((n) => {
    const needle = norm(n);
    if (seen.has(needle)) return false;
    seen.add(needle);
    const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(^|[$,;:])${esc}($|[$,;:])`);
    return !strs.some((s) => s === needle || re.test(s));
  });
}

function latexProblems(slots: Deck["slides"][number]["slots"], slideId: string): string[] {
  const errs: string[] = [];
  const walk = (v: unknown, where: string) => {
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${where}[${i}]`));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) {
      if ((k === "latex" || k === "formula") && typeof x === "string") { const e = checkLatex(x); if (e) errs.push(`slide ${slideId}/${where}.${k}: LaTeX inválido: ${e}`); }
      else walk(x, `${where}.${k}`);
    }
  };
  for (const [slot, ref] of Object.entries(slots)) walk(ref.props, slot);
  return errs;
}

const unknownComponentHelp = (m: string) =>
  /no existe en el catálogo/.test(m) ? `${m}. Usa solo los componentes de lamina://catalog (con su versión exacta). Una IA externa no puede enviar componentes nuevos ni código; si necesitas otro, el docente puede pedirlo desde la interfaz de Lámina.` : m;

/**
 * Valida un deck recibido de una IA externa. `pres` permite resolver los componentes provisionales de esa presentación,
 * fijar el estilo por defecto y la marca del docente; sin él solo se valida contra el catálogo nativo.
 * Devuelve el deck normalizado (props reescritas con su esquema; marca fijada por el servidor) o la lista de errores.
 */
export async function checkDeck(db: Db, raw: unknown, ctx: { pres?: Pres; approvedContent?: ContentDraft | null }): Promise<DeckCheck> {
  scanJson(raw, "El deck");
  assertSize(raw, LIMITS.maxDeckBytes, "El deck");
  assertNoHostileLatex(raw, "El deck");
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new McpToolError("invalid_input", "El deck debe ser un objeto JSON (lamina://schemas/deck).");
  const r = raw as Record<string, unknown>;
  assertKeys(r, DECK_KEYS, "deck");
  if (r.meta) assertKeys(r.meta, META_KEYS, "deck.meta");
  if (!Array.isArray(r.slides)) throw new McpToolError("invalid_input", "deck.slides debe ser una lista de diapositivas.");
  if (r.slides.length > LIMITS.maxSlides) throw new McpToolError("payload_too_large", `El deck tiene ${r.slides.length} diapositivas; el máximo es ${LIMITS.maxSlides}.`);
  r.slides.forEach((s, i) => {
    assertKeys(s, SLIDE_KEYS, `deck.slides[${i}]`);
    const slots = (s as { slots?: Record<string, unknown> })?.slots;
    if (slots && typeof slots === "object") for (const [k, ref] of Object.entries(slots)) {
      assertKeys(ref, REF_KEYS, `deck.slides[${i}].slots.${k}`);
      const props = (ref as { props?: unknown })?.props;
      if (props !== undefined && jsonBytes(props) > LIMITS.maxPropsBytes) throw new McpToolError("payload_too_large", `deck.slides[${i}].slots.${k}: las props pesan más de ${Math.round(LIMITS.maxPropsBytes / 1000)} KB.`);
    }
  });

  const errors: string[] = [];
  const themeId = r.themeId ?? parseStylePref(ctx.pres?.themeId)?.themeId ?? "lamina-claro";
  if (!(THEME_IDS as readonly string[]).includes(themeId as string)) errors.push(`themeId «${String(themeId)}» no existe. Temas válidos: ${THEME_IDS.join(", ")} (lamina://themes).`);
  if (r.accent !== undefined && !(ACCENT_IDS as readonly string[]).includes(r.accent as string)) errors.push(`accent «${String(r.accent)}» no es válido (${ACCENT_IDS.join(", ")}).`);
  if (errors.length) return { ok: false, errors };

  const branding = ctx.pres ? await buildBranding(db, ctx.pres) : undefined;
  const meta = { ...(r.meta as object | undefined) } as Record<string, unknown>;
  delete meta.branding;
  if (ctx.pres) { meta.title ??= ctx.pres.title.slice(0, 190); meta.topic ??= ctx.pres.topic.slice(0, 190); meta.level ??= ctx.pres.level.slice(0, 110); }
  const accent = r.accent ?? parseStylePref(ctx.pres?.themeId)?.accent;
  const candidate = { ...r, schemaVersion: 1, engineVersion: ENGINE_VERSION, themeId, ...(accent ? { accent } : {}), meta: { ...meta, ...(branding && Object.keys(branding).length ? { branding } : {}), ...(branding?.teacher ? { author: branding.teacher.slice(0, 120) } : {}) } };

  const prov = ctx.pres ? await loadProvisional(db, ctx.pres.id) : [];
  const lookup = lookupFor(prov);
  const v = validateDeckAgainstCatalog(candidate, lookup);
  if (!v.ok) return { ok: false, errors: v.errors.map(unknownComponentHelp) };

  const deck = DeckDocument.parse(v.deck);
  const pins: Record<string, { version: string; bundleHash?: string }> = {};
  const provById = new Map(prov.map((p) => [p.manifest.id, p]));
  for (const s of deck.slides) {
    for (const [slot, ref] of Object.entries(s.slots)) {
      const nat = nativeEntry(ref.componentId);
      if (nat && nat.def.version === ref.version) {
        const parsed = nat.def.propsSchema.safeParse(ref.props);
        if (parsed.success) ref.props = parsed.data as Record<string, unknown>;
        pins[ref.componentId] = { version: ref.version };
      } else pins[ref.componentId] = { version: ref.version, bundleHash: provById.get(ref.componentId)?.bundleHash };
      void slot;
    }
    errors.push(...latexProblems(s.slots, s.id));
  }
  if (ctx.approvedContent) {
    const miss = missingFormulas(ctx.approvedContent, deck);
    if (miss.length) errors.push(`Faltan fórmulas/expresiones del contenido aprobado; deben copiarse tal cual en las props de algún componente: ${miss.slice(0, 6).join(" | ")}${miss.length > 6 ? ` (+${miss.length - 6} más)` : ""}`);
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, deck, pins, warnings: [] };
}
