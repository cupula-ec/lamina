import { eq } from "drizzle-orm";
import { z } from "zod";
import { ContentDraft, DeckDocument, Slide, SLOT_GEOMETRY, type DeckDocument as Deck, type Slide as SlideT, type SlideHint } from "@lamina/contracts";
import { QuotaWaitError, repairSlideSystem } from "@lamina/ai";
import { flagEnabled, hashJson, schema, workflow as wf } from "@lamina/db";
import { enqueue } from "@lamina/jobs";
import { catalogForPrompt, validateDeckAgainstCatalog } from "@lamina/components";
import type { Ctx } from "../ctx";
import { expectStage } from "../run";
import { loadProvisional, lookupFor, manifestsFor } from "../catalog";
import { layoutsDoc, missingFormulas, mustKeep, ownsHint } from "./design";
import { runHarness } from "../harness";
import { harnessImageTools } from "../images";

/** Intentos de reparación (render → reparar → render…) antes de dejar el diseño al docente con los problemas marcados. */
export const MAX_REPAIR_ATTEMPTS = 2;
/** Tope de diapositivas reparadas por pasada: acota el gasto de IA en decks muy dañados. */
const MAX_SLIDES_PER_PASS = 12;

const RepairOut = z.object({ slide: Slide });

type StoredIssue = { slot: string | null; kind: string; severity: string; message: string; detail?: string; element?: string; bbox?: unknown; ignored?: boolean };

/** Issues accionables: errores no ignorados de diapositivas que sí se pudieron renderizar (un fallo del renderer no se arregla editando la diapositiva). */
export function repairTargets(arts: { slideId: string; path: string; issues: unknown[] }[], only?: string[]) {
  const out = new Map<string, StoredIssue[]>();
  for (const a of arts) {
    if (!a.path || (only && !only.includes(a.slideId))) continue;
    const iss = (a.issues as StoredIssue[]).filter((i) => !i.ignored);
    if (iss.some((i) => i.severity === "error")) out.set(a.slideId, iss);
  }
  return out;
}

/** Menor escala que la corrección determinista aplica antes de recurrir a la IA (más abajo el texto ya sería ilegible al proyectar). */
export const MIN_AUTO_SCALE = 0.7;

/**
 * Corrección determinista de desbordes: reduce la escala del contenido de cada slot que se sale. Solo si TODOS los errores de la
 * diapositiva son desbordes (el resto necesita criterio de la IA). Devuelve null si no hay nada que reducir.
 */
export function shrinkOverflow(slide: SlideT, issues: StoredIssue[]): SlideT | null {
  const errs = issues.filter((i) => i.severity === "error" && !i.ignored);
  if (!errs.length || !errs.every((i) => i.kind === "overflow" && i.slot && i.slot in slide.slots)) return null;
  const adjust = { ...(slide.adjust ?? {}) };
  let changed = false;
  for (const slot of new Set(errs.map((i) => i.slot!))) {
    const cur = adjust[slot]?.fontScale ?? 1;
    const next = Math.max(MIN_AUTO_SCALE, Math.round(cur * 0.85 * 100) / 100);
    if (next < cur) { adjust[slot] = { ...adjust[slot], fontScale: next }; changed = true; }
  }
  return changed ? { ...slide, adjust } : null;
}

const sizesDoc = () =>
  Object.entries(SLOT_GEOMETRY).map(([layout, slots]) => `- ${layout}: ${Object.entries(slots).map(([k, b]) => `${k} ${b.w}×${b.h}`).join("; ")}`).join("\n");

/**
 * Reparación puntual: por cada diapositiva con errores, un prompt aislado (solo esa diapositiva + sus problemas + medidas),
 * nunca el deck completo. Después se re-renderiza solo lo cambiado. Nunca bloquea al docente: ante cualquier fallo cierra el diseño.
 */
