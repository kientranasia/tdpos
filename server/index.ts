import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { db } from './db';
import * as schema from './schema';
import { eq, desc, and, like, sql, inArray, ne } from 'drizzle-orm';
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

const normalizeSearchText = (value: unknown) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/Đ/g, 'D')
  .toLowerCase()
  .trim();

const nextSupplierCode = (tenantId: string) => {
  const rows = sqlite.prepare('SELECT code FROM suppliers WHERE tenant_id = ?').all(tenantId) as Array<{ code: string }>;
  const usedCodes = new Set(rows.map((row) => String(row.code || '').toUpperCase()));
  const highest = rows.reduce((result, row) => {
    const match = String(row.code || '').match(/^NCC(\d{3})$/i);
    return match ? Math.max(result, Number(match[1])) : result;
  }, 0);
  let sequence = highest + 1;
  let code = `NCC${String(sequence).padStart(3, '0')}`;
  while (usedCodes.has(code)) {
    sequence += 1;
    code = `NCC${String(sequence).padStart(3, '0')}`;
  }
  return code;
};

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
const builtInRoles = ['owner', 'manager', 'cashier', 'warehouse', 'accountant'];
const isBuiltInRole = (role: string) => builtInRoles.includes(role);

const roleProfileFor = (tenantId: string, code: string) => db.select().from(schema.roleProfiles)
  .where(and(eq(schema.roleProfiles.tenantId, tenantId), eq(schema.roleProfiles.code, code))).get();

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
  if (!isBuiltInRole(req.user.role)) {
    const profile = roleProfileFor(req.user.tenantId, req.user.role);
    if (!profile) return false;
    const roleGrant = db.select().from(schema.roleProfilePermissions)
      .where(and(eq(schema.roleProfilePermissions.roleProfileId, profile.id), eq(schema.roleProfilePermissions.permissionCode, code))).get();
    return Boolean(roleGrant?.allowed);
  }
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
    ensureDefaultCashAccounts(tenantId);

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
    const profile = isBuiltInRole(req.user.role) ? null : roleProfileFor(req.user.tenantId, req.user.role);
    const roleGrants = isBuiltInRole(req.user.role)
      ? db.select().from(schema.rolePermissions).where(eq(schema.rolePermissions.role, req.user.role)).all()
      : profile ? db.select().from(schema.roleProfilePermissions).where(eq(schema.roleProfilePermissions.roleProfileId, profile.id)).all() : [];
    const userGrants = db.select().from(schema.userPermissions).where(and(eq(schema.userPermissions.tenantId, req.user.tenantId), eq(schema.userPermissions.userId, req.user.id))).all();
    const roleMap = new Map<string, boolean>(roleGrants.map((grant) => [String(grant.permissionCode), Boolean(grant.allowed)] as [string, boolean]));
    const userMap = new Map<string, boolean>(userGrants.map((grant) => [String(grant.permissionCode), Boolean(grant.allowed)] as [string, boolean]));
    res.json(grants.map((permission) => ({ ...permission, allowed: req.user.role === 'owner' ? true : userMap.has(permission.code) ? userMap.get(permission.code) : Boolean(roleMap.get(permission.code)) })));
  } catch (err) {
    console.error('GET /api/permissions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const rolePermissionRows = (role: string, tenantId: string) => {
  if (isBuiltInRole(role)) {
    return db.select().from(schema.rolePermissions).where(eq(schema.rolePermissions.role, role)).all();
  }
  const profile = roleProfileFor(tenantId, role);
  return profile ? db.select().from(schema.roleProfilePermissions).where(eq(schema.roleProfilePermissions.roleProfileId, profile.id)).all() : [];
};

app.get('/api/roles', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'settings.manage_permissions')) return;
    const permissionCount = new Map<string, number>();
    for (const role of builtInRoles) permissionCount.set(role, db.select().from(schema.rolePermissions).where(eq(schema.rolePermissions.role, role)).all().filter((grant) => grant.allowed).length);
    const builtIns = [
      { code: 'owner', name: 'Chủ cửa hàng', description: 'Toàn quyền trong cửa hàng.', builtIn: true },
      { code: 'manager', name: 'Quản lý', description: 'Điều hành bán hàng, kho và báo cáo.', builtIn: true },
      { code: 'cashier', name: 'Bán hàng', description: 'Lên đơn và chăm sóc khách tại quầy.', builtIn: true },
      { code: 'warehouse', name: 'Kho', description: 'Quản lý mặt hàng và nhập hàng.', builtIn: true },
      { code: 'accountant', name: 'Kế toán', description: 'Theo dõi công nợ, sổ quỹ và báo cáo.', builtIn: true },
    ].map((role) => ({ ...role, permissionCount: permissionCount.get(role.code) || 0 }));
    const custom = db.select().from(schema.roleProfiles).where(eq(schema.roleProfiles.tenantId, req.user.tenantId)).all().map((role) => ({
      code: role.code,
      name: role.name,
      description: role.description,
      builtIn: false,
      permissionCount: db.select().from(schema.roleProfilePermissions).where(and(eq(schema.roleProfilePermissions.roleProfileId, role.id), eq(schema.roleProfilePermissions.allowed, true))).all().length,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    }));
    res.json([...builtIns, ...custom]);
  } catch (err) {
    console.error('GET /api/roles error:', err);
    res.status(500).json({ error: 'Không thể tải danh sách vai trò' });
  }
});

app.get('/api/roles/:code/permissions', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'settings.manage_permissions')) return;
    const grants = rolePermissionRows(req.params.code, req.user.tenantId);
    const grantMap = new Map<string, boolean>(grants.map((grant) => [String(grant.permissionCode), Boolean(grant.allowed)] as [string, boolean]));
    res.json(db.select().from(schema.permissions).all().map((permission) => ({ ...permission, allowed: Boolean(grantMap.get(permission.code)) })));
  } catch (err) {
    console.error('GET /api/roles/:code/permissions error:', err);
    res.status(500).json({ error: 'Không thể tải quyền của vai trò' });
  }
});

app.post('/api/roles', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'settings.manage_permissions')) return;
    const code = String(req.body?.code || '').trim().toLowerCase();
    const name = String(req.body?.name || '').trim();
    const description = String(req.body?.description || '').trim();
    if (!/^[a-z][a-z0-9_-]{1,31}$/.test(code) || isBuiltInRole(code)) return res.status(400).json({ error: 'Mã vai trò không hợp lệ hoặc đã được hệ thống sử dụng' });
    if (!name) return res.status(400).json({ error: 'Tên vai trò là bắt buộc' });
    if (roleProfileFor(req.user.tenantId, code)) return res.status(400).json({ error: 'Mã vai trò đã tồn tại' });
    const now = new Date().toISOString();
    const profile = { id: uuid(), tenantId: req.user.tenantId, code, name, description, createdAt: now, updatedAt: now };
    const entries = Array.isArray(req.body?.permissions) ? req.body.permissions : [];
    const knownCodes = new Set(db.select({ code: schema.permissions.code }).from(schema.permissions).all().map((permission) => permission.code));
    db.transaction((tx) => {
      tx.insert(schema.roleProfiles).values(profile).run();
      for (const entry of entries) {
        if (typeof entry?.code !== 'string' || !knownCodes.has(entry.code) || typeof entry?.allowed !== 'boolean') continue;
        tx.insert(schema.roleProfilePermissions).values({ id: uuid(), roleProfileId: profile.id, permissionCode: entry.code, allowed: entry.allowed, updatedAt: now }).run();
      }
    });
    res.status(201).json({ ...profile, builtIn: false });
  } catch (err) {
    console.error('POST /api/roles error:', err);
    res.status(500).json({ error: 'Không thể tạo vai trò' });
  }
});

app.patch('/api/roles/:code', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'settings.manage_permissions')) return;
    if (isBuiltInRole(req.params.code)) return res.status(400).json({ error: 'Không sửa vai trò mặc định' });
    const profile = roleProfileFor(req.user.tenantId, req.params.code);
    if (!profile) return res.status(404).json({ error: 'Không tìm thấy vai trò' });
    const now = new Date().toISOString();
    const updates: any = { updatedAt: now };
    if (req.body?.name !== undefined) updates.name = String(req.body.name).trim();
    if (req.body?.description !== undefined) updates.description = String(req.body.description).trim();
    if (!updates.name) return res.status(400).json({ error: 'Tên vai trò là bắt buộc' });
    db.update(schema.roleProfiles).set(updates).where(eq(schema.roleProfiles.id, profile.id)).run();
    res.json({ ...profile, ...updates, builtIn: false });
  } catch (err) {
    console.error('PATCH /api/roles/:code error:', err);
    res.status(500).json({ error: 'Không thể cập nhật vai trò' });
  }
});

app.put('/api/roles/:code/permissions', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'settings.manage_permissions')) return;
    if (isBuiltInRole(req.params.code)) return res.status(400).json({ error: 'Không sửa quyền vai trò mặc định' });
    const profile = roleProfileFor(req.user.tenantId, req.params.code);
    if (!profile) return res.status(404).json({ error: 'Không tìm thấy vai trò' });
    const entries = Array.isArray(req.body?.permissions) ? req.body.permissions : [];
    const knownCodes = new Set(db.select({ code: schema.permissions.code }).from(schema.permissions).all().map((permission) => permission.code));
    const now = new Date().toISOString();
    db.transaction((tx) => {
      tx.delete(schema.roleProfilePermissions).where(eq(schema.roleProfilePermissions.roleProfileId, profile.id)).run();
      for (const entry of entries) {
        if (typeof entry?.code !== 'string' || !knownCodes.has(entry.code) || typeof entry?.allowed !== 'boolean') continue;
        tx.insert(schema.roleProfilePermissions).values({ id: uuid(), roleProfileId: profile.id, permissionCode: entry.code, allowed: entry.allowed, updatedAt: now }).run();
      }
      tx.update(schema.roleProfiles).set({ updatedAt: now }).where(eq(schema.roleProfiles.id, profile.id)).run();
    });
    res.json({ success: true });
  } catch (err) {
    console.error('PUT /api/roles/:code/permissions error:', err);
    res.status(500).json({ error: 'Không thể lưu quyền vai trò' });
  }
});

app.delete('/api/roles/:code', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'settings.manage_permissions')) return;
    if (isBuiltInRole(req.params.code)) return res.status(400).json({ error: 'Không xóa vai trò mặc định' });
    const profile = roleProfileFor(req.user.tenantId, req.params.code);
    if (!profile) return res.status(404).json({ error: 'Không tìm thấy vai trò' });
    const assigned = db.select().from(schema.users).where(and(eq(schema.users.tenantId, req.user.tenantId), eq(schema.users.role, req.params.code as any))).get();
    if (assigned) return res.status(400).json({ error: 'Không thể xóa vai trò đang được sử dụng' });
    db.delete(schema.roleProfiles).where(eq(schema.roleProfiles.id, profile.id)).run();
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/roles/:code error:', err);
    res.status(500).json({ error: 'Không thể xóa vai trò' });
  }
});

app.get('/api/users/:id/permissions', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'settings.manage_permissions')) return;
    const user = db.select().from(schema.users).where(and(eq(schema.users.id, req.params.id), eq(schema.users.tenantId, req.user.tenantId))).get();
    if (!user) return res.status(404).json({ error: 'User not found' });
    const permissions = db.select().from(schema.permissions).all();
    const roleGrants = rolePermissionRows(user.role, req.user.tenantId);
    const userGrants = db.select().from(schema.userPermissions).where(and(eq(schema.userPermissions.tenantId, req.user.tenantId), eq(schema.userPermissions.userId, user.id))).all();
    const roleMap = new Map<string, boolean>(roleGrants.map((grant) => [String(grant.permissionCode), Boolean(grant.allowed)] as [string, boolean]));
    const userMap = new Map<string, boolean>(userGrants.map((grant) => [String(grant.permissionCode), Boolean(grant.allowed)] as [string, boolean]));
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

    if (role === 'owner' || (!isBuiltInRole(role) && !roleProfileFor(req.user.tenantId, role))) {
      return res.status(400).json({ error: 'Vai trò không hợp lệ hoặc chưa được tạo trong cửa hàng.' });
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
    if (req.body.name !== undefined) updates.name = req.body.name;
    if (req.body.phone !== undefined) updates.phone = req.body.phone;
    if (req.body.status !== undefined) updates.status = req.body.status === 'inactive' ? 'inactive' : 'active';
    if (req.body.role !== undefined) {
      const nextRole = String(req.body.role);
      if (nextRole !== 'owner' && !isBuiltInRole(nextRole) && !roleProfileFor(req.user.tenantId, nextRole)) {
        return res.status(400).json({ error: 'Vai trò không hợp lệ hoặc chưa được tạo trong cửa hàng.' });
      }
      if (existing.id === req.user.id && nextRole !== 'owner') {
        return res.status(400).json({ error: 'Owner cannot downgrade own role' });
      }
      updates.role = nextRole;
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

app.patch('/api/categories/:id', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'inventory.update')) return;
    const category = db.select().from(schema.categories)
      .where(and(eq(schema.categories.id, req.params.id), eq(schema.categories.tenantId, req.user.tenantId))).get();
    if (!category) return res.status(404).json({ error: 'Không tìm thấy danh mục' });
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Tên danh mục là bắt buộc' });
    const duplicate = db.select().from(schema.categories)
      .where(and(eq(schema.categories.tenantId, req.user.tenantId), eq(schema.categories.name, name))).get();
    if (duplicate && duplicate.id !== category.id) return res.status(409).json({ error: 'Tên danh mục đã tồn tại' });

    db.transaction((tx) => {
      tx.update(schema.categories).set({ name }).where(eq(schema.categories.id, category.id)).run();
      tx.update(schema.products).set({ category: name }).where(and(eq(schema.products.tenantId, req.user.tenantId), eq(schema.products.category, category.name))).run();
    });
    res.json(db.select().from(schema.categories).where(eq(schema.categories.id, category.id)).get());
  } catch (err) {
    console.error('PATCH /api/categories/:id error:', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Không thể đổi tên danh mục' });
  }
});

