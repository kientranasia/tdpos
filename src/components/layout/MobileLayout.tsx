import { NavLink, Outlet, useLocation, Navigate, useNavigate } from 'react-router-dom';
import { Home, ShoppingCart, Package, Users, Truck, Wallet, LogOut, Receipt, Settings, PanelLeftClose, PanelLeftOpen, Bell, UserRound, BookText, Menu, ClipboardList, BarChart3 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useState } from 'react';
import { authApi } from '../../lib/api';
import { firstAllowedPath, isMenuAllowed, canAccessPath } from '../../lib/permissions';
import BrandMark from '../BrandMark';

export default function MobileLayout() {
  const { activeTenant, currentUser, loading, setActiveTenant, setCurrentUser, setPermissions, products, permissions } = useApp();
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

  if (!canAccessPath(currentUser.role, location.pathname, permissions)) {
    return <Navigate to={firstAllowedPath(currentUser.role, permissions)} replace />;
  }


  // Multi-tenant Onboarding Check
  if (activeTenant.status === 'pending_setup' && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  const handleLogout = () => {
    authApi.clearSession();
    setActiveTenant(null);
    setCurrentUser(null);
    setPermissions(null);
    navigate('/login');
  };

  const menuItems = [
    { icon: Home, label: 'Tổng quan', shortLabel: 'Tổng quan', path: '/app/dashboard' },
    { icon: ShoppingCart, label: 'Bán hàng', shortLabel: 'Bán hàng', path: '/app/pos' },
    { icon: Receipt, label: 'Lịch sử đơn', shortLabel: 'Đơn', path: '/app/invoices' },
    { icon: Package, label: 'Mặt hàng', shortLabel: 'Hàng', path: '/app/inventory' },
    { icon: ClipboardList, label: 'Đơn nhập hàng', shortLabel: 'Nhập', path: '/app/purchases' },
    { icon: Users, label: 'Khách hàng', shortLabel: 'Khách', path: '/app/customers' },
    { icon: Truck, label: 'Nhà cung cấp', shortLabel: 'NCC', path: '/app/suppliers' },
    { icon: Wallet, label: 'Công nợ', shortLabel: 'Nợ', path: '/app/debt' },
    { icon: BookText, label: 'Sổ quỹ', shortLabel: 'Quỹ', path: '/app/cashbook' },
    { icon: BarChart3, label: 'Báo cáo', shortLabel: 'BC', path: '/app/reports' },
  ];
  const visibleMenuItems = menuItems.filter((item) => isMenuAllowed(currentUser.role, item.path, permissions));
  const footerMenuItems = [
    { icon: Home, label: 'Tổng quan', shortLabel: 'Tổng quan', path: '/app/dashboard' },
    { icon: Package, label: 'Hàng hóa', shortLabel: 'Hàng hóa', path: '/app/inventory' },
    { icon: ShoppingCart, label: 'Bán hàng', shortLabel: 'Bán hàng', path: '/app/pos' },
    { icon: Wallet, label: 'Công nợ', shortLabel: 'Công nợ', path: '/app/debt' },
    { icon: Menu, label: 'Nhiều hơn', shortLabel: 'Nhiều hơn', path: '/app/more' },
  ].filter((item) => item.path === '/app/more' || isMenuAllowed(currentUser.role, item.path, permissions));

  const getHeaderTitle = () => {
    if (location.pathname.startsWith('/app/more')) return 'Nhiều hơn';
    const item = visibleMenuItems.find(item => item.path === location.pathname);
    return item ? item.label : 'HKD Smart';
  };

  const lowStockCount = activeTenant?.accessBlocked
    ? 0
    : products.filter((p) => p.trackStock && p.stock <= p.lowStockThreshold).length;

  return (
    <div className={`erp-compact flex h-screen flex-col bg-slate-50 ${isCollapsed ? 'lg:pl-16' : 'lg:pl-60'} transition-all duration-300 font-sans`}>
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
              <div className="mb-1 border-b border-slate-100 px-3 py-2">
                <p className="truncate text-sm font-semibold text-slate-800">{currentUser.name || 'Tài khoản'}</p>
                <p className="truncate text-[11px] text-slate-400">{currentUser.email}</p>
              </div>
              <button
                onClick={() => {
                  setShowAccountMenu(false);
                  navigate('/app/settings');
                }}
                className="w-full h-9 px-3 rounded-md text-sm text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2"
              >
                <Settings className="h-4 w-4" />
                <span>Hồ sơ & cài đặt</span>
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
      <aside className={`fixed inset-y-0 left-0 hidden ${isCollapsed ? 'w-14' : 'w-52'} flex-col bg-white lg:flex border-r border-slate-200/60 shadow-[4px_0_24px_rgba(0,0,0,0.02)] z-50 transition-all duration-300`}>
        <div className={`flex h-14 items-center border-b border-slate-50 ${isCollapsed ? 'justify-center px-1' : 'justify-between px-3'}`}>
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
              className="h-8 w-8 rounded-lg text-slate-500 hover:text-sky-700 transition-all flex items-center justify-center"
              title="Thu gọn menu"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          )}
        </div>

        <nav className="mt-1 flex-1 space-y-0.5 overflow-y-auto p-1.5">
          {visibleMenuItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              title={isCollapsed ? item.label : ''}
              className={({ isActive }) =>
                `flex items-center ${isCollapsed ? 'justify-center' : 'gap-1.5'} rounded-md px-2 py-1.5 text-[10px] font-medium tracking-normal transition-all duration-200 group ${
                  isActive
                    ? 'bg-sky-600 text-white shadow-xl shadow-sky-900/30'
                    : 'text-slate-400 hover:bg-slate-50 hover:text-slate-900'
                }`
              }
            >
              <item.icon className={`h-3.5 w-3.5 group-hover:scale-110 transition-transform ${isCollapsed ? '' : 'shrink-0'}`} />
              {!isCollapsed && <span className="truncate">{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="relative mt-auto border-t border-slate-50 bg-slate-50/30 p-1.5">
          {isCollapsed && (
            <button
              type="button"
              onClick={() => {
                setShowAccountMenu(false);
                setIsCollapsed(false);
              }}
              className="mx-auto mb-1 flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-400 shadow-sm transition-all hover:border-sky-200 hover:text-sky-600"
              title="Mở rộng menu"
              aria-label="Mở rộng menu"
            >
              <PanelLeftOpen className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (isCollapsed) {
                setShowAccountMenu(false);
                navigate('/app/settings');
                return;
              }
              setShowAccountMenu((prev) => !prev);
            }}
            aria-expanded={isCollapsed ? undefined : showAccountMenu}
            aria-haspopup={isCollapsed ? undefined : 'menu'}
            title={isCollapsed ? 'Mở hồ sơ cá nhân' : 'Tài khoản'}
            className={`flex w-full items-center ${isCollapsed ? 'justify-center' : 'gap-2 px-1.5'} rounded-md py-1.5 text-[10px] font-medium tracking-normal text-slate-500 transition-all duration-200 hover:bg-white hover:text-sky-700`}
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-100 text-[10px] font-semibold text-sky-700">
              {currentUser.name?.trim()?.charAt(0)?.toUpperCase() || <UserRound className="h-3.5 w-3.5" />}
            </span>
            {!isCollapsed && <span className="min-w-0 flex-1 truncate text-left">{currentUser.name || 'Tài khoản'}</span>}
          </button>

          {!isCollapsed && showAccountMenu && (
            <div className="absolute bottom-full left-2 right-2 z-[60] mb-2 rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl">
              <div className="border-b border-slate-100 px-2.5 py-2">
                <p className="truncate text-xs font-semibold text-slate-800">{currentUser.name || 'Tài khoản'}</p>
                <p className="truncate text-[10px] text-slate-400">{currentUser.email}</p>
              </div>
              {canAccessPath(currentUser.role, '/app/settings', permissions) && (
                <button
                  type="button"
                  onClick={() => {
                    setShowAccountMenu(false);
                    navigate('/app/settings');
                  }}
                  className="flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-xs text-slate-700 hover:bg-slate-50"
                >
                  <Settings className="h-3.5 w-3.5 text-slate-400" />
                  <span>Hồ sơ & cài đặt</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleLogout}
                className="flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-xs text-rose-600 hover:bg-rose-50"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Đăng xuất</span>
              </button>
            </div>
          )}

          {!isCollapsed && (
            <div className="mt-1 text-center animate-in fade-in duration-700">
              <p className="sidebar-footer-note">
                © HKD Smart · Kinh Doanh Tinh Gọn
              </p>
            </div>
          )}
        </div>
      </aside>

      {/* Nội dung chính */}
      <main className="flex min-h-0 flex-1 overflow-y-auto w-full bg-slate-50 relative pb-mobile-nav lg:bg-white lg:pb-0">
        <div className="w-full h-full min-h-0">
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
