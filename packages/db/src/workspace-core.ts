/**
 * Núcleo PURO del workspace: aplica ops a un deck/contenido y devuelve el nuevo estado y la inversa de cada op.
 * Sin base de datos: `dryRun` y la ejecución real comparten exactamente este camino.
 */
import { ContentDraft, DeckDocument, OP_TARGET, type ContentOp, type DeckOp, type OpIssue, type SlideDiff, type WorkspaceOp } from "@lamina/contracts";
import { hashJson } from "./hash";

type Deck = DeckDocument;
type Content = ContentDraft;

class OpError extends Error { constructor(public code: string, message: string, public slideId?: string) { super(message); } }
const clone = <T>(x: T): T => structuredClone(x);
const slideIdx = (d: Deck, id: string) => { const i = d.slides.findIndex((s) => s.id === id); if (i < 0) throw new OpError("not_found", `No existe la diapositiva «${id}»`, id); return i; };
const prevId = (d: Deck, i: number) => (i > 0 ? d.slides[i - 1]!.id : null);
const insertAfter = <T extends { id: string }>(arr: T[], item: T, afterId: string | null | undefined, what: string) => {
  if (afterId === undefined) arr.push(item);
  else if (afterId === null) arr.unshift(item);
  else { const i = arr.findIndex((x) => x.id === afterId); if (i < 0) throw new OpError("not_found", `No existe ${what} «${afterId}» para insertar después`); arr.splice(i + 1, 0, item); }
};

function applyDeckOp(d: Deck, op: DeckOp): { inverse: WorkspaceOp; touched: string[] } {
  switch (op.op) {
    case "add_slide": {
      if (d.slides.some((s) => s.id === op.slide.id)) throw new OpError("duplicate", `Ya existe la diapositiva «${op.slide.id}»`, op.slide.id);
      insertAfter(d.slides, op.slide, op.afterId, "la diapositiva");
      return { inverse: { op: "remove_slide", slideId: op.slide.id }, touched: [op.slide.id] };
    }
    case "replace_slide": {
      const i = slideIdx(d, op.slideId);
      const old = d.slides[i]!;
      d.slides[i] = { ...op.slide, id: op.slideId };
      return { inverse: { op: "replace_slide", slideId: op.slideId, slide: old }, touched: [op.slideId] };
    }
    case "remove_slide": {
      const i = slideIdx(d, op.slideId);
      const [old] = d.slides.splice(i, 1);
      return { inverse: { op: "add_slide", slide: old!, afterId: i > 0 ? d.slides[i - 1]!.id : null }, touched: [op.slideId] };
    }
    case "move_slide": {
      const i = slideIdx(d, op.slideId);
      const before = prevId(d, i);
      if (op.afterId === op.slideId) throw new OpError("invalid", "Una diapositiva no puede ir después de sí misma", op.slideId);
      const [s] = d.slides.splice(i, 1);
      insertAfter(d.slides, s!, op.afterId, "la diapositiva");
      return { inverse: { op: "move_slide", slideId: op.slideId, afterId: before }, touched: [op.slideId] };
    }
    case "set_slot": {
      const s = d.slides[slideIdx(d, op.slideId)]!;
      const old = s.slots[op.slot];
      s.slots[op.slot] = op.ref;
      return { inverse: old ? { op: "set_slot", slideId: op.slideId, slot: op.slot, ref: old } : { op: "remove_slot", slideId: op.slideId, slot: op.slot }, touched: [op.slideId] };
    }
    case "remove_slot": {
      const s = d.slides[slideIdx(d, op.slideId)]!;
      const old = s.slots[op.slot];
      if (!old) throw new OpError("not_found", `El slot «${op.slot}» está vacío`, op.slideId);
      delete s.slots[op.slot];
      s.build = { steps: s.build.steps.map((st) => ({ reveal: st.reveal.filter((r) => r !== op.slot) })).filter((st) => st.reveal.length) };
      if (s.adjust) delete s.adjust[op.slot];
      return { inverse: { op: "set_slot", slideId: op.slideId, slot: op.slot, ref: old }, touched: [op.slideId] };
    }
    case "set_slot_props": {
      const s = d.slides[slideIdx(d, op.slideId)]!;
      const ref = s.slots[op.slot];
      if (!ref) throw new OpError("not_found", `El slot «${op.slot}» está vacío`, op.slideId);
      const keys = [...Object.keys(op.props), ...(op.unset ?? [])];
      const restore: Record<string, unknown> = {};
      const added: string[] = [];
      for (const k of keys) { if (k in ref.props) restore[k] = clone(ref.props[k]); else added.push(k); }
      for (const [k, v] of Object.entries(op.props)) ref.props[k] = v;
      for (const k of op.unset ?? []) delete ref.props[k];
      return { inverse: { op: "set_slot_props", slideId: op.slideId, slot: op.slot, props: restore, unset: added }, touched: [op.slideId] };
    }
    case "set_build": {
      const s = d.slides[slideIdx(d, op.slideId)]!;
      const old = s.build.steps;
      s.build = { steps: op.steps };
      return { inverse: { op: "set_build", slideId: op.slideId, steps: old }, touched: [op.slideId] };
    }
    case "set_notes": {
      const s = d.slides[slideIdx(d, op.slideId)]!;
      const old = s.notes;
      s.notes = op.notes;
      return { inverse: { op: "set_notes", slideId: op.slideId, notes: old }, touched: [op.slideId] };
    }
    case "set_logo": {
      const old = d.meta.logo ?? null;
      if (op.logo) d.meta.logo = op.logo; else delete d.meta.logo;
      return { inverse: { op: "set_logo", logo: old }, touched: [] };
    }
    case "set_motion": {
      const old = d.meta.motion ?? null;
      if (op.motion) d.meta.motion = op.motion; else delete d.meta.motion;
      return { inverse: { op: "set_motion", motion: old }, touched: [] };
    }
    case "set_theme": {
      const inv: WorkspaceOp = { op: "set_theme", themeId: d.themeId, ...(d.accent ? { accent: d.accent } : {}) };
      d.themeId = op.themeId;
      if (op.accent) d.accent = op.accent; else delete d.accent;
      return { inverse: inv, touched: [] };
    }
  }
}

