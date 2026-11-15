import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import Database from 'better-sqlite3';
import cors from 'cors';
import morgan from 'morgan';
import { controlDb, db, tenantRegistry } from './db';
import * as schema from './schema';
import { eq, desc, and, sql, inArray, ne, or, asc } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { DB_PATH, sqlite } from './db';
import {
  API_PORT,
  DATABASE_MODE,
  ENABLE_PLATFORM_ADMIN,
  JWT_SECRET,
  MIN_PASSWORD_LENGTH,
  OFFLINE_MODE,
  SETUP_TOKEN,
  SETUP_TOKEN_GENERATED,
  allowedCorsOrigins,
  isAllowedSetupRequest,
  INSTANCE_SECRET,
  INSTANCE_ID,
  PER_TENANT_DATABASES,
  DATABASE_PROVIDER,
} from './runtimeConfig';
import { bootstrapAdminAccount } from './bootstrapAdmin';

const app = express();
const PORT = API_PORT;

app.disable('x-powered-by');

const normalizeSearchText = (value: unknown) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/Đ/g, 'D')
  .toLowerCase()
  .trim();

const fallbackDocumentNo = (prefix: string, id: string) => `${prefix}-${String(id).replace(/-/g, '').slice(0, 8).toUpperCase()}`;

const configuredPublicOrigin = (() => {
  try {
    return new URL(process.env.HKDPLUS_PUBLIC_URL || '').origin;
  } catch {
    return '';
  }
})();

const documentReference = (document: any, prefix: string) => document
  ? document.documentNo || fallbackDocumentNo(prefix, document.id)
  : null;

const nextSequenceNumber = async (tenantId: string, documentType: string, prefix: string, existingCodePattern?: RegExp) => {
  const now = new Date().toISOString();
  const existing = await db.select({ nextNumber: schema.documentSequences.nextNumber }).from(schema.documentSequences).where(and(
    eq(schema.documentSequences.tenantId, tenantId),
    eq(schema.documentSequences.documentType, documentType),
  )).get();

  let initialNext = 2;
  if (!existing && existingCodePattern) {
    const source = documentType === 'supplier'
      ? await db.select({ code: schema.suppliers.code }).from(schema.suppliers).where(eq(schema.suppliers.tenantId, tenantId)).all()
      : await db.select({ code: schema.customers.code }).from(schema.customers).where(eq(schema.customers.tenantId, tenantId)).all();
    const highest = source.reduce((result, row) => {
      const match = String(row.code || '').match(existingCodePattern);
      return match ? Math.max(result, Number(match[1])) : result;
    }, 0);
    initialNext = highest + 2;
  }

  const row = await db.insert(schema.documentSequences).values({
    id: uuid(),
    tenantId,
    documentType,
    prefix,
    nextNumber: initialNext,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: [schema.documentSequences.tenantId, schema.documentSequences.documentType],
    set: {
      nextNumber: sql`${schema.documentSequences.nextNumber} + 1`,
      updatedAt: now,
    },
  }).returning({ nextNumber: schema.documentSequences.nextNumber }).get();

  return Math.max(1, Number(row?.nextNumber || initialNext) - 1);
};

const nextSupplierCode = async (tenantId: string) => `NCC${String(await nextSequenceNumber(tenantId, 'supplier', 'NCC', /^NCC(\d+)$/i)).padStart(3, '0')}`;

const withTenantAccess = (tenant: any) => {
  if (!tenant) return null;
  return {
    ...tenant,
    accessBlocked: tenant.status === 'suspended',
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
app.use(cors({
  origin: (origin, callback) => {
    const developmentOrigins = process.env.NODE_ENV !== 'production' ? ['http://localhost:3000', 'http://127.0.0.1:3000'] : [];
    if (!origin || allowedCorsOrigins.includes(origin) || developmentOrigins.includes(origin) || origin === configuredPublicOrigin) return callback(null, true);
    return callback(new Error('Origin không được phép'));
  },
  credentials: false,
}));
app.use(express.json({ limit: '20mb' }));
app.use(morgan('dev'));
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=()');
  next();
});

const publicPasswordError = 'Mật khẩu phải có ít nhất 10 ký tự.';
class BusinessError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}
const isValidPassword = (value: unknown) => typeof value === 'string' && value.length >= MIN_PASSWORD_LENGTH;
const safeEmail = (value: unknown) => String(value || '').trim().toLowerCase();
type LoginAttempt = { failures: number; firstFailureAt: number; blockedUntil: number };
const loginAttempts = new Map<string, LoginAttempt>();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_BLOCK_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 8;
const loginAttemptKey = (req: Request, email: string) => `${req.ip || 'unknown'}:${email}`;
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
const hasAnyUser = async () => Boolean((await db.select({ id: schema.users.id }).from(schema.users).limit(1).all()).length);
const writeTenantAudit = async (req: Request, action: string, entityType: string, entityId: string, meta: Record<string, unknown> = {}) => {
  await db.insert(schema.auditLogs).values({
    id: uuid(), actorType: 'tenant_user', actorId: req.user.id, action, entityType, entityId,
    tenantId: req.user.tenantId, meta: JSON.stringify(meta), createdAt: new Date().toISOString(),
  }).run();
};

type OwnerNotificationInput = {
  tenantId: string;
  actorId: string;
  type: string;
  title: string;
  body: string;
  entityType?: string | null;
  entityId?: string | null;
};

const notifyTenantOwners = async (input: OwnerNotificationInput, client: any = db) => {
  const owners = await client.select({ id: schema.users.id })
    .from(schema.users)
    .where(and(
      eq(schema.users.tenantId, input.tenantId),
      eq(schema.users.role, 'owner' as any),
      eq(schema.users.status, 'active'),
    ))
    .all();
  const recipients = owners.filter((owner: any) => owner.id !== input.actorId);
  if (!recipients.length) return;
  const createdAt = new Date().toISOString();
  await client.insert(schema.notifications).values(recipients.map((owner: any) => ({
    id: uuid(),
    tenantId: input.tenantId,
    recipientUserId: owner.id,
    actorId: input.actorId,
    type: input.type,
    title: input.title,
    body: input.body,
    entityType: input.entityType || null,
    entityId: input.entityId || null,
    isRead: 0,
    readAt: null,
    createdAt,
  }))).run();
};

const safeNotifyTenantOwners = (input: OwnerNotificationInput) => {
  return notifyTenantOwners(input).catch((error) => {
    console.error('Notification error:', error);
  });
};

const sha256File = (filePath: string) => {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
};

const BACKUP_MAGIC = Buffer.from('HKDENC1');
const BACKUP_IV_LENGTH = 12;
const BACKUP_TAG_LENGTH = 16;
const backupKey = () => crypto.createHash('sha256').update(INSTANCE_SECRET).digest();

