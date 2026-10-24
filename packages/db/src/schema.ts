import { sql } from "drizzle-orm";
import {
  bigint, bigserial, boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => ts("created_at").notNull().defaultNow();

/* ───────────── Better Auth (esquema estándar + plugin admin) ───────────── */
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: createdAt(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
  role: text("role").default("teacher"),
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: ts("ban_expires"),
});
export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: ts("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: createdAt(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  impersonatedBy: text("impersonated_by"),
});
export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: ts("access_token_expires_at"),
  refreshTokenExpiresAt: ts("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: createdAt(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});
export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: ts("expires_at").notNull(),
  createdAt: createdAt(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

/* ───────────── OAuth de MCP (plugins jwt + oauth-provider de Better Auth; los campos siguen su esquema) ───────────── */
export const jwks = pgTable("jwks", {
  id: text("id").primaryKey(),
  publicKey: text("public_key").notNull(),
  privateKey: text("private_key").notNull(),
  createdAt: createdAt(),
  expiresAt: ts("expires_at"),
  alg: text("alg"),
  crv: text("crv"),
});

export const oauthClient = pgTable("oauth_client", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull().unique(),
  clientSecret: text("client_secret"),
  clientDiscoveryId: text("client_discovery_id"),
  disabled: boolean("disabled").default(false),
  skipConsent: boolean("skip_consent"),
  enableEndSession: boolean("enable_end_session"),
  subjectType: text("subject_type"),
  scopes: text("scopes").array(),
  clientCredentialsScopes: text("client_credentials_scopes").array(),
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
  createdAt: ts("created_at").defaultNow(),
  updatedAt: ts("updated_at").defaultNow(),
  name: text("name"),
  uri: text("uri"),
  icon: text("icon"),
  contacts: text("contacts").array(),
  tos: text("tos"),
  policy: text("policy"),
  softwareId: text("software_id"),
  softwareVersion: text("software_version"),
  softwareStatement: text("software_statement"),
  redirectUris: text("redirect_uris").array().notNull(),
  postLogoutRedirectUris: text("post_logout_redirect_uris").array(),
  backchannelLogoutUri: text("backchannel_logout_uri"),
  backchannelLogoutSessionRequired: boolean("backchannel_logout_session_required"),
  tokenEndpointAuthMethod: text("token_endpoint_auth_method"),
  applicationType: text("application_type"),
  jwks: text("jwks"),
  jwksUri: text("jwks_uri"),
  grantTypes: text("grant_types").array(),
  responseTypes: text("response_types").array(),
  requirePKCE: boolean("require_pkce"),
  dpopBoundAccessTokens: boolean("dpop_bound_access_tokens").default(false),
  referenceId: text("reference_id"),
  metadata: jsonb("metadata"),
});

export const oauthResource = pgTable("oauth_resource", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull().unique(),
  name: text("name").notNull(),
  accessTokenTtl: integer("access_token_ttl"),
  refreshTokenTtl: integer("refresh_token_ttl"),
  signingAlgorithm: text("signing_algorithm"),
  signingKeyId: text("signing_key_id"),
  allowedScopes: text("allowed_scopes").array(),
  customClaims: jsonb("custom_claims"),
  dpopBoundAccessTokensRequired: boolean("dpop_bound_access_tokens_required").default(false),
  disabled: boolean("disabled").default(false),
  createdAt: ts("created_at").defaultNow(),
  updatedAt: ts("updated_at").defaultNow(),
  policyVersion: integer("policy_version").default(1),
  metadata: jsonb("metadata"),
});

export const oauthClientResource = pgTable("oauth_client_resource", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull().references(() => oauthClient.clientId, { onDelete: "cascade" }),
  resourceId: text("resource_id").notNull().references(() => oauthResource.identifier, { onDelete: "cascade" }),
  metadata: jsonb("metadata"),
  createdAt: ts("created_at").defaultNow(),
}, (t) => [uniqueIndex("oauth_client_resource_uq").on(t.clientId, t.resourceId)]);

