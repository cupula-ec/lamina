"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { changePasswordAction } from "@/actions/account";

export function ChangePasswordForm() {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next !== again) return setError("Las contraseñas nuevas no coinciden.");
    start(async () => {
      const r = await changePasswordAction({ current, next });
      if (!r.ok) return setError(r.error);
      router.replace("/dashboard");
      router.refresh();
    });
  }
  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      <div><label className="label" htmlFor="cur">Contraseña temporal</label><input id="cur" className="field" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} /></div>
      <div><label className="label" htmlFor="new">Nueva contraseña</label><input id="new" className="field" type="password" autoComplete="new-password" minLength={10} required value={next} onChange={(e) => setNext(e.target.value)} /></div>
      <div><label className="label" htmlFor="again">Repite la nueva contraseña</label><input id="again" className="field" type="password" autoComplete="new-password" required value={again} onChange={(e) => setAgain(e.target.value)} /></div>
      {error && <p role="alert" className="err">{error}</p>}
      <button className="btn btn-primary w-full" disabled={pending || !current || !next || !again}>{pending ? "Guardando…" : "Guardar contraseña"}</button>
    </form>
  );
}
