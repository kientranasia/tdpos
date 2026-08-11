import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { db } from './db';
import * as schema from './schema';
import { eq, desc, and, like, sql, inArray } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import os from 'os';
import fs from 'fs';
import path from 'path';
import adminRouter from './admin';
import { bootstrapAdminAccount } from './bootstrapAdmin';
import { DB_PATH, sqlite } from './db';

const app = express();
const PORT = process.env.API_PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-dev-only';

const withTenantAccess = (tenant: any) => {
  if (!tenant) return null;
  return {
    ...tenant,
    accessBlocked: false,
    settings: tenant.settings ? JSON.parse(tenant.settings) : undefined,
  };
};

// Extend Express Request type for user
declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

// ─── Middleware ─────────────────────────────────────────────
app.use(cors({ origin: true }));
app.use(express.json({ limit: '8mb' }));
app.use(morgan('dev'));

// Auth Middleware
const authenticateUser = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

const hasRole = (userRole: string, roles: string[]) => roles.includes(userRole);
const ensureRole = (req: Request, res: Response, roles: string[]) => {
  if (!req.user || !hasRole(req.user.role, roles)) {
    res.status(403).json({ error: 'Forbidden' });
    return false;
  }
  return true;
};

const hasPermission = (req: Request, code: string) => {
  if (req.user?.role === 'owner') return true;
  const override = db.select().from(schema.userPermissions)
    .where(and(
      eq(schema.userPermissions.tenantId, req.user.tenantId),
      eq(schema.userPermissions.userId, req.user.id),
      eq(schema.userPermissions.permissionCode, code),
    )).get();
  if (override) return override.allowed;
  const roleGrant = db.select().from(schema.rolePermissions)
    .where(and(eq(schema.rolePermissions.role, req.user.role), eq(schema.rolePermissions.permissionCode, code))).get();
  return Boolean(roleGrant?.allowed);
};

const ensurePermission = (req: Request, res: Response, code: string) => {
  if (!hasPermission(req, code)) {
    res.status(403).json({ error: `Bạn không có quyền: ${code}` });
    return false;
  }
  return true;
};

// ─── Health Check ───────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Admin Routes ───────────────────────────────────────────
app.use('/api/admin', adminRouter);

// ─── Tenant Auth (Login/Register) ───────────────────────────
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const user = db.select().from(schema.users)
      .where(eq(schema.users.email, email)).get();

    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    if (user.status !== 'active') return res.status(403).json({ error: 'Account inactive' });

    // Verify password
    if (user.password) {
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });
    } else {
      // Handle users without passwords (maybe imported or social login)
      return res.status(401).json({ error: 'Password not set for this account' });
    }

    // Get tenant for this user
    const tenant = db.select().from(schema.tenants)
      .where(eq(schema.tenants.id, user.tenantId)).get();

    // Create JWT
    const token = jwt.sign(
      { id: user.id, email: user.email, tenantId: user.tenantId, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    const { password: _, ...userData } = user;
    res.json({
      user: userData,
      tenant: withTenantAccess(tenant),
      token,
    });
  } catch (err) {
    console.error('POST /api/auth/login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, storeName } = req.body;
    if (!email || !name || !storeName || !password) {
      return res.status(400).json({ error: 'name, email, password, and storeName required' });
    }

    // Check if user exists
    const existingUser = db.select().from(schema.users).where(eq(schema.users.email, email)).get();
    if (existingUser) return res.status(400).json({ error: 'Email already registered' });

    const tenantId = uuid();
    const userId = uuid();
    const now = new Date().toISOString();

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create tenant
    db.insert(schema.tenants).values({
      id: tenantId,
      name: storeName,
      address: '',
      phone: '',
      timezone: 'Asia/Ho_Chi_Minh',
      currency: 'VND',
      invoicePrefix: 'INV',
      status: 'pending_setup',
      trialStartAt: null,
      trialEndAt: null,
      subscriptionStatus: 'active',
      subscriptionPlan: 'yearly',
      subscriptionPriceMonthly: 150000,
      packageCode: 'starter_1',
      packageName: 'HKDPlus Local',
      maxUsers: 1,
      packagePriceMonthly: 150000,
      createdAt: now,
    }).run();

    // Create owner user
    const userValues = {
      id: userId,
      name,
      email,
      password: hashedPassword,
      role: 'owner' as const,
      tenantId,
      status: 'active' as const,
    };
    db.insert(schema.users).values(userValues).run();

    const tenant = db.select().from(schema.tenants)
      .where(eq(schema.tenants.id, tenantId)).get();

    // Create JWT
    const token = jwt.sign(
      { id: userId, email, tenantId, role: 'owner' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    const { password: _, ...userData } = userValues;
    res.status(201).json({
      user: userData,
      tenant: withTenantAccess(tenant),
      token,
    });
  } catch (err) {
    console.error('POST /api/auth/register error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/auth/me', authenticateUser, (req, res) => {
  try {
    const user = db.select().from(schema.users).where(eq(schema.users.id, req.user.id)).get();
    if (!user) return res.status(404).json({ error: 'User not found' });

    const tenant = db.select().from(schema.tenants).where(eq(schema.tenants.id, user.tenantId)).get();

    const { password: _, ...userData } = user;
    res.json({
      user: userData,
      tenant: withTenantAccess(tenant),
    });
  } catch (err) {
    console.error('GET /api/auth/me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.use('/api', authenticateUser);

const getMachineHash = () => {
  const network = Object.values(os.networkInterfaces()).flat().filter(Boolean).map((item) => `${item?.mac}:${item?.address}`).sort().join('|');
  return crypto.createHash('sha256').update(`${os.hostname()}|${network}|${process.env.HKDPLUS_INSTANCE_SECRET || 'local-instance'}`).digest('hex');
};
const getInstanceId = () => process.env.HKDPLUS_INSTANCE_ID?.trim() || crypto.createHash('sha256').update(getMachineHash()).digest('hex').slice(0, 24);
const persistLicenseToken = (token: string) => {
  const publicKey = process.env.HKDPLUS_LICENSE_PUBLIC_KEY || '';
  const [encodedPayload, encodedSignature] = token.split('.');
  if (!publicKey || !encodedPayload || !encodedSignature) return { error: 'Thiếu license token hoặc public key xác minh' };
  const verified = crypto.verify('RSA-SHA256', Buffer.from(encodedPayload), publicKey, Buffer.from(encodedSignature, 'base64url'));
  if (!verified) return { error: 'License không hợp lệ' };
  const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as { instanceId: string; licenseCode: string; customerName?: string; issuedAt?: string; expiresAt?: string; machineHash?: string };
  const instanceId = getInstanceId();
  if (payload.instanceId !== instanceId) return { error: 'License không thuộc instance này' };
  if (payload.machineHash && payload.machineHash !== getMachineHash()) return { error: 'License không thuộc máy chủ này' };
  const machineHash = getMachineHash();
  const now = new Date().toISOString();
  const existing = db.select().from(schema.licenseInstances).get();
  const values = { instanceId, licenseCode: payload.licenseCode, customerName: payload.customerName || '', machineHash, issuedAt: payload.issuedAt || now, expiresAt: payload.expiresAt || null, status: 'active' as const, payload: JSON.stringify(payload), lastValidatedAt: now, createdAt: existing?.createdAt || now };
  if (existing) db.update(schema.licenseInstances).set(values).where(eq(schema.licenseInstances.id, existing.id)).run();
  else db.insert(schema.licenseInstances).values({ id: uuid(), ...values }).run();
  return { status: 'active', customerName: values.customerName, expiresAt: values.expiresAt };
};
const nextDocumentNo = (tenantId: string, documentType: string, prefix: string) => {
  const now = new Date().toISOString();
  const existing = sqlite.prepare('SELECT id, next_number FROM document_sequences WHERE tenant_id = ? AND document_type = ?').get(tenantId, documentType) as { id: string; next_number: number } | undefined;
  const next = existing?.next_number || 1;
  if (existing) sqlite.prepare('UPDATE document_sequences SET next_number = ?, updated_at = ? WHERE id = ?').run(next + 1, now, existing.id);
  else sqlite.prepare('INSERT INTO document_sequences (id, tenant_id, document_type, prefix, next_number, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(uuid(), tenantId, documentType, prefix, next + 1, now);
  return `${prefix}-${String(next).padStart(6, '0')}`;
};

app.get('/api/system/status', (req, res) => {
  try {
    const interfaces = Object.values(os.networkInterfaces()).flat().filter((item) => item && !item.internal && item.family === 'IPv4').map((item) => item?.address).filter(Boolean);
    const license = db.select().from(schema.licenseInstances).get();
    res.json({
      product: 'HKDCare',
      hostname: os.hostname(),
      addresses: interfaces,
      localUrl: 'http://hkd.care',
      apiPort: PORT,
      database: 'SQLite',
      dataPath: path.dirname(DB_PATH),
      license: license ? { status: license.status, customerName: license.customerName, expiresAt: license.expiresAt, lastValidatedAt: license.lastValidatedAt } : { status: 'unlicensed' },
      tenantId: req.user.tenantId,
    });
  } catch (err) {
    console.error('GET /api/system/status error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/tax-profile', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'settings.view')) return;
    let profile = db.select().from(schema.taxProfiles).where(eq(schema.taxProfiles.tenantId, req.user.tenantId)).get();
    if (!profile) {
      const now = new Date().toISOString();
      const created = { id: uuid(), tenantId: req.user.tenantId, name: 'Mặc định', taxMethod: 'Chưa cấu hình', defaultTaxRate: 0, taxCode: null, active: true, createdAt: now };
      db.insert(schema.taxProfiles).values(created).run();
      profile = created;
    }
    res.json(profile);
  } catch (err) { console.error('GET /api/tax-profile error:', err); res.status(500).json({ error: 'Không thể tải cấu hình thuế' }); }
});

app.patch('/api/tax-profile', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'settings.manage_users')) return;
    const existing = db.select().from(schema.taxProfiles).where(eq(schema.taxProfiles.tenantId, req.user.tenantId)).get();
    const data = { name: String(req.body?.name || 'Mặc định'), taxMethod: String(req.body?.taxMethod || 'Chưa cấu hình'), defaultTaxRate: Math.max(0, Number(req.body?.defaultTaxRate) || 0), taxCode: req.body?.taxCode ? String(req.body.taxCode) : null, active: req.body?.active !== false };
    if (existing) db.update(schema.taxProfiles).set(data).where(eq(schema.taxProfiles.id, existing.id)).run();
    else db.insert(schema.taxProfiles).values({ id: uuid(), tenantId: req.user.tenantId, ...data, createdAt: new Date().toISOString() }).run();
    res.json(db.select().from(schema.taxProfiles).where(eq(schema.taxProfiles.tenantId, req.user.tenantId)).get());
  } catch (err) { console.error('PATCH /api/tax-profile error:', err); res.status(500).json({ error: 'Không thể lưu cấu hình thuế' }); }
});

app.get('/api/document-sequences', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'settings.view')) return;
    const rows = db.select().from(schema.documentSequences).where(eq(schema.documentSequences.tenantId, req.user.tenantId)).all();
    res.json(rows);
  } catch (err) { console.error('GET /api/document-sequences error:', err); res.status(500).json({ error: 'Không thể tải dãy số chứng từ' }); }
});

app.get('/api/backups', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'settings.view')) return;
    res.json(db.select().from(schema.backupLogs).orderBy(desc(schema.backupLogs.createdAt)).limit(20).all());
  } catch (err) {
    console.error('GET /api/backups error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/backups', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'settings.manage_users')) return;
    const backupDir = path.join(path.dirname(DB_PATH), 'backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const fileName = `hkdplus-${new Date().toISOString().replace(/[:.]/g, '-')}.db`;
    const filePath = path.join(backupDir, fileName);
    await sqlite.backup(filePath);
    const stat = fs.statSync(filePath);
    const log = { id: uuid(), filePath: `backups/${fileName}`, sizeBytes: stat.size, createdBy: req.user.id, createdAt: new Date().toISOString() };
    db.insert(schema.backupLogs).values(log).run();
    res.status(201).json(log);
  } catch (err) {
    console.error('POST /api/backups error:', err);
    res.status(500).json({ error: 'Không thể tạo bản sao lưu' });
  }
});