const findHint = (c: Content, hintId: string) => {
  for (const s of c.sections) { const h = s.slidesHint.find((x) => x.id === hintId); if (h) return { s, h }; }
  throw new OpError("not_found", `No existe la diapositiva de contenido «${hintId}»`);
};
const findBlock = (c: Content, blockId: string) => {
  for (const s of c.sections) for (const h of s.slidesHint) { const i = h.blocks.findIndex((b) => b.id === blockId); if (i >= 0) return { s, h, i }; }
  throw new OpError("not_found", `No existe el bloque «${blockId}»`);
};

function applyContentOp(c: Content, op: ContentOp): { inverse: WorkspaceOp } {
  switch (op.op) {
    case "add_section": {
      if (c.sections.some((x) => x.id === op.section.id)) throw new OpError("duplicate", `Ya existe la sección «${op.section.id}»`);
      insertAfter(c.sections, { ...op.section, locked: false } as never, op.afterId, "la sección");
      return { inverse: { op: "remove_section", sectionId: op.section.id } };
    }
    case "edit_section": {
      const s = c.sections.find((x) => x.id === op.sectionId);
      if (!s) throw new OpError("not_found", `No existe la sección «${op.sectionId}»`);
      const inv = { op: "edit_section" as const, sectionId: op.sectionId, ...(op.title !== undefined ? { title: s.title } : {}), ...(op.locked !== undefined ? { locked: s.locked } : {}) };
      if (op.title !== undefined) s.title = op.title;
      if (op.locked !== undefined) s.locked = op.locked;
      return { inverse: inv };
    }
    case "remove_section": {
      const i = c.sections.findIndex((x) => x.id === op.sectionId);
      if (i < 0) throw new OpError("not_found", `No existe la sección «${op.sectionId}»`);
      const [old] = c.sections.splice(i, 1);
      return { inverse: { op: "add_section", section: old!, afterId: i > 0 ? c.sections[i - 1]!.id : null } };
    }
    case "add_hint": {
      const s = c.sections.find((x) => x.id === op.sectionId);
      if (!s) throw new OpError("not_found", `No existe la sección «${op.sectionId}»`);
      if (c.sections.some((x) => x.slidesHint.some((h) => h.id === op.hint.id))) throw new OpError("duplicate", `Ya existe la diapositiva de contenido «${op.hint.id}»`);
      insertAfter(s.slidesHint, op.hint, op.afterId, "la diapositiva de contenido");
      return { inverse: { op: "remove_hint", hintId: op.hint.id } };
    }
    case "remove_hint": {
      const { s, h } = findHint(c, op.hintId);
      const i = s.slidesHint.indexOf(h);
      s.slidesHint.splice(i, 1);
      return { inverse: { op: "add_hint", sectionId: s.id, hint: h, afterId: i > 0 ? s.slidesHint[i - 1]!.id : null } };
    }
    case "add_block": {
      const { h } = findHint(c, op.hintId);
      if (c.sections.some((s) => s.slidesHint.some((x) => x.blocks.some((b) => b.id === op.block.id)))) throw new OpError("duplicate", `Ya existe el bloque «${op.block.id}»`);
      insertAfter(h.blocks, op.block, op.afterId, "el bloque");
      return { inverse: { op: "remove_block", blockId: op.block.id } };
    }
    case "replace_block": {
      const { h, i } = findBlock(c, op.blockId);
      const old = h.blocks[i]!;
      h.blocks[i] = { ...op.block, id: op.blockId } as never;
      return { inverse: { op: "replace_block", blockId: op.blockId, block: old } };
    }
    case "remove_block": {
      const { h, i } = findBlock(c, op.blockId);
      const [old] = h.blocks.splice(i, 1);
      return { inverse: { op: "add_block", hintId: h.id, block: old!, afterId: i > 0 ? h.blocks[i - 1]!.id : null } };
    }
    case "move_block": {
      const { h, i } = findBlock(c, op.blockId);
      const [b] = h.blocks.splice(i, 1);
      const inv: WorkspaceOp = { op: "move_block", blockId: op.blockId, toHintId: h.id, afterId: i > 0 ? h.blocks[i - 1]!.id : null };
      const dest = findHint(c, op.toHintId).h;
      insertAfter(dest.blocks, b!, op.afterId, "el bloque");
      return { inverse: inv };
    }
  }
}

