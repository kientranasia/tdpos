import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, '..', 'data', 'tdpos.db');

// Ensure the data directory exists
import fs from 'fs';
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const sqlite = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

const hasColumn = (table: string, column: string) => {
  const columns = sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return columns.some((col) => col.name === column);
};

const addColumnIfMissing = (table: string, column: string, definition: string) => {
  if (!hasColumn(table, column)) {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  }
};

// Lightweight migrations for local SQLite files created by older seeds.
if (sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'").get()) {
  if (!hasColumn('users', 'password')) {
    sqlite.exec('ALTER TABLE users ADD COLUMN password TEXT');
  }
}

if (sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'customers'").get()) {
  addColumnIfMissing('customers', 'created_by', 'created_by TEXT');
}

if (sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'tenants'").get()) {
  addColumnIfMissing('tenants', 'trial_start_at', 'trial_start_at TEXT');
  addColumnIfMissing('tenants', 'trial_end_at', 'trial_end_at TEXT');
  addColumnIfMissing('tenants', 'subscription_status', "subscription_status TEXT NOT NULL DEFAULT 'trial'");
  addColumnIfMissing('tenants', 'subscription_plan', "subscription_plan TEXT NOT NULL DEFAULT 'yearly'");
  addColumnIfMissing('tenants', 'subscription_price_monthly', 'subscription_price_monthly REAL NOT NULL DEFAULT 150000');
  addColumnIfMissing('tenants', 'subscription_start_at', 'subscription_start_at TEXT');
  addColumnIfMissing('tenants', 'subscription_end_at', 'subscription_end_at TEXT');
  addColumnIfMissing('tenants', 'package_code', "package_code TEXT NOT NULL DEFAULT 'starter_1'");
  addColumnIfMissing('tenants', 'package_name', "package_name TEXT NOT NULL DEFAULT 'Starter 1'");
  addColumnIfMissing('tenants', 'max_users', 'max_users INTEGER NOT NULL DEFAULT 1');
  addColumnIfMissing('tenants', 'package_price_monthly', 'package_price_monthly REAL NOT NULL DEFAULT 150000');
}

if (sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'invoices'").get()) {
  addColumnIfMissing('invoices', 'note', "note TEXT NOT NULL DEFAULT ''");
}

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS packages (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    max_users INTEGER NOT NULL,
    price_monthly REAL NOT NULL,
    is_default INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    plan TEXT NOT NULL DEFAULT 'yearly',
    price_monthly REAL NOT NULL DEFAULT 150000,
    status TEXT NOT NULL DEFAULT 'pending_review',
    note TEXT,
    start_at TEXT,
    end_at TEXT,
    reviewed_by TEXT,
    reviewed_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    actor_type TEXT NOT NULL DEFAULT 'admin',
    actor_id TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    tenant_id TEXT,
    meta TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS cashbook_entries (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    type TEXT NOT NULL,
    amount REAL NOT NULL,
    category TEXT NOT NULL DEFAULT 'Khác',
    note TEXT NOT NULL DEFAULT '',
    reference_id TEXT,
    created_at TEXT NOT NULL,
    created_by TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS stock_movements (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    product_id TEXT NOT NULL REFERENCES products(id),
    type TEXT NOT NULL,
    quantity REAL NOT NULL,
    before_stock REAL NOT NULL,
    after_stock REAL NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    reference_id TEXT,
    created_at TEXT NOT NULL,
    created_by TEXT NOT NULL
  );
`);

const defaultPackage = sqlite.prepare(`SELECT id FROM packages WHERE code = ?`).get('starter_1');
if (!defaultPackage) {
  const now = new Date().toISOString();
  sqlite.prepare(`
    INSERT INTO packages (id, code, name, max_users, price_monthly, is_default, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run('pkg-starter-1', 'starter_1', 'Starter 1', 1, 150000, 1, 'active', now);
}

export const db = drizzle(sqlite, { schema });
export { sqlite };
