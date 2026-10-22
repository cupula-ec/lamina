import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { createLocalJWKSet, jwtVerify, type JSONWebKeySet } from "jose";
import { MCP_SCOPES, type McpPrincipal } from "@lamina/mcp";
import { schema, type Db } from "@lamina/db";

export const MCP_SETTING = "mcp.enabled";

export class McpAuthError extends Error {
  constructor(public readonly status: 401 | 403 | 503, public readonly code: "invalid_token" | "insufficient_scope" | "disabled", message: string) {
    super(message);
  }
}

export async function mcpEnabled(db: Db): Promise<boolean> {
  const [r] = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, MCP_SETTING));
  return (r?.value as { enabled?: boolean } | undefined)?.enabled !== false;
}

export async function setMcpEnabled(db: Db, enabled: boolean) {
  await db.insert(schema.appSettings).values({ key: MCP_SETTING, value: { enabled } })
    .onConflictDoUpdate({ target: schema.appSettings.key, set: { value: { enabled }, updatedAt: new Date() } });
}

/** Protección contra DNS rebinding: el Host debe ser el de la app y, si hay Origin, debe ser el de la app (los clientes nativos no envían Origin). */
export function originProblem(headers: Headers, appUrl: string, nodeEnv = process.env.NODE_ENV): string | null {
  const app = new URL(appUrl);
  const host = (headers.get("x-forwarded-host") ?? headers.get("host") ?? "").split(",")[0]!.trim().toLowerCase();
  const allowedHosts = new Set([app.host.toLowerCase()]);
  if (nodeEnv !== "production") for (const h of ["localhost", "127.0.0.1"]) allowedHosts.add(`${h}:${app.port || (app.protocol === "https:" ? "443" : "80")}`);
  if (!allowedHosts.has(host)) return "Host no permitido";
  const origin = headers.get("origin");
  if (origin && origin !== "null") {
    let o: URL;
    try { o = new URL(origin); } catch { return "Origin inválido"; }
    if (!allowedHosts.has(o.host.toLowerCase())) return "Origin no permitido";
  } else if (origin === "null") return "Origin no permitido";
  if (nodeEnv === "production") {
    const proto = (headers.get("x-forwarded-proto") ?? app.protocol.replace(":", "")).split(",")[0]!.trim();
    if (app.protocol !== "https:" || proto !== "https") return "Se requiere HTTPS";
  }
  return null;
}

/**
 * Valida un access token de OAuth (JWT firmado por Lámina) para el recurso MCP y comprueba en BD que la conexión sigue viva:
 * la revocación es inmediata aunque el JWT no haya expirado (consentimiento, cuenta y cliente se consultan en cada llamada).
 */
export async function verifyMcpToken(db: Db, token: string, opts: { jwks: JSONWebKeySet; issuer: string; audience: string }): Promise<McpPrincipal> {
  let payload;
  try {
    ({ payload } = await jwtVerify(token, createLocalJWKSet(opts.jwks), { issuer: opts.issuer, audience: opts.audience, clockTolerance: 5 }));
  } catch {
    throw new McpAuthError(401, "invalid_token", "Token inválido o expirado");
  }
  const userId = typeof payload.sub === "string" ? payload.sub : null;
  const clientId = typeof payload.azp === "string" ? payload.azp : null;
  if (!userId || !clientId) throw new McpAuthError(401, "invalid_token", "Token sin usuario o cliente");

  const [row] = await db.select({
    banned: schema.user.banned, consentAt: schema.userProfiles.consentAt, mustChange: schema.userProfiles.mustChangePassword, clientDisabled: schema.oauthClient.disabled,
  }).from(schema.user)
    .innerJoin(schema.oauthConsent, and(eq(schema.oauthConsent.userId, schema.user.id), eq(schema.oauthConsent.clientId, clientId)))
    .innerJoin(schema.oauthClient, eq(schema.oauthClient.clientId, clientId))
    .leftJoin(schema.userProfiles, eq(schema.userProfiles.userId, schema.user.id))
    .where(eq(schema.user.id, userId)).limit(1);
  if (!row || row.banned || row.clientDisabled || !row.consentAt || row.mustChange) throw new McpAuthError(401, "invalid_token", "La conexión fue revocada o la cuenta no está disponible");

  const granted = String(payload.scope ?? "").split(/\s+/).filter(Boolean);
  const scopes = granted.filter((s) => (MCP_SCOPES as readonly string[]).includes(s));
  if (!scopes.length) throw new McpAuthError(403, "insufficient_scope", "El token no tiene permisos sobre presentaciones");
  return { userId, clientId, scopes };
}

