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
  addColumnIfMissing('customers', 'tags', "tags TEXT NOT NULL DEFAULT '[]'");
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
  // Các cột billing cũ chỉ giữ để tương thích migration; instance local không còn trial.
sqlite.prepare("UPDATE tenants SET status = 'active', subscription_status = 'active' WHERE status = 'trial' OR subscription_status = 'trial'").run();
sqlite.prepare("UPDATE tenants SET name = 'HKDPlus Demo', legal_name = 'Hộ kinh doanh demo', address = 'Quận 1, Thành phố Hồ Chí Minh' WHERE name LIKE 'TDPOS%'").run();
sqlite.prepare("UPDATE users SET email = 'owner@hkdplus.local' WHERE email = 'owner@tdpos.vn' AND id = 'user-owner-demo'").run();
}

if (sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'invoices'").get()) {
  addColumnIfMissing('invoices', 'note', "note TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing('invoices', 'tax_amount', "tax_amount REAL NOT NULL DEFAULT 0");
  addColumnIfMissing('invoices', 'document_no', "document_no TEXT NOT NULL DEFAULT ''");
}

if (sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'purchases'").get()) {
  addColumnIfMissing('purchases', 'document_no', "document_no TEXT NOT NULL DEFAULT ''");
}

if (sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'products'").get()) {
  addColumnIfMissing('products', 'tax_rate', "tax_rate REAL NOT NULL DEFAULT 0");
}

if (sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'invoice_items'").get()) {
  addColumnIfMissing('invoice_items', 'tax_rate', "tax_rate REAL NOT NULL DEFAULT 0");
}

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS permissions (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    module TEXT NOT NULL,
    action TEXT NOT NULL,
    label TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS license_instances (
    id TEXT PRIMARY KEY,
    instance_id TEXT NOT NULL UNIQUE,
    license_code TEXT NOT NULL,
    customer_name TEXT NOT NULL DEFAULT '',
    machine_hash TEXT NOT NULL,
    issued_at TEXT,
    expires_at TEXT,
    status TEXT NOT NULL DEFAULT 'unlicensed',
    payload TEXT,
    last_validated_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS backup_logs (
    id TEXT PRIMARY KEY,
    file_path TEXT NOT NULL,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    created_by TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tax_profiles (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    name TEXT NOT NULL DEFAULT 'Mặc định',
    tax_method TEXT NOT NULL DEFAULT 'Chưa cấu hình',
    default_tax_rate REAL NOT NULL DEFAULT 0,
    tax_code TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS document_sequences (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    document_type TEXT NOT NULL,
    prefix TEXT NOT NULL,
    next_number INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL,
    UNIQUE(tenant_id, document_type)
  );

  CREATE TABLE IF NOT EXISTS role_permissions (
    id TEXT PRIMARY KEY,
    role TEXT NOT NULL,
    permission_code TEXT NOT NULL REFERENCES permissions(code),
    allowed INTEGER NOT NULL DEFAULT 1,
    UNIQUE(role, permission_code)
  );

  CREATE TABLE IF NOT EXISTS user_permissions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    user_id TEXT NOT NULL REFERENCES users(id),
    permission_code TEXT NOT NULL REFERENCES permissions(code),
    allowed INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL,
    UNIQUE(user_id, permission_code)
  );

  CREATE TABLE IF NOT EXISTS suppliers (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    tax_code TEXT,
    address TEXT NOT NULL DEFAULT '',
    current_payable REAL NOT NULL DEFAULT 0,
    note TEXT NOT NULL DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS purchases (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    supplier_id TEXT NOT NULL REFERENCES suppliers(id),
    created_by TEXT NOT NULL,
    total_amount REAL NOT NULL,
    tax_amount REAL NOT NULL DEFAULT 0,
    final_amount REAL NOT NULL,
    paid_amount REAL NOT NULL DEFAULT 0,
    payable_amount REAL NOT NULL DEFAULT 0,
    payment_method TEXT NOT NULL,
    status TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS purchase_items (
    id TEXT PRIMARY KEY,
    purchase_id TEXT NOT NULL REFERENCES purchases(id),
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    unit TEXT NOT NULL,
    quantity REAL NOT NULL,
    price REAL NOT NULL,
    tax_rate REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS payable_ledger (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    supplier_id TEXT NOT NULL REFERENCES suppliers(id),
    purchase_id TEXT,
    amount REAL NOT NULL,
    type TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    created_by TEXT NOT NULL
  );

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

  CREATE TABLE IF NOT EXISTS customer_care_logs (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    customer_id TEXT NOT NULL REFERENCES customers(id),
    channel TEXT NOT NULL DEFAULT 'zalo',
    template_type TEXT NOT NULL DEFAULT 'due_today',
    message TEXT NOT NULL DEFAULT '',
    due_date TEXT,
    status TEXT NOT NULL DEFAULT 'sent',
    responded INTEGER NOT NULL DEFAULT 0,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    created_by TEXT NOT NULL
  );
`);

const permissionDefinitions = [
  ['dashboard.view', 'dashboard', 'view', 'Xem tổng quan'],
  ['sales.view', 'sales', 'view', 'Xem bán hàng'],
  ['sales.create', 'sales', 'create', 'Tạo đơn bán'],
  ['sales.cancel', 'sales', 'delete', 'Hủy chứng từ bán'],
  ['sales.view_cost', 'sales', 'view_cost', 'Xem giá vốn khi bán'],
  ['inventory.view', 'inventory', 'view', 'Xem kho'],
  ['inventory.create', 'inventory', 'create', 'Tạo hàng hóa'],
  ['inventory.update', 'inventory', 'update', 'Sửa hàng hóa'],
  ['inventory.delete', 'inventory', 'delete', 'Xóa hàng hóa'],
  ['inventory.adjust', 'inventory', 'adjust', 'Điều chỉnh tồn kho'],
  ['inventory.view_cost', 'inventory', 'view_cost', 'Xem giá vốn'],
  ['purchases.view', 'purchases', 'view', 'Xem nhập hàng'],
  ['purchases.create', 'purchases', 'create', 'Tạo phiếu nhập'],
  ['purchases.approve', 'purchases', 'approve', 'Xác nhận phiếu nhập'],
  ['partners.view', 'partners', 'view', 'Xem đối tác'],
  ['partners.create', 'partners', 'create', 'Thêm đối tác'],
  ['partners.update', 'partners', 'update', 'Sửa đối tác'],
  ['debt.view', 'debt', 'view', 'Xem công nợ'],
  ['debt.collect', 'debt', 'collect', 'Thu/trả công nợ'],
  ['cashbook.view', 'cashbook', 'view', 'Xem thu chi'],
  ['cashbook.create', 'cashbook', 'create', 'Tạo giao dịch thu chi'],
  ['reports.view', 'reports', 'view', 'Xem báo cáo'],
  ['reports.export', 'reports', 'export', 'Xuất báo cáo'],
  ['settings.view', 'settings', 'view', 'Xem cài đặt'],
  ['settings.manage_users', 'settings', 'manage_users', 'Quản lý nhân viên'],
  ['settings.manage_permissions', 'settings', 'manage_permissions', 'Quản lý phân quyền'],
];
for (const [code, module, action, label] of permissionDefinitions) {
  sqlite.prepare(`INSERT OR IGNORE INTO permissions (id, code, module, action, label) VALUES (?, ?, ?, ?, ?)`)
    .run(`perm-${code}`, code, module, action, label);
}

const roleDefaults: Record<string, string[]> = {
  owner: permissionDefinitions.map(([code]) => code),
  manager: permissionDefinitions.filter(([code]) => !['settings.manage_users', 'settings.manage_permissions', 'sales.cancel'].includes(code)).map(([code]) => code),
  cashier: ['sales.view', 'sales.create', 'partners.view', 'partners.create', 'debt.view'],
  warehouse: ['inventory.view', 'inventory.adjust', 'inventory.view_cost', 'purchases.view', 'purchases.create', 'purchases.approve', 'partners.view'],
  accountant: ['dashboard.view', 'purchases.view', 'partners.view', 'debt.view', 'debt.collect', 'cashbook.view', 'cashbook.create', 'reports.view', 'reports.export'],
};
for (const [role, codes] of Object.entries(roleDefaults)) {
  for (const code of codes) {
    sqlite.prepare(`INSERT OR IGNORE INTO role_permissions (id, role, permission_code, allowed) VALUES (?, ?, ?, 1)`)
      .run(`role-${role}-${code}`, role, code);
  }
}

const defaultPackage = sqlite.prepare(`SELECT id FROM packages WHERE code = ?`).get('starter_1');
if (!defaultPackage) {
  const now = new Date().toISOString();
  sqlite.prepare(`
    INSERT INTO packages (id, code, name, max_users, price_monthly, is_default, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run('pkg-starter-1', 'starter_1', 'Starter 1', 1, 150000, 1, 'active', now);
}

export const db = drizzle(sqlite, { schema });
export { sqlite, DB_PATH };
