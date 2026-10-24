import { and, desc, eq, or } from "drizzle-orm";
import { z, type ZodType } from "zod";
import { ComponentManifest } from "@lamina/contracts";
import { schema } from "@lamina/db";
import { NATIVE_MANIFESTS, FLAG_GATED_COMPONENTS, jsonSchemaToZod, type CatalogLookup } from "@lamina/components";
import type { Ctx } from "./ctx";

export type ProvisionalComponent = { manifest: ComponentManifest; bundle: string; bundleHash: string; propsSchema: ZodType | undefined };

/** Componentes provisionales (scope = presentación) disponibles para esta presentación: última versión de cada uno. */
export async function loadProvisional(ctx: Ctx, presentationId: string): Promise<ProvisionalComponent[]> {
  const comps = await ctx.db.select().from(schema.components).where(or(and(eq(schema.components.scope, presentationId), eq(schema.components.status, "provisional")), and(eq(schema.components.scope, "global"), eq(schema.components.status, "stable"), eq(schema.components.runtime, "sandboxed"))));
  const out: ProvisionalComponent[] = [];
  for (const c of comps) {
    const [v] = await ctx.db.select().from(schema.componentVersions).where(eq(schema.componentVersions.componentRowId, c.id)).orderBy(desc(schema.componentVersions.createdAt)).limit(1);
    if (!v) continue;
    const m = ComponentManifest.safeParse(v.manifest);
    if (!m.success) continue;
    let propsSchema: ZodType | undefined;
    try { propsSchema = jsonSchemaToZod(m.data.propsJsonSchema); } catch { propsSchema = undefined; }
    out.push({ manifest: m.data, bundle: v.bundle, bundleHash: v.bundleHash, propsSchema });
  }
  return out;
}

export function lookupFor(prov: ProvisionalComponent[]): CatalogLookup {
  const m = new Map(prov.map((p) => [`${p.manifest.id}@${p.manifest.version}`, p]));
  return (ref) => {
    const p = m.get(`${ref.componentId}@${ref.version}`);
    return p ? { propsSchema: p.propsSchema, status: "provisional" } : undefined;
  };
}

/** Catálogo ofrecido a la IA: los componentes V3 con flag apagado quedan fuera (`enabled` = flags V3 activos para esta presentación). */
export const manifestsFor = (prov: ProvisionalComponent[], enabled: string[] = []) => [
  ...NATIVE_MANIFESTS.filter((m) => !FLAG_GATED_COMPONENTS[m.id] || enabled.includes(FLAG_GATED_COMPONENTS[m.id]!)),
  ...prov.map((p) => p.manifest),
];
void z;