const encryptBackupFile = async (sourcePath: string, destinationPath: string) => {
  const iv = crypto.randomBytes(BACKUP_IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', backupKey(), iv);
  const output = fs.createWriteStream(destinationPath, { mode: 0o600 });
  output.write(Buffer.concat([BACKUP_MAGIC, iv]));
  await pipeline(fs.createReadStream(sourcePath), cipher, output);
  fs.appendFileSync(destinationPath, cipher.getAuthTag());
  fs.chmodSync(destinationPath, 0o600);
  fs.rmSync(sourcePath, { force: true });
};

const decryptBackupFile = async (sourcePath: string, destinationPath: string) => {
  const stat = fs.statSync(sourcePath);
  const headerLength = BACKUP_MAGIC.length + BACKUP_IV_LENGTH;
  if (stat.size <= headerLength + BACKUP_TAG_LENGTH) throw new Error('Backup mã hóa không hợp lệ.');
  const descriptor = fs.openSync(sourcePath, 'r');
  try {
    const header = Buffer.alloc(headerLength);
    const tag = Buffer.alloc(BACKUP_TAG_LENGTH);
    fs.readSync(descriptor, header, 0, header.length, 0);
    fs.readSync(descriptor, tag, 0, tag.length, stat.size - BACKUP_TAG_LENGTH);
    if (!header.subarray(0, BACKUP_MAGIC.length).equals(BACKUP_MAGIC)) throw new Error('Backup mã hóa không hợp lệ.');
    const iv = header.subarray(BACKUP_MAGIC.length);
    const decipher = crypto.createDecipheriv('aes-256-gcm', backupKey(), iv);
    decipher.setAuthTag(tag);
    await pipeline(
      fs.createReadStream(sourcePath, { start: headerLength, end: stat.size - BACKUP_TAG_LENGTH - 1 }),
      decipher,
      fs.createWriteStream(destinationPath, { mode: 0o600 }),
    );
    fs.chmodSync(destinationPath, 0o600);
  } finally {
    fs.closeSync(descriptor);
  }
};

const verifySqliteFile = (filePath: string) => {
  const candidate = new Database(filePath, { readonly: false });
  try {
    const result = candidate.pragma('integrity_check', { simple: true });
    if (result !== 'ok') return false;
    // Restored sessions must not inherit tokens that were issued before the restore.
    if (candidate.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'").get()) {
      const userColumns = candidate.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>;
      if (!userColumns.some((column) => column.name === 'session_version')) {
        candidate.exec('ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 1');
      }
      candidate.prepare('UPDATE users SET session_version = COALESCE(session_version, 1) + 1').run();
    }
    if (candidate.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'admin_users'").get()) {
      const adminColumns = candidate.prepare('PRAGMA table_info(admin_users)').all() as Array<{ name: string }>;
      if (!adminColumns.some((column) => column.name === 'session_version')) {
        candidate.exec('ALTER TABLE admin_users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 1');
      }
      candidate.prepare('UPDATE admin_users SET session_version = COALESCE(session_version, 1) + 1').run();
    }
    return true;
  } finally {
    candidate.close();
  }
};

// Auth Middleware
const authenticateUser = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as any;
    if (!decoded?.id || !decoded?.tenantId || !decoded?.sessionVersion) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    const user = await db.select().from(schema.users).where(and(
      eq(schema.users.id, decoded.id),
      eq(schema.users.tenantId, decoded.tenantId),
    )).get();
    const tenant = user ? await db.select().from(schema.tenants).where(eq(schema.tenants.id, user.tenantId)).get() : null;
    if (!user || !tenant || user.status !== 'active' || tenant.status === 'suspended') {
      return res.status(401).json({ error: 'Phiên đăng nhập không còn hiệu lực' });
    }
    if (Number(decoded.sessionVersion) !== Number(user.sessionVersion || 1)) {
      return res.status(401).json({ error: 'Phiên đăng nhập đã bị thu hồi' });
    }
    const directPermissionRows = await db.select().from(schema.userPermissions).where(and(
      eq(schema.userPermissions.tenantId, user.tenantId),
      eq(schema.userPermissions.userId, user.id),
    )).all();
    const roleProfile = await db.select().from(schema.roleProfiles).where(and(
      eq(schema.roleProfiles.tenantId, user.tenantId),
      eq(schema.roleProfiles.code, user.role),
    )).get();
    const rolePermissionRows = !roleProfile && isBuiltInRole(user.role) && user.role !== 'owner'
      ? await db.select().from(schema.rolePermissions).where(eq(schema.rolePermissions.role, user.role)).all()
      : [];
    const roleProfilePermissionRows = roleProfile
      ? await db.select().from(schema.roleProfilePermissions).where(eq(schema.roleProfilePermissions.roleProfileId, roleProfile.id)).all()
      : [];
    const permissionMap = new Map<string, boolean>();
    for (const grant of [...rolePermissionRows, ...roleProfilePermissionRows]) permissionMap.set(String(grant.permissionCode), Boolean(grant.allowed));
    for (const grant of directPermissionRows) permissionMap.set(String(grant.permissionCode), Boolean(grant.allowed));
    req.user = { ...decoded, id: user.id, email: user.email, tenantId: user.tenantId, role: user.role, sessionVersion: user.sessionVersion, permissionMap };
    // The JWT is validated against the control database first. All following
    // tenant routes run inside this request-scoped database context.
    try {
      return tenantRegistry.runWithTenantDatabase(user.tenantId, () => next());
    } catch (err) {
      console.error('Tenant database routing error:', err);
      return res.status(503).json({ error: 'Tenant database chưa sẵn sàng. Vui lòng thử lại sau.' });
    }
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

const hasRole = (userRole: string, roles: string[]) => roles.includes(userRole);
const builtInRoles = ['owner', 'manager', 'cashier', 'warehouse', 'accountant'];
const editableBuiltInRoles = ['manager', 'cashier', 'warehouse', 'accountant'];
const isBuiltInRole = (role: string) => builtInRoles.includes(role);
const builtInRoleDefinitions = [
  { code: 'owner', name: 'Chủ cửa hàng', description: 'Toàn quyền trong cửa hàng.' },
  { code: 'manager', name: 'Quản lý', description: 'Điều hành bán hàng, kho và báo cáo.' },
  { code: 'cashier', name: 'Bán hàng', description: 'Lên đơn và chăm sóc khách tại quầy.' },
  { code: 'warehouse', name: 'Kho', description: 'Quản lý mặt hàng và nhập hàng.' },
  { code: 'accountant', name: 'Kế toán', description: 'Theo dõi công nợ, sổ quỹ và báo cáo.' },
] as const;

const roleProfileFor = async (tenantId: string, code: string) => await db.select().from(schema.roleProfiles)
  .where(and(eq(schema.roleProfiles.tenantId, tenantId), eq(schema.roleProfiles.code, code))).get();

const ensureEditableRoleProfile = async (tenantId: string, code: string) => {
  const existing = await roleProfileFor(tenantId, code);
  if (existing) return existing;
  if (!editableBuiltInRoles.includes(code)) return null;
  const definition = builtInRoleDefinitions.find((role) => role.code === code);
  if (!definition) return null;
  const now = new Date().toISOString();
  const profile = { id: uuid(), tenantId, code, name: definition.name, description: definition.description, createdAt: now, updatedAt: now };
  const grants = await db.select().from(schema.rolePermissions).where(eq(schema.rolePermissions.role, code)).all();
  await db.transaction(async (tx) => {
    await tx.insert(schema.roleProfiles).values(profile).run();
    for (const grant of grants) {
      await tx.insert(schema.roleProfilePermissions).values({
        id: uuid(),
        roleProfileId: profile.id,
        permissionCode: grant.permissionCode,
        allowed: Boolean(grant.allowed),
        updatedAt: now,
      }).run();
    }
  });
  return profile;
};

const ensureRole = (req: Request, res: Response, roles: string[]) => {
  if (!req.user || !hasRole(req.user.role, roles)) {
    res.status(403).json({ error: 'Forbidden' });
    return false;
  }
  return true;
};

const ensureOwner = (req: Request, res: Response) => ensureRole(req, res, ['owner']);

const hasPermission = (req: Request, code: string) => {
  if (req.user?.role === 'owner') return true;
  return Boolean(req.user?.permissionMap?.get(code));
};

const ensurePermission = (req: Request, res: Response, code: string) => {
  if (!hasPermission(req, code)) {
    res.status(403).json({ error: `Bạn không có quyền: ${code}` });
    return false;
  }
  return true;
};

const ensureAnyPermission = (req: Request, res: Response, codes: string[]) => {
  if (codes.some((code) => hasPermission(req, code))) return true;
  res.status(403).json({ error: `Bạn không có quyền: ${codes.join(' hoặc ')}` });
  return false;
};

// Transaction visibility is deliberately enforced on the API, not only by
// client-side filters. Owners and roles granted this permission can review the
// whole tenant; other employees only receive records assigned to or created by
// their own account.
const canViewAllTransactions = (req: Request) => hasPermission(req, 'transactions.view_all');
const transactionOwnerId = (row: { actorId?: string | null; createdBy?: string | null }) => row.actorId || row.createdBy || null;
const canViewTransaction = (req: Request, row: { actorId?: string | null; createdBy?: string | null }) => (
  canViewAllTransactions(req) || transactionOwnerId(row) === req.user.id
);

const canReadCatalog = (req: Request) => hasPermission(req, 'inventory.view') || hasPermission(req, 'sales.view') || hasPermission(req, 'dashboard.view');
const redactProductForUser = (req: Request, product: any) => {
  if (hasPermission(req, 'inventory.view_cost')) return product;
  return {
    ...product,
    purchasePrice: 0,
    units: Array.isArray(product.units) ? product.units.map((unit: any) => ({ ...unit, purchasePrice: 0 })) : product.units,
  };
};

const productWritableFields = [
  'sku', 'name', 'category', 'unit', 'purchasePrice', 'sellingPrice', 'taxRate', 'stock', 'trackStock',
  'lowStockThreshold', 'maxStockThreshold', 'status', 'barcode', 'imageUrl', 'productType', 'attributes',
  'attributesJson', 'sourceSystem', 'sourceCode', 'sourceRelatedCode', 'sourceImportedAt',
] as const;
const pickProductFields = (body: any) => {
  const result: Record<string, unknown> = {};
  for (const field of productWritableFields) {
    if (body?.[field] !== undefined) result[field] = body[field];
  }
  if (result.name !== undefined) result.name = String(result.name).trim().slice(0, 500);
  if (result.sku !== undefined) result.sku = String(result.sku).trim().slice(0, 160);
  if (result.barcode !== undefined) result.barcode = String(result.barcode || '').trim().slice(0, 160) || null;
  if (result.productType !== undefined && result.productType !== 'standard' && result.productType !== 'combo') throw new Error('Loại hàng hóa không hợp lệ.');
  if (result.imageUrl !== undefined) {
    const imageUrl = String(result.imageUrl || '').trim();
    if (imageUrl && (!/^data:image\/(png|jpeg|webp);base64,/i.test(imageUrl) || imageUrl.length > 2_000_000)) throw new Error('Ảnh sản phẩm không hợp lệ hoặc quá lớn.');
    result.imageUrl = imageUrl || null;
  }
  for (const field of ['purchasePrice', 'sellingPrice', 'taxRate', 'stock', 'lowStockThreshold', 'maxStockThreshold']) {
    if (result[field] !== undefined) {
      const numeric = Number(result[field]);
      if (!Number.isFinite(numeric) || numeric < 0) throw new Error(`Trường ${field} không hợp lệ.`);
      result[field] = numeric;
    }
  }
  return result;
};

// ─── Health Check ───────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Liveness stays cheap and dependency-free. Readiness is used by the
// container/orchestrator and must prove that the selected database is reachable.
app.get('/api/ready', async (_req, res) => {
  try {
    await db.select({ value: sql<number>`1` }).from(schema.tenants).limit(1).get();
    res.json({ status: 'ready', database: 'ok', timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('GET /api/ready error:', err);
    res.status(503).json({ status: 'not_ready', database: 'unavailable' });
  }
});

// ─── Admin Routes ───────────────────────────────────────────
// The customer/offline build deliberately has no separate technical admin surface.
// A platform admin can only be enabled explicitly for a non-offline deployment.
if (ENABLE_PLATFORM_ADMIN) {
  const { default: adminRouter } = await import('./admin');
  app.use('/api/admin', adminRouter);
}

// ─── Tenant Auth (Login/Register) ───────────────────────────
app.post('/api/auth/login', async (req, res) => {
  try {
    const email = safeEmail(req.body?.email);
    const password = req.body?.password;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    const attemptKey = loginAttemptKey(req, email);
    if (isLoginBlocked(attemptKey)) return res.status(429).json({ error: 'Tài khoản hoặc địa chỉ mạng tạm thời bị giới hạn đăng nhập. Vui lòng thử lại sau.' });

    const user = await db.select().from(schema.users)
      .where(eq(schema.users.email, email)).get();

    if (!user) {
      recordLoginFailure(attemptKey);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    if (user.status !== 'active') {
      recordLoginFailure(attemptKey);
      return res.status(403).json({ error: 'Account inactive' });
    }

    // Verify password
    if (user.password) {
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        recordLoginFailure(attemptKey);
        return res.status(401).json({ error: 'Invalid credentials' });
      }
    } else {
      // Handle users without passwords (maybe imported or social login)
      recordLoginFailure(attemptKey);
      return res.status(401).json({ error: 'Password not set for this account' });
    }

    // Get tenant for this user
    const tenant = await db.select().from(schema.tenants)
      .where(eq(schema.tenants.id, user.tenantId)).get();
    if (!tenant || tenant.status === 'suspended') {
      return res.status(403).json({ error: 'Cửa hàng đang bị khóa.' });
    }
    clearLoginFailures(attemptKey);

    // Create JWT
    const token = jwt.sign(
      { id: user.id, email: user.email, tenantId: user.tenantId, role: user.role, sessionVersion: user.sessionVersion || 1 },
      JWT_SECRET,
      { expiresIn: '12h', algorithm: 'HS256' }
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
    if (!OFFLINE_MODE || await hasAnyUser()) {
      return res.status(403).json({ error: 'Đăng ký công khai đã bị khóa. Owner cần tạo nhân viên trong Cài đặt.' });
    }
    if (!isAllowedSetupRequest(req.ip, req.headers['x-hkd-setup-token'] as string | undefined)) {
      return res.status(403).json({ error: 'Khởi tạo owner chỉ được thực hiện trên máy chủ hoặc bằng setup token.' });
    }
    const { name, password, storeName } = req.body || {};
    const email = safeEmail(req.body?.email);
    if (!email || !name || !storeName || !password) {
      return res.status(400).json({ error: 'name, email, password, and storeName required' });
    }
    if (!isValidPassword(password)) return res.status(400).json({ error: publicPasswordError });

    // Check if user exists
    const existingUser = await db.select().from(schema.users).where(eq(schema.users.email, email)).get();
    if (existingUser) return res.status(400).json({ error: 'Email already registered' });

    const tenantId = uuid();
    const userId = uuid();
    const now = new Date().toISOString();

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    const userValues = {
      id: userId,
      name,
      email,
      password: hashedPassword,
      role: 'owner' as const,
      tenantId,
      status: 'active' as const,
      sessionVersion: 1,
    };
    await db.transaction(async (tx) => {
      if (await hasAnyUser()) throw new Error('SETUP_ALREADY_COMPLETED');
      await tx.insert(schema.tenants).values({
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
        maxUsers: 25,
        packagePriceMonthly: 150000,
        createdAt: now,
      }).run();
      await tx.insert(schema.users).values(userValues).run();
    });
    await ensureDefaultCashAccounts(tenantId);

    const tenant = await db.select().from(schema.tenants)
      .where(eq(schema.tenants.id, tenantId)).get();

    // Create JWT
    const token = jwt.sign(
      { id: userId, email, tenantId, role: 'owner', sessionVersion: 1 },
      JWT_SECRET,
      { expiresIn: '12h', algorithm: 'HS256' }
    );

    const { password: _, ...userData } = userValues;
    res.status(201).json({
      user: userData,
      tenant: withTenantAccess(tenant),
      token,
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'SETUP_ALREADY_COMPLETED') {
      return res.status(403).json({ error: 'Khởi tạo cửa hàng đã hoàn tất.' });
    }
    console.error('POST /api/auth/register error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/auth/me', authenticateUser, async (req, res) => {
  try {
    const user = await db.select().from(schema.users).where(eq(schema.users.id, req.user.id)).get();
    if (!user) return res.status(404).json({ error: 'User not found' });

    const tenant = await db.select().from(schema.tenants).where(eq(schema.tenants.id, user.tenantId)).get();

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

app.get('/api/setup/status', async (_req, res) => {
  res.json({ offlineMode: OFFLINE_MODE, setupRequired: OFFLINE_MODE && !await hasAnyUser(), setupTokenRequired: Boolean(SETUP_TOKEN) });
});

app.use('/api', authenticateUser);

// ─── Owner notifications ─────────────────────────────────
app.get('/api/notifications', async (req, res) => {
  try {
    if (!ensureOwner(req, res)) return;
    const requestedLimit = Number(req.query.limit);
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(Math.floor(requestedLimit), 100)
      : 40;
    const recipientWhere = and(
      eq(schema.notifications.tenantId, req.user.tenantId),
      eq(schema.notifications.recipientUserId, req.user.id),
    );
    const [items, unreadRow] = await Promise.all([
      db.select().from(schema.notifications)
        .where(recipientWhere)
        .orderBy(desc(schema.notifications.createdAt))
        .limit(limit)
        .all(),
      db.select({ count: sql<number>`count(*)` })
        .from(schema.notifications)
        .where(and(recipientWhere, eq(schema.notifications.isRead, 0)))
        .get(),
    ]);
    const actorIds: string[] = Array.from(new Set(items.map((item) => item.actorId).filter((value): value is string => Boolean(value))));
    const actors = actorIds.length
      ? await db.select({ id: schema.users.id, name: schema.users.name })
        .from(schema.users)
        .where(and(eq(schema.users.tenantId, req.user.tenantId), inArray(schema.users.id, actorIds)))
        .all()
      : [];
    const actorNames = new Map(actors.map((actor) => [actor.id, actor.name]));
    res.json({
      items: items.map((item) => ({ ...item, actorName: actorNames.get(item.actorId) || null })),
      unreadCount: Number(unreadRow?.count || 0),
    });
  } catch (err) {
    console.error('GET /api/notifications error:', err);
    res.status(500).json({ error: 'Không thể tải thông báo' });
  }
});

app.post('/api/notifications/:id/read', async (req, res) => {
  try {
    if (!ensureOwner(req, res)) return;
    await db.update(schema.notifications)
      .set({ isRead: 1, readAt: new Date().toISOString() })
      .where(and(
        eq(schema.notifications.id, req.params.id),
        eq(schema.notifications.tenantId, req.user.tenantId),
        eq(schema.notifications.recipientUserId, req.user.id),
      ))
      .run();
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/notifications/:id/read error:', err);
    res.status(500).json({ error: 'Không thể cập nhật thông báo' });
  }
});

app.post('/api/notifications/read-all', async (req, res) => {
  try {
    if (!ensureOwner(req, res)) return;
    await db.update(schema.notifications)
      .set({ isRead: 1, readAt: new Date().toISOString() })
      .where(and(
        eq(schema.notifications.tenantId, req.user.tenantId),
        eq(schema.notifications.recipientUserId, req.user.id),
        eq(schema.notifications.isRead, 0),
      ))
      .run();
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/notifications/read-all error:', err);
    res.status(500).json({ error: 'Không thể đánh dấu thông báo' });
  }
});

const getMachineHash = () => {
  const network = Object.values(os.networkInterfaces()).flat().filter(Boolean).map((item) => `${item?.mac}:${item?.address}`).sort().join('|');
  return crypto.createHash('sha256').update(`${os.hostname()}|${network}|${INSTANCE_SECRET}`).digest('hex');
};
const getInstanceId = () => process.env.HKDPLUS_INSTANCE_ID?.trim() || crypto.createHash('sha256').update(getMachineHash()).digest('hex').slice(0, 24);
const persistLicenseToken = async (token: string) => {
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
  const existing = await db.select().from(schema.licenseInstances).get();
  const values = { instanceId, licenseCode: payload.licenseCode, customerName: payload.customerName || '', machineHash, issuedAt: payload.issuedAt || now, expiresAt: payload.expiresAt || null, status: 'active' as const, payload: JSON.stringify(payload), lastValidatedAt: now, createdAt: existing?.createdAt || now };
  if (existing) await db.update(schema.licenseInstances).set(values).where(eq(schema.licenseInstances.id, existing.id)).run();
  else await db.insert(schema.licenseInstances).values({ id: uuid(), ...values }).run();
  return { status: 'active', customerName: values.customerName, expiresAt: values.expiresAt };
};
const nextDocumentNo = async (tenantId: string, documentType: string, prefix: string) => {
  const next = await nextSequenceNumber(tenantId, documentType, prefix);
  return `${prefix}-${String(next).padStart(6, '0')}`;
};

const nextCustomerCode = async (tenantId: string) => {
  return `KH${String(await nextSequenceNumber(tenantId, 'customer', 'KH', /^KH(\d+)$/i)).padStart(6, '0')}`;
};

app.get('/api/system/status', async (req, res) => {
  try {
    const interfaces = Object.values(os.networkInterfaces()).flat().filter((item) => item && !item.internal && item.family === 'IPv4').map((item) => item?.address).filter(Boolean);
    const license = await db.select().from(schema.licenseInstances).get();
    const ownerOnly = req.user.role === 'owner';
    res.json({
      product: 'HKD Smart',
      instanceId: INSTANCE_ID,
      hostname: os.hostname(),
      addresses: ownerOnly ? interfaces : [],
      localUrl: ownerOnly ? (process.env.HKDPLUS_PUBLIC_URL || 'https://hkdplus.lan') : null,
      apiPort: PORT,
      database: DATABASE_PROVIDER === 'postgres'
        ? 'PostgreSQL'
        : (DATABASE_MODE === 'per_tenant' ? 'SQLite per tenant' : 'SQLite'),
      databaseMode: DATABASE_MODE,
      dataPath: OFFLINE_MODE && ownerOnly ? path.dirname(DB_PATH) : null,
      license: license ? { status: license.status, customerName: license.customerName, expiresAt: license.expiresAt, lastValidatedAt: license.lastValidatedAt } : { status: 'unlicensed' },
      tenantId: req.user.tenantId,
    });
  } catch (err) {
    console.error('GET /api/system/status error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/tax-profile', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'settings.view')) return;
    let profile = await db.select().from(schema.taxProfiles).where(eq(schema.taxProfiles.tenantId, req.user.tenantId)).get();
    if (!profile) {
      const now = new Date().toISOString();
      const created = { id: uuid(), tenantId: req.user.tenantId, name: 'Mặc định', taxMethod: 'Chưa cấu hình', defaultTaxRate: 0, taxCode: null, active: true, createdAt: now };
      await db.insert(schema.taxProfiles).values(created).run();
      profile = created;
    }
    res.json(profile);
  } catch (err) { console.error('GET /api/tax-profile error:', err); res.status(500).json({ error: 'Không thể tải cấu hình thuế' }); }
});

app.patch('/api/tax-profile', async (req, res) => {
  try {
    if (!ensureOwner(req, res)) return;
    const existing = await db.select().from(schema.taxProfiles).where(eq(schema.taxProfiles.tenantId, req.user.tenantId)).get();
    const data = { name: String(req.body?.name || 'Mặc định'), taxMethod: String(req.body?.taxMethod || 'Chưa cấu hình'), defaultTaxRate: Math.max(0, Number(req.body?.defaultTaxRate) || 0), taxCode: req.body?.taxCode ? String(req.body.taxCode) : null, active: req.body?.active !== false };
    if (existing) await db.update(schema.taxProfiles).set(data).where(eq(schema.taxProfiles.id, existing.id)).run();
    else await db.insert(schema.taxProfiles).values({ id: uuid(), tenantId: req.user.tenantId, ...data, createdAt: new Date().toISOString() }).run();
    res.json(await db.select().from(schema.taxProfiles).where(eq(schema.taxProfiles.tenantId, req.user.tenantId)).get());
  } catch (err) { console.error('PATCH /api/tax-profile error:', err); res.status(500).json({ error: 'Không thể lưu cấu hình thuế' }); }
});

app.get('/api/document-sequences', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'settings.view')) return;
    const rows = await db.select().from(schema.documentSequences).where(eq(schema.documentSequences.tenantId, req.user.tenantId)).all();
    res.json(rows);
  } catch (err) { console.error('GET /api/document-sequences error:', err); res.status(500).json({ error: 'Không thể tải dãy số chứng từ' }); }
});

app.get('/api/backups', async (req, res) => {
  try {
    if (!ensureOwner(req, res)) return;
    res.json(await db.select().from(schema.backupLogs)
      .where(eq(schema.backupLogs.tenantId, req.user.tenantId))
      .orderBy(desc(schema.backupLogs.createdAt)).limit(20).all());
  } catch (err) {
    console.error('GET /api/backups error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/backups', async (req, res) => {
  try {
    if (!ensureOwner(req, res)) return;
    const dataRoot = path.dirname(DB_PATH);
    const backupDir = tenantRegistry.backupDirectory(req.user.tenantId, dataRoot);
    fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
    fs.chmodSync(backupDir, 0o700);
    const fileName = `hkdplus-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.db.enc`;
    const filePath = path.join(backupDir, fileName);
    const rawPath = path.join(backupDir, `${fileName}.raw`);
    await sqlite.backup(rawPath);
    await encryptBackupFile(rawPath, filePath);
    const stat = fs.statSync(filePath);
    const log = {
      id: uuid(),
      tenantId: req.user.tenantId,
      instanceId: INSTANCE_ID,
      filePath: path.relative(dataRoot, filePath),
      sizeBytes: stat.size,
      checksumSha256: sha256File(filePath),
      schemaVersion: 1,
      verified: true,
      createdBy: req.user.id,
      createdAt: new Date().toISOString(),
    };
    await db.insert(schema.backupLogs).values(log).run();
    await writeTenantAudit(req, 'backup_created', 'backup', log.id, { sizeBytes: log.sizeBytes });
    res.status(201).json(log);
  } catch (err) {
    console.error('POST /api/backups error:', err);
    res.status(500).json({ error: 'Không thể tạo bản sao lưu' });
  }
});

app.post('/api/backups/restore', async (req, res) => {
  let stagedPath: string | null = null;
  try {
    if (!ensureOwner(req, res)) return;
    const backupId = String(req.body?.backupId || '');
    const backup = await db.select().from(schema.backupLogs).where(and(eq(schema.backupLogs.id, backupId), eq(schema.backupLogs.tenantId, req.user.tenantId))).get();
    if (!backup) return res.status(404).json({ error: 'Không tìm thấy bản sao lưu' });
    const dataRoot = path.dirname(DB_PATH);
    const backupDir = path.resolve(tenantRegistry.backupDirectory(req.user.tenantId, dataRoot));
    const sourcePath = path.resolve(dataRoot, backup.filePath);
    // Backups created before per-tenant storage used the shared backups
    // directory. Keep those records restorable while restricting the source
    // to either the current tenant directory or that exact legacy root.
    const legacyBackupDir = path.resolve(dataRoot, 'backups');
    const allowedBackupRoots = [backupDir, ...(PER_TENANT_DATABASES ? [legacyBackupDir] : [])];
    const isAllowedBackupPath = allowedBackupRoots.some((root) => sourcePath.startsWith(`${root}${path.sep}`));
    if (!isAllowedBackupPath || !fs.existsSync(sourcePath)) {
      return res.status(400).json({ error: 'Đường dẫn bản sao lưu không hợp lệ' });
    }
    if (backup.instanceId && backup.instanceId !== INSTANCE_ID) {
      return res.status(400).json({ error: 'Bản sao lưu thuộc instance khác.' });
    }
    if (backup.checksumSha256 && sha256File(sourcePath) !== backup.checksumSha256) {
      return res.status(400).json({ error: 'Bản sao lưu đã bị thay đổi hoặc hỏng.' });
    }
    stagedPath = path.join(backupDir, `restore-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.db`);
    if (sourcePath.endsWith('.enc')) await decryptBackupFile(sourcePath, stagedPath);
    else fs.copyFileSync(sourcePath, stagedPath);
    fs.chmodSync(stagedPath, 0o600);
    if (!verifySqliteFile(stagedPath)) {
      fs.rmSync(stagedPath, { force: true });
      return res.status(400).json({ error: 'Bản sao lưu không vượt qua kiểm tra toàn vẹn SQLite.' });
    }
    const safetyPath = path.join(backupDir, `before-restore-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.db.enc`);
    const safetyRawPath = `${safetyPath}.raw`;
    await sqlite.backup(safetyRawPath);
    await encryptBackupFile(safetyRawPath, safetyPath);
    // The backup log is written after the snapshot is created, so preserve
    // the selected backup record and the restore event inside the restored
    // database before it replaces the active file.
    const stagedDatabase = new Database(stagedPath);
    try {
      stagedDatabase.prepare(
        'INSERT OR IGNORE INTO backup_logs (id, tenant_id, instance_id, file_path, size_bytes, checksum_sha256, schema_version, verified, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).run(backup.id, backup.tenantId, backup.instanceId, backup.filePath, backup.sizeBytes, backup.checksumSha256, backup.schemaVersion, backup.verified ? 1 : 0, backup.createdBy, backup.createdAt);
      stagedDatabase.prepare(
        'INSERT INTO audit_logs (id, actor_type, actor_id, action, entity_type, entity_id, tenant_id, meta, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).run(uuid(), 'tenant_user', req.user.id, 'backup_restore_requested', 'backup', backup.id, req.user.tenantId, JSON.stringify({ safetyPath: path.basename(safetyPath) }), new Date().toISOString());
    } finally {
      stagedDatabase.close();
    }
    if (PER_TENANT_DATABASES) {
      tenantRegistry.replaceTenantDatabase(req.user.tenantId, stagedPath);
    } else {
      sqlite.close();
      fs.renameSync(stagedPath, DB_PATH);
    }
    stagedPath = null;
    res.json({ success: true, message: 'Đã khôi phục dữ liệu. Máy chủ sẽ khởi động lại.' });
    setTimeout(() => process.exit(0), 250);
  } catch (err) {
    if (stagedPath) fs.rmSync(stagedPath, { force: true });
    console.error('POST /api/backups/restore error:', err);
    res.status(500).json({ error: 'Không thể khôi phục bản sao lưu' });
  }
});

app.get('/api/license/status', async (_req, res) => {
  try {
    const license = await db.select().from(schema.licenseInstances).get();
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

app.post('/api/license/activate', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'settings.manage_users')) return;
    const token = String(req.body?.licenseToken || '');
    const result = await persistLicenseToken(token);
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
    const license = await db.select().from(schema.licenseInstances).get();
    if (!serverUrl || !license) return res.status(503).json({ error: 'Chưa cấu hình license server hoặc instance chưa kích hoạt' });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`${serverUrl.replace(/\/$/, '')}/api/licenses/validate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ instanceId: license.instanceId, licenseCode: license.licenseCode, machineHash: getMachineHash(), payload: license.payload ? JSON.parse(license.payload) : null }), signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) return res.status(502).json({ error: 'License server từ chối xác minh' });
    const result = await response.json() as { licenseToken?: string };
    if (result.licenseToken) {
      const activated = await persistLicenseToken(result.licenseToken);
      if ('error' in activated) return res.status(502).json(activated);
      return res.json(activated);
    }
    await db.update(schema.licenseInstances).set({ lastValidatedAt: new Date().toISOString() }).where(eq(schema.licenseInstances.id, license.id)).run();
    res.json({ status: 'validated', lastValidatedAt: new Date().toISOString() });
  } catch (err) { console.error('POST /api/license/refresh error:', err); res.status(502).json({ error: 'Không thể kết nối license server' }); }
});

app.get('/api/permissions', async (req, res) => {
  try {
    const grants = await db.select().from(schema.permissions).all();
    const roleGrants = await rolePermissionRows(req.user.role, req.user.tenantId);
    const userGrants = await db.select().from(schema.userPermissions).where(and(eq(schema.userPermissions.tenantId, req.user.tenantId), eq(schema.userPermissions.userId, req.user.id))).all();
    const roleMap = new Map<string, boolean>(roleGrants.map((grant) => [String(grant.permissionCode), Boolean(grant.allowed)] as [string, boolean]));
    const userMap = new Map<string, boolean>(userGrants.map((grant) => [String(grant.permissionCode), Boolean(grant.allowed)] as [string, boolean]));
    res.json(grants.map((permission) => ({ ...permission, allowed: req.user.role === 'owner' ? true : userMap.has(permission.code) ? userMap.get(permission.code) : Boolean(roleMap.get(permission.code)) })));
  } catch (err) {
    console.error('GET /api/permissions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const rolePermissionRows = async (role: string, tenantId: string) => {
  const profile = await roleProfileFor(tenantId, role);
  if (profile) return await db.select().from(schema.roleProfilePermissions).where(eq(schema.roleProfilePermissions.roleProfileId, profile.id)).all();
  if (isBuiltInRole(role) && role !== 'owner') return await db.select().from(schema.rolePermissions).where(eq(schema.rolePermissions.role, role)).all();
  return [];
};

app.get('/api/roles', async (req, res) => {
  try {
    if (!ensureOwner(req, res)) return;
    const profiles = await db.select().from(schema.roleProfiles).where(eq(schema.roleProfiles.tenantId, req.user.tenantId)).all();
    const profileByCode = new Map<string, typeof profiles[number]>(profiles.map((profile) => [profile.code, profile] as [string, typeof profile]));
    const builtIns = await Promise.all(builtInRoleDefinitions.map(async (role) => {
      const profile = profileByCode.get(role.code);
      const grants = profile
        ? await db.select().from(schema.roleProfilePermissions).where(and(eq(schema.roleProfilePermissions.roleProfileId, profile.id), eq(schema.roleProfilePermissions.allowed, true))).all()
        : await db.select().from(schema.rolePermissions).where(and(eq(schema.rolePermissions.role, role.code), eq(schema.rolePermissions.allowed, true))).all();
      return {
        ...role,
        name: profile?.name || role.name,
        description: profile?.description || role.description,
        builtIn: true,
        editable: editableBuiltInRoles.includes(role.code),
        customized: Boolean(profile),
        permissionCount: grants.length,
      };
    }));
    const custom = await Promise.all(profiles.filter((role) => !isBuiltInRole(role.code)).map(async (role) => ({
      code: role.code,
      name: role.name,
      description: role.description,
      builtIn: false,
      editable: true,
      customized: true,
      permissionCount: (await db.select().from(schema.roleProfilePermissions).where(and(eq(schema.roleProfilePermissions.roleProfileId, role.id), eq(schema.roleProfilePermissions.allowed, true))).all()).length,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    })));
    res.json([...builtIns, ...custom]);
  } catch (err) {
    console.error('GET /api/roles error:', err);
    res.status(500).json({ error: 'Không thể tải danh sách vai trò' });
  }
});

app.get('/api/roles/:code/permissions', async (req, res) => {
  try {
    if (!ensureOwner(req, res)) return;
    const grants = await rolePermissionRows(req.params.code, req.user.tenantId);
    const grantMap = new Map<string, boolean>(grants.map((grant) => [String(grant.permissionCode), Boolean(grant.allowed)] as [string, boolean]));
    const permissions = await db.select().from(schema.permissions).all();
    res.json(permissions.map((permission) => ({ ...permission, allowed: Boolean(grantMap.get(permission.code)) })));
  } catch (err) {
    console.error('GET /api/roles/:code/permissions error:', err);
    res.status(500).json({ error: 'Không thể tải quyền của vai trò' });
  }
});

app.post('/api/roles', async (req, res) => {
  try {
    if (!ensureOwner(req, res)) return;
    const code = String(req.body?.code || '').trim().toLowerCase();
    const name = String(req.body?.name || '').trim();
    const description = String(req.body?.description || '').trim();
    if (!/^[a-z][a-z0-9_-]{1,31}$/.test(code) || isBuiltInRole(code)) return res.status(400).json({ error: 'Mã vai trò không hợp lệ hoặc đã được hệ thống sử dụng' });
    if (!name) return res.status(400).json({ error: 'Tên vai trò là bắt buộc' });
    if (await roleProfileFor(req.user.tenantId, code)) return res.status(400).json({ error: 'Mã vai trò đã tồn tại' });
    const now = new Date().toISOString();
    const profile = { id: uuid(), tenantId: req.user.tenantId, code, name, description, createdAt: now, updatedAt: now };
    const entries = Array.isArray(req.body?.permissions) ? req.body.permissions : [];
    const knownCodes = new Set((await db.select({ code: schema.permissions.code }).from(schema.permissions).all()).map((permission) => permission.code));
    await db.transaction(async (tx) => {
      await tx.insert(schema.roleProfiles).values(profile).run();
      for (const entry of entries) {
        if (typeof entry?.code !== 'string' || !knownCodes.has(entry.code) || typeof entry?.allowed !== 'boolean') continue;
        await tx.insert(schema.roleProfilePermissions).values({ id: uuid(), roleProfileId: profile.id, permissionCode: entry.code, allowed: entry.allowed, updatedAt: now }).run();
      }
    });
    res.status(201).json({ ...profile, builtIn: false });
  } catch (err) {
    console.error('POST /api/roles error:', err);
    res.status(500).json({ error: 'Không thể tạo vai trò' });
  }
});

app.patch('/api/roles/:code', async (req, res) => {
  try {
    if (!ensureOwner(req, res)) return;
    if (req.params.code === 'owner') return res.status(400).json({ error: 'Không sửa vai trò chủ cửa hàng' });
    const profile = await ensureEditableRoleProfile(req.user.tenantId, req.params.code);
    if (!profile) return res.status(404).json({ error: 'Không tìm thấy vai trò' });
    const now = new Date().toISOString();
    const updates: any = { updatedAt: now };
    if (req.body?.name !== undefined) updates.name = String(req.body.name).trim();
    if (req.body?.description !== undefined) updates.description = String(req.body.description).trim();
    if (!updates.name) return res.status(400).json({ error: 'Tên vai trò là bắt buộc' });
    await db.update(schema.roleProfiles).set(updates).where(eq(schema.roleProfiles.id, profile.id)).run();
    res.json({ ...profile, ...updates, builtIn: false });
  } catch (err) {
    console.error('PATCH /api/roles/:code error:', err);
    res.status(500).json({ error: 'Không thể cập nhật vai trò' });
  }
});

app.put('/api/roles/:code/permissions', async (req, res) => {
  try {
    if (!ensureOwner(req, res)) return;
    if (req.params.code === 'owner') return res.status(400).json({ error: 'Không sửa quyền vai trò chủ cửa hàng' });
    const profile = await ensureEditableRoleProfile(req.user.tenantId, req.params.code);
    if (!profile) return res.status(404).json({ error: 'Không tìm thấy vai trò' });
    const entries = Array.isArray(req.body?.permissions) ? req.body.permissions : [];
    const knownCodes = new Set((await db.select({ code: schema.permissions.code }).from(schema.permissions).all()).map((permission) => permission.code));
    const now = new Date().toISOString();
    await db.transaction(async (tx) => {
      await tx.delete(schema.roleProfilePermissions).where(eq(schema.roleProfilePermissions.roleProfileId, profile.id)).run();
      for (const entry of entries) {
        if (typeof entry?.code !== 'string' || !knownCodes.has(entry.code) || typeof entry?.allowed !== 'boolean') continue;
        await tx.insert(schema.roleProfilePermissions).values({ id: uuid(), roleProfileId: profile.id, permissionCode: entry.code, allowed: entry.allowed, updatedAt: now }).run();
      }
      await tx.update(schema.roleProfiles).set({ updatedAt: now }).where(eq(schema.roleProfiles.id, profile.id)).run();
      await tx.update(schema.users)
        .set({ sessionVersion: sql`${schema.users.sessionVersion} + 1` })
        .where(and(eq(schema.users.tenantId, req.user.tenantId), eq(schema.users.role, profile.code as any))).run();
    });
    res.json({ success: true });
  } catch (err) {
    console.error('PUT /api/roles/:code/permissions error:', err);
    res.status(500).json({ error: 'Không thể lưu quyền vai trò' });
  }
});

app.delete('/api/roles/:code', async (req, res) => {
  try {
    if (!ensureOwner(req, res)) return;
    if (isBuiltInRole(req.params.code)) return res.status(400).json({ error: 'Không xóa vai trò mặc định' });
    const profile = await roleProfileFor(req.user.tenantId, req.params.code);
    if (!profile) return res.status(404).json({ error: 'Không tìm thấy vai trò' });
    const assigned = await db.select().from(schema.users).where(and(eq(schema.users.tenantId, req.user.tenantId), eq(schema.users.role, req.params.code as any))).get();
    if (assigned) return res.status(400).json({ error: 'Không thể xóa vai trò đang được sử dụng' });
    await db.delete(schema.roleProfiles).where(eq(schema.roleProfiles.id, profile.id)).run();
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/roles/:code error:', err);
    res.status(500).json({ error: 'Không thể xóa vai trò' });
  }
});

app.get('/api/users/:id/permissions', async (req, res) => {
  try {
    if (!ensureOwner(req, res)) return;
    const user = await db.select().from(schema.users).where(and(eq(schema.users.id, req.params.id), eq(schema.users.tenantId, req.user.tenantId))).get();
    if (!user) return res.status(404).json({ error: 'User not found' });
    const permissions = await db.select().from(schema.permissions).all();
    const roleGrants = await rolePermissionRows(user.role, req.user.tenantId);
    const userGrants = await db.select().from(schema.userPermissions).where(and(eq(schema.userPermissions.tenantId, req.user.tenantId), eq(schema.userPermissions.userId, user.id))).all();
    const roleMap = new Map<string, boolean>(roleGrants.map((grant) => [String(grant.permissionCode), Boolean(grant.allowed)] as [string, boolean]));
    const userMap = new Map<string, boolean>(userGrants.map((grant) => [String(grant.permissionCode), Boolean(grant.allowed)] as [string, boolean]));
    res.json(permissions.map((permission) => ({ ...permission, allowed: userMap.has(permission.code) ? userMap.get(permission.code) : Boolean(roleMap.get(permission.code)), overridden: userMap.has(permission.code) })));
  } catch (err) {
    console.error('GET /api/users/:id/permissions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/users/:id/permissions', async (req, res) => {
  try {
    if (!ensureOwner(req, res)) return;
    const user = await db.select().from(schema.users).where(and(eq(schema.users.id, req.params.id), eq(schema.users.tenantId, req.user.tenantId))).get();
    if (!user) return res.status(404).json({ error: 'User not found' });
    const entries = Array.isArray(req.body?.permissions) ? req.body.permissions : [];
    const now = new Date().toISOString();
    await db.transaction(async (tx) => {
      await tx.delete(schema.userPermissions).where(and(eq(schema.userPermissions.tenantId, req.user.tenantId), eq(schema.userPermissions.userId, user.id))).run();
      for (const entry of entries) {
        if (typeof entry?.code !== 'string' || typeof entry?.allowed !== 'boolean') continue;
        await tx.insert(schema.userPermissions).values({ id: uuid(), tenantId: req.user.tenantId, userId: user.id, permissionCode: entry.code, allowed: entry.allowed, updatedAt: now }).run();
      }
      await tx.update(schema.users)
        .set({ sessionVersion: sql`${schema.users.sessionVersion} + 1` })
        .where(eq(schema.users.id, user.id)).run();
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

app.get('/api/tenants', async (req, res) => {
  try {
    const tenants = await db.select().from(schema.tenants)
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

app.get('/api/tenants/:id', async (req, res) => {
  try {
    if (req.params.id !== req.user.tenantId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const tenant = await db.select().from(schema.tenants).where(eq(schema.tenants.id, req.params.id)).get();
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    res.json(withTenantAccess(tenant));
  } catch (err) {
    console.error('GET /api/tenants/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.patch('/api/tenants/:id', async (req, res) => {
  try {
    if (!ensureOwner(req, res)) return;
    if (req.params.id !== req.user.tenantId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const body = req.body || {};
    const updateData: Record<string, unknown> = {};
    const writableFields = ['name', 'legalName', 'address', 'province', 'district', 'ward', 'phone', 'email', 'taxInfo', 'invoicePrefix'] as const;
    for (const field of writableFields) {
      if (body[field] !== undefined) updateData[field] = String(body[field] ?? '').trim();
    }
    if (body.logoUrl !== undefined) {
      const logoUrl = String(body.logoUrl || '').trim();
      if (logoUrl && (!/^data:image\/(png|jpeg|webp);base64,/i.test(logoUrl) || logoUrl.length > 2_000_000)) {
        return res.status(400).json({ error: 'Logo không hợp lệ hoặc vượt quá 1.5 MB.' });
      }
      updateData.logoUrl = logoUrl || null;
    }
    if (body.settings !== undefined) {
      if (!body.settings || typeof body.settings !== 'object' || Array.isArray(body.settings)) {
        return res.status(400).json({ error: 'Cấu hình cửa hàng không hợp lệ.' });
      }
      const serializedSettings = JSON.stringify(body.settings);
      if (serializedSettings.length > 250_000) return res.status(400).json({ error: 'Cấu hình cửa hàng quá lớn.' });
      updateData.settings = serializedSettings;
    }
    if (!Object.keys(updateData).length) return res.status(400).json({ error: 'Không có trường hợp lệ để cập nhật.' });
    await db.update(schema.tenants).set(updateData).where(eq(schema.tenants.id, req.params.id)).run();
    const updated = await db.select().from(schema.tenants).where(eq(schema.tenants.id, req.params.id)).get();
    if (!updated) return res.status(404).json({ error: 'Tenant not found' });
    await writeTenantAudit(req, 'tenant_updated', 'tenant', req.params.id, { fields: Object.keys(updateData) });
    res.json(withTenantAccess(updated));
  } catch (err) {
    console.error('PATCH /api/tenants/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/tenants/:id/complete-setup', async (req, res) => {
  try {
    if (!ensureOwner(req, res)) return;
    if (req.params.id !== req.user.tenantId) return res.status(403).json({ error: 'Forbidden' });
    const tenant = await db.select().from(schema.tenants).where(eq(schema.tenants.id, req.params.id)).get();
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    if (tenant.status !== 'active') {
      await db.update(schema.tenants).set({ status: 'active' }).where(eq(schema.tenants.id, req.params.id)).run();
      await writeTenantAudit(req, 'tenant_setup_completed', 'tenant', req.params.id);
    }
    const updated = await db.select().from(schema.tenants).where(eq(schema.tenants.id, req.params.id)).get();
    res.json(withTenantAccess(updated));
  } catch (err) {
    console.error('POST /api/tenants/:id/complete-setup error:', err);
    res.status(500).json({ error: 'Không thể hoàn tất thiết lập cửa hàng' });
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

app.get('/api/users', async (req, res) => {
  try {
    if (!ensureOwner(req, res)) return;
    const users = await db.select().from(schema.users)
      .where(eq(schema.users.tenantId, req.user.tenantId)).all();
    res.json(users.map(({ password: _, ...user }) => user));
  } catch (err) {
    console.error('GET /api/users error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/users/:id', async (req, res) => {
  try {
    if (!ensureOwner(req, res)) return;
    const user = await db.select().from(schema.users)
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
    if (!ensureOwner(req, res)) return;
    const { name, password, phone, role, status } = req.body || {};
    const email = safeEmail(req.body?.email);
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'name, email, password, role are required' });
    }
    if (!isValidPassword(password)) return res.status(400).json({ error: publicPasswordError });

    const tenant = await db.select().from(schema.tenants).where(eq(schema.tenants.id, req.user.tenantId)).get();
    const userCount = (await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.tenantId, req.user.tenantId)).all()).length;
    if (tenant && Number(tenant.maxUsers || 0) > 0 && userCount >= Number(tenant.maxUsers)) {
      return res.status(409).json({ error: `Gói hiện tại giới hạn ${tenant.maxUsers} tài khoản.` });
    }

    if (role === 'owner' || (!isBuiltInRole(role) && !await roleProfileFor(req.user.tenantId, role))) {
      return res.status(400).json({ error: 'Vai trò không hợp lệ hoặc chưa được tạo trong cửa hàng.' });
    }

    const existing = await db.select().from(schema.users).where(eq(schema.users.email, email)).get();
    const globalExisting = await controlDb.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email)).get();
    if (existing || globalExisting) return res.status(400).json({ error: 'Email already exists' });

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = {
      id: uuid(),
      name,
      email,
      password: hashedPassword,
      phone: phone || '',
      role,
      tenantId: req.user.tenantId,
      status: status === 'inactive' ? 'inactive' as const : 'active' as const,
      sessionVersion: 1,
    };

    await db.insert(schema.users).values(user).run();
    tenantRegistry.syncUserToControl(user);
    await writeTenantAudit(req, 'user_created', 'user', user.id, { role: user.role, email: user.email });
    const { password: _password, ...response } = user;
    res.status(201).json(response);
  } catch (err) {
    console.error('POST /api/users error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.patch('/api/users/:id', async (req, res) => {
  try {
    if (!ensureOwner(req, res)) return;
    const existing = await db.select().from(schema.users)
      .where(and(eq(schema.users.id, req.params.id), eq(schema.users.tenantId, req.user.tenantId)))
      .get();
    if (!existing) return res.status(404).json({ error: 'User not found' });

    const updates: any = {};
    if (req.body.name !== undefined) updates.name = req.body.name;
    if (req.body.phone !== undefined) updates.phone = req.body.phone;
    if (req.body.status !== undefined) updates.status = req.body.status === 'inactive' ? 'inactive' : 'active';
    if (req.body.role !== undefined) {
      const nextRole = String(req.body.role);
      if (nextRole !== 'owner' && !isBuiltInRole(nextRole) && !await roleProfileFor(req.user.tenantId, nextRole)) {
        return res.status(400).json({ error: 'Vai trò không hợp lệ hoặc chưa được tạo trong cửa hàng.' });
      }
      if (nextRole === 'owner' && (req.user.role !== 'owner' || existing.id !== req.user.id)) {
        return res.status(403).json({ error: 'Chỉ owner hiện tại mới được giữ vai trò owner.' });
      }
      if (existing.id === req.user.id && nextRole !== existing.role) {
        return res.status(400).json({ error: 'Không được tự thay đổi vai trò của chính mình.' });
      }
      updates.role = nextRole;
    }
    if (req.body.password) {
      if (!isValidPassword(req.body.password)) return res.status(400).json({ error: publicPasswordError });
      updates.password = await bcrypt.hash(req.body.password, 12);
    }

    if (existing.id === req.user.id && req.body.status === 'inactive') {
      return res.status(400).json({ error: 'Không được tự khóa tài khoản owner.' });
    }
    if (Object.keys(updates).length > 0) updates.sessionVersion = Number(existing.sessionVersion || 1) + 1;

    await db.update(schema.users).set(updates).where(eq(schema.users.id, existing.id)).run();
    await writeTenantAudit(req, 'user_updated', 'user', existing.id, { role: updates.role || existing.role, status: updates.status || existing.status, passwordChanged: Boolean(updates.password) });
    const updated = await db.select().from(schema.users).where(eq(schema.users.id, existing.id)).get();
    if (!updated) return res.status(404).json({ error: 'User not found' });
    tenantRegistry.syncUserToControl(updated);
    const { password: _password, ...response } = updated;
    res.json(response);
  } catch (err) {
    console.error('PATCH /api/users/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    if (!ensureOwner(req, res)) return;
    const existing = await db.select().from(schema.users)
      .where(and(eq(schema.users.id, req.params.id), eq(schema.users.tenantId, req.user.tenantId)))
      .get();
    if (!existing) return res.status(404).json({ error: 'User not found' });
    if (existing.role === 'owner') {
      return res.status(400).json({ error: 'Cannot delete owner account' });
    }
    await db.delete(schema.users).where(eq(schema.users.id, req.params.id)).run();
    tenantRegistry.deleteUserFromControl(existing.id);
    await writeTenantAudit(req, 'user_deleted', 'user', existing.id, { role: existing.role });
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/users/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════
// CATEGORIES
// ═══════════════════════════════════════════════════════════

app.get('/api/categories', async (req, res) => {
  try {
    res.json(await db.select().from(schema.categories)
      .where(eq(schema.categories.tenantId, req.user.tenantId)).all());
  } catch (err) {
    console.error('GET /api/categories error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/categories', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'inventory.create')) return;
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Tên danh mục là bắt buộc' });
    const category = { id: uuid(), tenantId: req.user.tenantId, name, description: String(req.body?.description || '').trim() };
    await db.insert(schema.categories).values(category).run();
    res.status(201).json(category);
  } catch (err) {
    console.error('POST /api/categories error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.patch('/api/categories/:id', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'inventory.update')) return;
    const category = await db.select().from(schema.categories)
      .where(and(eq(schema.categories.id, req.params.id), eq(schema.categories.tenantId, req.user.tenantId))).get();
    if (!category) return res.status(404).json({ error: 'Không tìm thấy danh mục' });
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Tên danh mục là bắt buộc' });
    const duplicate = await db.select().from(schema.categories)
      .where(and(eq(schema.categories.tenantId, req.user.tenantId), eq(schema.categories.name, name))).get();
    if (duplicate && duplicate.id !== category.id) return res.status(409).json({ error: 'Tên danh mục đã tồn tại' });

    await db.transaction(async (tx) => {
      await tx.update(schema.categories).set({ name }).where(eq(schema.categories.id, category.id)).run();
      await tx.update(schema.products).set({ category: name }).where(and(eq(schema.products.tenantId, req.user.tenantId), eq(schema.products.category, category.name))).run();
    });
    res.json(await db.select().from(schema.categories).where(eq(schema.categories.id, category.id)).get());
  } catch (err) {
    console.error('PATCH /api/categories/:id error:', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Không thể đổi tên danh mục' });
  }
});

app.delete('/api/categories/:id', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'inventory.delete')) return;
    const category = await db.select().from(schema.categories)
      .where(and(eq(schema.categories.id, req.params.id), eq(schema.categories.tenantId, req.user.tenantId))).get();
    if (!category) return res.status(404).json({ error: 'Không tìm thấy danh mục' });
    const inUse = await db.select({ id: schema.products.id }).from(schema.products)
      .where(and(eq(schema.products.tenantId, req.user.tenantId), eq(schema.products.category, category.name))).get();
    if (inUse) return res.status(409).json({ error: 'Danh mục đang được dùng bởi sản phẩm. Hãy đổi danh mục sản phẩm trước khi xóa.' });
    await db.delete(schema.categories).where(eq(schema.categories.id, category.id)).run();
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/categories/:id error:', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Không thể xóa danh mục' });
  }
});

// ═══════════════════════════════════════════════════════════
// UNITS OF MEASURE
// ═══════════════════════════════════════════════════════════

const syncUnitCatalog = async (tenantId: string) => {
  const baseUnits = await db.select({ name: schema.products.unit }).from(schema.products)
    .where(eq(schema.products.tenantId, tenantId)).all();
  const variantUnits = await db.select({ name: schema.productUnits.name }).from(schema.productUnits)
    .where(eq(schema.productUnits.tenantId, tenantId)).all();
  const names = new Set([...baseUnits, ...variantUnits].map((row) => String(row.name || '').trim()).filter(Boolean));
  for (const name of names) {
    const exists = await db.select({ id: schema.units.id }).from(schema.units)
      .where(and(eq(schema.units.tenantId, tenantId), eq(schema.units.name, name))).get();
    if (!exists) await db.insert(schema.units).values({ id: uuid(), tenantId, name, createdAt: new Date().toISOString() }).run();
  }
};

app.get('/api/units', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'inventory.view')) return;
    syncUnitCatalog(req.user.tenantId);
    const rows = await db.select().from(schema.units).where(eq(schema.units.tenantId, req.user.tenantId)).all();
    const baseUnits = await db.select({ name: schema.products.unit }).from(schema.products)
      .where(eq(schema.products.tenantId, req.user.tenantId)).all();
    const variantUnits = await db.select({ name: schema.productUnits.name }).from(schema.productUnits)
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

app.post('/api/units', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'inventory.create')) return;
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Tên đơn vị tính là bắt buộc' });
    const duplicate = await db.select().from(schema.units)
      .where(eq(schema.units.tenantId, req.user.tenantId)).all()
      .find((row) => row.name.trim().toLowerCase() === name.toLowerCase());
    if (duplicate) return res.status(409).json({ error: 'Đơn vị tính đã tồn tại' });
    const unit = { id: uuid(), tenantId: req.user.tenantId, name, createdAt: new Date().toISOString() };
    await db.insert(schema.units).values(unit).run();
    res.status(201).json({ ...unit, inUseCount: 0 });
  } catch (err) {
    console.error('POST /api/units error:', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Không thể tạo đơn vị tính' });
  }
});

app.patch('/api/units/:id', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'inventory.update')) return;
    const unit = await db.select().from(schema.units)
      .where(and(eq(schema.units.id, req.params.id), eq(schema.units.tenantId, req.user.tenantId))).get();
    if (!unit) return res.status(404).json({ error: 'Không tìm thấy đơn vị tính' });
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Tên đơn vị tính là bắt buộc' });
    const duplicate = await db.select().from(schema.units)
      .where(eq(schema.units.tenantId, req.user.tenantId)).all()
      .find((row) => row.id !== unit.id && row.name.trim().toLowerCase() === name.toLowerCase());
    if (duplicate) return res.status(409).json({ error: 'Đơn vị tính đã tồn tại' });

    await db.transaction(async (tx) => {
      await tx.update(schema.units).set({ name }).where(eq(schema.units.id, unit.id)).run();
      await tx.update(schema.products).set({ unit: name }).where(and(eq(schema.products.tenantId, req.user.tenantId), eq(schema.products.unit, unit.name))).run();
      await tx.update(schema.productUnits).set({ name }).where(and(eq(schema.productUnits.tenantId, req.user.tenantId), eq(schema.productUnits.name, unit.name))).run();
      await tx.update(schema.priceListItems).set({ unitName: name }).where(and(eq(schema.priceListItems.tenantId, req.user.tenantId), eq(schema.priceListItems.unitName, unit.name))).run();
    });
    res.json({ ...unit, name });
  } catch (err) {
    console.error('PATCH /api/units/:id error:', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Không thể đổi tên đơn vị tính' });
  }
});

app.delete('/api/units/:id', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'inventory.delete')) return;
    const unit = await db.select().from(schema.units)
      .where(and(eq(schema.units.id, req.params.id), eq(schema.units.tenantId, req.user.tenantId))).get();
    if (!unit) return res.status(404).json({ error: 'Không tìm thấy đơn vị tính' });
    const inUse = await db.select({ id: schema.products.id }).from(schema.products)
      .where(and(eq(schema.products.tenantId, req.user.tenantId), eq(schema.products.unit, unit.name))).get()
      || await db.select({ id: schema.productUnits.id }).from(schema.productUnits)
        .where(and(eq(schema.productUnits.tenantId, req.user.tenantId), eq(schema.productUnits.name, unit.name))).get();
    if (inUse) return res.status(409).json({ error: 'Đơn vị tính đang được dùng bởi sản phẩm hoặc biến thể. Hãy đổi đơn vị trước khi xóa.' });
    await db.delete(schema.units).where(eq(schema.units.id, unit.id)).run();
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/units/:id error:', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Không thể xóa đơn vị tính' });
  }
});

// ═══════════════════════════════════════════════════════════
// PRODUCTS
// ═══════════════════════════════════════════════════════════

const ensureDefaultPriceList = async (tenantId: string) => {
  let defaultList = await db.select().from(schema.priceLists)
    .where(and(eq(schema.priceLists.tenantId, tenantId), eq(schema.priceLists.isDefault, true))).get();
  if (!defaultList) {
    const now = new Date().toISOString();
    const id = uuid();
    await db.insert(schema.priceLists).values({ id, tenantId, name: 'Bảng giá chung', customerType: 'all', isDefault: true, active: true, createdAt: now }).run();
    defaultList = await db.select().from(schema.priceLists).where(eq(schema.priceLists.id, id)).get();
  }
  if (defaultList) {
    const products = await db.select().from(schema.products).where(and(eq(schema.products.tenantId, tenantId), eq(schema.products.productType, 'standard'))).all();
    const existingItems = await db.select({ productId: schema.priceListItems.productId, unitName: schema.priceListItems.unitName })
      .from(schema.priceListItems)
      .where(eq(schema.priceListItems.priceListId, defaultList.id))
      .all();
    const existingKeys = new Set(existingItems.map((item) => `${item.productId}::${String(item.unitName).trim().toLowerCase()}`));
    const missingItems = products
      .filter((product) => !existingKeys.has(`${product.id}::${product.unit.trim().toLowerCase()}`))
      .map((product) => ({ id: uuid(), tenantId, priceListId: defaultList!.id, productId: product.id, unitName: product.unit, unitFactor: 1, price: product.sellingPrice, createdAt: new Date().toISOString() }));
    if (missingItems.length) await db.insert(schema.priceListItems).values(missingItems).run();
  }
  return defaultList;
};

type DefaultPriceLookup = Map<string, number>;

const loadDefaultPriceLookup = async (tenantId: string): Promise<DefaultPriceLookup> => {
  const defaultList = await db.select({ id: schema.priceLists.id }).from(schema.priceLists)
    .where(and(eq(schema.priceLists.tenantId, tenantId), eq(schema.priceLists.isDefault, true))).get();
  if (!defaultList) return new Map();
  const items = await db.select().from(schema.priceListItems).where(eq(schema.priceListItems.priceListId, defaultList.id)).all();
  return new Map(items.map((item) => [`${item.productId}::${item.unitName.trim().toLowerCase()}`, Number(item.price || 0)]));
};

const productUnitsFor = async (tenantId: string, product: any, defaultPrices: DefaultPriceLookup = new Map()) => {
  const extraUnits = await db.select().from(schema.productUnits)
    .where(and(eq(schema.productUnits.tenantId, tenantId), eq(schema.productUnits.productId, product.id), eq(schema.productUnits.active, true))).all();
  const priceFor = (unitName: string, fallback: number) => defaultPrices.get(`${product.id}::${unitName.trim().toLowerCase()}`) ?? fallback;
  const base = {
    id: `base-${product.id}`,
    tenantId,
    productId: product.id,
    sku: product.sku || null,
    name: product.unit,
    factor: 1,
    barcode: product.barcode || null,
    purchasePrice: Number(product.purchasePrice || 0),
    sellingPrice: priceFor(String(product.unit || ''), Number(product.sellingPrice || 0)),
    stock: Number(product.stock || 0),
    attributes: product.attributes || null,
    sourceSystem: product.sourceSystem || null,
    sourceCode: product.sourceCode || null,
    sourceRelatedCode: product.sourceRelatedCode || null,
    sourceImportedAt: product.sourceImportedAt || null,
    active: true,
  };
  return [
    base,
    ...extraUnits
      .filter((unit) => unit.name !== product.unit || Number(unit.factor) !== 1)
      .map((unit) => ({
        ...unit,
        sellingPrice: priceFor(String(unit.name || ''), Number(product.sellingPrice || 0) * Number(unit.factor || 1)),
        stock: Number(unit.factor) > 0 ? Number(product.stock || 0) / Number(unit.factor) : 0,
      })),
  ];
};

const productComponentsFor = async (tenantId: string, productId: string) => await db.select().from(schema.productComponents)
  .where(and(eq(schema.productComponents.tenantId, tenantId), eq(schema.productComponents.comboProductId, productId))).all();

const reservedBaseStock = async (tenantId: string, productId: string) => Number(await db.select({ quantity: sql<number>`coalesce(sum(${schema.stockReservations.quantity}), 0)` })
  .from(schema.stockReservations)
  .where(and(eq(schema.stockReservations.productId, productId), eq(schema.stockReservations.tenantId, tenantId), eq(schema.stockReservations.status, 'reserved')))
  .get()?.quantity || 0);

const availableForProduct = async (tenantId: string, productId: string, seen = new Set<string>()): Promise<number> => {
  if (seen.has(productId)) return 0;
  const product = await db.select().from(schema.products).where(and(eq(schema.products.id, productId), eq(schema.products.tenantId, tenantId))).get();
  if (!product) return 0;
  if (product.productType !== 'combo') return Math.max(0, Number(product.stock) - await reservedBaseStock(tenantId, productId));
  const components = await productComponentsFor(tenantId, productId);
  if (!components.length) return 0;
  const availableValues = await Promise.all(components.map(async (component) => await availableForProduct(tenantId, component.componentProductId, new Set([...seen, productId]))));
  return Math.min(...availableValues.map((available, index) => components[index].quantity > 0 ? Math.floor(available / Number(components[index].quantity)) : 0));
};

const withStockAvailability = async (tenantId: string, product: any, defaultPrices?: DefaultPriceLookup) => {
  const [units, components, reservedStock, availableStock] = await Promise.all([
    await productUnitsFor(tenantId, product, defaultPrices),
    await productComponentsFor(tenantId, product.id),
    await reservedBaseStock(tenantId, product.id),
    await availableForProduct(tenantId, product.id),
  ]);
  return { ...product, units, components, reservedStock, availableStock };
};

const withStockAvailabilityBatch = async (tenantId: string, products: any[], defaultPrices: DefaultPriceLookup) => {
  if (!products.length) return [];
  const rootProductIds = products.map((product) => product.id);
  const productById = new Map(products.map((product) => [product.id, product]));
  const componentsByProduct = new Map<string, any[]>();
  const loadedComponentCombos = new Set<string>();
  let pendingComboIds = new Set(products.filter((product) => product.productType === 'combo').map((product) => product.id));

  // Load only the component graph needed by this page. The old implementation
  // loaded every unit, combo component and reservation for the tenant on every
  // product request, which became expensive once the catalog grew large.
  for (let depth = 0; depth < 8 && pendingComboIds.size; depth += 1) {
    const comboIds = Array.from(pendingComboIds).filter((id) => !loadedComponentCombos.has(id));
    if (!comboIds.length) break;
    comboIds.forEach((id) => loadedComponentCombos.add(id));
    const componentRows = await db.select().from(schema.productComponents)
      .where(and(eq(schema.productComponents.tenantId, tenantId), inArray(schema.productComponents.comboProductId, comboIds))).all();
    const missingProductIds = new Set<string>();
    const nextComboIds = new Set<string>();
    for (const component of componentRows) {
      const rows = componentsByProduct.get(component.comboProductId) || [];
      rows.push(component);
      componentsByProduct.set(component.comboProductId, rows);
      if (!productById.has(component.componentProductId)) missingProductIds.add(component.componentProductId);
    }
    if (missingProductIds.size) {
      const relatedProducts = await db.select().from(schema.products).where(and(
        eq(schema.products.tenantId, tenantId),
        inArray(schema.products.id, Array.from(missingProductIds)),
      )).all();
      relatedProducts.forEach((product) => productById.set(product.id, product));
    }
    for (const component of componentRows) {
      if (productById.get(component.componentProductId)?.productType === 'combo') nextComboIds.add(component.componentProductId);
    }
    pendingComboIds = nextComboIds;
  }

  const activeUnits = await db.select().from(schema.productUnits)
    .where(and(
      eq(schema.productUnits.tenantId, tenantId),
      eq(schema.productUnits.active, true),
      inArray(schema.productUnits.productId, rootProductIds),
    )).all();
  const relatedProductIds = Array.from(productById.keys());
  const reservedRows = await db.select({
    productId: schema.stockReservations.productId,
    quantity: sql<number>`coalesce(sum(${schema.stockReservations.quantity}), 0)`,
  }).from(schema.stockReservations)
    .where(and(
      eq(schema.stockReservations.tenantId, tenantId),
      eq(schema.stockReservations.status, 'reserved'),
      inArray(schema.stockReservations.productId, relatedProductIds),
    ))
    .groupBy(schema.stockReservations.productId)
    .all();
  const unitsByProduct = new Map<string, any[]>();
  activeUnits.forEach((unit) => {
    const rows = unitsByProduct.get(unit.productId) || [];
    rows.push(unit);
    unitsByProduct.set(unit.productId, rows);
  });
  const reservedByProduct = new Map<string, number>(reservedRows.map((row) => [String(row.productId), Number(row.quantity || 0)]));
  const availabilityMemo = new Map<string, number>();
  const availableForBatch = (productId: string, seen = new Set<string>()): number => {
    if (seen.has(productId)) return 0;
    if (availabilityMemo.has(productId)) return availabilityMemo.get(productId) || 0;
    const product = productById.get(productId);
    if (!product) return 0;
    if (product.productType !== 'combo') {
      const result = Math.max(0, Number(product.stock || 0) - (reservedByProduct.get(productId) || 0));
      availabilityMemo.set(productId, result);
      return result;
    }
    const productComponents = componentsByProduct.get(productId) || [];
    if (!productComponents.length) return 0;
    const result = Math.min(...productComponents.map((component) => {
      const quantity = Number(component.quantity || 0);
      return quantity > 0 ? Math.floor(availableForBatch(component.componentProductId, new Set([...seen, productId])) / quantity) : 0;
    }));
    availabilityMemo.set(productId, result);
    return result;
  };

  return products.map((product) => {
    const extraUnits = (unitsByProduct.get(product.id) || []).filter((unit) => unit.name !== product.unit || Number(unit.factor) !== 1);
    const priceFor = (unitName: string, fallback: number) => defaultPrices.get(`${product.id}::${unitName.trim().toLowerCase()}`) ?? fallback;
    const baseUnit = {
      id: `base-${product.id}`,
      tenantId,
      productId: product.id,
      sku: product.sku || null,
      name: product.unit,
      factor: 1,
      barcode: product.barcode || null,
      purchasePrice: Number(product.purchasePrice || 0),
      sellingPrice: priceFor(String(product.unit || ''), Number(product.sellingPrice || 0)),
      stock: Number(product.stock || 0),
      attributes: product.attributes || null,
      sourceSystem: product.sourceSystem || null,
      sourceCode: product.sourceCode || null,
      sourceRelatedCode: product.sourceRelatedCode || null,
      sourceImportedAt: product.sourceImportedAt || null,
      active: true,
    };
    const units = [baseUnit, ...extraUnits.map((unit) => ({
      ...unit,
      sellingPrice: priceFor(String(unit.name || ''), Number(product.sellingPrice || 0) * Number(unit.factor || 1)),
      stock: Number(unit.factor) > 0 ? Number(product.stock || 0) / Number(unit.factor) : 0,
    }))];
    return {
      ...product,
      units,
      components: componentsByProduct.get(product.id) || [],
      reservedStock: reservedByProduct.get(product.id) || 0,
      availableStock: availableForBatch(product.id),
    };
  });
};

app.get('/api/price-lists', async (req, res) => {
  try {
    if (!ensureAnyPermission(req, res, ['inventory.view', 'sales.view', 'sales.create'])) return;
    const defaultList = await ensureDefaultPriceList(req.user.tenantId);
    const includeItems = String(req.query.includeItems ?? 'true') !== 'false';
    const requestedProductIds = new Set(String(req.query.productIds || '').split(',').map((value) => value.trim()).filter(Boolean));
    const lists = await db.select().from(schema.priceLists)
      .where(eq(schema.priceLists.tenantId, req.user.tenantId)).all();
    res.json(await Promise.all(lists.map(async (list) => ({
      ...list,
      items: includeItems ? await db.select().from(schema.priceListItems).where(
        requestedProductIds.size
          ? and(eq(schema.priceListItems.priceListId, list.id), inArray(schema.priceListItems.productId, Array.from(requestedProductIds)))
          : eq(schema.priceListItems.priceListId, list.id)
      ).all() : undefined,
      isDefault: Boolean(list.isDefault),
      active: Boolean(list.active),
      ensuredDefault: list.id === defaultList?.id,
    }))));
  } catch (err) {
    console.error('GET /api/price-lists error:', err);
    res.status(500).json({ error: 'Không thể tải bảng giá' });
  }
});

app.put('/api/price-lists/product-prices', async (req, res) => {
  try {
    if (!ensureAnyPermission(req, res, ['inventory.manage_pricing', 'purchases.create'])) return;
    const productId = String(req.body?.productId || '').trim();
    const requestedPrices = Array.isArray(req.body?.prices) ? req.body.prices : [];
    const product = await db.select().from(schema.products).where(and(
      eq(schema.products.id, productId),
      eq(schema.products.tenantId, req.user.tenantId),
    )).get();
    if (!product) return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });
    if (product.productType === 'combo') return res.status(400).json({ error: 'Không thiết lập giá nhập cho sản phẩm combo' });
    if (requestedPrices.length > 200) return res.status(400).json({ error: 'Số dòng giá vượt quá giới hạn cho phép' });

    const extraUnits = await db.select().from(schema.productUnits).where(and(
      eq(schema.productUnits.tenantId, req.user.tenantId),
      eq(schema.productUnits.productId, product.id),
      eq(schema.productUnits.active, true),
    )).all();
    const allowedUnits = [{ name: product.unit, factor: 1 }, ...extraUnits.map((unit) => ({ name: unit.name, factor: Number(unit.factor || 1) }))];
    const now = new Date().toISOString();
    let baseSellingPrice: number | null = null;
    const savedItems: any[] = [];

    await db.transaction(async (tx) => {
      for (const row of requestedPrices) {
        const priceListId = String(row?.priceListId || '').trim();
        const unitName = String(row?.unitName || '').trim();
        const unitFactor = Number(row?.unitFactor || 1);
        if (!priceListId || !unitName || !Number.isFinite(unitFactor) || unitFactor <= 0) throw new Error('Thông tin đơn vị hoặc bảng giá không hợp lệ');
        const list = await tx.select().from(schema.priceLists).where(and(
          eq(schema.priceLists.id, priceListId),
          eq(schema.priceLists.tenantId, req.user.tenantId),
        )).get();
        if (!list) throw new Error('Không tìm thấy bảng giá');
        const validUnit = allowedUnits.find((unit) => unit.name.trim().toLowerCase() === unitName.toLowerCase() && Math.abs(unit.factor - unitFactor) < 0.000001);
        if (!validUnit) throw new Error(`Đơn vị ${unitName} không thuộc sản phẩm`);
        const existing = await tx.select().from(schema.priceListItems).where(and(
          eq(schema.priceListItems.priceListId, list.id),
          eq(schema.priceListItems.productId, product.id),
          eq(schema.priceListItems.unitName, validUnit.name),
        )).get();
        const hasPrice = row?.price !== null && row?.price !== undefined && String(row.price).trim() !== '';
        if (!hasPrice) {
          if (existing) await tx.delete(schema.priceListItems).where(eq(schema.priceListItems.id, existing.id)).run();
          continue;
        }
        const price = Number(row.price);
        if (!Number.isFinite(price) || price < 0) throw new Error(`Giá bán của ${unitName} không hợp lệ`);
        if (existing) {
          await tx.update(schema.priceListItems).set({ unitFactor: validUnit.factor, price }).where(eq(schema.priceListItems.id, existing.id)).run();
        } else {
          await tx.insert(schema.priceListItems).values({ id: uuid(), tenantId: req.user.tenantId, priceListId: list.id, productId: product.id, unitName: validUnit.name, unitFactor: validUnit.factor, price, createdAt: now }).run();
        }
        savedItems.push({ priceListId: list.id, productId: product.id, unitName: validUnit.name, unitFactor: validUnit.factor, price });
        if (list.isDefault && validUnit.name.trim().toLowerCase() === product.unit.trim().toLowerCase() && Math.abs(validUnit.factor - 1) < 0.000001) baseSellingPrice = price;
      }
      if (baseSellingPrice !== null) await tx.update(schema.products).set({ sellingPrice: baseSellingPrice }).where(eq(schema.products.id, product.id)).run();
    });

    res.json({ product: await db.select().from(schema.products).where(eq(schema.products.id, product.id)).get(), items: savedItems });
  } catch (err) {
    console.error('PUT /api/price-lists/product-prices error:', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Không thể lưu thiết lập giá' });
  }
});

app.get('/api/price-lists/:id', async (req, res) => {
  try {
    if (!ensureAnyPermission(req, res, ['inventory.view', 'sales.view', 'sales.create'])) return;
    const list = await db.select().from(schema.priceLists).where(and(eq(schema.priceLists.id, req.params.id), eq(schema.priceLists.tenantId, req.user.tenantId))).get();
    if (!list) return res.status(404).json({ error: 'Không tìm thấy bảng giá' });
    res.json({ ...list, items: await db.select().from(schema.priceListItems).where(eq(schema.priceListItems.priceListId, list.id)).all() });
  } catch (err) {
    console.error('GET /api/price-lists/:id error:', err);
    res.status(500).json({ error: 'Không thể tải bảng giá' });
  }
});

app.post('/api/price-lists', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'inventory.manage_pricing')) return;
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Tên bảng giá là bắt buộc' });
    const now = new Date().toISOString();
    const markupMode: 'percent' | 'amount' = req.body?.markupMode === 'amount' ? 'amount' : 'percent';
    const markupValue = Number(req.body?.markupValue ?? req.body?.markupPercent) || 0;
    if (!Number.isFinite(markupValue) || (markupMode === 'percent' && markupValue < -100)) return res.status(400).json({ error: markupMode === 'percent' ? 'Tỷ lệ giá phải lớn hơn hoặc bằng -100%' : 'Số tiền điều chỉnh không hợp lệ' });
    const list = { id: uuid(), tenantId: req.user.tenantId, name, customerType: req.body?.customerType || 'all', markupPercent: markupMode === 'percent' ? markupValue : 0, markupMode, markupValue, isDefault: Boolean(req.body?.isDefault), active: req.body?.active !== false, createdAt: now };
    if (list.isDefault) await db.update(schema.priceLists).set({ isDefault: false }).where(eq(schema.priceLists.tenantId, req.user.tenantId)).run();
    await db.insert(schema.priceLists).values(list).run();
    res.status(201).json({ ...list, items: [] });
  } catch (err) {
    console.error('POST /api/price-lists error:', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Không thể tạo bảng giá' });
  }
});

app.patch('/api/price-lists/:id', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'inventory.manage_pricing')) return;
    const list = await db.select().from(schema.priceLists).where(and(eq(schema.priceLists.id, req.params.id), eq(schema.priceLists.tenantId, req.user.tenantId))).get();
    if (!list) return res.status(404).json({ error: 'Không tìm thấy bảng giá' });
    const name = req.body?.name === undefined ? list.name : String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Tên bảng giá là bắt buộc' });
    const duplicate = await db.select().from(schema.priceLists)
      .where(eq(schema.priceLists.tenantId, req.user.tenantId)).all()
      .find((row) => row.id !== list.id && row.name.trim().toLowerCase() === name.toLowerCase());
    if (duplicate) return res.status(409).json({ error: 'Tên bảng giá đã tồn tại' });
    const isDefault = req.body?.isDefault;
    const markupMode: 'percent' | 'amount' = req.body?.markupMode === undefined ? (list.markupMode === 'amount' ? 'amount' : 'percent') : req.body.markupMode === 'amount' ? 'amount' : 'percent';
    const hasMarkupValue = req.body?.markupValue !== undefined || req.body?.markupPercent !== undefined;
    const markupValue = hasMarkupValue ? Number(req.body?.markupValue ?? req.body?.markupPercent) || 0 : Number(list.markupValue ?? list.markupPercent) || 0;
    if (!Number.isFinite(markupValue) || (markupMode === 'percent' && markupValue < -100)) return res.status(400).json({ error: markupMode === 'percent' ? 'Tỷ lệ giá phải lớn hơn hoặc bằng -100%' : 'Số tiền điều chỉnh không hợp lệ' });
    const updates = {
      name,
      ...(req.body?.customerType !== undefined ? { customerType: String(req.body.customerType) } : {}),
      ...(hasMarkupValue || req.body?.markupMode !== undefined ? { markupMode, markupValue, markupPercent: markupMode === 'percent' ? markupValue : 0 } : {}),
      ...(req.body?.active !== undefined ? { active: Boolean(req.body.active) } : {}),
    };
    if (isDefault) await db.update(schema.priceLists).set({ isDefault: false }).where(eq(schema.priceLists.tenantId, req.user.tenantId)).run();
    await db.update(schema.priceLists).set({ ...updates, ...(isDefault !== undefined ? { isDefault: Boolean(isDefault) } : {}) }).where(eq(schema.priceLists.id, list.id)).run();
    res.json(await db.select().from(schema.priceLists).where(eq(schema.priceLists.id, list.id)).get());
  } catch (err) {
    console.error('PATCH /api/price-lists/:id error:', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Không thể cập nhật bảng giá' });
  }
});

app.delete('/api/price-lists/:id', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'inventory.manage_pricing')) return;
    const list = await db.select().from(schema.priceLists).where(and(eq(schema.priceLists.id, req.params.id), eq(schema.priceLists.tenantId, req.user.tenantId))).get();
    if (!list) return res.status(404).json({ error: 'Không tìm thấy bảng giá' });
    if (list.isDefault) return res.status(409).json({ error: 'Không thể xóa bảng giá mặc định' });
    await db.delete(schema.priceListItems).where(eq(schema.priceListItems.priceListId, list.id)).run();
    await db.delete(schema.priceLists).where(eq(schema.priceLists.id, list.id)).run();
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/price-lists/:id error:', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Không thể xóa bảng giá' });
  }
});

app.put('/api/price-lists/:id/items', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'inventory.manage_pricing')) return;
    const list = await db.select().from(schema.priceLists).where(and(eq(schema.priceLists.id, req.params.id), eq(schema.priceLists.tenantId, req.user.tenantId))).get();
    if (!list) return res.status(404).json({ error: 'Không tìm thấy bảng giá' });
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    await db.transaction(async (tx) => {
      await tx.delete(schema.priceListItems).where(eq(schema.priceListItems.priceListId, list.id)).run();
      for (const item of items) {
        const product = await tx.select().from(schema.products).where(and(eq(schema.products.id, item.productId), eq(schema.products.tenantId, req.user.tenantId))).get();
        const price = Number(item.price);
        const factor = Number(item.unitFactor || 1);
        if (!product || !item.unitName || !Number.isFinite(price) || price < 0 || !Number.isFinite(factor) || factor <= 0) continue;
        await tx.insert(schema.priceListItems).values({ id: uuid(), tenantId: req.user.tenantId, priceListId: list.id, productId: product.id, unitName: String(item.unitName), unitFactor: factor, price, createdAt: new Date().toISOString() }).run();
      }
    });
    res.json(await db.select().from(schema.priceListItems).where(eq(schema.priceListItems.priceListId, list.id)).all());
  } catch (err) {
    console.error('PUT /api/price-lists/:id/items error:', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Không thể lưu giá sản phẩm' });
  }
});

app.get('/api/products/lookup', async (req, res) => {
  try {
    if (!ensureAnyPermission(req, res, ['inventory.view', 'sales.view'])) return;
    const code = String(req.query.code || '').trim();
    if (!code) return res.status(400).json({ error: 'Thiếu mã cần tra cứu' });
    const normalizedCode = code.toLowerCase();
    const productMatches = await db.select().from(schema.products).where(and(
      eq(schema.products.tenantId, req.user.tenantId),
      eq(schema.products.status, 'active'),
      or(
        sql`lower(${schema.products.sku}) = ${normalizedCode}`,
        sql`lower(coalesce(${schema.products.barcode}, '')) = ${normalizedCode}`,
      ),
    )).limit(2).all();
    const unitMatches = await db.select().from(schema.productUnits).where(and(
      eq(schema.productUnits.tenantId, req.user.tenantId),
      eq(schema.productUnits.active, true),
      or(
        sql`lower(coalesce(${schema.productUnits.sku}, '')) = ${normalizedCode}`,
        sql`lower(coalesce(${schema.productUnits.barcode}, '')) = ${normalizedCode}`,
        sql`lower(coalesce(${schema.productUnits.sourceCode}, '')) = ${normalizedCode}`,
      ),
    )).limit(2).all();
    if (productMatches.length + unitMatches.length > 1) return res.status(409).json({ error: 'Mã sản phẩm đang bị trùng trong hệ thống.' });
    const product = productMatches[0] || unitMatches[0];
    if (!product) return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });
    const resolved = 'productId' in product
      ? await db.select().from(schema.products).where(and(eq(schema.products.id, product.productId), eq(schema.products.tenantId, req.user.tenantId), eq(schema.products.status, 'active'))).get()
      : product;
    if (!resolved) return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });
    res.json(redactProductForUser(req, await withStockAvailability(req.user.tenantId, resolved, await loadDefaultPriceLookup(req.user.tenantId))));
  } catch (err) {
    console.error('GET /api/products/lookup error:', err);
    res.status(500).json({ error: 'Không thể tra cứu mã sản phẩm' });
  }
});

app.get('/api/products', async (req, res) => {
  try {
    if (!ensureAnyPermission(req, res, ['inventory.view', 'sales.view'])) return;
    const { category, search, productType } = req.query;
    const requestedStatus = String(req.query.status || '').toLowerCase();
    const includeInactive = String(req.query.includeInactive || '').toLowerCase() === 'true';
    const parsedLimit = Number(req.query.limit);
    const parsedOffset = Number(req.query.offset);
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(Math.floor(parsedLimit), 500) : 100;
    const offset = Number.isFinite(parsedOffset) && parsedOffset > 0 ? Math.floor(parsedOffset) : 0;
    const filters = [eq(schema.products.tenantId, req.user.tenantId)];
    if (!includeInactive && requestedStatus !== 'all') filters.push(eq(schema.products.status, requestedStatus === 'inactive' ? 'inactive' : 'active'));
    if (category && category !== 'all') filters.push(eq(schema.products.category, String(category)));
    if (productType && productType !== 'all') filters.push(eq(schema.products.productType, productType as 'standard' | 'combo'));
    const searchValue = String(search || '').trim();
    if (searchValue) {
      const term = `%${searchValue}%`;
      filters.push(or(
        sql`lower(${schema.products.name}) LIKE lower(${term})`,
        sql`lower(${schema.products.sku}) LIKE lower(${term})`,
        sql`lower(coalesce(${schema.products.barcode}, '')) LIKE lower(${term})`,
        sql`EXISTS (SELECT 1 FROM product_units pu WHERE pu.tenant_id = ${req.user.tenantId} AND pu.product_id = ${schema.products.id} AND (lower(coalesce(pu.sku, '')) LIKE lower(${term}) OR lower(coalesce(pu.barcode, '')) LIKE lower(${term}) OR lower(coalesce(pu.source_code, '')) LIKE lower(${term})))`,
      ) as any);
    }
    const whereClause = and(...filters);
    const countRow = await db.select({ count: sql<number>`count(*)` }).from(schema.products).where(whereClause).get();
    const total = Number(countRow?.count || 0);
    const pageProducts = await db.select().from(schema.products)
      .where(whereClause)
      .orderBy(schema.products.name, schema.products.id)
      .limit(limit)
      .offset(offset)
      .all();
    const defaultPrices = await loadDefaultPriceLookup(req.user.tenantId);
    const enrichedProducts = (await withStockAvailabilityBatch(req.user.tenantId, pageProducts, defaultPrices)).map((product) => redactProductForUser(req, product));
    if (String(req.query.includeMeta || '').toLowerCase() === 'true') {
      return res.json({ items: enrichedProducts, total, offset, limit });
    }
    res.json(enrichedProducts);
  } catch (err) {
    console.error('GET /api/products error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/products/summary', async (req, res) => {
  try {
    if (!ensureAnyPermission(req, res, ['inventory.view', 'sales.view', 'dashboard.view'])) return;
    const summary = await db.select({
      total: sql<number>`count(*)`,
      totalStock: sql<number>`coalesce(sum(${schema.products.stock}), 0)`,
      stockValue: sql<number>`coalesce(sum(${schema.products.stock} * ${schema.products.purchasePrice}), 0)`,
      lowStock: sql<number>`coalesce(sum(case when ${schema.products.trackStock} = 1 and ${schema.products.stock} <= ${schema.products.lowStockThreshold} then 1 else 0 end), 0)`,
    }).from(schema.products).where(and(
      eq(schema.products.tenantId, req.user.tenantId),
      eq(schema.products.status, 'active'),
    )).get();
    res.json({
      total: Number(summary?.total || 0),
      totalStock: Number(summary?.totalStock || 0),
      stockValue: hasPermission(req, 'inventory.view_cost') ? Number(summary?.stockValue || 0) : 0,
      lowStock: Number(summary?.lowStock || 0),
    });
  } catch (err) {
    console.error('GET /api/products/summary error:', err);
    res.status(500).json({ error: 'Không thể tải tổng hợp hàng hóa' });
  }
});

app.get('/api/products/import-history', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'inventory.view')) return;
    const rows = await db.select().from(schema.productImportBatches)
      .where(eq(schema.productImportBatches.tenantId, req.user.tenantId))
      .orderBy(desc(schema.productImportBatches.createdAt))
      .limit(20)
      .all();
    res.json(rows);
  } catch (err) {
    console.error('GET /api/products/import-history error:', err);
    res.status(500).json({ error: 'Không thể tải lịch sử import.' });
  }
});

app.get('/api/products/import-history/:batchId/issues', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'inventory.view')) return;
    const batch = await db.select().from(schema.productImportBatches)
      .where(and(eq(schema.productImportBatches.id, req.params.batchId), eq(schema.productImportBatches.tenantId, req.user.tenantId))).get();
    if (!batch) return res.status(404).json({ error: 'Không tìm thấy batch import.' });
    const issues = await db.select().from(schema.productImportIssues)
      .where(and(eq(schema.productImportIssues.batchId, batch.id), eq(schema.productImportIssues.tenantId, req.user.tenantId)))
      .orderBy(schema.productImportIssues.rowNumber)
      .all();
    res.json({ batch, issues });
  } catch (err) {
    console.error('GET /api/products/import-history/:batchId/issues error:', err);
    res.status(500).json({ error: 'Không thể tải chi tiết lỗi import.' });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    if (!ensureAnyPermission(req, res, ['inventory.view', 'sales.view'])) return;
    const product = await db.select().from(schema.products)
      .where(and(eq(schema.products.id, req.params.id), eq(schema.products.tenantId, req.user.tenantId))).get();
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(redactProductForUser(req, await withStockAvailability(req.user.tenantId, product, await loadDefaultPriceLookup(req.user.tenantId))));
  } catch (err) {
    console.error('GET /api/products/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/products/:id/units', async (req, res) => {
  try {
    if (!ensureAnyPermission(req, res, ['inventory.view', 'sales.view'])) return;
    const product = await db.select().from(schema.products).where(and(eq(schema.products.id, req.params.id), eq(schema.products.tenantId, req.user.tenantId))).get();
    if (!product) return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });
    const units = await productUnitsFor(req.user.tenantId, product, await loadDefaultPriceLookup(req.user.tenantId));
    res.json(hasPermission(req, 'inventory.view_cost') ? units : units.map((unit: any) => ({ ...unit, purchasePrice: 0 })));
  } catch (err) { res.status(500).json({ error: 'Không thể tải đơn vị quy đổi' }); }
});

app.put('/api/products/:id/units', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'inventory.manage_pricing')) return;
    const product = await db.select().from(schema.products).where(and(eq(schema.products.id, req.params.id), eq(schema.products.tenantId, req.user.tenantId))).get();
    if (!product) return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });
    const units = Array.isArray(req.body?.units) ? req.body.units : [];
    await db.transaction(async (tx) => {
      const previousUnits = await tx.select().from(schema.productUnits)
        .where(and(eq(schema.productUnits.productId, product.id), eq(schema.productUnits.tenantId, req.user.tenantId))).all();
      const previousById = new Map<string, any>(previousUnits.map((unit: any) => [unit.id, unit]));
      await tx.delete(schema.productUnits).where(and(eq(schema.productUnits.productId, product.id), eq(schema.productUnits.tenantId, req.user.tenantId))).run();
      for (const unit of units) {
        const name = String(unit.name || '').trim();
        const factor = Number(unit.factor);
        if (!name || name === product.unit || !Number.isFinite(factor) || factor <= 0) continue;
        const previous: any = unit.id ? previousById.get(String(unit.id)) : undefined;
        await tx.insert(schema.productUnits).values({
          id: uuid(),
          tenantId: req.user.tenantId,
          productId: product.id,
          sku: unit.sku ? String(unit.sku).trim() : null,
          name,
          factor,
          barcode: unit.barcode ? String(unit.barcode).trim() : null,
          purchasePrice: Number.isFinite(Number(unit.purchasePrice)) ? Number(unit.purchasePrice) : 0,
          attributes: unit.attributes ? String(unit.attributes) : null,
          sourceSystem: unit.sourceSystem ? String(unit.sourceSystem) : previous?.sourceSystem || null,
          sourceCode: unit.sourceCode ? String(unit.sourceCode) : previous?.sourceCode || null,
          sourceRelatedCode: unit.sourceRelatedCode ? String(unit.sourceRelatedCode) : previous?.sourceRelatedCode || null,
          sourceImportedAt: unit.sourceImportedAt ? String(unit.sourceImportedAt) : previous?.sourceImportedAt || null,
          active: true,
          createdAt: new Date().toISOString(),
        }).run();
      }
    });
    res.json(await productUnitsFor(req.user.tenantId, product, await loadDefaultPriceLookup(req.user.tenantId)));
  } catch (err) { res.status(400).json({ error: err instanceof Error ? err.message : 'Không thể lưu đơn vị quy đổi' }); }
});

app.get('/api/products/:id/components', async (req, res) => {
  try {
    const product = await db.select().from(schema.products).where(and(eq(schema.products.id, req.params.id), eq(schema.products.tenantId, req.user.tenantId))).get();
    if (!product) return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });
    const rows = await productComponentsFor(req.user.tenantId, product.id);
    res.json(await Promise.all(rows.map(async (row) => ({ ...row, component: await db.select().from(schema.products).where(eq(schema.products.id, row.componentProductId)).get() || null }))));
  } catch (err) { res.status(500).json({ error: 'Không thể tải thành phần combo' }); }
});

app.put('/api/products/:id/components', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'inventory.manage_pricing')) return;
    const combo = await db.select().from(schema.products).where(and(eq(schema.products.id, req.params.id), eq(schema.products.tenantId, req.user.tenantId))).get();
    if (!combo) return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });
    const components = Array.isArray(req.body?.components) ? req.body.components : [];
    if (combo.productType !== 'combo' && components.length) return res.status(409).json({ error: 'Chỉ sản phẩm combo mới có thành phần' });
    const componentIds = new Set<string>();
    for (const item of components) {
      const quantity = Number(item.quantity);
      if (!item.componentProductId || item.componentProductId === combo.id || componentIds.has(item.componentProductId) || !Number.isFinite(quantity) || quantity <= 0) {
        return res.status(400).json({ error: 'Thành phần combo không hợp lệ' });
      }
      const product = await db.select().from(schema.products).where(and(eq(schema.products.id, item.componentProductId), eq(schema.products.tenantId, req.user.tenantId))).get();
      if (!product || product.productType === 'combo') return res.status(400).json({ error: 'Combo chỉ được chứa sản phẩm thường' });
      componentIds.add(item.componentProductId);
    }
    await db.transaction(async (tx) => {
      await tx.delete(schema.productComponents).where(and(eq(schema.productComponents.comboProductId, combo.id), eq(schema.productComponents.tenantId, req.user.tenantId))).run();
      for (const item of components) await tx.insert(schema.productComponents).values({ id: uuid(), tenantId: req.user.tenantId, comboProductId: combo.id, componentProductId: item.componentProductId, quantity: Number(item.quantity), createdAt: new Date().toISOString() }).run();
    });
    res.json(await productComponentsFor(req.user.tenantId, combo.id));
  } catch (err) { res.status(400).json({ error: err instanceof Error ? err.message : 'Không thể lưu thành phần combo' }); }
});

type KiotImportRow = {
  rowNumber: number;
  productType: 'standard' | 'combo';
  category: string;
  sku: string;
  barcode: string;
  name: string;
  sellingPrice: number;
  purchasePrice: number;
  stock: number;
  lowStockThreshold: number;
  maxStockThreshold: number;
  unit: string;
  baseSku: string;
  factor: number;
  attributes: string;
  relatedSku: string;
  components: string;
  active: boolean;
  invalidComponentTokens: string[];
};

type KiotImportComponentPlan = {
  code: string;
  quantity: number;
  productId?: string;
  baseSku?: string;
};

type KiotImportIssue = {
  rowNumber: number;
  code: string;
  message: string;
  sku: string;
  barcode: string;
};

type KiotImportWarning = {
  rowNumber: number;
  message: string;
  sku: string;
  code?: string;
};

const importText = (value: unknown) => String(value ?? '').trim();
const importCode = (value: unknown) => importText(value).toLowerCase();
const importNumber = (value: unknown, fallback = 0) => {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  const raw = importText(value).replace(/\s/g, '');
  if (!raw) return fallback;
  // Kiot Viet exports can contain either numeric cells or localized text such
  // as "5.884.600", "5,884,600" and decimal values such as "1,5".
  let normalized = raw;
  if (raw.includes('.') && raw.includes(',')) {
    normalized = raw.lastIndexOf(',') > raw.lastIndexOf('.')
      ? raw.replace(/\./g, '').replace(',', '.')
      : raw.replace(/,/g, '');
  } else if (/^-?\d{1,3}(?:[.,]\d{3})+$/.test(raw)) {
    normalized = raw.replace(/[.,]/g, '');
  } else if (raw.includes(',')) {
    normalized = raw.replace(',', '.');
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const importBoolean = (value: unknown, fallback = true) => {
  if (value === null || value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'y', 'có', 'co', 'active', 'đang kinh doanh', 'dang kinh doanh'].includes(importText(value).toLowerCase());
};
const parseKiotComponentMapping = (value: unknown): { components: Array<{ code: string; quantity: number }>; invalidTokens: string[] } => {
  if (Array.isArray(value)) {
    const components: Array<{ code: string; quantity: number }> = [];
    const invalidTokens: string[] = [];
    value.forEach((item) => {
      const record = (item || {}) as Record<string, unknown>;
      const code = importText(record.code || record.sku || record.barcode || record.productCode);
      const quantity = Number(importText(record.quantity).replace(',', '.'));
      if (!code || !Number.isFinite(quantity) || quantity <= 0) invalidTokens.push(code || JSON.stringify(item));
      else components.push({ code, quantity });
    });
    return { components, invalidTokens };
  }

  const raw = importText(value);
  if (!raw) return { components: [], invalidTokens: [] };
  const components: Array<{ code: string; quantity: number }> = [];
  const invalidTokens: string[] = [];
  raw.split('|').map((token) => token.trim()).filter(Boolean).forEach((token) => {
    const separator = token.lastIndexOf(':');
    if (separator <= 0) {
      invalidTokens.push(token);
      return;
    }
    const code = importText(token.slice(0, separator));
    const quantityText = importText(token.slice(separator + 1)).replace(',', '.');
    const quantity = Number(quantityText);
    if (!code || !Number.isFinite(quantity) || quantity <= 0) invalidTokens.push(token);
    else components.push({ code, quantity });
  });
  return { components, invalidTokens };
};
const importAttributeData = (value: unknown) => {
  const raw = importText(value);
  if (!raw) return null;
  const parsed: Record<string, string> = {};
  raw.split(/[;|\n]+/).forEach((part) => {
    const colonSeparator = part.indexOf(':');
    const separator = colonSeparator >= 0 ? colonSeparator : part.indexOf('=');
    if (separator < 0) return;
    const key = part.slice(0, separator).trim();
    const attributeValue = part.slice(separator + 1).trim();
    if (key && attributeValue) parsed[key] = attributeValue;
  });
  return Object.keys(parsed).length ? JSON.stringify(parsed) : null;
};

const buildKiotImportPlan = async (tenantId: string, rawRows: unknown[]) => {
  const rows: KiotImportRow[] = rawRows.map((raw, index) => {
    const value = (raw || {}) as Record<string, unknown>;
    const typeText = importText(value.productType || value.type).toLowerCase();
    const parsedComponents = parseKiotComponentMapping(value.components || value.componentMappings || value.componentMapping || value.hangThanhPhan);
    return {
      rowNumber: Number(value.rowNumber) || index + 2,
      productType: typeText.includes('combo') ? 'combo' : 'standard',
      category: importText(value.category) || 'Khác',
      sku: importText(value.sku),
      barcode: importText(value.barcode),
      name: importText(value.name),
      sellingPrice: importNumber(value.sellingPrice),
      purchasePrice: importNumber(value.purchasePrice),
      stock: importNumber(value.stock),
      lowStockThreshold: importNumber(value.lowStockThreshold),
      maxStockThreshold: importNumber(value.maxStockThreshold),
      unit: importText(value.unit) || (typeText.includes('combo') ? 'Bộ' : 'Cái'),
      baseSku: importText(value.baseSku),
      factor: importNumber(value.factor, 1),
      attributes: importText(value.attributes),
      relatedSku: importText(value.relatedSku),
      components: importText(value.components || value.componentMappings || value.componentMapping || value.hangThanhPhan),
      active: importBoolean(value.active, true),
      invalidComponentTokens: parsedComponents.invalidTokens,
    };
  });

  const issues: KiotImportIssue[] = [];
  const warnings: KiotImportWarning[] = [];
  const issueKeys = new Set<string>();
  const addIssue = (row: KiotImportRow, code: string, message: string) => {
    const key = `${row.rowNumber}:${code}`;
    if (issueKeys.has(key)) return;
    issueKeys.add(key);
    issues.push({ rowNumber: row.rowNumber, code, message, sku: row.sku, barcode: row.barcode });
  };
  const addWarning = (row: KiotImportRow, message: string, code = 'WARNING') => {
    warnings.push({ rowNumber: row.rowNumber, message, sku: row.sku, code });
  };

  const countBy = (values: string[]) => {
    const map = new Map<string, number>();
    values.filter(Boolean).forEach((value) => map.set(value, (map.get(value) || 0) + 1));
    return map;
  };
  const skuCounts = countBy(rows.map((row) => importCode(row.sku)));
  const barcodeCounts = countBy(rows.map((row) => importCode(row.barcode)));
  rows.forEach((row) => {
    if (!row.sku) addIssue(row, 'MISSING_SKU', 'Thiếu Mã hàng/SKU.');
    if (!row.name) addIssue(row, 'MISSING_NAME', 'Thiếu Tên hàng.');
    if (!Number.isFinite(row.sellingPrice)) addIssue(row, 'INVALID_SELLING_PRICE', 'Giá bán không hợp lệ.');
    if (!Number.isFinite(row.purchasePrice)) addIssue(row, 'INVALID_PURCHASE_PRICE', 'Giá vốn không hợp lệ.');
    if (!Number.isFinite(row.stock)) addIssue(row, 'INVALID_STOCK', 'Tồn kho không hợp lệ.');
    if (row.purchasePrice < 0) addWarning(row, 'Giá vốn âm được giữ nguyên theo file nguồn để đối chiếu.');
    if (row.stock < 0) addWarning(row, 'Tồn kho âm được giữ nguyên theo file nguồn để đối chiếu.');
    if (row.lowStockThreshold < 0 || row.maxStockThreshold < 0) addIssue(row, 'INVALID_STOCK_LIMIT', 'Tồn tối thiểu/tối đa không hợp lệ.');
    if (row.maxStockThreshold > 0 && row.lowStockThreshold > row.maxStockThreshold) addIssue(row, 'INVALID_STOCK_RANGE', 'Tồn tối thiểu lớn hơn tồn tối đa.');
    if (!row.unit) {
      row.unit = row.productType === 'combo' ? 'Bộ' : 'Cái';
      addWarning(row, `Thiếu ĐVT, hệ thống dùng mặc định “${row.unit}”.`);
    }
    if (row.factor <= 0 || !Number.isFinite(row.factor)) addIssue(row, 'INVALID_FACTOR', 'Quy đổi phải lớn hơn 0.');
    if (row.baseSku && row.baseSku === row.sku) addIssue(row, 'SELF_PARENT', 'Đơn vị quy đổi không được trỏ về chính nó.');
    if (row.baseSku && !row.sku) addIssue(row, 'MISSING_UNIT_SKU', 'Đơn vị quy đổi phải có Mã hàng/SKU.');
    row.invalidComponentTokens.forEach((token) => addIssue(row, 'INVALID_COMPONENT_MAPPING', `Dòng thành phần không hợp lệ: ${token}. Dùng định dạng Mã hàng:Số lượng.`));
    if (row.productType === 'combo' && !row.components && !row.invalidComponentTokens.length) {
      addWarning(row, 'Combo chưa có dòng thành phần; combo vẫn được tạo để bổ sung sau.', 'COMBO_MISSING_COMPONENTS');
    }
    if (skuCounts.get(importCode(row.sku))! > 1) addIssue(row, 'DUPLICATE_SKU_FILE', 'Mã hàng/SKU bị trùng trong file.');
    if (row.barcode && barcodeCounts.get(importCode(row.barcode))! > 1) addIssue(row, 'DUPLICATE_BARCODE_FILE', 'Mã vạch bị trùng trong file.');
  });

  const products = await db.select().from(schema.products).where(eq(schema.products.tenantId, tenantId)).all();
  const units = await db.select().from(schema.productUnits).where(eq(schema.productUnits.tenantId, tenantId)).all();
  const productsBySku = new Map<string, any[]>();
  const productsByBarcode = new Map<string, any[]>();
  const unitsBySku = new Map<string, any[]>();
  const unitsByBarcode = new Map<string, any[]>();
  const addToMap = (map: Map<string, any[]>, key: string, value: any) => {
    if (!key) return;
    const current = map.get(key) || [];
    current.push(value);
    map.set(key, current);
  };
  products.forEach((product) => {
    addToMap(productsBySku, importCode(product.sku), product);
    addToMap(productsByBarcode, importCode(product.barcode), product);
  });
  units.forEach((unit) => {
    addToMap(unitsBySku, importCode(unit.sku || unit.sourceCode), unit);
    addToMap(unitsByBarcode, importCode(unit.barcode), unit);
  });

  const baseRows = rows.filter((row) => !row.baseSku);
  const unitRows = rows.filter((row) => Boolean(row.baseSku));
  const baseBySku = new Map(baseRows.map((row) => [importCode(row.sku), row]));
  const baseRowsBySku = new Map<string, KiotImportRow[]>();
  const baseRowsByBarcode = new Map<string, KiotImportRow[]>();
  const unitRowsBySku = new Map<string, KiotImportRow[]>();
  const unitRowsByBarcode = new Map<string, KiotImportRow[]>();
  const addRowToMap = (map: Map<string, KiotImportRow[]>, key: string, row: KiotImportRow) => {
    if (!key) return;
    const current = map.get(key) || [];
    current.push(row);
    map.set(key, current);
  };
  baseRows.forEach((row) => {
    addRowToMap(baseRowsBySku, importCode(row.sku), row);
    addRowToMap(baseRowsByBarcode, importCode(row.barcode), row);
  });
  unitRows.forEach((row) => {
    addRowToMap(unitRowsBySku, importCode(row.sku), row);
    addRowToMap(unitRowsByBarcode, importCode(row.barcode), row);
  });
  const basePlans = new Map<string, { row: KiotImportRow; product: any | null; mode: 'create' | 'update'; errors: KiotImportIssue[] }>();
  const unitPlans: Array<{ row: KiotImportRow; product: any | null; unit: any | null; mode: 'create' | 'update'; errors: KiotImportIssue[] }> = [];

  for (const row of baseRows) {
    const rowIssues = issues.filter((issue) => issue.rowNumber === row.rowNumber);
    let product: any | null = null;
    if (!rowIssues.length) {
      const barcodeMatches = row.barcode ? (productsByBarcode.get(importCode(row.barcode)) || []) : [];
      const skuMatches = productsBySku.get(importCode(row.sku)) || [];
      if (barcodeMatches.length > 1) {
        addIssue(row, 'AMBIGUOUS_BARCODE', 'Barcode đang gắn với nhiều sản phẩm trong HKD Smart.');
      } else if (barcodeMatches.length === 1) {
        product = barcodeMatches[0];
        if (skuMatches.some((candidate) => candidate.id !== product.id)) addIssue(row, 'SKU_CONFLICT', 'SKU đang thuộc sản phẩm khác với sản phẩm khớp barcode.');
      } else if (skuMatches.length > 1) {
        addIssue(row, 'AMBIGUOUS_SKU', 'SKU đang gắn với nhiều sản phẩm trong HKD Smart.');
      } else if (skuMatches.length === 1) {
        product = skuMatches[0];
      }
    }
    const finalErrors = issues.filter((issue) => issue.rowNumber === row.rowNumber);
    basePlans.set(importCode(row.sku), { row, product, mode: product ? 'update' : 'create', errors: finalErrors });
  }

  for (const row of unitRows) {
    const rowIssues = issues.filter((issue) => issue.rowNumber === row.rowNumber);
    const parent = baseBySku.get(importCode(row.baseSku));
    const parentPlan = parent ? basePlans.get(importCode(parent.sku)) : undefined;
    let product: any | null = null;
    let unit: any | null = null;
    if (!parent || !parentPlan) addIssue(row, 'MISSING_PARENT', `Không tìm thấy sản phẩm cơ sở ${row.baseSku}.`);
    else if (issues.some((issue) => issue.rowNumber === parent.rowNumber)) addIssue(row, 'INVALID_PARENT', `Sản phẩm cơ sở ${row.baseSku} có lỗi và chưa thể nhận đơn vị quy đổi.`);
    else {
      product = parentPlan.product;
      if (product) {
        const matchingUnits = units.filter((candidate) => candidate.productId === product.id);
        const barcodeMatches = row.barcode ? matchingUnits.filter((candidate) => importCode(candidate.barcode) === importCode(row.barcode)) : [];
        const skuMatches = matchingUnits.filter((candidate) => importCode(candidate.sku || candidate.sourceCode) === importCode(row.sku));
        if (barcodeMatches.length > 1) addIssue(row, 'AMBIGUOUS_UNIT_BARCODE', 'Barcode đang gắn với nhiều đơn vị quy đổi của sản phẩm.');
        else if (barcodeMatches.length === 1) unit = barcodeMatches[0];
        else if (skuMatches.length > 1) addIssue(row, 'AMBIGUOUS_UNIT_SKU', 'SKU đơn vị quy đổi đang bị trùng.');
        else if (skuMatches.length === 1) unit = skuMatches[0];
        const globalProductBarcodeMatch = row.barcode ? (productsByBarcode.get(importCode(row.barcode)) || []) : [];
        const globalUnitBarcodeMatch = row.barcode ? (unitsByBarcode.get(importCode(row.barcode)) || []) : [];
        if (globalProductBarcodeMatch.some((candidate) => candidate.id !== product.id) || globalUnitBarcodeMatch.some((candidate) => candidate.productId !== product.id)) {
          addIssue(row, 'BARCODE_CONFLICT', 'Barcode đã được dùng cho sản phẩm hoặc đơn vị quy đổi khác.');
        }
      }
    }
    unitPlans.push({ row, product, unit, mode: unit ? 'update' : 'create', errors: rowIssues });
  }

  const componentPlans = new Map<string, KiotImportComponentPlan[]>();
  const uniqueRow = (map: Map<string, KiotImportRow[]>, key: string) => {
    const matches = map.get(key) || [];
    return matches.length === 1 ? matches[0] : null;
  };
  const uniqueExisting = (map: Map<string, any[]>, key: string) => {
    const matches = map.get(key) || [];
    return matches.length === 1 ? matches[0] : null;
  };

  for (const comboRow of baseRows.filter((row) => row.productType === 'combo')) {
    if (issues.some((issue) => issue.rowNumber === comboRow.rowNumber)) continue;
    const resolvedByTarget = new Map<string, KiotImportComponentPlan>();
    const sourceComponents = parseKiotComponentMapping(comboRow.components).components;
    for (const component of sourceComponents) {
      const code = importCode(component.code);
      let resolved: KiotImportComponentPlan | null = null;

      const sourceBarcodeMatches = baseRowsByBarcode.get(code) || [];
      const sourceSkuMatches = baseRowsBySku.get(code) || [];
      if (sourceBarcodeMatches.length > 1 || (!sourceBarcodeMatches.length && sourceSkuMatches.length > 1)) {
        addWarning(comboRow, `Mã thành phần ${component.code} bị trùng trong file, chưa thể mapping.`, 'COMBO_COMPONENT_AMBIGUOUS');
        continue;
      }
      const sourceBase = uniqueRow(baseRowsByBarcode, code) || uniqueRow(baseRowsBySku, code);
      if (sourceBase) {
        if (sourceBase.rowNumber === comboRow.rowNumber || sourceBase.productType === 'combo') {
          addWarning(comboRow, `Mã thành phần ${component.code} trỏ tới combo, không thể lồng combo.`, 'COMBO_COMPONENT_NESTED');
          continue;
        }
        if (issues.some((issue) => issue.rowNumber === sourceBase.rowNumber)) {
          addWarning(comboRow, `Mã thành phần ${component.code} có lỗi ở dòng nguồn nên chưa thể mapping.`, 'COMBO_COMPONENT_INVALID_SOURCE');
          continue;
        }
        resolved = { code: component.code, quantity: component.quantity, baseSku: sourceBase.sku };
      }

      if (!resolved) {
        const sourceUnitBarcodeMatches = unitRowsByBarcode.get(code) || [];
        const sourceUnitSkuMatches = unitRowsBySku.get(code) || [];
        if (sourceUnitBarcodeMatches.length > 1 || (!sourceUnitBarcodeMatches.length && sourceUnitSkuMatches.length > 1)) {
          addWarning(comboRow, `Mã thành phần ${component.code} bị trùng ở đơn vị quy đổi, chưa thể mapping.`, 'COMBO_COMPONENT_AMBIGUOUS');
          continue;
        }
        const sourceUnit = uniqueRow(unitRowsByBarcode, code) || uniqueRow(unitRowsBySku, code);
        if (sourceUnit) {
          const parent = baseBySku.get(importCode(sourceUnit.baseSku));
          if (!parent || parent.productType === 'combo') {
            addWarning(comboRow, `Không tìm thấy sản phẩm cơ sở cho đơn vị thành phần ${component.code}.`, 'COMBO_COMPONENT_PARENT_MISSING');
          } else if (issues.some((issue) => issue.rowNumber === parent.rowNumber)) {
            addWarning(comboRow, `Sản phẩm cơ sở của thành phần ${component.code} có lỗi nên chưa thể mapping.`, 'COMBO_COMPONENT_INVALID_SOURCE');
          } else {
            resolved = { code: component.code, quantity: component.quantity, baseSku: parent.sku };
          }
        }
      }

      if (!resolved) {
        const existingProductBarcodeMatches = productsByBarcode.get(code) || [];
        const existingProductSkuMatches = productsBySku.get(code) || [];
        if (existingProductBarcodeMatches.length > 1 || (!existingProductBarcodeMatches.length && existingProductSkuMatches.length > 1)) {
          addWarning(comboRow, `Mã thành phần ${component.code} đang trùng ở sản phẩm HKD Smart.`, 'COMBO_COMPONENT_AMBIGUOUS');
          continue;
        }
        const existingProduct = uniqueExisting(productsByBarcode, code) || uniqueExisting(productsBySku, code);
        if (existingProduct) {
          if (existingProduct.id === basePlans.get(importCode(comboRow.sku))?.product?.id || existingProduct.productType === 'combo') {
            addWarning(comboRow, `Mã thành phần ${component.code} trỏ tới combo, không thể lồng combo.`, 'COMBO_COMPONENT_NESTED');
          } else {
            resolved = { code: component.code, quantity: component.quantity, productId: existingProduct.id };
          }
        }
      }

      if (!resolved) {
        const existingUnitBarcodeMatches = unitsByBarcode.get(code) || [];
        const existingUnitSkuMatches = unitsBySku.get(code) || [];
        if (existingUnitBarcodeMatches.length > 1 || (!existingUnitBarcodeMatches.length && existingUnitSkuMatches.length > 1)) {
          addWarning(comboRow, `Mã thành phần ${component.code} đang trùng ở đơn vị quy đổi HKD Smart.`, 'COMBO_COMPONENT_AMBIGUOUS');
          continue;
        }
        const existingUnit = uniqueExisting(unitsByBarcode, code) || uniqueExisting(unitsBySku, code);
        if (existingUnit) resolved = { code: component.code, quantity: component.quantity, productId: existingUnit.productId };
      }

      if (!resolved) {
        addWarning(comboRow, `Không tìm thấy mã thành phần ${component.code} trong file hoặc HKD Smart.`, 'COMBO_COMPONENT_NOT_FOUND');
        continue;
      }

      const targetKey = resolved.productId ? `id:${resolved.productId}` : `sku:${importCode(resolved.baseSku)}`;
      const previous = resolvedByTarget.get(targetKey);
      if (previous) previous.quantity += resolved.quantity;
      else resolvedByTarget.set(targetKey, resolved);
    }
    componentPlans.set(importCode(comboRow.sku), [...resolvedByTarget.values()]);
  }

  const validBaseRows = baseRows.filter((row) => !issues.some((issue) => issue.rowNumber === row.rowNumber));
  const validUnitRows = unitRows.filter((row) => !issues.some((issue) => issue.rowNumber === row.rowNumber));
  const componentWarningRowNumbers = new Set(
    warnings
      .filter((warning) => String(warning.code || '').startsWith('COMBO_'))
      .map((warning) => warning.rowNumber),
  );
  const summary = {
    totalRows: rows.length,
    productRows: baseRows.length,
    unitRows: unitRows.length,
    createdCount: validBaseRows.filter((row) => basePlans.get(importCode(row.sku))?.mode === 'create').length,
    updatedCount: validBaseRows.filter((row) => basePlans.get(importCode(row.sku))?.mode === 'update').length,
    unitCount: validUnitRows.length,
    comboCount: validBaseRows.filter((row) => row.productType === 'combo').length,
    componentCount: validBaseRows
      .filter((row) => row.productType === 'combo')
      .reduce((sum, row) => sum + (componentPlans.get(importCode(row.sku)) || []).length, 0),
    comboWithComponents: validBaseRows.filter((row) => row.productType === 'combo' && (componentPlans.get(importCode(row.sku)) || []).length > 0).length,
    comboMissingComponents: validBaseRows.filter((row) => row.productType === 'combo' && ((componentPlans.get(importCode(row.sku)) || []).length === 0 || componentWarningRowNumbers.has(row.rowNumber))).length,
    componentWarningCount: warnings.filter((warning) => String(warning.code || '').startsWith('COMBO_COMPONENT') || warning.code === 'COMBO_MISSING_COMPONENTS').length,
    errorCount: issues.length,
    warningCount: warnings.length,
  };

  return { rows, baseRows, unitRows, basePlans, unitPlans, componentPlans, issues, warnings, summary };
};

const kiotImportFingerprint = (sourceSystem: string, rows: unknown[]) => crypto
  .createHash('sha256')
  .update(JSON.stringify({ sourceSystem, rows }))
  .digest('hex');

app.post('/api/products/import/preview', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'inventory.create')) return;
    const sourceSystem = importText(req.body?.sourceSystem) || 'kiot-viet';
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (sourceSystem !== 'kiot-viet') return res.status(400).json({ error: 'Nguồn import chưa được hỗ trợ.' });
    if (!rows.length) return res.status(400).json({ error: 'File chưa có dòng dữ liệu hợp lệ.' });
    const plan = await buildKiotImportPlan(req.user.tenantId, rows);
    res.json({ sourceSystem, fingerprint: kiotImportFingerprint(sourceSystem, rows), summary: plan.summary, issues: plan.issues, warnings: plan.warnings });
  } catch (err) {
    console.error('POST /api/products/import/preview error:', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Không thể kiểm tra file dữ liệu.' });
  }
});

app.post('/api/products/import', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'inventory.create')) return;
    const sourceSystem = importText(req.body?.sourceSystem) || 'kiot-viet';
    const fileName = importText(req.body?.fileName);
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (sourceSystem !== 'kiot-viet') return res.status(400).json({ error: 'Nguồn import chưa được hỗ trợ.' });
    if (!rows.length) return res.status(400).json({ error: 'File chưa có dòng dữ liệu hợp lệ.' });

    const sourceHash = kiotImportFingerprint(sourceSystem, rows);
    const previousBatch = await db.select().from(schema.productImportBatches)
      .where(and(
        eq(schema.productImportBatches.tenantId, req.user.tenantId),
        eq(schema.productImportBatches.sourceSystem, sourceSystem),
        eq(schema.productImportBatches.sourceHash, sourceHash),
        eq(schema.productImportBatches.status, 'completed'),
      )).get();
    if (previousBatch) return res.json({ batchId: previousBatch.id, summary: previousBatch, idempotent: true, issues: [] });

    const plan = await buildKiotImportPlan(req.user.tenantId, rows);
    if (!plan.summary.createdCount && !plan.summary.updatedCount) return res.status(400).json({ error: 'Không có sản phẩm hợp lệ để import.', summary: plan.summary, issues: plan.issues, warnings: plan.warnings });

    const now = new Date().toISOString();
    const batchId = uuid();
    const userId = req.user.id;
    const defaultList = await ensureDefaultPriceList(req.user.tenantId);
    if (!defaultList) return res.status(500).json({ error: 'Không thể tạo bảng giá chung.' });

    const result = await db.transaction(async (tx) => {
      const batch = {
        id: batchId,
        tenantId: req.user.tenantId,
        sourceSystem,
        fileName,
        sourceHash,
        status: 'completed',
        totalRows: plan.summary.totalRows,
        productRows: plan.summary.productRows,
        unitRows: plan.summary.unitRows,
        createdCount: plan.summary.createdCount,
        updatedCount: plan.summary.updatedCount,
        unitCount: plan.summary.unitCount,
        comboCount: plan.summary.comboCount,
        componentCount: plan.summary.componentCount,
        comboWithComponents: plan.summary.comboWithComponents,
        comboMissingComponents: plan.summary.comboMissingComponents,
        componentWarningCount: plan.summary.componentWarningCount,
        errorCount: plan.summary.errorCount,
        createdBy: userId,
        createdAt: now,
        completedAt: now,
      };
      await tx.insert(schema.productImportBatches).values(batch).run();

      const categoryNames = new Set(plan.baseRows.filter((row) => !plan.issues.some((issue) => issue.rowNumber === row.rowNumber)).map((row) => row.category));
      const existingCategories = await tx.select().from(schema.categories).where(eq(schema.categories.tenantId, req.user.tenantId)).all();
      const categoryByName = new Map(existingCategories.map((category) => [category.name.trim().toLowerCase(), category]));
      for (const name of categoryNames) {
        if (categoryByName.has(name.trim().toLowerCase())) continue;
        const category = { id: uuid(), tenantId: req.user.tenantId, name, description: 'Import dữ liệu' };
        await tx.insert(schema.categories).values(category).run();
        categoryByName.set(name.trim().toLowerCase(), category);
      }

      const unitNames = new Set([...plan.baseRows, ...plan.unitRows]
        .filter((row) => !plan.issues.some((issue) => issue.rowNumber === row.rowNumber))
        .map((row) => row.unit.trim())
        .filter(Boolean));
      const existingUnits = await tx.select().from(schema.units).where(eq(schema.units.tenantId, req.user.tenantId)).all();
      const unitByName = new Set(existingUnits.map((unit) => unit.name.trim().toLowerCase()));
      for (const name of unitNames) {
        if (unitByName.has(name.toLowerCase())) continue;
        await tx.insert(schema.units).values({ id: uuid(), tenantId: req.user.tenantId, name, createdAt: now }).run();
        unitByName.add(name.toLowerCase());
      }

      const importedProducts = new Map<string, any>();
      const saveDefaultPrice = async (productId: string, unitName: string, factor: number, price: number) => {
        await tx.delete(schema.priceListItems).where(and(
          eq(schema.priceListItems.priceListId, defaultList.id),
          eq(schema.priceListItems.productId, productId),
          eq(schema.priceListItems.unitName, unitName),
        )).run();
        await tx.insert(schema.priceListItems).values({
          id: uuid(),
          tenantId: req.user.tenantId,
          priceListId: defaultList.id,
          productId,
          unitName,
          unitFactor: factor,
          price,
          createdAt: now,
        }).run();
      };

      for (const row of plan.baseRows) {
        if (plan.issues.some((issue) => issue.rowNumber === row.rowNumber)) continue;
        const basePlan = plan.basePlans.get(importCode(row.sku));
        if (!basePlan) continue;
        const beforeStock = basePlan.product ? Number(basePlan.product.stock || 0) : 0;
        const productId = basePlan.product?.id || uuid();
        const values = {
          tenantId: req.user.tenantId,
          sku: row.sku,
          name: row.name,
          category: row.category,
          unit: row.unit,
          purchasePrice: row.purchasePrice,
          sellingPrice: row.sellingPrice,
          taxRate: Number(basePlan.product?.taxRate || 0),
          stock: row.stock,
          trackStock: true,
          lowStockThreshold: row.lowStockThreshold,
          maxStockThreshold: row.maxStockThreshold,
          status: row.active ? 'active' as const : 'inactive' as const,
          barcode: row.barcode || null,
          productType: row.productType,
          attributes: row.attributes || null,
          attributesJson: importAttributeData(row.attributes),
          sourceSystem,
          sourceCode: row.sku,
          sourceRelatedCode: row.relatedSku || null,
          sourceImportedAt: now,
        };
        if (basePlan.product) await tx.update(schema.products).set(values).where(eq(schema.products.id, productId)).run();
        else await tx.insert(schema.products).values({ id: productId, ...values }).run();
        const afterStock = row.stock;
        if (Math.abs(afterStock - beforeStock) > 0.000001) {
          await tx.insert(schema.stockMovements).values({
            id: uuid(),
            tenantId: req.user.tenantId,
            productId,
            type: 'adjust',
            quantity: Math.abs(afterStock - beforeStock),
            beforeStock,
            afterStock,
            note: `Nhập tồn đầu kỳ từ file import${fileName ? ` · ${fileName}` : ''}`,
            referenceId: batchId,
            createdAt: now,
            createdBy: userId,
          }).run();
        }
        await saveDefaultPrice(productId, row.unit, 1, row.sellingPrice);
        importedProducts.set(importCode(row.sku), await tx.select().from(schema.products).where(eq(schema.products.id, productId)).get());
      }

      for (const planRow of plan.unitPlans) {
        const row = planRow.row;
        if (plan.issues.some((issue) => issue.rowNumber === row.rowNumber)) continue;
        const parent = importedProducts.get(importCode(row.baseSku));
        if (!parent) continue;
        const unitId = planRow.unit?.id || uuid();
        const values = {
          tenantId: req.user.tenantId,
          productId: parent.id,
          sku: row.sku,
          name: row.unit,
          factor: row.factor,
          barcode: row.barcode || null,
          purchasePrice: row.purchasePrice,
          attributes: row.attributes || null,
          sourceSystem,
          sourceCode: row.sku,
          sourceRelatedCode: row.relatedSku || null,
          sourceImportedAt: now,
          active: true,
        };
        if (planRow.unit) await tx.update(schema.productUnits).set(values).where(eq(schema.productUnits.id, unitId)).run();
        else await tx.insert(schema.productUnits).values({ id: unitId, ...values, createdAt: now }).run();
        await saveDefaultPrice(parent.id, row.unit, row.factor, row.sellingPrice);
      }

      for (const comboRow of plan.baseRows.filter((row) => row.productType === 'combo')) {
        if (plan.issues.some((issue) => issue.rowNumber === comboRow.rowNumber)) continue;
        const combo = importedProducts.get(importCode(comboRow.sku));
        if (!combo) continue;
        await tx.delete(schema.productComponents).where(and(
          eq(schema.productComponents.comboProductId, combo.id),
          eq(schema.productComponents.tenantId, req.user.tenantId),
        )).run();
        for (const componentPlan of plan.componentPlans.get(importCode(comboRow.sku)) || []) {
          const component = componentPlan.productId
            ? await tx.select().from(schema.products).where(and(eq(schema.products.id, componentPlan.productId), eq(schema.products.tenantId, req.user.tenantId))).get()
            : importedProducts.get(importCode(componentPlan.baseSku));
          if (!component || component.productType === 'combo' || component.id === combo.id) continue;
          await tx.insert(schema.productComponents).values({
            id: uuid(),
            tenantId: req.user.tenantId,
            comboProductId: combo.id,
            componentProductId: component.id,
            quantity: componentPlan.quantity,
            createdAt: now,
          }).run();
        }
      }

      for (const issue of plan.issues) {
        await tx.insert(schema.productImportIssues).values({
          id: uuid(),
          batchId,
          tenantId: req.user.tenantId,
          rowNumber: issue.rowNumber,
          code: issue.code,
          message: issue.message,
          sku: issue.sku,
          barcode: issue.barcode,
          createdAt: now,
        }).run();
      }
      return batch;
    });

    res.json({ batchId, summary: result, issues: plan.issues, warnings: plan.warnings });
  } catch (err) {
    console.error('POST /api/products/import error:', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Không thể import file dữ liệu.' });
  }
});

app.post('/api/products', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'inventory.create')) return;
    const fields = pickProductFields(req.body);
    if (!fields.name || !fields.sku || !fields.category || !fields.unit) return res.status(400).json({ error: 'Tên, SKU, danh mục và đơn vị tính là bắt buộc.' });
    const nullableText = (value: unknown) => value === undefined || value === null || String(value).trim() === '' ? null : String(value).trim();
    const product = {
      id: uuid(),
      tenantId: req.user.tenantId,
      sku: String(fields.sku),
      name: String(fields.name),
      category: String(fields.category),
      unit: String(fields.unit),
      purchasePrice: Number(fields.purchasePrice ?? 0),
      sellingPrice: Number(fields.sellingPrice ?? 0),
      taxRate: Number(fields.taxRate ?? 0),
      stock: Number(fields.stock ?? 0),
      trackStock: fields.trackStock !== false,
      lowStockThreshold: Number(fields.lowStockThreshold ?? 10),
      maxStockThreshold: Number(fields.maxStockThreshold ?? 0),
      status: fields.status === 'inactive' ? 'inactive' as const : 'active' as const,
      productType: fields.productType === 'combo' ? 'combo' as const : 'standard' as const,
      barcode: nullableText(fields.barcode),
      imageUrl: nullableText(fields.imageUrl),
      attributes: nullableText(fields.attributes),
      attributesJson: nullableText(fields.attributesJson),
      sourceSystem: nullableText(fields.sourceSystem),
      sourceCode: nullableText(fields.sourceCode),
      sourceRelatedCode: nullableText(fields.sourceRelatedCode),
      sourceImportedAt: nullableText(fields.sourceImportedAt),
    };
    await db.insert(schema.products).values(product).run();
    res.status(201).json(product);
  } catch (err) {
    console.error('POST /api/products error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.patch('/api/products/:id', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'inventory.update')) return;
    const product = await db.select().from(schema.products)
      .where(and(eq(schema.products.id, req.params.id), eq(schema.products.tenantId, req.user.tenantId))).get();
    if (!product) return res.status(404).json({ error: 'Product not found' });
    const updates = pickProductFields(req.body);
    delete updates.stock;
    delete updates.tenantId;
    if (!Object.keys(updates).length) return res.status(400).json({ error: 'Không có trường hợp lệ để cập nhật.' });
    await db.update(schema.products).set(updates).where(eq(schema.products.id, req.params.id)).run();
    const updated = await db.select().from(schema.products).where(eq(schema.products.id, req.params.id)).get();
    if (!updated) return res.status(404).json({ error: 'Product not found' });
    res.json(updated);
  } catch (err) {
    console.error('PATCH /api/products/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'inventory.delete')) return;
    const product = await db.select().from(schema.products)
      .where(and(eq(schema.products.id, req.params.id), eq(schema.products.tenantId, req.user.tenantId))).get();
    if (!product) return res.status(404).json({ error: 'Product not found' });
    // Products referenced by invoices, stock cards, price lists, or combos
    // must remain available for historical reporting. Mark them inactive so
    // they disappear from the active catalog without breaking those records.
    await db.update(schema.products)
      .set({ status: 'inactive' })
      .where(and(eq(schema.products.id, req.params.id), eq(schema.products.tenantId, req.user.tenantId)))
      .run();
    res.json({ success: true, archived: true });
  } catch (err) {
    console.error('DELETE /api/products/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Stock adjustment endpoint
app.post('/api/products/:id/stock', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'inventory.adjust')) return;
    const { quantity, type, note } = req.body; // type: 'decrease' | 'increase'
    const product = await db.select().from(schema.products)
      .where(and(eq(schema.products.id, req.params.id), eq(schema.products.tenantId, req.user.tenantId))).get();
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const qty = Number(quantity) || 0;
    if (qty <= 0) return res.status(400).json({ error: 'Quantity must be greater than 0' });

    const beforeStock = product.stock;
    const newStock = type === 'decrease'
      ? product.stock - qty
      : product.stock + qty;
    const afterStock = Math.max(0, newStock);

    await db.transaction(async (tx) => {
      await tx.update(schema.products)
        .set({ stock: afterStock })
        .where(and(eq(schema.products.id, req.params.id), eq(schema.products.tenantId, req.user.tenantId)))
        .run();
      await tx.insert(schema.stockMovements).values({
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
    });

    const updated = await db.select().from(schema.products).where(eq(schema.products.id, req.params.id)).get();
    res.json(updated);
  } catch (err) {
    console.error('POST /api/products/:id/stock error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════
// SUPPLIERS / PURCHASES
// ═══════════════════════════════════════════════════════════

const unitForProduct = async (tenantId: string, product: any, unitName?: string, requestedFactor?: number) => {
  const units = await productUnitsFor(tenantId, product);
  const match = units.find((unit) => unit.name === unitName);
  if (match) return { name: match.name, factor: Number(match.factor) || 1 };
  const factor = Number(requestedFactor);
  return { name: unitName || product.unit, factor: Number.isFinite(factor) && factor > 0 ? factor : 1 };
};

const expandStockRequirements = async (tenantId: string, productId: string, baseQuantity: number, seen = new Set<string>()): Promise<Array<{ productId: string; quantity: number }>> => {
  if (seen.has(productId)) throw new Error('Combo chứa vòng lặp thành phần');
  const product = await db.select().from(schema.products).where(and(eq(schema.products.id, productId), eq(schema.products.tenantId, tenantId))).get();
  if (!product) throw new Error(`Không tìm thấy sản phẩm: ${productId}`);
  if (product.productType !== 'combo') return [{ productId, quantity: baseQuantity }];
  const components = await productComponentsFor(tenantId, productId);
  if (!components.length) throw new Error(`Combo ${product.name} chưa có thành phần`);
  const nested = await Promise.all(components.map(async (component) => await expandStockRequirements(tenantId, component.componentProductId, baseQuantity * Number(component.quantity), new Set([...seen, productId]))));
  return nested.flat();
};

const supplierCreditBalance = async (tenantId: string, supplierId: string) => {
  const rows = await db.select().from(schema.supplierCreditLedger)
    .where(and(eq(schema.supplierCreditLedger.tenantId, tenantId), eq(schema.supplierCreditLedger.supplierId, supplierId))).all();
  return rows.reduce((sum, row) => sum + (row.type === 'increase' ? Number(row.amount) : -Number(row.amount)), 0);
};

const defaultAccountForPayment = async (tenantId: string, paymentMethod: string) => {
  const type = paymentMethod === 'transfer' ? 'bank' : paymentMethod === 'wallet' ? 'wallet' : 'cash';
  const existing = await db.select().from(schema.cashAccounts).where(and(eq(schema.cashAccounts.tenantId, tenantId), eq(schema.cashAccounts.type, type), eq(schema.cashAccounts.active, 1))).get();
  if (existing) return existing.id;
  const defaults: Record<string, string> = { cash: 'Tiền mặt', bank: 'Chuyển khoản ngân hàng', wallet: 'Ví điện tử' };
  await db.insert(schema.cashAccounts).values({
    id: uuid(), tenantId, name: defaults[type] || 'Tài khoản tiền', type, active: 1, createdAt: new Date().toISOString(),
  }).run();
  return await db.select().from(schema.cashAccounts).where(and(eq(schema.cashAccounts.tenantId, tenantId), eq(schema.cashAccounts.type, type), eq(schema.cashAccounts.active, 1))).get()?.id || null;
};

const paymentAccountType = (paymentMethod: string) => (
  paymentMethod === 'transfer' ? 'bank' : paymentMethod === 'wallet' ? 'wallet' : 'cash'
);

const resolvePaymentAccount = async (tenantId: string, paymentMethod: string, accountId?: string | null) => {
  if (paymentMethod === 'debt') return null;
  const expectedType = paymentAccountType(paymentMethod);
  if (accountId) {
    const account = await db.select().from(schema.cashAccounts).where(and(
      eq(schema.cashAccounts.id, accountId),
      eq(schema.cashAccounts.tenantId, tenantId),
      eq(schema.cashAccounts.active, 1),
    )).get();
    if (account?.type === expectedType) return account.id;
  }
  return await defaultAccountForPayment(tenantId, paymentMethod);
};

const backfillSalesCashbookAccounts = async () => {
  const entries = await db.select().from(schema.cashbookEntries).where(eq(schema.cashbookEntries.category, 'Bán hàng')).all();
  for (const entry of entries) {
    if (entry.accountId || !entry.referenceId) continue;
    const invoice = await db.select().from(schema.invoices).where(and(
      eq(schema.invoices.id, entry.referenceId),
      eq(schema.invoices.tenantId, entry.tenantId),
    )).get();
    if (!invoice || invoice.paymentMethod === 'debt') continue;
    const accountId = await resolvePaymentAccount(entry.tenantId, invoice.paymentMethod, invoice.accountId);
    if (accountId) await db.update(schema.cashbookEntries).set({ accountId }).where(eq(schema.cashbookEntries.id, entry.id)).run();
  }
};

backfillSalesCashbookAccounts();
app.get('/api/cashbook/participants', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'cashbook.create')) return;
    const [users, customers, suppliers] = await Promise.all([
      db.select({ id: schema.users.id, name: schema.users.name, email: schema.users.email, role: schema.users.role })
        .from(schema.users)
        .where(and(eq(schema.users.tenantId, req.user.tenantId), eq(schema.users.status, 'active')))
        .orderBy(schema.users.name)
        .all(),
      db.select({ id: schema.customers.id, code: schema.customers.code, name: schema.customers.name, phone: schema.customers.phone })
        .from(schema.customers)
        .where(and(eq(schema.customers.tenantId, req.user.tenantId), eq(schema.customers.active, true)))
        .orderBy(schema.customers.name)
        .limit(5000)
        .all(),
      db.select({ id: schema.suppliers.id, code: schema.suppliers.code, name: schema.suppliers.name, phone: schema.suppliers.phone })
        .from(schema.suppliers)
        .where(and(eq(schema.suppliers.tenantId, req.user.tenantId), eq(schema.suppliers.active, true)))
        .orderBy(schema.suppliers.name)
        .limit(5000)
        .all(),
    ]);
    res.json({ users, customers, suppliers });
  } catch (err) {
    console.error('GET /api/cashbook/participants error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/cashbook/categories', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'cashbook.create')) return;
    const type = String(req.query.type || '');
    if (!['income', 'expense'].includes(type)) return res.status(400).json({ error: 'Loại giao dịch không hợp lệ' });
    const search = normalizeSearchText(req.query.search);
    const rows = await db.select().from(schema.cashbookCategories)
      .where(and(
        eq(schema.cashbookCategories.tenantId, req.user.tenantId),
        eq(schema.cashbookCategories.type, type as 'income' | 'expense'),
        eq(schema.cashbookCategories.active, true),
      ))
      .orderBy(asc(schema.cashbookCategories.name))
      .all();
    res.json(search
      ? rows.filter((row: any) => normalizeSearchText(row.name).includes(search))
      : rows);
  } catch (err) {
    console.error('GET /api/cashbook/categories error:', err);
    res.status(500).json({ error: 'Không thể tải danh sách loại thu chi' });
  }
});

app.post('/api/cashbook/categories', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'cashbook.create')) return;
    const type = String(req.body?.type || '');
    const name = String(req.body?.name || '').replace(/\s+/g, ' ').trim();
    if (!['income', 'expense'].includes(type)) return res.status(400).json({ error: 'Loại giao dịch không hợp lệ' });
    if (!name) return res.status(400).json({ error: 'Tên loại thu chi là bắt buộc' });
    if (name.length > 120) return res.status(400).json({ error: 'Tên loại thu chi tối đa 120 ký tự' });
    const existing = await db.select().from(schema.cashbookCategories)
      .where(and(
        eq(schema.cashbookCategories.tenantId, req.user.tenantId),
        eq(schema.cashbookCategories.type, type as 'income' | 'expense'),
        eq(schema.cashbookCategories.active, true),
      )).all();
    if (existing.some((row: any) => normalizeSearchText(row.name) === normalizeSearchText(name))) {
      return res.status(409).json({ error: 'Loại thu chi đã tồn tại' });
    }
    const category = {
      id: uuid(),
      tenantId: req.user.tenantId,
      type: type as 'income' | 'expense',
      name,
      active: true,
      createdAt: new Date().toISOString(),
      createdBy: req.user.id,
    };
    await db.insert(schema.cashbookCategories).values(category).run();
    res.status(201).json(category);
  } catch (err) {
    console.error('POST /api/cashbook/categories error:', err);
    res.status(500).json({ error: 'Không thể tạo loại thu chi' });
  }
});

type PartnerImportEntity = 'customer' | 'supplier' | 'customer_debt' | 'supplier_debt';

const normalizeImportHeader = (value: unknown) => normalizeSearchText(value).replace(/[^a-z0-9]/g, '');
const importValue = (row: Record<string, unknown>, labels: string[]) => {
  const entries = Object.entries(row || {}).map(([key, value]) => [normalizeImportHeader(key), value] as const);
  for (const label of labels) {
    const key = normalizeImportHeader(label);
    const found = entries.find(([candidate]) => candidate === key || candidate.includes(key) || key.includes(candidate));
    if (found && found[1] !== undefined && found[1] !== null && String(found[1]).trim() !== '') return found[1];
  }
  return '';
};

const importDate = (value: unknown, fallback = new Date().toISOString()) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  const raw = importText(value);
  if (!raw) return fallback;
  const match = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (match) {
    const [, day, month, year, hour = '00', minute = '00', second = '00'] = match;
    const date = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute}:${second}+07:00`);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
};

const sourceStatus = (value: unknown) => ['0', 'false', 'inactive', 'ngung'].includes(normalizeSearchText(value)) ? 'inactive' : 'active';
const partnerImportHash = (sourceSystem: string, entityType: PartnerImportEntity, rows: unknown[], meta?: unknown) => crypto.createHash('sha256').update(JSON.stringify({ sourceSystem, entityType, rows, meta: meta || null })).digest('hex');

const normalizeCustomerImportRow = (row: Record<string, unknown>) => ({
  code: importText(importValue(row, ['Mã khách hàng'])),
  name: importText(importValue(row, ['Tên khách hàng'])),
  phone: importText(importValue(row, ['Điện thoại'])),
  address: importText(importValue(row, ['Địa chỉ'])),
  taxCode: importText(importValue(row, ['MST (xuất HĐ)', 'Mã số thuế'])),
  customerTypeRaw: importText(importValue(row, ['Loại khách'])),
  sourceBranch: importText(importValue(row, ['Chi nhánh tạo'])),
  deliveryArea: importText(importValue(row, ['Khu vực giao hàng'])),
  ward: importText(importValue(row, ['Phường/Xã'])),
  birthDate: importText(importValue(row, ['Ngày sinh'])),
  gender: importText(importValue(row, ['Giới tính'])),
  email: importText(importValue(row, ['Email'])),
  facebook: importText(importValue(row, ['Facebook'])),
  groupName: importText(importValue(row, ['Nhóm khách hàng'])),
  note: importText(importValue(row, ['Ghi chú'])),
  buyerName: importText(importValue(row, ['Tên người mua (xuất HĐ)'])),
  companyName: importText(importValue(row, ['Tên công ty (xuất HĐ)'])),
  invoiceAddress: importText(importValue(row, ['Địa chỉ chi tiết (xuất HĐ)'])),
  invoiceProvince: importText(importValue(row, ['Tỉnh/Thành phố (xuất HĐ)'])),
  invoiceWard: importText(importValue(row, ['Phường/Xã (xuất HĐ)'])),
  invoiceCitizenId: importText(importValue(row, ['Số CCCD/CMND (xuất HĐ)'])),
  invoicePassportNumber: importText(importValue(row, ['Số hộ chiếu (xuất HĐ)'])),
  invoiceGovernmentId: importText(importValue(row, ['MSĐVCQHVNS (xuất HĐ)'])),
  invoiceEmail: importText(importValue(row, ['Email (xuất HĐ)'])),
  invoicePhone: importText(importValue(row, ['SĐT (xuất HĐ)'])),
  bankName: importText(importValue(row, ['Ngân hàng (xuất HĐ)'])),
  bankAccount: importText(importValue(row, ['Số TK ngân hàng (xuất HĐ)'])),
  sourceCreatedBy: importText(importValue(row, ['Người tạo'])),
  sourceCreatedAt: importText(importValue(row, ['Ngày tạo'])),
  lastTransactionAt: importText(importValue(row, ['Ngày giao dịch cuối'])),
  totalDebt: importNumber(importValue(row, ['Nợ cần thu hiện tại'])),
  totalSales: importNumber(importValue(row, ['Tổng bán'])),
  totalSalesAfterReturns: importNumber(importValue(row, ['Tổng bán trừ trả hàng'])),
  sourceStatus: sourceStatus(importValue(row, ['Trạng thái'])),
  raw: row,
});

const normalizeSupplierImportRow = (row: Record<string, unknown>) => ({
  code: importText(importValue(row, ['Mã nhà cung cấp'])),
  name: importText(importValue(row, ['Tên nhà cung cấp'])),
  email: importText(importValue(row, ['Email'])),
  phone: importText(importValue(row, ['Điện thoại'])),
  address: importText(importValue(row, ['Địa chỉ'])),
  region: importText(importValue(row, ['Khu vực'])),
  ward: importText(importValue(row, ['Phường/Xã'])),
  totalPurchases: importNumber(importValue(row, ['Tổng mua'])),
  currentPayable: importNumber(importValue(row, ['Nợ cần trả hiện tại'])),
  taxCode: importText(importValue(row, ['Mã số thuế'])),
  idNumber: importText(importValue(row, ['Số CMND/CCCD'])),
  note: importText(importValue(row, ['Ghi chú'])),
  groupName: importText(importValue(row, ['Nhóm nhà cung cấp'])),
  sourceStatus: sourceStatus(importValue(row, ['Trạng thái'])),
  totalPurchasesAfterReturns: importNumber(importValue(row, ['Tổng mua trừ trả hàng'])),
  companyName: importText(importValue(row, ['Công ty'])),
  sourceCreatedBy: importText(importValue(row, ['Người tạo'])),
  sourceCreatedAt: importText(importValue(row, ['Ngày tạo'])),
  raw: row,
});

const normalizeDebtImportRows = (rows: Record<string, unknown>[], entityType: PartnerImportEntity) => {
  const documents: Array<any> = [];
  let current: any = null;
  rows.forEach((row, index) => {
    const occurredAt = importValue(row, ['Thời gian']);
    const documentNo = importText(importValue(row, ['Mã']));
    const description = importText(importValue(row, ['Diễn giải']));
    if (occurredAt && documentNo) {
      current = {
        documentNo,
        occurredAt: importDate(occurredAt),
        description,
        amount: importNumber(importValue(row, ['Thành tiền', 'Giá trị'])),
        debit: importNumber(importValue(row, ['Ghi nợ'])),
        credit: importNumber(importValue(row, ['Ghi có'])),
        note: '',
        sourceRowNumber: index + 2,
        raw: row,
        details: [],
      };
      documents.push(current);
      return;
    }
    if (!current) return;
    const unit = importText(importValue(row, ['ĐVT']));
    const quantity = importNumber(importValue(row, ['SL']));
    const unitPrice = importNumber(importValue(row, ['Đơn giá']));
    const amount = importNumber(importValue(row, ['Thành tiền', 'Giá trị']));
    if (documentNo || unit || quantity || unitPrice || amount) {
      current.details.push({ code: documentNo, description, unit, quantity, unitPrice, amount, discount: importNumber(importValue(row, ['Giảm giá'])), vat: importNumber(importValue(row, ['VAT'])), purchasePrice: importNumber(importValue(row, ['Giá nhập/trả'])), raw: row });
    } else {
      const note = importText(importValue(row, ['Diễn giải'])) || Object.values(row).map(importText).filter(Boolean).join(' · ');
      if (note) current.note = [current.note, note].filter(Boolean).join('\n');
    }
  });
  return documents.map((document) => ({ ...document, entityType, detailsJson: JSON.stringify(document.details) }));
};

const partnerImportPreview = async (req: Request, res: Response) => {
  try {
    if (!ensurePermission(req, res, 'partners.create')) return;
    const sourceSystem = importText(req.body?.sourceSystem || 'kiot-viet').toLowerCase();
    const entityType = req.body?.entityType as PartnerImportEntity;
    const rows = Array.isArray(req.body?.rows) ? req.body.rows as Record<string, unknown>[] : [];
    if (!['customer', 'supplier', 'customer_debt', 'supplier_debt'].includes(entityType) || !rows.length) return res.status(400).json({ error: 'Thiếu loại dữ liệu hoặc danh sách dòng import.' });
    if (rows.length > 20000) return res.status(413).json({ error: 'File vượt quá 20.000 dòng cho một lần import.' });
    const sourceHash = partnerImportHash(sourceSystem, entityType, rows, req.body?.meta);
    const issues: Array<{ rowNumber: number; code: string; message: string; sourceCode: string; sourceName: string }> = [];
    let normalizedRows: any[] = [];
    let stats = { totalRows: rows.length, createdCount: 0, updatedCount: 0, debtAdjustedCount: 0, detailCount: 0, errorCount: 0 };
    if (entityType === 'customer' || entityType === 'supplier') {
      normalizedRows = rows.map((row) => entityType === 'customer' ? normalizeCustomerImportRow(row) : normalizeSupplierImportRow(row));
      const existingRows = entityType === 'customer'
        ? await db.select({ id: schema.customers.id, code: schema.customers.code, totalDebt: schema.customers.totalDebt }).from(schema.customers).where(eq(schema.customers.tenantId, req.user.tenantId)).all()
        : await db.select({ id: schema.suppliers.id, code: schema.suppliers.code, currentPayable: schema.suppliers.currentPayable }).from(schema.suppliers).where(eq(schema.suppliers.tenantId, req.user.tenantId)).all();
      const existingByCode = new Map(existingRows.map((row: any) => [normalizeSearchText(row.code), row]));
      const seen = new Set<string>();
      normalizedRows.forEach((row, index) => {
        if (!row.code) issues.push({ rowNumber: index + 2, code: 'MISSING_CODE', message: 'Thiếu mã đối tác.', sourceCode: '', sourceName: row.name });
        if (!row.name) issues.push({ rowNumber: index + 2, code: 'MISSING_NAME', message: 'Thiếu tên đối tác.', sourceCode: row.code, sourceName: '' });
        if (row.code && seen.has(normalizeSearchText(row.code))) issues.push({ rowNumber: index + 2, code: 'DUPLICATE_SOURCE_CODE', message: 'Mã đối tác bị trùng trong file.', sourceCode: row.code, sourceName: row.name });
        if (row.code) seen.add(normalizeSearchText(row.code));
        const existing: any = row.code ? existingByCode.get(normalizeSearchText(row.code)) : null;
        if (existing) {
          stats.updatedCount += 1;
          const importedBalance = entityType === 'customer' ? row.totalDebt : row.currentPayable;
          const currentBalance = entityType === 'customer' ? Number(existing.totalDebt || 0) : Number(existing.currentPayable || 0);
          if (Math.abs(importedBalance - currentBalance) > 0.01) stats.debtAdjustedCount += 1;
        } else if (row.code && row.name) stats.createdCount += 1;
      });
    } else {
      normalizedRows = normalizeDebtImportRows(rows, entityType);
      stats.detailCount = normalizedRows.length;
      const partnerCode = importText(req.body?.partnerCode || req.body?.meta?.partnerCode);
      if (!partnerCode) issues.push({ rowNumber: 1, code: 'MISSING_PARTNER_CODE', message: 'Chưa xác định mã khách hàng/nhà cung cấp của báo cáo công nợ.', sourceCode: '', sourceName: '' });
      else {
        const partner = entityType === 'customer_debt'
          ? await db.select({ id: schema.customers.id }).from(schema.customers).where(and(eq(schema.customers.tenantId, req.user.tenantId), eq(schema.customers.code, partnerCode))).get()
          : await db.select({ id: schema.suppliers.id }).from(schema.suppliers).where(and(eq(schema.suppliers.tenantId, req.user.tenantId), eq(schema.suppliers.code, partnerCode))).get();
        if (!partner) issues.push({ rowNumber: 1, code: 'PARTNER_NOT_FOUND', message: `Không tìm thấy đối tác có mã ${partnerCode}. Hãy import danh sách đối tác trước.`, sourceCode: partnerCode, sourceName: '' });
      }
    }
    stats.errorCount = issues.length;
    res.json({ sourceSystem, entityType, sourceHash, stats, issues, sample: normalizedRows.slice(0, 20).map(({ raw, ...row }) => row), fieldCount: rows[0] ? Object.keys(rows[0]).length : 0 });
  } catch (err) {
    console.error('POST /api/partners/import/preview error:', err);
    res.status(500).json({ error: 'Không thể xem trước dữ liệu đối tác.' });
  }
};

app.post('/api/partners/import/preview', partnerImportPreview);

app.get('/api/partners/import-history', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'partners.view')) return;
    const rows = await db.select().from(schema.partnerImportBatches).where(eq(schema.partnerImportBatches.tenantId, req.user.tenantId)).orderBy(desc(schema.partnerImportBatches.createdAt)).limit(50).all();
    res.json(rows);
  } catch (err) { console.error('GET /api/partners/import-history error:', err); res.status(500).json({ error: 'Không thể tải lịch sử import đối tác.' }); }
});

app.get('/api/partners/import-history/:batchId/issues', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'partners.view')) return;
    const batch = await db.select().from(schema.partnerImportBatches).where(and(eq(schema.partnerImportBatches.id, req.params.batchId), eq(schema.partnerImportBatches.tenantId, req.user.tenantId))).get();
    if (!batch) return res.status(404).json({ error: 'Không tìm thấy batch import.' });
    const issues = await db.select().from(schema.partnerImportIssues).where(and(eq(schema.partnerImportIssues.batchId, batch.id), eq(schema.partnerImportIssues.tenantId, req.user.tenantId))).all();
    res.json({ batch, issues });
  } catch (err) { console.error('GET /api/partners/import-history/:batchId/issues error:', err); res.status(500).json({ error: 'Không thể tải lỗi import đối tác.' }); }
});

app.post('/api/partners/import', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'partners.create')) return;
    const sourceSystem = importText(req.body?.sourceSystem || 'kiot-viet').toLowerCase();
    const entityType = req.body?.entityType as PartnerImportEntity;
    const rows = Array.isArray(req.body?.rows) ? req.body.rows as Record<string, unknown>[] : [];
    if (!['customer', 'supplier', 'customer_debt', 'supplier_debt'].includes(entityType) || !rows.length) return res.status(400).json({ error: 'Thiếu loại dữ liệu hoặc danh sách dòng import.' });
    const sourceHash = partnerImportHash(sourceSystem, entityType, rows, req.body?.meta);
    const previous = await db.select().from(schema.partnerImportBatches).where(and(eq(schema.partnerImportBatches.tenantId, req.user.tenantId), eq(schema.partnerImportBatches.sourceSystem, sourceSystem), eq(schema.partnerImportBatches.entityType, entityType), eq(schema.partnerImportBatches.sourceHash, sourceHash))).get();
    if (previous?.status === 'completed') return res.json({ batch: previous, idempotent: true });

    const previewResponse = await new Promise<any>((resolve, reject) => {
      const fakeRes: any = { status: (code: number) => ({ json: (payload: any) => code >= 400 ? reject(Object.assign(new Error(payload.error), { statusCode: code })) : resolve(payload) }), json: (payload: any) => resolve(payload) };
      partnerImportPreview(req, fakeRes).catch(reject);
    });
    if (previewResponse.stats.errorCount) return res.status(422).json({ error: 'File còn lỗi, chưa thể import.', preview: previewResponse });

    const now = new Date().toISOString();
    const batch: any = { id: uuid(), tenantId: req.user.tenantId, sourceSystem, entityType, fileName: importText(req.body?.fileName), sourceHash, status: 'completed', totalRows: rows.length, createdCount: 0, updatedCount: 0, debtAdjustedCount: 0, detailCount: 0, errorCount: 0, createdBy: req.user.id, createdAt: now, completedAt: now };
    const normalizedRows = entityType === 'customer' ? rows.map(normalizeCustomerImportRow) : entityType === 'supplier' ? rows.map(normalizeSupplierImportRow) : normalizeDebtImportRows(rows, entityType);
    await db.transaction(async (tx) => {
      await tx.insert(schema.partnerImportBatches).values(batch).run();
      if (entityType === 'customer' || entityType === 'supplier') {
        const existingRows: any[] = entityType === 'customer'
          ? await tx.select().from(schema.customers).where(eq(schema.customers.tenantId, req.user.tenantId)).all()
          : await tx.select().from(schema.suppliers).where(eq(schema.suppliers.tenantId, req.user.tenantId)).all();
        const existingByCode = new Map(existingRows.map((row: any) => [normalizeSearchText(row.code), row]));
        for (const row of normalizedRows as any[]) {
          const existing = existingByCode.get(normalizeSearchText(row.code));
          const importedAt = now;
          if (entityType === 'customer') {
            const values: any = { name: row.name, phone: row.phone, address: row.address, taxCode: row.taxCode || null, companyName: row.companyName || null, invoiceAddress: row.invoiceAddress || null, shippingAddress: row.address || null, note: row.note, type: /vip|thân thiết|than thiet/i.test(row.groupName) ? 'loyal' : 'retail', sourceSystem, sourceCode: row.code, sourceBranch: row.sourceBranch, sourceImportedAt: importedAt, sourceRawData: JSON.stringify(row.raw), customerTypeRaw: row.customerTypeRaw, deliveryArea: row.deliveryArea, ward: row.ward, birthDate: row.birthDate, gender: row.gender, email: row.email, facebook: row.facebook, groupName: row.groupName, buyerName: row.buyerName, invoiceProvince: row.invoiceProvince, invoiceWard: row.invoiceWard, invoiceCitizenId: row.invoiceCitizenId, invoicePassportNumber: row.invoicePassportNumber, invoiceGovernmentId: row.invoiceGovernmentId, invoiceEmail: row.invoiceEmail, invoicePhone: row.invoicePhone, bankName: row.bankName, bankAccount: row.bankAccount, sourceCreatedBy: row.sourceCreatedBy, sourceCreatedAt: row.sourceCreatedAt, lastTransactionAt: row.lastTransactionAt, totalSales: row.totalSales, totalSalesAfterReturns: row.totalSalesAfterReturns, sourceStatus: row.sourceStatus };
            if (existing) {
              const delta = row.totalDebt - Number(existing.totalDebt || 0);
              await tx.update(schema.customers).set({ ...values, totalDebt: row.totalDebt }).where(and(eq(schema.customers.id, existing.id), eq(schema.customers.tenantId, req.user.tenantId))).run();
              batch.updatedCount += 1;
              if (Math.abs(delta) > 0.01) { await tx.insert(schema.debtLedger).values({ id: uuid(), tenantId: req.user.tenantId, customerId: existing.id, invoiceId: null, amount: Math.abs(delta), type: delta > 0 ? 'increase' : 'decrease', note: `Import ${sourceSystem} · ${batch.id}`, createdAt: now, createdBy: req.user.id }).run(); batch.debtAdjustedCount += 1; }
            } else {
              await tx.insert(schema.customers).values({ id: uuid(), tenantId: req.user.tenantId, createdBy: req.user.id, code: row.code, totalDebt: row.totalDebt, active: row.sourceStatus !== 'inactive', allowDebt: true, creditLimit: 0, paymentDays: 0, tags: '[]', ...values }).run(); batch.createdCount += 1;
            }
          } else {
            const values: any = { name: row.name, phone: row.phone, address: row.address, taxCode: row.taxCode || null, note: row.note, email: row.email || null, region: row.region || null, ward: row.ward || null, idNumber: row.idNumber || null, groupName: row.groupName || null, companyName: row.companyName || null, totalPurchases: row.totalPurchases, totalPurchasesAfterReturns: row.totalPurchasesAfterReturns, sourceSystem, sourceCode: row.code, sourceImportedAt: importedAt, sourceRawData: JSON.stringify(row.raw), sourceCreatedBy: row.sourceCreatedBy, sourceCreatedAt: row.sourceCreatedAt, sourceStatus: row.sourceStatus };
            if (existing) {
              const delta = row.currentPayable - Number(existing.currentPayable || 0);
              await tx.update(schema.suppliers).set({ ...values, currentPayable: row.currentPayable }).where(and(eq(schema.suppliers.id, existing.id), eq(schema.suppliers.tenantId, req.user.tenantId))).run();
              batch.updatedCount += 1;
              if (Math.abs(delta) > 0.01) { await tx.insert(schema.payableLedger).values({ id: uuid(), tenantId: req.user.tenantId, supplierId: existing.id, purchaseId: null, amount: Math.abs(delta), type: delta > 0 ? 'increase' : 'decrease', note: `Import ${sourceSystem} · ${batch.id}`, createdAt: now, createdBy: req.user.id }).run(); batch.debtAdjustedCount += 1; }
            } else {
              await tx.insert(schema.suppliers).values({ id: uuid(), tenantId: req.user.tenantId, code: row.code, currentPayable: row.currentPayable, active: row.sourceStatus !== 'inactive', ...values }).run(); batch.createdCount += 1;
            }
          }
        }
      } else {
        const partnerCode = importText(req.body?.partnerCode || req.body?.meta?.partnerCode);
        const partner = entityType === 'customer_debt'
          ? await tx.select({ id: schema.customers.id }).from(schema.customers).where(and(eq(schema.customers.tenantId, req.user.tenantId), eq(schema.customers.code, partnerCode))).get()
          : await tx.select({ id: schema.suppliers.id }).from(schema.suppliers).where(and(eq(schema.suppliers.tenantId, req.user.tenantId), eq(schema.suppliers.code, partnerCode))).get();
        if (!partner) throw new BusinessError(422, `Không tìm thấy đối tác có mã ${partnerCode}.`);
        for (const row of normalizedRows as any[]) {
          await tx.insert(schema.partnerDebtImportRows).values({ id: uuid(), batchId: batch.id, tenantId: req.user.tenantId, entityType, partnerId: partner.id, documentNo: row.documentNo, occurredAt: row.occurredAt, description: row.description, unit: '', quantity: null, unitPrice: null, discount: null, vat: null, purchasePrice: null, amount: row.amount || row.debit || row.credit || 0, debit: row.debit || 0, credit: row.credit || 0, note: row.note || '', detailsJson: row.detailsJson || '[]', sourceRowNumber: row.sourceRowNumber || 0, sourceRawData: JSON.stringify(row.raw), createdBy: req.user.id, createdAt: now }).run();
          batch.detailCount += 1;
        }
      }
      await tx.update(schema.partnerImportBatches).set({ createdCount: batch.createdCount, updatedCount: batch.updatedCount, debtAdjustedCount: batch.debtAdjustedCount, detailCount: batch.detailCount, completedAt: now }).where(eq(schema.partnerImportBatches.id, batch.id)).run();
    });
    const saved = await db.select().from(schema.partnerImportBatches).where(eq(schema.partnerImportBatches.id, batch.id)).get();
    res.status(201).json({ batch: saved, idempotent: false });
  } catch (err: any) {
    console.error('POST /api/partners/import error:', err);
    res.status(err?.statusCode || 500).json({ error: err?.message || 'Không thể import dữ liệu đối tác.' });
  }
});

