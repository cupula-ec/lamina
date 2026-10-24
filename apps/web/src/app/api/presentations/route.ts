import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { AreaId, LaminaError, LengthId } from "@lamina/contracts";
import { consumeQuota, hashJson, refundQuota, schema, sha256Hex, workflow as wf } from "@lamina/db";
import { enqueue } from "@lamina/jobs";
import { chunkText } from "@lamina/research";
import { getBoss } from "@/lib/boss";
import { getDb } from "@/lib/db";
import { presentationDir } from "@/lib/cleanup";
import { requireUserApi } from "@/lib/session";
import { OCR_CONSENT_VERSION } from "@/lib/consent";
import { guidanceNotes } from "@/lib/request-quality";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_FILES = 3, MAX_FILE = 20 * 1024 * 1024, ALLOWED = /\.(pdf|docx|txt|md|markdown)$/i;
const Fields = z.object({
  topic: z.string().trim().min(3, "Escribe el tema (mínimo 3 caracteres)").max(200),
  level: z.string().trim().min(2, "Indica el nivel").max(120),
  objective: z.string().trim().min(5, "Describe el objetivo (mínimo 5 caracteres)").max(600),
  subject: z.string().trim().max(160, "Materia: máximo 160 caracteres").optional(),
  period: z.string().trim().max(80, "Período: máximo 80 caracteres").optional(),
  group: z.string().trim().max(80, "Grupo: máximo 80 caracteres").optional(),
  notes: z.string().max(20_000).optional(),
  urls: z.string().max(2000).optional(),
  /** V3: opcionales; vacío = lo decide el sistema (área detectada, cantidad media). */
  area: z.union([AreaId, z.literal("")]).optional(),
  length: z.union([LengthId, z.literal("")]).optional(),
  prior: z.string().trim().max(600).optional(),
  examples: z.string().trim().max(600).optional(),
  avoid: z.string().trim().max(600).optional(),
});

export async function POST(req: Request) {
  let userId: string | null = null;
  let quotaTaken = false;
  let presId: string | null = null;
  const db = getDb();
  try {
    const user = await requireUserApi();
    userId = user.id;
    const form = await req.formData();
    const f = Fields.safeParse({ topic: form.get("topic") ?? "", level: form.get("level") ?? "", objective: form.get("objective") ?? "", subject: String(form.get("subject") ?? ""), period: String(form.get("period") ?? ""), group: String(form.get("group") ?? ""), notes: String(form.get("notes") ?? ""), urls: String(form.get("urls") ?? ""), area: String(form.get("area") ?? ""), length: String(form.get("length") ?? ""), prior: String(form.get("prior") ?? ""), examples: String(form.get("examples") ?? ""), avoid: String(form.get("avoid") ?? "") });
    if (!f.success) throw new LaminaError("invalid_input", f.error.issues[0]!.message, 400);
    const urls = (f.data.urls ?? "").split(/\s+/).map((u) => u.trim()).filter(Boolean);
    if (urls.length > 5) throw new LaminaError("invalid_input", "Máximo 5 enlaces", 400);
    for (const u of urls) { try { const x = new URL(u); if (!/^https?:$/.test(x.protocol)) throw 0; } catch { throw new LaminaError("invalid_input", `Enlace inválido: ${u.slice(0, 60)}`, 400); } }
    const files = form.getAll("files").filter((x): x is File => x instanceof File && x.size > 0);
    if (files.length > MAX_FILES) throw new LaminaError("invalid_input", `Máximo ${MAX_FILES} archivos`, 400);
    for (const file of files) {
      if (!ALLOWED.test(file.name)) throw new LaminaError("invalid_input", `Tipo no admitido: ${file.name.slice(0, 60)} (solo PDF, DOCX, TXT o MD)`, 415);
      if (file.size > MAX_FILE) throw new LaminaError("invalid_input", `${file.name.slice(0, 60)} supera 20 MB`, 413);
    }
    if ((files.length || urls.length || f.data.notes) && form.get("consent") !== "on")
      throw new LaminaError("invalid_input", "Debes aceptar el aviso de privacidad para enviar materiales a la IA", 400);

    await consumeQuota(db, user.id, "presentation_new");
    quotaTaken = true;
    const p = await wf.createPresentation(db, user.id, { title: f.data.topic.slice(0, 200), topic: f.data.topic, level: f.data.level, objective: f.data.objective, subject: f.data.subject || null, period: f.data.period || null, groupName: f.data.group || null, area: f.data.area || null, length: f.data.length || null, extraNotes: guidanceNotes({ prior: f.data.prior ?? "", examples: f.data.examples ?? "", avoid: f.data.avoid ?? "" }) });
    presId = p.id;

    const notes = (f.data.notes ?? "").trim();
    if (notes) {
      const [s] = await db.insert(schema.sources).values({ presentationId: p.id, kind: "notes", origin: "teacher", title: "Apuntes del docente", status: "ok" }).returning();
      const chunks = chunkText([{ text: notes }]);
      if (chunks.length) await db.insert(schema.sourceChunks).values(chunks.map((c) => ({ sourceId: s!.id, presentationId: p.id, ord: c.ord, page: null, text: c.text })));
    }
    for (const u of urls) await db.insert(schema.sources).values({ presentationId: p.id, kind: "url", origin: "teacher", url: u, title: new URL(u).hostname, status: "pending" });
    if (files.length) {
      const dir = path.join(presentationDir(p.id), "uploads");
      await fs.mkdir(dir, { recursive: true });
      for (const file of files) {
        const buf = Buffer.from(await file.arrayBuffer());
        const id = randomUUID();
        const storagePath = path.join(dir, id);
        await fs.writeFile(storagePath, buf, { mode: 0o600 });
        const [u] = await db.insert(schema.uploads).values({ presentationId: p.id, filename: file.name.slice(0, 200), mime: file.type || "application/octet-stream", bytes: buf.length, sha256: createHash("sha256").update(buf).digest("hex"), storagePath }).returning();
        await db.insert(schema.sources).values({ presentationId: p.id, kind: "upload", origin: "teacher", title: file.name.slice(0, 200), uploadId: u!.id, status: "pending" });
      }
    }
    if (files.some((x) => /\.pdf$/i.test(x.name)) && form.get("consent_ocr_vision") === "on")
      await db.insert(schema.events).values({ name: "consent_ocr_vision", userId: user.id, presentationId: p.id, data: { version: OCR_CONSENT_VERSION } });
    const payload = { presentationId: p.id, userId: user.id, versionBase: "0" };
    await wf.beginContentGeneration(db, p.id, user.id, { name: "research", payload });
    await enqueue(await getBoss(), "research", payload, { base: "0" });
    void hashJson;
    return NextResponse.json({ id: p.id });
  } catch (e) {
    if (presId) { const { deletePresentationData } = await import("@/lib/cleanup"); await deletePresentationData(presId).catch(() => {}); }
    if (quotaTaken && userId) await refundQuota(db, userId, "presentation_new").catch(() => {});
    if (e instanceof LaminaError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    console.error("[create presentation]", e);
    return NextResponse.json({ error: "No se pudo crear la presentación. Inténtalo de nuevo." }, { status: 500 });
  }
}
