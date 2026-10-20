import type { ComponentType } from "react";
import type { ZodType } from "zod";
import type { ComponentRef } from "@lamina/contracts";

/** Contexto que el engine entrega a cada componente: tamaño del slot (px del canvas 1920×1080) y estado de build. */
export type ComponentCtx = {
  layout: string;
  slot: string;
  width: number;
  height: number;
  /** Nº de pasos de build ya ocurridos que revelan este slot; `null` = sin build (todo visible). Útil para `stepwise`. */
  revealCount: number | null;
};

export type NativeDef<P = any> = {
  id: string;
  version: string;
  propsSchema: ZodType<P>;
  Component: ComponentType<{ props: P; ctx: ComponentCtx }>;
};

export type Resolved =
  | { kind: "native"; def: NativeDef }
  | { kind: "sandboxed"; bundle: string; bundleHash: string; propsSchema?: ZodType };

export type Resolver = (ref: ComponentRef) => Resolved | undefined;
