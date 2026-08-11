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

export const canAccessPath = (role: AppRole | undefined, path: string) => {
  if (!role) return false;
  const matched = Object.keys(roleRoutes).find((route) => path === route || path.startsWith(`${route}/`));
  if (!matched) return true;
  return roleRoutes[matched].includes(role);
};

export const firstAllowedPath = (role: AppRole | undefined) => {
  if (!role) return '/login';
  if (role === 'cashier') return '/app/pos';
  if (role === 'manager') return '/app/dashboard';
  return '/app/dashboard';
};

export const isMenuAllowed = (role: AppRole | undefined, path: string) => canAccessPath(role, path);
