"use client";
import { useMemo } from "react";
import { DeckPlayer, PresenterView } from "@lamina/engine";
import type { DeckDocument } from "@lamina/contracts";
import { makeResolver, type ProvisionalClient } from "@/lib/resolver";

export function ViewClient({ deck, prov, presenter, channelKey, preview }: { deck: DeckDocument; prov: ProvisionalClient[]; presenter: boolean; channelKey: string; preview: boolean }) {
  const resolver = useMemo(() => makeResolver(prov), [prov]);
  if (presenter) return <PresenterView deck={deck} resolver={resolver} channelKey={channelKey} />;
  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <DeckPlayer deck={deck} resolver={resolver} channelKey={channelKey} />
      {preview && <div role="note" style={{ position: "fixed", top: 8, left: 8, background: "#ffe27a", color: "#101b2b", padding: "4px 10px", borderRadius: 6, font: "700 13px system-ui" }}>Vista previa (aún no publicada)</div>}
      <div style={{ position: "fixed", top: 8, right: 8, background: "rgba(15,23,36,.7)", color: "#fff", padding: "4px 10px", borderRadius: 6, font: "500 12px system-ui" }}>F: pantalla completa · P: notas del presentador</div>
    </div>
  );
}
