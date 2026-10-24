"use client";
import { useEffect, useMemo } from "react";
import { SlideView, deckViewProps, waitForThemeFonts } from "@lamina/engine";
import type { DeckDocument } from "@lamina/contracts";
import { makeResolver, type ProvisionalClient } from "@/lib/resolver";

declare global { interface Window { __laminaReady?: boolean } }

export function PrintClient({ deck, prov }: { deck: DeckDocument; prov: ProvisionalClient[] }) {
  const resolver = useMemo(() => makeResolver(prov), [prov]);
  const sandboxCount = deck.slides.reduce((n, s) => n + Object.values(s.slots).filter((r) => prov.some((p) => p.id === r.componentId && p.version === r.version)).length, 0);

  useEffect(() => {
    let ready = 0;
    const onMsg = (e: MessageEvent) => { if (e.data?.type === "lamina:mounted" || e.data?.type === "lamina:error") ready++; };
    window.addEventListener("message", onMsg);
    const t = setInterval(async () => {
      await waitForThemeFonts(deck.themeId);
      await Promise.all(Array.from(document.images).map((i) => i.decode().catch(() => {})));
      if (Array.from(document.images).every((i) => i.complete) && ready >= sandboxCount) { clearInterval(t); setTimeout(() => { window.__laminaReady = true; }, 500); }
    }, 150);
    return () => { clearInterval(t); window.removeEventListener("message", onMsg); };
  }, [deck.themeId, sandboxCount]);

  return (
    <div data-print-deck>
      <style>{`@page { size: 1920px 1080px; margin: 0 } html, body { margin: 0; background: #fff; } [data-print-slide] { width: 1920px; height: 1080px; overflow: hidden; break-after: page; page-break-after: always; position: relative; } [data-print-slide]:last-child { break-after: auto; page-break-after: auto; } * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }`}</style>
      {deck.slides.map((slide, i) => (
        <div key={slide.id} data-print-slide={i}>
          <SlideView slide={slide} resolver={resolver} step={slide.build.steps.length} {...deckViewProps(deck)} page={{ n: i + 1, total: deck.slides.length }} />
        </div>
      ))}
    </div>
  );
}
