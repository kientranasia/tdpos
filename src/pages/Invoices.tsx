import { useEffect, useMemo, useState } from 'react';
import { Calendar, ChevronRight, Printer, Receipt, Search, ShoppingCart, User, Wallet } from 'lucide-react';
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
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [debtPayments, setDebtPayments] = useState<DebtLedger[]>([]);
  const [selectedInvoiceItems, setSelectedInvoiceItems] = useState<InvoiceItem[]>([]);
  const [loadingInvoiceItems, setLoadingInvoiceItems] = useState(false);

  const customerNameById = useMemo(() => {
    const map = new Map<string, string>();
    customers.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [customers]);

  const filteredInvoices = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    return [...invoices]
      .filter((inv) => (statusFilter === 'all' ? true : inv.status === statusFilter))
      .filter((inv) => {
        if (!keyword) return true;
        const customerName = inv.customerId ? customerNameById.get(inv.customerId) || '' : 'khách vãng lai';
        return inv.id.toLowerCase().includes(keyword) || customerName.toLowerCase().includes(keyword);
      })
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }, [customerNameById, invoices, searchTerm, statusFilter]);

  const selectedInvoice = useMemo(
    () => filteredInvoices.find((inv) => inv.id === selectedInvoiceId) || null,
    [filteredInvoices, selectedInvoiceId]
  );

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
      <div className="p-4 lg:p-8 bg-white border-b sticky top-0 z-40 flex flex-col lg:flex-row gap-3 lg:gap-6 items-start lg:items-center justify-between shadow-sm shrink-0">
        <div className="hidden lg:flex items-center gap-5">
          <div className="h-9 w-9 sm:h-12 sm:w-12 rounded-lg bg-sky-600 text-white flex items-center justify-center shadow-lg shadow-sky-900/20 transform -rotate-3 shrink-0">
            <Receipt className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>
          <div>
            <h1 className="text-page-title">Lịch sử đơn hàng</h1>
            <p className="text-page-subtitle mt-1">{invoices.length} đơn hàng trong hệ thống</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="h-10 lg:h-11 pl-10 text-sm rounded-lg border-none bg-slate-100/70 shadow-inner"
              placeholder="Tìm theo mã đơn hoặc tên khách"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
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
          <Button className="h-10 lg:h-11 text-sm" onClick={() => navigate('/app/pos')}>
            <ShoppingCart className="mr-2 h-4 w-4" />
            Lên đơn mới
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
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

      {selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5">
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
        </div>
      )}
      </div>
      </div>
    </div>
  );
}
