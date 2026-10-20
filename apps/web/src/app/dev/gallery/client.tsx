"use client";
import { nativeResolver } from "@lamina/components";
import { SlideView } from "@lamina/engine";

export function GalleryClient({ slides }: { slides: any[] }) {
  return (
    <div style={{ display: "grid", gap: 24, padding: 24 }}>
      {slides.map((s) => (
        <div key={s.id} data-gallery={s.id} style={{ width: 960, height: 540, position: "relative", overflow: "hidden", boxShadow: "0 0 0 1px #0003" }}>
          <div style={{ transform: "scale(0.5)", transformOrigin: "top left", width: 1920, height: 1080 }} data-theme="lamina-claro">
            <SlideView slide={s} resolver={nativeResolver} themeId="lamina-claro" />
          </div>
        </div>
      ))}
    </div>
  );
}
