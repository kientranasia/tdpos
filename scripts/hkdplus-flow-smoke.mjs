import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const baseUrl = (process.env.HKDPLUS_BASE_URL || 'http://localhost:3101').replace(/\/$/, '');
const email = process.env.HKDPLUS_SMOKE_EMAIL || 'owner@hkdplus.local';
const password = process.env.HKDPLUS_SMOKE_PASSWORD || '123456';
const dbPath = process.env.HKDPLUS_DB_PATH || 'data/tdpos.db';

const request = async (path, options = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  let body = null;
  try { body = await response.json(); } catch { /* empty response */ }
  return { response, body };
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const login = await request('/api/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email, password }),
});
assert(login.response.ok && login.body?.token, 'Đăng nhập flow smoke thất bại');
const auth = { Authorization: `Bearer ${login.body.token}` };
const created = { productId: null, supplierId: null, customerId: null, purchaseId: null, invoiceId: null, debtPaymentId: null, payablePaymentId: null };

const cleanup = () => {
  const db = new Database(dbPath);
  db.pragma('foreign_keys = OFF');
  const deleteBy = (table, column, value) => {
    if (value) db.prepare(`DELETE FROM ${table} WHERE ${column} = ?`).run(value);
  };
  deleteBy('cashbook_entries', 'reference_id', created.invoiceId);
  deleteBy('cashbook_entries', 'reference_id', created.debtPaymentId);
  deleteBy('cashbook_entries', 'reference_id', created.payablePaymentId);
  deleteBy('cashbook_entries', 'reference_id', created.purchaseId);
  deleteBy('debt_ledger', 'invoice_id', created.invoiceId);
  deleteBy('payable_ledger', 'purchase_id', created.purchaseId);
  deleteBy('payable_ledger', 'id', created.payablePaymentId);
  deleteBy('stock_movements', 'reference_id', created.purchaseId);
  deleteBy('stock_movements', 'reference_id', created.invoiceId);
  deleteBy('invoice_items', 'invoice_id', created.invoiceId);
  deleteBy('purchase_items', 'purchase_id', created.purchaseId);
  deleteBy('invoices', 'id', created.invoiceId);
  deleteBy('purchases', 'id', created.purchaseId);
  deleteBy('customers', 'id', created.customerId);
  deleteBy('suppliers', 'id', created.supplierId);
  deleteBy('products', 'id', created.productId);
  db.close();
};

