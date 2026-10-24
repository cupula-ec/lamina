CREATE TABLE "work_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"presentation_id" uuid NOT NULL,
	"job_id" text,
	"run_key" text NOT NULL,
	"kind" text NOT NULL,
	"ref" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"heartbeat_at" timestamp with time zone,
	"error" text,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "work_units" ADD CONSTRAINT "work_units_presentation_id_presentations_id_fk" FOREIGN KEY ("presentation_id") REFERENCES "public"."presentations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "work_units_run_ref" ON "work_units" USING btree ("presentation_id","run_key","kind","ref");--> statement-breakpoint
CREATE INDEX "work_units_state_hb" ON "work_units" USING btree ("state","heartbeat_at");