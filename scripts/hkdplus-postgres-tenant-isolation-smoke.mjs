const baseUrl = (process.env.HKDPLUS_BASE_URL || 'http://127.0.0.1:16666').replace(/\/$/, '');
const adminEmail = process.env.ADMIN_BOOTSTRAP_EMAIL || 'pg-isolation-admin@example.com';
const adminPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD || 'PgIsolationAdmin123!';
const suffix = `${Date.now()}`;
const createdTenantIds = [];

const request = async (requestPath, options = {}) => {
  const response = await fetch(`${baseUrl}${requestPath}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  let body = null;
  try { body = await response.json(); } catch { /* health and empty responses */ }
  return { response, body };
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const waitForHealth = async () => {
  let lastError;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const result = await request('/api/health');
      if (result.response.ok && result.body?.status === 'ok') return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw lastError || new Error('PostgreSQL SaaS health check timed out');
};

const login = async (email, password, admin = false) => {
  const result = await request(admin ? '/api/admin/login' : '/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  assert(result.response.ok && result.body?.token, `Login failed for ${email}: ${JSON.stringify(result.body)}`);
  return { Authorization: `Bearer ${result.body.token}` };
};

let adminAuth;
try {
  await waitForHealth();
  adminAuth = await login(adminEmail, adminPassword, true);

  const createTenant = async (label) => {
    const email = `pg-isolation-${label.toLowerCase()}-${suffix}@example.com`;
    const result = await request('/api/admin/tenants', {
      method: 'POST',
      headers: adminAuth,
      body: JSON.stringify({
        tenant: { name: `PostgreSQL Isolation ${label} ${suffix}`, address: '', phone: '' },
        owner: { name: `Owner ${label}`, email, password: 'PgOwnerSmoke123!' },
      }),
    });
    assert(result.response.status === 201, `Tenant ${label} creation failed: ${JSON.stringify(result.body)}`);
    assert(result.body?.databaseStatus === 'shared', `Unexpected database mode for ${label}: ${JSON.stringify(result.body)}`);
    createdTenantIds.push(result.body.id);
    return { id: result.body.id, email };
  };

  const tenantA = await createTenant('A');
  const tenantB = await createTenant('B');
  const authA = await login(tenantA.email, 'PgOwnerSmoke123!');
  const authB = await login(tenantB.email, 'PgOwnerSmoke123!');

  const productA = await request('/api/products', {
    method: 'POST',
    headers: authA,
    body: JSON.stringify({ name: 'PostgreSQL Tenant A Product', sku: `PG-A-${suffix}`, category: 'Smoke', unit: 'Cái', purchasePrice: 10, sellingPrice: 20 }),
  });
  assert(productA.response.status === 201, `Tenant A product creation failed: ${JSON.stringify(productA.body)}`);

  const productB = await request('/api/products', {
    method: 'POST',
    headers: authB,
    body: JSON.stringify({ name: 'PostgreSQL Tenant B Product', sku: `PG-B-${suffix}`, category: 'Smoke', unit: 'Cái', purchasePrice: 11, sellingPrice: 22 }),
  });
  assert(productB.response.status === 201, `Tenant B product creation failed: ${JSON.stringify(productB.body)}`);

  const [productsA, productsB, crossTenantRead, crossTenantUpdate, stats, database] = await Promise.all([
    request(`/api/products?search=PG-A-${suffix}`, { headers: authA }),
    request(`/api/products?search=PG-A-${suffix}`, { headers: authB }),
    request(`/api/products/${productA.body.id}`, { headers: authB }),
    request(`/api/products/${productA.body.id}`, {
      method: 'PATCH',
      headers: authB,
      body: JSON.stringify({ name: 'Should not cross tenant' }),
    }),
    request('/api/admin/stats', { headers: adminAuth }),
    request(`/api/admin/tenants/${tenantA.id}/database`, { headers: adminAuth }),
  ]);

  assert(productsA.response.ok && productsA.body?.some((item) => item.sku === `PG-A-${suffix}`), 'Tenant A cannot see its own PostgreSQL product');
  assert(productsB.response.ok && !productsB.body?.some((item) => item.sku === `PG-A-${suffix}`), 'Tenant B can see Tenant A PostgreSQL product');
  assert(crossTenantRead.response.status === 404, `Cross-tenant product read was not blocked: ${JSON.stringify(crossTenantRead.body)}`);
  assert(crossTenantUpdate.response.status === 404, `Cross-tenant product update was not blocked: ${JSON.stringify(crossTenantUpdate.body)}`);
  assert(stats.response.ok && stats.body?.databaseMode === 'shared' && stats.body.totalProducts >= 2, `Admin PostgreSQL stats invalid: ${JSON.stringify(stats.body)}`);
  assert(database.response.ok && database.body?.mode === 'shared' && database.body?.integrity === 'ok', `PostgreSQL tenant database status invalid: ${JSON.stringify(database.body)}`);

  console.log(JSON.stringify({
    ok: true,
    provider: 'postgres',
    mode: 'shared',
    tenants: 2,
    isolatedSku: `PG-A-${suffix}`,
    crossTenantReadStatus: crossTenantRead.response.status,
    crossTenantUpdateStatus: crossTenantUpdate.response.status,
    adminStats: true,
  }));
} finally {
  if (adminAuth) {
    for (const tenantId of createdTenantIds) {
      try {
        await request(`/api/admin/tenants/${tenantId}`, { method: 'DELETE', headers: adminAuth });
      } catch { /* cleanup is best effort; the smoke result remains authoritative */ }
    }
  }
}
