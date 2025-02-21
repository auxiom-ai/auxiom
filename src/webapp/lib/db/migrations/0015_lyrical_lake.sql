CREATE TABLE IF NOT EXISTS "podcasts" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(255) NOT NULL,
	"articles" jsonb NOT NULL,
	"episode_number" integer NOT NULL,
	"episode_type" varchar(255) NOT NULL,
	"mp3_file_url" varchar(512) NOT NULL,
	"date" timestamp DEFAULT '2025-02-21 18:51:13.713' NOT NULL,
	"completed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "podcasts" jsonb DEFAULT '[]'::jsonb NOT NULL;