app.get('/api/suppliers', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'partners.view')) return;
    const includeMeta = String(req.query.includeMeta || '') === 'true';
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const search = normalizeSearchText(req.query.search);
    const conditions = [eq(schema.suppliers.tenantId, req.user.tenantId)];
    if (search) {
      const term = `%${search}%`;
      conditions.push(or(
        sql`lower(${schema.suppliers.code}) like ${term}`,
        sql`lower(${schema.suppliers.name}) like ${term}`,
        sql`lower(${schema.suppliers.phone}) like ${term}`,
        sql`lower(coalesce(${schema.suppliers.email}, '')) like ${term}`,
        sql`lower(coalesce(${schema.suppliers.sourceCode}, '')) like ${term}`,
      ) as any);
    }
    const whereClause = and(...conditions);
    const totalRow = includeMeta
      ? await db.select({ count: sql<number>`count(*)` }).from(schema.suppliers).where(whereClause).get()
      : null;
    const rows = await db.select().from(schema.suppliers)
      .where(whereClause)
      .orderBy(schema.suppliers.name, schema.suppliers.id)
      .limit(includeMeta ? limit : 5000)
      .offset(includeMeta ? offset : 0)
      .all();
    res.json(includeMeta
      ? { items: rows, total: Number(totalRow?.count || 0), offset, limit }
      : rows);
  } catch (err) {
    console.error('GET /api/suppliers error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/suppliers', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'partners.create')) return;
    const { code, name, phone = '', taxCode = null, address = '', note = '' } = req.body || {};
    if (!name) return res.status(400).json({ error: 'Supplier name is required' });
    const supplier = { id: uuid(), tenantId: req.user.tenantId, code: code || await nextSupplierCode(req.user.tenantId), name, phone, taxCode, address, note, currentPayable: 0, active: true };
    await db.insert(schema.suppliers).values(supplier).run();
    res.status(201).json(supplier);
  } catch (err) {
    console.error('POST /api/suppliers error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.patch('/api/suppliers/:id', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'partners.update')) return;
    const supplier = await db.select().from(schema.suppliers).where(and(eq(schema.suppliers.id, req.params.id), eq(schema.suppliers.tenantId, req.user.tenantId))).get();
    if (!supplier) return res.status(404).json({ error: 'Supplier not found' });
    const updates: Record<string, unknown> = {};
    for (const field of ['code', 'name', 'phone', 'taxCode', 'address', 'note', 'active'] as const) {
      if (req.body?.[field] !== undefined) updates[field] = field === 'active' ? Boolean(req.body[field]) : String(req.body[field] || '').trim();
    }
    if (updates.name !== undefined && !updates.name) return res.status(400).json({ error: 'Tên nhà cung cấp là bắt buộc' });
    if (!Object.keys(updates).length) return res.status(400).json({ error: 'Không có trường hợp lệ để cập nhật' });
    await db.update(schema.suppliers).set(updates).where(and(eq(schema.suppliers.id, supplier.id), eq(schema.suppliers.tenantId, req.user.tenantId))).run();
    res.json(await db.select().from(schema.suppliers).where(eq(schema.suppliers.id, supplier.id)).get());
  } catch (err) {
    console.error('PATCH /api/suppliers/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/purchases', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'purchases.view')) return;
    const includeMeta = String(req.query.includeMeta || '') === 'true';
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const purchaseConditions = [eq(schema.purchases.tenantId, req.user.tenantId)];
    if (!canViewAllTransactions(req)) purchaseConditions.push(eq(schema.purchases.createdBy, req.user.id) as any);
    const purchaseWhere = and(...purchaseConditions);
    const totalRow = includeMeta
      ? await db.select({ count: sql<number>`count(*)` }).from(schema.purchases).where(purchaseWhere).get()
      : null;
    const rows = await db.select().from(schema.purchases)
      .where(purchaseWhere)
      .orderBy(desc(schema.purchases.createdAt), desc(schema.purchases.id))
      .limit(includeMeta ? limit : 5000)
      .offset(includeMeta ? offset : 0)
      .all();
    const tenantUsers = await db.select().from(schema.users).where(eq(schema.users.tenantId, req.user.tenantId)).all();
    const userNameById = new Map(tenantUsers.map((user) => [user.id, user.name]));
    const items = await Promise.all(rows.map(async (purchase) => {
      const items = await db.select({ quantity: schema.purchaseItems.quantity }).from(schema.purchaseItems).where(eq(schema.purchaseItems.purchaseId, purchase.id)).all();
      return {
        ...purchase,
        supplier: await db.select().from(schema.suppliers).where(eq(schema.suppliers.id, purchase.supplierId)).get() || null,
        createdByName: userNameById.get(purchase.createdBy) || null,
        itemCount: items.length,
        totalQuantity: items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
      };
    }));
    res.json(includeMeta
      ? { items, total: Number(totalRow?.count || 0), offset, limit }
      : items);
  } catch (err) {
    console.error('GET /api/purchases error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/purchases/:id', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'purchases.view')) return;
    const purchase = await db.select().from(schema.purchases).where(and(eq(schema.purchases.id, req.params.id), eq(schema.purchases.tenantId, req.user.tenantId))).get();
    if (!purchase) return res.status(404).json({ error: 'Purchase not found' });
    if (!canViewTransaction(req, purchase)) return res.status(404).json({ error: 'Purchase not found' });
    const items = await db.select().from(schema.purchaseItems).where(eq(schema.purchaseItems.purchaseId, purchase.id)).all();
    const creator = await db.select({ name: schema.users.name }).from(schema.users).where(and(eq(schema.users.id, purchase.createdBy), eq(schema.users.tenantId, req.user.tenantId))).get();
    res.json({ ...purchase, items, createdByName: creator?.name || null, supplier: await db.select().from(schema.suppliers).where(eq(schema.suppliers.id, purchase.supplierId)).get() || null });
  } catch (err) {
    console.error('GET /api/purchases/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/purchases', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'purchases.create')) return;
    const { supplierId, items = [], paidAmount = 0, paymentMethod = 'payable', taxAmount = 0, note = '', createdAt } = req.body || {};
    const supplier = await db.select().from(schema.suppliers).where(and(eq(schema.suppliers.id, supplierId), eq(schema.suppliers.tenantId, req.user.tenantId))).get();
    if (!supplier) return res.status(400).json({ error: 'Supplier not found' });
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'At least one purchase item is required' });
    const normalizedItems = await Promise.all(items.map(async (item: any) => {
      const quantity = Number(item.quantity) || 0;
      const isGift = Boolean(item.isGift);
      const price = isGift ? 0 : Number(item.price) || 0;
      if (!item.productId || quantity <= 0 || price < 0) throw new Error('Invalid purchase item');
      const product = await db.select().from(schema.products).where(and(eq(schema.products.id, item.productId), eq(schema.products.tenantId, req.user.tenantId))).get();
      if (!product) throw new Error(`Product not found: ${item.productId}`);
      if (product.productType === 'combo') throw new Error('Không thể nhập trực tiếp sản phẩm combo');
      const unit = await unitForProduct(req.user.tenantId, product, item.unitName || item.unit, item.unitFactor);
      const requestedSellingPrice = item.sellingPrice === undefined || item.sellingPrice === null || item.sellingPrice === ''
        ? null
        : Number(item.sellingPrice);
      if (requestedSellingPrice !== null && (!Number.isFinite(requestedSellingPrice) || requestedSellingPrice < 0)) throw new Error('Giá bán sau nhập không hợp lệ');
      const discountMode = item.discountMode === 'percent' ? 'percent' : 'amount';
      const discountValue = Math.max(0, Number(item.discountValue) || 0);
      const lineSubtotal = quantity * price;
      const discountAmount = discountMode === 'percent'
        ? lineSubtotal * Math.min(100, discountValue) / 100
        : Math.min(lineSubtotal, discountValue);
      return {
        ...item,
        quantity,
        price,
        isGift,
        discountMode,
        discountValue,
        discountAmount,
        sellingPrice: requestedSellingPrice,
        note: String(item.note || '').trim().slice(0, 2000),
        unitName: unit.name,
        unitFactor: unit.factor,
        baseQuantity: quantity * unit.factor,
        taxRate: Number(item.taxRate) || 0,
        total: Math.max(0, lineSubtotal - discountAmount),
      };
    }));
    const totalAmount = normalizedItems.reduce((sum: number, item: any) => sum + item.total, 0);
    const finalAmount = totalAmount + (Number(taxAmount) || 0);
    const directPaid = Math.min(finalAmount, Math.max(0, Number(paidAmount) || 0));
    const availableCredit = Math.max(0, await supplierCreditBalance(req.user.tenantId, supplier.id));
    const creditUsed = Math.min(Math.max(0, finalAmount - directPaid), availableCredit);
    const paid = Math.min(finalAmount, directPaid + creditUsed);
    const payable = finalAmount - paid;
    const purchaseId = uuid();
    const documentNo = String(req.body?.documentNo || await nextDocumentNo(req.user.tenantId, 'purchase', 'PN'));
    const timestamp = createdAt || new Date().toISOString();
    const status = payable <= 0 ? 'confirmed' : paid > 0 ? 'partial' : 'unpaid';
    const accountId = directPaid > 0 ? (req.body?.accountId || await defaultAccountForPayment(req.user.tenantId, paymentMethod)) : null;

    await db.transaction(async (tx: any) => {
      let defaultPriceList = await tx.select().from(schema.priceLists).where(and(
        eq(schema.priceLists.tenantId, req.user.tenantId),
        eq(schema.priceLists.isDefault, true),
      )).get();
      const saveDefaultSellingPrice = async (productId: string, unitName: string, unitFactor: number, price: number) => {
        if (!defaultPriceList) {
          const id = uuid();
          await tx.insert(schema.priceLists).values({ id, tenantId: req.user.tenantId, name: 'Bảng giá chung', customerType: 'all', isDefault: true, active: true, createdAt: timestamp }).run();
          defaultPriceList = await tx.select().from(schema.priceLists).where(eq(schema.priceLists.id, id)).get();
        }
        if (!defaultPriceList) throw new Error('Không thể khởi tạo bảng giá chung');
        const existing = await tx.select().from(schema.priceListItems).where(and(
          eq(schema.priceListItems.priceListId, defaultPriceList.id),
          eq(schema.priceListItems.productId, productId),
          eq(schema.priceListItems.unitName, unitName),
        )).get();
        if (existing) {
          await tx.update(schema.priceListItems).set({ price, unitFactor }).where(eq(schema.priceListItems.id, existing.id)).run();
        } else {
          await tx.insert(schema.priceListItems).values({ id: uuid(), tenantId: req.user.tenantId, priceListId: defaultPriceList.id, productId, unitName, unitFactor, price, createdAt: timestamp }).run();
        }
      };
      await tx.insert(schema.purchases).values({ id: purchaseId, documentNo, tenantId: req.user.tenantId, supplierId, createdBy: req.user.id, totalAmount, taxAmount: Number(taxAmount) || 0, finalAmount, paidAmount: paid, payableAmount: payable, paymentMethod, accountId, status, note, createdAt: timestamp }).run();
      for (const item of normalizedItems) {
        const product = await tx.select().from(schema.products).where(and(eq(schema.products.id, item.productId), eq(schema.products.tenantId, req.user.tenantId))).get();
        if (!product) throw new Error(`Product not found: ${item.productId}`);
        const beforeStock = product.stock;
        const afterStock = product.trackStock ? beforeStock + item.baseQuantity : beforeStock;
        const sellingPrice = item.sellingPrice === null
          ? Number(product.sellingPrice || 0) * Number(item.unitFactor || 1)
          : Number(item.sellingPrice);
        if (product.trackStock) {
          await tx.update(schema.products).set({
            stock: afterStock,
            ...(item.isGift ? {} : { purchasePrice: item.price }),
            ...(item.unitName === product.unit || Number(item.unitFactor) === 1 ? { sellingPrice } : {}),
          }).where(eq(schema.products.id, product.id)).run();
          await tx.insert(schema.stockMovements).values({ id: uuid(), tenantId: req.user.tenantId, productId: product.id, type: 'in', quantity: item.baseQuantity, beforeStock, afterStock, note: `Nhập hàng ${purchaseId}`, referenceId: purchaseId, createdAt: timestamp, createdBy: req.user.id }).run();
        } else if (!item.isGift || item.sellingPrice !== null) {
          await tx.update(schema.products).set({
            ...(item.isGift ? {} : { purchasePrice: item.price }),
            ...(item.unitName === product.unit || Number(item.unitFactor) === 1 ? { sellingPrice } : {}),
          }).where(eq(schema.products.id, product.id)).run();
        }
        if (item.sellingPrice !== null) await saveDefaultSellingPrice(product.id, item.unitName, item.unitFactor, sellingPrice);
        await tx.insert(schema.purchaseItems).values({ id: uuid(), purchaseId, productId: product.id, productName: product.name, unit: item.unitName, quantity: item.quantity, price: item.price, taxRate: item.taxRate, total: item.total, unitFactor: item.unitFactor, baseQuantity: item.baseQuantity, isGift: item.isGift, sellingPrice, note: item.note }).run();
      }
      if (creditUsed > 0) await tx.insert(schema.supplierCreditLedger).values({ id: uuid(), tenantId: req.user.tenantId, supplierId: supplier.id, purchaseId, purchaseReturnId: null, amount: creditUsed, type: 'decrease', accountId: null, note: 'Cấn trừ số dư trả hàng nhà cung cấp', createdBy: req.user.id, createdAt: timestamp }).run();
      if (payable > 0) {
        await tx.update(schema.suppliers).set({ currentPayable: supplier.currentPayable + payable }).where(eq(schema.suppliers.id, supplier.id)).run();
        await tx.insert(schema.payableLedger).values({ id: uuid(), tenantId: req.user.tenantId, supplierId: supplier.id, purchaseId, amount: payable, type: 'increase', note: 'Nhập hàng chưa thanh toán đủ', createdAt: timestamp, createdBy: req.user.id }).run();
      }
      if (directPaid > 0) await tx.insert(schema.cashbookEntries).values({ id: uuid(), tenantId: req.user.tenantId, type: 'expense', amount: directPaid, category: 'Nhập hàng', note: `Thanh toán nhập hàng ${purchaseId}`, referenceId: purchaseId, accountId, createdAt: timestamp, createdBy: req.user.id }).run();
    });
    await safeNotifyTenantOwners({
      tenantId: req.user.tenantId,
      actorId: req.user.id,
      type: 'purchase',
      title: 'Có phiếu nhập hàng mới',
      body: `${documentNo} · ${supplier.name} · ${finalAmount.toLocaleString('vi-VN')} đ`,
      entityType: 'purchase',
      entityId: purchaseId,
    });
    res.status(201).json(await db.select().from(schema.purchases).where(eq(schema.purchases.id, purchaseId)).get());
  } catch (err) {
    console.error('POST /api/purchases error:', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Could not create purchase' });
  }
});

