import { NavLink, Outlet, useLocation, Navigate, useNavigate } from 'react-router-dom';
import { Home, ShoppingCart, Package, Users, Wallet, LogOut, Receipt, Settings, PanelLeftClose, PanelLeftOpen, Bell, UserRound, BookText, Menu, ClipboardList, BarChart3 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useState } from 'react';
import { authApi } from '../../lib/api';
import { Button } from '../ui/Button';
import { firstAllowedPath, isMenuAllowed, canAccessPath } from '../../lib/permissions';
import BrandMark from '../BrandMark';

export default function MobileLayout() {
  const { activeTenant, currentUser, loading, setActiveTenant, setCurrentUser, products } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showAccountMenu, setShowAccountMenu] = useState(false);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 text-slate-500">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-sky-600" />
      </div>
    );
  }

  if (!activeTenant || !currentUser) {
    return <Navigate to="/login" replace />;
  }

  if (!canAccessPath(currentUser.role, location.pathname)) {
    return <Navigate to={firstAllowedPath(currentUser.role)} replace />;
  }


  // Multi-tenant Onboarding Check
  if (activeTenant.status === 'pending_setup' && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  const handleLogout = () => {
    authApi.clearSession();
    setActiveTenant(null);
    setCurrentUser(null);
    navigate('/login');
  };

  const menuItems = [
    { icon: Home, label: 'Tổng quan', shortLabel: 'Tổng quan', path: '/app/dashboard' },
    { icon: ShoppingCart, label: 'Bán hàng', shortLabel: 'Bán hàng', path: '/app/pos' },
    { icon: Receipt, label: 'Lịch sử đơn', shortLabel: 'Đơn', path: '/app/invoices' },
    { icon: Package, label: 'Mặt hàng', shortLabel: 'Hàng', path: '/app/inventory' },
    { icon: ClipboardList, label: 'Nhập hàng', shortLabel: 'Nhập', path: '/app/purchases' },
    { icon: Users, label: 'Đối tác', shortLabel: 'Đối tác', path: '/app/customers' },
    { icon: Wallet, label: 'Công nợ', shortLabel: 'Nợ', path: '/app/debt' },
    { icon: BookText, label: 'Sổ quỹ', shortLabel: 'Quỹ', path: '/app/cashbook' },
    { icon: BarChart3, label: 'Báo cáo', shortLabel: 'BC', path: '/app/reports' },
    { icon: Settings, label: 'Cài đặt', shortLabel: 'Tôi', path: '/app/settings' },
  ];
  const visibleMenuItems = menuItems.filter((item) => isMenuAllowed(currentUser.role, item.path));
  const footerMenuItems = [
    { icon: Home, label: 'Tổng quan', shortLabel: 'Tổng quan', path: '/app/dashboard' },
    { icon: Package, label: 'Hàng hóa', shortLabel: 'Hàng hóa', path: '/app/inventory' },
    { icon: ShoppingCart, label: 'Bán hàng', shortLabel: 'Bán hàng', path: '/app/pos' },
    { icon: Wallet, label: 'Công nợ', shortLabel: 'Công nợ', path: '/app/debt' },
    { icon: Menu, label: 'Nhiều hơn', shortLabel: 'Nhiều hơn', path: '/app/more' },
  ].filter((item) => item.path === '/app/more' || isMenuAllowed(currentUser.role, item.path));

  const getHeaderTitle = () => {
    if (location.pathname.startsWith('/app/more')) return 'Nhiều hơn';
    const item = visibleMenuItems.find(item => item.path === location.pathname);
    return item ? item.label : 'HKDCare';
  };

  const lowStockCount = activeTenant?.accessBlocked
    ? 0
    : products.filter((p) => p.trackStock && p.stock <= p.lowStockThreshold).length;

  return (
    <div className={`erp-compact flex h-screen flex-col bg-slate-50 ${isCollapsed ? 'lg:pl-20' : 'lg:pl-64'} transition-all duration-300 font-sans`}>
      {/* Header cho Mobile + Tablet */}
      <header className="sticky top-0 z-[110] h-14 md:h-16 items-center justify-between brand-topbar px-4 md:px-5 lg:hidden flex">
        <button onClick={() => navigate('/')} className="flex min-w-0 items-center" title="Trung tâm điều khiển">
          <BrandMark />
        </button>

        <div className="flex items-center gap-2 relative">
          <button
            onClick={() => navigate('/app/pos')}
            className="h-9 w-9 md:h-10 md:w-10 rounded-lg brand-surface text-slate-600 hover:text-sky-600 transition-colors flex items-center justify-center"
            title="Giỏ hàng / POS"
          >
            <ShoppingCart className="h-4 w-4 md:h-5 md:w-5" />
          </button>

          <button
            onClick={() => navigate('/app/inventory')}
            className="h-9 w-9 md:h-10 md:w-10 rounded-lg brand-surface text-slate-600 hover:text-sky-600 transition-colors flex items-center justify-center relative"
            title="Thông báo tồn kho"
          >
            <Bell className="h-4 w-4 md:h-5 md:w-5" />
            {lowStockCount > 0 && (
              <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-orange-500 text-white text-[10px] leading-4 font-semibold text-center">
                {lowStockCount > 9 ? '9+' : lowStockCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setShowAccountMenu((prev) => !prev)}
            className="h-9 w-9 md:h-10 md:w-10 rounded-lg brand-surface text-slate-600 hover:text-sky-600 transition-colors flex items-center justify-center"
            title="Tài khoản"
          >
            <UserRound className="h-4 w-4 md:h-5 md:w-5" />
          </button>

          {showAccountMenu && (
            <div className="absolute top-11 md:top-12 right-0 z-[120] w-52 rounded-lg brand-surface shadow-xl p-2">
              <button
                onClick={() => {
                  setShowAccountMenu(false);
                  navigate('/app/settings');
                }}
                className="w-full h-9 px-3 rounded-md text-sm text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2"
              >
                <Settings className="h-4 w-4" />
                <span>Cài đặt tài khoản</span>
              </button>
              <button
                onClick={handleLogout}
                className="w-full h-9 px-3 rounded-md text-sm text-left text-rose-600 hover:bg-rose-50 flex items-center gap-2"
              >
                <LogOut className="h-4 w-4" />
                <span>Đăng xuất</span>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Sidebar cho Desktop */}
      <aside className={`fixed inset-y-0 left-0 hidden ${isCollapsed ? 'w-20' : 'w-64'} flex-col bg-white lg:flex border-r border-slate-200/60 shadow-[4px_0_24px_rgba(0,0,0,0.02)] z-50 transition-all duration-300`}>
        <div className={`flex h-20 items-center border-b border-slate-50 ${isCollapsed ? 'justify-center px-2' : 'justify-between px-6'}`}>
          <button type="button" onClick={() => navigate('/')} className="flex items-center overflow-hidden" title="Trung tâm điều khiển">
            {isCollapsed ? (
              <BrandMark compact />
            ) : (
              <BrandMark />
            )}
          </button>
          {!isCollapsed && (
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="h-8 w-8 rounded-lg text-slate-300 hover:bg-sky-50 hover:text-sky-600 transition-all flex items-center justify-center"
              title="Thu gọn menu"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          )}
          {isCollapsed && (
            <button
              onClick={() => setIsCollapsed(false)}
              className="absolute top-6 -right-3 h-6 w-6 rounded-md border border-slate-200 bg-white text-slate-400 hover:text-sky-600 transition-all flex items-center justify-center shadow-sm"
            >
              <PanelLeftOpen className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <nav className="flex-1 space-y-1 p-4 mt-4 overflow-y-auto">
          <button
            type="button"
            onClick={() => navigate('/')}
            title={isCollapsed ? 'Trung tâm' : ''}
            className={`flex w-full items-center ${isCollapsed ? 'justify-center' : 'gap-3'} rounded-lg px-4 py-3 text-xs font-bold uppercase tracking-wider text-sky-700 transition-all hover:bg-sky-50`}
          >
            <Home className="h-4 w-4 shrink-0" />
            {!isCollapsed && <span className="truncate">Trung tâm</span>}
          </button>
          {!isCollapsed && <p className="text-[8px] font-black text-slate-300 uppercase tracking-[0.4em] mb-4 pl-2 font-display">Menu chính</p>}
          {visibleMenuItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              title={isCollapsed ? item.label : ''}
              className={({ isActive }) =>
                `flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} rounded-lg px-4 py-3 text-xs font-bold uppercase tracking-wider transition-all duration-300 group ${
                  isActive
                    ? 'bg-sky-600 text-white shadow-xl shadow-sky-900/30'
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
          <button 
            onClick={handleLogout} 
            className={`flex w-full items-center ${isCollapsed ? 'justify-center' : 'gap-2 px-4 shadow-sm bg-white border border-slate-100'} rounded-lg py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:bg-red-50 hover:text-red-600 hover:border-red-100 transition-all duration-300`}
          >
            <LogOut className="h-3.5 w-3.5" />
            {!isCollapsed && <span>Đăng xuất</span>}
          </button>

          {!isCollapsed && (
            <div className="mt-6 text-center animate-in fade-in duration-700">
              <p className="text-[7px] font-bold text-slate-300 uppercase tracking-[0.2em] leading-relaxed">
                © HKDCare<br/>Quản lý gọn, an tâm kinh doanh
              </p>
            </div>
          )}
        </div>
      </aside>

      {/* Nội dung chính */}
      <main className="flex-1 overflow-y-auto w-full bg-slate-50 relative pb-mobile-nav lg:pb-0">
        <div className="w-full h-full">
          <Outlet />
        </div>
      </main>

      {/* Bottom Nav cho Mobile */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md pb-safe lg:hidden border-t border-slate-200 shadow-[0_-6px_24px_rgba(15,23,42,0.08)]">
        <div className="grid" style={{ gridTemplateColumns: `repeat(${footerMenuItems.length}, minmax(0, 1fr))` }}>
        {footerMenuItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex min-w-0 flex-col items-center justify-center gap-1 py-3 transition-all duration-200 ${
                isActive ? 'text-sky-600 bg-sky-50/70' : 'text-slate-500'
              }`
            }
          >
            <item.icon className="h-5 w-5 transition-transform duration-200" />
            <span className="max-w-full truncate px-1 text-[11px] font-semibold leading-none tracking-normal max-[390px]:hidden">{item.shortLabel}</span>
          </NavLink>
        ))}
        </div>
      </nav>
    </div>
  );
}
