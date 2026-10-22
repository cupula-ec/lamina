import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { schema } from "@lamina/db";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { isUserId, logoHeaders, readLogoVersion, verifyPersonalSig } from "@/lib/branding";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const notFound = () => new NextResponse("No encontrado", { status: 404 });

/**
 * El logo personal lo ve su dueño (sesión) o quien reciba una URL firmada y con caducidad, emitida por las páginas ya
 * autorizadas (vista publicada, renderer). Cualquier otro caso es 404, igual que si no existiera.
 */
export async function GET(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  if (!isUserId(userId)) return notFound();
  const q = new URL(req.url).searchParams;
  const signed = verifyPersonalSig(userId, q.get("exp"), q.get("sig"));
  if (!signed) {
    const me = await getSessionUser();
    if (!me || me.id !== userId) return notFound();
  }
  const [p] = await getDb().select({ path: schema.userProfiles.personalLogoPath }).from(schema.userProfiles).where(eq(schema.userProfiles.userId, userId));
  const buf = await readLogoVersion("personal", userId, p?.path, q.get("v"));
  if (!buf) return notFound();
  return new NextResponse(new Uint8Array(buf), { headers: logoHeaders("private, max-age=300") });
}
