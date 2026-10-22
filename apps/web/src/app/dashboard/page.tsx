import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { schema, usageFor } from "@lamina/db";
import { AppShell } from "@/components/AppShell";
import { StageTag } from "@/components/StageBar";
import { ChangelogPanel } from "@/components/ChangelogPanel";
import { getDb } from "@/lib/db";
import { loadChangelog } from "@/lib/changelog";
import { requireUser } from "@/lib/session";
import { STAGE_LABEL, nextAction, pageFor, stageTone } from "@/lib/stages";
import type { Stage } from "@lamina/contracts";

export const metadata = { title: "Mis presentaciones" };
export const dynamic = "force-dynamic";

const QL: Record<string, string> = { presentation_new: "Presentaciones nuevas", content_regen: "Regeneraciones de contenido", design_regen: "Regeneraciones de diseño", component_request: "Componentes nuevos", ocr_vision_page: "Páginas con visión (OCR)" };

export default async function Dashboard() {
  const user = await requireUser();
  const db = getDb();
  const rows = await db.select().from(schema.presentations).where(eq(schema.presentations.ownerId, user.id)).orderBy(desc(schema.presentations.updatedAt));
  const usage = await usageFor(db, user.id);
  const [prof] = await db.select().from(schema.userProfiles).where(eq(schema.userProfiles.userId, user.id));
  const log = loadChangelog();
  const unread = log.length > 0 && (!prof?.changelogSeenAt || prof.changelogSeenAt < new Date(`${log[0]!.date}T00:00:00`));

  return (
    <AppShell user={user}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Hola, {user.name.split(" ")[0]}</h1>
          <p className="mt-1 text-ink-2">{rows.length ? "Continúa donde lo dejaste o crea una nueva presentación." : "Aún no tienes presentaciones. Crea la primera: solo necesitas el tema."}</p>
        </div>
        <Link href="/presentations/new" className="btn btn-primary">Nueva presentación</Link>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-labelledby="mis">
          <h2 id="mis" className="sr-only">Presentaciones</h2>
          {rows.length === 0 ? (
            <div className="sheet p-8">
              <p className="max-w-[56ch]">Cuéntale a Lámina el tema, el nivel y qué quieres que aprendan tus estudiantes. Si tienes apuntes o un PDF, puedes subirlos. Después revisas el contenido y el diseño antes de proyectar.</p>
              <Link href="/presentations/new" className="btn btn-mark mt-5">Crear mi primera presentación</Link>
            </div>
          ) : (
            <ul className="sheet divide-y-2 divide-ink/15">
              {rows.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <Link href={pageFor(p.id, p.stage, p.pendingJob?.name)} className="block truncate text-lg font-bold underline-offset-4 hover:underline">{p.title}</Link>
                    <p className="text-sm text-ink-2">{p.level} · actualizada {p.updatedAt.toLocaleDateString("es-EC", { day: "numeric", month: "short" })}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StageTag label={STAGE_LABEL[p.stage as Stage]} tone={stageTone(p.stage)} />
                    <Link href={p.stage === "published" ? `/presentations/${p.id}/view` : pageFor(p.id, p.stage, p.pendingJob?.name)} className="btn btn-sm">{nextAction(p.stage)}</Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="space-y-6">
          <ChangelogPanel entries={log} unread={unread} />
          <section className="sheet p-5" aria-labelledby="cuota">
            <h2 id="cuota" className="font-bold">Tu uso de hoy</h2>
            <p className="hint">Se renueva a medianoche UTC (19:00 en Ecuador).</p>
            <dl className="mt-3 space-y-3">
              {Object.entries(usage).map(([k, v]) => (
                <div key={k}>
                  <dt className="flex justify-between text-sm"><span>{QL[k]}</span><span className="font-bold">{v.used}/{v.limit}</span></dt>
                  <dd className="mt-1 h-2 rounded bg-paper-2"><div className={`h-2 rounded ${v.used >= v.limit ? "bg-pen" : "bg-blue"}`} style={{ width: `${Math.min(100, (v.used / v.limit) * 100)}%` }} /></dd>
                </div>
              ))}
            </dl>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}
