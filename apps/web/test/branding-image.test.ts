import fs from "node:fs";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { LaminaError } from "@lamina/contracts";
import { assertSafeSvg, LOGO_MAX_BYTES, processLogo, sniffLogo } from "../src/lib/branding-image";

const svgWrap = (inner: string, attrs = "") => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 40" width="100" height="40"${attrs}>${inner}</svg>`;
const rect = '<rect width="100" height="40" fill="#003976"/>';
const raster = (w = 64, h = 32) => sharp({ create: { width: w, height: h, channels: 4, background: "#003976" } });

async function reject(buf: Buffer, status?: number) {
  const err = await processLogo(buf).then(() => null, (e) => e);
  expect(err).toBeInstanceOf(LaminaError);
  expect((err as LaminaError).code).toBe("invalid_input");
  if (status) expect((err as LaminaError).status).toBe(status);
  return err as LaminaError;
}
const isPng = (b: Buffer) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

describe("sniffLogo (magic bytes)", () => {
  it("reconoce PNG, JPEG, WebP y SVG por contenido", async () => {
    expect(sniffLogo(await raster().png().toBuffer())).toBe("png");
    expect(sniffLogo(await raster().jpeg().toBuffer())).toBe("jpeg");
    expect(sniffLogo(await raster().webp().toBuffer())).toBe("webp");
    expect(sniffLogo(Buffer.from(svgWrap(rect)))).toBe("svg");
    expect(sniffLogo(Buffer.from(`<?xml version="1.0"?>\n<!-- x -->\n${svgWrap(rect)}`))).toBe("svg");
  });
  it("no reconoce HTML, GIF ni texto", () => {
    expect(sniffLogo(Buffer.from("<html><body>hola</body></html>"))).toBeNull();
    expect(sniffLogo(Buffer.from("GIF89a\x01\x00\x01\x00"))).toBeNull();
    expect(sniffLogo(Buffer.from("hola mundo"))).toBeNull();
    expect(sniffLogo(Buffer.alloc(0))).toBeNull();
  });
});

describe("processLogo: raster", () => {
  it("re-encodea todo a PNG (también JPEG y WebP)", async () => {
    for (const b of [await raster().png().toBuffer(), await raster().jpeg().toBuffer(), await raster().webp().toBuffer()]) {
      const out = await processLogo(b);
      expect(isPng(out.png)).toBe(true);
      expect(out.width).toBe(64);
      expect(out.height).toBe(32);
    }
  });
  it("reduce a 1024 px de lado máximo y nunca amplía un raster", async () => {
    const big = await processLogo(await raster(3000, 1500).png().toBuffer());
    expect(Math.max(big.width, big.height)).toBe(1024);
    expect(big.width / big.height).toBeCloseTo(2, 1);
    expect((await processLogo(await raster(100, 100).png().toBuffer())).width).toBe(100);
  });
  it("elimina metadatos EXIF", async () => {
    const withExif = await raster().jpeg().withExif({ IFD0: { Copyright: "secreto-gps" } }).toBuffer();
    expect((await sharp(withExif).metadata()).exif).toBeDefined();
    const out = await processLogo(withExif);
    expect((await sharp(out.png).metadata()).exif).toBeUndefined();
    expect(out.png.toString("latin1")).not.toContain("secreto-gps");
  });
  it("polyglot: un PNG válido con HTML/script al final sale limpio", async () => {
    const poly = Buffer.concat([await raster().png().toBuffer(), Buffer.from("<html><script>alert(document.cookie)</script></html>")]);
    expect(sniffLogo(poly)).toBe("png");
    const out = await processLogo(poly);
    expect(isPng(out.png)).toBe(true);
    expect(out.png.toString("latin1")).not.toMatch(/<script|<html|alert\(/);
  });
  it("polyglot: JPEG con script en un comentario sale sin él", async () => {
    const jpg = await raster().jpeg().toBuffer();
    const note = Buffer.from("<script>alert(1)</script>");
    const poly = Buffer.concat([jpg.subarray(0, 2), Buffer.from([0xff, 0xfe, 0x00, note.length + 2]), note, jpg.subarray(2)]);
    const out = await processLogo(poly);
    expect(out.png.toString("latin1")).not.toContain("<script");
  });
  it("HTML renombrado .png es rechazado (415)", async () => {
    await reject(Buffer.from("<!doctype html><html><script>alert(1)</script></html>"), 415);
    await reject(Buffer.from("<html><body><img src=x onerror=alert(1)></body></html>"), 415);
  });
  it("archivo enorme (> 1 MB) es rechazado (413) sin procesarlo", async () => {
    const huge = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(LOGO_MAX_BYTES + 10, 1)]);
    await reject(huge, 413);
  });
  it("dimensiones excesivas (> 4000 px) y diminutas son rechazadas", async () => {
    await reject(await raster(4100, 8).png({ compressionLevel: 9 }).toBuffer());
    await reject(await raster(4, 4).png().toBuffer());
  });
  it("PNG con cabecera válida pero cuerpo corrupto, y archivo vacío", async () => {
    await reject(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("basura".repeat(20))]));
    await reject(Buffer.alloc(0));
  });
});

