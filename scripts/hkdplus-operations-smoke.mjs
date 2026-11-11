import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const baseUrl = (process.env.HKDPLUS_BASE_URL || 'http://localhost:3101').replace(/\/$/, '');
const email = process.env.HKDPLUS_SMOKE_EMAIL;
const password = process.env.HKDPLUS_SMOKE_PASSWORD;
if (!email || !password) throw new Error('Set HKDPLUS_SMOKE_EMAIL and HKDPLUS_SMOKE_PASSWORD before running the operations smoke test.');
const dbPath = process.env.HKDPLUS_DB_PATH || 'data/tdpos.db';
const request = async (path, options = {}) => {
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  let body = null; try { body = await response.json(); } catch { /* empty */ }
  return { response, body };
};
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const login = await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
assert(login.response.ok && login.body?.token, 'Đăng nhập operations smoke thất bại');
const auth = { Authorization: `Bearer ${login.body.token}` };
const created = { priceListId: null, standardId: null, comboId: null, supplierId: null, purchaseId: null, paidPurchaseId: null, invoiceId: null, unitInvoiceId: null, purchaseReturnId: null, paidPurchaseReturnId: null, salesReturnId: null, settlementId: null };

const cleanup = () => {
  const db = new Database(dbPath); db.pragma('foreign_keys = OFF');
  const del = (table, column, value) => { if (value) db.prepare(`DELETE FROM ${table} WHERE ${column} = ?`).run(value); };
  del('cashbook_entries', 'reference_id', created.salesReturnId); del('cashbook_entries', 'reference_id', created.invoiceId); del('cashbook_entries', 'reference_id', created.unitInvoiceId); del('cashbook_entries', 'reference_id', created.purchaseId);
  del('cashbook_entries', 'reference_id', created.settlementId); del('cashbook_entries', 'reference_id', created.paidPurchaseId);
  del('stock_movements', 'reference_id', created.salesReturnId); del('stock_movements', 'reference_id', created.purchaseReturnId); del('stock_movements', 'reference_id', created.invoiceId); del('stock_movements', 'reference_id', created.unitInvoiceId); del('stock_movements', 'reference_id', created.purchaseId);
  del('stock_movements', 'reference_id', created.paidPurchaseReturnId); del('stock_movements', 'reference_id', created.paidPurchaseId);
  del('sales_return_items', 'return_id', created.salesReturnId); del('sales_returns', 'id', created.salesReturnId);
  del('purchase_return_items', 'return_id', created.purchaseReturnId); del('purchase_returns', 'id', created.purchaseReturnId);
  del('purchase_return_items', 'return_id', created.paidPurchaseReturnId); del('purchase_returns', 'id', created.paidPurchaseReturnId);
  del('supplier_credit_ledger', 'purchase_return_id', created.purchaseReturnId); del('supplier_credit_ledger', 'purchase_return_id', created.paidPurchaseReturnId); del('supplier_credit_ledger', 'purchase_id', created.purchaseId); del('supplier_credit_ledger', 'purchase_id', created.paidPurchaseId); del('supplier_credit_ledger', 'id', created.settlementId);
  del('payable_ledger', 'purchase_id', created.purchaseId); del('debt_ledger', 'invoice_id', created.invoiceId);
  del('stock_reservations', 'invoice_id', created.invoiceId); del('stock_reservations', 'invoice_id', created.unitInvoiceId); del('invoice_items', 'invoice_id', created.invoiceId); del('invoice_items', 'invoice_id', created.unitInvoiceId); del('invoices', 'id', created.invoiceId); del('invoices', 'id', created.unitInvoiceId);
  del('purchase_items', 'purchase_id', created.purchaseId); del('purchase_items', 'purchase_id', created.paidPurchaseId); del('purchases', 'id', created.purchaseId); del('purchases', 'id', created.paidPurchaseId);
  del('product_components', 'combo_product_id', created.comboId); del('product_units', 'product_id', created.standardId);
  del('price_list_items', 'price_list_id', created.priceListId); del('price_lists', 'id', created.priceListId);
  del('products', 'id', created.comboId); del('products', 'id', created.standardId); del('suppliers', 'id', created.supplierId);
  db.close();
};