app.delete('/api/categories/:id', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'inventory.delete')) return;
    const category = db.select().from(schema.categories)
      .where(and(eq(schema.categories.id, req.params.id), eq(schema.categories.tenantId, req.user.tenantId))).get();
    if (!category) return res.status(404).json({ error: 'Không tìm thấy danh mục' });
    const inUse = db.select({ id: schema.products.id }).from(schema.products)
      .where(and(eq(schema.products.tenantId, req.user.tenantId), eq(schema.products.category, category.name))).get();
    if (inUse) return res.status(409).json({ error: 'Danh mục đang được dùng bởi sản phẩm. Hãy đổi danh mục sản phẩm trước khi xóa.' });
    db.delete(schema.categories).where(eq(schema.categories.id, category.id)).run();
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/categories/:id error:', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Không thể xóa danh mục' });
  }
});

// ═══════════════════════════════════════════════════════════
// UNITS OF MEASURE
// ═══════════════════════════════════════════════════════════

const syncUnitCatalog = (tenantId: string) => {
  const baseUnits = db.select({ name: schema.products.unit }).from(schema.products)
    .where(eq(schema.products.tenantId, tenantId)).all();
  const variantUnits = db.select({ name: schema.productUnits.name }).from(schema.productUnits)
    .where(eq(schema.productUnits.tenantId, tenantId)).all();
  const names = new Set([...baseUnits, ...variantUnits].map((row) => String(row.name || '').trim()).filter(Boolean));
  for (const name of names) {
    const exists = db.select({ id: schema.units.id }).from(schema.units)
      .where(and(eq(schema.units.tenantId, tenantId), eq(schema.units.name, name))).get();
    if (!exists) db.insert(schema.units).values({ id: uuid(), tenantId, name, createdAt: new Date().toISOString() }).run();
  }
};

app.get('/api/units', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'inventory.view')) return;
    syncUnitCatalog(req.user.tenantId);
    const rows = db.select().from(schema.units).where(eq(schema.units.tenantId, req.user.tenantId)).all();
    const baseUnits = db.select({ name: schema.products.unit }).from(schema.products)
      .where(eq(schema.products.tenantId, req.user.tenantId)).all();
    const variantUnits = db.select({ name: schema.productUnits.name }).from(schema.productUnits)
      .where(eq(schema.productUnits.tenantId, req.user.tenantId)).all();
    const usage = new Map<string, number>();
    [...baseUnits, ...variantUnits].forEach((row) => {
      const name = String(row.name || '').trim();
      if (name) usage.set(name, (usage.get(name) || 0) + 1);
    });
    res.json(rows.map((row) => ({ ...row, inUseCount: usage.get(row.name) || 0 })));
  } catch (err) {
    console.error('GET /api/units error:', err);
    res.status(500).json({ error: 'Không thể tải đơn vị tính' });
  }
});

app.post('/api/units', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'inventory.create')) return;
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Tên đơn vị tính là bắt buộc' });
    const duplicate = db.select().from(schema.units)
      .where(eq(schema.units.tenantId, req.user.tenantId)).all()
      .find((row) => row.name.trim().toLowerCase() === name.toLowerCase());
    if (duplicate) return res.status(409).json({ error: 'Đơn vị tính đã tồn tại' });
    const unit = { id: uuid(), tenantId: req.user.tenantId, name, createdAt: new Date().toISOString() };
    db.insert(schema.units).values(unit).run();
    res.status(201).json({ ...unit, inUseCount: 0 });
  } catch (err) {
    console.error('POST /api/units error:', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Không thể tạo đơn vị tính' });
  }
});

app.patch('/api/units/:id', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'inventory.update')) return;
    const unit = db.select().from(schema.units)
      .where(and(eq(schema.units.id, req.params.id), eq(schema.units.tenantId, req.user.tenantId))).get();
    if (!unit) return res.status(404).json({ error: 'Không tìm thấy đơn vị tính' });
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Tên đơn vị tính là bắt buộc' });
    const duplicate = db.select().from(schema.units)
      .where(eq(schema.units.tenantId, req.user.tenantId)).all()
      .find((row) => row.id !== unit.id && row.name.trim().toLowerCase() === name.toLowerCase());
    if (duplicate) return res.status(409).json({ error: 'Đơn vị tính đã tồn tại' });

    db.transaction((tx) => {
      tx.update(schema.units).set({ name }).where(eq(schema.units.id, unit.id)).run();
      tx.update(schema.products).set({ unit: name }).where(and(eq(schema.products.tenantId, req.user.tenantId), eq(schema.products.unit, unit.name))).run();
      tx.update(schema.productUnits).set({ name }).where(and(eq(schema.productUnits.tenantId, req.user.tenantId), eq(schema.productUnits.name, unit.name))).run();
      tx.update(schema.priceListItems).set({ unitName: name }).where(and(eq(schema.priceListItems.tenantId, req.user.tenantId), eq(schema.priceListItems.unitName, unit.name))).run();
    });
    res.json({ ...unit, name });
  } catch (err) {
    console.error('PATCH /api/units/:id error:', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Không thể đổi tên đơn vị tính' });
  }
});

app.delete('/api/units/:id', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'inventory.delete')) return;
    const unit = db.select().from(schema.units)
      .where(and(eq(schema.units.id, req.params.id), eq(schema.units.tenantId, req.user.tenantId))).get();
    if (!unit) return res.status(404).json({ error: 'Không tìm thấy đơn vị tính' });
    const inUse = db.select({ id: schema.products.id }).from(schema.products)
      .where(and(eq(schema.products.tenantId, req.user.tenantId), eq(schema.products.unit, unit.name))).get()
      || db.select({ id: schema.productUnits.id }).from(schema.productUnits)
        .where(and(eq(schema.productUnits.tenantId, req.user.tenantId), eq(schema.productUnits.name, unit.name))).get();
    if (inUse) return res.status(409).json({ error: 'Đơn vị tính đang được dùng bởi sản phẩm hoặc biến thể. Hãy đổi đơn vị trước khi xóa.' });
    db.delete(schema.units).where(eq(schema.units.id, unit.id)).run();
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/units/:id error:', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Không thể xóa đơn vị tính' });
  }
});

// ═══════════════════════════════════════════════════════════
// PRODUCTS
// ═══════════════════════════════════════════════════════════

const ensureDefaultPriceList = (tenantId: string) => {
  let defaultList = db.select().from(schema.priceLists)
    .where(and(eq(schema.priceLists.tenantId, tenantId), eq(schema.priceLists.isDefault, true))).get();
  if (!defaultList) {
    const now = new Date().toISOString();
    const id = uuid();
    db.insert(schema.priceLists).values({ id, tenantId, name: 'Bảng giá chung', customerType: 'all', isDefault: true, active: true, createdAt: now }).run();
    defaultList = db.select().from(schema.priceLists).where(eq(schema.priceLists.id, id)).get();
  }
  if (defaultList) {
    const products = db.select().from(schema.products).where(and(eq(schema.products.tenantId, tenantId), eq(schema.products.productType, 'standard'))).all();
    for (const product of products) {
      const exists = db.select().from(schema.priceListItems).where(and(eq(schema.priceListItems.priceListId, defaultList.id), eq(schema.priceListItems.productId, product.id), eq(schema.priceListItems.unitName, product.unit))).get();
      if (!exists) db.insert(schema.priceListItems).values({ id: uuid(), tenantId, priceListId: defaultList.id, productId: product.id, unitName: product.unit, unitFactor: 1, price: product.sellingPrice, createdAt: new Date().toISOString() }).run();
    }
  }
  return defaultList;
};

const productUnitsFor = (tenantId: string, product: any) => {
  const extraUnits = db.select().from(schema.productUnits)
    .where(and(eq(schema.productUnits.tenantId, tenantId), eq(schema.productUnits.productId, product.id), eq(schema.productUnits.active, true))).all();
  const base = { id: `base-${product.id}`, tenantId, productId: product.id, name: product.unit, factor: 1, barcode: product.barcode || null, active: true };
  return [base, ...extraUnits.filter((unit) => unit.name !== product.unit || Number(unit.factor) !== 1)];
};

const productComponentsFor = (tenantId: string, productId: string) => db.select().from(schema.productComponents)
  .where(and(eq(schema.productComponents.tenantId, tenantId), eq(schema.productComponents.comboProductId, productId))).all();

const reservedBaseStock = (tenantId: string, productId: string) => Number(db.select({ quantity: sql<number>`coalesce(sum(${schema.stockReservations.quantity}), 0)` })
  .from(schema.stockReservations)
  .where(and(eq(schema.stockReservations.productId, productId), eq(schema.stockReservations.tenantId, tenantId), eq(schema.stockReservations.status, 'reserved')))
  .get()?.quantity || 0);

const availableForProduct = (tenantId: string, productId: string, seen = new Set<string>()): number => {
  if (seen.has(productId)) return 0;
  const product = db.select().from(schema.products).where(and(eq(schema.products.id, productId), eq(schema.products.tenantId, tenantId))).get();
  if (!product) return 0;
  if (product.productType !== 'combo') return Math.max(0, Number(product.stock) - reservedBaseStock(tenantId, productId));
  const components = productComponentsFor(tenantId, productId);
  if (!components.length) return 0;
  return Math.min(...components.map((component) => {
    const available = availableForProduct(tenantId, component.componentProductId, new Set([...seen, productId]));
    return component.quantity > 0 ? Math.floor(available / Number(component.quantity)) : 0;
  }));
};

const withStockAvailability = (tenantId: string, product: any) => {
  const reservedStock = reservedBaseStock(tenantId, product.id);
  return { ...product, units: productUnitsFor(tenantId, product), components: productComponentsFor(tenantId, product.id), reservedStock, availableStock: availableForProduct(tenantId, product.id) };
};

app.get('/api/price-lists', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'inventory.view')) return;
    const defaultList = ensureDefaultPriceList(req.user.tenantId);
    const includeItems = String(req.query.includeItems ?? 'true') !== 'false';
    const lists = db.select().from(schema.priceLists)
      .where(eq(schema.priceLists.tenantId, req.user.tenantId)).all();
    res.json(lists.map((list) => ({
      ...list,
      items: includeItems ? db.select().from(schema.priceListItems).where(eq(schema.priceListItems.priceListId, list.id)).all() : undefined,
      isDefault: Boolean(list.isDefault),
      active: Boolean(list.active),
      ensuredDefault: list.id === defaultList?.id,
    })));
  } catch (err) {
    console.error('GET /api/price-lists error:', err);
    res.status(500).json({ error: 'Không thể tải bảng giá' });
  }
});

app.get('/api/price-lists/:id', (req, res) => {
  try {
    const list = db.select().from(schema.priceLists).where(and(eq(schema.priceLists.id, req.params.id), eq(schema.priceLists.tenantId, req.user.tenantId))).get();
    if (!list) return res.status(404).json({ error: 'Không tìm thấy bảng giá' });
    res.json({ ...list, items: db.select().from(schema.priceListItems).where(eq(schema.priceListItems.priceListId, list.id)).all() });
  } catch (err) {
    console.error('GET /api/price-lists/:id error:', err);
    res.status(500).json({ error: 'Không thể tải bảng giá' });
  }
});

app.post('/api/price-lists', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'inventory.manage_pricing')) return;
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Tên bảng giá là bắt buộc' });
    const now = new Date().toISOString();
    const list = { id: uuid(), tenantId: req.user.tenantId, name, customerType: req.body?.customerType || 'all', isDefault: Boolean(req.body?.isDefault), active: req.body?.active !== false, createdAt: now };
    if (list.isDefault) db.update(schema.priceLists).set({ isDefault: false }).where(eq(schema.priceLists.tenantId, req.user.tenantId)).run();
    db.insert(schema.priceLists).values(list).run();
    res.status(201).json({ ...list, items: [] });
  } catch (err) {
    console.error('POST /api/price-lists error:', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Không thể tạo bảng giá' });
  }
});

app.patch('/api/price-lists/:id', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'inventory.manage_pricing')) return;
    const list = db.select().from(schema.priceLists).where(and(eq(schema.priceLists.id, req.params.id), eq(schema.priceLists.tenantId, req.user.tenantId))).get();
    if (!list) return res.status(404).json({ error: 'Không tìm thấy bảng giá' });
    const name = req.body?.name === undefined ? list.name : String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Tên bảng giá là bắt buộc' });
    const duplicate = db.select().from(schema.priceLists)
      .where(eq(schema.priceLists.tenantId, req.user.tenantId)).all()
      .find((row) => row.id !== list.id && row.name.trim().toLowerCase() === name.toLowerCase());
    if (duplicate) return res.status(409).json({ error: 'Tên bảng giá đã tồn tại' });
    const isDefault = req.body?.isDefault;
    const updates = {
      name,
      ...(req.body?.customerType !== undefined ? { customerType: String(req.body.customerType) } : {}),
      ...(req.body?.active !== undefined ? { active: Boolean(req.body.active) } : {}),
    };
    if (isDefault) db.update(schema.priceLists).set({ isDefault: false }).where(eq(schema.priceLists.tenantId, req.user.tenantId)).run();
    db.update(schema.priceLists).set({ ...updates, ...(isDefault !== undefined ? { isDefault: Boolean(isDefault) } : {}) }).where(eq(schema.priceLists.id, list.id)).run();
    res.json(db.select().from(schema.priceLists).where(eq(schema.priceLists.id, list.id)).get());
  } catch (err) {
    console.error('PATCH /api/price-lists/:id error:', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Không thể cập nhật bảng giá' });
  }
});

