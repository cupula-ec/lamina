import Link from "next/link";

export type QuotaUse = { used: number; limit: number };

/** Aviso de cuota junto a una acción que consume IA: cuánto cuesta y cuánto queda hoy. */
export function QuotaNote({ q, what, cost = 1 }: { q?: QuotaUse; what: string; cost?: number }) {
  if (!q) return null;
  const left = Math.max(q.limit - q.used, 0);
  const out = left < cost;
  const near = !out && left <= Math.max(1, Math.ceil(q.limit * 0.2));
  return (
    <p role={out ? "alert" : "note"} className={`mt-2 text-sm ${out ? "font-bold text-pen" : near ? "font-bold text-warn" : "text-ink-2"}`}>
      {out ? `Ya no te quedan ${what} hoy (${q.used} de ${q.limit}). Se renuevan a medianoche UTC. ` : `Consume ${cost} de tus ${what} de hoy: te quedan ${left} de ${q.limit}${near ? " (cerca del límite)" : ""}. `}
      <Link href="/cuenta/uso" className="underline underline-offset-4">Ver mi uso</Link>
    </p>
  );
}
