import { Agent, request } from "undici";

/**
 * Cliente mínimo de la API de Docker por socket UNIX. Solo se usan 5 llamadas y SIEMPRE con la plantilla fija
 * de `containerConfig`: ningún dato del cliente llega a flags de Docker (sin binds, sin red, sin privilegios).
 */
export class Docker {
  private agent: Agent;
  constructor(socketPath = process.env.DOCKER_SOCKET ?? "/var/run/docker.sock") {
    this.agent = new Agent({ connect: { socketPath } });
  }
  private async call(method: string, path: string, body?: unknown) {
    const res = await request(`http://docker${path}`, { method: method as "GET", dispatcher: this.agent, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    const buf = Buffer.from(await res.body.arrayBuffer());
    return { status: res.statusCode, buf };
  }
  async create(config: unknown): Promise<string> {
    const r = await this.call("POST", "/containers/create", config);
    if (r.status !== 201) throw new Error(`docker create ${r.status}: ${r.buf.toString().slice(0, 300)}`);
    return JSON.parse(r.buf.toString()).Id as string;
  }
  async start(id: string) { const r = await this.call("POST", `/containers/${id}/start`); if (r.status >= 300) throw new Error(`docker start ${r.status}: ${r.buf.toString().slice(0, 300)}`); }
  async wait(id: string, ms: number): Promise<{ timedOut: boolean; exitCode?: number }> {
    const p = this.call("POST", `/containers/${id}/wait?condition=not-running`).then((r) => ({ timedOut: false, exitCode: JSON.parse(r.buf.toString()).StatusCode as number }));
    const t = new Promise<{ timedOut: true }>((res) => setTimeout(() => res({ timedOut: true }), ms));
    const r = await Promise.race([p, t]);
    if (r.timedOut) await this.call("POST", `/containers/${id}/kill`).catch(() => {});
    return r;
  }
  /** stdout del contenedor (flujo multiplexado: cabeceras de 8 bytes por trama). */
  async logs(id: string, maxBytes = 3_000_000): Promise<string> {
    const r = await this.call("GET", `/containers/${id}/logs?stdout=1&stderr=1`);
    const out: Buffer[] = [];
    let i = 0, total = 0;
    const b = r.buf;
    while (i + 8 <= b.length) {
      const len = b.readUInt32BE(i + 4);
      const chunk = b.subarray(i + 8, i + 8 + len);
      total += chunk.length;
      if (total > maxBytes) break;
      out.push(chunk);
      i += 8 + len;
    }
    return Buffer.concat(out).toString("utf8");
  }
  async remove(id: string) { await this.call("DELETE", `/containers/${id}?force=1&v=1`).catch(() => {}); }
  async imageExists(name: string) { return (await this.call("GET", `/images/${encodeURIComponent(name)}/json`)).status === 200; }
}

export function containerConfig(opts: { image: string; runtime?: string; inputB64: string }) {
  return {
    Image: opts.image,
    Cmd: ["node", "/app/run.mjs"],
    User: "10002:10002",
    Env: [`LAMINA_INPUT=${opts.inputB64}`, "NODE_ENV=production"],
    NetworkDisabled: true,
    AttachStdout: false, AttachStderr: false, Tty: false,
    Labels: { "lamina.sandbox": "1" },
    HostConfig: {
      ...(opts.runtime ? { Runtime: opts.runtime } : {}),
      NetworkMode: "none",
      ReadonlyRootfs: true,
      Privileged: false,
      AutoRemove: false,
      Memory: 512 * 1024 * 1024,
      MemorySwap: 512 * 1024 * 1024,
      NanoCpus: 1_000_000_000,
      PidsLimit: 128,
      CapDrop: ["ALL"],
      SecurityOpt: ["no-new-privileges"],
      Tmpfs: { "/work": "rw,size=96m,mode=1777", "/tmp": "rw,size=64m,mode=1777" },
      Ulimits: [{ Name: "nofile", Soft: 512, Hard: 512 }],
      LogConfig: { Type: "json-file", Config: { "max-size": "8m", "max-file": "1" } },
    },
  };
}
