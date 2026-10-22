import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { LaminaError, DeckDocument } from "@lamina/contracts";
import { createDb, runMigrations, schema, seedInstitutions } from "@lamina/db";

const ADMIN_URL = "postgres://lamina:lamina@127.0.0.1:55432/postgres";
const URL_ = "postgres://lamina:lamina@127.0.0.1:55432/lamina_web_test";
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), "lamina-branding-"));
process.env.DATABASE_URL = URL_;
process.env.DATA_DIR = DATA;
process.env.BETTER_AUTH_SECRET = "x".repeat(40);

type U = { id: string; email: string; name: string; role: string; mustChangePassword: boolean; consentAt: Date | null; onboardedAt: Date | null };
const state: { current: U | null } = { current: null };
let h: ReturnType<typeof createDb>;

vi.mock("@/lib/db", () => ({ getDb: () => h.db }));
vi.mock("@/lib/session", () => {
  const need = () => { if (!state.current) throw new LaminaError("unauthorized", "Inicia sesión para continuar", 401); return state.current; };
  return {
    getSessionUser: async () => state.current,
    requireUserApi: async () => need(),
    requireAdminApi: async () => { const u = need(); if (u.role !== "admin") throw new LaminaError("forbidden", "Solo administradores", 403); return u; },
  };
});

const personal = () => import("../src/app/api/branding/personal/route");
const personalGet = () => import("../src/app/api/branding/personal/[userId]/route");
const institution = () => import("../src/app/api/branding/institution/[id]/route");
const lib = () => import("../src/lib/branding");

const mkUser = (id: string, role = "teacher"): U => ({ id, email: `${id}@t.test`, name: id, role, mustChangePassword: false, consentAt: new Date(), onboardedAt: new Date() });
const A = mkUser("userA1"), B = mkUser("userB1"), ADM = mkUser("adminX1", "admin");
const png = (c = "#003976") => sharp({ create: { width: 64, height: 32, channels: 4, background: c } }).png().toBuffer();
const upload = (buf: Buffer, url = "http://x/api/branding/personal", name = "logo.png", type = "image/png") => {
  const fd = new FormData();
  fd.set("logo", new File([new Uint8Array(buf)], name, { type }));
  return new Request(url, { method: "POST", body: fd });
};
const ctx = <T extends object>(p: T) => ({ params: Promise.resolve(p) });
const get = (url: string) => new Request(`http://x${url}`);

beforeAll(async () => {
  const admin = createDb(ADMIN_URL, 1);
  await admin.pool.query("drop database if exists lamina_web_test with (force)");
  await admin.pool.query("create database lamina_web_test");
  await admin.pool.end();
  h = createDb(URL_, 4);
  await runMigrations(h.db);
  await seedInstitutions(h.db);
  for (const u of [A, B, ADM]) {
    await h.db.insert(schema.user).values({ id: u.id, name: u.name, email: u.email });
    await h.db.insert(schema.userProfiles).values({ userId: u.id, consentAt: u.consentAt, onboardedAt: u.onboardedAt });
  }
});
afterAll(async () => { await h.pool.end(); fs.rmSync(DATA, { recursive: true, force: true }); });
beforeEach(() => { state.current = A; });

