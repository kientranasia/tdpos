const DEFAULT_DEV_API_BASE =
  typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}:3101`
    : 'http://localhost:3101';
const API_BASE = import.meta.env.VITE_API_URL || DEFAULT_DEV_API_BASE;
const NORMALIZED_API_BASE = API_BASE.replace(/\/+$/, '');
const API_ROOT = NORMALIZED_API_BASE.endsWith('/api')
  ? NORMALIZED_API_BASE
  : `${NORMALIZED_API_BASE}/api`;
const USER_TOKEN_KEY = 'tdpos_token';
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

// ─── Categories ────────────────────────────────────────────
export const categoriesApi = {
  list: (tenantId?: string) => request<any[]>('/categories', { params: { tenantId: tenantId || '' } }),
  create: (data: any) => request<any>('/categories', { method: 'POST', body: data }),
};

// ─── Products ──────────────────────────────────────────────
export const productsApi = {
  list: (tenantId?: string, filters?: { category?: string; search?: string }) =>
    request<any[]>('/products', { params: { tenantId: tenantId || '', ...filters } }),
  get: (id: string) => request<any>(`/products/${id}`),
  create: (data: any) => request<any>('/products', { method: 'POST', body: data }),
  update: (id: string, data: any) => request<any>(`/products/${id}`, { method: 'PATCH', body: data }),
  delete: (id: string) => request<any>(`/products/${id}`, { method: 'DELETE' }),
  adjustStock: (id: string, quantity: number, type: 'increase' | 'decrease') =>
    request<any>(`/products/${id}/stock`, { method: 'POST', body: { quantity, type } }),
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

// ─── Invoices ──────────────────────────────────────────────
export const invoicesApi = {
  list: (tenantId?: string, filters?: { customerId?: string; status?: string }) =>
    request<any[]>('/invoices', { params: { tenantId: tenantId || '', ...filters } }),
  get: (id: string) => request<any>(`/invoices/${id}`),
  create: (data: any) => request<any>('/invoices', { method: 'POST', body: data }),
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
