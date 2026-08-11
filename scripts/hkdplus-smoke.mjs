const baseUrl = (process.env.HKDPLUS_BASE_URL || 'http://localhost:3101').replace(/\/$/, '');
const email = process.env.HKDPLUS_SMOKE_EMAIL || 'owner@hkdplus.local';
const password = process.env.HKDPLUS_SMOKE_PASSWORD || '123456';

const request = async (path, options = {}) => {
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  let body = null;
  try { body = await response.json(); } catch { /* health and proxy checks may have no JSON body */ }
  return { response, body };
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const waitForHealth = async () => {
  let lastError;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const result = await request('/api/health');
      if (result.response.ok && result.body?.status === 'ok') return result;
    } catch (error) { lastError = error; }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw lastError || new Error('Health endpoint did not become ready');
};

const health = await waitForHealth();
assert(health.response.ok && health.body?.status === 'ok', 'Health check failed');

const login = await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
assert(login.response.ok && login.body?.token, 'Demo login failed');
const auth = { Authorization: `Bearer ${login.body.token}` };

const [status, permissions, taxProfile, sequences, subscription, packages] = await Promise.all([
  request('/api/system/status', { headers: auth }),
  request('/api/permissions', { headers: auth }),
  request('/api/tax-profile', { headers: auth }),
  request('/api/document-sequences', { headers: auth }),
  request('/api/subscriptions/me', { headers: auth }),
  request('/api/packages', { headers: auth }),
]);

assert(status.response.ok && status.body?.product === 'HKDCare', 'HKDCare system status failed');
assert(status.body?.database === 'SQLite', 'SQLite status missing');
assert(permissions.response.ok && permissions.body.some((item) => item.code === 'sales.create'), 'RBAC permissions missing');
assert(taxProfile.response.ok && sequences.response.ok, 'Tax/document readiness endpoints failed');
assert(subscription.response.status === 410 && packages.response.status === 410, 'Legacy billing routes are not deprecated');
const backup = await request('/api/backups', { method: 'POST', headers: auth, body: JSON.stringify({}) });
assert(backup.response.status === 201 && backup.body?.id, 'Backup creation failed');

console.log(JSON.stringify({
  ok: true,
  baseUrl,
  product: status.body.product,
  localUrl: status.body.localUrl,
  license: status.body.license?.status,
  permissionCount: permissions.body.length,
  documentSequenceCount: sequences.body.length,
}));
