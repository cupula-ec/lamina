import { and, asc, desc, eq, inArray, not, or } from "drizzle-orm";
import { ContentDraft, DeckDocument } from "@lamina/contracts";
import { schema } from "@lamina/db";
import { getDb } from "./db";
import { sha256Hex } from "@lamina/db";
import { jsonSchemaToZod, type CatalogLookup } from "@lamina/components";

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

export type RepairReport = { tried: number; resolved: string[]; unresolved: string[] };

const errCount = (issues: unknown[]) => (issues as { severity: string; ignored?: boolean }[]).filter((i) => i.severity === "error" && !i.ignored).length;

/**
 * Resultado real de la corrección automática: compara, para cada diapositiva que cambió, los errores de la versión de partida
 * (primer ancestro que no es "repair") con los de la versión actual. Devuelve null si la versión no viene de una corrección.
 */
export async function repairReport(versionId: string, arts: { slideId: string; path?: string; issues: unknown[] }[]): Promise<RepairReport | null> {
  const db = getDb();
  const [cur] = await db.select().from(schema.deckVersions).where(eq(schema.deckVersions.id, versionId));
  if (!cur || cur.kind !== "repair") return null;
  let base = cur;
  for (let i = 0; i < 12 && base.kind === "repair" && base.parentId; i++) {
    const [parent] = await db.select().from(schema.deckVersions).where(eq(schema.deckVersions.id, base.parentId));
    if (!parent) break;
    base = parent;
  }
  // «Intentadas» = diapositivas que tenían errores en la versión de partida; se resuelven si hoy no tienen ninguno.
  const beforeArts = await artifactsFor(base.id);
  const resolved: string[] = [], unresolved: string[] = [];
  for (const b of beforeArts) {
    if (!b.path || errCount(b.issues) === 0) continue;
    const now = arts.find((a) => a.slideId === b.slideId);
    // Sin captura nueva (no se pudo dibujar) no cuenta como resuelta.
    (now?.path && errCount(now.issues) === 0 ? resolved : unresolved).push(b.slideId);
  }
  return { tried: resolved.length + unresolved.length, resolved, unresolved };
}

export type PolishReport = { slidesChanged: number; errorsBefore: number; errorsAfter: number };

/** Qué hizo realmente el pulido: diapositivas con cambios (transición/pasos) y errores de diseño antes y después. */
export async function polishReport(versionId: string, arts: { slideId: string; issues: unknown[] }[]): Promise<PolishReport | null> {
  const [cur] = await getDb().select().from(schema.deckVersions).where(eq(schema.deckVersions.id, versionId));
  if (!cur || cur.kind !== "polish" || !cur.parentId) return null;
  const [parent] = await getDb().select().from(schema.deckVersions).where(eq(schema.deckVersions.id, cur.parentId));
  if (!parent) return null;
  const before = new Map(DeckDocument.parse(parent.deck).slides.map((s) => [s.id, sha256Hex(JSON.stringify(s))]));
  const slidesChanged = DeckDocument.parse(cur.deck).slides.filter((s) => before.get(s.id) !== sha256Hex(JSON.stringify(s))).length;
  const errorsBefore = (await artifactsFor(parent.id)).reduce((n, a) => n + errCount(a.issues), 0);
  return { slidesChanged, errorsBefore, errorsAfter: arts.reduce((n, a) => n + errCount(a.issues), 0) };
}

export const tokenHash = (t: string) => sha256Hex(t);

/** Provisionales fijados por un deck (por id+versión+hash del bundle): lo publicado no cambia aunque el componente evolucione. */
export async function provisionalForDeck(presentationId: string, pins: Record<string, { version: string; bundleHash?: string }>) {
  const hashes = Object.values(pins).map((p) => p.bundleHash).filter(Boolean) as string[];
  if (!hashes.length) return [];
  const db = getDb();
  const rows = await db.select({ c: schema.components, v: schema.componentVersions }).from(schema.componentVersions)
    .innerJoin(schema.components, eq(schema.components.id, schema.componentVersions.componentRowId))
    .where(and(or(eq(schema.components.presentationId, presentationId), eq(schema.components.scope, "global")), inArray(schema.componentVersions.bundleHash, hashes), not(inArray(schema.components.status, ["rejected", "deprecated"]))));
  return rows.map(({ c, v }) => ({ id: c.componentId, version: v.version, bundle: v.bundle, bundleHash: v.bundleHash, propsJsonSchema: ((v.manifest as { propsJsonSchema?: Record<string, unknown> }).propsJsonSchema ?? {}) }));
}

/** Búsqueda de esquemas de props para validar un deck en servidor: nativos (registry) + provisionales fijados por el deck. */
export async function catalogLookupFor(presentationId: string, pins: Record<string, { version: string; bundleHash?: string }>): Promise<CatalogLookup> {
  const prov = await provisionalForDeck(presentationId, pins);
  const map = new Map(prov.map((p) => {
    let propsSchema;
    try { propsSchema = jsonSchemaToZod(p.propsJsonSchema); } catch { propsSchema = undefined; }
    return [`${p.id}@${p.version}`, { propsSchema, status: "provisional" }] as const;
  }));
  return (ref) => map.get(`${ref.componentId}@${ref.version}`);
}
