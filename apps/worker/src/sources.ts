import { asc, eq, inArray } from "drizzle-orm";
import { schema } from "@lamina/db";
import type { Ctx } from "./ctx";

export type ChunkRow = { id: string; sourceId: string; origin: string; kind: string; title: string; url: string | null; text: string; page: number | null; ord: number };

export async function loadChunks(ctx: Ctx, presentationId: string): Promise<ChunkRow[]> {
  const srcs = await ctx.db.select().from(schema.sources).where(eq(schema.sources.presentationId, presentationId)).orderBy(asc(schema.sources.createdAt));
  const ok = srcs.filter((s) => s.status === "ok");
  if (!ok.length) return [];
  const chunks = await ctx.db.select().from(schema.sourceChunks).where(inArray(schema.sourceChunks.sourceId, ok.map((s) => s.id))).orderBy(asc(schema.sourceChunks.ord));
  const byId = new Map(ok.map((s) => [s.id, s]));
  return chunks.map((c) => {
    const s = byId.get(c.sourceId)!;
    return { id: c.id, sourceId: c.sourceId, origin: s.origin, kind: s.kind, title: s.title, url: s.url, text: c.text, page: c.page, ord: c.ord };
  });
}

/** Selecciona fragmentos hasta un presupuesto de caracteres: primero el material del docente, luego la investigación (round-robin por fuente). */
export function selectChunks(chunks: ChunkRow[], maxChars = 24_000): ChunkRow[] {
  const out: ChunkRow[] = [];
  let used = 0;
  const take = (c: ChunkRow) => { if (used + c.text.length > maxChars) return false; out.push(c); used += c.text.length; return true; };
  for (const c of chunks.filter((c) => c.origin === "teacher")) if (!take(c)) break;
  const bySource = new Map<string, ChunkRow[]>();
  for (const c of chunks.filter((c) => c.origin !== "teacher")) bySource.set(c.sourceId, [...(bySource.get(c.sourceId) ?? []), c]);
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const list of bySource.values()) {
      const c = list.shift();
      if (c) { progressed = true; if (!take(c)) return out; }
    }
  }
  return out;
}
