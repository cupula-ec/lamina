"use client";
import { useEffect, useState } from "react";
import { nativeResolver } from "@lamina/components";
import { SlideView, deckViewProps, detectSlideIssues, waitForThemeFonts, type SlideIssue } from "@lamina/engine";
import { THEME_IDS, THEMES, type AccentId, type DeckDocument, type Slide, type StyleChoice, type ThemeId } from "@lamina/contracts";
import { ThemePicker } from "@/components/ThemePicker";

declare global { interface Window { __galleryReady?: boolean; __galleryIssues?: Record<string, SlideIssue[]> } }

function Scaled({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <div data-gallery={id} style={{ width: 960, height: 540, position: "relative", overflow: "hidden", boxShadow: "0 0 0 1px #0003" }}>
      <div style={{ transform: "scale(0.5)", transformOrigin: "top left", width: 1920, height: 1080 }}>{children}</div>
    </div>
  );
}

export function GalleryClient({ deck, components, view, themeId, accent }: { deck: DeckDocument; components: Slide[]; view: "layouts" | "components" | "picker"; themeId: ThemeId; accent: AccentId }) {
  const [style, setStyle] = useState<StyleChoice>({ themeId, accent });

  // Mide cada diapositiva con el mismo detector del renderer; el e2e y las capturas esperan __galleryReady.
  useEffect(() => {
    if (view === "picker") return;
    window.__galleryReady = false;
    let live = true;
    (async () => {
      await waitForThemeFonts(themeId);
      await Promise.all(Array.from(document.images).map((i) => i.decode().catch(() => {})));
      await new Promise((r) => setTimeout(r, 500));
      if (!live) return;
      const out: Record<string, SlideIssue[]> = {};
      document.querySelectorAll<HTMLElement>("[data-gallery]").forEach((el) => { out[el.dataset.gallery!] = detectSlideIssues(el.querySelector<HTMLElement>(".lm-slide")!); });
      window.__galleryIssues = out;
      window.__galleryReady = true;
    })();
    return () => { live = false; };
  }, [view, themeId, accent]);

  const q = (p: Record<string, string>) => `?${new URLSearchParams({ theme: themeId, accent, view, ...p }).toString()}`;
  const slides = view === "components" ? components : deck.slides;
  const props = deckViewProps(deck);

  return (
    <div style={{ padding: 24 }}>
      <header style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginRight: 12 }}>Galería: {THEMES[themeId].name}</h1>
        {(["layouts", "components", "picker"] as const).map((v) => (
          <a key={v} href={q({ view: v })} className={`btn btn-sm ${view === v ? "btn-mark" : ""}`}>{{ layouts: "Layouts", components: "Componentes", picker: "Selector de estilo" }[v]}</a>
        ))}
        <span style={{ width: 16 }} />
        {THEME_IDS.map((t) => (<a key={t} href={q({ theme: t })} className={`btn btn-sm ${t === themeId ? "btn-mark" : ""}`}>{THEMES[t].name}</a>))}
        {(["a", "b", "c"] as const).map((a) => (<a key={a} href={q({ accent: a })} className={`btn btn-sm ${a === accent ? "btn-mark" : ""}`}>Acento {a}</a>))}
      </header>

      {view === "picker" ? (
        <ThemePicker value={style} onChange={setStyle} topic="La derivada" />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, 960px)", gap: 24 }}>
          {slides.map((s, i) => (
            <Scaled key={s.id} id={view === "layouts" ? s.layout : s.id}>
              <SlideView slide={s} resolver={nativeResolver} {...props} page={{ n: i + 1, total: slides.length }} />
            </Scaled>
          ))}
        </div>
      )}
    </div>
  );
}
