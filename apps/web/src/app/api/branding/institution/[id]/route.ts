import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { LaminaError } from "@lamina/contracts";
import { institutionLogoUrl, schema } from "@lamina/db";
import { getDb } from "@/lib/db";
import { requireUserApi } from "@/lib/session";
import { processLogo } from "@/lib/branding-image";
import { isUuid, logoHeaders, newLogoName, rateLimitUpload, readLogoUpload, readLogoVersion, retireLogos, saveLogo } from "@/lib/branding";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Admin, o el docente que creó la institución mientras no esté verificada. */
async function authorize(inst: { createdBy: string | null; verified: boolean }) {
  const u = await requireUserApi();
  if (u.role === "admin") return u;
  if (inst.createdBy === u.id && !inst.verified) return u;
  throw new LaminaError("forbidden", "Solo administradores", 403);
}

const fail = (e: unknown) => {
  if (e instanceof LaminaError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
  console.error("[branding institution]", e);
  return NextResponse.json({ error: "No se pudo procesar el logo." }, { status: 500 });
};

/** El logo de una institución es público (aparece en presentaciones publicadas). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return new NextResponse("No encontrado", { status: 404 });
  const [i] = await getDb().select({ logoPath: schema.institutions.logoPath }).from(schema.institutions).where(eq(schema.institutions.id, id));
  const buf = await readLogoVersion("institution", id, i?.logoPath, new URL(req.url).searchParams.get("v"));
  if (!buf) return new NextResponse("No encontrado", { status: 404 });
  return new NextResponse(new Uint8Array(buf), { headers: logoHeaders("public, max-age=3600") });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!isUuid(id)) throw new LaminaError("not_found", "Institución no encontrada", 404);
    const db = getDb();
    const [inst] = await db.select().from(schema.institutions).where(eq(schema.institutions.id, id));
    if (!inst) throw new LaminaError("not_found", "Institución no encontrada", 404);
    const admin = await authorize(inst);
    rateLimitUpload(`inst:${admin.id}`);
    const { png } = await processLogo(await readLogoUpload(req));
    const name = newLogoName(id);
    await saveLogo("institution", name, png);
    await db.update(schema.institutions).set({ logoPath: name, logoMime: "image/png", updatedAt: new Date() }).where(eq(schema.institutions.id, id));
    await retireLogos("institution", id, name);
    return NextResponse.json({ url: institutionLogoUrl({ id, logoPath: name }) });
  } catch (e) { return fail(e); }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!isUuid(id)) throw new LaminaError("not_found", "Institución no encontrada", 404);
    const db = getDb();
    const [inst] = await db.select().from(schema.institutions).where(eq(schema.institutions.id, id));
    if (!inst) throw new LaminaError("not_found", "Institución no encontrada", 404);
    await authorize(inst);
    await db.update(schema.institutions).set({ logoPath: null, logoMime: null, updatedAt: new Date() }).where(eq(schema.institutions.id, id));
    await retireLogos("institution", id, null);
    return NextResponse.json({ ok: true });
  } catch (e) { return fail(e); }
}
