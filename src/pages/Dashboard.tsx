import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertCircle, ArrowRight, Package, ShoppingCart, Users, Wallet } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Button } from '../components/ui/Button';
import { formatCurrency } from '../lib/utils';
import AppPageHeader from '../components/layout/AppPageHeader';

const dateKey = (value: string) => new Date(value).toISOString().slice(0, 10);

export default function Dashboard() {
  const { activeTenant, invoices, products, customers } = useApp();
  const navigate = useNavigate();

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
    const last7Days = Array.from({ length: 7 }, (_, idx) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - idx));
      const key = dateKey(d.toISOString());
      const label = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
      const revenue = invoices
        .filter((inv) => dateKey(inv.createdAt) === key)
        .reduce((sum, inv) => sum + inv.finalAmount, 0);
      return { key, label, revenue };
    });
    return last7Days;
  }, [invoices]);

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

  return (
    <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-5 p-4 md:gap-6 md:p-6">
      <AppPageHeader
        title="Dashboard"
        subtitle={`${activeTenant?.name || 'Tenant'} • Cập nhật theo dữ liệu bán hàng thực tế`}
        actions={(
          <>
            <Button variant="outline" className="h-10 text-sm" onClick={() => navigate('/app/invoices')}>
              Lịch sử đơn
            </Button>
            <Button className="h-10 text-sm" onClick={() => navigate('/app/pos')}>
              Tạo đơn mới
            </Button>
          </>
        )}
      />

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
            <h2 className="text-sm font-semibold text-slate-900">Doanh thu 7 ngày</h2>
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
    </div>
  );
}
