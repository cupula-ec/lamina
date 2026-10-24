import { and, desc, eq, or } from "drizzle-orm";
import type { ZodType } from "zod";
import { ComponentManifest, type ComponentRef } from "@lamina/contracts";
import type { Db } from "@lamina/db";
import { schema } from "@lamina/db";
import { NATIVE_MANIFESTS, FLAG_GATED_COMPONENTS, jsonSchemaToZod, type CatalogLookup } from "@lamina/components";

export type Provisional = { manifest: ComponentManifest; bundleHash: string; propsSchema: ZodType | undefined };

/** Componentes provisionales ya existentes de la presentación (y sandboxed estables globales): solo sus esquemas de props; nunca código del cliente. */
export async function loadProvisional(db: Db, presentationId: string): Promise<Provisional[]> {
  const comps = await db.select().from(schema.components).where(or(
    and(eq(schema.components.scope, presentationId), eq(schema.components.status, "provisional")),
    and(eq(schema.components.scope, "global"), eq(schema.components.status, "stable"), eq(schema.components.runtime, "sandboxed")),
  ));
  const out: Provisional[] = [];
  for (const c of comps) {
    const [v] = await db.select().from(schema.componentVersions).where(eq(schema.componentVersions.componentRowId, c.id)).orderBy(desc(schema.componentVersions.createdAt)).limit(1);
    if (!v) continue;
    const m = ComponentManifest.safeParse(v.manifest);
    if (!m.success) continue;
    let propsSchema: ZodType | undefined;
    try { propsSchema = jsonSchemaToZod(m.data.propsJsonSchema); } catch { propsSchema = undefined; }
    out.push({ manifest: m.data, bundleHash: v.bundleHash, propsSchema });
  }
  return out;
}

export function lookupFor(prov: Provisional[]): CatalogLookup {
  const m = new Map(prov.map((p) => [`${p.manifest.id}@${p.manifest.version}`, p]));
  return (ref: ComponentRef) => {
    const p = m.get(`${ref.componentId}@${ref.version}`);
    return p ? { propsSchema: p.propsSchema, status: "provisional" } : undefined;
  };
}

/** Catálogo que se publica a la IA externa: componentes nativos estables (id, versión, schema de props, usos, restricciones, ejemplos). */
export function catalogDoc() {
  return NATIVE_MANIFESTS.filter((m) => !FLAG_GATED_COMPONENTS[m.id]).map((m) => ({
    id: m.id, version: m.version, title: m.title, purpose: m.purpose, useCases: m.useCases, constraints: m.constraints,
    fitsSlots: m.fitsSlots, propsJsonSchema: m.propsJsonSchema, examples: m.examples,
  }));
}
