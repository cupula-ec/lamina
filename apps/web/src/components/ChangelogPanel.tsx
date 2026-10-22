"use client";
import { useState } from "react";
import { markChangelogSeenAction } from "@/actions/account";

type Entry = { date: string; title: string; body: string };

const fmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("es-EC", { day: "numeric", month: "short", year: "numeric" });
/** «Lámina 1.2: tu marca…» → versión «1.2» y titular «Tu marca…». */
const split = (t: string) => {
  const m = t.match(/^(?:Lámina\s+)?v?(\d+(?:\.\d+)+)\s*:\s*(.+)$/i);
  const head = m ? m[2]! : t;
  return { version: m?.[1] ?? null, headline: head.charAt(0).toUpperCase() + head.slice(1) };
};
/** Viñetas del cuerpo → { título en negrita, resto } para un resumen escaneable. */
const points = (body: string) =>
  body.split("\n").filter((l) => /^\s*[-*]\s+/.test(l)).map((l) => {
    const t = l.replace(/^\s*[-*]\s+/, "");
    const m = t.match(/^\*\*(.+?)\*\*[:.]?\s*(.*)$/);
    const lead = (m ? m[1]! : t).replace(/[:.]$/, "");
    const full = (m ? m[2]! : "").replace(/[*_`]/g, "");
    const first = full.split(/[.;]\s/)[0]!.replace(/[.;]$/, ""); // solo la primera idea
    return { lead, rest: first.length > 45 ? "" : first };
  });

export function ChangelogPanel({ entries, unread }: { entries: Entry[]; unread: boolean }) {
  const [isUnread, setUnread] = useState(unread);
  const [all, setAll] = useState(false);
  if (!entries.length) return null;
  const [latest, ...older] = entries.slice(0, 6);
  const { version, headline } = split(latest!.title);
  const pts = points(latest!.body).slice(0, 4);
  const seen = () => { if (isUnread) { setUnread(false); void markChangelogSeenAction(); } };
  return (
    <section className="sheet overflow-hidden" aria-labelledby="novedades" onMouseEnter={seen} onFocus={seen}>
      <div className="flex items-center justify-between gap-2 border-b-2 border-ink bg-mark px-5 py-2">
        <h2 id="novedades" className="text-xs font-bold uppercase tracking-[0.14em]">Novedades{version ? ` · v${version}` : ""}</h2>
        <span className="text-xs font-bold">{fmt(latest!.date)}</span>
      </div>
      <div className="px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-display text-xl font-bold leading-tight">{headline}</h3>
          {isUnread && <span className="tag tag-info shrink-0" aria-label="Hay novedades sin leer">Nuevo</span>}
        </div>
        <ul className="mt-3 space-y-2.5">
          {pts.map((p) => (
            <li key={p.lead} className="grid grid-cols-[0.6rem_1fr] gap-x-3">
              <span aria-hidden className="mt-[0.45rem] h-2.5 w-2.5 border-2 border-ink bg-mark" />
              <p className="text-[0.95rem] leading-snug"><strong>{p.lead}</strong>{p.rest && <span className="text-ink-2"> · {p.rest}</span>}</p>
            </li>
          ))}
        </ul>
        {older.length > 0 && (
          <div className="mt-4 border-t-2 border-ink pt-3">
            <button type="button" className="text-sm font-bold underline underline-offset-4" aria-expanded={all} onClick={() => { setAll(!all); seen(); }}>
              {all ? "Ocultar historial" : `Ver historial (${older.length})`}
            </button>
            {all && (
              <div className="mt-3 space-y-5">
                {older.map((e) => {
                  const s = split(e.title);
                  return (
                    <article key={e.date + e.title}>
                      <p className="hint">{s.version ? `v${s.version} · ` : ""}{fmt(e.date)}</p>
                      <h4 className="font-bold">{s.headline}</h4>
                      <ul className="mt-1 space-y-1 text-[0.92rem]">
                        {points(e.body).map((p) => <li key={p.lead} className="ml-4 list-disc">{p.lead}</li>)}
                      </ul>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
