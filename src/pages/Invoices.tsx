import { useEffect, useMemo, useState } from 'react';
import { Calendar, ChevronRight, Printer, Search, ShoppingCart, User, Wallet } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { formatCurrency } from '../lib/utils';
import { debtLedgerApi } from '../lib/api';
import { DebtLedger } from '../types';

export default function Invoices() {
  const { invoices, customers } = useApp();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'partial' | 'unpaid'>('all');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [debtPayments, setDebtPayments] = useState<DebtLedger[]>([]);

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
    <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-5 p-4 md:gap-6 md:p-6">
      <section className="rounded-lg border border-slate-200 bg-white p-4 md:p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-base font-semibold text-slate-900 md:text-lg">Lịch sử đơn hàng</h1>
            <p className="mt-1 text-sm text-slate-500">{invoices.length} đơn hàng trong hệ thống</p>
          </div>
          <div className="flex items-center gap-2">
            <Button className="h-10 text-sm" onClick={() => navigate('/app/pos')}>
              <ShoppingCart className="mr-2 h-4 w-4" />
              Lên đơn mới
            </Button>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="h-10 pl-10 text-sm"
              placeholder="Tìm theo mã đơn hoặc tên khách"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | 'completed' | 'partial' | 'unpaid')}
            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="completed">Đã thanh toán</option>
            <option value="partial">Thanh toán một phần</option>
            <option value="unpaid">Chưa thanh toán</option>
          </select>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="hidden border-b border-slate-100 px-4 py-3 text-xs text-slate-500 md:grid md:grid-cols-[1.2fr_1fr_1fr_1fr_auto] md:gap-3">
          <p>Mã đơn</p>
          <p>Khách hàng</p>
          <p>Thời gian</p>
          <p>Tổng tiền</p>
          <p className="text-right">Thao tác</p>
        </div>
        <div className="divide-y divide-slate-100">
          {filteredInvoices.map((inv) => {
            const customerName = inv.customerId ? customerNameById.get(inv.customerId) || 'Khách vãng lai' : 'Khách vãng lai';
            return (
              <div key={inv.id} className="p-4 md:grid md:grid-cols-[1.2fr_1fr_1fr_1fr_auto] md:items-center md:gap-3">
                <div className="mb-2 md:mb-0">
                  <p className="text-sm font-semibold text-slate-900">#{inv.id}</p>
                  <p className="text-xs text-slate-500">{inv.status}</p>
                </div>
                <p className="mb-2 text-sm text-slate-800 md:mb-0">{customerName}</p>
                <div className="mb-2 flex items-center gap-1 text-sm text-slate-600 md:mb-0">
                  <Calendar className="h-4 w-4 text-slate-400" />
                  {new Date(inv.createdAt).toLocaleString('vi-VN')}
                </div>
                <p className="mb-3 text-sm font-semibold text-slate-900 md:mb-0">{formatCurrency(inv.finalAmount)}</p>
                <div className="flex items-center justify-end gap-1">
                  <Button variant="ghost" size="icon" onClick={() => printInvoice(inv.id)}>
                    <Printer className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setSelectedInvoiceId(inv.id)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
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
          <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Chi tiết hóa đơn #{selectedInvoice.id}</h3>
                <p className="mt-1 text-sm text-slate-500">{new Date(selectedInvoice.createdAt).toLocaleString('vi-VN')}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedInvoiceId(null)}>Đóng</Button>
            </div>

            <div className="mt-4 space-y-3 rounded-lg border border-slate-100 p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Khách hàng</span>
                <span className="font-medium text-slate-900">
                  {selectedInvoice.customerId
                    ? customerNameById.get(selectedInvoice.customerId) || 'Khách vãng lai'
                    : 'Khách vãng lai'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Trạng thái</span>
                <span className="font-medium text-slate-900">{selectedInvoice.status}</span>
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
  );
}
