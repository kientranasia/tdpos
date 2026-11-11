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
  databaseEngine: text('database_engine').notNull().default('shared_sqlite'),
  databaseKey: text('database_key').notNull().default(''),
  databaseStatus: text('database_status').notNull().default('shared'),
  databaseProvisionedAt: text('database_provisioned_at'),
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
  sessionVersion: integer('session_version').notNull().default(1),
});

// ─── Permissions ───────────────────────────────────────────
export const permissions = sqliteTable('permissions', {
  id: text('id').primaryKey(),
  code: text('code').notNull().unique(),
  module: text('module').notNull(),
  action: text('action').notNull(),
  label: text('label').notNull(),
});

export const rolePermissions = sqliteTable('role_permissions', {
  id: text('id').primaryKey(),
  role: text('role').notNull(),
  permissionCode: text('permission_code').notNull().references(() => permissions.code),
  allowed: integer('allowed', { mode: 'boolean' }).notNull().default(true),
});

export const userPermissions = sqliteTable('user_permissions', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  userId: text('user_id').notNull().references(() => users.id),
  permissionCode: text('permission_code').notNull().references(() => permissions.code),
  allowed: integer('allowed', { mode: 'boolean' }).notNull().default(true),
  updatedAt: text('updated_at').notNull(),
});

export const roleProfiles = sqliteTable('role_profiles', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  code: text('code').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const roleProfilePermissions = sqliteTable('role_profile_permissions', {
  id: text('id').primaryKey(),
  roleProfileId: text('role_profile_id').notNull().references(() => roleProfiles.id),
  permissionCode: text('permission_code').notNull().references(() => permissions.code),
  allowed: integer('allowed', { mode: 'boolean' }).notNull().default(true),
  updatedAt: text('updated_at').notNull(),
});

export const licenseInstances = sqliteTable('license_instances', {
  id: text('id').primaryKey(),
  instanceId: text('instance_id').notNull().unique(),
  licenseCode: text('license_code').notNull(),
  customerName: text('customer_name').notNull().default(''),
  machineHash: text('machine_hash').notNull(),
  issuedAt: text('issued_at'),
  expiresAt: text('expires_at'),
  status: text('status', { enum: ['active', 'expired', 'revoked', 'unlicensed'] }).notNull().default('unlicensed'),
  payload: text('payload'),
  lastValidatedAt: text('last_validated_at'),
  createdAt: text('created_at').notNull(),
});

export const backupLogs = sqliteTable('backup_logs', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').references(() => tenants.id),
  instanceId: text('instance_id'),
  filePath: text('file_path').notNull(),
  sizeBytes: integer('size_bytes').notNull().default(0),
  checksumSha256: text('checksum_sha256'),
  schemaVersion: integer('schema_version'),
  verified: integer('verified', { mode: 'boolean' }).notNull().default(false),
  createdBy: text('created_by'),
  createdAt: text('created_at').notNull(),
});

export const taxProfiles = sqliteTable('tax_profiles', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  name: text('name').notNull().default('Mặc định'),
  taxMethod: text('tax_method').notNull().default('Chưa cấu hình'),
  defaultTaxRate: real('default_tax_rate').notNull().default(0),
  taxCode: text('tax_code'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull(),
});

export const documentSequences = sqliteTable('document_sequences', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  documentType: text('document_type').notNull(),
  prefix: text('prefix').notNull(),
  nextNumber: integer('next_number').notNull().default(1),
  updatedAt: text('updated_at').notNull(),
});

// ─── Categories ────────────────────────────────────────────
export const categories = sqliteTable('categories', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  name: text('name').notNull(),
  description: text('description'),
});

