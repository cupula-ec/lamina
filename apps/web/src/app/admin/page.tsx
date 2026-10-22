import Link from "next/link";
import { desc, eq, gte, sql } from "drizzle-orm";
import { schema, today, DEFAULT_QUOTAS } from "@lamina/db";
import { AppShell } from "@/components/AppShell";
import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { UsersPanel } from "./users";
import { ComponentsPanel } from "./components-panel";
import { STAGE_LABEL } from "@/lib/stages";
import type { Stage } from "@lamina/contracts";

export const metadata = { title: "Administración" };
export const dynamic = "force-dynamic";

const TABS = [["usuarios", "Usuarios"], ["componentes", "Componentes"], ["trabajos", "Trabajos y errores"], ["metricas", "Métricas"]] as const;

export default async function Admin({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireAdmin();
  const tab = (await searchParams).tab ?? "usuarios";
  const db = getDb();

  let body: React.ReactNode = null;
  if (tab === "usuarios") {
    const users = await db.select({ u: schema.user, p: schema.userProfiles }).from(schema.user).leftJoin(schema.userProfiles, eq(schema.userProfiles.userId, schema.user.id)).orderBy(desc(schema.user.createdAt));
    const counts = await db.select({ ownerId: schema.presentations.ownerId, n: sql<number>`count(*)::int` }).from(schema.presentations).groupBy(schema.presentations.ownerId);
    const nBy = new Map(counts.map((c) => [c.ownerId, c.n]));
    body = <UsersPanel defaults={DEFAULT_QUOTAS} users={users.map(({ u, p }) => ({ id: u.id, email: u.email, name: u.name, role: u.role ?? "teacher", banned: !!u.banned, mustChange: !!p?.mustChangePassword, consent: !!p?.consentAt, quotas: p?.quotaOverrides ?? {}, presentations: nBy.get(u.id) ?? 0, createdAt: u.createdAt.toISOString() }))} />;
  } else if (tab === "componentes") {
    body = await ComponentsPanel();
  } else if (tab === "trabajos") {
    const jobs = await db.execute(sql`select name, state, count(*)::int as n from pgboss.job where created_on > now() - interval '7 days' group by 1,2 order by 1,2`).then((r) => r.rows as { name: string; state: string; n: number }[]).catch(() => []);
    const errs = await db.select().from(schema.jobErrors).orderBy(desc(schema.jobErrors.createdAt)).limit(30);
    const waits = await db.select({ id: schema.presentations.id, title: schema.presentations.title, stage: schema.presentations.stage, err: schema.presentations.lastError, resumeAt: schema.presentations.resumeAt }).from(schema.presentations).where(sql`${schema.presentations.stage} in ('failed_recoverable','quota_wait')`);
    const [budget] = await db.select().from(schema.usageCounters).where(sql`${schema.usageCounters.scope} = 'global' and ${schema.usageCounters.kind} = 'ai_call' and ${schema.usageCounters.day} = ${today()}`);
    const models = await db.execute(sql`select model, result, count(*)::int as n, round(avg(latency_ms))::int as ms from ai_calls where created_at > now() - interval '24 hours' group by 1,2 order by 1,2`).then((r) => r.rows as { model: string; result: string; n: number; ms: number }[]);
    const nonFree = models.filter((m) => !m.model.endsWith(":free"));
    body = (
      <div className="space-y-8">
        <section><h2 className="text-xl font-bold">Cola de trabajos (7 días)</h2>
          <table className="mt-2 w-full text-sm"><thead><tr className="rule-b text-left"><th>Cola</th><th>Estado</th><th>N</th></tr></thead><tbody>{jobs.map((j, i) => <tr key={i}><td>{j.name}</td><td>{j.state}</td><td>{j.n}</td></tr>)}{jobs.length === 0 && <tr><td colSpan={3} className="py-2 text-ink-2">Sin trabajos recientes.</td></tr>}</tbody></table></section>
        <section><h2 className="text-xl font-bold">IA: presupuesto y modelos (24 h)</h2>
          <p className="mt-1">Llamadas hoy (global): <strong>{budget?.count ?? 0}</strong>. {nonFree.length === 0 ? <span className="tag tag-ok">Ningún modelo que no sea :free</span> : <span className="tag tag-bad">¡Modelo no gratuito detectado!</span>}</p>
          <table className="mt-2 w-full text-sm"><thead><tr className="rule-b text-left"><th>Modelo</th><th>Resultado</th><th>Llamadas</th><th>Latencia media</th></tr></thead><tbody>{models.map((m, i) => <tr key={i}><td>{m.model}</td><td>{m.result}</td><td>{m.n}</td><td>{m.ms} ms</td></tr>)}</tbody></table></section>
        <section><h2 className="text-xl font-bold">Presentaciones detenidas o en espera</h2>
          <ul className="mt-2 space-y-1 text-sm">{waits.map((w) => <li key={w.id}><strong>{w.title}</strong> · {STAGE_LABEL[w.stage as Stage]} · {w.err ?? ""} {w.resumeAt && `(reanuda ${w.resumeAt.toLocaleTimeString("es-EC")})`}</li>)}{waits.length === 0 && <li className="text-ink-2">Ninguna.</li>}</ul></section>
        <section><h2 className="text-xl font-bold">Últimos errores</h2>
          <ul className="mt-2 space-y-2 text-sm">{errs.map((e) => <li key={e.id}><span className="tag tag-bad">{e.jobName}</span> {e.createdAt.toLocaleString("es-EC")} — {e.friendly}<details><summary className="cursor-pointer text-ink-2">detalle</summary><pre className="overflow-x-auto whitespace-pre-wrap text-xs">{e.detail}</pre></details></li>)}{errs.length === 0 && <li className="text-ink-2">Sin errores.</li>}</ul></section>
      </div>
    );
  } else {
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const ev = await db.select({ name: schema.events.name, n: sql<number>`count(*)::int`, users: sql<number>`count(distinct ${schema.events.userId})::int` }).from(schema.events).where(gte(schema.events.createdAt, since)).groupBy(schema.events.name);
    const stages = await db.select({ stage: schema.presentations.stage, n: sql<number>`count(*)::int` }).from(schema.presentations).groupBy(schema.presentations.stage);
    const e = (n: string) => ev.find((x) => x.name === n)?.n ?? 0;
    const funnel = [["Creadas", e("presentation_created")], ["Contenido generado", e("content_generated")], ["Contenido aprobado", e("content_approved")], ["Diseño generado", e("design_generated")], ["Diseño aprobado", e("design_approved")], ["Publicadas", e("published")]] as const;
    const iters = await db.execute(sql`select avg(c)::numeric(10,1) as content, (select avg(c)::numeric(10,1) from (select count(*) c from deck_versions group by presentation_id) d) as design from (select count(*) c from content_versions group by presentation_id) t`).then((r) => r.rows[0] as { content: string | null; design: string | null });
    const comps = await db.execute(sql`select component_id, count(*)::int n from (select c.value->>'componentId' as component_id from deck_versions d, jsonb_array_elements(d.deck->'slides') s, jsonb_each(s->'slots') c) x group by 1 order by 2 desc limit 20`).then((r) => r.rows as { component_id: string; n: number }[]).catch(() => []);
    body = (
      <div className="grid gap-8 md:grid-cols-2">
        <section><h2 className="text-xl font-bold">Embudo (30 días)</h2>
          <ol className="mt-2 space-y-2">{funnel.map(([l, n]) => <li key={l} className="flex items-center gap-3"><span className="w-44 text-sm">{l}</span><div className="h-4 flex-1 overflow-hidden rounded bg-paper-2"><div className="h-4 rounded bg-blue" style={{ width: `${Math.max(...funnel.map((f) => f[1])) ? Math.min(100, (n / Math.max(...funnel.map((f) => f[1]))) * 100) : 0}%` }} /></div><strong>{n}</strong></li>)}</ol>
          <p className="mt-4 text-sm">Iteraciones medias por presentación: contenido <strong>{iters?.content ?? "—"}</strong> versiones · diseño <strong>{iters?.design ?? "—"}</strong> versiones.</p>
          <p className="mt-1 text-sm">Trabajos en espera de cupo (30 días): <strong>{e("quota_wait")}</strong> · fallidos: <strong>{e("job_failed")}</strong>.</p></section>
        <section><h2 className="text-xl font-bold">Presentaciones por etapa</h2>
          <ul className="mt-2 text-sm">{stages.map((s) => <li key={s.stage}>{STAGE_LABEL[s.stage as Stage]}: <strong>{s.n}</strong></li>)}</ul>
          <h2 className="mt-6 text-xl font-bold">Componentes más usados</h2>
          <ul className="mt-2 text-sm">{comps.map((c) => <li key={c.component_id}>{c.component_id}: <strong>{c.n}</strong></li>)}</ul></section>
      </div>
    );
  }

  return (
    <AppShell user={user}>
      <h1 className="text-3xl font-bold">Administración</h1>
      <nav className="mt-4 flex flex-wrap gap-2 border-b-2 border-ink pb-3" aria-label="Secciones">
        {TABS.map(([k, l]) => <Link key={k} href={`/admin?tab=${k}`} className={`btn btn-sm ${tab === k ? "btn-mark" : ""}`} aria-current={tab === k ? "page" : undefined}>{l}</Link>)}
        <Link href="/admin/instituciones" className="btn btn-sm">Instituciones</Link>
      </nav>
      <div className="mt-6">{body}</div>
    </AppShell>
  );
}
