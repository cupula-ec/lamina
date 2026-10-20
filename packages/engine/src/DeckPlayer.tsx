"use client";
import { createElement as h, useCallback, useEffect, useRef, useState } from "react";
import type { DeckDocument } from "@lamina/contracts";
import { CANVAS } from "./geometry";
import { nextPos, prevPos, stepsOf } from "./build";
import { SlideView } from "./SlideView";
import type { Resolver } from "./types";

/** Slide escalado para caber en su contenedor (miniaturas, vista previa, capturas). */
export function SlideThumb({ deck, index, resolver, step = 0, className }: { deck: DeckDocument; index: number; resolver: Resolver; step?: number; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.2);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / CANVAS.width));
    ro.observe(el);
    setScale(el.clientWidth / CANVAS.width);
    return () => ro.disconnect();
  }, []);
  const slide = deck.slides[index];
  if (!slide) return null;
  return h("div", { ref: box, className: `lm-thumb ${className ?? ""}`, style: { aspectRatio: "16 / 9", position: "relative", overflow: "hidden" }, "data-theme": deck.themeId },
    h("div", { style: { position: "absolute", left: 0, top: 0, transform: `scale(${scale})`, transformOrigin: "top left", width: CANVAS.width, height: CANVAS.height } },
      h(SlideView, { slide, resolver, step, themeId: deck.themeId })));
}

type Pos = { slide: number; step: number };

export function channelName(key: string) { return `lamina:${key}`; }

export function DeckPlayer({ deck, resolver, channelKey, presenter = false, initial, onPosChange, showChrome = true }: {
  deck: DeckDocument; resolver: Resolver; channelKey?: string; presenter?: boolean; initial?: Pos; onPosChange?: (p: Pos) => void; showChrome?: boolean;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState<Pos>(initial ?? { slide: 0, step: 0 });
  const [dir, setDir] = useState<1 | -1>(1);
  const chan = useRef<BroadcastChannel | null>(null);
  const slides = deck.slides;

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const fit = () => setScale(Math.min(el.clientWidth / CANVAS.width, el.clientHeight / CANVAS.height));
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    fit();
    return () => ro.disconnect();
  }, []);

  const go = useCallback((p: Pos, d: 1 | -1) => { setDir(d); setPos(p); }, []);
  const next = useCallback(() => setPos((p) => { const n = nextPos(slides, p); setDir(1); return n; }), [slides]);
  const prev = useCallback(() => setPos((p) => { const n = prevPos(slides, p); setDir(-1); return n; }), [slides]);

  // Sincronización con la ventana del presentador.
  useEffect(() => {
    if (!channelKey || typeof BroadcastChannel === "undefined") return;
    const c = new BroadcastChannel(channelName(channelKey));
    chan.current = c;
    c.onmessage = (e) => {
      const m = e.data;
      if (m?.type === "pos" && (m.slide !== pos.slide || m.step !== pos.step)) setPos({ slide: m.slide, step: m.step });
      if (m?.type === "cmd") { if (m.cmd === "next") next(); if (m.cmd === "prev") prev(); }
      if (m?.type === "hello" && !presenter) c.postMessage({ type: "pos", ...pos });
    };
    if (presenter) c.postMessage({ type: "hello" });
    return () => c.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelKey, presenter]);
  useEffect(() => { chan.current?.postMessage({ type: "pos", ...pos }); onPosChange?.(pos); }, [pos]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input,textarea,[contenteditable]")) return;
      if (["ArrowRight", "PageDown", " ", "Enter"].includes(e.key)) { e.preventDefault(); next(); }
      else if (["ArrowLeft", "PageUp", "Backspace"].includes(e.key)) { e.preventDefault(); prev(); }
      else if (e.key === "Home") go({ slide: 0, step: 0 }, -1);
      else if (e.key === "End") go({ slide: slides.length - 1, step: stepsOf(slides[slides.length - 1]!) }, 1);
      else if (e.key === "f" || e.key === "F") { if (document.fullscreenElement) document.exitFullscreen(); else wrap.current?.parentElement?.requestFullscreen?.(); }
      else if ((e.key === "p" || e.key === "P") && channelKey && !presenter) window.open(`${location.pathname}?presenter=1${location.search.replace(/^\?/, "&")}`, "lamina-presenter", "width=1100,height=700");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, go, slides, channelKey, presenter]);

  // Gestos táctiles
  const touch = useRef<number | null>(null);
  const slide = slides[pos.slide]!;
  const total = slides.length;

  return h("div", { className: "lm-player", "data-theme": deck.themeId, "data-lm-player": "1" },
    h("div", {
      ref: wrap, className: "lm-stage", tabIndex: 0, role: "region", "aria-roledescription": "presentación", "aria-label": `${deck.meta.title}, diapositiva ${pos.slide + 1} de ${total}`,
      onTouchStart: (e: React.TouchEvent) => { touch.current = e.touches[0]!.clientX; },
      onTouchEnd: (e: React.TouchEvent) => { if (touch.current == null) return; const dx = e.changedTouches[0]!.clientX - touch.current; if (Math.abs(dx) > 50) (dx < 0 ? next : prev)(); touch.current = null; },
    },
      h("div", { className: "lm-canvas-pos", style: { width: CANVAS.width * scale, height: CANVAS.height * scale } },
        h("div", { key: slide.id, className: `lm-canvas lm-tr-${slide.transition} lm-dir-${dir}`, style: { transform: `scale(${scale})`, transformOrigin: "top left", width: CANVAS.width, height: CANVAS.height } },
          h(SlideView, { slide, resolver, step: pos.step, themeId: deck.themeId }))),
    ),
    showChrome ? h("div", { className: "lm-chrome", "aria-live": "polite" },
      h("button", { type: "button", onClick: prev, "aria-label": "Anterior", disabled: pos.slide === 0 && pos.step === 0 }, "‹"),
      h("span", null, `${pos.slide + 1} / ${total}`),
      h("button", { type: "button", onClick: next, "aria-label": "Siguiente", disabled: pos.slide === total - 1 && pos.step === stepsOf(slide) }, "›"),
    ) : null,
  );
}

