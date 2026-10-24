import type { NativeDef, ComponentCtx } from "@lamina/engine";
import type { AreaId, ComponentManifest } from "@lamina/contracts";
import type { ComponentType } from "react";
import type { ZodType, z } from "zod";

export type CatalogEntry<P = any> = {
  def: NativeDef<P>;
  title: string;
  purpose: string;
  useCases: string[];
  constraints: string[];
  fitsSlots: string[];
  examples: { name: string; props: P }[];
  /** Áreas para las que se ofrece a la IA ("all" = todas). Solo filtra el catálogo del prompt; el componente siempre se puede renderizar. */
  areas: AreaId[] | "all";
};

export function defineComponent<S extends ZodType>(o: {
  id: string;
  version?: string;
  title: string;
  purpose: string;
  useCases: string[];
  constraints?: string[];
  fitsSlots: string[];
  schema: S;
  examples: { name: string; props: z.input<S> }[];
  areas?: AreaId[] | "all";
  Component: ComponentType<{ props: z.output<S>; ctx: ComponentCtx }>;
}): CatalogEntry<z.output<S>> {
  return {
    def: { id: o.id, version: o.version ?? "1.0.0", propsSchema: o.schema as unknown as ZodType<z.output<S>>, Component: o.Component },
    title: o.title,
    purpose: o.purpose,
    useCases: o.useCases,
    constraints: o.constraints ?? [],
    fitsSlots: o.fitsSlots,
    examples: o.examples as { name: string; props: z.output<S> }[],
    areas: o.areas ?? "all",
  };
}

export type { ComponentManifest };
