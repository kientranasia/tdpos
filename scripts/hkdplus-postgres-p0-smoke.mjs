const baseUrl = (process.env.HKDPLUS_BASE_URL || 'http://127.0.0.1:6688').replace(/\/$/, '');
const adminEmail = process.env.ADMIN_BOOTSTRAP_EMAIL || 'admin@hkdplus.local';
const adminPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD || 'HkdplusLocal!2026';
const suffix = `${Date.now()}`;

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

const login = async (path, email, password) => {
  const result = await request(path, { method: 'POST', body: JSON.stringify({ email, password }) });
  assert(result.response.ok && result.body?.token, `Login failed: ${JSON.stringify(result.body)}`);
  return { Authorization: `Bearer ${result.body.token}` };
};

let adminAuth;
let tenantId;
try {
  const ready = await request('/api/ready');
  assert(ready.response.ok && ready.body?.database === 'ok', `Readiness failed: ${JSON.stringify(ready.body)}`);
  adminAuth = await login('/api/admin/login', adminEmail, adminPassword);
  const ownerEmail = `p0-${suffix}@example.com`;
  const created = await request('/api/admin/tenants', {
    method: 'POST',
    headers: adminAuth,
    body: JSON.stringify({
      tenant: { name: `P0 PostgreSQL ${suffix}`, address: '', phone: '' },
      owner: { name: 'P0 Owner', email: ownerEmail, password: 'P0OwnerSmoke123!' },
    }),
  });
  assert(created.response.status === 201, `Tenant creation failed: ${JSON.stringify(created.body)}`);
  tenantId = created.body.id;
  const ownerAuth = await login('/api/auth/login', ownerEmail, 'P0OwnerSmoke123!');

  const endpoints = ['/api/products', '/api/customers', '/api/suppliers', '/api/invoices', '/api/purchases'];
  const paged = await Promise.all(endpoints.map((endpoint) => request(`${endpoint}?includeMeta=true&limit=10&offset=0`, { headers: ownerAuth })));
  paged.forEach((result, index) => {
    assert(result.response.ok, `${endpoints[index]} failed: ${JSON.stringify(result.body)}`);
    assert(Array.isArray(result.body?.items), `${endpoints[index]} did not return paged items`);
    assert(Number.isInteger(result.body?.total), `${endpoints[index]} did not return total`);
    assert(result.body.limit === 10 && result.body.offset === 0, `${endpoints[index]} returned invalid page metadata`);
  });

  const createdCustomers = await Promise.all(Array.from({ length: 6 }, (_, index) => request('/api/customers', {
    method: 'POST',
    headers: ownerAuth,
    body: JSON.stringify({ name: `P0 Customer ${index}`, phone: `090000${index}${suffix.slice(-4)}` }),
  })));
  createdCustomers.forEach((result) => assert(result.response.status === 201, `Concurrent customer creation failed: ${JSON.stringify(result.body)}`));
  const codes = createdCustomers.map((result) => result.body.code);
  assert(new Set(codes).size === codes.length, `Document sequence generated duplicate customer codes: ${codes.join(', ')}`);

  console.log(JSON.stringify({
    ok: true,
    provider: 'postgres',
    readiness: true,
    pagedEndpoints: endpoints.length,
    concurrentCustomerCodes: codes,
  }));
} finally {
  if (adminAuth && tenantId) {
    try { await request(`/api/admin/tenants/${tenantId}`, { method: 'DELETE', headers: adminAuth }); } catch { /* cleanup is best effort */ }
  }
}
