import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import { Tenant, User, Product, Customer, Invoice, DebtLedger, Category } from '../types';
import {
  tenantsApi,
  productsApi,
  customersApi,
  invoicesApi,
  categoriesApi,
  authApi,
  permissionsApi,
} from '../lib/api';

interface AppContextType {
  activeTenant: Tenant | null;
  currentUser: User | null;
  products: Product[];
  categories: Category[];
  customers: Customer[];
  invoices: Invoice[];
  permissions: string[] | null;
  loading: boolean;
  setActiveTenant: (tenant: Tenant | null) => void;
  setCurrentUser: (user: User | null) => void;
  setPermissions: (permissions: string[] | null) => void;
  updateTenant: (tenantUpdates: Partial<Tenant>) => void;
  addInvoice: (invoice: Invoice, items?: any[]) => void;
  addProduct: (product: Product) => Promise<boolean>;
  addCategory: (category: Category) => Promise<boolean>;
  updateCategory: (categoryId: string, name: string) => Promise<boolean>;
  deleteCategory: (categoryId: string) => Promise<boolean>;
  updateProduct: (productId: string, productUpdates: Partial<Product>) => Promise<boolean>;
  deleteProduct: (productId: string) => Promise<boolean>;
  updateCustomer: (customerId: string, updates: Partial<Customer>) => Promise<boolean>;
  updateProductStock: (productId: string, quantity: number) => void;
  addCustomer: (customer: Customer) => Promise<boolean>;
  updateCustomerDebt: (customerId: string, amount: number, type: 'increase' | 'decrease') => void;
  refreshProducts: () => Promise<void>;
  refreshCustomers: () => Promise<void>;
  refreshInvoices: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [activeTenant, setActiveTenant] = useState<Tenant | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [permissions, setPermissions] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(true);
  const lastLoadedTenantIdRef = useRef<string | null>(null);

  // ─── Initial Data Load from API ────────────────────────────
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        if (!authApi.getToken()) {
          setActiveTenant(null);
          setCurrentUser(null);
          setProducts([]);
          setCategories([]);
          setCustomers([]);
          setInvoices([]);
          setPermissions(null);
          return;
        }

        const session = await authApi.me();
        const tenant = session.tenant || null;
        const user = session.user || null;
        setActiveTenant(tenant);
        const permissionRows = await permissionsApi.list().catch(() => []);
        setPermissions(permissionRows.filter((permission: any) => permission.allowed).map((permission: any) => permission.code));
        setCurrentUser(user);

        if (tenant?.accessBlocked) {
          setProducts([]);
          setCategories([]);
          setCustomers([]);
          setInvoices([]);
          setPermissions([]);
          return;
        }

