import { describe, expect, it } from "vitest";
import { localizeAssets, offlineHtml } from "../src/offline";

describe("exportación offline", () => {
  it("sustituye las imágenes internas por rutas relativas y no deja referencias al servidor", async () => {
    const deck = { meta: { branding: { institution: { logoUrl: "/api/branding/institution/abc" }, personalLogoUrl: "/api/branding/personal/u1?exp=1&sig=x" } }, slides: [{ slots: { a: { props: { src: "/api/assets/11111111-1111-4111-8111-111111111111?exp=1&sig=y" } }, b: { props: { src: "/api/assets/11111111-1111-4111-8111-111111111111?exp=1&sig=y" } } } }] };
    const calls: string[] = [];
    const r = await localizeAssets(deck, async (u) => { calls.push(u); return { body: new Uint8Array([1, 2, 3]), type: u.includes("branding") ? "image/png" : "image/webp" }; });
    const json = JSON.stringify(r.deck);
    expect(json).not.toContain("/api/");
    expect(Object.keys(r.files).sort()).toEqual(["assets/1.png", "assets/2.png", "assets/3.webp"]);
    expect(calls.length).toBe(3); // la misma imagen usada dos veces se descarga una vez
    expect(r.missing).toBe(0);
  });
  it("una imagen que no se puede descargar se cuenta y se quita", async () => {
    const r = await localizeAssets({ x: "/api/assets/zzz" }, async () => null);
    expect(r.missing).toBe(1);
    expect((r.deck as { x: string }).x).toBe("");
  });
  it("el HTML incrusta los datos sin poder cerrar el script ni inyectar etiquetas", () => {
    const html = offlineHtml({ js: "var a='</script><b>';", css: "body{}" }, { deck: { meta: { title: "</script><img src=x onerror=alert(1)>" } }, prov: [] });
    expect(html.match(/<\/script>/g)!.length).toBe(2); // solo los dos cierres propios
    expect(html).not.toContain("<img src=x");
    expect(html).not.toMatch(/https?:\/\//);
  });
});
