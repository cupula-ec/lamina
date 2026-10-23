"use client";
import { useEffect, useMemo } from "react";
import { SlideView, deckViewProps, detectSlideIssues, waitForThemeFonts } from "@lamina/engine";
import type { DeckDocument } from "@lamina/contracts";
import { makeResolver, type ProvisionalClient } from "@/lib/resolver";

declare global { interface Window { __laminaDetect?: () => unknown; __laminaReady?: boolean; __laminaMeta?: unknown } }

export function RenderClient({ deck, index, step, prov, deckHash, storedHash }: { deck: DeckDocument; index: number; step: number; prov: ProvisionalClient[]; deckHash: string; storedHash: string }) {
  const resolver = useMemo(() => makeResolver(prov), [prov]);
  const slide = deck.slides[index]!;
  const sandboxCount = Object.values(slide.slots).filter((r) => prov.some((p) => p.id === r.componentId && p.version === r.version)).length;

  useEffect(() => {
    window.__laminaMeta = { slideId: slide.id, count: deck.slides.length, deckHash, storedHash, hashOk: deckHash === storedHash };
    window.__laminaDetect = () => detectSlideIssues(document.querySelector<HTMLElement>(".lm-slide")!);
    // listo cuando las fuentes cargaron y los iframes sandbox avisaron
    let ready = 0;
    const onMsg = (e: MessageEvent) => { if (e.data?.type === "lamina:mounted" || e.data?.type === "lamina:error") ready++; };
    window.addEventListener("message", onMsg);
    const t = setInterval(async () => {
      await waitForThemeFonts(deck.themeId);
      await Promise.all(Array.from(document.images).map((i) => i.decode().catch(() => {})));
      const imgs = Array.from(document.images).every((i) => i.complete);
      if (imgs && ready >= sandboxCount) { clearInterval(t); setTimeout(() => { window.__laminaReady = true; }, 350); }
    }, 100);
    return () => { clearInterval(t); window.removeEventListener("message", onMsg); };
  }, [slide.id, deck.slides.length, deck.themeId, deckHash, storedHash, sandboxCount]);

  return (
    <div style={{ width: 1920, height: 1080, overflow: "hidden", background: "#fff" }} data-render-slide={index}>
      <SlideView slide={slide} resolver={resolver} step={step} {...deckViewProps(deck)} page={{ n: index + 1, total: deck.slides.length }} />
    </div>
  );
}
