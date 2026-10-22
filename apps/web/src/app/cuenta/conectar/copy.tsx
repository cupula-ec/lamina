"use client";
import { useState } from "react";

export function CopyBox({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 2000); } catch { setDone(false); }
  }
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <input readOnly aria-label={label} className="field min-w-0 flex-1 font-mono text-sm" value={value} onFocus={(e) => e.currentTarget.select()} />
      <button type="button" className="btn btn-sm" onClick={copy}>{done ? "Copiado" : "Copiar"}</button>
    </div>
  );
}