try {
  const accounts = await request('/api/cash-accounts', { headers: auth });
  assert(accounts.response.ok && ['cash', 'bank', 'wallet'].every((type) => accounts.body.some((account) => account.type === type)), 'Thiếu tài khoản tiền mặc định');
  const cashAccount = accounts.body.find((account) => account.type === 'cash');
  const bankAccount = accounts.body.find((account) => account.type === 'bank');
  const walletAccount = accounts.body.find((account) => account.type === 'wallet');

  const standard = await request('/api/products', { method: 'POST', headers: auth, body: JSON.stringify({ sku: `OPS-${Date.now()}`, name: 'Bút operations smoke', category: 'Kiểm thử', unit: 'Cây', purchasePrice: 50, sellingPrice: 60, taxRate: 0, stock: 0, trackStock: true, lowStockThreshold: 1, status: 'active', productType: 'standard' }) });
  assert(standard.response.status === 201, `Tạo sản phẩm thường thất bại: ${JSON.stringify(standard.body)}`); created.standardId = standard.body.id;
  const combo = await request('/api/products', { method: 'POST', headers: auth, body: JSON.stringify({ sku: `OPS-COMBO-${Date.now()}`, name: 'Combo operations smoke', category: 'Kiểm thử', unit: 'Bộ', purchasePrice: 0, sellingPrice: 0, taxRate: 0, stock: 0, trackStock: true, lowStockThreshold: 1, status: 'active', productType: 'combo' }) });
  assert(combo.response.status === 201, `Tạo combo thất bại: ${JSON.stringify(combo.body)}`); created.comboId = combo.body.id;

  const units = await request(`/api/products/${created.standardId}/units`, { method: 'PUT', headers: auth, body: JSON.stringify({ units: [{ name: 'Hộp', factor: 20, barcode: `BOX-${Date.now()}` }] }) });
  assert(units.response.ok && units.body.some((unit) => unit.name === 'Hộp' && Number(unit.factor) === 20), 'Không lưu được đơn vị quy đổi');
  const priceList = await request('/api/price-lists', { method: 'POST', headers: auth, body: JSON.stringify({ name: `OPS-${Date.now()}`, customerType: 'retail', active: true }) });
  assert(priceList.response.status === 201, `Tạo bảng giá thất bại: ${JSON.stringify(priceList.body)}`); created.priceListId = priceList.body.id;
  const savePrices = await request(`/api/price-lists/${created.priceListId}/items`, { method: 'PUT', headers: auth, body: JSON.stringify({ items: [{ productId: created.standardId, unitName: 'Cây', unitFactor: 1, price: 60 }, { productId: created.standardId, unitName: 'Hộp', unitFactor: 20, price: 1000 }] }) });
  assert(savePrices.response.ok && savePrices.body.some((item) => item.unitName === 'Hộp' && Number(item.price) === 1000), 'Không lưu được giá riêng theo đơn vị');
  const components = await request(`/api/products/${created.comboId}/components`, { method: 'PUT', headers: auth, body: JSON.stringify({ components: [{ componentProductId: created.standardId, quantity: 2 }] }) });
  assert(components.response.ok, `Không lưu được thành phần combo: ${JSON.stringify(components.body)}`);

  const supplier = await request('/api/suppliers', { method: 'POST', headers: auth, body: JSON.stringify({ code: `OPS-NCC-${Date.now()}`, name: 'NCC operations smoke', phone: '0900000000' }) });
  assert(supplier.response.status === 201, 'Tạo NCC operations smoke thất bại'); created.supplierId = supplier.body.id;
  const purchase = await request('/api/purchases', { method: 'POST', headers: auth, body: JSON.stringify({ supplierId: created.supplierId, paymentMethod: 'payable', items: [{ productId: created.standardId, quantity: 2, unitName: 'Hộp', unitFactor: 20, price: 1000 }] }) });
  assert(purchase.response.status === 201, `Nhập 2 hộp thất bại: ${JSON.stringify(purchase.body)}`); created.purchaseId = purchase.body.id;
  const afterPurchase = await request(`/api/products/${created.standardId}`, { headers: auth });
  assert(Number(afterPurchase.body.stock) === 40, `Tồn sau nhập 2 hộp phải là 40, nhận ${afterPurchase.body.stock}`);

  const invoice = await request('/api/invoices', { method: 'POST', headers: auth, body: JSON.stringify({ customerId: null, totalAmount: 120, discount: 0, taxAmount: 0, finalAmount: 120, paidAmount: 120, debtAmount: 0, paymentMethod: 'cash', accountId: cashAccount.id, status: 'completed', workflowStatus: 'closed', paymentStatus: 'paid', items: [{ productId: created.comboId, productName: 'Combo operations smoke', quantity: 1, priceListId: created.priceListId }] }) });
  assert(invoice.response.status === 201, `Bán combo thất bại: ${JSON.stringify(invoice.body)}`); created.invoiceId = invoice.body.id;
  const afterComboSale = await request(`/api/products/${created.standardId}`, { headers: auth });
  assert(Number(afterComboSale.body.stock) === 38, `Tồn sau bán combo phải là 38, nhận ${afterComboSale.body.stock}`);

  const unitInvoice = await request('/api/invoices', { method: 'POST', headers: auth, body: JSON.stringify({ customerId: null, totalAmount: 1000, discount: 0, taxAmount: 0, finalAmount: 1000, paidAmount: 1000, debtAmount: 0, paymentMethod: 'cash', accountId: cashAccount.id, status: 'completed', workflowStatus: 'closed', paymentStatus: 'paid', items: [{ productId: created.standardId, productName: 'Bút operations smoke', quantity: 1, unitName: 'Hộp', unitFactor: 20, priceListId: created.priceListId }] }) });
  assert(unitInvoice.response.status === 201, `Bán theo hộp thất bại: ${JSON.stringify(unitInvoice.body)}`); created.unitInvoiceId = unitInvoice.body.id;
  const unitInvoiceDetail = await request(`/api/invoices/${created.unitInvoiceId}`, { headers: auth });
  assert(unitInvoiceDetail.response.ok && Number(unitInvoiceDetail.body.items?.[0]?.price) === 1000, `Giá bán theo hộp phải là 1000, nhận ${unitInvoiceDetail.body.items?.[0]?.price}`);
  const afterBoxSale = await request(`/api/products/${created.standardId}`, { headers: auth });
  assert(Number(afterBoxSale.body.stock) === 18, `Tồn sau bán 1 hộp phải là 18, nhận ${afterBoxSale.body.stock}`);

  const invoiceDetail = await request(`/api/invoices/${created.invoiceId}`, { headers: auth });
  const salesReturn = await request(`/api/invoices/${created.invoiceId}/returns`, { method: 'POST', headers: auth, body: JSON.stringify({ items: [{ invoiceItemId: invoiceDetail.body.items?.[0]?.id, quantity: 1 }], refundAccountId: cashAccount.id }) });
  assert(salesReturn.response.status === 201, `Trả combo thất bại: ${JSON.stringify(salesReturn.body)}`); created.salesReturnId = salesReturn.body.id;
  const afterSalesReturn = await request(`/api/products/${created.standardId}`, { headers: auth });
  assert(Number(afterSalesReturn.body.stock) === 20, `Tồn sau trả combo phải là 20, nhận ${afterSalesReturn.body.stock}`);

  const returnable = await request(`/api/purchases/${created.purchaseId}/returnable`, { headers: auth });
  const purchaseItem = returnable.body.items[0];
  const purchaseReturn = await request(`/api/purchases/${created.purchaseId}/returns`, { method: 'POST', headers: auth, body: JSON.stringify({ items: [{ purchaseItemId: purchaseItem.id, quantity: 1 }] }) });
  assert(purchaseReturn.response.status === 201, `Trả NCC thất bại: ${JSON.stringify(purchaseReturn.body)}`); created.purchaseReturnId = purchaseReturn.body.id;
  const afterPurchaseReturn = await request(`/api/products/${created.standardId}`, { headers: auth });
  assert(Number(afterPurchaseReturn.body.stock) === 0, `Tồn sau trả NCC phải là 0, nhận ${afterPurchaseReturn.body.stock}`);
  const paidPurchase = await request('/api/purchases', { method: 'POST', headers: auth, body: JSON.stringify({ supplierId: created.supplierId, paidAmount: 60, paymentMethod: 'transfer', accountId: bankAccount.id, items: [{ productId: created.standardId, quantity: 1, unitName: 'Cây', unitFactor: 1, price: 60 }] }) });
  assert(paidPurchase.response.status === 201, `Nhập đã thanh toán thất bại: ${JSON.stringify(paidPurchase.body)}`); created.paidPurchaseId = paidPurchase.body.id;
  const paidReturnable = await request(`/api/purchases/${created.paidPurchaseId}/returnable`, { headers: auth });
  const paidPurchaseReturn = await request(`/api/purchases/${created.paidPurchaseId}/returns`, { method: 'POST', headers: auth, body: JSON.stringify({ items: [{ purchaseItemId: paidReturnable.body.items[0].id, quantity: 1 }] }) });
  assert(paidPurchaseReturn.response.status === 201, `Trả NCC đã thanh toán thất bại: ${JSON.stringify(paidPurchaseReturn.body)}`); created.paidPurchaseReturnId = paidPurchaseReturn.body.id;
  const credits = await request(`/api/supplier-credit-ledger?supplierId=${created.supplierId}`, { headers: auth });
  const creditBalance = credits.body.reduce((sum, row) => sum + (row.type === 'increase' ? Number(row.amount) : -Number(row.amount)), 0);
  assert(credits.response.ok && creditBalance === 60, `Số dư được nhận từ NCC phải là 60, nhận ${creditBalance}`);
  const settlement = await request(`/api/suppliers/${created.supplierId}/credit-settlement`, { method: 'POST', headers: auth, body: JSON.stringify({ amount: 60, paymentMethod: 'wallet', accountId: walletAccount.id }) });
  assert(settlement.response.status === 201, `Nhận tiền NCC thất bại: ${JSON.stringify(settlement.body)}`); created.settlementId = settlement.body.id;
  const report = await request('/api/reports/staff', { headers: auth });
  assert(report.response.ok && Array.isArray(report.body.rows) && Array.isArray(report.body.details), 'Báo cáo nhân viên không trả về rows/details');
  const cashbook = await request('/api/cashbook', { headers: auth });
  assert(cashbook.response.ok && cashbook.body.some((entry) => entry.accountId === cashAccount.id && entry.category === 'Hoàn tiền khách hàng'), 'Thiếu dòng hoàn tiền có tài khoản');
  assert(cashbook.body.some((entry) => entry.accountId === bankAccount.id && entry.category === 'Nhập hàng'), 'Thiếu dòng nhập hàng theo tài khoản ngân hàng');
  assert(cashbook.body.some((entry) => entry.accountId === walletAccount.id && entry.category === 'Thu tiền NCC'), 'Thiếu dòng nhận tiền NCC theo tài khoản ví');
  console.log(JSON.stringify({ ok: true, flow: 'price-list-unit-combo-purchase-return-sales-return-accounts-report', standardId: created.standardId, comboId: created.comboId }));
} finally { cleanup(); }
