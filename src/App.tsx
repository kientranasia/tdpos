/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { useApp } from './context/AppContext';
import InstallAppPrompt from './components/pwa/InstallAppPrompt';

const MobileLayout = lazy(() => import('./components/layout/MobileLayout'));
const LandingPage = lazy(() => import('./pages/LandingPage'));
const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const POS = lazy(() => import('./pages/POS'));
const Inventory = lazy(() => import('./pages/Inventory'));
const StockCheck = lazy(() => import('./pages/StockCheck'));
const CustomerDetail = lazy(() => import('./pages/CustomerDetail'));
const Debt = lazy(() => import('./pages/Debt'));
const Invoices = lazy(() => import('./pages/Invoices'));
const SalesReturns = lazy(() => import('./pages/SalesReturns'));
const TenantSetup = lazy(() => import('./pages/TenantSetup'));
const Settings = lazy(() => import('./pages/Settings'));
const MoreMenu = lazy(() => import('./pages/MoreMenu'));
const Cashbook = lazy(() => import('./pages/Cashbook'));
const Purchases = lazy(() => import('./pages/Purchases'));
const PurchaseReturns = lazy(() => import('./pages/PurchaseReturns'));
const InventoryOperations = lazy(() => import('./pages/InventoryOperations'));
const SupplierDetail = lazy(() => import('./pages/SupplierDetail'));
const Reports = lazy(() => import('./pages/Reports'));
const Partners = lazy(() => import('./pages/Partners'));

function RouteLoading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center bg-slate-50 p-6 text-sm text-slate-500">
      <div className="flex items-center gap-2" role="status">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-sky-600" />
        Đang tải màn hình…
      </div>
    </div>
  );
}

function TenantBranding() {
  const { activeTenant } = useApp();

  useEffect(() => {
    const branding = activeTenant?.settings?.branding;
    const appName = branding?.appName?.trim() || activeTenant?.name?.trim() || 'HKD Smart';
    const browserTitle = branding?.browserTitle?.trim() || appName;
    document.title = browserTitle;
    const themeColor = branding?.themeColor?.trim();
    if (themeColor && /^#[0-9a-f]{6}$/i.test(themeColor)) {
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColor);
    }
    const icon = branding?.logoUrl || activeTenant?.logoUrl;
    if (icon) {
      document.querySelector('link[rel="icon"]')?.setAttribute('href', icon);
      document.querySelector('link[rel="apple-touch-icon"]')?.setAttribute('href', icon);
    }
    document.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute('content', branding?.shortName?.trim() || appName);
  }, [activeTenant]);

  return null;
}

export default function App() {
  return (
    <AppProvider>
      <TenantBranding />
      <BrowserRouter>
        <Suspense fallback={<RouteLoading />}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Login isRegister />} />
            <Route path="/onboarding" element={<TenantSetup />} />

            <Route path="/app" element={<MobileLayout />}>
              <Route index element={<Navigate to="/app/dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="pos" element={<POS />} />
              <Route path="inventory" element={<Inventory />} />
              <Route path="stock-check" element={<StockCheck />} />
              <Route path="inventory-operations" element={<InventoryOperations />} />
              <Route path="customers" element={<Partners />} />
              <Route path="customers/:id" element={<CustomerDetail />} />
              <Route path="debt" element={<Debt />} />
              <Route path="cashbook" element={<Cashbook />} />
              <Route path="reports" element={<Reports />} />
              <Route path="purchases" element={<Purchases />} />
              <Route path="purchase-returns" element={<PurchaseReturns />} />
              <Route path="suppliers" element={<Partners />} />
              <Route path="suppliers/:id" element={<SupplierDetail />} />
              <Route path="invoices" element={<Invoices />} />
              <Route path="returns" element={<SalesReturns />} />
              <Route path="settings" element={<Settings />} />
              <Route path="subscription" element={<Navigate to="/app/settings" replace />} />
              <Route path="more" element={<MoreMenu />} />
            </Route>
          </Routes>
        </Suspense>
        <InstallAppPrompt />
      </BrowserRouter>
    </AppProvider>
  );
}
