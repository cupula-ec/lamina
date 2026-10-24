import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { schema, units } from "../src";
import { mkUser, testDb } from "./helpers";

let h: Awaited<ReturnType<typeof testDb>>;
let pid: string;
beforeAll(async () => {
  h = await testDb("lamina_test_units");
  const o = await mkUser(h.db);
  const [p] = await h.db.insert(schema.presentations).values({ ownerId: o, title: "t", topic: "t", level: "grado", objective: "o" } as never).returning();
  pid = p!.id;
});
afterAll(async () => { await h.pool.end(); });

describe("work_units", () => {
  const s = () => ({ presentationId: pid, runKey: units.runKeyOf(["a", 1]), kind: "slide" as const });
  it("un reinicio solo repite lo que no estaba done", async () => {
    await units.startUnit(h.db, s(), "s1"); await units.finishUnit(h.db, s(), "s1", { id: "s1" });
    await units.startUnit(h.db, s(), "s2"); // el proceso muere aquí
    const done = await units.doneUnits(h.db, s());
    expect([...done.keys()]).toEqual(["s1"]);
    expect(done.get("s1")).toEqual({ id: "s1" });
    await units.startUnit(h.db, s(), "s2"); // reintento
    const c = await units.unitCounts(h.db, pid, s().runKey);
    expect(c).toEqual({ done: 1, running: 1 });
  });
  it("recupera unidades running con heartbeat vencido", async () => {
    await h.db.execute(sql`update work_units set heartbeat_at = now() - interval '10 minutes' where ref = 's2'`);
    expect(await units.recoverStaleUnits(h.db, 180)).toBe(1);
    expect((await units.unitCounts(h.db, pid, s().runKey))).toEqual({ done: 1, pending: 1 });
  });
  it("runKey distinta = ejecución nueva; clearRun limpia; progreso N de M", async () => {
    expect((await units.doneUnits(h.db, { ...s(), runKey: units.runKeyOf(["b"]) })).size).toBe(0);
    expect(await units.latestProgress(h.db, pid)).toEqual({ done: 1, total: 2, quotaWait: 0, failed: 0 });
    await units.clearRun(h.db, s());
    expect(await units.latestProgress(h.db, pid)).toBeNull();
  });
});