describe("logo personal: autorización entre cuentas", () => {
  let urlA = "";
  it("A sube su logo; se guarda re-encodeado como PNG con nombre propio", async () => {
    const res = await (await personal()).POST(upload(await png()));
    expect(res.status).toBe(200);
    urlA = (await res.json()).url;
    expect(urlA).toMatch(/^\/api\/branding\/personal\/userA1\?v=[0-9a-f]{8}$/);
    const [p] = await h.db.select().from(schema.userProfiles).where(eq(schema.userProfiles.userId, A.id));
    expect(p!.personalLogoPath).toMatch(/^userA1-[0-9a-f]{8}\.png$/);
    const buf = fs.readFileSync(path.join(DATA, "branding", "personal", p!.personalLogoPath!));
    expect(buf.subarray(1, 4).toString()).toBe("PNG");
  });

  it("el dueño lo recibe con cabeceras seguras", async () => {
    const r = await (await personalGet()).GET(get(urlA), ctx({ userId: A.id }));
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/png");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(r.headers.get("content-disposition")).toBe("inline");
    expect(r.headers.get("cache-control")).toMatch(/^private/);
  });

  it("otra cuenta (B) y un anónimo reciben 404, indistinguible de inexistente", async () => {
    const g = (await personalGet()).GET;
    state.current = B;
    const rb = await g(get(urlA), ctx({ userId: A.id }));
    expect(rb.status).toBe(404);
    state.current = null;
    const ra = await g(get(urlA), ctx({ userId: A.id }));
    expect(ra.status).toBe(404);
    const none = await g(get("/api/branding/personal/nadie"), ctx({ userId: "nadie" }));
    expect(none.status).toBe(404);
    expect(await rb.text()).toBe(await none.text());
  });

  it("URL firmada: válida para anónimos; falla si está alterada, caducada o es de otro usuario", async () => {
    const { withSignedBranding } = await lib();
    const deck = DeckDocument.parse({ schemaVersion: 1, engineVersion: "1", themeId: "lamina-claro", meta: { title: "t", topic: "t", level: "u", language: "es", branding: { personalLogoUrl: urlA, teacher: "A" } }, slides: [{ id: "s", layout: "title", slots: { main: { componentId: "Title", version: "1.0.0", props: { title: "x" } } }, notes: "", build: { steps: [] }, transition: "fade" }] });
    const signed = withSignedBranding(deck, 600, A.id).meta.branding!.personalLogoUrl!;
    expect(signed).toMatch(/^\/api\/branding\/personal\/userA1\?v=[0-9a-f]{8}&exp=\d+&sig=[0-9a-f]{64}$/);
    expect(withSignedBranding(deck, 600, A.id).meta.branding!.teacher).toBe("A");
    expect(deck.meta.branding!.personalLogoUrl).toBe(urlA);
    state.current = null;
    const g = (await personalGet()).GET;
    expect((await g(get(signed), ctx({ userId: A.id }))).status).toBe(200);
    expect((await g(get(signed.replace(/sig=./, "sig=0")), ctx({ userId: A.id }))).status).toBe(404);
    expect((await g(get(signed), ctx({ userId: B.id }))).status).toBe(404);
    const expired = withSignedBranding(deck, -5, A.id).meta.branding!.personalLogoUrl!;
    expect((await g(get(expired), ctx({ userId: A.id }))).status).toBe(404);
    const exp2 = signed.replace(/exp=\d+/, `exp=${Math.floor(Date.now() / 1000) + 99999}`);
    expect((await g(get(exp2), ctx({ userId: A.id }))).status).toBe(404);
  });

  it("logo personal de otro usuario: no se firma y se descarta; formas no canónicas no pasan el esquema", async () => {
    const { withSignedBranding } = await lib();
    const mk = (personalLogoUrl: string) => ({ schemaVersion: 1, engineVersion: "1", themeId: "lamina-claro", meta: { title: "t", topic: "t", level: "u", language: "es", branding: { personalLogoUrl, teacher: "A" } }, slides: [{ id: "s", layout: "title", slots: { main: { componentId: "Title", version: "1.0.0", props: { title: "x" } } }, notes: "", build: { steps: [] }, transition: "fade" }] });
    const deck = DeckDocument.parse(mk(urlA));
    const out = withSignedBranding(deck, 600, B.id).meta.branding!;
    expect(out.personalLogoUrl).toBeUndefined();
    expect(out.teacher).toBe("A");
    for (const bad of ["/api/branding/personal/../x", "/api/branding/personal/userA1/../../institution/x", "/api/branding/personal/userA1?v=zzzzzzzz&exp=1&sig=a", "/api/branding/institution/not-a-uuid"]) {
      expect(DeckDocument.safeParse(mk(bad)).success, bad).toBe(false);
    }
  });

  it("B sube el suyo y no toca el de A", async () => {
    state.current = B;
    const r = await (await personal()).POST(upload(await png("#ff0000")));
    expect(r.status).toBe(200);
    const [pa] = await h.db.select().from(schema.userProfiles).where(eq(schema.userProfiles.userId, A.id));
    const [pb] = await h.db.select().from(schema.userProfiles).where(eq(schema.userProfiles.userId, B.id));
    expect(pa!.personalLogoPath).not.toBe(pb!.personalLogoPath);
    state.current = B;
    expect((await (await personalGet()).GET(get("/x"), ctx({ userId: A.id }))).status).toBe(404);
  });

  it("subir sin sesión no está permitido", async () => {
    state.current = null;
    expect((await (await personal()).POST(upload(await png()))).status).toBe(401);
  });

  it("archivos hostiles son rechazados y el logo anterior no cambia", async () => {
    const before = (await h.db.select().from(schema.userProfiles).where(eq(schema.userProfiles.userId, A.id)))[0]!.personalLogoPath;
    const P = (await personal()).POST;
    const html = await P(upload(Buffer.from("<html><script>alert(1)</script></html>"), undefined, "logo.png", "image/png"));
    expect(html.status).toBe(415);
    const svg = await P(upload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect width="9" height="9"/></svg>'), undefined, "x.svg", "image/svg+xml"));
    expect(svg.status).toBe(400);
    const svgScript = await P(upload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), undefined, "x.png", "image/png"));
    expect(svgScript.status).toBe(400);
    const bigReq = upload(Buffer.concat([await png(), Buffer.alloc(2 * 1024 * 1024)]));
    const big = await P(new Request(bigReq.url, { method: "POST", headers: { "content-type": bigReq.headers.get("content-type")!, "content-length": String(2 * 1024 * 1024 + 500) }, body: await bigReq.arrayBuffer() }));
    expect(big.status).toBe(413);
    const poly = await P(upload(Buffer.concat([await png(), Buffer.from("<script>alert(1)</script>")])));
    expect(poly.status).toBe(200);
    const [after] = await h.db.select().from(schema.userProfiles).where(eq(schema.userProfiles.userId, A.id));
    expect(after!.personalLogoPath).not.toBe(before);
    const saved = fs.readFileSync(path.join(DATA, "branding", "personal", after!.personalLogoPath!));
    expect(saved.toString("latin1")).not.toContain("<script");
    // política ADR-011: el archivo anterior se conserva (los decks guardados lo referencian por ?v=) y se sirve por su versión
    expect(fs.existsSync(path.join(DATA, "branding", "personal", before!))).toBe(true);
    const { readLogoVersion } = await lib();
    const { logoVersion } = await import("@lamina/db");
    expect(await readLogoVersion("personal", A.id, after!.personalLogoPath, logoVersion(before!))).not.toBeNull();
    expect(await readLogoVersion("personal", A.id, after!.personalLogoPath, "deadbeef")).toBeNull();
    expect(await readLogoVersion("personal", B.id, after!.personalLogoPath, logoVersion(before!))).toBeNull(); // no cruza dueños
  });

  it("cuerpo enorme sin Content-Length confiable se corta antes de parsear", async () => {
    let stopped = false;
    const stream = new ReadableStream<Uint8Array>({ pull(c) { if (!stopped) c.enqueue(new Uint8Array(256 * 1024)); }, cancel() { stopped = true; } });
    const req = new Request("http://x/api/branding/personal", { method: "POST", headers: { "content-type": "multipart/form-data; boundary=zz" }, body: stream, duplex: "half" } as RequestInit);
    const r = await (await personal()).POST(req);
    expect(r.status).toBe(413);
  });

  it("DELETE quita el logo del propio usuario", async () => {
    state.current = A;
    const r = await (await personal()).DELETE();
    expect(r.status).toBe(200);
    const [p] = await h.db.select().from(schema.userProfiles).where(eq(schema.userProfiles.userId, A.id));
    expect(p!.personalLogoPath).toBeNull();
    expect((await (await personalGet()).GET(get("/x"), ctx({ userId: A.id }))).status).toBe(404);
  });
});

