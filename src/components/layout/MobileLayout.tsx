import { NavLink, Outlet, useLocation, Navigate, useNavigate } from 'react-router-dom';
import { Home, ShoppingCart, Package, Users, Wallet, LogOut, Store, Receipt, Settings, PanelLeftClose, PanelLeftOpen, ChevronRight } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useState } from 'react';

export default function MobileLayout() {
  const { activeTenant, currentUser, setActiveTenant } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (!activeTenant || !currentUser) {
    return <Outlet />;
  }

  // Multi-tenant Onboarding Check
  if (activeTenant.status === 'pending_setup' && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  const handleLogout = () => {
    setActiveTenant(null);
  };

  const menuItems = [
    { icon: Home, label: 'Tổng quan', path: '/app/dashboard' },
    { icon: ShoppingCart, label: 'Bán hàng', path: '/app/pos' },
    { icon: Receipt, label: 'Lịch sử đơn', path: '/app/invoices' },
    { icon: Package, label: 'Mặt hàng', path: '/app/inventory' },
    { icon: Users, label: 'Khách hàng', path: '/app/customers' },
    { icon: Wallet, label: 'Công nợ', path: '/app/debt' },
  ];

  const getHeaderTitle = () => {
    const item = menuItems.find(item => item.path === location.pathname);
    return item ? item.label : 'TDPOS';
  };

  return (
    <div className={`flex h-screen flex-col bg-slate-50 pb-16 md:pb-0 ${isCollapsed ? 'md:pl-20' : 'md:pl-64'} transition-all duration-300 font-sans`}>
      {/* Header cho Mobile */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between glass px-4 md:hidden border-b border-emerald-100/20">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-lg shadow-emerald-900/20">
            <Store className="h-5 w-5" />
          </div>
          <span className="font-bold text-slate-900 font-display tracking-tight text-base uppercase italic">{getHeaderTitle()}</span>
        </div>
        <button 
          onClick={handleLogout} 
          className="h-9 w-9 flex items-center justify-center rounded-full text-slate-300 hover:text-red-500 transition-colors"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </header>

      {/* Sidebar cho Desktop */}
      <aside className={`fixed inset-y-0 left-0 hidden ${isCollapsed ? 'w-20' : 'w-64'} flex-col bg-white md:flex border-r border-slate-200/60 shadow-[4px_0_24px_rgba(0,0,0,0.02)] z-50 transition-all duration-300`}>
        <div className="flex h-20 items-center justify-between px-6 border-b border-slate-50">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-lg shadow-emerald-900/20 rotate-3 shrink-0">
              <Store className="h-6 w-6" />
            </div>
            {!isCollapsed && (
              <div className="animate-in fade-in slide-in-from-left-2 duration-300">
                <div className="font-black text-slate-900 font-display tracking-tighter text-lg italic uppercase leading-none">TDPOS</div>
                <div className="text-[9px] uppercase tracking-[0.2em] font-bold text-emerald-600/80 mt-1 truncate max-w-[120px]">{activeTenant.name}</div>
              </div>
            )}
          </div>
          <button 
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="h-8 w-8 rounded-lg text-slate-300 hover:text-emerald-600 hover:bg-emerald-50 transition-all flex items-center justify-center"
          >
            {isCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>

        <nav className="flex-1 space-y-1 p-4 mt-4 overflow-y-auto">
          {!isCollapsed && <p className="text-[8px] font-black text-slate-300 uppercase tracking-[0.4em] mb-4 pl-2 font-display">Menu chính</p>}
          {menuItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              title={isCollapsed ? item.label : ''}
              className={({ isActive }) =>
                `flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} rounded-xl px-4 py-3 text-xs font-bold uppercase tracking-wider transition-all duration-300 group ${
                  isActive
                    ? 'bg-emerald-600 text-white shadow-xl shadow-emerald-900/30'
                    : 'text-slate-400 hover:bg-slate-50 hover:text-slate-900'
                }`
              }
            >
              <item.icon className={`h-4 w-4 group-hover:scale-110 transition-transform ${isCollapsed ? '' : 'shrink-0'}`} />
              {!isCollapsed && <span className="truncate">{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className={`mt-auto p-4 border-t border-slate-50 bg-slate-50/30`}>
          <div 
            onClick={() => navigate('/app/settings')}
            className={`mb-4 flex items-center ${isCollapsed ? 'justify-center py-2' : 'gap-3 px-3 py-4'} rounded-2xl bg-white border border-slate-100 shadow-sm hover:shadow-md hover:border-emerald-200 transition-all cursor-pointer group`}
          >
              <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-black text-[10px] shrink-0 group-hover:bg-emerald-600 group-hover:text-white transition-all">
                {activeTenant.name?.charAt(0) || 'T'}
              </div>
              {!isCollapsed && (
                <div className="overflow-hidden flex-1 animate-in fade-in slide-in-from-left-2 duration-300">
                    <p className="text-[10px] font-black text-slate-900 truncate uppercase tracking-tight">{activeTenant.name}</p>
                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest truncate">System Owner</p>
                </div>
              )}
              {!isCollapsed && <ChevronRight className="h-3 w-3 text-slate-300 group-hover:text-emerald-600" />}
          </div>
          
          <button 
            onClick={handleLogout} 
            className={`flex w-full items-center ${isCollapsed ? 'justify-center' : 'gap-2 px-4 shadow-sm bg-white border border-slate-100'} rounded-xl py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:bg-red-50 hover:text-red-600 hover:border-red-100 transition-all duration-300`}
          >
            <LogOut className="h-3.5 w-3.5" />
            {!isCollapsed && <span>Đăng xuất</span>}
          </button>

          {!isCollapsed && (
            <div className="mt-6 text-center animate-in fade-in duration-700">
              <p className="text-[7px] font-bold text-slate-300 uppercase tracking-[0.2em] leading-relaxed">
                © TDPOS - TRANDAO Investment<br/>All rights reserved.
              </p>
            </div>
          )}
        </div>
      </aside>

      {/* Nội dung chính */}
      <main className="flex-1 overflow-y-auto w-full bg-slate-50 relative">
        <div className="w-full h-full">
          <Outlet />
        </div>
      </main>

      {/* Bottom Nav cho Mobile */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex glass pb-safe md:hidden border-t border-slate-200/60 shadow-[0_-4px_24px_rgba(0,0,0,0.04)]">
        {menuItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center justify-center py-2.5 transition-all duration-200 ${
                isActive ? 'text-emerald-600' : 'text-slate-400'
              }`
            }
          >
            <item.icon className={`h-5 w-5 transition-transform duration-200 ${item.path === '/pos' ? 'scale-110' : ''}`} />
            <span className="mt-1 text-[10px] font-bold uppercase tracking-tight">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

