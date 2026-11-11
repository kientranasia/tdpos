import express, { Request, Response, NextFunction } from 'express';
import { db } from './db';
import * as schema from './schema';
import { eq, sql, desc } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from './runtimeConfig';
import { MIN_PASSWORD_LENGTH } from './runtimeConfig';

const router = express.Router();
const MONTHLY_SUBSCRIPTION_PRICE = 150000;
const normalizeSearchText = (value: unknown) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/Đ/g, 'D')
  .toLowerCase()
  .trim();
const safeEmail = (value: unknown) => String(value || '').trim().toLowerCase();
const isValidPassword = (value: unknown) => typeof value === 'string' && value.length >= MIN_PASSWORD_LENGTH;
type LoginAttempt = { failures: number; firstFailureAt: number; blockedUntil: number };
const loginAttempts = new Map<string, LoginAttempt>();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_BLOCK_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 8;
const loginAttemptKey = (req: Request, email: string) => `admin:${req.ip || 'unknown'}:${email}`;
const isLoginBlocked = (key: string) => {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry) return false;
  if (entry.blockedUntil > now) return true;
  if (entry.firstFailureAt + LOGIN_WINDOW_MS <= now) loginAttempts.delete(key);
  return false;
};
const recordLoginFailure = (key: string) => {
  const now = Date.now();
  const existing = loginAttempts.get(key);
  const entry = !existing || existing.firstFailureAt + LOGIN_WINDOW_MS <= now
    ? { failures: 1, firstFailureAt: now, blockedUntil: 0 }
    : { ...existing, failures: existing.failures + 1 };
  if (entry.failures >= LOGIN_MAX_FAILURES) entry.blockedUntil = now + LOGIN_BLOCK_MS;
  loginAttempts.set(key, entry);
};
const clearLoginFailures = (key: string) => loginAttempts.delete(key);

const redactSensitiveMeta = (value: Record<string, unknown>) => Object.fromEntries(
  Object.entries(value || {}).map(([key, entry]) => [key, /password|token|secret|credential/i.test(key) ? '[REDACTED]' : entry]),
);

const writeAuditLog = (adminId: string, action: string, entityType: string, entityId: string, tenantId?: string, meta?: Record<string, unknown>) => {
  db.insert(schema.auditLogs).values({
    id: uuid(),
    actorType: 'admin',
    actorId: adminId,
    action,
    entityType,
    entityId,
    tenantId: tenantId || null,
    meta: meta ? JSON.stringify(redactSensitiveMeta(meta)) : null,
    createdAt: new Date().toISOString(),
  }).run();
};

// Admin Auth Middleware
const authenticateAdmin = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as any;
    if (decoded.type !== 'admin' || !decoded.id || !decoded.sessionVersion) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const admin = db.select().from(schema.adminUsers).where(eq(schema.adminUsers.id, decoded.id)).get();
    if (!admin || admin.status !== 'active' || Number(decoded.sessionVersion) !== Number(admin.sessionVersion || 1)) {
      return res.status(401).json({ error: 'Phiên quản trị không còn hiệu lực' });
    }
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// ═══════════════════════════════════════════════════════════
// ADMIN AUTH
// ═══════════════════════════════════════════════════════════

