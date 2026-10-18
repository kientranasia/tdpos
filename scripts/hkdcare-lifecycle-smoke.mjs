import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const baseUrl = (process.env.HKDPLUS_BASE_URL || 'http://localhost:3101').replace(/\/$/, '');
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
  body: JSON.stringify({
    email: process.env.HKDPLUS_SMOKE_EMAIL || 'owner@hkdplus.local',
    password: process.env.HKDPLUS_SMOKE_PASSWORD || '123456',
  }),
});
assert(login.response.ok && login.body?.token, 'Đăng nhập lifecycle smoke thất bại');
const auth = { Authorization: `Bearer ${login.body.token}` };
const created = { productId: null, customerId: null, invoiceId: null, paymentId: null };

const cleanup = () => {
  const db = new Database(dbPath);
  db.pragma('foreign_keys = OFF');
  const remove = (table, column, value) => value && db.prepare(`DELETE FROM ${table} WHERE ${column} = ?`).run(value);
  remove('payment_allocations', 'payment_id', created.paymentId);
  remove('payments', 'id', created.paymentId);
  remove('cashbook_entries', 'reference_id', created.paymentId);
  remove('debt_ledger', 'invoice_id', created.invoiceId);
  remove('audit_logs', 'entity_id', created.invoiceId);
  remove('stock_reservations', 'invoice_id', created.invoiceId);
  remove('stock_movements', 'reference_id', created.invoiceId);
  remove('invoice_items', 'invoice_id', created.invoiceId);
  remove('invoices', 'id', created.invoiceId);
  remove('customers', 'id', created.customerId);
  remove('products', 'id', created.productId);
  db.close();
};

try {
  const product = await request('/api/products', {
    method: 'POST', headers: auth,
    body: JSON.stringify({ sku: `LIFE-${Date.now()}`, name: 'Hàng lifecycle kiểm thử', category: 'Kiểm thử', unit: 'cái', purchasePrice: 100, sellingPrice: 150, taxRate: 0, stock: 5, trackStock: true, lowStockThreshold: 1, status: 'active' }),
  });
  assert(product.response.status === 201, `Tạo hàng lifecycle thất bại: ${JSON.stringify(product.body)}`);
  created.productId = product.body.id;
  const customer = await request('/api/customers', {
    method: 'POST', headers: auth,
    body: JSON.stringify({ name: 'Khách lifecycle', phone: '0988000000', address: 'Kiểm thử', type: 'retail' }),
  });
  assert(customer.response.status === 201, `Tạo khách lifecycle thất bại: ${JSON.stringify(customer.body)}`);
  created.customerId = customer.body.id;

  const createdInvoice = await request('/api/invoices', {
    method: 'POST', headers: auth,
    // The stale client value is intentionally sent to verify the server no
    // longer creates a reviewable draft after payment.
    body: JSON.stringify({ customerId: created.customerId, totalAmount: 450, discount: 0, taxAmount: 0, finalAmount: 450, paidAmount: 450, debtAmount: 0, paymentMethod: 'cash', status: 'completed', workflowStatus: 'draft', items: [{ productId: created.productId, productName: 'Hàng lifecycle kiểm thử', quantity: 3, price: 150, taxRate: 0, total: 450 }] }),
  });
  assert(createdInvoice.response.status === 201 && createdInvoice.body.workflowStatus === 'closed' && createdInvoice.body.status === 'completed', `Bill chưa được ghi nhận ngay: ${JSON.stringify(createdInvoice.body)}`);
  created.invoiceId = createdInvoice.body.id;
  const postingDb = new Database(dbPath);
  const reservation = postingDb.prepare('SELECT quantity, status FROM stock_reservations WHERE invoice_id = ?').get(created.invoiceId);
  const stockMovement = postingDb.prepare('SELECT quantity, type FROM stock_movements WHERE reference_id = ?').get(created.invoiceId);
  const cashbookEntry = postingDb.prepare('SELECT amount, type, category FROM cashbook_entries WHERE reference_id = ?').get(created.invoiceId);
  postingDb.close();
  assert(!reservation, 'Bill thanh toán không được tạo giữ tồn');
  assert(Number(stockMovement?.quantity) === 3 && stockMovement.type === 'out', 'Thanh toán chưa trừ tồn kho ngay');
  assert(Number(cashbookEntry?.amount) === 450 && cashbookEntry.type === 'income' && cashbookEntry.category === 'Bán hàng', 'Thanh toán chưa ghi sổ quỹ ngay');
  const afterCheckout = await request(`/api/products/${created.productId}`, { headers: auth });
  assert(Number(afterCheckout.body.stock) === 2, 'Thanh toán không cập nhật tồn kho đúng số lượng');
  console.log(JSON.stringify({ ok: true, flow: 'checkout-posts-invoice-stock-and-cashbook', invoiceId: created.invoiceId }));
} finally {
  cleanup();
}
