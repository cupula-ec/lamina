"use client";
import { useState, useTransition } from "react";
import { deleteAccountAction } from "@/actions/account";

export function DeleteAccount({ email }: { email: string }) {
  const [v, setV] = useState(""); const [err, setErr] = useState<string | null>(null); const [pending, start] = useTransition();
  return (
    <form className="mt-4 max-w-sm space-y-3" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await deleteAccountAction(v); if (!r.ok) return setErr(r.error); window.location.href = "/"; }); }}>
      <label className="label text-sm" htmlFor="ce">Escribe tu correo ({email}) para confirmar</label>
      <input id="ce" className="field" value={v} onChange={(e) => setV(e.target.value)} autoComplete="off" />
      {err && <p role="alert" className="err">{err}</p>}
      <button className="btn btn-danger" disabled={pending || v.trim().toLowerCase() !== email.toLowerCase()}>Eliminar mi cuenta y mis datos</button>
    </form>
  );
}
