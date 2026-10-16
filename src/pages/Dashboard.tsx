import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowRight, LayoutDashboard, ShoppingCart, Users, Wallet } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Button } from '../components/ui/Button';
import { formatCurrency } from '../lib/utils';

const dateKey = (value: string) => new Date(value).toISOString().slice(0, 10);

export default function Dashboard() {
  const { activeTenant, invoices, products, customers } = useApp();
  const navigate = useNavigate();
  const todayKey = dateKey(new Date().toISOString());
  const todayInvoices = useMemo(() => invoices.filter((invoice) => dateKey(invoice.createdAt) === todayKey), [invoices, todayKey]);
  const kpis = useMemo(() => ({
    revenue: todayInvoices.reduce((sum, row) => sum + row.finalAmount, 0),
    collected: todayInvoices.reduce((sum, row) => sum + row.paidAmount, 0),
    debtToday: todayInvoices.reduce((sum, row) => sum + row.debtAmount, 0),
    orders: todayInvoices.length,
    debt: customers.reduce((sum, row) => sum + row.totalDebt, 0),
    stockValue: products.reduce((sum, row) => sum + row.stock * row.purchasePrice, 0),
    lowStock: products.filter((row) => row.trackStock && row.stock <= row.lowStockThreshold).length,
  }), [customers, products, todayInvoices]);
  const recentInvoices = useMemo(() => [...invoices].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 8), [invoices]);
  const debtors = useMemo(() => [...customers].filter((row) => row.totalDebt > 0).sort((a, b) => b.totalDebt - a.totalDebt).slice(0, 8), [customers]);
  const lowStock = useMemo(() => products.filter((row) => row.trackStock && row.stock <= row.lowStockThreshold).slice(0, 8), [products]);
  const revenueDays = useMemo(() => Array.from({ length: 14 }, (_, index) => {
    const date = new Date(); date.setDate(date.getDate() - (13 - index));
    const key = dateKey(date.toISOString());
    return { label: date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }), value: invoices.filter((row) => dateKey(row.createdAt) === key).reduce((sum, row) => sum + row.finalAmount, 0) };
  }), [invoices]);

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
      <div className="flex min-w-0 flex-1 items-center gap-2.5"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-600 text-white shadow-sm sm:h-9 sm:w-9"><LayoutDashboard className="h-4 w-4" /></div><div className="min-w-0"><h1 className="text-sm font-semibold leading-tight text-slate-900 sm:text-base">Tổng quan</h1><p className="mt-0.5 truncate text-[10px] leading-tight text-slate-500 sm:text-[11px]">{activeTenant?.name || 'HKDCare'} · vận hành hôm nay</p></div></div>
      <div className="flex w-full gap-1.5 sm:ml-auto sm:w-auto sm:gap-2"><Button size="sm" variant="outline" className="h-8 flex-1 px-2 text-xs sm:h-9 sm:flex-none sm:px-3" onClick={() => navigate('/app/invoices')}>Chứng từ</Button><Button size="sm" className="h-8 flex-1 px-2 text-xs sm:h-9 sm:flex-none sm:px-3" onClick={() => navigate('/app/pos')}>Tạo đơn bán</Button></div>
    </header>
    <main className="flex-1 overflow-auto p-2 md:p-3">
      <section className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">{kpiRows.map(([label, value, color]) => <div key={String(label)} className="rounded border border-slate-200 bg-white px-2 py-2"><p className="text-[11px] text-slate-500">{label}</p><p className={`mt-1 text-sm font-semibold tabular-nums ${color}`}>{typeof value === 'number' && String(label) !== 'Số đơn' && String(label) !== 'Sắp hết hàng' ? formatCurrency(value) : value}</p></div>)}</section>
      <section className="mt-2 grid grid-cols-1 gap-2 xl:grid-cols-3">
        <div className="rounded border border-slate-200 bg-white p-2 xl:col-span-2"><div className="mb-2 flex items-center justify-between"><h2 className="text-xs font-semibold text-slate-700">Doanh thu 14 ngày</h2><span className="text-[11px] text-slate-400">VNĐ</span></div><div className="flex h-28 items-end gap-1">{revenueDays.map((day) => { const max = Math.max(...revenueDays.map((item) => item.value), 1); return <div key={day.label} className="group flex h-full flex-1 flex-col justify-end"><div title={`${day.label}: ${formatCurrency(day.value)}`} className="min-h-[2px] rounded-t bg-sky-500/80" style={{ height: `${Math.max(2, day.value / max * 100)}%` }} /><span className="mt-1 truncate text-center text-[9px] text-slate-400">{day.label}</span></div>; })}</div></div>
        <div className="rounded border border-slate-200 bg-white p-2"><div className="mb-2 flex items-center justify-between"><h2 className="text-xs font-semibold text-slate-700">Hàng sắp hết</h2><AlertCircle className="h-3.5 w-3.5 text-amber-600" /></div>{lowStock.length ? lowStock.map((row) => <button type="button" key={row.id} className="flex w-full items-center justify-between border-b border-slate-100 py-1.5 text-left text-xs hover:bg-sky-50" onClick={() => navigate(`/app/inventory?productId=${encodeURIComponent(row.id)}`)}><span className="truncate pr-2 text-slate-700">{row.name}</span><span className="shrink-0 font-medium text-rose-700">{row.stock} {row.unit}</span></button>) : <p className="py-4 text-center text-xs text-slate-500">Kho đang ổn định.</p>}<Button size="sm" variant="ghost" className="mt-1 h-7 w-full text-xs" onClick={() => navigate('/app/inventory')}>Mở kho <ArrowRight className="ml-1 h-3.5 w-3.5" /></Button></div>
      </section>
      <section className="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-2">
        <div className="overflow-hidden rounded border border-slate-200 bg-white"><div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-2 py-1.5"><ShoppingCart className="h-3.5 w-3.5 text-slate-500" /><h2 className="text-xs font-semibold text-slate-700">Chứng từ bán gần đây</h2></div><div className="divide-y divide-slate-100">{recentInvoices.map((row) => <button type="button" key={row.id} className="grid w-full grid-cols-[1fr_110px_90px] items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-sky-50" onClick={() => navigate(`/app/invoices?invoiceId=${encodeURIComponent(row.id)}`)}><span className="truncate font-mono text-slate-700">{row.documentNo || row.id}<small className="ml-2 font-sans text-slate-400">{new Date(row.createdAt).toLocaleDateString('vi-VN')}</small></span><span className="text-right tabular-nums text-slate-700">{formatCurrency(row.finalAmount)}</span><span className="text-right text-slate-500">{row.debtAmount > 0 ? 'Còn nợ' : 'Đã thu'}</span></button>)}{!recentInvoices.length && <p className="px-2 py-6 text-center text-xs text-slate-500">Chưa có chứng từ.</p>}</div><Button size="sm" variant="ghost" className="m-1 h-7 text-xs" onClick={() => navigate('/app/invoices')}>Xem tất cả</Button></div>
        <div className="overflow-hidden rounded border border-slate-200 bg-white"><div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-2 py-1.5"><Wallet className="h-3.5 w-3.5 text-amber-600" /><h2 className="text-xs font-semibold text-slate-700">Khách hàng còn nợ</h2></div><div className="divide-y divide-slate-100">{debtors.map((row) => <button key={row.id} className="grid w-full grid-cols-[1fr_120px] items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-sky-50" onClick={() => navigate(`/app/customers/${row.id}`)}><span className="flex min-w-0 items-center gap-2"><Users className="h-3.5 w-3.5 shrink-0 text-slate-400" /><span className="truncate text-slate-700">{row.name}</span></span><span className="text-right font-medium tabular-nums text-amber-700">{formatCurrency(row.totalDebt)}</span></button>)}{!debtors.length && <p className="px-2 py-6 text-center text-xs text-slate-500">Không có công nợ.</p>}</div><Button size="sm" variant="ghost" className="m-1 h-7 text-xs" onClick={() => navigate('/app/debt')}>Mở công nợ</Button></div>
      </section>
    </main>
  </div>;
}
