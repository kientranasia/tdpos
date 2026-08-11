import { useEffect, useMemo, useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { productsApi, purchasesApi, suppliersApi } from '../lib/api';
import { formatCurrency } from '../lib/utils';
import { Button } from '../components/ui/Button';

type Line = { productId: string; quantity: number; price: number };

export default function Purchases() {
  const { products } = useApp();
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [supplierId, setSupplierId] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [paidAmount, setPaidAmount] = useState(0);
  const [message, setMessage] = useState('');

  const reload = async () => {
    const [supplierRows, purchaseRows] = await Promise.all([suppliersApi.list(), purchasesApi.list()]);
    setSuppliers(supplierRows);
    setPurchases(purchaseRows);
    if (!supplierId && supplierRows[0]) setSupplierId(supplierRows[0].id);
  };
  useEffect(() => { reload().catch((err) => setMessage(err.message)); }, []);

  const total = useMemo(() => lines.reduce((sum, line) => sum + line.quantity * line.price, 0), [lines]);
  const addLine = () => {
    const product = products.find((item) => !lines.some((line) => line.productId === item.id));
    if (product) setLines((prev) => [...prev, { productId: product.id, quantity: 1, price: product.purchasePrice }]);
  };
  const submit = async () => {
    if (!supplierId || !lines.length) return setMessage('Chọn nhà cung cấp và ít nhất một sản phẩm.');
    try {
      await purchasesApi.create({ supplierId, paidAmount, paymentMethod: paidAmount >= total ? 'cash' : 'payable', items: lines });
      setMessage('Đã xác nhận phiếu nhập. Kho và công nợ đã cập nhật.');
      setLines([]); setPaidAmount(0); await reload();
    } catch (err) { setMessage(err instanceof Error ? err.message : 'Không thể tạo phiếu nhập.'); }
  };

  return <div className="min-h-full bg-slate-50 p-4 md:p-6 space-y-5">
    <div className="flex items-center justify-between"><div><h1 className="text-page-title">Nhập hàng</h1><p className="text-page-subtitle mt-1">Một phiếu nhập cập nhật kho và công nợ nhà cung cấp</p></div><Button onClick={addLine}><Plus className="mr-2 h-4 w-4"/>Thêm sản phẩm</Button></div>
    <section className="rounded-lg border border-slate-200 bg-white p-4 space-y-4">
      <div className="grid gap-3 md:grid-cols-3"><label className="text-sm text-slate-600">Nhà cung cấp<select className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}><option value="">Chọn nhà cung cấp</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}</select></label><label className="text-sm text-slate-600">Đã trả<input type="number" className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3" value={paidAmount || ''} onChange={(e) => setPaidAmount(Number(e.target.value) || 0)}/></label><div className="flex items-end"><div className="rounded-md bg-slate-50 px-3 py-2 text-sm">Còn nợ: <b>{formatCurrency(Math.max(0, total - paidAmount))}</b></div></div></div>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-slate-500"><th className="p-2">Sản phẩm</th><th className="p-2">SL</th><th className="p-2">Đơn giá nhập</th><th className="p-2 text-right">Thành tiền</th><th/></tr></thead><tbody>{lines.map((line, index) => { const product = products.find((item) => item.id === line.productId); return <tr key={`${line.productId}-${index}`} className="border-b"><td className="p-2"><select className="h-9 w-full rounded border border-slate-200 px-2" value={line.productId} onChange={(e) => setLines((prev) => prev.map((row, i) => i === index ? {...row, productId: e.target.value, price: products.find((p) => p.id === e.target.value)?.purchasePrice || 0} : row))}>{products.map((p) => <option key={p.id} value={p.id}>{p.sku} · {p.name} · Tồn {p.stock}</option>)}</select></td><td className="p-2"><input className="h-9 w-20 rounded border border-slate-200 px-2" type="number" min="0.01" value={line.quantity} onChange={(e) => setLines((prev) => prev.map((row, i) => i === index ? {...row, quantity: Number(e.target.value) || 0} : row))}/></td><td className="p-2"><input className="h-9 w-32 rounded border border-slate-200 px-2" type="number" min="0" value={line.price} onChange={(e) => setLines((prev) => prev.map((row, i) => i === index ? {...row, price: Number(e.target.value) || 0} : row))}/></td><td className="p-2 text-right">{formatCurrency((product ? line.quantity * line.price : 0))}</td><td className="p-2"><button className="text-rose-500" onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4"/></button></td></tr>})}</tbody></table></div>
      <div className="flex items-center justify-between border-t pt-4"><b>Tổng tiền hàng: {formatCurrency(total)}</b><Button onClick={submit}><Save className="mr-2 h-4 w-4"/>Xác nhận nhập hàng</Button></div>{message && <p className="text-sm text-sky-700">{message}</p>}
    </section>
    <section className="rounded-lg border border-slate-200 bg-white p-4"><h2 className="mb-3 font-semibold">Lịch sử nhập hàng</h2><div className="divide-y">{purchases.slice(0, 10).map((purchase) => <div key={purchase.id} className="flex items-center justify-between py-3 text-sm"><div><p className="font-medium">{purchase.supplier?.name || 'Nhà cung cấp'} <span className="text-slate-400">· {new Date(purchase.createdAt).toLocaleString('vi-VN')}</span></p><p className="text-xs text-slate-500">{purchase.id.slice(0, 8)} · {purchase.payableAmount > 0 ? 'Còn nợ' : 'Đã thanh toán'}</p></div><b>{formatCurrency(purchase.finalAmount)}</b></div>)}{!purchases.length && <p className="py-4 text-sm text-slate-500">Chưa có phiếu nhập.</p>}</div></section>
  </div>;
}
