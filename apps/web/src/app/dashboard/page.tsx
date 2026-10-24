import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Plug, Plus, Sparkles } from "lucide-react";
import { schema, usageFor } from "@lamina/db";
import { AppShell } from "@/components/AppShell";
import { StageMeter, StageTag } from "@/components/StageBar";
import { ChangelogPanel } from "@/components/ChangelogPanel";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { getDb } from "@/lib/db";
import { loadChangelog } from "@/lib/changelog";
import { listConnections } from "@/lib/mcp-access";
import { requireUser } from "@/lib/session";
import { PresentationMenu } from "@/components/PresentationMenu";
import { STAGE_LABEL, nextAction, pageFor, stageTone } from "@/lib/stages";
import type { Stage } from "@lamina/contracts";

export const metadata = { title: "Mis presentaciones" };
export const dynamic = "force-dynamic";

const QL: Record<string, string> = { presentation_new: "Presentaciones nuevas", content_regen: "Regeneraciones de contenido", design_regen: "Regeneraciones de diseño", component_request: "Componentes nuevos", ocr_vision_page: "Páginas con visión (OCR)", mcp_call: "Consultas desde tu IA conectada", mcp_submit: "Envíos desde tu IA conectada", export: "Exportaciones (PDF y offline)" };
const FILTERS = [["todas", "Todas"], ["curso", "En curso"], ["publicadas", "Publicadas"]] as const;
const DONE = ["published", "private_final"];

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ f?: string; n?: string }> }) {
  const user = await requireUser();
  const { f = "todas", n } = await searchParams;
  const limit = Math.min(Math.max(Number(n) || 12, 12), 500);
  const db = getDb();
  const rows = await db.select().from(schema.presentations).where(eq(schema.presentations.ownerId, user.id)).orderBy(desc(schema.presentations.updatedAt));
  const usage = await usageFor(db, user.id);
  const [prof] = await db.select().from(schema.userProfiles).where(eq(schema.userProfiles.userId, user.id));
  const conns = await listConnections(db, user.id);
  const log = loadChangelog();
  const unread = log.length > 0 && (!prof?.changelogSeenAt || prof.changelogSeenAt < new Date(`${log[0]!.date}T00:00:00`));

  const shown = rows.filter((p) => (f === "curso" ? !DONE.includes(p.stage) : f === "publicadas" ? DONE.includes(p.stage) : true));
  const lastUse = conns.map((c) => c.lastUsedAt).filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0];
  // Solo se muestra lo que ya va por la mitad: el resto es ruido para un docente.
  const tight = Object.entries(usage).filter(([, v]) => v.limit > 0 && v.used / v.limit >= 0.5);

  return (
    <AppShell user={user}>
      <PageHeader
        title={`Hola, ${user.name.split(" ")[0]}`}
        lead={rows.length ? "Continúa donde lo dejaste o crea una nueva presentación." : "Aún no tienes presentaciones. Crea la primera: solo necesitas el tema."}
        actions={<Link href="/presentations/new" className="btn btn-primary"><Plus size={18} aria-hidden />Nueva presentación</Link>}
      />

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <section aria-labelledby="mis">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 id="mis" className="font-display text-xl font-bold">Tus presentaciones{rows.length > 0 && <span className="ml-2 text-base font-normal text-ink-2">({shown.length})</span>}</h2>
            {rows.length > 0 && (
              <nav aria-label="Filtrar presentaciones" className="flex gap-1">
                {FILTERS.map(([k, label]) => (
                  <Link key={k} href={k === "todas" ? "/dashboard" : `/dashboard?f=${k}`} aria-current={f === k || (k === "todas" && !FILTERS.some(([x]) => x === f)) ? "page" : undefined}
                    className="rounded-md border-2 border-transparent px-3 py-1 text-sm font-bold no-underline hover:bg-paper-2 aria-[current=page]:border-ink aria-[current=page]:bg-mark">{label}</Link>
                ))}
              </nav>
            )}
          </div>

          {rows.length === 0 ? (
            <EmptyState title="Tu primera presentación empieza aquí" action={<Link href="/presentations/new" className="btn btn-mark">Crear mi primera presentación</Link>}>
              Cuéntale a Lámina el tema, el nivel y qué quieres que aprendan tus estudiantes. Si tienes apuntes o un PDF, puedes subirlos. Después revisas el contenido y el diseño antes de proyectar.
            </EmptyState>
          ) : shown.length === 0 ? (
            <EmptyState title="Nada en esta vista" action={<Link href="/dashboard" className="btn btn-sm">Ver todas</Link>}>No tienes presentaciones {f === "publicadas" ? "publicadas" : "en curso"} por ahora.</EmptyState>
          ) : (
            <ul className="grid gap-4 md:grid-cols-2">
              {shown.slice(0, limit).map((p) => {
                const href = p.stage === "published" ? `/presentations/${p.id}/view` : pageFor(p.id, p.stage, p.pendingJob?.name);
                return (
                  <li key={p.id} className="sheet flex flex-col gap-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={pageFor(p.id, p.stage, p.pendingJob?.name)} className="font-display text-lg font-bold leading-snug underline-offset-4 hover:underline">{p.title}</Link>
                      <div className="flex flex-none items-center gap-1"><StageTag label={STAGE_LABEL[p.stage as Stage]} tone={stageTone(p.stage)} /><PresentationMenu id={p.id} title={p.title} busy={["researching", "designing", "polishing"].includes(p.stage)} /></div>
                    </div>
                    <p className="text-sm text-ink-2">
                      {p.level} · actualizada {p.updatedAt.toLocaleDateString("es-EC", { day: "numeric", month: "short" })}
                      {p.origin === "mcp" && <span className="tag tag-info ml-2"><Sparkles size={12} aria-hidden />Desde tu IA</span>}
                    </p>
                    <StageMeter stage={p.stage} prevStage={p.prevStage} />
                    <Link href={href} className="btn btn-sm mt-auto self-start">{nextAction(p.stage)}</Link>
                  </li>
                );
              })}
            </ul>
          )}
          {shown.length > limit && <Link href={`/dashboard?${f !== "todas" ? `f=${f}&` : ""}n=${limit + 12}`} className="btn mt-4">Mostrar más ({shown.length - limit} restantes)</Link>}
        </section>

        <aside className="space-y-6">
          {conns.length === 0 ? (
            <section className="sheet card-feature p-5" aria-labelledby="ia">
              <p className="tag tag-info"><Plug size={12} aria-hidden />Novedad</p>
              <h2 id="ia" className="mt-2 font-display text-xl font-bold leading-tight">Crea desde tu propia IA</h2>
              <p className="mt-1 text-sm text-ink-2">Conecta Claude u otra IA a tu cuenta y pídele la presentación en una conversación. Tú sigues revisando y aprobando.</p>
              <Link href="/conectar" className="btn btn-mark mt-4">Conectar con IA</Link>
            </section>
          ) : (
            <section className="sheet p-5" aria-labelledby="ia">
              <h2 id="ia" className="flex items-center gap-2 font-bold"><Plug size={16} aria-hidden />IA conectada</h2>
              <p className="mt-1 text-sm text-ink-2">{conns.map((c) => c.name).join(", ")}{lastUse ? ` · último uso ${lastUse.toLocaleDateString("es-EC", { day: "numeric", month: "short" })}` : " · aún sin usar"}</p>
              <Link href="/conectar" className="mt-3 inline-block text-sm font-bold underline underline-offset-4">Administrar conexiones</Link>
            </section>
          )}
          <ChangelogPanel entries={log} unread={unread} />
          {tight.length > 0 && (
            <section className="sheet p-5" aria-labelledby="cuota">
              <h2 id="cuota" className="font-bold">Tu uso de hoy</h2>
              <p className="hint">Se renueva a medianoche UTC (19:00 en Ecuador).</p>
              <dl className="mt-3 space-y-3">
                {tight.map(([k, v]) => (
                  <div key={k}>
                    <dt className="flex justify-between text-sm"><span>{QL[k]}</span><span className="font-bold">{v.used}/{v.limit}{v.used >= v.limit ? " · agotado" : ""}</span></dt>
                    <dd className="mt-1 h-2 rounded bg-paper-2"><div className={`h-2 rounded ${v.used >= v.limit ? "bg-pen" : "bg-blue"}`} style={{ width: `${Math.min(100, (v.used / v.limit) * 100)}%` }} /></dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
          <p className="text-sm"><Link href="/cuenta/uso" className="font-bold underline underline-offset-4">Ver mi uso y límites</Link></p>
        </aside>
      </div>
    </AppShell>
  );
}
