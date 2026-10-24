import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { AREA_IDS, AREA_PACKS, ContentDraft, DeckDocument, WorkspaceOp, type OpIssue, type Stage } from "@lamina/contracts";
import { FLAG_GATED_COMPONENTS, NATIVE_CATALOG, NATIVE_MANIFESTS, deckValidatorFor } from "@lamina/components";
import { consumeQuota, flagEnabled, hashJson, refundQuota, schema, tryConsumeQuota, workspace, type FlagName } from "@lamina/db";
import { fetchAndIngestImage, searchImages, writeAssetFile } from "@lamina/research";
import { checkLatex, validateContent } from "@lamina/validation";
import { LIMITS } from "./limits";
import { McpToolError } from "./errors";
import { assertNoHostileLatex, assertSize, scanJson } from "./safety";
import { loadProvisional, lookupFor } from "./catalog";
import type { McpDeps, McpPrincipal } from "./types";

const Uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "debe ser un id (uuid)");
const Short = (max: number) => z.string().trim().min(1).max(max);
const Json = z.record(z.string(), z.unknown());
const Ops = z.array(Json).min(1).max(100).describe("Lista de operaciones (lamina://schemas/ops). Se aplican todas o ninguna.");
const OpOpts = { baseRev: z.number().int().min(0).optional().describe("rev que leíste (get_outline / list_slides); si cambió, recibes stale_rev"), opId: Short(64).optional().describe("Identificador del lote para reintentar sin duplicar"), dryRun: z.boolean().optional().describe("Solo valida, no guarda") };

export const TOOL2_INPUTS = {
  start_here: {},
  next_step: { id: Uuid },
  get_outline: { id: Uuid },
  get_content_section: { id: Uuid, sectionId: Short(64) },
  apply_content_ops: { id: Uuid, ops: Ops, ...OpOpts },
  list_slides: { id: Uuid },
  get_slide: { id: Uuid, slideId: Short(64) },
  apply_deck_ops: { id: Uuid, ops: Ops, ...OpOpts },
  list_components: { id: Uuid.optional().describe("Con una presentación incluye sus componentes provisionales"), area: z.enum(AREA_IDS).optional() },
  propose_component: {
    id: Uuid, name: z.string().regex(/^[A-Za-z][A-Za-z0-9]{2,40}$/, "PascalCase, 3 a 41 letras/números").describe("Id del componente (PascalCase)"), title: Short(120), purpose: Short(600),
    useCases: z.array(Short(200)).min(1).max(4), tsx: z.string().min(20).max(40_000).describe("Archivo TSX único con export default function Component({ props, size }) — solo imports de react y @lamina/sdk"),
    propsJsonSchema: Json.describe("JSON Schema simple de las props"), fixtures: z.array(Json).min(1).max(3).describe("1 a 3 ejemplos de props válidos"),
  },
  get_component_status: { id: Uuid, requestId: Uuid },
  search_images: { id: Uuid, query: Short(160) },
  insert_image: { id: Uuid, ref: z.string().max(2400).optional().describe("ref devuelto por search_images"), url: z.string().url().max(2000).optional().describe("URL directa de una imagen (se descarga y se guarda en Lámina)"), slideId: Short(64), slot: Short(40), alt: Short(300).describe("Texto alternativo (obligatorio)") },
  render_slide: { id: Uuid, slideId: Short(64) },
  commit_checkpoint: { id: Uuid, label: Short(120) },
  get_links: { id: Uuid },
} as const;
export type Tool2Name = keyof typeof TOOL2_INPUTS;

export const TOOL2_SCOPE: Record<Tool2Name, "presentations:read" | "presentations:write"> = {
  start_here: "presentations:read", next_step: "presentations:read", get_outline: "presentations:read", get_content_section: "presentations:read", list_slides: "presentations:read",
  get_slide: "presentations:read", list_components: "presentations:read", get_component_status: "presentations:read", search_images: "presentations:read", get_links: "presentations:read",
  apply_content_ops: "presentations:write", apply_deck_ops: "presentations:write", propose_component: "presentations:write", insert_image: "presentations:write", render_slide: "presentations:write", commit_checkpoint: "presentations:write",
};
export const TOOL2_READ_ONLY = new Set<Tool2Name>(["start_here", "next_step", "get_outline", "get_content_section", "list_slides", "get_slide", "list_components", "get_component_status", "search_images", "get_links"]);