app.post('/api/backups/restore', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'settings.manage_users')) return;
    const backupId = String(req.body?.backupId || '');
    const backup = db.select().from(schema.backupLogs).where(eq(schema.backupLogs.id, backupId)).get();
    if (!backup) return res.status(404).json({ error: 'Không tìm thấy bản sao lưu' });
    const backupDir = path.resolve(path.dirname(DB_PATH), 'backups');
    const sourcePath = path.resolve(path.dirname(DB_PATH), backup.filePath);
    if (!sourcePath.startsWith(`${backupDir}${path.sep}`) || !fs.existsSync(sourcePath)) {
      return res.status(400).json({ error: 'Đường dẫn bản sao lưu không hợp lệ' });
    }
    const safetyPath = path.join(backupDir, `before-restore-${Date.now()}.db`);
    await sqlite.backup(safetyPath);
    sqlite.close();
    fs.copyFileSync(sourcePath, DB_PATH);
    res.json({ success: true, message: 'Đã khôi phục dữ liệu. Máy chủ sẽ khởi động lại.' });
    setTimeout(() => process.exit(0), 250);
  } catch (err) {
    console.error('POST /api/backups/restore error:', err);
    res.status(500).json({ error: 'Không thể khôi phục bản sao lưu' });
  }
});

app.get('/api/license/status', (_req, res) => {
  try {
    const license = db.select().from(schema.licenseInstances).get();
    if (!license) return res.json({ status: 'unlicensed', machineHash: getMachineHash().slice(0, 12) });
    const expiresAt = license.expiresAt ? new Date(license.expiresAt).getTime() : 0;
    const graceUntil = expiresAt ? new Date(expiresAt + 30 * 24 * 60 * 60 * 1000).toISOString() : null;
    const expired = expiresAt > 0 && expiresAt < Date.now();
    const inGrace = expired && graceUntil && new Date(graceUntil).getTime() >= Date.now();
    res.json({ status: expired ? (inGrace ? 'grace' : 'expired') : license.status, customerName: license.customerName, expiresAt: license.expiresAt, graceUntil, lastValidatedAt: license.lastValidatedAt, instanceId: license.instanceId, machineHash: getMachineHash().slice(0, 12) });
  } catch (err) {
    console.error('GET /api/license/status error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/license/activate', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'settings.manage_users')) return;
    const token = String(req.body?.licenseToken || '');
    const result = persistLicenseToken(token);
    if ('error' in result) return res.status(400).json(result);
    res.json(result);
  } catch (err) {
    console.error('POST /api/license/activate error:', err);
    res.status(400).json({ error: 'Không thể kích hoạt license' });
  }
});