app.delete('/api/price-lists/:id', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'inventory.manage_pricing')) return;
    const list = db.select().from(schema.priceLists).where(and(eq(schema.priceLists.id, req.params.id), eq(schema.priceLists.tenantId, req.user.tenantId))).get();
    if (!list) return res.status(404).json({ error: 'Không tìm thấy bảng giá' });
    if (list.isDefault) return res.status(409).json({ error: 'Không thể xóa bảng giá mặc định' });
    db.delete(schema.priceListItems).where(eq(schema.priceListItems.priceListId, list.id)).run();
    db.delete(schema.priceLists).where(eq(schema.priceLists.id, list.id)).run();
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/price-lists/:id error:', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Không thể xóa bảng giá' });
  }
});

app.put('/api/price-lists/:id/items', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'inventory.manage_pricing')) return;
    const list = db.select().from(schema.priceLists).where(and(eq(schema.priceLists.id, req.params.id), eq(schema.priceLists.tenantId, req.user.tenantId))).get();
    if (!list) return res.status(404).json({ error: 'Không tìm thấy bảng giá' });
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    db.transaction((tx) => {
      tx.delete(schema.priceListItems).where(eq(schema.priceListItems.priceListId, list.id)).run();
      for (const item of items) {
        const product = tx.select().from(schema.products).where(and(eq(schema.products.id, item.productId), eq(schema.products.tenantId, req.user.tenantId))).get();
        const price = Number(item.price);
        const factor = Number(item.unitFactor || 1);
        if (!product || !item.unitName || !Number.isFinite(price) || price < 0 || !Number.isFinite(factor) || factor <= 0) continue;
        tx.insert(schema.priceListItems).values({ id: uuid(), tenantId: req.user.tenantId, priceListId: list.id, productId: product.id, unitName: String(item.unitName), unitFactor: factor, price, createdAt: new Date().toISOString() }).run();
      }
    });
    res.json(db.select().from(schema.priceListItems).where(eq(schema.priceListItems.priceListId, list.id)).all());
  } catch (err) {
    console.error('PUT /api/price-lists/:id/items error:', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Không thể lưu giá sản phẩm' });
  }
});

app.get('/api/products/lookup', (req, res) => {
  try {
    const code = String(req.query.code || '').trim().toLowerCase();
    if (!code) return res.status(400).json({ error: 'Thiếu mã cần tra cứu' });
    const rows = db.select().from(schema.products).where(eq(schema.products.tenantId, req.user.tenantId)).all();
    const unit = db.select().from(schema.productUnits).where(eq(schema.productUnits.tenantId, req.user.tenantId)).all().find((row) => String(row.barcode || '').trim().toLowerCase() === code);
    const product = rows.find((row) => row.sku.toLowerCase() === code || String(row.barcode || '').toLowerCase() === code) || unit;
    if (!product) return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });
    const resolved = 'productId' in product ? db.select().from(schema.products).where(eq(schema.products.id, product.productId)).get() : product;
    if (!resolved) return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });
    res.json(withStockAvailability(req.user.tenantId, resolved));
  } catch (err) {
    console.error('GET /api/products/lookup error:', err);
    res.status(500).json({ error: 'Không thể tra cứu mã sản phẩm' });
  }
});

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
      const searchStr = normalizeSearchText(search);
      allProducts = allProducts.filter(p =>
        normalizeSearchText(p.name).includes(searchStr) ||
        normalizeSearchText(p.sku).includes(searchStr)
      );
    }

    res.json(allProducts.map((product) => withStockAvailability(req.user.tenantId, product)));
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
    res.json(withStockAvailability(req.user.tenantId, product));
  } catch (err) {
    console.error('GET /api/products/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/products/:id/units', (req, res) => {
  try {
    const product = db.select().from(schema.products).where(and(eq(schema.products.id, req.params.id), eq(schema.products.tenantId, req.user.tenantId))).get();
    if (!product) return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });
    res.json(productUnitsFor(req.user.tenantId, product));
  } catch (err) { res.status(500).json({ error: 'Không thể tải đơn vị quy đổi' }); }
});

app.put('/api/products/:id/units', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'inventory.manage_pricing')) return;
    const product = db.select().from(schema.products).where(and(eq(schema.products.id, req.params.id), eq(schema.products.tenantId, req.user.tenantId))).get();
    if (!product) return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });
    const units = Array.isArray(req.body?.units) ? req.body.units : [];
    db.transaction((tx) => {
      tx.delete(schema.productUnits).where(and(eq(schema.productUnits.productId, product.id), eq(schema.productUnits.tenantId, req.user.tenantId))).run();
      for (const unit of units) {
        const name = String(unit.name || '').trim();
        const factor = Number(unit.factor);
        if (!name || name === product.unit || !Number.isFinite(factor) || factor <= 0) continue;
        tx.insert(schema.productUnits).values({ id: uuid(), tenantId: req.user.tenantId, productId: product.id, name, factor, barcode: unit.barcode ? String(unit.barcode).trim() : null, active: true, createdAt: new Date().toISOString() }).run();
      }
    });
    res.json(productUnitsFor(req.user.tenantId, product));
  } catch (err) { res.status(400).json({ error: err instanceof Error ? err.message : 'Không thể lưu đơn vị quy đổi' }); }
});

app.get('/api/products/:id/components', (req, res) => {
  try {
    const product = db.select().from(schema.products).where(and(eq(schema.products.id, req.params.id), eq(schema.products.tenantId, req.user.tenantId))).get();
    if (!product) return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });
    const rows = productComponentsFor(req.user.tenantId, product.id);
    res.json(rows.map((row) => ({ ...row, component: db.select().from(schema.products).where(eq(schema.products.id, row.componentProductId)).get() || null })));
  } catch (err) { res.status(500).json({ error: 'Không thể tải thành phần combo' }); }
});

app.put('/api/products/:id/components', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'inventory.manage_pricing')) return;
    const combo = db.select().from(schema.products).where(and(eq(schema.products.id, req.params.id), eq(schema.products.tenantId, req.user.tenantId))).get();
    if (!combo) return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });
    const components = Array.isArray(req.body?.components) ? req.body.components : [];
    if (combo.productType !== 'combo' && components.length) return res.status(409).json({ error: 'Chỉ sản phẩm combo mới có thành phần' });
    const componentIds = new Set<string>();
    for (const item of components) {
      const quantity = Number(item.quantity);
      if (!item.componentProductId || item.componentProductId === combo.id || componentIds.has(item.componentProductId) || !Number.isFinite(quantity) || quantity <= 0) {
        return res.status(400).json({ error: 'Thành phần combo không hợp lệ' });
      }
      const product = db.select().from(schema.products).where(and(eq(schema.products.id, item.componentProductId), eq(schema.products.tenantId, req.user.tenantId))).get();
      if (!product || product.productType === 'combo') return res.status(400).json({ error: 'Combo chỉ được chứa sản phẩm thường' });
      componentIds.add(item.componentProductId);
    }
    db.transaction((tx) => {
      tx.delete(schema.productComponents).where(and(eq(schema.productComponents.comboProductId, combo.id), eq(schema.productComponents.tenantId, req.user.tenantId))).run();
      for (const item of components) tx.insert(schema.productComponents).values({ id: uuid(), tenantId: req.user.tenantId, comboProductId: combo.id, componentProductId: item.componentProductId, quantity: Number(item.quantity), createdAt: new Date().toISOString() }).run();
    });
    res.json(productComponentsFor(req.user.tenantId, combo.id));
  } catch (err) { res.status(400).json({ error: err instanceof Error ? err.message : 'Không thể lưu thành phần combo' }); }
});

app.post('/api/products', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'inventory.create')) return;
    const product = { id: uuid(), productType: 'standard' as const, ...req.body, tenantId: req.user.tenantId };
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

const unitForProduct = (tenantId: string, product: any, unitName?: string, requestedFactor?: number) => {
  const units = productUnitsFor(tenantId, product);
  const match = units.find((unit) => unit.name === unitName);
  if (match) return { name: match.name, factor: Number(match.factor) || 1 };
  const factor = Number(requestedFactor);
  return { name: unitName || product.unit, factor: Number.isFinite(factor) && factor > 0 ? factor : 1 };
};

const expandStockRequirements = (tenantId: string, productId: string, baseQuantity: number, seen = new Set<string>()): Array<{ productId: string; quantity: number }> => {
  if (seen.has(productId)) throw new Error('Combo chứa vòng lặp thành phần');
  const product = db.select().from(schema.products).where(and(eq(schema.products.id, productId), eq(schema.products.tenantId, tenantId))).get();
  if (!product) throw new Error(`Không tìm thấy sản phẩm: ${productId}`);
  if (product.productType !== 'combo') return [{ productId, quantity: baseQuantity }];
  const components = productComponentsFor(tenantId, productId);
  if (!components.length) throw new Error(`Combo ${product.name} chưa có thành phần`);
  return components.flatMap((component) => expandStockRequirements(tenantId, component.componentProductId, baseQuantity * Number(component.quantity), new Set([...seen, productId])));
};

const supplierCreditBalance = (tenantId: string, supplierId: string) => {
  const rows = db.select().from(schema.supplierCreditLedger)
    .where(and(eq(schema.supplierCreditLedger.tenantId, tenantId), eq(schema.supplierCreditLedger.supplierId, supplierId))).all();
  return rows.reduce((sum, row) => sum + (row.type === 'increase' ? Number(row.amount) : -Number(row.amount)), 0);
};

const defaultAccountForPayment = (tenantId: string, paymentMethod: string) => {
  const type = paymentMethod === 'transfer' ? 'bank' : paymentMethod === 'wallet' ? 'wallet' : 'cash';
  const existing = db.select().from(schema.cashAccounts).where(and(eq(schema.cashAccounts.tenantId, tenantId), eq(schema.cashAccounts.type, type), eq(schema.cashAccounts.active, 1))).get();
  if (existing) return existing.id;
  const defaults: Record<string, string> = { cash: 'Tiền mặt', bank: 'Chuyển khoản ngân hàng', wallet: 'Ví điện tử' };
  db.insert(schema.cashAccounts).values({
    id: uuid(), tenantId, name: defaults[type] || 'Tài khoản tiền', type, active: 1, createdAt: new Date().toISOString(),
  }).run();
  return db.select().from(schema.cashAccounts).where(and(eq(schema.cashAccounts.tenantId, tenantId), eq(schema.cashAccounts.type, type), eq(schema.cashAccounts.active, 1))).get()?.id || null;
};

const paymentAccountType = (paymentMethod: string) => (
  paymentMethod === 'transfer' ? 'bank' : paymentMethod === 'wallet' ? 'wallet' : 'cash'
);

const resolvePaymentAccount = (tenantId: string, paymentMethod: string, accountId?: string | null) => {
  if (paymentMethod === 'debt') return null;
  const expectedType = paymentAccountType(paymentMethod);
  if (accountId) {
    const account = db.select().from(schema.cashAccounts).where(and(
      eq(schema.cashAccounts.id, accountId),
      eq(schema.cashAccounts.tenantId, tenantId),
      eq(schema.cashAccounts.active, 1),
    )).get();
    if (account?.type === expectedType) return account.id;
  }
  return defaultAccountForPayment(tenantId, paymentMethod);
};

const backfillSalesCashbookAccounts = () => {
  const entries = db.select().from(schema.cashbookEntries).where(eq(schema.cashbookEntries.category, 'Bán hàng')).all();
  for (const entry of entries) {
    if (entry.accountId || !entry.referenceId) continue;
    const invoice = db.select().from(schema.invoices).where(and(
      eq(schema.invoices.id, entry.referenceId),
      eq(schema.invoices.tenantId, entry.tenantId),
    )).get();
    if (!invoice || invoice.paymentMethod === 'debt') continue;
    const accountId = resolvePaymentAccount(entry.tenantId, invoice.paymentMethod, invoice.accountId);
    if (accountId) db.update(schema.cashbookEntries).set({ accountId }).where(eq(schema.cashbookEntries.id, entry.id)).run();
  }
};

