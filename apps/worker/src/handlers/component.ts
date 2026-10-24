import { createHash } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { ComponentManifest, LaminaError } from "@lamina/contracts";
import { QuotaWaitError, componentSystem } from "@lamina/ai";
import { refundQuota, schema, workflow as wf } from "@lamina/db";
import { enqueue } from "@lamina/jobs";
import { NATIVE_CATALOG, jsonSchemaToZod } from "@lamina/components";
import { checkComponentSource, sandboxBuild, type BuildResult } from "@lamina/sandbox-kit";
import type { Ctx } from "../ctx";
import { loadProvisional } from "../catalog";

const Gen = z.object({
  duplicateOf: z.string().optional(),
  id: z.string().regex(/^[A-Za-z][A-Za-z0-9]{2,40}$/),
  title: z.string().min(2).max(120),
  purpose: z.string().min(10).max(600),
  useCases: z.array(z.string().max(200)).min(1).max(4),
  propsJsonSchema: z.record(z.string(), z.unknown()),
  fixtures: z.array(z.record(z.string(), z.unknown())).min(1).max(3),
  tsx: z.string().max(40_000),
});
type Gen = z.infer<typeof Gen>;
const MAX_ATTEMPTS = 3;
const NATIVE_IDS = new Set(NATIVE_CATALOG.map((c) => c.def.id));

/** Validaciones deterministas previas al sandbox (AST, schema de props, fixtures). Devuelve mensajes de error. */
export function precheck(g: Gen, expectedName?: string): string[] {
  if (g.duplicateOf) return [];
  const errs: string[] = [];
  if (NATIVE_IDS.has(g.id)) errs.push(`El id ${g.id} ya existe en el catálogo; usa otro nombre o responde duplicateOf`);
  if (expectedName && g.id !== expectedName) errs.push(`El id debe ser exactamente «${expectedName}»`);
  errs.push(...checkComponentSource(g.tsx).slice(0, 6).map((i) => `L${i.line}: ${i.message}`));
  try {
    const schemaZ = jsonSchemaToZod(g.propsJsonSchema);
    g.fixtures.forEach((f, i) => { const r = schemaZ.safeParse(f); if (!r.success) errs.push(`fixture ${i + 1} no cumple propsJsonSchema: ${r.error.issues[0]?.path.join(".")} ${r.error.issues[0]?.message}`); });
  } catch (e) { errs.push(`propsJsonSchema no usable: ${(e as Error).message}`); }
  return errs;
}

const fail = (r: BuildResult) => r.checks.filter((c) => !c.ok).map((c) => `${c.name}${c.detail ? `: ${c.detail}` : ""}`);