app.get('/api/purchases/:id/returnable', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'purchases.view')) return;
    const purchase = await db.select().from(schema.purchases).where(and(eq(schema.purchases.id, req.params.id), eq(schema.purchases.tenantId, req.user.tenantId))).get();
    if (!purchase) return res.status(404).json({ error: 'Không tìm thấy phiếu nhập' });
    if (!canViewTransaction(req, purchase)) return res.status(404).json({ error: 'Không tìm thấy phiếu nhập' });
    const items = await db.select().from(schema.purchaseItems).where(eq(schema.purchaseItems.purchaseId, purchase.id)).all();
    const returns = await db.select().from(schema.purchaseReturnItems).where(inArray(schema.purchaseReturnItems.purchaseItemId, items.map((item) => item.id))).all();
    res.json({ purchase, items: items.map((item) => ({ ...item, returnedQuantity: returns.filter((row) => row.purchaseItemId === item.id).reduce((sum, row) => sum + Number(row.quantity), 0), returnedBaseQuantity: returns.filter((row) => row.purchaseItemId === item.id).reduce((sum, row) => sum + Number(row.baseQuantity), 0) })) });
  } catch (err) { res.status(500).json({ error: 'Không thể tải dòng hàng có thể trả' }); }
});

app.get('/api/purchase-returns', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'purchases.view')) return;
    let rows = await db.select().from(schema.purchaseReturns).where(eq(schema.purchaseReturns.tenantId, req.user.tenantId)).orderBy(desc(schema.purchaseReturns.createdAt)).all();
    if (!canViewAllTransactions(req)) rows = rows.filter((row) => row.createdBy === req.user.id);
    if (req.query.supplierId) rows = rows.filter((row) => row.supplierId === req.query.supplierId);
    res.json(await Promise.all(rows.map(async (row) => ({ ...row, items: await db.select().from(schema.purchaseReturnItems).where(eq(schema.purchaseReturnItems.returnId, row.id)).all(), supplier: await db.select().from(schema.suppliers).where(eq(schema.suppliers.id, row.supplierId)).get() || null }))));
  } catch (err) { res.status(500).json({ error: 'Không thể tải phiếu trả nhà cung cấp' }); }
});