export const TOOL2_DESC: Record<Tool2Name, string> = {
  start_here: "EMPIEZA AQUÍ. Explica tu rol (tú escribes el contenido y el diseño; Lámina es el motor que valida, dibuja y guarda; no hay una IA de Lámina a la que pedirle cosas ni una app que abrir) y el flujo paso a paso, con tus presentaciones.",
  next_step: "Qué herramienta toca ahora para una presentación, con un ejemplo de argumentos listo para adaptar según su etapa.",
  get_outline: "Esquema barato del contenido: secciones y diapositivas (ids e intents) y el rev actual del espacio de trabajo.",
  get_content_section: "Lee una sección del contenido (bloques completos) para editarla por partes.",
  apply_content_ops: "Edita el contenido por partes con operaciones atómicas (add_section, edit_section, add_hint, add_block, replace_block, remove_block, move_block…). Todo o nada; valida solo lo cambiado. Luego commit_checkpoint.",
  list_slides: "Lista las diapositivas del diseño (id, layout, componentes por slot, problemas de render) y el rev actual.",
  get_slide: "Una diapositiva completa (JSON) con sus problemas de render.",
  apply_deck_ops: "Edita el diseño por partes (add_slide, replace_slide, set_slot, set_slot_props, set_build, set_notes, set_theme, move_slide, remove_slide…). Atómico, con validación del catálogo y de LaTeX en lo que cambió; dryRun para probar.",
  list_components: "Catálogo de componentes (id, versión exacta, props, ejemplo) filtrado por área; con id incluye los provisionales de esa presentación.",
  propose_component: "Propone un componente nuevo (código TSX). Pasa por las mismas comprobaciones que los generados (análisis estático, TypeScript estricto, sandbox sin red, render de fixtures). Queda provisional y SOLO para esa presentación. Consulta get_component_status.",
  get_component_status: "Estado y errores accionables de un componente propuesto.",
  search_images: "Busca imágenes libres (Wikimedia, Openverse…) y devuelve resultados con un ref para insert_image. Consume cuota de imágenes.",
  insert_image: "Descarga una imagen elegida (ref de search_images o url), la guarda en Lámina y la coloca en un slot de una diapositiva como componente Image. Nunca se enlazan URLs externas.",
  render_slide: "Confirma lo pendiente como versión y dibuja el diseño; luego consulta get_render_issues para ver los problemas.",
  commit_checkpoint: "Confirma los cambios pendientes del espacio de trabajo como una versión que el docente puede revisar en Lámina.",
  get_links: "Enlaces para el docente: editor, vista previa y visor. Dáselos para que vea el resultado.",
};

type Pres = typeof schema.presentations.$inferSelect;

const fix = (tool: string, argsHint?: unknown) => ({ tool, argsHint });
/** issue del motor de ops → error accionable con el siguiente paso. */
function actionable(issues: OpIssue[], id: string, kind: "content" | "deck") {
  const first = issues[0];
  const list = kind === "deck" ? "list_slides" : "get_outline";
  const f = !first ? fix(list, { id })
    : first.code === "slide_busy" ? fix("get_render_issues", { id })
    : first.code === "catalog" || /componente|catálogo/i.test(first.message) ? fix("list_components", { id })
    : first.code === "no_deck" ? fix("submit_deck", { id, deck: "{…}", baseVersionId: null })
    : first.code === "no_content" ? fix("submit_content_draft", { id, draft: "{…}", baseVersionId: null })
    : first.code === "invalid_op" ? fix("start_here")
    : fix(list, { id });
  return new McpToolError(first?.code === "stale_rev" ? "stale_rev" : "validation_failed", `${issues.length} problema(s): ${issues.slice(0, 5).map((i) => `${i.slideId ? `[${i.slideId}] ` : ""}${i.message}`).join(" | ")}`, { issues: issues.slice(0, 20) }, f);
}