// Simple admin login (in production, use JWT + bcrypt)
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    const attemptKey = loginAttemptKey(req, email);
    if (isLoginBlocked(attemptKey)) return res.status(429).json({ error: 'Tài khoản hoặc địa chỉ mạng tạm thời bị giới hạn đăng nhập. Vui lòng thử lại sau.' });

    const admin = db.select().from(schema.adminUsers)
      .where(eq(schema.adminUsers.email, email))
      .get();

    if (!admin) {
      recordLoginFailure(attemptKey);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      recordLoginFailure(attemptKey);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (admin.status !== 'active') {
      recordLoginFailure(attemptKey);
      return res.status(403).json({ error: 'Account is disabled' });
    }
    clearLoginFailures(attemptKey);

    // Create JWT
    const token = jwt.sign(
      { id: admin.id, email: admin.email, role: admin.role, type: 'admin', sessionVersion: admin.sessionVersion || 1 },
      JWT_SECRET,
      { expiresIn: '4h', algorithm: 'HS256' }
    );

    // Return admin info (no password)
    const { password: _, ...adminData } = admin;
    res.json({ admin: adminData, token });
  } catch (err) {
    console.error('POST /api/admin/login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current admin info
router.get('/me', authenticateAdmin, (req, res) => {
  try {
    const admin = db.select().from(schema.adminUsers)
      .where(eq(schema.adminUsers.id, req.user.id))
      .get();

    if (!admin) return res.status(401).json({ error: 'Unauthorized' });

    const { password: _, ...adminData } = admin;
    res.json(adminData);
  } catch (err) {
    console.error('GET /api/admin/me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.use(authenticateAdmin);

const ensureAdminRole = (req: Request, res: Response, roles: Array<'super_admin' | 'admin' | 'support'>) => {
  if (!req.user || !roles.includes(req.user.role)) {
    res.status(403).json({ error: 'Bạn không có quyền quản trị cho thao tác này.' });
    return false;
  }
  return true;
};

// ═══════════════════════════════════════════════════════════
// ADMIN OVERVIEW / STATS
// ═══════════════════════════════════════════════════════════

router.get('/stats', (req, res) => {
  try {
    if (!ensureAdminRole(req, res, ['super_admin', 'admin', 'support'])) return;
    const totalTenants = db.select({ count: sql<number>`count(*)` }).from(schema.tenants).get();
    const activeTenants = db.select({ count: sql<number>`count(*)` }).from(schema.tenants)
      .where(eq(schema.tenants.status, 'active')).get();
    const totalUsers = db.select({ count: sql<number>`count(*)` }).from(schema.users).get();
    const totalProducts = db.select({ count: sql<number>`count(*)` }).from(schema.products).get();
    const totalCustomers = db.select({ count: sql<number>`count(*)` }).from(schema.customers).get();
    const totalInvoices = db.select({ count: sql<number>`count(*)` }).from(schema.invoices).get();
    const pendingSubscriptions = db.select({ count: sql<number>`count(*)` }).from(schema.subscriptions)
      .where(eq(schema.subscriptions.status, 'pending_review')).get();

    // Calculate total revenue across all tenants
    const revenueResult = db.select({
      total: sql<number>`COALESCE(SUM(paid_amount), 0)`
    }).from(schema.invoices).get();

    // Calculate total debt across all customers
    const debtResult = db.select({
      total: sql<number>`COALESCE(SUM(total_debt), 0)`
    }).from(schema.customers).get();

    res.json({
      totalTenants: totalTenants?.count || 0,
      activeTenants: activeTenants?.count || 0,
      totalUsers: totalUsers?.count || 0,
      totalProducts: totalProducts?.count || 0,
      totalCustomers: totalCustomers?.count || 0,
      totalInvoices: totalInvoices?.count || 0,
      pendingSubscriptions: pendingSubscriptions?.count || 0,
      totalRevenue: revenueResult?.total || 0,
      totalDebt: debtResult?.total || 0,
    });
  } catch (err) {
    console.error('GET /api/admin/stats error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/packages', (req, res) => {
  try {
    if (!ensureAdminRole(req, res, ['super_admin', 'admin', 'support'])) return;
    const allPackages = db.select().from(schema.packages).orderBy(desc(schema.packages.createdAt)).all();
    res.json(allPackages);
  } catch (err) {
    console.error('GET /api/admin/packages error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/packages', (req, res) => {
  try {
    if (!ensureAdminRole(req, res, ['super_admin'])) return;
    const { code, name, maxUsers, priceMonthly, isDefault } = req.body;
    if (!code || !name || !maxUsers || !priceMonthly) {
      return res.status(400).json({ error: 'code, name, maxUsers, priceMonthly are required' });
    }
    const exists = db.select().from(schema.packages).where(eq(schema.packages.code, code)).get();
    if (exists) return res.status(400).json({ error: 'Package code already exists' });

    if (isDefault) {
      db.update(schema.packages).set({ isDefault: false }).run();
    }

    const created = {
      id: uuid(),
      code,
      name,
      maxUsers: Number(maxUsers),
      priceMonthly: Number(priceMonthly),
      isDefault: Boolean(isDefault),
      status: 'active' as const,
      createdAt: new Date().toISOString(),
    };
    db.insert(schema.packages).values(created).run();
    writeAuditLog(req.user.id, 'package_created', 'package', created.id, undefined, { code: created.code });
    res.status(201).json(created);
  } catch (err) {
    console.error('POST /api/admin/packages error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/packages/:id', (req, res) => {
  try {
    if (!ensureAdminRole(req, res, ['super_admin'])) return;
    const existing = db.select().from(schema.packages).where(eq(schema.packages.id, req.params.id)).get();
    if (!existing) return res.status(404).json({ error: 'Package not found' });

    const updates: any = {};
    for (const field of ['code', 'name', 'maxUsers', 'priceMonthly', 'isDefault', 'status']) {
      if (req.body?.[field] !== undefined) updates[field] = req.body[field];
    }
    if (updates.maxUsers !== undefined) updates.maxUsers = Number(updates.maxUsers);
    if (updates.priceMonthly !== undefined) updates.priceMonthly = Number(updates.priceMonthly);
    if (updates.isDefault === true) {
      db.update(schema.packages).set({ isDefault: false }).run();
    }

    db.update(schema.packages).set(updates).where(eq(schema.packages.id, req.params.id)).run();
    const updated = db.select().from(schema.packages).where(eq(schema.packages.id, req.params.id)).get();
    writeAuditLog(req.user.id, 'package_updated', 'package', req.params.id, undefined, req.body);
    res.json(updated);
  } catch (err) {
    console.error('PATCH /api/admin/packages/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/packages/:id', (req, res) => {
  try {
    if (!ensureAdminRole(req, res, ['super_admin'])) return;
    const existing = db.select().from(schema.packages).where(eq(schema.packages.id, req.params.id)).get();
    if (!existing) return res.status(404).json({ error: 'Package not found' });
    if (existing.isDefault) return res.status(400).json({ error: 'Cannot delete default package' });

    const usingTenants = db.select({ count: sql<number>`count(*)` }).from(schema.tenants)
      .where(eq(schema.tenants.packageCode, existing.code)).get();
    if ((usingTenants?.count || 0) > 0) {
      return res.status(400).json({ error: 'Package is assigned to tenants' });
    }

    db.delete(schema.packages).where(eq(schema.packages.id, req.params.id)).run();
    writeAuditLog(req.user.id, 'package_deleted', 'package', req.params.id, undefined, { code: existing.code });
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/admin/packages/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════
// TENANT MANAGEMENT
// ═══════════════════════════════════════════════════════════

// List all tenants with user counts
router.get('/tenants', (req, res) => {
  try {
    if (!ensureAdminRole(req, res, ['super_admin', 'admin', 'support'])) return;
    const { search, status } = req.query;
    let allTenants = db.select().from(schema.tenants)
      .orderBy(desc(schema.tenants.createdAt))
      .all();

    // Parse settings
    allTenants = allTenants.map(t => ({
      ...t,
      settings: t.settings ? JSON.parse(t.settings) : undefined,
    })) as any;

    if (search) {
      const s = normalizeSearchText(search);
      allTenants = allTenants.filter(t =>
        normalizeSearchText(t.name).includes(s) ||
        normalizeSearchText(t.id).includes(s) ||
        normalizeSearchText(t.email).includes(s) ||
        normalizeSearchText(t.phone).includes(s)
      );
    }

    if (status && status !== 'all') {
      allTenants = allTenants.filter(t => t.status === status);
    }

    // Enrich with user count per tenant
    const enriched = allTenants.map(t => {
      const userCount = db.select({ count: sql<number>`count(*)` })
        .from(schema.users)
        .where(eq(schema.users.tenantId, t.id))
        .get();
      const productCount = db.select({ count: sql<number>`count(*)` })
        .from(schema.products)
        .where(eq(schema.products.tenantId, t.id))
        .get();
      const invoiceCount = db.select({ count: sql<number>`count(*)` })
        .from(schema.invoices)
        .where(eq(schema.invoices.tenantId, t.id))
        .get();

      return {
        ...t,
        userCount: userCount?.count || 0,
        productCount: productCount?.count || 0,
        invoiceCount: invoiceCount?.count || 0,
      };
    });

    res.json(enriched);
  } catch (err) {
    console.error('GET /api/admin/tenants error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single tenant detail
router.get('/tenants/:id', (req, res) => {
  try {
    if (!ensureAdminRole(req, res, ['super_admin', 'admin', 'support'])) return;
    const tenant = db.select().from(schema.tenants)
      .where(eq(schema.tenants.id, req.params.id)).get();
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    const users = db.select().from(schema.users)
      .where(eq(schema.users.tenantId, req.params.id)).all();
    const productCount = db.select({ count: sql<number>`count(*)` })
      .from(schema.products)
      .where(eq(schema.products.tenantId, req.params.id)).get();
    const customerCount = db.select({ count: sql<number>`count(*)` })
      .from(schema.customers)
      .where(eq(schema.customers.tenantId, req.params.id)).get();
    const invoiceCount = db.select({ count: sql<number>`count(*)` })
      .from(schema.invoices)
      .where(eq(schema.invoices.tenantId, req.params.id)).get();

    res.json({
      ...tenant,
      settings: tenant.settings ? JSON.parse(tenant.settings) : undefined,
      users: users.map(({ password: _, ...user }) => user),
      productCount: productCount?.count || 0,
      customerCount: customerCount?.count || 0,
      invoiceCount: invoiceCount?.count || 0,
    });
  } catch (err) {
    console.error('GET /api/admin/tenants/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new tenant (with owner user)
router.post('/tenants', (req, res) => {
  try {
    if (!ensureAdminRole(req, res, ['super_admin'])) return;
    const { tenant: tenantData, owner: ownerData } = req.body || {};
    if (!tenantData || typeof tenantData !== 'object' || Array.isArray(tenantData)) {
      return res.status(400).json({ error: 'Thông tin cửa hàng không hợp lệ.' });
    }
    if (!ownerData || typeof ownerData !== 'object' || !String(ownerData.name || '').trim() || !safeEmail(ownerData.email) || !isValidPassword(ownerData.password)) {
      return res.status(400).json({ error: `Cần thông tin owner và mật khẩu tối thiểu ${MIN_PASSWORD_LENGTH} ký tự.` });
    }
    const ownerEmail = safeEmail(ownerData.email);
    const existingOwner = db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, ownerEmail)).get();
    if (existingOwner) return res.status(409).json({ error: 'Email owner đã được sử dụng.' });
    const tenantId = uuid();
    const now = new Date().toISOString();
    const defaultPackage = db.select().from(schema.packages).where(eq(schema.packages.isDefault, true)).get()
      || db.select().from(schema.packages).orderBy(desc(schema.packages.createdAt)).get();

    const tenant = {
      id: tenantId,
      name: tenantData.name,
      legalName: tenantData.legalName || null,
      address: tenantData.address || '',
      province: tenantData.province || null,
      district: tenantData.district || null,
      ward: tenantData.ward || null,
      phone: tenantData.phone || '',
      email: tenantData.email || null,
      taxInfo: tenantData.taxInfo || null,
      timezone: tenantData.timezone || 'Asia/Ho_Chi_Minh',
      currency: tenantData.currency || 'VND',
      invoicePrefix: tenantData.invoicePrefix || 'INV',
      status: tenantData.status || 'active',
      trialStartAt: null,
      trialEndAt: null,
      subscriptionStatus: 'active' as const,
      subscriptionPlan: 'yearly' as const,
      subscriptionPriceMonthly: MONTHLY_SUBSCRIPTION_PRICE,
      packageCode: defaultPackage?.code || 'starter_1',
      packageName: defaultPackage?.name || 'Starter 1',
      maxUsers: defaultPackage?.maxUsers || 1,
      packagePriceMonthly: defaultPackage?.priceMonthly || 150000,
      settings: tenantData.settings ? JSON.stringify(tenantData.settings) : null,
      createdAt: now,
    };

    const owner = {
      id: uuid(),
      name: String(ownerData.name).trim(),
      email: ownerEmail,
      password: bcrypt.hashSync(ownerData.password, 12),
      phone: ownerData.phone ? String(ownerData.phone).trim() : null,
      role: 'owner' as const,
      tenantId,
      status: 'active' as const,
      sessionVersion: 1,
    };
    db.transaction((tx) => {
      tx.insert(schema.tenants).values(tenant).run();
      tx.insert(schema.subscriptions).values({
        id: uuid(),
        tenantId,
        plan: 'yearly',
        priceMonthly: MONTHLY_SUBSCRIPTION_PRICE,
        status: 'pending_review',
        note: 'Legacy record retained for data compatibility; HKDPlus local does not use subscription flow.',
        createdAt: now,
      }).run();
      tx.insert(schema.users).values(owner).run();
    });

    const created = db.select().from(schema.tenants)
      .where(eq(schema.tenants.id, tenantId)).get();
    writeAuditLog(req.user.id, 'tenant_created', 'tenant', tenantId, tenantId, { ownerEmail });

    res.status(201).json({
      ...created,
      settings: created?.settings ? JSON.parse(created.settings) : undefined,
    });
  } catch (err) {
    console.error('POST /api/admin/tenants error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update tenant
router.patch('/tenants/:id', (req, res) => {
  try {
    if (!ensureAdminRole(req, res, ['super_admin'])) return;
    const updates: Record<string, any> = {};
    for (const field of ['name', 'legalName', 'address', 'province', 'district', 'ward', 'phone', 'email', 'taxInfo', 'invoicePrefix', 'logoUrl', 'status', 'subscriptionStatus', 'subscriptionPlan', 'subscriptionPriceMonthly', 'subscriptionStartAt', 'subscriptionEndAt']) {
      if (req.body?.[field] !== undefined) updates[field] = req.body[field];
    }
    if (req.body?.settings !== undefined) updates.settings = req.body.settings;
    if (req.body?.packageCode !== undefined) updates.packageCode = String(req.body.packageCode).trim();
    if (updates.packageCode) {
      const selected = db.select().from(schema.packages).where(eq(schema.packages.code, updates.packageCode)).get();
      if (!selected) return res.status(400).json({ error: 'Invalid packageCode' });
      updates.packageName = selected.name;
      updates.maxUsers = selected.maxUsers;
      updates.packagePriceMonthly = selected.priceMonthly;
    }
    if (updates.logoUrl !== undefined) {
      const logoUrl = String(updates.logoUrl || '').trim();
      if (logoUrl && (!/^data:image\/(png|jpeg|webp);base64,/i.test(logoUrl) || logoUrl.length > 2_000_000)) return res.status(400).json({ error: 'Invalid logo' });
      updates.logoUrl = logoUrl || null;
    }
    if (updates.settings !== undefined) {
      if (typeof updates.settings !== 'object' || Array.isArray(updates.settings)) return res.status(400).json({ error: 'Invalid settings' });
      const serializedSettings = JSON.stringify(updates.settings);
      if (serializedSettings.length > 250_000) return res.status(400).json({ error: 'Settings too large' });
      updates.settings = serializedSettings;
    }
    if (!Object.keys(updates).length) return res.status(400).json({ error: 'No valid fields to update' });
    db.update(schema.tenants).set(updates)
      .where(eq(schema.tenants.id, req.params.id)).run();

    const updated = db.select().from(schema.tenants)
      .where(eq(schema.tenants.id, req.params.id)).get();
    if (!updated) return res.status(404).json({ error: 'Tenant not found' });
    writeAuditLog(req.user.id, 'tenant_updated', 'tenant', req.params.id, req.params.id, req.body);

    res.json({
      ...updated,
      settings: updated.settings ? JSON.parse(updated.settings) : undefined,
    });
  } catch (err) {
    console.error('PATCH /api/admin/tenants/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Suspend / activate tenant
router.post('/tenants/:id/status', (req, res) => {
  try {
    if (!ensureAdminRole(req, res, ['super_admin'])) return;
    const { status } = req.body;
    if (!['active', 'suspended', 'trial', 'onboarding', 'pending_setup'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const tenant = db.select({ id: schema.tenants.id })
      .from(schema.tenants)
      .where(eq(schema.tenants.id, req.params.id)).get();
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    db.transaction((tx) => {
      tx.update(schema.tenants).set({ status })
        .where(eq(schema.tenants.id, req.params.id)).run();
      tx.update(schema.users)
        .set({ sessionVersion: sql`${schema.users.sessionVersion} + 1` })
        .where(eq(schema.users.tenantId, req.params.id)).run();
    });

    const updated = db.select().from(schema.tenants)
      .where(eq(schema.tenants.id, req.params.id)).get();
    writeAuditLog(req.user.id, 'tenant_status_changed', 'tenant', req.params.id, req.params.id, { status });

    res.json({
      ...updated,
      settings: updated.settings ? JSON.parse(updated.settings) : undefined,
    });
  } catch (err) {
    console.error('POST /api/admin/tenants/:id/status error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete tenant (and cascade data)
router.delete('/tenants/:id', (req, res) => {
  try {
    if (!ensureAdminRole(req, res, ['super_admin'])) return;
    const tenantId = req.params.id;

    // Cascade delete in order (due to foreign keys)
    db.delete(schema.invoiceItems).where(
      sql`invoice_id IN (SELECT id FROM invoices WHERE tenant_id = ${tenantId})`
    ).run();
    db.delete(schema.debtLedger).where(eq(schema.debtLedger.tenantId, tenantId)).run();
    db.delete(schema.invoices).where(eq(schema.invoices.tenantId, tenantId)).run();
    db.delete(schema.customers).where(eq(schema.customers.tenantId, tenantId)).run();
    db.delete(schema.products).where(eq(schema.products.tenantId, tenantId)).run();
    db.delete(schema.categories).where(eq(schema.categories.tenantId, tenantId)).run();
    db.delete(schema.users).where(eq(schema.users.tenantId, tenantId)).run();
    db.delete(schema.subscriptions).where(eq(schema.subscriptions.tenantId, tenantId)).run();
    db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId)).run();
    writeAuditLog(req.user.id, 'tenant_deleted', 'tenant', tenantId, tenantId);

    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/admin/tenants/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════
// USER MANAGEMENT (across tenants)
// ═══════════════════════════════════════════════════════════

router.get('/users', (req, res) => {
  try {
    if (!ensureAdminRole(req, res, ['super_admin', 'admin', 'support'])) return;
    const { tenantId, search } = req.query;
    let allUsers = db.select().from(schema.users).all();
    const tenantMap = new Map(
      db.select().from(schema.tenants).all().map((tenant) => [tenant.id, tenant])
    );

    if (tenantId) {
      allUsers = allUsers.filter(u => u.tenantId === tenantId);
    }
    if (search) {
      const s = normalizeSearchText(search);
      allUsers = allUsers.filter(u =>
        normalizeSearchText(u.name).includes(s) ||
        normalizeSearchText(u.email).includes(s)
      );
    }

    res.json(allUsers.map(({ password: _, ...user }) => {
      const tenant = tenantMap.get(user.tenantId);
      return {
        ...user,
        tenantName: tenant?.name || 'Unknown',
        tenantEmail: tenant?.email || null,
        tenantStatus: tenant?.status || null,
      };
    }));
  } catch (err) {
    console.error('GET /api/admin/users error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/users', (req, res) => {
  try {
    if (!ensureAdminRole(req, res, ['super_admin', 'admin'])) return;
    const allowedRoles = ['owner', 'manager', 'cashier', 'warehouse'] as const;
    if (!allowedRoles.includes(req.body.role)) {
      return res.status(400).json({ error: 'Invalid role. Allowed: owner, manager, cashier' });
    }
    const tenant = db.select().from(schema.tenants).where(eq(schema.tenants.id, req.body.tenantId)).get();
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    if (!req.body.password || String(req.body.password).length < MIN_PASSWORD_LENGTH) return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    const user = {
      id: uuid(),
      name: String(req.body.name || '').trim(),
      email: String(req.body.email || '').trim().toLowerCase(),
      phone: String(req.body.phone || '').trim(),
      role: req.body.role,
      tenantId: req.body.tenantId,
      status: 'active' as const,
      sessionVersion: 1,
      password: bcrypt.hashSync(String(req.body.password), 12),
    };
    if (!user.name || !user.email) return res.status(400).json({ error: 'Name and email are required' });
    db.insert(schema.users).values(user).run();
    writeAuditLog(req.user.id, 'user_created', 'user', user.id, user.tenantId, { role: user.role });
    const { password: _, ...userData } = user;
    res.status(201).json(userData);
  } catch (err) {
    console.error('POST /api/admin/users error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/users/:id', (req, res) => {
  try {
    if (!ensureAdminRole(req, res, ['super_admin', 'admin'])) return;
    if (req.body.role) {
      const allowedRoles = ['owner', 'manager', 'cashier'] as const;
      if (!allowedRoles.includes(req.body.role)) {
        return res.status(400).json({ error: 'Invalid role. Allowed: owner, manager, cashier' });
      }
    }
    const updates: Record<string, any> = {};
    for (const field of ['name', 'email', 'phone', 'role', 'status']) {
      if (req.body?.[field] !== undefined) updates[field] = field === 'email' ? String(req.body[field]).trim().toLowerCase() : String(req.body[field]).trim();
    }
    if (req.body.password) {
      if (String(req.body.password).length < MIN_PASSWORD_LENGTH) return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
      updates.password = bcrypt.hashSync(String(req.body.password), 12);
    }
    if (Object.keys(updates).length) updates.sessionVersion = sql`${schema.users.sessionVersion} + 1`;
    db.update(schema.users).set(updates)
      .where(eq(schema.users.id, req.params.id)).run();
    const updated = db.select().from(schema.users)
      .where(eq(schema.users.id, req.params.id)).get();
    if (!updated) return res.status(404).json({ error: 'User not found' });
    const { password: _, ...userData } = updated;
    writeAuditLog(req.user.id, 'user_updated', 'user', req.params.id, userData.tenantId, req.body);
    res.json(userData);
  } catch (err) {
    console.error('PATCH /api/admin/users/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/users/:id', (req, res) => {
  try {
    if (!ensureAdminRole(req, res, ['super_admin'])) return;
    const existing = db.select().from(schema.users).where(eq(schema.users.id, req.params.id)).get();
    db.delete(schema.users).where(eq(schema.users.id, req.params.id)).run();
    if (existing) {
      writeAuditLog(req.user.id, 'user_deleted', 'user', req.params.id, existing.tenantId);
    }
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/admin/users/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════
// SUBSCRIPTION MANAGEMENT
// ═══════════════════════════════════════════════════════════

router.get('/subscriptions', (req, res) => {
  try {
    if (!ensureAdminRole(req, res, ['super_admin', 'admin', 'support'])) return;
    const { status } = req.query;
    let subscriptions = db.select().from(schema.subscriptions)
      .orderBy(desc(schema.subscriptions.createdAt)).all();
    if (status && status !== 'all') {
      subscriptions = subscriptions.filter((s) => s.status === status);
    }
    const enriched = subscriptions.map((sub) => {
      const tenant = db.select().from(schema.tenants).where(eq(schema.tenants.id, sub.tenantId)).get();
      return { ...sub, tenantName: tenant?.name || 'Unknown', tenantStatus: tenant?.status || 'unknown' };
    });
    res.json(enriched);
  } catch (err) {
    console.error('GET /api/admin/subscriptions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/subscriptions/:tenantId/review', (req, res) => {
  try {
    if (!ensureAdminRole(req, res, ['super_admin', 'admin'])) return;
    const { tenantId } = req.params;
    const { decision, note } = req.body as { decision: 'approve' | 'reject'; note?: string };
    if (!['approve', 'reject'].includes(decision)) {
      return res.status(400).json({ error: 'Invalid decision' });
    }

    const tenant = db.select().from(schema.tenants).where(eq(schema.tenants.id, tenantId)).get();
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    const now = new Date().toISOString();
    const nextYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

    let subscription = db.select().from(schema.subscriptions)
      .where(eq(schema.subscriptions.tenantId, tenantId)).get();
    if (!subscription) {
      const newSub = {
        id: uuid(),
        tenantId,
        plan: 'yearly' as const,
        priceMonthly: MONTHLY_SUBSCRIPTION_PRICE,
        status: 'pending_review' as const,
        note: null,
        createdAt: now,
      };
      db.insert(schema.subscriptions).values(newSub).run();
      subscription = newSub as any;
    }

    if (decision === 'approve') {
      db.update(schema.subscriptions).set({
        status: 'active',
        note: note || 'Approved by admin',
        startAt: now,
        endAt: nextYear,
        reviewedBy: req.user.id,
        reviewedAt: now,
      }).where(eq(schema.subscriptions.id, subscription.id)).run();
      db.update(schema.tenants).set({
        status: 'active',
        subscriptionStatus: 'active',
        subscriptionStartAt: now,
        subscriptionEndAt: nextYear,
      }).where(eq(schema.tenants.id, tenantId)).run();
    } else {
      db.update(schema.subscriptions).set({
        status: 'cancelled',
        note: note || 'Rejected by admin',
        reviewedBy: req.user.id,
        reviewedAt: now,
      }).where(eq(schema.subscriptions.id, subscription.id)).run();
      db.update(schema.tenants).set({
        subscriptionStatus: 'expired',
        status: 'suspended',
      }).where(eq(schema.tenants.id, tenantId)).run();
    }
    writeAuditLog(req.user.id, `subscription_${decision}`, 'subscription', subscription.id, tenantId, { note: note || null });
    const updated = db.select().from(schema.subscriptions).where(eq(schema.subscriptions.id, subscription.id)).get();
    res.json(updated);
  } catch (err) {
    console.error('POST /api/admin/subscriptions/:tenantId/review error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/subscriptions/:tenantId/renew', (req, res) => {
  try {
    if (!ensureAdminRole(req, res, ['super_admin', 'admin'])) return;
    const { tenantId } = req.params;
    const now = new Date().toISOString();
    const nextYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    const tenant = db.select().from(schema.tenants).where(eq(schema.tenants.id, tenantId)).get();
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    db.update(schema.tenants).set({
      status: 'active',
      subscriptionStatus: 'active',
      subscriptionPlan: 'yearly',
      subscriptionPriceMonthly: MONTHLY_SUBSCRIPTION_PRICE,
      subscriptionStartAt: now,
      subscriptionEndAt: nextYear,
    }).where(eq(schema.tenants.id, tenantId)).run();

    let subscription = db.select().from(schema.subscriptions).where(eq(schema.subscriptions.tenantId, tenantId)).get();
    if (!subscription) {
      const created = {
        id: uuid(),
        tenantId,
        plan: 'yearly' as const,
        priceMonthly: MONTHLY_SUBSCRIPTION_PRICE,
        status: 'active' as const,
        startAt: now,
        endAt: nextYear,
        reviewedBy: req.user.id,
        reviewedAt: now,
        note: 'Renewed by admin',
        createdAt: now,
      };
      db.insert(schema.subscriptions).values(created).run();
      subscription = created as any;
    } else {
      db.update(schema.subscriptions).set({
        status: 'active',
        startAt: now,
        endAt: nextYear,
        reviewedBy: req.user.id,
        reviewedAt: now,
        note: 'Renewed by admin',
      }).where(eq(schema.subscriptions.id, subscription.id)).run();
    }
    writeAuditLog(req.user.id, 'subscription_renewed', 'subscription', subscription.id, tenantId);
    res.json({ success: true });
  } catch (err) {
    console.error('POST /api/admin/subscriptions/:tenantId/renew error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════
// AUDIT LOGS
// ═══════════════════════════════════════════════════════════

router.get('/audit-logs', (req, res) => {
  try {
    if (!ensureAdminRole(req, res, ['super_admin', 'admin', 'support'])) return;
    const { tenantId, limit = '100' } = req.query;
    let logs = db.select().from(schema.auditLogs).orderBy(desc(schema.auditLogs.createdAt)).all();
    if (tenantId) logs = logs.filter((log) => log.tenantId === tenantId);
    res.json(logs.slice(0, Number(limit) || 100).map((log) => ({
      ...log,
      meta: log.meta ? JSON.parse(log.meta) : null,
    })));
  } catch (err) {
    console.error('GET /api/admin/audit-logs error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