/** Los tokens se guardan con hash (storeTokens: "hashed"); el valor en claro solo lo ve el cliente. */
export const oauthRefreshToken = pgTable("oauth_refresh_token", {
  id: text("id").primaryKey(),
  token: text("token").notNull().unique(),
  clientId: text("client_id").notNull().references(() => oauthClient.clientId, { onDelete: "cascade" }),
  sessionId: text("session_id").references(() => session.id, { onDelete: "set null" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  referenceId: text("reference_id"),
  authorizationCodeId: text("authorization_code_id"),
  resources: text("resources").array(),
  requestedUserInfoClaims: text("requested_user_info_claims").array(),
  expiresAt: ts("expires_at"),
  createdAt: ts("created_at"),
  revoked: ts("revoked"),
  rotatedAt: ts("rotated_at"),
  rotationReplayResponse: text("rotation_replay_response"),
  rotationReplayExpiresAt: ts("rotation_replay_expires_at"),
  authTime: ts("auth_time"),
  confirmation: jsonb("confirmation"),
  scopes: text("scopes").array().notNull(),
}, (t) => [index("oauth_refresh_client_idx").on(t.clientId), index("oauth_refresh_user_idx").on(t.userId), index("oauth_refresh_session_idx").on(t.sessionId), index("oauth_refresh_code_idx").on(t.authorizationCodeId)]);

export const oauthAccessToken = pgTable("oauth_access_token", {
  id: text("id").primaryKey(),
  token: text("token").unique(),
  clientId: text("client_id").notNull().references(() => oauthClient.clientId, { onDelete: "cascade" }),
  sessionId: text("session_id").references(() => session.id, { onDelete: "set null" }),
  userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
  referenceId: text("reference_id"),
  authorizationCodeId: text("authorization_code_id"),
  resources: text("resources").array(),
  requestedUserInfoClaims: text("requested_user_info_claims").array(),
  refreshId: text("refresh_id").references(() => oauthRefreshToken.id, { onDelete: "cascade" }),
  expiresAt: ts("expires_at"),
  createdAt: ts("created_at"),
  revoked: ts("revoked"),
  confirmation: jsonb("confirmation"),
  scopes: text("scopes").array().notNull(),
}, (t) => [index("oauth_access_client_idx").on(t.clientId), index("oauth_access_user_idx").on(t.userId), index("oauth_access_session_idx").on(t.sessionId), index("oauth_access_code_idx").on(t.authorizationCodeId), index("oauth_access_refresh_idx").on(t.refreshId)]);

export const oauthConsent = pgTable("oauth_consent", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull().references(() => oauthClient.clientId, { onDelete: "cascade" }),
  userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
  referenceId: text("reference_id"),
  resources: text("resources").array(),
  requestedUserInfoClaims: text("requested_user_info_claims").array(),
  scopes: text("scopes").array().notNull(),
  createdAt: ts("created_at"),
  updatedAt: ts("updated_at"),
}, (t) => [index("oauth_consent_client_idx").on(t.clientId), index("oauth_consent_user_idx").on(t.userId)]);

export const oauthClientAssertion = pgTable("oauth_client_assertion", {
  id: text("id").primaryKey(),
  expiresAt: ts("expires_at").notNull(),
});

/** Uso de una IA conectada por docente (último uso y llamadas); sin contenido. */
export const mcpConnections = pgTable("mcp_connections", {
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  clientId: text("client_id").notNull(),
  lastUsedAt: ts("last_used_at"),
  calls: integer("calls").notNull().default(0),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.userId, t.clientId] })]);

/* ───────────── Instituciones (branding) ───────────── */
export const institutions = pgTable("institutions", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  short: text("short").notNull(),
  logoPath: text("logo_path"),
  logoMime: text("logo_mime"),
  primaryColor: text("primary_color"),
  secondaryColor: text("secondary_color"),
  fontId: text("font_id"),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/* ───────────── Perfil y cuotas ───────────── */
export const userProfiles = pgTable("user_profiles", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  consentAt: ts("consent_at"),
  consentVersion: text("consent_version"),
  changelogSeenAt: ts("changelog_seen_at"),
  /** Nombre completo del docente (se sincroniza a user.name). */
  fullName: text("full_name"),
  institutionId: uuid("institution_id").references(() => institutions.id, { onDelete: "set null" }),
  personalLogoPath: text("personal_logo_path"),
  personalLogoMime: text("personal_logo_mime"),
  onboardedAt: ts("onboarded_at"),
  /** Cuotas por usuario que sobrescriben los valores por defecto (clave → límite diario). */
  quotaOverrides: jsonb("quota_overrides").$type<Record<string, number>>().notNull().default({}),
  createdAt: createdAt(),
});

