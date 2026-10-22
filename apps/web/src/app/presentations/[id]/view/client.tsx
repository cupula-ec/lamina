"use client";
import { useEffect, useMemo, useState } from "react";
import { DeckPlayer, PresenterView } from "@lamina/engine";
import type { DeckDocument } from "@lamina/contracts";
import { makeResolver, type ProvisionalClient } from "@/lib/resolver";

const chip: React.CSSProperties = { background: "rgba(15,23,36,.82)", color: "#fff", padding: "6px 12px", borderRadius: 8, font: "500 13px system-ui" };
const kbd: React.CSSProperties = { display: "inline-block", minWidth: 20, padding: "0 5px", margin: "0 2px", textAlign: "center", border: "1px solid rgba(255,255,255,.6)", borderRadius: 4, font: "700 12px system-ui" };

export function ViewClient({ deck, prov, presenter, channelKey, preview, backHref }: { deck: DeckDocument; prov: ProvisionalClient[]; presenter: boolean; channelKey: string; preview: boolean; backHref: string | null }) {
  const resolver = useMemo(() => makeResolver(prov), [prov]);
  const [help, setHelp] = useState(true);
  useEffect(() => { const t = setTimeout(() => setHelp(false), 7000); return () => clearTimeout(t); }, []);
  if (presenter) return <PresenterView deck={deck} resolver={resolver} channelKey={channelKey} />;
  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <DeckPlayer deck={deck} resolver={resolver} channelKey={channelKey} />
      <div style={{ position: "fixed", top: 8, left: 8, display: "flex", gap: 8, alignItems: "center" }}>
        {backHref && <a href={backHref} style={{ ...chip, textDecoration: "none", minHeight: 32, display: "inline-flex", alignItems: "center" }}>← Volver</a>}
        {preview && <div role="note" style={{ background: "#ffe27a", color: "#101b2b", padding: "6px 12px", borderRadius: 8, font: "700 13px system-ui" }}>Vista previa (aún no publicada)</div>}
      </div>
      {help ? (
        <div role="status" style={{ ...chip, position: "fixed", bottom: 12, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 10, alignItems: "center" }}>
          <span><span style={kbd}>←</span><span style={kbd}>→</span> avanzar</span>
          <span><span style={kbd}>F</span> pantalla completa</span>
          {backHref && <span><span style={kbd}>P</span> notas</span>}
          <button type="button" onClick={() => setHelp(false)} aria-label="Cerrar ayuda" style={{ background: "none", border: 0, color: "#fff", cursor: "pointer", font: "700 14px system-ui", padding: 4 }}>×</button>
        </div>
      ) : (
        <button type="button" onClick={() => setHelp(true)} aria-label="Mostrar atajos de teclado" style={{ ...chip, position: "fixed", bottom: 12, right: 12, border: 0, cursor: "pointer", minWidth: 36, minHeight: 36 }}>?</button>
      )}
    </div>
  );
}
