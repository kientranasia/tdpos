import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { and, eq, notInArray } from 'drizzle-orm';
import { db, postgresPool } from './dbPostgres';
import * as schema from './schema';
import { ENABLE_PLATFORM_ADMIN, MIN_PASSWORD_LENGTH, OFFLINE_MODE } from './runtimeConfig';

const permissionDefinitions = [
  ['dashboard.view', 'dashboard', 'view', 'Xem tổng quan'],
  ['sales.view', 'sales', 'view', 'Xem bán hàng'],
  ['sales.create', 'sales', 'create', 'Tạo đơn bán'],
  ['sales.cancel', 'sales', 'delete', 'Hủy chứng từ bán'],
  ['sales.view_cost', 'sales', 'view_cost', 'Xem giá vốn khi bán'],
  ['inventory.view', 'inventory', 'view', 'Xem kho'],
  ['inventory.create', 'inventory', 'create', 'Tạo hàng hóa'],
  ['inventory.update', 'inventory', 'update', 'Sửa hàng hóa'],
  ['inventory.delete', 'inventory', 'delete', 'Xóa hàng hóa'],
  ['inventory.adjust', 'inventory', 'adjust', 'Điều chỉnh tồn kho'],
  ['inventory.view_cost', 'inventory', 'view_cost', 'Xem giá vốn'],
  ['inventory.manage_pricing', 'inventory', 'manage_pricing', 'Quản lý bảng giá và combo'],
  ['purchases.view', 'purchases', 'view', 'Xem nhập hàng'],
  ['purchases.create', 'purchases', 'create', 'Tạo phiếu nhập'],
  ['purchases.approve', 'purchases', 'approve', 'Xác nhận phiếu nhập'],
  ['purchases.return', 'purchases', 'return', 'Trả hàng nhà cung cấp'],
  ['sales.return', 'sales', 'return', 'Trả hàng khách hàng'],
  ['sales.override_price', 'sales', 'override_price', 'Sửa giá bán tại quầy'],
  ['partners.view', 'partners', 'view', 'Xem đối tác'],
  ['customers.view', 'partners', 'customers_view', 'Xem tên khách hàng'],
  ['customers.view_detail', 'partners', 'customers_view_detail', 'Xem chi tiết khách hàng'],
  ['suppliers.view', 'partners', 'suppliers_view', 'Xem tên nhà cung cấp'],
  ['suppliers.view_detail', 'partners', 'suppliers_view_detail', 'Xem chi tiết nhà cung cấp'],
  ['partners.create', 'partners', 'create', 'Thêm đối tác'],
  ['partners.update', 'partners', 'update', 'Sửa đối tác'],
  ['debt.view', 'debt', 'view', 'Xem công nợ'],
  ['debt.collect', 'debt', 'collect', 'Thu/trả công nợ'],
  ['cashbook.view', 'cashbook', 'view', 'Xem thu chi'],
  ['cashbook.create', 'cashbook', 'create', 'Tạo giao dịch thu chi'],
  ['reports.view', 'reports', 'view', 'Xem báo cáo'],
  ['reports.export', 'reports', 'export', 'Xuất báo cáo'],
  ['transactions.view_all', 'transactions', 'view_all', 'Xem giao dịch của nhân viên khác'],
  ['settings.view', 'settings', 'view', 'Xem cài đặt'],
  ['settings.manage_users', 'settings', 'manage_users', 'Quản lý nhân viên'],
  ['settings.manage_permissions', 'settings', 'manage_permissions', 'Quản lý phân quyền'],
] as const;

const roleDefaults: Record<string, string[]> = {
  owner: permissionDefinitions.map(([code]) => code),
  manager: permissionDefinitions.filter(([code]) => !['settings.manage_users', 'settings.manage_permissions', 'sales.cancel'].includes(code)).map(([code]) => code),
  cashier: ['sales.view', 'sales.create', 'customers.view', 'partners.create'],
  warehouse: ['inventory.view', 'inventory.create', 'inventory.adjust', 'inventory.view_cost', 'inventory.manage_pricing', 'purchases.view', 'purchases.create', 'purchases.approve', 'purchases.return', 'suppliers.view'],
  accountant: ['dashboard.view', 'customers.view', 'suppliers.view', 'purchases.view', 'debt.view', 'debt.collect', 'cashbook.view', 'cashbook.create', 'reports.view', 'reports.export', 'transactions.view_all'],
};

export const seedPostgres = async () => {
  if (OFFLINE_MODE) throw new Error('PostgreSQL seed chỉ được chạy cho SaaS.');

  for (const [code, module, action, label] of permissionDefinitions) {
    await db.insert(schema.permissions).values({
      id: `perm-${code}`,
      code,
      module,
      action,
      label,
    }).onConflictDoNothing();
  }

  for (const [role, codes] of Object.entries(roleDefaults)) {
    for (const code of codes) {
      await db.insert(schema.rolePermissions).values({
        id: `role-${role}-${code}`,
        role,
        permissionCode: code,
        allowed: true,
    }).onConflictDoUpdate({ target: schema.rolePermissions.id, set: { allowed: true } });
    }
  await db.delete(schema.rolePermissions).where(and(
    eq(schema.rolePermissions.role, role),
    notInArray(schema.rolePermissions.permissionCode, codes),
  ));
  }

  await db.insert(schema.packages).values({
    id: 'pkg-starter-1',
    code: 'starter_1',
    name: 'Starter 1',
    maxUsers: 1,
    priceMonthly: 150000,
    isDefault: true,
    status: 'active',
    createdAt: new Date().toISOString(),
  }).onConflictDoNothing();

  if (ENABLE_PLATFORM_ADMIN) {
    const email = String(process.env.ADMIN_BOOTSTRAP_EMAIL || '').trim().toLowerCase();
    const password = String(process.env.ADMIN_BOOTSTRAP_PASSWORD || '');
    const name = String(process.env.ADMIN_BOOTSTRAP_NAME || 'HKD Smart Platform').trim();
    if (email && password) {
      if (password.length < MIN_PASSWORD_LENGTH) throw new Error(`ADMIN_BOOTSTRAP_PASSWORD phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự.`);
      const existing = await db.select({ id: schema.adminUsers.id }).from(schema.adminUsers).where(eq(schema.adminUsers.email, email)).limit(1);
      if (existing.length === 0) {
        await db.insert(schema.adminUsers).values({
          id: `admin-${crypto.randomUUID()}`,
          name,
          email,
          password: await bcrypt.hash(password, 12),
          role: String(process.env.ADMIN_BOOTSTRAP_ROLE || 'super_admin') as 'super_admin' | 'admin' | 'support',
          status: 'active',
          sessionVersion: 1,
          createdAt: new Date().toISOString(),
        });
      }
    }
  }

  await postgresPool.query('SELECT 1');
  await postgresPool.end();
  console.log('✅ PostgreSQL schema seed complete.');
};

if (import.meta.url === `file://${process.argv[1]}`) {
  seedPostgres().catch((error) => {
    console.error('❌ PostgreSQL seed failed:', error);
    process.exitCode = 1;
  });
}
