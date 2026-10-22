import { getDb } from "@/lib/db";
import { listConnections, mcpEnabled } from "@/lib/mcp-access";
import { McpAdminControls } from "./mcp-actions";

export async function McpPanel() {
  const db = getDb();
  const [enabled, items] = await Promise.all([mcpEnabled(db), listConnections(db)]);
  return (
    <McpAdminControls
      enabled={enabled}
      items={items.map((c) => ({ userId: c.userId, email: c.userEmail ?? c.userId, clientId: c.clientId, name: c.name, host: c.host, authorizedAt: c.authorizedAt?.toISOString() ?? null, lastUsedAt: c.lastUsedAt?.toISOString() ?? null, calls: c.calls }))}
    />
  );
}
