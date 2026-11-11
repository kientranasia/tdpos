import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import { PER_TENANT_DATABASES } from './runtimeConfig';

type SqliteDatabase = Database.Database;
type DrizzleDatabase = ReturnType<typeof drizzle<typeof schema>>;

type TenantContext = {
  tenantId: string;
  sqlite: SqliteDatabase;
  db: DrizzleDatabase;
};

type RegistryOptions = {
  controlSqlite: SqliteDatabase;
  controlDb: DrizzleDatabase;
  dataDir: string;
};

export type TenantDatabaseInspection = {
  tenantId: string;
  databaseKey: string;
  exists: boolean;
  open: boolean;
  sizeBytes: number;
  schemaVersion: number | null;
  integrity: 'ok' | 'error' | 'missing' | 'unavailable';
};

const tenantContext = new AsyncLocalStorage<TenantContext>();

// These tables are intentionally global. They contain platform metadata needed
// by every tenant, but no customer transactions or business records.
const globalTables = new Set(['permissions', 'role_permissions', 'packages']);

// Child tables in the current schema that do not carry tenant_id themselves.
// They are copied only through a parent row already owned by the tenant.
const childRelations: Record<string, { parent: string; foreignKey: string }> = {
  invoice_items: { parent: 'invoices', foreignKey: 'invoice_id' },
  purchase_items: { parent: 'purchases', foreignKey: 'purchase_id' },
  purchase_return_items: { parent: 'purchase_returns', foreignKey: 'return_id' },
  sales_return_items: { parent: 'sales_returns', foreignKey: 'return_id' },
  payment_allocations: { parent: 'payments', foreignKey: 'payment_id' },
  role_profile_permissions: { parent: 'role_profiles', foreignKey: 'role_profile_id' },
};

const copyOrder = [
  'permissions',
  'role_permissions',
  'packages',
  'tenants',
  'users',
  'user_permissions',
  'role_profiles',
  'role_profile_permissions',
  'tax_profiles',
  'document_sequences',
  'categories',
  'units',
  'products',
  'product_units',
  'product_components',
  'price_lists',
  'price_list_items',
  'suppliers',
  'customers',
  'cash_accounts',
  'purchases',
  'purchase_items',
  'payable_ledger',
  'subscriptions',
  'invoices',
  'invoice_items',
  'sales_returns',
  'sales_return_items',
  'purchase_returns',
  'purchase_return_items',
  'supplier_credit_ledger',
  'debt_ledger',
  'cashbook_entries',
  'payments',
  'payment_allocations',
  'stock_reservations',
  'stock_movements',
  'customer_care_logs',
  'product_import_batches',
  'product_import_issues',
  'backup_logs',
  'audit_logs',
];

const quoteIdentifier = (value: string) => `"${value.replace(/"/g, '""')}"`;

const tableNames = (sqlite: SqliteDatabase) => (sqlite.prepare(
  "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
).all() as Array<{ name: string }>).map((row) => row.name);

const tableColumns = (sqlite: SqliteDatabase, table: string) => (sqlite.prepare(
  `PRAGMA table_info(${quoteIdentifier(table)})`,
).all() as Array<{ name: string }>).map((column) => column.name);

const hasTable = (sqlite: SqliteDatabase, table: string) => Boolean(sqlite.prepare(
  "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
).get(table));

const tableOrder = (table: string) => {
  const index = copyOrder.indexOf(table);
  return index < 0 ? copyOrder.length : index;
};

export class TenantDatabaseRegistry {
  private readonly contexts = new Map<string, TenantContext>();
  private readonly controlSqlite: SqliteDatabase;
  private readonly controlDb: DrizzleDatabase;
  private readonly dataDir: string;
  private readonly tenantDir: string;
  private readonly transactionTails = new WeakMap<object, Promise<void>>();

  constructor(options: RegistryOptions) {
    this.controlSqlite = options.controlSqlite;
    this.controlDb = options.controlDb;
    this.dataDir = options.dataDir;
    this.tenantDir = path.join(this.dataDir, 'tenants');
    if (PER_TENANT_DATABASES && !fs.existsSync(this.tenantDir)) {
      fs.mkdirSync(this.tenantDir, { recursive: true, mode: 0o700 });
    }
  }