export const units = sqliteTable('units', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  name: text('name').notNull(),
  createdAt: text('created_at').notNull(),
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
  taxRate: real('tax_rate').notNull().default(0),
  stock: real('stock').notNull().default(0),
  trackStock: integer('track_stock', { mode: 'boolean' }).notNull().default(true),
  lowStockThreshold: real('low_stock_threshold').notNull().default(10),
  maxStockThreshold: real('max_stock_threshold').notNull().default(0),
  status: text('status', { enum: ['active', 'inactive'] }).notNull().default('active'),
  barcode: text('barcode'),
  imageUrl: text('image_url'),
  productType: text('product_type', { enum: ['standard', 'combo'] }).notNull().default('standard'),
  attributes: text('attributes'),
  attributesJson: text('attributes_json'),
  sourceSystem: text('source_system'),
  sourceCode: text('source_code'),
  sourceRelatedCode: text('source_related_code'),
  sourceImportedAt: text('source_imported_at'),
});

export const priceLists = sqliteTable('price_lists', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  name: text('name').notNull(),
  // Keeps the legacy retail/loyal mappings while allowing tenants to define
  // named price groups such as agency, wholesale, or healthcare.
  customerType: text('customer_type').notNull().default('all'),
  // Optional percentage used to suggest prices relative to the default list.
  // A product can still override the suggested amount per unit/variant.
  markupPercent: real('markup_percent').notNull().default(0),
  // Newer price lists can also add a fixed amount to the base price.
  markupMode: text('markup_mode', { enum: ['percent', 'amount'] }).notNull().default('percent'),
  markupValue: real('markup_value').notNull().default(0),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull(),
});

export const priceListItems = sqliteTable('price_list_items', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  priceListId: text('price_list_id').notNull().references(() => priceLists.id),
  productId: text('product_id').notNull().references(() => products.id),
  unitName: text('unit_name').notNull(),
  unitFactor: real('unit_factor').notNull().default(1),
  price: real('price').notNull(),
  createdAt: text('created_at').notNull(),
});

export const productUnits = sqliteTable('product_units', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  productId: text('product_id').notNull().references(() => products.id),
  sku: text('sku'),
  name: text('name').notNull(),
  factor: real('factor').notNull().default(1),
  barcode: text('barcode'),
  purchasePrice: real('purchase_price').notNull().default(0),
  attributes: text('attributes'),
  sourceSystem: text('source_system'),
  sourceCode: text('source_code'),
  sourceRelatedCode: text('source_related_code'),
  sourceImportedAt: text('source_imported_at'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull(),
});

export const productComponents = sqliteTable('product_components', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  comboProductId: text('combo_product_id').notNull().references(() => products.id),
  componentProductId: text('component_product_id').notNull().references(() => products.id),
  quantity: real('quantity').notNull(),
  createdAt: text('created_at').notNull(),
});

export const productImportBatches = sqliteTable('product_import_batches', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  sourceSystem: text('source_system').notNull(),
  fileName: text('file_name').notNull().default(''),
  sourceHash: text('source_hash').notNull(),
  status: text('status').notNull().default('completed'),
  totalRows: integer('total_rows').notNull().default(0),
  productRows: integer('product_rows').notNull().default(0),
  unitRows: integer('unit_rows').notNull().default(0),
  createdCount: integer('created_count').notNull().default(0),
  updatedCount: integer('updated_count').notNull().default(0),
  unitCount: integer('unit_count').notNull().default(0),
  comboCount: integer('combo_count').notNull().default(0),
  componentCount: integer('component_count').notNull().default(0),
  comboWithComponents: integer('combo_with_components').notNull().default(0),
  comboMissingComponents: integer('combo_missing_components').notNull().default(0),
  componentWarningCount: integer('component_warning_count').notNull().default(0),
  errorCount: integer('error_count').notNull().default(0),
  createdBy: text('created_by').notNull(),
  createdAt: text('created_at').notNull(),
  completedAt: text('completed_at'),
});

export const productImportIssues = sqliteTable('product_import_issues', {
  id: text('id').primaryKey(),
  batchId: text('batch_id').notNull().references(() => productImportBatches.id),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  rowNumber: integer('row_number').notNull(),
  code: text('code').notNull(),
  message: text('message').notNull(),
  sku: text('sku').notNull().default(''),
  barcode: text('barcode').notNull().default(''),
  createdAt: text('created_at').notNull(),
});

