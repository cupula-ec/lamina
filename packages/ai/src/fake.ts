import type { ChatRequest, ChatResult, Provider } from "./types";

/** Proveedor determinista para pruebas y desarrollo sin clave: delega en generadores registrados por tarea. */
export type FakeHandler = (req: ChatRequest) => unknown | Promise<unknown>;

export class FakeProvider implements Provider {
  calls: ChatRequest[] = [];
  constructor(private handlers: Record<string, FakeHandler>, private opts: { latencyMs?: number; failTasks?: Record<string, "rate" | "quota" | "invalid"> } = {}) {}
  async chat(req: ChatRequest): Promise<ChatResult> {
    this.calls.push(req);
    if (this.opts.latencyMs) await new Promise((r) => setTimeout(r, this.opts.latencyMs));
    const h = this.handlers[req.task];
    if (!h) throw new Error(`FakeProvider: sin handler para la tarea ${req.task}`);
    const out = await h(req);
    return { text: typeof out === "string" ? out : JSON.stringify(out), promptTokens: 0, completionTokens: 0 };
  }
}
