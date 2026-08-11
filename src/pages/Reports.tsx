import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Download, RefreshCw } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { cashbookApi, purchasesApi } from '../lib/api';
import { Button } from '../components/ui/Button';
import { formatCurrency } from '../lib/utils';
import * as XLSX from 'xlsx';

export default function Reports() {
  const { invoices, products } = useApp();
  const [purchases, setPurchases] = useState<any[]>([]);
  const [cashbook, setCashbook] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  const load = async () => {
    try { const [purchaseRows, cashRows] = await Promise.all([purchasesApi.list(), cashbookApi.list()]); setPurchases(purchaseRows); setCashbook(cashRows); }
    catch (err) { setMessage(err instanceof Error ? err.message : 'Không thể tải báo cáo.'); }
  };
  useEffect(() => { load(); }, []);
  const metrics = useMemo(() => ({
    revenue: invoices.reduce((sum, row) => sum + row.finalAmount, 0),
    collected: invoices.reduce((sum, row) => sum + row.paidAmount, 0),
    receivable: invoices.reduce((sum, row) => sum + row.debtAmount, 0),
    stockValue: products.reduce((sum, row) => sum + row.stock * row.purchasePrice, 0),
    purchaseValue: purchases.reduce((sum, row) => sum + row.finalAmount, 0),
    cashIn: cashbook.filter((row) => row.type === 'income').reduce((sum, row) => sum + row.amount, 0),
    cashOut: cashbook.filter((row) => row.type === 'expense').reduce((sum, row) => sum + row.amount, 0),
  }), [cashbook, invoices, products, purchases]);
  const exportInvoices = () => {
    const lines = [['Ngày', 'Số chứng từ', 'Tổng tiền', 'Đã thu', 'Còn nợ'], ...invoices.map((row) => [new Date(row.createdAt).toLocaleDateString('vi-VN'), row.id, row.finalAmount, row.paidAmount, row.debtAmount])];
    const csv = '\ufeff' + lines.map((line) => line.join(',')).join('\n');
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); link.download = 'hkdplus-bao-cao-ban-ra.csv'; link.click(); URL.revokeObjectURL(link.href);
  };
  const exportExcel = () => {
    const sales = invoices.map((row) => ({ Ngày: row.createdAt, 'Số chứng từ': row.documentNo || row.id, 'Tổng tiền': row.finalAmount, 'Đã thu': row.paidAmount, 'Còn nợ': row.debtAmount }));
    const purchasesSheet = purchases.map((row) => ({ Ngày: row.createdAt, 'Số phiếu': row.documentNo || row.id, 'Tổng thanh toán': row.finalAmount, 'Đã trả': row.paidAmount, 'Còn nợ': row.payableAmount }));
    const cashSheet = cashbook.map((row) => ({ Ngày: row.createdAt, Loại: row.type === 'income' ? 'Thu' : 'Chi', Nhóm: row.category, 'Nội dung': row.note, 'Số tiền': row.amount }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(sales), 'Bán ra');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(purchasesSheet), 'Mua vào');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(cashSheet), 'Thu chi');
    XLSX.writeFile(workbook, 'hkdplus-bao-cao.xlsx');
  };
  return <div className="flex h-full flex-col bg-slate-50 overflow-hidden"><header className="shrink-0 border-b border-slate-200 bg-white px-3 py-2 flex items-center gap-2"><div className="h-7 w-7 rounded bg-sky-600 text-white flex items-center justify-center"><BarChart3 className="h-4 w-4"/></div><div className="mr-auto"><h1 className="text-sm font-semibold text-slate-900">Báo cáo</h1><p className="text-[11px] text-slate-500">Tổng hợp vận hành và dữ liệu sẵn sàng xuất cho kế toán</p></div><Button size="sm" variant="outline" onClick={load}><RefreshCw className="mr-1 h-3.5 w-3.5"/>Tải lại</Button><Button size="sm" variant="outline" onClick={() => window.print()}>In / PDF</Button><Button size="sm" variant="outline" onClick={exportExcel}>Xuất Excel</Button><Button size="sm" onClick={exportInvoices}><Download className="mr-1 h-3.5 w-3.5"/>Xuất CSV</Button></header><main className="flex-1 overflow-auto p-2 space-y-2"><div className="grid grid-cols-2 gap-2 md:grid-cols-7">{[['Doanh thu',metrics.revenue],['Đã thu',metrics.collected],['Phải thu',metrics.receivable],['Giá trị tồn',metrics.stockValue],['Mua vào',metrics.purchaseValue],['Tổng thu',metrics.cashIn],['Tổng chi',metrics.cashOut]].map(([label,value]) => <div key={String(label)} className="rounded border border-slate-200 bg-white px-2 py-2"><p className="text-[11px] text-slate-500">{label}</p><p className="mt-1 text-sm font-semibold tabular-nums text-slate-900">{formatCurrency(Number(value))}</p></div>)}</div><section className="overflow-hidden rounded border border-slate-200 bg-white"><div className="border-b border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-semibold text-slate-700">Chứng từ bán ra</div><div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b border-slate-100 text-left text-[11px] text-slate-500"><th className="px-2 py-1.5">Ngày</th><th className="px-2 py-1.5">Số CT</th><th className="px-2 py-1.5">Phương thức</th><th className="px-2 py-1.5 text-right">Tổng tiền</th><th className="px-2 py-1.5 text-right">Đã thu</th><th className="px-2 py-1.5 text-right">Còn nợ</th></tr></thead><tbody>{invoices.slice(0, 50).map((row) => <tr key={row.id} className="border-b border-slate-100 hover:bg-sky-50"><td className="px-2 py-1.5">{new Date(row.createdAt).toLocaleDateString('vi-VN')}</td><td className="px-2 py-1.5 font-mono">{row.documentNo || row.id}</td><td className="px-2 py-1.5">{row.paymentMethod === 'cash' ? 'Tiền mặt' : row.paymentMethod === 'transfer' ? 'Chuyển khoản' : 'Công nợ'}</td><td className="px-2 py-1.5 text-right tabular-nums">{formatCurrency(row.finalAmount)}</td><td className="px-2 py-1.5 text-right tabular-nums text-emerald-700">{formatCurrency(row.paidAmount)}</td><td className="px-2 py-1.5 text-right tabular-nums text-amber-700">{formatCurrency(row.debtAmount)}</td></tr>)}{!invoices.length && <tr><td colSpan={6} className="px-2 py-6 text-center text-slate-500">Chưa có dữ liệu bán hàng.</td></tr>}</tbody></table></div></section>{message && <p className="text-xs text-rose-600">{message}</p>}</main></div>;
}
