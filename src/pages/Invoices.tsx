import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowUpDown, Calendar, ChevronDown, ChevronRight, Printer, Receipt, Search, ShoppingCart, SlidersHorizontal, User, Wallet, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { formatCurrency } from '../lib/utils';
import { debtLedgerApi, invoiceItemsApi } from '../lib/api';
import { DebtLedger, InvoiceItem } from '../types';

export default function Invoices() {
  const { invoices, customers, products } = useApp();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'partial' | 'unpaid'>('all');
  const [pendingStatusFilter, setPendingStatusFilter] = useState<'all' | 'completed' | 'partial' | 'unpaid'>('all');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [debtPayments, setDebtPayments] = useState<DebtLedger[]>([]);
  const [selectedInvoiceItems, setSelectedInvoiceItems] = useState<InvoiceItem[]>([]);
  const [loadingInvoiceItems, setLoadingInvoiceItems] = useState(false);
  const [timeFilter, setTimeFilter] = useState<'all' | 'today' | 'yesterday' | 'last7' | 'month' | 'lastMonth'>('all');
  const [showTimeSheet, setShowTimeSheet] = useState(false);
  const [showSummarySheet, setShowSummarySheet] = useState(false);
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [showInvoiceActions, setShowInvoiceActions] = useState(false);

  const customerNameById = useMemo(() => {
    const map = new Map<string, string>();
    customers.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [customers]);

  const effectiveStatusOf = (inv: any): 'completed' | 'partial' | 'unpaid' => {
    const finalAmount = Number(inv?.finalAmount || 0);
    const paidAmount = Number(inv?.paidAmount || 0);
    const debtAmount = Number(inv?.debtAmount || 0);
    const paymentMethod = String(inv?.paymentMethod || '').trim().toLowerCase();

    // If backend ever drifts, derive a stable "effective" status for filtering.
    if (finalAmount <= 0) return 'completed';
    if (debtAmount > 0 || paymentMethod === 'debt') {
      if (paidAmount > 0 && paidAmount < finalAmount) return 'partial';
      return 'unpaid';
    }
    if (paidAmount > 0 && paidAmount < finalAmount) return 'partial';
    return 'completed';
  };

  const baseInvoices = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
    const startOfThisWeekWindow = startOfToday - 6 * 24 * 60 * 60 * 1000;
    const endOfLastMonth = startOfMonth - 1;

    return [...invoices]
      .filter((inv) => {
        const t = new Date(inv.createdAt).getTime();
        if (timeFilter === 'today') return t >= startOfToday;
        if (timeFilter === 'yesterday') return t >= startOfYesterday && t < startOfToday;
        if (timeFilter === 'last7') return t >= startOfThisWeekWindow;
        if (timeFilter === 'month') return t >= startOfMonth;
        if (timeFilter === 'lastMonth') return t >= startOfLastMonth && t <= endOfLastMonth;
        return true;
      })
      .filter((inv) => {
        if (!keyword) return true;
        const customerName = inv.customerId ? customerNameById.get(inv.customerId) || '' : 'khách vãng lai';
        return inv.id.toLowerCase().includes(keyword) || customerName.toLowerCase().includes(keyword);
      })
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }, [customerNameById, invoices, searchTerm, timeFilter]);

  const filteredInvoices = useMemo(() => {
    if (statusFilter === 'all') return baseInvoices;
    return baseInvoices.filter((inv) => effectiveStatusOf(inv) === statusFilter);
  }, [baseInvoices, statusFilter]);

  const selectedInvoice = useMemo(
    () => filteredInvoices.find((inv) => inv.id === selectedInvoiceId) || null,
    [filteredInvoices, selectedInvoiceId]
  );

  const statusCounts = useMemo(() => {
    const counts: Record<'completed' | 'partial' | 'unpaid', number> = { completed: 0, partial: 0, unpaid: 0 };
    baseInvoices.forEach((inv) => {
      counts[effectiveStatusOf(inv)] += 1;
    });
    return counts;
  }, [baseInvoices]);

  const invoiceOverview = useMemo(() => {
    const totalRevenue = filteredInvoices.reduce((sum, inv) => sum + inv.finalAmount, 0);
    const unpaidCount = filteredInvoices.filter((inv) => inv.status === 'unpaid').length;
    const partialCount = filteredInvoices.filter((inv) => inv.status === 'partial').length;
    const debtTotal = filteredInvoices.reduce((sum, inv) => sum + (inv.debtAmount || 0), 0);
    return { totalRevenue, unpaidCount, partialCount, debtTotal };
  }, [filteredInvoices]);

  const statusMeta = (status: 'completed' | 'partial' | 'unpaid') => {
    if (status === 'completed') return { label: 'Đã thanh toán', tone: 'status-chip-success' };
    if (status === 'partial') return { label: 'Thanh toán một phần', tone: 'status-chip-warning' };
    return { label: 'Chưa thanh toán', tone: 'status-chip-danger' };
  };

  const dayLabel = (value: string) => new Date(value).toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeFilterLabel = {
    all: 'Toàn thời gian',
    today: 'Hôm nay',
    yesterday: 'Hôm qua',
    last7: '7 ngày qua',
    month: 'Tháng này',
    lastMonth: 'Tháng trước',
  }[timeFilter];
  const statusFilterLabel = {
    all: 'Tất cả trạng thái',
    completed: 'Đã thanh toán',
    partial: 'Thanh toán một phần',
    unpaid: 'Chưa thanh toán',
  }[statusFilter];

  useEffect(() => {
    const loadDebtPayments = async () => {
      try {
        const entries = await debtLedgerApi.list();
        setDebtPayments(entries.filter((entry) => entry.type === 'decrease'));
      } catch {
        setDebtPayments([]);
      }
    };
    loadDebtPayments();
  }, []);

  useEffect(() => {
    const loadInvoiceItems = async () => {
      if (!selectedInvoiceId) {
        setSelectedInvoiceItems([]);
        return;
      }
      setLoadingInvoiceItems(true);
      try {
        const items = await invoiceItemsApi.list(selectedInvoiceId);
        setSelectedInvoiceItems(items || []);
      } catch {
        setSelectedInvoiceItems([]);
      } finally {
        setLoadingInvoiceItems(false);
      }
    };
    loadInvoiceItems();
  }, [selectedInvoiceId]);

  useEffect(() => {
    if (!selectedInvoiceId) {
      setShowInvoiceActions(false);
    }
  }, [selectedInvoiceId]);

  useEffect(() => {
    if (showFilterSheet) setPendingStatusFilter(statusFilter);
  }, [showFilterSheet, statusFilter]);

  const printInvoice = (invoiceId: string) => {
    const invoice = invoices.find((inv) => inv.id === invoiceId);
    if (!invoice) return;
    const customerName = invoice.customerId ? customerNameById.get(invoice.customerId) || 'Khách vãng lai' : 'Khách vãng lai';
    const popup = window.open('', '_blank', 'width=480,height=680');
    if (!popup) return;
    popup.document.write(`
      <html>
        <head><title>Invoice ${invoice.id}</title></head>
        <body style="font-family: Arial, sans-serif; padding: 20px; color:#0f172a">
          <h2 style="margin:0 0 8px">Hóa đơn #${invoice.id}</h2>
          <p style="margin:4px 0">Khách hàng: ${customerName}</p>
          <p style="margin:4px 0">Thời gian: ${new Date(invoice.createdAt).toLocaleString('vi-VN')}</p>
          <p style="margin:4px 0">Trạng thái: ${invoice.status}</p>
          <hr />
          <p style="margin:4px 0">Tổng tiền: ${formatCurrency(invoice.finalAmount)}</p>
          <p style="margin:4px 0">Đã thanh toán: ${formatCurrency(invoice.paidAmount)}</p>
          <p style="margin:4px 0">Còn nợ: ${formatCurrency(invoice.debtAmount)}</p>
        </body>
      </html>
    `);
    popup.document.close();
    popup.focus();
    popup.print();
  };

  return (
    <div className="flex h-full flex-col bg-slate-50 animate-in fade-in duration-500 overflow-hidden">
      <div className="lg:hidden flex-1 overflow-y-auto pb-mobile-nav">
        <div className="px-4 pt-4 pb-3 bg-white border-b border-slate-100">
          {!showMobileSearch ? (
            <>
              <div className="flex items-center justify-between">
                <h1 className="text-[28px] leading-tight font-semibold text-slate-900">Hóa đơn</h1>
                <div className="flex items-center gap-1">
                  <button onClick={() => setShowMobileSearch(true)} className="h-9 w-9 rounded-lg text-slate-500 hover:bg-slate-100 flex items-center justify-center">
                    <Search className="h-5 w-5" />
                  </button>
                  <button onClick={() => setShowSummarySheet(true)} className="h-9 w-9 rounded-lg text-slate-500 hover:bg-slate-100 flex items-center justify-center">
                    <ArrowUpDown className="h-5 w-5" />
                  </button>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button onClick={() => setShowFilterSheet(true)} className="h-10 w-10 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center">
                  <SlidersHorizontal className="h-5 w-5" />
                </button>
                <button onClick={() => setShowTimeSheet(true)} className="h-10 px-4 rounded-full bg-sky-100 text-sky-700 text-sm font-medium inline-flex items-center gap-1">
                  {timeFilterLabel} <ChevronDown className="h-4 w-4" />
                </button>
                {statusFilter !== 'all' && (
                  <span className="h-10 px-3 rounded-full bg-slate-100 text-slate-700 text-sm font-medium inline-flex items-center">
                    {statusFilterLabel}
                  </span>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <button onClick={() => setShowMobileSearch(false)} className="h-10 w-10 rounded-lg text-slate-500 hover:bg-slate-100 flex items-center justify-center">
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  autoFocus
                  className="h-10 pl-9 rounded-lg border border-slate-200 bg-white text-sm"
                  placeholder="Tìm theo mã đơn hoặc tên khách"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          )}

          <button onClick={() => setShowSummarySheet(true)} className="mt-3 w-full rounded-lg bg-white text-left">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[18px] leading-tight text-slate-900 font-semibold inline-flex items-center gap-1">Tổng tiền hàng <ChevronDown className="h-4 w-4 text-slate-400" /></p>
                <p className="text-[14px] text-slate-700 mt-1">{filteredInvoices.length} hóa đơn</p>
              </div>
              <p className="text-[18px] leading-tight text-slate-900 font-semibold tabular-nums">{formatCurrency(invoiceOverview.totalRevenue)}</p>
            </div>
          </button>
        </div>

        <div className="p-3">
          <div className="rounded-lg bg-white border border-slate-200 divide-y divide-slate-100">
            {filteredInvoices.map((inv, index) => {
              const customerName = inv.customerId ? customerNameById.get(inv.customerId) || 'Khách vãng lai' : 'Khách vãng lai';
              const prev = filteredInvoices[index - 1];
              const showDateGroup = !prev || new Date(prev.createdAt).toDateString() !== new Date(inv.createdAt).toDateString();
              return (
                <div key={inv.id}>
                  {showDateGroup && (
                    <div className="px-4 pt-4 text-[12px] font-semibold text-slate-500 uppercase tracking-wide">
                      {dayLabel(inv.createdAt)}
                    </div>
                  )}
                  <button onClick={() => setSelectedInvoiceId(inv.id)} className="w-full px-4 py-3 text-left">
                    <div className="flex justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[18px] leading-tight font-semibold text-slate-900">{customerName}</p>
                        <p className="text-[13px] text-slate-500 mt-1">{new Date(inv.createdAt).toLocaleString('vi-VN')} · {inv.id}</p>
                        <p className="text-[14px] text-slate-600 mt-1 truncate">
                          {inv.customerId ? 'Khách hàng có hồ sơ' : 'Khách vãng lai'}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[18px] font-semibold text-slate-900 tabular-nums">{formatCurrency(inv.finalAmount)}</p>
                        <p className="text-[13px] text-slate-500 mt-1">
                          {inv.paymentMethod === 'cash' ? 'Tiền mặt' : inv.paymentMethod === 'transfer' ? 'Chuyển khoản' : 'Công nợ'}
                        </p>
                      </div>
                    </div>
                  </button>
                </div>
              );
            })}
            {filteredInvoices.length === 0 && <p className="p-6 text-center text-sm text-slate-500">Không có dữ liệu phù hợp.</p>}
          </div>
        </div>
        <button
          onClick={() => navigate('/app/pos')}
          className="fixed bottom-[88px] right-4 z-30 h-14 w-14 rounded-full bg-sky-600 text-white shadow-lg shadow-sky-900/25 flex items-center justify-center"
          aria-label="Tạo hóa đơn mới"
        >
          <ShoppingCart className="h-6 w-6" />
        </button>
      </div>

      <div className="hidden lg:flex p-3 lg:p-8 bg-white border-b sticky top-0 z-40 flex-col lg:flex-row gap-2 lg:gap-6 items-start lg:items-center justify-between shadow-sm shrink-0">
        <div className="hidden lg:flex items-center gap-5">
          <div className="h-9 w-9 sm:h-12 sm:w-12 rounded-lg bg-sky-600 text-white flex items-center justify-center shadow-lg shadow-sky-900/20 transform -rotate-3 shrink-0">
            <Receipt className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>
          <div>
            <h1 className="text-page-title">Lịch sử đơn hàng</h1>
            <p className="text-page-subtitle mt-1">{invoices.length} đơn hàng trong hệ thống</p>
          </div>
        </div>

        <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-row sm:gap-3 lg:w-auto">
          <div className="relative w-full sm:w-auto">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="h-10 lg:h-11 pl-10 text-sm rounded-lg border-none bg-slate-100/70 shadow-inner"
              placeholder="Tìm theo mã đơn hoặc tên khách"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-2 sm:flex sm:items-center sm:gap-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | 'completed' | 'partial' | 'unpaid')}
              className="h-10 lg:h-11 rounded-lg border-none bg-slate-100/70 shadow-inner px-3 text-sm text-slate-700"
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="completed">Đã thanh toán</option>
              <option value="partial">Thanh toán một phần</option>
              <option value="unpaid">Chưa thanh toán</option>
            </select>
            <Button className="h-10 lg:h-11 text-sm px-3 lg:px-4" onClick={() => navigate('/app/pos')}>
              <ShoppingCart className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Lên đơn mới</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="hidden lg:block flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-5 p-4 md:gap-6 md:p-6">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Doanh thu theo bộ lọc</p>
          <p className="mt-1 text-lg font-semibold text-sky-700 tabular-nums">{formatCurrency(invoiceOverview.totalRevenue)}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Đơn chưa thanh toán</p>
          <p className="mt-1 text-lg font-semibold text-amber-700 tabular-nums">{invoiceOverview.unpaidCount}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Đơn thanh toán một phần</p>
          <p className="mt-1 text-lg font-semibold text-orange-700 tabular-nums">{invoiceOverview.partialCount}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Tổng công nợ còn lại</p>
          <p className="mt-1 text-lg font-semibold text-rose-700 tabular-nums">{formatCurrency(invoiceOverview.debtTotal)}</p>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setStatusFilter('all')}
            className={`h-9 rounded-lg px-3 text-sm ${statusFilter === 'all' ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-600'}`}
          >
            Tất cả
          </button>
          <button
            onClick={() => setStatusFilter('completed')}
            className={`h-9 rounded-lg px-3 text-sm ${statusFilter === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}
          >
            Đã thanh toán
          </button>
          <button
            onClick={() => setStatusFilter('partial')}
            className={`h-9 rounded-lg px-3 text-sm ${statusFilter === 'partial' ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-600'}`}
          >
            Thanh toán một phần
          </button>
          <button
            onClick={() => setStatusFilter('unpaid')}
            className={`h-9 rounded-lg px-3 text-sm ${statusFilter === 'unpaid' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}
          >
            Chưa thanh toán
          </button>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="hidden border-b border-slate-100 px-4 py-3 text-xs text-slate-500 md:grid md:grid-cols-[1.2fr_1fr_1fr_1fr_auto] md:gap-3">
          <p>Mã đơn</p>
          <p>Khách hàng</p>
          <p>Thời gian</p>
          <p>Tổng tiền / Người tạo</p>
          <p className="text-right">Thao tác</p>
        </div>
        <div className="divide-y divide-slate-100">
          {filteredInvoices.map((inv, index) => {
            const customerName = inv.customerId ? customerNameById.get(inv.customerId) || 'Khách vãng lai' : 'Khách vãng lai';
            const prev = filteredInvoices[index - 1];
            const showDateGroup = !prev || new Date(prev.createdAt).toDateString() !== new Date(inv.createdAt).toDateString();
            const meta = statusMeta(inv.status);
            return (
              <div key={inv.id}>
                {showDateGroup && (
                  <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-500">
                    {dayLabel(inv.createdAt)}
                  </div>
                )}
              <div className="p-4 md:grid md:grid-cols-[1.2fr_1fr_1fr_1fr_auto] md:items-center md:gap-3">
                <div className="mb-2 md:mb-0">
                  <p className="text-sm font-semibold text-slate-900">#{inv.id}</p>
                  <span className={`status-chip mt-1 ${meta.tone}`}>{meta.label}</span>
                </div>
                <p className="mb-2 text-sm text-slate-800 md:mb-0">{customerName}</p>
                <div className="mb-2 flex items-center gap-1 text-sm text-slate-600 md:mb-0">
                  <Calendar className="h-4 w-4 text-slate-400" />
                  {new Date(inv.createdAt).toLocaleString('vi-VN')}
                </div>
                <div className="mb-3 md:mb-0">
                  <p className="text-sm font-semibold text-slate-900">{formatCurrency(inv.finalAmount)}</p>
                  <p className="text-xs text-slate-500">Tạo bởi: {inv.createdByName || inv.createdBy || 'N/A'}</p>
                </div>
                <div className="flex items-center justify-end gap-1">
                  <Button variant="ghost" size="icon" onClick={() => printInvoice(inv.id)}>
                    <Printer className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setSelectedInvoiceId(inv.id)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              </div>
            );
          })}
          {filteredInvoices.length === 0 && <p className="p-8 text-center text-sm text-slate-500">Không có dữ liệu phù hợp.</p>}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Lịch sử thanh toán công nợ</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {debtPayments.slice(0, 20).map((entry) => {
            const customer = customers.find((item) => item.id === entry.customerId);
            return (
              <div key={entry.id} className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-sky-50 p-2 text-sky-600">
                    <Wallet className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">{customer?.name || entry.customerId}</p>
                    <p className="text-xs text-slate-500">{new Date(entry.createdAt).toLocaleString('vi-VN')} · {entry.note || 'Thu nợ'}</p>
                  </div>
                </div>
                <p className="text-sm font-semibold text-sky-700">-{formatCurrency(entry.amount)}</p>
              </div>
            );
          })}
          {debtPayments.length === 0 && <p className="p-6 text-sm text-slate-500">Chưa có lịch sử thanh toán công nợ.</p>}
        </div>
      </section>

      {showTimeSheet && (
        <div className="lg:hidden fixed inset-0 z-[160] bg-black/45" onClick={() => setShowTimeSheet(false)}>
          <div className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-white p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-300" />
            <h3 className="text-lg font-semibold text-slate-900 mb-3">Thời gian</h3>
            <div className="divide-y divide-slate-100">
              {[
                ['all', 'Toàn thời gian'],
                ['today', 'Hôm nay'],
                ['yesterday', 'Hôm qua'],
                ['last7', '7 ngày qua'],
                ['month', 'Tháng này'],
                ['lastMonth', 'Tháng trước'],
              ].map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => {
                      setTimeFilter(key as any);
                      setShowTimeSheet(false);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="w-full h-14 flex items-center justify-between text-left"
                  >
                  <span className="text-base text-slate-900">{label}</span>
                  {timeFilter === key && <span className="text-sky-600 text-base">✓</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {showFilterSheet && (
        <div className="lg:hidden fixed inset-0 z-[160] bg-black/45" onClick={() => setShowFilterSheet(false)}>
          <div className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-white p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-300" />
            <h3 className="text-lg font-semibold text-slate-900 mb-3">Bộ lọc</h3>
            <div className="space-y-3">
              <div className="rounded-lg border border-slate-200 overflow-hidden">
                {[
                  ['all', 'Tất cả trạng thái'],
                  ['completed', `Đã thanh toán (${statusCounts.completed})`],
                  ['partial', `Thanh toán một phần (${statusCounts.partial})`],
                  ['unpaid', `Chưa thanh toán (${statusCounts.unpaid})`],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setPendingStatusFilter(key as any)}
                    className="h-12 w-full px-4 border-b border-slate-100 last:border-0 flex items-center justify-between text-sm"
                  >
                    <span className="text-slate-800">{label}</span>
                    {pendingStatusFilter === key && <span className="text-sky-600">✓</span>}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" className="h-11 w-full" onClick={() => { setPendingStatusFilter('all'); }}>
                  Đặt lại
                </Button>
                <Button
                  className="h-11 w-full"
                  onClick={() => {
                    setStatusFilter(pendingStatusFilter);
                    setShowFilterSheet(false);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                >
                  Áp dụng
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showSummarySheet && (
        <div className="lg:hidden fixed inset-0 z-[160] bg-black/45" onClick={() => setShowSummarySheet(false)}>
          <div className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-white p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-300" />
            <div className="divide-y divide-slate-100 text-base">
              <div className="py-3 flex items-center justify-between"><span>Tổng tiền hàng</span><span>{formatCurrency(invoiceOverview.totalRevenue)}</span></div>
              <div className="py-3 flex items-center justify-between"><span>Giảm giá</span><span>0</span></div>
              <div className="py-3 flex items-center justify-between"><span>Tổng đã giảm giá</span><span>{formatCurrency(invoiceOverview.totalRevenue)}</span></div>
              <div className="py-3 flex items-center justify-between"><span>Thu khác</span><span>0</span></div>
              <div className="py-3 flex items-center justify-between"><span>Khách cần trả</span><span>{formatCurrency(invoiceOverview.totalRevenue)}</span></div>
              <div className="py-3 flex items-center justify-between"><span>Khách đã trả</span><span>{formatCurrency(invoiceOverview.totalRevenue - invoiceOverview.debtTotal)}</span></div>
            </div>
          </div>
        </div>
      )}

      {selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="hidden lg:block w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Chi tiết hóa đơn #{selectedInvoice.id}</h3>
                <p className="mt-1 text-sm text-slate-500">{new Date(selectedInvoice.createdAt).toLocaleString('vi-VN')}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedInvoiceId(null)}>Đóng</Button>
            </div>

            <div className="mt-4 space-y-3 rounded-lg border border-slate-100 p-4 text-sm">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-slate-500">Hàng hóa trong đơn</span>
                  <span className="status-chip status-chip-info">
                    {selectedInvoiceItems.length} sản phẩm
                  </span>
                </div>
                <div className="space-y-2 rounded-lg border border-slate-100 bg-slate-50 p-3">
                  {loadingInvoiceItems ? (
                    <p className="text-sm text-slate-500">Đang tải sản phẩm...</p>
                  ) : selectedInvoiceItems.length === 0 ? (
                    <p className="text-sm text-slate-500">Không có dữ liệu sản phẩm trong hóa đơn.</p>
                  ) : (
                    selectedInvoiceItems.map((item) => {
                      const product = products.find((p) => p.id === item.productId);
                      return (
                        <div key={item.id} className="flex items-start justify-between gap-3 rounded-lg bg-white p-2.5">
                          <div className="flex items-start gap-3 min-w-0">
                            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-slate-100">
                              {product?.imageUrl ? (
                                <img src={product.imageUrl} alt={item.productName} className="h-full w-full object-cover" />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">SP</div>
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-slate-900">{item.productName}</p>
                              <p className="text-xs text-slate-500">{product?.sku || item.productId}</p>
                              <p className="text-xs text-slate-600">{formatCurrency(item.price)} x {item.quantity}</p>
                            </div>
                          </div>
                          <p className="shrink-0 text-sm font-semibold text-slate-900 tabular-nums">{formatCurrency(item.total)}</p>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-500">Khách hàng</span>
                <span className="font-medium text-slate-900">
                  {selectedInvoice.customerId
                    ? customerNameById.get(selectedInvoice.customerId) || 'Khách vãng lai'
                    : 'Khách vãng lai'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Nhân sự tạo đơn</span>
                <span className="font-medium text-slate-900">{selectedInvoice.createdByName || selectedInvoice.createdBy || 'N/A'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Trạng thái</span>
                <span className={`status-chip ${statusMeta(selectedInvoice.status).tone}`}>
                  {statusMeta(selectedInvoice.status).label}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Tổng tiền</span>
                <span className="font-semibold text-slate-900">{formatCurrency(selectedInvoice.finalAmount)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Đã thanh toán</span>
                <span className="font-medium text-slate-900">{formatCurrency(selectedInvoice.paidAmount)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Công nợ</span>
                <span className="font-medium text-amber-700">{formatCurrency(selectedInvoice.debtAmount)}</span>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              {selectedInvoice.customerId && (
                <Button variant="outline" className="h-10 text-sm" onClick={() => navigate(`/app/customers/${selectedInvoice.customerId}`)}>
                  <User className="mr-2 h-4 w-4" />
                  Mở khách hàng
                </Button>
              )}
              <Button className="h-10 text-sm" onClick={() => printInvoice(selectedInvoice.id)}>
                <Printer className="mr-2 h-4 w-4" />
                In hóa đơn
              </Button>
            </div>
          </div>

          <div className="lg:hidden absolute inset-0 bg-slate-100 overflow-y-auto pb-mobile-nav">
            <div className="h-14 px-4 bg-white border-b border-slate-200 flex items-center justify-between sticky top-0 z-20">
              <button onClick={() => setSelectedInvoiceId(null)} className="text-slate-500"><ArrowLeft className="h-5 w-5" /></button>
              <div className="min-w-0">
                <p className="text-base font-semibold text-slate-900">{selectedInvoice.id}</p>
                <p className="text-xs text-slate-500">{new Date(selectedInvoice.createdAt).toLocaleString('vi-VN')} · {statusMeta(selectedInvoice.status).label}</p>
              </div>
              <button onClick={() => setShowInvoiceActions(true)} className="text-slate-500 px-2 text-xl leading-none">•••</button>
            </div>
            <div className="p-3 space-y-3">
              <button
                onClick={() => selectedInvoice.customerId && navigate(`/app/customers/${selectedInvoice.customerId}`)}
                className="w-full rounded-lg border border-slate-200 bg-white p-4 text-left flex items-center justify-between"
              >
                <p className="text-base font-medium text-slate-900">{selectedInvoice.customerId ? customerNameById.get(selectedInvoice.customerId) || 'Khách vãng lai' : 'Khách vãng lai'}</p>
                <ChevronRight className="h-4 w-4 text-slate-400" />
              </button>
              <div className="rounded-lg border border-slate-200 bg-white">
                {loadingInvoiceItems ? (
                  <p className="p-4 text-sm text-slate-500">Đang tải sản phẩm...</p>
                ) : selectedInvoiceItems.map((item) => {
                  const product = products.find((p) => p.id === item.productId);
                  return (
                    <div key={item.id} className="p-4 border-b border-slate-100 last:border-0 flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="h-14 w-14 rounded-md overflow-hidden bg-slate-100 shrink-0">
                          {product?.imageUrl ? <img src={product.imageUrl} alt={item.productName} className="h-full w-full object-cover" /> : <div className="h-full w-full flex items-center justify-center text-xs text-slate-400">SP</div>}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[17px] font-medium text-slate-900 line-clamp-2">{item.productName}</p>
                          <p className="text-[13px] text-slate-500">{product?.sku || item.productId}</p>
                          <p className="text-[14px] text-slate-700">{formatCurrency(item.price)} x {item.quantity}</p>
                        </div>
                      </div>
                      <p className="text-[18px] font-semibold text-slate-900 tabular-nums">{formatCurrency(item.total)}</p>
                    </div>
                  );
                })}
              </div>
              <div className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100 text-base">
                <div className="p-4 flex justify-between"><span>Tổng tiền hàng</span><span>{formatCurrency(selectedInvoice.totalAmount)}</span></div>
                <div className="p-4 flex justify-between"><span>Giảm giá</span><span>{formatCurrency(selectedInvoice.discount || 0)}</span></div>
                <div className="p-4 flex justify-between"><span>Khách cần trả</span><span>{formatCurrency(selectedInvoice.finalAmount)}</span></div>
                <div className="p-4 flex justify-between"><span>Khách đã trả</span><span className="text-sky-700">{formatCurrency(selectedInvoice.paidAmount)}</span></div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase text-slate-400">Ghi chú</p>
                  <span className="text-sm text-sky-600">Sửa</span>
                </div>
                <p className="mt-2 text-sm text-slate-600">{selectedInvoice.note || 'Chưa có ghi chú...'}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <p className="text-slate-500">Kênh bán</p>
                  <p className="font-medium text-slate-900">Bán trực tiếp</p>
                </div>
                <div>
                  <p className="text-slate-500">Người tạo</p>
                  <p className="font-medium text-slate-900">{selectedInvoice.createdByName || selectedInvoice.createdBy || 'N/A'}</p>
                </div>
              </div>
              <div className="pt-2 pb-2">
                <Button className="h-12 w-full text-base">Cập nhật</Button>
              </div>
            </div>
          </div>
        </div>
      )}
      {selectedInvoice && showInvoiceActions && (
        <div className="lg:hidden fixed inset-0 z-[170] bg-black/45" onClick={() => setShowInvoiceActions(false)}>
          <div className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-white p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-300" />
            <div className="space-y-1 text-base">
              <button className="h-12 w-full text-left px-2 rounded-lg hover:bg-slate-50">Trả hàng</button>
              <button className="h-12 w-full text-left px-2 rounded-lg hover:bg-slate-50" onClick={() => { printInvoice(selectedInvoice.id); setShowInvoiceActions(false); }}>In</button>
              <button className="h-12 w-full text-left px-2 rounded-lg hover:bg-slate-50">Chia sẻ</button>
              <button className="h-12 w-full text-left px-2 rounded-lg text-rose-600 hover:bg-rose-50">Hủy hóa đơn</button>
            </div>
          </div>
        </div>
      )}
      </div>
      </div>
    </div>
  );
}
