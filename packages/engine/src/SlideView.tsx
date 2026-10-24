"use client";
import { Component, createElement, useMemo, useState, type ReactNode } from "react";
import type { DeckMotion } from "@lamina/contracts";
import type { AccentId, Branding, DeckDocument, LogoSpec, Slide } from "@lamina/contracts";
import { DEFAULT_THEME_ID, LAYOUTS, MOTION_SPECS, brandColorFor, institutionalAccents, logoZone, withLogoZone, type LogoZone } from "@lamina/contracts";
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

function SlotContent({ slide, slot, resolver, counts, zone }: { slide: Slide; slot: string; resolver: Resolver; counts: Record<string, number | null>; zone: LogoZone | null }) {
  const ref = slide.slots[slot]!;
  const full = withLogoZone(adjustedBox(slide.layout, slot, slide.adjust?.[slot]), slot, zone);
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
  return { themeId: deck.themeId as string, accent: deck.accent, branding: deck.meta.branding, logo: deck.meta.logo, motion: deck.meta.motion, seed: deck.meta.title };
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

/** Logos de la diapositiva interior en la esquina elegida (zona reservada: ver `logoZone`). */
function CornerLogos({ zone, logo, branding }: { zone: LogoZone; logo: LogoSpec; branding?: Branding }) {
  const which = logo.which ?? "both";
  const inst = branding?.institution;
  const items = [
    which !== "personal" && inst?.logoUrl ? createElement(Logo, { key: "i", src: inst.logoUrl, alt: `Logo de ${inst.name}`, side: "inst" }) : null,
    which !== "institution" && branding?.personalLogoUrl ? createElement(Logo, { key: "p", src: branding.personalLogoUrl, alt: "Logo del docente", side: "personal" }) : null,
  ];
  return createElement("div", { className: `lm-corner-logos lm-corner-${zone.corner}`, style: { "--lm-corner-h": `${zone.height}px` } as React.CSSProperties, "data-lm-corner-logos": zone.corner }, items);
}

/** Elementos propios del layout fuera de los slots (marcas, datos del docente, pie). No participan en la detección de problemas. */
function Chrome({ layout, branding, page, logo, zone }: { layout: string; branding?: Branding; page?: PageInfo; logo?: LogoSpec; zone: LogoZone | null }) {
  const inst = branding?.institution;
  const short = inst?.short?.trim();
  const v3 = !!logo; // con `meta.logo` (deck v2) el logo real sustituye al texto de sigla en el pie y la portada lo muestra grande
  const which = logo?.which ?? "both";
  if (layout === "cover-branded") {
    const line = brandingLine(branding);
    const showInst = !v3 || which !== "personal";
    const showPersonal = !v3 || which !== "institution";
    const left = !showInst ? null : inst?.logoUrl ? createElement(Logo, { src: inst.logoUrl, alt: `Logo de ${inst.name}`, side: "inst" }) : inst ? createElement("span", { className: "lm-wordmark" }, inst.name) : null;
    const right = showPersonal && branding?.personalLogoUrl ? createElement(Logo, { src: branding.personalLogoUrl, alt: "Logo del docente", side: "personal" }) : null;
    return createElement(
      "div",
      { className: `lm-chrome-layer${v3 ? " lm-cover-v3" : ""}` },
      left || right ? createElement("div", { className: "lm-brandbar" }, createElement("div", { className: "lm-brand-left" }, left), createElement("div", { className: "lm-brand-right" }, right)) : null,
      line ? createElement("p", { className: "lm-cover-meta" }, line) : null,
      v3 && inst?.logoUrl && showInst ? null : createElement("p", { className: "lm-cover-foot" }, short || "Lámina"),
    );
  }
  const corner = zone ? createElement(CornerLogos, { zone, logo: logo!, branding }) : null;
  if (layout === "closing") {
    return createElement("div", { className: "lm-chrome-layer" }, corner, createElement("p", { className: "lm-closing-foot" }, createElement("strong", null, short || "Lámina"), inst ? createElement("span", null, inst.name) : null));
  }
  if (!INTERIOR_NO_FOOTER.has(layout) && (short || page)) {
    // Logo en una esquina inferior: ocupa el lugar de la sigla y el número de página pasa al lado opuesto.
    const bottom = zone && (zone.corner === "bl" || zone.corner === "br");
    return createElement("div", { className: "lm-chrome-layer" }, corner, bottom
      ? (page ? createElement("p", { className: `lm-footer lm-footer-solo lm-footer-${zone.corner === "bl" ? "right" : "left"}` }, createElement("span", { className: "lm-footer-n" }, `${page.n}`)) : null)
      : createElement("p", { className: "lm-footer" }, createElement("span", null, short ?? ""), page ? createElement("span", { className: "lm-footer-n" }, `${page.n}`) : null));
  }
  return corner ? createElement("div", { className: "lm-chrome-layer" }, corner) : null;
}

/** Un slide pintado en el canvas lógico 1920×1080 (sin escala). */
export function SlideView({ slide, resolver, step = 0, themeId, accent, branding, logo, motion, seed, page }: { slide: Slide; resolver: Resolver; step?: number; themeId?: string; accent?: AccentId; branding?: Branding; logo?: LogoSpec; motion?: DeckMotion; seed?: string; page?: PageInfo }) {
  const counts = useMemo(() => revealCounts(slide, step), [slide, step]);
  const zone = slide.layout === "title" || slide.layout === "cover-branded" ? null : logoZone(logo, { institution: !!branding?.institution?.logoUrl, personal: !!branding?.personalLogoUrl });
  const spec = LAYOUTS[slide.layout];
  const theme = themeId ?? DEFAULT_THEME_ID;
  const brand = brandColorFor(theme, branding?.institution?.colors?.primary); // si no contrasta con el fondo del tema, se usa el acento del tema
  // Tema institucional-marca: acentos derivados de los colores de la institución, ya ajustados en OKLCH para que contrasten (V3 §5.7).
  // Motion V3: solo con un preset en el deck (ausente o "none" = animaciones v2). Cada elemento entra con un desfase por orden de aparición.
  const mspec = motion && motion !== "none" ? MOTION_SPECS[motion] : null;
  const stagger = !!mspec && slide.motion?.enter !== "none";
  let order = 0;
  const inst = theme === "institucional-marca" ? institutionalAccents(branding?.institution?.colors?.primary, branding?.institution?.colors?.secondary) : null;
  return createElement(
    "div",
    { className: `lm-slide lm-layout-${slide.layout}`, "data-lm-slide": slide.id, "data-theme": theme, "data-accent": accent, ...(mspec ? { "data-motion": stagger ? motion : "static" } : {}), style: { width: CANVAS.width, height: CANVAS.height, ...(mspec ? { "--lm-m-enter": `${mspec.enterMs}ms`, "--lm-m-stagger": `${mspec.staggerMs}ms`, "--lm-m-dist": `${mspec.distancePx}px`, "--lm-m-ease": mspec.ease, "--lm-m-draw": `${mspec.drawMs}ms` } : {}), ...(brand ? { "--lm-brand": brand } : {}), ...(inst ? { "--lm-accent": inst.accent, "--lm-accent2": inst.accent2 } : {}) } },
    createElement(SlideDecor, { themeId: theme, layout: slide.layout, seed: `${seed ?? ""}|${slide.id}` }),
    spec.slots.map((s) => {
      const ref = slide.slots[s.name];
      if (!ref) return null;
      const b = withLogoZone(adjustedBox(slide.layout, s.name, slide.adjust?.[s.name]), s.name, zone);
      const fs = slide.adjust?.[s.name]?.fontScale ?? 1;
      const visible = isSlotVisible(counts, s.name);
      return createElement(
        "div",
        {
          key: s.name,
          className: `lm-slot lm-slot-${s.name} ${visible ? "" : "lm-slot-hidden"}`,
          "data-lm-slot": s.name,
          "data-lm-hidden": visible ? "0" : "1",
          style: { left: b.x, top: b.y, width: b.w, height: b.h, ...(stagger ? { "--lm-i": order++ } : {}), ...(ref.key ? { viewTransitionName: `lm-${ref.key}` } : {}) },
        },
        visible
          ? fs === 1
            ? createElement(SlotContent, { slide, slot: s.name, resolver, counts, zone })
            : createElement("div", { style: { width: Math.round(b.w / fs), height: Math.round(b.h / fs), transform: `scale(${fs})`, transformOrigin: "0 0" } }, createElement(SlotContent, { slide, slot: s.name, resolver, counts, zone }))
          : null,
      );
    }),
    createElement(Chrome, { layout: slide.layout, branding, page, logo, zone }),
  );
}
