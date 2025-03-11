ALTER TABLE "users" ALTER COLUMN "stocks" SET DATA TYPE text[];--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "stocks" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "stocks" DROP NOT NULL;