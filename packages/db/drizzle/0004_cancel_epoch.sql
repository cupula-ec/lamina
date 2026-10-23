ALTER TABLE "presentations" ADD COLUMN "cancel_epoch" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "presentations" ADD COLUMN "design_base_id" uuid;