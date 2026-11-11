import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import { db } from './db';
import * as schema from './schema';
import { eq, sql } from 'drizzle-orm';
import { ENABLE_PLATFORM_ADMIN, MIN_PASSWORD_LENGTH } from './runtimeConfig';

const isProduction = process.env.NODE_ENV === 'production';
type AdminRole = 'super_admin' | 'admin' | 'support';

const getBootstrapAdminConfig = () => {
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim() || '';
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD || '';
  const name = process.env.ADMIN_BOOTSTRAP_NAME?.trim() || 'System Admin';
  const rawRole = process.env.ADMIN_BOOTSTRAP_ROLE?.trim() || 'super_admin';
  const role: AdminRole =
    rawRole === 'admin' || rawRole === 'support' || rawRole === 'super_admin'
      ? rawRole
      : 'super_admin';
  return { email, password, name, role };
};

export const bootstrapAdminAccount = async () => {
  if (!ENABLE_PLATFORM_ADMIN) return;
  const config = getBootstrapAdminConfig();
  if (!config.email || !config.password || config.password.length < MIN_PASSWORD_LENGTH) {
    const msg =
      'No admin account found and missing ADMIN_BOOTSTRAP_EMAIL / ADMIN_BOOTSTRAP_PASSWORD in environment.';
    if (isProduction) {
      throw new Error(msg);
    }
    console.warn(`⚠️ ${msg}`);
    return;
  }

  // Seed and server startup can both run during the first container boot.
  // Check the configured identity before the count gate so a seeded account
  // is never inserted a second time on restart.
  const existingByEmail = await db
    .select({ id: schema.adminUsers.id })
    .from(schema.adminUsers)
    .where(eq(schema.adminUsers.email, config.email.toLowerCase()))
    .limit(1);
  if (existingByEmail.length > 0) return;

  const countResult = await db.select({ count: sql<number>`count(*)` }).from(schema.adminUsers).get();
  const adminCount = Number(countResult?.count || 0);
  if (adminCount > 0) return;

  const now = new Date().toISOString();
  const passwordHash = await bcrypt.hash(config.password, 12);

  await db.insert(schema.adminUsers).values({
    id: uuid(),
    name: config.name,
    email: config.email.toLowerCase(),
    password: passwordHash,
    role: config.role,
    status: 'active',
    createdAt: now,
  }).onConflictDoNothing();

  console.log(`👤 Bootstrap admin created: ${config.email}`);
};