app.post('/api/purchases/:id/returns', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'purchases.return')) return;
    const purchase = await db.select().from(schema.purchases).where(and(eq(schema.purchases.id, req.params.id), eq(schema.purchases.tenantId, req.user.tenantId))).get();
    if (!purchase) return res.status(404).json({ error: 'Không tìm thấy phiếu nhập' });
    if (!canViewTransaction(req, purchase)) return res.status(404).json({ error: 'Không tìm thấy phiếu nhập' });
    const requestedItems = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!requestedItems.length) return res.status(400).json({ error: 'Chọn ít nhất một dòng hàng để trả' });
    const purchaseItems = await db.select().from(schema.purchaseItems).where(eq(schema.purchaseItems.purchaseId, purchase.id)).all() as any[];
    const purchaseItemById = new Map<string, any>(purchaseItems.map((item: any) => [item.id, item]));
    const priorReturns = await db.select().from(schema.purchaseReturnItems).where(inArray(schema.purchaseReturnItems.purchaseItemId, purchaseItems.map((item: any) => item.id))).all() as any[];
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
    const priorPurchaseReturns = await db.select().from(schema.purchaseReturns).where(and(eq(schema.purchaseReturns.purchaseId, purchase.id), eq(schema.purchaseReturns.tenantId, req.user.tenantId))).all();
    const remainingPurchasePayable = Math.max(0, Number(purchase.payableAmount) - priorPurchaseReturns.reduce((sum, item) => sum + Number(item.totalAmount), 0));
    const appliedPayable = Math.min(remainingPurchasePayable, totalAmount);
    const supplier = await db.select().from(schema.suppliers).where(and(eq(schema.suppliers.id, purchase.supplierId), eq(schema.suppliers.tenantId, req.user.tenantId))).get();
    if (!supplier) return res.status(404).json({ error: 'Không tìm thấy nhà cung cấp' });
    const creditAmount = Math.max(0, totalAmount - appliedPayable);

    await db.transaction(async (tx) => {
      await tx.insert(schema.purchaseReturns).values({ id: returnId, documentNo: String(req.body?.documentNo || await nextDocumentNo(req.user.tenantId, 'purchase_return', 'PTN')), tenantId: req.user.tenantId, purchaseId: purchase.id, supplierId: supplier.id, totalAmount, note: String(req.body?.note || ''), createdBy: req.user.id, createdAt: timestamp }).run();
      for (const row of normalized) {
        const product = await tx.select().from(schema.products).where(and(eq(schema.products.id, row.original.productId), eq(schema.products.tenantId, req.user.tenantId))).get();
        if (!product) throw new Error(`Không tìm thấy sản phẩm ${row.original.productName}`);
        if (product.trackStock && Number(product.stock) < row.baseQuantity) throw new Error(`Tồn kho không đủ để trả ${product.name}`);
        if (product.trackStock) {
          const beforeStock = Number(product.stock);
          const afterStock = beforeStock - row.baseQuantity;
          await tx.update(schema.products).set({ stock: afterStock }).where(eq(schema.products.id, product.id)).run();
          await tx.insert(schema.stockMovements).values({ id: uuid(), tenantId: req.user.tenantId, productId: product.id, type: 'out', quantity: row.baseQuantity, beforeStock, afterStock, note: `Trả hàng NCC ${returnId}`, referenceId: returnId, createdAt: timestamp, createdBy: req.user.id }).run();
        }
        await tx.insert(schema.purchaseReturnItems).values({ id: uuid(), returnId, purchaseItemId: row.original.id, productId: row.original.productId, productName: row.original.productName, unit: row.original.unit, quantity: row.quantity, unitFactor: row.unitFactor, baseQuantity: row.baseQuantity, price: row.original.price, total: row.total }).run();
      }
      if (appliedPayable > 0) {
        await tx.update(schema.suppliers).set({ currentPayable: Math.max(0, Number(supplier.currentPayable) - appliedPayable) }).where(eq(schema.suppliers.id, supplier.id)).run();
        await tx.insert(schema.payableLedger).values({ id: uuid(), tenantId: req.user.tenantId, supplierId: supplier.id, purchaseId: purchase.id, amount: appliedPayable, type: 'decrease', note: `Giảm công nợ do trả hàng ${returnId}`, createdAt: timestamp, createdBy: req.user.id }).run();
      }
      if (creditAmount > 0) await tx.insert(schema.supplierCreditLedger).values({ id: uuid(), tenantId: req.user.tenantId, supplierId: supplier.id, purchaseReturnId: returnId, purchaseId: purchase.id, amount: creditAmount, type: 'increase', accountId: null, note: `Số dư được nhận từ trả hàng ${returnId}`, createdBy: req.user.id, createdAt: timestamp }).run();
    });
    await safeNotifyTenantOwners({
      tenantId: req.user.tenantId,
      actorId: req.user.id,
      type: 'purchase_return',
      title: 'Có phiếu trả hàng nhập mới',
      body: `${purchase.documentNo || 'Phiếu nhập'} · ${supplier.name} · ${totalAmount.toLocaleString('vi-VN')} đ`,
      entityType: 'purchase_return',
      entityId: returnId,
    });
    res.status(201).json(await db.select().from(schema.purchaseReturns).where(eq(schema.purchaseReturns.id, returnId)).get());
  } catch (err) {
    console.error('POST /api/purchases/:id/returns error:', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Không thể tạo phiếu trả nhà cung cấp' });
  }
});

app.get('/api/supplier-credit-ledger', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'purchases.view')) return;
    let rows = await db.select().from(schema.supplierCreditLedger).where(eq(schema.supplierCreditLedger.tenantId, req.user.tenantId)).orderBy(desc(schema.supplierCreditLedger.createdAt)).all();
    if (!canViewAllTransactions(req)) rows = rows.filter((row) => row.createdBy === req.user.id);
    if (req.query.supplierId) rows = rows.filter((row) => row.supplierId === req.query.supplierId);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Không thể tải số dư nhà cung cấp' }); }
});

