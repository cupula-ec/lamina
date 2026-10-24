import fs from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { LaminaError } from "@lamina/contracts";
import { schema } from "@lamina/db";
import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { requireUserApi } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const MIME: Record<string, string> = { pdf: "application/pdf", student_pdf: "application/pdf", offline: "application/zip" };
const EXT: Record<string, string> = { pdf: "pdf", student_pdf: "pdf", offline: "zip" };
const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "presentacion";

/** Estado de una exportación; con `?download=1` y lista, entrega el archivo. Solo el dueño. */
export async function GET(req: Request, { params }: { params: Promise<{ exportId: string }> }) {
  try {
    const u = await requireUserApi();
    const { exportId } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(exportId)) throw new LaminaError("not_found", "Exportación no encontrada", 404);
    const db = getDb();
    const [x] = await db.select().from(schema.exportsTable).where(eq(schema.exportsTable.id, exportId));
    if (!x || x.userId !== u.id) throw new LaminaError("not_found", "Exportación no encontrada", 404);
    if (new URL(req.url).searchParams.get("download") !== "1") return NextResponse.json({ id: x.id, kind: x.kind, status: x.status, bytes: x.bytes, error: x.error }, { headers: { "cache-control": "no-store" } });
    if (x.status !== "done" || !x.path) throw new LaminaError("invalid_transition", "La exportación todavía no está lista.", 409);
    // La ruta guardada debe seguir dentro de DATA_DIR (defensa en profundidad).
    const root = path.resolve(env().DATA_DIR);
    const file = path.resolve(x.path);
    if (!file.startsWith(root + path.sep)) throw new LaminaError("not_found", "Archivo no disponible", 404);
    const [p] = await db.select({ title: schema.presentations.title }).from(schema.presentations).where(eq(schema.presentations.id, x.presentationId));
    const buf = await fs.readFile(file).catch(() => null);
    if (!buf) throw new LaminaError("not_found", "El archivo ya no está disponible. Vuelve a exportar.", 404);
    return new NextResponse(new Uint8Array(buf), { headers: { "content-type": MIME[x.kind] ?? "application/octet-stream", "content-disposition": `attachment; filename="${slug(p?.title ?? "presentacion")}.${EXT[x.kind] ?? "bin"}"`, "x-content-type-options": "nosniff", "cache-control": "private, no-store" } });
  } catch (e) {
    if (e instanceof LaminaError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    console.error("[export download]", e);
    return NextResponse.json({ error: "No se pudo entregar el archivo." }, { status: 500 });
  }
}