export async function touchConnection(db: Db, userId: string, clientId: string) {
  await db.insert(schema.mcpConnections).values({ userId, clientId, lastUsedAt: new Date(), calls: 1 })
    .onConflictDoUpdate({ target: [schema.mcpConnections.userId, schema.mcpConnections.clientId], set: { lastUsedAt: new Date(), calls: sql`${schema.mcpConnections.calls} + 1` } });
}

/** Revoca una conexión (aplicación autorizada) de un docente: consentimiento, tokens de refresco y de acceso. Efecto inmediato. */
export async function revokeConnection(db: Db, userId: string, clientId: string) {
  await db.transaction(async (tx) => {
    await tx.delete(schema.oauthConsent).where(and(eq(schema.oauthConsent.userId, userId), eq(schema.oauthConsent.clientId, clientId)));
    await tx.update(schema.oauthRefreshToken).set({ revoked: new Date() }).where(and(eq(schema.oauthRefreshToken.userId, userId), eq(schema.oauthRefreshToken.clientId, clientId), isNull(schema.oauthRefreshToken.revoked)));
    await tx.delete(schema.oauthAccessToken).where(and(eq(schema.oauthAccessToken.userId, userId), eq(schema.oauthAccessToken.clientId, clientId)));
    await tx.delete(schema.mcpConnections).where(and(eq(schema.mcpConnections.userId, userId), eq(schema.mcpConnections.clientId, clientId)));
    await tx.insert(schema.events).values({ name: "mcp.connection_revoked", userId, data: { clientId } });
  });
}

export type ConnectionRow = { clientId: string; name: string; host: string | null; scopes: string[]; authorizedAt: Date | null; lastUsedAt: Date | null; calls: number; userId: string; userEmail?: string };

const hostOf = (uris: string[] | null) => { try { return uris?.[0] ? new URL(uris[0]).host || new URL(uris[0]).protocol : null; } catch { return null; } };

/** Aplicaciones autorizadas (de un docente, o de todos si no se indica userId). */
export async function listConnections(db: Db, userId?: string): Promise<ConnectionRow[]> {
  const q = db.select({
    userId: schema.oauthConsent.userId, clientId: schema.oauthConsent.clientId, scopes: schema.oauthConsent.scopes, authorizedAt: schema.oauthConsent.createdAt,
    name: schema.oauthClient.name, uris: schema.oauthClient.redirectUris, lastUsedAt: schema.mcpConnections.lastUsedAt, calls: schema.mcpConnections.calls, email: schema.user.email,
  }).from(schema.oauthConsent)
    .innerJoin(schema.oauthClient, eq(schema.oauthClient.clientId, schema.oauthConsent.clientId))
    .innerJoin(schema.user, eq(schema.user.id, schema.oauthConsent.userId))
    .leftJoin(schema.mcpConnections, and(eq(schema.mcpConnections.userId, schema.oauthConsent.userId), eq(schema.mcpConnections.clientId, schema.oauthConsent.clientId)));
  const rows = await (userId ? q.where(eq(schema.oauthConsent.userId, userId)) : q).orderBy(desc(schema.oauthConsent.createdAt));
  return rows.map((r) => ({
    userId: r.userId!, clientId: r.clientId, name: r.name?.trim() || "Aplicación sin nombre", host: hostOf(r.uris), scopes: r.scopes.filter((s) => s !== "offline_access"),
    authorizedAt: r.authorizedAt, lastUsedAt: r.lastUsedAt, calls: r.calls ?? 0, userEmail: r.email,
  }));
}
