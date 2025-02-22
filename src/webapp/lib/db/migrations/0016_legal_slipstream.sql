ALTER TABLE "podcasts" ALTER COLUMN "date" SET DEFAULT '2025-02-21 22:46:10.094';--> statement-breakpoint
ALTER TABLE "podcasts" ADD COLUMN "user_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "podcasts";