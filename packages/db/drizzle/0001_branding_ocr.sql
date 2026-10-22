CREATE TABLE "institutions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"short" text NOT NULL,
	"logo_path" text,
	"logo_mime" text,
	"primary_color" text,
	"secondary_color" text,
	"font_id" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "institutions_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "ocr_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"upload_id" uuid NOT NULL,
	"page" integer NOT NULL,
	"engine" text NOT NULL,
	"confidence" integer,
	"chars" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'ok' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "presentations" ADD COLUMN "subject" text;--> statement-breakpoint
ALTER TABLE "presentations" ADD COLUMN "period" text;--> statement-breakpoint
ALTER TABLE "presentations" ADD COLUMN "group_name" text;--> statement-breakpoint
ALTER TABLE "presentations" ADD COLUMN "theme_id" text;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "full_name" text;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "institution_id" uuid;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "personal_logo_path" text;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "personal_logo_mime" text;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "onboarded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ocr_pages" ADD CONSTRAINT "ocr_pages_upload_id_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."uploads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ocr_pages_uq" ON "ocr_pages" USING btree ("upload_id","page","engine");--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE set null ON UPDATE no action;