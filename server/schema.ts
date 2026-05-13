import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

// ─── Tenants ───────────────────────────────────────────────
export const tenants = sqliteTable('tenants', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  legalName: text('legal_name'),
  address: text('address').notNull(),
  province: text('province'),
  district: text('district'),
  ward: text('ward'),
  phone: text('phone').notNull(),
  email: text('email'),
  taxInfo: text('tax_info'),
  logoUrl: text('logo_url'),
  timezone: text('timezone').notNull().default('Asia/Ho_Chi_Minh'),
  currency: text('currency').notNull().default('VND'),
  invoicePrefix: text('invoice_prefix').notNull().default('INV'),
  status: text('status', { enum: ['active', 'suspended', 'trial', 'onboarding', 'pending_setup'] }).notNull().default('active'),
  trialStartAt: text('trial_start_at'),
  trialEndAt: text('trial_end_at'),
  subscriptionStatus: text('subscription_status', { enum: ['trial', 'active', 'expired', 'cancelled', 'pending_review'] }).notNull().default('trial'),
  subscriptionPlan: text('subscription_plan', { enum: ['monthly', 'yearly'] }).notNull().default('yearly'),
  subscriptionPriceMonthly: real('subscription_price_monthly').notNull().default(150000),
  packageCode: text('package_code').notNull().default('starter_1'),
  packageName: text('package_name').notNull().default('Starter 1'),
  maxUsers: integer('max_users').notNull().default(1),
  packagePriceMonthly: real('package_price_monthly').notNull().default(150000),
  subscriptionStartAt: text('subscription_start_at'),
  subscriptionEndAt: text('subscription_end_at'),
  settings: text('settings'), // JSON string for TenantSettings
  createdAt: text('created_at').notNull(),
});

// ─── Users ─────────────────────────────────────────────────
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  password: text('password'), // Optional for now if we want to allow social login later, but required for email/pass
  phone: text('phone'),
  role: text('role', { enum: ['owner', 'manager', 'cashier', 'warehouse', 'accountant'] }).notNull(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  status: text('status', { enum: ['active', 'inactive'] }).notNull().default('active'),
});

// ─── Categories ────────────────────────────────────────────
export const categories = sqliteTable('categories', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  name: text('name').notNull(),
  description: text('description'),
});

// ─── Products ──────────────────────────────────────────────
export const products = sqliteTable('products', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  sku: text('sku').notNull(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  unit: text('unit').notNull(),
  purchasePrice: real('purchase_price').notNull(),
  sellingPrice: real('selling_price').notNull(),
  stock: real('stock').notNull().default(0),
  trackStock: integer('track_stock', { mode: 'boolean' }).notNull().default(true),
  lowStockThreshold: real('low_stock_threshold').notNull().default(10),
  status: text('status', { enum: ['active', 'inactive'] }).notNull().default('active'),
  barcode: text('barcode'),
  imageUrl: text('image_url'),
});

// ─── Customers ─────────────────────────────────────────────
export const customers = sqliteTable('customers', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  createdBy: text('created_by'),
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  address: text('address').notNull(),
  totalDebt: real('total_debt').notNull().default(0),
  type: text('type', { enum: ['retail', 'loyal'] }).notNull().default('retail'),
});

// ─── Invoices ──────────────────────────────────────────────
export const invoices = sqliteTable('invoices', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  customerId: text('customer_id'),
  createdBy: text('created_by').notNull(),
  totalAmount: real('total_amount').notNull(),
  discount: real('discount').notNull().default(0),
  finalAmount: real('final_amount').notNull(),
  paidAmount: real('paid_amount').notNull(),
  debtAmount: real('debt_amount').notNull().default(0),
  paymentMethod: text('payment_method', { enum: ['cash', 'transfer', 'debt'] }).notNull(),
  status: text('status', { enum: ['completed', 'partial', 'unpaid'] }).notNull(),
  createdAt: text('created_at').notNull(),
});

// ─── Invoice Items ─────────────────────────────────────────
export const invoiceItems = sqliteTable('invoice_items', {
  id: text('id').primaryKey(),
  invoiceId: text('invoice_id').notNull().references(() => invoices.id),
  productId: text('product_id').notNull(),
  productName: text('product_name').notNull(),
  quantity: real('quantity').notNull(),
  price: real('price').notNull(),
  total: real('total').notNull(),
});

// ─── Debt Ledger ───────────────────────────────────────────
export const debtLedger = sqliteTable('debt_ledger', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  customerId: text('customer_id').notNull().references(() => customers.id),
  invoiceId: text('invoice_id'),
  amount: real('amount').notNull(),
  type: text('type', { enum: ['increase', 'decrease'] }).notNull(),
  note: text('note').notNull().default(''),
  createdAt: text('created_at').notNull(),
  createdBy: text('created_by').notNull(),
});

// ─── Admin Users (Super Admins) ────────────────────────────
export const adminUsers = sqliteTable('admin_users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  password: text('password').notNull(),
  role: text('role', { enum: ['super_admin', 'admin', 'support'] }).notNull().default('admin'),
  status: text('status', { enum: ['active', 'inactive'] }).notNull().default('active'),
  createdAt: text('created_at').notNull(),
});

export const packages = sqliteTable('packages', {
  id: text('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  maxUsers: integer('max_users').notNull(),
  priceMonthly: real('price_monthly').notNull(),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  status: text('status', { enum: ['active', 'inactive'] }).notNull().default('active'),
  createdAt: text('created_at').notNull(),
});

export const subscriptions = sqliteTable('subscriptions', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  plan: text('plan', { enum: ['monthly', 'yearly'] }).notNull().default('yearly'),
  priceMonthly: real('price_monthly').notNull().default(150000),
  status: text('status', { enum: ['pending_review', 'active', 'expired', 'cancelled'] }).notNull().default('pending_review'),
  note: text('note'),
  startAt: text('start_at'),
  endAt: text('end_at'),
  reviewedBy: text('reviewed_by'),
  reviewedAt: text('reviewed_at'),
  createdAt: text('created_at').notNull(),
});

export const auditLogs = sqliteTable('audit_logs', {
  id: text('id').primaryKey(),
  actorType: text('actor_type', { enum: ['admin', 'tenant_user'] }).notNull().default('admin'),
  actorId: text('actor_id').notNull(),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  tenantId: text('tenant_id'),
  meta: text('meta'),
  createdAt: text('created_at').notNull(),
});
