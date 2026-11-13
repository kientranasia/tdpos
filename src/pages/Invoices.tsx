import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpDown, Calendar, ChevronDown, ChevronRight, Printer, Receipt, RotateCcw, Search, ShoppingCart, SlidersHorizontal, User, Wallet, X } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { formatCurrency, normalizeSearchText } from '../lib/utils';
import { getInvoiceReceiptSummary } from '../lib/invoiceReceipt';
import { cashAccountsApi, debtLedgerApi, invoiceItemsApi, invoicesApi } from '../lib/api';
import { DebtLedger, Invoice, InvoiceItem } from '../types';
import { POSInvoiceModal } from '../components/pos/POSInvoiceModal';
import { toPng } from 'html-to-image';
import download from 'downloadjs';
import { printViaBridge } from '../lib/printBridge';

const invoiceDisplayNo = (invoice: Pick<Invoice, 'id' | 'documentNo'>) => {
  const documentNo = invoice.documentNo?.trim();
  if (documentNo) return documentNo;
  return `HD-${invoice.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
};

export default function Invoices() {
  const { invoices, customers, products, activeTenant, currentUser, refreshInvoices } = useApp();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'partial' | 'unpaid'>('all');
  const [pendingStatusFilter, setPendingStatusFilter] = useState<'all' | 'completed' | 'partial' | 'unpaid'>('all');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [debtPayments, setDebtPayments] = useState<DebtLedger[]>([]);
  const [selectedInvoiceItems, setSelectedInvoiceItems] = useState<InvoiceItem[]>([]);
  const [loadingInvoiceItems, setLoadingInvoiceItems] = useState(false);
  const [receiptInvoiceId, setReceiptInvoiceId] = useState<string | null>(null);
  const [timeFilter, setTimeFilter] = useState<'all' | 'today' | 'yesterday' | 'last7' | 'month' | 'lastMonth'>('all');
  const [showTimeSheet, setShowTimeSheet] = useState(false);
  const [showSummarySheet, setShowSummarySheet] = useState(false);
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [showInvoiceActions, setShowInvoiceActions] = useState(false);
  const [showReturnLookup, setShowReturnLookup] = useState(false);
  const [returnLookupTerm, setReturnLookupTerm] = useState('');
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnLines, setReturnLines] = useState<Array<{ invoiceItemId: string; productName: string; quantity: number; maxQuantity: number; price: number }>>([]);
  const [returnAccountId, setReturnAccountId] = useState('');
  const [returnAccounts, setReturnAccounts] = useState<any[]>([]);
  const [returnMessage, setReturnMessage] = useState('');
  const [salesReturns, setSalesReturns] = useState<any[]>([]);
  const [loadingSalesReturns, setLoadingSalesReturns] = useState(false);
  const receiptRef = useRef<HTMLDivElement | null>(null);

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
    const keyword = normalizeSearchText(searchTerm);
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
        return normalizeSearchText(`${invoiceDisplayNo(inv)} ${inv.id}`).includes(keyword) || normalizeSearchText(customerName).includes(keyword);
      })
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }, [customerNameById, invoices, searchTerm, timeFilter]);

  const filteredInvoices = useMemo(() => {
    if (statusFilter === 'all') return baseInvoices;
    return baseInvoices.filter((inv) => effectiveStatusOf(inv) === statusFilter);
  }, [baseInvoices, statusFilter]);

  const returnLookupInvoices = useMemo(() => {
    const keyword = normalizeSearchText(returnLookupTerm);
    return [...invoices]
      .filter((invoice) => invoice.workflowStatus === 'closed')
      .filter((invoice) => {
        if (!keyword) return true;
        const customer = invoice.customerId ? customers.find((item) => item.id === invoice.customerId) : null;
        const searchable = [
          invoice.id,
          invoice.documentNo || '',
          customer?.name || 'khách vãng lai',
          customer?.phone || '',
        ].map(normalizeSearchText);
        return searchable.some((value) => value.includes(keyword));
      })
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }, [customers, invoices, returnLookupTerm]);

  const selectedInvoice = useMemo(
    () => invoices.find((inv) => inv.id === selectedInvoiceId) || filteredInvoices.find((inv) => inv.id === selectedInvoiceId) || null,
    [filteredInvoices, invoices, selectedInvoiceId]
  );

  const receiptInvoice = useMemo(
    () => invoices.find((invoice) => invoice.id === receiptInvoiceId) || null,
    [invoices, receiptInvoiceId]
  );

  const receiptCustomer = useMemo(
    () => receiptInvoice?.customerId ? customers.find((customer) => customer.id === receiptInvoice.customerId) || null : null,
    [customers, receiptInvoice]
  );

  const selectedInvoiceReceipt = useMemo(
    () => selectedInvoice ? getInvoiceReceiptSummary(selectedInvoice) : null,
    [selectedInvoice]
  );

  const returnSummaryByInvoice = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    salesReturns.forEach((item) => {
      if (!item.invoiceId) return;
      const current = map.get(item.invoiceId) || { count: 0, total: 0 };
      map.set(item.invoiceId, { count: current.count + 1, total: current.total + Number(item.totalAmount || 0) });
    });
    return map;
  }, [salesReturns]);

  const selectedInvoiceReturns = useMemo(
    () => salesReturns.filter((item) => item.invoiceId === selectedInvoiceId),
    [salesReturns, selectedInvoiceId]
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
    const unpaidCount = filteredInvoices.filter((inv) => effectiveStatusOf(inv) === 'unpaid').length;
    const partialCount = filteredInvoices.filter((inv) => effectiveStatusOf(inv) === 'partial').length;
    const debtTotal = filteredInvoices.reduce((sum, inv) => sum + (inv.debtAmount || 0), 0);
    return { totalRevenue, unpaidCount, partialCount, debtTotal };
  }, [filteredInvoices]);

  const statusMeta = (status: 'completed' | 'partial' | 'unpaid') => {
    if (status === 'completed') return { label: 'Đã thanh toán', tone: 'status-chip-success' };
    if (status === 'partial') return { label: 'Thanh toán một phần', tone: 'status-chip-warning' };
    return { label: 'Chưa thanh toán', tone: 'status-chip-danger' };
  };

  const openReturnModal = async (invoice: Invoice) => {
    try {
      const [data, accounts] = await Promise.all([invoicesApi.returnable(invoice.id), cashAccountsApi.list()]);
      setReturnLines(data.items.map((item: any) => ({ invoiceItemId: item.id, productName: item.productName, quantity: 0, maxQuantity: Math.max(0, Number(item.returnableQuantity ?? (Number(item.soldQuantity ?? item.quantity) - Number(item.returnedQuantity || 0)))), price: Number(item.price) })));
      setReturnAccounts(accounts); setReturnAccountId(invoice.accountId || accounts.find((account: any) => account.type === 'cash')?.id || accounts[0]?.id || ''); setReturnMessage(''); setShowReturnModal(true);
    } catch (error) { setReturnMessage(error instanceof Error ? error.message : 'Không thể tải hàng hóa có thể trả.'); }
  };

  const openReturnLookup = () => {
    setReturnLookupTerm('');
    setShowReturnLookup(true);
  };

  const chooseReturnInvoice = async (invoice: Invoice) => {
    setSelectedInvoiceId(invoice.id);
    setShowReturnLookup(false);
    await openReturnModal(invoice);
  };

  const loadSalesReturns = async () => {
    setLoadingSalesReturns(true);
    try {
      setSalesReturns(await invoicesApi.returns());
    } catch {
      setSalesReturns([]);
    } finally {
      setLoadingSalesReturns(false);
    }
  };

  const submitReturn = async () => {
    if (!selectedInvoice) return;
    const items = returnLines.filter((line) => line.quantity > 0).map((line) => ({ invoiceItemId: line.invoiceItemId, quantity: line.quantity }));
    if (!items.length) return setReturnMessage('Nhập số lượng trả cho ít nhất một dòng.');
    try {
      const result = await invoicesApi.createReturn(selectedInvoice.id, { items, refundAccountId: returnAccountId || null });
      setReturnMessage(`Đã trả hàng. Giảm công nợ ${formatCurrency(Number(result.debtReduction || 0))}, hoàn tiền ${formatCurrency(Number(result.refundAmount || 0))}.`);
      setShowReturnModal(false); await Promise.all([refreshInvoices(), loadSalesReturns()]);
    } catch (error) { setReturnMessage(error instanceof Error ? error.message : 'Không thể tạo phiếu trả khách hàng.'); }
  };

  const canSubmitReturn = returnLines.some((line) => line.maxQuantity > 0 && line.quantity > 0);

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
    const invoiceId = searchParams.get('invoiceId');
    if (invoiceId && invoices.some((invoice) => invoice.id === invoiceId)) {
      setSelectedInvoiceId(invoiceId);
    }
  }, [invoices, searchParams]);

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
    void loadSalesReturns();
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
    if (!selectedInvoiceId) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setShowInvoiceActions(false);
      setSelectedInvoiceId(null);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedInvoiceId]);

  useEffect(() => {
    if (showFilterSheet) setPendingStatusFilter(statusFilter);
  }, [showFilterSheet, statusFilter]);

  const openReceiptModal = (invoiceId: string) => {
    if (invoiceId !== selectedInvoiceId) setLoadingInvoiceItems(true);
    setSelectedInvoiceId(invoiceId);
    setReceiptInvoiceId(invoiceId);
  };

  const openInvoiceDetail = (invoiceId: string) => {
    setShowInvoiceActions(false);
    setSelectedInvoiceId(invoiceId);
  };

  const printReceipt = async () => {
    const invoice = receiptInvoice;
    const receiptNode = receiptRef.current;
    if (!invoice || !receiptNode) return;
    if (await printViaBridge({ text: receiptNode.innerText, documentNo: invoice.documentNo || invoice.id })) return;
    const printFrame = document.createElement('iframe');
    printFrame.setAttribute('title', 'Bản in hóa đơn');
    printFrame.style.position = 'fixed';
    printFrame.style.right = '-10000px';
    printFrame.style.bottom = '0';
    printFrame.style.width = '1px';
    printFrame.style.height = '1px';
    printFrame.style.border = '0';
    document.body.appendChild(printFrame);
    const frameDocument = printFrame.contentDocument;
    if (!frameDocument) {
      printFrame.remove();
      return;
    }
    const copiedStyles = Array.from(document.head.querySelectorAll('style, link[rel="stylesheet"]')).map((style) => style.outerHTML).join('');
    frameDocument.open();
    frameDocument.write(`<!doctype html><html><head><meta charset="utf-8">${copiedStyles}<style>@page{margin:0}html,body{margin:0;padding:0;background:#fff}body{display:flex;align-items:flex-start;justify-content:center}#printable-invoice{margin:0!important;border:0!important;box-shadow:none!important}</style></head><body>${receiptNode.outerHTML}</body></html>`);
    frameDocument.close();
    let printed = false;
    const printNow = () => {
      if (printed) return;
      printed = true;
      printFrame.contentWindow?.focus();
      printFrame.contentWindow?.print();
      window.setTimeout(() => printFrame.remove(), 500);
    };
    printFrame.onload = printNow;
    window.setTimeout(printNow, 250);
  };

  const exportReceiptImage = () => {
    const invoice = receiptInvoice;
    const receiptNode = receiptRef.current;
    if (!invoice || !receiptNode) return;
    const width = Math.ceil(receiptNode.scrollWidth || receiptNode.getBoundingClientRect().width);
    const height = Math.ceil(receiptNode.scrollHeight || receiptNode.getBoundingClientRect().height);
    void toPng(receiptNode, {
      cacheBust: true,
      backgroundColor: '#ffffff',
      width,
      height,
      pixelRatio: 2,
      style: { width: `${width}px`, height: `${height}px`, margin: '0', borderRadius: '0', boxShadow: 'none', overflow: 'visible' },
    }).then((dataUrl) => download(dataUrl, `HoaDon_${invoice.documentNo || invoice.id}.png`)).catch(() => undefined);
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
                  <button onClick={() => navigate('/app/returns')} className="h-9 w-9 rounded-lg text-orange-600 hover:bg-orange-50 flex items-center justify-center" aria-label="Mở mục trả hàng">
                    <RotateCcw className="h-5 w-5" />
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
              const returnSummary = returnSummaryByInvoice.get(inv.id);
              const prev = filteredInvoices[index - 1];
              const showDateGroup = !prev || new Date(prev.createdAt).toDateString() !== new Date(inv.createdAt).toDateString();
              return (
                <div key={inv.id}>
                  {showDateGroup && (
                    <div className="px-4 pt-4 text-[12px] font-semibold text-slate-500 uppercase tracking-wide">
                      {dayLabel(inv.createdAt)}
                    </div>
                  )}
                  <button type="button" aria-label={`Mở ${invoiceDisplayNo(inv)}`} onClick={(event) => { event.preventDefault(); event.stopPropagation(); openInvoiceDetail(inv.id); }} className="w-full touch-manipulation px-4 py-3 text-left transition-colors active:bg-sky-50">
                    <div className="flex justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[18px] font-semibold leading-tight text-slate-900">{invoiceDisplayNo(inv)}</p>
                        <p className="mt-1 text-[13px] text-slate-500">{customerName} · {new Date(inv.createdAt).toLocaleString('vi-VN')}</p>
                        <p className="text-[14px] text-slate-600 mt-1 truncate">
                          {inv.customerId ? 'Khách hàng có hồ sơ' : 'Khách vãng lai'} · Chạm để xem chi tiết
                        </p>
                        {returnSummary && <p className="mt-1 text-[12px] font-medium text-orange-700">Đã trả {formatCurrency(returnSummary.total)} · {returnSummary.count} phiếu</p>}
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

      <div className="hidden lg:flex p-3 lg:p-4 bg-white border-b border-slate-200 sticky top-0 z-40 flex-col lg:flex-row gap-2 lg:gap-4 items-start lg:items-center justify-between shadow-sm shrink-0">
        <div className="hidden lg:flex items-center gap-5">
          <div className="h-9 w-9 rounded-lg bg-sky-600 text-white flex items-center justify-center shadow-sm shrink-0">
            <Receipt className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-base font-semibold leading-tight text-slate-900">Hóa đơn</h1>
            <p className="text-[11px] leading-tight text-slate-500 mt-0.5">{invoices.length} đơn hàng trong hệ thống</p>
          </div>
        </div>

        <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-row sm:gap-3 lg:w-auto">
          <div className="relative w-full sm:w-auto">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="h-9 lg:h-10 pl-10 text-sm rounded-lg border-none bg-slate-100/70 shadow-inner"
              placeholder="Tìm theo mã đơn hoặc tên khách"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-2 sm:flex sm:items-center sm:gap-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | 'completed' | 'partial' | 'unpaid')}
              className="h-9 lg:h-10 rounded-lg border-none bg-slate-100/70 shadow-inner px-3 text-sm text-slate-700"
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="completed">Đã thanh toán</option>
              <option value="partial">Thanh toán một phần</option>
              <option value="unpaid">Chưa thanh toán</option>
            </select>
            <div className="flex items-center gap-2">
              <Button variant="outline" className="h-9 lg:h-10 px-3 text-sm" onClick={() => navigate('/app/returns')}>
                <RotateCcw className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Trả hàng</span>
              </Button>
              <Button className="h-9 lg:h-10 text-sm px-3 lg:px-4" onClick={() => navigate('/app/pos')}>
                <ShoppingCart className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Lên đơn mới</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="hidden lg:block flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-2 p-2 md:gap-3 md:p-3">
        <section className="grid grid-cols-2 gap-1.5 md:grid-cols-4">
        <div className="rounded-md border border-slate-200 bg-white px-2 py-1.5">
          <p className="text-[11px] text-slate-500">Doanh thu theo bộ lọc</p>
          <p className="mt-0.5 text-base font-semibold text-sky-700 tabular-nums">{formatCurrency(invoiceOverview.totalRevenue)}</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white px-2 py-1.5">
          <p className="text-[11px] text-slate-500">Đơn chưa thanh toán</p>
          <p className="mt-0.5 text-base font-semibold text-amber-700 tabular-nums">{invoiceOverview.unpaidCount}</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white px-2 py-1.5">
          <p className="text-[11px] text-slate-500">Đơn thanh toán một phần</p>
          <p className="mt-0.5 text-base font-semibold text-orange-700 tabular-nums">{invoiceOverview.partialCount}</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white px-2 py-1.5">
          <p className="text-[11px] text-slate-500">Tổng công nợ còn lại</p>
          <p className="mt-0.5 text-base font-semibold text-rose-700 tabular-nums">{formatCurrency(invoiceOverview.debtTotal)}</p>
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-1.5">
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setStatusFilter('all')}
            className={`h-8 rounded-md px-2.5 text-xs ${statusFilter === 'all' ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-600'}`}
          >
            Tất cả
          </button>
          <button
            onClick={() => setStatusFilter('completed')}
            className={`h-8 rounded-md px-2.5 text-xs ${statusFilter === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}
          >
            Đã thanh toán
          </button>
          <button
            onClick={() => setStatusFilter('partial')}
            className={`h-8 rounded-md px-2.5 text-xs ${statusFilter === 'partial' ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-600'}`}
          >
            Thanh toán một phần
          </button>
          <button
            onClick={() => setStatusFilter('unpaid')}
            className={`h-8 rounded-md px-2.5 text-xs ${statusFilter === 'unpaid' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}
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
          {filteredInvoices.map((inv) => {
            const customerName = inv.customerId ? customerNameById.get(inv.customerId) || 'Khách vãng lai' : 'Khách vãng lai';
            const returnSummary = returnSummaryByInvoice.get(inv.id);
            const meta = statusMeta(effectiveStatusOf(inv));
            return (
              <div key={inv.id}>
              <div className="p-3 md:grid md:grid-cols-[1.2fr_1fr_1fr_1fr_auto] md:items-center md:gap-3">
                <div className="mb-2 md:mb-0">
                  <button type="button" className="text-left text-sm font-semibold text-sky-700 hover:underline" onClick={() => openInvoiceDetail(inv.id)}>#{invoiceDisplayNo(inv)}</button>
                  <span className={`status-chip mt-1 ${meta.tone}`}>{meta.label}</span>
                  {returnSummary && <p className="mt-1 text-xs font-medium text-orange-700">Đã trả {formatCurrency(returnSummary.total)} · {returnSummary.count} phiếu</p>}
                </div>
                {inv.customerId ? <button type="button" className="mb-2 text-left text-sm text-sky-700 hover:underline md:mb-0" onClick={() => navigate(`/app/customers/${inv.customerId}`)}>{customerName}</button> : <p className="mb-2 text-sm text-slate-800 md:mb-0">{customerName}</p>}
                <div className="mb-2 flex items-center gap-1 text-sm text-slate-600 md:mb-0">
                  <Calendar className="h-4 w-4 text-slate-400" />
                  {new Date(inv.createdAt).toLocaleString('vi-VN')}
                </div>
                <div className="mb-3 md:mb-0">
                  <p className="text-sm font-semibold text-slate-900">{formatCurrency(inv.finalAmount)}</p>
                  <p className="text-xs text-slate-500">Tạo bởi: {inv.createdByName || 'Chưa xác định'}</p>
                </div>
                <div className="flex items-center justify-end gap-1">
                  {inv.workflowStatus === 'closed' && <Button variant="outline" className="h-8 px-2 text-xs" onClick={() => navigate(`/app/returns?invoiceId=${encodeURIComponent(inv.id)}`)}><RotateCcw className="mr-1 h-3.5 w-3.5" />Trả hàng</Button>}
                  <Button variant="ghost" size="icon" onClick={() => openReceiptModal(inv.id)}>
                    <Printer className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => openInvoiceDetail(inv.id)}>
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
        <div
          className="fixed inset-0 z-[220] flex items-stretch justify-center bg-black/45 p-0 lg:items-center lg:p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedInvoiceId(null);
          }}
        >
          <div
            className="hidden max-h-[calc(100dvh-2rem)] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl lg:flex"
            role="dialog"
            aria-modal="true"
            aria-labelledby="invoice-detail-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 p-4">
              <div>
                <h3 id="invoice-detail-title" className="text-base font-semibold text-slate-900">Chi tiết hóa đơn #{invoiceDisplayNo(selectedInvoice)}</h3>
                <p className="mt-1 text-sm text-slate-500">{new Date(selectedInvoice.createdAt).toLocaleString('vi-VN')}</p>
              </div>
              <button
                type="button"
                aria-label="Đóng chi tiết hóa đơn"
                onClick={() => setSelectedInvoiceId(null)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 text-sm">
              <div className="space-y-3 rounded-lg border border-slate-100 p-4">
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
                              <button type="button" className="block max-w-full truncate text-left text-sm font-medium text-slate-900 hover:text-sky-700 hover:underline" onClick={() => navigate(`/app/inventory?productId=${encodeURIComponent(item.productId)}`)}>{item.productName}</button>
                              <button type="button" className="block text-xs text-slate-500 hover:text-sky-700 hover:underline" onClick={() => navigate(`/app/inventory?productId=${encodeURIComponent(item.productId)}`)}>{product?.sku || item.productId}</button>
                              <p className="text-xs text-slate-600">{formatCurrency(item.price)} x {item.quantity}</p>
                              {item.note?.trim() && <p className="mt-1 break-words text-xs text-sky-800">Ghi chú: {item.note.trim()}</p>}
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
                {selectedInvoice.customerId ? (
                  <button type="button" className="font-medium text-sky-700 hover:underline" onClick={() => navigate(`/app/customers/${selectedInvoice.customerId}`)}>
                    {customerNameById.get(selectedInvoice.customerId) || 'Khách vãng lai'}
                  </button>
                ) : <span className="font-medium text-slate-900">Khách vãng lai</span>}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Nhân sự tạo đơn</span>
                <span className="font-medium text-slate-900">{selectedInvoice.createdByName || 'Chưa xác định'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Trạng thái</span>
                <div className="flex gap-1">
                  <span className={`status-chip ${statusMeta(effectiveStatusOf(selectedInvoice)).tone}`}>{statusMeta(effectiveStatusOf(selectedInvoice)).label}</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Tổng hàng</span>
                <span className="font-semibold text-slate-900">{formatCurrency(selectedInvoiceReceipt?.totalAmount || 0)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Giảm giá</span>
                <span className="font-medium text-slate-900">{formatCurrency(selectedInvoiceReceipt?.discount || 0)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Khách cần trả</span>
                <span className="font-medium text-sky-700">{formatCurrency(selectedInvoiceReceipt?.amountDue || 0)}</span>
              </div>
              {selectedInvoice.customerId && <div className="flex items-center justify-between">
                <span className="text-slate-500">Nợ cũ</span>
                <span className="font-medium text-orange-700">{formatCurrency(selectedInvoiceReceipt?.previousDebt || 0)}</span>
              </div>}
              <div className="flex items-center justify-between border-t border-slate-100 pt-2">
                <span className="font-semibold text-slate-900">Tổng cuối toa</span>
                <span className="font-semibold text-slate-900">{formatCurrency(selectedInvoiceReceipt?.grandTotal || 0)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Khách đã trả</span>
                <span className="font-medium text-slate-900">{formatCurrency(selectedInvoiceReceipt?.paidAmount || 0)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Tiền thừa trả khách</span>
                <span className="font-medium text-emerald-700">{formatCurrency(selectedInvoiceReceipt?.changeAmount || 0)}</span>
              </div>
              {selectedInvoiceReceipt && selectedInvoiceReceipt.debtAmount > 0 && <div className="flex items-center justify-between">
                <span className="text-slate-500">Công nợ mới</span>
                <span className="font-medium text-amber-700">{formatCurrency(selectedInvoiceReceipt.debtAmount)}</span>
              </div>}
              {selectedInvoiceReceipt && selectedInvoiceReceipt.remainingDebt > 0 && <div className="flex items-center justify-between">
                <span className="text-slate-500">Công nợ còn lại</span>
                <span className="font-medium text-orange-700">{formatCurrency(selectedInvoiceReceipt.remainingDebt)}</span>
              </div>}
              {selectedInvoiceReturns.length > 0 && (
                <div className="mt-3 rounded-md bg-orange-50 px-3 py-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-orange-900">Đã trả hàng</span>
                    <span className="font-semibold text-orange-700">{formatCurrency(selectedInvoiceReturns.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0))}</span>
                  </div>
                  <div className="mt-2 space-y-1 border-t border-orange-100 pt-2">
                    {selectedInvoiceReturns.map((returnSlip) => <button key={returnSlip.id} type="button" onClick={() => setShowReturnModal(false)} className="flex w-full items-center justify-between text-left text-xs text-orange-800 hover:underline"><span>{returnSlip.documentNo || returnSlip.id}</span><span>{new Date(returnSlip.createdAt).toLocaleDateString('vi-VN')} · {formatCurrency(Number(returnSlip.totalAmount || 0))}</span></button>)}
                  </div>
                </div>
              )}
              {selectedInvoice.note?.trim() && (
                <div className="mt-3 rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
                  <p className="text-xs font-medium uppercase text-slate-500">Ghi chú đơn hàng</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{selectedInvoice.note.trim()}</p>
                </div>
              )}
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-100 p-4">
              {selectedInvoice.customerId && (
                <Button variant="outline" className="h-10 text-sm" onClick={() => navigate(`/app/customers/${selectedInvoice.customerId}`)}>
                  <User className="mr-2 h-4 w-4" />
                  Mở khách hàng
                </Button>
              )}
              {selectedInvoice.workflowStatus === 'closed' && <Button variant="outline" className="h-10 text-sm" onClick={() => navigate(`/app/returns?invoiceId=${encodeURIComponent(selectedInvoice.id)}`)}><RotateCcw className="mr-2 h-4 w-4" />Trả hàng</Button>}
              <Button className="h-10 text-sm" onClick={() => openReceiptModal(selectedInvoice.id)}>
                <Printer className="mr-2 h-4 w-4" />
                In hóa đơn
              </Button>
            </div>
          </div>

          <div
            className="flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-100 lg:hidden"
            role="dialog"
            aria-modal="true"
            aria-labelledby="invoice-detail-mobile-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 shadow-sm">
              <button type="button" onClick={() => setSelectedInvoiceId(null)} className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Đóng chi tiết hóa đơn">
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div className="min-w-0 flex-1 px-3">
                <p id="invoice-detail-mobile-title" className="truncate text-base font-semibold text-slate-900">#{invoiceDisplayNo(selectedInvoice)}</p>
                <p className="text-xs text-slate-500">{new Date(selectedInvoice.createdAt).toLocaleString('vi-VN')} · {statusMeta(effectiveStatusOf(selectedInvoice)).label}</p>
              </div>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setShowInvoiceActions(true)} className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 text-xl leading-none hover:bg-slate-100" aria-label="Thao tác hóa đơn">•••</button>
                <button type="button" onClick={() => setSelectedInvoiceId(null)} className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Đóng chi tiết hóa đơn"><X className="h-5 w-5" /></button>
              </div>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 pb-mobile-nav">
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
                          <button type="button" className="block text-left text-[17px] font-medium text-slate-900 line-clamp-2 hover:text-sky-700 hover:underline" onClick={() => navigate(`/app/inventory?productId=${encodeURIComponent(item.productId)}`)}>{item.productName}</button>
                          <button type="button" className="block text-[13px] text-slate-500 hover:text-sky-700 hover:underline" onClick={() => navigate(`/app/inventory?productId=${encodeURIComponent(item.productId)}`)}>{product?.sku || item.productId}</button>
                          <p className="text-[14px] text-slate-700">{formatCurrency(item.price)} x {item.quantity}</p>
                          {item.note?.trim() && <p className="mt-1 break-words text-[13px] text-sky-800">Ghi chú: {item.note.trim()}</p>}
                        </div>
                      </div>
                      <p className="text-[18px] font-semibold text-slate-900 tabular-nums">{formatCurrency(item.total)}</p>
                    </div>
                  );
                })}
              </div>
              <div className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100 text-base">
                <div className="p-4 flex justify-between"><span>Tổng hàng</span><span>{formatCurrency(selectedInvoiceReceipt?.totalAmount || 0)}</span></div>
                <div className="p-4 flex justify-between"><span>Giảm giá</span><span>{formatCurrency(selectedInvoiceReceipt?.discount || 0)}</span></div>
                <div className="p-4 flex justify-between"><span>Khách cần trả</span><span>{formatCurrency(selectedInvoiceReceipt?.amountDue || 0)}</span></div>
                {selectedInvoice.customerId && <div className="p-4 flex justify-between"><span>Nợ cũ</span><span className="text-orange-700">{formatCurrency(selectedInvoiceReceipt?.previousDebt || 0)}</span></div>}
                <div className="p-4 flex justify-between font-semibold"><span>Tổng cuối toa</span><span>{formatCurrency(selectedInvoiceReceipt?.grandTotal || 0)}</span></div>
                <div className="p-4 flex justify-between"><span>Khách đã trả</span><span className="text-sky-700">{formatCurrency(selectedInvoiceReceipt?.paidAmount || 0)}</span></div>
                <div className="p-4 flex justify-between"><span>Tiền thừa trả khách</span><span className="text-emerald-700">{formatCurrency(selectedInvoiceReceipt?.changeAmount || 0)}</span></div>
                {selectedInvoiceReceipt && selectedInvoiceReceipt.remainingDebt > 0 && <div className="p-4 flex justify-between"><span>Công nợ còn lại</span><span className="text-orange-700">{formatCurrency(selectedInvoiceReceipt.remainingDebt)}</span></div>}
              </div>
              {selectedInvoiceReturns.length > 0 && <div className="rounded-lg border border-orange-100 bg-orange-50 p-4"><div className="flex items-center justify-between"><span className="font-medium text-orange-900">Đã trả hàng</span><span className="font-semibold text-orange-700">{formatCurrency(selectedInvoiceReturns.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0))}</span></div><div className="mt-2 space-y-1 border-t border-orange-100 pt-2">{selectedInvoiceReturns.map((returnSlip) => <p key={returnSlip.id} className="flex justify-between text-xs text-orange-800"><span>{returnSlip.documentNo || returnSlip.id}</span><span>{formatCurrency(Number(returnSlip.totalAmount || 0))}</span></p>)}</div></div>}
              {selectedInvoice.note?.trim() && (
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <p className="text-xs uppercase text-slate-400">Ghi chú đơn hàng</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{selectedInvoice.note.trim()}</p>
                </div>
              )}
              <div className="rounded-lg border border-slate-200 bg-white p-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <p className="text-slate-500">Kênh bán</p>
                  <p className="font-medium text-slate-900">Bán trực tiếp</p>
                </div>
                <div>
                  <p className="text-slate-500">Người tạo</p>
                  <p className="font-medium text-slate-900">{selectedInvoice.createdByName || 'Chưa xác định'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {receiptInvoice && !loadingInvoiceItems && (
        <POSInvoiceModal
          ref={receiptRef}
          isOpen
          onClose={() => setReceiptInvoiceId(null)}
          lastInvoiceId={invoiceDisplayNo(receiptInvoice)}
          activeTenant={activeTenant}
          selectedCustomer={receiptCustomer}
          paymentMethod={receiptInvoice.paymentMethod}
          currentInvoiceItems={selectedInvoiceItems}
          currentInvoice={receiptInvoice}
          currentUserName={receiptInvoice.createdByName || currentUser?.name || 'Chưa xác định'}
          onExportImage={exportReceiptImage}
          onPrint={printReceipt}
        />
      )}
      {showReturnLookup && (
        <div className="fixed inset-0 z-[175] flex items-center justify-center bg-slate-900/60 p-4" onClick={() => setShowReturnLookup(false)}>
          <div className="flex max-h-[calc(100dvh-1rem)] w-full max-w-xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 p-4">
              <div>
                <h2 className="font-semibold text-slate-900">Tìm hóa đơn để trả hàng</h2>
                <p className="mt-0.5 text-xs text-slate-500">Không cần nhớ mã đơn — tìm theo khách hàng hoặc chọn theo thời gian.</p>
              </div>
              <button type="button" onClick={() => setShowReturnLookup(false)} aria-label="Đóng"><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <div className="border-b border-slate-100 p-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input autoFocus value={returnLookupTerm} onChange={(event) => setReturnLookupTerm(event.target.value)} className="h-10 pl-9" placeholder="Tên khách, số điện thoại hoặc mã đơn" />
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {returnLookupInvoices.slice(0, 50).map((invoice) => {
                const customer = invoice.customerId ? customers.find((item) => item.id === invoice.customerId) : null;
                const customerName = customer?.name || 'Khách vãng lai';
                const returnSummary = returnSummaryByInvoice.get(invoice.id);
                return (
                  <div key={invoice.id} className="flex items-center justify-between gap-3 rounded-md border-b border-slate-100 px-2 py-3 last:border-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-sky-700">#{invoice.documentNo || invoice.id}</p>
                      <p className="mt-0.5 truncate text-sm text-slate-800">{customerName}{customer?.phone ? ` · ${customer.phone}` : ''}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{new Date(invoice.createdAt).toLocaleString('vi-VN')} · {formatCurrency(invoice.finalAmount)}</p>
                      {returnSummary && <p className="mt-0.5 text-xs font-medium text-orange-700">Đã trả {formatCurrency(returnSummary.total)} · {returnSummary.count} phiếu</p>}
                    </div>
                    <Button variant="outline" className="h-8 shrink-0 px-3 text-xs" onClick={() => void chooseReturnInvoice(invoice)}>Chọn đơn</Button>
                  </div>
                );
              })}
              {returnLookupInvoices.length === 0 && <p className="p-6 text-center text-sm text-slate-500">Không tìm thấy hóa đơn đã chốt phù hợp.</p>}
              {returnLookupInvoices.length > 50 && <p className="px-2 py-2 text-center text-xs text-slate-400">Đang hiển thị 50 hóa đơn gần nhất. Hãy nhập thêm thông tin để lọc.</p>}
            </div>
          </div>
        </div>
      )}
      {showReturnModal && selectedInvoice && (
        <div className="fixed inset-0 z-[180] flex items-center justify-center bg-slate-900/60 p-4">
          <div className="max-h-[calc(100dvh-1rem)] w-full max-w-2xl space-y-4 overflow-y-auto rounded-lg bg-white p-4 shadow-2xl sm:p-5">
            <div className="flex items-center justify-between"><div><h2 className="font-semibold text-slate-900">Tạo phiếu trả hàng</h2><p className="text-xs text-slate-500">Hóa đơn #{selectedInvoice.id} · Chọn từng món và số lượng cần trả</p></div><button onClick={() => setShowReturnModal(false)}><X className="h-5 w-5 text-slate-400" /></button></div>
            <div className="rounded-md bg-sky-50 px-3 py-2 text-xs text-sky-800">Phiếu trả hàng được liên kết với hóa đơn gốc, cập nhật lại tồn kho và ghi nhận hoàn tiền trong sổ quỹ.</div>
            <div className="space-y-2">{returnLines.map((line, index) => <div key={line.invoiceItemId} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-md border border-slate-100 p-3"><div><p className="font-medium text-slate-900">{line.productName}</p><p className="text-xs text-slate-500">Còn có thể trả: {line.maxQuantity}</p></div><Input type="number" min="0" max={line.maxQuantity} value={line.quantity || ''} disabled={line.maxQuantity <= 0} onChange={(e) => setReturnLines(returnLines.map((row, i) => i === index ? { ...row, quantity: Math.min(row.maxQuantity, Number(e.target.value) || 0) } : row))} className="h-9 w-24" /><span className="text-sm text-slate-600">{formatCurrency(line.quantity * line.price)}</span></div>)}</div>
            {!canSubmitReturn && <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">Hóa đơn này không còn số lượng có thể trả.</p>}
            <label className="block text-sm text-slate-600">Tài khoản hoàn tiền<select value={returnAccountId} onChange={(e) => setReturnAccountId(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3"><option value="">Tự động</option>{returnAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
            {returnMessage && <p className="rounded-md bg-sky-50 px-3 py-2 text-sm text-sky-700">{returnMessage}</p>}
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setShowReturnModal(false)}>Hủy</Button><Button disabled={!canSubmitReturn} onClick={() => void submitReturn()}><RotateCcw className="mr-2 h-4 w-4" />Xác nhận trả hàng</Button></div>
          </div>
        </div>
      )}
      {selectedInvoice && showInvoiceActions && (
        <div className="lg:hidden fixed inset-0 z-[230] bg-black/45" onClick={() => setShowInvoiceActions(false)}>
          <div className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-white p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-300" />
            <div className="space-y-1 text-base">
              <button className="h-12 w-full text-left px-2 rounded-lg hover:bg-slate-50 disabled:opacity-40" disabled={selectedInvoice.workflowStatus !== 'closed'} onClick={() => { setShowInvoiceActions(false); navigate(`/app/returns?invoiceId=${encodeURIComponent(selectedInvoice.id)}`); }}>Trả hàng</button>
              <button className="h-12 w-full text-left px-2 rounded-lg hover:bg-slate-50" onClick={() => { openReceiptModal(selectedInvoice.id); setShowInvoiceActions(false); }}>In</button>
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
