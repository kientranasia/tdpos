/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import MobileLayout from './components/layout/MobileLayout';
import LandingPage from './pages/LandingPage';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import POS from './pages/POS';
import Inventory from './pages/Inventory';
import Customers from './pages/Customers';
import CustomerDetail from './pages/CustomerDetail';
import Debt from './pages/Debt';
import Invoices from './pages/Invoices';
import TenantSetup from './pages/TenantSetup';
import Settings from './pages/Settings';
import MoreMenu from './pages/MoreMenu';
import Cashbook from './pages/Cashbook';
import Purchases from './pages/Purchases';
import Suppliers from './pages/Suppliers';
import Partners from './pages/Partners';
import SupplierDetail from './pages/SupplierDetail';
import Reports from './pages/Reports';

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
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
            <Route path="customers" element={<Partners />} />
            <Route path="customers/:id" element={<CustomerDetail />} />
            <Route path="debt" element={<Debt />} />
            <Route path="cashbook" element={<Cashbook />} />
            <Route path="reports" element={<Reports />} />
            <Route path="purchases" element={<Purchases />} />
            <Route path="suppliers" element={<Partners />} />
            <Route path="suppliers/:id" element={<SupplierDetail />} />
            <Route path="invoices" element={<Invoices />} />
            <Route path="settings" element={<Settings />} />
            <Route path="subscription" element={<Navigate to="/app/settings" replace />} />
            <Route path="more" element={<MoreMenu />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppProvider>
  );
}