  private databaseFileFor(tenantId: string) {
    const digest = crypto.createHash('sha256').update(tenantId).digest('hex').slice(0, 32);
    return path.join(this.tenantDir, `tenant-${digest}.db`);
  }

  private tenantStorageKey(tenantId: string) {
    return path.basename(this.databaseFileFor(tenantId), '.db');
  }

  databasePath(tenantId: string) {
    return this.databaseFileFor(tenantId);
  }

  backupDirectory(tenantId: string, sharedRoot: string) {
    if (!PER_TENANT_DATABASES) return path.join(sharedRoot, 'backups');
    return path.join(this.dataDir, 'backups', this.tenantStorageKey(tenantId));
  }

  private createSchema(target: SqliteDatabase) {
    const objects = this.controlSqlite.prepare(
      "SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 1 WHEN 'index' THEN 2 WHEN 'trigger' THEN 3 WHEN 'view' THEN 4 ELSE 5 END, name",
    ).all() as Array<{ type: string; name: string; sql: string }>;
    for (const object of objects) {
      // SQLite creates auto-indexes from UNIQUE/PRIMARY KEY constraints.
      // Their sqlite_master SQL is null and they are already excluded above.
      if (!object.sql.trim()) continue;
      target.exec(object.sql);
    }
  }

  private ensureSchema(target: SqliteDatabase) {
    const objects = this.controlSqlite.prepare(
      "SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 1 WHEN 'index' THEN 2 WHEN 'trigger' THEN 3 WHEN 'view' THEN 4 ELSE 5 END, name",
    ).all() as Array<{ type: string; name: string; sql: string }>;
    for (const object of objects) {
      if (object.type === 'table' && !hasTable(target, object.name)) {
        target.exec(object.sql);
        continue;
      }
      if (object.type !== 'table') continue;
      const sourceColumns = this.controlSqlite.prepare(`PRAGMA table_info(${quoteIdentifier(object.name)})`).all() as Array<{ name: string; type: string; notnull: number; dflt_value: string | null }>;
      const targetColumns = new Set(tableColumns(target, object.name));
      for (const column of sourceColumns) {
        if (targetColumns.has(column.name)) continue;
        // New application columns are additive. If an old tenant file has
        // rows and the source column has no default, keep it nullable during
        // this compatibility migration instead of breaking startup.
        const notNull = column.notnull && column.dflt_value !== null ? ' NOT NULL' : '';
        const defaultValue = column.dflt_value === null ? '' : ` DEFAULT ${column.dflt_value}`;
        target.exec(`ALTER TABLE ${quoteIdentifier(object.name)} ADD COLUMN ${quoteIdentifier(column.name)} ${column.type || 'TEXT'}${notNull}${defaultValue}`);
      }
    }
  }

  private insertRows(target: SqliteDatabase, table: string, rows: Array<Record<string, unknown>>) {
    if (!rows.length) return;
    const columns = tableColumns(this.controlSqlite, table);
    if (!columns.length) return;
    const columnSql = columns.map(quoteIdentifier).join(', ');
    const placeholders = columns.map(() => '?').join(', ');
    const insert = target.prepare(`INSERT OR IGNORE INTO ${quoteIdentifier(table)} (${columnSql}) VALUES (${placeholders})`);
    const writeRows = target.transaction((items: Array<Record<string, unknown>>) => {
      for (const row of items) insert.run(...columns.map((column) => row[column]));
    });
    writeRows(rows);
  }

