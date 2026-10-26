"use server";
import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { LaminaError } from "@lamina/contracts";
import { schema } from "@lamina/db";
import { getDb } from "@/lib/db";
import { fetchCommunityComponent, openComponentPr } from "@/lib/github";
import { createHash } from "node:crypto";
import { ComponentManifest } from "@lamina/contracts";
import { jsonSchemaToZod } from "@lamina/components";
import { checkComponentSource, sandboxBuild } from "@lamina/sandbox-kit";
import { requireAdminApi } from "@/lib/session";
import type { Result } from "@/lib/guard";

async function adm<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try { await requireAdminApi(); return { ok: true, data: await fn() }; }
  catch (e) { if (e instanceof LaminaError) return { ok: false, error: e.message }; console.error("[components]", e); return { ok: false, error: "Error inesperado" }; }
}

/** Provisional → estable: instantáneo y versionado en BD; además abre un PR con el código. El PR es "mejor esfuerzo". */
export async function promoteComponentAction(input: { id: string }) {
  return adm(async () => {
    const db = getDb();
    const [c] = await db.select().from(schema.components).where(eq(schema.components.id, input.id));
    if (!c || c.status !== "provisional") throw new LaminaError("invalid_transition", "Solo se promueven componentes provisionales", 409);
    const [v] = await db.select().from(schema.componentVersions).where(eq(schema.componentVersions.componentRowId, c.id)).orderBy(desc(schema.componentVersions.createdAt)).limit(1);
    if (!v) throw new LaminaError("not_found", "El componente no tiene versiones", 404);
    const [clash] = await db.select().from(schema.components).where(and(eq(schema.components.scope, "global"), eq(schema.components.componentId, c.componentId)));
    if (clash) throw new LaminaError("invalid_transition", `Ya existe un componente estable llamado ${c.componentId}`, 409);
    const manifest = { ...(v.manifest as object), status: "stable", scope: "global" };
    await db.update(schema.componentVersions).set({ manifest }).where(eq(schema.componentVersions.id, v.id));
    await db.update(schema.components).set({ status: "stable", scope: "global", presentationId: null }).where(eq(schema.components.id, c.id));
    let prUrl: string | null = null, prError: string | null = null;
    try {
      prUrl = await openComponentPr({
        id: c.componentId, version: v.version, purpose: c.purpose,
        files: { "component.tsx": v.source, "manifest.json": JSON.stringify(manifest, null, 2), "fixtures.json": JSON.stringify((v.manifest as { examples?: unknown }).examples ?? [], null, 2) },
      });
      await db.update(schema.components).set({ prUrl }).where(eq(schema.components.id, c.id));
    } catch (e) { prError = (e as Error).message; }
    revalidatePath("/admin");
    return { prUrl, prError };
  });
}

export async function rejectComponentAction(input: { id: string }) {
  return adm(async () => {
    const [c] = await getDb().select().from(schema.components).where(eq(schema.components.id, input.id));
    if (!c || c.status !== "provisional") throw new LaminaError("invalid_transition", "Solo se rechazan componentes provisionales", 409);
    await getDb().update(schema.components).set({ status: "rejected" }).where(eq(schema.components.id, c.id));
    revalidatePath("/admin");
    return {};
  });
}

const bumpPatch = (v: string) => { const [a = "1", b = "0", c = "0"] = v.split("."); return `${a}.${b}.${Number(c) + 1}`; };

/**
 * Actualiza un componente ESTABLE con el código vigente de `community/components/<Id>/` en main (p. ej. tras mejorar el PR y fusionarlo):
 * lo pasa por las mismas comprobaciones que un componente nuevo (AST, props vs. fixtures, sandbox con hash verificado) y crea una versión
 * nueva (patch+1). Lámina usa siempre la versión más reciente, así que surte efecto en las próximas renderizaciones. No cambia el estado.
 */
export async function syncCommunityComponentAction(input: { id: string }) {
  return adm(async () => {
    const db = getDb();
    const [c] = await db.select().from(schema.components).where(eq(schema.components.id, input.id));
    if (!c || c.status !== "stable") throw new LaminaError("invalid_transition", "Solo se sincronizan componentes estables", 409);
    const [latest] = await db.select().from(schema.componentVersions).where(eq(schema.componentVersions.componentRowId, c.id)).orderBy(desc(schema.componentVersions.createdAt)).limit(1);
    if (!latest) throw new LaminaError("not_found", "El componente no tiene versiones", 404);

    let files: Awaited<ReturnType<typeof fetchCommunityComponent>>;
    try { files = await fetchCommunityComponent(c.componentId); }
    catch (e) { throw new LaminaError("not_found", `No se pudo leer el repositorio: ${(e as Error).message}`, 404); }
    const source = files["component.tsx"];
    if (source === latest.source) return { version: latest.version, changed: false };

    let fixtures: Record<string, unknown>[];
    let repoManifest: ComponentManifest;
    try {
      fixtures = (JSON.parse(files["fixtures.json"]) as { props: Record<string, unknown> }[]).map((f) => f.props);
      repoManifest = ComponentManifest.parse(JSON.parse(files["manifest.json"]));
    } catch (e) { throw new LaminaError("invalid_input", `manifest.json / fixtures.json inválidos: ${(e as Error).message.slice(0, 200)}`, 422); }
    if (repoManifest.id !== c.componentId) throw new LaminaError("invalid_input", `El manifest es de ${repoManifest.id}, no de ${c.componentId}`, 422);

    const errs = checkComponentSource(source).slice(0, 5).map((i) => `L${i.line}: ${i.message}`);
    try {
      const z = jsonSchemaToZod(repoManifest.propsJsonSchema);
      fixtures.forEach((f, i) => { const r = z.safeParse(f); if (!r.success) errs.push(`fixture ${i + 1}: ${r.error.issues[0]?.path.join(".")} ${r.error.issues[0]?.message}`); });
    } catch (e) { errs.push(`propsJsonSchema no usable: ${(e as Error).message}`); }
    if (errs.length) throw new LaminaError("invalid_input", `Rechazado antes de construir: ${errs.join(" | ")}`, 422);

    const url = process.env.SANDBOX_URL, token = process.env.SANDBOX_TOKEN;
    if (!url || !token) throw new LaminaError("internal", "El sandbox no está configurado en el servidor web (SANDBOX_URL / SANDBOX_TOKEN)", 503);
    const r = await sandboxBuild(url, token, { id: c.componentId, source, fixtures, size: { width: 988, height: 750 } });
    if (!(r.ok && r.bundle && r.bundleHash && createHash("sha256").update(r.bundle).digest("hex") === r.bundleHash)) {
      throw new LaminaError("invalid_input", `No pasó la construcción: ${r.checks.filter((k) => !k.ok).map((k) => `${k.name}${k.detail ? ` (${k.detail})` : ""}`).slice(0, 5).join(" | ") || "error"}`, 422);
    }

    const version = bumpPatch(latest.version);
    const manifest = ComponentManifest.parse({ ...repoManifest, version, status: c.status, scope: c.scope, runtime: "sandboxed", bundleHash: r.bundleHash });
    await db.insert(schema.componentVersions).values({ componentRowId: c.id, version, source, bundle: r.bundle, bundleHash: r.bundleHash, manifest, testResults: { ok: true, checks: r.checks }, screenshots: [] });
    await db.update(schema.components).set({ purpose: manifest.purpose }).where(eq(schema.components.id, c.id));
    await db.insert(schema.events).values({ name: "component_synced", data: { id: c.componentId, version } });
    revalidatePath("/admin");
    return { version, changed: true };
  });
}
