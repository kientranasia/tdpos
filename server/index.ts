import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { db } from './db';
import * as schema from './schema';
import { eq, desc, and, like, sql } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import adminRouter from './admin';
import { bootstrapAdminAccount } from './bootstrapAdmin';

const app = express();
const PORT = process.env.API_PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-dev-only';

const withTenantAccess = (tenant: any) => {
  if (!tenant) return null;
  const now = Date.now();
  const trialEnd = tenant.trialEndAt ? new Date(tenant.trialEndAt).getTime() : 0;
  const subscriptionEnd = tenant.subscriptionEndAt ? new Date(tenant.subscriptionEndAt).getTime() : 0;
  const hasActiveSubscription = tenant.subscriptionStatus === 'active' && (!subscriptionEnd || subscriptionEnd >= now);
  const inTrial = tenant.subscriptionStatus === 'trial' && trialEnd >= now;
  const blocked = !inTrial && !hasActiveSubscription;

  return {
    ...tenant,
    accessBlocked: blocked,
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
    const trialStartAt = now;
    const trialEndAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

    db.insert(schema.tenants).values({
      id: tenantId,
      name: storeName,
      address: '',
      phone: '',
      timezone: 'Asia/Ho_Chi_Minh',
      currency: 'VND',
      invoicePrefix: 'INV',
      status: 'pending_setup',
      trialStartAt,
      trialEndAt,
      subscriptionStatus: 'trial',
      subscriptionPlan: 'yearly',
      subscriptionPriceMonthly: 150000,
      packageCode: 'starter_1',
      packageName: 'Starter 1',
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
    if (!ensureRole(req, res, ['owner'])) return;
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
// USERS
// ═══════════════════════════════════════════════════════════

app.get('/api/users', (req, res) => {
  try {
    if (!ensureRole(req, res, ['owner', 'manager'])) return;
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
    if (!ensureRole(req, res, ['owner', 'manager'])) return;
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
    if (!ensureRole(req, res, ['owner'])) return;
    const { name, email, password, phone, role, status } = req.body || {};
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'name, email, password, role are required' });
    }

    const allowedRoles = ['manager', 'cashier'];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Allowed: manager, cashier' });
    }

    const tenant = db.select().from(schema.tenants).where(eq(schema.tenants.id, req.user.tenantId)).get();
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    const userCount = db.select({ count: sql<number>`count(*)` }).from(schema.users)
      .where(eq(schema.users.tenantId, req.user.tenantId))
      .get();
    if ((userCount?.count || 0) >= (tenant.maxUsers || 1)) {
      return res.status(400).json({ error: `User limit reached (${tenant.maxUsers || 1}). Please upgrade package.` });
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
    if (!ensureRole(req, res, ['owner'])) return;
    const existing = db.select().from(schema.users)
      .where(and(eq(schema.users.id, req.params.id), eq(schema.users.tenantId, req.user.tenantId)))
      .get();
    if (!existing) return res.status(404).json({ error: 'User not found' });

    const updates: any = {};
    const allowedRoles = ['manager', 'cashier', 'owner'];

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
    if (!ensureRole(req, res, ['owner'])) return;
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
    if (!ensureRole(req, res, ['owner', 'manager'])) return;
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
    if (!ensureRole(req, res, ['owner', 'manager'])) return;
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
    if (!ensureRole(req, res, ['owner', 'manager'])) return;
    const product = db.select().from(schema.products)
      .where(and(eq(schema.products.id, req.params.id), eq(schema.products.tenantId, req.user.tenantId))).get();
    if (!product) return res.status(404).json({ error: 'Product not found' });
    const { tenantId: _tenantId, ...updates } = req.body;
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
    if (!ensureRole(req, res, ['owner', 'manager'])) return;
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
    if (!ensureRole(req, res, ['owner', 'manager'])) return;
    const { quantity, type } = req.body; // type: 'decrease' | 'increase'
    const product = db.select().from(schema.products)
      .where(and(eq(schema.products.id, req.params.id), eq(schema.products.tenantId, req.user.tenantId))).get();
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const newStock = type === 'decrease'
      ? product.stock - quantity
      : product.stock + quantity;

    db.update(schema.products)
      .set({ stock: Math.max(0, newStock) })
      .where(eq(schema.products.id, req.params.id))
      .run();

    const updated = db.select().from(schema.products).where(eq(schema.products.id, req.params.id)).get();
    res.json(updated);
  } catch (err) {
    console.error('POST /api/products/:id/stock error:', err);
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
      createdByName: customer.createdBy ? userNameById.get(customer.createdBy) || null : null,
    });
  } catch (err) {
    console.error('GET /api/customers/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/customers', (req, res) => {
  try {
    if (!ensureRole(req, res, ['owner', 'manager'])) return;
    const customer = { id: uuid(), totalDebt: 0, ...req.body, tenantId: req.user.tenantId, createdBy: req.user.id };
    db.insert(schema.customers).values(customer).run();
    const creator = db.select().from(schema.users).where(eq(schema.users.id, req.user.id)).get();
    res.status(201).json({ ...customer, createdByName: creator?.name || null });
  } catch (err) {
    console.error('POST /api/customers error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.patch('/api/customers/:id', (req, res) => {
  try {
    if (!ensureRole(req, res, ['owner', 'manager'])) return;
    const customer = db.select().from(schema.customers)
      .where(and(eq(schema.customers.id, req.params.id), eq(schema.customers.tenantId, req.user.tenantId))).get();
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    const { tenantId: _tenantId, ...updates } = req.body;
    db.update(schema.customers).set(updates).where(eq(schema.customers.id, req.params.id)).run();
    const updated = db.select().from(schema.customers).where(eq(schema.customers.id, req.params.id)).get();
    if (!updated) return res.status(404).json({ error: 'Customer not found' });
    res.json(updated);
  } catch (err) {
    console.error('PATCH /api/customers/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Customer debt adjustment
app.post('/api/customers/:id/debt', (req, res) => {
  try {
    if (!ensureRole(req, res, ['owner', 'manager'])) return;
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
    const { items, ...invoiceData } = req.body;
    const invoiceId = invoiceData.id || uuid();
    const invoice = {
      ...invoiceData,
      id: invoiceId,
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
          db.update(schema.products)
            .set({ stock: Math.max(0, product.stock - item.quantity) })
            .where(eq(schema.products.id, item.productId))
            .run();
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

    res.status(201).json(invoice);
  } catch (err) {
    console.error('POST /api/invoices error:', err);
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
    if (!ensureRole(req, res, ['owner', 'manager'])) return;
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
    if (!ensureRole(req, res, ['owner', 'manager'])) return;
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
    console.log(`\n🚀 TDPOS API Server running on http://localhost:${PORT}`);
    console.log(`   Health: http://localhost:${PORT}/api/health`);
    console.log(`   Docs:   All endpoints prefixed with /api/\n`);
  });
};

startServer().catch((err) => {
  console.error('Failed to start API server:', err);
  process.exit(1);
});
