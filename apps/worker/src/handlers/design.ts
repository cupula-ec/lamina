import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  ContentDraft, DeckDocument, ENGINE_VERSION, LAYOUTS, Slide, type DeckDocument as Deck, type Slide as SlideT, type SlideHint,
} from "@lamina/contracts";
import { designSlideSystem } from "@lamina/ai";
import { consumeQuota, hashJson, schema, workflow as wf } from "@lamina/db";
import { enqueue } from "@lamina/jobs";
import { catalogForPrompt, deckFromContent, sectionSlide, slidesFromHint, titleSlide, validateDeckAgainstCatalog } from "@lamina/components";
import type { Ctx } from "../ctx";
import { expectStage } from "../run";
import { loadProvisional, lookupFor, manifestsFor, type ProvisionalComponent } from "../catalog";
import { LaminaError } from "@lamina/contracts";

const SlideOut = z.object({
  slide: Slide,
  missingComponent: z.object({ name: z.string().min(2).max(60).regex(/^[A-Za-z][A-Za-z0-9]*$/), purpose: z.string().min(10).max(500) }).optional(),
});

const layoutsDoc = () =>
  Object.values(LAYOUTS).map((l) => `- ${l.id}: ${l.purpose}. Slots: ${l.slots.map((s) => `${s.name}${s.required ? "*" : ""} (${s.hint})`).join("; ")}`).join("\n");

