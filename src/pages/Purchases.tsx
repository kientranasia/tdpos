import { useEffect, useMemo, useRef, useState } from 'react';
import { Barcode, Check, ClipboardList, Plus, RotateCcw, Save, Search, Trash2, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import AppPageHeader from '../components/layout/AppPageHeader';
import { cashAccountsApi, productsApi, purchasesApi, suppliersApi } from '../lib/api';
import { formatCurrency } from '../lib/utils';
import { Product } from '../types';

type Line = { productId: string; quantity: number; price: number; unitName: string; unitFactor: number };
type ReturnLine = { purchaseItemId: string; productName: string; unit: string; quantity: number; maxQuantity: number; price: number };

export default function Purchases() {
  const { products, refreshProducts } = useApp();
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [supplierId, setSupplierId] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [paidAmount, setPaidAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer' | 'payable'>('payable');
  const [accountId, setAccountId] = useState('');
  const [barcode, setBarcode] = useState('');
  const [message, setMessage] = useState('');
  const [showCreateProduct, setShowCreateProduct] = useState(false);
  const [showReturn, setShowReturn] = useState(false);
  const [returnPurchase, setReturnPurchase] = useState<any | null>(null);
  const [returnLines, setReturnLines] = useState<ReturnLine[]>([]);
  const [returnNote, setReturnNote] = useState('');
  const [creatingProduct, setCreatingProduct] = useState(false);
  const [newProduct, setNewProduct] = useState({ name: '', sku: '', barcode: '', category: 'Tạp hóa', unit: 'Cái', purchasePrice: 0, sellingPrice: 0 });
  const barcodeRef = useRef<HTMLInputElement>(null);

  const reload = async () => {
    const [supplierRows, purchaseRows, accountRows] = await Promise.all([suppliersApi.list(), purchasesApi.list(), cashAccountsApi.list()]);
    setSuppliers(supplierRows); setPurchases(purchaseRows); setAccounts(accountRows);
    if (!supplierId && supplierRows[0]) setSupplierId(supplierRows[0].id);
  };
  useEffect(() => { reload().catch((err) => setMessage(err.message)); }, []);

  const total = useMemo(() => lines.reduce((sum, line) => sum + line.quantity * line.price, 0), [lines]);
  const selectedSupplier = suppliers.find((supplier) => supplier.id === supplierId);

  const addProductLine = (product: Product) => {
    if (product.productType === 'combo') return setMessage('Combo chỉ dùng để bán, không nhập trực tiếp.');
    const unit = product.units?.[0] || { name: product.unit, factor: 1 };
    setLines((prev) => {
      const existing = prev.find((line) => line.productId === product.id);
      if (existing) return prev.map((line) => line.productId === product.id ? { ...line, quantity: line.quantity + 1 } : line);
      return [...prev, { productId: product.id, quantity: 1, price: product.purchasePrice, unitName: unit.name, unitFactor: Number(unit.factor) || 1 }];
    });
  };
  const addLine = () => {
    const product = products.find((item) => item.productType !== 'combo' && !lines.some((line) => line.productId === item.id));
    if (product) addProductLine(product);
  };

  const lookupBarcode = async () => {
    const code = barcode.trim();
    if (!code) return;
    try {
      const product = await productsApi.lookup(code) as Product;
      addProductLine(product); setBarcode(''); setMessage(`Đã thêm ${product.name} từ mã ${code}.`);
    } catch {
      setNewProduct((prev) => ({ ...prev, barcode: code, sku: prev.sku || code }));
      setShowCreateProduct(true); setMessage(`Chưa có sản phẩm với mã ${code}. Bạn có thể tạo nhanh.`);
    }
  };

  const submit = async () => {
    if (!supplierId || !lines.length) return setMessage('Chọn nhà cung cấp và ít nhất một sản phẩm.');
    if (paymentMethod !== 'payable' && paidAmount > 0 && !accountId) return setMessage('Chọn tài khoản tiền cho khoản thanh toán.');
    try {
      await purchasesApi.create({ supplierId, paidAmount: paymentMethod === 'payable' ? 0 : paidAmount, paymentMethod, accountId: paymentMethod === 'payable' ? null : accountId, items: lines });
      setMessage('Đã xác nhận phiếu nhập. Kho, công nợ và sổ quỹ đã cập nhật.');
      setLines([]); setPaidAmount(0); await reload(); await refreshProducts();
    } catch (err) { setMessage(err instanceof Error ? err.message : 'Không thể tạo phiếu nhập.'); }
  };

  const openReturn = async (purchase: any) => {
    try {
      const data = await purchasesApi.returnable(purchase.id);
      setReturnPurchase(data.purchase);
      setReturnLines(data.items.map((item: any) => ({ purchaseItemId: item.id, productName: item.productName, unit: item.unit, quantity: 0, maxQuantity: Math.max(0, Number(item.quantity) - Number(item.returnedQuantity || 0)), price: Number(item.price) })));
      setShowReturn(true); setReturnNote(''); setMessage('');
    } catch (err) { setMessage(err instanceof Error ? err.message : 'Không thể tải phiếu nhập để trả.'); }
  };
  const submitReturn = async () => {
    const items = returnLines.filter((line) => line.quantity > 0).map((line) => ({ purchaseItemId: line.purchaseItemId, quantity: line.quantity }));
    if (!returnPurchase || !items.length) return setMessage('Nhập số lượng trả cho ít nhất một dòng.');
    try {
      await purchasesApi.createReturn(returnPurchase.id, { items, note: returnNote });
      setShowReturn(false); setMessage('Đã tạo phiếu trả nhà cung cấp và cập nhật số dư được nhận.'); await reload(); await refreshProducts();
    } catch (err) { setMessage(err instanceof Error ? err.message : 'Không thể tạo phiếu trả.'); }
  };

  const createProduct = async () => {
    if (!newProduct.name.trim() || !newProduct.sku.trim()) return setMessage('Nhập tên và SKU sản phẩm.');
    setCreatingProduct(true);
    try {
      const product = await productsApi.create({ ...newProduct, productType: 'standard', stock: 0, taxRate: 0, lowStockThreshold: 10, trackStock: true, status: 'active' }) as Product;
      await refreshProducts(); addProductLine(product); setShowCreateProduct(false); setMessage(`Đã tạo và thêm ${product.name} vào phiếu nhập.`);
    } catch (err) { setMessage(err instanceof Error ? err.message : 'Không thể tạo sản phẩm.'); }
    finally { setCreatingProduct(false); }
  };

  return <div className="min-h-full space-y-4 bg-slate-50">
    <AppPageHeader icon={ClipboardList} accentClassName="bg-indigo-600" title="Nhập hàng" subtitle="Quét mã, quy đổi đơn vị và quản lý trả hàng nhà cung cấp" actions={<div className="flex gap-2"><Button variant="outline" className="h-9 text-sm" onClick={() => barcodeRef.current?.focus()}><Barcode className="mr-2 h-4 w-4" />Quét mã</Button><Button className="h-9 text-sm" onClick={addLine}><Plus className="mr-2 h-4 w-4" />Thêm sản phẩm</Button></div>} />
    <div className="space-y-5 p-4 pt-0 md:p-6 md:pt-0">
      <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <label className="text-sm text-slate-600 md:col-span-2">Nhà cung cấp<select className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}><option value="">Chọn nhà cung cấp</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}</select></label>
          <label className="text-sm text-slate-600">Hình thức thanh toán<select className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as any)}><option value="payable">Công nợ</option><option value="cash">Tiền mặt</option><option value="transfer">Chuyển khoản</option></select></label>
          <label className="text-sm text-slate-600">Đã trả<input type="number" min="0" className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3" value={paidAmount || ''} disabled={paymentMethod === 'payable'} onChange={(e) => setPaidAmount(Number(e.target.value) || 0)} /></label>
        </div>
        {paymentMethod !== 'payable' && <div className="grid gap-3 md:grid-cols-2"><label className="text-sm text-slate-600">Tài khoản chi<select className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3" value={accountId} onChange={(e) => setAccountId(e.target.value)}><option value="">Chọn tài khoản</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label><div className="flex items-end rounded-md bg-slate-50 px-3 py-2 text-sm">Số dư NCC: <b className="ml-1">{formatCurrency(Math.max(0, Number(selectedSupplier?.currentPayable || 0)))}</b></div></div>}
        <div className="flex gap-2"><Input ref={barcodeRef} value={barcode} onChange={(e) => setBarcode(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); lookupBarcode(); } }} placeholder="Quét mã vạch bằng máy quét hoặc nhập SKU/mã vạch rồi Enter" className="h-10 max-w-xl" /><Button variant="outline" onClick={lookupBarcode}><Search className="mr-2 h-4 w-4" />Tra cứu</Button></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr className="border-b text-left text-slate-500"><th className="p-2">Sản phẩm</th><th className="p-2">Đơn vị nhập</th><th className="p-2">SL</th><th className="p-2">Đơn giá nhập</th><th className="p-2 text-right">Thành tiền</th><th /></tr></thead><tbody>{lines.map((line, index) => { const product = products.find((item) => item.id === line.productId); return <tr key={`${line.productId}-${index}`} className="border-b"><td className="p-2"><select className="h-9 w-full rounded border border-slate-200 px-2" value={line.productId} onChange={(e) => { const next = products.find((p) => p.id === e.target.value); if (next) setLines((prev) => prev.map((row, i) => i === index ? { ...row, productId: next.id, price: next.purchasePrice, unitName: next.unit, unitFactor: 1 } : row)); }}>{products.filter((p) => p.productType !== 'combo').map((p) => <option key={p.id} value={p.id}>{p.sku} · {p.name}</option>)}</select></td><td className="p-2"><select className="h-9 rounded border border-slate-200 px-2" value={line.unitName} onChange={(e) => { const unit = product?.units?.find((u) => u.name === e.target.value); setLines((prev) => prev.map((row, i) => i === index ? { ...row, unitName: e.target.value, unitFactor: Number(unit?.factor || 1) } : row)); }}>{(product?.units || [{ name: product?.unit || '', factor: 1 }]).map((unit: any) => <option key={unit.name} value={unit.name}>{unit.name} · ×{unit.factor}</option>)}</select></td><td className="p-2"><input className="h-9 w-20 rounded border border-slate-200 px-2" type="number" min="0.01" value={line.quantity} onChange={(e) => setLines((prev) => prev.map((row, i) => i === index ? { ...row, quantity: Number(e.target.value) || 0 } : row))} /></td><td className="p-2"><input className="h-9 w-32 rounded border border-slate-200 px-2" type="number" min="0" value={line.price} onChange={(e) => setLines((prev) => prev.map((row, i) => i === index ? { ...row, price: Number(e.target.value) || 0 } : row))} /></td><td className="p-2 text-right">{formatCurrency(line.quantity * line.price)}</td><td className="p-2"><button className="text-rose-500" onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4" /></button></td></tr>; })}</tbody></table></div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4"><div><b>Tổng tiền hàng: {formatCurrency(total)}</b><p className="text-xs text-slate-500">Tồn kho sẽ tăng theo hệ số quy đổi về đơn vị cơ sở.</p></div><Button onClick={submit}><Save className="mr-2 h-4 w-4" />Xác nhận nhập hàng</Button></div>
        {message && <p className="rounded-md bg-sky-50 px-3 py-2 text-sm text-sky-700">{message}</p>}
      </section>
      <section className="rounded-lg border border-slate-200 bg-white p-4"><h2 className="mb-3 font-semibold">Lịch sử nhập hàng</h2><div className="divide-y">{purchases.slice(0, 20).map((purchase) => <div key={purchase.id} className="flex items-center justify-between gap-3 py-3 text-sm"><div><p className="font-medium">{purchase.supplier?.name || 'Nhà cung cấp'} <span className="text-slate-400">· {new Date(purchase.createdAt).toLocaleString('vi-VN')}</span></p><p className="text-xs text-slate-500">{purchase.documentNo || purchase.id.slice(0, 8)} · {purchase.payableAmount > 0 ? 'Còn nợ' : 'Đã thanh toán'}</p></div><div className="flex items-center gap-3"><b>{formatCurrency(purchase.finalAmount)}</b><Button variant="outline" className="h-8 px-2 text-xs" onClick={() => openReturn(purchase)}><RotateCcw className="mr-1 h-3 w-3" />Trả hàng</Button></div></div>)}{!purchases.length && <p className="py-4 text-sm text-slate-500">Chưa có phiếu nhập.</p>}</div></section>
    </div>
    {showCreateProduct && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"><div className="w-full max-w-lg space-y-4 rounded-lg bg-white p-5 shadow-2xl"><div className="flex items-center justify-between"><div><h2 className="font-semibold">Tạo sản phẩm mới</h2><p className="text-xs text-slate-500">Mã vạch đã được điền từ lần quét</p></div><button onClick={() => setShowCreateProduct(false)}><X className="h-5 w-5 text-slate-400" /></button></div><div className="grid gap-3 md:grid-cols-2">{Object.entries(newProduct).map(([key, value]) => <label key={key} className="text-sm text-slate-600">{({ name: 'Tên sản phẩm', sku: 'SKU', barcode: 'Mã vạch', category: 'Danh mục', unit: 'Đơn vị', purchasePrice: 'Giá nhập', sellingPrice: 'Giá bán' } as any)[key]}<Input type={key.includes('Price') ? 'number' : 'text'} value={value} onChange={(e) => setNewProduct({ ...newProduct, [key]: key.includes('Price') ? Number(e.target.value) || 0 : e.target.value })} className="mt-1 h-10" /></label>)}</div><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setShowCreateProduct(false)}>Hủy</Button><Button disabled={creatingProduct} onClick={createProduct}><Check className="mr-2 h-4 w-4" />{creatingProduct ? 'Đang tạo...' : 'Tạo và thêm vào phiếu'}</Button></div></div></div>}
    {showReturn && returnPurchase && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"><div className="w-full max-w-2xl space-y-4 rounded-lg bg-white p-5 shadow-2xl"><div className="flex items-center justify-between"><div><h2 className="font-semibold">Trả hàng nhà cung cấp</h2><p className="text-xs text-slate-500">Phiếu {returnPurchase.documentNo || returnPurchase.id.slice(0, 8)} · Không được trả vượt số đã nhập</p></div><button onClick={() => setShowReturn(false)}><X className="h-5 w-5 text-slate-400" /></button></div><div className="space-y-2">{returnLines.map((line, index) => <div key={line.purchaseItemId} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-md border border-slate-100 p-3"><div><p className="font-medium">{line.productName}</p><p className="text-xs text-slate-500">{line.unit} · tối đa {line.maxQuantity}</p></div><Input type="number" min="0" max={line.maxQuantity} value={line.quantity || ''} disabled={line.maxQuantity <= 0} onChange={(e) => setReturnLines(returnLines.map((row, i) => i === index ? { ...row, quantity: Math.min(row.maxQuantity, Number(e.target.value) || 0) } : row))} className="h-9 w-24" /><span className="text-sm text-slate-600">{formatCurrency(line.quantity * line.price)}</span></div>)}</div><Input value={returnNote} onChange={(e) => setReturnNote(e.target.value)} placeholder="Ghi chú trả hàng (tuỳ chọn)" /><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setShowReturn(false)}>Hủy</Button><Button onClick={submitReturn}><RotateCcw className="mr-2 h-4 w-4" />Xác nhận trả hàng</Button></div></div></div>}
  </div>;
}