app.post('/api/suppliers/:id/credit-settlement', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'purchases.return')) return;
    const supplier = await db.select().from(schema.suppliers).where(and(eq(schema.suppliers.id, req.params.id), eq(schema.suppliers.tenantId, req.user.tenantId))).get();
    if (!supplier) return res.status(404).json({ error: 'Không tìm thấy nhà cung cấp' });
    const balance = Math.max(0, await supplierCreditBalance(req.user.tenantId, supplier.id));
    const amount = Number(req.body?.amount) || 0;
    if (amount <= 0 || amount > balance) return res.status(400).json({ error: 'Số tiền nhận không hợp lệ' });
    const paymentMethod = String(req.body?.paymentMethod || 'cash');
    const accountId = req.body?.accountId || await defaultAccountForPayment(req.user.tenantId, paymentMethod);
    const timestamp = new Date().toISOString();
    const entry = { id: uuid(), tenantId: req.user.tenantId, supplierId: supplier.id, purchaseReturnId: null, purchaseId: null, amount, type: 'decrease' as const, accountId, note: String(req.body?.note || 'Nhận tiền hoàn từ nhà cung cấp'), createdBy: req.user.id, createdAt: timestamp };
    await db.transaction(async (tx) => {
      await tx.insert(schema.supplierCreditLedger).values(entry).run();
      await tx.insert(schema.cashbookEntries).values({ id: uuid(), tenantId: req.user.tenantId, type: 'income', amount, category: 'Thu tiền NCC', note: entry.note, referenceId: entry.id, accountId, createdAt: timestamp, createdBy: req.user.id }).run();
    });
    res.status(201).json(entry);
  } catch (err) { res.status(400).json({ error: err instanceof Error ? err.message : 'Không thể nhận tiền nhà cung cấp' }); }
});

app.get('/api/payable-ledger', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'debt.view')) return;
    let rows = await db.select().from(schema.payableLedger).where(eq(schema.payableLedger.tenantId, req.user.tenantId)).orderBy(desc(schema.payableLedger.createdAt)).all();
    if (!canViewAllTransactions(req)) rows = rows.filter((row) => row.createdBy === req.user.id);
    if (req.query.supplierId) rows = rows.filter((row) => row.supplierId === req.query.supplierId);
    res.json(rows);
  } catch (err) {
    console.error('GET /api/payable-ledger error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/payable-ledger', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'debt.collect')) return;
    const { supplierId, amount, note = '' } = req.body || {};
    const supplier = await db.select().from(schema.suppliers).where(and(eq(schema.suppliers.id, supplierId), eq(schema.suppliers.tenantId, req.user.tenantId))).get();
    const payment = Number(amount) || 0;
    if (!supplier || payment <= 0) return res.status(400).json({ error: 'Supplier and positive amount are required' });
    const timestamp = new Date().toISOString();
    const paymentMethod = String(req.body?.paymentMethod || 'cash');
    const accountId = req.body?.accountId || await defaultAccountForPayment(req.user.tenantId, paymentMethod);
    const entry = { id: uuid(), tenantId: req.user.tenantId, supplierId, purchaseId: null, amount: Math.min(payment, supplier.currentPayable), type: 'decrease' as const, note: note || 'Thanh toán nhà cung cấp', createdAt: timestamp, createdBy: req.user.id };
    await db.transaction(async (tx) => {
      await tx.insert(schema.payableLedger).values(entry).run();
      await tx.update(schema.suppliers).set({ currentPayable: Math.max(0, supplier.currentPayable - entry.amount) }).where(eq(schema.suppliers.id, supplierId)).run();
      await tx.insert(schema.cashbookEntries).values({ id: uuid(), tenantId: req.user.tenantId, type: 'expense', amount: entry.amount, category: 'Thanh toán NCC', note: entry.note, referenceId: entry.id, accountId, createdAt: timestamp, createdBy: req.user.id }).run();
    });
    res.status(201).json(entry);
  } catch (err) {
    console.error('POST /api/payable-ledger error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/suppliers/:id/debt-statement', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'debt.view')) return;
    const supplier = await db.select().from(schema.suppliers)
      .where(and(eq(schema.suppliers.id, req.params.id), eq(schema.suppliers.tenantId, req.user.tenantId))).get();
    if (!supplier) return res.status(404).json({ error: 'Không tìm thấy nhà cung cấp' });

    const parseBoundary = (value: unknown, endOfDay: boolean) => {
      if (!value) return endOfDay ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
      const raw = String(value).trim();
      const parsed = new Date(`${raw}T${endOfDay ? '23:59:59.999' : '00:00:00'}`).getTime();
      return Number.isFinite(parsed) ? parsed : null;
    };
    const fromMs = parseBoundary(req.query.from, false);
    const toMs = parseBoundary(req.query.to, true);
    if (fromMs === null || toMs === null || fromMs > toMs) {
      return res.status(400).json({ error: 'Khoảng thời gian không hợp lệ' });
    }

    const [tenant, users, payableEntries, creditEntries, purchases, importedDebtRows] = await Promise.all([
      db.select().from(schema.tenants).where(eq(schema.tenants.id, req.user.tenantId)).get(),
      db.select().from(schema.users).where(eq(schema.users.tenantId, req.user.tenantId)).all(),
      db.select().from(schema.payableLedger).where(and(eq(schema.payableLedger.tenantId, req.user.tenantId), eq(schema.payableLedger.supplierId, supplier.id))).all(),
      db.select().from(schema.supplierCreditLedger).where(and(eq(schema.supplierCreditLedger.tenantId, req.user.tenantId), eq(schema.supplierCreditLedger.supplierId, supplier.id))).all(),
      db.select().from(schema.purchases).where(and(eq(schema.purchases.tenantId, req.user.tenantId), eq(schema.purchases.supplierId, supplier.id))).all(),
      db.select().from(schema.partnerDebtImportRows).where(and(eq(schema.partnerDebtImportRows.tenantId, req.user.tenantId), eq(schema.partnerDebtImportRows.partnerId, supplier.id), eq(schema.partnerDebtImportRows.entityType, 'supplier_debt'))).all(),
    ]);
    const userNameById = new Map(users.map((user) => [user.id, user.name]));
    const purchaseById = new Map<string, any>((purchases as any[]).map((purchase) => [purchase.id, purchase]));

    const ledgerRows = payableEntries.map((entry: any) => {
      const purchase = entry.purchaseId ? purchaseById.get(entry.purchaseId) : null;
      const increase = entry.type === 'increase';
      return {
        id: `payable:${entry.id}`,
        rowType: 'payable_ledger',
        createdAt: entry.createdAt,
        documentNo: purchase?.documentNo || `CN-${entry.id.slice(0, 8).toUpperCase()}`,
        description: increase ? 'Nhập hàng / tăng công nợ' : 'Thanh toán nhà cung cấp',
        unitName: '',
        quantity: null,
        unitPrice: null,
        total: Number(entry.amount || 0),
        debit: increase ? Number(entry.amount || 0) : 0,
        credit: increase ? 0 : Number(entry.amount || 0),
        note: entry.note || '',
        createdBy: entry.createdBy,
        createdByName: userNameById.get(entry.createdBy) || entry.createdBy || null,
        items: [],
      };
    });

    const creditRows = creditEntries.map((entry: any) => {
      let debit = 0;
      let credit = 0;
      // Supplier credit created by a return reduces payable; settling that
      // credit is shown as a separate debit-side movement.
      if (entry.type === 'increase') credit = Number(entry.amount || 0);
      else debit = Number(entry.amount || 0);
      return {
        id: `supplier-credit:${entry.id}`,
        rowType: 'supplier_credit',
        createdAt: entry.createdAt,
        documentNo: `CN-${entry.id.slice(0, 8).toUpperCase()}`,
        description: entry.type === 'increase' ? 'Trả hàng / được nhận lại từ nhà cung cấp' : 'Đã nhận tiền hoàn từ nhà cung cấp',
        unitName: '',
        quantity: null,
        unitPrice: null,
        total: Number(entry.amount || 0),
        debit,
        credit,
        note: entry.note || '',
        createdBy: entry.createdBy,
        createdByName: userNameById.get(entry.createdBy) || entry.createdBy || null,
        items: [],
      };
    });

    const importedRows = importedDebtRows.map((entry: any) => {
      let items: any[] = [];
      try { items = JSON.parse(entry.detailsJson || '[]'); } catch { items = []; }
      return {
        id: `imported:${entry.id}`,
        rowType: 'imported_debt',
        createdAt: entry.occurredAt || entry.createdAt,
        documentNo: entry.documentNo || `CN-${entry.id.slice(0, 8).toUpperCase()}`,
        description: entry.description || 'Công nợ import',
        unitName: entry.unit || '',
        quantity: entry.quantity,
        unitPrice: entry.unitPrice,
        total: Number(entry.amount || 0),
        debit: Number(entry.debit || 0),
        credit: Number(entry.credit || 0),
        note: entry.note || '',
        createdBy: entry.createdBy,
        createdByName: userNameById.get(entry.createdBy) || entry.createdBy || null,
        items,
      };
    });

    const movementRows = [...ledgerRows, ...creditRows, ...importedRows];
    const currentPayable = Number(supplier.currentPayable || 0);
    const movementPayable = movementRows.reduce((sum, row) => sum + Number(row.debit || 0) - Number(row.credit || 0), 0);
    const reconciliationAdjustment = currentPayable - movementPayable;
    if (Math.abs(reconciliationAdjustment) > 0.01) {
      movementRows.push({
        id: `opening:${supplier.id}`,
        rowType: 'opening',
        createdAt: tenant?.createdAt || new Date().toISOString(),
        documentNo: `DC-${supplier.id}`,
        description: 'Số dư chuyển đổi',
        unitName: '',
        quantity: null,
        unitPrice: null,
        total: Math.abs(reconciliationAdjustment),
        debit: reconciliationAdjustment > 0 ? reconciliationAdjustment : 0,
        credit: reconciliationAdjustment < 0 ? Math.abs(reconciliationAdjustment) : 0,
        note: 'Điều chỉnh đối soát để khớp số dư công nợ hiện tại của hệ thống',
        createdBy: null,
        createdByName: 'Hệ thống',
        items: [],
      });
    }

    const allRows = movementRows.sort((a, b) => {
      const timeDiff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (timeDiff !== 0) return timeDiff;
      return a.rowType === 'opening' ? -1 : 1;
    });
    const inRange = (row: any) => {
      const timestamp = new Date(row.createdAt).getTime();
      return timestamp >= (fromMs as number) && timestamp <= (toMs as number);
    };
    const signed = (row: any) => Number(row.debit || 0) - Number(row.credit || 0);
    const openingPayable = Math.max(0, allRows.filter((row) => new Date(row.createdAt).getTime() < (fromMs as number)).reduce((sum, row) => sum + signed(row), 0));
    const rows = allRows.filter(inRange);
    const periodDebit = rows.reduce((sum, row) => sum + Number(row.debit || 0), 0);
    const periodCredit = rows.reduce((sum, row) => sum + Number(row.credit || 0), 0);

    res.json({
      from: req.query.from || null,
      to: req.query.to || null,
      tenant: tenant ? { name: tenant.name, legalName: tenant.legalName || '', address: tenant.address, phone: tenant.phone, taxInfo: tenant.taxInfo || '' } : null,
      supplier,
      openingPayable,
      periodDebit,
      periodCredit,
      closingPayable: Math.max(0, openingPayable + periodDebit - periodCredit),
      currentPayable,
      rows,
    });
  } catch (err) {
    console.error('GET /api/suppliers/:id/debt-statement error:', err);
    res.status(500).json({ error: 'Không thể tải chi tiết công nợ nhà cung cấp' });
  }
});

// ═══════════════════════════════════════════════════════════
// CUSTOMERS
// ═══════════════════════════════════════════════════════════

app.get('/api/customers', async (req, res) => {
  try {
    if (!ensureAnyPermission(req, res, ['partners.view', 'sales.view', 'sales.create'])) return;
    const { search } = req.query;
    const includeMeta = String(req.query.includeMeta || '') === 'true';
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const tenantUsers = await db.select().from(schema.users)
      .where(eq(schema.users.tenantId, req.user.tenantId)).all();
    const userNameById = new Map(tenantUsers.map((u) => [u.id, u.name]));
    const conditions = [eq(schema.customers.tenantId, req.user.tenantId)];
    const searchStr = normalizeSearchText(search);
    if (searchStr) {
      const term = `%${searchStr}%`;
      conditions.push(or(
        sql`lower(${schema.customers.code}) like ${term}`,
        sql`lower(${schema.customers.name}) like ${term}`,
        sql`lower(${schema.customers.phone}) like ${term}`,
        sql`lower(${schema.customers.address}) like ${term}`,
        sql`lower(coalesce(${schema.customers.email}, '')) like ${term}`,
        sql`lower(coalesce(${schema.customers.sourceCode}, '')) like ${term}`,
      ) as any);
    }
    const whereClause = and(...conditions);
    const totalRow = includeMeta
      ? await db.select({ count: sql<number>`count(*)` }).from(schema.customers).where(whereClause).get()
      : null;
    const allCustomers = await db.select().from(schema.customers)
      .where(whereClause)
      .orderBy(schema.customers.name, schema.customers.id)
      .limit(includeMeta ? limit : 5000)
      .offset(includeMeta ? offset : 0)
      .all();
    const items = allCustomers.map((customer) => ({
        ...customer,
        tags: customer.tags ? JSON.parse(customer.tags) : [],
        createdByName: customer.createdBy ? userNameById.get(customer.createdBy) || null : null,
      }));
    res.json(includeMeta
      ? { items, total: Number(totalRow?.count || 0), offset, limit }
      : items);
  } catch (err) {
    console.error('GET /api/customers error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/customers/:id', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'partners.view')) return;
    const tenantUsers = await db.select().from(schema.users)
      .where(eq(schema.users.tenantId, req.user.tenantId)).all();
    const userNameById = new Map(tenantUsers.map((u) => [u.id, u.name]));
    const customer = await db.select().from(schema.customers)
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

// Customer debt statement used by the detailed Excel export.  The statement
// keeps the invoice as the business document and the debt ledger as the
// settlement/adjustment trail, so the same invoice-linked increase is not
// counted twice.
app.get('/api/customers/:id/debt-statement', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'debt.view')) return;
    const customer = await db.select().from(schema.customers)
      .where(and(eq(schema.customers.id, req.params.id), eq(schema.customers.tenantId, req.user.tenantId))).get();
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const parseBoundary = (value: unknown, endOfDay: boolean) => {
      if (!value) return endOfDay ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
      const raw = String(value).trim();
      const parsed = new Date(`${raw}T${endOfDay ? '23:59:59.999' : '00:00:00'}`).getTime();
      return Number.isFinite(parsed) ? parsed : null;
    };
    const fromMs = parseBoundary(req.query.from, false);
    const toMs = parseBoundary(req.query.to, true);
    if (fromMs === null || toMs === null || fromMs > toMs) {
      return res.status(400).json({ error: 'Khoảng thời gian không hợp lệ' });
    }

    const tenant = await db.select().from(schema.tenants).where(eq(schema.tenants.id, req.user.tenantId)).get();
    const users = await db.select().from(schema.users).where(eq(schema.users.tenantId, req.user.tenantId)).all();
    const userNameById = new Map(users.map((user) => [user.id, user.name]));
    const invoices = (await db.select().from(schema.invoices)
      .where(and(eq(schema.invoices.tenantId, req.user.tenantId), eq(schema.invoices.customerId, customer.id)))
      .all() as any[]).filter((invoice) => invoice.workflowStatus !== 'cancelled');
    const invoiceIds = invoices.map((invoice) => invoice.id);
    const invoiceItems = invoiceIds.length
      ? await db.select().from(schema.invoiceItems).where(inArray(schema.invoiceItems.invoiceId, invoiceIds)).all()
      : [];
    const productIds = Array.from(new Set((invoiceItems as any[]).map((item: any) => item.productId).filter(Boolean))) as string[];
    const products = productIds.length
      ? await db.select().from(schema.products).where(and(eq(schema.products.tenantId, req.user.tenantId), inArray(schema.products.id, productIds))).all() as any[]
      : [];
    const productById = new Map(products.map((product) => [product.id, product]));
    const itemsByInvoice = new Map<string, any[]>();
    invoiceItems.forEach((item) => {
      const product = productById.get(item.productId);
      const row = {
        ...item,
        sku: product?.sku || item.productId,
        barcode: product?.barcode || null,
        unitName: item.unitName || product?.unit || '',
      };
      const rows = itemsByInvoice.get(item.invoiceId) || [];
      rows.push(row);
      itemsByInvoice.set(item.invoiceId, rows);
    });

    const ledgerEntries = await db.select().from(schema.debtLedger)
      .where(and(eq(schema.debtLedger.tenantId, req.user.tenantId), eq(schema.debtLedger.customerId, customer.id)))
      .all();
    const importedDebtRows = await db.select().from(schema.partnerDebtImportRows)
      .where(and(eq(schema.partnerDebtImportRows.tenantId, req.user.tenantId), eq(schema.partnerDebtImportRows.partnerId, customer.id), eq(schema.partnerDebtImportRows.entityType, 'customer_debt')))
      .all();
    const increaseByInvoice = new Map<string, number>();
    ledgerEntries.forEach((entry) => {
      if (entry.invoiceId && entry.type === 'increase') {
        increaseByInvoice.set(entry.invoiceId, (increaseByInvoice.get(entry.invoiceId) || 0) + Number(entry.amount || 0));
      }
    });

    const invoiceRows = invoices.map((invoice) => {
      // debtAmount is the debt created at checkout. The ledger fallback keeps
      // legacy invoices visible when they were posted before this field was
      // populated consistently.
      const debit = Math.max(Number(invoice.debtAmount || 0), increaseByInvoice.get(invoice.id) || 0);
      return {
        id: `invoice:${invoice.id}`,
        rowType: 'invoice',
        createdAt: invoice.createdAt,
        documentNo: invoice.documentNo || invoice.id,
        description: 'Bán hàng',
        unitName: '',
        quantity: null,
        unitPrice: null,
        total: Number(invoice.finalAmount || 0),
        debit,
        credit: 0,
        note: invoice.note || '',
        invoiceNote: invoice.note || '',
        createdBy: invoice.createdBy,
        createdByName: userNameById.get(invoice.createdBy) || invoice.createdBy || null,
        items: itemsByInvoice.get(invoice.id) || [],
      };
    });

    const ledgerRows = ledgerEntries
      // The increase generated by a sales invoice is represented by the
      // invoice row above. Keep linked decreases as separate audit rows.
      .filter((entry) => !(entry.invoiceId && entry.type === 'increase'))
      .map((entry) => {
        const invoice = entry.invoiceId ? invoices.find((item) => item.id === entry.invoiceId) : null;
        const isReturn = /trả hàng|hoàn tiền/i.test(entry.note || '');
        return {
          id: `ledger:${entry.id}`,
          rowType: 'ledger',
          createdAt: entry.createdAt,
          documentNo: invoice?.documentNo || `CN-${entry.id.slice(0, 8).toUpperCase()}`,
          description: isReturn ? 'Khách trả hàng' : entry.type === 'increase' ? 'Điều chỉnh tăng công nợ' : 'Thu công nợ',
          unitName: '',
          quantity: null,
          unitPrice: null,
          total: Number(entry.amount || 0),
          debit: entry.type === 'increase' ? Number(entry.amount || 0) : 0,
          credit: entry.type === 'decrease' ? Number(entry.amount || 0) : 0,
          note: entry.note || '',
          invoiceNote: invoice?.note || '',
          createdBy: entry.createdBy,
          createdByName: userNameById.get(entry.createdBy) || entry.createdBy || null,
          items: [],
        };
      });

    const importedRows = importedDebtRows.map((entry: any) => {
      let items: any[] = [];
      try { items = JSON.parse(entry.detailsJson || '[]'); } catch { items = []; }
      return {
        id: `imported:${entry.id}`,
        rowType: 'imported_debt',
        createdAt: entry.occurredAt || entry.createdAt,
        documentNo: entry.documentNo || `CN-${entry.id.slice(0, 8).toUpperCase()}`,
        description: entry.description || 'Công nợ import',
        unitName: entry.unit || '',
        quantity: entry.quantity,
        unitPrice: entry.unitPrice,
        total: Number(entry.amount || 0),
        debit: Number(entry.debit || 0),
        credit: Number(entry.credit || 0),
        note: entry.note || '',
        invoiceNote: '',
        createdBy: entry.createdBy,
        createdByName: userNameById.get(entry.createdBy) || entry.createdBy || null,
        items,
      };
    });

    const movementRows = [...invoiceRows, ...ledgerRows, ...importedRows];
    const currentDebt = Number(customer.totalDebt || 0);
    const movementDebt = movementRows.reduce((sum, row) => sum + Number(row.debit || 0) - Number(row.credit || 0), 0);
    const reconciliationAdjustment = currentDebt - movementDebt;
    if (Math.abs(reconciliationAdjustment) > 0.01) {
      movementRows.push({
        id: `opening:${customer.id}`,
        rowType: 'opening',
        createdAt: tenant?.createdAt || new Date().toISOString(),
        documentNo: `DC-${customer.id}`,
        description: 'Số dư chuyển đổi',
        unitName: '',
        quantity: null,
        unitPrice: null,
        total: Math.abs(reconciliationAdjustment),
        debit: reconciliationAdjustment > 0 ? reconciliationAdjustment : 0,
        credit: reconciliationAdjustment < 0 ? Math.abs(reconciliationAdjustment) : 0,
        note: 'Điều chỉnh đối soát để khớp số dư công nợ hiện tại của hệ thống',
        invoiceNote: '',
        createdBy: null,
        createdByName: 'Hệ thống',
        items: [],
      });
    }

    const allRows = movementRows.sort((a, b) => {
      const timeDiff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (timeDiff !== 0) return timeDiff;
      return a.rowType === 'invoice' ? -1 : 1;
    });
    const inRange = (row: any) => {
      const timestamp = new Date(row.createdAt).getTime();
      return timestamp >= (fromMs as number) && timestamp <= (toMs as number);
    };
    const signed = (row: any) => Number(row.debit || 0) - Number(row.credit || 0);
    const openingDebt = Math.max(0, allRows.filter((row) => new Date(row.createdAt).getTime() < (fromMs as number)).reduce((sum, row) => sum + signed(row), 0));
    const rows = allRows.filter(inRange);
    const periodDebit = rows.reduce((sum, row) => sum + Number(row.debit || 0), 0);
    const periodCredit = rows.reduce((sum, row) => sum + Number(row.credit || 0), 0);

    res.json({
      from: req.query.from || null,
      to: req.query.to || null,
      tenant: tenant ? {
        name: tenant.name,
        legalName: tenant.legalName || '',
        address: tenant.address,
        phone: tenant.phone,
        taxInfo: tenant.taxInfo || '',
      } : null,
      customer: {
        ...customer,
        tags: customer.tags ? JSON.parse(customer.tags) : [],
      },
      openingDebt,
      periodDebit,
      periodCredit,
      closingDebt: Math.max(0, openingDebt + periodDebit - periodCredit),
      currentDebt,
      rows,
    });
  } catch (err) {
    console.error('GET /api/customers/:id/debt-statement error:', err);
    res.status(500).json({ error: 'Không thể tải chi tiết công nợ khách hàng' });
  }
});

const pickCustomerFields = (body: any, requireName = false) => {
  const result: Record<string, unknown> = {};
  for (const field of ['code', 'name', 'phone', 'address', 'taxCode', 'companyName', 'invoiceAddress', 'shippingAddress', 'creditLimit', 'paymentDays', 'allowDebt', 'contactName', 'note', 'active', 'type']) {
    if (body?.[field] !== undefined) result[field] = body[field];
  }
  if (requireName && (!result.name || !String(result.name).trim())) throw new Error('Tên khách hàng là bắt buộc.');
  for (const field of ['creditLimit', 'paymentDays']) {
    if (result[field] !== undefined) {
      const value = Number(result[field]);
      if (!Number.isFinite(value) || value < 0) throw new Error(`Trường ${field} không hợp lệ.`);
      result[field] = value;
    }
  }
  if (result.allowDebt !== undefined) result.allowDebt = Boolean(result.allowDebt);
  if (result.active !== undefined) result.active = Boolean(result.active);
  if (result.type !== undefined && result.type !== 'retail' && result.type !== 'loyal') throw new Error('Loại khách hàng không hợp lệ.');
  if (result.tags !== undefined) delete result.tags;
  return result;
};