const zIssues = (e: { issues: { path: PropertyKey[]; message: string }[] }): OpIssue[] =>
  e.issues.slice(0, 12).map((i) => ({ code: "invalid", path: i.path.join("."), message: i.message }));

/** ¿El deck usa algún dato que solo existe en esquema v2? */
/** Datos de esquema v2: logo persistente, motion, y claves de magic-move. */
export const needsV2 = (d: Deck) => !!d.meta.logo || !!d.meta.motion || d.slides.some((s) => !!s.motion || Object.values(s.slots).some((r) => !!r.key));

export type WsState = { deck: Deck | null; content: Content | null };
export type PureResult = { ok: boolean; state: WsState; /** inversa de cada op, alineada con `ops` */ inverses: WorkspaceOp[]; touchedSlideIds: string[]; issues: OpIssue[] };

/** Aplica el lote completo (en orden) sobre una copia; atómico: ante cualquier problema devuelve el estado original y los issues. */
export function applyOpsPure(state: WsState, ops: WorkspaceOp[]): PureResult {
  const next: WsState = { deck: state.deck ? clone(state.deck) : null, content: state.content ? clone(state.content) : null };
  const inverses: WorkspaceOp[] = [];
  const touched = new Set<string>();
  const fail = (issues: OpIssue[]): PureResult => ({ ok: false, state, inverses: [], touchedSlideIds: [], issues });
  for (const [i, op] of ops.entries()) {
    try {
      if (OP_TARGET(op) === "deck") {
        if (!next.deck) return fail([{ opIndex: i, code: "no_deck", message: "La presentación todavía no tiene diseño; envía primero el diseño completo" }]);
        const r = applyDeckOp(next.deck, op as DeckOp);
        inverses.push(r.inverse); r.touched.forEach((t) => touched.add(t));
      } else {
        if (!next.content) return fail([{ opIndex: i, code: "no_content", message: "La presentación todavía no tiene contenido" }]);
        inverses.push(applyContentOp(next.content, op as ContentOp).inverse);
      }
    } catch (e) {
      if (e instanceof OpError) return fail([{ opIndex: i, code: e.code, message: e.message, slideId: e.slideId }]);
      throw e;
    }
  }
  const issues: OpIssue[] = [];
  let deck = next.deck, content = next.content;
  // Los datos v2 llevan schemaVersion 2; sin ellos el deck vuelve a v1 (así deshacer devuelve exactamente el estado inicial).
  if (deck && ops.some((o) => o.op === "set_logo" || o.op === "set_motion")) deck.schemaVersion = needsV2(deck) ? 2 : 1;
  if (deck && ops.some((o) => OP_TARGET(o) === "deck")) {
    const parsed = DeckDocument.safeParse(deck);
    if (!parsed.success) {
      const pi = zIssues(parsed.error);
      for (const x of pi) { const m = x.path?.match(/^slides\.(\d+)/); if (m) x.slideId = deck.slides[Number(m[1])]?.id; }
      issues.push(...pi);
    } else deck = parsed.data;
  }
  if (content && ops.some((o) => OP_TARGET(o) === "content")) {
    const parsed = ContentDraft.safeParse(content);
    if (!parsed.success) issues.push(...zIssues(parsed.error)); else content = parsed.data;
  }
  if (issues.length) return fail(issues);
  return { ok: true, state: { deck, content }, inverses, touchedSlideIds: [...touched], issues: [] };
}

/** Diff por diapositiva (para «qué cambió la IA» y para stale_rev). */
export function diffDecks(a: Deck | null, b: Deck | null): SlideDiff[] {
  const A = new Map((a?.slides ?? []).map((s, i) => [s.id, { h: hashJson(s), i }]));
  const B = new Map((b?.slides ?? []).map((s, i) => [s.id, { h: hashJson(s), i }]));
  const out: SlideDiff[] = [];
  for (const [id, x] of B) { const y = A.get(id); if (!y) out.push({ slideId: id, change: "added" }); else if (y.h !== x.h) out.push({ slideId: id, change: "modified" }); else if (y.i !== x.i) out.push({ slideId: id, change: "moved" }); }
  for (const id of A.keys()) if (!B.has(id)) out.push({ slideId: id, change: "removed" });
  return out;
}

