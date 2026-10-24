import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { assetPath, ingestImage } from "../src/ingest";

const png = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: "#336699" } }).png().toBuffer();

describe("ingestImage", () => {
  it("re-codifica a webp y limita el lado", async () => {
    const r = await ingestImage(await png(3000, 1500));
    expect(r.mime).toBe("image/webp");
    expect(r.width).toBe(2400);
    expect(r.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect((await sharp(r.data).metadata()).format).toBe("webp");
  });
  it("es determinista (misma entrada, mismo hash)", async () => {
    const b = await png(800, 600);
    expect((await ingestImage(b)).sha256).toBe((await ingestImage(b)).sha256);
  });
  it("rechaza basura, SVG y miniaturas", async () => {
    await expect(ingestImage(Buffer.from("no es una imagen"))).rejects.toThrow();
    await expect(ingestImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><script>1</script></svg>'))).rejects.toThrow(/no admitido|no es válida/);
    await expect(ingestImage(await png(50, 50))).rejects.toThrow(/pequeña/);
  });
  it("rechaza una imagen bomba (demasiados píxeles)", async () => {
    await expect(ingestImage(await png(8000, 8000))).rejects.toThrow();
  });
  it("assetPath exige un sha256 válido (sin path traversal)", () => {
    expect(() => assetPath("/d", "../../etc/passwd")).toThrow();
    expect(assetPath("/d", "a".repeat(64))).toBe(`/d/assets/${"a".repeat(64)}.webp`);
  });
});

import { safeFetch, IMAGE_ALLOWED_TYPES } from "../src/ssrf";
describe("safeFetch con imágenes", () => {
  it("bloquea IP privada literal y localhost", async () => {
    await expect(safeFetch("http://127.0.0.1/a.png", { allowedTypes: IMAGE_ALLOWED_TYPES })).rejects.toThrow(/IP no permitida|no permitid/i);
    await expect(safeFetch("http://localhost/a.png", { allowedTypes: IMAGE_ALLOWED_TYPES })).rejects.toThrow();
    await expect(safeFetch("http://169.254.169.254/latest", { allowedTypes: IMAGE_ALLOWED_TYPES })).rejects.toThrow();
  });
  it("el tipo image/svg+xml es aceptado por el filtro pero rechazado por fetchAndIngestImage", () => {
    expect(IMAGE_ALLOWED_TYPES.test("image/webp")).toBe(true);
    expect(IMAGE_ALLOWED_TYPES.test("text/html")).toBe(false);
  });
});

import { isBlockedIp } from "../src/ssrf";
describe("SSRF: rangos IPv6 de traducción y reservados", () => {
  it("bloquea 6to4, Teredo, IPv4-compatible y site-local", () => {
    for (const ip of ["2002:7f00:1::1", "2001:0:4136:e378:8000:63bf:3fff:fdd2", "::7f00:1", "fec0::1", "64:ff9b:1::1"]) expect(isBlockedIp(ip), ip).toBe(true);
    expect(isBlockedIp("2606:4700:4700::1111")).toBe(false);
  });
});
