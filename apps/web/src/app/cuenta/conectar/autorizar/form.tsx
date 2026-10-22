"use client";
import { useState } from "react";
import { Callout } from "@/components/ui/Callout";
import { authClient } from "@/lib/auth-client";

export function ConsentForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(accept: boolean) {
    setBusy(true); setError(null);
    const { data, error } = await authClient.oauth2.consent({ accept });
    const url = (data as { url?: string } | null)?.url;
    if (error || !url) { setBusy(false); setError("No se pudo completar la autorización. Vuelve a iniciar la conexión desde tu aplicación."); return; }
    window.location.href = url;
  }

  return (
    <div className="mt-6">
      {error && <Callout tone="bad">{error}</Callout>}
      <div className="flex flex-wrap gap-3">
        <button className="btn btn-primary" disabled={busy} onClick={() => send(true)}>Autorizar</button>
        <button className="btn" disabled={busy} onClick={() => send(false)}>Cancelar</button>
      </div>
    </div>
  );
}
