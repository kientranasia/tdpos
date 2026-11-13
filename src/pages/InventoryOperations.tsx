import { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, HandCoins, History, Package, PackageX, QrCode, Search, X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import AppPageHeader from '../components/layout/AppPageHeader';
import { BarcodeScannerModal } from '../components/barcode/BarcodeScannerModal';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { productsApi, stockMovementsApi } from '../lib/api';
import { normalizeSearchText } from '../lib/utils';
import { createProductScanIndex, findProductInScanIndex, productScanFactor } from '../lib/productScanIndex';
import { Product } from '../types';

type OperationMode = 'dispose' | 'internal' | 'transfer';
type OperationLine = { product: Product; quantity: number };

const operationMeta: Record<OperationMode, { title: string; subtitle: string; note: string; icon: typeof Package; accent: string }> = {
  dispose: { title: 'Xuất hủy', subtitle: 'Ghi nhận hàng hỏng, mất hoặc hết hạn', note: 'Xuất hủy', icon: PackageX, accent: 'bg-rose-600' },
  internal: { title: 'Xuất dùng nội bộ', subtitle: 'Ghi nhận hàng lấy sử dụng trong cửa hàng', note: 'Xuất dùng nội bộ', icon: HandCoins, accent: 'bg-amber-600' },
  transfer: { title: 'Chuyển hàng', subtitle: 'Chuẩn bị luồng điều chuyển giữa các kho', note: 'Chuyển hàng', icon: ArrowLeftRight, accent: 'bg-sky-600' },
};

export default function InventoryOperations() {
  const { products, refreshProducts } = useApp();
  const [searchParams] = useSearchParams();
  const requestedMode = searchParams.get('mode');
  const mode: OperationMode = requestedMode === 'internal' || requestedMode === 'transfer' ? requestedMode : 'dispose';
  const meta = operationMeta[mode];
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState<number | string>('');
  const [lines, setLines] = useState<OperationLine[]>([]);
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const [scanMessage, setScanMessage] = useState('');
  const [history, setHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const scanCodeIndex = useMemo(() => createProductScanIndex(products), [products]);

  const options = useMemo(() => {
    const query = normalizeSearchText(searchTerm);
    return products.filter((product) => !query || normalizeSearchText(`${product.name} ${product.sku} ${product.barcode || ''}`).includes(query)).slice(0, 30);
  }, [products, searchTerm]);

  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const rows = await stockMovementsApi.list();
      setHistory(mode === 'transfer'
        ? []
        : rows.filter((row) => row.type === 'out' && String(row.note || '').startsWith(meta.note)).slice(0, 80));
    } catch {
      setHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    void loadHistory();
  }, [mode]);

  const findProductByCode = async (code: string) => {
    const localMatch = findProductInScanIndex(scanCodeIndex, code);
    if (localMatch) return { product: localMatch.product, factor: Math.max(1, Number(localMatch.unit.factor) || 1) };
    try {
      const remoteMatch = await productsApi.lookup(code);
      const product = products.find((item) => item.id === remoteMatch.id) || remoteMatch as Product;
      return { product, factor: productScanFactor(product, code) };
    } catch {
      return null;
    }
  };

  const addLine = (product: Product, requestedQuantity = 1) => {
    const nextQuantity = Math.max(1, Number(requestedQuantity) || 1);
    setLines((previous) => {
      const existing = previous.find((line) => line.product.id === product.id);
      if (existing) return previous.map((line) => line.product.id === product.id ? { ...line, quantity: line.quantity + nextQuantity } : line);
      return [...previous, { product, quantity: nextQuantity }];
    });
  };

  const handleScan = async (code: string) => {
    const match = await findProductByCode(code);
    if (!match) {
      setScanMessage(`Không tìm thấy hàng hóa với mã “${code}”.`);
      return;
    }
    const { product, factor } = match;
    addLine(product, factor);
    setSelectedProduct(null);
    setSearchTerm('');
    setQuantity('');
    setScanMessage(`Đã nhận diện “${product.name}”.${factor > 1 ? ` Hệ số quét: ${factor} ${product.unit}.` : ''}`);
    setMessage('');
  };

  const submit = async () => {
    if (mode === 'transfer') return;
    if (!lines.length) {
      setMessage('Thêm ít nhất một hàng hóa vào phiếu.');
      return;
    }
    const invalidLine = lines.find((line) => !Number.isFinite(line.quantity) || line.quantity <= 0 || line.quantity > line.product.stock);
    if (invalidLine) {
      setMessage(`Số lượng xuất của “${invalidLine.product.name}” không hợp lệ hoặc vượt tồn kho hiện tại.`);
      return;
    }
    setSaving(true); setMessage('');
    try {
      const operationNote = note.trim() ? `${meta.note} · ${note.trim()}` : meta.note;
      for (const line of lines) await productsApi.adjustStock(line.product.id, line.quantity, 'decrease', operationNote);
      await Promise.all([refreshProducts(), loadHistory()]);
      setMessage(`Đã ghi nhận ${meta.title.toLowerCase()} ${lines.length} mặt hàng.`);
      setLines([]); setSelectedProduct(null); setQuantity(''); setNote(''); setSearchTerm(''); setScanMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể ghi nhận nghiệp vụ kho.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50">
      <BarcodeScannerModal
        open={showScanner}
        title={`Quét mã ${meta.title.toLowerCase()}`}
        description="Quét QR hoặc mã vạch của hàng hóa để chọn nhanh sản phẩm."
        onClose={() => setShowScanner(false)}
        onDetected={(code) => { void handleScan(code); }}
      />

      <AppPageHeader icon={meta.icon} accentClassName={meta.accent} title={meta.title} subtitle={meta.subtitle} />
      <main className="min-h-0 flex-1 overflow-y-auto p-3 lg:p-4">
        <div className="mx-auto grid max-w-[1500px] gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)]">
          {mode === 'transfer' ? (
            <section className="rounded-xl border border-sky-200 bg-sky-50/60 p-4">
              <div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-600 text-white"><ArrowLeftRight className="h-4 w-4" /></span><div><h2 className="text-sm font-semibold text-sky-900">Chuyển hàng cần kho đích</h2><p className="mt-1 text-xs leading-5 text-sky-800">Hệ thống hiện mới có một kho vận hành. Để ghi nhận chuyển hàng chính xác, cần bổ sung danh sách kho đích, phiếu chuyển và trạng thái đang chuyển/đã nhận.</p><p className="mt-2 text-xs font-medium text-sky-900">Mục này đã được tách riêng trong menu và sẽ sẵn sàng ngay khi khai báo kho thứ hai.</p></div></div>
            </section>
          ) : (
            <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm md:p-4">
              <div className="flex items-center justify-between gap-3">
                <div><h2 className="text-sm font-semibold text-slate-900">Ghi nhận {meta.title.toLowerCase()}</h2><p className="mt-0.5 text-xs text-slate-500">Chọn nhanh bằng tên, SKU hoặc quét mã.</p></div>
                <Button type="button" variant="outline" onClick={() => setShowScanner(true)} className="h-9 shrink-0 gap-1.5 px-3 text-xs"><QrCode className="h-4 w-4" /> Quét mã</Button>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_160px]">
                <div className="min-w-0">
                  <label className="text-xs font-medium text-slate-600">Tìm sản phẩm</label>
                  <div className="relative mt-1">
                    <Input value={searchTerm} onChange={(event) => { setSearchTerm(event.target.value); setSelectedProduct(null); setScanMessage(''); }} onKeyDown={(event) => { if (event.key === 'Enter' && searchTerm.trim()) { event.preventDefault(); void handleScan(searchTerm.trim()); } }} placeholder="Tên, SKU hoặc mã vạch" className="h-9 pr-9 text-sm" />
                    <Search className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  </div>
                  {searchTerm && !selectedProduct && <div className="mt-1 max-h-48 overflow-y-auto rounded-md border border-slate-200 bg-white">{options.map((product) => <button key={product.id} type="button" onClick={() => { setSelectedProduct(product); setSearchTerm(product.name); setQuantity(1); setScanMessage(''); }} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs hover:bg-slate-50"><span className="min-w-0"><b className="block truncate text-slate-800">{product.name}</b><span className="text-slate-500">{product.sku} · tồn {product.stock} {product.unit}</span></span><span className="text-sky-700">Chọn</span></button>)}{!options.length && <p className="px-3 py-3 text-center text-xs text-slate-500">Không tìm thấy sản phẩm.</p>}</div>}
                </div>
                <label className="text-xs font-medium text-slate-600">Số lượng<Input type="number" min="0" max={selectedProduct?.stock} value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="0" className="mt-1 h-9 text-sm" /></label>
              </div>
              {selectedProduct && <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-xs"><span className="min-w-0 truncate font-medium text-slate-800">{selectedProduct.name} · tồn {selectedProduct.stock} {selectedProduct.unit}</span><div className="flex shrink-0 items-center gap-2"><Button type="button" variant="outline" className="h-8 px-2 text-xs" onClick={() => { addLine(selectedProduct, Number(quantity)); setSelectedProduct(null); setSearchTerm(''); setQuantity(''); }}>Thêm vào phiếu</Button><button type="button" aria-label="Bỏ chọn sản phẩm" onClick={() => { setSelectedProduct(null); setSearchTerm(''); setQuantity(''); }} className="rounded p-1 text-slate-400 hover:bg-white hover:text-slate-700"><X className="h-4 w-4" /></button></div></div>}
              {lines.length > 0 && <div className="mt-3 overflow-hidden rounded-lg border border-slate-200"><div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2"><p className="text-xs font-semibold text-slate-700">Hàng hóa trong phiếu</p><span className="text-[11px] text-slate-500">{lines.length} mặt hàng</span></div><div className="divide-y divide-slate-100">{lines.map((line) => <div key={line.product.id} className="grid grid-cols-[minmax(0,1fr)_84px_auto] items-center gap-2 px-3 py-2"><div className="min-w-0"><p className="truncate text-xs font-medium text-slate-800">{line.product.name}</p><p className="text-[11px] text-slate-500">{line.product.sku} · tồn {line.product.stock} {line.product.unit}</p></div><Input type="number" min="1" max={line.product.stock} value={line.quantity} onChange={(event) => setLines((previous) => previous.map((row) => row.product.id === line.product.id ? { ...row, quantity: Math.max(0, Number(event.target.value) || 0) } : row))} className="h-8 text-xs" /><button type="button" aria-label={`Xóa ${line.product.name}`} onClick={() => setLines((previous) => previous.filter((row) => row.product.id !== line.product.id))} className="rounded p-1 text-rose-600 hover:bg-rose-50 hover:text-rose-700"><X className="h-4 w-4" /></button></div>)}</div></div>}
              {scanMessage && <p className="mt-2 rounded-md bg-sky-50 px-3 py-2 text-xs text-sky-700">{scanMessage}</p>}
              <label className="mt-3 block text-xs font-medium text-slate-600">Lý do / ghi chú<textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder={mode === 'dispose' ? 'Ví dụ: Hàng vỡ, hết hạn...' : 'Ví dụ: Dùng làm mẫu, dùng nội bộ...'} className="mt-1 min-h-20 w-full rounded-md border border-slate-200 px-2.5 py-2 text-sm" /></label>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3"><p className="text-xs text-slate-500">Nghiệp vụ sẽ trừ tồn và ghi người thực hiện vào lịch sử.</p><Button disabled={saving || !lines.length} onClick={() => void submit()} className="h-9 text-xs">{saving ? 'Đang lưu...' : `Ghi nhận ${meta.title.toLowerCase()}`}</Button></div>
              {message && <p className="mt-3 rounded-md bg-sky-50 px-3 py-2 text-xs text-sky-700">{message}</p>}
            </section>
          )}

          {mode !== 'transfer' && <section className="min-w-0 rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-3"><div className="flex items-center gap-2"><History className="h-4 w-4 text-slate-500" /><div><h2 className="text-sm font-semibold text-slate-900">Lịch sử {meta.title.toLowerCase()}</h2><p className="text-[11px] text-slate-500">Các lần trừ tồn gần đây</p></div></div><span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600">{history.length} record</span></div>
            {loadingHistory ? <p className="p-4 text-xs text-slate-500">Đang tải lịch sử...</p> : history.length === 0 ? <div className="p-5 text-center text-xs text-slate-500">Chưa có record {meta.title.toLowerCase()}.</div> : <div className="divide-y divide-slate-100">{history.map((row) => <div key={row.id} className="flex items-start justify-between gap-3 px-3 py-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-1.5"><span className="rounded-md bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700">{meta.title}</span><span className="text-[11px] font-mono text-slate-500">{row.productSku || '—'}</span></div><p className="mt-1 truncate text-xs font-medium text-slate-900">{row.productName || 'Sản phẩm'}</p><p className="mt-0.5 text-[11px] text-slate-500">{row.note?.replace(`${meta.note} · `, '') || 'Không ghi chú'} · {new Date(row.createdAt).toLocaleString('vi-VN')} · {row.actorName || 'N/A'}</p></div><div className="shrink-0 text-right"><p className="text-xs font-medium tabular-nums text-slate-700">{row.beforeStock} → {row.afterStock}</p><p className="text-[11px] font-semibold tabular-nums text-rose-700">-{row.quantity} {row.productUnit || ''}</p></div></div>)}</div>}
          </section>}
        </div>
      </main>
    </div>
  );
}