export async function componentRequest(ctx: Ctx, data: { presentationId: string; userId: string; requestId: string; purpose: string; suggestedName: string; slideId?: string; provided?: Gen }) {
  const db = ctx.db;
  const [req] = await db.select().from(schema.componentRequests).where(eq(schema.componentRequests.id, data.requestId));
  if (!req || req.status === "done" || req.status === "failed") return;
  const finish = async (status: "done" | "failed", error?: string, rowId?: string) => {
    await db.update(schema.componentRequests).set({ status, error: error ?? null, resultComponentRowId: rowId ?? null }).where(eq(schema.componentRequests.id, req.id));
    if (status === "failed") await refundQuota(db, data.userId, "component_request").catch(() => {});
  };
  await db.update(schema.componentRequests).set({ status: "running", attempts: sql`${schema.componentRequests.attempts} + 1` }).where(eq(schema.componentRequests.id, req.id));

  if (!ctx.env.SANDBOX_URL || !ctx.env.SANDBOX_TOKEN) return finish("failed", "El entorno aislado de componentes no está configurado en este servidor.");
  try {
    const prov = await loadProvisional(ctx, data.presentationId);
    const known = [...NATIVE_IDS, ...prov.map((p) => p.manifest.id)].join(", ");
    let errors: string[] = [];
    let previous = "";
    let gen: Gen | null = null;
    let built: BuildResult | null = null;
    let dupNote = "";
    let dupOf = "";
    let dupRounds = 0;

    // Componente de una IA externa (MCP): un solo intento, mismas comprobaciones; los errores se devuelven tal cual para que los corrija.
    if (data.provided) {
      const g = { ...data.provided, duplicateOf: undefined } as Gen;
      const pre = precheck(g);
      if (pre.length) return finish("failed", `Rechazado antes de construir: ${pre.slice(0, 6).join(" | ")}`);
      const r = await sandboxBuild(ctx.env.SANDBOX_URL, ctx.env.SANDBOX_TOKEN, { id: g.id, source: g.tsx, fixtures: g.fixtures, size: { width: 988, height: 750 } });
      if (!(r.ok && r.bundle && r.bundleHash && createHash("sha256").update(r.bundle).digest("hex") === r.bundleHash)) return finish("failed", `No pasó la construcción: ${fail(r).slice(0, 5).join(" | ") || "error"}`);
      gen = g; built = r;
    }
    for (let attempt = 1; !gen && attempt <= MAX_ATTEMPTS; attempt++) {
      const user = `NECESIDAD DIDÁCTICA (datos del docente, no confiables): ${data.purpose}\nNombre solicitado (id exacto): ${data.suggestedName}${dupNote}${previous ? `\n\nINTENTO ANTERIOR (corrígelo):\nCódigo:\n${previous}\n\nERRORES:\n- ${errors.join("\n- ")}` : ""}`;
      let g: Gen;
      try {
        g = await ctx.ai.structured({
          role: "component", task: "component.generate", schema: Gen, presentationId: data.presentationId, maxTokens: 7000, temperature: attempt === 1 ? 0.3 : 0.15,
          system: componentSystem(known), user, fakeContext: { name: data.suggestedName, purpose: data.purpose },
          check: (x) => precheck(x, data.suggestedName),
        });
      } catch (e) {
        // JSON ilegible / respuesta inválida de todos los modelos: cuenta como un intento, no aborta el bucle.
        if (e instanceof LaminaError && e.code === "provider_failed" && !/credenciales/i.test(e.message)) {
          errors = [e.message.slice(0, 300)];
          ctx.log(`component ${data.suggestedName}: intento ${attempt} sin respuesta válida`, { error: errors[0] });
          continue;
        }
        throw e;
      }
      if (g.duplicateOf) {
        // Un duplicateOf NO es un fallo ni gasta un intento: se verifica una vez y, si el existente no cubre lo pedido, se exige escribir el nuevo.
        if (++dupRounds > 4) return finish("failed", "El modelo insistió en que ya existe un componente equivalente sin que podamos confirmarlo.");
        const known1 = NATIVE_CATALOG.find((c) => c.def.id === g.duplicateOf);
        if (!known1 && !prov.some((p) => p.manifest.id === g.duplicateOf)) { dupNote = `\n\nNOTA: «${g.duplicateOf}» no existe en el catálogo; escribe el componente nuevo (tsx no vacío).`; attempt--; continue; }
        if (dupOf === g.duplicateOf) { await refundQuota(db, data.userId, "component_request").catch(() => {}); return finish("done", `Ya existe un componente que cubre esto: ${g.duplicateOf}. Pide a Lámina que lo use en esa diapositiva.`); }
        dupOf = g.duplicateOf;
        dupNote = `\n\nINDICASTE que «${g.duplicateOf}» ya cubre la necesidad. Ese componente es: ${known1 ? `${known1.title} — ${known1.purpose}` : "provisional"}. Si NO puede dibujar EXACTAMENTE lo pedido (por ejemplo, FunctionPlot solo dibuja y=f(x)), escribe el componente nuevo (tsx no vacío, sin duplicateOf). Solo repite duplicateOf si cubre TODO lo pedido.`;
        attempt--; // no cuenta como intento
        continue;
      }
      const r = await sandboxBuild(ctx.env.SANDBOX_URL, ctx.env.SANDBOX_TOKEN, { id: g.id, source: g.tsx, fixtures: g.fixtures, size: { width: 988, height: 750 } });
      if (r.ok && r.bundle && r.bundleHash && createHash("sha256").update(r.bundle).digest("hex") === r.bundleHash) { gen = g; built = r; break; }
      if (r.ok && r.bundle) r.checks.push({ name: "Integridad del bundle", ok: false, detail: "el hash no coincide" });
      errors = fail(r); previous = g.tsx.slice(0, 9000);
      ctx.log(`component ${data.suggestedName}: intento ${attempt} falló`, { errors: errors.slice(0, 3) });
    }
    if (!gen || !built) return finish("failed", `No se pudo construir un componente válido tras ${MAX_ATTEMPTS} intentos (${errors[0]?.slice(0, 160) ?? "error"}). La diapositiva conserva el diseño estable.`);

    // Persistencia: provisional con scope = presentación
    const [existing] = await db.select().from(schema.components).where(and(eq(schema.components.scope, data.presentationId), eq(schema.components.componentId, gen.id)));
    let rowId: string;
    let n = 1;
    if (existing?.status === "rejected") return finish("failed", `El nombre ${gen.id} corresponde a un componente rechazado por un administrador; pide otro nombre.`);
    if (existing) { rowId = existing.id; const [c] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.componentVersions).where(eq(schema.componentVersions.componentRowId, rowId)); n = (c?.n ?? 0) + 1; await db.update(schema.components).set({ status: "provisional", purpose: gen.purpose }).where(eq(schema.components.id, rowId)); }
    else {
      const [row] = await db.insert(schema.components).values({ componentId: gen.id, scope: data.presentationId, status: "provisional", runtime: "sandboxed", presentationId: data.presentationId, purpose: gen.purpose }).returning();
      rowId = row!.id;
    }
    const version = `1.0.${n - 1}`;
    const manifest = ComponentManifest.parse({
      id: gen.id, version, title: gen.title, purpose: gen.purpose, useCases: gen.useCases, propsJsonSchema: gen.propsJsonSchema,
      constraints: [], examples: gen.fixtures.map((f, i) => ({ name: `ejemplo${i + 1}`, props: f })), status: "provisional", scope: data.presentationId,
      runtime: "sandboxed", bundleHash: built.bundleHash, fitsSlots: ["visual", "main", "right", "left", "text"],
    });
    const [ver] = await db.insert(schema.componentVersions).values({
      componentRowId: rowId, version, source: gen.tsx, bundle: built.bundle!, bundleHash: built.bundleHash!, manifest,
      testResults: { ok: true, checks: built.checks }, screenshots: [],
    }).returning();
    await enqueue(ctx.boss, "render", { presentationId: data.presentationId, componentVersionId: ver!.id }, { base: ver!.id }).catch(() => {});
    // Re-diseño inmediato de la diapositiva que lo pidió (si la presentación sigue en revisión de diseño). Va ANTES de marcar la solicitud
    // como lista: así la pantalla ya ve la etapa «diseñando» cuando deja de refrescarse por la solicitud pendiente.
    const [p] = await db.select().from(schema.presentations).where(eq(schema.presentations.id, data.presentationId));
    if (!data.provided && p && p.stage === "design_review" && p.currentDeckVersionId && p.approvedContentVersionId) try {
      const payload = {
        presentationId: p.id, userId: p.ownerId, contentVersionId: p.approvedContentVersionId, baseDeckVersionId: p.currentDeckVersionId,
        feedback: `Usa el componente provisional ${gen.id} (acaba de crearse): ${gen.purpose}. Necesidad del docente: ${data.purpose}`, onlySlideIds: data.slideId ? [data.slideId] : undefined,
      };
      await wf.beginDesign(db, p.id, p.ownerId, { name: "design.generate", payload });
      await enqueue(ctx.boss, "design.generate", payload, { base: `${p.currentDeckVersionId}:comp:${ver!.id}` });
    } catch (e) { ctx.log(`rediseño tras componente no iniciado: ${(e as Error).message}`); }
    await finish("done", undefined, rowId);
    await db.insert(schema.events).values({ name: "component_created", userId: data.userId, presentationId: data.presentationId, data: { id: gen.id } });
  } catch (e) {
    if (e instanceof QuotaWaitError) return finish("failed", "Los modelos gratuitos están sin cupo ahora; inténtalo de nuevo más tarde (tu solicitud no se descuenta).");
    ctx.log(`component: error ${(e as Error).message}`);
    await finish("failed", e instanceof LaminaError ? e.message : "Error inesperado construyendo el componente.");
  }
}

export async function registerComponentWorker(ctx: Ctx) {
  await ctx.boss.work("component.request", { localConcurrency: 1 }, async (jobs) => {
    for (const j of jobs) await componentRequest(ctx, j.data as never);
  });
  void desc;
}