        if (tenant) {
          const [prodList, catList, custList, invList] = await Promise.all([
            productsApi.list(tenant.id),
            categoriesApi.list(tenant.id),
            customersApi.list(tenant.id),
            invoicesApi.list(tenant.id),
          ]);
          setProducts(prodList);
          setCategories(catList);
          setCustomers(custList);
          setInvoices(invList);
        }
      } catch (err) {
        console.error('❌ Failed to connect to backend API:', err);
        authApi.clearSession();
        setActiveTenant(null);
        setCurrentUser(null);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  useEffect(() => {
    if (!authApi.getToken() || !activeTenant?.id) {
      lastLoadedTenantIdRef.current = null;
      setProducts([]);
      setCategories([]);
      setCustomers([]);
      setInvoices([]);
      setPermissions(null);
      return;
    }

    if (activeTenant.accessBlocked) {
      lastLoadedTenantIdRef.current = activeTenant.id;
      setProducts([]);
      setCategories([]);
      setCustomers([]);
      setInvoices([]);
      setPermissions([]);
      return;
    }

    if (lastLoadedTenantIdRef.current === activeTenant.id) return;

    const loadTenantScopedData = async () => {
      try {
        // Clear stale data immediately when switching tenant/account
        setProducts([]);
        setCategories([]);
        setCustomers([]);
        setInvoices([]);

        const [prodList, catList, custList, invList] = await Promise.all([
          productsApi.list(activeTenant.id),
          categoriesApi.list(activeTenant.id),
          customersApi.list(activeTenant.id),
          invoicesApi.list(activeTenant.id),
        ]);
        setProducts(prodList);
        setCategories(catList);
        setCustomers(custList);
        setInvoices(invList);
        lastLoadedTenantIdRef.current = activeTenant.id;
      } catch (err) {
        console.error('Failed to load tenant-scoped data:', err);
      }
    };

    loadTenantScopedData();
  }, [activeTenant?.id, activeTenant?.accessBlocked]);

  // ─── Refresh Helpers ───────────────────────────────────────
  const refreshProducts = useCallback(async () => {
    if (!activeTenant) return;
    try {
      const data = await productsApi.list(activeTenant.id);
      setProducts(data);
    } catch (err) {
      console.error('Failed to refresh products:', err);
    }
  }, [activeTenant]);

  const refreshCustomers = useCallback(async () => {
    if (!activeTenant) return;
    try {
      const data = await customersApi.list(activeTenant.id);
      setCustomers(data);
    } catch (err) {
      console.error('Failed to refresh customers:', err);
    }
  }, [activeTenant]);

  const refreshInvoices = useCallback(async () => {
    if (!activeTenant) return;
    try {
      const data = await invoicesApi.list(activeTenant.id);
      setInvoices(data);
    } catch (err) {
      console.error('Failed to refresh invoices:', err);
    }
  }, [activeTenant]);

  // ─── Mutations (optimistic UI + API call) ──────────────────
  const updateTenant = useCallback(async (tenantUpdates: Partial<Tenant>) => {
    if (activeTenant) {
      const prev = activeTenant;
      setActiveTenant({ ...activeTenant, ...tenantUpdates });
      try {
        const updated = await tenantsApi.update(activeTenant.id, tenantUpdates);
        setActiveTenant(updated);
      } catch (err) {
        console.error('Failed to update tenant:', err);
        setActiveTenant(prev);
      }
    }
  }, [activeTenant]);

  const addInvoice = useCallback(async (invoice: Invoice, items?: any[]) => {
    setInvoices(prev => [invoice, ...prev]);
    try {
      await invoicesApi.create({ ...invoice, items: items || [] });
      await Promise.all([refreshProducts(), refreshCustomers()]);
    } catch (err) {
      console.error('Failed to create invoice:', err);
    }
  }, [refreshProducts, refreshCustomers]);

  const addProduct = useCallback(async (product: Product) => {
    setProducts(prev => [product, ...prev]);
    try {
      await productsApi.create(product);
      return true;
    } catch (err) {
      console.error('Failed to create product:', err);
      setProducts(prev => prev.filter(p => p.id !== product.id));
      return false;
    }
  }, []);

  const addCategory = useCallback(async (category: Category) => {
    setCategories(prev => [...prev, category]);
    try {
      await categoriesApi.create(category);
      return true;
    } catch (err) {
      console.error('Failed to create category:', err);
      setCategories(prev => prev.filter(c => c.id !== category.id));
      return false;
    }
  }, []);

  const updateCategory = useCallback(async (categoryId: string, name: string) => {
    const previousCategories = categories;
    const previousProducts = products;
    const current = categories.find((category) => category.id === categoryId);
    if (!current) return false;
    setCategories((prev) => prev.map((category) => category.id === categoryId ? { ...category, name } : category));
    setProducts((prev) => prev.map((product) => product.category === current.name ? { ...product, category: name } : product));
    try {
      await categoriesApi.update(categoryId, { name });
      return true;
    } catch (err) {
      console.error('Failed to update category:', err);
      setCategories(previousCategories);
      setProducts(previousProducts);
      return false;
    }
  }, [categories, products]);

  const deleteCategory = useCallback(async (categoryId: string) => {
    const previousCategories = categories;
    setCategories((prev) => prev.filter((category) => category.id !== categoryId));
    try {
      await categoriesApi.remove(categoryId);
      return true;
    } catch (err) {
      console.error('Failed to delete category:', err);
      setCategories(previousCategories);
      return false;
    }
  }, [categories]);

  const updateProduct = useCallback(async (productId: string, productUpdates: Partial<Product>) => {
    const prevProducts = products;
    setProducts(prev => prev.map(p =>
      p.id === productId ? { ...p, ...productUpdates } : p
    ));
    try {
      await productsApi.update(productId, productUpdates);
      return true;
    } catch (err) {
      console.error('Failed to update product:', err);
      setProducts(prevProducts);
      return false;
    }
  }, [products]);

  const deleteProduct = useCallback(async (productId: string) => {
    const prevProducts = products;
    setProducts((prev) => prev.filter((p) => p.id !== productId));
    try {
      await productsApi.delete(productId);
      return true;
    } catch (err) {
      console.error('Failed to delete product:', err);
      setProducts(prevProducts);
      return false;
    }
  }, [products]);

  const updateProductStock = useCallback(async (productId: string, quantity: number) => {
    setProducts(prev => prev.map(p =>
      p.id === productId ? { ...p, stock: p.stock - quantity } : p
    ));
    try {
      await productsApi.adjustStock(productId, quantity, 'decrease');
    } catch (err) {
      console.error('Failed to update product stock:', err);
    }
  }, []);

  const addCustomer = useCallback(async (customer: Customer) => {
    const previousCustomers = customers;
    setCustomers(prev => [customer, ...prev.filter((item) => item.id !== customer.id)]);
    try {
      const created = await customersApi.create(customer);
      setCustomers(prev => [created, ...prev.filter((item) => item.id !== created.id)]);
      return true;
    } catch (err) {
      console.error('Failed to create customer:', err);
      setCustomers(previousCustomers);
      return false;
    }
  }, [customers]);

  const updateCustomer = useCallback(async (customerId: string, updates: Partial<Customer>) => {
    const prevCustomers = customers;
    setCustomers(prev => prev.map(c => (
      c.id === customerId ? { ...c, ...updates } : c
    )));
    try {
      await customersApi.update(customerId, updates);
      return true;
    } catch (err) {
      console.error('Failed to update customer:', err);
      setCustomers(prevCustomers);
      return false;
    }
  }, [customers]);

  const updateCustomerDebt = useCallback(async (customerId: string, amount: number, type: 'increase' | 'decrease') => {
    setCustomers(prev => prev.map(c => {
      if (c.id === customerId) {
        const newDebt = type === 'increase' ? c.totalDebt + amount : Math.max(0, c.totalDebt - amount);
        return { ...c, totalDebt: newDebt };
      }
      return c;
    }));
    try {
      await customersApi.adjustDebt(customerId, amount, type);
    } catch (err) {
      console.error('Failed to update customer debt:', err);
    }
  }, []);

  return (
    <AppContext.Provider value={{
      activeTenant,
      currentUser,
      products,
      categories,
      customers,
      invoices,
      permissions,
      loading,
      setActiveTenant,
      setCurrentUser,
      setPermissions,
      updateTenant,
      addInvoice,
      addProduct,
      addCategory,
      updateCategory,
      deleteCategory,
      updateProduct,
      deleteProduct,
      updateCustomer,
      updateProductStock,
      addCustomer,
      updateCustomerDebt,
      refreshProducts,
      refreshCustomers,
      refreshInvoices,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
