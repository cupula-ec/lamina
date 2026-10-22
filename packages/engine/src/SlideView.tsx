"use client";
import { Component, createElement, useMemo, useState, type ReactNode } from "react";
import type { AccentId, Branding, DeckDocument, Slide } from "@lamina/contracts";
import { DEFAULT_THEME_ID, LAYOUTS, brandColorFor } from "@lamina/contracts";
import { CANVAS, adjustedBox } from "./geometry";
import { isSlotVisible, revealCounts } from "./build";
import { ErrorCard } from "./primitives";
import { SlideDecor } from "./decor";
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
  const full = adjustedBox(slide.layout, slot, slide.adjust?.[slot]);
  // fontScale: el componente se dibuja en una caja 1/s mayor y se escala s: cabe más (s<1) o se agranda (s>1) manteniendo el área.
  const s = slide.adjust?.[slot]?.fontScale ?? 1;
  const box = s === 1 ? full : { ...full, w: Math.round(full.w / s), h: Math.round(full.h / s) };
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

export type PageInfo = { n: number; total: number };

/** Propiedades de estilo de un deck para SlideView: tema, acento, marcas y semilla de la decoración (idénticas en vista previa, publicada y capturas). */
export function deckViewProps(deck: Pick<DeckDocument, "themeId" | "accent" | "meta">) {
  return { themeId: deck.themeId as string, accent: deck.accent, branding: deck.meta.branding, seed: deck.meta.title };
}

const INTERIOR_NO_FOOTER = new Set(["title", "cover-branded", "section", "closing", "full-visual"]);

/** Línea «Docente · Materia · Período · Grupo» omitiendo lo vacío. */
export function brandingLine(b?: Branding): string {
  return [b?.teacher, b?.subject, b?.period, b?.group].map((x) => x?.trim()).filter(Boolean).join(" · ");
}

function Logo({ src, alt, side }: { src: string; alt: string; side: "inst" | "personal" }) {
  const [failed, setFailed] = useState(false);
  // Si el archivo ya no existe (versión retirada, 404) no se deja un icono roto ni el texto alternativo visible.
  if (failed) return null;
  return createElement("img", { className: `lm-logo lm-logo-${side}`, src, alt, "data-lm-logo": side, decoding: "async", onError: () => setFailed(true) });
}

/** Elementos propios del layout fuera de los slots (marcas, datos del docente, pie). No participan en la detección de problemas. */
function Chrome({ layout, branding, page }: { layout: string; branding?: Branding; page?: PageInfo }) {
  const inst = branding?.institution;
  const short = inst?.short?.trim();
  if (layout === "cover-branded") {
    const line = brandingLine(branding);
    const left = inst?.logoUrl ? createElement(Logo, { src: inst.logoUrl, alt: `Logo de ${inst.name}`, side: "inst" }) : inst ? createElement("span", { className: "lm-wordmark" }, inst.name) : null;
    const right = branding?.personalLogoUrl ? createElement(Logo, { src: branding.personalLogoUrl, alt: "Logo del docente", side: "personal" }) : null;
    return createElement(
      "div",
      { className: "lm-chrome-layer" },
      left || right ? createElement("div", { className: "lm-brandbar" }, createElement("div", { className: "lm-brand-left" }, left), createElement("div", { className: "lm-brand-right" }, right)) : null,
      line ? createElement("p", { className: "lm-cover-meta" }, line) : null,
      createElement("p", { className: "lm-cover-foot" }, short || "Lámina"),
    );
  }
  if (layout === "closing") {
    return createElement("div", { className: "lm-chrome-layer" }, createElement("p", { className: "lm-closing-foot" }, createElement("strong", null, short || "Lámina"), inst ? createElement("span", null, inst.name) : null));
  }
  if (!INTERIOR_NO_FOOTER.has(layout) && (short || page)) {
    return createElement("div", { className: "lm-chrome-layer" }, createElement("p", { className: "lm-footer" }, createElement("span", null, short ?? ""), page ? createElement("span", { className: "lm-footer-n" }, `${page.n}`) : null));
  }
  return null;
}

/** Un slide pintado en el canvas lógico 1920×1080 (sin escala). */
export function SlideView({ slide, resolver, step = 0, themeId, accent, branding, seed, page }: { slide: Slide; resolver: Resolver; step?: number; themeId?: string; accent?: AccentId; branding?: Branding; seed?: string; page?: PageInfo }) {
  const counts = useMemo(() => revealCounts(slide, step), [slide, step]);
  const spec = LAYOUTS[slide.layout];
  const theme = themeId ?? DEFAULT_THEME_ID;
  const brand = brandColorFor(theme, branding?.institution?.colors?.primary); // si no contrasta con el fondo del tema, se usa el acento del tema
  return createElement(
    "div",
    { className: `lm-slide lm-layout-${slide.layout}`, "data-lm-slide": slide.id, "data-theme": theme, "data-accent": accent, style: { width: CANVAS.width, height: CANVAS.height, ...(brand ? { "--lm-brand": brand } : {}) } },
    createElement(SlideDecor, { themeId: theme, layout: slide.layout, seed: `${seed ?? ""}|${slide.id}` }),
    spec.slots.map((s) => {
      const ref = slide.slots[s.name];
      if (!ref) return null;
      const b = adjustedBox(slide.layout, s.name, slide.adjust?.[s.name]);
      const fs = slide.adjust?.[s.name]?.fontScale ?? 1;
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
        visible
          ? fs === 1
            ? createElement(SlotContent, { slide, slot: s.name, resolver, counts })
            : createElement("div", { style: { width: Math.round(b.w / fs), height: Math.round(b.h / fs), transform: `scale(${fs})`, transformOrigin: "0 0" } }, createElement(SlotContent, { slide, slot: s.name, resolver, counts }))
          : null,
      );
    }),
    createElement(Chrome, { layout: slide.layout, branding, page }),
  );
}
