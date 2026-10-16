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

  const draft = await request('/api/invoices', {
    method: 'POST', headers: auth,
    body: JSON.stringify({ customerId: created.customerId, totalAmount: 450, discount: 0, taxAmount: 0, finalAmount: 450, paidAmount: 0, debtAmount: 450, paymentMethod: 'debt', items: [{ productId: created.productId, productName: 'Hàng lifecycle kiểm thử', quantity: 3, price: 150, taxRate: 0, total: 450 }] }),
  });
  assert(draft.response.status === 201 && draft.body.workflowStatus === 'draft', `Bill chưa ở nháp: ${JSON.stringify(draft.body)}`);
  created.invoiceId = draft.body.id;
  const reservationDb = new Database(dbPath);
  const reservation = reservationDb.prepare('SELECT quantity, status FROM stock_reservations WHERE invoice_id = ?').get(created.invoiceId);
  reservationDb.close();
  assert(Number(reservation?.quantity) === 3 && reservation.status === 'reserved', 'Chưa tạo giữ tồn cho bill nháp');

  const checked = await request(`/api/invoices/${created.invoiceId}/check`, { method: 'POST', headers: auth, body: '{}' });
  assert(checked.response.ok && checked.body.workflowStatus === 'checked', 'Kiểm bill thất bại');
  const detail = await request(`/api/invoices/${created.invoiceId}`, { headers: auth });
  const picked = await request(`/api/invoices/${created.invoiceId}/pick`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({ items: [{ id: detail.body.items[0].id, pickedQuantity: 2 }] }),
  });
  assert(picked.response.ok && picked.body.workflowStatus === 'ready_to_close', 'Lấy hàng thiếu thất bại');
  const closed = await request(`/api/invoices/${created.invoiceId}/close`, { method: 'POST', headers: auth, body: '{}' });
  assert(closed.response.ok && closed.body.workflowStatus === 'closed', 'Chốt bill thất bại');
  const afterClose = await request(`/api/products/${created.productId}`, { headers: auth });
  assert(Number(afterClose.body.stock) === 3, 'Chốt bill không trừ đúng số lượng thực lấy');

  const payment = await request('/api/payments', { method: 'POST', headers: auth, body: JSON.stringify({ customerId: created.customerId, amount: 100, paymentMethod: 'cash', note: 'Thu lifecycle' }) });
  assert(payment.response.status === 201, `Tạo phiếu thu thất bại: ${JSON.stringify(payment.body)}`);
  created.paymentId = payment.body.id;
  const allocation = await request(`/api/payments/${created.paymentId}/allocations`, { method: 'POST', headers: auth, body: JSON.stringify({ allocations: [{ invoiceId: created.invoiceId, amount: 100 }] }) });
  assert(allocation.response.ok, `Phân bổ phiếu thu thất bại: ${JSON.stringify(allocation.body)}`);
  const timeline = await request(`/api/invoices/${created.invoiceId}/timeline`, { headers: auth });
  assert(timeline.response.ok && timeline.body.some((entry) => entry.action === 'invoice.close'), 'Thiếu audit lifecycle');
  console.log(JSON.stringify({ ok: true, flow: 'invoice-lifecycle-payment-allocation', invoiceId: created.invoiceId, paymentId: created.paymentId }));
} finally {
  cleanup();
}
