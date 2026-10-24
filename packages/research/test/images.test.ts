import { describe, expect, it } from "vitest";
import { OpenverseProvider, PexelsProvider, SearxngImageProvider, WikimediaProvider, pickBestImage, searchImages, type ImageProvider } from "../src/images";

const json = (body: unknown, ok = true) => (async () => ({ ok, status: ok ? 200 : 500, json: async () => body })) as unknown as typeof fetch;

describe("proveedores de imágenes", () => {
  it("wikimedia: normaliza autor y licencia", async () => {
    const f = json({ query: { pages: { "1": { pageid: 1, title: "File:Cell.jpg", imageinfo: [{ mime: "image/jpeg", thumburl: "https://upload.wikimedia.org/c.jpg", url: "https://upload.wikimedia.org/o.jpg", descriptionurl: "https://commons.wikimedia.org/wiki/File:Cell.jpg", thumbwidth: 1600, thumbheight: 900, extmetadata: { Artist: { value: "<a>Ana</a>" }, LicenseShortName: { value: "CC BY-SA 4.0" } } }] } } } });
    const [r] = await new WikimediaProvider(f).search("célula");
    expect(r).toMatchObject({ provider: "wikimedia", author: "Ana", license: "CC BY-SA 4.0", width: 1600, title: "Cell.jpg" });
  });
  it("wikimedia: descarta tipos que no son bitmap", async () => {
    const f = json({ query: { pages: { "1": { pageid: 1, title: "File:x.svg", imageinfo: [{ mime: "image/svg+xml", url: "https://u/x.svg" }] } } } });
    expect(await new WikimediaProvider(f).search("x")).toEqual([]);
  });
  it("openverse y pexels mapean campos", async () => {
    const o = await new OpenverseProvider(json({ results: [{ id: "a", url: "https://i/a.jpg", creator: "Luis", license: "by", license_version: "4.0", width: 1200, height: 800 }] })).search("q");
    expect(o[0]).toMatchObject({ id: "openverse:a", license: "BY 4.0", author: "Luis" });
    const p = await new PexelsProvider("k", json({ photos: [{ id: 7, url: "https://p/7", photographer: "Eva", src: { large2x: "https://i/7.jpg", medium: "https://i/7m.jpg" }, width: 2000, height: 1000 }] })).search("q");
    expect(p[0]).toMatchObject({ provider: "pexels", author: "Eva" });
  });
  it("searxng parsea la resolución", async () => {
    const [r] = await new SearxngImageProvider("http://s", json({ results: [{ img_src: "https://i/x.png", resolution: "1024 x 768", url: "https://pagina" }] })).search("q");
    expect(r).toMatchObject({ width: 1024, height: 768, pageUrl: "https://pagina" });
  });
});

describe("searchImages / pickBestImage", () => {
  const ok = (name: string, urls: string[]): ImageProvider => ({ name, search: async () => urls.map((u, i) => ({ id: `${name}:${i}`, thumbUrl: u, url: u, pageUrl: u, provider: name, width: 1600, height: 900 })) });
  const bad: ImageProvider = { name: "bad", search: async () => { throw new Error("boom"); } };
  it("omite proveedores caídos y repetidos", async () => {
    const r = await searchImages([bad, ok("a", ["https://x/1", "https://x/2"]), ok("b", ["https://x/2", "https://x/3"])], "q");
    expect(r.results.map((x) => x.url)).toEqual(["https://x/1", "https://x/2", "https://x/3"]);
    expect(r.errors).toEqual(["bad: boom"]);
  });
  it("falla claro si todos caen", async () => { await expect(searchImages([bad], "q")).rejects.toThrow(/no disponible/); });
  it("prefiere banco libre apaisado y grande", () => {
    const a = { id: "1", thumbUrl: "", url: "u1", pageUrl: "", provider: "searxng", width: 1600, height: 900 };
    const b = { id: "2", thumbUrl: "", url: "u2", pageUrl: "", provider: "wikimedia", width: 1600, height: 900 };
    const c = { id: "3", thumbUrl: "", url: "u3", pageUrl: "", provider: "wikimedia", width: 300, height: 900 };
    expect(pickBestImage([a, c, b])?.id).toBe("2");
    expect(pickBestImage([])).toBeNull();
  });
});