// ─── Customers ─────────────────────────────────────────────
export const customers = sqliteTable('customers', {
  id: text('id').primaryKey(),
  code: text('code').notNull().default(''),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  createdBy: text('created_by'),
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  address: text('address').notNull(),
  taxCode: text('tax_code'),
  companyName: text('company_name'),
  invoiceAddress: text('invoice_address'),
  shippingAddress: text('shipping_address'),
  creditLimit: real('credit_limit').notNull().default(0),
  paymentDays: integer('payment_days').notNull().default(0),
  allowDebt: integer('allow_debt', { mode: 'boolean' }).notNull().default(true),
  contactName: text('contact_name'),
  note: text('note').notNull().default(''),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  totalDebt: real('total_debt').notNull().default(0),
  type: text('type', { enum: ['retail', 'loyal'] }).notNull().default('retail'),
  tags: text('tags').notNull().default('[]'),
});

// ─── Suppliers ─────────────────────────────────────────────
export const suppliers = sqliteTable('suppliers', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  code: text('code').notNull(),
  name: text('name').notNull(),
  phone: text('phone').notNull().default(''),
  taxCode: text('tax_code'),
  address: text('address').notNull().default(''),
  currentPayable: real('current_payable').notNull().default(0),
  note: text('note').notNull().default(''),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
});

// ─── Purchases ─────────────────────────────────────────────
export const purchases = sqliteTable('purchases', {
  id: text('id').primaryKey(),
  documentNo: text('document_no').notNull().default(''),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  supplierId: text('supplier_id').notNull().references(() => suppliers.id),
  createdBy: text('created_by').notNull(),
  totalAmount: real('total_amount').notNull(),
  taxAmount: real('tax_amount').notNull().default(0),
  finalAmount: real('final_amount').notNull(),
  paidAmount: real('paid_amount').notNull().default(0),
  payableAmount: real('payable_amount').notNull().default(0),
  paymentMethod: text('payment_method', { enum: ['cash', 'transfer', 'payable'] }).notNull(),
  accountId: text('account_id'),
  status: text('status', { enum: ['confirmed', 'partial', 'unpaid'] }).notNull(),
  note: text('note').notNull().default(''),
  createdAt: text('created_at').notNull(),
});

export const purchaseItems = sqliteTable('purchase_items', {
  id: text('id').primaryKey(),
  purchaseId: text('purchase_id').notNull().references(() => purchases.id),
  productId: text('product_id').notNull(),
  productName: text('product_name').notNull(),
  unit: text('unit').notNull(),
  quantity: real('quantity').notNull(),
  price: real('price').notNull(),
  taxRate: real('tax_rate').notNull().default(0),
  total: real('total').notNull(),
  unitFactor: real('unit_factor').notNull().default(1),
  baseQuantity: real('base_quantity').notNull().default(0),
  isGift: integer('is_gift', { mode: 'boolean' }).notNull().default(false),
  sellingPrice: real('selling_price').notNull().default(0),
  note: text('note').notNull().default(''),
});

export const purchaseReturns = sqliteTable('purchase_returns', {
  id: text('id').primaryKey(),
  documentNo: text('document_no').notNull().default(''),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  purchaseId: text('purchase_id').notNull().references(() => purchases.id),
  supplierId: text('supplier_id').notNull().references(() => suppliers.id),
  totalAmount: real('total_amount').notNull(),
  note: text('note').notNull().default(''),
  createdBy: text('created_by').notNull(),
  createdAt: text('created_at').notNull(),
});

