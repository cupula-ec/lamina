import { LaminaError } from "@lamina/contracts";

export type SearchHit = { title: string; url: string; snippet: string };
export interface SearchProvider {
  name: string;
  search(query: string, opts?: { max?: number; lang?: string }): Promise<SearchHit[]>;
}

export class SearxngProvider implements SearchProvider {
  name = "searxng";
  constructor(private baseUrl: string, private f: typeof fetch = fetch) {}
  async search(query: string, opts: { max?: number; lang?: string } = {}) {
    const u = new URL("/search", this.baseUrl);
    u.searchParams.set("q", query);
    u.searchParams.set("format", "json");
    u.searchParams.set("language", opts.lang ?? "es");
    u.searchParams.set("safesearch", "1");
    const res = await this.f(u, { signal: AbortSignal.timeout(15_000), headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`searxng ${res.status}`);
    const j = (await res.json()) as { results?: { title?: string; url?: string; content?: string }[] };
    return (j.results ?? []).filter((r) => r.url && r.title).slice(0, opts.max ?? 6).map((r) => ({ title: r.title!, url: r.url!, snippet: r.content ?? "" }));
  }
}

export class TavilyProvider implements SearchProvider {
  name = "tavily";
  constructor(private apiKey: string, private f: typeof fetch = fetch) {}
  async search(query: string, opts: { max?: number } = {}) {
    const res = await this.f("https://api.tavily.com/search", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ query, max_results: opts.max ?? 6, search_depth: "basic" }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`tavily ${res.status}`);
    const j = (await res.json()) as { results?: { title?: string; url?: string; content?: string }[] };
    return (j.results ?? []).filter((r) => r.url && r.title).map((r) => ({ title: r.title!, url: r.url!, snippet: r.content ?? "" }));
  }
}

/** Intenta cada proveedor en orden; si ninguno responde lanza error claro (no se simula búsqueda). */
export async function searchWithFallback(providers: SearchProvider[], query: string, opts?: { max?: number; lang?: string }): Promise<{ provider: string; hits: SearchHit[] }> {
  const errors: string[] = [];
  for (const p of providers) {
    try {
      const hits = await p.search(query, opts);
      if (hits.length) return { provider: p.name, hits };
      errors.push(`${p.name}: sin resultados`);
    } catch (e) {
      errors.push(`${p.name}: ${(e as Error).message}`);
    }
  }
  throw new LaminaError("provider_failed", `Búsqueda web no disponible (${errors.join("; ") || "sin proveedores configurados"})`, 503);
}
