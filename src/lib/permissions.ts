import { User } from '../types';

export type AppRole = User['role'];

const roleRoutes: Record<string, AppRole[]> = {
  '/app/dashboard': ['owner', 'manager'],
  '/app/pos': ['owner', 'manager', 'cashier'],
  '/app/invoices': ['owner', 'manager', 'cashier'],
  '/app/inventory': ['owner', 'manager'],
  '/app/customers': ['owner', 'manager'],
  '/app/debt': ['owner', 'manager'],
  '/app/cashbook': ['owner', 'manager', 'accountant'],
  '/app/settings': ['owner'],
  '/app/subscription': ['owner', 'manager'],
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
