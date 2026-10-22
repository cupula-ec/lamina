import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { getAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** RFC 8414 con el issuer en /api/auth (inserción de ruta). */
export async function GET(request: Request) {
  return oauthProviderAuthServerMetadata(getAuth() as never, { headers: { "cache-control": "public, max-age=300", "access-control-allow-origin": "*" } })(request);
}
