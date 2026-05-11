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
import AdminPanel from './pages/AdminPanel';
import Settings from './pages/Settings';

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Login isRegister />} />
          <Route path="/onboarding" element={<TenantSetup />} />
          <Route path="/admin" element={<AdminPanel />} />
          
          <Route path="/app" element={<MobileLayout />}>
            <Route index element={<Navigate to="/app/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="pos" element={<POS />} />
            <Route path="inventory" element={<Inventory />} />
            <Route path="customers" element={<Customers />} />
            <Route path="customers/:id" element={<CustomerDetail />} />
            <Route path="debt" element={<Debt />} />
            <Route path="invoices" element={<Invoices />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppProvider>
  );
}
