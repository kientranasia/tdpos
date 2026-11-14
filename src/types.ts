export interface Tenant {
  id: string;
  name: string;
  legalName?: string;
  address: string;
  province?: string;
  district?: string;
  ward?: string;
  phone: string;
  email?: string;
  taxInfo?: string;
  logoUrl?: string;
  timezone: string;
  currency: string;
  invoicePrefix: string;
  status: 'active' | 'suspended' | 'trial' | 'onboarding' | 'pending_setup';
  trialStartAt?: string;
  trialEndAt?: string;
  subscriptionStatus?: 'trial' | 'active' | 'expired' | 'cancelled' | 'pending_review';
  subscriptionPlan?: 'monthly' | 'yearly';
  subscriptionPriceMonthly?: number;
  subscriptionStartAt?: string;
  subscriptionEndAt?: string;
  packageCode?: string;
  packageName?: string;
  maxUsers?: number;
  packagePriceMonthly?: number;
  accessBlocked?: boolean;
  createdAt: string;
  settings?: TenantSettings;
}

export interface TenantSettings {
  lowStockThresholdDefault: number;
  enabledPaymentMethods: PaymentMethod[];
  debtPolicy: {
    allowDebt: boolean;
    maxDebtAmount: number;
    maxDebtDays: number;
  };
  workingHours: {
    open: string;
    close: string;
  };
  defaultLanguage: string;
  branding?: {
    appName?: string;
    browserTitle?: string;
    shortName?: string;
    themeColor?: string;
    logoUrl?: string;
    footerText?: string;
  };
  invoice?: {
    storeDisplayName?: string;
    headerLine1?: string;
    headerLine2?: string;
    showAddress?: boolean;
    showPhone?: boolean;
    showCustomerPhone?: boolean;
    showOperator?: boolean;
    showOrderNote?: boolean;
    footerNote?: string;
    printSize?: 'a5' | 'receipt_80mm';
  };
  insights?: {
    businessModel?: string;
    industry?: string;
    staffSize?: string;
    monthlyOrdersEstimate?: string;
    salesChannels?: string[];
    primaryGoal?: string;
  };
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  tenantId: string;
  status: 'active' | 'inactive';
}

export interface Product {
  id: string;
  tenantId: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  purchasePrice: number;
  sellingPrice: number;
  taxRate: number;
  stock: number;
  trackStock: boolean;
  lowStockThreshold: number;
  maxStockThreshold?: number;
  status: 'active' | 'inactive';
  barcode?: string;
  imageUrl?: string;
  productType?: 'standard' | 'combo';
  attributes?: string | null;
  attributesJson?: string | null;
  sourceSystem?: string | null;
  sourceCode?: string | null;
  sourceRelatedCode?: string | null;
  sourceImportedAt?: string | null;
  reservedStock?: number;
  availableStock?: number;
  units?: ProductUnit[];
  components?: ProductComponent[];
}

export interface ProductUnit {
  id: string;
  tenantId: string;
  productId: string;
  sku?: string | null;
  name: string;
  factor: number;
  barcode?: string | null;
  purchasePrice?: number;
  sellingPrice?: number;
  stock?: number;
  attributes?: string | null;
  sourceSystem?: string | null;
  sourceCode?: string | null;
  sourceRelatedCode?: string | null;
  sourceImportedAt?: string | null;
  active?: boolean;
}

export interface ProductComponent {
  id: string;
  tenantId: string;
  comboProductId: string;
  componentProductId: string;
  quantity: number;
  component?: Product;
}

export interface PriceList {
  id: string;
  tenantId: string;
  name: string;
  customerType: string;
  isDefault: boolean;
  active: boolean;
  items?: PriceListItem[];
}

export interface PriceListItem {
  id: string;
  tenantId: string;
  priceListId: string;
  productId: string;
  unitName: string;
  unitFactor: number;
  price: number;
}

export interface Category {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
}

export interface Customer {
  id: string;
  code?: string;
  tenantId: string; // Tách data theo tenant
  createdBy?: string;
  createdByName?: string | null;
  name: string;
  phone: string;
  address: string;
  taxCode?: string | null;
  companyName?: string | null;
  invoiceAddress?: string | null;
  shippingAddress?: string | null;
  creditLimit?: number;
  paymentDays?: number;
  allowDebt?: boolean;
  contactName?: string | null;
  note?: string;
  active?: boolean;
  totalDebt: number;
  type: 'retail' | 'loyal'; // lẻ hay thân thiết
  tags?: string[];
}

export interface Supplier {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  phone: string;
  taxCode?: string | null;
  address: string;
  currentPayable: number;
  note?: string;
  active: boolean;
}

export interface PurchaseItem {
  id: string;
  purchaseId: string;
  productId: string;
  productName: string;
  unit: string;
  quantity: number;
  price: number;
  taxRate: number;
  total: number;
  unitFactor?: number;
  baseQuantity?: number;
  isGift?: boolean;
  sellingPrice?: number;
  note?: string;
}

export interface Purchase {
  id: string;
  documentNo?: string;
  tenantId: string;
  supplierId: string;
  totalAmount: number;
  taxAmount: number;
  finalAmount: number;
  paidAmount: number;
  payableAmount: number;
  paymentMethod: 'cash' | 'transfer' | 'payable';
  accountId?: string | null;
  status: 'confirmed' | 'partial' | 'unpaid';
  note: string;
  createdAt: string;
  supplier?: Supplier | null;
  items?: PurchaseItem[];
}

