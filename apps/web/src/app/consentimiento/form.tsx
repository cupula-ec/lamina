"use client";
import { useState, useTransition } from "react";
import { Callout } from "@/components/ui/Callout";
import { useRouter } from "next/navigation";
import { giveConsentAction } from "@/actions/account";

export function ConsentForm({ text }: { text: string }) {
  const router = useRouter();
  const [ok, setOk] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <form className="mt-6 space-y-4" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await giveConsentAction(); if (!r.ok) return setError(r.error); router.replace("/dashboard"); router.refresh(); }); }}>
      <label className="flex items-start gap-3">
        <input type="checkbox" className="mt-1.5 h-5 w-5 accent-[var(--color-blue)]" checked={ok} onChange={(e) => setOk(e.target.checked)} />
        <span>{text}</span>
      </label>
      {error && <Callout tone="bad">{error}</Callout>}
      <button className="btn btn-primary" disabled={!ok || pending}>{pending ? "Guardando…" : "Acepto y continúo"}</button>
    </form>
  );
}
