import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import path from 'path';
import { fileURLToPath } from 'url';
import { DATA_DIR } from './runtimeConfig';
import { TenantDatabaseRegistry } from './tenantDatabase';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(DATA_DIR, 'tdpos.db');

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
  addColumnIfMissing('users', 'session_version', 'session_version INTEGER NOT NULL DEFAULT 1');
}

if (sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'admin_users'").get()) {
  addColumnIfMissing('admin_users', 'session_version', 'session_version INTEGER NOT NULL DEFAULT 1');
}

if (sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'customers'").get()) {
  addColumnIfMissing('customers', 'created_by', 'created_by TEXT');
  addColumnIfMissing('customers', 'code', "code TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing('customers', 'tags', "tags TEXT NOT NULL DEFAULT '[]'");
  const customersWithoutCode = sqlite.prepare("SELECT id, tenant_id FROM customers WHERE code IS NULL OR code = '' ORDER BY rowid").all() as Array<{ id: string; tenant_id: string }>;
  const customersWithCode = sqlite.prepare("SELECT tenant_id, code FROM customers WHERE code IS NOT NULL AND code != ''").all() as Array<{ tenant_id: string; code: string }>;
  const nextCodeByTenant = new Map<string, number>();
  customersWithCode.forEach((customer) => {
    const value = Number(String(customer.code || '').replace(/^KH/i, ''));
    if (Number.isFinite(value)) nextCodeByTenant.set(customer.tenant_id, Math.max(nextCodeByTenant.get(customer.tenant_id) || 0, value));
  });
  for (const customer of customersWithoutCode) {
    const current = nextCodeByTenant.get(customer.tenant_id) || 0;
    const next = current + 1;
    nextCodeByTenant.set(customer.tenant_id, next);
    sqlite.prepare('UPDATE customers SET code = ? WHERE id = ?').run(`KH${String(next).padStart(6, '0')}`, customer.id);
  }
}

if (sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'backup_logs'").get()) {
  addColumnIfMissing('backup_logs', 'tenant_id', 'tenant_id TEXT');
  addColumnIfMissing('backup_logs', 'instance_id', 'instance_id TEXT');
  addColumnIfMissing('backup_logs', 'checksum_sha256', 'checksum_sha256 TEXT');
  addColumnIfMissing('backup_logs', 'schema_version', 'schema_version INTEGER');
  addColumnIfMissing('backup_logs', 'verified', 'verified INTEGER NOT NULL DEFAULT 0');
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
  addColumnIfMissing('tenants', 'database_engine', "database_engine TEXT NOT NULL DEFAULT 'shared_sqlite'");
  addColumnIfMissing('tenants', 'database_key', "database_key TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing('tenants', 'database_status', "database_status TEXT NOT NULL DEFAULT 'shared'");
  addColumnIfMissing('tenants', 'database_provisioned_at', 'database_provisioned_at TEXT');
  if (process.env.OFFLINE_MODE !== 'false') {
    sqlite.prepare("UPDATE tenants SET max_users = 25 WHERE package_code = 'starter_1' AND max_users = 1").run();
  }
  // Các cột billing cũ chỉ giữ để tương thích migration. Không tự động nâng
  // trạng thái trial lên active khi khởi động; entitlement phải được quyết định
  // bởi luồng quản trị/giấy phép tương ứng.
sqlite.prepare("UPDATE tenants SET name = 'HKDPlus Demo', legal_name = 'Hộ kinh doanh demo', address = 'Quận 1, Thành phố Hồ Chí Minh' WHERE name LIKE 'TDPOS%'").run();
sqlite.prepare("UPDATE users SET email = 'owner@hkdplus.local' WHERE email = 'owner@tdpos.vn' AND id = 'user-owner-demo'").run();
}

// Legacy local backups were created before backup ownership metadata existed.
// Only backfill when this is a single-tenant offline instance; never guess an
// owner in a hosted multi-tenant database.
if (process.env.OFFLINE_MODE !== 'false'
  && sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'backup_logs'").get()
  && sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'tenants'").get()) {
  const tenantRows = sqlite.prepare('SELECT id FROM tenants').all() as Array<{ id: string }>;
  if (tenantRows.length === 1) {
    sqlite.prepare("UPDATE backup_logs SET tenant_id = ? WHERE tenant_id IS NULL OR tenant_id = ''").run(tenantRows[0].id);
  }
}

const backupDirectory = path.join(DATA_DIR, 'backups');
if (fs.existsSync(backupDirectory)) {
  fs.chmodSync(backupDirectory, 0o700);
  for (const backupName of fs.readdirSync(backupDirectory)) {
    const backupPath = path.join(backupDirectory, backupName);
    if (fs.statSync(backupPath).isFile()) fs.chmodSync(backupPath, 0o600);
  }
}

if (sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'invoices'").get()) {
  addColumnIfMissing('invoices', 'note', "note TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing('invoices', 'tax_amount', "tax_amount REAL NOT NULL DEFAULT 0");
  addColumnIfMissing('invoices', 'document_no', "document_no TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing('invoices', 'workflow_status', "workflow_status TEXT NOT NULL DEFAULT 'closed'");
  addColumnIfMissing('invoices', 'payment_status', "payment_status TEXT NOT NULL DEFAULT 'unpaid'");
  addColumnIfMissing('invoices', 'checked_by', 'checked_by TEXT');
  addColumnIfMissing('invoices', 'checked_at', 'checked_at TEXT');
  addColumnIfMissing('invoices', 'picked_by', 'picked_by TEXT');
  addColumnIfMissing('invoices', 'picked_at', 'picked_at TEXT');
  addColumnIfMissing('invoices', 'closed_by', 'closed_by TEXT');
  addColumnIfMissing('invoices', 'closed_at', 'closed_at TEXT');
  addColumnIfMissing('invoices', 'cancelled_by', 'cancelled_by TEXT');
  addColumnIfMissing('invoices', 'cancelled_at', 'cancelled_at TEXT');
  addColumnIfMissing('invoices', 'version', 'version INTEGER NOT NULL DEFAULT 1');
  sqlite.prepare("UPDATE invoices SET workflow_status = 'closed' WHERE workflow_status IS NULL OR workflow_status = ''").run();
  sqlite.prepare("UPDATE invoices SET payment_status = CASE WHEN status = 'completed' THEN 'paid' WHEN status = 'partial' THEN 'partial' ELSE 'unpaid' END WHERE payment_status IS NULL OR payment_status = '' OR payment_status = 'unpaid'").run();
}

if (sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'customers'").get()) {
  addColumnIfMissing('customers', 'tax_code', 'tax_code TEXT');
  addColumnIfMissing('customers', 'company_name', 'company_name TEXT');
  addColumnIfMissing('customers', 'invoice_address', 'invoice_address TEXT');
  addColumnIfMissing('customers', 'shipping_address', 'shipping_address TEXT');
  addColumnIfMissing('customers', 'credit_limit', 'credit_limit REAL NOT NULL DEFAULT 0');
  addColumnIfMissing('customers', 'payment_days', 'payment_days INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('customers', 'allow_debt', 'allow_debt INTEGER NOT NULL DEFAULT 1');
  addColumnIfMissing('customers', 'contact_name', 'contact_name TEXT');
  addColumnIfMissing('customers', 'note', "note TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing('customers', 'active', 'active INTEGER NOT NULL DEFAULT 1');
  for (const [column, definition] of Object.entries({
    source_system: 'source_system TEXT', source_code: 'source_code TEXT', source_branch: 'source_branch TEXT', source_imported_at: 'source_imported_at TEXT', source_raw_data: 'source_raw_data TEXT',
    customer_type_raw: 'customer_type_raw TEXT', delivery_area: 'delivery_area TEXT', ward: 'ward TEXT', birth_date: 'birth_date TEXT', gender: 'gender TEXT', email: 'email TEXT', facebook: 'facebook TEXT', group_name: 'group_name TEXT',
    buyer_name: 'buyer_name TEXT', invoice_province: 'invoice_province TEXT', invoice_ward: 'invoice_ward TEXT', invoice_citizen_id: 'invoice_citizen_id TEXT', invoice_passport_number: 'invoice_passport_number TEXT', invoice_government_id: 'invoice_government_id TEXT', invoice_email: 'invoice_email TEXT', invoice_phone: 'invoice_phone TEXT', bank_name: 'bank_name TEXT', bank_account: 'bank_account TEXT',
    source_created_by: 'source_created_by TEXT', source_created_at: 'source_created_at TEXT', last_transaction_at: 'last_transaction_at TEXT', total_sales: 'total_sales REAL NOT NULL DEFAULT 0', total_sales_after_returns: 'total_sales_after_returns REAL NOT NULL DEFAULT 0', source_status: 'source_status TEXT',
  })) addColumnIfMissing('customers', column, definition);
}

if (sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'suppliers'").get()) {
  for (const [column, definition] of Object.entries({
    email: 'email TEXT', region: 'region TEXT', ward: 'ward TEXT', id_number: 'id_number TEXT', group_name: 'group_name TEXT', company_name: 'company_name TEXT',
    total_purchases: 'total_purchases REAL NOT NULL DEFAULT 0', total_purchases_after_returns: 'total_purchases_after_returns REAL NOT NULL DEFAULT 0', source_system: 'source_system TEXT', source_code: 'source_code TEXT', source_imported_at: 'source_imported_at TEXT', source_raw_data: 'source_raw_data TEXT', source_created_by: 'source_created_by TEXT', source_created_at: 'source_created_at TEXT', source_status: 'source_status TEXT',
  })) addColumnIfMissing('suppliers', column, definition);
}

if (sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'price_lists'").get()) {
  addColumnIfMissing('price_lists', 'markup_percent', 'markup_percent REAL NOT NULL DEFAULT 0');
  addColumnIfMissing('price_lists', 'markup_mode', "markup_mode TEXT NOT NULL DEFAULT 'percent'");
  addColumnIfMissing('price_lists', 'markup_value', 'markup_value REAL NOT NULL DEFAULT 0');
}

if (sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'purchases'").get()) {
  addColumnIfMissing('purchases', 'document_no', "document_no TEXT NOT NULL DEFAULT ''");
}

if (sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'products'").get()) {
  addColumnIfMissing('products', 'tax_rate', "tax_rate REAL NOT NULL DEFAULT 0");
  addColumnIfMissing('products', 'product_type', "product_type TEXT NOT NULL DEFAULT 'standard'");
  addColumnIfMissing('products', 'max_stock_threshold', "max_stock_threshold REAL NOT NULL DEFAULT 0");
  addColumnIfMissing('products', 'attributes', 'attributes TEXT');
  addColumnIfMissing('products', 'attributes_json', 'attributes_json TEXT');
  addColumnIfMissing('products', 'source_system', 'source_system TEXT');
  addColumnIfMissing('products', 'source_code', 'source_code TEXT');
  addColumnIfMissing('products', 'source_related_code', 'source_related_code TEXT');
  addColumnIfMissing('products', 'source_imported_at', 'source_imported_at TEXT');
  sqlite.prepare("UPDATE products SET product_type = 'standard' WHERE product_type IS NULL OR product_type = ''").run();
}

if (sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'product_units'").get()) {
  addColumnIfMissing('product_units', 'sku', 'sku TEXT');
  addColumnIfMissing('product_units', 'purchase_price', 'purchase_price REAL NOT NULL DEFAULT 0');
  addColumnIfMissing('product_units', 'attributes', 'attributes TEXT');
  addColumnIfMissing('product_units', 'source_system', 'source_system TEXT');
  addColumnIfMissing('product_units', 'source_code', 'source_code TEXT');
  addColumnIfMissing('product_units', 'source_related_code', 'source_related_code TEXT');
  addColumnIfMissing('product_units', 'source_imported_at', 'source_imported_at TEXT');
}

if (sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'invoice_items'").get()) {
  addColumnIfMissing('invoice_items', 'tax_rate', "tax_rate REAL NOT NULL DEFAULT 0");
  addColumnIfMissing('invoice_items', 'ordered_quantity', 'ordered_quantity REAL');
  addColumnIfMissing('invoice_items', 'picked_quantity', 'picked_quantity REAL');
  addColumnIfMissing('invoice_items', 'confirmed_quantity', 'confirmed_quantity REAL');
  addColumnIfMissing('invoice_items', 'line_status', "line_status TEXT NOT NULL DEFAULT 'ordered'");
  addColumnIfMissing('invoice_items', 'note', "note TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing('invoice_items', 'unit_name', 'unit_name TEXT');
  addColumnIfMissing('invoice_items', 'unit_factor', 'unit_factor REAL NOT NULL DEFAULT 1');
  addColumnIfMissing('invoice_items', 'base_quantity', 'base_quantity REAL NOT NULL DEFAULT 0');
  addColumnIfMissing('invoice_items', 'price_list_id', 'price_list_id TEXT');
  addColumnIfMissing('invoice_items', 'price_list_name', 'price_list_name TEXT');
  sqlite.prepare("UPDATE invoice_items SET unit_name = (SELECT unit FROM products WHERE products.id = invoice_items.product_id) WHERE unit_name IS NULL").run();
  sqlite.prepare('UPDATE invoice_items SET base_quantity = quantity * unit_factor WHERE base_quantity = 0').run();
}

if (sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'purchases'").get()) {
  addColumnIfMissing('purchases', 'account_id', 'account_id TEXT');
}

if (sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'purchase_items'").get()) {
  addColumnIfMissing('purchase_items', 'unit_factor', 'unit_factor REAL NOT NULL DEFAULT 1');
  addColumnIfMissing('purchase_items', 'base_quantity', 'base_quantity REAL NOT NULL DEFAULT 0');
  addColumnIfMissing('purchase_items', 'is_gift', 'is_gift INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('purchase_items', 'selling_price', 'selling_price REAL NOT NULL DEFAULT 0');
  addColumnIfMissing('purchase_items', 'note', "note TEXT NOT NULL DEFAULT ''");
  sqlite.prepare('UPDATE purchase_items SET base_quantity = quantity * unit_factor WHERE base_quantity = 0').run();
  sqlite.prepare("UPDATE purchase_items SET selling_price = 0 WHERE selling_price IS NULL").run();
}

if (sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'invoices'").get()) {
  addColumnIfMissing('invoices', 'account_id', 'account_id TEXT');
  addColumnIfMissing('invoices', 'previous_debt_amount', 'previous_debt_amount REAL NOT NULL DEFAULT 0');
  addColumnIfMissing('invoices', 'change_amount', 'change_amount REAL NOT NULL DEFAULT 0');
}

if (sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'cashbook_entries'").get()) {
  addColumnIfMissing('cashbook_entries', 'account_id', 'account_id TEXT');
  addColumnIfMissing('cashbook_entries', 'actor_id', 'actor_id TEXT');
  addColumnIfMissing('cashbook_entries', 'actor_name', "actor_name TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing('cashbook_entries', 'counterparty_type', 'counterparty_type TEXT');
  addColumnIfMissing('cashbook_entries', 'counterparty_id', 'counterparty_id TEXT');
  addColumnIfMissing('cashbook_entries', 'counterparty_name', "counterparty_name TEXT NOT NULL DEFAULT ''");
}

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS cashbook_categories (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    created_by TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS cashbook_categories_tenant_type_name_uidx
    ON cashbook_categories (tenant_id, type, name);
  CREATE INDEX IF NOT EXISTS cashbook_categories_tenant_type_active_idx
    ON cashbook_categories (tenant_id, type, active);
`);

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    recipient_user_id TEXT NOT NULL REFERENCES users(id),
    actor_id TEXT NOT NULL REFERENCES users(id),
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    entity_type TEXT,
    entity_id TEXT,
    is_read INTEGER NOT NULL DEFAULT 0,
    read_at TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS notifications_tenant_recipient_created_at_idx
    ON notifications (tenant_id, recipient_user_id, created_at);
  CREATE INDEX IF NOT EXISTS notifications_recipient_unread_idx
    ON notifications (recipient_user_id, is_read);
`);

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
    tenant_id TEXT,
    instance_id TEXT,
    file_path TEXT NOT NULL,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    checksum_sha256 TEXT,
    schema_version INTEGER,
    verified INTEGER NOT NULL DEFAULT 0,
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

  CREATE TABLE IF NOT EXISTS role_profiles (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(tenant_id, code)
  );

  CREATE TABLE IF NOT EXISTS role_profile_permissions (
    id TEXT PRIMARY KEY,
    role_profile_id TEXT NOT NULL REFERENCES role_profiles(id) ON DELETE CASCADE,
    permission_code TEXT NOT NULL REFERENCES permissions(code),
    allowed INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL,
    UNIQUE(role_profile_id, permission_code)
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
    total REAL NOT NULL,
    is_gift INTEGER NOT NULL DEFAULT 0,
    selling_price REAL NOT NULL DEFAULT 0,
    note TEXT NOT NULL DEFAULT ''
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

  CREATE TABLE IF NOT EXISTS cashbook_categories (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    created_by TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS cashbook_categories_tenant_type_name_uidx
    ON cashbook_categories (tenant_id, type, name);
  CREATE INDEX IF NOT EXISTS cashbook_categories_tenant_type_active_idx
    ON cashbook_categories (tenant_id, type, active);

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

  CREATE TABLE IF NOT EXISTS stock_reservations (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    invoice_id TEXT NOT NULL REFERENCES invoices(id),
    product_id TEXT NOT NULL REFERENCES products(id),
    quantity REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'reserved',
    created_at TEXT NOT NULL,
    released_at TEXT
  );

  CREATE TABLE IF NOT EXISTS cash_accounts (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'cash',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    customer_id TEXT REFERENCES customers(id),
    account_id TEXT,
    amount REAL NOT NULL,
    payment_method TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    payment_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'posted',
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS payment_allocations (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    payment_id TEXT NOT NULL REFERENCES payments(id),
    invoice_id TEXT NOT NULL REFERENCES invoices(id),
    amount REAL NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS units (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS price_lists (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    name TEXT NOT NULL,
    customer_type TEXT NOT NULL DEFAULT 'all',
    markup_percent REAL NOT NULL DEFAULT 0,
    markup_mode TEXT NOT NULL DEFAULT 'percent',
    markup_value REAL NOT NULL DEFAULT 0,
    is_default INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS price_list_items (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    price_list_id TEXT NOT NULL REFERENCES price_lists(id),
    product_id TEXT NOT NULL REFERENCES products(id),
    unit_name TEXT NOT NULL,
    unit_factor REAL NOT NULL DEFAULT 1,
    price REAL NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS product_units (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    product_id TEXT NOT NULL REFERENCES products(id),
    sku TEXT,
    name TEXT NOT NULL,
    factor REAL NOT NULL DEFAULT 1,
    barcode TEXT,
    purchase_price REAL NOT NULL DEFAULT 0,
    attributes TEXT,
    source_system TEXT,
    source_code TEXT,
    source_related_code TEXT,
    source_imported_at TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS product_components (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    combo_product_id TEXT NOT NULL REFERENCES products(id),
    component_product_id TEXT NOT NULL REFERENCES products(id),
    quantity REAL NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS product_import_batches (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    source_system TEXT NOT NULL,
    file_name TEXT NOT NULL DEFAULT '',
    source_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'completed',
    total_rows INTEGER NOT NULL DEFAULT 0,
    product_rows INTEGER NOT NULL DEFAULT 0,
    unit_rows INTEGER NOT NULL DEFAULT 0,
    created_count INTEGER NOT NULL DEFAULT 0,
    updated_count INTEGER NOT NULL DEFAULT 0,
    unit_count INTEGER NOT NULL DEFAULT 0,
    combo_count INTEGER NOT NULL DEFAULT 0,
    component_count INTEGER NOT NULL DEFAULT 0,
    combo_with_components INTEGER NOT NULL DEFAULT 0,
    combo_missing_components INTEGER NOT NULL DEFAULT 0,
    component_warning_count INTEGER NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    completed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS product_import_issues (
    id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL REFERENCES product_import_batches(id),
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    row_number INTEGER NOT NULL,
    code TEXT NOT NULL,
    message TEXT NOT NULL,
    sku TEXT NOT NULL DEFAULT '',
    barcode TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS partner_import_batches (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    source_system TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    file_name TEXT NOT NULL DEFAULT '',
    source_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'previewed',
    total_rows INTEGER NOT NULL DEFAULT 0,
    created_count INTEGER NOT NULL DEFAULT 0,
    updated_count INTEGER NOT NULL DEFAULT 0,
    debt_adjusted_count INTEGER NOT NULL DEFAULT 0,
    detail_count INTEGER NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    completed_at TEXT,
    UNIQUE(tenant_id, source_system, entity_type, source_hash)
  );
  CREATE INDEX IF NOT EXISTS partner_import_batches_tenant_created_at_idx ON partner_import_batches(tenant_id, created_at);

  CREATE TABLE IF NOT EXISTS partner_import_issues (
    id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL REFERENCES partner_import_batches(id),
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    row_number INTEGER NOT NULL,
    entity_type TEXT NOT NULL,
    code TEXT NOT NULL,
    message TEXT NOT NULL,
    source_code TEXT NOT NULL DEFAULT '',
    source_name TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS partner_import_issues_batch_row_idx ON partner_import_issues(batch_id, row_number);

  CREATE TABLE IF NOT EXISTS partner_debt_import_rows (
    id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL REFERENCES partner_import_batches(id),
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    entity_type TEXT NOT NULL,
    partner_id TEXT NOT NULL,
    document_no TEXT NOT NULL DEFAULT '',
    occurred_at TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    unit TEXT NOT NULL DEFAULT '',
    quantity REAL,
    unit_price REAL,
    discount REAL,
    vat REAL,
    purchase_price REAL,
    amount REAL NOT NULL DEFAULT 0,
    debit REAL NOT NULL DEFAULT 0,
    credit REAL NOT NULL DEFAULT 0,
    note TEXT NOT NULL DEFAULT '',
    details_json TEXT NOT NULL DEFAULT '[]',
    source_row_number INTEGER NOT NULL DEFAULT 0,
    source_raw_data TEXT NOT NULL DEFAULT '{}',
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS partner_debt_rows_tenant_partner_created_at_idx ON partner_debt_import_rows(tenant_id, partner_id, created_at);
  CREATE INDEX IF NOT EXISTS partner_debt_rows_batch_document_idx ON partner_debt_import_rows(batch_id, document_no);

  CREATE TABLE IF NOT EXISTS purchase_returns (
    id TEXT PRIMARY KEY,
    document_no TEXT NOT NULL DEFAULT '',
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    purchase_id TEXT NOT NULL REFERENCES purchases(id),
    supplier_id TEXT NOT NULL REFERENCES suppliers(id),
    total_amount REAL NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS purchase_return_items (
    id TEXT PRIMARY KEY,
    return_id TEXT NOT NULL REFERENCES purchase_returns(id),
    purchase_item_id TEXT NOT NULL REFERENCES purchase_items(id),
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    unit TEXT NOT NULL,
    quantity REAL NOT NULL,
    unit_factor REAL NOT NULL DEFAULT 1,
    base_quantity REAL NOT NULL DEFAULT 0,
    price REAL NOT NULL,
    total REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS supplier_credit_ledger (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    supplier_id TEXT NOT NULL REFERENCES suppliers(id),
    purchase_return_id TEXT,
    purchase_id TEXT,
    amount REAL NOT NULL,
    type TEXT NOT NULL,
    account_id TEXT,
    note TEXT NOT NULL DEFAULT '',
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sales_returns (
    id TEXT PRIMARY KEY,
    document_no TEXT NOT NULL DEFAULT '',
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    invoice_id TEXT REFERENCES invoices(id),
    customer_id TEXT,
    total_amount REAL NOT NULL,
    debt_reduction REAL NOT NULL DEFAULT 0,
    refund_amount REAL NOT NULL DEFAULT 0,
    refund_account_id TEXT,
    note TEXT NOT NULL DEFAULT '',
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sales_return_items (
    id TEXT PRIMARY KEY,
    return_id TEXT NOT NULL REFERENCES sales_returns(id),
    invoice_item_id TEXT REFERENCES invoice_items(id),
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    unit_name TEXT NOT NULL,
    quantity REAL NOT NULL,
    unit_factor REAL NOT NULL DEFAULT 1,
    base_quantity REAL NOT NULL DEFAULT 0,
    price REAL NOT NULL,
    total REAL NOT NULL
  );
`);

if (sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'product_import_batches'").get()) {
  addColumnIfMissing('product_import_batches', 'component_count', 'component_count INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('product_import_batches', 'combo_with_components', 'combo_with_components INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('product_import_batches', 'combo_missing_components', 'combo_missing_components INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('product_import_batches', 'component_warning_count', 'component_warning_count INTEGER NOT NULL DEFAULT 0');
}

// Returns can be created without an original invoice. Older local databases
// created these columns as NOT NULL, so rebuild both small tables once while
// preserving existing return history.
const salesReturnInfo = sqlite.prepare('PRAGMA table_info(sales_returns)').all() as Array<{ name: string; notnull: number }>;
const salesReturnItemInfo = sqlite.prepare('PRAGMA table_info(sales_return_items)').all() as Array<{ name: string; notnull: number }>;
const salesReturnInvoiceId = salesReturnInfo.find((column) => column.name === 'invoice_id');
const salesReturnItemInvoiceId = salesReturnItemInfo.find((column) => column.name === 'invoice_item_id');
if (salesReturnInvoiceId?.notnull === 1 || salesReturnItemInvoiceId?.notnull === 1) {
  sqlite.pragma('foreign_keys = OFF');
  try {
    sqlite.transaction(() => {
      sqlite.exec(`
        CREATE TABLE sales_returns_migration (
          id TEXT PRIMARY KEY,
          document_no TEXT NOT NULL DEFAULT '',
          tenant_id TEXT NOT NULL REFERENCES tenants(id),
          invoice_id TEXT REFERENCES invoices(id),
          customer_id TEXT,
          total_amount REAL NOT NULL,
          debt_reduction REAL NOT NULL DEFAULT 0,
          refund_amount REAL NOT NULL DEFAULT 0,
          refund_account_id TEXT,
          note TEXT NOT NULL DEFAULT '',
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        INSERT INTO sales_returns_migration
          SELECT id, document_no, tenant_id, invoice_id, customer_id, total_amount, debt_reduction, refund_amount, refund_account_id, note, created_by, created_at
          FROM sales_returns;

        CREATE TABLE sales_return_items_migration (
          id TEXT PRIMARY KEY,
          return_id TEXT NOT NULL REFERENCES sales_returns_migration(id),
          invoice_item_id TEXT REFERENCES invoice_items(id),
          product_id TEXT NOT NULL,
          product_name TEXT NOT NULL,
          unit_name TEXT NOT NULL,
          quantity REAL NOT NULL,
          unit_factor REAL NOT NULL DEFAULT 1,
          base_quantity REAL NOT NULL DEFAULT 0,
          price REAL NOT NULL,
          total REAL NOT NULL
        );
        INSERT INTO sales_return_items_migration
          SELECT id, return_id, invoice_item_id, product_id, product_name, unit_name, quantity, unit_factor, base_quantity, price, total
          FROM sales_return_items;

        DROP TABLE sales_return_items;
        DROP TABLE sales_returns;
        ALTER TABLE sales_returns_migration RENAME TO sales_returns;
        ALTER TABLE sales_return_items_migration RENAME TO sales_return_items;
      `);
    })();
  } finally {
    sqlite.pragma('foreign_keys = ON');
  }
}

// Keep supplier identifiers compact and readable while preserving existing supplier links.
const supplierRows = sqlite.prepare('SELECT id, tenant_id, code FROM suppliers ORDER BY rowid').all() as Array<{ id: string; tenant_id: string; code: string }>;
const supplierCounters = new Map<string, number>();
const supplierUsedCodes = new Map<string, Set<string>>();
for (const supplier of supplierRows) {
  const tenantCodes = supplierUsedCodes.get(supplier.tenant_id) || new Set<string>();
  supplierUsedCodes.set(supplier.tenant_id, tenantCodes);
  const shortMatch = String(supplier.code || '').match(/^NCC(\d{3})$/i);
  if (shortMatch) {
    tenantCodes.add(String(supplier.code).toUpperCase());
    supplierCounters.set(supplier.tenant_id, Math.max(supplierCounters.get(supplier.tenant_id) || 0, Number(shortMatch[1])));
  }
}
for (const supplier of supplierRows) {
  if (/^NCC\d{3}$/i.test(String(supplier.code || ''))) continue;
  const tenantCodes = supplierUsedCodes.get(supplier.tenant_id) || new Set<string>();
  let sequence = (supplierCounters.get(supplier.tenant_id) || 0) + 1;
  let code = `NCC${String(sequence).padStart(3, '0')}`;
  while (tenantCodes.has(code)) {
    sequence += 1;
    code = `NCC${String(sequence).padStart(3, '0')}`;
  }
  sqlite.prepare('UPDATE suppliers SET code = ? WHERE id = ?').run(code, supplier.id);
  tenantCodes.add(code);
  supplierCounters.set(supplier.tenant_id, sequence);
}

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
  ['inventory.manage_pricing', 'inventory', 'manage_pricing', 'Quản lý bảng giá và combo'],
  ['purchases.view', 'purchases', 'view', 'Xem nhập hàng'],
  ['purchases.create', 'purchases', 'create', 'Tạo phiếu nhập'],
  ['purchases.approve', 'purchases', 'approve', 'Xác nhận phiếu nhập'],
  ['purchases.return', 'purchases', 'return', 'Trả hàng nhà cung cấp'],
  ['sales.return', 'sales', 'return', 'Trả hàng khách hàng'],
  ['sales.override_price', 'sales', 'override_price', 'Sửa giá bán tại quầy'],
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
  warehouse: ['inventory.view', 'inventory.create', 'inventory.adjust', 'inventory.view_cost', 'inventory.manage_pricing', 'purchases.view', 'purchases.create', 'purchases.approve', 'purchases.return', 'partners.view'],
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

const controlDb = drizzle(sqlite, { schema });
// The proxy keeps the existing route code intact while selecting a tenant
// database from the request-scoped context on the SaaS branch.
const tenantDatabaseRegistry = new TenantDatabaseRegistry({
  controlSqlite: sqlite,
  controlDb,
  dataDir: DATA_DIR,
});
const tenantAwareDb = tenantDatabaseRegistry.createDbProxy(controlDb);
const tenantAwareSqlite = tenantDatabaseRegistry.createSqliteProxy(sqlite);

export const db = tenantAwareDb;
export const tenantRegistry = tenantDatabaseRegistry;
export { controlDb, tenantAwareSqlite as sqlite, DB_PATH };

