import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import { db } from './db';
import * as schema from './schema';
import { sql } from 'drizzle-orm';

const isProduction = process.env.NODE_ENV === 'production';
type AdminRole = 'super_admin' | 'admin' | 'support';

const getBootstrapAdminConfig = () => {
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim() || (!isProduction ? 'admin@tdpos.vn' : '');
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD || (!isProduction ? 'admin123' : '');
  const name = process.env.ADMIN_BOOTSTRAP_NAME?.trim() || 'System Admin';
  const rawRole = process.env.ADMIN_BOOTSTRAP_ROLE?.trim() || 'super_admin';
  const role: AdminRole =
    rawRole === 'admin' || rawRole === 'support' || rawRole === 'super_admin'
      ? rawRole
      : 'super_admin';
  return { email, password, name, role };
};

export const bootstrapAdminAccount = async () => {
  const countResult = db.select({ count: sql<number>`count(*)` }).from(schema.adminUsers).get();
  const adminCount = countResult?.count || 0;

  if (adminCount > 0) return;

  const config = getBootstrapAdminConfig();
  if (!config.email || !config.password) {
    const msg =
      'No admin account found and missing ADMIN_BOOTSTRAP_EMAIL / ADMIN_BOOTSTRAP_PASSWORD in environment.';
    if (isProduction) {
      throw new Error(msg);
    }
    console.warn(`⚠️ ${msg}`);
    return;
  }

  const now = new Date().toISOString();
  const passwordHash = await bcrypt.hash(config.password, 10);

  db.insert(schema.adminUsers).values({
    id: uuid(),
    name: config.name,
    email: config.email,
    password: passwordHash,
    role: config.role,
    status: 'active',
    createdAt: now,
  }).run();

  console.log(`👤 Bootstrap admin created: ${config.email}`);
};
