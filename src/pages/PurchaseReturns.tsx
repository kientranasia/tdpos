import { useEffect, useMemo, useState } from 'react';
import { Check, ClipboardList, RotateCcw, Search, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import AppPageHeader from '../components/layout/AppPageHeader';
import { purchasesApi, suppliersApi } from '../lib/api';
import { formatCurrency, normalizeSearchText } from '../lib/utils';

type ReturnLine = { purchaseItemId: string; productName: string; unit: string; quantity: number; maxQuantity: number; price: number };

export default function PurchaseReturns() {
  const { refreshProducts, dataRevision } = useApp();
  const [purchases, setPurchases] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPurchase, setSelectedPurchase] = useState<any | null>(null);
  const [returnLines, setReturnLines] = useState<ReturnLine[]>([]);
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const supplierName = (purchase: any) => purchase.supplier?.name || suppliers.find((supplier) => supplier.id === purchase.supplierId)?.name || 'Nhà cung cấp';
  const filteredPurchases = useMemo(() => {
    const query = normalizeSearchText(searchTerm);
    return purchases.filter((purchase) => !query || normalizeSearchText(`${purchase.documentNo || ''} ${purchase.id} ${supplierName(purchase)}`).includes(query));
  }, [purchases, searchTerm, suppliers]);

  const reload = async () => {
    try {
      const [purchaseRows, supplierRows, historyRows] = await Promise.all([purchasesApi.list(), suppliersApi.list(), purchasesApi.returns()]);
      setPurchases(purchaseRows); setSuppliers(supplierRows); setHistory(historyRows);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể tải dữ liệu trả hàng nhập.');
    }
  };

  useEffect(() => { void reload(); }, [dataRevision]);

  const selectPurchase = async (purchase: any) => {
    setLoading(true); setMessage('');
    try {
      const data = await purchasesApi.returnable(purchase.id);
      setSelectedPurchase(purchase);
      setReturnLines((data.items || []).map((item: any) => ({
        purchaseItemId: item.id,
        productName: item.productName,
        unit: item.unit,
        quantity: 0,
        maxQuantity: Math.max(0, Number(item.quantity || 0) - Number(item.returnedQuantity || 0)),
        price: Number(item.price || 0),
      })));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể tải hàng có thể trả.');
    } finally {
      setLoading(false);
    }
  };

  const submitReturn = async () => {
    if (!selectedPurchase) return;
    const items = returnLines.filter((line) => line.quantity > 0).map((line) => ({ purchaseItemId: line.purchaseItemId, quantity: line.quantity }));
    if (!items.length) return setMessage('Nhập số lượng trả cho ít nhất một sản phẩm.');
    setLoading(true);
    try {
      await purchasesApi.createReturn(selectedPurchase.id, { items, note });
      setMessage('Đã tạo phiếu trả nhà cung cấp và cập nhật tồn kho.');
      setSelectedPurchase(null); setReturnLines([]); setNote('');
      await Promise.all([reload(), refreshProducts()]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể tạo phiếu trả nhà cung cấp.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-full flex-col bg-slate-50">
      <AppPageHeader icon={RotateCcw} accentClassName="bg-sky-600" title="Trả hàng nhập" subtitle="Trả hàng đã nhập cho nhà cung cấp, không trộn với phiếu nhập mới" />
      <main className="grid flex-1 gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)] lg:p-4">
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 p-3"><h2 className="text-sm font-semibold text-slate-900">Chọn phiếu nhập</h2><div className="relative mt-2"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Số phiếu hoặc nhà cung cấp" className="h-9 pl-8 text-xs" /></div></div>
          <div className="divide-y divide-slate-100">{filteredPurchases.map((purchase) => <button key={purchase.id} type="button" onClick={() => void selectPurchase(purchase)} className={`flex w-full items-center justify-between gap-3 px-3 py-3 text-left hover:bg-sky-50 ${selectedPurchase?.id === purchase.id ? 'bg-sky-50' : ''}`}><span className="min-w-0"><span className="block truncate text-sm font-semibold text-sky-700">{purchase.documentNo || purchase.id}</span><span className="mt-0.5 block truncate text-xs text-slate-500">{supplierName(purchase)} · {new Date(purchase.createdAt).toLocaleString('vi-VN')}</span></span><span className="shrink-0 text-sm font-semibold tabular-nums text-slate-800">{formatCurrency(Number(purchase.finalAmount || 0))}</span></button>)}{!filteredPurchases.length && <p className="px-4 py-10 text-center text-xs text-slate-500">Không tìm thấy phiếu nhập.</p>}</div>
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {!selectedPurchase ? <div className="flex min-h-64 flex-col items-center justify-center px-6 py-10 text-center"><ClipboardList className="h-8 w-8 text-slate-300" /><p className="mt-2 text-sm font-medium text-slate-700">Chưa chọn phiếu nhập</p><p className="mt-1 text-xs text-slate-500">Chọn phiếu để kiểm tra số lượng còn có thể trả.</p></div> : <><div className="flex items-start justify-between gap-3 border-b border-slate-100 p-3"><div><h2 className="text-sm font-semibold text-slate-900">Trả phiếu {selectedPurchase.documentNo || selectedPurchase.id}</h2><p className="mt-0.5 text-xs text-slate-500">{supplierName(selectedPurchase)}</p></div><button type="button" aria-label="Bỏ chọn phiếu nhập" onClick={() => { setSelectedPurchase(null); setReturnLines([]); }} className="rounded-md p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button></div><div className="space-y-2 p-3">{returnLines.map((line, index) => <div key={line.purchaseItemId} className="grid grid-cols-[minmax(0,1fr)_82px_auto] items-center gap-2 rounded-lg border border-slate-100 p-2.5"><div className="min-w-0"><p className="truncate text-xs font-medium text-slate-800">{line.productName}</p><p className="mt-0.5 text-[11px] text-slate-500">{line.unit} · có thể trả {line.maxQuantity}</p></div><Input type="number" min="0" max={line.maxQuantity} disabled={line.maxQuantity <= 0} value={line.quantity || ''} onChange={(event) => setReturnLines((previous) => previous.map((row, rowIndex) => rowIndex === index ? { ...row, quantity: Math.min(row.maxQuantity, Number(event.target.value) || 0) } : row))} className="h-8 text-xs" /><span className="text-right text-xs font-medium tabular-nums text-slate-700">{formatCurrency(line.quantity * line.price)}</span></div>)}{!returnLines.length && <p className="rounded-md bg-slate-50 px-3 py-3 text-xs text-slate-500">Phiếu này không còn hàng có thể trả.</p>}<Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ghi chú trả hàng (tuỳ chọn)" className="h-9 text-xs" /><Button disabled={loading || !returnLines.some((line) => line.quantity > 0)} onClick={() => void submitReturn()} className="h-9 w-full text-xs"><Check className="mr-1.5 h-3.5 w-3.5" />Xác nhận trả nhà cung cấp</Button></div></>}
          {message && <p className="border-t border-slate-100 bg-sky-50 px-3 py-2 text-xs text-sky-700">{message}</p>}
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white lg:col-span-2"><div className="border-b border-slate-100 px-3 py-2.5"><h2 className="text-sm font-semibold text-slate-900">Lịch sử trả hàng nhập</h2></div><div className="divide-y divide-slate-100">{history.slice(0, 20).map((row) => <div key={row.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-xs"><span className="min-w-0"><b className="text-sky-700">{row.documentNo || row.id}</b><span className="ml-2 text-slate-500">Phiếu nhập {row.purchaseId}</span></span><span className="shrink-0 font-semibold tabular-nums text-sky-700">-{formatCurrency(Number(row.totalAmount || 0))}</span></div>)}{!history.length && <p className="px-3 py-6 text-center text-xs text-slate-500">Chưa có phiếu trả nhà cung cấp.</p>}</div></section>
      </main>
    </div>
  );
}
