import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import dotenv from 'dotenv';

dotenv.config();
console.log(process.env.POSTGRES_URL);
if (!process.env.POSTGRES_URL) {
  throw new Error('POSTGRES_URL environment variable is not set');
}

export const client = postgres(process.env.POSTGRES_URL);
export const db = drizzle(client, { schema });