backfillSalesCashbookAccounts();
app.get('/api/suppliers', (req, res) => {
  try {
    let rows = db.select().from(schema.suppliers)
      .where(eq(schema.suppliers.tenantId, req.user.tenantId)).all();
    const search = normalizeSearchText(req.query.search);
    if (search) rows = rows.filter((row) => normalizeSearchText(`${row.code} ${row.name} ${row.phone}`).includes(search));
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
    const supplier = { id: uuid(), tenantId: req.user.tenantId, code: code || nextSupplierCode(req.user.tenantId), name, phone, taxCode, address, note, currentPayable: 0, active: true };
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
    const tenantUsers = db.select().from(schema.users).where(eq(schema.users.tenantId, req.user.tenantId)).all();
    const userNameById = new Map(tenantUsers.map((user) => [user.id, user.name]));
    res.json(rows.map((purchase) => {
      const items = db.select({ quantity: schema.purchaseItems.quantity }).from(schema.purchaseItems).where(eq(schema.purchaseItems.purchaseId, purchase.id)).all();
      return {
        ...purchase,
        supplier: db.select().from(schema.suppliers).where(eq(schema.suppliers.id, purchase.supplierId)).get() || null,
        createdByName: userNameById.get(purchase.createdBy) || null,
        itemCount: items.length,
        totalQuantity: items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
      };
    }));
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
    const creator = db.select({ name: schema.users.name }).from(schema.users).where(and(eq(schema.users.id, purchase.createdBy), eq(schema.users.tenantId, req.user.tenantId))).get();
    res.json({ ...purchase, items, createdByName: creator?.name || null, supplier: db.select().from(schema.suppliers).where(eq(schema.suppliers.id, purchase.supplierId)).get() || null });
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
      const product = db.select().from(schema.products).where(and(eq(schema.products.id, item.productId), eq(schema.products.tenantId, req.user.tenantId))).get();
      if (!product) throw new Error(`Product not found: ${item.productId}`);
      if (product.productType === 'combo') throw new Error('Không thể nhập trực tiếp sản phẩm combo');
      const unit = unitForProduct(req.user.tenantId, product, item.unitName || item.unit, item.unitFactor);
      return { ...item, quantity, price, unitName: unit.name, unitFactor: unit.factor, baseQuantity: quantity * unit.factor, taxRate: Number(item.taxRate) || 0, total: quantity * price };
    });
    const totalAmount = normalizedItems.reduce((sum: number, item: any) => sum + item.total, 0);
    const finalAmount = totalAmount + (Number(taxAmount) || 0);
    const directPaid = Math.min(finalAmount, Math.max(0, Number(paidAmount) || 0));
    const availableCredit = Math.max(0, supplierCreditBalance(req.user.tenantId, supplier.id));
    const creditUsed = Math.min(Math.max(0, finalAmount - directPaid), availableCredit);
    const paid = Math.min(finalAmount, directPaid + creditUsed);
    const payable = finalAmount - paid;
    const purchaseId = uuid();
    const documentNo = String(req.body?.documentNo || nextDocumentNo(req.user.tenantId, 'purchase', 'PN'));
    const timestamp = createdAt || new Date().toISOString();
    const status = payable <= 0 ? 'confirmed' : paid > 0 ? 'partial' : 'unpaid';
    const accountId = directPaid > 0 ? (req.body?.accountId || defaultAccountForPayment(req.user.tenantId, paymentMethod)) : null;

    db.transaction((tx) => {
      tx.insert(schema.purchases).values({ id: purchaseId, documentNo, tenantId: req.user.tenantId, supplierId, createdBy: req.user.id, totalAmount, taxAmount: Number(taxAmount) || 0, finalAmount, paidAmount: paid, payableAmount: payable, paymentMethod, accountId, status, note, createdAt: timestamp }).run();
      for (const item of normalizedItems) {
        const product = tx.select().from(schema.products).where(and(eq(schema.products.id, item.productId), eq(schema.products.tenantId, req.user.tenantId))).get();
        if (!product) throw new Error(`Product not found: ${item.productId}`);
        const beforeStock = product.stock;
        const afterStock = product.trackStock ? beforeStock + item.baseQuantity : beforeStock;
        if (product.trackStock) {
          tx.update(schema.products).set({ stock: afterStock, purchasePrice: item.price }).where(eq(schema.products.id, product.id)).run();
          tx.insert(schema.stockMovements).values({ id: uuid(), tenantId: req.user.tenantId, productId: product.id, type: 'in', quantity: item.baseQuantity, beforeStock, afterStock, note: `Nhập hàng ${purchaseId}`, referenceId: purchaseId, createdAt: timestamp, createdBy: req.user.id }).run();
        }
        tx.insert(schema.purchaseItems).values({ id: uuid(), purchaseId, productId: product.id, productName: product.name, unit: item.unitName, quantity: item.quantity, price: item.price, taxRate: item.taxRate, total: item.total, unitFactor: item.unitFactor, baseQuantity: item.baseQuantity }).run();
      }
      if (creditUsed > 0) tx.insert(schema.supplierCreditLedger).values({ id: uuid(), tenantId: req.user.tenantId, supplierId: supplier.id, purchaseId, purchaseReturnId: null, amount: creditUsed, type: 'decrease', accountId: null, note: 'Cấn trừ số dư trả hàng nhà cung cấp', createdBy: req.user.id, createdAt: timestamp }).run();
      if (payable > 0) {
        tx.update(schema.suppliers).set({ currentPayable: supplier.currentPayable + payable }).where(eq(schema.suppliers.id, supplier.id)).run();
        tx.insert(schema.payableLedger).values({ id: uuid(), tenantId: req.user.tenantId, supplierId: supplier.id, purchaseId, amount: payable, type: 'increase', note: 'Nhập hàng chưa thanh toán đủ', createdAt: timestamp, createdBy: req.user.id }).run();
      }
      if (directPaid > 0) tx.insert(schema.cashbookEntries).values({ id: uuid(), tenantId: req.user.tenantId, type: 'expense', amount: directPaid, category: 'Nhập hàng', note: `Thanh toán nhập hàng ${purchaseId}`, referenceId: purchaseId, accountId, createdAt: timestamp, createdBy: req.user.id }).run();
    });
    res.status(201).json(db.select().from(schema.purchases).where(eq(schema.purchases.id, purchaseId)).get());
  } catch (err) {
    console.error('POST /api/purchases error:', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Could not create purchase' });
  }
});

app.get('/api/purchases/:id/returnable', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'purchases.view')) return;
    const purchase = db.select().from(schema.purchases).where(and(eq(schema.purchases.id, req.params.id), eq(schema.purchases.tenantId, req.user.tenantId))).get();
    if (!purchase) return res.status(404).json({ error: 'Không tìm thấy phiếu nhập' });
    const items = db.select().from(schema.purchaseItems).where(eq(schema.purchaseItems.purchaseId, purchase.id)).all();
    const returns = db.select().from(schema.purchaseReturnItems).where(inArray(schema.purchaseReturnItems.purchaseItemId, items.map((item) => item.id))).all();
    res.json({ purchase, items: items.map((item) => ({ ...item, returnedQuantity: returns.filter((row) => row.purchaseItemId === item.id).reduce((sum, row) => sum + Number(row.quantity), 0), returnedBaseQuantity: returns.filter((row) => row.purchaseItemId === item.id).reduce((sum, row) => sum + Number(row.baseQuantity), 0) })) });
  } catch (err) { res.status(500).json({ error: 'Không thể tải dòng hàng có thể trả' }); }
});

app.get('/api/purchase-returns', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'purchases.view')) return;
    let rows = db.select().from(schema.purchaseReturns).where(eq(schema.purchaseReturns.tenantId, req.user.tenantId)).orderBy(desc(schema.purchaseReturns.createdAt)).all();
    if (req.query.supplierId) rows = rows.filter((row) => row.supplierId === req.query.supplierId);
    res.json(rows.map((row) => ({ ...row, items: db.select().from(schema.purchaseReturnItems).where(eq(schema.purchaseReturnItems.returnId, row.id)).all(), supplier: db.select().from(schema.suppliers).where(eq(schema.suppliers.id, row.supplierId)).get() || null })));
  } catch (err) { res.status(500).json({ error: 'Không thể tải phiếu trả nhà cung cấp' }); }
});

app.post('/api/purchases/:id/returns', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'purchases.return')) return;
    const purchase = db.select().from(schema.purchases).where(and(eq(schema.purchases.id, req.params.id), eq(schema.purchases.tenantId, req.user.tenantId))).get();
    if (!purchase) return res.status(404).json({ error: 'Không tìm thấy phiếu nhập' });
    const requestedItems = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!requestedItems.length) return res.status(400).json({ error: 'Chọn ít nhất một dòng hàng để trả' });
    const purchaseItems = db.select().from(schema.purchaseItems).where(eq(schema.purchaseItems.purchaseId, purchase.id)).all();
    const purchaseItemById = new Map(purchaseItems.map((item) => [item.id, item]));
    const priorReturns = db.select().from(schema.purchaseReturnItems).where(inArray(schema.purchaseReturnItems.purchaseItemId, purchaseItems.map((item) => item.id))).all();
    const normalized = requestedItems.map((raw: any) => {
      const original = purchaseItemById.get(String(raw.purchaseItemId));
      if (!original) throw new Error('Dòng hàng trả không thuộc phiếu nhập');
      const alreadyReturned = priorReturns.filter((item) => item.purchaseItemId === original.id).reduce((sum, item) => sum + Number(item.quantity), 0);
      const quantity = Number(raw.quantity) || 0;
      if (quantity <= 0 || quantity > Number(original.quantity) - alreadyReturned + 1e-9) throw new Error(`Số lượng trả không hợp lệ cho ${original.productName}`);
      const factor = Number(original.unitFactor || 1);
      return { original, quantity, unitFactor: factor, baseQuantity: quantity * factor, total: quantity * Number(original.price) };
    });
    const totalAmount = normalized.reduce((sum, item) => sum + item.total, 0);
    const returnId = uuid();
    const timestamp = new Date().toISOString();
    const priorPurchaseReturns = db.select().from(schema.purchaseReturns).where(and(eq(schema.purchaseReturns.purchaseId, purchase.id), eq(schema.purchaseReturns.tenantId, req.user.tenantId))).all();
    const remainingPurchasePayable = Math.max(0, Number(purchase.payableAmount) - priorPurchaseReturns.reduce((sum, item) => sum + Number(item.totalAmount), 0));
    const appliedPayable = Math.min(remainingPurchasePayable, totalAmount);
    const supplier = db.select().from(schema.suppliers).where(and(eq(schema.suppliers.id, purchase.supplierId), eq(schema.suppliers.tenantId, req.user.tenantId))).get();
    if (!supplier) return res.status(404).json({ error: 'Không tìm thấy nhà cung cấp' });
    const creditAmount = Math.max(0, totalAmount - appliedPayable);

    db.transaction((tx) => {
      tx.insert(schema.purchaseReturns).values({ id: returnId, documentNo: String(req.body?.documentNo || nextDocumentNo(req.user.tenantId, 'purchase_return', 'PTN')), tenantId: req.user.tenantId, purchaseId: purchase.id, supplierId: supplier.id, totalAmount, note: String(req.body?.note || ''), createdBy: req.user.id, createdAt: timestamp }).run();
      for (const row of normalized) {
        const product = tx.select().from(schema.products).where(and(eq(schema.products.id, row.original.productId), eq(schema.products.tenantId, req.user.tenantId))).get();
        if (!product) throw new Error(`Không tìm thấy sản phẩm ${row.original.productName}`);
        if (product.trackStock && Number(product.stock) < row.baseQuantity) throw new Error(`Tồn kho không đủ để trả ${product.name}`);
        if (product.trackStock) {
          const beforeStock = Number(product.stock);
          const afterStock = beforeStock - row.baseQuantity;
          tx.update(schema.products).set({ stock: afterStock }).where(eq(schema.products.id, product.id)).run();
          tx.insert(schema.stockMovements).values({ id: uuid(), tenantId: req.user.tenantId, productId: product.id, type: 'out', quantity: row.baseQuantity, beforeStock, afterStock, note: `Trả hàng NCC ${returnId}`, referenceId: returnId, createdAt: timestamp, createdBy: req.user.id }).run();
        }
        tx.insert(schema.purchaseReturnItems).values({ id: uuid(), returnId, purchaseItemId: row.original.id, productId: row.original.productId, productName: row.original.productName, unit: row.original.unit, quantity: row.quantity, unitFactor: row.unitFactor, baseQuantity: row.baseQuantity, price: row.original.price, total: row.total }).run();
      }
      if (appliedPayable > 0) {
        tx.update(schema.suppliers).set({ currentPayable: Math.max(0, Number(supplier.currentPayable) - appliedPayable) }).where(eq(schema.suppliers.id, supplier.id)).run();
        tx.insert(schema.payableLedger).values({ id: uuid(), tenantId: req.user.tenantId, supplierId: supplier.id, purchaseId: purchase.id, amount: appliedPayable, type: 'decrease', note: `Giảm công nợ do trả hàng ${returnId}`, createdAt: timestamp, createdBy: req.user.id }).run();
      }
      if (creditAmount > 0) tx.insert(schema.supplierCreditLedger).values({ id: uuid(), tenantId: req.user.tenantId, supplierId: supplier.id, purchaseReturnId: returnId, purchaseId: purchase.id, amount: creditAmount, type: 'increase', accountId: null, note: `Số dư được nhận từ trả hàng ${returnId}`, createdBy: req.user.id, createdAt: timestamp }).run();
    });
    res.status(201).json(db.select().from(schema.purchaseReturns).where(eq(schema.purchaseReturns.id, returnId)).get());
  } catch (err) {
    console.error('POST /api/purchases/:id/returns error:', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Không thể tạo phiếu trả nhà cung cấp' });
  }
});

app.get('/api/supplier-credit-ledger', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'purchases.view')) return;
    let rows = db.select().from(schema.supplierCreditLedger).where(eq(schema.supplierCreditLedger.tenantId, req.user.tenantId)).orderBy(desc(schema.supplierCreditLedger.createdAt)).all();
    if (req.query.supplierId) rows = rows.filter((row) => row.supplierId === req.query.supplierId);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Không thể tải số dư nhà cung cấp' }); }
});

