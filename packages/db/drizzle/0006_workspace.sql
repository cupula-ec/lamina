CREATE TABLE "workspace_ops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"rev" integer NOT NULL,
	"idx" integer DEFAULT 0 NOT NULL,
	"op_id" text NOT NULL,
	"author" text NOT NULL,
	"op" jsonb NOT NULL,
	"inverse" jsonb NOT NULL,
	"batch_id" uuid NOT NULL,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"presentation_id" uuid NOT NULL,
	"rev" integer DEFAULT 0 NOT NULL,
	"content" jsonb,
	"deck" jsonb,
	"base_deck_version_id" uuid,
	"base_content_version_id" uuid,
	"dirty" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspaces_presentation_id_unique" UNIQUE("presentation_id")
);
--> statement-breakpoint
ALTER TABLE "workspace_ops" ADD CONSTRAINT "workspace_ops_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_presentation_id_presentations_id_fk" FOREIGN KEY ("presentation_id") REFERENCES "public"."presentations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_ops_opid" ON "workspace_ops" USING btree ("workspace_id","op_id");--> statement-breakpoint
CREATE INDEX "workspace_ops_batch" ON "workspace_ops" USING btree ("workspace_id","batch_id");