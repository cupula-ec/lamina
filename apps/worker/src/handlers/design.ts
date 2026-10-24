import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  ACCENT_IDS, ContentDraft, DeckDocument, ENGINE_VERSION, LAYOUT_IDS, LAYOUTS, Slide, THEME_IDS, formatStylePref, parseStylePref, proposeStyle, themesForPrompt,
  type DeckDocument as Deck, type Slide as SlideT, type SlideHint, type StyleChoice,
} from "@lamina/contracts";
import { QuotaWaitError, chooseStyleSystem, designSlideSystem } from "@lamina/ai";
import { buildBranding, consumeQuota, effectiveLogo, flagEnabled, hashJson, schema, throwIfAborted, units, workflow as wf } from "@lamina/db";
import { enqueue } from "@lamina/jobs";
import { catalogForPrompt, deckFromContent, sectionSlide, slidesFromHint, titleSlide, validateDeckAgainstCatalog, varietyProblem } from "@lamina/components";
import type { Ctx } from "../ctx";
import { expectStage } from "../run";
import { resolveImage, type ResolvedImage } from "../images";
import { loadProvisional, lookupFor, manifestsFor, type ProvisionalComponent } from "../catalog";
import { LaminaError, detectArea, motionForTheme } from "@lamina/contracts";

const SlideOut = z.object({
  slide: Slide,
  missingComponent: z.object({ name: z.string().min(2).max(60).regex(/^[A-Za-z][A-Za-z0-9]*$/), purpose: z.string().min(10).max(500) }).optional(),
});

/** Layouts que coloca el sistema (portadas y separadores): el modelo de diseño no los elige. */
const SYSTEM_LAYOUTS = new Set<string>(["title", "section", "cover-branded"]);

export const layoutsDoc = () =>
  Object.values(LAYOUTS).map((l) => `- ${l.id}${SYSTEM_LAYOUTS.has(l.id) ? " [lo coloca el sistema]" : ""}: ${l.purpose}. Slots: ${l.slots.map((s) => `${s.name}${s.required ? "*" : ""} (${s.hint})`).join("; ")}`).join("\n");

const StyleOut = z.object({ themeId: z.enum(THEME_IDS), accent: z.enum(ACCENT_IDS).default("a"), rationale: z.string().max(500).default("") });
export type ChosenStyle = StyleChoice & { rationale: string; source: "ia" | "reglas" };

/**
 * Paso previo al diseño: la IA (rol design) propone tema y acento según materia, nivel y objetivo; ante cualquier fallo
 * (modelo caído, cupo, respuesta inválida) se usa la propuesta determinista por palabras clave. Nunca bloquea el diseño.
 */
export async function chooseStyle(ctx: Ctx, input: { presentationId: string; topic: string; level: string; objective: string; subject?: string | null; v3?: boolean }): Promise<ChosenStyle> {
  const rules = proposeStyle({ subject: input.subject ?? undefined, topic: input.topic, level: input.level, objective: input.objective }, { v3: input.v3 });
  const fallback: ChosenStyle = { ...rules, rationale: "Propuesta por la materia y el tema de la clase.", source: "reglas" };
  try {
    const out = await ctx.ai.structured({
      role: "design", task: "design.style", schema: StyleOut, presentationId: input.presentationId, maxTokens: 400, temperature: 0.2,
      system: chooseStyleSystem(themesForPrompt({ v3: input.v3 })),
      user: `DATOS DE LA CLASE:\n${JSON.stringify({ materia: input.subject ?? null, tema: input.topic, nivel: input.level, objetivo: input.objective })}\n\nSugerencia por reglas (cámbiala solo si hay una razón clara): ${rules.themeId}.\nDevuelve { "themeId", "accent", "rationale" }.`,
      fakeContext: { rules },
    });
    return { themeId: out.themeId, accent: out.accent, rationale: out.rationale || fallback.rationale, source: "ia" };
  } catch (e) {
    ctx.log("design.style: se usa la propuesta por reglas", { error: (e as Error).message?.slice(0, 160) });
    return fallback;
  }
}

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