try {
  const product = await request('/api/products', {
    method: 'POST', headers: auth,
    body: JSON.stringify({ sku: `FLOW-${Date.now()}`, name: 'Hàng kiểm thử HKDPlus', category: 'Kiểm thử', unit: 'cái', purchasePrice: 100, sellingPrice: 150, taxRate: 0, stock: 0, trackStock: true, lowStockThreshold: 1, status: 'active' }),
  });
  assert(product.response.status === 201, `Tạo hàng hóa thất bại: ${JSON.stringify(product.body)}`);
  created.productId = product.body.id;
  const initialStock = Number(product.body.stock);

  const supplier = await request('/api/suppliers', {
    method: 'POST', headers: auth,
    body: JSON.stringify({ code: `FLOW-NCC-${Date.now()}`, name: 'Nhà cung cấp kiểm thử', phone: '0900000000', address: 'Địa chỉ kiểm thử' }),
  });
  assert(supplier.response.status === 201, `Tạo nhà cung cấp thất bại: ${JSON.stringify(supplier.body)}`);
  created.supplierId = supplier.body.id;

  const customer = await request('/api/customers', {
    method: 'POST', headers: auth,
    body: JSON.stringify({ name: 'Khách hàng kiểm thử', phone: '0911111111', address: 'Địa chỉ kiểm thử', type: 'retail' }),
  });
  assert(customer.response.status === 201, `Tạo khách hàng thất bại: ${JSON.stringify(customer.body)}`);
  created.customerId = customer.body.id;

  const purchase = await request('/api/purchases', {
    method: 'POST', headers: auth,
    body: JSON.stringify({ supplierId: created.supplierId, paidAmount: 0, paymentMethod: 'payable', taxAmount: 0, items: [{ productId: created.productId, quantity: 5, price: 100, taxRate: 0 }] }),
  });
  assert(purchase.response.status === 201, `Tạo phiếu nhập thất bại: ${JSON.stringify(purchase.body)}`);
  created.purchaseId = purchase.body.id;
  assert(Number(purchase.body.payableAmount) === 500, 'Công nợ nhà cung cấp sau nhập hàng không đúng');

  const afterPurchase = await request(`/api/products/${created.productId}`, { headers: auth });
  assert(afterPurchase.response.ok && Number(afterPurchase.body.stock) === initialStock + 5, 'Tồn kho không tăng sau nhập hàng');

  const invoice = await request('/api/invoices', {
    method: 'POST', headers: auth,
    body: JSON.stringify({ customerId: created.customerId, totalAmount: 300, discount: 0, taxAmount: 0, finalAmount: 300, paidAmount: 0, debtAmount: 300, paymentMethod: 'debt', status: 'unpaid', items: [{ productId: created.productId, productName: 'Hàng kiểm thử HKDPlus', quantity: 2, price: 150, taxRate: 0, total: 300 }] }),
  });
  assert(invoice.response.status === 201, `Tạo hóa đơn thất bại: ${JSON.stringify(invoice.body)}`);
  created.invoiceId = invoice.body.id;

  const afterSale = await request(`/api/products/${created.productId}`, { headers: auth });
  assert(afterSale.response.ok && Number(afterSale.body.stock) === initialStock + 3, 'Tồn kho không giảm sau bán hàng');
  const customerAfterSale = await request(`/api/customers/${created.customerId}`, { headers: auth });
  assert(Number(customerAfterSale.body.totalDebt) === 300, 'Công nợ khách hàng sau bán chịu không đúng');

  const debtPayment = await request('/api/debt-ledger', {
    method: 'POST', headers: auth,
    body: JSON.stringify({ customerId: created.customerId, invoiceId: created.invoiceId, amount: 100, type: 'decrease', note: 'Thu nợ kiểm thử' }),
  });
  assert(debtPayment.response.status === 201, `Thu nợ thất bại: ${JSON.stringify(debtPayment.body)}`);
  created.debtPaymentId = debtPayment.body.id;
  const customerAfterPayment = await request(`/api/customers/${created.customerId}`, { headers: auth });
  assert(Number(customerAfterPayment.body.totalDebt) === 200, 'Công nợ khách hàng sau thu nợ không đúng');

  const payablePayment = await request('/api/payable-ledger', {
    method: 'POST', headers: auth,
    body: JSON.stringify({ supplierId: created.supplierId, amount: 200, note: 'Trả nhà cung cấp kiểm thử' }),
  });
  assert(payablePayment.response.status === 201, `Trả nhà cung cấp thất bại: ${JSON.stringify(payablePayment.body)}`);
  created.payablePaymentId = payablePayment.body.id;
  const supplierAfterPayment = await request(`/api/suppliers`, { headers: auth });
  const trackedSupplier = supplierAfterPayment.body.find((row) => row.id === created.supplierId);
  assert(Number(trackedSupplier?.currentPayable) === 300, 'Công nợ nhà cung cấp sau thanh toán không đúng');

  const cashbook = await request('/api/cashbook', { headers: auth });
  assert(cashbook.response.ok && cashbook.body.some((row) => row.category === 'Thu nợ' && row.referenceId === created.invoiceId), 'Thiếu dòng tiền thu nợ');
  assert(cashbook.body.some((row) => row.category === 'Thanh toán NCC'), 'Thiếu dòng tiền trả nhà cung cấp');
  const movements = await request(`/api/stock-movements?productId=${created.productId}`, { headers: auth });
  assert(movements.response.ok && movements.body.some((row) => row.referenceId === created.purchaseId && row.type === 'in'), 'Thiếu transaction nhập kho');
  assert(movements.body.some((row) => row.referenceId === created.invoiceId && row.type === 'out'), 'Thiếu transaction xuất kho');

  console.log(JSON.stringify({ ok: true, flow: 'purchase-inventory-sale-debt-cashbook', purchaseId: created.purchaseId, invoiceId: created.invoiceId }));
} finally {
  cleanup();
}
