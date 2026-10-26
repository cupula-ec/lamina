import { desc, eq } from "drizzle-orm";
import { schema } from "@lamina/db";
import { getDb } from "@/lib/db";
import { ComponentActions, SyncComponentButton } from "./component-actions";

export async function ComponentsPanel() {
  const db = getDb();
  const rows = await db.select({ c: schema.components, p: schema.presentations.title }).from(schema.components).leftJoin(schema.presentations, eq(schema.presentations.id, schema.components.presentationId)).orderBy(desc(schema.components.createdAt));
  const out = [];
  for (const { c, p } of rows) {
    const [v] = await db.select().from(schema.componentVersions).where(eq(schema.componentVersions.componentRowId, c.id)).orderBy(desc(schema.componentVersions.createdAt)).limit(1);
    out.push({ c, p, v });
  }
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">Propuestas de componentes ({out.length})</h2>
      <p className="hint max-w-[70ch]">Los componentes nuevos nacen como «provisional» y solo existen en la presentación que los pidió. Al aprobar uno, pasa a «estable» (disponible para todos como componente aislado) y se abre un pull request con su código en el repositorio.</p>
      {out.length === 0 && <p className="sheet p-5">Aún no hay propuestas.</p>}
      {out.map(({ c, p, v }) => {
        const tests = (v?.testResults ?? {}) as { ok?: boolean; checks?: { name: string; ok: boolean; detail?: string }[] };
        return (
          <article key={c.id} className="sheet p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold">{c.componentId} <span className="font-normal text-ink-2">v{v?.version}</span></h3>
                <p className="text-sm text-ink-2">Presentación: {p ?? "—"} · <span className={`tag ${c.status === "stable" ? "tag-ok" : c.status === "provisional" ? "tag-warn" : "tag-bad"}`}>{{ stable: "Estable", provisional: "Provisional", rejected: "Rechazado", deprecated: "Obsoleto" }[c.status] ?? c.status}</span></p>
                <p className="mt-2 max-w-[70ch]">{c.purpose}</p>
                {c.prUrl && <p className="mt-1 text-sm">PR: <a className="underline" href={c.prUrl} target="_blank" rel="noreferrer noopener">{c.prUrl}</a></p>}
              </div>
              {c.status === "provisional" && <ComponentActions id={c.id} />}
              {c.status === "stable" && c.prUrl && <SyncComponentButton id={c.id} />}
            </div>
            {v && (
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div><h4 className="font-bold">Pruebas automáticas</h4><ul className="mt-1 text-sm">{(tests.checks ?? []).map((t, i) => <li key={i}>{t.ok ? "✓" : "✗"} {t.name}{t.detail ? ` — ${t.detail}` : ""}</li>)}</ul>
                  {(v.screenshots as string[]).length > 0 && <p className="mt-2 text-sm">Capturas: {(v.screenshots as string[]).length} (en el servidor)</p>}</div>
                <details><summary className="cursor-pointer font-bold">Código ({v.source.length} caracteres)</summary><pre className="mt-2 max-h-96 overflow-auto rounded bg-paper-2 p-3 text-xs">{v.source}</pre></details>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
