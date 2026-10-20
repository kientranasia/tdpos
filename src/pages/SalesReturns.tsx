import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Barcode, Check, PackagePlus, Receipt, RotateCcw, Search, UserRound, WalletCards, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { BarcodeScannerModal } from '../components/barcode/BarcodeScannerModal';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import AppPageHeader from '../components/layout/AppPageHeader';
import { cashAccountsApi, invoicesApi, productsApi } from '../lib/api';
import { formatCurrency, normalizeSearchText } from '../lib/utils';
import { Invoice, Product, ProductUnit } from '../types';

type ReturnMode = 'invoice' | 'quick';

type ReturnLine = {
  key: string;
  invoiceItemId: string | null;
  productId: string;
  productName: string;
  quantity: number;
  maxQuantity: number | null;
  price: number;
  unitName: string;
  unitFactor: number;
};

type SaleUnit = Pick<ProductUnit, 'name' | 'factor' | 'barcode'>;

const productUnits = (product: Product): SaleUnit[] => product.units?.length
  ? product.units
  : [{ name: product.unit, factor: 1, barcode: product.barcode }];

const unitForCode = (product: Product, code: string) => {
  const normalizedCode = normalizeSearchText(code);
  return productUnits(product).find((unit) => normalizeSearchText(unit.barcode) === normalizedCode) || productUnits(product)[0];
};

const productMatchesCode = (product: Product, code: string) => {
  const normalizedCode = normalizeSearchText(code);
  return normalizeSearchText(product.sku) === normalizedCode
    || normalizeSearchText(product.barcode) === normalizedCode
    || productUnits(product).some((unit) => normalizeSearchText(unit.barcode) === normalizedCode);
};

