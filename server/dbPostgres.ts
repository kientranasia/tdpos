import { AsyncLocalStorage } from 'node:async_hooks';
import { Pool, type PoolClient } from 'pg';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import * as schema from './schema';
import { DATA_DIR } from './runtimeConfig';

type PgContext = { client: PoolClient };

const parseSsl = () => {
  const value = String(process.env.PGSSLMODE || '').trim().toLowerCase();
  return value === 'require' || value === 'verify-full' ? { rejectUnauthorized: value === 'verify-full' } : undefined;
};

export const postgresPool = new Pool({
  connectionString: process.env.DATABASE_URL || undefined,
  host: process.env.POSTGRES_HOST || '127.0.0.1',
  port: Number(process.env.POSTGRES_PORT || 5432),
  database: process.env.POSTGRES_DB || 'tdpos',
  user: process.env.POSTGRES_USER || 'tdpos',
  password: process.env.POSTGRES_PASSWORD || '',
  max: Number(process.env.POSTGRES_POOL_MAX || 20),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  ssl: parseSsl(),
});

const context = new AsyncLocalStorage<PgContext>();

const replacePlaceholders = (query: string) => {
  let result = '';
  let parameter = 0;
  let quote: 'single' | 'double' | null = null;
  for (let index = 0; index < query.length; index += 1) {
    const character = query[index];
    if (character === "'" && quote !== 'double') {
      if (quote === 'single' && query[index + 1] === "'") {
        result += "''";
        index += 1;
        continue;
      }
      quote = quote === 'single' ? null : 'single';
      result += character;
      continue;
    }
    if (character === '"' && quote !== 'single') {
      quote = quote === 'double' ? null : 'double';
      result += character;
      continue;
    }
    if (character === '?' && !quote) {
      parameter += 1;
      result += `$${parameter}`;
      continue;
    }
    result += character;
  }
  return result;
};

const translateSqliteSql = (query: string) => {
  let sql = query.trim();
  const insertIgnore = /^insert\s+or\s+ignore\s+into\s+/i.test(sql);
  if (insertIgnore) sql = sql.replace(/^insert\s+or\s+ignore\s+into\s+/i, 'insert into ');
  sql = replacePlaceholders(sql);
  // Drizzle's SQLite dialect qualifies conflict-target columns with the
  // table name. PostgreSQL requires bare column names in ON CONFLICT (...),
  // while keeping qualified references in the DO UPDATE expression valid.
  sql = sql.replace(/on conflict \(([^)]+)\)/i, (_match, target: string) => (
    `on conflict (${target.replace(/"[^".]+"\./g, '')})`
  ));
  if (insertIgnore && !/\bon\s+conflict\b/i.test(sql)) {
    const returningIndex = sql.search(/\sreturning\s/i);
    sql = returningIndex >= 0
      ? `${sql.slice(0, returningIndex)} on conflict do nothing${sql.slice(returningIndex)}`
      : `${sql} on conflict do nothing`;
  }
  return sql;
};

const query = async (sql: string, params: unknown[], method: string = 'all') => {
  const client = context.getStore()?.client;
  const result = client
    ? await client.query(translateSqliteSql(sql), params)
    : await postgresPool.query(translateSqliteSql(sql), params);

  // drizzle-orm/sqlite-proxy expects raw rows as arrays indexed in SELECT
  // order, while node-postgres returns objects keyed by column name. Convert
  // first, then return one row for `.get()` and an array for `.all()`.
  const rowValues = result.rows.map((row) => Array.isArray(row) ? row : Object.values(row));
  const rows = method === 'get' ? rowValues[0] : rowValues;
  return { rows };
};

const remoteDb = drizzle(async (sql, params, method) => {
  return query(sql, params, method);
}, { schema });

// Drizzle's SQLite proxy gives the existing route layer the same query shape
// (.get/.all/.run), while PostgreSQL remains the actual storage engine. The
// transaction wrapper pins every statement in the transaction to one client;
// without this, BEGIN and the following statements could land on different
// pool connections.
export const db = new Proxy(remoteDb as any, {
  get(target, property, receiver) {
    if (property !== 'transaction') return Reflect.get(target, property, receiver);
    return async (callback: (tx: unknown) => Promise<unknown>, config?: unknown) => {
      const client = await postgresPool.connect();
      try {
        return await context.run({ client }, () => target.transaction(callback, config));
      } finally {
        client.release();
      }
    };
  },
});

export const controlDb = db;

// The first hosted PostgreSQL rollout uses one private database and keeps
// tenant_id predicates as the application isolation boundary. The registry
// surface stays compatible with the existing SQLite SaaS adapter so the
// schema-per-tenant variant can be added without changing route imports.
export class PostgresTenantDatabaseRegistry {
  readonly mode = 'postgres';

  runWithTenantDatabase<T>(_tenantId: string, callback: () => T): T {
    return callback();
  }

  runWithControlDatabase<T>(callback: () => T): T {
    return callback();
  }

  ensureTenantDatabase(_tenantId: string) {
    return { db };
  }

  provisionTenantDatabase(_tenantId: string) {
    return Promise.resolve();
  }

  syncTenantRecord(_tenantId: string) {
    return Promise.resolve();
  }

  syncUserToControl(_user: Record<string, unknown>) {
    return Promise.resolve();
  }

  syncUserToTenant(_user: Record<string, unknown>) {
    return Promise.resolve();
  }

  deleteUserFromControl(_userId: string) {
    return Promise.resolve();
  }

  deleteUserFromTenant(_tenantId: string, _userId: string) {
    return Promise.resolve();
  }

  deleteTenantDatabase(_tenantId: string) {
    return Promise.resolve();
  }

  backupDirectory(_tenantId: string, dataRoot = DATA_DIR) {
    return dataRoot;
  }

  inspectTenantDatabase(tenantId: string) {
    return {
      tenantId,
      databaseKey: process.env.POSTGRES_DB || 'tdpos',
      exists: true,
      open: true,
      sizeBytes: 0,
      schemaVersion: null,
      integrity: 'ok' as const,
    };
  }

  replaceTenantDatabase(_tenantId: string, _stagedPath: string) {
    throw new Error('PostgreSQL không hỗ trợ khôi phục từ file SQLite. Hãy dùng pg_dump/pg_restore.');
  }
}

export const tenantRegistry = new PostgresTenantDatabaseRegistry();

// Kept only to make accidental SQLite-only code fail loudly on the PG branch.
export const sqlite = {
  prepare() {
    throw new Error('SQLite raw API không khả dụng khi DATABASE_PROVIDER=postgres.');
  },
  transaction() {
    throw new Error('SQLite transaction API không khả dụng khi DATABASE_PROVIDER=postgres.');
  },
  backup() {
    throw new Error('SQLite backup API không khả dụng khi DATABASE_PROVIDER=postgres.');
  },
  close() {
    return undefined;
  },
} as any;

export const DB_PATH = '';

export type PgClient = PoolClient;
