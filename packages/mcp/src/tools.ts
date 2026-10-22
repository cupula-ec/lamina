import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { ContentDraft, THEME_IDS, formatStylePref, type DeckDocument, type Stage } from "@lamina/contracts";
import { consumeQuota, hashJson, refundQuota, schema, workflow as wf } from "@lamina/db";
import { LIMITS } from "./limits";
import { McpToolError } from "./errors";
import { checkContentDraft } from "./content-check";
import { checkDeck } from "./deck-check";
import type { McpDeps, McpPrincipal } from "./types";

const Uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "debe ser un id de presentación (uuid)");
const Short = (max: number) => z.string().trim().min(1).max(max);
const Json = z.record(z.string(), z.unknown());

export const TOOL_INPUTS = {
  list_presentations: { stage: z.string().max(40).optional().describe("Filtrar por etapa (draft, content_review, content_approved, design_review…)"), limit: z.number().int().min(1).max(50).optional() },
  get_presentation: { id: Uuid, includeContent: z.boolean().optional().describe("Incluir el borrador de contenido vigente (o el aprobado)"), includeDeck: z.boolean().optional().describe("Incluir el deck vigente") },
  create_presentation: {
    topic: Short(200), level: Short(120), objective: Short(600), title: Short(200).optional(),
    subject: Short(160).optional(), period: Short(80).optional(), group: Short(80).optional(),
    themeId: z.enum(THEME_IDS).optional().describe("Estilo (lamina://themes); si falta, lo decide el docente o Lámina"),
    language: z.string().min(2).max(8).optional(),
  },
  submit_content_draft: { id: Uuid, draft: Json.describe("ContentDraft (lamina://schemas/content-draft)"), baseVersionId: z.string().uuid().nullable().describe("Versión de contenido vigente que leíste; null si aún no hay"), note: Short(300).optional() },
  validate_deck: { deck: Json.describe("DeckDocument (lamina://schemas/deck)"), id: Uuid.optional().describe("Presentación: habilita la verificación de fidelidad contra el contenido aprobado y los componentes provisionales") },
  submit_deck: { id: Uuid, deck: Json.describe("DeckDocument (lamina://schemas/deck)"), baseVersionId: z.string().uuid().nullable().describe("Versión de diseño vigente que leíste; null si aún no hay"), note: Short(300).optional() },
  get_render_issues: { id: Uuid, deckVersionId: z.string().uuid().optional().describe("Por defecto, la versión de diseño vigente") },
} as const;

export const TOOL_SCOPE: Record<keyof typeof TOOL_INPUTS, "presentations:read" | "presentations:write"> = {
  list_presentations: "presentations:read", get_presentation: "presentations:read", get_render_issues: "presentations:read", validate_deck: "presentations:read",
  create_presentation: "presentations:write", submit_content_draft: "presentations:write", submit_deck: "presentations:write",
};

const NEXT: Record<string, string> = {
  draft: "Redacta el contenido y envíalo con submit_content_draft.",
  content_review: "El docente debe revisar y aprobar el contenido en Lámina. Mientras tanto puedes reenviar una versión corregida con submit_content_draft (baseVersionId = versión vigente).",
  content_approved: "Contenido aprobado. Diseña el deck (lamina://catalog, lamina://layouts, lamina://themes), pruébalo con validate_deck y envíalo con submit_deck.",
  design_review: "El docente está revisando el diseño. Consulta get_render_issues y, si hay errores, reenvía un deck corregido con submit_deck.",
  designing: "Lámina está procesando esta presentación; espera.",
  researching: "Lámina está procesando esta presentación; espera.",
  polishing: "Lámina está procesando esta presentación; espera.",
};
const nextStep = (stage: string) => NEXT[stage] ?? "Esta etapa solo la continúa el docente desde Lámina.";

