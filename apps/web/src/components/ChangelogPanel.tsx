"use client";
import { useState } from "react";
import { Md } from "@lamina/engine";
import { markChangelogSeenAction } from "@/actions/account";

type Entry = { date: string; title: string; body: string };

export function ChangelogPanel({ entries, unread }: { entries: Entry[]; unread: boolean }) {
  const [isUnread, setUnread] = useState(unread);
  if (!entries.length) return null;
  const fmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("es-EC", { day: "numeric", month: "long", year: "numeric" });
  return (
    <details className="sheet" onToggle={(e) => { if ((e.target as HTMLDetailsElement).open && isUnread) { setUnread(false); void markChangelogSeenAction(); } }}>
      <summary className="flex cursor-pointer items-center justify-between gap-3 px-5 py-3 font-bold">
        <span>Novedades</span>
        {isUnread && <span className="tag tag-info" aria-label="Hay novedades sin leer">Nuevo</span>}
      </summary>
      <div className="space-y-6 border-t-2 border-ink px-5 py-4">
        {entries.slice(0, 5).map((e) => (
          <article key={e.date + e.title}>
            <h3 className="text-lg font-bold">{e.title}</h3>
            <p className="hint">{fmt(e.date)}</p>
            <div className="mt-2 max-w-[68ch] text-[0.97rem] [&_li]:ml-5 [&_li]:list-disc [&_li]:my-1"><Md>{e.body}</Md></div>
          </article>
        ))}
      </div>
    </details>
  );
}
