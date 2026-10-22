import { MCP_SCOPES } from "@lamina/mcp";
import { getAuth, mcpResource } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** RFC 9728: metadatos del recurso protegido (el servidor MCP) y su servidor de autorización. */
export async function GET() {
  const issuer = (await getAuth().$context).baseURL;
  return Response.json({
    resource: mcpResource(),
    authorization_servers: [issuer],
    scopes_supported: [...MCP_SCOPES],
    bearer_methods_supported: ["header"],
    resource_name: "Lámina",
    resource_documentation: `${new URL(mcpResource()).origin}/cuenta/conectar`,
  }, { headers: { "cache-control": "public, max-age=300", "access-control-allow-origin": "*" } });
}
