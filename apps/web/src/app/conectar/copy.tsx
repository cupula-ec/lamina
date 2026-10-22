"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

export function CopyBox({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(value); setDone(true); toast.success("Copiado al portapapeles"); setTimeout(() => setDone(false), 2000); } catch { setDone(false); toast.error("No se pudo copiar; selecciona el texto y cópialo a mano."); }
  }
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <input readOnly aria-label={label} className="field min-w-0 flex-1 font-mono text-sm" value={value} onFocus={(e) => e.currentTarget.select()} />
      <button type="button" className="btn btn-sm" onClick={copy}>{done ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}{done ? "Copiado" : "Copiar"}</button>
    </div>
  );
}
