import { QuotaWaitError } from "@lamina/ai";
import { LaminaError, type ContentDraft, type DeckDocument, type Slide, type SlideHint, type WorkspaceOp } from "@lamina/contracts";
import { applyOpsPure } from "@lamina/db";
import { catalogForPrompt, validateDeckAgainstCatalog, type CatalogLookup } from "@lamina/components";
import type { ComponentManifest } from "@lamina/contracts";
import type { Ctx } from "../ctx";
import { Action, TOOL_ARGS, TOOL_DOC, type ToolName } from "./protocol";
import { missingFormulas } from "../handlers/design";

export type HarnessIssue = { slot: string | null; kind: string; severity: string; message: string; detail?: string };

export type HarnessEnv = {
  ctx: Ctx;
  presentationId: string;
  ownerId: string;
  deck: DeckDocument;
  content?: ContentDraft | null;
  slideId: string;
  issues: HarnessIssue[];
  hint?: SlideHint;
  manifests: ComponentManifest[];
  lookup: CatalogLookup;
  /** Objetivo en lenguaje natural (una orden del docente o «corrige los problemas»). */
  goal: string;
  /** Búsqueda/colocación de imágenes (solo si el flag v3_images está activo para la cuenta). */
  images?: { search: (q: string) => Promise<"cuota" | { id: string; title?: string; provider: string; width?: number; height?: number }[]>; use: (resultId: string, alt: string) => Promise<{ assetId: string; credit?: string } | null> };
  /** Presupuesto duro por diapositiva (PLAN-v3 §5.2): pasos y tokens por llamada. */
  maxSteps?: number;
  maxTokensPerStep?: number;
  /** Aborto cooperativo (pg-boss expira el handler). */
  signal?: AbortSignal;
};

export type HarnessResult =
  | { ok: true; ops: WorkspaceOp[]; slide: Slide; summary: string; steps: number; calls: number }
  | { ok: false; reason: string; steps: number; calls: number };

const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1)}…`);
const json = (x: unknown, n = 2400) => clip(JSON.stringify(x), n);

export const harnessSystem = (area: string | undefined) => `Eres el editor de una diapositiva de Lámina (presentaciones didácticas${area ? `; área: ${area}` : ""}). Trabajas sobre UNA diapositiva con herramientas pequeñas; nunca reescribes el deck. Cada turno respondes SOLO un objeto JSON {"thought"?: "...", "action": {"tool": "...", "args": {...}}} y recibes la observación del resultado.

${TOOL_DOC}