export default function SalesReturns() {
  const { invoices, customers, products, refreshInvoices, refreshProducts } = useApp();
  const [searchParams] = useSearchParams();
  const requestedInvoiceId = searchParams.get('invoiceId');
  const [mode, setMode] = useState<ReturnMode>('invoice');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [returnLines, setReturnLines] = useState<ReturnLine[]>([]);
  const [quickSearch, setQuickSearch] = useState('');
  const [quickLines, setQuickLines] = useState<ReturnLine[]>([]);
  const [quickCustomerId, setQuickCustomerId] = useState('');
  const [quickNote, setQuickNote] = useState('');
  const [accounts, setAccounts] = useState<any[]>([]);
  const [accountId, setAccountId] = useState('');
  const [returnHistory, setReturnHistory] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  const [scanMessage, setScanMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  const customerName = (invoice: Invoice) => invoice.customerId
    ? customers.find((customer) => customer.id === invoice.customerId)?.name || 'Khách hàng'
    : 'Khách vãng lai';

  const invoiceOptions = useMemo(() => {
    const query = normalizeSearchText(searchTerm);
    return invoices
      .filter((invoice) => invoice.workflowStatus !== 'cancelled' && invoice.workflowStatus === 'closed')
      .filter((invoice) => !query || normalizeSearchText(`${invoice.documentNo || ''} ${invoice.id} ${customerName(invoice)}`).includes(query))
      .slice(0, 50);
  }, [customers, invoices, searchTerm]);

  const quickProductOptions = useMemo(() => {
    const query = normalizeSearchText(quickSearch);
    return products
      .filter((product) => !query || normalizeSearchText(`${product.name} ${product.sku} ${product.barcode || ''} ${product.category}`).includes(query) || productUnits(product).some((unit) => normalizeSearchText(unit.barcode).includes(query)))
      .slice(0, 30);
  }, [products, quickSearch]);

  const invoiceTotal = useMemo(() => returnLines.reduce((sum, line) => sum + line.quantity * line.price, 0), [returnLines]);
  const quickTotal = useMemo(() => quickLines.reduce((sum, line) => sum + line.quantity * line.price, 0), [quickLines]);

  const loadHistory = async () => {
    try {
      setReturnHistory(await invoicesApi.returns());
    } catch {
      setReturnHistory([]);
    }
  };

  useEffect(() => {
    void loadHistory();
    cashAccountsApi.list().then(setAccounts).catch(() => setAccounts([]));
  }, []);

  const selectInvoice = async (invoice: Invoice) => {
    setLoading(true);
    setMessage('');
    try {
      const [data, accountRows] = await Promise.all([invoicesApi.returnable(invoice.id), cashAccountsApi.list()]);
      setSelectedInvoice(invoice);
      setReturnLines((data.items || []).map((item: any) => ({
        key: item.id,
        invoiceItemId: item.id,
        productId: item.productId,
        productName: item.productName,
        quantity: 0,
        maxQuantity: Math.max(0, Number(item.returnableQuantity ?? (Number(item.soldQuantity ?? item.quantity) - Number(item.returnedQuantity || 0)))),
        price: Number(item.price || 0),
        unitName: item.unitName || 'Cái',
        unitFactor: Number(item.unitFactor || 1),
      })));
      setAccounts(accountRows);
      setAccountId(invoice.accountId || accountRows.find((account: any) => account.type === 'cash')?.id || accountRows[0]?.id || '');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể tải hàng hóa có thể trả.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!requestedInvoiceId || selectedInvoice?.id === requestedInvoiceId) return;
    const invoice = invoices.find((row) => row.id === requestedInvoiceId && row.workflowStatus === 'closed');
    if (invoice) void selectInvoice(invoice);
  }, [invoices, requestedInvoiceId]);

  const submitInvoiceReturn = async () => {
    if (!selectedInvoice) return;
    const items = returnLines.filter((line) => line.quantity > 0).map((line) => ({ invoiceItemId: line.invoiceItemId, quantity: line.quantity }));
    if (!items.length) {
      setMessage('Nhập số lượng trả cho ít nhất một sản phẩm.');
      return;
    }
    setLoading(true);
    try {
      const result = await invoicesApi.createReturn(selectedInvoice.id, { items, refundAccountId: accountId || null });
      setMessage(`Đã tạo phiếu trả ${formatCurrency(Number(result.refundAmount || 0))}.`);
      setSelectedInvoice(null);
      setReturnLines([]);
      await Promise.all([refreshInvoices(), refreshProducts(), loadHistory()]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể tạo phiếu trả khách.');
    } finally {
      setLoading(false);
    }
  };

  const findProductByCode = async (code: string) => {
    const localMatch = products.find((product) => productMatchesCode(product, code));
    if (localMatch) return { product: localMatch, unit: unitForCode(localMatch, code) };
    try {
      const remoteProduct = await productsApi.lookup(code) as Product;
      return { product: remoteProduct, unit: unitForCode(remoteProduct, code) };
    } catch {
      return null;
    }
  };

  const addQuickProduct = (product: Product, unit: SaleUnit = productUnits(product)[0]) => {
    const unitFactor = Math.max(1, Number(unit.factor) || 1);
    const unitPrice = Number(product.sellingPrice || 0) * unitFactor;
    const key = `${product.id}:${unit.name}`;
    setQuickLines((previous) => {
      const existing = previous.find((line) => line.key === key);
      if (existing) return previous.map((line) => line.key === key ? { ...line, quantity: line.quantity + 1 } : line);
      return [...previous, {
        key,
        invoiceItemId: null,
        productId: product.id,
        productName: product.name,
        quantity: 1,
        maxQuantity: null,
        price: unitPrice,
        unitName: unit.name,
        unitFactor,
      }];
    });
    setScanMessage(`Đã thêm ${product.name}${unit.name !== product.unit ? ` · ${unit.name}` : ''}.`);
  };

  const handleQuickBarcode = async (code: string) => {
    const normalizedCode = code.trim();
    if (!normalizedCode) return;
    setLoading(true);
    setScanMessage('Đang tìm hàng hóa...');
    try {
      const match = await findProductByCode(normalizedCode);
      if (!match) {
        setScanMessage(`Không tìm thấy hàng hóa với mã “${normalizedCode}”.`);
        return;
      }
      addQuickProduct(match.product, match.unit);
      setQuickSearch('');
    } finally {
      setLoading(false);
    }
  };

  const submitQuickReturn = async () => {
    const items = quickLines.filter((line) => line.quantity > 0).map((line) => ({
      productId: line.productId,
      quantity: line.quantity,
      unitName: line.unitName,
      unitFactor: line.unitFactor,
      price: line.price,
    }));
    if (!items.length) {
      setMessage('Quét hoặc chọn ít nhất một hàng hóa để trả.');
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      const result = await invoicesApi.createStandaloneReturn({
        items,
        customerId: quickCustomerId || null,
        refundAccountId: accountId || null,
        note: quickNote.trim(),
      });
      setMessage(`Đã tạo phiếu trả ${result.documentNo || ''} · hoàn ${formatCurrency(Number(result.refundAmount || 0))}.`);
      setQuickLines([]);
      setQuickCustomerId('');
      setQuickNote('');
      await Promise.all([refreshProducts(), loadHistory()]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể tạo phiếu trả không hóa đơn.');
    } finally {
      setLoading(false);
    }
  };

  const updateLine = (key: string, field: 'quantity' | 'price', value: string, standalone: boolean) => {
    const numericValue = Math.max(0, Number(value) || 0);
    const setter = standalone ? setQuickLines : setReturnLines;
    setter((previous) => previous.map((line) => line.key === key ? { ...line, [field]: field === 'quantity' && line.maxQuantity !== null ? Math.min(line.maxQuantity, numericValue) : numericValue } : line));
  };

  const accountField = (label = 'Tài khoản hoàn tiền') => accounts.length > 0 ? (
    <label className="block text-xs text-slate-600">{label}<select value={accountId} onChange={(event) => setAccountId(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs"><option value="">Tự động chọn tiền mặt</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
  ) : null;

  return (
    <div className="flex min-h-full flex-col bg-slate-50">
      <BarcodeScannerModal
        open={showScanner}
        title="Quét mã trả hàng"
        description="Quét mã vạch hoặc QR của hàng hóa. Mỗi lần quét sẽ thêm một đơn vị vào phiếu trả không cần hóa đơn."
        onClose={() => setShowScanner(false)}
        onDetected={(code) => { setShowScanner(false); void handleQuickBarcode(code); }}
      />

      <AppPageHeader
        icon={RotateCcw}
        accentClassName="bg-orange-500"
        title="Trả hàng"
        subtitle="Trả theo hóa đơn hoặc tạo phiếu trả nhanh bằng mã vạch"
      />

      <main className="flex-1 space-y-3 p-3 lg:p-4">
        <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-2 sm:flex-row">
          <button type="button" onClick={() => { setMode('invoice'); setMessage(''); }} className={`flex min-h-11 flex-1 items-center gap-2 rounded-lg px-3 text-left transition ${mode === 'invoice' ? 'bg-orange-50 text-orange-800 ring-1 ring-orange-200' : 'text-slate-600 hover:bg-slate-50'}`}>
            <Receipt className="h-4 w-4 shrink-0" /><span><span className="block text-xs font-semibold">Theo hóa đơn</span><span className="block text-[11px] text-slate-500">Đối chiếu số lượng đã bán</span></span>
          </button>
          <button type="button" onClick={() => { setMode('quick'); setMessage(''); }} className={`flex min-h-11 flex-1 items-center gap-2 rounded-lg px-3 text-left transition ${mode === 'quick' ? 'bg-sky-50 text-sky-800 ring-1 ring-sky-200' : 'text-slate-600 hover:bg-slate-50'}`}>
            <PackagePlus className="h-4 w-4 shrink-0" /><span><span className="block text-xs font-semibold">Không có hóa đơn</span><span className="block text-[11px] text-slate-500">Trả nhanh bằng mã vạch</span></span>
          </button>
        </div>

        {mode === 'invoice' ? (
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)]">
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-100 p-3"><h2 className="text-sm font-semibold text-slate-900">Chọn hóa đơn</h2><div className="relative mt-2"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Mã hóa đơn, tên khách hoặc số điện thoại" className="h-9 pl-8 text-xs" /></div></div>
              <div className="divide-y divide-slate-100">{invoiceOptions.map((invoice) => <button key={invoice.id} type="button" onClick={() => void selectInvoice(invoice)} className={`flex w-full items-center justify-between gap-3 px-3 py-3 text-left hover:bg-orange-50 ${selectedInvoice?.id === invoice.id ? 'bg-orange-50' : ''}`}><span className="min-w-0"><span className="block truncate text-sm font-semibold text-sky-700">{invoice.documentNo || invoice.id}</span><span className="mt-0.5 block truncate text-xs text-slate-500">{customerName(invoice)} · {new Date(invoice.createdAt).toLocaleString('vi-VN')}</span></span><span className="shrink-0 text-sm font-semibold tabular-nums text-slate-800">{formatCurrency(invoice.finalAmount)}</span></button>)}{!invoiceOptions.length && <p className="px-4 py-10 text-center text-xs text-slate-500">Không tìm thấy hóa đơn đã chốt.</p>}</div>
            </section>

            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              {!selectedInvoice ? <div className="flex min-h-64 flex-col items-center justify-center px-6 py-10 text-center"><Receipt className="h-8 w-8 text-slate-300" /><p className="mt-2 text-sm font-medium text-slate-700">Chưa chọn hóa đơn</p><p className="mt-1 text-xs text-slate-500">Hoặc chuyển sang “Không có hóa đơn” để trả nhanh bằng mã vạch.</p></div> : <><div className="flex items-start justify-between gap-3 border-b border-slate-100 p-3"><div><h2 className="text-sm font-semibold text-slate-900">Trả hàng {selectedInvoice.documentNo || selectedInvoice.id}</h2><p className="mt-0.5 text-xs text-slate-500">{customerName(selectedInvoice)}</p></div><button type="button" aria-label="Bỏ chọn hóa đơn" onClick={() => { setSelectedInvoice(null); setReturnLines([]); }} className="rounded-md p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button></div><div className="space-y-2 p-3">{returnLines.map((line) => <div key={line.key} className="grid grid-cols-[minmax(0,1fr)_82px_auto] items-center gap-2 rounded-lg border border-slate-100 p-2.5"><div className="min-w-0"><p className="truncate text-xs font-medium text-slate-800">{line.productName}</p><p className="mt-0.5 text-[11px] text-slate-500">Có thể trả: {line.maxQuantity} · {line.unitName}</p></div><Input type="number" min="0" max={line.maxQuantity ?? undefined} disabled={line.maxQuantity === 0} value={line.quantity || ''} onChange={(event) => updateLine(line.key, 'quantity', event.target.value, false)} className="h-8 text-xs" /><span className="text-right text-xs font-medium tabular-nums text-slate-700">{formatCurrency(line.quantity * line.price)}</span></div>)}{!returnLines.length && <p className="rounded-md bg-slate-50 px-3 py-3 text-xs text-slate-500">Hóa đơn này không còn sản phẩm có thể trả.</p>}{accountField()}<div className="flex items-center justify-between border-t border-slate-100 pt-2 text-xs"><span className="text-slate-500">Tổng hoàn</span><b className="text-sm tabular-nums text-orange-700">{formatCurrency(invoiceTotal)}</b></div><Button disabled={loading || !returnLines.some((line) => line.quantity > 0)} onClick={() => void submitInvoiceReturn()} className="h-9 w-full text-xs"><Check className="mr-1.5 h-3.5 w-3.5" />Xác nhận trả hàng</Button></div></>}
              {message && <p className="border-t border-slate-100 bg-sky-50 px-3 py-2 text-xs text-sky-700">{message}</p>}
            </section>
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(380px,0.9fr)]">
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-100 p-3"><div className="flex items-start justify-between gap-3"><div><h2 className="text-sm font-semibold text-slate-900">Thêm hàng hóa trả</h2><p className="mt-0.5 text-xs text-slate-500">Không cần nhập mã hóa đơn. Giá hoàn mặc định theo giá bán hiện tại và có thể chỉnh lại.</p></div><Button type="button" onClick={() => setShowScanner(true)} className="h-9 shrink-0 gap-1.5 px-3 text-xs"><Barcode className="h-4 w-4" /><span className="hidden sm:inline">Quét mã</span></Button></div><div className="relative mt-3"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={quickSearch} onChange={(event) => setQuickSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void handleQuickBarcode(quickSearch); } }} placeholder="Tìm tên, SKU hoặc nhập mã rồi Enter" className="h-10 pl-8 text-xs" /></div>{scanMessage && <p className="mt-2 rounded-md bg-sky-50 px-2.5 py-2 text-xs text-sky-700">{scanMessage}</p>}</div>
              <div className="divide-y divide-slate-100">{quickProductOptions.map((product) => <button key={product.id} type="button" onClick={() => { addQuickProduct(product); setQuickSearch(''); }} className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left hover:bg-sky-50"><span className="min-w-0"><span className="block truncate text-sm font-medium text-slate-800">{product.name}</span><span className="mt-0.5 block truncate text-[11px] text-slate-500">{product.sku} · {product.barcode || 'Chưa có mã vạch'} · Tồn {product.stock}</span></span><span className="shrink-0 text-sm font-semibold tabular-nums text-sky-700">{formatCurrency(product.sellingPrice)}</span></button>)}{!quickProductOptions.length && <p className="px-4 py-10 text-center text-xs text-slate-500">Không tìm thấy hàng hóa. Hãy kiểm tra mã hoặc tạo mã vạch trong Hàng hóa.</p>}</div>
            </section>

            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="border-b border-slate-100 p-3"><div className="flex items-start gap-2"><WalletCards className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" /><div><h2 className="text-sm font-semibold text-slate-900">Phiếu trả không hóa đơn</h2><p className="mt-0.5 text-xs text-slate-500">Hàng trả sẽ được cộng lại vào tồn kho và ghi khoản hoàn tiền vào sổ quỹ.</p></div></div></div><div className="space-y-2 p-3"><div className="max-h-[360px] space-y-2 overflow-y-auto">{quickLines.map((line) => <div key={line.key} className="rounded-lg border border-slate-100 p-2.5"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-xs font-medium text-slate-800">{line.productName}</p><p className="mt-0.5 text-[11px] text-slate-500">{line.unitName} · Giá hoàn/đơn vị</p></div><button type="button" aria-label={`Xóa ${line.productName}`} onClick={() => setQuickLines((previous) => previous.filter((row) => row.key !== line.key))} className="rounded p-1 text-rose-400 hover:bg-rose-50 hover:text-rose-600"><X className="h-4 w-4" /></button></div><div className="mt-2 grid grid-cols-[88px_minmax(0,1fr)_auto] items-center gap-2"><Input type="number" min="0" step="any" value={line.quantity || ''} onChange={(event) => updateLine(line.key, 'quantity', event.target.value, true)} className="h-8 text-xs" aria-label={`Số lượng ${line.productName}`} /><Input type="number" min="0" step="100" value={line.price || ''} onChange={(event) => updateLine(line.key, 'price', event.target.value, true)} className="h-8 text-xs" aria-label={`Giá hoàn ${line.productName}`} /><span className="text-right text-xs font-semibold tabular-nums text-orange-700">{formatCurrency(line.quantity * line.price)}</span></div></div>)}{!quickLines.length && <div className="rounded-lg border border-dashed border-slate-200 px-4 py-10 text-center"><PackagePlus className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-2 text-xs font-medium text-slate-600">Chưa có hàng hóa</p><p className="mt-1 text-[11px] text-slate-400">Quét mã hoặc chọn sản phẩm bên trái.</p></div>}</div><label className="block text-xs text-slate-600"><span className="flex items-center gap-1"><UserRound className="h-3.5 w-3.5" />Khách hàng (tùy chọn)</span><select value={quickCustomerId} onChange={(event) => setQuickCustomerId(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs"><option value="">Khách vãng lai</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}{customer.phone ? ` · ${customer.phone}` : ''}</option>)}</select></label>{accountField()}<label className="block text-xs text-slate-600">Ghi chú<textarea value={quickNote} onChange={(event) => setQuickNote(event.target.value)} className="mt-1 min-h-16 w-full resize-y rounded-md border border-slate-200 px-2.5 py-2 text-xs" placeholder="Lý do trả hoặc thông tin tham chiếu (không bắt buộc)" /></label><div className="flex items-center justify-between border-t border-slate-100 pt-2 text-xs"><span className="text-slate-500">Tổng hoàn</span><b className="text-sm tabular-nums text-orange-700">{formatCurrency(quickTotal)}</b></div><Button disabled={loading || !quickLines.some((line) => line.quantity > 0)} onClick={() => void submitQuickReturn()} className="h-9 w-full text-xs"><Check className="mr-1.5 h-3.5 w-3.5" />Tạo phiếu trả nhanh</Button></div>{message && <p className="border-t border-slate-100 bg-sky-50 px-3 py-2 text-xs text-sky-700">{message}</p>}</section>
          </div>
        )}

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5"><div><h2 className="text-sm font-semibold text-slate-900">Lịch sử trả hàng</h2><p className="mt-0.5 text-[11px] text-slate-500">Bao gồm phiếu trả theo hóa đơn và phiếu trả nhanh.</p></div><span className="text-xs text-slate-500">{returnHistory.length} phiếu</span></div><div className="divide-y divide-slate-100">{returnHistory.slice(0, 30).map((row) => <div key={row.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-xs"><span className="min-w-0"><b className="text-orange-700">{row.documentNo || row.id}</b><span className="ml-2 text-slate-500">{row.invoiceId ? `Hóa đơn ${row.invoiceId}` : 'Không có hóa đơn'} · {new Date(row.createdAt).toLocaleString('vi-VN')} · Người thực hiện: {row.createdByName || 'Chưa xác định'}</span></span><span className="shrink-0 font-semibold tabular-nums text-orange-700">-{formatCurrency(Number(row.totalAmount || 0))}</span></div>)}{!returnHistory.length && <p className="px-3 py-6 text-center text-xs text-slate-500">Chưa có phiếu trả hàng.</p>}</div></section>
      </main>
    </div>
  );
}