describe("logo de institución", () => {
  it("el logo empaquetado de UPS es público y sirve PNG con cabeceras fijas", async () => {
    state.current = null;
    const [ups] = await h.db.select().from(schema.institutions).where(eq(schema.institutions.slug, "ups"));
    const r = await (await institution()).GET(get(`/api/branding/institution/${ups!.id}`), ctx({ id: ups!.id }));
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/png");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("cache-control")).toMatch(/^public/);
    expect(Buffer.from(await r.arrayBuffer()).subarray(1, 4).toString()).toBe("PNG");
  });

  it("id inválido o inexistente → 404", async () => {
    const g = (await institution()).GET;
    expect((await g(get("/x"), ctx({ id: "../../etc/passwd" }))).status).toBe(404);
    expect((await g(get("/x"), ctx({ id: "00000000-0000-4000-8000-000000000000" }))).status).toBe(404);
  });

  it("un docente no puede subir ni borrar logos de institución; el administrador sí", async () => {
    const [ups] = await h.db.select().from(schema.institutions).where(eq(schema.institutions.slug, "ups"));
    const url = `http://x/api/branding/institution/${ups!.id}`;
    const { POST, DELETE } = await institution();
    state.current = A;
    expect((await POST(upload(await png(), url), ctx({ id: ups!.id }))).status).toBe(403);
    expect((await DELETE(get(`/api/branding/institution/${ups!.id}`), ctx({ id: ups!.id }))).status).toBe(403);
    state.current = null;
    expect((await POST(upload(await png(), url), ctx({ id: ups!.id }))).status).toBe(401);
    state.current = ADM;
    const ok = await POST(upload(await png("#00aa00"), url), ctx({ id: ups!.id }));
    expect(ok.status).toBe(200);
    const [after] = await h.db.select().from(schema.institutions).where(eq(schema.institutions.id, ups!.id));
    expect(after!.logoPath).toMatch(/^[0-9a-f-]{36}-[0-9a-f]{8}\.png$/);
    // un SVG hostil tampoco lo sube el administrador
    const bad = await POST(upload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><foreignObject/></svg>'), url, "x.svg", "image/svg+xml"), ctx({ id: ups!.id }));
    expect(bad.status).toBe(400);
    // sirve el nuevo y no el empaquetado
    state.current = null;
    const r = await (await institution()).GET(get("/x"), ctx({ id: ups!.id }));
    expect(r.status).toBe(200);
    const quitar = await (async () => { state.current = ADM; return DELETE(get("/x"), ctx({ id: ups!.id })); })();
    expect(quitar.status).toBe(200);
    state.current = null;
    expect((await (await institution()).GET(get("/x"), ctx({ id: ups!.id }))).status).toBe(404);
  });
});