export const usageCounters = pgTable("usage_counters", {
  /** "u:<userId>" o "global" */
  scope: text("scope").notNull(),
  /** p. ej. presentation_new, content_regen, design_regen, component_request, ai_call */
  kind: text("kind").notNull(),
  day: text("day").notNull(), // YYYY-MM-DD (UTC)
  count: integer("count").notNull().default(0),
}, (t) => [primaryKey({ columns: [t.scope, t.kind, t.day] })]);

/* ───────────── Presentaciones ───────────── */
export const presentations = pgTable("presentations", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: text("owner_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  topic: text("topic").notNull(),
  level: text("level").notNull(),
  objective: text("objective").notNull(),
  language: text("language").notNull().default("es"),
  extraNotes: text("extra_notes"),
  subject: text("subject"),
  period: text("period"),
  groupName: text("group_name"),
  /** Estilo elegido o propuesto (THEME_IDS); null = lo decide la IA al diseñar. */
  themeId: text("theme_id"),
  /** Cómo se creó: web (wizard) o mcp (IA externa conectada por el docente). */
  origin: text("origin").notNull().default("web"),
  stage: text("stage").notNull().default("draft"),
  /** Etapa a la que se vuelve al reintentar tras failed_recoverable / quota_wait. */
  prevStage: text("prev_stage"),
  resumeAt: ts("resume_at"),
  lastError: text("last_error"),
  /** Progreso legible del job en curso (p. ej. «OCR página 12 de 40»); el worker lo limpia al terminar. */
  progress: text("progress"),
  /** Se incrementa al cancelar un trabajo en curso: los handlers que ya estaban corriendo (época anterior) no pueden escribir. */
  cancelEpoch: integer("cancel_epoch").notNull().default(0),
  /** Versión de diseño vigente al empezar a diseñar: a ella se vuelve si el trabajo se cancela. */
  designBaseId: uuid("design_base_id"),
  /** Job en curso o a reanudar: { name, payload }. */
  pendingJob: jsonb("pending_job").$type<{ name: string; payload: Record<string, unknown> }>(),
  visibility: text("visibility").notNull().default("private"),
  shareTokenHash: text("share_token_hash"),
  currentContentVersionId: uuid("current_content_version_id"),
  approvedContentVersionId: uuid("approved_content_version_id"),
  currentDeckVersionId: uuid("current_deck_version_id"),
  approvedDeckVersionId: uuid("approved_deck_version_id"),
  finalDeckVersionId: uuid("final_deck_version_id"),
  publishedDeckVersionId: uuid("published_deck_version_id"),
  createdAt: createdAt(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
}, (t) => [index("presentations_owner_idx").on(t.ownerId), uniqueIndex("presentations_share_idx").on(t.shareTokenHash)]);

export const contentVersions = pgTable("content_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  presentationId: uuid("presentation_id").notNull().references(() => presentations.id, { onDelete: "cascade" }),
  n: integer("n").notNull(),
  parentId: uuid("parent_id"),
  authorKind: text("author_kind").notNull(), // ia | docente | mcp
  note: text("note"),
  content: jsonb("content").notNull(),
  sha256: text("sha256").notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("content_versions_pn").on(t.presentationId, t.n)]);

export const deckVersions = pgTable("deck_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  presentationId: uuid("presentation_id").notNull().references(() => presentations.id, { onDelete: "cascade" }),
  n: integer("n").notNull(),
  parentId: uuid("parent_id"),
  contentVersionId: uuid("content_version_id").notNull(),
  authorKind: text("author_kind").notNull(), // ia | docente | mcp
  kind: text("kind").notNull().default("design"), // design | polish | style
  note: text("note"),
  deck: jsonb("deck").notNull(),
  sha256: text("sha256").notNull(),
  /** Versiones de componentes fijadas (id → version/bundleHash) para reproducir. */
  componentPins: jsonb("component_pins").$type<Record<string, { version: string; bundleHash?: string }>>().notNull().default({}),
  issues: jsonb("issues").$type<unknown[]>().notNull().default([]),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("deck_versions_pn").on(t.presentationId, t.n)]);

