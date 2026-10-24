import { createHash } from "node:crypto";
import { LaminaError } from "@lamina/contracts";

/** Resultado de una búsqueda de imágenes. `url` es la imagen a descargar (siempre pasa por la ingesta); nunca se enlaza en un deck. */
export type ImageResult = {
  id: string;
  thumbUrl: string;
  url: string;
  pageUrl: string;
  width?: number;
  height?: number;
  provider: string;
  author?: string;
  license?: string;
  licenseUrl?: string;
  title?: string;
};

export interface ImageProvider {
  name: string;
  search(query: string, opts?: { max?: number; lang?: string }): Promise<ImageResult[]>;
}

const strip = (s: string | undefined) => s?.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim() || undefined;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const isHttp = (u: unknown): u is string => typeof u === "string" && /^https?:\/\//i.test(u);

export class WikimediaProvider implements ImageProvider {
  name = "wikimedia";
  constructor(private f: typeof fetch = fetch) {}
  async search(query: string, opts: { max?: number } = {}) {
    const u = new URL("https://commons.wikimedia.org/w/api.php");
    for (const [k, v] of Object.entries({
      action: "query", format: "json", generator: "search", gsrnamespace: "6", gsrsearch: `${query} filetype:bitmap`, gsrlimit: String(opts.max ?? 8),
      prop: "imageinfo", iiprop: "url|size|mime|extmetadata", iiurlwidth: "1600", iiextmetadatafilter: "Artist|LicenseShortName|LicenseUrl",
    })) u.searchParams.set(k, v);
    const res = await this.f(u, { signal: AbortSignal.timeout(15_000), headers: { accept: "application/json", "user-agent": "LaminaBot/1.0 (+https://lamina.cupula.com.ec)" } });
    if (!res.ok) throw new Error(`wikimedia ${res.status}`);
    const j = (await res.json()) as { query?: { pages?: Record<string, any> } };
    return Object.values(j.query?.pages ?? {}).flatMap((p: any) => {
      const ii = p.imageinfo?.[0];
      if (!ii || !/^image\/(png|jpeg|webp|gif)$/.test(ii.mime ?? "") || !isHttp(ii.thumburl ?? ii.url)) return [];
      const m = ii.extmetadata ?? {};
      return [{
        id: `wikimedia:${p.pageid}`, thumbUrl: String(ii.thumburl ?? ii.url), url: String(ii.thumburl ?? ii.url), pageUrl: String(ii.descriptionurl ?? ""),
        width: num(ii.thumbwidth) ?? num(ii.width), height: num(ii.thumbheight) ?? num(ii.height), provider: this.name,
        author: strip(m.Artist?.value), license: strip(m.LicenseShortName?.value), licenseUrl: strip(m.LicenseUrl?.value), title: strip(String(p.title ?? "").replace(/^File:/, "")),
      } satisfies ImageResult];
    });
  }
}