describe("SVG hostil", () => {
  const hostile: [string, string][] = [
    ["<script>", svgWrap('<script>alert(1)</script>' + rect)],
    ["onload", svgWrap(rect, ' onload="alert(1)"')],
    ["onclick en hijo", svgWrap('<rect width="10" height="10" onclick="alert(1)"/>')],
    ["on* con comillas simples y mayúsculas", svgWrap(rect, " ONLOAD='alert(1)'")],
    ["filter (carga costosa)", svgWrap('<filter id="f"><feGaussianBlur stdDeviation="9999"/></filter><rect width="10" height="10" filter="url(#f)"/>')],
    ["foreignObject", svgWrap('<foreignObject width="100" height="40"><body xmlns="http://www.w3.org/1999/xhtml"><iframe src="//evil"></iframe></body></foreignObject>')],
    ["href javascript:", svgWrap('<a href="javascript:alert(1)"><rect width="10" height="10"/></a>')],
    ["xlink:href javascript:", svgWrap('<a xlink:href="javascript:alert(1)"><rect width="10" height="10"/></a>')],
    ["image externa", svgWrap('<image href="https://evil.example/x.png" width="10" height="10"/>')],
    ["image file://", svgWrap('<image xlink:href="file:///etc/passwd" width="10" height="10"/>')],
    ["use externo", svgWrap('<use href="https://evil.example/sprite.svg#a"/>')],
    ["data:text/html", svgWrap('<image href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==" width="10" height="10"/>')],
    ["data:image/svg+xml", svgWrap('<image href="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" width="10" height="10"/>')],
    ["style con url() externo", svgWrap('<style>rect{fill:url(https://evil.example/a)}</style>' + rect)],
    ["atributo con url() externo", svgWrap('<rect width="10" height="10" style="background:url(//evil/x)"/>')],
    ["@import", svgWrap('<style>@import "https://evil.example/a.css";</style>' + rect)],
    ["entidad XML (XXE / billion laughs)", `<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;&a;">]>${svgWrap("<text>&b;</text>")}`],
    ["entidad XML externa", `<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]>${svgWrap("<text>&x;</text>")}`],
    ["entidad numérica ofuscada", svgWrap('<a href="&#106;avascript:alert(1)"><rect width="10" height="10"/></a>')],
    ["animate", svgWrap('<a href="#x"><animate attributeName="href" values="javascript:alert(1)"/><rect id="x" width="10" height="10"/></a>')],
    ["set", svgWrap('<set attributeName="onload" to="alert(1)"/>' + rect)],
    ["script con mayúsculas/espacios", svgWrap('< SCRIPT >alert(1)</ SCRIPT >' + rect).replace("< SCRIPT >", "<SCRIPT>").replace("</ SCRIPT >", "</SCRIPT>")],
  ];
  for (const [name, svg] of hostile) {
    it(`rechaza: ${name}`, async () => {
      const e = await reject(Buffer.from(svg));
      expect([400, 415]).toContain(e.status);
      expect(() => assertSafeSvg(svg)).toThrow(LaminaError);
    });
  }

  it("un SVG legítimo (formas, <style> sin url(), referencias internas #) se rasteriza a PNG", async () => {
    const svg = svgWrap('<defs><linearGradient id="g"><stop offset="0" stop-color="#003976"/><stop offset="1" stop-color="#FCC000"/></linearGradient></defs><style>.a{fill:url(#g)}</style><rect class="a" width="100" height="40"/><use href="#g"/>');
    const out = await processLogo(Buffer.from(svg));
    expect(isPng(out.png)).toBe(true);
    expect(out.png.toString("latin1")).not.toMatch(/<svg|<script/);
    expect(out.width).toBe(1024);
  });
  it("permite imágenes embebidas data:image/png (logos exportados con raster)", async () => {
    const b64 = (await raster(8, 8).png().toBuffer()).toString("base64");
    const out = await processLogo(Buffer.from(svgWrap(`<image width="100" height="40" href="data:image/png;base64,${b64}"/>`)));
    expect(isPng(out.png)).toBe(true);
  });
  it("el logo oficial de UPS pasa el sanitizador y se rasteriza", async () => {
    const svg = fs.readFileSync(new URL("../public/institutions/ups.svg", import.meta.url));
    const out = await processLogo(svg);
    expect(isPng(out.png)).toBe(true);
    expect(out.width).toBe(1024);
  });
  it("SVG muy grande en dimensiones es rechazado", async () => {
    await reject(Buffer.from(svgWrap(rect).replace('width="100" height="40"', 'width="9000" height="4000"')));
  });
});