export const approvals = pgTable("approvals", {
  id: uuid("id").primaryKey().defaultRandom(),
  presentationId: uuid("presentation_id").notNull().references(() => presentations.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // content | design | final
  versionId: uuid("version_id").notNull(),
  sha256: text("sha256").notNull(),
  userId: text("user_id").notNull(),
  createdAt: createdAt(),
});

export const feedback = pgTable("feedback", {
  id: uuid("id").primaryKey().defaultRandom(),
  presentationId: uuid("presentation_id").notNull().references(() => presentations.id, { onDelete: "cascade" }),
  stage: text("stage").notNull(), // content | design
  versionId: uuid("version_id"),
  scope: text("scope"), // sección / slide / null = global
  text: text("text").notNull(),
  userId: text("user_id").notNull(),
  createdAt: createdAt(),
});

/* ───────────── Fuentes ───────────── */
export const uploads = pgTable("uploads", {
  id: uuid("id").primaryKey().defaultRandom(),
  presentationId: uuid("presentation_id").notNull().references(() => presentations.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  mime: text("mime").notNull(),
  bytes: integer("bytes").notNull(),
  sha256: text("sha256").notNull(),
  storagePath: text("storage_path").notNull(),
  createdAt: createdAt(),
});

export const sources = pgTable("sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  presentationId: uuid("presentation_id").notNull().references(() => presentations.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // notes | url | upload | search
  origin: text("origin").notNull(), // teacher | research
  url: text("url"),
  title: text("title").notNull(),
  uploadId: uuid("upload_id"),
  status: text("status").notNull().default("ok"), // ok | failed | empty
  error: text("error"),
  createdAt: createdAt(),
}, (t) => [index("sources_pres_idx").on(t.presentationId)]);

export const sourceChunks = pgTable("source_chunks", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceId: uuid("source_id").notNull().references(() => sources.id, { onDelete: "cascade" }),
  presentationId: uuid("presentation_id").notNull().references(() => presentations.id, { onDelete: "cascade" }),
  ord: integer("ord").notNull(),
  page: integer("page"),
  text: text("text").notNull(),
}, (t) => [index("chunks_pres_idx").on(t.presentationId)]);

/** Metadatos del OCR por página (nunca texto ni imagen). */
export const ocrPages = pgTable("ocr_pages", {
  id: uuid("id").primaryKey().defaultRandom(),
  uploadId: uuid("upload_id").notNull().references(() => uploads.id, { onDelete: "cascade" }),
  page: integer("page").notNull(),
  engine: text("engine").notNull(), // tesseract | vision
  confidence: integer("confidence"),
  chars: integer("chars").notNull().default(0),
  status: text("status").notNull().default("ok"), // ok | low | failed
  createdAt: createdAt(),
}, (t) => [uniqueIndex("ocr_pages_uq").on(t.uploadId, t.page, t.engine)]);

/* ───────────── Renders ───────────── */
export const renderArtifacts = pgTable("render_artifacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  presentationId: uuid("presentation_id").notNull().references(() => presentations.id, { onDelete: "cascade" }),
  deckVersionId: uuid("deck_version_id").notNull(),
  slideId: text("slide_id").notNull(),
  path: text("path").notNull(),
  issues: jsonb("issues").$type<unknown[]>().notNull().default([]),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("render_artifacts_uq").on(t.deckVersionId, t.slideId)]);

/* ───────────── Componentes ───────────── */
export const components = pgTable("components", {
  id: uuid("id").primaryKey().defaultRandom(),
  componentId: text("component_id").notNull(),
  scope: text("scope").notNull(), // global | <presentationId>
  status: text("status").notNull(), // stable | provisional | rejected | deprecated
  runtime: text("runtime").notNull().default("sandboxed"),
  presentationId: uuid("presentation_id").references(() => presentations.id, { onDelete: "cascade" }),
  purpose: text("purpose").notNull(),
  prUrl: text("pr_url"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("components_scope_id").on(t.scope, t.componentId)]);

export const componentVersions = pgTable("component_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  componentRowId: uuid("component_row_id").notNull().references(() => components.id, { onDelete: "cascade" }),
  version: text("version").notNull(),
  source: text("source").notNull(),
  bundle: text("bundle").notNull(),
  bundleHash: text("bundle_hash").notNull(),
  manifest: jsonb("manifest").notNull(),
  testResults: jsonb("test_results").notNull(),
  screenshots: jsonb("screenshots").$type<string[]>().notNull().default([]),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("component_versions_uq").on(t.componentRowId, t.version)]);

