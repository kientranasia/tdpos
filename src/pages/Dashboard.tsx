import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowRight, LayoutDashboard, ShoppingCart, Users, Wallet } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Button } from '../components/ui/Button';
import { formatCurrency } from '../lib/utils';
import { invoicesApi } from '../lib/api';

type RevenueRange = 7 | 14 | 30 | 'custom';

const dateKey = (value: string | Date) => {
  const date = value instanceof Date ? value : new Date(value);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

const dateInputValue = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export default function Dashboard() {
  const { activeTenant, invoices, products, productSummary, customers } = useApp();
  const navigate = useNavigate();
  const [salesReturns, setSalesReturns] = useState<any[]>([]);
  const [revenueRange, setRevenueRange] = useState<RevenueRange>(14);
  const [hoveredRevenueKey, setHoveredRevenueKey] = useState<string | null>(null);
  const [customFrom, setCustomFrom] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 13);
    return dateInputValue(date);
  });
  const [customTo, setCustomTo] = useState(() => dateInputValue(new Date()));

  useEffect(() => {
    invoicesApi.returns().then(setSalesReturns).catch(() => setSalesReturns([]));
  }, [activeTenant?.id, invoices.length]);

  const revenueWindow = useMemo(() => {
    const today = new Date();
    const defaultEnd = new Date(today);
    defaultEnd.setHours(23, 59, 59, 999);
    const customStart = new Date(`${customFrom}T00:00:00`);
    const customEnd = new Date(`${customTo}T23:59:59.999`);
    const customIsValid = revenueRange === 'custom'
      && Number.isFinite(customStart.getTime())
      && Number.isFinite(customEnd.getTime())
      && customStart.getTime() <= customEnd.getTime();

    if (customIsValid) {
      return {
        start: customStart,
        end: customEnd,
        days: Math.min(90, Math.max(1, Math.floor((customEnd.getTime() - customStart.getTime()) / 86_400_000) + 1)),
        isCustom: true,
      };
    }

    const days = revenueRange === 'custom' ? 14 : revenueRange;
    const start = new Date(defaultEnd);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (days - 1));
    return { start, end: defaultEnd, days, isCustom: false };
  }, [customFrom, customTo, revenueRange]);

  const todayKey = dateKey(new Date());
  const todayInvoices = useMemo(() => invoices.filter((invoice) => invoice.workflowStatus !== 'cancelled' && invoice.workflowStatus === 'closed' && dateKey(invoice.createdAt) === todayKey), [invoices, todayKey]);
  const todayReturns = useMemo(() => salesReturns.filter((row) => dateKey(row.createdAt) === todayKey), [salesReturns, todayKey]);
  const kpis = useMemo(() => ({
    revenue: todayInvoices.reduce((sum, row) => sum + row.finalAmount, 0) - todayReturns.reduce((sum, row) => sum + Number(row.totalAmount || 0), 0),
    collected: todayInvoices.reduce((sum, row) => sum + row.paidAmount, 0) - todayReturns.reduce((sum, row) => sum + Number(row.refundAmount || 0), 0),
    debtToday: todayInvoices.reduce((sum, row) => sum + row.debtAmount, 0),
    orders: todayInvoices.length,
    debt: customers.reduce((sum, row) => sum + Math.max(0, Number(row.totalDebt) || 0), 0),
    stockValue: productSummary.stockValue,
    lowStock: productSummary.lowStock,
  }), [customers, productSummary, products, todayInvoices, todayReturns]);
  const recentInvoices = useMemo(() => invoices.filter((invoice) => invoice.workflowStatus !== 'cancelled' && invoice.workflowStatus === 'closed').sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 8), [invoices]);
  const debtors = useMemo(() => [...customers].filter((row) => row.totalDebt > 0).sort((a, b) => b.totalDebt - a.totalDebt).slice(0, 8), [customers]);
  const lowStock = useMemo(() => products.filter((row) => row.trackStock && row.stock <= row.lowStockThreshold).slice(0, 8), [products]);
  const revenueDays = useMemo(() => Array.from({ length: revenueWindow.days }, (_, index) => {
    const date = new Date(revenueWindow.start);
    date.setDate(date.getDate() + index);
    const key = dateKey(date);
    const gross = invoices
      .filter((row) => row.workflowStatus !== 'cancelled' && row.workflowStatus === 'closed' && dateKey(row.createdAt) === key)
      .reduce((sum, row) => sum + Number(row.finalAmount || 0), 0);
    const returns = salesReturns
      .filter((row) => dateKey(row.createdAt) === key)
      .reduce((sum, row) => sum + Number(row.totalAmount || 0), 0);
    return {
      key,
      label: date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }),
      value: gross - returns,
    };
  }), [invoices, revenueWindow, salesReturns]);
  const revenueScale = Math.max(...revenueDays.map((item) => Math.abs(item.value)), 1);
  const revenueRangeLabel = revenueRange === 'custom'
    ? `${customFrom || '...'} → ${customTo || '...'}`
    : `${revenueRange} ngày`;
  const hoveredRevenueDay = revenueDays.find((day) => day.key === hoveredRevenueKey);

  const kpiRows = [
    ['Doanh thu hôm nay', kpis.revenue, 'text-slate-900'],
    ['Đã thu hôm nay', kpis.collected, 'text-emerald-700'],
    ['Bán chịu hôm nay', kpis.debtToday, 'text-amber-700'],
    ['Số đơn', kpis.orders, 'text-slate-900'],
    ['Công nợ khách', kpis.debt, 'text-amber-700'],
    ['Giá trị tồn kho', kpis.stockValue, 'text-slate-900'],
    ['Sắp hết hàng', kpis.lowStock, 'text-rose-700'],
  ];

  return <div className="flex h-full flex-col overflow-hidden bg-slate-50">
    <header className="flex shrink-0 flex-wrap items-center gap-2.5 border-b border-slate-200 bg-white px-3 py-2.5 sm:flex-nowrap sm:py-3">
      <div className="flex min-w-0 flex-1 items-center gap-2.5"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-600 text-white shadow-sm sm:h-9 sm:w-9"><LayoutDashboard className="h-4 w-4" /></div><div className="min-w-0"><h1 className="text-sm font-semibold leading-tight text-slate-900 sm:text-base">Tổng quan</h1><p className="mt-0.5 truncate text-[10px] leading-tight text-slate-500 sm:text-[11px]">{activeTenant?.name || 'HKD Smart'} · vận hành hôm nay</p></div></div>
      <div className="flex w-full gap-1.5 sm:ml-auto sm:w-auto sm:gap-2"><Button size="sm" variant="outline" className="h-8 flex-1 px-2 text-xs sm:h-9 sm:flex-none sm:px-3" onClick={() => navigate('/app/invoices')}>Chứng từ</Button><Button size="sm" className="h-8 flex-1 px-2 text-xs sm:h-9 sm:flex-none sm:px-3" onClick={() => navigate('/app/pos')}>Tạo đơn bán</Button></div>
    </header>
    <main className="flex-1 overflow-auto p-2 md:p-3">
      <section className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">{kpiRows.map(([label, value, color]) => <div key={String(label)} className="rounded border border-slate-200 bg-white px-2 py-2"><p className="text-[11px] text-slate-500">{label}</p><p className={`mt-1 text-sm font-semibold tabular-nums ${color}`}>{typeof value === 'number' && String(label) !== 'Số đơn' && String(label) !== 'Sắp hết hàng' ? formatCurrency(value) : value}</p></div>)}</section>
      <section className="mt-2 grid grid-cols-1 gap-2 xl:grid-cols-3">
        <div className="min-w-0 overflow-hidden rounded border border-slate-200 bg-white p-2 xl:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-xs font-semibold text-slate-700">Doanh thu {revenueRangeLabel}</h2>
              <span className="text-[11px] text-slate-400">VNĐ · đỏ là giảm do trả hàng</span>
            </div>
            <div className="flex shrink-0 items-center gap-1 rounded-md bg-slate-100 p-0.5" aria-label="Khoảng thời gian doanh thu">
              {([7, 14, 30] as const).map((days) => (
                <button key={days} type="button" onClick={() => setRevenueRange(days)} className={`rounded px-2 py-1 text-[10px] font-medium transition ${revenueRange === days ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>{days}d</button>
              ))}
              <button type="button" onClick={() => setRevenueRange('custom')} className={`rounded px-2 py-1 text-[10px] font-medium transition ${revenueRange === 'custom' ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>Tùy chọn</button>
            </div>
          </div>
          <div className="mt-2 flex min-h-7 items-center justify-between gap-2 rounded-md border border-slate-100 bg-slate-50 px-2 py-1 text-[10px]">
            <span className="truncate text-slate-500">{hoveredRevenueDay ? `Ngày ${hoveredRevenueDay.label}` : 'Rê chuột vào cột để xem số liệu'}</span>
            <span className={`shrink-0 font-semibold tabular-nums ${hoveredRevenueDay?.value && hoveredRevenueDay.value < 0 ? 'text-rose-700' : 'text-slate-700'}`}>{hoveredRevenueDay ? formatCurrency(hoveredRevenueDay.value) : '—'}</span>
          </div>
          {revenueRange === 'custom' && (
            <div className="mt-2 grid grid-cols-2 gap-2 rounded-md border border-slate-100 bg-slate-50 p-2">
              <label className="text-[10px] font-medium text-slate-500">Từ ngày<input type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} className="mt-1 h-7 w-full rounded border border-slate-200 bg-white px-1.5 text-[11px] text-slate-700" /></label>
              <label className="text-[10px] font-medium text-slate-500">Đến ngày<input type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} className="mt-1 h-7 w-full rounded border border-slate-200 bg-white px-1.5 text-[11px] text-slate-700" /></label>
            </div>
          )}
          <div className="mt-2 flex h-28 min-w-0 items-end gap-0.5 sm:gap-1">
            {revenueDays.map((day) => (
              <div key={day.key} tabIndex={0} aria-label={`${day.label}: ${formatCurrency(day.value)}`} onMouseEnter={() => setHoveredRevenueKey(day.key)} onMouseLeave={() => setHoveredRevenueKey(null)} onFocus={() => setHoveredRevenueKey(day.key)} onBlur={() => setHoveredRevenueKey(null)} className="group relative flex h-full min-w-0 flex-1 flex-col justify-end outline-none">
                <div title={`${day.label}: ${formatCurrency(day.value)}`} className={`w-full min-h-[2px] rounded-t ${day.value < 0 ? 'bg-rose-500/80' : 'bg-sky-500/80'} transition-opacity group-hover:opacity-80 group-focus-visible:ring-2 group-focus-visible:ring-sky-500`} style={{ height: `${Math.max(2, Math.abs(day.value) / revenueScale * 100)}%` }} />
                <span className="dashboard-revenue-label mt-1 block min-w-0 truncate text-center text-slate-400">{day.label}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded border border-slate-200 bg-white p-2"><div className="mb-2 flex items-center justify-between"><h2 className="text-xs font-semibold text-slate-700">Hàng sắp hết</h2><AlertCircle className="h-3.5 w-3.5 text-amber-600" /></div>{lowStock.length ? lowStock.map((row) => <button type="button" key={row.id} className="flex w-full items-center justify-between border-b border-slate-100 py-1.5 text-left text-xs hover:bg-sky-50" onClick={() => navigate(`/app/inventory?productId=${encodeURIComponent(row.id)}`)}><span className="truncate pr-2 text-slate-700">{row.name}</span><span className="shrink-0 font-medium text-rose-700">{row.stock} {row.unit}</span></button>) : <p className="py-4 text-center text-xs text-slate-500">Kho đang ổn định.</p>}<Button size="sm" variant="ghost" className="mt-1 h-7 w-full text-xs" onClick={() => navigate('/app/inventory')}>Mở kho <ArrowRight className="ml-1 h-3.5 w-3.5" /></Button></div>
      </section>
      <section className="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-2">
        <div className="overflow-hidden rounded border border-slate-200 bg-white"><div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-2 py-1.5"><ShoppingCart className="h-3.5 w-3.5 text-slate-500" /><h2 className="text-xs font-semibold text-slate-700">Chứng từ bán gần đây</h2></div><div className="divide-y divide-slate-100">{recentInvoices.map((row) => { const customer = row.customerId ? customers.find((item) => item.id === row.customerId)?.name : null; return <button type="button" key={row.id} className="grid w-full grid-cols-[minmax(0,1fr)_minmax(130px,0.85fr)_110px_90px] items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-sky-50" onClick={() => navigate(`/app/invoices?invoiceId=${encodeURIComponent(row.id)}`)}><span className="truncate font-mono text-slate-700">{row.documentNo || row.id}<small className="ml-2 font-sans text-slate-400">{new Date(row.createdAt).toLocaleDateString('vi-VN')}</small></span><span className="min-w-0 truncate text-slate-500" title={`${customer || 'Khách vãng lai'} · ${row.createdByName || 'Chưa xác định'}`}>{customer || 'Khách vãng lai'} · {row.createdByName || 'Chưa xác định'}</span><span className="text-right tabular-nums text-slate-700">{formatCurrency(row.finalAmount)}</span><span className="text-right text-slate-500">{row.debtAmount > 0 ? 'Còn nợ' : 'Đã thu'}</span></button>; })}{!recentInvoices.length && <p className="px-2 py-6 text-center text-xs text-slate-500">Chưa có chứng từ.</p>}</div><Button size="sm" variant="ghost" className="m-1 h-7 text-xs" onClick={() => navigate('/app/invoices')}>Xem tất cả</Button></div>
        <div className="overflow-hidden rounded border border-slate-200 bg-white"><div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-2 py-1.5"><Wallet className="h-3.5 w-3.5 text-amber-600" /><h2 className="text-xs font-semibold text-slate-700">Khách hàng còn nợ</h2></div><div className="divide-y divide-slate-100">{debtors.map((row) => <button key={row.id} className="grid w-full grid-cols-[1fr_120px] items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-sky-50" onClick={() => navigate(`/app/customers/${row.id}`)}><span className="flex min-w-0 items-center gap-2"><Users className="h-3.5 w-3.5 shrink-0 text-slate-400" /><span className="truncate text-slate-700">{row.name}</span></span><span className="text-right font-medium tabular-nums text-amber-700">{formatCurrency(row.totalDebt)}</span></button>)}{!debtors.length && <p className="px-2 py-6 text-center text-xs text-slate-500">Không có công nợ.</p>}</div><Button size="sm" variant="ghost" className="m-1 h-7 text-xs" onClick={() => navigate('/app/debt')}>Mở công nợ</Button></div>
      </section>
    </main>
  </div>;
}
