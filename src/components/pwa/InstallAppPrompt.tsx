import { Download, Share, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const DISMISSED_KEY = 'hkdcare:pwa-install-dismissed-at';
const DISMISS_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;

const isStandalone = () => (
  window.matchMedia('(display-mode: standalone)').matches
  || Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  || document.referrer.startsWith('android-app://')
);

const isIosDevice = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

const canOfferInstallOnRoute = (pathname: string) => (
  pathname === '/'
  || pathname === '/login'
  || pathname === '/register'
  || pathname.startsWith('/app')
);

const wasRecentlyDismissed = () => {
  try {
    const dismissedAt = Number(localStorage.getItem(DISMISSED_KEY));
    return Number.isFinite(dismissedAt) && Date.now() - dismissedAt < DISMISS_COOLDOWN_MS;
  } catch {
    return false;
  }
};

const rememberDismissal = () => {
  try {
    localStorage.setItem(DISMISSED_KEY, String(Date.now()));
  } catch {
    // Private browsing can deny localStorage. The prompt can still be dismissed for this render.
  }
};

export default function InstallAppPrompt() {
  const location = useLocation();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [installed, setInstalled] = useState(() => isStandalone());
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (!canOfferInstallOnRoute(location.pathname) || installed || wasRecentlyDismissed()) return undefined;

    const showIfEligible = () => setVisible(true);
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      showIfEligible();
    };
    const handleAppInstalled = () => {
      setInstalled(true);
      setVisible(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    // iOS Safari has no beforeinstallprompt event; give it the same first-visit
    // entry point and explain the native Share > Add to Home Screen flow.
    const timer = window.setTimeout(() => {
      if (isIosDevice() && !isStandalone()) showIfEligible();
    }, 900);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [installed, location.pathname]);

  if (!visible || installed) return null;

  const isIos = isIosDevice() && !deferredPrompt;
  const dismiss = () => {
    rememberDismissal();
    setVisible(false);
  };

  const install = async () => {
    if (!deferredPrompt || installing) return;
    setInstalling(true);
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setInstalling(false);
    if (choice.outcome === 'accepted') setInstalled(true);
    else dismiss();
  };

  return (
    <div
      className="fixed inset-x-3 bottom-3 z-[220] sm:left-auto sm:right-5 sm:max-w-sm"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      role="dialog"
      aria-live="polite"
      aria-label="Cài HKDCare trên điện thoại"
    >
      <div className="rounded-2xl border border-sky-100 bg-white p-4 shadow-[0_14px_40px_rgba(15,23,42,0.18)]">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-600 text-white">
            {isIos ? <Share className="h-5 w-5" /> : <Download className="h-5 w-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-900">Dùng HKDCare như một ứng dụng</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  {isIos
                    ? 'Mở menu Chia sẻ, chọn “Thêm vào Màn hình chính” để tạo shortcut trên điện thoại.'
                    : 'Thêm HKDCare vào màn hình chính để mở nhanh như app, vẫn dùng dữ liệu web hiện tại.'}
                </p>
              </div>
              <button type="button" onClick={dismiss} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Để sau">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 flex items-center justify-end gap-2">
              <button type="button" onClick={dismiss} className="h-9 rounded-lg px-3 text-xs font-medium text-slate-500 hover:bg-slate-50">
                Để sau
              </button>
              {isIos ? (
                <button type="button" onClick={dismiss} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-sky-600 px-3 text-xs font-semibold text-white hover:bg-sky-700">
                  <Share className="h-3.5 w-3.5" />
                  Đã hiểu
                </button>
              ) : (
                <button type="button" onClick={() => void install()} disabled={installing} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-sky-600 px-3 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-60">
                  <Download className="h-3.5 w-3.5" />
                  {installing ? 'Đang mở...' : 'Cài ứng dụng'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
