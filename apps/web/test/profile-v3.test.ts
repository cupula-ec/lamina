import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { createDb, runMigrations, schema, seedInstitutions } from "@lamina/db";

const ADMIN_URL = "postgres://lamina:lamina@127.0.0.1:55432/postgres";
const URL_ = "postgres://lamina:lamina@127.0.0.1:55432/lamina_web_profile_test";
process.env.DATABASE_URL = URL_;
process.env.BETTER_AUTH_SECRET = "x".repeat(40);

type U = { id: string; email: string; name: string; role: string; mustChangePassword: boolean; consentAt: Date | null; onboardedAt: Date | null };
const mk = (id: string): U => ({ id, email: `${id}@t.test`, name: "Profe Prueba", role: "teacher", mustChangePassword: false, consentAt: new Date(), onboardedAt: null });
const state: { current: U } = { current: mk("tA") };
let h: ReturnType<typeof createDb>;

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth", () => ({ getAuth: () => ({ api: { updateUser: async () => ({}) } }) }));
vi.mock("@/lib/db", () => ({ getDb: () => h.db }));
vi.mock("@/lib/session", () => ({ getSessionUser: async () => state.current }));

const actions = () => import("../src/actions/profile");
const profile = async (id: string) => (await h.db.select().from(schema.userProfiles).where(eq(schema.userProfiles.userId, id)))[0]!;

beforeAll(async () => {
  const admin = createDb(ADMIN_URL, 1);
  await admin.pool.query("drop database if exists lamina_web_profile_test with (force)");
  await admin.pool.query("create database lamina_web_profile_test");
  await admin.pool.end();
  h = createDb(URL_, 4);
  await runMigrations(h.db);
  await seedInstitutions(h.db);
  for (const id of ["tA", "tB"]) await h.db.insert(schema.user).values({ id, name: "Profe Prueba", email: `${id}@t.test` });
});
afterAll(async () => { await h.pool.end(); });

describe("perfil V3", () => {
  it("guarda los campos nuevos solo cuando vienen y gestiona el consentimiento de investigación (aceptar y retirar)", async () => {
    const a = await actions();
    state.current = mk("tA");
    expect((await a.completeOnboardingAction({ fullName: "Profe Prueba", institutionId: null })).ok).toBe(true);
    let p = await profile("tA");
    expect(p.subjects).toBeNull();
    expect(p.researchConsentAt).toBeNull();
    const r = await a.saveProfileAction({ fullName: "Profe Prueba", institutionId: null, subjects: ["Cálculo I", "Programación"], career: "Ingeniería", modality: "hibrida", levels: ["grado"], techFamiliarity: 4, researchConsent: true, logoCorner: "br", logoWhich: "both" });
    expect(r.ok).toBe(true);
    p = await profile("tA");
    expect(p).toMatchObject({ subjects: ["Cálculo I", "Programación"], career: "Ingeniería", modality: "hibrida", levels: ["grado"], techFamiliarity: 4, logoCorner: "br", logoWhich: "both" });
    expect(p.researchConsentAt).toBeTruthy();
    expect(p.researchConsentVersion).toMatch(/research/);
    // no tocar: omitir campos conserva lo guardado
    await a.saveProfileAction({ fullName: "Profe Prueba", institutionId: null });
    expect((await profile("tA")).subjects).toEqual(["Cálculo I", "Programación"]);
    expect((await profile("tA")).researchConsentWithdrawnAt).toBeNull();
    await a.saveProfileAction({ fullName: "Profe Prueba", institutionId: null, researchConsent: false });
    expect((await profile("tA")).researchConsentWithdrawnAt).toBeTruthy();
    // rechaza valores fuera de rango
    expect((await a.saveProfileAction({ fullName: "Profe Prueba", institutionId: null, techFamiliarity: 9 })).ok).toBe(false);
  });

  it("«otra universidad»: se crea sin verificar, solo su autora la puede elegir, y verificarla la abre a todos", async () => {
    const a = await actions();
    state.current = mk("tA");
    const c = await a.createOwnInstitutionAction({ name: "Universidad Técnica de Ambato", short: "UTA", primaryColor: "#1f4e79", secondaryColor: null });
    expect(c.ok).toBe(true);
    const id = c.ok ? c.data.id : "";
    const [inst] = await h.db.select().from(schema.institutions).where(eq(schema.institutions.id, id));
    expect(inst).toMatchObject({ verified: false, createdBy: "tA", active: true });
    expect((await profile("tA")).institutionId).toBe(id);
    // repetir actualiza la misma, no crea otra
    const again = await a.createOwnInstitutionAction({ name: "Universidad Técnica de Ambato (UTA)", short: "UTA", primaryColor: "#1f4e79", secondaryColor: null });
    expect(again.ok && again.data.id).toBe(id);
    // otra docente no puede elegirla mientras no esté verificada
    state.current = mk("tB");
    await a.completeOnboardingAction({ fullName: "Otra Docente", institutionId: null });
    expect((await a.saveProfileAction({ fullName: "Otra Docente", institutionId: id })).ok).toBe(false);
    await h.db.update(schema.institutions).set({ verified: true }).where(and(eq(schema.institutions.id, id)));
    expect((await a.saveProfileAction({ fullName: "Otra Docente", institutionId: id })).ok).toBe(true);
    // las instituciones sembradas siguen verificadas
    const seeded = await h.db.select().from(schema.institutions).where(eq(schema.institutions.verified, true));
    expect(seeded.length).toBeGreaterThan(1);
  });
});
