import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import { ContentDraft, DeckDocument } from "@lamina/contracts";
import { schema } from "@lamina/db";
import { getDb } from "./db";
import { sha256Hex } from "@lamina/db";

/** Componentes provisionales de la presentación (con bundle) para el resolver del cliente. */
export async function provisionalFor(presentationId: string) {
  const db = getDb();
  const comps = await db.select().from(schema.components).where(and(eq(schema.components.scope, presentationId), eq(schema.components.status, "provisional")));
  const out: { id: string; version: string; bundle: string; bundleHash: string; propsJsonSchema: Record<string, unknown> }[] = [];
  for (const c of comps) {
    const [v] = await db.select().from(schema.componentVersions).where(eq(schema.componentVersions.componentRowId, c.id)).orderBy(desc(schema.componentVersions.createdAt)).limit(1);
    if (!v) continue;
    const m = v.manifest as { propsJsonSchema?: Record<string, unknown> };
    out.push({ id: c.componentId, version: v.version, bundle: v.bundle, bundleHash: v.bundleHash, propsJsonSchema: m.propsJsonSchema ?? {} });
  }
  return out;
}

export async function contentVersions(presentationId: string) {
  return getDb().select({ id: schema.contentVersions.id, n: schema.contentVersions.n, authorKind: schema.contentVersions.authorKind, note: schema.contentVersions.note, createdAt: schema.contentVersions.createdAt, sha256: schema.contentVersions.sha256 })
    .from(schema.contentVersions).where(eq(schema.contentVersions.presentationId, presentationId)).orderBy(desc(schema.contentVersions.n));
}
export async function deckVersions(presentationId: string) {
  return getDb().select({ id: schema.deckVersions.id, n: schema.deckVersions.n, authorKind: schema.deckVersions.authorKind, kind: schema.deckVersions.kind, note: schema.deckVersions.note, createdAt: schema.deckVersions.createdAt, sha256: schema.deckVersions.sha256 })
    .from(schema.deckVersions).where(eq(schema.deckVersions.presentationId, presentationId)).orderBy(desc(schema.deckVersions.n));
}

export async function loadContent(versionId: string | null) {
  if (!versionId) return null;
  const [v] = await getDb().select().from(schema.contentVersions).where(eq(schema.contentVersions.id, versionId));
  return v ? { row: v, draft: ContentDraft.parse(v.content) } : null;
}
export async function loadDeck(versionId: string | null) {
  if (!versionId) return null;
  const [v] = await getDb().select().from(schema.deckVersions).where(eq(schema.deckVersions.id, versionId));
  return v ? { row: v, deck: DeckDocument.parse(v.deck) } : null;
}

export async function sourcesFor(presentationId: string) {
  const db = getDb();
  const srcs = await db.select().from(schema.sources).where(eq(schema.sources.presentationId, presentationId)).orderBy(asc(schema.sources.createdAt));
  const chunks = await db.select({ id: schema.sourceChunks.id, sourceId: schema.sourceChunks.sourceId, text: schema.sourceChunks.text, page: schema.sourceChunks.page }).from(schema.sourceChunks).where(eq(schema.sourceChunks.presentationId, presentationId));
  return { sources: srcs, chunks };
}

export async function artifactsFor(deckVersionId: string | null) {
  if (!deckVersionId) return [];
  return getDb().select().from(schema.renderArtifacts).where(eq(schema.renderArtifacts.deckVersionId, deckVersionId));
}

export const tokenHash = (t: string) => sha256Hex(t);

/** Provisionales fijados por un deck (por id+versión+hash del bundle): lo publicado no cambia aunque el componente evolucione. */
export async function provisionalForDeck(presentationId: string, pins: Record<string, { version: string; bundleHash?: string }>) {
  const hashes = Object.values(pins).map((p) => p.bundleHash).filter(Boolean) as string[];
  if (!hashes.length) return [];
  const db = getDb();
  const rows = await db.select({ c: schema.components, v: schema.componentVersions }).from(schema.componentVersions)
    .innerJoin(schema.components, eq(schema.components.id, schema.componentVersions.componentRowId))
    .where(and(or(eq(schema.components.presentationId, presentationId), eq(schema.components.scope, "global")), inArray(schema.componentVersions.bundleHash, hashes)));
  return rows.map(({ c, v }) => ({ id: c.componentId, version: v.version, bundle: v.bundle, bundleHash: v.bundleHash, propsJsonSchema: ((v.manifest as { propsJsonSchema?: Record<string, unknown> }).propsJsonSchema ?? {}) }));
}
