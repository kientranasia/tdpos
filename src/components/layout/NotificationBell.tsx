import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck, ClipboardCheck, ExternalLink, Package, Receipt, RefreshCw, Wallet } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { notificationsApi } from '../../lib/api';
import { AppNotification } from '../../types';

interface NotificationBellProps {
  lowStockCount: number;
}

type PermissionState = 'default' | 'granted' | 'denied' | 'unsupported';

const notificationTarget = (item: AppNotification) => {
  switch (item.entityType) {
    case 'invoice': return item.entityId ? `/app/invoices?invoiceId=${encodeURIComponent(item.entityId)}` : '/app/invoices';
    case 'purchase': return '/app/purchases';
    case 'purchase_return': return '/app/purchase-returns';
    case 'sales_return': return '/app/returns';
    case 'cashbook': return '/app/cashbook';
    case 'payment': return '/app/debt';
    case 'stock_movement': return '/app/stock-check';
    default: return '/';
  }
};

const notificationIcon = (type: string) => {
  if (type.includes('stock')) return ClipboardCheck;
  if (type.includes('cash') || type === 'payment') return Wallet;
  if (type.includes('purchase')) return Package;
  if (type.includes('sale') || type.includes('invoice')) return Receipt;
  return Bell;
};

const relativeTime = (value: string) => {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return 'Vừa xong';
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.round(hours / 24);
  return `${days} ngày trước`;
};

