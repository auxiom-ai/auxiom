import { pgTable, serial, text, varchar, jsonb, integer, boolean, timestamp, vector, real } from 'drizzle-orm/pg-core';

// Define the user table schema
const DEFAULT_EMBEDDING = Array(384).fill(0);

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: varchar('name', { length: 255 }),
  deliveryDay: integer('delivery_day').notNull().default(1),
  delivered: timestamp('delivered').notNull().default(new Date(0)),
  active: boolean('active').notNull().default(false),
  keywords: jsonb('keywords').notNull().default([]),
  role: varchar('role', { length: 255 }).notNull().default('Other'),
  occupation: varchar('occupation', { length: 255 }),
  industry: varchar('industry', { length: 255 }),
  stripeCustomerId: text('stripe_customer_id').unique(),
  stripeSubscriptionId: text('stripe_subscription_id').unique(),
  stripeProductId: text('stripe_product_id'),
  plan: varchar('plan', { length: 50 }).notNull().default('free'),
  episode: integer('episode').notNull().default(1),
  verified: boolean('verified').notNull().default(false),
  embedding: vector('embedding', { dimensions: 384 }),
  auth_user_id: text('auth_user_id').unique()
});

// Email table for newsletter
export const emails = pgTable('emails', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  subscribed: boolean('subscribed').notNull().default(true),
});

// Podcasts table for storing podcast episodes
export const podcasts = pgTable('podcasts', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  articles: jsonb('articles').notNull(),
  episodeNumber: integer('episode_number').notNull(),
  audioFileUrl: varchar('audio_file_url', { length: 512 }),
  date: timestamp('date').notNull().default(new Date()),
  completed: boolean('completed').notNull().default(false),
  script: jsonb('script').notNull().default([]),
});

export const articles = pgTable('articles', {
  id: serial('id').primaryKey(),
  embedding: vector('embedding', { dimensions: 384 }).notNull(),
  key: varchar('key').notNull(),
  score: real('score').notNull().default(1),
  title: varchar('title', { length: 255 }).notNull().default(''),
  content: text('content').notNull().default(''),
  summary: text('summary').notNull().default(''),
  people: jsonb('people').notNull().default([]),
  duration: integer('duration').notNull().default(0),
  topics: jsonb('topics').notNull().default([]),
  tags: jsonb('tags').notNull().default([]),
  sources: jsonb('sources').notNull().default([]),
  featured: boolean('featured').notNull().default(false),
  date: timestamp('date').notNull(),
});

// Congress bills table for storing scraped congressional bills
export const congressBills = pgTable('congress_bills', {
  id: serial('id').primaryKey(),
  billId: varchar('bill_id', { length: 100 }).notNull().unique(), // e.g., "hr3876-119"
  title: text('title').notNull(),
  url: varchar('url', { length: 512 }),
  latestActionDate: varchar('latest_action_date', { length: 50 }),
  latestActionText: text('latest_action_text'),
  congress: integer('congress'),
  billType: varchar('bill_type', { length: 20 }),
  billNumber: integer('bill_number'),
  keyword: varchar('keyword', { length: 255 }), // The user interest that matched
  similarityScore: real('similarity_score'),
  scrapedAt: timestamp('scraped_at').notNull().default(new Date()),
  active: boolean('active').notNull().default(true), // For soft deletes
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Podcast = typeof podcasts.$inferSelect;
export type NewPodcast = typeof podcasts.$inferInsert;

export type CongressBill = typeof congressBills.$inferSelect;
export type NewCongressBill = typeof congressBills.$inferInsert;

export enum ActivityType {
  SIGN_UP = 'SIGN_UP',
  SIGN_IN = 'SIGN_IN',
  SIGN_OUT = 'SIGN_OUT',
  UPDATE_PASSWORD = 'UPDATE_PASSWORD',
  DELETE_ACCOUNT = 'DELETE_ACCOUNT',
  UPDATE_ACCOUNT = 'UPDATE_ACCOUNT',
}