export const purchaseReturnItems = sqliteTable('purchase_return_items', {
  id: text('id').primaryKey(),
  returnId: text('return_id').notNull().references(() => purchaseReturns.id),
  purchaseItemId: text('purchase_item_id').notNull().references(() => purchaseItems.id),
  productId: text('product_id').notNull(),
  productName: text('product_name').notNull(),
  unit: text('unit').notNull(),
  quantity: real('quantity').notNull(),
  unitFactor: real('unit_factor').notNull().default(1),
  baseQuantity: real('base_quantity').notNull().default(0),
  price: real('price').notNull(),
  total: real('total').notNull(),
});

export const supplierCreditLedger = sqliteTable('supplier_credit_ledger', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  supplierId: text('supplier_id').notNull().references(() => suppliers.id),
  purchaseReturnId: text('purchase_return_id'),
  purchaseId: text('purchase_id'),
  amount: real('amount').notNull(),
  type: text('type', { enum: ['increase', 'decrease'] }).notNull(),
  accountId: text('account_id'),
  note: text('note').notNull().default(''),
  createdBy: text('created_by').notNull(),
  createdAt: text('created_at').notNull(),
});

export const payableLedger = sqliteTable('payable_ledger', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  supplierId: text('supplier_id').notNull().references(() => suppliers.id),
  purchaseId: text('purchase_id'),
  amount: real('amount').notNull(),
  type: text('type', { enum: ['increase', 'decrease'] }).notNull(),
  note: text('note').notNull().default(''),
  createdAt: text('created_at').notNull(),
  createdBy: text('created_by').notNull(),
});

// ─── Invoices ──────────────────────────────────────────────
export const invoices = sqliteTable('invoices', {
  id: text('id').primaryKey(),
  documentNo: text('document_no').notNull().default(''),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  customerId: text('customer_id'),
  createdBy: text('created_by').notNull(),
  totalAmount: real('total_amount').notNull(),
  discount: real('discount').notNull().default(0),
  taxAmount: real('tax_amount').notNull().default(0),
  finalAmount: real('final_amount').notNull(),
  paidAmount: real('paid_amount').notNull(),
  debtAmount: real('debt_amount').notNull().default(0),
  previousDebtAmount: real('previous_debt_amount').notNull().default(0),
  changeAmount: real('change_amount').notNull().default(0),
  paymentMethod: text('payment_method', { enum: ['cash', 'transfer', 'wallet', 'debt'] }).notNull(),
  accountId: text('account_id'),
  status: text('status', { enum: ['completed', 'partial', 'unpaid'] }).notNull(),
  workflowStatus: text('workflow_status', { enum: ['draft', 'checked', 'picking', 'ready_to_close', 'closed', 'cancelled'] }).notNull().default('closed'),
  paymentStatus: text('payment_status', { enum: ['unpaid', 'partial', 'paid'] }).notNull().default('unpaid'),
  checkedBy: text('checked_by'),
  checkedAt: text('checked_at'),
  pickedBy: text('picked_by'),
  pickedAt: text('picked_at'),
  closedBy: text('closed_by'),
  closedAt: text('closed_at'),
  cancelledBy: text('cancelled_by'),
  cancelledAt: text('cancelled_at'),
  version: integer('version').notNull().default(1),
  note: text('note').notNull().default(''),
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
  taxRate: real('tax_rate').notNull().default(0),
  total: real('total').notNull(),
  orderedQuantity: real('ordered_quantity'),
  pickedQuantity: real('picked_quantity'),
  confirmedQuantity: real('confirmed_quantity'),
  lineStatus: text('line_status').notNull().default('ordered'),
  note: text('note').notNull().default(''),
  unitName: text('unit_name'),
  unitFactor: real('unit_factor').notNull().default(1),
  baseQuantity: real('base_quantity').notNull().default(0),
  priceListId: text('price_list_id'),
  priceListName: text('price_list_name'),
});

export const salesReturns = sqliteTable('sales_returns', {
  id: text('id').primaryKey(),
  documentNo: text('document_no').notNull().default(''),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  invoiceId: text('invoice_id').references(() => invoices.id),
  customerId: text('customer_id'),
  totalAmount: real('total_amount').notNull(),
  debtReduction: real('debt_reduction').notNull().default(0),
  refundAmount: real('refund_amount').notNull().default(0),
  refundAccountId: text('refund_account_id'),
  note: text('note').notNull().default(''),
  createdBy: text('created_by').notNull(),
  createdAt: text('created_at').notNull(),
});

