"use client";
import { useEffect } from "react";
import { SandboxFrame } from "@lamina/engine";

export function ComponentPreview({ bundle, props }: { bundle: string; props: unknown }) {
  useEffect(() => {
    let ready = 0;
    const onMsg = (e: MessageEvent) => { if (e.data?.type === "lamina:mounted" || e.data?.type === "lamina:error") ready++; };
    window.addEventListener("message", onMsg);
    const t = setInterval(() => { if (ready >= 1) { clearInterval(t); setTimeout(() => ((window as unknown as { __laminaReady: boolean }).__laminaReady = true), 400); } }, 100);
    return () => { clearInterval(t); window.removeEventListener("message", onMsg); };
  }, []);
  return (
    <div data-theme="lamina-claro" className="lm-slide" style={{ width: 988, height: 750, background: "var(--lm-bg)", overflow: "hidden" }}>
      <SandboxFrame bundle={bundle} props={props} width={988} height={750} label="preview" />
    </div>
  );
}
