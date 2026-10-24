import Link from "next/link";
import { and, eq, inArray } from "drizzle-orm";
import { DEFAULT_CONCURRENT_JOBS, QUOTA_KINDS, schema, usageFor, type QuotaKind } from "@lamina/db";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Uso y límites" };
export const dynamic = "force-dynamic";

const INFO: Record<QuotaKind, { label: string; what: string }> = {
  presentation_new: { label: "Presentaciones nuevas", what: "Cada vez que creas una presentación (investigación y redacción incluidas)." },
  content_regen: { label: "Regeneraciones de contenido", what: "Pedir a la IA que rehaga el borrador o algunas secciones." },
  design_regen: { label: "Diseños y correcciones", what: "Generar o regenerar el diseño, y «Corregir automáticamente»." },
  component_request: { label: "Componentes nuevos", what: "Pedir a la IA un componente visual que no existe en el catálogo." },
  ocr_vision_page: { label: "Páginas con visión (OCR)", what: "Leer fórmulas de PDF escaneados con un modelo de visión (solo si lo autorizas)." },
  mcp_call: { label: "Consultas desde tu IA conectada", what: "Llamadas que hace Claude, ChatGPT u otra IA conectada por MCP." },
  mcp_submit: { label: "Envíos desde tu IA conectada", what: "Contenidos o diseños que tu IA envía a Lámina." },
  export: { label: "Exportaciones", what: "PDF y versión offline de tus presentaciones." },
};
const STATIC_LIMITS: [string, string][] = [
  ["Archivos por presentación", "Hasta 3 (PDF, DOCX, TXT o MD), 20 MB cada uno"],
  ["Enlaces y notas", "Hasta 5 enlaces; notas de hasta 20 000 caracteres"],
  ["PDF", "Hasta 150 páginas por archivo; OCR de hasta 40 páginas por documento"],
  ["Trabajos a la vez", `Hasta ${DEFAULT_CONCURRENT_JOBS} presentaciones procesándose al mismo tiempo`],
  ["Logo personal", "Hasta 1 MB (PNG, JPG, WebP o SVG)"],
  ["IA conectada (MCP)", "60 llamadas por minuto, 12 versiones de diseño por presentación, 60 diapositivas por envío"],
];
const RUNNING = ["researching", "designing", "polishing"];

function nextReset(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}

export default async function Uso() {
  const u = await requireUser();
  const db = getDb();
  const usage = await usageFor(db, u.id);
  const busy = await db.select({ id: schema.presentations.id, stage: schema.presentations.stage }).from(schema.presentations)
    .where(and(eq(schema.presentations.ownerId, u.id), inArray(schema.presentations.stage, [...RUNNING, "quota_wait"])));
  const running = busy.filter((b) => RUNNING.includes(b.stage)).length;
  const waiting = busy.filter((b) => b.stage === "quota_wait").length;
  const reset = nextReset();
  const fmt = new Intl.DateTimeFormat("es-EC", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "America/Guayaquil" });

  return (
    <AppShell user={u}>
      <PageHeader title="Uso y límites" lead="Cuánto has usado hoy y cuánto te queda. Los contadores se reinician cada día." />
      <div className="grid max-w-3xl gap-8">
        <section className="sheet p-5" aria-labelledby="hoy">
          <h2 id="hoy" className="text-xl font-bold">Tu uso de hoy</h2>
          <p className="hint mt-1">Se renueva el <strong>{fmt.format(reset)}</strong> (hora de Ecuador; medianoche UTC).</p>
          <ul className="mt-4 space-y-5">
            {QUOTA_KINDS.map((k) => {
              const { used, limit } = usage[k];
              const left = Math.max(limit - used, 0);
              const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 100;
              const tone = limit <= 0 || pct >= 100 ? "bg-pen" : pct >= 80 ? "bg-warn" : "bg-ok";
              return (
                <li key={k}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-bold">{INFO[k].label}</span>
                    <span className="text-sm">{used} de {limit} usadas · <strong>{left} disponibles</strong></span>
                  </div>
                  <div className="mt-1 h-3 w-full overflow-hidden rounded-full border-2 border-ink bg-paper" role="progressbar" aria-valuemin={0} aria-valuemax={limit} aria-valuenow={Math.min(used, limit)} aria-label={INFO[k].label}>
                    <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
                  </div>
                  <p className="hint mt-1">{INFO[k].what}{limit > 0 && pct >= 100 && " Alcanzaste el límite de hoy."}{limit > 0 && pct >= 80 && pct < 100 && " Te acercas al límite."}</p>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="sheet p-5" aria-labelledby="ahora">
          <h2 id="ahora" className="text-xl font-bold">Ahora mismo</h2>
          <ul className="mt-3 space-y-1 text-sm">
            <li>Procesándose: <strong>{running} de {DEFAULT_CONCURRENT_JOBS}</strong> {running >= DEFAULT_CONCURRENT_JOBS && "(espera a que termine una para iniciar otra)"}</li>
            <li>{waiting > 0 ? <>En espera de cupo de IA: <strong>{waiting}</strong>. Se reanudan solas cuando el servicio gratuito vuelve a tener cupo (hacia las 19:05 hora de Ecuador como máximo).</> : "Ninguna presentación está esperando cupo de IA."}</li>
          </ul>
          <p className="hint mt-3 max-w-[62ch]">El servicio de IA es gratuito y compartido: si muchos usuarios lo usan a la vez, un trabajo puede esperar cupo aunque tú no hayas llegado a tu límite.</p>
        </section>

        <section className="sheet p-5" aria-labelledby="fijos">
          <h2 id="fijos" className="text-xl font-bold">Otros límites</h2>
          <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[14rem_1fr]">
            {STATIC_LIMITS.map(([t, d]) => (<div key={t} className="contents"><dt className="font-bold">{t}</dt><dd>{d}</dd></div>))}
          </dl>
        </section>
        <p className="text-sm text-ink-2">¿Necesitas más? <Link href="/cuenta" className="font-bold underline underline-offset-4">Vuelve a Mi cuenta</Link> o pide un aumento a tu administrador.</p>
      </div>
    </AppShell>
  );
}
