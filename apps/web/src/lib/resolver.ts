import { jsonSchemaToZod, nativeResolver } from "@lamina/components";
import type { Resolver } from "@lamina/engine";

export type ProvisionalClient = { id: string; version: string; bundle: string; bundleHash: string; propsJsonSchema: Record<string, unknown> };

/** Resolver del engine: catálogo nativo estable + componentes provisionales (sandboxed) fijados para esta presentación. */
export function makeResolver(prov: ProvisionalClient[]): Resolver {
  const map = new Map(prov.map((p) => {
    let propsSchema;
    try { propsSchema = jsonSchemaToZod(p.propsJsonSchema); } catch { propsSchema = undefined; }
    return [`${p.id}@${p.version}`, { kind: "sandboxed" as const, bundle: p.bundle, bundleHash: p.bundleHash, propsSchema }] as const;
  }));
  return (ref) => nativeResolver(ref) ?? map.get(`${ref.componentId}@${ref.version}`);
}
