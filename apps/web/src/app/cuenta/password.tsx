"use client";
import { useState, useTransition } from "react";
import { Callout } from "@/components/ui/Callout";
import { changePasswordAction } from "@/actions/account";

export function PasswordForm() {
  const [cur, setCur] = useState(""); const [next, setNext] = useState("");
  const [msg, setMsg] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form className="mt-4 max-w-sm space-y-3" onSubmit={(e) => { e.preventDefault(); start(async () => { setMsg(null); setErr(null); const r = await changePasswordAction({ current: cur, next }); if (!r.ok) return setErr(r.error); setMsg("Contraseña actualizada."); setCur(""); setNext(""); }); }}>
      <div><label className="label text-sm" htmlFor="c">Contraseña actual</label><input id="c" className="field" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} required /></div>
      <div><label className="label text-sm" htmlFor="n">Nueva contraseña (mínimo 10 caracteres)</label><input id="n" className="field" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} minLength={10} required /></div>
      {msg && <p role="status" className="font-bold text-ok">{msg}</p>}{err && <Callout tone="bad">{err}</Callout>}
      <button className="btn" disabled={pending}>Guardar</button>
    </form>
  );
}