app.post('/api/customers', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'partners.create')) return;
    const fields = pickCustomerFields(req.body, true);
    const customer: any = {
      id: uuid(),
      name: String(fields.name),
      phone: String(fields.phone || ''),
      address: String(fields.address || ''),
      code: String(req.body?.code || await nextCustomerCode(req.user.tenantId)),
      totalDebt: 0,
      note: '',
      active: true,
      allowDebt: true,
      creditLimit: 0,
      paymentDays: 0,
      ...fields,
      tags: JSON.stringify(Array.isArray(req.body?.tags) ? req.body.tags : []),
      tenantId: req.user.tenantId,
      createdBy: req.user.id
    };
    await db.insert(schema.customers).values(customer).run();
    const creator = await db.select().from(schema.users).where(eq(schema.users.id, req.user.id)).get();
    res.status(201).json({ ...customer, tags: customer.tags ? JSON.parse(customer.tags) : [], createdByName: creator?.name || null });
  } catch (err) {
    console.error('POST /api/customers error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.patch('/api/customers/:id', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'partners.update')) return;
    const customer = await db.select().from(schema.customers)
      .where(and(eq(schema.customers.id, req.params.id), eq(schema.customers.tenantId, req.user.tenantId))).get();
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    const patchData: any = pickCustomerFields(req.body);
    delete patchData.code;
    const tags = req.body?.tags;
    if (tags !== undefined) {
      patchData.tags = JSON.stringify(Array.isArray(tags) ? tags : []);
    }
    if (!Object.keys(patchData).length) return res.status(400).json({ error: 'Không có trường hợp lệ để cập nhật.' });
    await db.update(schema.customers).set(patchData).where(eq(schema.customers.id, req.params.id)).run();
    const updated = await db.select().from(schema.customers).where(eq(schema.customers.id, req.params.id)).get();
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
app.get('/api/customer-care-logs', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'partners.view')) return;
    const { customerId } = req.query;
    const tenantUsers = await db.select().from(schema.users)
      .where(eq(schema.users.tenantId, req.user.tenantId)).all();
    const userNameById = new Map(tenantUsers.map((u) => [u.id, u.name]));

    let rows = await db.select().from(schema.customerCareLogs)
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

app.post('/api/customer-care-logs', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'partners.update')) return;
    const payload = req.body || {};
    const customer = await db.select().from(schema.customers)
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
    await db.insert(schema.customerCareLogs).values(entry).run();
    const creator = await db.select().from(schema.users).where(eq(schema.users.id, req.user.id)).get();
    res.status(201).json({ ...entry, createdByName: creator?.name || null });
  } catch (err) {
    console.error('POST /api/customer-care-logs error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.patch('/api/customer-care-logs/:id', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'partners.update')) return;
    const log = await db.select().from(schema.customerCareLogs)
      .where(and(eq(schema.customerCareLogs.id, req.params.id), eq(schema.customerCareLogs.tenantId, req.user.tenantId))).get();
    if (!log) return res.status(404).json({ error: 'Care log not found' });
    const updates: any = {};
    if (req.body?.status) updates.status = req.body.status;
    if (typeof req.body?.responded === 'boolean') updates.responded = req.body.responded;
    if (typeof req.body?.note === 'string') updates.note = req.body.note;
    await db.update(schema.customerCareLogs).set(updates).where(eq(schema.customerCareLogs.id, req.params.id)).run();
    const updated = await db.select().from(schema.customerCareLogs).where(eq(schema.customerCareLogs.id, req.params.id)).get();
    if (!updated) return res.status(404).json({ error: 'Care log not found' });
    const creator = await db.select().from(schema.users).where(eq(schema.users.id, updated.createdBy)).get();
    res.json({ ...updated, createdByName: creator?.name || null });
  } catch (err) {
    console.error('PATCH /api/customer-care-logs/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Customer debt adjustment
app.post('/api/customers/:id/debt', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'debt.collect')) return;
    const amount = Number(req.body?.amount);
    const type = req.body?.type; // type: 'increase' | 'decrease'
    if (!Number.isFinite(amount) || amount <= 0 || !['increase', 'decrease'].includes(type)) return res.status(400).json({ error: 'Số tiền hoặc loại điều chỉnh không hợp lệ.' });
    const customer = await db.select().from(schema.customers)
      .where(and(eq(schema.customers.id, req.params.id), eq(schema.customers.tenantId, req.user.tenantId))).get();
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const newDebt = type === 'increase'
      ? customer.totalDebt + amount
      : Math.max(0, customer.totalDebt - amount);

    await db.transaction(async (tx) => {
      await tx.update(schema.customers)
        .set({ totalDebt: newDebt })
        .where(and(eq(schema.customers.id, req.params.id), eq(schema.customers.tenantId, req.user.tenantId)))
        .run();
      await tx.insert(schema.debtLedger).values({
        id: uuid(),
        tenantId: req.user.tenantId,
        customerId: customer.id,
        invoiceId: null,
        amount,
        type,
        note: String(req.body?.note || 'Điều chỉnh công nợ').trim().slice(0, 500),
        createdAt: new Date().toISOString(),
        createdBy: req.user.id,
      }).run();
    });

    const updated = await db.select().from(schema.customers).where(eq(schema.customers.id, req.params.id)).get();
    res.json(updated);
  } catch (err) {
    console.error('POST /api/customers/:id/debt error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════
// INVOICES
// ═══════════════════════════════════════════════════════════

const priceListForCustomer = async (tenantId: string, customerType?: string, requestedId?: string) => {
  if (requestedId) {
    const requested = await db.select().from(schema.priceLists).where(and(eq(schema.priceLists.id, requestedId), eq(schema.priceLists.tenantId, tenantId), eq(schema.priceLists.active, true))).get();
    if (requested) return requested;
  }
  const normalizedCustomerType = String(customerType || 'all').trim() || 'all';
  const matching = await db.select().from(schema.priceLists).where(and(eq(schema.priceLists.tenantId, tenantId), eq(schema.priceLists.customerType, normalizedCustomerType), eq(schema.priceLists.active, true))).all();
  return matching.find((list) => list.customerType === normalizedCustomerType && normalizedCustomerType !== 'all') || matching.find((list) => list.isDefault) || await ensureDefaultPriceList(tenantId);
};

const priceForProduct = async (tenantId: string, product: any, unitName?: string, unitFactor = 1, requestedPriceListId?: string, customerType?: string, seen = new Set<string>()): Promise<{ price: number; priceList: any }> => {
  const priceList = await priceListForCustomer(tenantId, customerType, requestedPriceListId);
  const resolvedUnit = await unitForProduct(tenantId, product, unitName, unitFactor);
  const configuredPrice = priceList
    ? await db.select().from(schema.priceListItems).where(and(eq(schema.priceListItems.priceListId, priceList.id), eq(schema.priceListItems.productId, product.id), eq(schema.priceListItems.unitName, resolvedUnit.name))).get()
    : null;
  // A combo can have its own price in a price list. Fall back to the sum of
  // component prices only when no explicit combo price has been configured.
  if (configuredPrice) return { price: Number(configuredPrice.price), priceList };
  if (product.productType === 'combo') {
    if (seen.has(product.id)) throw new Error('Combo chứa vòng lặp thành phần');
    const components = await productComponentsFor(tenantId, product.id);
    if (!components.length) throw new Error(`Combo ${product.name} chưa có thành phần`);
    const componentPrices = await Promise.all(components.map(async (component) => {
      const componentProduct = await db.select().from(schema.products).where(eq(schema.products.id, component.componentProductId)).get();
      if (!componentProduct) return 0;
      const resolved = await priceForProduct(tenantId, componentProduct, componentProduct.unit, 1, priceList?.id, customerType, new Set([...seen, product.id]));
      return Number(component.quantity) * resolved.price;
    }));
    const price = componentPrices.reduce((sum, value) => sum + value, 0) * unitFactor;
    return { price, priceList };
  }
  const baseItem = priceList ? await db.select().from(schema.priceListItems).where(and(eq(schema.priceListItems.priceListId, priceList.id), eq(schema.priceListItems.productId, product.id), eq(schema.priceListItems.unitName, product.unit))).get() : null;
  const basePrice = baseItem ? Number(baseItem.price) : Number(product.sellingPrice);
  const markupMode = priceList?.markupMode === 'amount' ? 'amount' : 'percent';
  const markupValue = markupMode === 'amount'
    ? Number(priceList?.markupValue) || 0
    : Number(priceList?.markupValue) || Number(priceList?.markupPercent) || 0;
  const adjustedBasePrice = baseItem || !priceList
    ? basePrice
    : markupMode === 'amount'
      ? Math.max(0, basePrice + markupValue)
      : Math.max(0, basePrice * (1 + markupValue / 100));
  return { price: adjustedBasePrice * resolvedUnit.factor, priceList };
};

app.get('/api/invoices', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'sales.view')) return;
    await autoCloseLegacyInvoices(req);
    const { customerId, status } = req.query;
    const includeMeta = String(req.query.includeMeta || '') === 'true';
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const tenantUsers = await db.select().from(schema.users)
      .where(eq(schema.users.tenantId, req.user.tenantId)).all();
    const userNameById = new Map(tenantUsers.map((u) => [u.id, u.name]));
    const conditions = [eq(schema.invoices.tenantId, req.user.tenantId)];
    if (!canViewAllTransactions(req)) conditions.push(eq(schema.invoices.createdBy, req.user.id) as any);
    if (customerId) conditions.push(eq(schema.invoices.customerId, String(customerId)) as any);
    if (status && status !== 'all') {
      const invoiceStatus = String(status) as 'partial' | 'unpaid' | 'completed';
      conditions.push(eq(schema.invoices.status, invoiceStatus) as any);
    }
    const whereClause = and(...conditions);
    const totalRow = includeMeta
      ? await db.select({ count: sql<number>`count(*)` }).from(schema.invoices).where(whereClause).get()
      : null;
    const allInvoices = await db.select().from(schema.invoices)
      .where(whereClause)
      .orderBy(desc(schema.invoices.createdAt), desc(schema.invoices.id))
      .limit(includeMeta ? limit : 5000)
      .offset(includeMeta ? offset : 0)
      .all();
    const items = allInvoices.map((invoice) => ({
        ...invoice,
        createdByName: userNameById.get(invoice.createdBy) || null,
      }));
    res.json(includeMeta
      ? { items, total: Number(totalRow?.count || 0), offset, limit }
      : items);
  } catch (err) {
    console.error('GET /api/invoices error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/invoices/:id', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'sales.view')) return;
    await autoCloseLegacyInvoices(req);
    const tenantUsers = await db.select().from(schema.users)
      .where(eq(schema.users.tenantId, req.user.tenantId)).all();
    const userNameById = new Map(tenantUsers.map((u) => [u.id, u.name]));
    const invoice = await db.select().from(schema.invoices)
      .where(and(eq(schema.invoices.id, req.params.id), eq(schema.invoices.tenantId, req.user.tenantId))).get();
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (!canViewTransaction(req, invoice)) return res.status(404).json({ error: 'Invoice not found' });

    // Also fetch invoice items
    const items = await db.select().from(schema.invoiceItems).where(eq(schema.invoiceItems.invoiceId, req.params.id)).all();

    res.json({ ...invoice, createdByName: userNameById.get(invoice.createdBy) || null, items });
  } catch (err) {
    console.error('GET /api/invoices/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/invoices', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'sales.create')) return;
    const { items, ...invoiceData } = req.body;
    const invoiceId = uuid();
    const documentNo = await nextDocumentNo(req.user.tenantId, 'sale', 'HD');
    // A sale is posted at checkout. Keep the review/picking workflow for
    // legacy records only; new POS invoices must immediately affect stock,
    // cashbook, debt and reports.
    const workflowStatus = 'closed' as const;
    const customer = invoiceData.customerId ? await db.select().from(schema.customers).where(and(eq(schema.customers.id, invoiceData.customerId), eq(schema.customers.tenantId, req.user.tenantId))).get() : null;
    if (invoiceData.customerId && !customer) return res.status(400).json({ error: 'Khách hàng không tồn tại' });
    const paymentMethodValue = String(invoiceData.paymentMethod || 'cash');
    if (!['cash', 'transfer', 'wallet', 'debt'].includes(paymentMethodValue)) return res.status(400).json({ error: 'Phương thức thanh toán không hợp lệ.' });
    const paymentMethod = paymentMethodValue as 'cash' | 'transfer' | 'wallet' | 'debt';
    const normalizedItems = Array.isArray(items) ? await Promise.all(items.map(async (raw: any) => {
      const product = await db.select().from(schema.products).where(and(eq(schema.products.id, raw.productId), eq(schema.products.tenantId, req.user.tenantId), eq(schema.products.status, 'active'))).get();
      if (!product) throw new Error(`Không tìm thấy sản phẩm: ${raw.productId}`);
      const quantity = Number(raw.quantity) || 0;
      if (quantity <= 0 || quantity > 1_000_000) throw new Error(`Số lượng không hợp lệ cho ${product.name}`);
      const unit = await unitForProduct(req.user.tenantId, product, raw.unitName || raw.unit, raw.unitFactor);
      const resolved = await priceForProduct(req.user.tenantId, product, unit.name, unit.factor, raw.priceListId, customer?.type);
      const requestedPrice = raw.price !== undefined && raw.price !== null && raw.price !== '' ? Number(raw.price) : resolved.price;
      const priceOverride = Boolean(raw.priceOverride);
      if (!Number.isFinite(requestedPrice) || requestedPrice < 0) throw new Error(`Giá bán không hợp lệ cho ${product.name}`);
      if (priceOverride && !hasPermission(req, 'sales.override_price')) throw new Error('Bạn không có quyền sửa giá bán');
      const price = priceOverride ? requestedPrice : resolved.price;
      const discountMode = raw.discountMode === 'amount' ? 'amount' : 'percent';
      const discountPercent = Math.min(100, Math.max(0, Number(raw.discountPercent) || 0));
      const lineSubtotal = quantity * price;
      const discountAmount = Math.max(0, Number(raw.discountAmount) || 0);
      const lineDiscount = discountMode === 'amount'
        ? Math.min(lineSubtotal, discountAmount)
        : lineSubtotal * discountPercent / 100;
      const total = Math.max(0, lineSubtotal - lineDiscount);
      return {
        ...raw,
        product,
        quantity,
        unitName: unit.name,
        unitFactor: unit.factor,
        baseQuantity: quantity * unit.factor,
        price,
        discountMode,
        discountPercent,
        discountAmount: discountMode === 'amount' ? lineDiscount : 0,
        taxRate: Number(product.taxRate || raw.taxRate || 0),
        total,
        priceListId: resolved.priceList?.id || null,
        priceListName: resolved.priceList?.name || null,
      };
    })) : [];
    if (!normalizedItems.length) return res.status(400).json({ error: 'Đơn hàng phải có ít nhất một mặt hàng.' });
    const totalAmount = normalizedItems.reduce((sum: number, item: any) => sum + Number(item.total || 0), 0);
    const requestedDiscount = Math.max(0, Number(invoiceData.discount) || 0);
    const discount = Math.min(totalAmount, requestedDiscount);
    const taxAmount = normalizedItems.reduce((sum: number, item: any) => sum + Number(item.total || 0) * Math.max(0, Number(item.taxRate || 0)) / 100, 0);
    const finalAmount = Math.max(0, totalAmount - discount + taxAmount);
    const paidAmount = Math.max(0, Number(invoiceData.paidAmount) || 0);
    const previousDebtAmount = customer
      ? Math.max(0, Number(customer.totalDebt) || 0)
      : 0;
    const amountAppliedToInvoice = Math.min(finalAmount, paidAmount);
    const debtAmount = Math.max(0, finalAmount - amountAppliedToInvoice);
    const debtReduction = Math.min(previousDebtAmount, Math.max(0, paidAmount - finalAmount));
    const changeAmount = Math.max(0, paidAmount - finalAmount - previousDebtAmount);
    const paymentStatus = debtAmount <= 0 ? 'paid' as const : paidAmount > 0 ? 'partial' as const : 'unpaid' as const;
    const note = String(invoiceData.note || '').trim().slice(0, 2000);
    const invoice = {
      id: invoiceId,
      documentNo,
      tenantId: req.user.tenantId,
      customerId: customer?.id || null,
      createdBy: req.user.id,
      totalAmount,
      discount,
      taxAmount,
      finalAmount,
      paidAmount,
      paymentMethod,
      note,
      createdAt: new Date().toISOString(),
      workflowStatus,
      paymentStatus,
      previousDebtAmount,
      debtAmount,
      changeAmount,
      status: paymentStatus === 'paid' ? 'completed' as const : paymentStatus === 'partial' ? 'partial' as const : 'unpaid' as const,
      accountId: paidAmount > 0 ? await resolvePaymentAccount(req.user.tenantId, paymentMethod, invoiceData.accountId) : null,
      version: 1,
    };

    if (invoice.debtAmount > 0 && invoice.customerId) {
      if (!customer) return res.status(400).json({ error: 'Khách hàng không tồn tại' });
      if (customer.allowDebt === false) return res.status(409).json({ error: 'Khách hàng đang bị khóa bán nợ' });
      const projectedDebt = Math.max(0, Number(customer.totalDebt) - debtReduction) + Number(invoice.debtAmount);
      if (Number(customer.creditLimit) > 0 && projectedDebt > Number(customer.creditLimit)) {
        return res.status(409).json({ error: 'Bill vượt hạn mức công nợ khách hàng' });
      }
    }

    await db.transaction(async () => {
      await db.insert(schema.invoices).values(invoice).run();

    // Insert invoice items
    const stockRequirements = new Map<string, number>();
    if (normalizedItems.length > 0) {
      for (const item of normalizedItems) {
        const quantity = Number(item.quantity) || 0;
        if (quantity <= 0) continue;
        const requirements = await expandStockRequirements(req.user.tenantId, item.productId, Number(item.baseQuantity));
        for (const requirement of requirements) stockRequirements.set(requirement.productId, (stockRequirements.get(requirement.productId) || 0) + requirement.quantity);
        for (const requirement of requirements) {
          const product = await db.select().from(schema.products).where(and(eq(schema.products.id, requirement.productId), eq(schema.products.tenantId, req.user.tenantId))).get();
          if (product?.trackStock && Number(product.stock) - await reservedBaseStock(req.user.tenantId, product.id) < requirement.quantity) {
            throw new BusinessError(409, `Không đủ tồn khả dụng cho ${product.name}`);
          }
        }
      }
      const itemsWithIds = normalizedItems.map((item: any) => {
        return {
          id: uuid(),
          invoiceId,
          productId: item.product.id,
          productName: item.product.name,
          quantity: item.quantity,
          price: item.price,
          taxRate: item.taxRate,
          total: item.total,
          orderedQuantity: item.quantity,
          pickedQuantity: 0,
          confirmedQuantity: 0,
          lineStatus: 'ordered',
          note: String(item.note || '').trim().slice(0, 1000),
          unitName: item.unitName,
          unitFactor: item.unitFactor,
          baseQuantity: item.baseQuantity,
          priceListId: item.priceListId,
          priceListName: item.priceListName,
        };
      });
      await db.insert(schema.invoiceItems).values(itemsWithIds).run();
    }

    // Draft bills reserve availability without posting the final stock-out.
    if (workflowStatus !== 'closed' && normalizedItems.length > 0) {
      for (const [productId, quantity] of stockRequirements.entries()) {
        if (quantity > 0) {
          await db.insert(schema.stockReservations).values({
            id: uuid(), tenantId: req.user.tenantId, invoiceId, productId,
            quantity, status: 'reserved', createdAt: invoice.createdAt,
          }).run();
        }
      }
    }

    // Legacy POS requests send a payment status and are posted immediately.
    if (workflowStatus === 'closed' && normalizedItems.length > 0) {
      for (const [productId, quantity] of stockRequirements.entries()) {
        const product = await db.select().from(schema.products)
          .where(and(eq(schema.products.id, productId), eq(schema.products.tenantId, req.user.tenantId))).get();
        if (product && product.trackStock) {
          const beforeStock = product.stock;
          const afterStock = Math.max(0, product.stock - quantity);
          await db.update(schema.products)
            .set({ stock: afterStock })
            .where(eq(schema.products.id, productId))
            .run();
          await db.insert(schema.stockMovements).values({
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

    // Apply the payment to this invoice first, then use any remainder to reduce
    // the customer's previous debt balance.
    if (workflowStatus === 'closed' && invoice.customerId && (invoice.debtAmount > 0 || debtReduction > 0)) {
      const customer = await db.select().from(schema.customers)
        .where(and(eq(schema.customers.id, invoice.customerId), eq(schema.customers.tenantId, req.user.tenantId)))
        .get();
      if (customer) {
        const appliedDebtReduction = Math.min(Number(customer.totalDebt) || 0, debtReduction);
        await db.update(schema.customers)
          .set({ totalDebt: Math.max(0, Number(customer.totalDebt) - appliedDebtReduction + Number(invoice.debtAmount)) })
          .where(and(eq(schema.customers.id, invoice.customerId), eq(schema.customers.tenantId, req.user.tenantId)))
          .run();

        if (appliedDebtReduction > 0) {
          await db.insert(schema.debtLedger).values({
            id: uuid(),
            tenantId: invoice.tenantId,
            customerId: invoice.customerId,
            invoiceId: invoiceId,
            amount: appliedDebtReduction,
            type: 'decrease',
            note: `Cấn trừ công nợ cũ từ hóa đơn ${invoiceId}`,
            createdAt: invoice.createdAt,
            createdBy: invoice.createdBy,
          }).run();
        }
      }

      if (invoice.debtAmount > 0) {
        await db.insert(schema.debtLedger).values({
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
    }

    if (workflowStatus === 'closed' && (invoice.paidAmount || 0) > 0 && invoice.paymentMethod !== 'debt') {
      await db.insert(schema.cashbookEntries).values({
        id: uuid(),
        tenantId: req.user.tenantId,
        type: 'income',
        amount: Number(invoice.paidAmount) || 0,
        category: 'Bán hàng',
        note: debtReduction > 0 ? `Thu từ hóa đơn ${invoiceId}, cấn trừ công nợ cũ` : `Thu từ hóa đơn ${invoiceId}`,
        referenceId: invoiceId,
        accountId: invoice.accountId || await defaultAccountForPayment(req.user.tenantId, invoice.paymentMethod),
        createdAt: invoice.createdAt,
        createdBy: req.user.id,
      }).run();
    }

    });
    await safeNotifyTenantOwners({
      tenantId: req.user.tenantId,
      actorId: req.user.id,
      type: 'sale',
      title: 'Có giao dịch bán hàng mới',
      body: `${documentNo} · ${customer?.name || 'Khách lẻ'} · ${Number(invoice.finalAmount || 0).toLocaleString('vi-VN')} đ`,
      entityType: 'invoice',
      entityId: invoiceId,
    });
    res.status(201).json(invoice);
  } catch (err) {
    console.error('POST /api/invoices error:', err);
    if (err instanceof BusinessError) return res.status(err.statusCode).json({ error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

const invoiceById = async (tenantId: string, invoiceId: string) => await db.select().from(schema.invoices)
  .where(and(eq(schema.invoices.id, invoiceId), eq(schema.invoices.tenantId, tenantId))).get();

const writeAudit = async (req: Request, action: string, entityId: string, meta: Record<string, unknown> = {}) => {
  await db.insert(schema.auditLogs).values({
    id: uuid(), actorType: 'tenant_user', actorId: req.user.id, action,
    entityType: 'invoice', entityId, tenantId: req.user.tenantId,
    meta: JSON.stringify(meta), createdAt: new Date().toISOString(),
  }).run();
};

async function postDraftInvoice(req: Request, invoiceId: string, confirmedItems: any[]) {
  return db.transaction(async () => {
  const invoice = await invoiceById(req.user.tenantId, invoiceId);
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
    const requirements = await expandStockRequirements(req.user.tenantId, item.productId, quantity * unitFactor);
    for (const requirement of requirements) stockRequirements.set(requirement.productId, (stockRequirements.get(requirement.productId) || 0) + requirement.quantity);
    await db.update(schema.invoiceItems).set({ confirmedQuantity: quantity, pickedQuantity: Number(item.pickedQuantity ?? quantity), lineStatus: 'confirmed' }).where(eq(schema.invoiceItems.id, item.id)).run();
  }
  for (const [productId, quantity] of stockRequirements.entries()) {
    const product = await db.select().from(schema.products).where(and(eq(schema.products.id, productId), eq(schema.products.tenantId, req.user.tenantId))).get();
    if (!product || !product.trackStock) continue;
    if (Number(product.stock) < quantity) throw new Error(`Tồn kho không đủ để chốt ${product.name}`);
    const beforeStock = product.stock;
    const afterStock = Math.max(0, beforeStock - quantity);
    await db.update(schema.products).set({ stock: afterStock }).where(eq(schema.products.id, product.id)).run();
    await db.insert(schema.stockMovements).values({ id: uuid(), tenantId: req.user.tenantId, productId: product.id, type: 'out', quantity, beforeStock, afterStock, note: `Chốt bán hàng ${invoiceId}`, referenceId: invoiceId, createdAt: now, createdBy: req.user.id }).run();
  }
  const totalRatio = Number(invoice.totalAmount) > 0 ? confirmedTotal / Number(invoice.totalAmount) : 0;
  const adjustedFinalAmount = Math.max(0, Number(invoice.finalAmount) * totalRatio);
  const adjustedPaidAmount = Math.min(Number(invoice.paidAmount) || 0, adjustedFinalAmount);
  const adjustedDebtAmount = Math.max(0, adjustedFinalAmount - adjustedPaidAmount);
  const adjustedPaymentStatus = adjustedPaidAmount >= adjustedFinalAmount && adjustedFinalAmount > 0 ? 'paid' : adjustedPaidAmount > 0 ? 'partial' : 'unpaid';
  const adjustedLegacyStatus = adjustedPaymentStatus === 'paid' ? 'completed' : adjustedPaymentStatus === 'partial' ? 'partial' : 'unpaid';
  await db.update(schema.stockReservations).set({ status: 'released', releasedAt: now }).where(and(eq(schema.stockReservations.invoiceId, invoiceId), eq(schema.stockReservations.status, 'reserved'))).run();
  if (adjustedDebtAmount > 0 && invoice.customerId && !await db.select().from(schema.debtLedger).where(and(eq(schema.debtLedger.invoiceId, invoiceId), eq(schema.debtLedger.type, 'increase'))).get()) {
    const customer = await db.select().from(schema.customers).where(and(eq(schema.customers.id, invoice.customerId), eq(schema.customers.tenantId, req.user.tenantId))).get();
    if (customer) await db.update(schema.customers).set({ totalDebt: customer.totalDebt + adjustedDebtAmount }).where(eq(schema.customers.id, customer.id)).run();
    await db.insert(schema.debtLedger).values({ id: uuid(), tenantId: req.user.tenantId, customerId: invoice.customerId, invoiceId, amount: adjustedDebtAmount, type: 'increase', note: 'Mua hàng nợ', createdAt: now, createdBy: req.user.id }).run();
  }
  const resolvedAccountId = adjustedPaidAmount > 0 && invoice.paymentMethod !== 'debt'
    ? await resolvePaymentAccount(req.user.tenantId, invoice.paymentMethod, invoice.accountId)
    : null;
  if (adjustedPaidAmount > 0 && invoice.paymentMethod !== 'debt' && !await db.select().from(schema.cashbookEntries).where(eq(schema.cashbookEntries.referenceId, invoiceId)).get()) {
    await db.insert(schema.cashbookEntries).values({ id: uuid(), tenantId: req.user.tenantId, type: 'income', amount: adjustedPaidAmount, category: 'Bán hàng', note: `Thu từ hóa đơn ${invoiceId}`, referenceId: invoiceId, accountId: resolvedAccountId, createdAt: now, createdBy: req.user.id }).run();
  }
  return await db.update(schema.invoices).set({ totalAmount: confirmedTotal, finalAmount: adjustedFinalAmount, paidAmount: adjustedPaidAmount, debtAmount: adjustedDebtAmount, accountId: resolvedAccountId, status: adjustedLegacyStatus, workflowStatus: 'closed', paymentStatus: adjustedPaymentStatus, closedBy: req.user.id, closedAt: now, version: invoice.version + 1 }).where(eq(schema.invoices.id, invoiceId)).returning().get();
  });
}

async function autoCloseLegacyInvoices(req: Request) {
  const conditions = [
    eq(schema.invoices.tenantId, req.user.tenantId),
    ne(schema.invoices.workflowStatus, 'closed'),
    ne(schema.invoices.workflowStatus, 'cancelled'),
  ];
  if (!canViewAllTransactions(req)) conditions.push(eq(schema.invoices.createdBy, req.user.id) as any);
  const legacyInvoices = await db.select().from(schema.invoices).where(and(...conditions)).all();

  for (const invoice of legacyInvoices) {
    try {
      const items = await db.select().from(schema.invoiceItems).where(eq(schema.invoiceItems.invoiceId, invoice.id)).all();
      await postDraftInvoice(req, invoice.id, items);
      await writeAudit(req, 'invoice.auto_close', invoice.id, { reason: 'Bỏ luồng kiểm bill khi tải lịch sử đơn' });
    } catch (error) {
      // Keep the record available for diagnostics if an old bill cannot be
      // posted safely (for example, a later stock change made it invalid).
      console.error(`Không thể tự chốt hóa đơn cũ ${invoice.id}:`, error);
    }
  }
}

app.patch('/api/invoices/:id', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'sales.create')) return;
    const invoice = await invoiceById(req.user.tenantId, req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (invoice.workflowStatus === 'closed' || invoice.workflowStatus === 'cancelled') return res.status(409).json({ error: 'Bill đã chốt hoặc đã hủy, không thể sửa trực tiếp' });
    const nextVersion = Number(req.body?.version || invoice.version);
    if (nextVersion !== invoice.version) return res.status(409).json({ error: 'Bill đã được cập nhật bởi người khác' });
    const updates: Record<string, unknown> = {};
    if (req.body?.note !== undefined) updates.note = String(req.body.note || '').trim().slice(0, 2000);
    if (req.body?.customerId !== undefined) {
      const customerId = req.body.customerId ? String(req.body.customerId) : null;
      if (customerId) {
        const customer = await db.select({ id: schema.customers.id }).from(schema.customers).where(and(eq(schema.customers.id, customerId), eq(schema.customers.tenantId, req.user.tenantId))).get();
        if (!customer) return res.status(400).json({ error: 'Khách hàng không tồn tại' });
      }
      updates.customerId = customerId;
    }
    if (!Object.keys(updates).length) return res.status(400).json({ error: 'Không có trường chỉnh sửa hợp lệ.' });
    await db.update(schema.invoices).set({ ...updates, version: invoice.version + 1 }).where(and(eq(schema.invoices.id, invoice.id), eq(schema.invoices.version, invoice.version))).run();
    writeAudit(req, 'invoice.update', invoice.id, { fields: Object.keys(updates) });
    await safeNotifyTenantOwners({
      tenantId: req.user.tenantId,
      actorId: req.user.id,
      type: 'invoice_update',
      title: 'Hóa đơn vừa được cập nhật',
      body: `${invoice.documentNo || 'Hóa đơn'} · ${Object.keys(updates).join(', ')}`,
      entityType: 'invoice',
      entityId: invoice.id,
    });
    res.json(await invoiceById(req.user.tenantId, invoice.id));
  } catch (err) { console.error('PATCH /api/invoices/:id error:', err); res.status(500).json({ error: 'Internal server error' }); }
});

app.post('/api/invoices/:id/check', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'sales.create')) return;
    const invoice = await invoiceById(req.user.tenantId, req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (!['draft', 'checked'].includes(invoice.workflowStatus)) return res.status(409).json({ error: 'Bill không ở trạng thái có thể kiểm' });
    const now = new Date().toISOString();
    const updated = await db.update(schema.invoices).set({ workflowStatus: 'checked', checkedBy: req.user.id, checkedAt: now, version: invoice.version + 1 }).where(eq(schema.invoices.id, invoice.id)).returning().get();
    writeAudit(req, 'invoice.check', invoice.id);
    await safeNotifyTenantOwners({ tenantId: req.user.tenantId, actorId: req.user.id, type: 'invoice_update', title: 'Hóa đơn đã được kiểm', body: invoice.documentNo || 'Hóa đơn', entityType: 'invoice', entityId: invoice.id });
    res.json(updated);
  } catch (err) { console.error('POST invoice check error:', err); res.status(500).json({ error: 'Internal server error' }); }
});

app.post('/api/invoices/:id/pick', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'inventory.adjust')) return;
    const invoice = await invoiceById(req.user.tenantId, req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (!['checked', 'picking', 'ready_to_close'].includes(invoice.workflowStatus)) return res.status(409).json({ error: 'Bill chưa được kiểm' });
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const now = new Date().toISOString();
    const updated = await db.transaction(async () => {
      for (const item of items) {
        const pickedQuantity = Math.max(0, Number(item.pickedQuantity) || 0);
        await db.update(schema.invoiceItems).set({ pickedQuantity, confirmedQuantity: pickedQuantity, lineStatus: pickedQuantity > 0 ? 'picked' : 'short' }).where(and(eq(schema.invoiceItems.id, item.id), eq(schema.invoiceItems.invoiceId, invoice.id))).run();
      }
      return await db.update(schema.invoices).set({ workflowStatus: 'ready_to_close', pickedBy: req.user.id, pickedAt: now, version: invoice.version + 1 }).where(and(eq(schema.invoices.id, invoice.id), eq(schema.invoices.version, invoice.version))).returning().get();
    });
    await writeAudit(req, 'invoice.pick', invoice.id, { items });
    await safeNotifyTenantOwners({ tenantId: req.user.tenantId, actorId: req.user.id, type: 'invoice_update', title: 'Hóa đơn đã được chuẩn bị', body: invoice.documentNo || 'Hóa đơn', entityType: 'invoice', entityId: invoice.id });
    res.json(updated);
  } catch (err) { console.error('POST invoice pick error:', err); res.status(500).json({ error: 'Internal server error' }); }
});

app.post('/api/invoices/:id/close', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'sales.create')) return;
    const invoice = await invoiceById(req.user.tenantId, req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (!['draft', 'checked', 'picking', 'ready_to_close'].includes(invoice.workflowStatus)) return res.status(409).json({ error: 'Bill không ở trạng thái có thể chốt' });
    const items = await db.select().from(schema.invoiceItems).where(eq(schema.invoiceItems.invoiceId, invoice.id)).all();
    const updated = await postDraftInvoice(req, invoice.id, items);
    await writeAudit(req, 'invoice.close', invoice.id);
    await safeNotifyTenantOwners({ tenantId: req.user.tenantId, actorId: req.user.id, type: 'invoice_update', title: 'Hóa đơn đã được chốt', body: invoice.documentNo || 'Hóa đơn', entityType: 'invoice', entityId: invoice.id });
    res.json(updated);
  } catch (err) { console.error('POST invoice close error:', err); res.status(500).json({ error: err instanceof Error ? err.message : 'Internal server error' }); }
});

app.post('/api/invoices/:id/cancel', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'sales.cancel')) return;
    const invoice = await invoiceById(req.user.tenantId, req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (invoice.workflowStatus === 'cancelled') return res.status(409).json({ error: 'Bill đã hủy' });
    const now = new Date().toISOString();
    const updated = await db.transaction(async () => {
      await db.update(schema.stockReservations).set({ status: 'released', releasedAt: now }).where(and(eq(schema.stockReservations.invoiceId, invoice.id), eq(schema.stockReservations.status, 'reserved'))).run();
      return await db.update(schema.invoices).set({ workflowStatus: 'cancelled', cancelledBy: req.user.id, cancelledAt: now, version: invoice.version + 1 }).where(and(eq(schema.invoices.id, invoice.id), eq(schema.invoices.version, invoice.version))).returning().get();
    });
    await writeAudit(req, 'invoice.cancel', invoice.id, { reason: req.body?.reason || '' });
    await safeNotifyTenantOwners({ tenantId: req.user.tenantId, actorId: req.user.id, type: 'invoice_update', title: 'Hóa đơn đã bị hủy', body: invoice.documentNo || 'Hóa đơn', entityType: 'invoice', entityId: invoice.id });
    res.json(updated);
  } catch (err) { console.error('POST invoice cancel error:', err); res.status(500).json({ error: 'Internal server error' }); }
});

app.get('/api/invoices/:id/returnable', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'sales.view')) return;
    const invoice = await invoiceById(req.user.tenantId, req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Không tìm thấy hóa đơn' });
    if (!canViewTransaction(req, invoice)) return res.status(404).json({ error: 'Không tìm thấy hóa đơn' });
    const items = await db.select().from(schema.invoiceItems).where(eq(schema.invoiceItems.invoiceId, invoice.id)).all();
    const returns = await db.select().from(schema.salesReturnItems).where(inArray(schema.salesReturnItems.invoiceItemId, items.map((item) => item.id))).all();
    res.json({ invoice, items: items.map((item) => {
      const soldQuantity = Number(item.confirmedQuantity || item.quantity);
      const returnedQuantity = returns.filter((row) => row.invoiceItemId === item.id).reduce((sum, row) => sum + Number(row.quantity), 0);
      const returnedBaseQuantity = returns.filter((row) => row.invoiceItemId === item.id).reduce((sum, row) => sum + Number(row.baseQuantity), 0);
      return { ...item, soldQuantity, returnedQuantity, returnedBaseQuantity, returnableQuantity: Math.max(0, soldQuantity - returnedQuantity) };
    }) });
  } catch (err) { res.status(500).json({ error: 'Không thể tải dòng hàng có thể trả' }); }
});

app.get('/api/sales-returns', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'sales.view')) return;
    let rows = await db.select().from(schema.salesReturns).where(eq(schema.salesReturns.tenantId, req.user.tenantId)).orderBy(desc(schema.salesReturns.createdAt)).all();
    if (!canViewAllTransactions(req)) rows = rows.filter((row) => row.createdBy === req.user.id);
    if (req.query.invoiceId) rows = rows.filter((row) => row.invoiceId === req.query.invoiceId);
    const users = await db.select().from(schema.users).where(eq(schema.users.tenantId, req.user.tenantId)).all();
    const userNameById = new Map(users.map((user) => [user.id, user.name]));
    res.json(await Promise.all(rows.map(async (row) => ({ ...row, createdByName: userNameById.get(row.createdBy) || null, items: await db.select().from(schema.salesReturnItems).where(eq(schema.salesReturnItems.returnId, row.id)).all() }))));
  } catch (err) { res.status(500).json({ error: 'Không thể tải phiếu trả khách hàng' }); }
});

app.post('/api/invoices/:id/returns', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'sales.return')) return;
    const invoice = await invoiceById(req.user.tenantId, req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Không tìm thấy hóa đơn' });
    if (invoice.workflowStatus !== 'closed') return res.status(409).json({ error: 'Chỉ được trả hàng từ hóa đơn đã chốt' });
    const requestedItems = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!requestedItems.length) return res.status(400).json({ error: 'Chọn ít nhất một dòng hàng để trả' });
    const invoiceItems = await db.select().from(schema.invoiceItems).where(eq(schema.invoiceItems.invoiceId, invoice.id)).all() as any[];
    const itemById = new Map<string, any>(invoiceItems.map((item: any) => [item.id, item]));
    const priorReturns = await db.select().from(schema.salesReturnItems).where(inArray(schema.salesReturnItems.invoiceItemId, invoiceItems.map((item: any) => item.id))).all() as any[];
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
      ? await db.select().from(schema.cashAccounts).where(and(
        eq(schema.cashAccounts.id, String(requestedRefundAccountId)),
        eq(schema.cashAccounts.tenantId, req.user.tenantId),
        eq(schema.cashAccounts.active, 1),
      )).get()
      : null;
    const refundAccountId = refundAmount > 0 ? (refundAccount?.id || await defaultAccountForPayment(req.user.tenantId, invoice.paymentMethod)) : null;
    if (refundAmount > 0 && !refundAccountId) return res.status(400).json({ error: 'Cần chọn tài khoản hoàn tiền' });
    const returnId = uuid();
    const timestamp = new Date().toISOString();
    const stockRequirements = new Map<string, number>();
    for (const item of normalized) {
      for (const requirement of await expandStockRequirements(req.user.tenantId, item.original.productId, item.baseQuantity)) {
        stockRequirements.set(requirement.productId, (stockRequirements.get(requirement.productId) || 0) + requirement.quantity);
      }
    }

    await db.transaction(async (tx) => {
      await tx.insert(schema.salesReturns).values({ id: returnId, documentNo: String(req.body?.documentNo || await nextDocumentNo(req.user.tenantId, 'sales_return', 'TBH')), tenantId: req.user.tenantId, invoiceId: invoice.id, customerId: invoice.customerId, totalAmount, debtReduction, refundAmount, refundAccountId, note: String(req.body?.note || ''), createdBy: req.user.id, createdAt: timestamp }).run();
      for (const item of normalized) {
        await tx.insert(schema.salesReturnItems).values({ id: uuid(), returnId, invoiceItemId: item.original.id, productId: item.original.productId, productName: item.original.productName, unitName: item.original.unitName || 'Cái', quantity: item.quantity, unitFactor: item.unitFactor, baseQuantity: item.baseQuantity, price: item.price, total: item.total }).run();
      }
      for (const [productId, quantity] of stockRequirements.entries()) {
        const product = await tx.select().from(schema.products).where(and(eq(schema.products.id, productId), eq(schema.products.tenantId, req.user.tenantId))).get();
        if (!product || !product.trackStock) continue;
        const beforeStock = Number(product.stock);
        const afterStock = beforeStock + quantity;
        await tx.update(schema.products).set({ stock: afterStock }).where(eq(schema.products.id, product.id)).run();
        await tx.insert(schema.stockMovements).values({ id: uuid(), tenantId: req.user.tenantId, productId, type: 'in', quantity, beforeStock, afterStock, note: `Khách trả hàng ${returnId}`, referenceId: returnId, createdAt: timestamp, createdBy: req.user.id }).run();
      }
      if (debtReduction > 0 && invoice.customerId) {
        const customer = await tx.select().from(schema.customers).where(and(eq(schema.customers.id, invoice.customerId), eq(schema.customers.tenantId, req.user.tenantId))).get();
        if (customer) await tx.update(schema.customers).set({ totalDebt: Math.max(0, Number(customer.totalDebt) - debtReduction) }).where(eq(schema.customers.id, customer.id)).run();
        await tx.insert(schema.debtLedger).values({ id: uuid(), tenantId: req.user.tenantId, customerId: invoice.customerId, invoiceId: invoice.id, amount: debtReduction, type: 'decrease', note: `Giảm công nợ do khách trả hàng ${returnId}`, createdAt: timestamp, createdBy: req.user.id }).run();
        await tx.update(schema.invoices).set({ debtAmount: Math.max(0, Number(invoice.debtAmount) - debtReduction), version: invoice.version + 1 }).where(eq(schema.invoices.id, invoice.id)).run();
      }
      if (refundAmount > 0) await tx.insert(schema.cashbookEntries).values({ id: uuid(), tenantId: req.user.tenantId, type: 'expense', amount: refundAmount, category: 'Hoàn tiền khách hàng', note: `Hoàn tiền phiếu ${returnId}`, referenceId: returnId, accountId: refundAccountId, createdAt: timestamp, createdBy: req.user.id }).run();
    });
    writeAudit(req, 'sales_return.create', returnId, { invoiceId: invoice.id, totalAmount, debtReduction, refundAmount });
    await safeNotifyTenantOwners({
      tenantId: req.user.tenantId,
      actorId: req.user.id,
      type: 'sales_return',
      title: 'Có phiếu trả hàng mới',
      body: `${invoice.documentNo || 'Hóa đơn'} · ${totalAmount.toLocaleString('vi-VN')} đ`,
      entityType: 'sales_return',
      entityId: returnId,
    });
    res.status(201).json({ ...await db.select().from(schema.salesReturns).where(eq(schema.salesReturns.id, returnId)).get(), items: await db.select().from(schema.salesReturnItems).where(eq(schema.salesReturnItems.returnId, returnId)).all() });
  } catch (err) {
    console.error('POST /api/invoices/:id/returns error:', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Không thể tạo phiếu trả khách hàng' });
  }
});

app.post('/api/sales-returns', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'sales.return')) return;
    const requestedItems = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!requestedItems.length) return res.status(400).json({ error: 'Chọn ít nhất một hàng hóa để trả' });

    const requestedCustomerId = req.body?.customerId ? String(req.body.customerId) : null;
    if (requestedCustomerId) {
      const customer = await db.select().from(schema.customers).where(and(
        eq(schema.customers.id, requestedCustomerId),
        eq(schema.customers.tenantId, req.user.tenantId),
      )).get();
      if (!customer) return res.status(400).json({ error: 'Khách hàng không thuộc cửa hàng này' });
    }

    const normalized = await Promise.all(requestedItems.map(async (raw: any) => {
      const productId = String(raw.productId || '');
      const product = await db.select().from(schema.products).where(and(
        eq(schema.products.id, productId),
        eq(schema.products.tenantId, req.user.tenantId),
      )).get();
      if (!product) throw new Error('Hàng hóa trả không tồn tại hoặc không thuộc cửa hàng này');

      const quantity = Number(raw.quantity);
      const unitFactor = Number(raw.unitFactor || 1);
      const requestedPrice = Number(raw.price);
      const price = Number.isFinite(requestedPrice) && requestedPrice >= 0
        ? requestedPrice
        : Number(product.sellingPrice || 0) * unitFactor;
      if (!Number.isFinite(quantity) || quantity <= 0) throw new Error(`Số lượng trả không hợp lệ cho ${product.name}`);
      if (!Number.isFinite(unitFactor) || unitFactor <= 0) throw new Error(`Đơn vị trả không hợp lệ cho ${product.name}`);
      if (!Number.isFinite(price) || price < 0) throw new Error(`Giá hoàn không hợp lệ cho ${product.name}`);

      return {
        product,
        quantity,
        unitFactor,
        unitName: String(raw.unitName || product.unit),
        price,
        baseQuantity: quantity * unitFactor,
        total: quantity * price,
      };
    }));

    const totalAmount = normalized.reduce((sum, item) => sum + item.total, 0);
    const requestedRefundAccountId = req.body?.refundAccountId ? String(req.body.refundAccountId) : null;
    const refundAccount = requestedRefundAccountId
      ? await db.select().from(schema.cashAccounts).where(and(
        eq(schema.cashAccounts.id, requestedRefundAccountId),
        eq(schema.cashAccounts.tenantId, req.user.tenantId),
        eq(schema.cashAccounts.active, 1),
      )).get()
      : null;
    const refundAccountId = refundAccount?.id || await defaultAccountForPayment(req.user.tenantId, 'cash');
    if (totalAmount > 0 && !refundAccountId) return res.status(400).json({ error: 'Cần chọn tài khoản hoàn tiền' });

    const returnId = uuid();
    const timestamp = new Date().toISOString();
    const stockRequirements = new Map<string, number>();
    for (const item of normalized) {
      for (const requirement of await expandStockRequirements(req.user.tenantId, item.product.id, item.baseQuantity)) {
        stockRequirements.set(requirement.productId, (stockRequirements.get(requirement.productId) || 0) + requirement.quantity);
      }
    }

    await db.transaction(async (tx) => {
      await tx.insert(schema.salesReturns).values({
        id: returnId,
        documentNo: String(req.body?.documentNo || await nextDocumentNo(req.user.tenantId, 'sales_return', 'TBH')),
        tenantId: req.user.tenantId,
        invoiceId: null,
        customerId: requestedCustomerId,
        totalAmount,
        debtReduction: 0,
        refundAmount: totalAmount,
        refundAccountId,
        note: String(req.body?.note || ''),
        createdBy: req.user.id,
        createdAt: timestamp,
      }).run();

      for (const item of normalized) {
        await tx.insert(schema.salesReturnItems).values({
          id: uuid(),
          returnId,
          invoiceItemId: null,
          productId: item.product.id,
          productName: item.product.name,
          unitName: item.unitName,
          quantity: item.quantity,
          unitFactor: item.unitFactor,
          baseQuantity: item.baseQuantity,
          price: item.price,
          total: item.total,
        }).run();
      }

      for (const [productId, quantity] of stockRequirements.entries()) {
        const product = await tx.select().from(schema.products).where(and(
          eq(schema.products.id, productId),
          eq(schema.products.tenantId, req.user.tenantId),
        )).get();
        if (!product || !product.trackStock) continue;
        const beforeStock = Number(product.stock);
        const afterStock = beforeStock + quantity;
        await tx.update(schema.products).set({ stock: afterStock }).where(eq(schema.products.id, product.id)).run();
        await tx.insert(schema.stockMovements).values({
          id: uuid(),
          tenantId: req.user.tenantId,
          productId,
          type: 'in',
          quantity,
          beforeStock,
          afterStock,
          note: `Trả hàng không hóa đơn ${returnId}`,
          referenceId: returnId,
          createdAt: timestamp,
          createdBy: req.user.id,
        }).run();
      }

      if (totalAmount > 0) {
        await tx.insert(schema.cashbookEntries).values({
          id: uuid(),
          tenantId: req.user.tenantId,
          type: 'expense',
          amount: totalAmount,
          category: 'Hoàn tiền khách hàng',
          note: `Hoàn tiền phiếu ${returnId}`,
          referenceId: returnId,
          accountId: refundAccountId,
          createdAt: timestamp,
          createdBy: req.user.id,
        }).run();
      }
    });

    writeAudit(req, 'sales_return.create', returnId, { invoiceId: null, source: 'standalone', totalAmount, refundAmount: totalAmount });
    await safeNotifyTenantOwners({
      tenantId: req.user.tenantId,
      actorId: req.user.id,
      type: 'sales_return',
      title: 'Có phiếu trả hàng mới',
      body: `Không theo hóa đơn · ${totalAmount.toLocaleString('vi-VN')} đ`,
      entityType: 'sales_return',
      entityId: returnId,
    });
    res.status(201).json({
      ...await db.select().from(schema.salesReturns).where(eq(schema.salesReturns.id, returnId)).get(),
      items: await db.select().from(schema.salesReturnItems).where(eq(schema.salesReturnItems.returnId, returnId)).all(),
    });
  } catch (err) {
    console.error('POST /api/sales-returns error:', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Không thể tạo phiếu trả hàng' });
  }
});

app.get('/api/invoices/:id/timeline', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'sales.view')) return;
    const invoice = await invoiceById(req.user.tenantId, req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (!canViewTransaction(req, invoice)) return res.status(404).json({ error: 'Invoice not found' });
    const events = await db.select().from(schema.auditLogs).where(and(eq(schema.auditLogs.entityType, 'invoice'), eq(schema.auditLogs.entityId, invoice.id), eq(schema.auditLogs.tenantId, req.user.tenantId))).orderBy(desc(schema.auditLogs.createdAt)).all();
    res.json(events);
  } catch (err) { console.error('GET invoice timeline error:', err); res.status(500).json({ error: 'Internal server error' }); }
});

const ensureDefaultCashAccounts = async (tenantId: string) => {
  const defaults = [
    ['cash', 'Tiền mặt'],
    ['bank', 'Chuyển khoản ngân hàng'],
    ['wallet', 'Ví điện tử'],
  ];
  for (const [type, name] of defaults) {
    if (!await db.select().from(schema.cashAccounts).where(and(eq(schema.cashAccounts.tenantId, tenantId), eq(schema.cashAccounts.type, type))).get()) {
      await db.insert(schema.cashAccounts).values({ id: uuid(), tenantId, name, type, active: 1, createdAt: new Date().toISOString() }).run();
    }
  }
};

app.get('/api/cash-accounts', async (req, res) => {
  try {
    if (!ensureAnyPermission(req, res, ['cashbook.view', 'sales.view', 'sales.create'])) return;
    await ensureDefaultCashAccounts(req.user.tenantId);
    res.json(await db.select().from(schema.cashAccounts).where(and(eq(schema.cashAccounts.tenantId, req.user.tenantId), eq(schema.cashAccounts.active, 1))).all());
  } catch (err) { console.error('GET /api/cash-accounts error:', err); res.status(500).json({ error: 'Internal server error' }); }
});

app.post('/api/cash-accounts', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'cashbook.create')) return;
    const account = { id: uuid(), tenantId: req.user.tenantId, name: String(req.body?.name || '').trim(), type: String(req.body?.type || 'cash'), active: 1, createdAt: new Date().toISOString() };
    if (!account.name) return res.status(400).json({ error: 'Tên tài khoản là bắt buộc' });
    await db.insert(schema.cashAccounts).values(account).run();
    res.status(201).json(account);
  } catch (err) { console.error('POST /api/cash-accounts error:', err); res.status(500).json({ error: 'Internal server error' }); }
});

const invoiceOutstanding = async (tenantId: string, invoiceId: string) => {
  const invoice = await invoiceById(tenantId, invoiceId);
  if (!invoice || invoice.workflowStatus !== 'closed') return 0;
  const allocated = await db.select({ amount: sql<number>`coalesce(sum(${schema.paymentAllocations.amount}), 0)` }).from(schema.paymentAllocations)
    .where(and(eq(schema.paymentAllocations.invoiceId, invoiceId), eq(schema.paymentAllocations.tenantId, tenantId))).get()?.amount || 0;
  return Math.max(0, invoice.finalAmount - invoice.paidAmount - Number(allocated));
};

app.get('/api/payments', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'debt.view')) return;
    let payments = await db.select().from(schema.payments).where(eq(schema.payments.tenantId, req.user.tenantId)).orderBy(desc(schema.payments.createdAt)).all();
    if (!canViewAllTransactions(req)) payments = payments.filter((payment) => payment.createdBy === req.user.id);
    if (req.query.customerId) payments = payments.filter((payment) => payment.customerId === req.query.customerId);
    res.json(payments);
  } catch (err) { console.error('GET /api/payments error:', err); res.status(500).json({ error: 'Internal server error' }); }
});

app.get('/api/payments/:id', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'debt.view')) return;
    const payment = await db.select().from(schema.payments).where(and(eq(schema.payments.id, req.params.id), eq(schema.payments.tenantId, req.user.tenantId))).get();
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    if (!canViewTransaction(req, payment)) return res.status(404).json({ error: 'Payment not found' });
    const allocations = await db.select().from(schema.paymentAllocations).where(eq(schema.paymentAllocations.paymentId, payment.id)).all();
    res.json({ ...payment, allocations });
  } catch (err) { console.error('GET /api/payments/:id error:', err); res.status(500).json({ error: 'Internal server error' }); }
});

