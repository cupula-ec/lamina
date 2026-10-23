import { LaminaError } from "@lamina/contracts";
import { requireUserApi } from "@/lib/session";
import { requireOwner } from "@/lib/guard";

export const dynamic = "force-dynamic";

const TICK_MS = 1500;
/** La conexión se cierra sola tras este tiempo; EventSource reconecta y se revalida la sesión. */
const MAX_MS = 4 * 60_000;

const snapshot = (p: Awaited<ReturnType<typeof requireOwner>>) => ({
  stage: p.stage, prevStage: p.prevStage, lastError: p.lastError, progress: p.progress, resumeAt: p.resumeAt, updatedAt: p.updatedAt,
  currentContentVersionId: p.currentContentVersionId, currentDeckVersionId: p.currentDeckVersionId, finalDeckVersionId: p.finalDeckVersionId,
});

/** Eventos del estado de una presentación (SSE): `status` cuando cambia algo, comentario de latido si no. 401/403 se responden como HTTP normal. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let user;
  try {
    user = await requireUserApi();
    await requireOwner(id, user.id);
  } catch (e) {
    if (e instanceof LaminaError) return Response.json({ error: e.message, code: e.code }, { status: e.status });
    return Response.json({ error: "error" }, { status: 500 });
  }
  const enc = new TextEncoder();
  const uid = user.id;
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stream = new ReadableStream({
    start(controller) {
      const started = Date.now();
      let last = "";
      const send = (chunk: string) => { if (closed) return false; try { controller.enqueue(enc.encode(chunk)); return true; } catch { closed = true; return false; } };
      const close = () => { if (closed && !timer) return; closed = true; clearTimeout(timer); timer = undefined; try { controller.close(); } catch { /* ya cerrado */ } };
      // Un tick a la vez (setTimeout encadenado): si la BD tarda no se solapan, y tras cerrar no se emite nada.
      const tick = async () => {
        if (closed) return;
        try {
          const p = await requireOwner(id, uid);
          const body = JSON.stringify(snapshot(p));
          if (body !== last) { last = body; send(`event: status\ndata: ${body}\n\n`); } else send(": ping\n\n");
        } catch (e) {
          send(`event: fail\ndata: ${JSON.stringify({ code: e instanceof LaminaError ? e.code : "error" })}\n\n`);
          return close();
        }
        if (closed || Date.now() - started > MAX_MS) return close();
        timer = setTimeout(() => void tick(), TICK_MS);
      };
      req.signal.addEventListener("abort", close);
      send("retry: 3000\n\n");
      void tick();
    },
    cancel() { closed = true; clearTimeout(timer); },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store, no-transform", connection: "keep-alive", "x-accel-buffering": "no" } });
}