  private rowsForTenant(table: string, tenantId: string) {
    const columns = tableColumns(this.controlSqlite, table);
    if (table === 'tenants') {
      return this.controlSqlite.prepare(`SELECT * FROM ${quoteIdentifier(table)} WHERE id = ?`).all(tenantId) as Array<Record<string, unknown>>;
    }
    if (columns.includes('tenant_id')) {
      return this.controlSqlite.prepare(`SELECT * FROM ${quoteIdentifier(table)} WHERE tenant_id = ?`).all(tenantId) as Array<Record<string, unknown>>;
    }
    if (globalTables.has(table)) {
      return this.controlSqlite.prepare(`SELECT * FROM ${quoteIdentifier(table)}`).all() as Array<Record<string, unknown>>;
    }
    const relation = childRelations[table];
    if (relation) {
      return this.controlSqlite.prepare(
        `SELECT child.* FROM ${quoteIdentifier(table)} child WHERE child.${quoteIdentifier(relation.foreignKey)} IN (SELECT id FROM ${quoteIdentifier(relation.parent)} WHERE tenant_id = ?)`,
      ).all(tenantId) as Array<Record<string, unknown>>;
    }
    return [];
  }

  private copyTenantData(target: SqliteDatabase, tenantId: string) {
    const knownTables = tableNames(this.controlSqlite).sort((left, right) => tableOrder(left) - tableOrder(right));
    target.pragma('foreign_keys = OFF');
    try {
      for (const table of knownTables) {
        const rows = this.rowsForTenant(table, tenantId);
        this.insertRows(target, table, rows);
      }
    } finally {
      target.pragma('foreign_keys = ON');
    }
    const foreignKeyErrors = target.prepare('PRAGMA foreign_key_check').all() as Array<Record<string, unknown>>;
    if (foreignKeyErrors.length) {
      throw new Error(`Tenant database foreign key check failed for ${tenantId}`);
    }
  }

  private updateControlStatus(tenantId: string, status: string, databaseKey: string, provisionedAt: string | null) {
    this.controlSqlite.prepare(
      'UPDATE tenants SET database_engine = ?, database_key = ?, database_status = ?, database_provisioned_at = ? WHERE id = ?',
    ).run('sqlite', databaseKey, status, provisionedAt, tenantId);
  }

  private syncTenantRow(target: SqliteDatabase, tenant: Record<string, unknown>) {
    const columns = tableColumns(this.controlSqlite, 'tenants').filter((column) => column !== 'id');
    const update = target.prepare(`UPDATE tenants SET ${columns.map((column) => `${quoteIdentifier(column)} = ?`).join(', ')} WHERE id = ?`);
    update.run(...columns.map((column) => tenant[column]), tenant.id);
  }

  private openTenantContext(tenantId: string, hydrateFromControl = true) {
    const filePath = this.databaseFileFor(tenantId);
    const tenantKey = path.basename(filePath);
    const sqlite = new Database(filePath);
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    try {
      if (!hasTable(sqlite, 'tenants')) this.createSchema(sqlite);
      else this.ensureSchema(sqlite);
      if (hydrateFromControl) this.copyTenantData(sqlite, tenantId);
      sqlite.pragma('user_version = 1');
      const databaseNow = new Date().toISOString();
      this.updateControlStatus(tenantId, 'ready', tenantKey, databaseNow);
      // The tenant row contains branding and subscription state. Keep the
      // tenant copy in sync with the control record after provisioning.
      const tenant = this.controlSqlite.prepare('SELECT * FROM tenants WHERE id = ?').get(tenantId) as Record<string, unknown> | undefined;
      if (tenant) this.syncTenantRow(sqlite, tenant);
      const db = drizzle(sqlite, { schema }) as DrizzleDatabase;
      return { tenantId, sqlite, db };
    } catch (error) {
      sqlite.close();
      this.updateControlStatus(tenantId, 'error', tenantKey, null);
      throw error;
    }
  }

  ensureTenantDatabase(tenantId: string) {
    if (!PER_TENANT_DATABASES) return { tenantId, sqlite: this.controlSqlite, db: this.controlDb };
    const existing = this.contexts.get(tenantId);
    if (existing) return existing;
    const tenant = this.controlSqlite.prepare('SELECT id FROM tenants WHERE id = ?').get(tenantId);
    if (!tenant) throw new Error('Tenant không tồn tại.');
    const context = this.openTenantContext(tenantId);
    this.contexts.set(tenantId, context);
    return context;
  }

