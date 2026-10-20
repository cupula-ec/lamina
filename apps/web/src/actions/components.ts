"use server";
import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { LaminaError } from "@lamina/contracts";
import { schema } from "@lamina/db";
import { getDb } from "@/lib/db";
import { openComponentPr } from "@/lib/github";
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
