"use client";
import { Component, createElement, useMemo, type ReactNode } from "react";
import type { Slide } from "@lamina/contracts";
import { LAYOUTS } from "@lamina/contracts";
import { CANVAS, slotBox } from "./geometry";
import { isSlotVisible, revealCounts } from "./build";
import { ErrorCard } from "./primitives";
import { SandboxFrame } from "./SandboxFrame";
import type { ComponentCtx, Resolver } from "./types";

class Boundary extends Component<{ children: ReactNode; label: string }, { err: string | null }> {
  override state = { err: null as string | null };
  static getDerivedStateFromError(e: unknown) { return { err: e instanceof Error ? e.message : String(e) }; }
  override render() {
    return this.state.err ? createElement(ErrorCard, { kind: "render", title: `El componente ${this.props.label} falló al renderizar`, detail: this.state.err.slice(0, 160) }) : this.props.children;
  }
}

function SlotContent({ slide, slot, resolver, counts }: { slide: Slide; slot: string; resolver: Resolver; counts: Record<string, number | null> }) {
  const ref = slide.slots[slot]!;
  const box = slotBox(slide.layout, slot);
  const ctx: ComponentCtx = { layout: slide.layout, slot, width: box.w, height: box.h, revealCount: counts[slot] ?? null };
  const res = resolver(ref);
  if (!res) return createElement(ErrorCard, { kind: "missing", title: `Componente no disponible: ${ref.componentId}@${ref.version}` });
  if (res.kind === "sandboxed") {
    if (res.propsSchema) {
      const p = res.propsSchema.safeParse(ref.props);
      if (!p.success) return createElement(ErrorCard, { kind: "props", title: `Propiedades inválidas para ${ref.componentId}`, detail: p.error.issues[0]?.message });
    }
    return createElement(SandboxFrame, { bundle: res.bundle, props: ref.props, width: box.w, height: box.h, label: ref.componentId });
  }
  const parsed = res.def.propsSchema.safeParse(ref.props);
  if (!parsed.success)
    return createElement(ErrorCard, { kind: "props", title: `Propiedades inválidas para ${ref.componentId}`, detail: `${parsed.error.issues[0]?.path.join(".")}: ${parsed.error.issues[0]?.message}` });
  const C = res.def.Component;
  return createElement(Boundary, { label: ref.componentId, children: createElement(C, { props: parsed.data, ctx }) });
}

/** Un slide pintado en el canvas lógico 1920×1080 (sin escala). */
export function SlideView({ slide, resolver, step = 0, themeId }: { slide: Slide; resolver: Resolver; step?: number; themeId?: string }) {
  const counts = useMemo(() => revealCounts(slide, step), [slide, step]);
  const spec = LAYOUTS[slide.layout];
  return createElement(
    "div",
    { className: `lm-slide lm-layout-${slide.layout}`, "data-lm-slide": slide.id, "data-theme": themeId, style: { width: CANVAS.width, height: CANVAS.height } },
    spec.slots.map((s) => {
      const ref = slide.slots[s.name];
      if (!ref) return null;
      const b = slotBox(slide.layout, s.name);
      const visible = isSlotVisible(counts, s.name);
      return createElement(
        "div",
        {
          key: s.name,
          className: `lm-slot lm-slot-${s.name} ${visible ? "" : "lm-slot-hidden"}`,
          "data-lm-slot": s.name,
          "data-lm-hidden": visible ? "0" : "1",
          style: { left: b.x, top: b.y, width: b.w, height: b.h },
        },
        visible ? createElement(SlotContent, { slide, slot: s.name, resolver, counts }) : null,
      );
    }),
  );
}
