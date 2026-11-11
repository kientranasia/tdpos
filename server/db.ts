import { DATABASE_PROVIDER } from './runtimeConfig';

const implementation = DATABASE_PROVIDER === 'postgres'
  ? await import('./dbPostgres')
  : await import('./dbSqlite');

// The provider is selected once at process startup. Offline and the existing
// SQLite SaaS branch keep their current implementation; the PostgreSQL branch
// uses the same route imports without sharing its files or data volume.
export const db = implementation.db as any;
export const controlDb = implementation.controlDb as any;
export const tenantRegistry = implementation.tenantRegistry as any;
export const sqlite = implementation.sqlite as any;
export const DB_PATH = implementation.DB_PATH;
