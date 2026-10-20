"use client";
import { SlideThumb } from "@lamina/engine";
import { nativeResolver } from "@lamina/components";
import { ENGINE_VERSION, type DeckDocument } from "@lamina/contracts";

const deck: DeckDocument = {
  schemaVersion: 1,
  engineVersion: ENGINE_VERSION,
  themeId: "lamina-claro",
  meta: { title: "La derivada", topic: "Cálculo", level: "Universidad", language: "es" },
  slides: [
    {
      id: "hero",
      layout: "split-visual",
      notes: "",
      build: { steps: [] },
      transition: "none",
      slots: {
        title: { componentId: "SectionHeader", version: "1.0.0", props: { title: "La derivada como pendiente", kicker: "Cálculo diferencial" } },
        text: { componentId: "Definition", version: "1.0.0", props: { kind: "definicion", name: "Derivada", statement: "$$f'(a)=\\lim_{h\\to 0}\\frac{f(a+h)-f(a)}{h}$$", note: "Pendiente de la tangente en $(a,f(a))$." } },
        visual: { componentId: "FunctionPlot", version: "1.0.0", props: { functions: [{ expr: "x^3/3 - x", label: "f(x) = x³/3 − x" }], xDomain: [-2.5, 2.5], yDomain: [-2, 2], points: [{ x: 1.5, fnIndex: 0, label: "a = 1,5" }], tangents: [{ fnIndex: 0, at: 1.5 }] } },
      },
    },
  ],
};

export function HeroSlide() {
  return <SlideThumb deck={deck} index={0} resolver={nativeResolver} />;
}