/** Fórmulas/expresiones que deben aparecer literalmente en la diapositiva (fidelidad matemática). */
export function mustKeep(hint: SlideHint): string[] {
  const out: string[] = [];
  for (const b of hint.blocks) {
    if (b.type === "formula") out.push(b.latex);
    if (b.type === "derivation") out.push(...b.steps.map((s) => s.latex));
    if (b.type === "example") out.push(...b.steps.flatMap((s) => (s.latex ? [s.latex] : [])));
    if (b.type === "graphSpec") out.push(...b.functions.map((f) => f.expr));
  }
  return out;
}
const norm = (s: string) => s.replace(/\s+/g, "");
function propStrings(v: unknown, out: string[] = []): string[] {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => propStrings(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => propStrings(x, out));
  return out;
}
/** Cada fórmula del contenido debe estar íntegra en alguna cadena de props (igual, o delimitada por $ , ; : o extremos): `x^2` no vale por `x^2+1`. */
export function missingFormulas(hint: SlideHint, slide: SlideT): string[] {
  const strs = propStrings(slide.slots).map(norm);
  return mustKeep(hint).filter((n) => {
    const needle = norm(n);
    const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(^|[$,;:])${esc}($|[$,;:])`);
    return !strs.some((s) => s === needle || re.test(s));
  });
}

const wrap = (slides: SlideT[], base?: Deck): Deck => ({ schemaVersion: 1, engineVersion: ENGINE_VERSION, themeId: base?.themeId ?? "lamina-claro", meta: base?.meta ?? { title: "x", topic: "x", level: "x", language: "es" }, slides });

const ownsHint = (hintId: string, slideId: string) => slideId === hintId || slideId.startsWith(`${hintId}-`);

export async function designGenerate(
  ctx: Ctx,
  data: { presentationId: string; contentVersionId: string; baseDeckVersionId: string | null; feedback?: string; onlySlideIds?: string[] },
) {
  const p = await expectStage(ctx, data.presentationId, "designing");
  if (!p) return;
  if (p.approvedContentVersionId !== data.contentVersionId) throw new LaminaError("stale_version", "El contenido aprobado cambió", 409);
  const [cv] = await ctx.db.select().from(schema.contentVersions).where(eq(schema.contentVersions.id, data.contentVersionId));
  const content = ContentDraft.parse(cv!.content);
  const [owner] = await ctx.db.select().from(schema.user).where(eq(schema.user.id, p.ownerId));
  const author = owner?.name;

  let prevDeck: Deck | null = null;
  if (data.baseDeckVersionId) {
    const [dv] = await ctx.db.select().from(schema.deckVersions).where(eq(schema.deckVersions.id, data.baseDeckVersionId));
    if (dv) prevDeck = DeckDocument.parse(dv.deck);
  }

  const prov = await loadProvisional(ctx, p.id);
  const lookup = lookupFor(prov);
  const catalogDoc = catalogForPrompt(manifestsFor(prov));
  const system = designSlideSystem(catalogDoc, layoutsDoc());

  // Contexto de continuidad: intención de las diapositivas vecinas
  const hints = content.sections.flatMap((s) => s.slidesHint.map((h) => ({ section: s, hint: h })));
  const requested = new Set<string>();
  const regenAll = !prevDeck || !data.onlySlideIds?.length;
  const only = new Set(data.onlySlideIds ?? []);

  const slides: SlideT[] = [];
  const keep = (id: string) => prevDeck?.slides.find((s) => s.id === id);
  slides.push(!regenAll && keep("title") ? keep("title")! : titleSlide(content.meta, author));

  for (const [si, s] of content.sections.entries()) {
    if (content.sections.length > 1) slides.push(!regenAll && keep(`sec-${s.id}`) ? keep(`sec-${s.id}`)! : sectionSlide(s.id, s.title, si));
    for (const h of s.slidesHint) {
      const idx = hints.findIndex((x) => x.hint.id === h.id);
      const existing = prevDeck?.slides.filter((x) => ownsHint(h.id, x.id)) ?? [];
      const wantsRegen = regenAll || existing.length === 0 || existing.some((x) => only.has(x.id)) || only.has(h.id);
      if (!wantsRegen) { slides.push(...existing); continue; }

      const prev = hints[idx - 1]?.hint.intent, next = hints[idx + 1]?.hint.intent;
      const current = existing[0];
      const user = `CONTENIDO DE LA DIAPOSITIVA (id "${h.id}", sección «${s.title}»):\n${JSON.stringify({ intent: h.intent, blocks: h.blocks })}\n\nContinuidad: anterior = ${prev ?? "(ninguna)"}; siguiente = ${next ?? "(ninguna)"}.\nNivel: ${content.meta.level}. Idioma: ${content.meta.language}.${current && data.feedback ? `\n\nVERSIÓN ACTUAL de la diapositiva (JSON):\n${JSON.stringify(current)}` : ""}${data.feedback ? `\n\nCOMENTARIOS DEL DOCENTE (aplícalos): ${data.feedback}` : ""}\n\nDevuelve { "slide": {...con id "${h.id}"}, "missingComponent"?: {...} }.`;
      try {
        const out = await ctx.ai.structured({
          role: "design", task: "design.slide", schema: SlideOut, presentationId: p.id, maxTokens: 3500, temperature: 0.3, system, user,
          fakeContext: { hint: h, section: s.title, feedback: data.feedback, provisional: prov.map((x) => ({ id: x.manifest.id, version: x.manifest.version, example: x.manifest.examples[0]?.props ?? {} })) },
          check: (o) => {
            const sl = { ...o.slide, id: h.id };
            const v = validateDeckAgainstCatalog(wrap([sl], undefined), lookup);
            const errs = v.ok ? [] : v.errors;
            const miss = missingFormulas(h, sl);
            if (miss.length) errs.push(`Faltan fórmulas/expresiones del contenido, que deben copiarse tal cual: ${miss.slice(0, 4).join(" | ")}`);
            return errs;
          },
        });
        slides.push({ ...out.slide, id: h.id });
        if (out.missingComponent && !requested.has(out.missingComponent.name)) {
          requested.add(out.missingComponent.name);
          await requestComponent(ctx, p.id, p.ownerId, out.missingComponent.name, out.missingComponent.purpose, h.id);
        }
      } catch (e) {
        if (e instanceof LaminaError && e.code === "provider_failed") slides.push(...slidesFromHint(h)); // fallback estable
        else throw e; // QuotaWaitError y demás: el wrapper decide
      }
    }
  }

  const deck: Deck = DeckDocument.parse({
    schemaVersion: 1, engineVersion: ENGINE_VERSION, themeId: prevDeck?.themeId ?? "lamina-claro",
    meta: { title: content.meta.topic.slice(0, 190), topic: content.meta.topic, level: content.meta.level, language: content.meta.language, ...(author ? { author } : {}) },
    slides,
  });
  const final = validateDeckAgainstCatalog(deck, lookup);
  // Último recurso: si algo no valida, deck 100 % determinista (nunca se bloquea al docente).
  const safe: Deck = final.ok ? final.deck : deckFromContent(content, author);
  const pins: Record<string, { version: string; bundleHash?: string }> = {};
  const provById = new Map(prov.map((x) => [x.manifest.id, x]));
  for (const sl of safe.slides) for (const r of Object.values(sl.slots)) pins[r.componentId] = { version: r.version, bundleHash: provById.get(r.componentId)?.bundleHash };

  const saved = await wf.designGenerated(ctx.db, p.id, {
    deck: safe, sha256: hashJson(safe), contentVersionId: data.contentVersionId, parentId: data.baseDeckVersionId, componentPins: pins,
    note: data.feedback ? "Regenerado con comentarios" : "Diseño inicial",
  });
  await enqueue(ctx.boss, "render", { presentationId: p.id, deckVersionId: saved.id }, { base: saved.id }).catch(() => {});
}

/** Registra una petición de componente (consume cuota del docente) y encola al especialista. */
export async function requestComponent(ctx: Ctx, presentationId: string, userId: string, name: string, purpose: string, slideId?: string) {
  try { await consumeQuota(ctx.db, userId, "component_request"); } catch { return null; }
  const [r] = await ctx.db.insert(schema.componentRequests).values({ presentationId, userId, purpose, suggestedName: name, slideId }).returning();
  await enqueue(ctx.boss, "component.request", { presentationId, userId, requestId: r!.id, purpose, suggestedName: name, slideId }, { base: r!.id }).catch(() => {});
  return r!;
}
