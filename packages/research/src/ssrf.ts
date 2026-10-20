import { BlockList, isIP } from "node:net";
import dns from "node:dns";
import { Agent } from "undici";
import { LaminaError } from "@lamina/contracts";

const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24],
  ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) blocked.addSubnet(net, prefix, "ipv4");
for (const [net, prefix] of [["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8], ["2001:db8::", 32], ["64:ff9b::", 96]] as const)
  blocked.addSubnet(net, prefix, "ipv6");

export function isBlockedIp(ip: string): boolean {
  const kind = isIP(ip);
  if (!kind) return true;
  if (kind === 6) {
    const m = ip.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (m) return isBlockedIp(m[1]!);
    const hex = ip.toLowerCase().match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hex) {
      const a = parseInt(hex[1]!, 16), b = parseInt(hex[2]!, 16);
      return isBlockedIp(`${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`);
    }
    return blocked.check(ip, "ipv6");
  }
  return blocked.check(ip, "ipv4");
}

export type SafeFetchOptions = {
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  allowedTypes?: RegExp;
  /** Solo para pruebas: sustituye la comprobación de IP bloqueada. */
  ipBlocked?: (ip: string) => boolean;
  allowedPorts?: number[];
};

export const DEFAULT_ALLOWED_TYPES = /^(text\/(html|plain|markdown)|application\/(xhtml\+xml|pdf|vnd\.openxmlformats-officedocument\.wordprocessingml\.document))/i;

function checkUrl(u: URL, ports: number[]) {
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new LaminaError("ssrf_blocked", "Solo se permiten URLs http(s)", 400);
  if (u.username || u.password) throw new LaminaError("ssrf_blocked", "URL con credenciales no permitida", 400);
  const port = u.port ? Number(u.port) : u.protocol === "https:" ? 443 : 80;
  if (!ports.includes(port)) throw new LaminaError("ssrf_blocked", "Puerto no permitido", 400);
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local"))
    throw new LaminaError("ssrf_blocked", "Host no permitido", 400);
}

function makeAgent(ipBlocked: (ip: string) => boolean) {
  return new Agent({
    connect: {
      // La comprobación ocurre en el momento de conectar, sobre la IP realmente usada (evita DNS rebinding).
      lookup: (hostname, options, cb) => {
        dns.lookup(hostname, { ...(options as object), all: true }, (err, addrs) => {
          if (err) return cb(err, "", 0);
          const list = addrs as unknown as dns.LookupAddress[];
          if (!list.length || list.some((a) => ipBlocked(a.address))) return cb(new LaminaError("ssrf_blocked", "El host resuelve a una dirección no permitida", 400) as any, "", 0);
          const first = list[0]!;
          if ((options as any)?.all) return (cb as any)(null, list);
          cb(null, first.address, first.family);
        });
      },
    },
  });
}

export type FetchedDoc = { url: string; contentType: string; body: Buffer };

export async function safeFetch(rawUrl: string, opts: SafeFetchOptions = {}): Promise<FetchedDoc> {
  const maxBytes = opts.maxBytes ?? 5 * 1024 * 1024;
  const maxRedirects = opts.maxRedirects ?? 3;
  const types = opts.allowedTypes ?? DEFAULT_ALLOWED_TYPES;
  const ports = opts.allowedPorts ?? [80, 443];
  const agent = makeAgent(opts.ipBlocked ?? isBlockedIp);
  const deadline = Date.now() + (opts.timeoutMs ?? 15_000);
  let url: URL;
  try { url = new URL(rawUrl); } catch { throw new LaminaError("invalid_input", "URL inválida", 400); }

  try {
    for (let hop = 0; hop <= maxRedirects; hop++) {
      checkUrl(url, ports);
      const literal = url.hostname.replace(/^\[|\]$/g, "");
      if (isIP(literal) && (opts.ipBlocked ?? isBlockedIp)(literal)) throw new LaminaError("ssrf_blocked", "Dirección IP no permitida", 400);
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), Math.max(1, deadline - Date.now()));
      let res: Response;
      try {
        res = await fetch(url, {
          redirect: "manual",
          signal: ctrl.signal,
          headers: { "user-agent": "LaminaBot/1.0 (+https://lamina.cupula.com.ec)", accept: "text/html,application/pdf,text/plain;q=0.9,*/*;q=0.1" },
          // @ts-expect-error dispatcher es una extensión de undici
          dispatcher: agent,
        });
      } catch (e) {
        clearTimeout(t);
        if (e instanceof LaminaError) throw e;
        const cause = (e as any)?.cause;
        if (cause instanceof LaminaError) throw cause;
        if (cause?.code === "ssrf_blocked") throw cause;
        throw new LaminaError("extraction_failed", `No se pudo descargar la URL (${(cause?.code ?? (e as Error).name) as string})`, 502);
      }
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        clearTimeout(t);
        await res.body?.cancel();
        if (hop === maxRedirects) throw new LaminaError("ssrf_blocked", "Demasiadas redirecciones", 400);
        url = new URL(res.headers.get("location")!, url);
        continue;
      }
      if (!res.ok) { clearTimeout(t); await res.body?.cancel(); throw new LaminaError("extraction_failed", `La URL respondió ${res.status}`, 502); }
      const ct = (res.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
      if (!types.test(ct)) { clearTimeout(t); await res.body?.cancel(); throw new LaminaError("extraction_failed", `Tipo de contenido no admitido: ${ct || "desconocido"}`, 415); }
      const declared = Number(res.headers.get("content-length"));
      if (declared > maxBytes) { clearTimeout(t); await res.body?.cancel(); throw new LaminaError("extraction_failed", "El documento supera el tamaño máximo (5 MB)", 413); }
      const chunks: Buffer[] = [];
      let total = 0;
      try {
        for await (const c of res.body as any as AsyncIterable<Uint8Array>) {
          total += c.byteLength;
          if (total > maxBytes) { ctrl.abort(); throw new LaminaError("extraction_failed", "El documento supera el tamaño máximo (5 MB)", 413); }
          chunks.push(Buffer.from(c));
        }
      } catch (e) {
        if (e instanceof LaminaError) throw e;
        throw new LaminaError("extraction_failed", "Descarga interrumpida o con tiempo agotado", 504);
      } finally { clearTimeout(t); }
      return { url: url.toString(), contentType: ct, body: Buffer.concat(chunks) };
    }
  } finally {
    await agent.close().catch(() => {});
  }
  throw new LaminaError("ssrf_blocked", "Demasiadas redirecciones", 400);
}