app.post('/api/suppliers/:id/credit-settlement', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'purchases.return')) return;
    const supplier = db.select().from(schema.suppliers).where(and(eq(schema.suppliers.id, req.params.id), eq(schema.suppliers.tenantId, req.user.tenantId))).get();
    if (!supplier) return res.status(404).json({ error: 'Không tìm thấy nhà cung cấp' });
    const balance = Math.max(0, supplierCreditBalance(req.user.tenantId, supplier.id));
    const amount = Number(req.body?.amount) || 0;
    if (amount <= 0 || amount > balance) return res.status(400).json({ error: 'Số tiền nhận không hợp lệ' });
    const paymentMethod = String(req.body?.paymentMethod || 'cash');
    const accountId = req.body?.accountId || defaultAccountForPayment(req.user.tenantId, paymentMethod);
    const timestamp = new Date().toISOString();
    const entry = { id: uuid(), tenantId: req.user.tenantId, supplierId: supplier.id, purchaseReturnId: null, purchaseId: null, amount, type: 'decrease' as const, accountId, note: String(req.body?.note || 'Nhận tiền hoàn từ nhà cung cấp'), createdBy: req.user.id, createdAt: timestamp };
    db.transaction((tx) => {
      tx.insert(schema.supplierCreditLedger).values(entry).run();
      tx.insert(schema.cashbookEntries).values({ id: uuid(), tenantId: req.user.tenantId, type: 'income', amount, category: 'Thu tiền NCC', note: entry.note, referenceId: entry.id, accountId, createdAt: timestamp, createdBy: req.user.id }).run();
    });
    res.status(201).json(entry);
  } catch (err) { res.status(400).json({ error: err instanceof Error ? err.message : 'Không thể nhận tiền nhà cung cấp' }); }
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
    const paymentMethod = String(req.body?.paymentMethod || 'cash');
    const accountId = req.body?.accountId || defaultAccountForPayment(req.user.tenantId, paymentMethod);
    const entry = { id: uuid(), tenantId: req.user.tenantId, supplierId, purchaseId: null, amount: Math.min(payment, supplier.currentPayable), type: 'decrease' as const, note: note || 'Thanh toán nhà cung cấp', createdAt: timestamp, createdBy: req.user.id };
    db.transaction((tx) => {
      tx.insert(schema.payableLedger).values(entry).run();
      tx.update(schema.suppliers).set({ currentPayable: Math.max(0, supplier.currentPayable - entry.amount) }).where(eq(schema.suppliers.id, supplierId)).run();
      tx.insert(schema.cashbookEntries).values({ id: uuid(), tenantId: req.user.tenantId, type: 'expense', amount: entry.amount, category: 'Thanh toán NCC', note: entry.note, referenceId: entry.id, accountId, createdAt: timestamp, createdBy: req.user.id }).run();
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
      const searchStr = normalizeSearchText(search);
      allCustomers = allCustomers.filter(c =>
        normalizeSearchText(c.name).includes(searchStr) ||
        normalizeSearchText(c.phone).includes(searchStr)
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
      note: '',
      active: true,
      allowDebt: true,
      creditLimit: 0,
      paymentDays: 0,
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

const priceListForCustomer = (tenantId: string, customerType?: string, requestedId?: string) => {
  if (requestedId) {
    const requested = db.select().from(schema.priceLists).where(and(eq(schema.priceLists.id, requestedId), eq(schema.priceLists.tenantId, tenantId), eq(schema.priceLists.active, true))).get();
    if (requested) return requested;
  }
  const normalizedCustomerType = String(customerType || 'all').trim() || 'all';
  const matching = db.select().from(schema.priceLists).where(and(eq(schema.priceLists.tenantId, tenantId), eq(schema.priceLists.customerType, normalizedCustomerType), eq(schema.priceLists.active, true))).all();
  return matching.find((list) => list.customerType === normalizedCustomerType && normalizedCustomerType !== 'all') || matching.find((list) => list.isDefault) || ensureDefaultPriceList(tenantId);
};

const priceForProduct = (tenantId: string, product: any, unitName?: string, unitFactor = 1, requestedPriceListId?: string, customerType?: string, seen = new Set<string>()): { price: number; priceList: any } => {
  const priceList = priceListForCustomer(tenantId, customerType, requestedPriceListId);
  const resolvedUnit = unitForProduct(tenantId, product, unitName, unitFactor);
  const configuredPrice = priceList
    ? db.select().from(schema.priceListItems).where(and(eq(schema.priceListItems.priceListId, priceList.id), eq(schema.priceListItems.productId, product.id), eq(schema.priceListItems.unitName, resolvedUnit.name))).get()
    : null;
  // A combo can have its own price in a price list. Fall back to the sum of
  // component prices only when no explicit combo price has been configured.
  if (configuredPrice) return { price: Number(configuredPrice.price), priceList };
  if (product.productType === 'combo') {
    if (seen.has(product.id)) throw new Error('Combo chứa vòng lặp thành phần');
    const components = productComponentsFor(tenantId, product.id);
    if (!components.length) throw new Error(`Combo ${product.name} chưa có thành phần`);
    const price = components.reduce((sum, component) => {
      const componentProduct = db.select().from(schema.products).where(eq(schema.products.id, component.componentProductId)).get();
      if (!componentProduct) return sum;
      return sum + Number(component.quantity) * priceForProduct(tenantId, componentProduct, componentProduct.unit, 1, priceList?.id, customerType, new Set([...seen, product.id])).price;
    }, 0) * unitFactor;
    return { price, priceList };
  }
  const baseItem = priceList ? db.select().from(schema.priceListItems).where(and(eq(schema.priceListItems.priceListId, priceList.id), eq(schema.priceListItems.productId, product.id), eq(schema.priceListItems.unitName, product.unit))).get() : null;
  const basePrice = baseItem ? Number(baseItem.price) : Number(product.sellingPrice);
  return { price: basePrice * resolvedUnit.factor, priceList };
};

app.get('/api/invoices', (req, res) => {
  try {
    autoCloseLegacyInvoices(req);
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
    autoCloseLegacyInvoices(req);
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
    // A sale is posted at checkout. Keep the review/picking workflow for
    // legacy records only; new POS invoices must immediately affect stock,
    // cashbook, debt and reports.
    const workflowStatus = 'closed' as const;
    const paymentStatus = invoiceData.paymentStatus || (invoiceData.status === 'completed' ? 'paid' : invoiceData.status === 'partial' ? 'partial' : 'unpaid');
    const customer = invoiceData.customerId ? db.select().from(schema.customers).where(and(eq(schema.customers.id, invoiceData.customerId), eq(schema.customers.tenantId, req.user.tenantId))).get() : null;
    const normalizedItems = Array.isArray(items) ? items.map((raw: any) => {
      const product = db.select().from(schema.products).where(and(eq(schema.products.id, raw.productId), eq(schema.products.tenantId, req.user.tenantId))).get();
      if (!product) throw new Error(`Không tìm thấy sản phẩm: ${raw.productId}`);
      const quantity = Number(raw.quantity) || 0;
      if (quantity <= 0) throw new Error(`Số lượng không hợp lệ cho ${product.name}`);
      const unit = unitForProduct(req.user.tenantId, product, raw.unitName || raw.unit, raw.unitFactor);
      if (raw.priceOverride && !hasPermission(req, 'sales.override_price')) throw new Error('Bạn không có quyền sửa giá bán');
      const resolved = priceForProduct(req.user.tenantId, product, unit.name, unit.factor, raw.priceListId, customer?.type);
      const price = raw.price !== undefined && raw.price !== null && raw.price !== '' ? Number(raw.price) : resolved.price;
      if (!Number.isFinite(price) || price < 0) throw new Error(`Giá bán không hợp lệ cho ${product.name}`);
      return { ...raw, product, quantity, unitName: unit.name, unitFactor: unit.factor, baseQuantity: quantity * unit.factor, price, total: quantity * price, priceListId: raw.priceListId || resolved.priceList?.id || null, priceListName: raw.priceListName || resolved.priceList?.name || null };
    }) : [];
    const invoice = {
      ...invoiceData,
      id: invoiceId,
      documentNo,
      tenantId: req.user.tenantId,
      createdBy: req.user.id,
      createdAt: invoiceData.createdAt || new Date().toISOString(),
      workflowStatus,
      paymentStatus,
      status: invoiceData.status || (paymentStatus === 'paid' ? 'completed' : paymentStatus === 'partial' ? 'partial' : 'unpaid'),
      accountId: Number(invoiceData.paidAmount) > 0 ? resolvePaymentAccount(req.user.tenantId, invoiceData.paymentMethod, invoiceData.accountId) : null,
      version: 1,
    };

    if (invoice.debtAmount > 0 && invoice.customerId) {
      if (!customer) return res.status(400).json({ error: 'Khách hàng không tồn tại' });
      if (customer.allowDebt === false) return res.status(409).json({ error: 'Khách hàng đang bị khóa bán nợ' });
      if (Number(customer.creditLimit) > 0 && Number(customer.totalDebt) + Number(invoice.debtAmount) > Number(customer.creditLimit)) {
        return res.status(409).json({ error: 'Bill vượt hạn mức công nợ khách hàng' });
      }
    }

    db.insert(schema.invoices).values(invoice).run();

    // Insert invoice items
    const stockRequirements = new Map<string, number>();
    if (normalizedItems.length > 0) {
      for (const item of normalizedItems) {
        const quantity = Number(item.quantity) || 0;
        if (quantity <= 0) continue;
        const requirements = expandStockRequirements(req.user.tenantId, item.productId, Number(item.baseQuantity));
        for (const requirement of requirements) stockRequirements.set(requirement.productId, (stockRequirements.get(requirement.productId) || 0) + requirement.quantity);
        for (const requirement of requirements) {
          const product = db.select().from(schema.products).where(and(eq(schema.products.id, requirement.productId), eq(schema.products.tenantId, req.user.tenantId))).get();
          if (product?.trackStock && Number(product.stock) - reservedBaseStock(req.user.tenantId, product.id) < requirement.quantity) {
            db.delete(schema.invoices).where(eq(schema.invoices.id, invoiceId)).run();
            return res.status(409).json({ error: `Không đủ tồn khả dụng cho ${product.name}` });
          }
        }
      }
      const itemsWithIds = normalizedItems.map((item: any) => {
        const { product: _product, ...itemData } = item;
        return {
        ...itemData,
        id: item.id || uuid(),
        invoiceId,
        orderedQuantity: Number(item.orderedQuantity ?? item.quantity) || 0,
        pickedQuantity: Number(item.pickedQuantity) || 0,
        confirmedQuantity: Number(item.confirmedQuantity) || 0,
        lineStatus: item.lineStatus || 'ordered',
        note: item.note || '',
        };
      });
      db.insert(schema.invoiceItems).values(itemsWithIds).run();
    }

    // Draft bills reserve availability without posting the final stock-out.
    if (workflowStatus !== 'closed' && normalizedItems.length > 0) {
      for (const [productId, quantity] of stockRequirements.entries()) {
        if (quantity > 0) {
          db.insert(schema.stockReservations).values({
            id: uuid(), tenantId: req.user.tenantId, invoiceId, productId,
            quantity, status: 'reserved', createdAt: invoice.createdAt,
          }).run();
        }
      }
    }

    // Legacy POS requests send a payment status and are posted immediately.
    if (workflowStatus === 'closed' && normalizedItems.length > 0) {
      for (const [productId, quantity] of stockRequirements.entries()) {
        const product = db.select().from(schema.products)
          .where(and(eq(schema.products.id, productId), eq(schema.products.tenantId, req.user.tenantId))).get();
        if (product && product.trackStock) {
          const beforeStock = product.stock;
          const afterStock = Math.max(0, product.stock - quantity);
          db.update(schema.products)
            .set({ stock: afterStock })
            .where(eq(schema.products.id, productId))
            .run();
          db.insert(schema.stockMovements).values({
            id: uuid(),
            tenantId: req.user.tenantId,
            productId,
            type: 'out',
            quantity,
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

    // Update customer debt if applicable for immediately posted legacy bills.
    if (workflowStatus === 'closed' && invoice.debtAmount > 0 && invoice.customerId) {
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

    if (workflowStatus === 'closed' && (invoice.paidAmount || 0) > 0 && invoice.paymentMethod !== 'debt') {
      db.insert(schema.cashbookEntries).values({
        id: uuid(),
        tenantId: req.user.tenantId,
        type: 'income',
        amount: Number(invoice.paidAmount) || 0,
        category: 'Bán hàng',
        note: `Thu từ hóa đơn ${invoiceId}`,
        referenceId: invoiceId,
        accountId: invoice.accountId || defaultAccountForPayment(req.user.tenantId, invoice.paymentMethod),
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

const invoiceById = (tenantId: string, invoiceId: string) => db.select().from(schema.invoices)
  .where(and(eq(schema.invoices.id, invoiceId), eq(schema.invoices.tenantId, tenantId))).get();

const writeAudit = (req: Request, action: string, entityId: string, meta: Record<string, unknown> = {}) => {
  db.insert(schema.auditLogs).values({
    id: uuid(), actorType: 'tenant_user', actorId: req.user.id, action,
    entityType: 'invoice', entityId, tenantId: req.user.tenantId,
    meta: JSON.stringify(meta), createdAt: new Date().toISOString(),
  }).run();
};

function postDraftInvoice(req: Request, invoiceId: string, confirmedItems: any[]) {
  const invoice = invoiceById(req.user.tenantId, invoiceId);
  if (!invoice) throw new Error('Invoice not found');
  const now = new Date().toISOString();
  let confirmedTotal = 0;
  const stockRequirements = new Map<string, number>();
  for (const item of confirmedItems) {
    const quantity = item.lineStatus === 'short'
      ? 0
      : Number(item.confirmedQuantity || item.pickedQuantity || item.quantity) || 0;
    const orderedQuantity = Number(item.orderedQuantity || item.quantity) || 1;
    confirmedTotal += (Number(item.total) || 0) * Math.min(1, quantity / orderedQuantity);
    if (quantity <= 0) continue;
    const unitFactor = Number(item.unitFactor || 1);
    const requirements = expandStockRequirements(req.user.tenantId, item.productId, quantity * unitFactor);
    for (const requirement of requirements) stockRequirements.set(requirement.productId, (stockRequirements.get(requirement.productId) || 0) + requirement.quantity);
    db.update(schema.invoiceItems).set({ confirmedQuantity: quantity, pickedQuantity: Number(item.pickedQuantity ?? quantity), lineStatus: 'confirmed' }).where(eq(schema.invoiceItems.id, item.id)).run();
  }
  for (const [productId, quantity] of stockRequirements.entries()) {
    const product = db.select().from(schema.products).where(and(eq(schema.products.id, productId), eq(schema.products.tenantId, req.user.tenantId))).get();
    if (!product || !product.trackStock) continue;
    if (Number(product.stock) < quantity) throw new Error(`Tồn kho không đủ để chốt ${product.name}`);
    const beforeStock = product.stock;
    const afterStock = Math.max(0, beforeStock - quantity);
    db.update(schema.products).set({ stock: afterStock }).where(eq(schema.products.id, product.id)).run();
    db.insert(schema.stockMovements).values({ id: uuid(), tenantId: req.user.tenantId, productId: product.id, type: 'out', quantity, beforeStock, afterStock, note: `Chốt bán hàng ${invoiceId}`, referenceId: invoiceId, createdAt: now, createdBy: req.user.id }).run();
  }
  const totalRatio = Number(invoice.totalAmount) > 0 ? confirmedTotal / Number(invoice.totalAmount) : 0;
  const adjustedFinalAmount = Math.max(0, Number(invoice.finalAmount) * totalRatio);
  const adjustedPaidAmount = Math.min(Number(invoice.paidAmount) || 0, adjustedFinalAmount);
  const adjustedDebtAmount = Math.max(0, adjustedFinalAmount - adjustedPaidAmount);
  const adjustedPaymentStatus = adjustedPaidAmount >= adjustedFinalAmount && adjustedFinalAmount > 0 ? 'paid' : adjustedPaidAmount > 0 ? 'partial' : 'unpaid';
  const adjustedLegacyStatus = adjustedPaymentStatus === 'paid' ? 'completed' : adjustedPaymentStatus === 'partial' ? 'partial' : 'unpaid';
  db.update(schema.stockReservations).set({ status: 'released', releasedAt: now }).where(and(eq(schema.stockReservations.invoiceId, invoiceId), eq(schema.stockReservations.status, 'reserved'))).run();
  if (adjustedDebtAmount > 0 && invoice.customerId && !db.select().from(schema.debtLedger).where(and(eq(schema.debtLedger.invoiceId, invoiceId), eq(schema.debtLedger.type, 'increase'))).get()) {
    const customer = db.select().from(schema.customers).where(and(eq(schema.customers.id, invoice.customerId), eq(schema.customers.tenantId, req.user.tenantId))).get();
    if (customer) db.update(schema.customers).set({ totalDebt: customer.totalDebt + adjustedDebtAmount }).where(eq(schema.customers.id, customer.id)).run();
    db.insert(schema.debtLedger).values({ id: uuid(), tenantId: req.user.tenantId, customerId: invoice.customerId, invoiceId, amount: adjustedDebtAmount, type: 'increase', note: 'Mua hàng nợ', createdAt: now, createdBy: req.user.id }).run();
  }
  const resolvedAccountId = adjustedPaidAmount > 0 && invoice.paymentMethod !== 'debt'
    ? resolvePaymentAccount(req.user.tenantId, invoice.paymentMethod, invoice.accountId)
    : null;
  if (adjustedPaidAmount > 0 && invoice.paymentMethod !== 'debt' && !db.select().from(schema.cashbookEntries).where(eq(schema.cashbookEntries.referenceId, invoiceId)).get()) {
    db.insert(schema.cashbookEntries).values({ id: uuid(), tenantId: req.user.tenantId, type: 'income', amount: adjustedPaidAmount, category: 'Bán hàng', note: `Thu từ hóa đơn ${invoiceId}`, referenceId: invoiceId, accountId: resolvedAccountId, createdAt: now, createdBy: req.user.id }).run();
  }
  return db.update(schema.invoices).set({ totalAmount: confirmedTotal, finalAmount: adjustedFinalAmount, paidAmount: adjustedPaidAmount, debtAmount: adjustedDebtAmount, accountId: resolvedAccountId, status: adjustedLegacyStatus, workflowStatus: 'closed', paymentStatus: adjustedPaymentStatus, closedBy: req.user.id, closedAt: now, version: invoice.version + 1 }).where(eq(schema.invoices.id, invoiceId)).returning().get();
}

function autoCloseLegacyInvoices(req: Request) {
  const legacyInvoices = db.select().from(schema.invoices)
    .where(and(
      eq(schema.invoices.tenantId, req.user.tenantId),
      ne(schema.invoices.workflowStatus, 'closed'),
      ne(schema.invoices.workflowStatus, 'cancelled'),
    )).all();

  for (const invoice of legacyInvoices) {
    try {
      const items = db.select().from(schema.invoiceItems).where(eq(schema.invoiceItems.invoiceId, invoice.id)).all();
      postDraftInvoice(req, invoice.id, items);
      writeAudit(req, 'invoice.auto_close', invoice.id, { reason: 'Bỏ luồng kiểm bill khi tải lịch sử đơn' });
    } catch (error) {
      // Keep the record available for diagnostics if an old bill cannot be
      // posted safely (for example, a later stock change made it invalid).
      console.error(`Không thể tự chốt hóa đơn cũ ${invoice.id}:`, error);
    }
  }
}

app.patch('/api/invoices/:id', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'sales.create')) return;
    const invoice = invoiceById(req.user.tenantId, req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (invoice.workflowStatus === 'closed' || invoice.workflowStatus === 'cancelled') return res.status(409).json({ error: 'Bill đã chốt hoặc đã hủy, không thể sửa trực tiếp' });
    const { id: _id, tenantId: _tenantId, createdBy: _createdBy, workflowStatus: _workflowStatus, ...updates } = req.body || {};
    const nextVersion = Number(req.body?.version || invoice.version);
    if (nextVersion !== invoice.version) return res.status(409).json({ error: 'Bill đã được cập nhật bởi người khác' });
    db.update(schema.invoices).set({ ...updates, version: invoice.version + 1 }).where(and(eq(schema.invoices.id, invoice.id), eq(schema.invoices.version, invoice.version))).run();
    writeAudit(req, 'invoice.update', invoice.id, { fields: Object.keys(updates) });
    res.json(invoiceById(req.user.tenantId, invoice.id));
  } catch (err) { console.error('PATCH /api/invoices/:id error:', err); res.status(500).json({ error: 'Internal server error' }); }
});

app.post('/api/invoices/:id/check', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'sales.create')) return;
    const invoice = invoiceById(req.user.tenantId, req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (!['draft', 'checked'].includes(invoice.workflowStatus)) return res.status(409).json({ error: 'Bill không ở trạng thái có thể kiểm' });
    const now = new Date().toISOString();
    const updated = db.update(schema.invoices).set({ workflowStatus: 'checked', checkedBy: req.user.id, checkedAt: now, version: invoice.version + 1 }).where(eq(schema.invoices.id, invoice.id)).returning().get();
    writeAudit(req, 'invoice.check', invoice.id);
    res.json(updated);
  } catch (err) { console.error('POST invoice check error:', err); res.status(500).json({ error: 'Internal server error' }); }
});

app.post('/api/invoices/:id/pick', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'inventory.adjust')) return;
    const invoice = invoiceById(req.user.tenantId, req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (!['checked', 'picking', 'ready_to_close'].includes(invoice.workflowStatus)) return res.status(409).json({ error: 'Bill chưa được kiểm' });
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    for (const item of items) {
      const pickedQuantity = Math.max(0, Number(item.pickedQuantity) || 0);
      db.update(schema.invoiceItems).set({ pickedQuantity, confirmedQuantity: pickedQuantity, lineStatus: pickedQuantity > 0 ? 'picked' : 'short' }).where(and(eq(schema.invoiceItems.id, item.id), eq(schema.invoiceItems.invoiceId, invoice.id))).run();
    }
    const now = new Date().toISOString();
    const updated = db.update(schema.invoices).set({ workflowStatus: 'ready_to_close', pickedBy: req.user.id, pickedAt: now, version: invoice.version + 1 }).where(eq(schema.invoices.id, invoice.id)).returning().get();
    writeAudit(req, 'invoice.pick', invoice.id, { items });
    res.json(updated);
  } catch (err) { console.error('POST invoice pick error:', err); res.status(500).json({ error: 'Internal server error' }); }
});

app.post('/api/invoices/:id/close', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'sales.create')) return;
    const invoice = invoiceById(req.user.tenantId, req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (!['draft', 'checked', 'picking', 'ready_to_close'].includes(invoice.workflowStatus)) return res.status(409).json({ error: 'Bill không ở trạng thái có thể chốt' });
    const items = db.select().from(schema.invoiceItems).where(eq(schema.invoiceItems.invoiceId, invoice.id)).all();
    const updated = postDraftInvoice(req, invoice.id, items);
    writeAudit(req, 'invoice.close', invoice.id);
    res.json(updated);
  } catch (err) { console.error('POST invoice close error:', err); res.status(500).json({ error: err instanceof Error ? err.message : 'Internal server error' }); }
});

app.post('/api/invoices/:id/cancel', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'sales.cancel')) return;
    const invoice = invoiceById(req.user.tenantId, req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (invoice.workflowStatus === 'cancelled') return res.status(409).json({ error: 'Bill đã hủy' });
    const now = new Date().toISOString();
    db.update(schema.stockReservations).set({ status: 'released', releasedAt: now }).where(and(eq(schema.stockReservations.invoiceId, invoice.id), eq(schema.stockReservations.status, 'reserved'))).run();
    const updated = db.update(schema.invoices).set({ workflowStatus: 'cancelled', cancelledBy: req.user.id, cancelledAt: now, version: invoice.version + 1 }).where(eq(schema.invoices.id, invoice.id)).returning().get();
    writeAudit(req, 'invoice.cancel', invoice.id, { reason: req.body?.reason || '' });
    res.json(updated);
  } catch (err) { console.error('POST invoice cancel error:', err); res.status(500).json({ error: 'Internal server error' }); }
});

