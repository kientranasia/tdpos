/**
 * Read-only cross-module reconciliation review.
 *
 * It deliberately uses the public authenticated API instead of opening the
 * database, so the same check can be run against SQLite offline or PostgreSQL
 * SaaS without changing customer data.
 */
const baseUrl = (process.env.HKDPLUS_BASE_URL || 'https://localhost:6688').replace(/\/$/, '');
const email = process.env.HKDPLUS_SMOKE_EMAIL;
const password = process.env.HKDPLUS_SMOKE_PASSWORD;
const insecureTls = String(process.env.HKDPLUS_TLS_INSECURE || '').toLowerCase() === 'true';
const strict = String(process.env.HKDPLUS_RECON_STRICT || '').toLowerCase() === 'true';
const pageSize = Math.min(Math.max(Number(process.env.HKDPLUS_RECON_PAGE_SIZE) || 500, 50), 500);
const maxRows = Math.max(Number(process.env.HKDPLUS_RECON_MAX_ROWS) || 200000, 1000);

if (insecureTls && baseUrl.startsWith('https://')) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const findings = [];
const passed = [];
const now = new Date().toISOString();

const addFinding = (severity, code, title, detail, evidence = {}) => findings.push({ severity, code, title, detail, evidence });
const pass = (code, detail) => passed.push({ code, detail });
const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const round = (value) => Math.round(number(value) * 100) / 100;
const same = (left, right, tolerance = 0.01) => Math.abs(number(left) - number(right)) <= tolerance;
const effectiveDebt = (invoice) => Math.max(0, number(invoice?.debtAmount), number(invoice?.finalAmount) - number(invoice?.paidAmount));
const inRange = (value, from, to) => {
  const timestamp = new Date(value).getTime();
  const start = from ? new Date(`${from}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
  const end = to ? new Date(`${to}T23:59:59.999`).getTime() : Number.POSITIVE_INFINITY;
  return timestamp >= start && timestamp <= end;
};

const request = async (path, options = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${path} → ${response.status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  return body;
};

const listAll = async (path, options = {}) => {
  const rows = [];
  let offset = 0;
  let total = null;
  do {
    const separator = path.includes('?') ? '&' : '?';
    const page = await request(`${path}${separator}includeMeta=true&limit=${pageSize}&offset=${offset}`, options);
    const items = Array.isArray(page) ? page : (Array.isArray(page?.items) ? page.items : []);
    rows.push(...items);
    total = Array.isArray(page) ? rows.length : number(page.total);
    offset += items.length;
    if (!items.length || rows.length >= maxRows || (total !== null && rows.length >= total)) break;
  } while (true);
  return { rows: rows.slice(0, maxRows), total: total ?? rows.length, truncated: rows.length >= maxRows && (total ?? rows.length) > maxRows };
};

const main = async () => {
  if (!email || !password) throw new Error('Thiếu HKDPLUS_SMOKE_EMAIL và HKDPLUS_SMOKE_PASSWORD. Đây là kiểm tra đọc dữ liệu, không tự tạo hoặc sửa dữ liệu.');
  const health = await request('/api/health');
  pass('availability.health', `API health: ${health?.status || 'ok'}`);
  const login = await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  if (!login?.token) throw new Error('Đăng nhập kiểm tra đối soát thất bại.');
  const auth = { Authorization: `Bearer ${login.token}` };
  const from = process.env.HKDPLUS_RECON_FROM || '';
  const to = process.env.HKDPLUS_RECON_TO || '';
  const reportQuery = new URLSearchParams();
  if (from) reportQuery.set('from', from);
  if (to) reportQuery.set('to', to);
  const reportPath = `/api/reports/staff${reportQuery.toString() ? `?${reportQuery}` : ''}`;

  const [invoices, returns, customers, suppliers, purchases, cashbook, movements, debtLedger, payableLedger, products, productSummary, dashboard, report] = await Promise.all([
    listAll('/api/invoices', { headers: auth }),
    listAll('/api/sales-returns', { headers: auth }),
    listAll('/api/customers', { headers: auth }),
    listAll('/api/suppliers', { headers: auth }),
    listAll('/api/purchases', { headers: auth }),
    request('/api/cashbook', { headers: auth }),
    request('/api/stock-movements?all=true', { headers: auth }),
    request('/api/debt-ledger', { headers: auth }),
    request('/api/payable-ledger', { headers: auth }),
    listAll('/api/products?status=all', { headers: auth }),
    request('/api/products/summary', { headers: auth }),
    request('/api/dashboard/stats', { headers: auth }),
    request(reportPath, { headers: auth }),
  ].map((promise) => promise));

  const invoiceRows = invoices.rows.filter((row) => row.workflowStatus !== 'cancelled' && row.workflowStatus === 'closed' && inRange(row.createdAt, from, to));
  const returnRows = returns.rows.filter((row) => inRange(row.createdAt, from, to));
  const cashRows = cashbook.filter((row) => inRange(row.createdAt, from, to));
  const reportSales = (report.details || []).filter((row) => row.type === 'sale');
  const grossSales = invoiceRows.reduce((sum, row) => sum + number(row.finalAmount), 0);
  const paidSales = invoiceRows.reduce((sum, row) => sum + number(row.paidAmount), 0);
  const debtSales = invoiceRows.reduce((sum, row) => sum + effectiveDebt(row), 0);
  const returnAmount = returnRows.reduce((sum, row) => sum + number(row.totalAmount), 0);
  const refundAmount = returnRows.reduce((sum, row) => sum + number(row.refundAmount), 0);
  const cashIncome = cashRows.filter((row) => row.type === 'income').reduce((sum, row) => sum + number(row.amount), 0);
  const cashExpense = cashRows.filter((row) => row.type === 'expense').reduce((sum, row) => sum + number(row.amount), 0);
  const currentDebt = customers.rows.reduce((sum, row) => sum + Math.max(0, number(row.totalDebt)), 0);
  const debtLedgerNet = debtLedger.reduce((sum, row) => sum + (row.type === 'increase' ? number(row.amount) : -number(row.amount)), 0);
  const payableBySupplier = suppliers.rows.reduce((sum, row) => sum + Math.max(0, number(row.currentPayable)), 0);
  const payableLedgerNet = payableLedger.reduce((sum, row) => sum + (row.type === 'increase' ? number(row.amount) : -number(row.amount)), 0);

  if (number(report.summary?.invoiceCount) !== invoiceRows.length || reportSales.length !== invoiceRows.length) {
    addFinding('P1', 'REPORT_INVOICE_COUNT', 'Số hóa đơn giữa báo cáo và dữ liệu gốc không khớp', `Dữ liệu gốc ${invoiceRows.length}, chi tiết báo cáo ${reportSales.length}, summary ${number(report.summary?.invoiceCount)}.`, { invoiceRows: invoiceRows.length, reportSales: reportSales.length, reportSummary: report.summary?.invoiceCount });
  } else pass('report.invoice_count', `${invoiceRows.length} hóa đơn được đối chiếu theo kỳ.`);

  const reportValues = {
    revenue: number(report.summary?.revenue),
    collected: number(report.summary?.collected),
    receivable: number(report.summary?.receivable),
    cashIncome: number(report.summary?.cashIncome),
    cashExpense: number(report.summary?.cashExpense),
  };
  const expectedValues = {
    revenue: grossSales - returnAmount,
    collected: paidSales - refundAmount,
    receivable: debtSales,
    cashIncome,
    cashExpense,
  };
  for (const [key, expected] of Object.entries(expectedValues)) {
    if (!same(reportValues[key], expected)) addFinding('P1', `REPORT_${key.toUpperCase()}`, `Báo cáo lệch ${key}`, `Giá trị báo cáo ${round(reportValues[key])}, tính từ dữ liệu gốc ${round(expected)}.`, { report: reportValues[key], source: expected });
    else pass(`report.${key}`, `${round(expected)}.`);
  }

  const expectedPayment = invoiceRows.reduce((result, row) => {
    const label = row.paymentMethod === 'debt' ? 'Công nợ' : row.paymentMethod === 'transfer' ? 'Chuyển khoản' : row.paymentMethod === 'wallet' ? 'Ví điện tử' : 'Tiền mặt';
    result[label] = (result[label] || 0) + (row.paymentMethod === 'debt' ? effectiveDebt(row) : number(row.paidAmount));
    return result;
  }, {});
  const detailPayment = reportSales.reduce((result, row) => {
    const label = row.paymentMethod === 'debt' ? 'Công nợ' : row.paymentMethod === 'transfer' ? 'Chuyển khoản' : row.paymentMethod === 'wallet' ? 'Ví điện tử' : 'Tiền mặt';
    result[label] = (result[label] || 0) + (row.paymentMethod === 'debt' ? effectiveDebt(row) : number(row.paidAmount));
    return result;
  }, {});
  for (const label of new Set([...Object.keys(expectedPayment), ...Object.keys(detailPayment)])) {
    if (!same(expectedPayment[label], detailPayment[label])) addFinding('P1', 'PAYMENT_METHOD_TOTAL', `Lệch tổng theo phương thức ${label}`, `Dữ liệu gốc ${round(expectedPayment[label])}, chi tiết báo cáo ${round(detailPayment[label])}.`, { label, source: expectedPayment[label] || 0, report: detailPayment[label] || 0 });
  }
  if (Object.keys(expectedPayment).length === Object.keys(detailPayment).length && Object.keys(expectedPayment).every((label) => same(expectedPayment[label], detailPayment[label]))) pass('report.payment_methods', 'Tổng theo phương thức thanh toán khớp.');

  if (!same(currentDebt, report.summary?.currentCustomerDebt)) addFinding('P1', 'CUSTOMER_DEBT_TOTAL', 'Công nợ khách hàng không khớp báo cáo', `Tổng hồ sơ khách hàng ${round(currentDebt)}, báo cáo ${round(report.summary?.currentCustomerDebt)}.`, { customers: currentDebt, report: report.summary?.currentCustomerDebt });
  else pass('customer.debt_total', `${round(currentDebt)}.`);
  if (!same(currentDebt, dashboard.totalDebt)) addFinding('P1', 'DASHBOARD_DEBT_TOTAL', 'Công nợ tổng quan không khớp danh sách khách hàng', `Danh sách khách hàng ${round(currentDebt)}, dashboard ${round(dashboard.totalDebt)}.`, { customers: currentDebt, dashboard: dashboard.totalDebt });
  else pass('dashboard.debt_total', `${round(currentDebt)}.`);
  if (Math.abs(debtLedgerNet - currentDebt) > 0.01) addFinding('P2', 'DEBT_LEDGER_BALANCE', 'Sổ công nợ không giải thích được số dư khách hàng', `Tổng ledger ròng ${round(debtLedgerNet)}, số dư hồ sơ ${round(currentDebt)}. Có thể là số dư đầu kỳ/legacy chưa có chứng từ ledger.`, { ledger: debtLedgerNet, customers: currentDebt });
  else pass('debt.ledger_balance', `${round(currentDebt)}.`);

  if (!same(payableLedgerNet, payableBySupplier)) addFinding('P2', 'PAYABLE_LEDGER_BALANCE', 'Công nợ nhà cung cấp lệch sổ chi tiết', `Tổng ledger ròng ${round(payableLedgerNet)}, hồ sơ nhà cung cấp ${round(payableBySupplier)}.`, { ledger: payableLedgerNet, suppliers: payableBySupplier });
  else pass('payable.ledger_balance', `${round(payableBySupplier)}.`);

  const activeProductTotal = number(productSummary.total);
  if (activeProductTotal !== products.rows.filter((row) => row.status === 'active').length && !products.truncated) addFinding('P1', 'PRODUCT_SUMMARY_COUNT', 'Tổng hàng hóa không khớp danh sách', `Summary ${activeProductTotal}, danh sách active ${products.rows.filter((row) => row.status === 'active').length}.`, { summary: activeProductTotal, list: products.rows.length });
  else pass('product.summary_count', `${activeProductTotal} sản phẩm active.`);
  const productById = new Map(products.rows.map((row) => [row.id, row]));
  const movementsByProduct = new Map();
  for (const row of movements) {
    if (!row.productId || !row.createdAt || !productById.has(row.productId)) continue;
    const timestamp = new Date(row.createdAt).getTime();
    if (!Number.isFinite(timestamp)) continue;
    const current = movementsByProduct.get(row.productId);
    if (!current || timestamp > current.timestamp) movementsByProduct.set(row.productId, { timestamp, latest: [row] });
    else if (timestamp === current.timestamp) current.latest.push(row);
  }
  const movementMismatch = [];
  const ambiguousMovementOrder = [];
  for (const [productId, current] of movementsByProduct) {
    const latestBalances = new Set(current.latest.map((row) => round(row.afterStock)));
    if (latestBalances.size > 1) {
      ambiguousMovementOrder.push({ productId, timestamp: new Date(current.timestamp).toISOString(), afterStocks: [...latestBalances] });
      continue;
    }
    const product = productById.get(productId);
    const afterStock = current.latest[0]?.afterStock;
    if (!same(afterStock, product.stock)) movementMismatch.push({ productId, afterStock, currentStock: product.stock, movementAt: current.latest[0]?.createdAt });
  }
  if (movementMismatch.length) addFinding('P1', 'STOCK_MOVEMENT_CURRENT', 'Tồn hàng không khớp biến động kho mới nhất', `${movementMismatch.length} sản phẩm có tồn sau biến động mới nhất khác tồn hiện tại.`, { samples: movementMismatch.slice(0, 20) });
  else pass('stock.current_balance', 'Tồn hiện tại khớp biến động mới nhất theo sản phẩm.');
  if (ambiguousMovementOrder.length) addFinding('P2', 'STOCK_MOVEMENT_ORDER_AMBIGUOUS', 'Một số biến động kho không xác định được thứ tự cuối', `${ambiguousMovementOrder.length} sản phẩm có nhiều biến động cùng thời điểm nhưng số tồn sau giao dịch khác nhau; cần kiểm tra thứ tự ghi nhận trước khi kết luận.`, { samples: ambiguousMovementOrder.slice(0, 20) });

  if (invoices.truncated || customers.truncated || suppliers.truncated || purchases.truncated || products.truncated) addFinding('P2', 'RECON_TRUNCATED', 'Đối soát bị giới hạn số dòng', `Có endpoint vượt giới hạn ${maxRows}; chạy lại với HKDPLUS_RECON_MAX_ROWS lớn hơn để có kết luận đầy đủ.`, { maxRows });
  console.log(JSON.stringify({ ok: findings.filter((item) => item.severity === 'P0' || item.severity === 'P1').length === 0, baseUrl, from: from || null, to: to || null, counts: { invoices: invoiceRows.length, products: products.rows.length, customers: customers.rows.length, suppliers: suppliers.rows.length, purchases: purchases.rows.length, movements: movements.length }, passed: passed.length, findings: findings.length }, null, 2));

  const lines = [
    '# Findings đối soát liên module',
    '',
    `- Thời điểm chạy: ${now}`,
    `- API: ${baseUrl}`,
    `- Phạm vi ngày: ${from || 'đầu kỳ'} → ${to || 'hiện tại'}`,
    `- Số liệu đã đọc: ${invoiceRows.length} hóa đơn, ${products.rows.length} sản phẩm, ${customers.rows.length} khách hàng, ${suppliers.rows.length} nhà cung cấp, ${movements.length} biến động kho.`,
    '',
    `## Kết quả: ${findings.length ? `${findings.length} finding` : 'không có finding'}`,
    '',
  ];
  if (!findings.length) lines.push('Không phát hiện sai lệch P0/P1/P2 trong phạm vi kiểm tra.');
  else findings.forEach((item, index) => lines.push(`### ${index + 1}. [${item.severity}] ${item.title} (${item.code})`, '', item.detail, '', `Evidence: \`${JSON.stringify(item.evidence)}\``, ''));
  lines.push('## Các kiểm tra đã đạt', '', ...passed.map((item) => `- **${item.code}**: ${item.detail}`));
  const fs = await import('node:fs/promises');
  await fs.mkdir('docs', { recursive: true });
  await fs.writeFile('docs/reconciliation-findings.md', `${lines.join('\n')}\n`, 'utf8');
  if (findings.some((item) => item.severity === 'P0' || item.severity === 'P1') || (strict && findings.length)) process.exitCode = 1;
};

main().catch(async (error) => {
  addFinding('P0', 'RECON_RUN_FAILED', 'Không chạy được đối soát', error instanceof Error ? error.message : String(error));
  console.error(JSON.stringify({ ok: false, baseUrl, findings }, null, 2));
  const fs = await import('node:fs/promises');
  await fs.mkdir('docs', { recursive: true });
  await fs.writeFile('docs/reconciliation-findings.md', [
    '# Findings đối soát liên module',
    '',
    `- Thời điểm chạy: ${now}`,
    `- API: ${baseUrl}`,
    '',
    '## Kết quả',
    '',
    `- **[P0] RECON_RUN_FAILED**: ${error instanceof Error ? error.message : String(error)}`,
    '',
    'Không có dữ liệu nào được sửa trong lần chạy này.',
    '',
  ].join('\n'), 'utf8');
  process.exitCode = 1;
});