export interface PurchaseReturn {
  id: string;
  documentNo: string;
  tenantId: string;
  purchaseId: string;
  supplierId: string;
  totalAmount: number;
  note: string;
  createdBy: string;
  createdAt: string;
  items?: PurchaseReturnItem[];
}

export interface PurchaseReturnItem {
  id: string;
  returnId: string;
  purchaseItemId: string;
  productId: string;
  productName: string;
  unit: string;
  quantity: number;
  unitFactor: number;
  baseQuantity: number;
  price: number;
  total: number;
}

export type PaymentMethod = 'cash' | 'transfer' | 'wallet' | 'debt';

export interface Invoice {
  id: string;
  documentNo?: string;
  tenantId: string;
  customerId: string | null;
  createdBy: string; // User ID
  createdByName?: string | null;
  totalAmount: number;
  discount: number;
  taxAmount: number;
  finalAmount: number;
  paidAmount: number;
  debtAmount: number;
  previousDebtAmount?: number;
  changeAmount?: number;
  paymentMethod: PaymentMethod;
  accountId?: string | null;
  status: 'completed' | 'partial' | 'unpaid';
  workflowStatus?: 'draft' | 'checked' | 'picking' | 'ready_to_close' | 'closed' | 'cancelled';
  paymentStatus?: 'unpaid' | 'partial' | 'paid';
  version?: number;
  checkedBy?: string | null;
  checkedAt?: string | null;
  pickedBy?: string | null;
  pickedAt?: string | null;
  closedBy?: string | null;
  closedAt?: string | null;
  cancelledBy?: string | null;
  cancelledAt?: string | null;
  note?: string;
  createdAt: string;
}

export interface InvoiceItem {
  id: string;
  invoiceId: string;
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  taxRate: number;
  total: number;
  orderedQuantity?: number;
  pickedQuantity?: number;
  confirmedQuantity?: number;
  lineStatus?: 'ordered' | 'picked' | 'short' | 'confirmed';
  note?: string;
  unitName?: string | null;
  unitFactor?: number;
  baseQuantity?: number;
  priceListId?: string | null;
  priceListName?: string | null;
}

export interface SalesReturn {
  id: string;
  documentNo: string;
  tenantId: string;
  invoiceId: string;
  customerId?: string | null;
  totalAmount: number;
  debtReduction: number;
  refundAmount: number;
  refundAccountId?: string | null;
  note: string;
  createdBy: string;
  createdAt: string;
  items?: SalesReturnItem[];
}

export interface SalesReturnItem {
  id: string;
  returnId: string;
  invoiceItemId: string;
  productId: string;
  productName: string;
  unitName: string;
  quantity: number;
  unitFactor: number;
  baseQuantity: number;
  price: number;
  total: number;
}

export interface DebtLedger {
  id: string;
  tenantId: string;
  customerId: string;
  invoiceId: string | null;
  amount: number;
  type: 'increase' | 'decrease'; // increase: mua nợ, decrease: trả nợ
  note: string;
  createdAt: string;
  createdBy: string;
}

export interface CustomerCareLog {
  id: string;
  tenantId: string;
  customerId: string;
  channel: 'zalo' | 'call' | 'sms' | 'other';
  templateType: 'pre_due' | 'due_today' | 'overdue' | 'thanks_after_payment' | 'repurchase_invite' | 'new_arrival';
  message: string;
  dueDate?: string | null;
  status: 'not_sent' | 'sent' | 'promised' | 'paid';
  responded: boolean;
  note?: string;
  createdAt: string;
  createdBy: string;
  createdByName?: string | null;
}

export interface Currency {
  code: string;
  symbol: string;
  rate: number; // Tỷ giá so với base currency (VND)
}

export interface CashbookEntry {
  id: string;
  tenantId: string;
  type: 'income' | 'expense';
  amount: number;
  category: string;
  note: string;
  referenceId?: string | null;
  createdAt: string;
  createdBy: string;
  accountId?: string | null;
  actorId?: string | null;
  actorName?: string | null;
  counterpartyType?: 'customer' | 'supplier' | 'other' | null;
  counterpartyId?: string | null;
  counterpartyName?: string | null;
  displayNote?: string;
  referenceLabel?: string | null;
  referenceType?: 'invoice' | 'sales_return' | 'purchase' | 'purchase_return' | 'unknown' | null;
}

export interface CashAccount {
  id: string;
  tenantId: string;
  name: string;
  type: string;
  active: boolean | number;
}

export interface SupplierCredit {
  id: string;
  tenantId: string;
  supplierId: string;
  purchaseReturnId?: string | null;
  purchaseId?: string | null;
  amount: number;
  type: 'increase' | 'decrease';
  accountId?: string | null;
  note: string;
  createdBy: string;
  createdAt: string;
}

export interface StaffReportRow {
  userId: string;
  userName: string;
  salesCount: number;
  salesAmount: number;
  salesReturnAmount: number;
  purchaseAmount: number;
  purchaseReturnAmount: number;
  cashIncome: number;
  cashExpense: number;
  netCash: number;
  netSales: number;
}

export interface StockMovement {
  id: string;
  tenantId: string;
  productId: string;
  type: 'in' | 'out' | 'adjust';
  quantity: number;
  beforeStock: number;
  afterStock: number;
  note: string;
  referenceId?: string | null;
  createdAt: string;
  createdBy: string;
}