app.get('/api/invoices/:id/returnable', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'sales.view')) return;
    const invoice = invoiceById(req.user.tenantId, req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Không tìm thấy hóa đơn' });
    const items = db.select().from(schema.invoiceItems).where(eq(schema.invoiceItems.invoiceId, invoice.id)).all();
    const returns = db.select().from(schema.salesReturnItems).where(inArray(schema.salesReturnItems.invoiceItemId, items.map((item) => item.id))).all();
    res.json({ invoice, items: items.map((item) => {
      const soldQuantity = Number(item.confirmedQuantity || item.quantity);
      const returnedQuantity = returns.filter((row) => row.invoiceItemId === item.id).reduce((sum, row) => sum + Number(row.quantity), 0);
      const returnedBaseQuantity = returns.filter((row) => row.invoiceItemId === item.id).reduce((sum, row) => sum + Number(row.baseQuantity), 0);
      return { ...item, soldQuantity, returnedQuantity, returnedBaseQuantity, returnableQuantity: Math.max(0, soldQuantity - returnedQuantity) };
    }) });
  } catch (err) { res.status(500).json({ error: 'Không thể tải dòng hàng có thể trả' }); }
});

app.get('/api/sales-returns', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'sales.view')) return;
    let rows = db.select().from(schema.salesReturns).where(eq(schema.salesReturns.tenantId, req.user.tenantId)).orderBy(desc(schema.salesReturns.createdAt)).all();
    if (req.query.invoiceId) rows = rows.filter((row) => row.invoiceId === req.query.invoiceId);
    res.json(rows.map((row) => ({ ...row, items: db.select().from(schema.salesReturnItems).where(eq(schema.salesReturnItems.returnId, row.id)).all() })));
  } catch (err) { res.status(500).json({ error: 'Không thể tải phiếu trả khách hàng' }); }
});