export const salesReturnItems = sqliteTable('sales_return_items', {
  id: text('id').primaryKey(),
  returnId: text('return_id').notNull().references(() => salesReturns.id),
  invoiceItemId: text('invoice_item_id').references(() => invoiceItems.id),
  productId: text('product_id').notNull(),
  productName: text('product_name').notNull(),
  unitName: text('unit_name').notNull(),
  quantity: real('quantity').notNull(),
  unitFactor: real('unit_factor').notNull().default(1),
  baseQuantity: real('base_quantity').notNull().default(0),
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

export const cashbookEntries = sqliteTable('cashbook_entries', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  type: text('type', { enum: ['income', 'expense'] }).notNull(),
  amount: real('amount').notNull(),
  category: text('category').notNull().default('Khác'),
  note: text('note').notNull().default(''),
  referenceId: text('reference_id'),
  accountId: text('account_id'),
  createdAt: text('created_at').notNull(),
  createdBy: text('created_by').notNull(),
});

export const stockReservations = sqliteTable('stock_reservations', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  invoiceId: text('invoice_id').notNull().references(() => invoices.id),
  productId: text('product_id').notNull().references(() => products.id),
  quantity: real('quantity').notNull(),
  status: text('status').notNull().default('reserved'),
  createdAt: text('created_at').notNull(),
  releasedAt: text('released_at'),
});

export const cashAccounts = sqliteTable('cash_accounts', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  name: text('name').notNull(),
  type: text('type').notNull().default('cash'),
  active: integer('active').notNull().default(1),
  createdAt: text('created_at').notNull(),
});

export const payments = sqliteTable('payments', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  customerId: text('customer_id').references(() => customers.id),
  accountId: text('account_id'),
  amount: real('amount').notNull(),
  paymentMethod: text('payment_method').notNull(),
  note: text('note').notNull().default(''),
  paymentDate: text('payment_date').notNull(),
  status: text('status').notNull().default('posted'),
  createdBy: text('created_by').notNull(),
  createdAt: text('created_at').notNull(),
});

export const paymentAllocations = sqliteTable('payment_allocations', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  paymentId: text('payment_id').notNull().references(() => payments.id),
  invoiceId: text('invoice_id').notNull().references(() => invoices.id),
  amount: real('amount').notNull(),
  createdAt: text('created_at').notNull(),
});

export const stockMovements = sqliteTable('stock_movements', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  productId: text('product_id').notNull().references(() => products.id),
  type: text('type', { enum: ['in', 'out', 'adjust'] }).notNull(),
  quantity: real('quantity').notNull(),
  beforeStock: real('before_stock').notNull(),
  afterStock: real('after_stock').notNull(),
  note: text('note').notNull().default(''),
  referenceId: text('reference_id'),
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
  sessionVersion: integer('session_version').notNull().default(1),
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

export const customerCareLogs = sqliteTable('customer_care_logs', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  customerId: text('customer_id').notNull().references(() => customers.id),
  channel: text('channel', { enum: ['zalo', 'call', 'sms', 'other'] }).notNull().default('zalo'),
  templateType: text('template_type', { enum: ['pre_due', 'due_today', 'overdue', 'thanks_after_payment', 'repurchase_invite', 'new_arrival'] }).notNull().default('due_today'),
  message: text('message').notNull().default(''),
  dueDate: text('due_date'),
  status: text('status', { enum: ['not_sent', 'sent', 'promised', 'paid'] }).notNull().default('sent'),
  responded: integer('responded', { mode: 'boolean' }).notNull().default(false),
  note: text('note').notNull().default(''),
  createdAt: text('created_at').notNull(),
  createdBy: text('created_by').notNull(),
});
