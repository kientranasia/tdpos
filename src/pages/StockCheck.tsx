import { useEffect, useMemo, useState } from 'react';
import { ClipboardCheck, History, Package, QrCode, RefreshCw, Search, Save, ScanLine, UserRound } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { BarcodeScannerModal } from '../components/barcode/BarcodeScannerModal';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Product } from '../types';
import { productsApi, stockMovementsApi } from '../lib/api';
import { normalizeSearchText } from '../lib/utils';

type ActualDraft = number | string;

const signedQuantity = (value: number) => {
  if (value === 0) return '0';
  return `${value > 0 ? '+' : ''}${value}`;
};

const productMatchesCode = (product: Product, code: string) => {
  const normalizedCode = normalizeSearchText(code);
  return normalizeSearchText(product.sku) === normalizedCode
    || normalizeSearchText(product.barcode) === normalizedCode
    || product.units?.some((unit) => normalizeSearchText(unit.barcode) === normalizedCode);
};

const productScanFactor = (product: Product, code: string) => {
  const normalizedCode = normalizeSearchText(code);
  const matchedUnit = product.units?.find((unit) => normalizeSearchText(unit.barcode) === normalizedCode);
  return Math.max(1, Number(matchedUnit?.factor) || 1);
};

export default function StockCheck() {
  const { products, refreshProducts } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [actuals, setActuals] = useState<Record<string, ActualDraft>>({});
  const [history, setHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [scanMessage, setScanMessage] = useState('');
  const [lastScannedProductId, setLastScannedProductId] = useState<string | null>(null);
  const [showScanner, setShowScanner] = useState(false);

  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const rows = await stockMovementsApi.list();
      setHistory(rows.filter((row) => row.type === 'adjust').slice(0, 100));
    } catch {
      setHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    void loadHistory();
  }, []);

  useEffect(() => {
    setActuals((previous) => {
      const next = { ...previous };
      products.forEach((product) => {
        if (next[product.id] === undefined) next[product.id] = product.stock;
      });
      return next;
    });
  }, [products]);

  const filteredProducts = useMemo(() => {
    const query = normalizeSearchText(searchTerm);
    if (!query) return products;
    return products.filter((product) => [product.name, product.sku, product.barcode, product.category]
      .some((value) => normalizeSearchText(value).includes(query)));
  }, [products, searchTerm]);

  const changedProducts = useMemo(() => products.filter((product) => {
    const draft = actuals[product.id];
    if (draft === '' || draft === undefined) return false;
    return Number(draft) !== Number(product.stock);
  }), [actuals, products]);

  const summary = useMemo(() => changedProducts.reduce((result, product) => {
    const difference = Number(actuals[product.id]) - Number(product.stock);
    if (difference > 0) result.increase += difference;
    if (difference < 0) result.decrease += Math.abs(difference);
    return result;
  }, { increase: 0, decrease: 0 }), [actuals, changedProducts]);

  const updateActual = (productId: string, value: string) => {
    setActuals((previous) => ({ ...previous, [productId]: value }));
    setError('');
  };

  const findProductByCode = async (code: string) => {
    const localMatch = products.find((product) => productMatchesCode(product, code));
    if (localMatch) return { product: localMatch, factor: productScanFactor(localMatch, code) };
    try {
      const remoteMatch = await productsApi.lookup(code);
      const product = products.find((item) => item.id === remoteMatch.id) || remoteMatch as Product;
      return { product, factor: productScanFactor(product, code) };
    } catch {
      return null;
    }
  };

  const handleScan = async (code: string) => {
    const match = await findProductByCode(code);
    if (!match) {
      setScanMessage(`Không tìm thấy hàng hóa với mã “${code}”.`);
      setError('Mã QR/mã vạch chưa được gắn với hàng hóa nào.');
      return;
    }

    const { product, factor } = match;
    const currentActual = actuals[product.id] === '' || actuals[product.id] === undefined
      ? Number(product.stock)
      : Number(actuals[product.id]);
    setActuals((previous) => ({ ...previous, [product.id]: currentActual + factor }));
    setSearchTerm(product.sku || product.name);
    setLastScannedProductId(product.id);
    setScanMessage(`Đã đếm thêm ${factor} ${product.unit} cho “${product.name}”. Quét lại để đếm tiếp.`);
    setError('');
  };

  const saveAdjustments = async () => {
    if (!changedProducts.length) {
      setError('Chưa có số lượng nào thay đổi để lưu.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      for (const product of changedProducts) {
        const actual = Number(actuals[product.id]);
        if (!Number.isFinite(actual) || actual < 0) continue;
        await stockMovementsApi.stockCheck(product.id, actual, 'Kiểm kê hàng hóa');
      }
      await Promise.all([refreshProducts(), loadHistory()]);
      setActuals({});
      setLastScannedProductId(null);
      setScanMessage('Đã lưu điều chỉnh tồn kho và cập nhật lịch sử.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể lưu điều chỉnh tồn kho.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50">
      <BarcodeScannerModal
        open={showScanner}
        title="Quét QR kiểm kê"
        description="Quét QR hoặc mã vạch của hàng hóa. Mỗi lần quét sẽ cộng số lượng theo mã cơ sở hoặc biến thể."
        onClose={() => setShowScanner(false)}
        onDetected={(code) => { void handleScan(code); }}
      />

      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-3 py-2.5 sm:px-4 lg:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-white shadow-sm">
            <ClipboardCheck className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold leading-tight text-slate-900 sm:text-base">Kiểm kê</h1>
            <p className="truncate text-[11px] text-slate-500">Đếm thực tế, điều chỉnh tồn và theo dõi lịch sử</p>
          </div>
        </div>
        <Button type="button" onClick={() => setShowScanner(true)} className="h-9 shrink-0 gap-1.5 px-3 text-xs">
          <QrCode className="h-4 w-4" />
          <span className="hidden sm:inline">Quét QR</span>
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-2.5 sm:p-3 lg:p-4">
        <div className="mx-auto max-w-[1500px] space-y-3">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-[10px] text-slate-500">Hàng hóa lệch</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{changedProducts.length}</p>
            </div>
            <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-3">
              <p className="text-[10px] text-emerald-700">Tăng tồn</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-emerald-800">+{summary.increase}</p>
            </div>
            <div className="rounded-lg border border-rose-100 bg-rose-50/60 p-3">
              <p className="text-[10px] text-rose-700">Giảm tồn</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-rose-800">-{summary.decrease}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-[10px] text-slate-500">Lịch sử điều chỉnh</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{history.length}</p>
            </div>
          </div>

          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="flex flex-col gap-2 border-b border-slate-100 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Số lượng thực tế</h2>
                <p className="mt-0.5 text-[11px] text-slate-500">Nhập số đếm thực tế hoặc dùng QR để cộng nhanh theo từng mã hàng.</p>
              </div>
              <div className="flex w-full gap-2 sm:w-auto">
                <div className="relative min-w-0 flex-1 sm:w-64">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Tìm tên, SKU, mã vạch..."
                    className="h-9 pl-8 text-xs"
                  />
                </div>
                <Button type="button" variant="outline" onClick={() => setShowScanner(true)} className="h-9 shrink-0 gap-1.5 px-2.5 text-xs">
                  <ScanLine className="h-4 w-4" />
                  <span className="hidden sm:inline">Quét mã</span>
                </Button>
              </div>
            </div>

            {scanMessage && <div className="border-b border-sky-100 bg-sky-50 px-3 py-2 text-xs text-sky-800 sm:px-4">{scanMessage}</div>}
            {error && <div className="border-b border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-700 sm:px-4">{error}</div>}

            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[760px] text-left text-xs">
                <thead className="bg-slate-50 text-[11px] font-semibold text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5">Hàng hóa</th>
                    <th className="px-3 py-2.5 text-right">Tồn hệ thống</th>
                    <th className="w-44 px-3 py-2.5">Số lượng thực tế</th>
                    <th className="px-3 py-2.5 text-right">Điều chỉnh</th>
                    <th className="px-4 py-2.5 text-right">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredProducts.map((product) => {
                    const actual = actuals[product.id] ?? product.stock;
                    const difference = actual === '' ? 0 : Number(actual) - Number(product.stock);
                    const isLastScanned = product.id === lastScannedProductId;
                    return (
                      <tr key={product.id} className={isLastScanned ? 'bg-sky-50/70' : 'hover:bg-slate-50/70'}>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <Package className="h-4 w-4 shrink-0 text-slate-400" />
                            <div className="min-w-0">
                              <p className="truncate font-medium text-slate-900">{product.name}</p>
                              <p className="truncate text-[11px] text-slate-500">{product.sku}{product.barcode ? ` · ${product.barcode}` : ''}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{product.stock} {product.unit}</td>
                        <td className="px-3 py-2.5">
                          <Input
                            type="number"
                            min="0"
                            inputMode="decimal"
                            value={actual}
                            onChange={(event) => updateActual(product.id, event.target.value)}
                            className="h-8 text-right text-xs tabular-nums"
                            aria-label={`Số lượng thực tế ${product.name}`}
                          />
                        </td>
                        <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${difference > 0 ? 'text-emerald-700' : difference < 0 ? 'text-rose-700' : 'text-slate-400'}`}>
                          {signedQuantity(difference)} {product.unit}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <span className={`rounded-full px-2 py-1 text-[10px] font-medium ${difference === 0 ? 'bg-slate-100 text-slate-500' : 'bg-amber-50 text-amber-700'}`}>
                            {difference === 0 ? 'Khớp' : 'Chờ lưu'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-slate-100 lg:hidden">
              {filteredProducts.map((product) => {
                const actual = actuals[product.id] ?? product.stock;
                const difference = actual === '' ? 0 : Number(actual) - Number(product.stock);
                const isLastScanned = product.id === lastScannedProductId;
                return (
                  <div key={product.id} className={`space-y-2.5 p-3 ${isLastScanned ? 'bg-sky-50/70' : ''}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">{product.name}</p>
                        <p className="truncate text-[11px] text-slate-500">{product.sku}{product.barcode ? ` · ${product.barcode}` : ''}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-medium ${difference === 0 ? 'bg-slate-100 text-slate-500' : 'bg-amber-50 text-amber-700'}`}>
                        {difference === 0 ? 'Khớp' : 'Chờ lưu'}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 items-end gap-2 text-xs">
                      <div>
                        <p className="mb-1 text-[10px] text-slate-500">Tồn hệ thống</p>
                        <p className="font-semibold tabular-nums text-slate-700">{product.stock} {product.unit}</p>
                      </div>
                      <label>
                        <span className="mb-1 block text-[10px] text-slate-500">Thực tế</span>
                        <Input
                          type="number"
                          min="0"
                          inputMode="decimal"
                          value={actual}
                          onChange={(event) => updateActual(product.id, event.target.value)}
                          className="h-8 text-right text-xs tabular-nums"
                          aria-label={`Số lượng thực tế ${product.name}`}
                        />
                      </label>
                      <div className="text-right">
                        <p className="mb-1 text-[10px] text-slate-500">Điều chỉnh</p>
                        <p className={`font-semibold tabular-nums ${difference > 0 ? 'text-emerald-700' : difference < 0 ? 'text-rose-700' : 'text-slate-400'}`}>{signedQuantity(difference)} {product.unit}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {!filteredProducts.length && <div className="p-8 text-center text-sm text-slate-500">Không tìm thấy hàng hóa phù hợp.</div>}
            <div className="flex flex-col gap-2 border-t border-slate-100 bg-slate-50/70 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
              <p className="text-xs text-slate-500">Đã chọn <span className="font-semibold text-slate-700">{changedProducts.length}</span> hàng hóa có chênh lệch.</p>
              <Button type="button" onClick={() => void saveAdjustments()} disabled={saving || !changedProducts.length} className="h-9 gap-1.5 text-xs">
                {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? 'Đang lưu...' : 'Lưu điều chỉnh'}
              </Button>
            </div>
          </section>

          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-3 sm:px-4">
              <History className="h-4 w-4 text-slate-500" />
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Lịch sử điều chỉnh</h2>
                <p className="mt-0.5 text-[11px] text-slate-500">Ngày, số lượng thực tế, mức lệch và người thực hiện.</p>
              </div>
            </div>
            {loadingHistory ? (
              <div className="p-8 text-center text-sm text-slate-500">Đang tải lịch sử...</div>
            ) : history.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">Chưa có lịch sử điều chỉnh tồn kho.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-xs">
                  <thead className="bg-slate-50 text-[11px] font-semibold text-slate-500">
                    <tr>
                      <th className="px-4 py-2.5">Ngày giờ</th>
                      <th className="px-3 py-2.5">Hàng hóa</th>
                      <th className="px-3 py-2.5 text-right">Tồn trước</th>
                      <th className="px-3 py-2.5 text-right">Số lượng thực tế</th>
                      <th className="px-3 py-2.5 text-right">Lệch</th>
                      <th className="px-4 py-2.5">Người chỉnh</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {history.map((row) => {
                      const difference = Number(row.afterStock) - Number(row.beforeStock);
                      return (
                        <tr key={row.id} className="hover:bg-slate-50/70">
                          <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">{new Date(row.createdAt).toLocaleString('vi-VN')}</td>
                          <td className="px-3 py-2.5">
                            <p className="font-medium text-slate-800">{row.productName || 'Sản phẩm đã xóa'}</p>
                            <p className="text-[11px] text-slate-500">{row.productSku || ''}</p>
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{row.beforeStock} {row.productUnit || ''}</td>
                          <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-slate-900">{row.afterStock} {row.productUnit || ''}</td>
                          <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${difference > 0 ? 'text-emerald-700' : difference < 0 ? 'text-rose-700' : 'text-slate-500'}`}>{signedQuantity(difference)} {row.productUnit || ''}</td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-slate-600"><span className="inline-flex items-center gap-1.5"><UserRound className="h-3.5 w-3.5 text-slate-400" />{row.actorName || 'N/A'}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
