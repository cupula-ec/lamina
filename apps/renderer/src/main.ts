import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { chromium, type Browser } from "playwright";
import { z } from "zod";
import { DeckDocument, JOB_PAYLOADS } from "@lamina/contracts";
import { createDb, hashJson, runContext, schema, workflow as wf } from "@lamina/db";
import { createBoss, enqueue } from "@lamina/jobs";

const env = z.object({
  DATABASE_URL: z.string().url(),
  WEB_INTERNAL_URL: z.string().url().default("http://localhost:3100"),
  DATA_DIR: z.string().default("./data"),
  RENDER_CONCURRENCY: z.coerce.number().default(2),
}).parse(process.env);

const { db, pool } = createDb(env.DATABASE_URL, 4);
const boss = await createBoss(env.DATABASE_URL);
let browser: Browser | null = null;
const getBrowser = async () => (browser?.isConnected() ? browser : (browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] })));

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
export type SlideRender = { slideId: string; path: string; issues: unknown[]; hashOk: boolean };

async function newToken(deckVersionId: string) {
  const token = randomBytes(24).toString("base64url");
  await db.insert(schema.renderTokens).values({ tokenHash: sha(token), deckVersionId, expiresAt: new Date(Date.now() + 90_000) });
  return token;
}

/** Renderiza cada slide en 1920×1080, guarda la captura y detecta problemas (overflow, texto pequeño, KaTeX, slot vacío, componente caído). */
export async function renderDeck(deckVersionId: string) {
  const [dv] = await db.select().from(schema.deckVersions).where(eq(schema.deckVersions.id, deckVersionId));
  if (!dv) return;
  const deck = DeckDocument.parse(dv.deck);
  const existing = await db.select().from(schema.renderArtifacts).where(eq(schema.renderArtifacts.deckVersionId, deckVersionId));
  if (existing.length >= deck.slides.length) return; // caché por deck_version
  const done = new Set(existing.filter((a) => a.path).map((a) => a.slideId)); // capturas ya copiadas (reparación puntual): no se repiten
  const dir = path.join(env.DATA_DIR, "presentations", dv.presentationId, "renders", deckVersionId);
  await fs.mkdir(dir, { recursive: true });
  const ctx = await (await getBrowser()).newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, javaScriptEnabled: true, serviceWorkers: "block" });
  try {
    for (const [i, slide] of deck.slides.entries()) {
      if (done.has(slide.id)) continue;
      const page = await ctx.newPage();
      try {
        const token = await newToken(deckVersionId);
        await page.goto(`${env.WEB_INTERNAL_URL}/render/${deckVersionId}?slide=${i}&step=max&token=${token}`, { waitUntil: "load", timeout: 45_000 });
        await page.waitForFunction(() => (window as any).__laminaReady === true, undefined, { timeout: 30_000 });
        await page.evaluate(() => document.fonts.ready); // las tipografías autoalojadas del tema deben estar cargadas antes de medir y capturar
        const issues = (await page.evaluate(() => (window as any).__laminaDetect())) as unknown[];
        const meta = (await page.evaluate(() => (window as any).__laminaMeta)) as { hashOk: boolean };
        const file = path.join(dir, `${slide.id.replace(/[^A-Za-z0-9_-]/g, "_")}.png`);
        await page.screenshot({ path: file, clip: { x: 0, y: 0, width: 1920, height: 1080 } });
        await db.insert(schema.renderArtifacts).values({ presentationId: dv.presentationId, deckVersionId, slideId: slide.id, path: file, issues })
          .onConflictDoUpdate({ target: [schema.renderArtifacts.deckVersionId, schema.renderArtifacts.slideId], set: { path: file, issues } });
        if (!meta.hashOk) console.warn(`[renderer] hash del deck no coincide en ${deckVersionId}`);
      } catch (e) {
        await db.insert(schema.renderArtifacts).values({ presentationId: dv.presentationId, deckVersionId, slideId: slide.id, path: "", issues: [{ slot: null, kind: "component_error", severity: "error", message: `No se pudo renderizar el slide: ${(e as Error).message.slice(0, 160)}` }] })
          .onConflictDoNothing();
      } finally { await page.close(); }
    }
  } finally { await ctx.close(); }
}

/** Captura de un componente provisional (primer fixture) para la revisión del administrador. */
export async function renderComponent(componentVersionId: string, presentationId: string) {
  const dir = path.join(env.DATA_DIR, "presentations", presentationId, "components");
  await fs.mkdir(dir, { recursive: true });
  const ctx = await (await getBrowser()).newContext({ viewport: { width: 988, height: 750 }, deviceScaleFactor: 1, serviceWorkers: "block" });
  try {
    const page = await ctx.newPage();
    const token = await newToken(componentVersionId);
    await page.goto(`${env.WEB_INTERNAL_URL}/render/component/${componentVersionId}?token=${token}`, { waitUntil: "load", timeout: 45_000 });
    await page.waitForFunction(() => (window as any).__laminaReady === true, undefined, { timeout: 30_000 });
    await page.evaluate(() => document.fonts.ready);
    const file = path.join(dir, `${componentVersionId}.png`);
    await page.screenshot({ path: file, clip: { x: 0, y: 0, width: 988, height: 750 } });
    await db.update(schema.componentVersions).set({ screenshots: [file] }).where(eq(schema.componentVersions.id, componentVersionId));
  } finally { await ctx.close(); }
}