/** Portada con zona de marcas (layout `cover-branded`) solo si el catálogo de layouts ya lo contiene y la portada actual encaja en sus slots. */
export function withBrandedCover(slides: SlideT[], branding?: { teacher?: string }): SlideT[] {
  const spec = (LAYOUT_IDS as string[]).includes("cover-branded") ? (LAYOUTS as Record<string, (typeof LAYOUTS)[keyof typeof LAYOUTS]>)["cover-branded"] : undefined;
  const first = slides[0];
  if (!spec || !first || first.id !== "title" || first.layout !== "title") return slides;
  const names = new Set<string>(spec.slots.map((x) => x.name));
  if (Object.keys(first.slots).some((k) => !names.has(k)) || spec.slots.some((x) => x.required && !(x.name in first.slots))) return slides;
  // El docente ya sale en la zona de marcas: una portada conservada (rediseño parcial) que llevaba `author` no debe repetirlo.
  const main = first.slots.main;
  const dup = !!branding?.teacher?.trim() && main?.componentId === "Title" && typeof (main.props as { author?: unknown })?.author === "string";
  const slots = dup ? { ...first.slots, main: { ...main!, props: Object.fromEntries(Object.entries(main!.props as object).filter(([k]) => k !== "author")) } } : first.slots;
  return [{ ...first, slots, layout: "cover-branded" as SlideT["layout"] }, ...slides.slice(1)];
}

