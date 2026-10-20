CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_calls" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"role" text NOT NULL,
	"model" text NOT NULL,
	"presentation_id" uuid,
	"latency_ms" integer,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"result" text NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"presentation_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"version_id" uuid NOT NULL,
	"sha256" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "component_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"presentation_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"purpose" text NOT NULL,
	"suggested_name" text NOT NULL,
	"slide_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"result_component_row_id" uuid,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "component_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"component_row_id" uuid NOT NULL,
	"version" text NOT NULL,
	"source" text NOT NULL,
	"bundle" text NOT NULL,
	"bundle_hash" text NOT NULL,
	"manifest" jsonb NOT NULL,
	"test_results" jsonb NOT NULL,
	"screenshots" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "components" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"component_id" text NOT NULL,
	"scope" text NOT NULL,
	"status" text NOT NULL,
	"runtime" text DEFAULT 'sandboxed' NOT NULL,
	"presentation_id" uuid,
	"purpose" text NOT NULL,
	"pr_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"presentation_id" uuid NOT NULL,
	"n" integer NOT NULL,
	"parent_id" uuid,
	"author_kind" text NOT NULL,
	"note" text,
	"content" jsonb NOT NULL,
	"sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deck_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"presentation_id" uuid NOT NULL,
	"n" integer NOT NULL,
	"parent_id" uuid,
	"content_version_id" uuid NOT NULL,
	"author_kind" text NOT NULL,
	"kind" text DEFAULT 'design' NOT NULL,
	"note" text,
	"deck" jsonb NOT NULL,
	"sha256" text NOT NULL,
	"component_pins" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"user_id" text,
	"presentation_id" uuid,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"presentation_id" uuid NOT NULL,
	"stage" text NOT NULL,
	"version_id" uuid,
	"scope" text,
	"text" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_errors" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"job_name" text NOT NULL,
	"presentation_id" uuid,
	"friendly" text NOT NULL,
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "presentations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"title" text NOT NULL,
	"topic" text NOT NULL,
	"level" text NOT NULL,
	"objective" text NOT NULL,
	"language" text DEFAULT 'es' NOT NULL,
	"extra_notes" text,
	"stage" text DEFAULT 'draft' NOT NULL,
	"prev_stage" text,
	"resume_at" timestamp with time zone,
	"last_error" text,
	"pending_job" jsonb,
	"visibility" text DEFAULT 'private' NOT NULL,
	"share_token_hash" text,
	"current_content_version_id" uuid,
	"approved_content_version_id" uuid,
	"current_deck_version_id" uuid,
	"approved_deck_version_id" uuid,
	"final_deck_version_id" uuid,
	"published_deck_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "render_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"presentation_id" uuid NOT NULL,
	"deck_version_id" uuid NOT NULL,
	"slide_id" text NOT NULL,
	"path" text NOT NULL,
	"issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"impersonated_by" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "source_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"presentation_id" uuid NOT NULL,
	"ord" integer NOT NULL,
	"page" integer,
	"text" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"presentation_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"origin" text NOT NULL,
	"url" text,
	"title" text NOT NULL,
	"upload_id" uuid,
	"status" text DEFAULT 'ok' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"presentation_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"mime" text NOT NULL,
	"bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"storage_path" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_counters" (
	"scope" text NOT NULL,
	"kind" text NOT NULL,
	"day" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "usage_counters_scope_kind_day_pk" PRIMARY KEY("scope","kind","day")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"role" text DEFAULT 'teacher',
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp with time zone,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"consent_at" timestamp with time zone,
	"consent_version" text,
	"changelog_seen_at" timestamp with time zone,
	"quota_overrides" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_presentation_id_presentations_id_fk" FOREIGN KEY ("presentation_id") REFERENCES "public"."presentations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "component_requests" ADD CONSTRAINT "component_requests_presentation_id_presentations_id_fk" FOREIGN KEY ("presentation_id") REFERENCES "public"."presentations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "component_versions" ADD CONSTRAINT "component_versions_component_row_id_components_id_fk" FOREIGN KEY ("component_row_id") REFERENCES "public"."components"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "components" ADD CONSTRAINT "components_presentation_id_presentations_id_fk" FOREIGN KEY ("presentation_id") REFERENCES "public"."presentations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_presentation_id_presentations_id_fk" FOREIGN KEY ("presentation_id") REFERENCES "public"."presentations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deck_versions" ADD CONSTRAINT "deck_versions_presentation_id_presentations_id_fk" FOREIGN KEY ("presentation_id") REFERENCES "public"."presentations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_presentation_id_presentations_id_fk" FOREIGN KEY ("presentation_id") REFERENCES "public"."presentations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presentations" ADD CONSTRAINT "presentations_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "render_artifacts" ADD CONSTRAINT "render_artifacts_presentation_id_presentations_id_fk" FOREIGN KEY ("presentation_id") REFERENCES "public"."presentations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_chunks" ADD CONSTRAINT "source_chunks_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_chunks" ADD CONSTRAINT "source_chunks_presentation_id_presentations_id_fk" FOREIGN KEY ("presentation_id") REFERENCES "public"."presentations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_presentation_id_presentations_id_fk" FOREIGN KEY ("presentation_id") REFERENCES "public"."presentations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_presentation_id_presentations_id_fk" FOREIGN KEY ("presentation_id") REFERENCES "public"."presentations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_calls_created_idx" ON "ai_calls" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "component_versions_uq" ON "component_versions" USING btree ("component_row_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "components_scope_id" ON "components" USING btree ("scope","component_id");--> statement-breakpoint
CREATE UNIQUE INDEX "content_versions_pn" ON "content_versions" USING btree ("presentation_id","n");--> statement-breakpoint
CREATE UNIQUE INDEX "deck_versions_pn" ON "deck_versions" USING btree ("presentation_id","n");--> statement-breakpoint
CREATE INDEX "events_name_idx" ON "events" USING btree ("name","created_at");--> statement-breakpoint
CREATE INDEX "presentations_owner_idx" ON "presentations" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "presentations_share_idx" ON "presentations" USING btree ("share_token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "render_artifacts_uq" ON "render_artifacts" USING btree ("deck_version_id","slide_id");--> statement-breakpoint
CREATE INDEX "chunks_pres_idx" ON "source_chunks" USING btree ("presentation_id");--> statement-breakpoint
CREATE INDEX "sources_pres_idx" ON "sources" USING btree ("presentation_id");