/** PDF de la presentación (V3 §5.8): todas las diapositivas en su paso final, una por página 1920×1080, texto vectorial y fuentes incrustadas. */
export async function exportPdf(exportId: string) {
  const [x] = await db.select().from(schema.exportsTable).where(eq(schema.exportsTable.id, exportId));
  if (!x || x.status === "done" || !x.deckVersionId) return;
  await db.update(schema.exportsTable).set({ status: "running", error: null }).where(eq(schema.exportsTable.id, exportId));
  const dir = path.join(env.DATA_DIR, "presentations", x.presentationId, "exports");
  await fs.mkdir(dir, { recursive: true });
  const ctx = await (await getBrowser()).newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, serviceWorkers: "block", reducedMotion: "reduce" });
  try {
    const page = await ctx.newPage();
    const token = await newToken(x.deckVersionId);
    await page.goto(`${env.WEB_INTERNAL_URL}/render/${x.deckVersionId}/print?token=${token}`, { waitUntil: "load", timeout: 60_000 });
    await page.waitForFunction(() => (window as any).__laminaReady === true, undefined, { timeout: 90_000 });
    await page.evaluate(() => document.fonts.ready);
    await page.emulateMedia({ media: "print", reducedMotion: "reduce" });
    const pdf = await page.pdf({ width: "1920px", height: "1080px", printBackground: true, preferCSSPageSize: true });
    const file = path.join(dir, `${exportId}.pdf`);
    await fs.writeFile(file, pdf, { mode: 0o600 });
    await db.update(schema.exportsTable).set({ status: "done", path: file, bytes: pdf.length, finishedAt: new Date() }).where(eq(schema.exportsTable.id, exportId));
  } finally { await ctx.close(); }
}

const MAX_REPAIR_ATTEMPTS = 2;
type Iss = { severity: string; ignored?: boolean };
const errorsOf = (issues: unknown) => (issues as Iss[]).filter((i) => i.severity === "error" && !i.ignored).length;

/**
 * Una corrección nunca debe dejar peor una diapositiva: si tras re-renderizar una diapositiva reparada tiene MÁS errores que en la
 * versión de la que partió, se restaura la anterior (con su captura) en una versión nueva. Devuelve su id, o null si nada empeoró.
 */
async function revertWorse(presentationId: string, versionId: string): Promise<string | "requeued" | null> {
  const [cur] = await db.select().from(schema.deckVersions).where(eq(schema.deckVersions.id, versionId));
  if (!cur || cur.kind !== "repair" || !cur.parentId) return null;
  const [parent] = await db.select().from(schema.deckVersions).where(eq(schema.deckVersions.id, cur.parentId));
  if (!parent) return null;
  const curArts = new Map((await db.select().from(schema.renderArtifacts).where(eq(schema.renderArtifacts.deckVersionId, cur.id))).map((a) => [a.slideId, a]));
  const parentArts = new Map((await db.select().from(schema.renderArtifacts).where(eq(schema.renderArtifacts.deckVersionId, parent.id))).map((a) => [a.slideId, a]));
  const curDeck = DeckDocument.parse(cur.deck), parentDeck = DeckDocument.parse(parent.deck);
  const parentSlides = new Map(parentDeck.slides.map((x) => [x.id, x]));
  const worse = new Set<string>();
  for (const sl of curDeck.slides) {
    const before = parentArts.get(sl.id), after = curArts.get(sl.id);
    if (!before?.path || !parentSlides.has(sl.id)) continue;
    // Una diapositiva que dejó de poder dibujarse es el peor caso posible.
    if (!after?.path || errorsOf(after.issues) > errorsOf(before.issues)) worse.add(sl.id);
  }
  if (!worse.size) return null;
  const deck = { ...curDeck, slides: curDeck.slides.map((sl) => (worse.has(sl.id) ? parentSlides.get(sl.id)! : sl)) };
  const saved = await wf.designRepaired(db, presentationId, {
    baseVersionId: cur.id, deck, sha256: hashJson(deck),
    note: `Se restauró la versión anterior de ${worse.size} diapositiva${worse.size > 1 ? "s" : ""} porque la corrección automática las empeoraba`,
  });
  const rows = deck.slides.flatMap((sl) => { const a = worse.has(sl.id) ? parentArts.get(sl.id) : curArts.get(sl.id); return a ? [{ presentationId, deckVersionId: saved.id, slideId: sl.id, path: a.path, issues: a.issues }] : []; });
  try {
    if (rows.length) await db.insert(schema.renderArtifacts).values(rows).onConflictDoNothing();
  } catch (e) {
    // La versión ya se guardó pero no se pudieron copiar las capturas: se vuelve a renderizar (cierra el diseño al terminar).
    console.error("[renderer] revertWorse: no se copiaron las capturas, se re-renderiza:", (e as Error).message);
    await enqueue(boss, "render", { presentationId, deckVersionId: saved.id, then: "repair", attempt: MAX_REPAIR_ATTEMPTS }, { base: `${saved.id}:rv` });
    return "requeued";
  }
  return saved.id;
}

