"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient, signInKeycloak } from "@/lib/auth-client";

const MSG: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "Correo o contraseña incorrectos.",
  FORBIDDEN: "Tu correo no está dado de alta o la cuenta está bloqueada. Pide acceso a un administrador.",
  signup_disabled: "Tu correo no está dado de alta en Lámina. Pide acceso a un administrador.",
  "unable_to_create_user": "Tu correo no está dado de alta en Lámina. Pide acceso a un administrador.",
  access_denied: "No se completó el inicio de sesión.",
};

export function LoginForm({ google, keycloak, initialError }: { google: boolean; keycloak: boolean; initialError?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(initialError ? (MSG[initialError] ?? "No se pudo iniciar sesión. Inténtalo de nuevo.") : null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const { error } = await authClient.signIn.email({ email: email.trim().toLowerCase(), password });
    if (error) {
      setBusy(false);
      setError(error.status === 429 ? "Demasiados intentos. Espera un minuto." : (MSG[error.code ?? ""] ?? MSG[error.message ?? ""] ?? "Correo o contraseña incorrectos."));
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <div className="mt-6 space-y-5">
      {google && (
        <button type="button" className="btn w-full" onClick={() => authClient.signIn.social({ provider: "google", callbackURL: "/dashboard", errorCallbackURL: "/login" })}>
          Continuar con Google
        </button>
      )}
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="email" className="label">Correo</label>
          <input id="email" className="field" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label htmlFor="password" className="label">Contraseña</label>
          <input id="password" className="field" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <p role="alert" className="err">{error}</p>}
        <button className="btn btn-primary w-full" disabled={busy || !email || !password}>{busy ? "Entrando…" : "Entrar"}</button>
      </form>
      {keycloak && (
        <div className="border-t-2 border-grid pt-4">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => signInKeycloak()}>
            Acceso Cúpula (equipo)
          </button>
        </div>
      )}
    </div>
  );
}
