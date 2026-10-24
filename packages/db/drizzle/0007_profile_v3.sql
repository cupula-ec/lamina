ALTER TABLE "institutions" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "institutions" ADD COLUMN "verified" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "subjects" text[];--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "career" text;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "faculty" text;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "years_teaching" integer;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "modality" text;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "levels" text[];--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "tech_familiarity" integer;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "ai_familiarity" integer;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "research_consent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "research_consent_version" text;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "research_consent_withdrawn_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "logo_corner" text;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "logo_which" text;