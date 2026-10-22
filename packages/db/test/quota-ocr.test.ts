import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_QUOTAS, QUOTA_KINDS, refundQuota, schema, tryConsumeQuota, usageFor } from "../src";
import { mkUser, testDb } from "./helpers";

let h: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => { h = await testDb("lamina_test_quota_ocr"); });
afterAll(async () => { await h.pool.end(); });

describe("cuota ocr_vision_page", () => {
  it("existe con 30 páginas por usuario/día por defecto", () => {
    expect(QUOTA_KINDS).toContain("ocr_vision_page");
    expect(DEFAULT_QUOTAS.ocr_vision_page).toBe(30);
  });
  it("tryConsumeQuota devuelve false (sin lanzar) al agotarse y refundQuota devuelve la unidad", async () => {
    const u = await mkUser(h.db);
    await h.db.insert(schema.userProfiles).values({ userId: u, quotaOverrides: { ocr_vision_page: 2 } });
    expect(await tryConsumeQuota(h.db, u, "ocr_vision_page")).toBe(true);
    expect(await tryConsumeQuota(h.db, u, "ocr_vision_page")).toBe(true);
    expect(await tryConsumeQuota(h.db, u, "ocr_vision_page")).toBe(false);
    await refundQuota(h.db, u, "ocr_vision_page");
    expect((await usageFor(h.db, u)).ocr_vision_page).toEqual({ used: 1, limit: 2 });
    expect(await tryConsumeQuota(h.db, u, "ocr_vision_page")).toBe(true);
  });
  it("cuota 0 = sin visión (degradación), no error", async () => {
    const u = await mkUser(h.db);
    await h.db.insert(schema.userProfiles).values({ userId: u, quotaOverrides: { ocr_vision_page: 0 } });
    expect(await tryConsumeQuota(h.db, u, "ocr_vision_page")).toBe(false);
  });
});