export const ownsHint = (hintId: string, slideId: string) => slideId === hintId || slideId.startsWith(`${hintId}-`);

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
  const author = owner?.name?.trim().slice(0, 120) || undefined; // meta.author admite máx. 120
  const branding = await buildBranding(ctx.db, p);

  let prevDeck: Deck | null = null;
  if (data.baseDeckVersionId) {
    const [dv] = await ctx.db.select().from(schema.deckVersions).where(eq(schema.deckVersions.id, data.baseDeckVersionId));
    if (dv) prevDeck = DeckDocument.parse(dv.deck);
  }

  // Estilo: el de la versión anterior (el docente pudo cambiarlo), si no el que eligió el docente y, si no, la propuesta de la IA.
  const chosen = prevDeck ? null : parseStylePref(p.themeId);
  const style: StyleChoice = prevDeck
    ? { themeId: prevDeck.themeId, accent: prevDeck.accent ?? "a" }
    : chosen ?? await chooseStyle(ctx, { presentationId: p.id, topic: content.meta.topic, level: content.meta.level, objective: content.meta.objective, subject: p.subject, v3: await flagEnabled(ctx.db, "v3_areas", { userId: p.ownerId, presentationId: p.id }) });
  if (!prevDeck && !chosen) await ctx.db.update(schema.presentations).set({ themeId: formatStylePref(style, true) }).where(eq(schema.presentations.id, p.id));

  const prov = await loadProvisional(ctx, p.id);
  const lookup = lookupFor(prov);
  const v3Images = await flagEnabled(ctx.db, "v3_images", { userId: p.ownerId, presentationId: p.id });
  const v3Areas = await flagEnabled(ctx.db, "v3_areas", { userId: p.ownerId, presentationId: p.id });
  const v3PedCat = await flagEnabled(ctx.db, "v3_pedagogy", { userId: p.ownerId, presentationId: p.id });
  const catalogDoc = catalogForPrompt(manifestsFor(prov, [...(v3Images ? ["v3_images"] : []), ...(v3Areas ? ["v3_areas"] : []), ...(v3PedCat ? ["v3_pedagogy"] : [])]), v3Areas ? { area: detectArea({ explicit: p.area, subject: p.subject, topic: p.topic }) } : {});
  const system = designSlideSystem(catalogDoc, layoutsDoc(), { pedagogy: await flagEnabled(ctx.db, "v3_pedagogy", { userId: p.ownerId, presentationId: p.id }) });

  // Contexto de continuidad: intención de las diapositivas vecinas
  const hints = content.sections.flatMap((s) => s.slidesHint.map((h) => ({ section: s, hint: h })));
  const requested = new Set<string>();
  const regenAll = !prevDeck || !data.onlySlideIds?.length;
  const only = new Set(data.onlySlideIds ?? []);

  const slides: SlideT[] = [];
  const keep = (id: string) => prevDeck?.slides.find((s) => s.id === id);

  // Jobs durables (V3 §5.1, detrás de flag): cada diapositiva es una unidad persistente; un reintento/reinicio solo repite lo que no terminó.
  const durable = await flagEnabled(ctx.db, "v3_durable_jobs", { userId: p.ownerId, presentationId: p.id });
  const scope: units.UnitScope = { presentationId: p.id, runKey: units.runKeyOf(["design", data.contentVersionId, data.baseDeckVersionId, data.feedback ?? "", data.onlySlideIds ?? [], p.cancelEpoch]), kind: "slide" };
  type UnitResult = { slides: SlideT[]; requested?: string };
  const doneMap = durable ? await units.doneUnits(ctx.db, scope) : new Map<string, unknown>();
  // Imágenes (V3 §5.5): cada imageRequest es una unidad "image"; si no se resuelve, la diapositiva se diseña sin imagen.
  const imgScope: units.UnitScope = { ...scope, kind: "image" };
  const imgDone = durable && v3Images ? await units.doneUnits(ctx.db, imgScope) : new Map<string, unknown>();
  const allImages = new Map<string, ResolvedImage>();
  const imagesFor = async (h: SlideHint): Promise<Map<string, ResolvedImage>> => {
    const got = new Map<string, ResolvedImage>();
    if (!v3Images) return got;
    for (const b of h.blocks) {
      if (b.type !== "imageRequest") continue;
      let r = imgDone.get(b.id) as ResolvedImage | { none: true } | undefined;
      if (!r) {
        throwIfAborted();
        if (durable) await units.startUnit(ctx.db, imgScope, b.id);
        r = (await resolveImage(ctx, p, b).catch((e) => { ctx.log(`images: ${(e as Error).message}`); return null; })) ?? { none: true };
        if (durable) await units.finishUnit(ctx.db, imgScope, b.id, r);
      }
      if (!("none" in r)) { got.set(b.id, r); allImages.set(b.id, r); }
    }
    return got;
  };
  const wants = (h: { id: string }) => {
    const ex = prevDeck?.slides.filter((x) => ownsHint(h.id, x.id)) ?? [];
    return regenAll || ex.length === 0 || ex.some((x) => only.has(x.id)) || only.has(h.id);
  };
  const totalUnits = hints.filter((x) => wants(x.hint)).length;
  let doneCount = doneMap.size;
  const setProgress = (n: number) => ctx.db.update(schema.presentations).set({ progress: `${n} de ${totalUnits} diapositivas listas` }).where(eq(schema.presentations.id, p.id)).catch(() => {});
  if (durable && totalUnits > 1) await setProgress(doneCount);
  const hb = durable ? setInterval(() => void units.heartbeatUnits(ctx.db, scope).catch(() => {}), 20_000) : null;
  hb?.unref();
  try {
  slides.push(!regenAll && keep("title") ? keep("title")! : titleSlide(content.meta, author, branding));

  for (const [si, s] of content.sections.entries()) {
    if (content.sections.length > 1) slides.push(!regenAll && keep(`sec-${s.id}`) ? keep(`sec-${s.id}`)! : sectionSlide(s.id, s.title, si));
    for (const h of s.slidesHint) {
      const idx = hints.findIndex((x) => x.hint.id === h.id);
      const existing = prevDeck?.slides.filter((x) => ownsHint(h.id, x.id)) ?? [];
      if (!wants(h)) { slides.push(...existing); continue; }
      const stored = doneMap.get(h.id) as UnitResult | undefined;
      if (stored) { slides.push(...stored.slides); if (stored.requested) requested.add(stored.requested); continue; }
      throwIfAborted();
      if (durable) await units.startUnit(ctx.db, scope, h.id);
      const imgs = await imagesFor(h);

      const prev = hints[idx - 1]?.hint.intent, next = hints[idx + 1]?.hint.intent;
      const current = existing[0];
      const used = slides.map((x) => x.layout);
      const inLastSection = si === content.sections.length - 1 && content.sections.length > 1;
      const user = `CONTENIDO DE LA DIAPOSITIVA (id "${h.id}", sección «${s.title}»):\n${JSON.stringify({ intent: h.intent, blocks: h.blocks })}\n\nContinuidad: anterior = ${prev ?? "(ninguna)"}; siguiente = ${next ?? "(ninguna)"}.\nNivel: ${content.meta.level}. Idioma: ${content.meta.language}.\nLayouts de las diapositivas anteriores (en orden): ${used.slice(-4).join(", ") || "(ninguna)"}.${inLastSection ? " Esta diapositiva es de la última sección (puedes usar \"closing\" si resume ideas clave)." : ""}${current && data.feedback ? `\n\nVERSIÓN ACTUAL de la diapositiva (JSON):\n${JSON.stringify(current)}` : ""}${data.feedback ? `\n\nCOMENTARIOS DEL DOCENTE (aplícalos): ${data.feedback}` : ""}\n\n${imgs.size ? `\n\nIMÁGENES YA GUARDADAS (usa el componente Image con estos datos EXACTOS, p. ej. en el slot visual de "split-visual"): ${JSON.stringify([...imgs].map(([block, im]) => ({ block, assetId: im.assetId, alt: im.alt })))}` : ""}\n\nDevuelve { "slide": {...con id "${h.id}"}, "missingComponent"?: {...} }.`;
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
            if (SYSTEM_LAYOUTS.has(sl.layout)) errs.push(`El layout "${sl.layout}" lo coloca el sistema: elige otro para esta diapositiva.`);
            else if (sl.layout === "closing" && !inLastSection) errs.push('El layout "closing" solo se usa en la última sección: elige otro.');
            // Con comentarios del docente (p. ej. «usa este componente») no se impone variedad de layouts: manda lo que pidió.
            for (const r of Object.values(sl.slots)) if (r.componentId === "Image" && ![...imgs.values()].some((im) => im.assetId === (r.props as { assetId?: string }).assetId) && ![...allImages.values()].some((im) => im.assetId === (r.props as { assetId?: string }).assetId)) errs.push("El componente Image debe usar un assetId de las IMÁGENES YA GUARDADAS; no inventes ids.");
            const rep = data.feedback ? null : varietyProblem(used, sl.layout, h.blocks);
            if (rep) errs.push(rep);
            return errs;
          },
        });
        slides.push({ ...out.slide, id: h.id });
        let askedFor: string | undefined;
        if (out.missingComponent && !requested.has(out.missingComponent.name)) { requested.add(out.missingComponent.name); askedFor = out.missingComponent.name; }
        // La unidad se cierra ANTES de pedir el componente: si el proceso muere en medio, el reintento no lo pide (ni cobra cuota) dos veces.
        if (durable) await units.finishUnit(ctx.db, scope, h.id, { slides: [{ ...out.slide, id: h.id }], requested: askedFor } satisfies UnitResult);
        if (askedFor) await requestComponent(ctx, p.id, p.ownerId, askedFor, out.missingComponent!.purpose, h.id);
        if (durable) await setProgress(++doneCount);
      } catch (e) {
        if (e instanceof LaminaError && e.code === "provider_failed") {
          slides.push(...slidesFromHint(h, used, { closing: inLastSection, images: imgs })); // fallback estable
          if (durable) { await units.failUnit(ctx.db, scope, h.id, e.message).catch(() => {}); await setProgress(++doneCount); } // marcada: se reintenta en una ejecución nueva; cuenta como lista (degradada) para el progreso
        } else {
          if (durable) await units.failUnit(ctx.db, scope, h.id, (e as Error).message, e instanceof QuotaWaitError ? "quota_wait" : "failed").catch(() => {});
          throw e; // QuotaWaitError y demás: el wrapper decide
        }
      }
    }
  }
  } finally { if (hb) clearInterval(hb); }

  // Logo persistente (deck v2): conserva el de la versión anterior (el docente pudo cambiarlo); si no, el del perfil, solo con el flag.
  // Motion (deck v2): conserva el de la versión anterior; si no, el preset del tema, solo con el flag.
  const motion = prevDeck ? prevDeck.meta.motion : (await flagEnabled(ctx.db, "v3_motion", { userId: p.ownerId, presentationId: p.id })) ? motionForTheme(style.themeId) : undefined;
  const logo = prevDeck ? prevDeck.meta.logo : (await flagEnabled(ctx.db, "v3_logo", { userId: p.ownerId, presentationId: p.id })) ? await effectiveLogo(ctx.db, p.ownerId) : undefined;
  const deck: Deck = DeckDocument.parse({
    schemaVersion: logo || motion ? 2 : 1, engineVersion: ENGINE_VERSION, themeId: style.themeId, accent: style.accent,
    meta: { title: content.meta.topic.slice(0, 190), topic: content.meta.topic, level: content.meta.level, language: content.meta.language, ...(author ? { author } : {}), branding, ...(logo ? { logo } : {}), ...(motion ? { motion } : {}) },
    slides: withBrandedCover(slides, branding),
  });
  const final = validateDeckAgainstCatalog(deck, lookup);
  // Último recurso: si algo no valida, deck 100 % determinista (nunca se bloquea al docente).
  const fallback = (): Deck => { const d = deckFromContent(content, author, { branding, themeId: style.themeId, accent: style.accent, images: allImages }); return { ...d, schemaVersion: logo || motion ? 2 : d.schemaVersion, meta: { ...d.meta, branding, ...(logo ? { logo } : {}), ...(motion ? { motion } : {}) }, slides: withBrandedCover(d.slides, branding) }; };
  const safe: Deck = final.ok ? final.deck : fallback();
  const pins: Record<string, { version: string; bundleHash?: string }> = {};
  const provById = new Map(prov.map((x) => [x.manifest.id, x]));
  for (const sl of safe.slides) for (const r of Object.values(sl.slots)) pins[r.componentId] = { version: r.version, bundleHash: provById.get(r.componentId)?.bundleHash };

  const saved = await wf.designDrafted(ctx.db, p.id, {
    deck: safe, sha256: hashJson(safe), contentVersionId: data.contentVersionId, parentId: data.baseDeckVersionId, componentPins: pins,
    note: data.feedback ? "Regenerado con comentarios" : "Diseño inicial", allowSchemaV2: !!logo || !!motion,
  });
  if (durable) await units.clearRun(ctx.db, { presentationId: p.id, runKey: scope.runKey }).catch(() => {}); // el resultado ya vive en la versión guardada
  // Render → detección → reparación puntual (design.repair) → design_review. Si no se puede encolar, se cierra sin reparar.
  await enqueue(ctx.boss, "render", { presentationId: p.id, deckVersionId: saved.id, then: "repair", attempt: 0 }, { base: `${saved.id}:0` })
    .catch(() => wf.designFinish(ctx.db, p.id, saved.id));
}

/** Registra una petición de componente (consume cuota del docente) y encola al especialista. */
export async function requestComponent(ctx: Ctx, presentationId: string, userId: string, name: string, purpose: string, slideId?: string) {
  try { await consumeQuota(ctx.db, userId, "component_request"); } catch { return null; }
  const [r] = await ctx.db.insert(schema.componentRequests).values({ presentationId, userId, purpose, suggestedName: name, slideId }).returning();
  await enqueue(ctx.boss, "component.request", { presentationId, userId, requestId: r!.id, purpose, suggestedName: name, slideId }, { base: r!.id }).catch(() => {});
  return r!;
}
