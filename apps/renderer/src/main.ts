import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { chromium, type Browser } from "playwright";
import { z } from "zod";
import { DeckDocument, JOB_PAYLOADS } from "@lamina/contracts";
import { createDb, schema } from "@lamina/db";
import { createBoss } from "@lamina/jobs";

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
  const dir = path.join(env.DATA_DIR, "presentations", dv.presentationId, "renders", deckVersionId);
  await fs.mkdir(dir, { recursive: true });
  const ctx = await (await getBrowser()).newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, javaScriptEnabled: true, serviceWorkers: "block" });
  try {
    for (const [i, slide] of deck.slides.entries()) {
      const page = await ctx.newPage();
      try {
        const token = await newToken(deckVersionId);
        await page.goto(`${env.WEB_INTERNAL_URL}/render/${deckVersionId}?slide=${i}&step=max&token=${token}`, { waitUntil: "load", timeout: 45_000 });
        await page.waitForFunction(() => (window as any).__laminaReady === true, undefined, { timeout: 30_000 });
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

await boss.work("render", { localConcurrency: env.RENDER_CONCURRENCY }, async (jobs) => {
  for (const job of jobs) {
    const d = JOB_PAYLOADS.render.parse(job.data);
    try { await renderDeck(d.deckVersionId); console.log(`[renderer] ok ${d.deckVersionId}`); }
    catch (e) { console.error(`[renderer] fallo ${d.deckVersionId}:`, (e as Error).message); throw e; }
  }
});
console.log("[renderer] listo");
const stop = async () => { await boss.stop({ graceful: true, timeout: 15_000 }).catch(() => {}); await browser?.close().catch(() => {}); await pool.end(); process.exit(0); };
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
