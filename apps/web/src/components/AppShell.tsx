import { getDb } from "@/lib/db";
import { listConnections } from "@/lib/mcp-access";
import { Sidebar } from "./Sidebar";
import type { SessionUser } from "@/lib/session";

export async function AppShell({ user, children, wide = false }: { user: SessionUser; children: React.ReactNode; wide?: boolean }) {
  const connected = (await listConnections(getDb(), user.id)).length > 0;
  return (
    <div className="min-h-dvh bg-paper lg:flex">
      <Sidebar email={user.email} name={user.name} admin={user.role === "admin"} mcpConnected={connected} />
      <main className={`mx-auto w-full min-w-0 flex-1 px-5 py-8 lg:px-10 ${wide ? "max-w-[1500px]" : "max-w-6xl"}`}>{children}</main>
    </div>
  );
}