app.post('/api/license/refresh', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'settings.manage_users')) return;
    const serverUrl = process.env.HKDPLUS_LICENSE_SERVER_URL?.trim();
    const license = db.select().from(schema.licenseInstances).get();
    if (!serverUrl || !license) return res.status(503).json({ error: 'Chưa cấu hình license server hoặc instance chưa kích hoạt' });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`${serverUrl.replace(/\/$/, '')}/api/licenses/validate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ instanceId: license.instanceId, licenseCode: license.licenseCode, machineHash: getMachineHash(), payload: license.payload ? JSON.parse(license.payload) : null }), signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) return res.status(502).json({ error: 'License server từ chối xác minh' });
    const result = await response.json() as { licenseToken?: string };
    if (result.licenseToken) {
      const activated = persistLicenseToken(result.licenseToken);
      if ('error' in activated) return res.status(502).json(activated);
      return res.json(activated);
    }
    db.update(schema.licenseInstances).set({ lastValidatedAt: new Date().toISOString() }).where(eq(schema.licenseInstances.id, license.id)).run();
    res.json({ status: 'validated', lastValidatedAt: new Date().toISOString() });
  } catch (err) { console.error('POST /api/license/refresh error:', err); res.status(502).json({ error: 'Không thể kết nối license server' }); }
});

app.get('/api/permissions', (req, res) => {
  try {
    const grants = db.select().from(schema.permissions).all();
    const roleGrants = db.select().from(schema.rolePermissions).where(eq(schema.rolePermissions.role, req.user.role)).all();
    const userGrants = db.select().from(schema.userPermissions).where(and(eq(schema.userPermissions.tenantId, req.user.tenantId), eq(schema.userPermissions.userId, req.user.id))).all();
    const roleMap = new Map(roleGrants.map((grant) => [grant.permissionCode, grant.allowed]));
    const userMap = new Map(userGrants.map((grant) => [grant.permissionCode, grant.allowed]));
    res.json(grants.map((permission) => ({ ...permission, allowed: req.user.role === 'owner' ? true : userMap.has(permission.code) ? userMap.get(permission.code) : Boolean(roleMap.get(permission.code)) })));
  } catch (err) {
    console.error('GET /api/permissions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/users/:id/permissions', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'settings.manage_permissions')) return;
    const user = db.select().from(schema.users).where(and(eq(schema.users.id, req.params.id), eq(schema.users.tenantId, req.user.tenantId))).get();
    if (!user) return res.status(404).json({ error: 'User not found' });
    const permissions = db.select().from(schema.permissions).all();
    const roleGrants = db.select().from(schema.rolePermissions).where(eq(schema.rolePermissions.role, user.role)).all();
    const userGrants = db.select().from(schema.userPermissions).where(and(eq(schema.userPermissions.tenantId, req.user.tenantId), eq(schema.userPermissions.userId, user.id))).all();
    const roleMap = new Map(roleGrants.map((grant) => [grant.permissionCode, grant.allowed]));
    const userMap = new Map(userGrants.map((grant) => [grant.permissionCode, grant.allowed]));
    res.json(permissions.map((permission) => ({ ...permission, allowed: userMap.has(permission.code) ? userMap.get(permission.code) : Boolean(roleMap.get(permission.code)), overridden: userMap.has(permission.code) })));
  } catch (err) {
    console.error('GET /api/users/:id/permissions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/users/:id/permissions', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'settings.manage_permissions')) return;
    const user = db.select().from(schema.users).where(and(eq(schema.users.id, req.params.id), eq(schema.users.tenantId, req.user.tenantId))).get();
    if (!user) return res.status(404).json({ error: 'User not found' });
    const entries = Array.isArray(req.body?.permissions) ? req.body.permissions : [];
    const now = new Date().toISOString();
    db.transaction((tx) => {
      tx.delete(schema.userPermissions).where(and(eq(schema.userPermissions.tenantId, req.user.tenantId), eq(schema.userPermissions.userId, user.id))).run();
      for (const entry of entries) {
        if (typeof entry?.code !== 'string' || typeof entry?.allowed !== 'boolean') continue;
        tx.insert(schema.userPermissions).values({ id: uuid(), tenantId: req.user.tenantId, userId: user.id, permissionCode: entry.code, allowed: entry.allowed, updatedAt: now }).run();
      }
    });
    res.json({ success: true });
  } catch (err) {
    console.error('PUT /api/users/:id/permissions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════
// TENANTS
// ═══════════════════════════════════════════════════════════

app.get('/api/tenants', (req, res) => {
  try {
    const tenants = db.select().from(schema.tenants)
      .where(eq(schema.tenants.id, req.user.tenantId)).all();
    // Parse settings JSON for each tenant
    const parsed = tenants.map(t => ({
      ...t,
      accessBlocked: withTenantAccess(t)?.accessBlocked,
      settings: t.settings ? JSON.parse(t.settings) : undefined,
    }));
    res.json(parsed);
  } catch (err) {
    console.error('GET /api/tenants error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/tenants/:id', (req, res) => {
  try {
    if (req.params.id !== req.user.tenantId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const tenant = db.select().from(schema.tenants).where(eq(schema.tenants.id, req.params.id)).get();
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    res.json(withTenantAccess(tenant));
  } catch (err) {
    console.error('GET /api/tenants/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.patch('/api/tenants/:id', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'settings.manage_users')) return;
    if (req.params.id !== req.user.tenantId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const body = req.body;
    const updateData: any = { ...body };
    if (body.settings) {
      updateData.settings = JSON.stringify(body.settings);
    }
    db.update(schema.tenants).set(updateData).where(eq(schema.tenants.id, req.params.id)).run();
    const updated = db.select().from(schema.tenants).where(eq(schema.tenants.id, req.params.id)).get();
    if (!updated) return res.status(404).json({ error: 'Tenant not found' });
    res.json(withTenantAccess(updated));
  } catch (err) {
    console.error('PATCH /api/tenants/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════
// SUBSCRIPTION & PACKAGES (TENANT APP)
// ═══════════════════════════════════════════════════════════

app.get('/api/packages', (_req, res) => {
  try {
    return res.status(410).json({ error: 'HKDPlus local không sử dụng package' });
  } catch (err) {
    console.error('GET /api/packages error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/subscriptions/request-upgrade', (req, res) => {
  res.status(410).json({ error: 'Tính năng gói dịch vụ không còn được sử dụng trong HKDPlus local' });
});

app.get('/api/subscriptions/me', (req, res) => {
  res.status(410).json({ error: 'HKDPlus local không sử dụng subscription' });
});

// ═══════════════════════════════════════════════════════════
// USERS
// ═══════════════════════════════════════════════════════════

app.get('/api/users', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'settings.manage_users')) return;
    const users = db.select().from(schema.users)
      .where(eq(schema.users.tenantId, req.user.tenantId)).all();
    res.json(users.map(({ password: _, ...user }) => user));
  } catch (err) {
    console.error('GET /api/users error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/users/:id', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'settings.manage_users')) return;
    const user = db.select().from(schema.users)
      .where(and(eq(schema.users.id, req.params.id), eq(schema.users.tenantId, req.user.tenantId))).get();
    if (!user) return res.status(404).json({ error: 'User not found' });
    const { password: _, ...userData } = user;
    res.json(userData);
  } catch (err) {
    console.error('GET /api/users/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'settings.manage_users')) return;
    const { name, email, password, phone, role, status } = req.body || {};
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'name, email, password, role are required' });
    }

    const allowedRoles = ['manager', 'cashier', 'warehouse'];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ error: 'Vai trò không hợp lệ. Chọn quản lý, bán hàng hoặc kho.' });
    }

    const existing = db.select().from(schema.users).where(eq(schema.users.email, email)).get();
    if (existing) return res.status(400).json({ error: 'Email already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = {
      id: uuid(),
      name,
      email,
      password: hashedPassword,
      phone: phone || '',
      role,
      tenantId: req.user.tenantId,
      status: status === 'inactive' ? 'inactive' as const : 'active' as const,
    };

    db.insert(schema.users).values(user).run();
    const { password: _password, ...response } = user;
    res.status(201).json(response);
  } catch (err) {
    console.error('POST /api/users error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.patch('/api/users/:id', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'settings.manage_users')) return;
    const existing = db.select().from(schema.users)
      .where(and(eq(schema.users.id, req.params.id), eq(schema.users.tenantId, req.user.tenantId)))
      .get();
    if (!existing) return res.status(404).json({ error: 'User not found' });

    const updates: any = {};
    const allowedRoles = ['manager', 'cashier', 'warehouse', 'owner'];

    if (req.body.name !== undefined) updates.name = req.body.name;
    if (req.body.phone !== undefined) updates.phone = req.body.phone;
    if (req.body.status !== undefined) updates.status = req.body.status === 'inactive' ? 'inactive' : 'active';
    if (req.body.role !== undefined) {
      if (!allowedRoles.includes(req.body.role)) {
        return res.status(400).json({ error: 'Invalid role' });
      }
      if (existing.id === req.user.id && req.body.role !== 'owner') {
        return res.status(400).json({ error: 'Owner cannot downgrade own role' });
      }
      updates.role = req.body.role;
    }
    if (req.body.password) {
      updates.password = await bcrypt.hash(req.body.password, 10);
    }

    db.update(schema.users).set(updates).where(eq(schema.users.id, existing.id)).run();
    const updated = db.select().from(schema.users).where(eq(schema.users.id, existing.id)).get();
    if (!updated) return res.status(404).json({ error: 'User not found' });
    const { password: _password, ...response } = updated;
    res.json(response);
  } catch (err) {
    console.error('PATCH /api/users/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/users/:id', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'settings.manage_users')) return;
    const existing = db.select().from(schema.users)
      .where(and(eq(schema.users.id, req.params.id), eq(schema.users.tenantId, req.user.tenantId)))
      .get();
    if (!existing) return res.status(404).json({ error: 'User not found' });
    if (existing.role === 'owner') {
      return res.status(400).json({ error: 'Cannot delete owner account' });
    }
    db.delete(schema.users).where(eq(schema.users.id, req.params.id)).run();
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/users/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════
// CATEGORIES
// ═══════════════════════════════════════════════════════════

app.get('/api/categories', (req, res) => {
  try {
    res.json(db.select().from(schema.categories)
      .where(eq(schema.categories.tenantId, req.user.tenantId)).all());
  } catch (err) {
    console.error('GET /api/categories error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/categories', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'inventory.create')) return;
    const category = { id: uuid(), ...req.body, tenantId: req.user.tenantId };
    db.insert(schema.categories).values(category).run();
    res.status(201).json(category);
  } catch (err) {
    console.error('POST /api/categories error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════
// PRODUCTS
// ═══════════════════════════════════════════════════════════

app.get('/api/products', (req, res) => {
  try {
    const { category, search } = req.query;
    let allProducts = db.select().from(schema.products)
      .where(eq(schema.products.tenantId, req.user.tenantId)).all();

    // Apply additional filters in-memory for simplicity
    if (category && category !== 'all') {
      allProducts = allProducts.filter(p => p.category === category);
    }
    if (search) {
      const searchStr = (search as string).toLowerCase();
      allProducts = allProducts.filter(p =>
        p.name.toLowerCase().includes(searchStr) ||
        p.sku.toLowerCase().includes(searchStr)
      );
    }

    res.json(allProducts);
  } catch (err) {
    console.error('GET /api/products error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/products/:id', (req, res) => {
  try {
    const product = db.select().from(schema.products)
      .where(and(eq(schema.products.id, req.params.id), eq(schema.products.tenantId, req.user.tenantId))).get();
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (err) {
    console.error('GET /api/products/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/products', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'inventory.create')) return;
    const product = { id: uuid(), ...req.body, tenantId: req.user.tenantId };
    db.insert(schema.products).values(product).run();
    res.status(201).json(product);
  } catch (err) {
    console.error('POST /api/products error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.patch('/api/products/:id', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'inventory.update')) return;
    const product = db.select().from(schema.products)
      .where(and(eq(schema.products.id, req.params.id), eq(schema.products.tenantId, req.user.tenantId))).get();
    if (!product) return res.status(404).json({ error: 'Product not found' });
    const { tenantId: _tenantId, stock: _stock, ...updates } = req.body;
    db.update(schema.products).set(updates).where(eq(schema.products.id, req.params.id)).run();
    const updated = db.select().from(schema.products).where(eq(schema.products.id, req.params.id)).get();
    if (!updated) return res.status(404).json({ error: 'Product not found' });
    res.json(updated);
  } catch (err) {
    console.error('PATCH /api/products/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/products/:id', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'inventory.delete')) return;
    const product = db.select().from(schema.products)
      .where(and(eq(schema.products.id, req.params.id), eq(schema.products.tenantId, req.user.tenantId))).get();
    if (!product) return res.status(404).json({ error: 'Product not found' });
    db.delete(schema.products).where(eq(schema.products.id, req.params.id)).run();
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/products/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Stock adjustment endpoint
app.post('/api/products/:id/stock', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'inventory.adjust')) return;
    const { quantity, type, note } = req.body; // type: 'decrease' | 'increase'
    const product = db.select().from(schema.products)
      .where(and(eq(schema.products.id, req.params.id), eq(schema.products.tenantId, req.user.tenantId))).get();
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const qty = Number(quantity) || 0;
    if (qty <= 0) return res.status(400).json({ error: 'Quantity must be greater than 0' });

    const beforeStock = product.stock;
    const newStock = type === 'decrease'
      ? product.stock - qty
      : product.stock + qty;
    const afterStock = Math.max(0, newStock);

    db.update(schema.products)
      .set({ stock: afterStock })
      .where(eq(schema.products.id, req.params.id))
      .run();

    db.insert(schema.stockMovements).values({
      id: uuid(),
      tenantId: req.user.tenantId,
      productId: req.params.id,
      type: type === 'decrease' ? 'out' : 'in',
      quantity: qty,
      beforeStock,
      afterStock,
      note: note || (type === 'decrease' ? 'Xuất kho' : 'Nhập kho'),
      referenceId: null,
      createdAt: new Date().toISOString(),
      createdBy: req.user.id,
    }).run();

    const updated = db.select().from(schema.products).where(eq(schema.products.id, req.params.id)).get();
    res.json(updated);
  } catch (err) {
    console.error('POST /api/products/:id/stock error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════
// SUPPLIERS / PURCHASES
// ═══════════════════════════════════════════════════════════
app.get('/api/suppliers', (req, res) => {
  try {
    let rows = db.select().from(schema.suppliers)
      .where(eq(schema.suppliers.tenantId, req.user.tenantId)).all();
    const search = String(req.query.search || '').trim().toLowerCase();
    if (search) rows = rows.filter((row) => `${row.code} ${row.name} ${row.phone}`.toLowerCase().includes(search));
    res.json(rows);
  } catch (err) {
    console.error('GET /api/suppliers error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/suppliers', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'partners.create')) return;
    const { code, name, phone = '', taxCode = null, address = '', note = '' } = req.body || {};
    if (!name) return res.status(400).json({ error: 'Supplier name is required' });
    const supplier = { id: uuid(), tenantId: req.user.tenantId, code: code || `NCC-${Date.now()}`, name, phone, taxCode, address, note, currentPayable: 0, active: true };
    db.insert(schema.suppliers).values(supplier).run();
    res.status(201).json(supplier);
  } catch (err) {
    console.error('POST /api/suppliers error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.patch('/api/suppliers/:id', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'partners.update')) return;
    const supplier = db.select().from(schema.suppliers).where(and(eq(schema.suppliers.id, req.params.id), eq(schema.suppliers.tenantId, req.user.tenantId))).get();
    if (!supplier) return res.status(404).json({ error: 'Supplier not found' });
    const { tenantId: _tenantId, currentPayable: _payable, ...updates } = req.body || {};
    db.update(schema.suppliers).set(updates).where(eq(schema.suppliers.id, supplier.id)).run();
    res.json(db.select().from(schema.suppliers).where(eq(schema.suppliers.id, supplier.id)).get());
  } catch (err) {
    console.error('PATCH /api/suppliers/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/purchases', (req, res) => {
  try {
    const rows = db.select().from(schema.purchases).where(eq(schema.purchases.tenantId, req.user.tenantId)).orderBy(desc(schema.purchases.createdAt)).all();
    res.json(rows.map((purchase) => ({ ...purchase, supplier: db.select().from(schema.suppliers).where(eq(schema.suppliers.id, purchase.supplierId)).get() || null })));
  } catch (err) {
    console.error('GET /api/purchases error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/purchases/:id', (req, res) => {
  try {
    const purchase = db.select().from(schema.purchases).where(and(eq(schema.purchases.id, req.params.id), eq(schema.purchases.tenantId, req.user.tenantId))).get();
    if (!purchase) return res.status(404).json({ error: 'Purchase not found' });
    const items = db.select().from(schema.purchaseItems).where(eq(schema.purchaseItems.purchaseId, purchase.id)).all();
    res.json({ ...purchase, items, supplier: db.select().from(schema.suppliers).where(eq(schema.suppliers.id, purchase.supplierId)).get() || null });
  } catch (err) {
    console.error('GET /api/purchases/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/purchases', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'purchases.create')) return;
    const { supplierId, items = [], paidAmount = 0, paymentMethod = 'payable', taxAmount = 0, note = '', createdAt } = req.body || {};
    const supplier = db.select().from(schema.suppliers).where(and(eq(schema.suppliers.id, supplierId), eq(schema.suppliers.tenantId, req.user.tenantId))).get();
    if (!supplier) return res.status(400).json({ error: 'Supplier not found' });
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'At least one purchase item is required' });
    const normalizedItems = items.map((item: any) => {
      const quantity = Number(item.quantity) || 0;
      const price = Number(item.price) || 0;
      if (!item.productId || quantity <= 0 || price < 0) throw new Error('Invalid purchase item');
      return { ...item, quantity, price, taxRate: Number(item.taxRate) || 0, total: quantity * price };
    });
    const totalAmount = normalizedItems.reduce((sum: number, item: any) => sum + item.total, 0);
    const finalAmount = totalAmount + (Number(taxAmount) || 0);
    const paid = Math.min(finalAmount, Math.max(0, Number(paidAmount) || 0));
    const payable = finalAmount - paid;
    const purchaseId = uuid();
    const documentNo = String(req.body?.documentNo || nextDocumentNo(req.user.tenantId, 'purchase', 'PN'));
    const timestamp = createdAt || new Date().toISOString();
    const status = payable <= 0 ? 'confirmed' : paid > 0 ? 'partial' : 'unpaid';

    db.transaction((tx) => {
      tx.insert(schema.purchases).values({ id: purchaseId, documentNo, tenantId: req.user.tenantId, supplierId, createdBy: req.user.id, totalAmount, taxAmount: Number(taxAmount) || 0, finalAmount, paidAmount: paid, payableAmount: payable, paymentMethod, status, note, createdAt: timestamp }).run();
      for (const item of normalizedItems) {
        const product = tx.select().from(schema.products).where(and(eq(schema.products.id, item.productId), eq(schema.products.tenantId, req.user.tenantId))).get();
        if (!product) throw new Error(`Product not found: ${item.productId}`);
        const beforeStock = product.stock;
        const afterStock = product.trackStock ? beforeStock + item.quantity : beforeStock;
        if (product.trackStock) {
          tx.update(schema.products).set({ stock: afterStock, purchasePrice: item.price }).where(eq(schema.products.id, product.id)).run();
          tx.insert(schema.stockMovements).values({ id: uuid(), tenantId: req.user.tenantId, productId: product.id, type: 'in', quantity: item.quantity, beforeStock, afterStock, note: `Nhập hàng ${purchaseId}`, referenceId: purchaseId, createdAt: timestamp, createdBy: req.user.id }).run();
        }
        tx.insert(schema.purchaseItems).values({ id: uuid(), purchaseId, productId: product.id, productName: product.name, unit: product.unit, quantity: item.quantity, price: item.price, taxRate: item.taxRate, total: item.total }).run();
      }
      if (payable > 0) {
        tx.update(schema.suppliers).set({ currentPayable: supplier.currentPayable + payable }).where(eq(schema.suppliers.id, supplier.id)).run();
        tx.insert(schema.payableLedger).values({ id: uuid(), tenantId: req.user.tenantId, supplierId: supplier.id, purchaseId, amount: payable, type: 'increase', note: 'Nhập hàng chưa thanh toán đủ', createdAt: timestamp, createdBy: req.user.id }).run();
      }
      if (paid > 0) tx.insert(schema.cashbookEntries).values({ id: uuid(), tenantId: req.user.tenantId, type: 'expense', amount: paid, category: 'Nhập hàng', note: `Thanh toán nhập hàng ${purchaseId}`, referenceId: purchaseId, createdAt: timestamp, createdBy: req.user.id }).run();
    });
    res.status(201).json(db.select().from(schema.purchases).where(eq(schema.purchases.id, purchaseId)).get());
  } catch (err) {
    console.error('POST /api/purchases error:', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Could not create purchase' });
  }
});

app.get('/api/payable-ledger', (req, res) => {
  try {
    let rows = db.select().from(schema.payableLedger).where(eq(schema.payableLedger.tenantId, req.user.tenantId)).orderBy(desc(schema.payableLedger.createdAt)).all();
    if (req.query.supplierId) rows = rows.filter((row) => row.supplierId === req.query.supplierId);
    res.json(rows);
  } catch (err) {
    console.error('GET /api/payable-ledger error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/payable-ledger', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'debt.collect')) return;
    const { supplierId, amount, note = '' } = req.body || {};
    const supplier = db.select().from(schema.suppliers).where(and(eq(schema.suppliers.id, supplierId), eq(schema.suppliers.tenantId, req.user.tenantId))).get();
    const payment = Number(amount) || 0;
    if (!supplier || payment <= 0) return res.status(400).json({ error: 'Supplier and positive amount are required' });
    const timestamp = new Date().toISOString();
    const entry = { id: uuid(), tenantId: req.user.tenantId, supplierId, purchaseId: null, amount: Math.min(payment, supplier.currentPayable), type: 'decrease' as const, note: note || 'Thanh toán nhà cung cấp', createdAt: timestamp, createdBy: req.user.id };
    db.transaction((tx) => {
      tx.insert(schema.payableLedger).values(entry).run();
      tx.update(schema.suppliers).set({ currentPayable: Math.max(0, supplier.currentPayable - entry.amount) }).where(eq(schema.suppliers.id, supplierId)).run();
      tx.insert(schema.cashbookEntries).values({ id: uuid(), tenantId: req.user.tenantId, type: 'expense', amount: entry.amount, category: 'Thanh toán NCC', note: entry.note, referenceId: entry.id, createdAt: timestamp, createdBy: req.user.id }).run();
    });
    res.status(201).json(entry);
  } catch (err) {
    console.error('POST /api/payable-ledger error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════
// CUSTOMERS
// ═══════════════════════════════════════════════════════════

app.get('/api/customers', (req, res) => {
  try {
    const { search } = req.query;
    const tenantUsers = db.select().from(schema.users)
      .where(eq(schema.users.tenantId, req.user.tenantId)).all();
    const userNameById = new Map(tenantUsers.map((u) => [u.id, u.name]));
    let allCustomers = db.select().from(schema.customers)
      .where(eq(schema.customers.tenantId, req.user.tenantId)).all();

    if (search) {
      const searchStr = (search as string).toLowerCase();
      allCustomers = allCustomers.filter(c =>
        c.name.toLowerCase().includes(searchStr) ||
        c.phone.includes(searchStr)
      );
    }

    res.json(
      allCustomers.map((customer) => ({
        ...customer,
        tags: customer.tags ? JSON.parse(customer.tags) : [],
        createdByName: customer.createdBy ? userNameById.get(customer.createdBy) || null : null,
      }))
    );
  } catch (err) {
    console.error('GET /api/customers error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/customers/:id', (req, res) => {
  try {
    const tenantUsers = db.select().from(schema.users)
      .where(eq(schema.users.tenantId, req.user.tenantId)).all();
    const userNameById = new Map(tenantUsers.map((u) => [u.id, u.name]));
    const customer = db.select().from(schema.customers)
      .where(and(eq(schema.customers.id, req.params.id), eq(schema.customers.tenantId, req.user.tenantId))).get();
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    res.json({
      ...customer,
      tags: customer.tags ? JSON.parse(customer.tags) : [],
      createdByName: customer.createdBy ? userNameById.get(customer.createdBy) || null : null,
    });
  } catch (err) {
    console.error('GET /api/customers/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/customers', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'partners.create')) return;
    const customer = {
      id: uuid(),
      totalDebt: 0,
      ...req.body,
      tags: JSON.stringify(Array.isArray(req.body?.tags) ? req.body.tags : []),
      tenantId: req.user.tenantId,
      createdBy: req.user.id
    };
    db.insert(schema.customers).values(customer).run();
    const creator = db.select().from(schema.users).where(eq(schema.users.id, req.user.id)).get();
    res.status(201).json({ ...customer, tags: customer.tags ? JSON.parse(customer.tags) : [], createdByName: creator?.name || null });
  } catch (err) {
    console.error('POST /api/customers error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.patch('/api/customers/:id', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'partners.update')) return;
    const customer = db.select().from(schema.customers)
      .where(and(eq(schema.customers.id, req.params.id), eq(schema.customers.tenantId, req.user.tenantId))).get();
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    const { tenantId: _tenantId, tags, ...updates } = req.body;
    const patchData: any = { ...updates };
    if (tags !== undefined) {
      patchData.tags = JSON.stringify(Array.isArray(tags) ? tags : []);
    }
    db.update(schema.customers).set(patchData).where(eq(schema.customers.id, req.params.id)).run();
    const updated = db.select().from(schema.customers).where(eq(schema.customers.id, req.params.id)).get();
    if (!updated) return res.status(404).json({ error: 'Customer not found' });
    res.json({ ...updated, tags: updated.tags ? JSON.parse(updated.tags) : [] });
  } catch (err) {
    console.error('PATCH /api/customers/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════
// CUSTOMER CARE LOGS (CRM-Lite)
// ═══════════════════════════════════════════════════════════
app.get('/api/customer-care-logs', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'partners.view')) return;
    const { customerId } = req.query;
    const tenantUsers = db.select().from(schema.users)
      .where(eq(schema.users.tenantId, req.user.tenantId)).all();
    const userNameById = new Map(tenantUsers.map((u) => [u.id, u.name]));

    let rows = db.select().from(schema.customerCareLogs)
      .where(eq(schema.customerCareLogs.tenantId, req.user.tenantId))
      .orderBy(desc(schema.customerCareLogs.createdAt)).all();
    if (customerId) rows = rows.filter((r) => r.customerId === customerId);

    res.json(rows.map((row) => ({
      ...row,
      createdByName: userNameById.get(row.createdBy) || null,
    })));
  } catch (err) {
    console.error('GET /api/customer-care-logs error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/customer-care-logs', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'partners.update')) return;
    const payload = req.body || {};
    const customer = db.select().from(schema.customers)
      .where(and(eq(schema.customers.id, payload.customerId), eq(schema.customers.tenantId, req.user.tenantId))).get();
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const entry = {
      id: uuid(),
      tenantId: req.user.tenantId,
      customerId: payload.customerId,
      channel: payload.channel || 'zalo',
      templateType: payload.templateType || 'due_today',
      message: payload.message || '',
      dueDate: payload.dueDate || null,
      status: payload.status || 'sent',
      responded: !!payload.responded,
      note: payload.note || '',
      createdAt: new Date().toISOString(),
      createdBy: req.user.id,
    };
    db.insert(schema.customerCareLogs).values(entry).run();
    const creator = db.select().from(schema.users).where(eq(schema.users.id, req.user.id)).get();
    res.status(201).json({ ...entry, createdByName: creator?.name || null });
  } catch (err) {
    console.error('POST /api/customer-care-logs error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.patch('/api/customer-care-logs/:id', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'partners.update')) return;
    const log = db.select().from(schema.customerCareLogs)
      .where(and(eq(schema.customerCareLogs.id, req.params.id), eq(schema.customerCareLogs.tenantId, req.user.tenantId))).get();
    if (!log) return res.status(404).json({ error: 'Care log not found' });
    const updates: any = {};
    if (req.body?.status) updates.status = req.body.status;
    if (typeof req.body?.responded === 'boolean') updates.responded = req.body.responded;
    if (typeof req.body?.note === 'string') updates.note = req.body.note;
    db.update(schema.customerCareLogs).set(updates).where(eq(schema.customerCareLogs.id, req.params.id)).run();
    const updated = db.select().from(schema.customerCareLogs).where(eq(schema.customerCareLogs.id, req.params.id)).get();
    if (!updated) return res.status(404).json({ error: 'Care log not found' });
    const creator = db.select().from(schema.users).where(eq(schema.users.id, updated.createdBy)).get();
    res.json({ ...updated, createdByName: creator?.name || null });
  } catch (err) {
    console.error('PATCH /api/customer-care-logs/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Customer debt adjustment
app.post('/api/customers/:id/debt', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'debt.collect')) return;
    const { amount, type } = req.body; // type: 'increase' | 'decrease'
    const customer = db.select().from(schema.customers)
      .where(and(eq(schema.customers.id, req.params.id), eq(schema.customers.tenantId, req.user.tenantId))).get();
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const newDebt = type === 'increase'
      ? customer.totalDebt + amount
      : Math.max(0, customer.totalDebt - amount);

    db.update(schema.customers)
      .set({ totalDebt: newDebt })
      .where(eq(schema.customers.id, req.params.id))
      .run();

    const updated = db.select().from(schema.customers).where(eq(schema.customers.id, req.params.id)).get();
    res.json(updated);
  } catch (err) {
    console.error('POST /api/customers/:id/debt error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════
// INVOICES
// ═══════════════════════════════════════════════════════════

app.get('/api/invoices', (req, res) => {
  try {
    const { customerId, status } = req.query;
    const tenantUsers = db.select().from(schema.users)
      .where(eq(schema.users.tenantId, req.user.tenantId)).all();
    const userNameById = new Map(tenantUsers.map((u) => [u.id, u.name]));
    let allInvoices = db.select().from(schema.invoices)
      .where(eq(schema.invoices.tenantId, req.user.tenantId))
      .orderBy(desc(schema.invoices.createdAt)).all();

    if (customerId) {
      allInvoices = allInvoices.filter(i => i.customerId === customerId);
    }
    if (status && status !== 'all') {
      allInvoices = allInvoices.filter(i => i.status === status);
    }

    res.json(
      allInvoices.map((invoice) => ({
        ...invoice,
        createdByName: userNameById.get(invoice.createdBy) || null,
      }))
    );
  } catch (err) {
    console.error('GET /api/invoices error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/invoices/:id', (req, res) => {
  try {
    const tenantUsers = db.select().from(schema.users)
      .where(eq(schema.users.tenantId, req.user.tenantId)).all();
    const userNameById = new Map(tenantUsers.map((u) => [u.id, u.name]));
    const invoice = db.select().from(schema.invoices)
      .where(and(eq(schema.invoices.id, req.params.id), eq(schema.invoices.tenantId, req.user.tenantId))).get();
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    // Also fetch invoice items
    const items = db.select().from(schema.invoiceItems).where(eq(schema.invoiceItems.invoiceId, req.params.id)).all();

    res.json({ ...invoice, createdByName: userNameById.get(invoice.createdBy) || null, items });
  } catch (err) {
    console.error('GET /api/invoices/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/invoices', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'sales.create')) return;
    const { items, ...invoiceData } = req.body;
    const invoiceId = invoiceData.id || uuid();
    const documentNo = String(invoiceData.documentNo || nextDocumentNo(req.user.tenantId, 'sale', 'HD'));
    const invoice = {
      ...invoiceData,
      id: invoiceId,
      documentNo,
      tenantId: req.user.tenantId,
      createdBy: req.user.id,
      createdAt: invoiceData.createdAt || new Date().toISOString()
    };

    db.insert(schema.invoices).values(invoice).run();

    // Insert invoice items
    if (items && items.length > 0) {
      const itemsWithIds = items.map((item: any) => ({
        ...item,
        id: item.id || uuid(),
        invoiceId,
      }));
      db.insert(schema.invoiceItems).values(itemsWithIds).run();
    }

    // Update product stock
    if (items && items.length > 0) {
      for (const item of items) {
        const product = db.select().from(schema.products)
          .where(and(eq(schema.products.id, item.productId), eq(schema.products.tenantId, req.user.tenantId))).get();
        if (product && product.trackStock) {
          const beforeStock = product.stock;
          const afterStock = Math.max(0, product.stock - item.quantity);
          db.update(schema.products)
            .set({ stock: afterStock })
            .where(eq(schema.products.id, item.productId))
            .run();
          db.insert(schema.stockMovements).values({
            id: uuid(),
            tenantId: req.user.tenantId,
            productId: item.productId,
            type: 'out',
            quantity: Number(item.quantity) || 0,
            beforeStock,
            afterStock,
            note: `Bán hàng ${invoiceId}`,
            referenceId: invoiceId,
            createdAt: invoice.createdAt,
            createdBy: req.user.id,
          }).run();
        }
      }
    }

    // Update customer debt if applicable
    if (invoice.debtAmount > 0 && invoice.customerId) {
      const customer = db.select().from(schema.customers)
        .where(and(eq(schema.customers.id, invoice.customerId), eq(schema.customers.tenantId, req.user.tenantId)))
        .get();
      if (customer) {
        db.update(schema.customers)
          .set({ totalDebt: customer.totalDebt + invoice.debtAmount })
          .where(and(eq(schema.customers.id, invoice.customerId), eq(schema.customers.tenantId, req.user.tenantId)))
          .run();
      }

      // Add debt ledger entry
      db.insert(schema.debtLedger).values({
        id: uuid(),
        tenantId: invoice.tenantId,
        customerId: invoice.customerId,
        invoiceId: invoiceId,
        amount: invoice.debtAmount,
        type: 'increase',
        note: 'Mua hàng nợ',
        createdAt: invoice.createdAt,
        createdBy: invoice.createdBy,
      }).run();
    }

    if ((invoice.paidAmount || 0) > 0 && invoice.paymentMethod !== 'debt') {
      db.insert(schema.cashbookEntries).values({
        id: uuid(),
        tenantId: req.user.tenantId,
        type: 'income',
        amount: Number(invoice.paidAmount) || 0,
        category: 'Bán hàng',
        note: `Thu từ hóa đơn ${invoiceId}`,
        referenceId: invoiceId,
        createdAt: invoice.createdAt,
        createdBy: req.user.id,
      }).run();
    }

    res.status(201).json(invoice);
  } catch (err) {
    console.error('POST /api/invoices error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════
// CASHBOOK
// ═══════════════════════════════════════════════════════════
app.get('/api/cashbook', (req, res) => {
  try {
    const { from, to, type } = req.query;
    const rows = db.select().from(schema.cashbookEntries)
      .where(eq(schema.cashbookEntries.tenantId, req.user.tenantId))
      .orderBy(desc(schema.cashbookEntries.createdAt))
      .all()
      .filter((row) => {
        if (type && row.type !== type) return false;
        if (from && new Date(row.createdAt).getTime() < new Date(String(from)).getTime()) return false;
        if (to && new Date(row.createdAt).getTime() > (new Date(String(to)).getTime() + 24 * 60 * 60 * 1000 - 1)) return false;
        return true;
      });
    res.json(rows);
  } catch (err) {
    console.error('GET /api/cashbook error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/cashbook', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'cashbook.create')) return;
    const { type, amount, category, note, referenceId } = req.body || {};
    if (!type || !['income', 'expense'].includes(type)) return res.status(400).json({ error: 'Invalid type' });
    const amt = Number(amount) || 0;
    if (amt <= 0) return res.status(400).json({ error: 'Amount must be greater than 0' });

    const entry = {
      id: uuid(),
      tenantId: req.user.tenantId,
      type,
      amount: amt,
      category: category || 'Khác',
      note: note || '',
      referenceId: referenceId || null,
      createdAt: new Date().toISOString(),
      createdBy: req.user.id,
    };
    db.insert(schema.cashbookEntries).values(entry).run();
    res.status(201).json(entry);
  } catch (err) {
    console.error('POST /api/cashbook error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════
// STOCK MOVEMENTS / STOCK CHECK
// ═══════════════════════════════════════════════════════════
app.get('/api/stock-movements', (req, res) => {
  try {
    const { productId } = req.query;
    let rows = db.select().from(schema.stockMovements)
      .where(eq(schema.stockMovements.tenantId, req.user.tenantId))
      .orderBy(desc(schema.stockMovements.createdAt))
      .all();
    if (productId) rows = rows.filter((r) => r.productId === productId);

    const relatedProductIds = Array.from(new Set(rows.map((r) => r.productId)));
    const relatedUserIds = Array.from(new Set(rows.map((r) => r.createdBy)));
    const relatedProducts = relatedProductIds.length
      ? db.select().from(schema.products)
          .where(and(
            eq(schema.products.tenantId, req.user.tenantId),
            inArray(schema.products.id, relatedProductIds)
          ))
          .all()
      : [];
    const relatedUsers = relatedUserIds.length
      ? db.select().from(schema.users)
          .where(and(
            eq(schema.users.tenantId, req.user.tenantId),
            inArray(schema.users.id, relatedUserIds)
          ))
          .all()
      : [];

    const productMap = new Map(relatedProducts.map((p) => [p.id, p]));
    const userMap = new Map(relatedUsers.map((u) => [u.id, u]));

    const enriched = rows.map((row) => {
      const product = productMap.get(row.productId);
      const actor = userMap.get(row.createdBy);
      return {
        ...row,
        productName: product?.name || 'Sản phẩm đã xóa',
        productSku: product?.sku || '',
        productUnit: product?.unit || '',
        actorName: actor?.name || 'N/A',
        actorRole: actor?.role || '',
      };
    });

    res.json(enriched);
  } catch (err) {
    console.error('GET /api/stock-movements error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/stock-check', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'inventory.adjust')) return;
    const { productId, actualStock, note } = req.body || {};
    const product = db.select().from(schema.products)
      .where(and(eq(schema.products.id, productId), eq(schema.products.tenantId, req.user.tenantId))).get();
    if (!product) return res.status(404).json({ error: 'Product not found' });
    const actual = Number(actualStock);
    if (!Number.isFinite(actual) || actual < 0) return res.status(400).json({ error: 'Invalid actualStock' });

    const beforeStock = product.stock;
    const afterStock = actual;
    db.update(schema.products).set({ stock: afterStock }).where(eq(schema.products.id, productId)).run();
    const movement = {
      id: uuid(),
      tenantId: req.user.tenantId,
      productId,
      type: 'adjust' as const,
      quantity: Math.abs(afterStock - beforeStock),
      beforeStock,
      afterStock,
      note: note || 'Kiểm kê kho',
      referenceId: null,
      createdAt: new Date().toISOString(),
      createdBy: req.user.id,
    };
    db.insert(schema.stockMovements).values(movement).run();
    res.json(movement);
  } catch (err) {
    console.error('POST /api/stock-check error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════
// INVOICE ITEMS
// ═══════════════════════════════════════════════════════════

app.get('/api/invoice-items', (req, res) => {
  try {
    const { invoiceId } = req.query;
    if (!invoiceId) return res.status(400).json({ error: 'invoiceId query param required' });
    const invoice = db.select().from(schema.invoices)
      .where(and(eq(schema.invoices.id, invoiceId as string), eq(schema.invoices.tenantId, req.user.tenantId))).get();
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    const items = db.select().from(schema.invoiceItems).where(eq(schema.invoiceItems.invoiceId, invoiceId as string)).all();
    res.json(items);
  } catch (err) {
    console.error('GET /api/invoice-items error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════
// DEBT LEDGER
// ═══════════════════════════════════════════════════════════

app.get('/api/debt-ledger', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'debt.view')) return;
    const { customerId } = req.query;
    let allEntries = db.select().from(schema.debtLedger)
      .where(eq(schema.debtLedger.tenantId, req.user.tenantId))
      .orderBy(desc(schema.debtLedger.createdAt)).all();

    if (customerId) {
      allEntries = allEntries.filter(e => e.customerId === customerId);
    }

    res.json(allEntries);
  } catch (err) {
    console.error('GET /api/debt-ledger error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/debt-ledger', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'debt.collect')) return;
    const customer = db.select().from(schema.customers)
      .where(and(eq(schema.customers.id, req.body.customerId), eq(schema.customers.tenantId, req.user.tenantId))).get();
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const entry = {
      id: uuid(),
      createdAt: new Date().toISOString(),
      ...req.body,
      tenantId: req.user.tenantId,
      createdBy: req.user.id,
    };
    db.insert(schema.debtLedger).values(entry).run();

    // Update customer debt
    const newDebt = entry.type === 'increase'
      ? customer.totalDebt + entry.amount
      : Math.max(0, customer.totalDebt - entry.amount);
    db.update(schema.customers)
      .set({ totalDebt: newDebt })
      .where(eq(schema.customers.id, entry.customerId))
      .run();

    if (entry.type === 'decrease') {
      db.insert(schema.cashbookEntries).values({
        id: uuid(),
        tenantId: req.user.tenantId,
        type: 'income',
        amount: Number(entry.amount) || 0,
        category: 'Thu nợ',
        note: entry.note || `Thu nợ khách ${customer.name}`,
        referenceId: entry.invoiceId || null,
        createdAt: entry.createdAt,
        createdBy: req.user.id,
      }).run();
    }

    res.status(201).json(entry);
  } catch (err) {
    console.error('POST /api/debt-ledger error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════
// DASHBOARD STATS
// ═══════════════════════════════════════════════════════════

app.get('/api/dashboard/stats', (req, res) => {
  try {
    const tid = req.user.tenantId;

    // Today's date range
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const allInvoices = db.select().from(schema.invoices)
      .where(eq(schema.invoices.tenantId, tid)).all();

    const todayInvoices = allInvoices.filter(i => {
      const d = new Date(i.createdAt);
      return d >= todayStart && d <= todayEnd;
    });

    const todayRevenue = todayInvoices.reduce((sum, i) => sum + i.paidAmount, 0);
    const todayOrders = todayInvoices.length;

    const allCustomers = db.select().from(schema.customers)
      .where(eq(schema.customers.tenantId, tid)).all();
    const totalDebt = allCustomers.reduce((sum, c) => sum + c.totalDebt, 0);

    const allProducts = db.select().from(schema.products)
      .where(eq(schema.products.tenantId, tid)).all();
    const lowStockProducts = allProducts.filter(p => p.trackStock && p.stock <= p.lowStockThreshold);

    res.json({
      todayRevenue,
      todayOrders,
      totalDebt,
      lowStockCount: lowStockProducts.length,
      totalProducts: allProducts.length,
      totalCustomers: allCustomers.length,
    });
  } catch (err) {
    console.error('GET /api/dashboard/stats error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Start Server ───────────────────────────────────────────
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Image payload too large. Please upload a smaller image.' });
  }
  console.error('Unhandled server error:', err);
  return res.status(500).json({ error: 'Internal server error' });
});

const startServer = async () => {
  await bootstrapAdminAccount();

  app.listen(PORT, () => {
    console.log(`\n🚀 HKDCare API đang chạy tại http://localhost:${PORT}`);
    console.log(`   Health: http://localhost:${PORT}/api/health`);
    console.log(`   Docs:   All endpoints prefixed with /api/\n`);
  });
};

startServer().catch((err) => {
  console.error('Failed to start API server:', err);
  process.exit(1);
});