export class OpenverseProvider implements ImageProvider {
  name = "openverse";
  constructor(private f: typeof fetch = fetch) {}
  async search(query: string, opts: { max?: number } = {}) {
    const u = new URL("https://api.openverse.org/v1/images/");
    u.searchParams.set("q", query);
    u.searchParams.set("page_size", String(opts.max ?? 8));
    u.searchParams.set("mature", "false");
    const res = await this.f(u, { signal: AbortSignal.timeout(15_000), headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`openverse ${res.status}`);
    const j = (await res.json()) as { results?: any[] };
    return (j.results ?? []).filter((r) => isHttp(r.url)).map((r) => ({
      id: `openverse:${r.id}`, thumbUrl: isHttp(r.thumbnail) ? r.thumbnail : r.url, url: r.url, pageUrl: isHttp(r.foreign_landing_url) ? r.foreign_landing_url : r.url,
      width: num(r.width), height: num(r.height), provider: this.name, author: strip(r.creator), license: r.license ? `${String(r.license).toUpperCase()}${r.license_version ? ` ${r.license_version}` : ""}` : undefined,
      licenseUrl: isHttp(r.license_url) ? r.license_url : undefined, title: strip(r.title),
    } satisfies ImageResult));
  }
}

export class UnsplashProvider implements ImageProvider {
  name = "unsplash";
  constructor(private accessKey: string, private f: typeof fetch = fetch) {}
  async search(query: string, opts: { max?: number } = {}) {
    const u = new URL("https://api.unsplash.com/search/photos");
    u.searchParams.set("query", query);
    u.searchParams.set("per_page", String(opts.max ?? 8));
    u.searchParams.set("content_filter", "high");
    const res = await this.f(u, { signal: AbortSignal.timeout(15_000), headers: { authorization: `Client-ID ${this.accessKey}`, "accept-version": "v1" } });
    if (!res.ok) throw new Error(`unsplash ${res.status}`);
    const j = (await res.json()) as { results?: any[] };
    return (j.results ?? []).filter((r) => isHttp(r.urls?.regular)).map((r) => ({
      id: `unsplash:${r.id}`, thumbUrl: r.urls.small ?? r.urls.regular, url: r.urls.regular, pageUrl: r.links?.html ?? r.urls.regular, width: num(r.width), height: num(r.height),
      provider: this.name, author: strip(r.user?.name), license: "Unsplash License", licenseUrl: "https://unsplash.com/license", title: strip(r.alt_description ?? r.description),
    } satisfies ImageResult));
  }
}

export class PexelsProvider implements ImageProvider {
  name = "pexels";
  constructor(private apiKey: string, private f: typeof fetch = fetch) {}
  async search(query: string, opts: { max?: number } = {}) {
    const u = new URL("https://api.pexels.com/v1/search");
    u.searchParams.set("query", query);
    u.searchParams.set("per_page", String(opts.max ?? 8));
    const res = await this.f(u, { signal: AbortSignal.timeout(15_000), headers: { authorization: this.apiKey } });
    if (!res.ok) throw new Error(`pexels ${res.status}`);
    const j = (await res.json()) as { photos?: any[] };
    return (j.photos ?? []).filter((r) => isHttp(r.src?.large2x ?? r.src?.large)).map((r) => ({
      id: `pexels:${r.id}`, thumbUrl: r.src.medium ?? r.src.large, url: r.src.large2x ?? r.src.large, pageUrl: r.url, width: num(r.width), height: num(r.height),
      provider: this.name, author: strip(r.photographer), license: "Pexels License", licenseUrl: "https://www.pexels.com/license/", title: strip(r.alt),
    } satisfies ImageResult));
  }
}

/** Búsqueda web de imágenes vía SearXNG (`categories=images`). Sin licencia conocida: solo metadata de procedencia. */
export class SearxngImageProvider implements ImageProvider {
  name = "searxng";
  constructor(private baseUrl: string, private f: typeof fetch = fetch) {}
  async search(query: string, opts: { max?: number; lang?: string } = {}) {
    const u = new URL("/search", this.baseUrl);
    u.searchParams.set("q", query);
    u.searchParams.set("format", "json");
    u.searchParams.set("categories", "images");
    u.searchParams.set("language", opts.lang ?? "es");
    u.searchParams.set("safesearch", "1");
    const res = await this.f(u, { signal: AbortSignal.timeout(15_000), headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`searxng-images ${res.status}`);
    const j = (await res.json()) as { results?: any[] };
    return (j.results ?? []).filter((r) => isHttp(r.img_src)).slice(0, opts.max ?? 8).map((r) => {
      const [w, h] = typeof r.resolution === "string" ? r.resolution.split(/[x×]/).map((x: string) => Number(x.trim())) : [];
      return {
        id: `searxng:${createHash("sha1").update(String(r.img_src)).digest("hex").slice(0, 20)}`, thumbUrl: isHttp(r.thumbnail_src) ? r.thumbnail_src : r.img_src, url: r.img_src,
        pageUrl: isHttp(r.url) ? r.url : r.img_src, width: num(w), height: num(h), provider: this.name, author: strip(r.author), title: strip(r.title),
      } satisfies ImageResult;
    });
  }
}

/** Junta resultados en el orden de los proveedores (bancos libres primero) sin repetir URLs; los proveedores que fallan se omiten. */
export async function searchImages(providers: ImageProvider[], query: string, opts: { max?: number; lang?: string } = {}): Promise<{ results: ImageResult[]; errors: string[] }> {
  const max = opts.max ?? 12;
  const errors: string[] = [];
  const results: ImageResult[] = [];
  const seen = new Set<string>();
  for (const p of providers) {
    if (results.length >= max) break;
    try {
      for (const r of await p.search(query, { max: Math.min(8, max), lang: opts.lang })) {
        if (seen.has(r.url)) continue;
        seen.add(r.url);
        results.push(r);
      }
    } catch (e) { errors.push(`${p.name}: ${(e as Error).message}`); }
  }
  if (!results.length && errors.length) throw new LaminaError("provider_failed", `Búsqueda de imágenes no disponible (${errors.join("; ")})`, 503);
  return { results: results.slice(0, max), errors };
}

export type ImageProviderEnv = { searxngUrl?: string; unsplashKey?: string; pexelsKey?: string };
/** Orden del plan: Wikimedia, Openverse, Unsplash, Pexels (si hay clave) y SearXNG imágenes. */
export function defaultImageProviders(env: ImageProviderEnv, f: typeof fetch = fetch): ImageProvider[] {
  return [
    new WikimediaProvider(f), new OpenverseProvider(f),
    ...(env.unsplashKey ? [new UnsplashProvider(env.unsplashKey, f)] : []),
    ...(env.pexelsKey ? [new PexelsProvider(env.pexelsKey, f)] : []),
    ...(env.searxngUrl ? [new SearxngImageProvider(env.searxngUrl, f)] : []),
  ];
}

/** Elección automática: prefiere formato apaisado ≥ 800 px, bancos libres antes que la web abierta y orden de aparición como desempate. */
export function pickBestImage(results: ImageResult[], opts: { minWidth?: number } = {}): ImageResult | null {
  const rank: Record<string, number> = { wikimedia: 0, openverse: 1, unsplash: 1, pexels: 1, searxng: 3 };
  const min = opts.minWidth ?? 800;
  const score = (r: ImageResult, i: number) => {
    let s = -i * 0.1 - (rank[r.provider] ?? 2);
    if (r.width && r.width >= min) s += 2; else if (r.width) s -= 2;
    if (r.width && r.height) { const ar = r.width / r.height; if (ar >= 1.2 && ar <= 2) s += 1.5; else if (ar < 0.7) s -= 1; }
    return s;
  };
  return results.map((r, i) => ({ r, s: score(r, i) })).sort((a, b) => b.s - a.s)[0]?.r ?? null;
}