export async function designRepair(ctx: Ctx, data: { presentationId: string; userId: string; deckVersionId: string; attempt: number; slideIds?: string[] }) {
  let current = data.deckVersionId;
  try {
    const p = await expectStage(ctx, data.presentationId, "designing");
    if (!p || p.currentDeckVersionId !== data.deckVersionId) return; // job obsoleto
    const [dv] = await ctx.db.select().from(schema.deckVersions).where(eq(schema.deckVersions.id, data.deckVersionId));
    const deck = DeckDocument.parse(dv!.deck);
    const arts = await ctx.db.select().from(schema.renderArtifacts).where(eq(schema.renderArtifacts.deckVersionId, data.deckVersionId));
    const targets = repairTargets(arts, data.slideIds);
    if (!targets.size || data.attempt >= MAX_REPAIR_ATTEMPTS + 1) return void (await wf.designFinish(ctx.db, p.id, current));

    const [cv] = await ctx.db.select().from(schema.contentVersions).where(eq(schema.contentVersions.id, p.approvedContentVersionId!));
    const hints: SlideHint[] = cv ? ContentDraft.parse(cv.content).sections.flatMap((s) => s.slidesHint) : [];
    const prov = await loadProvisional(ctx, p.id);
    const lookup = lookupFor(prov);
    // En una reparación el catálogo incluye todo lo V3 que la cuenta tiene activo (la diapositiva pudo usar esos componentes).
    const on = (await Promise.all((["v3_images", "v3_areas", "v3_pedagogy"] as const).map(async (f) => ((await flagEnabled(ctx.db, f, { userId: p.ownerId, presentationId: p.id })) ? f : null)))).filter((f): f is NonNullable<typeof f> => !!f);
    const system = repairSlideSystem(catalogForPrompt(manifestsFor(prov, on)), `${layoutsDoc()}\n\nMedidas de cada área:\n${sizesDoc()}`);

    // V3 §5.2: el harness (herramientas pequeñas sobre UNA diapositiva) sustituye a la llamada única, solo con el flag.
    const t0 = Date.now();
    const harnessOn = await flagEnabled(ctx.db, "v3_harness_repair", { userId: p.ownerId, presentationId: p.id });
    const imagesOn = on.includes("v3_images");
    const fixed = new Map<string, SlideT>();
    for (const slide of deck.slides) {
      const iss = targets.get(slide.id);
      if (!iss || fixed.size >= MAX_SLIDES_PER_PASS) continue;
      // Primera pasada: los desbordes puros se arreglan reduciendo la escala, sin gastar IA.
      if (data.attempt === 0) {
        const quick = shrinkOverflow(slide, iss);
        if (quick) { fixed.set(slide.id, quick); continue; }
      }
      const hint = hints.find((h) => ownsHint(h.id, slide.id));
      if (harnessOn && Date.now() - t0 < 8 * 60_000) { // presupuesto de tiempo global: el job caduca a los 15 min
        try {
          const r = await runHarness({
            ctx, presentationId: p.id, ownerId: p.ownerId, deck, slideId: slide.id, hint, manifests: manifestsFor(prov, on), lookup, signal: undefined,
            goal: "Corrige los problemas visuales detectados al dibujar esta diapositiva conservando su mensaje y todas las fórmulas.",
            issues: iss.map((i) => ({ slot: i.slot, kind: i.kind, severity: i.severity, message: i.message, detail: i.detail })),
            images: imagesOn ? harnessImageTools(ctx, p) : undefined,
          });
          if (r.ok && r.ops.length) { const next: SlideT = { ...r.slide, id: slide.id, transition: slide.transition, notes: r.slide.notes || slide.notes }; if (hashJson(next) !== hashJson(slide)) fixed.set(slide.id, next); }
          else if (!r.ok && r.reason === "sin cupo de IA ahora") break;
          else ctx.log(`repair(harness): ${slide.id} sin cambios (${r.ok ? r.summary : r.reason})`, { id: p.id, steps: r.steps, calls: r.calls });
        } catch (e) {
          if (e instanceof QuotaWaitError) break;
          ctx.log(`repair(harness): error en ${slide.id}`, { id: p.id, error: (e as Error).message });
        }
        continue;
      }
      const geo = SLOT_GEOMETRY[slide.layout] ?? {};
      const problems = iss.map((i) => `- [${i.severity === "error" ? "ERROR" : "aviso"}] área "${i.slot ?? "—"}" (${geo[i.slot ?? ""] ? `${geo[i.slot!]!.w}×${geo[i.slot!]!.h} px` : "?"}): ${i.message}${i.detail ? ` (${i.detail})` : ""}`).join("\n");
      const user = `DIAPOSITIVA ACTUAL (JSON, id "${slide.id}", layout "${slide.layout}"):\n${JSON.stringify(slide)}\n\nPROBLEMAS DETECTADOS AL DIBUJARLA:\n${problems}\n\n${hint ? `FÓRMULAS Y EXPRESIONES QUE DEBEN CONSERVARSE TAL CUAL: ${JSON.stringify(mustKeep(hint))}\n\n` : ""}Devuelve { "slide": {...con id "${slide.id}"} } corregida.`;
      try {
        const out = await ctx.ai.structured({
          role: "design", task: "design.repair", schema: RepairOut, presentationId: p.id, maxTokens: 3500, temperature: 0.2, system, user,
          fakeContext: { slide },
          check: (o) => {
            const sl = { ...o.slide, id: slide.id };
            const v = validateDeckAgainstCatalog({ ...deck, slides: [sl] }, lookup);
            const errs = v.ok ? [] : [...v.errors];
            if (hint) { const miss = missingFormulas(hint, sl); if (miss.length) errs.push(`Faltan fórmulas/expresiones que deben copiarse tal cual: ${miss.slice(0, 4).join(" | ")}`); }
            return errs;
          },
        });
        const next: SlideT = { ...out.slide, id: slide.id, build: { steps: [] }, transition: slide.transition, notes: out.slide.notes || slide.notes };
        if (hashJson(next) !== hashJson(slide)) fixed.set(slide.id, next);
      } catch (e) {
        if (e instanceof QuotaWaitError) break; // sin cupo: no se espera horas; se entrega lo que haya
        ctx.log(`repair: no se pudo corregir ${slide.id}`, { id: p.id, error: (e as Error).message });
      }
    }
    if (!fixed.size) return void (await wf.designFinish(ctx.db, p.id, current));

    const candidate: Deck = { ...deck, slides: deck.slides.map((s) => fixed.get(s.id) ?? s) };
    const v = validateDeckAgainstCatalog(candidate, lookup);
    if (!v.ok) return void (await wf.designFinish(ctx.db, p.id, current));

    const saved = await wf.designRepaired(ctx.db, p.id, {
      baseVersionId: data.deckVersionId, deck: v.deck, sha256: hashJson(v.deck),
      note: `Corrección automática de ${fixed.size} diapositiva${fixed.size > 1 ? "s" : ""} con problemas visuales`,
    });
    current = saved.id;
    // Las diapositivas intactas conservan su captura y sus problemas; solo se re-renderizan las corregidas.
    const keep = arts.filter((a) => !fixed.has(a.slideId));
    if (keep.length) await ctx.db.insert(schema.renderArtifacts).values(keep.map((a) => ({ presentationId: p.id, deckVersionId: saved.id, slideId: a.slideId, path: a.path, issues: a.issues }))).onConflictDoNothing();
    await enqueue(ctx.boss, "render", { presentationId: p.id, deckVersionId: saved.id, then: "repair", attempt: data.attempt + 1, slideIds: data.slideIds }, { base: `${saved.id}:${data.attempt + 1}` });
  } catch (e) {
    ctx.log(`repair: error, se cierra el diseño sin reparar: ${(e as Error).message}`, { id: data.presentationId });
    await wf.designFinish(ctx.db, data.presentationId, current).catch(() => {});
  }
}
