ALTER TABLE "podcasts" RENAME COLUMN "mp3_file_url" TO "audio_file_url";--> statement-breakpoint
ALTER TABLE "podcasts" ALTER COLUMN "date" SET DEFAULT '2025-02-22 15:46:47.988';