/** Tras renderizar un borrador de diseño: si quedan errores y hay intentos, se encola la reparación puntual; si no, se entrega al docente. */
async function afterRender(d: z.infer<typeof JOB_PAYLOADS.render>) {
  if (d.then !== "repair" || !d.deckVersionId) return;
  const [p] = await db.select().from(schema.presentations).where(eq(schema.presentations.id, d.presentationId));
  if (!p || p.stage !== "designing" || p.currentDeckVersionId !== d.deckVersionId) return;
  const arts = await db.select().from(schema.renderArtifacts).where(eq(schema.renderArtifacts.deckVersionId, d.deckVersionId));
  const reverted = await revertWorse(p.id, d.deckVersionId).catch((e) => { console.error("[renderer] revertWorse:", (e as Error).message); return null; });
  if (reverted === "requeued") return;
  if (reverted) return void (await wf.designFinish(db, p.id, reverted));
  const failing = arts.some((a) => a.path && (!d.slideIds || d.slideIds.includes(a.slideId)) && (a.issues as { severity: string; ignored?: boolean }[]).some((i) => i.severity === "error" && !i.ignored));
  if (failing && d.attempt < MAX_REPAIR_ATTEMPTS) {
    try { await enqueue(boss, "design.repair", { presentationId: p.id, userId: p.ownerId, deckVersionId: d.deckVersionId, attempt: d.attempt, slideIds: d.slideIds }, { base: `${d.deckVersionId}:${d.attempt}`, priority: 10 }); return; }
    catch (e) {
      if ((e as { code?: string }).code === "job_in_progress") return; // la reparación ya está en cola/curso: no se cierra el diseño
      console.error("[renderer] no se pudo encolar la reparación:", (e as Error).message);
    }
  }
  await wf.designFinish(db, p.id, d.deckVersionId);
}

await boss.work("render", { localConcurrency: env.RENDER_CONCURRENCY }, async (jobs) => {
  for (const job of jobs) {
    const d = JOB_PAYLOADS.render.parse(job.data);
    const key = d.deckVersionId ?? d.componentVersionId!;
    // Misma época de cancelación que los handlers del worker: un render de un trabajo cancelado no puede escribir en el nuevo.
    const [cur] = await db.select({ epoch: schema.presentations.cancelEpoch }).from(schema.presentations).where(eq(schema.presentations.id, d.presentationId));
    if (!cur) continue;
    try {
      await runContext.run({ presentationId: d.presentationId, epoch: cur.epoch }, async () => {
        try {
          if (d.deckVersionId) await renderDeck(d.deckVersionId); else await renderComponent(d.componentVersionId!, d.presentationId);
          console.log(`[renderer] ok ${key}`);
        } catch (e) {
          console.error(`[renderer] fallo ${key}:`, (e as Error).message);
          // Último reintento: el docente no se queda esperando; recibe el diseño sin revisión automática.
          if (d.then === "repair" && d.deckVersionId && ((job as { retryCount?: number }).retryCount ?? 0) >= 2) await wf.designFinish(db, d.presentationId, d.deckVersionId).catch(() => {});
          throw e;
        }
        await afterRender(d).catch((e) => { if ((e as { code?: string }).code !== "run_cancelled") console.error(`[renderer] afterRender ${key}:`, (e as Error).message); });
      });
    } catch (e) {
      if ((e as { code?: string }).code === "run_cancelled") continue;
      throw e;
    }
  }
});
await boss.work("export", { localConcurrency: 1 }, async (jobs) => {
  for (const job of jobs) {
    const d = JOB_PAYLOADS.export.parse(job.data);
    try {
      if (d.kind === "pdf") await exportPdf(d.exportId);
      else throw new Error(`export ${d.kind}: no disponible todavía`);
      console.log(`[renderer] export ok ${d.exportId}`);
    } catch (e) {
      console.error(`[renderer] export fallo ${d.exportId}:`, (e as Error).message);
      const last = ((job as { retryCount?: number }).retryCount ?? 0) >= 1;
      if (last || /no disponible/.test((e as Error).message)) await db.update(schema.exportsTable).set({ status: "failed", error: "No se pudo generar el archivo. Inténtalo de nuevo.", finishedAt: new Date() }).where(eq(schema.exportsTable.id, d.exportId)).catch(() => {});
      if (!/no disponible/.test((e as Error).message)) throw e;
    }
  }
});
console.log("[renderer] listo");
const stop = async () => { await boss.stop({ graceful: true, timeout: 15_000 }).catch(() => {}); await browser?.close().catch(() => {}); await pool.end(); process.exit(0); };
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