app.post('/api/invoices/:id/returns', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'sales.return')) return;
    const invoice = invoiceById(req.user.tenantId, req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Không tìm thấy hóa đơn' });
    if (invoice.workflowStatus !== 'closed') return res.status(409).json({ error: 'Chỉ được trả hàng từ hóa đơn đã chốt' });
    const requestedItems = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!requestedItems.length) return res.status(400).json({ error: 'Chọn ít nhất một dòng hàng để trả' });
    const invoiceItems = db.select().from(schema.invoiceItems).where(eq(schema.invoiceItems.invoiceId, invoice.id)).all();
    const itemById = new Map(invoiceItems.map((item) => [item.id, item]));
    const priorReturns = db.select().from(schema.salesReturnItems).where(inArray(schema.salesReturnItems.invoiceItemId, invoiceItems.map((item) => item.id))).all();
    const normalized = requestedItems.map((raw: any) => {
      const original = itemById.get(String(raw.invoiceItemId));
      if (!original) throw new Error('Dòng hàng trả không thuộc hóa đơn');
      const soldQuantity = Number(original.confirmedQuantity || original.quantity);
      const alreadyReturned = priorReturns.filter((item) => item.invoiceItemId === original.id).reduce((sum, item) => sum + Number(item.quantity), 0);
      const quantity = Number(raw.quantity) || 0;
      if (quantity <= 0 || quantity > soldQuantity - alreadyReturned + 1e-9) throw new Error(`Số lượng trả không hợp lệ cho ${original.productName}`);
      const unitFactor = Number(original.unitFactor || 1);
      const unitPrice = Number(original.quantity) > 0 ? Number(original.total) / Number(original.quantity) : Number(original.price);
      return { original, quantity, unitFactor, baseQuantity: quantity * unitFactor, price: unitPrice, total: quantity * unitPrice };
    });
    const totalAmount = normalized.reduce((sum, item) => sum + item.total, 0);
    const debtReduction = Math.min(Math.max(0, Number(invoice.debtAmount) || 0), totalAmount);
    const refundAmount = Math.max(0, totalAmount - debtReduction);
    const requestedRefundAccountId = req.body?.refundAccountId || invoice.accountId || null;
    const refundAccount = requestedRefundAccountId
      ? db.select().from(schema.cashAccounts).where(and(
        eq(schema.cashAccounts.id, String(requestedRefundAccountId)),
        eq(schema.cashAccounts.tenantId, req.user.tenantId),
        eq(schema.cashAccounts.active, 1),
      )).get()
      : null;
    const refundAccountId = refundAmount > 0 ? (refundAccount?.id || defaultAccountForPayment(req.user.tenantId, invoice.paymentMethod)) : null;
    if (refundAmount > 0 && !refundAccountId) return res.status(400).json({ error: 'Cần chọn tài khoản hoàn tiền' });
    const returnId = uuid();
    const timestamp = new Date().toISOString();
    const stockRequirements = new Map<string, number>();
    for (const item of normalized) {
      for (const requirement of expandStockRequirements(req.user.tenantId, item.original.productId, item.baseQuantity)) {
        stockRequirements.set(requirement.productId, (stockRequirements.get(requirement.productId) || 0) + requirement.quantity);
      }
    }

    db.transaction((tx) => {
      tx.insert(schema.salesReturns).values({ id: returnId, documentNo: String(req.body?.documentNo || nextDocumentNo(req.user.tenantId, 'sales_return', 'TBH')), tenantId: req.user.tenantId, invoiceId: invoice.id, customerId: invoice.customerId, totalAmount, debtReduction, refundAmount, refundAccountId, note: String(req.body?.note || ''), createdBy: req.user.id, createdAt: timestamp }).run();
      for (const item of normalized) {
        tx.insert(schema.salesReturnItems).values({ id: uuid(), returnId, invoiceItemId: item.original.id, productId: item.original.productId, productName: item.original.productName, unitName: item.original.unitName || 'Cái', quantity: item.quantity, unitFactor: item.unitFactor, baseQuantity: item.baseQuantity, price: item.price, total: item.total }).run();
      }
      for (const [productId, quantity] of stockRequirements.entries()) {
        const product = tx.select().from(schema.products).where(and(eq(schema.products.id, productId), eq(schema.products.tenantId, req.user.tenantId))).get();
        if (!product || !product.trackStock) continue;
        const beforeStock = Number(product.stock);
        const afterStock = beforeStock + quantity;
        tx.update(schema.products).set({ stock: afterStock }).where(eq(schema.products.id, product.id)).run();
        tx.insert(schema.stockMovements).values({ id: uuid(), tenantId: req.user.tenantId, productId, type: 'in', quantity, beforeStock, afterStock, note: `Khách trả hàng ${returnId}`, referenceId: returnId, createdAt: timestamp, createdBy: req.user.id }).run();
      }
      if (debtReduction > 0 && invoice.customerId) {
        const customer = tx.select().from(schema.customers).where(and(eq(schema.customers.id, invoice.customerId), eq(schema.customers.tenantId, req.user.tenantId))).get();
        if (customer) tx.update(schema.customers).set({ totalDebt: Math.max(0, Number(customer.totalDebt) - debtReduction) }).where(eq(schema.customers.id, customer.id)).run();
        tx.insert(schema.debtLedger).values({ id: uuid(), tenantId: req.user.tenantId, customerId: invoice.customerId, invoiceId: invoice.id, amount: debtReduction, type: 'decrease', note: `Giảm công nợ do khách trả hàng ${returnId}`, createdAt: timestamp, createdBy: req.user.id }).run();
        tx.update(schema.invoices).set({ debtAmount: Math.max(0, Number(invoice.debtAmount) - debtReduction), version: invoice.version + 1 }).where(eq(schema.invoices.id, invoice.id)).run();
      }
      if (refundAmount > 0) tx.insert(schema.cashbookEntries).values({ id: uuid(), tenantId: req.user.tenantId, type: 'expense', amount: refundAmount, category: 'Hoàn tiền khách hàng', note: `Hoàn tiền phiếu ${returnId}`, referenceId: returnId, accountId: refundAccountId, createdAt: timestamp, createdBy: req.user.id }).run();
    });
    writeAudit(req, 'sales_return.create', returnId, { invoiceId: invoice.id, totalAmount, debtReduction, refundAmount });
    res.status(201).json({ ...db.select().from(schema.salesReturns).where(eq(schema.salesReturns.id, returnId)).get(), items: db.select().from(schema.salesReturnItems).where(eq(schema.salesReturnItems.returnId, returnId)).all() });
  } catch (err) {
    console.error('POST /api/invoices/:id/returns error:', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Không thể tạo phiếu trả khách hàng' });
  }
});

app.get('/api/invoices/:id/timeline', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'sales.view')) return;
    const invoice = invoiceById(req.user.tenantId, req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    const events = db.select().from(schema.auditLogs).where(and(eq(schema.auditLogs.entityType, 'invoice'), eq(schema.auditLogs.entityId, invoice.id), eq(schema.auditLogs.tenantId, req.user.tenantId))).orderBy(desc(schema.auditLogs.createdAt)).all();
    res.json(events);
  } catch (err) { console.error('GET invoice timeline error:', err); res.status(500).json({ error: 'Internal server error' }); }
});

const ensureDefaultCashAccounts = (tenantId: string) => {
  const defaults = [
    ['cash', 'Tiền mặt'],
    ['bank', 'Chuyển khoản ngân hàng'],
    ['wallet', 'Ví điện tử'],
  ];
  for (const [type, name] of defaults) {
    if (!db.select().from(schema.cashAccounts).where(and(eq(schema.cashAccounts.tenantId, tenantId), eq(schema.cashAccounts.type, type))).get()) {
      db.insert(schema.cashAccounts).values({ id: uuid(), tenantId, name, type, active: 1, createdAt: new Date().toISOString() }).run();
    }
  }
};

app.get('/api/cash-accounts', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'cashbook.view')) return;
    ensureDefaultCashAccounts(req.user.tenantId);
    res.json(db.select().from(schema.cashAccounts).where(and(eq(schema.cashAccounts.tenantId, req.user.tenantId), eq(schema.cashAccounts.active, 1))).all());
  } catch (err) { console.error('GET /api/cash-accounts error:', err); res.status(500).json({ error: 'Internal server error' }); }
});

app.post('/api/cash-accounts', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'cashbook.create')) return;
    const account = { id: uuid(), tenantId: req.user.tenantId, name: String(req.body?.name || '').trim(), type: String(req.body?.type || 'cash'), active: 1, createdAt: new Date().toISOString() };
    if (!account.name) return res.status(400).json({ error: 'Tên tài khoản là bắt buộc' });
    db.insert(schema.cashAccounts).values(account).run();
    res.status(201).json(account);
  } catch (err) { console.error('POST /api/cash-accounts error:', err); res.status(500).json({ error: 'Internal server error' }); }
});

const invoiceOutstanding = (tenantId: string, invoiceId: string) => {
  const invoice = invoiceById(tenantId, invoiceId);
  if (!invoice || invoice.workflowStatus !== 'closed') return 0;
  const allocated = db.select({ amount: sql<number>`coalesce(sum(${schema.paymentAllocations.amount}), 0)` }).from(schema.paymentAllocations)
    .where(and(eq(schema.paymentAllocations.invoiceId, invoiceId), eq(schema.paymentAllocations.tenantId, tenantId))).get()?.amount || 0;
  return Math.max(0, invoice.finalAmount - invoice.paidAmount - Number(allocated));
};

app.get('/api/payments', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'debt.view')) return;
    let payments = db.select().from(schema.payments).where(eq(schema.payments.tenantId, req.user.tenantId)).orderBy(desc(schema.payments.createdAt)).all();
    if (req.query.customerId) payments = payments.filter((payment) => payment.customerId === req.query.customerId);
    res.json(payments);
  } catch (err) { console.error('GET /api/payments error:', err); res.status(500).json({ error: 'Internal server error' }); }
});

app.get('/api/payments/:id', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'debt.view')) return;
    const payment = db.select().from(schema.payments).where(and(eq(schema.payments.id, req.params.id), eq(schema.payments.tenantId, req.user.tenantId))).get();
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    const allocations = db.select().from(schema.paymentAllocations).where(eq(schema.paymentAllocations.paymentId, payment.id)).all();
    res.json({ ...payment, allocations });
  } catch (err) { console.error('GET /api/payments/:id error:', err); res.status(500).json({ error: 'Internal server error' }); }
});

app.post('/api/payments', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'debt.collect')) return;
    const amount = Number(req.body?.amount) || 0;
    if (amount <= 0) return res.status(400).json({ error: 'Số tiền thanh toán phải lớn hơn 0' });
    ensureDefaultCashAccounts(req.user.tenantId);
    const paymentMethod = String(req.body?.paymentMethod || 'cash');
    const payment = { id: uuid(), tenantId: req.user.tenantId, customerId: req.body?.customerId || null, accountId: req.body?.accountId || defaultAccountForPayment(req.user.tenantId, paymentMethod), amount, paymentMethod, note: String(req.body?.note || ''), paymentDate: req.body?.paymentDate || new Date().toISOString(), status: 'posted', createdBy: req.user.id, createdAt: new Date().toISOString() };
    db.insert(schema.payments).values(payment).run();
    db.insert(schema.cashbookEntries).values({ id: uuid(), tenantId: req.user.tenantId, type: 'income', amount, category: 'Thu công nợ', note: payment.note || 'Thu công nợ', referenceId: payment.id, accountId: payment.accountId, createdAt: payment.createdAt, createdBy: req.user.id }).run();
    writeAudit(req, 'payment.create', payment.id, { amount, customerId: payment.customerId, accountId: payment.accountId });
    res.status(201).json({ ...payment, allocations: [] });
  } catch (err) { console.error('POST /api/payments error:', err); res.status(500).json({ error: 'Internal server error' }); }
});

app.post('/api/payments/:id/allocations', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'debt.collect')) return;
    const payment = db.select().from(schema.payments).where(and(eq(schema.payments.id, req.params.id), eq(schema.payments.tenantId, req.user.tenantId))).get();
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    const allocations = Array.isArray(req.body?.allocations) ? req.body.allocations : [];
    const existing = db.select({ amount: sql<number>`coalesce(sum(${schema.paymentAllocations.amount}), 0)` }).from(schema.paymentAllocations).where(eq(schema.paymentAllocations.paymentId, payment.id)).get()?.amount || 0;
    const requestedTotal = allocations.reduce((sum: number, item: any) => sum + (Number(item.amount) || 0), 0);
    if (requestedTotal <= 0 || Number(existing) + requestedTotal > payment.amount) return res.status(400).json({ error: 'Tổng phân bổ vượt số tiền phiếu thu' });
    const created = [];
    for (const item of allocations) {
      const amount = Number(item.amount) || 0;
      const outstanding = invoiceOutstanding(req.user.tenantId, item.invoiceId);
      if (amount <= 0 || amount > outstanding) return res.status(400).json({ error: `Số tiền phân bổ vượt công nợ bill ${item.invoiceId}` });
      const invoice = invoiceById(req.user.tenantId, item.invoiceId);
      if (!invoice || (payment.customerId && invoice.customerId !== payment.customerId)) return res.status(400).json({ error: 'Bill không thuộc khách hàng của phiếu thu' });
      const allocation = { id: uuid(), tenantId: req.user.tenantId, paymentId: payment.id, invoiceId: item.invoiceId, amount, createdAt: new Date().toISOString() };
      db.insert(schema.paymentAllocations).values(allocation).run();
      db.insert(schema.debtLedger).values({ id: uuid(), tenantId: req.user.tenantId, customerId: invoice.customerId || payment.customerId, invoiceId: invoice.id, amount, type: 'decrease', note: payment.note || 'Phân bổ thu công nợ', createdAt: allocation.createdAt, createdBy: req.user.id }).run();
      const newPaid = invoice.paidAmount + amount;
      db.update(schema.invoices).set({ paidAmount: newPaid, paymentStatus: newPaid >= invoice.finalAmount ? 'paid' : 'partial', status: newPaid >= invoice.finalAmount ? 'completed' : 'partial', version: invoice.version + 1 }).where(eq(schema.invoices.id, invoice.id)).run();
      if (invoice.customerId) {
        const customer = db.select().from(schema.customers).where(and(eq(schema.customers.id, invoice.customerId), eq(schema.customers.tenantId, req.user.tenantId))).get();
        if (customer) db.update(schema.customers).set({ totalDebt: Math.max(0, customer.totalDebt - amount) }).where(eq(schema.customers.id, customer.id)).run();
      }
      created.push(allocation);
    }
    writeAudit(req, 'payment.allocate', payment.id, { allocations: created });
    res.status(201).json({ paymentId: payment.id, allocations: created });
  } catch (err) { console.error('POST /api/payments/:id/allocations error:', err); res.status(500).json({ error: 'Internal server error' }); }
});

