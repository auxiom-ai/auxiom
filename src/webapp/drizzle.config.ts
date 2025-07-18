import { defineConfig  } from 'drizzle-kit';

export default defineConfig({
  dialect: "postgresql",
  schema: './lib/db/schema.ts',
  out: './lib/db/migrations',

  dbCredentials: {
    url: process.env.POSTGRES_URL!,
  },
});
