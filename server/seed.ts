import { sqlite } from './db';
import bcrypt from 'bcryptjs';
import { ENABLE_PLATFORM_ADMIN, MIN_PASSWORD_LENGTH, OFFLINE_MODE } from './runtimeConfig';

console.log('🔧 Initializing database...');

// ─── Create Tables ─────────────────────────────────────────
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    legal_name TEXT,
    address TEXT NOT NULL,
    province TEXT,
    district TEXT,
    ward TEXT,
    phone TEXT NOT NULL,
    email TEXT,
    tax_info TEXT,
    logo_url TEXT,
    timezone TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
    currency TEXT NOT NULL DEFAULT 'VND',
    invoice_prefix TEXT NOT NULL DEFAULT 'INV',
    status TEXT NOT NULL DEFAULT 'active',
    trial_start_at TEXT,
    trial_end_at TEXT,
    subscription_status TEXT NOT NULL DEFAULT 'trial',
    subscription_plan TEXT NOT NULL DEFAULT 'yearly',
    subscription_price_monthly REAL NOT NULL DEFAULT 150000,
    package_code TEXT NOT NULL DEFAULT 'starter_1',
    package_name TEXT NOT NULL DEFAULT 'Starter 1',
    max_users INTEGER NOT NULL DEFAULT 1,
    package_price_monthly REAL NOT NULL DEFAULT 150000,
    subscription_start_at TEXT,
    subscription_end_at TEXT,
    settings TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    password TEXT,
    phone TEXT,
    role TEXT NOT NULL,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    status TEXT NOT NULL DEFAULT 'active',
    session_version INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    name TEXT NOT NULL,
    description TEXT
  );

  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    sku TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    unit TEXT NOT NULL,
    purchase_price REAL NOT NULL,
    selling_price REAL NOT NULL,
    stock REAL NOT NULL DEFAULT 0,
    track_stock INTEGER NOT NULL DEFAULT 1,
    low_stock_threshold REAL NOT NULL DEFAULT 10,
    max_stock_threshold REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    barcode TEXT,
    image_url TEXT,
    product_type TEXT NOT NULL DEFAULT 'standard',
    attributes TEXT,
    attributes_json TEXT,
    source_system TEXT,
    source_code TEXT,
    source_related_code TEXT,
    source_imported_at TEXT
  );

  CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL DEFAULT '',
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    address TEXT NOT NULL,
    tax_code TEXT,
    company_name TEXT,
    invoice_address TEXT,
    shipping_address TEXT,
    credit_limit REAL NOT NULL DEFAULT 0,
    payment_days INTEGER NOT NULL DEFAULT 0,
    allow_debt INTEGER NOT NULL DEFAULT 1,
    contact_name TEXT,
    note TEXT NOT NULL DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1,
    total_debt REAL NOT NULL DEFAULT 0,
    type TEXT NOT NULL DEFAULT 'retail'
  );

  CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    customer_id TEXT,
    created_by TEXT NOT NULL,
    total_amount REAL NOT NULL,
    discount REAL NOT NULL DEFAULT 0,
    tax_amount REAL NOT NULL DEFAULT 0,
    final_amount REAL NOT NULL,
    paid_amount REAL NOT NULL,
    debt_amount REAL NOT NULL DEFAULT 0,
    previous_debt_amount REAL NOT NULL DEFAULT 0,
    change_amount REAL NOT NULL DEFAULT 0,
    payment_method TEXT NOT NULL,
    account_id TEXT,
    status TEXT NOT NULL,
    document_no TEXT NOT NULL DEFAULT '',
    workflow_status TEXT NOT NULL DEFAULT 'closed',
    payment_status TEXT NOT NULL DEFAULT 'unpaid',
    checked_by TEXT,
    checked_at TEXT,
    picked_by TEXT,
    picked_at TEXT,
    closed_by TEXT,
    closed_at TEXT,
    cancelled_by TEXT,
    cancelled_at TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS invoice_items (
    id TEXT PRIMARY KEY,
    invoice_id TEXT NOT NULL REFERENCES invoices(id),
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    quantity REAL NOT NULL,
    price REAL NOT NULL,
    total REAL NOT NULL,
    ordered_quantity REAL,
    picked_quantity REAL,
    confirmed_quantity REAL,
    line_status TEXT NOT NULL DEFAULT 'ordered',
    note TEXT NOT NULL DEFAULT '',
    unit_name TEXT,
    unit_factor REAL NOT NULL DEFAULT 1,
    base_quantity REAL NOT NULL DEFAULT 0,
    price_list_id TEXT,
    price_list_name TEXT
  );

  CREATE TABLE IF NOT EXISTS debt_ledger (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    customer_id TEXT NOT NULL REFERENCES customers(id),
    invoice_id TEXT,
    amount REAL NOT NULL,
    type TEXT NOT NULL,
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

  CREATE TABLE IF NOT EXISTS admin_users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    status TEXT NOT NULL DEFAULT 'active',
    session_version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
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
`);

const existingStarterPackage = sqlite.prepare('SELECT id FROM packages WHERE code = ?').get('starter_1');
const defaultMaxUsers = OFFLINE_MODE ? 25 : 1;
if (!existingStarterPackage) {
  const now = new Date().toISOString();
  sqlite.prepare(`
    INSERT INTO packages (id, code, name, max_users, price_monthly, is_default, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run('pkg-starter-1', 'starter_1', 'Starter 1', defaultMaxUsers, 150000, 1, 'active', now);
} else if (OFFLINE_MODE) {
  sqlite.prepare("UPDATE packages SET max_users = ? WHERE code = 'starter_1' AND max_users < ?").run(defaultMaxUsers, defaultMaxUsers);
}

// ─── Optional platform admin account ──────────────────────
// Offline customer builds have no technical-admin login. If this script is
// explicitly used for the hosted control plane, credentials must be supplied
// by the operator; never create or print a known password.
if (ENABLE_PLATFORM_ADMIN) {
  const bootstrapAdminEmail = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim();
  const bootstrapAdminPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD || '';
  const bootstrapAdminName = process.env.ADMIN_BOOTSTRAP_NAME?.trim() || 'System Admin';
  const bootstrapAdminRole = process.env.ADMIN_BOOTSTRAP_ROLE?.trim() || 'super_admin';
  if (!bootstrapAdminEmail || bootstrapAdminPassword.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`ADMIN_BOOTSTRAP_EMAIL và ADMIN_BOOTSTRAP_PASSWORD (ít nhất ${MIN_PASSWORD_LENGTH} ký tự) là bắt buộc khi ENABLE_PLATFORM_ADMIN=true.`);
  }
  const existingAdmin = sqlite.prepare('SELECT id FROM admin_users WHERE email = ?').get(bootstrapAdminEmail);
  if (!existingAdmin) {
    const now = new Date().toISOString();
    const adminPassword = bcrypt.hashSync(bootstrapAdminPassword, 12);
    sqlite.prepare(`
      INSERT INTO admin_users (id, name, email, password, role, status, session_version, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('admin-001', bootstrapAdminName, bootstrapAdminEmail, adminPassword, bootstrapAdminRole, 'active', 1, now);
    console.log(`👤 Platform admin account created for ${bootstrapAdminEmail}.`);
  }
}

// ─── Optional development demo tenant ──────────────────────
// Customer installations must never be populated with demo data. Use
// `npm run seed` locally or `SEED_DEMO=true` explicitly in a development DB.
const seedDemo = process.argv.includes('--demo') || process.env.SEED_DEMO === 'true';
if (!seedDemo) {
  console.log('✅ Database schema initialized. Demo data was not requested.');
  process.exit(0);
}

const existingTenant = sqlite.prepare('SELECT id FROM tenants WHERE id = ?').get('tenant-demo');
if (!existingTenant) {
  const now = new Date().toISOString();
  const demoPassword = process.env.SEED_DEMO_PASSWORD || '';
  if (demoPassword.length < MIN_PASSWORD_LENGTH) throw new Error(`SEED_DEMO_PASSWORD phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự.`);
  const ownerPassword = bcrypt.hashSync(demoPassword, 12);
  const tenantSettings = JSON.stringify({
    lowStockThresholdDefault: 10,
    enabledPaymentMethods: ['cash', 'transfer', 'debt'],
    debtPolicy: {
      allowDebt: true,
      maxDebtAmount: 50000000,
      maxDebtDays: 30,
    },
    workingHours: {
      open: '07:00',
      close: '18:00',
    },
    defaultLanguage: 'vi',
  });

  sqlite.prepare(`
    INSERT INTO tenants (id, name, legal_name, address, phone, email, timezone, currency, invoice_prefix, status, trial_start_at, trial_end_at, subscription_status, subscription_plan, subscription_price_monthly, package_code, package_name, max_users, package_price_monthly, settings, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'tenant-demo',
    'HKDPlus Demo',
    'Hộ kinh doanh demo',
    'Quận 1, Thành phố Hồ Chí Minh',
    '0901234567',
    'owner@hkdplus.local',
    'Asia/Ho_Chi_Minh',
    'VND',
    'HKD',
    'active',
    null,
    null,
    'active',
    'yearly',
    150000,
    'starter_1',
    'HKDPlus Local',
    defaultMaxUsers,
    150000,
    tenantSettings,
    now,
  );

  sqlite.prepare(`
    INSERT INTO subscriptions (id, tenant_id, plan, price_monthly, status, note, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('sub-tenant-demo', 'tenant-demo', 'yearly', 150000, 'pending_review', 'Waiting for admin review', now);

  sqlite.prepare(`
    INSERT INTO users (id, name, email, password, phone, role, tenant_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run('user-owner-demo', 'Chủ hộ demo', 'owner@hkdplus.local', ownerPassword, '0901234567', 'owner', 'tenant-demo', 'active');

  const categories = [
    ['cat-retail', 'Bán lẻ', 'Nhóm hàng bán lẻ phổ biến'],
    ['cat-service', 'Dịch vụ', 'Dịch vụ và gói bảo trì'],
    ['cat-accessory', 'Phụ kiện', 'Phụ kiện và vật tư tiêu hao'],
  ];
  for (const [id, name, description] of categories) {
    sqlite.prepare('INSERT INTO categories (id, tenant_id, name, description) VALUES (?, ?, ?, ?)')
      .run(id, 'tenant-demo', name, description);
  }

  const products = [
    ['p1', 'SKU001', 'Gói phần mềm POS Basic', 'Dịch vụ', 'gói', 800000, 950000, 50, 10],
    ['p2', 'SKU002', 'Máy quét mã vạch', 'Phụ kiện', 'chiếc', 120000, 150000, 5, 10],
    ['p3', 'SKU003', 'Tem nhãn in mã vạch', 'Bán lẻ', 'cuộn', 50000, 75000, 100, 20],
    ['p4', 'SKU004', 'Gói triển khai tại cửa hàng', 'Dịch vụ', 'gói', 200000, 280000, 2, 5],
  ];
  for (const product of products) {
    sqlite.prepare(`
      INSERT INTO products (id, tenant_id, sku, name, category, unit, purchase_price, selling_price, stock, track_stock, low_stock_threshold, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(product[0], 'tenant-demo', product[1], product[2], product[3], product[4], product[5], product[6], product[7], 1, product[8], 'active');
  }

  const customers = [
    ['c1', 'KH000001', 'Khách lẻ tại quầy', '0911222333', 'Quận 1, TP.HCM', 0, 'retail'],
    ['c2', 'KH000002', 'Công ty Minh Anh', '0988777666', 'Quận Bình Thạnh, TP.HCM', 4500000, 'loyal'],
    ['c3', 'KH000003', 'Đối tác An Phát', '0977111222', 'Thành phố Thủ Đức, TP.HCM', 1200000, 'loyal'],
  ];
  for (const customer of customers) {
    sqlite.prepare(`
      INSERT INTO customers (id, code, tenant_id, name, phone, address, total_debt, type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(customer[0], customer[1], 'tenant-demo', customer[2], customer[3], customer[4], customer[5], customer[6]);
  }

  console.log('🏪 Demo tenant account created: owner@hkdplus.local');
} else {
  console.log('🏪 Demo tenant already exists, skipping.');
}

// Keep demo data domain-neutral when reseeding an existing local database.
sqlite.prepare(`
  UPDATE tenants
  SET name = ?, legal_name = ?, address = ?, status = 'active', subscription_status = 'active'
  WHERE id = ?
`).run('HKDPlus Demo', 'Hộ kinh doanh demo', 'Quận 1, Thành phố Hồ Chí Minh', 'tenant-demo');

const neutralCategories = [
  ['Bán lẻ', 'Nhóm hàng bán lẻ phổ biến', 'cat-fertilizer'],
  ['Dịch vụ', 'Dịch vụ và gói bảo trì', 'cat-pesticide'],
  ['Phụ kiện', 'Phụ kiện và vật tư tiêu hao', 'cat-seed'],
];
for (const [name, description, id] of neutralCategories) {
  sqlite.prepare('UPDATE categories SET name = ?, description = ? WHERE id = ?')
    .run(name, description, id);
}

const neutralProducts = [
  ['SKU001', 'Gói phần mềm POS Basic', 'Dịch vụ', 'gói', 'p1'],
  ['SKU002', 'Máy quét mã vạch', 'Phụ kiện', 'chiếc', 'p2'],
  ['SKU003', 'Tem nhãn in mã vạch', 'Bán lẻ', 'cuộn', 'p3'],
  ['SKU004', 'Gói triển khai tại cửa hàng', 'Dịch vụ', 'gói', 'p4'],
];
for (const [sku, name, category, unit, id] of neutralProducts) {
  sqlite.prepare('UPDATE products SET sku = ?, name = ?, category = ?, unit = ? WHERE id = ?')
    .run(sku, name, category, unit, id);
}

const neutralCustomers = [
  ['Khách lẻ tại quầy', 'Quận 1, TP.HCM', 'c1'],
  ['Công ty Minh Anh', 'Quận Bình Thạnh, TP.HCM', 'c2'],
  ['Đối tác An Phát', 'Thành phố Thủ Đức, TP.HCM', 'c3'],
];
for (const [name, address, id] of neutralCustomers) {
  sqlite.prepare('UPDATE customers SET name = ?, address = ? WHERE id = ?')
    .run(name, address, id);
}

console.log('✅ Database initialized — all tables ready.');
console.log('   Tables: tenants, users, categories, products, customers, invoices, invoice_items, debt_ledger, admin_users');

process.exit(0);