app.get('/api/reports/staff', (req, res) => {
  try {
    if (!ensurePermission(req, res, 'reports.view')) return;
    const from = req.query.from ? new Date(`${String(req.query.from)}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
    const to = req.query.to ? new Date(`${String(req.query.to)}T23:59:59.999`).getTime() : Number.POSITIVE_INFINITY;
    const inRange = (value: string) => {
      const timestamp = new Date(value).getTime();
      return timestamp >= from && timestamp <= to;
    };
    const userId = req.query.userId ? String(req.query.userId) : '';
    const users = db.select().from(schema.users).where(eq(schema.users.tenantId, req.user.tenantId)).all();
    const rows = new Map<string, any>();
    const details: any[] = [];
    for (const user of users) rows.set(user.id, { userId: user.id, userName: user.name, salesCount: 0, salesAmount: 0, salesReturnAmount: 0, purchaseAmount: 0, purchaseReturnAmount: 0, cashIncome: 0, cashExpense: 0, netCash: 0, netSales: 0 });
    const ensureRow = (id: string) => {
      if (!rows.has(id)) rows.set(id, { userId: id, userName: id, salesCount: 0, salesAmount: 0, salesReturnAmount: 0, purchaseAmount: 0, purchaseReturnAmount: 0, cashIncome: 0, cashExpense: 0, netCash: 0, netSales: 0 });
      return rows.get(id);
    };
    db.select().from(schema.invoices).where(eq(schema.invoices.tenantId, req.user.tenantId)).all().filter((invoice) => invoice.workflowStatus !== 'cancelled' && invoice.workflowStatus === 'closed' && inRange(invoice.createdAt)).forEach((invoice) => {
      if (userId && invoice.createdBy !== userId) return;
      const row = ensureRow(invoice.createdBy);
      row.salesCount += 1;
      row.salesAmount += Number(invoice.finalAmount) || 0;
      details.push({ type: 'sale', id: invoice.id, documentNo: invoice.documentNo, userId: invoice.createdBy, userName: row.userName, amount: Number(invoice.finalAmount) || 0, createdAt: invoice.createdAt });
    });
    const salesReturns = db.select().from(schema.salesReturns).where(eq(schema.salesReturns.tenantId, req.user.tenantId)).all().filter((item) => inRange(item.createdAt));
    for (const item of salesReturns) {
      if (userId && item.createdBy !== userId) continue;
      ensureRow(item.createdBy).salesReturnAmount += Number(item.totalAmount) || 0;
      details.push({ type: 'sales_return', id: item.id, documentNo: item.documentNo, userId: item.createdBy, userName: ensureRow(item.createdBy).userName, amount: Number(item.totalAmount) || 0, createdAt: item.createdAt });
    }
    const purchases = db.select().from(schema.purchases).where(eq(schema.purchases.tenantId, req.user.tenantId)).all().filter((item) => inRange(item.createdAt));
    for (const item of purchases) {
      if (userId && item.createdBy !== userId) continue;
      ensureRow(item.createdBy).purchaseAmount += Number(item.finalAmount) || 0;
      details.push({ type: 'purchase', id: item.id, documentNo: item.documentNo, userId: item.createdBy, userName: ensureRow(item.createdBy).userName, amount: Number(item.finalAmount) || 0, createdAt: item.createdAt });
    }
    const purchaseReturns = db.select().from(schema.purchaseReturns).where(eq(schema.purchaseReturns.tenantId, req.user.tenantId)).all().filter((item) => inRange(item.createdAt));
    for (const item of purchaseReturns) {
      if (userId && item.createdBy !== userId) continue;
      ensureRow(item.createdBy).purchaseReturnAmount += Number(item.totalAmount) || 0;
      details.push({ type: 'purchase_return', id: item.id, documentNo: item.documentNo, userId: item.createdBy, userName: ensureRow(item.createdBy).userName, amount: Number(item.totalAmount) || 0, createdAt: item.createdAt });
    }
    const cancelledInvoiceIds = new Set(db.select({ id: schema.invoices.id }).from(schema.invoices).where(and(eq(schema.invoices.tenantId, req.user.tenantId), eq(schema.invoices.workflowStatus, 'cancelled'))).all().map((item) => item.id));
    const cashbook = db.select().from(schema.cashbookEntries).where(eq(schema.cashbookEntries.tenantId, req.user.tenantId)).all().filter((item) => inRange(item.createdAt) && !(item.referenceId && cancelledInvoiceIds.has(item.referenceId)));
    for (const item of cashbook) {
      if (userId && item.createdBy !== userId) continue;
      const row = ensureRow(item.createdBy);
      if (item.type === 'income') row.cashIncome += Number(item.amount) || 0;
      else row.cashExpense += Number(item.amount) || 0;
      details.push({ type: item.type === 'income' ? 'cash_income' : 'cash_expense', id: item.id, userId: item.createdBy, userName: row.userName, amount: Number(item.amount) || 0, category: item.category, referenceId: item.referenceId, accountId: item.accountId, createdAt: item.createdAt });
    }
    const result = Array.from(rows.values()).map((row) => ({ ...row, netCash: row.cashIncome - row.cashExpense, netSales: row.salesAmount - row.salesReturnAmount })).filter((row) => !userId || row.userId === userId);
    res.json({ from: req.query.from || null, to: req.query.to || null, rows: result, details: details.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)) });
  } catch (err) {
    console.error('GET /api/reports/staff error:', err);
    res.status(500).json({ error: 'Không thể tải báo cáo theo nhân viên' });
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
    ensureDefaultCashAccounts(req.user.tenantId);
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
      accountId: req.body?.accountId || defaultAccountForPayment(req.user.tenantId, req.body?.accountType || 'cash'),
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
    const referenceIds = Array.from(new Set(rows.map((r) => r.referenceId).filter(Boolean)));
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
    const relatedPurchases = referenceIds.length
      ? db.select().from(schema.purchases)
          .where(and(
            eq(schema.purchases.tenantId, req.user.tenantId),
            inArray(schema.purchases.id, referenceIds as string[])
          ))
          .all()
      : [];
    const relatedPurchaseReturns = referenceIds.length
      ? db.select().from(schema.purchaseReturns)
          .where(and(
            eq(schema.purchaseReturns.tenantId, req.user.tenantId),
            inArray(schema.purchaseReturns.id, referenceIds as string[])
          ))
          .all()
      : [];
    const relatedInvoices = referenceIds.length
      ? db.select().from(schema.invoices)
          .where(and(
            eq(schema.invoices.tenantId, req.user.tenantId),
            inArray(schema.invoices.id, referenceIds as string[])
          ))
          .all()
      : [];
    const relatedSalesReturns = referenceIds.length
      ? db.select().from(schema.salesReturns)
          .where(and(
            eq(schema.salesReturns.tenantId, req.user.tenantId),
            inArray(schema.salesReturns.id, referenceIds as string[])
          ))
          .all()
      : [];

    const purchaseIds = relatedPurchases.map((purchase) => purchase.id);
    const purchaseReturnIds = relatedPurchaseReturns.map((purchaseReturn) => purchaseReturn.id);
    const invoiceIds = relatedInvoices.map((invoice) => invoice.id);
    const salesReturnIds = relatedSalesReturns.map((salesReturn) => salesReturn.id);
    const purchaseItems = purchaseIds.length
      ? db.select().from(schema.purchaseItems).where(inArray(schema.purchaseItems.purchaseId, purchaseIds)).all()
      : [];
    const purchaseReturnItems = purchaseReturnIds.length
      ? db.select().from(schema.purchaseReturnItems).where(inArray(schema.purchaseReturnItems.returnId, purchaseReturnIds)).all()
      : [];
    const invoiceItems = invoiceIds.length
      ? db.select().from(schema.invoiceItems).where(inArray(schema.invoiceItems.invoiceId, invoiceIds)).all()
      : [];
    const salesReturnItems = salesReturnIds.length
      ? db.select().from(schema.salesReturnItems).where(inArray(schema.salesReturnItems.returnId, salesReturnIds)).all()
      : [];

    const supplierIds = Array.from(new Set([
      ...relatedPurchases.map((purchase) => purchase.supplierId),
      ...relatedPurchaseReturns.map((purchaseReturn) => purchaseReturn.supplierId),
    ].filter(Boolean)));
    const customerIds = Array.from(new Set([
      ...relatedInvoices.map((invoice) => invoice.customerId),
      ...relatedSalesReturns.map((salesReturn) => salesReturn.customerId),
    ].filter(Boolean)));
    const relatedSuppliers = supplierIds.length
      ? db.select().from(schema.suppliers)
          .where(and(
            eq(schema.suppliers.tenantId, req.user.tenantId),
            inArray(schema.suppliers.id, supplierIds as string[])
          ))
          .all()
      : [];
    const relatedCustomers = customerIds.length
      ? db.select().from(schema.customers)
          .where(and(
            eq(schema.customers.tenantId, req.user.tenantId),
            inArray(schema.customers.id, customerIds as string[])
          ))
          .all()
      : [];

    const productMap = new Map(relatedProducts.map((p) => [p.id, p]));
    const userMap = new Map(relatedUsers.map((u) => [u.id, u]));
    const purchaseMap = new Map(relatedPurchases.map((purchase) => [purchase.id, purchase]));
    const purchaseReturnMap = new Map(relatedPurchaseReturns.map((purchaseReturn) => [purchaseReturn.id, purchaseReturn]));
    const invoiceMap = new Map(relatedInvoices.map((invoice) => [invoice.id, invoice]));
    const salesReturnMap = new Map(relatedSalesReturns.map((salesReturn) => [salesReturn.id, salesReturn]));
    const supplierMap = new Map(relatedSuppliers.map((supplier) => [supplier.id, supplier]));
    const customerMap = new Map(relatedCustomers.map((customer) => [customer.id, customer]));

    const itemForProduct = (items: any[], referenceId: string | null, productId: string) => {
      if (!referenceId) return undefined;
      return items.find((item) => item.productId === productId && (
        item.purchaseId === referenceId ||
        item.returnId === referenceId ||
        item.invoiceId === referenceId
      )) || items.find((item) => (
        item.purchaseId === referenceId ||
        item.returnId === referenceId ||
        item.invoiceId === referenceId
      ));
    };

    const enriched = rows.map((row) => {
      const product = productMap.get(row.productId);
      const actor = userMap.get(row.createdBy);
      const purchase = row.referenceId ? purchaseMap.get(row.referenceId) : undefined;
      const purchaseReturn = row.referenceId ? purchaseReturnMap.get(row.referenceId) : undefined;
      const invoice = row.referenceId ? invoiceMap.get(row.referenceId) : undefined;
      const salesReturn = row.referenceId ? salesReturnMap.get(row.referenceId) : undefined;
      const purchaseItem = itemForProduct(purchaseItems, row.referenceId, row.productId);
      const purchaseReturnItem = itemForProduct(purchaseReturnItems, row.referenceId, row.productId);
      const invoiceItem = itemForProduct(invoiceItems, row.referenceId, row.productId);
      const salesReturnItem = itemForProduct(salesReturnItems, row.referenceId, row.productId);
      const reference = purchase || purchaseReturn || invoice || salesReturn;
      const partner = purchase || purchaseReturn
        ? supplierMap.get((purchase || purchaseReturn)?.supplierId || '')
        : customerMap.get((invoice || salesReturn)?.customerId || '');
      const referenceItem = purchaseItem || purchaseReturnItem || invoiceItem || salesReturnItem;
      const fallbackTransactionPrice = row.type === 'in'
        ? Number(product?.purchasePrice || 0)
        : Number(product?.sellingPrice || 0);
      const isCustomerTransaction = Boolean(invoice || salesReturn);
      return {
        ...row,
        productName: product?.name || 'Sản phẩm đã xóa',
        productSku: product?.sku || '',
        productUnit: product?.unit || '',
        actorName: actor?.name || 'N/A',
        actorRole: actor?.role || '',
        documentNo: reference?.documentNo || row.referenceId || '',
        transactionType: purchase ? 'Nhập hàng'
          : purchaseReturn ? 'Trả hàng NCC'
            : invoice ? 'Bán hàng'
              : salesReturn ? 'Khách trả hàng'
                : row.type === 'adjust' ? 'Kiểm kê' : row.note || 'Điều chỉnh kho',
        transactionPrice: Number(referenceItem?.price ?? fallbackTransactionPrice),
        costPrice: Number(product?.purchasePrice || referenceItem?.price || 0),
        partnerName: partner?.name || (isCustomerTransaction ? 'Khách lẻ' : row.type === 'adjust' ? actor?.name || '' : ''),
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

    const accountId = req.body?.accountId || defaultAccountForPayment(req.user.tenantId, req.body?.paymentMethod || 'cash');
    const entry = {
      id: uuid(),
      createdAt: new Date().toISOString(),
      customerId: req.body.customerId,
      invoiceId: req.body.invoiceId || null,
      amount: Number(req.body.amount) || 0,
      type: req.body.type,
      note: String(req.body.note || ''),
      tenantId: req.user.tenantId,
      createdBy: req.user.id,
    };
    if (!['increase', 'decrease'].includes(entry.type) || entry.amount <= 0) return res.status(400).json({ error: 'Giao dịch công nợ không hợp lệ' });
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
        accountId,
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
