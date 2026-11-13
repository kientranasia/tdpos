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
  productSummary: { total: number; totalStock: number; stockValue: number; lowStock: number };
  categories: Category[];
  customers: Customer[];
  invoices: Invoice[];
  permissions: string[] | null;
  loading: boolean;
  setActiveTenant: (tenant: Tenant | null) => void;
  setCurrentUser: (user: User | null) => void;
  setPermissions: (permissions: string[] | null) => void;
  updateTenant: (tenantUpdates: Partial<Tenant>) => void;
  addInvoice: (invoice: Invoice, items?: any[]) => Promise<Invoice | null>;
  addProduct: (product: Product) => Promise<Product | null>;
  addCategory: (category: Category) => Promise<Category | null>;
  updateCategory: (categoryId: string, name: string) => Promise<boolean>;
  deleteCategory: (categoryId: string) => Promise<boolean>;
  updateProduct: (productId: string, productUpdates: Partial<Product>) => Promise<boolean>;
  deleteProduct: (productId: string) => Promise<boolean>;
  updateCustomer: (customerId: string, updates: Partial<Customer>) => Promise<boolean>;
  updateProductStock: (productId: string, quantity: number) => void;
  addCustomer: (customer: Customer) => Promise<Customer | null>;
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
  const [productSummary, setProductSummary] = useState({ total: 0, totalStock: 0, stockValue: 0, lowStock: 0 });
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
          setProductSummary({ total: 0, totalStock: 0, stockValue: 0, lowStock: 0 });
          setCategories([]);
          setCustomers([]);
          setInvoices([]);
          setPermissions(null);
          return;
        }

        let session;
        try {
          session = await authApi.me();
        } catch (err) {
          console.error('❌ Session is no longer valid:', err);
          authApi.clearSession();
          setActiveTenant(null);
          setCurrentUser(null);
          return;
        }
        const tenant = session.tenant || null;
        const user = session.user || null;
        setActiveTenant(tenant);
        const permissionRows = await permissionsApi.list().catch(() => []);
        setPermissions(permissionRows.filter((permission: any) => permission.allowed).map((permission: any) => permission.code));
        setCurrentUser(user);

        if (tenant?.accessBlocked) {
          setProducts([]);
          setProductSummary({ total: 0, totalStock: 0, stockValue: 0, lowStock: 0 });
          setCategories([]);
          setCustomers([]);
          setInvoices([]);
          setPermissions([]);
          return;
        }

        if (tenant) {
          const [prodResult, summaryResult, catResult, custResult, invResult] = await Promise.allSettled([
            productsApi.listPage(tenant.id, { limit: 100, offset: 0 }),
            productsApi.summary(tenant.id),
            categoriesApi.list(tenant.id),
            customersApi.list(tenant.id),
            invoicesApi.list(tenant.id),
          ]);
          if (prodResult.status === 'fulfilled') setProducts(prodResult.value.items);
          else console.error('Failed to load products:', prodResult.reason);
          if (summaryResult.status === 'fulfilled') setProductSummary(summaryResult.value);
          else console.error('Failed to load product summary:', summaryResult.reason);
          if (catResult.status === 'fulfilled') setCategories(catResult.value);
          else console.error('Failed to load categories:', catResult.reason);
          if (custResult.status === 'fulfilled') setCustomers(custResult.value);
          else console.error('Failed to load customers:', custResult.reason);
          if (invResult.status === 'fulfilled') setInvoices(invResult.value);
          else console.error('Failed to load invoices:', invResult.reason);
          lastLoadedTenantIdRef.current = tenant.id;
        }
      } catch (err) {
        console.error('❌ Failed to connect to backend API:', err);
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
      setProductSummary({ total: 0, totalStock: 0, stockValue: 0, lowStock: 0 });
      setCategories([]);
      setCustomers([]);
      setInvoices([]);
      setPermissions(null);
      return;
    }

    if (activeTenant.accessBlocked) {
      lastLoadedTenantIdRef.current = activeTenant.id;
      setProducts([]);
      setProductSummary({ total: 0, totalStock: 0, stockValue: 0, lowStock: 0 });
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

        const [prodResult, summaryResult, catResult, custResult, invResult] = await Promise.allSettled([
          productsApi.listPage(activeTenant.id, { limit: 100, offset: 0 }),
          productsApi.summary(activeTenant.id),
          categoriesApi.list(activeTenant.id),
          customersApi.list(activeTenant.id),
          invoicesApi.list(activeTenant.id),
        ]);
        if (prodResult.status === 'fulfilled') setProducts(prodResult.value.items);
        else console.error('Failed to load products:', prodResult.reason);
        if (summaryResult.status === 'fulfilled') setProductSummary(summaryResult.value);
        else console.error('Failed to load product summary:', summaryResult.reason);
        if (catResult.status === 'fulfilled') setCategories(catResult.value);
        else console.error('Failed to load categories:', catResult.reason);
        if (custResult.status === 'fulfilled') setCustomers(custResult.value);
        else console.error('Failed to load customers:', custResult.reason);
        if (invResult.status === 'fulfilled') setInvoices(invResult.value);
        else console.error('Failed to load invoices:', invResult.reason);
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
      const [data, summary] = await Promise.all([
        productsApi.listPage(activeTenant.id, { limit: 100, offset: 0 }),
        productsApi.summary(activeTenant.id),
      ]);
      setProducts(data.items);
      setProductSummary(summary);
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

  const addInvoice = useCallback(async (invoice: Invoice, items?: any[]): Promise<Invoice | null> => {
    try {
      const { id: _temporaryId, ...invoicePayload } = invoice;
      const created = await invoicesApi.create({ ...invoicePayload, items: items || [] }) as Invoice;
      // The API owns the persisted invoice ID. Do not expose a temporary ID
      // in the shared invoice state while the request is still in flight.
      setInvoices(prev => [created, ...prev]);
      await Promise.all([refreshProducts(), refreshCustomers()]);
      return created;
    } catch (err) {
      console.error('Failed to create invoice:', err);
      return null;
    }
  }, [refreshProducts, refreshCustomers]);

  const addProduct = useCallback(async (product: Product): Promise<Product | null> => {
    try {
      const { id: _temporaryId, ...productPayload } = product;
      const created = await productsApi.create(productPayload) as Product;
      // The API owns the persisted product ID. Only put the canonical row in
      // shared state so follow-up writes cannot target a temporary ID.
      setProducts(prev => [created, ...prev]);
      return created;
    } catch (err) {
      console.error('Failed to create product:', err);
      return null;
    }
  }, []);

  const addCategory = useCallback(async (category: Category): Promise<Category | null> => {
    try {
      const { id: _temporaryId, ...categoryPayload } = category;
      const created = await categoriesApi.create(categoryPayload) as Category;
      // Category IDs are generated by the API; store only the canonical row.
      setCategories(prev => [...prev, created]);
      return created;
    } catch (err) {
      console.error('Failed to create category:', err);
      return null;
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

  const addCustomer = useCallback(async (customer: Customer): Promise<Customer | null> => {
    try {
      const { id: _temporaryId, ...customerPayload } = customer;
      const created = await customersApi.create(customerPayload) as Customer;
      setCustomers(prev => [created, ...prev]);
      return created;
    } catch (err) {
      console.error('Failed to create customer:', err);
      return null;
    }
  }, []);

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
      productSummary,
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
