const DEFAULT_DEV_API_BASE =
  typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}:3101`
    : 'http://localhost:3101';
const configuredApiBase = import.meta.env.VITE_API_URL as string | undefined;
const configuredApiUsesLoopback = Boolean(configuredApiBase && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(configuredApiBase.replace(/\/+$/, '')));
const browserUsesLanHost = typeof window !== 'undefined' && !['localhost', '127.0.0.1'].includes(window.location.hostname);
const API_BASE = configuredApiUsesLoopback && browserUsesLanHost
  ? DEFAULT_DEV_API_BASE
  : (configuredApiBase || DEFAULT_DEV_API_BASE);
const NORMALIZED_API_BASE = API_BASE.replace(/\/+$/, '');
const API_ROOT = NORMALIZED_API_BASE.endsWith('/api')
  ? NORMALIZED_API_BASE
  : `${NORMALIZED_API_BASE}/api`;
const USER_TOKEN_KEY = 'hkdplus_token';
const ADMIN_TOKEN_KEY = 'tdpos_admin_token';

interface RequestOptions {
  method?: string;
  body?: any;
  params?: Record<string, string>;
  admin?: boolean;
}

async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, params, admin = false } = options;

  let url = `${API_ROOT}${endpoint}`;
  if (params) {
    const searchParams = new URLSearchParams(
      Object.entries(params).filter(([_, v]) => v !== undefined && v !== '')
    );
    const qs = searchParams.toString();
    if (qs) url += `?${qs}`;
  }

  const token = localStorage.getItem(admin ? ADMIN_TOKEN_KEY : USER_TOKEN_KEY);
  const headers: Record<string, string> = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(error.error || `API error: ${res.status}`);
  }

  return res.json();
}

// ─── Tenants ───────────────────────────────────────────────
export const tenantsApi = {
  list: () => request<any[]>('/tenants'),
  get: (id: string) => request<any>(`/tenants/${id}`),
  update: (id: string, data: any) => request<any>(`/tenants/${id}`, { method: 'PATCH', body: data }),
};

// ─── Users ─────────────────────────────────────────────────
export const usersApi = {
  list: (tenantId?: string) => request<any[]>('/users', { params: { tenantId: tenantId || '' } }),
  get: (id: string) => request<any>(`/users/${id}`),
  create: (data: any) => request<any>('/users', { method: 'POST', body: data }),
  update: (id: string, data: any) => request<any>(`/users/${id}`, { method: 'PATCH', body: data }),
  delete: (id: string) => request<any>(`/users/${id}`, { method: 'DELETE' }),
};

export const permissionsApi = {
  list: () => request<any[]>('/permissions'),
  getForUser: (userId: string) => request<any[]>(`/users/${userId}/permissions`),
  saveForUser: (userId: string, permissions: Array<{ code: string; allowed: boolean }>) => request<any>(`/users/${userId}/permissions`, { method: 'PUT', body: { permissions } }),
};

export const rolesApi = {
  list: () => request<any[]>('/roles'),
  getPermissions: (code: string) => request<any[]>(`/roles/${encodeURIComponent(code)}/permissions`),
  create: (data: { code: string; name: string; description?: string; permissions?: Array<{ code: string; allowed: boolean }> }) => request<any>('/roles', { method: 'POST', body: data }),
  update: (code: string, data: { name?: string; description?: string }) => request<any>(`/roles/${encodeURIComponent(code)}`, { method: 'PATCH', body: data }),
  savePermissions: (code: string, permissions: Array<{ code: string; allowed: boolean }>) => request<any>(`/roles/${encodeURIComponent(code)}/permissions`, { method: 'PUT', body: { permissions } }),
  delete: (code: string) => request<any>(`/roles/${encodeURIComponent(code)}`, { method: 'DELETE' }),
};

// ─── Categories ────────────────────────────────────────────
export const categoriesApi = {
  list: (tenantId?: string) => request<any[]>('/categories', { params: { tenantId: tenantId || '' } }),
  create: (data: any) => request<any>('/categories', { method: 'POST', body: data }),
  update: (id: string, data: { name: string }) => request<any>(`/categories/${id}`, { method: 'PATCH', body: data }),
  remove: (id: string) => request<any>(`/categories/${id}`, { method: 'DELETE' }),
};

export const unitsApi = {
  list: () => request<any[]>('/units'),
  create: (data: { name: string }) => request<any>('/units', { method: 'POST', body: data }),
  update: (id: string, data: { name: string }) => request<any>(`/units/${id}`, { method: 'PATCH', body: data }),
  remove: (id: string) => request<any>(`/units/${id}`, { method: 'DELETE' }),
};

// ─── Products ──────────────────────────────────────────────
export const productsApi = {
  list: (tenantId?: string, filters?: { category?: string; search?: string }) =>
    request<any[]>('/products', { params: { tenantId: tenantId || '', ...filters } }),
  get: (id: string) => request<any>(`/products/${id}`),
  create: (data: any) => request<any>('/products', { method: 'POST', body: data }),
  update: (id: string, data: any) => request<any>(`/products/${id}`, { method: 'PATCH', body: data }),
  delete: (id: string) => request<any>(`/products/${id}`, { method: 'DELETE' }),
  adjustStock: (id: string, quantity: number, type: 'increase' | 'decrease', note?: string) =>
    request<any>(`/products/${id}/stock`, { method: 'POST', body: { quantity, type, note } }),
  lookup: (code: string) => request<any>(`/products/lookup`, { params: { code } }),
};

export const priceListsApi = {
  list: (includeItems = true) => request<any[]>('/price-lists', { params: { includeItems: String(includeItems) } }),
  get: (id: string) => request<any>(`/price-lists/${id}`),
  create: (data: any) => request<any>('/price-lists', { method: 'POST', body: data }),
  update: (id: string, data: any) => request<any>(`/price-lists/${id}`, { method: 'PATCH', body: data }),
  remove: (id: string) => request<any>(`/price-lists/${id}`, { method: 'DELETE' }),
  saveItems: (id: string, items: any[]) => request<any[]>(`/price-lists/${id}/items`, { method: 'PUT', body: { items } }),
};

export const productUnitsApi = {
  list: (productId: string) => request<any[]>(`/products/${productId}/units`),
  save: (productId: string, units: any[]) => request<any[]>(`/products/${productId}/units`, { method: 'PUT', body: { units } }),
};

export const productComponentsApi = {
  list: (productId: string) => request<any[]>(`/products/${productId}/components`),
  save: (productId: string, components: any[]) => request<any[]>(`/products/${productId}/components`, { method: 'PUT', body: { components } }),
};

// ─── Customers ─────────────────────────────────────────────
export const customersApi = {
  list: (tenantId?: string, search?: string) =>
    request<any[]>('/customers', { params: { tenantId: tenantId || '', search: search || '' } }),
  get: (id: string) => request<any>(`/customers/${id}`),
  create: (data: any) => request<any>('/customers', { method: 'POST', body: data }),
  update: (id: string, data: any) => request<any>(`/customers/${id}`, { method: 'PATCH', body: data }),
  adjustDebt: (id: string, amount: number, type: 'increase' | 'decrease') =>
    request<any>(`/customers/${id}/debt`, { method: 'POST', body: { amount, type } }),
};

export const suppliersApi = {
  list: (search?: string) => request<any[]>('/suppliers', { params: { search: search || '' } }),
  create: (data: any) => request<any>('/suppliers', { method: 'POST', body: data }),
  update: (id: string, data: any) => request<any>(`/suppliers/${id}`, { method: 'PATCH', body: data }),
};

export const purchasesApi = {
  list: () => request<any[]>('/purchases'),
  get: (id: string) => request<any>(`/purchases/${id}`),
  create: (data: any) => request<any>('/purchases', { method: 'POST', body: data }),
  returnable: (id: string) => request<any>(`/purchases/${id}/returnable`),
  returns: () => request<any[]>('/purchase-returns'),
  createReturn: (id: string, data: any) => request<any>(`/purchases/${id}/returns`, { method: 'POST', body: data }),
};

export const supplierCreditsApi = {
  list: (supplierId?: string) => request<any[]>('/supplier-credit-ledger', { params: { supplierId: supplierId || '' } }),
  settle: (supplierId: string, data: any) => request<any>(`/suppliers/${supplierId}/credit-settlement`, { method: 'POST', body: data }),
};

export const payableLedgerApi = {
  list: (supplierId?: string) => request<any[]>('/payable-ledger', { params: { supplierId: supplierId || '' } }),
  create: (data: any) => request<any>('/payable-ledger', { method: 'POST', body: data }),
};

export const systemApi = {
  status: () => request<any>('/system/status'),
  taxProfile: () => request<any>('/tax-profile'),
  updateTaxProfile: (data: any) => request<any>('/tax-profile', { method: 'PATCH', body: data }),
  documentSequences: () => request<any[]>('/document-sequences'),
};

export const backupsApi = {
  list: () => request<any[]>('/backups'),
  create: () => request<any>('/backups', { method: 'POST', body: {} }),
  restore: (backupId: string) => request<any>('/backups/restore', { method: 'POST', body: { backupId } }),
};

export const licenseApi = {
  status: () => request<any>('/license/status'),
  activate: (licenseToken: string) => request<any>('/license/activate', { method: 'POST', body: { licenseToken } }),
  refresh: () => request<any>('/license/refresh', { method: 'POST', body: {} }),
};

// ─── Invoices ──────────────────────────────────────────────
export const invoicesApi = {
  list: (tenantId?: string, filters?: { customerId?: string; status?: string }) =>
    request<any[]>('/invoices', { params: { tenantId: tenantId || '', ...filters } }),
  get: (id: string) => request<any>(`/invoices/${id}`),
  create: (data: any) => request<any>('/invoices', { method: 'POST', body: data }),
  update: (id: string, data: any) => request<any>(`/invoices/${id}`, { method: 'PATCH', body: data }),
  check: (id: string) => request<any>(`/invoices/${id}/check`, { method: 'POST', body: {} }),
  pick: (id: string, items: any[]) => request<any>(`/invoices/${id}/pick`, { method: 'POST', body: { items } }),
  close: (id: string) => request<any>(`/invoices/${id}/close`, { method: 'POST', body: {} }),
  cancel: (id: string, reason?: string) => request<any>(`/invoices/${id}/cancel`, { method: 'POST', body: { reason } }),
  timeline: (id: string) => request<any[]>(`/invoices/${id}/timeline`),
  returnable: (id: string) => request<any>(`/invoices/${id}/returnable`),
  returns: (invoiceId?: string) => request<any[]>('/sales-returns', { params: { invoiceId: invoiceId || '' } }),
  createReturn: (id: string, data: any) => request<any>(`/invoices/${id}/returns`, { method: 'POST', body: data }),
  createStandaloneReturn: (data: any) => request<any>('/sales-returns', { method: 'POST', body: data }),
};

export const cashAccountsApi = {
  list: () => request<any[]>('/cash-accounts'),
  create: (data: any) => request<any>('/cash-accounts', { method: 'POST', body: data }),
};

export const paymentsApi = {
  list: (customerId?: string) => request<any[]>('/payments', { params: { customerId: customerId || '' } }),
  get: (id: string) => request<any>(`/payments/${id}`),
  create: (data: any) => request<any>('/payments', { method: 'POST', body: data }),
  allocate: (id: string, allocations: Array<{ invoiceId: string; amount: number }>) => request<any>(`/payments/${id}/allocations`, { method: 'POST', body: { allocations } }),
};

export const cashbookApi = {
  list: (filters?: { from?: string; to?: string; type?: 'income' | 'expense' }) => request<any[]>('/cashbook', { params: { ...(filters || {}), _ts: String(Date.now()) } as any }),
  create: (data: { type: 'income' | 'expense'; amount: number; category?: string; note?: string; referenceId?: string | null; accountId?: string | null }) =>
    request<any>('/cashbook', { method: 'POST', body: data }),
};

export const reportsApi = {
  staff: (filters?: { from?: string; to?: string; userId?: string }) => request<any>('/reports/staff', { params: filters as any }),
};

export const stockMovementsApi = {
  list: (productId?: string) => request<any[]>('/stock-movements', { params: { productId: productId || '', _ts: String(Date.now()) } }),
  stockCheck: (productId: string, actualStock: number, note?: string) =>
    request<any>('/stock-check', { method: 'POST', body: { productId, actualStock, note } }),
};

// ─── Invoice Items ─────────────────────────────────────────
export const invoiceItemsApi = {
  list: (invoiceId: string) => request<any[]>('/invoice-items', { params: { invoiceId } }),
};

// ─── Debt Ledger ───────────────────────────────────────────
export const debtLedgerApi = {
  list: (tenantId?: string, customerId?: string) =>
    request<any[]>('/debt-ledger', { params: { tenantId: tenantId || '', customerId: customerId || '' } }),
  create: (data: any) => request<any>('/debt-ledger', { method: 'POST', body: data }),
};

export const customerCareApi = {
  list: (customerId?: string) =>
    request<any[]>('/customer-care-logs', { params: { customerId: customerId || '' } }),
  create: (data: any) => request<any>('/customer-care-logs', { method: 'POST', body: data }),
  update: (id: string, data: any) => request<any>(`/customer-care-logs/${id}`, { method: 'PATCH', body: data }),
};

// ─── Dashboard ─────────────────────────────────────────────
export const dashboardApi = {
  stats: (tenantId: string) => request<any>('/dashboard/stats', { params: { tenantId } }),
};

// ─── Auth (Tenant Login/Register) ──────────────────────────
export const authApi = {
  login: (email: string, password: string) =>
    request<any>('/auth/login', { method: 'POST', body: { email, password } }),
  register: (name: string, email: string, password: string, storeName: string) =>
    request<any>('/auth/register', { method: 'POST', body: { name, email, password, storeName } }),
  me: () => request<any>('/auth/me'),
  saveSession: (token: string) => localStorage.setItem(USER_TOKEN_KEY, token),
  clearSession: () => localStorage.removeItem(USER_TOKEN_KEY),
  getToken: () => localStorage.getItem(USER_TOKEN_KEY),
};

// ─── Admin API ─────────────────────────────────────────────
export const adminApi = {
  login: (email: string, password: string) =>
    request<any>('/admin/login', { method: 'POST', body: { email, password }, admin: true }),
  me: () => request<any>('/admin/me', { admin: true }),
  stats: () => request<any>('/admin/stats', { admin: true }),
  saveSession: (token: string) => localStorage.setItem(ADMIN_TOKEN_KEY, token),
  clearSession: () => localStorage.removeItem(ADMIN_TOKEN_KEY),
  getToken: () => localStorage.getItem(ADMIN_TOKEN_KEY),
  tenants: {
    list: (filters?: { search?: string; status?: string }) =>
      request<any[]>('/admin/tenants', { params: filters as any, admin: true }),
    get: (id: string) => request<any>(`/admin/tenants/${id}`, { admin: true }),
    create: (data: { tenant: any; owner?: any }) =>
      request<any>('/admin/tenants', { method: 'POST', body: data, admin: true }),
    update: (id: string, data: any) =>
      request<any>(`/admin/tenants/${id}`, { method: 'PATCH', body: data, admin: true }),
    setStatus: (id: string, status: string) =>
      request<any>(`/admin/tenants/${id}/status`, { method: 'POST', body: { status }, admin: true }),
    delete: (id: string) =>
      request<any>(`/admin/tenants/${id}`, { method: 'DELETE', admin: true }),
  },
  subscriptions: {
    list: (filters?: { status?: string }) =>
      request<any[]>('/admin/subscriptions', { params: filters as any, admin: true }),
    review: (tenantId: string, decision: 'approve' | 'reject', note?: string) =>
      request<any>(`/admin/subscriptions/${tenantId}/review`, { method: 'POST', body: { decision, note }, admin: true }),
    renew: (tenantId: string) =>
      request<any>(`/admin/subscriptions/${tenantId}/renew`, { method: 'POST', admin: true }),
  },
  packages: {
    list: () => request<any[]>('/admin/packages', { admin: true }),
    create: (data: any) => request<any>('/admin/packages', { method: 'POST', body: data, admin: true }),
    update: (id: string, data: any) => request<any>(`/admin/packages/${id}`, { method: 'PATCH', body: data, admin: true }),
    delete: (id: string) => request<any>(`/admin/packages/${id}`, { method: 'DELETE', admin: true }),
  },
  auditLogs: {
    list: (filters?: { tenantId?: string; limit?: string }) =>
      request<any[]>('/admin/audit-logs', { params: filters as any, admin: true }),
  },
  users: {
    list: (tenantId?: string, search?: string) =>
      request<any[]>('/admin/users', { params: { tenantId: tenantId || '', search: search || '' }, admin: true }),
    create: (data: any) => request<any>('/admin/users', { method: 'POST', body: data, admin: true }),
    update: (id: string, data: any) => request<any>(`/admin/users/${id}`, { method: 'PATCH', body: data, admin: true }),
    delete: (id: string) => request<any>(`/admin/users/${id}`, { method: 'DELETE', admin: true }),
  },
};