REGLAS
- Cambia lo mínimo necesario para cumplir el objetivo. No toques otras diapositivas.
- Las fórmulas LaTeX, expresiones y cifras del contenido se conservan TAL CUAL; si no caben, cambia de layout o reparte el contenido, no la matemática.
- Usa solo componentes del catálogo (usa list_components si dudas) con su versión exacta y props válidas.
- Antes de done, llama validate y corrige lo que reporte. Si el objetivo no se puede cumplir, llama done con summary que lo explique y sin cambios.
- Tienes un máximo de pasos; sé directo.`;

/**
 * Bucle exterior determinista: el modelo solo actúa dentro de UNA diapositiva. Los cambios se acumulan como ops sobre una copia
 * en memoria y solo se devuelven si `done` llega con una validación limpia (todo o nada). Un JSON inválido o una herramienta
 * desconocida consumen un paso y vuelven como observación.
 */
export async function runHarness(env: HarnessEnv): Promise<HarnessResult> {
  const maxSteps = env.maxSteps ?? 8;
  let working = env.deck;
  const ops: WorkspaceOp[] = [];
  const transcript: string[] = [];
  let calls = 0;
  let step = 0;

  const slideOf = (d: DeckDocument, id = env.slideId) => d.slides.find((s) => s.id === id);
  const neighbors = (d: DeckDocument) => { const i = d.slides.findIndex((s) => s.id === env.slideId); return [d.slides[i - 1], d.slides[i + 1]].filter(Boolean).map((s) => ({ id: s!.id, layout: s!.layout, slots: Object.fromEntries(Object.entries(s!.slots).map(([k, r]) => [k, r.componentId])) })); };
  const apply = (op: WorkspaceOp): string | null => {
    const r = applyOpsPure({ deck: working, content: null }, [op]);
    if (!r.ok) return r.issues.map((i) => i.message).join("; ");
    working = r.state.deck!;
    ops.push(op);
    return null;
  };
  // Solo componentes que la cuenta puede usar (los gated por flag apagado quedan fuera), salvo los que la diapositiva ya traía.
  const offered = new Set(env.manifests.map((m) => m.id));
  const original = new Set(Object.values(slideOf(env.deck)?.slots ?? {}).map((r) => r.componentId));
  const check = (): string[] => {
    const sl = slideOf(working);
    if (!sl) return ["la diapositiva ya no existe"];
    const notOffered = Object.values(sl.slots).filter((r) => !offered.has(r.componentId) && !original.has(r.componentId)).map((r) => r.componentId);
    if (notOffered.length) return [`El componente ${[...new Set(notOffered)].join(", ")} no está disponible para esta cuenta: usa solo los de list_components.`];
    const v = validateDeckAgainstCatalog(working, env.lookup);
    const errs = v.ok ? [] : v.errors.filter((e) => e.startsWith(`slide ${env.slideId}/`) || !e.startsWith("slide "));
    if (env.hint) { const miss = missingFormulas(env.hint, sl); if (miss.length) errs.push(`Faltan fórmulas/expresiones del contenido que deben copiarse tal cual: ${miss.slice(0, 4).join(" | ")}`); }
    return errs;
  };

  const run = async (tool: ToolName, args: unknown): Promise<{ obs: string; done?: string }> => {
    switch (tool) {
      case "read_slide": {
        const a = args as { id?: string };
        const s = slideOf(working, a.id ?? env.slideId);
        if (!s) return { obs: `No existe la diapositiva «${a.id}».` };
        const own = (a.id ?? env.slideId) === env.slideId;
        return { obs: json({ slide: s, ...(own ? { problemas: env.issues, vecinas: neighbors(working) } : {}) }, 3500) };
      }
      case "read_content_section": return { obs: env.hint ? json({ intent: env.hint.intent, blocks: env.hint.blocks }, 3500) : "Esta diapositiva no tiene contenido asociado (se creó a mano)." };
      case "list_components": return { obs: clip(catalogForPrompt(env.manifests, (args as { area?: string }).area ? { area: (args as { area: string }).area as never } : {}), 6000) };
      case "edit_slot": {
        const a = args as { slot: string; component?: { componentId: string; version: string; props: Record<string, unknown> }; props?: Record<string, unknown>; unset?: string[] };
        const err = a.component
          ? apply({ op: "set_slot", slideId: env.slideId, slot: a.slot, ref: a.component })
          : apply({ op: "set_slot_props", slideId: env.slideId, slot: a.slot, props: a.props ?? {}, unset: a.unset });
        return { obs: err ? `ERROR: ${err}` : `ok: slot «${a.slot}» actualizado.` };
      }
      case "remove_slot": { const err = apply({ op: "remove_slot", slideId: env.slideId, slot: (args as { slot: string }).slot }); return { obs: err ? `ERROR: ${err}` : "ok" }; }
      case "replace_slide": {
        const sl = (args as { slide: Slide }).slide;
        const err = apply({ op: "replace_slide", slideId: env.slideId, slide: { ...sl, id: env.slideId } });
        return { obs: err ? `ERROR: ${err}` : "ok: diapositiva reemplazada." };
      }
      case "set_build": { const err = apply({ op: "set_build", slideId: env.slideId, steps: (args as { steps: { reveal: string[] }[] }).steps }); return { obs: err ? `ERROR: ${err}` : "ok" }; }
      case "search_images": {
        if (!env.images) return { obs: "Las imágenes no están disponibles para esta cuenta." };
        const r = await env.images.search((args as { query: string }).query);
        if (r === "cuota") return { obs: "Se agotó la cuota diaria de imágenes de esta cuenta: no busques más; termina sin imagen." };
        return { obs: r.length ? json(r.slice(0, 6), 1500) : "Sin resultados." };
      }
      case "use_image": {
        if (!env.images) return { obs: "Las imágenes no están disponibles para esta cuenta." };
        const a = args as { resultId: string; slot: string; alt: string };
        const got = await env.images.use(a.resultId, a.alt);
        if (!got) return { obs: "ERROR: no se pudo descargar esa imagen; prueba con otro resultado." };
        const err = apply({ op: "set_slot", slideId: env.slideId, slot: a.slot, ref: { componentId: "Image", version: "1.0.0", props: { assetId: got.assetId, alt: a.alt, fit: "cover", showCredit: false, ...(got.credit ? { credit: got.credit } : {}) } } });
        return { obs: err ? `ERROR: ${err}` : "ok: imagen colocada." };
      }
      case "validate": {
        const errs = check();
        return { obs: errs.length ? `NO VÁLIDA:\n- ${errs.slice(0, 6).join("\n- ")}` : "VÁLIDA: ya puedes llamar a done." };
      }
      case "done": {
        const errs = check();
        if (errs.length) return { obs: `No se puede cerrar, la diapositiva no es válida:\n- ${errs.slice(0, 6).join("\n- ")}` };
        return { obs: "cerrado", done: (args as { summary: string }).summary };
      }
    }
  };

  while (step < maxSteps) {
    if (env.signal?.aborted) return { ok: false, reason: "cancelado", steps: step, calls };
    step++;
    const cur = slideOf(working)!;
    const user = `OBJETIVO: ${env.goal}\n\nDIAPOSITIVA ACTUAL (id "${env.slideId}", layout "${cur.layout}"): ${json(cur, 2500)}\n${env.issues.length ? `\nPROBLEMAS AL DIBUJARLA:\n${env.issues.map((i) => `- [${i.severity}] área "${i.slot ?? "—"}": ${i.message}${i.detail ? ` (${i.detail})` : ""}`).join("\n")}\n` : ""}\n${transcript.length ? `HISTORIAL:\n${transcript.slice(-6).join("\n")}\n\n` : ""}Paso ${step} de ${maxSteps}. Responde el siguiente JSON de acción.`;
    let out;
    try {
      calls++;
      out = await env.ctx.ai.structured({ role: "design", task: "harness.step", schema: Action, presentationId: env.presentationId, maxTokens: env.maxTokensPerStep ?? 2500, temperature: 0.2, system: harnessSystem(undefined), user, fakeContext: { harness: true }, signal: env.signal });
    } catch (e) {
      if (e instanceof QuotaWaitError) return { ok: false, reason: "sin cupo de IA ahora", steps: step, calls };
      if (e instanceof LaminaError && e.code === "provider_failed") { transcript.push(`[${step}] (tu respuesta no fue un JSON de acción válido: ${clip(e.message, 160)})`); continue; }
      throw e;
    }
    const tool = out.action.tool as ToolName;
    const parsed = TOOL_ARGS[tool].safeParse(out.action.args);
    if (!parsed.success) { transcript.push(`[${step}] ${tool}: argumentos inválidos (${parsed.error.issues.slice(0, 2).map((i) => `${i.path.join(".")} ${i.message}`).join("; ")})`); continue; }
    let res;
    try { res = await run(tool, parsed.data); } catch (e) { res = { obs: `ERROR interno: ${clip((e as Error).message, 160)}` }; }
    transcript.push(`[${step}] ${tool}(${clip(JSON.stringify(parsed.data), 300)}) → ${clip(res.obs, 700)}`);
    if (res.done !== undefined) {
      const final = slideOf(working)!;
      return { ok: true, ops, slide: final, summary: res.done, steps: step, calls };
    }
  }
  return { ok: false, reason: "se agotó el presupuesto de pasos", steps: step, calls };
}