  provisionTenantDatabase(tenantId: string) {
    return this.ensureTenantDatabase(tenantId);
  }

  inspectTenantDatabase(tenantId: string): TenantDatabaseInspection {
    const filePath = this.databaseFileFor(tenantId);
    const databaseKey = path.basename(filePath);
    if (!fs.existsSync(filePath)) {
      return { tenantId, databaseKey, exists: false, open: this.contexts.has(tenantId), sizeBytes: 0, schemaVersion: null, integrity: 'missing' };
    }
    try {
      const stat = fs.statSync(filePath);
      const sqlite = this.contexts.get(tenantId)?.sqlite || new Database(filePath, { readonly: true });
      const schemaVersion = Number(sqlite.pragma('user_version', { simple: true }));
      const integrity = sqlite.pragma('integrity_check', { simple: true }) === 'ok' ? 'ok' : 'error';
      if (!this.contexts.has(tenantId)) sqlite.close();
      return { tenantId, databaseKey, exists: true, open: this.contexts.has(tenantId), sizeBytes: stat.size, schemaVersion, integrity };
    } catch {
      return { tenantId, databaseKey, exists: true, open: this.contexts.has(tenantId), sizeBytes: 0, schemaVersion: null, integrity: 'unavailable' };
    }
  }

  syncTenantRecord(tenantId: string) {
    if (!PER_TENANT_DATABASES) return;
    const context = this.ensureTenantDatabase(tenantId);
    const tenant = this.controlSqlite.prepare('SELECT * FROM tenants WHERE id = ?').get(tenantId) as Record<string, unknown> | undefined;
    if (!tenant) return;
    this.syncTenantRow(context.sqlite, tenant);
  }

  closeTenantDatabase(tenantId: string) {
    if (!PER_TENANT_DATABASES) return;
    const context = this.contexts.get(tenantId);
    if (context) {
      context.sqlite.close();
      this.contexts.delete(tenantId);
    }
  }

  deleteTenantDatabase(tenantId: string) {
    if (!PER_TENANT_DATABASES) return;
    this.closeTenantDatabase(tenantId);
    const filePath = this.databaseFileFor(tenantId);
    // The filename is derived from the tenant id and never comes from a
    // request path. Remove SQLite sidecar files as well so deleted tenant
    // data is not left accessible on disk.
    for (const candidate of [filePath, `${filePath}-wal`, `${filePath}-shm`]) {
      fs.rmSync(candidate, { force: true });
    }
  }

