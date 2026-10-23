import { and, eq, inArray, sql } from "drizzle-orm";
import { schema } from "@lamina/db";
import { getDb } from "@/lib/db";
import { listConnections } from "@/lib/mcp-access";
import { Sidebar } from "./Sidebar";
import type { SessionUser } from "@/lib/session";

export async function AppShell({ user, children, wide = false }: { user: SessionUser; children: React.ReactNode; wide?: boolean }) {
  const connected = (await listConnections(getDb(), user.id)).length > 0;
  const rows = await getDb().select({ stage: schema.presentations.stage, n: sql<number>`count(*)::int` }).from(schema.presentations)
    .where(and(eq(schema.presentations.ownerId, user.id), inArray(schema.presentations.stage, ["researching", "designing", "polishing", "content_review", "design_review", "final_review"]))).groupBy(schema.presentations.stage);
  const count = (stages: string[]) => rows.filter((r) => stages.includes(r.stage)).reduce((a, r) => a + r.n, 0);
  const running = count(["researching", "designing", "polishing"]);
  const review = count(["content_review", "design_review", "final_review"]);
  // En curso tiene prioridad; si nada corre, se avisa de lo que espera tu revisión.
  const badge = running > 0 ? { n: running, label: "en curso", busy: true } : { n: review, label: "por revisar", busy: false };
  return (
    <div className="min-h-dvh bg-paper lg:flex">
      <Sidebar email={user.email} name={user.name} admin={user.role === "admin"} mcpConnected={connected} badge={badge} />
      <main className={`mx-auto w-full min-w-0 flex-1 px-5 py-8 lg:px-10 ${wide ? "max-w-[1500px]" : "max-w-6xl"}`}>{children}</main>
    </div>
  );
}
