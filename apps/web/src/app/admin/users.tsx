"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { banUserAction, createTeacherAction, deleteUserAction, resetTeacherPasswordAction, setQuotaAction } from "@/actions/admin";

type U = { id: string; email: string; name: string; role: string; banned: boolean; mustChange: boolean; consent: boolean; quotas: Record<string, number>; presentations: number; createdAt: string };
const QL: Record<string, string> = { presentation_new: "Presentaciones nuevas/día", content_regen: "Regen. contenido/día", design_regen: "Regen. diseño/día", component_request: "Componentes/día", ocr_vision_page: "Páginas OCR con visión/día", mcp_call: "Llamadas MCP/día", mcp_submit: "Envíos MCP/día" };

export function UsersPanel({ users, defaults }: { users: U[]; defaults: Record<string, number> }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [open, setOpen] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string; data?: any }>, ok: (d: any) => string) => start(async () => { setErr(null); setMsg(null); const r = await fn(); if (!r.ok) return setErr(r.error ?? "Error"); setMsg(ok(r.data)); router.refresh(); });

  return (
    <div className="space-y-8">
      <section className="sheet p-5" aria-labelledby="alta">
        <h2 id="alta" className="text-xl font-bold">Dar de alta a un docente</h2>
        <p className="hint mt-1">Se genera una contraseña temporal y se envía por correo. Deberá cambiarla en su primer ingreso. También podrá entrar con Google si usa ese correo.</p>
        <form className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]" onSubmit={(e) => { e.preventDefault(); run(() => createTeacherAction({ email, name }), (d) => d.mailed ? `Alta creada y correo enviado a ${email}.` : `Alta creada, pero el correo FALLÓ. Entrega esta contraseña temporal por otro medio: ${d.tempPassword}`); setEmail(""); setName(""); }}>
          <div><label className="label text-sm" htmlFor="ne">Correo</label><input id="ne" className="field" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div><label className="label text-sm" htmlFor="nn">Nombre</label><input id="nn" className="field" required value={name} onChange={(e) => setName(e.target.value)} /></div>
          <button className="btn btn-primary self-end" disabled={pending}>Crear y enviar correo</button>
        </form>
        {msg && <p role="status" className="mt-3 font-bold text-ok">{msg}</p>}
        {err && <p role="alert" className="err mt-3">{err}</p>}
      </section>

      <section aria-labelledby="lista">
        <h2 id="lista" className="text-xl font-bold">Usuarios ({users.length})</h2>
        <ul className="sheet mt-3 divide-y-2 divide-ink/15">
          {users.map((u) => (
            <li key={u.id} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-bold">{u.name} <span className="font-normal text-ink-2">· {u.email}</span></p>
                  <p className="mt-1 flex flex-wrap gap-2 text-xs">
                    <span className={`tag ${u.role === "admin" ? "tag-info" : "tag-mute"}`}>{u.role === "admin" ? "Admin" : "Docente"}</span>
                    {u.banned && <span className="tag tag-bad">Bloqueado</span>}
                    {u.mustChange && <span className="tag tag-warn">Aún con contraseña temporal</span>}
                    {!u.consent && <span className="tag tag-mute">Sin consentimiento</span>}
                    <span className="tag tag-mute">{u.presentations} presentaciones</span>
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className="btn btn-sm" onClick={() => setOpen(open === u.id ? null : u.id)} aria-expanded={open === u.id}>Cuotas</button>
                  {u.role !== "admin" && <>
                    <button className="btn btn-sm" disabled={pending} onClick={() => run(() => resetTeacherPasswordAction({ userId: u.id }), (d) => d.mailed ? "Contraseña temporal reenviada." : `Correo FALLÓ. Contraseña temporal: ${d.tempPassword}`)}>Restablecer clave</button>
                    <button className={`btn btn-sm ${u.banned ? "" : "btn-danger"}`} disabled={pending} onClick={() => run(() => banUserAction({ userId: u.id, ban: !u.banned }), () => (u.banned ? "Usuario desbloqueado." : "Usuario bloqueado."))}>{u.banned ? "Desbloquear" : "Bloquear"}</button>
                    <button className="btn btn-sm btn-danger" disabled={pending} onClick={() => { const c = prompt(`Para eliminar a ${u.email} y todos sus datos, escribe su correo:`); if (c) run(() => deleteUserAction({ userId: u.id, confirmEmail: c }), () => "Usuario eliminado."); }}>Eliminar</button>
                  </>}
                </div>
              </div>
              {open === u.id && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {Object.entries(defaults).map(([k, d]) => (
                    <label key={k} className="block text-sm"><span className="label text-sm">{QL[k]}</span>
                      <input className="field !min-h-9" type="number" min={0} max={1000} defaultValue={u.quotas[k] ?? d} onBlur={(e) => { const v = Number(e.target.value); if (v !== (u.quotas[k] ?? d)) run(() => setQuotaAction({ userId: u.id, kind: k, limit: v === d ? null : v }), () => "Cuota actualizada."); }} />
                      <span className="hint">Por defecto: {d}</span>
                    </label>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