app.post('/api/payments', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'debt.collect')) return;
    const amount = Number(req.body?.amount) || 0;
    if (amount <= 0) return res.status(400).json({ error: 'Số tiền thanh toán phải lớn hơn 0' });
    await ensureDefaultCashAccounts(req.user.tenantId);
    const paymentMethod = String(req.body?.paymentMethod || 'cash');
    const payment = { id: uuid(), tenantId: req.user.tenantId, customerId: req.body?.customerId || null, accountId: req.body?.accountId || await defaultAccountForPayment(req.user.tenantId, paymentMethod), amount, paymentMethod, note: String(req.body?.note || ''), paymentDate: req.body?.paymentDate || new Date().toISOString(), status: 'posted', createdBy: req.user.id, createdAt: new Date().toISOString() };
    await db.transaction(async (tx) => {
      await tx.insert(schema.payments).values(payment).run();
      await tx.insert(schema.cashbookEntries).values({ id: uuid(), tenantId: req.user.tenantId, type: 'income', amount, category: 'Thu công nợ', note: payment.note || 'Thu công nợ', referenceId: payment.id, accountId: payment.accountId, createdAt: payment.createdAt, createdBy: req.user.id }).run();
    });
    writeAudit(req, 'payment.create', payment.id, { amount, customerId: payment.customerId, accountId: payment.accountId });
    await safeNotifyTenantOwners({
      tenantId: req.user.tenantId,
      actorId: req.user.id,
      type: 'payment',
      title: 'Có giao dịch thu công nợ mới',
      body: `${amount.toLocaleString('vi-VN')} đ${payment.customerId ? ' · Khách hàng có hồ sơ' : ''}`,
      entityType: 'payment',
      entityId: payment.id,
    });
    res.status(201).json({ ...payment, allocations: [] });
  } catch (err) { console.error('POST /api/payments error:', err); res.status(500).json({ error: 'Internal server error' }); }
});

app.post('/api/payments/:id/allocations', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'debt.collect')) return;
    const payment = await db.select().from(schema.payments).where(and(eq(schema.payments.id, req.params.id), eq(schema.payments.tenantId, req.user.tenantId))).get();
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    const allocations = Array.isArray(req.body?.allocations) ? req.body.allocations : [];
    const existing = await db.select({ amount: sql<number>`coalesce(sum(${schema.paymentAllocations.amount}), 0)` }).from(schema.paymentAllocations).where(eq(schema.paymentAllocations.paymentId, payment.id)).get()?.amount || 0;
    const requestedTotal = allocations.reduce((sum: number, item: any) => sum + (Number(item.amount) || 0), 0);
    if (requestedTotal <= 0 || Number(existing) + requestedTotal > payment.amount) return res.status(400).json({ error: 'Tổng phân bổ vượt số tiền phiếu thu' });
    const created = await db.transaction(async (tx) => {
      const rows = [];
      for (const item of allocations) {
        const amount = Number(item.amount) || 0;
        const outstanding = await invoiceOutstanding(req.user.tenantId, item.invoiceId);
        if (amount <= 0 || amount > outstanding) throw new BusinessError(400, `Số tiền phân bổ vượt công nợ bill ${item.invoiceId}`);
        const invoice = await invoiceById(req.user.tenantId, item.invoiceId);
        if (!invoice || (payment.customerId && invoice.customerId !== payment.customerId)) throw new BusinessError(400, 'Bill không thuộc khách hàng của phiếu thu');
        const allocation = { id: uuid(), tenantId: req.user.tenantId, paymentId: payment.id, invoiceId: item.invoiceId, amount, createdAt: new Date().toISOString() };
        await tx.insert(schema.paymentAllocations).values(allocation).run();
        await tx.insert(schema.debtLedger).values({ id: uuid(), tenantId: req.user.tenantId, customerId: invoice.customerId || payment.customerId, invoiceId: invoice.id, amount, type: 'decrease', note: payment.note || 'Phân bổ thu công nợ', createdAt: allocation.createdAt, createdBy: req.user.id }).run();
        const newPaid = invoice.paidAmount + amount;
        await tx.update(schema.invoices).set({ paidAmount: newPaid, paymentStatus: newPaid >= invoice.finalAmount ? 'paid' : 'partial', status: newPaid >= invoice.finalAmount ? 'completed' : 'partial', version: invoice.version + 1 }).where(and(eq(schema.invoices.id, invoice.id), eq(schema.invoices.tenantId, req.user.tenantId), eq(schema.invoices.version, invoice.version))).run();
        if (invoice.customerId) {
          const customer = await tx.select().from(schema.customers).where(and(eq(schema.customers.id, invoice.customerId), eq(schema.customers.tenantId, req.user.tenantId))).get();
          if (customer) await tx.update(schema.customers).set({ totalDebt: Math.max(0, customer.totalDebt - amount) }).where(and(eq(schema.customers.id, customer.id), eq(schema.customers.tenantId, req.user.tenantId))).run();
        }
        rows.push(allocation);
      }
      return rows;
    });
    writeAudit(req, 'payment.allocate', payment.id, { allocations: created });
    res.status(201).json({ paymentId: payment.id, allocations: created });
  } catch (err) { console.error('POST /api/payments/:id/allocations error:', err); res.status(500).json({ error: 'Internal server error' }); }
});

app.get('/api/reports/staff', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'reports.view')) return;
    // Reports are derived from live operational records. Avoid browser or proxy
    // caches returning a stale summary alongside current detail rows.
    res.setHeader('Cache-Control', 'no-store');
    const from = req.query.from ? new Date(`${String(req.query.from)}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
    const to = req.query.to ? new Date(`${String(req.query.to)}T23:59:59.999`).getTime() : Number.POSITIVE_INFINITY;
    const inRange = (value: string) => {
      const timestamp = new Date(value).getTime();
      return timestamp >= from && timestamp <= to;
    };
    const userId = canViewAllTransactions(req) && req.query.userId ? String(req.query.userId) : (canViewAllTransactions(req) ? '' : req.user.id);
    const requestedPaymentMethod = ['cash', 'transfer'].includes(String(req.query.paymentMethod || ''))
      ? String(req.query.paymentMethod)
      : '';
    const users = await db.select().from(schema.users).where(eq(schema.users.tenantId, req.user.tenantId)).all();
    const cashAccounts = await db.select().from(schema.cashAccounts).where(eq(schema.cashAccounts.tenantId, req.user.tenantId)).all();
    const accountPaymentMethod = (accountId?: string | null) => {
      const account = accountId ? cashAccounts.find((item) => item.id === accountId) : null;
      return account?.type === 'bank' ? 'transfer' : account?.type === 'cash' ? 'cash' : null;
    };
    const matchesPayment = (rowPaymentMethod?: string | null, accountId?: string | null) => {
      if (!requestedPaymentMethod) return true;
      return (rowPaymentMethod || accountPaymentMethod(accountId) || 'cash') === requestedPaymentMethod;
    };
    const rows = new Map<string, any>();
    const details: any[] = [];
    const summary = {
      invoiceCount: 0,
      revenue: 0,
      collected: 0,
      receivable: 0,
      salesReturnAmount: 0,
      refundAmount: 0,
      cashIncome: 0,
      cashExpense: 0,
      currentCustomerDebt: null as number | null,
    };
    const effectiveInvoiceDebt = (invoice: any) => Math.max(
      0,
      Number(invoice.debtAmount) || 0,
      (Number(invoice.finalAmount) || 0) - (Number(invoice.paidAmount) || 0),
    );
    for (const user of users) rows.set(user.id, { userId: user.id, userName: user.name, salesCount: 0, salesAmount: 0, salesReturnAmount: 0, purchaseAmount: 0, purchaseReturnAmount: 0, cashIncome: 0, cashExpense: 0, netCash: 0, netSales: 0 });
    const ensureRow = (id: string) => {
      if (!rows.has(id)) rows.set(id, { userId: id, userName: id, salesCount: 0, salesAmount: 0, salesReturnAmount: 0, purchaseAmount: 0, purchaseReturnAmount: 0, cashIncome: 0, cashExpense: 0, netCash: 0, netSales: 0 });
      return rows.get(id);
    };
    const allInvoices = await db.select().from(schema.invoices).where(eq(schema.invoices.tenantId, req.user.tenantId)).all();
    const invoiceById = new Map<string, any>(allInvoices.map((invoice: any) => [invoice.id, invoice] as [string, any]));
    allInvoices.filter((invoice) => invoice.workflowStatus !== 'cancelled' && invoice.workflowStatus === 'closed' && inRange(invoice.createdAt)).forEach((invoice) => {
      if (userId && invoice.createdBy !== userId) return;
      if (!matchesPayment(invoice.paymentMethod, invoice.accountId)) return;
      const row = ensureRow(invoice.createdBy);
      row.salesCount += 1;
      const finalAmount = Number(invoice.finalAmount) || 0;
      const paidAmount = Number(invoice.paidAmount) || 0;
      const debtAmount = effectiveInvoiceDebt(invoice);
      row.salesAmount += finalAmount;
      row.salesPaidAmount = (row.salesPaidAmount || 0) + paidAmount;
      row.salesDebtAmount = (row.salesDebtAmount || 0) + debtAmount;
      summary.invoiceCount += 1;
      summary.revenue += finalAmount;
      summary.collected += paidAmount;
      summary.receivable += debtAmount;
      details.push({
        type: 'sale',
        id: invoice.id,
        documentNo: invoice.documentNo,
        userId: invoice.createdBy,
        userName: row.userName,
        amount: finalAmount,
        finalAmount,
        paidAmount,
        debtAmount,
        paymentMethod: invoice.paymentMethod,
        customerId: invoice.customerId,
        note: invoice.note || null,
        createdAt: invoice.createdAt,
      });
    });
    const salesReturns = (await db.select().from(schema.salesReturns).where(eq(schema.salesReturns.tenantId, req.user.tenantId)).all()).filter((item) => inRange(item.createdAt));
    for (const item of salesReturns) {
      if (userId && item.createdBy !== userId) continue;
      const linkedInvoice = item.invoiceId ? invoiceById.get(item.invoiceId) : null;
      const returnPaymentMethod = Number(item.refundAmount || 0) > 0
        ? accountPaymentMethod(item.refundAccountId)
        : linkedInvoice?.paymentMethod;
      if (!matchesPayment(returnPaymentMethod, item.refundAccountId)) continue;
      ensureRow(item.createdBy).salesReturnAmount += Number(item.totalAmount) || 0;
      summary.salesReturnAmount += Number(item.totalAmount) || 0;
      summary.refundAmount += Number(item.refundAmount) || 0;
      details.push({ type: 'sales_return', id: item.id, documentNo: item.documentNo, userId: item.createdBy, userName: ensureRow(item.createdBy).userName, amount: Number(item.totalAmount) || 0, createdAt: item.createdAt });
    }
    const purchases = (await db.select().from(schema.purchases).where(eq(schema.purchases.tenantId, req.user.tenantId)).all()).filter((item) => inRange(item.createdAt));
    for (const item of purchases) {
      if (userId && item.createdBy !== userId) continue;
      ensureRow(item.createdBy).purchaseAmount += Number(item.finalAmount) || 0;
      details.push({ type: 'purchase', id: item.id, documentNo: item.documentNo, userId: item.createdBy, userName: ensureRow(item.createdBy).userName, amount: Number(item.finalAmount) || 0, createdAt: item.createdAt });
    }
    const purchaseReturns = (await db.select().from(schema.purchaseReturns).where(eq(schema.purchaseReturns.tenantId, req.user.tenantId)).all()).filter((item) => inRange(item.createdAt));
    for (const item of purchaseReturns) {
      if (userId && item.createdBy !== userId) continue;
      ensureRow(item.createdBy).purchaseReturnAmount += Number(item.totalAmount) || 0;
      details.push({ type: 'purchase_return', id: item.id, documentNo: item.documentNo, userId: item.createdBy, userName: ensureRow(item.createdBy).userName, amount: Number(item.totalAmount) || 0, createdAt: item.createdAt });
    }
    const cancelledInvoiceIds = new Set(allInvoices.filter((invoice) => invoice.workflowStatus === 'cancelled').map((item) => item.id));
    const cashbook = (await db.select().from(schema.cashbookEntries).where(eq(schema.cashbookEntries.tenantId, req.user.tenantId)).all()).filter((item) => inRange(item.createdAt) && !(item.referenceId && cancelledInvoiceIds.has(item.referenceId)));
    const userNameById = new Map(users.map((user) => [user.id, user.name]));
    for (const item of cashbook) {
      const reportUserId = item.actorId || item.createdBy;
      if (userId && reportUserId !== userId) continue;
      const linkedInvoice = item.referenceId ? invoiceById.get(item.referenceId) : null;
      if (!matchesPayment(linkedInvoice?.paymentMethod, item.accountId)) continue;
      const row = ensureRow(reportUserId);
      const reportUserName = item.actorName || userNameById.get(reportUserId) || row.userName;
      row.userName = reportUserName;
      if (item.type === 'income') row.cashIncome += Number(item.amount) || 0;
      else row.cashExpense += Number(item.amount) || 0;
      if (item.type === 'income') summary.cashIncome += Number(item.amount) || 0;
      else summary.cashExpense += Number(item.amount) || 0;
      details.push({ type: item.type === 'income' ? 'cash_income' : 'cash_expense', id: item.id, userId: reportUserId, userName: reportUserName, actorId: item.actorId, actorName: item.actorName, createdBy: item.createdBy, createdByName: userNameById.get(item.createdBy) || null, amount: Number(item.amount) || 0, category: item.category, referenceId: item.referenceId, accountId: item.accountId, createdAt: item.createdAt });
    }
    if (!userId) {
      const customers = await db.select({ totalDebt: schema.customers.totalDebt })
        .from(schema.customers)
        .where(eq(schema.customers.tenantId, req.user.tenantId))
        .all();
      summary.currentCustomerDebt = customers.reduce((sum, customer) => sum + Math.max(0, Number(customer.totalDebt) || 0), 0);
    }
    // Derive the headline values from the same filtered detail rows returned
    // to the report. This keeps summary and drill-down on one source of truth.
    const sumDetails = (type: string, field = 'amount') => details
      .filter((item) => item.type === type)
      .reduce((sum, item) => sum + (Number(item[field]) || 0), 0);
    const saleDetails = details.filter((item) => item.type === 'sale');
    summary.invoiceCount = saleDetails.length;
    summary.revenue = saleDetails.reduce((sum, item) => sum + (Number(item.finalAmount) || 0), 0) - sumDetails('sales_return');
    summary.collected = saleDetails.reduce((sum, item) => sum + (Number(item.paidAmount) || 0), 0) - summary.refundAmount;
    summary.receivable = saleDetails.reduce((sum, item) => sum + (Number(item.debtAmount) || 0), 0);
    summary.cashIncome = sumDetails('cash_income');
    summary.cashExpense = sumDetails('cash_expense');
    const result = Array.from(rows.values()).map((row) => ({ ...row, netCash: row.cashIncome - row.cashExpense, netSales: row.salesAmount - row.salesReturnAmount })).filter((row) => !userId || row.userId === userId);
    res.json({ from: req.query.from || null, to: req.query.to || null, rows: result, summary, details: details.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)) });
  } catch (err) {
    console.error('GET /api/reports/staff error:', err);
    res.status(500).json({ error: 'Không thể tải báo cáo theo nhân viên' });
  }
});

// ═══════════════════════════════════════════════════════════
// CASHBOOK
// ═══════════════════════════════════════════════════════════
app.get('/api/cashbook', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'cashbook.view')) return;
    res.setHeader('Cache-Control', 'no-store');
    const { from, to, type, accountId, actorId, createdBy } = req.query;
    const requestedEmployeeId = actorId || createdBy;
    const employeeId = canViewAllTransactions(req) ? requestedEmployeeId : req.user.id;
    const rows = (await db.select().from(schema.cashbookEntries)
      .where(eq(schema.cashbookEntries.tenantId, req.user.tenantId))
      .orderBy(desc(schema.cashbookEntries.createdAt))
      .all())
      .filter((row) => {
        if (type && row.type !== type) return false;
        if (accountId && row.accountId !== String(accountId)) return false;
        if (employeeId && (row.actorId || row.createdBy) !== String(employeeId)) return false;
        if (from && new Date(row.createdAt).getTime() < new Date(String(from)).getTime()) return false;
        if (to && new Date(row.createdAt).getTime() > (new Date(String(to)).getTime() + 24 * 60 * 60 * 1000 - 1)) return false;
        return true;
      });
    const referenceIds = Array.from(new Set(rows.map((row) => row.referenceId).filter(Boolean))) as string[];
    const relatedInvoices = referenceIds.length
      ? await db.select().from(schema.invoices).where(and(eq(schema.invoices.tenantId, req.user.tenantId), inArray(schema.invoices.id, referenceIds))).all()
      : [];
    const relatedSalesReturns = referenceIds.length
      ? await db.select().from(schema.salesReturns).where(and(eq(schema.salesReturns.tenantId, req.user.tenantId), inArray(schema.salesReturns.id, referenceIds))).all()
      : [];
    const relatedPurchases = referenceIds.length
      ? await db.select().from(schema.purchases).where(and(eq(schema.purchases.tenantId, req.user.tenantId), inArray(schema.purchases.id, referenceIds))).all()
      : [];
    const relatedPurchaseReturns = referenceIds.length
      ? await db.select().from(schema.purchaseReturns).where(and(eq(schema.purchaseReturns.tenantId, req.user.tenantId), inArray(schema.purchaseReturns.id, referenceIds))).all()
      : [];
    const invoiceMap = new Map(relatedInvoices.map((document) => [document.id, document]));
    const salesReturnMap = new Map(relatedSalesReturns.map((document) => [document.id, document]));
    const purchaseMap = new Map(relatedPurchases.map((document) => [document.id, document]));
    const purchaseReturnMap = new Map(relatedPurchaseReturns.map((document) => [document.id, document]));
    const users = await db.select().from(schema.users).where(eq(schema.users.tenantId, req.user.tenantId)).all();
    const userNameById = new Map(users.map((user) => [user.id, user.name]));
    res.json(rows.map((row) => {
      const invoice = row.referenceId ? invoiceMap.get(row.referenceId) : undefined;
      const salesReturn = row.referenceId ? salesReturnMap.get(row.referenceId) : undefined;
      const purchase = row.referenceId ? purchaseMap.get(row.referenceId) : undefined;
      const purchaseReturn = row.referenceId ? purchaseReturnMap.get(row.referenceId) : undefined;
      const reference = invoice
        ? { label: documentReference(invoice, 'HD'), type: 'invoice' as const }
        : salesReturn
          ? { label: documentReference(salesReturn, 'TBH'), type: 'sales_return' as const }
          : purchase
            ? { label: documentReference(purchase, 'PN'), type: 'purchase' as const }
            : purchaseReturn
              ? { label: documentReference(purchaseReturn, 'PTN'), type: 'purchase_return' as const }
              : null;
      const displayNote = row.referenceId
        ? reference?.label
          ? String(row.note || '').replaceAll(row.referenceId, reference.label)
          : String(row.note || '').replaceAll(row.referenceId, '').replace(/\s+·\s*$/, '').replace(/\s{2,}/g, ' ').trim()
        : row.note;
      return {
        ...row,
        createdByName: userNameById.get(row.createdBy) || null,
        actorName: row.actorName || (row.actorId ? userNameById.get(row.actorId) : null) || null,
        displayNote,
        referenceLabel: reference?.label || null,
        referenceType: reference?.type || (row.referenceId ? 'unknown' : null),
      };
    }));
  } catch (err) {
    console.error('GET /api/cashbook error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/cashbook', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'cashbook.create')) return;
    await ensureDefaultCashAccounts(req.user.tenantId);
    const { type, amount, category, note, referenceId } = req.body || {};
    if (!type || !['income', 'expense'].includes(type)) return res.status(400).json({ error: 'Invalid type' });
    const amt = Number(amount) || 0;
    if (amt <= 0) return res.status(400).json({ error: 'Amount must be greater than 0' });

    const requestedCategory = String(category || '').replace(/\s+/g, ' ').trim();
    if (!requestedCategory) return res.status(400).json({ error: `Vui lòng chọn loại ${type === 'income' ? 'thu' : 'chi'}` });
    const categoryOptions = await db.select().from(schema.cashbookCategories)
      .where(and(
        eq(schema.cashbookCategories.tenantId, req.user.tenantId),
        eq(schema.cashbookCategories.type, type as 'income' | 'expense'),
        eq(schema.cashbookCategories.active, true),
      )).all();
    const selectedCategory = categoryOptions.find((item: any) => normalizeSearchText(item.name) === normalizeSearchText(requestedCategory));
    if (!selectedCategory) return res.status(400).json({ error: `Loại ${type === 'income' ? 'thu' : 'chi'} không hợp lệ hoặc chưa được tạo` });

    const actorId = String(req.body?.actorId || req.user.id).trim();
    const actor = await db.select({ id: schema.users.id, name: schema.users.name })
      .from(schema.users)
      .where(and(eq(schema.users.id, actorId), eq(schema.users.tenantId, req.user.tenantId), eq(schema.users.status, 'active')))
      .get();
    if (!actor) return res.status(400).json({ error: 'Người thu/chi không hợp lệ' });

    const requestedCounterpartyType = String(req.body?.counterpartyType || 'other');
    if (!['customer', 'supplier', 'employee', 'shipping_partner', 'other'].includes(requestedCounterpartyType)) {
      return res.status(400).json({ error: 'Đối tượng thu/chi không hợp lệ' });
    }
    const counterpartyType = requestedCounterpartyType as 'customer' | 'supplier' | 'employee' | 'shipping_partner' | 'other';
    const counterpartyId = req.body?.counterpartyId ? String(req.body.counterpartyId) : null;
    let counterpartyName = String(req.body?.counterpartyName || '').trim();
    let counterpartyCustomer: { id: string; name: string; totalDebt: number } | null = null;
    if (counterpartyType === 'customer') {
      const customer = counterpartyId
        ? await db.select({ id: schema.customers.id, name: schema.customers.name, totalDebt: schema.customers.totalDebt }).from(schema.customers)
          .where(and(eq(schema.customers.id, counterpartyId), eq(schema.customers.tenantId, req.user.tenantId), eq(schema.customers.active, true))).get()
        : null;
      if (!customer) return res.status(400).json({ error: 'Khách hàng không hợp lệ' });
      counterpartyCustomer = customer;
      counterpartyName = customer.name;
    } else if (counterpartyType === 'supplier') {
      const supplier = counterpartyId
        ? await db.select({ id: schema.suppliers.id, name: schema.suppliers.name }).from(schema.suppliers)
          .where(and(eq(schema.suppliers.id, counterpartyId), eq(schema.suppliers.tenantId, req.user.tenantId), eq(schema.suppliers.active, true))).get()
        : null;
      if (!supplier) return res.status(400).json({ error: 'Nhà cung cấp không hợp lệ' });
      counterpartyName = supplier.name;
    } else if (counterpartyType === 'employee') {
      const employee = counterpartyId
        ? await db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users)
          .where(and(eq(schema.users.id, counterpartyId), eq(schema.users.tenantId, req.user.tenantId), eq(schema.users.status, 'active'))).get()
        : null;
      if (!employee) return res.status(400).json({ error: 'Nhân viên không hợp lệ' });
      counterpartyName = employee.name;
    }

    const createdAt = new Date().toISOString();
    const entry = {
      id: uuid(),
      tenantId: req.user.tenantId,
      type,
      amount: amt,
      category: selectedCategory.name,
      note: note || '',
      referenceId: referenceId || null,
      accountId: req.body?.accountId || await defaultAccountForPayment(req.user.tenantId, req.body?.accountType || 'cash'),
      actorId: actor.id,
      actorName: actor.name,
      counterpartyType,
      counterpartyId: ['customer', 'supplier', 'employee'].includes(counterpartyType) ? counterpartyId : null,
      counterpartyName,
      createdAt,
      createdBy: req.user.id,
    };
    await db.transaction(async (tx) => {
      await tx.insert(schema.cashbookEntries).values(entry).run();
      if (counterpartyCustomer) {
        const customer = await tx.select().from(schema.customers)
          .where(and(eq(schema.customers.id, counterpartyCustomer.id), eq(schema.customers.tenantId, req.user.tenantId))).get();
        if (customer) {
          const currentDebt = Math.max(0, Number(customer.totalDebt) || 0);
          const debtAmount = type === 'expense' ? amt : Math.min(currentDebt, amt);
          if (debtAmount > 0) {
            const nextDebt = type === 'expense' ? currentDebt + debtAmount : Math.max(0, currentDebt - debtAmount);
            await tx.update(schema.customers)
              .set({ totalDebt: nextDebt })
              .where(and(eq(schema.customers.id, customer.id), eq(schema.customers.tenantId, req.user.tenantId)))
              .run();
            await tx.insert(schema.debtLedger).values({
              id: uuid(),
              tenantId: req.user.tenantId,
              customerId: customer.id,
              invoiceId: null,
              amount: debtAmount,
              type: type === 'expense' ? 'increase' : 'decrease',
              note: entry.note || `${type === 'expense' ? 'Chi' : 'Thu'} ${entry.category}`,
              createdAt,
              createdBy: req.user.id,
            }).run();
          }
        }
      }
    });
    await safeNotifyTenantOwners({
      tenantId: req.user.tenantId,
      actorId: req.user.id,
      type: type === 'income' ? 'cash_income' : 'cash_expense',
      title: type === 'income' ? 'Có phiếu thu mới' : 'Có phiếu chi mới',
      body: `${entry.category} · ${amt.toLocaleString('vi-VN')} đ`,
      entityType: 'cashbook',
      entityId: entry.id,
    });
    res.status(201).json(entry);
  } catch (err) {
    console.error('POST /api/cashbook error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════
// STOCK MOVEMENTS / STOCK CHECK
// ═══════════════════════════════════════════════════════════
app.get('/api/stock-movements', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'inventory.view')) return;
    res.setHeader('Cache-Control', 'no-store');
    const { productId } = req.query;
    const requestedLimit = Number(req.query.limit);
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0 ? Math.min(Math.floor(requestedLimit), 500) : 100;
    const includeAll = String(req.query.all || '').toLowerCase() === 'true';
    let rows = await db.select().from(schema.stockMovements)
      .where(eq(schema.stockMovements.tenantId, req.user.tenantId))
      .orderBy(desc(schema.stockMovements.createdAt))
      .all();
    if (!canViewAllTransactions(req)) rows = rows.filter((row) => row.createdBy === req.user.id);
    if (productId) rows = rows.filter((r) => r.productId === productId);
    if (!productId && !includeAll) rows = rows.slice(0, limit);

    const relatedProductIds = Array.from(new Set(rows.map((r) => r.productId))) as string[];
    const relatedUserIds = Array.from(new Set(rows.map((r) => r.createdBy))) as string[];
    const referenceIds = Array.from(new Set(rows.map((r) => r.referenceId).filter(Boolean))) as string[];
    const relatedProducts = relatedProductIds.length
      ? await db.select().from(schema.products)
          .where(and(
            eq(schema.products.tenantId, req.user.tenantId),
            inArray(schema.products.id, relatedProductIds)
          ))
          .all() as any[]
      : [];
    const relatedUsers = relatedUserIds.length
      ? await db.select().from(schema.users)
          .where(and(
            eq(schema.users.tenantId, req.user.tenantId),
            inArray(schema.users.id, relatedUserIds)
          ))
          .all() as any[]
      : [];
    const relatedPurchases = referenceIds.length
      ? await db.select().from(schema.purchases)
          .where(and(
            eq(schema.purchases.tenantId, req.user.tenantId),
            inArray(schema.purchases.id, referenceIds as string[])
          ))
          .all() as any[]
      : [];
    const relatedPurchaseReturns = referenceIds.length
      ? await db.select().from(schema.purchaseReturns)
          .where(and(
            eq(schema.purchaseReturns.tenantId, req.user.tenantId),
            inArray(schema.purchaseReturns.id, referenceIds as string[])
          ))
          .all() as any[]
      : [];
    const relatedInvoices = referenceIds.length
      ? await db.select().from(schema.invoices)
          .where(and(
            eq(schema.invoices.tenantId, req.user.tenantId),
            inArray(schema.invoices.id, referenceIds as string[])
          ))
          .all()
      : [];
    const relatedSalesReturns = referenceIds.length
      ? await db.select().from(schema.salesReturns)
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
      ? await db.select().from(schema.purchaseItems).where(inArray(schema.purchaseItems.purchaseId, purchaseIds)).all()
      : [];
    const purchaseReturnItems = purchaseReturnIds.length
      ? await db.select().from(schema.purchaseReturnItems).where(inArray(schema.purchaseReturnItems.returnId, purchaseReturnIds)).all()
      : [];
    const invoiceItems = invoiceIds.length
      ? await db.select().from(schema.invoiceItems).where(inArray(schema.invoiceItems.invoiceId, invoiceIds)).all()
      : [];
    const salesReturnItems = salesReturnIds.length
      ? await db.select().from(schema.salesReturnItems).where(inArray(schema.salesReturnItems.returnId, salesReturnIds)).all()
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
      ? await db.select().from(schema.suppliers)
          .where(and(
            eq(schema.suppliers.tenantId, req.user.tenantId),
            inArray(schema.suppliers.id, supplierIds as string[])
          ))
          .all()
      : [];
    const relatedCustomers = customerIds.length
      ? await db.select().from(schema.customers)
          .where(and(
            eq(schema.customers.tenantId, req.user.tenantId),
            inArray(schema.customers.id, customerIds as string[])
          ))
          .all()
      : [];

    const productMap = new Map<string, any>((relatedProducts as any[]).map((p: any) => [p.id, p]));
    const userMap = new Map<string, any>((relatedUsers as any[]).map((u: any) => [u.id, u]));
    const purchaseMap = new Map<string, any>((relatedPurchases as any[]).map((purchase: any) => [purchase.id, purchase]));
    const purchaseReturnMap = new Map<string, any>((relatedPurchaseReturns as any[]).map((purchaseReturn: any) => [purchaseReturn.id, purchaseReturn]));
    const invoiceMap = new Map<string, any>((relatedInvoices as any[]).map((invoice: any) => [invoice.id, invoice]));
    const salesReturnMap = new Map<string, any>((relatedSalesReturns as any[]).map((salesReturn: any) => [salesReturn.id, salesReturn]));
    const supplierMap = new Map<string, any>((relatedSuppliers as any[]).map((supplier: any) => [supplier.id, supplier]));
    const customerMap = new Map<string, any>((relatedCustomers as any[]).map((customer: any) => [customer.id, customer]));

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
        documentNo: purchase ? documentReference(purchase, 'PN')
          : purchaseReturn ? documentReference(purchaseReturn, 'PTN')
            : invoice ? documentReference(invoice, 'HD')
              : salesReturn ? documentReference(salesReturn, 'TBH')
                : '',
        referenceLabel: purchase ? documentReference(purchase, 'PN')
          : purchaseReturn ? documentReference(purchaseReturn, 'PTN')
            : invoice ? documentReference(invoice, 'HD')
              : salesReturn ? documentReference(salesReturn, 'TBH')
                : null,
        referenceType: purchase ? 'purchase'
          : purchaseReturn ? 'purchase_return'
            : invoice ? 'invoice'
              : salesReturn ? 'sales_return'
                : null,
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

app.post('/api/stock-check', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'inventory.adjust')) return;
    const { productId, actualStock, note } = req.body || {};
    const product = await db.select().from(schema.products)
      .where(and(eq(schema.products.id, productId), eq(schema.products.tenantId, req.user.tenantId))).get();
    if (!product) return res.status(404).json({ error: 'Product not found' });
    const actual = Number(actualStock);
    if (!Number.isFinite(actual) || actual < 0) return res.status(400).json({ error: 'Invalid actualStock' });

    const beforeStock = product.stock;
    const afterStock = actual;
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
    await db.transaction(async (tx) => {
      await tx.update(schema.products).set({ stock: afterStock }).where(and(eq(schema.products.id, productId), eq(schema.products.tenantId, req.user.tenantId))).run();
      await tx.insert(schema.stockMovements).values(movement).run();
    });
    if (beforeStock !== afterStock) {
      await safeNotifyTenantOwners({
        tenantId: req.user.tenantId,
        actorId: req.user.id,
        type: 'stock_adjustment',
        title: 'Có điều chỉnh tồn kho mới',
        body: `${product.name} · ${beforeStock} → ${afterStock}`,
        entityType: 'stock_movement',
        entityId: movement.id,
      });
    }
    res.json(movement);
  } catch (err) {
    console.error('POST /api/stock-check error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════
// INVOICE ITEMS
// ═══════════════════════════════════════════════════════════

app.get('/api/invoice-items', async (req, res) => {
  try {
    const { invoiceId } = req.query;
    if (!invoiceId) return res.status(400).json({ error: 'invoiceId query param required' });
    const invoice = await db.select().from(schema.invoices)
      .where(and(eq(schema.invoices.id, invoiceId as string), eq(schema.invoices.tenantId, req.user.tenantId))).get();
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (!canViewTransaction(req, invoice)) return res.status(404).json({ error: 'Invoice not found' });
    const items = await db.select().from(schema.invoiceItems).where(eq(schema.invoiceItems.invoiceId, invoiceId as string)).all();
    res.json(items);
  } catch (err) {
    console.error('GET /api/invoice-items error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════
// DEBT LEDGER
// ═══════════════════════════════════════════════════════════

app.get('/api/debt-ledger', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'debt.view')) return;
    const { customerId } = req.query;
    let allEntries = await db.select().from(schema.debtLedger)
      .where(eq(schema.debtLedger.tenantId, req.user.tenantId))
      .orderBy(desc(schema.debtLedger.createdAt)).all();

    if (!canViewAllTransactions(req)) allEntries = allEntries.filter((entry) => entry.createdBy === req.user.id);

    if (customerId) {
      allEntries = allEntries.filter(e => e.customerId === customerId);
    }

    const userIds = Array.from(new Set(allEntries.map((entry) => entry.createdBy).filter(Boolean))) as string[];
    const users = userIds.length
      ? await db.select().from(schema.users).where(and(eq(schema.users.tenantId, req.user.tenantId), inArray(schema.users.id, userIds))).all()
      : [];
    const userNameById = new Map(users.map((user) => [user.id, user.name]));
    res.json(allEntries.map((entry) => ({
      ...entry,
      createdByName: userNameById.get(entry.createdBy) || entry.createdBy || null,
    })));
  } catch (err) {
    console.error('GET /api/debt-ledger error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/debt-ledger', async (req, res) => {
  try {
    if (!ensurePermission(req, res, 'debt.collect')) return;
    const customer = await db.select().from(schema.customers)
      .where(and(eq(schema.customers.id, req.body.customerId), eq(schema.customers.tenantId, req.user.tenantId))).get();
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const accountId = req.body?.accountId || await defaultAccountForPayment(req.user.tenantId, req.body?.paymentMethod || 'cash');
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
    // Update customer debt
    const newDebt = entry.type === 'increase'
      ? customer.totalDebt + entry.amount
      : Math.max(0, customer.totalDebt - entry.amount);
    await db.transaction(async (tx) => {
      await tx.insert(schema.debtLedger).values(entry).run();
      await tx.update(schema.customers)
        .set({ totalDebt: newDebt })
        .where(and(eq(schema.customers.id, entry.customerId), eq(schema.customers.tenantId, req.user.tenantId)))
        .run();
      if (entry.type === 'decrease') {
        await tx.insert(schema.cashbookEntries).values({
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
    });

    res.status(201).json(entry);
  } catch (err) {
    console.error('POST /api/debt-ledger error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════
// DASHBOARD STATS
// ═══════════════════════════════════════════════════════════

app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const tid = req.user.tenantId;

    // Today's date range
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const startIso = todayStart.toISOString();
    const endIso = todayEnd.toISOString();
    const [invoiceStats, returnStats, customerStats, productStats] = await Promise.all([
      db.select({
        revenue: sql<number>`coalesce(sum(case when ${schema.invoices.workflowStatus} = 'closed' and ${schema.invoices.createdAt} >= ${startIso} and ${schema.invoices.createdAt} <= ${endIso} then ${schema.invoices.finalAmount} else 0 end), 0)`,
        orders: sql<number>`coalesce(sum(case when ${schema.invoices.workflowStatus} = 'closed' and ${schema.invoices.createdAt} >= ${startIso} and ${schema.invoices.createdAt} <= ${endIso} then 1 else 0 end), 0)`,
      }).from(schema.invoices).where(eq(schema.invoices.tenantId, tid)).get(),
      db.select({
        amount: sql<number>`coalesce(sum(case when ${schema.salesReturns.createdAt} >= ${startIso} and ${schema.salesReturns.createdAt} <= ${endIso} then ${schema.salesReturns.totalAmount} else 0 end), 0)`,
      }).from(schema.salesReturns).where(eq(schema.salesReturns.tenantId, tid)).get(),
      db.select({
        totalDebt: sql<number>`coalesce(sum(${schema.customers.totalDebt}), 0)`,
        totalCustomers: sql<number>`count(*)`,
      }).from(schema.customers).where(eq(schema.customers.tenantId, tid)).get(),
      db.select({
        totalProducts: sql<number>`count(*)`,
        lowStock: sql<number>`coalesce(sum(case when ${schema.products.trackStock} = 1 and ${schema.products.stock} <= ${schema.products.lowStockThreshold} then 1 else 0 end), 0)`,
      }).from(schema.products).where(eq(schema.products.tenantId, tid)).get(),
    ]);

    res.json({
      todayRevenue: Number(invoiceStats?.revenue || 0) - Number(returnStats?.amount || 0),
      todayOrders: Number(invoiceStats?.orders || 0),
      totalDebt: Number(customerStats?.totalDebt || 0),
      lowStockCount: Number(productStats?.lowStock || 0),
      totalProducts: Number(productStats?.totalProducts || 0),
      totalCustomers: Number(customerStats?.totalCustomers || 0),
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
  app.listen(PORT, '0.0.0.0', async () => {
    console.log(`\n🚀 HKD Smart API đang chạy tại http://localhost:${PORT}`);
    console.log(`   Health: http://localhost:${PORT}/api/health`);
    console.log(`   Docs:   All endpoints prefixed with /api/\n`);
    if (OFFLINE_MODE && !await hasAnyUser()) {
      console.log(`🔐 Mã khởi tạo owner một lần${SETUP_TOKEN_GENERATED ? '' : ' (đã cấu hình)'}: ${SETUP_TOKEN}`);
      console.log('   Chỉ chia sẻ mã này cho người thiết lập cửa hàng; mã sẽ vô hiệu sau tài khoản owner đầu tiên.');
    }
  });
};

startServer().catch((err) => {
  console.error('Failed to start API server:', err);
  process.exit(1);
});
