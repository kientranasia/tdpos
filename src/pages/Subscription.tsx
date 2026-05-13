import { useEffect, useMemo, useState } from 'react';
import { Crown, RefreshCw } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { subscriptionApi } from '../lib/api';
import { formatCurrency } from '../lib/utils';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

const statusLabel: Record<string, string> = {
  trial: 'Dùng thử',
  active: 'Đang hoạt động',
  pending_review: 'Chờ duyệt',
  expired: 'Hết hạn',
  cancelled: 'Đã hủy',
};

export default function Subscription() {
  const { activeTenant, currentUser, setActiveTenant } = useApp();
  const [loading, setLoading] = useState(true);
  const [isRequesting, setIsRequesting] = useState(false);
  const [message, setMessage] = useState('');
  const [note, setNote] = useState('');
  const [selectedPackageCode, setSelectedPackageCode] = useState('');
  const [packages, setPackages] = useState<any[]>([]);
  const [subscription, setSubscription] = useState<any>(null);
  const [requestLogs, setRequestLogs] = useState<any[]>([]);

  const loadData = async (silent = false) => {
    setLoading(true);
    if (!silent) setMessage('');
    try {
      const data = await subscriptionApi.me();
      setPackages(data.packages || []);
      setSubscription(data.subscription || null);
      setRequestLogs(data.requestLogs || []);
      setSelectedPackageCode(data.tenant?.packageCode || data.packages?.[0]?.code || '');
      if (data.tenant) setActiveTenant(data.tenant);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Không thể tải dữ liệu subscription.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const canRequestUpgrade = currentUser?.role === 'owner';

  const trialDaysLeft = useMemo(() => {
    const end = activeTenant?.trialEndAt ? new Date(activeTenant.trialEndAt).getTime() : 0;
    if (!end) return null;
    const diff = end - Date.now();
    return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)));
  }, [activeTenant?.trialEndAt]);

  const requestUpgrade = async () => {
    if (!selectedPackageCode) {
      setMessage('Vui lòng chọn gói.');
      return;
    }
    setIsRequesting(true);
    setMessage('');
    try {
      const response = await subscriptionApi.requestUpgrade(selectedPackageCode, note || undefined);
      if (response?.tenant) setActiveTenant(response.tenant);
      setMessage('Đã gửi yêu cầu nâng cấp thành công. Admin sẽ duyệt sớm.');
      await loadData(true);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Không thể gửi yêu cầu.');
    } finally {
      setIsRequesting(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-slate-100/60">
      <div className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="hidden items-center gap-4 lg:flex">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-sky-600 text-white shadow-lg">
              <Crown className="h-8 w-8" />
            </div>
            <div>
              <h1 className="text-page-title">Subscription</h1>
              <p className="text-page-subtitle">Quản lý gói dịch vụ và quyền sử dụng tenant.</p>
            </div>
          </div>
          <Button variant="outline" onClick={loadData} className="h-10">
            <RefreshCw className="mr-2 h-4 w-4" />
            Tải lại
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-xs text-slate-500">Trạng thái</p>
              <p className="mt-2 text-base font-semibold text-slate-900">{statusLabel[activeTenant?.subscriptionStatus || 'trial'] || '-'}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-xs text-slate-500">Gói hiện tại</p>
              <p className="mt-2 text-base font-semibold text-slate-900">{activeTenant?.packageName || 'Starter 1'}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-xs text-slate-500">Giá / tháng</p>
              <p className="mt-2 text-base font-semibold text-sky-700">{formatCurrency(activeTenant?.packagePriceMonthly || 150000)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-xs text-slate-500">Dùng thử còn lại</p>
              <p className="mt-2 text-base font-semibold text-amber-700">{trialDaysLeft ?? 0} ngày</p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4">
            <h2 className="text-base font-semibold text-slate-900">Nâng cấp gói</h2>
            {loading ? (
              <p className="text-sm text-slate-500">Đang tải danh sách gói...</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {packages.map((pkg) => (
                  <button
                    key={pkg.id}
                    onClick={() => setSelectedPackageCode(pkg.code)}
                    className={`rounded-lg border p-4 text-left transition ${selectedPackageCode === pkg.code ? 'border-sky-600 bg-sky-50' : 'border-slate-200 hover:border-sky-300'}`}
                  >
                    <p className="text-base font-semibold text-slate-900">{pkg.name}</p>
                    <p className="text-sm text-slate-500">{pkg.code}</p>
                    <p className="mt-2 text-lg font-semibold text-sky-700">{formatCurrency(pkg.priceMonthly)}/tháng</p>
                    <p className="text-sm text-slate-600">{pkg.maxUsers} user</p>
                  </button>
                ))}
              </div>
            )}

            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ghi chú cho admin (không bắt buộc)"
            />

            <div className="flex flex-wrap gap-3">
              <Button onClick={requestUpgrade} disabled={!canRequestUpgrade || isRequesting}>
                {isRequesting ? 'Đang gửi...' : 'Gửi yêu cầu nâng cấp'}
              </Button>
              {!canRequestUpgrade && (
                <p className="text-sm text-amber-700">Chỉ owner mới có thể gửi yêu cầu nâng cấp.</p>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
            <h2 className="text-base font-semibold text-slate-900">Bản ghi subscription</h2>
            {!subscription ? (
              <p className="mt-3 text-sm text-slate-500">Chưa có bản ghi subscription.</p>
            ) : (
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-slate-200 p-3 text-sm">
                  <p className="text-slate-500">Plan</p>
                  <p className="font-medium text-slate-900">{subscription.plan || '-'}</p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3 text-sm">
                  <p className="text-slate-500">Status</p>
                  <p className="font-medium text-slate-900">{statusLabel[subscription.status] || subscription.status}</p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3 text-sm">
                  <p className="text-slate-500">Start</p>
                  <p className="font-medium text-slate-900">{subscription.startAt ? new Date(subscription.startAt).toLocaleString('vi-VN') : '-'}</p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3 text-sm">
                  <p className="text-slate-500">End</p>
                  <p className="font-medium text-slate-900">{subscription.endAt ? new Date(subscription.endAt).toLocaleString('vi-VN') : '-'}</p>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
            <h2 className="text-base font-semibold text-slate-900">Lịch sử yêu cầu nâng cấp</h2>
            {requestLogs.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">Chưa có yêu cầu nào được ghi nhận.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {requestLogs.map((log) => (
                  <div key={log.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-slate-900">{log.meta?.packageName || log.meta?.packageCode || 'Package'}</p>
                      <p className="text-xs text-slate-500">{new Date(log.createdAt).toLocaleString('vi-VN')}</p>
                    </div>
                    <p className="mt-1 text-sm text-slate-700">
                      Giá: {formatCurrency(Number(log.meta?.priceMonthly || 0))}/tháng
                    </p>
                    {log.meta?.note && <p className="mt-1 text-xs text-slate-500">Ghi chú: {log.meta.note}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {message && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div>
          )}
        </div>
      </div>
    </div>
  );
}
