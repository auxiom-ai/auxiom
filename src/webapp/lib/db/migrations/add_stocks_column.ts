import { sql } from 'drizzle-orm';
import { pgTable, text } from 'drizzle-orm/pg-core';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

export async function up(db: PostgresJsDatabase) {
  await db.execute(
    sql`ALTER TABLE users ADD COLUMN stocks text[] DEFAULT '{}'::text[]`
  );
}
