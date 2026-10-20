"use client";
import { createElement, useEffect, useMemo, useRef } from "react";

export const SANDBOX_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:";

/** Documento del iframe: CSP estricta, bundle IIFE inline y props por postMessage. */
export function sandboxSrcdoc(bundle: string): string {
  const safeBundle = bundle.replace(/<\/script/gi, "<\\/script");
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${SANDBOX_CSP}">
<style>html,body{margin:0;padding:0;background:transparent;overflow:hidden;font-family:system-ui,sans-serif;color:#111}#root{width:100vw;height:100vh;overflow:hidden}</style></head>
<body><div id="root"></div><script>${safeBundle}</script>
<script>window.addEventListener("message",function(e){var d=e.data;if(!d||d.type!=="lamina:props")return;try{window.__laminaMount(document.getElementById("root"),d.props)}catch(err){parent.postMessage({type:"lamina:error",message:String(err&&err.message||err)},"*")}});parent.postMessage({type:"lamina:ready"},"*");</script></body></html>`;
}

/**
 * iframe con sandbox="allow-scripts" SIN allow-same-origin (origen opaco): sin cookies, sin storage, sin acceso al DOM
 * del padre. Mismo runtime en preview, view y Playwright.
 */
export function SandboxFrame({ bundle, props, width, height, label }: { bundle: string; props: unknown; width: number; height: number; label: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const loads = useRef(0);
  const srcDoc = useMemo(() => sandboxSrcdoc(bundle), [bundle]);
  useEffect(() => {
    const send = () => ref.current?.contentWindow?.postMessage({ type: "lamina:props", props }, "*");
    const onMsg = (e: MessageEvent) => {
      if (e.source !== ref.current?.contentWindow) return;
      if (e.data?.type === "lamina:ready") send();
      if (e.data?.type === "lamina:error" && ref.current) ref.current.dataset.laminaError = "sandbox";
    };
    window.addEventListener("message", onMsg);
    send();
    return () => window.removeEventListener("message", onMsg);
  }, [props, srcDoc]);
  return createElement("iframe", {
    ref,
    title: `Componente ${label}`,
    sandbox: "allow-scripts",
    srcDoc,
    referrerPolicy: "no-referrer",
    loading: "eager",
    className: "lm-sandbox",
    "data-lm-sandbox": label,
    onLoad: () => { loads.current++; if (loads.current > 1 && ref.current) { ref.current.dataset.laminaError = "sandbox"; ref.current.srcdoc = "<!doctype html><title>bloqueado</title>"; } },
    style: { width, height, border: 0, display: "block" },
  });
}
