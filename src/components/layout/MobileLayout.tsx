import { NavLink, Outlet, useLocation, Navigate, useNavigate } from 'react-router-dom';
import { Home, ShoppingCart, Package, Users, Wallet, LogOut, Store, Receipt, Settings, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useState } from 'react';
import { authApi } from '../../lib/api';
import { Button } from '../ui/Button';
import { firstAllowedPath, isMenuAllowed, canAccessPath } from '../../lib/permissions';

export default function MobileLayout() {
  const { activeTenant, currentUser, loading, setActiveTenant, setCurrentUser } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [subscriptionHelpMessage, setSubscriptionHelpMessage] = useState('');

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

  const accessBlocked = activeTenant.accessBlocked || activeTenant.status === 'suspended';

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
    { icon: Users, label: 'Khách hàng', shortLabel: 'Khách', path: '/app/customers' },
    { icon: Wallet, label: 'Công nợ', shortLabel: 'Nợ', path: '/app/debt' },
    { icon: Settings, label: 'Cài đặt', shortLabel: 'Tôi', path: '/app/settings' },
  ];
  const visibleMenuItems = menuItems.filter((item) => isMenuAllowed(currentUser.role, item.path));

  const getHeaderTitle = () => {
    const item = visibleMenuItems.find(item => item.path === location.pathname);
    return item ? item.label : 'TDPOS';
  };

  const hiddenTopHeaderRoutes = ['/app/invoices', '/app/inventory', '/app/customers', '/app/debt'];
  const showTopHeader = !hiddenTopHeaderRoutes.includes(location.pathname);

  return (
    <div className={`flex h-screen flex-col bg-slate-50 ${isCollapsed ? 'lg:pl-20' : 'lg:pl-64'} transition-all duration-300 font-sans`}>
      {accessBlocked && (
        <div className="fixed inset-0 z-[200] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-2xl border border-white space-y-4 text-center">
            <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">Gói dùng thử đã hết hạn</h2>
            <p className="text-sm font-bold text-slate-500 leading-relaxed">
              Tài khoản vẫn đăng nhập được nhưng đã bị khóa thao tác. Vui lòng đăng ký gói năm để tiếp tục sử dụng hệ thống.
            </p>
            <div className="rounded-lg bg-sky-50 p-4">
              <p className="text-[10px] font-black text-sky-700 uppercase tracking-widest">Phí dịch vụ</p>
              <p className="text-xl font-black text-sky-700">150.000 đ / tháng</p>
              <p className="text-[10px] font-bold text-slate-500">Thanh toán theo gói năm</p>
            </div>
            <Button
              onClick={() => setSubscriptionHelpMessage('Vui lòng liên hệ đơn vị cung cấp để duyệt subscription và mở lại thao tác.')}
              className="w-full h-11 rounded-lg bg-sky-600 hover:bg-sky-700 font-black uppercase tracking-widest"
            >
              Yêu cầu đăng ký
            </Button>
            {subscriptionHelpMessage && (
              <p className="text-xs text-slate-500">{subscriptionHelpMessage}</p>
            )}
            <Button
              onClick={handleLogout}
              variant="outline"
              className="w-full h-11 rounded-lg font-black uppercase tracking-widest"
            >
              Đăng xuất
            </Button>
          </div>
        </div>
      )}

      {/* Header cho Mobile */}
      <header className={`sticky top-0 z-30 h-14 items-center justify-between glass px-4 border-b border-slate-200/70 lg:hidden ${showTopHeader ? 'flex' : 'hidden'}`}>
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-600 text-white shadow-lg shadow-sky-900/20">
            <Store className="h-5 w-5" />
          </div>
          <span className="font-semibold text-slate-900 tracking-tight text-[15px]">{getHeaderTitle()}</span>
        </div>
        <button 
          onClick={handleLogout} 
          className="h-9 w-9 flex items-center justify-center rounded-full text-slate-300 hover:text-red-500 transition-colors"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </header>

      {/* Sidebar cho Desktop */}
      <aside className={`fixed inset-y-0 left-0 hidden ${isCollapsed ? 'w-20' : 'w-64'} flex-col bg-white lg:flex border-r border-slate-200/60 shadow-[4px_0_24px_rgba(0,0,0,0.02)] z-50 transition-all duration-300`}>
        <div className={`flex h-20 items-center border-b border-slate-50 ${isCollapsed ? 'justify-center px-2' : 'justify-between px-6'}`}>
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-600 text-white shadow-lg shadow-sky-900/20 shrink-0">
              <Store className="h-6 w-6" />
            </div>
            {!isCollapsed && (
              <div className="animate-in fade-in slide-in-from-left-2 duration-300">
                <div className="font-black text-slate-900 font-display tracking-tighter text-lg italic uppercase leading-none">TDPOS</div>
                <div className="text-[9px] uppercase tracking-[0.2em] font-bold text-sky-600/80 mt-1 truncate max-w-[120px]">{activeTenant.name}</div>
              </div>
            )}
          </div>
          {!isCollapsed && (
            <button 
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="h-8 w-8 rounded-lg text-slate-300 hover:text-sky-600 hover:bg-sky-50 transition-all flex items-center justify-center"
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
                © TDPOS<br/>All rights reserved.
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
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md pb-safe lg:hidden border-t border-slate-200 shadow-[0_-6px_24px_rgba(15,23,42,0.08)]">
        <div className="grid" style={{ gridTemplateColumns: `repeat(${visibleMenuItems.length}, minmax(0, 1fr))` }}>
        {visibleMenuItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex min-w-0 flex-col items-center justify-center gap-1 py-2.5 transition-all duration-200 ${
                isActive ? 'text-sky-600' : 'text-slate-500'
              }`
            }
          >
            <item.icon className="h-[19px] w-[19px] transition-transform duration-200" />
            <span className="max-w-full truncate px-1 text-[11px] font-semibold leading-none tracking-normal max-[390px]:hidden">{item.shortLabel}</span>
          </NavLink>
        ))}
        </div>
      </nav>
    </div>
  );
}
