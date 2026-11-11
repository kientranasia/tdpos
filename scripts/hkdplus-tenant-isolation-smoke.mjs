import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const root = process.cwd();
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hkdplus-saas-'));
const port = 3197;
const env = {
  ...process.env,
  NODE_ENV: 'test',
  HKDPLUS_DATA_DIR: dataDir,
  API_PORT: String(port),
  OFFLINE_MODE: 'false',
  DATABASE_MODE: 'per_tenant',
  ENABLE_PLATFORM_ADMIN: 'true',
  ADMIN_BOOTSTRAP_EMAIL: 'platform-smoke@example.com',
  ADMIN_BOOTSTRAP_PASSWORD: 'PlatformSmoke123!',
  JWT_SECRET: 'tenant-isolation-smoke-jwt-secret-1234567890',
  HKDPLUS_INSTANCE_SECRET: 'tenant-isolation-smoke-instance-secret-1234567890',
  HKDPLUS_SETUP_TOKEN: 'tenant-isolation-smoke-setup-token-1234567890',
};

const runInit = spawnSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'server/seed.ts'], {
  cwd: root,
  env,
  encoding: 'utf8',
});
if (runInit.status !== 0) throw new Error(`Database initialization failed:\n${runInit.stdout}\n${runInit.stderr}`);

const server = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'server/index.ts'], {
  cwd: root,
  env,
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverOutput = '';
server.stdout.on('data', (chunk) => { serverOutput += chunk.toString(); });
server.stderr.on('data', (chunk) => { serverOutput += chunk.toString(); });

const baseUrl = `http://127.0.0.1:${port}`;
const request = async (requestPath, options = {}) => {
  const response = await fetch(`${baseUrl}${requestPath}`, {
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
const waitForHealth = async () => {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const result = await request('/api/health');
      if (result.response.ok) return;
    } catch { /* server is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Server did not become ready. Output:\n${serverOutput}`);
};
const login = async (email, password, admin = false) => {
  const result = await request(admin ? '/api/admin/login' : '/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  assert(result.response.ok && result.body?.token, `Login failed for ${email}: ${JSON.stringify(result.body)}`);
  return { Authorization: `Bearer ${result.body.token}` };
};

try {
  await waitForHealth();
  const adminAuth = await login(env.ADMIN_BOOTSTRAP_EMAIL, env.ADMIN_BOOTSTRAP_PASSWORD, true);
  const createTenant = async (suffix) => {
    const result = await request('/api/admin/tenants', {
      method: 'POST',
      headers: adminAuth,
      body: JSON.stringify({
        tenant: { name: `Isolation ${suffix}`, address: '', phone: '' },
        owner: { name: `Owner ${suffix}`, email: `owner-${suffix.toLowerCase()}@example.com`, password: 'OwnerSmoke123!' },
      }),
    });
    assert(result.response.status === 201, `Tenant ${suffix} creation failed: ${JSON.stringify(result.body)}`);
    assert(result.body?.databaseStatus === 'ready', `Tenant ${suffix} was not provisioned: ${JSON.stringify(result.body)}`);
    return { id: result.body.id, email: `owner-${suffix.toLowerCase()}@example.com` };
  };

  const tenantA = await createTenant('A');
  const tenantB = await createTenant('B');
  const authA = await login(tenantA.email, 'OwnerSmoke123!');
  const authB = await login(tenantB.email, 'OwnerSmoke123!');

  const createProduct = await request('/api/products', {
    method: 'POST',
    headers: authA,
    body: JSON.stringify({ name: 'Only Tenant A', sku: 'TENANT-A-001', category: 'Test', unit: 'Cái', purchasePrice: 10, sellingPrice: 20 }),
  });
  assert(createProduct.response.status === 201, `Tenant A product creation failed: ${JSON.stringify(createProduct.body)}`);

  const productsA = await request('/api/products?search=TENANT-A-001', { headers: authA });
  const productsB = await request('/api/products?search=TENANT-A-001', { headers: authB });
  assert(productsA.response.ok && productsA.body?.some((item) => item.sku === 'TENANT-A-001'), 'Tenant A cannot see its own product');
  assert(productsB.response.ok && !productsB.body?.some((item) => item.sku === 'TENANT-A-001'), 'Tenant B can see Tenant A product');

  const control = new Database(path.join(dataDir, 'tdpos.db'));
  const statusRows = control.prepare('SELECT id, database_status, database_key FROM tenants WHERE id IN (?, ?) ORDER BY id').all(tenantA.id, tenantB.id);
  assert(statusRows.length === 2 && statusRows.every((row) => row.database_status === 'ready' && row.database_key), `Control database status invalid: ${JSON.stringify(statusRows)}`);
  for (const tenant of [tenantA, tenantB]) {
    const key = crypto.createHash('sha256').update(tenant.id).digest('hex').slice(0, 32);
    const tenantDb = new Database(path.join(dataDir, 'tenants', `tenant-${key}.db`), { readonly: true });
    const row = tenantDb.prepare('SELECT COUNT(*) AS count FROM products WHERE sku = ?').get('TENANT-A-001');
    if (tenant.id === tenantA.id) assert(row.count === 1, 'Tenant A database is missing its product');
    if (tenant.id === tenantB.id) assert(row.count === 0, 'Tenant B database contains Tenant A product');
    tenantDb.close();
  }
  control.close();
  console.log(JSON.stringify({ ok: true, tenants: 2, isolatedSku: 'TENANT-A-001', mode: 'per_tenant' }));
} finally {
  server.kill('SIGTERM');
  fs.rmSync(dataDir, { recursive: true, force: true });
}