/** Ventana del presentador: slide actual, siguiente, notas y cronómetro; controla la ventana principal por BroadcastChannel. */
export function PresenterView({ deck, resolver, channelKey }: { deck: DeckDocument; resolver: Resolver; channelKey: string }) {
  const [pos, setPos] = useState<Pos>({ slide: 0, step: 0 });
  const [secs, setSecs] = useState(0);
  const chan = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    const c = new BroadcastChannel(channelName(channelKey));
    chan.current = c;
    c.onmessage = (e) => { if (e.data?.type === "pos") setPos({ slide: e.data.slide, step: e.data.step }); };
    c.postMessage({ type: "hello" });
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => { c.close(); clearInterval(t); };
  }, [channelKey]);
  const cur = deck.slides[pos.slide];
  const nxt = deck.slides[pos.slide + 1];
  const mm = String(Math.floor(secs / 60)).padStart(2, "0"), ss = String(secs % 60).padStart(2, "0");
  return h("div", { className: "lm-presenter", "data-theme": deck.themeId },
    h("div", { className: "lm-presenter-main" }, cur ? h(SlideThumb, { deck, index: pos.slide, resolver, step: pos.step }) : null),
    h("aside", { className: "lm-presenter-side" },
      h("div", { className: "lm-presenter-timer" }, `${mm}:${ss}`),
      h("div", { className: "lm-presenter-next" }, h("small", null, "Siguiente"), nxt ? h(SlideThumb, { deck, index: pos.slide + 1, resolver }) : h("p", null, "Fin de la presentación")),
      h("div", { className: "lm-presenter-notes" }, h("small", null, `Notas · diapositiva ${pos.slide + 1}/${deck.slides.length}`), h("p", null, cur?.notes || "(sin notas)")),
      h("div", { className: "lm-presenter-buttons" },
        h("button", { type: "button", onClick: () => chan.current?.postMessage({ type: "cmd", cmd: "prev" }) }, "‹ Anterior"),
        h("button", { type: "button", onClick: () => chan.current?.postMessage({ type: "cmd", cmd: "next" }) }, "Siguiente ›"))));
}
