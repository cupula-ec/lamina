import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { LaminaError } from "@lamina/contracts";
import { personalLogoUrl, schema } from "@lamina/db";
import { getDb } from "@/lib/db";
import { requireUserApi } from "@/lib/session";
import { processLogo } from "@/lib/branding-image";
import { newLogoName, rateLimitUpload, readLogoUpload, removeLogo, saveLogo } from "@/lib/branding";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const fail = (e: unknown) => {
  if (e instanceof LaminaError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
  console.error("[branding personal]", e);
  return NextResponse.json({ error: "No se pudo procesar el logo." }, { status: 500 });
};

/** Sube (o reemplaza) el logo personal del docente autenticado. */
export async function POST(req: Request) {
  try {
    const u = await requireUserApi();
    rateLimitUpload(`personal:${u.id}`);
    const { png } = await processLogo(await readLogoUpload(req));
    const db = getDb();
    const [prev] = await db.select({ path: schema.userProfiles.personalLogoPath }).from(schema.userProfiles).where(eq(schema.userProfiles.userId, u.id));
    const name = newLogoName(u.id);
    await saveLogo("personal", name, png);
    await db.insert(schema.userProfiles).values({ userId: u.id, personalLogoPath: name, personalLogoMime: "image/png" })
      .onConflictDoUpdate({ target: schema.userProfiles.userId, set: { personalLogoPath: name, personalLogoMime: "image/png" } });
    await removeLogo("personal", prev?.path);
    return NextResponse.json({ url: personalLogoUrl(u.id, name) });
  } catch (e) { return fail(e); }
}

export async function DELETE() {
  try {
    const u = await requireUserApi();
    const db = getDb();
    const [prev] = await db.select({ path: schema.userProfiles.personalLogoPath }).from(schema.userProfiles).where(eq(schema.userProfiles.userId, u.id));
    await db.update(schema.userProfiles).set({ personalLogoPath: null, personalLogoMime: null }).where(eq(schema.userProfiles.userId, u.id));
    await removeLogo("personal", prev?.path);
    return NextResponse.json({ ok: true });
  } catch (e) { return fail(e); }
}