export default function NotificationBell({ lowStockCount }: NotificationBellProps) {
  const { activeTenant, currentUser } = useApp();
  const navigate = useNavigate();
  const isOwner = currentUser?.role === 'owner';
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [notificationError, setNotificationError] = useState('');
  const [toastItems, setToastItems] = useState<AppNotification[]>([]);
  const [permissionState, setPermissionState] = useState<PermissionState>(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
    return window.Notification.permission;
  });
  const knownIdsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);

  const openTarget = useCallback((item: AppNotification) => {
    navigate(notificationTarget(item));
    setOpen(false);
  }, [navigate]);

  const loadNotifications = useCallback(async () => {
    if (!isOwner || !activeTenant?.id) return;
    setLoading(true);
    try {
      const result = await notificationsApi.list(40);
      const nextItems = (result.items || []) as AppNotification[];
      const newItems = initializedRef.current
        ? nextItems.filter((item) => !knownIdsRef.current.has(item.id) && Number(item.isRead) === 0)
        : [];
      setItems(nextItems);
      setUnreadCount(Number(result.unreadCount || 0));
      setNotificationError('');
      knownIdsRef.current = new Set(nextItems.map((item) => item.id));
      initializedRef.current = true;

      if (newItems.length > 0) {
        setToastItems(newItems.slice(0, 3));
        window.setTimeout(() => setToastItems([]), 8_000);
      }

      if (newItems.length > 0 && permissionState === 'granted' && 'Notification' in window) {
        const showDeviceNotification = async (item: AppNotification) => {
          const target = notificationTarget(item);
          const registration = 'serviceWorker' in navigator
            ? await navigator.serviceWorker.ready.catch(() => null)
            : null;
          if (registration?.showNotification) {
            await registration.showNotification(item.title, {
              body: item.body,
              tag: item.id,
              icon: '/branding/hkdsmart-icon.png',
              data: { target },
            });
            return;
          }
          const notification = new window.Notification(item.title, { body: item.body, tag: item.id });
          notification.onclick = () => {
            window.focus();
            openTarget(item);
            notification.close();
          };
        };
        void Promise.all(newItems.slice(0, 3).map(showDeviceNotification)).catch(() => undefined);
      }
    } catch (error) {
      // Notifications are additive and must not interrupt the current screen.
      setNotificationError(error instanceof Error ? error.message : 'Không thể tải thông báo.');
      console.warn('Không thể tải thông báo:', error);
    } finally {
      setLoading(false);
    }
  }, [activeTenant?.id, isOwner, openTarget, permissionState]);

  useEffect(() => {
    if (!isOwner || !activeTenant?.id) {
      setItems([]);
      setUnreadCount(0);
      knownIdsRef.current = new Set();
      initializedRef.current = false;
      return;
    }
    void loadNotifications();
    const timer = window.setInterval(() => void loadNotifications(), 15_000);
    const handleFocus = () => void loadNotifications();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void loadNotifications();
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [activeTenant?.id, isOwner, loadNotifications]);

  const requestDevicePermission = async () => {
    if (!('Notification' in window)) {
      setPermissionState('unsupported');
      return;
    }
    const result = await window.Notification.requestPermission();
    setPermissionState(result);
  };

  const markRead = async (item: AppNotification) => {
    if (Number(item.isRead) === 0) {
      setItems((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, isRead: 1, readAt: new Date().toISOString() } : candidate));
      setUnreadCount((count) => Math.max(0, count - 1));
      await notificationsApi.markRead(item.id).catch(() => undefined);
    }
    openTarget(item);
  };

  const markAllRead = async () => {
    if (!unreadCount) return;
    setItems((current) => current.map((item) => ({ ...item, isRead: 1, readAt: new Date().toISOString() })));
    setUnreadCount(0);
    await notificationsApi.markAllRead().catch(() => undefined);
  };

  const badgeCount = isOwner ? unreadCount : lowStockCount;
  const badgeText = badgeCount > 9 ? '9+' : String(badgeCount);
  const toggleNotifications = () => {
    if (!isOwner) {
      navigate('/app/inventory');
      return;
    }
    setOpen((value) => !value);
    void loadNotifications();
  };

  return (
    <div className="relative">
      {isOwner && toastItems.length > 0 && (
        <div
          className="pointer-events-none fixed right-3 top-16 z-[210] flex w-[min(22rem,calc(100vw-1.5rem))] flex-col gap-2 md:right-5 md:top-16"
          role="status"
          aria-live="polite"
          aria-label="Thông báo mới"
        >
          {toastItems.map((item) => (
            <button
              type="button"
              key={item.id}
              onClick={() => void markRead(item)}
              className="pointer-events-auto flex items-start gap-2.5 rounded-xl border border-sky-200 bg-white px-3 py-3 text-left shadow-2xl ring-1 ring-sky-100 transition hover:bg-sky-50"
            >
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                <Bell className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-sky-700">Thông báo mới</span>
                <span className="mt-0.5 block text-xs font-semibold text-slate-800">{item.title}</span>
                <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">{item.body}</span>
                <span className="mt-1 block text-[10px] text-slate-400">Nhấn để xem chi tiết</span>
              </span>
            </button>
          ))}
        </div>
      )}
      <button
        onClick={toggleNotifications}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg brand-surface text-slate-600 transition-colors hover:text-sky-600 md:h-10 md:w-10"
        title={isOwner ? 'Thông báo' : 'Hàng sắp hết'}
        aria-label={isOwner ? `Thông báo${unreadCount ? `, ${unreadCount} chưa đọc` : ''}` : 'Hàng sắp hết'}
        aria-expanded={isOwner ? open : undefined}
      >
        <Bell className="h-4 w-4 md:h-5 md:w-5" />
        {badgeCount > 0 && (
          <span className="absolute -right-1 -top-1 min-h-4 min-w-4 rounded-full bg-orange-500 px-1 text-center text-[10px] font-semibold leading-4 text-white">
            {badgeText}
          </span>
        )}
      </button>

      {isOwner && open && (
        <div className="absolute right-0 top-11 z-[120] w-[min(23rem,calc(100vw-1rem))] overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-800 shadow-xl md:top-12 lg:left-full lg:right-auto lg:top-0 lg:ml-2 lg:w-[25rem]">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5">
            <div>
              <p className="text-sm font-semibold">Thông báo</p>
              <p className="text-[11px] text-slate-400">Hoạt động mới từ nhân viên</p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => void loadNotifications()}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-50 hover:text-sky-600"
                title="Làm mới"
                aria-label="Làm mới thông báo"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button
                type="button"
                onClick={() => void markAllRead()}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-50 hover:text-sky-600 disabled:cursor-default disabled:opacity-40"
                title="Đánh dấu đã đọc"
                aria-label="Đánh dấu tất cả đã đọc"
                disabled={!unreadCount}
              >
                <CheckCheck className="h-4 w-4" />
              </button>
            </div>
          </div>

          {permissionState === 'default' && (
            <button
              type="button"
              onClick={() => void requestDevicePermission()}
              className="flex w-full items-center gap-2 border-b border-slate-100 bg-sky-50 px-3 py-2 text-left text-xs text-sky-700 hover:bg-sky-100"
            >
              <Bell className="h-4 w-4 shrink-0" />
              <span>Bật thông báo trên điện thoại</span>
              <ExternalLink className="ml-auto h-3.5 w-3.5 shrink-0" />
            </button>
          )}
          {permissionState === 'denied' && (
            <p className="border-b border-slate-100 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
              Thông báo trình duyệt đang bị chặn. Hãy bật lại quyền thông báo trong cài đặt trình duyệt.
            </p>
          )}
          {notificationError && (
            <p className="border-b border-slate-100 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
              {notificationError}
            </p>
          )}

          <div className="max-h-72 overflow-y-auto">
            {items.map((item) => {
              const Icon = notificationIcon(item.type);
              return (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => void markRead(item)}
                  className={`flex w-full gap-2.5 border-b border-slate-50 px-3 py-2.5 text-left transition-colors hover:bg-slate-50 ${Number(item.isRead) === 0 ? 'bg-sky-50/70' : 'bg-white'}`}
                >
                  <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${Number(item.isRead) === 0 ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-500'}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start gap-1">
                      <span className="text-xs font-semibold leading-4 text-slate-800">{item.title}</span>
                      {Number(item.isRead) === 0 && <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-600" />}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">{item.body}</span>
                    <span className="mt-1 block text-[10px] text-slate-400">{item.actorName || 'Nhân viên'} · {relativeTime(item.createdAt)}</span>
                  </span>
                </button>
              );
            })}
            {!items.length && (
              <div className="px-4 py-8 text-center text-xs text-slate-400">
                Chưa có thông báo mới.
              </div>
            )}
          </div>

          {lowStockCount > 0 && (
            <button
              type="button"
              onClick={() => { setOpen(false); navigate('/app/inventory'); }}
              className="flex w-full items-center gap-2 border-t border-slate-100 bg-amber-50 px-3 py-2 text-left text-xs text-amber-700 hover:bg-amber-100"
            >
              <Package className="h-4 w-4" />
              <span>Có {lowStockCount} mặt hàng sắp hết</span>
              <ExternalLink className="ml-auto h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
