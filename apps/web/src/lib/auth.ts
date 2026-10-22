import { AsyncLocalStorage } from "node:async_hooks";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { admin, genericOAuth, jwt } from "better-auth/plugins";
import { oauthProvider } from "@better-auth/oauth-provider";
import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { MCP_SCOPES } from "@lamina/mcp";
import { schema } from "@lamina/db";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { adminEmails, env } from "./env";
import { revokeAllConnections } from "./mcp-access";

/** Marca las altas hechas desde el panel admin (única vía para crear cuentas de docentes). */
// Singleton en globalThis: el bundle del route handler y el de las Server Actions deben compartir el MISMO almacén.
const gg = globalThis as unknown as { __laminaAdminCreate?: AsyncLocalStorage<{ allowed: true }> };
export const adminCreate = (gg.__laminaAdminCreate ??= new AsyncLocalStorage<{ allowed: true }>());

/** Identificador (audience) del servidor MCP: los tokens de OAuth solo valen para este recurso. */
export const mcpResource = () => `${env().APP_URL.replace(/\/$/, "")}/api/mcp`;
export const MCP_OAUTH_SCOPES = [...MCP_SCOPES, "offline_access"] as const;

function build() {
  const e = env();
  const db = getDb();
  const social = e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET
    ? { google: { clientId: e.GOOGLE_CLIENT_ID, clientSecret: e.GOOGLE_CLIENT_SECRET, disableSignUp: true, prompt: "select_account" as const } }
    : {};
  const oauth = e.KEYCLOAK_CLIENT_ID && e.KEYCLOAK_CLIENT_SECRET
    ? [genericOAuth({
        config: [{
          providerId: "keycloak",
          clientId: e.KEYCLOAK_CLIENT_ID,
          clientSecret: e.KEYCLOAK_CLIENT_SECRET,
          discoveryUrl: `${e.KEYCLOAK_ISSUER}/.well-known/openid-configuration`,
          scopes: ["openid", "email", "profile"],
          pkce: true,
        }],
      })]
    : [];
  return betterAuth({
    appName: "Lámina",
    baseURL: e.APP_URL,
    secret: e.BETTER_AUTH_SECRET,
    trustedOrigins: [e.APP_URL],
    database: drizzleAdapter(db, { provider: "pg", schema: {
      user: schema.user, session: schema.session, account: schema.account, verification: schema.verification, rateLimit: schema.rateLimit,
      jwks: schema.jwks, oauthClient: schema.oauthClient, oauthResource: schema.oauthResource, oauthClientResource: schema.oauthClientResource,
      oauthRefreshToken: schema.oauthRefreshToken, oauthAccessToken: schema.oauthAccessToken, oauthConsent: schema.oauthConsent, oauthClientAssertion: schema.oauthClientAssertion,
    } }),
    emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 10, maxPasswordLength: 128, autoSignIn: false, revokeSessionsOnPasswordReset: true },
    socialProviders: social,
    account: { accountLinking: { enabled: true, trustedProviders: ["google"], allowDifferentEmails: false } },
    session: { expiresIn: 60 * 60 * 24 * 14, updateAge: 60 * 60 * 24, cookieCache: { enabled: false } },
    advanced: { useSecureCookies: e.NODE_ENV === "production", defaultCookieAttributes: { sameSite: "lax", httpOnly: true }, ipAddress: { ipAddressHeaders: ["x-forwarded-for"] } },
    rateLimit: {
      enabled: process.env.AUTH_RATE_LIMIT !== "off", window: 60, max: 120, storage: "database",
      customRules: { "/oauth2/register": { window: 60, max: 10 }, "/oauth2/token": { window: 60, max: 60 }, "/sign-in/email": { window: 60, max: Number(process.env.AUTH_SIGNIN_MAX ?? 6) }, "/change-password": { window: 60, max: 6 }, "/sign-in/social": { window: 60, max: 20 } },
    },
    plugins: [
      admin({ defaultRole: "teacher", adminRoles: ["admin"] }), ...oauth,
      // OAuth 2.1 para el servidor MCP (ADR-013): solo cuentas ya dadas de alta; no hay registro ni creación de usuarios por OAuth.
      jwt(),
      oauthProvider({
        loginPage: "/login",
        consentPage: "/cuenta/conectar/autorizar",
        scopes: [...MCP_OAUTH_SCOPES],
        resources: [{ identifier: mcpResource(), name: "Lámina MCP", allowedScopes: [...MCP_OAUTH_SCOPES] }],
        enforcePerClientResources: false,
        accessTokenExpiresIn: 10 * 60,
        refreshTokenExpiresIn: 14 * 24 * 3600,
        codeExpiresIn: 120,
        grantTypes: ["authorization_code", "refresh_token"],
        storeTokens: "hashed",
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
        clientRegistrationDefaultScopes: [...MCP_SCOPES],
        clientRegistrationAllowedScopes: ["offline_access"],
        clientRegistrationDefaultApplicationType: "infer",
      }),
      cimd({ fetchClientMetadataResource, metadataProfile: "mcp-2026-07-28" }),
      nextCookies(),
    ],
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const isAdmin = adminEmails().includes(user.email.toLowerCase());
            if (!isAdmin && !adminCreate.getStore()?.allowed)
              throw new APIError("FORBIDDEN", { message: "Tu correo no está dado de alta en Lámina. Pide acceso a un administrador." });
            return { data: { ...user, email: user.email.toLowerCase(), role: isAdmin ? "admin" : (user as { role?: string }).role ?? "teacher", emailVerified: true } }; // el admin (o Keycloak) atestigua el correo; Google solo vincula con correo verificado por Google
          },
          after: async (user) => {
            await db.insert(schema.userProfiles).values({ userId: user.id, mustChangePassword: false }).onConflictDoNothing();
          },
        },
      },
      account: {
        update: {
          // Cambiar o restablecer la clave corta también las conexiones MCP (sus refresh tokens no dependen de la sesión).
          after: async (account) => { if (account?.providerId === "credential" && account.userId) await revokeAllConnections(db, account.userId); },
        },
        create: {
          // Keycloak (SSO de Cúpula) SOLO para administradores: un usuario del realm no puede vincularse a la cuenta de un docente.
          before: async (account) => {
            if (account.providerId === "keycloak") {
              const [u] = await db.select().from(schema.user).where(eq(schema.user.id, account.userId));
              if (!u || !adminEmails().includes(u.email.toLowerCase())) throw new APIError("FORBIDDEN", { message: "El acceso Cúpula es solo para administradores." });
            }
            return { data: account };
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            // Garantiza el rol admin para los correos de ADMIN_EMAILS aunque la cuenta preexista.
            const [u] = await db.select().from(schema.user).where(eq(schema.user.id, session.userId));
            if (u && adminEmails().includes(u.email.toLowerCase()) && u.role !== "admin") await db.update(schema.user).set({ role: "admin" }).where(eq(schema.user.id, u.id));
            if (u?.banned) throw new APIError("FORBIDDEN", { message: "Cuenta bloqueada. Contacta a un administrador." });
            return { data: session };
          },
        },
      },
    },
  });
}

type Auth = ReturnType<typeof build>;
const g = globalThis as unknown as { __laminaAuth?: Auth };
export function getAuth(): Auth {
  g.__laminaAuth ??= build();
  return g.__laminaAuth;
}
