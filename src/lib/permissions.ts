import { User } from '../types';

export type AppRole = User['role'];

const roleRoutes: Record<string, AppRole[]> = {
  '/app/dashboard': ['owner', 'manager'],
  '/app/pos': ['owner', 'manager', 'cashier'],
  '/app/invoices': ['owner', 'manager', 'cashier'],
  '/app/inventory': ['owner', 'manager', 'warehouse'],
  '/app/customers': ['owner', 'manager', 'cashier', 'warehouse', 'accountant'],
  '/app/debt': ['owner', 'manager'],
  '/app/cashbook': ['owner', 'manager', 'accountant'],
  '/app/reports': ['owner', 'manager', 'accountant'],
  '/app/purchases': ['owner', 'manager', 'warehouse', 'accountant'],
  '/app/suppliers': ['owner', 'manager', 'warehouse', 'accountant'],
  '/app/settings': ['owner'],
  '/app/more': ['owner', 'manager', 'cashier', 'warehouse', 'accountant'],
};

const routePermissions: Record<string, string> = {
  '/app/dashboard': 'dashboard.view',
  '/app/pos': 'sales.view',
  '/app/invoices': 'sales.view',
  '/app/inventory': 'inventory.view',
  '/app/customers': 'partners.view',
  '/app/debt': 'debt.view',
  '/app/cashbook': 'cashbook.view',
  '/app/reports': 'reports.view',
  '/app/purchases': 'purchases.view',
  '/app/suppliers': 'partners.view',
  '/app/settings': 'settings.view',
  '/app/more': 'dashboard.view',
};

export const canAccessPath = (role: AppRole | undefined, path: string, grantedPermissions?: string[] | null) => {
  if (!role) return false;
  const matched = Object.keys(roleRoutes).find((route) => path === route || path.startsWith(`${route}/`));
  if (!matched) return true;
  if (grantedPermissions) {
    if (role === 'owner') return true;
    const permission = routePermissions[matched];
    return permission ? grantedPermissions.includes(permission) : true;
  }
  return roleRoutes[matched].includes(role);
};

export const firstAllowedPath = (role: AppRole | undefined, grantedPermissions?: string[] | null) => {
  if (!role) return '/login';
  const candidates = ['/app/dashboard', '/app/pos', '/app/inventory', '/app/purchases', '/app/customers', '/app/more'];
  return candidates.find((path) => canAccessPath(role, path, grantedPermissions)) || '/app/more';
};

export const isMenuAllowed = (role: AppRole | undefined, path: string, grantedPermissions?: string[] | null) => canAccessPath(role, path, grantedPermissions);
