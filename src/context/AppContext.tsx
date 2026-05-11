import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Tenant, User, Product, Customer, Invoice, DebtLedger, Category } from '../types';
import { mockTenants, mockUsers, mockProducts, mockCustomers, mockInvoices } from '../data/mock';

interface AppContextType {
  activeTenant: Tenant | null;
  currentUser: User | null;
  products: Product[];
  categories: Category[];
  customers: Customer[];
  invoices: Invoice[];
  setActiveTenant: (tenant: Tenant | null) => void;
  setCurrentUser: (user: User | null) => void;
  updateTenant: (tenantUpdates: Partial<Tenant>) => void;
  addInvoice: (invoice: Invoice) => void;
  addProduct: (product: Product) => void;
  addCategory: (category: Category) => void;
  updateProduct: (productId: string, productUpdates: Partial<Product>) => void;
  updateProductStock: (productId: string, quantity: number) => void;
  addCustomer: (customer: Customer) => void;
  updateCustomerDebt: (customerId: string, amount: number, type: 'increase' | 'decrease') => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [activeTenant, setActiveTenant] = useState<Tenant | null>(mockTenants[0]);
  const [currentUser, setCurrentUser] = useState<User | null>(mockUsers[0]);
  
  const [products, setProducts] = useState<Product[]>(mockProducts);
  const [categories, setCategories] = useState<Category[]>([
    { id: '1', tenantId: '1', name: 'Tạp hóa' },
    { id: '2', tenantId: '1', name: 'Đồ uống' },
    { id: '3', tenantId: '1', name: 'Thực phẩm' },
  ]);
  const [customers, setCustomers] = useState<Customer[]>(mockCustomers);
  const [invoices, setInvoices] = useState<Invoice[]>(mockInvoices);

  const updateTenant = (tenantUpdates: Partial<Tenant>) => {
    if (activeTenant) {
      setActiveTenant({ ...activeTenant, ...tenantUpdates });
    }
  };

  const addInvoice = (invoice: Invoice) => {
    setInvoices(prev => [invoice, ...prev]);
  };

  const addProduct = (product: Product) => {
    setProducts(prev => [product, ...prev]);
  };

  const addCategory = (category: Category) => {
    setCategories(prev => [...prev, category]);
  };

  const updateProduct = (productId: string, productUpdates: Partial<Product>) => {
    setProducts(prev => prev.map(p => 
      p.id === productId ? { ...p, ...productUpdates } : p
    ));
  };

  const updateProductStock = (productId: string, quantity: number) => {
    setProducts(prev => prev.map(p => 
      p.id === productId ? { ...p, stock: p.stock - quantity } : p
    ));
  };

  const addCustomer = (customer: Customer) => {
    setCustomers(prev => [...prev, customer]);
  };

  const updateCustomerDebt = (customerId: string, amount: number, type: 'increase' | 'decrease') => {
    setCustomers(prev => prev.map(c => {
      if (c.id === customerId) {
        const newDebt = type === 'increase' ? c.totalDebt + amount : Math.max(0, c.totalDebt - amount);
        return { ...c, totalDebt: newDebt };
      }
      return c;
    }));
  };

  return (
    <AppContext.Provider value={{
      activeTenant,
      currentUser,
      products,
      categories,
      customers,
      invoices,
      setActiveTenant,
      setCurrentUser,
      updateTenant,
      addInvoice,
      addProduct,
      addCategory,
      updateProduct,
      updateProductStock,
      addCustomer,
      updateCustomerDebt
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