export const componentRequests = pgTable("component_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  presentationId: uuid("presentation_id").notNull().references(() => presentations.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  purpose: text("purpose").notNull(),
  suggestedName: text("suggested_name").notNull(),
  slideId: text("slide_id"),
  status: text("status").notNull().default("pending"), // pending | running | done | failed
  resultComponentRowId: uuid("result_component_row_id"),
  error: text("error"),
  attempts: integer("attempts").notNull().default(0),
  createdAt: createdAt(),
});

/** Espacio de trabajo por presentación (V3 §5.0). Se crea de forma perezosa desde la versión vigente; no toca `deck_versions`. */
export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  presentationId: uuid("presentation_id").notNull().references(() => presentations.id, { onDelete: "cascade" }).unique(),
  rev: integer("rev").notNull().default(0),
  content: jsonb("content"),
  deck: jsonb("deck"),
  baseDeckVersionId: uuid("base_deck_version_id"),
  baseContentVersionId: uuid("base_content_version_id"),
  /** Hay ops sin confirmar (checkpoint) desde la base: un cambio externo de versión ya no re-basa en silencio. */
  dirty: boolean("dirty").notNull().default(false),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const workspaceOps = pgTable("workspace_ops", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  /** rev del workspace DESPUÉS de aplicar el lote (todas las ops de un lote comparten rev). */
  rev: integer("rev").notNull(),
  idx: integer("idx").notNull().default(0),
  /** Idempotencia: `<opId del lote>:<idx>`; único por workspace. */
  opId: text("op_id").notNull(),
  author: text("author").notNull(), // ia | mcp | docente | sistema
  op: jsonb("op").notNull(),
  inverse: jsonb("inverse").notNull(),
  batchId: uuid("batch_id").notNull(),
  label: text("label"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("workspace_ops_opid").on(t.workspaceId, t.opId), index("workspace_ops_batch").on(t.workspaceId, t.batchId)]);

/** Unidad de trabajo persistente de un job (V3 §5.1): su resultado se guarda al terminar, y un reinicio solo repite lo que no estaba `done`. */
export const workUnits = pgTable("work_units", {
  id: uuid("id").primaryKey().defaultRandom(),
  presentationId: uuid("presentation_id").notNull().references(() => presentations.id, { onDelete: "cascade" }),
  jobId: text("job_id"),
  /** Identifica la ejecución lógica (entradas + época de cancelación): un reintento del mismo job reanuda con la misma runKey. */
  runKey: text("run_key").notNull(),
  kind: text("kind").notNull(), // slide | component | block | image
  ref: text("ref").notNull(),
  state: text("state").notNull().default("pending"), // pending | running | done | failed | quota_wait
  attempts: integer("attempts").notNull().default(0),
  heartbeatAt: ts("heartbeat_at"),
  error: text("error"),
  result: jsonb("result"),
  createdAt: createdAt(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("work_units_run_ref").on(t.presentationId, t.runKey, t.kind, t.ref), index("work_units_state_hb").on(t.state, t.heartbeatAt)]);

/* ───────────── Observabilidad ───────────── */
export const aiCalls = pgTable("ai_calls", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  role: text("role").notNull(),
  model: text("model").notNull(),
  presentationId: uuid("presentation_id"),
  latencyMs: integer("latency_ms"),
  promptTokens: integer("prompt_tokens"),
  completionTokens: integer("completion_tokens"),
  result: text("result").notNull(), // ok | error | quota | invalid
  error: text("error"),
  createdAt: createdAt(),
}, (t) => [index("ai_calls_created_idx").on(t.createdAt)]);

export const events = pgTable("events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: text("name").notNull(),
  userId: text("user_id"),
  presentationId: uuid("presentation_id"),
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAt(),
}, (t) => [index("events_name_idx").on(t.name, t.createdAt)]);

export const jobErrors = pgTable("job_errors", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  jobName: text("job_name").notNull(),
  presentationId: uuid("presentation_id"),
  friendly: text("friendly").notNull(),
  detail: text("detail"),
  createdAt: createdAt(),
});

/** Tokens de servicio de un solo uso para que el renderer abra /render/<deck> (nunca cookies de usuario). */
export const renderTokens = pgTable("render_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  deckVersionId: uuid("deck_version_id").notNull(),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
});

/** Estado global de modelos (cooldowns por 429, etc.) y ajustes de admin. */
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

