import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertCircle, ArrowRight, Crown, LayoutDashboard, Package, ShoppingCart, Users, Wallet, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Button } from '../components/ui/Button';
import { formatCurrency } from '../lib/utils';
import { subscriptionApi } from '../lib/api';

const dateKey = (value: string) => new Date(value).toISOString().slice(0, 10);

export default function Dashboard() {
  const { activeTenant, currentUser, invoices, products, customers, setActiveTenant } = useApp();
  const navigate = useNavigate();
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [packages, setPackages] = useState<any[]>([]);
  const [loadingPackages, setLoadingPackages] = useState(false);
  const [selectedPackageCode, setSelectedPackageCode] = useState('');
  const [upgradeMessage, setUpgradeMessage] = useState('');
  const [isRequestingUpgrade, setIsRequestingUpgrade] = useState(false);

  const today = new Date();
  const todayString = dateKey(today.toISOString());

  const todayInvoices = useMemo(
    () => invoices.filter((inv) => dateKey(inv.createdAt) === todayString),
    [invoices, todayString]
  );

  const kpis = useMemo(() => {
    const totalDebt = customers.reduce((sum, c) => sum + c.totalDebt, 0);
    const lowStockCount = products.filter((p) => p.trackStock && p.stock <= p.lowStockThreshold).length;
    return {
      todayRevenue: todayInvoices.reduce((sum, inv) => sum + inv.finalAmount, 0),
      todayOrders: todayInvoices.length,
      totalDebt,
      lowStockCount,
      totalCustomers: customers.length,
    };
  }, [customers, products, todayInvoices]);

  const revenueChartData = useMemo(() => {
    const last14Days = Array.from({ length: 14 }, (_, idx) => {
      const d = new Date();
      d.setDate(d.getDate() - (13 - idx));
      const key = dateKey(d.toISOString());
      const label = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
      const revenue = invoices
        .filter((inv) => dateKey(inv.createdAt) === key)
        .reduce((sum, inv) => sum + inv.finalAmount, 0);
      return { key, label, revenue };
    });
    return last14Days;
  }, [invoices]);

  const merchantInsights = useMemo(() => {
    const paidInvoices = invoices.filter((inv) => inv.status === 'completed');
    const debtInvoices = invoices.filter((inv) => inv.paymentMethod === 'debt');
    const collectedDebt = debtInvoices.reduce((sum, inv) => sum + ((inv.paidAmount || 0) - (inv.totalAmount - inv.debtAmount)), 0);
    const debtCollectionRate = debtInvoices.length === 0
      ? 100
      : Math.max(0, Math.min(100, (collectedDebt / Math.max(1, debtInvoices.reduce((s, i) => s + i.debtAmount, 0))) * 100));

    const customerOrderCount = new Map<string, number>();
    invoices.forEach((inv) => {
      if (!inv.customerId) return;
      customerOrderCount.set(inv.customerId, (customerOrderCount.get(inv.customerId) || 0) + 1);
    });
    const repeatCustomers = Array.from(customerOrderCount.values()).filter((count) => count >= 2).length;
    const knownCustomers = customerOrderCount.size;
    const repeatRate = knownCustomers === 0 ? 0 : Math.round((repeatCustomers / knownCustomers) * 100);

    const thisWeekRevenue = revenueChartData.slice(-7).reduce((sum, d) => sum + d.revenue, 0);
    const lastWeekRevenue = revenueChartData.slice(0, 7).reduce((sum, d) => sum + d.revenue, 0);
    const weeklyGrowth = lastWeekRevenue === 0
      ? (thisWeekRevenue > 0 ? 100 : 0)
      : Math.round(((thisWeekRevenue - lastWeekRevenue) / lastWeekRevenue) * 100);

    const avgOrderValue = paidInvoices.length === 0
      ? 0
      : Math.round(paidInvoices.reduce((sum, inv) => sum + inv.finalAmount, 0) / paidInvoices.length);

    return {
      repeatRate,
      weeklyGrowth,
      avgOrderValue,
      debtCollectionRate: Math.round(debtCollectionRate),
    };
  }, [invoices, revenueChartData]);

  const recentInvoices = useMemo(
    () => [...invoices].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 6),
    [invoices]
  );

  const topDebtors = useMemo(
    () => [...customers].filter((c) => c.totalDebt > 0).sort((a, b) => b.totalDebt - a.totalDebt).slice(0, 6),
    [customers]
  );

  const lowStockProducts = useMemo(
    () => products.filter((p) => p.trackStock && p.stock <= p.lowStockThreshold).slice(0, 6),
    [products]
  );

  const openUpgradeModal = async () => {
    setShowUpgradeModal(true);
    setUpgradeMessage('');
    setLoadingPackages(true);
    try {
      const rows = await subscriptionApi.packages();
      setPackages(rows);
      const defaultCode = activeTenant?.packageCode || rows[0]?.code || '';
      setSelectedPackageCode(defaultCode);
    } catch (err) {
      setUpgradeMessage(err instanceof Error ? err.message : 'Không thể tải danh sách gói.');
    } finally {
      setLoadingPackages(false);
    }
  };

  const submitUpgradeRequest = async () => {
    if (!selectedPackageCode) {
      setUpgradeMessage('Vui lòng chọn gói nâng cấp.');
      return;
    }
    setIsRequestingUpgrade(true);
    setUpgradeMessage('');
    try {
      const response = await subscriptionApi.requestUpgrade(selectedPackageCode);
      if (response?.tenant) setActiveTenant(response.tenant);
      setUpgradeMessage('Đã gửi yêu cầu nâng cấp. Admin sẽ duyệt subscription sớm.');
    } catch (err) {
      setUpgradeMessage(err instanceof Error ? err.message : 'Không thể gửi yêu cầu nâng cấp.');
    } finally {
      setIsRequestingUpgrade(false);
    }
  };

  const careTasks = useMemo(() => {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const maxDebtDays = activeTenant?.settings?.debtPolicy?.maxDebtDays || 30;
    const lastPurchaseByCustomer = new Map<string, string>();
    const dueByCustomer = new Map<string, string>();

    invoices.forEach((inv) => {
      if (!inv.customerId) return;
      const existingPurchase = lastPurchaseByCustomer.get(inv.customerId);
      if (!existingPurchase || new Date(inv.createdAt).getTime() > new Date(existingPurchase).getTime()) {
        lastPurchaseByCustomer.set(inv.customerId, inv.createdAt);
      }
      if (inv.debtAmount > 0) {
        const due = new Date(new Date(inv.createdAt).getTime() + maxDebtDays * dayMs).toISOString();
        const existingDue = dueByCustomer.get(inv.customerId);
        if (!existingDue || new Date(due).getTime() > new Date(existingDue).getTime()) {
          dueByCustomer.set(inv.customerId, due);
        }
      }
    });

    const debtCustomers = customers.filter((c) => c.totalDebt > 0);
    const dueSoon = debtCustomers.filter((c) => {
      const due = dueByCustomer.get(c.id);
      if (!due) return false;
      const dueTs = new Date(due).getTime();
      return dueTs >= now && dueTs <= now + 7 * dayMs;
    }).length;
    const overdue = debtCustomers.filter((c) => {
      const due = dueByCustomer.get(c.id);
      return !!due && new Date(due).getTime() < now;
    }).length;
    const inactive7 = customers.filter((c) => {
      const last = lastPurchaseByCustomer.get(c.id);
      if (!last) return true;
      return now - new Date(last).getTime() >= 7 * dayMs;
    }).length;
    const inactive30 = customers.filter((c) => {
      const last = lastPurchaseByCustomer.get(c.id);
      if (!last) return true;
      return now - new Date(last).getTime() >= 30 * dayMs;
    }).length;

    return { dueSoon, overdue, inactive7, inactive30 };
  }, [activeTenant?.settings?.debtPolicy?.maxDebtDays, customers, invoices]);

  return (
    <div className="flex h-full flex-col bg-slate-50 animate-in fade-in duration-500 overflow-hidden">
      <div className="p-4 lg:p-8 bg-white border-b sticky top-0 z-40 flex flex-col lg:flex-row gap-3 lg:gap-6 items-start lg:items-center justify-between shadow-sm shrink-0">
        <div className="hidden lg:flex items-center gap-5">
          <div className="h-9 w-9 sm:h-12 sm:w-12 rounded-lg bg-sky-600 text-white flex items-center justify-center shadow-lg shadow-sky-900/20 transform -rotate-3 shrink-0">
            <LayoutDashboard className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>
          <div>
            <h1 className="text-page-title">Tổng quan</h1>
            <p className="text-page-subtitle mt-1">{activeTenant?.name || 'Tenant'} • Cập nhật theo dữ liệu bán hàng thực tế</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
          <Button variant="outline" className="h-10 lg:h-11 text-sm" onClick={openUpgradeModal}>
            Nâng cấp gói
          </Button>
          <Button variant="outline" className="h-10 lg:h-11 text-sm" onClick={() => navigate('/app/invoices')}>
            Lịch sử đơn
          </Button>
          <Button className="h-10 lg:h-11 text-sm" onClick={() => navigate('/app/pos')}>
            Tạo đơn mới
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-5 p-4 md:gap-6 md:p-6">

      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Doanh thu hôm nay</p>
          <p className="mt-2 text-base font-semibold text-slate-900">{formatCurrency(kpis.todayRevenue)}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Đơn hôm nay</p>
          <p className="mt-2 text-base font-semibold text-slate-900">{kpis.todayOrders}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Công nợ hiện tại</p>
          <p className="mt-2 text-base font-semibold text-amber-700">{formatCurrency(kpis.totalDebt)}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Sản phẩm sắp hết</p>
          <p className="mt-2 text-base font-semibold text-rose-700">{kpis.lowStockCount}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Khách hàng</p>
          <p className="mt-2 text-base font-semibold text-slate-900">{kpis.totalCustomers}</p>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4 xl:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Doanh thu 14 ngày</h2>
          </div>
          <div className="h-[260px] w-full min-h-[260px]">
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={revenueChartData}>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Area type="monotone" dataKey="revenue" stroke="#0284c7" fill="#bae6fd" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Cảnh báo kho</h2>
            <AlertCircle className="h-4 w-4 text-amber-600" />
          </div>
          <div className="space-y-3">
            {lowStockProducts.length === 0 && <p className="text-sm text-slate-500">Kho hàng đang ổn định.</p>}
            {lowStockProducts.map((product) => (
              <div key={product.id} className="flex items-center justify-between rounded-lg border border-slate-100 p-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">{product.name}</p>
                  <p className="text-xs text-slate-500">{product.sku}</p>
                </div>
                <p className="text-sm font-semibold text-rose-700">
                  {product.stock} {product.unit}
                </p>
              </div>
            ))}
          </div>
          <Button variant="ghost" className="mt-4 h-9 w-full text-sm" onClick={() => navigate('/app/inventory')}>
            Mở kho hàng <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Đơn gần đây</h2>
            <ShoppingCart className="h-4 w-4 text-slate-500" />
          </div>
          <div className="space-y-2">
            {recentInvoices.length === 0 && <p className="text-sm text-slate-500">Chưa có đơn hàng.</p>}
            {recentInvoices.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between rounded-lg border border-slate-100 p-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">#{inv.id}</p>
                  <p className="text-xs text-slate-500">{new Date(inv.createdAt).toLocaleString('vi-VN')}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-slate-900">{formatCurrency(inv.finalAmount)}</p>
                  <p className="text-xs text-slate-500">{inv.status}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Khách nợ cao</h2>
            <Wallet className="h-4 w-4 text-amber-600" />
          </div>
          <div className="space-y-2">
            {topDebtors.length === 0 && <p className="text-sm text-slate-500">Không có khách đang nợ.</p>}
            {topDebtors.map((customer) => (
              <button
                key={customer.id}
                className="flex w-full items-center justify-between rounded-lg border border-slate-100 p-3 text-left hover:bg-slate-50"
                onClick={() => navigate(`/app/customers/${customer.id}`)}
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-slate-100 p-2">
                    <Users className="h-4 w-4 text-slate-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">{customer.name}</p>
                    <p className="text-xs text-slate-500">{customer.phone}</p>
                  </div>
                </div>
                <p className="text-sm font-semibold text-amber-700">{formatCurrency(customer.totalDebt)}</p>
              </button>
            ))}
          </div>
          <Button variant="ghost" className="mt-4 h-9 w-full text-sm" onClick={() => navigate('/app/debt')}>
            Quản lý công nợ <Package className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-slate-900">Insight Merchant</h2>
          <p className="text-xs text-slate-500">Các chỉ số vận hành cốt lõi cho owner.</p>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Khách quay lại</p>
            <p className="mt-1 text-base font-semibold text-slate-900">{merchantInsights.repeatRate}%</p>
          </div>
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Tăng trưởng tuần</p>
            <p className={`mt-1 text-base font-semibold ${merchantInsights.weeklyGrowth >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
              {merchantInsights.weeklyGrowth >= 0 ? '+' : ''}{merchantInsights.weeklyGrowth}%
            </p>
          </div>
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Giá trị đơn TB</p>
            <p className="mt-1 text-base font-semibold text-slate-900">{formatCurrency(merchantInsights.avgOrderValue)}</p>
          </div>
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Tỷ lệ thu nợ</p>
            <p className="mt-1 text-base font-semibold text-amber-700">{merchantInsights.debtCollectionRate}%</p>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-slate-900">Care Tasks Today</h2>
          <p className="text-xs text-slate-500">Danh sách ưu tiên để chăm khách và thu hồi công nợ nhanh.</p>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <button
            className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-left hover:bg-amber-100"
            onClick={() => navigate('/app/debt?careFilter=due_soon')}
          >
            <p className="text-xs text-amber-700">Sắp đến hạn</p>
            <p className="mt-1 text-lg font-semibold text-amber-800">{careTasks.dueSoon}</p>
          </button>
          <button
            className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-left hover:bg-rose-100"
            onClick={() => navigate('/app/debt?careFilter=debt')}
          >
            <p className="text-xs text-rose-700">Còn nợ</p>
            <p className="mt-1 text-lg font-semibold text-rose-800">{topDebtors.length}</p>
          </button>
          <button
            className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-left hover:bg-sky-100"
            onClick={() => navigate('/app/debt?careFilter=inactive_7')}
          >
            <p className="text-xs text-sky-700">7 ngày chưa mua</p>
            <p className="mt-1 text-lg font-semibold text-sky-800">{careTasks.inactive7}</p>
          </button>
          <button
            className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-left hover:bg-slate-100"
            onClick={() => navigate('/app/debt?careFilter=inactive_30')}
          >
            <p className="text-xs text-slate-700">30 ngày chưa mua</p>
            <p className="mt-1 text-lg font-semibold text-slate-800">{careTasks.inactive30}</p>
          </button>
        </div>
      </section>
      </div>
      </div>

      {showUpgradeModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/45 p-4">
          <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
                  <Crown className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Nâng cấp gói sử dụng</h3>
                  <p className="text-sm text-slate-500">Đồng bộ trực tiếp từ bảng giá trong admin cpanel.</p>
                </div>
              </div>
              <button onClick={() => setShowUpgradeModal(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 px-5 py-5">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                Gói hiện tại: <span className="font-semibold">{activeTenant?.packageName || 'Starter 1'}</span> · {formatCurrency(activeTenant?.packagePriceMonthly || 150000)}/tháng · {activeTenant?.maxUsers || 1} user
              </div>

              {loadingPackages ? (
                <p className="text-sm text-slate-500">Đang tải danh sách gói...</p>
              ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {packages.map((pkg) => (
                    <button
                      key={pkg.id}
                      className={`rounded-xl border p-4 text-left transition ${
                        selectedPackageCode === pkg.code ? 'border-sky-600 bg-sky-50' : 'border-slate-200 hover:border-sky-300'
                      }`}
                      onClick={() => setSelectedPackageCode(pkg.code)}
                    >
                      <p className="text-base font-semibold text-slate-900">{pkg.name}</p>
                      <p className="text-sm text-slate-500">{pkg.code}</p>
                      <p className="mt-2 text-xl font-semibold text-sky-700">{formatCurrency(pkg.priceMonthly)}/tháng</p>
                      <p className="mt-1 text-sm text-slate-600">{pkg.maxUsers} user</p>
                    </button>
                  ))}
                </div>
              )}

              {upgradeMessage && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  {upgradeMessage}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-5 py-4">
              <Button variant="outline" onClick={() => setShowUpgradeModal(false)}>
                Đóng
              </Button>
              <Button disabled={isRequestingUpgrade || currentUser?.role !== 'owner'} onClick={submitUpgradeRequest}>
                {isRequestingUpgrade ? 'Đang gửi...' : 'Gửi yêu cầu nâng cấp'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
