import { defineConfig } from 'drizzle-kit';

const databaseUrl = process.env.DATABASE_URL || `postgres://${encodeURIComponent(process.env.POSTGRES_USER || 'tdpos')}:${encodeURIComponent(process.env.POSTGRES_PASSWORD || '')}@${process.env.POSTGRES_HOST || '127.0.0.1'}:${process.env.POSTGRES_PORT || '5432'}/${encodeURIComponent(process.env.POSTGRES_DB || 'tdpos')}`;

export default defineConfig({
  schema: './server/schema.pg.ts',
  out: './drizzle/postgres',
  dialect: 'postgresql',
  dbCredentials: { url: databaseUrl },
  strict: true,
  verbose: true,
});
