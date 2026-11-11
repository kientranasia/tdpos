import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const baseUrl = (process.env.HKDPLUS_BASE_URL || 'http://localhost:3101').replace(/\/$/, '');
const ownerEmail = process.env.HKDPLUS_SMOKE_EMAIL;
const ownerPassword = process.env.HKDPLUS_SMOKE_PASSWORD;
if (!ownerEmail || !ownerPassword) throw new Error('Set HKDPLUS_SMOKE_EMAIL and HKDPLUS_SMOKE_PASSWORD before running the permissions smoke test.');
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

const login = async (email, password) => {
  const result = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  assert(result.response.ok && result.body?.token, `Đăng nhập thất bại cho ${email}: ${JSON.stringify(result.body)}`);
  return { Authorization: `Bearer ${result.body.token}` };
};

const createdUsers = [];
const cleanup = () => {
  const db = new Database(dbPath);
  db.pragma('foreign_keys = OFF');
  for (const user of createdUsers) {
    db.prepare('DELETE FROM user_permissions WHERE user_id = ?').run(user.id);
    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
  }
  db.close();
};

const ownerAuth = await login(ownerEmail, ownerPassword);

try {
  const roles = ['manager', 'cashier', 'warehouse', 'accountant'];
  const authByRole = { owner: ownerAuth };
  for (const role of roles) {
    const email = `permissions-${role}-${Date.now()}@hkdplus.local`;
    const result = await request('/api/users', {
      method: 'POST',
      headers: ownerAuth,
      body: JSON.stringify({
        name: `Permission smoke ${role}`,
        email,
        password: 'PermissionSmoke123!',
        role,
        status: 'active',
      }),
    });
    assert(result.response.status === 201, `Không tạo được user test ${role}: ${JSON.stringify(result.body)}`);
    createdUsers.push(result.body);
    authByRole[role] = await login(email, 'PermissionSmoke123!');
  }

  const permissionExpectations = {
    owner: ['inventory.delete', 'sales.create', 'cashbook.create', 'reports.export', 'settings.manage_permissions'],
    manager: ['inventory.delete', 'sales.create', 'cashbook.create', 'reports.export'],
    cashier: ['sales.view', 'sales.create', 'partners.view'],
    warehouse: ['inventory.view', 'inventory.create', 'inventory.adjust', 'purchases.create'],
    accountant: ['cashbook.view', 'cashbook.create', 'debt.collect', 'reports.export'],
  };
  for (const [role, expectedCodes] of Object.entries(permissionExpectations)) {
    const result = await request('/api/permissions', { headers: authByRole[role] });
    assert(result.response.ok, `Không tải được quyền của ${role}`);
    const allowed = new Set(result.body.filter((permission) => permission.allowed).map((permission) => permission.code));
    for (const code of expectedCodes) assert(allowed.has(code), `${role} thiếu quyền ${code}`);
  }

  const expectStatus = async (role, path, expectedStatus) => {
    const result = await request(path, { headers: authByRole[role] });
    assert(result.response.status === expectedStatus, `${role} ${path}: cần ${expectedStatus}, nhận ${result.response.status} (${JSON.stringify(result.body)})`);
  };

  const allow = {
    owner: ['/api/products', '/api/invoices', '/api/purchases', '/api/cashbook', '/api/reports/staff', '/api/users', '/api/roles', '/api/stock-movements', '/api/debt-ledger'],
    manager: ['/api/products', '/api/invoices', '/api/purchases', '/api/cashbook', '/api/reports/staff', '/api/stock-movements', '/api/debt-ledger'],
    cashier: ['/api/invoices', '/api/customers'],
    warehouse: ['/api/products', '/api/purchases', '/api/suppliers', '/api/stock-movements'],
    accountant: ['/api/purchases', '/api/cashbook', '/api/reports/staff', '/api/debt-ledger', '/api/suppliers'],
  };
  const deny = {
    manager: ['/api/users', '/api/roles'],
    cashier: ['/api/purchases', '/api/cashbook', '/api/reports/staff', '/api/users', '/api/roles'],
    warehouse: ['/api/invoices', '/api/cashbook', '/api/reports/staff', '/api/users', '/api/roles', '/api/debt-ledger'],
    accountant: ['/api/invoices', '/api/users', '/api/roles'],
  };

  for (const [role, paths] of Object.entries(allow)) {
    for (const path of paths) await expectStatus(role, path, 200);
  }
  for (const [role, paths] of Object.entries(deny)) {
    for (const path of paths) await expectStatus(role, path, 403);
  }

  const cashier = createdUsers.find((user) => user.role === 'cashier');
  assert(cashier, 'Không tìm thấy cashier test');
  await expectStatus('cashier', '/api/stock-movements', 403);
  const grantInventoryView = await request(`/api/users/${cashier.id}/permissions`, {
    method: 'PUT',
    headers: ownerAuth,
    body: JSON.stringify({ permissions: [{ code: 'inventory.view', allowed: true }] }),
  });
  assert(grantInventoryView.response.ok, `Không cấp override inventory.view: ${JSON.stringify(grantInventoryView.body)}`);
  authByRole.cashier = await login(cashier.email, 'PermissionSmoke123!');
  await expectStatus('cashier', '/api/stock-movements', 200);
  const revokeInventoryView = await request(`/api/users/${cashier.id}/permissions`, {
    method: 'PUT',
    headers: ownerAuth,
    body: JSON.stringify({ permissions: [{ code: 'inventory.view', allowed: false }] }),
  });
  assert(revokeInventoryView.response.ok, `Không thu hồi override inventory.view: ${JSON.stringify(revokeInventoryView.body)}`);
  authByRole.cashier = await login(cashier.email, 'PermissionSmoke123!');
  await expectStatus('cashier', '/api/stock-movements', 403);

  const inactiveEmail = `permissions-inactive-${Date.now()}@hkdplus.local`;
  const inactive = await request('/api/users', {
    method: 'POST',
    headers: ownerAuth,
    body: JSON.stringify({ name: 'Permission smoke inactive', email: inactiveEmail, password: 'PermissionSmoke123!', role: 'cashier', status: 'inactive' }),
  });
  assert(inactive.response.status === 201, `Không tạo được user inactive test: ${JSON.stringify(inactive.body)}`);
  createdUsers.push(inactive.body);
  const inactiveLogin = await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: inactiveEmail, password: 'PermissionSmoke123!' }) });
  assert(inactiveLogin.response.status === 403, `User inactive vẫn đăng nhập được: ${inactiveLogin.response.status}`);

  console.log(JSON.stringify({
    ok: true,
    roles: Object.keys(authByRole),
    allowChecks: Object.values(allow).reduce((total, paths) => total + paths.length, 0),
    denyChecks: Object.values(deny).reduce((total, paths) => total + paths.length, 0),
    overrideChecks: 3,
    inactiveUserCheck: true,
  }));
} finally {
  cleanup();
}
