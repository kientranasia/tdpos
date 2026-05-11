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
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: 'owner' | 'manager' | 'cashier' | 'warehouse' | 'accountant';
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
  stock: number;
  trackStock: boolean;
  lowStockThreshold: number;
  status: 'active' | 'inactive';
  barcode?: string;
  imageUrl?: string;
}

export interface Category {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
}

export interface Customer {
  id: string;
  tenantId: string; // Tách data theo tenant
  name: string;
  phone: string;
  address: string;
  totalDebt: number;
  type: 'retail' | 'loyal'; // lẻ hay thân thiết
}

export type PaymentMethod = 'cash' | 'transfer' | 'debt';

export interface Invoice {
  id: string;
  tenantId: string;
  customerId: string | null;
  createdBy: string; // User ID
  totalAmount: number;
  discount: number;
  finalAmount: number;
  paidAmount: number;
  debtAmount: number;
  paymentMethod: PaymentMethod;
  status: 'completed' | 'partial' | 'unpaid';
  createdAt: string;
}

export interface InvoiceItem {
  id: string;
  invoiceId: string;
  productId: string;
  productName: string;
  quantity: number;
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

export interface Currency {
  code: string;
  symbol: string;
  rate: number; // Tỷ giá so với base currency (VND)
}
