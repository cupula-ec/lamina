"use client";
import { useEffect } from "react";
import Link from "next/link";
import { Brand } from "@/components/Brand";

export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <main className="mx-auto max-w-xl px-5 py-20">
      <Brand />
      <div className="sheet card-hard mt-8 p-6 sm:p-8">
        <h1 className="font-display text-2xl font-bold">Algo salió mal de nuestro lado</h1>
        <p className="mt-2 text-ink-2">No pasa nada con tu trabajo: lo que ya guardaste sigue ahí. Intenta de nuevo; si se repite, vuelve al inicio.</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" className="btn btn-primary" onClick={() => retry()}>Intentar de nuevo</button>
          <Link href="/dashboard" className="btn">Ir a mis presentaciones</Link>
        </div>
      </div>
    </main>
  );
}
