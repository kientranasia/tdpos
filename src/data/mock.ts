import { Tenant, User, Product, Customer, Invoice } from '../types';

export const mockTenants: Tenant[] = [
  { 
    id: 't1', 
    name: 'TDPOS Cà Mau 01', 
    legalName: 'TRANDAO Investment - Logistics & Agritech',
    address: '123 Phan Ngọc Hiển, khóm 6, phường 5, Cà Mau', 
    phone: '0901234567',
    timezone: 'Asia/Ho_Chi_Minh',
    currency: 'VND',
    invoicePrefix: 'TD',
    status: 'active',
    createdAt: new Date().toISOString(),
    settings: {
      lowStockThresholdDefault: 10,
      enabledPaymentMethods: ['cash', 'transfer', 'debt'],
      debtPolicy: {
        allowDebt: true,
        maxDebtAmount: 50000000,
        maxDebtDays: 30
      },
      workingHours: {
        open: '07:00',
        close: '18:00'
      },
      defaultLanguage: 'vi'
    }
  },
  { 
    id: 't2', 
    name: 'Cửa hàng Mẫu TDPOS', 
    address: 'Đang thiết lập', 
    phone: '', 
    timezone: 'Asia/Ho_Chi_Minh',
    currency: 'VND',
    invoicePrefix: 'TDNEW',
    status: 'pending_setup',
    createdAt: new Date().toISOString()
  },
];

export const mockUsers: User[] = [
  { id: 'u1', name: 'Chủ hộ demo', email: 'owner@hkdplus.local', role: 'owner', tenantId: 't1', status: 'active' },
  { id: 'u2', name: 'Nhân viên bán hàng', email: 'cashier@hkdplus.local', role: 'cashier', tenantId: 't1', status: 'active' },
];

export const mockProducts: Product[] = [
  { id: 'p1', tenantId: 't1', sku: 'VT001', name: 'Phân bón NPK 20-20-15', category: 'Phân bón', purchasePrice: 800000, sellingPrice: 950000, taxRate: 0, stock: 50, unit: 'bao', lowStockThreshold: 10, trackStock: true, status: 'active' },
  { id: 'p2', tenantId: 't1', sku: 'VT002', name: 'Thuốc trừ sâu Sinh Học', category: 'Thuốc BVTV', purchasePrice: 120000, sellingPrice: 150000, taxRate: 0, stock: 5, unit: 'chai', lowStockThreshold: 10, trackStock: true, status: 'active' },
  { id: 'p3', tenantId: 't1', sku: 'VT003', name: 'Hạt giống Dưa hấu', category: 'Hạt giống', purchasePrice: 50000, sellingPrice: 75000, taxRate: 0, stock: 100, unit: 'gói', lowStockThreshold: 20, trackStock: true, status: 'active' },
  { id: 'p4', tenantId: 't1', sku: 'VT004', name: 'Phân Hữu cơ vi sinh', category: 'Phân bón', purchasePrice: 200000, sellingPrice: 280000, taxRate: 0, stock: 2, unit: 'bao', lowStockThreshold: 5, trackStock: true, status: 'active' },
];

export const mockCustomers: Customer[] = [
  { id: 'c1', tenantId: 't1', name: 'Chú Tư (Khách lẻ)', phone: '0911222333', address: 'Ấp 1, Xã Bình Chánh', totalDebt: 0, type: 'retail' },
  { id: 'c2', tenantId: 't1', name: 'Đại lý Anh Tuấn', phone: '0988777666', address: 'Quốc lộ 1A, Tiền Giang', totalDebt: 4500000, type: 'loyal' },
  { id: 'c3', tenantId: 't1', name: 'Vườn dưa dì Bảy', phone: '0977111222', address: 'Long An', totalDebt: 1200000, type: 'loyal' },
];

export const mockInvoices: Invoice[] = [
  { id: 'inv1', tenantId: 't1', customerId: 'c2', createdBy: 'u1', totalAmount: 4500000, discount: 0, taxAmount: 0, finalAmount: 4500000, paidAmount: 0, debtAmount: 4500000, paymentMethod: 'debt', status: 'unpaid', createdAt: new Date(Date.now() - 86400000 * 2).toISOString() },
  { id: 'inv2', tenantId: 't1', customerId: 'c3', createdBy: 'u2', totalAmount: 2400000, discount: 0, taxAmount: 0, finalAmount: 2400000, paidAmount: 1200000, debtAmount: 1200000, paymentMethod: 'cash', status: 'partial', createdAt: new Date(Date.now() - 86400000).toISOString() },
  { id: 'inv3', tenantId: 't1', customerId: 'c1', createdBy: 'u1', totalAmount: 150000, discount: 0, taxAmount: 0, finalAmount: 150000, paidAmount: 150000, debtAmount: 0, paymentMethod: 'cash', status: 'completed', createdAt: new Date().toISOString() },
];