const KIND_FOR_STAGE: Record<string, string> = { draft: "content", content_review: "content", content_approved: "deck", design_review: "deck" };

export function createTools2(deps: McpDeps, who: McpPrincipal, base: { owned(id: string): Promise<Pres> }) {
  const { db } = deps;
  const url = (id: string) => `${deps.appUrl}/presentations/${id}`;
  const enabled = async (f: FlagName, p?: Pres) => flagEnabled(db, f, { userId: who.userId, presentationId: p?.id });
  const guardOps = (ops: unknown) => { scanJson(ops, "Las operaciones"); assertSize(ops, LIMITS.maxDeckBytes, "Las operaciones"); assertNoHostileLatex(ops, "Las operaciones"); };

  async function ws(p: Pres) { return workspace.getWorkspace(db, p.id, who.userId); }
  const slideRow = async (p: Pres, deckVersionId: string | null) => {
    const arts = deckVersionId ? await db.select().from(schema.renderArtifacts).where(eq(schema.renderArtifacts.deckVersionId, deckVersionId)) : [];
    return new Map(arts.map((a) => [a.slideId, a]));
  };
  type Iss = { slot: string | null; kind: string; severity: string; message: string; ignored?: boolean };
  const issuesOf = (a?: { issues: unknown }) => ((a?.issues ?? []) as Iss[]).filter((i) => !i.ignored).map((i) => ({ slot: i.slot, kind: i.kind, severity: i.severity, message: i.message }));

  async function deckValidator(p: Pres) {
    const lookup = lookupFor(await loadProvisional(db, p.id));
    const catalog = deckValidatorFor(lookup);
    const off = new Set<string>();
    for (const [comp, flag] of Object.entries(FLAG_GATED_COMPONENTS)) if (!(await enabled(flag as FlagName, p))) off.add(comp);
    const before = new Set((await ws(p)).deck ? (DeckDocument.parse((await ws(p)).deck).slides.flatMap((x) => Object.values(x.slots).map((r) => r.componentId))) : []);
    return (deck: DeckDocument, touched: string[]) => {
      const out: OpIssue[] = [...catalog(deck, touched)];
      for (const s of deck.slides.filter((x) => touched.includes(x.id))) for (const r of Object.values(s.slots)) if (off.has(r.componentId) && !before.has(r.componentId)) out.push({ code: "catalog", slideId: s.id, message: `El componente ${r.componentId} todavía no está habilitado para tu cuenta.` });
      for (const s of deck.slides.filter((x) => touched.includes(x.id))) {
        const walk = (v: unknown, where: string) => {
          if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${where}[${i}]`));
          else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) {
            if ((k === "latex" || k === "formula") && typeof x === "string") { const e = checkLatex(x); if (e) out.push({ code: "latex", slideId: s.id, message: `${where}.${k}: LaTeX inválido: ${e}` }); } else walk(x, `${where}.${k}`);
          }
        };
        for (const [slot, ref] of Object.entries(s.slots)) walk(ref.props, slot);
      }
      return out;
    };
  }
  const contentValidator = (c: ContentDraft): OpIssue[] => validateContent(c).errors.map((message) => ({ code: "content", message }));

  async function applyKind(kind: "content" | "deck", a: { id: string; ops: Record<string, unknown>[]; baseRev?: number; opId?: string; dryRun?: boolean }) {
    guardOps(a.ops);
    const p = await base.owned(a.id);
    const r = await workspace.applyOps(db, p.id, a.ops, "mcp", {
      ownerId: who.userId, baseRev: a.baseRev, opId: a.opId, dryRun: a.dryRun, label: `MCP: ${a.ops.length} op(s)`,
      ...(kind === "deck" ? { validateDeck: await deckValidator(p) } : { validateContent: contentValidator }),
    });
    if (!r.ok) throw actionable(r.issues, p.id, kind);
    return {
      ok: true, dryRun: !!a.dryRun, rev: r.newRev, appliedOpIds: r.appliedOpIds, batchId: r.batchId, replayed: !!r.replayed, touchedSlideIds: r.touchedSlideIds,
      nextStep: a.dryRun ? "Las operaciones son válidas. Repite sin dryRun para guardarlas." : "Guardado en el espacio de trabajo. Cuando termines un bloque de cambios llama a commit_checkpoint para que el docente lo vea.",
    };
  }

  async function checkpoint(p: Pres, label: string) {
    const r = await workspace.commitCheckpoint(db, p.id, who.userId, "mcp", label);
    return { committed: r.committed, deckVersionId: r.deckVersionId, contentVersionId: r.contentVersionId, rev: r.rev };
  }

  const exampleDraft = { schemaVersion: 1, meta: { topic: "…", level: "…", objective: "…", language: "es" }, sections: [{ id: "s1", title: "…", slidesHint: [{ id: "h1", intent: "Título corto", blocks: [{ id: "b1", type: "text", md: "- idea 1\n- idea 2" }] }] }] };

  function stepFor(p: Pres, w?: { rev: number }) {
    const id = p.id;
    switch (p.stage as Stage) {
      case "draft": return { tool: "submit_content_draft", why: "No hay contenido todavía: redacta el borrador completo (puedes afinarlo luego por partes).", argsHint: { id, baseVersionId: null, draft: exampleDraft } };
      case "content_review": return { tool: "apply_content_ops", why: "El docente revisa el contenido. Puedes mejorarlo por partes y confirmarlo con commit_checkpoint; él lo aprueba en Lámina.", argsHint: { id, baseRev: w?.rev ?? 0, ops: [{ op: "edit_section", sectionId: "s1", title: "Nuevo título" }] }, then: { tool: "commit_checkpoint", argsHint: { id, label: "Mejoras al contenido" } } };
      case "content_approved": return { tool: "list_components", why: "Contenido aprobado: ahora el diseño es tuyo. Mira el catálogo y arma las diapositivas (submit_deck para el deck completo, o apply_deck_ops por partes).", argsHint: { id, area: p.area ?? undefined }, then: { tool: "submit_deck", argsHint: { id, baseVersionId: null, deck: "{ themeId, meta, slides:[…] }" } } };
      case "design_review": return { tool: "get_render_issues", why: "Revisa los problemas de render y corrígelos por partes.", argsHint: { id }, then: { tool: "apply_deck_ops", argsHint: { id, baseRev: w?.rev ?? 0, ops: [{ op: "set_slot_props", slideId: "h1", slot: "main", props: { caption: "…" } }] } } };
      case "designing": case "researching": case "polishing": return { tool: "get_links", why: "Lámina está procesando esta presentación; espera y revisa más tarde.", argsHint: { id } };
      default: return { tool: "get_links", why: "Esta etapa la continúa el docente desde Lámina.", argsHint: { id } };
    }
  }

  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unb64 = (s: string) => { try { return JSON.parse(Buffer.from(s, "base64url").toString("utf8")) as Record<string, string>; } catch { throw new McpToolError("invalid_input", "El ref no es válido; vuelve a buscar con search_images.", undefined, fix("search_images")); } };

  return {
    async start_here() {
      const rows = await db.select().from(schema.presentations).where(eq(schema.presentations.ownerId, who.userId)).orderBy(desc(schema.presentations.updatedAt)).limit(10);
      return {
        role: "TÚ eres la autora del contenido Y del diseño. Lámina es el motor: valida, dibuja, detecta problemas y guarda. Lámina NO tiene una IA a la que puedas pedirle cosas, no hay una app que «abrir» y no existe un «prompt de diseño» que enviar: construyes el diseño tú, slide por slide, con las herramientas.",
        rules: [
          "No pidas a Lámina que genere o diseñe; hazlo tú y envíalo con las herramientas.",
          "Trabaja por partes: apply_content_ops / apply_deck_ops en lotes pequeños, con baseRev, y confirma con commit_checkpoint.",
          "Prueba con dryRun antes de guardar si dudas. Los errores traen un campo fix con la herramienta y los argumentos para corregir.",
          "Usa solo componentes de list_components (versión exacta). Si falta uno, propose_component.",
          "Las imágenes: search_images → insert_image (siempre con texto alternativo). Nunca URLs externas en el deck.",
          "Para que el docente vea el resultado dale los enlaces de get_links. No puedes aprobar, publicar, compartir ni borrar.",
        ],
        flow: [
          "1. create_presentation (tema, nivel, objetivo; opcional área y cantidad: short|medium|long)",
          "2. submit_content_draft con el borrador completo; afínalo con apply_content_ops + commit_checkpoint",
          "3. El docente aprueba el contenido en Lámina (enlace de get_links)",
          "4. list_components → submit_deck (deck completo) o apply_deck_ops (por partes) → get_render_issues → corrige",
          "5. commit_checkpoint y get_links: el docente revisa y aprueba el diseño",
        ],
        presentations: rows.map((p) => ({ id: p.id, title: p.title, stage: p.stage, url: url(p.id), next: stepFor(p).tool })),
        nextStep: rows.length ? "Llama a next_step con el id de la presentación en la que trabajas." : "Crea una presentación con create_presentation.",
      };
    },
    async next_step(a: { id: string }) {
      const p = await base.owned(a.id);
      const w = await ws(p).catch(() => undefined);
      return { stage: p.stage, rev: w?.rev, ...stepFor(p, w) };
    },
    async get_outline(a: { id: string }) {
      const p = await base.owned(a.id);
      const w = await ws(p);
      if (!w.content) throw new McpToolError("not_found", "Esta presentación todavía no tiene contenido.", undefined, fix("submit_content_draft", { id: p.id, baseVersionId: null, draft: "{…}" }));
      const c = ContentDraft.parse(w.content);
      return { rev: w.rev, dirty: w.dirty, meta: c.meta, sections: c.sections.map((s) => ({ id: s.id, title: s.title, locked: s.locked, slides: s.slidesHint.map((h) => ({ id: h.id, intent: h.intent, blocks: h.blocks.map((b) => ({ id: b.id, type: b.type })) })) })) };
    },
    async get_content_section(a: { id: string; sectionId: string }) {
      const p = await base.owned(a.id);
      const w = await ws(p);
      const c = w.content ? ContentDraft.parse(w.content) : null;
      const s = c?.sections.find((x) => x.id === a.sectionId);
      if (!s) throw new McpToolError("not_found", `No existe la sección «${a.sectionId}».`, undefined, fix("get_outline", { id: p.id }));
      return { rev: w.rev, section: s };
    },
    apply_content_ops: (a: { id: string; ops: Record<string, unknown>[]; baseRev?: number; opId?: string; dryRun?: boolean }) => applyKind("content", a),
    async list_slides(a: { id: string }) {
      const p = await base.owned(a.id);
      const w = await ws(p);
      if (!w.deck) throw new McpToolError("not_found", "Esta presentación todavía no tiene diseño.", undefined, fix("submit_deck", { id: p.id, baseVersionId: null, deck: "{…}" }));
      const d = DeckDocument.parse(w.deck);
      const arts = await slideRow(p, w.baseDeckVersionId);
      return { rev: w.rev, dirty: w.dirty, themeId: d.themeId, slides: d.slides.map((s) => ({ id: s.id, layout: s.layout, slots: Object.fromEntries(Object.entries(s.slots).map(([k, r]) => [k, `${r.componentId}@${r.version}`])), issues: issuesOf(arts.get(s.id)) })) };
    },
    async get_slide(a: { id: string; slideId: string }) {
      const p = await base.owned(a.id);
      const w = await ws(p);
      const d = w.deck ? DeckDocument.parse(w.deck) : null;
      const s = d?.slides.find((x) => x.id === a.slideId);
      if (!s) throw new McpToolError("not_found", `No existe la diapositiva «${a.slideId}».`, undefined, fix("list_slides", { id: p.id }));
      const arts = await slideRow(p, w.baseDeckVersionId);
      return { rev: w.rev, slide: s, issues: issuesOf(arts.get(s.id)) };
    },
    apply_deck_ops: (a: { id: string; ops: Record<string, unknown>[]; baseRev?: number; opId?: string; dryRun?: boolean }) => applyKind("deck", a),
    async list_components(a: { id?: string; area?: (typeof AREA_IDS)[number] }) {
      const p = a.id ? await base.owned(a.id) : undefined;
      const on = new Set<string>();
      for (const f of ["v3_images", "v3_areas", "v3_pedagogy"] as const) if (await enabled(f, p)) on.add(f);
      const areaOf = (id: string) => NATIVE_CATALOG.find((c) => c.def.id === id)?.areas ?? "all";
      const nat = NATIVE_MANIFESTS.filter((m) => (!FLAG_GATED_COMPONENTS[m.id] || on.has(FLAG_GATED_COMPONENTS[m.id]!)) && (!a.area || areaOf(m.id) === "all" || (areaOf(m.id) as string[]).includes(a.area)));
      const prov = p ? (await loadProvisional(db, p.id)).map((x) => x.manifest) : [];
      return {
        area: a.area ?? null, areas: Object.fromEntries(Object.values(AREA_PACKS).map((x) => [x.id, x.label])),
        components: [...nat, ...prov].map((m) => ({ id: m.id, version: m.version, title: m.title, purpose: m.purpose, provisional: m.status === "provisional", fitsSlots: m.fitsSlots, constraints: m.constraints, propsJsonSchema: m.propsJsonSchema, example: m.examples[0]?.props })),
        nextStep: "Usa componentId y version EXACTOS en {componentId, version, props}. Si ninguno sirve: propose_component.",
      };
    },
    async propose_component(a: { id: string; name: string; title: string; purpose: string; useCases: string[]; tsx: string; propsJsonSchema: Record<string, unknown>; fixtures: Record<string, unknown>[] }) {
      if (!deps.enqueueComponent) throw new McpToolError("not_available", "Los componentes propuestos no están disponibles en este servidor.");
      scanJson(a, "El componente"); assertSize(a, 120_000, "El componente");
      const p = await base.owned(a.id);
      await consumeQuota(db, who.userId, "component_request");
      try {
        const [r] = await db.insert(schema.componentRequests).values({ presentationId: p.id, userId: who.userId, purpose: a.purpose, suggestedName: a.name }).returning();
        await deps.enqueueComponent({ presentationId: p.id, userId: who.userId, requestId: r!.id, purpose: a.purpose, suggestedName: a.name, provided: { id: a.name, title: a.title, purpose: a.purpose, useCases: a.useCases, propsJsonSchema: a.propsJsonSchema, fixtures: a.fixtures, tsx: a.tsx } });
        return { requestId: r!.id, status: "pending", nextStep: "Consulta get_component_status en unos segundos; si pasa, aparece en list_components (con id) como provisional y puedes usarlo en apply_deck_ops." };
      } catch (e) { await refundQuota(db, who.userId, "component_request"); throw e; }
    },
    async get_component_status(a: { id: string; requestId: string }) {
      const p = await base.owned(a.id);
      const [r] = await db.select().from(schema.componentRequests).where(and(eq(schema.componentRequests.id, a.requestId), eq(schema.componentRequests.presentationId, p.id)));
      if (!r) throw new McpToolError("not_found", "Solicitud no encontrada.");
      return { requestId: r.id, status: r.status, error: r.error, nextStep: r.status === "done" ? "Listo: usa el componente (list_components con id) en apply_deck_ops." : r.status === "failed" ? "Corrige los errores indicados y vuelve a llamar a propose_component." : "Todavía se está construyendo." };
    },
    async search_images(a: { id: string; query: string }) {
      await base.owned(a.id);
      if (!deps.images?.providers.length) throw new McpToolError("not_available", "La búsqueda de imágenes no está disponible en este servidor.");
      if (!(await enabled("v3_images"))) throw new McpToolError("feature_off", "Las imágenes todavía no están habilitadas para tu cuenta.");
      if (!(await tryConsumeQuota(db, who.userId, "image"))) throw new McpToolError("quota_exceeded", "Alcanzaste el límite diario de búsquedas de imágenes.");
      const { results } = await searchImages(deps.images.providers, a.query, { max: 8 });
      return { results: results.map((r) => ({ title: r.title, provider: r.provider, width: r.width, height: r.height, author: r.author, license: r.license, ref: b64({ url: r.url, provider: r.provider, pageUrl: r.pageUrl, author: r.author ?? "", license: r.license ?? "", licenseUrl: r.licenseUrl ?? "" }) })), nextStep: "Elige un resultado y llama a insert_image con su ref, el slideId, el slot y un alt descriptivo." };
    },
    async insert_image(a: { id: string; ref?: string; url?: string; slideId: string; slot: string; alt: string }) {
      const p = await base.owned(a.id);
      if (!deps.images) throw new McpToolError("not_available", "Las imágenes no están disponibles en este servidor.");
      if (!(await enabled("v3_images", p))) throw new McpToolError("feature_off", "Las imágenes todavía no están habilitadas para tu cuenta.");
      if (!(await tryConsumeQuota(db, who.userId, "image"))) throw new McpToolError("quota_exceeded", "Alcanzaste el límite diario de imágenes.");
      if (!a.ref === !a.url) throw new McpToolError("invalid_input", "Indica exactamente uno: ref (de search_images) o url.");
      const meta = a.ref ? unb64(a.ref) : { url: a.url!, provider: "mcp", pageUrl: a.url!, author: "", license: "", licenseUrl: "" };
      const img = await fetchAndIngestImage(String(meta.url));
      await writeAssetFile(deps.images.dataDir, img);
      const [dup] = await db.select().from(schema.assets).where(and(eq(schema.assets.presentationId, p.id), eq(schema.assets.sha256, img.sha256))).limit(1);
      const row = dup ?? (await db.insert(schema.assets).values({ ownerId: who.userId, presentationId: p.id, sha256: img.sha256, mime: img.mime, width: img.width, height: img.height, bytes: img.data.length, origin: "mcp", provider: String(meta.provider).slice(0, 40), pageUrl: String(meta.pageUrl ?? "").slice(0, 500), author: meta.author ? String(meta.author).slice(0, 200) : undefined, license: meta.license ? String(meta.license).slice(0, 120) : undefined, licenseUrl: meta.licenseUrl ? String(meta.licenseUrl).slice(0, 300) : undefined, alt: a.alt }).returning())[0]!;
      const credit = [meta.author || "Autor no indicado", meta.license || "licencia no indicada", meta.provider].filter(Boolean).join(" · ").slice(0, 200);
      const image = NATIVE_CATALOG.find((c) => c.def.id === "Image")!;
      return applyKind("deck", { id: p.id, ops: [{ op: "set_slot", slideId: a.slideId, slot: a.slot, ref: { componentId: "Image", version: image.def.version, props: { assetId: row.id, alt: a.alt, fit: "cover", showCredit: false, credit } } }] });
    },
    async render_slide(a: { id: string; slideId: string }) {
      const p = await base.owned(a.id);
      const cp = await checkpoint(p, "Dibujar desde MCP");
      const [fresh] = await db.select().from(schema.presentations).where(eq(schema.presentations.id, p.id));
      const vid = cp.deckVersionId ?? fresh?.currentDeckVersionId;
      if (!vid) throw new McpToolError("not_found", "Todavía no hay un diseño para dibujar.", undefined, fix("submit_deck", { id: p.id, baseVersionId: null, deck: "{…}" }));
      await deps.enqueueRender(p.id, vid).catch(() => {});
      return { deckVersionId: vid, slideId: a.slideId, status: "pending", nextStep: "Consulta get_render_issues en unos segundos; verás los problemas de esa diapositiva." };
    },
    async commit_checkpoint(a: { id: string; label: string }) {
      const p = await base.owned(a.id);
      const r = await checkpoint(p, a.label);
      return { ...r, url: url(p.id), nextStep: r.committed ? "Hay una versión nueva para el docente. Dale el enlace de get_links." : "No había cambios pendientes." };
    },
    async get_links(a: { id: string }) {
      const p = await base.owned(a.id);
      return { editor: `${url(p.id)}`, content: `${url(p.id)}/preview/information`, design: `${url(p.id)}/preview/design`, viewer: `${url(p.id)}/view`, nextStep: "Entrega estos enlaces al docente: ahí revisa y aprueba." };
    },
  };
}
export type Tools2 = ReturnType<typeof createTools2>;
void hashJson; void KIND_FOR_STAGE; void WorkspaceOp;
