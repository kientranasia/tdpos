import { User } from '../types';

export type AppRole = User['role'];

const roleRoutes: Record<string, AppRole[]> = {
  '/app/dashboard': ['owner', 'manager'],
  '/app/pos': ['owner', 'manager', 'cashier'],
  '/app/invoices': ['owner', 'manager', 'cashier'],
  '/app/returns': ['owner', 'manager', 'cashier'],
  '/app/inventory': ['owner', 'manager', 'warehouse'],
  '/app/stock-check': ['owner', 'manager', 'warehouse'],
  '/app/inventory-operations': ['owner', 'manager', 'warehouse'],
  '/app/customers': ['owner', 'manager', 'cashier', 'warehouse', 'accountant'],
  '/app/customers/': ['owner', 'manager', 'cashier', 'warehouse', 'accountant'],
  '/app/debt': ['owner', 'manager'],
  '/app/cashbook': ['owner', 'manager', 'accountant'],
  '/app/reports': ['owner', 'manager', 'accountant'],
  '/app/purchases': ['owner', 'manager', 'warehouse', 'accountant'],
  '/app/purchase-returns': ['owner', 'manager', 'warehouse', 'accountant'],
  '/app/suppliers': ['owner', 'manager', 'warehouse', 'accountant'],
  '/app/suppliers/': ['owner', 'manager', 'warehouse', 'accountant'],
  '/app/settings': ['owner'],
  '/app/more': ['owner', 'manager', 'cashier', 'warehouse', 'accountant'],
};

const routePermissions: Record<string, string> = {
  '/app/dashboard': 'dashboard.view',
  '/app/pos': 'sales.view',
  '/app/invoices': 'sales.view',
  '/app/returns': 'sales.view',
  '/app/inventory': 'inventory.view',
  '/app/stock-check': 'inventory.view',
  '/app/inventory-operations': 'inventory.adjust',
  '/app/customers': 'customers.view',
  '/app/customers/': 'customers.view_detail',
  '/app/debt': 'debt.view',
  '/app/cashbook': 'cashbook.view',
  '/app/reports': 'reports.view',
  '/app/purchases': 'purchases.view',
  '/app/purchase-returns': 'purchases.view',
  '/app/suppliers': 'suppliers.view',
  '/app/suppliers/': 'suppliers.view_detail',
  '/app/settings': 'settings.view',
  '/app/more': 'dashboard.view',
};

// Permission checkboxes are intentionally independent. A role that has
// `partners.create` must not automatically gain supplier visibility, and
// unchecking `suppliers.view` must immediately hide that workspace.
const hasGrantedPermission = (grantedPermissions: string[], requiredPermission: string) => grantedPermissions.includes(requiredPermission);

export const canAccessPath = (role: AppRole | undefined, path: string, grantedPermissions?: string[] | null) => {
  if (!role) return false;
  const normalizedPath = path.split('?')[0].split('#')[0];
  // “Nhiều hơn” is the mobile navigation hub. It must remain reachable so
  // users can discover every feature that their assigned permissions allow.
  if (normalizedPath === '/app/more') return true;
  const routeTable = Object.keys(roleRoutes).sort((a, b) => b.length - a.length);
  const matched = routeTable.find((route) => route.endsWith('/')
    ? normalizedPath.startsWith(route)
    : normalizedPath === route || normalizedPath.startsWith(`${route}/`));
  if (!matched) return true;
  if (grantedPermissions) {
    if (role === 'owner') return true;
    const permission = routePermissions[matched];
    return permission ? hasGrantedPermission(grantedPermissions, permission) : true;
  }
  return roleRoutes[matched].includes(role);
};

export const firstAllowedPath = (role: AppRole | undefined, grantedPermissions?: string[] | null) => {
  if (!role) return '/login';
  const candidates = ['/app/dashboard', '/app/pos', '/app/inventory', '/app/purchases', '/app/customers', '/app/more'];
  return candidates.find((path) => canAccessPath(role, path, grantedPermissions)) || '/app/more';
};

export const isMenuAllowed = (role: AppRole | undefined, path: string, grantedPermissions?: string[] | null) => canAccessPath(role, path, grantedPermissions);
