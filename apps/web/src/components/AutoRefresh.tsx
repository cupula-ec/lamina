"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Refresca la página periódicamente mientras `active` (p. ej. esperando capturas del renderer). */
export function AutoRefresh({ active, everyMs = 4000 }: { active: boolean; everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(t);
  }, [active, everyMs, router]);
  return null;
}