export function createTools(deps: McpDeps, who: McpPrincipal) {
  const { db } = deps;
  const url = (id: string) => `${deps.appUrl}/presentations/${id}`;

  async function owned(id: string) {
    if (!Uuid.safeParse(id).success) throw new McpToolError("not_found", "Presentación no encontrada.");
    const [p] = await db.select().from(schema.presentations).where(and(eq(schema.presentations.id, id), eq(schema.presentations.ownerId, who.userId)));
    if (!p) throw new McpToolError("not_found", "Presentación no encontrada.");
    return p;
  }
  const row = (p: typeof schema.presentations.$inferSelect) => ({
    id: p.id, title: p.title, topic: p.topic, level: p.level, stage: p.stage, origin: p.origin, subject: p.subject, period: p.period, group: p.groupName,
    themeId: p.themeId, updatedAt: p.updatedAt.toISOString(), url: url(p.id),
  });
  async function contentOf(p: typeof schema.presentations.$inferSelect) {
    const vid = p.approvedContentVersionId ?? p.currentContentVersionId;
    if (!vid) return null;
    const [v] = await db.select().from(schema.contentVersions).where(eq(schema.contentVersions.id, vid));
    return v ?? null;
  }
  async function withQuota<T>(kind: "mcp_submit" | "presentation_new", fn: () => Promise<T>): Promise<T> {
    await consumeQuota(db, who.userId, kind);
    try { return await fn(); } catch (e) { await refundQuota(db, who.userId, kind); throw e; }
  }

  return {
    async list_presentations(a: { stage?: string; limit?: number }) {
      const rows = await db.select().from(schema.presentations).where(eq(schema.presentations.ownerId, who.userId)).orderBy(desc(schema.presentations.updatedAt)).limit(200);
      const out = rows.filter((p) => !a.stage || p.stage === a.stage).slice(0, a.limit ?? 25).map(row);
      return { presentations: out, count: out.length };
    },

    async get_presentation(a: { id: string; includeContent?: boolean; includeDeck?: boolean }) {
      const p = await owned(a.id);
      const [cur] = p.currentContentVersionId ? await db.select().from(schema.contentVersions).where(eq(schema.contentVersions.id, p.currentContentVersionId)) : [];
      const [deck] = p.currentDeckVersionId ? await db.select().from(schema.deckVersions).where(eq(schema.deckVersions.id, p.currentDeckVersionId)) : [];
      const srcs = await db.select().from(schema.sources).where(eq(schema.sources.presentationId, p.id));
      const arts = p.currentDeckVersionId ? await db.select().from(schema.renderArtifacts).where(eq(schema.renderArtifacts.deckVersionId, p.currentDeckVersionId)) : [];
      const count = (sev: string) => arts.reduce((n, x) => n + (x.issues as { severity: string; ignored?: boolean }[]).filter((i) => i.severity === sev && !i.ignored).length, 0);
      const stage = p.stage as Stage;
      const approved = await contentOf(p);
      return {
        ...row(p),
        objective: p.objective, language: p.language,
        approvedContentVersionId: p.approvedContentVersionId,
        currentContentVersion: cur ? { id: cur.id, n: cur.n, sha256: cur.sha256, authorKind: cur.authorKind } : null,
        currentDeckVersion: deck ? { id: deck.id, n: deck.n, sha256: deck.sha256, authorKind: deck.authorKind, kind: deck.kind } : null,
        canSubmitContent: stage === "draft" || stage === "content_review",
        canSubmitDeck: stage === "content_approved" || stage === "design_review",
        renderIssues: deck ? { rendered: arts.filter((x) => x.path).length, slides: (deck.deck as { slides?: unknown[] }).slides?.length ?? 0, errors: count("error"), warnings: count("warning") } : null,
        sources: srcs.map((s) => ({ title: s.title, kind: s.kind, origin: s.origin, status: s.status })),
        nextStep: nextStep(p.stage),
        ...(a.includeContent && approved ? { content: { versionId: approved.id, sha256: approved.sha256, approved: approved.id === p.approvedContentVersionId, draft: approved.content } } : {}),
        ...(a.includeDeck && deck ? { deck: { versionId: deck.id, sha256: deck.sha256, deck: deck.deck } } : {}),
      };
    },

    async create_presentation(a: { topic: string; level: string; objective: string; title?: string; subject?: string; period?: string; group?: string; themeId?: (typeof THEME_IDS)[number]; language?: string }) {
      const p = await withQuota("presentation_new", () => wf.createPresentation(db, who.userId, {
        title: a.title ?? a.topic, topic: a.topic, level: a.level, objective: a.objective, language: a.language ?? "es",
        subject: a.subject ?? null, period: a.period ?? null, groupName: a.group ?? null,
        themeId: a.themeId ? formatStylePref({ themeId: a.themeId, accent: "a" }) : null, origin: "mcp",
      }));
      return { ...row(p), nextStep: nextStep("draft") };
    },

    async submit_content_draft(a: { id: string; draft: Record<string, unknown>; baseVersionId: string | null; note?: string }) {
      const p = await owned(a.id);
      const prior = p.currentContentVersionId ? ((await db.select().from(schema.contentVersions).where(eq(schema.contentVersions.id, p.currentContentVersionId)))[0]?.content as { warnings?: ContentDraft["warnings"] } | undefined)?.warnings ?? [] : [];
      const { draft, validation } = checkContentDraft(a.draft, prior);
      const sha256 = hashJson(draft);
      const [cur] = p.currentContentVersionId ? await db.select().from(schema.contentVersions).where(eq(schema.contentVersions.id, p.currentContentVersionId)) : [];
      const out = (v: { id: string; n: number; sha256: string }, idempotent: boolean, stage: string) => ({
        versionId: v.id, n: v.n, sha256: v.sha256, stage, idempotent, url: url(p.id),
        verification: validation.stats, warnings: validation.warnings.map((w) => ({ blockId: w.blockId, kind: w.kind, message: w.message })),
        nextStep: "El docente debe revisar y aprobar el contenido en Lámina; la versión aparece como «Creado por IA externa (MCP)».",
      });
      if (cur && cur.sha256 === sha256 && cur.authorKind === "mcp" && (cur.parentId ?? null) === (a.baseVersionId ?? null) && p.stage === "content_review") return out(cur, true, p.stage);
      const v = await withQuota("mcp_submit", () => wf.mcpContentSubmitted(db, p.id, who.userId, { content: draft, sha256, baseVersionId: a.baseVersionId, note: a.note ?? "Enviado desde una IA externa (MCP)" }));
      return out(v, false, "content_review");
    },

    async validate_deck(a: { deck: Record<string, unknown>; id?: string }) {
      const pres = a.id ? await owned(a.id) : undefined;
      const approved = pres?.approvedContentVersionId ? await contentOf(pres) : null;
      const r = await checkDeck(db, a.deck, { pres, approvedContent: approved ? ContentDraft.parse(approved.content) : null }).catch((e) => {
        if (e instanceof McpToolError && ["validation_failed", "invalid_input", "payload_too_large"].includes(e.code)) return { ok: false as const, errors: [e.message, ...((e.details as { errors?: string[] } | undefined)?.errors ?? [])] };
        throw e;
      });
      return r.ok
        ? { valid: true, errors: [] as string[], slides: r.deck.slides.length, fidelityChecked: !!approved }
        : { valid: false, errors: r.errors.slice(0, 40), fidelityChecked: !!approved };
    },

    async submit_deck(a: { id: string; deck: Record<string, unknown>; baseVersionId: string | null; note?: string }) {
      const p = await owned(a.id);
      if (!p.approvedContentVersionId) throw new McpToolError("invalid_transition", "El docente aún no aprobó el contenido; no se puede enviar el diseño.", { stage: p.stage });
      const approved = await contentOf(p);
      const r = await checkDeck(db, a.deck, { pres: p, approvedContent: approved ? ContentDraft.parse(approved.content) : null });
      if (!r.ok) throw new McpToolError("validation_failed", `El deck tiene ${r.errors.length} error(es); corrígelos (puedes probar con validate_deck).`, { errors: r.errors.slice(0, 40) });
      const deck: DeckDocument = r.deck;
      const sha256 = hashJson(deck);
      const [cur] = p.currentDeckVersionId ? await db.select().from(schema.deckVersions).where(eq(schema.deckVersions.id, p.currentDeckVersionId)) : [];
      const out = (v: { id: string; n: number; sha256: string }, idempotent: boolean) => ({
        versionId: v.id, n: v.n, sha256: v.sha256, stage: "design_review", idempotent, url: url(p.id),
        nextStep: "Lámina está dibujando las diapositivas. Consulta get_render_issues en unos segundos; el docente aprueba el diseño en Lámina.",
      });
      if (cur && cur.sha256 === sha256 && cur.authorKind === "mcp" && (cur.parentId ?? null) === (a.baseVersionId ?? null) && p.stage === "design_review") return out(cur, true);
      const v = await withQuota("mcp_submit", () => wf.mcpDeckSubmitted(db, p.id, who.userId, { deck, sha256, baseVersionId: a.baseVersionId, componentPins: r.pins, note: a.note ?? "Enviado desde una IA externa (MCP)", maxVersions: LIMITS.maxDeckVersionsPerPresentation }));
      await deps.enqueueRender(p.id, v.id).catch((e) => console.error("[mcp] no se pudo encolar el render", (e as Error).message));
      return out(v, false);
    },

    async get_render_issues(a: { id: string; deckVersionId?: string }) {
      const p = await owned(a.id);
      const vid = a.deckVersionId ?? p.currentDeckVersionId;
      if (!vid) throw new McpToolError("not_found", "Esta presentación aún no tiene un diseño; envíalo con submit_deck.");
      const [dv] = await db.select().from(schema.deckVersions).where(and(eq(schema.deckVersions.id, vid), eq(schema.deckVersions.presentationId, p.id)));
      if (!dv) throw new McpToolError("not_found", "Versión de diseño no encontrada.");
      const slides = ((dv.deck as { slides?: { id: string }[] }).slides ?? []).map((s) => s.id);
      const arts = await db.select().from(schema.renderArtifacts).where(eq(schema.renderArtifacts.deckVersionId, vid));
      const by = new Map(arts.map((x) => [x.slideId, x]));
      type Iss = { slot: string | null; kind: string; severity: string; message: string; detail?: string; ignored?: boolean };
      const per = slides.map((id) => {
        const a = by.get(id);
        return { slideId: id, rendered: !!a?.path, issues: ((a?.issues ?? []) as Iss[]).map((i) => ({ slot: i.slot, kind: i.kind, severity: i.severity, message: i.message, ...(i.detail ? { detail: i.detail } : {}), ...(i.ignored ? { ignored: true } : {}) })) };
      });
      const pending = per.filter((s) => !by.has(s.slideId)).length;
      const errors = per.reduce((n, s) => n + s.issues.filter((i) => i.severity === "error" && !i.ignored).length, 0);
      return {
        deckVersionId: vid, isCurrent: vid === p.currentDeckVersionId, status: pending ? "pending" : "ready", pendingSlides: pending, errors,
        slides: per.filter((s) => s.issues.length || !s.rendered),
        nextStep: pending ? "Aún se están dibujando diapositivas; vuelve a consultar en unos segundos." : errors ? "Corrige los errores en un deck nuevo y reenvíalo con submit_deck (baseVersionId = esta versión)." : "Sin errores. El docente puede revisar y aprobar el diseño en Lámina.",
      };
    },
  };
}
export type Tools = ReturnType<typeof createTools>;