  replaceTenantDatabase(tenantId: string, sourcePath: string) {
    if (!PER_TENANT_DATABASES) throw new Error('Tenant database mode is not enabled.');
    const destinationPath = this.databaseFileFor(tenantId);
    this.closeTenantDatabase(tenantId);
    for (const candidate of [destinationPath, `${destinationPath}-wal`, `${destinationPath}-shm`]) {
      fs.rmSync(candidate, { force: true });
    }
    fs.renameSync(sourcePath, destinationPath);
    fs.chmodSync(destinationPath, 0o600);

    // Restore must not rehydrate rows from the control database: doing so
    // would re-introduce records that were intentionally absent in the
    // selected snapshot. Open the restored file schema-only and mirror the
    // restored login registry back to the control database.
    const context = this.openTenantContext(tenantId, false);
    this.contexts.set(tenantId, context);
    const restoredUsers = context.sqlite.prepare('SELECT * FROM users WHERE tenant_id = ?').all(tenantId) as Array<Record<string, unknown>>;
    const restoreUsers = this.controlSqlite.transaction((users: Array<Record<string, unknown>>) => {
      this.controlSqlite.prepare('DELETE FROM users WHERE tenant_id = ?').run(tenantId);
      const insert = this.controlSqlite.prepare(
        'INSERT INTO users (id, name, email, password, phone, role, tenant_id, status, session_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      );
      for (const user of users) {
        insert.run(user.id, user.name, user.email, user.password, user.phone ?? null, user.role, user.tenant_id, user.status, user.session_version ?? 1);
      }
    });
    restoreUsers(restoredUsers);
    return context;
  }

  syncUserToControl(user: Record<string, unknown>) {
    if (!PER_TENANT_DATABASES) return;
    const existing = this.controlSqlite.prepare('SELECT id FROM users WHERE id = ?').get(user.id);
    const values = [user.name, user.email, user.password, user.phone ?? null, user.role, user.tenantId, user.status, user.sessionVersion ?? 1];
    if (existing) {
      this.controlSqlite.prepare('UPDATE users SET name = ?, email = ?, password = ?, phone = ?, role = ?, tenant_id = ?, status = ?, session_version = ? WHERE id = ?').run(...values, user.id);
    } else {
      this.controlSqlite.prepare('INSERT INTO users (id, name, email, password, phone, role, tenant_id, status, session_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(user.id, ...values);
    }
  }

  syncUserToTenant(user: Record<string, unknown>) {
    if (!PER_TENANT_DATABASES) return;
    const context = this.ensureTenantDatabase(String(user.tenantId));
    const existing = context.sqlite.prepare('SELECT id FROM users WHERE id = ?').get(user.id);
    const values = [user.name, user.email, user.password, user.phone ?? null, user.role, user.tenantId, user.status, user.sessionVersion ?? 1];
    if (existing) {
      context.sqlite.prepare('UPDATE users SET name = ?, email = ?, password = ?, phone = ?, role = ?, tenant_id = ?, status = ?, session_version = ? WHERE id = ?').run(...values, user.id);
    } else {
      context.sqlite.prepare('INSERT INTO users (id, name, email, password, phone, role, tenant_id, status, session_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(user.id, ...values);
    }
  }

  deleteUserFromControl(userId: string) {
    if (!PER_TENANT_DATABASES) return;
    this.controlSqlite.prepare('DELETE FROM users WHERE id = ?').run(userId);
  }

  deleteUserFromTenant(tenantId: string, userId: string) {
    if (!PER_TENANT_DATABASES) return;
    const context = this.ensureTenantDatabase(tenantId);
    context.sqlite.prepare('DELETE FROM users WHERE id = ? AND tenant_id = ?').run(userId, tenantId);
  }

  runWithTenantDatabase<T>(tenantId: string, callback: () => T) {
    if (!PER_TENANT_DATABASES) return callback();
    const context = this.ensureTenantDatabase(tenantId);
    return tenantContext.run(context, callback);
  }

  private activeDb() {
    return tenantContext.getStore()?.db || this.controlDb;
  }

  private activeSqlite() {
    return tenantContext.getStore()?.sqlite || this.controlSqlite;
  }

  createDbProxy<T extends object>(fallback: T): T {
    return new Proxy(fallback, {
      get: (_target, property) => {
        const active = this.activeDb() as any;
        if (property === 'transaction') {
          return async (callback: (tx: any) => Promise<unknown> | unknown) => {
            const sqlite = this.activeSqlite();
            const previous = this.transactionTails.get(sqlite) || Promise.resolve();
            let release!: () => void;
            const current = new Promise<void>((resolve) => { release = resolve; });
            const queued = previous.then(() => current);
            this.transactionTails.set(sqlite, queued);
            await previous;
            try {
              sqlite.exec('BEGIN');
              const result = await callback(active);
              sqlite.exec('COMMIT');
              return result;
            } catch (error) {
              try { sqlite.exec('ROLLBACK'); } catch { /* preserve the original error */ }
              throw error;
            } finally {
              release();
              if (this.transactionTails.get(sqlite) === queued) this.transactionTails.delete(sqlite);
            }
          };
        }
        const value = active[property as keyof typeof active];
        return typeof value === 'function' ? value.bind(active) : value;
      },
    }) as T;
  }

  createSqliteProxy<T extends object>(fallback: T): T {
    return new Proxy(fallback, {
      get: (_target, property) => {
        const active = this.activeSqlite() as any;
        const value = active[property as keyof typeof active];
        return typeof value === 'function' ? value.bind(active) : value;
      },
    }) as T;
  }
}
